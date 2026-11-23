/**
 * panel.ts - the wallet drawer: a guest account (the one that acts), QoreX (identity
 * and funding the guest), MetaMask (identity and network), and the running log.
 */
import { encodeFunctionData, parseAbi, parseUnits, type Address } from "viem";
import { AUCTION, DASHBOARD_FAUCET, IS_LOCAL, QOREX_HELP } from "../config.ts";
import { chip, h, hash, icon, amount } from "../ui.ts";
import * as guest from "./guest.ts";
import * as metamask from "./metamask.ts";
import * as qorex from "./qorex.ts";
import { act, emit, log, refreshGuest, setOpenPanel, state, subscribe } from "./store.ts";

let buyToken: { address: Address; symbol: string; decimals: number } | undefined;
export function setBuyToken(t: { address: Address; symbol: string; decimals: number }): void {
  buyToken = t;
}

const faucetAbi = parseAbi([
  "function claim(uint256 amount)",
  "function maxPerClaim() view returns (uint256)",
  "function claimableBy(address who) view returns (uint256 amount, uint64 availableAt)",
]);
const mintAbi = parseAbi(["function mint(address to, uint256 amount)"]);
const balAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

let root: HTMLElement | undefined;
let open = false;
let showPhrase = false;
let tokenBal: bigint | undefined;

export function mountPanel(): void {
  root = h("aside.wallet", { "aria-label": "Wallet", "aria-hidden": "true" });
  const scrim = h("div.wallet-scrim");
  scrim.addEventListener("click", () => setOpen(false));
  document.body.append(scrim, root);
  setOpenPanel(() => setOpen(true));
  subscribe(draw);
  // An action (an offer escrows tokens, a claim returns them) changes the token
  // balance: read it again when one finishes, not only when the panel opens.
  let wasBusy = false;
  subscribe(() => {
    if (wasBusy && !state.busy) void refreshToken();
    wasBusy = Boolean(state.busy);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setOpen(false);
  });
  draw();
}

export function setOpen(v: boolean): void {
  open = v;
  document.body.classList.toggle("wallet-open", v);
  root?.setAttribute("aria-hidden", v ? "false" : "true");
  if (v) void refreshToken();
  draw();
}

async function refreshToken(): Promise<void> {
  if (!state.guest || !buyToken) return;
  try {
    tokenBal = (await guest.evm.readContract({ address: buyToken.address, abi: balAbi, functionName: "balanceOf", args: [state.guest.evm as Address] })) as bigint;
    draw();
  } catch {
    // shown as unknown
  }
}

/** The header button: "Connect" or the guest's short address. */
export function walletButton(): HTMLElement {
  const g = state.guestStatus;
  const b = h(
    "button.btn.btn-small.wallet-btn",
    { type: "button", "aria-haspopup": "dialog" },
    icon("key"),
    g ? `${g.evm.slice(0, 6)}…${g.evm.slice(-4)}` : state.qorex ? "QoreX connected" : "Connect",
  );
  b.addEventListener("click", () => setOpen(true));
  return b;
}

function section(title: string, ...children: (Node | string | null)[]): HTMLElement {
  return h("section.wallet-section", h("h3", title), ...children);
}

