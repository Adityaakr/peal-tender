# Spikes: facts Peal Tender v2 depends on

Settled by experiment, not by reading docs, because the QoreChain docs contradict
themselves and the testnet changes fast. Each entry says what was run, when, and
what it printed. The kit's own spikes (precompile gas, CORS, modexp) are in
`qore-pq-kit`'s `docs/spikes.md`; this file cites them where v2 relies on them.

| # | Question | Status |
| --- | --- | --- |
| T1 | Can v2 use `qore-pq-kit` by git tag while the drill keeps the in-repo `kit/`? | **Settled** (16 Nov): yes |
| T2 | Does the v2 vault fit the 24,576-byte contract size limit? | **Settled** (16 Nov): only with the tender engine in a linked library |
| T3 | Does the vault's `ISealedAuction` match the real Peal Sealed Auction, and does a buyback run end to end? | **Settled** (16 Nov) against peal-sealed-auction `main` at `f502616` |
| T4 | What does a 2-of-3 action cost? | **Estimated** (16 Nov) from local measurement plus the kit's live precompile costs; to be measured on testnet after 19 Nov |
| T5 | Live checks on the testnet | **Open**: no testnet deploys before 19 November 2026 00:00 UTC |

## T1. The kit by tag beside the drill's copy (16 November 2026)

**Run:** `forge install Adityaakr/qore-pq-kit@v0.3.0 --no-git` into `lib/`, then
`diff` against the in-repo `kit/`.

**Found:**

- `src/PqAuth.sol`, `src/IQorePQC.sol`, `test/PqTestBase.sol` and all of
  `test/mocks/` are byte-identical in `kit/` and in v0.3.0. v0.3.0 adds
  `PqAuthSet.sol` (the t-of-n signer set) and the threshold and messaging modules.
- Both copies compile in one Foundry project. The drill vault keeps the
  `qore-pq-kit/` remapping (to `kit/src/`), so its build and the artifact
  `out/PealTender.sol/PealTender.json` that `DRILL.md`'s commands read are
  unchanged. v2 uses `pqkit/` (to `lib/qore-pq-kit/src/`). After the drill (from
  19 November) the drill can move to the tag too and `kit/` can go.
- TypeScript: npm accepts a git tag under another name,
  `"pqkit": "git+https://github.com/Adityaakr/qore-pq-kit.git#v0.3.0"`, beside the
  `qore-pq-kit` workspace. npm still writes the lock entry as `git+ssh://…`;
  CI rewrites ssh to https (`git config url."https://github.com/".insteadOf
  "ssh://git@github.com/"`), as the auction repository does.
- The kit's `loadAccount` and `openWindow` read `~/.qore-drill/<name>.env`, so v2
  loads its own accounts from `~/.qore-peal-tender/` (`scripts/v2/accounts.ts`)
  and builds the window messages itself (`scripts/v2/window.ts`), with the kit's
  `broadcast` doing the hybrid signing.

## T2. Contract size (16 November 2026)

**Run:** `forge build --sizes` (solc 0.8.28, optimizer 200 runs, as the drill).

| Build | `PealTenderV2` runtime | Margin |
| --- | --- | --- |
| Everything in one contract | 27,195 B | -2,619 |
| Same, `via_ir` | 26,312 B | -1,736 |
| Same, `via_ir`, 1 optimizer run | 25,687 B | -1,111 |
| Views removed (to measure them) | 24,242 B | 334 |
| **Tender engine in the linked library `TenderBook`** | **23,131 B** (library 8,453 B) | **1,445** |

The views alone cost about 3 KB, so trimming could not make room. `TenderBook`
has external functions that take the vault's storage (`TenderBook.Book storage`)
and run by DELEGATECALL, so the funds and the state stay in the vault. The rules
are the drill vault's, unchanged; its tests (offers, clearing, claims, rounding
dust, fee-on-transfer) run against v2 too.

**Deploying it** needs the library first and its address patched into the
vault's creation code (`link()` in `scripts/v2/vault.ts`, from Foundry's
`linkReferences`). Checked on a local anvil node (chain id 9800, mock
precompiles installed with `anvil_setCode`): the library and the linked vault
deployed, a 2-of-3 `sweep` and an `openTender` (which runs in the library)
succeeded, and `getTender` read the new tender back through the library.

