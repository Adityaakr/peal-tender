/**
 * Peal Tender's landing page. Identity: apps/dashboard/DESIGN.md.
 *
 * The metaphor is a bank's payment order and statement of account: an order signed
 * by two of three signers, checked against the signature card on file
 * (pqcKeyStatus) and verified (pqcVerify), posted to a ledger; an order signed with a
 * stolen classical key is stamped refused. The ledger and the refusals on this page
 * are the drill vault's real records.
 */
import "../landing.css";
import { REPO } from "../config.ts";
import { type Ctx } from "../main.ts";
import { brandMark, duration, h, hash, icon } from "../ui.ts";
import { walletButton } from "../wallet/panel.ts";
import { openPanel, state as wallet } from "../wallet/store.ts";
import { fmt } from "./common.ts";
import { guideRoles, plan } from "./guide.ts";

import { C, m, s, SERIF, t } from "./svg.ts";
import { clearingChart, FLOW, flowDiagram, keysSingle, keysSinglePhone, keysTender, keysTenderPhone } from "./tender-diagrams.ts";

/**
 * A deterministic handwriting-like stroke: a prolate cycloid gives the joined loops of
 * cursive, a varying height gives tall and short letters, a larger first letter and an
 * underline finish it. Seeded, so each signer's signature is the same on every load.
 */
