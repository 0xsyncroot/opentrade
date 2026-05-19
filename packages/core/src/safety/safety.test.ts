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

  // P1-6 — V4 detection must handle the various exchange label formats GMGN
  // surfaces. The original `includes('uniswap_v4')` only caught one form.
  it.each([
    'uniswap_v4',
    'Uniswap V4',
    'uniswap-v4',
    'uniswap v4',
    'UniswapV4',
    'univ4',
    'UniV4',
  ])('detects V4 from exchange label "%s"', (label) => {
    expect(shouldUseAntiMev('base', { address: '0x', exchange: label })).toBe(false);
  });

  it('detects V4 by PoolManager address when exchange label is missing', () => {
    // address-based fallback: pool's address === Uniswap V4 PoolManager on Base
    expect(
      shouldUseAntiMev('base', {
        address: '0x498581ff718922c3f8e6a244956af099b2652b2b',
        exchange: '',
      }),
    ).toBe(false);
  });

  it('does NOT misfire on unrelated labels (no false positives)', () => {
    expect(shouldUseAntiMev('base', { address: '0x', exchange: 'sushi_v2' })).toBe(true);
    expect(shouldUseAntiMev('base', { address: '0x', exchange: 'aerodrome' })).toBe(true);
    // v3 should not match v4 pattern
    expect(shouldUseAntiMev('base', { address: '0x', exchange: 'uniswap_v3' })).toBe(true);
  });
});
