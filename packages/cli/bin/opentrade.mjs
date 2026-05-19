#!/usr/bin/env node
// opentrade entry shim — dispatch:
//   zero-arg + TTY  →  lazy import Ink TUI
//   any arg / non-TTY / --plain  →  citty fast-path subcommands
//
// Keeps cold start <50ms for `opentrade buy ...` (no React/Ink load).

const args = process.argv.slice(2);
const hasPlain = args.includes('--plain');
const isTTY = process.stdin.isTTY && process.stdout.isTTY;
const wantsTUI = args.length === 0 && isTTY && !hasPlain;

const target = wantsTUI ? '../dist/tui/main.js' : '../dist/cli/main.js';

try {
  await import(target);
} catch (err) {
  // Surface load error clearly
  console.error('opentrade: failed to load', target);
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
