import {
  deserialiseWorld,
  GAME_DAY_MS,
  gameTimeParts,
  serialiseWorld,
  step,
  type World,
} from '@kith/engine';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './migrations.js';
import fixture from './prototype-v22.fixture.json' with { type: 'json' };
import { registry } from './registry.js';

const load = (save: unknown): World =>
  deserialiseWorld(JSON.stringify(save), registry, MIGRATIONS);

const typeOf = (world: World, id: string) => world.entities[id]?.type;

describe('prototype v2.2 import', () => {
  const world = load(fixture);

  it('migrates to the current schema', () => {
    expect(world.schemaVersion).toBe(1);
    expect(world.seed).toBe(fixture.seed);
  });

  it('keeps the Kith and the selection', () => {
    const kith = Object.values(world.entities).filter((e) => e.type === 'kith');
    expect(kith.map((k) => k.id)).toEqual(fixture.kith.map((k) => k.id));
    expect(kith.map((k) => (k.state as { name: string }).name)).toEqual([
      'Pip',
      'Moss',
    ]);
    expect(world.selectedKith).toBe(fixture.sel);
  });

  it('falls back to a living Kith when sel is missing', () => {
    expect(load({ ...fixture, sel: null }).selectedKith).toBe(
      fixture.kith[0]!.id,
    );
  });

  it('keeps a dream whose Kith was renamed, without an author', () => {
    // The prototype's Rename button changes a Kith's name but not the names
    // its dreams were recorded under.
    const renamed = {
      ...fixture,
      kith: fixture.kith.map((k) => ({ ...k, name: `${k.name}!` })),
    };
    expect(load(renamed).dreams).toEqual([
      { simTime: world.clock.simTime, kith: null, text: 'ball fly sky' },
    ]);
  });

  it('keeps the player and their history', () => {
    expect(world.player.name).toBe('Alex');
    expect(world.player.coins).toBe(fixture.coins);
    expect(world.log).toHaveLength(fixture.log.length);
    expect(world.moments).toHaveLength(fixture.moments.length);
    expect(world.pendingNights).toHaveLength(fixture.pending.length);
    const pip = fixture.kith.find((k) => k.name === 'Pip')!;
    expect(world.dreams).toEqual([
      { simTime: world.clock.simTime, kith: pip.id, text: 'ball fly sky' },
    ]);
  });

  it('imports items, Tock and the river', () => {
    const mapped: Record<string, string> = {
      ball: 'ball',
      shroomB: 'mushroom-brown',
      shroomR: 'mushroom-red',
    };
    for (const item of fixture.items) {
      expect(typeOf(world, item.id)).toBe(mapped[item.type]);
    }
    const ball = fixture.items.find((item) => item.type === 'ball')!;
    const mushroom = fixture.items.find((item) => item.type === 'shroomB')!;
    expect(world.entities[ball.id]?.state).toEqual({});
    expect(world.entities[mushroom.id]?.state).toEqual({
      born: expect.any(Number),
      rotten: false,
    });
    expect(typeOf(world, 'tock')).toBe('tock');
    expect(world.entities.river?.state).toEqual({ bridge: fixture.bridge });
  });

  it('maps every time onto the game clock', () => {
    const times = [
      world.clock.simTime,
      ...world.log.map((e) => e.simTime),
      ...world.moments.map((m) => m.simTime),
      ...world.dreams.map((d) => d.simTime),
      ...world.pendingNights.flatMap((n) => [n.since, n.until]),
      ...Object.values(world.entities).flatMap((e) =>
        Object.values(e.state as object).filter((v) => typeof v === 'number'),
      ),
    ];
    for (const t of times) expect(t).toBeGreaterThanOrEqual(0);
    expect(gameTimeParts(world.clock.simTime).hour).toBe(
      Math.floor(((fixture.simTime * fixture.scale) % GAME_DAY_MS) / 3_600_000),
    );
  });

  it('round-trips and steps like any other world', () => {
    expect(load(JSON.parse(serialiseWorld(world)))).toEqual(world);
    expect(() =>
      step(world, 60_000, [], { presence: { watching: false }, live: false }),
    ).not.toThrow();
  });

  it('refuses items it cannot map', () => {
    const kite = {
      ...fixture,
      items: [...fixture.items, { id: 'k', type: 'kite', x: 0, born: 0 }],
    };
    expect(() => load(kite)).toThrow('Unknown prototype item type "kite"');
  });

  it('refuses anything that is not a prototype save', () => {
    expect(() => load({})).toThrow('Not a prototype v2.2 save');
  });
});
