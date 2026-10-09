import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDatabase } from './migrations.js';
import { PgUserStore } from './users.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined && process.env.CI !== undefined) {
  throw new Error('TEST_DATABASE_URL must be set in CI');
}

describe.skipIf(databaseUrl === undefined)('PgUserStore', () => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  let users: PgUserStore;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });
    await migrateDatabase(pool);
    users = new PgUserStore(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  async function rows() {
    const { rows } = await pool.query(
      `SELECT id, google_subject, email, display_name FROM users ORDER BY created_at`,
    );
    return rows;
  }

  it('creates a user on first sign-in and finds it again after', async () => {
    const id = await users.signIn({
      subject: 'google-sub-1',
      email: 'alex@kith.example',
      displayName: 'Alex',
    });
    expect(await rows()).toEqual([
      {
        id,
        google_subject: 'google-sub-1',
        email: 'alex@kith.example',
        display_name: 'Alex',
      },
    ]);

    const again = await users.signIn({
      subject: 'google-sub-1',
      email: 'alex@new.example',
      displayName: 'Alex S',
    });
    expect(again).toBe(id);
    expect(await rows()).toEqual([
      {
        id,
        google_subject: 'google-sub-1',
        email: 'alex@new.example',
        display_name: 'Alex S',
      },
    ]);
  });

  it('keeps different Google accounts apart', async () => {
    const first = await users.signIn({
      subject: 'google-sub-2',
      email: 'sam@kith.example',
      displayName: 'Sam',
    });
    const second = await users.signIn({
      subject: 'google-sub-3',
      email: 'kim@kith.example',
      displayName: 'Kim',
    });
    expect(first).not.toBe(second);
  });
});