## T3. The sealed sale against the real auction (16 November 2026)

**Run:** in a scratch checkout of `Adityaakr/peal-sealed-auction` at `main`
(`f502616`), copy `PealTenderV2.sol`, `TenderBook.sol`, `TenderClearing.sol` and
`ISealedAuction.sol` in, and write a test on the auction's own `AuctionBase`
fixture (its `CommitteeRegistry`, `SealedAuction` and `SealedAuctionFactory`,
mock precompiles, a 2-of-3 committee). Nothing from that checkout is in this
repository; Tender carries only the interface file.

**The test:** a 2-of-3 vault holding 500 fUSD signs `startSealedSale` selling
100 fUSD for PEAL-T (reserve 5 PEAL-T per fUSD, ticks of 1 PEAL-T, 8 ticks).
Two bidders seal bids, 60 fUSD at 9 PEAL-T and 70 fUSD at 7 PEAL-T; the commit
closes, members 1 and 2 release, the bids open and the auction finalizes; a
stranger calls `collectSealedSale`.

**Printed:** both tests passed.

- The factory accepted the vault's `Config` tuple, pulled exactly 100 fUSD, and
  opened the auction; the vault's approval to the factory was back to zero.
- The auction cleared at one price, 7 PEAL-T per fUSD: the vault received
  700 PEAL-T for its 100 fUSD, with no unsold fUSD (`returned = 0`).
- `cancelSealedSale` before any bid returned all 100 fUSD and left the auction
  `Cancelled`.

So `ISealedAuction.Config` matches `SealedAuction.Config` field for field, and
D2 (the buyback is the vault selling fUSD for PEAL-T on the forward auction)
works without a second clearing rule.

## T4. Gas (16 November 2026)

**Run:** `npm run snapshot` (`test/v2/Gas.t.sol`) measures each vault call alone
with near-free stand-ins for the two precompiles, written to
`snapshots/GasTest.json`. On QoreChain each signature adds what the kit measured
live on 16 November (kit spike S6): about 92k for `pqcVerify` at a 256-byte
message, 6k for `pqcKeyStatus`, and about 74k for the 4,627-byte signature as
calldata, so about 172k per signature, plus the 21k transaction base.

| Call | Vault alone | Signatures | Estimated on QoreChain |
| --- | --- | --- | --- |
| `sweep`, 2 of 3 | 123,239 | 2 | about 490k |
| `sweep`, 3 of 3 | 144,089 | 3 | about 680k |
| `openTender` | 301,760 | 2 | about 670k |
| `queue` (a sweep above the cap) | 198,335 | 2 | about 565k |
| `veto` (one signer) | 27,207 | 1 | about 220k |
| `execute` (a queued sweep) | 48,260 | 0 | about 70k |
| `settle` (permissionless, 10 ticks) | 127,021 | 0 | about 150k |
| `claim` | 44,020 | 0 | about 65k |
| `offer` | 230,881 | 0 | about 250k |
| `startSealedSale` | 1,224,709 with the mock factory, which deploys a full contract; the real factory makes a clone | 2 | to measure |
| `collectSealedSale` | 182,812 | 0 | about 205k |

The design's estimate for a 2-of-3 action was about 650k; these are below it. A
quorum action at about 0.5 to 0.7 million gas costs about 0.06 to 0.08 QOR at the
testnet's 112.5 gwei.

## T5. Still to run on the testnet (after 19 November 00:00 UTC)

With fresh accounts in `~/.qore-peal-tender/` (never the drill account):

1. Register the three signers' ML-DSA-87 keys; deploy `TenderBook` and the vault
   (`npm run deploy:v2`); record the addresses.
2. Measure a real 2-of-3 `sweep`, `queue`, `veto` and `startSealedSale` against T4.
3. `npm run v2 -- refusal-demo`: a window scoped to
   [vault, fUSD, PEAL-T, factory] refuses a transaction to another address.
4. A sealed buyback on the deployed Peal Sealed Auction, once that is deployed.
