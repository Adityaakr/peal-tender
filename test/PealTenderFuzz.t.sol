// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PqAuth} from "qore-pq-kit/PqAuth.sol";
import {PealTender} from "../src/PealTender.sol";
import {TenderTestBase} from "./utils/TenderTestBase.sol";

contract PealTenderFuzzTest is TenderTestBase {
    function setUp() public {
        setUpVault();
    }

    /// Whoever sends it, a sweep without the signer's key never moves funds.
    function testFuzz_sweepWithoutKeyNeverMovesFunds(address sender, address to, uint96 amount, bytes32 seed) public {
        vm.assume(to != address(0) && amount > 0);
        fund(1_000 * USD);
        vm.deal(address(vault), 10 ether);
        bytes memory junk = junkSig(seed);
        address token = uint8(uint256(seed)) % 2 == 0 ? address(fusd) : address(0);
        uint256 amt = bound(amount, 1, token == address(0) ? 10 ether : 1_000 * USD);
        uint256 d = soon();
        vm.prank(sender);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(token, to, amt, d, junk);
        assertEq(fusd.balanceOf(address(vault)), 1_000 * USD);
        assertEq(address(vault).balance, 10 ether);
    }

    /// A valid sweep signature cannot be redirected to another recipient or amount.
    function testFuzz_sweepSignatureCannotBeRedirected(address to2, uint96 amount2) public {
        address to = makeAddr("recipient");
        uint256 amount = 100 * USD;
        vm.assume(to2 != address(0) && (to2 != to || amount2 != amount) && amount2 > 0 && amount2 <= 1_000 * USD);
        fund(1_000 * USD);
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), to, amount)), d);
        vm.expectRevert(PqAuth.PqSignatureInvalid.selector);
        vault.sweep(address(fusd), to2, amount2, d, sig);
    }

    /// End to end through the vault: random offers, a random budget. Every seller
    /// is paid at least their minimum for what they sold, the treasury never pays
    /// more than the budget, and every token is accounted for after all claims.
    function testFuzz_settlementConservesValue(uint64[6] memory q, uint8[6] memory tk, uint64 budgetRaw) public {
        uint256 budget = bound(uint256(budgetRaw), 1 * USD, 500 * USD);
        fund(1_000 * USD);
        PealTender.OpenParams memory p = defaultParams(budget);
        open(p);

        address[6] memory sellers;
        uint256[6] memory qty;
        uint16[6] memory tick;
        uint256 offered = 0;
        for (uint256 i = 0; i < 6; i++) {
            sellers[i] = address(uint160(0x5e11e0 + i));
            qty[i] = bound(uint256(q[i]), p.minQuantity, 300 * ONE);
            tick[i] = uint16(tk[i] % p.numTicks);
            offerAs(sellers[i], qty[i], tick[i]);
            offered += qty[i];
        }
        vm.warp(p.endTime);
        settleNow();
        PealTender.Tender memory t = vault.getTender(1);

        uint256 totalPaid = 0;
        uint256 totalSold = 0;
        for (uint32 i = 0; i < 6; i++) {
            (uint256 sold, uint256 paid, uint256 returned) = vault.claim(1, i);
            assertEq(sold + returned, qty[i], "offer not fully accounted");
            if (sold > 0) {
                uint256 minPrice = p.floorPrice + uint256(tick[i]) * p.tickSize;
                assertGe(t.price, minPrice, "paid below the seller's minimum");
                assertGe(paid * 1e18 + 1e18, sold * minPrice, "payment below minimum (beyond rounding)");
            }
            assertEq(fusd.balanceOf(sellers[i]), paid);
            assertEq(peal.balanceOf(sellers[i]), returned);
            totalPaid += paid;
            totalSold += sold;
        }
        assertLe(totalPaid, budget, "paid more than the budget");
        assertEq(fusd.balanceOf(address(vault)), 1_000 * USD - totalPaid);
        assertEq(peal.balanceOf(address(vault)), totalSold);
        assertEq(vault.reservedPay(), 0, "reservation not released");
        assertEq(vault.escrowedBuy(), 0, "escrow not released");
        assertEq(vault.freeBalance(address(fusd)), 1_000 * USD - totalPaid);
        assertLe(totalSold, offered);
    }
}
