// Footer hint line — driven by Screen.hints.
// Renders the first hint (most actionable line) prominently and the rest dim.

import { Box, Text } from 'ink';
import React from 'react';
import { theme } from '../theme.js';

export interface FooterProps {
  hints?: string[];
  statusMessage?: string;
  statusTone?: 'info' | 'warn' | 'error' | 'success';
}

export const Footer: React.FC<FooterProps> = ({ hints, statusMessage, statusTone }) => {
  const toneColor =
    statusTone === 'error'
      ? theme.danger
      : statusTone === 'warn'
        ? theme.warn
        : statusTone === 'success'
          ? theme.safe
          : theme.text;
  return (
    <Box flexDirection="column" paddingX={1}>
      {statusMessage ? (
        <Box>
          <Text color={toneColor}>{statusMessage}</Text>
        </Box>
      ) : null}
      {(hints ?? []).map((h, i) => (
        <Box key={i}>
          <Text dimColor={i > 0}>{h}</Text>
        </Box>
      ))}
    </Box>
  );
};
