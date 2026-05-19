// App-level integration: simulate paste → Tab flip → preset 1 dispatch.
//
// We pass an in-memory `fetchSnapshotImpl` so no GMGN client is needed, plus
// `onIntent` to assert what the dispatcher would receive.

import { render } from 'ink-testing-library';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TokenSnapshot } from '@hiepht/opentrade-core/services';
import { App } from './App.js';
import { useTuiStore } from './store/index.js';

const TOKEN_A = '0x1111111111111111111111111111111111111111';
const TOKEN_B = '0x2222222222222222222222222222222222222222';

function snap(addr: string, withHolding: boolean): TokenSnapshot {
  return {
    token: {
      chain: 'base',
      address: addr,
      symbol: addr.slice(-4).toUpperCase(),
      name: 'Test',
      decimals: 18,
      price: 0.0001,
    },
    security: { address: addr },
    pool: { address: '0xpool', exchange: 'aerodrome' },
    safety: { block: false, warn: false, gates: [], reasons: [] },
    myHolding: withHolding
      ? {
          token_address: addr,
          symbol: addr.slice(-4).toUpperCase(),
          name: 'Test',
          decimals: 18,
          balance: '0',
          usd_value: 28.94,
          price: 0.0001,
        }
      : undefined,
  };
}

const tree = (props: React.ComponentProps<typeof App>) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    React.createElement(App, props),
  );

const baseProps = {
  client: undefined,
  config: undefined,
  initialChain: 'base' as const,
  walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  testMode: true, // pauses background polling
};

afterEach(() => {
  // Reset store between tests.
  useTuiStore.setState({
    currentToken: undefined,
    currentTokenAddr: undefined,
    lastTokenSetAt: 0,
    mode: 'buy',
    modeChangedAt: 0,
    inflightSeq: 0,
    inputHistory: [],
    historyIndex: -1,
    slashOpen: false,
    helpOpen: false,
    modalStack: [],
    holdings: [],
    botStatus: 'off',
  });
});

// Ink registers its stdin listener inside a useEffect — give the App one tick
// before driving keystrokes so we don't drop the paste on the floor.
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('App paste + Tab + preset 1', () => {
  it('paste CA → fetch snapshot → renders token symbol', async () => {
    const fetchImpl = vi.fn(async () => snap(TOKEN_A, false));
    const { stdin, lastFrame, frames } = render(
      tree({
        ...baseProps,
        fetchSnapshotImpl: fetchImpl as unknown as typeof import('@hiepht/opentrade-core/services').fetchTokenSnapshot,
      }),
    );
    await settle(60);
    stdin.write(TOKEN_A);
    // 30ms debounce in usePaste + 1 microtask for fetch resolution
    await settle(120);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(useTuiStore.getState().currentTokenAddr).toBe(TOKEN_A);
    expect(useTuiStore.getState().mode).toBe('buy');
    expect(lastFrame() ?? frames.join('\n')).toContain(TOKEN_A.slice(-4).toUpperCase());
  });

  it('Tab flips mode buy ↔ sell', async () => {
    const { stdin } = render(
      tree({
        ...baseProps,
        initialSnapshot: snap(TOKEN_A, false),
      }),
    );
    await settle(60);
    expect(useTuiStore.getState().mode).toBe('buy');
    stdin.write('\t');
    await settle(50);
    expect(useTuiStore.getState().mode).toBe('sell');
    stdin.write('\t');
    await settle(50);
    expect(useTuiStore.getState().mode).toBe('buy');
  });

  it('preset key "1" dispatches first buy intent', async () => {
    const onIntent = vi.fn();
    const { stdin } = render(
      tree({
        ...baseProps,
        initialSnapshot: snap(TOKEN_A, false),
        onIntent,
      }),
    );
    await settle(60);
    stdin.write('1');
    await settle(50);
    expect(onIntent).toHaveBeenCalled();
    const first = onIntent.mock.calls[0]?.[0];
    expect(first?.kind).toBe('buy');
    expect(first?.chain).toBe('base');
    expect(first?.token).toBe(TOKEN_A);
  });

  it('race: paste TOKEN_A then paste TOKEN_B before fetch1 resolves — Screen reflects TOKEN_B only', async () => {
    let resolveFirst: ((s: TokenSnapshot) => void) | undefined;
    const fetchImpl = vi.fn(async (_client: unknown, args: { token: string }) => {
      if (args.token === TOKEN_A) {
        return new Promise<TokenSnapshot>((res) => {
          resolveFirst = res;
        });
      }
      return snap(TOKEN_B, false);
    });
    const { stdin } = render(
      tree({
        ...baseProps,
        fetchSnapshotImpl: fetchImpl as unknown as typeof import('@hiepht/opentrade-core/services').fetchTokenSnapshot,
      }),
    );
    await settle(60);
    stdin.write(TOKEN_A);
    await settle(90);
    stdin.write(TOKEN_B);
    await settle(120);
    // Resolve the stale first paste — must be dropped by the seq guard.
    if (resolveFirst) resolveFirst(snap(TOKEN_A, false));
    await settle(60);
    expect(useTuiStore.getState().currentTokenAddr).toBe(TOKEN_B);
  });
});
