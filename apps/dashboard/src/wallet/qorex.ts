/**
 * qorex.ts - QoreChain's own wallet, through the provider its browser extension
 * injects (docs.qorechain.io/qorex/browser-extension, read 16 November 2026):
 *
 *   window.qorex = { evm, native, svm }
 *   native.enable(chainId), native.getKey(chainId), native.signAndBroadcast({ chainId, messages, memo?, gasLimit? })
 *   messages: [{ typeUrl, value: protobuf bytes }]; QoreX adds the hybrid
 *   (secp256k1 + ML-DSA-87) signature, sets the fee and shows it before signing.
 *
 * What QoreX does not do for pages yet (same docs): send EVM transactions
 * (eth_sendTransaction is "not yet supported"), open EVM windows, or sign arbitrary
 * messages. So here QoreX identifies the visitor and funds their guest account with
 * a QOR transfer they approve in QoreX; the guest account does the EVM actions.
 */
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { CHAIN_ID } from "../config.ts";

interface QorexNative {
  enable(chainId: string): Promise<unknown>;
  getKey(chainId: string): Promise<{ bech32Address?: string; address?: unknown; pubKey?: unknown }>;
  signAndBroadcast(req: {
    chainId: string;
    messages: { typeUrl: string; value: Uint8Array }[];
    memo?: string;
    gasLimit?: number;
  }): Promise<{ txHash: string; code: number; height?: number }>;
}

interface QorexEvm {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    qorex?: { native?: QorexNative; evm?: QorexEvm };
  }
}

export function available(): boolean {
  return Boolean(window.qorex?.native);
}

export interface QorexAccount {
  cosmos: string;
  evm?: string;
}

export async function connect(): Promise<QorexAccount> {
  const q = window.qorex;
  if (!q?.native) throw new Error("QoreX is not installed in this browser.");
  try {
    await q.native.enable(CHAIN_ID);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unsupported chain/i.test(msg)) throw new Error("Switch QoreX to the QoreChain testnet (qorechain-diana), then connect again.");
    throw e;
  }
  const key = await q.native.getKey(CHAIN_ID);
  const cosmos = key.bech32Address ?? (typeof key.address === "string" ? key.address : undefined);
  if (!cosmos) throw new Error("QoreX did not return an address.");
  let evm: string | undefined;
  try {
    const accounts = (await q.evm?.request({ method: "eth_requestAccounts" })) as string[] | undefined;
    evm = accounts?.[0];
  } catch {
    // the EVM side is optional here
  }
  return { cosmos, evm };
}

/** Send `uqor` test QOR from the QoreX account to `to` (a qor1 address); the user approves in QoreX. */
export async function sendQor(from: string, to: string, uqor: bigint): Promise<string> {
  const q = window.qorex;
  if (!q?.native) throw new Error("QoreX is not installed in this browser.");
  const value = MsgSend.encode(
    MsgSend.fromPartial({ fromAddress: from, toAddress: to, amount: [{ denom: "uqor", amount: uqor.toString() }] }),
  ).finish();
  const res = await q.native.signAndBroadcast({
    chainId: CHAIN_ID,
    messages: [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value }],
    memo: "Peal Tender: fund my guest account",
    gasLimit: 200_000,
  });
  if (res.code !== 0) throw new Error(`QoreX transfer failed (code ${res.code}, tx ${res.txHash})`);
  return res.txHash;
}