function signaturePath(x0: number, base: number, w: number, seed: number): string {
  const letters = 5 + seed;
  const steps = 220;
  const k = (w * 0.86) / (2 * Math.PI * letters);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const th0 = 2 * Math.PI * letters * u;
    // uneven letter widths and heights, a taller capital, an italic slant
    const th = th0 + 0.9 * Math.sin(th0 * 0.31 + seed * 2.3);
    const tall = Math.max(0, Math.sin(th0 * 0.5 + seed * 1.3));
    let amp = 6 + 6 * tall * tall + 4 * (0.5 + 0.5 * Math.sin(th0 * 0.77 + seed));
    if (u < 1 / letters) amp *= 1.9;
    const yy = amp * (0.5 - 0.5 * Math.cos(th));
    const x = x0 + k * th0 - 1.45 * k * Math.sin(th) + yy * 0.32;
    const y = base - 3 - yy - 4 * u;
    pts.push(`${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const ex = x0 + w * 0.86;
  pts.push(`Q${(ex + 8).toFixed(1)} ${(base - 2).toFixed(1)} ${(x0 + w * 0.5).toFixed(1)} ${(base + 1).toFixed(1)}`);
  pts.push(`T${(x0 + w * 0.06).toFixed(1)} ${(base + 2.5).toFixed(1)}`);
  return pts.join("");
}

/** Fine interleaved sine bands, as printed on cheques. Generated, a few hundred points. */
function guilloche(x0: number, y0: number, w: number, hgt: number): SVGElement {
  const g = s("g", {
    stroke: C.guilloche,
    "stroke-width": 0.6,
    fill: "none",
    opacity: 0.9,
  });
  for (let k = 0; k < 7; k++) {
    const pts: string[] = [];
    for (let i = 0; i <= 160; i++) {
      const x = x0 + (i / 160) * w;
      const ph = (i / 160) * Math.PI * 18;
      const y = y0 + hgt / 2 + (hgt / 2 - 2) * Math.sin(ph + k * 0.9) * Math.cos(ph / 6 + k * 0.4);
      pts.push(`${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    g.append(s("path", { d: pts.join("") }));
  }
  return g;
}

// ---------------------------------------------------------------- the payment order

function paymentOrder(): SVGSVGElement {
  const svg = s("svg", {
    viewBox: "0 0 640 610",
    class: "t-instrument",
    role: "img",
    "aria-label":
      "A payment order on PealTenderV2 for 250.00 fUSD, signed by signer 1 and signer 2 with ML-DSA-87, checked against the keys on file with pqcKeyStatus and verified on chain by pqcVerify. Beneath it, an order signed only with a stolen secp256k1 key, stamped refused with PqSignatureInvalid.",
  }) as SVGSVGElement;
  const defs = s("defs");
  const mk = s("marker", {
    id: "t-arrow",
    viewBox: "0 0 8 8",
    refX: 7,
    refY: 4,
    markerWidth: 7,
    markerHeight: 7,
    orient: "auto-start-reverse",
  });
  mk.append(s("path", { d: "M0 0L8 4L0 8z", fill: C.ink2 }));
  defs.append(mk);
  svg.append(defs);

  // the refused order, underneath
  const slip = s("g", { transform: "rotate(3 170 540)" });
  slip.append(
    s("rect", {
      x: 18,
      y: 430,
      width: 330,
      height: 160,
      rx: 3,
      fill: C.sheet,
      stroke: C.rule,
    }),
  );
  slip.append(t(36, 520, "Pay to", { fill: C.muted, "font-size": 11 }));
  slip.append(m(92, 520, "0xbad0…f00d", { "font-size": 11.5 }));
  slip.append(t(36, 542, "Amount", { fill: C.muted, "font-size": 11 }));
  slip.append(m(92, 542, "67.00 QOR", { "font-size": 11.5 }));
  slip.append(t(36, 566, "Signed with", { fill: C.muted, "font-size": 11 }));
  slip.append(m(110, 566, "secp256k1 only", { "font-size": 11.5 }));
  svg.append(slip);
  const stamp = s("g", { class: "t-stamp", transform: "rotate(-8 276 548)" });
  stamp.append(
    s("rect", {
      x: 212,
      y: 522,
      width: 128,
      height: 50,
      rx: 4,
      fill: C.sheet,
      "fill-opacity": 0.6,
      stroke: C.stamp,
      "stroke-width": 2.2,
    }),
  );
  stamp.append(
    s("rect", {
      x: 216,
      y: 526,
      width: 120,
      height: 42,
      rx: 2,
      fill: "none",
      stroke: C.stamp,
      "stroke-width": 0.8,
    }),
  );
  stamp.append(
    t(276, 548, "REFUSED", {
      "text-anchor": "middle",
      "font-weight": 600,
      "font-size": 17,
      "letter-spacing": "0.14em",
      fill: C.stamp,
    }),
  );
  stamp.append(
    m(276, 562, "PqSignatureInvalid", {
      "text-anchor": "middle",
      "font-size": 9.5,
      fill: C.stamp,
    }),
  );
  svg.append(stamp);

  // the order that clears
  const sheet = s("g", { transform: "rotate(-1.2 330 260)" });
  sheet.append(
    s("rect", {
      x: 40,
      y: 20,
      width: 572,
      height: 480,
      rx: 3,
      fill: C.sheet,
      stroke: C.rule,
      class: "t-sheet",
    }),
  );
  sheet.append(
    s("rect", {
      x: 52,
      y: 32,
      width: 548,
      height: 456,
      rx: 2,
      fill: "none",
      stroke: C.guilloche,
      "stroke-width": 0.8,
    }),
  );
  sheet.append(guilloche(52, 40, 548, 30));
  sheet.append(
    t(68, 98, "PAYMENT ORDER", {
      "font-size": 10.5,
      "font-weight": 600,
      "letter-spacing": "0.16em",
      fill: C.ink2,
    }),
  );
  sheet.append(m(584, 98, "nonce 42", { "text-anchor": "end", fill: C.muted }));
  sheet.append(s("text", { x: 68, y: 130, "font-family": SERIF, "font-size": 22, fill: C.ink }, "PealTenderV2"));
  sheet.append(m(584, 130, "QoreChain testnet", { "text-anchor": "end", fill: C.muted }));

  const field = (y: number, label: string, value: string, big = false) => {
    sheet.append(t(68, y, label, { fill: C.muted, "font-size": 11.5 }));
    sheet.append(m(168, y, value, big ? { "font-size": 24, "font-weight": 500 } : { "font-size": 12.5 }));
    sheet.append(s("line", { x1: 168, x2: 584, y1: y + 9, y2: y + 9, stroke: C.rule }));
  };
  field(170, "Pay to", "0x51cc…a9e2  (ops account)");
  field(212, "Amount", "250.00 fUSD", true);
  field(248, "Valid until", "17 Nov 2026 14:00 UTC, once");

  sheet.append(
    t(68, 314, "Authorised signatories", {
      "font-size": 11.5,
      "font-weight": 600,
      fill: C.ink2,
    }),
  );
  sheet.append(
    t(584, 314, "2 of 3 required", {
      "text-anchor": "end",
      "font-size": 11.5,
      fill: C.accent,
      "font-weight": 600,
    }),
  );
  const cols = [68, 244, 420];
  cols.forEach((x, i) => {
    const signed = i < 2;
    sheet.append(
      s("line", {
        x1: x,
        x2: x + 156,
        y1: 370,
        y2: 370,
        stroke: C.ink,
        "stroke-opacity": 0.6,
      }),
    );
    if (signed) {
      sheet.append(
        s("path", {
          d: signaturePath(x + 8, 360, 134, i + 1),
          fill: "none",
          stroke: C.accent,
          "stroke-width": 1.5,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          pathLength: 1,
          class: `t-sig t-sig-${i + 1}`,
        }),
      );
    } else {
      sheet.append(
        t(x + 78, 362, "not required", {
          "text-anchor": "middle",
          "font-size": 11,
          fill: C.muted,
        }),
      );
    }
    sheet.append(t(x, 388, `Signer ${i + 1}`, { "font-size": 12, "font-weight": 600 }));
    sheet.append(
      m(x, 404, signed ? "ML-DSA-87, 4,627 B" : "no signature", {
        "font-size": 10,
        fill: C.muted,
      }),
    );
  });

  // the keys on file, checked with the signatures by pqcVerify, give the seal
  sheet.append(
    s("rect", {
      x: 68,
      y: 426,
      width: 236,
      height: 50,
      rx: 3,
      fill: "none",
      stroke: C.ink,
      "stroke-opacity": 0.5,
      "stroke-dasharray": "3 3",
    }),
  );
  sheet.append(
    t(80, 446, "Keys on file for signers 1 to 3", {
      "font-size": 11.5,
      "font-weight": 600,
    }),
  );
  sheet.append(m(80, 464, "pqcKeyStatus  0x…0a02", { "font-size": 10.5, fill: C.ink2 }));
  sheet.append(
    s("path", {
      d: "M304 451 H470",
      fill: "none",
      stroke: C.ink2,
      "stroke-width": 1,
      "marker-end": "url(#t-arrow)",
    }),
  );
  sheet.append(
    m(387, 443, "pqcVerify  0x…0a01", {
      "text-anchor": "middle",
      "font-size": 10.5,
      fill: C.ink2,
    }),
  );
  sheet.append(
    t(387, 466, "checks both signatures", {
      "text-anchor": "middle",
      "font-size": 10.5,
      fill: C.muted,
    }),
  );

  const seal = s("g", { class: "t-seal" });
  seal.append(
    s("circle", {
      cx: 520,
      cy: 451,
      r: 40,
      fill: C.sheet,
      stroke: C.accent,
      "stroke-width": 1.6,
    }),
  );
  seal.append(
    s("circle", {
      cx: 520,
      cy: 451,
      r: 33,
      fill: "none",
      stroke: C.accent,
      "stroke-width": 0.7,
    }),
  );
  seal.append(
    t(520, 444, "VERIFIED", {
      "text-anchor": "middle",
      "font-size": 8.5,
      "font-weight": 600,
      "letter-spacing": "0.14em",
      fill: C.accent,
    }),
  );
  seal.append(
    s(
      "text",
      {
        x: 520,
        y: 465,
        "text-anchor": "middle",
        "font-family": SERIF,
        "font-size": 18,
        fill: C.accent,
      },
      "2 / 3",
    ),
  );
  sheet.append(seal);

  svg.append(sheet);
  return svg;
}

/** The same order drawn for a phone: one column of fields, larger figures. */
function paymentOrderPhone(): SVGSVGElement {
  const svg = s("svg", {
    viewBox: "0 0 360 600",
    class: "t-instrument",
    role: "img",
    "aria-label":
      "A payment order for 250.00 fUSD signed by signer 1 and signer 2 with ML-DSA-87 and verified on chain by pqcVerify. Beneath it, an order signed only with a stolen secp256k1 key, stamped refused.",
  }) as SVGSVGElement;
  const slip = s("g", { transform: "rotate(2.5 170 530)" });
  slip.append(
    s("rect", {
      x: 18,
      y: 462,
      width: 316,
      height: 120,
      rx: 3,
      fill: C.sheet,
      stroke: C.rule,
    }),
  );
  slip.append(t(34, 512, "Pay to", { fill: C.muted, "font-size": 11.5 }));
  slip.append(m(34, 530, "0xbad0…f00d", { "font-size": 12.5 }));
  slip.append(t(34, 554, "Signed with", { fill: C.muted, "font-size": 11.5 }));
  slip.append(m(34, 571, "secp256k1 only", { "font-size": 12.5 }));
  svg.append(slip);
  const stamp = s("g", { class: "t-stamp", transform: "rotate(-9 254 538)" });
  stamp.append(
    s("rect", {
      x: 188,
      y: 512,
      width: 132,
      height: 50,
      rx: 4,
      fill: "none",
      stroke: C.stamp,
      "stroke-width": 2.2,
    }),
  );
  stamp.append(
    s("rect", {
      x: 192,
      y: 516,
      width: 124,
      height: 42,
      rx: 2,
      fill: "none",
      stroke: C.stamp,
      "stroke-width": 0.8,
    }),
  );
  stamp.append(
    t(254, 539, "REFUSED", {
      "text-anchor": "middle",
      "font-weight": 600,
      "font-size": 17,
      "letter-spacing": "0.14em",
      fill: C.stamp,
    }),
  );
  stamp.append(
    m(254, 553, "PqSignatureInvalid", {
      "text-anchor": "middle",
      "font-size": 9.5,
      fill: C.stamp,
    }),
  );
  svg.append(stamp);

  const sheet = s("g", { transform: "rotate(-1 180 240)" });
  sheet.append(
    s("rect", {
      x: 12,
      y: 12,
      width: 336,
      height: 452,
      rx: 3,
      fill: C.sheet,
      stroke: C.rule,
      class: "t-sheet",
    }),
  );
  sheet.append(
    s("rect", {
      x: 20,
      y: 20,
      width: 320,
      height: 436,
      rx: 2,
      fill: "none",
      stroke: C.guilloche,
      "stroke-width": 0.8,
    }),
  );
  sheet.append(guilloche(20, 26, 320, 22));
  sheet.append(
    t(30, 74, "PAYMENT ORDER", {
      "font-size": 10.5,
      "font-weight": 600,
      "letter-spacing": "0.16em",
      fill: C.ink2,
    }),
  );
  sheet.append(m(330, 74, "nonce 42", { "text-anchor": "end", fill: C.muted }));
  sheet.append(s("text", { x: 30, y: 102, "font-family": SERIF, "font-size": 20, fill: C.ink }, "PealTenderV2"));
  const field = (y: number, label: string, value: string, big = false) => {
    sheet.append(t(30, y, label, { fill: C.muted, "font-size": 11.5 }));
    sheet.append(m(30, y + (big ? 26 : 18), value, big ? { "font-size": 24, "font-weight": 500 } : { "font-size": 13 }));
    sheet.append(
      s("line", {
        x1: 30,
        x2: 330,
        y1: y + (big ? 34 : 26),
        y2: y + (big ? 34 : 26),
        stroke: C.rule,
      }),
    );
  };
  field(130, "Pay to", "0x51cc…a9e2 (ops account)");
  field(178, "Amount", "250.00 fUSD", true);
  field(234, "Valid until", "17 Nov 2026 14:00 UTC");
  sheet.append(
    t(30, 290, "Signatories", {
      "font-size": 12,
      "font-weight": 600,
      fill: C.ink2,
    }),
  );
  sheet.append(
    t(330, 290, "2 of 3 required", {
      "text-anchor": "end",
      "font-size": 12,
      fill: C.accent,
      "font-weight": 600,
    }),
  );
  [30, 132, 234].forEach((x, i) => {
    const signed = i < 2;
    sheet.append(
      s("line", {
        x1: x,
        x2: x + 92,
        y1: 344,
        y2: 344,
        stroke: C.ink,
        "stroke-opacity": 0.6,
      }),
    );
    if (signed)
      sheet.append(
        s("path", {
          d: signaturePath(x + 4, 334, 80, i + 1),
          fill: "none",
          stroke: C.accent,
          "stroke-width": 1.4,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          pathLength: 1,
          class: `t-sig t-sig-${i + 1}`,
        }),
      );
    else
      sheet.append(
        t(x + 46, 336, "not needed", {
          "text-anchor": "middle",
          "font-size": 11,
          fill: C.muted,
        }),
      );
    sheet.append(t(x, 362, `Signer ${i + 1}`, { "font-size": 12.5, "font-weight": 600 }));
    sheet.append(
      m(x, 378, signed ? "ML-DSA-87" : "idle", {
        "font-size": 10.5,
        fill: C.muted,
      }),
    );
  });
  sheet.append(t(30, 414, "Checked against the keys", { "font-size": 12, fill: C.ink2 }));
  sheet.append(t(30, 431, "on file, by pqcKeyStatus", { "font-size": 12, fill: C.ink2 }));
  sheet.append(m(30, 447, "and pqcVerify", { "font-size": 11.5, fill: C.ink2 }));
  const seal = s("g", { class: "t-seal" });
  seal.append(
    s("circle", {
      cx: 292,
      cy: 420,
      r: 32,
      fill: C.sheet,
      stroke: C.accent,
      "stroke-width": 1.6,
    }),
  );
  seal.append(
    s("circle", {
      cx: 292,
      cy: 420,
      r: 26,
      fill: "none",
      stroke: C.accent,
      "stroke-width": 0.7,
    }),
  );
  seal.append(
    t(292, 416, "VERIFIED", {
      "text-anchor": "middle",
      "font-size": 8,
      "font-weight": 600,
      "letter-spacing": "0.12em",
      fill: C.accent,
    }),
  );
  seal.append(
    s(
      "text",
      {
        x: 292,
        y: 433,
        "text-anchor": "middle",
        "font-family": SERIF,
        "font-size": 14,
        fill: C.accent,
      },
      "2 / 3",
    ),
  );
  sheet.append(seal);
  svg.append(sheet);
  return svg;
}

// ---------------------------------------------------------------- pieces

function scrollTo(id: string) {
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return () =>
    document.getElementById(id)?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
}

/** The Peal family's marks, from docs/brand (light versions on Tender's paper). */
export const tenderMark = (size = 24) => brandMark("tender", size);
const auctionMark = (size = 22) => brandMark("auction", size);
const bidderMark = (size = 22) => brandMark("bidder", size);

function nav(): HTMLElement {
  const link = (label: string, id: string) => {
    const b = h("button.t-navlink", { type: "button" }, label);
    b.addEventListener("click", scrollTo(id));
    return b;
  };
  const bar = h(
    "header.t-nav",
    h(
      "div.t-wrap.t-nav-inner",
      h("a.t-wordmark", { href: "#/" }, tenderMark(24), h("span", "Peal Tender")),
      h(
        "nav.t-links",
        { "aria-label": "On this page" },
        link("How to use", "try"),
        link("How it works", "how"),
        link("Security", "attacks"),
        link("Proof", "statement"),
        link("Requirements", "requirements"),
      ),
      h("div.t-nav-ctas", walletButton(), h("a.btn.btn-primary.btn-small", { href: "#/vault" }, "Open the treasury")),
    ),
  );
  const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 4);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  return bar;
}

