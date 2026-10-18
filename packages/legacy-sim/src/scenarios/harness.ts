/** What a Kith is doing while the player is there, as the scenarios judge it. */
export type Activity = 'resting' | 'playing' | 'wishing' | 'other';

export interface LiveSession {
  minutes: number;
  hand: { x: number; y: number };
}

/** One seeded garden: its Kith hatch at the start, are left alone for `days`, then the player is there for `present`. */
export interface WorldSpec {
  seed: number;
  kith: number;
  coins: number;
  days: number;
  present: false | LiveSession;
}

export interface KithTally {
  /** What it died of, or null if it is alive. */
  cause: string | null;
  avoidsRiver: boolean;
  words: number;
  /** What it has come to feel, -1 to 1, about what is in the garden. */
  opinions: Record<string, number>;
}

/** What happened to one garden. Only the Kith it started with are tallied, not their young. */
export interface WorldTally {
  kith: KithTally[];
  tockSpent: number;
  /** Times any Kith ate, however it came by the food. */
  meals: number;
  /** Every logged event, counted by type. */
  events: Record<string, number>;
  /** Milliseconds each living Kith spent on each activity while the player was there. */
  activity: Record<Activity, number>;
}

/** A simulation the scenarios can run: legacy-sim now, the new engine later. */
export interface ScenarioSim {
  run(spec: WorldSpec): WorldTally;
}

export interface Scenario {
  seeds?: readonly number[];
  kith: number;
  coins: number;
  days?: number;
  present?: false | LiveSession;
}

/** A scenario's results over all its seeds: totals for deaths, means for the rest. */
export interface Stats {
  worlds: number;
  kith: number;
  deaths: number;
  deathsByCause: Record<string, number>;
  /** Per world. */
  tockSpent: number;
  /** Per world. */
  meals: number;
  /** Per world. */
  events: Record<string, number>;
  /** Share of the Kith. */
  riverAvoiders: number;
  /** Per Kith. */
  words: number;
  /** Per Kith, counting a Kith without the opinion as 0. */
  opinions: Record<string, number>;
  /** Share of the Kith's time while the player was there. */
  activity: Record<Activity, number>;
}

export const DEFAULT_SEEDS = Array.from({ length: 20 }, (_, i) => 600 + i);

export function runScenario(sim: ScenarioSim, scenario: Scenario): Stats {
  const { seeds = DEFAULT_SEEDS, days = 0, present = false } = scenario;
  const worlds = seeds.map((seed) =>
    sim.run({
      seed,
      kith: scenario.kith,
      coins: scenario.coins,
      days,
      present,
    }),
  );
  const kith = worlds.flatMap((w) => w.kith);
  const deaths = kith.flatMap((k) => (k.cause === null ? [] : [k.cause]));
  const activity = sum(worlds.map((w) => w.activity));
  const presentMs = Object.values(activity).reduce((a, b) => a + b, 0);
  return {
    worlds: worlds.length,
    kith: kith.length,
    deaths: deaths.length,
    deathsByCause: sum(deaths.map((cause) => ({ [cause]: 1 }))),
    tockSpent: mean(worlds.map((w) => w.tockSpent)),
    meals: mean(worlds.map((w) => w.meals)),
    events: scale(sum(worlds.map((w) => w.events)), 1 / worlds.length),
    riverAvoiders: mean(kith.map((k) => (k.avoidsRiver ? 1 : 0))),
    words: mean(kith.map((k) => k.words)),
    opinions: scale(sum(kith.map((k) => k.opinions)), 1 / kith.length),
    activity: scale(activity, presentMs ? 1 / presentMs : 0),
  };
}

function mean(xs: readonly number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sum<K extends string>(records: readonly Record<K, number>[]) {
  const out = {} as Record<K, number>;
  for (const r of records)
    for (const [k, v] of Object.entries(r) as [K, number][])
      out[k] = (out[k] ?? 0) + v;
  return out;
}

function scale<K extends string>(r: Record<K, number>, by: number) {
  const out = { ...r };
  for (const k in out) out[k] *= by;
  return out;
}
