// Help overlay — keybinding sheet shown with `?`.
//
// Two sections: keystrokes (left half) and slash commands (right half). Each
// slash row marks whether it executes in-TUI or hands off to a shell.

import { Box, Text } from 'ink';
import React from 'react';
import { theme } from '../theme.js';

const KEYS: [string, string][] = [
  ['1-4', 'Fire preset (context: buy/sell mode)'],
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
  ['T', 'Toggle Telegram bot'],
  ['q / Ctrl+C', 'Quit'],
];

type SlashRow = { usage: string; help: string; loc: 'tui' | 'shell' };

const SLASH: SlashRow[] = [
  { usage: '/buy <amount>', help: 'Buy current token (native amount)', loc: 'tui' },
  { usage: '/sell <pct>', help: 'Sell % of current holding', loc: 'tui' },
  { usage: '/chain base|sol|eth|bsc', help: 'Switch active chain', loc: 'tui' },
  { usage: '/ps', help: 'Open positions', loc: 'tui' },
  { usage: '/wallet', help: 'Wallet summary (same as /ps)', loc: 'tui' },
  { usage: '/info', help: 'Expanded token info', loc: 'tui' },
  { usage: '/risk allow|deny', help: 'Toggle risky-token override', loc: 'tui' },
  { usage: '/recent', help: 'Pick from recent inputs', loc: 'tui' },
  { usage: '/help', help: 'Show this overlay', loc: 'tui' },
  { usage: '/quit', help: 'Exit opentrade', loc: 'tui' },
  { usage: '/init', help: '→ opentrade init  (interactive wizard)', loc: 'shell' },
  { usage: '/keygen', help: '→ opentrade keygen', loc: 'shell' },
  { usage: '/config show|get|set', help: '→ opentrade config …', loc: 'shell' },
  { usage: '/feed trending|sm|kol|…', help: '→ opentrade feed …  (streaming)', loc: 'shell' },
  { usage: '/orders list|status|cancel', help: '→ opentrade orders …', loc: 'shell' },
  { usage: '/limit buy|sell <price>', help: '→ opentrade limit …  (coming soon)', loc: 'shell' },
  { usage: '/send <amount> <to>', help: '→ opentrade send …', loc: 'shell' },
  { usage: '/ab add|ls|rm', help: '→ opentrade ab …  (address book)', loc: 'shell' },
  { usage: '/alias save|ls|rm', help: '→ opentrade alias …', loc: 'shell' },
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
      opentrade — keybindings & slash commands
    </Text>
    <Box flexDirection="row" marginTop={1}>
      <Box flexDirection="column" marginRight={3}>
        <Text bold color={theme.primary}>
          Keys
        </Text>
        {KEYS.map(([k, label]) => (
          <Box key={k}>
            <Box width={12}>
              <Text color={theme.primary}>{k}</Text>
            </Box>
            <Text>{label}</Text>
          </Box>
        ))}
      </Box>
      <Box flexDirection="column">
        <Text bold color={theme.primary}>
          Slash commands
        </Text>
        {SLASH.map((r) => (
          <Box key={r.usage}>
            <Box width={28}>
              <Text color={r.loc === 'tui' ? theme.primary : theme.muted}>{r.usage}</Text>
            </Box>
            <Text dimColor={r.loc === 'shell'}>{r.help}</Text>
          </Box>
        ))}
      </Box>
    </Box>
    <Box marginTop={1}>
      <Text dimColor>
        in-TUI = runs here · → = opens a new shell. Esc to close.
      </Text>
    </Box>
  </Box>
);
