import { type Ctx } from "../main.ts";
import { h } from "../ui.ts";
import { describe, feedItem, header, type Described } from "./common.ts";

const FILTERS: { key: "all" | Described["group"]; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "money", label: "Money" },
  { key: "timelock", label: "Timelock" },
  { key: "tenders", label: "Tenders" },
  { key: "sales", label: "Sealed sales" },
  { key: "signers", label: "Signers" },
];

let current: (typeof FILTERS)[number]["key"] = "all";

export async function activityPage(ctx: Ctx): Promise<HTMLElement> {
  const s = ctx.snap;
  const list = h("ul.feed", h("li", h("span"), h("div.muted.small", "Reading the vault's history…"), h("span")));
  const card = h("section.card.flush", list);
  const buttons = FILTERS.map((f) =>
    h("button", { type: "button", "aria-pressed": f.key === current ? "true" : "false" }, f.label),
  );
  const all = await ctx.activity();
  const draw = () => {
    const shown = all.filter((a) => current === "all" || describe(a, s).group === current);
    list.replaceChildren(...(shown.length ? shown.map((a) => feedItem(a, s)) : [h("li", h("span"), h("div.muted.small", "Nothing here yet."), h("span"))]));
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", FILTERS[i]!.key === current ? "true" : "false"));
  };
  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      current = FILTERS[i]!.key;
      draw();
    }),
  );
  draw();
  return h(
    "div",
    header(
      "Activity",
      "Everything the vault has done, newest first, read from its events. Actions signed by the treasury show which signers authorised them.",
    ),
    h("div.segmented", { style: "margin-bottom:14px", role: "group", "aria-label": "Filter" }, ...buttons),
    card,
  );
}
