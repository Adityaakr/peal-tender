/**
 * guide.ts - "How to use Peal Tender": who can do what, step by step, from the
 * vault's live state. `plan` is pure (snapshot + wallet in, steps out) so the same
 * steps drive the app's guide page and the landing page's section, and are tested
 * offline (test-ts/guide.test.ts). A step says whether it can be done right now; one
 * that cannot says why and what makes it possible.
 */
import { AUCTION_REPO, DASHBOARD_FAUCET, QOREX_HELP, REPO } from "../links.ts";
import type { Snapshot, Tender } from "../data.ts";
import type { WalletState } from "../wallet/store.ts"; // type only: erased
import { amount, chip, dateTime, duration, h } from "../ui.ts";
import { fmt, fmtPrice } from "./common.ts";

export type StepState = "now" | "done" | "later" | "info";

export interface Step {
  title: string;
  /** What it is and what the live state is, in one or two sentences. */
  text: string;
  state: StepState;
  /** A short live status, e.g. "open until 25 Nov, 12:01". */
  status?: string;
  /** Where to do it: an in-app route (#/…), an outside link, or the wallet panel. */
  action?: { label: string; href?: string; wallet?: true; external?: true };
  /** A command a signer runs on their own machine. */
  command?: string;
}

export interface Role {
  id: "visitor" | "holder" | "anyone" | "signer";
  who: string;
  summary: string;
  steps: Step[];
}

/** Native QOR a guest account needs: its key registration, a window, and two EVM transactions. */
/**
 * uqor, 1.5 QOR: what a holder's whole path costs on the testnet (measured 21 November
 * 2026): 0.15 to register the ML-DSA-87 key, then about 0.32 per action (a window opened
 * and closed at 0.15 QOR each, plus gas), for getting PEAL-T, offering, settling and claiming.
 */
export const GUEST_QOR_NEEDED = 1_500_000n;

/** A sealed sale whose bidding time is over while the auction still says it is open: anyone may close it. */
export function biddingOver(x: { auctionState?: string; endTime?: bigint }, now: bigint): boolean {
  return x.auctionState === "Open for bids" && x.endTime !== undefined && x.endTime <= now;
}

const priceAt = (t: Tender, tick: number) => t.floorPrice + BigInt(tick) * t.tickSize;

