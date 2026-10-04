import { describe, expect, it } from 'vitest';
import {
  GAME_DAY_MS,
  GARDEN_TIME_SCALE,
  gameTimeParts,
  realToSimMs,
  simToRealMs,
} from './clock.js';

const HOUR = 3_600_000;
const clock = { simTime: 0, scale: GARDEN_TIME_SCALE };

describe('clock', () => {
  it('runs a garden day in four real hours', () => {
    expect(simToRealMs(clock, GAME_DAY_MS)).toBe(4 * HOUR);
    expect(realToSimMs(clock, 4 * HOUR)).toBe(GAME_DAY_MS);
  });

  it('splits game time into day, hour and minute', () => {
    expect(gameTimeParts(0)).toEqual({ day: 0, hour: 0, minute: 0 });
    expect(
      gameTimeParts(2 * GAME_DAY_MS + 13 * HOUR + 7 * 60_000 + 59_999),
    ).toEqual({ day: 2, hour: 13, minute: 7 });
  });
});
