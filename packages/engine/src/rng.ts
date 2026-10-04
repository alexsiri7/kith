/** sfc32 state: four unsigned 32-bit words. */
export type RngState = readonly [number, number, number, number];

export const RNG_STREAMS = [
  'weather',
  'genetics',
  'behaviour',
  'spawning',
] as const;
export type RngStream = (typeof RNG_STREAMS)[number];
export type RngStreams = Readonly<Record<RngStream, RngState>>;

export interface Draw {
  readonly value: number;
  readonly state: RngState;
}

/**
 * Derives each named stream from the world seed independently, so adding a
 * draw to one system never shifts the sequence another system sees.
 */
export function seedStreams(seed: number): RngStreams {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`seed must be a uint32, got ${seed}`);
  }
  return {
    weather: seedStream(seed, 'weather'),
    genetics: seedStream(seed, 'genetics'),
    behaviour: seedStream(seed, 'behaviour'),
    spawning: seedStream(seed, 'spawning'),
  };
}

export function seedStream(seed: number, name: string): RngState {
  let h = Math.imul(seed ^ 0x811c9dc5, 0x01000193);
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  }
  let x = h >>> 0;
  const word = () => {
    x = (x + 0x9e3779b9) | 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
  let state: RngState = [word(), word(), word(), word()];
  // sfc32's first outputs are correlated with its seed words.
  for (let i = 0; i < 12; i++) state = nextUint32(state).state;
  return state;
}

export function nextUint32([a, b, c, d]: RngState): Draw {
  const t = (((a + b) | 0) + d + 1) | 0;
  return {
    value: t >>> 0,
    state: [
      (b ^ (b >>> 9)) >>> 0,
      (c + (c << 3)) >>> 0,
      (((c << 21) | (c >>> 11)) + t) >>> 0,
      (d + 1) >>> 0,
    ],
  };
}

/** A float in [0, 1). */
export function nextFloat(state: RngState): Draw {
  const draw = nextUint32(state);
  return { value: draw.value / 0x1_0000_0000, state: draw.state };
}
