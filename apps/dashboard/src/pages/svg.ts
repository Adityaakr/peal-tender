/** Small SVG helpers and the drawing palette for Peal Tender's landing diagrams. */
const NS = "http://www.w3.org/2000/svg";
export const C = {
  ink: "#10231d",
  ink2: "#3d4d47",
  muted: "#677770",
  rule: "#d3dcd7",
  sheet: "#fcfdfc",
  guilloche: "#b9cfc5",
  accent: "#1e5b46",
  stamp: "#a3261a",
};
export const SERIF = "'IBM Plex Serif', Georgia, serif";
export const SANS = "'IBM Plex Sans', system-ui, sans-serif";
export const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

export type Attrs = Record<string, string | number>;
export function s(tag: string, a: Attrs = {}, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}
export const t = (x: number, y: number, str: string, a: Attrs = {}) => s("text", { x, y, "font-family": SANS, "font-size": 12, fill: C.ink, ...a }, str);
export const m = (x: number, y: number, str: string, a: Attrs = {}) => s("text", { x, y, "font-family": MONO, "font-size": 11, fill: C.ink, ...a }, str);

/** Arrowhead markers, one per colour, with ids prefixed so several drawings can share a page. */
export function arrowDefs(prefix: string, colors: Record<string, string>): SVGElement {
  const d = s("defs");
  for (const [name, color] of Object.entries(colors)) {
    const mk = s("marker", {
      id: `${prefix}-${name}`,
      viewBox: "0 0 8 8",
      refX: 7,
      refY: 4,
      markerWidth: 6.5,
      markerHeight: 6.5,
      orient: "auto-start-reverse",
    });
    mk.append(s("path", { d: "M0 0L8 4L0 8z", fill: color }));
    d.append(mk);
  }
  return d;
}

/** A path stroke with round ends. */
export const path = (d: string, a: Attrs = {}) =>
  s("path", {
    d,
    fill: "none",
    stroke: C.ink,
    "stroke-width": 1.25,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...a,
  });

/** A box with the drawing's hairline. */
export const box = (x: number, y: number, w: number, hh: number, a: Attrs = {}) =>
  s("rect", {
    x,
    y,
    width: w,
    height: hh,
    rx: 3,
    fill: C.sheet,
    stroke: C.ink,
    "stroke-opacity": 0.55,
    ...a,
  });
