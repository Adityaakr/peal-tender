// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1363} from "@openzeppelin/contracts/token/ERC20/extensions/ERC1363.sol";
import {ERC1363Utils} from "@openzeppelin/contracts/token/ERC20/utils/ERC1363Utils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {PealTenderV2} from "../../src/PealTenderV2.sol";
import {TenderBook} from "../../src/TenderBook.sol";
import {ISealedAuction} from "../../src/interfaces/ISealedAuction.sol";
import {MockERC20} from "../utils/MockERC20.sol";
import {MockSealedAuction} from "./mocks/MockSealedAuction.sol";
import {V2TestBase} from "./V2TestBase.sol";

/// A token that calls a hook before and after every balance change, as an ERC-777
/// would: the worst case for a vault that pays out and pulls in tokens.
contract HookERC20 is MockERC20 {
    address public hook;

    constructor(string memory n, uint8 d) MockERC20(n, n, d) {}

    function setHook(address h) external {
        hook = h;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (hook != address(0)) Reenterer(payable(hook)).onTokenMove();
        super._update(from, to, value);
        if (hook != address(0)) Reenterer(payable(hook)).onTokenMove();
    }
}

/// Sells into the vault, and whenever it gets control in the middle of a vault call
/// (a token hook or a native payment) it tries every state-changing vault function.
contract Reenterer {
    PealTenderV2 public immutable vault;
    address public auction;
    bool public armed;
    bool internal busy;
    uint256 public controlGained; // times it had control inside a vault call
    uint256 public attempts;
    uint256 public refusedByGuard;

    constructor(PealTenderV2 v) {
        vault = v;
    }

    function arm(bool on) external {
        armed = on;
    }

    function setAuction(address a) external {
        auction = a;
    }

    function sell(ERC20 token, uint256 quantity, uint16 tick) external returns (uint32) {
        token.approve(address(vault), quantity);
        return vault.offer(quantity, tick);
    }

    function onTokenMove() external {
        _attack();
    }

    receive() external payable {
        _attack();
    }

    function _attack() private {
        if (!armed || busy) return;
        busy = true;
        controlGained++;
        PealTenderV2.Auth memory a;
        TenderBook.OpenParams memory p;
        ISealedAuction.Config memory c;
        _try(abi.encodeCall(vault.deposit, (address(this), 1, a)));
        _try(abi.encodeCall(vault.sweep, (address(0), address(this), 1, a)));
        _try(abi.encodeCall(vault.openTender, (p, a)));
        _try(abi.encodeCall(vault.cancelTender, (a)));
        _try(abi.encodeCall(vault.startSealedSale, (c, "", "", a)));
        _try(abi.encodeCall(vault.cancelSealedSale, (auction, a)));
        _try(abi.encodeCall(vault.queue, (PealTenderV2.OpKind.SetDelay, abi.encode(uint64(1 days)), a)));
        _try(abi.encodeCall(vault.execute, (1)));
        _try(abi.encodeCall(vault.veto, (1, 0, address(this), "")));
        _try(abi.encodeCall(vault.settle, ()));
        _try(abi.encodeCall(vault.offer, (1, 0)));
        _try(abi.encodeCall(vault.claim, (1, 0)));
        _try(abi.encodeCall(vault.collectSealedSale, (auction)));
        busy = false;
    }

    function _try(bytes memory data) private {
        attempts++;
        (bool ok, bytes memory ret) = address(vault).call(data);
        if (!ok && ret.length == 4 && bytes4(ret) == ReentrancyGuard.ReentrancyGuardReentrantCall.selector) {
            refusedByGuard++;
        }
    }
}

/// An "auction" the vault never started, which would misreport anything it could.
contract EvilAuction {
    function state() external pure returns (ISealedAuction.State) {
        return ISealedAuction.State.Settled;
    }

    function proceedsClaimed() external pure returns (bool) {
        return false;
    }

    function unsoldClaimed() external pure returns (bool) {
        return false;
    }

    function claimProceeds() external {}
    function claimUnsold() external {}
}

