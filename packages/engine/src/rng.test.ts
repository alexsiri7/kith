import { describe, expect, it } from 'vitest';
import {
  nextFloat,
  nextUint32,
  seedStream,
  seedStreams,
  type RngState,
} from './rng.js';

function take(state: RngState, n: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const draw = nextUint32(state);
    values.push(draw.value);
    state = draw.state;
  }
  return values;
}

describe('rng', () => {
  it('is reproducible from the seed', () => {
    expect(take(seedStream(42, 'weather'), 20)).toEqual(
      take(seedStream(42, 'weather'), 20),
    );
  });

  it('derives distinct sequences per seed and per stream', () => {
    const streams = seedStreams(42);
    const sequences = [
      ...Object.values(streams).map((s) => take(s, 8).join()),
      take(seedStreams(43).weather, 8).join(),
    ];
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it('resumes identically from serialised state', () => {
    const start = seedStream(7, 'behaviour');
    const whole = take(start, 10);
    let state = start;
    for (let i = 0; i < 4; i++) state = nextUint32(state).state;
    const restored = JSON.parse(JSON.stringify(state)) as RngState;
    expect(take(restored, 6)).toEqual(whole.slice(4));
  });

  it('keeps state as unsigned 32-bit words', () => {
    let state = seedStream(1, 'genetics');
    for (let i = 0; i < 1000; i++) {
      state = nextUint32(state).state;
      for (const word of state) {
        expect(Number.isInteger(word) && word >= 0 && word <= 0xffffffff).toBe(
          true,
        );
      }
    }
  });

  it('draws floats in [0, 1) spread across the range', () => {
    let state = seedStream(9, 'spawning');
    let sum = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      const draw = nextFloat(state);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(1);
      sum += draw.value;
      state = draw.state;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });

  it('rejects seeds that are not uint32', () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => seedStreams(seed)).toThrow(RangeError);
    }
  });
});
