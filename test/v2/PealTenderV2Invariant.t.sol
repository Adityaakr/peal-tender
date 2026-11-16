// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockPqcSigner} from "pqkit-test/mocks/MockPqcSigner.sol";
import {PealTenderV2} from "../../src/PealTenderV2.sol";
import {TenderBook} from "../../src/TenderBook.sol";
import {ISealedAuction} from "../../src/interfaces/ISealedAuction.sol";
import {MockERC20} from "../utils/MockERC20.sol";
import {MockSealedAuction, MockSealedAuctionFactory} from "./mocks/MockSealedAuction.sol";
import {V2TestBase} from "./V2TestBase.sol";

/// Drives the vault through random sequences of quorum actions (validly signed by
/// random pairs of members), timelocked changes, vetoes, holder actions, sealed
/// sales, time, donations and attacks: every gated function called by random
/// senders (members' own accounts included) with forged, single-member or
/// out-of-date signatures.
contract V2Handler is Test {
    PealTenderV2 internal vault;
    MockERC20 internal fusd;
    MockERC20 internal peal;
    MockSealedAuctionFactory internal factory;
    address[3] internal m;
    mapping(address => bytes32) internal secretOf;

    address public sink = address(0x51CC);
    address[4] internal actors = [address(0xA11CE), address(0xB0B), address(0xCA401), address(0xD0D0)];

    // ghosts: every payment-token movement in or out of the vault
    uint256 public payIn; // donations, deposits, sale returns
    uint256 public payOutSweepNow; // immediate sweeps
    uint256 public payOutSweepLocked; // timelocked sweeps
    uint256 public payOutClaims; // paid to tender sellers
    uint256 public payOutSales; // sent to sealed auctions
    uint256 public buyIn; // offers, sale proceeds
    uint256 public buyOutClaims; // unsold offers returned to sellers
    uint256 public attackAttempts;
    uint256 public attackSuccesses;
    uint256 public earlyExecutions;
    uint256 public maxImmediateInADay; // max over days of immediate payment-token outflow
    mapping(uint256 day => uint256) public immediateOnDay;
    uint256 public calls;

    address[] internal liveSales;
    uint256[] internal queued;

    constructor(
        PealTenderV2 v,
        MockERC20 f,
        MockERC20 p,
        MockSealedAuctionFactory fac,
        address[3] memory members,
        bytes32[3] memory secrets
    ) {
        vault = v;
        fusd = f;
        peal = p;
        factory = fac;
        m = members;
        for (uint256 i = 0; i < 3; ++i) {
            secretOf[members[i]] = secrets[i];
        }
    }

    // ------------------------------------------------------------------ signing

    function _pair(uint256 seed) internal view returns (address[] memory w) {
        uint256 skip = seed % 3; // leave one member out
        w = new address[](2);
        uint256 k;
        for (uint256 i = 0; i < 3; ++i) {
            if (i != skip) w[k++] = m[i];
        }
    }

    function _auth(uint256 seed, bytes32 action, bytes32 argsHash) internal view returns (PealTenderV2.Auth memory a) {
        a.deadline = block.timestamp + 1 hours;
        a.signers = _pair(seed);
        a.signatures = new bytes[](2);
        for (uint256 i = 0; i < 2; ++i) {
            a.signatures[i] = MockPqcSigner.sign(
                secretOf[a.signers[i]], vault.quorumMessage(a.signers[i], action, argsHash, a.deadline)
            );
        }
    }

    function _forged(uint256 seed, bytes32 action, bytes32 argsHash)
        internal
        view
        returns (PealTenderV2.Auth memory a)
    {
        a = _auth(seed, action, argsHash);
        uint256 kind = seed % 4;
        if (kind == 0) {
            // one share replaced by junk
            a.signatures[seed % 2] = _junk(seed);
        } else if (kind == 1) {
            // a single real share, alone
            address[] memory one = new address[](1);
            one[0] = a.signers[0];
            bytes[] memory sig = new bytes[](1);
            sig[0] = a.signatures[0];
            a.signers = one;
            a.signatures = sig;
        } else if (kind == 2) {
            // both shares signed for the next nonce
            for (uint256 i = 0; i < 2; ++i) {
                a.signatures[i] = MockPqcSigner.sign(
                    secretOf[a.signers[i]],
                    abi.encode(
                        keccak256("qore-pq-kit.PqAuth.v1"),
                        block.chainid,
                        address(vault),
                        a.signers[i],
                        keccak256(abi.encode(keccak256("qore-pq-kit.PqAuthSet.quorum.v1"), action)),
                        vault.nonce() + 1,
                        a.deadline,
                        argsHash
                    )
                );
            }
        } else {
            // the same member twice
            a.signers[1] = a.signers[0];
            a.signatures[1] = a.signatures[0];
        }
    }

    function _junk(uint256 seed) internal pure returns (bytes memory sig) {
        sig = new bytes(4627);
        bytes32 w = keccak256(abi.encode(seed));
        for (uint256 i = 0; i < 32; ++i) {
            sig[i] = w[i];
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _noteImmediate(uint256 amount) internal {
        uint256 day = block.timestamp / 1 days;
        immediateOnDay[day] += amount;
        if (immediateOnDay[day] > maxImmediateInADay) maxImmediateInADay = immediateOnDay[day];
    }

    // ------------------------------------------------------------------ funds in

    function donate(uint96 amount) external {
        calls++;
        uint256 a = bound(amount, 1, 2_000e6);
        fusd.mint(address(vault), a);
        payIn += a;
    }

    function deposit(uint96 amount, uint256 seed) external {
        calls++;
        uint256 a = bound(amount, 1, 2_000e6);
        address from = _actor(seed);
        fusd.mint(from, a);
        vm.prank(from);
        fusd.approve(address(vault), a);
        vault.deposit(from, a, _auth(seed, vault.ACTION_DEPOSIT(), keccak256(abi.encode(from, a))));
        payIn += a;
    }

    // ------------------------------------------------------------------ quorum actions

    function sweep(uint96 amount, uint256 seed) external {
        calls++;
        uint256 free = vault.freeBalance(address(fusd));
        uint256 room = vault.remainingToday(address(fusd));
        uint256 lim = free < room ? free : room;
        if (lim == 0) return;
        uint256 a = bound(amount, 1, lim < 100e6 ? lim : 100e6);
        vault.sweep(
            address(fusd), sink, a, _auth(seed, vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), sink, a)))
        );
        payOutSweepNow += a;
        _noteImmediate(a);
    }

    function openTender(uint96 budgetSeed, uint8 ticks, uint256 seed) external {
        calls++;
        if (vault.openTenderId() != 0) return;
        uint256 free = vault.freeBalance(address(fusd));
        uint256 room = vault.remainingToday(address(fusd));
        uint256 lim = free < room ? free : room;
        if (lim < 1e6) return;
        TenderBook.OpenParams memory p;
        p.budget = bound(budgetSeed, 1e6, lim < 300e6 ? lim : 300e6);
        p.floorPrice = 1e5;
        p.tickSize = 1e4;
        p.numTicks = uint16(bound(ticks, 1, 20));
        p.endTime = uint64(block.timestamp + 12 hours);
        p.maxOffers = 20;
        p.minQuantity = 1e16;
        vault.openTender(p, _auth(seed, vault.ACTION_OPEN_TENDER(), keccak256(abi.encode(p))));
        _noteImmediate(p.budget);
    }

    function cancelTender(uint256 seed) external {
        calls++;
        if (seed % 4 != 0) return; // rarer than the rest, so most tenders run to settlement
        uint256 id = vault.openTenderId();
        if (id == 0 || block.timestamp >= vault.getTender(id).endTime) return;
        vault.cancelTender(_auth(seed, vault.ACTION_CANCEL_TENDER(), keccak256(abi.encode(id))));
    }

    function startSale(uint96 supplySeed, uint256 seed) external {
        calls++;
        uint256 free = vault.freeBalance(address(fusd));
        uint256 room = vault.remainingToday(address(fusd));
        uint256 lim = free < room ? free : room;
        if (lim == 0 || liveSales.length > 4) return;
        ISealedAuction.Config memory c;
        c.issuer = address(vault);
        c.saleToken = address(fusd);
        c.quoteToken = address(peal);
        c.totalSupply = bound(supplySeed, 1, lim < 200e6 ? lim : 200e6);
        c.saleDecimals = 6;
        c.reservePrice = 1e18;
        c.numTicks = 1;
        c.startTime = uint64(block.timestamp);
        c.endTime = uint64(block.timestamp + 1 hours);
        c.releaseDeadline = uint64(block.timestamp + 2 hours);
        c.maxBids = 8;
        c.metadataHash = keccak256(abi.encode(string("s"), string("d")));
        bytes32 h = keccak256(abi.encode(address(factory), c, keccak256(bytes("s")), keccak256(bytes("d"))));
        address a = vault.startSealedSale(c, "s", "d", _auth(seed, vault.ACTION_START_SALE(), h));
        liveSales.push(a);
        payOutSales += c.totalSupply;
        _noteImmediate(c.totalSupply);
    }

    /// The auction finishes (settles with some sale, or fails), then someone collects.
    function finishSale(uint256 idx, uint96 soldSeed, uint96 proceedsSeed, bool doFail, bool directClaim) external {
        calls++;
        if (liveSales.length == 0) return;
        uint256 i = idx % liveSales.length;
        MockSealedAuction a = MockSealedAuction(liveSales[i]);
        uint256 supply = a.config().totalSupply;
        uint256 sold;
        uint256 proceeds;
        if (doFail) {
            a.fail();
        } else {
            sold = bound(soldSeed, 0, supply);
            proceeds = bound(proceedsSeed, 0, 1e24);
            peal.mint(address(a), proceeds);
            a.settle(sold, proceeds);
            if (directClaim) a.claimProceeds(); // a stranger claims on the auction itself
        }
        vault.collectSealedSale(address(a));
        payIn += supply - sold;
        buyIn += proceeds;
        liveSales[i] = liveSales[liveSales.length - 1];
        liveSales.pop();
    }

    function cancelSale(uint256 idx, uint256 seed) external {
        calls++;
        if (liveSales.length == 0) return;
        uint256 i = idx % liveSales.length;
        address a = liveSales[i];
        uint256 supply = MockSealedAuction(a).config().totalSupply;
        vault.cancelSealedSale(a, _auth(seed, vault.ACTION_CANCEL_SALE(), keccak256(abi.encode(a))));
        payIn += supply;
        liveSales[i] = liveSales[liveSales.length - 1];
        liveSales.pop();
    }

    // ------------------------------------------------------------------ timelock

    function queueBigSweep(uint96 amount, uint256 seed) external {
        calls++;
        uint256 a = bound(amount, 1, 3_000e6);
        bytes memory data = abi.encode(address(fusd), sink, a);
        uint256 id = vault.queue(
            PealTenderV2.OpKind.Sweep,
            data,
            _auth(seed, vault.ACTION_QUEUE(), keccak256(abi.encode(PealTenderV2.OpKind.Sweep, keccak256(data))))
        );
        queued.push(id);
    }

    /// With `wait`, first move time to the change's eta; without it, try it as it stands
    /// (which must fail while the delay runs).
    function execute(uint256 idx, bool wait) external {
        calls++;
        if (queued.length == 0) return;
        uint256 id = queued[idx % queued.length];
        PealTenderV2.Op memory op = vault.getOp(id);
        (,, uint256 a) = abi.decode(op.data, (address, address, uint256));
        if (wait && block.timestamp < op.eta) vm.warp(op.eta);
        bool ready = block.timestamp >= op.eta;
        try vault.execute(id) {
            if (!ready) earlyExecutions++;
            payOutSweepLocked += a;
        } catch {}
    }

    function veto(uint256 idx, uint256 seed) external {
        calls++;
        if (queued.length == 0) return;
        uint256 id = queued[idx % queued.length];
        if (vault.getOp(id).state != PealTenderV2.OpState.Queued) return;
        address who = m[seed % 3];
        uint256 d = block.timestamp + 1 hours;
        vault.veto(id, d, who, MockPqcSigner.sign(secretOf[who], vault.vetoMessage(who, id, d)));
    }

    // ------------------------------------------------------------------ holders

    function offer(uint256 seed, uint96 qty, uint8 tick) external {
        calls++;
        uint256 id = vault.openTenderId();
        if (id == 0) return;
        TenderBook.Tender memory t = vault.getTender(id);
        if (block.timestamp >= t.endTime || t.offerCount >= t.maxOffers) return;
        address who = _actor(seed);
        uint256 q = bound(qty, t.minQuantity, 2_000e18);
        uint16 tk = uint16(bound(tick, 0, t.numTicks - 1));
        peal.mint(who, q);
        vm.startPrank(who);
        peal.approve(address(vault), q);
        vault.offer(q, tk);
        vm.stopPrank();
        buyIn += q;
    }

    function settle(uint256 seed) external {
        calls++;
        uint256 id = vault.openTenderId();
        if (id == 0) return;
        uint64 end = vault.getTender(id).endTime;
        if (block.timestamp < end) vm.warp(end);
        vm.prank(_actor(seed)); // anyone
        vault.settle();
    }

    /// Claim the first unclaimed offer of a finished tender, starting the search at a random tender.
    function claim(uint256 tenderSeed) external {
        calls++;
        uint256 n = vault.tenderCount();
        for (uint256 k = 0; k < n; ++k) {
            uint256 id = (tenderSeed + k) % n + 1;
            TenderBook.Tender memory t = vault.getTender(id);
            if (t.state != TenderBook.State.Settled && t.state != TenderBook.State.Failed) continue;
            for (uint32 o = 0; o < t.offerCount; ++o) {
                if (vault.getOffer(id, o).claimed) continue;
                (, uint256 paid, uint256 returned) = vault.claim(id, o);
                payOutClaims += paid;
                buyOutClaims += returned;
                return;
            }
        }
    }

    function warp(uint32 secs) external {
        calls++;
        vm.warp(block.timestamp + bound(secs, 1, 3 hours));
    }

    // ------------------------------------------------------------------ attacks

    function attackSweep(uint256 seed, uint96 amount) external {
        calls++;
        attackAttempts++;
        address to = _actor(seed);
        uint256 a = bound(amount, 1, 1e12);
        PealTenderV2.Auth memory au = _forged(seed, vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), to, a)));
        vm.prank(m[seed % 3]); // even from a member's own account
        try vault.sweep(address(fusd), to, a, au) {
            attackSuccesses++;
        } catch {}
    }

    function attackQueue(uint256 seed) external {
        calls++;
        attackAttempts++;
        address[] memory evil = new address[](1);
        evil[0] = m[seed % 3];
        bytes memory data = abi.encode(evil, uint256(1));
        PealTenderV2.Auth memory au =
            _forged(seed, vault.ACTION_QUEUE(), keccak256(abi.encode(PealTenderV2.OpKind.SetSigners, keccak256(data))));
        vm.prank(_actor(seed));
        try vault.queue(PealTenderV2.OpKind.SetSigners, data, au) {
            attackSuccesses++;
        } catch {}
    }

    function attackSale(uint256 seed) external {
        calls++;
        attackAttempts++;
        ISealedAuction.Config memory c;
        c.issuer = address(vault);
        c.saleToken = address(fusd);
        c.quoteToken = address(peal);
        c.totalSupply = 1;
        c.saleDecimals = 6;
        c.metadataHash = keccak256(abi.encode(string("x"), string("y")));
        bytes32 h = keccak256(abi.encode(address(factory), c, keccak256(bytes("x")), keccak256(bytes("y"))));
        PealTenderV2.Auth memory au = _forged(seed, vault.ACTION_START_SALE(), h);
        try vault.startSealedSale(c, "x", "y", au) {
            attackSuccesses++;
        } catch {}
    }

    function attackVeto(uint256 seed) external {
        calls++;
        if (queued.length == 0) return;
        attackAttempts++;
        uint256 id = queued[seed % queued.length];
        try vault.veto(id, block.timestamp + 1 hours, m[seed % 3], _junk(seed)) {
            attackSuccesses++;
        } catch {}
    }

    function attackDeposit(uint256 seed) external {
        calls++;
        attackAttempts++;
        address victim = _actor(seed);
        fusd.mint(victim, 1e6);
        vm.prank(victim);
        fusd.approve(address(vault), 1e6);
        PealTenderV2.Auth memory au = _forged(seed, vault.ACTION_DEPOSIT(), keccak256(abi.encode(victim, uint256(1e6))));
        try vault.deposit(victim, 1e6, au) {
            attackSuccesses++;
        } catch {}
    }

    function liveSaleCount() external view returns (uint256) {
        return liveSales.length;
    }
}

