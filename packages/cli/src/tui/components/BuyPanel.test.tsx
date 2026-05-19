// Snapshot tests for BuyPanel & SellPanel — feed them realistic ActionButton[]
// arrays as the Screen builder would produce.

import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import type { ActionButton } from '@0xsyncroot/opentrade-core/schemas';
import { BuyPanel } from './BuyPanel.js';
import { SellPanel } from './SellPanel.js';

const buyActions: ActionButton[] = [0.01, 0.03, 0.05, 0.1].map((amt, i) => ({
  id: `b${i + 1}`,
  label: `${amt} ETH`,
  hotkey: String(i + 1),
  intent: {
    kind: 'buy',
    chain: 'base',
    token: '0x1234567890abcdef1234567890abcdef12345678',
    amountWei: '10000000000000000',
    slippageBps: 800,
    antiMev: 'auto',
  },
  tone: 'primary',
}));

const sellActions: ActionButton[] = [25, 50, 75, 100].map((pct) => ({
  id: `s${pct}`,
  label: `${pct}%`,
  hotkey: String([25, 50, 75, 100].indexOf(pct) + 1),
  intent: {
    kind: 'sell',
    chain: 'base',
    token: '0x1234567890abcdef1234567890abcdef12345678',
    percent: pct,
    slippageBps: 800,
    antiMev: 'auto',
  },
  tone: pct === 100 ? 'danger' : 'primary',
}));

describe('BuyPanel', () => {
  it('shows 4 buttons with hotkeys 1-4', () => {
    const { lastFrame } = render(<BuyPanel actions={buyActions} paramsLine="Slip 8%" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Quick Buy');
    for (let i = 1; i <= 4; i++) expect(frame).toContain(`[${i}]`);
    expect(frame).toContain('0.01 ETH');
    expect(frame).toContain('Slip 8%');
  });
});

describe('SellPanel', () => {
  it('renders 25/50/75/100% buttons', () => {
    const { lastFrame } = render(<SellPanel actions={sellActions} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Quick Sell');
    expect(frame).toContain('25%');
    expect(frame).toContain('100%');
  });
});
