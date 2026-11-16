// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PqTestBase} from "pqkit-test/PqTestBase.sol";
import {PealTenderV2} from "../../src/PealTenderV2.sol";
import {TenderBook} from "../../src/TenderBook.sol";
import {ISealedAuction} from "../../src/interfaces/ISealedAuction.sol";
import {MockERC20} from "../utils/MockERC20.sol";
import {MockSealedAuctionFactory} from "./mocks/MockSealedAuction.sol";

/// A vault run by a 2-of-3 signer set, with the precompile mocks installed.
abstract contract V2TestBase is PqTestBase {
    uint256 internal constant ONE = 1e18; // one whole PEAL-T
    uint256 internal constant USD = 1e6; // one whole fUSD
    uint64 internal constant DELAY = 1 hours;
    uint256 internal constant CAP = 1_000 * USD;

    bytes32 internal constant QUORUM_DOMAIN = keccak256("qore-pq-kit.PqAuthSet.quorum.v1");
    bytes32 internal constant ANY_DOMAIN = keccak256("qore-pq-kit.PqAuthSet.any.v1");

    MockERC20 internal fusd;
    MockERC20 internal peal;
    MockSealedAuctionFactory internal factory;
    PealTenderV2 internal vault;

    /// Members, sorted ascending: s[0] < s[1] < s[2].
    address[3] internal s;
    address internal outsider; // has a usable ML-DSA key, but is not a member
    address internal attacker = makeAddr("attacker");
    mapping(address => bytes32) internal secretOf;

    function setUpVault() internal {
        vm.warp(1_800_000_000);
        installPqcMocks();
        address[3] memory raw = [makeAddr("signer-a"), makeAddr("signer-b"), makeAddr("signer-c")];
        for (uint256 i = 0; i < 3; ++i) {
            _addKey(raw[i]);
        }
        // sort
        for (uint256 i = 0; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                if (raw[j] < raw[i]) (raw[i], raw[j]) = (raw[j], raw[i]);
            }
        }
        s = raw;
        outsider = makeAddr("outsider");
        _addKey(outsider);

        fusd = new MockERC20("FestUSD", "fUSD", 6);
        peal = new MockERC20("Peal Token", "PEAL-T", 18);
        factory = new MockSealedAuctionFactory();
        vault = new PealTenderV2(fusd, peal, membersArray(), 2, DELAY, address(factory), CAP);
    }

    function _addKey(address who) internal {
        bytes32 secret = keccak256(abi.encode("ML-DSA-87 secret", who));
        registerPqKey(who, secret);
        secretOf[who] = secret;
    }

    function membersArray() internal view returns (address[] memory m) {
        m = new address[](3);
        m[0] = s[0];
        m[1] = s[1];
        m[2] = s[2];
    }

    function soon() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    // ------------------------------------------------------------------ signing, built independently of the library

    function quorumAction(bytes32 action) internal pure returns (bytes32) {
        return keccak256(abi.encode(QUORUM_DOMAIN, action));
    }

    function anyAction(bytes32 action) internal pure returns (bytes32) {
        return keccak256(abi.encode(ANY_DOMAIN, action));
    }

    function share(address member, bytes32 action, bytes32 argsHash, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return pqSign(
            secretOf[member], pqMessage(address(vault), member, quorumAction(action), vault.nonce(), deadline, argsHash)
        );
    }

    function authBy(address[] memory who, bytes32 action, bytes32 argsHash, uint256 deadline)
        internal
        view
        returns (PealTenderV2.Auth memory a)
    {
        a.deadline = deadline;
        a.signers = who;
        a.signatures = new bytes[](who.length);
        for (uint256 i = 0; i < who.length; ++i) {
            a.signatures[i] = share(who[i], action, argsHash, deadline);
        }
    }

    function two(address x, address y) internal pure returns (address[] memory w) {
        w = new address[](2);
        w[0] = x;
        w[1] = y;
    }

    /// A valid 2-of-3 quorum (the first two members) for `action` at the current nonce.
    function quorum(bytes32 action, bytes32 argsHash) internal view returns (PealTenderV2.Auth memory) {
        return authBy(two(s[0], s[1]), action, argsHash, soon());
    }

    function vetoSig(address member, uint256 opId, uint256 deadline) internal view returns (bytes memory) {
        return pqSign(
            secretOf[member],
            pqMessage(
                address(vault),
                member,
                anyAction(vault.ACTION_VETO()),
                vault.nonce(),
                deadline,
                keccak256(abi.encode(opId))
            )
        );
    }

    // ------------------------------------------------------------------ actions

    function fund(uint256 amount) internal {
        fusd.mint(address(vault), amount); // as a MsgConvertCoin straight to the vault would
    }

    function sweepNow(address token, address to, uint256 amount) internal {
        vault.sweep(token, to, amount, quorum(vault.ACTION_SWEEP(), keccak256(abi.encode(token, to, amount))));
    }

    function queueOp(PealTenderV2.OpKind kind, bytes memory data) internal returns (uint256) {
        return vault.queue(kind, data, quorum(vault.ACTION_QUEUE(), keccak256(abi.encode(kind, keccak256(data)))));
    }

    function defaultParams(uint256 budget) internal view returns (TenderBook.OpenParams memory p) {
        p.budget = budget;
        p.floorPrice = 1 * USD; // 1.00 fUSD per PEAL-T at tick 0
        p.tickSize = USD / 10; // +0.10 per tick
        p.numTicks = 10;
        p.endTime = uint64(block.timestamp + 1 days);
        p.maxOffers = 50;
        p.minQuantity = ONE / 100;
    }

    function openTender(TenderBook.OpenParams memory p) internal returns (uint256) {
        return vault.openTender(p, quorum(vault.ACTION_OPEN_TENDER(), keccak256(abi.encode(p))));
    }

    function offerAs(address seller, uint256 quantity, uint16 tick) internal returns (uint32 id) {
        peal.mint(seller, quantity);
        vm.startPrank(seller);
        peal.approve(address(vault), quantity);
        id = vault.offer(quantity, tick);
        vm.stopPrank();
    }

    function saleConfig(uint256 supply) internal view returns (ISealedAuction.Config memory c) {
        c.issuer = address(vault);
        c.saleToken = address(fusd);
        c.quoteToken = address(peal);
        c.totalSupply = supply;
        c.saleDecimals = 6;
        c.reservePrice = 5 * ONE; // at least 5 PEAL-T per fUSD (i.e. at most 0.20 fUSD per PEAL-T)
        c.tickSize = ONE / 10;
        c.numTicks = 20;
        c.startTime = uint64(block.timestamp);
        c.endTime = uint64(block.timestamp + 1 days);
        c.releaseDeadline = uint64(block.timestamp + 2 days);
        c.minBidQuantity = USD;
        c.maxQuantityPerAddress = 0;
        c.maxBids = 64;
        c.bidBond = ONE;
        c.protocolFeeBps = 0;
        c.feeRecipient = address(0);
        c.committeeSetId = keccak256("committee");
        c.metadataHash = keccak256(abi.encode(string("Buyback 1"), string("vault sells fUSD for PEAL-T")));
    }

    function saleArgs(ISealedAuction.Config memory c) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                vault.auctionFactory(),
                c,
                keccak256(bytes("Buyback 1")),
                keccak256(bytes("vault sells fUSD for PEAL-T"))
            )
        );
    }

    function startSale(ISealedAuction.Config memory c) internal returns (address) {
        return vault.startSealedSale(
            c, "Buyback 1", "vault sells fUSD for PEAL-T", quorum(vault.ACTION_START_SALE(), saleArgs(c))
        );
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
