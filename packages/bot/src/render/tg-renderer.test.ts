import { describe, expect, it } from 'vitest';
import {
  views as viewsNs,
  actions as actionsNs,
  type schemas,
} from '@0xsyncroot/opentrade-core';
import type { services } from '@0xsyncroot/opentrade-core';
import { renderScreen, escMd } from './tg-renderer.js';

// Deterministic snapshot test data — matches the shape used by core/views/tests.

const baseSnapshot = (
  withHolding = false,
  warn = false,
  block = false,
): services.TokenSnapshot => ({
  token: {
    chain: 'base',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    price: 0.0000234,
    price_change_percent24h: 12.4,
    market_cap: 4_200_000,
    liquidity: 890_000,
    holder_count: 2341,
  },
  security: {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    is_honeypot: block ? 1 : 0,
    rug_ratio: warn ? 0.2 : 0.03,
    top_10_holder_rate: 0.38,
    buy_tax: 0,
    sell_tax: 0,
    renounced: 1,
    open_source: 1,
  },
  pool: { address: '0xpool', exchange: 'aerodrome' },
  safety: {
    block,
    warn,
    gates: [
      { key: 'honeypot', label: 'Honeypot', value: block ? 'YES' : 'no', level: block ? 'block' : 'ok' },
      { key: 'rug', label: 'Rug ratio', value: warn ? '0.20' : '0.03', level: warn ? 'warn' : 'ok' },
      { key: 'top10', label: 'Top10', value: '38%', level: 'ok' },
    ],
    reasons: block ? ['is_honeypot=1'] : warn ? ['rug_ratio=0.20 > 0.15'] : [],
  },
  myHolding: withHolding
    ? {
        token_address: '0x1234567890abcdef1234567890abcdef12345678',
        symbol: 'PEPE',
        name: 'Pepe',
        decimals: 18,
        balance: (1234567n * 10n ** 18n).toString(),
        usd_value: 28.94,
        price: 0.0000234,
        pnl: 9.4,
        pnl_percent: 47.9,
      }
    : undefined,
});

const header = viewsNs.buildHeader({
  chain: 'base',
  walletAddress: '0x12345678901234567890123456789012345678ab',
  nativeBalanceWei: (123n * 10n ** 15n).toString(),
  nativeBalanceUsd: 1234.56,
  openPositions: 3,
  gasEstUsd: 0.18,
});

describe('tg-renderer', () => {
  it('escapes MarkdownV2 specials', () => {
    expect(escMd('1.0 + foo (bar) _baz_')).toBe('1\\.0 \\+ foo \\(bar\\) \\_baz\\_');
  });

  it('renders a BUY screen with primary preset buttons', () => {
    const cache = new actionsNs.CallbackCache();
    const screen = viewsNs.buildBuyScreen({ header, snapshot: baseSnapshot() });
    const r = renderScreen(screen, { cache });
    expect(r.markdown).toMatchSnapshot('buy.markdown');
    // 4 preset buttons + Tab → 5 inline buttons.
    const flat = (r.replyMarkup.inline_keyboard ?? []).flat();
    expect(flat.length).toBe(5);
    // every callback_data is `act:<uuid>` and <= 64 bytes.
    for (const b of flat) {
      expect((b as { callback_data: string }).callback_data).toMatch(/^act:[A-Za-z0-9_-]+$/);
      expect(Buffer.byteLength((b as { callback_data: string }).callback_data, 'utf8')).toBeLessThanOrEqual(64);
    }
    // First button is decorated with the buy emoji.
    expect((flat[0] as { text: string }).text.startsWith('🟢')).toBe(true);
  });

  it('renders a SELL screen with holding block + danger 100% button', () => {
    const cache = new actionsNs.CallbackCache();
    const screen = viewsNs.buildSellScreen({ header, snapshot: baseSnapshot(true) });
    const r = renderScreen(screen, { cache });
    expect(r.markdown).toMatchSnapshot('sell.markdown');
    const flat = (r.replyMarkup.inline_keyboard ?? []).flat();
    const sell100 = flat.find((b) => (b as { text: string }).text.includes('100%'));
    expect(sell100).toBeDefined();
    expect((sell100 as { text: string }).text.startsWith('🔴')).toBe(true);
  });

  it('renders a safety-warn screen (info kind) with warning gates', () => {
    const cache = new actionsNs.CallbackCache();
    const screen = viewsNs.buildInfoScreen({ header, snapshot: baseSnapshot(false, true) });
    const r = renderScreen(screen, { cache });
    expect(r.markdown).toMatchSnapshot('info-warn.markdown');
    // Single back button.
    const flat = (r.replyMarkup.inline_keyboard ?? []).flat();
    expect(flat.length).toBe(1);
  });

  it('every callback_data sub-token stays under 64 bytes for a buy screen with TP/SL tiers', () => {
    const cache = new actionsNs.CallbackCache();
    const screen = viewsNs.buildBuyScreen({
      header,
      snapshot: baseSnapshot(),
      tpPct: 50,
      slPct: 20,
    });
    const r = renderScreen(screen, { cache });
    for (const b of (r.replyMarkup.inline_keyboard ?? []).flat()) {
      expect(Buffer.byteLength((b as { callback_data: string }).callback_data, 'utf8')).toBeLessThanOrEqual(64);
    }
    // Buy intent stored in cache should still include the TP tier (proves we
    // bypassed the 64-byte limit by storing it server-side, not in callback_data).
    const flat = r.replyMarkup.inline_keyboard.flat();
    const first = flat[0] as { callback_data: string };
    const uuid = first.callback_data.replace(/^act:/, '');
    const stored = cache.get(uuid)!;
    expect(stored.kind).toBe('buy');
    if (stored.kind === 'buy') {
      expect(stored.tp?.[0]?.pricePct).toBe(50);
    }
  });
});
