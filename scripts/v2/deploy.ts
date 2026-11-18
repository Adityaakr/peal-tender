/**
 * deploy.ts - deploy Peal Tender v2 to the QoreChain testnet, beside the drill vault.
 *
 *   npm run deploy:v2 -- --buy <PEAL-T> --factory <SealedAuctionFactory> [--delay 900] [--cap 1000000]
 *
 * Needs four fresh accounts in ~/.qore-peal-tender/ (npm run v2 -- account new <name>):
 *   v2-deployer                         deploys and pays gas (funded with test QOR)
 *   v2-signer-a, v2-signer-b, v2-signer-c   the 2-of-3 treasury signers; each must have
 *                                       registered its ML-DSA-87 key first
 *                                       (npm run v2 -- account register <name>), because
 *                                       the constructor checks every member's key.
 *
 * 1. Refuses to run before 19 November 2026 00:00 UTC (the Q-Day Drill runs on the
 *    18th), and refuses any drill address as deployer, member, token or factory.
 * 2. Asks the node for both creations' gas, then opens an UNSCOPED window for
 *    exactly those two transactions (a scoped window refuses contract creation):
 *    the TenderBook library, then the vault linked to it.
 * 3. Closes the window and checks that none is left.
 * 4. Writes deployments/qorechain-diana-v2.json. The drill's
 *    deployments/qorechain-diana.json is never touched.
 */
import { existsSync, writeFileSync } from "node:fs";
import { fetchEvmLimits, fetchEvmWindow } from "@qorechain/sdk";
import { encodeDeployData, getContractAddress, type Address } from "viem";
import { FUSD, MAX_FEE_PER_GAS, balances, broadcast, estimate, network, publicClient, qor, sendEvm } from "pqkit";
import { openEvmWindowMsg } from "@qorechain/sdk";
import { evmWindowCost } from "@qorechain/evm";
import { loadV2Account, refuseDrill } from "./accounts.ts";
import { closeWindowFor } from "./window.ts";
import { DEPLOYMENT_FILE, LOCAL_RPC, artifact, link, type Deployment } from "./vault.ts";

const NOT_BEFORE = Date.parse("2026-11-19T00:00:00Z");

const argv = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

