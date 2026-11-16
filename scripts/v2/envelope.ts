/**
 * envelope.ts - who wrote a proposal, and who may read it.
 *
 * A proposal file is public data a signer is asked to sign. Two gaps closed here:
 *
 * 1. **Who proposed it (QoreSign).** Anyone can write a proposal file, so a signer
 *    could be talked into signing one "from a co-signer" that no co-signer wrote.
 *    `signProposal` attaches the proposer's hybrid message signature (secp256k1 +
 *    ML-DSA-87, `@qorechain/qoresign` through qore-pq-kit's signed instructions)
 *    over the proposal's content; `checkProposer` verifies it against the
 *    proposer's ML-DSA-87 key READ FROM THE CHAIN (pqcKeyStatus) and returns the
 *    proposer, whom the caller checks against the vault's signer set. A stolen
 *    classical key alone cannot forge it.
 *
 * 2. **Who can read it (QoreSeal).** A buyback's budget and timing are worth
 *    keeping private until the vault acts on them, or holders front-run the
 *    tender. `sealProposal` signs the proposal again for each co-signer and seals
 *    it (`@qorechain/qoreseal`, ML-KEM-1024) to the key that co-signer published
 *    in QoreChain's encryption key registry (`MsgRegisterKEMKey`); only they can
 *    open it. `openSealedProposal` opens one's own envelope and verifies the
 *    sender against the chain before returning the proposal.
 *
 * Only the content is confidential: the sealed file's size, sender and
 * recipients are visible, and the proposal becomes public when it is relayed.
 *
 * Every time check uses the CHAIN's clock (the latest block), so a local node
 * whose time was moved forward checks the same way the testnet does.
 *
 * Browser-safe: the web app's checker uses `checkProposer`.
 */
import { addressFromBytes, classicalKeyFromPrivate } from "@qorechain/qoresign";
import type { SealKeyPair } from "@qorechain/qoreseal";
import {
  InstructionRefused,
  isoSeconds,
  openInstruction,
  qorToEvm,
  randomNonce,
  sealInstruction,
  signInstruction,
  verifyInstructionWithChain,
  type SignedInstruction,
} from "pqkit/messaging";
import { hexToBytes, type Address, type Hex, type PublicClient } from "viem";
import type { Proposal } from "./proposal.ts";

/** The instruction purpose of a proposal, signed into every proof and envelope. */
export const PROPOSAL_PURPOSE = "peal-tender-v2/proposal/1";
export const SEALED_FORMAT = "peal-tender-v2/sealed-proposal/1";

export { InstructionRefused };

/** A proposal that may carry its proposer's signature. */
export type SignedProposal = Proposal & { proposer?: SignedInstruction };

/** What the proposer signs: the proposal's content in a fixed order, without shares or the proof itself. */
export function proposalBody(p: Proposal): string {
  return JSON.stringify([p.format, p.chainId, p.vault.toLowerCase(), p.fn, p.summary, p.args, p.argsHash, p.nonce, p.deadline, p.createdAt]);
}

/** The `qor1` form of the vault's address: a proposer's proof is addressed to the vault. */
export function vaultQor(vault: Address): string {
  return addressFromBytes(hexToBytes(vault)).bech32;
}

/** The signing half of an account, as `@qorechain/sdk`'s `UnifiedAccount` has it. */
export interface SigningAccount {
  cosmos: string;
  privateKey: string;
  pqc: { secretKey: Uint8Array };
}

function classical(acc: SigningAccount) {
  return classicalKeyFromPrivate(hexToBytes(acc.privateKey as Hex), "eth_secp256k1");
}

/** `deadline` (unix seconds) as the instruction expiry; the proof lives exactly as long as the proposal. */
function expiry(p: Proposal): string {
  return isoSeconds(new Date(Number(p.deadline) * 1000));
}

/** Attach the proposer's hybrid signature over `proposalBody(p)`. `now` is the chain's time. */
export function signProposal(p: Proposal, acc: SigningAccount, cosmosChainId: string, now: Date): SignedProposal {
  const proposer = signInstruction({
    fields: {
      chainId: cosmosChainId,
      from: acc.cosmos,
      to: vaultQor(p.vault),
      purpose: PROPOSAL_PURPOSE,
      nonce: randomNonce(),
      issuedAt: isoSeconds(now),
      expiresAt: expiry(p),
      body: proposalBody(p),
    },
    classicalKey: classical(acc),
    pqKey: acc.pqc,
  });
  return { ...p, proposer };
}

