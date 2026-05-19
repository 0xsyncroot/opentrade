// Pure view builders — given snapshot data, produce a Screen JSON. Tested with
// vitest snapshot to lock the schema. Both the Ink TUI renderer and the Telegram
// renderer consume the resulting Screen.

import type { Chain } from '../chains/index.js';
import { NATIVE_SYMBOL, weiToNative } from '../chains/index.js';
import type { Holding } from '../gmgn/types.js';
import type { ChainPreset } from '../presets/index.js';
import { DEFAULT_PRESETS } from '../presets/index.js';
import type {
  ActionButton,
  Block,
  Intent,
  SafetyGate,
  Screen,
  ScreenHeader,
} from '../schemas/index.js';
import type { TokenSnapshot } from '../services/index.js';
import { fmtCompact, fmtPctDelta, fmtTokenAmount, fmtUsd, shortAddr } from './format.js';

export interface HeaderInput {
  chain: Chain;
  walletAddress: string;
  nativeBalanceWei: bigint | string | undefined;
  nativeBalanceUsd: number | undefined;
  openPositions: number;
  gasEstUsd?: number;
}

export function buildHeader(h: HeaderInput): ScreenHeader {
  const balanceNative = h.nativeBalanceWei
    ? weiToNative(h.chain, h.nativeBalanceWei).toFixed(4)
    : '—';
  const out: ScreenHeader = {
    chain: h.chain,
    walletShort: shortAddr(h.walletAddress),
    balanceNative,
    balanceUsd: fmtUsd(h.nativeBalanceUsd),
    openPositions: h.openPositions,
  };
  if (h.gasEstUsd !== undefined) {
    out.gasEstUsd = fmtUsd(h.gasEstUsd);
  }
  return out;
}

// -- BUY screen --------------------------------------------------------------

export interface BuyScreenInput {
  header: ScreenHeader;
  snapshot: TokenSnapshot;
  preset?: ChainPreset;
  slippageBps?: number;
  antiMev?: 'on' | 'off' | 'auto';
  tpPct?: number;
  slPct?: number;
  /** Pending alias / saved preset name (for footer hint). */
  aliasUsed?: string;
}

export function buildBuyScreen(input: BuyScreenInput): Screen {
  const { header, snapshot } = input;
  const chain = header.chain;
  const preset = input.preset ?? DEFAULT_PRESETS[chain];
  const slippageBps = input.slippageBps ?? preset.slippageBps;
  const antiMev = input.antiMev ?? preset.antiMev;
  const symbol = snapshot.token.symbol;

  const body: Block[] = [
    {
      type: 'text',
      text: `${symbol}  ${snapshot.token.name ?? ''}    ${fmtUsd(snapshot.token.price)}   ${fmtPctDelta(snapshot.token.price_change_percent24h)}`,
      tone: 'info',
    },
    { type: 'divider' },
    {
      type: 'kv',
      pairs: [
        ['MCap', fmtUsd(snapshot.token.market_cap as number)],
        ['Liq', fmtUsd(snapshot.token.liquidity as number)],
        ['Pool', `${snapshot.pool?.exchange ?? '—'}`],
        ['Holders', fmtCompact(snapshot.token.holder_count)],
      ],
    },
    { type: 'safety', gates: snapshot.safety.gates },
  ];

  const actions: ActionButton[] = preset.buyAmounts.map((amount, i) => {
    const intent: Intent = {
      kind: 'buy',
      chain,
      token: snapshot.token.address,
      amountWei: nativeToWeiString(chain, amount),
      slippageBps,
      antiMev,
      ...(input.tpPct ? { tp: [{ pricePct: input.tpPct, sellPct: 100 }] } : {}),
      ...(input.slPct ? { sl: [{ pricePct: input.slPct, sellPct: 100 }] } : {}),
    };
    return {
      id: `b${i + 1}`,
      label: `${amount} ${NATIVE_SYMBOL[chain]}`,
      hotkey: String(i + 1),
      intent,
      tone: 'primary',
    };
  });
  // Tab = switch to sell view (only meaningful when holding > 0, but we still
  // expose the button so users can pre-arm a sell flow)
  actions.push({
    id: 'tab',
    label: 'Sell view',
    hotkey: 'Tab',
    intent: { kind: 'switch_mode', to: 'sell' },
    tone: 'muted',
  });

  const hints: string[] = [
    `1-4 buy · Tab sell view · i info · r refresh · /cmd · ? help · q quit`,
    `Slip ${(slippageBps / 100).toFixed(1)}% · Anti-MEV ${antiMev}${input.tpPct ? ` · TP +${input.tpPct}%` : ''}${input.slPct ? ` · SL -${input.slPct}%` : ''}`,
  ];
  if (input.aliasUsed) hints.unshift(`Alias: ${input.aliasUsed}`);
  if (snapshot.safety.warn && !snapshot.safety.block) {
    hints.unshift(`⚠ Warning: ${snapshot.safety.reasons.join(', ')}`);
  }

  return {
    kind: 'buy',
    title: `Buy ${symbol}`,
    header,
    body,
    actions,
    hints,
  };
}

