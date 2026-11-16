/**
 * vault.ts - the deployed v2 vault, its deployment record, and proposals.
 *
 * A proposal is one quorum action written to a JSON file outside the
 * repository (~/.qore-peal-tender/proposals/). Each signer adds an ML-DSA-87
 * share to it with `sign-action`; a relayer sends it once `threshold` shares are
 * in. The file holds signatures over public data only: no secret ever enters it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Abi,
  type AbiFunction,
  type AbiParameter,
  type Address,
  type Hex,
} from "viem";
import { publicClient } from "pqkit";
import { vaultAbi } from "./abi.ts";
import { SECRETS_DIR } from "./accounts.ts";
import { argsHash, OP_KINDS, type OpenParams, type SaleConfig } from "./encode.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Local mode, for `npm run e2e:local`: PEAL_TENDER_LOCAL_RPC names a local node
 * (anvil with mock precompiles). Every EVM call then goes there, no window is
 * opened (anvil has none), and the deploy date guard does not apply. Only a
 * localhost URL is accepted, so local mode can never point at the testnet.
 */
export const LOCAL_RPC = process.env.PEAL_TENDER_LOCAL_RPC?.trim() || undefined;
if (LOCAL_RPC) {
  const host = new URL(LOCAL_RPC).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`PEAL_TENDER_LOCAL_RPC must be localhost, not ${host}`);
  process.env.QORE_EVM_RPC_URL = LOCAL_RPC; // read by the kit's network()
}

export const DEPLOYMENT_FILE =
  process.env.PEAL_TENDER_V2_DEPLOYMENT?.trim() || join(ROOT, "deployments", "qorechain-diana-v2.json");
export const CHAIN_ID = 9800n;

export interface Deployment {
  network: string;
  evmChainId: number;
  deployedAt: string;
  deployer: Address;
  contracts: {
    PealTenderV2: { address: Address; tx: Hex; block: number };
    TenderBook: { address: Address; tx: Hex; block: number };
  };
  payToken: Address;
  buyToken: Address;
  auctionFactory: Address;
  members: Address[];
  threshold: number;
  delay: number;
  payDailyCap: string;
}

export function loadDeployment(): Deployment {
  const override = process.env.PEAL_TENDER_V2_VAULT?.trim();
  if (!existsSync(DEPLOYMENT_FILE)) {
    if (!override) throw new Error(`no ${DEPLOYMENT_FILE}; deploy first (npm run deploy:v2) or set PEAL_TENDER_V2_VAULT`);
  }
  const d = existsSync(DEPLOYMENT_FILE)
    ? (JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8")) as Deployment)
    : ({ contracts: { PealTenderV2: { address: override } } } as unknown as Deployment);
  if (override) d.contracts.PealTenderV2.address = override as Address;
  return d;
}

export const client = () => publicClient();

export function reader(vault: Address) {
  return <T>(functionName: string, args: readonly unknown[] = []) =>
    client().readContract({ address: vault, abi: vaultAbi, functionName, args } as never) as Promise<T>;
}

/** The ABI inputs of `fn` without its trailing `Auth` argument. */
export function callInputs(fn: string): readonly AbiParameter[] {
  const f = vaultAbi.find((x) => x.type === "function" && x.name === fn) as AbiFunction | undefined;
  if (!f) throw new Error(`no function ${fn} in the vault ABI`);
  const last = f.inputs[f.inputs.length - 1];
  if (!last || last.name !== "auth") throw new Error(`${fn} is not a quorum action`);
  return f.inputs.slice(0, -1);
}

export interface Proposal {
  format: "peal-tender-v2/proposal/1";
  chainId: string;
  vault: Address;
  fn: string; // the vault function, also the action name in encode.ts
  summary: string;
  args: Hex; // abi.encode of the arguments before `auth`
  argsHash: Hex;
  nonce: string;
  deadline: string;
  createdAt: string;
  shares: { signer: Address; signature: Hex }[];
}

export function encodeArgs(fn: string, args: readonly unknown[]): Hex {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return encodeAbiParameters(callInputs(fn) as any, args as any);
}

export function decodeArgs(p: Proposal): readonly unknown[] {
  return decodeAbiParameters(callInputs(p.fn), p.args);
}

/**
 * Recompute the argument hash from the decoded arguments, independently of what
 * the proposal file claims, so a signer never signs a hash that does not match
 * what will be sent. `ctx` is the vault state some hashes bind: its current
 * auction factory and its open tender.
 */
export function argsHashFor(
  fn: string,
  args: readonly unknown[],
  ctx: { factory: Address; openTenderId: bigint },
): Hex {
  switch (fn) {
    case "deposit":
      return argsHash.deposit(args[0] as Address, args[1] as bigint);
    case "sweep":
      return argsHash.sweep(args[0] as Address, args[1] as Address, args[2] as bigint);
    case "openTender":
      return argsHash.openTender(args[0] as OpenParams);
    case "cancelTender":
      return argsHash.cancelTender(ctx.openTenderId);
    case "queue":
      return argsHash.queue(OP_KINDS[Number(args[0])]!, args[1] as Hex);
    case "startSealedSale":
      return argsHash.startSealedSale(ctx.factory, args[0] as SaleConfig, args[1] as string, args[2] as string);
    case "cancelSealedSale":
      return argsHash.cancelSealedSale(args[0] as Address);
    default:
      throw new Error(`unknown quorum action ${fn}`);
  }
}

export const PROPOSALS_DIR = join(SECRETS_DIR, "proposals");

export function saveProposal(p: Proposal, path?: string): string {
  const file = path ?? join(PROPOSALS_DIR, `${p.fn}-${p.nonce}-${Date.now()}.json`);
  if (file.startsWith(ROOT)) throw new Error("keep proposals outside the repository");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(p, null, 2) + "\n");
  return file;
}

export function loadProposal(path: string): Proposal {
  const p = JSON.parse(readFileSync(path, "utf8")) as Proposal;
  if (p.format !== "peal-tender-v2/proposal/1") throw new Error(`${path} is not a v2 proposal`);
  return p;
}

// ------------------------------------------------------------------ artifacts and linking

export interface Artifact {
  abi: Abi;
  bytecode: { object: Hex; linkReferences: Record<string, Record<string, { start: number; length: number }[]>> };
}

export function artifact(file: string, name: string): Artifact {
  return JSON.parse(readFileSync(join(ROOT, "out", file, `${name}.json`), "utf8")) as Artifact;
}

/** Put `library` at every placeholder Foundry left for `libName` in the creation code. */
export function link(a: Artifact, libName: string, library: Address): Hex {
  let code = a.bytecode.object.slice(2);
  let linked = 0;
  for (const libs of Object.values(a.bytecode.linkReferences)) {
    for (const [name, refs] of Object.entries(libs)) {
      if (name !== libName) throw new Error(`unexpected library ${name}`);
      for (const r of refs) {
        code = code.slice(0, r.start * 2) + library.slice(2).toLowerCase() + code.slice((r.start + r.length) * 2);
        linked++;
      }
    }
  }
  if (linked === 0) throw new Error(`no ${libName} placeholder found`);
  if (code.includes("__$")) throw new Error("unlinked placeholders remain");
  return `0x${code}`;
}
