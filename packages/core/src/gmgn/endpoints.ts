// Thin typed wrappers around GMGN HTTP endpoints. Each function corresponds to
// one operation in bin/gmgn_api.py (Python reference) or one of the official
// gmgn-skills SKILL.md files.

import type { Chain } from '../chains/index.js';
import { NATIVE_INPUT_TOKEN } from '../chains/index.js';
import type { GmgnClient } from './client.js';
import type {
  Holding,
  KlineBar,
  OrderStatus,
  PoolInfo,
  QuoteResult,
  StrategyOrder,
  SwapResult,
  TokenInfo,
  TokenSecurity,
} from './types.js';

const chainParam = (chain: Chain): string => chain;

// -- user / wallet ----------------------------------------------------------

export function userInfo(client: GmgnClient): Promise<unknown> {
  return client.call({ method: 'GET', subPath: '/v1/user/info' });
}

export function walletHoldings(
  client: GmgnClient,
  args: { chain: Chain; walletAddress: string; limit?: number; signal?: AbortSignal },
): Promise<{ holdings?: Holding[]; list?: Holding[] }> {
  return client.call({
    method: 'GET',
    subPath: '/v1/user/wallet_holdings',
    query: {
      chain: chainParam(args.chain),
      wallet_address: args.walletAddress,
      order_by: 'usd_value',
      direction: 'desc',
      limit: args.limit ?? 20,
      hide_closed: 'true',
      hide_airdrop: 'true',
    },
    ...(args.signal ? { signal: args.signal } : {}),
  });
}

// -- trade / quote / swap / sell --------------------------------------------

export interface QuoteArgs {
  chain: Chain;
  fromAddress: string;
  outputToken: string;
  inputToken?: string;
  inputAmountWei: string;
  slippage?: number; // 0.08 = 8%
}

export function quote(client: GmgnClient, a: QuoteArgs): Promise<QuoteResult> {
  return client.call({
    method: 'GET',
    subPath: '/v1/trade/quote',
    critical: true,
    query: {
      chain: chainParam(a.chain),
      from_address: a.fromAddress,
      input_token: a.inputToken ?? NATIVE_INPUT_TOKEN[a.chain],
      output_token: a.outputToken,
      input_amount: a.inputAmountWei,
      slippage: a.slippage ?? 0.05,
    },
  });
}

export interface ConditionOrder {
  order_type: 'profit_stop' | 'loss_stop' | 'profit_stop_trace' | 'loss_stop_trace';
  side: 'sell';
  price_scale?: string;
  sell_ratio?: string;
  drawdown_rate?: string;
}

export interface SwapArgs {
  chain: Chain;
  fromAddress: string;
  outputToken: string;
  inputToken?: string;
  inputAmountWei: string;
  slippage?: number;
  antiMev: boolean;
  gasPriceGwei?: number;
  maxFeePerGasGwei?: number;
  maxPriorityFeePerGasGwei?: number;
  autoSlippage?: boolean;
  conditionOrders?: ConditionOrder[];
}

export function swap(client: GmgnClient, a: SwapArgs): Promise<SwapResult> {
  const body: Record<string, unknown> = {
    chain: chainParam(a.chain),
    from_address: a.fromAddress,
    input_token: a.inputToken ?? NATIVE_INPUT_TOKEN[a.chain],
    output_token: a.outputToken,
    input_amount: a.inputAmountWei,
    slippage: a.slippage ?? 0.08,
    is_anti_mev: a.antiMev,
  };
  if (a.autoSlippage) {
    body.auto_slippage = true;
    delete body.slippage;
  }
  if (a.gasPriceGwei !== undefined) body.gas_price = String(a.gasPriceGwei);
  if (a.maxFeePerGasGwei !== undefined) body.max_fee_per_gas = String(a.maxFeePerGasGwei);
  if (a.maxPriorityFeePerGasGwei !== undefined)
    body.max_priority_fee_per_gas = String(a.maxPriorityFeePerGasGwei);
  if (a.conditionOrders?.length) body.condition_orders = a.conditionOrders;

  return client.call({ method: 'POST', subPath: '/v1/trade/swap', critical: true, body });
}

export interface SellArgs {
  chain: Chain;
  fromAddress: string;
  inputToken: string;
  outputToken?: string;
  slippage?: number;
  antiMev: boolean;
  /** Sell percentage of held balance (1-100). Mutually exclusive with rawAmountWei. */
  percent?: number;
  rawAmountWei?: string;
  conditionOrders?: ConditionOrder[];
}

export function sell(client: GmgnClient, a: SellArgs): Promise<SwapResult> {
  const body: Record<string, unknown> = {
    chain: chainParam(a.chain),
    from_address: a.fromAddress,
    input_token: a.inputToken,
    output_token: a.outputToken ?? NATIVE_INPUT_TOKEN[a.chain],
    slippage: a.slippage ?? 0.08,
    is_anti_mev: a.antiMev,
  };
  if (a.percent !== undefined) {
    body.input_amount = '0';
    body.input_amount_bps = String(Math.round(a.percent * 100));
  } else if (a.rawAmountWei !== undefined) {
    body.input_amount = a.rawAmountWei;
  } else {
    throw new Error('sell(): percent or rawAmountWei required');
  }
  if (a.conditionOrders?.length) body.condition_orders = a.conditionOrders;

  return client.call({ method: 'POST', subPath: '/v1/trade/swap', critical: true, body });
}

