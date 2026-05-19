import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { filterSlashItems, SlashPalette } from './SlashPalette.js';

describe('filterSlashItems', () => {
  it('empty query → all items', () => {
    const items = filterSlashItems('');
    expect(items.length).toBeGreaterThan(5);
  });

  it('"buy" matches /buy first', () => {
    const items = filterSlashItems('buy');
    expect(items[0]?.cmd).toBe('buy');
  });

  it('subsequence match works (`hp` finds `help`)', () => {
    const items = filterSlashItems('hp');
    const names = items.map((i) => i.cmd);
    expect(names).toContain('help');
  });

  it('non-existent query returns empty list', () => {
    const items = filterSlashItems('zzzzzzzzz');
    expect(items).toEqual([]);
  });
});

describe('SlashPalette render', () => {
  it('renders filtered list with cursor highlight', () => {
    const { lastFrame } = render(<SlashPalette query="buy" cursor={0} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('/buy');
    expect(frame).toContain('▶');
  });

  it('shows no-matches message for impossible query', () => {
    const { lastFrame } = render(<SlashPalette query="zzzz" cursor={0} />);
    expect(lastFrame()).toMatch(/no matches/);
  });
});
