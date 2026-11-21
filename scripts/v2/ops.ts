/**
 * ops.ts - getting the v2 accounts ready, and checking they are, before a deploy.
 *
 *   npm run v2 -- preflight [--buy <PEAL-T>] [--factory <SealedAuctionFactory>]
 *       read-only: accounts, keys, balances against what each role needs, the
 *       addresses the vault will be built with, and the deployment if there is one
 *   npm run v2 -- account fund <fromName> <toName> <QOR>
 *       move test QOR between two v2 accounts (one faucet claim can fund all five)
 *   npm run v2 -- account send <fromName> <qor1…|0x…> <QOR>
 *       give a visitor's guest account (made in the web app) test QOR, at most 2 QOR
 *   npm run v2 -- fusd swap <name> <uqorIn> <minOut> [poolId]
 *       swap QOR for fUSD on the testnet AMM (pool 2 held QOR/fUSD in November)
 *   npm run v2 -- fusd convert <name> [amount]
 *       turn the account's fUSD bank coin into the v2 vault's ERC-20 balance
 *       (MsgConvertCoin straight to the vault: no approval, no ERC-20 in the account)
 *
 * Every command here works only between v2 accounts and the v2 vault, and
 * refuses the drill account and the drill contracts.
 */
import { existsSync } from "node:fs";
import { fetchEvmWindow, fetchPqcStatus, isRegisteredPqcKey, msg as sdkMsg } from "@qorechain/sdk";
import { bytesToHex, formatEther, type Address, type Hex } from "viem";
import {
  FUSD_DENOM,
  NATIVE_FEE,
  balances,
  broadcast,
  convertCoinMsg,
  festRegistry,
  network,
  publicClient,
  qor,
} from "pqkit";
import { erc20Abi, vaultAbi } from "./abi.ts";
import { loadV2Account, refuseDrill, secretsFile } from "./accounts.ts";
import { metadataHash } from "./encode.ts";
import { DEPLOYMENT_FILE, LOCAL_RPC, loadDeployment } from "./vault.ts";
import { validateAddress } from "../../vendor/qorechain-custody-kit/address.ts";
import { kemKeyOf, sealKeysOf } from "./kem.ts";

export const NOT_BEFORE = Date.parse("2026-11-19T00:00:00Z");

/**
 * What each role needs in native QOR, sized to a 10 QOR budget (what the v2 relayer
 * received on 16 November). Native transactions cost a fixed 0.15 QOR fee; EVM
 * transactions about 112.5 gwei per gas, with windows capped at 200 gwei.
 */
export const ROLES = [
  {
    name: "v2-deployer",
    needQor: 3,
    why: "key registration, a window open and close, and two creations (~1.9M and ~5.9M gas; the window cap is about 2 QOR)",
  },
  {
    name: "v2-relayer",
    needQor: 5,
    why: "key registration and four funding sends, then about 0.4 QOR per relayed action (window open and close plus 0.5 to 0.7M gas)",
  },
  { name: "v2-signer-a", needQor: 0.4, why: "the ML-DSA-87 and ML-KEM-1024 key registrations only (signers sign off chain)" },
  { name: "v2-signer-b", needQor: 0.4, why: "the two key registrations only" },
  { name: "v2-signer-c", needQor: 0.4, why: "the two key registrations only" },
] as const;

const UQOR_PER_QOR = 1_000_000n;
const ok = (b: boolean) => (b ? "ok  " : "TODO");

async function code(a: Address): Promise<number> {
  const c = await publicClient().getCode({ address: a });
  return c ? (c.length - 2) / 2 : 0;
}

