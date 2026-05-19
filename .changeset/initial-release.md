---
'@0xsyncroot/opentrade': minor
'@0xsyncroot/opentrade-bot': minor
'@0xsyncroot/opentrade-core': minor
---

Initial release of `opentrade`: fast GMGN trading CLI with three deliverables in one install.

- **`@0xsyncroot/opentrade`** — single binary with a hybrid entry. Zero-arg in a TTY launches an Ink terminal UI (paste a contract address, quick-buy `1`–`4`, sell `25` / `50` / `75` / `100 %`, slash command palette, position list, live PnL). Any subcommand (`buy` / `sell` / `limit` / `quote` / `ps` / `w` / `info` / `send` / `feed` / …) runs without loading Ink so cold start stays under 50 ms. Standard machine-friendly flags `--json` / `--dry-run` / `--yes` / `--plain` on every action.
- **`@0xsyncroot/opentrade-bot`** — Telegram bot (grammY) that auto-launches inside the same process as the TUI when `config.telegram.botToken` and `ownerChatId` are set. Mirrors the TUI through a shared `Screen` JSON + Intent dispatcher: paste a contract address in chat → same token card + inline preset buttons, same safety gates, same audit log. Also ships an `opentrade-bot` binary for headless VPS / Docker deploys.
- **`@0xsyncroot/opentrade-core`** — shared GMGN client (Ed25519-signed critical-tier requests), zod schemas, services, safety gates (honeypot / rug / top-10 / tax / Uniswap V4 anti-MEV auto-off), classifier (EVM 0x / Solana base58 / slash commands / aliases), view builders, and the central dispatcher.

Supports **Base / Solana / Ethereum / BSC**. Single-owner whitelist on Telegram. First-run wizard generates an Ed25519 keypair, walks the user through the GMGN dashboard onboarding, and offers an explicit `[Yes / Skip / Don't want]` step for Telegram setup.
