// Service layer — bridges the raw GMGN endpoints with safety gates and pretty
// result objects. Both the CLI subcommands and the TUI/Telegram action dispatcher
// call these (never the raw client directly), so safety + tax + V4 detection
// live in one place.

import type { Chain } from '../chains/index.js';
import * as gmgn from '../gmgn/index.js';
import type { GmgnClient } from '../gmgn/index.js';
import type {
  Holding,
  PoolInfo,
  TokenInfo,
  TokenSecurity,
} from '../gmgn/types.js';
import { evaluateSecurity, shouldUseAntiMev, type SafetyVerdict } from '../safety/index.js';
import type { BuyIntent, SellIntent, SendIntent, TpSlTier } from '../schemas/index.js';

// -- Token snapshot (used by views) -----------------------------------------

export interface TokenSnapshot {
  token: TokenInfo;
  security: TokenSecurity | undefined;
  pool: PoolInfo | undefined;
  safety: SafetyVerdict;
  myHolding: Holding | undefined;
}

/**
 * Pull everything we need to render a token card in parallel: info, security,
 * pool, and the user's current holding (so we can auto-flip BUY/SELL mode).
 */
export async function fetchTokenSnapshot(
  client: GmgnClient,
  args: { chain: Chain; token: string; walletAddress: string; signal?: AbortSignal },
): Promise<TokenSnapshot> {
  // Run in parallel; any failure surfaces but doesn't tank the others.
  const [tokenRes, secRes, poolRes, holdingsRes] = await Promise.allSettled([
    gmgn.tokenInfo(client, { chain: args.chain, token: args.token }),
    gmgn.tokenSecurity(client, { chain: args.chain, token: args.token }),
    gmgn.poolInfo(client, { chain: args.chain, token: args.token }),
    gmgn.walletHoldings(client, { chain: args.chain, walletAddress: args.walletAddress, limit: 50 }),
  ]);

  if (tokenRes.status !== 'fulfilled') throw tokenRes.reason;
  const token = tokenRes.value;
  const security = secRes.status === 'fulfilled' ? secRes.value : undefined;
  const pool = poolRes.status === 'fulfilled' ? poolRes.value : undefined;
  const holdings = holdingsRes.status === 'fulfilled' ? holdingsRes.value : { holdings: [] };
  const list = holdings.holdings ?? holdings.list ?? [];
  const myHolding = list.find(
    (h) => h.token_address?.toLowerCase() === args.token.toLowerCase(),
  );

  const safety = evaluateSecurity(security, pool);
  return { token, security, pool, safety, myHolding };
}

// -- Buy / Sell -------------------------------------------------------------

export interface ExecuteResult {
  orderId?: string;
  txHash?: string;
  status: string;
  raw: unknown;
}

function buildConditionOrders(opts: {
  tp?: TpSlTier[];
  sl?: TpSlTier[];
  trailTpPct?: number;
  trailSlPct?: number;
}): gmgn.ConditionOrder[] {
  const co: gmgn.ConditionOrder[] = [];
  if (opts.tp) {
    for (const tier of opts.tp) {
      co.push({
        order_type: 'profit_stop',
        side: 'sell',
        price_scale: String(tier.pricePct),
        sell_ratio: String(tier.sellPct),
      });
    }
  }
  if (opts.sl) {
    for (const tier of opts.sl) {
      co.push({
        order_type: 'loss_stop',
        side: 'sell',
        price_scale: String(tier.pricePct),
        sell_ratio: String(tier.sellPct),
      });
    }
  }
  if (opts.trailTpPct !== undefined) {
    co.push({
      order_type: 'profit_stop_trace',
      side: 'sell',
      drawdown_rate: String(opts.trailTpPct),
    });
  }
  if (opts.trailSlPct !== undefined) {
    co.push({
      order_type: 'loss_stop_trace',
      side: 'sell',
      drawdown_rate: String(opts.trailSlPct),
    });
  }
  return co;
}

/**
 * Execute a BuyIntent end-to-end:
 *   - Detect pool version → resolve anti-MEV (auto → off for V4 on Base)
 *   - Build condition orders from tp/sl tiers
 *   - POST /v1/trade/swap
 */
export async function buyToken(
  client: GmgnClient,
  args: {
    intent: BuyIntent;
    walletAddress: string;
    pool?: PoolInfo | undefined;
  },
): Promise<ExecuteResult> {
  const { intent } = args;
  const antiMev =
    intent.antiMev === 'auto'
      ? shouldUseAntiMev(intent.chain, args.pool)
      : intent.antiMev === 'on';
  const conditionOrders = buildConditionOrders(intent);

  const res = await gmgn.swap(client, {
    chain: intent.chain,
    fromAddress: args.walletAddress,
    outputToken: intent.token,
    inputAmountWei: intent.amountWei,
    slippage: intent.slippageBps / 10_000,
    antiMev,
    ...(conditionOrders.length ? { conditionOrders } : {}),
  });

  return {
    ...(res.order_id !== undefined ? { orderId: res.order_id } : {}),
    ...(res.tx_hash !== undefined ? { txHash: res.tx_hash } : {}),
    status: res.status ?? 'submitted',
    raw: res,
  };
}

export async function sellToken(
  client: GmgnClient,
  args: { intent: SellIntent; walletAddress: string; pool?: PoolInfo | undefined },
): Promise<ExecuteResult> {
  const { intent } = args;
  const antiMev =
    intent.antiMev === 'auto'
      ? shouldUseAntiMev(intent.chain, args.pool)
      : intent.antiMev === 'on';

  const res = await gmgn.sell(client, {
    chain: intent.chain,
    fromAddress: args.walletAddress,
    inputToken: intent.token,
    percent: intent.percent,
    slippage: intent.slippageBps / 10_000,
    antiMev,
  });

  return {
    ...(res.order_id !== undefined ? { orderId: res.order_id } : {}),
    ...(res.tx_hash !== undefined ? { txHash: res.tx_hash } : {}),
    status: res.status ?? 'submitted',
    raw: res,
  };
}

// -- Send (same-chain native transfer) --------------------------------------
//
// GMGN does not provide a `/transfer` endpoint — `send` is a thin local wrapper
// over an RPC `sendTransaction` flow. For v1 we expose a placeholder service
// that returns a typed error pointing to the CLI implementation (which uses
// viem / @solana/web3.js depending on chain). Keeping the surface here keeps
// the dispatcher contract uniform.

export async function sendToken(_args: {
  intent: SendIntent;
  walletAddress: string;
}): Promise<ExecuteResult> {
  throw new Error(
    'sendToken: not yet implemented in core/. CLI `opentrade send` handles this directly via chain RPC.',
  );
}

// -- Holdings ---------------------------------------------------------------

export async function listHoldings(
  client: GmgnClient,
  args: { chain: Chain; walletAddress: string },
): Promise<Holding[]> {
  const res = await gmgn.walletHoldings(client, args);
  return res.holdings ?? res.list ?? [];
}
