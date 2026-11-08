import {
  GARDEN_TIME_SCALE,
  type LanguageDef,
  type MindDef,
  type SocialDef,
} from '@kith/engine';

// The prototype's numbers (packages/legacy-sim). It counted durations and
// speeds in real time at GARDEN_TIME_SCALE; here they are game time.
const REAL = GARDEN_TIME_SCALE;
const HOUR_MS = 3_600_000;

/** How a Kith's mind works: its needs, attention, choices and learning. */
export const KITH_MIND: MindDef = {
  needs: {
    hunger: {
      awake: 0.05,
      asleep: 0.03,
      genome: { trait: 'hardiness', base: 1.2, per: -0.4 },
    },
    // Until Kith can rest in shelters (#14), exposure to the weather waits,
    // and cold eases to 0.
    cold: { awake: 0, asleep: 0, ease: 0.6 },
    tired: { awake: 0.05, asleep: -0.14 },
    bored: { awake: 0.1, asleep: 0 },
    lonely: {
      // 0.07 an hour, at 0.6 while Tock sits with it.
      awake: 0.07 * 0.6,
      asleep: 0.07 * 0.6,
      watched: { far: 0.02, nearHand: -0.4, within: 110 },
      genome: { trait: 'sociability', base: 0.5, per: 1 },
      stage: { baby: 1.3 },
    },
    fear: { awake: -0.5, asleep: -0.5 },
  },
  health: {
    harm: [
      { need: 'hunger', above: 0.85, perHour: 0.05 },
      { need: 'cold', above: 0.75, perHour: 0.08 },
    ],
    heal: { perHour: 0.03, below: { hunger: 0.6, cold: 0.5 } },
  },
  movement: {
    speed: { baby: 35 / REAL, elder: 40 / REAL },
    defaultSpeed: 60 / REAL,
    slow: [{ need: 'cold', above: 0.6, factor: 0.6 }],
    sickFactor: 0.55,
    arriveWithin: 14,
    bounds: [40, 2360],
    fleeDistance: 200,
    bank: { stop: 8, climbOut: 14 },
  },
  sleep: {
    fallAsleepAbove: { tired: 0.92 },
    wake: {
      below: { tired: 0.06 },
      above: { fear: 0.6, hunger: 0.8, cold: 0.6 },
    },
  },
  attention: {
    // The prototype's Kith knew the whole 2400 px garden.
    range: 2400,
    attend: 3,
    curiosity: 0.3,
    distance: 1 / 2500,
    avoidBelow: -0.35,
  },
  decision: {
    noise: { baby: 0.35, child: 0.22 },
    defaultNoise: 0.12,
    pursueMs: 40_000 * REAL,
  },
  activities: {
    idle: { base: 0.05, ms: [4_000 * REAL, 8_000 * REAL] },
    wander: {
      base: 0.08,
      curiosity: 0.1,
      range: 700,
      ms: [10_000 * REAL, 20_000 * REAL],
    },
    sleep: { whenAbove: { tired: 0.45 } },
    approach: { ms: 15_000 * REAL, relief: { lonely: -0.3 } },
  },
  instincts: {
    hunger: { eat: { food: 0.3 }, use: { gadget: 0.06 } },
    cold: { 'rest-in': { structure: 0.25 } },
    tired: { sleep: { self: 0.45 }, 'rest-in': { structure: 0.15 } },
    bored: {
      play: { toy: 0.35 },
      spin: { toy: 0.35 },
      poke: { hazard: 0.3, plant: 0.3, critter: 0.3 },
      chase: { critter: 0.3 },
      use: { gadget: 0.12 },
      social: { kith: 0.12 },
    },
    lonely: {
      approach: { player: 0.45 },
      hug: { toy: 0.25 },
      social: { kith: 0.4 },
    },
    fear: {
      'rest-in': { structure: 0.15 },
      approach: { player: 0.25 },
      hug: { toy: 0.2 },
      social: { kith: 0.15 },
    },
  },
  learning: {
    rate: 0.3,
    minNeed: 0.2,
    gain: 4,
    range: [-0.3, 1],
    values: [-0.5, 1.2],
    skill: { learned: 0.5, unlearned: 0.15 },
  },
  zoneFear: { base: 0.35, curiosity: 0.3 },
  feedback: {
    windowMs: 10_000 * REAL,
    rate: 0.3,
    tickle: {
      reward: 0.6,
      needs: { bored: -0.1, lonely: -0.15 },
      comfort: { when: { fear: 0.4, cold: 0.5 }, needs: { fear: -0.3 } },
    },
    scold: {
      reward: -0.7,
      needs: { fear: 0.15 },
      opinion: -0.25,
      zone: { within: 90, opinion: -0.15 },
    },
  },
  biases: {
    // A want lasted a garden day, or until done.
    wish: { ms: 24 * HOUR_MS, strength: 0.45 },
    // As strong and as long as an obeyed command.
    cortex: { ms: 30_000 * REAL, strength: 1.5 },
  },
};

