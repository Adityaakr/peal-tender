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

Transactions are listed in the README under "Deployed". `npm run evidence` re-reads
each of them through the QoreChain MCP server's tools (`get_transaction`,
`get_pq_status`) and checks it is what the README says: every native message
hybrid-signed with the ML-DSA-87 layer verified by the chain, the key registration
signed classically as the chain requires, every vault call succeeded.

Cryptographic inventory: QoreScan's CBOM of the contracts, the testnet endpoints and
the signer's key ([`audits/cbom/peal-tender.cdx.json`](audits/cbom/peal-tender.cdx.json),
`npm run cbom`) backs two claims above with a tool that is not ours. `npm run
cbom:check` (in CI) fails unless the contracts reach ML-DSA-87 through `pqcKeyStatus`
and `pqcVerify` and no contract calls `ecrecover` or its precompile, so no classical
signature can authorise anything in Tender. It also records that the chain requires the
hybrid signature with no classical fallback. The CBOM is an inventory aid, not a
certification.

## 8. Peal Tender v2 (the full build)

Added 16 November 2026. v2 (`src/PealTenderV2.sol`, `src/TenderBook.sol`) is a new
contract beside the drill vault; sections 1 to 7 describe the drill vault and stay as
they were. v2 is **not deployed yet** (no testnet deploys before 19 November 2026),
so nothing in this section is "observed" on chain; the tests named here run on
Foundry's local EVM with the precompiles mocked, and the sealed-sale path was also
run against the real Peal Sealed Auction contracts ([`docs/spikes.md`](docs/spikes.md), T3).

### 8.1 What changes

| | v1 (drill) | v2 |
| --- | --- | --- |
| Authority | one signer account's ML-DSA-87 key | a 2-of-3 set of accounts, each with its own ML-DSA-87 key (`PqAuthSet`) |
| Rule changes (signers, delay, caps, auction factory) | immediate (`rotateSigner`) | queued for `delay`; any one signer can veto |
| Outflows the authority can make at once | everything free | at most `dailyCap` per token per UTC day, summed over sweeps, tender budgets and sealed-sale supplies; more waits in the queue |
| Settlement | gated, with a 3-day `expire` valve | anyone, once the tender ends |
| Buybacks | open tender | open tender, or a sealed sale on Peal Sealed Auction with the vault as issuer |

### 8.2 Threats and what stops them

