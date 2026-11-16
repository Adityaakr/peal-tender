/**
 * e2e-local.ts - run the v2 operator CLI end to end on a local anvil node.
 *
 *   forge build && npm run e2e:local
 *
 * Starts anvil (chain id 9800), installs stand-ins for the two precompiles,
 * creates throwaway accounts in a temporary directory, deploys the vault with
 * the real deploy script, and drives it only through the CLI a treasury would
 * use: `propose`, `sign-action` by two signers, `relay`; the timelock with a
 * veto and an execution; a tender with permissionless settlement; a sealed sale
 * on a mock auction factory, and its collection. Refusals are checked too: one
 * share is not enough, a tampered proposal is not signed, a stale one is not
 * relayed.
 *
 * Foundry's EVM cannot run ML-DSA-87, so the local `pqcVerify` stand-in accepts
 * any signature. To keep the run honest, the harness decodes every relayed
 * transaction and checks each share itself with the SDK's ML-DSA-87 verifier
 * against the exact 256 bytes the vault verifies (its own encoders, the vault's
 * nonce before the call). `pqcKeyStatus` holds each signer's real public key.
 *
 * Nothing here touches the testnet: the CLI's local mode only accepts a
 * localhost RPC and opens no windows.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  encodeDeployData,
  encodeFunctionData,
  http,
  parseAbi,
  toBytes,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** --keep (npm run demo:local): leave the node running with a lively vault, for the web app. */
const KEEP = process.argv.includes("--keep");
const PORT = KEEP ? 8546 : 8547;
const RPC = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "peal-tender-e2e-"));
process.env.PEAL_TENDER_LOCAL_RPC = RPC;
process.env.PEAL_TENDER_SECRETS_DIR = join(tmp, "secrets");
process.env.PEAL_TENDER_V2_DEPLOYMENT = join(tmp, "deployment.json");

// Imported after the environment is set: these modules read it at load time.
const { pqcVerify } = await import("@qorechain/sdk");
const { quorumMessage, anyMessage } = await import("pqkit/pqauthset");
const { loadV2Account, newV2Account } = await import("./accounts.ts");
const { actionIdOf, argsHash } = await import("./encode.ts");
const { ROOT, artifact, argsHashFor, encodeArgs, loadDeployment, loadProposal } = await import("./vault.ts");
const { vaultAbi } = await import("./abi.ts");

const chain = {
  id: 9800,
  name: "anvil",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const pub = createPublicClient({ chain, transport: http(RPC) });
// anvil's first default key: a test-only account that plays the holders and the auction.
const helper = createWalletClient({
  chain,
  transport: http(RPC),
  account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
});

// anvil's second and third default keys: two more test-only holders.
const holder2 = createWalletClient({
  chain,
  transport: http(RPC),
  account: privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
});
const holder3 = createWalletClient({
  chain,
  transport: http(RPC),
  account: privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"),
});

let checks = 0;
function check(cond: unknown, what: string): void {
  if (!cond) throw new Error(`FAILED: ${what}`);
  checks++;
  console.log(`  ok  ${what}`);
}

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function warp(seconds: number): Promise<void> {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
}

async function send(to: Address, data: Hex): Promise<void> {
  const hash = await helper.sendTransaction({ to, data });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`helper transaction to ${to} reverted`);
}

async function deploy(file: string, name: string, args: unknown[] = []): Promise<Address> {
  const a = artifact(file, name);
  const hash = await helper.sendTransaction({ data: encodeDeployData({ abi: a.abi, bytecode: a.bytecode.object, args }) });
  const r = await pub.waitForTransactionReceipt({ hash });
  return r.contractAddress!;
}

