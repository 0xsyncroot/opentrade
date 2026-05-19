// Store unit tests — focus on the auto buy/sell mode + sticky-30s logic and
// the inflightSeq race counter.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TokenSnapshot } from '@0xsyncroot/opentrade-core/services';
import { useTuiStore } from './index.js';

const snapshot = (usdValue: number | undefined): TokenSnapshot => ({
  token: {
    chain: 'base',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    price: 0.0001,
  },
  security: { address: '0x1234567890abcdef1234567890abcdef12345678' },
  pool: { address: '0xpool', exchange: 'aerodrome' },
  safety: { block: false, warn: false, gates: [], reasons: [] },
  myHolding:
    usdValue !== undefined
      ? {
          token_address: '0x1234567890abcdef1234567890abcdef12345678',
          symbol: 'PEPE',
          name: 'Pepe',
          decimals: 18,
          balance: '0',
          usd_value: usdValue,
          price: 0.0001,
        }
      : undefined,
});

const TOKEN_ADDR = '0x1234567890abcdef1234567890abcdef12345678';
const TOKEN_ADDR_2 = '0xabcdef1234567890abcdef1234567890abcdef12';

const reset = () =>
  useTuiStore.setState({
    currentToken: undefined,
    currentTokenAddr: undefined,
    lastTokenSetAt: 0,
    mode: 'buy',
    modeChangedAt: 0,
    inflightSeq: 0,
  });

afterEach(() => {
  reset();
  vi.useRealTimers();
});

describe('useTuiStore', () => {
  it('sets mode=sell when new token has holding > $0.50', () => {
    useTuiStore.getState().setCurrentToken(snapshot(28.94), TOKEN_ADDR);
    expect(useTuiStore.getState().mode).toBe('sell');
  });

  it('sets mode=buy when new token has no holding', () => {
    useTuiStore.getState().setCurrentToken(snapshot(undefined), TOKEN_ADDR);
    expect(useTuiStore.getState().mode).toBe('buy');
  });

  it('sets mode=buy when holding < $0.50', () => {
    useTuiStore.getState().setCurrentToken(snapshot(0.1), TOKEN_ADDR);
    expect(useTuiStore.getState().mode).toBe('buy');
  });

  it('sticky-30s: re-pasting same token within 30s keeps current mode', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T00:00:00Z'));
    useTuiStore.getState().setCurrentToken(snapshot(28.94), TOKEN_ADDR);
    // user manually flips to buy
    useTuiStore.getState().setMode('buy');
    expect(useTuiStore.getState().mode).toBe('buy');
    // re-paste the SAME CA 10s later — mode should stay buy
    vi.setSystemTime(new Date('2026-05-19T00:00:10Z'));
    useTuiStore.getState().setCurrentToken(snapshot(28.94), TOKEN_ADDR);
    expect(useTuiStore.getState().mode).toBe('buy');
  });

  it('different token after 30s recomputes mode from holding', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T00:00:00Z'));
    useTuiStore.getState().setCurrentToken(snapshot(28.94), TOKEN_ADDR);
    useTuiStore.getState().setMode('buy');
    // 40s later, a DIFFERENT token with holding → must flip to sell
    vi.setSystemTime(new Date('2026-05-19T00:00:40Z'));
    useTuiStore.getState().setCurrentToken(snapshot(12.34), TOKEN_ADDR_2);
    expect(useTuiStore.getState().mode).toBe('sell');
  });

  it('bumpInflight increments seq monotonically', () => {
    const s = useTuiStore.getState();
    const a = s.bumpInflight();
    const b = s.bumpInflight();
    const c = s.bumpInflight();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(useTuiStore.getState().inflightSeq).toBe(c);
  });

  it('pushHistory dedupes consecutive duplicates and trims to 50', () => {
    const s = useTuiStore.getState();
    for (let i = 0; i < 55; i++) s.pushHistory(`ca-${i}`);
    expect(useTuiStore.getState().inputHistory.length).toBe(50);
    // moving an existing entry to the end
    s.pushHistory('ca-10');
    const hist = useTuiStore.getState().inputHistory;
    expect(hist[hist.length - 1]).toBe('ca-10');
    expect(hist.filter((e) => e === 'ca-10').length).toBe(1);
  });
});
