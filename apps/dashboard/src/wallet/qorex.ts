/**
 * qorex.ts - QoreChain's own wallet, through the official QoreX integration
 * packages rather than hand-written types:
 *
 * - `@qorechain/qorex-types` finds it: `window.qorex.native` (Keplr pattern) for
 *   the account, and its EIP-1193 provider through the EIP-6963 announcement
 *   (QoreX never writes `window.ethereum`).
 * - `@qorechain/wallet-adapter` sends: `hasQorexSignAndBroadcast` checks the
 *   build's declared capabilities, `qorexSignAndBroadcast` validates the
 *   request (encoded protobuf messages, memo and gas bounds, no message QoreX
 *   refuses), and `isQorexRejection` tells a declined prompt from a failure.
 *
 * What QoreX does not do for pages yet (qorex-types 0.1.0, 16 November 2026): send
 * EVM transactions, open EVM windows, or sign arbitrary messages. So here QoreX
 * identifies the visitor and funds their guest account with a QOR transfer they
 * approve in QoreX; the guest account does the EVM actions.
 */
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { findQorexEip1193, getQorexNative, isQorexUnrecognizedChainError, QORECHAIN_TESTNET_CHAIN_ID } from "@qorechain/qorex-types";
import { CHAIN_ID } from "../config.ts";

export function available(): boolean {
  return Boolean(getQorexNative());
}

export interface QorexAccount {
  cosmos: string;
  evm?: string;
}

const SWITCH_TO_TESTNET = "Switch QoreX to the QoreChain testnet (qorechain-diana), then connect again.";

export async function connect(): Promise<QorexAccount> {
  const native = getQorexNative();
  if (!native) throw new Error("QoreX is not installed in this browser.");
  try {
    await native.enable(CHAIN_ID);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unsupported chain/i.test(msg)) throw new Error(SWITCH_TO_TESTNET);
    throw e;
  }
  const key = await native.getKey(CHAIN_ID);
  if (!key.bech32Address) throw new Error("QoreX did not return an address.");
  let evm: string | undefined;
  try {
    // Announced through EIP-6963; window.qorex.evm is the same provider.
    const provider = findQorexEip1193() ?? window.qorex?.evm;
    const accounts = (await provider?.request({ method: "eth_requestAccounts" })) as string[] | undefined;
    evm = accounts?.[0];
  } catch (e) {
    // The EVM side is optional here; only an unknown chain is worth saying.
    if (isQorexUnrecognizedChainError(e)) console.warn(SWITCH_TO_TESTNET);
  }
  return { cosmos: key.bech32Address, evm };
}

/** Thrown when the visitor declined in QoreX: not a failure, nothing was sent. */
export class Declined extends Error {
  constructor() {
    super("Declined in QoreX; nothing was sent.");
  }
}

/** Send `uqor` test QOR from the QoreX account to `to` (a qor1 address); the user approves in QoreX. */
export async function sendQor(from: string, to: string, uqor: bigint): Promise<string> {
  const { hasQorexSignAndBroadcast, isQorexRejection, qorexSignAndBroadcast } = await import("@qorechain/wallet-adapter");
  if (!hasQorexSignAndBroadcast()) throw new Error("Install or update QoreX to send from it (this build cannot send for pages).");
  const value = MsgSend.encode(
    MsgSend.fromPartial({ fromAddress: from, toAddress: to, amount: [{ denom: "uqor", amount: uqor.toString() }] }),
  ).finish();
  try {
    const res = await qorexSignAndBroadcast({
      chainId: QORECHAIN_TESTNET_CHAIN_ID,
      messages: [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value }],
      memo: "Peal Tender: fund my guest account",
      gasLimit: 200_000,
    });
    if (res.code !== 0) throw new Error(`QoreX transfer failed (code ${res.code}, tx ${res.txHash})`);
    return res.txHash;
  } catch (e) {
    if (isQorexRejection(e)) throw new Declined();
    throw e;
  }
}
