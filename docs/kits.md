# QoreChain kits and network features in Peal Tender

Written 16 November 2026. For each kit and network feature on the fest's project form:
whether Peal Tender uses it, the product reason, and how the fest site can confirm it.
A kit is only worth adding where it does a job the treasury needs; the "No" rows say why
not.

## How the fest site verifies (found 16 November 2026)

The project form says: "SDKs: we check your repo's dependency files and mark what we
find as verified. Network features: we check your testnet addresses on chain." The
project page says "Verified means found in the repo's dependency files or proven on
testnet. Declared is what the team ticked." The checks run on the server, so the rules
were inferred by comparing the public pages of all 67 fest projects with their
repositories and addresses:

- **Kits** verify when the npm package name is a dependency in any `package.json` of
  the repository, nested ones included. `create-qorechain-dapp` verifies only for the
  projects that list `create-qorechain-dapp` itself as a dependency; using its template
  is not enough (Tender used it and shows "Declared"). `MCP + qore CLI` verifies with
  `@qorechain/mcp`; a project's own MCP server does not count.
- **The QoreScan and "MCP server or qore CLI" features** verify from the same
  dependencies (every project with `@qorechain/qorescan` or `@qorechain/mcp` has them
  verified), not from the chain.
- **On-chain features** verify from the transactions of the listed `qor1` addresses
  (up to 5): hybrid transactions, key registration, EVM windows and AMM swaps do.
- **Test tokens** verify when a listed address received fUSD, fETH and fBTC from the
  fest-token faucet (`qor178nscfyp0cq2ac5x7un4u98xrj4ayp6pt0kw08`, which sends all three
  in one transfer). Buying fUSD on the AMM does not count: the drill account did that on
  15 November and Tender still shows "Declared".
- **Solidity PQC signature check, Solidity PQC key status, Sign In With QoreChain,
  staking tiers, cross-VM, IBC, light node, Approved Native contracts, sidechain and RDK
  rollup** are verified for no project at all, so either the site cannot detect them
  yet or nobody has done them. Tender's contracts call `pqcVerify` and `pqcKeyStatus`
  in every treasury action (the drill vault's `sweep`, `openTender` and `settle` on
  15 November did), so those two stay ticked as declared; the QoreScan CBOM below is
  the evidence a reader can check.

## Kits

| Kit | Use | Product reason | Verifies by |
| --- | --- | --- | --- |
| QoreChain SDK | **Yes** (already) | `@qorechain/sdk` and `@qorechain/evm` do the hybrid signing, key registration and windows of every script and of the guest account in the web app | `package.json` |
| qorechain-pqc | **Yes** (already) | `@qorechain/pqc` verifies every relayed ML-DSA-87 share in the end-to-end check and the web app's proposal checker | `package.json` |
| create-qorechain-dapp | **Yes** | Tender started from its `foundry` template. `npm run template:check` scaffolds that template from the pinned package and checks that Tender still matches it where it must: compiler, optimizer, the testnet RPC and the SDK's network preset (chain ids, endpoints) | `package.json` (devDependency) |
| MCP + qore CLI | **Yes** | `npm run evidence` re-checks every transaction Tender cites as evidence through the MCP server's own tools (`get_transaction`, `get_pq_status`): success, signer, and whether the chain verified the ML-DSA-87 layer. `.mcp.json` gives the coding agents that build Tender the same read-only view of the chain; `npm run qore` is the pinned `qore` CLI for checking any hash by hand | `@qorechain/mcp`, `@qorechain/qore-cli` |
| QoreScan | **Yes** | `npm run cbom` writes a CycloneDX CBOM of the contracts (`audits/cbom/`). `npm run cbom:check` asserts what the threat model claims: every authorisation goes through `pqcKeyStatus` and `pqcVerify`, and no contract calls `ecrecover`. It feeds the QCAI audit | `@qorechain/qorescan` |
| QoreX integrations | **Yes** | The web app finds QoreX through `@qorechain/qorex-types` (`getQorexNative`, capability checks, the EIP-6963 announcement) instead of hand-written types | `@qorechain/qorex-types` |
| Wallet adapter | **Yes** | The QoreX funding transfer goes through `qorexSignAndBroadcast` (request validation, a declined prompt told apart from a failure with `isQorexRejection`); MetaMask gets the network from `addQoreEvmToWallet`; the guest account explains a refused EVM transaction with `isEvmWindowRejection` | `@qorechain/wallet-adapter` |
| QoreSign | **Yes** | A proposal file is unauthenticated today: a signer cannot tell who wrote it. The proposer now signs it with a QoreSign hybrid message signature, and `sign-action` and the web app's checker verify it against the proposer's ML-DSA-87 key on chain before showing it | `@qorechain/qoresign` |
| QoreSeal | **Yes** | A buyback's budget and timing must stay private until it is relayed, or holders front-run it. Proposals can be sealed (ML-KEM-1024 + X25519) to the co-signers' keys in the on-chain encryption key registry, so only they can read them | `@qorechain/qoreseal` |
| Custody kit | **Yes** | Tender is a treasury: the kit's reference `validateAddress` checks every address a proposal names (CLI and web builder), refusing a hex address whose EIP-55 checksum is broken, before anyone signs it; the kit's own vectors run in CI. The kit is meant to be vendored, not installed (`vendor/qorechain-custody-kit`, v0.1.1), so the site will likely show it as declared | vendored source (no package to detect) |
| Handles | **No** | Paying a sweep to `@handle` would be useful, but the registry endpoint and its trust key are not published by QoreChain. Pinning a key copied from another project would defeat the verification the package exists for | - |
| Asset Kit | **No** | Its TypeScript client targets chain modules that do not exist on the testnet (every call fails with `ChainUpgradeRequired`), and the ERC-3643 contracts are for regulated issuance, which a buyback vault is not | - |
| Chain bridge | **No** | A server library for Web2 backends; Tender has no backend (the relayer is a CLI and the web app is static) | - |
| RDK | **No** | Tender is one vault on the EVM lane; a rollup adds nothing it needs | - |
| PQ light client | **No** | The chain does not produce the signed checkpoints it verifies, so it cannot check live vault state yet | - |