// -- SELL screen -------------------------------------------------------------

export interface SellScreenInput {
  header: ScreenHeader;
  snapshot: TokenSnapshot;
  preset?: ChainPreset;
  slippageBps?: number;
}

export function buildSellScreen(input: SellScreenInput): Screen {
  const { header, snapshot } = input;
  const chain = header.chain;
  const preset = input.preset ?? DEFAULT_PRESETS[chain];
  const slippageBps = input.slippageBps ?? preset.slippageBps;
  const symbol = snapshot.token.symbol;
  const holding = snapshot.myHolding;

  const body: Block[] = [
    {
      type: 'text',
      text: `${symbol}  ${snapshot.token.name ?? ''}    ${fmtUsd(snapshot.token.price)}   ${fmtPctDelta(snapshot.token.price_change_percent24h)}`,
      tone: 'info',
    },
    { type: 'divider' },
  ];

  if (holding) {
    const pnlUsd = holding.pnl ?? 0;
    const pnlPct = holding.pnl_percent ?? 0;
    const amountDisp = formatBalance(holding);
    body.push({
      type: 'holding',
      amount: amountDisp,
      symbol,
      usd: fmtUsd(holding.usd_value),
      pnlUsd: fmtUsd(pnlUsd),
      pnlPct: fmtPctDelta(pnlPct / 100),
    });
  } else {
    body.push({
      type: 'text',
      text: `No holding detected for ${symbol}. Press Tab to buy.`,
      tone: 'warn',
    });
  }

  body.push({ type: 'safety', gates: snapshot.safety.gates });

  const actions: ActionButton[] = preset.sellPercents.map((pct, i) => ({
    id: `s${pct}`,
    label: `${pct}%`,
    hotkey: String(i + 1),
    intent: {
      kind: 'sell',
      chain,
      token: snapshot.token.address,
      percent: pct,
      slippageBps,
      antiMev: 'auto',
    },
    tone: pct === 100 ? 'danger' : 'primary',
  }));

  actions.push({
    id: 'tab',
    label: 'Buy view',
    hotkey: 'Tab',
    intent: { kind: 'switch_mode', to: 'buy' },
    tone: 'muted',
  });

  const hints: string[] = [
    `1-4 sell % · Tab buy view · i info · r refresh · /cmd · ? help · q quit`,
    `Slip ${(slippageBps / 100).toFixed(1)}%`,
  ];
  if (snapshot.safety.warn && !snapshot.safety.block) {
    hints.unshift(`⚠ Warning: ${snapshot.safety.reasons.join(', ')}`);
  }

  return {
    kind: 'sell',
    title: `Sell ${symbol}`,
    header,
    body,
    actions,
    hints,
  };
}

// -- Info expanded screen ----------------------------------------------------

