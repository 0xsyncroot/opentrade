// Recent-input picker overlay — `/recent`.
//
// Shows the last 10 entries from the persistent inputHistory. Caller renders
// the highlighted cursor; Enter loads the entry into the input buffer, Esc
// closes the overlay.

import { Box, Text } from 'ink';
import React from 'react';
import { theme } from '../theme.js';

export interface RecentOverlayProps {
  /** Most-recent-last list from useTuiStore.inputHistory. */
  entries: string[];
  /** Highlighted row. */
  cursor: number;
  /** How many entries to show (most recent N). Defaults to 10. */
  limit?: number;
}

export const RecentOverlay: React.FC<RecentOverlayProps> = ({
  entries,
  cursor,
  limit = 10,
}) => {
  // Show newest-first so the most recent entry sits at the top.
  const recent = entries.slice(-limit).reverse();
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.primary}
      paddingX={1}
    >
      <Text bold color={theme.primary}>
        Recent inputs (last {recent.length})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {recent.length === 0 ? (
          <Text dimColor>(empty — paste a CA first)</Text>
        ) : (
          recent.map((e, i) => {
            const focused = i === cursor;
            return (
              <Box key={`${e}-${i}`}>
                <Box width={2}>
                  <Text color={focused ? theme.primary : theme.muted}>
                    {focused ? '▶' : ' '}
                  </Text>
                </Box>
                <Text color={focused ? theme.primary : theme.text}>{e}</Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter load · Esc close · ↑↓ navigate</Text>
      </Box>
    </Box>
  );
};
