import { describe, expect, it } from 'vitest';
import * as Engine from '../packages/engine/src/index.js';
import * as Port from '../packages/legacy-sim/src/index.js';

// The port counts real time at the garden's scale; the engine counts game
// time, so engine time t is port time t / 6. Multiples of 6 ms keep both
// clocks exact.
const SCALE = Engine.GARDEN_TIME_SCALE;
const DAY = Engine.GAME_DAY_MS;
const SEEDS = [0, 1, 7, 600, 0xffffffff];

describe('weather matches the prototype on the game clock', () => {
  it('weatherAt', () => {
    for (const seed of SEEDS) {
      for (let t = 0; t < 60 * DAY; t += 6 * 60_000 * 7 + 6 * 11) {
        expect(Engine.weatherAt(seed, t)).toEqual(
          Port.weatherAt(seed, t / SCALE, SCALE),
        );
      }
    }
  });

  it('forecast', () => {
    for (const seed of SEEDS) {
      for (let d = 0; d < 60; d++) {
        const t = d * DAY + 6 * 3_600_000 * (d % 4);
        const port = Port.forecast(seed, t / SCALE, 3, SCALE);
        const engine = Engine.forecast(seed, t);
        expect(engine.map((f) => f.day)).toEqual(port.map((f) => f.day));
        engine.forEach((f, i) => {
          const p = port[i]!;
          expect({ ...f, lo: 0, hi: 0, start: 0 }).toEqual({
            ...p,
            lo: 0,
            hi: 0,
            start: 0,
          });
          expect(f.start).toBeCloseTo(p.start * SCALE, 3);
          expect(f.lo).toBeCloseTo(p.lo, 6);
          expect(f.hi).toBeCloseTo(p.hi, 6);
        });
      }
    }
  });
});