export function plan(s: Snapshot, w: Pick<WalletState, "guest" | "guestStatus" | "qorex">): Role[] {
  const now = s.block.timestamp;
  const open = s.tenders.find((t) => t.id === s.openTenderId && t.state === "Open");
  const running = open && now < open.endTime ? open : undefined;
  const ended = open && now >= open.endTime ? open : undefined;
  const settled = [...s.tenders].reverse().find((t) => t.state === "Settled");
  const unclaimed = settled ? settled.offerCount - settled.claimedCount : 0;
  const usable = s.members.filter((m) => m.usable).length;
  const pending = s.ops.filter((o) => o.state === "Queued" && !o.void && !o.lapsed);
  const activeSales = s.sales.filter((x) => x.state === "Active");
  const collectable = activeSales.filter((x) => x.auctionState === "Settled" || x.auctionState === "Failed");
  const pay = (v: bigint) => `${fmt(v, s.pay)} ${s.pay.symbol}`;

  // ---- visitors
  const visitor: Role = {
    id: "visitor",
    who: "Visitors",
    summary: "Read the live vault. Nothing to install; this page reads the chain directly.",
    steps: [
      {
        title: "See what the vault holds",
        text: `${pay(s.pay.free)} free to spend, ${pay(s.reservedPay)} reserved for a tender, and ${fmt(s.buy.balance - s.escrowedBuy, s.buy)} ${s.buy.symbol} bought back. At most ${pay(s.pay.left)} more can leave today without the time lock.`,
        state: "now",
        action: { label: "Overview", href: "#/vault" },
      },
      {
        title: "Check the signers' post-quantum keys",
        text: `${s.threshold} of ${s.members.length} signers must sign every payment. ${usable} of ${s.members.length} ML-DSA-87 keys are registered on chain with proof of possession; the vault reads them with pqcKeyStatus at every check.`,
        state: "now",
        action: { label: "Signers and keys", href: "#/signers" },
      },
      {
        title: "Watch the time lock",
        text:
          pending.length > 0
            ? `${pending.length} change${pending.length === 1 ? "" : "s"} waiting. Large payments and signer changes wait ${duration(s.delay)}, and any one signer can veto.`
            : `Nothing waiting. Large payments and signer changes wait ${duration(s.delay)}, and any one signer can veto them.`,
        state: "now",
        action: { label: "Time lock", href: "#/timelock" },
      },
      {
        title: "Follow every transaction",
        text: "Each sweep, tender and sale is an event on chain, listed with its transaction.",
        state: "now",
        action: { label: "Activity", href: "#/activity" },
      },
    ],
  };

  // ---- token holders
  const st = w.guestStatus;
  const funded = st ? st.qor >= GUEST_QOR_NEEDED : false;
  const holderSteps: Step[] = [
    {
      title: "Get an account",
      text: w.guest
        ? "Your guest account lives only in this browser. Its secp256k1 and ML-DSA-87 keys never leave it."
        : "Create a guest account in this browser (it registers its own ML-DSA-87 key), or connect QoreX to fund one.",
      state: w.guest ? "done" : "now",
      status: w.guest ? "guest account ready" : w.qorex ? "QoreX connected" : undefined,
      action: { label: w.guest ? "Open your wallet" : "Create a guest account", wallet: true },
    },
    {
      title: "Get test QOR",
      text: `The account needs about ${amount(GUEST_QOR_NEEDED, 6, 2)} QOR for the whole path: 0.15 to register its key, then about 0.3 per action, because each one opens and closes a scoped EVM window. Claim it from the QoreChain dashboard faucet to the account's qor1 address, or send it from QoreX.`,
      state: funded ? "done" : "now",
      status: st ? `${amount(st.qor, st.qorDecimals, 4)} QOR in the account` : undefined,
      action: { label: "Dashboard faucet", href: DASHBOARD_FAUCET, external: true },
    },
    {
      title: `Get test ${s.buy.symbol}`,
      text: `${s.buy.symbol} is the token the vault buys back. One click in the wallet panel claims 1,000 from a test-token faucet contract on the testnet (deployed with Peal Sealed Auction); no other site is needed.`,
      state: w.guest ? "now" : "later",
      status: w.guest ? undefined : "after the account exists",
      action: { label: `Get test ${s.buy.symbol}`, wallet: true },
    },
  ];
  if (running) {
    holderSteps.push({
      title: `Offer ${s.buy.symbol} into tender #${running.id}`,
      text: `Pick the lowest price you accept on the ladder (${fmtPrice(priceAt(running, 0), s.pay)} to ${fmtPrice(priceAt(running, running.numTicks - 1), s.pay)} ${s.pay.symbol} per ${s.buy.symbol}). Your tokens wait in the vault; the budget is ${pay(running.budget)}.`,
      state: "now",
      status: `open until ${dateTime(running.endTime)} · ${running.offerCount} of ${running.maxOffers} offers`,
      action: { label: `Open tender #${running.id}`, href: `#/tenders/${running.id}` },
    });
  } else {
    holderSteps.push({
      title: `Offer ${s.buy.symbol} into a tender`,
      text: ended
        ? `Tender #${ended.id} has ended and takes no more offers. The signers open the next one; it will appear here.`
        : "No tender is open right now. Two signers open one with a budget and a price ladder (npm run v2 -- propose open-tender …); it will appear here.",
      state: "later",
      status: ended ? `tender #${ended.id} ended ${dateTime(ended.endTime)}` : "no open tender",
      action: { label: "Tenders", href: "#/tenders" },
    });
  }

  // ---- anyone: settle and claim, sealed sales
  const anyoneSteps: Step[] = [];
  if (ended) {
    anyoneSteps.push({
      title: `Settle tender #${ended.id}`,
      text: "The clearing rule is fixed, so no key holder is needed: one transaction sets one price for every seller.",
      state: "now",
      status: `ended ${dateTime(ended.endTime)}`,
      action: { label: `Settle #${ended.id}`, href: `#/tenders/${ended.id}` },
    });
  } else if (running) {
    anyoneSteps.push({
      title: `Settle tender #${running.id} when it ends`,
      text: "After the end, anyone may settle it: every seller at or below the clearing price is paid that one price, never below their own minimum.",
      state: "later",
      status: `possible from ${dateTime(running.endTime)} (in ${duration(running.endTime - now)})`,
      action: { label: `Tender #${running.id}`, href: `#/tenders/${running.id}` },
    });
  }
  anyoneSteps.push(
    settled && unclaimed > 0
      ? {
          title: `Claim from tender #${settled.id}`,
          text: `It cleared at ${fmtPrice(settled.price, s.pay)} ${s.pay.symbol}. Anyone can pay out an offer to its seller: sold tokens become ${s.pay.symbol}, the rest goes back.`,
          state: "now",
          status: `${unclaimed} offer${unclaimed === 1 ? "" : "s"} not yet claimed`,
          action: { label: `Tender #${settled.id}`, href: `#/tenders/${settled.id}` },
        }
      : {
          title: "Claim after a tender settles",
          text: `Once a tender is settled, each offer is paid out at the clearing price${settled ? `; tender #${settled.id} is fully claimed` : ""}.`,
          state: "later",
          status: running ? `after tender #${running.id} settles` : undefined,
          action: { label: "Tenders", href: "#/tenders" },
        },
  );
  if (activeSales.length > 0) {
    const x = activeSales[0]!;
    anyoneSteps.push({
      title: "See a sealed buyback on Peal Sealed Auction",
      text: biddingOver(x, now)
        ? `The vault sold ${pay(x.supply)} for ${s.buy.symbol} as the auction's issuer. Bidding has ended: anyone can close it on the Sealed sales page, and a sale without bids then returns its ${s.pay.symbol} to the vault.`
        : `The vault is selling ${pay(x.supply)} for ${s.buy.symbol} as the auction's issuer. Bids stay sealed until the close and clear at one price; bidding happens in Peal Sealed Auction.`,
      state: "now",
      status: biddingOver(x, now) ? `bidding ended ${dateTime(x.endTime!)}` : x.endTime && x.endTime > now ? `bids close ${dateTime(x.endTime)}` : x.auctionState ? `auction ${x.auctionState.toLowerCase()}` : undefined,
      action: { label: "Sealed sales", href: "#/sales" },
    });
  } else {
    anyoneSteps.push({
      title: "See a sealed buyback on Peal Sealed Auction",
      text: `No sealed sale is running. ${s.sales.length > 0 ? `${s.sales.length} ran before; ` : ""}signers start one with npm run v2 -- propose start-sale.`,
      state: "later",
      action: { label: "Sealed sales", href: "#/sales" },
    });
  }
  if (collectable.length > 0) {
    anyoneSteps.push({
      title: "Collect a finished sale",
      text: "The auction has finished: anyone can bring the proceeds and any unsold fUSD back to the vault.",
      state: "now",
      status: `${collectable.length} ready`,
      action: { label: "Collect", href: "#/sales" },
    });
  }

  // ---- signers
  const signer: Role = {
    id: "signer",
    who: "Treasury signers",
    summary: "Keys never touch this page. The app builds and checks proposals; signers sign them on their own machines.",
    steps: [
      {
        title: "Build a proposal",
        text: "A sweep, a tender, a sale or a queued change, as a file. The builder here writes the same file as the CLI.",
        state: "now",
        action: { label: "Propose", href: "#/propose" },
        command: "npm run v2 -- propose open-tender <budget> … --as <name>",
      },
      {
        title: "Sign it with ML-DSA-87",
        text: `Each signer adds a share on their own machine; the proposer's signature (QoreSign) is checked first. ${s.threshold} of ${s.members.length} shares are needed.`,
        state: "info",
        command: "npm run sign-action -- <file> --as <name>",
      },
      {
        title: "Relay it",
        text: "Any account relays it in a window scoped to the vault's contracts; the relayer pays gas and has no authority. The vault checks every share with pqcVerify.",
        state: "info",
        status: `next nonce ${s.nonce}`,
        command: "npm run v2 -- relay <file>",
      },
    ],
  };

  return [
    visitor,
    { id: "holder", who: `${s.buy.symbol} holders`, summary: `Sell ${s.buy.symbol} to the treasury at one fair price.`, steps: holderSteps },
    { id: "anyone", who: "Anyone, no keys needed", summary: "Finish what the rules already decide.", steps: anyoneSteps },
    signer,
  ];
}