function guestSection(): HTMLElement {
  const g = state.guestStatus;
  if (!state.guest || !g) {
    const ta = h("textarea.input", { rows: 3, placeholder: "24-word recovery phrase", "aria-label": "recovery phrase" }) as HTMLTextAreaElement;
    ta.style.minHeight = "70px";
    const create = h("button.btn.btn-primary", { type: "button" }, "Create a guest account");
    create.addEventListener("click", async () => {
      create.setAttribute("disabled", "");
      state.error = undefined;
      try {
        await guest.create();
        await refreshGuest();
      } catch (e) {
        state.error = e instanceof Error ? e.message : String(e);
        emit();
      }
    });
    const imp = h("button.btn.btn-small", { type: "button" }, "Import");
    imp.addEventListener("click", async () => {
      try {
        await guest.importMnemonic(ta.value);
        await refreshGuest();
      } catch (e) {
        state.error = e instanceof Error ? e.message : String(e);
        emit();
      }
    });
    return section(
      "Guest account",
      h(
        "p.small.muted",
        "A fresh testnet account made in this browser, with its own ML-DSA-87 key. It is what sends your offers and claims: it registers its post-quantum key, then opens a short window scoped to the contracts it calls, as QoreChain requires.",
      ),
      create,
      h("details.small", { style: "margin-top:10px" }, h("summary", "I have a recovery phrase"), h("div", { style: "margin-top:8px;display:grid;gap:8px" }, ta, imp)),
    );
  }

  const decimals = g.qorDecimals;
  const qorText = `${amount(g.qor, decimals, 3)} QOR`;
  const funded = g.qor >= (IS_LOCAL ? 10n ** 17n : 300_000n);
  const fundRow = h("div.wallet-actions");
  if (IS_LOCAL) {
    const b = h("button.btn.btn-small", { type: "button" }, "Add 10 test QOR (local node)");
    b.addEventListener("click", async () => {
      await guest.fundLocal(state.guest!);
      await refreshGuest();
    });
    fundRow.append(b);
  } else {
    if (state.qorex) {
      const amt = h("input.input", { value: "2", "aria-label": "QOR to send", style: "width:70px;min-height:30px;padding:4px 8px" }) as HTMLInputElement;
      const b = h("button.btn.btn-small.btn-primary", { type: "button" }, "Send from QoreX");
      b.addEventListener("click", async () => {
        try {
          const uqor = parseUnits(amt.value.trim() || "0", 6);
          log(`Asking QoreX to send ${amt.value} QOR to your guest account…`);
          const tx = await qorex.sendQor(state.qorex!.cosmos, g.cosmos, uqor);
          log(`QoreX sent it (tx ${tx.slice(0, 10)}…).`);
          setTimeout(() => void refreshGuest(), 4000);
        } catch (e) {
          if (e instanceof qorex.Declined) {
            log(e.message);
            return;
          }
          state.error = e instanceof Error ? e.message : String(e);
          emit();
        }
      });
      fundRow.append(amt, b);
    }
    fundRow.append(h("a.btn.btn-small", { href: DASHBOARD_FAUCET, target: "_blank", rel: "noopener" }, "Dashboard faucet"));
  }

  const tokenRow = h("div.wallet-actions");
  if (buyToken) {
    const b = h("button.btn.btn-small", { type: "button" }, `Get test ${buyToken.symbol}`);
    b.addEventListener("click", async () => {
      if (IS_LOCAL) {
        await act(`Get 100 test ${buyToken!.symbol}`, [
          { to: buyToken!.address, data: encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [state.guest!.evm as Address, 100n * 10n ** BigInt(buyToken!.decimals)] }), label: `Mint 100 ${buyToken!.symbol}` },
        ]);
      } else {
        const max = (await guest.evm.readContract({ address: AUCTION.faucet, abi: faucetAbi, functionName: "maxPerClaim" })) as bigint;
        await act(`Get test ${buyToken!.symbol}`, [
          { to: AUCTION.faucet, data: encodeFunctionData({ abi: faucetAbi, functionName: "claim", args: [max] }), label: `Claim ${amount(max, buyToken!.decimals)} ${buyToken!.symbol} from the demo faucet` },
        ]);
      }
      void refreshToken();
    });
    tokenRow.append(b);
  }

  const phrase = h("div");
  if (showPhrase) {
    phrase.append(
      h("div.note.warn", { style: "margin-top:8px" }, "Anyone with this phrase controls this test account. Keep it to restore the account in another browser; never use it for real funds."),
      h("pre.code", { style: "white-space:pre-wrap;margin-top:8px" }, guest.savedMnemonic() ?? ""),
    );
  }
  const toggle = h("button.btn.btn-small", { type: "button" }, showPhrase ? "Hide recovery phrase" : "Back up");
  toggle.addEventListener("click", () => {
    showPhrase = !showPhrase;
    draw();
  });
  const forget = h("button.btn.btn-small", { type: "button" }, "Forget");
  forget.addEventListener("click", () => {
    if (!confirm("Forget this guest account in this browser? Without its recovery phrase it cannot be restored.")) return;
    guest.forget();
    showPhrase = false;
    void refreshGuest();
  });

  return section(
    "Guest account",
    h(
      "dl.kv",
      h("dt", "Address"),
      h("dd", hash(g.evm, { label: "guest EVM address" })),
      h("dt", "Native"),
      h("dd", hash(g.cosmos, { label: "guest qor address" })),
      h("dt", "Balance"),
      h("dd", qorText, " ", funded ? null : chip("needs QOR", "warn")),
      h("dt", buyToken?.symbol ?? "Token"),
      h("dd", tokenBal === undefined || !buyToken ? "…" : amount(tokenBal, buyToken.decimals)),
      h("dt", "PQ key"),
      h("dd", IS_LOCAL ? chip("Local node: not needed", "plain") : g.keyRegistered ? (g.keyIsOurs ? chip("Registered", "ok") : chip("Another key", "bad")) : chip("Registers on first action", "wait")),
    ),
    h("div.small.muted", { style: "margin-top:10px" }, "1. Fund it"),
    fundRow,
    h("div.small.muted", { style: "margin-top:10px" }, `2. Get ${buyToken?.symbol ?? "tokens"} to offer`),
    tokenRow,
    h("div.wallet-actions", { style: "margin-top:12px" }, toggle, forget),
    phrase,
  );
}

