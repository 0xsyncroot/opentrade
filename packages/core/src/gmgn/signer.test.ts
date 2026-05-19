import { describe, expect, it } from 'vitest';
import { buildMessage, generateEd25519Keypair, signEd25519, extractPublicFromPrivate } from './signer.js';

describe('buildMessage', () => {
  it('matches Python reference: sub_path:sorted_qs:body:ts', () => {
    const msg = buildMessage(
      '/v1/trade/quote',
      { chain: 'base', input_amount: '1000', timestamp: 1700000000 },
      '',
      1700000000,
    );
    // Sorted: chain, input_amount, timestamp
    expect(msg).toBe('/v1/trade/quote:chain=base&input_amount=1000&timestamp=1700000000::1700000000');
  });

  it('handles array values (sorted, repeated)', () => {
    const msg = buildMessage('/foo', { tag: ['b', 'a'], x: '1' }, '', 1);
    // tag values sorted alpha: a, b
    expect(msg).toBe('/foo:tag=a&tag=b&x=1::1');
  });

  it('includes body string between query and ts', () => {
    const msg = buildMessage('/v1/trade/swap', { chain: 'base' }, '{"k":"v"}', 100);
    expect(msg).toBe('/v1/trade/swap:chain=base:{"k":"v"}:100');
  });
});

describe('Ed25519 sign / verify cycle', () => {
  it('generates keypair, signs message, signature is base64', () => {
    const { privatePem, publicPem } = generateEd25519Keypair();
    expect(privatePem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(publicPem).toContain('-----BEGIN PUBLIC KEY-----');

    const sig = signEd25519('hello world', privatePem);
    expect(typeof sig).toBe('string');
    // base64 charset
    expect(/^[A-Za-z0-9+/=]+$/.test(sig)).toBe(true);
    // Ed25519 signatures are 64 bytes → 88 base64 chars (with padding)
    expect(sig.length).toBeGreaterThan(80);
  });

  it('extracts matching public key from private', () => {
    const { privatePem, publicPem } = generateEd25519Keypair();
    const extracted = extractPublicFromPrivate(privatePem);
    expect(extracted.trim()).toBe(publicPem.trim());
  });

  it('signs with passphrase-encrypted key', () => {
    const { privatePem } = generateEd25519Keypair('correct horse battery staple');
    expect(privatePem).toContain('ENCRYPTED');
    const sig = signEd25519('msg', privatePem, 'correct horse battery staple');
    expect(sig.length).toBeGreaterThan(80);
  });
});
