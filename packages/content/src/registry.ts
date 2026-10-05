import { createRegistry } from '@kith/engine';
import { ENTITY_TYPES } from './entity-types.js';
import { MEANINGS } from './meanings.js';
import { VERBS } from './verbs.js';

/** Built at import, so invalid content stops the server at startup. */
export const registry = createRegistry({
  types: ENTITY_TYPES,
  meanings: MEANINGS,
  verbs: VERBS,
});
