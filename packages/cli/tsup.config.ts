import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/main.ts', 'src/tui/main.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
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
