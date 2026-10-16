export const HOUR = 3600e3,
  DAY = 24 * HOUR;
export const W = 2400,
  VIEW = 800,
  GROUND = 360;
export const SHELTER_X = 95,
  DOCK_X = 700;
export const RIVER = { x1: 1180, x2: 1300 } as const;
export const LEVER_X = 1135,
  BOARD_X = 830,
  MUSIC_X = 970,
  BUSH_X = 1520,
  VENDOR_X = 1760,
  HILL_X = 2250;
/** [meaning, word, picture] */
export const BOARD: readonly (readonly [string, string, string])[] = [
  ['ball', 'ball', '⚽'],
  ['food', 'food', '🥕'],
  ['shelter', 'home', '🏠'],
  ['eat', 'eat', '😋'],
  ['play', 'play', '🎈'],
  ['sleep', 'sleep', '💤'],
  ['come', 'come', '👋'],
  ['hungry', 'hungry', '🍽️'],
  ['cold', 'cold', '❄️'],
  ['tired', 'tired', '🥱'],
  ['happy', 'happy', '😊'],
  ['water', 'water', '🌊'],
  ['scared', 'scared', '😨'],
  ['good', 'good', '👍'],
  ['music', 'music', '🎵'],
];
export const PATCH_X: readonly number[] = [470, 515, 560];
export const LIFESPAN_DAYS = 14;
export const SCALE = 6;
export const DRIVES = [
  'hunger',
  'cold',
  'tired',
  'bored',
  'lonely',
  'fear',
] as const;
export type Drive = (typeof DRIVES)[number];
export const ACTIONS = [
  'eat',
  'play',
  'rest',
  'sleep',
  'approach',
  'wander',
  'idle',
  'want',
  'vend',
  'music',
  'hug',
  'social',
  'poke',
] as const;
export type Action = (typeof ACTIONS)[number];
export const WANTS = {
  fetch: 'carry the ball over to the player',
  dance: 'hop and wiggle on the spot, just for joy',
  explore: 'go and sniff around a spot: carrots, hill, shelter or middle',
  watch: 'sit and gaze at the sky, the clouds, rain or stars',
  sing: 'babble a little song',
  practice: 'say one of its known words over and over to itself',
  play: 'chase the ball around',
  cuddle: 'go and sit close to the player',
  hug: 'go and hug its doll',
  friend: 'go and play with another Kith it likes',
  chase: 'chase the squirrel or the butterflies',
  honey: 'try to get honey from the beehive (risky: the bees may sting)',
  music: 'crank the music box and dance to it',
  learn: 'press the word board and watch the pictures and words',
} as const;
export type WantKind = keyof typeof WANTS;
export const SPOTS = {
  carrots: 515,
  shelter: 95,
  meadow: 640,
  river: 1140,
  bush: 1520,
  hill: 2250,
  middle: 640,
} as const;
export const SPOT_NAMES = [
  'carrots',
  'shelter',
  'meadow',
  'river',
  'bush',
  'hill',
] as const;
export type SpotName = (typeof SPOT_NAMES)[number];
export const DRIVE_W: Readonly<Record<Drive, number>> = {
  hunger: 1,
  cold: 1.2,
  tired: 0.6,
  bored: 0.5,
  lonely: 0.7,
  fear: 0.8,
};
export const MEANINGS: readonly string[] = [
  'bees',
  'honey',
  'cactus',
  'squirrel',
  'butterfly',
  'mushroom',
  'tree',
  'no',
  'sky',
  'sun',
  'moon',
  'star',
  'cloud',
  'rain',
  'flower',
  'friend',
  'you',
  'self',
  'food',
  'ball',
  'shelter',
  'robot',
  'water',
  'music',
  'machine',
  'doll',
  'toy',
  'eat',
  'play',
  'sleep',
  'come',
  'stop',
  'hungry',
  'cold',
  'tired',
  'bored',
  'lonely',
  'scared',
  'hurt',
  'happy',
  'good',
  'bad',
  'love',
];
export const FEEL_WORD: Readonly<Record<Drive, string>> = {
  hunger: 'hungry',
  cold: 'cold',
  tired: 'tired',
  bored: 'bored',
  lonely: 'lonely',
  fear: 'scared',
};
export const MEANING_ACTION: Readonly<Record<string, Action>> = {
  friend: 'social',
  doll: 'hug',
  toy: 'play',
  music: 'music',
  machine: 'vend',
  eat: 'eat',
  food: 'eat',
  play: 'play',
  ball: 'play',
  sleep: 'rest',
  shelter: 'rest',
  come: 'approach',
  you: 'approach',
  stop: 'idle',
};
export const FOOD = {
  cake: 0.45,
  berry: 0.25,
  carrot: 0.35,
  honey: 0.3,
  shroomB: 0.2,
  shroomR: 0.15,
} as const;
export type FoodType = keyof typeof FOOD;
export const HIVE_X = 1060,
  CACTUS_X = 2090,
  TREE_X = 380;
export const OBJ_WORD: Readonly<Record<string, string>> = {
  hive: 'bees',
  cactus: 'cactus',
  squirrel: 'squirrel',
  butterfly: 'butterfly',
  red: 'mushroom',
  brown: 'mushroom',
};
export const SHOP = {
  cake: { price: 10, label: 'Seed cake', note: 'Filling. Keeps 3 days.' },
  berries: { price: 12, label: 'Two berries', note: 'A light snack each.' },
  doll: {
    price: 40,
    label: 'A doll',
    note: 'Something to hug. Eases loneliness while you’re away.',
  },
  top: {
    price: 30,
    label: 'A spinning top',
    note: 'Tap it to spin. Kith can spin it too.',
  },
  repair: {
    price: 30,
    label: 'Shelter repair',
    note: 'Patches storm damage on every shelter.',
  },
  bush: {
    price: 60,
    label: 'Plant a berry bush',
    note: 'Planted where you’re looking. Regrows berries.',
  },
  carrots: {
    price: 40,
    label: 'Plant a carrot row',
    note: 'Three more carrots, where you’re looking.',
  },
  egg: {
    price: 200,
    label: 'Adopt an egg',
    note: 'A new Kith for the garden. Six at most.',
  },
  shelter: {
    price: 150,
    label: 'Build a shelter',
    note: 'Built where you’re looking. Drag to move it.',
  },
} as const;
export const TOCK_CAKE = 10;
export const SUBJECT_ACTION = {
  you: 'approach',
  shelter: 'rest',
  ball: 'play',
  food: 'eat',
  robot: null,
  storm: null,
  cold: 'rest',
  night: 'rest',
  river: null,
  music: 'music',
  machine: 'vend',
  doll: 'hug',
  bees: null,
  cactus: null,
  squirrel: null,
  mushroom: null,
} as const satisfies Record<string, Action | null>;
export type Subject = keyof typeof SUBJECT_ACTION;
export const SUBJECT_OBJ: Readonly<Partial<Record<Subject, string>>> = {
  bees: 'hive',
  cactus: 'cactus',
  squirrel: 'squirrel',
  mushroom: 'red',
};
export const SUBJECTS = Object.keys(SUBJECT_ACTION) as readonly Subject[];
