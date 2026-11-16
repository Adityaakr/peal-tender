/**
 * guest.ts - a testnet account that lives in this browser.
 *
 * QoreChain admits an EVM transaction only from an account with a registered
 * ML-DSA-87 key and a live authorisation window, opened by a hybrid-signed
 * (secp256k1 + ML-DSA-87) native message. A browser wallet such as MetaMask cannot
 * make that signature, and QoreX does not send EVM transactions for pages yet. So a
 * visitor who wants to act gets a guest account: a fresh mnemonic from the
 * browser's random source (never derived from a wallet signature, which the SDK
 * rejects as unsafe), held in this browser's storage only, with both keys derived
 * by @qorechain/sdk. It registers its post-quantum key, opens a window scoped to the
 * contracts it calls, sends, and closes the window, as the CLI does.
 *
 * Testnet only, for trying the app: the page warns, offers a backup, and can forget it.
 * Treasury signers never use this; their keys stay in the CLI.
 */
import { createPublicClient, createWalletClient, http, type Address, type Hex, type TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { UnifiedAccount } from "@qorechain/sdk";
import { explainEvmRefusal } from "./refusal.ts";
import { CHAIN_ID, COMET_RPC, EVM_CHAIN_ID, EVM_RPC, IS_LOCAL, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS, NATIVE_FEE, REST } from "../config.ts";

const STORE = "peal-tender.guest.v1";

const chain = {
  id: EVM_CHAIN_ID,
  name: "QoreChain testnet",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
};
export const evm = createPublicClient({ chain, transport: http(EVM_RPC) });

export interface GuestStatus {
  evm: Address;
  cosmos: string;
  /** Native balance in uqor (testnet) or the EVM balance in wei (local). */
  qor: bigint;
  qorDecimals: number;
  keyRegistered: boolean;
  keyIsOurs: boolean;
  windowLive: boolean;
}

export interface Call {
  to: Address;
  data: Hex;
  label: string;
}

type Log = (line: string) => void;

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function savedMnemonic(): string | undefined {
  try {
    return storage()?.getItem(STORE) ?? undefined;
  } catch {
    return undefined;
  }
}

async function sdk() {
  return import("@qorechain/sdk");
}

let cached: { mnemonic: string; acc: UnifiedAccount } | undefined;

export async function account(): Promise<UnifiedAccount | undefined> {
  const m = savedMnemonic();
  if (!m) return undefined;
  if (cached?.mnemonic === m) return cached.acc;
  const acc = await (await sdk()).deriveUnifiedAccount(m, 0);
  cached = { mnemonic: m, acc };
  return acc;
}

export async function create(): Promise<UnifiedAccount> {
  const s = await sdk();
  const m = s.generateMnemonic(256);
  storage()?.setItem(STORE, m);
  return (await account())!;
}

export async function importMnemonic(m: string): Promise<UnifiedAccount> {
  const s = await sdk();
  const words = m.trim().split(/\s+/).join(" ");
  if (!s.validateMnemonic(words)) throw new Error("That is not a valid recovery phrase.");
  storage()?.setItem(STORE, words);
  return (await account())!;
}

export function forget(): void {
  storage()?.removeItem(STORE);
  cached = undefined;
}

// ---------------------------------------------------------------- reading

async function getJson<T>(path: string): Promise<T | undefined> {
  const r = await fetch(`${REST}${path}`);
  if (r.status === 404) return undefined;
  if (!r.ok) throw new Error(`QoreChain REST ${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function status(acc: UnifiedAccount): Promise<GuestStatus> {
  if (IS_LOCAL) {
    const wei = await evm.getBalance({ address: acc.evm as Address });
    return { evm: acc.evm as Address, cosmos: acc.cosmos, qor: wei, qorDecimals: 18, keyRegistered: true, keyIsOurs: true, windowLive: false };
  }
  const s = await sdk();
  const [bal, pqc, w] = await Promise.all([
    getJson<{ balances: { denom: string; amount: string }[] }>(`/cosmos/bank/v1beta1/balances/${acc.cosmos}`),
    s.fetchPqcStatus({ rest: REST, address: acc.cosmos }),
    s.fetchEvmWindow({ rest: REST, address: acc.cosmos }),
  ]);
  const uqor = BigInt(bal?.balances.find((b) => b.denom === "uqor")?.amount ?? "0");
  return {
    evm: acc.evm as Address,
    cosmos: acc.cosmos,
    qor: uqor,
    qorDecimals: 6,
    keyRegistered: pqc.registered,
    keyIsOurs: pqc.registered ? s.isRegisteredPqcKey(pqc, acc.pqc.publicKey) !== false : false,
    windowLive: Boolean(w.found && w.live),
  };
}

// ---------------------------------------------------------------- native (hybrid-signed) transactions

async function broadcast(acc: UnifiedAccount, messages: { typeUrl: string; value: unknown }[], mode: "hybrid" | "classical" = "hybrid") {
  const s = await sdk();
  const { StargateClient } = await import("@cosmjs/stargate");
  const a = await getJson<{ account?: Record<string, unknown> }>(`/cosmos/auth/v1beta1/accounts/${acc.cosmos}`);
  const base = ((a?.account?.base_account ?? a?.account ?? {}) as Record<string, string>);
  const signer = new s.EthNativeSigner(acc, { signMode: mode, rest: REST });
  const transport = await StargateClient.connect(COMET_RPC);
  try {
    const res = await signer.signAndBroadcast(transport, {
      chainId: CHAIN_ID,
      accountNumber: BigInt(base.account_number ?? "0"),
      sequence: BigInt(base.sequence ?? "0"),
      fee: NATIVE_FEE,
      messages: messages as never,
    });
    if (res.code !== 0) throw new Error(`transaction ${res.transactionHash} failed (code ${res.code}): ${res.rawLog ?? ""}`);
    return res.transactionHash as string;
  } finally {
    transport.disconnect();
  }
}

/** Register the account's ML-DSA-87 key with a proof of possession (the one message the chain takes classically signed). */
export async function registerKey(acc: UnifiedAccount, log: Log): Promise<void> {
  if (IS_LOCAL) return;
  const s = await sdk();
  const st = await status(acc);
  if (st.keyRegistered) {
    if (!st.keyIsOurs) throw new Error("A different post-quantum key is registered for this account.");
    return;
  }
  if (st.qor < 300_000n) throw new Error("The account needs a little test QOR first (about 0.3) to pay for registering its key.");
  log("Registering your ML-DSA-87 key on chain…");
  const proof = s.signProofOfPossession({ chainId: CHAIN_ID, account: acc.cosmos, keypair: acc.pqc });
  const msg = s.buildRegisterPqcKeyMsg(acc.cosmos, { pqcKeypair: acc.pqc, proofOfPossession: proof });
  const tx = await broadcast(acc, [msg], "classical");
  log(`Key registered (tx ${tx.slice(0, 10)}…).`);
}

// ---------------------------------------------------------------- EVM, inside a scoped window

const wallet = (acc: UnifiedAccount) =>
  createWalletClient({ chain, transport: http(EVM_RPC), account: privateKeyToAccount(acc.privateKey as Hex) });

/**
 * Send `calls` in order: register the key if needed, open a window scoped to the
 * calls' targets for exactly that many transactions, send, and close the window
 * whatever happens. Locally (anvil) there is no window to open.
 */
export async function run(acc: UnifiedAccount, calls: Call[], log: Log): Promise<TransactionReceipt[]> {
  const w = wallet(acc);
  const GAS_CAP = 1_200_000n;
  if (!IS_LOCAL) {
    await registerKey(acc, log);
    const s = await sdk();
    const { evmWindowCost } = await import("@qorechain/evm");
    const targets = [...new Set(calls.map((c) => c.to.toLowerCase()))];
    const perTx = evmWindowCost({ gas: GAS_CAP, maxFeePerGas: MAX_FEE_PER_GAS, value: 0n });
    log(`Opening a window for ${calls.length} transaction${calls.length > 1 ? "s" : ""}, scoped to ${targets.length} contract${targets.length > 1 ? "s" : ""}…`);
    await broadcast(acc, [
      s.openEvmWindowMsg({ sender: acc.cosmos, blocks: 120, maxTxs: calls.length, maxValue: perTx * BigInt(calls.length), allowedTargets: targets }),
    ]);
  }
  const out: TransactionReceipt[] = [];
  try {
    for (const c of calls) {
      log(`${c.label}…`);
      const gasEst = await evm.estimateGas({ account: acc.evm as Address, to: c.to, data: c.data });
      const gas = (gasEst * 125n) / 100n;
      if (gas > GAS_CAP) throw new Error(`${c.label} needs ${gas} gas, more than this window allows`);
      const nonce = await evm.getTransactionCount({ address: acc.evm as Address, blockTag: "pending" });
      let hash: Hex;
      try {
        hash = await w.sendTransaction({
          to: c.to,
          data: c.data,
          gas,
          nonce,
          maxFeePerGas: IS_LOCAL ? undefined : MAX_FEE_PER_GAS,
          maxPriorityFeePerGas: IS_LOCAL ? undefined : MAX_PRIORITY_FEE_PER_GAS,
        });
      } catch (e) {
        throw await explainEvmRefusal(e, c.label);
      }
      const r = await evm.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (r.status !== "success") throw new Error(`${c.label} reverted (tx ${hash})`);
      out.push(r);
      log(`${c.label}: done (tx ${hash.slice(0, 10)}…).`);
    }
  } finally {
    if (!IS_LOCAL) {
      try {
        const s = await sdk();
        const st = await s.fetchEvmWindow({ rest: REST, address: acc.cosmos });
        if (st.found) {
          await broadcast(acc, [s.closeEvmWindowMsg(acc.cosmos)]);
          log("Window closed.");
        }
      } catch (e) {
        log(`Could not close the window: ${e instanceof Error ? e.message : String(e)}. It expires by itself within 120 blocks.`);
      }
    }
  }
  return out;
}

/** Local node only: give the guest some test QOR. */
export async function fundLocal(acc: UnifiedAccount): Promise<void> {
  if (!IS_LOCAL) throw new Error("only on a local node");
  await fetch(EVM_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [acc.evm, "0x8ac7230489e80000"] }),
  });
}
