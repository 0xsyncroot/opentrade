// Risk gate keyboard — plan §"Risk gate UX": when snapshot.safety.warn === true,
// replace the preset action row with a single [⚠ Confirm Risky] button that
// triggers a forceReply asking the user to retype the token symbol exactly
// before we surface the real buy/sell presets.

import { InlineKeyboard } from 'grammy';
import type { actions as actionsNs, schemas } from '@hiepht/opentrade-core';

export interface BuildRiskGateOptions {
  intent: schemas.Intent;
  cache: actionsNs.CallbackCache;
}

export function buildRiskGateKeyboard(opts: BuildRiskGateOptions): InlineKeyboard {
  const uuid = opts.cache.put(opts.intent);
  return new InlineKeyboard().text('⚠ Confirm Risky', `act:${uuid}`);
}

export interface PendingRiskConfirmation {
  // Owner-typed token symbol that must match before we proceed.
  expectedSymbol: string;
  intent: schemas.Intent;
  createdAt: number;
  // 60s TTL — fail-safe so a stuck modal doesn't leak indefinitely
  ttlMs: number;
}

/** In-memory single-slot risk confirmation tracker. */
export class RiskGateState {
  private pending: PendingRiskConfirmation | undefined;

  arm(p: Omit<PendingRiskConfirmation, 'createdAt' | 'ttlMs'> & { ttlMs?: number }): void {
    this.pending = {
      ...p,
      createdAt: Date.now(),
      ttlMs: p.ttlMs ?? 60_000,
    };
  }

  /**
   * Check whether the supplied text matches the expected symbol. Always clears
   * state — single-shot. Returns the original intent on match, undefined on miss
   * (caller decides whether to scold the user).
   */
  consume(text: string): schemas.Intent | undefined {
    const p = this.pending;
    this.pending = undefined;
    if (!p) return undefined;
    if (Date.now() - p.createdAt > p.ttlMs) return undefined;
    if (text.trim().toUpperCase() !== p.expectedSymbol.trim().toUpperCase()) return undefined;
    return p.intent;
  }

  get armed(): boolean {
    return this.pending !== undefined;
  }

  clear(): void {
    this.pending = undefined;
  }
}
