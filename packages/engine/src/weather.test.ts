import { describe, expect, it } from 'vitest';
import { GAME_DAY_MS } from './clock.js';
import { forecast, skyBodies, weatherAt, weatherBetween } from './weather.js';

const HOUR_MS = 3_600_000;
const SEEDS = [0, 1, 600, 619, 0xffffffff];

describe('weatherAt', () => {
  it('is determined by the seed and game time', () => {
    const t = 3 * GAME_DAY_MS + 7 * HOUR_MS;
    expect(weatherAt(42, t)).toEqual(weatherAt(42, t));
    const days = Array.from({ length: 30 }, (_, d) => d * GAME_DAY_MS);
    expect(days.map((d) => weatherAt(1, d))).not.toEqual(
      days.map((d) => weatherAt(2, d)),
    );
  });

  it('is night before 6:30 and from 21:30', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
      const { night, hour } = weatherAt(7, 5 * GAME_DAY_MS + minutes * 60_000);
      expect(night).toBe(hour < 6.5 || hour >= 21.5);
    }
  });

  it('snows only when it rains below 1 °C, and storms always rain', () => {
    for (const seed of SEEDS) {
      for (let t = 0; t < 60 * GAME_DAY_MS; t += HOUR_MS / 2) {
        const w = weatherAt(seed, t);
        expect(w.snow).toBe(w.rain && w.temp < 1);
        if (w.storm) expect(w.rain).toBe(true);
      }
    }
  });
});

describe('forecast', () => {
  it('foretells the next three days as the weather turns out', () => {
    for (const seed of SEEDS) {
      for (let d = 0; d < 100; d += 3) {
        const days = forecast(seed, d * GAME_DAY_MS + 9 * HOUR_MS);
        expect(days.map((f) => f.day)).toEqual([d, d + 1, d + 2]);
        for (const f of days) {
          expect(f.start).toBe(f.day * GAME_DAY_MS);
          let storm = false;
          let rain = false;
          let lo = Infinity;
          let hi = -Infinity;
          for (let t = f.start; t < f.start + GAME_DAY_MS; t += 360_000) {
            const w = weatherAt(seed, t);
            storm ||= w.storm;
            rain ||= w.rain;
            lo = Math.min(lo, w.temp);
            hi = Math.max(hi, w.temp);
          }
          expect({ storm: f.storm, rain: f.rain }).toEqual({ storm, rain });
          expect(lo).toBeGreaterThanOrEqual(f.lo - 2);
          expect(hi).toBeLessThanOrEqual(f.hi + 2);
          expect(f.snow).toBe(f.rain && f.lo < 1);
        }
      }
    }
  });
});

describe('weatherBetween', () => {
  it('counts each storm once, from the hour it begins', () => {
    for (const seed of SEEDS) {
      const to = 20 * GAME_DAY_MS;
      let onsets = 0;
      for (let t = HOUR_MS; t <= to; t += HOUR_MS) {
        if (weatherAt(seed, t).storm && !weatherAt(seed, t - 1).storm) onsets++;
      }
      expect(weatherBetween(seed, 0, to).storms).toBe(onsets);
      const halves =
        weatherBetween(seed, 0, to / 2).storms +
        weatherBetween(seed, to / 2, to).storms;
      expect(halves).toBe(onsets);
    }
  });

  it('reports frost only when it dropped below 1 °C', () => {
    for (const seed of SEEDS) {
      for (let d = 0; d < 30; d++) {
        const from = d * GAME_DAY_MS;
        const temps = Array.from(
          { length: 240 },
          (_, i) => weatherAt(seed, from + (i + 1) * 360_000).temp,
        );
        const { frost } = weatherBetween(seed, from, from + GAME_DAY_MS);
        if (weatherAt(seed, from).temp >= 1) {
          expect(frost).toBe(temps.some((t) => t < 1));
        } else if (temps.every((t) => t <= 3)) {
          expect(frost).toBe(false);
        }
      }
    }
  });
});

describe('skyBodies', () => {
  it('shows rain while raining, else the sun by day and the moon by night', () => {
    const base = weatherAt(1, 0);
    expect(skyBodies({ ...base, rain: true })).toEqual(['rain']);
    expect(skyBodies({ ...base, rain: false, night: true })).toEqual([
      'moon',
      'cloud',
      'star',
    ]);
    expect(skyBodies({ ...base, rain: false, night: false })).toEqual([
      'sun',
      'cloud',
      'sky',
    ]);
  });
});
