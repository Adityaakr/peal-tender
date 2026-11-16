/**
 * The diagrams on Peal Tender's landing page. Each one answers one question a visitor
 * has; the question is the figure's heading on the page.
 *
 *  - keysSingle / keysTender: who holds which key, and what a stolen key does.
 *  - flowDiagram (+ FLOW for the phone list): how a payment travels from a proposal to
 *    a transfer, lane by lane, with the scoped EVM window and the precompiles.
 *  - clearingChart: how the drill vault's tender 1 cleared at one price.
 */
import { arrowDefs, box, C, m, path, s, SERIF, t } from "./svg.ts";

const svgRoot = (w: number, hgt: number, label: string, cls = "t-diagram") =>
  s("svg", {
    viewBox: `0 0 ${w} ${hgt}`,
    class: cls,
    role: "img",
    "aria-label": label,
  }) as SVGSVGElement;

function callout(x: number, y: number, n: number): SVGElement {
  const g = s("g");
  g.append(s("circle", { cx: x, cy: y, r: 10, fill: C.ink }));
  g.append(
    m(x, y + 3.8, String(n), {
      "text-anchor": "middle",
      "font-size": 11,
      "font-weight": 500,
      fill: C.sheet,
    }),
  );
  return g;
}

const cross = (x: number, y: number) => {
  const g = s("g");
  g.append(
    s("circle", {
      cx: x,
      cy: y,
      r: 9,
      fill: C.sheet,
      stroke: C.stamp,
      "stroke-width": 1.5,
    }),
  );
  g.append(path(`M${x - 3.5} ${y - 3.5}L${x + 3.5} ${y + 3.5}M${x + 3.5} ${y - 3.5}L${x - 3.5} ${y + 3.5}`, { stroke: C.stamp, "stroke-width": 1.6 }));
  return g;
};

// ---------------------------------------------------------------- who holds which key

export function keysSingle(): SVGSVGElement {
  const svg = svgRoot(
    520,
    330,
    "A single-key treasury: one account key, secp256k1, whose public key is visible on chain. After Q-Day an attacker derives the private key from the public key and signs a transfer; one key is enough to move the funds.",
  );
  svg.append(arrowDefs("ks", { ink: C.ink, red: C.stamp }));
  // the account
  svg.append(box(300, 24, 200, 92));
  svg.append(t(316, 50, "Treasury account", { "font-weight": 600, "font-size": 13 }));
  svg.append(m(316, 72, "one secp256k1 key"));
  svg.append(
    t(316, 94, "public key on chain since", {
      fill: C.muted,
      "font-size": 11.5,
    }),
  );
  svg.append(t(316, 108, "its first transaction", { fill: C.muted, "font-size": 11.5 }));
  // the attacker
  svg.append(
    box(20, 24, 176, 92, {
      stroke: C.stamp,
      "stroke-opacity": 0.9,
      "stroke-dasharray": "4 3",
    }),
  );
  svg.append(
    t(36, 50, "Attacker after Q-Day", {
      "font-weight": 600,
      "font-size": 13,
      fill: C.stamp,
    }),
  );
  svg.append(t(36, 72, "derives the private key", { "font-size": 12, fill: C.ink2 }));
  svg.append(t(36, 88, "from the public key", { "font-size": 12, fill: C.ink2 }));
  svg.append(
    path("M298 70 H200", {
      stroke: C.stamp,
      "stroke-dasharray": "4 3",
      "marker-end": "url(#ks-red)",
    }),
  );
  svg.append(
    t(249, 62, "public key", {
      "text-anchor": "middle",
      "font-size": 11,
      fill: C.stamp,
    }),
  );
  // the funds
  svg.append(box(160, 224, 200, 82, { stroke: C.stamp, "stroke-opacity": 0.9 }));
  svg.append(t(176, 250, "Treasury funds", { "font-weight": 600, "font-size": 13 }));
  svg.append(t(176, 272, "move on one signature", { "font-size": 12, fill: C.stamp }));
  svg.append(m(176, 292, "secp256k1 only", { "font-size": 11, fill: C.muted }));
  svg.append(
    path("M400 118 V170 Q400 180 390 180 H300 Q290 180 290 190 V222", {
      "marker-end": "url(#ks-ink)",
    }),
  );
  svg.append(t(406, 160, "the owner signs", { "font-size": 11, fill: C.muted }));
  svg.append(
    path("M108 118 V170 Q108 180 118 180 H220 Q230 180 230 190 V222", {
      stroke: C.stamp,
      "marker-end": "url(#ks-red)",
    }),
  );
  svg.append(t(114, 160, "so can the attacker", { "font-size": 11, fill: C.stamp }));
  return svg;
}

