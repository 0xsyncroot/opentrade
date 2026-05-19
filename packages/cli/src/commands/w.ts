// `opentrade w` — wallet summary.

import { defineCommand } from 'citty';
import type { Chain } from '@hiepht/opentrade-core/chains';
import { bootstrap, flag } from './_shared.js';
import { emitJson, renderKv } from '../render/cli-renderer.js';

const CHAINS: Chain[] = ['base', 'sol', 'eth', 'bsc'];

export const wCmd = defineCommand({
  meta: { name: 'w', description: 'wallet summary across all configured chains' },
  args: { json: { type: 'boolean' } },
  async run({ args }) {
    const ctx = await bootstrap();
    const cfg = ctx.loaded.config;
    const out: Record<string, string> = {};
    for (const c of CHAINS) {
      const wmap = cfg.wallets as Partial<Record<Chain, string>>;
      const w = wmap[c];
      if (w) out[c] = w;
    }
    if (flag(args as Record<string, unknown>, 'json')) {
      emitJson({ defaultChain: cfg.defaultChain, wallets: out });
      return;
    }
    renderKv([
      ['default chain', cfg.defaultChain],
      ...(Object.entries(out) as [string, string][]),
    ]);
  },
});
