/**
 * The Peal Tender landing page, built to docs/design.md "Landing pages".
 *
 * Sections: navigation, hero with the mechanism illustration, proof bar, how it
 * works (a step rail that highlights its part of a second illustration), security on
 * the dark band (evidence and a comparison), who uses it, try it, the Peal family,
 * footer. Figures are read from the chain when a vault is known, else labelled.
 */
import "../landing.css";
import { REPO } from "../config.ts";
import { type Ctx } from "../main.ts";
import { duration, h, icon } from "../ui.ts";
import { walletButton } from "../wallet/panel.ts";
import { openPanel, state as wallet } from "../wallet/store.ts";
import { fmt } from "./common.ts";

const NS = "http://www.w3.org/2000/svg";
const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Attrs = Record<string, string | number>;
function s(tag: string, a: Attrs = {}, ...kids: (SVGElement | string)[]): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  for (const k of kids) typeof k === "string" ? (e.textContent = k) : e.append(k);
  return e;
}
const card = (x: number, y: number, w: number, hh: number, extra: Attrs = {}) =>
  s("rect", { x, y, width: w, height: hh, rx: 12, fill: "#fff", stroke: "#dbe3ee", ...extra });
const text = (x: number, y: number, t: string, a: Attrs = {}) => s("text", { x, y, "font-size": 12, fill: "#374151", ...a }, t);
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

// ---------------------------------------------------------------- marks

