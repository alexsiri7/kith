# Kith

A pnpm-workspace TypeScript monorepo.

## Layout

| Path                  | What lives there                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine`     | The pure, deterministic simulation. No DOM, no Node APIs, no network, no real clock or ambient randomness (enforced by ESLint and by its `lib` setting). |
| `packages/content`    | Entity-type definitions, sprite metadata and word/meaning data. Depends on `engine`; held to the same determinism rules.                                 |
| `packages/client`     | Browser client (Vite + TypeScript, canvas).                                                                                                              |
| `packages/server`     | Node server (Fastify) deployed to Railway. Listens on `PORT`; `GET /health` reports liveness.                                                            |
| `packages/cortex`     | Claude-facing service code (prompt templates, schemas, providers), used by the server.                                                                   |
| `packages/legacy-sim` | The prototype simulation ported to TypeScript (not yet ported).                                                                                          |
| `prototype/`          | Untouched reference implementation of the original prototype (to be unpacked from `kith-prototype.zip`).                                                 |
| `requirements/`       | Product requirements.                                                                                                                                    |
| `tests/`              | Repository-level tests (e.g. the determinism lint rule).                                                                                                 |

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

CI (`.github/workflows/ci.yml`) runs install, typecheck, lint, test and build on every pull request and on `main`.
