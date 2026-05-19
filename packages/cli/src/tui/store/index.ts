// Zustand store — TUI session state.
//
// Shape mirrors what plan §"Cốt lõi — Screen schema" needs to drive the renderer:
//   - currentScreen (built from core/views)
//   - currentToken (the snapshot we're acting on)
//   - holdings (cached for positions screen)
//   - mode + modeChangedAt (sticky-30s auto buy/sell flip)
//   - slashOpen, modalStack (overlay state)
//   - inputHistory (↑/↓ navigation)
//   - inflightSeq (race-safe paste fetch — incremented every new fetch)

import { create } from 'zustand';
import type { Chain } from '@hiepht/opentrade-core/chains';
import type { Holding } from '@hiepht/opentrade-core/gmgn';
import type { Screen } from '@hiepht/opentrade-core/schemas';
import type { TokenSnapshot } from '@hiepht/opentrade-core/services';

export type Mode = 'buy' | 'sell';

export interface ModalDescriptor {
  kind: 'confirm';
  tier: 'T0' | 'T1' | 'T2' | 'T3';
  /** Free-form payload — used by ConfirmModal to render preview and resolve(). */
  payload: {
    intent: import('@hiepht/opentrade-core/schemas').Intent;
    summary: string;
    safetyReasons?: string[];
    confirmSymbol?: string;
    countdownMs?: number;
  };
  resolve: (confirmed: boolean) => void;
}

/** Telegram bot runtime status — shown in StatusBar. */
export type BotStatus = 'off' | 'starting' | 'connected' | 'error';

export interface BotHandle {
  stop: () => Promise<void>;
  /** Optional — only the @hiepht/opentrade-bot handle implements this. */
  onStatusChange?: (cb: (s: BotStatus) => void) => () => void;
  /** Optional — only the @hiepht/opentrade-bot handle implements this. */
  status?: () => BotStatus;
}

export interface TuiState {
  chain: Chain;
  walletAddress: string;
  currentScreen: Screen | undefined;
  currentToken: TokenSnapshot | undefined;
  /** Token address we're currently focused on. */
  currentTokenAddr: string | undefined;
  /** Track last-paste time per token to implement sticky-30s mode lock. */
  lastTokenSetAt: number;
  holdings: Holding[];
  mode: Mode;
  modeChangedAt: number;
  slashOpen: boolean;
  helpOpen: boolean;
  modalStack: ModalDescriptor[];
  inputHistory: string[];
  /** Index into inputHistory while user is navigating with ↑/↓. -1 = "live" buffer. */
  historyIndex: number;
  /** Race-safe fetch sequence number. */
  inflightSeq: number;
  /**
   * Telegram-bot-pushed trade event counter. Bumped whenever the bot's
   * `BotEventStore.pushTradeEvent()` fires. Polling hooks subscribe so a phone
   * trade triggers an immediate holdings refetch in the TUI (P1-C).
   */
  tradeEventNonce: number;
  /** Is the user actively typing? Pauses background polling. */
  isTyping: boolean;
  /** Last UI status (one-line ribbon under the input). */
  statusMessage: string | undefined;
  statusTone: 'info' | 'warn' | 'error' | 'success' | undefined;
  /** Telegram bot lifecycle. */
  botStatus: BotStatus;
  botError: string | undefined;
  botHandle: BotHandle | undefined;

  // -- setters / actions ----------------------------------------------------
  setChain: (c: Chain) => void;
  setWallet: (addr: string) => void;
  setCurrentScreen: (s: Screen | undefined) => void;
  setCurrentToken: (t: TokenSnapshot | undefined, addr: string | undefined) => void;
  setHoldings: (h: Holding[]) => void;
  setMode: (m: Mode) => void;
  openSlash: () => void;
  closeSlash: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  pushModal: (m: ModalDescriptor) => void;
  popModal: () => void;
  pushHistory: (entry: string) => void;
  setHistoryIndex: (i: number) => void;
  bumpInflight: () => number;
  bumpTradeEvent: () => void;
  setTyping: (b: boolean) => void;
  setStatus: (msg: string | undefined, tone?: 'info' | 'warn' | 'error' | 'success') => void;
  setBot: (s: { status?: BotStatus; error?: string | undefined; handle?: BotHandle | undefined }) => void;
}

const STICKY_MS = 30_000;

export const useTuiStore = create<TuiState>((set, _get) => ({
  chain: 'base',
  walletAddress: '',
  currentScreen: undefined,
  currentToken: undefined,
  currentTokenAddr: undefined,
  lastTokenSetAt: 0,
  holdings: [],
  mode: 'buy',
  modeChangedAt: 0,
  slashOpen: false,
  helpOpen: false,
  modalStack: [],
  inputHistory: [],
  historyIndex: -1,
  inflightSeq: 0,
  tradeEventNonce: 0,
  isTyping: false,
  statusMessage: undefined,
  statusTone: undefined,
  botStatus: 'off',
  botError: undefined,
  botHandle: undefined,

  setChain: (c) => set({ chain: c }),
  setWallet: (addr) => set({ walletAddress: addr }),
  setCurrentScreen: (s) => set({ currentScreen: s }),
  setCurrentToken: (t, addr) => {
    const now = Date.now();
    set((state) => {
      const sameToken =
        addr && state.currentTokenAddr && addr.toLowerCase() === state.currentTokenAddr.toLowerCase();
      const within30s = now - state.lastTokenSetAt < STICKY_MS;
      // Determine mode (auto buy↔sell):
      //  - same token within 30s → keep existing mode (sticky)
      //  - otherwise → flip based on holding USD
      let mode: Mode = state.mode;
      if (!(sameToken && within30s)) {
        const usd = t?.myHolding?.usd_value ?? 0;
        mode = usd > 0.5 ? 'sell' : 'buy';
      }
      return {
        currentToken: t,
        currentTokenAddr: addr,
        lastTokenSetAt: now,
        mode,
        modeChangedAt: mode === state.mode ? state.modeChangedAt : now,
      };
    });
  },
  setHoldings: (h) => set({ holdings: h }),
  setMode: (m) => set((s) => (s.mode === m ? s : { mode: m, modeChangedAt: Date.now() })),
  openSlash: () => set({ slashOpen: true }),
  closeSlash: () => set({ slashOpen: false }),
  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
  pushModal: (m) => set((s) => ({ modalStack: [...s.modalStack, m] })),
  popModal: () => set((s) => ({ modalStack: s.modalStack.slice(0, -1) })),
  pushHistory: (entry) =>
    set((s) => {
      if (!entry || entry === s.inputHistory[s.inputHistory.length - 1]) return s;
      const next = [...s.inputHistory.filter((e) => e !== entry), entry].slice(-50);
      return { inputHistory: next, historyIndex: -1 };
    }),
  setHistoryIndex: (i) => set({ historyIndex: i }),
  bumpInflight: () => {
    let seq = 0;
    set((s) => {
      seq = s.inflightSeq + 1;
      return { inflightSeq: seq };
    });
    return seq;
  },
  bumpTradeEvent: () => set((s) => ({ tradeEventNonce: s.tradeEventNonce + 1 })),
  setTyping: (b) => set({ isTyping: b }),
  setStatus: (msg, tone) => set({ statusMessage: msg, statusTone: tone }),
  setBot: (s) =>
    set((state) => ({
      botStatus: s.status ?? state.botStatus,
      botError: 'error' in s ? s.error : state.botError,
      botHandle: 'handle' in s ? s.handle : state.botHandle,
    })),
}));
