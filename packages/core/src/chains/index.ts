// Per-chain constants — native input token, default trade amount unit, decimals,
// explorer URL builders. Used by gmgn client to fill `chain` query param and by
// the safety / view layers to format values.

export type Chain = 'base' | 'sol' | 'eth' | 'bsc';
export const CHAINS: Chain[] = ['base', 'sol', 'eth', 'bsc'];

export const NATIVE_INPUT_TOKEN: Record<Chain, string> = {
  base: '0x0000000000000000000000000000000000000000',
  eth: '0x0000000000000000000000000000000000000000',
  bsc: '0x0000000000000000000000000000000000000000',
  sol: 'So11111111111111111111111111111111111111112',
};

export const NATIVE_SYMBOL: Record<Chain, string> = {
  base: 'ETH',
  eth: 'ETH',
  bsc: 'BNB',
  sol: 'SOL',
};

export const NATIVE_DECIMALS: Record<Chain, number> = {
  base: 18,
  eth: 18,
  bsc: 18,
  sol: 9,
};

export const EXPLORER_TX: Record<Chain, (hash: string) => string> = {
  base: (h) => `https://basescan.org/tx/${h}`,
  eth: (h) => `https://etherscan.io/tx/${h}`,
  bsc: (h) => `https://bscscan.com/tx/${h}`,
  sol: (h) => `https://solscan.io/tx/${h}`,
};

export const EXPLORER_ADDR: Record<Chain, (addr: string) => string> = {
  base: (a) => `https://basescan.org/address/${a}`,
  eth: (a) => `https://etherscan.io/address/${a}`,
  bsc: (a) => `https://bscscan.com/address/${a}`,
  sol: (a) => `https://solscan.io/account/${a}`,
};

export const EXPLORER_TOKEN: Record<Chain, (addr: string) => string> = {
  base: (a) => `https://basescan.org/token/${a}`,
  eth: (a) => `https://etherscan.io/token/${a}`,
  bsc: (a) => `https://bscscan.com/token/${a}`,
  sol: (a) => `https://solscan.io/token/${a}`,
};

/**
 * The Uniswap V4 PoolManager contract address on Base — appears as the top1
 * holder for every V4 pool token. Must be excluded when measuring real holder
 * concentration. See auto-trading/memory/agents/executor/v4_failure_root_cause.md.
 */
export const UNI_V4_POOLMANAGER_BASE = '0x498581ff718922c3f8e6a244956af099b2652b2b';

export function isEvmChain(c: Chain): boolean {
  return c === 'base' || c === 'eth' || c === 'bsc';
}

export function nativeAmountToWei(chain: Chain, amount: number): bigint {
  const decimals = NATIVE_DECIMALS[chain];
  // Use string multiplication to avoid float precision loss for small fractions.
  const [whole, frac = ''] = amount.toString().split('.');
  const wholePart = BigInt(whole ?? '0') * 10n ** BigInt(decimals);
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const fracPart = fracPadded ? BigInt(fracPadded) : 0n;
  return wholePart + fracPart;
}

export function weiToNative(chain: Chain, wei: bigint | string): number {
  const w = typeof wei === 'string' ? BigInt(wei) : wei;
  const decimals = NATIVE_DECIMALS[chain];
  const divisor = 10n ** BigInt(decimals);
  const whole = w / divisor;
  const frac = w % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 8);
  return Number(`${whole}.${fracStr}`);
}
