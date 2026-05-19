// TokenCard — the central panel shown when a token is loaded.
//
// Routes the Screen blocks through InkRenderer, then attaches the appropriate
// action panel (BuyPanel / SellPanel) below based on the Screen kind.

import { Box, Text } from 'ink';
import React from 'react';
import type { Screen } from '@0xsyncroot/opentrade-core/schemas';
import { renderBlocks } from '../render/InkRenderer.js';
import { theme } from '../theme.js';
import { BuyPanel } from './BuyPanel.js';
import { SellPanel } from './SellPanel.js';

export interface TokenCardProps {
  screen: Screen;
}

function extractParamsLine(screen: Screen): string | undefined {
  // The view builder pushes a "Slip X% · Anti-MEV …" line as the 2nd hint.
  return screen.hints?.[screen.hints.length - 1];
}

export const TokenCard: React.FC<TokenCardProps> = ({ screen }) => {
  const paramsLine = extractParamsLine(screen);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.muted}
      paddingX={1}
      paddingY={0}
    >
      {screen.title ? (
        <Box marginBottom={1}>
          <Text bold color={theme.accent}>
            {screen.title}
          </Text>
        </Box>
      ) : null}
      {renderBlocks(screen.body)}
      <Box marginTop={1}>
        {screen.kind === 'buy' ? (
          <BuyPanel actions={screen.actions} paramsLine={paramsLine} />
        ) : screen.kind === 'sell' ? (
          <SellPanel actions={screen.actions} paramsLine={paramsLine} />
        ) : null}
      </Box>
    </Box>
  );
};
