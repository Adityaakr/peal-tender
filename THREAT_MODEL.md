# Peal Tender threat model

Written 15 November 2026 for the QoreChain Q-Day Drill (18 November 2026) and the
"Build Before Q-Day" Post-Quantum dApp category. Every statement marked
**observed** was checked on the QoreChain testnet `qorechain-diana` (EVM chain id
9800, chain release v3.2.8) on 15 November 2026; the transactions and logs are
listed in [Evidence](#evidence).

## 1. What is protected

| Asset | Where | Amount at the time of writing |
| --- | --- | --- |
| Treasury reserve, native QOR | `PealTender` vault `0xc3EA5683C1f8D8594A1865D169D98B509b057D41` | 67 QOR |
| Treasury budget, fUSD (ERC-20 `0x9714…63CA`) | the same vault | 0.102818 fUSD (after tender 1 spent 0.099999) |
| Bought-back tokens (tPEAL) | the same vault | 76.92 tPEAL |
| Sellers' escrowed tokens (tPEAL) | the same vault | none at the time of writing; held while a tender is open |
| The treasury's authority (who may spend, open, settle, sweep, rotate) | `PealTender.signer()` = the drill account | |
| Fee money of the drill account | drill account `0x1453faDA276086E39A87CA39C1CD1F754cbf56bF` (`qor1z3fl4k38vzrw8x58eguurnglw4xt744lked87j`) | about 15 QOR (fees only), native, no ERC-20 tokens, no approvals |

## 2. The attacker

The drill's attacker "has recovered the classical ECDSA key of each drill account
and tries everything that key alone can do: native transfers, opening EVM windows,
EVM transfers, token approvals and drain calls on the team's contracts." We also
assume the attacker:

- has testnet accounts of its own with live EVM windows and gas, so it can call our
  contracts from anywhere and in any order;
- sees every transaction and signature we publish (mempool and chain), and can copy,
  reorder or front-run them;
- does **not** have the drill account's mnemonic. The account's ML-DSA-87 key is
  derived from the mnemonic (`shake256("qorechain:pqc:v1|" ‖ qor1-address ‖ "|" ‖ mnemonic)`
  in `@qorechain/sdk` 0.14.0), not from the classical key, so the classical key the
  organisers receive says nothing about it.

## 3. The design in one paragraph

The drill account is the vault's *signer*, but being the signer account (or the
deployer, or any sender) gives no authority. Every function that moves treasury
money or changes the rules (`deposit`, `openTender`, `cancelTender`, `settle`,
`sweep`, `rotateSigner`) takes a 4,627-byte ML-DSA-87 signature. The `PqAuth`
library (in `kit/`) reads the signer's key from the chain's own registry with the
`pqcKeyStatus` precompile (`0x…0A02`), refuses it unless it is ML-DSA-87 with
`possessionProven == true` and 2,592 bytes long, and checks the signature with the
`pqcVerify` precompile (`0x…0A01`) over a 256-byte message binding: a domain tag,
chain id 9800, the vault's address, the signer's address, the action, a sequential
nonce, a deadline (at most 24 hours ahead) and a hash of the exact arguments. The
nonce is consumed when the signature verifies. Holder functions (`offer`, `claim`)
move only the holder's own tokens or pay only the recorded seller.

## 4. The five drill attacks

### 4.1 Native transfers

**Attack.** Sign a bank `MsgSend` from the drill account with the classical key.

**Why it fails.** The account has a registered ML-DSA-87 key, so the chain demands a
hybrid signature on every native transaction. A classical-only transaction is
refused at admission; a hybrid transaction made with the attacker's own ML-DSA-87
key fails the post-quantum check because the chain compares it with the registered key.

**Observed** (rehearsal against the drill account itself, section 7):

| Attempt | Chain answer | Fee charged |
| --- | --- | --- |
| `MsgSend`, classical signature only | refused, `pqc` code 20: "has a registered PQC key and must include the hybrid signature extension" | 0 |
| `MsgSend`, hybrid with the attacker's own ML-DSA-87 key | refused, `pqc` code 21: "hybrid PQC signature verification failed" | 0 |

