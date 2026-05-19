// `opentrade info <chain> <token>` — token card via core Screen builder.

import { defineCommand } from 'citty';
import type { Chain } from '@hiepht/opentrade-core/chains';
import { fetchTokenSnapshot } from '@hiepht/opentrade-core/services';
import { buildInfoScreen, buildHeader } from '@hiepht/opentrade-core/views';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { emitJson, renderScreen } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';

export const infoCmd = defineCommand({
  meta: { name: 'info', description: 'expanded token info card' },
  args: {
    chain: { type: 'positional', required: true },
    token: { type: 'positional', required: true },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet for chain '${chain}'`);

    const snapshot = await fetchTokenSnapshot(ctx.client, { chain, token: args.token, walletAddress: wallet });
    const header = buildHeader({
      chain,
      walletAddress: wallet,
      nativeBalanceWei: undefined,
      nativeBalanceUsd: undefined,
      openPositions: 0,
    });
    const screen = buildInfoScreen({ header, snapshot });
    if (flag(args as Record<string, unknown>, 'json')) emitJson({ screen, snapshot });
    else renderScreen(screen);
  },
});
