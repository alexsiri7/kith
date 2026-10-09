import { randomUUID } from 'node:crypto';
import { MIGRATIONS, registry } from '@kith/content';
import {
  createEntity,
  createWorld,
  deserialiseWorld,
  SCHEMA_VERSION,
  type Command,
  type GameEvent,
  type World,
} from '@kith/engine';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDatabase, SCHEMA_MIGRATIONS } from './migrations.js';
import { PgWorldStore, WorldVersionConflict } from './world-store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined && process.env.CI !== undefined) {
  throw new Error('TEST_DATABASE_URL must be set in CI');
}

const day = 24 * 60 * 60 * 1000;

function sampleWorld(): World {
  const world = createWorld(42);
  return {
    ...world,
    clock: { ...world.clock, simTime: 5_000 },
    entities: {
      pip: createEntity(registry, {
        id: 'pip',
        type: 'kith',
        x: 280,
        state: { name: 'Pip', stage: 'child' },
      }),
    },
    moments: [{ simTime: 4_000, kith: 'pip', text: 'Pip saw the river.' }],
    dreams: [{ simTime: 4_500, kith: null, text: 'Rain on the leaves.' }],
    selectedKith: 'pip',
  };
}

function later(world: World, dtMs: number): World {
  return {
    ...world,
    clock: { ...world.clock, simTime: world.clock.simTime + dtMs },
  };
}

const ate: GameEvent = { type: 'ate', actor: 'pip', target: 'berry-1' };
const learned: GameEvent = { type: 'learnedWord', actor: 'pip', word: 'hi' };

