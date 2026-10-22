import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 8_192,
    rolldownOptions: { output: { keepNames: true } },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
  },
});
