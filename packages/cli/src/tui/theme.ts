// Theme — semantic color tokens used by every TUI component.
//
// Mapped to Ink Text `color` prop values (ANSI named colors). Keeping these as
// constants lets us swap palettes without touching components.

export const theme = {
  primary: 'cyan',
  primaryAlt: 'cyanBright',
  danger: 'red',
  warn: 'yellow',
  safe: 'green',
  muted: 'gray',
  text: 'white',
  dim: 'gray',
  accent: 'magenta',
  info: 'blue',
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
