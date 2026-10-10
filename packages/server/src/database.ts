import { readFileSync } from 'node:fs';
import type pg from 'pg';

/**
 * The only schema Kith's tables live in. The database is shared with other
 * projects; Kith's role reaches this schema alone (see docs/operations.md).
 */
export const kithSchema = 'kith';

// Same relative path from src/ (tests) and dist/ (image).
const supabaseRootCa = new URL(
  '../certs/supabase-root-2021-ca.crt',
  import.meta.url,
);

/**
 * In production DATABASE_URL is Supabase's transaction pooler, which hands
 * each transaction to whichever server connection is free: never name a query
 * (that prepares a statement) or rely on anything set outside a transaction.
 */
export function poolConfig(
  databaseUrl: string,
  env: Record<string, string | undefined>,
): pg.PoolConfig {
  return {
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    // On Railway the database is Supabase, across the internet: verify it
    // against Supabase's own root CA. Locally and in CI Postgres has no TLS.
    ...(env.RAILWAY_ENVIRONMENT
      ? { ssl: { ca: readFileSync(supabaseRootCa, 'utf8') } }
      : {}),
  };
}

/**
 * Refuses a connection that could create tables outside `schema`: its role
 * must resolve unqualified names to `schema`, and be neither a superuser nor
 * the database's owner, who reach every project's tables.
 */
export async function assertConfinedRole(
  pool: pg.Pool,
  schema: string = kithSchema,
): Promise<void> {
  const { rows } = await pool.query<{
    role: string;
    current_schema: string | null;
    superuser: boolean;
    owns_database: boolean;
  }>(
    `SELECT current_user AS role,
       current_schema(),
       r.rolsuper AS superuser,
       pg_has_role(current_user, d.datdba, 'MEMBER') AS owns_database
     FROM pg_roles r, pg_database d
     WHERE r.rolname = current_user AND d.datname = current_database()`,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('Could not read the database role');
  const problems = [
    row.current_schema === schema
      ? undefined
      : `its search_path must start with the existing schema ${schema}, but resolves to ${row.current_schema ?? 'no schema'}`,
    row.superuser ? 'it is a superuser' : undefined,
    row.owns_database ? 'it owns the database' : undefined,
  ].filter((problem) => problem !== undefined);
  if (problems.length > 0) {
    throw new Error(
      `DATABASE_URL must connect as Kith's own role (see docs/operations.md), not ${row.role}: ${problems.join('; ')}`,
    );
  }
}
