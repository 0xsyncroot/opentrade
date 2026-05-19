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
  disableHistoryPersist: true, // tests must not touch ~/.config/opentrade/history.json
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
    overrideRisky: false,
    recentOverlayOpen: false,
    statusMessage: undefined,
    statusTone: undefined,
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

  it('typing letters that look like hotkeys does NOT trigger buy/sell — buffer accumulates', async () => {
    // Bug fix verification (2026-05-19): user typed "base" and the TUI flipped
    // to buy-mode + sell-mode + info + refresh + opened chain palette. The
    // mapHotkey focus gate must suppress letter hotkeys while inputBuffer > 0.
    const onIntent = vi.fn();
    const { stdin } = render(
      tree({
        ...baseProps,
        initialSnapshot: snap(TOKEN_A, false),
        onIntent,
      }),
    );
    await settle(60);
    expect(useTuiStore.getState().mode).toBe('buy');
    // Type chars one at a time — each <30ms apart so they flow through onChar.
    // First letter is `b` which IS a hotkey when buffer is empty → first char
    // triggers force_buy (no-op since we're already in buy mode). The remaining
    // letters land while buffer length is the slash-prefilled '/' (no, actually
    // buffer starts empty here). Let's instead type a non-hotkey first char to
    // seed the buffer, then verify subsequent hotkey letters DO NOT fire.
    stdin.write('x'); // unmapped — flows into buffer (length 1)
    await settle(50);
    // Now buffer is "x" — typing 'b' should NOT fire force_buy, 's' should NOT
    // fire force_sell, etc. We verify by checking mode never flipped to sell.
    stdin.write('b');
    await settle(50);
    stdin.write('a');
    await settle(50);
    stdin.write('s');
    await settle(50);
    stdin.write('e');
    await settle(50);
    expect(useTuiStore.getState().mode).toBe('buy'); // unchanged
    // No buy/sell intents dispatched from typing.
    const intentKinds = onIntent.mock.calls.map((c) => c[0]?.kind);
    expect(intentKinds).not.toContain('buy');
    expect(intentKinds).not.toContain('sell');
  });

  it('first letter while buffer empty still fires hotkey (gate only kicks in when typing)', async () => {
    // Sanity: the gate doesn't break the empty-buffer behaviour. Pressing 'b'
    // with an empty buffer flips to BUY (no-op here) — but more importantly
    // pressing 's' from a fresh buffer flips to SELL.
    const { stdin } = render(
      tree({
        ...baseProps,
        initialSnapshot: snap(TOKEN_A, false),
      }),
    );
    await settle(60);
    expect(useTuiStore.getState().mode).toBe('buy');
    stdin.write('s'); // buffer empty → hotkey fires
    await settle(50);
    expect(useTuiStore.getState().mode).toBe('sell');
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

  it('slash /buy 0.05 with current token loaded dispatches a BuyIntent', async () => {
    // Verifies the in-TUI /buy handler builds a BuyIntent (chain, token,
    // amountWei) from the current snapshot + default preset, rather than
    // dumping the Phase-2 placeholder.
    const onIntent = vi.fn();
    const { stdin } = render(
      tree({
        ...baseProps,
        initialSnapshot: snap(TOKEN_A, false),
        onIntent,
      }),
    );
    await settle(60);
    // Pasting the whole slash string is treated as a paste burst by usePaste
    // (>6 chars) and handlePaste routes 'slash' classification straight to
    // handleSlashCommand — same code path the user hits typing `/buy 0.05`
    // then Enter.
    stdin.write('/buy 0.05');
    await settle(120);
    expect(onIntent).toHaveBeenCalled();
    const intent = onIntent.mock.calls[0]?.[0];
    expect(intent?.kind).toBe('buy');
    expect(intent?.chain).toBe('base');
    expect(intent?.token).toBe(TOKEN_A);
    // 0.05 ETH in wei = 5 * 10^16 = 50000000000000000
    expect(intent?.amountWei).toBe('50000000000000000');
  });

  it('slash /init shows the shell hand-off message (no Phase 2 placeholder)', async () => {
    const { stdin } = render(
      tree({
        ...baseProps,
      }),
    );
    await settle(60);
    stdin.write('/init xx'); // pad to 8 chars so usePaste treats it as paste
    await settle(120);
    const status = useTuiStore.getState().statusMessage ?? '';
    // Must NOT be the old Phase-2 placeholder.
    expect(status).not.toMatch(/Phase 2/i);
    // Must include the exact shell command to run.
    expect(status).toMatch(/opentrade init/);
  });

  it('slash /sell 50 without holding warns the user', async () => {
    const onIntent = vi.fn();
    const { stdin } = render(
      tree({
        ...baseProps,
        initialSnapshot: snap(TOKEN_A, false),
        onIntent,
      }),
    );
    await settle(60);
    stdin.write('/sell 50');
    await settle(120);
    expect(onIntent).not.toHaveBeenCalled();
    expect(useTuiStore.getState().statusTone).toBe('warn');
  });

  it('slash /risk allow flips overrideRisky on', async () => {
    const { stdin } = render(tree({ ...baseProps }));
    await settle(60);
    expect(useTuiStore.getState().overrideRisky).toBe(false);
    stdin.write('/risk allow');
    await settle(120);
    expect(useTuiStore.getState().overrideRisky).toBe(true);
  });

  it('pushHistory + remount with same historyFile restores entries', async () => {
    // End-to-end: paste seeds history; re-mount loads the file via
    // resolvePaths().historyFile. Tests use a tmp dir so we don't clobber
    // the user's real file.
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opentrade-app-hist-'));
    const historyFile = path.join(tmp, 'history.json');
    try {
      const fetchImpl = vi.fn(async () => snap(TOKEN_A, false));
      const first = render(
        tree({
          ...baseProps,
          disableHistoryPersist: false,
          historyFile,
          fetchSnapshotImpl: fetchImpl as unknown as typeof import('@hiepht/opentrade-core/services').fetchTokenSnapshot,
        }),
      );
      await settle(60);
      first.stdin.write(TOKEN_A);
      // 30ms paste debounce + fetch
      await settle(150);
      // Flush the debounced (500ms) history save.
      const { flushPendingSaves } = await import('./history-store.js');
      await flushPendingSaves(historyFile);
      first.unmount();
      expect(fs.existsSync(historyFile)).toBe(true);

      // Reset store to mimic a cold restart.
      useTuiStore.setState({ inputHistory: [], historyIndex: -1 });
      // Re-hydrate explicitly (production does this in main.ts before mount).
      const { loadHistory } = await import('./history-store.js');
      useTuiStore.getState().setHistory(loadHistory(historyFile));

      // After re-hydration, inputHistory should contain TOKEN_A again.
      expect(useTuiStore.getState().inputHistory).toContain(TOKEN_A);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('history ↑ on empty buffer loads the last entry', async () => {
    // Seed history directly to bypass paste, then drive ↑ via stdin.
    useTuiStore.setState({
      inputHistory: ['0xabc', '0xdef', '0xfeed'],
      historyIndex: -1,
    });
    const { stdin, lastFrame, frames } = render(
      tree({
        ...baseProps,
      }),
    );
    await settle(60);
    // Up arrow — Ink sends ESC [ A
    stdin.write('[A');
    await settle(80);
    const rendered = lastFrame() ?? frames.join('\n');
    expect(rendered).toContain('0xfeed');
  });

  it('P1-1: aborted-by-newer-paste fetch does NOT surface an error status', async () => {
    // Bug: capture of abortable.controller.signal AFTER await meant the catch
    // saw the NEW controller (not aborted) → user got "Fetch failed: AbortError"
    // flashed on screen for every double-paste.
    const fetchImpl = vi.fn(async (_client: unknown, args: { token: string; signal?: AbortSignal }) => {
      if (args.token === TOKEN_A) {
        // Simulate a fetch that gets aborted: when signal fires, reject with
        // an AbortError. (The real undici fetch behaves identically.)
        return new Promise<TokenSnapshot>((_res, rej) => {
          args.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            rej(err);
          });
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
    // Give the rejected first promise time to surface (or be swallowed).
    await settle(150);
    const state = useTuiStore.getState();
    expect(state.currentTokenAddr).toBe(TOKEN_B);
    // The crucial assertion: no "Fetch failed" error status surfaced.
    expect(state.statusTone).not.toBe('error');
    expect(state.statusMessage ?? '').not.toMatch(/abort|fetch failed/i);
  });
});
