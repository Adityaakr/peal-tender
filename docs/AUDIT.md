# Audit and post-quantum design

This file is what the Post-Quantum dApp category asks for: the two-stage QCAI
audit (the reports and what was done about each Stage 1 finding) and the
post-quantum design, meaning where the contracts call `pqcVerify` and
`pqcKeyStatus`, what each call protects, and which tests cover it.

- **Reports:** [`docs/audit/`](audit/), one PDF per stage, each named with its date.
- **Audited source:** [`audits/flattened/PealTenderV2.flat.sol`](../audits/flattened/PealTenderV2.flat.sol),
  the v2 vault and everything it compiles with. CI checks that it matches `src/`
  (`npm run flatten -- --check`), so the audited bytes are in git.
- **How each stage is run:** [`audits/README.md`](../audits/README.md). Both reports must
  read "Blockchain: ethereum". Stage 1 was run with the page's "Auto-detect from code", which
  resolved to that; stage 2 is to be run with "Ethereum (EVM/Solidity)" chosen.
- **Scope:** v2 (`PealTenderV2`, `TenderBook`, `TenderClearing`, and `PqAuth` and
  `PqAuthSet` from qore-pq-kit v0.3.0). The drill vault (`src/PealTender.sol`) is
  the Q-Day Drill's deployed contract and stays as the drill judged it.

## The two stages

| Stage | Status | Report | Record |
| --- | --- | --- | --- |
| 1 | **run** 24 November 2026 18:38:13 UTC (25 November 00:08:13 India time): 72/100, risk MEDIUM, 5 findings (2 medium, 2 low, 1 info), quantum readiness "not scored for this setting" | [`stage-1-qcai-2026-11-25.pdf`](audit/stage-1-qcai-2026-11-25.pdf), sha256 `a6216ae0…f96502` | [`audits/stage-1.md`](../audits/stage-1.md) |
| 2 | **not run yet**; every Stage 1 finding below is worked through, and the source did not change, so it audits the same file | `docs/audit/stage-2-qcai-<date>.pdf` | [`audits/stage-2.md`](../audits/stage-2.md) |

### Stage 1 findings and what was done

