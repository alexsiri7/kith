import type { EntityId } from './world.js';

export type SkyBody = 'sun' | 'moon' | 'star' | 'cloud' | 'rain' | 'sky';

/**
 * Anything a Kith, the player or the cortex can point at. A zone's id is the
 * id of the entity that declares it.
 */
export type Target =
  | { readonly kind: 'entity'; readonly id: EntityId }
  | { readonly kind: 'player' }
  | { readonly kind: 'zone'; readonly id: EntityId }
  | { readonly kind: 'sky'; readonly body: SkyBody };
