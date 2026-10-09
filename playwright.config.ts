import { defineConfig } from '@playwright/test';

const port = 3100;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}` },
  // Serves the output of `pnpm build`. The pool never connects unless
  // /readyz is hit, so the database and API key can be placeholders.
  webServer: {
    command: 'node packages/server/dist/main.js',
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(port),
      DATABASE_URL: 'postgres://kith:kith@127.0.0.1:5432/kith',
      ANTHROPIC_API_KEY: 'e2e-placeholder',
      APP_ORIGIN: `http://localhost:${port}`,
      SESSION_SECRET: 'e2e-placeholder-session-secret-0123456789',
    },
  },
});
