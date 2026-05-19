// `opentrade config {show|get|set|path}` — config CRUD.

import { defineCommand } from 'citty';
import { bootstrapLight, exitWithError, flag } from './_shared.js';
import { writeConfig } from '../config/load.js';
import { ConfigSchema, type OpentradeConfig } from '../config/schema.js';
import { emitJson, log, renderKv } from '../render/cli-renderer.js';

export const configCmd = defineCommand({
  meta: { name: 'config', description: 'show / get / set / path' },
  args: {
    op: { type: 'positional', required: true, description: 'show | get | set | path' },
    key: { type: 'positional', required: false, description: 'dot path (e.g. telegram.botToken)' },
    value: { type: 'positional', required: false, description: 'value for set (use JSON for non-string)' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    // `config` must work BEFORE the user sets up an API key (round-4 P1).
    // bootstrapLight() loads + parses config without requiring an API key
    // or constructing a GMGN client.
    const ctx = await bootstrapLight();
    const cfg = ctx.loaded.config;
    const paths = ctx.loaded.paths;
    switch (args.op) {
      case 'path': {
        if (flag(args as Record<string, unknown>, 'json')) emitJson({ paths });
        else renderKv(Object.entries(paths).map(([k, v]) => [k, String(v)]));
        return;
      }
      case 'show': {
        const safe = redact(cfg);
        if (flag(args as Record<string, unknown>, 'json')) emitJson(safe);
        else emitJson(safe);
        return;
      }
      case 'get': {
        if (!args.key) exitWithError('config get: <key> required');
        const v = pickPath(cfg, args.key);
        if (flag(args as Record<string, unknown>, 'json')) emitJson({ [args.key]: v });
        else log.info(typeof v === 'object' ? JSON.stringify(v) : String(v));
        return;
      }
      case 'set': {
        if (!args.key || args.value === undefined) exitWithError('config set: <key> <value> required');
        const updated = setPath(cfg, args.key, parseValue(args.value));
        const parsed = ConfigSchema.parse(updated);
        writeConfig(paths, parsed);
        log.success(`config.${args.key} updated`);
        return;
      }
      default:
        exitWithError(`unknown config op: ${args.op}`);
    }
  },
});

function redact(cfg: OpentradeConfig): unknown {
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(cfg));
  if (out.gmgn && typeof out.gmgn === 'object') {
    const g = out.gmgn as Record<string, unknown>;
    if (typeof g.apiKey === 'string' && g.apiKey.length > 0) {
      g.apiKey = `${(g.apiKey as string).slice(0, 6)}…${(g.apiKey as string).slice(-3)}`;
    }
    if (typeof g.privateKeyPassphrase === 'string' && g.privateKeyPassphrase.length > 0) {
      g.privateKeyPassphrase = '***';
    }
  }
  if (out.telegram && typeof out.telegram === 'object') {
    const t = out.telegram as Record<string, unknown>;
    if (typeof t.botToken === 'string' && t.botToken.length > 0) {
      const bt = t.botToken as string;
      t.botToken = `${bt.slice(0, 8)}…${bt.slice(-4)}`;
    }
  }
  return out;
}

function pickPath(obj: unknown, dotPath: string): unknown {
  let cur: unknown = obj;
  for (const part of dotPath.split('.')) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else return undefined;
  }
  return cur;
}

function setPath(obj: unknown, dotPath: string, value: unknown): Record<string, unknown> {
  const root: Record<string, unknown> = obj && typeof obj === 'object' ? { ...(obj as Record<string, unknown>) } : {};
  const parts = dotPath.split('.');
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    const next = cur[k];
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      cur[k] = { ...(next as Record<string, unknown>) };
    } else {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
  return root;
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
