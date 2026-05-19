// ConfirmModal — pure-function tier policy + snapshot render.

import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { ConfirmModal, decideConfirmTier } from './ConfirmModal.js';

describe('decideConfirmTier', () => {
  it('T3 when safety.warn', () => {
    const t = decideConfirmTier({
      intent: {
        kind: 'buy',
        chain: 'base',
        token: '0x1234567890abcdef1234567890abcdef12345678',
        amountWei: '1000',
        slippageBps: 800,
        antiMev: 'auto',
      },
      walletUsd: 1000,
      tradeUsd: 1,
      safetyWarn: true,
    });
    expect(t).toBe('T3');
  });

  it('T2 on ETH mainnet buy', () => {
    const t = decideConfirmTier({
      intent: {
        kind: 'buy',
        chain: 'eth',
        token: '0x1234567890abcdef1234567890abcdef12345678',
        amountWei: '1000',
        slippageBps: 500,
        antiMev: 'auto',
      },
      walletUsd: 1000,
      tradeUsd: 1,
    });
    expect(t).toBe('T2');
  });

  it('T2 when buy > 5% wallet on base', () => {
    const t = decideConfirmTier({
      intent: {
        kind: 'buy',
        chain: 'base',
        token: '0x1234567890abcdef1234567890abcdef12345678',
        amountWei: '1000',
        slippageBps: 800,
        antiMev: 'auto',
      },
      walletUsd: 1000,
      tradeUsd: 100,
    });
    expect(t).toBe('T2');
  });

  it('T1 when buy 1-5% wallet', () => {
    const t = decideConfirmTier({
      intent: {
        kind: 'buy',
        chain: 'base',
        token: '0x1234567890abcdef1234567890abcdef12345678',
        amountWei: '1000',
        slippageBps: 800,
        antiMev: 'auto',
      },
      walletUsd: 1000,
      tradeUsd: 20,
    });
    expect(t).toBe('T1');
  });

  it('T0 silent when < 1% wallet on base', () => {
    const t = decideConfirmTier({
      intent: {
        kind: 'buy',
        chain: 'base',
        token: '0x1234567890abcdef1234567890abcdef12345678',
        amountWei: '1000',
        slippageBps: 800,
        antiMev: 'auto',
      },
      walletUsd: 1000,
      tradeUsd: 5,
    });
    expect(t).toBe('T0');
  });

  it('T1 for sell 100% — baseline guard', () => {
    const t = decideConfirmTier({
      intent: {
        kind: 'sell',
        chain: 'base',
        token: '0x1234567890abcdef1234567890abcdef12345678',
        percent: 100,
        slippageBps: 800,
        antiMev: 'auto',
      },
      walletUsd: 1000,
      tradeUsd: 1000,
    });
    expect(t).toBe('T1');
  });
});

describe('ConfirmModal render', () => {
  it('shows tier and summary', () => {
    const { lastFrame } = render(
      <ConfirmModal
        modal={{
          kind: 'confirm',
          tier: 'T2',
          payload: {
            intent: {
              kind: 'buy',
              chain: 'base',
              token: '0x1234567890abcdef1234567890abcdef12345678',
              amountWei: '1000',
              slippageBps: 800,
              antiMev: 'auto',
            },
            summary: 'Buy PEPE for 1000 wei on base',
          },
          resolve: () => undefined,
        }}
        typedText="YE"
        onResolve={() => undefined}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Confirm action');
    expect(frame).toContain('T2');
    expect(frame).toContain('Buy PEPE');
    expect(frame).toContain('YES');
  });

  it('T3 shows risky symbol prompt', () => {
    const { lastFrame } = render(
      <ConfirmModal
        modal={{
          kind: 'confirm',
          tier: 'T3',
          payload: {
            intent: {
              kind: 'buy',
              chain: 'base',
              token: '0x1234567890abcdef1234567890abcdef12345678',
              amountWei: '1000',
              slippageBps: 800,
              antiMev: 'auto',
            },
            summary: 'Buy risky PEPE',
            confirmSymbol: 'PEPE',
            safetyReasons: ['top10>0.55'],
          },
          resolve: () => undefined,
        }}
        typedText=""
        onResolve={() => undefined}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Risky token');
    expect(frame).toContain('PEPE');
    expect(frame).toContain('top10>0.55');
  });
});
