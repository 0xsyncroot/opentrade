// LRU cache mapping a short UUID to a full Intent payload.
//
// Why this exists: Telegram callback_data is capped at 64 bytes (UTF-8). A BuyIntent
// with TP/SL tiers can easily exceed that. We send `act:<uuid8>` over the wire,
// keep the actual Intent in this in-memory cache, and resolve it server-side
// when the user taps the button.

import crypto from 'node:crypto';
import type { Intent } from '../schemas/index.js';

export interface CallbackCacheOptions {
  capacity?: number;
  ttlMs?: number;
}

type Entry = {
  intent: Intent;
  insertedAt: number;
};

export class CallbackCache {
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly map = new Map<string, Entry>();

  constructor(opts: CallbackCacheOptions = {}) {
    this.capacity = opts.capacity ?? 2000;
    this.ttlMs = opts.ttlMs ?? 30 * 60_000;
  }

  /** Store an Intent. Returns the short token to embed in callback_data. */
  put(intent: Intent): string {
    const id = crypto.randomBytes(6).toString('base64url'); // ~8 chars, safe in callback_data
    this.evictIfNeeded();
    this.map.set(id, { intent, insertedAt: Date.now() });
    return id;
  }

  get(id: string): Intent | undefined {
    const e = this.map.get(id);
    if (!e) return undefined;
    if (Date.now() - e.insertedAt > this.ttlMs) {
      this.map.delete(id);
      return undefined;
    }
    // LRU refresh: re-insert
    this.map.delete(id);
    this.map.set(id, e);
    return e.intent;
  }

  delete(id: string): void {
    this.map.delete(id);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  private evictIfNeeded(): void {
    while (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.map.delete(oldestKey);
    }
  }
}
