// Paste detection on top of Ink's `useInput` hook.
//
// Ink 5 does NOT expose a native `usePaste` (that was 7+). We approximate with a
// "burst" heuristic: when several visible characters arrive in one tick / very
// close in time, treat them as a paste. Lone keystrokes (one-at-a-time) are
// returned via the onKey callback.
//
// Strategy:
//   - useInput appends every character to a rolling chunk
//   - on each tick, schedule a 30ms timer; if no more characters land,
//     flush the chunk: chunk.length > PASTE_THRESHOLD → onPaste, else onChunk
//   - special keys (return, escape, tab, ctrl+c, arrows) fire onKey immediately
//     and reset the chunk

import { useInput, type Key } from 'ink';
import { useRef } from 'react';

const PASTE_THRESHOLD = 6; // > 6 chars in one burst = paste
const FLUSH_MS = 30;

export interface UsePasteOptions {
  /** A pasted CA / URL / long text. */
  onPaste?: (chunk: string) => void;
  /** A normal printable character. */
  onChar?: (ch: string) => void;
  /** A special key (return, escape, etc) — receives raw Ink Key object. */
  onKey?: (input: string, key: Key) => void;
  /** When false, no listener is registered. Useful to mask input while a modal is open. */
  enabled?: boolean;
}

/**
 * Register an Ink input listener that distinguishes paste bursts from
 * individual keystrokes.
 *
 * Pure-function semantics: returns nothing — caller wires callbacks via opts.
 */
export function usePaste(opts: UsePasteOptions): void {
  const bufferRef = useRef('');
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const enabled = opts.enabled !== false;

  const flush = () => {
    const chunk = bufferRef.current;
    bufferRef.current = '';
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (!chunk) return;
    if (chunk.length >= PASTE_THRESHOLD) {
      opts.onPaste?.(chunk);
    } else {
      for (const ch of chunk) opts.onChar?.(ch);
    }
  };

  useInput(
    (input, key) => {
      // Special keys always bypass the buffer.
      if (
        key.return ||
        key.escape ||
        key.tab ||
        key.upArrow ||
        key.downArrow ||
        key.leftArrow ||
        key.rightArrow ||
        key.backspace ||
        key.delete ||
        key.ctrl ||
        key.meta
      ) {
        flush();
        opts.onKey?.(input, key);
        return;
      }
      // Append character(s) and reset the debounce.
      bufferRef.current += input;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, FLUSH_MS);
    },
    { isActive: enabled },
  );
}
