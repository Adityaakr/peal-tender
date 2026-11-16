import { decodeAbiParameters, encodeFunctionData, type Address } from "viem";
import { vaultAbi } from "../../../../scripts/v2/abi.ts";
import { act } from "../wallet/store.ts";
import { describeOp, type Op, type Snapshot } from "../data.ts";
import { type Ctx } from "../main.ts";
import { ago, chip, dateTime, duration, h, hash, meter, short, stat } from "../ui.ts";
import { fmt, header, kindTitle, signerName } from "./common.ts";

/** What a change does, with addresses shortened (full on hover and copy) and signer changes as a diff. */
function what(op: Op, s: Snapshot): HTMLElement {
  if (op.kind === "SetSigners") {
    try {
      const [m, th] = decodeAbiParameters([{ type: "address[]" }, { type: "uint256" }], op.data);
      const now = s.members.map((x) => x.address.toLowerCase());
      const next = (m as readonly Address[]).map((x) => x.toLowerCase());
      const added = (m as readonly Address[]).filter((x) => !now.includes(x.toLowerCase()));
      const removed = s.members.filter((x) => !next.includes(x.address.toLowerCase()));
      return h(
        "div.op-what",
        `${th} of ${m.length}`,
        ...added.flatMap((a) => [", adds ", hash(a, { label: "new signer" })]),
        ...removed.flatMap((x) => [`, removes ${signerName(s, x.address)} (`, hash(x.address, { label: "removed signer" }), ")"]),
        added.length + removed.length === 0 ? ", same members" : "",
      );
    } catch {
      // fall through
    }
  }
  const text = describeOp(op, s, fmt).replace(/0x[0-9a-fA-F]{40}/g, (a) => short(a));
  return h("div.op-what", text);
}

export async function timelock(ctx: Ctx): Promise<HTMLElement> {
  const s = ctx.snap;
  const executeRow = (op: Op) => {
    const b = h("button.btn.btn-small.btn-primary", { type: "button" }, "Execute");
    b.addEventListener("click", () =>
      void act(`Execute change #${op.id}`, [{ to: ctx.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "execute", args: [op.id] }), label: `Execute change #${op.id}` }], ctx.reload),
    );
    return h("div.small.muted", { style: "margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap" }, b, "Anyone may execute it now; or ", h("span.mono", `npm run v2 -- execute ${op.id}`));
  };
  const now = s.block.timestamp;
  const WINDOW = 7n * 86400n;

  const queuedAt = new Map<bigint, bigint>();
  const vetoedBy = new Map<bigint, string>();
  const rows = new Map<bigint, HTMLElement>();

  const row = (op: Op): HTMLElement => {
    const start = queuedAt.get(op.id) ?? op.eta - s.delay;
    const span = op.eta > start ? op.eta - start : 1n;
    const elapsed = now > start ? now - start : 0n;
    let state: HTMLElement;
    let timing: string;
    let progress: HTMLElement | null = null;
    if (op.state === "Executed") {
      state = chip("Executed", "ok");
      timing = `ready since ${dateTime(op.eta)}`;
    } else if (op.state === "Vetoed") {
      state = chip("Vetoed", "bad");
      timing = vetoedBy.has(op.id) ? `by ${vetoedBy.get(op.id)}` : "by one signer";
    } else if (op.void) {
      state = chip("Void", "bad");
      timing = "the signer set changed after it was queued";
    } else if (op.lapsed) {
      state = chip("Lapsed", "plain");
      timing = `not executed within 7 days of ${dateTime(op.eta)}`;
    } else if (now >= op.eta) {
      state = chip("Ready", "ok");
      timing = `anyone can execute it until ${dateTime(op.eta + WINDOW)}`;
      progress = meter(1, "good", "delay passed");
    } else {
      state = chip("Waiting", "wait");
      timing = `ready in ${duration(op.eta - now)}, at ${dateTime(op.eta)}`;
      progress = meter(Number(elapsed) / Number(span), "", "share of the delay passed");
    }
    const runnable = op.state === "Queued" && !op.void && !op.lapsed;
    return h(
      "div.op",
      h("div.op-id", `#${op.id}`),
      h(
        "div",
        h("div.op-title", kindTitle(op.kind)),
        what(op, s),
        progress,
        runnable && now >= op.eta ? executeRow(op) : null,
        runnable && now < op.eta ? h("div.small.muted", { style: "margin-top:8px" }, "Veto (any one signer): ", h("span.mono", `npm run v2 -- veto ${op.id} --as <signer>`)) : null,
      ),
      h("div.op-side", state, h("span.muted", timing)),
    );
  };

  const list = h(
    "section.card.flush",
    ...(s.ops.length
      ? s.ops.map((op) => {
          const r = row(op);
          rows.set(op.id, r);
          return r;
        })
      : [h("div.empty", "Nothing has been queued.")]),
  );

  void ctx.activity().then((acts) => {
    for (const a of acts) {
      if (a.name === "OpQueued" && a.timestamp) queuedAt.set(a.args.opId as bigint, a.timestamp);
      if (a.name === "OpVetoed") vetoedBy.set(a.args.opId as bigint, signerName(s, a.args.by as `0x${string}`));
    }
    for (const op of s.ops) rows.get(op.id)?.replaceWith(row(op));
  });

  const caps = [s.pay, s.buy, s.native].map((t) => {
    const spent = t.cap > t.left ? t.cap - t.left : 0n;
    return stat(
      `${t.symbol} allowance today`,
      t.cap === 0n ? "None" : fmt(t.left, t),
      t.cap === 0n ? undefined : `of ${fmt(t.cap, t)}`,
      t.cap === 0n ? "Every amount waits in the timelock" : `${fmt(spent, t)} spent since 00:00 UTC`,
      t.cap === 0n ? undefined : meter(Number(spent) / Number(t.cap), t.left === 0n ? "full" : "", `${t.symbol} spent today`),
    );
  });

  const waiting = s.ops.filter((o) => o.state === "Queued" && !o.void && !o.lapsed).length;
  return h(
    "div",
    header(
      "Timelock",
      `Large sweeps and every rule change wait ${duration(s.delay)} in public. Any one signer can veto during the wait; after it, anyone may execute. Small amounts leave at once, up to a daily allowance per token.`,
    ),
    h("div.grid.grid-4", stat("Delay", duration(s.delay), undefined, "from queue to execution"), ...caps),
    h("h2.section-title", "Queued changes", h("span.aside", waiting ? `${waiting} waiting or ready` : "none waiting")),
    list,
    h(
      "p.small.muted",
      { style: "margin-top:12px" },
      `Queued changes are read from the vault. Times are block times; the last block was ${ago(now, Math.floor(Date.now() / 1000))}.`,
    ),
  );
}
