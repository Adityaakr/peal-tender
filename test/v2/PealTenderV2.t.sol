// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PqAuth} from "pqkit/PqAuth.sol";
import {PqAuthSet} from "pqkit/PqAuthSet.sol";
import {PealTenderV2} from "../../src/PealTenderV2.sol";
import {TenderBook} from "../../src/TenderBook.sol";
import {ISealedAuction} from "../../src/interfaces/ISealedAuction.sol";
import {MockERC20, FeeOnTransferERC20} from "../utils/MockERC20.sol";
import {MockSealedAuction, MockSealedAuctionFactory} from "./mocks/MockSealedAuction.sol";
import {V2TestBase} from "./V2TestBase.sol";

contract PealTenderV2Test is V2TestBase {
    address internal sink = makeAddr("sink");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        setUpVault();
    }

    // ================================================================== construction

    function test_constructor_setsEverything() public view {
        address[] memory m = vault.members();
        assertEq(m.length, 3);
        assertEq(m[0], s[0]);
        assertEq(m[2], s[2]);
        assertEq(vault.threshold(), 2);
        assertEq(vault.delay(), DELAY);
        assertEq(vault.auctionFactory(), address(factory));
        assertEq(vault.dailyCap(address(fusd)), CAP);
        assertEq(vault.remainingToday(address(fusd)), CAP);
        assertEq(vault.dailyCap(address(0)), 0);
        assertEq(vault.nonce(), 0);
        assertEq(vault.setEpoch(), 0);
        assertTrue(vault.isMember(s[1]));
        assertFalse(vault.isMember(outsider));
    }

    function test_constructor_refusesBadDelay() public {
        address[] memory m = membersArray();
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadDelay.selector, uint64(4 minutes)));
        new PealTenderV2(fusd, peal, m, 2, 4 minutes, address(0), 0);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadDelay.selector, uint64(31 days)));
        new PealTenderV2(fusd, peal, m, 2, 31 days, address(0), 0);
    }

    function test_constructor_refusesBadSet() public {
        address[] memory m = membersArray();
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetBadThreshold.selector, 4, 3));
        new PealTenderV2(fusd, peal, m, 4, DELAY, address(0), 0);
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetBadThreshold.selector, 0, 3));
        new PealTenderV2(fusd, peal, m, 0, DELAY, address(0), 0);
        (m[0], m[1]) = (m[1], m[0]);
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetNotAscending.selector, 1));
        new PealTenderV2(fusd, peal, m, 2, DELAY, address(0), 0);
    }

    function test_constructor_refusesMemberWithoutKey() public {
        address[] memory m = membersArray();
        m[2] = address(uint160(type(uint160).max)); // largest address, no key
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqKeyUnusable.selector, m[2], false, 0, false, 0));
        new PealTenderV2(fusd, peal, m, 2, DELAY, address(0), 0);
    }

    function test_constructor_refusesBadTokens() public {
        address[] memory m = membersArray();
        vm.expectRevert(PealTenderV2.SameToken.selector);
        new PealTenderV2(fusd, fusd, m, 2, DELAY, address(0), 0);
        vm.expectRevert(PealTenderV2.ZeroAddress.selector);
        new PealTenderV2(MockERC20(address(0)), peal, m, 2, DELAY, address(0), 0);
    }

    // ================================================================== quorum checks (on sweep)

    function test_sweep_withTwoOfThree() public {
        fund(100 * USD);
        sweepNow(address(fusd), sink, 40 * USD);
        assertEq(fusd.balanceOf(sink), 40 * USD);
        assertEq(vault.nonce(), 1);
        assertEq(vault.remainingToday(address(fusd)), CAP - 40 * USD);
    }

    function test_sweep_anyTwoMembersWork_andAllThree() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        vault.sweep(address(fusd), sink, USD, authBy(two(s[0], s[2]), vault.ACTION_SWEEP(), h, soon()));
        vault.sweep(address(fusd), sink, USD, authBy(two(s[1], s[2]), vault.ACTION_SWEEP(), h, soon()));
        vault.sweep(address(fusd), sink, USD, authBy(membersArray(), vault.ACTION_SWEEP(), h, soon()));
        assertEq(fusd.balanceOf(sink), 3 * USD);
    }

    function test_sweep_refusesOneSignature() public {
        fund(100 * USD);
        address[] memory one = new address[](1);
        one[0] = s[0];
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = authBy(one, vault.ACTION_SWEEP(), h, soon());
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetTooFewSignatures.selector, 1, 2));
        vault.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_refusesOutsider() public {
        fund(100 * USD);
        address[] memory w = two(s[0], outsider);
        if (outsider < s[0]) w = two(outsider, s[0]);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = authBy(w, vault.ACTION_SWEEP(), h, soon());
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetNotMember.selector, outsider));
        vault.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_refusesSameMemberTwice() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = authBy(two(s[0], s[0]), vault.ACTION_SWEEP(), h, soon());
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetNotAscending.selector, 1));
        vault.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_refusesUnsorted() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = authBy(two(s[1], s[0]), vault.ACTION_SWEEP(), h, soon());
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetNotAscending.selector, 1));
        vault.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_refusesOtherArguments() public {
        fund(100 * USD);
        // Signed for 1 fUSD to sink, used for 50 fUSD to the attacker.
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), sink, USD)));
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), attacker, 50 * USD, a);
    }

    function test_sweep_refusesOtherAction() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_DEPOSIT(), h);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_refusesReplay() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h);
        vault.sweep(address(fusd), sink, USD, a);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_refusesExpiredAndTooFar() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = authBy(two(s[0], s[1]), vault.ACTION_SWEEP(), h, block.timestamp + 10);
        vm.warp(block.timestamp + 11);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqExpired.selector, block.timestamp - 1, block.timestamp));
        vault.sweep(address(fusd), sink, USD, a);

        uint256 far = block.timestamp + 1 days + 1;
        a = authBy(two(s[0], s[1]), vault.ACTION_SWEEP(), h, far);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqDeadlineTooFar.selector, far, block.timestamp + 1 days));
        vault.sweep(address(fusd), sink, USD, a);
    }

    /// A single-member signature (the veto domain) is not a quorum share, even
    /// for the same action and arguments.
    function test_sweep_refusesSingleMemberDomainShares() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a;
        a.deadline = soon();
        a.signers = two(s[0], s[1]);
        a.signatures = new bytes[](2);
        for (uint256 i = 0; i < 2; ++i) {
            a.signatures[i] = pqSign(
                secretOf[a.signers[i]],
                pqMessage(address(vault), a.signers[i], anyAction(vault.ACTION_SWEEP()), 0, a.deadline, h)
            );
        }
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), sink, USD, a);
    }

    /// A plain PqAuth signature (the drill vault's format, no quorum domain) is not a share.
    function test_sweep_refusesPlainPqAuthSignatures() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a;
        a.deadline = soon();
        a.signers = two(s[0], s[1]);
        a.signatures = new bytes[](2);
        for (uint256 i = 0; i < 2; ++i) {
            a.signatures[i] = pqSign(
                secretOf[a.signers[i]], pqMessage(address(vault), a.signers[i], vault.ACTION_SWEEP(), 0, a.deadline, h)
            );
        }
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_refusesSignatureForAnotherVault() public {
        PealTenderV2 other = new PealTenderV2(fusd, peal, membersArray(), 2, DELAY, address(factory), CAP);
        fund(100 * USD);
        fusd.mint(address(other), 100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h); // signed for `vault`
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        other.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_refusesOtherChain() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h);
        vm.chainId(1);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), sink, USD, a);
    }

    /// Being a member's account (holding its classical key) is worth nothing.
    function test_sweep_memberSenderWithJunkFails() public {
        fund(100 * USD);
        PealTenderV2.Auth memory a;
        a.deadline = soon();
        a.signers = two(s[0], s[1]);
        a.signatures = new bytes[](2);
        a.signatures[0] = junkSig("a");
        a.signatures[1] = junkSig("b");
        vm.prank(s[0]);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), s[0], USD, a);
    }

    function test_sweep_refusesBadLengthAndMismatch() public {
        fund(100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h);
        a.signatures[1] = new bytes(100);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqBadSignatureLength.selector, 100));
        vault.sweep(address(fusd), sink, USD, a);

        a = quorum(vault.ACTION_SWEEP(), h);
        address[] memory three = membersArray();
        a.signers = three;
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetLengthMismatch.selector, 3, 2));
        vault.sweep(address(fusd), sink, USD, a);
    }

    /// The precompile switched off (success, empty data) must fail closed.
    function test_sweep_failsClosedWithoutPrecompile() public {
        fund(100 * USD);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), sink, USD)));
        vm.etch(PqAuth.PQC_VERIFY, hex"00"); // STOP: success with empty return data
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqPrecompileUnavailable.selector, PqAuth.PQC_VERIFY));
        vault.sweep(address(fusd), sink, USD, a);
    }

    function test_sweep_onlyFreeBalance() public {
        fund(100 * USD);
        openTender(defaultParams(80 * USD));
        bytes32 h = keccak256(abi.encode(address(fusd), sink, 21 * USD));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h);
        vm.expectRevert(
            abi.encodeWithSelector(PealTenderV2.InsufficientFree.selector, address(fusd), 21 * USD, 20 * USD)
        );
        vault.sweep(address(fusd), sink, 21 * USD, a);
    }

    function test_sweep_native() public {
        vm.deal(address(this), 5 ether);
        (bool ok,) = address(vault).call{value: 5 ether}("");
        assertTrue(ok);
        // Native has no daily allowance yet: an immediate sweep is refused.
        bytes32 h = keccak256(abi.encode(address(0), sink, 1 ether));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(0), 1 ether, 0));
        vault.sweep(address(0), sink, 1 ether, a);

        // Give native a cap through the timelock, then sweep.
        uint256 id = queueOp(PealTenderV2.OpKind.SetDailyCap, abi.encode(address(0), 2 ether));
        vm.warp(block.timestamp + DELAY);
        vault.execute(id);
        sweepNow(address(0), sink, 1 ether);
        assertEq(sink.balance, 1 ether);
    }

    // ================================================================== daily cap

    function test_cap_refusesAboveRemaining_andResetsNextDay() public {
        fund(5_000 * USD);
        sweepNow(address(fusd), sink, 600 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, 500 * USD));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(fusd), 500 * USD, 400 * USD));
        vault.sweep(address(fusd), sink, 500 * USD, a);

        // The refusal consumed no nonce; tomorrow the allowance is whole again.
        vm.warp((block.timestamp / 1 days + 1) * 1 days);
        assertEq(vault.remainingToday(address(fusd)), CAP);
        a = quorum(vault.ACTION_SWEEP(), h);
        vault.sweep(address(fusd), sink, 500 * USD, a);
        assertEq(vault.remainingToday(address(fusd)), 500 * USD);
    }

    function test_cap_tenderBudgetCounts() public {
        fund(5_000 * USD);
        openTender(defaultParams(900 * USD));
        assertEq(vault.remainingToday(address(fusd)), 100 * USD);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, 101 * USD));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(fusd), 101 * USD, 100 * USD));
        vault.sweep(address(fusd), sink, 101 * USD, a);
    }

    function test_cap_tenderBudgetAboveCapRefused() public {
        fund(5_000 * USD);
        TenderBook.OpenParams memory p = defaultParams(CAP + 1);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_OPEN_TENDER(), keccak256(abi.encode(p)));
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(fusd), CAP + 1, CAP));
        vault.openTender(p, a);
    }

    function test_cap_saleSupplyCounts() public {
        fund(5_000 * USD);
        startSale(saleConfig(700 * USD));
        assertEq(vault.remainingToday(address(fusd)), 300 * USD);
        ISealedAuction.Config memory c = saleConfig(301 * USD);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_START_SALE(), saleArgs(c));
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(fusd), 301 * USD, 300 * USD));
        vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", a);
    }

    function test_cap_otherTokenHasNoAllowanceUntilSet() public {
        peal.mint(address(vault), 10 * ONE);
        bytes32 h = keccak256(abi.encode(address(peal), sink, ONE));
        PealTenderV2.Auth memory a = quorum(vault.ACTION_SWEEP(), h);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(peal), ONE, 0));
        vault.sweep(address(peal), sink, ONE, a);
    }

    // ================================================================== timelock

    function test_timelock_bigSweep_queueWaitExecute() public {
        fund(5_000 * USD);
        bytes memory data = abi.encode(address(fusd), sink, 3_000 * USD);
        uint256 id = queueOp(PealTenderV2.OpKind.Sweep, data);
        assertEq(id, 1);
        PealTenderV2.Op memory op = vault.getOp(id);
        assertEq(uint8(op.state), uint8(PealTenderV2.OpState.Queued));
        assertEq(op.eta, block.timestamp + DELAY);
        assertEq(op.data, data);

        vm.warp(block.timestamp + DELAY - 1);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OpNotReady.selector, id, op.eta));
        vault.execute(id);

        vm.warp(block.timestamp + 1);
        vm.prank(attacker); // anyone may execute; it only does what the quorum queued
        vault.execute(id);
        assertEq(fusd.balanceOf(sink), 3_000 * USD);
        // A timelocked sweep does not draw on the daily allowance.
        assertEq(vault.remainingToday(address(fusd)), CAP);

        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OpNotQueued.selector, id, PealTenderV2.OpState.Executed));
        vault.execute(id);
    }

    function test_timelock_sweepStillNeedsFreeBalance() public {
        fund(5_000 * USD);
        uint256 id = queueOp(PealTenderV2.OpKind.Sweep, abi.encode(address(fusd), sink, 3_000 * USD));
        openTender(defaultParams(900 * USD)); // 4,100 free left... then sweep 3,000 still fits
        bytes32 h = keccak256(abi.encode(address(fusd), sink, 100 * USD));
        vault.sweep(address(fusd), sink, 100 * USD, quorum(vault.ACTION_SWEEP(), h));
        // free = 5,000 - 900 - 100 = 4,000 >= 3,000
        vm.warp(block.timestamp + DELAY);
        // Drain the free balance below 3,000 with a second queued sweep first.
        uint256 id2 = queueOp(PealTenderV2.OpKind.Sweep, abi.encode(address(fusd), sink, 2_000 * USD));
        vm.warp(block.timestamp + DELAY);
        vault.execute(id2);
        vm.expectRevert(
            abi.encodeWithSelector(PealTenderV2.InsufficientFree.selector, address(fusd), 3_000 * USD, 2_000 * USD)
        );
        vault.execute(id);
        // It stays queued and can run once funds are free again.
        fund(1_000 * USD);
        vault.execute(id);
    }

    function test_timelock_vetoByAnyOneMember() public {
        fund(5_000 * USD);
        uint256 id = queueOp(PealTenderV2.OpKind.Sweep, abi.encode(address(fusd), attacker, 5_000 * USD));
        uint256 d = soon();
        bytes memory sig = vetoSig(s[2], id, d);
        vm.prank(attacker); // anyone may relay the veto
        vault.veto(id, d, s[2], sig);
        assertEq(uint8(vault.getOp(id).state), uint8(PealTenderV2.OpState.Vetoed));
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OpNotQueued.selector, id, PealTenderV2.OpState.Vetoed));
        vault.execute(id);
        assertEq(fusd.balanceOf(attacker), 0);
    }

    function test_timelock_vetoRefusals() public {
        uint256 id = queueOp(PealTenderV2.OpKind.SetDelay, abi.encode(uint64(2 hours)));
        uint256 d = soon();
        // an outsider's signature
        bytes memory sig = vetoSig(outsider, id, d);
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetNotMember.selector, outsider));
        vault.veto(id, d, outsider, sig);
        // a member's veto signed for another op
        sig = vetoSig(s[0], id + 1, d);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.veto(id, d, s[0], sig);
        // a quorum-domain share is not a veto
        sig = share(s[0], vault.ACTION_VETO(), keccak256(abi.encode(id)), d);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.veto(id, d, s[0], sig);
        // no such op
        sig = vetoSig(s[0], 99, d);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.NoSuchOp.selector, 99));
        vault.veto(99, d, s[0], sig);
        // junk
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.veto(id, d, s[0], junkSig("veto"));
    }

    function test_timelock_lapses() public {
        uint256 id = queueOp(PealTenderV2.OpKind.SetDelay, abi.encode(uint64(2 hours)));
        uint256 eta = vault.getOp(id).eta;
        vm.warp(eta + 7 days + 1);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OpLapsed.selector, id, eta + 7 days));
        vault.execute(id);
    }

    function test_timelock_queueRefusesOtherData() public {
        bytes memory signedData = abi.encode(address(fusd), sink, 3_000 * USD);
        bytes memory sentData = abi.encode(address(fusd), attacker, 3_000 * USD);
        PealTenderV2.Auth memory a =
            quorum(vault.ACTION_QUEUE(), keccak256(abi.encode(PealTenderV2.OpKind.Sweep, keccak256(signedData))));
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.queue(PealTenderV2.OpKind.Sweep, sentData, a);
        // and another kind with the same data
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.queue(PealTenderV2.OpKind.SetDailyCap, abi.encode(address(fusd), uint256(1)), a);
    }

    function test_timelock_queueShapeChecks() public {
        PealTenderV2.Auth memory a; // never reached
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadDelay.selector, uint64(1)));
        vault.queue(PealTenderV2.OpKind.SetDelay, abi.encode(uint64(1)), a);
        vm.expectRevert(PealTenderV2.ZeroAddress.selector);
        vault.queue(PealTenderV2.OpKind.Sweep, abi.encode(address(fusd), address(0), uint256(1)), a);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadQuantity.selector, 0));
        vault.queue(PealTenderV2.OpKind.Sweep, abi.encode(address(fusd), sink, uint256(0)), a);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadParams.selector, "cap"));
        vault.queue(PealTenderV2.OpKind.SetDailyCap, abi.encode(address(fusd), uint256(type(uint192).max) + 1), a);
        address[] memory m = membersArray();
        (m[0], m[1]) = (m[1], m[0]);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadParams.selector, "members order"));
        vault.queue(PealTenderV2.OpKind.SetSigners, abi.encode(m, uint256(2)), a);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadParams.selector, "threshold"));
        vault.queue(PealTenderV2.OpKind.SetSigners, abi.encode(membersArray(), uint256(0)), a);
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadParams.selector, "members"));
        vault.queue(PealTenderV2.OpKind.SetSigners, abi.encode(new address[](0), uint256(1)), a);
    }

    function test_timelock_rotateSigner_voidsOldMemberAndOtherOps() public {
        fund(5_000 * USD);
        // Replace s[2] with the outsider.
        address[] memory next = new address[](3);
        next[0] = s[0];
        next[1] = s[1];
        next[2] = outsider;
        _sort(next);
        uint256 rot = queueOp(PealTenderV2.OpKind.SetSigners, abi.encode(next, uint256(2)));
        uint256 other = queueOp(PealTenderV2.OpKind.Sweep, abi.encode(address(fusd), sink, 2_000 * USD));
        vm.warp(block.timestamp + DELAY);
        vault.execute(rot);
        assertEq(vault.setEpoch(), 1);
        assertTrue(vault.isMember(outsider));
        assertFalse(vault.isMember(s[2]));

        // The other queued change died with the old set.
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OpVoid.selector, other, 0, 1));
        vault.execute(other);

        // The removed member cannot sign any more; the new one can.
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        address[] memory old = two(s[1], s[2]);
        PealTenderV2.Auth memory a = authBy(old, vault.ACTION_SWEEP(), h, soon());
        vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetNotMember.selector, s[2]));
        vault.sweep(address(fusd), sink, USD, a);
        address[] memory w = two(s[0], outsider);
        _sort(w);
        vault.sweep(address(fusd), sink, USD, authBy(w, vault.ACTION_SWEEP(), h, soon()));
        assertEq(fusd.balanceOf(sink), USD);
    }

    function test_timelock_rotateChecksKeysAtExecution() public {
        address fresh = address(uint160(type(uint160).max));
        registerPqKey(fresh, keccak256("fresh"));
        address[] memory next = new address[](3);
        next[0] = s[0];
        next[1] = s[1];
        next[2] = fresh;
        uint256 rot = queueOp(PealTenderV2.OpKind.SetSigners, abi.encode(next, uint256(2)));
        // The new member's key loses possession before execution.
        pqcKeyStatusMock.set(fresh, true, PqAuth.ALGORITHM_ML_DSA_87, new bytes(2592), false);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PqKeyUnusable.selector, fresh, true, 1, false, 2592));
        vault.execute(rot);
        assertEq(uint8(vault.getOp(rot).state), uint8(PealTenderV2.OpState.Queued));
    }

    function test_timelock_setDelayCapFactory() public {
        uint256 a = queueOp(PealTenderV2.OpKind.SetDelay, abi.encode(uint64(2 days)));
        uint256 b = queueOp(PealTenderV2.OpKind.SetDailyCap, abi.encode(address(fusd), 10 * USD));
        uint256 c = queueOp(PealTenderV2.OpKind.SetAuctionFactory, abi.encode(address(0)));
        vm.warp(block.timestamp + DELAY);
        vault.execute(a);
        vault.execute(b);
        vault.execute(c);
        assertEq(vault.delay(), 2 days);
        assertEq(vault.dailyCap(address(fusd)), 10 * USD);
        assertEq(vault.auctionFactory(), address(0));
        // The new delay applies to changes queued from now on.
        uint256 d = queueOp(PealTenderV2.OpKind.SetDelay, abi.encode(uint64(1 hours)));
        assertEq(vault.getOp(d).eta, block.timestamp + 2 days);
        // Sales are off.
        fund(100 * USD);
        ISealedAuction.Config memory cfg = saleConfig(10 * USD);
        PealTenderV2.Auth memory au = quorum(vault.ACTION_START_SALE(), saleArgs(cfg));
        vm.expectRevert(PealTenderV2.SalesDisabled.selector);
        vault.startSealedSale(cfg, "Buyback 1", "vault sells fUSD for PEAL-T", au);
    }

    function test_timelock_vetoConsumesNonce() public {
        uint256 id = queueOp(PealTenderV2.OpKind.SetDelay, abi.encode(uint64(2 hours)));
        uint256 n = vault.nonce();
        uint256 d = soon();
        vault.veto(id, d, s[1], vetoSig(s[1], id, d));
        assertEq(vault.nonce(), n + 1);
    }

    // ================================================================== deposit

    function test_deposit_pullsApproval() public {
        fusd.mint(alice, 50 * USD);
        vm.prank(alice);
        fusd.approve(address(vault), 50 * USD);
        // Nobody can spend alice's approval without the quorum.
        PealTenderV2.Auth memory junk;
        junk.deadline = soon();
        junk.signers = two(s[0], s[1]);
        junk.signatures = new bytes[](2);
        junk.signatures[0] = junkSig("x");
        junk.signatures[1] = junkSig("y");
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.deposit(alice, 50 * USD, junk);

        vault.deposit(alice, 50 * USD, quorum(vault.ACTION_DEPOSIT(), keccak256(abi.encode(alice, 50 * USD))));
        assertEq(fusd.balanceOf(address(vault)), 50 * USD);
    }

    // ================================================================== tender

    function test_tender_fullRound_permissionlessSettle() public {
        fund(1_000 * USD);
        TenderBook.OpenParams memory p = defaultParams(100 * USD);
        uint256 id = openTender(p);
        assertEq(vault.openTenderId(), id);
        assertEq(vault.reservedPay(), 100 * USD);

        // 40 at 1.00 (tick 0), 60 at 1.20 (tick 2), 50 at 1.50 (tick 5)
        offerAs(alice, 40 * ONE, 0);
        offerAs(bob, 60 * ONE, 2);
        offerAs(makeAddr("carol"), 50 * ONE, 5);

        vm.expectRevert(abi.encodeWithSelector(TenderBook.TooEarly.selector, p.endTime));
        vault.settle();
        vm.warp(p.endTime);
        vm.prank(attacker); // anyone may settle
        vault.settle();

        TenderBook.Tender memory t = vault.getTender(id);
        assertEq(uint8(t.state), uint8(TenderBook.State.Settled));
        // At tick 2 (1.20): 100 tokens would cost 120 > 100. At tick 0: 40 cost 40 <= 100, then
        // tick 2 costs 1.2 * 40 = 48 for cheaper and 48 + 72 = 120 > 100 with tick 2: the budget
        // runs out inside tick 2: max qty = 100 / 1.2 = 83.33, fill at tick 2 = 43.33.
        assertEq(t.clearingTick, 2);
        assertEq(t.price, 1_200_000);

        (uint256 soldA, uint256 paidA,) = vault.claim(id, 0);
        assertEq(soldA, 40 * ONE);
        assertEq(paidA, 48 * USD);
        (uint256 soldB, uint256 paidB, uint256 retB) = vault.claim(id, 1);
        assertEq(soldB + retB, 60 * ONE);
        assertLe(paidA + paidB, 100 * USD);
        (uint256 soldC,, uint256 retC) = vault.claim(id, 2);
        assertEq(soldC, 0);
        assertEq(retC, 50 * ONE);
        assertEq(vault.reservedPay(), 0);
        assertEq(vault.escrowedBuy(), 0);
        assertEq(fusd.balanceOf(address(vault)), 1_000 * USD - paidA - paidB);
        assertEq(peal.balanceOf(address(vault)), soldA + soldB);
    }

    function test_tender_refusals() public {
        fund(1_000 * USD);
        TenderBook.OpenParams memory p = defaultParams(100 * USD);
        p.numTicks = 0;
        PealTenderV2.Auth memory a = quorum(vault.ACTION_OPEN_TENDER(), keccak256(abi.encode(p)));
        vm.expectRevert(abi.encodeWithSelector(TenderBook.BadParams.selector, "numTicks"));
        vault.openTender(p, a);

        p = defaultParams(2_000 * USD);
        a = quorum(vault.ACTION_OPEN_TENDER(), keccak256(abi.encode(p)));
        vm.expectRevert(
            abi.encodeWithSelector(PealTenderV2.InsufficientFree.selector, address(fusd), 2_000 * USD, 1_000 * USD)
        );
        vault.openTender(p, a);

        openTender(defaultParams(100 * USD));
        p = defaultParams(100 * USD);
        a = quorum(vault.ACTION_OPEN_TENDER(), keccak256(abi.encode(p)));
        vm.expectRevert(abi.encodeWithSelector(TenderBook.TenderAlreadyOpen.selector, 1));
        vault.openTender(p, a);
    }

    function test_tender_cancelBeforeEndOnly() public {
        fund(1_000 * USD);
        TenderBook.OpenParams memory p = defaultParams(100 * USD);
        uint256 id = openTender(p);
        offerAs(alice, 10 * ONE, 0);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_CANCEL_TENDER(), keccak256(abi.encode(id)));
        vault.cancelTender(a);
        assertEq(uint8(vault.getTender(id).state), uint8(TenderBook.State.Failed));
        assertEq(vault.reservedPay(), 0);
        (, uint256 paid, uint256 ret) = vault.claim(id, 0);
        assertEq(paid, 0);
        assertEq(ret, 10 * ONE);

        id = openTender(defaultParams(100 * USD));
        vm.warp(block.timestamp + 1 days);
        a = quorum(vault.ACTION_CANCEL_TENDER(), keccak256(abi.encode(id)));
        vm.expectRevert(abi.encodeWithSelector(TenderBook.TooLate.selector, block.timestamp));
        vault.cancelTender(a);
    }

    function test_tender_noOffersFailsAndReleasesBudget() public {
        fund(1_000 * USD);
        TenderBook.OpenParams memory p = defaultParams(100 * USD);
        uint256 id = openTender(p);
        vm.warp(p.endTime);
        vault.settle();
        assertEq(uint8(vault.getTender(id).state), uint8(TenderBook.State.Failed));
        assertEq(vault.freeBalance(address(fusd)), 1_000 * USD);
    }

    function test_tender_feeOnTransferOfferRefused() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20();
        PealTenderV2 v = new PealTenderV2(fusd, fee, membersArray(), 2, DELAY, address(0), CAP);
        vault = v;
        fund(1_000 * USD);
        openTender(defaultParams(100 * USD));
        fee.mint(alice, 10 * ONE);
        vm.startPrank(alice);
        fee.approve(address(v), 10 * ONE);
        vm.expectRevert(abi.encodeWithSelector(TenderBook.FeeOnTransfer.selector, 10 * ONE, 99 * ONE / 10));
        v.offer(10 * ONE, 0);
        vm.stopPrank();
    }

    // ================================================================== sealed sale

    function test_sale_start_settle_collect() public {
        fund(1_000 * USD);
        ISealedAuction.Config memory c = saleConfig(400 * USD);
        address auction = startSale(c);
        assertTrue(factory.isAuction(auction));
        assertEq(fusd.balanceOf(auction), 400 * USD);
        assertEq(fusd.balanceOf(address(vault)), 600 * USD);
        assertEq(fusd.allowance(address(vault), address(factory)), 0);
        assertEq(vault.saleCount(), 1);
        assertEq(vault.saleAt(0), auction);
        PealTenderV2.Sale memory sale = vault.getSale(auction);
        assertEq(uint8(sale.state), uint8(PealTenderV2.SaleState.Active));
        assertEq(sale.supply, 400 * USD);

        vm.expectRevert(
            abi.encodeWithSelector(PealTenderV2.SaleNotFinished.selector, auction, ISealedAuction.State.CommitOpen)
        );
        vault.collectSealedSale(auction);

        // The auction sells 300 fUSD for 2,000 PEAL-T.
        peal.mint(auction, 2_000 * ONE);
        MockSealedAuction(auction).settle(300 * USD, 2_000 * ONE);
        vm.prank(attacker); // anyone may collect; the auction pays only the vault
        vault.collectSealedSale(auction);
        assertEq(peal.balanceOf(address(vault)), 2_000 * ONE);
        assertEq(fusd.balanceOf(address(vault)), 700 * USD);
        sale = vault.getSale(auction);
        assertEq(uint8(sale.state), uint8(PealTenderV2.SaleState.Collected));
        assertEq(sale.proceeds, 2_000 * ONE);
        assertEq(sale.returned, 100 * USD);

        vm.expectRevert(
            abi.encodeWithSelector(PealTenderV2.SaleNotActive.selector, auction, PealTenderV2.SaleState.Collected)
        );
        vault.collectSealedSale(auction);
    }

    function test_sale_collectAfterSomeoneClaimedDirectly() public {
        fund(1_000 * USD);
        address auction = startSale(saleConfig(400 * USD));
        peal.mint(auction, 100 * ONE);
        MockSealedAuction(auction).settle(400 * USD, 100 * ONE);
        MockSealedAuction(auction).claimProceeds(); // a stranger calls the auction itself
        assertEq(peal.balanceOf(address(vault)), 100 * ONE);
        vault.collectSealedSale(auction);
        assertEq(uint8(vault.getSale(auction).state), uint8(PealTenderV2.SaleState.Collected));
    }

    function test_sale_collectAfterFailReturnsSupply() public {
        fund(1_000 * USD);
        address auction = startSale(saleConfig(400 * USD));
        MockSealedAuction(auction).fail();
        vault.collectSealedSale(auction);
        assertEq(fusd.balanceOf(address(vault)), 1_000 * USD);
        assertEq(vault.getSale(auction).returned, 400 * USD);
    }

    function test_sale_cancel() public {
        fund(1_000 * USD);
        address auction = startSale(saleConfig(400 * USD));
        vault.cancelSealedSale(auction, quorum(vault.ACTION_CANCEL_SALE(), keccak256(abi.encode(auction))));
        assertEq(fusd.balanceOf(address(vault)), 1_000 * USD);
        assertEq(uint8(vault.getSale(auction).state), uint8(PealTenderV2.SaleState.Cancelled));

        address a2 = startSale(saleConfig(100 * USD));
        MockSealedAuction(a2).setBids(true);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_CANCEL_SALE(), keccak256(abi.encode(a2)));
        vm.expectRevert(bytes("BadState"));
        vault.cancelSealedSale(a2, a);
        // the refused cancel changed nothing
        assertEq(uint8(vault.getSale(a2).state), uint8(PealTenderV2.SaleState.Active));
    }

    function test_sale_cancelNeedsQuorum() public {
        fund(1_000 * USD);
        address auction = startSale(saleConfig(400 * USD));
        // The vault is the issuer, so only the vault can cancel; and the vault needs a quorum.
        vm.prank(attacker);
        vm.expectRevert(bytes("NotIssuer"));
        MockSealedAuction(auction).cancel();
        PealTenderV2.Auth memory a = quorum(vault.ACTION_CANCEL_SALE(), keccak256(abi.encode(address(0xBAD))));
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.cancelSealedSale(auction, a);
    }

    function test_sale_configChecks() public {
        fund(1_000 * USD);
        _expectSaleRefused(_withIssuer(saleConfig(10 * USD), attacker), "issuer");
        ISealedAuction.Config memory c = saleConfig(10 * USD);
        c.saleToken = address(peal);
        _expectSaleRefused(c, "saleToken");
        c = saleConfig(10 * USD);
        c.quoteToken = address(fusd);
        _expectSaleRefused(c, "quoteToken");
        c = saleConfig(10 * USD);
        c.protocolFeeBps = 100;
        c.feeRecipient = attacker;
        _expectSaleRefused(c, "fee");
        c = saleConfig(0);
        _expectSaleRefused(c, "supply");

        c = saleConfig(1_001 * USD);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_START_SALE(), saleArgs(c));
        vm.expectRevert(
            abi.encodeWithSelector(PealTenderV2.InsufficientFree.selector, address(fusd), 1_001 * USD, 1_000 * USD)
        );
        vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", a);
    }

    function test_sale_signatureBindsNameDetailsAndFactory() public {
        fund(1_000 * USD);
        ISealedAuction.Config memory c = saleConfig(10 * USD);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_START_SALE(), saleArgs(c));
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.startSealedSale(c, "Buyback 2", "vault sells fUSD for PEAL-T", a);

        // Signed while factory A is set; executed after the factory became B.
        MockSealedAuctionFactory other = new MockSealedAuctionFactory();
        uint256 id = queueOp(PealTenderV2.OpKind.SetAuctionFactory, abi.encode(address(other)));
        vm.warp(block.timestamp + DELAY);
        a = quorum(vault.ACTION_START_SALE(), saleArgs(c)); // binds factory A (still current)
        vault.execute(id);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", a);
    }

    function test_sale_factoryThatPullsLessIsRefused() public {
        fund(1_000 * USD);
        factory.setMode(MockSealedAuctionFactory.Mode.PullsLess);
        ISealedAuction.Config memory c = saleConfig(10 * USD);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_START_SALE(), saleArgs(c));
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.SaleFundingMismatch.selector, 10 * USD, 10 * USD - 1));
        vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", a);
    }

    function test_sale_unlistedAuctionIsRefused() public {
        fund(1_000 * USD);
        factory.setMode(MockSealedAuctionFactory.Mode.Unregistered);
        ISealedAuction.Config memory c = saleConfig(10 * USD);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_START_SALE(), saleArgs(c));
        vm.expectRevert(); // NotAnAuction(<new address>)
        vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", a);
    }

    function test_sale_reentryIsRefused() public {
        fund(1_000 * USD);
        factory.setMode(MockSealedAuctionFactory.Mode.Reenter);
        factory.setReenter(address(vault), abi.encodeCall(PealTenderV2.settle, ()));
        ISealedAuction.Config memory c = saleConfig(10 * USD);
        PealTenderV2.Auth memory a = quorum(vault.ACTION_START_SALE(), saleArgs(c));
        vm.expectRevert(); // ReentrancyGuardReentrantCall
        vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", a);
    }

    // ================================================================== views

    function test_views_messagesMatchIndependentBuild() public view {
        bytes32 h = keccak256("args");
        uint256 d = 1_800_003_600;
        assertEq(
            vault.quorumMessage(s[1], vault.ACTION_SWEEP(), h, d),
            pqMessage(address(vault), s[1], quorumAction(vault.ACTION_SWEEP()), 0, d, h)
        );
        assertEq(
            vault.vetoMessage(s[2], 7, d),
            pqMessage(address(vault), s[2], anyAction(vault.ACTION_VETO()), 0, d, keccak256(abi.encode(uint256(7))))
        );
        assertEq(vault.quorumMessage(s[1], vault.ACTION_SWEEP(), h, d).length, 256);
    }

    // ================================================================== helpers

    function _withIssuer(ISealedAuction.Config memory c, address issuer)
        internal
        pure
        returns (ISealedAuction.Config memory)
    {
        c.issuer = issuer;
        return c;
    }

    function _expectSaleRefused(ISealedAuction.Config memory c, string memory what) internal {
        PealTenderV2.Auth memory a; // the shape check comes before any signature check
        vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadSaleConfig.selector, what));
        vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", a);
    }

    function _sort(address[] memory a) internal pure {
        for (uint256 i = 0; i < a.length; ++i) {
            for (uint256 j = i + 1; j < a.length; ++j) {
                if (a[j] < a[i]) (a[i], a[j]) = (a[j], a[i]);
            }
        }
    }
}
