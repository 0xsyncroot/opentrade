import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/start.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: 'node20',
});
