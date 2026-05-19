import { describe, expect, it } from 'vitest';
import { CallbackCache } from './callback-cache.js';
import type { Intent } from '../schemas/index.js';

const sampleIntent: Intent = {
  kind: 'buy',
  chain: 'base',
  token: '0x1234567890abcdef1234567890abcdef12345678',
  amountWei: '5000000000000000',
  slippageBps: 800,
  antiMev: 'auto',
};

describe('CallbackCache', () => {
  it('stores and retrieves an Intent', () => {
    const cache = new CallbackCache();
    const id = cache.put(sampleIntent);
    expect(id.length).toBeLessThanOrEqual(12);
    const got = cache.get(id);
    expect(got).toEqual(sampleIntent);
  });

  it('id fits inside Telegram callback_data 64-byte budget', () => {
    const cache = new CallbackCache();
    const id = cache.put(sampleIntent);
    const callbackData = `act:${id}`;
    expect(Buffer.byteLength(callbackData, 'utf8')).toBeLessThan(64);
  });

  it('evicts oldest entry when capacity reached', () => {
    const cache = new CallbackCache({ capacity: 2 });
    const a = cache.put(sampleIntent);
    const b = cache.put({ ...sampleIntent, amountWei: '1' });
    cache.put({ ...sampleIntent, amountWei: '2' });
    expect(cache.get(a)).toBeUndefined();
    expect(cache.get(b)).toBeDefined();
  });

  it('expires entries past TTL', async () => {
    const cache = new CallbackCache({ ttlMs: 5 });
    const id = cache.put(sampleIntent);
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get(id)).toBeUndefined();
  });

  it('returns undefined for unknown id', () => {
    const cache = new CallbackCache();
    expect(cache.get('nonexistent')).toBeUndefined();
  });
});
