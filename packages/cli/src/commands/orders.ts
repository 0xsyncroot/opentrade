// `opentrade orders {list|status|cancel}`
//
// list   → strategyList
// status → queryOrder
// cancel → not implemented in core yet (Phase 2 follow-up); surface friendly error

import { defineCommand } from 'citty';
import type { Chain } from '@hiepht/opentrade-core/chains';
import * as gmgn from '@hiepht/opentrade-core/gmgn';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { emitJson, log, renderTable } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';

export const ordersCmd = defineCommand({
  meta: { name: 'orders', description: 'GMGN strategy/limit orders' },
  args: {
    op: { type: 'positional', required: true, description: 'list | status | cancel' },
    id: { type: 'positional', required: false, description: 'order id (status/cancel)' },
    chain: { type: 'string' },
    type: { type: 'string', description: 'open | history (for list)' },
    'group-tag': { type: 'string', description: 'STMix | LimitOrder' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet for chain '${chain}'`);

    switch (args.op) {
      case 'list': {
        const res = await gmgn.strategyList(ctx.client, {
          chain,
          fromAddress: wallet,
          ...(args.type === 'history' ? { type: 'history' as const } : { type: 'open' as const }),
          ...(args['group-tag'] === 'LimitOrder' ? { groupTag: 'LimitOrder' as const } : { groupTag: 'STMix' as const }),
        });
        if (flag(args as Record<string, unknown>, 'json')) emitJson(res);
        else
          renderTable(
            ['id', 'type', 'side', 'status', 'trigger'],
            (res.list ?? []).map((o) => [
              String(o.id),
              String(o.order_type ?? '-'),
              String(o.side ?? '-'),
              String(o.status ?? '-'),
              String(o.trigger_price ?? '-'),
            ]),
          );
        return;
      }
      case 'status': {
        if (!args.id) exitWithError('orders status: <id> required');
        const res = await gmgn.queryOrder(ctx.client, { chain, orderId: args.id });
        if (flag(args as Record<string, unknown>, 'json')) emitJson(res);
        else
          renderTable(
            ['field', 'value'],
            Object.entries(res).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
          );
        return;
      }
      case 'cancel': {
        log.error('orders cancel: not yet wired in core. Use GMGN dashboard for now.');
        process.exit(2);
      }
      default:
        exitWithError(`unknown orders subcommand: ${args.op}`);
    }
  },
});
