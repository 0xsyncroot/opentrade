// `opentrade feed {trending|sm|kol|trenches|kline}` — read-only signal feeds.

import { defineCommand } from 'citty';
import type { Chain } from '@0xsyncroot/opentrade-core/chains';
import * as gmgn from '@0xsyncroot/opentrade-core/gmgn';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { emitJson, log, renderTable } from '../render/cli-renderer.js';

export const feedCmd = defineCommand({
  meta: { name: 'feed', description: 'read-only signal feeds' },
  args: {
    op: { type: 'positional', required: true, description: 'trending | sm | kol | trenches | kline' },
    token: { type: 'positional', required: false, description: 'token (kline only)' },
    chain: { type: 'string' },
    window: { type: 'string', description: '5m | 1h | 6h | 24h' },
    resolution: { type: 'string', description: 'kline resolution (e.g. 5m)' },
    limit: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const wantsJson = flag(args as Record<string, unknown>, 'json');

    switch (args.op) {
      case 'trending': {
        const res = await gmgn.trending(ctx.client, {
          chain,
          window: (args.window as '5m' | '1h' | '6h' | '24h') ?? '5m',
        });
        if (wantsJson) emitJson(res);
        else log.info(JSON.stringify(res.rank?.slice(0, 20) ?? [], null, 2));
        return;
      }
      case 'sm': {
        const res = await gmgn.smartMoneyTrades(ctx.client, {
          chain,
          ...(args.window ? { window: args.window } : {}),
          ...(args.limit ? { limit: Number(args.limit) } : {}),
        });
        if (wantsJson) emitJson(res);
        else log.info(JSON.stringify(res.list?.slice(0, 20) ?? [], null, 2));
        return;
      }
      case 'kol': {
        const res = await gmgn.kolTrades(ctx.client, {
          chain,
          ...(args.window ? { window: args.window } : {}),
          ...(args.limit ? { limit: Number(args.limit) } : {}),
        });
        if (wantsJson) emitJson(res);
        else log.info(JSON.stringify(res.list?.slice(0, 20) ?? [], null, 2));
        return;
      }
      case 'trenches': {
        const res = await gmgn.trenches(ctx.client, { chain });
        if (wantsJson) emitJson(res);
        else log.info(JSON.stringify(res, null, 2));
        return;
      }
      case 'kline': {
        if (!args.token) exitWithError('feed kline: <token> required');
        const res = await gmgn.kline(ctx.client, {
          chain,
          token: args.token,
          ...(args.resolution ? { resolution: args.resolution } : {}),
        });
        if (wantsJson) emitJson(res);
        else {
          const rows = (res.list ?? []).slice(-20).map((b) => [String(b.time), b.open, b.high, b.low, b.close, b.volume ?? '-']);
          renderTable(['time', 'open', 'high', 'low', 'close', 'volume'], rows);
        }
        return;
      }
      default:
        exitWithError(`unknown feed op: ${args.op}`);
    }
  },
});
