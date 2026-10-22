import * as Sentry from '@sentry/node';

/**
 * Reports errors to Sentry when a DSN is set, and does nothing otherwise.
 *
 * Call it before `Fastify()` runs (in `buildServer`). From @sentry/node 11
 * the default Fastify integration listens on Fastify's diagnostics channels
 * instead of patching the module as it is imported, so no `--import` preload
 * is needed, and `setupFastifyErrorHandler` is a deprecated no-op. Any error
 * that ends in a 5xx reply is reported. Errors from route handlers and
 * `preHandler` hooks reach it whenever Sentry starts, but errors from earlier
 * hooks such as `onRequest` only through an `onError` hook it adds to each
 * instance as `Fastify()` creates it.
 *
 * Player worlds and session cookies must not leave the server, so nothing
 * that can carry them is collected: request bodies, cookies, URL query
 * strings (the sign-in callback carries Google's code), database query data,
 * or local variables in stack frames. The SDK already filters the
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
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
  });
}
