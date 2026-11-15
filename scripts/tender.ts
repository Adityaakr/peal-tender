/**
 * tender.ts - operate the deployed vault with post-quantum signatures.
 *
 *   npm run tender -- status
 *   npm run tender -- sweep <native|fusd|tpeal|0xToken> <to> <amount in base units>
 *   npm run tender -- open <budget> <floorPrice> <tickSize> <numTicks> <durationSeconds> <maxOffers> <minQuantity>
 *   npm run tender -- settle | cancel
 *   npm run tender -- rotate <nextSignerAddress>
 *   npm run tender -- deposit <from> <amount>
 *
 * Each action: read the vault's signer and nonce, sign the PqAuth message with
 * the signer's ML-DSA-87 key (derived from its mnemonic; the classical key
 * cannot do this), open an EVM window SCOPED TO THE VAULT for exactly one
 * transaction, send it, and close the window again. The sender (the "relayer",
 * env RELAYER, default the drill account) only pays gas; it has no authority.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  FUSD,
  closeWindow,
  estimate,
  loadAccount,
  openWindow,
  publicClient,
  sendEvm,
  signAuth,
} from "qore-pq-kit";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deployment = JSON.parse(readFileSync(join(root, "deployments", "qorechain-diana.json"), "utf8"));
const VAULT = deployment.contracts.PealTender.address as Address;
const TPEAL = deployment.contracts.PealTestToken.address as Address;
const abi = JSON.parse(readFileSync(join(root, "out", "PealTender.sol", "PealTender.json"), "utf8")).abi as Abi;

const client = publicClient();
const read = <T>(functionName: string, args: unknown[] = []) =>
  client.readContract({ address: VAULT, abi, functionName, args }) as Promise<T>;

function tokenArg(t: string): Address {
  if (t === "native") return "0x0000000000000000000000000000000000000000";
  if (t === "fusd") return FUSD;
  if (t === "tpeal") return TPEAL;
  return t as Address;
}

const OPEN_PARAMS = [
  {
    type: "tuple",
    components: [
      { name: "budget", type: "uint256" },
      { name: "floorPrice", type: "uint256" },
      { name: "tickSize", type: "uint256" },
      { name: "numTicks", type: "uint16" },
      { name: "endTime", type: "uint64" },
      { name: "maxOffers", type: "uint32" },
      { name: "minQuantity", type: "uint256" },
    ],
  },
] as const;

/** Sign `action` over `argsHash`, then send `functionName(...args, deadline, sig)` in a one-transaction scoped window. */
async function act(actionName: string, argsHash: Hex, functionName: string, args: unknown[]): Promise<Hex> {
  const signerAddr = await read<Address>("signer");
  const nonce = await read<bigint>("nonce");
  const action = await read<Hex>(actionName);
  const relayerName = process.env.RELAYER?.trim() || "drill";
  const signerAcc = await loadAccount(process.env.SIGNER?.trim() || "drill");
  if (signerAcc.evm.toLowerCase() !== signerAddr.toLowerCase()) {
    throw new Error(`the vault's signer is ${signerAddr}, not ${signerAcc.evm}`);
  }
  const relayer = await loadAccount(relayerName);
  const block = await client.getBlock();
  const deadline = block.timestamp + 900n;
  const sig = signAuth(signerAcc.pqc, {
    chainId: 9800n,
    verifier: VAULT,
    signer: signerAddr,
    action,
    nonce,
    deadline,
    argsHash,
  });

  // Cross-check the message with the contract's own view before spending anything.
  const onChain = await read<Hex>("authMessage", [action, argsHash, deadline]);
  const { authMessage } = await import("qore-pq-kit");
  const local = authMessage({ chainId: 9800n, verifier: VAULT, signer: signerAddr, action, nonce, deadline, argsHash });
  if (onChain.toLowerCase() !== local.toLowerCase()) throw new Error("local and on-chain PqAuth messages differ");

  const data = encodeFunctionData({ abi, functionName, args: [...args, deadline, sig] });
  const gas = await estimate(relayer, { to: VAULT, data });
  console.log(`signed ${actionName} at nonce ${nonce}; estimated gas ${gas}`);

  await openWindow(relayerName, { blocks: 120, maxTxs: 1, gasPerTx: gas, maxFeePerGas: 200_000_000_000n, targets: [VAULT] });
  try {
    const r = await sendEvm(relayer, { to: VAULT, data, gas });
    console.log(`${functionName}: tx ${r.transactionHash} in block ${r.blockNumber}, gas used ${r.gasUsed}`);
    return r.transactionHash;
  } finally {
    await closeWindow(relayerName);
  }
}

async function status(): Promise<void> {
  const [signer, nonce, openId, count, reserved, escrowed] = await Promise.all([
    read<Address>("signer"),
    read<bigint>("nonce"),
    read<bigint>("openTenderId"),
    read<bigint>("tenderCount"),
    read<bigint>("reservedPay"),
    read<bigint>("escrowedBuy"),
  ]);
  const native = await client.getBalance({ address: VAULT });
  const freeFusd = await read<bigint>("freeBalance", [FUSD]);
  console.log(`vault:        ${VAULT}`);
  console.log(`signer:       ${signer} (nonce ${nonce})`);
  console.log(`native QOR:   ${native} wei`);
  console.log(`fUSD free:    ${freeFusd} (reserved ${reserved})`);
  console.log(`tPEAL escrow: ${escrowed}`);
  console.log(`tenders:      ${count} (open: ${openId === 0n ? "none" : openId})`);
}

const [cmd = "status", ...a] = process.argv.slice(2);
const commands: Record<string, () => Promise<unknown>> = {
  status,
  sweep: () => {
    const token = tokenArg(a[0]!);
    const to = a[1] as Address;
    const amount = BigInt(a[2]!);
    const h = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [token, to, amount]));
    return act("ACTION_SWEEP", h, "sweep", [token, to, amount]);
  },
  open: async () => {
    const block = await client.getBlock();
    const p = {
      budget: BigInt(a[0]!),
      floorPrice: BigInt(a[1]!),
      tickSize: BigInt(a[2]!),
      numTicks: Number(a[3]!),
      endTime: block.timestamp + BigInt(a[4]!),
      maxOffers: Number(a[5]!),
      minQuantity: BigInt(a[6]!),
    };
    const h = keccak256(encodeAbiParameters(OPEN_PARAMS, [p]));
    return act("ACTION_OPEN", h, "openTender", [p]);
  },
  settle: async () => {
    const id = await read<bigint>("openTenderId");
    return act("ACTION_SETTLE", keccak256(encodeAbiParameters([{ type: "uint256" }], [id])), "settle", []);
  },
  cancel: async () => {
    const id = await read<bigint>("openTenderId");
    return act("ACTION_CANCEL", keccak256(encodeAbiParameters([{ type: "uint256" }], [id])), "cancelTender", []);
  },
  rotate: () => {
    const next = a[0] as Address;
    return act("ACTION_ROTATE", keccak256(encodeAbiParameters([{ type: "address" }], [next])), "rotateSigner", [next]);
  },
  deposit: () => {
    const from = a[0] as Address;
    const amount = BigInt(a[1]!);
    const h = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [from, amount]));
    return act("ACTION_DEPOSIT", h, "deposit", [from, amount]);
  },
};
const run = commands[cmd];
if (!run) {
  console.error(`Unknown command "${cmd}". Commands: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
