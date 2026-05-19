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
  /**
   * True while the slash palette is open. We replace the generic typing hint
   * with the 3-4 most-useful slash commands so a new user can discover the
   * UX without leaving the palette to /help first.
   */
  slashOpen?: boolean;
}

const TYPING_HINT = 'Enter submit · Esc clear · paste CA to load · ↑/↓ history (empty buffer)';
const SLASH_HINT = 'Try /buy <amt> · /sell <pct> · /chain base|sol|eth|bsc · /ps · /help for all';

export const Footer: React.FC<FooterProps> = ({ hints, statusMessage, statusTone, typing, slashOpen }) => {
  const toneColor =
    statusTone === 'error'
      ? theme.danger
      : statusTone === 'warn'
        ? theme.warn
        : statusTone === 'success'
          ? theme.safe
          : theme.text;
  const rows: string[] = slashOpen
    ? [SLASH_HINT]
    : typing
      ? [TYPING_HINT]
      : hints ?? [];
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
