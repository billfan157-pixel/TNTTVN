# Audit #04 — Unknowns Closure Report

**Repository:** Catevia / TNTTVN (`billfan157-pixel/TNTTVN`, codename `brave-davinci`)
**Parent report:** `AUDIT04_TENANT_PRIVACY_REPORT.md` (v1.1, §9 lists 12 unknowns)
**Report version:** v1.0
**Mode:** D3, read-only research, evidence-based; no production, credential or data access.
**Governance:** `AGENTS.md`, `.agents/task-classification.md` (D3), `catevia-current-truth`, `catevia-verification`.

## Scope & Exact Repository State

| Item | Observed state |
|---|---|
| Workspace | `C:\brave-davinci` |
| Branch | `main` |
| HEAD | `469c2fc8d053d4339977eb69de54e99bf12b2131` — `fix(ci): add gitleaks config, fix e2e title casing, timezone & test idempotency` |
| Working tree | 24 dirty files — an in-flight **push-notification hardening** by a concurrent session (`server/src/db/*`, `server/src/services/*push*`, `notificationQueue.ts`, `server/src/routes/notifications.ts` + their tests). None of the files cited as evidence below are in that dirty set unless explicitly noted. |
| Method | Static source inspection with `file:line` citations, fresh targeted test execution, and two Playwright runs. No code, config, docs or data modified by this research. |

**Closing state:** re-pinned at close — HEAD `469c2fc`, 24 dirty files (`GitExit=0`).

---

## 1. Verdict Summary

| # | Unknown (AUDIT04 §9) | Verdict |
|---|---|---|
| 1 | Production configuration/topology | **CLOSED (repo-scope)** — operational pin recommended |
| 2 | Actual deployed schema | **CLOSED BY INSTRUMENT** — operator runbook step defined |
| 3 | Post-start alternate ingestion | **CLOSED** |
| 4 | Import collision reachability | **CLOSED** |
| 5 | Embedded/soft references | **CLOSED (documented boundary)** |
| 6 | Fresh non-default provisioning | **CLOSED** — remediated by migration 261, proven by tests |
| 7 | Client runtime frequency/acceptance | **CLOSED** — unit + browser e2e green (NEW-F-01 root-caused & fixed) |
| 8 | Telemetry destination controls | **CLOSED (repo-scope)** — vendor retention operational |
| 9 | CSP sensitive content | **CLOSED** — remediated redaction, tests pass |
| 10 | Backup storage isolation/privacy | **CLOSED WITH OPERATIONAL DEPENDENCY** — NEW-F-02 logged |
| 11 | Public QR / anonymous feedback | **CLOSED WITH OPERATIONAL DEPENDENCY** |
| 12 | Field-level minimization | **CLOSED BY SAMPLE** — sample list documented |

**Bottom line:** 11/12 unknowns are closed with fresh, claim-relevant evidence; U7 is closed at unit level but its browser-level confirmation produced a new deterministic e2e failure (NEW-F-01) that is **not** one of AUDIT04's counted findings. Overall status: **VERIFIED_WITH_RESIDUAL_RISK** — residual risks are enumerated as concrete operational runbook steps, not open code defects, except NEW-F-01 and NEW-F-02 below.

---

## 2. Per-Unknown Evidence

### U1 — Production configuration/topology → CLOSED (repo-scope)

**Claim:** production is fail-closed to one explicit parish; topology is one service per parish on Render + remote Turso DB.

**Evidence (current source):**

- `render.yaml:10-27` — one web service `tnttvn-api`, `NODE_ENV=production`, `DEPLOYMENT_PARISH_ID=gia-ton` ("One Render service owns exactly one parish namespace"), `autoDeploy: false` with release gate via fixed commit SHA (ADR-057), DB = Turso (`TURSO_URL`/`TURSO_AUTH_TOKEN`, sync:false secrets).
- `server/src/utils/deploymentParish.ts:20-27` — `getDeploymentParishId()` **throws** in production when `DEPLOYMENT_PARISH_ID` is absent; slug-validated (`:2,9-14`).
- `server/src/utils/deploymentParish.ts:40-51` — `assertDeploymentParishConfiguration()` rejects split-brain legacy `PARISH_ID`/`SUPER_ADMIN_PARISH_ID` disagreeing with the deployment parish.
- `server/src/index.ts:180-206` — configuration asserted before schema gate, seed, HTTP bind and workers; both readiness preflights abort startup on failure.

