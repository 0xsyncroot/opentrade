// Slash command palette — `/` overlay.
// Fuzzy-filters the SLASH_COMMANDS_HELP list from core/classifier.

import { Box, Text } from 'ink';
import React, { useMemo } from 'react';
import { classifier } from '@hiepht/opentrade-core';
import { theme } from '../theme.js';

const { SLASH_COMMANDS_HELP } = classifier;

export interface SlashPaletteProps {
  query: string;
  cursor: number;
  /** Override list (for tests). */
  items?: typeof SLASH_COMMANDS_HELP;
}

function fuzzyScore(needle: string, hay: string): number {
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  if (!n) return 0; // show everything
  if (h.startsWith(n)) return -2;
  if (h.includes(n)) return -1;
  // characters-in-order check
  let hi = 0;
  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found === -1) return Number.POSITIVE_INFINITY;
    hi = found + 1;
  }
  return hi;
}

export function filterSlashItems(
  query: string,
  items: typeof SLASH_COMMANDS_HELP = SLASH_COMMANDS_HELP,
): typeof SLASH_COMMANDS_HELP {
  const q = query.replace(/^\//, '').trim();
  const scored = items
    .map((it) => ({ it, s: fuzzyScore(q, it.cmd) }))
    .filter((x) => x.s !== Number.POSITIVE_INFINITY)
    .sort((a, b) => a.s - b.s);
  return scored.map((x) => x.it);
}

export const SlashPalette: React.FC<SlashPaletteProps> = ({ query, cursor, items }) => {
  const filtered = useMemo(() => filterSlashItems(query, items), [query, items]);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.primary}
      paddingX={1}
    >
      <Text bold color={theme.primary}>
        / commands {query ? `· ${query}` : ''}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {filtered.length === 0 ? (
          <Text dimColor>(no matches)</Text>
        ) : (
          filtered.map((it, i) => {
            const focused = i === cursor;
            return (
              <Box key={it.cmd}>
                <Box width={2}>
                  <Text color={focused ? theme.primary : theme.muted}>
                    {focused ? '▶' : ' '}
                  </Text>
                </Box>
                <Box width={22}>
                  <Text color={focused ? theme.primary : theme.text}>{it.usage}</Text>
                </Box>
                <Text dimColor>{it.help}</Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter run · Esc close · ↑↓ navigate</Text>
      </Box>
    </Box>
  );
};
