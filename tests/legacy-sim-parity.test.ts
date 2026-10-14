import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Port from '../packages/legacy-sim/src/index.js';

// The prototype reads `Math.random` and `Date.now`; feed it the port's
// random stream and a fixed clock, and the two must make the same world.
// The prototype's ids are `Date.now()` in base 36 followed by a counter, the
// port's are the counter alone, so the clock's prefix is cut from its worlds.
const CLOCK = 1e12;
const ID_PREFIX = CLOCK.toString(36);
const PROTOTYPE = new URL('../prototype/sim.js', import.meta.url).pathname;
const require = createRequire(import.meta.url);

type Prototype = typeof Port;

function loadPrototype(seed: number): Prototype {
  const stream = { rng: Port.rngSeed(seed) };
  vi.spyOn(Math, 'random').mockImplementation(() => Port.random(stream));
  vi.spyOn(Date, 'now').mockReturnValue(CLOCK);
  // A fresh module, so its id counter starts at 1 like a new world's.
  delete require.cache[PROTOTYPE];
  return require(PROTOTYPE) as Prototype;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** A run's results as plain data, minus what the port deliberately does differently. */
function comparable(result: unknown, prototype: boolean) {
  const json = JSON.stringify(result, (key, value: unknown) =>
    ['rng', 'nextId', 'allowanceDay', 'presenceDay'].includes(key)
      ? undefined
      : value,
  );
  return JSON.parse(
    prototype ? json.replaceAll(ID_PREFIX, '') : json,
  ) as unknown;
}

const NOW = Date.UTC(2026, 9, 14, 9);

function both(seed: number, run: (S: Prototype) => unknown) {
  const expected = run(loadPrototype(seed));
  vi.restoreAllMocks();
  const actual = run(Port);
  return { expected, actual };
}

/** The prototype's newCreature takes no world: (name, now, genome, x). */
function addKith(S: Prototype, w: Port.World, name: string, x: number) {
  if (S === Port) {
    w.kith.push(S.newCreature(w, name, NOW, S.newGenome(S.rngOf(w)), x));
    return;
  }
  const newCreature = S.newCreature as unknown as (
    name: string,
    now: number,
    genome: Port.Genome,
    x: number,
  ) => Port.Creature;
  const newGenome = S.newGenome as unknown as () => Port.Genome;
  w.kith.push(newCreature(name, NOW, newGenome(), x));
}

function awayRun(names: string[], days: number, coins: number) {
  return (S: Prototype) => {
    const w = S.newWorld(600, NOW, 'A', names[0]!, names[1] ?? null);
    while (w.kith.length < names.length)
      addKith(S, w, names[w.kith.length]!, 300 + w.kith.length * 40);
    for (const c of w.kith) c.hatchAt = NOW;
    w.coins = coins;
    w.offset = days * S.DAY;
    S.catchUp(w, NOW);
    const nights = w.pending.splice(0);
    for (const night of nights) {
      const c = S.kithById(w, night.id!);
      if (!c) continue;
      w.creature = c;
      S.ruleNight(w, night);
    }
    w.creature = w.kith[0]!;
    return comparable({ w, summary: S.awaySummary(w, NOW) }, S !== Port);
  };
}

describe('legacy-sim matches prototype/sim.js', () => {
  it('for one Kith left alone for a day', () => {
    const { expected, actual } = both(600, awayRun(['Pip'], 1, 0));
    expect(actual).toEqual(expected);
  });

  it('for four Kith left alone for three days', () => {
    const { expected, actual } = both(
      600,
      awayRun(['Pip', 'Moss', 'K2', 'K3'], 3, 100),
    );
    expect(actual).toEqual(expected);
  });

  it('for two Kith over a whole lifetime, with eggs and hatchlings', () => {
    const { expected, actual } = both(600, awayRun(['Pip', 'Moss'], 16, 1000));
    expect(actual).toEqual(expected);
  }, 60_000);

  it('while the player plays with a Kith', () => {
    const { expected, actual } = both(900, (S) => {
      const w = S.newWorld(900, NOW, 'Alex', 'Pip', 'Moss');
      for (const c of w.kith) c.hatchAt = NOW;
      S.step(w, 1000);
      S.teach(w, 'alex', 'you');
      S.teach(w, 'alex', 'you');
      S.teach(w, 'yum', 'eat');
      S.teach(w, 'yum', 'eat');
      w.creature.rel.affection = 0.4;
      S.setWants(w, [
        { what: 'fetch', why: 'Alex likes ball' },
        { what: 'explore', why: 'what there?' },
        { what: 'dance', why: 'happy' },
      ]);
      const ctx = { present: true, hand: { x: 400, y: 300 }, live: true };
      const events: unknown[] = [];
      for (let t = 0; t < 30 * 60 * 5; t++) {
        events.push(S.step(w, 200, ctx));
        if (t % 100 === 0) events.push(S.tickle(w));
        if (t % 450 === 0) events.push(S.kickBall(w, 1, 200, true));
        if (t % 700 === 0) events.push(S.obey(w, ['yum']));
        if (t % 900 === 0) events.push(S.scold(w));
        if (t % 1100 === 0) events.push(S.pressBoard(w));
        if (!w.creature.wants.length && S.content(w.creature)) S.ruleWants(w);
      }
      return comparable({ events, w }, S !== Port);
    });
    expect(actual).toEqual(expected);
  });

  it('while the player tends the garden', () => {
    const { expected, actual } = both(1200, (S) => {
      const w = S.newWorld(1200, NOW, 'Alex', 'Pip', 'Moss');
      for (const c of w.kith) c.hatchAt = NOW;
      w.coins = 500;
      S.step(w, 1000);
      S.plantBush(w, 1240);
      S.plantCarrots(w, 200);
      S.buyShelter(w, 1240);
      const ctx = { present: true, hand: { x: 400, y: 300 }, live: true };
      const events: unknown[] = [];
      for (let t = 0; t < 30 * 60 * 5; t++) {
        events.push(S.step(w, 200, ctx));
        if (t % 600 === 0) events.push(S.toggleLever(w));
        if (t % 500 === 0) events.push(S.pressMusic(w));
        if (t % 800 === 0) events.push(S.pressVendor(w));
        if (t % 1000 === 0) events.push(S.callOver(w, 900));
      }
      const night = {
        id: w.creature.id,
        name: w.creature.name,
        since: NOW,
        until: w.simTime,
        wx: 0,
      };
      S.applyNight(w, night, {
        beliefs: [{ about: 'river', feel: -0.6, text: 'water bites' }],
        wants: [{ what: 'explore', why: 'over there?' }],
        dream: 'Pip dreamed of carrots.',
      });
      return comparable({ events, w }, S !== Port);
    });
    expect(actual).toEqual(expected);
  });
});
