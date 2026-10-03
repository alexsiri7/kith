import { defaultClientConditions, defineConfig } from 'vite';
import { sourceCondition } from '../../source-condition.js';

export default defineConfig({
  resolve: {
    conditions: [sourceCondition, ...defaultClientConditions],
  },
});