export function buildInfoScreen(input: {
  header: ScreenHeader;
  snapshot: TokenSnapshot;
}): Screen {
  const { header, snapshot } = input;
  const body: Block[] = [
    {
      type: 'text',
      text: `${snapshot.token.symbol}  ${snapshot.token.name ?? ''}  ${fmtUsd(snapshot.token.price)}`,
      tone: 'info',
    },
    {
      type: 'kv',
      pairs: [
        ['Address', snapshot.token.address],
        ['MCap', fmtUsd(snapshot.token.market_cap as number)],
        ['Liquidity', fmtUsd(snapshot.token.liquidity as number)],
        ['FDV', fmtUsd(snapshot.token.fdv as number)],
        ['Pool', `${snapshot.pool?.exchange ?? '—'}`],
        ['Pool addr', snapshot.pool?.address ?? '—'],
        ['Holders', fmtCompact(snapshot.token.holder_count)],
        ['24h Δ', fmtPctDelta(snapshot.token.price_change_percent24h)],
      ],
    },
    { type: 'safety', gates: snapshot.safety.gates },
  ];

  if (snapshot.myHolding) {
    body.push({
      type: 'holding',
      amount: formatBalance(snapshot.myHolding),
      symbol: snapshot.token.symbol,
      usd: fmtUsd(snapshot.myHolding.usd_value),
      pnlUsd: fmtUsd(snapshot.myHolding.pnl),
      pnlPct: fmtPctDelta((snapshot.myHolding.pnl_percent ?? 0) / 100),
    });
  }

  return {
    kind: 'info',
    title: `${snapshot.token.symbol} info`,
    header,
    body,
    actions: [
      { id: 'back', label: 'Back', hotkey: 'Esc', intent: { kind: 'refresh' }, tone: 'muted' },
    ],
    hints: ['Esc back · r refresh · q quit'],
  };
}

// -- Positions list screen ---------------------------------------------------

export function buildPositionsScreen(input: {
  header: ScreenHeader;
  positions: Holding[];
}): Screen {
  const body: Block[] = [];

  if (input.positions.length === 0) {
    body.push({ type: 'text', text: 'No open positions.', tone: 'info' });
  } else {
    body.push({
      type: 'table',
      headers: ['Symbol', 'USD', 'PnL', 'PnL %', 'Address'],
      rows: input.positions.map((p) => [
        p.symbol,
        fmtUsd(p.usd_value),
        fmtUsd(p.pnl ?? 0),
        fmtPctDelta((p.pnl_percent ?? 0) / 100),
        shortAddr(p.token_address),
      ]),
    });
  }

  const actions: ActionButton[] = [
    { id: 'back', label: 'Back', hotkey: 'Esc', intent: { kind: 'refresh' }, tone: 'muted' },
  ];

  return {
    kind: 'positions',
    title: 'Open positions',
    header: input.header,
    body,
    actions,
    hints: [`${input.positions.length} positions · j/k navigate · Enter open · Esc back`],
  };
}

// -- Home / idle screen ------------------------------------------------------

export function buildHomeScreen(input: {
  header: ScreenHeader;
  recentCAs?: string[];
}): Screen {
  const body: Block[] = [
    {
      type: 'text',
      text: 'Paste a contract address to start. /help for commands.',
      tone: 'info',
    },
  ];
  if (input.recentCAs?.length) {
    body.push({
      type: 'table',
      headers: ['#', 'Recent CA'],
      rows: input.recentCAs.slice(0, 10).map((a, i) => [String(i + 1), shortAddr(a, 6, 6)]),
    });
  }

  return {
    kind: 'home',
    title: 'opentrade',
    header: input.header,
    body,
    actions: [
      { id: 'slash', label: 'Commands', hotkey: '/', intent: { kind: 'open_slash' }, tone: 'muted' },
      { id: 'ps', label: 'Positions', hotkey: 'p', intent: { kind: 'open_positions' }, tone: 'muted' },
    ],
    hints: ['Paste CA · /cmd · p positions · ? help · q quit'],
  };
}

// -- helpers ----------------------------------------------------------------

function nativeToWeiString(chain: Chain, amountNative: number): string {
  // Avoid floating-point error for large decimals.
  const [whole, frac = ''] = amountNative.toString().split('.');
  const wholePart = BigInt(whole ?? '0');
  const decimals = chain === 'sol' ? 9 : 18;
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const fracPart = fracPadded ? BigInt(fracPadded) : 0n;
  const total = wholePart * 10n ** BigInt(decimals) + fracPart;
  return total.toString();
}

function formatBalance(h: Holding): string {
  const n = Number(h.balance) / 10 ** (h.decimals ?? 0);
  return Number.isFinite(n) ? fmtTokenAmount(n) : h.balance;
}

export type { SafetyGate };
