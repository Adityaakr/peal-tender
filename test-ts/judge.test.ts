/**
 * The judge page's calls (apps/dashboard/src/judge/), offline. The live counterpart is
 * `npm run judge:smoke`. Checks that each attack differs from the accepted order in
 * exactly what it says, that only the named refusal counts, and that a node failure is
 * never read as a refusal.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeFunctionData, encodeErrorResult, encodeFunctionResult, hexToBytes, keccak256, type Abi, type Address, type Hex } from "viem";
import { mldsa87 } from "@qorechain/pqc";
import { pqcKeyStatusAbi, tenderBookAbi, vaultAbi } from "../scripts/v2/abi.ts";
import {
  ALWAYS_VALID, ATTACKER, DRILL_SIGNER, DRILL_VAULT, GROUPS, PQC_KEY_STATUS, PQC_VERIFY, PROBES, VAULT,
  forgedSignature, held, judge, loadFacts, parseOrder, queuedOp, runProbe, signedMessage, spell, thrown,
  type Auth, type Facts, type Probe, type RawReceipt, type RawTx,
} from "../apps/dashboard/src/judge/probes.ts";
import { callBody, Rpc, RpcFailure, type Fetch } from "../apps/dashboard/src/judge/rpc.ts";

const V = vaultAbi as Abi;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/order-tx.json", import.meta.url), "utf8")) as { tx: RawTx; receipt: RawReceipt; keys: Record<Address, Hex> };
const deployment = JSON.parse(readFileSync(new URL("../deployments/qorechain-diana-v2.json", import.meta.url), "utf8"));
const order = parseOrder(fixture.tx, fixture.receipt);

const facts: Facts = {
  order,
  members: deployment.members,
  latest: { number: 10_685_234n, timestamp: 1_795_549_061n },
  cap: 1_000_000n,
  left: 1_000_000n,
  free: 99_075_000n,
  delay: 900n,
  epoch: 0n,
  opCount: 0n,
  openTenderId: 3n,
  tenderEnd: 1_797_768_002n,
  drillBalance: 67n * 10n ** 18n,
};

type Handler = (body: { method: string; params: unknown[] }) => unknown;
/** An Rpc whose node is this function, per call. Returns `{result}`/`{error}`, or a whole HTTP answer. */
function fake(handler: Handler, o: { retries?: number } = {}): Rpc {
  const f: Fetch = async (_u, init) => {
    const batch = JSON.parse(init.body) as { id: number; method: string; params: unknown[] }[];
    const rs = batch.map((b) => ({ id: b.id, r: handler(b) as { status?: number; text?: string } }));
    const http = rs.find((x) => x.r.status !== undefined)?.r;
    if (http) return { ok: http.status === 200, status: http.status!, text: async () => http.text ?? "" };
    // out of order on purpose: answers are matched by id
    return { ok: true, status: 200, text: async () => JSON.stringify(rs.reverse().map((x) => ({ jsonrpc: "2.0", id: x.id, ...x.r }))) };
  };
  return new Rpc({ fetch: f, retries: o.retries ?? 0, backoffMs: 1, timeoutMs: 200 });
}
const keyStatusResult = (key: Hex) => encodeFunctionResult({ abi: pqcKeyStatusAbi as Abi, functionName: "pqcKeyStatus", result: [true, 1, key, true] });
const anyKey = fake(() => ({ result: keyStatusResult(`0x${"11".repeat(2592)}`) }));
const build = async (id: string, f: Facts = facts) => {
  const p = PROBES.find((x) => x.id === id);
  assert.ok(p, id);
  return p.build(f, anyKey);
};
const sweep = (data: Hex) => {
  const d = decodeFunctionData({ abi: V, data });
  assert.equal(d.functionName, "sweep");
  const [token, to, amount, auth] = d.args as unknown as [Address, Address, bigint, Auth];
  return { token, to, amount, deadline: auth.deadline, signers: auth.signers, signatures: auth.signatures };
};
const err = (name: string, args: unknown[] = [], abi: Abi = V) => encodeErrorResult({ abi, errorName: name, args });