export type ProposerCheck = { status: "unsigned" } | { status: "verified"; from: string; evm: Address };

/**
 * Verify the proposer's signature against its ML-DSA-87 key on chain and that it
 * covers exactly this proposal's content. Throws `InstructionRefused` on any
 * mismatch (forged, altered, expired, for another vault or chain). The caller
 * still checks that `evm` is a member of the vault's signer set.
 */
export async function checkProposer(p: SignedProposal, client: PublicClient, cosmosChainId: string, now: Date): Promise<ProposerCheck> {
  if (!p.proposer) return { status: "unsigned" };
  const fields = await verifyInstructionWithChain(p.proposer, client, {
    chainId: cosmosChainId,
    to: vaultQor(p.vault),
    purpose: PROPOSAL_PURPOSE,
    now,
  });
  if (fields.body !== proposalBody(p)) throw new InstructionRefused("the proposer signed different content than this file holds");
  return { status: "verified", from: fields.from, evm: qorToEvm(fields.from) };
}

export interface SealedProposal {
  format: typeof SEALED_FORMAT;
  /** Cosmos chain id the envelopes are bound to. */
  chainId: string;
  vault: Address;
  /** The sender's `qor1` account (also inside each envelope, signed). */
  from: string;
  /** One ML-KEM-1024 envelope per recipient, base64. */
  envelopes: { to: string; envelope: string }[];
}

export interface KemRecipient {
  /** The co-signer's `qor1` account. */
  qor: string;
  /** Its ML-KEM-1024 key from the encryption key registry (1568 bytes). */
  mlkemPublicKey: Uint8Array;
}

function b64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Seal `p` (with its proposer proof and any shares) to each recipient's
 * registered ML-KEM-1024 key. Each envelope holds an instruction signed by the
 * sender and addressed to that recipient, so it can be neither re-addressed nor
 * altered. `ML-KEM-only` mode: the registry key alone, no card needed.
 */
export function sealProposal(p: SignedProposal, acc: SigningAccount, cosmosChainId: string, recipients: KemRecipient[], now: Date): SealedProposal {
  if (recipients.length === 0) throw new Error("no recipients to seal to");
  const envelopes = recipients.map((r) => {
    const s = signInstruction({
      fields: {
        chainId: cosmosChainId,
        from: acc.cosmos,
        to: r.qor,
        purpose: PROPOSAL_PURPOSE,
        nonce: randomNonce(),
        issuedAt: isoSeconds(now),
        expiresAt: expiry(p),
        body: JSON.stringify(p),
      },
      classicalKey: classical(acc),
      pqKey: acc.pqc,
    });
    return { to: r.qor, envelope: b64(sealInstruction(s, { mlkemPublicKey: r.mlkemPublicKey }, "mlkem")) };
  });
  return { format: SEALED_FORMAT, chainId: cosmosChainId, vault: p.vault, from: acc.cosmos, envelopes };
}

export function isSealed(x: unknown): x is SealedProposal {
  return typeof x === "object" && x !== null && (x as { format?: unknown }).format === SEALED_FORMAT;
}

/**
 * Open `me`'s envelope with its seal keys, verify the sender against its key on
 * chain, and return the proposal inside. The caller then runs the usual
 * sign-action checks (argument hash, vault's own message) on it.
 */
export async function openSealedProposal(
  s: SealedProposal,
  me: string,
  keys: SealKeyPair,
  client: PublicClient,
  now: Date,
): Promise<{ proposal: SignedProposal; from: string; evm: Address }> {
  const mine = s.envelopes.find((e) => e.to.toLowerCase() === me.toLowerCase());
  if (!mine) throw new InstructionRefused(`this sealed proposal has no envelope for ${me}`);
  const signed = openInstruction({ envelope: unb64(mine.envelope), keys, chainId: s.chainId, to: me, purpose: PROPOSAL_PURPOSE });
  const fields = await verifyInstructionWithChain(signed, client, { chainId: s.chainId, to: me, purpose: PROPOSAL_PURPOSE, now });
  if (fields.from.toLowerCase() !== s.from.toLowerCase()) throw new InstructionRefused(`envelope signed by ${fields.from}, file says ${s.from}`);
  const proposal = JSON.parse(fields.body) as SignedProposal;
  if (proposal.vault.toLowerCase() !== s.vault.toLowerCase()) throw new InstructionRefused("the sealed proposal is for another vault");
  return { proposal, from: fields.from, evm: qorToEvm(fields.from) };
}
