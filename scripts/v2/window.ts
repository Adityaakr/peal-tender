/**
 * window.ts - scoped EVM windows for the v2 operator.
 *
 * An Ethereum-style transaction cannot carry a post-quantum signature, so the
 * relayer first opens a hybrid-signed `MsgOpenEVMWindow`. For v2 the window is
 * always SCOPED to the vault and its counterparties, at most
 * [vault, fUSD, PEAL-T, auction factory], with a small transaction count and a
 * short block count, and it is closed again in a `finally`. A transaction to any
 * other address is refused by the chain (`refusal-demo` shows it).
 *
 * The kit's `openWindow` loads accounts from ~/.qore-drill/ by name, so v2 builds
 * the same messages for its own accounts here.
 */
import { closeEvmWindowMsg, fetchEvmWindow, openEvmWindowMsg, type UnifiedAccount } from "@qorechain/sdk";
import { evmWindowCost } from "@qorechain/evm";
import { broadcast, network } from "pqkit";
import { refuseDrill } from "./accounts.ts";
import { LOCAL_RPC } from "./vault.ts";

export interface ScopedWindow {
  targets: string[]; // 1 to 4 addresses
  maxTxs: number; // 1 to 5
  blocks: number; // 1 to 600 (about ten minutes)
  gasPerTx: bigint;
  maxFeePerGas?: bigint;
}

export async function openScopedWindow(acc: UnifiedAccount, w: ScopedWindow): Promise<string> {
  if (w.targets.length === 0 || w.targets.length > 4) throw new Error("a v2 window lists 1 to 4 targets");
  if (w.maxTxs < 1 || w.maxTxs > 5) throw new Error("a v2 window admits 1 to 5 transactions");
  if (w.blocks < 1 || w.blocks > 600) throw new Error("a v2 window lasts 1 to 600 blocks");
  for (const t of w.targets) refuseDrill(t, "window target");
  const perTx = evmWindowCost({ gas: w.gasPerTx, maxFeePerGas: w.maxFeePerGas ?? 250_000_000_000n, value: 0n });
  const targets = w.targets.map((t) => t.toLowerCase());
  const msg = openEvmWindowMsg({
    sender: acc.cosmos,
    blocks: w.blocks,
    maxTxs: w.maxTxs,
    maxValue: perTx * BigInt(w.maxTxs),
    allowedTargets: targets,
  });
  const res = await broadcast(acc, [msg]);
  console.log(`opened window: tx ${res.transactionHash}; ${w.blocks} blocks, ${w.maxTxs} txs, targets ${targets.join(" ")}`);
  return res.transactionHash;
}

export async function closeWindowFor(acc: UnifiedAccount): Promise<string | undefined> {
  const w = await fetchEvmWindow({ rest: network().rest, address: acc.cosmos });
  if (!w.found) return undefined;
  const res = await broadcast(acc, [closeEvmWindowMsg(acc.cosmos)]);
  console.log(`closed window: tx ${res.transactionHash}`);
  return res.transactionHash;
}

/** Run `body` inside a scoped window and always close the window afterwards. */
export async function withScopedWindow<T>(acc: UnifiedAccount, w: ScopedWindow, body: () => Promise<T>): Promise<T> {
  if (LOCAL_RPC) {
    console.log(`local node: no window (would be scoped to ${w.targets.join(" ")})`);
    return body();
  }
  await openScopedWindow(acc, w);
  try {
    return await body();
  } finally {
    await closeWindowFor(acc);
  }
}