async function main(): Promise<void> {
  // Local mode (PEAL_TENDER_LOCAL_RPC, a localhost node for npm run e2e:local) has no
  // date guard, no window and may name its own payment token; the testnet has none of that.
  // The owner may waive the date on drill day (--drill-day-ok, 18 November 2026): v2's
  // accounts, contracts and tokens are separate from the drill's, and refuseDrill below
  // still refuses every drill address whatever the date.
  if (!LOCAL_RPC && Date.now() < NOT_BEFORE && !argv.includes("--drill-day-ok")) {
    throw new Error("no testnet deploys before 19 November 2026 00:00 UTC (Q-Day Drill day) unless the owner approves --drill-day-ok");
  }
  if (existsSync(DEPLOYMENT_FILE) && !argv.includes("--force")) throw new Error(`${DEPLOYMENT_FILE} exists; pass --force for a new vault`);

  const buy = opt("buy");
  const factory = opt("factory", "0x0000000000000000000000000000000000000000")!;
  const delay = BigInt(opt("delay", "900")!); // 15 minutes, short enough for a demo
  const cap = BigInt(opt("cap", "1000000")!); // 1 fUSD a day without the timelock
  if (!buy) throw new Error("--buy <PEAL-T address> is required (the token the vault buys back)");
  const pay = (LOCAL_RPC ? opt("pay", FUSD)! : FUSD) as Address;
  for (const [what, a] of [["buy token", buy], ["factory", factory], ["pay token", pay]] as const) refuseDrill(a, what);

  const deployer = await loadV2Account("v2-deployer");
  const signers = await Promise.all(["v2-signer-a", "v2-signer-b", "v2-signer-c"].map((n) => loadV2Account(n)));
  const members = signers.map((s) => s.evm as Address).sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1));
  const client = publicClient();
  const net = network();

  const book = artifact("TenderBook.sol", "TenderBook");
  const vault = artifact("PealTenderV2.sol", "PealTenderV2");
  const vaultData = (library: Address) =>
    encodeDeployData({ abi: vault.abi, bytecode: link(vault, "TenderBook", library), args: [pay, buy, members, 2n, delay, factory, cap] });

  // 1. Ask the node what both creations cost (25% headroom), before the window: opening a
  //    window advances the account's nonce, so the library's address is only known after
  //    it. The library address does not change the vault's gas, so a stand-in is used here.
  //    The vault's constructor reads every member's key from pqcKeyStatus, so this also
  //    fails early if a signer has not registered.
  const gasBook = await estimate(deployer, { data: book.bytecode.object });
  //    The public testnet RPC simulates with at most 5,000,000 gas (eth_call and
  //    eth_estimateGas clamp any higher limit; docs/spikes.md T6), below what the
  //    23 KB vault's creation needs, although the chain itself accepts up to 30M per
  //    EVM transaction. `--vault-gas` then gives the limit, measured on anvil by
  //    `npm run e2e:local` (which prints the vault's gas) plus headroom, and it is
  //    checked against the chain's own cap.
  const vaultGasOpt = opt("vault-gas");
  let gasVault: bigint;
  if (vaultGasOpt) {
    gasVault = BigInt(vaultGasOpt);
    const cap = LOCAL_RPC ? 30_000_000n : (await fetchEvmLimits({ rest: net.rest })).txMaxGas;
    if (gasVault > cap) throw new Error(`--vault-gas ${gasVault} is above the chain's EVM cap of ${cap}`);
  } else {
    try {
      gasVault = await estimate(deployer, { data: vaultData("0x1111111111111111111111111111111111111111") });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (/code storage out of gas|out of gas/i.test(why)) {
        throw new Error("the RPC could not simulate the vault's creation (it caps simulations at 5M gas); pass --vault-gas <limit> (npm run e2e:local prints the gas the vault used; add 25%)");
      }
      throw e;
    }
  }
  const maxValue =
    evmWindowCost({ gas: gasBook, maxFeePerGas: MAX_FEE_PER_GAS, value: 0n }) +
    evmWindowCost({ gas: gasVault, maxFeePerGas: MAX_FEE_PER_GAS, value: 0n });
  const nativeFees = 3n * 150_000n; // open window, close window, slack (uqor)
  console.log(`estimated gas: TenderBook ${gasBook}, vault ${gasVault}; window cap ${qor(maxValue)}`);
  if (!LOCAL_RPC) {
    const have = (await balances(deployer.cosmos)).uqor ?? 0n;
    if (have < maxValue + nativeFees) {
      throw new Error(`v2-deployer ${deployer.cosmos} holds ${qor(have)}; it needs ${qor(maxValue + nativeFees)}`);
    }
  }

  // 2. Window: exactly these two creations, unscoped (a scoped window refuses creation).
  if (!LOCAL_RPC) {
    const open = await broadcast(deployer, [openEvmWindowMsg({ sender: deployer.cosmos, blocks: 300, maxTxs: 2, maxValue })]);
    console.log(`opened an unscoped two-transaction window: tx ${open.transactionHash}`);
  }
  try {
    const nonce = BigInt(await client.getTransactionCount({ address: deployer.evm as Address, blockTag: "pending" }));
    const bookAddress = getContractAddress({ from: deployer.evm as Address, nonce });
    const vaultAddress = getContractAddress({ from: deployer.evm as Address, nonce: nonce + 1n });

    // 3. The library, then the vault linked to it.
    const r1 = await sendEvm(deployer, { data: book.bytecode.object, gas: gasBook });
    if (r1.contractAddress?.toLowerCase() !== bookAddress.toLowerCase()) throw new Error("unexpected TenderBook address");
    console.log(`TenderBook   ${bookAddress} (tx ${r1.transactionHash}, gas ${r1.gasUsed})`);

    const data = vaultData(bookAddress);
    const r2 = await sendEvm(deployer, { data, gas: gasVault });
    if (r2.contractAddress?.toLowerCase() !== vaultAddress.toLowerCase()) throw new Error("unexpected vault address");
    console.log(`PealTenderV2 ${vaultAddress} (tx ${r2.transactionHash}, gas ${r2.gasUsed})`);

    const out: Deployment = {
      network: LOCAL_RPC ? "local" : "qorechain-diana",
      evmChainId: net.evmChainId,
      deployedAt: new Date().toISOString(),
      deployer: deployer.evm as Address,
      contracts: {
        PealTenderV2: { address: vaultAddress, tx: r2.transactionHash, block: Number(r2.blockNumber) },
        TenderBook: { address: bookAddress, tx: r1.transactionHash, block: Number(r1.blockNumber) },
      },
      payToken: pay,
      buyToken: buy as Address,
      auctionFactory: factory as Address,
      members,
      threshold: 2,
      delay: Number(delay),
      payDailyCap: cap.toString(),
    };
    writeFileSync(DEPLOYMENT_FILE, JSON.stringify(out, null, 2) + "\n");
    console.log(`wrote ${DEPLOYMENT_FILE}`);
  } finally {
    // 4. Close the window whatever happened.
    if (!LOCAL_RPC) {
      await closeWindowFor(deployer);
      const w = await fetchEvmWindow({ rest: net.rest, address: deployer.cosmos });
      if (w.found && w.live) throw new Error("a window is still live after closing");
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
