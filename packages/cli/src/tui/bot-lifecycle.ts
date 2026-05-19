// Telegram bot lifecycle wiring — referenced by tui/main.ts (start on mount) and
// the `T` hotkey (toggle at runtime). Per plan §"Telegram bot UX — Lifecycle":
//   - bot runs in the SAME process / same event loop as the TUI
//   - same DispatcherContext is shared (one source of truth for safety + audit log)
//   - same zustand store is shared so phone trades update the TUI positions list
//   - graceful shutdown on quit with a 2s timeout
//
// The `@0xsyncroot/opentrade-bot` package ships in Phase 4. We import it dynamically
// and degrade gracefully when it's not installed — that way Phase 3 TUI works
// today and seamlessly picks up the bot once Phase 4 lands.

import type { DispatcherContext } from '@0xsyncroot/opentrade-core/actions';
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

export interface BotModule {
  startBot: (args: StartBotArgs) => Promise<BotHandle>;
}

/** Decide if bot SHOULD attempt to start based on config. */
export function botShouldStart(config: OpentradeConfig | undefined): boolean {
  if (!config?.telegram) return false;
  if ((config.telegram as { disabled?: boolean }).disabled === true) return false;
  return Boolean(config.telegram.botToken && config.telegram.ownerChatId);
}

/** Resolve the bot module dynamically — tolerate missing dep. */
export async function loadBotModule(): Promise<BotModule | null> {
  try {
    // The Phase 4 bot package exports `startBot` from its `/start` subpath.
    // Wrapped in eval so bundlers don't try to resolve at build time.
    const moduleId = '@0xsyncroot/opentrade-bot/start';
    const mod = (await import(/* @vite-ignore */ moduleId)) as Partial<BotModule>;
    if (typeof mod.startBot === 'function') return mod as BotModule;
    return null;
  } catch {
    return null;
  }
}

/**
 * Start the bot if configured and the bot package is importable.
 * Always resolves (never throws) — callers read status from the store.
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
  args.setBot({ status: 'starting', error: undefined });
  const mod = await loadBotModule();
  if (!mod) {
    args.setBot({
      status: 'off',
      error: 'bot package not installed',
      handle: undefined,
    });
    return undefined;
  }
  try {
    const handle = await mod.startBot({
      config: args.config,
      dispatcherCtx: args.dispatcherCtx,
      store: args.store,
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
