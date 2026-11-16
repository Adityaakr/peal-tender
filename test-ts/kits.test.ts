/**
 * Unit tests for the QoreChain kit integrations (docs/kits.md): offline, no network.
 *
 *   npm run test:ts
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { judge, loadEvidence, type EvidenceEntry, type PqView, type TxView } from "../scripts/kits/evidence.ts";
import { compare, presetOf, satisfies, templateFacts, tenderFacts, tomlSections } from "../scripts/kits/template-check.ts";
import { checkCbom, CBOM_PATH, signerAccounts, type Cbom } from "../scripts/kits/cbom.ts";
import { explainEvmRefusal } from "../apps/dashboard/src/wallet/refusal.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- evidence (MCP)

const tx = (over: Partial<TxView> = {}): TxView => ({
  success: true,
  messages: [{ type_url: "/qorechain.pqc.v1.MsgOpenEVMWindow" }],
  security: { tier: "pqc", pqc_layer_count: 1 },
  signers: [{ address: "qor1example" }],
  ...over,
});
const pq = (verified: boolean | null, one = true): PqView => ({
  transaction_status: {
    tier: "pqc",
    has_exactly_one_pqc_layer: one,
    signer: "qor1example",
    verification: { checked: verified !== null, verified, reason: verified ? null : "invalid" },
  },
});
const entry = (over: Partial<EvidenceEntry> = {}): EvidenceEntry => ({ hash: "AB".repeat(32), expect: "pqc", what: "test", ...over });

describe("evidence: judge", () => {
  it("accepts a hybrid transaction whose ML-DSA-87 layer the chain verified", () => {
    const v = judge(entry({ message: "/qorechain.pqc.v1.MsgOpenEVMWindow" }), tx(), pq(true));
    assert.equal(v.ok, true, v.problems.join("; "));
  });
  it("refuses a hybrid transaction whose layer did not verify, or has two layers", () => {
    assert.equal(judge(entry(), tx(), pq(false)).ok, false);
    assert.equal(judge(entry(), tx(), pq(true, false)).ok, false);
    assert.equal(judge(entry(), tx(), undefined).ok, false);
  });
  it("refuses the wrong message, a failed transaction and the wrong tier", () => {
    assert.equal(judge(entry({ message: "/qorechain.amm.v1.MsgSwapExactIn" }), tx(), pq(true)).ok, false);
    assert.equal(judge(entry(), tx({ success: false }), pq(true)).ok, false);
    assert.equal(judge(entry(), tx({ security: { tier: "shake", pqc_layer_count: 0 } }), pq(true)).ok, false);
  });
  it("checks a key registration and an EVM transaction by their tiers", () => {
    assert.equal(judge(entry({ expect: "enrollment" }), tx({ security: { tier: "enrollment", pqc_layer_count: 0 } }), undefined).ok, true);
    assert.equal(judge(entry({ expect: "enrollment" }), tx(), undefined).ok, false);
    const evmTx = tx({ messages: [{ type_url: "/cosmos.evm.vm.v1.MsgEthereumTx" }], security: { tier: "classical", pqc_layer_count: 0 } });
    assert.equal(judge(entry({ expect: "evm" }), evmTx, undefined, "success").ok, true);
    assert.equal(judge(entry({ expect: "evm" }), { ...evmTx, success: false }, undefined, "success").ok, false);
  });
  it("refuses an EVM call that reverted inside a code-0 Cosmos transaction, or with no receipt read", () => {
    const evmTx = tx({ messages: [{ type_url: "/cosmos.evm.vm.v1.MsgEthereumTx" }], security: { tier: "classical", pqc_layer_count: 0 } });
    const reverted = judge(entry({ expect: "evm" }), evmTx, undefined, "reverted");
    assert.equal(reverted.ok, false);
    assert.match(reverted.problems.join(" "), /EVM receipt says reverted/);
    assert.equal(judge(entry({ expect: "evm" }), evmTx, undefined).ok, false);
  });
  it("keeps the MCP's notes when a layer does not verify against the current key", () => {
    const v = judge(entry(), tx(), { ...pq(false), notes: ["the account rotated its key at height 5"] });
    assert.match(v.problems.join(" "), /current key .*rotated its key/);
  });
  it("the committed evidence list is well formed", () => {
    const list = loadEvidence(join(root, "deployments", "evidence.json"));
    assert.ok(list.length >= 10);
    assert.equal(new Set(list.map((e) => e.hash.toLowerCase())).size, list.length, "duplicate hash");
  });
});

// ---------------------------------------------------------------- create-qorechain-dapp

describe("template-check", () => {
  it("parses foundry.toml, multi-line arrays included", () => {
    const t = tomlSections(readFileSync(join(root, "foundry.toml"), "utf8"));
    assert.equal(t["profile.default"]?.["solc_version"], "0.8.28");
    assert.equal(t["profile.default"]?.["optimizer_runs"], "200");
    assert.equal(t["rpc_endpoints"]?.["qorechain_testnet"], "https://evm-testnet.qore.host");
    assert.equal(t["fuzz"]?.["runs"], "512", "a key after the multi-line remappings array");
  });
  it("satisfies caret, tilde and exact ranges", () => {
    assert.equal(satisfies("0.14.0", "^0.14.0"), true);
    assert.equal(satisfies("0.14.3", "^0.14.0"), true);
    assert.equal(satisfies("0.15.0", "^0.14.0"), false);
    assert.equal(satisfies("0.13.9", "^0.14.0"), false);
    assert.equal(satisfies("1.4.0", "^1.2.0"), true);
    assert.equal(satisfies("0.2.4", "~0.2.3"), true);
    assert.equal(satisfies("0.14.0", "0.14.0"), true);
  });
  it("Tender agrees with the pinned foundry template and the SDK preset", () => {
    const require = createRequire(import.meta.url);
    const tpl = join(dirname(require.resolve("create-qorechain-dapp/package.json")), "templates", "foundry");
    const checks = compare(tenderFacts(root), templateFacts(tpl), presetOf());
    const bad = checks.filter((c) => !c.ok);
    assert.deepEqual(bad, [], bad.map((c) => `${c.what}: ${c.expected} vs ${c.actual}`).join("\n"));
    assert.ok(checks.length >= 15);
  });
  it("fails when the hosted app's REST or RPC rewrite is removed", () => {
    const dir = mkdtempSync(join(tmpdir(), "tender-tpl-"));
    try {
      for (const f of ["package.json", "foundry.toml", "kit/scripts/qore.ts", "apps/dashboard/src/config.ts", "apps/dashboard/src/data.ts", "apps/dashboard/vite.config.ts"]) {
        cpSync(join(root, f), join(dir, f), { recursive: true });
      }
      const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as { rewrites: { source: string }[] };
      writeFileSync(join(dir, "vercel.json"), JSON.stringify({ ...vercel, rewrites: vercel.rewrites.filter((r) => !r.source.startsWith("/api/qore/rest")) }));
      assert.throws(() => tenderFacts(dir), /no \/api\/qore\/rest rewrite/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("catches drift", () => {
    const require = createRequire(import.meta.url);
    const tpl = templateFacts(join(dirname(require.resolve("create-qorechain-dapp/package.json")), "templates", "foundry"));
    const t = tenderFacts(root);
    const drifted = { ...t, appEvmRpc: "https://evm.qore.host", foundry: { ...t.foundry, "profile.default": { ...t.foundry["profile.default"], optimizer_runs: "1" } } };
    const bad = compare(drifted, tpl, presetOf()).filter((c) => !c.ok).map((c) => c.what);
    assert.ok(bad.includes("web app EVM RPC"));
    assert.ok(bad.includes("foundry.toml optimizer_runs"));
  });
});

// ---------------------------------------------------------------- QoreScan CBOM

describe("cbom", () => {
  const committed = JSON.parse(readFileSync(join(root, CBOM_PATH), "utf8")) as Cbom;
  it("the committed CBOM backs the threat model's claims", () => {
    const checks = checkCbom(committed, { full: true, signers: signerAccounts(root) });
    const bad = checks.filter((c) => !c.ok);
    assert.deepEqual(bad, [], bad.map((c) => `${c.what}: ${c.detail}`).join("\n"));
  });
  it("fails if a contract used ecrecover", () => {
    const withEcrecover: Cbom = structuredClone(committed);
    withEcrecover.components.push({
      name: "ECDSA secp256k1",
      evidence: { occurrences: [{ location: "PealTenderV2.sol", line: 1, symbol: "ecrecover", additionalContext: "ecrecover precompile (0x01)" }] },
    });
    const c = checkCbom(withEcrecover, { full: false }).find((x) => x.what === "no contract calls ecrecover");
    assert.equal(c?.ok, false);
    assert.match(c?.detail ?? "", /PealTenderV2\.sol:1/);
  });
  it("fails if the contracts stopped calling pqcVerify", () => {
    const without: Cbom = structuredClone(committed);
    for (const comp of without.components) {
      if (comp.evidence?.occurrences) comp.evidence.occurrences = comp.evidence.occurrences.filter((o) => o.symbol !== "pqcVerify");
    }
    assert.equal(checkCbom(without, { full: false }).find((x) => x.what === "contracts call pqcVerify")?.ok, false);
  });
  it("fails a full check when a signer has no registered key in the scan", () => {
    const c = checkCbom(committed, { full: true, signers: ["qor1notscanned"] });
    assert.equal(c.find((x) => x.what.includes("qor1notscanned"))?.ok, false);
  });
});

// ---------------------------------------------------------------- wallet-adapter in the web app

describe("explainEvmRefusal", () => {
  it("names the case and the remedy for a refused EVM transaction", async () => {
    const e = await explainEvmRefusal(new Error("execution reverted: no open EVM authorisation window for 0xabc"), "Offer");
    assert.match(e.message, /^Offer was refused by QoreChain \(no-window\): Open an EVM authorisation window/);
    const k = await explainEvmRefusal({ shortMessage: "x", cause: { details: "no registered post-quantum key" } }, "Claim");
    assert.match(k.message, /\(no-pqc-key\)/);
  });
  it("passes any other error through unchanged", async () => {
    const orig = new Error("insufficient funds");
    assert.equal(await explainEvmRefusal(orig, "Offer"), orig);
  });
});
