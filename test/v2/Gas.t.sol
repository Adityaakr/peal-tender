// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PealTenderV2} from "../../src/PealTenderV2.sol";
import {TenderBook} from "../../src/TenderBook.sol";
import {ISealedAuction} from "../../src/interfaces/ISealedAuction.sol";
import {MockSealedAuction} from "./mocks/MockSealedAuction.sol";
import {GasKeyStatus, GasVerify} from "./mocks/GasPrecompiles.sol";
import {PqAuth} from "pqkit/PqAuth.sol";
import {V2TestBase} from "./V2TestBase.sol";

/// The vault's own execution gas for each call, written to snapshots/GasTest.json
/// (`npm run snapshot`). The precompiles are near-free stand-ins here, and an
/// internal call carries no calldata cost, so on QoreChain add per signature about
/// 92k (pqcVerify) + 6k (pqcKeyStatus) + 74k (the 4,627-byte signature as calldata),
/// plus the 21k transaction base (kit `docs/spikes.md`, S6).
contract GasTest is V2TestBase {
    address internal sink = makeAddr("sink");

    function setUp() public {
        setUpVault();
        fund(5_000 * USD);
        vm.etch(PqAuth.PQC_KEY_STATUS, type(GasKeyStatus).runtimeCode);
        vm.etch(PqAuth.PQC_VERIFY, type(GasVerify).runtimeCode);
    }

    // Signatures are built in external self-calls: the mock signer's memory then
    // stays in that call's frame and cannot inflate the measured call's memory cost.
    function extQuorum(bytes32 action, bytes32 argsHash) external view returns (PealTenderV2.Auth memory) {
        return quorum(action, argsHash);
    }

    function extAll(bytes32 action, bytes32 argsHash) external view returns (PealTenderV2.Auth memory) {
        return authBy(membersArray(), action, argsHash, soon());
    }

    function extVeto(address member, uint256 opId, uint256 deadline) external view returns (bytes memory) {
        return vetoSig(member, opId, deadline);
    }

    function test_gas_sweep() public {
        PealTenderV2.Auth memory a =
            this.extQuorum(vault.ACTION_SWEEP(), keccak256(abi.encode(address(fusd), sink, USD)));
        vm.startSnapshotGas("sweep (2 of 3)");
        vault.sweep(address(fusd), sink, USD, a);
        vm.stopSnapshotGas();
    }

    function test_gas_sweepThreeSigners() public {
        bytes32 h = keccak256(abi.encode(address(fusd), sink, USD));
        PealTenderV2.Auth memory a = this.extAll(vault.ACTION_SWEEP(), h);
        vm.startSnapshotGas("sweep (3 of 3)");
        vault.sweep(address(fusd), sink, USD, a);
        vm.stopSnapshotGas();
    }

    function test_gas_queueExecute() public {
        bytes memory data = abi.encode(address(fusd), sink, 3_000 * USD);
        PealTenderV2.Auth memory a =
            this.extQuorum(vault.ACTION_QUEUE(), keccak256(abi.encode(PealTenderV2.OpKind.Sweep, keccak256(data))));
        vm.startSnapshotGas("queue (sweep above cap)");
        uint256 id = vault.queue(PealTenderV2.OpKind.Sweep, data, a);
        vm.stopSnapshotGas();
        vm.warp(block.timestamp + DELAY);
        vm.startSnapshotGas("execute (sweep)");
        vault.execute(id);
        vm.stopSnapshotGas();
    }

    function test_gas_veto() public {
        bytes memory d2 = abi.encode(uint64(2 hours));
        uint256 id = vault.queue(
            PealTenderV2.OpKind.SetDelay,
            d2,
            this.extQuorum(vault.ACTION_QUEUE(), keccak256(abi.encode(PealTenderV2.OpKind.SetDelay, keccak256(d2))))
        );
        uint256 dl = soon();
        bytes memory sig = this.extVeto(s[2], id, dl);
        address who = s[2];
        vm.startSnapshotGas("veto (1 signer)");
        vault.veto(id, dl, who, sig);
        vm.stopSnapshotGas();
    }

    function test_gas_tender() public {
        TenderBook.OpenParams memory p = defaultParams(100 * USD);
        PealTenderV2.Auth memory a = this.extQuorum(vault.ACTION_OPEN_TENDER(), keccak256(abi.encode(p)));
        vm.startSnapshotGas("openTender");
        uint256 id = vault.openTender(p, a);
        vm.stopSnapshotGas();
        peal.mint(sink, 40 * ONE);
        vm.prank(sink);
        peal.approve(address(vault), 40 * ONE);
        vm.prank(sink);
        vm.startSnapshotGas("offer");
        vault.offer(40 * ONE, 0);
        vm.stopSnapshotGas();
        vm.warp(p.endTime);
        vm.startSnapshotGas("settle (permissionless, 10 ticks)");
        vault.settle();
        vm.stopSnapshotGas();
        vm.startSnapshotGas("claim");
        vault.claim(id, 0);
        vm.stopSnapshotGas();
    }

    function test_gas_sale() public {
        ISealedAuction.Config memory c = saleConfig(400 * USD);
        PealTenderV2.Auth memory a = this.extQuorum(vault.ACTION_START_SALE(), saleArgs(c));
        vm.startSnapshotGas("startSealedSale (mock factory)");
        address auction = vault.startSealedSale(c, "Buyback 1", "vault sells fUSD for PEAL-T", a);
        vm.stopSnapshotGas();
        peal.mint(auction, 100 * ONE);
        MockSealedAuction(auction).settle(300 * USD, 100 * ONE);
        vm.startSnapshotGas("collectSealedSale (permissionless)");
        vault.collectSealedSale(auction);
        vm.stopSnapshotGas();
    }
}
