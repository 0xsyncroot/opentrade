// Quick-sell preset row — 25/50/75/100% buttons.
// 100% is rendered red (matches Screen.actions[].tone === 'danger').

import { Box, Text } from 'ink';
import React from 'react';
import type { ActionButton } from '@0xsyncroot/opentrade-core/schemas';
import { actionTone, theme } from '../theme.js';

export interface SellPanelProps {
  actions: ActionButton[];
  paramsLine?: string;
}

export const SellPanel: React.FC<SellPanelProps> = ({ actions, paramsLine }) => {
  const sells = actions.filter((a) => a.intent.kind === 'sell');
  return (
    <Box flexDirection="column">
      <Text bold color={theme.danger}>
        ⚡ Quick Sell
      </Text>
      <Box marginTop={0}>
        {sells.map((s) => (
          <Box key={s.id} marginRight={2}>
            <Text color={actionTone(s.tone)}>
              [{s.hotkey ?? '?'}] {s.label}
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
