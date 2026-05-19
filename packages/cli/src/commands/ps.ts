// `opentrade ps` — list positions (holdings) with PnL.

import { defineCommand } from 'citty';
import type { Chain } from '@0xsyncroot/opentrade-core/chains';
import { listHoldings } from '@0xsyncroot/opentrade-core/services';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { emitJson, renderTable } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';

export const psCmd = defineCommand({
  meta: { name: 'ps', description: 'list open positions' },
  args: {
    chain: { type: 'string', description: 'chain (defaults to config.defaultChain)' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet for chain '${chain}'`);

    const holdings = await listHoldings(ctx.client, { chain, walletAddress: wallet });
    const isJson = flag(args as Record<string, unknown>, 'json');
    if (isJson) {
      emitJson({ chain, wallet, holdings });
      return;
    }
    renderTable(
      ['Symbol', 'Balance', 'USD', 'PnL', 'PnL%', 'Address'],
      holdings.map((h) => [
        h.symbol,
        String(h.balance),
        h.usd_value != null ? `$${Number(h.usd_value).toFixed(2)}` : '-',
        h.pnl != null ? `$${Number(h.pnl).toFixed(2)}` : '-',
        h.pnl_percent != null ? `${Number(h.pnl_percent).toFixed(2)}%` : '-',
        h.token_address,
      ]),
    );
  },
});
