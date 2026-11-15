// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title TenderClearing
/// @notice The clearing rule of a buyback tender, as a pure library.
///
/// Ported from Peal (the author's earlier project, started July 2026), where the
/// same rule clears sealed buyback tenders. Re-written for this repository; the
/// rule and its test cases are Peal's.
///
/// A tender is a uniform-price auction turned around. One buyer (the treasury)
/// holds a budget in a payment token. Sellers each offer a quantity of the token
/// being bought back at a minimum price, expressed as a tick on a price ladder:
/// `price(tick) = floorPrice + tick * tickSize` payment base units per whole token.
/// Everyone who sells is paid the same price.
///
/// The price climbs from the lowest tick that holds supply:
///   - if the budget pays every offer at or below this tick at this tick's price,
///     they all fill and the price may climb further;
///   - if it pays every cheaper offer but not all of this tick, the budget is spent
///     here: cheaper offers fill in full, offers at this tick share pro-rata;
///   - if it cannot even pay the cheaper offers at this tick's price, the price
///     stays at the previous tick and the rest of the budget is not spent.
///
/// So a seller is never paid below their minimum, offers are taken cheapest first,
/// and the sum of all payments never exceeds the budget. The scan is over ticks,
/// never over offers, so posting many offers cannot make settlement dearer.
library TenderClearing {
    uint256 internal constant MAX_TICKS = 256;

    struct Result {
        bool cleared;
        uint16 clearingTick;
        uint256 price;
        uint256 bought;
        uint256 supplyAtClearingTick;
        uint256 fillAtClearingTick;
    }

    function priceAt(uint256 floorPrice, uint256 tickSize, uint256 tick) internal pure returns (uint256) {
        return floorPrice + tick * tickSize;
    }

    /// @notice Payment for `quantity` base units at `price`, rounded down (what a seller is paid).
    function costFloor(uint256 quantity, uint256 price, uint8 decimals) internal pure returns (uint256) {
        return Math.mulDiv(quantity, price, 10 ** decimals, Math.Rounding.Floor);
    }

    /// @notice Payment for `quantity` base units at `price`, rounded up (what the budget must cover).
    function costCeil(uint256 quantity, uint256 price, uint8 decimals) internal pure returns (uint256) {
        return Math.mulDiv(quantity, price, 10 ** decimals, Math.Rounding.Ceil);
    }

    function findClearing(
        uint256[] memory supplyByTick,
        uint256 budget,
        uint256 floorPrice,
        uint256 tickSize,
        uint8 decimals
    ) internal pure returns (Result memory r) {
        uint256 numTicks = supplyByTick.length;
        require(numTicks > 0 && numTicks <= MAX_TICKS, "TenderClearing: bad tick count");
        require(budget > 0, "TenderClearing: zero budget");
        require(floorPrice > 0, "TenderClearing: zero floor price");

        uint256 cumulative = 0;
        bool any = false;
        uint256 last = 0;

        for (uint256 t = 0; t < numTicks; ++t) {
            uint256 s = supplyByTick[t];
            if (s == 0) continue;
            uint256 p = priceAt(floorPrice, tickSize, t);

            // Every cheaper seller would be paid this price too.
            if (costCeil(cumulative, p, decimals) > budget) break;

            if (costCeil(cumulative + s, p, decimals) <= budget) {
                cumulative += s;
                any = true;
                last = t;
                continue;
            }

            // The budget runs out inside this tick.
            uint256 maxQty = Math.mulDiv(budget, 10 ** decimals, p);
            uint256 fill = maxQty - cumulative;
            if (fill == 0) break;

            r.cleared = true;
            // Safe: t < numTicks <= 256.
            // forge-lint: disable-next-line(unsafe-typecast)
            r.clearingTick = uint16(t);
            r.price = p;
            r.bought = cumulative + fill;
            r.supplyAtClearingTick = s;
            r.fillAtClearingTick = fill;
            return r;
        }

        if (!any) return r; // nothing affordable: the tender fails and sellers are refunded

        r.cleared = true;
        // forge-lint: disable-next-line(unsafe-typecast)
        r.clearingTick = uint16(last);
        r.price = priceAt(floorPrice, tickSize, last);
        r.bought = cumulative;
        r.supplyAtClearingTick = supplyByTick[last];
        r.fillAtClearingTick = supplyByTick[last];
    }

    /// @notice What one offer sells. Order-independent: computed from the offer and
    ///         totals fixed at settlement, never from a running counter, and floored,
    ///         so the allocations at the clearing tick never sum above its fill.
    function allocationFor(Result memory r, uint256 quantity, uint16 tick) internal pure returns (uint256) {
        if (!r.cleared) return 0;
        if (tick > r.clearingTick) return 0;
        if (tick < r.clearingTick) return quantity;
        if (r.fillAtClearingTick >= r.supplyAtClearingTick) return quantity;
        return Math.mulDiv(quantity, r.fillAtClearingTick, r.supplyAtClearingTick);
    }
}
