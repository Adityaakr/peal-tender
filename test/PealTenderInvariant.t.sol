// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MockPqcSigner} from "qore-pq-kit-test/mocks/MockPqcSigner.sol";
import {PealTender} from "../src/PealTender.sol";
import {TenderTestBase} from "./utils/TenderTestBase.sol";
import {MockERC20} from "./utils/MockERC20.sol";

/// Drives the vault through random sequences of treasury actions (validly
/// signed), holder actions, time, donations and attacks (every gated function
/// with forged signatures, from the signer account itself and from strangers).
contract TenderHandler is Test {
    PealTender internal vault;
    MockERC20 internal fusd;
    MockERC20 internal peal;
    bytes32 internal secret;
    address internal attacker;
    address internal treasuryAccount;
    address public sink = address(0x51CC);

    uint256 public ghostPayIn;
    uint256 public ghostPayOutSweep;
    uint256 public ghostPayOutClaims;
    uint256 public ghostBuyIn;
    uint256 public ghostBuyOutClaims;
    uint256 public ghostBuyOutSweep;
    uint256 public ghostNativeIn;
    uint256 public ghostNativeOut;
    uint256 public attackSuccesses;
    uint256 public attackAttempts;
    mapping(uint256 => uint256) public paidByTender;
    uint256 public opened;
    uint256 public settledCount;
    uint256 public offers;
    uint256 public claims;
    uint256 public sweeps;

    address[4] internal sellers = [address(0xA11CE), address(0xB0B), address(0xCA401), address(0xD0D0)];

    constructor(PealTender v, MockERC20 f, MockERC20 p, bytes32 s, address a, address t) {
        vault = v;
        fusd = f;
        peal = p;
        secret = s;
        attacker = a;
        treasuryAccount = t;
    }

    function _sig(bytes32 action, bytes32 argsHash, uint256 deadline) internal view returns (bytes memory) {
        return MockPqcSigner.sign(secret, vault.authMessage(action, argsHash, deadline));
    }

    function _junk(uint256 seed) internal pure returns (bytes memory sig) {
        sig = new bytes(4627);
        bytes32 w = keccak256(abi.encode(seed));
        for (uint256 i = 0; i < 32; ++i) {
            sig[i] = w[i];
        }
    }

    // ------------------------------------------------------------------ treasury (signed)

    function donate(uint96 amount) external {
        uint256 a = bound(amount, 1, 1_000e6);
        fusd.mint(address(vault), a);
        ghostPayIn += a;
    }

    function donateNative(uint96 amount) external {
        uint256 a = bound(amount, 1, 10 ether);
        vm.deal(address(this), a);
        (bool ok,) = address(vault).call{value: a}("");
        require(ok);
        ghostNativeIn += a;
    }

    function openTender(uint96 budgetSeed, uint8 ticksSeed, uint32 durSeed, uint8 maxOffersSeed) external {
        if (vault.openTenderId() != 0) return;
        uint256 free = vault.freeBalance(address(fusd));
        if (free == 0) return;
        PealTender.OpenParams memory p;
        p.budget = bound(budgetSeed, 1, free);
        p.floorPrice = 1e6;
        p.tickSize = 1e5;
        p.numTicks = uint16(bound(ticksSeed, 1, 20));
        p.endTime = uint64(block.timestamp + bound(durSeed, 1, 3 days));
        p.maxOffers = uint32(bound(maxOffersSeed, 1, 12));
        p.minQuantity = 1e15;
        uint256 d = block.timestamp + 1 hours;
        vault.openTender(p, d, _sig(vault.ACTION_OPEN(), keccak256(abi.encode(p)), d));
        opened++;
    }

    function settle() external {
        uint256 id = vault.openTenderId();
        if (id == 0 || block.timestamp < vault.getTender(id).endTime) return;
        uint256 d = block.timestamp + 1 hours;
        vault.settle(d, _sig(vault.ACTION_SETTLE(), keccak256(abi.encode(id)), d));
        if (vault.getTender(id).state == PealTender.State.Settled) settledCount++;
    }

    function cancel() external {
        uint256 id = vault.openTenderId();
        if (id == 0 || block.timestamp >= vault.getTender(id).endTime) return;
        uint256 d = block.timestamp + 1 hours;
        vault.cancelTender(d, _sig(vault.ACTION_CANCEL(), keccak256(abi.encode(id)), d));
    }

    function sweep(uint8 which, uint96 amountSeed) external {
        address token = which % 3 == 0 ? address(fusd) : (which % 3 == 1 ? address(peal) : address(0));
        uint256 free = vault.freeBalance(token);
        if (free == 0) return;
        uint256 a = bound(amountSeed, 1, free);
        uint256 d = block.timestamp + 1 hours;
        vault.sweep(token, sink, a, d, _sig(vault.ACTION_SWEEP(), keccak256(abi.encode(token, sink, a)), d));
        if (token == address(fusd)) ghostPayOutSweep += a;
        else if (token == address(peal)) ghostBuyOutSweep += a;
        else ghostNativeOut += a;
        sweeps++;
    }

    // ------------------------------------------------------------------ holders and anyone

    function offer(uint8 who, uint96 qtySeed, uint8 tickSeed) external {
        uint256 id = vault.openTenderId();
        if (id == 0) return;
        PealTender.Tender memory t = vault.getTender(id);
        if (block.timestamp >= t.endTime || t.offerCount >= t.maxOffers) return;
        address seller = sellers[who % 4];
        uint256 q = bound(qtySeed, 1e15, 500e18);
        uint16 tick = uint16(tickSeed % t.numTicks);
        peal.mint(seller, q);
        vm.startPrank(seller);
        peal.approve(address(vault), q);
        vault.offer(q, tick);
        vm.stopPrank();
        ghostBuyIn += q;
        offers++;
    }

    function claim(uint8 tenderSeed, uint8 offerSeed) external {
        uint256 n = vault.tenderCount();
        if (n == 0) return;
        uint256 id = bound(tenderSeed, 1, n);
        PealTender.Tender memory t = vault.getTender(id);
        if (t.offerCount == 0) return;
        if (t.state != PealTender.State.Settled && t.state != PealTender.State.Failed) return;
        uint32 oid = uint32(offerSeed % t.offerCount);
        if (vault.getOffer(id, oid).claimed) return;
        (, uint256 paid, uint256 returned) = vault.claim(id, oid);
        ghostPayOutClaims += paid;
        ghostBuyOutClaims += returned;
        paidByTender[id] += paid;
        claims++;
    }

    function expire() external {
        uint256 id = vault.openTenderId();
        if (id == 0 || block.timestamp < uint256(vault.getTender(id).endTime) + vault.SETTLE_GRACE()) return;
        vault.expire();
    }

    function warp(uint32 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 2 days));
    }

    // ------------------------------------------------------------------ the attacker

    /// Every gated function, with a forged signature, sent as the signer account
    /// (the drill bot holds its classical key) or as a stranger.
    function attack(uint8 which, uint256 seed, bool asSigner) external {
        attackAttempts++;
        address from = asSigner ? treasuryAccount : attacker;
        bytes memory junk = _junk(seed);
        uint256 d = block.timestamp + 1 hours;
        bool ok;
        vm.startPrank(from);
        uint8 w = which % 6;
        if (w == 0) {
            (ok,) = address(vault).call(
                abi.encodeCall(PealTender.sweep, (address(fusd), from, 1, d, junk))
            );
        } else if (w == 1) {
            (ok,) = address(vault).call(abi.encodeCall(PealTender.sweep, (address(0), from, 1, d, junk)));
        } else if (w == 2) {
            (ok,) = address(vault).call(abi.encodeCall(PealTender.rotateSigner, (from, d, junk)));
        } else if (w == 3) {
            (ok,) = address(vault).call(abi.encodeCall(PealTender.settle, (d, junk)));
        } else if (w == 4) {
            (ok,) = address(vault).call(abi.encodeCall(PealTender.cancelTender, (d, junk)));
        } else {
            (ok,) = address(vault).call(abi.encodeCall(PealTender.deposit, (sellers[0], 1, d, junk)));
        }
        vm.stopPrank();
        if (ok) attackSuccesses++;
    }

    receive() external payable {}
}

