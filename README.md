# Kith

A pnpm-workspace TypeScript monorepo.

## Layout

| Path                  | What lives there                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine`     | The pure, deterministic simulation. No DOM, no Node APIs, no network, no real clock or ambient randomness (enforced by ESLint and by its `lib` setting).                                      |
| `packages/content`    | Entity-type definitions, sprite metadata and word/meaning data. Depends on `engine`; held to the same determinism rules.                                                                      |
| `packages/client`     | Browser client (Vite + TypeScript, canvas).                                                                                                                                                   |
| `packages/server`     | Node server (Fastify) deployed to Railway. `GET /healthz` reports liveness, `GET /readyz` database readiness; serves the game at `/` and the client build at `/next/`. See [Server](#server). |
| `packages/cortex`     | Claude-facing service code (prompt templates, schemas, providers), used by the server.                                                                                                        |
| `packages/legacy-sim` | The prototype simulation ported to TypeScript (not yet ported).                                                                                                                               |
| `prototype/`          | The v2.2 prototype: the reference implementation, and the game served at `/` until the new client replaces it.                                                                                |
| `requirements/`       | Product requirements.                                                                                                                                                                         |
| `tests/`              | Repository-level tests (e.g. the determinism lint rule).                                                                                                                                      |

Shared compiler settings live in `tsconfig.base.json` (strict mode everywhere). Workspace packages import each other's TypeScript sources directly during typechecking, tests and Vite builds via the `@kith/source` export condition; `pnpm build` compiles each package to `dist/` in dependency order, then inlines the prototype into `prototype/dist/kith.html` and its sign-in card into `prototype/dist/welcome.html`.

## Commands

Requires Node 24 and pnpm (version pinned in `package.json`).

```sh
pnpm install
pnpm typecheck   # tsc across the root and every package
pnpm lint        # ESLint + Prettier check
pnpm test        # Vitest
pnpm build       # build every package and the prototype
pnpm exec playwright install --with-deps chromium  # once, before the first pnpm e2e
pnpm e2e         # Playwright, against the built server (after pnpm build; needs Postgres, see below)
pnpm format      # apply Prettier
```

The Postgres integration tests (`packages/server/src/world-store.test.ts`) run only when `TEST_DATABASE_URL` points at a database they may create and drop schemas in, e.g. `TEST_DATABASE_URL=postgres://kith:kith@localhost:5432/kith pnpm test`; each run works in a fresh schema of its own. Without it they are skipped locally and fail in CI. `pnpm e2e` signs in, so it migrates and writes users to the database at `TEST_DATABASE_URL` (default `postgres://kith:kith@127.0.0.1:5432/kith`); it signs in through a fake Google (`e2e/fake-google.ts`) that Playwright starts beside the server.

CI (`.github/workflows/ci.yml`) runs install, typecheck, lint, test (against a Postgres service container) and build on every pull request and on `main`, migrates an empty database with the built server, runs the Playwright tests (`e2e/`) against the built server, and builds the Docker image and checks that it serves `/healthz`, the welcome page and the client.

Production runs on Railway at <https://kith.interstellarai.net>, declared in `.railway/railway.ts`; deploys, variables, DNS, backups and restores are described in [Operations](docs/operations.md).

## Server

`packages/server` validates its environment at startup and refuses to start, listing every problem, if any of it is invalid:

| Variable               | Required | Rule                                                                   |
| ---------------------- | -------- | ---------------------------------------------------------------------- |
| `PORT`                 | no       | Integer 1–65535; defaults to 3000.                                     |
| `DATABASE_URL`         | yes      | `postgres://` or `postgresql://` URL.                                  |
| `ANTHROPIC_API_KEY`    | yes      | Non-empty.                                                             |
| `SENTRY_DSN`           | no       | URL.                                                                   |
| `APP_ORIGIN`           | yes      | Public origin, e.g. `https://kith.example` (no path).                  |
| `SESSION_SECRET`       | yes      | At least 32 characters.                                                |
| `GOOGLE_CLIENT_ID`     | yes      | The Google OAuth client's id.                                          |
| `GOOGLE_CLIENT_SECRET` | yes      | The Google OAuth client's secret.                                      |
| `GOOGLE_AUTH_URL`      | no       | URL; replaces Google's authorization endpoint (end-to-end tests only). |
| `GOOGLE_TOKEN_URL`     | no       | URL; replaces Google's token endpoint (end-to-end tests only).         |