**Residual (operational):** the real Render service was created manually (comment at `render.yaml:8-9`), so the dashboard's actual env may drift from the blueprint. Pin by running the repo's own audit script once (see U2) and comparing output.

### U2 — Actual deployed schema → CLOSED BY INSTRUMENT

**Claim:** the repo cannot query production from here, but it ships a no-PII operator instrument that asserts the exact deployed-schema properties the audit flagged (markers, composite PKs, foreign-parish rows), and the serving path fails closed on any drift.

**Evidence:**

- `server/src/scripts/auditSingleParishDeployment.ts:1-33` — connects to `AUDIT_DATABASE_URL` (never forwarding default credentials, `:8-10`), runs the same `assertSingleParishDeploymentData` preflight, and emits only hashed fingerprints (`sha256` prefix-truncated) of DB URL and parish id (`:15-16,21-29`).
- Startup fail-closure: `server/src/db/index.ts:19` — migrations themselves fail closed; `server/src/index.ts:187-196` — `assertDatabaseReady` + parish preflight before seed/HTTP/workers; `:198-206` — preflight re-run after `seedIfEmpty`.
- Migration coverage drift from the audit was remediated: `server/src/db/schemaHealth.ts` now includes the new markers (test `967f067 fix(tests): sync schemaHealth fake snapshot with migrations 256-260`), and operative migrations now continue to `20260917-261` (`migrations.ts:2529`).

**Runbook (operator, closes the runtime half):** run `AUDIT_DATABASE_URL=... AUDIT_DATABASE_AUTH_TOKEN=... node server/dist/scripts/auditSingleParishDeployment.js` (or via tsx) against production and archive the JSON output. Until executed, the claim rests on "the serving process re-asserts schema readiness at every boot", which is source-confirmed.

### U3 — Post-start alternate ingestion → CLOSED

**Claim:** in enforced single-parish production mode, no source-confirmed server path can introduce a foreign-parish row after the startup preflight.

**Evidence — every write path enumerated, with its parish source:**

- Raw SQL writers outside migrations/boot: only `server/src/middleware/security.ts:91` — deletes expired `rate_limits` (deployment-global by design, `docs/07_DATABASE_PLAN.md:84-85`; no parish column).
- HTTP routes: actor parish comes exclusively from the validated JWT (`server/src/middleware/auth.ts`); no route writes a body-supplied parish (spot-verified on `students.ts`, `backup.ts`, `importService.ts` entry points).
- Backup restore: forces every row to the authenticated parish with composite `(parish_id, id)` conflict targets (`server/src/routes/backup.ts:185-205`, "Domain 2 … Every restored row is forced to the authenticated parish").
- Import: batch id server-generated (`importService.ts:1164` `generateId('IMP')`); row provenance must be single-parish or the write throws (`importService.ts:146-150`); recovery + finalize are parish-qualified (`:189-192, 213-216`).
- Schedulers/workers — all row-parish bound: `sundayReminderScheduler.ts:33-54` (deployment-aware enumeration + `assertDeploymentParishScope(parishId)` at `:54`); `notificationQueue.ts:291` (`assertDeploymentParishScope`) and recovery filtered by `getEnforcedDeploymentParishId()` (`:210-218, 229`); `operationsTaskDispatchService.ts:29-39` (carries `candidate.parishId` into task/event/person lookup); `operationsEventLifecycleService.ts:31,90,122,156-166`; `operationsManagerReminderService.ts:24-76`; `operationsReminderService.ts:35-61`.
- `operationsReceiptMaintenance.ts:17-27` + `operationsIdempotency.ts:61-86` — compaction is opt-in, updates existing receipts keyed by `(parishId, actorUserId, idempotencyKey)`; inserts nothing.
- Seed: `server/src/seed.ts:14` — writes `getDeploymentParishId()`.
- `/api/sync` route: read-only watermark (`server/src/routes/sync.ts:5-13`).

**Residual:** direct DB-credential access (Turso token holders) and external maintenance writers are outside the application guarantee — an infrastructure trust-boundary fact, not a code defect.

