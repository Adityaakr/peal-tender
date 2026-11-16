import { type Address } from "viem";
import { h } from "../ui.ts";

/** Shown when no vault is known yet: enter its address. */
export function connect(onVault: (v: Address) => void): HTMLElement {
  const input = h("input.input.mono", { placeholder: "0x… the PealTenderV2 address", spellcheck: "false", "aria-label": "vault address" }) as HTMLInputElement;
  const msg = h("p.small", { style: "color:var(--red);min-height:1.6em;margin:8px 0 0" });
  const form = h(
    "form",
    { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:18px" },
    h("div", { style: "flex:1 1 320px" }, input),
    h("button.btn.btn-primary", { type: "submit" }, "Open the vault"),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
      msg.textContent = "That is not an address: 0x and 40 hex characters.";
      return;
    }
    onVault(v as Address);
  });
  return h(
    "div",
    { style: "max-width:640px;margin:40px 0" },
    h("h1.page-title", "Open a treasury"),
    h(
      "p.page-sub",
      "Peal Tender v2 is not deployed on the testnet yet (deploys open on 19 November 2026). Paste a vault address, or open this page with ?vault=0x… and, for a local node, ?rpc=http://127.0.0.1:8545.",
    ),
    h("div.card", form, msg),
  );
}