function qorexSection(): HTMLElement {
  if (state.qorex) {
    return section(
      "QoreX",
      h("dl.kv", h("dt", "Native"), h("dd", hash(state.qorex.cosmos, { label: "QoreX address" })), state.qorex.evm ? h("dt", "EVM") : null, state.qorex.evm ? h("dd", hash(state.qorex.evm, { label: "QoreX EVM address" })) : null),
      h("p.small.muted", "QoreX funds your guest account with one transfer you approve in QoreX. It cannot send contract calls for pages yet, so the guest account does those."),
    );
  }
  const b = h("button.btn", { type: "button", disabled: qorex.available() ? undefined : true }, "Connect QoreX");
  b.addEventListener("click", async () => {
    try {
      state.qorex = await qorex.connect();
      emit();
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      emit();
    }
  });
  return section(
    "QoreX",
    h("p.small.muted", "QoreChain's own wallet. Connect it to fund your guest account straight from QoreX."),
    b,
    qorex.available() ? null : h("p.small", { style: "margin:8px 0 0" }, "Not found in this browser. ", h("a", { href: QOREX_HELP, target: "_blank", rel: "noopener" }, "Get QoreX")),
  );
}

function metamaskSection(): HTMLElement {
  if (state.metamask) {
    return section(
      state.metamask.wallet,
      h("dl.kv", h("dt", "Address"), h("dd", hash(state.metamask.address, { label: "MetaMask address" })), h("dt", "Network"), h("dd", state.metamask.onQoreChain ? chip("QoreChain testnet", "ok") : chip("Not switched", "warn"))),
      h(
        "p.small.muted",
        "QoreChain accepts an EVM transaction only with a post-quantum key and a window, which MetaMask cannot make, so actions go through your guest account.",
      ),
    );
  }
  const name = metamask.available();
  const b = h("button.btn", { type: "button", disabled: name ? undefined : true }, `Connect ${name ?? "MetaMask"}`);
  b.addEventListener("click", async () => {
    try {
      state.metamask = await metamask.connect();
      emit();
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      emit();
    }
  });
  return section("MetaMask", h("p.small.muted", "Connects and adds the QoreChain testnet network."), b);
}

function draw(): void {
  if (!root) return;
  const close = h("button.btn.btn-small", { type: "button", "aria-label": "Close" }, icon("cross"));
  close.addEventListener("click", () => setOpen(false));
  const logBox =
    state.busy || state.log.length || state.error
      ? h(
          "section.wallet-section",
          h("h3", state.busy ? `Working: ${state.busy}` : "Last action"),
          state.error ? h("div.note.bad", state.error) : null,
          h("ol.wallet-log", ...state.log.map((l) => h("li", l))),
        )
      : null;
  root.replaceChildren(
    h("div.wallet-head", h("div", h("strong", "Wallet"), h("div.small.muted", "Testnet only. Treasury signers sign in the CLI, never here.")), close),
    logBox ?? "",
    guestSection(),
    qorexSection(),
    metamaskSection(),
  );
  document.querySelectorAll(".wallet-btn").forEach((b) => b.replaceWith(walletButton()));
}
