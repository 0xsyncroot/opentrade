import { describe, expect, it } from 'vitest';
import { classifyInput, parseSlash } from './index.js';

describe('classifyInput', () => {
  it('detects EVM contract address', () => {
    const r = classifyInput('0x1234567890abcdef1234567890abcdef12345678');
    expect(r.kind).toBe('evm_ca');
    if (r.kind === 'evm_ca') {
      expect(r.address).toBe('0x1234567890abcdef1234567890abcdef12345678');
    }
  });

  it('lower-cases EVM address', () => {
    const r = classifyInput('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
    expect(r.kind).toBe('evm_ca');
    if (r.kind === 'evm_ca') {
      expect(r.address).toBe(r.address.toLowerCase());
    }
  });

  it('detects Solana base58 address', () => {
    const r = classifyInput('So11111111111111111111111111111111111111112');
    expect(r.kind).toBe('sol_ca');
  });

  it('detects slash command', () => {
    const r = classifyInput('/buy 0.05');
    expect(r.kind).toBe('slash');
    if (r.kind === 'slash') expect(r.raw).toBe('/buy 0.05');
  });

  it('strips whitespace and newlines from pasted CA', () => {
    const r = classifyInput('\n  0x1234567890abcdef1234567890abcdef12345678  \n');
    expect(r.kind).toBe('evm_ca');
  });

  it('extracts address from explorer URL', () => {
    const r = classifyInput(
      'https://basescan.org/token/0x1234567890abcdef1234567890abcdef12345678',
    );
    expect(r.kind).toBe('url');
    if (r.kind === 'url') {
      expect(r.extractedAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(r.chainHint).toBe('base');
    }
  });

  it('extracts Solana address from solscan URL', () => {
    const r = classifyInput(
      'https://solscan.io/token/So11111111111111111111111111111111111111112',
    );
    expect(r.kind).toBe('url');
    if (r.kind === 'url') expect(r.chainHint).toBe('sol');
  });

  it('classifies pure number', () => {
    const r = classifyInput('0.05');
    expect(r.kind).toBe('number');
    if (r.kind === 'number') expect(r.value).toBe(0.05);
  });

  it('classifies short alphanumeric as alias', () => {
    const r = classifyInput('ape');
    expect(r.kind).toBe('alias');
    if (r.kind === 'alias') expect(r.key).toBe('ape');
  });

  it('classifies empty', () => {
    expect(classifyInput('').kind).toBe('empty');
    expect(classifyInput('   ').kind).toBe('empty');
  });

  it('rejects invalid address-like garbage as unknown', () => {
    const r = classifyInput('0xZZZZ_not_a_real_address_too_short');
    expect(r.kind).toBe('unknown');
  });
});

describe('parseSlash', () => {
  it('parses /buy with positional + flag', () => {
    const r = parseSlash('/buy 0.05 --tp 50 --sl 20');
    expect(r.cmd).toBe('buy');
    if (r.cmd === 'buy') {
      expect(r.args).toEqual(['0.05']);
      expect(r.flags).toEqual({ tp: '50', sl: '20' });
    }
  });

  it('parses /sell percent', () => {
    const r = parseSlash('/sell 50');
    expect(r.cmd).toBe('sell');
    if (r.cmd === 'sell') expect(r.args).toEqual(['50']);
  });

  it('parses /chain switch', () => {
    const r = parseSlash('/chain sol');
    expect(r.cmd).toBe('chain');
    if (r.cmd === 'chain') expect(r.args).toEqual(['sol']);
  });

  it('parses boolean flag', () => {
    const r = parseSlash('/buy 0.05 --no-mev');
    expect(r.cmd).toBe('buy');
    if (r.cmd === 'buy') expect(r.flags['no-mev']).toBe(true);
  });

  it('returns unknown for garbage cmd', () => {
    const r = parseSlash('/xyznonexistent');
    expect(r.cmd).toBe('unknown');
  });

  it('returns help for bare slash', () => {
    const r = parseSlash('/');
    expect(r.cmd).toBe('help');
  });
});
