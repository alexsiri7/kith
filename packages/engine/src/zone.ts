import type { Entity, TypeId, ZoneCurrent, ZoneFallIn } from './entity.js';
import type { Registry } from './registry.js';
import type { EntityId, World } from './world.js';

/** A hazard zone's footprint, and whether it is passable now. */
export interface Zone {
  readonly id: EntityId;
  readonly type: TypeId;
  readonly x: number;
  readonly lo: number;
  readonly hi: number;
  readonly passable: boolean;
  readonly fallIn: ZoneFallIn;
  readonly current?: ZoneCurrent;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function zonesOf(world: World, registry: Registry): Zone[] {
  const zones: Zone[] = [];
  for (const entity of Object.values(world.entities)) {
    const type = registry.types.get(entity.type);
    if (type?.zone === undefined) continue;
    const field = type.zone.passableWhen;
    const passable =
      field !== undefined &&
      isRecord(entity.state) &&
      entity.state[field] === true;
    const half = type.body.w / 2;
    zones.push({
      id: entity.id,
      type: type.id,
      x: entity.x,
      lo: entity.x - half,
      hi: entity.x + half,
      passable,
      fallIn: type.zone.fallIn,
      ...(type.zone.current === undefined
        ? {}
        : { current: type.zone.current }),
    });
  }
  return zones;
}

export function sideOf(zone: Zone, x: number): -1 | 0 | 1 {
  return x < zone.lo ? -1 : x > zone.hi ? 1 : 0;
}

/** Impassable zones a move from `from` to `to` would enter, nearest first. */
export function crossings(
  zones: readonly Zone[],
  from: number,
  to: number,
): Zone[] {
  return zones
    .filter((zone) => {
      const side = sideOf(zone, from);
      return !zone.passable && side !== 0 && sideOf(zone, to) !== side;
    })
    .sort((a, b) => Math.abs(a.x - from) - Math.abs(b.x - from));
}

/**
 * Lets impassable zones with a current act on the loose things in them for
 * `dtMs`: floating bodies drift to the nearer bank, sinking ones are lost.
 * Carried and held things, and anything with a mind, are left alone.
 */
export function zoneCurrents(
  world: World,
  registry: Registry,
  dtMs: number,
): World {
  const zones = zonesOf(world, registry).filter(
    (zone) => zone.current !== undefined && !zone.passable,
  );
  if (zones.length === 0) return world;
  let entities: Record<EntityId, Entity> | undefined;
  const change = (id: EntityId, entity: Entity | undefined) => {
    entities ??= { ...world.entities };
    if (entity === undefined) delete entities[id];
    else entities[id] = entity;
  };
  for (const [id, entity] of Object.entries(world.entities)) {
    const type = registry.types.get(entity.type);
    if (
      type?.mind !== undefined ||
      entity.carriedBy !== undefined ||
      entity.heldByPlayer === true
    ) {
      continue;
    }
    const zone = zones.find((z) => sideOf(z, entity.x) === 0);
    if (zone?.current === undefined) continue;
    if (type?.body.floats === true) {
      const { speed, bank } = zone.current;
      const shore =
        entity.x < (zone.lo + zone.hi) / 2 ? zone.lo - bank : zone.hi + bank;
      const drift = Math.min(Math.abs(shore - entity.x), (speed * dtMs) / 1000);
      const x = entity.x + Math.sign(shore - entity.x) * drift;
      if (x !== entity.x) change(id, { ...entity, x });
    } else if (type?.body.sinks === true) {
      change(id, undefined);
    }
  }
  return entities === undefined ? world : { ...world, entities };
}
