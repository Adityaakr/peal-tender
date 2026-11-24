/**
 * The judge page (#/judge, and /judge on the hosted site): for a juror with no wallet, no
 * account and no funds. It reads the live contracts, runs real eth_calls against them
 * (judge/probes.ts) and maps what it shows to the fest's rubric.
 *
 * It asks the testnet's EVM RPC itself, so it works while the rest of the app cannot read
 * the vault, and it ignores ?vault= and ?rpc=: its claims are about the testnet contracts.
 */
import "../landing.css";
import "../judge.css";
import { AUCTION_REPO, EXPLORER, REPO, VIDEO } from "../links.ts";
import { amount, dateTime, duration, fingerprint, h, hash, icon, short } from "../ui.ts";
import { readLive, type Live, type SignerKey } from "../judge/live.ts";
import { BOOK, DRILL_SIGNER, DRILL_VAULT, GROUPS, held, loadFacts, PROBES, runProbe, VAULT, type Facts, type Probe, type Result } from "../judge/probes.ts";
import { callBody, Rpc, TESTNET_RPC } from "../judge/rpc.ts";
import { tenderMark } from "./landing.ts";

/** The window that order was sent in, and the drill's own proof transaction (deployments/evidence.json). */
const WINDOW_TX = "A5334F480A88D4CF52CDD44C66017F0050B2FD46599A2A924F6F5F71C9A9C062";
/** The explorer takes only native hashes, so the EVM transactions are linked by theirs (0xd1aec2ea…, 0x42ee8b65…). */
const ORDER_NATIVE = "E2FE327E1BE7C362F9E61593D8B3930C3F416BF8B28DF55C46BC38ED271B48AE";
const DRILL_NATIVE = "DFC54062209164E6EBFAC2F6EA124CD154914992FF4634989A464E7D24C3241E";

/** Facts older than this are read again before a call is built from them. */
const FACTS_AGE_MS = 30_000;
const PARALLEL = 6;

const EXPLORER_NOTE = "The explorer opens on mainnet: press Testnet at its top once, and the links work from then on.";

const ext = (href: string, label: string) => h("a", { href, target: "_blank", rel: "noopener" }, label);
const file = (path: string, label = path) => ext(`${REPO}/blob/main/${path}`, label);
const addr = (a: string, label = "explorer") => ext(`${EXPLORER}/address/${a}`, label);
const txLink = (tx: string, label = "transaction") => ext(`${EXPLORER}/tx/${tx}`, label);

function scrollTo(id: string) {
  return () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
}

function jump(label: string, id: string, cls = "j-jump"): HTMLElement {
  const b = h(`button.${cls}`, { type: "button" }, label);
  b.addEventListener("click", scrollTo(id));
  return b;
}

// ---------------------------------------------------------------- live state

function keyText(k: SignerKey): string {
  return k.mlDsa87 && k.possession ? `ML-DSA-87, ${k.bytes.toLocaleString("en-US")} bytes, possession proven` : "no usable ML-DSA-87 key";
}

const fusd = (v: bigint) => `${amount(v, 6, 6)} fUSD`;