| Threat | What happens |
| --- | --- |
| **The drill's attacker**: classical keys of every signer and of the relayer | Nothing moves. Every quorum action needs two ML-DSA-87 shares checked by `pqcVerify` against keys read from `pqcKeyStatus`; `msg.sender` grants nothing (`test_sweep_memberSenderWithJunkFails`, invariant `noAttackSucceeds`, whose handler sends forged actions from the members' own accounts). The relayer's classical key can at most open its own windows and pay gas |
| **One signer's post-quantum key stolen** | The thief cannot act alone: one share is refused (`PqSetTooFewSignatures`), and a single-member veto signature is refused as a quorum share (different domain, `test_sweep_refusesSingleMemberDomainShares`). It can veto queued changes and so delay a signer rotation; the two honest signers can still sweep the treasury to safety at the daily cap's rate, and every veto is public |
| **Two signers' post-quantum keys stolen** (a quorum) | Bounded and visible. Immediate outflows stop at `dailyCap` per token per day (`invariant_capAndDelay`, `testFuzz_capPerDay`). A larger sweep, a new signer set, a higher cap, a shorter delay or another auction factory must wait `delay` in the public queue, where the honest third signer vetoes it with one signature. A quorum can still spend within the cap at a bad price (a tender with a high price ladder, a sealed sale with a low reserve); the cap bounds that too, because tender budgets and sale supplies draw on the same allowance |
| **All three keys stolen** | Total loss, as for any multisig: the timelock then only delays a drain by `delay` |
| A share signed for one action used for another | Each share binds chain id, vault, member, action (under the quorum domain), set nonce, deadline and an argument hash; fuzzed (`testFuzz_argumentsBound`, `testFuzz_otherNonceRefused`) |
| Replaying a share, or one made before a membership change | The set nonce is consumed by every quorum action and every veto; an executed signer-set change also voids every other queued change (`OpVoid`) |
| The same member counted twice | Signers must be strictly ascending, which proves they are distinct (`test_sweep_refusesSameMemberTwice`) |
| A queued change run early, or very late | `execute` only between `eta` and `eta + 7 days` (`testFuzz_executeWindow`); the delay itself is queued and bounded to 5 minutes to 30 days |
| A new member without a usable key | Checked at queue time and again at execution (`test_timelock_rotateChecksKeysAtExecution`) |
| A malicious **auction factory** | Only the factory set at deployment or through the timelock is used, and the quorum's signature binds the factory address too (`test_sale_signatureBindsNameDetailsAndFactory`). The vault approves exactly the supply, clears the approval in the same call, refuses a factory that moves a different amount (`SaleFundingMismatch`) or does not list the auction (`NotAnAuction`), and is `nonReentrant` throughout (`test_sale_reentryIsRefused`) |
| A sealed sale that pays someone else | The vault refuses a config whose issuer is not the vault, whose sale and quote tokens are not fUSD and PEAL-T, or whose fee is not zero; the auction pays proceeds and unsold supply only to its issuer |
| Someone claims a sale's proceeds on the auction directly | Harmless: they arrive in the vault anyway, and `collectSealedSale` takes whatever is left (`test_sale_collectAfterSomeoneClaimedDirectly`) |
| Settlement never happens | Anyone may `settle` after the end; there is no key holder to wait for |
| A malicious **proposal file** handed to a signer | `sign-action` decodes the arguments, recomputes the argument hash itself, refuses a mismatch, checks the vault's own `quorumMessage` bytes, and prints what is being signed. The web app's checker does the same in the browser before anyone signs or relays, describes the action from its arguments rather than from the file's own summary, and verifies every share with ML-DSA-87 against the key the chain holds |
| The precompile switched off | Fails closed, as v1 (`test_sweep_failsClosedWithoutPrecompile`) |
| The web app | Treasury keys never enter it. Text from the chain and from proposal files is set as text, never as HTML, and the hosted site sends a strict Content-Security-Policy (scripts only from itself, connections only to itself and the testnet EVM RPC) |
| A visitor's **guest account** | A testnet-only key pair in the visitor's own browser storage, from the browser's random source (never derived from a wallet signature, which the SDK rejects as unsafe). Whoever reads that browser's storage controls the guest account and its test funds; it has no authority over the vault, which only its 2-of-3 ML-DSA-87 signers have. The page says so, offers a backup and a forget button, and never asks for a treasury key |
| The `/api/qore/*` proxy | Same-origin rewrites to the public testnet REST and CometBFT RPC endpoints only; it holds no keys and sees only what the public endpoints see. Data read through it is not trusted for authority: every vault rule is enforced on chain |
| The linked `TenderBook` library | Its address is fixed in the vault's code at deployment; its state-changing functions refuse direct calls (Solidity's library call guard), and it holds no funds or state of its own |

### 8.3 Residual risks, stated plainly

- **One signer can stall changes.** Any single member can veto every queued change,
  including the change that removes it. With one compromised member the honest two
  can still operate within the cap, but cannot rotate it out while it keeps vetoing.
  We chose this over the opposite risk (two compromised members rotating the honest
  one out) because the cap keeps the treasury drainable to safety either way.
- **The cap is per UTC day,** so a quorum thief can spend the cap just before and
  just after midnight: up to two caps in a short time.
- **The timelock protects only as long as someone watches it.** A veto needs an
  honest signer to notice the queued change within `delay`. The testnet demo uses a
  15-minute delay so it fits a video; a real treasury would use days and alerting
  on `OpQueued`. The dashboard shows every queued change with its countdown.
- **In the demo the owner holds all three signer keys,** as three accounts on
  separate machines or browsers, disclosed as demo-only (as decision D3 does for the
  auction's committee). That shows the mechanism, not independent custody.
- **v2 is not audited yet**; the two-stage QCAI audit is prepared in
  [`audits/`](audits/README.md).
