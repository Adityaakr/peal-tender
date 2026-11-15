// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PqAuth} from "qore-pq-kit/PqAuth.sol";
import {TenderClearing} from "./TenderClearing.sol";

/// @title PealTender
/// @notice A treasury buyback vault whose every treasury action needs a fresh
///         post-quantum (ML-DSA-87) signature, verified on chain.
///
/// A project treasury keeps its payment token (fUSD on the QoreChain testnet) in
/// this vault and runs buyback tenders from it: it opens a tender with a budget
/// and a price ladder, holders offer tokens at a minimum price, the tender
/// clears at one price (the rule in `TenderClearing`, ported from Peal), sellers
/// are paid and the bought tokens stay in the vault.
///
/// ## Who can do what
///
/// | Action | Needs |
/// | --- | --- |
/// | `deposit` (pull funds from an address that approved the vault) | PQ signature |
/// | `openTender`, `cancelTender`, `settle` | PQ signature |
/// | `sweep` (move free funds out) | PQ signature |
/// | `rotateSigner` | PQ signature of the current signer |
/// | `offer` (a holder escrows their own tokens) | nothing beyond their own tokens |
/// | `claim` (pay a seller what the settlement owes them) | nothing: the money only goes to that seller |
/// | `expire` (fail a tender nobody settled in time, so sellers can reclaim) | nothing |
///
/// "PQ signature" means a signature by the signer account's registered ML-DSA-87
/// key over (chain id, this contract, signer, action, nonce, deadline, argument
/// hash), checked with the `pqcKeyStatus` and `pqcVerify` precompiles by
/// `PqAuth`. `msg.sender` is never consulted for authority: holding the signer
/// account's classical secp256k1 key, or being the deployer, gives no power here.
///
/// ## Accounting
///
/// `reservedPay` is payment owed to an open tender's budget or to unclaimed
/// sellers of a settled one; `escrowedBuy` is sellers' tokens held for unclaimed
/// offers. Only the balance above those can be swept or budgeted. Funds that
/// arrive by a plain transfer (or a native-lane `MsgConvertCoin` straight to this
/// address) count as free treasury funds.
contract PealTender is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PqAuth for PqAuth.Signer;

    // ------------------------------------------------------------------ constants

    bytes32 public constant ACTION_DEPOSIT = keccak256("PealTender.deposit");
    bytes32 public constant ACTION_OPEN = keccak256("PealTender.openTender");
    bytes32 public constant ACTION_CANCEL = keccak256("PealTender.cancelTender");
    bytes32 public constant ACTION_SETTLE = keccak256("PealTender.settle");
    bytes32 public constant ACTION_SWEEP = keccak256("PealTender.sweep");
    bytes32 public constant ACTION_ROTATE = keccak256("PealTender.rotateSigner");

    /// @notice How far ahead a signature's deadline may be.
    uint256 public constant MAX_AUTH_TTL = 1 days;
    /// @notice After a tender's end, how long the signer has to settle it before
    ///         anyone may fail it and let sellers take their tokens back.
    uint256 public constant SETTLE_GRACE = 3 days;
    uint256 public constant MAX_DURATION = 30 days;
    uint32 public constant MAX_OFFERS = 200;

    // ------------------------------------------------------------------ types

    enum State {
        None,
        Open,
        Settled,
        Failed
    }

    struct OpenParams {
        uint256 budget; // payment base units
        uint256 floorPrice; // payment base units per whole bought token, at tick 0
        uint256 tickSize; // price step per tick
        uint16 numTicks; // 1 to 256
        uint64 endTime; // offers accepted until this timestamp
        uint32 maxOffers; // 1 to MAX_OFFERS
        uint256 minQuantity; // smallest offer, in bought-token base units
    }

    struct Tender {
        State state;
        uint16 numTicks;
        uint16 clearingTick;
        uint32 maxOffers;
        uint32 offerCount;
        uint32 claimedCount;
        uint64 endTime;
        uint256 budget;
        uint256 floorPrice;
        uint256 tickSize;
        uint256 minQuantity;
        uint256 price;
        uint256 bought;
        uint256 supplyAtClearingTick;
        uint256 fillAtClearingTick;
        uint256 reserved; // payment still held for this tender
        uint256 escrowed; // seller tokens still held for this tender
    }

    struct Offer {
        address seller;
        uint16 tick;
        bool claimed;
        uint256 quantity;
    }

    // ------------------------------------------------------------------ storage

    IERC20 public immutable payToken;
    IERC20 public immutable buyToken;
    uint8 public immutable buyDecimals;

    PqAuth.Signer internal _signer;

    uint256 public tenderCount;
    uint256 public openTenderId; // 0 when no tender is open
    uint256 public reservedPay;
    uint256 public escrowedBuy;

    mapping(uint256 tenderId => Tender) internal _tenders;
    mapping(uint256 tenderId => mapping(uint32 offerId => Offer)) internal _offers;
    mapping(uint256 tenderId => mapping(uint256 tick => uint256)) public supplyByTick;

    // ------------------------------------------------------------------ events and errors

    event Deposited(address indexed from, uint256 amount);
    event NativeReceived(address indexed from, uint256 amount);
    event TenderOpened(
        uint256 indexed tenderId,
        uint256 budget,
        uint256 floorPrice,
        uint256 tickSize,
        uint16 numTicks,
        uint64 endTime,
        uint32 maxOffers,
        uint256 minQuantity
    );
    event OfferPlaced(uint256 indexed tenderId, uint32 indexed offerId, address indexed seller, uint256 quantity, uint16 tick);
    event TenderSettled(uint256 indexed tenderId, uint16 clearingTick, uint256 price, uint256 bought, uint256 reserved);
    event TenderFailed(uint256 indexed tenderId, string reason);
    event Claimed(
        uint256 indexed tenderId, uint32 indexed offerId, address indexed seller, uint256 sold, uint256 paid, uint256 returned
    );
    event Swept(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error SameToken();
    error BadDecimals(uint8 decimals);
    error BadParams(string what);
    error TenderAlreadyOpen(uint256 tenderId);
    error NoOpenTender();
    error TooEarly(uint256 at);
    error TooLate(uint256 at);
    error BadTick(uint16 tick, uint16 numTicks);
    error BadQuantity(uint256 quantity);
    error TooManyOffers(uint32 maxOffers);
    error NoSuchOffer(uint256 tenderId, uint32 offerId);
    error AlreadyClaimed(uint256 tenderId, uint32 offerId);
    error NotClaimable(uint256 tenderId, State state);
    error FeeOnTransfer(uint256 expected, uint256 received);
    error InsufficientFree(address token, uint256 wanted, uint256 free);
    error NativeSendFailed();

    // ------------------------------------------------------------------ construction

    /// @param signer_ the account whose registered ML-DSA-87 key authorises the
    ///                treasury. It must have a key with proven possession.
    constructor(IERC20 payToken_, IERC20 buyToken_, address signer_) {
        if (address(payToken_) == address(0) || address(buyToken_) == address(0)) revert ZeroAddress();
        if (address(payToken_) == address(buyToken_)) revert SameToken();
        uint8 d = IERC20Metadata(address(buyToken_)).decimals();
        if (d > 30) revert BadDecimals(d);
        payToken = payToken_;
        buyToken = buyToken_;
        buyDecimals = d;
        _signer.init(signer_);
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    // ------------------------------------------------------------------ treasury actions (PQ-gated)

    /// @notice Pull `amount` of the payment token from `from` (which approved this
    ///         vault). Gated, so nobody can spend another address's approval.
    function deposit(address from, uint256 amount, uint256 deadline, bytes calldata sig) external nonReentrant {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert BadQuantity(0);
        _signer.authorize(ACTION_DEPOSIT, keccak256(abi.encode(from, amount)), deadline, MAX_AUTH_TTL, sig);
        _pullExact(payToken, from, amount);
        emit Deposited(from, amount);
    }

    /// @notice Open a tender, reserving its budget from the free payment balance.
    function openTender(OpenParams calldata p, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
        returns (uint256 tenderId)
    {
        if (openTenderId != 0) revert TenderAlreadyOpen(openTenderId);
        if (p.budget == 0) revert BadParams("budget");
        if (p.floorPrice == 0) revert BadParams("floorPrice");
        if (p.numTicks == 0 || p.numTicks > TenderClearing.MAX_TICKS) revert BadParams("numTicks");
        if (p.numTicks > 1 && p.tickSize == 0) revert BadParams("tickSize");
        if (p.endTime <= block.timestamp || p.endTime > block.timestamp + MAX_DURATION) revert BadParams("endTime");
        if (p.maxOffers == 0 || p.maxOffers > MAX_OFFERS) revert BadParams("maxOffers");
        if (p.minQuantity == 0) revert BadParams("minQuantity");
        // The dearest tick must be computable.
        TenderClearing.priceAt(p.floorPrice, p.tickSize, p.numTicks - 1);
        uint256 free = freeBalance(address(payToken));
        if (p.budget > free) revert InsufficientFree(address(payToken), p.budget, free);

        _signer.authorize(ACTION_OPEN, keccak256(abi.encode(p)), deadline, MAX_AUTH_TTL, sig);

        tenderId = ++tenderCount;
        Tender storage t = _tenders[tenderId];
        t.state = State.Open;
        t.numTicks = p.numTicks;
        t.maxOffers = p.maxOffers;
        t.endTime = p.endTime;
        t.budget = p.budget;
        t.floorPrice = p.floorPrice;
        t.tickSize = p.tickSize;
        t.minQuantity = p.minQuantity;
        t.reserved = p.budget;
        reservedPay += p.budget;
        openTenderId = tenderId;
        emit TenderOpened(
            tenderId, p.budget, p.floorPrice, p.tickSize, p.numTicks, p.endTime, p.maxOffers, p.minQuantity
        );
    }

    /// @notice Cancel the open tender before its end. Sellers reclaim their tokens.
    function cancelTender(uint256 deadline, bytes calldata sig) external nonReentrant {
        uint256 id = openTenderId;
        if (id == 0) revert NoOpenTender();
        Tender storage t = _tenders[id];
        if (block.timestamp >= t.endTime) revert TooLate(t.endTime);
        _signer.authorize(ACTION_CANCEL, keccak256(abi.encode(id)), deadline, MAX_AUTH_TTL, sig);
        _fail(id, t, "cancelled");
    }

    /// @notice Settle the open tender at one clearing price, after its end.
    function settle(uint256 deadline, bytes calldata sig) external nonReentrant {
        uint256 id = openTenderId;
        if (id == 0) revert NoOpenTender();
        Tender storage t = _tenders[id];
        if (block.timestamp < t.endTime) revert TooEarly(t.endTime);
        _signer.authorize(ACTION_SETTLE, keccak256(abi.encode(id)), deadline, MAX_AUTH_TTL, sig);

        uint256[] memory supply = new uint256[](t.numTicks);
        for (uint256 i = 0; i < t.numTicks; ++i) {
            supply[i] = supplyByTick[id][i];
        }
        TenderClearing.Result memory r =
            TenderClearing.findClearing(supply, t.budget, t.floorPrice, t.tickSize, buyDecimals);
        if (!r.cleared) {
            _fail(id, t, "no offer within budget");
            return;
        }

        // What the sellers can be owed at most: payments are floored per offer and
        // allocations never sum above `bought`, so this bounds their sum.
        uint256 maxOwed = TenderClearing.costCeil(r.bought, r.price, buyDecimals);
        if (maxOwed > t.budget) maxOwed = t.budget;
        reservedPay -= t.budget - maxOwed;
        t.reserved = maxOwed;

        t.state = State.Settled;
        t.clearingTick = r.clearingTick;
        t.price = r.price;
        t.bought = r.bought;
        t.supplyAtClearingTick = r.supplyAtClearingTick;
        t.fillAtClearingTick = r.fillAtClearingTick;
        openTenderId = 0;
        emit TenderSettled(id, r.clearingTick, r.price, r.bought, maxOwed);
    }

    /// @notice Move free funds out of the vault. `token == address(0)` is native QOR.
    function sweep(address token, address to, uint256 amount, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert BadQuantity(0);
        uint256 free = freeBalance(token);
        if (amount > free) revert InsufficientFree(token, amount, free);
        _signer.authorize(ACTION_SWEEP, keccak256(abi.encode(token, to, amount)), deadline, MAX_AUTH_TTL, sig);
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeSendFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        emit Swept(token, to, amount);
    }

    /// @notice Hand the treasury to another account with a usable ML-DSA-87 key.
    function rotateSigner(address next, uint256 deadline, bytes calldata sig) external nonReentrant {
        _signer.authorize(ACTION_ROTATE, keccak256(abi.encode(next)), deadline, MAX_AUTH_TTL, sig);
        _signer.setSigner(next);
    }

    // ------------------------------------------------------------------ holder actions

    /// @notice Offer `quantity` of the bought-back token at a minimum price tick.
    ///         The tokens are escrowed until the tender ends.
    function offer(uint256 quantity, uint16 tick) external nonReentrant returns (uint32 offerId) {
        uint256 id = openTenderId;
        if (id == 0) revert NoOpenTender();
        Tender storage t = _tenders[id];
        if (block.timestamp >= t.endTime) revert TooLate(t.endTime);
        if (tick >= t.numTicks) revert BadTick(tick, t.numTicks);
        if (quantity < t.minQuantity) revert BadQuantity(quantity);
        if (t.offerCount >= t.maxOffers) revert TooManyOffers(t.maxOffers);

        _pullExact(buyToken, msg.sender, quantity);

        offerId = t.offerCount++;
        _offers[id][offerId] = Offer({seller: msg.sender, tick: tick, claimed: false, quantity: quantity});
        supplyByTick[id][tick] += quantity;
        t.escrowed += quantity;
        escrowedBuy += quantity;
        emit OfferPlaced(id, offerId, msg.sender, quantity, tick);
    }

    /// @notice Settle one offer of a settled or failed tender. Anyone may call it;
    ///         payment and unsold tokens only ever go to the offer's seller.
    function claim(uint256 tenderId, uint32 offerId)
        external
        nonReentrant
        returns (uint256 sold, uint256 paid, uint256 returned)
    {
        Tender storage t = _tenders[tenderId];
        Offer storage o = _offers[tenderId][offerId];
        if (o.seller == address(0)) revert NoSuchOffer(tenderId, offerId);
        if (o.claimed) revert AlreadyClaimed(tenderId, offerId);
        if (t.state != State.Settled && t.state != State.Failed) revert NotClaimable(tenderId, t.state);

        o.claimed = true;
        t.claimedCount += 1;
        t.escrowed -= o.quantity;
        escrowedBuy -= o.quantity;

        if (t.state == State.Settled) {
            sold = TenderClearing.allocationFor(_result(t), o.quantity, o.tick);
            paid = TenderClearing.costFloor(sold, t.price, buyDecimals);
            t.reserved -= paid;
            reservedPay -= paid;
            if (t.claimedCount == t.offerCount) {
                // Every seller is paid: rounding dust goes back to the treasury.
                reservedPay -= t.reserved;
                t.reserved = 0;
            }
        }
        returned = o.quantity - sold;

        if (paid > 0) payToken.safeTransfer(o.seller, paid);
        if (returned > 0) buyToken.safeTransfer(o.seller, returned);
        emit Claimed(tenderId, offerId, o.seller, sold, paid, returned);
    }

    /// @notice Fail a tender the signer did not settle within `SETTLE_GRACE` of its
    ///         end, so sellers are never locked in. Moves no funds out.
    function expire() external nonReentrant {
        uint256 id = openTenderId;
        if (id == 0) revert NoOpenTender();
        Tender storage t = _tenders[id];
        if (block.timestamp < uint256(t.endTime) + SETTLE_GRACE) revert TooEarly(uint256(t.endTime) + SETTLE_GRACE);
        _fail(id, t, "not settled in time");
    }

    // ------------------------------------------------------------------ views

    function signer() external view returns (address) {
        return _signer.account;
    }

    function nonce() external view returns (uint256) {
        return _signer.nonce;
    }

    /// @notice The exact bytes the signer must sign for `action` at the current nonce.
    function authMessage(bytes32 action, bytes32 argsHash, uint256 deadline) external view returns (bytes memory) {
        return PqAuth.message(address(this), _signer.account, action, _signer.nonce, deadline, argsHash);
    }

    /// @notice What can be swept or budgeted. `token == address(0)` is native QOR.
    function freeBalance(address token) public view returns (uint256) {
        if (token == address(0)) return address(this).balance;
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 locked = 0;
        if (token == address(payToken)) locked += reservedPay;
        if (token == address(buyToken)) locked += escrowedBuy;
        return bal > locked ? bal - locked : 0;
    }

    function getTender(uint256 tenderId) external view returns (Tender memory) {
        return _tenders[tenderId];
    }

    function getOffer(uint256 tenderId, uint32 offerId) external view returns (Offer memory) {
        return _offers[tenderId][offerId];
    }

    /// @notice What an offer sells, once its tender is settled.
    function allocationOf(uint256 tenderId, uint32 offerId) external view returns (uint256) {
        Tender storage t = _tenders[tenderId];
        Offer storage o = _offers[tenderId][offerId];
        if (t.state != State.Settled || o.seller == address(0)) return 0;
        return TenderClearing.allocationFor(_result(t), o.quantity, o.tick);
    }

    // ------------------------------------------------------------------ internals

    function _fail(uint256 id, Tender storage t, string memory reason) private {
        t.state = State.Failed;
        reservedPay -= t.reserved;
        t.reserved = 0;
        openTenderId = 0;
        emit TenderFailed(id, reason);
    }

    function _result(Tender storage t) private view returns (TenderClearing.Result memory r) {
        r.cleared = t.state == State.Settled;
        r.clearingTick = t.clearingTick;
        r.price = t.price;
        r.bought = t.bought;
        r.supplyAtClearingTick = t.supplyAtClearingTick;
        r.fillAtClearingTick = t.fillAtClearingTick;
    }

    function _pullExact(IERC20 token, address from, uint256 amount) private {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != amount) revert FeeOnTransfer(amount, received);
    }
}
