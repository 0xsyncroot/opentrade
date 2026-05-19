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
import { findWorkspaceRoot } from '../../config/paths.js';

export type OpentradeConfig = CanonicalOpentradeConfig;

/**
 * If running inside a parent `auto-trading/` workspace (dev convenience),
 * return its detected key/env paths. Returns nothing otherwise — end-user
 * installs from npm never see these.
 *
 * IMPORTANT: do NOT hardcode `/root/develop/...` — that path only exists on
 * the original developer's machine. Detection is via `findWorkspaceRoot()`
 * which walks up from cwd looking for a directory literally named
 * `auto-trading/` containing `secrets/` or `bin/`.
 */
function workspaceFallbackPaths(): { pem?: string; envFile?: string } {
  const ws = findWorkspaceRoot();
  if (!ws) return {};
  const pem = path.join(ws, 'secrets', 'gmgn_ed25519.pem');
  const envFile = path.join(ws, '.env');
  return {
    ...(existsFile(pem) ? { pem } : {}),
    ...(existsFile(envFile) ? { envFile } : {}),
  };
}

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
  // Dev fallback — detected at runtime, ONLY when running inside an
  // auto-trading workspace tree. End users never see this.
  const ws = workspaceFallbackPaths();
  if (ws.pem) candidates.push(ws.pem);

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
/** Best-effort key=value extractor for the dev-fallback .env file. */
function readEnvVar(envPath: string, key: string): string | undefined {
  try {
    const txt = readFileSync(envPath, 'utf8');
    const m = txt.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m && m[1] ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

export function resolveApiKey(cfg: OpentradeConfig | undefined): string | undefined {
  if (cfg?.gmgn?.apiKey) return cfg.gmgn.apiKey;
  if (process.env.GMGN_API_KEY) return process.env.GMGN_API_KEY;
  // Dev fallback — detected workspace .env, not a hardcoded path.
  const ws = workspaceFallbackPaths();
  if (ws.envFile) {
    const v = readEnvVar(ws.envFile, 'GMGN_API_KEY');
    if (v) return v;
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
  // Dev fallback — detected workspace .env, not a hardcoded path.
  const ws = workspaceFallbackPaths();
  if (ws.envFile) {
    const v = readEnvVar(ws.envFile, 'GMGN_WALLET_ADDRESS');
    if (v) return v;
  }
  return undefined;
}
