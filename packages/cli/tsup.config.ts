import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/main.ts', 'src/tui/main.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: 'node20',
  // Keep every package resolvable from node_modules — Ink + React must NOT be
  // bundled (they assume singleton instances), and our @0xsyncroot/opentrade-core
  // dist is already published as ESM. Leaving everything external also slashes
  // build time and lets us mock modules in tests.
  external: [
    /^react($|\/)/,
    /^ink($|-)/,
    'react-devtools-core',
    /^@0xsyncroot\/opentrade/,
    /^@tanstack\//,
    'zustand',
    'zod',
    'undici',
    'citty',
    'consola',
    'cosmiconfig',
    'cli-table3',
    '@clack/prompts',
  ],
});
