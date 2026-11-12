import {
  createEntity,
  formatIssues,
  type Category,
  type EntityType,
  type MeaningId,
  type NeedId,
} from './entity.js';
import type { GameEvent } from './event.js';
import { freeId } from './interact.js';
import { addLevels } from './brain.js';
import {
  languageState,
  nameOf,
  speak,
  teach,
  wordFor,
  type Language,
  type LanguageDef,
} from './language.js';
import {
  mindState,
  TRAITS,
  type Genome,
  type Levels,
  type Mind,
  type MindDef,
  type Trait,
} from './mind.js';
import type { Registry } from './registry.js';
import {
  BOND_KEYS,
  socialState,
  type Belief,
  type Bond,
  type Social,
} from './relationship.js';
import { nextFloat } from './rng.js';
import type { Presence, StepResult } from './step.js';
import { addCoins, addMoment, type EntityId, type World } from './world.js';

const HOUR_MS = 3_600_000;

/** `base + share × the parents' average`. */
export interface Share {
  readonly base: number;
  readonly share: number;
}

/** Being awake near an entity of some category. Rates are per game hour. */
export interface Company {
  readonly within: number;
  readonly familiarity: number;
  /** Eases `need` by `perHour × (base + affection)`. */
  readonly ease: {
    readonly need: NeedId;
    readonly perHour: number;
    readonly base: number;
  };
  /**
   * Gained while the other is awake: `perHour`, times `sociability + its
   * sociability` and times `afraid.factor` while its `afraid.need` is at or
   * above `afraid.above`, when the other has a mind.
   */
  readonly affection: {
    readonly perHour: number;
    readonly sociability?: number;
    readonly afraid?: {
      readonly need: NeedId;
      readonly above: number;
      readonly factor: number;
    };
  };
}

/** Durations are in sim milliseconds, distances in px. */
export interface SocialDef {
  /** How a bond with an entity of each category starts. */
  readonly firstBond: Readonly<Partial<Record<Category, Bond>>>;
  readonly player: {
    /** Familiarity gained per game hour while the player watches. */
    readonly watched: number;
    /** Changes to the bond with the player. */
    readonly tickle: Partial<Bond>;
    /** Instead of `tickle`, when the tickle comforts it. */
    readonly comfort: Partial<Bond>;
    readonly scold: Partial<Bond>;
  };
  readonly company: Readonly<Partial<Record<Category, Company>>>;
  /**
   * It warns another heading for a type it thinks no more than `below` of,
   * when the other thinks at least that of it.
   */
  readonly warning: {
    readonly within: number;
    readonly below: number;
    readonly everyMs: number;
    /** After the type's word it says the first of these it can. */
    readonly refuse: readonly MeaningId[];
    /** The listener's opinion drops `rate × (base + trust)`, times `worded` when words were said. */
    readonly heed: {
      readonly rate: number;
      readonly base: number;
      readonly worded: number;
    };
    /** How strongly the listener learns the words said. */
    readonly teach: number;
    /** It abandons its act once its opinion is below `below`, else by chance `trust × trust`. */
    readonly abandon: { readonly below: number; readonly trust: number };
    /** Paid to the player for a Kith's first warning. */
    readonly coins: number;
  };
  readonly family: {
    /** Both must be at this stage, awake, within `within` and content. */
    readonly stage: string;
    readonly within: number;
    /** Each must feel at least this for the other. */
    readonly affection: number;
    /** Content: each listed need below its level and health above `health`. */
    readonly content: { readonly below: Levels; readonly health: number };
    /** Before either lays again. */
    readonly cooldownMs: number;
    /** Eggs come only while fewer hatched ones than this live. */
    readonly fewerThan: number;
    /** Mean time an eligible pair takes to lay. */
    readonly meanMs: number;
    readonly coins: number;
    readonly egg: {
      readonly hatchMs: number;
      readonly hatchInto: string;
      /** Laid `offset` px from the nearest entity meaning `meaning`, else between the parents. */
      readonly nest: { readonly meaning: MeaningId; readonly offset: number };
      /** Each parent's affection for its egg. */
      readonly affection: number;
    };
    /** Each trait comes from either parent and mutates by chance. */
    readonly genome: {
      readonly mutate: number;
      readonly traits: Readonly<
        Partial<
          Record<
            Trait,
            {
              readonly range: readonly [number, number];
              readonly amount: number;
            }
          >
        >
      >;
    };
    /** What a hatchling takes from its parents. */
    readonly inherit: {
      readonly player: Readonly<Partial<Record<keyof Bond, Share>>>;
      /** Its bonds with entities of each category, such as Tock. */
      readonly bonds: Readonly<
        Partial<Record<Category, Readonly<Partial<Record<keyof Bond, Share>>>>>
      >;
      /** Its bond with each parent. */
      readonly parent: Partial<Bond>;
      /** Its opinion of each hazard zone: this share of its parents' worst. */
      readonly zones: number;
      readonly beliefs: {
        readonly about: readonly string[];
        readonly above: number;
        readonly feel: number;
        /** Inherited beliefs are no stronger than this. */
        readonly strength: number;
      };
    };
  };
  /** Kith whose affection for one who died is above `closeAbove` grieve. */
  readonly grief: {
    readonly closeAbove: number;
    /** Added to needs, plus `perAffection × affection`. */
    readonly needs: Levels;
    readonly perAffection: Levels;
    readonly belief: { readonly about: string; readonly feel: number };
  };
}

