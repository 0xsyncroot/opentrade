// GMGN API response shapes — kept loose since GMGN returns flat objects with
// optional/inconsistent fields. We narrow at the service layer (zod) and don't
// over-constrain at the wire layer.

export interface GmgnEnvelope<T = unknown> {
  code: number;
  reason?: string;
  message?: string;
  data: T;
}

export interface TokenInfo {
  chain: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price: string | number;
  price_change_percent24h?: number;
  market_cap?: number | string;
  fdv?: number | string;
  liquidity?: number | string;
  total_supply?: number | string;
  holder_count?: number;
  pool_type?: string; // 'uniswap_v2' | 'uniswap_v3' | 'uniswap_v4' | 'aerodrome' | 'raydium' | ...
  pool_address?: string;
  [k: string]: unknown;
}

export interface TokenSecurity {
  address: string;
  is_honeypot?: number | string; // 0/1
  is_blacklist?: number | string;
  rug_ratio?: number;
  top_10_holder_rate?: number;
  buy_tax?: string | number;
  sell_tax?: string | number;
  renounced?: number | string;
  open_source?: number | string;
  creator_token_status?: string;
  is_wash_trading?: boolean;
  sniper_count?: number;
  bot_degen_rate?: number;
  dev_team_hold_rate?: number;
  [k: string]: unknown;
}

export interface PoolInfo {
  address: string;
  exchange?: string; // uniswap_v4 | aerodrome | pancakeswap_v3 | ...
  version?: string;
  base_token_address?: string;
  quote_token_address?: string;
  [k: string]: unknown;
}

export interface Holding {
  token_address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // wei
  usd_value: number;
  price: number;
  buy_avg_price?: number;
  pnl?: number; // unrealized usd
  pnl_percent?: number;
  total_cost?: number;
  [k: string]: unknown;
}

export interface QuoteResult {
  input_token: string;
  output_token: string;
  input_amount: string;
  output_amount: string; // expected wei
  output_amount_min?: string;
  price_impact?: number;
  route?: unknown;
  [k: string]: unknown;
}

export interface SwapResult {
  order_id?: string;
  tx_hash?: string;
  status?: string;
  pool_type?: string;
  [k: string]: unknown;
}

export interface OrderStatus {
  order_id: string;
  status: string; // 'pending' | 'processed' | 'confirmed' | 'failed' | 'expired'
  tx_hash?: string;
  input_amount?: string;
  output_amount?: string;
  error?: string;
  [k: string]: unknown;
}

export interface StrategyOrder {
  id: string | number;
  group_tag?: string;
  order_type?: string;
  side?: string;
  status?: string;
  trigger_price?: string;
  [k: string]: unknown;
}

export interface KlineBar {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}
