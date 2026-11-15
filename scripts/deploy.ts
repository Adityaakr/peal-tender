/**
 * deploy.ts - deploy Peal Tender to the QoreChain testnet from the drill account.
 *
 *   npm run deploy -- [qorToVault]
 *
 * 1. Opens an UNSCOPED EVM window (a scoped window refuses contract creation),
 *    sized for exactly three transactions plus the QOR sent to the vault.
 * 2. Deploys the test token (whole supply to the "ops" account, which plays the
 *    token holders) and the vault (payment token fUSD, signer = drill account).
 * 3. Sends `qorToVault` native QOR into the vault (default 70).
 * 4. Closes the window, and checks that none is left.
 * 5. Writes the addresses to deployments/qorechain-diana.json.
 *
 * Needs ~/.qore-drill/drill.env and ~/.qore-drill/ops.env (npm run pq -- new-account).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEvmWindow } from "@qorechain/sdk";
import { encodeDeployData, getContractAddress, parseEther, type Abi, type Address, type Hex } from "viem";
import { FUSD, closeWindow, loadAccount, network, openWindow, publicClient, sendEvm } from "qore-pq-kit";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const a = JSON.parse(readFileSync(join(root, "out", `${name}.sol`, `${name}.json`), "utf8"));
  return { abi: a.abi as Abi, bytecode: a.bytecode.object as Hex };
}

async function main(): Promise<void> {
  const qorToVault = parseEther(process.argv[2] ?? "70");
  const drill = await loadAccount("drill");
  const ops = await loadAccount("ops");
  const client = publicClient();
  const net = network();

  const balance = await client.getBalance({ address: drill.evm as Address });
  if (balance < qorToVault + parseEther("5")) throw new Error(`drill account holds ${balance} wei; not enough`);

  const token = artifact("PealTestToken");
  const vault = artifact("PealTender");
  const tokenData = encodeDeployData({
    abi: token.abi,
    bytecode: token.bytecode,
    args: [ops.evm, parseEther("1000000")],
  });

  // 1. Window: three transactions of up to 4,000,000 gas, plus the vault funding.
  await openWindow("drill", { blocks: 600, maxTxs: 3, gasPerTx: 4_000_000n, extraValueWei: qorToVault });

  // Opening advanced the nonce; read it now.
  const nonce = await client.getTransactionCount({ address: drill.evm as Address, blockTag: "pending" });
  const tokenAddress = getContractAddress({ from: drill.evm as Address, nonce: BigInt(nonce) });
  const vaultAddress = getContractAddress({ from: drill.evm as Address, nonce: BigInt(nonce) + 1n });

  // 2. Deploy.
  const r1 = await sendEvm(drill, { data: tokenData });
  if (r1.contractAddress?.toLowerCase() !== tokenAddress.toLowerCase()) throw new Error("unexpected token address");
  console.log(`PealTestToken ${r1.contractAddress} (tx ${r1.transactionHash}, gas ${r1.gasUsed})`);

  const vaultData = encodeDeployData({ abi: vault.abi, bytecode: vault.bytecode, args: [FUSD, tokenAddress, drill.evm] });
  const r2 = await sendEvm(drill, { data: vaultData });
  if (r2.contractAddress?.toLowerCase() !== vaultAddress.toLowerCase()) throw new Error("unexpected vault address");
  console.log(`PealTender    ${r2.contractAddress} (tx ${r2.transactionHash}, gas ${r2.gasUsed})`);

  // 3. Fund the vault with native QOR.
  const r3 = await sendEvm(drill, { to: vaultAddress, value: qorToVault });
  console.log(`funded vault with ${qorToVault} wei (tx ${r3.transactionHash})`);

  // 4. Close the window.
  const closeTx = await closeWindow("drill");
  const w = await fetchEvmWindow({ rest: net.rest, address: drill.cosmos });
  if (w.found && w.live) throw new Error("a window is still live after closing");

  // 5. Record.
  const out = {
    network: "qorechain-diana",
    evmChainId: net.evmChainId,
    deployedAt: new Date().toISOString(),
    drillAccount: { evm: drill.evm, qor: drill.cosmos },
    opsAccount: { evm: ops.evm, qor: ops.cosmos },
    contracts: {
      PealTender: { address: vaultAddress, tx: r2.transactionHash, block: Number(r2.blockNumber) },
      PealTestToken: { address: tokenAddress, tx: r1.transactionHash, block: Number(r1.blockNumber) },
    },
    payToken: { symbol: "fUSD", address: FUSD },
    signer: drill.evm,
    fundingTx: r3.transactionHash,
    windowClosedTx: closeTx ?? null,
  };
  mkdirSync(join(root, "deployments"), { recursive: true });
  writeFileSync(join(root, "deployments", "qorechain-diana.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("wrote deployments/qorechain-diana.json");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
