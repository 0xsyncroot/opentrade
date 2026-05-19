// XDG path resolution + workspace fallback detection.
//
// Primary store: ~/.config/opentrade/
// Dev fallback : <workspace-root>/auto-trading/secrets/* + .env when present.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface OpentradePaths {
  configDir: string;
  configFile: string;
  secretsDir: string;
  edPrivPem: string;
  edPubPem: string;
  aliasesFile: string;
  addressBookFile: string;
  presetsFile: string;
  historyFile: string;
  botPidFile: string;
  botLogFile: string;
  /** When running inside /root/develop/auto-trading/* — the workspace root. */
  workspaceRoot: string | undefined;
  /** Detected legacy Ed25519 PEM in the auto-trading workspace, if present. */
  legacyEdPrivPem: string | undefined;
  /** Detected legacy .env in the auto-trading workspace, if present. */
  legacyEnvFile: string | undefined;
}

export function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
}

/** Walk up from cwd looking for the parent `auto-trading/` repo. */
export function findWorkspaceRoot(start = process.cwd()): string | undefined {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    // Heuristic: dir name === 'auto-trading' AND has secrets/ or bin/ subdir
    if (
      path.basename(dir) === 'auto-trading' &&
      (fs.existsSync(path.join(dir, 'secrets')) || fs.existsSync(path.join(dir, 'bin')))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function resolvePaths(opts: { homeOverride?: string; cwd?: string } = {}): OpentradePaths {
  const home = opts.homeOverride ?? os.homedir();
  const xdg = process.env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config');
  const configDir = path.join(xdg, 'opentrade');
  const secretsDir = path.join(configDir, 'secrets');

  const workspace = findWorkspaceRoot(opts.cwd ?? process.cwd());

  let legacyEdPrivPem: string | undefined;
  let legacyEnvFile: string | undefined;
  if (workspace) {
    const candidatePem = path.join(workspace, 'secrets', 'gmgn_ed25519.pem');
    if (fs.existsSync(candidatePem)) legacyEdPrivPem = candidatePem;
    const candidateEnv = path.join(workspace, '.env');
    if (fs.existsSync(candidateEnv)) legacyEnvFile = candidateEnv;
  }

  return {
    configDir,
    configFile: path.join(configDir, 'config.json'),
    secretsDir,
    edPrivPem: path.join(secretsDir, 'ed25519.pem'),
    edPubPem: path.join(secretsDir, 'ed25519.pub'),
    aliasesFile: path.join(configDir, 'aliases.json'),
    addressBookFile: path.join(configDir, 'address-book.json'),
    presetsFile: path.join(configDir, 'presets.json'),
    historyFile: path.join(configDir, 'history.json'),
    botPidFile: path.join(configDir, 'bot.pid'),
    botLogFile: path.join(configDir, 'bot.log'),
    workspaceRoot: workspace,
    legacyEdPrivPem,
    legacyEnvFile,
  };
}

export function ensureDir(dir: string, mode = 0o700): void {
  fs.mkdirSync(dir, { recursive: true, mode });
  try {
    fs.chmodSync(dir, mode);
  } catch {
    /* fs without chmod */
  }
}
