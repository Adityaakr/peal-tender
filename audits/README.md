# Audits: the two-stage QCAI audit of Peal Tender v2

The Post-Quantum dApp category asks for a "two-stage QCAI audit". The only audit
tool QoreChain offers is the dashboard's **Contract Auditor**
(`dashboard.qorechain.io/audit`): paste source code, get a risk level, a 0 to 100
security score, a post-quantum readiness percentage, findings and a PDF. It needs
the owner's dashboard sign-in, has no API, and gives one free audit per account
per UTC day, so the two stages fall on two different days. We read "two-stage" as
audit, fix the findings, audit the fixed source again, and keep both reports here.

| Stage | Planned date (UTC) | Source audited | Who |
| --- | --- | --- | --- |
| 1 | about 22 November 2026 | the v2 contracts at that day's `main` | **owner** runs the auditor; the worker fixes findings |
| 2 | 29 November 2026 (freeze) | the frozen source, after the stage 1 fixes | **owner** runs the auditor |

The drill vault (`src/PealTender.sol`) is the Q-Day Drill's deployed contract and
is judged as deployed; it is not in scope and is not changed.

## Scope

`audits/flattened/PealTenderV2.flat.sol` is one file holding everything the vault
compiles with:

| Part | File | Ours? |
| --- | --- | --- |
| The vault | `src/PealTenderV2.sol` | yes |
| The tender engine (linked library) | `src/TenderBook.sol` | yes |
| The clearing rule (ported from Peal) | `src/TenderClearing.sol` | yes |
| The auction interface | `src/interfaces/ISealedAuction.sol` | yes |
| Post-quantum authorisation | `PqAuth.sol`, `PqAuthSet.sol` from `qore-pq-kit` v0.3.0 | yes (our toolkit) |
| ERC-20 helpers, re-entrancy guard, math | OpenZeppelin Contracts 5.1.0 | no |

## Steps for each stage (owner)

1. On the commit to audit: `npm run flatten`. It writes the flattened file and prints
   its sha256 and the source commit. If the file changed, commit it first, so the
   audited bytes are in git.
2. Open `dashboard.qorechain.io/audit`, sign in, paste
   `audits/flattened/PealTenderV2.flat.sol`, run the audit.
3. Download the PDF report and save it as `audits/stage-1/qcai-report.pdf` (or
   `stage-2/`). Note the risk level, the security score and the PQ readiness.
4. Hand the PDF to the worker (or commit it yourself). The worker fills in
   `audits/stage-N.md`: the audited commit, the file hash, the scores, and one row
   per finding with what was done about it (fixed in commit X, or not a bug and why).

CI runs `npm run flatten -- --check`, so the committed flattened file always
matches `src/`.

## Records

- [Stage 1](stage-1.md)
- [Stage 2](stage-2.md)
