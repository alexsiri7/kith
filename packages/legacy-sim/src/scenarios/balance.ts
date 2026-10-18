import type { Scenario } from './harness.js';

/**
 * The garden's balance, as thresholds every simulation must meet: legacy-sim
 * now, the new engine with the same numbers later. Deaths are counted over
 * all seeds, everything else is a mean.
 */
export interface Limits {
  maxDeaths?: number;
  minTockSpent?: number;
  maxTockSpent?: number;
  /** Share of the Kith that have learned to keep away from the river. */
  minRiverAvoiders?: number;
  /** Share of the player's time. */
  maxResting?: number;
  /** Share of the player's time spent playing or following its wishes. */
  minPlayingOrWishing?: number;
  minMeals?: number;
  /** Wall-clock budget for running the scenario, in milliseconds. */
  maxMs?: number;
}

const HAND_NEAR = { x: 400, y: 300 };

export const BALANCE: readonly {
  name: string;
  scenario: Scenario;
  limits: Limits;
}[] = [
  {
    name: '1 Kith left alone for 24h with no coins survives cheaply',
    scenario: { kith: 1, days: 1, coins: 0 },
    limits: { maxDeaths: 0, maxTockSpent: 30 },
  },
  {
    name: '1 Kith left alone for 3 days with no coins',
    scenario: { kith: 1, days: 3, coins: 0 },
    limits: { maxDeaths: 1 },
  },
  {
    name: '2 Kith left alone for 3 days with 100 coins',
    scenario: { kith: 2, days: 3, coins: 100 },
    limits: { maxDeaths: 2 },
  },
  {
    name: '4 Kith left alone for 3 days with 100 coins cost Tock a lot',
    scenario: { kith: 4, days: 3, coins: 100 },
    limits: { minTockSpent: 500 },
  },
  {
    name: 'a Kith left alone for 2 days learns to avoid the river',
    scenario: { kith: 1, days: 2, coins: 0 },
    limits: { minRiverAvoiders: 0.7 },
  },
  {
    name: 'a Kith with the player for 40 minutes is lively',
    scenario: {
      kith: 1,
      coins: 0,
      present: { minutes: 40, hand: HAND_NEAR },
    },
    limits: { maxResting: 0.6, minMeals: 1, minPlayingOrWishing: 0.25 },
  },
  {
    name: 'catching up 7 days with 4 Kith is quick',
    scenario: { seeds: [600], kith: 4, days: 7, coins: 100 },
    limits: { maxMs: 2000 },
  },
];
