// Theme — semantic color tokens used by every TUI component.
//
// Round 7 UX upgrade: switched from ANSI named colors (cyan/magenta/red/...)
// to a muted hex palette inspired by Claude Code CLI's branding. Anchor color
// is claude-orange (#D97757) used for the brand + primary interactive
// elements. Chrome stays in muted gray (#7C7C7C) so the orange pops without
// fighting the rest of the UI. Ink renders hex colors on any TrueColor
// terminal (modern macOS Terminal, iTerm2, Wezterm, Windows Terminal, most
// Linux DEs). Falls back to nearest 256-color elsewhere.

export const theme = {
  primary: '#D97757',     // claude-orange — brand + primary interactive
  primaryAlt: '#E58D6F',  // brighter shade for hover/focus highlights
  accent: '#D97757',
  text: '#E5E5E5',        // body
  muted: '#7C7C7C',       // chrome / dim labels
  dim: '#5C5C5C',         // tertiary chrome
  safe: '#5DB075',        // success
  warn: '#E5B567',        // warning
  danger: '#E26D5C',      // error / block
  info: '#7C9BC9',        // informational toasts
  border: '#3A3A3A',      // subtle frames
} as const;

export type ThemeColor = (typeof theme)[keyof typeof theme];

/**
 * Map a SafetyGate `level` to a color + glyph.
 */
export function safetyTone(level: 'ok' | 'warn' | 'block'): { color: ThemeColor; glyph: string } {
  switch (level) {
    case 'ok':
      return { color: theme.safe, glyph: '✓' };
    case 'warn':
      return { color: theme.warn, glyph: '⚠' };
    case 'block':
      return { color: theme.danger, glyph: '⛔' };
  }
}

/**
 * Map an ActionButton `tone` to a color.
 */
export function actionTone(tone: 'primary' | 'danger' | 'warn' | 'muted' | undefined): ThemeColor {
  switch (tone) {
    case 'danger':
      return theme.danger;
    case 'warn':
      return theme.warn;
    case 'muted':
      return theme.muted;
    case 'primary':
    default:
      return theme.primary;
  }
}

/**
 * Map a Block `tone` (info/warn/error/success) to a color.
 */
export function blockTone(tone: 'info' | 'warn' | 'error' | 'success' | undefined): ThemeColor {
  switch (tone) {
    case 'warn':
      return theme.warn;
    case 'error':
      return theme.danger;
    case 'success':
      return theme.safe;
    case 'info':
    default:
      return theme.text;
  }
}

/**
 * Map a statusMessage `tone` to a glyph + color pair. Used by Footer toasts.
 */
export function statusTone(tone: 'info' | 'warn' | 'error' | 'success' | undefined): {
  color: ThemeColor;
  glyph: string;
} {
  switch (tone) {
    case 'success':
      return { color: theme.safe, glyph: '✓' };
    case 'warn':
      return { color: theme.warn, glyph: '⚠' };
    case 'error':
      return { color: theme.danger, glyph: '✗' };
    case 'info':
    default:
      return { color: theme.info, glyph: 'ℹ' };
  }
}
