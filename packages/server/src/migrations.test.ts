import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  assertConfinedToOwnSchema,
  migrateDatabase,
  SCHEMA_MIGRATIONS,
} from './migrations.js';

describe('migration schema guard', () => {
  it.each(SCHEMA_MIGRATIONS.map((m) => [m.name, m] as const))(
    'passes %s',
    (_, migration) => {
      expect(() => assertConfinedToOwnSchema(migration)).not.toThrow();
    },
  );

  it.each([
    'CREATE TABLE public.notes (id int)',
    'DROP TABLE other_project.users',
    'TRUNCATE other_project.users',
    'ALTER TABLE "public"."notes" ADD COLUMN x int',
    'INSERT INTO auth . users (id) VALUES (1)',
    'CREATE TABLE notes (id int REFERENCES public.users (id))',
    'CREATE TABLE kith.notes (id int)',
    'DROP SCHEMA kith CASCADE',
    'drop schema if exists other_project',
    'CREATE SCHEMA other_project',
    'ALTER SCHEMA kith RENAME TO kith_old',
    'DROP DATABASE postgres',
    'ALTER DATABASE postgres SET search_path = public',
    'SET search_path = public',
    "SELECT set_config('search_path', 'public', true)",
    "CREATE TABLE notes (id int); -- harmless\nSELECT 'it''s'; DROP TABLE public.users",
  ])('refuses %j', (sql) => {
    expect(() =>
      assertConfinedToOwnSchema({ name: '999_escape', sql }),
    ).toThrow(/^Migration 999_escape reaches outside its schema/);
  });

  it('ignores schema names in comments', () => {
    expect(() =>
      assertConfinedToOwnSchema({
        name: '999_commented',
        sql: `-- Never public.users: other projects own it.
          /* nor DROP SCHEMA */ CREATE TABLE notes (id int);`,
      }),
    ).not.toThrow();
  });

  it('refuses before touching the database', async () => {
    const pool = new pg.Pool();
    const connect = vi.spyOn(pool, 'connect');
    await expect(
      migrateDatabase(pool, [
        ...SCHEMA_MIGRATIONS,
        { name: '999_escape', sql: 'DROP TABLE public.users' },
      ]),
    ).rejects.toThrow('Migration 999_escape reaches outside its schema');
    expect(connect).not.toHaveBeenCalled();
  });
});
