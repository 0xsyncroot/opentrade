// Central Intent dispatcher. Both the TUI keypress handler and the Telegram
// callback_query router lift their input into the same `Intent` shape and
// push it through `dispatch()`. Safety gates, GMGN service calls, and audit
// logging all live in exactly one place.

import type { Chain } from '../chains/index.js';
import type { GmgnClient } from '../gmgn/index.js';
import { evaluateSecurity, type SafetyVerdict } from '../safety/index.js';
import {
  buyToken,
  sellToken,
  sendToken,
  fetchTokenSnapshot,
  type ExecuteResult,
  type TokenSnapshot,
} from '../services/index.js';
import type { Intent } from '../schemas/index.js';

export interface DispatcherContext {
  client: GmgnClient;
  wallets: Partial<Record<Chain, string>>;
  /**
   * Persist a trade record (success or fail) — should write to
   * auto-trading/memory/agents/executor/trades_<date>.md or equivalent local
   * ledger. The CLI/bot supplies an implementation.
   */
  recordTrade?: (record: TradeRecord) => Promise<void>;
  /** Hook to ask the user for confirmation (TUI modal / Telegram callback). */
  confirm?: (preview: ConfirmPreview) => Promise<boolean>;
}

export interface TradeRecord {
  kind: Intent['kind'];
  intent: Intent;
  result?: ExecuteResult;
  error?: { message: string; code?: number };
  timestampUtc: string;
}

export interface ConfirmPreview {
  intent: Intent;
  walletAddress?: string;
  snapshot?: TokenSnapshot;
  safety?: SafetyVerdict;
}

export type DispatchResult =
  | { ok: true; result: ExecuteResult }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'blocked'; safety: SafetyVerdict }
  | { ok: false; reason: 'error'; error: Error };

export async function dispatch(ctx: DispatcherContext, intent: Intent): Promise<DispatchResult> {
  try {
    switch (intent.kind) {
      case 'buy':
      case 'sell': {
        const wallet = ctx.wallets[intent.chain];
        if (!wallet) {
          return {
            ok: false,
            reason: 'error',
            error: new Error(`no wallet configured for chain ${intent.chain}`),
          };
        }
        const snapshot = await fetchTokenSnapshot(ctx.client, {
          chain: intent.chain,
          token: intent.token,
          walletAddress: wallet,
        });
        const safety = snapshot.safety;
        if (safety.block) {
          await recordSafe(ctx, {
            kind: intent.kind,
            intent,
            error: { message: `safety block: ${safety.reasons.join(', ')}` },
            timestampUtc: new Date().toISOString(),
          });
          return { ok: false, reason: 'blocked', safety };
        }
        if (ctx.confirm) {
          const ok = await ctx.confirm({ intent, walletAddress: wallet, snapshot, safety });
          if (!ok) return { ok: false, reason: 'cancelled' };
        }
        const result =
          intent.kind === 'buy'
            ? await buyToken(ctx.client, { intent, walletAddress: wallet, pool: snapshot.pool })
            : await sellToken(ctx.client, { intent, walletAddress: wallet, pool: snapshot.pool });
        await recordSafe(ctx, {
          kind: intent.kind,
          intent,
          result,
          timestampUtc: new Date().toISOString(),
        });
        return { ok: true, result };
      }
      case 'send': {
        const wallet = ctx.wallets[intent.chain];
        if (!wallet) {
          return {
            ok: false,
            reason: 'error',
            error: new Error(`no wallet configured for chain ${intent.chain}`),
          };
        }
        if (ctx.confirm) {
          const ok = await ctx.confirm({ intent, walletAddress: wallet });
          if (!ok) return { ok: false, reason: 'cancelled' };
        }
        const result = await sendToken({ intent, walletAddress: wallet });
        await recordSafe(ctx, {
          kind: 'send',
          intent,
          result,
          timestampUtc: new Date().toISOString(),
        });
        return { ok: true, result };
      }
      case 'limit': {
        // Limit orders go through GMGN strategy create — wrap once the CLI side
        // wires the endpoint. For now we surface a typed error so the caller can
        // render a clear "coming soon" message instead of crashing.
        return {
          ok: false,
          reason: 'error',
          error: new Error('limit orders: dispatcher path lands with Phase 2 CLI integration'),
        };
      }
      case 'refresh':
      case 'switch_mode':
      case 'open_positions':
      case 'open_slash':
      case 'set_chain':
      case 'quit': {
        // UI-only intents — no GMGN side-effect. Callers route these directly to
        // their UI store rather than the dispatcher; the dispatcher accepts them
        // as a no-op for completeness.
        return {
          ok: true,
          result: { status: 'ui_noop', raw: intent },
        };
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    await recordSafe(ctx, {
      kind: intent.kind,
      intent,
      error: { message: error.message },
      timestampUtc: new Date().toISOString(),
    });
    return { ok: false, reason: 'error', error };
  }
}

async function recordSafe(ctx: DispatcherContext, rec: TradeRecord): Promise<void> {
  if (!ctx.recordTrade) return;
  try {
    await ctx.recordTrade(rec);
  } catch {
    // never let audit-log failures kill a trade flow
  }
}

export { evaluateSecurity };
