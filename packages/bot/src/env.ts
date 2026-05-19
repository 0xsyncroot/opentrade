// Environment / config loader for the Telegram bot.
//
// Single-owner whitelist design (plan §"Telegram bot UX"): the bot accepts
// commands only from `TELEGRAM_OWNER_CHAT_ID`. Everything else (api key,
// wallet, ed25519 PEM path) is shared with the rest of opentrade — we
// either pick it up from explicit env vars or from `~/.config/opentrade/`
// with a fallback to the parent `auto-trading/` workspace during dev.

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

const CONFIG_HOME = path.join(os.homedir(), '.config', 'opentrade');
const AUTO_TRADING_ROOT = '/root/develop/auto-trading';

function tryReadConfigJson(): Record<string, unknown> {
  const p = path.join(CONFIG_HOME, 'config.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
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
}

export function loadBotEnv(opts: LoadEnvOptions = {}): BotEnv {
  const env = opts.env ?? process.env;
  const cfg = tryReadConfigJson();

  const pickFirst = (
    ...candidates: (string | undefined | null)[]
  ): string | undefined => candidates.find((v) => v !== undefined && v !== null && v !== '') ?? undefined;

  const keyPath = resolveEd25519Path(
    pickFirst(env.GMGN_ED25519_PRIVATE_KEY_PATH, cfg.gmgn_private_key_path as string),
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
    telegramBotToken: pickFirst(env.TELEGRAM_BOT_TOKEN, cfg.telegram_bot_token as string),
    telegramOwnerChatId: pickFirst(
      env.TELEGRAM_OWNER_CHAT_ID,
      cfg.telegram_owner_chat_id as string,
    ),
    botMode: pickFirst(env.BOT_MODE, 'polling'),
    botPort: env.BOT_PORT ? Number(env.BOT_PORT) : 8080,
    gmgnApiKey: pickFirst(env.GMGN_API_KEY, cfg.gmgn_api_key as string),
    gmgnPrivateKeyPath: keyPath,
    gmgnPrivateKeyPem: pem,
    gmgnPrivateKeyPassphrase: pickFirst(
      env.GMGN_ED25519_PASSPHRASE,
      cfg.gmgn_private_key_passphrase as string,
    ),
    walletBase: pickFirst(env.GMGN_WALLET_ADDRESS, env.WALLET_BASE, cfg.wallet_base as string),
    walletEth: pickFirst(env.WALLET_ETH, cfg.wallet_eth as string),
    walletBsc: pickFirst(env.WALLET_BSC, cfg.wallet_bsc as string),
    walletSol: pickFirst(env.WALLET_SOL, cfg.wallet_sol as string),
    defaultChain: pickFirst(env.OPENTRADE_DEFAULT_CHAIN, cfg.default_chain as string, 'base'),
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