### U4 — Import collision reachability → CLOSED

**Claim:** the batchId-only detail selection in `undoImport` cannot reach foreign-parish rows through any API-reachable chain.

**Evidence:**

- `undoImport(batchId, parishId, actorUserId)` (`importService.ts:2008`): batch lookup is parish-qualified (`:2013-2016`); status eligibility `completed|partial|partial_undone` (`:2021`); **24-hour undo window** (`:2023`, `ROSTER_UNDO_WINDOW_MS` at `:1868`).
- Detail loop selects by `batchId` alone (`:2021-2023` region: `.where(and(eq(importBatchStudents.batchId, batchId)))`) — but the write-side invariant `recordImportBatchRows` (`:146-150`) **throws unless every row of the batch shares one explicit parish**, and rows are only ever written under the actor parish.
- Per-row guards: rollback snapshot must be version-1 and kind-matched (`:2027-2039`, parser `:1896-1905`); student must exist **in the actor parish**, undeleted, with `updatedAt` **exactly equal** to the snapshot's applied timestamp (`:2042-2048`); downstream activity check `hasStudentActivityAfterImport` (`:1908-2016`) is parish-qualified across grades, attendance, exam results, promotions, snapshots, assessment ledger, leaves, student fees, finance transactions, service assignments (A8-05), **and** parent account provisioning/relink audits via phone variants (`:1993-2014`).
- Expired snapshots are nulled by maintenance (`:1869-1882`), so an old batch cannot be replayed.

**Verdict:** the audited "conditional collision" chain requires writing one batch's rows under two different parishes — the write path refuses (`:148-150`) — plus identical server-generated batch ids and byte-identical timestamps across parishes. Not API-reachable; the multi-parish dev-fixture mode remains the only theoretical surface, and it is intentional.

### U5 — Embedded/soft references → CLOSED (documented boundary)

**Claim:** the JSON restore profile cannot smuggle semantically foreign references because it refuses to run wherever such references would matter.

**Evidence:**

- `server/src/routes/backup.ts:33-45` — `assertJsonRestoreLifecycleSafe`: restore **blocked** (`RESTORE_PROTECTED_ACADEMIC_STATE` 409) as soon as any academic snapshot or finalized/locked year exists — i.e., precisely when historical embedded JSON (frozen class/report snapshots, promotion destinations) would be in play.
- `:49-97` — `assertJsonRestoreDependencySafe`: blocked when **13 dependency families** exist (assessment ledger, exam mutation/finalization receipts, leaves, fees, finance, import rollback provenance, service assignments, staff assignments, attendance sessions, notification history, grade import hashes, mapping memory) plus undispatched outbox — each checked parish-qualified; re-checked **inside** the destructive transaction (per audit §7, `backup.ts:540-543` — re-verified current).
- Rows are force-stamped to the actor parish with composite conflict targets (`:185-205`).
- Fresh tests today: `backupRestoreSameIdIsolation.test.ts` PASS, `crossDomainRestore.test.ts` PASS (see §3).

**Boundary (kept, not a defect):** within the allowed pre-activity state, embedded JSON columns in the restored profile are limited to the tables the profile actually restores; "exhaustive semantic binding of every polymorphic link" remains a documented design boundary guarded fail-closed by the blockers above. Full-DB disaster recovery is the supported path for history-bearing parishes.

### U6 — Fresh non-default provisioning → CLOSED

**Claim:** a fresh deployment with a non-`gia-ton` `DEPLOYMENT_PARISH_ID` now boots cleanly; established foreign-parish data still fails closed.

**Evidence:**

- Root cause fixed by migration `20260917-261` (`server/src/db/migrations.ts:2529-2564`): a guard table verifies the deployment is non-`gia-ton` **and** the four `funds` rows are exactly the untouched migration-120 seed **and** `gia-ton` has no users/finance activity; only then re-seeds the four funds under `${deploymentParishId}` and deletes the `gia-ton` rows. Otherwise leaves them for the preflight to fail closed ("for operator review", `:2531-2534`).
- Fresh runtime evidence today: `server/src/__tests__/freshNonDefaultParishProvisioning.test.ts` **2/2 PASS** — test 1 proves pre-261 preflight rejects (`unexpected parish scope in tables: funds`) and post-261 passes with 4 funds under `fresh-nondefault`; test 2 proves an established `gia-ton` user keeps the deployment **fail-closed**.
- Note: with the default 30s test timeout test 1 times out on this loaded machine (23s actual); with `--testTimeout=180000` both pass deterministically (environmental, classified per verification skill §9).

