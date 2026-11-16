# Peal Tender v2 on the testnet: runbook

Written 16 November 2026. Steps marked **(owner)** need the owner's sign-in; every
other step is a command. Nothing here may run before **19 November 2026 00:00 UTC**:
the Q-Day Drill runs on 18 November and judges the drill vault, the drill token and
the drill account as deployed. v2 never sends anything from or to them, and its
scripts refuse their addresses.

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
| Treasury signer A | `v2-signer-a` | `qor19xsmr9hrewv25hcpmjrc30klqn2mpjxhs3mwrn` (`0x29a1b196e3cb98Aa5f01Dc8788Bedf04D5b0c8D7`) | 0.25 QOR |
| Treasury signer B | `v2-signer-b` | `qor1ynz8d7q3l6rgnsvrytxhzw6jrjg4xwmy80h0u9` (`0x24c476f811FE8689c18322CD713b521c91533B64`) | 0.25 QOR |
| Treasury signer C | `v2-signer-c` | `qor1qy60eg0nuwq54n9w6xmppsrkan58lfhzh4f7ga` (`0x0134fca1F3E3814aCcaEd1B610C076ECe87fA6E2`) | 0.25 QOR |

Signers only sign off chain; their QOR pays for the one key registration. In the
demo the owner holds all three signer keys, as separate accounts, disclosed as
demo-only.

## 1. Fund and register (from 19 November)

1. **Funds.** 10 QOR was sent to `v2-relayer`
   (`qor1eluz68hlnzlrsu7tfs79aj3d46nqmxs8jjh4kc`) on 16 November from the auction's
   deployer account. The budget below fits it: the deployer 3 QOR, each signer
   0.25 QOR, and the relayer keeps about 6.2 QOR (about 5.5 after its own
   registration and the four sends), enough for about a dozen relayed actions.
   Spend it sparingly: every step here is in the runbook for a reason. If more is
   needed, **(owner)** a dashboard faucet claim for the same address.
2. Register the relayer's key, then pass QOR on and register the others:

   ```sh
   npm run v2 -- account register v2-relayer
   npm run v2 -- account fund v2-relayer v2-deployer 3
   npm run v2 -- account fund v2-relayer v2-signer-a 0.25
   npm run v2 -- account fund v2-relayer v2-signer-b 0.25
   npm run v2 -- account fund v2-relayer v2-signer-c 0.25
   for n in v2-deployer v2-signer-a v2-signer-b v2-signer-c; do npm run v2 -- account register $n; done
   ```

   The testnet requires a post-quantum key for every native transaction
   (`allow_classical_fallback: false`); key registration is the one message it
   accepts classically signed. So each account registers before it sends anything.

## 2. Deploy

Needs the PEAL-T token and the `SealedAuctionFactory` from Peal Sealed Auction's
testnet deployment (planned there for about 22 November).

```sh
npm run v2 -- preflight --buy <PEAL-T> --factory <factory>   # every line "ok"
npm run deploy:v2 -- --buy <PEAL-T> --factory <factory> --delay 900 --cap 1000000
```

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

The faucet's fest tokens did not arrive for the drill account in November (the kit's
spike S5 is still open), so the drill bought fUSD on the testnet AMM. The same works
for v2, converting straight into the vault so no account ever holds the ERC-20 or
approves anyone:

```sh
npm run v2 -- fusd swap v2-relayer 1000000 1     # 1 QOR for about 0.08 fUSD (pool 2, at November's rate)
npm run v2 -- fusd convert v2-relayer            # all of it into the vault
npm run v2 -- status
```

If the faucet does pay fUSD to an account, `fusd convert` moves it the same way.

## 4. The demo sequence (for the video and `docs/spikes.md` T4/T5)

Amounts are in fUSD base units (6 decimals). Each quorum step is
`propose` → `sign-action --as v2-signer-a` → `sign-action --as v2-signer-b` → `relay`.

| # | What it shows | Commands |
| --- | --- | --- |
| 1 | A 2-of-3 post-quantum sweep | `propose sweep fusd <relayer 0x> 10000` … `relay` |
| 2 | One signature is not enough | sign with one signer only; `relay` refuses ("1 shares, 2 needed") |
| 3 | The scoped window refuses an off-target transaction | `refusal-demo` |
| 4 | A rotation through the timelock, vetoed | `propose queue signers 2 <a>,<b>,<new>` … `relay`; `veto <opId> --as v2-signer-c` |
| 5 | A rotation that goes through | queue it again; wait 15 minutes (the dashboard counts down); `execute <opId>` |
| 6 | A buyback tender settled by anyone | `propose open-tender 50000 1000 100 10 3600 10 1000000000000000000` … `relay`; holders offer; after the hour `settle` |
| 7 | A sealed buyback | `propose start-sale examples/sale.json` (scaled to the vault's fUSD) … `relay`; after the auction finalizes, `collect <auction>` |
| 8 | Measured gas | record each transaction's gas against `docs/spikes.md` T4 |

`npm run dashboard` shows the vault, the signer keys from `pqcKeyStatus`, the
allowance, the queue and the sales throughout.

## 5. Afterwards

- Record the addresses and transaction hashes in `README.md` and the measured gas in
  `docs/spikes.md`.
- From 19 November the drill vault may also move to `qore-pq-kit` by tag and `kit/`
  can go (its Solidity is byte-identical to v0.3.0); `DRILL.md`'s commands must keep
  working.
- **(owner)** QCAI audit stage 1 (about 22 November) and stage 2 (29 November):
  `audits/README.md`.
