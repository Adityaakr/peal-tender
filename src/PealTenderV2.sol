// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PqAuth} from "pqkit/PqAuth.sol";
import {PqAuthSet} from "pqkit/PqAuthSet.sol";
import {TenderBook} from "./TenderBook.sol";
import {ISealedAuction, ISealedAuctionFactory} from "./interfaces/ISealedAuction.sol";

/// @title PealTenderV2
/// @notice A treasury buyback vault run by a t-of-n set of post-quantum (ML-DSA-87)
///         signers, with a timelock on the dangerous changes.
///
/// The treasury keeps its payment token (fUSD on the QoreChain testnet) here and
/// buys back its own token (PEAL-T) two ways:
///   - an open **tender** in this contract: holders offer tokens at a minimum
///     price, and the tender clears at one price (`TenderClearing`, from Peal).
///     Its code lives in the linked library `TenderBook`, which runs on this
///     contract's storage and balances (only to stay under the size limit);
///   - a **sealed sale** on Peal Sealed Auction: the vault is the auction's issuer
///     and sells fUSD for PEAL-T, so the forward auction clears the buyback.
///
/// ## Who can do what
///
/// | Action | Needs |
/// | --- | --- |
/// | `deposit`, `openTender`, `cancelTender`, `sweep` (within the daily cap) | quorum |
/// | `startSealedSale`, `cancelSealedSale` | quorum |
/// | `queue` a timelocked change (signer set, delay, daily cap, auction factory, a sweep above the cap) | quorum |
/// | `execute` a queued change once its delay has passed | anyone |
/// | `veto` a queued change | any ONE signer |
/// | `settle` a tender after its end, `claim`, `collectSealedSale` | anyone |
/// | `offer` | a holder, with their own tokens |
///
/// "Quorum" means ML-DSA-87 signatures by at least `threshold` distinct members of
/// the signer set over (chain id, this contract, member, action, set nonce,
/// deadline, argument hash), each checked by the `pqcKeyStatus` and `pqcVerify`
/// precompiles through `qore-pq-kit`'s `PqAuthSet`. `msg.sender` authorises
/// nothing: holding a member's classical secp256k1 key, or being the deployer,
/// gives no power here, and anyone may relay a signed action.
///
/// ## Bounding a key compromise
///
/// Even a quorum of stolen post-quantum keys is bounded and visible:
///   - Payment-token outflows that the quorum can start at once (sweeps, tender
///     budgets, sealed-sale supplies) draw on one per-token daily allowance,
///     `dailyCap`. Anything above it must be queued and wait `delay`.
///   - Changing the signer set, the delay, a cap or the auction factory is always
///     queued.
///   - During the delay any single member can veto with one signature.
///   - Executing a signer-set change voids every other queued change.
///
/// ## Accounting
///
/// `reservedPay` is payment owed to an open tender's budget or to unclaimed
/// sellers of a settled one; `escrowedBuy` is sellers' tokens held for unclaimed
/// offers. Only the balance above those is free to sweep, budget or sell. A sealed
/// sale's supply leaves the vault when it starts; whatever comes back (PEAL-T
/// proceeds, unsold fUSD) is free again. Funds that arrive by a plain transfer
/// (or a native-lane `MsgConvertCoin` straight to this address) are free.
contract PealTenderV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PqAuthSet for PqAuthSet.Set;
    using TenderBook for TenderBook.Book;

    // ------------------------------------------------------------------ constants

    bytes32 public constant ACTION_DEPOSIT = keccak256("PealTenderV2.deposit");
    bytes32 public constant ACTION_OPEN_TENDER = keccak256("PealTenderV2.openTender");
    bytes32 public constant ACTION_CANCEL_TENDER = keccak256("PealTenderV2.cancelTender");
    bytes32 public constant ACTION_SWEEP = keccak256("PealTenderV2.sweep");
    bytes32 public constant ACTION_QUEUE = keccak256("PealTenderV2.queue");
    bytes32 public constant ACTION_VETO = keccak256("PealTenderV2.veto");
    bytes32 public constant ACTION_START_SALE = keccak256("PealTenderV2.startSealedSale");
    bytes32 public constant ACTION_CANCEL_SALE = keccak256("PealTenderV2.cancelSealedSale");

    /// @notice How far ahead a signature's deadline may be.
    uint256 public constant MAX_AUTH_TTL = 1 days;
    uint64 public constant MIN_DELAY = 5 minutes;
    uint64 public constant MAX_DELAY = 30 days;
    /// @notice A queued change can be executed for this long after its delay, then it lapses.
    uint64 public constant EXECUTION_WINDOW = 7 days;

    // ------------------------------------------------------------------ types

    /// @notice Signatures for one quorum action. `signers` strictly ascending.
    struct Auth {
        uint256 deadline;
        address[] signers;
        bytes[] signatures;
    }

    /// @notice What a queued change does. `data` encodings:
    ///   SetSigners        abi.encode(address[] members, uint256 threshold)
    ///   SetDelay          abi.encode(uint64 delay)
    ///   SetDailyCap       abi.encode(address token, uint256 cap)     token 0 = native QOR
    ///   SetAuctionFactory abi.encode(address factory)                0 = sealed sales off
    ///   Sweep             abi.encode(address token, address to, uint256 amount)
    enum OpKind {
        SetSigners,
        SetDelay,
        SetDailyCap,
        SetAuctionFactory,
        Sweep
    }

    enum OpState {
        None,
        Queued,
        Executed,
        Vetoed
    }

    struct Op {
        OpKind kind;
        OpState state;
        uint64 eta; // executable from this time
        uint64 epoch; // signer-set epoch it was queued in
        bytes data;
    }

    struct Allowance {
        uint64 day; // block.timestamp / 1 days of the last spend
        uint192 spent; // spent on that day
    }

    enum SaleState {
        None,
        Active,
        Collected,
        Cancelled
    }

    struct Sale {
        SaleState state;
        uint64 startedAt;
        uint256 supply; // payment token sent to the auction
        uint256 proceeds; // bought token received back by collectSealedSale
        uint256 returned; // payment token received back by collectSealedSale
    }

    // ------------------------------------------------------------------ storage

    IERC20 public immutable payToken;
    IERC20 public immutable buyToken;
    uint8 public immutable buyDecimals;

    PqAuthSet.Set internal _set;
    /// @notice Bumped by every executed signer-set change; older queued changes are void.
    uint64 public setEpoch;
    uint64 public delay;
    address public auctionFactory;

    mapping(address token => uint256) public dailyCap;
    mapping(address token => Allowance) internal _allowance;

    uint256 public opCount;
    mapping(uint256 opId => Op) internal _ops;

    TenderBook.Book internal _book;

    address[] internal _saleList;
    mapping(address auction => Sale) internal _sales;

    // ------------------------------------------------------------------ events and errors

    event Deposited(address indexed from, uint256 amount);
    event NativeReceived(address indexed from, uint256 amount);
    event Swept(address indexed token, address indexed to, uint256 amount, bool timelocked);
    event Spent(address indexed token, uint256 amount, uint256 spentToday, uint256 cap);

    event OpQueued(uint256 indexed opId, OpKind kind, bytes data, uint64 eta, uint64 epoch);
    event OpExecuted(uint256 indexed opId, OpKind kind);
    event OpVetoed(uint256 indexed opId, address indexed by);
    event DelayChanged(uint64 delay);
    event DailyCapChanged(address indexed token, uint256 cap);
    event AuctionFactoryChanged(address indexed factory);
    event SignerSetChanged(uint64 epoch, address[] members, uint256 threshold);

    event SealedSaleStarted(address indexed auction, address indexed factory, uint256 supply, bytes32 committeeSetId);
    event SealedSaleCancelled(address indexed auction, uint256 returned);
    event SealedSaleCollected(
        address indexed auction, ISealedAuction.State auctionState, uint256 proceeds, uint256 returned
    );

    error ZeroAddress();
    error SameToken();
    error BadDecimals(uint8 decimals);
    error BadParams(string what);
    error BadDelay(uint64 delay);
    error OverDailyCap(address token, uint256 amount, uint256 remaining);
    error InsufficientFree(address token, uint256 wanted, uint256 free);
    error NativeSendFailed();
    error FeeOnTransfer(uint256 expected, uint256 received);
    error BadQuantity(uint256 quantity);

    error NoSuchOp(uint256 opId);
    error OpNotQueued(uint256 opId, OpState state);
    error OpNotReady(uint256 opId, uint64 eta);
    error OpLapsed(uint256 opId, uint256 lapsedAt);
    error OpVoid(uint256 opId, uint64 queuedEpoch, uint64 currentEpoch);

    error SalesDisabled();
    error BadSaleConfig(string what);
    error NotAnAuction(address auction);
    error SaleNotActive(address auction, SaleState state);
    error SaleNotFinished(address auction, ISealedAuction.State state);
    error SaleFundingMismatch(uint256 expected, uint256 sent);

    // ------------------------------------------------------------------ construction

    /// @param members_   the signer set, strictly ascending; each needs a usable ML-DSA-87 key
    /// @param threshold_ how many members must sign a quorum action
    /// @param delay_     the timelock delay, MIN_DELAY to MAX_DELAY
    /// @param factory_   the Peal Sealed Auction factory sealed sales may use (0 = none yet)
    /// @param payDailyCap_ the first daily allowance of the payment token
    constructor(
        IERC20 payToken_,
        IERC20 buyToken_,
        address[] memory members_,
        uint256 threshold_,
        uint64 delay_,
        address factory_,
        uint256 payDailyCap_
    ) {
        if (address(payToken_) == address(0) || address(buyToken_) == address(0)) revert ZeroAddress();
        if (address(payToken_) == address(buyToken_)) revert SameToken();
        uint8 d = IERC20Metadata(address(buyToken_)).decimals();
        if (d > 30) revert BadDecimals(d);
        if (delay_ < MIN_DELAY || delay_ > MAX_DELAY) revert BadDelay(delay_);
        payToken = payToken_;
        buyToken = buyToken_;
        buyDecimals = d;
        _set.init(members_, threshold_);
        delay = delay_;
        auctionFactory = factory_;
        dailyCap[address(payToken_)] = payDailyCap_;
        emit SignerSetChanged(0, members_, threshold_);
        emit DelayChanged(delay_);
        emit AuctionFactoryChanged(factory_);
        emit DailyCapChanged(address(payToken_), payDailyCap_);
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    // ------------------------------------------------------------------ quorum actions

    /// @notice Pull `amount` of the payment token from `from` (which approved this
    ///         vault). Gated, so nobody can spend another address's approval.
    function deposit(address from, uint256 amount, Auth calldata auth) external nonReentrant {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert BadQuantity(0);
        _quorum(ACTION_DEPOSIT, keccak256(abi.encode(from, amount)), auth);
        _pullExact(payToken, from, amount);
        emit Deposited(from, amount);
    }

    /// @notice Move free funds out now, within the token's daily allowance.
    ///         `token == address(0)` is native QOR. Larger sweeps go through `queue`.
    function sweep(address token, address to, uint256 amount, Auth calldata auth) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert BadQuantity(0);
        _requireFree(token, amount);
        _quorum(ACTION_SWEEP, keccak256(abi.encode(token, to, amount)), auth);
        _spend(token, amount);
        _send(token, to, amount);
        emit Swept(token, to, amount, false);
    }

    /// @notice Open a tender, reserving its budget from the free payment balance.
    ///         The budget draws on the payment token's daily allowance.
    function openTender(TenderBook.OpenParams calldata p, Auth calldata auth)
        external
        nonReentrant
        returns (uint256 tenderId)
    {
        _book.checkOpen(p);
        _requireFree(address(payToken), p.budget);
        _quorum(ACTION_OPEN_TENDER, keccak256(abi.encode(p)), auth);
        _spend(address(payToken), p.budget);
        tenderId = _book.open(p);
    }

    /// @notice Cancel the open tender before its end. Sellers reclaim their tokens.
    function cancelTender(Auth calldata auth) external nonReentrant {
        uint256 id = _book.checkCancel();
        _quorum(ACTION_CANCEL_TENDER, keccak256(abi.encode(id)), auth);
        _book.cancel();
    }

    /// @notice Sell `cfg.totalSupply` of the payment token for the bought-back token
    ///         in a sealed auction created by `auctionFactory`, with this vault as
    ///         the issuer. The supply draws on the payment token's daily allowance.
    /// @dev The vault approves exactly the supply to the factory and clears the
    ///      approval again in the same call. Proceeds and unsold supply can only be
    ///      paid to the issuer, which is this vault, and the fee must be zero.
    function startSealedSale(
        ISealedAuction.Config calldata cfg,
        string calldata name,
        string calldata details,
        Auth calldata auth
    ) external nonReentrant returns (address auction) {
        address factory = auctionFactory;
        if (factory == address(0)) revert SalesDisabled();
        if (cfg.issuer != address(this)) revert BadSaleConfig("issuer");
        if (cfg.saleToken != address(payToken)) revert BadSaleConfig("saleToken");
        if (cfg.quoteToken != address(buyToken)) revert BadSaleConfig("quoteToken");
        if (cfg.protocolFeeBps != 0) revert BadSaleConfig("fee");
        if (cfg.totalSupply == 0) revert BadSaleConfig("supply");
        _requireFree(address(payToken), cfg.totalSupply);

        _quorum(
            ACTION_START_SALE,
            keccak256(abi.encode(factory, cfg, keccak256(bytes(name)), keccak256(bytes(details)))),
            auth
        );
        _spend(address(payToken), cfg.totalSupply);

        uint256 before = payToken.balanceOf(address(this));
        payToken.forceApprove(factory, cfg.totalSupply);
        auction = ISealedAuctionFactory(factory).createAuction(cfg, name, details);
        payToken.forceApprove(factory, 0);
        uint256 sent = before - payToken.balanceOf(address(this));
        if (sent != cfg.totalSupply) revert SaleFundingMismatch(cfg.totalSupply, sent);
        if (!ISealedAuctionFactory(factory).isAuction(auction)) revert NotAnAuction(auction);
        if (_sales[auction].state != SaleState.None) revert SaleNotActive(auction, _sales[auction].state);

        _sales[auction] = Sale({
            state: SaleState.Active,
            startedAt: uint64(block.timestamp),
            supply: cfg.totalSupply,
            proceeds: 0,
            returned: 0
        });
        _saleList.push(auction);
        emit SealedSaleStarted(auction, factory, cfg.totalSupply, cfg.committeeSetId);
    }

    /// @notice Cancel a sealed sale that has no bids yet; the auction returns the supply.
    function cancelSealedSale(address auction, Auth calldata auth) external nonReentrant {
        Sale storage s = _sales[auction];
        if (s.state != SaleState.Active) revert SaleNotActive(auction, s.state);
        _quorum(ACTION_CANCEL_SALE, keccak256(abi.encode(auction)), auth);
        s.state = SaleState.Cancelled;
        uint256 before = payToken.balanceOf(address(this));
        ISealedAuction(auction).cancel();
        uint256 returned = payToken.balanceOf(address(this)) - before;
        s.returned = returned;
        emit SealedSaleCancelled(auction, returned);
    }

    // ------------------------------------------------------------------ timelock

    /// @notice Queue a change that must wait `delay` (see `OpKind` for `data`).
    function queue(OpKind kind, bytes calldata data, Auth calldata auth) external nonReentrant returns (uint256 opId) {
        _checkOp(kind, data);
        _quorum(ACTION_QUEUE, keccak256(abi.encode(kind, keccak256(data))), auth);
        opId = ++opCount;
        uint64 eta = uint64(block.timestamp) + delay;
        _ops[opId] = Op({kind: kind, state: OpState.Queued, eta: eta, epoch: setEpoch, data: data});
        emit OpQueued(opId, kind, data, eta, setEpoch);
    }

    /// @notice Anyone may execute a queued change once its delay has passed.
    function execute(uint256 opId) external nonReentrant {
        Op storage op = _ops[opId];
        _requireLive(opId, op);
        if (block.timestamp < op.eta) revert OpNotReady(opId, op.eta);
        if (block.timestamp > uint256(op.eta) + EXECUTION_WINDOW) {
            revert OpLapsed(opId, uint256(op.eta) + EXECUTION_WINDOW);
        }
        op.state = OpState.Executed;
        OpKind kind = op.kind;
        bytes memory data = op.data;

        if (kind == OpKind.SetSigners) {
            (address[] memory members_, uint256 threshold_) = abi.decode(data, (address[], uint256));
            _set.setMembers(members_, threshold_); // checks every member's key now
            uint64 epoch = ++setEpoch;
            emit SignerSetChanged(epoch, members_, threshold_);
        } else if (kind == OpKind.SetDelay) {
            uint64 d = abi.decode(data, (uint64));
            delay = d;
            emit DelayChanged(d);
        } else if (kind == OpKind.SetDailyCap) {
            (address token, uint256 cap) = abi.decode(data, (address, uint256));
            dailyCap[token] = cap;
            emit DailyCapChanged(token, cap);
        } else if (kind == OpKind.SetAuctionFactory) {
            address f = abi.decode(data, (address));
            auctionFactory = f;
            emit AuctionFactoryChanged(f);
        } else {
            (address token, address to, uint256 amount) = abi.decode(data, (address, address, uint256));
            _requireFree(token, amount);
            _send(token, to, amount);
            emit Swept(token, to, amount, true);
        }
        emit OpExecuted(opId, kind);
    }

    /// @notice Any single member may veto a queued change with one signature.
    function veto(uint256 opId, uint256 deadline, address member, bytes calldata signature) external nonReentrant {
        Op storage op = _ops[opId];
        _requireLive(opId, op);
        _set.authorizeAny(ACTION_VETO, keccak256(abi.encode(opId)), deadline, MAX_AUTH_TTL, member, signature);
        op.state = OpState.Vetoed;
        emit OpVetoed(opId, member);
    }

    // ------------------------------------------------------------------ permissionless

    /// @notice Settle the open tender at one clearing price, after its end. Anyone may
    ///         call it: the clearing is deterministic, and the money only goes to the
    ///         sellers the rule picks.
    function settle() external nonReentrant {
        _book.settle(buyDecimals);
    }

    /// @notice Offer `quantity` of the bought-back token at a minimum price tick.
    ///         The tokens are escrowed until the tender ends.
    function offer(uint256 quantity, uint16 tick) external nonReentrant returns (uint32 offerId) {
        offerId = _book.offer(buyToken, quantity, tick);
    }

    /// @notice Settle one offer of a settled or failed tender. Anyone may call it;
    ///         payment and unsold tokens only ever go to the offer's seller.
    function claim(uint256 tenderId, uint32 offerId)
        external
        nonReentrant
        returns (uint256 sold, uint256 paid, uint256 returned)
    {
        return _book.claim(payToken, buyToken, buyDecimals, tenderId, offerId);
    }

    /// @notice Bring a finished sealed sale's proceeds and unsold supply home. Anyone
    ///         may call it: the auction pays only its issuer, this vault.
    /// @dev Someone may already have called the auction's own `claimProceeds` or
    ///      `claimUnsold`; those funds are already here and only the rest is claimed.
    function collectSealedSale(address auction) external nonReentrant {
        Sale storage s = _sales[auction];
        if (s.state != SaleState.Active) revert SaleNotActive(auction, s.state);
        ISealedAuction a = ISealedAuction(auction);
        ISealedAuction.State st = a.state();
        if (st != ISealedAuction.State.Settled && st != ISealedAuction.State.Failed) {
            revert SaleNotFinished(auction, st);
        }
        s.state = SaleState.Collected;

        uint256 buyBefore = buyToken.balanceOf(address(this));
        uint256 payBefore = payToken.balanceOf(address(this));
        if (st == ISealedAuction.State.Settled && !a.proceedsClaimed()) a.claimProceeds();
        if (!a.unsoldClaimed()) a.claimUnsold();
        uint256 proceeds = buyToken.balanceOf(address(this)) - buyBefore;
        uint256 returned = payToken.balanceOf(address(this)) - payBefore;
        s.proceeds = proceeds;
        s.returned = returned;
        emit SealedSaleCollected(auction, st, proceeds, returned);
    }

    // ------------------------------------------------------------------ views

    function members() external view returns (address[] memory) {
        return _set.members;
    }

    function threshold() external view returns (uint256) {
        return _set.threshold;
    }

    function isMember(address account) external view returns (bool) {
        return _set.isMember(account);
    }

    /// @notice The signer set's next nonce. Every quorum action and every veto consumes one.
    function nonce() external view returns (uint256) {
        return _set.nonce;
    }

    /// @notice The exact bytes `member` signs as its share of a quorum for `action`.
    function quorumMessage(address member, bytes32 action, bytes32 argsHash, uint256 deadline)
        external
        view
        returns (bytes memory)
    {
        return _set.quorumMessage(member, action, deadline, argsHash);
    }

    /// @notice The exact bytes `member` signs to veto queued change `opId` alone.
    function vetoMessage(address member, uint256 opId, uint256 deadline) external view returns (bytes memory) {
        return PqAuth.message(
            address(this), member, PqAuthSet.anyAction(ACTION_VETO), _set.nonce, deadline, keccak256(abi.encode(opId))
        );
    }

    /// @notice What `token` can still leave today without the timelock.
    function remainingToday(address token) public view returns (uint256) {
        uint256 cap = dailyCap[token];
        Allowance memory a = _allowance[token];
        uint256 spent = a.day == _today() ? a.spent : 0;
        return cap > spent ? cap - spent : 0;
    }

    function getOp(uint256 opId) external view returns (Op memory) {
        return _ops[opId];
    }

    /// @notice What can be swept, budgeted or sold. `token == address(0)` is native QOR.
    function freeBalance(address token) public view returns (uint256) {
        if (token == address(0)) return address(this).balance;
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 locked = 0;
        if (token == address(payToken)) locked += _book.reservedPay;
        if (token == address(buyToken)) locked += _book.escrowedBuy;
        return bal > locked ? bal - locked : 0;
    }

    function tenderCount() external view returns (uint256) {
        return _book.tenderCount;
    }

    function openTenderId() external view returns (uint256) {
        return _book.openTenderId;
    }

    function reservedPay() external view returns (uint256) {
        return _book.reservedPay;
    }

    function escrowedBuy() external view returns (uint256) {
        return _book.escrowedBuy;
    }

    function supplyByTick(uint256 tenderId, uint256 tick) external view returns (uint256) {
        return _book.supplyByTick[tenderId][tick];
    }

    function getTender(uint256 tenderId) external view returns (TenderBook.Tender memory) {
        return _book.getTender(tenderId);
    }

    function getOffer(uint256 tenderId, uint32 offerId) external view returns (TenderBook.Offer memory) {
        return _book.getOffer(tenderId, offerId);
    }

    /// @notice What an offer sells, once its tender is settled.
    function allocationOf(uint256 tenderId, uint32 offerId) external view returns (uint256) {
        return _book.allocationOf(tenderId, offerId);
    }

    function saleCount() external view returns (uint256) {
        return _saleList.length;
    }

    function saleAt(uint256 index) external view returns (address) {
        return _saleList[index];
    }

    function getSale(address auction) external view returns (Sale memory) {
        return _sales[auction];
    }

    // ------------------------------------------------------------------ internals

    function _quorum(bytes32 action, bytes32 argsHash, Auth calldata auth) private {
        _set.authorizeQuorum(action, argsHash, auth.deadline, MAX_AUTH_TTL, auth.signers, auth.signatures);
    }

    function _today() private view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    function _spend(address token, uint256 amount) private {
        uint256 remaining = remainingToday(token);
        if (amount > remaining) revert OverDailyCap(token, amount, remaining);
        Allowance storage a = _allowance[token];
        uint64 today = _today();
        uint256 spent = (a.day == today ? a.spent : 0) + amount; // <= cap, so it fits
        a.day = today;
        a.spent = uint192(spent);
        emit Spent(token, amount, spent, dailyCap[token]);
    }

    function _requireFree(address token, uint256 amount) private view {
        uint256 free = freeBalance(token);
        if (amount > free) revert InsufficientFree(token, amount, free);
    }

    function _send(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeSendFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _requireLive(uint256 opId, Op storage op) private view {
        if (op.state == OpState.None) revert NoSuchOp(opId);
        if (op.state != OpState.Queued) revert OpNotQueued(opId, op.state);
        if (op.epoch != setEpoch) revert OpVoid(opId, op.epoch, setEpoch);
    }

    /// @dev Shape checks at queue time, so a malformed change never sits in the queue.
    ///      Member keys are checked again at execution, when they matter.
    function _checkOp(OpKind kind, bytes calldata data) private view {
        if (kind == OpKind.SetSigners) {
            (address[] memory m, uint256 t) = abi.decode(data, (address[], uint256));
            if (m.length == 0 || m.length > PqAuthSet.MAX_MEMBERS) revert BadParams("members");
            if (t == 0 || t > m.length) revert BadParams("threshold");
            for (uint256 i = 0; i < m.length; ++i) {
                if (m[i] == address(0)) revert ZeroAddress();
                if (i > 0 && m[i] <= m[i - 1]) revert BadParams("members order");
                PqAuth.keyOf(m[i]);
            }
        } else if (kind == OpKind.SetDelay) {
            uint64 d = abi.decode(data, (uint64));
            if (d < MIN_DELAY || d > MAX_DELAY) revert BadDelay(d);
        } else if (kind == OpKind.SetDailyCap) {
            (, uint256 cap) = abi.decode(data, (address, uint256)); // any token; 0 = native QOR
            if (cap > type(uint192).max) revert BadParams("cap");
        } else if (kind == OpKind.SetAuctionFactory) {
            abi.decode(data, (address)); // 0 switches sealed sales off
        } else {
            (, address to, uint256 amount) = abi.decode(data, (address, address, uint256));
            if (to == address(0)) revert ZeroAddress();
            if (amount == 0) revert BadQuantity(0);
        }
    }

    function _pullExact(IERC20 token, address from, uint256 amount) private {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != amount) revert FeeOnTransfer(amount, received);
    }
}
