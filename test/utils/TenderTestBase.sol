// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PqTestBase} from "qore-pq-kit-test/PqTestBase.sol";
import {PealTender} from "../../src/PealTender.sol";
import {MockERC20} from "./MockERC20.sol";

abstract contract TenderTestBase is PqTestBase {
    uint256 internal constant ONE = 1e18; // one whole tPEAL
    uint256 internal constant USD = 1e6; // one whole fUSD

    MockERC20 internal fusd;
    MockERC20 internal peal;
    PealTender internal vault;

    // The drill account: its classical key is public, its ML-DSA-87 key is not.
    address internal treasury = makeAddr("treasury");
    bytes32 internal constant TREASURY_SECRET = keccak256("treasury ML-DSA-87 secret");
    address internal attacker = makeAddr("attacker");

    mapping(address => bytes32) internal secretOf;

    function setUpVault() internal {
        vm.warp(1_800_000_000);
        installPqcMocks();
        registerPqKey(treasury, TREASURY_SECRET);
        secretOf[treasury] = TREASURY_SECRET;
        fusd = new MockERC20("FestUSD", "fUSD", 6);
        peal = new MockERC20("Peal Tender Test Token", "tPEAL", 18);
        vault = new PealTender(fusd, peal, treasury);
    }

    function addSigner(address who, bytes32 secret) internal {
        registerPqKey(who, secret);
        secretOf[who] = secret;
    }

    /// A valid signature by the vault's current signer for the next nonce.
    function sign(bytes32 action, bytes32 argsHash, uint256 deadline) internal view returns (bytes memory) {
        address s = vault.signer();
        return pqSign(secretOf[s], pqMessage(address(vault), s, action, vault.nonce(), deadline, argsHash));
    }

    function soon() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    function fund(uint256 amount) internal {
        fusd.mint(address(vault), amount); // as a MsgConvertCoin straight to the vault would
    }

    function defaultParams(uint256 budget) internal view returns (PealTender.OpenParams memory p) {
        p.budget = budget;
        p.floorPrice = 1 * USD; // 1.00 fUSD per tPEAL at tick 0
        p.tickSize = USD / 10; // +0.10 per tick
        p.numTicks = 10;
        p.endTime = uint64(block.timestamp + 1 days);
        p.maxOffers = 50;
        p.minQuantity = ONE / 100;
    }

    function open(PealTender.OpenParams memory p) internal returns (uint256 id) {
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_OPEN(), keccak256(abi.encode(p)), d);
        id = vault.openTender(p, d, sig);
    }

    function settleNow() internal {
        uint256 d = soon();
        bytes memory sig = sign(vault.ACTION_SETTLE(), keccak256(abi.encode(vault.openTenderId())), d);
        vault.settle(d, sig);
    }

    function offerAs(address seller, uint256 quantity, uint16 tick) internal returns (uint32 id) {
        peal.mint(seller, quantity);
        vm.startPrank(seller);
        peal.approve(address(vault), quantity);
        id = vault.offer(quantity, tick);
        vm.stopPrank();
    }

    /// A random 4,627-byte string that is not a signature.
    function junkSig(bytes32 seed) internal pure returns (bytes memory sig) {
        sig = new bytes(4627);
        for (uint256 i = 0; i < 4627; i += 32) {
            bytes32 w = keccak256(abi.encode(seed, i));
            for (uint256 j = 0; j < 32 && i + j < 4627; ++j) {
                sig[i + j] = w[j];
            }
        }
    }
}
