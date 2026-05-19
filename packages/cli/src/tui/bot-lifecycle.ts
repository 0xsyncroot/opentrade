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

  try {
    const handle = await botModule.startBot({
      telegramBotToken,
      telegramOwnerChatId: String(telegramOwnerChatId),
      dispatcherCtx: args.dispatcherCtx,
      wallets,
      defaultChain,
    });

    // P1-7 fix: subscribe to status changes so the StatusBar reflects the
    // bot's actual state (including async errors that happen AFTER startBot
    // returns successfully). Without this, a polling crash inside grammy is
    // only visible via the bus internal state.
    handle.onStatusChange((s) => {
      // Map BotStatus from start.ts (off/starting/connected/error) directly
      // — the union types are identical.
      args.setBot({ status: s });
    });

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
