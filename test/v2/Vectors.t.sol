// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PqTestBase} from "pqkit-test/PqTestBase.sol";
import {MockERC20} from "../utils/MockERC20.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {PqAuth} from "pqkit/PqAuth.sol";
import {PqAuthSet} from "pqkit/PqAuthSet.sol";
import {PealTenderV2} from "../../src/PealTenderV2.sol";
import {TenderBook} from "../../src/TenderBook.sol";
import {ISealedAuction} from "../../src/interfaces/ISealedAuction.sol";

/// Exposes `PqAuth.message` at a fixed verifier address, so the messages the
/// TypeScript CLI signs can be compared byte for byte.
contract MessageAt {
    function quorum(address member, bytes32 action, uint256 nonce, uint256 deadline, bytes32 argsHash)
        external
        view
        returns (bytes memory)
    {
        return PqAuth.message(address(this), member, PqAuthSet.quorumAction(action), nonce, deadline, argsHash);
    }

    function any(address member, bytes32 action, uint256 nonce, uint256 deadline, bytes32 argsHash)
        external
        view
        returns (bytes memory)
    {
        return PqAuth.message(address(this), member, PqAuthSet.anyAction(action), nonce, deadline, argsHash);
    }
}

/// The TypeScript encoders (scripts/v2/encode.ts) against Solidity's own
/// abi.encode, through vectors/v2-actions.json (npm run vectors:v2).
contract VectorsTest is PqTestBase {
    using stdJson for string;

    string internal j;
    address internal vault;
    address internal factory;
    address internal fusd;
    address internal peal;
    address internal member;

    function setUp() public {
        j = vm.readFile("vectors/v2-actions.json");
        vault = j.readAddress(".addresses.vault");
        factory = j.readAddress(".addresses.factory");
        fusd = j.readAddress(".addresses.fusd");
        peal = j.readAddress(".addresses.peal");
        member = j.readAddress(".addresses.member");
    }

    function test_actionIds() public {
        installPqcMocks();
        address[] memory ms = new address[](1);
        ms[0] = address(0xa);
        registerPqKey(ms[0], keccak256("a"));
        PealTenderV2 v =
            new PealTenderV2(new MockERC20("f", "f", 6), new MockERC20("p", "p", 18), ms, 1, 1 hours, address(0), 0);
        assertEq(j.readBytes32(".actions.deposit"), v.ACTION_DEPOSIT());
        assertEq(j.readBytes32(".actions.openTender"), v.ACTION_OPEN_TENDER());
        assertEq(j.readBytes32(".actions.cancelTender"), v.ACTION_CANCEL_TENDER());
        assertEq(j.readBytes32(".actions.sweep"), v.ACTION_SWEEP());
        assertEq(j.readBytes32(".actions.queue"), v.ACTION_QUEUE());
        assertEq(j.readBytes32(".actions.veto"), v.ACTION_VETO());
        assertEq(j.readBytes32(".actions.startSealedSale"), v.ACTION_START_SALE());
        assertEq(j.readBytes32(".actions.cancelSealedSale"), v.ACTION_CANCEL_SALE());
    }

    function test_argsHashes() public view {
        assertEq(j.readBytes32(".argsHashes.deposit"), keccak256(abi.encode(member, uint256(50_000_000))));
        assertEq(j.readBytes32(".argsHashes.sweep"), keccak256(abi.encode(fusd, member, uint256(1_000_000))));
        TenderBook.OpenParams memory p = TenderBook.OpenParams({
            budget: 100_000_000,
            floorPrice: 1_000_000,
            tickSize: 100_000,
            numTicks: 10,
            endTime: 1_800_086_400,
            maxOffers: 50,
            minQuantity: 1e16
        });
        assertEq(j.readBytes32(".argsHashes.openTender"), keccak256(abi.encode(p)));
        assertEq(j.readBytes32(".argsHashes.cancelTender"), keccak256(abi.encode(uint256(3))));
        assertEq(
            j.readBytes32(".argsHashes.queueSweep"),
            _queue(PealTenderV2.OpKind.Sweep, abi.encode(fusd, member, uint256(3_000_000_000)))
        );
        address[] memory ms = new address[](3);
        ms[0] = address(0xa);
        ms[1] = address(0xb);
        ms[2] = address(0xc);
        assertEq(
            j.readBytes32(".argsHashes.queueSigners"),
            _queue(PealTenderV2.OpKind.SetSigners, abi.encode(ms, uint256(2)))
        );
        assertEq(
            j.readBytes32(".argsHashes.queueDelay"), _queue(PealTenderV2.OpKind.SetDelay, abi.encode(uint64(7200)))
        );
        assertEq(
            j.readBytes32(".argsHashes.queueCap"),
            _queue(PealTenderV2.OpKind.SetDailyCap, abi.encode(fusd, uint256(10_000_000)))
        );
        assertEq(
            j.readBytes32(".argsHashes.queueFactory"),
            _queue(PealTenderV2.OpKind.SetAuctionFactory, abi.encode(factory))
        );
        assertEq(j.readBytes32(".argsHashes.veto"), keccak256(abi.encode(uint256(5))));
        assertEq(j.readBytes32(".argsHashes.cancelSealedSale"), keccak256(abi.encode(address(0xa0c7))));
    }

    function test_saleHash() public view {
        bytes32 meta = keccak256(abi.encode(string("Buyback 1"), string("vault sells fUSD for PEAL-T")));
        assertEq(j.readBytes32(".metadataHash"), meta);
        ISealedAuction.Config memory c = ISealedAuction.Config({
            issuer: vault,
            saleToken: fusd,
            quoteToken: peal,
            totalSupply: 400_000_000,
            saleDecimals: 6,
            reservePrice: 5e18,
            tickSize: 1e17,
            numTicks: 20,
            startTime: 1_800_000_000,
            endTime: 1_800_086_400,
            releaseDeadline: 1_800_172_800,
            minBidQuantity: 1_000_000,
            maxQuantityPerAddress: 0,
            maxBids: 64,
            bidBond: 1e18,
            protocolFeeBps: 0,
            feeRecipient: address(0),
            committeeSetId: bytes32(0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0),
            metadataHash: meta
        });
        bytes32 h = keccak256(
            abi.encode(factory, c, keccak256(bytes("Buyback 1")), keccak256(bytes("vault sells fUSD for PEAL-T")))
        );
        assertEq(j.readBytes32(".argsHashes.startSealedSale"), h);
    }

    function test_messages() public {
        MessageAt at = MessageAt(vault);
        vm.etch(vault, type(MessageAt).runtimeCode);
        vm.chainId(9800);
        bytes32 sweepHash = keccak256(abi.encode(fusd, member, uint256(1_000_000)));
        assertEq(
            j.readBytes(".quorumSweepMessage"),
            at.quorum(member, keccak256("PealTenderV2.sweep"), 7, 1_800_003_600, sweepHash)
        );
        assertEq(
            j.readBytes(".vetoMessage"),
            at.any(member, keccak256("PealTenderV2.veto"), 7, 1_800_003_600, keccak256(abi.encode(uint256(5))))
        );
    }

    function _queue(PealTenderV2.OpKind kind, bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encode(kind, keccak256(data)));
    }
}
