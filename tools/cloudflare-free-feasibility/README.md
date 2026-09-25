# Catevia on Cloudflare Workers Free: feasibility gate

This directory contains an isolated platform probe and a staging deployment of
the actual Catevia Hono API. Staging uses only the disposable
`catevia-cloudflare-probe-20260924` Turso database and has no production route.
Render remains the active backend until the migration gates below pass.

## Proposed architecture

| Concern | Target boundary | Evidence required before cutover |
| --- | --- | --- |
| HTTP API | Existing Hono app in a request-scoped Worker entry | Every route and middleware order preserved; Worker bundle, auth, tenancy, CORS, upload and error parity |
| Database | Turso stays canonical; web-compatible libSQL and Drizzle clients | Read and write transactions, rollback, concurrency, and representative latency from Workers Free |
| Migrations and readiness | Release pipeline, before traffic switch | Exact schema version and deployed SHA; no schema writes at module import |
| Password verification | Preserve bcrypt cost 12 in compute-only Durable Objects with 32 random shards | Measure real login CPU, latency, failures, unknown users, reset paths, and concurrent lockout behavior |
| Background jobs | Turso outbox remains durable; one fenced owner during transition | Retry, lease expiry, idempotency, and post-commit delivery under Worker scheduling limits |
| PDF | Cloudflare Browser Run only if its Free quota and isolation satisfy existing behavior | Sanitization, disabled script, blocked network/file access, output parity, 429 behavior, and daily usage |
| Notifications | Worker-compatible `fetch`/Web Crypto transports; retain durable DB outbox | APNs sandbox transport is reachable with `fetch`; still prove JWT signing, real sandbox delivery, FCM/Web Push parity, and durable retries |
| Backup | Encrypted logical Turso export to R2, with restore drill | CPU, memory, size, quota, encryption and recovery proof; no local filesystem fallback |
| Client routing | Vercel rewrite and rebuilt native app API base | Web and new native builds traced to the same verified Worker release. The owner confirmed no users have installed an older native build, so old-binary compatibility is not a cutover gate. |

The Worker must not introduce D1 or KV as an alternative writer for canonical
Catevia data. Render and Cloudflare must not run the same background job without
a lease/fence that proves single ownership. Keep Render available for rollback
until the replacement has passed production verification.

## Free-plan decision gates

1. On a Cloudflare **Free** account, measure bcrypt cost 12 in the Durable Object
   using Cloudflare's actual CPU analytics. Local workerd wall time is not a CPU
   measurement. Exercise concurrent logins and lockout behavior as well.
2. On a disposable Turso database, run the read and transaction probes. Never
   point the transaction endpoint at Catevia production data.
3. Measure representative API requests, PDF generation, backup, notifications,
   and background dispatch against the applicable Free CPU, request, subrequest,
   browser-minute, storage, and scheduling limits.
4. Build native clients against the verified Worker API before distribution;
   no existing old-binary users need compatibility support.
5. Only after parity checks, switch traffic with an exact deployed SHA, a
   verified rollback, and monitoring of real requests and jobs.

Current Cloudflare documentation: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/),
[Queues Free](https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/),
and [Turso on Workers](https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/).

The first live Free-plan measurement and its raw samples are in
[results/2026-09-24-workers-free-measurement.md](results/2026-09-24-workers-free-measurement.md).
The follow-up report also records bcrypt sharding, a PBKDF2 runtime limit,
APNs sandbox transport, R2 binding round-trip, and the later bcrypt failure
forensics. One HTTP 500 was tied to a Durable Object code-update reset; the
other two historical 500s lack a specific root cause. The isolated probe now
retries an idempotent bcrypt computation once after a retryable RPC failure,
using a fresh stub. The same bounded compute-only adapter is now wired into the
Catevia login and password-write paths; Node/Render still uses local bcrypt.
The decision remains no-go for a full Free-plan cutover.

## Actual Catevia API staging

