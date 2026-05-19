// ConfirmModal — 4-tier confirmation overlay (plan §"TUI ergonomics §5").
//
//   T0  silent       — no modal at all (skipped by App).
//   T1  inline 3s    — preview block + countdown; Enter / Esc cancel.
//   T2  type-YES     — modal blocks the keymap until user types exactly "YES".
//   T3  type-symbol  — must type the token's symbol exactly.
//
// The modal is dumb: App owns the policy decision and pushes a ModalDescriptor
// onto the store. This component just renders + resolves.

import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';
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
 * Decide the confirmation tier for a buy/sell intent. Pure function — App
 * calls before pushing the modal so the policy table is testable on its own.
 *
 * Policy (plan §"TUI ergonomics §5"):
 *   - safety.warn (honeypot/rug/top10 flagged) → T3
 *   - amount > 5% wallet OR chain === 'eth' (mainnet)   → T2
 *   - amount 1-5% wallet                                → T1
 *   - amount < 1% wallet                                → T0 (silent)
 *   - sell 100%                                         → at least T1
 */
export function decideConfirmTier(input: {
  intent: import('@hiepht/opentrade-core/schemas').Intent;
  walletUsd: number | undefined;
  tradeUsd: number | undefined;
  safetyWarn?: boolean;
}): 'T0' | 'T1' | 'T2' | 'T3' {
  if (input.safetyWarn) return 'T3';

  if (input.intent.kind === 'sell' && input.intent.percent === 100) {
    // baseline T1; let upstream upgrade.
    return 'T1';
  }

  if (input.intent.kind === 'buy') {
    if (input.intent.chain === 'eth') return 'T2';
    const wallet = input.walletUsd ?? 0;
    const trade = input.tradeUsd ?? 0;
    if (wallet > 0) {
      const pct = (trade / wallet) * 100;
      if (pct > 5) return 'T2';
      if (pct >= 1) return 'T1';
      return 'T0';
    }
    // Unknown wallet usd → conservative T1
    return 'T1';
  }

  return 'T1';
}
