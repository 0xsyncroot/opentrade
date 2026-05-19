import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/gmgn/index.ts',
    'src/schemas/index.ts',
    'src/services/index.ts',
    'src/safety/index.ts',
    'src/classifier/index.ts',
    'src/views/index.ts',
    'src/actions/index.ts',
    'src/chains/index.ts',
    'src/presets/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: 'node20',
});
