// Positions list renders empty state + table rows with cursor highlight.

import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import type { Holding } from '@hiepht/opentrade-core/gmgn';
import { PositionsList } from './PositionsList.js';

const sample: Holding[] = [
  {
    token_address: '0x1234567890abcdef1234567890abcdef12345678',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    balance: '1000000000000000000',
    usd_value: 28.94,
    price: 0.0000234,
    pnl: 9.4,
    pnl_percent: 47.9,
  },
  {
    token_address: '0xabcdef1234567890abcdef1234567890abcdef12',
    symbol: 'BRETT',
    name: 'Brett',
    decimals: 18,
    balance: '2000000000000000000',
    usd_value: 50.0,
    price: 0.01,
    pnl: -3.5,
    pnl_percent: -6.5,
  },
];

describe('PositionsList', () => {
  it('renders empty state when no holdings', () => {
    const { lastFrame } = render(<PositionsList positions={[]} cursor={0} />);
    expect(lastFrame()).toMatch(/No open positions/);
  });

  it('renders table rows with cursor highlight', () => {
    const { lastFrame } = render(<PositionsList positions={sample} cursor={1} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('PEPE');
    expect(frame).toContain('BRETT');
    expect(frame).toContain('▶ BRETT'); // cursor 1
    expect(frame).toContain('$28.94');
    expect(frame).toContain('-3.5'); // PnL negative
  });
});
