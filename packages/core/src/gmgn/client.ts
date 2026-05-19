// HTTP client for GMGN openapi.gmgn.ai. Ed25519-signs every critical-tier call,
// passes `X-APIKEY` on all calls, supports per-chain config.
//
// The shape mirrors bin/gmgn_api.py (Python reference) so we can swap one for
// the other during dev/debug. Endpoint methods live in ./endpoints.ts.

import { fetch as undiciFetch } from 'undici';
import { buildMessage, signEd25519 } from './signer.js';
import type { GmgnEnvelope } from './types.js';

export const GMGN_HOST = 'https://openapi.gmgn.ai';

export interface ClientConfig {
  apiKey: string;
  privateKeyPem?: string;
  privateKeyPassphrase?: string;
  /** Optional default chain header param injected into all calls. */
  defaultChain?: string;
  /** Override base URL — useful for tests / staging. */
  host?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** When true, log redacted requests to stderr. */
  verbose?: boolean;
}

export interface RequestOpts {
  method: 'GET' | 'POST';
  subPath: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  /** Critical-tier endpoints require Ed25519 signing. */
  critical?: boolean;
}

export class GmgnError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly body: string;
  readonly subPath: string;

  constructor(opts: { status: number; code?: number; body: string; subPath: string; message: string }) {
    super(opts.message);
    this.name = 'GmgnError';
    this.status = opts.status;
    if (opts.code !== undefined) this.code = opts.code;
    this.body = opts.body;
    this.subPath = opts.subPath;
  }
}

export class GmgnClient {
  private readonly cfg: ClientConfig;

  constructor(cfg: ClientConfig) {
    if (!cfg.apiKey) throw new Error('GmgnClient: apiKey required');
    this.cfg = { host: GMGN_HOST, timeoutMs: 30_000, ...cfg };
  }

  async call<T = unknown>(opts: RequestOpts): Promise<T> {
    const ts = Math.floor(Date.now() / 1000);
    const clientId = crypto.randomUUID();

    // Build query map (with timestamp + client_id appended)
    const query: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v === undefined || v === null) continue;
      query[k] = typeof v === 'boolean' ? String(v) : v;
    }
    query.timestamp = ts;
    query.client_id = clientId;

    const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : '';

    const headers: Record<string, string> = {
      'X-APIKEY': this.cfg.apiKey,
      'Content-Type': 'application/json',
    };

    if (opts.critical) {
      if (!this.cfg.privateKeyPem) {
        throw new Error(
          `GmgnClient: critical-tier endpoint ${opts.subPath} requires Ed25519 private key`,
        );
      }
      const message = buildMessage(opts.subPath, query, bodyStr, ts);
      headers['X-Signature'] = signEd25519(message, this.cfg.privateKeyPem, this.cfg.privateKeyPassphrase);
    }

    // Build URL with sorted query (sorting also matches signing canonicalization)
    const qs = new URLSearchParams();
    for (const k of Object.keys(query).sort()) {
      qs.append(k, String(query[k]));
    }
    const url = `${this.cfg.host}${opts.subPath}?${qs.toString()}`;

    if (this.cfg.verbose) {
      const masked = `${this.cfg.apiKey.slice(0, 10)}***`;
      const sigShort = headers['X-Signature'] ? `${headers['X-Signature']!.slice(0, 20)}...` : '-';
      process.stderr.write(
        `[gmgn] ${opts.method} ${opts.subPath}  api=${masked}  sig=${sigShort}\n`,
      );
      if (bodyStr) process.stderr.write(`[gmgn] body = ${bodyStr}\n`);
    }

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url, {
        method: opts.method,
        headers,
        body: opts.method === 'POST' && bodyStr ? bodyStr : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(to);
    }

    const text = await res.text();

    if (!res.ok) {
      throw new GmgnError({
        status: res.status,
        body: text,
        subPath: opts.subPath,
        message: `GMGN ${opts.method} ${opts.subPath} → HTTP ${res.status}: ${text.slice(0, 300)}`,
      });
    }

    let parsed: GmgnEnvelope<T>;
    try {
      parsed = JSON.parse(text) as GmgnEnvelope<T>;
    } catch {
      throw new GmgnError({
        status: res.status,
        body: text,
        subPath: opts.subPath,
        message: `GMGN ${opts.subPath} returned non-JSON: ${text.slice(0, 200)}`,
      });
    }

    if (parsed.code !== undefined && parsed.code !== 0 && parsed.code !== 200) {
      const reason = parsed.reason ?? parsed.message ?? 'unknown error';
      throw new GmgnError({
        status: res.status,
        code: parsed.code,
        body: text,
        subPath: opts.subPath,
        message: `GMGN ${opts.subPath} returned code=${parsed.code}: ${reason}`,
      });
    }

    return parsed.data;
  }
}
