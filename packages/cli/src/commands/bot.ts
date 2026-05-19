// `opentrade bot {start|stop|status}` — headless VPS-only Telegram bot lifecycle.
//
// `start` runs the bot in the FOREGROUND of the current process (P0-3 fix).
// The previous detached child-process approach looked for a path that doesn't
// exist after `npm i -g @hiepht/opentrade` — the bot dist lives bundled inside
// the cli artifact, not in a separate node_modules tree. Running inline is
// also simpler: SIGTERM → graceful stop, PID file = process.pid, log goes to
// the configured log file or stderr.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { defineCommand } from 'citty';
import * as botModule from '@hiepht/opentrade-bot/start';
import type { Chain } from '@hiepht/opentrade-core/chains';
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
        if (!cfg.telegram?.botToken || cfg.telegram?.ownerChatId === undefined) {
          log.error(
            'telegram not configured. Run `opentrade init --tg-only` or `opentrade config set telegram.botToken=... telegram.ownerChatId=...`.',
          );
          process.exit(2);
        }
        if (existsPid(paths.botPidFile)) {
          const pid = Number(fs.readFileSync(paths.botPidFile, 'utf8').trim());
          if (Number.isFinite(pid) && isProcAlive(pid)) {
            log.warn(`bot already running (pid ${pid}). Run \`opentrade bot stop\` first.`);
            process.exit(1);
          }
          // Stale PID file — remove it.
          try { fs.unlinkSync(paths.botPidFile); } catch { /* */ }
        }
        if (typeof botModule.startBot !== 'function') {
          log.error('bot module not bundled — rebuild @hiepht/opentrade.');
          process.exit(2);
        }

        const defaultChain: Chain = (cfg.defaultChain ?? 'base') as Chain;
        const wallets = (cfg.wallets ?? {}) as Partial<Record<Chain, string>>;

        // Write PID file using the current process PID — the bot runs INLINE.
        fs.mkdirSync(path.dirname(paths.botPidFile), { recursive: true });
        fs.writeFileSync(paths.botPidFile, String(process.pid), { mode: 0o600 });
        try { fs.chmodSync(paths.botPidFile, 0o600); } catch { /* */ }

        const logger = {
          info: (m: string) => process.stderr.write(`[bot] ${m}\n`),
          error: (m: string) => process.stderr.write(`[bot:err] ${m}\n`),
        };

        log.success(`starting bot (pid ${process.pid}). Send SIGTERM or run \`opentrade bot stop\` to stop.`);

        let handle: Awaited<ReturnType<typeof botModule.startBot>> | undefined;
        try {
          handle = await botModule.startBot({
            telegramBotToken: cfg.telegram.botToken,
            telegramOwnerChatId: String(cfg.telegram.ownerChatId),
            dispatcherCtx: ctx.dispatcherCtx,
            wallets,
            defaultChain,
            logger,
          });
        } catch (err) {
          log.error(`failed to start: ${(err as Error).message}`);
          try { fs.unlinkSync(paths.botPidFile); } catch { /* */ }
          process.exit(1);
        }

        let shuttingDown = false;
        const stop = async (sig: string): Promise<void> => {
          if (shuttingDown) return;
          shuttingDown = true;
          process.stderr.write(`[bot] received ${sig}, stopping…\n`);
          try {
            await Promise.race([
              handle!.stop(),
              new Promise<void>((res) => setTimeout(res, 5_000)),
            ]);
          } catch {
            /* swallow */
          }
          try { fs.unlinkSync(paths.botPidFile); } catch { /* */ }
          process.exit(0);
        };
        process.on('SIGINT', () => void stop('SIGINT'));
        process.on('SIGTERM', () => void stop('SIGTERM'));

        // Keep the loop alive — bot.start() returns a promise that resolves
        // when the bot stops; we await it so the process exits cleanly when
        // the bot ever stops on its own.
        await new Promise<void>(() => {
          // never resolves; SIGTERM / SIGINT handler exits the process.
        });
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
          // PID file is cleared by the running process's signal handler.
          log.success(`sent SIGTERM to pid ${pid}`);
        } catch (e) {
          // The PID is stale — clean up.
          try { fs.unlinkSync(paths.botPidFile); } catch { /* */ }
          log.error(`failed (process likely gone): ${(e as Error).message}`);
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
