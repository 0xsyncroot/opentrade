import { defineConfig } from 'tsup';

// Default OFF in published builds (P1-11 — sourcemaps add ~540KB to the
// npm tarball and leak source paths). Set OPENTRADE_DEV_SOURCEMAP=1 during
// local dev to keep them on.
const includeSourcemap = process.env.OPENTRADE_DEV_SOURCEMAP === '1';

export default defineConfig({
  entry: ['src/cli/main.ts', 'src/tui/main.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: includeSourcemap,
  target: 'node20',
  // Workspace siblings — bundle them INTO the cli dist so end-users get
  // everything from one `npm i @hiepht/opentrade`. The bot + core source lives
  // in private packages that never reach the npm registry.
  noExternal: [/^@hiepht\/opentrade/],
  // Runtime deps that must remain external (loaded from node_modules at run
  // time): React + Ink (singleton constraint), grammY (telegram), undici
  // (fetch), and the various UI/parser libs we depend on.
  external: [
    /^react($|\/)/,
    /^ink($|-)/,
    'react-devtools-core',
    /^@tanstack\//,
    /^@grammyjs\//,
    'grammy',
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
