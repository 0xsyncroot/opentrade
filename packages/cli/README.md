# @0xsyncroot/opentrade

Fast GMGN trading CLI — interactive terminal TUI (React + Ink) + non-interactive subcommands, single binary. Trades meme coins across Base / Solana / Ethereum / BSC via the GMGN Agent API. Bundled with `@0xsyncroot/opentrade-bot` for in-process Telegram control.

## Install

```bash
npm i -g @0xsyncroot/opentrade
```

## First-time setup

```bash
opentrade init
```

Wizard guides you through:

1. Default chain (`base` / `sol` / `eth` / `bsc`)
2. Ed25519 keypair — generate new, import existing, or reuse one from a sibling project
3. GMGN dashboard — public key auto-copied to clipboard + step-by-step to paste it and grab your API key
4. Paste the API key
5. Wallet addresses per chain (paste or skip)
6. **Telegram bot** — paste bot token + chat_id now, defer for later, or disable
7. Config written to `~/.config/opentrade/config.json` (mode 600)

To re-run only the Telegram step:

```bash
opentrade init --tg-only
```

## Two modes, one binary

```bash
opentrade                                       # zero-arg + TTY → Ink TUI
                                                # Also auto-launches the Telegram bot in the same
                                                # process if config has telegram.botToken + ownerChatId.

opentrade buy base 0xABC… 0.005 --tp 50 --sl 20 --yes      # subcommand fast-path (no Ink load)
opentrade sell base 0xABC… 50 --yes
opentrade ps --json
opentrade --plain <subcommand>                  # force non-TUI mode even in a TTY
```

The shim at `bin/opentrade.mjs` chooses the path: zero-arg + TTY → TUI; anything else → citty subcommand tree (cold start <50 ms).

## TUI cheatsheet

| Key | Action |
|---|---|
| `1` `2` `3` `4` | Fire context preset (buy or sell) |
| `b` / `s` | Force buy / sell mode |
| `Tab` | Flip buy ↔ sell |
| `i` | Expanded token info |
| `r` | Refresh card |
| `p` | Positions list |
| `w` | Wallet summary |
| `c` | Change chain |
| `/` | Slash command palette (fuzzy) |
| `T` | Toggle Telegram bot start/stop |
| `?` | Help overlay |
| `q` / `Ctrl+C` | Graceful quit (stops bot first) |

Paste a contract address (EVM `0x…` or Solana base58) → token card renders → preset buttons appear. If you already hold the token, the SELL view is shown first; `Tab` flips.

## Subcommands (fast-path, machine-friendly)

```
opentrade buy   <chain> <token> <amount>  [--tp 50 --sl 20 --slip 8 --no-mev --yes --json --dry-run]
opentrade sell  <chain> <token> [percent=100]
opentrade limit <buy|sell> <chain> <token> <amount> --at <price>
opentrade quote <chain> <token> <amount>
opentrade ps | w | holdings <chain> | info <chain> <token> | orders {list|status|cancel}
opentrade send <chain> <token> <amount> <to|@alias>
opentrade ab {add|ls|rm|whitelist}   alias {save|ls|rm}   feed {trending|sm|kol|trenches|kline}
opentrade init [--tg-only]   keygen [--out] [--passphrase] [--print-only]
opentrade config {show|get|set|path}
opentrade bot {start|stop|status}      # headless mode (skip TUI)
```

`--json` everywhere swaps human output for JSON. `--dry-run` quotes without submitting.

## Safety

- **Hard block** before submit: `is_honeypot`, `is_blacklist`, `rug_ratio > 0.30`, top-10 holder rate `> 0.55` (ex Uniswap V4 PoolManager).
- **Warn + force-confirm**: buy/sell tax `> 10 %`, low liquidity, ETH gas `>` 20 % of trade size.
- 4-tier confirmation by amount: T0 silent `< 1 %` wallet, T1 inline 3 s, T2 type-YES `> 5 %` or ETH mainnet, T3 type-symbol on safety warnings. `--yes` skips T0/T1/T2 but never T3.

## Send safety

Same-chain transfers use an address book with first-time-address protocol (paste twice + explorer link + 60 s cool-down + optional `--whitelist-only`). Contract addresses blocked by default unless `--allow-contract`. Tiered amount confirms.

## Telegram bot

Auto-launches in the same process as the TUI when config has both `telegram.botToken` and `telegram.ownerChatId`. Whitelist-by-chat-id only — every other update is dropped silently. Status indicator in the StatusBar; `T` toggles at runtime.

Headless deploy (no TUI):

```bash
opentrade bot start
```

The bot is a separately published package (`@0xsyncroot/opentrade-bot`) shipped as a regular dep — `npm i -g @0xsyncroot/opentrade` pulls it in.

## Config layout

```
~/.config/opentrade/
├── config.json            # chain default, GMGN API key, wallets, Telegram, mode 600
├── presets.json           # per-chain buy/sell amounts + slippage overrides
├── aliases.json           # saved trade aliases (`opentrade buy ape` → preset)
├── address-book.json      # send recipients, mode 600
├── history.json           # last 20 contract addresses
└── secrets/
    ├── ed25519.pem        # mode 600 — signs GMGN critical-tier requests
    └── ed25519.pub        # mode 644 — paste this into the GMGN dashboard
```

When run inside the parent `auto-trading/` workspace, opentrade reuses `auto-trading/secrets/gmgn_ed25519.pem` and `auto-trading/.env` as a fallback for development.

## License

MIT
