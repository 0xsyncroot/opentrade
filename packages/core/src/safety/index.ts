// Token security gates + V4 pool detection.
// Source of truth: auto-trading/CLAUDE.md "Hard discipline" + v4_failure_root_cause.md.

import { UNI_V4_POOLMANAGER_BASE, type Chain } from '../chains/index.js';
import type { PoolInfo, TokenSecurity } from '../gmgn/types.js';
import type { SafetyGate } from '../schemas/index.js';

export interface SafetyVerdict {
  /** true → block trade outright (honeypot/blacklist/rug/extreme concentration). */
  block: boolean;
  /** true → allow but require user-typed-symbol confirm. */
  warn: boolean;
  gates: SafetyGate[];
  reasons: string[];
}

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const isTruthyFlag = (v: unknown): boolean => {
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '' && v !== '0' && v.toLowerCase() !== 'no' && v.toLowerCase() !== 'false';
  if (typeof v === 'boolean') return v;
  return false;
};

const HONEYPOT_KEY = 'honeypot';
const RUG_KEY = 'rug';
const TOP10_KEY = 'top10';
const BUY_TAX_KEY = 'buy_tax';
const SELL_TAX_KEY = 'sell_tax';
const RENOUNCED_KEY = 'renounced';
const OPEN_SRC_KEY = 'open_source';
const WASH_KEY = 'wash_trading';

export function evaluateSecurity(
  security: TokenSecurity | undefined,
  poolInfo?: PoolInfo | undefined,
): SafetyVerdict {
  const gates: SafetyGate[] = [];
  const reasons: string[] = [];
  let block = false;
  let warn = false;

  // Honeypot — hard block
  const isHoneypot = isTruthyFlag(security?.is_honeypot);
  gates.push({
    key: HONEYPOT_KEY,
    label: 'Honeypot',
    value: isHoneypot ? 'YES' : 'no',
    level: isHoneypot ? 'block' : 'ok',
  });
  if (isHoneypot) {
    block = true;
    reasons.push('is_honeypot=1');
  }

  // Blacklist — hard block
  if (isTruthyFlag(security?.is_blacklist)) {
    block = true;
    reasons.push('is_blacklist=1');
    gates.push({ key: 'blacklist', label: 'Blacklist', value: 'YES', level: 'block' });
  }

  // Rug ratio — block > 0.30
  const rug = toNum(security?.rug_ratio);
  gates.push({
    key: RUG_KEY,
    label: 'Rug ratio',
    value: rug.toFixed(2),
    level: rug > 0.3 ? 'block' : rug > 0.15 ? 'warn' : 'ok',
  });
  if (rug > 0.3) {
    block = true;
    reasons.push(`rug_ratio=${rug.toFixed(2)} > 0.30`);
  } else if (rug > 0.15) {
    warn = true;
  }

  // Top-10 holder rate — block > 0.55 (ex V4 PoolManager on Base)
  const top10Raw = toNum(security?.top_10_holder_rate);
  const isV4Base = (poolInfo?.exchange ?? '').toLowerCase().includes('uniswap_v4');
  // If V4 on Base, ~one of the top10 entries is the PoolManager; subtract a notional
  // 10% off the headline rate to approximate. (UI also surfaces an explanation.)
  const top10Adj = isV4Base ? Math.max(0, top10Raw - 0.1) : top10Raw;
  gates.push({
    key: TOP10_KEY,
    label: 'Top10',
    value: `${Math.round(top10Adj * 100)}%${isV4Base ? ' (V4 adj)' : ''}`,
    level: top10Adj > 0.55 ? 'block' : top10Adj > 0.4 ? 'warn' : 'ok',
  });
  if (top10Adj > 0.55) {
    block = true;
    reasons.push(`top_10_holder_rate=${top10Adj.toFixed(2)} > 0.55`);
  } else if (top10Adj > 0.4) {
    warn = true;
  }

  // Buy / sell tax — warn > 10%
  const buyTax = toNum(security?.buy_tax);
  const sellTax = toNum(security?.sell_tax);
  gates.push({
    key: BUY_TAX_KEY,
    label: 'Buy tax',
    value: `${Math.round(buyTax * 100)}%`,
    level: buyTax > 0.1 ? 'warn' : 'ok',
  });
  gates.push({
    key: SELL_TAX_KEY,
    label: 'Sell tax',
    value: `${Math.round(sellTax * 100)}%`,
    level: sellTax > 0.1 ? 'warn' : 'ok',
  });
  if (buyTax > 0.1) {
    warn = true;
    reasons.push(`buy_tax=${(buyTax * 100).toFixed(1)}% > 10%`);
  }
  if (sellTax > 0.1) {
    warn = true;
    reasons.push(`sell_tax=${(sellTax * 100).toFixed(1)}% > 10%`);
  }

  // Wash trading
  if (security?.is_wash_trading === true) {
    warn = true;
    reasons.push('is_wash_trading=true');
    gates.push({ key: WASH_KEY, label: 'Wash trading', value: 'detected', level: 'warn' });
  }

  // Informational
  if (security?.renounced !== undefined) {
    gates.push({
      key: RENOUNCED_KEY,
      label: 'Renounced',
      value: isTruthyFlag(security?.renounced) ? 'yes' : 'no',
      level: isTruthyFlag(security?.renounced) ? 'ok' : 'warn',
    });
    if (!isTruthyFlag(security?.renounced)) warn = true;
  }
  if (security?.open_source !== undefined) {
    gates.push({
      key: OPEN_SRC_KEY,
      label: 'Open source',
      value: isTruthyFlag(security?.open_source) ? 'yes' : 'no',
      level: isTruthyFlag(security?.open_source) ? 'ok' : 'warn',
    });
    if (!isTruthyFlag(security?.open_source)) warn = true;
  }

  return { block, warn, gates, reasons };
}

/**
 * Decide anti-MEV for the given pool. Uniswap V4 pools on Base MUST trade with
 * is_anti_mev=false (project-verified gotcha). Other EVM pools default to ON;
 * Solana has its own Jito layer handled elsewhere.
 */
export function shouldUseAntiMev(chain: Chain, poolInfo: PoolInfo | undefined): boolean {
  if (chain === 'sol') return true;
  const exchange = (poolInfo?.exchange ?? '').toLowerCase();
  if (exchange.includes('uniswap_v4')) return false;
  return true;
}

/** Quick sanity check: is `address` the Uniswap V4 pool manager on Base? */
export function isV4PoolManagerHolder(addr: string): boolean {
  return addr.toLowerCase() === UNI_V4_POOLMANAGER_BASE;
}

export { type SafetyGate } from '../schemas/index.js';
