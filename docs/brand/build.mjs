// Generates the Peal family's logo masters in docs/brand/ from one set of geometry.
//
//   npm i --no-save opentype.js@1.3.4 @fontsource/ibm-plex-sans@5.1.0
//   node docs/brand/build.mjs [apps/dashboard/src/brand-marks.ts ...]
//
// The wordmarks are IBM Plex Sans (SIL Open Font License) converted to outlines, so the
// SVG files need no font. PNG favicons are rendered separately by render-png.mjs.
//
// The system: every mark is drawn on a 24-unit grid with a 2-unit stroke and round
// joins, and every mark holds one solid dot. The dot is what each product keeps hold of:
// the bowl of the P (Peal), the seal on the payment order (Tender), the wax seal on the
// envelope (Sealed Auction), the agent on its leash (Bidder). In full colour only the
// dot (and Bidder's limit line) carries colour; everything else is ink.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(process.cwd(), "package.json"));
const opentype = require("opentype.js");
const here = dirname(fileURLToPath(import.meta.url));
const fontDir = join(process.cwd(), "node_modules/@fontsource/ibm-plex-sans/files");
const semibold = opentype.loadSync(join(fontDir, "ibm-plex-sans-latin-600-normal.woff"));
const regular = opentype.loadSync(join(fontDir, "ibm-plex-sans-latin-400-normal.woff"));

// ---------------------------------------------------------------- colour

/** The right edge of each mark's ink, so lockups space the wordmark optically, not from the grid. */
const RIGHT = { peal: 18.75, tender: 20.85, auction: 23, bidder: 21.5 };

export const PRODUCTS = {
  peal: {
    name: "Peal",
    role: "the family",
    light: { ink: "#16191d", dot: "#16191d" },
    dark: { ink: "#ece9e2", dot: "#ece9e2" },
    tile: { bg: "#16191d", ink: "#ece9e2", dot: "#ece9e2" },
  },
  tender: {
    name: "Tender",
    role: "the treasury",
    light: { ink: "#10231d", dot: "#1e5b46" },
    dark: { ink: "#e6eeea", dot: "#7cc4a2" },
    tile: { bg: "#1e5b46", ink: "#f1f4f2", dot: "#f1f4f2" },
  },
  auction: {
    name: "Sealed Auction",
    role: "the venue",
    light: { ink: "#0e1016", dot: "#9a6f24" },
    dark: { ink: "#ece8df", dot: "#d4a95b" },
    tile: { bg: "#0e1016", ink: "#ece8df", dot: "#d4a95b" },
  },
  bidder: {
    name: "Bidder",
    role: "the participant",
    light: { ink: "#0b1320", dot: "#0369a1", limit: "#c9261c" },
    dark: { ink: "#e3e8ee", dot: "#4cb0e6", limit: "#f2867a" },
    tile: { bg: "#0b1320", ink: "#e3e8ee", dot: "#4cb0e6", limit: "#f2867a" },
  },
};

// ---------------------------------------------------------------- the marks (24 x 24)

const SW = 2; // stroke width
const line = (d, c) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A mask that cuts a ring of `gap` around a dot, so the dot reads as separate at 16 px. */
const ringMask = (id, cx, cy, r) =>
  `<mask id="${id}" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28"><rect x="-2" y="-2" width="28" height="28" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#000"/></mask>`;

/** Each glyph returns SVG markup for the 24-unit grid, given colours {ink, dot, limit}. */
export const GLYPHS = {
  // A P drawn with the family stroke; its bowl holds the dot.
  peal: (c) =>
    line("M6.25 20.25V3.75", c.ink) +
    line("M6.25 3.75H11.5A6.25 6.25 0 0 1 11.5 16.25H6.25", c.ink) +
    `<circle cx="11.5" cy="10" r="2.75" fill="${c.dot}"/>`,

  // The payment order: a sheet with two ledger lines and its seal over the corner.
  tender: (c, id) =>
    ringMask(`${id}-m`, 17.25, 17.75, 5.1) +
    `<g mask="url(#${id}-m)">` +
    `<rect x="3.5" y="2.5" width="14" height="18" rx="2.25" fill="none" stroke="${c.ink}" stroke-width="${SW}"/>` +
    line("M7.25 7.5H13.75", c.ink) +
    line("M7.25 11.5H11.25", c.ink) +
    `</g>` +
    `<circle cx="17.25" cy="17.75" r="3.6" fill="${c.dot}"/>`,

  // The sealed envelope: the flap folded to a point, the wax seal on the point.
  auction: (c, id) =>
    ringMask(`${id}-m`, 12, 13.1, 4.7) +
    `<g mask="url(#${id}-m)">` +
    `<rect x="2" y="4.5" width="20" height="15" rx="2.25" fill="none" stroke="${c.ink}" stroke-width="${SW}"/>` +
    line("M3.2 6L12 13.1L20.8 6", c.ink) +
    `</g>` +
    `<circle cx="12" cy="13.1" r="3.2" fill="${c.dot}"/>`,

  // The agent on a leash: the leash runs in from its owner, the agent at its end, the
  // limit line just ahead (the same red line ends the budget meter on Bidder's console).
  bidder: (c) =>
    line("M3.25 12H12", c.ink) +
    `<circle cx="13.75" cy="12" r="3.6" fill="${c.dot}"/>` +
    line("M20.5 4V20", c.limit ?? c.ink),
};

