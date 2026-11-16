// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PqAuth} from "pqkit/PqAuth.sol";
import {PqAuthSet} from "pqkit/PqAuthSet.sol";
import {PealTenderV2} from "../../src/PealTenderV2.sol";
import {V2TestBase} from "./V2TestBase.sol";

contract PealTenderV2FuzzTest is V2TestBase {
    address internal sink = makeAddr("sink");

    function setUp() public {
        setUpVault();
    }

    /// A sweep goes through exactly when it fits both the free balance and today's allowance.
    function testFuzz_sweep_succeedsIffWithinFreeAndCap(uint96 funded, uint96 spentBefore, uint96 amount) public {
        uint256 f = bound(funded, 1, 10_000 * USD);
        fund(f);
        uint256 before = bound(spentBefore, 0, f < CAP ? f : CAP);
        if (before > 0) sweepNow(address(fusd), sink, before);
        uint256 a = bound(amount, 1, 20_000 * USD);
        uint256 free = f - before;
        uint256 remaining = CAP - before;

        bytes32 h = keccak256(abi.encode(address(fusd), sink, a));
        PealTenderV2.Auth memory au = quorum(vault.ACTION_SWEEP(), h);
        if (a > free) {
            vm.expectRevert(abi.encodeWithSelector(PealTenderV2.InsufficientFree.selector, address(fusd), a, free));
        } else if (a > remaining) {
            vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(fusd), a, remaining));
        }
        vault.sweep(address(fusd), sink, a, au);
        if (a <= free && a <= remaining) assertEq(fusd.balanceOf(sink), before + a);
    }

    /// A deadline is accepted exactly when now <= deadline <= now + MAX_AUTH_TTL.
    function testFuzz_deadlineWindow(uint256 offset, bool past) public {
        fund(100 * USD);
        uint256 off = bound(offset, 0, 3 days);
        uint256 d = past ? block.timestamp - (off == 0 ? 1 : off) : block.timestamp + off;
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = authBy(two(s[0], s[1]), vault.ACTION_SWEEP(), h, d);
        if (d < block.timestamp) {
            vm.expectRevert(abi.encodeWithSelector(PqAuth.PqExpired.selector, d, block.timestamp));
        } else if (d > block.timestamp + 1 days) {
            vm.expectRevert(abi.encodeWithSelector(PqAuth.PqDeadlineTooFar.selector, d, block.timestamp + 1 days));
        }
        vault.sweep(address(fusd), sink, USD, a);
    }

    /// Shares made for any nonce other than the current one never verify.
    function testFuzz_otherNonceRefused(uint64 nonceSeed) public {
        fund(100 * USD);
        uint256 n = bound(nonceSeed, 1, type(uint64).max);
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        uint256 d = soon();
        PealTenderV2.Auth memory a;
        a.deadline = d;
        a.signers = two(s[0], s[1]);
        a.signatures = new bytes[](2);
        for (uint256 i = 0; i < 2; ++i) {
            a.signatures[i] = pqSign(
                secretOf[a.signers[i]],
                pqMessage(address(vault), a.signers[i], quorumAction(vault.ACTION_SWEEP()), n, d, h)
            );
        }
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), sink, USD, a);
    }

    /// Any argument change after signing (token, recipient, amount) is refused.
    function testFuzz_argumentsBound(address token, address to, uint96 amount) public {
        vm.assume(to != address(0));
        fund(100 * USD);
        uint256 a = bound(amount, 1, 100 * USD);
        vm.assume(token != address(fusd) || to != sink || a != USD);
        PealTenderV2.Auth memory au = quorum(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), sink, USD)));
        vm.expectRevert();
        vault.sweep(token, to, a, au);
        assertEq(vault.nonce(), 0);
    }

    /// Every subset of the members with at least two signers, in order, authorises;
    /// a single share never does.
    function testFuzz_subsets(uint8 mask) public {
        fund(100 * USD);
        uint8 m = mask & 7;
        uint256 count = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
        address[] memory w = new address[](count);
        uint256 k;
        for (uint256 i = 0; i < 3; ++i) {
            if (m & (1 << i) != 0) w[k++] = s[i];
        }
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = authBy(w, vault.ACTION_SWEEP(), h, soon());
        if (count < 2) vm.expectRevert(abi.encodeWithSelector(PqAuthSet.PqSetTooFewSignatures.selector, count, 2));
        vault.sweep(address(fusd), sink, USD, a);
    }

    /// Over random days, the immediate outflow of any one day never exceeds the cap.
    function testFuzz_capPerDay(uint96[8] memory amounts, uint32[8] memory gaps) public {
        fund(100_000 * USD);
        uint256 day = block.timestamp / 1 days;
        uint256 spent;
        for (uint256 i = 0; i < 8; ++i) {
            vm.warp(block.timestamp + bound(gaps[i], 0, 2 days));
            if (block.timestamp / 1 days != day) {
                day = block.timestamp / 1 days;
                spent = 0;
            }
            uint256 a = bound(amounts[i], 1, CAP);
            bytes32 h = keccak256(abi.encode(address(fusd), sink, a));
            PealTenderV2.Auth memory au = quorum(vault.ACTION_SWEEP(), h);
            if (spent + a > CAP) {
                vm.expectRevert(
                    abi.encodeWithSelector(PealTenderV2.OverDailyCap.selector, address(fusd), a, CAP - spent)
                );
                vault.sweep(address(fusd), sink, a, au);
            } else {
                vault.sweep(address(fusd), sink, a, au);
                spent += a;
            }
            assertLe(spent, CAP);
            assertEq(vault.remainingToday(address(fusd)), CAP - spent);
        }
    }

    /// A queued change runs exactly in [eta, eta + EXECUTION_WINDOW].
    function testFuzz_executeWindow(uint32 wait) public {
        uint256 id = queueOp(PealTenderV2.OpKind.SetDelay, abi.encode(uint64(2 hours)));
        uint64 eta = vault.getOp(id).eta;
        uint256 w = bound(wait, 0, 10 days);
        vm.warp(block.timestamp + w);
        if (block.timestamp < eta) {
            vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OpNotReady.selector, id, eta));
        } else if (block.timestamp > uint256(eta) + 7 days) {
            vm.expectRevert(abi.encodeWithSelector(PealTenderV2.OpLapsed.selector, id, uint256(eta) + 7 days));
        }
        vault.execute(id);
    }

    /// Any delay in bounds can be queued; any outside is refused before a signature is checked.
    function testFuzz_delayBounds(uint64 d) public {
        PealTenderV2.Auth memory a =
            quorum(vault.ACTION_QUEUE(), keccak256(abi.encode(PealTenderV2.OpKind.SetDelay, keccak256(abi.encode(d)))));
        if (d < 5 minutes || d > 30 days) vm.expectRevert(abi.encodeWithSelector(PealTenderV2.BadDelay.selector, d));
        vault.queue(PealTenderV2.OpKind.SetDelay, abi.encode(d), a);
    }
}
