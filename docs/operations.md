# Operations

Kith runs on Railway: project `kith`, environment `production`, region `europe-west4-drams3a`. Everything about it except secret values is declared in [`.railway/railway.ts`](../.railway/railway.ts):

| Resource | What it is                                                                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kith`   | The server (and the client it serves), built from the `Dockerfile` on `alexsiri7/kith` `main`. Health check `GET /readyz` (60 s), restarted on failure. Custom domain `kith.interstellarai.net`, routed to port 3000. |

Its database is not on Railway: see [Database](#database).

## Changing the infrastructure

Railway does **not** read `.railway/railway.ts` on deploy. To change a setting, edit the file, then run, with the global `railway` CLI at 5.42.1 or newer (`railway --version`; `npm ci` installs only the TypeScript SDK the file imports, not the CLI):

```sh
cd .railway && npm ci
railway link            # project kith, environment production
railway config plan     # review the diff
railway config apply
```

The first `apply` creates the project, the service and the custom domain.

## Variables

| Variable                 | Where the value lives                                          |
| ------------------------ | -------------------------------------------------------------- |
| `PORT`                   | `railway.ts` (`3000`, the port the custom domain routes to).   |
| `APP_ORIGIN`             | `railway.ts` (`https://kith.interstellarai.net`).              |
| `DATABASE_URL`           | Railway dashboard only. See [Database](#database).             |
| `LLM_API_KEY`            | Railway dashboard only. The Requesty key.                      |
| `LLM_MODEL`              | Unset (defaults to Claude Haiku 4.5); set in `railway.ts`.     |
| `MIND_DAILY_CALLS`       | Unset (defaults to 300). Set in `railway.ts` to change it.     |
| `MIND_MONTHLY_SPEND_USD` | Unset (defaults to 20). Set in `railway.ts` to change it.      |
| `SESSION_SECRET`         | Railway dashboard only. Generate with `openssl rand -hex 32`.  |
| `SENTRY_DSN`             | Railway dashboard only; may be left empty.                     |
| `GOOGLE_CLIENT_ID`       | Railway dashboard only. See [Google sign-in](#google-sign-in). |
| `GOOGLE_CLIENT_SECRET`   | Railway dashboard only. See [Google sign-in](#google-sign-in). |

Secrets are declared with `preserve()`, so `apply` keeps whatever value the dashboard holds and their values never enter the repository. When you add a variable in the dashboard, add its `preserve()` line to `railway.ts` too. The server refuses to start, listing every problem, while any required variable is missing or invalid (see the README's [Server](../README.md#server) section).

## Google sign-in

Players sign in with an OAuth client in the Google Cloud console (**APIs & Services → Credentials**), of type **Web application**, with:

- Authorized JavaScript origin: `https://kith.interstellarai.net`
- Authorized redirect URI: `https://kith.interstellarai.net/auth/google/callback`

Its consent screen needs only the `openid`, `email` and `profile` scopes. Put the client's id and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. If `APP_ORIGIN` ever changes, add the new origin and redirect URI to the client first, or sign-in fails with Google's `redirect_uri_mismatch`.

## DNS

`kith.interstellarai.net` is a `CNAME` in the `interstellarai.net` zone on Cloudflare, like `musenmingle.interstellarai.net` and `thaleia.interstellarai.net`. After the first `apply`, the service's **Settings → Networking** shows the target (`<something>.up.railway.app`) and, if requested, a `TXT` verification record. Add them in the Cloudflare dashboard as **DNS only** (grey cloud), so Railway can issue the TLS certificate. Railway marks the domain verified once it resolves.

## Deploys

A push to `main` deploys automatically. `checkSuites` makes Railway wait for the commit's GitHub checks (CI's `check` and `image` jobs) and skip the deploy if any fails. Railway then builds the image and starts it beside the current deploy; traffic moves to it only once `/readyz` answers 200 — that is, once the server is up and Postgres answers `SELECT 1`. A deploy that does not get there within 60 seconds fails, and the previous deploy keeps serving.

To check a deploy: `https://kith.interstellarai.net/healthz` answers 200 while the process is up; `/readyz` answers 200 while the database is reachable and 503 otherwise.

### Rolling back

In the `kith` service's **Deployments** tab, open the last good deploy and choose **Redeploy**. It goes through the same health check. Then revert the bad commit on `main`, or the next push deploys it again.

## Database

Kith's tables live in the shared Supabase "prod" database, which holds every project's tables. Kith keeps to a schema of its own, `kith`, and connects as a role of its own, `kith_app`, that can use that schema and nothing else: it is not `postgres`, owns no database, and is granted nothing outside `kith` beyond what every role has, so no bug or migration of Kith's can touch another project's tables.

- The role's `search_path` is `kith`, so Kith's SQL names its tables unqualified and they resolve there.
- Migrations may not name any schema, change the `search_path`, or create, alter or drop a schema or database: `migrateDatabase` refuses to run one that does, and `migrations.test.ts` fails on it.
- The pre-deploy migration refuses to run unless its connection's schema is `kith` and its role is neither a superuser nor the database's owner.

### Creating the schema and role

Once, before the first deploy, run this in the Supabase SQL editor (as `postgres`), with a fresh password (`openssl rand -hex 32`) in place of `<password>`:

```sql
CREATE ROLE kith_app LOGIN PASSWORD '<password>';
CREATE SCHEMA kith;
GRANT USAGE, CREATE ON SCHEMA kith TO kith_app;
ALTER ROLE kith_app SET search_path = kith;
```

`kith` belongs to `postgres`, so `kith_app` can create, change and drop its own tables in it but cannot drop the schema. CI sets up its Postgres with this same SQL, and `database.test.ts` checks that a role made with it sees nothing outside its schema.

### Connecting

`DATABASE_URL` is the project's **Transaction pooler** connection string (**Connect** in the Supabase dashboard; port 6543), with the user `kith_app.<project-ref>` and the password above, e.g. `postgresql://kith_app.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres`. Leave out any `sslmode`, which would replace the server's own TLS settings: on Railway (where `RAILWAY_ENVIRONMENT` is set) the server always uses TLS and verifies the database against Supabase's root CA (`packages/server/certs/supabase-root-2021-ca.crt`, valid until 2031-04-26). The transaction pooler hands each transaction to any server connection, so Kith never uses prepared (named) statements and the migrations hold their lock per transaction.

### Backups

Backups are Supabase's, of the whole shared database: restoring one rolls back every project in it, not just Kith, so it is no way to undo a mistake of Kith's. Before a risky change (a migration you are unsure of, a manual data fix), keep a copy of Kith's data alone with `pg_dump --schema=kith --format=custom --file=kith.dump <connection>`; `pg_restore --clean --schema=kith --dbname=<connection> kith.dump` puts it back.
