// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISealedAuction} from "../../../src/interfaces/ISealedAuction.sol";

/// A stand-in for Peal Sealed Auction with the same issuer-facing rules:
/// `cancel` only by the issuer and only with no bids, `claimProceeds` only when
/// settled, `claimUnsold` when settled or failed, each once, paid to the issuer
/// whoever calls. Tests drive the outcome with `settle`, `fail` and `setBids`.
contract MockSealedAuction {
    ISealedAuction.Config internal _cfg;
    ISealedAuction.State public state;
    bool public proceedsClaimed;
    bool public unsoldClaimed;
    bool public hasBids;
    uint256 public totalSold;
    uint256 public proceeds;

    constructor(ISealedAuction.Config memory cfg) {
        _cfg = cfg;
        state = ISealedAuction.State.CommitOpen;
    }

    function config() external view returns (ISealedAuction.Config memory) {
        return _cfg;
    }

    function setBids(bool b) external {
        hasBids = b;
    }

    /// Test driver: the auction cleared, selling `sold` of the supply for `proceeds_`
    /// of the quote token (which the test must have minted to this contract).
    function settle(uint256 sold, uint256 proceeds_) external {
        require(state == ISealedAuction.State.CommitOpen, "state");
        require(sold <= _cfg.totalSupply, "sold");
        require(IERC20(_cfg.quoteToken).balanceOf(address(this)) >= proceeds_, "unfunded proceeds");
        state = ISealedAuction.State.Settled;
        totalSold = sold;
        proceeds = proceeds_;
    }

    function fail() external {
        require(state == ISealedAuction.State.CommitOpen, "state");
        state = ISealedAuction.State.Failed;
    }

    function cancel() external {
        require(msg.sender == _cfg.issuer, "NotIssuer");
        require(state == ISealedAuction.State.CommitOpen && !hasBids, "BadState");
        state = ISealedAuction.State.Cancelled;
        IERC20(_cfg.saleToken).transfer(_cfg.issuer, _cfg.totalSupply);
    }

    function claimProceeds() external {
        require(state == ISealedAuction.State.Settled, "BadState");
        require(!proceedsClaimed, "AlreadyClaimed");
        proceedsClaimed = true;
        if (proceeds != 0) IERC20(_cfg.quoteToken).transfer(_cfg.issuer, proceeds);
    }

    function claimUnsold() external {
        require(state == ISealedAuction.State.Settled || state == ISealedAuction.State.Failed, "BadState");
        require(!unsoldClaimed, "AlreadyClaimed");
        unsoldClaimed = true;
        uint256 unsold = _cfg.totalSupply - (state == ISealedAuction.State.Settled ? totalSold : 0);
        if (unsold != 0) IERC20(_cfg.saleToken).transfer(_cfg.issuer, unsold);
    }
}

/// A stand-in for `SealedAuctionFactory.createAuction`: the caller must be the
/// issuer, the metadata hash must match, and the supply is pulled from the caller.
/// `mode` makes it misbehave for refusal tests.
contract MockSealedAuctionFactory {
    enum Mode {
        Honest,
        PullsLess, // pulls one unit less than the supply
        Unregistered, // returns an auction it does not list
        Reenter // calls back into the vault during creation
    }

    Mode public mode;
    address public reenterTarget;
    bytes public reenterData;
    mapping(address => bool) public isAuction;
    address public last;

    function setMode(Mode m) external {
        mode = m;
    }

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterData = data;
    }

    function metadataHash(string calldata name, string calldata details) public pure returns (bytes32) {
        return keccak256(abi.encode(name, details));
    }

    function createAuction(ISealedAuction.Config calldata cfg, string calldata name, string calldata details)
        external
        returns (address auction)
    {
        require(cfg.issuer == msg.sender, "NotIssuer");
        require(cfg.metadataHash == metadataHash(name, details), "MetadataMismatch");
        MockSealedAuction a = new MockSealedAuction(cfg);
        auction = address(a);
        uint256 pull = mode == Mode.PullsLess ? cfg.totalSupply - 1 : cfg.totalSupply;
        IERC20(cfg.saleToken).transferFrom(msg.sender, auction, pull);
        if (mode == Mode.Reenter) {
            (bool ok, bytes memory ret) = reenterTarget.call(reenterData);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
        if (mode != Mode.Unregistered) isAuction[auction] = true;
        last = auction;
    }
}
