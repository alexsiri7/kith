import type { Wish } from './command.js';
import type {
  Category,
  Entity,
  EntityType,
  TypeId,
  VerbId,
  ZoneFallIn,
} from './entity.js';
import type { GameEvent } from './event.js';
import {
  affect,
  checkInteraction,
  engage,
  interact,
  type Interaction,
} from './interact.js';
import {
  mindState,
  type Act,
  type Activity,
  type Bias,
  type Levels,
  type Mind,
  type MindDef,
  type ValueCategory,
} from './mind.js';
import type { Registry } from './registry.js';
import { socialState } from './relationship.js';
import { nextFloat } from './rng.js';
import type { Presence, StepResult } from './step.js';
import type { Target } from './target.js';
import type { EntityId, World } from './world.js';

const HOUR_MS = 3_600_000;

/** A thinking entity: its id, type and the mind its type declares. */
interface Self {
  readonly id: EntityId;
  readonly type: EntityType;
  readonly def: MindDef;
  readonly registry: Registry;
}

/** A target attention picked out, with what the mind can do to it. */
export interface Attended {
  readonly id: EntityId;
  readonly type: TypeId;
  readonly category: Category;
  /** Where the mind sees or remembers it. */
  readonly x: number;
  readonly verbs: readonly VerbId[];
  readonly score: number;
}

/** One thing decision weighed: a verb on a target, or an activity. */
export interface Option {
  readonly verb: VerbId;
  /** `null` for what the mind does alone. */
  readonly target: Extract<Target, { kind: 'entity' | 'player' }> | null;
  readonly type: TypeId | null;
  readonly category: ValueCategory;
  readonly x: number;
  readonly score: number;
}

