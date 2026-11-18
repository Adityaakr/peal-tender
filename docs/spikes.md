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
| T4 | What does a 2-of-3 action cost? | **Measured** (18 Nov) on the testnet for `sweep`, `openTender` and `startSealedSale`; the rest estimated (16 Nov) |
| T5 | Live checks on the testnet | **Settled** (18 Nov, the owner moved the deploy forward): deployed, a sealed 2-of-3 sweep, a sealed sale and a tender; the refusal demo and a rotation are still to run |
| T6 | Can the public RPC estimate the vault's creation? | **Settled** (18 Nov): no, it simulates with at most 5,000,000 gas; the chain accepts 30,000,000 |
| K1 | How does the fest site verify kits and network features? | **Settled** (16 Nov) by comparing all 67 project pages with their repositories and addresses |
| K2 | What do the MCP server, QoreScan and create-qorechain-dapp report for Tender? | **Settled** (16 Nov): all three run offline or read-only, results below |

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
| `sweep`, 2 of 3 | 123,239 | 2 | about 490k; **466,762 measured** (18 Nov) |
| `sweep`, 3 of 3 | 144,089 | 3 | about 680k |
| `openTender` | 301,760 | 2 | about 670k; **625,595 measured** (18 Nov) |
| `queue` (a sweep above the cap) | 198,335 | 2 | about 565k |
| `veto` (one signer) | 27,207 | 1 | about 220k |
| `execute` (a queued sweep) | 48,260 | 0 | about 70k |
| `settle` (permissionless, 10 ticks) | 127,021 | 0 | about 150k |
| `claim` | 44,020 | 0 | about 65k |
| `offer` | 230,881 | 0 | about 250k |
| `startSealedSale` | 1,224,709 with the mock factory, which deploys a full contract; the real factory makes a clone | 2 | **1,213,795 measured** (18 Nov, the real factory's clone) |
| `collectSealedSale` | 182,812 | 0 | about 205k |

The design's estimate for a 2-of-3 action was about 650k; these are below it. A
quorum action at about 0.5 to 0.7 million gas costs about 0.06 to 0.08 QOR at the
testnet's 112.5 gwei.

## T5. Live on the testnet (18 November 2026)

The owner moved the deploy forward to 18 November: v2's accounts and contracts are
separate from the drill's, and every v2 script refuses the drill's addresses
(`deploy:v2` took `--drill-day-ok` for the date). With the accounts in
`~/.qore-peal-tender/` (never the drill account):

1. **Done.** All five accounts registered their ML-DSA-87 keys and the three signers
   published ML-KEM-1024 keys; `TenderBook` and the vault were deployed
   (`0x79B2076a34b8CaBCF0120073cE0640165B287940`). The vault's constructor read all
   three keys through the real `pqcKeyStatus`. Hashes: README, "v2, live since
   18 November 2026".
2. **Measured** a real 2-of-3 `sweep` (proposed with QoreSign, sealed with QoreSeal,
   opened by the co-signer), `startSealedSale` and `openTender`: T4. `queue` and
   `veto` are still to measure.
3. **Still to run:** `npm run v2 -- refusal-demo` (a window scoped to
   [vault, fUSD, PEAL-T, factory] refuses a transaction to another address).
4. **Done.** A sealed buyback on the deployed Peal Sealed Auction, with its real
   committee set (`0xd6da…0fe5`): auction `0x19bCC6197b97fE53b111d19c350660753441082B`.
   The vault collects its result (`npm run v2 -- collect`) once the auction is final.
5. The fest faucet's fUSD did arrive this time (the owner's claim for `v2-relayer`),
   so the vault was funded with `fusd convert` and no AMM swap.

## T6. The public RPC cannot simulate the vault's creation (18 November 2026)

**Run:** `deploy:v2` failed at its first step, the gas estimate, with "contract
creation code storage out of gas", whatever gas limit was passed. Then:

- `eth_call` of init code that returns `gasleft()` (`0x5a5f5260205ff3`) with
  `gas` 5M, 10M and 30M: each returned 4,946,884, so the RPC clamps every
  simulation to 5,000,000 gas.
- Creations returning N zero bytes estimated normally up to 24,576 bytes
  (4,971,731 gas); a constructor that needs more than about 5M always failed.
