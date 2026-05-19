// `opentrade sell <chain> <token> [percent=100]`

import { defineCommand } from 'citty';
import type { Chain } from '@0xsyncroot/opentrade-core/chains';
import { SellIntentSchema, type SellIntent } from '@0xsyncroot/opentrade-core/schemas';
import { dispatch } from '@0xsyncroot/opentrade-core/actions';
import { fetchTokenSnapshot } from '@0xsyncroot/opentrade-core/services';
import { DEFAULT_PRESETS } from '@0xsyncroot/opentrade-core/presets';
import { bootstrap, exitWithError, flag, intFlag, parseChainArg } from './_shared.js';
import { decideTier, runConfirmation } from '../safety/confirm.js';
import { emitJson, log, color } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';

export const sellCmd = defineCommand({
  meta: { name: 'sell', description: 'Sell a percentage of held token' },
  args: {
    chain: { type: 'positional', required: true, description: 'base | sol | eth | bsc' },
    token: { type: 'positional', required: true, description: 'token contract address' },
    percent: { type: 'positional', required: false, default: '100', description: 'percent to sell (1-100)' },
    slip: { type: 'string', description: 'slippage % (default per chain)' },
    'no-mev': { type: 'boolean', description: 'anti-MEV OFF' },
    yes: { type: 'boolean', description: 'skip confirmation' },
    'dry-run': { type: 'boolean', description: 'do not submit' },
    'allow-risky': { type: 'boolean', description: 'override safety.warn' },
    json: { type: 'boolean', description: 'JSON output' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const percent = Math.max(1, Math.min(100, Number(args.percent || 100)));

    const preset = DEFAULT_PRESETS[chain];
    const slipPct = intFlag(args as Record<string, unknown>, 'slip');
    const slippageBps = slipPct !== undefined ? Math.round(slipPct * 100) : preset.slippageBps;

    const intent: SellIntent = SellIntentSchema.parse({
      kind: 'sell',
      chain,
      token: args.token,
      percent,
      slippageBps,
      antiMev: flag(args as Record<string, unknown>, 'no-mev') ? 'off' : 'auto',
    });

    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet for chain '${chain}'`);

    if (flag(args as Record<string, unknown>, 'dry-run')) {
      emitJson({ kind: 'dry-run', intent, wallet });
      return;
    }

    let snapshot;
    try {
      snapshot = await fetchTokenSnapshot(ctx.client, { chain, token: args.token, walletAddress: wallet });
    } catch (err) {
      exitWithError(`failed to fetch token: ${(err as Error).message}`);
    }

    if (snapshot.safety.block) {
      const out = { ok: false, reason: 'safety_block', gates: snapshot.safety.reasons };
      if (flag(args as Record<string, unknown>, 'json')) emitJson(out);
      else log.error(color.red(`BLOCK — ${snapshot.safety.reasons.join('; ')}`));
      process.exit(3);
    }

    const decision = decideTier({
      intent,
      safetyWarn: snapshot.safety.warn && !flag(args as Record<string, unknown>, 'allow-risky'),
      noConfirm: ctx.loaded.config.noConfirm,
    });

    const preview = [
      `${color.bold('Sell')} ${snapshot.token.symbol} on ${chain}`,
      `  percent=${percent}%  slippage=${(slippageBps / 100).toFixed(1)}%`,
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
    else if (result.ok)
      log.success(`submitted — orderId=${result.result.orderId ?? '-'} tx=${result.result.txHash ?? '-'}`);
    else {
      log.error(
        result.reason === 'cancelled'
          ? 'cancelled'
          : result.reason === 'blocked'
            ? `blocked: ${result.safety.reasons.join('; ')}`
            : `error: ${result.error.message}`,
      );
      process.exit(4);
    }
  },
});
