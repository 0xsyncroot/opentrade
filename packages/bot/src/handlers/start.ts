// /start command — greet, confirm whitelist, show a quick wallet summary so
// the owner knows the bot is alive and pointing at the right wallets.

import type { Context } from 'grammy';
import type { schemas } from '@hiepht/opentrade-core';
import { escMd } from '../render/tg-renderer.js';

export interface StartHandlerDeps {
  wallets: Partial<Record<schemas.Chain, string>>;
  defaultChain: schemas.Chain;
}

export function makeStartHandler(deps: StartHandlerDeps) {
  return async function handleStart(ctx: Context): Promise<void> {
    const wallets = Object.entries(deps.wallets)
      .filter(([, addr]) => Boolean(addr))
      .map(([chain, addr]) => `${chain}: \`${escMd(short(addr!))}\``);

    const lines = [
      '*opentrade bot online*',
      '',
      `Default chain: \`${deps.defaultChain}\``,
      'Wallets:',
      ...(wallets.length ? wallets : ['_none configured_']),
      '',
      '_Paste a contract address to start, or /help for commands._',
    ];

    await ctx.reply(lines.join('\n'), { parse_mode: 'MarkdownV2' });
  };
}

function short(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
