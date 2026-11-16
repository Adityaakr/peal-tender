import { tenderDetail, type Offer, type Snapshot, type Tender } from "../data.ts";
import { type Ctx } from "../main.ts";
import { chip, dateTime, duration, h, hash, stat, table } from "../ui.ts";
import { fmt, fmtPrice, header } from "./common.ts";

const price = (t: Tender, tick: number) => t.floorPrice + BigInt(tick) * t.tickSize;

function stateChip(t: Tender, now: bigint): HTMLElement {
  if (t.state === "Open") return now >= t.endTime ? chip("Ended, ready to settle", "warn") : chip("Open for offers", "wait");
  if (t.state === "Settled") return chip("Settled", "ok");
  return chip("No sale", "bad");
}

export async function tenders(ctx: Ctx, arg?: string): Promise<HTMLElement> {
  const s = ctx.snap;
  const now = s.block.timestamp;
  if (arg) {
    const t = s.tenders.find((x) => String(x.id) === arg);
    if (!t) return h("div.note.bad", `There is no tender #${arg}.`);
    return detail(ctx, t);
  }
  const rows = s.tenders.map((t) => [
    h("a", { href: `#/tenders/${t.id}` }, `#${t.id}`),
    stateChip(t, now),
    `${fmt(t.budget, s.pay)} ${s.pay.symbol}`,
    String(t.offerCount),
    t.state === "Settled" ? `${fmtPrice(t.price, s.pay)} ${s.pay.symbol}` : h("span.muted", "–"),
    t.state === "Settled" ? `${fmt(t.bought, s.buy)} ${s.buy.symbol}` : h("span.muted", "–"),
    t.state === "Open" ? (now < t.endTime ? `ends in ${duration(t.endTime - now)}` : "ended") : dateTime(t.endTime),
  ]);
  return h(
    "div",
    header(
      "Tenders",
      `A tender buys ${s.buy.symbol} back at one price. The signers set a budget and a price ladder; holders offer tokens at the lowest price they accept; after the end anyone may settle it, and everyone who sells is paid the same clearing price, never below their own minimum.`,
    ),
    table(
      ["Tender", "State", { text: "Budget", num: true }, { text: "Offers", num: true }, { text: "Clearing price", num: true }, { text: "Bought", num: true }, "Ends"],
      rows,
      "No tender has been opened yet. Signers open one with: npm run v2 -- propose open-tender …",
    ),
  );
}

async function detail(ctx: Ctx, t: Tender): Promise<HTMLElement> {
  const s = ctx.snap;
  const now = s.block.timestamp;
  const { supply, offers } = await tenderDetail(ctx.vault, t);
  const offered = supply.reduce((a, b) => a + b, 0n);
  const spent = t.state === "Settled" ? (t.bought * t.price) / 10n ** BigInt(s.buy.decimals) : 0n;

  const tiles = h(
    "div.grid.grid-4",
    stat("Budget", fmt(t.budget, s.pay), s.pay.symbol, t.state === "Settled" ? `${fmt(spent, s.pay)} spent` : `${fmt(t.reserved, s.pay)} reserved`),
    stat(
      "Clearing price",
      t.state === "Settled" ? fmtPrice(t.price, s.pay) : "–",
      t.state === "Settled" ? `${s.pay.symbol} each` : undefined,
      t.state === "Settled" ? `tick ${t.clearingTick} of ${t.numTicks}` : `ladder ${fmtPrice(price(t, 0), s.pay)} to ${fmtPrice(price(t, t.numTicks - 1), s.pay)} ${s.pay.symbol}`,
    ),
    stat("Offered", fmt(offered, s.buy), s.buy.symbol, `${t.offerCount} of at most ${t.maxOffers} offers`),
    stat(
      t.state === "Settled" ? "Bought" : "Ends",
      t.state === "Settled" ? fmt(t.bought, s.buy) : t.state === "Open" && now < t.endTime ? duration(t.endTime - now) : "Ended",
      t.state === "Settled" ? s.buy.symbol : undefined,
      t.state === "Open" && now >= t.endTime ? "Anyone can settle: npm run v2 -- settle" : dateTime(t.endTime),
    ),
  );

  return h(
    "div",
    h("a.small", { href: "#/tenders" }, "All tenders"),
    h("h1.page-title", { style: "margin-top:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap" }, `Tender #${t.id}`, stateChip(t, now)),
    h(
      "p.page-sub",
      `Holders offered ${s.buy.symbol} at a price tick each; the price climbs from the cheapest offer while the budget pays every offer at or below it.`,
    ),
    tiles,
    h("h2.section-title", "Price ladder", h("span.aside", `${s.buy.symbol} offered at each price, in ${s.pay.symbol}`)),
    h("section.card", ladder(t, supply, s)),
    h("h2.section-title", "Offers", h("span.aside", t.state === "Open" ? "sold amounts appear after settlement" : `${t.claimedCount} of ${t.offerCount} claimed`)),
    offersTable(t, offers, s),
  );
}

function offersTable(t: Tender, offers: Offer[], s: Snapshot): HTMLElement {
  return table(
    ["Offer", "Seller", { text: "Quantity", num: true }, { text: "Lowest price", num: true }, { text: "Sold", num: true }, "Claim"],
    offers.map((o) => [
      `#${o.id}`,
      hash(o.seller, { label: "seller" }),
      fmt(o.quantity, s.buy),
      `${fmtPrice(price(t, o.tick), s.pay)} ${s.pay.symbol}`,
      t.state === "Settled" ? (o.allocation > 0n ? fmt(o.allocation, s.buy) : h("span.muted", "0")) : h("span.muted", "–"),
      o.claimed ? chip("Claimed", "ok") : t.state === "Open" ? chip("Escrowed", "plain", "lock") : chip("Claimable", "wait"),
    ]),
    "No offers yet.",
  );
}