/** Run a v2 command as a separate process, as an operator would; return its output. */
function run(script: string, args: string[], expectFail = false): string {
  const tsx = join(ROOT, "node_modules", ".bin", "tsx");
  try {
    const out = execFileSync(tsx, [join(ROOT, "scripts", "v2", script), ...args], {
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (expectFail) throw new Error(`expected "${args.join(" ")}" to fail, but it printed:\n${out}`);
    return out;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    if (expectFail && e.status) return `${e.stdout ?? ""}${e.stderr ?? ""}`;
    throw new Error(`"${script} ${args.join(" ")}" failed:\n${e.stdout ?? ""}${e.stderr ?? ""}`);
  }
}
const cli = (...args: string[]) => run("cli.ts", args);
const cliFails = (...args: string[]) => run("cli.ts", args, true);

function proposalPath(out: string): string {
  const m = out.match(/^proposal: (.+)$/m);
  if (!m) throw new Error(`no proposal path in:\n${out}`);
  return m[1]!.trim();
}

function txHash(out: string): Hex {
  const m = out.match(/tx (0x[0-9a-fA-F]{64})/);
  if (!m) throw new Error(`no transaction hash in:\n${out}`);
  return m[1] as Hex;
}

const signerNames = ["v2-signer-a", "v2-signer-b", "v2-signer-c"];
const pkOf = new Map<string, Uint8Array>();

/**
 * Check every ML-DSA-87 share in a relayed quorum transaction against the exact
 * message the vault verifies, with the vault state from before the call.
 */
async function verifyRelayed(hash: Hex, before: { nonce: bigint; factory: Address; openTenderId: bigint }): Promise<void> {
  const tx = await pub.getTransaction({ hash });
  const { functionName, args } = decodeFunctionData({ abi: vaultAbi as Abi, data: tx.input });
  const all = args as readonly unknown[];
  const auth = all[all.length - 1] as { deadline: bigint; signers: readonly Address[]; signatures: readonly Hex[] };
  const h = argsHashFor(functionName, all.slice(0, -1), before);
  for (let i = 0; i < auth.signers.length; i++) {
    const member = auth.signers[i]!;
    const m = quorumMessage(
      { chainId: 9800n, verifier: tx.to!, action: actionIdOf(functionName as never), nonce: before.nonce, deadline: auth.deadline, argsHash: h },
      member,
    );
    const ok = pqcVerify(pkOf.get(member.toLowerCase())!, toBytes(m), toBytes(auth.signatures[i]!));
    check(ok, `${functionName}: ML-DSA-87 share by ${member.slice(0, 10)}… verifies over the vault's message`);
  }
}

async function main(): Promise<void> {
  console.log(`temporary directory: ${tmp}`);
  const anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "9800", "--silent"], { stdio: "ignore", detached: KEEP });
  try {
    for (let i = 0; ; i++) {
      try {
        await rpc("eth_chainId");
        break;
      } catch {
        if (i > 50) throw new Error("anvil did not start");
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // ---------------------------------------------------------------- accounts
    console.log("\n1. accounts (throwaway, in the temporary directory)");
    for (const n of ["v2-deployer", "v2-relayer", ...signerNames]) await newV2Account(n);
    const accts = Object.fromEntries(
      await Promise.all(["v2-deployer", "v2-relayer", ...signerNames].map(async (n) => [n, await loadV2Account(n)] as const)),
    );
    for (const n of ["v2-deployer", "v2-relayer"]) {
      await rpc("anvil_setBalance", [accts[n]!.evm, toHex(100n * 10n ** 18n)]);
    }

    // ---------------------------------------------------------------- precompiles
    console.log("\n2. precompile stand-ins: pqcKeyStatus holds each signer's real ML-DSA-87 public key");
    const ks = await deploy("MockPqcKeyStatus.sol", "MockPqcKeyStatus");
    const vf = await deploy("MockPqcVerify.sol", "MockPqcVerify");
    await rpc("anvil_setCode", ["0x0000000000000000000000000000000000000a02", await pub.getCode({ address: ks })]);
    await rpc("anvil_setCode", ["0x0000000000000000000000000000000000000a01", await pub.getCode({ address: vf })]);
    await send("0x0000000000000000000000000000000000000a01", encodeFunctionData({
      abi: parseAbi(["function setMode(uint8)"]),
      functionName: "setMode",
      args: [5], // AlwaysTrue: the harness checks every share itself (verifyRelayed)
    }));
    for (const n of signerNames) {
      const a = accts[n]!;
      pkOf.set(a.evm.toLowerCase(), a.pqc.publicKey);
      await send("0x0000000000000000000000000000000000000a02", encodeFunctionData({
        abi: parseAbi(["function set(address,bool,uint8,bytes,bool)"]),
        functionName: "set",
        args: [a.evm as Address, true, 1, toHex(a.pqc.publicKey), true],
      }));
    }

    // ---------------------------------------------------------------- deploy
    console.log("\n3. tokens, a mock auction factory, and the vault through the deploy script");
    const fusd = await deploy("MockERC20.sol", "MockERC20", ["FestUSD", "fUSD", 6]);
    const peal = await deploy("MockERC20.sol", "MockERC20", ["Peal Token", "PEAL-T", 18]);
    const factory = await deploy("MockSealedAuction.sol", "MockSealedAuctionFactory");
    console.log(
      run("deploy.ts", ["--buy", peal, "--factory", factory, "--pay", fusd, "--delay", "300", "--cap", "100000000"]).trim(),
    );
    const vault = loadDeployment().contracts.PealTenderV2.address;
    const erc20 = parseAbi([
      "function mint(address,uint256)",
      "function balanceOf(address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
    ]);
    const bal = (t: Address, a: Address) => pub.readContract({ address: t, abi: erc20, functionName: "balanceOf", args: [a] });
    const read = <T>(fn: string, args: readonly unknown[] = []) =>
      pub.readContract({ address: vault, abi: vaultAbi, functionName: fn, args } as never) as Promise<T>;
    const state = async () => ({
      nonce: await read<bigint>("nonce"),
      factory: await read<Address>("auctionFactory"),
      openTenderId: await read<bigint>("openTenderId"),
    });
    check((await read<bigint>("threshold")) === 2n, "deployed vault is 2-of-3");
    const pre = cli("preflight", "--buy", peal, "--factory", factory);
    check(/ok {3}auction factory .*answers like SealedAuctionFactory/.test(pre), "preflight recognises the auction factory");
    check(/ok {3}PEAL-T .*PEAL-T, 18 decimals/.test(pre), "preflight reads the PEAL-T token");
    check(/ok {3}PealTenderV2 .*members are the three v2 signers/.test(pre), "preflight matches the deployed members to the v2 signers");
    await send(fusd, encodeFunctionData({ abi: erc20, functionName: "mint", args: [vault, 1_000_000_000n] }));

    const quorum = async (proposeArgs: string[], signers = ["v2-signer-a", "v2-signer-b"]) => {
      const file = proposalPath(cli("propose", ...proposeArgs));
      for (const s of signers) cli("sign-action", file, "--as", s);
      const before = await state();
      const out = cli("relay", file);
      await verifyRelayed(txHash(out), before);
      return out;
    };

    // ---------------------------------------------------------------- sweep
    console.log("\n4. an immediate sweep: propose, two signers sign, relay");
    const sink = "0x000000000000000000000000000000000000bEEF" as Address;
    await quorum(["sweep", "fusd", sink, "10000000"]);
    check((await bal(fusd, sink)) === 10_000_000n, "10 fUSD swept to the recipient");

    // ---------------------------------------------------------------- refusals
    console.log("\n5. refusals");
    let file = proposalPath(cli("propose", "sweep", "fusd", sink, "1000000"));
    cli("sign-action", file, "--as", "v2-signer-a");
    check(/1 shares, 2 needed/.test(cliFails("relay", file)), "one share is not relayed");

    const p = loadProposal(file);
    const attacker = "0x000000000000000000000000000000000000a77a" as Address;
    p.args = encodeArgs("sweep", [fusd, attacker, 1_000_000n]); // the file now says something else than its hash
    writeFileSync(file, JSON.stringify(p, null, 2));
    check(/does not match its arguments/.test(cliFails("sign-action", file, "--as", "v2-signer-b")), "a tampered proposal is not signed");

    file = proposalPath(cli("propose", "sweep", "fusd", sink, "1000000"));
    cli("sign-action", file, "--as", "v2-signer-a");
    cli("sign-action", file, "--as", "v2-signer-c");
    await quorum(["sweep", "fusd", sink, "1000000"]); // consumes the nonce first
    check(/stale proposal/.test(cliFails("relay", file)), "a proposal made at an older nonce is not relayed");

    const outsider = await (async () => {
      await newV2Account("v2-outsider");
      return "v2-outsider";
    })();
    file = proposalPath(cli("propose", "sweep", "fusd", sink, "1000000"));
    check(/not a member/.test(cliFails("sign-action", file, "--as", outsider)), "a non-member cannot add a share");

    // ---------------------------------------------------------------- timelock
    console.log("\n6. timelock: queue a large sweep, one signer vetoes; queue again, wait, execute");
    await quorum(["queue", "sweep", "fusd", sink, "500000000"]);
    let before = await state();
    const vetoOut = cli("veto", "1", "--as", "v2-signer-c");
    {
      const tx = await pub.getTransaction({ hash: txHash(vetoOut) });
      const { args } = decodeFunctionData({ abi: vaultAbi as Abi, data: tx.input });
      const [opId, deadline, member, sig] = args as readonly [bigint, bigint, Address, Hex];
      const m = anyMessage(
        { chainId: 9800n, verifier: vault, action: actionIdOf("veto"), nonce: before.nonce, deadline, argsHash: argsHash.veto(opId) },
        member,
      );
      check(pqcVerify(pkOf.get(member.toLowerCase())!, toBytes(m), toBytes(sig)), "veto: the single share verifies");
    }
    check((await read<{ state: number }>("getOp", [1n])).state === 3, "op 1 is vetoed");
    check(/refused: OpNotQueued\(1, 3\)/.test(cliFails("execute", "1")), "a vetoed change cannot be executed");

    await quorum(["queue", "sweep", "fusd", sink, "500000000"]);
    check(/refused: OpNotReady\(2, /.test(cliFails("execute", "2")), "a change cannot run before its delay");
    await warp(301);
    const sinkBefore = await bal(fusd, sink);
    cli("execute", "2");
    check((await bal(fusd, sink)) - sinkBefore === 500_000_000n, "after the delay anyone executes the queued 500 fUSD sweep");

    // ---------------------------------------------------------------- tender
    console.log("\n7. a tender: open (quorum), three holders offer, anyone settles");
    // Budget 50 fUSD; prices 1.00 + 0.10 a tick. Offers: 20 at 1.00, 30 at 1.20, 25 at 1.50.
    // At 1.20 the budget pays the 20 cheaper tokens but not all 30 more: it clears at 1.20,
    // the 1.00 offer fills in full and is paid 1.20 each, the 1.50 offer sells nothing.
    await quorum(["open-tender", "50000000", "1000000", "100000", "10", "3600", "10", "10000000000000000"]);
    const offerFrom = async (w: typeof helper, qty: bigint, tick: number) => {
      await send(peal, encodeFunctionData({ abi: erc20, functionName: "mint", args: [w.account.address, qty] }));
      const a = await w.sendTransaction({ to: peal, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [vault, qty] }) });
      await pub.waitForTransactionReceipt({ hash: a });
      const o = await w.sendTransaction({ to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "offer", args: [qty, tick] }) });
      await pub.waitForTransactionReceipt({ hash: o });
    };
    const E18 = 10n ** 18n;
    await offerFrom(helper, 20n * E18, 0);
    await offerFrom(holder2, 30n * E18, 2);
    await offerFrom(holder3, 25n * E18, 5);
    await warp(3601);
    cli("settle");
    const tender = await read<{ state: number; price: bigint; bought: bigint; clearingTick: number }>("getTender", [1n]);
    check(tender.state === 2 && tender.price === 1_200_000n && tender.clearingTick === 2, "the tender cleared at 1.20 fUSD (tick 2)");
    const holder = helper.account.address;
    const holderFusd = await bal(fusd, holder);
    await send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "claim", args: [1n, 0] }));
    check((await bal(fusd, holder)) - holderFusd === 24_000_000n, "the 1.00 seller was paid the clearing price: 24 fUSD for 20 PEAL-T");
    const h3Peal = await bal(peal, holder3.account.address);
    await send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "claim", args: [1n, 2] }));
    check((await bal(peal, holder3.account.address)) - h3Peal === 25n * E18, "the 1.50 seller got all 25 PEAL-T back");

    // ---------------------------------------------------------------- sealed sale
    console.log("\n8. a sealed buyback on the (mock) auction factory, collected by anyone");
    const saleFile = join(tmp, "sale.json");
    writeFileSync(saleFile, readFileSync(join(ROOT, "examples", "sale.json"), "utf8"));
    // Today's 100 fUSD allowance has 39 left (sweeps of 10 and 1, the tender's budget of 50):
    // a 40 fUSD sale must wait for tomorrow, or go through the timelock.
    const saleProposal = proposalPath(cli("propose", "start-sale", saleFile));
    cli("sign-action", saleProposal, "--as", "v2-signer-a");
    cli("sign-action", saleProposal, "--as", "v2-signer-b");
    check(/refused: OverDailyCap\(.*, 40000000, 39000000\)/.test(cliFails("relay", saleProposal)), "a sale above today's allowance is refused (OverDailyCap)");
    const now = (await pub.getBlock()).timestamp;
    await warp(Number(86_400n - (now % 86_400n)) + 1); // the next UTC day
    check((await read<bigint>("remainingToday", [fusd])) === 100_000_000n, "the next day the allowance is whole again");
    await quorum(["start-sale", saleFile]);
    const auction = await read<Address>("saleAt", [0n]);
    check((await bal(fusd, auction)) === 40_000_000n, "the auction holds the 40 fUSD supply");
    await send(peal, encodeFunctionData({ abi: erc20, functionName: "mint", args: [auction, 300n * 10n ** 18n] }));
    await send(auction, encodeFunctionData({
      abi: parseAbi(["function settle(uint256,uint256)"]),
      functionName: "settle",
      args: [30_000_000n, 300n * 10n ** 18n],
    }));
    const vaultPeal = await bal(peal, vault);
    cli("collect", auction);
    check((await bal(peal, vault)) - vaultPeal === 300n * 10n ** 18n, "the vault collected 300 PEAL-T of proceeds");
    check((await read<{ returned: bigint }>("getSale", [auction])).returned === 10_000_000n, "and 10 unsold fUSD came back");

    // ---------------------------------------------------------------- status
    console.log("\n9. status");
    console.log(cli("status").trim());
    check(true, "status prints");

    console.log(`\ne2e: all ${checks} checks passed`);
    if (KEEP) await lively(accts, { vault, fusd, peal, erc20, offerFrom, quorum, saleFile });
  } finally {
    if (KEEP) {
      anvil.unref();
    } else {
      anvil.kill();
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

/** --keep: leave something in every state for the web app to show, then print its URL. */
async function lively(
  accts: Record<string, { evm: string; pqc: { publicKey: Uint8Array } }>,
  x: {
    vault: Address;
    fusd: Address;
    peal: Address;
    erc20: readonly unknown[];
    offerFrom: (w: typeof helper, qty: bigint, tick: number) => Promise<void>;
    quorum: (args: string[], signers?: string[]) => Promise<string>;
    saleFile: string;
  },
): Promise<void> {
  console.log("\n10. keeping the node running with a lively vault (--keep)");
  // A signer rotation waiting in the timelock: replace signer C with a fresh account.
  await newV2Account("v2-signer-d");
  const d = await loadV2Account("v2-signer-d");
  await send("0x0000000000000000000000000000000000000a02", encodeFunctionData({
    abi: parseAbi(["function set(address,bool,uint8,bytes,bool)"]),
    functionName: "set",
    args: [d.evm as Address, true, 1, toHex(d.pqc.publicKey), true],
  }));
  const set = [accts["v2-signer-a"]!.evm, accts["v2-signer-b"]!.evm, d.evm].join(",");
  await x.quorum(["queue", "signers", "2", set]);
  // A second tender, open for a day, with offers across the ladder.
  await x.quorum(["open-tender", "20000000", "900000", "50000", "12", "86400", "20", "10000000000000000"]);
  const E18 = 10n ** 18n;
  await x.offerFrom(helper, 6n * E18, 0);
  await x.offerFrom(holder2, 9n * E18, 3);
  await x.offerFrom(holder3, 4n * E18, 3);
  await x.offerFrom(holder2, 12n * E18, 7);
  await x.offerFrom(holder3, 5n * E18, 10);
  // A second sealed sale, still taking bids.
  await x.quorum(["start-sale", x.saleFile]);
  const url = `http://localhost:5199/?rpc=${encodeURIComponent(RPC)}&vault=${x.vault}`;
  console.log(`\nanvil keeps running on ${RPC} (stop it with: pkill -f "anvil --port ${PORT}")`);
  console.log(`accounts and proposals: ${tmp}`);
  console.log(`web app:  npm run dashboard -- --port 5199   then open\n  ${url}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
