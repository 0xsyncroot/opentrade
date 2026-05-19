// Decode `callback_data = "act:<uuid>"` → lookup full Intent in CallbackCache
// → push through the shared `dispatch()`. Both TUI keypresses and Telegram
// taps land at the same dispatcher — see plan §"Cốt lõi — Screen schema +
// Intent dispatcher".

import type { Context } from 'grammy';
import { actions as actionsNs, type schemas } from '@hiepht/opentrade-core';
import type { renderScreen } from './render/tg-renderer.js';

export const CALLBACK_PREFIX = 'act:';
export const EXPIRED_MESSAGE = 'This button expired — paste the contract again.';

export interface CallbackRouterDeps {
  cache: actionsNs.CallbackCache;
  dispatcherCtx: actionsNs.DispatcherContext;
  /**
   * Optional follow-up: render and reply with a fresh screen once the intent
   * resolves. Provided by main.ts which knows about the renderer.
   */
  followUp?: (
    ctx: Context,
    result: actionsNs.DispatchResult,
    intent: schemas.Intent,
  ) => Promise<void>;
}

export function makeCallbackRouter(deps: CallbackRouterDeps) {
  return async function handleCallback(ctx: Context): Promise<void> {
    const data = ctx.callbackQuery?.data;
    if (!data) return;
    if (!data.startsWith(CALLBACK_PREFIX)) {
      await ctx.answerCallbackQuery({ text: 'Unknown action', show_alert: false });
      return;
    }
    const uuid = data.slice(CALLBACK_PREFIX.length);
    const intent = deps.cache.get(uuid);
    if (!intent) {
      await ctx.answerCallbackQuery({ text: EXPIRED_MESSAGE, show_alert: true });
      try {
        await ctx.reply(EXPIRED_MESSAGE);
      } catch {
        /* ignore */
      }
      return;
    }
    // Acknowledge fast so Telegram doesn't time out (≤3s budget).
    await ctx.answerCallbackQuery();

    const result = await actionsNs.dispatch(deps.dispatcherCtx, intent);
    await deps.followUp?.(ctx, result, intent);
  };
}

/** Bare helper exported for tests — same logic, no grammy ctx required. */
export async function routeCallbackData(
  data: string,
  deps: Omit<CallbackRouterDeps, 'followUp'>,
): Promise<
  | { kind: 'expired' }
  | { kind: 'unknown' }
  | { kind: 'dispatched'; result: actionsNs.DispatchResult; intent: schemas.Intent }
> {
  if (!data.startsWith(CALLBACK_PREFIX)) return { kind: 'unknown' };
  const uuid = data.slice(CALLBACK_PREFIX.length);
  const intent = deps.cache.get(uuid);
  if (!intent) return { kind: 'expired' };
  const result = await actionsNs.dispatch(deps.dispatcherCtx, intent);
  return { kind: 'dispatched', result, intent };
}

// Re-export type for convenience.
export type RenderedFollowUp = ReturnType<typeof renderScreen>;