export function keysTender(): SVGSVGElement {
  const svg = svgRoot(
    520,
    330,
    "Peal Tender: three signers each hold their own ML-DSA-87 key, registered on QoreChain. The vault moves funds only on valid signatures from two of them. An attacker holding the account's secp256k1 key has no ML-DSA-87 signature and is refused.",
  );
  svg.append(arrowDefs("kt", { ink: C.ink, acc: C.accent, red: C.stamp }));
  [20, 190, 360].forEach((x, i) => {
    const on = i < 2;
    svg.append(box(x, 20, 140, 70, on ? {} : { "stroke-dasharray": "4 3", "stroke-opacity": 0.4 }));
    svg.append(
      t(x + 14, 44, `Signer ${i + 1}`, {
        "font-weight": 600,
        "font-size": 13,
        fill: on ? C.ink : C.muted,
      }),
    );
    svg.append(m(x + 14, 64, "ML-DSA-87 key", { fill: on ? C.accent : C.muted }));
    svg.append(
      t(x + 14, 80, on ? "signs this order" : "not needed today", {
        "font-size": 11,
        fill: C.muted,
      }),
    );
  });
  svg.append(
    path("M90 92 V112 Q90 120 98 120 H222 Q230 120 230 128 V146", {
      stroke: C.accent,
      "stroke-width": 1.5,
      "marker-end": "url(#kt-acc)",
    }),
  );
  svg.append(
    path("M260 92 V146", {
      stroke: C.accent,
      "stroke-width": 1.5,
      "marker-end": "url(#kt-acc)",
    }),
  );
  svg.append(t(268, 124, "ML-DSA-87 signatures", { "font-size": 11, fill: C.accent }));
  // the vault
  svg.append(
    box(150, 148, 240, 66, {
      stroke: C.accent,
      "stroke-opacity": 1,
      "stroke-width": 1.4,
    }),
  );
  svg.append(s("text", { x: 166, y: 174, "font-family": SERIF, "font-size": 16, fill: C.ink }, "PealTenderV2"));
  svg.append(
    t(166, 198, "pays only on 2 of 3 valid signatures", {
      "font-size": 11.5,
      fill: C.ink2,
    }),
  );
  // the funds
  svg.append(
    path("M300 216 V250", {
      stroke: C.accent,
      "stroke-width": 1.5,
      "marker-end": "url(#kt-acc)",
    }),
  );
  svg.append(box(230, 252, 180, 62));
  svg.append(t(246, 278, "Treasury funds", { "font-weight": 600, "font-size": 13 }));
  svg.append(t(246, 298, "move on 2 of 3", { "font-size": 12, fill: C.accent }));
  // the attacker
  svg.append(
    box(20, 236, 150, 78, {
      stroke: C.stamp,
      "stroke-opacity": 0.9,
      "stroke-dasharray": "4 3",
    }),
  );
  svg.append(
    t(34, 260, "Attacker after Q-Day", {
      "font-weight": 600,
      "font-size": 12.5,
      fill: C.stamp,
    }),
  );
  svg.append(t(34, 280, "holds the account's", { "font-size": 11.5, fill: C.ink2 }));
  svg.append(m(34, 297, "secp256k1 key", { "font-size": 11.5 }));
  svg.append(
    path("M70 234 V200 Q70 192 78 192 H124", {
      stroke: C.stamp,
      "stroke-dasharray": "4 3",
    }),
  );
  svg.append(cross(136, 192));
  svg.append(
    t(78, 184, "refused", {
      "font-size": 11,
      fill: C.stamp,
      "font-weight": 600,
    }),
  );
  return svg;
}

