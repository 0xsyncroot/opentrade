// Telegram renderer for a `Screen` JSON produced by core's view builders.
//
// Contract (plan §"Cốt lõi — Screen schema + Intent dispatcher"):
//   Screen → { markdown, replyMarkup }
//
//   markdown    — MarkdownV2-escaped text. Mirrors what InkRenderer paints,
//                 so both surfaces stay drift-free.
//   replyMarkup — InlineKeyboard built from `screen.actions[]`. Each button's
//                 callback_data is `act:<uuid>` where the uuid is the LRU
//                 token returned by CallbackCache.put(intent). This keeps the
//                 wire payload under the 64-byte Telegram limit even when the
//                 intent is a fully-decorated BuyIntent with TP/SL tiers.

import { InlineKeyboard } from 'grammy';
import type { actions as actionsNs, schemas } from '@0xsyncroot/opentrade-core';

type Screen = schemas.Screen;
type Block = schemas.Block;
type ActionButton = schemas.ActionButton;
type SafetyGate = schemas.SafetyGate;
type CallbackCache = actionsNs.CallbackCache;

export interface RenderedScreen {
  markdown: string;
  replyMarkup: InlineKeyboard;
}

export interface RenderOptions {
  /** Cache used to stash Intent → short uuid. Required so callback_data fits. */
  cache: CallbackCache;
  /** Buttons per row in the inline keyboard. Default: 4 (preset row width). */
  maxButtonsPerRow?: number;
}

// -- MarkdownV2 escaping (Telegram spec) ------------------------------------
// All of `_ * [ ] ( ) ~ \` > # + - = | { } . !` must be escaped in normal text.
const MD_V2_SPECIALS = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escMd(s: string): string {
  return s.replace(MD_V2_SPECIALS, (m) => `\\${m}`);
}

function toneEmoji(level: SafetyGate['level']): string {
  switch (level) {
    case 'block':
      return '⛔';
    case 'warn':
      return '🟡';
    case 'ok':
    default:
      return '✅';
  }
}

function renderHeader(s: Screen): string {
  const h = s.header;
  // e.g.  *opentrade · base · 0xH3…4a · $1,234.56 · 3 pos · gas $0.18*
  const parts = [
    'opentrade',
    h.chain,
    h.walletShort,
    `${h.balanceNative} (${h.balanceUsd})`,
    `${h.openPositions} pos`,
  ];
  if (h.gasEstUsd) parts.push(`gas ${h.gasEstUsd}`);
  return `*${escMd(parts.join(' · '))}*`;
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case 'text': {
      const prefix =
        b.tone === 'warn' ? '⚠ ' : b.tone === 'error' ? '⛔ ' : b.tone === 'success' ? '✅ ' : '';
      return `${prefix}${escMd(b.text)}`;
    }
    case 'kv': {
      // Render as 2-column key-value table-style with monospaced values.
      const lines = b.pairs.map(([k, v]) => `*${escMd(k)}*: \`${escMd(v)}\``);
      return lines.join('\n');
    }
    case 'table': {
      const head = b.headers.map((h) => `*${escMd(h)}*`).join(' \\| ');
      const rows = b.rows.map((r) => r.map((c) => `\`${escMd(c)}\``).join(' \\| '));
      return [head, ...rows].join('\n');
    }
    case 'safety': {
      if (!b.gates.length) return '';
      const lines = b.gates.map(
        (g) => `${toneEmoji(g.level)} *${escMd(g.label)}*: \`${escMd(g.value)}\``,
      );
      return lines.join('\n');
    }
    case 'holding': {
      return [
        `📦 *Hold*: \`${escMd(b.amount)} ${escMd(b.symbol)}\``,
        `*USD*: \`${escMd(b.usd)}\` · *PnL*: \`${escMd(b.pnlUsd)}\` (\`${escMd(b.pnlPct)}\`)`,
      ].join('\n');
    }
    case 'spinner':
      return `⏳ ${escMd(b.label)}`;
    case 'divider':
      return '━━━━━━━━━━━━━━━━━';
  }
}

function renderBody(s: Screen): string {
  return s.body
    .map(renderBlock)
    .filter((s) => s !== '')
    .join('\n');
}

function renderHints(s: Screen): string {
  if (!s.hints?.length) return '';
  return s.hints.map((h) => `_${escMd(h)}_`).join('\n');
}

function buildKeyboard(actions: ActionButton[], cache: CallbackCache, maxPerRow: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  let inRow = 0;
  for (const a of actions) {
    const uuid = cache.put(a.intent);
    const data = `act:${uuid}`;
    // Sanity: callback_data MUST stay <= 64 bytes (UTF-8). Our format yields ~12.
    if (Buffer.byteLength(data, 'utf8') > 64) {
      throw new Error(`tg-renderer: callback_data exceeded 64 bytes — ${data}`);
    }
    const labelWithEmoji = decorate(a);
    kb.text(labelWithEmoji, data);
    inRow++;
    if (inRow >= maxPerRow) {
      kb.row();
      inRow = 0;
    }
  }
  return kb;
}

function decorate(a: ActionButton): string {
  // Lightweight visual cues for the four Screen action tones (plan §"Telegram bot UX").
  if (a.tone === 'danger') return `🔴 ${a.label}`;
  if (a.tone === 'warn') return `⚠ ${a.label}`;
  if (a.tone === 'primary' && a.intent.kind === 'buy') return `🟢 ${a.label}`;
  return a.label;
}

export function renderScreen(screen: Screen, opts: RenderOptions): RenderedScreen {
  const maxPerRow = opts.maxButtonsPerRow ?? 4;
  const sections = [renderHeader(screen)];
  if (screen.title) sections.push(`_${escMd(screen.title)}_`);
  const body = renderBody(screen);
  if (body) sections.push(body);
  const hints = renderHints(screen);
  if (hints) sections.push(hints);
  return {
    markdown: sections.join('\n\n'),
    replyMarkup: buildKeyboard(screen.actions, opts.cache, maxPerRow),
  };
}