/** One column per price tick: offered (light) with the part bought (accent), the clearing tick marked. */
function ladder(t: Tender, supply: bigint[], s: Snapshot): HTMLElement {
  const W = 720;
  const H = 240;
  const pad = { l: 56, r: 16, t: 26, b: 34 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = supply.length;
  const max = supply.reduce((a, b) => (b > a ? b : a), 0n);
  const scale = (v: bigint) => (max === 0n ? 0 : (Number(v) / Number(max)) * ih);
  const band = iw / n;
  const bw = Math.min(24, Math.max(2, band - 2));
  const settled = t.state === "Settled";
  const filled = (k: number) =>
    !settled ? 0n : k < t.clearingTick ? supply[k]! : k === t.clearingTick ? (t.fillAtClearingTick < supply[k]! ? t.fillAtClearingTick : supply[k]!) : 0n;

  const ns = "http://www.w3.org/2000/svg";
  const el = (tag: string, a: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  };
  /** A column with a 4px rounded top and a square foot on the baseline. */
  const column = (x: number, hgt: number, cls: string) => {
    if (hgt <= 0) return el("g", {});
    const r = Math.min(4, hgt, bw / 2);
    const y = pad.t + ih - hgt;
    return el("path", {
      class: cls,
      d: `M${x},${pad.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${pad.t + ih} Z`,
    });
  };

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Price ladder of tender ${t.id}` }) as SVGSVGElement;
  // recessive grid: baseline and two levels
  for (const f of [0, 0.5, 1]) {
    const y = pad.t + ih - f * ih;
    svg.append(el("line", { class: "axis", x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
    if (max > 0n) {
      svg.append(el("text", { class: "tick-label", x: pad.l - 8, y: y + 4, "text-anchor": "end" }, fmt((max * BigInt(Math.round(f * 100))) / 100n, s.buy)));
    }
  }
  const every = Math.max(1, Math.ceil(n / 8));
  const wrap = h("div.chart");
  const tip = h("div.tooltip", { role: "status" });
  for (let k = 0; k < n; k++) {
    const x = pad.l + k * band + (band - bw) / 2;
    const g = el("g", { class: "bar-group" });
    g.append(column(x, scale(supply[k]!), "bar-offered"), column(x, scale(filled(k)), "bar-filled"));
    svg.append(g);
    if (k % every === 0) {
      svg.append(el("text", { class: "tick-label", x: x + bw / 2, y: H - 12, "text-anchor": "middle" }, fmtPrice(price(t, k), s.pay)));
    }
    const hit = el("rect", { class: "hit", x: pad.l + k * band, y: pad.t, width: band, height: ih, tabindex: 0 });
    const show = () => {
      g.classList.add("is-hover");
      tip.replaceChildren(
        h("strong", `${fmt(supply[k]!, s.buy)} ${s.buy.symbol}`),
        h("div.muted", `offered at ${fmtPrice(price(t, k), s.pay)} ${s.pay.symbol} (tick ${k})`),
        ...(settled ? [h("div", `${fmt(filled(k), s.buy)} bought`)] : []),
      );
      const left = ((x + bw / 2) / W) * 100;
      tip.style.left = `calc(${left}% - 75px)`;
      tip.style.top = "0px";
      tip.classList.add("show");
    };
    const hide = () => {
      g.classList.remove("is-hover");
      tip.classList.remove("show");
    };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("focus", show);
    hit.addEventListener("blur", hide);
    svg.append(hit);
  }
  if (settled) {
    const cx = pad.l + t.clearingTick * band + band / 2;
    // behind the columns, so it marks the price without cutting through the bar
    svg.insertBefore(el("line", { class: "clearing-line", x1: cx, x2: cx, y1: pad.t - 8, y2: pad.t + ih }), svg.querySelector(".bar-group"));
    const right = cx > W * 0.7;
    svg.append(
      el(
        "text",
        { class: "clearing-label", x: cx + (right ? -6 : 6), y: pad.t - 10, "text-anchor": right ? "end" : "start" },
        `clears at ${fmtPrice(t.price, s.pay)} ${s.pay.symbol}`,
      ),
    );
  }
  wrap.append(svg, tip);

  const legend = h(
    "div.legend",
    h("span", h("i", { style: "background:var(--accent-border)" }), "Offered"),
    settled ? h("span", h("i", { style: "background:var(--accent)" }), "Bought") : null,
  );
  const tableView = h(
    "details",
    { style: "margin-top:12px" },
    h("summary.small", { style: "cursor:pointer;color:var(--muted)" }, "Show as a table"),
    table(
      [{ text: "Tick", num: true }, { text: `Price (${s.pay.symbol})`, num: true }, { text: `Offered (${s.buy.symbol})`, num: true }, { text: "Bought", num: true }],
      supply.map((v, k) => [String(k), fmtPrice(price(t, k), s.pay), fmt(v, s.buy), settled ? fmt(filled(k), s.buy) : "–"]),
    ),
  );
  if (offeredNone(supply)) return h("div.empty", "No offers yet: the ladder fills in as holders offer.");
  return h("div", wrap, legend, tableView);
}

const offeredNone = (supply: bigint[]) => supply.every((v) => v === 0n);
