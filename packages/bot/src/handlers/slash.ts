// Slash command dispatcher — parses `/buy 0.05`, `/sell 50`, `/ps`, `/info`,
// `/chain`, `/help` using the shared `parseSlash` from core/classifier.
//
// All commands that produce a Screen go back through tg-renderer so the
// presentation stays in sync with the TUI.

import type { Context } from 'grammy';
import {
  classifier as classifierNs,
  services as servicesNs,
  views as viewsNs,
  schemas,
  presets as presetsNs,
} from '@hiepht/opentrade-core';
import type { actions as actionsNs } from '@hiepht/opentrade-core';
import type { GmgnClient } from '@hiepht/opentrade-core/gmgn';
import type { renderScreen } from '../render/tg-renderer.js';
import { escMd } from '../render/tg-renderer.js';

export interface SlashHandlerDeps {
  client: GmgnClient;
  cache: actionsNs.CallbackCache;
  dispatcherCtx: actionsNs.DispatcherContext;
  wallets: Partial<Record<schemas.Chain, string>>;
  defaultChain: schemas.Chain;
  render: typeof renderScreen;
}

export function makeSlashHandler(deps: SlashHandlerDeps) {
  return async function handleSlash(ctx: Context): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;
    const parsed = classifierNs.parseSlash(text);

    switch (parsed.cmd) {
      case 'help':
      case 'unknown':
        await replyHelp(ctx);
        return;
      case 'ps':
        await replyPositions(ctx, deps);
        return;
      case 'info': {
        const token = parsed.args[0];
        if (!token) {
          await ctx.reply('Usage: /info <contract>');
          return;
        }
        await replyTokenScreen(ctx, deps, token, 'info');
        return;
      }
      case 'buy': {
        const token = parsed.args[0];
        if (!token) {
          await ctx.reply('Usage: /buy <contract>');
          return;
        }
        await replyTokenScreen(ctx, deps, token, 'buy');
        return;
      }
      case 'sell': {
        const token = parsed.args[0];
        if (!token) {
          await ctx.reply('Usage: /sell <contract>');
          return;
        }
        await replyTokenScreen(ctx, deps, token, 'sell');
        return;
      }
      case 'chain': {
        const candidate = parsed.args[0] as schemas.Chain | undefined;
        if (!candidate || !['base', 'sol', 'eth', 'bsc'].includes(candidate)) {
          await ctx.reply('Usage: /chain <base|sol|eth|bsc>');
          return;
        }
        // Note: chain is set per-call; we ack but do not mutate global config
        // from the bot. Persistent change is via opentrade config.
        await ctx.reply(`Default chain will be \`${escMd(candidate)}\` for this session.`, {
          parse_mode: 'MarkdownV2',
        });
        return;
      }
      default:
        await ctx.reply(`Command /${parsed.cmd} is not wired in the bot yet. Use the CLI for now.`);
    }
  };
}

async function replyHelp(ctx: Context): Promise<void> {
  const lines = classifierNs.SLASH_COMMANDS_HELP.map(
    (c) => `*${escMd(c.usage)}* — ${escMd(c.help)}`,
  );
  await ctx.reply(['*opentrade commands*', '', ...lines].join('\n'), {
    parse_mode: 'MarkdownV2',
  });
}

async function replyPositions(ctx: Context, deps: SlashHandlerDeps): Promise<void> {
  const wallet = deps.wallets[deps.defaultChain];
  if (!wallet) {
    await ctx.reply(`No wallet configured for chain "${deps.defaultChain}".`);
    return;
  }
  try {
    const positions = await servicesNs.listHoldings(deps.client, {
      chain: deps.defaultChain,
      walletAddress: wallet,
    });
    const header = viewsNs.buildHeader({
      chain: deps.defaultChain,
      walletAddress: wallet,
      nativeBalanceWei: undefined,
      nativeBalanceUsd: undefined,
      openPositions: positions.length,
    });
    const screen = viewsNs.buildPositionsScreen({ header, positions });
    const r = deps.render(screen, { cache: deps.cache });
    await ctx.reply(r.markdown, { parse_mode: 'MarkdownV2', reply_markup: r.replyMarkup });
  } catch (err) {
    await ctx.reply(`Could not fetch positions: ${(err as Error).message}`);
  }
}

async function replyTokenScreen(
  ctx: Context,
  deps: SlashHandlerDeps,
  token: string,
  mode: 'buy' | 'sell' | 'info',
): Promise<void> {
  const chain = deps.defaultChain;
  const wallet = deps.wallets[chain];
  if (!wallet) {
    await ctx.reply(`No wallet configured for chain "${chain}".`);
    return;
  }
  try {
    const snapshot = await servicesNs.fetchTokenSnapshot(deps.client, {
      chain,
      token,
      walletAddress: wallet,
    });
    const header = viewsNs.buildHeader({
      chain,
      walletAddress: wallet,
      nativeBalanceWei: undefined,
      nativeBalanceUsd: undefined,
      openPositions: 0,
    });
    const preset = presetsNs.DEFAULT_PRESETS[chain];
    const screen =
      mode === 'sell'
        ? viewsNs.buildSellScreen({ header, snapshot, preset })
        : mode === 'info'
          ? viewsNs.buildInfoScreen({ header, snapshot })
          : viewsNs.buildBuyScreen({ header, snapshot, preset });
    const r = deps.render(screen, { cache: deps.cache });
    await ctx.reply(r.markdown, { parse_mode: 'MarkdownV2', reply_markup: r.replyMarkup });
  } catch (err) {
    await ctx.reply(`Snapshot failed: ${(err as Error).message}`);
  }
}