describe("the accepted order", () => {
  it("is the transaction the deployment record and README cite, sent to the vault by the relayer", () => {
    assert.equal(order.tx, deployment.actions.sweep.tx);
    assert.equal(VAULT, deployment.contracts.PealTenderV2.address);
    assert.equal(order.from, deployment.accounts.relayer.evm);
    assert.equal(order.amount, 10_000n);
    assert.equal(order.nonce, 0n);
    assert.equal(order.auth.signers.length, 2);
    for (const g of order.auth.signatures) assert.equal(hexToBytes(g).length, 4627);
  });
  it("rebuilds the 256 bytes each signer signed", () => {
    const m = signedMessage(order, order.auth.signers[0]!);
    assert.equal(hexToBytes(m).length, 256);
    assert.ok(m.includes(VAULT.slice(2).toLowerCase()));
  });
  it("carries two signatures that real ML-DSA-87 accepts for those bytes, and for no others", () => {
    const check = (key: Address, m: Hex, g: Hex) => mldsa87.verify(hexToBytes(fixture.keys[key]!), hexToBytes(m), hexToBytes(g));
    const [a, b] = order.auth.signers as [Address, Address];
    const [ga, gb] = order.auth.signatures as [Hex, Hex];
    assert.equal(check(a, signedMessage(order, a), ga), true);
    assert.equal(check(b, signedMessage(order, b), gb), true);
    assert.equal(check(a, signedMessage({ ...order, to: ATTACKER }, a), ga), false); // edited recipient
    assert.equal(check(a, signedMessage({ ...order, nonce: 1n }, a), ga), false); // replay
    assert.equal(check(b, signedMessage(order, b), ga), false); // another member's signature
    assert.equal(check(a, signedMessage(order, a), forgedSignature("a")), false);
  });
  it("refuses a failed, foreign or mismatched transaction", () => {
    assert.throws(() => parseOrder(fixture.tx, { ...fixture.receipt, status: "0x0" }), RpcFailure);
    assert.throws(() => parseOrder({ ...fixture.tx, to: DRILL_VAULT }, fixture.receipt), RpcFailure);
    assert.throws(() => parseOrder(fixture.tx, { ...fixture.receipt, logs: [] }), RpcFailure);
  });
});

