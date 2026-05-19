// Helpers shared by all subcommands: client construction, dispatcher context,
// flag parsers, common error/exit conventions.

import { GmgnClient } from '@hiepht/opentrade-core/gmgn';
import type { DispatcherContext } from '@hiepht/opentrade-core/actions';
import type { Chain } from '@hiepht/opentrade-core/chains';
import { loadConfig, type LoadedConfig } from '../config/load.js';
import { makeRecorder } from '../audit/trade-log.js';
import { color, log } from '../render/cli-renderer.js';

export interface SharedCtx {
  loaded: LoadedConfig;
  client: GmgnClient;
  dispatcherCtx: DispatcherContext;
}

export async function bootstrap(): Promise<SharedCtx> {
  const loaded = await loadConfig();
  if (!loaded.apiKey) {
    log.error(
      `${color.yellow('!')} No GMGN_API_KEY configured. Run \`opentrade init\` or set it in ~/.config/opentrade/config.json.`,
    );
    process.exit(2);
  }
  const client = new GmgnClient({
    apiKey: loaded.apiKey,
    ...(loaded.privateKeyPem ? { privateKeyPem: loaded.privateKeyPem } : {}),
    ...(loaded.config.gmgn.privateKeyPassphrase
      ? { privateKeyPassphrase: loaded.config.gmgn.privateKeyPassphrase }
      : {}),
    defaultChain: loaded.config.defaultChain,
    verbose: Boolean(process.env.OPENTRADE_VERBOSE),
  });
  const dispatcherCtx: DispatcherContext = {
    client,
    wallets: loaded.config.wallets as Partial<Record<Chain, string>>,
    recordTrade: makeRecorder({ paths: loaded.paths }),
  };
  return { loaded, client, dispatcherCtx };
}

/**
 * Lighter bootstrap — loads + parses config without requiring an API key
 * or constructing a GMGN client. Used by commands that only manipulate
 * config / files (`config`, `ab`, `alias`) so a fresh user can run
 * `opentrade config set gmgn.apiKey ...` BEFORE they've run `init`
 * (round-4 P1 fix — chicken-and-egg with the dashboard onboarding flow
 * keygen prints).
 */
export async function bootstrapLight(): Promise<{ loaded: Awaited<ReturnType<typeof loadConfig>> }> {
  const loaded = await loadConfig();
  return { loaded };
}

export function parseChainArg(s: string | undefined, fallback: Chain): Chain {
  const v = s?.toLowerCase() as Chain | undefined;
  if (v === 'base' || v === 'sol' || v === 'eth' || v === 'bsc') return v;
  return fallback;
}

export function flag(args: Record<string, unknown>, key: string): boolean {
  const v = args[key];
  return v === true || v === 'true';
}

export function strFlag(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.length ? v : undefined;
}

export function intFlag(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function exitWithError(msg: string, code = 1): never {
  log.error(color.red(msg));
  process.exit(code);
}
