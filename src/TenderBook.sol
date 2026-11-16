// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TenderClearing} from "./TenderClearing.sol";

/// @title TenderBook
/// @notice The open buyback tender of `PealTenderV2`: holders offer the bought-back
///         token at a minimum price, and the tender clears at one price
///         (`TenderClearing`, ported from Peal).
///
/// A linked library with external functions. The vault calls it with DELEGATECALL,
/// so its code runs on the vault's own storage (`Book`) and token balances, with
/// the vault's `msg.sender`. It is a library only to keep the vault under the
/// 24,576-byte contract size limit; it holds no funds and no state of its own,
/// and Solidity refuses direct calls to its state-changing functions.
///
/// The vault decides who may call what: `open` and `cancel` only after a quorum
/// of post-quantum signatures, `settle`, `offer` and `claim` for anyone.
/// The rules are the drill vault's (`PealTender`), unchanged.
library TenderBook {
    using SafeERC20 for IERC20;

    uint256 internal constant MAX_DURATION = 30 days;
    uint32 internal constant MAX_OFFERS = 200;

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

    struct Book {
        uint256 tenderCount;
        uint256 openTenderId; // 0 when no tender is open
        uint256 reservedPay; // payment owed to the open tender's budget or to unclaimed sellers
        uint256 escrowedBuy; // sellers' tokens held for unclaimed offers
        mapping(uint256 tenderId => Tender) tenders;
        mapping(uint256 tenderId => mapping(uint32 offerId => Offer)) offers;
        mapping(uint256 tenderId => mapping(uint256 tick => uint256)) supplyByTick;
    }

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
    event OfferPlaced(
        uint256 indexed tenderId, uint32 indexed offerId, address indexed seller, uint256 quantity, uint16 tick
    );
    event TenderSettled(uint256 indexed tenderId, uint16 clearingTick, uint256 price, uint256 bought, uint256 reserved);
    event TenderFailed(uint256 indexed tenderId, string reason);
    event Claimed(
        uint256 indexed tenderId,
        uint32 indexed offerId,
        address indexed seller,
        uint256 sold,
        uint256 paid,
        uint256 returned
    );

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

    // ------------------------------------------------------------------ gated by the vault

    /// @notice Refuse parameters that could not make a tender (no state change).
    function checkOpen(Book storage b, OpenParams calldata p) external view {
        if (b.openTenderId != 0) revert TenderAlreadyOpen(b.openTenderId);
        if (p.budget == 0) revert BadParams("budget");
        if (p.floorPrice == 0) revert BadParams("floorPrice");
        if (p.numTicks == 0 || p.numTicks > TenderClearing.MAX_TICKS) revert BadParams("numTicks");
        if (p.numTicks > 1 && p.tickSize == 0) revert BadParams("tickSize");
        if (p.endTime <= block.timestamp || p.endTime > block.timestamp + MAX_DURATION) revert BadParams("endTime");
        if (p.maxOffers == 0 || p.maxOffers > MAX_OFFERS) revert BadParams("maxOffers");
        if (p.minQuantity == 0) revert BadParams("minQuantity");
        // The dearest tick must be computable.
        TenderClearing.priceAt(p.floorPrice, p.tickSize, p.numTicks - 1);
    }

    /// @notice Open a tender, reserving its budget. Call `checkOpen` first.
    function open(Book storage b, OpenParams calldata p) external returns (uint256 tenderId) {
        tenderId = ++b.tenderCount;
        Tender storage t = b.tenders[tenderId];
        t.state = State.Open;
        t.numTicks = p.numTicks;
        t.maxOffers = p.maxOffers;
        t.endTime = p.endTime;
        t.budget = p.budget;
        t.floorPrice = p.floorPrice;
        t.tickSize = p.tickSize;
        t.minQuantity = p.minQuantity;
        t.reserved = p.budget;
        b.reservedPay += p.budget;
        b.openTenderId = tenderId;
        emit TenderOpened(
            tenderId, p.budget, p.floorPrice, p.tickSize, p.numTicks, p.endTime, p.maxOffers, p.minQuantity
        );
    }

    /// @notice The open tender's id, if it may still be cancelled (before its end).
    function checkCancel(Book storage b) external view returns (uint256 id) {
        id = b.openTenderId;
        if (id == 0) revert NoOpenTender();
        uint64 end = b.tenders[id].endTime;
        if (block.timestamp >= end) revert TooLate(end);
    }

    /// @notice Fail the open tender; sellers reclaim their tokens. Call `checkCancel` first.
    function cancel(Book storage b) external {
        uint256 id = b.openTenderId;
        _fail(b, id, b.tenders[id], "cancelled");
    }

    // ------------------------------------------------------------------ anyone

    /// @notice Settle the open tender at one clearing price, after its end.
    function settle(Book storage b, uint8 buyDecimals) external {
        uint256 id = b.openTenderId;
        if (id == 0) revert NoOpenTender();
        Tender storage t = b.tenders[id];
        if (block.timestamp < t.endTime) revert TooEarly(t.endTime);

        uint256[] memory supply = new uint256[](t.numTicks);
        for (uint256 i = 0; i < t.numTicks; ++i) {
            supply[i] = b.supplyByTick[id][i];
        }
        TenderClearing.Result memory r =
            TenderClearing.findClearing(supply, t.budget, t.floorPrice, t.tickSize, buyDecimals);
        if (!r.cleared) {
            _fail(b, id, t, "no offer within budget");
            return;
        }

        // What the sellers can be owed at most: payments are floored per offer and
        // allocations never sum above `bought`, so this bounds their sum.
        uint256 maxOwed = TenderClearing.costCeil(r.bought, r.price, buyDecimals);
        if (maxOwed > t.budget) maxOwed = t.budget;
        b.reservedPay -= t.budget - maxOwed;
        t.reserved = maxOwed;

        t.state = State.Settled;
        t.clearingTick = r.clearingTick;
        t.price = r.price;
        t.bought = r.bought;
        t.supplyAtClearingTick = r.supplyAtClearingTick;
        t.fillAtClearingTick = r.fillAtClearingTick;
        b.openTenderId = 0;
        emit TenderSettled(id, r.clearingTick, r.price, r.bought, maxOwed);
    }

    /// @notice Offer `quantity` of the bought-back token at a minimum price tick,
    ///         pulled from `msg.sender` (the holder) and escrowed.
    function offer(Book storage b, IERC20 buyToken, uint256 quantity, uint16 tick) external returns (uint32 offerId) {
        uint256 id = b.openTenderId;
        if (id == 0) revert NoOpenTender();
        Tender storage t = b.tenders[id];
        if (block.timestamp >= t.endTime) revert TooLate(t.endTime);
        if (tick >= t.numTicks) revert BadTick(tick, t.numTicks);
        if (quantity < t.minQuantity) revert BadQuantity(quantity);
        if (t.offerCount >= t.maxOffers) revert TooManyOffers(t.maxOffers);

        uint256 before = buyToken.balanceOf(address(this));
        buyToken.safeTransferFrom(msg.sender, address(this), quantity);
        uint256 received = buyToken.balanceOf(address(this)) - before;
        if (received != quantity) revert FeeOnTransfer(quantity, received);

        offerId = t.offerCount++;
        b.offers[id][offerId] = Offer({seller: msg.sender, tick: tick, claimed: false, quantity: quantity});
        b.supplyByTick[id][tick] += quantity;
        t.escrowed += quantity;
        b.escrowedBuy += quantity;
        emit OfferPlaced(id, offerId, msg.sender, quantity, tick);
    }

    /// @notice Settle one offer of a settled or failed tender. Payment and unsold
    ///         tokens only ever go to the offer's seller.
    function claim(
        Book storage b,
        IERC20 payToken,
        IERC20 buyToken,
        uint8 buyDecimals,
        uint256 tenderId,
        uint32 offerId
    ) external returns (uint256 sold, uint256 paid, uint256 returned) {
        Tender storage t = b.tenders[tenderId];
        Offer storage o = b.offers[tenderId][offerId];
        if (o.seller == address(0)) revert NoSuchOffer(tenderId, offerId);
        if (o.claimed) revert AlreadyClaimed(tenderId, offerId);
        if (t.state != State.Settled && t.state != State.Failed) revert NotClaimable(tenderId, t.state);

        o.claimed = true;
        t.claimedCount += 1;
        t.escrowed -= o.quantity;
        b.escrowedBuy -= o.quantity;

        if (t.state == State.Settled) {
            sold = TenderClearing.allocationFor(_result(t), o.quantity, o.tick);
            paid = TenderClearing.costFloor(sold, t.price, buyDecimals);
            t.reserved -= paid;
            b.reservedPay -= paid;
            if (t.claimedCount == t.offerCount) {
                // Every seller is paid: rounding dust goes back to the treasury.
                b.reservedPay -= t.reserved;
                t.reserved = 0;
            }
        }
        returned = o.quantity - sold;

        if (paid > 0) payToken.safeTransfer(o.seller, paid);
        if (returned > 0) buyToken.safeTransfer(o.seller, returned);
        emit Claimed(tenderId, offerId, o.seller, sold, paid, returned);
    }

    // ------------------------------------------------------------------ views

    function getTender(Book storage b, uint256 tenderId) external view returns (Tender memory) {
        return b.tenders[tenderId];
    }

    function getOffer(Book storage b, uint256 tenderId, uint32 offerId) external view returns (Offer memory) {
        return b.offers[tenderId][offerId];
    }

    /// @notice What an offer sells, once its tender is settled.
    function allocationOf(Book storage b, uint256 tenderId, uint32 offerId) external view returns (uint256) {
        Tender storage t = b.tenders[tenderId];
        Offer storage o = b.offers[tenderId][offerId];
        if (t.state != State.Settled || o.seller == address(0)) return 0;
        return TenderClearing.allocationFor(_result(t), o.quantity, o.tick);
    }

    // ------------------------------------------------------------------ internals

    function _fail(Book storage b, uint256 id, Tender storage t, string memory reason) private {
        t.state = State.Failed;
        b.reservedPay -= t.reserved;
        t.reserved = 0;
        b.openTenderId = 0;
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
}
