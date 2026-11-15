// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PqAuth} from "qore-pq-kit/PqAuth.sol";
import {PealTender} from "../src/PealTender.sol";
import {TenderTestBase} from "./utils/TenderTestBase.sol";
import {FeeOnTransferERC20, MockERC20} from "./utils/MockERC20.sol";

contract PealTenderTest is TenderTestBase {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        setUpVault();
    }

    // ------------------------------------------------------------------ construction

    function test_constructorRefusesSignerWithoutKey() public {
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqKeyUnusable.selector, attacker, false, 0, false, 0));
        new PealTender(fusd, peal, attacker);
    }

    function test_constructorRefusesSameToken() public {
        vm.expectRevert(PealTender.SameToken.selector);
        new PealTender(fusd, fusd, treasury);
    }

    function test_constructorState() public view {
        assertEq(vault.signer(), treasury);
        assertEq(vault.nonce(), 0);
        assertEq(address(vault.payToken()), address(fusd));
        assertEq(address(vault.buyToken()), address(peal));
        assertEq(vault.buyDecimals(), 18);
    }

    // ------------------------------------------------------------------ deposit

    function test_depositPullsWithSignature() public {
        fusd.mint(alice, 100 * USD);
        vm.prank(alice);
        fusd.approve(address(vault), 100 * USD);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_DEPOSIT(), keccak256(abi.encode(alice, 100 * USD)), d);
        vm.prank(attacker); // any relayer
        vault.deposit(alice, 100 * USD, d, sig);
        assertEq(fusd.balanceOf(address(vault)), 100 * USD);
        assertEq(vault.nonce(), 1);
    }

    function test_depositCannotSpendAnApprovalWithoutSignature() public {
        fusd.mint(alice, 100 * USD);
        vm.prank(alice);
        fusd.approve(address(vault), 100 * USD);
        bytes memory junk = junkSig("deposit");
        uint256 d = soon();
        vm.prank(attacker);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.deposit(alice, 100 * USD, d, junk);
        assertEq(fusd.balanceOf(alice), 100 * USD);
    }

    function test_depositRefusesFeeOnTransfer() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20();
        PealTender v = new PealTender(IERC20(address(fee)), peal, treasury);
        fee.mint(alice, 100 ether);
        vm.prank(alice);
        fee.approve(address(v), 100 ether);
        uint256 d = soon();
        bytes memory sig = pqSign(
            TREASURY_SECRET,
            pqMessage(address(v), treasury, v.ACTION_DEPOSIT(), 0, d, keccak256(abi.encode(alice, 100 ether)))
        );
        vm.expectRevert(abi.encodeWithSelector(PealTender.FeeOnTransfer.selector, 100 ether, 99 ether));
        v.deposit(alice, 100 ether, d, sig);
    }

    // ------------------------------------------------------------------ open

    function test_openReservesBudget() public {
        fund(1_000 * USD);
        uint256 id = open(defaultParams(400 * USD));
        assertEq(id, 1);
        assertEq(vault.openTenderId(), 1);
        assertEq(vault.reservedPay(), 400 * USD);
        assertEq(vault.freeBalance(address(fusd)), 600 * USD);
        PealTender.Tender memory t = vault.getTender(1);
        assertEq(uint8(t.state), uint8(PealTender.State.Open));
        assertEq(t.budget, 400 * USD);
    }

    function test_openRefusesBudgetAboveFree() public {
        fund(100 * USD);
        PealTender.OpenParams memory p = defaultParams(101 * USD);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_OPEN(), keccak256(abi.encode(p)), d);
        vm.expectRevert(abi.encodeWithSelector(PealTender.InsufficientFree.selector, address(fusd), 101 * USD, 100 * USD));
        vault.openTender(p, d, sig);
    }

    function test_openRefusesSecondTender() public {
        fund(1_000 * USD);
        open(defaultParams(100 * USD));
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_OPEN(), keccak256(abi.encode(p)), d);
        vm.expectRevert(abi.encodeWithSelector(PealTender.TenderAlreadyOpen.selector, 1));
        vault.openTender(p, d, sig);
    }

    function test_openRefusesBadParams() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        p.numTicks = 0;
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_OPEN(), keccak256(abi.encode(p)), d);
        vm.expectRevert(abi.encodeWithSelector(PealTender.BadParams.selector, "numTicks"));
        vault.openTender(p, d, sig);

        p = defaultParams(100 * USD);
        p.endTime = uint64(block.timestamp + 31 days);
        sig = sign(vault.ACTION_OPEN(), keccak256(abi.encode(p)), d);
        vm.expectRevert(abi.encodeWithSelector(PealTender.BadParams.selector, "endTime"));
        vault.openTender(p, d, sig);
    }

    function test_openSignatureBindsEveryParameter() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_OPEN(), keccak256(abi.encode(p)), d);
        p.floorPrice = 1; // the attacker wants to buy dust at a different ladder
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.openTender(p, d, sig);
    }

    // ------------------------------------------------------------------ offers

    function test_offerEscrowsTokens() public {
        fund(1_000 * USD);
        open(defaultParams(100 * USD));
        uint32 oid = offerAs(alice, 10 * ONE, 2);
        assertEq(oid, 0);
        assertEq(peal.balanceOf(address(vault)), 10 * ONE);
        assertEq(vault.escrowedBuy(), 10 * ONE);
        assertEq(vault.supplyByTick(1, 2), 10 * ONE);
        assertEq(vault.freeBalance(address(peal)), 0);
    }

    function test_offerChecks() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        p.maxOffers = 1;
        open(p);
        peal.mint(alice, 100 * ONE);
        vm.startPrank(alice);
        peal.approve(address(vault), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(PealTender.BadTick.selector, 10, 10));
        vault.offer(ONE, 10);
        vm.expectRevert(abi.encodeWithSelector(PealTender.BadQuantity.selector, 1));
        vault.offer(1, 0);
        vault.offer(ONE, 0);
        vm.expectRevert(abi.encodeWithSelector(PealTender.TooManyOffers.selector, 1));
        vault.offer(ONE, 0);
        vm.stopPrank();
    }

    function test_offerAfterEndRefused() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        open(p);
        vm.warp(p.endTime);
        peal.mint(alice, ONE);
        vm.startPrank(alice);
        peal.approve(address(vault), ONE);
        vm.expectRevert(abi.encodeWithSelector(PealTender.TooLate.selector, p.endTime));
        vault.offer(ONE, 0);
        vm.stopPrank();
    }

    function test_offerWithoutOpenTenderRefused() public {
        vm.expectRevert(PealTender.NoOpenTender.selector);
        vault.offer(ONE, 0);
    }

    // ------------------------------------------------------------------ settlement (Peal's vectors)

    /// The budget runs out inside a tick: cheaper offers fill, the marginal tick
    /// shares pro-rata, dearer offers get nothing. Ladder 1.00, 1.10, 1.20, 1.30...
    function test_settleBudgetRunsOutInsideATick() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(22 * USD);
        open(p);
        uint32 a = offerAs(alice, 10 * ONE, 0); // 1.00
        uint32 b = offerAs(bob, 20 * ONE, 1); // 1.10
        uint32 c = offerAs(carol, 50 * ONE, 3); // 1.30
        vm.warp(p.endTime);
        settleNow();

        PealTender.Tender memory t = vault.getTender(1);
        assertEq(uint8(t.state), uint8(PealTender.State.Settled));
        assertEq(t.clearingTick, 1);
        assertEq(t.price, 1.1e6);
        assertEq(t.bought, 20 * ONE);
        assertEq(vault.openTenderId(), 0);

        (uint256 soldA, uint256 paidA, uint256 retA) = vault.claim(1, a);
        assertEq(soldA, 10 * ONE);
        assertEq(paidA, 11 * USD);
        assertEq(retA, 0);
        (uint256 soldB, uint256 paidB, uint256 retB) = vault.claim(1, b);
        assertEq(soldB, 10 * ONE);
        assertEq(paidB, 11 * USD);
        assertEq(retB, 10 * ONE);
        (uint256 soldC, uint256 paidC, uint256 retC) = vault.claim(1, c);
        assertEq(soldC + paidC, 0);
        assertEq(retC, 50 * ONE);

        assertEq(fusd.balanceOf(alice), 11 * USD);
        assertEq(fusd.balanceOf(bob), 11 * USD);
        assertEq(peal.balanceOf(bob), 10 * ONE);
        assertEq(peal.balanceOf(carol), 50 * ONE);
        // The treasury spent exactly 22 and owns the 20 bought tokens.
        assertEq(fusd.balanceOf(address(vault)), 978 * USD);
        assertEq(vault.reservedPay(), 0);
        assertEq(vault.escrowedBuy(), 0);
        assertEq(vault.freeBalance(address(peal)), 20 * ONE);
    }

    function test_settleUndersubscribedAllFillAtHighestOfferedTick() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(1_000 * USD);
        open(p);
        offerAs(alice, 10 * ONE, 0);
        offerAs(bob, 10 * ONE, 2);
        vm.warp(p.endTime);
        settleNow();
        PealTender.Tender memory t = vault.getTender(1);
        assertEq(t.clearingTick, 2);
        assertEq(t.price, 1.2e6);
        assertEq(t.bought, 20 * ONE);
        // Only what can be owed stays reserved: 20 * 1.20 = 24.
        assertEq(vault.reservedPay(), 24 * USD);
        assertEq(vault.freeBalance(address(fusd)), 976 * USD);
    }

    function test_settleBeforeEndRefused() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        open(p);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_SETTLE(), keccak256(abi.encode(uint256(1))), d);
        vm.expectRevert(abi.encodeWithSelector(PealTender.TooEarly.selector, p.endTime));
        vault.settle(d, sig);
    }

    function test_settleWithoutOffersFails() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        open(p);
        vm.warp(p.endTime);
        settleNow();
        assertEq(uint8(vault.getTender(1).state), uint8(PealTender.State.Failed));
        assertEq(vault.reservedPay(), 0);
        assertEq(vault.freeBalance(address(fusd)), 1_000 * USD);
    }

    function test_settleNeedsSignatureEvenAfterEnd() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        open(p);
        offerAs(alice, 10 * ONE, 0);
        vm.warp(p.endTime);
        bytes memory junk = junkSig("settle");
        uint256 d = soon();
        vm.prank(treasury); // even the signer account's own classical key
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.settle(d, junk);
    }

    // ------------------------------------------------------------------ cancel and expire

    function test_cancelRefundsSellers() public {
        fund(1_000 * USD);
        open(defaultParams(100 * USD));
        uint32 a = offerAs(alice, 10 * ONE, 0);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_CANCEL(), keccak256(abi.encode(uint256(1))), d);
        vault.cancelTender(d, sig);
        assertEq(vault.reservedPay(), 0);
        (,, uint256 returned) = vault.claim(1, a);
        assertEq(returned, 10 * ONE);
        assertEq(peal.balanceOf(alice), 10 * ONE);
    }

    function test_expireOnlyAfterGrace() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        open(p);
        uint32 a = offerAs(alice, 10 * ONE, 0);
        vm.warp(p.endTime + vault.SETTLE_GRACE() - 1);
        vm.expectRevert(abi.encodeWithSelector(PealTender.TooEarly.selector, uint256(p.endTime) + 3 days));
        vault.expire();
        vm.warp(p.endTime + vault.SETTLE_GRACE());
        vm.prank(attacker);
        vault.expire();
        // Nothing left the vault but the seller's own tokens, to the seller.
        vm.prank(attacker);
        vault.claim(1, a);
        assertEq(peal.balanceOf(alice), 10 * ONE);
        assertEq(peal.balanceOf(attacker), 0);
        assertEq(fusd.balanceOf(address(vault)), 1_000 * USD);
    }

    function test_claimTwiceRefused() public {
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(100 * USD);
        open(p);
        uint32 a = offerAs(alice, 10 * ONE, 0);
        vm.warp(p.endTime);
        settleNow();
        vault.claim(1, a);
        vm.expectRevert(abi.encodeWithSelector(PealTender.AlreadyClaimed.selector, 1, a));
        vault.claim(1, a);
    }

    function test_claimBeforeSettlementRefused() public {
        fund(1_000 * USD);
        open(defaultParams(100 * USD));
        uint32 a = offerAs(alice, 10 * ONE, 0);
        vm.expectRevert(abi.encodeWithSelector(PealTender.NotClaimable.selector, 1, PealTender.State.Open));
        vault.claim(1, a);
    }

    // ------------------------------------------------------------------ sweep

    function test_sweepFreeFunds() public {
        fund(1_000 * USD);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), bob, 300 * USD)), d);
        vault.sweep(address(fusd), bob, 300 * USD, d, sig);
        assertEq(fusd.balanceOf(bob), 300 * USD);
    }

    function test_sweepCannotTouchReservedBudgetOrEscrow() public {
        fund(1_000 * USD);
        open(defaultParams(800 * USD));
        offerAs(alice, 10 * ONE, 0);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), bob, 201 * USD)), d);
        vm.expectRevert(abi.encodeWithSelector(PealTender.InsufficientFree.selector, address(fusd), 201 * USD, 200 * USD));
        vault.sweep(address(fusd), bob, 201 * USD, d, sig);
        sig = sign(vault.ACTION_SWEEP(), keccak256(abi.encode(address(peal), bob, ONE)), d);
        vm.expectRevert(abi.encodeWithSelector(PealTender.InsufficientFree.selector, address(peal), ONE, 0));
        vault.sweep(address(peal), bob, ONE, d, sig);
    }

    function test_sweepNative() public {
        vm.deal(address(this), 5 ether);
        (bool ok,) = address(vault).call{value: 5 ether}("");
        assertTrue(ok);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_SWEEP(), keccak256(abi.encode(address(0), bob, 2 ether)), d);
        vault.sweep(address(0), bob, 2 ether, d, sig);
        assertEq(bob.balance, 2 ether);
        assertEq(address(vault).balance, 3 ether);
    }

    function test_sweepSignatureBindsRecipient() public {
        fund(1_000 * USD);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), bob, 300 * USD)), d);
        vm.prank(attacker);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), attacker, 300 * USD, d, sig);
    }

    // ------------------------------------------------------------------ rotate

    function test_rotateSigner() public {
        bytes32 newSecret = keccak256("new treasury key");
        addSigner(bob, newSecret);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_ROTATE(), keccak256(abi.encode(bob)), d);
        vault.rotateSigner(bob, d, sig);
        assertEq(vault.signer(), bob);
        // The old key no longer works; the new one does.
        fund(10 * USD);
        bytes memory oldSig = pqSign(
            TREASURY_SECRET,
            pqMessage(address(vault), treasury, vault.ACTION_SWEEP(), 1, d, keccak256(abi.encode(address(fusd), carol, USD)))
        );
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), carol, USD, d, oldSig);
        bytes memory newSig = sign(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), carol, USD)), d);
        vault.sweep(address(fusd), carol, USD, d, newSig);
        assertEq(fusd.balanceOf(carol), USD);
    }

    function test_rotateToAccountWithoutKeyRefused() public {
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_ROTATE(), keccak256(abi.encode(attacker)), d);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqKeyUnusable.selector, attacker, false, 0, false, 0));
        vault.rotateSigner(attacker, d, sig);
    }

    // ------------------------------------------------------------------ the Q-Day Drill, in miniature

    /// The attacker holds the signer account's classical key, so it can send
    /// transactions AS the signer account. Every treasury action still fails, and
    /// nothing leaves the vault.
    function test_drill_classicalKeyHolderCannotMoveAnything() public {
        fund(1_000 * USD);
        vm.deal(address(vault), 10 ether);
        open(defaultParams(500 * USD));
        offerAs(alice, 10 * ONE, 0);

        bytes memory junk = junkSig("drill");
        uint256 d = soon();
        PealTender.OpenParams memory p = defaultParams(1);

        vm.startPrank(treasury);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), treasury, 500 * USD, d, junk);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(0), treasury, 10 ether, d, junk);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.rotateSigner(treasury, d, junk);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.cancelTender(d, junk);
        vm.expectRevert(abi.encodeWithSelector(PealTender.TenderAlreadyOpen.selector, 1));
        vault.openTender(p, d, junk);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqBadSignatureLength.selector, 0));
        vault.sweep(address(fusd), treasury, 1, d, "");
        vm.stopPrank();

        assertEq(fusd.balanceOf(address(vault)), 1_000 * USD);
        assertEq(address(vault).balance, 10 ether);
        assertEq(peal.balanceOf(address(vault)), 10 * ONE);
        assertEq(vault.nonce(), 1);
    }

    function test_authMessageViewMatchesLibrary() public view {
        bytes memory m = vault.authMessage(vault.ACTION_SWEEP(), bytes32(uint256(7)), 123);
        assertEq(
            keccak256(m),
            keccak256(pqMessage(address(vault), treasury, vault.ACTION_SWEEP(), 0, 123, bytes32(uint256(7))))
        );
    }

    function test_actionIdsAreTheNamedHashes() public view {
        assertEq(vault.ACTION_DEPOSIT(), keccak256("PealTender.deposit"));
        assertEq(vault.ACTION_OPEN(), keccak256("PealTender.openTender"));
        assertEq(vault.ACTION_CANCEL(), keccak256("PealTender.cancelTender"));
        assertEq(vault.ACTION_SETTLE(), keccak256("PealTender.settle"));
        assertEq(vault.ACTION_SWEEP(), keccak256("PealTender.sweep"));
        assertEq(vault.ACTION_ROTATE(), keccak256("PealTender.rotateSigner"));
    }

    // silence an unused-import warning for MockERC20 in some solc versions
    function _unused() internal pure returns (MockERC20) {
        return MockERC20(address(0));
    }
}
