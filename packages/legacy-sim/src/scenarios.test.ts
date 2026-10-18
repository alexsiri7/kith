import { describe, expect, it } from 'vitest';
import { catchUp, DAY, newWorld } from './index.js';
import { BALANCE } from './scenarios/balance.js';
import { runScenario } from './scenarios/harness.js';
import { legacySim } from './scenarios/legacy.js';

const NOW = Date.UTC(2026, 9, 14, 9);

describe('the balance scenarios on legacy-sim', () => {
  for (const { name, scenario, limits: l } of BALANCE) {
    // A synchronous test still fails once it runs past its timeout.
    it(name, { timeout: l.maxMs ?? 60_000 }, () => {
      const s = runScenario(legacySim, scenario);
      const meals = (s.events.ate ?? 0) + (s.events.vended ?? 0);
      const at = JSON.stringify(s);
      if (l.maxDeaths !== undefined)
        expect(s.deaths, at).toBeLessThanOrEqual(l.maxDeaths);
      if (l.minTockSpent !== undefined)
        expect(s.tockSpent, at).toBeGreaterThan(l.minTockSpent);
      if (l.maxTockSpent !== undefined)
        expect(s.tockSpent, at).toBeLessThan(l.maxTockSpent);
      if (l.minRiverAvoiders !== undefined)
        expect(s.riverAvoiders, at).toBeGreaterThanOrEqual(l.minRiverAvoiders);
      if (l.maxResting !== undefined)
        expect(s.activity.resting, at).toBeLessThan(l.maxResting);
      if (l.minPlayingOrWishing !== undefined)
        expect(s.activity.playing + s.activity.wishing, at).toBeGreaterThan(
          l.minPlayingOrWishing,
        );
      if (l.minMeals !== undefined)
        expect(meals, at).toBeGreaterThanOrEqual(l.minMeals);
    });
  }

  it('counts the events the log no longer holds', () => {
    const { events } = legacySim.run({
      seed: 600,
      kith: 4,
      coins: 100,
      days: 3,
      present: false,
    });
    const counted = Object.values(events).reduce((a, b) => a + b, 0);
    expect(counted).toBeGreaterThan(800);
  });

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
