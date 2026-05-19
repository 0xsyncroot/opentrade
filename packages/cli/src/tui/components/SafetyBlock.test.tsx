// Snapshot tests for the SafetyBlock component — covers ok / warn / block tones.

import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import type { SafetyGate } from '@0xsyncroot/opentrade-core/schemas';
import { SafetyBlock } from './SafetyBlock.js';

describe('SafetyBlock', () => {
  it('renders empty state when no gates', () => {
    const { lastFrame } = render(<SafetyBlock gates={[]} />);
    expect(lastFrame()).toMatch(/no safety data/);
  });

  it('renders ok / warn / block glyphs with their labels and values', () => {
    const gates: SafetyGate[] = [
      { key: 'honeypot', label: 'Honeypot', value: 'no', level: 'ok' },
      { key: 'rug', label: 'Rug ratio', value: '0.18', level: 'warn' },
      { key: 'top10', label: 'Top10', value: '62%', level: 'block' },
    ];
    const { lastFrame } = render(<SafetyBlock gates={gates} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Honeypot');
    expect(frame).toContain('Rug ratio');
    expect(frame).toContain('Top10');
    expect(frame).toContain('✓');
    expect(frame).toContain('⚠');
    expect(frame).toContain('⛔');
  });
});
