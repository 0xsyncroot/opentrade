// XDG config loader for the TUI.
//
// Reads ~/.config/opentrade/config.json. Falls back to env vars for the
// dev-shared `auto-trading/.env` path when running inside the parent workspace.
//
// Schema imported from `../config/schema.ts` so the TUI uses the canonical
// shape (P1-5 fix — eliminates the duplicate schema that stripped `disabled`
// and `deferred` fields, breaking opt-out persistence).

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  ConfigSchema,
  type OpentradeConfig as CanonicalOpentradeConfig,
} from '../../config/schema.js';

export type OpentradeConfig = CanonicalOpentradeConfig;

export function xdgConfigDir(): string {
  const x = process.env.XDG_CONFIG_HOME;
  if (x && x.length > 0) return path.join(x, 'opentrade');
  return path.join(homedir(), '.config', 'opentrade');
}

export function configFilePath(): string {
  return path.join(xdgConfigDir(), 'config.json');
}

export class ConfigError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = 'ConfigError';
    this.hint = hint;
  }
}

function existsFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Best-effort key path resolution. Order:
 *   1. config.gmgn.privateKeyPath (absolute or relative to XDG dir)
 *   2. $GMGN_ED25519_PRIVATE_KEY_PATH env var
 *   3. ~/.config/opentrade/secrets/ed25519.pem
 *   4. dev fallback: auto-trading/secrets/gmgn_ed25519.pem
 */
export function resolvePrivateKeyPath(cfg: OpentradeConfig | undefined): string | undefined {
  const candidates: (string | undefined)[] = [];
  if (cfg?.gmgn?.privateKeyPath) {
    const p = cfg.gmgn.privateKeyPath;
    candidates.push(path.isAbsolute(p) ? p : path.join(xdgConfigDir(), p));
  }
  if (process.env.GMGN_ED25519_PRIVATE_KEY_PATH) {
    candidates.push(process.env.GMGN_ED25519_PRIVATE_KEY_PATH);
  }
  candidates.push(path.join(xdgConfigDir(), 'secrets', 'ed25519.pem'));
  // dev fallback when running inside the parent auto-trading workspace
  candidates.push('/root/develop/auto-trading/secrets/gmgn_ed25519.pem');

  for (const c of candidates) {
    if (c && existsFile(c)) return c;
  }
  return undefined;
}

/**
 * Load and validate `~/.config/opentrade/config.json`. Throws ConfigError with
 * a friendly hint if missing.
 */
export function loadConfig(): OpentradeConfig {
  const file = configFilePath();
  if (!existsFile(file)) {
    throw new ConfigError(
      `opentrade config not found: ${file}`,
      'Run `opentrade init` to set up your API key, wallet, and chain defaults.',
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(
      `config at ${file} is not valid JSON: ${(err as Error).message}`,
      'Fix the JSON syntax or re-run `opentrade init` to regenerate.',
    );
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ConfigError(
      `config at ${file} failed schema validation:\n${issues}`,
      'Edit the file directly or re-run `opentrade init`.',
    );
  }
  return parsed.data;
}

/**
 * Pull GMGN API key from config, env, or parent .env (dev fallback).
 * Returns undefined if none found.
 */
export function resolveApiKey(cfg: OpentradeConfig | undefined): string | undefined {
  if (cfg?.gmgn?.apiKey) return cfg.gmgn.apiKey;
  if (process.env.GMGN_API_KEY) return process.env.GMGN_API_KEY;
  // dev fallback: parse parent .env quickly
  const envPath = '/root/develop/auto-trading/.env';
  if (existsFile(envPath)) {
    try {
      const txt = readFileSync(envPath, 'utf8');
      const m = txt.match(/^GMGN_API_KEY=(.+)$/m);
      if (m && m[1]) return m[1].trim();
    } catch {
      // ignore
    }
  }
  return undefined;
}

export function resolveWalletAddress(cfg: OpentradeConfig | undefined, chain: string): string | undefined {
  const w = cfg?.wallets as Record<string, string | undefined> | undefined;
  if (w?.[chain]) return w[chain];
  if (chain === 'base' || chain === 'eth' || chain === 'bsc') {
    if (process.env.GMGN_WALLET_ADDRESS) return process.env.GMGN_WALLET_ADDRESS;
  }
  if (chain === 'sol' && process.env.GMGN_WALLET_ADDRESS_SOL) {
    return process.env.GMGN_WALLET_ADDRESS_SOL;
  }
  // dev fallback parse
  const envPath = '/root/develop/auto-trading/.env';
  if (existsFile(envPath)) {
    try {
      const txt = readFileSync(envPath, 'utf8');
      const m = txt.match(/^GMGN_WALLET_ADDRESS=(.+)$/m);
      if (m && m[1]) return m[1].trim();
    } catch {
      // ignore
    }
  }
  return undefined;
}
