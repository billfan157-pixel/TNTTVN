# Catevia production cutover readiness — 2026-09-26

Verdict: **NO-GO for live traffic.** Every blocker that can be closed from this
workstation is closed and verified below. The remaining open gates all require
live Cloudflare/Turso/R2/Vercel/Render credentials and production-shaped data, so
they cannot be discharged here without inventing evidence.

## 1. Current truth anchors

| Fact | Value | Source |
| ---- | ----- | ------ |
| Branch | `feat/cloudflare-worker-backend` | `git branch --show-current` |
| HEAD at analysis | `62846978a499c0956f610ddb1274cc26832c12f2` | `git rev-parse HEAD` |
| Worker traffic | `CATEVIA_TRAFFIC_ENABLED=no` | `wrangler-catevia-production.jsonc:14` |
| Maintenance owner | `CATEVIA_MAINTENANCE_OWNER=render` | `wrangler-catevia-production.jsonc:15` |
| Release id in config | `APP_RELEASE_ID=unreleased`, overridden to the verified SHA only at deploy | `wrangler-catevia-production.jsonc:17`, `deploy-production.yml:172` |
| Scheduled writers | Cron only re-arms alarms while the owner is not `cloudflare` | `server/src/cloudflare/entry.js:56` |
| Job inventory the Worker would own | 9 kinds, 30 s to 24 h cadence | `server/src/cloudflare/maintenanceJob.js:17` |
| Ingress | Vercel proxy, `workers.dev` host behind it, no custom domain yet | `proxy.ts`, `vercel.json` |

The Worker is deliberately inert. Nothing in this pass changes that state; only
the recorded cutover workflow moves it.

## 2. Blockers closed in this pass

| ID | Blocker | Fix | Evidence |
| -- | ------- | --- | -------- |
| C1 | Production demanded a `PASSWORD_CIPHER_KEY` that no code path uses | Removed from `server/src/cloudflare/entry.js` and `put-production-secrets.mjs`; production is bcrypt-only | `deploymentSecurityContract.test.ts`, `npx tsc --noEmit -p server/tsconfig.json` |
| C2 | Production Worker entry imported a Durable Object from `tools/`, so the deployed bundle resolved a runtime dependency from a tool `devDependency` | `PdfJob` moved to `server/src/cloudflare/pdfJob.js`; `@cloudflare/puppeteer` declared in `server/package.json`; both entries re-pointed; tools copy deleted | `wrangler deploy --dry-run` for the production and staging configs, new bundle-boundary contract test |
| C3 | Production schema migrations had no owner: the Worker refuses to migrate at startup, and no explicit path existed | `server/src/scripts/applyProductionMigrations.ts` (quarantine + readiness asserted, `MIGRATION_APPROVED_SHA` must equal `git rev-parse HEAD`, `ALLOW_PRODUCTION_MIGRATION` required) and manual `.github/workflows/migrate-production-database.yml` | migration guard run without env fails closed; tsc; contract test |
| C4 | Cutover could point ingress at the Worker without proving recoverability | `cutover-production.yml` now checks out the release, installs dependencies, requires the full 15-secret Worker inventory, creates an encrypted production R2 backup, verifies it through the closed Worker, and restore-drills it into a throwaway local database before any ingress change | contract test; `probe-production-backup` + `drill-production-backup-restore` unit tests |
| C5 | Rollback pointed ingress at Render without redeploying a known-good Render release | Rollback redeploys the exact Vercel SHA on Render and waits for `live` before the boundary proof | ordered-step contract test |
| C6 | A duplicated `id: vercel` step (introduced while adding C4/C5) silently emptied the SHA the rollback deploy and boundary proof read, and ran the single-writer proof during rollback, where it demands the state rollback is undoing | Step names and `id`s restored; new contract test asserts unique step ids, gate ordering, and open-only ownership proof | new ordering test, verified failing before the fix |
| C7 | Boundary proof depended on a Render-supplied origin header | `proxy.ts` stamps `x-render-origin-server` from the resolved target | `vercelProxy.test.ts` |
| C8 | Stability alerting only covered password CPU retries, so a stopped writer or a failed backup was invisible | `detect-worker-incidents.mjs` + `wranglerTailWindow.mjs` + `.github/workflows/alert-worker-incidents.yml` watch `MAINTENANCE_JOB_FAILED`, both backup-probe failures, and any uncaught Worker exception; a broken watcher is escalated, not reported as clean | 5 detector tests; 5 password-detector tests still pass after the shared-window refactor |
| C9 | Cutover gate logic was not covered by CI, so a parser change could turn a NO-GO into a quiet green run | `ci.yml` now unit-tests all five deployment-tooling suites (18 tests) | local run of the same command |
| C10 | `npm run lint:architecture-inventory` was red (`documented=162, source=164`) and would have blocked CI, and therefore any cutover | `docs/02_ARCHITECTURE.md` inventory synced to the real tree (common 34, landing 11, new `ui` 5) | `lint:architecture-inventory` now prints a verified inventory |

## 3. Open gates — live evidence required

