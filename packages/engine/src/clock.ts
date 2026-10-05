const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const GAME_DAY_MS = 24 * MS_PER_HOUR;

/** Garden time runs 6× real time, so a garden day lasts 4 real hours. */
export const GARDEN_TIME_SCALE = 6;

export interface SimClock {
  /** Game milliseconds since the world began. */
  readonly simTime: number;
  /** Game milliseconds per real millisecond. */
  readonly scale: number;
}

export interface GameTimeParts {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export function realToSimMs(clock: SimClock, realMs: number): number {
  return realMs * clock.scale;
}

export function simToRealMs(clock: SimClock, simMs: number): number {
  return simMs / clock.scale;
}

export function gameTimeParts(simTime: number): GameTimeParts {
  return {
    day: Math.floor(simTime / GAME_DAY_MS),
    hour: Math.floor((simTime % GAME_DAY_MS) / MS_PER_HOUR),
    minute: Math.floor((simTime % MS_PER_HOUR) / MS_PER_MINUTE),
  };
}
