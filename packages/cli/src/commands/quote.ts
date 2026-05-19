// `opentrade quote <chain> <token> <amount>`

import { defineCommand } from 'citty';
import type { Chain } from '@hiepht/opentrade-core/chains';
import { nativeAmountToWei } from '@hiepht/opentrade-core/chains';
import { quote } from '@hiepht/opentrade-core/gmgn';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { emitJson, renderKv } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';

export const quoteCmd = defineCommand({
  meta: { name: 'quote', description: 'GMGN swap quote (no submit)' },
  args: {
    chain: { type: 'positional', required: true },
    token: { type: 'positional', required: true },
    amount: { type: 'positional', required: true, description: 'native amount' },
    slip: { type: 'string', description: 'slippage %' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet for chain '${chain}'`);
    const wei = nativeAmountToWei(chain, Number(args.amount)).toString();
    const slip = args.slip ? Number(args.slip) / 100 : undefined;
    const res = await quote(ctx.client, {
      chain,
      fromAddress: wallet,
      outputToken: args.token,
      inputAmountWei: wei,
      ...(slip !== undefined ? { slippage: slip } : {}),
    });
    if (flag(args as Record<string, unknown>, 'json')) emitJson(res);
    else
      renderKv([
        ['input_token', String(res.input_token)],
        ['output_token', String(res.output_token)],
        ['input_amount', String(res.input_amount)],
        ['output_amount', String(res.output_amount)],
        ['output_amount_min', String(res.output_amount_min ?? '-')],
        ['price_impact', String(res.price_impact ?? '-')],
      ]);
  },
});
