import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';
import { sourceCondition } from './source-condition.js';

export default defineConfig({
  ssr: {
    resolve: {
      // Vitest's own default drops `module`: packages such as
      // @opentelemetry/api point it at builds Node cannot import.
      conditions: [
        sourceCondition,
        ...defaultServerConditions.filter(
          (condition) => condition !== 'module',
        ),
      ],
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
