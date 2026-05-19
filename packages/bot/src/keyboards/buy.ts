// Buy keyboard scaffolding — most of the time the buy InlineKeyboard is built
// directly by tg-renderer from `Screen.actions[]`. This module exists for
// places we want to override or add ancillary toggle rows (slip, MEV) that the
// Screen schema doesn't represent yet.

import { InlineKeyboard } from 'grammy';
import type { actions as actionsNs, schemas } from '@hiepht/opentrade-core';

export interface BuyExtrasOptions {
  intent: schemas.BuyIntent;
  cache: actionsNs.CallbackCache;
}

/** Optional secondary row: refresh + cancel. Used by the buy wizard. */
export function buildBuyExtrasRow(opts: BuyExtrasOptions): InlineKeyboard {
  const refresh = opts.cache.put({ kind: 'refresh' });
  return new InlineKeyboard()
    .text('🔄 Refresh', `act:${refresh}`)
    .text('✖ Cancel', `act:${opts.cache.put({ kind: 'refresh' })}`);
}
