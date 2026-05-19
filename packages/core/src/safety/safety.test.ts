import { describe, expect, it } from 'vitest';
import { evaluateSecurity, shouldUseAntiMev } from './index.js';

describe('evaluateSecurity', () => {
  it('blocks on is_honeypot=1', () => {
    const v = evaluateSecurity({
      address: '0x',
      is_honeypot: 1,
    });
    expect(v.block).toBe(true);
    expect(v.gates.find((g) => g.key === 'honeypot')?.level).toBe('block');
    expect(v.reasons.some((r) => r.startsWith('is_honeypot'))).toBe(true);
  });

  it('does not block on is_honeypot=0', () => {
    const v = evaluateSecurity({ address: '0x', is_honeypot: 0 });
    expect(v.block).toBe(false);
  });

  it('blocks on rug_ratio > 0.30', () => {
    const v = evaluateSecurity({ address: '0x', rug_ratio: 0.45 });
    expect(v.block).toBe(true);
  });

  it('warns on rug_ratio between 0.15 and 0.30', () => {
    const v = evaluateSecurity({ address: '0x', rug_ratio: 0.2 });
    expect(v.block).toBe(false);
    expect(v.warn).toBe(true);
  });

  it('blocks on top10 > 0.55 for non-V4 pool', () => {
    const v = evaluateSecurity({ address: '0x', top_10_holder_rate: 0.6 });
    expect(v.block).toBe(true);
  });

  it('adjusts top10 for Uniswap V4 (subtracts ~10%)', () => {
    const v = evaluateSecurity(
      { address: '0x', top_10_holder_rate: 0.6 },
      { address: '0xpool', exchange: 'uniswap_v4' },
    );
    // After V4 adjustment (0.6 - 0.1 = 0.5) → no longer blocking, but warn at >0.4
    expect(v.block).toBe(false);
    expect(v.warn).toBe(true);
  });

  it('warns on buy_tax > 10%', () => {
    const v = evaluateSecurity({ address: '0x', buy_tax: 0.15 });
    expect(v.warn).toBe(true);
  });

  it('treats blacklist=yes string as block', () => {
    const v = evaluateSecurity({ address: '0x', is_blacklist: '1' });
    expect(v.block).toBe(true);
  });
});

describe('shouldUseAntiMev', () => {
  it('forces OFF for Uniswap V4 on Base', () => {
    expect(shouldUseAntiMev('base', { address: '0x', exchange: 'uniswap_v4' })).toBe(false);
  });

  it('keeps ON for Uniswap V3 on Base', () => {
    expect(shouldUseAntiMev('base', { address: '0x', exchange: 'uniswap_v3' })).toBe(true);
  });

  it('returns ON for Solana (Jito)', () => {
    expect(shouldUseAntiMev('sol', undefined)).toBe(true);
  });

  it('default ON when pool info missing', () => {
    expect(shouldUseAntiMev('base', undefined)).toBe(true);
  });
});
