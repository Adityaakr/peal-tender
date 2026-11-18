/**
 * The "How to use" guide (apps/dashboard/src/pages/guide.ts): which steps are possible
 * now, from the vault's live state. Offline: the snapshot is built here.
 *
 *   npm run test:ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Snapshot, Tender } from "../apps/dashboard/src/data.ts";
import { GUEST_QOR_NEEDED, plan, type Role } from "../apps/dashboard/src/pages/guide.ts";

const NOW = 1_795_003_300n;
const token = (symbol: string, decimals: number) => ({
  address: "0x0000000000000000000000000000000000000001" as const,
  symbol,
  decimals,
  balance: 0n,
  free: 0n,
  cap: 0n,
  left: 0n,
});
const tender = (over: Partial<Tender> = {}): Tender => ({
  id: 1n,
  state: "Open",
  numTicks: 10,
  clearingTick: 0,
  maxOffers: 32,
  offerCount: 0,
  claimedCount: 0,
  endTime: NOW + 600_000n,
  budget: 80_000n,
  floorPrice: 1_000n,
  tickSize: 100n,
  minQuantity: 10n ** 18n,
  price: 0n,
  bought: 0n,
  supplyAtClearingTick: 0n,
  fillAtClearingTick: 0n,
  reserved: 80_000n,
  escrowed: 0n,
  ...over,
});
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  vault: "0x79B2076a34b8CaBCF0120073cE0640165B287940",
  block: { number: 10_314_400n, timestamp: NOW },
  pay: { ...token("fUSD", 6), balance: 99_090_000n, free: 99_010_000n, cap: 1_000_000n, left: 10_000n },
  buy: token("PEAL-T", 18),
  native: token("QOR", 18),
  reservedPay: 80_000n,
  escrowedBuy: 0n,
  members: [1, 2, 3].map((i) => ({
    address: `0x${String(i).repeat(40)}` as `0x${string}`,
    registered: true,
    algorithm: 1,
    possession: true,
    keyLength: 2592,
    keyHash: "0x00",
    publicKey: "0x00",
    usable: true,
  })),
  threshold: 2,
  nonce: 3n,
  epoch: 0n,
  delay: 900n,
  factory: "0x1160ab95b570a65bbadb488c76e2f8515f3d6562",
  ops: [],
  tenders: [tender()],
  openTenderId: 1n,
  sales: [],
  ...over,
});
const role = (roles: Role[], id: Role["id"]) => roles.find((r) => r.id === id)!;
const step = (r: Role, re: RegExp) => r.steps.find((s) => re.test(s.title));
const noWallet = {};

describe("guide: plan", () => {
  it("covers the four roles, and visitors can explore the vault now", () => {
    const roles = plan(snap(), noWallet);
    assert.deepEqual(roles.map((r) => r.id), ["visitor", "holder", "anyone", "signer"]);
    const v = role(roles, "visitor");
    assert.ok(v.steps.every((s) => s.state === "now" && s.action?.href?.startsWith("#/")));
    assert.match(step(v, /signers/)!.text, /2 of 3 signers.*3 of 3 ML-DSA-87 keys/);
  });

  it("offers into the open tender now, and says when it can be settled", () => {
    const roles = plan(snap(), noWallet);
    const offer = step(role(roles, "holder"), /^Offer/)!;
    assert.equal(offer.state, "now");
    assert.equal(offer.action?.href, "#/tenders/1");
    assert.match(offer.status!, /^open until .* 0 of 32 offers$/);
    const settle = step(role(roles, "anyone"), /^Settle/)!;
    assert.equal(settle.state, "later");
    assert.match(settle.status!, /possible from .*\(in /);
  });

  it("with no open tender, says how one is opened instead of offering", () => {
    const roles = plan(snap({ tenders: [], openTenderId: 0n }), noWallet);
    const offer = step(role(roles, "holder"), /^Offer/)!;
    assert.equal(offer.state, "later");
    assert.match(offer.text, /No tender is open.*propose open-tender/);
    assert.equal(step(role(roles, "anyone"), /^Settle/), undefined);
  });

  it("an ended tender can be settled by anyone, and takes no offers", () => {
    const roles = plan(snap({ tenders: [tender({ endTime: NOW - 1n })] }), noWallet);
    assert.equal(step(role(roles, "anyone"), /^Settle tender #1$/)?.state, "now");
    assert.equal(step(role(roles, "holder"), /^Offer/)?.state, "later");
  });

  it("claims are possible after settlement while offers are unclaimed", () => {
    const settled = tender({ state: "Settled", endTime: NOW - 10n, offerCount: 2, claimedCount: 1, price: 1_300n });
    const roles = plan(snap({ tenders: [settled], openTenderId: 0n }), noWallet);
    const claim = step(role(roles, "anyone"), /^Claim from tender #1$/)!;
    assert.equal(claim.state, "now");
    assert.equal(claim.status, "1 offer not yet claimed");
  });

  it("follows the guest account: created, then funded", () => {
    const acct = { evm: "0x1", cosmos: "qor1x", qorDecimals: 6, keyRegistered: false, keyIsOurs: false, windowLive: false };
    let holder = role(plan(snap(), noWallet), "holder");
    assert.equal(holder.steps[0]!.state, "now");
    assert.equal(holder.steps[2]!.state, "later", "test PEAL-T needs an account first");
    const guest = {} as never;
    holder = role(plan(snap(), { guest, guestStatus: { ...acct, qor: 1n } as never }), "holder");
    assert.equal(holder.steps[0]!.state, "done");
    assert.equal(holder.steps[1]!.state, "now");
    holder = role(plan(snap(), { guest, guestStatus: { ...acct, qor: GUEST_QOR_NEEDED } as never }), "holder");
    assert.equal(holder.steps[1]!.state, "done");
  });

  it("shows a running sealed sale, and a collect step once its auction finished", () => {
    const sale = { auction: "0x19bCC6197b97fE53b111d19c350660753441082B" as const, state: "Active" as const, startedAt: NOW, supply: 900_000n, proceeds: 0n, returned: 0n, endTime: NOW + 3600n };
    let anyone = role(plan(snap({ sales: [sale] }), noWallet), "anyone");
    assert.equal(step(anyone, /sealed buyback/)?.state, "now");
    assert.equal(step(anyone, /^Collect/), undefined);
    anyone = role(plan(snap({ sales: [{ ...sale, auctionState: "Failed" }] }), noWallet), "anyone");
    assert.equal(step(anyone, /^Collect/)?.state, "now");
  });

  it("signers get commands, never keys on the page", () => {
    const signer = role(plan(snap(), noWallet), "signer");
    assert.ok(signer.steps.some((s) => s.command === "npm run sign-action -- <file> --as <name>"));
    assert.match(signer.summary, /Keys never touch this page/);
  });
});