export interface SocialContent {
  readonly needs: ReadonlySet<NeedId>;
  readonly meanings: ReadonlySet<MeaningId>;
}

/** Checks social life against the type and content, phrased to follow `type "<id>" `. */
export function socialProblems(
  def: SocialDef,
  type: EntityType,
  defaults: unknown,
  known: SocialContent,
): string[] {
  const problems: string[] = [];
  const state = socialState.safeParse(defaults);
  if (!state.success) {
    for (const issue of formatIssues(state.error)) {
      problems.push(`social needs state field ${issue}`);
    }
  }
  const companies = Object.values(def.company);
  const needs = [
    ...companies.map((company) => company.ease.need),
    ...companies.flatMap((company) =>
      company.affection.afraid === undefined
        ? []
        : [company.affection.afraid.need],
    ),
    ...Object.keys(def.family.content.below),
    ...Object.keys(def.grief.needs),
    ...Object.keys(def.grief.perAffection),
  ];
  for (const need of new Set(needs)) {
    if (!known.needs.has(need)) {
      problems.push(`social uses unknown need "${need}"`);
    }
  }
  for (const meaning of [...def.warning.refuse, def.family.egg.nest.meaning]) {
    if (!known.meanings.has(meaning)) {
      problems.push(`social uses unknown meaning "${meaning}"`);
    }
  }
  const base =
    typeof defaults === 'object' && defaults !== null ? defaults : {};
  for (const stage of [def.family.stage, def.family.egg.hatchInto]) {
    if (!type.state.safeParse({ ...base, stage }).success) {
      problems.push(`social uses unknown stage "${stage}"`);
    }
  }
  return problems;
}

