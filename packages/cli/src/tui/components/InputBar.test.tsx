// InputBar — keystroke accumulation, focus-gate handoff to shouldConsume,
// and ↑/↓ history navigation. The App-level test in App.test.tsx covers the
// integrated path; these tests focus on the InputBar's local contract.

import { render } from 'ink-testing-library';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InputBar } from './InputBar.js';

// A tiny harness: holds the buffer in component state and forwards the
// shouldConsume callback so each test can configure it.
function Harness(props: {
  shouldConsume?: (input: string, key: import('ink').Key) => boolean;
  onSubmit?: (text: string) => void;
  onPaste?: (chunk: string) => void;
  onHistoryUp?: () => void;
  onHistoryDown?: () => void;
  initial?: string;
}) {
  const [buffer, setBuffer] = useState(props.initial ?? '');
  return (
    <InputBar
      buffer={buffer}
      setBuffer={setBuffer}
      enabled
      onSubmit={props.onSubmit ?? (() => undefined)}
      onPaste={props.onPaste ?? (() => undefined)}
      shouldConsume={props.shouldConsume}
      onHistoryUp={props.onHistoryUp}
      onHistoryDown={props.onHistoryDown}
    />
  );
}

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('InputBar', () => {
  it('typing slow chars accumulates into the buffer', async () => {
    const { stdin, lastFrame } = render(<Harness />);
    await settle(50);
    stdin.write('a');
    await settle(50);
    stdin.write('b');
    await settle(50);
    stdin.write('c');
    await settle(50);
    const out = lastFrame() ?? '';
    expect(out).toContain('abc');
  });

  it('paste burst (>=6 chars in one tick) fires onPaste, NOT onChar', async () => {
    const onPaste = vi.fn();
    const { stdin } = render(<Harness onPaste={onPaste} />);
    await settle(50);
    stdin.write('0x1234567890abcdef'); // 18 chars in one burst
    await settle(80);
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(onPaste.mock.calls[0]?.[0]).toBe('0x1234567890abcdef');
  });

  it('shouldConsume=true drops the char (used for hotkeys when buffer is empty)', async () => {
    const shouldConsume = vi.fn(() => true);
    const { stdin, lastFrame } = render(<Harness shouldConsume={shouldConsume} />);
    await settle(50);
    stdin.write('b'); // pretend this is a hotkey letter
    await settle(50);
    expect(shouldConsume).toHaveBeenCalled();
    const out = lastFrame() ?? '';
    // buffer should remain empty
    expect(out).not.toContain('b');
  });

  it('shouldConsume=false lets the char into the buffer (focus-gate path)', async () => {
    const shouldConsume = vi.fn(() => false);
    const { stdin, lastFrame } = render(
      <Harness initial="x" shouldConsume={shouldConsume} />,
    );
    await settle(50);
    stdin.write('b'); // pretend gate suppressed the hotkey (buffer non-empty)
    await settle(50);
    const out = lastFrame() ?? '';
    expect(out).toContain('xb');
  });

  it('backspace removes the last char', async () => {
    const { stdin, lastFrame } = render(<Harness initial="abc" />);
    await settle(50);
    stdin.write(''); // DEL / backspace
    await settle(50);
    const out = lastFrame() ?? '';
    expect(out).toContain('ab');
    expect(out).not.toMatch(/abc/);
  });

  it('Esc clears the buffer when non-empty', async () => {
    const shouldConsume = vi.fn(() => false);
    const { stdin, lastFrame } = render(
      <Harness initial="hello" shouldConsume={shouldConsume} />,
    );
    await settle(50);
    stdin.write(''); // ESC
    await settle(50);
    const out = lastFrame() ?? '';
    expect(out).not.toContain('hello');
  });

  it('↑ calls onHistoryUp when buffer is empty', async () => {
    const onHistoryUp = vi.fn();
    const { stdin } = render(<Harness onHistoryUp={onHistoryUp} />);
    await settle(50);
    stdin.write('[A'); // ANSI up-arrow
    await settle(50);
    expect(onHistoryUp).toHaveBeenCalled();
  });

  it('↑ is suppressed when buffer is non-empty (avoid surprise jumps mid-type)', async () => {
    const onHistoryUp = vi.fn();
    const { stdin } = render(<Harness initial="0x12" onHistoryUp={onHistoryUp} />);
    await settle(50);
    stdin.write('[A');
    await settle(50);
    expect(onHistoryUp).not.toHaveBeenCalled();
  });
});
