// `opentrade holdings <chain>` — alias of `ps --chain ...`

import { defineCommand } from 'citty';
import type { Chain } from '@hiepht/opentrade-core/chains';
import { listHoldings } from '@hiepht/opentrade-core/services';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { emitJson, renderTable } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';

export const holdingsCmd = defineCommand({
  meta: { name: 'holdings', description: 'list holdings on a chain' },
  args: {
    chain: { type: 'positional', required: true },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet for chain '${chain}'`);
    const holdings = await listHoldings(ctx.client, { chain, walletAddress: wallet });
    if (flag(args as Record<string, unknown>, 'json')) emitJson({ chain, wallet, holdings });
    else
      renderTable(
        ['Symbol', 'USD', 'PnL%', 'Address'],
        holdings.map((h) => [
          h.symbol,
          h.usd_value != null ? `$${Number(h.usd_value).toFixed(2)}` : '-',
          h.pnl_percent != null ? `${Number(h.pnl_percent).toFixed(2)}%` : '-',
          h.token_address,
        ]),
      );
  },
});
