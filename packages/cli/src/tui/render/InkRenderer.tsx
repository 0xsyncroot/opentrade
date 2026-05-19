// Screen → JSX renderer. Pure mapping of core/views Block[] into Ink Box/Text.
//
// The TokenCard / BuyPanel / SellPanel etc. wrap this and add layout chrome.
// Hotkey dispatch is handled in App.tsx — this file just produces visual output.

import { Box, Text } from 'ink';
import React from 'react';
import type { Block, Screen } from '@0xsyncroot/opentrade-core/schemas';
import { SafetyBlock } from '../components/SafetyBlock.js';
import { blockTone, theme } from '../theme.js';

export function renderBlock(block: Block, idx: number): React.ReactElement {
  switch (block.type) {
    case 'text': {
      return (
        <Box key={idx}>
          <Text color={blockTone(block.tone)}>{block.text}</Text>
        </Box>
      );
    }
    case 'kv': {
      // 2 rows of pairs, each pair as: <label width=14>value
      // Render pairs in a wrapped 2-column grid (4 pairs/row max).
      const rows: typeof block.pairs[] = [];
      for (let i = 0; i < block.pairs.length; i += 4) {
        rows.push(block.pairs.slice(i, i + 4));
      }
      return (
        <Box key={idx} flexDirection="column">
          {rows.map((row, ri) => (
            <Box key={ri}>
              {row.map(([k, v], ci) => (
                <Box key={ci} marginRight={2}>
                  <Text dimColor>{k}</Text>
                  <Text> </Text>
                  <Text>{v}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      );
    }
    case 'table': {
      return (
        <Box key={idx} flexDirection="column">
          <Box>
            {block.headers.map((h, ci) => (
              <Box key={ci} width={Math.max(8, h.length + 4)}>
                <Text dimColor>{h}</Text>
              </Box>
            ))}
          </Box>
          {block.rows.map((row, ri) => (
            <Box key={ri}>
              {row.map((cell, ci) => (
                <Box key={ci} width={Math.max(8, (block.headers[ci]?.length ?? 0) + 4)}>
                  <Text>{cell}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      );
    }
    case 'safety': {
      return (
        <Box key={idx} marginTop={1}>
          <SafetyBlock gates={block.gates} />
        </Box>
      );
    }
    case 'holding': {
      const pnlIsPositive = block.pnlUsd?.includes('-') === false && block.pnlUsd !== '$0.00';
      const pnlColor = block.pnlPct.startsWith('+')
        ? theme.safe
        : block.pnlPct.startsWith('-')
          ? theme.danger
          : theme.text;
      return (
        <Box key={idx}>
          <Text>📦 You hold: </Text>
          <Text bold>
            {block.amount} {block.symbol}
          </Text>
          <Text>  </Text>
          <Text>{block.usd}</Text>
          <Text dimColor>  P&L </Text>
          <Text color={pnlColor}>
            {block.pnlUsd} ({block.pnlPct})
          </Text>
        </Box>
      );
    }
    case 'spinner': {
      return (
        <Box key={idx}>
          <Text color={theme.warn}>⏳ {block.label}</Text>
        </Box>
      );
    }
    case 'divider': {
      return (
        <Box key={idx}>
          <Text dimColor>{'─'.repeat(48)}</Text>
        </Box>
      );
    }
  }
}

export function renderBlocks(blocks: Block[]): React.ReactElement {
  return (
    <Box flexDirection="column">{blocks.map((b, i) => renderBlock(b, i))}</Box>
  );
}

export interface InkRendererProps {
  screen: Screen;
}

export const InkRenderer: React.FC<InkRendererProps> = ({ screen }) => {
  return (
    <Box flexDirection="column">
      {screen.title ? (
        <Box>
          <Text bold color={theme.accent}>
            {screen.title}
          </Text>
        </Box>
      ) : null}
      {renderBlocks(screen.body)}
    </Box>
  );
};