// ---------------------------------------------------------------- how a payment clears

export interface FlowStep {
  lane: string;
  title: string;
  lines: string[];
}

/** The six steps, also listed as text for phones. */
export const FLOW: FlowStep[] = [
  {
    lane: "Signer's machine",
    title: "Write the order",
    lines: ["proposal.json: the call, the vault's nonce and a deadline", "it holds no secret"],
  },
  {
    lane: "Signers' machines",
    title: "Two signers sign",
    lines: ["npm run sign-action, on each signer's own machine", "ML-DSA-87, 4,627 bytes each"],
  },
  {
    lane: "Any account",
    title: "Relay it",
    lines: ["sending the transaction grants nothing", "anyone can relay a signed order"],
  },
  {
    lane: "QoreChain",
    title: "Open a scoped window",
    lines: ["MsgOpenEVMWindow, hybrid-signed", "only the vault, fUSD, PEAL-T and the auction factory"],
  },
  {
    lane: "PealTenderV2",
    title: "Verify every signature",
    lines: ["pqcKeyStatus reads each signer's key on file", "pqcVerify checks each signature; nonce 42 becomes 43"],
  },
  {
    lane: "PealTenderV2",
    title: "Pay, or hold",
    lines: ["within today's allowance: paid at once", "above it, or a rule change: held 15 min; one signer can stop it"],
  },
];

