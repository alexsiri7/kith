import * as Sentry from '@sentry/node';

/**
 * Reports errors to Sentry when a DSN is set, and does nothing otherwise.
 * Call it before Fastify is built, so its integration sees the app.
 *
 * Player worlds and session cookies must not leave the server, so nothing
 * that can carry them is collected: request bodies, cookies, database query
 * data, or local variables in stack frames. The SDK already filters the
 * `Authorization` and `Cookie` headers.
 */
export function startSentry(
  dsn: string | undefined,
  env: Record<string, string | undefined>,
): void {
  if (dsn === undefined || dsn === '') return;
  Sentry.init({
    dsn,
    // Railway injects both into every deploy.
    environment: env.RAILWAY_ENVIRONMENT_NAME,
    release: env.RAILWAY_GIT_COMMIT_SHA,
    dataCollection: {
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      stackFrameVariables: false,
    },
  });
}
