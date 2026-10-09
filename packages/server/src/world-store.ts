import {
  migrate,
  serialiseWorld,
  validateWorld,
  type Command,
  type GameEvent,
  type Migration,
  type Registry,
  type World,
} from '@kith/engine';
import type pg from 'pg';

export type WorldId = string;

export interface StoredWorld {
  readonly id: WorldId;
  /** Increases by one on every save. */
  readonly version: number;
  readonly world: World;
}

/** Where worlds live: Postgres on the server, the offline store in a browser. */
export interface WorldStore {
  load(worldId: WorldId): Promise<StoredWorld | undefined>;
  /**
   * Stores `world` as the next version and appends the events that produced
   * it, but only if the stored version is still `baseVersion`; otherwise
   * throws `WorldVersionConflict` and stores nothing. Returns the new version.
   */
  save(
    worldId: WorldId,
    baseVersion: number,
    world: World,
    events: readonly GameEvent[],
  ): Promise<number>;
  appendCommands(worldId: WorldId, commands: readonly Command[]): Promise<void>;
}

export class WorldVersionConflict extends Error {
  constructor(
    readonly worldId: WorldId,
    readonly baseVersion: number,
    readonly storedVersion: number,
  ) {
    super(
      `World ${worldId} is at version ${storedVersion}, not ${baseVersion}`,
    );
    this.name = 'WorldVersionConflict';
  }
}

/** Routine events older than this are pruned; moments and dreams are kept. */
export const EVENT_RETENTION_DAYS = 30;

export interface PgWorldStoreOptions {
  readonly registry: Registry;
  /** Upgrades snapshots written by older builds when they are loaded. */
  readonly migrations: readonly Migration[];
}

export class PgWorldStore implements WorldStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly options: PgWorldStoreOptions,
  ) {}

  async create(ownerId: string, name: string, world: World): Promise<WorldId> {
    return this.transaction(async (client) => {
      const { rows } = await client.query<{ id: WorldId }>(
        `INSERT INTO worlds (owner_id, name, version, schema_version, sim_time, seed)
         VALUES ($1, $2, 1, $3, $4, $5)
         RETURNING id`,
        [ownerId, name, world.schemaVersion, world.clock.simTime, world.seed],
      );
      const id = rows[0]!.id;
      await insertSnapshot(client, id, 1, world);
      await recordMemories(client, id, world);
      return id;
    });
  }

  async load(worldId: WorldId): Promise<StoredWorld | undefined> {
    const { rows } = await this.pool.query<{ version: number; state: unknown }>(
      `SELECT w.version, s.state
       FROM worlds w
       JOIN world_snapshots s ON s.world_id = w.id AND s.version = w.version
       WHERE w.id = $1`,
      [worldId],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    const { registry, migrations } = this.options;
    return {
      id: worldId,
      version: row.version,
      world: validateWorld(migrate(row.state, migrations), registry),
    };
  }

  async save(
    worldId: WorldId,
    baseVersion: number,
    world: World,
    events: readonly GameEvent[],
  ): Promise<number> {
    return this.transaction(async (client) => {
      // The row lock taken here serialises concurrent saves: a second save
      // from the same base version re-reads the bumped version and matches
      // no row.
      const { rows } = await client.query<{
        version: number;
        first_event_seq: string;
      }>(
        `UPDATE worlds
         SET version = version + 1, schema_version = $3, sim_time = $4,
             event_seq = event_seq + $5, updated_at = now()
         WHERE id = $1 AND version = $2
         RETURNING version, event_seq - $5 + 1 AS first_event_seq`,
        [
          worldId,
          baseVersion,
          world.schemaVersion,
          world.clock.simTime,
          events.length,
        ],
      );
      const saved = rows[0];
      if (saved === undefined) {
        throw await this.conflictOrMissing(client, worldId, baseVersion);
      }
      await insertSnapshot(client, worldId, saved.version, world);
      // Events carry no time of their own: they happened by the time of the
      // world they produced.
      await client.query(
        `INSERT INTO world_events (world_id, seq, sim_time, type, actor_id, payload)
         SELECT $1, $2::bigint + e.ord - 1, $3, e.payload->>'type',
                e.payload->>'actor', e.payload
         FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY AS e (payload, ord)`,
        [
          worldId,
          saved.first_event_seq,
          world.clock.simTime,
          JSON.stringify(events),
        ],
      );
      await recordMemories(client, worldId, world);
      return saved.version;
    });
  }

  async appendCommands(
    worldId: WorldId,
    commands: readonly Command[],
  ): Promise<void> {
    if (commands.length === 0) return;
    const { rowCount } = await this.pool.query(
      `WITH reserved AS (
         UPDATE worlds SET command_seq = command_seq + $2
         WHERE id = $1
         RETURNING command_seq - $2 + 1 AS first_seq
       )
       INSERT INTO commands (world_id, seq, command)
       SELECT $1, reserved.first_seq + c.ord - 1, c.command
       FROM reserved,
            jsonb_array_elements($3::jsonb) WITH ORDINALITY AS c (command, ord)`,
      [worldId, commands.length, JSON.stringify(commands)],
    );
    if (rowCount === 0) throw new Error(`World ${worldId} does not exist`);
  }

  /** Deletes events recorded more than `EVENT_RETENTION_DAYS` before `now`. */
  async pruneEvents(now: Date): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM world_events
       WHERE created_at < $1::timestamptz - make_interval(days => $2)`,
      [now, EVENT_RETENTION_DAYS],
    );
    return rowCount ?? 0;
  }

  private async conflictOrMissing(
    client: pg.PoolClient,
    worldId: WorldId,
    baseVersion: number,
  ): Promise<Error> {
    const { rows } = await client.query<{ version: number }>(
      'SELECT version FROM worlds WHERE id = $1',
      [worldId],
    );
    const stored = rows[0];
    return stored === undefined
      ? new Error(`World ${worldId} does not exist`)
      : new WorldVersionConflict(worldId, baseVersion, stored.version);
  }

  private async transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function insertSnapshot(
  client: pg.PoolClient,
  worldId: WorldId,
  version: number,
  world: World,
): Promise<void> {
  await client.query(
    `INSERT INTO world_snapshots (world_id, version, sim_time, state)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [worldId, version, world.clock.simTime, serialiseWorld(world)],
  );
}

/**
 * Copies the world's moments and dreams into the memory book. The book keeps
 * every entry it has seen, even after the world itself lets one go.
 */
async function recordMemories(
  client: pg.PoolClient,
  worldId: WorldId,
  world: World,
): Promise<void> {
  for (const table of ['moments', 'dreams'] as const) {
    await client.query(
      `INSERT INTO ${table} (world_id, kith_id, sim_time, text)
       SELECT $1, m.kith, m."simTime", m.text
       FROM jsonb_to_recordset($2::jsonb)
            AS m (kith text, "simTime" double precision, text text)
       ON CONFLICT DO NOTHING`,
      [worldId, JSON.stringify(world[table])],
    );
  }
}
