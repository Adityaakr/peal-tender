/** Shared wording for the pages: events in plain words, signer names, amounts. */
import { type Address } from "viem";
import { type Activity, type Snapshot, type Token } from "../data.ts";
import { amount, ago, h, hash, icon, short, type Tone } from "../ui.ts";

export function fmt(v: bigint, t: Token): string {
  return amount(v, t.decimals, t.decimals > 6 ? 4 : 6);
}

/** A price: at least two decimals, so 1.2 reads as 1.20. */
export function fmtPrice(v: bigint, t: Token): string {
  const s = amount(v, t.decimals, t.decimals > 6 ? 4 : 6);
  const [i, f = ""] = s.split(".");
  return `${i}.${f.padEnd(2, "0")}`;
}

export function tokenOf(s: Snapshot, a: unknown): Token | undefined {
  const x = String(a).toLowerCase();
  return [s.pay, s.buy, s.native].find((t) => t.address.toLowerCase() === x);
}

/** "Signer 1" to "Signer n", in the set's ascending order; others by short address. */
export function signerName(s: Snapshot, a: Address): string {
  const i = s.members.findIndex((m) => m.address.toLowerCase() === a.toLowerCase());
  return i >= 0 ? `Signer ${i + 1}` : short(a);
}

const KIND_TITLES: Record<string, string> = {
  Sweep: "Large sweep",
  SetSigners: "Change the signers",
  SetDelay: "Change the delay",
  SetDailyCap: "Change a daily allowance",
  SetAuctionFactory: "Change the auction factory",
};

export function kindTitle(k: string): string {
  return KIND_TITLES[k] ?? k;
}

export interface Described {
  text: string;
  icon: string;
  tone: Tone;
  group: "money" | "timelock" | "tenders" | "sales" | "signers";
}

export function describe(a: Activity, s: Snapshot): Described {
  const x = a.args;
  const money = (v: unknown, t: unknown) => {
    const k = tokenOf(s, t);
    return k ? `${fmt(v as bigint, k)} ${k.symbol}` : String(v);
  };
  switch (a.name) {
    case "Swept":
      return {
        text: `Sent ${money(x.amount, x.token)} to ${short(String(x.to))}${x.timelocked ? " after the timelock" : ""}`,
        icon: "arrow",
        tone: "plain",
        group: "money",
      };
    case "Deposited":
      return { text: `Pulled ${money(x.amount, s.pay.address)} from ${short(String(x.from))}`, icon: "coin", tone: "ok", group: "money" };
    case "NativeReceived":
      return { text: `Received ${money(x.amount, s.native.address)}`, icon: "coin", tone: "ok", group: "money" };
    case "OpQueued":
      return { text: `Queued change #${x.opId}: ${kindTitle(String(["SetSigners", "SetDelay", "SetDailyCap", "SetAuctionFactory", "Sweep"][Number(x.kind)]))}`, icon: "clock", tone: "wait", group: "timelock" };
    case "OpExecuted":
      return { text: `Executed change #${x.opId}`, icon: "check", tone: "ok", group: "timelock" };
    case "OpVetoed":
      return { text: `${signerName(s, x.by as Address)} vetoed change #${x.opId}`, icon: "cross", tone: "bad", group: "timelock" };
    case "SignerSetChanged":
      return { text: `Signer set is now ${x.threshold} of ${(x.members as unknown[]).length}`, icon: "key", tone: "plain", group: "signers" };
    case "DelayChanged":
      return { text: `Timelock delay set to ${x.delay} seconds`, icon: "clock", tone: "plain", group: "timelock" };
    case "DailyCapChanged": {
      const k = tokenOf(s, x.token);
      return { text: `Daily allowance of ${k?.symbol ?? short(String(x.token))} set to ${k ? fmt(x.cap as bigint, k) : x.cap}`, icon: "lock", tone: "plain", group: "timelock" };
    }
    case "AuctionFactoryChanged":
      return { text: `Auction factory set to ${short(String(x.factory))}`, icon: "gavel", tone: "plain", group: "sales" };
    case "TenderOpened":
      return { text: `Opened tender #${x.tenderId} with a budget of ${money(x.budget, s.pay.address)}`, icon: "doc", tone: "wait", group: "tenders" };
    case "OfferPlaced":
      return { text: `Offer on tender #${x.tenderId}: ${money(x.quantity, s.buy.address)} from ${short(String(x.seller))}`, icon: "coin", tone: "plain", group: "tenders" };
    case "TenderSettled":
      return { text: `Tender #${x.tenderId} cleared at ${money(x.price, s.pay.address)}, bought ${money(x.bought, s.buy.address)}`, icon: "check", tone: "ok", group: "tenders" };
    case "TenderFailed":
      return { text: `Tender #${x.tenderId} closed without a sale (${x.reason})`, icon: "cross", tone: "bad", group: "tenders" };
    case "Claimed":
      return { text: `Seller ${short(String(x.seller))} claimed on tender #${x.tenderId}: paid ${money(x.paid, s.pay.address)}`, icon: "coin", tone: "plain", group: "tenders" };
    case "SealedSaleStarted":
      return { text: `Started a sealed sale of ${money(x.supply, s.pay.address)}`, icon: "gavel", tone: "wait", group: "sales" };
    case "SealedSaleCancelled":
      return { text: `Cancelled a sealed sale; ${money(x.returned, s.pay.address)} came back`, icon: "cross", tone: "bad", group: "sales" };
    case "SealedSaleCollected":
      return { text: `Collected a sealed sale: ${money(x.proceeds, s.buy.address)} bought, ${money(x.returned, s.pay.address)} unsold`, icon: "check", tone: "ok", group: "sales" };
    default:
      return { text: a.name, icon: "dot", tone: "plain", group: "money" };
  }
}

export function feedItem(a: Activity, s: Snapshot): HTMLElement {
  const d = describe(a, s);
  const meta = h("div.meta");
  if (a.signers?.length) meta.append(`Signed by ${a.signers.map((x) => signerName(s, x)).join(" and ")} · `);
  meta.append("tx ", hash(a.txHash, { label: "transaction hash" }));
  return h(
    "li",
    h(`span.icon${d.tone === "ok" ? ".ok" : d.tone === "bad" ? ".bad" : ""}`, icon(d.icon)),
    h("div", h("div.what", d.text), meta),
    h("span.when", a.timestamp ? ago(a.timestamp, s.block.timestamp) : `block ${a.blockNumber}`),
  );
}

export function header(title: string, sub: string | Node): HTMLElement {
  return h("div", h("h1.page-title", title), h("p.page-sub", sub));
}
