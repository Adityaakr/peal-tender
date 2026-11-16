/**
 * template-check.ts - Peal Tender started from create-qorechain-dapp's `foundry`
 * template. This scaffolds that template again from the pinned package and checks
 * that Tender still agrees with it, and with the SDK network preset the template
 * reads its endpoints from, everywhere Tender writes a network fact down by hand:
 *
 * - the compiler and optimizer settings (foundry.toml), which the drill vault's
 *   deployed bytecode and the audit's flattened source were built with;
 * - the testnet EVM RPC in foundry.toml, the kit, and the web app;
 * - the chain ids in the kit and the web app;
 * - the REST and CometBFT endpoints the web app's proxies forward to (vercel.json,
 *   apps/dashboard/vite.config.ts);
 * - the template's @qorechain/sdk and @qorechain/evm ranges against Tender's pins.
 *
 *   npm run template:check
 *
 * Offline: the template ships inside the npm package. Exits 1 on any mismatch.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getNetwork } from "@qorechain/sdk";

/** `key = value` pairs of each `[section]` of a TOML file; enough for foundry.toml's flat keys. */
export function tomlSections(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { "": {} };
  let section = "";
  let depth = 0; // inside a multi-line array
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    if (depth > 0) {
      depth += (line.match(/\[/g) ?? []).length - (line.match(/\]/g) ?? []).length;
      continue;
    }
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      section = sec[1]!.trim();
      out[section] ??= {};
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const value = kv[2]!.trim();
    if (value.startsWith("[")) {
      depth = (value.match(/\[/g) ?? []).length - (value.match(/\]/g) ?? []).length;
    }
    out[section]![kv[1]!] = value.replace(/^"(.*)"$/, "$1");
  }
  return out;
}

/** Does exact version `v` satisfy `range` (`^x.y.z`, `~x.y.z` or exact)? */
export function satisfies(v: string, range: string): boolean {
  const parse = (s: string) => s.replace(/^[\^~]/, "").split(".").map(Number) as [number, number, number];
  const [a, b, c] = parse(v);
  const [x, y, z] = parse(range);
  if ([a, b, c, x, y, z].some((n) => Number.isNaN(n))) return false;
  const ge = a > x || (a === x && (b > y || (b === y && c >= z)));
  if (range.startsWith("^")) return ge && (x > 0 ? a === x : y > 0 ? a === 0 && b === y : a === 0 && b === 0 && c === z);
  if (range.startsWith("~")) return ge && a === x && b === y;
  return a === x && b === y && c === z;
}

export interface Preset {
  chainId: string;
  evmChainId: number;
  rest: string;
  rpc: string;
  evmRpc: string;
}

export interface Facts {
  foundry: Record<string, Record<string, string>>;
  deps: Record<string, string>;
}

export interface TenderFacts extends Facts {
  kitEvmChainId: string;
  kitEvmRpc: string;
  appChainId: string;
  appEvmChainId: string;
  appEvmRpc: string;
  proxyRest: string[];
  proxyRpc: string[];
}

export interface Check {
  what: string;
  expected: string;
  actual: string;
  ok: boolean;
}

function grab(text: string, re: RegExp, what: string): string {
  const m = re.exec(text);
  if (!m?.[1]) throw new Error(`could not find ${what}`);
  return m[1];
}

/** Read the network facts Tender writes down by hand. */
export function tenderFacts(root: string): TenderFacts {
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
  const kit = read("kit/scripts/qore.ts");
  const app = read("apps/dashboard/src/config.ts");
  const data = read("apps/dashboard/src/data.ts");
  const vercel = JSON.parse(read("vercel.json")) as { rewrites: { source: string; destination: string }[] };
  const vite = read("apps/dashboard/vite.config.ts");
  const origin = (u: string) => new URL(u).origin;
  return {
    foundry: tomlSections(read("foundry.toml")),
    deps: pkg.dependencies,
    kitEvmChainId: grab(kit, /evmChainId:\s*(\d+)/, "the kit's evmChainId"),
    kitEvmRpc: grab(kit, /QORE_EVM_RPC_URL\?\.trim\(\)\s*\|\|\s*"([^"]+)"/, "the kit's EVM RPC"),
    appChainId: grab(app, /CHAIN_ID\s*=\s*"([^"]+)"/, "the web app's CHAIN_ID"),
    appEvmChainId: grab(app, /EVM_CHAIN_ID\s*=\s*(\d+)/, "the web app's EVM_CHAIN_ID"),
    appEvmRpc: grab(data, /TESTNET_RPC\s*=\s*"([^"]+)"/, "the web app's TESTNET_RPC"),
    proxyRest: [
      ...vercel.rewrites.filter((r) => r.source.startsWith("/api/qore/rest")).map((r) => origin(r.destination)),
      grab(vite, /"\/api\/qore\/rest"[\s\S]*?target:\s*"([^"]+)"/, "the Vite REST proxy"),
    ],
    proxyRpc: [
      ...vercel.rewrites.filter((r) => r.source.startsWith("/api/qore/rpc")).map((r) => origin(r.destination)),
      grab(vite, /"\/api\/qore\/rpc"[\s\S]*?target:\s*"([^"]+)"/, "the Vite RPC proxy"),
    ],
  };
}

