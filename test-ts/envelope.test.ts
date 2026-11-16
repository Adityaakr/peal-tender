/**
 * Proposer signatures (QoreSign) and sealed proposals (QoreSeal), offline: the
 * chain's pqcKeyStatus is a stub that answers with the account's real ML-DSA-87
 * key, as the precompile does. Plus the vendored custody kit against its own vectors.
 *
 *   npm run test:ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deriveSealKeys } from "@qorechain/qoreseal";
import { deriveUnifiedAccount, type UnifiedAccount } from "@qorechain/sdk";
import { bytesToHex, decodeFunctionData, encodeFunctionResult, type Address, type Hex, type PublicClient } from "viem";
import { checkProposer, isSealed, openSealedProposal, proposalBody, sealProposal, signProposal, vaultQor } from "../scripts/v2/envelope.ts";
import { PROPOSAL_FORMAT, type Proposal } from "../scripts/v2/proposal.ts";
import { validateAddress } from "../vendor/qorechain-custody-kit/address.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN = "qorechain-diana";
// Throwaway test mnemonics (BIP-39 test vectors), never used on any network.
const M_A = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const M_B = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const M_C = "letter advice cage absurd amount doctor acoustic avoid letter advice cage above";

const ABI = [
  {
    type: "function",
    name: "pqcKeyStatus",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "registered", type: "bool" },
      { name: "algorithmId", type: "uint8" },
      { name: "pubkey", type: "bytes" },
      { name: "possessionProven", type: "bool" },
    ],
  },
] as const;

/** A client whose pqcKeyStatus answers from `keys` (by lower-case 0x address). */
function chainWith(keys: Map<string, Uint8Array>): PublicClient {
  return {
    call: async ({ data }: { data: Hex }) => {
      const { args } = decodeFunctionData({ abi: ABI, data });
      const k = keys.get((args[0] as string).toLowerCase());
      return { data: encodeFunctionResult({ abi: ABI, functionName: "pqcKeyStatus", result: [Boolean(k), k ? 1 : 0, k ? bytesToHex(k) : "0x", Boolean(k)] }) };
    },
  } as unknown as PublicClient;
}

const VAULT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const NOW = new Date("2026-11-20T12:00:00Z");
const DEADLINE = String(NOW.getTime() / 1000 + 1800);

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    format: PROPOSAL_FORMAT,
    chainId: "9800",
    vault: VAULT,
    fn: "sweep",
    summary: "sweep 250000 of fUSD to 0x000000000000000000000000000000000000bEEF now",
    args: "0x1234",
    argsHash: `0x${"ab".repeat(32)}`,
    nonce: "3",
    deadline: DEADLINE,
    createdAt: NOW.toISOString(),
    shares: [],
    ...over,
  };
}

let A: UnifiedAccount;
let B: UnifiedAccount;
let C: UnifiedAccount;
let chain: PublicClient;

before(async () => {
  [A, B, C] = await Promise.all([deriveUnifiedAccount(M_A, 0), deriveUnifiedAccount(M_B, 0), deriveUnifiedAccount(M_C, 0)]);
  chain = chainWith(new Map([A, B, C].map((x) => [x.evm.toLowerCase(), x.pqc.publicKey])));
});

describe("proposer signature (QoreSign)", () => {
  it("verifies against the proposer's key on chain and names the proposer", async () => {
    const p = signProposal(proposal(), A, CHAIN, NOW);
    const r = await checkProposer(p, chain, CHAIN, NOW);
    assert.equal(r.status, "verified");
    if (r.status === "verified") {
      assert.equal(r.from, A.cosmos);
      assert.equal(r.evm.toLowerCase(), A.evm.toLowerCase());
    }
    assert.equal(p.proposer?.fields.to, vaultQor(VAULT));
  });
  it("an unsigned proposal is reported as unsigned, not as valid", async () => {
    assert.deepEqual(await checkProposer(proposal(), chain, CHAIN, NOW), { status: "unsigned" });
  });
  it("refuses any field changed after signing", async () => {
    const p = signProposal(proposal(), A, CHAIN, NOW);
    for (const change of [{ summary: "harmless" }, { args: "0x1235" as Hex }, { argsHash: `0x${"cd".repeat(32)}` as Hex }, { nonce: "4" }, { fn: "deposit" }]) {
      await assert.rejects(checkProposer({ ...p, ...change }, chain, CHAIN, NOW), /different content|instruction refused/);
    }
  });
  it("adding shares does not invalidate it", async () => {
    const p = signProposal(proposal(), A, CHAIN, NOW);
    p.shares.push({ signer: B.evm as Address, signature: "0x01" });
    assert.equal((await checkProposer(p, chain, CHAIN, NOW)).status, "verified");
  });
  it("refuses another vault, another chain, an expired proof, and a key the chain does not hold", async () => {
    const p = signProposal(proposal(), A, CHAIN, NOW);
    await assert.rejects(checkProposer({ ...p, vault: "0x000000000000000000000000000000000000dEaD" }, chain, CHAIN, NOW), /addressed to/);
    await assert.rejects(checkProposer(p, chain, "qorechain-vladi", NOW), /for chain/);
    await assert.rejects(checkProposer(p, chain, CHAIN, new Date(Number(DEADLINE) * 1000 + 1000)), /expired/);
    const wrongKey = chainWith(new Map([[A.evm.toLowerCase(), B.pqc.publicKey]]));
    await assert.rejects(checkProposer(p, wrongKey, CHAIN, NOW), /bad signature/);
    await assert.rejects(checkProposer(p, chainWith(new Map()), CHAIN, NOW), /sender key/);
  });
  it("proposalBody ignores shares and the proof, and nothing else", () => {
    const a = proposal();
    assert.equal(proposalBody(a), proposalBody({ ...a, shares: [{ signer: A.evm as Address, signature: "0x01" }] }));
    assert.notEqual(proposalBody(a), proposalBody({ ...a, deadline: String(Number(a.deadline) + 1) }));
  });
});