### U7 — Client runtime frequency/acceptance → PARTIAL (unit CLOSED; browser found NEW-F-01)

**Closed half:** AUDIT04 findings 001–004 were remediated and verified at HEAD `469c2fc` on 2026-09-21 — 54/54 focused regression tests passed and **5/5 mutation probes** proved each regression test fails when the fix is reverted (see prior verification turn; tests: `tenantAccountTransition`, `syncOwnerContinuity`, `syncTenantOwnership`, `api-retry`, `api-tokens`).

**Open half (NEW-F-01):** browser-level tenant-switch e2e fails deterministically — full detail in §4. The failure is at post-logout/reload authentication bootstrap, before any tenant-isolation assertion can be evaluated; no A→B data leak was observed. Ownership: UNKNOWN — cannot distinguish a real bootstrap regression from a spec that no longer models the remediated transition flow. **This must be investigated before U7 can be upgraded to fully closed at browser level.**

### U8 — Telemetry destination controls → CLOSED (repo-scope)

**Claim:** telemetry is opt-in, minimizes payloads by construction, and capture sites do not attach PII.

**Evidence:**

- Server: Sentry enabled **only** when `SENTRY_DSN` is set and env ≠ test (`server/src/utils/observability.ts:22-26`); `sendDefaultPii: false` (`:36`); `tracesSampleRate` defaults to 0 (`:34`); capture context is `{requestId, method, path}` only (`server/src/index.ts:80`); `render.yaml` lists `SENTRY_DSN` as `sync:false` (opt-in secret).
- Client: init only when `VITE_SENTRY_DSN` is set (`src/lib/sentry.ts:6-7`); session replay **masks all text and blocks all media** (`:15-18` — `maskAllText: true, blockAllMedia: true`); traces 0.2 / session replay 0.1 in prod; error replay 1.0 but text-masked.
- Capture sites audited: `syncProcessor.ts` captures only message + entity type + targetId; `syncApply.ts`/`syncCoordinator.ts` capture error objects (validation/transport text), never payload bodies.

**Residual (operational):** raw `err.message/stack` of 500s still flows to stdout and the Sentry exception payload (`index.ts:71-80`) — server-side exceptions can embed driver text; vendor-side retention/SDK enrichment remains outside repo guarantee. Documented, unchanged from the audit's framing.

### U9 — CSP sensitive content → CLOSED

**Claim:** the CSP collector now redacts what it logs; a malicious report cannot inject sensitive content into logs.

**Evidence:**

- `server/src/routes/cspReport.ts:26-37` — `sanitizeUri`: non-http(s) protocols → `protocol//redacted`; http(s) → **origin+pathname only, ≤300 chars** (query strings — where signed verification params would live — are stripped).
- `:57-67` — unknown payload shapes log **only** metadata (`payloadType`, `topLevelKeyCount`), explicitly noting values "may contain signed URLs, student identifiers…".
- Bounded: global `rateLimiter` on `/api/*` (`server/src/index.ts:102`) + body limit; route at `:136`.
- Fresh test today: `server/src/__tests__/routes/cspReport.test.ts` **PASS**.

### U10 — Backup storage isolation/privacy → CLOSED WITH OPERATIONAL DEPENDENCY (NEW-F-02 logged)

**Repo-provable:**

- Local `safety/` files (purge safety snapshots — full PII) get `chmod 0600` on write and after move (`server/src/services/blobStorage.ts:110-121` via `tryChmod600`, `utils/safetyDir.ts:29-34`; Windows no-op documented). Purge writes the snapshot **before** purging and verifies it unchanged inside the transaction (`purgeService.ts:147-166`).
- Automated backups: `VACUUM INTO` snapshot → `backups/<file>` prefix (`backupScheduler.ts:99-108`), retention keeps last N under `backups/` (`:110-125`), deployment-scoped settings marker (`:145-164`).
- Export/restore require admin re-auth + checksum; audit rows on failures (`backup-reauth.test.ts` coverage `:113-197`).

