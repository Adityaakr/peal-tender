# Peal Tender v2 on the testnet: runbook

Written 16 November 2026; **run on 18 November 2026** (steps 1 to 3, demo rows 1b,
6 and 7; the result is in the README, "v2, live since 18 November 2026"). Steps marked
**(owner)** need the owner's sign-in; every other step is a command. The plan was to
wait for 19 November 00:00 UTC, after the Q-Day Drill; the owner moved the deploy
forward because the drill judges only the drill vault, the drill token and the drill
account, and v2 never sends anything from or to them (its scripts refuse their
addresses). `deploy:v2` still refuses drill day unless given `--drill-day-ok`.

At any point, `npm run v2 -- preflight [--buy <PEAL-T>] [--factory <factory>]` prints
a read-only checklist: chain id, the date guard, each v2 account's balance against
what its role needs and whether its ML-DSA-87 key is registered, any live window,
whether the PEAL-T and factory addresses answer as expected, and the deployment.

## The accounts

Created on 16 November 2026 with `npm run v2 -- account new <name>`; the mnemonics are
in `~/.qore-peal-tender/<name>.env` (mode 0600) on the build machine, not in the
repository.

| Role | Name | Address | Needs |
| --- | --- | --- | --- |
| Deploys the library and the vault | `v2-deployer` | `qor16z0zu9avvxxs5e5n2u0xmfcza07942zyjvcc9y` (`0xd09E2e17ac618d0A6693571E6DA702EBFC5aa844`) | 3 QOR |
| Relays every action; pays gas, has no authority | `v2-relayer` | `qor1eluz68hlnzlrsu7tfs79aj3d46nqmxs8jjh4kc` (`0xCFF82d1Eff98be3873cb4C3C5ecA2daeA60d9a07`) | keeps the rest, at least 5 QOR |
| Treasury signer A | `v2-signer-a` | `qor19xsmr9hrewv25hcpmjrc30klqn2mpjxhs3mwrn` (`0x29a1b196e3cb98Aa5f01Dc8788Bedf04D5b0c8D7`) | 0.4 QOR |
| Treasury signer B | `v2-signer-b` | `qor1ynz8d7q3l6rgnsvrytxhzw6jrjg4xwmy80h0u9` (`0x24c476f811FE8689c18322CD713b521c91533B64`) | 0.4 QOR |
| Treasury signer C | `v2-signer-c` | `qor1qy60eg0nuwq54n9w6xmppsrkan58lfhzh4f7ga` (`0x0134fca1F3E3814aCcaEd1B610C076ECe87fA6E2`) | 0.4 QOR |

Signers only sign off chain; their QOR pays for two native transactions at the fixed
0.15 QOR fee: the ML-DSA-87 key registration and the ML-KEM-1024 key for sealed
proposals (`MsgRegisterKEMKey`). In the
demo the owner holds all three signer keys, as separate accounts, disclosed as
demo-only.

## 1. Fund and register

1. **Funds.** 10 QOR was sent to `v2-relayer`
   (`qor1eluz68hlnzlrsu7tfs79aj3d46nqmxs8jjh4kc`) on 16 November from the auction's
   deployer account, and **(owner)** a dashboard faucet claim on 17 November added
   100 QOR and the fest tokens (1,000 fUSD, 2 fETH, 0.5 fBTC). The budget below fits it: the deployer 3 QOR, each signer
   0.4 QOR (its ML-DSA-87 and ML-KEM-1024 registrations), and the relayer keeps
   about 5.8 QOR (about 5 after its own registration and the four sends), enough
   for about a dozen relayed actions.
   Spend it sparingly: every step here is in the runbook for a reason. If more is
   needed, **(owner)** a dashboard faucet claim for the same address.
2. Register the relayer's key, then pass QOR on and register the others:

   ```sh
   npm run v2 -- account register v2-relayer
   npm run v2 -- account fund v2-relayer v2-deployer 3
   npm run v2 -- account fund v2-relayer v2-signer-a 0.4
   npm run v2 -- account fund v2-relayer v2-signer-b 0.4
   npm run v2 -- account fund v2-relayer v2-signer-c 0.4
   for n in v2-deployer v2-signer-a v2-signer-b v2-signer-c; do npm run v2 -- account register $n; done
   for n in v2-signer-a v2-signer-b v2-signer-c; do npm run v2 -- account register-kem $n; done
   ```

   The testnet requires a post-quantum key for every native transaction
   (`allow_classical_fallback: false`); key registration is the one message it
   accepts classically signed. So each account registers before it sends anything.

