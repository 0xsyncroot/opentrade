// Top status bar — chain · wallet · native balance · positions · gas · TG bot.
// Driven by the ScreenHeader struct produced by core/views/buildHeader plus the
// zustand-tracked Telegram bot lifecycle (plan §"Telegram bot UX — Lifecycle").

import { Box, Text } from 'ink';
import React from 'react';
import type { ScreenHeader } from '@hiepht/opentrade-core/schemas';
import { theme } from '../theme.js';
import { useTuiStore, type BotStatus } from '../store/index.js';

export interface StatusBarProps {
  header: ScreenHeader;
}

function botLabel(status: BotStatus, error: string | undefined): { text: string; color: string } {
  switch (status) {
    case 'connected':
      return { text: '[TG: connected]', color: theme.safe };
    case 'starting':
      return { text: '[TG: starting…]', color: theme.warn };
    case 'error': {
      const short = (error ?? 'err').slice(0, 24);
      return { text: `[TG: error ${short}]`, color: theme.danger };
    }
    case 'off':
    default:
      return { text: '[TG: off]', color: theme.muted };
  }
}

export const StatusBar: React.FC<StatusBarProps> = ({ header }) => {
  const botStatus = useTuiStore((s) => s.botStatus);
  const botError = useTuiStore((s) => s.botError);
  const bot = botLabel(botStatus, botError);
  return (
    <Box borderStyle="round" borderColor={theme.muted} paddingX={1}>
      <Text bold color={theme.accent}>
        opentrade
      </Text>
      <Text dimColor> · </Text>
      <Text color={theme.primary}>{header.chain}</Text>
      <Text dimColor> · </Text>
      <Text>{header.walletShort}</Text>
      <Text dimColor> · </Text>
      <Text>{header.balanceNative}</Text>
      <Text dimColor> </Text>
      <Text dimColor>({header.balanceUsd})</Text>
      <Text dimColor> · </Text>
      <Text>{header.openPositions} pos</Text>
      {header.gasEstUsd ? (
        <>
          <Text dimColor> · gas </Text>
          <Text>{header.gasEstUsd}</Text>
        </>
      ) : null}
      <Text dimColor> · </Text>
      <Text color={bot.color}>{bot.text}</Text>
    </Box>
  );
};
