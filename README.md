# Peal Tender

A treasury buyback vault on QoreChain whose every treasury action needs a fresh
post-quantum signature.

A project's treasury keeps its payment token (fUSD on the testnet) in the vault and
runs buyback **tenders** from it: it opens a tender with a budget and a price
ladder, token holders offer tokens at a minimum price, the tender clears at **one
price**, sellers are paid and the bought tokens stay in the vault.

Every action that moves treasury money or changes the rules (funding, opening,
cancelling, settling, sweeping, changing the signer) must carry an **ML-DSA-87
signature** by the treasury's signer account, which the contract checks on chain
with QoreChain's `pqcKeyStatus` and `pqcVerify` precompiles. Being the sender is
never enough. So whoever steals the signer account's classical (secp256k1) key, as
the Q-Day Drill's attacker does, cannot move anything.

Entry for the QoreChain "Build Before Q-Day" hackathon, Post-Quantum dApp
category, and its Q-Day Drill.

## Status

- **v1, the drill vault** (`PealTender`): a minimal first version with one signer,
  deployed on the testnet for the Q-Day Drill (18 November 2026). It stays exactly
  as deployed; the drill judges it as it is.
- **v2, the full build** (`PealTenderV2`): a 2-of-3 post-quantum signer set, a
  timelock with a daily cap, permissionless settlement, and buybacks run as sealed
  sales on [Peal Sealed Auction](https://github.com/Adityaakr/peal-sealed-auction).
  Written and tested (unit, fuzz, invariant, cross-language vectors), checked end to
  end against the real auction contracts, **not deployed yet**: no testnet deploys
  before 19 November 2026 00:00 UTC. [See below](#peal-tender-v2-the-full-build).

Neither version is audited yet; the two-stage QCAI audit of v2 is prepared in
[`audits/`](audits/README.md).

## Deployed (testnet `qorechain-diana`, EVM chain id 9800)

| What | Address |
| --- | --- |
| `PealTender` vault | `0xc3EA5683C1f8D8594A1865D169D98B509b057D41` |
| `PealTestToken` (tPEAL, the token bought back) | `0x6dE33E6D9f106427fb0bee52a61BaD6CdEE01784` |
| Payment token fUSD (the fest token, not ours) | `0x97143B771D34ddb9130b807b135Ae675A5a963CA` |
| Drill account = the vault's signer | `0x1453faDA276086E39A87CA39C1CD1F754cbf56bF` / `qor1z3fl4k38vzrw8x58eguurnglw4xt744lked87j` |
| Ops account (holds tPEAL, plays the holders) | `0xdA940905B6665BdA3Dcdb000030c830B74D4659F` / `qor1m22qjpdkveda50wdkqqqxryrpd6dgevlzf5pd5` |

The full record is in [`deployments/qorechain-diana.json`](deployments/qorechain-diana.json).
Transactions of the first run, 15 November 2026:

| Step | Transaction |
| --- | --- |
| Register the drill account's ML-DSA-87 key (with proof of possession) | `EE186C02BE81475FFDB9364BB796A48B08593733463B4218EC247BF68C82023C` |
| Open an unscoped window for the deployment | `452A9F36AA146527A01DA5A402849D880C129A0A7DAD0F09B1E91955D4AA93CD` |
| Deploy tPEAL | `0xa3e87b068d6ec805707c1fc8950c575f9020e7183ea3a93da5be794f62042cd8` |
| Deploy the vault | `0x0690038331502520cf45a426dcd83efc53c294fa52be5920c31ec6b570c7d123` |
| Fund the vault with 70 QOR | `0x6f13abf1881778082cef33d6982df02535c6a4c816ddfc1155257b05b4233b4a` |
| Close the window | `147F956D82B840D3EEA748A7F82E9D634DBA9BC87D259934BC9DF74549352D30` |
| PQ-signed `sweep` of 3 QOR to the ops account | `0x3801d22e00ed7d6be98cfa77972b7ea4488c89dc7833d083cf6b9fa1a8bc82eb` |
| Swap 2.5 QOR for 0.202817 fUSD (AMM pool 2) | `47603E2DA8C8BFC82B63D46FD0FF525168684A51DA03BE99E7D7D329F1958787` |
| `MsgConvertCoin` of that fUSD straight into the vault | `191073279F92FF8D5BC15299C67E3BB9C4C2FD3D0A59060BDCACEFCF0A70589A` |
| PQ-signed `openTender` (tender 1: budget 0.1 fUSD) | `0x501ace7d5040b16fc147c4290f8aed80c10fc293d9f19e50b52746167af3bc76` |
| Offers: 60 tPEAL at 0.0010, 50 tPEAL at 0.0013 fUSD | `0x69194b6377f2c3163932278b7a47dc1a530283c39b59136874e7bacd79d3ac73`, `0x51f3e77414ddd036bb2b6854e35d6667cf2f82bbe601bac88498c4f1286a6185` |
| PQ-signed `settle`: clears at tick 3 (0.0013 fUSD), 76.92 tPEAL bought, the 0.0013 offer filled pro-rata | `0x39c0cc40ebd12f4e9bfcc453a245d290efb762def3c387802d23b6eef5ca3cc4` |
| Claims: 60 tPEAL sold for 0.078 fUSD; 16.92 of 50 tPEAL sold for 0.021999 fUSD, 33.08 returned | `0x2084f9436017c57596168569a0d40254e8e0095e00006779559b73f1873638fb`, `0xed5a808ff4dbefa5910d326768a5a6b5e18bd8f1641c1e63b03fcfd2a177ca1c` |

Tender 1 spent 0.099999 of its 0.1 fUSD budget; both sellers were paid the same
price, above the 0.0010 minimum of the cheaper one. After it, the vault holds
67 QOR and 0.102818 fUSD (all free) plus the 76.92 tPEAL it bought.

Native-lane hashes are upper-case, EVM hashes are `0x…`. Every window opened for these
steps was closed again; the drill account has no live window, holds no ERC-20 tokens
and has granted no approvals.

**Check them yourself.** `npm run evidence` re-reads every transaction above
([`deployments/evidence.json`](deployments/evidence.json)) through the QoreChain MCP
server's own tools and says, for each, whether it succeeded and whether the chain
verified its ML-DSA-87 layer. One hash by hand: `npm run qore -- pq status <hash>`.

## How it works (v1, the drill vault)

```
 treasury signer (drill account)            anyone (relayer, holder, attacker)
 ML-DSA-87 key derived from its mnemonic
        │ signs message(chain 9800, vault,                │ sends the transaction
        │   signer, action, nonce, deadline, args)        ▼
        └──────────────── signature ───────────►  PealTender.sweep(token, to, amount, deadline, sig)
                                                         │
                                       PqAuth.authorize  │ 1. pqcKeyStatus(signer) at 0x…0a02:
                                                         │    registered, ML-DSA-87, possession proven
                                                         │ 2. pqcVerify(key, sig, message) at 0x…0a01
                                                         │ 3. nonce += 1
                                                         ▼
                                                   funds move (only the free balance)
```

- **The library** is [`kit/src/PqAuth.sol`](kit/src/PqAuth.sol): the reusable part, in
  its own directory with its own tests ([`kit/README.md`](kit/README.md)).
- **The vault** is [`src/PealTender.sol`](src/PealTender.sol). The money it owes is
  kept apart from the money it may spend: `reservedPay` (a tender's budget, then
  what its sellers can still be owed) and `escrowedBuy` (sellers' tokens). Only the
  rest can be swept or budgeted.
- **The clearing rule** is [`src/TenderClearing.sol`](src/TenderClearing.sol): the
  price climbs from the cheapest offer while the budget pays every offer at or below
  it; offers at the marginal tick share pro-rata; nobody is paid below their minimum;
  payments never exceed the budget; settlement scans price ticks, never offers.
- **Funding without approvals.** fUSD arrives from the faucet as a bank coin. A
  `MsgConvertCoin` with the vault as receiver turns it into the vault's ERC-20
  balance directly, so the plain account never holds the token or approves anyone.
- **Windows.** Every EVM transaction on QoreChain needs a live authorisation window,
  opened by a hybrid-signed native message. The scripts open one scoped to the vault,
  sized for exactly the transactions they send, and close it in a `finally` block. The
  one exception is deployment, because a scoped window refuses contract creation.

The drill and the other threats are worked through in [THREAT_MODEL.md](THREAT_MODEL.md);
the registration and drill-day steps are in [DRILL.md](DRILL.md).

## Peal Tender v2: the full build

v2 is a new contract beside the drill vault, with new addresses and new accounts.
It keeps v1's tender and accounting rules and changes who holds the authority.

```
 3 treasury signers, each with its own                anyone (relayer, holder, keeper)
 ML-DSA-87 key on chain                                      │ sends the transaction
   │ npm run sign-action (each on its own machine)           ▼
   └─ 2 shares over message(chain, vault, member,     PealTenderV2.sweep(token, to, amount, auth)
        quorum(action), set nonce, deadline, args)           │
                                     PqAuthSet.authorizeQuorum│ for each share, strictly ascending signers:
                                                             │   pqcKeyStatus(member): ML-DSA-87, possession proven
                                                             │   pqcVerify(key, share, message)
                                                             │ set nonce += 1
                                                             ▼
                              within today's allowance? ── yes ──► funds move now
                                                         no ──► refused: queue it, wait the delay,
                                                                any one signer can veto meanwhile
```

| Action | Needs |
| --- | --- |
| `sweep` (within the daily cap), `deposit`, `openTender`, `cancelTender` | 2 of 3 signatures |
| `startSealedSale`, `cancelSealedSale` | 2 of 3 signatures |
| `queue` a change: the signer set, the delay, a daily cap, the auction factory, or a sweep above the cap | 2 of 3 signatures, then the delay |
| `execute` a queued change after its delay | anyone |
| `veto` a queued change | **any one** signer's signature |
| `settle` a tender after its end, `claim`, `collectSealedSale` | anyone |
| `offer` | a holder, with their own tokens |

- **The signer set** is `qore-pq-kit`'s [`PqAuthSet`](https://github.com/Adityaakr/qore-pq-kit/blob/v0.3.0/src/PqAuthSet.sol)
  (tag v0.3.0): every member's key is read live from `pqcKeyStatus` at each check;
  all members sign the same set nonce, consumed once per action; quorum shares and
  single-member vetoes are signed under different domains, so one can never pass as
  the other, and neither can v1's single-signer format.
- **Bounding a key compromise.** Even two stolen post-quantum keys can only move
  the payment token at the daily cap's rate: sweeps, tender budgets and sealed-sale
  supplies all draw on one per-token allowance (`dailyCap`, 0 for tokens without
  one). Anything larger, and every rule change, waits in the queue for `delay`,
  where any single honest signer can veto it. Executing a signer-set change voids
  every other queued change.
- **Permissionless settlement.** The clearing is deterministic, so anyone may
  settle a tender once it ends; settlement no longer depends on a key holder.
  `cancelTender` stays gated.
- **Sealed buybacks** (design decision D2). `startSealedSale` makes the vault the
  issuer of a Peal Sealed Auction that sells fUSD for PEAL-T: a bid of "X PEAL-T per
  fUSD" is an offer to sell PEAL-T at 1/X fUSD, so the forward auction clears the
  buyback at one price. The vault checks the config (issuer = vault, sale token =
  fUSD, quote token = PEAL-T, no fee), approves exactly the supply to the factory
  and clears the approval in the same call, and records the auction only if the
  factory lists it. The factory itself is set through the timelock. Proceeds and
  unsold fUSD can only go to the issuer, so `collectSealedSale` is open to anyone.
  Peal Tender imports nothing from the auction repository: only
  [`src/interfaces/ISealedAuction.sol`](src/interfaces/ISealedAuction.sol).
- **Size.** The tender engine lives in a linked library,
  [`src/TenderBook.sol`](src/TenderBook.sol), that runs on the vault's own storage
  by DELEGATECALL; everything else is in
  [`src/PealTenderV2.sol`](src/PealTenderV2.sol) (23.1 KB of the 24 KB limit).
  Measurements and the end-to-end check against the real auction are in
  [`docs/spikes.md`](docs/spikes.md).

### Operating v2

Accounts live in `~/.qore-peal-tender/<name>.env` (mode 0600), never in the drill's
directory; every v2 script refuses the drill account and the drill contracts. The
testnet deployment, from 19 November, follows [`docs/v2-runbook.md`](docs/v2-runbook.md);
`npm run v2 -- preflight` prints a read-only checklist of what is still missing.

```sh
npm run v2 -- account new v2-signer-a      # and -b, -c, v2-relayer, v2-deployer
npm run v2 -- account register v2-signer-a # once funded: ML-DSA-87 key, proof of possession
npm run deploy:v2 -- --buy <PEAL-T> --factory <SealedAuctionFactory> --delay 900 --cap 1000000

# a quorum action: propose, two signers sign (on their own machines), relay
npm run v2 -- propose sweep fusd <to> 250000 --as v2-signer-a   # signed by its proposer (QoreSign)
npm run sign-action -- <proposal.json> --as v2-signer-a
npm run sign-action -- <proposal.json> --as v2-signer-b
npm run v2 -- relay <proposal.json>                 # in a window scoped to the vault's targets

# keep it private until it is relayed (QoreSeal): each signer publishes an ML-KEM-1024 key once
npm run v2 -- account register-kem v2-signer-b      # and -c
npm run v2 -- seal <proposal.json> --as v2-signer-a # prints the sealed file's path
npm run sign-action -- <proposal.sealed.json> --as v2-signer-b   # opens its envelope, checks, signs
npm run v2 -- propose queue signers 2 <a>,<b>,<c>   # timelocked: queue, wait, execute
npm run v2 -- execute <opId>
npm run v2 -- veto <opId> --as v2-signer-c          # any one signer, alone
npm run v2 -- propose start-sale sale.json          # a sealed buyback
npm run v2 -- collect <auction>
npm run v2 -- status
npm run v2 -- refusal-demo     # the scoped window refuses an off-target transaction
```

**Locally, end to end.** `forge build && npm run e2e:local` starts anvil, creates
throwaway accounts in a temporary directory, deploys with the real deploy script and
drives the vault only through the commands above: a sweep, the refusals (one share,
a tampered proposal, a stale one, a non-member), a queued sweep vetoed by one signer
and another executed after the delay, a tender settled by anyone, a sealed sale
refused over the daily cap and started the next day, and its collection, plus the
deploy preflight, and private proposals (step 5b: a proposer-signed proposal sealed to
the co-signers and relayed, and five refusals) (48 checks, also in CI). Foundry's EVM cannot run ML-DSA-87, so the local `pqcVerify` stand-in
accepts any signature; the harness instead checks every relayed share itself with
the SDK's ML-DSA-87 verifier against the exact bytes the vault verifies.

Every v2 transaction goes from the relayer inside a window scoped to at most
[vault, fUSD, PEAL-T, auction factory], for one transaction and about two minutes,
and closed again in a `finally`. The relayer pays gas and has no authority.
`sign-action` rebuilds the argument hash from the proposal's arguments and checks
the exact bytes against the vault's own `quorumMessage` view before signing.

### The web app

`npm run dashboard` serves the treasury's web app ([`apps/dashboard`](apps/dashboard)),
in the Peal design language shared by all three entries ([`docs/design.md`](docs/design.md)).
It opens on a **landing page** (what Peal Tender is, why post-quantum now, how it
works, who does what, and how to try it in four steps), then the app below.

**Wallets.** QoreChain admits an EVM transaction only from an account with a
registered ML-DSA-87 key and a live window opened by a hybrid-signed native message.

| Way in | What it does here |
| --- | --- |
| **Guest account** | A fresh testnet account made in the visitor's browser (random recovery phrase, both keys derived by `@qorechain/sdk`, kept only in that browser, with backup and forget). It is the one that acts: on first use it registers its ML-DSA-87 key, then each action opens a window scoped to the contracts it calls, sends, and closes the window. It can claim test PEAL-T, offer into a tender, claim, settle, execute a ready change and collect a sale |
| **QoreX** | Connects through `window.qorex` and funds the guest account with one QOR transfer the visitor approves in QoreX. QoreX does not send EVM transactions or open windows for pages yet (its docs, 16 November 2026), so the guest account does the contract calls |
| **MetaMask** | Connects (EIP-6963) and adds the QoreChain testnet network. It cannot make the post-quantum signature a QoreChain transaction needs, so actions go through the guest account |

**Treasury keys never enter the page**: signers build or check proposals here and sign
with `npm run sign-action`. The REST API and CometBFT RPC send no CORS headers, so the
page reaches them through same-origin `/api/qore/*` paths: the Vite dev server forwards
them locally, and [`vercel.json`](vercel.json)'s rewrites forward them when hosted on
Vercel, only ever to the two public testnet endpoints. The hosted site sets a strict
Content-Security-Policy.

| Page | What it shows |
| --- | --- |
| Overview | free balances, what is left of today's allowance, changes waiting, recent activity, the signers |
| Signers | each member's ML-DSA-87 key as `pqcKeyStatus` reports it (registered, possession, a key fingerprint), and what each has signed |
| Timelock | every queued change with its countdown, who vetoed it, and the command to execute it once ready; the allowance per token |
| Tenders | each tender; per tender the price ladder (offered and bought at each price, the clearing price marked) and every offer |
| Sealed sales | each sale with the auction's state, proceeds and the price achieved |
| Activity | the vault's events in words, with which signers authorised each action |
| Propose | **build** a proposal (the same file `npm run v2 -- propose` writes, checked against the vault's own `quorumMessage`) and **check** one someone sent: what it does, decoded from its arguments, and every share verified with ML-DSA-87 against the signer's key on chain |

To try it without the testnet: `npm run demo:local` runs the end-to-end check, then
leaves a local node running with a vault in every state (a waiting signer change, an
open tender with offers, a running sale) and prints the URL to open after
`npm run dashboard -- --port 5199`.

## QoreChain kits used

Each kit does a job in Tender; [`docs/kits.md`](docs/kits.md) has the reasoning,
including the kits that do not fit and why.

| Kit | What it does here |
| --- | --- |
| QoreChain SDK (`@qorechain/sdk`, `@qorechain/evm`) | hybrid signing, key registration and windows in every script and in the web app's guest account |
| qorechain-pqc (`@qorechain/pqc`) | ML-DSA-87 verification of every relayed share, in the end-to-end check and the web app's proposal checker |
| create-qorechain-dapp | Tender started from its `foundry` template; `npm run template:check` scaffolds it again and checks the compiler settings and every network constant Tender writes down (17 checks, in CI) |
| MCP + qore CLI (`@qorechain/mcp`, `@qorechain/qore-cli`) | `npm run evidence` checks the cited transactions with the MCP server's tools; `.mcp.json` gives the coding agents the same read-only view of the chain; `npm run qore` is the pinned CLI |
| QoreScan (`@qorechain/qorescan`) | `npm run cbom` writes a CycloneDX CBOM ([`audits/cbom/`](audits/cbom)); `npm run cbom:check` asserts the contracts reach ML-DSA-87 only through `pqcKeyStatus` and `pqcVerify` and never call `ecrecover` (in CI) |
| QoreX integrations (`@qorechain/qorex-types`) | the web app finds QoreX's native and EIP-1193 providers |
| Wallet adapter (`@qorechain/wallet-adapter`) | QoreX's funding transfer (`qorexSignAndBroadcast`), MetaMask's network (`addQoreEvmToWallet`), and why the chain refused an EVM transaction (`isEvmWindowRejection`) |
| QoreSign (`@qorechain/qoresign`) | the proposer signs each proposal (secp256k1 + ML-DSA-87); `sign-action` and the web checker verify it against the proposer's key on chain, so nobody can pass off a proposal as a co-signer's |
| QoreSeal (`@qorechain/qoreseal`) and the encryption key registry | `account register-kem` publishes each signer's ML-KEM-1024 key on chain; `seal` encrypts a proposal to the co-signers' keys so a buyback cannot be front-run before it is relayed |
| Custody kit (vendored, [`vendor/qorechain-custody-kit`](vendor/qorechain-custody-kit)) | `validateAddress` on every address a proposal names, in the CLI and the web builder; its own test vectors run in `test:ts` |

## Build and test

Needs Foundry and Node.js 20 or later.

```sh
npm install
npm run setup        # forge-std, OpenZeppelin and qore-pq-kit v0.3.0 into lib/; forge-std into kit/lib/
forge build
forge test           # 132 tests: the drill vault's 50, and v2's 82 (below)
npm --workspace kit run test   # the in-repo kit: 30 tests
npm run typecheck
npm run test:ts      # the kit integrations: 25 tests, offline
npm run template:check && npm run cbom:check
npm run snapshot     # v2 gas per call, into snapshots/GasTest.json
```

v2's tests ([`test/v2/`](test/v2)):

| Suite | Tests | What |
| --- | --- | --- |
| `PealTenderV2.t.sol` | 57 | each action and each refusal: too few, outsider, repeated, unsorted, replayed, expired or foreign-chain signatures; single-member and v1-format shares; the precompile switched off; the daily cap; the timelock (queue, wait, execute, veto, lapse, a signer-set change voiding older changes, keys checked at execution); tenders with permissionless settlement; sealed sales against a mock auction, including a factory that under-pulls, an unlisted auction and re-entry |
| `PealTenderV2Fuzz.t.sol` | 8 | amounts against the free balance and the cap, deadlines, nonces, argument binding, every signer subset, the cap over random days, the execution window, delay bounds |
| `PealTenderV2Invariant.t.sol` | 7 | a random-actor handler (signed actions by random member pairs, forged attempts from members' own accounts, time, donations, tenders, sealed sales, the queue): no forged action succeeds; both tokens conserved; always solvent; no day above the cap; nothing executed early; no approval left behind |
| `Vectors.t.sol` | 4 | the CLI's TypeScript encoders against Solidity, byte for byte (`vectors/v2-actions.json`) |
| `Gas.t.sol` | 6 | the gas of each call |

The tests run on Foundry's local EVM with the precompiles mocked
([`kit/test/mocks/`](kit/test/mocks)), including their failure modes. The live
counterpart runs against the real precompiles, read-only:

```sh
(cd kit && forge build) && npm run pq -- probe drill
```

## Deploy and operate v1 (the drill vault)

Secrets live outside the repository, in `~/.qore-drill/<name>.env` (mode 0600),
created by `npm run pq -- new-account <name>`. Nothing prints them.

```sh
npm run pq -- new-account drill && npm run pq -- new-account ops
# fund the drill account from the dashboard faucet (sign-in required), then:
npm run pq -- register drill     # ML-DSA-87 key with proof of possession
npm run pq -- register ops       # after ops has a little QOR
npm run deploy -- 70             # window, token, vault, 70 QOR into the vault, close window

npm run tender -- status
npm run tender -- sweep native <to> <wei>
npm run tender -- open <budget> <floorPrice> <tickSize> <numTicks> <seconds> <maxOffers> <minQuantity>
npm run holder -- offer 60:0 50:3          # as the ops account
npm run tender -- settle
npm run holder -- claim <tenderId> <offerId>...
npm run pq -- rehearse drill <vault> <fUSD>   # the drill's attacks, with the classical key only
```

`forge script` is not used for deployment: Foundry's local simulation has no
QoreChain precompiles, so the vault's constructor, which checks the signer's key,
fails closed there. The scripts use viem and the node's own gas estimation.

## Prior work

The design and the clearing rule come from the author's own earlier project,
**Peal** (private, started 6 July 2026, Apache-2.0). Everything in this repository
was written during the hackathon; Peal's code itself is not part of it. What was
ported, as rules and test cases re-written here:

| Here | From Peal (`plan/017-peal-redesign`) |
| --- | --- |
| [`src/TenderClearing.sol`](src/TenderClearing.sol): the uniform-price buyback clearing rule and its test cases | `contracts/src/auctionkit/TenderClearing.sol`, `contracts/test/auctionkit/TenderClearing.t.sol` |
| The tender's escrow, settle and pull-based claim flow ([`src/PealTender.sol`](src/PealTender.sol), [`src/TenderBook.sol`](src/TenderBook.sol)) | `contracts/src/auctionkit/SealedTender.sol` |
| Sealed buybacks through a forward auction (v2) | the product link between Peal's tender and auction kits |

New for QoreChain, with no Peal counterpart: the post-quantum authorisation of
every treasury action (`qore-pq-kit`'s `PqAuth` and `PqAuthSet`), the 2-of-3
signer set with its timelock, daily cap and single-signer veto, the scoped-window
tooling, the drill rehearsal, the dashboard and the audit artefacts.

## Credits

- **Peal**, the author's earlier project (started July 2026), is the origin of this
  design: the buyback tender, its escrow and claim flow, and the uniform-price
  clearing rule with its test vectors are ported from Peal's tender contracts and
  re-written here. Peal's code itself is not part of this repository.
- The QoreChain `create-qorechain-dapp` foundry template (0.14.0) was the starting
  point for the project layout and the window helper; `@qorechain/sdk` and
  `@qorechain/evm` 0.14.0 do the hybrid signing, key registration and window messages.
- QoreChain's `@qorechain/pqc`, `@qorechain/mcp`, `@qorechain/qore-cli`,
  `@qorechain/qorescan`, `@qorechain/qorex-types` and `@qorechain/wallet-adapter`
  (Apache-2.0, QoreChain Association), as listed above.
- `qore-pq-kit` v0.3.0 (our toolkit, by git tag): `PqAuth`, `PqAuthSet` and the
  TypeScript helpers v2 uses.
- OpenZeppelin Contracts 5.1.0 (SafeERC20, ReentrancyGuard, Math, ERC20), forge-std
  1.9.7, viem, cosmjs and Vite (the dashboard).
- How the code was written (AI agents and the human owner): [AI_USAGE.md](AI_USAGE.md).

## Licence

Apache-2.0, see [LICENSE](LICENSE).
