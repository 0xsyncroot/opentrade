// `opentrade alias {save|ls|rm}` — saved trade preset shortcuts.

import { defineCommand } from 'citty';
import type { Chain } from '@hiepht/opentrade-core/chains';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { readAliases, writeAliases } from '../config/load.js';
import type { Alias } from '../config/schema.js';
import { emitJson, log, renderTable } from '../render/cli-renderer.js';

export const aliasCmd = defineCommand({
  meta: { name: 'alias', description: 'saved trade aliases' },
  args: {
    op: { type: 'positional', required: true, description: 'save | ls | rm' },
    name: { type: 'positional', required: false },
    chain: { type: 'string' },
    token: { type: 'string' },
    amount: { type: 'string' },
    slip: { type: 'string' },
    tp: { type: 'string' },
    sl: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const aliases = readAliases(ctx.loaded.paths);

    switch (args.op) {
      case 'ls': {
        if (flag(args as Record<string, unknown>, 'json')) emitJson(aliases);
        else
          renderTable(
            ['name', 'chain', 'token', 'amount', 'slipBps', 'tp%', 'sl%'],
            Object.values(aliases.aliases).map((a) => [
              a.name,
              a.chain,
              a.token,
              a.defaultAmount != null ? String(a.defaultAmount) : '-',
              a.defaultSlippageBps != null ? String(a.defaultSlippageBps) : '-',
              a.tpPct != null ? String(a.tpPct) : '-',
              a.slPct != null ? String(a.slPct) : '-',
            ]),
          );
        return;
      }
      case 'save': {
        if (!args.name || !args.chain || !args.token) exitWithError('alias save: name + --chain + --token required');
        const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
        const a: Alias = {
          name: args.name,
          chain,
          token: args.token,
          ...(args.amount ? { defaultAmount: Number(args.amount) } : {}),
          ...(args.slip ? { defaultSlippageBps: Math.round(Number(args.slip) * 100) } : {}),
          ...(args.tp ? { tpPct: Number(args.tp) } : {}),
          ...(args.sl ? { slPct: Number(args.sl) } : {}),
        };
        aliases.aliases[a.name] = a;
        writeAliases(ctx.loaded.paths, aliases);
        log.success(`saved alias '${a.name}'`);
        return;
      }
      case 'rm': {
        if (!args.name) exitWithError('alias rm: name required');
        delete aliases.aliases[args.name];
        writeAliases(ctx.loaded.paths, aliases);
        log.success(`removed alias '${args.name}'`);
        return;
      }
      default:
        exitWithError(`unknown alias op: ${args.op}`);
    }
  },
});
