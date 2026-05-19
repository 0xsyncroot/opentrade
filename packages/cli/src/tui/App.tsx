// Root App component — composes StatusBar + main panel + InputBar + Footer.
//
// Owns:
//   - the global hotkey listener (translates keystrokes to HotkeyEvents)
//   - the central Intent dispatcher (uses core/actions/dispatch)
//   - paste → classify → fetchTokenSnapshot race-safe pipeline
//   - modal stack rendering (ConfirmModal / HelpOverlay / SlashPalette)
//   - debounced "typing" flag that pauses background polling

import { Box, Text, useApp, useInput } from 'ink';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  actions as actionsApi,
  presets as presetsApi,
  services,
  views,
} from '@hiepht/opentrade-core';
import { GmgnError, type GmgnClient } from '@hiepht/opentrade-core/gmgn';
import type { DispatcherContext } from '@hiepht/opentrade-core/actions';
import { NATIVE_INPUT_TOKEN, type Chain } from '@hiepht/opentrade-core/chains';
import { classifier } from '@hiepht/opentrade-core';
import type { Intent, Screen } from '@hiepht/opentrade-core/schemas';
import { ConfirmModal, decideConfirmTier } from './components/ConfirmModal.js';
import { Footer } from './components/Footer.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { InfoExpanded } from './components/InfoExpanded.js';
import { InputBar } from './components/InputBar.js';
import { PositionsList } from './components/PositionsList.js';
import { RecentOverlay } from './components/RecentOverlay.js';
import { SlashPalette } from './components/SlashPalette.js';
import { StatusBar } from './components/StatusBar.js';
import { TokenCard } from './components/TokenCard.js';
import { mapHotkey } from './hooks/useHotkeys.js';
import { useAbortable } from './hooks/useAbortable.js';
import {
  useHoldingsQuery,
  useTokenSnapshotQuery,
} from './hooks/useTokenPolling.js';
import { useTuiStore, type ModalDescriptor } from './store/index.js';
import {
  startBotIfConfigured,
  stopBotSafely,
} from './bot-lifecycle.js';
import type { OpentradeConfig } from './hooks/useConfig.js';
import { resolvePaths } from '../config/paths.js';
import { scheduleSave } from './history-store.js';

const { fetchTokenSnapshot, listHoldings } = services;
const { buildBuyScreen, buildHeader, buildHomeScreen, buildInfoScreen, buildPositionsScreen, buildSellScreen } = views;
const { parseSlash } = classifier;
const { dispatch } = actionsApi;

/**
 * Convert a native amount (e.g. 0.05 ETH) into a wei-string suitable for
 * BuyIntent.amountWei. Mirrors the private helper in core/views/index.ts so
 * the slash `/buy` handler stays self-contained.
 */
function nativeToWeiString(chain: Chain, amountNative: number): string {
  const [whole, frac = ''] = amountNative.toString().split('.');
  const wholePart = BigInt(whole ?? '0');
  const decimals = chain === 'sol' ? 9 : 18;
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const fracPart = fracPadded ? BigInt(fracPadded) : 0n;
  const total = wholePart * 10n ** BigInt(decimals) + fracPart;
  return total.toString();
}

export interface AppProps {
  client: GmgnClient | undefined;
  config: OpentradeConfig | undefined;
  initialChain: Chain;
  walletAddress: string;
  /** When true, render even without a client (used in tests). */
  testMode?: boolean;
  /** Optional pre-loaded snapshot — testing only. */
  initialSnapshot?: import('@hiepht/opentrade-core/services').TokenSnapshot;
  /** Hook so tests can inspect dispatcher invocations. */
  onIntent?: (intent: Intent) => void;
  /** Override fetch — testing only. */
  fetchSnapshotImpl?: typeof fetchTokenSnapshot;
  /**
   * Override the history file path. Tests pass a tmp file; production leaves
   * undefined and we resolve via `resolvePaths().historyFile`.
   */
  historyFile?: string;
  /**
   * Disable the on-change history-save effect entirely. Tests that don't
   * care about persistence pass true to avoid touching the user's real
   * ~/.config/opentrade/history.json from a forked worker.
   */
  disableHistoryPersist?: boolean;
}

