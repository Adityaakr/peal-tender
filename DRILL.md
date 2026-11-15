# Q-Day Drill runbook

The drill runs on 18 November 2026 from 00:00 to 23:59 UTC. Registration closes on
17 November 2026 at 23:59 UTC. The threat model is in [THREAT_MODEL.md](THREAT_MODEL.md).

## Before the drill: registration (owner, on the project page)

| Field | Value |
| --- | --- |
| Testnet account | `qor1z3fl4k38vzrw8x58eguurnglw4xt744lked87j` (EVM `0x1453faDA276086E39A87CA39C1CD1F754cbf56bF`) |
| Its ECDSA private key | the `PRIVATE_KEY` line of `~/.qore-drill/drill.env` on the build machine. Hand over only this line, **never** `QORE_MNEMONIC`: the mnemonic is what the ML-DSA-87 key comes from |
| Contract 1 | `0xc3EA5683C1f8D8594A1865D169D98B509b057D41` (PealTender vault) |
| Contract 2 | `0x6dE33E6D9f106427fb0bee52a61BaD6CdEE01784` (PealTestToken) |

The account has had a registered ML-DSA-87 key with proven possession since
15 November 2026. It is a fresh testnet account that has never held mainnet funds.

Checks right before submitting (all read-only):

```sh
npm run pq -- status drill        # PQC key: registered, this key; window: none
npm run tender -- status          # signer = the drill account; balances in the vault
```

## During the drill: the one normal transaction

Any one PQ-signed vault action from the drill account proves the project still
works. The recommended one opens a small tender, so no value leaves the vault:

```sh
npm run tender -- open 50000 1000 100 10 3600 10 1000000000000000000
```

(budget 0.05 fUSD, floor 0.001 fUSD per tPEAL, 10 ticks of 0.0001, one hour,
up to 10 offers of at least 1 tPEAL). The script signs with the ML-DSA-87 key,
opens a window scoped to the vault for exactly one transaction, sends it and
closes the window. It prints a line `openTender: tx 0x… in block …`: **that
`0x…` hash is the one to submit on the project page** (due 19 November).

If the attacker uses up the one-transaction window first, the script fails on
sending and still closes the window. Run the same command again; a fresh
signature is made for the current nonce.

After the drill, `npm run tender -- settle` (once the tender's hour is over)
closes the tender; with no offers it simply fails and releases the budget.

## What not to do on drill day

- Do not open an unscoped window, and do not leave any window open.
- Do not move tokens into the drill account or approve anything from it.
- Do not link the drill account's classical key as an authenticator anywhere.