/// forge-config: default.invariant.depth = 128
contract PealTenderV2InvariantTest is V2TestBase {
    V2Handler internal handler;

    function setUp() public {
        setUpVault();
        bytes32[3] memory secrets = [secretOf[s[0]], secretOf[s[1]], secretOf[s[2]]];
        handler = new V2Handler(vault, fusd, peal, factory, s, secrets);
        targetContract(address(handler));
    }

    /// No forged, single-member, out-of-date or duplicate-member authorisation ever works.
    function invariant_noAttackSucceeds() public view {
        assertEq(handler.attackSuccesses(), 0);
    }

    /// The payment token leaves the vault only through signed sweeps (immediate or
    /// timelocked), sellers' claims of a signed tender, and signed sealed sales.
    function invariant_paymentTokenConservation() public view {
        assertEq(
            fusd.balanceOf(address(vault)) + handler.payOutSweepNow() + handler.payOutSweepLocked()
                + handler.payOutClaims() + handler.payOutSales(),
            handler.payIn()
        );
    }

    /// The bought-back token arrives through offers and sale proceeds, and leaves
    /// only as unsold offers returned to their sellers.
    function invariant_buyTokenConservation() public view {
        assertEq(peal.balanceOf(address(vault)) + handler.buyOutClaims(), handler.buyIn());
    }

    /// What is owed to tenders and sellers is always held.
    function invariant_solvent() public view {
        assertGe(fusd.balanceOf(address(vault)), vault.reservedPay());
        assertGe(peal.balanceOf(address(vault)), vault.escrowedBuy());
    }

    /// No day's immediate outflow exceeds the daily cap, and nothing ran before its delay.
    function invariant_capAndDelay() public view {
        assertLe(handler.maxImmediateInADay(), CAP);
        assertEq(handler.earlyExecutions(), 0);
    }

    /// The signer set never changed: every attempt to change it was forged.
    function invariant_signerSetUnchanged() public view {
        assertEq(vault.setEpoch(), 0);
        assertEq(vault.threshold(), 2);
        assertEq(vault.members().length, 3);
    }

    /// No approval to the factory is ever left behind.
    function invariant_noLingeringApproval() public view {
        assertEq(fusd.allowance(address(vault), address(factory)), 0);
    }
}
