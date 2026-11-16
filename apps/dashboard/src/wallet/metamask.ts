/**
 * metamask.ts - MetaMask (or any EIP-1193 browser wallet found through EIP-6963).
 *
 * On QoreChain an EVM transaction is accepted only from an account with a
 * registered ML-DSA-87 key and a live window opened by a hybrid-signed native
 * message (docs.qorechain.io/developer-guide/evm-window-reference). MetaMask cannot
 * make either, so it cannot send to the vault by itself. Here it can connect, add
 * the QoreChain testnet network and show its account; actions go through the
 * guest account. (Linking a MetaMask key to a post-quantum account as an
 * authenticator, relayed with MsgExecuteEVM, is the chain's route for that; it is
 * not yet proven end to end on the testnet.)
 */
import { EVM_RPC, EVM_CHAIN_ID } from "../config.ts";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface Announced {
  info: { name: string; rdns: string; icon?: string };
  provider: Eip1193;
}

const found = new Map<string, Announced>();

window.addEventListener("eip6963:announceProvider", (e) => {
  const d = (e as CustomEvent<Announced>).detail;
  if (d?.info?.rdns && !d.info.rdns.startsWith("network.qore.qorex")) found.set(d.info.rdns, d);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

declare global {
  interface Window {
    ethereum?: Eip1193 & { isMetaMask?: boolean };
  }
}

function pick(): Announced | undefined {
  const mm = found.get("io.metamask") ?? [...found.values()][0];
  if (mm) return mm;
  if (window.ethereum) return { info: { name: window.ethereum.isMetaMask ? "MetaMask" : "Browser wallet", rdns: "window.ethereum" }, provider: window.ethereum };
  return undefined;
}

export function available(): string | undefined {
  return pick()?.info.name;
}

export async function connect(): Promise<{ address: string; wallet: string; onQoreChain: boolean }> {
  const w = pick();
  if (!w) throw new Error("No browser wallet found. Install MetaMask, or use a guest account.");
  const accounts = (await w.provider.request({ method: "eth_requestAccounts" })) as string[];
  const hex = `0x${EVM_CHAIN_ID.toString(16)}`;
  let onQoreChain = false;
  try {
    await w.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    onQoreChain = true;
  } catch {
    try {
      await w.provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: "QoreChain testnet",
            nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
            rpcUrls: [EVM_RPC.startsWith("http://127.0.0.1") ? EVM_RPC : "https://evm-testnet.qore.host"],
          },
        ],
      });
      onQoreChain = true;
    } catch {
      // the user declined; the account is still shown
    }
  }
  return { address: accounts[0]!, wallet: w.info.name, onQoreChain };
}
