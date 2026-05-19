// Positions list — table view with j/k highlight cursor.

import { Box, Text } from 'ink';
import React from 'react';
import type { Holding } from '@0xsyncroot/opentrade-core/gmgn';
import { theme } from '../theme.js';

export interface PositionsListProps {
  positions: Holding[];
  cursor: number;
}

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtUsd(v: number | undefined): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

export const PositionsList: React.FC<PositionsListProps> = ({ positions, cursor }) => {
  if (positions.length === 0) {
    return (
      <Box>
        <Text dimColor>No open positions.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Box>
        <Box width={10}>
          <Text dimColor>Symbol</Text>
        </Box>
        <Box width={12}>
          <Text dimColor>USD</Text>
        </Box>
        <Box width={12}>
          <Text dimColor>PnL</Text>
        </Box>
        <Box width={10}>
          <Text dimColor>PnL %</Text>
        </Box>
        <Text dimColor>Address</Text>
      </Box>
      {positions.map((p, i) => {
        const focused = i === cursor;
        const pnl = p.pnl ?? 0;
        const pnlColor = pnl > 0 ? theme.safe : pnl < 0 ? theme.danger : theme.text;
        return (
          <Box key={p.token_address}>
            <Box width={10}>
              <Text color={focused ? theme.primary : theme.text} bold={focused}>
                {focused ? '▶ ' : '  '}
                {p.symbol}
              </Text>
            </Box>
            <Box width={12}>
              <Text>{fmtUsd(p.usd_value)}</Text>
            </Box>
            <Box width={12}>
              <Text color={pnlColor}>{fmtUsd(p.pnl)}</Text>
            </Box>
            <Box width={10}>
              <Text color={pnlColor}>{fmtPct(p.pnl_percent)}</Text>
            </Box>
            <Text dimColor>{shortAddr(p.token_address)}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