contract PealTenderInvariantTest is TenderTestBase {
    TenderHandler internal handler;

    function setUp() public {
        setUpVault();
        handler = new TenderHandler(vault, fusd, peal, TREASURY_SECRET, attacker, treasury);
        targetContract(address(handler));
    }

    function invariant_noAttackEverSucceeds() public view {
        assertEq(handler.attackSuccesses(), 0);
        assertEq(fusd.balanceOf(attacker), 0);
        assertEq(peal.balanceOf(attacker), 0);
        assertEq(attacker.balance, 0);
        assertEq(fusd.balanceOf(treasury), 0);
        assertEq(treasury.balance, 0);
    }

    /// Funds leave the vault only through signed sweeps and seller claims.
    function invariant_balancesMatchAuthorisedFlows() public view {
        assertEq(
            fusd.balanceOf(address(vault)),
            handler.ghostPayIn() - handler.ghostPayOutSweep() - handler.ghostPayOutClaims()
        );
        assertEq(
            peal.balanceOf(address(vault)),
            handler.ghostBuyIn() - handler.ghostBuyOutClaims() - handler.ghostBuyOutSweep()
        );
        assertEq(address(vault).balance, handler.ghostNativeIn() - handler.ghostNativeOut());
    }

    /// What is owed is always held.
    function invariant_obligationsCovered() public view {
        assertLe(vault.reservedPay(), fusd.balanceOf(address(vault)));
        assertLe(vault.escrowedBuy(), peal.balanceOf(address(vault)));
    }

    /// The global counters equal the per-tender ones, and no tender pays out more
    /// than its budget.
    function invariant_accountingConsistent() public view {
        uint256 reserved;
        uint256 escrowed;
        for (uint256 id = 1; id <= vault.tenderCount(); ++id) {
            PealTender.Tender memory t = vault.getTender(id);
            reserved += t.reserved;
            escrowed += t.escrowed;
            assertLe(handler.paidByTender(id), t.budget);
            if (t.state == PealTender.State.Failed) assertEq(t.reserved, 0);
        }
        assertEq(reserved, vault.reservedPay());
        assertEq(escrowed, vault.escrowedBuy());
    }

    function afterInvariant() public view {
        console.log("opened", handler.opened(), "settled", handler.settledCount());
        console.log("offers", handler.offers(), "claims", handler.claims());
        console.log("sweeps", handler.sweeps(), "attacks", handler.attackAttempts());
    }

    function invariant_signerNeverChanges() public view {
        assertEq(vault.signer(), treasury);
    }
}