contract Token1363 is ERC1363 {
    constructor() ERC20("PEAL-T 1363", "P1363") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Exploit attempts and regression tests for the QCAI audit's stage 1 findings
/// (report of 24 November 2026 UTC; docs/AUDIT.md maps each finding to these tests).
contract Audit1Test is V2TestBase {
    using stdStorage for StdStorage;

    uint256 internal constant U192 = type(uint192).max;

    address internal sink = makeAddr("sink");
    address internal alice = makeAddr("alice");
    StdStorage internal _std;
    HookERC20 internal hookPay;
    HookERC20 internal hookBuy;
    Reenterer internal seller;

    function setUp() public {
        setUpVault();
    }

    // ================================================================== finding 1
    // "Missing Access Control on Critical Functions": collectSealedSale is open to anyone.

    /// Whoever collects, every token goes to the vault and the caller gets none.
    function testFuzz_audit1_F1_strangerCollects_vaultGetsEverything(address caller, uint96 soldSeed, uint96 proceeds)
        public
    {
        fund(1_000 * USD);
        address auction = startSale(saleConfig(400 * USD));
        vm.assume(caller != address(vault) && caller != auction && caller != address(0));
        uint256 sold = bound(soldSeed, 0, 400 * USD);
        peal.mint(auction, proceeds);
        MockSealedAuction(auction).settle(sold, proceeds);
        uint256 callerPay = fusd.balanceOf(caller);
        uint256 callerBuy = peal.balanceOf(caller);

        vm.prank(caller);
        vault.collectSealedSale(auction);

        assertEq(peal.balanceOf(address(vault)), proceeds, "all proceeds");
        assertEq(fusd.balanceOf(address(vault)), 1_000 * USD - sold, "all unsold supply");
        assertEq(peal.balanceOf(caller), callerBuy, "caller gains no bought token");
        assertEq(fusd.balanceOf(caller), callerPay, "caller gains no payment token");
        assertEq(peal.allowance(address(vault), caller), 0);
        assertEq(fusd.allowance(address(vault), caller), 0);
        // Nothing is left behind for a second, privileged collection.
        assertEq(fusd.balanceOf(auction), sold, "only the bidders' tokens stay");
        assertEq(peal.balanceOf(auction), 0);
    }

    /// The caller picks only the address, and only an auction this vault started is accepted:
    /// not a fake one, and not a real one of the same factory that another issuer owns.
    function test_audit1_F1_collectRefusesAuctionsTheVaultNeverStarted() public {
        EvilAuction evil = new EvilAuction();
        fusd.mint(attacker, USD);
        ISealedAuction.Config memory c = saleConfig(USD);
        c.issuer = attacker;
        vm.startPrank(attacker);
        fusd.approve(address(factory), USD);
        address theirs = factory.createAuction(c, "Buyback 1", "vault sells fUSD for PEAL-T");
        vm.stopPrank();
        assertTrue(factory.isAuction(theirs));
        MockSealedAuction(theirs).fail();

        address[4] memory targets = [address(evil), theirs, address(0), address(vault)];
        for (uint256 i = 0; i < targets.length; ++i) {
            vm.prank(attacker);
            vm.expectRevert(
                abi.encodeWithSelector(PealTenderV2.SaleNotActive.selector, targets[i], PealTenderV2.SaleState.None)
            );
            vault.collectSealedSale(targets[i]);
        }
    }

    /// A stranger cannot collect early: every state but Settled and Failed is refused, and
    /// the refusal leaves the sale Active.
    function test_audit1_F1_collectRefusesUnfinishedStates() public {
        fund(1_000 * USD);
        address auction = startSale(saleConfig(400 * USD));
        for (uint8 i = 0; i <= uint8(type(ISealedAuction.State).max); ++i) {
            ISealedAuction.State st = ISealedAuction.State(i);
            if (st == ISealedAuction.State.Settled || st == ISealedAuction.State.Failed) continue;
            vm.mockCall(auction, abi.encodeCall(ISealedAuction.state, ()), abi.encode(st));
            vm.prank(attacker);
            vm.expectRevert(abi.encodeWithSelector(PealTenderV2.SaleNotFinished.selector, auction, st));
            vault.collectSealedSale(auction);
            assertEq(uint8(vault.getSale(auction).state), uint8(PealTenderV2.SaleState.Active));
        }
    }

    /// A collected or cancelled sale cannot be collected (again).
    function test_audit1_F1_collectOnlyOnce() public {
        fund(1_000 * USD);
        address auction = startSale(saleConfig(400 * USD));
        MockSealedAuction(auction).fail();
        vm.startPrank(attacker);
        vault.collectSealedSale(auction);
        vm.expectRevert(
            abi.encodeWithSelector(PealTenderV2.SaleNotActive.selector, auction, PealTenderV2.SaleState.Collected)
        );
        vault.collectSealedSale(auction);
        vm.stopPrank();

        address second = startSale(saleConfig(100 * USD));
        vault.cancelSealedSale(second, quorum(vault.ACTION_CANCEL_SALE(), keccak256(abi.encode(second))));
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(PealTenderV2.SaleNotActive.selector, second, PealTenderV2.SaleState.Cancelled)
        );
        vault.collectSealedSale(second);
    }

    /// Timing is the only thing a stranger chooses, and it buys nothing: a collection
    /// in the middle of a tender touches no reserve, escrow, daily allowance or signature,
    /// so an action the signers have already signed still goes through.
    function test_audit1_F1_collectDisturbsNothingElse() public {
        fund(1_000 * USD);
        address auction = startSale(saleConfig(400 * USD));
        openTender(defaultParams(100 * USD));
        offerAs(alice, 10 * ONE, 0);
        peal.mint(auction, 50 * ONE);
        MockSealedAuction(auction).settle(300 * USD, 50 * ONE);

        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory signed = quorum(vault.ACTION_SWEEP(), h);
        uint256 nonce = vault.nonce();
        uint256 left = vault.remainingToday(address(fusd));

        vm.prank(attacker);
        vault.collectSealedSale(auction);

        assertEq(vault.nonce(), nonce);
        assertEq(vault.remainingToday(address(fusd)), left);
        assertEq(vault.reservedPay(), 100 * USD);
        assertEq(vault.escrowedBuy(), 10 * ONE);
        assertEq(vault.freeBalance(address(peal)), 50 * ONE, "the seller's escrow is not free");
        assertEq(vault.freeBalance(address(fusd)), 600 * USD);
        vault.sweep(address(fusd), sink, USD, signed);
        assertEq(fusd.balanceOf(sink), USD);
    }

    // ================================================================== finding 2
    // "Potential Overflow in Daily Cap Calculation": _spend.

    /// The largest cap the timelock accepts (2^192 - 1) is accounted to the last unit.
    function test_audit1_F2_capAtUint192Max_isExact() public {
        _setCap(U192);
        fusd.mint(address(vault), type(uint256).max); // more than the cap can ever let out in a day
        sweepNow(address(fusd), sink, U192 - 1);
        assertEq(vault.remainingToday(address(fusd)), 1);
        // a.spent is at its maximum minus one: two more would wrap a uint192.
        _expectOverCap(2, 1);
        // An amount that would overflow a uint256 sum is refused before it is added, not by a panic.
        _expectOverCap(type(uint256).max - (U192 - 1), 1);
        sweepNow(address(fusd), sink, 1);
        assertEq(vault.remainingToday(address(fusd)), 0);
        _expectOverCap(1, 0);
        assertEq(fusd.balanceOf(sink), U192);
    }

    /// For any cap the timelock accepts and any amounts, one day lets out at most the cap.
    function testFuzz_audit1_F2_spentNeverWraps(uint256 cap, uint256[6] memory amounts) public {
        cap = bound(cap, 0, U192);
        _setCap(cap);
        fusd.mint(address(vault), type(uint256).max);
        uint256 out;
        for (uint256 i = 0; i < amounts.length; ++i) {
            uint256 left = cap - out;
            assertEq(vault.remainingToday(address(fusd)), left);
            // Half the time aim near the boundary, otherwise anywhere the vault can pay.
            uint256 amount = amounts[i] % 2 == 0 && left < U192 - 2
                ? bound(amounts[i], 1, left + 2)
                : bound(amounts[i], 1, vault.freeBalance(address(fusd)));
            if (amount > left) {
                _expectOverCap(amount, left);
            } else {
                sweepNow(address(fusd), sink, amount);
                out += amount;
            }
        }
        assertEq(fusd.balanceOf(sink), out);
        assertLe(out, cap);
    }

    /// No cap above 2^192 - 1 can be set on a running vault.
    function testFuzz_audit1_F2_timelockRefusesCapsAboveUint192(uint256 cap) public {
        cap = bound(cap, U192 + 1, type(uint256).max);
        PealTenderV2.Auth memory a;
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadParams.selector, "cap"));
        vault.queue(PealTenderV2.OpKind.SetDailyCap, abi.encode(address(fusd), cap), a);
    }

    /// Lowering the cap below what was already spent today leaves nothing, with no underflow.
    function test_audit1_F2_capLoweredBelowSpent() public {
        fund(1_000 * USD);
        uint256 id = queueOp(PealTenderV2.OpKind.SetDailyCap, abi.encode(address(fusd), 10 * USD));
        vm.warp(block.timestamp + DELAY);
        sweepNow(address(fusd), sink, 600 * USD);
        vault.execute(id);
        assertEq(vault.remainingToday(address(fusd)), 0);
        _expectOverCap(1, 0);
    }

    /// The one place the finding is right about the source: the CONSTRUCTOR takes any
    /// first cap. A vault deployed with a cap of 2^192 or more, on a token with at least
    /// 2^192 base units, would truncate `spent` and forget what left that day. This pins
    /// the behaviour so it is not mistaken for safe; `scripts/v2/deploy.ts` refuses such
    /// a cap, and the next test checks that the deployed vault is nowhere near it.
    function test_audit1_F2_constructorCapAboveUint192_wouldTruncate() public {
        vault = new PealTenderV2(fusd, peal, membersArray(), 2, DELAY, address(factory), type(uint256).max);
        fusd.mint(address(vault), type(uint256).max);
        sweepNow(address(fusd), sink, 1 << 192);
        assertEq(vault.remainingToday(address(fusd)), type(uint256).max, "the spend was forgotten");
        // One unit less is remembered.
        sweepNow(address(fusd), sink, U192);
        assertEq(vault.remainingToday(address(fusd)), type(uint256).max - U192);
    }

    /// The live vault was deployed with a cap of 1 fUSD (10^6 base units), and only the
    /// timelock, bounded above, can change it.
    function test_audit1_F2_deployedCapFitsUint192() public view {
        string memory json = vm.readFile("deployments/qorechain-diana-v2.json");
        assertEq(vm.parseJsonUint(json, ".payDailyCap"), 1_000_000);
    }

    // ================================================================== finding 3
    // "Potential Reentrancy in External Calls": the DELEGATECALLs to TenderBook.

    /// Both tokens call back on every movement; the seller re-enters all 13 state-changing
    /// functions each time it gets control, through offer, claim, tender settlement,
    /// deposit, sweep, startSealedSale, cancelSealedSale and collectSealedSale. Every one
    /// is refused by the guard, and the round pays exactly what it pays without the attack.
    function test_audit1_F3_tokenHooksCannotReenter() public {
        (uint256 cleanPaid, uint256 cleanSold) = _hookRound(false);
        (uint256 paid, uint256 sold) = _hookRound(true);
        assertEq(paid, cleanPaid, "the attack changes no payment");
        assertEq(sold, cleanSold, "the attack changes no allocation");
    }

    /// A native sweep hands control to the recipient while the vault is mid-call.
    function test_audit1_F3_nativeSweepCannotReenter() public {
        Reenterer r = new Reenterer(vault);
        r.arm(true);
        uint256 id = queueOp(PealTenderV2.OpKind.SetDailyCap, abi.encode(address(0), 2 ether));
        uint256 big = queueOp(PealTenderV2.OpKind.Sweep, abi.encode(address(0), address(r), 3 ether));
        vm.warp(block.timestamp + DELAY);
        vault.execute(id);
        vm.deal(address(vault), 5 ether);
        sweepNow(address(0), address(r), 1 ether);
        vault.execute(big);
        assertEq(address(r).balance, 4 ether);
        assertEq(r.controlGained(), 2);
        _assertAllRefused(r);
    }

    /// The library holds no state and takes no direct calls: each state-changing function
    /// reverts unless it runs by DELEGATECALL.
    function test_audit1_F3_libraryRefusesDirectCalls() public {
        TenderBook.OpenParams memory p = defaultParams(USD);
        bytes[5] memory calls = [
            abi.encodeWithSelector(TenderBook.open.selector, uint256(0), p),
            abi.encodeWithSelector(TenderBook.cancel.selector, uint256(0)),
            abi.encodeWithSelector(TenderBook.settle.selector, uint256(0), uint8(18)),
            abi.encodeWithSelector(TenderBook.offer.selector, uint256(0), address(peal), ONE, uint16(0)),
            abi.encodeWithSelector(
                TenderBook.claim.selector, uint256(0), address(fusd), address(peal), uint8(18), uint256(1), uint32(0)
            )
        ];
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool ok, bytes memory ret) = address(TenderBook).call(calls[i]);
            assertFalse(ok);
            assertEq(ret.length, 0, "refused by the call protection, before any of its code");
        }
        // The control: the same `open`, run by DELEGATECALL on this test's own storage, works.
        (bool done,) = address(TenderBook)
            .delegatecall(abi.encodeWithSelector(TenderBook.open.selector, uint256(keccak256("audit1.book")), p));
        assertTrue(done);
    }

    // ================================================================== finding 4
    // "Unbounded Loop in Sale List Management": _saleList.

    /// The list has no loop: with a billion sales behind it, starting, reading, collecting
    /// and cancelling a sale and sweeping cost the same gas as with one.
    function test_audit1_F4_costDoesNotGrowWithTheList() public {
        fund(1_000 * USD);
        address first = startSale(saleConfig(10 * USD));
        assertEq(vault.saleAt(0), first);
        _saleGas(); // first use of each slot (balances, the day's allowance) costs more
        uint256[6] memory few = _saleGas();
        _std.target(address(vault)).sig("saleCount()").checked_write(uint256(1_000_000_000));
        assertEq(vault.saleCount(), 1_000_000_000);
        uint256[6] memory many = _saleGas();
        for (uint256 i = 0; i < few.length; ++i) {
            assertApproxEqAbs(many[i], few[i], 5_000, "gas must not depend on the list's length");
        }
        // A sale from the start of the list is still collected.
        MockSealedAuction(first).fail();
        vault.collectSealedSale(first);
    }

    /// Nobody outside the quorum can add to the list.
    function test_audit1_F4_onlyTheQuorumGrowsTheList() public {
        fund(1_000 * USD);
        ISealedAuction.Config memory c = saleConfig(10 * USD);
        PealTenderV2.Auth memory one = authBy(_one(s[0]), vault.ACTION_START_SALE(), saleArgs(c), soon());
        vm.prank(s[0]);
        vm.expectRevert();
        vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", one);

        // An auction made directly at the factory, or naming the vault as issuer, is not listed.
        fusd.mint(attacker, USD);
        c = saleConfig(USD);
        vm.startPrank(attacker);
        fusd.approve(address(factory), USD);
        vm.expectRevert(bytes("NotIssuer"));
        factory.createAuction(c, "Buyback 1", "vault sells fUSD for PEAL-T");
        c.issuer = attacker;
        factory.createAuction(c, "Buyback 1", "vault sells fUSD for PEAL-T");
        vm.stopPrank();
        assertEq(vault.saleCount(), 0);
    }

    // ================================================================== finding 5
    // "ERC-1363 Support" (informational).

    /// ERC-1363 tokens work through plain ERC-20 calls; their call-backs are not accepted,
    /// so nothing can be credited, offered or spent through one.
    function test_audit1_F5_erc1363TokenWorksAsPlainErc20() public {
        Token1363 t = new Token1363();
        vault = new PealTenderV2(fusd, t, membersArray(), 2, DELAY, address(factory), CAP);
        fund(1_000 * USD);
        openTender(defaultParams(100 * USD));
        t.mint(alice, 20 * ONE);

        vm.startPrank(alice);
        bytes memory refused = abi.encodeWithSelector(ERC1363Utils.ERC1363InvalidReceiver.selector, address(vault));
        vm.expectRevert(refused);
        t.transferAndCall(address(vault), ONE);
        vm.expectRevert(refused);
        t.transferAndCall(address(vault), ONE, abi.encode(uint256(ONE), uint16(0)));
        vm.expectRevert(abi.encodeWithSelector(ERC1363Utils.ERC1363InvalidSpender.selector, address(vault)));
        t.approveAndCall(address(vault), ONE);
        assertEq(t.balanceOf(address(vault)), 0);

        t.approve(address(vault), 10 * ONE);
        vault.offer(10 * ONE, 0);
        vm.stopPrank();
        assertEq(vault.escrowedBuy(), 10 * ONE);

        vm.warp(block.timestamp + 1 days);
        vault.settle();
        (uint256 sold, uint256 paid,) = vault.claim(1, 0);
        assertEq(sold, 10 * ONE);
        assertEq(paid, 10 * USD);
    }

    /// The ERC-1363 helpers the flattened file shows come with OpenZeppelin's SafeERC20.
    /// The vault never calls them, so the compiler leaves them out of both contracts.
    function test_audit1_F5_noErc1363CodeInTheContracts() public view {
        bytes4[3] memory selectors = [
            bytes4(keccak256("transferAndCall(address,uint256,bytes)")),
            bytes4(keccak256("transferFromAndCall(address,address,uint256,bytes)")),
            bytes4(keccak256("approveAndCall(address,uint256,bytes)"))
        ];
        for (uint256 i = 0; i < selectors.length; ++i) {
            assertFalse(_contains(address(vault).code, selectors[i]));
            assertFalse(_contains(address(TenderBook).code, selectors[i]));
        }
        // The control: the ERC-20 call they do make is found the same way.
        assertTrue(_contains(address(TenderBook).code, bytes4(keccak256("transferFrom(address,address,uint256)"))));
    }

    // ================================================================== helpers

    function _setCap(uint256 cap) private {
        uint256 id = queueOp(PealTenderV2.OpKind.SetDailyCap, abi.encode(address(fusd), cap));
        vm.warp(block.timestamp + DELAY);
        vault.execute(id);
        assertEq(vault.dailyCap(address(fusd)), cap);
    }

    function _expectOverCap(uint256 amount, uint256 left) private {
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), sink, amount)));
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(fusd), amount, left));
        vault.sweep(address(fusd), sink, amount, a);
    }

    function _one(address x) private pure returns (address[] memory w) {
        w = new address[](1);
        w[0] = x;
    }

    /// A deposit, a tender round, two sweeps and two sealed sales on tokens that call back,
    /// with or without the attack. Returns what the seller was paid and sold.
    function _hookRound(bool attack) private returns (uint256 paid, uint256 sold) {
        hookPay = new HookERC20("PAY", 6);
        hookBuy = new HookERC20("BUY", 18);
        vault = new PealTenderV2(hookPay, hookBuy, membersArray(), 2, DELAY, address(factory), CAP);
        seller = new Reenterer(vault);
        hookPay.setHook(address(seller));
        hookBuy.setHook(address(seller));
        hookPay.mint(address(vault), 990 * USD);
        hookPay.mint(alice, 10 * USD);
        hookBuy.mint(address(seller), 60 * ONE);
        vm.prank(alice);
        hookPay.approve(address(vault), 10 * USD);

        seller.arm(attack);
        vault.deposit(alice, 10 * USD, quorum(vault.ACTION_DEPOSIT(), keccak256(abi.encode(alice, 10 * USD))));
        (paid, sold) = _hookTender();
        sweepNow(address(hookPay), sink, USD);
        uint256 q = queueOp(PealTenderV2.OpKind.Sweep, abi.encode(address(hookPay), sink, USD));
        vm.warp(block.timestamp + DELAY);
        vault.execute(q);
        _hookSales(attack);

        assertEq(vault.reservedPay(), 0);
        assertEq(vault.escrowedBuy(), 0);
        assertEq(hookPay.balanceOf(address(seller)), paid);
        assertEq(hookBuy.balanceOf(address(seller)), 60 * ONE - sold);
        assertEq(hookPay.balanceOf(address(vault)), 1_000 * USD - paid - 6 * USD);
        assertEq(hookBuy.balanceOf(address(vault)), sold + 5 * ONE);
        if (attack) {
            assertGe(seller.controlGained(), 20);
            _assertAllRefused(seller);
        } else {
            assertEq(seller.attempts(), 0);
        }
    }

    function _hookTender() private returns (uint256 paid, uint256 sold) {
        TenderBook.OpenParams memory p = defaultParams(100 * USD);
        openTender(p);
        seller.sell(hookBuy, 40 * ONE, 0);
        seller.sell(hookBuy, 20 * ONE, 9);
        vm.warp(p.endTime);
        vault.settle();
        (uint256 s0, uint256 p0,) = vault.claim(1, 0);
        (uint256 s1, uint256 p1,) = vault.claim(1, 1);
        (paid, sold) = (p0 + p1, s0 + s1);
    }

    function _hookSales(bool attack) private {
        address a1 = _startHookSale(hookPay, hookBuy, 10 * USD);
        seller.setAuction(a1);
        seller.arm(false); // funding the auction is not a vault call
        hookBuy.mint(a1, 5 * ONE);
        MockSealedAuction(a1).settle(4 * USD, 5 * ONE);
        seller.arm(attack);
        vault.collectSealedSale(a1);
        assertEq(vault.getSale(a1).proceeds, 5 * ONE);
        assertEq(vault.getSale(a1).returned, 6 * USD);
        address a2 = _startHookSale(hookPay, hookBuy, 10 * USD);
        seller.setAuction(a2);
        vault.cancelSealedSale(a2, quorum(vault.ACTION_CANCEL_SALE(), keccak256(abi.encode(a2))));
    }

    function _startHookSale(HookERC20 pay, HookERC20 buy, uint256 supply) private returns (address) {
        ISealedAuction.Config memory c = saleConfig(supply);
        c.saleToken = address(pay);
        c.quoteToken = address(buy);
        return startSale(c);
    }

    /// Every attempt was refused by the guard itself.
    function _assertAllRefused(Reenterer r) private view {
        assertEq(r.attempts(), r.controlGained() * 13);
        assertEq(r.refusedByGuard(), r.attempts(), "a re-entered call got past the guard");
    }

    /// Gas of start, saleAt, getSale, collect, start + cancel and sweep at the current length.
    function _saleGas() private returns (uint256[6] memory g) {
        ISealedAuction.Config memory c = saleConfig(10 * USD);
        address a = startSale(c);
        g[0] = vm.lastCallGas().gasTotalUsed;
        uint256 last = vault.saleCount() - 1;
        address listed = vault.saleAt(last);
        g[1] = vm.lastCallGas().gasTotalUsed;
        assertEq(listed, a);
        vault.getSale(a);
        g[2] = vm.lastCallGas().gasTotalUsed;
        MockSealedAuction(a).fail();
        vault.collectSealedSale(a);
        g[3] = vm.lastCallGas().gasTotalUsed;
        address b = startSale(c);
        PealTenderV2.Auth memory auth = quorum(vault.ACTION_CANCEL_SALE(), keccak256(abi.encode(b)));
        vault.cancelSealedSale(b, auth);
        g[4] = vm.lastCallGas().gasTotalUsed;
        sweepNow(address(fusd), sink, USD);
        g[5] = vm.lastCallGas().gasTotalUsed;
    }

    function _contains(bytes memory code, bytes4 sel) private pure returns (bool) {
        for (uint256 i = 0; i + 4 <= code.length; ++i) {
            if (code[i] == sel[0] && code[i + 1] == sel[1] && code[i + 2] == sel[2] && code[i + 3] == sel[3]) {
                return true;
            }
        }
        return false;
    }
}
