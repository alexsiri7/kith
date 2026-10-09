# Kith

A pnpm-workspace TypeScript monorepo.

## Layout

| Path                  | What lives there                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine`     | The pure, deterministic simulation. No DOM, no Node APIs, no network, no real clock or ambient randomness (enforced by ESLint and by its `lib` setting).      |
| `packages/content`    | Entity-type definitions, sprite metadata and word/meaning data. Depends on `engine`; held to the same determinism rules.                                      |
| `packages/client`     | Browser client (Vite + TypeScript, canvas).                                                                                                                   |
| `packages/server`     | Node server (Fastify) deployed to Railway. `GET /healthz` reports liveness, `GET /readyz` database readiness; serves the client build. See [Server](#server). |
| `packages/cortex`     | Claude-facing service code (prompt templates, schemas, providers), used by the server.                                                                        |
| `packages/legacy-sim` | The prototype simulation ported to TypeScript (not yet ported).                                                                                               |
| `prototype/`          | Untouched reference implementation of the original prototype.                                                                                                 |
| `requirements/`       | Product requirements.                                                                                                                                         |
| `tests/`              | Repository-level tests (e.g. the determinism lint rule).                                                                                                      |

Shared compiler settings live in `tsconfig.base.json` (strict mode everywhere). Workspace packages import each other's TypeScript sources directly during typechecking, tests and Vite builds via the `@kith/source` export condition; `pnpm build` compiles each package to `dist/` in dependency order.

## Commands

Requires Node 24 and pnpm (version pinned in `package.json`).

```sh
pnpm install
pnpm typecheck   # tsc across the root and every package
pnpm lint        # ESLint + Prettier check
pnpm test        # Vitest
pnpm build       # build every package
pnpm format      # apply Prettier
```

CI (`.github/workflows/ci.yml`) runs install, typecheck, lint, test and build on every pull request and on `main`, and builds the Docker image and checks that it serves `/healthz` and the client.

## Server

`packages/server` validates its environment at startup and refuses to start, listing every problem, if any of it is invalid:

| Variable            | Required | Rule                                                  |
| ------------------- | -------- | ----------------------------------------------------- |
| `PORT`              | no       | Integer 1–65535; defaults to 3000.                    |
| `DATABASE_URL`      | yes      | `postgres://` or `postgresql://` URL.                 |
| `ANTHROPIC_API_KEY` | yes      | Non-empty.                                            |
| `SENTRY_DSN`        | no       | URL.                                                  |
| `APP_ORIGIN`        | yes      | Public origin, e.g. `https://kith.example` (no path). |
| `SESSION_SECRET`    | yes      | At least 32 characters.                               |

`GET /healthz` answers as long as the process is up; `GET /readyz` answers 200 only while Postgres responds to `SELECT 1` and 503 otherwise (Railway's deploy healthcheck, see `railway.json`). Logs are JSON lines; each request carries an `x-request-id` (taken from the incoming header or generated) that appears as `reqId` in its log lines and is echoed in the response.

The server also serves the client's Vite build (`packages/client/dist`) as static files. One Railway service therefore serves both the app and the API from one origin: one deploy, no CORS or cross-site cookies, and the client always ships with the server version that runs the same engine. A separate static deploy was rejected for adding a second pipeline and allowing client/server version skew for no benefit at this stage.

Build and run the image locally:

```sh
docker build -t kith-server .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://kith:kith@host.docker.internal:5432/kith \
  -e ANTHROPIC_API_KEY=... \
  -e APP_ORIGIN=http://localhost:3000 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  kith-server
```