// ---------------------------------------------------------------- rendering

const STATE_CHIP: Record<StepState, () => HTMLElement> = {
  now: () => chip("You can do this now", "ok"),
  done: () => chip("Done", "ok", "check"),
  later: () => chip("Not yet", "wait"),
  info: () => chip("On your machine", "plain", "lock"),
};

function stepEl(st: Step, i: number, openWallet: () => void): HTMLElement {
  let act: HTMLElement | null = null;
  if (st.action?.wallet) {
    act = h("button.btn.btn-small", { type: "button" }, st.action.label);
    act.addEventListener("click", openWallet);
  } else if (st.action?.href) {
    act = h(
      `a.btn.btn-small${st.state === "now" ? ".btn-primary" : ""}`,
      st.action.external ? { href: st.action.href, target: "_blank", rel: "noopener" } : { href: st.action.href },
      st.action.label,
    );
  }
  return h(
    `li.guide-step.is-${st.state}`,
    h("span.guide-num", String(i + 1)),
    h(
      "div.guide-body",
      h("div.guide-row", h("h4.guide-title", st.title), STATE_CHIP[st.state]()),
      h("p.guide-text", st.text),
      st.status ? h("p.guide-status", st.status) : null,
      st.command ? h("code.guide-cmd", st.command) : null,
      act ? h("div.guide-act", act) : null,
    ),
  );
}

