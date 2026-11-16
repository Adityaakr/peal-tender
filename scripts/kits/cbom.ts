/**
 * cbom.ts - a cryptographic inventory (CycloneDX 1.6 CBOM) of Peal Tender with
 * QoreScan (`@qorechain/qorescan`), and a check of what THREAT_MODEL.md claims
 * about it.
 *
 *   npm run cbom                       # scan, write audits/cbom/peal-tender.cdx.json, check it
 *   npm run cbom:check                 # check the committed CBOM
 *   npm run cbom:check -- --fresh      # scan the Solidity sources again (offline) and check that
 *
 * What is scanned: the contracts (src/, the drill's kit/src/, and qore-pq-kit's
 * src/ from lib/, where PqAuthSet lives), the TLS of the two testnet endpoints the
 * app talks to, and, read-only, the chain's PQC parameters and each treasury
 * signer's registered key.
 *
 * What is checked (each is a claim the threat model makes):
 * 1. the contracts reach ML-DSA-87 only through QoreChain's precompiles:
 *    pqcKeyStatus (0x0A02) and pqcVerify (0x0A01) are both found in PqAuth.sol;
 * 2. no contract calls ecrecover or the ecrecover precompile: a classical
 *    signature authorises nothing in Tender;
 * 3. (full scans) the chain requires the hybrid signature on the native lane,
 *    with no classical fallback, and has both precompiles active;
 * 4. (full scans) every signer address scanned has a registered post-quantum key.
 *
 * QoreScan's output is an inventory aid, not a certification; the CBOM says so.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Occurrence {
  location?: string;
  line?: number;
  symbol?: string;
  additionalContext?: string;
}
interface Component {
  name: string;
  "bom-ref"?: string;
  evidence?: { occurrences?: Occurrence[] };
  properties?: { name: string; value: string }[];
}
export interface Cbom {
  bomFormat: string;
  specVersion: string;
  metadata: { properties?: { name: string; value: string }[] };
  components: Component[];
}

export interface CbomCheck {
  what: string;
  ok: boolean;
  detail: string;
}

const isSol = (o: Occurrence) => typeof o.location === "string" && o.location.endsWith(".sol");

/** The claims above, against a parsed CBOM. `full` adds the chain and account checks. */
export function checkCbom(bom: Cbom, opts: { full: boolean; signers?: string[] }): CbomCheck[] {
  const out: CbomCheck[] = [];
  const add = (what: string, ok: boolean, detail: string) => out.push({ what, ok, detail });
  add("CycloneDX 1.6", bom.bomFormat === "CycloneDX" && bom.specVersion === "1.6", `${bom.bomFormat} ${bom.specVersion}`);

  const props = bom.metadata.properties ?? [];
  const solFiles = props.filter((p) => p.name === "qorescan:solidity:files").reduce((n, p) => n + Number(p.value), 0);
  add("Solidity sources scanned", solFiles > 0, `${solFiles} files`);

  const sol = bom.components.flatMap((c) => (c.evidence?.occurrences ?? []).filter(isSol).map((o) => ({ c, o })));
  const mldsa = sol.filter(({ c }) => c.name === "ML-DSA-87");
  for (const sym of ["pqcKeyStatus", "pqcVerify"]) {
    const hit = mldsa.find(({ o }) => o.symbol === sym);
    add(`contracts call ${sym}`, Boolean(hit), hit ? `${hit.o.location}:${hit.o.line}` : "not found");
  }
  const classical = sol.filter(({ o }) => /ecrecover/i.test(`${o.symbol ?? ""} ${o.additionalContext ?? ""}`));
  add(
    "no contract calls ecrecover",
    classical.length === 0,
    classical.length === 0 ? "none" : classical.map(({ o }) => `${o.location}:${o.line}`).join(", "),
  );

  if (opts.full) {
    const val = (name: string) => props.filter((p) => p.name === name).map((p) => p.value);
    add("chain: hybrid signature required", val("qorescan:chain:pqc:hybrid-signature-mode").includes("required"), val("qorescan:chain:pqc:hybrid-signature-mode").join(",") || "absent");
    add("chain: no classical fallback", val("qorescan:chain:pqc:allow-classical-fallback").includes("false"), val("qorescan:chain:pqc:allow-classical-fallback").join(",") || "absent");
    const pre = val("qorescan:chain:evm:active-precompile").join(" ").toLowerCase();
    add("chain: pqcVerify and pqcKeyStatus active", pre.includes("0a01") && pre.includes("0a02"), pre ? "both listed" : "absent");
    for (const s of opts.signers ?? []) {
      const key = bom.components.find((c) => c["bom-ref"] === `crypto/key/account-pqc/${s}`);
      add(`signer ${s} has a registered post-quantum key`, Boolean(key), key ? "found" : "missing");
    }
  }
  return out;
}

