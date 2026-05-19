import { describe, expect, it, vi } from 'vitest';
import { actions as actionsNs, type schemas, gmgn as gmgnNs } from '@hiepht/opentrade-core';
import { routeCallbackData, EXPIRED_MESSAGE, CALLBACK_PREFIX } from './callback-router.js';

function makeDispatcherCtx(): actionsNs.DispatcherContext {
  // A bare client we never actually call — the dispatch path we exercise is a
  // UI-noop intent ('refresh'), so no GMGN HTTP is touched.
  const client = new gmgnNs.GmgnClient({ apiKey: 'test-api-key-not-real' });
  return { client, wallets: { base: '0xabc' } };
}

describe('callback-router', () => {
  it('returns "expired" for an unknown uuid', async () => {
    const cache = new actionsNs.CallbackCache();
    const res = await routeCallbackData(`${CALLBACK_PREFIX}does-not-exist`, {
      cache,
      dispatcherCtx: makeDispatcherCtx(),
    });
    expect(res.kind).toBe('expired');
  });

  it('returns "unknown" for non-act prefix', async () => {
    const cache = new actionsNs.CallbackCache();
    const res = await routeCallbackData('foo:bar', {
      cache,
      dispatcherCtx: makeDispatcherCtx(),
    });
    expect(res.kind).toBe('unknown');
  });

  it('dispatches a stored intent (UI-noop refresh)', async () => {
    const cache = new actionsNs.CallbackCache();
    const intent: schemas.Intent = { kind: 'refresh' };
    const uuid = cache.put(intent);
    const res = await routeCallbackData(`${CALLBACK_PREFIX}${uuid}`, {
      cache,
      dispatcherCtx: makeDispatcherCtx(),
    });
    expect(res.kind).toBe('dispatched');
    if (res.kind === 'dispatched') {
      expect(res.intent.kind).toBe('refresh');
      expect(res.result.ok).toBe(true);
    }
  });

  it('callback router with a stubbed grammy ctx acknowledges + replies on expired', async () => {
    // Lightweight ctx stub that captures the calls we care about.
    const calls: Record<string, unknown[]> = { answer: [], reply: [] };
    const ctx = {
      callbackQuery: { data: `${CALLBACK_PREFIX}missing-uuid` },
      answerCallbackQuery: (a: unknown) => {
        calls.answer.push(a);
        return Promise.resolve();
      },
      reply: (text: string) => {
        calls.reply.push(text);
        return Promise.resolve();
      },
    };
    // Direct call via the same code path as makeCallbackRouter.
    const { makeCallbackRouter } = await import('./callback-router.js');
    const router = makeCallbackRouter({
      cache: new actionsNs.CallbackCache(),
      dispatcherCtx: makeDispatcherCtx(),
    });
    // Cast: we deliberately pass a minimal stub.
    await router(ctx as never);
    expect(calls.answer.length).toBe(1);
    expect((calls.answer[0] as { text: string }).text).toBe(EXPIRED_MESSAGE);
    expect(calls.reply.length).toBe(1);
  });
});