export function guideRoles(roles: Role[], openWallet: () => void): HTMLElement {
  return h(
    "div.guide-roles",
    ...roles.map((r) =>
      h(
        `section.guide-role.card`,
        { id: `guide-${r.id}` },
        h("header.guide-role-head", h("h3", r.who), h("p.small.muted", r.summary)),
        h("ol.guide-steps", ...r.steps.map((st, i) => stepEl(st, i, openWallet))),
      ),
    ),
  );
}

/** The guide page in the app. */
export function guidePage(s: Snapshot, w: WalletState, openWallet: () => void): HTMLElement {
  return h(
    "div",
    h("h1.page-title", "How to use Peal Tender"),
    h(
      "p.page-sub",
      "What each person can do with this vault on the QoreChain testnet, step by step. Every line reads the vault now; a step that is not possible yet says what opens it. Test tokens have no value. Help for QoreX: ",
      h("a", { href: QOREX_HELP, target: "_blank", rel: "noopener" }, "docs"),
      ". Peal Sealed Auction: ",
      h("a", { href: AUCTION_REPO, target: "_blank", rel: "noopener" }, "repository"),
      ". Source: ",
      h("a", { href: REPO, target: "_blank", rel: "noopener" }, "Peal Tender"),
      ".",
    ),
    guideRoles(plan(s, w), openWallet),
  );
}
