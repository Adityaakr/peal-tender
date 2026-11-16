/**
 * Peal Tender: the treasury's web app. Read-only by design: it holds no keys and
 * sends nothing. It shows the vault and helps build and check proposals, which
 * the signers then sign with the CLI (`npm run sign-action`).
 */
import "./styles.css";
import { type Address } from "viem";
import { IS_LOCAL, RPC, activity, snapshot, vaultFromUrl, type Activity, type Snapshot } from "./data.ts";
import { h, hash, mark } from "./ui.ts";
import { overview } from "./pages/overview.ts";
import { signers } from "./pages/signers.ts";
import { timelock } from "./pages/timelock.ts";
import { tenders } from "./pages/tenders.ts";
import { sales } from "./pages/sales.ts";
import { activityPage } from "./pages/activity.ts";
import { propose } from "./pages/propose.ts";
import { connect } from "./pages/connect.ts";
import { landing } from "./pages/landing.ts";
import { mountPanel, setBuyToken, walletButton } from "./wallet/panel.ts";

export interface Ctx {
  vault: Address;
  snap: Snapshot;
  /** Resolves once the event log has been read (it is slower than the snapshot). */
  activity: () => Promise<Activity[]>;
  /** Re-render the current page. */
  refresh: () => void;
  /** Read the vault again, then re-render (after an action). */
  reload: () => void;
}

type Page = (ctx: Ctx, arg?: string) => HTMLElement | Promise<HTMLElement>;

const ROUTES: { path: string; label: string; page: Page; live: boolean; tab?: false }[] = [
  { path: "", label: "Home", page: landing, live: true, tab: false },
  { path: "vault", label: "Overview", page: overview, live: true },
  { path: "signers", label: "Signers", page: signers, live: true },
  { path: "timelock", label: "Timelock", page: timelock, live: true },
  { path: "tenders", label: "Tenders", page: tenders, live: true },
  { path: "sales", label: "Sealed sales", page: sales, live: true },
  { path: "activity", label: "Activity", page: activityPage, live: true },
  { path: "propose", label: "Propose", page: propose, live: false },
];

const app = document.getElementById("app")!;
let vault = vaultFromUrl();
let snap: Snapshot | undefined;
let activityCache: { at: number; p: Promise<Activity[]> } | undefined;
let error = "";
let rendering = 0;

function route(): { r: (typeof ROUTES)[number]; arg?: string } {
  const [path = "", arg] = location.hash.replace(/^#\/?/, "").split("/");
  return { r: ROUTES.find((x) => x.path === path) ?? ROUTES[0]!, arg };
}

function getActivity(): Promise<Activity[]> {
  if (!vault || !snap) return Promise.resolve([]);
  if (!activityCache || Date.now() - activityCache.at > 30_000) {
    const v = vault;
    const latest = snap.block.number;
    activityCache = { at: Date.now(), p: activity(v, latest).catch(() => []) };
  }
  return activityCache.p;
}

function header(): HTMLElement {
  const pill = h(
    `span.net-pill${IS_LOCAL ? ".is-local" : ""}${error ? ".is-down" : ""}`,
    { title: RPC },
    h("span.net-dot"),
    IS_LOCAL ? "Local node" : "QoreChain testnet",
    snap ? h("span.muted", ` · block ${snap.block.number.toLocaleString("en-US")}`) : null,
  );
  const { r } = route();
  const queued = snap?.ops.filter((o) => o.state === "Queued" && !o.void && !o.lapsed).length ?? 0;
  const tabs = h(
    "nav.tabs",
    { "aria-label": "Sections" },
    ...ROUTES.filter((x) => x.tab !== false).map((x) =>
      h(
        "a",
        { href: `#/${x.path}`, "aria-current": x === r ? "page" : undefined },
        x.label,
        x.path === "timelock" && queued > 0 ? h("span.count", { title: `${queued} queued` }, queued) : null,
      ),
    ),
  );
  return h(
    "header.wrap",
    h(
      "div.site-header",
      h(
        "div.identity",
        h("a.wordmark", { href: "#/" }, mark(), "Peal Tender"),
        h("div.tagline", "A treasury held by post-quantum signatures, on QoreChain."),
      ),
      h(
        "div.header-meta",
        pill,
        r.tab === false ? h("a.btn.btn-small", { href: "#/vault" }, "Open the app") : vault ? hash(vault, { label: "vault address" }) : null,
        walletButton(),
      ),
    ),
    vault && r.tab !== false ? tabs : null,
  );
}

function footer(): HTMLElement {
  return h(
    "footer.wrap",
    h(
      "div.site-footer",
      "Treasury keys never touch this page: signers sign proposals with ",
      h("span.mono", "npm run sign-action"),
      ". A guest account, if you make one, lives only in this browser. Refreshes every 15 seconds. ",
      h("a", { href: "https://github.com/Adityaakr/peal-tender", target: "_blank", rel: "noopener" }, "Source"),
      error ? h("div", { style: "color:var(--red);margin-top:6px" }, error) : null,
    ),
  );
}

async function render(force = false): Promise<void> {
  const id = ++rendering;
  const { r, arg } = route();
  if (!force && !r.live && app.dataset.route === location.hash) {
    // Do not redraw a form under someone's fingers; refresh only the chrome.
    app.firstElementChild?.replaceWith(header());
    return;
  }
  let body: HTMLElement;
  if (r.tab === false) {
    body = await landing({ vault, snap, activity: getActivity, refresh: () => void render(true), reload: () => void load(true) } as Ctx);
  } else if (!vault) {
    body = connect((v) => {
      vault = v;
      const q = new URLSearchParams(location.search);
      q.set("vault", v);
      history.replaceState(null, "", `?${q}${location.hash}`);
      void load(true);
    });
  } else if (!snap) {
    body = h("div.empty", error || "Reading the vault…");
  } else {
    const ctx: Ctx = { vault, snap, activity: getActivity, refresh: () => void render(true), reload: () => void load(true) };
    try {
      body = await r.page(ctx, arg);
    } catch (e) {
      body = h("div.note.bad", `Could not draw this page: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (id !== rendering) return;
  const main = h("main.wrap.page-enter", body);
  app.replaceChildren(header(), main, footer());
  app.dataset.route = location.hash;
}

async function load(force = false): Promise<void> {
  if (!vault) return void render(true);
  try {
    snap = await snapshot(vault);
    setBuyToken(snap.buy);
    error = "";
  } catch (e) {
    error = `Could not read the vault at ${vault}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;
  }
  await render(force);
}

mountPanel();
window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  void render(true);
});
void load(true);
setInterval(() => void load(false), 15_000);