Each finding was attacked first, then pinned by regression tests ([`test/v2/Audit1.t.sol`](../test/v2/Audit1.t.sol), 18 tests; each test's
name starts with `test_audit1_F<n>_` or `testFuzz_audit1_F<n>_`). **None is exploitable on
the live vault, so the contracts stay exactly as deployed** and as audited. Finding 2 led us
to one real gap in the source, which the live vault cannot reach; it is written down below
rather than hidden. The tests were checked against 22 broken versions of the vault and
caught all of them ([how](../audits/stage-1.md#how-the-findings-were-tested)). The report's
line numbers match no file; [the map to the real lines](../audits/stage-1.md#the-reports-line-numbers)
is in the stage 1 record.

| ID | Severity | Finding | What we did | Regression tests |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Missing access control: anyone can call `collectSealedSale` ([L445](../src/PealTenderV2.sol#L445)) | **Not exploitable, no contract change.** [Why](#finding-1-collectsealedsale-is-open-to-anyone) | `testFuzz_audit1_F1_strangerCollects_vaultGetsEverything`, `test_audit1_F1_collectRefusesAuctionsTheVaultNeverStarted`, `test_audit1_F1_collectRefusesUnfinishedStates`, `test_audit1_F1_collectOnlyOnce`, `test_audit1_F1_collectDisturbsNothingElse` |
| 2 | MEDIUM | Potential overflow in the daily cap: `_spend` ([L578](../src/PealTenderV2.sol#L578)) | **Not reachable on the live vault, no contract change.** A gap beside it (the constructor's first cap) is documented, pinned by a test and refused by the deploy script. [Why](#finding-2-the-daily-cap-arithmetic) | `test_audit1_F2_capAtUint192Max_isExact`, `testFuzz_audit1_F2_spentNeverWraps`, `testFuzz_audit1_F2_timelockRefusesCapsAboveUint192`, `test_audit1_F2_capLoweredBelowSpent`, `test_audit1_F2_constructorCapAboveUint192_wouldTruncate`, `test_audit1_F2_deployedCapFitsUint192` |
| 3 | LOW | Potential reentrancy: DELEGATECALL to `TenderBook` | **Not exploitable, no contract change**: the guards it recommends are there. [Why](#finding-3-reentrancy-through-tenderbook) | `test_audit1_F3_tokenHooksCannotReenter`, `test_audit1_F3_nativeSweepCannotReenter`, `test_audit1_F3_libraryRefusesDirectCalls` |
| 4 | LOW | Unbounded loop over `_saleList` ([L165](../src/PealTenderV2.sol#L165)) | **False positive, no contract change**: nothing loops over it. [Why](#finding-4-the-sale-list) | `test_audit1_F4_costDoesNotGrowWithTheList`, `test_audit1_F4_onlyTheQuorumGrowsTheList` |
| 5 | INFO | ERC-1363 not fully used | **Intended, no contract change.** [Why](#finding-5-erc-1363) | `test_audit1_F5_erc1363TokenWorksAsPlainErc20`, `test_audit1_F5_noErc1363CodeInTheContracts` |

#### Finding 1: `collectSealedSale` is open to anyone

By design ([the contract's own table, L35](../src/PealTenderV2.sol#L35)). The caller chooses only an address and a
moment:

- **The address** must be a sale this vault started and has not finished ([L446-447](../src/PealTenderV2.sol#L446)).
  The only write of `Active` is in `startSealedSale` ([L333](../src/PealTenderV2.sol#L333)), after a quorum, for an
  auction the vault's factory created and lists ([L330](../src/PealTenderV2.sol#L330)). A fake auction, or another
  issuer's auction at the same factory, is refused.
- **The money** goes to the vault. The function takes no recipient and makes no transfer; it
  calls the auction's `claimProceeds` and `claimUnsold` ([L457-458](../src/PealTenderV2.sol#L457)), which pay the
  auction's `issuer`, and `startSealedSale` requires the issuer to be the vault
  ([L310](../src/PealTenderV2.sol#L310)). In Peal Sealed Auction (read at `f502616`, the version `docs/spikes.md` T3
  checked; `SealedAuction.sol` is the same on its `main`) anyone may already call both
  directly, so a lock on the vault's side would protect nothing.
- **The moment** must be after the auction is `Settled` or `Failed` ([L450](../src/PealTenderV2.sol#L450)). Both are
  final there, with the amounts fixed, so collecting early or late changes no amount. It uses no
  nonce, so it cannot spoil an action the signers have already signed.
- **What stays:** if somebody called the auction directly first, the sale's recorded
  `proceeds` and `returned` hold only what the vault's own call brought in. They are a record
  (shown by the app and the event); no contract logic reads them.

Requiring a quorum would let an unavailable signer keep the treasury's own money in the
auction, for no gain.

#### Finding 2: the daily cap arithmetic

- **The addition cannot overflow.** Before adding, `_spend` refuses `amount > cap - spent`
  ([L579-580](../src/PealTenderV2.sol#L579), [L502-507](../src/PealTenderV2.sol#L502)), so `spent + amount <= cap`. The sum is a
  `uint256` ([L583](../src/PealTenderV2.sol#L583)) and Solidity 0.8.28 reverts on overflow anyway.
- **The narrowing to `uint192`** ([L585](../src/PealTenderV2.sol#L585)) is exact while the cap is below 2^192. The
  timelock, the only way to change a cap on a running vault, refuses anything larger
  ([L626](../src/PealTenderV2.sol#L626)).
- **The gap: the constructor does not check its first cap** ([L240](../src/PealTenderV2.sol#L240)), so the comment on
  L583 is not true for every possible deployment. A vault deployed with a cap of 2^192 or more,
  for a token with at least 2^192 (6 x 10^57) base units, would record a truncated `spent` and
  forget part of that day's outflow. `test_audit1_F2_constructorCapAboveUint192_wouldTruncate`
  shows it. It needs the deployer to choose an absurd cap, which is close to choosing no cap,
  and it takes a quorum to spend.
- **The live vault cannot reach it.** It was deployed with a cap of 1,000,000 (1 fUSD); read on
  24 November 2026, `dailyCap(fUSD)` is still 1,000,000, no change has ever been queued
  (`opCount` is 0), and fUSD's whole supply is 10^15. Its constructor can never run again.
- **What we did.** `scripts/v2/deploy.ts` refuses a cap of 2^192 or more. The contract is left
  as deployed and audited; a later version should check the cap in the constructor too.

#### Finding 3: reentrancy through `TenderBook`

- **The guard.** All 13 state-changing functions of the vault are `nonReentrant`, and every
  state-changing DELEGATECALL to the library ([L286](../src/PealTenderV2.sol#L286), [L293](../src/PealTenderV2.sol#L293), [L422](../src/PealTenderV2.sol#L422),
  [L428](../src/PealTenderV2.sol#L428), [L438](../src/PealTenderV2.sol#L438)) runs inside one. Only `receive()` is outside; it emits an event.
- **The target is fixed.** `TenderBook` is linked at deployment; its address is a constant in
  the bytecode, not storage or an argument. All ten link sites of the live vault hold
  `0xb06D322fAB9503D59f980D3A67Da5EBA236AAB10`.
- **The library's own external calls** are the token transfers. `claim` writes all its state
  first ([L246-261](../src/TenderBook.sol#L246)) and pays last ([L264-265](../src/TenderBook.sol#L264)). `offer` takes the tokens first
  and then requires exactly the offered amount to have arrived ([L217-220](../src/TenderBook.sol#L217)).
- **The test** uses tokens that call the seller back around every balance change, and a native
  sweep to a contract. Each time, the attacker tries all 13 functions: every attempt is refused
  by the guard, and the round pays exactly what it pays without the attack. Direct calls to the
  library's state-changing functions are refused too.

A token that calls back could read a view such as `freeBalance` in the middle of a vault
call. No contract of ours relies on those views, and acting on them in that moment is what
the guard refuses.

#### Finding 4: the sale list

`_saleList` is pushed to ([L340](../src/PealTenderV2.sol#L340)), measured ([L557](../src/PealTenderV2.sol#L557)) and read at one index
([L561](../src/PealTenderV2.sol#L561)). No function loops over it, and a sale's state is in a mapping, so no cost
depends on its length: with a billion entries, starting, reading, collecting and cancelling a
sale and sweeping cost the same gas as with a few. Each entry takes a quorum signature. (The
loops the contracts do have are bounded: 16 members, 256 ticks.) The web app and the CLI list
sales one `eth_call` at a time, off chain.

#### Finding 5: ERC-1363

The vault uses ERC-20 only: `safeTransfer`, `safeTransferFrom`, `forceApprove`. ERC-1363 is in
the flattened file because OpenZeppelin's `SafeERC20` imports it for helpers the vault never
calls; none of that code is in either contract's bytecode. Supporting it would add call-backs,
which is the risk finding 3 is about. An ERC-1363 token still works as a plain ERC-20, and its
`transferAndCall` and `approveAndCall` to the vault revert.

## Where the contracts call the precompiles

QoreChain exposes ML-DSA-87 to the EVM through two precompiles: `pqcVerify` at
`0x…0A01` (verify a signature against a public key) and `pqcKeyStatus` at
`0x…0A02` (an account's registered key, its algorithm and whether possession was
proven at registration). Peal Tender reaches them only through qore-pq-kit's
`PqAuth` library. Nothing in the contracts calls `ecrecover`, and the sender of a
transaction never counts as authority; `npm run cbom:check` checks both from the
QoreScan inventory.

| Call | Where | What it protects |
| --- | --- | --- |
| `pqcKeyStatus(signer)` | [`PqAuth.keyOf`](https://github.com/Adityaakr/qore-pq-kit/blob/v0.3.0/src/PqAuth.sol), called by `PqAuthSet._check` for **every share of every treasury action** | The key that verifies a share is the one the chain's registry holds **now**, not a copy stored in the vault. A key must be registered, be ML-DSA-87, have its possession proven and be 2,592 bytes; otherwise the action reverts (`PqKeyUnusable`). A signer who rotates their key on chain is followed at once, and a stolen copy of an old key stops working. |
| `pqcVerify(key, share, message)` | [`PqAuth.verify`](https://github.com/Adityaakr/qore-pq-kit/blob/v0.3.0/src/PqAuth.sol), called by `PqAuthSet._check` for every share | The signed message binds the chain id, this vault, the signer, the action, the set nonce, a deadline and the hash of the exact arguments (256 bytes). So a share cannot be replayed, moved to another vault, chain or action, or reused with other arguments. Only the exact answer `1` counts. |
| `pqcKeyStatus(member)` at set-up | `PqAuthSet.init` in the vault's constructor ([`src/PealTenderV2.sol` L237](../src/PealTenderV2.sol#L237)) | The vault cannot be deployed with a member who has no usable ML-DSA-87 key. |
| `pqcKeyStatus(member)` on a signer change | `_checkOp` when it is queued ([L619](../src/PealTenderV2.sol#L619)) and `setMembers` when it executes ([L383](../src/PealTenderV2.sol#L383)) | A signer-set change cannot add an account without a usable key, checked again when the change takes effect. |

### Which actions need which signatures

| Vault function ([`src/PealTenderV2.sol`](../src/PealTenderV2.sol)) | Check |
| --- | --- |
| `deposit` (L258), `sweep` within the daily cap (L269), `openTender` (L284), `cancelTender` (L292), `startSealedSale` (L317), `cancelSealedSale` (L348), `queue` a change (L362) | `PqAuthSet.authorizeQuorum`: 2 of 3 members, in strictly ascending order, each share checked with `pqcKeyStatus` and `pqcVerify` against the same set nonce, which is then consumed |
| `veto` a queued change (L411) | `PqAuthSet.authorizeAny`: one member, signed under a separate domain so a veto can never pass as a quorum share or the other way round |
| `execute` after the delay, `settle`, `claim`, `collectSealedSale`, `offer` | no treasury signature: their outcome is fixed by rules already signed (the queued change, the tender's clearing rule, the auction's issuer) or they move only the caller's own tokens |

### Failing closed

If a precompile is missing or answers with empty or malformed data, the action
reverts (`PqPrecompileUnavailable`); it never reads as "valid". A `pqcVerify`
revert, a short answer or any word other than `1` is an invalid signature.

## Tests that cover each call

All Solidity tests run on Foundry's EVM with the two precompiles mocked
([`kit/test/mocks/`](../kit/test/mocks)), including their failure modes. The mock
`pqcVerify` is a keyed-hash stand-in with ML-DSA-87's byte lengths: only the holder
of a key's secret can make a signature it accepts, and only for the exact message,
so a wrong key, message or length fails as it would on chain.

| What | Tests |
| --- | --- |
| A share verifies only for its exact message (`pqcVerify`) | `test_sweep_refusesOtherArguments`, `test_sweep_refusesOtherAction`, `test_sweep_refusesSignatureForAnotherVault`, `test_sweep_refusesOtherChain`, `test_sweep_refusesReplay`, `test_sweep_refusesExpiredAndTooFar`, `testFuzz_argumentsBound`, `testFuzz_otherNonceRefused`, `testFuzz_deadlineWindow` |
| The quorum: 2 of 3 members, distinct, ascending | `test_sweep_withTwoOfThree`, `test_sweep_anyTwoMembersWork_andAllThree`, `test_sweep_refusesOneSignature`, `test_sweep_refusesOutsider`, `test_sweep_refusesSameMemberTwice`, `test_sweep_refusesUnsorted`, `testFuzz_subsets` |
| Shares under the wrong domain are refused | `test_sweep_refusesSingleMemberDomainShares`, `test_sweep_refusesPlainPqAuthSignatures`, `test_timelock_vetoRefusals` |
| Being a member and the sender is not enough | `test_sweep_memberSenderWithJunkFails`, `invariant_noAttackSucceeds` (random members send forged actions from their own accounts) |
| Keys read live (`pqcKeyStatus`) | `test_constructor_refusesMemberWithoutKey`, `test_timelock_rotateChecksKeysAtExecution`, `test_timelock_rotateSigner_voidsOldMemberAndOtherOps`; in the kit: `test_onChainKeyRotationIsFollowed`, `test_keyWithoutProofOfPossessionIsRefused`, `test_otherAlgorithmIsRefused`, `test_wrongKeyLengthIsRefused` |
| Failing closed | `test_sweep_failsClosedWithoutPrecompile`; in the kit: `test_keyStatusEmptyReturnFailsClosed`, `test_keyStatusMissingCodeFailsClosed`, `test_verifyEmptyReturnFailsClosed`, `test_verifyMissingCodeFailsClosed`, `test_verifyRevertIsInvalid`, `test_verifyShortReturnIsInvalid`, `test_verifyNonBooleanWordIsInvalid` |
| The drill: a classical key alone moves nothing (v1) | `test_drill_classicalKeyHolderCannotMoveAnything` |
| The CLI signs the same bytes the vault verifies | `test_views_messagesMatchIndependentBuild`, `Vectors.t.sol` (TypeScript encoders against Solidity, byte for byte) |

Files: [`test/v2/PealTenderV2.t.sol`](../test/v2/PealTenderV2.t.sol),
[`PealTenderV2Fuzz.t.sol`](../test/v2/PealTenderV2Fuzz.t.sol),
[`PealTenderV2Invariant.t.sol`](../test/v2/PealTenderV2Invariant.t.sol),
[`kit/test/PqAuth.t.sol`](../kit/test/PqAuth.t.sol),
[`test/PealTender.t.sol`](../test/PealTender.t.sol).

**Real ML-DSA-87, not the mock.** These checks use the real algorithm:

- `npm run e2e:local` verifies every share it relays with `@qorechain/pqc`'s
  ML-DSA-87 against the exact bytes the vault's `quorumMessage` returns (CI).
- `npm run pq -- probe <account>` runs the kit's `PqAuth` against the real
  precompiles on the testnet in an `eth_call` (nothing is deployed or sent),
  through [`kit/test/live/PqAuthProbe.sol`](../kit/test/live/PqAuthProbe.sol).
- On chain, every v2 action in the README's table was accepted by the real
  `pqcVerify`; `npm run evidence` re-reads them through the QoreChain MCP server.

## Threats

What each attack does and what stops it, the Q-Day Drill included:
[THREAT_MODEL.md](../THREAT_MODEL.md).
