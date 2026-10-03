import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';
import { sourceCondition } from './source-condition.js';

export default defineConfig({
  ssr: {
    resolve: {
      conditions: [sourceCondition, ...defaultServerConditions],
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