function liveTable(l: Live): HTMLElement {
  const row = (what: string, value: (Node | string)[], from: string, ...links: (Node | string)[]) =>
    h("tr", h("th", { scope: "row" }, what), h("td.j-now", ...value), h("td.j-from", h("code", from), ...links.flatMap((x) => [" · ", x])));
  return h(
    "div.t-ledger-scroll.t-req-scroll",
    h(
      "table.t-req.j-live",
      h("thead", h("tr", h("th", { scope: "col" }, "What"), h("th", { scope: "col" }, "Now"), h("th", { scope: "col" }, "Read from"))),
      h(
        "tbody",
        row("The vault (v2)", [hash(VAULT, { label: "vault address" }), `, ${l.codeBytes.toLocaleString("en-US")} bytes of code`], "eth_getCode", addr(VAULT)),
        row("Its money", [`${fusd(l.fusd)}, of which ${fusd(l.fusdFree)} is not promised to a tender`], "balanceOf, freeBalance"),
        row("Who may spend it", [`${l.threshold} of ${l.members.length} signers; ${l.nonce} signed ${l.nonce === 1n ? "action" : "actions"} so far`], "threshold, members, nonce"),
        ...l.members.map((m, i) =>
          row(`Signer ${i + 1}`, [h("span.j-key", fingerprint(m.keyHash), h("span", keyText(m))), hash(m.address, { label: "signer address" })], "pqcKeyStatus", addr(m.address)),
        ),
        row("Daily cap", [`${fusd(l.left)} left today of ${fusd(l.cap)}`], "remainingToday, dailyCap"),
        row("Timelock", [`${duration(l.delay)}; ${l.opCount === 0n ? "nothing ever queued" : `${l.opCount} changes queued so far`}`], "delay, opCount"),
        row(
          "Open buyback",
          [
            l.openTender
              ? `Tender #${l.openTender.id}: ${fusd(l.openTender.budget)}, ${l.openTender.offers} ${l.openTender.offers === 1 ? "offer" : "offers"}, ${l.time < l.openTender.endTime ? "until" : "ended"} ${dateTime(l.openTender.endTime)}`
              : "none now",
          ],
          "openTenderId, getTender",
          ...(l.openTender ? [h("a", { href: `#/tenders/${l.openTender.id}` }, "see it in the app")] : []),
        ),
        row(
          "The drill vault (v1)",
          [`${amount(l.drill.qor, 18, 4)} QOR and ${fusd(l.drill.fusd)}, still there after the Q-Day Drill of 18 November`],
          "eth_getBalance, balanceOf",
          addr(DRILL_VAULT),
        ),
        row(
          "Its signer",
          [h("span.j-key", fingerprint(l.drill.signer.keyHash), h("span", keyText(l.drill.signer))), "Its classical key was given to the drill's attacker."],
          "pqcKeyStatus",
          addr(DRILL_SIGNER),
        ),
      ),
    ),
  );
}

function livePanel(rpc: Rpc): HTMLElement {
  const status = h("p.j-status", { role: "status" });
  const again = h("button.btn.btn-small", { type: "button" }, "Read again");
  const body = h("div");
  let busy = false;
  const load = async () => {
    if (busy) return;
    busy = true;
    again.setAttribute("disabled", "");
    status.textContent = "Reading the testnet…";
    if (!body.firstChild) body.append(h("div.t-ledger-scroll.j-loading", { "aria-hidden": "true" }, ...[88, 74, 81, 66, 70].map((w) => h("div.skeleton", { style: `width:${w}%` }))));
    try {
      const l = await readLive(rpc);
      body.replaceChildren(liveTable(l));
      status.replaceChildren(`Read at block ${l.block.toLocaleString("en-US")}, ${dateTime(l.time)}. `, ext(`${EXPLORER}/block/${l.block}`, "See the block"));
      again.textContent = "Read again";
    } catch (e) {
      // An older reading stays on screen, and the status says it is older.
      const stale = body.querySelector("table") !== null;
      if (!stale) body.replaceChildren();
      status.replaceChildren(
        h("span.j-fail", icon("cross"), `The testnet could not be read: ${e instanceof Error ? e.message : String(e)}. ${stale ? "The figures below are from the last reading." : "Nothing is shown rather than old figures."}`),
      );
      again.textContent = "Try again";
    } finally {
      busy = false;
      again.removeAttribute("disabled");
    }
  };
  again.addEventListener("click", () => void load());
  void load();
  return h("div", h("div.j-bar", status, again), body);
}

// ---------------------------------------------------------------- the attacks