describe("the calls", () => {
  it("have unique ids, known groups, and controls first", () => {
    assert.equal(new Set(PROBES.map((p) => p.id)).size, PROBES.length);
    for (const p of PROBES) assert.ok(GROUPS.some((g) => g.id === p.group), p.id);
    for (const g of GROUPS) assert.ok(PROBES.some((p) => p.group === g.id), g.id);
    assert.equal(GROUPS[0]!.id, "control");
    assert.equal(PROBES[0]!.kind, "control");
  });
  it("cover every attack the page promises", () => {
    const attacks = new Set(PROBES.filter((p) => p.kind === "attack").map((p) => p.group));
    assert.deepEqual([...attacks].sort(), ["cap", "edited", "members", "replay", "stolen", "timelock"]);
  });
  it("replay the order byte for byte in the control, at the block before it landed", async () => {
    const c = (await build("control-order")).call;
    assert.equal(c.data, fixture.tx.input);
    assert.equal(c.block, order.block - 1n);
    assert.equal(c.from, order.from);
  });

  /** For each attack built on the order: the fields that differ, and nothing else. */
  const differs: Record<string, string[]> = {
    "control-stranger": ["from"],
    "stolen-unsigned": ["from", "signers", "signatures"],
    "stolen-forged": ["from", "signatures"],
    "members-one": ["signers", "signatures"],
    "members-outsider": ["signers"],
    "members-twice": ["signers", "signatures"],
    "members-swapped": ["signers", "signatures"],
    "replay-next-block": ["block"],
    "replay-today": ["block"],
    "edited-recipient": ["to"],
    "edited-amount": ["amount"],
    "edited-deadline": ["deadline"],
    "cap-plain": ["amount"],
  };
  for (const [id, want] of Object.entries(differs)) {
    it(`${id} changes only: ${want.join(", ")}`, async () => {
      const { call } = await build(id);
      const a = { from: order.from, block: order.block - 1n, ...sweep(order.data) };
      const b = { from: call.from, block: call.block, ...sweep(call.data) };
      const changed = Object.keys(a).filter((k) => JSON.stringify(a[k as keyof typeof a], (_x, v) => (typeof v === "bigint" ? String(v) : v)) !== JSON.stringify(b[k as keyof typeof b], (_x, v) => (typeof v === "bigint" ? String(v) : v)));
      assert.deepEqual(changed.sort(), [...want].sort());
      assert.equal(call.to, VAULT);
      assert.equal(call.overrides, undefined);
    });
  }
  it("keep real signatures where they say so, and swap only whose they are", async () => {
    const real = new Set(order.auth.signatures);
    for (const id of ["members-one", "members-outsider", "members-twice", "members-swapped", "edited-recipient"]) {
      for (const g of sweep((await build(id)).call.data).signatures) assert.ok(real.has(g), id);
    }
    const swapped = sweep((await build("members-swapped")).call.data);
    assert.ok(BigInt(swapped.signers[0]!) < BigInt(swapped.signers[1]!));
    assert.ok(swapped.signers.every((s) => facts.members.some((m) => m.toLowerCase() === s.toLowerCase())));
    for (const g of sweep((await build("stolen-forged")).call.data).signatures) assert.ok(!real.has(g));
  });
  it("send the stolen-key attacks from the accounts whose keys are stolen", async () => {
    assert.equal((await build("stolen-drill")).call.from, DRILL_SIGNER);
    for (const id of ["stolen-unsigned", "stolen-forged", "stolen-now"]) {
      const { call } = await build(id);
      assert.ok(facts.members.some((m) => m.toLowerCase() === call.from.toLowerCase()), id);
    }
  });
  it("replace state only in rows that say so, and never the vault's code", async () => {
    for (const p of PROBES) {
      const { call } = await p.build(facts, anyKey);
      assert.equal(call.overrides !== undefined, p.simulated !== undefined, p.id);
      for (const o of call.overrides ?? []) if (o.address === VAULT) assert.equal(o.code, undefined, p.id);
      if (p.group === "cap" && call.overrides) assert.deepEqual(call.overrides, ALWAYS_VALID);
    }
  });
  it("pair each simulated attack with a control that differs in one value", async () => {
    const over = sweep((await build("cap-quorum")).call.data);
    const within = sweep((await build("cap-within")).call.data);
    assert.deepEqual({ ...over, amount: 0n }, { ...within, amount: 0n });
    assert.ok(over.amount > facts.left && within.amount === facts.left);
    const early = (await build("timelock-override")).call;
    const ready = (await build("timelock-ready")).call;
    assert.equal(early.data, ready.data);
    const a = early.overrides![0]!.slots!;
    const b = ready.overrides![0]!.slots!;
    assert.deepEqual(Object.keys(a), Object.keys(b));
    assert.equal(Object.keys(a).filter((k) => a[k as Hex] !== b[k as Hex]).length, 1);
  });
  it("say there is nothing to act on rather than pretend", async () => {
    const noTender = await runProbe(PROBES.find((p) => p.id === "timelock-tender")!, { ...facts, openTenderId: 0n, tenderEnd: 0n }, anyKey);
    assert.equal(noTender.verdict, "not-now");
    const spent = await runProbe(PROBES.find((p) => p.id === "cap-within")!, { ...facts, left: 0n }, anyKey);
    assert.equal(spent.verdict, "not-now");
    const poor = await runProbe(PROBES.find((p) => p.id === "cap-quorum")!, { ...facts, free: 1n }, anyKey);
    assert.equal(poor.verdict, "not-now");
    assert.equal(held(noTender), false);
  });
  it("send nothing but an eth_call", async () => {
    for (const p of PROBES) {
      const b = callBody((await p.build(facts, anyKey)).call);
      assert.equal(b.method, "eth_call");
      assert.equal(b.params.length, p.simulated ? 3 : 2, p.id);
    }
  });
});

