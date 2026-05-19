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
  /**
   * Optional USD-shaped sizing (TUI path). When both walletUsd AND tradeUsd
   * are set, the % computation uses these; otherwise we fall back to
   * walletBalanceWei vs intent.amountWei.
   */
  walletUsd?: number;
  tradeUsd?: number;
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

    // Prefer USD-based sizing when supplied (TUI path).
    let pct: number | undefined;
    if (
      typeof input.walletUsd === 'number' &&
      input.walletUsd > 0 &&
      typeof input.tradeUsd === 'number' &&
      input.tradeUsd >= 0
    ) {
      pct = (input.tradeUsd / input.walletUsd) * 100;
    } else {
      pct = computePercent(input.intent.amountWei, input.walletBalanceWei);
    }
    if (pct === undefined) {
      // Unknown sizing — fail safe. Per reviewer P1-4, default to T2 (force
      // confirm) rather than T1 — when wallet AND trade are both unknown we
      // can't bound exposure, so the higher safety tier is correct.
      return { tier: 'T2', reason: 'wallet/trade sizing unknown — default T2 (safer)' };
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
      // 3s inline countdown — manual readline keypress + countdown render.
      // (P1-3 fix: clack's `confirm` keeps stdin in raw mode after the race
      // timeout fires, dangling the prompt and breaking the next command's
      // input. Manual approach gives us full control over teardown.)
      return await runT1Countdown(3000);
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

/**
 * T1 countdown — render `Confirm? (Ns) [Enter=now | Esc=cancel]` for `totalMs`
 * total, decrementing each 100ms. Resolve true on timeout / Enter, false on Esc.
 *
 * Designed for headless behaviour: when stdin is NOT a TTY (e.g. piped) we
 * skip the keypress listener and just sleep for the full window then return
 * true — this matches the user-confirmed default of "auto-yes after 3s".
 *
 * Exposed so tests can call it directly.
 */
export async function runT1Countdown(totalMs: number, opts: {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
} = {}): Promise<boolean> {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const isTty = Boolean(stdin.isTTY);

  return await new Promise<boolean>((resolve) => {
    let remaining = totalMs;
    let done = false;
    const wasRaw = stdin.isRaw === true;

    const cleanup = (result: boolean): void => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (isTty) {
        stdin.removeListener('data', onData);
        try {
          stdin.setRawMode?.(wasRaw);
        } catch {
          /* */
        }
        if (!wasRaw) stdin.pause();
        // Clear the countdown line + newline so the next prompt renders cleanly.
        stdout.write('\r\x1b[2K\n');
      }
      resolve(result);
    };

    const render = (): void => {
      const sec = (remaining / 1000).toFixed(1);
      stdout.write(`\rConfirm? auto-yes in ${sec}s · Enter=now · Esc=cancel  `);
    };

    const onData = (buf: Buffer): void => {
      const s = buf.toString();
      // Enter (CR or LF) → confirm immediately
      if (s.includes('\r') || s.includes('\n')) {
        cleanup(true);
        return;
      }
      // Esc (0x1B) → cancel
      if (s.includes('\x1b')) {
        cleanup(false);
        return;
      }
      // Ctrl+C — treat as cancel
      if (s.includes('\x03')) {
        cleanup(false);
        return;
      }
    };

    if (isTty) {
      try {
        stdin.setRawMode?.(true);
      } catch {
        /* */
      }
      stdin.resume();
      stdin.on('data', onData);
    }

    render();
    const timer = setInterval(() => {
      remaining -= 100;
      if (remaining <= 0) {
        cleanup(true);
        return;
      }
      render();
    }, 100);
  });
}

export function explainChainPolicy(chain: Chain): string | undefined {
  if (chain === 'eth') {
    return 'note: ETH mainnet — gas $5-50/tx; recommended swing trades only (≥$100).';
  }
  return undefined;
}