/** The three Peal marks (docs/design.md "Marks"). */
export function familyMark(kind: "tender" | "auction" | "bidder", size = 26): SVGSVGElement {
  const m = s("svg", { viewBox: "0 0 26 26", width: size, height: size, "aria-hidden": "true" }) as SVGSVGElement;
  m.append(s("circle", { cx: 13, cy: 13, r: 11, fill: "none", stroke: "#2563eb", "stroke-width": 2 }));
  if (kind === "tender") {
    for (const [cx, cy, on] of [
      [13, 7.5, true],
      [8.2, 16, true],
      [17.8, 16, false],
    ] as const) {
      m.append(s("circle", { cx, cy, r: 2.6, fill: on ? "#2563eb" : "#fff", stroke: "#2563eb", "stroke-width": 1.6 }));
    }
  } else if (kind === "auction") {
    m.append(s("path", { d: "M7 13H19", stroke: "#2563eb", "stroke-width": 2, "stroke-linecap": "round" }));
    m.append(s("rect", { x: 10, y: 10, width: 6, height: 6, rx: 1, fill: "#2563eb" }));
  } else {
    m.append(s("circle", { cx: 9, cy: 13, r: 2.6, fill: "#2563eb" }));
    m.append(s("path", { d: "M12 13H19M16 10L19 13L16 16", fill: "none", stroke: "#2563eb", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  }
  return m;
}

// ---------------------------------------------------------------- hero illustration

/**
 * Two of three signers send ML-DSA-87 signatures to the vault; the chain checks
 * them; a stolen classical key is refused; the action either moves within today's
 * allowance or waits in the timelock where one signer can veto.
 */
function heroArt(): SVGSVGElement {
  const svg = s("svg", {
    viewBox: "0 0 560 500",
    class: "l-art",
    role: "img",
    "aria-label":
      "Two of three signers send ML-DSA-87 signatures to the PealTenderV2 vault, which checks them with pqcKeyStatus and pqcVerify. A stolen classical key is refused. Small amounts move within today's allowance; larger ones wait in the timelock, where any one signer can veto.",
  }) as SVGSVGElement;

  // soft panel behind the drawing
  svg.append(s("rect", { x: 6, y: 6, width: 548, height: 488, rx: 24, fill: "#f8fbff", stroke: "#dbe7f7" }));

  // signers
  const signers: [number, string, boolean][] = [
    [40, "Signer 1", true],
    [210, "Signer 2", true],
    [380, "Signer 3", false],
  ];
  for (const [x, name, on] of signers) {
    const g = s("g");
    g.append(card(x, 34, 140, 66));
    g.append(s("circle", { cx: x + 26, cy: 67, r: 13, fill: on ? "#2563eb" : "#fff", stroke: "#2563eb", "stroke-width": 2 }));
    if (on) g.append(s("path", { d: `M${x + 20} 67.5l4 4 8-8.5`, fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    g.append(text(x + 48, 61, name, { "font-weight": 600, fill: "#111827", "font-size": 13 }));
    g.append(text(x + 48, 79, on ? "ML-DSA-87 signed" : "not needed", { fill: on ? "#16a34a" : "#9ca3af", "font-size": 11.5 }));
    svg.append(g);
  }

  // signature paths into the vault
  const p1 = "M110 100 C110 140 250 130 262 176";
  const p2 = "M280 100 C280 130 282 150 282 176";
  for (const [i, d] of [p1, p2].entries()) {
    svg.append(s("path", { d, fill: "none", stroke: "#93c5fd", "stroke-width": 2, "stroke-dasharray": "4 5" }));
    if (!REDUCED) {
      const dot = s("circle", { r: 5, fill: "#2563eb" });
      dot.append(s("animateMotion", { dur: "2.4s", repeatCount: "indefinite", begin: `${i * 0.6}s`, path: d, keyPoints: "0;1", keyTimes: "0;1", calcMode: "spline", keySplines: "0.4 0 0.2 1" }));
      svg.append(dot);
    }
  }

  // the vault
  const vx = 150;
  const vy = 176;
  svg.append(card(vx, vy, 260, 150, { stroke: "#2563eb", "stroke-width": 1.5 }));
  svg.append(s("rect", { x: vx, y: vy, width: 260, height: 38, rx: 12, fill: "#eff6ff" }));
  svg.append(s("rect", { x: vx, y: vy + 26, width: 260, height: 12, fill: "#eff6ff" }));
  svg.append(text(vx + 18, vy + 24, "PealTenderV2", { "font-weight": 700, fill: "#1e40af", "font-size": 13.5 }));
  svg.append(text(vx + 242, vy + 24, "2 of 3", { "text-anchor": "end", fill: "#2563eb", "font-size": 12, "font-weight": 600 }));
  const rows: [string, string][] = [
    ["pqcKeyStatus", "ML-DSA-87 key ✓"],
    ["pqcVerify", "share 1 ✓  share 2 ✓"],
    ["nonce", "41 → 42"],
  ];
  rows.forEach(([k, v], i) => {
    const y = vy + 66 + i * 28;
    svg.append(text(vx + 18, y, k, { "font-family": mono, "font-size": 12, fill: "#6b7280" }));
    svg.append(text(vx + 242, y, v, { "text-anchor": "end", "font-size": 12, fill: "#111827", "font-weight": 500 }));
    if (i < 2) svg.append(s("line", { x1: vx + 18, x2: vx + 242, y1: y + 10, y2: y + 10, stroke: "#eef2f7" }));
  });

  // the attacker with a stolen classical key
  svg.append(card(14, 222, 118, 68, { stroke: "#fecaca", fill: "#fffafa" }));
  svg.append(s("circle", { cx: 37, cy: 250, r: 5.5, fill: "none", stroke: "#dc2626", "stroke-width": 1.8 }));
  svg.append(s("path", { d: "M42.5 250H54M49 250v4.5M53 250v3.5", fill: "none", stroke: "#dc2626", "stroke-width": 1.8, "stroke-linecap": "round" }));
  svg.append(text(62, 248, "Stolen key", { "font-weight": 600, fill: "#991b1b", "font-size": 12 }));
  svg.append(text(26, 270, "secp256k1", { "font-family": mono, fill: "#b91c1c", "font-size": 11 }));
  svg.append(text(26, 284, "classical only", { fill: "#b91c1c", "font-size": 11 }));
  svg.append(s("path", { d: "M132 256 H146", stroke: "#fca5a5", "stroke-width": 2, "stroke-dasharray": "3 4" }));
  const refused = s("g", { class: "l-refused" });
  refused.append(s("rect", { x: 32, y: 302, width: 84, height: 24, rx: 12, fill: "#fef2f2", stroke: "#fecaca" }));
  refused.append(s("path", { d: "M44 310l8 8M52 310l-8 8", stroke: "#dc2626", "stroke-width": 1.8, "stroke-linecap": "round" }));
  refused.append(text(58, 318, "Refused", { fill: "#991b1b", "font-size": 12, "font-weight": 600 }));
  svg.append(refused);

  // outcomes
  svg.append(s("path", { d: "M230 326 C230 360 140 352 140 380", fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  svg.append(s("path", { d: "M330 326 C330 360 420 352 420 380", fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  // allowance
  svg.append(card(36, 380, 208, 92));
  svg.append(text(54, 404, "Within today's allowance", { "font-weight": 600, fill: "#111827", "font-size": 12.5 }));
  svg.append(s("rect", { x: 54, y: 418, width: 172, height: 8, rx: 4, fill: "#eff6ff" }));
  svg.append(s("rect", { x: 54, y: 418, width: 104, height: 8, rx: 4, fill: "#2563eb" }));
  svg.append(text(54, 450, "Moves now", { fill: "#16a34a", "font-size": 12, "font-weight": 600 }));
  svg.append(text(226, 450, "600 of 1,000", { "text-anchor": "end", fill: "#6b7280", "font-size": 11.5 }));
  // timelock
  svg.append(card(316, 380, 208, 92));
  svg.append(text(334, 404, "Larger, or a rule change", { "font-weight": 600, fill: "#111827", "font-size": 12.5 }));
  svg.append(s("circle", { cx: 346, cy: 432, r: 11, fill: "none", stroke: "#2563eb", "stroke-width": 1.8 }));
  svg.append(s("path", { d: "M346 425v7l5 3", fill: "none", stroke: "#2563eb", "stroke-width": 1.8, "stroke-linecap": "round" }));
  svg.append(text(366, 428, "Waits in public", { fill: "#2563eb", "font-size": 12, "font-weight": 600 }));
  svg.append(text(366, 445, "any one signer can veto", { fill: "#6b7280", "font-size": 11.5 }));
  return svg;
}

/** The same story drawn vertically, with larger type, for phones (docs/design.md: not a scaled-down desktop drawing). */
function heroArtPhone(): SVGSVGElement {
  const svg = s("svg", {
    viewBox: "0 0 340 430",
    class: "l-art",
    role: "img",
    "aria-label": "Two of three signers sign; QoreChain checks with pqcVerify; a stolen classical key is refused; the action moves now or waits in the timelock.",
  }) as SVGSVGElement;
  svg.append(s("rect", { x: 2, y: 2, width: 336, height: 426, rx: 20, fill: "#f8fbff", stroke: "#dbe7f7" }));
  // signers row
  const sx = [24, 124, 224];
  sx.forEach((x, i) => {
    const on = i < 2;
    svg.append(card(x, 22, 92, 58));
    svg.append(s("circle", { cx: x + 46, cy: 44, r: 11, fill: on ? "#2563eb" : "#fff", stroke: "#2563eb", "stroke-width": 2 }));
    if (on) svg.append(s("path", { d: `M${x + 41} 44.5l3.5 3.5 6.5-7`, fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    svg.append(text(x + 46, 70, `Signer ${i + 1}`, { "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "#111827" }));
  });
  svg.append(s("path", { d: "M70 80 C70 104 150 100 160 120M170 80V120", fill: "none", stroke: "#93c5fd", "stroke-width": 2, "stroke-dasharray": "4 5" }));
  // the vault
  svg.append(card(24, 120, 292, 112, { stroke: "#2563eb", "stroke-width": 1.5 }));
  svg.append(text(42, 148, "PealTenderV2", { "font-weight": 700, fill: "#1e40af", "font-size": 15 }));
  svg.append(text(298, 148, "2 of 3", { "text-anchor": "end", fill: "#2563eb", "font-size": 14, "font-weight": 600 }));
  svg.append(text(42, 178, "pqcVerify", { "font-family": mono, "font-size": 14, fill: "#6b7280" }));
  svg.append(text(298, 178, "✓  ✓", { "text-anchor": "end", "font-size": 15, fill: "#16a34a", "font-weight": 700 }));
  svg.append(text(42, 210, "Stolen classical key", { "font-size": 14, fill: "#991b1b" }));
  svg.append(text(298, 210, "✕ refused", { "text-anchor": "end", "font-size": 14, fill: "#dc2626", "font-weight": 600 }));
  // outcomes
  svg.append(s("path", { d: "M110 232V262M230 232V262", stroke: "#93c5fd", "stroke-width": 2 }));
  svg.append(card(24, 262, 136, 144));
  svg.append(text(40, 290, "Within the", { "font-size": 14, "font-weight": 600, fill: "#111827" }));
  svg.append(text(40, 308, "allowance", { "font-size": 14, "font-weight": 600, fill: "#111827" }));
  svg.append(s("rect", { x: 40, y: 326, width: 104, height: 8, rx: 4, fill: "#eff6ff" }));
  svg.append(s("rect", { x: 40, y: 326, width: 62, height: 8, rx: 4, fill: "#2563eb" }));
  svg.append(text(40, 382, "Moves now", { "font-size": 14, fill: "#16a34a", "font-weight": 600 }));
  svg.append(card(180, 262, 136, 144));
  svg.append(text(196, 290, "Larger, or a", { "font-size": 14, "font-weight": 600, fill: "#111827" }));
  svg.append(text(196, 308, "rule change", { "font-size": 14, "font-weight": 600, fill: "#111827" }));
  svg.append(s("circle", { cx: 208, cy: 336, r: 11, fill: "none", stroke: "#2563eb", "stroke-width": 1.8 }));
  svg.append(s("path", { d: "M208 329v7l5 3", fill: "none", stroke: "#2563eb", "stroke-width": 1.8, "stroke-linecap": "round" }));
  svg.append(text(196, 370, "Waits; one", { "font-size": 14, fill: "#2563eb", "font-weight": 600 }));
  svg.append(text(196, 388, "signer can veto", { "font-size": 14, fill: "#2563eb", "font-weight": 600 }));
  return svg;
}

// ---------------------------------------------------------------- how-it-works illustration

const STEPS: { title: string; body: string }[] = [
  {
    title: "Someone proposes an action",
    body: "A signer builds it in the app or the CLI: what to do, the vault's current nonce and a deadline. The file holds no secret.",
  },
  {
    title: "Two of three sign it",
    body: "Each signer adds an ML-DSA-87 signature on their own machine. Treasury keys never touch a web page.",
  },
  {
    title: "QoreChain checks every signature",
    body: "The vault reads each signer's key from the chain's registry (pqcKeyStatus) and checks each share with pqcVerify. Being the sender is never enough.",
  },
  {
    title: "It moves now, or it waits",
    body: "Up to a daily allowance moves at once. More, and every rule change, waits in a public timelock; any one signer can veto, then anyone can execute.",
  },
];

function stepsArt(): { svg: SVGSVGElement; groups: SVGElement[] } {
  const svg = s("svg", {
    viewBox: "0 0 480 540",
    class: "l-art l-steps-art",
    role: "img",
    "aria-label": "A proposal file is signed by two signers, checked on chain by pqcKeyStatus and pqcVerify, and then either moves within the allowance or waits in the timelock.",
  }) as SVGSVGElement;
  svg.append(s("rect", { x: 4, y: 4, width: 472, height: 532, rx: 22, fill: "#f8fbff", stroke: "#dbe7f7" }));
  const groups: SVGElement[] = [];

  // 1 proposal
  const g1 = s("g", { class: "l-g" });
  g1.append(card(120, 30, 240, 92));
  g1.append(s("path", { d: "M140 50h18l8 8v24h-26z", fill: "#eff6ff", stroke: "#2563eb", "stroke-width": 1.5, "stroke-linejoin": "round" }));
  g1.append(text(180, 56, "proposal.json", { "font-family": mono, "font-weight": 600, fill: "#111827" }));
  g1.append(text(180, 76, "sweep 250 fUSD → 0x51cc…", { fill: "#374151", "font-size": 11.5 }));
  g1.append(text(180, 94, "nonce 42 · deadline 2h", { fill: "#6b7280", "font-size": 11.5 }));
  g1.append(text(140, 112, "no secret inside", { fill: "#16a34a", "font-size": 11 }));
  groups.push(g1);

  // 2 signers
  const g2 = s("g", { class: "l-g" });
  for (const [x, n] of [
    [40, "Signer 1"],
    [300, "Signer 2"],
  ] as const) {
    g2.append(card(x, 158, 140, 70));
    g2.append(s("circle", { cx: x + 24, cy: 193, r: 12, fill: "#2563eb" }));
    g2.append(s("path", { d: `M${x + 18} 193.5l4 4 8-8.5`, fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    g2.append(text(x + 44, 188, n, { "font-weight": 600, fill: "#111827" }));
    g2.append(text(x + 44, 206, "ML-DSA-87 share", { fill: "#2563eb", "font-size": 11.5 }));
  }
  g2.append(s("path", { d: "M180 193 C210 193 220 140 240 122", fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  g2.append(s("path", { d: "M300 193 C270 193 260 140 240 122", fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  g2.append(text(240, 250, "4,627-byte signatures, made off chain", { "text-anchor": "middle", fill: "#6b7280", "font-size": 11.5 }));
  groups.push(g2);

  // 3 chain check
  const g3 = s("g", { class: "l-g" });
  g3.append(card(80, 272, 320, 106, { stroke: "#2563eb", "stroke-width": 1.5 }));
  g3.append(text(100, 298, "QoreChain", { "font-weight": 700, fill: "#1e40af" }));
  g3.append(text(100, 322, "pqcKeyStatus(signer)", { "font-family": mono, "font-size": 11.5, fill: "#374151" }));
  g3.append(text(380, 322, "key ✓", { "text-anchor": "end", fill: "#16a34a", "font-size": 12, "font-weight": 600 }));
  g3.append(text(100, 344, "pqcVerify(key, share, msg)", { "font-family": mono, "font-size": 11.5, fill: "#374151" }));
  g3.append(text(380, 344, "✓ ✓", { "text-anchor": "end", fill: "#16a34a", "font-size": 12, "font-weight": 600 }));
  g3.append(text(100, 366, "nonce used once", { fill: "#6b7280", "font-size": 11.5 }));
  groups.push(g3);

  // 4 outcomes
  const g4 = s("g", { class: "l-g" });
  g4.append(s("path", { d: "M200 378 C200 410 130 404 130 424", fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  g4.append(s("path", { d: "M280 378 C280 410 350 404 350 424", fill: "none", stroke: "#93c5fd", "stroke-width": 2 }));
  g4.append(card(36, 424, 188, 84));
  g4.append(text(52, 448, "Allowance", { "font-weight": 600, fill: "#111827" }));
  g4.append(s("rect", { x: 52, y: 460, width: 156, height: 8, rx: 4, fill: "#eff6ff" }));
  g4.append(s("rect", { x: 52, y: 460, width: 62, height: 8, rx: 4, fill: "#2563eb" }));
  g4.append(text(52, 492, "moves now", { fill: "#16a34a", "font-size": 11.5, "font-weight": 600 }));
  g4.append(card(256, 424, 188, 84));
  g4.append(text(272, 448, "Timelock", { "font-weight": 600, fill: "#111827" }));
  g4.append(text(272, 470, "waits 15 min in public", { fill: "#2563eb", "font-size": 11.5 }));
  g4.append(text(272, 492, "one signer can veto", { fill: "#6b7280", "font-size": 11.5 }));
  groups.push(g4);

  svg.append(...groups);
  return { svg, groups };
}

// ---------------------------------------------------------------- small line drawings for roles

function roleArt(kind: "signer" | "holder" | "anyone"): SVGSVGElement {
  const m = s("svg", { viewBox: "0 0 40 40", width: 40, height: 40, "aria-hidden": "true", class: "l-role-art" }) as SVGSVGElement;
  m.append(s("rect", { x: 1, y: 1, width: 38, height: 38, rx: 10, fill: "#eff6ff" }));
  const st = { fill: "none", stroke: "#2563eb", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" };
  if (kind === "signer") {
    m.append(s("circle", { cx: 15, cy: 20, r: 5, ...st }));
    m.append(s("path", { d: "M20 20H31M27 20v4M31 20v3", ...st }));
  }
  if (kind === "holder") {
    m.append(s("ellipse", { cx: 20, cy: 15, rx: 8, ry: 3, ...st }));
    m.append(s("path", { d: "M12 15v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5M12 20v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5", ...st }));
  }
  if (kind === "anyone") {
    m.append(s("path", { d: "M9 20s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z", ...st }));
    m.append(s("circle", { cx: 20, cy: 20, r: 3, ...st }));
  }
  return m;
}

// ---------------------------------------------------------------- the page

function kicker(t: string): HTMLElement {
  return h("div.l-kicker", t);
}

function scrollTo(id: string) {
  return () => document.getElementById(id)?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
}

function nav(): HTMLElement {
  const fam = h(
    "div.l-family-switch",
    { role: "group", "aria-label": "Peal products" },
    h("span.l-fam.is-current", { title: "Peal Tender (you are here)" }, familyMark("tender", 18)),
    h("a.l-fam", { href: "https://github.com/Adityaakr/peal-sealed-auction", target: "_blank", rel: "noopener", title: "Peal Sealed Auction" }, familyMark("auction", 18)),
    h("a.l-fam", { href: "https://github.com/Adityaakr/peal-bidder", target: "_blank", rel: "noopener", title: "Peal Bidder" }, familyMark("bidder", 18)),
  );
  const link = (label: string, id: string) => {
    const b = h("button.l-navlink", { type: "button" }, label);
    b.addEventListener("click", scrollTo(id));
    return b;
  };
  const bar = h(
    "header.l-nav",
    h(
      "div.l-wrap.l-nav-inner",
      h("div.l-brand", h("a.wordmark", { href: "#/" }, familyMark("tender"), "Peal Tender"), fam),
      h("nav.l-links", { "aria-label": "On this page" }, link("How it works", "how"), link("Security", "security"), link("Try it", "try"), h("a.l-navlink", { href: REPO, target: "_blank", rel: "noopener" }, "GitHub")),
      h("div.l-nav-ctas", h("a.btn.btn-primary.btn-small", { href: "#/vault" }, "Open the app"), walletButton()),
    ),
  );
  const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  return bar;
}

function reveal(root: HTMLElement): void {
  if (REDUCED || typeof IntersectionObserver !== "function") return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  root.querySelectorAll(".l-reveal").forEach((el) => io.observe(el));
}

export async function landing(ctx: Partial<Ctx>): Promise<HTMLElement> {
  const snap = ctx.snap;
  const openTender = snap?.tenders.find((t) => t.id === snap.openTenderId);

  // ---- hero
  const tryBtn = h("button.btn.l-btn", { type: "button" }, wallet.guest ? "Open your wallet" : "Try it with a guest account");
  tryBtn.addEventListener("click", () => openPanel());
  const hero = h(
    "section.l-hero",
    h(
      "div.l-wrap.l-hero-grid",
      h(
        "div.l-hero-copy",
        kicker("Post-quantum treasury on QoreChain"),
        h("h1.l-display", "A treasury a stolen key ", h("span.l-accent", "cannot drain.")),
        h(
          "p.l-lead",
          "Peal Tender holds a project's treasury behind ML-DSA-87 signatures that QoreChain checks on chain. Two of three signers approve every move, anything large waits in a public timelock, and buybacks clear at one fair price.",
        ),
        h("div.l-ctas", h("a.btn.btn-primary.l-btn", { href: "#/vault" }, "Open the app", icon("arrow")), tryBtn),
        h("p.l-proof-line", "Testnet · Apache-2.0 · 132 Foundry tests · a Q-Day Drill entry"),
      ),
      h("div.l-hero-art", h("div.l-only-wide", heroArt()), h("div.l-only-phone", heroArtPhone())),
    ),
  );

  // ---- proof bar
  const cell = (label: string, value: string, live = false) =>
    h("div.l-proof-cell", h("span.l-proof-label", live ? h("span.l-live", { title: "read from the chain now" }) : null, label), h("strong.l-figure", value));
  const proof = h(
    "section.l-wrap.l-proof-wrap",
    snap
      ? h(
          "div.l-proof",
          cell(`${snap.pay.symbol} held`, fmt(snap.pay.balance, snap.pay), true),
          cell(`${snap.buy.symbol} bought back`, fmt(snap.buy.balance - snap.escrowedBuy, snap.buy), true),
          cell("Signers", `${snap.threshold} of ${snap.members.length}`, true),
          cell("Timelock", duration(snap.delay), true),
          cell("Tenders run", String(snap.tenders.length), true),
        )
      : h(
          "div.l-proof",
          cell("Signers", "2 of 3"),
          cell("Signature", "ML-DSA-87"),
          cell("Checked by", "pqcVerify"),
          cell("Live vault", "19 Nov 2026"),
        ),
  );

  // ---- how it works: step rail synced to the illustration
  const art = stepsArt();
  const items = STEPS.map((st, i) =>
    h(
      "button.l-step",
      { type: "button", "aria-pressed": i === 0 ? "true" : "false", "data-step": i },
      h("span.l-step-n", String(i + 1)),
      h("span.l-step-text", h("span.l-step-title", st.title), h("span.l-step-body", st.body)),
    ),
  );
  const activate = (i: number) => {
    items.forEach((b, k) => b.setAttribute("aria-pressed", k === i ? "true" : "false"));
    art.groups.forEach((g, k) => g.classList.toggle("is-dim", k !== i));
  };
  items.forEach((b, i) => {
    b.addEventListener("mouseenter", () => activate(i));
    b.addEventListener("focus", () => activate(i));
    b.addEventListener("click", () => activate(i));
  });
  activate(0);
  const how = h(
    "section.l-band.l-band-white",
    { id: "how" },
    h(
      "div.l-wrap",
      h("div.l-section-head.l-reveal", kicker("How it works"), h("h2.l-title", "Four steps from an idea to moved funds."), h("p.l-lead", "Every treasury action goes the same way. Hover or tap a step to see where it happens.")),
      h("div.l-steps.l-reveal", h("div.l-step-list", { role: "group", "aria-label": "Steps" }, ...items), h("div.l-steps-art-wrap", art.svg)),
    ),
  );

  // ---- security on the dark band
  const row = (what: string, ordinary: [boolean, string], ours: [boolean, string]) =>
    h(
      "tr",
      h("th", { scope: "row" }, what),
      h("td", h(`span.l-verdict${ordinary[0] ? ".ok" : ".bad"}`, icon(ordinary[0] ? "check" : "cross"), ordinary[1])),
      h("td", h(`span.l-verdict${ours[0] ? ".ok" : ".bad"}`, icon(ours[0] ? "check" : "cross"), ours[1])),
    );
  const security = h(
    "section.l-band.l-band-dark",
    { id: "security" },
    h(
      "div.l-wrap",
      h(
        "div.l-security-grid.l-reveal",
        h(
          "div.l-section-head",
          { style: "margin-bottom:0" },
          kicker("Security"),
          h("h2.l-title", "A stolen classical key moves nothing."),
          h(
            "p.l-lead",
            "A large quantum computer could recover a secp256k1 private key from its public key. Funds guarded only by that key would belong to whoever ran it. In QoreChain's Q-Day Drill the attacker was handed our signer's classical key. Every attempt was refused.",
          ),
        ),
        h(
          "div",
          h(
            "pre.l-terminal",
            h("span.l-c", "# drill rehearsal, 15 Nov 2026\n# the attacker holds only the classical key\n"),
            ...[
              ["native transfer", "pqc code 20"],
              ["open an EVM window", "pqc code 21"],
              ["re-register PQ key", "pqc code 234"],
              ["fUSD approval", "no window"],
              ["vault.sweep, forged", "PqSignatureInvalid"],
            ].flatMap(([a, b]) => [h("span.l-refused-word", "REFUSED"), `  ${a.padEnd(20)}${b}\n`]),
          ),
          h("a.l-dark-link", { href: `${REPO}/blob/main/THREAT_MODEL.md`, target: "_blank", rel: "noopener" }, "The threat model and the full log"),
        ),
      ),
      h(
        "div.l-reveal",
        { style: "margin-top:56px" },
        h(
          "table.l-compare",
          h("thead", h("tr", h("th", ""), h("th", { scope: "col" }, "An ordinary treasury"), h("th", { scope: "col" }, "Peal Tender"))),
          h(
            "tbody",
            row("Its signing key is stolen", [false, "funds move"], [true, "refused: the key is post-quantum and needs 2 of 3"]),
            row("A quantum computer meets its public key", [false, "the key can be derived"], [true, "ML-DSA-87, checked by pqcVerify"]),
            row("One key holder turns", [false, "moves everything"], [true, "a single share is refused"]),
            row("Two signers turn", [false, "everything at once"], [true, "capped per day; more waits, any honest signer vetoes"]),
            row("Nobody with a key is around", [false, "buybacks stall"], [true, "anyone settles, executes, collects"]),
          ),
        ),
      ),
    ),
  );

  // ---- roles
  const role = (kind: "signer" | "holder" | "anyone", title: string, body: string, href: string, cta: string) =>
    h("div.l-card.l-reveal", roleArt(kind), h("h3.l-card-title", title), h("p.l-card-body", body), h("a.l-card-link", { href }, cta, icon("arrow")));
  const roles = h(
    "section.l-band",
    h(
      "div.l-wrap",
      h("div.l-section-head.l-reveal", kicker("Who uses it"), h("h2.l-title", "Three kinds of people, one set of rules.")),
      h(
        "div.l-grid-3",
        role("signer", "Treasury signers", "Propose actions in the app or the CLI, sign them with npm run sign-action, and veto anything queued that they do not like.", "#/propose", "Build a proposal"),
        role("holder", "Token holders", "Offer PEAL-T into a buyback at the lowest price you accept. Everyone who sells is paid one clearing price, never less than they asked.", "#/tenders", "See the tenders"),
        role("anyone", "Anyone", "Watch every signature and queued change, settle a finished tender, execute a change once its wait is over, check a proposal's signatures.", "#/activity", "Watch the vault"),
      ),
    ),
  );

  // ---- try it
  const tryStep = (n: number, title: string, body: string, cta?: HTMLElement) =>
    h("li.l-try-step", h("span.l-try-n", String(n)), h("h3.l-card-title", title), h("p.l-card-body", body), cta ?? null);
  const createBtn = h("button.btn.btn-primary.btn-small", { type: "button" }, wallet.guest ? "Open your wallet" : "Create it");
  createBtn.addEventListener("click", () => openPanel());
  const tryIt = h(
    "section.l-band.l-band-white",
    { id: "try" },
    h(
      "div.l-wrap",
      h(
        "div.l-section-head.l-reveal",
        kicker("Try it"),
        h("h2.l-title", "Sell into a buyback in about five minutes."),
        h("p.l-lead", "On the testnet, with an account made in your browser. QoreX can fund it; MetaMask can connect, but it cannot make the post-quantum signature QoreChain asks for."),
      ),
      h(
        "ol.l-try.l-reveal",
        tryStep(1, "Make a guest account", "A fresh testnet account with its own ML-DSA-87 key, kept only in this browser.", createBtn),
        tryStep(2, "Fund it", "Send a little test QOR from QoreX in one approval, or use the QoreChain dashboard faucet."),
        tryStep(3, "Get test PEAL-T", "One click claims it from Peal Sealed Auction's demo faucet."),
        tryStep(
          4,
          "Offer into the tender",
          "Pick an amount and your lowest price. Your account registers its key and opens a window scoped to the vault.",
          openTender ? h("a.btn.btn-small", { href: `#/tenders/${openTender.id}` }, `Tender #${openTender.id}`) : h("a.btn.btn-small", { href: "#/tenders" }, "Tenders"),
        ),
      ),
    ),
  );

  // ---- the Peal family
  const fam = (kind: "tender" | "auction" | "bidder", name: string, body: string, href: string, current = false) =>
    h(
      `div.l-card.l-fam-card.l-reveal${current ? ".is-current" : ""}`,
      h("div.l-fam-head", familyMark(kind, 32), current ? h("span.chip.wait", "You are here") : null),
      h("h3.l-card-title", name),
      h("p.l-card-body", body),
      current ? null : h("a.l-card-link", { href, target: "_blank", rel: "noopener" }, "On GitHub", icon("arrow")),
    );
  const family = h(
    "section.l-band",
    h(
      "div.l-wrap",
      h("div.l-section-head.l-reveal", kicker("The Peal family"), h("h2.l-title", "One product story, three entries.")),
      h(
        "div.l-grid-3",
        fam("tender", "Peal Tender", "The treasury: post-quantum signatures, a timelock and buybacks at one price.", "#/", true),
        fam("auction", "Peal Sealed Auction", "The venue: bids sealed with ML-KEM-1024 that no single key holder can open before the close.", "https://github.com/Adityaakr/peal-sealed-auction"),
        fam("bidder", "Peal Bidder", "The participant: an AI agent that bids for you, held to a mandate the chain enforces.", "https://github.com/Adityaakr/peal-bidder"),
      ),
    ),
  );

  // ---- footer
  const col = (title: string, links: [string, string, boolean?][]) =>
    h("div.l-foot-col", h("div.l-foot-title", title), ...links.map(([t, href, ext]) => h("a", { href, ...(ext ? { target: "_blank", rel: "noopener" } : {}) }, t)));
  const footer = h(
    "footer.l-footer",
    h(
      "div.l-wrap",
      h(
        "div.l-foot-grid",
        h("div", h("a.wordmark", { href: "#/" }, familyMark("tender"), "Peal Tender"), h("p.l-foot-text", "A treasury held by post-quantum signatures, built for QoreChain's Build Before Q-Day.")),
        col("Product", [
          ["Open the app", "#/vault"],
          ["Tenders", "#/tenders"],
          ["Propose", "#/propose"],
          ["Activity", "#/activity"],
        ]),
        col("Developers", [
          ["Source", REPO, true],
          ["Threat model", `${REPO}/blob/main/THREAT_MODEL.md`, true],
          ["Audits", `${REPO}/tree/main/audits`, true],
          ["qore-pq-kit", "https://github.com/Adityaakr/qore-pq-kit", true],
        ]),
        col("Hackathon", [
          ["Build Before Q-Day", "https://docs.qorechain.io", true],
          ["Q-Day Drill runbook", `${REPO}/blob/main/DRILL.md`, true],
        ]),
      ),
      h("div.l-foot-base", "Apache-2.0 · Testnet only · Design language from Peal · Treasury keys never touch this page"),
    ),
  );

  const page = h("div.l-page", nav(), h("main", hero, proof, how, security, roles, tryIt, family), footer);
  queueMicrotask(() => reveal(page));
  return page;
}
