# Master Execution Plan

> Status: All 9 phases completed. This file now serves as a historical reference for what was done.
> Version: 1.1 | Last reviewed: 2026-07-25 | Status: ✅ Current | Prerequisites: 01

## Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | Phase 1 — Critical |
| 🟡 | Phase 2 — Security |
| 🔵 | Phase 3 — Database |
| 🟢 | Phase 4 — Architecture |
| 🟣 | Phase 5 — Frontend |
| 🟠 | Phase 6 — Backend |
| ⚪ | Phase 7 — Testing |
| 🟤 | Phase 8 — Deployment |
| 🔲 | Phase 9 — Diagnostics |
| ⚡ | Quick Win (<30 min) |

## Completed Phases

All 9 phases have been executed. Key outcomes per phase:

### ✅ Phase 1 — Critical Bugs
- gradeStore upsert: code already correct (no-op)
- Notification routes: auth middleware added
- StudentsPage report cards: Bearer token added
- Seed logging: per-table record counts added
- roleMiddleware warning: no-op (no imports existed)

### ✅ Phase 2 — Security
- RBAC enforced on all routes via `roleMiddleware`
- Class-scoped access via `checkUserClassAccess()`
- Body size limit (10MB)
- Zod string refinements (trim, max length, phone format)
- IP + user_agent in audit logs

### ✅ Phase 3 — Database + Frontend Features
- 15 tables created (8 new: branches, academic_years, classes, system_settings, catechist_assignments, permissions, role_permissions, push_subscriptions)
- 6 existing tables altered (added columns: deletedAt, version, ip, user_agent, status, tokenVersion, failedAttempts, lastLoginAt, lockedUntil, mustChangePassword)
- Existing data migrated
- 3 unique indexes defined (10 more planned — see `07_DATABASE_PLAN.md`)
- IAM UI (UserManagementPage) routed at `/users`
- Excel roster import with loading + error handling
- 3 PDF report types
- 1-click backup/restore via Dexie

### ✅ Phase 4 — Architecture
- Unified response helpers (`successResponse`, `listResponse`, `errorResponse`)
- Service layer extracted (studentService, gradeService, attendanceService, noticeService, userService)
- Normalized ID generator (`generateId` with crypto.randomUUID)
- DeltaSync end-to-end (client passes `updatedAfter`, server filters)
- Rebuilt `useSyncEngine`

### ✅ Phase 5 — Frontend
- LoginPage with validation, loading state
- Auth guard on 11 protected routes
- 401 global redirect in api.ts
- User badge + logout in HeaderBar
- Store API integration with offline fallback (fetchGrades, fetchAttendance, fetchNotices, fetchStudents)
- Mock data defaults replaced with `[]`

### ✅ Phase 6 — Backend IAM
- User CRUD API (`/api/users` — GET/POST/PUT, status, reset-password, force-logout, assignments)
- Change-password endpoint
- TokenVersion-based force logout
- Account auto-lockout (5 failed attempts)
- Notification persistence (DB queue)
- Student soft delete

### ✅ Phase 7 — Testing
- Coverage configuration (v8, thresholds 40/30/45/40)
- 12 server test files (routes + services + middleware)
- 9 client test files (components + stores + utils + sync)
- 11+ E2E tests (login, CRUD, role-scoped)

### ✅ Phase 8 — Deployment
- Dockerfile (multi-stage, node:22-alpine, crond for backups)
- Dockerfile.web (multi-stage, nginx:1.27-alpine)
- docker-compose.yml (app + web services)
- nginx.conf (gzip, CSP, API proxy, SPA fallback)
- scripts/backup-db.js (daily backup, keep last 5)
- scripts/entrypoint.sh (cron + startup backup)
- .dockerignore, railway.json
- Server HOST env support, CLIENT_ORIGIN env for CORS

### ✅ Phase 9 — Diagnostics
- SystemDiagnosticsModal (real-time metrics)
- HeaderBar trigger button
- Accessibility + error states
- Effect cleanup (cancelledRef)

---

## Remaining / Not Implemented

| Item | Phase | Reason |
|------|-------|--------|
| `POST /api/auth/logout` | 6 | Low priority — refresh token expiry sufficient |
| `POST /api/auth/reset-password` | 6 | Admin can set status to FORCE_PASSWORD_CHANGE via User API |
| Class-level data isolation (phuta/phuhuynh) | 5 | Server-side checkUserClassAccess enforces it; UI could filter more aggressively |
| RS256 JWT | 6 | Not needed at current scale |
| Persistent rate limiting (DB-backed) | 2 | Acceptable for single-parish scale |
| Server CI/CD | 8 | Only GitHub Actions build check |
| Excel import backend route | 3 | Frontend UI exists (ExcelImportModal); backend route not wired |

---

## Deployment & Operations

### CI/CD (Current)
```
GitHub Actions on push/PR to master:
  Job frontend: oxlint → tsc -b → vitest → vite build → playwright test
  Job server:   npm ci → tsc --noEmit
```

### Docker (Current)
**docker-compose.yml** — 2 services:
- `app`: multi-stage build (node:22-alpine), @libsql/client + crond for daily backup, named volumes
- `web`: multi-stage build (nginx:1.27-alpine), frontend built inside Docker, SPA routing + API proxy

### Environment Variables
| Variable | Required | Description |
|----------|:--------:|-------------|
| `JWT_SECRET` | ✅ Yes | Secret for token signing |
| `TELEGRAM_BOT_TOKEN` | ❌ | Telegram bot token |
| `TELEGRAM_ADMIN_CHAT_ID` | ❌ | Admin chat for alerts |
| `VAPID_PUBLIC_KEY` | ❌ | Web Push public key |
| `VAPID_PRIVATE_KEY` | ❌ | Web Push private key |
| `VITE_SENTRY_DSN` | ❌ | Sentry project DSN |

### Backup Scope
| Asset | Strategy |
|-------|----------|
| Database (SQLite) | JSON dump + SQLite file copy |
| Avatar images | ZIP archive per backup |
| System settings | Included in JSON dump |

---

## Performance, Security & Monitoring

### Performance Budgets
| Metric | Target | Current |
|--------|--------|---------|
| JS Bundle (gzip) | < 350 KB | ~333 KB |
| CSS Bundle (gzip) | < 15 KB | ~9.8 KB |
| Grade Matrix (200 students) | < 200ms | — |

### Security Headers
`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`

### Rate Limiting
| Scope | Limit | Window |
|-------|-------|--------|
| General API | 30 requests | 60s |
| Auth Login | 10 requests | 60s |

### Monitoring
| Tool | Purpose |
|------|---------|
| Sentry | Error tracking + performance (tracesSampleRate: 0.2) |
| Health check | `GET /health` — DB connectivity (mounted at root, not under /api/) |
| Audit log | All CRUD with userId + timestamp |

### Retention Policy
| Data Type | Retention |
|-----------|-----------|
| Sentry errors | 90 days |
| Audit logs | 3 years |
| Sync queue (completed) | 30 days |
| Backup files | Keep last 5 |