const STAMP: Record<Result["verdict"], { text: string; cls: string; icon: string }> = {
  refused: { text: "Refused", cls: "bad", icon: "shield" },
  accepted: { text: "Accepted", cls: "ok", icon: "check" },
  "stopped-earlier": { text: "Stopped earlier", cls: "warn", icon: "pause" },
  "other-refusal": { text: "Refused by another check", cls: "warn", icon: "pause" },
  unexpected: { text: "Not as expected", cls: "alarm", icon: "cross" },
  "not-now": { text: "Nothing to act on", cls: "idle", icon: "dot" },
  "node-failure": { text: "No answer", cls: "idle", icon: "clock" },
};

function expected(r: Result): string {
  const x = r.built?.expect;
  if (!x) return "";
  return x.kind === "accepted" ? "accepted" : `${x.name}${x.args?.length ? ` with ${x.args.map((a) => (typeof a === "string" && a.length === 42 ? short(a) : String(a))).join(", ")}` : ""}`;
}

/** The request the page sent, as a command anyone can run. Text only: no key is involved. */
function copyButton(r: Result): HTMLElement | null {
  const call = r.built?.call;
  if (!call) return null;
  const b = h("button.btn.btn-small", { type: "button" }, icon("copy"), "Copy as curl");
  b.addEventListener("click", () => {
    const text = `curl -s ${TESTNET_RPC} -H 'content-type: application/json' -d '${JSON.stringify(callBody(call))}'`;
    void navigator.clipboard?.writeText(text).then(
      () => {
        b.lastChild!.textContent = "Copied";
        setTimeout(() => (b.lastChild!.textContent = "Copy as curl"), 1500);
      },
      () => {
        b.lastChild!.textContent = "Copying is blocked";
      },
    );
  });
  return b;
}

interface Row {
  probe: Probe;
  el: HTMLElement;
  busy(): void;
  show(r: Result): void;
}

function attackRow(p: Probe, run: () => void): Row {
  const out = h("div.j-out", { "aria-live": "polite" });
  const go = h("button.btn.btn-small", { type: "button", "aria-label": `Run: ${p.title}` }, "Run");
  go.addEventListener("click", run);
  const details = h("details.j-call", h("summary", "The exact call"), h("div"));
  details.hidden = true;
  const idle = () => out.replaceChildren(h("span.j-stamp.idle", p.kind === "control" ? "Must be accepted" : p.kind === "attack" ? "Must be refused" : "Will not reach it"), go);
  idle();
  const el = h(
    "li.j-row",
    { "data-probe": p.id, "data-verdict": "none" },
    h(
      "div.j-what",
      h("h4", p.title),
      h("p", h("span.j-tag", "Changed"), p.change),
      p.simulated ? h("p.j-sim", h("span.j-tag", "Simulated state"), p.simulated) : null,
      h("p.j-means", p.means),
      details,
    ),
    out,
  );
  return {
    probe: p,
    el,
    busy() {
      el.dataset.verdict = "busy";
      out.replaceChildren(h("span.j-stamp.idle", "Asking the testnet…"));
    },
    show(r) {
      el.dataset.verdict = r.verdict;
      const s = STAMP[r.verdict];
      const again = h("button.j-again", { type: "button", "aria-label": `Run again: ${p.title}` }, r.verdict === "node-failure" ? "Retry" : "Run again");
      again.addEventListener("click", run);
      out.replaceChildren(
        h(`span.j-stamp.${s.cls}`, icon(s.icon), s.text),
        r.verdict === "node-failure" || r.verdict === "not-now" ? h("p.j-note", r.said) : h("code.j-said", r.said),
        ...(r.verdict === "other-refusal" || r.verdict === "unexpected" ? [h("p.j-note", `This row expected: ${expected(r)}. It proves nothing until that is explained.`)] : []),
        h("p.j-meta", p.simulated && r.ms !== undefined ? "simulated state · " : "", r.ms === undefined ? "" : `${r.ms} ms · `, again),
      );
      const c = r.built?.call;
      details.hidden = !c;
      if (c) {
        const kv = (k: string, v: Node | string) => [h("dt", k), h("dd", v)];
        details.lastElementChild!.replaceWith(
          h(
            "div",
            h(
              "dl",
              ...kv("Method", "eth_call"),
              ...kv("To", hash(c.to)),
              ...kv("From", hash(c.from)),
              ...kv("At", r.built!.where),
              ...kv("Calldata", h("span.mono", `${((c.data.length - 2) / 2).toLocaleString("en-US")} bytes, ${c.data.slice(0, 10)}…`)),
              ...kv("Expected", expected(r)),
              ...kv("Answer", h("span.mono.j-raw", r.raw === undefined ? "none" : r.raw === "0x" ? "0x (no data)" : r.raw.length > 74 ? `${r.raw.slice(0, 74)}…` : r.raw)),
            ),
            copyButton(r),
          ),
        );
      }
    },
  };
}

