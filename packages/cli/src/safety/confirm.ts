// 4-tier confirmation policy.
//
// T0 silent   — amount < 1% wallet
// T1 inline   — 1-5% wallet (3s countdown, Esc to cancel)
// T2 type-YES — >5% wallet, ETH mainnet, or "send" intent
// T3 type-sym — token has safety.warn flagged
//
// `decideTier()` is pure (table-tested). `runConfirmation()` runs the actual
// @clack/prompts flow.

import * as p from '@clack/prompts';
import type { Intent } from '@hiepht/opentrade-core/schemas';
import type { Chain } from '@hiepht/opentrade-core/chains';

export type ConfirmTier = 'T0' | 'T1' | 'T2' | 'T3';

export interface TierDecisionInput {
  intent: Intent;
  /** Native balance in same units as intent.amountWei (for buy) — used to compute %. */
  walletBalanceWei?: string | bigint;
  /** Override — config.noConfirm flips everything to T0 silent. */
  noConfirm?: boolean;
  /** True when snapshot.safety.warn set (forces T3). */
  safetyWarn?: boolean;
  /** True when snapshot.safety.block — caller should never reach this point. */
  safetyBlock?: boolean;
  /** True when this is a Send intent (always >= T2). */
  isSend?: boolean;
}

export interface TierDecision {
  tier: ConfirmTier;
  reason: string;
  percentOfWallet?: number;
}

/**
 * Decide which tier of confirmation a given intent requires.
 * Pure function — table-tested.
 */
export function decideTier(input: TierDecisionInput): TierDecision {
  if (input.noConfirm) {
    return { tier: 'T0', reason: 'config.noConfirm=true' };
  }

  if (input.safetyBlock) {
    return { tier: 'T3', reason: 'safety block (would normally be rejected upstream)' };
  }
  if (input.safetyWarn) {
    return { tier: 'T3', reason: 'safety.warn flagged — require type-symbol confirm' };
  }

  if (input.intent.kind === 'send') {
    return { tier: 'T2', reason: 'send intent — always require type-YES' };
  }

  // Sell 100% always ≥ T1
  if (input.intent.kind === 'sell' && input.intent.percent === 100) {
    return { tier: 'T1', reason: 'sell 100% — full liquidation' };
  }

  if (input.intent.kind === 'buy') {
    // ETH mainnet always ≥ T2
    if (input.intent.chain === 'eth') {
      return { tier: 'T2', reason: 'ETH mainnet trade — always type-YES' };
    }

    const pct = computePercent(input.intent.amountWei, input.walletBalanceWei);
    if (pct === undefined) {
      // Unknown balance — be safe, T1
      return { tier: 'T1', reason: 'wallet balance unknown — default T1 inline confirm' };
    }
    if (pct < 1) return { tier: 'T0', reason: `${pct.toFixed(2)}% of wallet < 1%`, percentOfWallet: pct };
    if (pct < 5) return { tier: 'T1', reason: `${pct.toFixed(2)}% of wallet`, percentOfWallet: pct };
    return { tier: 'T2', reason: `${pct.toFixed(2)}% of wallet > 5%`, percentOfWallet: pct };
  }

  return { tier: 'T1', reason: 'default tier' };
}

function computePercent(amountWei: string, balanceWei: string | bigint | undefined): number | undefined {
  if (balanceWei === undefined) return undefined;
  try {
    const a = BigInt(amountWei);
    const b = typeof balanceWei === 'string' ? BigInt(balanceWei) : balanceWei;
    if (b === 0n) return 100;
    // Scale to 4 decimals: (a*10000/b) → /100
    const scaled = (a * 10_000n) / b;
    return Number(scaled) / 100;
  } catch {
    return undefined;
  }
}

// -- interactive runner ------------------------------------------------------

export interface ConfirmContext {
  tier: ConfirmTier;
  intent: Intent;
  /** Human-readable preview lines printed before any prompt. */
  previewLines: string[];
  /** Token symbol used for T3 echo confirm. */
  tokenSymbol?: string;
  /** Force a tier override for `--yes` flag (skip prompts). */
  forceYes?: boolean;
}

/**
 * Run the right confirmation UX for the decided tier. Returns true if confirmed.
 *
 * `--yes` cli flag (forceYes=true) downgrades any non-T3 tier to silent accept.
 * T3 (safety.warn) always still prompts — explicit safety net.
 */
export async function runConfirmation(ctx: ConfirmContext): Promise<boolean> {
  for (const l of ctx.previewLines) {
    process.stdout.write(`${l}\n`);
  }

  if (ctx.forceYes && ctx.tier !== 'T3') {
    process.stdout.write('  ↳ --yes provided, skipping confirmation\n');
    return true;
  }

  switch (ctx.tier) {
    case 'T0':
      return true;

    case 'T1': {
      // 3s inline countdown with Esc cancel via clack `confirm`.
      const result = await Promise.race([
        p.confirm({
          message: 'Confirm? (auto-yes in 3s)',
          initialValue: true,
        }),
        new Promise<boolean>((res) => setTimeout(() => res(true), 3000)),
      ]);
      if (p.isCancel(result)) return false;
      return result === true;
    }

    case 'T2': {
      const v = await p.text({
        message: 'Type YES to confirm:',
        validate: (input) =>
          input.trim().toUpperCase() === 'YES' ? undefined : "must type 'YES'",
      });
      if (p.isCancel(v)) return false;
      return String(v).trim().toUpperCase() === 'YES';
    }

    case 'T3': {
      if (!ctx.tokenSymbol) {
        const v = await p.text({
          message: 'Type CONFIRM-RISKY to override safety warning:',
          validate: (input) =>
            input.trim() === 'CONFIRM-RISKY' ? undefined : "must type exactly 'CONFIRM-RISKY'",
        });
        if (p.isCancel(v)) return false;
        return String(v).trim() === 'CONFIRM-RISKY';
      }
      const expected = ctx.tokenSymbol.toUpperCase();
      const v = await p.text({
        message: `Safety warning. Type token symbol '${expected}' to confirm:`,
        validate: (input) =>
          input.trim().toUpperCase() === expected ? undefined : `must type '${expected}' exactly`,
      });
      if (p.isCancel(v)) return false;
      return String(v).trim().toUpperCase() === expected;
    }
  }
}

export function explainChainPolicy(chain: Chain): string | undefined {
  if (chain === 'eth') {
    return 'note: ETH mainnet — gas $5-50/tx; recommended swing trades only (≥$100).';
  }
  return undefined;
}
