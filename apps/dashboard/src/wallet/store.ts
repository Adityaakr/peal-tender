/**
 * store.ts - who is connected, and running an action with the guest account.
 * Pages subscribe to changes; the wallet panel and action buttons call in here.
 */
import type { UnifiedAccount } from "@qorechain/sdk";
import * as guest from "./guest.ts";
import type { QorexAccount } from "./qorex.ts";

export interface WalletState {
  guest?: UnifiedAccount;
  guestStatus?: guest.GuestStatus;
  qorex?: QorexAccount;
  metamask?: { address: string; wallet: string; onQoreChain: boolean };
  busy?: string;
  log: string[];
  error?: string;
}

export const state: WalletState = { log: [] };
const listeners = new Set<() => void>();

export function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function emit(): void {
  for (const f of listeners) f();
}

export function log(line: string): void {
  state.log = [...state.log.slice(-30), line];
  emit();
}

export async function refreshGuest(): Promise<void> {
  try {
    state.guest = await guest.account();
    state.guestStatus = state.guest ? await guest.status(state.guest) : undefined;
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  }
  emit();
}

/** Open the wallet panel (set by the panel module). */
export let openPanel: () => void = () => {};
export function setOpenPanel(f: () => void): void {
  openPanel = f;
}

/**
 * Run EVM calls as the guest account. Opens the panel when there is no guest yet.
 * Returns true when every call went through.
 */
export async function act(title: string, calls: guest.Call[], after?: () => void): Promise<boolean> {
  if (!state.guest) {
    openPanel();
    state.error = "Create a guest account (or import one) to do this.";
    emit();
    return false;
  }
  if (state.busy) return false;
  state.busy = title;
  state.error = undefined;
  state.log = [];
  emit();
  openPanel();
  try {
    await guest.run(state.guest, calls, log);
    log(`${title}: done.`);
    after?.();
    return true;
  } catch (e) {
    state.error = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return false;
  } finally {
    state.busy = undefined;
    await refreshGuest();
  }
}

void refreshGuest();