| ID | Gate | Why it blocks | Evidence required | Owner |
| -- | ---- | ------------- | ------------------ | ----- |
| O1 | Release provenance | Cutover and the boundary proof both key on an exact SHA; the current tree is uncommitted and unpushed | Commit the tree, push, and let `ci.yml` and `deploy-production.yml` go green on that exact SHA | repo owner |
| O2 | Non-empty scheduled writers | Staging evidence covers a synthetic disposable database; an empty production queue cannot prove throughput, lease recovery, or retry behaviour for 9 job kinds | Run each job kind against production-shaped data and record processed counts, lease clears, and retry outcomes | operator with live DB |
| O3 | Real push delivery | Notification recovery evidence was captured with no provider configured (`PUSH_PROVIDER_NOT_CONFIGURED`). APNs/FCM/WebPush credentials being present is not delivery | One delivered notification per channel from a real device, with provider response ids | operator with provider accounts |
| O4 | PDF capacity | The only PDF measurement is 1 request at concurrency 1 (12.5 s, HTTP 200). Browser Run Free allows one new browser per 20 s per account | Concurrency and sustained-rate run showing queueing, 429 handling, and output parity | operator |
| O5 | Cloudflare Free quota headroom | Worker CPU, requests, and subrequest budgets are unmeasured for real traffic volume | 24 h of production-representative request volume plus the resulting quota read-out | operator |
| O6 | Custom domain and edge protection | Production currently hides a `workers.dev` host behind the Vercel proxy; no Worker-side WAF, rate limit, or custom hostname | Decision plus configuration for a custom hostname and edge rate limits | operator decision |
| O7 | Production backup + isolated restore | The drill is now a blocking cutover step but has never executed against the production bucket | One green `cutover-production.yml` open run, or the probe and drill executed manually with the same inputs | operator with R2 credentials |
| O8 | Rollback rehearsal | The redeploy step is new and unexercised | One `mode=rollback` run against staging-shaped values, or a live rehearsal before the window opens | operator |
| O9 | Stability window | No production traffic has ever been served by the Worker | Alert-driven watch with no `MAINTENANCE_JOB_FAILED`, no backup failure, and a rollback path still armed | operator |

## 4. Verification evidence for this pass

| Gate | Command | Result |
| ---- | ------- | ------ |
| Lint | `npm run lint` | pass |
| Architecture inventory | `npm run lint:architecture-inventory` | pass (`components:164`) |
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json`, `npx tsc --noEmit -p server/tsconfig.json` | pass |
| Build | `npm run build` | pass |
| Security-critical gate | `npm run test:security-critical` | 8 files / 88 tests pass |
| Server suite | `npx vitest run server --fileParallelism=false --testTimeout=15000` | 187 files / 1357 tests pass |
| Client suite | `npx vitest run src --fileParallelism=false --testTimeout=15000` | 434 files / 3263 tests pass; one server file (`transactionAuditSnapshots`) times out only in this combined run, passes alone in 2.8 s and in the server run — local CPU contention, not a regression |
| Deployment tooling | `node --test tools/cloudflare-free-feasibility/*.test.mjs` (5 suites) | 18 tests pass |
| Worker bundles | `wrangler deploy --dry-run` for production and staging configs | both build; 5 Durable Object bindings resolve |
| Migration guard | `node --import tsx server/src/scripts/applyProductionMigrations.ts` without env | refuses, as designed |

Caveat on the client-suite row: a second actor was editing the landing redesign in
this worktree while that run was in progress (`src/styles/design-system/25-landing.css`
at 18:51, `src/__tests__/designSystemCssGraph.test.ts` at 18:32). The run therefore
certifies the server and the cutover tooling, not a frozen final tree. The gates that
cover the concurrently edited files were re-run afterwards against the current state —
`lint:architecture-inventory` (components 164), `lint:ds` (0 anti-drift violations
across 188 TSX files), and `designSystemCssGraph` + `deploymentSecurityContract`
(20 tests) — all green. A moving worktree is itself a release-provenance blocker: O1
requires the exact committed SHA to be what CI verified.

## 5. Residual debt deliberately left

- Documentation still mentions `PASSWORD_CIPHER_KEY` in older ADR/audit notes; the
  code contract test is authoritative and docs need an owner decision.
- A deleted finance receipt can have its number reused; unrelated to the cutover but
  a real data-integrity edge.
- Backup fails closed when one archive blob is missing, which is safe but turns a
  partial-object problem into a whole-backup-set failure.
- `PdfJob` serialises launches on a durable 21 s timestamp, so PDF throughput is
  bounded by Browser Run Free by design; O4 measures that bound instead of hiding it.

## 6. Live execution runbook

Stop at the first failure. Do not improvise a step.

1. Land O1: commit and push the tree, wait for `ci.yml` green on that SHA.
2. Confirm the Worker is deployed closed on that same SHA and that
   `probe-production-readonly` passes.
3. Provision the 15 Worker secrets, including the 6 push-provider secrets, and
   re-run `put-production-secrets.mjs --check` until `ok:true`.
4. Satisfy O2–O6 and record the evidence next to this file.
5. Run `.github/workflows/migrate-production-database.yml` with
   `MIGRATION_APPROVED_SHA` equal to the deployed SHA, if the schema moved.
6. On the Render service set `CATEVIA_MAINTENANCE_OWNER=cloudflare`. This is a
   dashboard value; the workflow only verifies it.
7. Merge the config change to `CATEVIA_TRAFFIC_ENABLED=yes` and
   `CATEVIA_MAINTENANCE_OWNER=cloudflare`, and set the Production environment
   variable `CATEVIA_BACKEND_TARGET=worker`.
8. Run `cutover-production.yml` with `mode=open`, the reason, and the exact
   pre-cutover Worker and Render SHAs. The run performs the backup, restore drill,
   and single-writer proof before it touches Vercel.
9. Watch `alert-worker-incidents` and the boundary probe for the stability window.
10. If anything regresses: run `cutover-production.yml` with `mode=rollback`, then
    restore `CATEVIA_MAINTENANCE_OWNER=render` on Render. The Worker release is left
    untouched so a second attempt does not need a new build.