`wrangler-catevia-staging.jsonc` deploys the real Hono route tree to
`catevia-api-staging` on Workers Free, with a `PASSWORD_CPU` Durable Object,
AWS US East placement near the disposable Turso database, and no production
route. The database schema was prepared by the separately guarded
`server/src/scripts/cloudflareProbeSchema.ts` preflight; the request Worker
does not run migrations. The public staging hostname is test-only and its
database token expires one day after creation. Secrets live in Cloudflare and
the ignored `.dev.vars.catevia-staging`, never in the Wrangler config.

For a fresh staging deployment, deploy the inert
`wrangler-catevia-staging-bootstrap.jsonc` first with `workers_dev: false`,
put the four staging secrets with `node put-staging-secrets.mjs
TURSO_AUTH_TOKEN REPORT_HMAC_SECRET JWT_SECRET JWT_REFRESH_SECRET`, then deploy
`wrangler-catevia-staging.jsonc`. The bootstrap exists because Catevia validates
JWT/HMAC secrets at module evaluation. `put-staging-secrets.mjs` writes ASCII
bytes directly to Wrangler stdin to avoid Windows PowerShell adding a BOM to
the Turso bearer token. The script refuses malformed/empty secrets and never
prints their values.

Bounded staging results are in
[the measurement report](results/2026-09-24-workers-free-measurement.md),
[current-source staging validation](results/2026-09-25-catevia-staging-deep-validation.md),
[before placement](results/2026-09-24-catevia-staging-connectivity-edge.json),
[after placement](results/2026-09-24-catevia-staging-connectivity-placed.json),
and [real route auth results](results/2026-09-24-catevia-staging-auth.json).
Real login, session rotation, role checks, writes, and selected storage/job
paths passed on the disposable database. Historical connectivity measurements
recorded a pre-placement HTTP 522 from Turso and one local query error in four
attempts; fresh current-source tests succeeded, but repeated final-placement
load evidence is still needed. The current-source
staging report now records a synthetic encrypted R2 backup and isolated
restore, one synthetic PDF render, and manual zero-work maintenance calls.
Production-data restore, provider-backed notification delivery, non-empty job
execution, Browser Run quota headroom, full API parity, and client routing
remain open.

## Running the isolated probe

Use Node.js 22 or newer. `npm ci` followed by `npm run build` checks the Worker
bundle without deploying it. `npm run dev` starts local workerd. The probe
refuses all requests unless `PROBE_TOKEN` is a secret of at least 32 characters.
Set secrets in Wrangler's local `.dev.vars` or the Cloudflare secret store;
`.dev.vars` files are ignored by Git. Do not put secrets into tracked config or
command-line arguments.

The supported variables are `PROBE_TOKEN`, `PROBE_TURSO_URL`, and
`PROBE_TURSO_AUTH_TOKEN`. The write/rollback endpoint additionally requires
`PROBE_DISPOSABLE_DB=yes` and a Turso hostname beginning with
`catevia-cloudflare-probe-`. The endpoint creates only a probe table and rolls
back its inserted test row. It is not a migration test on production data.

Endpoints include `GET /probe/ping`, `POST /probe/bcrypt`,
`POST /probe/bcrypt-sharded`, `GET /probe/turso-read`,
`POST /probe/turso-transaction`, `POST /probe/r2-roundtrip`, and the other
synthetic paths in `src/index.js`. Send the token as an `Authorization: Bearer`
header. Before any remote deployment, confirm the account is Free and the
Worker has no route used by Catevia users.

`load.mjs` performs a bounded run of at most 50 requests with concurrency at
most 5. It accepts the Worker URL, scenario, count, and concurrency as
arguments; the token comes only from the `PROBE_TOKEN` environment variable.
Its latency percentiles are client-observed wall time, not Worker CPU. Read CPU
time and failures from Cloudflare Workers and Durable Objects analytics for the
same time window before making a Free-plan viability claim.