const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

function attackPanel(rpc: Rpc): { el: HTMLElement; runAll: () => void } {
  let facts: { at: number; p: Promise<Facts> } | undefined;
  const getFacts = () => {
    if (!facts || Date.now() - facts.at > FACTS_AGE_MS) {
      const p = loadFacts(rpc);
      facts = { at: Date.now(), p };
      // a failed read is not kept
      p.catch(() => (facts = undefined));
    }
    return facts.p;
  };

  const results = new Map<string, Result>();
  const summary = h("p.j-status", { role: "status" });
  const allBtn = h("button.btn.btn-primary", { type: "button" }, `Run all ${PROBES.length} calls`);

  const summarise = (running: boolean) => {
    const rs = [...results.values()];
    const count = (v: Result["verdict"]) => rs.filter((r) => r.verdict === v).length;
    if (!rs.length && !running) {
      summary.textContent = `${PROBES.length} calls, none run yet. Nothing is signed or sent.`;
      return;
    }
    if (running) {
      summary.textContent = `${rs.length} of ${PROBES.length} answered…`;
      return;
    }
    const wrong = count("other-refusal") + count("unexpected");
    const failed = count("node-failure");
    const parts = [
      `${plural(count("refused"), "attack")} refused by the check named`,
      `${plural(count("accepted"), "control")} accepted`,
      ...(count("stopped-earlier") ? [`${plural(count("stopped-earlier"), "call")} stopped earlier, as stated`] : []),
      ...(count("not-now") ? [`${plural(count("not-now"), "row")} with nothing to act on now`] : []),
      ...(wrong ? [`${plural(wrong, "row")} not as expected`] : []),
      ...(failed ? [`${plural(failed, "call")} without an answer`] : []),
    ];
    const ok = rs.filter(held).length;
    summary.replaceChildren(
      h(`span.${wrong || failed ? "j-fail" : "j-good"}`, icon(wrong || failed ? "cross" : "check"), `${ok} of ${rs.length} did what they say. `),
      `${parts.join("; ")}.`,
    );
  };

  const rows = new Map<string, Row>();
  let running = false;
  const runOne = async (p: Probe): Promise<void> => {
    const row = rows.get(p.id)!;
    row.busy();
    let r: Result;
    try {
      r = await runProbe(p, await getFacts(), rpc);
    } catch (e) {
      r = { verdict: "node-failure", said: e instanceof Error ? e.message : String(e) };
    }
    results.set(p.id, r);
    row.show(r);
  };
  const runAll = async () => {
    if (running) return;
    running = true;
    allBtn.setAttribute("disabled", "");
    allBtn.textContent = "Running…";
    results.clear();
    facts = undefined;
    summarise(true);
    const queue = [...PROBES];
    for (const p of queue) rows.get(p.id)!.busy();
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          await runOne(p);
          summarise(true);
        }
      }),
    );
    running = false;
    allBtn.removeAttribute("disabled");
    allBtn.textContent = [...results.values()].some((r) => r.verdict === "node-failure") ? "Try all again" : "Run all again";
    summarise(false);
  };
  allBtn.addEventListener("click", () => void runAll());

  for (const p of PROBES) {
    rows.set(
      p.id,
      attackRow(p, () => {
        if (running) return;
        void runOne(p).then(() => summarise(false));
      }),
    );
  }
  summarise(false);

  const el = h(
    "div",
    h("div.j-bar.j-sticky", summary, allBtn),
    ...GROUPS.map((g) =>
      h("section.j-group", { "aria-label": g.title }, h("header", h("h3", g.title), h("p", g.lead)), h("ol.j-rows", ...PROBES.filter((p) => p.group === g.id).map((p) => rows.get(p.id)!.el))),
    ),
  );
  return { el, runAll: () => void runAll() };
}

