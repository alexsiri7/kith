import type pg from 'pg';

export interface SchemaMigration {
  /** Recorded in `schema_migrations`; never rename one that has shipped. */
  readonly name: string;
  readonly sql: string;
}

/** Applied in order; each schema change appends one migration. */
export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  {
    name: '001_worlds',
    sql: `
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        display_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- version is the optimistic-concurrency token; event_seq and command_seq
      -- are the last sequence numbers handed out in world_events and commands.
      CREATE TABLE worlds (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id uuid NOT NULL REFERENCES users (id),
        name text NOT NULL,
        version integer NOT NULL,
        schema_version integer NOT NULL,
        sim_time double precision NOT NULL,
        seed bigint NOT NULL,
        event_seq bigint NOT NULL DEFAULT 0,
        command_seq bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz,
        lease_holder text,
        lease_until timestamptz
      );
      CREATE INDEX worlds_owner_id ON worlds (owner_id);

      CREATE TABLE world_snapshots (
        world_id uuid NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
        version integer NOT NULL,
        sim_time double precision NOT NULL,
        state jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (world_id, version)
      );

      CREATE TABLE world_events (
        world_id uuid NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
        seq bigint NOT NULL,
        sim_time double precision NOT NULL,
        type text NOT NULL,
        actor_id text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (world_id, seq)
      );
      CREATE INDEX world_events_created_at ON world_events (created_at);

      CREATE TABLE moments (
        world_id uuid NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
        kith_id text NOT NULL,
        sim_time double precision NOT NULL,
        text text NOT NULL,
        UNIQUE (world_id, kith_id, sim_time, text)
      );

      CREATE TABLE dreams (
        world_id uuid NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
        kith_id text,
        sim_time double precision NOT NULL,
        text text NOT NULL,
        UNIQUE NULLS NOT DISTINCT (world_id, kith_id, sim_time, text)
      );

      CREATE TABLE commands (
        world_id uuid NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
        seq bigint NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        command jsonb NOT NULL,
        PRIMARY KEY (world_id, seq)
      );
    `,
  },
  {
    name: '002_google_sign_in',
    sql: `
      -- Nullable only because 001 created users without it; sign-in always sets it.
      ALTER TABLE users ADD COLUMN google_subject text UNIQUE;
      -- The Google subject is the identity; Google can hand an address that
      -- belonged to one account to a new one.
      ALTER TABLE users DROP CONSTRAINT users_email_key;
    `,
  },
];

// Arbitrary, but fixed: every process migrating this database must agree on it.
const migrationLockKey = 0x6b697468;

/**
 * Applies the migrations not yet recorded in `schema_migrations`, each in its
 * own transaction, and returns their names. Concurrent callers wait on an
 * advisory lock, so two deploys never apply the same migration.
 */
export async function migrateDatabase(
  pool: pg.Pool,
  migrations: readonly SchemaMigration[] = SCHEMA_MIGRATIONS,
): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockKey]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM schema_migrations',
    );
    const applied = new Set(rows.map((row) => row.name));
    const pending = migrations.filter((m) => !applied.has(m.name));
    for (const migration of pending) {
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
          migration.name,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.name} failed`, {
          cause: error,
        });
      }
    }
    return pending.map((m) => m.name);
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [migrationLockKey])
      .finally(() => client.release());
  }
}
