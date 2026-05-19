// ConfirmModal — 4-tier confirmation overlay (plan §"TUI ergonomics §5").
//
//   T0  silent       — no modal at all (skipped by App).
//   T1  inline 3s    — preview block + countdown; Enter / Esc cancel.
//   T2  type-YES     — modal blocks the keymap until user types exactly "YES".
//   T3  type-symbol  — must type the token's symbol exactly.
//
// The modal is dumb: App owns the policy decision and pushes a ModalDescriptor
// onto the store. This component just renders + resolves.
//
// Tier decision delegated to the canonical `decideTier()` in
// `safety/confirm.ts` (P1-4: single source of truth).

import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';
import { decideTier as canonicalDecideTier } from '../../safety/confirm.js';
import { theme } from '../theme.js';
import type { ModalDescriptor } from '../store/index.js';

export interface ConfirmModalProps {
  modal: ModalDescriptor;
  /** User typed something (for T2/T3). App routes raw input via setInputBuffer. */
  typedText: string;
  onResolve: (ok: boolean) => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ modal, typedText, onResolve }) => {
  const { tier, payload } = modal;
  const [countdown, setCountdown] = useState(payload.countdownMs ?? 3000);

  // T1 inline countdown auto-fires after the timer.
  useEffect(() => {
    if (tier !== 'T1') return undefined;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 100) {
          clearInterval(t);
          onResolve(true);
          return 0;
        }
        return c - 100;
      });
    }, 100);
    return () => clearInterval(t);
  }, [tier, onResolve]);

  // T2 / T3 — match the typed text against the requirement.
  const expected =
    tier === 'T2' ? 'YES' : tier === 'T3' ? payload.confirmSymbol ?? '' : '';
  const typedMatches = expected.length > 0 && typedText.trim().toUpperCase() === expected.toUpperCase();

  const tone =
    tier === 'T3' ? theme.danger : tier === 'T2' ? theme.warn : theme.primary;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={tone}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={tone}>
        Confirm action — {tier}
      </Text>
      <Box marginTop={1}>
        <Text>{payload.summary}</Text>
      </Box>
      {payload.safetyReasons?.length ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.warn}>⚠ Safety flags:</Text>
          {payload.safetyReasons.map((r, i) => (
            <Text key={i} color={theme.warn}>
              • {r}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        {tier === 'T1' ? (
          <Text dimColor>Auto-fire in {(countdown / 1000).toFixed(1)}s · Esc cancel · Enter confirm now</Text>
        ) : tier === 'T2' ? (
          <Box flexDirection="column">
            <Text>Type YES to confirm:</Text>
            <Text color={typedMatches ? theme.safe : theme.text}>
              {'> '}
              {typedText}
              {typedMatches ? ' ✓' : ''}
            </Text>
            <Text dimColor>Enter confirm · Esc cancel</Text>
          </Box>
        ) : tier === 'T3' ? (
          <Box flexDirection="column">
            <Text color={theme.danger}>
              Risky token — type symbol{' '}
              <Text bold>{payload.confirmSymbol ?? '???'}</Text> exactly to confirm:
            </Text>
            <Text color={typedMatches ? theme.safe : theme.text}>
              {'> '}
              {typedText}
              {typedMatches ? ' ✓' : ''}
            </Text>
            <Text dimColor>Enter confirm · Esc cancel</Text>
          </Box>
        ) : (
          <Text dimColor>Enter confirm · Esc cancel</Text>
        )}
      </Box>
    </Box>
  );
};

/**
 * Decide the confirmation tier for a buy/sell intent. Thin wrapper around the
 * canonical `decideTier()` in `safety/confirm.ts` (single source of truth —
 * P1-4 fix).
 *
 * Accepts walletUsd / tradeUsd (TUI-friendly), forwards to `decideTier`.
 */
export function decideConfirmTier(input: {
  intent: import('@hiepht/opentrade-core/schemas').Intent;
  walletUsd: number | undefined;
  tradeUsd: number | undefined;
  safetyWarn?: boolean;
}): 'T0' | 'T1' | 'T2' | 'T3' {
  return canonicalDecideTier({
    intent: input.intent,
    ...(input.walletUsd !== undefined ? { walletUsd: input.walletUsd } : {}),
    ...(input.tradeUsd !== undefined ? { tradeUsd: input.tradeUsd } : {}),
    ...(input.safetyWarn !== undefined ? { safetyWarn: input.safetyWarn } : {}),
  }).tier;
}
