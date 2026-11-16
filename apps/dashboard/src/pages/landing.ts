/**
 * The landing page: what Peal Tender is, why it matters before Q-Day, how it works,
 * who uses it, and how to try it in a few steps. Live figures when a vault is known.
 */
import { REPO } from "../config.ts";
import { type Ctx } from "../main.ts";
import { duration, h, icon } from "../ui.ts";
import { openPanel, state as wallet } from "../wallet/store.ts";
import { fmt } from "./common.ts";

const NS = "http://www.w3.org/2000/svg";

function svg(tag: string, a: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The hero picture: three signers, two sign, the chain checks, funds move or wait. */
function heroArt(): SVGSVGElement {
  const s = svg("svg", { viewBox: "0 0 440 320", role: "img", "aria-label": "Two of three signers sign; the chain checks with pqcVerify; the treasury acts" }) as SVGSVGElement;
  s.classList.add("hero-art");
  const card = (x: number, y: number, w: number, hgt: number) =>
    svg("rect", { x, y, width: w, height: hgt, rx: 14, fill: "#fff", stroke: "#e5e7eb" });
  // signers
  const signers: [number, boolean][] = [
    [40, true],
    [150, true],
    [260, false],
  ];
  for (const [x, on] of signers) {
    s.append(card(x, 20, 96, 64));
    s.append(svg("circle", { cx: x + 26, cy: 52, r: 12, fill: on ? "#2563eb" : "#fff", stroke: "#2563eb", "stroke-width": 2 }));
    s.append(svg("text", { x: x + 46, y: 48, "font-size": 12, "font-weight": 600, fill: "#111827" }, "Signer"));
    s.append(svg("text", { x: x + 46, y: 64, "font-size": 11, fill: on ? "#16a34a" : "#9ca3af" }, on ? "signed" : "idle"));
    if (on) s.append(svg("path", { d: `M${x + 48},84 C${x + 48},120 220,110 220,140`, fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  }
  // the chain check
  s.append(card(130, 140, 180, 70));
  s.append(svg("text", { x: 220, y: 166, "text-anchor": "middle", "font-size": 12, fill: "#6b7280" }, "QoreChain checks"));
  s.append(svg("text", { x: 220, y: 188, "text-anchor": "middle", "font-size": 14, "font-weight": 600, "font-family": "ui-monospace, Menlo, monospace", fill: "#111827" }, "pqcVerify ✓ ✓"));
  // outcomes
  s.append(svg("path", { d: "M180,210 C180,240 110,236 110,250", fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  s.append(svg("path", { d: "M260,210 C260,240 330,236 330,250", fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  s.append(card(30, 250, 160, 56));
  s.append(svg("text", { x: 110, y: 274, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: "#111827" }, "Within today's allowance"));
  s.append(svg("text", { x: 110, y: 292, "text-anchor": "middle", "font-size": 11, fill: "#16a34a" }, "moves now"));
  s.append(card(250, 250, 160, 56));
  s.append(svg("text", { x: 330, y: 274, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: "#111827" }, "Larger, or a rule change"));
  s.append(svg("text", { x: 330, y: 292, "text-anchor": "middle", "font-size": 11, fill: "#2563eb" }, "waits; one signer can veto"));
  return s;
}

function step(n: number, title: string, body: string | Node, cta?: Node): HTMLElement {
  return h("div.card.step", h("div.step-n", String(n)), h("h3", title), h("p.small.muted", body), cta ?? null);
}

export async function landing(ctx: Partial<Ctx>): Promise<HTMLElement> {
  const s = ctx.snap;
  const tryBtn = h("button.btn.btn-primary", { type: "button" }, icon("key"), wallet.guest ? "Open your wallet" : "Try it with a guest account");
  tryBtn.addEventListener("click", () => openPanel());

  const hero = h(
    "section.hero",
    h(
      "div",
      h("div.eyebrow", "Build Before Q-Day · Post-Quantum dApp"),
      h("h1.hero-title", "A treasury a stolen key ", h("span.hero-mark", "cannot drain"), "."),
      h(
        "p.hero-sub",
        "Peal Tender keeps a project's treasury behind post-quantum signatures. Two of three ML-DSA-87 signers approve every move, QoreChain checks each signature on chain, anything large waits in a public timelock, and buybacks clear at one fair price.",
      ),
      h("div.hero-ctas", h("a.btn.btn-primary", { href: "#/vault" }, "Open the app", icon("arrow")), tryBtn),
      h("div.small.muted", { style: "margin-top:14px" }, "Testnet. Read-only until you choose to act; no wallet needed to look around."),
    ),
    heroArt(),
  );

  const live = s
    ? h(
        "section.live",
        h("div.live-item", h("span.label", `${s.pay.symbol} in the treasury`), h("strong", fmt(s.pay.balance, s.pay))),
        h("div.live-item", h("span.label", `${s.buy.symbol} bought back`), h("strong", fmt(s.buy.balance - s.escrowedBuy, s.buy))),
        h("div.live-item", h("span.label", "Signers"), h("strong", `${s.threshold} of ${s.members.length}`)),
        h("div.live-item", h("span.label", "Timelock"), h("strong", duration(s.delay))),
        h("div.live-item", h("span.label", "Tenders run"), h("strong", String(s.tenders.length))),
      )
    : h("section.live", h("div.live-item", h("span.label", "Live vault"), h("strong", "Deploying on 19 November 2026")));

  const how = h(
    "section",
    h("h2.section-title", "How it works"),
    h(
      "div.grid.grid-3",
      step(1, "Two of three sign", "A treasury action is written once and signed by any two of the three signers, each with their own ML-DSA-87 key, on their own machine. A web page never holds a treasury key."),
      step(2, "The chain checks", h("span", "The vault reads each signer's key from QoreChain's registry and checks every signature with the ", h("span.mono", "pqcVerify"), " precompile. Being the sender is never enough.")),
      step(3, "Small moves now, big moves wait", "Up to a daily allowance moves at once. Anything larger, and every rule change, waits in public; any one signer can veto it, then anyone can execute it."),
    ),
  );

  const drill = h(
    "section.split",
    { style: "margin-top:40px;align-items:center" },
    h(
      "div",
      h("h2.section-title", { style: "margin-top:0" }, "Why post-quantum, now"),
      h(
        "p",
        { style: "color:var(--text-2)" },
        "A large quantum computer could recover a classical (secp256k1) private key from its public key. Funds guarded only by that key would then belong to whoever ran the computation. Peal Tender's first vault took part in QoreChain's Q-Day Drill: the attacker was handed the signer's classical key and every attempt failed.",
      ),
      h("a", { href: `${REPO}/blob/main/THREAT_MODEL.md`, target: "_blank", rel: "noopener" }, "Read the threat model"),
    ),
    h(
      "pre.code",
      h("span.c", "# the attacker, with only the classical key\n"),
      "REFUSED  native transfer\n",
      "REFUSED  open an EVM window\n",
      "REFUSED  re-register the PQ key\n",
      "REFUSED  token approval\n",
      "REFUSED  vault.sweep  (PqSignatureInvalid)\n",
    ),
  );

  const roles = h(
    "section",
    h("h2.section-title", "Who does what"),
    h(
      "div.grid.grid-3",
      h(
        "div.card",
        h("h3", "Treasury signers"),
        h("p.small.muted", "Propose actions in the app or the CLI, sign them with npm run sign-action, and veto anything they do not like."),
        h("a.small", { href: "#/propose" }, "Build a proposal"),
      ),
      h(
        "div.card",
        h("h3", "Token holders"),
        h("p.small.muted", "Offer PEAL-T into a buyback tender at the lowest price you accept. Everyone who sells is paid one clearing price."),
        h("a.small", { href: "#/tenders" }, "See the tenders"),
      ),
      h(
        "div.card",
        h("h3", "Anyone"),
        h("p.small.muted", "Watch every signature and queued change, settle a finished tender, execute a change once its wait is over, and check a proposal's signatures in the browser."),
        h("a.small", { href: "#/activity" }, "Watch the vault"),
      ),
    ),
  );

  const openTender = s?.tenders.find((t) => t.id === s.openTenderId);
  const tryIt = h(
    "section",
    h("h2.section-title", "Try it in four steps", h("span.aside", "testnet, about five minutes")),
    h(
      "div.grid.grid-4",
      step(1, "Make a guest account", "A fresh testnet account in your browser with its own ML-DSA-87 key. Back it up or forget it any time.", (() => {
        const b = h("button.btn.btn-small", { type: "button" }, "Create it");
        b.addEventListener("click", () => openPanel());
        return b;
      })()),
      step(2, "Fund it", "Send test QOR from QoreX in one approval, or claim from the QoreChain dashboard faucet to its address."),
      step(3, "Get test PEAL-T", "One click claims PEAL-T from the demo faucet of Peal Sealed Auction."),
      step(
        4,
        "Offer into a buyback",
        "Pick a quantity and your lowest price. Your account registers its key and opens a short window scoped to the vault, as QoreChain requires.",
        openTender ? h("a.btn.btn-small", { href: `#/tenders/${openTender.id}` }, `Tender #${openTender.id}`) : h("a.btn.btn-small", { href: "#/tenders" }, "Tenders"),
      ),
    ),
  );

  const built = h(
    "section",
    h("h2.section-title", "Built with"),
    h(
      "div.grid.grid-4",
      h("div.card", h("h3", "QoreChain"), h("p.small.muted", "pqcKeyStatus and pqcVerify precompiles, hybrid-signed transactions, scoped EVM windows.")),
      h("div.card", h("h3", "qore-pq-kit"), h("p.small.muted", "Our toolkit: PqAuth and the 2-of-3 PqAuthSet, used by tag v0.3.0."), h("a.small", { href: "https://github.com/Adityaakr/qore-pq-kit", target: "_blank", rel: "noopener" }, "Source")),
      h("div.card", h("h3", "Peal Sealed Auction"), h("p.small.muted", "Sealed buybacks: the vault sells fUSD for PEAL-T, bids stay sealed until the close."), h("a.small", { href: "https://github.com/Adityaakr/peal-sealed-auction", target: "_blank", rel: "noopener" }, "Source")),
      h("div.card", h("h3", "Open and audited"), h("p.small.muted", "Apache-2.0, 132 Foundry tests, a two-stage QCAI audit in progress."), h("a.small", { href: REPO, target: "_blank", rel: "noopener" }, "GitHub")),
    ),
  );

  return h("div.landing", hero, live, how, drill, roles, tryIt, built);
}
