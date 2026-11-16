/**
 * config.ts - where the app talks to, and which contracts it uses.
 *
 * The EVM RPC allows browser calls from any origin (kit spike S4); the REST API
 * and the CometBFT RPC do not, so the app reaches them through same-origin paths
 * that the host proxies: Vite's dev server locally (apps/dashboard/vite.config.ts)
 * and Vercel rewrites when hosted (vercel.json). The proxy only forwards to these
 * two public testnet endpoints; it holds no keys.
 */
import { type Address } from "viem";
import { IS_LOCAL, RPC } from "./data.ts";

export const CHAIN_ID = "qorechain-diana";
export const EVM_CHAIN_ID = 9800;
export const EVM_RPC = RPC;
export const REST = `${location.origin}/api/qore/rest`;
export const COMET_RPC = `${location.origin}/api/qore/rpc`;

/** Peal Sealed Auction's testnet deployment (its deployments/qorechain-diana.json, 16 November 2026). */
export const AUCTION = {
  pealT: "0x7edc65adc95de061887ecd6fc8629f2a99fffe9e" as Address,
  faucet: "0xe6c2943ff47e908c8b42af4329fb4abd10452e57" as Address,
  factory: "0x1160ab95b570a65bbadb488c76e2f8515f3d6562" as Address,
};

export const DASHBOARD_FAUCET = "https://dashboard.qorechain.io/faucet";
export const QOREX_HELP = "https://docs.qorechain.io/qorex/browser-extension";
export const REPO = "https://github.com/Adityaakr/peal-tender";

/** Fees the kit uses on the testnet: a fixed native fee, EVM at up to 200 gwei. */
export const NATIVE_FEE = { amount: [{ denom: "uqor", amount: "150000" }], gas: "1000000" };
export const MAX_FEE_PER_GAS = 200_000_000_000n;
export const MAX_PRIORITY_FEE_PER_GAS = 12_500_000_000n;

export { IS_LOCAL };
