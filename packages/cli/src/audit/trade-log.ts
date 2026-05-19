// Trade audit ledger. Appends a YAML-frontmatter `## trade` markdown block to
//
//   ~/.config/opentrade/trades_<YYYY-MM-DD>.md
//
// When running inside the auto-trading workspace, also dual-writes to
//
//   <workspace>/memory/agents/executor/trades_<YYYY-MM-DD>.md
//
// so the autonomous loop's monitor agent picks up trades from opentrade.

import fs from 'node:fs';
import path from 'node:path';
import type { Intent } from '@hiepht/opentrade-core/schemas';
import type { TradeRecord } from '@hiepht/opentrade-core/actions';
import type { OpentradePaths } from '../config/paths.js';

export interface AuditOpts {
  paths: OpentradePaths;
  /** Override the workspace dual-write target. */
  workspaceLedgerDir?: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeWriteAppend(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, content, { mode: 0o644 });
}

export function formatTradeBlock(rec: TradeRecord): string {
  const intent = rec.intent;
  const ok = rec.result !== undefined && rec.error === undefined;
  const txt: string[] = [];
  txt.push('## trade');
  txt.push('```yaml');
  txt.push(`kind: ${rec.kind}`);
  if ('chain' in intent) txt.push(`chain: ${intent.chain}`);
  if ('token' in intent) txt.push(`token: ${intent.token}`);
  if (intent.kind === 'buy') {
    txt.push(`amount_wei: '${intent.amountWei}'`);
    txt.push(`slippage_bps: ${intent.slippageBps}`);
    txt.push(`anti_mev: ${intent.antiMev}`);
    if (intent.tp?.length) txt.push(`tp: ${JSON.stringify(intent.tp)}`);
    if (intent.sl?.length) txt.push(`sl: ${JSON.stringify(intent.sl)}`);
  }
  if (intent.kind === 'sell') {
    txt.push(`percent: ${intent.percent}`);
    txt.push(`slippage_bps: ${intent.slippageBps}`);
    txt.push(`anti_mev: ${intent.antiMev}`);
  }
  if (intent.kind === 'send') {
    txt.push(`amount_wei: '${intent.amountWei}'`);
    txt.push(`to: ${intent.to}`);
  }
  if (intent.kind === 'limit') {
    txt.push(`side: ${intent.side}`);
    if (intent.amountWei) txt.push(`amount_wei: '${intent.amountWei}'`);
    if (intent.amountPct) txt.push(`amount_pct: ${intent.amountPct}`);
    txt.push(`trigger_price_usd: ${intent.triggerPriceUsd}`);
  }
  txt.push(`result: ${ok ? 'success' : rec.error ? 'fail' : 'pending'}`);
  if (rec.result?.txHash) txt.push(`tx_hash: ${rec.result.txHash}`);
  if (rec.result?.orderId) txt.push(`order_id: ${rec.result.orderId}`);
  if (rec.result?.status) txt.push(`status: ${rec.result.status}`);
  if (rec.error) {
    txt.push(`error_message: ${JSON.stringify(rec.error.message)}`);
    if (rec.error.code !== undefined) txt.push(`error_code: ${rec.error.code}`);
  }
  txt.push(`timestamp_utc: ${rec.timestampUtc}`);
  txt.push(`source: opentrade-cli`);
  txt.push('```');
  txt.push('');
  return txt.join('\n');
}

/**
 * Persist a trade record to the daily ledger(s). Never throws — audit log
 * failures must not kill a trade flow.
 */
export async function recordTrade(rec: TradeRecord, opts: AuditOpts): Promise<void> {
  const block = formatTradeBlock(rec);
  const day = todayUtc();
  const fname = `trades_${day}.md`;

  const targets: string[] = [path.join(opts.paths.configDir, fname)];

  // Workspace dual-write (where the autonomous loop monitor agent reads).
  const workspaceDir =
    opts.workspaceLedgerDir ??
    (opts.paths.workspaceRoot
      ? path.join(opts.paths.workspaceRoot, 'memory', 'agents', 'executor')
      : undefined);
  if (workspaceDir) {
    targets.push(path.join(workspaceDir, fname));
  }

  for (const t of targets) {
    try {
      safeWriteAppend(t, block);
    } catch {
      // never let audit log failure escape
    }
  }
}

/** Convenience factory: a `recordTrade` function bound to the loaded config. */
export function makeRecorder(opts: AuditOpts): (rec: TradeRecord) => Promise<void> {
  return (rec) => recordTrade(rec, opts);
}

export type { TradeRecord, Intent };