/** How a Kith learns words, talks, and takes words as commands. */
export const KITH_LANGUAGE: LanguageDef = {
  teaching: { rate: 0.25, speakable: 0.3, speakableCoins: 10 },
  // The prototype's lexicon rates were per real hour.
  memory: {
    decayPerHour: 0.03 / REAL,
    keepAbove: 0.8,
    consolidatePerHour: 0.1 / REAL,
    consolidateAbove: 0.5,
  },
  speech: {
    maxWords: { baby: 1, child: 3, adult: 6, elder: 5 },
    defaultMaxWords: 1,
    properNouns: ['you', 'self', 'robot'],
    babble: { words: [1, 3], repeat: 0.4, exclaim: 0.5 },
    sayMs: 4_500 * REAL,
  },
  chatter: {
    every: [10_000 * REAL, 26_000 * REAL],
    feelAbove: 0.55,
    feelings: {
      hunger: 'hungry',
      cold: 'cold',
      tired: 'tired',
      bored: 'bored',
      lonely: 'lonely',
      fear: 'scared',
    },
    callPlayer: ['lonely', 'fear', 'hunger', 'cold'],
    mention: 0.7,
    nearby: 160,
    quiet: 0.5,
    hearWithin: 180,
    spreadAbove: 0.5,
    strength: 0.3,
    parentStrength: 0.45,
  },
  overhear: { within: 140, perHour: 0.04, parent: 1.5 },
  attention: {
    noticeWithin: 250,
    lookMs: 4_000 * REAL,
    attendMs: 8_000 * REAL,
    attendWithin: 320,
  },
  hearing: {
    maxWords: 12,
    wakeBelow: { tired: 0.45, fear: 0.5 },
    plain: 1,
    pointed: 1,
    attending: 1.6,
    bystanders: 0.5,
    bystanderWithin: 220,
    ignore: [
      'the',
      'a',
      'an',
      'this',
      'that',
      'is',
      'it',
      "it's",
      'its',
      'look',
      'see',
      'here',
      'there',
      'my',
      'your',
      'at',
      'to',
      'and',
      'yes',
      'no',
      'oh',
      'hey',
      'hi',
      'wow',
      'good',
      'nice',
    ],
    feelAbove: 0.6,
  },
  commands: {
    eat: { verb: 'eat', direct: true },
    food: { verb: 'eat' },
    play: { verb: 'play', direct: true },
    ball: { verb: 'play' },
    toy: { verb: 'play' },
    doll: { verb: 'hug' },
    machine: { verb: 'use' },
    music: { verb: 'use' },
    sleep: { verb: 'rest-in', direct: true },
    shelter: { verb: 'rest-in' },
    come: { verb: 'approach', direct: true },
    you: { verb: 'approach' },
    friend: { verb: 'social' },
    stop: { verb: 'idle', direct: true },
  },
  obey: {
    base: 0.25,
    trust: 0.45,
    trait: 'agreeable',
    perTrait: 0.3,
    needs: { bored: -0.2 },
    ms: 30_000 * REAL,
    strength: 1.5,
  },
};

const tradeable = { range: [0, 1], amount: 0.4 } as const;

/** How a Kith bonds, warns, raises a family and grieves. */
export const KITH_SOCIAL: SocialDef = {
  firstBond: {
    kith: { familiarity: 0, affection: 0.1, trust: 0.2 },
    robot: { familiarity: 0, affection: 0.05, trust: 0.15 },
  },
  player: {
    // 0.015 a real hour.
    watched: 0.015 / REAL,
    tickle: { affection: 0.015, trust: 0.008 },
    comfort: { affection: 0.05, trust: 0.05 },
    scold: { trust: -0.03 },
  },
  company: {
    kith: {
      within: 140,
      familiarity: 0.05,
      ease: { need: 'lonely', perHour: 0.25, base: 0.4 },
      affection: {
        perHour: 0.015,
        sociability: 0.4,
        afraid: { need: 'fear', above: 0.5, factor: 0.3 },
      },
    },
    robot: {
      within: 140,
      familiarity: 0.03,
      ease: { need: 'lonely', perHour: 0.08, base: 0.3 },
      affection: { perHour: 0.006 },
    },
  },
  warning: {
    within: 260,
    below: -0.4,
    everyMs: 60_000 * REAL,
    refuse: ['no', 'bad'],
    heed: { rate: 0.15, base: 0.6, worded: 1.4 },
    teach: 0.4,
    abandon: { below: -0.3, trust: 0.6 },
    coins: 20,
  },
  family: {
    stage: 'adult',
    within: 70,
    affection: 0.55,
    content: {
      below: { hunger: 0.45, cold: 0.3, fear: 0.2, tired: 0.7, lonely: 0.6 },
      health: 0.6,
    },
    // 1.5 real days.
    cooldownMs: 1.5 * 24 * HOUR_MS * REAL,
    fewerThan: 6,
    meanMs: 3 * HOUR_MS,
    coins: 30,
    egg: {
      hatchMs: 24 * HOUR_MS,
      hatchInto: 'baby',
      nest: { meaning: 'shelter', offset: 40 },
      affection: 0.6,
    },
    genome: {
      mutate: 0.15,
      traits: {
        curiosity: tradeable,
        agreeable: tradeable,
        sociability: tradeable,
        hardiness: tradeable,
        learnRate: { range: [0.6, 1.5], amount: 0.4 },
      },
    },
    inherit: {
      player: {
        trust: { base: 0.1, share: 0.6 },
        affection: { base: 0.05, share: 0.4 },
      },
      bonds: { robot: { trust: { base: 0.1, share: 0.5 } } },
      parent: { affection: 0.6, trust: 0.6 },
      zones: 0.3,
      beliefs: {
        about: ['you', 'river', 'robot'],
        above: 0.3,
        feel: 0.7,
        strength: 0.35,
      },
    },
  },
  grief: {
    closeAbove: 0.3,
    needs: { lonely: 0.3, fear: 0.2 },
    perAffection: { lonely: 0.5 },
    belief: { about: 'night', feel: -0.3 },
  },
};
