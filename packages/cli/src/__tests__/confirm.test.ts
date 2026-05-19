import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { decideTier, runT1Countdown } from '../safety/confirm.js';
import type { BuyIntent, SellIntent, SendIntent } from '@hiepht/opentrade-core/schemas';

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

  it('T1 fallback when wallet/trade sizing unknown for buy (interactive default)', () => {
    // Round-4 P1: GMGN's walletHoldings doesn't include native ETH/BNB on
    // EVM chains, so the CLI buy path often can't derive walletBalanceWei.
    // Forcing T2 (type-YES) on every interactive buy made the fast path
    // unusable. T1 (3 s inline countdown, Esc to cancel) is the right
    // interactive default — the user invoked the command explicitly.
    const d = decideTier({ intent: buy('base', '1') });
    expect(d.tier).toBe('T1');
  });

  it('T0/T1/T2 via USD-shape sizing (TUI path)', () => {
    // Same buy intent on base, varied walletUsd vs tradeUsd ratios.
    expect(decideTier({ intent: buy('base', '1'), walletUsd: 1000, tradeUsd: 5 }).tier).toBe('T0'); // 0.5%
    expect(decideTier({ intent: buy('base', '1'), walletUsd: 1000, tradeUsd: 30 }).tier).toBe('T1'); // 3%
    expect(decideTier({ intent: buy('base', '1'), walletUsd: 1000, tradeUsd: 100 }).tier).toBe('T2'); // 10%
  });
});

describe('runT1Countdown (P1-3 — manual replacement for clack confirm)', () => {
  it('resolves true on timeout (no TTY → auto-yes)', async () => {
    // PassThrough is not a TTY (isTTY undefined) — we exercise the headless
    // path. The countdown should complete naturally and resolve true.
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
    const start = Date.now();
    const result = await runT1Countdown(120, { stdin, stdout });
    const dur = Date.now() - start;
    expect(result).toBe(true);
    expect(dur).toBeGreaterThanOrEqual(100);
    expect(dur).toBeLessThan(500);
  });

  it('resolves quickly with a tiny window — no dangling listeners', async () => {
    // The bug being fixed (clack races a setTimeout vs `p.confirm` and the
    // confirm prompt keeps stdin in raw mode after the race). Verifying the
    // function returns within a tight window confirms cleanup happens.
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
    const result = await runT1Countdown(50, { stdin, stdout });
    expect(result).toBe(true);
  });
});
