import {
  simToRealMs,
  weatherBetween,
  type GameEvent,
  type World,
} from '@kith/engine';

export interface AwaySummary {
  /** Real hours the player was away. */
  readonly hours: number;
  readonly lines: readonly string[];
}

type Counted = (type: GameEvent['type']) => number;

const times = (n: number) => `${n} time${n > 1 ? 's' : ''}`;

/** What one Kith got up to, in the prototype's words and order. */
function doings(n: Counted): string[] {
  const bits: string[] = [];
  if (n('hatch')) bits.push('hatched');
  if (n('ate')) bits.push(`ate ${times(n('ate'))}`);
  if (n('gotHoney')) bits.push('got honey');
  if (n('stung')) {
    bits.push(
      `was stung by bees${n('stung') > 1 ? ` ${times(n('stung'))}` : ''}`,
    );
  }
  if (n('pricked')) bits.push('was pricked by the cactus');
  if (n('sick')) bits.push('ate a red mushroom and was sick');
  if (n('warned')) bits.push('warned a friend away from danger');
  if (n('fellIn')) {
    bits.push(
      `fell into the river${n('fellIn') > 1 ? ` ${times(n('fellIn'))}` : ''}`,
    );
  }
  if (n('avoided')) bits.push("stopped itself at the river's edge");
  return bits;
}

function joined(bits: readonly string[]): string {
  return bits.length > 1
    ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`
    : bits[0]!;
}

/**
 * Tells the player what happened while they were away since `since`, from
 * the weather and the `events` catching up produced. Kith are named in the
 * order the world holds them.
 */
export function awaySummary(
  world: World,
  events: readonly GameEvent[],
  since: number,
): AwaySummary {
  const now = world.clock.simTime;
  const lines: string[] = [];
  const { storms, frost } = weatherBetween(world.seed, since, now);
  const count =
    (list: readonly GameEvent[]): Counted =>
    (type) =>
      list.filter((e) => e.type === type).length;
  const all = count(events);
  if (storms > 0) {
    lines.push(
      storms > 1
        ? `${storms} storms passed through.`
        : 'A storm passed through.',
    );
  }
  if (frost) lines.push('It got below freezing.');
  if (all('shelterDamaged')) lines.push('A storm damaged a shelter.');
  if (all('bridgeRaised')) lines.push('A storm raised the bridge.');
  for (const kith of Object.values(world.entities)) {
    if (kith.type !== 'kith') continue;
    const own = events.filter((e) => e.actor === kith.id);
    const { name } = kith.state as { readonly name: string };
    const bits = doings(count(own));
    if (bits.length > 0) lines.push(`${name} ${joined(bits)}.`);
    const death = own.find((e) => e.type === 'died');
    if (death !== undefined) lines.push(`${name} died of ${death.cause}.`);
  }
  if (lines.length === 0) lines.push('A quiet stretch. Nothing much happened.');
  return {
    hours: simToRealMs(world.clock, now - since) / 3_600_000,
    lines,
  };
}
