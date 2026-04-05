import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['./src/index.ts', './src/cli.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
})