/** An entity whose type declares social life, with everything it reads. */
interface Member {
  readonly id: EntityId;
  readonly x: number;
  readonly type: EntityType;
  readonly def: SocialDef;
  readonly mindDef: MindDef;
  readonly languageDef: LanguageDef;
  readonly mind: Mind;
  readonly lang: Language;
  readonly social: Social;
  readonly name: string;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function memberOf(
  world: World,
  registry: Registry,
  id: EntityId,
): Member | null {
  const entity = world.entities[id];
  const type = entity && registry.types.get(entity.type);
  const { social: def, mind: mindDef, language: languageDef } = type ?? {};
  if (
    entity === undefined ||
    type === undefined ||
    def === undefined ||
    mindDef === undefined ||
    languageDef === undefined
  ) {
    return null;
  }
  return {
    id,
    x: entity.x,
    type,
    def,
    mindDef,
    languageDef,
    mind: mindState.parse(entity.state),
    lang: languageState.parse(entity.state),
    social: socialState.parse(entity.state),
    name: nameOf(entity.state) || id,
  };
}

const hatched = (member: Member) =>
  member.mind.alive && member.mind.stage !== 'egg';

/** Hatched, alive, awake and on dry land. */
const about = (member: Member) =>
  hatched(member) && !member.mind.asleep && member.mind.inZone === null;

/** Writes state fields, checking the whole state against the type. */
function withState(
  world: World,
  member: Member,
  change: Partial<Social & Mind & Language>,
): World {
  const entity = world.entities[member.id]!;
  if (typeof entity.state !== 'object' || entity.state === null) {
    throw new Error(`${entity.type} ${entity.id} has no state fields`);
  }
  const state = member.type.state.parse({ ...entity.state, ...change });
  return {
    ...world,
    entities: { ...world.entities, [member.id]: { ...entity, state } },
  };
}

function roll(world: World): [number, World] {
  const draw = nextFloat(world.rng.behaviour);
  return [
    draw.value,
    { ...world, rng: { ...world.rng, behaviour: draw.state } },
  ];
}

const NO_BOND: Bond = { familiarity: 0, affection: 0, trust: 0 };

/** What `member` feels for `other`, as it starts when they have not met. */
export function bondOf(
  world: World,
  registry: Registry,
  member: EntityId,
  other: EntityId,
): Bond {
  const self = memberOf(world, registry, member);
  if (self === null) return NO_BOND;
  return bondWith(world, registry, self, other);
}

function bondWith(
  world: World,
  registry: Registry,
  member: Member,
  other: EntityId,
): Bond {
  const known = member.social.bonds[other];
  if (known !== undefined) return known;
  const entity = world.entities[other];
  const category = entity && registry.types.get(entity.type)?.category;
  return (category && member.def.firstBond[category]) ?? NO_BOND;
}

function changed(bond: Bond, deltas: Partial<Bond>): Bond {
  return {
    familiarity: clamp(bond.familiarity + (deltas.familiarity ?? 0)),
    affection: clamp(bond.affection + (deltas.affection ?? 0)),
    trust: clamp(bond.trust + (deltas.trust ?? 0)),
  };
}

const BELIEFS_KEPT = 8;

/** Strengthens and reshapes a belief about `about`, or starts one. */
export function believe(
  beliefs: readonly Belief[],
  about: string,
  feel: number,
  text: string,
): Belief[] {
  feel = clamp(feel, -1, 1);
  text = text.slice(0, 60);
  const old = beliefs.find((belief) => belief.about === about);
  const next = old
    ? beliefs.map((belief) =>
        belief === old
          ? {
              about,
              feel: clamp(old.feel * 0.5 + feel * 0.6, -1, 1),
              text: text || old.text,
              strength: clamp(old.strength + 0.25),
            }
          : belief,
      )
    : [...beliefs, { about, feel, text, strength: 0.5 }];
  return next.sort((a, b) => b.strength - a.strength).slice(0, BELIEFS_KEPT);
}

/** The player's tickle or scold moves the bond with the player. */
export function befriend(
  world: World,
  registry: Registry,
  id: EntityId,
  kind: 'tickle' | 'scold',
): World {
  const member = memberOf(world, registry, id);
  if (member === null || !hatched(member)) return world;
  const { player } = member.def;
  const comforts = Object.entries(
    member.mindDef.feedback.tickle.comfort.when,
  ).some(([need, level]) => (member.mind.needs[need] ?? 0) > level);
  const deltas =
    kind === 'scold' ? player.scold : comforts ? player.comfort : player.tickle;
  return withState(world, member, {
    player: changed(member.social.player, deltas),
  });
}

/** Being near others: familiarity, eased loneliness and, while they are awake, affection. */
function company(
  world: World,
  registry: Registry,
  presence: Presence,
  me: Member,
  dtMs: number,
): World {
  const hours = dtMs / HOUR_MS;
  let needs = me.mind.needs;
  const bonds = { ...me.social.bonds };
  for (const other of Object.values(world.entities)) {
    const type = registry.types.get(other.type);
    const c = type && me.def.company[type.category];
    if (other.id === me.id || c === undefined) continue;
    if (Math.abs(other.x - me.x) >= c.within) continue;
    const mind = type?.mind === undefined ? null : mindState.parse(other.state);
    if (
      mind !== null &&
      (!mind.alive || mind.stage === 'egg' || mind.inZone !== null)
    ) {
      continue;
    }
    const bond = bondWith(world, registry, me, other.id);
    needs = addLevels(needs, {
      [c.ease.need]: -c.ease.perHour * hours * (c.ease.base + bond.affection),
    });
    let affection = 0;
    if (!mind?.asleep) {
      const { perHour, sociability, afraid } = c.affection;
      affection = perHour * hours;
      if (mind !== null && sociability !== undefined) {
        affection *= sociability + mind.genome.sociability;
      }
      if (mind !== null && afraid !== undefined) {
        if ((mind.needs[afraid.need] ?? 0) >= afraid.above) {
          affection *= afraid.factor;
        }
      }
    }
    bonds[other.id] = changed(bond, {
      familiarity: c.familiarity * hours,
      affection,
    });
  }
  const player = presence.watching
    ? changed(me.social.player, {
        familiarity: me.def.player.watched * hours,
      })
    : me.social.player;
  return withState(world, me, { needs, bonds, player });
}

/** Warns one Kith nearby heading for something it has learned to fear. */
function warn(
  world: World,
  registry: Registry,
  me: Member,
  events: GameEvent[],
): World {
  const { warning } = me.def;
  const now = world.clock.simTime;
  const { lastWarned } = me.social;
  if (lastWarned !== null && now - lastWarned < warning.everyMs) return world;
  for (const other of Object.values(world.entities)) {
    if (other.id === me.id || Math.abs(other.x - me.x) > warning.within) {
      continue;
    }
    const them = memberOf(world, registry, other.id);
    if (them === null || !about(them)) continue;
    const { act } = them.mind;
    if (act === null || act.done || act.type === null) continue;
    if (act.target?.kind !== 'entity') continue;
    if ((me.mind.opinions[act.type] ?? 0) > warning.below) continue;
    if ((them.mind.opinions[act.type] ?? 0) < warning.below) continue;
    return warned(world, registry, me, them, act.type, events);
  }
  return world;
}

function warned(
  world: World,
  registry: Registry,
  me: Member,
  them: Member,
  type: string,
  events: GameEvent[],
): World {
  const { warning } = me.def;
  const now = world.clock.simTime;
  const { lexicon } = me.lang;
  const meaning = registry.types.get(type)?.meaning;
  const refusal = warning.refuse
    .map((refuse) => wordFor(lexicon, refuse, me.languageDef))
    .find((word) => word !== null);
  const words = [
    meaning === undefined ? null : wordFor(lexicon, meaning, me.languageDef),
    refusal ?? null,
  ].filter((word) => word !== null);
  world = withState(world, me, { lastWarned: now });
  if (words.length > 0) {
    const said = speak(world, registry, me.id, `${words.join(' ')}!`);
    world = said.world;
    events.push(...said.events);
  } else {
    events.push({ type: 'said', actor: me.id, text: '!!' });
  }
  const { trust } = bondWith(world, registry, them, me.id);
  const { heed, abandon } = warning;
  const opinion = clamp(
    (them.mind.opinions[type] ?? 0) -
      heed.rate * (heed.base + trust) * (words.length > 0 ? heed.worded : 1),
    -1,
    1,
  );
  world = withState(world, them, {
    opinions: { ...them.mind.opinions, [type]: opinion },
  });
  for (const word of words) {
    const taught = teach(
      world,
      registry,
      them.id,
      word,
      lexicon[word]!.meaning,
      warning.teach,
    );
    world = taught.world;
    events.push(...taught.events);
  }
  let heeded = opinion < abandon.below;
  if (!heeded) {
    let r: number;
    [r, world] = roll(world);
    heeded = r < trust * abandon.trust;
  }
  const listener = memberOf(world, registry, them.id)!;
  const { act } = listener.mind;
  if (heeded && act !== null) {
    world = withState(world, listener, {
      act: { ...act, done: true, until: now },
    });
  }
  events.push({ type: 'warned', actor: me.id, target: them.id });
  if (me.social.hasWarned) return world;
  const what = meaning ?? type;
  const listened = heeded ? `, and ${them.name} listened` : '';
  world = withState(world, me, { hasWarned: true });
  return addCoins(
    addMoment(
      world,
      me.id,
      `${me.name} warned ${them.name} about the ${what}${listened}.`,
    ),
    warning.coins,
  );
}

function content(member: Member): boolean {
  const { below, health } = member.def.family.content;
  return (
    member.mind.health > health &&
    Object.entries(below).every(
      ([need, level]) => (member.mind.needs[need] ?? 0) < level,
    )
  );
}

function related(a: Member, b: Member): boolean {
  const ap = a.lang.parents;
  const bp = b.lang.parents;
  return (
    ap.includes(b.id) || bp.includes(a.id) || ap.some((p) => bp.includes(p))
  );
}

/** How many hatched Kith live outside any zone. */
function living(world: World, registry: Registry): number {
  return Object.keys(world.entities)
    .map((id) => memberOf(world, registry, id))
    .filter(
      (member) =>
        member !== null && hatched(member) && member.mind.inZone === null,
    ).length;
}

/** Two bonded, content adults nearby may lay an egg; the lower id lays it. */
function family(
  world: World,
  registry: Registry,
  me: Member,
  dtMs: number,
  events: GameEvent[],
): World {
  const f = me.def.family;
  const now = world.clock.simTime;
  const ready = (member: Member) =>
    about(member) &&
    member.mind.stage === f.stage &&
    content(member) &&
    (member.social.lastEgg === null ||
      now - member.social.lastEgg >= f.cooldownMs);
  if (!ready(me)) return world;
  for (const other of Object.values(world.entities)) {
    if (other.id <= me.id || Math.abs(other.x - me.x) > f.within) continue;
    const them = memberOf(world, registry, other.id);
    if (them === null || !ready(them) || related(me, them)) continue;
    if (
      bondWith(world, registry, me, them.id).affection < f.affection ||
      bondWith(world, registry, them, me.id).affection < f.affection
    ) {
      continue;
    }
    if (living(world, registry) >= f.fewerThan) return world;
    let r: number;
    [r, world] = roll(world);
    if (r > dtMs / f.meanMs) continue;
    return layEgg(world, registry, me, them, events);
  }
  return world;
}

function crossGenome(
  world: World,
  def: SocialDef,
  a: Genome,
  b: Genome,
): [Genome, World] {
  const { mutate, traits } = def.family.genome;
  const genome = { ...a };
  let r: number;
  for (const trait of TRAITS) {
    [r, world] = roll(world);
    let value = (r < 0.5 ? a : b)[trait];
    const range = traits[trait];
    if (range !== undefined) {
      [r, world] = roll(world);
      if (r < mutate) {
        [r, world] = roll(world);
        const [lo, hi] = range.range;
        value = clamp(value + (r - 0.5) * range.amount, lo, hi);
      }
    }
    genome[trait] = value;
  }
  return [genome, world];
}

/** The first syllable from one parent, the second from the other, the third from either. */
function crossSyllables(
  world: World,
  a: readonly string[],
  b: readonly string[],
): [string[], World] {
  let r: number;
  [r, world] = roll(world);
  const third = (r < 0.5 ? a : b)[2];
  const syllables = [a[0], b[1], third].filter((s) => s !== undefined);
  return [syllables.length > 0 ? syllables : [...a], world];
}

function layEgg(
  world: World,
  registry: Registry,
  a: Member,
  b: Member,
  events: GameEvent[],
): World {
  const { family: f } = a.def;
  const now = world.clock.simTime;
  const mid = (a.x + b.x) / 2;
  const nest = Object.values(world.entities)
    .filter((e) => registry.types.get(e.type)?.meaning === f.egg.nest.meaning)
    .sort((p, q) => Math.abs(p.x - mid) - Math.abs(q.x - mid))[0];
  const [min, max] = a.mindDef.movement.bounds;
  const x = clamp(
    nest === undefined ? mid : nest.x + f.egg.nest.offset,
    min,
    max,
  );
  let genome: Genome;
  [genome, world] = crossGenome(world, a.def, a.mind.genome, b.mind.genome);
  let syllables: string[];
  [syllables, world] = crossSyllables(
    world,
    a.lang.syllables,
    b.lang.syllables,
  );
  const id = freeId(world, a.type.id);
  const egg = createEntity(registry, {
    id,
    type: a.type.id,
    x,
    state: {
      stage: 'egg',
      hatchAt: now + f.egg.hatchMs,
      parents: [a.id, b.id],
      generation: Math.max(a.social.generation, b.social.generation) + 1,
      genome,
      syllables,
    },
  });
  world = { ...world, entities: { ...world.entities, [id]: egg } };
  for (const parent of [a, b]) {
    const bond = bondWith(world, registry, parent, id);
    world = withState(world, parent, {
      lastEgg: now,
      bonds: {
        ...parent.social.bonds,
        [id]: { ...bond, affection: f.egg.affection },
      },
    });
  }
  events.push({ type: 'eggLaid', actor: a.id, target: id });
  return addCoins(
    addMoment(world, a.id, `${a.name} and ${b.name} made an egg together.`),
    f.coins,
  );
}

function inherit(
  world: World,
  registry: Registry,
  child: Member,
): Partial<Social & Mind> {
  const parents = child.lang.parents
    .map((id) => memberOf(world, registry, id))
    .filter((parent): parent is Member => parent !== null);
  if (parents.length === 0) return {};
  const { inherit: i } = child.def.family;
  const avg = (of: (parent: Member) => number) =>
    parents.reduce((total, parent) => total + of(parent), 0) / parents.length;
  const shared = (
    bond: Bond,
    shares: Readonly<Partial<Record<keyof Bond, Share>>>,
    of: (parent: Member) => Bond,
  ): Bond => {
    const next = { ...bond };
    for (const key of BOND_KEYS) {
      const share = shares[key];
      if (share === undefined) continue;
      next[key] = clamp(share.base + share.share * avg((p) => of(p)[key]));
    }
    return next;
  };
  const player = shared(child.social.player, i.player, (p) => p.social.player);
  const bonds: Record<EntityId, Bond> = { ...child.social.bonds };
  for (const other of Object.values(world.entities)) {
    const category = registry.types.get(other.type)?.category;
    const shares = category && i.bonds[category];
    if (shares === undefined) continue;
    bonds[other.id] = shared(
      bondWith(world, registry, child, other.id),
      shares,
      (p) => bondWith(world, registry, p, other.id),
    );
  }
  for (const parent of parents) {
    bonds[parent.id] = {
      ...bondWith(world, registry, child, parent.id),
      ...i.parent,
    };
  }
  const opinions = { ...child.mind.opinions };
  for (const type of registry.types.values()) {
    if (type.zone === undefined) continue;
    const worst = Math.min(
      ...parents.map((p) => p.mind.opinions[type.id] ?? 0),
    );
    if (worst < 0) opinions[type.id] = clamp(i.zones * worst, -1, 1);
  }
  let beliefs = child.social.beliefs;
  for (const parent of parents) {
    for (const belief of parent.social.beliefs) {
      if (
        i.beliefs.about.includes(belief.about) &&
        belief.strength > i.beliefs.above
      ) {
        beliefs = believe(
          beliefs,
          belief.about,
          belief.feel * i.beliefs.feel,
          belief.text,
        );
      }
    }
  }
  beliefs = beliefs.map((belief) => ({
    ...belief,
    strength: Math.min(belief.strength, i.beliefs.strength),
  }));
  return { player, bonds, opinions, beliefs };
}

function hatch(
  world: World,
  registry: Registry,
  egg: Member,
  events: GameEvent[],
): World {
  const now = world.clock.simTime;
  const { hatchAt } = egg.social;
  if (!egg.mind.alive || hatchAt === null || now < hatchAt) return world;
  world = withState(world, egg, {
    ...inherit(world, registry, egg),
    stage: egg.def.family.egg.hatchInto,
    born: now,
  });
  events.push({ type: 'hatch', actor: egg.id });
  return addMoment(world, egg.id, `${egg.name} hatched.`);
}

/**
 * Those who were close to `dead` grieve: their needs spike, they believe the
 * worse for it, and it is a moment.
 */
export function grieve(
  world: World,
  registry: Registry,
  dead: EntityId,
): World {
  const lost = memberOf(world, registry, dead);
  const name = lost?.name ?? dead;
  for (const id of Object.keys(world.entities)) {
    const other = id === dead ? null : memberOf(world, registry, id);
    if (other === null || !hatched(other)) continue;
    const { affection } = bondWith(world, registry, other, dead);
    const { grief } = other.def;
    if (affection <= grief.closeAbove) continue;
    world = withState(world, other, {
      needs: addLevels(
        addLevels(other.mind.needs, grief.needs),
        grief.perAffection,
        affection,
      ),
      beliefs: believe(
        other.social.beliefs,
        grief.belief.about,
        grief.belief.feel,
        `${name} gone`,
      ),
    });
    world = addMoment(world, id, `${other.name} is grieving for ${name}.`);
  }
  return world;
}

/**
 * One step of an entity's social life: an egg hatches when its time comes;
 * a living Kith keeps company, warns others off what it fears, and may lay an
 * egg with one it loves.
 */
export function socialStep(
  world: World,
  registry: Registry,
  presence: Presence,
  id: EntityId,
  dtMs: number,
): StepResult {
  const events: GameEvent[] = [];
  let me = memberOf(world, registry, id);
  if (me === null) return { world, events };
  if (me.mind.stage === 'egg') {
    return { world: hatch(world, registry, me, events), events };
  }
  if (!about(me)) return { world, events };
  world = company(world, registry, presence, me, dtMs);
  me = memberOf(world, registry, id)!;
  world = warn(world, registry, me, events);
  me = memberOf(world, registry, id)!;
  world = family(world, registry, me, dtMs, events);
  return { world, events };
}
