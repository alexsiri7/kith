import {
  createEntity,
  createWorld,
  mindOf,
  step,
  type EntityInit,
  type GameEvent,
  type StepContext,
  type World,
} from '@kith/engine';
import { describe, expect, it } from 'vitest';
import { registry } from './registry.js';

const MINUTE = 60_000;
const away: StepContext = {
  registry,
  presence: { watching: false },
  live: true,
};

const calm = { hunger: 0.2, cold: 0, tired: 0.1, bored: 0, lonely: 0, fear: 0 };

function kith(id: string, x: number, state: object): EntityInit {
  return {
    id,
    type: 'kith',
    x,
    state: { stage: 'adult', born: 0, name: id, ...state },
  };
}

function garden(seed: number, ...inits: EntityInit[]): World {
  const world = createWorld(seed);
  const entities = inits.map((init) => createEntity(registry, init));
  return {
    ...world,
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    selectedKith: entities[0]?.id ?? null,
  };
}

/** Steps a second at a time until `until` holds, or `limitMs` passes. */
function runUntil(
  world: World,
  until: (events: readonly GameEvent[], world: World) => boolean,
  limitMs: number,
) {
  const events: GameEvent[] = [];
  for (let t = 0; t < limitMs && !until(events, world); t += 1000) {
    const result = step(world, 1000, [], away);
    world = result.world;
    events.push(...result.events);
  }
  return { world, events };
}

describe(
  'a Kith’s social life on the garden’s content',
  { timeout: 60_000 },
  () => {
    it('warns a Kith heading for the hive, and its opinion of bees drops', () => {
      const start = garden(
        600,
        kith('pip', 900, { needs: calm, opinions: { beehive: -0.8 } }),
        kith('bo', 950, { needs: { ...calm, bored: 1 } }),
        { id: 'hive', type: 'beehive', x: 1100 },
      );
      const { world, events } = runUntil(
        start,
        (events) => events.some((e) => e.type === 'warned'),
        10 * MINUTE,
      );
      expect(events).toContainEqual({
        type: 'warned',
        actor: 'pip',
        target: 'bo',
      });
      expect(mindOf(world, 'bo').opinions.beehive).toBeLessThan(0);
      expect(world.moments.map((m) => m.text)).toContainEqual(
        expect.stringMatching(/^pip warned bo about the bees/),
      );
    });

    it('seeks out another Kith when lonely, and its loneliness eases', () => {
      const start = garden(
        600,
        kith('pip', 600, { needs: { ...calm, lonely: 1 } }),
        kith('bo', 1400, { needs: calm }),
      );
      const { world } = runUntil(
        start,
        (_, world) =>
          Math.abs(world.entities.pip!.x - world.entities.bo!.x) < 30,
        30 * MINUTE,
      );
      expect(mindOf(world, 'pip').act).toMatchObject({
        verb: 'social',
        target: { kind: 'entity', id: 'bo' },
      });
      const together = runUntil(world, () => false, 10 * MINUTE).world;
      expect(mindOf(together, 'pip').needs.lonely!).toBeLessThan(
        mindOf(world, 'pip').needs.lonely!,
      );
    });

    it('takes "friend" as a command to keep a friend company', () => {
      const start = garden(
        600,
        kith('pip', 600, {
          needs: calm,
          lexicon: { pal: { meaning: 'friend', strength: 0.6 } },
          player: { familiarity: 0, affection: 0.1, trust: 1 },
          genome: {
            curiosity: 0.5,
            hardiness: 0.5,
            sociability: 0.5,
            learnRate: 1,
            agreeable: 1,
          },
        }),
        kith('bo', 1400, { needs: calm }),
      );
      const { events } = step(start, 0, [{ type: 'say', text: 'pal' }], away);
      expect(events).toContainEqual({
        type: 'understood',
        actor: 'pip',
        verb: 'social',
        obeyed: true,
      });
    });
  },
);
