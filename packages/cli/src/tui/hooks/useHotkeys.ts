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

/**
 * Pure mapping from (input, key) → optional hotkey event.
 * Returns null when the key should be passed through to the input bar.
 *
 * Kept as a pure function so it's trivially unit-testable.
 */
export function mapHotkey(input: string, key: Key): HotkeyEvent | null {
  if (key.ctrl && (input === 'c' || input === 'd')) return { kind: 'quit' };
  if (key.escape) return { kind: 'escape' };
  if (key.return) return { kind: 'submit' };
  if (key.tab) return { kind: 'flip' };

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