describe("sealed proposals (QoreSeal, ML-KEM-1024)", () => {
  const keysOf = (m: string) => deriveSealKeys({ mnemonic: m, index: 0 });
  it("each co-signer opens its own envelope and gets the signed proposal, sender verified", async () => {
    const p = signProposal(proposal(), A, CHAIN, NOW);
    const sealed = sealProposal(p, A, CHAIN, [B, C].map((x, i) => ({ qor: x.cosmos, mlkemPublicKey: keysOf([M_B, M_C][i]!).mlkemPublicKey })), NOW);
    assert.ok(isSealed(JSON.parse(JSON.stringify(sealed))));
    const text = JSON.stringify(sealed);
    assert.ok(!text.includes("sweep") && !text.includes("bEEF"), "the content is not readable");
    for (const [acc, m] of [[B, M_B], [C, M_C]] as const) {
      const o = await openSealedProposal(sealed, acc.cosmos, keysOf(m), chain, NOW);
      assert.equal(o.from, A.cosmos);
      assert.equal(o.proposal.summary, p.summary);
      assert.equal((await checkProposer(o.proposal, chain, CHAIN, NOW)).status, "verified");
    }
  });
  it("refuses a reader without an envelope, a re-addressed envelope, and a forged sender", async () => {
    const p = signProposal(proposal(), A, CHAIN, NOW);
    const sealed = sealProposal(p, A, CHAIN, [{ qor: B.cosmos, mlkemPublicKey: keysOf(M_B).mlkemPublicKey }], NOW);
    await assert.rejects(openSealedProposal(sealed, C.cosmos, keysOf(M_C), chain, NOW), /no envelope/);
    const readdressed = { ...sealed, envelopes: [{ ...sealed.envelopes[0]!, to: C.cosmos }] };
    await assert.rejects(openSealedProposal(readdressed, C.cosmos, keysOf(M_C), chain, NOW));
    await assert.rejects(openSealedProposal({ ...sealed, from: C.cosmos }, B.cosmos, keysOf(M_B), chain, NOW), /file says/);
  });
});

describe("custody kit validateAddress (vendored v0.1.1) against its own vectors", () => {
  type Opts = { allow?: ("account" | "validator")[]; requireEip55?: boolean };
  const v = JSON.parse(readFileSync(join(root, "vendor", "qorechain-custody-kit", "address-vectors.json"), "utf8")) as {
    addresses: { valid: (Opts & { input: string; expected: Record<string, string> })[]; invalid: (Opts & { input: string; error: string })[] };
  };
  const opts = (t: Opts): Opts => ({ ...(t.allow ? { allow: t.allow } : {}), ...(t.requireEip55 ? { requireEip55: true } : {}) });
  it("accepts every valid vector with the expected canonical forms", () => {
    for (const t of v.addresses.valid) {
      const r = validateAddress(t.input, opts(t));
      assert.equal(r.valid, true, t.input);
      if (r.valid) for (const [k, want] of Object.entries(t.expected)) assert.equal((r as unknown as Record<string, string>)[k], want, `${t.input} ${k}`);
    }
  });
  it("refuses every invalid vector with the expected code", () => {
    for (const t of v.addresses.invalid) {
      const r = validateAddress(t.input, opts(t));
      assert.equal(r.valid, false, JSON.stringify(t.input));
      if (!r.valid) assert.equal(r.error, t.error, JSON.stringify(t.input));
    }
  });
});
