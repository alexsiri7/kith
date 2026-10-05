import type { Migration } from '@kith/engine';
import { fromPrototypeV22 } from './prototype-v22.js';

/** Ordered by `from`; each schema change appends one migration. */
export const MIGRATIONS: readonly Migration[] = [fromPrototypeV22];
