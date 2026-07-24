# Changelog

## Phase 8 — Deployment (Week 8)

### Added
- `Dockerfile` — multi-stage build (node:22-alpine) for server + frontend, crond for backups
- `Dockerfile.web` — multi-stage build building frontend into nginx (no host dist dependency)
- `nginx.conf` — gzip, CSP security headers, SPA fallback, API proxy to app backend
- `scripts/backup-db.js` — SQLite backup with readFileSync+writeFileSync safe copy, keep last 5
- `scripts/entrypoint.sh` — Docker entrypoint: persist env vars for cron, start crond, run startup backup, exec node server
- `.dockerignore` — exclude node_modules, dist, coverage, .git, data, backups

### Changed
- `docker-compose.yml` — 2 services: `app` (node:22-alpine + crond + named volumes) + `web` (nginx:1.27-alpine, frontend built in Docker)
- `server/src/index.ts` — `HOST` env support, `CLIENT_ORIGIN` env for dynamic CORS
- `server/tsconfig.json` — `noEmit: false`, `outDir: dist` for server compilation
- `package.json` — added `build:server` script
- `scripts/backup-db.js` — env var paths (`BACKUP_DIR`, `DB_PATH`) for Docker

### Fixed (Phase 8 review)
- Server dist not built for Docker (noEmit→false + build:server script)
- Frontend assets not served (Dockerfile.web + nginx service)
- JWT_SECRET hard-coded (env var fallback)
- CORS hard-coded localhost (CLIENT_ORIGIN env)
- SQLite backup unsafe copy (readFileSync+writeFileSync)
- Backup paths wrong in Docker (env var override)
- Node 24→22 LTS (stable)
- Host bind mount → named volumes
- Missing .dockerignore (build bloat)
- Missing cron schedule (crond in entrypoint)
- nginx.conf unused (web service build)
- HOST not bound to 0.0.0.0 (hostname option)

## Phase 7 — Testing & Polish (Week 6-7)

### Added
- Coverage configuration (v8 provider, thresholds 40/30/45/40)
- Server auth middleware tests (`auth-middleware.test.ts` — 3 tests)
- Server route tests (`auth-routes.test.ts` + `users-routes.test.ts` — 4 tests)
- Zustand store unit tests (`zustandStores.test.ts` — 5 tests)
- Component tests (`StudentModal.test.tsx` + `HeaderBar.test.tsx` — 8 tests)
- E2E test pages (`login.spec.ts`, `crud.spec.ts`, `roles.spec.ts` — 11 tests)

### Fixed
- `coverage/` added to `.gitignore` and untracked from git
- E2E login test made resilient (no backend dependency)

## Phase 6 — Backend IAM (Week 5)

### Added
- User CRUD API (`/api/users` — GET/POST/PUT, status, reset-password, force-logout)
- Change-password endpoint (`POST /auth/change-password`)
- TokenVersion-based force logout (validated against DB in authMiddleware)
- Account auto-lockout (5 failed attempts → LOCKED status)
- Notification persistence (enqueue writes to `notifications` table, sentAt tracking)
- Student soft delete (`deletedAt` filter, SOFT_DELETE audit action)

### Fixed
- authMiddleware now checks tokenVersion against DB on every request
- bcrypt.hashSync → bcrypt.hash (async, non-blocking)
- Admin cannot lock own account
- Notification queue persists to DB (no in-memory loss on restart)

## Phase 5 — Frontend (Week 4-5)

### Added
- LoginPage with validation, loading state, Sentry error tracking
- Auth guard (`beforeLoad: requireAuth`) on 7 protected routes
- 401 global redirect in api.ts (on refresh failure → /login)
- User badge + logout in HeaderBar
- Class switcher dropdown in HeaderBar
- `fetchGrades`/`fetchAttendance`/`fetchNotices` to all stores
- Store API integration with offline fallback
- Mock data defaults replaced with `[]`
- Sample credentials hidden in production

## Phase 4 — Architecture (Week 3-4)

### Added
- Unified response helpers (`successResponse`, `listResponse`, `errorResponse`)
- Service layer (studentService, gradeService, attendanceService, noticeService)
- Normalized ID generator (`generateId` with crypto.randomUUID)
- DeltaSync end-to-end (client passes `updatedAfter`, server filters with `gte`)
- Rebuilt `useSyncEngine` with `runSyncFlow` + online/offline listeners

## Prior Phases

### Changed
- Restructured `docs/` from 10 planning files to 12 canonical files
- Merged tech debt and quick wins into project audit
- Merged data flow into architecture doc
- Merged `MASTER_DEVELOPMENT_PLAN.md` (root) → `10_MASTER_EXECUTION_PLAN.md`
- Renamed files to numbered prefix for ordered navigation
- Phase 1-3: Critical bugs, security (RBAC, body limit, Zod, audit IP/UA), database (13 tables, IAM/PDF/backup frontend features)

### Removed
- Outdated `DESIGN_SYSTEM.md`, `DESIGN_TOKENS.md`
- Aspirational `03_REFACTOR_PLAN.md`
- `MASTER_DEVELOPMENT_PLAN.md` (merged into `10_MASTER_EXECUTION_PLAN.md`)
- `MASTER_PLAN.md` (v4.0, historical)
- Old UI docs (8 files)