const num = (v: string, unit: string, cls = "") => h(`td.t-num${v ? "" : ".t-empty"}${cls}`, { "data-unit": unit }, v || "·");

// ---------------------------------------------------------------- the page

export async function landing(ctx: Partial<Ctx>): Promise<HTMLElement> {
  const snap = ctx.snap;
  const openTender = snap?.tenders.find((x) => x.id === snap.openTenderId);

  // ---- hero
  const guestBtn = h("button.btn.t-btn", { type: "button" }, wallet.guest ? "Open your wallet" : "Try it on testnet");
  guestBtn.addEventListener("click", () => openPanel());
  const hero = h(
    "section.t-hero",
    h(
      "div.t-wrap.t-hero-grid",
      h(
        "div.t-hero-copy",
        h("p.t-kicker", "Treasury vault · QoreChain"),
        h("h1.t-display", "Nothing leaves this treasury without ", h("em", "two signatures"), " the chain can verify."),
        h(
          "p.t-lead",
          "Peal Tender holds a project's funds in a vault contract. Every payment is an order signed by two of three signers with ML-DSA-87, a post-quantum signature that QoreChain checks itself. An order signed with a stolen classical key is refused.",
        ),
        h("div.t-ctas", h("a.btn.btn-primary.t-btn", { href: "#/vault" }, "Open the treasury", icon("arrow")), guestBtn),
        h(
          "dl.t-terms",
          h("div", h("dt", "Signers"), h("dd", snap ? `${snap.threshold} of ${snap.members.length}` : "2 of 3")),
          h("div", h("dt", "Signature"), h("dd", "ML-DSA-87")),
          h("div", h("dt", "Hold above limit"), h("dd", snap ? duration(snap.delay) : "15 min")),
        ),
        snap
          ? h(
              "p.t-live",
              "Live on the QoreChain testnet: vault ",
              hash(snap.vault, { label: "vault address" }),
              ` holds ${fmt(snap.pay.balance, snap.pay)} ${snap.pay.symbol}, read from the chain just now.`,
            )
          : null,
      ),
      h(
        "figure.t-hero-art",
        h("div.t-only-wide", paymentOrder()),
        h("div.t-only-phone", paymentOrderPhone()),
        h("figcaption.t-figcap", "An order clears when two signatures verify against the keys on file. The order beneath carries only a stolen classical key."),
      ),
    ),
  );

  // ---- why: who holds which key
  const head = (title: string, lead: string) => h("header.t-section-head", h("h2.t-title", title), h("p.t-lead", lead));
  const gh = (label: string, file: string) => h("a", { href: `${REPO}/blob/main/${file}`, target: "_blank", rel: "noopener" }, label);
  const why = h(
    "section.t-section",
    { id: "why" },
    h(
      "div.t-wrap",
      head(
        "Why a treasury needs this",
        "A blockchain account is a secp256k1 key, and its public key is on chain from the account's first transaction. A large enough quantum computer can derive the private key from it; the day that becomes possible is called Q-Day. A treasury that answers to one such key loses everything on that day.",
      ),
      h(
        "div.t-compare",
        h(
          "figure.t-fig",
          h("figcaption.t-fig-q", h("span.t-fig-tag", "Today"), "A treasury held by one key"),
          h("div.t-only-wide", keysSingle()),
          h("div.t-only-phone", keysSinglePhone()),
        ),
        h(
          "figure.t-fig",
          h("figcaption.t-fig-q", h("span.t-fig-tag.is-accent", "Peal Tender"), "A treasury held by three post-quantum keys"),
          h("div.t-only-wide", keysTender()),
          h("div.t-only-phone", keysTenderPhone()),
        ),
      ),
      h(
        "p.t-note",
        "The account's classical key still exists in Peal Tender: it pays fees and opens the transaction window. It cannot authorise a payment. Only ML-DSA-87 signatures, from keys each signer registered on QoreChain with proof of possession, can.",
      ),
    ),
  );

  // ---- how a payment clears
  const how = h(
    "section.t-section",
    { id: "how" },
    h(
      "div.t-wrap",
      head("How a payment clears", "Six steps in four places. Treasury keys sign off chain, on the signers' own machines. The chain checks every signature before the vault pays."),
      h(
        "figure.t-fig.t-flow-fig",
        h("div.t-only-wide.t-scroll", flowDiagram()),
        h(
          "ol.t-flow-list.t-only-phone",
          ...FLOW.map((st, i) => h("li", h("span.t-step-n", String(i + 1)), h("div", h("span.t-lane", st.lane), h("h3", st.title), ...st.lines.map((ln) => h("p", ln))))),
        ),
        h(
          "figcaption.t-figcap",
          "The scoped EVM window and the two precompiles are QoreChain's own. A window lets one account call only the listed contracts until it closes; the vault calls both precompiles for every order.",
        ),
      ),
    ),
  );

  // ---- what an attacker can and cannot do
  type Tone = "bad" | "warn" | "ok";
  const attack = (holds: string, sub: string, check: string, tone: Tone, outcome: string) =>
    h(
      "li.t-attack",
      h("div.t-att-holds", h("h3", holds), h("p", sub)),
      h("div.t-att-check", h("span.t-att-label", "Checked by"), h("p", check)),
      h(`div.t-att-out.${tone}`, h("span.t-att-mark", tone === "bad" ? "Refused" : tone === "warn" ? "Limited" : "Still works"), h("p", outcome)),
    );
  const attacks = h(
    "section.t-section",
    { id: "attacks" },
    h(
      "div.t-wrap",
      head(
        "What an attacker can and cannot do",
        "Each row is something an attacker might hold, the check that stops it, and the most it can achieve. The contract enforces every check, and the Foundry suite tests each one, with invariants over random sequences of actions and attacks.",
      ),
      h("div.t-att-headings", { "aria-hidden": "true" }, h("span", "The attacker holds"), h("span", "What the chain checks"), h("span", "The most it achieves")),
      h(
        "ol.t-attacks",
        attack(
          "The account's classical key",
          "secp256k1, stolen today or derived after Q-Day",
          "Two of three ML-DSA-87 signatures, each verified by pqcVerify",
          "bad",
          "Nothing moves. In the drill rehearsal, 9 of 9 attempts were refused.",
        ),
        attack(
          "One signer's ML-DSA-87 key",
          "a single post-quantum key",
          "A quorum of two different registered signers",
          "bad",
          "Nothing moves. It can only stop a held order, in public.",
        ),
        attack("An order already used", "a valid order, sent again", "The vault's nonce, and a deadline at most 24 hours ahead", "bad", "Nothing moves. Each order works once."),
        attack(
          "An order for another vault",
          "valid signatures, a different target",
          "The signed message names the chain and the vault",
          "bad",
          "Nothing moves. Signatures do not transfer.",
        ),
        attack(
          "Two signers' keys",
          "a quorum, stolen or colluding",
          "Today's allowance per token; anything larger is held in public",
          "warn",
          "At most one day's allowance. The third signer can stop anything held.",
        ),
        attack("Signers who disappear", "no one left to sign", "Settle, execute and collect need no signature", "ok", "Tenders still settle and sellers are still paid."),
      ),
    ),
  );

  // ---- statement of account (the drill vault's real ledger)
  type Entry = [string, string, string, string, string, string];
  const entries: Entry[] = [
    ["Opening deposit", "0x6f13abf1881778082cef33d6982df02535c6a4c816ddfc1155257b05b4233b4a", "+70.000", "", "", "plain transfer"],
    ["Sweep to the ops account", "0x3801d22e00ed7d6be98cfa77972b7ea4488c89dc7833d083cf6b9fa1a8bc82eb", "−3.000", "", "", "ML-DSA-87"],
    ["fUSD converted into the vault", "191073279F92FF8D5BC15299C67E3BB9C4C2FD3D0A59060BDCACEFCF0A70589A", "", "+0.202817", "", "native convert"],
    ["Tender 1 opened, budget 0.1 fUSD", "0x501ace7d5040b16fc147c4290f8aed80c10fc293d9f19e50b52746167af3bc76", "", "(0.100000)", "", "ML-DSA-87"],
    ["Tender 1 settled at 0.0013 fUSD", "0x39c0cc40ebd12f4e9bfcc453a245d290efb762def3c387802d23b6eef5ca3cc4", "", "", "+76.92", "ML-DSA-87"],
    ["Seller paid: 60 tPEAL at 0.0013", "0x2084f9436017c57596168569a0d40254e8e0095e00006779559b73f1873638fb", "", "−0.078000", "", "seller's claim"],
    ["Seller paid: 16.92 tPEAL at 0.0013", "0xed5a808ff4dbefa5910d326768a5a6b5e18bd8f1641c1e63b03fcfd2a177ca1c", "", "−0.021999", "", "seller's claim"],
  ];
  const ledger = h(
    "div.t-ledger-scroll",
    h(
      "table.t-ledger",
      h(
        "thead",
        h(
          "tr",
          h("th", { scope: "col" }, "Entry"),
          h("th", { scope: "col" }, "Transaction"),
          h("th.t-num", { scope: "col" }, "QOR"),
          h("th.t-num", { scope: "col" }, "fUSD"),
          h("th.t-num", { scope: "col" }, "tPEAL"),
          h("th", { scope: "col" }, "Authorised by"),
        ),
      ),
      h(
        "tbody",
        ...entries.map(([e, tx, q, f, p, a]) =>
          h(
            "tr",
            h("th", { scope: "row" }, e),
            h("td", hash(tx, { label: "transaction hash" })),
            num(q, "QOR"),
            num(f, "fUSD", f.startsWith("(") ? ".t-held" : ""),
            num(p, "tPEAL"),
            h("td.t-auth", a),
          ),
        ),
      ),
      h("tfoot", h("tr", h("th", { scope: "row" }, "Closing balance"), h("td"), num("67.000", "QOR"), num("0.102818", "fUSD"), num("76.92", "tPEAL"), h("td"))),
    ),
  );
  const refusals: [string, string, string][] = [
    ["Native transfer", "classical signature only", "pqc code 20"],
    ["Native transfer", "attacker's own ML-DSA-87 key", "pqc code 21"],
    ["Open an EVM window", "classical signature only", "pqc code 20"],
    ["Open an EVM window", "attacker's own key", "pqc code 21"],
    ["Re-register the signer's key", "classical", "pqc code 234"],
    ["EVM transfer", "no window", "no open window"],
    ["fUSD approval", "no window", "no open window"],
    ["vault.sweep, forged signature", "sent", "no open window"],
    ["vault.sweep, forged signature", "simulated", "PqSignatureInvalid"],
  ];
  const statement = h(
    "section.t-section",
    { id: "statement" },
    h(
      "div.t-wrap",
      h(
        "header.t-section-head",
        h("h2.t-title", "Statement of account"),
        h(
          "p.t-lead",
          "The first vault, deployed for QoreChain's Q-Day Drill, on 15 November 2026. Every entry is a real transaction; the closing balance is what the vault held that evening. That vault had one signer; the current version, live since 18 November 2026 and shown under Open the treasury, requires two of three.",
        ),
      ),
      h(
        "div.t-statement-meta",
        h(
          "span",
          "Account ",
          hash("0xc3EA5683C1f8D8594A1865D169D98B509b057D41", {
            label: "drill vault address",
          }),
        ),
        h("span", "Network qorechain-diana, EVM chain 9800"),
        h("span", "Period 15 Nov 2026"),
      ),
      ledger,
      h(
        "p.t-source",
        "Source: ",
        h(
          "a",
          {
            href: `${REPO}#deployed-testnet-qorechain-diana-evm-chain-id-9800`,
            target: "_blank",
            rel: "noopener",
          },
          "the repository's deployment record",
        ),
        ". Native-lane hashes are upper case; EVM hashes start with 0x.",
      ),
      h(
        "div.t-rejected",
        h(
          "div.t-rejected-head",
          h("h3.t-subtitle", "Instructions refused"),
          h(
            "p",
            "For the drill, the signer's classical secp256k1 key was handed over, as an attacker would hold it after Q-Day. A rehearsal with that key alone tried every route to the funds. None moved anything.",
          ),
        ),
        h(
          "ol.t-refused-list",
          ...refusals.map(([what, how, code]) => h("li", h("span.t-refused-what", what), h("span.t-refused-how", how), h("span.t-refused-stamp", "Refused"), h("code", code))),
        ),
        h(
          "p.t-source",
          "Source: ",
          h(
            "a",
            {
              href: `${REPO}/blob/main/THREAT_MODEL.md`,
              target: "_blank",
              rel: "noopener",
            },
            "THREAT_MODEL.md, section 7",
          ),
          ", run of 15 November 2026.",
        ),
      ),
    ),
  );

  // ---- one clearing price
  const fact = (k: string, v: Node | string) => h("div", h("dt", k), h("dd", v));
  const buyback = h(
    "section.t-section",
    { id: "buyback" },
    h(
      "div.t-wrap",
      head(
        "How a buyback clears at one price",
        "The treasury sets a budget and a price ladder; holders offer tokens at the lowest price they accept. The price climbs while the budget can pay every offer at or below it, and stops where it cannot. Everyone who sells is paid that one price, never less than their own offer.",
      ),
      h(
        "div.t-buyback",
        h(
          "figure.t-fig",
          h("figcaption.t-fig-q", h("span.t-fig-tag", "15 Nov 2026"), "Tender 1 of the drill vault"),
          h("div.t-only-wide", clearingChart()),
          h("div.t-only-phone", clearingChart(true)),
          h(
            "div.t-legend",
            h("span", h("i.t-sw.offered"), "Offered at or below the price"),
            h("span", h("i.t-sw.bought"), "Bought"),
            h("span", h("i.t-sw.line"), "What the budget buys at the price"),
          ),
        ),
        h(
          "dl.t-facts",
          fact("Budget", "0.1 fUSD"),
          fact("Offer 1", "60 tPEAL at 0.0010"),
          fact("Offer 2", "50 tPEAL at 0.0013"),
          fact("Clearing price", "0.0013 fUSD, for everyone"),
          fact("Bought", "76.92 tPEAL"),
          fact("Paid to sellers", "0.099999 fUSD"),
          fact("Settled in", hash("0x39c0cc40ebd12f4e9bfcc453a245d290efb762def3c387802d23b6eef5ca3cc4", { label: "settle transaction" })),
          h(
            "p.t-note",
            "PealTenderV2 can also sell through Peal Sealed Auction, where bids stay sealed until the close: startSealedSale draws on the same daily allowance, and anyone can collect the result.",
          ),
        ),
      ),
    ),
  );

  // ---- the mandate
  const live = (v: string, note?: string) => h("div.t-clause-value", h("span", v), note ? h("small", note) : null);
  const clause = (n: number, title: string, body: string, value?: HTMLElement) =>
    h("li.t-clause", h("span.t-clause-n", `§ ${n}`), h("div.t-clause-text", h("h3", title), h("p", body)), value ?? h("div"));
  const valueNote = snap ? "read live" : "testnet setting";
  const mandate = h(
    "section.t-section.t-mandate-section",
    { id: "mandate" },
    h(
      "div.t-wrap",
      h(
        "header.t-section-head",
        h("h2.t-title", "The mandate"),
        h("p.t-lead", "The rules the vault enforces, written the way a company files them with its bank. The contract, not a person, applies each one."),
      ),
      h(
        "ol.t-mandate",
        clause(
          1,
          "Signatories",
          "Three accounts, each with its own ML-DSA-87 key registered on QoreChain. Any two of them sign an instruction.",
          live(snap ? `${snap.threshold} of ${snap.members.length}` : "2 of 3", valueNote),
        ),
        clause(
          2,
          "Verification",
          "Each signature is checked on chain: the key comes from pqcKeyStatus, the signature from pqcVerify. Who sends the transaction grants nothing.",
          live("pqcVerify", "precompile 0x…0a01"),
        ),
        clause(3, "Single use", "Every instruction carries the vault's nonce and a deadline at most 24 hours ahead. It works once, and only before its deadline.", live("≤ 24 h")),
        clause(
          4,
          "Daily limit",
          "Payments, tender budgets and sealed sales draw on one allowance per token per UTC day, and leave at once while it lasts.",
          live(snap ? `${fmt(snap.pay.cap, snap.pay)} ${snap.pay.symbol}` : "1 fUSD", valueNote),
        ),
        clause(
          5,
          "Hold",
          "Anything above the limit, and any change to the signatories, the hold, the limits or the auction factory, waits in public for the hold period.",
          live(snap ? duration(snap.delay) : "15 min", valueNote),
        ),
        clause(6, "Stop", "During a hold, any one signatory can stop the instruction with a single signature.", live("1 signature")),
        clause(
          7,
          "Release",
          "When the hold ends, anyone may carry the instruction out. Settling a tender, paying its sellers and collecting a sealed sale are open to anyone too.",
          live("anyone"),
        ),
      ),
    ),
  );

  // ---- the category's requirements
  const reqRow = (need: string, how: (Node | string)[], state: string) => h("tr", h("th", { scope: "row" }, need), h("td", ...how), h("td.t-req-state", state));
  const requirements = h(
    "section.t-section",
    { id: "requirements" },
    h(
      "div.t-wrap",
      head(
        "The category's requirements",
        "QoreChain's Post-Quantum dApp category asks for a scoped EVM window, pqcVerify, a two-stage QCAI audit and Foundry or Hardhat tests. Each one, where it lives in the repository, and its state on 18 November.",
      ),
      h(
        "div.t-ledger-scroll.t-req-scroll",
        h(
          "table.t-req",
          h("thead", h("tr", h("th", { scope: "col" }, "Requirement"), h("th", { scope: "col" }, "In Peal Tender"), h("th", { scope: "col" }, "State"))),
          h(
            "tbody",
            reqRow(
              "Scoped EVM window",
              ["Each action opens a window scoped to the vault, fUSD, PEAL-T and the auction factory, sends, and closes it. ", gh("scripts/v2/window.ts", "scripts/v2/window.ts")],
              "In use by the drill vault and, since 18 Nov, the v2 vault",
            ),
            reqRow(
              "pqcVerify",
              [
                "Every order needs two of three ML-DSA-87 signatures: keys from pqcKeyStatus, signatures checked by pqcVerify. ",
                gh("src/PealTenderV2.sol", "src/PealTenderV2.sol"),
              ],
              "Live in the drill vault since 15 Nov; two of three in the v2 vault since 18 Nov",
            ),
            reqRow(
              "Two-stage QCAI audit",
              [
                "The Contract Auditor on the flattened source, the findings fixed, the frozen source audited again. ",
                h(
                  "a",
                  {
                    href: `${REPO}/tree/main/audits`,
                    target: "_blank",
                    rel: "noopener",
                  },
                  "audits/",
                ),
              ],
              "Stage 1 about 22 Nov, stage 2 on 29 Nov",
            ),
            reqRow(
              "Foundry tests",
              [
                "132 tests. For v2: 57 unit, 8 fuzz, 7 invariant, 4 cross-language vectors, 6 gas. ",
                h(
                  "a",
                  {
                    href: `${REPO}/tree/main/test`,
                    target: "_blank",
                    rel: "noopener",
                  },
                  "test/",
                ),
              ],
              "Passing in CI on every pull request",
            ),
            reqRow(
              "Q-Day Drill",
              ["The drill vault's classical key goes to the organisers; every path to the funds was refused in rehearsal. ", gh("DRILL.md", "DRILL.md")],
              "Drill day 18 Nov",
            ),
          ),
        ),
      ),
    ),
  );

  // ---- try it
  const createBtn = h("button.btn.btn-primary.btn-small", { type: "button" }, wallet.guest ? "Open your wallet" : "Create a guest account");
  createBtn.addEventListener("click", () => openPanel());
  const step = (n: number, title: string, body: string, action?: HTMLElement) =>
    h("li.t-step", h("span.t-step-n", String(n)), h("div", h("h3", title), h("p", body)), action ?? h("div"));
  // With the vault read, the guide is live (guide.ts): every role's steps, each saying
  // whether it can be done now. Before the first read, the four steps below stand in.
  const liveGuide = snap
    ? h(
        "section.t-section.t-guide",
        { id: "try" },
        h(
          "div.t-wrap",
          head(
            "How to use Peal Tender",
            "Who can do what with the live vault on the QoreChain testnet, from what it holds right now. A step that is not possible yet says what opens it. Test tokens have no value.",
          ),
          guideRoles(plan(snap, wallet), () => openPanel()),
          h("p.t-source", "Also in the app: ", h("a", { href: "#/guide" }, "How to use"), ", which follows your account as you go."),
        ),
      )
    : undefined;
  const tryIt = liveGuide ?? h(
    "section.t-section",
    { id: "try" },
    h(
      "div.t-wrap",
      h(
        "div.t-try",
        h(
          "header.t-try-head",
          h("h2.t-title", "Sell into a buyback"),
          h(
            "p.t-lead",
            "On the testnet, with an account created in your browser. It takes about five minutes. QoreX can fund the account; MetaMask can connect but cannot make the post-quantum signature QoreChain requires.",
          ),
        ),
        h(
          "ol.t-steps",
          step(1, "Create a guest account", "A new testnet account with its own ML-DSA-87 key, stored only in this browser.", createBtn),
          step(2, "Fund it", "About 1.5 test QOR covers every step: send it from QoreX, or claim it from the QoreChain dashboard faucet."),
          step(3, "Get test PEAL-T", "One click in the wallet panel claims 1,000 from a test-token faucet on the testnet."),
          step(
            4,
            "Make an offer",
            "Choose an amount and the lowest price you accept. Everyone who sells is paid the same clearing price.",
            openTender
              ? h("a.btn.btn-small", { href: `#/tenders/${openTender.id}` }, `Offer into tender ${openTender.id}`)
              : h("a.btn.btn-small", { href: "#/tenders" }, "See the tenders"),
          ),
        ),
      ),
    ),
  );

  // ---- footer: the shared Peal family line
  const footer = h(
    "footer.t-footer",
    h(
      "div.t-wrap",
      h(
        "div.t-foot-grid",
        h(
          "div",
          h("a.t-wordmark", { href: "#/" }, tenderMark(22), h("span", "Peal Tender")),
          h("p.t-foot-text", "A treasury vault on QoreChain whose every payment needs two post-quantum signatures."),
        ),
        h(
          "div.t-foot-col",
          h("div.t-foot-title", "Treasury"),
          h("a", { href: "#/vault" }, "Overview"),
          h("a", { href: "#/guide" }, "How to use"),
          h("a", { href: "#/tenders" }, "Tenders"),
          h("a", { href: "#/propose" }, "Propose"),
          h("a", { href: "#/activity" }, "Activity"),
        ),
        h(
          "div.t-foot-col",
          h("div.t-foot-title", "Records"),
          h("a", { href: REPO, target: "_blank", rel: "noopener" }, "Source"),
          h(
            "a",
            {
              href: `${REPO}/blob/main/THREAT_MODEL.md`,
              target: "_blank",
              rel: "noopener",
            },
            "Threat model",
          ),
          h(
            "a",
            {
              href: `${REPO}/tree/main/audits`,
              target: "_blank",
              rel: "noopener",
            },
            "Audits",
          ),
          h(
            "a",
            {
              href: `${REPO}/blob/main/DRILL.md`,
              target: "_blank",
              rel: "noopener",
            },
            "Q-Day Drill",
          ),
        ),
      ),
      h(
        "div.t-family",
        h("span.t-family-label", brandMark("peal", 18), "The Peal family"),
        h("span.t-family-item.is-current", tenderMark(18), "Peal Tender, the treasury"),
        h(
          "a.t-family-item",
          {
            href: "https://github.com/Adityaakr/peal-sealed-auction",
            target: "_blank",
            rel: "noopener",
          },
          auctionMark(18),
          "Peal Sealed Auction, the venue",
        ),
        h(
          "a.t-family-item",
          {
            href: "https://github.com/Adityaakr/peal-bidder",
            target: "_blank",
            rel: "noopener",
          },
          bidderMark(18),
          "Peal Bidder, the participant",
        ),
      ),
      h("div.t-foot-base", h("span", "Apache-2.0. Testnet only. Treasury keys never enter this page."), h("span", "Design language started from Peal.")),
    ),
  );

  return h("div.t-page", nav(), h("main", hero, tryIt, why, how, attacks, statement, buyback, mandate, requirements), footer);
}
