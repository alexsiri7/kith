/** A source of floats in [0, 1), standing in for `Math.random`. */
export type Rng = () => number;

/** Anything that carries a random stream as a single int32 (worlds do). */
export interface RngHolder {
  rng: number;
}

/**
 * mulberry32. Its whole state is one int32, so a world can keep it as a plain
 * number and still round-trip through JSON.
 */
export function random(holder: RngHolder): number {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngOf(holder: RngHolder): Rng {
  return () => random(holder);
}
