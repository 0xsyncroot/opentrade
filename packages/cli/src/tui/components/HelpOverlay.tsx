// Help overlay — keybinding sheet shown with `?`.

import { Box, Text } from 'ink';
import React from 'react';
import { theme } from '../theme.js';

const ROWS: [string, string][] = [
  ['1-4', 'Fire preset (context: buy or sell mode)'],
  ['b', 'Force BUY mode'],
  ['s', 'Force SELL mode'],
  ['Tab', 'Flip buy ↔ sell'],
  ['i', 'Expanded token info'],
  ['r', 'Refresh card'],
  ['p', 'Positions list'],
  ['w', 'Wallet summary'],
  ['c', 'Change chain'],
  ['/', 'Slash command palette'],
  ['?', 'This help'],
  ['↑/↓', 'Input history'],
  ['j/k', 'Vim navigate list'],
  ['g/G', 'Top/bottom list'],
  ['Enter', 'Submit input / confirm'],
  ['Esc', 'Close modal/palette'],
  ['T', 'Toggle Telegram bot (start/stop)'],
  ['q / Ctrl+C', 'Quit'],
];

export const HelpOverlay: React.FC = () => (
  <Box
    flexDirection="column"
    borderStyle="double"
    borderColor={theme.accent}
    paddingX={2}
    paddingY={1}
  >
    <Text bold color={theme.accent}>
      opentrade — keybindings
    </Text>
    <Box flexDirection="column" marginTop={1}>
      {ROWS.map(([k, label]) => (
        <Box key={k}>
          <Box width={14}>
            <Text color={theme.primary}>{k}</Text>
          </Box>
          <Text>{label}</Text>
        </Box>
      ))}
    </Box>
    <Box marginTop={1}>
      <Text dimColor>Esc to close.</Text>
    </Box>
  </Box>
);