export async function preflight(opts: { buy?: string; factory?: string }): Promise<void> {
  const net = network();
  const client = publicClient();
  const todo: string[] = [];
  console.log(`network: ${LOCAL_RPC ? `LOCAL ${LOCAL_RPC}` : `${net.chainId}, EVM ${net.evmRpc}`}`);
  const chainId = await client.getChainId();
  console.log(`${ok(chainId === 9800)} EVM chain id ${chainId}`);
  if (chainId !== 9800) todo.push("the EVM RPC is not chain 9800");

  const early = !LOCAL_RPC && Date.now() < NOT_BEFORE;
  console.log(`${ok(!early)} deploys allowed from 2026-11-19T00:00Z (now ${new Date().toISOString()})`);
  if (early) todo.push("wait for 19 November 00:00 UTC before deploying (Q-Day Drill), or deploy with the owner's --drill-day-ok");

  console.log("\naccounts (~/.qore-peal-tender/, never the drill's)");
  for (const r of ROLES) {
    if (!existsSync(secretsFile(r.name))) {
      console.log(`TODO ${r.name}: no account yet`);
      todo.push(`npm run v2 -- account new ${r.name}`);
      continue;
    }
    const acc = await loadV2Account(r.name);
    const uqor = LOCAL_RPC ? 0n : ((await balances(acc.cosmos)).uqor ?? 0n);
    const evmWei = await client.getBalance({ address: acc.evm as Address });
    // On the testnet the bank balance (uqor) is what fees and windows draw on; a local node has only EVM balances.
    const haveQor = LOCAL_RPC ? Number(formatEther(evmWei)) : Number(uqor) / 1e6;
    const signer = r.name.startsWith("v2-signer-");
    let funded = haveQor >= r.needQor;
    let keyOk = false;
    let keyNote = "";
    if (!LOCAL_RPC) {
      const pqc = await fetchPqcStatus({ rest: net.rest, address: acc.cosmos });
      keyOk = pqc.registered && isRegisteredPqcKey(pqc, acc.pqc.publicKey) !== false;
      keyNote = pqc.registered ? (keyOk ? "key registered" : "a DIFFERENT key is registered") : "key not registered";
      const w = await fetchEvmWindow({ rest: net.rest, address: acc.cosmos });
      if (w.found && w.live) {
        keyNote += "; a window is LIVE";
        todo.push(`close ${r.name}'s live window`);
      }
    } else {
      keyNote = "local: keys live in the pqcKeyStatus stand-in";
      keyOk = true;
    }
    let kemTodo = false;
    if (signer) {
      // Sealed proposals need each signer's ML-KEM-1024 key in the encryption key registry.
      const published = await kemKeyOf(acc.cosmos);
      const kemOk = Boolean(published && bytesToHex(published) === bytesToHex(sealKeysOf(acc).mlkemPublicKey));
      keyNote += published ? (kemOk ? "; ML-KEM key published" : "; a DIFFERENT ML-KEM key is published") : "; ML-KEM key not published";
      // A signer only pays for its two registrations (0.15 QOR each): what it still needs depends on what is done.
      const stillNeeds = (keyOk ? 0 : 0.15) + (kemOk ? 0 : 0.15);
      funded = haveQor >= stillNeeds;
      kemTodo = keyOk && !kemOk;
      keyOk = keyOk && kemOk;
    }
    console.log(
      `${ok(funded && keyOk)} ${r.name.padEnd(12)} ${acc.evm}  ${acc.cosmos}\n` +
        `       ${LOCAL_RPC ? `${formatEther(evmWei)} QOR` : qor(uqor)} (needs ${r.needQor} QOR: ${r.why}); ${keyNote}`,
    );
    if (!funded) todo.push(`fund ${r.name} ${acc.cosmos} with ${r.needQor} QOR (faucet, or npm run v2 -- account fund <from> ${r.name} <QOR>)`);
    if (funded && !keyOk) todo.push(kemTodo ? `npm run v2 -- account register-kem ${r.name}` : `npm run v2 -- account register ${r.name}`);
  }

  console.log("\naddresses the vault is built with");
  for (const [what, a] of [
    ["PEAL-T (--buy)", opts.buy],
    ["auction factory (--factory)", opts.factory],
  ] as const) {
    if (!a) {
      console.log(`TODO ${what}: not given`);
      todo.push(`pass ${what.split(" (")[1]!.replace(")", "")} <address> (from the Peal Sealed Auction deployment)`);
      continue;
    }
    refuseDrill(a, what);
    const size = await code(a as Address);
    let note = `${size} bytes of code`;
    let good = size > 0;
    if (good && what.startsWith("PEAL-T")) {
      const [sym, dec] = await Promise.all([
        client.readContract({ address: a as Address, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: a as Address, abi: erc20Abi, functionName: "decimals" }),
      ]);
      note += `, ${sym}, ${dec} decimals`;
    }
    if (good && what.startsWith("auction")) {
      const probe = [
        {
          type: "function",
          name: "metadataHash",
          stateMutability: "pure",
          inputs: [{ type: "string" }, { type: "string" }],
          outputs: [{ type: "bytes32" }],
        },
        { type: "function", name: "isAuction", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
      ] as const;
      const h = (await client.readContract({ address: a as Address, abi: probe, functionName: "metadataHash", args: ["n", "d"] })) as Hex;
      const listed = await client.readContract({ address: a as Address, abi: probe, functionName: "isAuction", args: [a as Address] });
      good = h === metadataHash("n", "d") && listed === false;
      note += good ? ", answers like SealedAuctionFactory" : ", does NOT answer like SealedAuctionFactory";
    }
    console.log(`${ok(good)} ${what}: ${a} (${note})`);
    if (!good) todo.push(`check ${what} ${a}`);
  }

  console.log("\ndeployment");
  if (!existsSync(DEPLOYMENT_FILE)) {
    console.log(`     none yet (${DEPLOYMENT_FILE})`);
  } else {
    const d = loadDeployment();
    const v = d.contracts.PealTenderV2.address;
    const size = await code(v);
    const members = size ? ((await client.readContract({ address: v, abi: vaultAbi, functionName: "members" })) as Address[]) : [];
    const signers = await Promise.all(["v2-signer-a", "v2-signer-b", "v2-signer-c"].filter((n) => existsSync(secretsFile(n))).map((n) => loadV2Account(n)));
    const same = members.length === 3 && signers.every((s) => members.some((m) => m.toLowerCase() === s.evm.toLowerCase()));
    console.log(`${ok(size > 0 && same)} PealTenderV2 ${v}: ${size} bytes; members ${same ? "are the three v2 signers" : "DIFFER from the v2 signers"}`);
  }

  console.log(todo.length === 0 ? "\nready." : `\nto do, in order:\n${todo.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}`);
}

/** Move test QOR between two v2 accounts (a hybrid-signed bank send). */
export async function fund(fromName: string, toName: string, qorAmount: string): Promise<void> {
  const from = await loadV2Account(fromName);
  const to = await loadV2Account(toName); // a v2 account by name only: never an arbitrary address
  const [whole, frac = ""] = qorAmount.split(".");
  const uqor = BigInt(whole!) * UQOR_PER_QOR + BigInt((frac + "000000").slice(0, 6));
  if (uqor <= 0n) throw new Error("amount must be positive");
  const m = sdkMsg.bank.send({ fromAddress: from.cosmos, toAddress: to.cosmos, amount: [{ denom: "uqor", amount: uqor.toString() }] });
  const res = await broadcast(from, [m]);
  console.log(`sent ${qor(uqor)} from ${fromName} to ${toName} (${to.cosmos}): tx ${res.transactionHash}`);
}

/** The most `account send` gives one visitor: a guest needs about 0.6 QOR. */
export const GUEST_SEND_MAX_UQOR = 2n * UQOR_PER_QOR;

function toUqor(qorAmount: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(qorAmount ?? "")) throw new Error(`bad QOR amount "${qorAmount}"`);
  const [whole, frac = ""] = qorAmount.split(".");
  return BigInt(whole!) * UQOR_PER_QOR + BigInt((frac + "000000").slice(0, 6));
}

