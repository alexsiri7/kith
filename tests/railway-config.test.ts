import { describe, expect, it, vi } from 'vitest';

// The Railway SDK lives in .railway's own npm install, which CI never runs, so
// the program is evaluated against a stand-in that records what it declares.
const preserved = Symbol('preserve()');

vi.mock('railway/iac', () => ({
  defineRailway: (build: () => unknown) => build,
  github: (repo: string, options: object) => ({ repo, ...options }),
  postgres: (name: string) => ({
    name,
    env: { DATABASE_URL: { reference: `${name}.DATABASE_URL` } },
  }),
  preserve: () => preserved,
  project: (name: string, options: object) => ({ name, ...options }),
  service: (name: string, options: object) => ({ name, ...options }),
}));

interface KithService {
  name: string;
  source: { repo: string; branch: string; checkSuites?: boolean };
  healthcheck?: string;
  deploy?: { restartPolicyType?: string };
  env: Record<string, unknown>;
}

// A non-literal specifier keeps tsc from type-checking railway.ts against an
// SDK the root install does not have.
const configPath = '../.railway/railway.ts';

async function kithService(): Promise<KithService> {
  const { default: build } = (await import(configPath)) as {
    default: () => { resources: { name: string }[] };
  };
  const service = build().resources.find(({ name }) => name === 'kith');
  if (!service) throw new Error('no kith service declared');
  return service as KithService;
}

describe('Railway config', () => {
  it('keeps every secret out of the repo', async () => {
    const { env } = await kithService();
    for (const secret of [
      'ANTHROPIC_API_KEY',
      'SESSION_SECRET',
      'SENTRY_DSN',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
    ]) {
      expect(env[secret], secret).toBe(preserved);
    }
  });

  it('commits literal values only for non-secret variables', async () => {
    const { env } = await kithService();
    const literals = Object.keys(env).filter(
      (key) => typeof env[key] === 'string',
    );
    expect(literals.sort()).toEqual(['APP_ORIGIN', 'PORT']);
  });

  it('deploys main only after CI passes and the database is reachable', async () => {
    const { source, healthcheck, deploy } = await kithService();
    expect(source).toMatchObject({
      repo: 'alexsiri7/kith',
      branch: 'main',
      checkSuites: true,
    });
    expect(healthcheck).toBe('/readyz');
    expect(deploy?.restartPolicyType).toBe('ON_FAILURE');
  });
});
