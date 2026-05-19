// `opentrade limit <buy|sell> <chain> <token> <amount> --at <price>`
//
// Builds a LimitIntent. Since core/dispatcher returns a "not yet wired" error
// for limit orders, we route via this command with --dry-run safe; the actual
// strategy create lands when the core service is filled in.

import { defineCommand } from 'citty';
import type { Chain } from '@0xsyncroot/opentrade-core/chains';
import { nativeAmountToWei } from '@0xsyncroot/opentrade-core/chains';
import type { LimitIntent } from '@0xsyncroot/opentrade-core/schemas';
import { LimitIntentSchema } from '@0xsyncroot/opentrade-core/schemas';
import { dispatch } from '@0xsyncroot/opentrade-core/actions';
import { bootstrap, exitWithError, flag, intFlag, parseChainArg } from './_shared.js';
import { emitJson, log } from '../render/cli-renderer.js';
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
    if (!flag(args as Record<string, unknown>, 'yes')) {
      log.warn('limit orders are a money-moving op — pass --yes to dispatch (placeholder until core service lands)');
      process.exit(1);
    }

    const result = await dispatch(ctx.dispatcherCtx, intent);
    if (flag(args as Record<string, unknown>, 'json')) emitJson(result);
    else if (result.ok) log.success(`submitted: ${JSON.stringify(result.result)}`);
    else log.error(result.reason === 'error' ? result.error.message : result.reason);
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