**What the attacker could still hope for.** Burning the account's QOR through fees.
The docs (`/build-before-qday/key-binding`, read 15 November 2026) say a refused
second key registration "still takes the fee". **On v3.2.8 we observed otherwise:**
a classical re-registration is refused at admission with `pqc` code 234 ("register
and migrate need its hybrid signature") and the balance did not change. We keep the
account's QOR small anyway (fees only); the treasury's QOR is in the vault.

### 4.2 Opening EVM windows

**Attack.** Send `MsgOpenEVMWindow` from the drill account, so that the classical
key could then send EVM transactions.

**Why it fails.** The window is opened on the native lane, so it needs the hybrid
signature: "The classical key alone can never open one."

**Observed:** classical-only, refused with `pqc` code 20; hybrid with the attacker's
key, refused with `pqc` code 21; no fee charged either time.

### 4.3 EVM transfers

**Attack.** Send an Ethereum-style value transfer signed with the classical key.

**Why it fails.** QoreChain admits an EVM transaction only while the sender has a
live authorisation window. We keep no window open on the drill account: every
script that opens one (deploy, treasury actions) closes it again in a `finally`
block, and the deploy script checks that none is left. The windows we do open are
sized for exactly the transactions we send and, except for the one deployment,
scoped to the vault (and the token) only.

**Observed:** "account … has no open EVM authorisation window; open one with
MsgOpenEVMWindow, signed on the Cosmos lane with the account's p[ost-quantum key]",
refused at broadcast, no fee charged.

**Residual risk (drill day).** To make the required "normal transaction" we open a
window scoped to the vault for one transaction. While it is live (seconds), the
attacker could race us to use that one slot. The slot can only reach the vault, and
the vault refuses everything without a valid post-quantum signature, so the worst
outcome is a wasted slot and a few gas units of fee; we then open another window
and retry. The window's value cap is sized for gas only, so the slot cannot carry
QOR anywhere.

### 4.4 Token approvals

**Attack.** `approve(attacker, max)` on fUSD (or any token) from the drill account,
then pull the tokens.

**Why it fails, twice over.**
1. An approval is an EVM transaction, so it needs a window (4.3). **Observed:**
   refused with "has no open EVM authorisation window".
2. There is nothing to approve. The drill account holds no ERC-20 tokens: fUSD is
   converted from its bank form straight into the vault with `MsgConvertCoin`
   (receiver = the vault), so the plain account never holds the ERC-20 and never
   approves the vault. We checked that it has no allowances outstanding.

The vault's own `deposit(from, amount)` (pull funds from an approver) is gated on a
post-quantum signature too, so even an address that did approve the vault cannot
have its approval spent by someone else.

### 4.5 Drain calls on our contracts

**Attack.** Call the vault from the drill account or from the attacker's own
accounts, with any arguments and any signature bytes, in any order.

| Function | Attacker's outcome |
| --- | --- |
| `sweep(token, to, amount, …)` | reverts `PqSignatureInvalid` (or `PqBadSignatureLength`); the signature binds token, recipient and amount |
| `rotateSigner(next, …)` | reverts; also requires `next` to have a proven ML-DSA-87 key |
| `deposit`, `openTender`, `cancelTender`, `settle` | revert without a valid signature |
| replay of a signature we published | reverts: the nonce it was made for is used |
| our signature for another action, contract or chain | reverts: action, contract and chain id are in the signed message |
| front-running our signed transaction | the same action happens with the same arguments; the attacker only pays our gas |
| `offer` | escrows the attacker's own tokens; bounded per tender by `maxOffers` and `minQuantity` |
| `claim(tender, offer)` | pays only the offer's recorded seller, once |
| `expire()` | only after a tender is three days past its end without settlement; it moves no funds, and lets sellers reclaim their own tokens |
| sending QOR or tokens to the vault | a gift to the treasury |

**Observed:** `sweep` of the vault's QOR to the attacker with a forged 4,627-byte
signature, sent from the drill address: refused at broadcast (no window); the same
call by `eth_call` reverts with `PqSignatureInvalid()` (`0xaacbfa70`). The invariant
suite (`test/PealTenderInvariant.t.sol`) runs thousands of random sequences mixing
valid treasury actions, holders, time and these attacks, sent both as the signer
account and as strangers, and checks that no attack ever succeeds and that funds
leave the vault only through signed sweeps and seller claims.

### 4.6 Rug-pull by the token contracts

The vault's contracts are ours. fUSD is the testnet's fest token, registered by
testnet governance in the ERC-20 module; we do not control it, and its controller
could in principle freeze or move balances. That is outside what the drill tests.

## 5. Other threats to the design

| Threat | Mitigation |
| --- | --- |
| **The precompile is switched off** (an inactive precompile answers success with empty data) | `PqAuth` reverts `PqPrecompileUnavailable` on empty data from either precompile, so "no answer" never reads as "valid" or as "no key". Tested with the mocks (empty return, missing code) and observed live on an inactive address (`0x…0B01` returns empty data) |
| A malformed or non-boolean precompile answer | anything but a 32-byte word equal to 1 is "invalid"; `abi.decode` rejects a malformed `pqcKeyStatus` answer |
| A key registered **without** proof of possession, or another algorithm | refused (`PqKeyUnusable`) |
| The signer's **ML-DSA-87 key** leaks (mnemonic theft) | out of scope for the drill; recovery is `rotateSigner` to a new account before the thief acts. The account's on-chain key can also be rotated with `MsgRotatePQCKey`, which needs the old key's signature; the vault follows the registry automatically |
| A signed but unsent authorisation leaks | it expires at its deadline (at most 24 hours, in practice 15 minutes in our scripts) and it is tied to one nonce, one action and exact arguments |
| Settlement never happens | anyone may `expire()` a tender three days after its end; sellers then reclaim their tokens |
| Clearing-rule rounding | payments are floored per seller and allocations never sum above `bought`; the amount kept reserved after settlement is `ceil(bought × price)`, which is never above the budget. Ported from Peal with its test vectors and fuzzed here (`test/TenderClearing.t.sol`, `test/PealTenderFuzz.t.sol`) |
| Fee-on-transfer or rebasing tokens | `offer` and `deposit` check the exact amount received |
| Re-entrancy through token callbacks | every state-changing function is `nonReentrant`; state is updated before transfers |
| Gas griefing by many offers | settlement scans ticks (at most 256), never offers; offers per tender are capped |

## 6. Trust assumptions and what is not covered

- The QoreChain validators verify hybrid signatures and windows as the docs and our
  observations say, and the precompiles implement ML-DSA-87 correctly.
- The contracts are **not audited**. They are a minimal first version written for the
  drill. The full Peal Tender (sealed offers, a factory, the auditor rounds) is later work.
- The "ops" account (`0xdA940905B6665BdA3Dcdb000030c830B74D4659F`) holds the test
  token and plays the token holders. It is not a drill account and its keys are not
  handed over.
- The testnet may be reset by its operators; addresses would then change.

## 7. Evidence

Rehearsal: `npm run pq -- rehearse drill <vault> <fUSD>` (`kit/scripts/rehearse.ts`)
plays the attacker with only the drill account's `PRIVATE_KEY` and a fresh ML-DSA-87
key of its own. Its run of 15 November 2026 against the drill account:

```
REFUSED   native transfer, classical signature only                      pqc code 20, fee 0
REFUSED   native transfer, hybrid with the attacker's own ML-DSA-87 key  pqc code 21, fee 0
REFUSED   open an EVM window, classical signature only                   pqc code 20, fee 0
REFUSED   open an EVM window, hybrid with the attacker's own key         pqc code 21, fee 0
REFUSED   re-register the PQ key to the attacker's key (classical)       pqc code 234, fee 0
REFUSED   EVM native transfer (no window)                                no open EVM window, fee 0
REFUSED   EVM token approval on fUSD (no window)                         no open EVM window, fee 0
REFUSED   drain call: vault.sweep with a forged signature (sent)         no open EVM window, fee 0
REFUSED   drain call: vault.sweep with a forged signature (eth_call)     reverted (PqSignatureInvalid)
every attack was refused
```

Live probes: `npm run pq -- probe drill` (`kit/scripts/probe.ts`) runs `pqcKeyStatus`
and `pqcVerify` directly and runs `PqAuth.sol` itself against them through `eth_call`
of a probe contract's creation code. All 16 checks passed on 15 November 2026 (valid
signature true; tampered signature false; different nonce false; key without
registration reverts; inactive precompile returns empty data; `pqcVerify` costs
about 317,000 gas as a whole transaction).

Transactions are listed in the README under "Deployed".
