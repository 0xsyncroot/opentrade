# opentrade

Fast GMGN trading — interactive terminal TUI (React + Ink) + Telegram bot, share the same core logic and run in one process. Single npm package: `npm i -g @0xsyncroot/opentrade`.

```bash
opentrade init                                          # first-run wizard: keygen → GMGN dashboard → API key → optional Telegram → config
opentrade                                               # open TUI; if Telegram is configured, the bot starts in the same process
opentrade buy base 0xABC… 0.005 --tp 50 --sl 20 --yes   # non-interactive subcommand (no Ink load)
opentrade bot start                                     # headless-only mode for VPS deploys
```

Supported chains: **Base · Solana · Ethereum · BSC**.

## Repo layout

| Package | Role | Published |
|---|---|---|
| `packages/core` (`@0xsyncroot/opentrade-core`) | GMGN client (Ed25519), zod schemas, services, safety gates, classifier, view builders, Intent dispatcher | ✅ |
| `packages/cli` (`@0xsyncroot/opentrade`) | Binary `opentrade` (alias `ot`). Hybrid: zero-arg → Ink TUI; subcommand → fast-path citty. Auto-spawns the Telegram bot in the same process when configured. | ✅ |
| `packages/bot` (`@0xsyncroot/opentrade-bot`) | Telegram bot (grammY), single-owner whitelist. Used in-process by CLI and as a standalone binary `opentrade-bot` for headless VPS deploys. | ✅ |

All three are published. The CLI lists the bot as a regular dependency so `npm i -g @0xsyncroot/opentrade` ships everything.

## Dev workflow

```bash
pnpm install
pnpm -r build       # core + cli + bot
pnpm -r test        # 131 tests across the monorepo
pnpm -r typecheck
pnpm changeset      # author a version bump for the next release
```

Repo uses pnpm workspaces + changesets + tsup + biome + vitest. Node 20+, ESM only.

See [`/root/.claude/plans/cho-t-i-1-tool-eager-hellman.md`](/root/.claude/plans/cho-t-i-1-tool-eager-hellman.md) for the full plan.

## License

MIT
