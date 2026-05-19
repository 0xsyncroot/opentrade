// Text-message handler: any free-form text from the whitelisted owner is run
// through `classifyInput`. If it looks like a contract address (EVM/Sol) or a
// supported explorer URL, we fetch the GMGN token snapshot and reply with the
// canonical Screen JSON rendered to Markdown + InlineKeyboard.
//
// Plan refs: §"Telegram bot UX" + §"Paste detection (Ink 7 usePaste + classifier)".

import type { Context } from 'grammy';
import {
  classifier as classifierNs,
  services as servicesNs,
  views as viewsNs,
  schemas,
} from '@0xsyncroot/opentrade-core';
import type { actions as actionsNs } from '@0xsyncroot/opentrade-core';
import type { GmgnClient } from '@0xsyncroot/opentrade-core/gmgn';
import type { renderScreen } from '../render/tg-renderer.js';
import type { RiskGateState } from '../keyboards/risk-gate.js';

export interface PasteHandlerDeps {
  client: GmgnClient;
  cache: actionsNs.CallbackCache;
  wallets: Partial<Record<schemas.Chain, string>>;
  defaultChain: schemas.Chain;
  riskGate: RiskGateState;
  render: typeof renderScreen;
  /** Called after risk-confirm text matches to forward to the dispatcher. */
  onRiskConfirm?: (
    ctx: Context,
    intent: schemas.Intent,
  ) => Promise<void>;
}

const HOLDING_USD_THRESHOLD = 0.5; // plan §"Auto buy↔sell mode"

function pickChain(
  classification: classifierNs.InputClass,
  fallback: schemas.Chain,
): schemas.Chain {
  if (classification.kind === 'sol_ca') return 'sol';
  if (classification.kind === 'evm_ca')
    return (classification.chainHint as schemas.Chain | undefined) ?? fallback;
  if (classification.kind === 'url') return (classification.chainHint as schemas.Chain | undefined) ?? fallback;
  return fallback;
}

function extractAddress(classification: classifierNs.InputClass): string | undefined {
  if (classification.kind === 'evm_ca' || classification.kind === 'sol_ca') return classification.address;
  if (classification.kind === 'url') return classification.extractedAddress;
  return undefined;
}

export function makePasteHandler(deps: PasteHandlerDeps) {
  return async function handlePaste(ctx: Context): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    // Risk-gate echo: when the gate is armed we expect the next text to be the
    // exact token symbol — short-circuit classification.
    if (deps.riskGate.armed) {
      const intent = deps.riskGate.consume(text);
      if (intent) {
        await ctx.reply('Risk acknowledged — proceeding.');
        await deps.onRiskConfirm?.(ctx, intent);
      } else {
        await ctx.reply('Symbol did not match. Risk action cancelled.');
      }
      return;
    }

    const classified = classifierNs.classifyInput(text, { defaultChain: deps.defaultChain });

    if (classified.kind === 'slash') {
      // Routed elsewhere by slash.ts.
      return;
    }
    if (
      classified.kind !== 'evm_ca' &&
      classified.kind !== 'sol_ca' &&
      !(classified.kind === 'url' && classified.extractedAddress)
    ) {
      await ctx.reply(
        'Paste a Base/Sol/ETH/BSC contract address or use a /slash command. Type /help for the list.',
      );
      return;
    }

    const chain = pickChain(classified, deps.defaultChain);
    const wallet = deps.wallets[chain];
    if (!wallet) {
      await ctx.reply(`No wallet configured for chain "${chain}". Add it to ~/.config/opentrade/config.json.`);
      return;
    }
    const address = extractAddress(classified);
    if (!address) {
      await ctx.reply('Could not extract a contract address from that input.');
      return;
    }

    let snapshot: servicesNs.TokenSnapshot;
    try {
      snapshot = await servicesNs.fetchTokenSnapshot(deps.client, {
        chain,
        token: address,
        walletAddress: wallet,
      });
    } catch (err) {
      await ctx.reply(`GMGN snapshot failed: ${(err as Error).message}`);
      return;
    }

    const header = viewsNs.buildHeader({
      chain,
      walletAddress: wallet,
      nativeBalanceWei: undefined,
      nativeBalanceUsd: undefined,
      openPositions: 0,
    });

    const holdingUsd = snapshot.myHolding?.usd_value ?? 0;
    const screen =
      holdingUsd > HOLDING_USD_THRESHOLD
        ? viewsNs.buildSellScreen({ header, snapshot })
        : viewsNs.buildBuyScreen({ header, snapshot });

    // Risk gate: replace preset action row with a single Confirm Risky button.
    if (snapshot.safety.warn && !snapshot.safety.block && screen.kind === 'buy') {
      // Use the first action's intent as the "armed" intent — sensible default
      // (cheapest preset). User may still cancel by typing anything else.
      const firstBuy = screen.actions.find((a) => a.intent.kind === 'buy');
      if (firstBuy) {
        deps.riskGate.arm({
          expectedSymbol: snapshot.token.symbol,
          intent: firstBuy.intent,
        });
        // Replace actions with the single risk button via Screen surgery.
        screen.actions = [
          {
            id: 'risky',
            label: '⚠ Confirm Risky',
            intent: firstBuy.intent,
            tone: 'warn',
          },
        ];
        screen.hints = [
          ...(screen.hints ?? []),
          `Type token symbol "${snapshot.token.symbol}" exactly to confirm risky trade.`,
        ];
      }
    }

    const rendered = deps.render(screen, { cache: deps.cache });
    await ctx.reply(rendered.markdown, {
      parse_mode: 'MarkdownV2',
      reply_markup: rendered.replyMarkup,
    });
  };
}

export const PASTE_CONST_FOR_TESTS: { HOLDING_USD_THRESHOLD: number } = {
  HOLDING_USD_THRESHOLD,
};
