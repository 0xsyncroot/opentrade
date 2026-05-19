// Quick-buy preset row — 1-4 hotkey buttons + slip/MEV line.
// Action data comes from the Screen.actions array (buy intents).

import { Box, Text } from 'ink';
import React from 'react';
import type { ActionButton } from '@hiepht/opentrade-core/schemas';
import { actionTone, theme } from '../theme.js';

export interface BuyPanelProps {
  actions: ActionButton[];
  /** Status line — slip / MEV / TP / SL — extracted from Screen.hints. */
  paramsLine?: string;
}

export const BuyPanel: React.FC<BuyPanelProps> = ({ actions, paramsLine }) => {
  const buys = actions.filter((a) => a.intent.kind === 'buy');
  return (
    <Box flexDirection="column">
      <Text bold color={theme.primary}>
        ⚡ Quick Buy
      </Text>
      <Box marginTop={0}>
        {buys.map((b) => (
          <Box key={b.id} marginRight={2}>
            <Text color={actionTone(b.tone)}>
              [{b.hotkey ?? '?'}] {b.label}
            </Text>
          </Box>
        ))}
      </Box>
      {paramsLine ? (
        <Box marginTop={1}>
          <Text dimColor>{paramsLine}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