// Each run gets its own schema, so it starts from an empty database and
// leaves nothing behind.
describe.skipIf(databaseUrl === undefined)('Postgres persistence', () => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  let store: PgWorldStore;
  let ownerId: string;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });
    store = new PgWorldStore(pool, { registry, migrations: MIGRATIONS });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  async function tableNames(): Promise<string[]> {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 ORDER BY table_name`,
      [schema],
    );
    return rows.map((row) => row.table_name);
  }

  describe('migrations', () => {
    it('create the schema in an empty database, once when run twice at once', async () => {
      expect(await tableNames()).toEqual([]);

      const runs = await Promise.all([
        migrateDatabase(pool),
        migrateDatabase(pool),
      ]);
      expect(runs.flat()).toEqual(SCHEMA_MIGRATIONS.map((m) => m.name));
      expect(await tableNames()).toEqual([
        'commands',
        'dreams',
        'moments',
        'schema_migrations',
        'users',
        'world_events',
        'world_snapshots',
        'worlds',
      ]);
    });

    it('apply nothing once the schema is current', async () => {
      expect(await migrateDatabase(pool)).toEqual([]);
    });

    it('roll back a migration that fails part way', async () => {
      const broken = {
        name: '999_broken',
        sql: 'CREATE TABLE half_done (id int); SELECT no_such_column;',
      };
      await expect(
        migrateDatabase(pool, [...SCHEMA_MIGRATIONS, broken]),
      ).rejects.toThrow('Migration 999_broken failed');
      expect(await tableNames()).not.toContain('half_done');
      expect(await migrateDatabase(pool)).toEqual([]);
    });
  });

  describe('PgWorldStore', () => {
    beforeAll(async () => {
      await migrateDatabase(pool);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users (email, display_name)
         VALUES ('alex@kith.example', 'Alex') RETURNING id`,
      );
      ownerId = rows[0]!.id;
    });

    async function eventRows(worldId: string) {
      const { rows } = await pool.query(
        `SELECT seq::int, sim_time, type, actor_id, payload
         FROM world_events WHERE world_id = $1 ORDER BY seq`,
        [worldId],
      );
      return rows;
    }

    it('loads what it saved', async () => {
      const world = sampleWorld();
      const id = await store.create(ownerId, 'Garden', world);
      expect(await store.load(id)).toEqual({ id, version: 1, world });

      const next = {
        ...later(world, 60_000),
        player: { ...world.player, coins: 7 },
      };
      expect(await store.save(id, 1, next, [ate])).toBe(2);
      expect(await store.load(id)).toEqual({ id, version: 2, world: next });
    });

    it('upgrades a snapshot written under an older schema when loading it', async () => {
      const id = await store.create(ownerId, 'Garden', sampleWorld());
      const prototypeSave = {
        v: 1,
        seed: 7,
        simTime: 1_000_000,
        coins: 3,
        presenceMs: 0,
        presenceCoins: 0,
        playerName: 'Alex',
        sel: 'pip',
        kith: [
          {
            id: 'pip',
            name: 'Pip',
            stage: 'child',
            hatchAt: 0,
            born: 500,
            dies: null,
            alive: true,
            health: 1,
            x: 280,
          },
        ],
        robot: { name: 'Tock', x: 100 },
        items: [],
        log: [],
        moments: [],
        dreams: [],
        pending: [],
        bridge: false,
      };
      await pool.query(
        'UPDATE world_snapshots SET state = $2 WHERE world_id = $1',
        [id, JSON.stringify(prototypeSave)],
      );

      const loaded = await store.load(id);
      expect(loaded?.world.schemaVersion).toBe(SCHEMA_VERSION);
      expect(loaded?.world).toEqual(
        deserialiseWorld(JSON.stringify(prototypeSave), registry, MIGRATIONS),
      );
    });

    it('loads nothing for an unknown world', async () => {
      expect(await store.load(randomUUID())).toBeUndefined();
    });

    it('refuses a save from a stale version and stores none of it', async () => {
      const world = sampleWorld();
      const id = await store.create(ownerId, 'Garden', world);
      const first = later(world, 1_000);
      await store.save(id, 1, first, [ate]);

      const stale = store.save(id, 1, later(world, 2_000), [learned]);
      await expect(stale).rejects.toThrow(WorldVersionConflict);
      await expect(stale).rejects.toMatchObject({
        worldId: id,
        baseVersion: 1,
        storedVersion: 2,
      });
      expect(await store.load(id)).toEqual({ id, version: 2, world: first });
      expect((await eventRows(id)).map((e) => e.type)).toEqual(['ate']);
    });

    it('lets exactly one of two concurrent saves win', async () => {
      const world = sampleWorld();
      const id = await store.create(ownerId, 'Garden', world);

      const results = await Promise.allSettled([
        store.save(id, 1, later(world, 1_000), [ate]),
        store.save(id, 1, later(world, 2_000), [learned]),
      ]);

      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r) => r.status === 'rejected');
      expect(won).toEqual([{ status: 'fulfilled', value: 2 }]);
      expect(lost).toHaveLength(1);
      expect(lost[0]!.reason).toBeInstanceOf(WorldVersionConflict);
      expect(await eventRows(id)).toHaveLength(1);
    });

    it('refuses to save a world that does not exist', async () => {
      await expect(
        store.save(randomUUID(), 1, sampleWorld(), []),
      ).rejects.toThrow(/does not exist/);
    });

    it('appends events in order across saves', async () => {
      const world = sampleWorld();
      const id = await store.create(ownerId, 'Garden', world);
      const first = later(world, 1_000);
      const second = later(first, 1_000);
      await store.save(id, 1, first, [ate, learned]);
      await store.save(id, 2, second, []);
      await store.save(id, 3, second, [ate]);

      expect(await eventRows(id)).toEqual([
        {
          seq: 1,
          sim_time: first.clock.simTime,
          type: 'ate',
          actor_id: 'pip',
          payload: ate,
        },
        {
          seq: 2,
          sim_time: first.clock.simTime,
          type: 'learnedWord',
          actor_id: 'pip',
          payload: learned,
        },
        {
          seq: 3,
          sim_time: second.clock.simTime,
          type: 'ate',
          actor_id: 'pip',
          payload: ate,
        },
      ]);
    });

    it('appends commands in order', async () => {
      const id = await store.create(ownerId, 'Garden', sampleWorld());
      const commands: Command[] = [
        { type: 'select', kith: 'pip' },
        { type: 'say', text: 'hello' },
      ];
      await store.appendCommands(id, commands);
      await store.appendCommands(id, []);
      await store.appendCommands(id, [{ type: 'tickle' }]);

      const { rows } = await pool.query(
        'SELECT seq::int, command FROM commands WHERE world_id = $1 ORDER BY seq',
        [id],
      );
      expect(rows).toEqual([
        { seq: 1, command: commands[0] },
        { seq: 2, command: commands[1] },
        { seq: 3, command: { type: 'tickle' } },
      ]);
    });

    it('refuses commands for a world that does not exist', async () => {
      await expect(
        store.appendCommands(randomUUID(), [{ type: 'tickle' }]),
      ).rejects.toThrow(/does not exist/);
    });

    it('keeps moments and dreams the world has let go of', async () => {
      const world = sampleWorld();
      const id = await store.create(ownerId, 'Garden', world);
      const moment = { simTime: 6_000, kith: 'pip', text: 'Pip said hi.' };
      const withMore = {
        ...later(world, 1_000),
        moments: [...world.moments, moment],
      };
      await store.save(id, 1, withMore, []);
      await store.save(id, 2, { ...withMore, moments: [], dreams: [] }, []);

      const moments = await pool.query(
        'SELECT kith_id, sim_time, text FROM moments WHERE world_id = $1 ORDER BY sim_time',
        [id],
      );
      expect(moments.rows).toEqual(
        [...world.moments, moment].map((m) => ({
          kith_id: m.kith,
          sim_time: m.simTime,
          text: m.text,
        })),
      );
      const dreams = await pool.query(
        'SELECT kith_id, sim_time, text FROM dreams WHERE world_id = $1',
        [id],
      );
      expect(dreams.rows).toEqual([
        { kith_id: null, sim_time: 4_500, text: 'Rain on the leaves.' },
      ]);
    });

    it('prunes events older than 30 days and keeps moments', async () => {
      const world = sampleWorld();
      const id = await store.create(ownerId, 'Garden', world);
      await store.save(id, 1, later(world, 1_000), [ate, learned, ate]);
      const now = new Date();
      await pool.query(
        `UPDATE world_events SET created_at = $2
         WHERE world_id = $1 AND seq = 1`,
        [id, new Date(now.getTime() - 31 * day)],
      );
      await pool.query(
        `UPDATE world_events SET created_at = $2
         WHERE world_id = $1 AND seq = 2`,
        [id, new Date(now.getTime() - 29 * day)],
      );

      expect(await store.pruneEvents(now)).toBe(1);
      expect((await eventRows(id)).map((e) => e.seq)).toEqual([2, 3]);
      const moments = await pool.query(
        'SELECT count(*)::int AS n FROM moments WHERE world_id = $1',
        [id],
      );
      expect(moments.rows).toEqual([{ n: 1 }]);
    });
  });
});