export function flowDiagram(): SVGSVGElement {
  const W = 1120;
  const H = 480;
  const svg = svgRoot(
    W,
    H,
    "How a payment clears, in four lanes. 1, a signer writes proposal.json with the call, nonce and deadline. 2, two signers each sign it with ML-DSA-87 on their own machines. 3, any account relays it. 4, QoreChain opens an EVM window scoped to the vault, fUSD, PEAL-T and the auction factory, with a hybrid signature. 5, PealTenderV2 reads each signer's key with pqcKeyStatus and checks each signature with pqcVerify, then advances the nonce. 6, within today's allowance it pays at once; above it, or for a rule change, it holds the order for 15 minutes, during which any one signer can stop it, then anyone executes it.",
    "t-diagram t-flow",
  );
  svg.append(arrowDefs("fl", { ink: C.ink, acc: C.accent }));
  const lanes: [string, string, number, number][] = [
    ["Signers' machines", "off chain", 0, 136],
    ["Any account", "the relayer", 136, 232],
    ["QoreChain", "the chain itself", 232, 328],
    ["PealTenderV2", "the vault contract", 328, 480],
  ];
  lanes.forEach(([name, sub, y0, y1], i) => {
    if (i % 2 === 0)
      svg.append(
        s("rect", {
          x: 0,
          y: y0,
          width: W,
          height: y1 - y0,
          fill: C.rule,
          "fill-opacity": 0.28,
        }),
      );
    svg.append(s("line", { x1: 0, x2: W, y1: y0, y2: y0, stroke: C.rule }));
    svg.append(t(16, y0 + 28, name, { "font-weight": 600, "font-size": 12.5 }));
    svg.append(t(16, y0 + 46, sub, { "font-size": 11, fill: C.muted }));
  });

  const step = (n: number, x: number, y: number, w: number, hgt: number, title: string, lines: string[], a: Record<string, string | number> = {}) => {
    svg.append(box(x, y, w, hgt, a));
    svg.append(t(x + 14, y + 24, title, { "font-weight": 600, "font-size": 12.5 }));
    lines.forEach((ln, i) => svg.append((ln.startsWith("$") ? m : t)(x + 14, y + 44 + i * 16, ln.replace(/^\$/, ""), { "font-size": 11, fill: C.ink2 })));
    svg.append(callout(x, y, n));
  };

  step(1, 166, 30, 176, 84, "proposal.json", ["$sweep(fUSD, ops, 250)", "$nonce 42, valid 2 h", "no secret inside"]);
  step(2, 382, 30, 186, 84, "Signers 1 and 2 sign", ["$npm run sign-action", "ML-DSA-87, 4,627 B each", "on their own machines"], { stroke: C.accent, "stroke-opacity": 1 });
  svg.append(path("M342 72 H378", { "marker-end": "url(#fl-ink)" }));

  step(3, 382, 152, 186, 64, "Relay the order", ["sending it grants nothing"]);
  svg.append(
    path("M475 114 V148", {
      stroke: C.accent,
      "stroke-width": 1.5,
      "marker-end": "url(#fl-acc)",
    }),
  );
  svg.append(t(483, 138, "2 signatures", { "font-size": 11, fill: C.accent }));

  step(4, 382, 244, 250, 72, "Scoped EVM window", ["$MsgOpenEVMWindow, hybrid-signed", "vault, fUSD, PEAL-T, factory only"]);
  svg.append(path("M475 216 V240", { "marker-end": "url(#fl-ink)" }));

  // precompiles in the chain lane, the vault's check below
  svg.append(box(660, 244, 210, 72, { "stroke-dasharray": "4 3" }));
  svg.append(t(674, 268, "Precompiles", { "font-weight": 600, "font-size": 12.5 }));
  svg.append(m(674, 288, "pqcKeyStatus 0x…0a02", { "font-size": 11, fill: C.ink2 }));
  svg.append(m(674, 304, "pqcVerify    0x…0a01", { "font-size": 11, fill: C.ink2 }));

  step(5, 660, 346, 210, 100, "Verify every signature", ["$key on file    ✓ ✓", "$signature      ✓ ✓", "$nonce 42 → 43"], {
    stroke: C.accent,
    "stroke-opacity": 1,
    "stroke-width": 1.4,
  });
  svg.append(
    path("M632 300 H636 Q644 300 644 310 V386 Q644 396 652 396 H656", {
      "marker-end": "url(#fl-ink)",
    }),
  );
  svg.append(
    t(634, 378, "calls sweep", {
      "font-size": 11,
      fill: C.muted,
      "text-anchor": "end",
    }),
  );
  svg.append(
    t(634, 392, "with the signatures", {
      "font-size": 11,
      fill: C.muted,
      "text-anchor": "end",
    }),
  );
  svg.append(path("M765 344 V320", { "marker-end": "url(#fl-ink)" }));
  svg.append(path("M785 320 V344", { "marker-end": "url(#fl-ink)" }));
  svg.append(t(793, 336, "reads, checks", { "font-size": 10.5, fill: C.muted }));

  // outcomes
  svg.append(box(918, 346, 186, 44, { stroke: C.accent, "stroke-opacity": 1 }));
  svg.append(
    t(932, 365, "Paid at once", {
      "font-weight": 600,
      "font-size": 12,
      fill: C.accent,
    }),
  );
  svg.append(t(932, 381, "within today's allowance", { "font-size": 11, fill: C.ink2 }));
  svg.append(box(918, 400, 186, 62));
  svg.append(
    t(932, 420, "Held 15 min, in public", {
      "font-weight": 600,
      "font-size": 12,
    }),
  );
  svg.append(
    t(932, 437, "above it, or a rule change;", {
      "font-size": 11,
      fill: C.ink2,
    }),
  );
  svg.append(t(932, 452, "one signer can stop it", { "font-size": 11, fill: C.ink2 }));
  svg.append(
    path("M870 380 H892 Q900 380 900 372 V368 H914", {
      stroke: C.accent,
      "stroke-width": 1.5,
      "marker-end": "url(#fl-acc)",
    }),
  );
  svg.append(
    path("M870 410 H892 Q900 410 900 418 V426 H914", {
      "marker-end": "url(#fl-ink)",
    }),
  );
  svg.append(callout(918, 346, 6));
  return svg;
}

// ---------------------------------------------------------------- one clearing price

