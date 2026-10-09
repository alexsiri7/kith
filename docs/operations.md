# Operations

Kith runs on Railway: project `kith`, environment `production`, region `europe-west4-drams3a`. Everything about it except secret values and backup schedules is declared in [`.railway/railway.ts`](../.railway/railway.ts):

| Resource  | What it is                                                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kith`    | The server (and the client it serves), built from the `Dockerfile` on `alexsiri7/kith` `main`. Health check `GET /readyz` (60 s), restarted on failure. Custom domain `kith.interstellarai.net`, routed to port 3000. |
| `kith-db` | Railway Postgres. Its `DATABASE_URL` (private network) is wired into `kith` as a variable reference, so it is never copied anywhere.                                                                                  |

## Changing the infrastructure

Railway does **not** read `.railway/railway.ts` on deploy. To change a setting, edit the file, then run, with the global `railway` CLI at 5.42.1 or newer (`railway --version`; `npm ci` installs only the TypeScript SDK the file imports, not the CLI):

```sh
cd .railway && npm ci
railway link            # project kith, environment production
railway config plan     # review the diff
railway config apply
```

The first `apply` creates the project, the service, the database and the custom domain.

## Variables

| Variable            | Where the value lives                                         |
| ------------------- | ------------------------------------------------------------- |
| `PORT`              | `railway.ts` (`3000`, the port the custom domain routes to).  |
| `APP_ORIGIN`        | `railway.ts` (`https://kith.interstellarai.net`).             |
| `DATABASE_URL`      | `railway.ts`, as a reference to `kith-db`'s `DATABASE_URL`.   |
| `ANTHROPIC_API_KEY` | Railway dashboard only.                                       |
| `SESSION_SECRET`    | Railway dashboard only. Generate with `openssl rand -hex 32`. |
| `SENTRY_DSN`        | Railway dashboard only; may be left empty.                    |

Secrets are declared with `preserve()`, so `apply` keeps whatever value the dashboard holds and their values never enter the repository. When you add a variable in the dashboard, add its `preserve()` line to `railway.ts` too. The server refuses to start, listing every problem, while any required variable is missing or invalid (see the README's [Server](../README.md#server) section).

## DNS

`kith.interstellarai.net` is a `CNAME` in the `interstellarai.net` zone on Cloudflare, like `musenmingle.interstellarai.net` and `thaleia.interstellarai.net`. After the first `apply`, the service's **Settings → Networking** shows the target (`<something>.up.railway.app`) and, if requested, a `TXT` verification record. Add them in the Cloudflare dashboard as **DNS only** (grey cloud), so Railway can issue the TLS certificate. Railway marks the domain verified once it resolves.

## Deploys

A push to `main` deploys automatically. `checkSuites` makes Railway wait for the commit's GitHub checks (CI's `check` and `image` jobs) and skip the deploy if any fails. Railway then builds the image and starts it beside the current deploy; traffic moves to it only once `/readyz` answers 200 — that is, once the server is up and Postgres answers `SELECT 1`. A deploy that does not get there within 60 seconds fails, and the previous deploy keeps serving.

To check a deploy: `https://kith.interstellarai.net/healthz` answers 200 while the process is up; `/readyz` answers 200 while the database is reachable and 503 otherwise.

### Rolling back

In the `kith` service's **Deployments** tab, open the last good deploy and choose **Redeploy**. It goes through the same health check. Then revert the bad commit on `main`, or the next push deploys it again.

## Backups

Backups of `kith-db` are a schedule on its volume and are not part of `railway.ts`. After the first `apply`, open `kith-db` → **Backups** and enable the **Daily** schedule. Railway keeps each daily backup for six days.

To take one by hand before a risky change (a migration you are unsure of, a manual data fix): create a manual backup in the same tab.

### Restoring

A restore replaces the whole database with the backup; everything written since the backup is lost.

1. `kith-db` → **Backups**, pick the backup, choose **Restore**. Railway stages the change.
2. Review and **Deploy** the staged change. `kith-db` restarts on the restored volume; `kith` answers 503 on `/readyz` until it is back.
3. Check that `https://kith.interstellarai.net/readyz` answers 200 and that the game loads a known world.
