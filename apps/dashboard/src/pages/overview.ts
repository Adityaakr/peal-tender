import { type Ctx } from "../main.ts";
import { chip, duration, h, hash, meter, stat } from "../ui.ts";
import { feedItem, fmt, signerName } from "./common.ts";

export async function overview(ctx: Ctx): Promise<HTMLElement> {
  const s = ctx.snap;
  const now = s.block.timestamp;
  const pending = s.ops.filter((o) => o.state === "Queued" && !o.void && !o.lapsed);
  const next = pending.map((o) => o.eta).sort((a, b) => (a < b ? -1 : 1))[0];
  const spent = s.pay.cap > s.pay.left ? s.pay.cap - s.pay.left : 0n;
  const usedFrac = s.pay.cap > 0n ? Number(spent) / Number(s.pay.cap) : 1;
  const usable = s.members.filter((m) => m.usable).length;
  const openTender = s.tenders.find((t) => t.id === s.openTenderId);
  const activeSales = s.sales.filter((x) => x.state === "Active").length;

  const intro = h(
    "div",
    h("h1.page-title", "The treasury"),
    h(
      "p.page-sub",
      h("span.hero-mark", `${s.threshold} of ${s.members.length}`),
      " post-quantum signers hold this vault. Every move needs their ML-DSA-87 signatures, checked on chain by ",
      h("span.mono", "pqcVerify"),
      ". A stolen classical key moves nothing.",
    ),
  );

  const tiles = h(
    "div.grid.grid-4",
    stat(`${s.pay.symbol} free`, fmt(s.pay.free, s.pay), s.pay.symbol, s.reservedPay > 0n ? `${fmt(s.reservedPay, s.pay)} reserved for a tender` : "Nothing reserved"),
    stat(`${s.buy.symbol} bought back`, fmt(s.buy.balance - s.escrowedBuy, s.buy), s.buy.symbol, s.escrowedBuy > 0n ? `plus ${fmt(s.escrowedBuy, s.buy)} held for sellers` : "Held by the vault"),
    stat(
      "Left to spend today",
      fmt(s.pay.left, s.pay),
      s.pay.symbol,
      `of a ${fmt(s.pay.cap, s.pay)} daily allowance; more waits ${duration(s.delay)}`,
      meter(usedFrac, usedFrac >= 1 ? "full" : "", "share of today's allowance spent"),
    ),
    stat(
      "Changes waiting",
      String(pending.length),
      undefined,
      next === undefined ? "Nothing queued" : next <= now ? "One is ready to execute" : `Next is ready in ${duration(next - now)}`,
    ),
  );

  const feed = h("ul.feed", h("li", h("span"), h("div.muted.small", "Reading the vault's history…"), h("span")));
  const recent = h(
    "section.card.flush",
    h("div.card-head", { style: "padding:16px 20px 0" }, h("h3", "Recent activity"), h("a.small", { href: "#/activity" }, "All activity")),
    feed,
  );
  void ctx.activity().then((list) => {
    feed.replaceChildren(...(list.length ? list.slice(0, 7).map((a) => feedItem(a, s)) : [h("li", h("span"), h("div.muted.small", "No activity yet."), h("span"))]));
  });

  const signerCard = h(
    "section.card",
    h(
      "div.card-head",
      h("h3", "Signers"),
      h("span.quorum-dots", { title: `${s.threshold} of ${s.members.length} must sign` }, ...s.members.map((_, i) => h(`i${i < s.threshold ? ".on" : ""}`))),
    ),
    h(
      "div",
      ...s.members.map((m) =>
        h(
          "div",
          { style: "display:flex;justify-content:space-between;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--border)" },
          h("div", h("div.small", { style: "font-weight:500" }, signerName(s, m.address)), hash(m.address, { label: "signer address" })),
          m.usable ? chip("Can sign", "ok") : chip("Cannot sign", "bad"),
        ),
      ),
    ),
    h("p.small.muted", { style: "margin:10px 0 0" }, `${usable} of ${s.members.length} keys usable now. `, h("a", { href: "#/signers" }, "Keys")),
  );

  const buybacks = h(
    "section.card",
    h("div.card-head", h("h3", "Buybacks")),
    h(
      "dl.kv",
      h("dt", "Open tender"),
      h("dd", openTender ? h("a", { href: `#/tenders/${openTender.id}` }, `#${openTender.id}, ${fmt(openTender.budget, s.pay)} ${s.pay.symbol} budget`) : "None"),
      h("dt", "Tenders run"),
      h("dd", String(s.tenders.length)),
      h("dt", "Sealed sales"),
      h("dd", activeSales ? `${activeSales} running, ${s.sales.length} in all` : String(s.sales.length)),
    ),
  );

  const rules = h(
    "section.card",
    h("div.card-head", h("h3", "The rules")),
    h(
      "ul.small",
      { style: "margin:0;padding-left:18px;color:var(--text-2)" },
      h("li", `${s.threshold} of ${s.members.length} signatures for every sweep, tender and sale.`),
      h("li", `At most ${fmt(s.pay.cap, s.pay)} ${s.pay.symbol} a day leaves at once; more waits ${duration(s.delay)}.`),
      h("li", "Signer changes always wait. Any one signer can veto."),
      h("li", "Anyone can settle a finished tender or collect a sale."),
    ),
  );

  return h("div", intro, tiles, h("div.split", { style: "margin-top:16px" }, recent, h("div.grid", signerCard, buybacks, rules)));
}
