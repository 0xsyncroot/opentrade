// Trade audit log — mirrors the Phase 2 CLI `audit/trade-log.ts` shape so the
// auto-trading executor agent sees both surfaces' fills in one ledger.
//
// Hard rule (CLAUDE.md "Inter-agent communication contract"):
//   every trade attempt (success, fail, expired) writes to trades_<UTC-date>.md.
//
// We write to two locations when running inside the auto-trading workspace:
//   1) ~/.config/opentrade/trades_<date>.md  (always)
//   2) /root/develop/auto-trading/memory/agents/executor/trades_<date>.md
//      (only if that directory exists — keeps the bot portable outside the
//      workspace, e.g. on a bare VPS)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { actions as actionsNs } from '@hiepht/opentrade-core';

const AUTO_TRADING_EXECUTOR_DIR = '/root/develop/auto-trading/memory/agents/executor';
const XDG_TRADES_DIR = path.join(os.homedir(), '.config', 'opentrade');

function utcDate(d = new Date()): string {
  // YYYY-MM-DD in UTC — matches the auto-trading daily ledger naming.
  return d.toISOString().slice(0, 10);
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function appendBlock(filePath: string, header: string, body: string): void {
  ensureDir(path.dirname(filePath));
  const exists = fs.existsSync(filePath);
  const prelude = exists
    ? ''
    : `# opentrade trades — ${path.basename(filePath, '.md').replace('trades_', '')}\n\n`;
  fs.appendFileSync(filePath, `${prelude}## ${header}\n${body}\n\n`, { mode: 0o600 });
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export interface RecordTradeOptions {
  /** Override base dirs for tests. */
  extraDirs?: string[];
  xdgDir?: string;
  /** Quiet test mode — only collect, don't write. */
  dryRun?: boolean;
}

export interface RecordTradeOutcome {
  files: string[];
  body: string;
}

export function makeRecordTrade(opts: RecordTradeOptions = {}): (rec: actionsNs.TradeRecord) => Promise<void> {
  return async (rec: actionsNs.TradeRecord) => {
    const out = formatRecord(rec);
    const filename = `trades_${utcDate(new Date(rec.timestampUtc))}.md`;

    const targets: string[] = [];
    const xdg = opts.xdgDir ?? XDG_TRADES_DIR;
    targets.push(path.join(xdg, filename));
    // Auto-trading workspace mirror, only when the directory tree exists.
    if (fs.existsSync(AUTO_TRADING_EXECUTOR_DIR)) {
      targets.push(path.join(AUTO_TRADING_EXECUTOR_DIR, filename));
    }
    for (const d of opts.extraDirs ?? []) {
      targets.push(path.join(d, filename));
    }

    if (opts.dryRun) return;
    for (const file of targets) {
      try {
        appendBlock(file, out.header, out.body);
      } catch (err) {
        // Don't crash a trade flow because audit failed.
        process.stderr.write(`audit: failed to write ${file}: ${(err as Error).message}\n`);
      }
    }
  };
}

interface FormattedRecord {
  header: string;
  body: string;
}

function formatRecord(rec: actionsNs.TradeRecord): FormattedRecord {
  const intent = rec.intent;
  const ok = rec.result !== undefined && rec.error === undefined;
  const tag = ok ? 'OK' : rec.error ? 'ERR' : 'PENDING';
  const kind = rec.kind.toUpperCase();
  const chain = 'chain' in intent ? (intent as { chain: string }).chain : '—';
  const token =
    'token' in intent ? (intent as { token: string }).token : '—';
  const header = `${rec.timestampUtc} · ${kind} · ${chain} · ${token} · ${tag}`;
  const lines: string[] = ['```json', safeStringify({ intent, result: rec.result, error: rec.error }), '```'];
  return { header, body: lines.join('\n') };
}