function root(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** The treasury signer accounts to inventory: the drill vault's signer, and v2's members once deployed. */
export function signerAccounts(dir: string): string[] {
  const out: string[] = [];
  const v1 = JSON.parse(readFileSync(join(dir, "deployments", "qorechain-diana.json"), "utf8")) as { drillAccount?: { qor?: string } };
  if (v1.drillAccount?.qor) out.push(v1.drillAccount.qor);
  const v2Path = join(dir, "deployments", "qorechain-diana-v2.json");
  if (existsSync(v2Path)) {
    const v2 = JSON.parse(readFileSync(v2Path, "utf8")) as { signers?: { qor?: string }[] };
    for (const s of v2.signers ?? []) if (s.qor) out.push(s.qor);
  }
  return out;
}

function qorescan(args: string[], cwd: string): void {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("@qorechain/qorescan/package.json");
  const bin = (JSON.parse(readFileSync(pkg, "utf8")) as { bin: Record<string, string> }).bin["qorescan"]!;
  execFileSync(process.execPath, [join(dirname(pkg), bin), ...args], { cwd, stdio: ["ignore", "ignore", "inherit"] });
}

const SOLIDITY = ["src", "kit/src", "lib/qore-pq-kit/src"];
const TLS = ["api-testnet.qore.host:443", "evm-testnet.qore.host:443"];
export const CBOM_PATH = join("audits", "cbom", "peal-tender.cdx.json");

function report(checks: CbomCheck[]): boolean {
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.what}: ${c.detail}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed} of ${checks.length} checks pass.`);
  return failed === 0;
}

function main(): void {
  const dir = root();
  const args = process.argv.slice(2);
  const signers = signerAccounts(dir);
  const needSources = () => {
    for (const s of SOLIDITY) if (!existsSync(join(dir, s))) throw new Error(`${s} is missing: run npm run setup first`);
  };

  if (args[0] === "check") {
    if (args.includes("--fresh")) {
      needSources();
      const tmp = mkdtempSync(join(tmpdir(), "tender-cbom-"));
      try {
        const out = join(tmp, "contracts.cdx.json");
        qorescan(["solidity", ...SOLIDITY, "--out", out], dir);
        if (!report(checkCbom(JSON.parse(readFileSync(out, "utf8")) as Cbom, { full: false }))) process.exitCode = 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
      return;
    }
    const file = args.find((a) => !a.startsWith("--") && a !== "check") ?? join(dir, CBOM_PATH);
    if (!report(checkCbom(JSON.parse(readFileSync(file, "utf8")) as Cbom, { full: true, signers }))) process.exitCode = 1;
    return;
  }

  needSources();
  const out = join(dir, CBOM_PATH);
  qorescan(
    [
      "scan",
      "--name",
      "peal-tender",
      "--network",
      "testnet",
      ...signers.flatMap((s) => ["--address", s]),
      ...TLS.flatMap((t) => ["--tls", t]),
      ...SOLIDITY.flatMap((s) => ["--solidity", s]),
      "--out",
      out,
    ],
    dir,
  );
  console.log(`wrote ${CBOM_PATH}`);
  if (!report(checkCbom(JSON.parse(readFileSync(out, "utf8")) as Cbom, { full: true, signers }))) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
