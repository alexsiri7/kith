import type { Category, TypeId } from './entity.js';
import type { Registry } from './registry.js';
import type { EntityId, World } from './world.js';

export const INDEX_BUCKET_WIDTH = 100;

/**
 * Lookups derived from `World.entities`. Never saved: rebuild it after
 * loading or stepping a world.
 */
export interface WorldIndex {
  readonly byType: ReadonlyMap<TypeId, readonly EntityId[]>;
  readonly byCategory: ReadonlyMap<Category, readonly EntityId[]>;
  /** Keyed by `Math.floor(x / INDEX_BUCKET_WIDTH)`. */
  readonly buckets: ReadonlyMap<number, readonly EntityId[]>;
}

function add<K>(map: Map<K, EntityId[]>, key: K, id: EntityId): void {
  const ids = map.get(key);
  if (ids === undefined) map.set(key, [id]);
  else ids.push(id);
}

export function indexWorld(world: World, registry: Registry): WorldIndex {
  const byType = new Map<TypeId, EntityId[]>();
  const byCategory = new Map<Category, EntityId[]>();
  const buckets = new Map<number, EntityId[]>();
  for (const entity of Object.values(world.entities)) {
    const type = registry.types.get(entity.type);
    if (type === undefined) {
      throw new Error(
        `Unknown entity type "${entity.type}" for entity ${entity.id}`,
      );
    }
    add(byType, type.id, entity.id);
    add(byCategory, type.category, entity.id);
    add(buckets, Math.floor(entity.x / INDEX_BUCKET_WIDTH), entity.id);
  }
  return { byType, byCategory, buckets };
}
