import pg from 'pg';
import { migrateDatabase } from './migrations.js';

// Only the database is needed here, so the server's other required settings
// must not be able to block a pre-deploy migration.
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  throw new Error('DATABASE_URL must be set');
}
const pool = new pg.Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5_000,
});
try {
  const applied = await migrateDatabase(pool);
  console.log(
    applied.length === 0
      ? 'Database schema is up to date'
      : `Applied migrations: ${applied.join(', ')}`,
  );
} finally {
  await pool.end();
}
