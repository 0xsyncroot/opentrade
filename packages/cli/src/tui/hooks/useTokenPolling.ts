// Live polling driven by @tanstack/react-query.
//
// Three independent queries with different cadences (per plan §8 "Live update cadence"):
//   - token snapshot (kline + holdings together via fetchTokenSnapshot): 8s
//   - holdings list (positions screen / status bar): 10s
//   - native balance: 30s — currently sourced from `userInfo` (placeholder, since
//     GMGN doesn't expose a dedicated balance endpoint; we re-use snapshot.myHolding
//     for the active token).
//
// All queries pause while the user is actively typing (debounce 1s after last
// keystroke; the App owns that flag and writes it to the store).

import { services } from '@0xsyncroot/opentrade-core';
import type { GmgnClient } from '@0xsyncroot/opentrade-core/gmgn';
import type { Chain } from '@0xsyncroot/opentrade-core/chains';
import type { Holding } from '@0xsyncroot/opentrade-core/gmgn';
import type { TokenSnapshot } from '@0xsyncroot/opentrade-core/services';
import { useQuery } from '@tanstack/react-query';

const { fetchTokenSnapshot, listHoldings } = services;

export interface TokenPollingArgs {
  client: GmgnClient | undefined;
  chain: Chain;
  walletAddress: string;
  tokenAddress: string | undefined;
  /** Pause polling (typing / modal open). */
  paused?: boolean;
}

export function useTokenSnapshotQuery(args: TokenPollingArgs) {
  return useQuery<TokenSnapshot | undefined>({
    queryKey: ['snapshot', args.chain, args.tokenAddress, args.walletAddress],
    enabled: Boolean(args.client && args.tokenAddress && args.walletAddress && !args.paused),
    refetchInterval: args.paused ? false : 8_000,
    queryFn: async ({ signal }) => {
      if (!args.client || !args.tokenAddress) return undefined;
      return fetchTokenSnapshot(args.client, {
        chain: args.chain,
        token: args.tokenAddress,
        walletAddress: args.walletAddress,
        signal,
      });
    },
    staleTime: 5_000,
    retry: 1,
  });
}

export function useHoldingsQuery(args: {
  client: GmgnClient | undefined;
  chain: Chain;
  walletAddress: string;
  paused?: boolean;
  intervalMs?: number;
}) {
  return useQuery<Holding[]>({
    queryKey: ['holdings', args.chain, args.walletAddress],
    enabled: Boolean(args.client && args.walletAddress && !args.paused),
    refetchInterval: args.paused ? false : args.intervalMs ?? 10_000,
    queryFn: async () => {
      if (!args.client) return [];
      return listHoldings(args.client, { chain: args.chain, walletAddress: args.walletAddress });
    },
    staleTime: 5_000,
    retry: 1,
  });
}
