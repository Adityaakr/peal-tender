/**
 * evidence.ts - re-check every transaction Peal Tender cites as evidence, through
 * the QoreChain MCP server's own tools (`@qorechain/mcp`, run in-process: the same
 * `get_transaction` and `get_pq_status` an AI assistant connected to the server
 * would call). Read-only: nothing is signed or sent.
 *
 *   npm run evidence                         # deployments/evidence.json
 *   npm run evidence -- deployments/x.json   # another list
 *   npm run evidence -- --json               # machine-readable result
 *
 * Each entry says what it should be (`expect`):
 *   enrollment  an ML-DSA-87 key registration, signed classically as the chain requires
 *   pqc         a hybrid secp256k1 + ML-DSA-87 transaction whose ML-DSA-87 layer the
 *               chain verified (`get_pq_status` reports verification.verified = true)
 *   evm         an EVM-lane transaction that succeeded. EVM transactions carry no
 *               ML-DSA-87 layer; Tender's post-quantum check runs inside the vault
 *               (pqcKeyStatus + pqcVerify), so success is what can be read here. A
 *               reverted EVM call can still be a code-0 Cosmos transaction, so the
 *               EVM receipt's own status (eth_getTransactionReceipt) is checked too.
 *
 * `get_pq_status` verifies a transaction's ML-DSA-87 layer against the signer's
 * CURRENT key: after a key rotation an old transaction would read as unverified
 * although the chain accepted it. Its notes are printed with any failure.
 * and optionally which message it carries. Exits 1 if any entry does not match.
 *
 * To check one hash by hand: `npm run qore -- pq status <hash>` (the pinned qore CLI,
 * which runs the same tools).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS, toolContext } from "@qorechain/mcp";
import { createPublicClient, http, type Hex } from "viem";

export type Expectation = "enrollment" | "pqc" | "evm";

export interface EvidenceEntry {
  hash: string;
  expect: Expectation;
  /** Type URL of a message the transaction must carry. */
  message?: string;
  what: string;
}

/** The parts of `get_transaction`'s answer this check reads. */
export interface TxView {
  success: boolean;
  messages: { type_url: string }[];
  security: { tier: string; pqc_layer_count: number };
  signers: { address: string }[];
  height?: string;
}

/** The parts of `get_pq_status`'s answer this check reads (for a transaction). */
export interface PqView {
  notes?: string[];
  transaction_status: {
    tier: string;
    has_exactly_one_pqc_layer: boolean;
    signer: string | null;
    verification: { checked: boolean; verified: boolean | null; reason: string | null };
  } | null;
}

export interface Verdict {
  ok: boolean;
  /** One line a reader can check against the explorer. */
  summary: string;
  problems: string[];
}

/**
 * Judge one transaction against its entry. Pure: the network calls are elsewhere.
 * `evmStatus` is the EVM receipt's status, required for `evm` entries.
 */
export function judge(entry: EvidenceEntry, tx: TxView, pq: PqView | undefined, evmStatus?: "success" | "reverted"): Verdict {
  const problems: string[] = [];
  if (!tx.success) problems.push("the transaction failed on chain");
  const types = tx.messages.map((m) => m.type_url);
  if (entry.message && !types.includes(entry.message)) {
    problems.push(`expected a ${entry.message}, found ${types.join(", ") || "no messages"}`);
  }
  const tier = tx.security.tier;
  switch (entry.expect) {
    case "enrollment":
      if (tier !== "enrollment") problems.push(`expected a key registration (enrollment tier), found ${tier}`);
      break;
    case "pqc": {
      if (tier !== "pqc") problems.push(`expected a hybrid ML-DSA-87 transaction (pqc tier), found ${tier}`);
      const s = pq?.transaction_status;
      if (!s) problems.push("no post-quantum status for this transaction");
      else {
        if (!s.has_exactly_one_pqc_layer) problems.push("not exactly one ML-DSA-87 layer");
        if (!s.verification.checked || s.verification.verified !== true) {
          const notes = pq?.notes?.length ? `; notes: ${pq.notes.join(" ")}` : "";
          problems.push(`ML-DSA-87 layer not verified against the signer's current key (${s.verification.reason ?? "unknown"}${notes})`);
        }
      }
      break;
    }
    case "evm":
      if (tier !== "classical" || !types.includes("/cosmos.evm.vm.v1.MsgEthereumTx")) {
        problems.push(`expected an EVM-lane transaction, found ${tier} ${types.join(", ")}`);
      }
      if (evmStatus !== "success") problems.push(`the EVM receipt says ${evmStatus ?? "nothing (no receipt read)"}`);
      break;
    default:
      problems.push(`unknown expectation ${String(entry.expect)}`);
  }
  const signer = tx.signers[0]?.address ?? "?";
  const pqNote =
    entry.expect === "pqc" && pq?.transaction_status?.verification.verified === true
      ? "ML-DSA-87 verified"
      : entry.expect === "enrollment"
        ? "key registered"
        : entry.expect === "evm"
          ? "EVM, succeeded"
          : tier;
  return { ok: problems.length === 0, summary: `${tier.padEnd(10)} ${pqNote.padEnd(18)} ${signer}`, problems };
}

export function loadEvidence(path: string): EvidenceEntry[] {
  const doc = JSON.parse(readFileSync(path, "utf8")) as { transactions?: EvidenceEntry[] };
  if (!Array.isArray(doc.transactions) || doc.transactions.length === 0) throw new Error(`${path}: no transactions`);
  for (const e of doc.transactions) {
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(e.hash)) throw new Error(`${path}: bad hash ${e.hash}`);
    if (!["enrollment", "pqc", "evm"].includes(e.expect)) throw new Error(`${path}: bad expect ${e.expect} for ${e.hash}`);
  }
  return doc.transactions;
}

function tool(name: string) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`@qorechain/mcp has no tool ${name}`);
  return t;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const file = args.find((a) => !a.startsWith("--")) ?? join(root, "deployments", "evidence.json");
  const entries = loadEvidence(file);
  const ctx = toolContext({ defaultNetwork: "testnet" });
  const evm = createPublicClient({ transport: http(process.env.QORE_EVM_RPC_URL?.trim() || "https://evm-testnet.qore.host") });
  const results: { entry: EvidenceEntry; verdict: Verdict }[] = [];
  for (const entry of entries) {
    let verdict: Verdict;
    try {
      const tx = (await tool("get_transaction").handler({ hash: entry.hash }, ctx)) as TxView;
      const pq = entry.expect === "pqc" ? ((await tool("get_pq_status").handler({ target: entry.hash }, ctx)) as PqView) : undefined;
      const evmStatus = entry.expect === "evm" ? (await evm.getTransactionReceipt({ hash: entry.hash as Hex })).status : undefined;
      verdict = judge(entry, tx, pq, evmStatus);
    } catch (e) {
      verdict = { ok: false, summary: "unreadable", problems: [e instanceof Error ? e.message : String(e)] };
    }
    results.push({ entry, verdict });
    if (!asJson) {
      const short = entry.hash.length > 20 ? `${entry.hash.slice(0, 10)}…${entry.hash.slice(-6)}` : entry.hash;
      console.log(`${verdict.ok ? "ok  " : "FAIL"} ${short.padEnd(18)} ${verdict.summary}  ${entry.what}`);
      for (const p of verdict.problems) console.log(`       ${p}`);
    }
  }
  const failed = results.filter((r) => !r.verdict.ok).length;
  if (asJson) console.log(JSON.stringify(results, null, 2));
  else console.log(`\n${results.length - failed} of ${results.length} transactions match what Peal Tender says they are.`);
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