// ---------------------------------------------------------------- wordmarks (outlined)

/** Outline `text` in `font` at `size`, starting at x with its baseline at y. Returns {d, width}. */
function outline(font, text, x, y, size, tracking = -0.01) {
  let cx = x;
  const parts = [];
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  glyphs.forEach((g, i) => {
    parts.push(g.getPath(cx, y, size).toPathData(2));
    let adv = g.advanceWidth * scale;
    if (i < glyphs.length - 1) adv += font.getKerningValue(g, glyphs[i + 1]) * scale + tracking * size;
    cx += adv;
  });
  return { d: parts.join(""), width: cx - x };
}

const CAP = 10.6; // cap height in grid units, set against the 24-unit mark
const SIZE = CAP / (semibold.tables.os2.sCapHeight / semibold.unitsPerEm);
const BASE = 12 + CAP / 2; // optical centre of the caps on the mark's centre line

/** "Peal" in semibold, then the product name in regular, one word space apart. */
function wordmark(key, x0) {
  const p = PRODUCTS[key];
  const a = outline(semibold, "Peal", x0, BASE, SIZE);
  if (key === "peal") return { paths: [{ d: a.d, role: "ink" }], width: a.width };
  const space = semibold.charToGlyph(" ").advanceWidth * (SIZE / semibold.unitsPerEm) * 0.92;
  const b = outline(regular, p.name, x0 + a.width + space, BASE, SIZE);
  return { paths: [{ d: a.d, role: "ink" }, { d: b.d, role: "ink2" }], width: a.width + space + b.width };
}

// ---------------------------------------------------------------- files

const svgDoc = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" width="${fmt(w * 4)}" height="${fmt(h * 4)}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
const fmt = (n) => String(Math.round(n * 100) / 100);

const VARIANTS = {
  light: (p) => ({ ...p.light, ink2: p.light.ink }),
  dark: (p) => ({ ...p.dark, ink2: p.dark.ink }),
  mono: () => ({ ink: "currentColor", dot: "currentColor", limit: "currentColor", ink2: "currentColor" }),
};

function tile(key, id) {
  const t = PRODUCTS[key].tile;
  // the glyph at 0.76 scale, centred on a 24-unit tile with a 5.5-unit corner
  const s = 0.76;
  const off = (24 - 24 * s) / 2;
  return `<rect width="24" height="24" rx="5.5" fill="${t.bg}"/><g transform="translate(${fmt(off)} ${fmt(off)}) scale(${s})">${GLYPHS[key](t, id)}</g>`;
}

const out = [];
for (const key of Object.keys(PRODUCTS)) {
  const p = PRODUCTS[key];
  const full = key === "peal" ? "Peal" : `Peal ${p.name}`;
  const dir = join(here, key);
  mkdirSync(dir, { recursive: true });
  for (const [variant, colours] of Object.entries(VARIANTS)) {
    const c = colours(p);
    const suffix = variant === "light" ? "" : `-${variant}`;
    // the mark alone
    writeFileSync(join(dir, `mark${suffix}.svg`), svgDoc(24, 24, GLYPHS[key](c, `${key}${suffix}`), `${full} mark`));
    // the wordmark alone
    const wm = wordmark(key, 0);
    writeFileSync(
      join(dir, `wordmark${suffix}.svg`),
      svgDoc(wm.width, 24, wm.paths.map((q) => `<path d="${q.d}" fill="${c[q.role]}"/>`).join(""), full),
    );
    // the lockup: mark, a gap of 0.3 of the mark, the wordmark
    const lw = wordmark(key, RIGHT[key] + 6.5);
    writeFileSync(
      join(dir, `lockup${suffix}.svg`),
      svgDoc(RIGHT[key] + 6.5 + lw.width, 24, GLYPHS[key](c, `${key}l${suffix}`) + lw.paths.map((q) => `<path d="${q.d}" fill="${c[q.role]}"/>`).join(""), full),
    );
  }
  writeFileSync(join(dir, "tile.svg"), svgDoc(24, 24, tile(key, `${key}t`), `${full} icon`));
  // the favicon is the tile, with a fixed small size for browsers
  writeFileSync(join(dir, "favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${tile(key, `${key}f`)}</svg>\n`);
  out.push(key);
}
// the marks as a module the web apps import, so pages draw the same geometry as the masters
const ts = [
  "// Generated by docs/brand/build.mjs from the Peal family's logo masters. Do not edit by hand.",
  "// Each entry is the mark's SVG markup on the 24-unit grid; `__ID__` makes its mask ids unique.",
  "",
  "export type PealProduct = " + Object.keys(PRODUCTS).map((k) => JSON.stringify(k)).join(" | ") + ";",
  "export type MarkVariant = \"light\" | \"dark\" | \"mono\";",
  "",
  "export const MARKS: Record<PealProduct, Record<MarkVariant, string>> = {",
  ...Object.keys(PRODUCTS).map((key) => {
    const p = PRODUCTS[key];
    const v = Object.entries(VARIANTS).map(([name, fn]) => `    ${name}: ${JSON.stringify(GLYPHS[key](fn(p), "__ID__"))},`);
    return `  ${key}: {\n${v.join("\n")}\n  },`;
  }),
  "};",
  "",
];
for (const target of process.argv.slice(2)) writeFileSync(target, ts.join("\n"));
console.log("wrote", out.join(", "));
