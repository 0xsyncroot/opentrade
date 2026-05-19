// `opentrade buy <chain> <token> <amount> [flags]`
//
// Builds a BuyIntent, runs the 4-tier confirmation, dispatches through core.

import { defineCommand } from 'citty';
import { nativeAmountToWei, type Chain } from '@hiepht/opentrade-core/chains';
import { BuyIntentSchema, type BuyIntent, type TpSlTier } from '@hiepht/opentrade-core/schemas';
import { dispatch } from '@hiepht/opentrade-core/actions';
import { fetchTokenSnapshot } from '@hiepht/opentrade-core/services';
import { DEFAULT_PRESETS } from '@hiepht/opentrade-core/presets';
import { bootstrap, exitWithError, flag, intFlag, parseChainArg, strFlag } from './_shared.js';
import { decideTier, runConfirmation } from '../safety/confirm.js';
import { emitJson, log, color } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';

export const buyCmd = defineCommand({
  meta: { name: 'buy', description: 'Buy a token via GMGN swap (V4 auto anti-MEV)' },
  args: {
    chain: { type: 'positional', required: true, description: 'base | sol | eth | bsc' },
    token: { type: 'positional', required: true, description: 'token contract address' },
    amount: { type: 'positional', required: true, description: 'native amount (e.g. 0.05)' },
    slip: { type: 'string', description: 'slippage % (default per chain)' },
    tp: { type: 'string', description: 'take-profit price % (e.g. 50 = +50%)' },
    sl: { type: 'string', description: 'stop-loss price % (e.g. 20 = -20%)' },
    'trail-tp': { type: 'string', description: 'trailing take-profit drawdown %' },
    'trail-sl': { type: 'string', description: 'trailing stop-loss drawdown %' },
    'no-mev': { type: 'boolean', description: 'force anti-MEV OFF (required for Uniswap V4)' },
    'mev-on': { type: 'boolean', description: 'force anti-MEV ON (override auto)' },
    yes: { type: 'boolean', description: 'skip confirmation (still T3 if safety.warn)' },
    'dry-run': { type: 'boolean', description: 'do not submit; print intent and exit' },
    'allow-risky': { type: 'boolean', description: 'override safety.warn (still requires T3)' },
    json: { type: 'boolean', description: 'JSON output' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const amountNum = Number(args.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      exitWithError(`invalid amount: ${args.amount}`);
    }
    const amountWei = nativeAmountToWei(chain, amountNum).toString();

    const preset = DEFAULT_PRESETS[chain];
    const slipPct = intFlag(args as Record<string, unknown>, 'slip');
    const slippageBps = slipPct !== undefined ? Math.round(slipPct * 100) : preset.slippageBps;

    const antiMev: 'on' | 'off' | 'auto' = flag(args as Record<string, unknown>, 'no-mev')
      ? 'off'
      : flag(args as Record<string, unknown>, 'mev-on')
        ? 'on'
        : 'auto';

    const tp = intFlag(args as Record<string, unknown>, 'tp');
    const sl = intFlag(args as Record<string, unknown>, 'sl');
    const trailTp = intFlag(args as Record<string, unknown>, 'trail-tp');
    const trailSl = intFlag(args as Record<string, unknown>, 'trail-sl');

    const tpArr: TpSlTier[] | undefined = tp ? [{ pricePct: tp, sellPct: 100 }] : undefined;
    const slArr: TpSlTier[] | undefined = sl ? [{ pricePct: sl, sellPct: 100 }] : undefined;

    const intent: BuyIntent = BuyIntentSchema.parse({
      kind: 'buy',
      chain,
      token: args.token,
      amountWei,
      slippageBps,
      antiMev,
      ...(tpArr ? { tp: tpArr } : {}),
      ...(slArr ? { sl: slArr } : {}),
      ...(trailTp !== undefined ? { trailTpPct: trailTp } : {}),
      ...(trailSl !== undefined ? { trailSlPct: trailSl } : {}),
    });

    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet configured for chain '${chain}'. Run 'opentrade init'.`);

    if (flag(args as Record<string, unknown>, 'dry-run')) {
      const preview = { kind: 'dry-run', intent, wallet };
      if (flag(args as Record<string, unknown>, 'json')) emitJson(preview);
      else {
        log.info(color.dim('dry-run: would dispatch'));
        emitJson(preview);
      }
      return;
    }

    // Pull token snapshot for safety preview + symbol echo (T3).
    let snapshot;
    try {
      snapshot = await fetchTokenSnapshot(ctx.client, { chain, token: args.token, walletAddress: wallet });
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

    const decision = decideTier({
      intent,
      safetyWarn: snapshot.safety.warn && !flag(args as Record<string, unknown>, 'allow-risky'),
      noConfirm: ctx.loaded.config.noConfirm,
    });

    const preview = [
      `${color.bold('Buy')} ${snapshot.token.symbol} on ${chain}`,
      `  amount=${args.amount} ${chain === 'sol' ? 'SOL' : 'native'}  slippage=${(slippageBps / 100).toFixed(1)}%  anti-mev=${antiMev}`,
      ...(tp ? [`  TP +${tp}%`] : []),
      ...(sl ? [`  SL -${sl}%`] : []),
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
    if (flag(args as Record<string, unknown>, 'json')) {
      emitJson(result);
    } else if (result.ok) {
      log.success(`submitted — orderId=${result.result.orderId ?? '-'} tx=${result.result.txHash ?? '-'}`);
    } else {
      log.error(
        result.reason === 'blocked'
          ? `blocked: ${result.safety.reasons.join('; ')}`
          : result.reason === 'cancelled'
            ? 'cancelled'
            : `error: ${result.error.message}`,
      );
      process.exit(4);
    }
  },
});
