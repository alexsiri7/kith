import { describe, expect, it } from 'vitest';
import {
  catchUp,
  DAY,
  newCreature,
  newGenome,
  newWorld,
  rngOf,
} from './index.js';

// prototype/tests/test8.js as assertions: 20 worlds left alone, counting
// deaths, Tock's spending and what happened per world. The ranges hold the
// numbers the prototype printed over several runs (see the README).
const NOW = Date.UTC(2026, 9, 14, 9);
const WORLDS = 20;
const COUNTED = [
  'stung',
  'honey',
  'chased',
  'fell-in',
  'tock-bought',
  'tock-led',
];

function leaveAlone(kith: number, days: number, coins: number) {
  let deaths = 0,
    spent = 0;
  const perWorld: Record<string, number> = {};
  for (let k = 0; k < WORLDS; k++) {
    const w = newWorld(600 + k, NOW, 'A', 'Pip', kith > 1 ? 'Moss' : null);
    while (w.kith.length < kith)
      w.kith.push(
        newCreature(
          w,
          'K' + w.kith.length,
          NOW,
          newGenome(rngOf(w)),
          300 + w.kith.length * 40,
        ),
      );
    for (const c of w.kith) c.hatchAt = NOW;
    w.coins = coins;
    w.offset = days * DAY;
    catchUp(w, NOW);
    deaths += w.kith.filter((c) => !c.alive && c.gen === 1).length;
    spent += w.tockSpent || 0;
    for (const e of w.log)
      if (COUNTED.includes(e.type))
        perWorld[e.type] = (perWorld[e.type] || 0) + 1 / WORLDS;
  }
  return { deaths, spentPerWorld: spent / WORLDS, perWorld };
}

type Range = readonly [number, number];
const scenarios: {
  name: string;
  kith: number;
  days: number;
  coins: number;
  maxDeaths: number;
  spent: Range;
  perWorld: Record<string, Range>;
}[] = [
  {
    name: '1 Kith alone for 24h with no coins',
    kith: 1,
    days: 1,
    coins: 0,
    maxDeaths: 0,
    spent: [0, 10],
    perWorld: {
      chased: [20, 35],
      honey: [2, 5],
      stung: [1, 3],
      'fell-in': [1, 3],
    },
  },
  {
    name: '1 Kith alone for 3 days with no coins',
    kith: 1,
    days: 3,
    coins: 0,
    maxDeaths: 0,
    spent: [5, 25],
    perWorld: {
      chased: [70, 100],
      honey: [2.5, 6],
      stung: [1, 3],
      'fell-in': [1, 3],
    },
  },
  {
    name: '2 Kith alone for 3 days with 100 coins',
    kith: 2,
    days: 3,
    coins: 100,
    maxDeaths: 0,
    spent: [60, 120],
    perWorld: { chased: [110, 140], honey: [2.5, 5], 'tock-bought': [5, 10] },
  },
  {
    name: '4 Kith alone for 3 days with 100 coins',
    kith: 4,
    days: 3,
    coins: 100,
    maxDeaths: 5,
    spent: [1000, 1600],
    perWorld: {
      chased: [85, 115],
      honey: [3, 8],
      'tock-bought': [40, 70],
      'tock-led': [1, 5],
    },
  },
];

describe('the prototype balance scenarios', () => {
  for (const s of scenarios) {
    it(s.name, { timeout: 60_000 }, () => {
      const result = leaveAlone(s.kith, s.days, s.coins);
      expect(result.deaths).toBeLessThanOrEqual(s.maxDeaths);
      expect(result.spentPerWorld).toBeGreaterThanOrEqual(s.spent[0]);
      expect(result.spentPerWorld).toBeLessThanOrEqual(s.spent[1]);
      for (const [type, [lo, hi]] of Object.entries(s.perWorld)) {
        const n = result.perWorld[type] ?? 0;
        expect(n, type).toBeGreaterThanOrEqual(lo);
        expect(n, type).toBeLessThanOrEqual(hi);
      }
    });
  }

  it('turns out the same world from the same seed', () => {
    const run = () => {
      const w = newWorld(7, NOW, 'A', 'Pip', 'Moss');
      w.offset = DAY;
      catchUp(w, NOW);
      return w;
    };
    expect(run()).toEqual(run());
  });
});
