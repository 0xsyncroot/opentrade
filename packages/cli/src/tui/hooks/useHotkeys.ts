// Global hotkey dispatcher. Listens to single keystrokes (NOT paste bursts —
// that's usePaste) and turns them into intents that the App processes.
//
// Hotkey table — plan §"TUI ergonomics §3":
//   1-4       fire preset (context-sensitive buy/sell)
//   b         force BUY mode
//   s         force SELL mode
//   Tab       flip buy ↔ sell
//   i         expanded info
//   r         refresh card
//   p         positions list
//   w         wallet summary
//   c         change chain palette
//   /         slash command palette
//   ?         help overlay
//   ↑/↓       history navigation (handled inside InputBar, not here)
//   j/k       vim navigate (list views)
//   g/G       top/bottom list
//   Enter     submit / confirm
//   Esc       close modal/palette
//   q         quit
//   Ctrl+C    quit
//
// FOCUS GATE (added 2026-05-19):
//   Single-character "letter" hotkeys (`b s i r p w c j k g G q T / ?` and
//   number presets 1-4) ONLY fire when the input buffer is empty. When the
//   user is typing — buffer.length > 0 — those keystrokes belong to the input
//   field, NOT the hotkey dispatcher. Otherwise typing "base" lights up
//   force_buy + force_sell + info + refresh and the user can't type anything.
//
//   Control keys (Ctrl+C/D, Esc, Enter, Tab) ALWAYS fire — they're not
//   typeable content and they have safe semantics inside the input bar
//   (submit / clear / flip-mode).

import type { Key } from 'ink';

export type HotkeyEvent =
  | { kind: 'preset'; index: 1 | 2 | 3 | 4 }
  | { kind: 'force_buy' }
  | { kind: 'force_sell' }
  | { kind: 'flip' }
  | { kind: 'info' }
  | { kind: 'refresh' }
  | { kind: 'positions' }
  | { kind: 'wallet' }
  | { kind: 'chain_palette' }
  | { kind: 'slash' }
  | { kind: 'help' }
  | { kind: 'list_down' }
  | { kind: 'list_up' }
  | { kind: 'list_top' }
  | { kind: 'list_bottom' }
  | { kind: 'submit' }
  | { kind: 'escape' }
  | { kind: 'toggle_bot' }
  | { kind: 'quit' };

/** Context for `mapHotkey` — focus state so we can gate letter shortcuts. */
export interface HotkeyContext {
  /** Length of the active input buffer. When > 0, letter hotkeys are
   *  suppressed so users can type CA/text without triggering side effects. */
  inputBufferLength?: number;
  /** True while a modal is open — only Esc / Enter / Ctrl+C are honoured
   *  here; everything else flows back to the modal's text input. */
  modalOpen?: boolean;
  /** True while the slash palette is open — same rule as modalOpen: only
   *  control keys fire as hotkeys, the rest belongs to the slash text. */
  slashOpen?: boolean;
}

/**
 * Pure mapping from (input, key) → optional hotkey event.
 * Returns null when the key should be passed through to the input bar.
 *
 * Kept as a pure function so it's trivially unit-testable.
 *
 * When `ctx.inputBufferLength > 0` (user is mid-typing) only control keys
 * fire — letter/number/punctuation hotkeys return null so the InputBar can
 * append the character. Same rule when `modalOpen` or `slashOpen` is true.
 */
export function mapHotkey(
  input: string,
  key: Key,
  ctx: HotkeyContext = {},
): HotkeyEvent | null {
  // Always-on control keys — typed content cannot collide with these.
  if (key.ctrl && (input === 'c' || input === 'd')) return { kind: 'quit' };
  if (key.escape) return { kind: 'escape' };
  if (key.return) return { kind: 'submit' };

  // Tab: flip buy↔sell ONLY when input is empty and no overlay is open.
  // Otherwise it stays available for future autocomplete in slash palette.
  if (key.tab) {
    if (ctx.inputBufferLength && ctx.inputBufferLength > 0) return null;
    if (ctx.modalOpen) return null;
    if (ctx.slashOpen) return null;
    return { kind: 'flip' };
  }

  // Arrow keys never map to global hotkeys — they're handled by the
  // InputBar (history nav) and list views (cursor).
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
    return null;
  }

  // Focus gate: when the user is actively typing OR an overlay owns input,
  // letter / digit / punctuation hotkeys must not fire.
  const gated =
    (ctx.inputBufferLength !== undefined && ctx.inputBufferLength > 0) ||
    ctx.modalOpen === true ||
    ctx.slashOpen === true;
  if (gated) return null;

  // Number keys 1-4
  if (input === '1') return { kind: 'preset', index: 1 };
  if (input === '2') return { kind: 'preset', index: 2 };
  if (input === '3') return { kind: 'preset', index: 3 };
  if (input === '4') return { kind: 'preset', index: 4 };

  switch (input) {
    case '/':
      return { kind: 'slash' };
    case '?':
      return { kind: 'help' };
    case 'q':
      return { kind: 'quit' };
    case 'b':
      return { kind: 'force_buy' };
    case 's':
      return { kind: 'force_sell' };
    case 'i':
      return { kind: 'info' };
    case 'r':
      return { kind: 'refresh' };
    case 'p':
      return { kind: 'positions' };
    case 'w':
      return { kind: 'wallet' };
    case 'c':
      return { kind: 'chain_palette' };
    case 'j':
      return { kind: 'list_down' };
    case 'k':
      return { kind: 'list_up' };
    case 'g':
      return { kind: 'list_top' };
    case 'G':
      return { kind: 'list_bottom' };
    case 'T':
      return { kind: 'toggle_bot' };
  }
  return null;
}