export interface MultiSwapWalletEntry {
  walletAddress: string;
  inputAmountWei?: string;
  inputAmountBps?: number; // 1..10000
}

export interface MultiSwapArgs extends Omit<SwapArgs, 'fromAddress'> {
  wallets: MultiSwapWalletEntry[];
}

export function multiSwap(client: GmgnClient, a: MultiSwapArgs): Promise<SwapResult> {
  const inputAmounts: Record<string, string> = {};
  const inputAmountBps: Record<string, string> = {};
  for (const w of a.wallets) {
    if (w.inputAmountWei) inputAmounts[w.walletAddress] = w.inputAmountWei;
    if (w.inputAmountBps !== undefined)
      inputAmountBps[w.walletAddress] = String(w.inputAmountBps);
  }
  const body: Record<string, unknown> = {
    chain: chainParam(a.chain),
    input_token: a.inputToken ?? NATIVE_INPUT_TOKEN[a.chain],
    output_token: a.outputToken,
    slippage: a.slippage ?? 0.08,
    is_anti_mev: a.antiMev,
  };
  if (Object.keys(inputAmounts).length) body.input_amounts = inputAmounts;
  if (Object.keys(inputAmountBps).length) body.input_amount_bps = inputAmountBps;
  if (a.conditionOrders?.length) body.condition_orders = a.conditionOrders;

  return client.call({ method: 'POST', subPath: '/v1/trade/multi_swap', critical: true, body });
}

// -- order / strategy -------------------------------------------------------

export function queryOrder(
  client: GmgnClient,
  args: { chain: Chain; orderId: string },
): Promise<OrderStatus> {
  return client.call({
    method: 'GET',
    subPath: '/v1/trade/query_order',
    critical: true,
    query: { chain: chainParam(args.chain), order_id: args.orderId },
  });
}

export function strategyList(
  client: GmgnClient,
  args: {
    chain: Chain;
    fromAddress: string;
    type?: 'open' | 'history';
    groupTag?: 'LimitOrder' | 'STMix';
  },
): Promise<{ list?: StrategyOrder[] }> {
  return client.call({
    method: 'GET',
    subPath: '/v1/trade/strategy/orders',
    critical: true,
    query: {
      chain: chainParam(args.chain),
      from_address: args.fromAddress,
      type: args.type ?? 'open',
      group_tag: args.groupTag ?? 'STMix',
    },
  });
}

// -- market -----------------------------------------------------------------

export function kline(
  client: GmgnClient,
  args: { chain: Chain; token: string; resolution?: string; from?: number; to?: number },
): Promise<{ list?: KlineBar[] }> {
  const q: Record<string, string | number> = {
    chain: chainParam(args.chain),
    address: args.token,
    resolution: args.resolution ?? '5m',
  };
  if (args.from !== undefined) q.from = args.from;
  if (args.to !== undefined) q.to = args.to;
  return client.call({ method: 'GET', subPath: '/v1/market/token_kline', query: q });
}

// Endpoint paths now follow the CANONICAL gmgn-cli skill table
// (.claude/skills/gmgn-{token,market,track}/SKILL.md). Earlier versions
// fabricated `/defi/quotation/v1/...` paths from misremembered GMGN docs —
// those routes don't exist on openapi.gmgn.ai and Cloudflare's WAF returns
// a 403 with a "Just a moment..." HTML challenge page (root cause of the
// user's "Fetch failed: ... HTTP 403" bug in 0.1.1). Use this file as the
// source of truth and reference SKILL.md when adding endpoints.

export function trending(
  client: GmgnClient,
  args: { chain: Chain; interval?: '1m' | '5m' | '1h' | '6h' | '24h' },
): Promise<{ rank?: unknown[] }> {
  // Param is `interval` per skill (--interval). Previous code sent `time`
  // which GMGN silently ignored — caused empty results.
  return client.call({
    method: 'GET',
    subPath: '/v1/market/rank',
    query: { chain: chainParam(args.chain), interval: args.interval ?? '1h' },
  });
}

export interface TrenchesArgs {
  chain: Chain;
  /** Categories to query. Default = all three when omitted. */
  type?: ('new_creation' | 'near_completion' | 'completed')[];
  /** Launchpad platform filter (pump.fun / letsbonk / etc.). */
  launchpadPlatform?: string[];
  /** Max per category, max 80. Default 80. */
  limit?: number;
  /** Server-side filter preset. */
  filterPreset?: 'safe' | 'smart-money' | 'strict';
  /** Sort field. */
  sortBy?:
    | 'smart_degen_count'
    | 'renowned_count'
    | 'volume_24h'
    | 'volume_1h'
    | 'swaps_24h'
    | 'swaps_1h'
    | 'rug_ratio'
    | 'holder_count'
    | 'usd_market_cap'
    | 'created_timestamp';
  direction?: 'asc' | 'desc';
}

