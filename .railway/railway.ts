// Railway Infrastructure as Code for the `kith` project (replaces the retired
// railway.json config-as-code). Railway does not read this file on deploy:
// preview with `railway config plan`, then `railway config apply` (Railway CLI
// >= 5.42.1). See docs/operations.md.
//
// Secrets are preserve()d so apply keeps the values Railway already holds;
// never put their values here. When you add a variable in the dashboard, add
// its preserve() line here too.
import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
} from 'railway/iac';

const domain = 'kith.interstellarai.net';
const port = 3000;
const region = 'europe-west4-drams3a';

export default defineRailway(() => {
  const db = postgres('kith-db', { region });

  const kith = service('kith', {
    // checkSuites: a push to main deploys only after its GitHub checks pass.
    source: github('alexsiri7/kith', { branch: 'main', checkSuites: true }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    start: 'node packages/server/dist/main.js',
    // A deploy that never reports ready is not promoted; the previous one keeps serving.
    healthcheck: '/readyz',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE' },
    regions: { [region]: 1 },
    domains: [{ domain, port }],
    env: {
      PORT: String(port),
      APP_ORIGIN: `https://${domain}`,
      DATABASE_URL: db.env.DATABASE_URL,
      ANTHROPIC_API_KEY: preserve(),
      SESSION_SECRET: preserve(),
      SENTRY_DSN: preserve(),
    },
  });

  return project('kith', { resources: [db, kith] });
});
