import { describe, expect, it } from 'vitest';
import { runScenario } from './harness.js';
import type { ScenarioSim, WorldTally } from './harness.js';

const tally: WorldTally = {
  kith: [{ cause: null, avoidsRiver: true, words: 2, opinions: { red: -1 } }],
  tockSpent: 10,
  meals: 3,
  events: { ate: 3 },
  activity: { resting: 1, playing: 1, wishing: 0, other: 2 },
};
const sameEveryWorld: ScenarioSim = { run: () => tally };

describe('runScenario', () => {
  it('reports what one world does on average, whatever the number of seeds', () => {
    const s = runScenario(sameEveryWorld, { kith: 1, coins: 0 });
    expect(s).toMatchObject({
      worlds: 20,
      tockSpent: 10,
      meals: 3,
      events: { ate: 3 },
      words: 2,
      opinions: { red: -1 },
      activity: { resting: 0.25, playing: 0.25, wishing: 0, other: 0.5 },
    });
  });
});
