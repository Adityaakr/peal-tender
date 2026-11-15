# How AI was used to build Peal Tender

This file is a dated log of the workflow, what the AI agents produced, and what the
human owner decided. It is kept from the first commit and extended as work goes on.

## The workflow

- **One human owner** sets the goals and makes every decision that is theirs to make:
  which entries to enter, product choices, anything that needs a sign-in (the
  hackathon registration, the QoreChain dashboard faucet, project pages), anything
  sent to the organisers, and every merge.
- **An orchestrator agent ("Firstmate")** turns the owner's intent into written task
  briefs, dispatches them to worker agents, relays decisions and blockers between the
  workers and the owner, and never merges on its own authority.
- **Worker agents** (Claude Code, model Claude Opus 5.5) each get one brief and work
  alone in a disposable git worktree of the repository, so parallel work cannot
  collide. A worker reports progress and blockers through a status file, opens a pull
  request when done, and stops. A pull request is the only way work reaches `main`,
  and the owner reviews and merges it.
- **Secrets never go through the agents' output.** Keys are created by scripts into
  files outside the repository with 0600 permissions; scripts print addresses only.

## Log

### 15 November 2026 (morning): planning

A planning worker read the hackathon rules, the QoreChain documentation (165 pages)
and the public project feed, tried the QoreChain scaffolders, SDK and precompiles
read-only against the testnet, and wrote a plan: four category entries built around
one product (sealed auctions from the owner's earlier project, Peal), with Peal
Tender as the Post-Quantum dApp entry and the Q-Day Drill entry. It sent nothing to
the chain.

**Owner decisions:** enter the Q-Day Drill with Peal Tender; keep Peal's code
private and write each entry fresh during the event, porting only small rules with
credit in the README.

### 15 November 2026 (evening): this repository, first version

One worker, one brief ("a minimal but drill-safe Peal Tender plus the toolkit pieces
it needs, deployed to testnet before drill registration closes"). What it did, in
order:

1. Scaffolded the official `create-qorechain-dapp` foundry template (0.14.0) in a
   scratch folder and read the SDK's source to confirm that the ML-DSA-87 key of a
   mnemonic account is derived from the mnemonic, not from the classical key (the
   property the drill depends on).
2. Created the drill account and an "ops" account from fresh mnemonics with a script
   (`kit/scripts/account.ts`), and reported the drill account's address to the owner
   as a blocker: the faucet needs the owner's dashboard sign-in.
3. Wrote the post-quantum authorisation library `kit/src/PqAuth.sol`, its precompile
   mocks and 30 Foundry tests, then a live probe that runs the compiled library
   against the real precompiles through `eth_call`, and checked it on the testnet.
4. Wrote the vault `src/PealTender.sol` and re-wrote Peal's clearing rule as
   `src/TenderClearing.sol`, with unit, fuzz and invariant tests (50 tests).
5. **Owner:** claimed the faucet for the drill account.
6. Registered both accounts' ML-DSA-87 keys, deployed the token and the vault under
   one unscoped window, funded the vault, closed the window; then ran a PQ-signed
   sweep, a swap and conversion of fUSD into the vault, a PQ-signed tender with two
   offers, its settlement and the claims, each in a window scoped to the vault.
7. Wrote and ran a drill rehearsal (`kit/scripts/rehearse.ts`) that plays the
   attacker with only the classical key, against both accounts.
8. Wrote this README, `THREAT_MODEL.md` and this file, and opened the pull request.

**Where the agent was wrong or the docs were, and how it was caught:**

- It first wrote the precompile addresses in the docs' mixed case (`0x…0A01`). The
  Solidity compiler refuses that literal as a bad checksum, exactly as viem refuses
  the string, so both are now lower-case.
- A first version of `PqAuth.authorize` did not compile ("stack too deep"); it was
  restructured rather than switching the compiler to via-IR, so users of the library
  need no special settings.
- One unit test passed a helper call (an external call) inside the arguments of an
  expected-revert call, which consumed the expectation; the test, not the library,
  was wrong.
- The plan to deploy with `forge script` could not work: Foundry's local simulation
  has no QoreChain precompiles, so the vault's constructor (which checks the signer's
  key) correctly fails closed there. Deployment moved to a viem script that uses the
  node's own gas estimation.
- The docs say a refused second key registration still charges its fee, which would
  let a classical-key holder burn the account's QOR. The rehearsal showed that on
  chain release v3.2.8 it is refused at admission and costs nothing. The threat
  model records both.
- The faucet paid 90 QOR, not the 100 the docs state, and the fest-token transfer
  (1,000 fUSD) did not arrive. The worker bought 0.2 fUSD on the testnet AMM with
  2.5 QOR instead, enough for a demonstration tender.

**Human contribution in this version:** the decision to enter and what to build, the
faucet claim, review of the pull request, and (still to come) the drill registration
on the project page and the drill-day proof transaction hash.