/**
 * Give a visitor's guest account test QOR so it can register its key and open a
 * window (the web app's guide asks for about 0.6). The one v2 command that sends to
 * an address that is not a v2 account: capped at 2 QOR, accounts only, never the drill's.
 */
export async function sendToGuest(fromName: string, to: string, qorAmount: string): Promise<void> {
  const from = await loadV2Account(fromName);
  const check = validateAddress(to);
  if (!check.valid) throw new Error(`recipient ${to}: ${check.detail}`);
  refuseDrill(check.bech32, "recipient");
  refuseDrill(check.hex, "recipient");
  const uqor = toUqor(qorAmount);
  if (uqor <= 0n || uqor > GUEST_SEND_MAX_UQOR) throw new Error(`send between 0 and ${qor(GUEST_SEND_MAX_UQOR)} to a guest account`);
  const m = sdkMsg.bank.send({ fromAddress: from.cosmos, toAddress: check.bech32, amount: [{ denom: "uqor", amount: uqor.toString() }] });
  const res = await broadcast(from, [m]);
  console.log(`sent ${qor(uqor)} from ${fromName} to ${check.bech32} (${check.hex}): tx ${res.transactionHash}`);
}

/** Swap QOR for fUSD on the testnet AMM, from a v2 account. */
export async function swapFusd(name: string, uqorIn: bigint, minOut: bigint, poolId = "2"): Promise<void> {
  const acc = await loadV2Account(name);
  const m = sdkMsg.amm.swapExactIn({
    sender: acc.cosmos,
    poolId,
    tokenIn: { denom: "uqor", amount: uqorIn.toString() },
    denomOut: FUSD_DENOM,
    minOut: minOut.toString(),
  });
  const res = await broadcast(acc, [m]);
  console.log(`swapped ${qor(uqorIn)} for fUSD in pool ${poolId}: tx ${res.transactionHash}`);
}

/** Convert a v2 account's fUSD bank coin straight into the v2 vault's ERC-20 balance. */
export async function convertFusdToVault(name: string, amount?: bigint): Promise<void> {
  const acc = await loadV2Account(name);
  const vault = loadDeployment().contracts.PealTenderV2.address;
  refuseDrill(vault, "vault");
  const have = (await balances(acc.cosmos))[FUSD_DENOM] ?? 0n;
  const amt = amount ?? have;
  if (amt === 0n || amt > have) throw new Error(`${name} holds ${have} fUSD base units; cannot convert ${amt}`);
  const res = await broadcast(acc, [convertCoinMsg(acc.cosmos, FUSD_DENOM, amt, vault)], "hybrid", NATIVE_FEE, festRegistry());
  console.log(`converted ${amt} fUSD base units into the vault ${vault}: tx ${res.transactionHash}`);
}
