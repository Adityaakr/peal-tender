// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TenderClearing} from "../src/TenderClearing.sol";

/// The clearing rule's test vectors and properties, ported from Peal.
contract TenderClearingTest is Test {
    uint8 constant DEC = 18;
    uint256 constant ONE = 1e18;
    uint256 constant FLOOR = 1e6; // 1.00 in a 6-decimal payment token
    uint256 constant STEP = 1e5; // 0.10

    function _clear(uint256[] memory supply, uint256 budget) internal pure returns (TenderClearing.Result memory) {
        return TenderClearing.findClearing(supply, budget, FLOOR, STEP, DEC);
    }

    function test_undersubscribed_allFillAtHighestOfferedTick() public pure {
        uint256[] memory s = new uint256[](5);
        s[0] = 10 * ONE;
        s[2] = 10 * ONE;
        TenderClearing.Result memory r = _clear(s, 1_000e6);
        assertTrue(r.cleared);
        assertEq(r.clearingTick, 2);
        assertEq(r.price, 1.2e6);
        assertEq(r.bought, 20 * ONE);
    }

    function test_budgetRunsOutInsideATick() public pure {
        uint256[] memory s = new uint256[](5);
        s[0] = 10 * ONE;
        s[1] = 20 * ONE;
        s[3] = 50 * ONE;
        TenderClearing.Result memory r = _clear(s, 22e6);
        assertEq(r.clearingTick, 1);
        assertEq(r.price, 1.1e6);
        assertEq(r.bought, 20 * ONE);
        assertEq(TenderClearing.allocationFor(r, 10 * ONE, 0), 10 * ONE);
        assertEq(TenderClearing.allocationFor(r, 20 * ONE, 1), 10 * ONE);
        assertEq(TenderClearing.allocationFor(r, 50 * ONE, 3), 0);
    }

    function test_stopsWhenCheaperSellersBecomeUnaffordable() public pure {
        uint256[] memory s = new uint256[](10);
        s[0] = 100 * ONE;
        s[9] = 1 * ONE;
        TenderClearing.Result memory r = _clear(s, 150e6);
        assertEq(r.clearingTick, 0);
        assertEq(r.price, 1e6);
        assertEq(r.bought, 100 * ONE);
        assertEq(TenderClearing.allocationFor(r, 1 * ONE, 9), 0);
    }

    function test_firstTickOversubscribed() public pure {
        uint256[] memory s = new uint256[](3);
        s[0] = 100 * ONE;
        TenderClearing.Result memory r = _clear(s, 25e6);
        assertEq(r.clearingTick, 0);
        assertEq(r.bought, 25 * ONE);
        assertEq(TenderClearing.allocationFor(r, 40 * ONE, 0), 10 * ONE);
        assertEq(TenderClearing.allocationFor(r, 60 * ONE, 0), 15 * ONE);
    }

    function test_noSupplyFails() public pure {
        assertFalse(_clear(new uint256[](4), 10e6).cleared);
    }

    function test_budgetTooSmallForOneBaseUnitFails() public pure {
        uint256[] memory s = new uint256[](1);
        s[0] = 1;
        assertFalse(TenderClearing.findClearing(s, 1, 2e18 * 1e6, 0, 0).cleared);
    }

    function test_badTickCountReverts() public {
        uint256[] memory s = new uint256[](257);
        vm.expectRevert("TenderClearing: bad tick count");
        this.clearExternal(s, 1);
    }

    function clearExternal(uint256[] memory s, uint256 budget) external pure returns (TenderClearing.Result memory) {
        return _clear(s, budget);
    }

    /// Never pays a seller below their minimum, never fills above the clearing
    /// tick, and the payments never exceed the budget.
    function testFuzz_neverPaysBelowMinimumAndNeverExceedsBudget(
        uint96[8] memory q,
        uint16[8] memory tk,
        uint64 budgetRaw
    ) public pure {
        uint256 numTicks = 12;
        uint256[] memory s = new uint256[](numTicks);
        uint256[8] memory qty;
        uint16[8] memory tick;
        for (uint256 i = 0; i < 8; i++) {
            qty[i] = uint256(q[i]) % (1_000 * ONE);
            tick[i] = uint16(tk[i] % numTicks);
            s[tick[i]] += qty[i];
        }
        uint256 budget = bound(uint256(budgetRaw), 1, 1e15);
        TenderClearing.Result memory r = _clear(s, budget);
        if (!r.cleared) return;

        uint256 totalPaid = 0;
        uint256 totalSold = 0;
        for (uint256 i = 0; i < 8; i++) {
            uint256 a = TenderClearing.allocationFor(r, qty[i], tick[i]);
            assertLe(a, qty[i], "sold more than offered");
            if (a > 0) {
                assertLe(tick[i], r.clearingTick, "filled above the clearing tick");
                assertGe(r.price, TenderClearing.priceAt(FLOOR, STEP, tick[i]), "paid below the minimum");
            }
            totalSold += a;
            totalPaid += TenderClearing.costFloor(a, r.price, DEC);
        }
        assertLe(totalSold, r.bought, "allocations exceed bought");
        assertLe(totalPaid, budget, "payments exceed budget");
        assertLe(TenderClearing.costCeil(r.bought, r.price, DEC), budget, "bought costs more than the budget");
    }

    /// Offers strictly below the clearing tick always fill in full.
    function testFuzz_cheaperOffersFillInFull(uint96[6] memory q, uint64 budgetRaw) public pure {
        uint256[] memory s = new uint256[](6);
        for (uint256 i = 0; i < 6; i++) {
            s[i] = uint256(q[i]) % (1_000 * ONE);
        }
        TenderClearing.Result memory r = _clear(s, bound(uint256(budgetRaw), 1, 1e13));
        if (!r.cleared) return;
        for (uint16 i = 0; i < r.clearingTick; i++) {
            assertEq(TenderClearing.allocationFor(r, s[i], i), s[i]);
        }
    }
}
