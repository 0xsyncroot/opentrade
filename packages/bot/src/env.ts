// Environment / config loader for the Telegram bot.
//
// Single-owner whitelist design (plan §"Telegram bot UX"): the bot accepts
// commands only from `TELEGRAM_OWNER_CHAT_ID`. Everything else (api key,
// wallet, ed25519 PEM path) is shared with the rest of opentrade — we
// either pick it up from explicit env vars or from `~/.config/opentrade/`
// with a fallback to the parent `auto-trading/` workspace during dev.
//
// IMPORTANT: this loader reads the SAME `~/.config/opentrade/config.json`
// shape produced by the CLI's `config/schema.ts` (camelCase, nested), NOT
// the legacy snake_case top-level shape. Convergent fix P0-4.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export const BotEnvSchema = z.object({
  telegramBotToken: z.string().min(10, 'TELEGRAM_BOT_TOKEN missing'),
  telegramOwnerChatId: z
    .string()
    .regex(/^-?\d+$/, 'TELEGRAM_OWNER_CHAT_ID must be a numeric Telegram chat id'),
  botMode: z.enum(['polling', 'webhook']).default('polling'),
  botPort: z.number().int().positive().default(8080),
  // GMGN
  gmgnApiKey: z.string().min(8, 'GMGN_API_KEY missing'),
  gmgnPrivateKeyPath: z.string().optional(),
  gmgnPrivateKeyPem: z.string().optional(),
  gmgnPrivateKeyPassphrase: z.string().optional(),
  // Wallets per chain (only EVM addresses today; sol left empty for now)
  walletBase: z.string().optional(),
  walletEth: z.string().optional(),
  walletBsc: z.string().optional(),
  walletSol: z.string().optional(),
  defaultChain: z.enum(['base', 'sol', 'eth', 'bsc']).default('base'),
});

export type BotEnv = z.infer<typeof BotEnvSchema>;

/**
 * Mirror of the CLI's `OpentradeConfig` schema (canonical shape stored on
 * disk). Kept narrow + loose (passthrough) so we don't choke on extra fields
 * a newer CLI may write.
 */
const ConfigFileSchema = z
  .object({
    defaultChain: z.enum(['base', 'sol', 'eth', 'bsc']).optional(),
    gmgn: z
      .object({
        apiKey: z.string().optional(),
        privateKeyPath: z.string().optional(),
        privateKeyPassphrase: z.string().optional(),
      })
      .partial()
      .optional(),
    wallets: z
      .object({
        base: z.string().optional(),
        eth: z.string().optional(),
        bsc: z.string().optional(),
        sol: z.string().optional(),
      })
      .partial()
      .optional(),
    telegram: z
      .object({
        botToken: z.string().optional(),
        ownerChatId: z.union([z.string(), z.number()]).optional(),
        disabled: z.boolean().optional(),
        deferred: z.boolean().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

type ConfigFile = z.infer<typeof ConfigFileSchema>;

const CONFIG_HOME = path.join(os.homedir(), '.config', 'opentrade');
const AUTO_TRADING_ROOT = '/root/develop/auto-trading';

function tryReadConfigJson(): ConfigFile {
  const p = path.join(CONFIG_HOME, 'config.json');
  if (!fs.existsSync(p)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const parsed = ConfigFileSchema.safeParse(raw);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function resolveEd25519Path(explicit: string | undefined): string | undefined {
  if (explicit && fs.existsSync(explicit)) return explicit;
  const xdg = path.join(CONFIG_HOME, 'secrets', 'ed25519.pem');
  if (fs.existsSync(xdg)) return xdg;
  const fallback = path.join(AUTO_TRADING_ROOT, 'secrets', 'gmgn_ed25519.pem');
  if (fs.existsSync(fallback)) return fallback;
  return undefined;
}

export interface LoadEnvOptions {
  /** Optional override (used in tests). */
  env?: NodeJS.ProcessEnv;
  /** Optional override config (used in tests so we don't need to write disk). */
  configOverride?: ConfigFile;
}

export function loadBotEnv(opts: LoadEnvOptions = {}): BotEnv {
  const env = opts.env ?? process.env;
  const cfg = opts.configOverride ?? tryReadConfigJson();

  const pickFirst = (
    ...candidates: (string | number | undefined | null)[]
  ): string | undefined => {
    const found = candidates.find((v) => v !== undefined && v !== null && v !== '');
    return found === undefined ? undefined : String(found);
  };

  const keyPath = resolveEd25519Path(
    pickFirst(env.GMGN_ED25519_PRIVATE_KEY_PATH, cfg.gmgn?.privateKeyPath),
  );
  let pem: string | undefined;
  if (keyPath) {
    try {
      pem = fs.readFileSync(keyPath, 'utf8');
    } catch {
      // intentionally swallow — critical-tier calls will error loudly later
    }
  }

  const candidate: Record<string, unknown> = {
    telegramBotToken: pickFirst(env.TELEGRAM_BOT_TOKEN, cfg.telegram?.botToken),
    telegramOwnerChatId: pickFirst(env.TELEGRAM_OWNER_CHAT_ID, cfg.telegram?.ownerChatId),
    botMode: pickFirst(env.BOT_MODE, 'polling'),
    botPort: env.BOT_PORT ? Number(env.BOT_PORT) : 8080,
    gmgnApiKey: pickFirst(env.GMGN_API_KEY, cfg.gmgn?.apiKey),
    gmgnPrivateKeyPath: keyPath,
    gmgnPrivateKeyPem: pem,
    gmgnPrivateKeyPassphrase: pickFirst(
      env.GMGN_ED25519_PASSPHRASE,
      cfg.gmgn?.privateKeyPassphrase,
    ),
    walletBase: pickFirst(env.GMGN_WALLET_ADDRESS, env.WALLET_BASE, cfg.wallets?.base),
    walletEth: pickFirst(env.WALLET_ETH, cfg.wallets?.eth),
    walletBsc: pickFirst(env.WALLET_BSC, cfg.wallets?.bsc),
    walletSol: pickFirst(env.WALLET_SOL, cfg.wallets?.sol),
    defaultChain: pickFirst(env.OPENTRADE_DEFAULT_CHAIN, cfg.defaultChain, 'base'),
  };

  return BotEnvSchema.parse(candidate);
}

export function walletsFromEnv(env: BotEnv): Partial<Record<'base' | 'eth' | 'bsc' | 'sol', string>> {
  const out: Partial<Record<'base' | 'eth' | 'bsc' | 'sol', string>> = {};
  if (env.walletBase) out.base = env.walletBase;
  if (env.walletEth) out.eth = env.walletEth;
  if (env.walletBsc) out.bsc = env.walletBsc;
  if (env.walletSol) out.sol = env.walletSol;
  return out;
}
