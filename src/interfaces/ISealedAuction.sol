// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title ISealedAuction
/// @notice The part of Peal Sealed Auction (github.com/Adityaakr/peal-sealed-auction)
///         that the treasury vault calls. Peal Tender imports nothing else from that
///         repository; the two only meet at run time, through these functions.
///
/// `Config` must stay field-for-field identical to `SealedAuction.Config`, because
/// the factory takes it as a calldata tuple. `docs/spikes.md` records how this was
/// checked against the auction's compiled ABI.
interface ISealedAuction {
    enum State {
        Created,
        Funded,
        CommitOpen,
        Closed,
        Settled,
        Failed,
        Cancelled
    }

    struct Config {
        address issuer;
        address saleToken;
        address quoteToken;
        uint256 totalSupply;
        uint8 saleDecimals;
        uint256 reservePrice; // quote base units per whole sale token at tick 0
        uint256 tickSize;
        uint16 numTicks;
        uint64 startTime;
        uint64 endTime;
        uint64 releaseDeadline;
        uint256 minBidQuantity;
        uint256 maxQuantityPerAddress; // 0 = no cap
        uint32 maxBids;
        uint256 bidBond; // quote base units, on top of escrow
        uint16 protocolFeeBps;
        address feeRecipient;
        bytes32 committeeSetId;
        bytes32 metadataHash;
    }

    function config() external view returns (Config memory);
    function state() external view returns (State);
    function proceedsClaimed() external view returns (bool);
    function unsoldClaimed() external view returns (bool);

    /// @notice Issuer only: before bidding opens, or while open with no bids. Returns the supply.
    function cancel() external;
    /// @notice Settled only, anyone: pays the proceeds (quote token) to the issuer.
    function claimProceeds() external;
    /// @notice Settled or failed, anyone: returns the unsold supply to the issuer.
    function claimUnsold() external;
}

/// @notice The factory that creates, funds and opens a `SealedAuction` in one call.
interface ISealedAuctionFactory {
    /// @notice The caller must be `cfg.issuer` and must have approved `cfg.totalSupply`
    ///         of the sale token to the factory.
    function createAuction(ISealedAuction.Config calldata cfg, string calldata name, string calldata details)
        external
        returns (address auction);

    function isAuction(address auction) external view returns (bool);

    function metadataHash(string calldata name, string calldata details) external pure returns (bytes32);
}
