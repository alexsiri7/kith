import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    conditions: ['@kith/source', ...defaultClientConditions],
  },
});
