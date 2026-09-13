import { defineConfig } from 'vitest/config';

/**
 * EarlyWinner / quant test suite — separate from the main jest config
 * because the quant codebase uses NodeNext-style `.js` imports and vitest
 * (Vite resolves `.js` → `.ts` natively; ts-jest commonjs does not).
 *
 * Run: npm run test:quant
 */
export default defineConfig({
  test: {
    include: ['src/lib/quant/**/*.test.ts'],
    environment: 'node',
    // PIT/backtest tests are deterministic — no retries, no timeouts surprises
    testTimeout: 30_000,
  },
});
