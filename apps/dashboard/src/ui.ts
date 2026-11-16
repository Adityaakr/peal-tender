/**
 * ui.ts - the small toolkit the pages are built from.
 *
 * Every piece of text goes in through `textContent` (never innerHTML): addresses,
 * token symbols and proposal files come from the chain or from whoever sent the
 * file, so they are data, not markup. Icons are fixed inline SVG paths defined here.
 */
import { formatUnits } from "viem";

type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

/** Build an element: h("div.card.stat", { title: "x" }, child, ...). */
export function h(tag: string, attrs?: Attrs | Child, ...children: Child[]): HTMLElement {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs && !(attrs instanceof Node) && typeof attrs === "object") {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
      else if (k === "class") el.className += ` ${v}`;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  } else if (attrs !== undefined) {
    children.unshift(attrs as Child);
  }
  for (const c of children) append(el, c);
  return el;
}

export function append(el: Element, c: Child): void {
  if (c === null || c === undefined || c === false) return;
  el.append(c instanceof Node ? c : document.createTextNode(String(c)));
}

// ---------------------------------------------------------------- icons

const PATHS: Record<string, string> = {
  check: "M3 8.5l3 3 7-7",
  cross: "M4 4l8 8M12 4l-8 8",
  clock: "M8 4v4l2.5 2M8 15A7 7 0 108 1a7 7 0 000 14z",
  dot: "M8 5.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z",
  arrow: "M3 8h10M9 4l4 4-4 4",
  key: "M10 6a3 3 0 11-6 0 3 3 0 016 0zM9 8l5 5M12 11l1.5-1.5",
  shield: "M8 1.5l5.5 2v4c0 3.3-2.3 5.9-5.5 7-3.2-1.1-5.5-3.7-5.5-7v-4z",
  lock: "M4.5 7V5a3.5 3.5 0 017 0v2M3.5 7h9v7h-9z",
  pause: "M5.5 3.5v9M10.5 3.5v9",
  gavel: "M3 13h7M6 9l5-5M8.5 2.5l5 5M4.5 7.5l5 5",
  coin: "M8 15A7 7 0 108 1a7 7 0 000 14zM8 4.5v7M6 6.2c0-.9.9-1.5 2-1.5s2 .6 2 1.5-.9 1.3-2 1.5-2 .6-2 1.5.9 1.5 2 1.5 2-.6 2-1.5",
  doc: "M4 1.5h5.5L12.5 4.5v10h-8.5zM9.5 1.5v3h3",
  upload: "M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13.5h10",
  copy: "M5.5 5.5h8v8h-8zM2.5 10.5v-8h8",
};

export function icon(name: keyof typeof PATHS | string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", PATHS[name] ?? PATHS.dot!);
  svg.append(p);
  return svg;
}

/** The Peal Tender mark: a vault ring with three signer dots, two lit. */
export function mark(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 26 26");
  svg.setAttribute("class", "mark");
  svg.setAttribute("aria-hidden", "true");
  const ring = document.createElementNS(ns, "circle");
  for (const [k, v] of Object.entries({ cx: "13", cy: "13", r: "11", fill: "none", stroke: "#1e5b46", "stroke-width": "2" })) {
    ring.setAttribute(k, v);
  }
  svg.append(ring);
  const dots: [number, number, boolean][] = [
    [13, 7.5, true],
    [8.2, 16, true],
    [17.8, 16, false],
  ];
  for (const [cx, cy, on] of dots) {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", "2.6");
    c.setAttribute("fill", on ? "#1e5b46" : "#fff");
    c.setAttribute("stroke", "#1e5b46");
    c.setAttribute("stroke-width", "1.6");
    svg.append(c);
  }
  return svg;
}

// ---------------------------------------------------------------- pieces

export type Tone = "ok" | "bad" | "wait" | "warn" | "plain";

/** A status chip: always an icon and a word, never colour alone. */
export function chip(text: string, tone: Tone = "plain", iconName?: string): HTMLElement {
  const fallback = { ok: "check", bad: "cross", wait: "clock", warn: "pause", plain: "dot" }[tone];
  return h(`span.chip${tone === "plain" ? "" : `.${tone}`}`, icon(iconName ?? fallback), text);
}

