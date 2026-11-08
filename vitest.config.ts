import { defaultServerConditions } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { sourceCondition } from './source-condition.js';

/** Timing budgets, run alone after every other test so nothing slows them. */
const budgets = 'packages/*/src/**/*.budget.test.ts';

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
    projects: [
      {
        extends: true,
        test: {
          name: 'tests',
          include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, budgets],
        },
      },
      {
        extends: true,
        test: {
          name: 'budgets',
          include: [budgets],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
