import pg from 'pg';
import { loadConfig } from './config.js';
import { migrateDatabase } from './migrations.js';

const config = loadConfig(process.env);
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
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
