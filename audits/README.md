# Audits: the two-stage QCAI audit of Peal Tender v2

The Post-Quantum dApp category asks for a "two-stage QCAI audit". The only audit
tool QoreChain offers is the dashboard's **Contract Auditor**
(`dashboard.qorechain.io/audit`): paste source code, get a risk level, a 0 to 100
security score, a post-quantum readiness percentage, findings and a PDF. It needs
the owner's dashboard sign-in and has no API. When we planned the stages the page
offered a free audit per day; we know no hard limit of one per day, and other entries'
public reports show both stages dated the same day. Our rule is **free only, and the
owner decides when**: if the page asks for a payment, credits or an upgrade, stop. We
read "two-stage" as audit, work through every finding, audit again, and keep both
reports in [`docs/audit/`](../docs/audit/) (the fest's FAQ: stage 2 is "a second QCAI
run after you have worked through every Stage 1 finding").

| Stage | Date (UTC) | Source audited | Who |
| --- | --- | --- | --- |
| 1 | **run** 24 November 2026 18:38 UTC (00:08 on the 25th in India): 72/100, MEDIUM, 5 findings | `audits/flattened/PealTenderV2.flat.sol` at `b20b082` | **owner** ran the auditor; a worker worked through the findings ([record](stage-1.md)) |
| 2 | **not run yet**; when the owner decides, before 2 December 2026 23:59 UTC (submissions close) | the same file: the source did not need to change | **owner** runs the auditor |

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

## Stage 2, exactly (owner)

1. Run it when you choose, as long as the page offers it free. If it asks for a payment,
   credits or an upgrade, stop and try another day; **never pay**.
2. On `main`, check that the file is still the one stage 1 audited:

   ```sh
   shasum -a 256 audits/flattened/PealTenderV2.flat.sol
   # 684e6dafc88d5ae34245e9f1979f1b4d3ed3b310212ed1c4be0039b9730fbdd6
   ```

   The source is unchanged, so paste **the same file**. A different hash means the source
   changed: stop and ask before auditing.
3. Open `dashboard.qorechain.io/audit`, sign in, and set the audit setting to
   **"Ethereum (EVM/Solidity)"**. Do not leave "Auto-detect from code", and do not pick
   "QoreChain (CosmWasm + PQC)": it is for CosmWasm contracts. (Stage 1 was left on
   auto-detect, which resolved to ethereum, so the two reports compare.)
4. Paste the whole file (4,088 lines) and run the audit once.
5. Read the report before downloading: it must say **"Blockchain: ethereum"**. If it says
   anything else, keep that PDF too, hand it over, and run again when it is free.
   "Quantum Readiness: not scored for this setting" is expected.
6. Download the PDF, do not edit it or print it to a new PDF, and hand it over with the
   date and time, the setting shown on the page and the finding texts shown on the page
   (the PDF has only titles). It becomes `docs/audit/stage-2-qcai-YYYY-MM-DD.pdf`.
7. A worker fills in [`stage-2.md`](stage-2.md) and the stage 2 row of
   [`docs/AUDIT.md`](../docs/AUDIT.md). The score may go down as well as up and findings
   may repeat; the fest FAQ says neither is bad by itself.

## Steps for each stage (owner)

1. On the commit to audit: `npm run flatten`. It writes the flattened file and prints
   its sha256 and the source commit. If the file changed, commit it first, so the
   audited bytes are in git.
2. Open `dashboard.qorechain.io/audit`, sign in, paste
   `audits/flattened/PealTenderV2.flat.sol`, run the audit.
3. Download the PDF report and save it as `docs/audit/stage-1-qcai-YYYY-MM-DD.pdf`
   (or `stage-2-…`), dated the day it ran: the fest's FAQ asks for both reports in
   `docs/audit/`, each with its date. Note the risk level, the security score and
   the PQ readiness. Use the audit setting "Ethereum (EVM/Solidity)"; the report must read
   "Blockchain: ethereum". (Stage 1 was run with "Auto-detect from code", which resolved to it.)
4. Hand the PDF to the worker (or commit it yourself). The worker fills in
   `audits/stage-N.md`: the audited commit, the file hash, the scores, and one row
   per finding with what was done about it (fixed in commit X, or not a bug and why).
   Stage 1's findings also go into the table in [`docs/AUDIT.md`](../docs/AUDIT.md),
   each with its regression test or the reason no contract change is needed.

CI runs `npm run flatten -- --check`, so the committed flattened file always
matches `src/`.

## Cryptographic inventory (QoreScan)

Beside the QCAI reports, [`cbom/peal-tender.cdx.json`](cbom/peal-tender.cdx.json) is a
CycloneDX 1.6 CBOM from QoreScan (`npm run cbom`): every cryptographic primitive the
contracts use and where (ML-DSA-87 through `pqcKeyStatus` and `pqcVerify` in
`PqAuth.sol`, Keccak-256 for message hashing, no `ecrecover`), the TLS of the testnet
endpoints the app uses, the chain's PQC parameters and the treasury signer's key.
Regenerate it on the audited commit so the inventory and the reports describe the same
source; `npm run cbom:check` checks it.

## Records

The summary judges read first is [`docs/AUDIT.md`](../docs/AUDIT.md): the two stages,
each Stage 1 finding and what was done, and where the contracts call `pqcVerify` and
`pqcKeyStatus`, what each call protects and which tests cover it.

- [Stage 1](stage-1.md)
- [Stage 2](stage-2.md)
