// Single-owner whitelist middleware (plan §"Telegram bot UX": auth via
// `TELEGRAM_OWNER_CHAT_ID`). Drops updates from any other chat silently.
//
// Adds a sliding-window rate limiter (per chat id) to harden against accidental
// or malicious flooding if the bot token leaks somehow.

import type { Context, MiddlewareFn, NextFunction } from 'grammy';

export interface AuthOptions {
  ownerChatId: string; // string form of numeric chat_id
  rateLimit?: {
    perMinute?: number; // default 30
  };
  onDrop?: (info: { chatId: number | undefined; reason: 'whitelist' | 'rate_limit' }) => void;
}

interface RateBucket {
  windowStart: number; // ms timestamp
  count: number;
}

export class WhitelistAuth {
  private readonly ownerChatId: number;
  private readonly perMinute: number;
  private readonly buckets = new Map<number, RateBucket>();
  private readonly onDrop?: AuthOptions['onDrop'];

  constructor(opts: AuthOptions) {
    this.ownerChatId = Number(opts.ownerChatId);
    if (!Number.isFinite(this.ownerChatId)) {
      throw new Error(`WhitelistAuth: ownerChatId must be numeric (got ${opts.ownerChatId})`);
    }
    this.perMinute = opts.rateLimit?.perMinute ?? 30;
    if (opts.onDrop) this.onDrop = opts.onDrop;
  }

  /**
   * Returns true if the update is allowed through, false if dropped. Pure
   * decision — handlers separately invoke `middleware()` or test this directly.
   */
  isAllowed(chatId: number | undefined): boolean {
    if (chatId === undefined || chatId !== this.ownerChatId) {
      this.onDrop?.({ chatId, reason: 'whitelist' });
      return false;
    }
    const now = Date.now();
    const bucket = this.buckets.get(chatId);
    if (!bucket || now - bucket.windowStart > 60_000) {
      this.buckets.set(chatId, { windowStart: now, count: 1 });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > this.perMinute) {
      this.onDrop?.({ chatId, reason: 'rate_limit' });
      return false;
    }
    return true;
  }

  /** grammY middleware: drop silently if not whitelisted. */
  middleware<C extends Context>(): MiddlewareFn<C> {
    return async (ctx: C, next: NextFunction): Promise<void> => {
      const chatId = ctx.chat?.id;
      if (!this.isAllowed(chatId)) {
        // Silent drop — never reply. Telegram errors leak presence info, so we
        // pretend the bot is unreachable.
        return;
      }
      await next();
    };
  }
}
