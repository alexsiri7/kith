import { defaultClientConditions, defineConfig } from 'vite';
import { sourceCondition } from '../../source-condition.js';

export default defineConfig({
  // The server mounts this build under /next/; the prototype owns /.
  base: '/next/',
  resolve: {
    conditions: [sourceCondition, ...defaultClientConditions],
  },
});
