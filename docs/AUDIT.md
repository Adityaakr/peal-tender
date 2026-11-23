# Audit and post-quantum design

This file is what the Post-Quantum dApp category asks for: the two-stage QCAI
audit (the reports and what was done about each Stage 1 finding) and the
post-quantum design, meaning where the contracts call `pqcVerify` and
`pqcKeyStatus`, what each call protects, and which tests cover it.

- **Reports:** [`docs/audit/`](audit/), one PDF per stage, each named with its date.
- **Audited source:** [`audits/flattened/PealTenderV2.flat.sol`](../audits/flattened/PealTenderV2.flat.sol),
  the v2 vault and everything it compiles with. CI checks that it matches `src/`
  (`npm run flatten -- --check`), so the audited bytes are in git.
- **How each stage is run:** [`audits/README.md`](../audits/README.md). Both stages
  use the same audit setting, "Ethereum (EVM/Solidity)".
- **Scope:** v2 (`PealTenderV2`, `TenderBook`, `TenderClearing`, and `PqAuth` and
  `PqAuthSet` from qore-pq-kit v0.3.0). The drill vault (`src/PealTender.sol`) is
  the Q-Day Drill's deployed contract and stays as the drill judged it.

## The two stages

| Stage | Status | Report | Record |
| --- | --- | --- | --- |
| 1 | **not run yet** | `docs/audit/stage-1-qcai-<date>.pdf` | [`audits/stage-1.md`](../audits/stage-1.md) |
| 2 | **not run yet**; runs after every Stage 1 finding below is worked through | `docs/audit/stage-2-qcai-<date>.pdf` | [`audits/stage-2.md`](../audits/stage-2.md) |

### Stage 1 findings and what was done

Each finding is fixed (with the commit and the regression test that pins it),
or explained as not needing a contract change.

| ID | Severity | Finding | What we did | Regression test or reason |
| --- | --- | --- | --- | --- |
| | | *(filled in from the Stage 1 report)* | | |

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
