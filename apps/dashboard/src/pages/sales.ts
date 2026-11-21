import { encodeFunctionData, parseAbi } from "viem";
import { vaultAbi } from "../../../../scripts/v2/abi.ts";
import { ZERO, type Sale } from "../data.ts";
import { act } from "../wallet/store.ts";
import { type Ctx } from "../main.ts";
import { chip, dateTime, h, hash, stat, table, amount } from "../ui.ts";
import { fmt, header } from "./common.ts";
import { biddingOver } from "./guide.ts";

const closeAbi = parseAbi(["function closeCommit()"]);

function saleChip(x: Sale, now: bigint): HTMLElement {
  if (x.state === "Collected") return chip("Collected", "ok");
  if (x.state === "Active" && biddingOver(x, now)) return chip("Bidding ended", "warn");
  if (x.state === "Cancelled") return chip("Cancelled", "bad");
  if (x.auctionState === "Settled" || x.auctionState === "Failed") return chip("Ready to collect", "warn");
  return chip(x.auctionState ? `Auction: ${x.auctionState.toLowerCase()}` : "Running", "wait");
}

export async function sales(ctx: Ctx): Promise<HTMLElement> {
  const s = ctx.snap;
  const collect = (x: Sale) => {
    const b = h("button.btn.btn-small.btn-primary", { type: "button" }, "Collect");
    b.addEventListener("click", () =>
      void act("Collect a sealed sale", [{ to: ctx.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "collectSealedSale", args: [x.auction] }), label: "Bring the proceeds and unsold fUSD home" }], ctx.reload),
    );
    return b;
  };
  // Bidding is over but nobody closed the auction yet: anyone may (no bids: it fails, then Collect).
  const close = (x: Sale) => {
    const b = h("button.btn.btn-small", { type: "button" }, "Close bidding");
    b.addEventListener("click", () =>
      void act("Close a sealed sale's bidding", [{ to: x.auction, data: encodeFunctionData({ abi: closeAbi, functionName: "closeCommit" }), label: "Close the auction's bidding" }], ctx.reload),
    );
    return b;
  };
  const now = s.block.timestamp;
  const collected = s.sales.filter((x) => x.state === "Collected");
  const sold = collected.reduce((a, x) => a + (x.supply - x.returned), 0n);
  const got = collected.reduce((a, x) => a + x.proceeds, 0n);
  // PEAL-T received per whole fUSD sold, across collected sales
  const rate = sold > 0n ? (got * 10n ** BigInt(s.pay.decimals)) / sold : 0n;

  const rows = s.sales.map((x) => {
    const net = x.supply - x.returned;
    const each = x.state === "Collected" && net > 0n ? (x.proceeds * 10n ** BigInt(s.pay.decimals)) / net : 0n;
    return [
      hash(x.auction, { label: "auction address" }),
      saleChip(x, now),
      `${fmt(x.supply, s.pay)} ${s.pay.symbol}`,
      x.state === "Collected" ? `${fmt(x.proceeds, s.buy)} ${s.buy.symbol}` : h("span.muted", "–"),
      x.state === "Collected" || x.state === "Cancelled" ? `${fmt(x.returned, s.pay)} ${s.pay.symbol}` : h("span.muted", "–"),
      each > 0n ? `${amount(each, s.buy.decimals, 2)} ${s.buy.symbol}` : h("span.muted", "–"),
      x.state === "Active" && (x.auctionState === "Settled" || x.auctionState === "Failed")
        ? collect(x)
        : x.state === "Active" && biddingOver(x, now)
          ? close(x)
          : x.endTime
          ? h("span.small.muted", `bids close ${dateTime(x.endTime)}`)
          : dateTime(x.startedAt),
    ];
  });

  return h(
    "div",
    header(
      "Sealed sales",
      `A buyback can also run on Peal Sealed Auction. The vault sells ${s.pay.symbol} for ${s.buy.symbol} as the auction's issuer: a bid of "X ${s.buy.symbol} per ${s.pay.symbol}" is an offer to sell ${s.buy.symbol} at 1/X, bids stay sealed until the close, and the auction clears at one price. Proceeds and unsold ${s.pay.symbol} can only go back to the vault.`,
    ),
    h(
      "div.grid.grid-3",
      stat("Sales", String(s.sales.length), undefined, `${s.sales.filter((x) => x.state === "Active" && !biddingOver(x, now)).length} running`),
      stat(`${s.pay.symbol} sold`, fmt(sold, s.pay), s.pay.symbol, `in ${collected.length} collected sale${collected.length === 1 ? "" : "s"}`),
      stat(
        `${s.buy.symbol} bought back`,
        fmt(got, s.buy),
        s.buy.symbol,
        rate > 0n ? `about ${amount(rate, s.buy.decimals, 2)} ${s.buy.symbol} per ${s.pay.symbol}` : "No sale collected yet",
      ),
    ),
    h("h2.section-title", "Sales", h("span.aside", s.factory === ZERO ? "sealed sales are off" : h("span", "factory ", hash(s.factory, { label: "auction factory" })))),
    table(
      ["Auction", "State", { text: "Supply", num: true }, { text: "Proceeds", num: true }, { text: "Unsold back", num: true }, { text: "Per fUSD", num: true }, ""],
      rows,
      "No sealed sale yet. Signers start one with: npm run v2 -- propose start-sale sale.json",
    ),
  );
}
