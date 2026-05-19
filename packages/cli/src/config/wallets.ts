// Helpers for working with the per-chain wallet map.

import type { Chain } from '@hiepht/opentrade-core/chains';
import type { OpentradeConfig } from './schema.js';

export function walletFor(cfg: OpentradeConfig, chain: Chain): string | undefined {
  const map = cfg.wallets as Partial<Record<Chain, string>>;
  return map[chain];
}

export function requireWallet(cfg: OpentradeConfig, chain: Chain): string {
  const w = walletFor(cfg, chain);
  if (!w) {
    throw new Error(
      `no wallet configured for chain '${chain}'. Run \`opentrade init\` or \`opentrade config set wallets.${chain} <addr>\`.`,
    );
  }
  return w;
}