## Network features

| Feature | Use | How and where |
| --- | --- | --- |
| Hybrid ML-DSA-87 transactions | **Yes**, verified | every native message of every account |
| PQC key registration with proof of possession | **Yes**, verified | every account, `MsgRegisterPQCKeyV2` |
| EVM window (incl. scoped) | **Yes**, verified | every EVM transaction runs in a window scoped to the vault's contracts, closed after |
| AMM pools | **Yes**, verified | fUSD for the vault is bought on pool 2 and converted straight into the vault |
| Solidity PQC signature check | **Yes**, declared (no project verifies) | `PqAuth`/`PqAuthSet` call `pqcVerify` for every treasury action |
| Solidity PQC key status | **Yes**, declared (no project verifies) | `pqcKeyStatus` read for every signer at every check, and in v2's constructor |
| Test tokens fUSD, fETH, fBTC | **Yes**, needs one faucet claim | the vault holds fUSD; the owner claims fest tokens for the v2 relayer and `npm run v2 -- fusd convert` moves the fUSD into the v2 vault |
| QoreSeal and the encryption key registry | **Yes** (on chain from 19 November, runbook step 1) | each v2 signer publishes an ML-KEM-1024 key (`MsgRegisterKEMKey`) so proposals can be sealed to them |
| MCP server or qore CLI | **Yes** | `@qorechain/mcp` and `@qorechain/qore-cli` (above) |
| QoreScan | **Yes** | `@qorechain/qorescan` (above) |
| Smart accounts and spending rules | **Maybe** (later PR) | a keeper key, linked to the treasury's ops account and limited to the vault's permissionless calls, would run `settle`, `execute` and `collectSealedSale` without an EVM window. Only if time allows after v2 is live |
| Sign In With QoreChain | **No** | the web app has no server to sign in to, and QoreX refuses `signArbitrary` today, so a page cannot ask for one |
| Staking tiers | **No** | the treasury's QOR sits in an EVM contract; staking it would need the cross-VM bridge and an unbonding period the buyback cannot wait for |
| IBC via QORel, Cross-VM, RDK rollup, sidechain or paychain, light node, Approved Native contracts | **No** | nothing in a buyback vault needs them |
| Asset Kit | **No** | see the kit above |

## Addresses to list on the project page

Up to five `qor1` addresses; the final list, with the evidence for each, is in the
pull request that finishes this work. The drill account stays listed (its history
carries the verified features); the v2 relayer and the v2 vault join it after
19 November. Every new on-chain action comes from non-drill accounts.
