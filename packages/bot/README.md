# @0xsyncroot/opentrade-bot

Telegram bot for [`@0xsyncroot/opentrade`](https://www.npmjs.com/package/@0xsyncroot/opentrade). Single-owner whitelist, mirrors the TUI UX through the same `Screen` JSON + Intent dispatcher.

Two ways to run it:

## 1. Auto-launched by the CLI (default for personal use)

When you run `opentrade` (zero-arg, TTY) and your config has both `telegram.botToken` and `telegram.ownerChatId`, the CLI dynamic-imports `@0xsyncroot/opentrade-bot/start` and runs it on the same event loop as the Ink TUI. Buy/sell from your phone, see the position update in the terminal instantly. Press `T` in the TUI to toggle the bot at runtime.

No separate install needed — this package is a regular dependency of `@0xsyncroot/opentrade`.

## 2. Headless / VPS deploy

`@0xsyncroot/opentrade-bot` also ships an `opentrade-bot` binary that runs polling-only with no TUI alongside. Useful when you want the bot up 24/7 on a server.

```bash
TELEGRAM_BOT_TOKEN=… \
TELEGRAM_OWNER_CHAT_ID=… \
GMGN_API_KEY=… \
GMGN_ED25519_PRIVATE_KEY_PATH=~/.config/opentrade/secrets/ed25519.pem \
opentrade-bot
```

Or, equivalently, from the CLI binary:

```bash
opentrade bot start
```

## Docker

```bash
docker build -t opentrade-bot packages/bot
docker run -d \
  --name opentrade-bot \
  -v ~/.config/opentrade:/root/.config/opentrade:ro \
  -e TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN \
  -e TELEGRAM_OWNER_CHAT_ID=$TELEGRAM_OWNER_CHAT_ID \
  opentrade-bot
```

## Programmatic embedding

```ts
import { startBot } from '@0xsyncroot/opentrade-bot/start';

const handle = await startBot({
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
  telegramOwnerChatId: Number(process.env.TELEGRAM_OWNER_CHAT_ID!),
  dispatcherCtx,                 // share with TUI / CLI
  wallets: { base: '0x…', sol: '…' },
  defaultChain: 'base',
  mode: 'polling',               // or 'webhook' with webhookPort
});

// later
await handle.stop();
```

`handle` is a `BotHandle` with `stop()`, `status()`, and `onStatusChange(cb)`. See `src/start.ts` for the full TypeScript types.

## UX

- Paste a contract address in chat → bot replies with a token preview card + inline preset buttons (buy `0.01` / `0.03` / `0.05` / `0.1`, or sell `25 %` / `50 %` / `75 %` / `100 %` if you already hold).
- Same safety gates as the CLI — honeypot / rug / top-10 / tax all flagged before any button works.
- Risk-flagged tokens replace the preset row with a single `[⚠ Confirm Risky]` button that requires you to type the token symbol to proceed.
- Slash commands mirror the CLI: `/buy 0.05`, `/sell 50`, `/ps`, `/info`, `/chain base`, `/help`.

## Security

- **Single owner**: every update from a chat whose ID `!== TELEGRAM_OWNER_CHAT_ID` is dropped silently. Rate-limited 30 messages/minute as a backstop.
- **Private keys never leave the host**: signing happens inside `GmgnClient` server-side. The bot reads the PEM from disk at startup; it is never sent in a Telegram message.

## License

MIT
