// The server runs the same simulation as the browser; these become named
// imports once the packages export something.
import '@kith/engine';
import '@kith/content';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';
import { googleProvider } from './google.js';
import { buildServer } from './index.js';
import { PgUserStore } from './users.js';

const config = loadConfig(process.env);
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 5_000,
});
const app = buildServer({
  checkDatabase: () => pool.query('SELECT 1'),
  auth: {
    appOrigin: config.appOrigin,
    sessionSecret: config.sessionSecret,
    google: googleProvider(config.google),
    users: new PgUserStore(pool),
  },
  // Same relative paths from src/ (tests) and dist/ (image).
  gameDir: fileURLToPath(new URL('../../../prototype/dist/', import.meta.url)),
  clientDir: fileURLToPath(new URL('../../client/dist/', import.meta.url)),
});
app.addHook('onClose', () => pool.end());
// Node as PID 1 in a container ignores SIGTERM unless handled.
process.once('SIGTERM', () => void app.close());
// Railway injects PORT and routes traffic to it on all interfaces.
await app.listen({ port: config.port, host: '0.0.0.0' });