describe("the forged signature and the simulated words", () => {
  it("is ML-DSA-87's length and no real signature", () => {
    const s = forgedSignature("a");
    assert.equal(hexToBytes(s).length, 4627);
    assert.equal(s, forgedSignature("a"));
    assert.notEqual(s, forgedSignature("b"));
  });
  it("lays out a queued change as PealTenderV2 stores it", () => {
    const data = `0x${"ab".repeat(96)}` as Hex;
    const w = queuedOp(1n, "Sweep", 0x1122n, 0x33n, data);
    const base = keccak256(`0x${"1".padStart(64, "0")}${"8".padStart(64, "0")}`);
    assert.ok(base in w);
    const v = BigInt(w[base]!);
    assert.equal(v & 0xffn, 4n); // OpKind.Sweep
    assert.equal((v >> 8n) & 0xffn, 1n); // OpState.Queued
    assert.equal((v >> 16n) & ((1n << 64n) - 1n), 0x1122n); // eta
    assert.equal(v >> 80n, 0x33n); // epoch
    assert.equal(Object.keys(w).length, 5); // head, length, three data words
    assert.ok(Object.values(w).includes(`0x${(193).toString(16).padStart(64, "0")}`));
  });
  it("stands in for the two precompiles only", () => {
    assert.deepEqual(ALWAYS_VALID.map((o) => o.address).sort(), [PQC_VERIFY, PQC_KEY_STATUS].sort());
    for (const o of ALWAYS_VALID) assert.equal(o.slots, undefined);
  });
});

describe("the verdict", () => {
  const want = { kind: "error", name: "OverDailyCap", args: [order.token, 2_000_000n, 1_000_000n] } as const;
  const reverted = (data: Hex) => ({ kind: "reverted", data, ms: 1 }) as const;
  it("counts only the named error with the named arguments", () => {
    assert.equal(judge("attack", want, reverted(err("OverDailyCap", [order.token, 2_000_000n, 1_000_000n]))).verdict, "refused");
    assert.equal(judge("attack", want, reverted(err("OverDailyCap", [order.token, 2_000_000n, 5n]))).verdict, "other-refusal");
    assert.equal(judge("attack", want, reverted(err("PqSignatureInvalid"))).verdict, "other-refusal");
    assert.equal(judge("attack", want, reverted("0x")).verdict, "other-refusal");
    assert.equal(judge("attack", want, reverted("0xdeadbeef")).verdict, "other-refusal");
  });
  it("never counts an accepted attack or a refused control", () => {
    assert.equal(judge("attack", want, { kind: "returned", data: "0x", ms: 1 }).verdict, "unexpected");
    assert.equal(judge("control", { kind: "accepted", returns: "0x" }, reverted(err("PqSignatureInvalid"))).verdict, "unexpected");
    const no = `0x${"0".repeat(64)}` as Hex;
    const yes = `0x${"0".repeat(63)}1` as Hex;
    assert.equal(judge("control", { kind: "accepted", returns: yes }, { kind: "returned", data: no, ms: 1 }).verdict, "unexpected");
    assert.equal(judge("control", { kind: "accepted", returns: yes }, { kind: "returned", data: yes, ms: 1 }).verdict, "accepted");
    assert.equal(judge("control", { kind: "accepted", returns: "0x" }, { kind: "returned", data: "0xabcdef", ms: 1 }).verdict, "unexpected");
  });
  it("keeps a call that is stopped earlier apart from a refusal by the check", () => {
    assert.equal(judge("stopped-earlier", { kind: "error", name: "PqSignatureInvalid" }, reverted(err("PqSignatureInvalid"))).verdict, "stopped-earlier");
  });
  it("names the library's and the vault's errors in words", () => {
    assert.equal(thrown(err("TooEarly", [7n], tenderBookAbi as Abi))?.name, "TooEarly");
    assert.equal(spell(thrown(err("PqSetTooFewSignatures", [1n, 2n]))!), "PqSetTooFewSignatures(given 1, threshold 2)");
    assert.equal(thrown("0xdeadbeef"), undefined);
  });
  it("expects an error every attack's contract really has", async () => {
    const names = new Set([...V, ...(tenderBookAbi as Abi)].filter((x) => x.type === "error").map((x) => (x as { name: string }).name));
    for (const p of PROBES) {
      const { expect } = await p.build(facts, anyKey);
      assert.equal(expect.kind === "accepted", p.kind === "control", p.id);
      if (expect.kind === "error") assert.ok(names.has(expect.name), `${p.id}: ${expect.name}`);
    }
  });
});

