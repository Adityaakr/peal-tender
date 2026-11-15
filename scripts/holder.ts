/**
 * holder.ts - act as a token holder (the "ops" account holds the test token).
 *
 *   npm run holder -- offer <quantity:tick> [<quantity:tick> ...]   (whole tPEAL)
 *   npm run holder -- claim <tenderId> <offerId> [<offerId> ...]
 *
 * Holders need no post-quantum authorisation from the vault: they move only
 * their own tokens, and claims pay only the offer's seller. Each command opens
 * a window scoped to the token and the vault, sized for exactly its
 * transactions, and closes it afterwards. The approval is for the exact
 * amount offered, so none is left over.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeFunctionData, erc20Abi, parseEther, type Abi, type Address } from "viem";
import { closeWindow, loadAccount, openWindow, publicClient, sendEvm } from "qore-pq-kit";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deployment = JSON.parse(readFileSync(join(root, "deployments", "qorechain-diana.json"), "utf8"));
const VAULT = deployment.contracts.PealTender.address as Address;
const TPEAL = deployment.contracts.PealTestToken.address as Address;
const abi = JSON.parse(readFileSync(join(root, "out", "PealTender.sol", "PealTender.json"), "utf8")).abi as Abi;
const NAME = process.env.HOLDER?.trim() || "ops";

async function offer(specs: string[]): Promise<void> {
  const acc = await loadAccount(NAME);
  const offers = specs.map((s) => {
    const [q, t] = s.split(":");
    return { quantity: parseEther(q!), tick: Number(t) };
  });
  const total = offers.reduce((a, o) => a + o.quantity, 0n);
  await openWindow(NAME, { blocks: 300, maxTxs: offers.length + 1, gasPerTx: 300_000n, targets: [TPEAL, VAULT] });
  try {
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [VAULT, total] });
    const r = await sendEvm(acc, { to: TPEAL, data: approve, gas: 80_000n });
    console.log(`approved ${total} for the vault: tx ${r.transactionHash}`);
    for (const o of offers) {
      const data = encodeFunctionData({ abi, functionName: "offer", args: [o.quantity, o.tick] });
      const rr = await sendEvm(acc, { to: VAULT, data, gas: 250_000n });
      console.log(`offered ${o.quantity} at tick ${o.tick}: tx ${rr.transactionHash}`);
    }
  } finally {
    await closeWindow(NAME);
  }
  const left = await publicClient().readContract({
    address: TPEAL,
    abi: erc20Abi,
    functionName: "allowance",
    args: [acc.evm as Address, VAULT],
  });
  console.log(`allowance left: ${left}`);
}

async function claim(tenderId: string, offerIds: string[]): Promise<void> {
  const acc = await loadAccount(NAME);
  await openWindow(NAME, { blocks: 300, maxTxs: offerIds.length, gasPerTx: 200_000n, targets: [VAULT] });
  try {
    for (const id of offerIds) {
      const data = encodeFunctionData({ abi, functionName: "claim", args: [BigInt(tenderId), Number(id)] });
      const r = await sendEvm(acc, { to: VAULT, data, gas: 200_000n });
      console.log(`claimed offer ${id} of tender ${tenderId}: tx ${r.transactionHash}`);
    }
  } finally {
    await closeWindow(NAME);
  }
}

const [cmd, ...a] = process.argv.slice(2);
const run = cmd === "offer" ? () => offer(a) : cmd === "claim" ? () => claim(a[0]!, a.slice(1)) : undefined;
if (!run) {
  console.error("Usage: holder offer <qty:tick>... | holder claim <tenderId> <offerId>...");
  process.exit(1);
}
run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