- `GET /qorechain/pqc/v1/evm_limits`: `tx_max_gas` 30,000,000. The cap is the RPC's
  simulation limit, not the chain's.

**Settled:** the 23,131-byte vault needs about 5.3M gas, so `deploy:v2` takes
`--vault-gas`, measured on anvil (`npm run e2e:local` printed 5,866,458 with the
mock precompiles; plus 25%: 7,333,072) and checked against the chain's
`tx_max_gas`. The real creation used 5,324,071 (the live `pqcKeyStatus` costs less
than the mock). Every other v2 call is under 5M gas and estimates normally.

## K1. How the fest site verifies (16 November 2026)

**Run:** fetched `build.qorechain.io/projects` and every `/p/<slug>` page (67), read
each page's "Verified"/"Declared" chips, and read the dependency files of the
repositories whose chips differ (via the GitHub API) and the history of the addresses
some of them publish in their READMEs (testnet REST).

**Found:**

- The project form says kits are checked in "your repo's dependency files" and
  features "on chain" for the listed `qor1` addresses (up to 5).
- A kit is verified when its npm package is a dependency in any `package.json`,
  nested ones included: e.g. `@qorechain/qorescan` in a root `package.json`,
  `@qorechain/handles` in `web/package.json`. `create-qorechain-dapp` is verified only
  for the 5 projects that list `create-qorechain-dapp` itself; Tender, which used the
  template but did not list the package, showed "Declared". `MCP + qore CLI` needs
  `@qorechain/mcp`: a project with its own MCP server and no `@qorechain/mcp` shows
  "Declared".
- The QoreScan and "MCP server or qore CLI" features are verified for exactly the
  projects with those packages, so they come from the repository too.
- "Test tokens" is verified for addresses that received fUSD, fETH and fBTC in one
  `MsgSend` from `qor178nscfyp0cq2ac5x7un4u98xrj4ayp6pt0kw08` (the fest-token side of
  the faucet; the QOR side is `qor1wv0fvt5qzx7gllk9ckzv3u6ypceaqq8evuny0h`). The drill
  account's AMM swap into fUSD on 15 November did not verify it.
- Nobody has "Solidity PQC signature check", "Solidity PQC key status", "Sign In With
  QoreChain", staking tiers, cross-VM, IBC, light node, native contracts, sidechain or
  RDK rollup verified.

## K2. The kit tools against Tender (16 November 2026)

- **MCP server** (`@qorechain/mcp` 0.1.1, tools called in-process): all 15 evidence
  transactions read back. `get_pq_status` reports the window, swap and convert
  transactions as tier `pqc`, one ML-DSA-87 layer, `verified: true`, sign-bytes `v2`;
  the key registration as tier `enrollment` (no layer, as the chain requires); the
  vault calls as tier `classical` (EVM lane), all `success: true`.
- **QoreScan** (`@qorechain/qorescan` 0.1.0, the Go binary it downloads and checks by
  SHA-256): 13 Solidity files. ML-DSA-87 found as `pqcVerify` (`PqAuth.sol:38`) and
  `pqcKeyStatus` (`PqAuth.sol:39`); Keccak-256 for hashing; no `ecrecover`. Both testnet
  endpoints negotiate TLS 1.3 with `X25519MLKEM768`. The chain reports hybrid
  signatures `required`, `allow-classical-fallback: false`, and `pqcVerify` and
  `pqcKeyStatus` among the active precompiles.
- **create-qorechain-dapp** 0.14.0 `--template foundry --yes --no-install` scaffolds
  offline. Its `foundry.toml` has the same `solc_version` (0.8.28), optimizer and runs
  (200) as Tender's, and its RPC and the SDK preset match every endpoint and chain id
  Tender writes down (17 checks).
- **wallet-adapter** 0.6.0 declares `@cosmjs/stargate ^0.32` as a peer; Tender uses
  0.39. The functions Tender uses (`qorexSignAndBroadcast`, `isQorexRejection`,
  `addQoreEvmToWallet`, `isEvmWindowRejection`) do not touch cosmjs, so a scoped npm
  `overrides` entry points the peer at Tender's version.

