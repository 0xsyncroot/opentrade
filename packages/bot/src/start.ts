// Programmatic bot entry — `startBot()`.
//
// This is the function the TUI / any embedding host dynamic-imports. It wires
// the grammY `Bot`, installs all middleware + handlers, and returns a
// `BotHandle` with graceful stop + a status observer.
//
// `main.ts` (standalone, headless VPS deploy) is a thin wrapper around this:
// load config from disk, build a `DispatcherContext` itself, then call
// `startBot(...)` and await SIGTERM.

import { Bot, type Context } from 'grammy';
import {
  actions as actionsNs,
  classifier as classifierNs,
  schemas,
} from '@hiepht/opentrade-core';
import { WhitelistAuth } from './auth.js';
import { makeCallbackRouter } from './callback-router.js';
import { renderScreen } from './render/tg-renderer.js';
import { RiskGateState } from './keyboards/risk-gate.js';
import { makePasteHandler } from './handlers/paste-ca.js';
import { makeSlashHandler } from './handlers/slash.js';
import { makeStartHandler } from './handlers/start.js';
import { makeUnlockHandler } from './handlers/unlock.js';

// -- Public types -----------------------------------------------------------

export interface BotEventStore {
  /** Called once per resolved Intent (success or failure). */
  pushTradeEvent(event: TradeEvent): void;
}

export interface TradeEvent {
  intent: schemas.Intent;
  result?: actionsNs.DispatchResult;
  timestampUtc: string;
}

export type BotStatus = 'starting' | 'connected' | 'off' | 'error';

export interface BotHandle {
  stop(): Promise<void>;
  status(): BotStatus;
  onStatusChange(cb: (s: BotStatus) => void): () => void;
}

export interface StartBotOpts {
  /** Telegram bot HTTP API token from @BotFather. */
  telegramBotToken: string;
  /** Owner chat id (single-owner whitelist; plan §"Telegram bot UX"). */
  telegramOwnerChatId: string;
  /** Shared dispatcher context. Same instance as the TUI when running embedded. */
  dispatcherCtx: actionsNs.DispatcherContext;
  /** Per-chain wallet map (used by the paste handler when fetching snapshots). */
  wallets: Partial<Record<schemas.Chain, string>>;
  defaultChain?: schemas.Chain;
  /** Polling (default) vs webhook. Plan §"Polling vs webhook". */
  mode?: 'polling' | 'webhook';
  webhookPort?: number;
  /** Optional cross-process event sink. */
  store?: BotEventStore;
  /** Optional callback cache override (tests). */
  cache?: actionsNs.CallbackCache;
  /** Optional logger override. */
  logger?: { info: (m: string) => void; error: (m: string) => void };
}

// -- Implementation ---------------------------------------------------------

class StatusBus {
  private current: BotStatus = 'starting';
  private observers = new Set<(s: BotStatus) => void>();
  set(s: BotStatus): void {
    this.current = s;
    for (const obs of this.observers) obs(s);
  }
  get(): BotStatus {
    return this.current;
  }
  subscribe(cb: (s: BotStatus) => void): () => void {
    this.observers.add(cb);
    return () => this.observers.delete(cb);
  }
}

