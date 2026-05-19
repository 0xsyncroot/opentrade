import { describe, expect, it } from 'vitest';
import { decideTier } from '../safety/confirm.js';
import type { BuyIntent, SellIntent, SendIntent } from '@0xsyncroot/opentrade-core/schemas';

const buy = (chain: 'base' | 'eth' | 'sol' | 'bsc', amountWei: string): BuyIntent => ({
  kind: 'buy',
  chain,
  token: '0x0000000000000000000000000000000000000001',
  amountWei,
  slippageBps: 800,
  antiMev: 'auto',
});

const sell = (percent: number): SellIntent => ({
  kind: 'sell',
  chain: 'base',
  token: '0x0000000000000000000000000000000000000001',
  percent,
  slippageBps: 800,
  antiMev: 'auto',
});

const send: SendIntent = {
  kind: 'send',
  chain: 'base',
  token: '0x0000000000000000000000000000000000000000',
  amountWei: '1000',
  to: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
};

describe('decideTier', () => {
  it('T0 when noConfirm flag set', () => {
    expect(decideTier({ intent: buy('base', '1'), noConfirm: true }).tier).toBe('T0');
  });

  it('T3 when safety warn', () => {
    expect(decideTier({ intent: buy('base', '1'), safetyWarn: true }).tier).toBe('T3');
  });

  it('T2 for ETH mainnet', () => {
    expect(decideTier({ intent: buy('eth', '1') }).tier).toBe('T2');
  });

  it('T2 for send intent', () => {
    expect(decideTier({ intent: send, isSend: true }).tier).toBe('T2');
  });

  it('T1 for sell 100%', () => {
    expect(decideTier({ intent: sell(100) }).tier).toBe('T1');
  });

  it('T0 when amount < 1% of balance', () => {
    // 1 wei vs 1e18 wei → 0.0000…1%
    const d = decideTier({ intent: buy('base', '1'), walletBalanceWei: '1000000000000000000' });
    expect(d.tier).toBe('T0');
  });

  it('T1 when amount in 1-5% range', () => {
    // 3% — 0.03 of 1.0 ETH
    const d = decideTier({
      intent: buy('base', '30000000000000000'),
      walletBalanceWei: '1000000000000000000',
    });
    expect(d.tier).toBe('T1');
  });

  it('T2 when amount > 5%', () => {
    const d = decideTier({
      intent: buy('base', '100000000000000000'), // 0.1 / 1 = 10%
      walletBalanceWei: '1000000000000000000',
    });
    expect(d.tier).toBe('T2');
  });

  it('T1 fallback when balance unknown for buy', () => {
    const d = decideTier({ intent: buy('base', '1') });
    expect(d.tier).toBe('T1');
  });
});