/**
 * The drill vault's tender 1 (README, deployed transactions): budget 0.1 fUSD, a ladder
 * from 0.0010 in steps of 0.0001; offers of 60 tPEAL at 0.0010 and 50 at 0.0013. The
 * price climbs while the budget pays every offer at or below it; at 0.0013 it cannot
 * pay all 110, so it is spent there: the 60 fill in full and 16.92 of the 50 pro rata.
 */
export function clearingChart(phone = false): SVGSVGElement {
  const ticks = [
    { price: "0.0010", offered: 60 },
    { price: "0.0011", offered: 60 },
    { price: "0.0012", offered: 60 },
    { price: "0.0013", offered: 110 },
  ];
  const budget = 0.1;
  const W = phone ? 372 : 680;
  const H = 360;
  const x0 = phone ? 40 : 64;
  const x1 = phone ? 276 : 600;
  const y0 = 300; // baseline
  const yTop = 40;
  const max = 120;
  const y = (v: number) => y0 - ((y0 - yTop) * v) / max;
  const band = (x1 - x0) / ticks.length;
  const svg = svgRoot(
    W,
    H,
    "Tender 1 of the drill vault. Bars show the tPEAL offered at or below each price: 60 at 0.0010 to 0.0012, 110 at 0.0013. The line shows what the 0.1 fUSD budget buys at each price: 100, 90.9, 83.3 and 76.9 tPEAL. At 0.0013 the offers exceed what the budget buys, so the tender clears there: 76.92 tPEAL bought, everyone paid 0.0013.",
    "t-diagram t-chart",
  );
  // grid and axis
  for (const v of [0, 40, 80, 120]) {
    svg.append(
      s("line", {
        x1: x0,
        x2: x1,
        y1: y(v),
        y2: y(v),
        stroke: v === 0 ? C.ink : C.rule,
        "stroke-opacity": v === 0 ? 0.7 : 1,
      }),
    );
    svg.append(
      m(x0 - 10, y(v) + 4, String(v), {
        "text-anchor": "end",
        "font-size": 11,
        fill: C.muted,
      }),
    );
  }
  svg.append(
    t(x0 - 10, yTop - 18, "tPEAL", {
      "text-anchor": "end",
      "font-size": 11,
      fill: C.muted,
    }),
  );
  ticks.forEach((tk, i) => {
    const cx = x0 + band * i + band / 2;
    const bw = phone ? 36 : 56;
    const bx = cx - bw / 2;
    const clears = i === ticks.length - 1;
    const bar = s("rect", {
      x: bx,
      y: y(tk.offered),
      width: bw,
      height: y0 - y(tk.offered),
      fill: C.accent,
      "fill-opacity": 0.12,
      stroke: C.accent,
      "stroke-opacity": 0.5,
    });
    bar.append(s("title", {}, `${tk.offered} tPEAL offered at or below ${tk.price}`));
    svg.append(bar);
    if (clears) {
      const bought = budget / Number(tk.price);
      svg.append(
        s("rect", {
          x: bx,
          y: y(60),
          width: bw,
          height: y0 - y(60) - 1,
          fill: C.accent,
        }),
      );
      svg.append(
        s("rect", {
          x: bx,
          y: y(bought),
          width: bw,
          height: y(60) - y(bought) - 2,
          fill: C.accent,
          "fill-opacity": 0.7,
        }),
      );
      svg.append(m(bx + bw + 8, y(30) + 4, "60 in full", { "font-size": 11 }));
      svg.append(m(bx + bw + 8, y(68.5) + 4, "16.92 of 50", { "font-size": 11 }));
      svg.append(
        m(bx + bw + 8, y(93) + 4, "33.08 returned", {
          "font-size": 11,
          fill: C.muted,
        }),
      );
    }
    svg.append(
      m(cx, y(tk.offered) - 8, String(tk.offered), {
        "text-anchor": "middle",
        "font-size": 11.5,
        "font-weight": 500,
      }),
    );
    svg.append(
      m(cx, y0 + 20, tk.price, {
        "text-anchor": "middle",
        "font-size": 11.5,
        fill: clears ? C.ink : C.ink2,
        "font-weight": clears ? 600 : 400,
      }),
    );
  });
  svg.append(
    t((x0 + x1) / 2, y0 + 44, phone ? "price, fUSD per tPEAL" : "price, fUSD per tPEAL (the tender's ladder)", { "text-anchor": "middle", "font-size": 11.5, fill: C.muted }),
  );
  // what the budget buys at each price
  const pts = ticks.map((tk, i) => [x0 + band * i + band / 2, y(budget / Number(tk.price))] as const);
  svg.append(
    path(`M${pts.map(([px, py]) => `${px} ${py}`).join(" L")}`, {
      stroke: C.ink,
      "stroke-width": 1.75,
    }),
  );
  pts.forEach(([px, py], i) => {
    const v = budget / Number(ticks[i].price);
    const dot = s("circle", {
      cx: px,
      cy: py,
      r: 4.5,
      fill: C.ink,
      stroke: C.sheet,
      "stroke-width": 2,
    });
    dot.append(s("title", {}, `0.1 fUSD buys ${v.toFixed(2)} tPEAL at ${ticks[i].price}`));
    svg.append(dot);
    if (i < 3)
      svg.append(
        m(px, py - 10, Number.isInteger(v) ? String(v) : v.toFixed(1), {
          "text-anchor": "middle",
          "font-size": 11,
        }),
      );
  });
  svg.append(
    t(pts[0][0] - (phone ? 14 : 22), pts[0][1] - 26, "what 0.1 fUSD buys", {
      "font-size": 11.5,
      fill: C.ink,
      "font-weight": 600,
    }),
  );
  return svg;
}

