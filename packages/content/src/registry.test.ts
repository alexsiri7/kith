import { createEntity } from '@kith/engine';
import { describe, expect, it } from 'vitest';
import { ENTITY_TYPES } from './entity-types.js';
import { MEANINGS } from './meanings.js';
import { registry } from './registry.js';

describe('content registry', () => {
  it('holds every entity type', () => {
    expect([...registry.types.keys()]).toEqual(ENTITY_TYPES.map((t) => t.id));
  });

  it('creates every type from defaults alone', () => {
    for (const { id } of ENTITY_TYPES) {
      expect(createEntity(registry, { id, type: id, x: 0 }).type).toBe(id);
    }
  });

  it('only uses known meanings', () => {
    const meanings: readonly string[] = MEANINGS;
    for (const type of ENTITY_TYPES) {
      if (type.meaning !== undefined) {
        expect(meanings).toContain(type.meaning);
      }
    }
  });
});
