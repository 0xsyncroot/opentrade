// Render a safety gate block — one row per gate with colored glyph.

import { Box, Text } from 'ink';
import React from 'react';
import type { SafetyGate } from '@0xsyncroot/opentrade-core/schemas';
import { safetyTone } from '../theme.js';

export interface SafetyBlockProps {
  gates: SafetyGate[];
}

export const SafetyBlock: React.FC<SafetyBlockProps> = ({ gates }) => {
  if (!gates.length) {
    return (
      <Box>
        <Text dimColor>(no safety data)</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {gates.map((g) => {
        const t = safetyTone(g.level);
        return (
          <Box key={g.key}>
            <Box width={3}>
              <Text color={t.color}>{t.glyph}</Text>
            </Box>
            <Box width={14}>
              <Text>{g.label}</Text>
            </Box>
            <Text color={t.color}>{g.value}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