export const App: React.FC<AppProps> = (props) => {
  const { client, walletAddress, testMode } = props;
  const ink = useApp();

  // -- store wiring ---------------------------------------------------------
  const chain = useTuiStore((s) => s.chain);
  const setChain = useTuiStore((s) => s.setChain);
  const setWallet = useTuiStore((s) => s.setWallet);
  const currentScreen = useTuiStore((s) => s.currentScreen);
  const setCurrentScreen = useTuiStore((s) => s.setCurrentScreen);
  const currentToken = useTuiStore((s) => s.currentToken);
  const currentTokenAddr = useTuiStore((s) => s.currentTokenAddr);
  const setCurrentToken = useTuiStore((s) => s.setCurrentToken);
  const holdings = useTuiStore((s) => s.holdings);
  const setHoldings = useTuiStore((s) => s.setHoldings);
  const mode = useTuiStore((s) => s.mode);
  const setMode = useTuiStore((s) => s.setMode);
  const slashOpen = useTuiStore((s) => s.slashOpen);
  const openSlash = useTuiStore((s) => s.openSlash);
  const closeSlash = useTuiStore((s) => s.closeSlash);
  const helpOpen = useTuiStore((s) => s.helpOpen);
  const openHelp = useTuiStore((s) => s.openHelp);
  const closeHelp = useTuiStore((s) => s.closeHelp);
  const modalStack = useTuiStore((s) => s.modalStack);
  const pushModal = useTuiStore((s) => s.pushModal);
  const popModal = useTuiStore((s) => s.popModal);
  const inputHistory = useTuiStore((s) => s.inputHistory);
  const pushHistory = useTuiStore((s) => s.pushHistory);
  const historyIndex = useTuiStore((s) => s.historyIndex);
  const setHistoryIndex = useTuiStore((s) => s.setHistoryIndex);
  const isTyping = useTuiStore((s) => s.isTyping);
  const setTyping = useTuiStore((s) => s.setTyping);
  const statusMessage = useTuiStore((s) => s.statusMessage);
  const statusTone = useTuiStore((s) => s.statusTone);
  const setStatus = useTuiStore((s) => s.setStatus);
  const botStatus = useTuiStore((s) => s.botStatus);
  const botHandle = useTuiStore((s) => s.botHandle);
  const setBot = useTuiStore((s) => s.setBot);
  const overrideRisky = useTuiStore((s) => s.overrideRisky);
  const setOverrideRisky = useTuiStore((s) => s.setOverrideRisky);
  const recentOverlayOpen = useTuiStore((s) => s.recentOverlayOpen);
  const openRecentOverlay = useTuiStore((s) => s.openRecentOverlay);
  const closeRecentOverlay = useTuiStore((s) => s.closeRecentOverlay);

  // Local UI state (not shared with bot).
  const [inputBuffer, setInputBuffer] = useState('');
  const [paletteCursor, setPaletteCursor] = useState(0);
  const [positionsCursor, setPositionsCursor] = useState(0);
  const [recentCursor, setRecentCursor] = useState(0);
  const [view, setView] = useState<'home' | 'token' | 'info' | 'positions'>('home');

  const abortable = useAbortable();

  // -- one-time init --------------------------------------------------------
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    setChain(props.initialChain);
    setWallet(walletAddress);
    // If a test injected a snapshot, hydrate it.
    if (props.initialSnapshot) {
      setCurrentToken(props.initialSnapshot, props.initialSnapshot.token.address);
      setView('token');
    }
  }, [props.initialChain, props.initialSnapshot, setChain, setCurrentToken, setWallet, walletAddress]);

  // -- typing debounce → polling pause -------------------------------------
  const typingTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const markTyping = () => {
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 1000);
  };

  // -- persist input history on change (debounced 500ms) --------------------
  // Subscribe to inputHistory; whenever it changes, schedule a write. The
  // scheduleSave helper coalesces rapid mutations into a single fs write and
  // uses atomic rename so a crash mid-write can't corrupt the file.
  const resolvedHistoryFile = useMemo(() => {
    if (props.historyFile) return props.historyFile;
    if (props.disableHistoryPersist) return undefined;
    try {
      return resolvePaths().historyFile;
    } catch {
      return undefined;
    }
  }, [props.historyFile, props.disableHistoryPersist]);
  const firstHistoryEffect = useRef(true);
  useEffect(() => {
    if (props.disableHistoryPersist) return;
    if (!resolvedHistoryFile) return;
    // Skip the first run so the freshly-loaded hydration doesn't trigger a
    // write loop. We only persist user-driven additions.
    if (firstHistoryEffect.current) {
      firstHistoryEffect.current = false;
      return;
    }
    scheduleSave(resolvedHistoryFile, inputHistory);
  }, [inputHistory, resolvedHistoryFile, props.disableHistoryPersist]);

  // -- background polling ---------------------------------------------------
  const snapshotQuery = useTokenSnapshotQuery({
    client,
    chain,
    walletAddress,
    tokenAddress: currentTokenAddr,
    paused: isTyping || modalStack.length > 0 || slashOpen || recentOverlayOpen || testMode === true,
  });
  useEffect(() => {
    if (snapshotQuery.data) {
      setCurrentToken(snapshotQuery.data, snapshotQuery.data.token.address);
    }
  }, [snapshotQuery.data, setCurrentToken]);

  const tradeEventNonce = useTuiStore((s) => s.tradeEventNonce);
  const holdingsQuery = useHoldingsQuery({
    client,
    chain,
    walletAddress,
    // P1-12: pause holdings polling when ANY modal/slash overlay is open so
    // an open confirm modal can't see the position size change mid-confirm.
    paused: isTyping || modalStack.length > 0 || slashOpen || recentOverlayOpen || testMode === true,
    intervalMs: view === 'positions' ? 5_000 : 10_000,
    // P1-C: when bot reports a Telegram trade landed, force immediate refetch.
    tradeEventNonce,
  });
  useEffect(() => {
    if (holdingsQuery.data) setHoldings(holdingsQuery.data);
  }, [holdingsQuery.data, setHoldings]);

  // -- bot lifecycle (auto-start on mount) ---------------------------------
  const dispatcherCtxRef = useRef<DispatcherContext | undefined>(undefined);
  useEffect(() => {
    if (!client) return undefined;
    if (!props.config) return undefined;
    const ctx: DispatcherContext = {
      client,
      wallets: { [chain]: walletAddress } as Partial<Record<Chain, string>>,
      recordTrade: async (rec) => {
        setStatus(
          rec.error
            ? `Trade ${rec.kind} failed: ${rec.error.message}`
            : `Trade ${rec.kind} ${rec.result?.status ?? 'ok'}`,
          rec.error ? 'error' : 'success',
        );
      },
      confirm: async () => true, // App-level modal handles this BEFORE dispatch.
    };
    dispatcherCtxRef.current = ctx;
    let cancelled = false;
    void startBotIfConfigured({
      config: props.config,
      dispatcherCtx: ctx,
      setBot,
      store: useTuiStore as unknown as {
        getState: () => ReturnType<typeof useTuiStore.getState>;
        setState: typeof useTuiStore.setState;
      },
    }).then((h) => {
      if (cancelled && h) void stopBotSafely(h);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // -- screen rebuild on (token + mode + holdings + chain) -----------------
  useEffect(() => {
    // P1-D: derive native balance from existing holdings array. GMGN returns
    // the native token (WETH on Base/ETH, SOL on Solana, BNB on BSC) inside
    // the holdings list with token_address matching NATIVE_INPUT_TOKEN[chain].
    // Avoids an extra poll endpoint while still surfacing live native balance.
    const nativeAddr = NATIVE_INPUT_TOKEN[chain].toLowerCase();
    const nativeHolding = holdings.find(
      (h) => (h.token_address ?? '').toLowerCase() === nativeAddr,
    );
    const header = buildHeader({
      chain,
      walletAddress,
      nativeBalanceWei: nativeHolding?.balance,
      nativeBalanceUsd: nativeHolding?.usd_value,
      openPositions: holdings.length,
    });
    let screen: Screen;
    if (view === 'positions') {
      screen = buildPositionsScreen({ header, positions: holdings });
    } else if (view === 'info' && currentToken) {
      screen = buildInfoScreen({ header, snapshot: currentToken });
    } else if (view === 'token' && currentToken) {
      screen =
        mode === 'sell'
          ? buildSellScreen({ header, snapshot: currentToken })
          : buildBuyScreen({ header, snapshot: currentToken });
    } else {
      screen = buildHomeScreen({ header });
    }
    setCurrentScreen(screen);
  }, [chain, walletAddress, holdings, currentToken, mode, view, setCurrentScreen]);

  // -- paste → classify → race-safe fetch ----------------------------------
  const handlePaste = async (chunk: string) => {
    const cls = classifier.classifyInput(chunk, { defaultChain: chain });
    let addr: string | undefined;
    let nextChain: Chain = chain;
    if (cls.kind === 'evm_ca') {
      addr = cls.address;
    } else if (cls.kind === 'sol_ca') {
      addr = cls.address;
      nextChain = 'sol';
    } else if (cls.kind === 'url' && cls.extractedAddress) {
      addr = cls.extractedAddress;
      if (cls.chainHint) nextChain = cls.chainHint;
    } else if (cls.kind === 'slash') {
      handleSlashCommand(cls.raw);
      return;
    } else {
      setStatus(`Unrecognized paste: ${chunk.slice(0, 32)}`, 'warn');
      return;
    }
    if (!addr) return;
    pushHistory(addr);
    setInputBuffer('');
    if (nextChain !== chain) setChain(nextChain);
    setStatus(`Loading ${addr.slice(0, 10)}…`, 'info');

    const ticket = abortable.next();
    // Capture the signal BEFORE awaiting — by the time the catch runs,
    // abortable.controller may have been replaced by a newer paste. The
    // captured signal still reflects whether THIS ticket's request was
    // aborted. (P1-1 fix.)
    const signal = abortable.controller.signal;
    const fetcher = props.fetchSnapshotImpl ?? fetchTokenSnapshot;
    if (!client && !props.fetchSnapshotImpl) {
      setStatus('No GMGN client — run `opentrade init` first.', 'error');
      return;
    }
    try {
      const snap = await fetcher(client as GmgnClient, {
        chain: nextChain,
        token: addr,
        walletAddress,
        signal,
      });
      if (abortable.isStale(ticket)) return; // a newer paste landed first
      setCurrentToken(snap, snap.token.address);
      setView('token');
      setStatus(undefined, undefined);
    } catch (err) {
      // The captured signal + ticket together cover both cases:
      //   1) a newer paste aborted us → signal.aborted = true
      //   2) we resolved on our own but a newer paste arrived since →
      //      isStale(ticket) = true
      // Either way, swallow silently.
      if (signal.aborted || abortable.isStale(ticket)) return;
      setStatus(formatFetchError(err), 'error');
    }
  };

  // -- slash command routing -----------------------------------------------
  //
  // Two patterns:
  //   1. Execute in-TUI — stateful UI commands we can fully handle in-process
  //      (buy, sell, wallet, risk, recent, chain, ps, info, help, quit).
  //   2. Friendly shell hand-off — anything that needs persistent stdin
  //      control (init wizard, keygen prompts) or streaming output (feed,
  //      orders) prints the exact `opentrade <sub>` invocation to the status
  //      ribbon so the user can copy-paste it into another shell.
  //
  // All status writes go to the ribbon (setStatus) — never a modal — so the
  // user can dismiss simply by typing the next thing.
  const handleSlashCommand = (raw: string) => {
    const cmd = parseSlash(raw);
    closeSlash();
    setInputBuffer('');
    switch (cmd.cmd) {
      // -- in-TUI ----------------------------------------------------------
      case 'chain': {
        const c = cmd.args[0]?.toLowerCase() as Chain | undefined;
        if (c && ['base', 'sol', 'eth', 'bsc'].includes(c)) {
          setChain(c);
          setStatus(`Chain switched to ${c}.`, 'success');
        } else {
          setStatus('Usage: /chain base|sol|eth|bsc', 'warn');
        }
        return;
      }
      case 'ps':
        setView('positions');
        return;
      case 'wallet':
        setView('positions');
        return;
      case 'info':
        if (currentToken) {
          setView('info');
        } else {
          setStatus('No token loaded — paste a CA first.', 'warn');
        }
        return;
      case 'help':
        openHelp();
        return;
      case 'quit':
        void teardownAndExit();
        return;
      case 'recent': {
        if (inputHistory.length === 0) {
          setStatus('No recent inputs yet — paste a CA first.', 'info');
          return;
        }
        openRecentOverlay();
        return;
      }
      case 'risk': {
        const arg = cmd.args[0]?.toLowerCase();
        if (arg === 'allow') {
          setOverrideRisky(true);
          setStatus('Risky-token override: ON (this session). Use /risk deny to revoke.', 'warn');
        } else if (arg === 'deny') {
          setOverrideRisky(false);
          setStatus('Risky-token override: OFF.', 'info');
        } else {
          setStatus(
            `Risky-token override is ${overrideRisky ? 'ON' : 'OFF'}. Usage: /risk allow|deny`,
            'info',
          );
        }
        return;
      }
      case 'buy': {
        const amountStr = cmd.args[0];
        if (!amountStr) {
          setStatus('Usage: /buy <amount>  (e.g. /buy 0.05)', 'warn');
          return;
        }
        const amount = Number(amountStr);
        if (!Number.isFinite(amount) || amount <= 0) {
          setStatus(`Invalid amount: ${amountStr}`, 'error');
          return;
        }
        if (!currentToken) {
          setStatus('No token loaded — paste a CA before /buy.', 'warn');
          return;
        }
        const preset = presetsApi.DEFAULT_PRESETS[chain];
        const intent: Intent = {
          kind: 'buy',
          chain,
          token: currentToken.token.address,
          amountWei: nativeToWeiString(chain, amount),
          slippageBps: preset.slippageBps,
          antiMev: preset.antiMev,
        };
        void runIntent(intent);
        return;
      }
      case 'sell': {
        const pctStr = cmd.args[0];
        if (!pctStr) {
          setStatus('Usage: /sell <percent>  (e.g. /sell 50)', 'warn');
          return;
        }
        const pct = Number(pctStr);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          setStatus(`Invalid percent: ${pctStr} (1-100)`, 'error');
          return;
        }
        if (!currentToken) {
          setStatus('No token loaded — paste a CA before /sell.', 'warn');
          return;
        }
        if (!currentToken.myHolding) {
          setStatus(`No holding for ${currentToken.token.symbol}.`, 'warn');
          return;
        }
        const preset = presetsApi.DEFAULT_PRESETS[chain];
        const intent: Intent = {
          kind: 'sell',
          chain,
          token: currentToken.token.address,
          percent: Math.round(pct),
          slippageBps: preset.slippageBps,
          antiMev: 'auto',
        };
        void runIntent(intent);
        return;
      }

      // -- friendly shell hand-offs ----------------------------------------
      case 'init':
        setStatus(
          'Run in a new shell: `opentrade init` — interactive wizard needs full stdin. Press q to exit this TUI first.',
          'info',
        );
        return;
      case 'keygen':
        setStatus(
          'Run in a new shell: `opentrade keygen` — writes ~/.config/opentrade/secrets/ed25519.pem.',
          'info',
        );
        return;
      case 'config': {
        const sub = cmd.args[0]?.toLowerCase();
        const tail = cmd.args.slice(1).join(' ');
        setStatus(
          `Run in a new shell: \`opentrade config ${sub ?? 'show'}${tail ? ` ${tail}` : ''}\`.`,
          'info',
        );
        return;
      }
      case 'feed': {
        const kind = cmd.args[0] ?? 'trending';
        setStatus(
          `Run in a new shell: \`opentrade feed ${kind} --chain ${chain}\` — streaming feeds need a dedicated terminal.`,
          'info',
        );
        return;
      }
      case 'orders': {
        const op = cmd.args[0] ?? 'list';
        const id = cmd.args[1] ?? '';
        setStatus(
          `Run in a new shell: \`opentrade orders ${op}${id ? ` ${id}` : ''} --chain ${chain}\`.`,
          'info',
        );
        return;
      }
      case 'limit': {
        const side = cmd.args[0] ?? 'buy';
        const price = cmd.args[1] ?? '<price>';
        setStatus(
          `Limit orders coming soon. For now: \`opentrade limit ${side} ${price} --chain ${chain}\` (early-gated).`,
          'info',
        );
        return;
      }
      case 'send': {
        const amount = cmd.args[0] ?? '<amount>';
        const to = cmd.args[1] ?? '<to|@alias>';
        setStatus(
          `Run in a new shell: \`opentrade send ${amount} ${to} --chain ${chain}\`.`,
          'info',
        );
        return;
      }
      case 'ab': {
        const op = cmd.args[0] ?? 'ls';
        const rest = cmd.args.slice(1).join(' ');
        setStatus(
          `Run in a new shell: \`opentrade ab ${op}${rest ? ` ${rest}` : ''}\` (address book lives in ~/.config/opentrade/address-book.json).`,
          'info',
        );
        return;
      }
      case 'alias': {
        const op = cmd.args[0] ?? 'ls';
        const rest = cmd.args.slice(1).join(' ');
        setStatus(
          `Run in a new shell: \`opentrade alias ${op}${rest ? ` ${rest}` : ''}\`.`,
          'info',
        );
        return;
      }

      // Unknown / unreachable.
      default:
        setStatus(`Unknown slash command: /${(cmd as { cmd: string }).cmd}`, 'warn');
        return;
    }
  };

  // -- dispatch a buy/sell intent (after deciding tier) --------------------
  const runIntent = async (intent: Intent) => {
    props.onIntent?.(intent);
    // UI-only intents short-circuit.
    if (intent.kind === 'switch_mode') {
      setMode(intent.to);
      return;
    }
    if (intent.kind === 'refresh') {
      snapshotQuery.refetch();
      holdingsQuery.refetch();
      return;
    }
    if (intent.kind === 'open_positions') {
      setView('positions');
      return;
    }
    if (intent.kind === 'open_slash') {
      openSlash();
      return;
    }
    if (intent.kind === 'set_chain') {
      setChain(intent.chain);
      return;
    }
    if (intent.kind === 'quit') {
      void teardownAndExit();
      return;
    }

    // Buy/Sell — push a confirmation modal first.
    // P1-4: compute realistic walletUsd + tradeUsd so the tier policy can
    // actually upgrade from T1 → T2 for trades >5% of wallet. We sum holdings
    // (best available proxy for total wallet USD until a native-balance feed
    // lands) and derive trade USD from the intent's wei × current token
    // price for buys, or from the held position's USD for sells.
    const walletUsd = holdings.reduce((s, h) => s + (h.usd_value ?? 0), 0) || undefined;
    let tradeUsd: number | undefined;
    if (intent.kind === 'buy') {
      // For buys the input is native (ETH/SOL/BNB) so we need a native USD
      // price. Approximate from `currentToken.token.price` when the input
      // token is the same chain native — not always true, but a reasonable
      // worst-case lower-bound. If we can't derive it, leave tradeUsd as
      // undefined so the canonical tier function escalates to T2 safely.
      // Better: use the held-USD value as a comparable scale (most useful
      // when the user already has a position in this chain's native).
      // For now, leave tradeUsd undefined for buy when we lack a native USD
      // price — the canonical decideTier will safely escalate to T2.
      tradeUsd = undefined;
    } else if (intent.kind === 'sell') {
      const holding = currentToken?.myHolding;
      if (holding) {
        tradeUsd = ((holding.usd_value ?? 0) * intent.percent) / 100;
      }
    }
    const tier = decideConfirmTier({
      intent,
      walletUsd,
      tradeUsd,
      // `/risk allow` (overrideRisky=true) suppresses the safety-warn tier
      // bump for the duration of the session. This is the TUI equivalent of
      // the `--allow-risky` CLI flag — it does NOT bypass dispatcher-side
      // hard blocks (those still fire and surface "Blocked: ..." in the
      // status ribbon), only the extra confirmation friction.
      safetyWarn: currentToken?.safety.warn === true && !overrideRisky,
    });
    if (tier === 'T0') {
      void doDispatch(intent);
      return;
    }
    const symbol = currentToken?.token.symbol ?? '???';
    const summary =
      intent.kind === 'buy'
        ? `Buy ${symbol} for ${intent.amountWei} wei on ${intent.chain}`
        : intent.kind === 'sell'
          ? `Sell ${intent.percent}% of ${symbol} on ${intent.chain}`
          : `Run ${intent.kind}`;
    const modal: ModalDescriptor = {
      kind: 'confirm',
      tier,
      payload: {
        intent,
        summary,
        ...(currentToken?.safety.reasons ? { safetyReasons: currentToken.safety.reasons } : {}),
        ...(tier === 'T3' ? { confirmSymbol: symbol } : {}),
        countdownMs: tier === 'T1' ? 3000 : undefined,
      },
      resolve: (ok) => {
        popModal();
        setInputBuffer('');
        if (ok) void doDispatch(intent);
      },
    };
    pushModal(modal);
  };

  const doDispatch = async (intent: Intent) => {
    if (!client || !dispatcherCtxRef.current) {
      setStatus('No GMGN client — cannot trade.', 'error');
      return;
    }
    const res = await dispatch(dispatcherCtxRef.current, intent);
    if (res.ok) {
      setStatus(`Dispatched: ${res.result.status}`, 'success');
    } else if (res.reason === 'blocked') {
      setStatus(`Blocked: ${res.safety.reasons.join(', ')}`, 'error');
    } else if (res.reason === 'cancelled') {
      setStatus('Cancelled.', 'info');
    } else if (res.reason === 'error') {
      setStatus(`Error: ${res.error.message.slice(0, 80)}`, 'error');
    }
    // Refresh after a trade so positions reflect.
    holdingsQuery.refetch();
  };

  // -- preset hotkey 1-4 ----------------------------------------------------
  const firePreset = (index: 1 | 2 | 3 | 4) => {
    const screen = currentScreen;
    if (!screen) return;
    const filterKind = mode === 'buy' ? 'buy' : 'sell';
    const presets = screen.actions.filter((a) => a.intent.kind === filterKind);
    const target = presets[index - 1];
    if (!target) return;
    void runIntent(target.intent);
  };

  // -- bot toggle ----------------------------------------------------------
  const toggleBot = async () => {
    if (!props.config) {
      setStatus('No config — run `opentrade init` to enable Telegram bot.', 'warn');
      return;
    }
    if (botStatus === 'connected' || botStatus === 'starting') {
      setStatus('Stopping Telegram bot…', 'info');
      await stopBotSafely(botHandle);
      setBot({ status: 'off', error: undefined, handle: undefined });
      setStatus('Telegram bot stopped.', 'info');
      return;
    }
    if (!dispatcherCtxRef.current) {
      setStatus('Bot needs an active GMGN client.', 'warn');
      return;
    }
    setStatus('Starting Telegram bot…', 'info');
    const handle = await startBotIfConfigured({
      config: props.config,
      dispatcherCtx: dispatcherCtxRef.current,
      setBot,
      store: useTuiStore as unknown as {
        getState: () => ReturnType<typeof useTuiStore.getState>;
        setState: typeof useTuiStore.setState;
      },
    });
    if (handle) setStatus('Telegram bot connected.', 'success');
  };

  // -- teardown -------------------------------------------------------------
  const teardownAndExit = async () => {
    try {
      await stopBotSafely(botHandle);
    } finally {
      ink.exit();
    }
  };

  // -- global key handler ---------------------------------------------------
  // Routed via InputBar.shouldConsume so paste / typing still works.
  //
  // The focus gate is enforced inside mapHotkey: when inputBuffer is non-empty
  // or a modal/slash overlay is open, single-letter and digit hotkeys return
  // null so the InputBar can append them as content. Only Esc / Enter / Tab
  // (when no overlay) / Ctrl+C still fire as hotkeys.
  const handleHotkey = (input: string, key: import('ink').Key): boolean => {
    const evt = mapHotkey(input, key, {
      inputBufferLength: inputBuffer.length,
      modalOpen: modalStack.length > 0,
      // Recent overlay owns input the same way slash palette does — gate
      // letter/digit hotkeys so typing while overlay is open doesn't trigger
      // force_buy / refresh / etc.
      slashOpen: slashOpen || recentOverlayOpen,
    });
    if (!evt) return false;

    // Modal stack absorbs Enter/Esc/typing without firing global actions.
    const topModal = modalStack[modalStack.length - 1];
    if (topModal) {
      if (evt.kind === 'escape') {
        topModal.resolve(false);
        return true;
      }
      if (evt.kind === 'submit') {
        // T2/T3 — only resolve if typed text matches.
        const tier = topModal.tier;
        const expected =
          tier === 'T2'
            ? 'YES'
            : tier === 'T3'
              ? topModal.payload.confirmSymbol ?? ''
              : '';
        if (tier === 'T1') {
          topModal.resolve(true);
        } else if (expected && inputBuffer.trim().toUpperCase() === expected.toUpperCase()) {
          topModal.resolve(true);
        }
        return true;
      }
      // Typing while modal open feeds the input buffer for T2/T3 — let
      // InputBar handle char appends.
      return false;
    }

    if (slashOpen) {
      if (evt.kind === 'escape') {
        closeSlash();
        return true;
      }
      if (evt.kind === 'submit') {
        handleSlashCommand(inputBuffer);
        return true;
      }
      if (evt.kind === 'list_down') {
        setPaletteCursor((c) => c + 1);
        return true;
      }
      if (evt.kind === 'list_up') {
        setPaletteCursor((c) => Math.max(0, c - 1));
        return true;
      }
    }

    if (recentOverlayOpen) {
      const limit = Math.min(10, inputHistory.length);
      if (evt.kind === 'escape') {
        closeRecentOverlay();
        setRecentCursor(0);
        return true;
      }
      if (evt.kind === 'submit') {
        // Recent overlay renders newest-first, so reverse-slice mirrors that.
        const recent = inputHistory.slice(-10).reverse();
        const picked = recent[recentCursor];
        closeRecentOverlay();
        setRecentCursor(0);
        if (picked) {
          setInputBuffer(picked);
        }
        return true;
      }
      if (evt.kind === 'list_down') {
        setRecentCursor((c) => Math.min(Math.max(0, limit - 1), c + 1));
        return true;
      }
      if (evt.kind === 'list_up') {
        setRecentCursor((c) => Math.max(0, c - 1));
        return true;
      }
      // Swallow everything else while overlay is open.
      return true;
    }

    if (helpOpen) {
      if (evt.kind === 'escape' || evt.kind === 'help') {
        closeHelp();
        return true;
      }
      return true;
    }

    switch (evt.kind) {
      case 'quit':
        void teardownAndExit();
        return true;
      case 'help':
        openHelp();
        return true;
      case 'slash':
        openSlash();
        setInputBuffer('/');
        return true;
      case 'preset':
        firePreset(evt.index);
        return true;
      case 'flip':
        setMode(mode === 'buy' ? 'sell' : 'buy');
        return true;
      case 'force_buy':
        setMode('buy');
        return true;
      case 'force_sell':
        setMode('sell');
        return true;
      case 'info':
        if (currentToken) setView('info');
        return true;
      case 'refresh':
        snapshotQuery.refetch();
        holdingsQuery.refetch();
        return true;
      case 'positions':
        setView('positions');
        return true;
      case 'wallet':
        setView('positions');
        return true;
      case 'chain_palette':
        setStatus('Chain palette: /chain base|sol|eth|bsc', 'info');
        openSlash();
        setInputBuffer('/chain ');
        return true;
      case 'list_down':
        if (view === 'positions') setPositionsCursor((c) => Math.min(holdings.length - 1, c + 1));
        return true;
      case 'list_up':
        if (view === 'positions') setPositionsCursor((c) => Math.max(0, c - 1));
        return true;
      case 'list_top':
        setPositionsCursor(0);
        return true;
      case 'list_bottom':
        setPositionsCursor(Math.max(0, holdings.length - 1));
        return true;
      case 'escape':
        if (view !== 'home') setView('token');
        return true;
      case 'submit':
        // No modal/slash — submit input.
        if (inputBuffer) void handlePaste(inputBuffer);
        return true;
      case 'toggle_bot':
        void toggleBot();
        return true;
    }
    return false;
  };

  // -- history navigation ---------------------------------------------------
  const histUp = () => {
    if (!inputHistory.length) return;
    const i = historyIndex === -1 ? inputHistory.length - 1 : Math.max(0, historyIndex - 1);
    setHistoryIndex(i);
    setInputBuffer(inputHistory[i] ?? '');
  };
  const histDown = () => {
    if (historyIndex === -1) return;
    const next = historyIndex + 1;
    if (next >= inputHistory.length) {
      setHistoryIndex(-1);
      setInputBuffer('');
    } else {
      setHistoryIndex(next);
      setInputBuffer(inputHistory[next] ?? '');
    }
  };

  // -- render ---------------------------------------------------------------
  const headerForStatusBar = useMemo(
    () =>
      currentScreen?.header ??
      buildHeader({
        chain,
        walletAddress,
        nativeBalanceWei: undefined,
        nativeBalanceUsd: undefined,
        openPositions: holdings.length,
      }),
    [currentScreen, chain, walletAddress, holdings.length],
  );

  const topModal = modalStack[modalStack.length - 1];

  return (
    <Box flexDirection="column" paddingX={0}>
      <StatusBar header={headerForStatusBar} />

      <Box flexDirection="column" marginTop={0}>
        {view === 'positions' ? (
          <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
            <Text bold>Positions</Text>
            <PositionsList positions={holdings} cursor={positionsCursor} />
          </Box>
        ) : view === 'info' && currentScreen ? (
          <InfoExpanded screen={currentScreen} />
        ) : view === 'token' && currentScreen ? (
          <TokenCard screen={currentScreen} />
        ) : currentScreen ? (
          <TokenCard screen={currentScreen} />
        ) : (
          <Box paddingX={1}>
            <Text dimColor>Paste a contract address to start, or press ? for help.</Text>
          </Box>
        )}
      </Box>

      {slashOpen ? (
        <Box marginTop={1}>
          <SlashPalette query={inputBuffer} cursor={paletteCursor} />
        </Box>
      ) : null}

      {recentOverlayOpen ? (
        <Box marginTop={1}>
          <RecentOverlay entries={inputHistory} cursor={recentCursor} />
        </Box>
      ) : null}

      {helpOpen ? (
        <Box marginTop={1}>
          <HelpOverlay />
        </Box>
      ) : null}

      {topModal ? (
        <Box marginTop={1}>
          <ConfirmModal modal={topModal} typedText={inputBuffer} onResolve={topModal.resolve} />
        </Box>
      ) : null}

      <Footer
        hints={currentScreen?.hints}
        statusMessage={statusMessage}
        statusTone={statusTone}
        typing={inputBuffer.length > 0}
        slashOpen={slashOpen}
      />

      <InputBar
        buffer={inputBuffer}
        setBuffer={setInputBuffer}
        enabled={!helpOpen}
        onPaste={(c) => void handlePaste(c)}
        onSubmit={(t) => {
          if (slashOpen) handleSlashCommand(t);
          else if (t) void handlePaste(t);
        }}
        shouldConsume={(input, key) => handleHotkey(input, key)}
        onHistoryUp={histUp}
        onHistoryDown={histDown}
        onTyping={markTyping}
      />
    </Box>
  );
};

/**
 * Translate a fetch error into something a human can act on. The previous
 * `msg.slice(0, 80)` swallowed the HTTP status + body and left the user
 * with just the URL — leading to the bug report "cho xem luôn lỗi gì nhé"
 * (show me what the actual error is).
 *
 * GmgnError carries `status` (HTTP code) and `body` (first 300 chars of the
 * response). We map common statuses to a one-line hint, then append the
 * raw GMGN body so the full picture is on screen. Network errors (no
 * `instanceof GmgnError`) fall through to the bare message.
 */
function formatFetchError(err: unknown): string {
  if (err instanceof GmgnError) {
    const hint = httpStatusHint(err.status);
    const body = err.body.replace(/\s+/g, ' ').slice(0, 200);
    return `Fetch failed: HTTP ${err.status} ${hint} · ${err.subPath} · body=${body}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Network / abort / timeout — show full message (no truncation).
  return `Fetch failed: ${msg}`;
}

function httpStatusHint(status: number): string {
  if (status === 401 || status === 403)
    return '— GMGN rejected the API key. Re-paste it via `opentrade config set gmgn.apiKey <key>`.';
  if (status === 404) return '— token not found on this chain. Try `/chain` to switch.';
  if (status === 429) return '— rate-limited. Wait a few seconds and retry.';
  if (status >= 500) return '— GMGN backend error. Check status.gmgn.ai or retry.';
  return '';
}

// -- a thin top-level wrapper that also registers a Ctrl+C handler at the Ink
//    layer (in addition to mapHotkey's `Ctrl+C` branch), since `exitOnCtrlC`
//    is disabled on render() (see tui/main.ts).
export const AppWithGlobalQuit: React.FC<AppProps> = (props) => {
  const ink = useApp();
  useInput((input, key) => {
    if (key.ctrl && (input === 'c' || input === 'd')) {
      // The store-held bot handle may not be visible to this child, so use the
      // App-level path by sending escape + we hope mapHotkey caught it first.
      // If we reach here it means InputBar masked it — exit cleanly.
      ink.exit();
    }
  });
  return <App {...props} />;
};
