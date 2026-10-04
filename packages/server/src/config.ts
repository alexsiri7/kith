import { resolvePort } from './port.js';

export interface Config {
  port: number;
  databaseUrl: string;
  anthropicApiKey: string;
  sentryDsn: string | undefined;
  appOrigin: string;
  sessionSecret: string;
}

const minSessionSecretLength = 32;

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function hasProtocol(url: URL | undefined, protocols: string[]): boolean {
  return url !== undefined && protocols.includes(url.protocol);
}

// Error messages never include DATABASE_URL, ANTHROPIC_API_KEY or
// SESSION_SECRET values: startup errors end up in deploy logs.
export function loadConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = [];
  const required = (name: string): string => {
    const value = env[name];
    if (value === undefined || value === '') {
      problems.push(`${name} must be set`);
      return '';
    }
    return value;
  };

  let port = 0;
  try {
    port = resolvePort(env.PORT);
  } catch (error) {
    problems.push((error as Error).message);
  }

  const databaseUrl = required('DATABASE_URL');
  if (
    databaseUrl !== '' &&
    !hasProtocol(parseUrl(databaseUrl), ['postgres:', 'postgresql:'])
  ) {
    problems.push('DATABASE_URL must be a postgres:// or postgresql:// URL');
  }

  const anthropicApiKey = required('ANTHROPIC_API_KEY');

  const sentryDsn = env.SENTRY_DSN === '' ? undefined : env.SENTRY_DSN;
  if (
    sentryDsn !== undefined &&
    !hasProtocol(parseUrl(sentryDsn), ['http:', 'https:'])
  ) {
    problems.push('SENTRY_DSN must be a URL');
  }

  const appOrigin = required('APP_ORIGIN');
  if (appOrigin !== '') {
    const url = parseUrl(appOrigin);
    if (!hasProtocol(url, ['http:', 'https:']) || url?.origin !== appOrigin) {
      problems.push(
        `APP_ORIGIN must be an origin like https://kith.example, got "${appOrigin}"`,
      );
    }
  }

  const sessionSecret = required('SESSION_SECRET');
  if (sessionSecret !== '' && sessionSecret.length < minSessionSecretLength) {
    problems.push(
      `SESSION_SECRET must be at least ${minSessionSecretLength} characters`,
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid configuration:\n${problems.map((p) => `- ${p}`).join('\n')}`,
    );
  }
  return {
    port,
    databaseUrl,
    anthropicApiKey,
    sentryDsn,
    appOrigin,
    sessionSecret,
  };
}