// ---------------------------------------------------------------- phone drawings of the two treasuries

export function keysSinglePhone(): SVGSVGElement {
  const svg = svgRoot(
    340,
    352,
    "A single-key treasury: one secp256k1 key whose public key is on chain. After Q-Day an attacker derives the private key from it and signs a transfer; one key is enough.",
  );
  svg.append(arrowDefs("ksp", { ink: C.ink, red: C.stamp }));
  svg.append(box(16, 16, 308, 72));
  svg.append(t(30, 40, "Treasury account", { "font-weight": 600, "font-size": 13 }));
  svg.append(m(30, 60, "one secp256k1 key", { "font-size": 12 }));
  svg.append(
    t(30, 78, "public key on chain since its first transaction", {
      "font-size": 11,
      fill: C.muted,
    }),
  );
  svg.append(
    path("M110 90 V136", {
      stroke: C.stamp,
      "stroke-dasharray": "4 3",
      "marker-end": "url(#ksp-red)",
    }),
  );
  svg.append(t(118, 118, "public key", { "font-size": 11.5, fill: C.stamp }));
  svg.append(
    box(16, 140, 190, 70, {
      stroke: C.stamp,
      "stroke-opacity": 0.9,
      "stroke-dasharray": "4 3",
    }),
  );
  svg.append(
    t(30, 164, "Attacker after Q-Day", {
      "font-weight": 600,
      "font-size": 13,
      fill: C.stamp,
    }),
  );
  svg.append(t(30, 184, "derives the private key", { "font-size": 12, fill: C.ink2 }));
  svg.append(t(30, 200, "from the public key", { "font-size": 12, fill: C.ink2 }));
  svg.append(path("M110 212 V264", { stroke: C.stamp, "marker-end": "url(#ksp-red)" }));
  svg.append(t(118, 244, "so can the attacker", { "font-size": 11.5, fill: C.stamp }));
  svg.append(path("M290 90 V264", { "marker-end": "url(#ksp-ink)" }));
  svg.append(
    t(282, 124, "the owner", {
      "font-size": 11.5,
      fill: C.muted,
      "text-anchor": "end",
    }),
  );
  svg.append(
    t(282, 124 + 15, "signs", {
      "font-size": 11.5,
      fill: C.muted,
      "text-anchor": "end",
    }),
  );
  svg.append(box(16, 268, 308, 70, { stroke: C.stamp, "stroke-opacity": 0.9 }));
  svg.append(t(30, 292, "Treasury funds", { "font-weight": 600, "font-size": 13 }));
  svg.append(t(30, 312, "move on one signature", { "font-size": 12, fill: C.stamp }));
  svg.append(m(30, 328, "secp256k1 only", { "font-size": 11.5, fill: C.muted }));
  return svg;
}

