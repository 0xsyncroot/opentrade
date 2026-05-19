// Input bar — text input with paste detection + history navigation.
//
// Single-line, bottom of the screen. We delegate raw key handling to App via
// the `onKey` prop because some keys are consumed as global hotkeys (`/`, `?`,
// `1`-`4` etc) and must NOT be appended to the input buffer.

import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';
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
  /** History navigation hooks — fired on ↑ / ↓. */
  onHistoryUp?: () => void;
  onHistoryDown?: () => void;
  /** Called on every keystroke to debounce-pause polling. */
  onTyping?: () => void;
}

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

  // Blink cursor at 500ms.
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
      // If a global hotkey claims it, drop it.
      if (shouldConsume) {
        // We don't have access to the Key object here — empty record stand-in.
        const synthetic = {
          upArrow: false,
          downArrow: false,
          leftArrow: false,
          rightArrow: false,
          return: false,
          escape: false,
          tab: false,
          backspace: false,
          delete: false,
          ctrl: false,
          shift: false,
          meta: false,
        } as unknown as import('ink').Key;
        if (shouldConsume(ch, synthetic)) return;
      }
      onTyping?.();
      setBuffer(buffer + ch);
    },
    onKey: (input, key) => {
      onTyping?.();
      if (key.return) {
        onSubmit(buffer);
        return;
      }
      if (key.backspace || key.delete) {
        setBuffer(buffer.slice(0, -1));
        return;
      }
      if (key.upArrow) {
        onHistoryUp?.();
        return;
      }
      if (key.downArrow) {
        onHistoryDown?.();
        return;
      }
      // Hand non-buffer keys back to global hotkey handler.
      shouldConsume?.(input, key);
    },
  });

  return (
    <Box paddingX={1}>
      <Text color={theme.primary}>{'> '}</Text>
      <Text>{buffer}</Text>
      <Text>{cursorOn && enabled ? '_' : ' '}</Text>
    </Box>
  );
};
