// Pure-function tests for mapHotkey — no Ink runtime needed.

import { describe, expect, it } from 'vitest';
import type { Key } from 'ink';
import { mapHotkey } from './useHotkeys.js';

const KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  return: false,
  escape: false,
  tab: false,
  backspace: false,
  delete: false,
  ctrl: false,
  shift: false,
  meta: false,
} as Key;

describe('mapHotkey', () => {
  it('maps 1-4 to preset events with correct index', () => {
    for (let i = 1; i <= 4; i++) {
      const evt = mapHotkey(String(i), KEY);
      expect(evt).toEqual({ kind: 'preset', index: i });
    }
  });

  it('Tab → flip', () => {
    const evt = mapHotkey('', { ...KEY, tab: true });
    expect(evt).toEqual({ kind: 'flip' });
  });

  it('Esc → escape', () => {
    const evt = mapHotkey('', { ...KEY, escape: true });
    expect(evt).toEqual({ kind: 'escape' });
  });

  it('Ctrl+C → quit (with fromCtrl=true to bypass two-tap guard)', () => {
    const evt = mapHotkey('c', { ...KEY, ctrl: true });
    expect(evt).toEqual({ kind: 'quit', fromCtrl: true });
  });

  it('q → quit', () => {
    expect(mapHotkey('q', KEY)).toEqual({ kind: 'quit' });
  });

  it('/ → slash', () => {
    expect(mapHotkey('/', KEY)).toEqual({ kind: 'slash' });
  });

  it('? → help', () => {
    expect(mapHotkey('?', KEY)).toEqual({ kind: 'help' });
  });

  it('T (uppercase) → toggle_bot', () => {
    expect(mapHotkey('T', KEY)).toEqual({ kind: 'toggle_bot' });
  });

  it('lowercase t does NOT toggle bot (must be shift+T)', () => {
    // t is not mapped; returns null.
    expect(mapHotkey('t', KEY)).toBeNull();
  });

  it('letter hotkeys b/s/i/r/p/w/c/j/k/g/G map correctly', () => {
    const cases: [string, string][] = [
      ['b', 'force_buy'],
      ['s', 'force_sell'],
      ['i', 'info'],
      ['r', 'refresh'],
      ['p', 'positions'],
      ['w', 'wallet'],
      ['c', 'chain_palette'],
      ['j', 'list_down'],
      ['k', 'list_up'],
      ['g', 'list_top'],
      ['G', 'list_bottom'],
    ];
    for (const [input, kind] of cases) {
      const evt = mapHotkey(input, KEY);
      expect(evt?.kind).toBe(kind);
    }
  });

  it('unmapped keys return null', () => {
    expect(mapHotkey('x', KEY)).toBeNull();
    expect(mapHotkey('5', KEY)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Focus gate — added 2026-05-19 to fix "typing triggers buy/sell" bug.
  // When the user is composing text (inputBufferLength > 0) OR a modal/slash
  // overlay is open, single-letter and digit hotkeys must NOT fire.
  // ---------------------------------------------------------------------------
  describe('focus gate (buffer non-empty)', () => {
    const TYPING_CTX = { inputBufferLength: 3 } as const; // e.g. user typed "pep"

    it('suppresses letter hotkeys b/s/i/r/p/w/c while typing', () => {
      for (const ch of ['b', 's', 'i', 'r', 'p', 'w', 'c']) {
        expect(mapHotkey(ch, KEY, TYPING_CTX)).toBeNull();
      }
    });

    it('suppresses vim-nav j/k/g/G while typing', () => {
      for (const ch of ['j', 'k', 'g', 'G']) {
        expect(mapHotkey(ch, KEY, TYPING_CTX)).toBeNull();
      }
    });

    it('suppresses Telegram toggle T while typing', () => {
      expect(mapHotkey('T', KEY, TYPING_CTX)).toBeNull();
    });

    it('suppresses preset numbers 1-4 while typing', () => {
      for (const n of ['1', '2', '3', '4']) {
        expect(mapHotkey(n, KEY, TYPING_CTX)).toBeNull();
      }
    });

    it('suppresses slash / help while typing (let user type / or ?)', () => {
      expect(mapHotkey('/', KEY, TYPING_CTX)).toBeNull();
      expect(mapHotkey('?', KEY, TYPING_CTX)).toBeNull();
    });

    it('suppresses q (quit) while typing', () => {
      expect(mapHotkey('q', KEY, TYPING_CTX)).toBeNull();
    });

    it('Ctrl+C STILL fires (always-on quit, fromCtrl bypasses two-tap)', () => {
      expect(mapHotkey('c', { ...KEY, ctrl: true }, TYPING_CTX)).toEqual({
        kind: 'quit',
        fromCtrl: true,
      });
    });

    it('Esc STILL fires (always-on escape)', () => {
      expect(mapHotkey('', { ...KEY, escape: true }, TYPING_CTX)).toEqual({
        kind: 'escape',
      });
    });

    it('Enter STILL fires (always-on submit)', () => {
      expect(mapHotkey('', { ...KEY, return: true }, TYPING_CTX)).toEqual({
        kind: 'submit',
      });
    });

    it('Tab is suppressed while typing (do not flip mode mid-CA paste)', () => {
      expect(mapHotkey('', { ...KEY, tab: true }, TYPING_CTX)).toBeNull();
    });

    it('arrow keys never map to hotkeys (InputBar owns them)', () => {
      expect(mapHotkey('', { ...KEY, upArrow: true })).toBeNull();
      expect(mapHotkey('', { ...KEY, downArrow: true })).toBeNull();
      expect(mapHotkey('', { ...KEY, leftArrow: true })).toBeNull();
      expect(mapHotkey('', { ...KEY, rightArrow: true })).toBeNull();
    });

    it('inputBufferLength=0 → letter hotkeys re-enable', () => {
      const ctx = { inputBufferLength: 0 };
      expect(mapHotkey('b', KEY, ctx)).toEqual({ kind: 'force_buy' });
      expect(mapHotkey('/', KEY, ctx)).toEqual({ kind: 'slash' });
    });
  });

  describe('focus gate (modal / slash overlay open)', () => {
    it('suppresses letter hotkeys when modal is open', () => {
      const ctx = { modalOpen: true };
      expect(mapHotkey('b', KEY, ctx)).toBeNull();
      expect(mapHotkey('/', KEY, ctx)).toBeNull();
      expect(mapHotkey('1', KEY, ctx)).toBeNull();
    });

    it('still allows Esc and Enter when modal is open', () => {
      const ctx = { modalOpen: true };
      expect(mapHotkey('', { ...KEY, escape: true }, ctx)).toEqual({ kind: 'escape' });
      expect(mapHotkey('', { ...KEY, return: true }, ctx)).toEqual({ kind: 'submit' });
    });

    it('suppresses letter hotkeys when slash palette is open', () => {
      const ctx = { slashOpen: true };
      expect(mapHotkey('b', KEY, ctx)).toBeNull();
      expect(mapHotkey('s', KEY, ctx)).toBeNull();
      // numbers stay suppressed too (could be part of /chain base typed shortcut)
      expect(mapHotkey('1', KEY, ctx)).toBeNull();
    });
  });
});
