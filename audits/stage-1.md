# QCAI audit, stage 1

**Status: run by the owner on 24 November 2026 (UTC); every finding worked through.** No
contract source changed and nothing was redeployed. The report did not come back clean: it
scores the contracts 72/100, risk MEDIUM, with five findings.

| Field | Value |
| --- | --- |
| Report generated | 24 November 2026 18:38:13 UTC, which is 25 November 2026 00:08:13 India time (UTC+05:30). The report prints "11/25/2026, 12:08:13 AM" with no zone; the PDF's own `CreationDate` is `20261125000813+05'30'` |
| Report | [`docs/audit/stage-1-qcai-2026-11-25.pdf`](../docs/audit/stage-1-qcai-2026-11-25.pdf), byte for byte as downloaded; the date in its name is the India date it prints |
| Report sha256 | `a6216ae0d6aafdea16638b0b0677b5a99f25a2c39c6968b7d58ccab1a8f96502` |
| Audited file | [`audits/flattened/PealTenderV2.flat.sol`](flattened/PealTenderV2.flat.sol), as pasted by the owner (the report itself carries no hash of its input) |
| Audited file sha256 | `684e6dafc88d5ae34245e9f1979f1b4d3ed3b310212ed1c4be0039b9730fbdd6` |
| Audited source commit | `b20b082` (`main` that day). The file and `src/` have not changed since `413855a` |
| Audit setting | The page's dropdown showed "Auto-detect from code", not "Ethereum (EVM/Solidity)" as planned. The report resolved it: "Blockchain: ethereum" |
| Risk level | MEDIUM |
| Security score (0 to 100) | 72 |
| Post-quantum readiness | "not scored for this setting" (expected for EVM settings, [fest FAQ](https://build.qorechain.io/faq)) |
| Findings | 5: 2 medium, 2 low, 1 informational |
| Deployed code | The audited source is what runs on the testnet. On 24 November 2026 the runtime bytecode of the vault `0x79B2076a34b8CaBCF0120073cE0640165B287940` and of `TenderBook` `0xb06D322fAB9503D59f980D3A67Da5EBA236AAB10`, read with `eth_getCode`, equalled this repository's build in every byte except the constructor's immutables, the library's link address (all ten are that `TenderBook`) and the library's own address |

## Findings

The PDF's table gives each finding's title, severity, location and recommendation. The
longer wording came from the owner with the report.

| ID | Severity | Finding | Our assessment | Resolution | Fix commit |
| --- | --- | --- | --- | --- | --- |
| 1 | MEDIUM | Missing Access Control on Critical Functions (`src/PealTenderV2.sol:1073`): anyone can call `collectSealedSale` | Not exploitable; open by design | Regression tests; no contract change | none needed |
| 2 | MEDIUM | Potential Overflow in Daily Cap Calculation (`src/PealTenderV2.sol:734`): `_spend` | Not as described, and not reachable on the live vault. Looking for it found a real gap next to it: the constructor does not bound the first cap | Regression tests, one of which pins the gap; `scripts/v2/deploy.ts` now refuses such a cap; no contract change | `scripts/v2/deploy.ts`, with the tests |
| 3 | LOW | Potential Reentrancy in External Calls (`src/TenderBook.sol:100`): DELEGATECALL to the library | Not exploitable; the recommended guards are in place | Regression tests; no contract change | none needed |
| 4 | LOW | Unbounded Loop in Sale List Management (`src/PealTenderV2.sol:110`): `_saleList` | False positive: no loop reads the list | Regression tests; no contract change | none needed |
| 5 | INFO | ERC-1363 Support (`src/PealTenderV2.sol:115`) | Intended: ERC-1363 is not used | Regression tests; no contract change | none needed |

The reasoning, with the code lines and the test names, is in
[`docs/AUDIT.md`](../docs/AUDIT.md#stage-1-findings-and-what-was-done).

## The report's line numbers

They point neither into `src/` nor into the flattened file, so each finding was matched by
the function it names. In the flattened file a line of `src/PealTenderV2.sol` is at +3,445
and a line of `src/TenderBook.sol` at +3,149.

| ID | Report says | What is there | The code it means (`src/`) | In the flattened file |
| --- | --- | --- | --- | --- |
| 1 | `PealTenderV2.sol:1073` | nothing: `src/PealTenderV2.sol` has 642 lines. Line 1073 of the flattened file is in OpenZeppelin's `SafeCast` | `collectSealedSale`, `PealTenderV2.sol` L445-464 | L3890-3909 |
| 2 | `PealTenderV2.sol:734` | nothing, as above; also in `SafeCast` | `_spend`, L578-587, with `remainingToday`, L502-507 | L4023-4032, L3947-3952 |
| 3 | `TenderBook.sol:100` | a field of `event Claimed` | the vault's calls into the library, `PealTenderV2.sol` L282, L286, L291, L293, L422, L428, L438 (and the views L544, L548, L553); the library's token calls, `TenderBook.sol` L218, L264, L265 | L3727, L3731, L3736, L3738, L3867, L3873, L3883 (L3989, L3993, L3998); L3367, L3413, L3414 |
| 4 | `PealTenderV2.sol:110` | `enum OpState {` | `_saleList`, L165, used at L340, L557, L561 only | L3610, L3785, L4002, L4006 |
| 5 | `PealTenderV2.sol:115` | the closing brace of `enum OpState` | OpenZeppelin's `IERC1363` and the helpers in `SafeERC20` that take it; nothing in `src/` | L2888, L3058, L3073, L3098 |

## How the findings were tested

Each finding was first attacked: [`test/v2/Audit1.t.sol`](../test/v2/Audit1.t.sol) holds
the exploit attempts, now kept as 18 regression tests. To check that the tests can fail, 22
one-line mutants of the vault were run against them in a scratch copy. They included a
collection without each of its checks, a narrower or unchecked daily counter, each of the
13 `nonReentrant` functions without the guard, a loop over the sale list, and an ERC-1363
receiver. The tests caught all 22.