export function keysTenderPhone(): SVGSVGElement {
  const svg = svgRoot(
    340,
    336,
    "Peal Tender: three signers, each with an ML-DSA-87 key registered on QoreChain. The vault pays only on valid signatures from two of them. An attacker with the account's secp256k1 key is refused.",
  );
  svg.append(arrowDefs("ktp", { ink: C.ink, acc: C.accent, red: C.stamp }));
  [16, 120, 224].forEach((x, i) => {
    const on = i < 2;
    svg.append(box(x, 16, 100, 64, on ? {} : { "stroke-dasharray": "4 3", "stroke-opacity": 0.4 }));
    svg.append(
      t(x + 12, 38, `Signer ${i + 1}`, {
        "font-weight": 600,
        "font-size": 12.5,
        fill: on ? C.ink : C.muted,
      }),
    );
    svg.append(
      m(x + 12, 56, "ML-DSA-87", {
        "font-size": 11.5,
        fill: on ? C.accent : C.muted,
      }),
    );
    svg.append(
      t(x + 12, 72, on ? "signs" : "not needed", {
        "font-size": 11,
        fill: C.muted,
      }),
    );
  });
  svg.append(
    path("M66 82 V98 Q66 106 74 106 H142 Q150 106 150 114 V128", {
      stroke: C.accent,
      "stroke-width": 1.5,
      "marker-end": "url(#ktp-acc)",
    }),
  );
  svg.append(
    path("M170 82 V128", {
      stroke: C.accent,
      "stroke-width": 1.5,
      "marker-end": "url(#ktp-acc)",
    }),
  );
  svg.append(t(178, 108, "ML-DSA-87 signatures", { "font-size": 11, fill: C.accent }));
  svg.append(
    box(36, 130, 268, 62, {
      stroke: C.accent,
      "stroke-opacity": 1,
      "stroke-width": 1.4,
    }),
  );
  svg.append(s("text", { x: 50, y: 155, "font-family": SERIF, "font-size": 16, fill: C.ink }, "PealTenderV2"));
  svg.append(
    t(50, 178, "pays only on 2 of 3 valid signatures", {
      "font-size": 12,
      fill: C.ink2,
    }),
  );
  svg.append(
    path("M240 194 V240", {
      stroke: C.accent,
      "stroke-width": 1.5,
      "marker-end": "url(#ktp-acc)",
    }),
  );
  svg.append(box(170, 244, 154, 70));
  svg.append(t(184, 268, "Treasury funds", { "font-weight": 600, "font-size": 13 }));
  svg.append(t(184, 288, "move on 2 of 3", { "font-size": 12, fill: C.accent }));
  svg.append(
    box(16, 244, 138, 76, {
      stroke: C.stamp,
      "stroke-opacity": 0.9,
      "stroke-dasharray": "4 3",
    }),
  );
  svg.append(
    t(28, 266, "Attacker", {
      "font-weight": 600,
      "font-size": 12.5,
      fill: C.stamp,
    }),
  );
  svg.append(t(28, 284, "holds the account's", { "font-size": 11.5, fill: C.ink2 }));
  svg.append(m(28, 302, "secp256k1 key", { "font-size": 11.5 }));
  svg.append(path("M60 242 V214", { stroke: C.stamp, "stroke-dasharray": "4 3" }));
  svg.append(cross(60, 204));
  svg.append(
    t(76, 224, "refused", {
      "font-size": 11.5,
      fill: C.stamp,
      "font-weight": 600,
    }),
  );
  return svg;
}
