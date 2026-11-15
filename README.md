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

A minimal first version, deployed on the testnet for the Q-Day Drill (18 November
2026). Not audited. The full Peal Tender (sealed offers, a factory) comes later.

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

Native-lane hashes are upper-case, EVM hashes are `0x…`. Every window opened for these
steps was closed again; the drill account has no live window, holds no ERC-20 tokens
and has granted no approvals.

## How it works

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

The drill and the other threats are worked through in [THREAT_MODEL.md](THREAT_MODEL.md).

## Build and test

Needs Foundry and Node.js 20 or later.

```sh
npm install
npm run setup        # forge-std and OpenZeppelin into lib/ and kit/lib/
forge build
forge test           # the vault: 50 tests (unit, fuzz, invariant)
npm --workspace kit run test   # the kit: 30 tests
npm run typecheck
```

The tests run on Foundry's local EVM with the precompiles mocked
([`kit/test/mocks/`](kit/test/mocks)), including their failure modes. The live
counterpart runs against the real precompiles, read-only:

```sh
(cd kit && forge build) && npm run pq -- probe drill
```

## Deploy and operate

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

## Credits

- **Peal**, the author's earlier project (started July 2026), is the origin of this
  design: the buyback tender, its escrow and claim flow, and the uniform-price
  clearing rule with its test vectors are ported from Peal's tender contracts and
  re-written here. Peal's code itself is not part of this repository.
- The QoreChain `create-qorechain-dapp` foundry template (0.14.0) was the starting
  point for the project layout and the window helper; `@qorechain/sdk` and
  `@qorechain/evm` 0.14.0 do the hybrid signing, key registration and window messages.
- OpenZeppelin Contracts 5.1.0 (SafeERC20, ReentrancyGuard, Math, ERC20), forge-std
  1.9.7, viem and cosmjs.
- How the code was written (AI agents and the human owner): [AI_USAGE.md](AI_USAGE.md).

## Licence

Apache-2.0, see [LICENSE](LICENSE).
