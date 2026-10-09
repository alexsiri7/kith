import { defaultClientConditions, defineConfig } from 'vite';
import { sourceCondition } from '../../source-condition.js';
import { clientMountPath } from '../server/src/client-mount.js';

export default defineConfig({
  base: `${clientMountPath}/`,
  resolve: {
    conditions: [sourceCondition, ...defaultClientConditions],
  },
});
