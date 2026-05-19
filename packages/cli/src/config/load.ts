// Load (and lazily migrate) ~/.config/opentrade/* files. Also handles the
// fallback merge against an auto-trading workspace .env / secrets dir so a dev
// can drop into this CLI without re-running `opentrade init`.

import fs from 'node:fs';
import path from 'node:path';
import { cosmiconfig } from 'cosmiconfig';
import {
  AddressBookFileSchema,
  AliasesFileSchema,
  ConfigSchema,
  HistoryFileSchema,
  type AddressBookFile,
  type AliasesFile,
  type HistoryFile,
  type OpentradeConfig,
} from './schema.js';
import { ensureDir, resolvePaths, type OpentradePaths } from './paths.js';

export interface LoadedConfig {
  paths: OpentradePaths;
  config: OpentradeConfig;
  /** Resolved API key (config OR env). undefined when not yet configured. */
  apiKey: string | undefined;
  /** Resolved private key PEM contents (config OR workspace fallback). */
  privateKeyPem: string | undefined;
  privateKeyPath: string | undefined;
  /** True if private key file is encrypted (raw heuristic). */
  privateKeyEncrypted: boolean;
}

const explorer = cosmiconfig('opentrade', {
  searchPlaces: [
    'opentrade.config.json',
    '.opentraderc',
    '.opentraderc.json',
    '.opentraderc.yaml',
    '.opentraderc.yml',
  ],
});

function safeReadJson(file: string): unknown | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function parseDotenv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  const raw = fs.readFileSync(file, 'utf8');
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

export async function loadConfig(opts: { homeOverride?: string; cwd?: string } = {}): Promise<LoadedConfig> {
  const paths = resolvePaths(opts);

  // Primary config.json
  const raw = safeReadJson(paths.configFile);
  const parsed = ConfigSchema.safeParse(raw ?? {});
  let config: OpentradeConfig = parsed.success ? parsed.data : ConfigSchema.parse({});

  // cosmiconfig project-local override (.opentraderc.json in CWD chain)
  try {
    const local = await explorer.search(opts.cwd ?? process.cwd());
    if (local?.config) {
      const merged = ConfigSchema.safeParse({ ...config, ...(local.config as object) });
      if (merged.success) config = merged.data;
    }
  } catch {
    /* ignore explorer errors */
  }

  // Env fallback — .env in workspace, or process.env.
  const envSources: Record<string, string> = {};
  if (paths.legacyEnvFile) Object.assign(envSources, parseDotenv(paths.legacyEnvFile));
  for (const k of ['GMGN_API_KEY', 'GMGN_WALLET_ADDRESS', 'GMGN_ED25519_PRIVATE_KEY_PATH']) {
    if (process.env[k]) envSources[k] = process.env[k]!;
  }

  // Resolve API key: config overrides env, then env fallback.
  const apiKey = config.gmgn.apiKey || envSources.GMGN_API_KEY || undefined;

  // Resolve private key location.
  let privateKeyPath: string | undefined;
  const explicit = config.gmgn.privateKeyPath;
  if (explicit && fs.existsSync(explicit)) {
    privateKeyPath = explicit;
  } else if (fs.existsSync(paths.edPrivPem)) {
    privateKeyPath = paths.edPrivPem;
  } else if (envSources.GMGN_ED25519_PRIVATE_KEY_PATH && fs.existsSync(envSources.GMGN_ED25519_PRIVATE_KEY_PATH)) {
    privateKeyPath = envSources.GMGN_ED25519_PRIVATE_KEY_PATH;
  } else if (paths.legacyEdPrivPem) {
    privateKeyPath = paths.legacyEdPrivPem;
  }

  let privateKeyPem: string | undefined;
  let privateKeyEncrypted = false;
  if (privateKeyPath) {
    try {
      privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
      privateKeyEncrypted = privateKeyPem.includes('ENCRYPTED');
    } catch {
      privateKeyPem = undefined;
    }
  }

  // Resolve wallet from env if not in config and base default missing
  if (envSources.GMGN_WALLET_ADDRESS && !config.wallets[config.defaultChain]) {
    config.wallets = { ...config.wallets, [config.defaultChain]: envSources.GMGN_WALLET_ADDRESS };
  }

  return {
    paths,
    config,
    apiKey,
    privateKeyPem,
    privateKeyPath,
    privateKeyEncrypted,
  };
}

export function writeConfig(paths: OpentradePaths, cfg: OpentradeConfig): void {
  ensureDir(paths.configDir, 0o700);
  fs.writeFileSync(paths.configFile, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(paths.configFile, 0o600);
  } catch {
    /* best effort */
  }
}

// -- aliases / address-book / history helpers -------------------------------

export function readAddressBook(paths: OpentradePaths): AddressBookFile {
  const raw = safeReadJson(paths.addressBookFile);
  const parsed = AddressBookFileSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : AddressBookFileSchema.parse({});
}

export function writeAddressBook(paths: OpentradePaths, file: AddressBookFile): void {
  ensureDir(paths.configDir, 0o700);
  fs.writeFileSync(paths.addressBookFile, JSON.stringify(file, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(paths.addressBookFile, 0o600);
  } catch {
    /* */
  }
}

export function readAliases(paths: OpentradePaths): AliasesFile {
  const raw = safeReadJson(paths.aliasesFile);
  const parsed = AliasesFileSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : AliasesFileSchema.parse({});
}

export function writeAliases(paths: OpentradePaths, file: AliasesFile): void {
  ensureDir(paths.configDir, 0o700);
  fs.writeFileSync(paths.aliasesFile, JSON.stringify(file, null, 2), { mode: 0o600 });
}

export function readHistory(paths: OpentradePaths): HistoryFile {
  const raw = safeReadJson(paths.historyFile);
  const parsed = HistoryFileSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : HistoryFileSchema.parse({});
}

export function writeHistory(paths: OpentradePaths, file: HistoryFile): void {
  ensureDir(paths.configDir, 0o700);
  fs.writeFileSync(paths.historyFile, JSON.stringify(file, null, 2));
}

export function appendRecentAddress(paths: OpentradePaths, addr: string): void {
  const h = readHistory(paths);
  const next = [addr, ...h.recent.filter((a) => a !== addr)].slice(0, 20);
  writeHistory(paths, { ...h, recent: next });
}

// Re-export path helpers for callers.
export { resolvePaths, ensureDir, type OpentradePaths } from './paths.js';
export {
  ConfigSchema,
  AddressBookFileSchema,
  AliasesFileSchema,
  HistoryFileSchema,
  type OpentradeConfig,
  type AddressBookFile,
  type AliasesFile,
  type HistoryFile,
  type AddressBookEntry,
  type Alias,
} from './schema.js';
