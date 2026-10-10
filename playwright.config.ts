import { defineConfig } from '@playwright/test';

const port = 3100;
const googlePort = 3101;
const google = {
  GOOGLE_CLIENT_ID: 'e2e-google-client-id',
  GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret',
};

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: [
    {
      command: 'node e2e/fake-google.ts',
      url: `http://localhost:${googlePort}/healthz`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(googlePort), ...google },
    },
    // Serves the output of `pnpm build`. Signing in writes users to Postgres,
    // so the database must be reachable; the API key can be a placeholder.
    {
      command:
        'node packages/server/dist/migrate-main.js && node packages/server/dist/main.js',
      url: `http://localhost:${port}/healthz`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(port),
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          'postgres://kith:kith@127.0.0.1:5432/kith',
        ANTHROPIC_API_KEY: 'e2e-placeholder',
        // Keeps the game off the real Anthropic API; tests that need the mind
        // answer /api/mind themselves.
        MIND_DAILY_CALLS: '0',
        APP_ORIGIN: `http://localhost:${port}`,
        SESSION_SECRET: 'e2e-placeholder-session-secret-0123456789',
        ...google,
        GOOGLE_AUTH_URL: `http://localhost:${googlePort}/auth`,
        GOOGLE_TOKEN_URL: `http://localhost:${googlePort}/token`,
      },
    },
  ],
});