export function trenches(client: GmgnClient, args: TrenchesArgs): Promise<unknown> {
  // POST per skill table — body shape matches the official gmgn-cli flags.
  const body: Record<string, unknown> = { chain: chainParam(args.chain) };
  if (args.type?.length) body.type = args.type;
  if (args.launchpadPlatform?.length) body.launchpad_platform = args.launchpadPlatform;
  if (args.limit !== undefined) body.limit = args.limit;
  if (args.filterPreset) body.filter_preset = args.filterPreset;
  if (args.sortBy) body.sort_by = args.sortBy;
  if (args.direction) body.direction = args.direction;
  return client.call({
    method: 'POST',
    subPath: '/v1/trenches',
    body,
  });
}

// -- token info / security / pool -------------------------------------------

export function tokenInfo(
  client: GmgnClient,
  args: { chain: Chain; token: string; signal?: AbortSignal },
): Promise<TokenInfo> {
  return client.call({
    method: 'GET',
    subPath: '/v1/token/info',
    query: { chain: chainParam(args.chain), address: args.token },
    ...(args.signal ? { signal: args.signal } : {}),
  });
}

export function tokenSecurity(
  client: GmgnClient,
  args: { chain: Chain; token: string; signal?: AbortSignal },
): Promise<TokenSecurity> {
  return client.call({
    method: 'GET',
    subPath: '/v1/token/security',
    query: { chain: chainParam(args.chain), address: args.token },
    ...(args.signal ? { signal: args.signal } : {}),
  });
}

export function poolInfo(
  client: GmgnClient,
  args: { chain: Chain; token: string; signal?: AbortSignal },
): Promise<PoolInfo> {
  return client.call({
    method: 'GET',
    subPath: '/v1/token/pool_info',
    query: { chain: chainParam(args.chain), address: args.token },
    ...(args.signal ? { signal: args.signal } : {}),
  });
}

export type HolderTag =
  | 'smart_degen'
  | 'renowned'
  | 'fresh_wallet'
  | 'dev'
  | 'sniper'
  | 'rat_trader'
  | 'bundler'
  | 'transfer_in'
  | 'dex_bot'
  | 'bluechip_owner';

export function topHolders(
  client: GmgnClient,
  args: {
    chain: Chain;
    token: string;
    limit?: number;
    orderBy?: string;
    direction?: 'asc' | 'desc';
    tag?: HolderTag;
  },
): Promise<{ list?: unknown[] }> {
  // Skill defaults: limit=20, order_by=amount_percentage, direction=desc.
  const q: Record<string, string | number> = {
    chain: chainParam(args.chain),
    address: args.token,
    limit: args.limit ?? 20,
    order_by: args.orderBy ?? 'amount_percentage',
    direction: args.direction ?? 'desc',
  };
  if (args.tag) q.tag = args.tag;
  return client.call({ method: 'GET', subPath: '/v1/market/token_top_holders', query: q });
}

export function topTraders(
  client: GmgnClient,
  args: {
    chain: Chain;
    token: string;
    limit?: number;
    orderBy?: string;
    direction?: 'asc' | 'desc';
    tag?: HolderTag;
  },
): Promise<{ list?: unknown[] }> {
  const q: Record<string, string | number> = {
    chain: chainParam(args.chain),
    address: args.token,
    limit: args.limit ?? 20,
    order_by: args.orderBy ?? 'amount_percentage',
    direction: args.direction ?? 'desc',
  };
  if (args.tag) q.tag = args.tag;
  return client.call({ method: 'GET', subPath: '/v1/market/token_top_traders', query: q });
}

// -- tracking ---------------------------------------------------------------

export function smartMoneyTrades(
  client: GmgnClient,
  args: {
    chain: Chain;
    /** Filter trades by side (buy/sell). Omit for both. */
    side?: 'buy' | 'sell';
    /** Page size 1-100, default 10 per skill. */
    limit?: number;
    /** Optional wallet filter. */
    wallet?: string;
  },
): Promise<{ list?: unknown[] }> {
  // Skill says params are --chain, --side, --limit, --wallet. The previous
  // `time` param doesn't exist in the docs and was being silently dropped
  // by the GMGN router — causing empty / stale results.
  const q: Record<string, string | number> = {
    chain: chainParam(args.chain),
    limit: args.limit ?? 10,
  };
  if (args.side) q.side = args.side;
  if (args.wallet) q.wallet = args.wallet;
  return client.call({ method: 'GET', subPath: '/v1/user/smartmoney', query: q });
}

export function kolTrades(
  client: GmgnClient,
  args: {
    chain: Chain;
    side?: 'buy' | 'sell';
    limit?: number;
    wallet?: string;
  },
): Promise<{ list?: unknown[] }> {
  const q: Record<string, string | number> = {
    chain: chainParam(args.chain),
    limit: args.limit ?? 10,
  };
  if (args.side) q.side = args.side;
  if (args.wallet) q.wallet = args.wallet;
  return client.call({ method: 'GET', subPath: '/v1/user/kol', query: q });
}