/** A hazard zone's footprint, and whether it is passable now. */
interface Zone {
  readonly id: EntityId;
  readonly type: TypeId;
  readonly x: number;
  readonly lo: number;
  readonly hi: number;
  readonly passable: boolean;
  readonly fallIn: ZoneFallIn;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entityOf(world: World, id: EntityId): Entity {
  const entity = world.entities[id];
  if (entity === undefined) throw new Error(`No entity "${id}"`);
  return entity;
}

/** The thinking entity `id`, or null when its type declares no mind. */
function selfOf(world: World, registry: Registry, id: EntityId): Self | null {
  const entity = world.entities[id];
  const type = entity && registry.types.get(entity.type);
  if (type?.mind === undefined) return null;
  return { id, type, def: type.mind, registry };
}

export function mindOf(world: World, id: EntityId): Mind {
  return mindState.parse(entityOf(world, id).state);
}

/** Writes mind fields, and optionally x, checking the whole state against the type. */
function withMind(
  world: World,
  self: Self,
  change: Partial<Mind>,
  x?: number,
): World {
  const entity = entityOf(world, self.id);
  if (!isRecord(entity.state)) {
    throw new Error(`${entity.type} ${entity.id} has no state fields`);
  }
  const state = self.type.state.parse({ ...entity.state, ...change });
  const moved = x === undefined ? entity : { ...entity, x };
  return {
    ...world,
    entities: { ...world.entities, [self.id]: { ...moved, state } },
  };
}

function roll(world: World): [number, World] {
  const draw = nextFloat(world.rng.behaviour);
  return [
    draw.value,
    { ...world, rng: { ...world.rng, behaviour: draw.state } },
  ];
}

function between(r: number, [min, max]: readonly [number, number]): number {
  return min + r * (max - min);
}

const anyAbove = (needs: Levels, levels: Levels) =>
  Object.entries(levels).some(([need, level]) => (needs[need] ?? 0) > level);
const anyBelow = (needs: Levels, levels: Levels) =>
  Object.entries(levels).some(([need, level]) => (needs[need] ?? 1) < level);

export function addLevels(needs: Levels, deltas: Levels, times = 1): Levels {
  const next = { ...needs };
  for (const [need, delta] of Object.entries(deltas)) {
    const level = next[need];
    if (level !== undefined) next[need] = clamp(level + delta * times);
  }
  return next;
}

function dominant(needs: Levels): string {
  let best = '';
  let level = -1;
  for (const [need, value] of Object.entries(needs)) {
    if (value > level) [best, level] = [need, value];
  }
  return best;
}

/** What doing `verb` to `category` is worth to `need`, learned or instinctive. */
export function valueOf(
  mind: Mind,
  def: MindDef,
  need: string,
  verb: VerbId,
  category: ValueCategory,
): number {
  return (
    mind.values[need]?.[verb]?.[category] ??
    def.instincts[need]?.[verb]?.[category] ??
    0
  );
}

/** `Σ need_i × value[need_i][verb][category]`. */
function worth(
  mind: Mind,
  def: MindDef,
  verb: VerbId,
  category: ValueCategory,
): number {
  let total = 0;
  for (const [need, level] of Object.entries(mind.needs)) {
    total += level * valueOf(mind, def, need, verb, category);
  }
  return total;
}

function biasFor(
  mind: Mind,
  now: number,
  verb: VerbId,
  target: EntityId | null,
): number {
  let total = 0;
  for (const bias of mind.biases) {
    if (
      bias.until > now &&
      bias.verb === verb &&
      (bias.target === undefined || bias.target === target)
    ) {
      total += bias.strength;
    }
  }
  return total;
}

/** Whether a live bias names `target` itself, such as a wish or an intent. */
function wishedFor(
  mind: Mind,
  now: number,
  verb: VerbId,
  target: EntityId,
): boolean {
  return mind.biases.some(
    (bias) => bias.until > now && bias.verb === verb && bias.target === target,
  );
}

function zonesOf(world: World, registry: Registry): Zone[] {
  const zones: Zone[] = [];
  for (const entity of Object.values(world.entities)) {
    const type = registry.types.get(entity.type);
    if (type?.zone === undefined) continue;
    const field = type.zone.passableWhen;
    const passable =
      field !== undefined &&
      isRecord(entity.state) &&
      entity.state[field] === true;
    const half = type.body.w / 2;
    zones.push({
      id: entity.id,
      type: type.id,
      x: entity.x,
      lo: entity.x - half,
      hi: entity.x + half,
      passable,
      fallIn: type.zone.fallIn,
    });
  }
  return zones;
}

function sideOf(zone: Zone, x: number): -1 | 0 | 1 {
  return x < zone.lo ? -1 : x > zone.hi ? 1 : 0;
}

/** Impassable zones a move from `from` to `to` would enter, nearest first. */
function crossings(zones: readonly Zone[], from: number, to: number): Zone[] {
  return zones
    .filter((zone) => {
      const side = sideOf(zone, from);
      return !zone.passable && side !== 0 && sideOf(zone, to) !== side;
    })
    .sort((a, b) => Math.abs(a.x - from) - Math.abs(b.x - from));
}

function fears(mind: Mind, def: MindDef, type: TypeId): boolean {
  const { base, curiosity } = def.zoneFear;
  return (
    (mind.opinions[type] ?? 0) <= -(base + curiosity * mind.genome.curiosity)
  );
}

/** Whether the way from `from` to `to` crosses no zone the mind fears. */
function reachable(
  zones: readonly Zone[],
  mind: Mind,
  def: MindDef,
  from: number,
  to: number,
): boolean {
  return !crossings(zones, from, to).some((zone) =>
    fears(mind, def, zone.type),
  );
}

function perceives(def: MindDef, me: Entity, other: Entity, type: EntityType) {
  return (
    type.perception.sky === true ||
    Math.abs(other.x - me.x) <= def.attention.range
  );
}

function actor(self: Self): Interaction['actor'] {
  return { kind: 'entity', id: self.id };
}

/**
 * Scores what the mind perceives or remembers by the need relevance of what
 * it could do there, its opinion of the type, its affection for the entity
 * itself, novelty, distance and biases. Types it thinks too little of, and
 * targets beyond a hazard zone it fears, are left out. Best first.
 */
export function attend(
  world: World,
  registry: Registry,
  id: EntityId,
): Attended[] {
  const self = selfOf(world, registry, id);
  if (self === null) return [];
  const { def } = self;
  const mind = mindOf(world, id);
  const me = entityOf(world, id);
  const now = world.clock.simTime;
  const zones = zonesOf(world, registry);
  const { bonds } = socialState.parse(me.state);
  const attended: Attended[] = [];
  for (const other of Object.values(world.entities)) {
    if (other.id === id || other.carriedBy !== undefined || other.heldByPlayer)
      continue;
    const type = registry.types.get(other.type);
    if (type === undefined) continue;
    const x = perceives(def, me, other, type) ? other.x : mind.memory[other.id];
    if (x === undefined) continue;
    const opinion = mind.opinions[type.id] ?? 0;
    if (opinion < def.attention.avoidBelow) continue;
    if (!reachable(zones, mind, def, me.x, x)) continue;
    const verbs = type.affordances
      .map((affordance) => affordance.verb)
      .filter(
        (verb) =>
          checkInteraction(world, registry, {
            actor: actor(self),
            target: other.id,
            verb,
          }).ok,
      );
    if (verbs.length === 0) continue;
    const relevance = Math.max(
      ...verbs.map((verb) => worth(mind, def, verb, type.category)),
    );
    const novelty =
      type.id in mind.opinions
        ? 0
        : def.attention.curiosity * mind.genome.curiosity;
    const bias = Math.max(
      0,
      ...verbs.map((verb) => biasFor(mind, now, verb, other.id)),
    );
    attended.push({
      id: other.id,
      type: type.id,
      category: type.category,
      x,
      verbs,
      score:
        relevance +
        opinion +
        (bonds[other.id]?.affection ?? 0) +
        novelty -
        Math.abs(x - me.x) * def.attention.distance +
        bias,
    });
  }
  return attended.sort((a, b) => b.score - a.score);
}

/**
 * Scores each verb on the best attended target that offers it, and on any
 * attended target it is wished for, and the mind's activities:
 * `Σ need_i × value[need_i][verb][category]` + opinion + biases + noise
 * drawn from the `behaviour` stream. Best first.
 */
export function decide(
  world: World,
  registry: Registry,
  id: EntityId,
  presence: Presence,
): { readonly options: Option[]; readonly world: World } {
  const self = selfOf(world, registry, id);
  if (self === null) return { options: [], world };
  const { def } = self;
  const mind = mindOf(world, id);
  const me = entityOf(world, id);
  const now = world.clock.simTime;
  const { activities } = def;
  const curiosity = mind.genome.curiosity;
  // Each option's score starts as what is particular to it.
  const weighed: Option[] = [];
  const add = (option: Omit<Option, 'score'>, score: number) =>
    weighed.push({ ...option, score });
  const offered = new Set<VerbId>();
  for (const target of attend(world, registry, id).slice(
    0,
    def.attention.attend,
  )) {
    for (const verb of target.verbs) {
      if (offered.has(verb) && !wishedFor(mind, now, verb, target.id)) {
        continue;
      }
      offered.add(verb);
      add(
        {
          verb,
          target: { kind: 'entity', id: target.id },
          type: target.type,
          category: target.category,
          x: target.x,
        },
        mind.opinions[target.type] ?? 0,
      );
    }
  }
  const alone = (verb: Exclude<Activity, 'approach'>, score: number) =>
    add({ verb, target: null, type: null, category: 'self', x: me.x }, score);
  alone('idle', activities.idle.base);
  alone(
    'wander',
    activities.wander.base + activities.wander.curiosity * curiosity,
  );
  if (anyAbove(mind.needs, activities.sleep.whenAbove)) alone('sleep', 0);
  if (
    presence.watching &&
    presence.handX !== null &&
    reachable(zonesOf(world, registry), mind, def, me.x, presence.handX)
  ) {
    add(
      {
        verb: 'approach',
        target: { kind: 'player' },
        type: null,
        category: 'player',
        x: presence.handX,
      },
      0,
    );
  }
  const noise =
    (def.decision.noise[mind.stage] ?? def.decision.defaultNoise) *
    (1 + curiosity);
  const options: Option[] = [];
  for (const option of weighed) {
    const [r, next] = roll(world);
    world = next;
    const target = option.target?.kind === 'entity' ? option.target.id : null;
    options.push({
      ...option,
      score:
        option.score +
        worth(mind, def, option.verb, option.category) +
        biasFor(mind, now, option.verb, target) +
        (r - 0.5) * noise,
    });
  }
  return { options: options.sort((a, b) => b.score - a.score), world };
}

/**
 * Moves `delta` along `value[need][verb][category]` and emits
 * `learnedSkill` or `unlearnedSkill` when it crosses a skill threshold.
 */
function learn(
  mind: Mind,
  self: Self,
  need: string,
  verb: VerbId,
  category: ValueCategory,
  delta: number,
  events: GameEvent[],
): Mind {
  const { learning } = self.def;
  const [lo, hi] = learning.values;
  const before = valueOf(mind, self.def, need, verb, category);
  const after = clamp(before + delta, lo, hi);
  const values = {
    ...mind.values,
    [need]: {
      ...mind.values[need],
      [verb]: { ...mind.values[need]?.[verb], [category]: after },
    },
  };
  const skill = `${need}:${verb}:${category}`;
  const known = mind.skills.includes(skill);
  let { skills } = mind;
  if (after >= learning.skill.learned && !known) {
    skills = [...skills, skill];
    events.push({ type: 'learnedSkill', actor: self.id, skill });
  } else if (after < learning.skill.unlearned && known) {
    skills = skills.filter((s) => s !== skill);
    events.push({ type: 'unlearnedSkill', actor: self.id, skill });
  }
  return { ...mind, values, skills };
}

function changeOpinion(
  world: World,
  self: Self,
  type: TypeId,
  delta: number,
): World {
  const mind = mindOf(world, self.id);
  const opinion = clamp((mind.opinions[type] ?? 0) + delta, -1, 1);
  return withMind(world, self, {
    opinions: { ...mind.opinions, [type]: opinion },
  });
}

/**
 * Ends the current act and learns from it: each need that mattered when it
 * began moves the act's value by how much the act relieved it.
 */
function finish(world: World, self: Self, events: GameEvent[]): World {
  let mind = mindOf(world, self.id);
  const { act } = mind;
  if (act === null) return world;
  const { learning } = self.def;
  const rate = learning.rate * mind.genome.learnRate;
  const [lo, hi] = learning.range;
  for (const [need, before] of Object.entries(act.before)) {
    if (before < learning.minNeed) continue;
    const relief = (before - (mind.needs[need] ?? before)) * learning.gain;
    mind = learn(
      mind,
      self,
      need,
      act.verb,
      act.category,
      rate * clamp(relief, lo, hi) * before,
      events,
    );
  }
  return withMind(world, self, {
    values: mind.values,
    skills: mind.skills,
    act: null,
    last: {
      verb: act.verb,
      type: act.type,
      category: act.category,
      need: act.need,
      end: world.clock.simTime,
    },
  });
}

function stop(world: World, self: Self, act: Act): World {
  return withMind(world, self, {
    act: { ...act, done: true, until: world.clock.simTime },
  });
}

function choose(world: World, self: Self, presence: Presence): World {
  const { def } = self;
  const me = entityOf(world, self.id);
  const before = mindOf(world, self.id);
  const memory: Record<EntityId, number> = {};
  for (const other of Object.values(world.entities)) {
    const type = self.registry.types.get(other.type);
    if (other.id === self.id || type === undefined) continue;
    const remembered = before.memory[other.id];
    if (perceives(def, me, other, type)) memory[other.id] = other.x;
    else if (remembered !== undefined) memory[other.id] = remembered;
  }
  world = withMind(world, self, { memory });
  const decided = decide(world, self.registry, self.id, presence);
  world = decided.world;
  const best = decided.options[0]!;
  const now = world.clock.simTime;
  const mind = mindOf(world, self.id);
  let act: Act = {
    verb: best.verb,
    target: best.target,
    type: best.type,
    category: best.category,
    need: dominant(mind.needs),
    before: mind.needs,
    until: now + def.decision.pursueMs,
    tx: best.x,
    engagedUntil: null,
    done: false,
  };
  let asleep = false;
  const { activities } = def;
  if (best.target === null) {
    let r: number;
    if (best.verb === 'wander') {
      [r, world] = roll(world);
      const [min, max] = def.movement.bounds;
      act = {
        ...act,
        tx: clamp(me.x + (r - 0.5) * activities.wander.range, min, max),
      };
      [r, world] = roll(world);
      act = { ...act, until: now + between(r, activities.wander.ms) };
    } else if (best.verb === 'sleep') {
      asleep = true;
      act = { ...act, until: now };
    } else {
      [r, world] = roll(world);
      act = { ...act, until: now + between(r, activities.idle.ms) };
    }
  } else if (best.target.kind === 'player') {
    act = { ...act, until: now + activities.approach.ms };
  }
  return withMind(world, self, {
    act,
    asleep,
    lastScores: decided.options.slice(0, 4).map((option) => ({
      verb: option.verb,
      target:
        option.target === null
          ? null
          : option.target.kind === 'player'
            ? 'player'
            : option.target.id,
      score: option.score,
    })),
  });
}

/**
 * Walks toward `tx`. Entering an impassable hazard zone either stops it at
 * the bank, when it fears the zone, or lets the zone's fall-in befall it.
 */
function move(
  world: World,
  self: Self,
  tx: number,
  dtMs: number,
  events: GameEvent[],
): World {
  const { movement } = self.def;
  const me = entityOf(world, self.id);
  const mind = mindOf(world, self.id);
  const now = world.clock.simTime;
  const dx = tx - me.x;
  if (Math.abs(dx) <= 4) return world;
  let speed =
    (movement.speed[mind.stage] ?? movement.defaultSpeed) *
    (mind.sickUntil > now ? movement.sickFactor : 1);
  for (const slow of movement.slow) {
    if ((mind.needs[slow.need] ?? 0) > slow.above) speed *= slow.factor;
  }
  const nx =
    me.x + Math.sign(dx) * Math.min(Math.abs(dx), (speed * dtMs) / 1000);
  const zone = crossings(zonesOf(world, self.registry), me.x, nx)[0];
  if (zone === undefined) return withMind(world, self, {}, nx);
  const from = sideOf(zone, me.x) === -1 ? -1 : 1;
  const act = mind.act && { ...mind.act, done: true, until: now };
  if (fears(mind, self.def, zone.type)) {
    events.push({ type: 'avoided', actor: self.id, target: zone.id });
    const bank =
      from === -1 ? zone.lo - movement.bank.stop : zone.hi + movement.bank.stop;
    return withMind(world, self, { act }, bank);
  }
  const { fallIn } = zone;
  world = withMind(
    world,
    self,
    {
      act,
      asleep: false,
      inZone: { zone: zone.id, from, until: now + fallIn.ms },
    },
    zone.x,
  );
  const fell = affect(
    world,
    self.registry,
    { actor: actor(self), target: zone.id },
    fallIn.effects,
  );
  events.push(...fell.events);
  return changeOpinion(
    fell.world,
    self,
    zone.type,
    fallIn.valence * mindOf(fell.world, self.id).genome.learnRate,
  );
}

/** Held in a zone it fell into, until it climbs out on the side it came from. */
function wade(
  world: World,
  self: Self,
  dtMs: number,
  events: GameEvent[],
): World {
  const { inZone } = mindOf(world, self.id);
  if (inZone === null) return world;
  const zone = zonesOf(world, self.registry).find((z) => z.id === inZone.zone);
  if (zone === undefined) return withMind(world, self, { inZone: null });
  const { bank } = self.def.movement;
  if (world.clock.simTime >= inZone.until) {
    const x =
      inZone.from === -1 ? zone.lo - bank.climbOut : zone.hi + bank.climbOut;
    return withMind(world, self, { inZone: null }, x);
  }
  const held = affect(
    world,
    self.registry,
    { actor: actor(self), target: zone.id },
    zone.fallIn.continuous ?? [],
    dtMs / 1000,
  );
  events.push(...held.events);
  return held.world;
}

/** Once there: engages for the affordance's duration, then resolves it. */
function useTarget(
  world: World,
  self: Self,
  act: EntityAct,
  dtMs: number,
  events: GameEvent[],
): World {
  const interaction: Interaction = {
    actor: actor(self),
    target: act.target.id,
    verb: act.verb,
  };
  const now = world.clock.simTime;
  let { engagedUntil } = act;
  if (engagedUntil === null) {
    const check = checkInteraction(world, self.registry, interaction);
    if (!check.ok) return stop(world, self, act);
    const duration = check.affordance.duration ?? [0, 0];
    let r = 0;
    if (duration[1] > duration[0]) [r, world] = roll(world);
    engagedUntil = now + between(r, duration);
    act = { ...act, engagedUntil };
    world = withMind(world, self, { act });
  }
  if (now < engagedUntil) {
    const engaged = engage(world, self.registry, interaction, dtMs);
    if (!engaged.ok) return stop(world, self, act);
    events.push(...engaged.events);
    return engaged.world;
  }
  const result = interact(world, self.registry, interaction);
  if (!result.ok) return stop(world, self, act);
  events.push(...result.events);
  world = result.world;
  const mind = mindOf(world, self.id);
  world = changeOpinion(
    world,
    self,
    act.type,
    result.valence * mind.genome.learnRate,
  );
  const biases = mindOf(world, self.id).biases.filter(
    (bias) =>
      !(
        bias.wish === true &&
        bias.verb === act.verb &&
        (bias.target === undefined || bias.target === act.target.id)
      ),
  );
  return withMind(world, self, { biases, act: { ...act, done: true } });
}

type EntityAct = Act & {
  readonly target: { readonly kind: 'entity'; readonly id: EntityId };
  readonly type: TypeId;
};

function isEntityAct(act: Act): act is EntityAct {
  return act.target?.kind === 'entity' && act.type !== null;
}

/** Goes after the current act's target and does the act once there. */
function pursue(
  world: World,
  self: Self,
  presence: Presence,
  dtMs: number,
  events: GameEvent[],
): World {
  const { def } = self;
  let act = mindOf(world, self.id).act;
  if (act === null) return world;
  let { tx } = act;
  if (isEntityAct(act)) {
    const target = world.entities[act.target.id];
    const type = target && self.registry.types.get(target.type);
    if (
      target === undefined ||
      type === undefined ||
      target.carriedBy !== undefined ||
      target.heldByPlayer
    ) {
      return stop(world, self, act);
    }
    if (perceives(def, entityOf(world, self.id), target, type)) tx = target.x;
  } else if (act.target?.kind === 'player') {
    if (!presence.watching || presence.handX === null) {
      return stop(world, self, act);
    }
    tx = presence.handX;
  }
  if (tx !== act.tx) {
    act = { ...act, tx };
    world = withMind(world, self, { act });
  }
  world = move(world, self, tx, dtMs, events);
  const mind = mindOf(world, self.id);
  if (mind.act === null || mind.act.done || mind.inZone !== null) return world;
  if (Math.abs(tx - entityOf(world, self.id).x) >= def.movement.arriveWithin) {
    return world;
  }
  if (isEntityAct(act)) return useTarget(world, self, act, dtMs, events);
  if (act.target?.kind === 'player') {
    const hours = dtMs / HOUR_MS;
    const relief = Object.fromEntries(
      Object.entries(def.activities.approach.relief).map(([need, perHour]) => [
        need,
        perHour * hours,
      ]),
    );
    return withMind(world, self, { needs: addLevels(mind.needs, relief) });
  }
  return world;
}

/** Needs and health drift with time; health running out kills. */
function drift(
  world: World,
  self: Self,
  presence: Presence,
  dtMs: number,
  events: GameEvent[],
): World {
  const { def } = self;
  const mind = mindOf(world, self.id);
  const me = entityOf(world, self.id);
  const hours = dtMs / HOUR_MS;
  const needs: Record<string, number> = { ...mind.needs };
  for (const [need, d] of Object.entries(def.needs)) {
    const level = needs[need];
    if (level === undefined) continue;
    let rate: number;
    if (d.watched !== undefined && presence.watching) {
      const near =
        presence.handX !== null &&
        Math.abs(presence.handX - me.x) < d.watched.within;
      rate = near ? d.watched.nearHand : d.watched.far;
    } else {
      rate =
        (mind.asleep ? d.asleep : d.awake) *
        (d.genome === undefined
          ? 1
          : d.genome.base + d.genome.per * mind.genome[d.genome.trait]) *
        (d.stage?.[mind.stage] ?? 1);
    }
    let next = level + rate * hours;
    if (d.ease !== undefined) next -= next * Math.min(1, d.ease * hours);
    needs[need] = clamp(next);
  }
  const { harm, heal } = def.health;
  const harms = harm
    .filter((h) => (needs[h.need] ?? 0) > h.above)
    .sort((a, b) => b.perHour - a.perHour);
  const healed = Object.entries(heal.below).every(
    ([need, level]) => (needs[need] ?? 0) < level,
  );
  const loss = harms.reduce((total, h) => total + h.perHour, 0);
  const health = clamp(
    mind.health + ((healed ? heal.perHour : 0) - loss) * hours,
  );
  if (health > 0) return withMind(world, self, { needs, health });
  events.push({
    type: 'died',
    actor: self.id,
    cause: harms[0]?.need ?? 'health',
  });
  return withMind(world, self, { needs, health, alive: false, act: null });
}

function flee(
  world: World,
  self: Self,
  from: EntityId,
  dtMs: number,
  events: GameEvent[],
): World {
  const me = entityOf(world, self.id);
  const source = world.entities[from];
  const away = source === undefined ? 0 : Math.sign(me.x - source.x) || 1;
  const [min, max] = self.def.movement.bounds;
  const tx = clamp(me.x + away * self.def.movement.fleeDistance, min, max);
  return move(world, self, tx, dtMs, events);
}

/**
 * One step of a thinking entity's life: needs drift; then, unless a zone holds
 * it or it sleeps or flees, it finishes a spent act, chooses the next by
 * attention then decision, and pursues it.
 */
export function think(
  world: World,
  registry: Registry,
  presence: Presence,
  id: EntityId,
  dtMs: number,
): StepResult {
  const self = selfOf(world, registry, id);
  if (self === null) return { world, events: [] };
  const before = mindOf(world, id);
  if (!before.alive || before.stage === 'egg') return { world, events: [] };
  const events: GameEvent[] = [];
  const now = world.clock.simTime;
  world = drift(world, self, presence, dtMs, events);
  let mind = mindOf(world, id);
  if (!mind.alive) return { world, events };
  if (mind.inZone !== null) {
    return { world: wade(world, self, dtMs, events), events };
  }
  const { sleep } = self.def;
  if (mind.asleep) {
    if (
      !anyBelow(mind.needs, sleep.wake.below) &&
      !anyAbove(mind.needs, sleep.wake.above)
    ) {
      return { world, events };
    }
    world = withMind(world, self, { asleep: false });
  } else if (anyAbove(mind.needs, sleep.fallAsleepAbove)) {
    world = finish(world, self, events);
    return { world: withMind(world, self, { asleep: true }), events };
  }
  mind = mindOf(world, id);
  if (mind.fleeing !== null && mind.fleeing.until > now) {
    return {
      world: flee(world, self, mind.fleeing.from, dtMs, events),
      events,
    };
  }
  const { act } = mind;
  if (act === null || act.done || now >= act.until) {
    world = finish(world, self, events);
    world = choose(world, self, presence);
  }
  return { world: pursue(world, self, presence, dtMs, events), events };
}

/**
 * The player's tickle or scold: feedback on the current act, or the one that
 * just ended, plus its effect on needs. A scold also lowers the mind's
 * opinion of what it was going after, and of a hazard zone it stands near.
 */
export function feedback(
  world: World,
  registry: Registry,
  id: EntityId,
  kind: 'tickle' | 'scold',
): StepResult {
  const self = selfOf(world, registry, id);
  if (self === null) return { world, events: [] };
  let mind = mindOf(world, id);
  if (!mind.alive || mind.stage === 'egg') return { world, events: [] };
  const { feedback: fb } = self.def;
  const now = world.clock.simTime;
  const events: GameEvent[] = [];
  const aimed =
    mind.act !== null && !mind.act.done
      ? mind.act
      : mind.last !== null && now - mind.last.end < fb.windowMs
        ? mind.last
        : null;
  const reward = kind === 'tickle' ? fb.tickle.reward : fb.scold.reward;
  if (aimed !== null) {
    mind = learn(
      mind,
      self,
      aimed.need,
      aimed.verb,
      aimed.category,
      reward * fb.rate * mind.genome.learnRate,
      events,
    );
  }
  let needs: Levels;
  if (kind === 'tickle') {
    needs = addLevels(mind.needs, fb.tickle.needs);
    if (anyAbove(mind.needs, fb.tickle.comfort.when)) {
      needs = addLevels(needs, fb.tickle.comfort.needs);
    }
  } else {
    needs = addLevels(mind.needs, fb.scold.needs);
  }
  let act = mind.act;
  const opinions: Record<TypeId, number> = { ...mind.opinions };
  const think = (type: TypeId, delta: number) => {
    opinions[type] = clamp((opinions[type] ?? 0) + delta, -1, 1);
  };
  if (kind === 'scold') {
    if (act !== null && act.type !== null && act.target?.kind === 'entity') {
      think(act.type, fb.scold.opinion);
      act = { ...act, done: true };
    }
    const x = entityOf(world, id).x;
    if (mind.inZone === null) {
      for (const zone of zonesOf(world, registry)) {
        const edge = Math.min(Math.abs(x - zone.lo), Math.abs(x - zone.hi));
        if (edge < fb.scold.zone.within) {
          think(zone.type, fb.scold.zone.opinion * mind.genome.learnRate);
        }
      }
    }
  }
  return {
    world: withMind(world, self, {
      values: mind.values,
      skills: mind.skills,
      needs,
      act,
      opinions,
    }),
    events,
  };
}

function addBiases(
  world: World,
  self: Self,
  keep: (bias: Bias) => boolean,
  added: readonly Bias[],
): World {
  const now = world.clock.simTime;
  const biases = mindOf(world, self.id).biases.filter(
    (bias) => bias.until > now && keep(bias),
  );
  return withMind(world, self, { biases: [...biases, ...added] });
}

/** A cortex intent: a time-limited bias toward `verb`, on `target` when it is an entity or zone. */
export function intend(
  world: World,
  registry: Registry,
  id: EntityId,
  verb: VerbId,
  target: Target,
): World {
  const self = selfOf(world, registry, id);
  if (self === null) return world;
  const { ms, strength } = self.def.biases.cortex;
  return addBiases(world, self, () => true, [
    {
      verb,
      ...('id' in target && { target: target.id }),
      until: world.clock.simTime + ms,
      strength,
    },
  ]);
}

/** Replaces the mind's wishes, each a bias that lasts until it is done or expires. */
export function wish(
  world: World,
  registry: Registry,
  id: EntityId,
  wishes: readonly Wish[],
): World {
  const self = selfOf(world, registry, id);
  if (self === null) return world;
  const { ms, strength } = self.def.biases.wish;
  const until = world.clock.simTime + ms;
  return addBiases(
    world,
    self,
    (bias) => bias.wish !== true,
    wishes.map((w) => ({
      verb: w.verb,
      ...(w.target !== undefined && { target: w.target }),
      until,
      strength,
      wish: true as const,
    })),
  );
}
