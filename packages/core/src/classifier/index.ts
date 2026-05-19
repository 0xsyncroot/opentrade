// Pure function: classify user input from the TUI input bar (or Telegram message
// text) into one of EVM CA / Solana CA / slash-command / numeric / fuzzy alias.
//
// Race-safe by design: pure synchronous classifier — TUI wraps the fetch that
// follows in AbortController + seq guard.

import type { Chain } from '../chains/index.js';

const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type InputClass =
  | { kind: 'evm_ca'; address: string; chainHint?: Chain }
  | { kind: 'sol_ca'; address: string }
  | { kind: 'slash'; raw: string }
  | { kind: 'number'; value: number }
  | { kind: 'alias'; key: string }
  | { kind: 'url'; url: string; extractedAddress?: string; chainHint?: Chain }
  | { kind: 'empty' }
  | { kind: 'unknown'; raw: string };

const EXPLORER_HOST_TO_CHAIN: Record<string, Chain> = {
  'basescan.org': 'base',
  'etherscan.io': 'eth',
  'bscscan.com': 'bsc',
  'solscan.io': 'sol',
  'dexscreener.com': 'base', // ambiguous — chain hint refined later by URL path
  'gmgn.ai': 'base',
};

function tryExtractFromUrl(text: string): InputClass | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  const hint = EXPLORER_HOST_TO_CHAIN[host];
  // Try to find an address-looking segment in pathname
  const segments = url.pathname.split('/').filter(Boolean);
  for (const seg of segments) {
    if (EVM_ADDR_RE.test(seg)) {
      return { kind: 'url', url: text, extractedAddress: seg, chainHint: hint };
    }
    if (SOL_ADDR_RE.test(seg)) {
      return { kind: 'url', url: text, extractedAddress: seg, chainHint: 'sol' };
    }
  }
  return { kind: 'url', url: text, chainHint: hint };
}

export function classifyInput(rawInput: string, ctx?: { defaultChain?: Chain }): InputClass {
  if (rawInput == null) return { kind: 'empty' };
  // Strip surrounding whitespace + newlines (paste of multi-line)
  const trimmed = rawInput.trim().replace(/\r?\n/g, ' ');
  if (!trimmed) return { kind: 'empty' };

  // Slash commands take priority — before any whitespace stripping that would
  // mangle "/buy 0.05".
  if (trimmed.startsWith('/')) {
    return { kind: 'slash', raw: trimmed };
  }

  // If the input looks like a URL, try to extract an address from the path.
  if (/^https?:\/\//i.test(trimmed)) {
    const u = tryExtractFromUrl(trimmed);
    if (u) return u;
  }

  // Single-token (no internal whitespace) candidates: address or alias key
  const singleToken = trimmed.includes(' ') ? trimmed.split(/\s+/, 1)[0]! : trimmed;

  if (EVM_ADDR_RE.test(singleToken)) {
    const hint = ctx?.defaultChain && ctx.defaultChain !== 'sol' ? ctx.defaultChain : undefined;
    return hint !== undefined
      ? { kind: 'evm_ca', address: singleToken.toLowerCase(), chainHint: hint }
      : { kind: 'evm_ca', address: singleToken.toLowerCase() };
  }

  if (SOL_ADDR_RE.test(singleToken)) {
    return { kind: 'sol_ca', address: singleToken };
  }

  // Pure number (treated as amount in pending-buy context, or preset index)
  if (/^\d+(?:\.\d+)?$/.test(singleToken)) {
    const v = Number(singleToken);
    if (Number.isFinite(v)) return { kind: 'number', value: v };
  }

  // Alphanumeric short → alias key (max 32 chars, no spaces, no `/`)
  if (/^[a-zA-Z0-9_-]{1,32}$/.test(singleToken)) {
    return { kind: 'alias', key: singleToken.toLowerCase() };
  }

  return { kind: 'unknown', raw: trimmed };
}

// -- Slash command parser ---------------------------------------------------

export type SlashCmd =
  | { cmd: 'buy'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'sell'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'limit'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'chain'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'ps'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'info'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'wallet'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'feed'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'alias'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'send'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'ab'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'config'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'help'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'quit'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'recent'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'risk'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'orders'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'keygen'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'init'; args: string[]; flags: Record<string, string | boolean> }
  | { cmd: 'unknown'; raw: string };

const KNOWN_CMDS = new Set([
  'buy',
  'sell',
  'limit',
  'chain',
  'ps',
  'info',
  'wallet',
  'feed',
  'alias',
  'send',
  'ab',
  'config',
  'help',
  'quit',
  'recent',
  'risk',
  'orders',
  'keygen',
  'init',
]);

export function parseSlash(raw: string): SlashCmd {
  const trimmed = raw.replace(/^\//, '').trim();
  if (!trimmed) return { cmd: 'help', args: [], flags: {} };
  const tokens = trimmed.split(/\s+/);
  const cmd = tokens[0]!.toLowerCase();
  if (!KNOWN_CMDS.has(cmd)) return { cmd: 'unknown', raw: raw };

  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      if (eq > -1) {
        flags[t.slice(2, eq)] = t.slice(eq + 1);
      } else {
        const next = tokens[i + 1];
        if (next && !next.startsWith('--')) {
          flags[t.slice(2)] = next;
          i++;
        } else {
          flags[t.slice(2)] = true;
        }
      }
    } else {
      args.push(t);
    }
  }

  return { cmd: cmd as Exclude<SlashCmd['cmd'], 'unknown'>, args, flags };
}

export const SLASH_COMMANDS_HELP: { cmd: string; usage: string; help: string }[] = [
  { cmd: 'buy', usage: '/buy <amount>', help: 'Buy current token with native amount' },
  { cmd: 'sell', usage: '/sell <percent>', help: 'Sell percent of current holding' },
  { cmd: 'limit', usage: '/limit buy|sell <price>', help: 'Place limit order' },
  { cmd: 'chain', usage: '/chain base|sol|eth|bsc', help: 'Switch active chain' },
  { cmd: 'ps', usage: '/ps', help: 'List open positions' },
  { cmd: 'info', usage: '/info', help: 'Expanded token info card' },
  { cmd: 'wallet', usage: '/wallet', help: 'Wallet summary across chains' },
  { cmd: 'feed', usage: '/feed trending|sm|kol|trenches', help: 'Read-only signals' },
  { cmd: 'alias', usage: '/alias save|ls|rm <name>', help: 'Saved trade presets' },
  { cmd: 'send', usage: '/send <amount> <to|@alias>', help: 'Same-chain transfer' },
  { cmd: 'ab', usage: '/ab add|ls|rm', help: 'Address book' },
  { cmd: 'orders', usage: '/orders list|status|cancel', help: 'GMGN strategy orders' },
  { cmd: 'risk', usage: '/risk allow|deny', help: 'Toggle risky-token override' },
  { cmd: 'config', usage: '/config show|get|set', help: 'Open config' },
  { cmd: 'recent', usage: '/recent', help: 'Recent CAs' },
  { cmd: 'keygen', usage: '/keygen', help: 'Generate new Ed25519 keypair' },
  { cmd: 'init', usage: '/init', help: 'Re-run first-time wizard' },
  { cmd: 'help', usage: '/help', help: 'Show help overlay' },
  { cmd: 'quit', usage: '/quit', help: 'Exit opentrade' },
];