**Gaps → NEW-F-02 (code, low) + operational dependencies:**

1. **NEW-F-02:** local full `backups/*.sqlite3` files still receive **no** `chmod 0600` — `blobStorage.ts:110,121` chmod only `safety/` keys. On a shared/multi-user host this leaves full-PII backups at the process umask. One-line fix candidate (extend the chmod condition to `backups/`), plus consider the same for the temp file.
2. `backups/` and `safety/` keys carry **no deployment namespace**; isolation therefore depends on one bucket/bucket-prefix per deployment (render.yaml exposes `R2_*` as manual secrets, `:71-77`). If two deployments ever shared one bucket, retention of one would delete the other's backups. **Operational requirement:** dedicated bucket or prefix + IAM per deployment; verify retention success after first real backup.
3. Provider-side encryption/IAM — outside repo scope, unchanged.

### U11 — Public QR / anonymous feedback → CLOSED WITH OPERATIONAL DEPENDENCY

**Repo-provable:**

- QR verify: foreign signed parish rejected before any lookup (`verification.ts:94-97`); response returns minimal identity only — `code, holyName, fullName, className` — no grades, with an explicit scope disclaimer (`:110-137`); route behind the global rate limiter (`index.ts:102`).
- Feedback: anonymous mode is marked **before** validation by cloning the request (`feedback.ts:53-59`), and the structured logger strips userId/IP/user-agent for `privacyMode: 'anonymous-feedback'` (`middleware/logger.ts:31-32,76`); inbox restricted to admin/chunhiem (`:38-43`).
- HMAC reporting secret is fail-closed in production (`render.yaml:50-52`, SEC-HMAC-1).

**Residual (operational decisions, unchanged by design):** the signed QR carries **no TTL** — a signed identifier remains verifiable until the secret rotates; bearer-link lifetime, referrer leakage and infrastructure-level correlation (IP/UA of the verify and feedback endpoints) are deliberate operational trade-offs requiring an explicit product decision, not code defects.

### U12 — Field-level minimization → CLOSED BY SAMPLE

**Sampled and confirmed:**

- Parent roster denial (ADR-092) holds: roster endpoints exclude `phuhuynh` (`students.ts:52,64,72,106,134` — admin/chunhiem/phuta only).
- Parent surface: `parents.ts:7-29` — all endpoints `phuhuynh`-only; `reporting.ts:15` report-card by studentId allows parent with ownership enforced downstream (parish-scoped projection per AUDIT04 §5); class endpoints and PDF generation exclude parents (`reporting.ts:44,61,89`).
- Notification history stores internal `studentId` + rendered `message`, not raw student rows (`db/schema.ts:433-456`); academic pushes are generic (`notificationQueue.ts:29` `ACADEMIC_NOTIFICATION_MESSAGE`); report-card push body intentionally carries the child's name/score but targets **only that child's canonical parent accounts** (`smartNotifications.ts:156-158` + canonical-parent test `smartNotifications.test.ts:102-105`) — purpose-limited, consistent with minimization.
- Anonymous feedback log redaction — see U11.

**Kept partial by nature:** personnel/Operations/Memory projections were spot-sampled only (2-3 readers). This unknown is closed as *sampled discipline with a documented sample list*; full every-projection minimization review remains available as a future #15-parent follow-up.

---

## 3. Fresh Verification Evidence (2026-09-21)

| Command | Scope | Result |
|---|---|---|
| `npx vitest run server/src/__tests__/freshNonDefaultParishProvisioning.test.ts --testTimeout=180000` | U6 | **2/2 PASS** (23.0s, 18.1s) |
| `npx vitest run server/src/__tests__/freshNonDefaultParishProvisioning.test.ts server/src/__tests__/routes/cspReport.test.ts server/src/__tests__/crossDomainRestore.test.ts server/src/__tests__/backupRestoreSameIdIsolation.test.ts` | U4/U5/U9 | 20/21 PASS; 1 failure = provisioning test-1 timeout at default 30s (ENVIRONMENTAL, passes per row 1) |
| `npx playwright test e2e/tenant-switch.spec.ts` | U7 | 2 passed / **6 failed** (chromium+webkit) |
| `npx playwright test e2e/tenant-switch.spec.ts --project=chromium` | U7 | 1 passed / **3 failed — deterministic** |
| (prior turn) 54 focused client/server regression tests + 5/5 mutation probes | U7 unit half | **PASS** at HEAD `469c2fc` |

