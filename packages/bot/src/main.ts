// Headless / standalone entry — VPS or Docker deploy. Thin wrapper around
// `startBot()`: load config from env + ~/.config/opentrade/, build a
// DispatcherContext locally (no TUI alongside), invoke startBot, then sit on
// the process waiting for SIGTERM / SIGINT.

import { loadBotEnv, walletsFromEnv } from './env.js';
import { startBot, type BotHandle } from './start.js';
import { makeRecordTrade } from './audit.js';
import { actions as actionsNs, gmgn as gmgnNs } from '@hiepht/opentrade-core';

const HELP = `opentrade-bot — Telegram bot for opentrade

Env vars:
  TELEGRAM_BOT_TOKEN        bot token from @BotFather
  TELEGRAM_OWNER_CHAT_ID    numeric chat_id (single-owner whitelist)
  GMGN_API_KEY              GMGN API key
  GMGN_ED25519_PRIVATE_KEY_PATH   path to PEM
                                    (fallback: ~/.config/opentrade/secrets/ed25519.pem,
                                    then <auto-trading-workspace>/secrets/gmgn_ed25519.pem
                                    if detected on the parent directory tree)
  GMGN_WALLET_ADDRESS / WALLET_BASE / WALLET_ETH / WALLET_BSC / WALLET_SOL
  BOT_MODE                  polling (default) | webhook
  BOT_PORT                  webhook port (default 8080)

Subcommands:
  opentrade-bot --help      this message

Outputs:
  Trades to ~/.config/opentrade/trades_<UTC-date>.md (always); also mirrored to
  <auto-trading-workspace>/memory/agents/executor/trades_<UTC-date>.md when a
  parent 'auto-trading/' workspace is detected at runtime.
`;

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  let env;
  try {
    env = loadBotEnv();
  } catch (err) {
    process.stderr.write(`config error: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const client = new gmgnNs.GmgnClient({
    apiKey: env.gmgnApiKey,
    privateKeyPem: env.gmgnPrivateKeyPem,
    privateKeyPassphrase: env.gmgnPrivateKeyPassphrase,
  });

  const wallets = walletsFromEnv(env);
  const recordTrade = makeRecordTrade();

  const dispatcherCtx: actionsNs.DispatcherContext = {
    client,
    wallets,
    recordTrade,
  };

  const handle: BotHandle = await startBot({
    telegramBotToken: env.telegramBotToken,
    telegramOwnerChatId: env.telegramOwnerChatId,
    dispatcherCtx,
    wallets,
    defaultChain: env.defaultChain,
    mode: env.botMode,
    webhookPort: env.botPort,
  });

  const stop = async (sig: string) => {
    process.stderr.write(`[bot] received ${sig}, stopping…\n`);
    await handle.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  // Idle.
  setInterval(() => {
    // Keep loop alive; status observable via handle.status() if wrapped elsewhere.
  }, 60_000);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).stack ?? (err as Error).message}\n`);
  process.exit(1);
});
