// Per-chain default presets. User can override via ~/.config/opentrade/presets.json.
// Buy presets are native-amount decimals; sell presets are integer percent (1-100).

import type { Chain } from '../chains/index.js';

export type ChainPreset = {
  buyAmounts: [number, number, number, number]; // 4 quick-buy buttons
  sellPercents: [number, number, number, number]; // 4 quick-sell buttons
  slippageBps: number; // default slippage in basis points (100 = 1%)
  antiMev: 'on' | 'off' | 'auto';
  minSizeUsdWarn: number;
  gasTier: 'low' | 'medium' | 'high';
};

export const DEFAULT_PRESETS: Record<Chain, ChainPreset> = {
  base: {
    buyAmounts: [0.01, 0.03, 0.05, 0.1],
    sellPercents: [25, 50, 75, 100],
    slippageBps: 800, // 8%
    antiMev: 'auto', // auto-flip OFF for Uniswap V4 pools
    minSizeUsdWarn: 0.5,
    gasTier: 'medium',
  },
  sol: {
    buyAmounts: [0.1, 0.3, 0.5, 1],
    sellPercents: [25, 50, 75, 100],
    slippageBps: 2500, // 25% (meme defaults)
    antiMev: 'on', // Jito ON
    minSizeUsdWarn: 1,
    gasTier: 'medium',
  },
  eth: {
    buyAmounts: [0.01, 0.05, 0.1, 0.5],
    sellPercents: [25, 50, 75, 100],
    slippageBps: 500, // 5%
    antiMev: 'on', // Flashbots ON
    minSizeUsdWarn: 100, // ETH gas floor warning
    gasTier: 'medium',
  },
  bsc: {
    buyAmounts: [0.05, 0.1, 0.5, 1],
    sellPercents: [25, 50, 75, 100],
    slippageBps: 1200, // 12%
    antiMev: 'off',
    minSizeUsdWarn: 1,
    gasTier: 'medium',
  },
};

export function presetForChain(chain: Chain, override?: Partial<ChainPreset>): ChainPreset {
  const base = DEFAULT_PRESETS[chain];
  return override ? { ...base, ...override } : base;
}
