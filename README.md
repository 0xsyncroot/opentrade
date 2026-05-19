# opentrade

> Fast GMGN trading from your terminal — interactive TUI + Telegram bot, one install, one process.

[![npm](https://img.shields.io/npm/v/%40hiepht%2Fopentrade?label=npm)](https://www.npmjs.com/package/@hiepht/opentrade)
[![license](https://img.shields.io/npm/l/%40hiepht%2Fopentrade)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-131%20passing-brightgreen)](#dev)

Paste a contract address, hit `1` to buy `0.01 ETH`, hit `2` for `0.03`, hit `Tab` to flip to sell. Or do the same thing from Telegram — same buttons, same safety gates, same audit log. Both run in the same process, share one GMGN client.

```
┌─ opentrade · base · 0xH3…4a · $1,234.56 · 3 pos · gas $0.18 ─────┐
│                                                                  │
│   PEPE  Pepe Coin                       $0.0000234   +12.4% ▲   │
│   ─────────────────────────────────────────────────────────────  │
│   MCap   $4.2M       Liq   $890k        Top10   38%             │
│   Pool   V3 Aerodrome Tax 0/0          Hpot ✓   Rug 0.03        │
│                                                                  │
│   ⚡ Quick Buy                                                    │
│     [1] 0.01 ETH   [2] 0.03 ETH   [3] 0.05 ETH   [4] 0.1 ETH    │
│     Slip 8%  Anti-MEV auto  TP --  SL --                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
> _                       1-4 buy · Tab flip · i info · /cmd · ?
```

Supported chains: **Base · Solana · Ethereum · BSC**.

---

## Install

```bash
npm i -g @hiepht/opentrade
```

That's it. Just one package — the TUI, the GMGN client, and the Telegram bot are all bundled inside.

Requires Node 20+.

## Setup (first time)

```bash
opentrade init
```

The wizard walks you through 6 steps:

1. **Default chain** — pick `base` / `sol` / `eth` / `bsc`
2. **Ed25519 keypair** — `[generate new]` if it's your first time, `[import existing PEM]` if you already have one
3. **GMGN dashboard** — public key auto-copies to your clipboard. The wizard prints the exact steps to paste it into the GMGN API page and grab your API key
4. **API key** — paste it back into the wizard
5. **Wallet addresses** — paste one per chain (or skip and add later)
6. **Telegram bot** — pick `[Yes]` to paste token + chat_id now, `[Skip]` to defer, or `[I don't want it]` to disable

Config lands in `~/.config/opentrade/config.json` (mode 600).

You can add or change Telegram at any time:

```bash
opentrade init --tg-only
# or
opentrade config set telegram.botToken=<token>
opentrade config set telegram.ownerChatId=<chat_id>
```

## Usage

### Interactive TUI

```bash
opentrade
```

That's it — the terminal goes interactive. If Telegram is configured, the bot **also starts in the same process**, so you can trade from your phone and watch positions update in the terminal live.

Paste any contract address — EVM `0x…` or Solana base58 — and the token card appears with quick-buy buttons. If you already hold the token, the **sell view shows first** (25 / 50 / 75 / 100 %); `Tab` flips back to buy.

| Key | Action |
|---|---|
| `1` `2` `3` `4` | Fire preset (context: buy or sell) |
| `b` / `s` | Force buy / sell mode |
| `Tab` | Flip buy ↔ sell |
| `i` | Expanded token info |
| `r` | Refresh card |
| `p` / `w` | Positions list / wallet summary |
| `c` | Switch chain |
| `/` | Slash command palette |
| `T` | Toggle Telegram bot on / off at runtime |
| `?` | Help overlay |
| `q` / `Ctrl+C` | Graceful quit (stops bot first) |

Slash commands inside the TUI mirror the CLI subcommands: `/buy 0.05`, `/sell 50`, `/ps`, `/info`, `/chain base`, `/help`.

### Telegram

Paste a contract address into your chat with the bot → it replies with the same token card + same preset buttons. Tap `[0.05 ETH]` to fire a buy, `[Sell 50%]` to dump half your position. The bot only accepts updates from the chat ID you set in config (single-owner whitelist) — every other update is dropped silently.

Headless mode (24/7 on a VPS, no terminal UI):

```bash
opentrade bot start          # spawn detached background bot
opentrade bot status         # check + tail recent log
opentrade bot stop           # graceful stop
```

### Non-interactive subcommands

Every action also runs without the TUI — handy for scripts, cron, or LLM agents. Cold start under 50 ms because Ink never loads.

```bash
opentrade buy   base 0xABC… 0.005 --tp 50 --sl 20 --yes
opentrade sell  base 0xABC… 50 --yes
opentrade limit buy base 0xABC… 0.01 --at 0.0001
opentrade quote base 0xABC… 0.005
opentrade ps    --json
opentrade w
opentrade info  base 0xABC…
opentrade send  base usdc 0.5 @cold-wallet
opentrade feed  trending base
```

Common flags:

| Flag | Effect |
|---|---|
| `--yes` | Skip the interactive confirm prompt |
| `--dry-run` | Quote only — never submits a transaction |
| `--json` | Emit machine-readable JSON instead of human output |
| `--plain` | Force non-TUI mode even in a TTY |

Run `opentrade <subcommand> --help` for all flags.

## Safety

Built-in gates block dangerous trades **before** they're submitted:

| Condition | Action |
|---|---|
| `is_honeypot` / `is_blacklist` set | **Hard block** |
| `rug_ratio > 0.30` | **Hard block** |
| Top-10 holder rate `> 0.55` (ex Uniswap V4 PoolManager) | **Hard block** |
| Buy or sell tax `> 10 %` | Warn + force you to type the token symbol to confirm |
| Liquidity `<` 2× your trade size | Warn |
| ETH gas `>` 20 % of trade size | Warn |

Confirmation tiers by trade size as a percentage of your wallet:

| Tier | Trigger | UX |
|---|---|---|
| **T0** silent | `< 1 %` | Fires on keypress, no confirm |
| **T1** inline | `1–5 %` | 3-second countdown auto-fire, `Esc` to cancel |
| **T2** typed YES | `> 5 %` or ETH mainnet | Type `YES` to confirm |
| **T3** typed symbol | safety warned | Type the exact token symbol |

`--yes` skips T0 / T1 / T2 — never T3.

**Send safety** (same-chain transfers to other wallets): address book with first-time-address protocol (paste address twice + explorer link + 60-second cool-down), optional `--whitelist-only` mode that blocks every recipient not in the book, contract-address auto-detect (`--allow-contract` to override), tiered amount confirms.

## Config layout

```
~/.config/opentrade/
├── config.json            # default chain, GMGN API key, wallets, Telegram (mode 600)
├── presets.json           # per-chain buy/sell amounts + slippage overrides
├── aliases.json           # saved trade aliases — `opentrade buy ape`
├── address-book.json      # send recipients (mode 600)
├── history.json           # last 20 contract addresses
└── secrets/
    ├── ed25519.pem        # signs GMGN critical requests (mode 600)
    └── ed25519.pub        # paste this into the GMGN dashboard (mode 644)
```

## How it works

```
       paste / keypress / Telegram tap
                  │
                  ▼
       classifier / slash parser
                  │
                  ▼
            build Intent
                  │
                  ▼
   dispatcher  (safety → service → audit)
                  │
                  ▼
      GmgnClient → openapi.gmgn.ai
```

**One brain, two skins.** The TUI keypress handlers and the Telegram callback router both produce the same `Intent` object and push it through the same dispatcher. Safety + GMGN call + audit log run in exactly one place. Buy from your phone, see the position update in the terminal instantly.

## Dev

```bash
git clone https://github.com/0xsyncroot/opentrade.git
cd opentrade
pnpm install
pnpm -r build       # builds the cli artifact (with bot + core bundled in)
pnpm -r test        # 131 tests
pnpm -r typecheck
```

The monorepo has three workspace packages but only `@hiepht/opentrade` is published — `core` and `bot` are private, their source is bundled into the CLI artifact at build time so end-users install one thing.

PRs welcome.

## License

MIT © [0xsyncroot](https://github.com/0xsyncroot)
