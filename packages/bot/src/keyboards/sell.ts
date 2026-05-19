// Sell keyboard scaffolding (mirrors `buy.ts`). The main keyboard is built by
// tg-renderer from Screen.actions[]; this module exists for any sell-specific
// extras we may add (e.g. set limit price, set trailing stop).

import { InlineKeyboard } from 'grammy';
import type { actions as actionsNs, schemas } from '@0xsyncroot/opentrade-core';

export interface SellExtrasOptions {
  intent: schemas.SellIntent;
  cache: actionsNs.CallbackCache;
}

export function buildSellExtrasRow(opts: SellExtrasOptions): InlineKeyboard {
  const refresh = opts.cache.put({ kind: 'refresh' });
  const switchBuy = opts.cache.put({ kind: 'switch_mode', to: 'buy' });
  return new InlineKeyboard().text('🔄 Refresh', `act:${refresh}`).text('Buy view', `act:${switchBuy}`);
}