/** Read the scaffolded template's facts. */
export function templateFacts(dir: string): Facts {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return {
    foundry: tomlSections(readFileSync(join(dir, "foundry.toml"), "utf8")),
    deps: { ...pkg.devDependencies, ...pkg.dependencies },
  };
}

export function compare(tender: TenderFacts, template: Facts, preset: Preset): Check[] {
  const checks: Check[] = [];
  const eq = (what: string, expected: string | undefined, actual: string | undefined) =>
    checks.push({ what, expected: String(expected), actual: String(actual), ok: expected !== undefined && expected === actual });
  const tp = template.foundry["profile.default"] ?? {};
  const tt = tender.foundry["profile.default"] ?? {};
  for (const k of ["solc_version", "optimizer", "optimizer_runs"]) eq(`foundry.toml ${k}`, tp[k], tt[k]);
  eq("foundry.toml rpc_endpoints.qorechain_testnet", template.foundry["rpc_endpoints"]?.["qorechain_testnet"], tender.foundry["rpc_endpoints"]?.["qorechain_testnet"]);
  eq("template RPC = SDK preset evmRpc", preset.evmRpc, template.foundry["rpc_endpoints"]?.["qorechain_testnet"]);
  eq("kit evmChainId", String(preset.evmChainId), tender.kitEvmChainId);
  eq("kit EVM RPC", preset.evmRpc, tender.kitEvmRpc);
  eq("web app CHAIN_ID", preset.chainId, tender.appChainId);
  eq("web app EVM_CHAIN_ID", String(preset.evmChainId), tender.appEvmChainId);
  eq("web app EVM RPC", preset.evmRpc, tender.appEvmRpc);
  tender.proxyRest.forEach((u, i) => eq(`REST proxy ${i + 1} (vercel.json, vite)`, new URL(preset.rest).origin, u));
  tender.proxyRpc.forEach((u, i) => eq(`RPC proxy ${i + 1} (vercel.json, vite)`, new URL(preset.rpc).origin, u));
  for (const dep of ["@qorechain/sdk", "@qorechain/evm"]) {
    const range = template.deps[dep];
    const pinned = tender.deps[dep];
    checks.push({
      what: `${dep} ${pinned ?? "missing"} within the template's ${range ?? "missing"}`,
      expected: String(range),
      actual: String(pinned),
      ok: Boolean(range && pinned && satisfies(pinned, range)),
    });
  }
  return checks;
}

export function presetOf(): Preset {
  const n = getNetwork("testnet");
  if (n.evmChainId === undefined || !n.endpoints.evmRpc) throw new Error("the SDK's testnet preset has no EVM chain id or EVM RPC");
  return { chainId: n.chainId, evmChainId: n.evmChainId, rest: n.endpoints.rest, rpc: n.endpoints.rpc, evmRpc: n.endpoints.evmRpc };
}

/** Scaffold the template with the pinned create-qorechain-dapp into a fresh temporary directory. */
export function scaffold(): { dir: string; cleanup: () => void } {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("create-qorechain-dapp/package.json");
  const bin = (JSON.parse(readFileSync(pkgPath, "utf8")) as { bin: Record<string, string> }).bin["create-qorechain-dapp"]!;
  const parent = mkdtempSync(join(tmpdir(), "tender-template-"));
  execFileSync(process.execPath, [join(dirname(pkgPath), bin), "app", "--template", "foundry", "--network", "testnet", "--yes", "--no-install"], {
    cwd: parent,
    stdio: "ignore",
  });
  return { dir: join(parent, "app"), cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const { dir, cleanup } = scaffold();
  try {
    const checks = compare(tenderFacts(root), templateFacts(dir), presetOf());
    for (const c of checks) {
      console.log(`${c.ok ? "ok  " : "FAIL"} ${c.what}${c.ok ? "" : `: template/preset says ${c.expected}, Tender has ${c.actual}`}`);
    }
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed} of ${checks.length} agree with create-qorechain-dapp's foundry template and the SDK preset.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
