// Expanded info card. Renders the kv + safety + holding blocks the info Screen
// produces. Since the same data already lives in Screen.body, we just delegate
// to InkRenderer via the TokenCard pathway — keeping this file as a thin
// shell so future "holders / traders / SM exposure" extra blocks can land here.

import { Box, Text } from 'ink';
import React from 'react';
import type { Screen } from '@hiepht/opentrade-core/schemas';
import { renderBlocks } from '../render/InkRenderer.js';
import { theme } from '../theme.js';

export interface InfoExpandedProps {
  screen: Screen;
}

export const InfoExpanded: React.FC<InfoExpandedProps> = ({ screen }) => {
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        {screen.title ?? 'Info'}
      </Text>
      {renderBlocks(screen.body)}
    </Box>
  );
};
