// InkRenderer end-to-end snapshot — render BUY / SELL / SAFETY-BLOCK / POSITIONS
// screens directly off the core builders, then assert key strings appear.

import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  buildBuyScreen,
  buildHeader,
  buildPositionsScreen,
  buildSellScreen,
} from '@0xsyncroot/opentrade-core/views';
import type { TokenSnapshot } from '@0xsyncroot/opentrade-core/services';
import { InkRenderer } from './InkRenderer.js';

const header = buildHeader({
  chain: 'base',
  walletAddress: '0x12345678901234567890123456789012345678ab',
  nativeBalanceWei: (123n * 10n ** 15n).toString(),
  nativeBalanceUsd: 1234.56,
  openPositions: 3,
});

const snapshot = (withHolding = false, blockHoneypot = false): TokenSnapshot => ({
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
    is_honeypot: blockHoneypot ? 1 : 0,
    rug_ratio: 0.03,
    top_10_holder_rate: 0.38,
    buy_tax: 0,
    sell_tax: 0,
    renounced: 1,
    open_source: 1,
  },
  pool: { address: '0xpool', exchange: 'aerodrome' },
  safety: {
    block: blockHoneypot,
    warn: false,
    gates: [
      {
        key: 'honeypot',
        label: 'Honeypot',
        value: blockHoneypot ? 'YES' : 'no',
        level: blockHoneypot ? 'block' : 'ok',
      },
      { key: 'rug', label: 'Rug ratio', value: '0.03', level: 'ok' },
    ],
    reasons: blockHoneypot ? ['is_honeypot=1'] : [],
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

describe('InkRenderer', () => {
  it('renders buy screen body (text + kv + safety)', () => {
    const screen = buildBuyScreen({ header, snapshot: snapshot() });
    const { lastFrame } = render(<InkRenderer screen={screen} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('PEPE');
    expect(frame).toContain('MCap');
    expect(frame).toContain('Honeypot');
  });

  it('renders sell screen with holding block', () => {
    const screen = buildSellScreen({ header, snapshot: snapshot(true) });
    const { lastFrame } = render(<InkRenderer screen={screen} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('You hold');
    expect(frame).toContain('PEPE');
    expect(frame).toContain('P&L');
  });

  it('renders sell screen warn when no holding', () => {
    const screen = buildSellScreen({ header, snapshot: snapshot(false) });
    const { lastFrame } = render(<InkRenderer screen={screen} />);
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/No holding/);
  });

  it('renders positions screen empty', () => {
    const screen = buildPositionsScreen({ header, positions: [] });
    const { lastFrame } = render(<InkRenderer screen={screen} />);
    expect(lastFrame()).toMatch(/No open positions/);
  });

  it('safety block displays blocked honeypot tag', () => {
    const screen = buildBuyScreen({ header, snapshot: snapshot(false, true) });
    const { lastFrame } = render(<InkRenderer screen={screen} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Honeypot');
    expect(frame).toContain('YES');
  });
});
