// Telegram bot lifecycle wiring — referenced by tui/main.ts (start on mount) and
// the `T` hotkey (toggle at runtime). Per plan §"Telegram bot UX — Lifecycle":
//   - bot runs in the SAME process / same event loop as the TUI
//   - same DispatcherContext is shared (one source of truth for safety + audit log)
//   - same zustand store is shared so phone trades update the TUI positions list
//   - graceful shutdown on quit with a 2s timeout
//
// IMPORTANT (P0-1 + P0-2): the bot module is statically imported below, NOT
// dynamic-from-variable. tsup `noExternal: [/^@hiepht\/opentrade/]` then inlines
// the bot source (and core) into `dist/tui/main.js`. grammY remains external,
// loaded from node_modules at runtime via the cli's `dependencies` field. We
// guard the call site with try/catch so a misconfigured runtime can't crash
// module evaluation.

import type { DispatcherContext } from '@hiepht/opentrade-core/actions';
import type { Chain } from '@hiepht/opentrade-core/chains';
import * as botModule from '@hiepht/opentrade-bot/start';
import type { OpentradeConfig } from './hooks/useConfig.js';
import type { BotHandle, TuiState } from './store/index.js';

export interface StartBotArgs {
  config: OpentradeConfig;
  dispatcherCtx: DispatcherContext;
  /** Read/write access to zustand store so bot trades reflect in the TUI. */
  store: {
    getState: () => TuiState;
    setState: (partial: Partial<TuiState> | ((s: TuiState) => Partial<TuiState>)) => void;
  };
}

/** Decide if bot SHOULD attempt to start based on config. */
export function botShouldStart(config: OpentradeConfig | undefined): boolean {
  if (!config?.telegram) return false;
  if ((config.telegram as { disabled?: boolean }).disabled === true) return false;
  return Boolean(config.telegram.botToken && config.telegram.ownerChatId);
}

/**
 * Start the bot if configured and the bot package is importable.
 * Always resolves (never throws) — callers read status from the store.
 *
 * Unpacks the canonical config shape (`config.telegram.botToken`,
 * `config.telegram.ownerChatId`, `config.wallets`, `config.defaultChain`) and
 * passes it in the shape `startBot` expects (P0-2 fix).
 */
export async function startBotIfConfigured(args: {
  config: OpentradeConfig | undefined;
  dispatcherCtx: DispatcherContext;
  setBot: (s: { status?: 'off' | 'starting' | 'connected' | 'error'; error?: string | undefined; handle?: BotHandle | undefined }) => void;
  store: StartBotArgs['store'];
}): Promise<BotHandle | undefined> {
  if (!args.config || !botShouldStart(args.config)) {
    args.setBot({ status: 'off', error: undefined, handle: undefined });
    return undefined;
  }

  // Sanity: the static import should always succeed in a built cli (the bot is
  // bundled into dist/tui/main.js). If a future refactor breaks this we fall
  // back to a clear error state instead of crashing the TUI.
  if (typeof botModule.startBot !== 'function') {
    args.setBot({
      status: 'error',
      error: 'bot module missing startBot export',
      handle: undefined,
    });
    return undefined;
  }

  args.setBot({ status: 'starting', error: undefined });

  // Build the args the bot actually expects (see packages/bot/src/start.ts
  // StartBotOpts).
  const telegramBotToken = args.config.telegram?.botToken;
  const telegramOwnerChatId = args.config.telegram?.ownerChatId;
  if (!telegramBotToken || telegramOwnerChatId === undefined) {
    args.setBot({
      status: 'off',
      error: 'telegram bot token or owner chat id missing',
      handle: undefined,
    });
    return undefined;
  }

  // The canonical config types `wallets` as `Partial<Record<Chain, string>>`
  // already — pass through.
  const wallets = (args.config.wallets ?? {}) as Partial<Record<Chain, string>>;
  const defaultChain: Chain = (args.config.defaultChain ?? 'base') as Chain;

  // P1-C: adapter mapping bot's BotEventStore.pushTradeEvent → zustand
  // tradeEventNonce bump. Polling hooks subscribe to tradeEventNonce so a
  // Telegram trade triggers an immediate holdings refetch in the TUI.
  // Event shape from packages/bot/src/start.ts:33 (TradeEvent).
  const eventStoreAdapter = {
    pushTradeEvent: (_event: { intent: unknown; result?: unknown; timestampUtc: string }) => {
      args.store.setState((s) => ({
        tradeEventNonce: (s.tradeEventNonce ?? 0) + 1,
      }));
    },
  };

  try {
    const rawHandle = await botModule.startBot({
      telegramBotToken,
      telegramOwnerChatId: String(telegramOwnerChatId),
      dispatcherCtx: args.dispatcherCtx,
      wallets,
      defaultChain,
      store: eventStoreAdapter,
    });

    // P1-B fix: capture the unsubscribe handle from onStatusChange so the
    // listener is torn down when the bot stops. Without this, each T-toggle
    // cycle leaks a listener and produces duplicate setBot() calls.
    const unsubStatus = rawHandle.onStatusChange((s) => {
      // BotStatus union from start.ts maps directly to the TUI store union.
      args.setBot({ status: s });
    });

    // Wrap stop() so callers (TUI quit / T-toggle / stopBotSafely) clean up
    // the status listener as part of the stop flow.
    const handle: BotHandle = {
      ...rawHandle,
      stop: async () => {
        try {
          unsubStatus();
        } catch {
          /* */
        }
        await rawHandle.stop();
      },
    };

    args.setBot({ status: 'connected', error: undefined, handle });
    return handle;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    args.setBot({ status: 'error', error: msg, handle: undefined });
    return undefined;
  }
}

/**
 * Stop the running bot with a 2s timeout fallback so a stuck `stop()` can't
 * block quit.
 */
export async function stopBotSafely(handle: BotHandle | undefined): Promise<void> {
  if (!handle) return;
  await Promise.race([
    handle.stop(),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]).catch(() => {
    // swallow — quit must proceed regardless
  });
}
