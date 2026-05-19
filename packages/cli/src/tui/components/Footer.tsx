// Footer hint line — driven by Screen.hints.
// Renders the first hint (most actionable line) prominently and the rest dim.
//
// When `typing` is true (input buffer non-empty), the keybinding hints are
// replaced with a typing-specific hint so users know that letter hotkeys are
// suppressed and how to submit/clear.

import { Box, Text } from 'ink';
import React from 'react';
import { theme } from '../theme.js';

export interface FooterProps {
  hints?: string[];
  statusMessage?: string;
  statusTone?: 'info' | 'warn' | 'error' | 'success';
  /** When true, the user is composing input — show "Enter submit · Esc clear". */
  typing?: boolean;
}

const TYPING_HINT = 'Enter submit · Esc clear · paste CA to load · ↑/↓ history (empty buffer)';

export const Footer: React.FC<FooterProps> = ({ hints, statusMessage, statusTone, typing }) => {
  const toneColor =
    statusTone === 'error'
      ? theme.danger
      : statusTone === 'warn'
        ? theme.warn
        : statusTone === 'success'
          ? theme.safe
          : theme.text;
  const rows: string[] = typing ? [TYPING_HINT] : hints ?? [];
  return (
    <Box flexDirection="column" paddingX={1}>
      {statusMessage ? (
        <Box>
          <Text color={toneColor}>{statusMessage}</Text>
        </Box>
      ) : null}
      {rows.map((h, i) => (
        <Box key={i}>
          <Text dimColor={i > 0}>{h}</Text>
        </Box>
      ))}
    </Box>
  );
};
