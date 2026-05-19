import { describe, expect, it } from 'vitest';
import {
  buildBuyScreen,
  buildHeader,
  buildHomeScreen,
  buildInfoScreen,
  buildPositionsScreen,
  buildSellScreen,
} from './index.js';
import type { TokenSnapshot } from '../services/index.js';
import { ScreenSchema } from '../schemas/index.js';

const fakeSnapshot = (opts: { withHolding?: boolean } = {}): TokenSnapshot => ({
  token: {
    chain: 'base',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    price: 0.0000234,
    price_change_percent24h: 12.4,
    market_cap: 4200000,
    liquidity: 890000,
    holder_count: 2341,
  },
  security: {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    is_honeypot: 0,
    rug_ratio: 0.03,
    top_10_holder_rate: 0.38,
    buy_tax: 0,
    sell_tax: 0,
    renounced: 1,
    open_source: 1,
  },
  pool: { address: '0xpool', exchange: 'aerodrome' },
  safety: {
    block: false,
    warn: false,
    gates: [],
    reasons: [],
  },
  myHolding: opts.withHolding
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

const header = buildHeader({
  chain: 'base',
  walletAddress: '0x12345678901234567890123456789012345678ab',
  nativeBalanceWei: (123n * 10n ** 15n).toString(),
  nativeBalanceUsd: 1234.56,
  openPositions: 3,
  gasEstUsd: 0.18,
});

describe('Screen builders', () => {
  it('header has all required fields', () => {
    expect(header.chain).toBe('base');
    expect(header.walletShort).toContain('…');
    expect(header.balanceNative).toMatch(/\d/);
    expect(header.balanceUsd).toBeDefined();
    expect(header.openPositions).toBe(3);
  });

  it('buildBuyScreen produces 4 buy preset + Tab', () => {
    const s = buildBuyScreen({ header, snapshot: fakeSnapshot() });
    expect(s.kind).toBe('buy');
    expect(s.actions.length).toBe(5);
    const buyButtons = s.actions.filter((a) => a.intent.kind === 'buy');
    expect(buyButtons.length).toBe(4);
    expect(buyButtons.map((b) => b.hotkey)).toEqual(['1', '2', '3', '4']);
    expect(s.actions[s.actions.length - 1]!.hotkey).toBe('Tab');
  });

  it('buildSellScreen produces 4 sell % buttons + Tab', () => {
    const s = buildSellScreen({ header, snapshot: fakeSnapshot({ withHolding: true }) });
    expect(s.kind).toBe('sell');
    const sellButtons = s.actions.filter((a) => a.intent.kind === 'sell');
    expect(sellButtons.length).toBe(4);
    expect(sellButtons.map((b) => b.label)).toEqual(['25%', '50%', '75%', '100%']);
    // 100% sell marked dangerous
    expect(sellButtons[3]!.tone).toBe('danger');
  });

  it('sell screen shows holding block when present', () => {
    const s = buildSellScreen({ header, snapshot: fakeSnapshot({ withHolding: true }) });
    const holdingBlock = s.body.find((b) => b.type === 'holding');
    expect(holdingBlock).toBeDefined();
  });

  it('sell screen surfaces warning when holding=undefined', () => {
    const s = buildSellScreen({ header, snapshot: fakeSnapshot({ withHolding: false }) });
    const warnText = s.body.find((b) => b.type === 'text' && b.tone === 'warn');
    expect(warnText).toBeDefined();
  });

  it('positions screen shows empty state', () => {
    const s = buildPositionsScreen({ header, positions: [] });
    const empty = s.body.find((b) => b.type === 'text');
    expect(empty).toBeDefined();
  });

  it('home screen with recent CAs renders table', () => {
    const s = buildHomeScreen({
      header,
      recentCAs: ['0xaaa', '0xbbb', '0xccc'],
    });
    const table = s.body.find((b) => b.type === 'table');
    expect(table).toBeDefined();
  });

  it('all Screen outputs validate against ScreenSchema', () => {
    const screens = [
      buildBuyScreen({ header, snapshot: fakeSnapshot() }),
      buildSellScreen({ header, snapshot: fakeSnapshot({ withHolding: true }) }),
      buildInfoScreen({ header, snapshot: fakeSnapshot() }),
      buildPositionsScreen({ header, positions: [] }),
      buildHomeScreen({ header }),
    ];
    for (const s of screens) {
      const parsed = ScreenSchema.safeParse(s);
      if (!parsed.success) {
        // surface useful debug info in the test output
        console.error('Screen validation failure', s.kind, parsed.error.issues);
      }
      expect(parsed.success).toBe(true);
    }
  });
});
