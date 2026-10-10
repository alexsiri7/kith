import { randomUUID, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertConfinedRole, poolConfig } from './database.js';
import { migrateDatabase, SCHEMA_MIGRATIONS } from './migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined && process.env.CI !== undefined) {
  throw new Error('TEST_DATABASE_URL must be set in CI');
}

describe('poolConfig', () => {
  const url = 'postgres://kith_app:secret@localhost:5432/kith';

  it('connects without TLS off Railway', () => {
    expect(poolConfig(url, {})).toEqual({
      connectionString: url,
      connectionTimeoutMillis: 5_000,
    });
  });

  it("verifies the database against Supabase's root CA on Railway", () => {
    const { ssl } = poolConfig(url, { RAILWAY_ENVIRONMENT: 'production' });
    if (typeof ssl !== 'object') throw new Error('expected TLS options');
    expect(ssl.rejectUnauthorized).not.toBe(false);
    expect(new X509Certificate(String(ssl.ca)).subject).toContain(
      'CN=Supabase Root 2021 CA',
    );
  });
});

/** The one-time SQL from docs/operations.md, for a role and schema of its own. */
function documentedSetup(names: {
  schema: string;
  role: string;
  password: string;
}): string {
  const docs = readFileSync(
    new URL('../../../docs/operations.md', import.meta.url),
    'utf8',
  );
  const sql = /^```sql\n([\s\S]*?)^```$/m.exec(docs)?.[1];
  if (sql === undefined) throw new Error('no sql block in operations.md');
  return sql
    .replaceAll('kith_app', names.role)
    .replaceAll(/\bkith\b/g, names.schema)
    .replaceAll('<password>', names.password);
}

describe.skipIf(databaseUrl === undefined)(
  'a role set up as docs/operations.md says',
  () => {
    const id = randomUUID().replaceAll('-', '');
    const schema = `test_${id}`;
    const role = `test_${id}_app`;
    const password = randomUUID();
    const neighbour = `test_${id}_neighbour`;
    const publicTable = `public.test_${id}_neighbour`;
    let admin: pg.Pool;
    let pool: pg.Pool;

    beforeAll(async () => {
      admin = new pg.Pool({ connectionString: databaseUrl });
      await admin.query(documentedSetup({ schema, role, password }));
      await admin.query(`
        CREATE SCHEMA ${neighbour};
        CREATE TABLE ${neighbour}.secrets (id int);
        CREATE TABLE ${publicTable} (id int);
      `);
      const url = new URL(databaseUrl!);
      url.username = role;
      url.password = password;
      pool = new pg.Pool({ connectionString: url.href });
    });

    afterAll(async () => {
      await pool?.end();
      await admin?.query(`
        DROP SCHEMA IF EXISTS ${schema} CASCADE;
        DROP SCHEMA IF EXISTS ${neighbour} CASCADE;
        DROP TABLE IF EXISTS ${publicTable};
        DROP OWNED BY ${role};
        DROP ROLE ${role};
      `);
      await admin?.end();
    });

    it('is accepted for migrating, where a superuser is not', async () => {
      await expect(assertConfinedRole(pool, schema)).resolves.toBeUndefined();
      await expect(assertConfinedRole(admin, schema)).rejects.toThrow(
        /it is a superuser; it owns the database$/,
      );
    });

    it('migrates its own schema and answers the readiness check', async () => {
      await migrateDatabase(pool);
      const { rows } = await admin.query<{ count: string }>(
        `SELECT count(*) FROM ${schema}.schema_migrations`,
      );
      expect(Number(rows[0]!.count)).toBe(SCHEMA_MIGRATIONS.length);
      await expect(pool.query('SELECT 1')).resolves.toBeDefined();
    });

    it.each([
      `SELECT * FROM ${neighbour}.secrets`,
      `SELECT * FROM ${publicTable}`,
      `DROP TABLE ${neighbour}.secrets`,
      `TRUNCATE ${publicTable}`,
      `CREATE TABLE public.test_${id}_intruder (id int)`,
      `CREATE SCHEMA test_${id}_intruder`,
      `DROP SCHEMA ${schema}`,
    ])('cannot %s', async (sql) => {
      await expect(pool.query(sql)).rejects.toThrow(
        /^(permission denied|must be owner)/,
      );
    });
  },
);