// ---------------------------------------------------------------- the rubric

type Cell = (Node | string)[];

function map(head: [string, string, string], rows: [string, Cell, Cell][]): HTMLElement {
  return h(
    "div.t-ledger-scroll.t-req-scroll",
    h(
      "table.t-req.j-map",
      h("thead", h("tr", ...head.map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", ...rows.map(([a, b, c]) => h("tr", h("th", { scope: "row" }, a), h("td", ...b), h("td.j-limit", h("span.j-tag", head[2]), ...c)))),
    ),
  );
}

function rubric(): HTMLElement {
  return map(
    ["Criterion", "What to look at", "Where it falls short"],
    [
      [
        "Works as described, 25%",
        [
          jump("Live state", "live"),
          " and ",
          jump("the calls", "attacks"),
          " above; the ",
          h("a", { href: "#/vault" }, "app"),
          "; a holder's whole path (register, offer, settle, claim) run from the browser on 21 November, every transaction in the ",
          file("README.md", "README"),
          ".",
        ],
        ["Acting yourself still needs about 1.5 test QOR from the faucet. The treasury's side runs from the command line, not from a page."],
      ],
      [
        "QoreChain technology, verified, 25%",
        [
          "pqcVerify and pqcKeyStatus in every treasury action; EVM windows scoped to the contracts called; QoreSign and QoreSeal for proposals; fUSD by MsgConvertCoin. ",
          file("deployments/evidence.json"),
          " lists every transaction and ",
          h("code", "npm run evidence"),
          " re-reads each through QoreChain's MCP server. Kit by kit: ",
          file("docs/kits.md"),
          ".",
        ],
        ["QoreX cannot send EVM transactions for a page yet, so visitors act through a guest account made in the browser."],
      ],
      [
        "Post-quantum correctness, 20%",
        ["The calls above, with each refusal's own error. ", file("THREAT_MODEL.md"), " for what stops each attack, ", file("docs/AUDIT.md"), " for each precompile call, what it protects and its tests."],
        [
          "The author holds all three demo signer keys, so this shows the mechanism, not independent custody. The timelock is 15 minutes so it fits a demo. The Foundry tests mock the precompiles; the real ones answer on this page and in ",
          h("code", "npm run pq -- probe"),
          ".",
        ],
      ],
      [
        "Originality, 15%",
        [
          "A buyback, not only a vault: holders offer tokens, one price clears for all, and it can run as a sealed sale on ",
          ext(AUCTION_REPO, "Peal Sealed Auction"),
          ". A buyback needs post-quantum authority because its budget sits in the open for weeks, waiting for offers.",
        ],
        [
          "A multisig vault with a timelock is a known shape. The design and the clearing rule come from the author's earlier project Peal and were re-written during the fest; ",
          file("README.md#prior-work", "Prior work"),
          " lists what.",
        ],
      ],
      [
        "Clarity, UX, documentation, 15%",
        ["This page, ", h("a", { href: "#/guide" }, "How to use"), " with live steps per role, the ", file("README.md", "README"), ", and the ", ext(VIDEO, "video"), " (2:59)."],
        ["The video was made before this page, so it does not show it."],
      ],
    ],
  );
}

function category(): HTMLElement {
  return map(
    ["Post-Quantum dApp requirement", "Evidence", "State on 25 November"],
    [
      [
        "Scoped EVM window",
        [
          "Each action opens a window for one transaction to the listed contracts and closes it: ",
          file("scripts/v2/window.ts"),
          ". The order used on this page: ",
          txLink(ORDER_NATIVE, "sweep"),
          ", inside a window ",
          txLink(WINDOW_TX, "opened"),
          " and closed around it.",
        ],
        ["In use since 15 November. An eth_call is not bound by windows, so the calls on this page cannot show them; the transactions do."],
      ],
      ["pqcVerify", ["The vault calls it for every share of every treasury action. The first three calls above show it accept real signatures; the others show it refuse."], ["Live in v1 since 15 November and in v2 since 18 November."]],
      [
        "Two-stage QCAI audit",
        [file("docs/audit/stage-1-qcai-2026-11-25.pdf", "Stage 1 report"), " and what was done about each finding in ", file("docs/AUDIT.md"), "."],
        ["Stage 1 run on 24 November: 72/100, MEDIUM, 5 findings, each worked through. Stage 2 not run yet."],
      ],
      ["Foundry tests", ["150 tests: unit, fuzz, invariant, audit regressions, cross-language vectors, gas. ", ext(`${REPO}/tree/main/test`, "test/")], ["Passing in CI on every pull request."]],
    ],
  );
}

// ---------------------------------------------------------------- the page

export function judgePage(arg?: string): HTMLElement {
  const rpc = new Rpc();
  const attacks = attackPanel(rpc);
  const attackCount = PROBES.filter((p) => p.kind === "attack").length;

  const start = h("button.btn.btn-primary.t-btn", { type: "button" }, "Attack the live vault", icon("arrow"));
  start.addEventListener("click", () => {
    scrollTo("attacks")();
    attacks.runAll();
  });

  const step = (k: number, title: string, body: Cell) => h("li.t-step", h("span.t-step-n", String(k)), h("div", h("h3", title), h("p", ...body)), h("div"));
  const head = (title: string, lead: Cell) => h("header.t-section-head", h("h2.t-title", title), h("p.t-lead", ...lead));

  const guide = h(
    "section.j-hero",
    h(
      "div.t-wrap.j-hero-grid",
      h(
        "div.t-hero-copy",
        h("p.t-kicker", "For judges · no wallet, no account, no funds"),
        h("h1.t-display", "Try to take the money ", h("em", "from here"), "."),
        h(
          "p.t-lead",
          `Peal Tender is a treasury vault on the QoreChain testnet. Every treasury payment needs two of three ML-DSA-87 signatures that the chain checks itself. This page runs ${attackCount} attacks on the deployed contracts as eth_calls and shows the error each one gets back.`,
        ),
        h("div.t-ctas", start, jump("How it maps to the rubric", "rubric", "btn.t-btn")),
        h("p.t-live", "Reads and eth_calls only, sent from your browser to ", h("span.mono", "evm-testnet.qore.host"), ". Nothing is signed or sent as a transaction."),
      ),
      h(
        "div.j-guide",
        h("h2.t-subtitle", "Five minutes, in order"),
        h(
          "ol.t-steps.j-steps",
          step(1, "Run the attacks", ["One press. Controls first, so you see the call path works. ", jump("Go", "attacks")]),
          step(2, "Read the vault", ["Balances, signers' keys and limits, as the chain holds them now. ", jump("Go", "live")]),
          step(3, "Check one transaction", ["The order the attacks are built from: ", txLink(ORDER_NATIVE, "the sweep of 18 November"), ". The drill's: ", txLink(DRILL_NATIVE, "the proof transaction"), ". ", EXPLORER_NOTE]),
          step(4, "Match it to the rubric", ["Each criterion, what to look at, and where we fall short. ", jump("Go", "rubric")]),
          step(5, "Watch or read", [ext(VIDEO, "Video, 2:59"), ", ", file("README.md", "README"), ", ", file("docs/AUDIT.md", "audit and design"), ", ", file("THREAT_MODEL.md", "threat model"), "."]),
        ),
      ),
    ),
  );

  const attackSection = h(
    "section.t-section",
    { id: "attacks" },
    h(
      "div.t-wrap",
      head("Attacks on the live contracts", [
        "Most calls start from an order the vault really accepted, fetched from the chain with its two signatures, and change one thing. The deployed code answers. A row counts only if the error is the one it aims at; any other refusal is reported as such.",
      ]),
      attacks.el,
    ),
  );

  const live = h(
    "section.t-section",
    { id: "live" },
    h("div.t-wrap", head("The vault, read now", ["Straight from the testnet's EVM RPC. The explorer links let you compare with a site that is not ours. ", EXPLORER_NOTE]), livePanel(rpc)),
  );

  const limit = (title: string, body: Cell) => h("li", h("h3", title), h("p", ...body));
  const limits = h(
    "section.t-section",
    { id: "limits" },
    h(
      "div.t-wrap",
      head("What this page cannot show", ["An eth_call runs the deployed code on the chain's state, and nothing more. Read the results with these limits."]),
      h(
        "ul.j-limits",
        limit("The sender is claimed, not proven", [
          "eth_call accepts any sender without a signature. That is the attacker's best case with a stolen classical key, so it makes the attacks stronger, not weaker.",
        ]),
        limit("EVM windows are not enforced", [
          "On chain, the same sender would first need a window that only a hybrid post-quantum signature can open. The refusals at that layer are in ",
          file("THREAT_MODEL.md"),
          ", section 7, from a rehearsal that really sent them.",
        ]),
        limit("Most attacks run on a past block", [
          "A signed order is valid for one nonce and at most 24 hours, so the controls use the block before the order landed. If the node ever drops that block, those rows say it gave no answer; the pqcVerify control and the rows on the latest block still work.",
        ]),
        limit("Four rows use simulated state", [
          "The daily cap stands behind the signatures and the timelock is empty, so a plain call cannot reach either; two rows show that. The four rows marked Simulated state replace what they name, in the simulation only, and run the same deployed vault code. For the cap rows the precompiles are stand-ins that always answer valid: this node switches the real ones off when a call carries replaced state.",
        ]),
        limit("It is our page", ["Copy any call as a curl command and send it yourself, or run ", h("code", "npm run judge:smoke"), " from the repository: the same calls, outside the browser."]),
      ),
    ),
  );

  const rubricSection = h(
    "section.t-section",
    { id: "rubric" },
    h(
      "div.t-wrap",
      head("Against the rubric", ["The fest's five criteria and weights, then the Post-Quantum dApp category's requirements. The last column says where it falls short, or its state today."]),
      rubric(),
      h("h3.t-subtitle.j-sub", "The category's requirements"),
      category(),
    ),
  );

  const footer = h(
    "footer.t-footer",
    h(
      "div.t-wrap",
      h(
        "p.j-foot",
        "Contracts: vault ",
        addr(VAULT, short(VAULT)),
        ", tender library ",
        addr(BOOK, short(BOOK)),
        ", drill vault ",
        addr(DRILL_VAULT, short(DRILL_VAULT)),
        ". ",
        ext(REPO, "Source"),
        ", Apache-2.0. ",
        h("a", { href: "#/" }, "Peal Tender's home page"),
        ".",
      ),
    ),
  );

  const nav = h(
    "header.t-nav",
    h(
      "div.t-wrap.t-nav-inner",
      h("a.t-wordmark", { href: "#/" }, tenderMark(24), h("span", "Peal Tender")),
      h("nav.t-links", { "aria-label": "On this page" }, ...([["Attacks", "attacks"], ["Live state", "live"], ["Limits", "limits"], ["Rubric", "rubric"]] as const).map(([l, id]) => jump(l, id, "t-navlink"))),
      h("div.t-nav-ctas", h("a.btn.btn-small", { href: "#/vault" }, "Open the app")),
    ),
  );

  if (arg === "run") queueMicrotask(() => attacks.runAll());
  return h("div.t-page.j-page", nav, h("main", guide, attackSection, live, limits, rubricSection), footer);
}