## 2. Deploy

Needs the PEAL-T token and the `SealedAuctionFactory` from Peal Sealed Auction's
testnet deployment (16 November: PEAL-T `0x7edc65adc95de061887ecd6fc8629f2a99fffe9e`, factory `0x1160ab95b570a65bbadb488c76e2f8515f3d6562`).

```sh
npm run v2 -- preflight --buy <PEAL-T> --factory <factory>   # every line "ok"
npm run deploy:v2 -- --buy <PEAL-T> --factory <factory> --delay 900 --cap 1000000 --vault-gas 7333072
```

- `--vault-gas`: the public RPC simulates with at most 5M gas, less than the vault's
  creation needs (`docs/spikes.md` T6), so its gas limit is given: what
  `npm run e2e:local` measured on anvil plus 25%, checked against the chain's 30M cap.
  It used 5,324,071 on 18 November.

- `--delay 900`: 15 minutes, so a signer rotation fits in the demo video. A real
  treasury would use days (see `THREAT_MODEL.md` 8.3).
- `--cap 1000000`: 1 fUSD a day leaves without the timelock; the vault will hold
  only tenths of an fUSD (step 3).
- The deploy first asks the node what both creations cost (which also fails early
  if a signer's key is not registered, because the constructor reads every key),
  opens one unscoped window capped at exactly those two transactions (a scoped
  window refuses creation; the cap is about 2 QOR), closes it, and writes
  `deployments/qorechain-diana-v2.json`.
  Then run `npm run v2 -- preflight --buy … --factory …` again: the deployment line
  must say the members are the three v2 signers.

## 3. Put fUSD in the vault

The owner's faucet claim paid `v2-relayer` 1,000 fUSD as a bank coin. `fusd convert`
moves it straight into the vault (`MsgConvertCoin` to the vault's address), so no
account ever holds the ERC-20 or approves anyone. On 18 November 100 fUSD went in:

```sh
npm run v2 -- fusd convert v2-relayer 100000000  # 100 fUSD into the vault
npm run v2 -- status
```

Without faucet tokens, `npm run v2 -- fusd swap v2-relayer 1000000 1` buys fUSD on AMM
pool 2 first, as the drill did.

## 4. The demo sequence (for the video and `docs/spikes.md` T4/T5)

Amounts are in fUSD base units (6 decimals). Each quorum step is
`propose` → `sign-action --as v2-signer-a` → `sign-action --as v2-signer-b` → `relay`.

| # | What it shows | Commands |
| --- | --- | --- |
| 1 | A 2-of-3 post-quantum sweep | `propose sweep fusd <relayer 0x> 10000` … `relay` |
| 1b | A private proposal: signed by its proposer, sealed to the co-signers' registered ML-KEM keys | `propose sweep fusd <relayer 0x> 10000 --as v2-signer-a`, `sign-action <file> --as v2-signer-a`, `seal <file> --as v2-signer-a`, `sign-action <file>.sealed.json --as v2-signer-b`, `relay <opened copy>` |
| 2 | One signature is not enough | sign with one signer only; `relay` refuses ("1 shares, 2 needed") |
| 3 | The scoped window refuses an off-target transaction | `refusal-demo` |
| 4 | A rotation through the timelock, vetoed | `propose queue signers 2 <a>,<b>,<new>` … `relay`; `veto <opId> --as v2-signer-c` |
| 5 | A rotation that goes through | queue it again; wait 15 minutes (the dashboard counts down); `execute <opId>` |
| 6 | A buyback tender settled by anyone | `propose open-tender 50000 1000 100 10 3600 10 1000000000000000000` … `relay`; holders offer; after the hour `settle` |
| 7 | A sealed buyback | `propose start-sale examples/sale.json` (scaled to the vault's fUSD) … `relay`; after the auction finalizes, `collect <auction>` |
| 8 | Measured gas | record each transaction's gas against `docs/spikes.md` T4 |

`npm run dashboard` shows the vault, the signer keys from `pqcKeyStatus`, the
allowance, the queue and the sales throughout.

## 4b. Host the web app (owner, once) and smoke-test a guest account

1. **(owner)** On vercel.com, import `Adityaakr/peal-tender` as a project. No settings
   or environment variables are needed: `vercel.json` sets the install and build
   commands, the output folder, the `/api/qore/*` rewrites to the testnet REST and RPC,
   and the security headers. Every push to `main` then redeploys; pull requests get
   preview URLs.
2. In the hosted app: **Connect → Create a guest account**, fund it with about 1.5 QOR
   (`npm run v2 -- account fund` takes v2 account names only; send from QoreX, or
   `npm run v2 -- account send v2-relayer <qor1…> 1.5`), then **Get test PEAL-T** and
   **Offer** into the open tender. Done on 21 November 2026 (section 4c and the README,
   "The buyback path, run end to end from the browser").

## 4c. Keep a buyback open for visitors and judges (21 November 2026)

Judging runs 6 to 15 December and the winners show is on 16 December, so a tender is
kept open past them: **tender #3 ends 20 December 2026 at 12:00 UTC**. A tender lasts
at most 30 days (`TenderBook.MAX_DURATION`), and its budget draws on the 1 fUSD daily
allowance. What was run, from the relayer and signers named above:

```sh
# the first sealed sale (18 November) got no bids; anyone closes its bidding, then collects
npm run v2 -- close-sale 0x19bCC6197b97fE53b111d19c350660753441082B   # auction: Failed (no bids)
npm run v2 -- collect 0x19bCC6197b97fE53b111d19c350660753441082B      # 0.9 fUSD back in the vault

# tender #1 (0.08 fUSD, no offers, ending 25 November) is cancelled: only one tender runs at a time
npm run v2 -- propose cancel-tender --as v2-signer-a
npm run sign-action -- <file> --as v2-signer-a && npm run sign-action -- <file> --as v2-signer-b
npm run v2 -- relay <file>

# tender #2: one hour, 0.1 fUSD, run end to end from a fresh browser guest account (README)
npm run v2 -- propose open-tender 100000 1000 100 10 3600 200 1000000000000000000 --as v2-signer-b
#   … signed by B and C, relayed; the guest offered, settled and claimed in the hosted app

# tender #3: 0.85 fUSD, 0.001 to 0.0019 fUSD per PEAL-T, up to 200 offers of at least 1 PEAL-T,
# ending 1797768000 (2026-12-20T12:00Z); the duration is that minus the current block time
npm run v2 -- propose open-tender 850000 1000 100 10 <1797768000 - now> 200 1000000000000000000 --as v2-signer-a
#   … signed by A and C, relayed
```

So the ladder is not empty when a judge arrives, the same test guest account offered
100 PEAL-T at 0.0015 fUSD or more into tender #3 from the hosted app
(`0x16a135be36058ea05f21b3146ce7dc0e472003aaebe3ad7827756b3aa370ff92`). That offer comes from our own
test account, not a third party.

**When it ends** (from 20 December 12:00 UTC): anyone settles it, in the app (Tenders,
*Settle it*) or with `npm run v2 -- settle`; then each offer is claimed (*Claim* in the
app, or `claim` on the vault from any account).

**To reopen one** (after it settles, or to replace it early): `cancel-tender` (2 of 3)
if one is still open, then `open-tender` as above with a new duration (at most
2,592,000 seconds) and a budget within what is left of today's allowance
(`npm run v2 -- status`). The vault holds about 99 fUSD, so many more tenders fit.

**A visitor without test QOR.** The guide asks for about 1.5 QOR: 0.15 to register the
guest account's ML-DSA-87 key, then about 0.32 per action (a window opened and closed
at 0.15 QOR each, plus gas). If a judge cannot use the dashboard faucet, the relayer can
send QOR to the `qor1…` address their wallet panel shows, at most 2 QOR per send, never
to a drill address:

```sh
npm run v2 -- account send v2-relayer <qor1…> 1.5
```

**Test PEAL-T** comes from the faucet contract
`0xe6c2943ff47e908c8b42af4329fb4abd10452e57` (1,000 per claim; 498,990 left on
21 November), which the app's wallet panel calls directly. It needs neither Peal
Sealed Auction's website nor any account of ours.

## 5. Afterwards

- Record the addresses and transaction hashes in `README.md` and the measured gas in
  `docs/spikes.md`.
- After the drill (from 19 November) the drill vault may also move to `qore-pq-kit` by tag and `kit/`
  can go (its Solidity is byte-identical to v0.3.0); `DRILL.md`'s commands must keep
  working.
- **(owner)** QCAI audit: stage 1 ran on 24 November 2026 (UTC); stage 2, on a later UTC day
  before 2 December 23:59 UTC, is still to run: `audits/README.md`.
