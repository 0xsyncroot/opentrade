import { describe, expect, it, vi } from 'vitest';
import { WhitelistAuth } from './auth.js';

describe('WhitelistAuth', () => {
  it('allows the owner', () => {
    const a = new WhitelistAuth({ ownerChatId: '12345' });
    expect(a.isAllowed(12345)).toBe(true);
  });

  it('drops non-owner', () => {
    const onDrop = vi.fn();
    const a = new WhitelistAuth({ ownerChatId: '12345', onDrop });
    expect(a.isAllowed(67890)).toBe(false);
    expect(a.isAllowed(undefined)).toBe(false);
    expect(onDrop).toHaveBeenCalledTimes(2);
    expect(onDrop.mock.calls[0]![0]).toMatchObject({ reason: 'whitelist' });
  });

  it('enforces per-minute rate limit', () => {
    const onDrop = vi.fn();
    const a = new WhitelistAuth({ ownerChatId: '12345', rateLimit: { perMinute: 3 }, onDrop });
    expect(a.isAllowed(12345)).toBe(true);
    expect(a.isAllowed(12345)).toBe(true);
    expect(a.isAllowed(12345)).toBe(true);
    expect(a.isAllowed(12345)).toBe(false);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0]![0]).toMatchObject({ reason: 'rate_limit' });
  });

  it('middleware invokes next() only for owner', async () => {
    const a = new WhitelistAuth({ ownerChatId: '12345' });
    const next = vi.fn(async () => {});
    type CtxStub = { chat?: { id: number } };
    const mw = a.middleware<CtxStub>() as (ctx: CtxStub, n: () => Promise<void>) => Promise<void>;

    await mw({ chat: { id: 12345 } }, next);
    expect(next).toHaveBeenCalledTimes(1);
    await mw({ chat: { id: 99 } }, next);
    expect(next).toHaveBeenCalledTimes(1);
    await mw({}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