describe("the node", () => {
  const p = PROBES.find((x) => x.id === "edited-recipient") as Probe;
  const run = (h: Handler) => runProbe(p, facts, fake(h));
  it("is never read as a refusal when it fails", async () => {
    const cases: Handler[] = [
      () => ({ status: 429 }),
      () => ({ status: 503, text: "paused" }),
      () => ({ status: 200, text: "<html>" }),
      () => ({ status: 200, text: "[]" }),
      () => ({ error: { code: -32000, message: "header not found" } }),
      () => ({ error: { code: -32000, message: "execution reverted" } }),
      () => ({ error: { code: 3, message: "execution reverted" } }),
      () => ({ error: { code: 3, message: "execution reverted", data: "not hex" } }),
      () => ({ result: null }),
      () => {
        throw new TypeError("fetch failed");
      },
    ];
    for (const c of cases) {
      const r = await run(c);
      assert.equal(r.verdict, "node-failure", c.toString());
      assert.equal(held(r), false);
      assert.ok(r.said.length > 5);
    }
  });
  it("is a refusal only with the contract's own bytes", async () => {
    const r = await run(() => ({ error: { code: 3, message: "execution reverted", data: "0xaacbfa70" } }));
    assert.equal(r.verdict, "refused");
    assert.equal(r.said, "PqSignatureInvalid()");
  });
  it("times out, and retries what may pass", async () => {
    const hang = new Rpc({ fetch: (_u, i) => new Promise((_r, no) => i.signal?.addEventListener("abort", () => no(new Error("aborted")))), retries: 0, timeoutMs: 20 });
    await assert.rejects(hang.request("eth_blockNumber", []), /no answer from the testnet node/);
    let tries = 0;
    const flaky = fake(() => (++tries < 3 ? { status: 429 } : { result: "0x1" }), { retries: 2 });
    assert.equal(await flaky.request("eth_blockNumber", []), "0x1");
    assert.equal(tries, 3);
  });
  it("sends calls made together in one batch and gives each its own answer", async () => {
    let posts = 0;
    const node = new Rpc({
      retries: 0,
      fetch: async (_u, i) => {
        posts++;
        const b = JSON.parse(i.body) as { id: number; params: unknown[] }[];
        const out = b.filter((x) => x.params[0] !== 5).map((x) => ({ id: x.id, result: x.params[0] }));
        return { ok: true, status: 200, text: async () => JSON.stringify(out.reverse()) };
      },
    });
    const rs = await Promise.allSettled(Array.from({ length: 25 }, (_, k) => node.request<number>("m", [k])));
    assert.equal(posts, 2);
    rs.forEach((r, k) => (k === 5 ? assert.equal(r.status, "rejected") : assert.deepEqual(r, { status: "fulfilled", value: k })));
  });
  it("loads the facts without any old block's state, so a pruned block costs only its own rows", async () => {
    const views: Record<string, unknown> = { members: facts.members, dailyCap: facts.cap, remainingToday: facts.left, freeBalance: facts.free, delay: 900n, setEpoch: 0n, opCount: 0n, openTenderId: 0n };
    const node = fake(({ method, params }) => {
      if (method === "eth_getTransactionByHash") return { result: fixture.tx };
      if (method === "eth_getTransactionReceipt") return { result: fixture.receipt };
      if (method === "eth_getBlockByNumber") return { result: { number: "0xa30ac2", timestamp: "0x6b05e785" } };
      if (method === "eth_getBalance") return { result: "0x1" };
      assert.equal(params[1], "latest", "an old block was read");
      const { functionName } = decodeFunctionData({ abi: V, data: (params[0] as { data: Hex }).data });
      return { result: encodeFunctionResult({ abi: V, functionName, result: views[functionName] } as never) };
    });
    const f = await loadFacts(node);
    assert.equal(f.order.block, order.block);
    assert.equal(f.members.length, 3);
    assert.equal(f.tenderEnd, 0n);
  });
  it("gives the attacker an address nobody holds a key for", () => {
    assert.ok(![...facts.members, order.from, DRILL_SIGNER].some((a) => a.toLowerCase() === ATTACKER.toLowerCase()));
  });
});
