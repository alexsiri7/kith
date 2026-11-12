import { GAME_DAY_MS } from './clock.js';
import type { SkyBody } from './target.js';

const HOUR_MS = 3_600_000;
/** How finely `weatherBetween` samples temperature: the prototype's real minute. */
const SAMPLE_MS = 6 * 60_000;

/** The weather at one moment of game time. `hour` is fractional. */
export interface Weather {
  readonly temp: number;
  readonly storm: boolean;
  readonly rain: boolean;
  readonly snow: boolean;
  readonly night: boolean;
  readonly hour: number;
  readonly day: number;
}

export interface ForecastDay {
  readonly day: number;
  /** The game day's start, in sim milliseconds. */
  readonly start: number;
  readonly lo: number;
  readonly hi: number;
  readonly storm: boolean;
  readonly rain: boolean;
  readonly snow: boolean;
}

export type WeatherFlag = 'storm' | 'rain' | 'snow' | 'night';

function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function dayInfo(seed: number, day: number) {
  const r = (k: number) => hash(seed * 131 + k, day);
  const snap = r(1) < 0.12;
  return {
    base: snap ? -5 + r(5) * 5 : 7 + r(4) * 10,
    stormy: r(2) < 0.18,
    rainy: r(3) < 0.3,
    stormStart: Math.floor(r(6) * 24),
    stormHours: 3 + Math.floor(r(7) * 6),
    rainStart: Math.floor(r(8) * 24),
  };
}

/**
 * The prototype's weather, a pure function of the seed and game time: each
 * day draws its base temperature, cold snap, storm and rain from the seed.
 */
export function weatherAt(seed: number, simTime: number): Weather {
  const day = Math.floor(simTime / GAME_DAY_MS);
  const hour = (simTime - day * GAME_DAY_MS) / HOUR_MS;
  const today = dayInfo(seed, day);
  const tomorrow = dayInfo(seed, day + 1);
  const yesterday = dayInfo(seed, day - 1);
  const base = today.base + (tomorrow.base - today.base) * (hour / 24);
  const temp = base + 5 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
  const overnight = yesterday.stormStart + yesterday.stormHours - 24;
  const storm =
    (today.stormy &&
      hour >= today.stormStart &&
      hour < today.stormStart + today.stormHours) ||
    (yesterday.stormy && overnight > 0 && hour < overnight);
  const rain =
    storm ||
    (today.rainy && hour >= today.rainStart && hour < today.rainStart + 5);
  return {
    temp,
    storm,
    rain,
    snow: rain && temp < 1,
    night: hour < 6.5 || hour >= 21.5,
    hour,
    day,
  };
}

/** The coming `days` game days from today, sampled hourly as the prototype did. */
export function forecast(
  seed: number,
  simTime: number,
  days = 3,
): ForecastDay[] {
  const today = Math.floor(simTime / GAME_DAY_MS);
  return Array.from({ length: days }, (_, i) => {
    const day = today + i;
    const start = day * GAME_DAY_MS;
    let lo = 99;
    let hi = -99;
    let storm = false;
    let rain = false;
    for (let h = 0; h < 24; h++) {
      const w = weatherAt(seed, start + h * HOUR_MS + 60_000);
      lo = Math.min(lo, w.temp);
      hi = Math.max(hi, w.temp);
      storm ||= w.storm;
      rain ||= w.rain;
    }
    return { day, start, lo, hi, storm, rain, snow: rain && lo < 1 };
  });
}

/**
 * What the weather did in `(from, to]`: how many storms began, and whether it
 * froze. Storms begin only on the hour, so their count is exact. Frost is a
 * drop below 1 °C; once below, it must rise above 3 °C to count again, as in
 * the prototype.
 */
export function weatherBetween(
  seed: number,
  from: number,
  to: number,
): { readonly storms: number; readonly frost: boolean } {
  let storms = 0;
  for (let h = Math.floor(from / HOUR_MS) + 1; h * HOUR_MS <= to; h++) {
    if (
      weatherAt(seed, h * HOUR_MS).storm &&
      !weatherAt(seed, (h - 1) * HOUR_MS).storm
    ) {
      storms++;
    }
  }
  let thawed = weatherAt(seed, from).temp >= 1;
  let frost = false;
  for (let t = from + SAMPLE_MS; t <= to && !frost; t += SAMPLE_MS) {
    const { temp } = weatherAt(seed, t);
    if (thawed && temp < 1) frost = true;
    if (temp > 3) thawed = true;
  }
  return { storms, frost };
}

/** The sky bodies there are to point at and name, as the prototype drew them. */
export function skyBodies(weather: Weather): readonly SkyBody[] {
  if (weather.rain) return ['rain'];
  return weather.night ? ['moon', 'cloud', 'star'] : ['sun', 'cloud', 'sky'];
}
