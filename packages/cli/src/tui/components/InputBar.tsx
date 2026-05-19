// Input bar — text input with paste detection + history navigation.
//
// Single-line, bottom of the screen. We delegate raw key handling to App via
// the `onKey` / `shouldConsume` props because some keys are consumed as global
// hotkeys (`/`, `?`, `1`-`4` etc) and must NOT be appended to the input
// buffer. The App enforces a focus gate inside mapHotkey() — when the buffer
// is non-empty, letter hotkeys are suppressed so typing works normally.

import { Box, Text } from 'ink';
import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../theme.js';
import { usePaste } from '../hooks/usePaste.js';

export interface InputBarProps {
  /** Called when the user presses Enter — the full buffer. */
  onSubmit: (text: string) => void;
  /** Called when the user pastes a chunk (>6 chars in one burst). */
  onPaste: (chunk: string) => void;
  /** Called when a key qualifies as a global hotkey. The bar shouldn't append
   *  the input in those cases — return true to consume. */
  shouldConsume?: (input: string, key: import('ink').Key) => boolean;
  /** Allow App to push text into the input (e.g., when navigating ↑/↓ history). */
  buffer: string;
  setBuffer: (s: string) => void;
  /** Disable input while a modal is open. */
  enabled?: boolean;
  /** History navigation hooks — fired on ↑ / ↓ when buffer is empty. */
  onHistoryUp?: () => void;
  onHistoryDown?: () => void;
  /** Called on every keystroke to debounce-pause polling. */
  onTyping?: () => void;
}

// Synthetic Key passed when usePaste invokes onChar — keep the shape stable
// (Ink's Key includes pageUp/pageDown on some versions); the cast keeps us
// compatible across minor Ink updates without spreading falsy flags everywhere.
const SYNTHETIC_CHAR_KEY = {
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
} as unknown as import('ink').Key;

export const InputBar: React.FC<InputBarProps> = ({
  onSubmit,
  onPaste,
  shouldConsume,
  buffer,
  setBuffer,
  enabled = true,
  onHistoryUp,
  onHistoryDown,
  onTyping,
}) => {
  const [cursorOn, setCursorOn] = useState(true);

  // Keep a ref to the latest buffer so usePaste's stable closure can read the
  // current value without re-subscribing every render (Ink only honours the
  // first useInput listener per render cycle).
  const bufferRef = useRef(buffer);
  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);

  // Blink cursor at 500ms — visible block so users can see where focus is.
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(() => setCursorOn((v) => !v), 500);
    return () => clearInterval(t);
  }, [enabled]);

  usePaste({
    enabled,
    onPaste: (chunk) => {
      onTyping?.();
      onPaste(chunk);
    },
    onChar: (ch) => {
      // Ask the App if this character belongs to a global hotkey. The App's
      // mapHotkey is focus-aware: when buffer is non-empty it returns null
      // for letter / digit / punctuation, so this consume call returns false
      // and the char flows into the buffer below.
      if (shouldConsume && shouldConsume(ch, SYNTHETIC_CHAR_KEY)) return;
      onTyping?.();
      // Update the ref FIRST so back-to-back onChar calls within the same
      // tick (usePaste flushes short chunks via a synchronous for-of loop)
      // accumulate instead of clobbering each other. The ref is the source
      // of truth between renders; setBuffer commits the current view.
      bufferRef.current = bufferRef.current + ch;
      setBuffer(bufferRef.current);
    },
    onKey: (input, key) => {
      onTyping?.();
      // History navigation — ↑/↓ pull from inputHistory only when the buffer
      // is empty so the user can type CAs with arrow keys present in their
      // terminal scrollback without surprise jumps. (We don't implement
      // multi-line editing, so arrows have no other in-buffer meaning.)
      if (key.upArrow) {
        if (bufferRef.current.length === 0) onHistoryUp?.();
        return;
      }
      if (key.downArrow) {
        if (bufferRef.current.length === 0) onHistoryDown?.();
        return;
      }
      // Escape clears the buffer when there's content; otherwise the App's
      // hotkey path may take over (close overlays, leave info view, …).
      if (key.escape) {
        if (bufferRef.current.length > 0) {
          bufferRef.current = '';
          setBuffer('');
          return;
        }
        shouldConsume?.(input, key);
        return;
      }
      if (key.return) {
        // Submit the full buffer to the App; the App's handleHotkey also runs
        // on Enter (for modals / slash) but only if shouldConsume claims it.
        if (shouldConsume && shouldConsume(input, key)) return;
        onSubmit(bufferRef.current);
        return;
      }
      if (key.backspace || key.delete) {
        bufferRef.current = bufferRef.current.slice(0, -1);
        setBuffer(bufferRef.current);
        return;
      }
      // Tab / Ctrl+C / other control keys — hand back to the hotkey handler.
      shouldConsume?.(input, key);
    },
  });

  // Cursor glyph: solid block when on, space when off — gives a visible focus
  // indicator even with no content yet.
  const cursorGlyph = cursorOn && enabled ? '▌' : ' ';

  return (
    <Box paddingX={1}>
      <Text color={theme.primary}>{'> '}</Text>
      <Text>{buffer}</Text>
      <Text color={theme.primary}>{cursorGlyph}</Text>
    </Box>
  );
};
