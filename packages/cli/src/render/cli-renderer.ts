// Non-TUI renderer: consume a Screen JSON (or a generic structured result) and
// print to the terminal via consola + cli-table3. Respects NO_COLOR and TTY.

import { consola } from 'consola';
import Table from 'cli-table3';
import type { Screen, Block, SafetyGate } from '@hiepht/opentrade-core/schemas';

export interface RenderOpts {
  json?: boolean;
  plain?: boolean;
  /** If true, write JSON.stringify to stdout and return. */
  asJson?: boolean;
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const color = {
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  blue: (s: string) => (useColor ? `\x1b[34m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
};

export function emitJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function renderScreen(screen: Screen, opts: RenderOpts = {}): void {
  if (opts.asJson || opts.json) {
    emitJson(screen);
    return;
  }

  // Header
  const h = screen.header;
  const headerLine = [
    color.bold('opentrade'),
    color.dim('·'),
    h.chain,
    color.dim('·'),
    h.walletShort,
    color.dim('·'),
    h.balanceUsd,
    color.dim('·'),
    `${h.openPositions} pos`,
    ...(h.gasEstUsd ? [color.dim('·'), `gas ${h.gasEstUsd}`] : []),
  ].join(' ');
  process.stdout.write(`${headerLine}\n`);
  if (screen.title) process.stdout.write(`${color.bold(screen.title)}\n`);
  process.stdout.write(divider());

  for (const block of screen.body) {
    renderBlock(block);
  }

  if (screen.actions.length) {
    process.stdout.write('\nActions:\n');
    for (const a of screen.actions) {
      const hot = a.hotkey ? `[${a.hotkey}] ` : '    ';
      const tone =
        a.tone === 'danger'
          ? color.red
          : a.tone === 'warn'
            ? color.yellow
            : a.tone === 'muted'
              ? color.dim
              : color.green;
      process.stdout.write(`  ${hot}${tone(a.label)} ${color.dim(`(${a.id})`)}\n`);
    }
  }

  if (screen.hints?.length) {
    process.stdout.write('\n');
    for (const h of screen.hints) process.stdout.write(`${color.dim(h)}\n`);
  }
}

function renderBlock(b: Block): void {
  switch (b.type) {
    case 'text': {
      const tone =
        b.tone === 'error'
          ? color.red
          : b.tone === 'warn'
            ? color.yellow
            : b.tone === 'success'
              ? color.green
              : (s: string) => s;
      process.stdout.write(`${tone(b.text)}\n`);
      return;
    }
    case 'divider': {
      process.stdout.write(divider());
      return;
    }
    case 'kv': {
      const t = new Table({
        chars: tableChars(),
        style: { 'padding-left': 0, 'padding-right': 2, head: [], border: [] },
      });
      for (const [k, v] of b.pairs) t.push([color.dim(k), v]);
      process.stdout.write(`${t.toString()}\n`);
      return;
    }
    case 'table': {
      const t = new Table({
        head: b.headers,
        chars: tableChars(),
        style: useColor ? {} : { head: [], border: [] },
      });
      for (const row of b.rows) t.push(row);
      process.stdout.write(`${t.toString()}\n`);
      return;
    }
    case 'safety': {
      renderSafety(b.gates);
      return;
    }
    case 'holding': {
      const line = `Holding ${color.bold(b.amount)} ${b.symbol}  ${color.dim('·')}  ${b.usd}  ${color.dim('·')}  PnL ${b.pnlUsd} (${b.pnlPct})`;
      process.stdout.write(`${line}\n`);
      return;
    }
    case 'spinner': {
      process.stdout.write(`${color.dim('⏳')} ${b.label}\n`);
      return;
    }
  }
}

function renderSafety(gates: SafetyGate[]): void {
  const t = new Table({
    head: ['gate', 'value', 'level'],
    chars: tableChars(),
    style: useColor ? {} : { head: [], border: [] },
  });
  for (const g of gates) {
    const lvl =
      g.level === 'block'
        ? color.red('BLOCK')
        : g.level === 'warn'
          ? color.yellow('WARN')
          : color.green('ok');
    t.push([g.label, g.value, lvl]);
  }
  process.stdout.write(`${t.toString()}\n`);
}

function divider(): string {
  return color.dim('─'.repeat(Math.min(70, (process.stdout.columns || 70) - 1))) + '\n';
}

function tableChars(): Table.TableConstructorOptions['chars'] {
  if (!useColor) {
    return {
      top: '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      bottom: '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      left: '',
      'left-mid': '',
      mid: '',
      'mid-mid': '',
      right: '',
      'right-mid': '',
      middle: ' ',
    };
  }
  return undefined as unknown as Table.TableConstructorOptions['chars'];
}

// -- generic structured renderer (for non-Screen outputs) -------------------

export function renderTable(headers: string[], rows: string[][], opts: RenderOpts = {}): void {
  if (opts.asJson || opts.json) {
    emitJson({
      headers,
      rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
    });
    return;
  }
  const t = new Table({ head: headers, chars: tableChars(), style: useColor ? {} : { head: [], border: [] } });
  for (const r of rows) t.push(r);
  process.stdout.write(`${t.toString()}\n`);
}

export function renderKv(pairs: [string, string][], opts: RenderOpts = {}): void {
  if (opts.asJson || opts.json) {
    emitJson(Object.fromEntries(pairs));
    return;
  }
  for (const [k, v] of pairs) process.stdout.write(`${color.dim(k.padEnd(18))}  ${v}\n`);
}

export const log = consola;
export { color };
