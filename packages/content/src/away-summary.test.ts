import {
  catchUp,
  createEntity,
  createWorld,
  GAME_DAY_MS,
  weatherAt,
  type EntityInit,
  type GameEvent,
  type World,
} from '@kith/engine';
import { describe, expect, it } from 'vitest';
import { awaySummary } from './away-summary.js';
import { registry } from './registry.js';

const HOUR_MS = 3_600_000;

function garden(seed: number, simTime: number, ...inits: EntityInit[]): World {
  const world = createWorld(seed);
  const entities = inits.map((init) => createEntity(registry, init));
  return {
    ...world,
    clock: { ...world.clock, simTime },
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  };
}

const kith = (id: string, name: string): EntityInit => ({
  id,
  type: 'kith',
  x: 300,
  state: { name, stage: 'adult', born: 0 },
});

/** A day in `seed`'s weather with no storm and no frost. */
function calmDay(seed: number): number {
  for (let d = 0; ; d++) {
    let calm = true;
    for (let t = d * GAME_DAY_MS; t <= (d + 1) * GAME_DAY_MS; t += 360_000) {
      const w = weatherAt(seed, t);
      if (w.storm || w.temp < 1) calm = false;
    }
    if (calm) return d * GAME_DAY_MS;
  }
}

describe('awaySummary', () => {
  it('tells what each Kith did, in the prototype’s words', () => {
    const since = calmDay(1);
    const world = garden(
      1,
      since + GAME_DAY_MS,
      kith('pip', 'Pip'),
      kith('mo', 'Mo'),
      kith('bo', 'Bo'),
    );
    const events: GameEvent[] = [
      { type: 'hatch', actor: 'pip', target: 'pip' },
      { type: 'ate', actor: 'pip', target: 'cake-1' },
      { type: 'ate', actor: 'pip', target: 'cake-2' },
      { type: 'gotHoney', actor: 'pip', target: 'beehive' },
      { type: 'stung', actor: 'mo', target: 'beehive' },
      { type: 'stung', actor: 'mo', target: 'beehive' },
      { type: 'pricked', actor: 'mo', target: 'cactus' },
      { type: 'sick', actor: 'mo', target: 'mushroom-red-1' },
      { type: 'warned', actor: 'mo', target: 'bo' },
      { type: 'fellIn', actor: 'mo', target: 'river' },
      { type: 'avoided', actor: 'mo', target: 'river' },
      { type: 'ate', actor: 'bo', target: 'cake-3' },
      { type: 'fellIn', actor: 'bo', target: 'river' },
      { type: 'fellIn', actor: 'bo', target: 'river' },
      { type: 'died', actor: 'bo', cause: 'cold' },
      { type: 'bridgeRaised', actor: 'river', target: 'river' },
      { type: 'shelterDamaged', actor: 'shelter', target: 'shelter' },
    ];
    expect(awaySummary(world, events, since)).toMatchInlineSnapshot(`
      {
        "hours": 4,
        "lines": [
          "A storm damaged a shelter.",
          "A storm raised the bridge.",
          "Pip hatched, ate 2 times and got honey.",
          "Mo was stung by bees 2 times, was pricked by the cactus, ate a red mushroom and was sick, warned a friend away from danger, fell into the river and stopped itself at the river's edge.",
          "Bo ate 1 time and fell into the river 2 times.",
          "Bo died of cold.",
        ],
      }
    `);
  });

  it('tells of a quiet stretch when nothing happened', () => {
    const since = calmDay(2);
    const world = garden(2, since + 2 * HOUR_MS, kith('pip', 'Pip'));
    expect(awaySummary(world, [], since)).toEqual({
      hours: 2 / 6,
      lines: ['A quiet stretch. Nothing much happened.'],
    });
  });

  it('sums up a garden caught up through a storm', () => {
    const seed = 600;
    let onset = HOUR_MS;
    while (!weatherAt(seed, onset).storm) onset += HOUR_MS;
    const since = onset - 12 * HOUR_MS;
    const world = garden(
      seed,
      since,
      kith('kith-1', 'Pip'),
      { id: 'river', type: 'river', x: 1240, state: { bridge: true } },
      { id: 'lever', type: 'lever', x: 1100 },
      { id: 'beehive', type: 'beehive', x: 1060 },
      { id: 'cactus', type: 'cactus', x: 2090 },
      { id: 'shelter', type: 'shelter', x: 900, state: { integrity: 0.35 } },
    );
    const { world: later, events } = catchUp(
      world,
      registry,
      since + GAME_DAY_MS,
    );
    expect(awaySummary(later, events, since)).toMatchInlineSnapshot(`
      {
        "hours": 4,
        "lines": [
          "A storm passed through.",
          "A storm raised the bridge.",
          "Pip got honey, was stung by bees 2 times and was pricked by the cactus.",
        ],
      }
    `);
  });
});
