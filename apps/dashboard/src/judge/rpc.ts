/**
 * rpc.ts - the smallest JSON-RPC client the judge page needs, written out so nothing is
 * hidden: what is sent is what the page shows, and an answer is either data, the
 * contract's own revert bytes, or a node failure. A node failure is never read as a refusal.
 *
 * Requests made in the same moment go out as one JSON-RPC batch: the public node throttles a
 * browser that sends dozens at once, and a juror should not meet that.
 *
 * No DOM and no keys: the browser page, the Node smoke test and the offline tests share it.
 */
import { type Address, type Hex } from "viem";

export const TESTNET_RPC = "https://evm-testnet.qore.host";

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** The node could not be reached, or would not answer. Says nothing about the contract. */
export class RpcFailure extends Error {
  override name = "RpcFailure";
  /** Worth another try: a network error, a timeout, HTTP 429 or HTTP 5xx. */
  readonly transient: boolean;
  constructor(message: string, transient = false) {
    super(message);
    this.transient = transient;
  }
}

/** State the simulation replaces at one address. Only ever used by rows that say so. */
export interface Override {
  address: Address;
  slots?: Record<Hex, Hex>;
  code?: Hex;
}

export interface CallSpec {
  from: Address;
  to: Address;
  data: Hex;
  block: "latest" | bigint;
  overrides?: Override[];
}

export type Answer = { kind: "returned"; data: Hex; ms: number } | { kind: "reverted"; data: Hex; ms: number };

/** The exact JSON-RPC body of a call: what is sent (in a batch), and what the page offers to copy. */
export function callBody(c: CallSpec): { jsonrpc: "2.0"; id: 1; method: "eth_call"; params: unknown[] } {
  const params: unknown[] = [{ from: c.from, to: c.to, data: c.data }, c.block === "latest" ? "latest" : `0x${c.block.toString(16)}`];
  if (c.overrides) {
    params.push(Object.fromEntries(c.overrides.map((o) => [o.address, { ...(o.slots ? { stateDiff: o.slots } : {}), ...(o.code ? { code: o.code } : {}) }])));
  }
  return { jsonrpc: "2.0", id: 1, method: "eth_call", params };
}

interface Options {
  url?: string;
  fetch?: Fetch;
  timeoutMs?: number;
  /** Extra tries after a network error, a timeout, HTTP 429 or HTTP 5xx. */
  retries?: number;
  backoffMs?: number;
}

const BATCH = 20;

type Reply = { id?: unknown; result?: unknown; error?: { code?: number; message?: string; data?: unknown } };

interface Pending {
  method: string;
  params: unknown[];
  done: (r: Reply) => void;
  fail: (e: unknown) => void;
}

export class Rpc {
  readonly url: string;
  #fetch: Fetch;
  #timeout: number;
  #retries: number;
  #backoff: number;
  #queue: Pending[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(o: Options = {}) {
    this.url = o.url ?? TESTNET_RPC;
    this.#fetch = o.fetch ?? ((u, i) => fetch(u, i));
    this.#timeout = o.timeoutMs ?? 15_000;
    this.#retries = o.retries ?? 2;
    this.#backoff = o.backoffMs ?? 700;
  }

  async #once(body: string): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.#timeout);
    try {
      const res = await this.#fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: ctl.signal });
      const text = await res.text();
      if (!res.ok) throw new RpcFailure(`the testnet node answered HTTP ${res.status}`, res.status === 429 || res.status >= 500);
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new RpcFailure("the testnet node's answer was not JSON");
      }
    } catch (e) {
      if (e instanceof RpcFailure) throw e;
      throw new RpcFailure(
        ctl.signal.aborted ? `no answer from the testnet node in ${Math.round(this.#timeout / 1000)} seconds` : "the testnet node could not be reached",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async #post(body: unknown): Promise<unknown> {
    const text = JSON.stringify(body);
    for (let i = 0; ; i++) {
      try {
        return await this.#once(text);
      } catch (e) {
        if (i >= this.#retries || !(e instanceof RpcFailure && e.transient)) throw e;
        await new Promise((r) => setTimeout(r, this.#backoff * (i + 1)));
      }
    }
  }

  #send(method: string, params: unknown[]): Promise<Reply> {
    return new Promise((done, fail) => {
      this.#queue.push({ method, params, done, fail });
      this.#timer ??= setTimeout(() => {
        this.#timer = undefined;
        const all = this.#queue;
        this.#queue = [];
        for (let i = 0; i < all.length; i += BATCH) void this.#flush(all.slice(i, i + BATCH));
      }, 2);
    });
  }

  /** Each answer is matched by its id; one the node left out is a failure of that call only. */
  async #flush(batch: Pending[]): Promise<void> {
    let replies: unknown;
    try {
      replies = await this.#post(batch.map((q, i) => ({ jsonrpc: "2.0", id: i + 1, method: q.method, params: q.params })));
    } catch (e) {
      for (const q of batch) q.fail(e);
      return;
    }
    const list = (Array.isArray(replies) ? replies : []) as (Reply | null)[];
    batch.forEach((q, i) => {
      const r = list.find((x) => x?.id === i + 1);
      if (r && ("result" in r || "error" in r)) q.done(r);
      else q.fail(new RpcFailure("the testnet node's answer was not JSON-RPC"));
    });
  }

  /** Any read. A JSON-RPC error is a node failure here. */
  async request<T>(method: string, params: unknown[]): Promise<T> {
    const r = await this.#send(method, params);
    if (r.error) throw new RpcFailure(`${method}: ${r.error.message ?? "refused by the node"}`);
    return r.result as T;
  }

  /** One eth_call. Returned data and the contract's revert are both answers; anything else throws. */
  async call(c: CallSpec): Promise<Answer> {
    const t0 = performance.now();
    const b = callBody(c);
    const r = await this.#send(b.method, b.params);
    const ms = Math.round(performance.now() - t0);
    if (!r.error) {
      if (typeof r.result !== "string" || !r.result.startsWith("0x")) throw new RpcFailure("the node's eth_call answer was malformed");
      return { kind: "returned", data: r.result as Hex, ms };
    }
    // Code 3 is "execution reverted"; its data is what the contract threw. Every other error
    // (a pruned block, an unsupported override, a gas cap) is the node's, not the contract's.
    if (r.error.code === 3 && typeof r.error.data === "string" && /^0x([0-9a-fA-F]{2})*$/.test(r.error.data)) {
      return { kind: "reverted", data: r.error.data as Hex, ms };
    }
    throw new RpcFailure(`eth_call: ${r.error.message ?? "refused by the node"}`);
  }
}