/** A copyable hash or address, shortened for display, full on hover and when copied. */
export function hash(value: string, opts: { full?: boolean; label?: string } = {}): HTMLElement {
  const shown = opts.full || value.length <= 14 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
  const b = h("button.hash", { type: "button", title: `${value} (click to copy)`, "aria-label": `copy ${opts.label ?? value}` }, shown);
  b.addEventListener("click", () => {
    void navigator.clipboard?.writeText(value).then(() => {
      b.classList.add("copied");
      setTimeout(() => b.classList.remove("copied"), 1200);
    });
  });
  return b;
}

export function meter(fraction: number, tone: "" | "full" | "good" = "", label?: string): HTMLElement {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const m = h(`div.meter${tone ? `.is-${tone}` : ""}`, {
    role: "meter",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": Math.round(f * 100),
    "aria-label": label ?? "",
  });
  m.append(h("span", { style: `width:${(f * 100).toFixed(1)}%` }));
  return m;
}

export function stat(label: string, value: string, unit?: string, sub?: Node | string, extra?: Node): HTMLElement {
  return h(
    "div.card.stat",
    h("div.label", label),
    h("div.value", value, unit ? h("span.unit", unit) : null),
    extra ?? null,
    sub ? h("div.sub", sub) : null,
  );
}

export function skeleton(lines = 3): HTMLElement {
  const box = h("div.card");
  for (let i = 0; i < lines; i++) box.append(h("div.skeleton", { style: `width:${90 - i * 18}%;margin:${i ? 10 : 0}px 0 0` }));
  return box;
}

export function table(head: (string | { text: string; num?: boolean })[], rows: (Child | Child[])[][], empty = "Nothing yet."): HTMLElement {
  const thead = h(
    "thead",
    h("tr", ...head.map((c) => (typeof c === "string" ? h("th", c) : h("th", { class: c.num ? "num" : "" }, c.text)))),
  );
  const tbody = h("tbody");
  if (rows.length === 0) tbody.append(h("tr", h("td", { colspan: head.length, class: "empty" }, empty)));
  for (const r of rows) {
    const tr = h("tr");
    r.forEach((cell, i) => {
      const hd = head[i];
      const td = h("td", { class: typeof hd === "object" && hd.num ? "num" : "" });
      for (const c of Array.isArray(cell) ? cell : [cell]) append(td, c);
      tr.append(td);
    });
    tbody.append(tr);
  }
  return h("div.card.flush", h("div.table-wrap", h("table", thead, tbody)));
}

// ---------------------------------------------------------------- formatting

/** A token amount with grouping and at most `max` fraction digits, trailing zeros dropped. */
export function amount(v: bigint, decimals: number, max = 4): string {
  const s = formatUnits(v, decimals);
  const [i, f = ""] = s.split(".");
  const int = BigInt(i!).toLocaleString("en-US");
  const frac = f.slice(0, max).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

export function duration(seconds: bigint | number): string {
  let s = Math.max(0, Math.round(Number(seconds)));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const hrs = Math.floor(s / 3600);
  s -= hrs * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d) return hrs ? `${d}d ${hrs}h` : `${d}d`;
  if (hrs) return m ? `${hrs}h ${m}m` : `${hrs}h`;
  if (m) return s ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

export function ago(ts: bigint | number, now: bigint | number): string {
  const d = Number(now) - Number(ts);
  return d < 5 ? "just now" : `${duration(d)} ago`;
}

export function dateTime(ts: bigint | number): string {
  return new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * Sixteen blocks in shades of the one accent, from a key's hash: a fingerprint people
 * can compare at a glance (two keys that differ differ visibly), without new colours.
 */
export function fingerprint(hex: string): HTMLElement {
  const box = h("div.fingerprint", { "aria-hidden": "true" });
  const b = hex.replace(/^0x/, "");
  const shades = ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1e5b46", "#1e40af"];
  for (let i = 0; i < 16; i++) {
    box.append(h("i", { style: `background:${shades[parseInt(b[i * 2] ?? "0", 16) % shades.length]}` }));
  }
  return box;
}