export async function startBot(opts: StartBotOpts): Promise<BotHandle> {
  const log = opts.logger ?? defaultLogger();
  const bus = new StatusBus();
  bus.set('starting');

  const cache = opts.cache ?? new actionsNs.CallbackCache({ capacity: 5000, ttlMs: 30 * 60_000 });
  const riskGate = new RiskGateState();
  const defaultChain: schemas.Chain = opts.defaultChain ?? 'base';

  // Wrap the supplied DispatcherContext so we can mirror events into the optional
  // BotEventStore without double-writing audit lines.
  const dispatcherCtx: actionsNs.DispatcherContext = wrapDispatcherCtx(opts.dispatcherCtx, opts.store);

  const bot = new Bot(opts.telegramBotToken);

  const auth = new WhitelistAuth({
    ownerChatId: opts.telegramOwnerChatId,
    rateLimit: { perMinute: 30 },
    onDrop: ({ chatId, reason }) => {
      log.info(`auth drop chat=${chatId} reason=${reason}`);
    },
  });

  // Single global whitelist guard.
  bot.use(auth.middleware());

  // Handlers — composed against `bot` (Composer).
  const startHandler = makeStartHandler({
    wallets: opts.wallets,
    defaultChain,
  });
  const slashHandler = makeSlashHandler({
    cache,
    dispatcherCtx,
    wallets: opts.wallets,
    defaultChain,
    render: renderScreen,
    client: dispatcherCtx.client,
  });
  const unlockHandler = makeUnlockHandler();

  const pasteHandler = makePasteHandler({
    client: dispatcherCtx.client,
    cache,
    wallets: opts.wallets,
    defaultChain,
    riskGate,
    render: renderScreen,
    onRiskConfirm: async (ctx, intent) => {
      const result = await actionsNs.dispatch(dispatcherCtx, intent);
      await replyDispatchResult(ctx, result, intent, cache);
    },
  });

  // /start, /unlock — explicit commands need to land before the generic text
  // handler so the slash text isn't swallowed.
  bot.command('start', startHandler);
  bot.command('unlock', unlockHandler);
  bot.hears(/^\//, slashHandler);
  // Any other text → classify + paste-CA flow.
  bot.on('message:text', pasteHandler);

  // callback_query → dispatcher.
  const callbackRouter = makeCallbackRouter({
    cache,
    dispatcherCtx,
    followUp: async (ctx, result, intent) => {
      await replyDispatchResult(ctx, result, intent, cache);
    },
  });
  bot.on('callback_query:data', callbackRouter);

  // Generic error handler — promote to status observer.
  bot.catch((err) => {
    log.error(`grammy error: ${err.message}`);
    bus.set('error');
  });

  // Launch
  let stopped = false;
  let polling: Promise<void> | undefined;
  if ((opts.mode ?? 'polling') === 'polling') {
    polling = bot
      .start({
        onStart: () => {
          bus.set('connected');
          log.info(`bot online (polling) — owner=${opts.telegramOwnerChatId}`);
        },
      })
      .catch((err) => {
        log.error(`polling crashed: ${(err as Error).message}`);
        bus.set('error');
      });
  } else {
    // Webhook mode is intentionally left as a stub for the MVP — polling is
    // fine in production for a single-owner bot (plan §"Polling vs webhook").
    log.info('webhook mode requested — use polling for v1; webhook lands in v2.');
    bus.set('connected');
  }

  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        await bot.stop();
      } catch (err) {
        log.error(`stop failed: ${(err as Error).message}`);
      }
      bus.set('off');
      // Best-effort drain of in-flight polling promise.
      if (polling) {
        try {
          await polling;
        } catch {
          /* already logged */
        }
      }
    },
    status() {
      return bus.get();
    },
    onStatusChange(cb) {
      return bus.subscribe(cb);
    },
  };
}

// -- helpers -----------------------------------------------------------------

function wrapDispatcherCtx(
  ctx: actionsNs.DispatcherContext,
  store: BotEventStore | undefined,
): actionsNs.DispatcherContext {
  if (!store) return ctx;
  const originalRecord = ctx.recordTrade;
  return {
    ...ctx,
    recordTrade: async (rec) => {
      if (originalRecord) await originalRecord(rec);
      try {
        store.pushTradeEvent({
          intent: rec.intent,
          result: rec.result
            ? { ok: true, result: rec.result }
            : rec.error
              ? { ok: false, reason: 'error', error: new Error(rec.error.message) }
              : undefined,
          timestampUtc: rec.timestampUtc,
        });
      } catch {
        /* never let store hooks kill the trade */
      }
    },
  };
}

async function replyDispatchResult(
  ctx: Context,
  result: actionsNs.DispatchResult,
  intent: schemas.Intent,
  _cache: actionsNs.CallbackCache,
): Promise<void> {
  if (result.ok) {
    const r = result.result;
    const summary = [
      `✅ ${intent.kind.toUpperCase()} dispatched`,
      r.orderId ? `order: ${r.orderId}` : undefined,
      r.txHash ? `tx: ${r.txHash}` : undefined,
      r.status ? `status: ${r.status}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');
    await ctx.reply(summary || '✅ done');
    return;
  }
  if (result.reason === 'cancelled') {
    await ctx.reply('Cancelled.');
    return;
  }
  if (result.reason === 'blocked') {
    await ctx.reply(
      `⛔ Trade blocked by safety gate.\nReasons: ${result.safety.reasons.join(', ')}`,
    );
    return;
  }
  await ctx.reply(`❌ ${result.error.message}`);
}

function defaultLogger(): { info: (m: string) => void; error: (m: string) => void } {
  return {
    info: (m) => process.stderr.write(`[bot] ${m}\n`),
    error: (m) => process.stderr.write(`[bot:err] ${m}\n`),
  };
}

export { renderScreen };
// Re-export shared types so embedders don't need to reach into core.
export type Intent = schemas.Intent;
export type DispatcherContext = actionsNs.DispatcherContext;
export { classifierNs as classifier };