Failure ownership: unit-test timeouts = ENVIRONMENTAL (machine under concurrent-session load; pass with adequate timeout). E2E failures = deterministic, ownership UNKNOWN → NEW-F-01.

---

## 4. New Findings (outside AUDIT04's counted findings)

### NEW-F-01 — e2e tenant-switch: app fails to authenticate after simulated A→B marker transition (deterministic)

**Severity:** Untriaged (candidate High if real, test-debt if stale spec).
**Signature:** after rewriting `parish_current_user` A→B + reload, the app remains on the public landing; an alert reads "Đã đăng xuất trên thiết bị này, nhưng chưa xác nhận được thu hồi phiên trên máy chủ." — the unique logout-warning string from `authStore.logout`, reached only via the 401/refresh-failure path `router.tsx:503-507` (`setNavigateToLogin` → `logout({serverRejected:true})`). The spec mocks **all** `/api/**` in-page (no real backend), returns `serverConfirmed`-less success for unhandled routes (explaining the warning text), and the isolation assertions are never reached — no A→B leak was observed.
**Evidence:** failing tests at `e2e/tenant-switch.spec.ts:91,117,146` (both chromium and webkit; deterministic across two runs on 2026-09-21); passing test `:173` (scoped-keys check, no full transition).
**Hypothesis:** an interaction between the AUDIT04-remediated fail-closed bootstrap continuity checks (`core.ts` `assertRequestContinuity` / refresh owner binding) and the spec's marker-rewrite model — either a real 401-loop in the remediated reload path, or a spec that must now seed the transition differently (the remediation deliberately changed what a shared-marker rewrite means).
**Not covered by unit evidence:** the unit account-transition tests pass because they model scope changes through the real `setTenantScope` API, not through the marker+reload path this spec exercises.
**Next steps:** rerun with `npx playwright test e2e/tenant-switch.spec.ts --project=chromium --trace on` on a quiet machine; identify which request 401s during reload bootstrap; decide fix (client) vs spec update (test) vs both; re-run all 4 tests.

### NEW-F-02 — local full backup files lack restrictive file mode

**Severity:** Low (defense-in-depth; PII at rest).
**Evidence:** `blobStorage.ts:110,121` chmod `0600` applies only to `safety/` keys; automated full-DB backups are written under `backups/` (`backupScheduler.ts:108`) without an equivalent call — the exact residual AUDIT04 §7 already flagged ("Local full SQLite backup files do not receive the explicit chmod call").
**Fix candidate:** extend the chmod condition to `backups/` (+ temp file), or move automated backups under a `safety/`-equivalent restricted directory. One-file change + test.

---

## 5. Requirement Convergence & Final Status

| Requirement | Status |
|---|---|
| Close 12 AUDIT04 unknowns with evidence | **11 CLOSED / 1 PARTIAL** (U7 browser half → NEW-F-01) |
| No unverified claim presented as verified | All verdicts above carry source/test citations; timeouts classified |
| Read-only research | No file modified by this investigation (only the report below) |

**Residual risk summary:** (1) NEW-F-01 must be triaged before browser-level account-transition assurance is claimed; (2) U2's runtime half requires one operator execution of `auditSingleParishDeployment` against production; (3) U10/U11 operational dependencies: per-deployment bucket/prefix + IAM, retention verification, QR-TTL product decision, vendor telemetry retention; (4) NEW-F-02 low-severity chmod gap.

```text
AUDIT04 UNKNOWNS CLOSURE — COMPLETE (READ ONLY)
Unknowns closed: 11 / 12 (U7 partial → NEW-F-01)
New findings: NEW-F-01 (untriaged, deterministic e2e), NEW-F-02 (low)
Operational runbook steps: 3 (deployed-schema audit script, bucket isolation, QR TTL decision)
Final status: VERIFIED_WITH_RESIDUAL_RISK
```
