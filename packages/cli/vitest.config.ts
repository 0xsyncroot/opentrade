import { defineConfig } from 'vitest/config';

// Vitest config — runs the Ink TUI snapshot + behaviour tests under JSDOM-free
// Node so we mirror the real binary runtime. ESM-only, TSX via esbuild.

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    pool: 'forks',
  },
});
