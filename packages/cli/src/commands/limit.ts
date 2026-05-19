// `opentrade limit <buy|sell> <chain> <token> <amount> --at <price>`
//
// Builds a LimitIntent and dispatches through the same path as `buy`/`sell`:
// snapshot fetch → safety gate → tier policy → preview → confirmation. The
// previous version only gated on --yes (skipped safety entirely) — P1-10 fix.

import { defineCommand } from 'citty';
import type { Chain } from '@hiepht/opentrade-core/chains';
import { nativeAmountToWei } from '@hiepht/opentrade-core/chains';
import type { LimitIntent } from '@hiepht/opentrade-core/schemas';
import { LimitIntentSchema } from '@hiepht/opentrade-core/schemas';
import { dispatch } from '@hiepht/opentrade-core/actions';
import { fetchTokenSnapshot } from '@hiepht/opentrade-core/services';
import { bootstrap, exitWithError, flag, intFlag, parseChainArg } from './_shared.js';
import { decideTier, runConfirmation } from '../safety/confirm.js';
import { emitJson, log, color } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';

export const limitCmd = defineCommand({
  meta: { name: 'limit', description: 'place a limit order' },
  args: {
    side: { type: 'positional', required: true, description: 'buy | sell' },
    chain: { type: 'positional', required: true },
    token: { type: 'positional', required: true },
    amount: { type: 'positional', required: true, description: 'native amount or percent' },
    at: { type: 'string', required: true, description: 'trigger price (USD)' },
    expire: { type: 'string', description: 'expire window (e.g. 24h)' },
    slip: { type: 'string', description: 'slippage %' },
    yes: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    'allow-risky': { type: 'boolean', description: 'override safety.warn (still requires T3)' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    if (args.side !== 'buy' && args.side !== 'sell') exitWithError(`side must be buy|sell, got ${args.side}`);

    const triggerPriceUsd = Number(args.at);
    if (!Number.isFinite(triggerPriceUsd) || triggerPriceUsd <= 0) exitWithError('invalid --at price');

    let amountWei: string | undefined;
    let amountPct: number | undefined;
    const amountStr = String(args.amount);
    if (args.side === 'sell' && amountStr.endsWith('%')) {
      amountPct = Math.min(100, Math.max(1, Number(amountStr.slice(0, -1))));
    } else {
      amountWei = nativeAmountToWei(chain, Number(amountStr)).toString();
    }

    const slipPct = intFlag(args as Record<string, unknown>, 'slip');
    const slippageBps = slipPct !== undefined ? Math.round(slipPct * 100) : undefined;

    const expireSec = parseExpire(args.expire);
    const intent: LimitIntent = LimitIntentSchema.parse({
      kind: 'limit',
      side: args.side as 'buy' | 'sell',
      chain,
      token: args.token,
      ...(amountWei ? { amountWei } : {}),
      ...(amountPct ? { amountPct } : {}),
      triggerPriceUsd,
      ...(slippageBps ? { slippageBps } : {}),
      ...(expireSec ? { expireSec } : {}),
    });

    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet for chain '${chain}'`);

    if (flag(args as Record<string, unknown>, 'dry-run')) {
      emitJson({ kind: 'dry-run', intent, wallet });
      return;
    }

    // P1-10: pull token snapshot for safety preview + tier policy (parity
    // with `buy` / `sell` subcommands).
    let snapshot;
    try {
      snapshot = await fetchTokenSnapshot(ctx.client, { chain, token: args.token, walletAddress: wallet! });
    } catch (err) {
      exitWithError(`failed to fetch token: ${(err as Error).message}`);
    }

    if (snapshot.safety.block) {
      const out = {
        ok: false,
        reason: 'safety_block',
        gates: snapshot.safety.reasons,
      };
      if (flag(args as Record<string, unknown>, 'json')) emitJson(out);
      else log.error(color.red(`BLOCK — ${snapshot.safety.reasons.join('; ')}`));
      process.exit(3);
    }

    // Treat limit as a money-moving op: re-use the same tier policy
    // (T1 baseline, T3 on safety.warn, T2 on ETH mainnet by virtue of the
    // canonical decideTier; we feed it the limit intent directly).
    const decision = decideTier({
      intent,
      safetyWarn: snapshot.safety.warn && !flag(args as Record<string, unknown>, 'allow-risky'),
      noConfirm: ctx.loaded.config.noConfirm,
    });

    const preview = [
      `${color.bold('Limit ' + intent.side)} ${snapshot.token.symbol} @ $${triggerPriceUsd}`,
      `  chain=${chain}  ${amountPct ? `amount=${amountPct}%` : `amount_wei=${amountWei}`}  slip=${slippageBps !== undefined ? `${(slippageBps / 100).toFixed(1)}%` : 'default'}${expireSec ? `  expire=${expireSec}s` : ''}`,
      `  tier=${decision.tier}  reason=${decision.reason}`,
    ];
    const ok = await runConfirmation({
      tier: decision.tier,
      intent,
      previewLines: preview,
      tokenSymbol: snapshot.token.symbol,
      forceYes: flag(args as Record<string, unknown>, 'yes'),
    });
    if (!ok) {
      log.warn('cancelled');
      process.exit(1);
    }

    const result = await dispatch(ctx.dispatcherCtx, intent);
    if (flag(args as Record<string, unknown>, 'json')) emitJson(result);
    else if (result.ok) log.success(`submitted: ${JSON.stringify(result.result)}`);
    else log.error(result.reason === 'error' ? result.error.message : result.reason);
    if (!result.ok) process.exit(4);
  },
});

function parseExpire(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return undefined;
  }
}
