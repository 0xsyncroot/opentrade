// `opentrade bot {start|stop|status}` — headless VPS-only Telegram bot lifecycle.
//
// For personal use, `opentrade` (zero-arg TTY) auto-spawns the bot in-process
// alongside the TUI. This subcommand is for VPS deployments without a TUI:
//   - start: spawn packages/bot/dist/main.js detached, write PID + log
//   - stop : SIGTERM the PID
//   - status: report running + tail log
//
// Architecture note: when @0xsyncroot/opentrade-bot exports a `startBot()` function
// in the future, this command becomes a thin wrapper that imports and calls it
// directly in-process. For v1 we use child_process for stability (no React/Ink
// pulled in, no overlap with TUI mount).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { defineCommand } from 'citty';
import { bootstrap, exitWithError, flag } from './_shared.js';
import { emitJson, log, color } from '../render/cli-renderer.js';

export const botCmd = defineCommand({
  meta: { name: 'bot', description: 'Telegram bot lifecycle (headless VPS deploys)' },
  args: {
    op: { type: 'positional', required: true, description: 'start | stop | status' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const cfg = ctx.loaded.config;
    const paths = ctx.loaded.paths;

    switch (args.op) {
      case 'start': {
        if (cfg.telegram?.disabled) {
          log.error('config.telegram.disabled=true — user opted out. Run `opentrade init --tg-only` to re-enable.');
          process.exit(2);
        }
        if (!cfg.telegram?.botToken || !cfg.telegram?.ownerChatId) {
          log.error(
            'telegram not configured. Run `opentrade init --tg-only` or `opentrade config set telegram.botToken=... telegram.ownerChatId=...`.',
          );
          process.exit(2);
        }
        if (existsPid(paths.botPidFile)) {
          log.warn(`bot already running (pid file ${paths.botPidFile}). Run \`opentrade bot status\`.`);
          process.exit(1);
        }
        const botEntry = resolveBotEntry();
        if (!botEntry) {
          log.error(
            'cannot find @0xsyncroot/opentrade-bot dist/main.js. Build the bot package first (Phase 4): `pnpm --filter @0xsyncroot/opentrade-bot build`.',
          );
          process.exit(2);
        }
        const out = fs.openSync(paths.botLogFile, 'a');
        const err = fs.openSync(paths.botLogFile, 'a');
        const child = spawn(process.execPath, [botEntry], {
          detached: true,
          stdio: ['ignore', out, err],
          env: {
            ...process.env,
            OPENTRADE_BOT_TOKEN: cfg.telegram.botToken,
            OPENTRADE_BOT_OWNER_CHAT_ID: String(cfg.telegram.ownerChatId),
          },
        });
        child.unref();
        fs.writeFileSync(paths.botPidFile, String(child.pid ?? ''), { mode: 0o600 });
        log.success(`bot started — pid ${child.pid}, log ${paths.botLogFile}`);
        return;
      }
      case 'stop': {
        if (!existsPid(paths.botPidFile)) {
          log.warn('no bot.pid found — nothing to stop');
          return;
        }
        const pid = Number(fs.readFileSync(paths.botPidFile, 'utf8').trim());
        if (!Number.isFinite(pid) || pid <= 0) {
          fs.unlinkSync(paths.botPidFile);
          log.warn('invalid PID — removed stale pid file');
          return;
        }
        try {
          process.kill(pid, 'SIGTERM');
          fs.unlinkSync(paths.botPidFile);
          log.success(`sent SIGTERM to pid ${pid}`);
        } catch (e) {
          log.error(`failed: ${(e as Error).message}`);
          process.exit(1);
        }
        return;
      }
      case 'status': {
        const running = existsPid(paths.botPidFile);
        const pid = running ? Number(fs.readFileSync(paths.botPidFile, 'utf8').trim()) : undefined;
        const alive = pid ? isProcAlive(pid) : false;
        const tail = fs.existsSync(paths.botLogFile) ? tailFile(paths.botLogFile, 10) : '';
        if (flag(args as Record<string, unknown>, 'json')) {
          emitJson({ running: alive, pid, logFile: paths.botLogFile, tail: tail.split('\n') });
          return;
        }
        log.info(`bot: ${alive ? color.green('running') : color.dim('not running')}${pid ? ` (pid ${pid})` : ''}`);
        log.info(`log: ${paths.botLogFile}`);
        if (tail) {
          process.stdout.write(`\n${color.dim('-- last 10 lines --')}\n`);
          process.stdout.write(tail);
          if (!tail.endsWith('\n')) process.stdout.write('\n');
        }
        return;
      }
      default:
        exitWithError(`unknown bot op: ${args.op}`);
    }
  },
});

function existsPid(file: string): boolean {
  try {
    const v = fs.readFileSync(file, 'utf8').trim();
    return v.length > 0 && Number.isFinite(Number(v));
  } catch {
    return false;
  }
}

function isProcAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tailFile(file: string, lines: number): string {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const all = raw.split('\n');
    return all.slice(Math.max(0, all.length - lines)).join('\n');
  } catch {
    return '';
  }
}

function resolveBotEntry(): string | undefined {
  const candidates = [
    // installed via workspace dep — symlink in cli/node_modules
    path.join(process.cwd(), 'node_modules', '@0xsyncroot', 'opentrade-bot', 'dist', 'main.js'),
    // monorepo direct path (dev)
    path.join(process.cwd(), '..', 'bot', 'dist', 'main.js'),
    path.join(process.cwd(), 'packages', 'bot', 'dist', 'main.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Fallback: try `import.meta.resolve`-style — give up gracefully.
  return undefined;
}
