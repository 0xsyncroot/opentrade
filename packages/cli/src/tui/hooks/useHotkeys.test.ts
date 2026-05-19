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

  it('Ctrl+C → quit', () => {
    const evt = mapHotkey('c', { ...KEY, ctrl: true });
    expect(evt).toEqual({ kind: 'quit' });
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
});