`GET /healthz` answers as long as the process is up; `GET /readyz` answers 200 only while Postgres responds to `SELECT 1` and 503 otherwise (Railway's deploy healthcheck, see [Operations](docs/operations.md)). Logs are JSON lines; each request carries an `x-request-id` (taken from the incoming header or generated) that appears as `reqId` in its log lines and is echoed in the response.

The server also serves static files: the playable v2.2 prototype (`prototype/dist/kith.html`) at `/` to signed-in players (see [Sign-in](#sign-in)), and the new client's Vite build (`packages/client/dist`, built with base `/next/`) at `/next/` while it is being built. One Railway service therefore serves both the app and the API from one origin: one deploy, no CORS or cross-site cookies, and the client always ships with the server version that runs the same engine. A separate static deploy was rejected for adding a second pipeline and allowing client/server version skew for no benefit at this stage.

### Sign-in

Players sign in with Google (OpenID Connect, authorization code flow with PKCE). `GET /auth/google` sends the browser to Google; `GET /auth/google/callback` redeems the code for an ID token, creates the player's `users` row on first sign-in (keyed by the Google account's subject) and issues the session. A signed-out visitor to `/` gets the welcome card (`prototype/dist/welcome.html`) instead of the game.

The session is a cookie, `kith_session`: HTTP-only, `Secure`, `SameSite=Lax`, signed with `SESSION_SECRET`, holding the user id and an expiry 90 days out. Every request that carries a valid one gets it renewed for another 90 days. It is not stored server-side, so signing out (`POST /auth/sign-out`, the game's **Sign out** button) clears it from the browser but cannot revoke a copy taken elsewhere; rotating `SESSION_SECRET` signs everyone out.

Routes under `/api/` answer 401 without a valid session. State-changing requests (anything but `GET`, `HEAD` and `OPTIONS`) to them, and sign-out, also need an `Origin` equal to `APP_ORIGIN` (or, without one, `Sec-Fetch-Site: same-origin`) and answer 403 otherwise. Handlers read the player from `request.userId`.

### Persistence

Worlds are stored in Postgres. `packages/server/src/migrations.ts` holds the schema as an ordered list of SQL migrations; `node packages/server/dist/migrate-main.js` (which needs only `DATABASE_URL`) applies the ones not yet recorded in `schema_migrations` and runs as Railway's pre-deploy command, so the schema is current before a new version takes traffic.

| Table              | Holds                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `users`            | Players, keyed by their Google account (`google_subject`).                                                     |
| `worlds`           | One row per world: owner, name, current `version`, sim time, seed, last-seen time and scheduler lease.         |
| `world_snapshots`  | The full world (the engine's save JSON) at every version.                                                      |
| `world_events`     | Append-only game events, numbered per world. Nothing prunes them yet (see below).                              |
| `moments`/`dreams` | The memory book: every moment and dream a world has held, kept forever even after the world itself drops them. |
| `commands`         | Every player command received, numbered per world, for replay and debugging.                                   |

`PgWorldStore` (`packages/server/src/world-store.ts`) implements the `WorldStore` interface. `save(worldId, baseVersion, world, events)` writes the next version only if the stored version is still `baseVersion` and throws `WorldVersionConflict` otherwise, so two writers never silently overwrite each other. Loaded snapshots go through the engine's save migrations and validation. `pruneEvents(now)` implements the event retention — routine events older than 30 days are deleted — but nothing calls it yet: until a scheduler does, `world_events` grows without bound.

Build and run the image locally:

```sh
docker build -t kith-server .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://kith:kith@host.docker.internal:5432/kith \
  -e ANTHROPIC_API_KEY=... \
  -e APP_ORIGIN=http://localhost:3000 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e GOOGLE_CLIENT_ID=... \
  -e GOOGLE_CLIENT_SECRET=... \
  kith-server
```
