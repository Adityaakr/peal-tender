/**
 * proposal.ts - the quorum proposal format, shared by the CLI and the web app.
 *
 * Pure viem, no Node APIs. A proposal is one quorum action written to a JSON file:
 * the CLI (`propose`) or the web app's builder makes it, each signer adds an
 * ML-DSA-87 share with `npm run sign-action`, and a relayer sends it. The file holds
 * public data and signatures only, never a secret.
 */
import {
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
  toBytes,
  type AbiFunction,
  type AbiParameter,
  type Address,
  type Hex,
} from "viem";
import { vaultAbi } from "./abi.ts";
import { ACTIONS, actionIdOf, argsHash, OP_KINDS, type OpenParams, type SaleConfig } from "./encode.ts";

export const PROPOSAL_FORMAT = "peal-tender-v2/proposal/1";

/** The ABI inputs of `fn` without its trailing `Auth` argument. */
export function callInputs(fn: string): readonly AbiParameter[] {
  const f = vaultAbi.find((x) => x.type === "function" && x.name === fn) as AbiFunction | undefined;
  if (!f) throw new Error(`no function ${fn} in the vault ABI`);
  const last = f.inputs[f.inputs.length - 1];
  if (!last || last.name !== "auth") throw new Error(`${fn} is not a quorum action`);
  return f.inputs.slice(0, -1);
}

export interface Proposal {
  format: typeof PROPOSAL_FORMAT;
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


/** The 256 bytes `PqAuth.message` builds (qore-pq-kit v0.3.0), for any action id. */
export function authMessage(f: {
  chainId: bigint;
  verifier: Address;
  signer: Address;
  action: Hex;
  nonce: bigint;
  deadline: bigint;
  argsHash: Hex;
}): Hex {
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [keccak256(toBytes("qore-pq-kit.PqAuth.v1")), f.chainId, f.verifier, f.signer, f.action, f.nonce, f.deadline, f.argsHash],
  );
}

const QUORUM_DOMAIN = keccak256(toBytes("qore-pq-kit.PqAuthSet.quorum.v1"));

/** The exact bytes `member` signs as its share of proposal `p` (what `PqAuthSet` verifies). */
export function shareMessage(p: Proposal, member: Address): Hex {
  const action = keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [QUORUM_DOMAIN, actionIdOf(p.fn as keyof typeof ACTIONS)]),
  );
  return authMessage({
    chainId: BigInt(p.chainId),
    verifier: p.vault,
    signer: member,
    action,
    nonce: BigInt(p.nonce),
    deadline: BigInt(p.deadline),
    argsHash: p.argsHash,
  });
}

/** Parse and shape-check a proposal file's text (it may come from anyone). */
export function parseProposal(text: string): Proposal {
  const p = JSON.parse(text) as Proposal;
  if (p?.format !== PROPOSAL_FORMAT) throw new Error("not a Peal Tender v2 proposal file");
  for (const k of ["chainId", "vault", "fn", "args", "argsHash", "nonce", "deadline"] as const) {
    if (typeof p[k] !== "string") throw new Error(`proposal field ${k} is missing`);
  }
  if (!Array.isArray(p.shares)) throw new Error("proposal field shares is missing");
  callInputs(p.fn); // a known quorum action
  return p;
}
