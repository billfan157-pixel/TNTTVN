# Master Execution Plan

> Single source of truth — merged from MASTER_DEVELOPMENT_PLAN.md (v14.1) + docs/10_MASTER_EXECUTION_PLAN.md.

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
| ⚡ | Quick Win (<30 min) |

---

## Dependency Graph

```
Phase 1 (Critical Bugs)
  │
  ├──→ Phase 2 (Security) ──→ Phase 3 (Database)
  │                                │
  │                                ↓
  │                          Phase 4 (Architecture)
  │                                │
  │                    ┌───────────┴───────────┐
  │                    ↓                       ↓
  │              Phase 5 (Frontend)     Phase 6 (Backend)
  │                    │                       │
  │                    └───────────┬───────────┘
  │                                ↓
  │                          Phase 7 (Testing)
  │                                │
  │                                ↓
  │                          Phase 8 (Deployment)
  │
  └──→ Quick Wins (interspersed)
```

---

## Product Vision & Business Workflows

### Academic Year Lifecycle
```
1. Open New Academic Year → 2. Configure Branches & Classes
→ 3. Assign Catechists → 4. Import Roster from Excel
→ 5. Weekly Attendance & Mass → 6. Enter Scores
→ 7. Automatic Grade Calculation → 8. Promotion Wizard
→ 9. Lock Academic Year & Print Reports
```

### Role Flows

| Role | Scope |
|------|-------|
| **admin** | Full access: create users, classes, backup, all data |
| **chunhiem** | Own class: attendance, grades, reports, promote students |
| **phuta** | Assigned class only: take attendance, enter scores |
| **phuhuynh** | Own children only: view attendance, grades, reports |

### Multi-Class Catechist Assignment

A GLV can be assigned multiple classes with different roles via `catechist_assignments`:
```
GLV Nguyễn Văn A
├── Chủ nhiệm: Lớp Chiên Con 3
└── Phụ tá: Lớp Thiếu Nhi 2
```
- First assigned class = default on login
- Class switcher dropdown in HeaderBar
- Permissions scoped per class via `roleInClass`

### Student Status State Machine
```
Đang học ↔ Tạm vắng → Nghỉ học (soft delete) → Archived (3 years)
```

---

## 🔴 Phase 1 — Critical Bugs (Week 1)

### Task 1.1 — Fix gradeStore upsert sync (⚡ Quick Win)
- **Files**: `src/stores/gradeStore.ts:35-39`
- **Description**: ~~Add sync call in update branch~~ → **Verified: code already syncs for both branches. No fix needed.**
- **Effort**: 0 (no-op)
- **Verification**: Confirm `syncUpsertGrade` called on both create and update paths
- **Rollback**: N/A

### Task 1.2 — Add auth to notification routes (⚡ Quick Win)
- **Files**: `server/src/routes/notifications.ts:20`
- **Description**: Add `notificationsRouter.use('*', authMiddleware)`
- **Effort**: 5 min
- **Verification**: All notification endpoints return 401 without JWT
- **Rollback**: Remove the middleware line

### Task 1.3 — Fix StudentsPage report cards fetch (⚡ Quick Win)
- **Files**: `src/pages/StudentsPage.tsx:43`
- **Description**: Add Bearer token from localStorage to report cards fetch
- **Effort**: 10 min
- **Verification**: Report cards send button works end-to-end
- **Rollback**: Restore old fetch call

### Task 1.4 — Add seed logging (⚡ Quick Win)
- **Files**: `server/src/seed.ts`
- **Description**: Add per-table summary logs when `onConflictDoNothing` skips records
- **Effort**: 5 min
- **Verification**: Seed script shows record count per table
- **Rollback**: Remove added log lines

### Task 1.5 — Remove unused roleMiddleware import warning (⚡ Quick Win)
- **Files**: All route files importing roleMiddleware
- **Description**: ~~Remove or apply~~ → **No imports exist. Function is exported for Phase 2 use. No-op.**
- **Effort**: 0 (no-op)

### Deliverables
- [x] Bug #1 assessed: code already correct
- [x] Bug #4 fixed: notification routes require auth
- [x] Bug #5 mitigated: StudentsPage sends auth header
- [x] Seed script shows record counts
- [x] Zero lint warnings (none existed)

---

## 🟡 Phase 2 — Security (Week 1-2)

### Task 2.1 — Apply roleMiddleware to all routes
- **Files**: `server/src/routes/students.ts`, `grades.ts`, `attendance.ts`, `notices.ts`, `notifications.ts`
- **Description**: Apply RBAC per permission matrix in `08_SECURITY_PLAN.md`. Admin: full. Chunhiem: own class CRUD. Phuta: own class read+write attendance. Phuhuynh: read-only own children.
- **Effort**: 2h
- **Risk**: Medium — must test every role × endpoint combination

### Task 2.2 — Add body size limit (⚡ Quick Win)
- **Files**: `server/src/index.ts`
- **Description**: Add Hono body limit middleware (10MB)
- **Effort**: 5 min
- **Verification**: Request > 10MB rejected with 413

### Task 2.3 — Add Zod string refinements (⚡ Quick Win)
- **Files**: All route files with Zod schemas
- **Description**: Add `.trim()`, max length, phone format validators
- **Effort**: 15 min
- **Verification**: Invalid inputs rejected at validation layer

### Task 2.4 — Add IP + user_agent to audit logs
- **Files**: `server/src/db/schema.ts`, all route handlers
- **Description**: Add columns; populate from request headers
- **Effort**: 1h
- **Risk**: Low (additive)

### Permission Matrix (Reference)

| Action | admin | chunhiem | phuta | phuhuynh |
|--------|-------|----------|-------|----------|
| Tạo/Khóa User | ✅ | ❌ | ❌ | ❌ |
| Reset Password GLV | ✅ | ✅ | ❌ | ❌ |
| Phân Công Lớp | ✅ | ✅ | ❌ | ❌ |
| Thêm/Sửa Thiếu Nhi | ✅ | ✅ | 👁️ Own Class | ❌ |
| Xóa Thiếu Nhi | ✅ | ❌ | ❌ | ❌ |
| Sửa Điểm | ✅ | ✅ | ✏️ Own Class | ❌ |
| Điểm Danh | ✅ | ✅ | ✏️ Own Class | ❌ |
| Xuất PDF | ✅ All | ✅ All | 📄 Own Class | 📄 Own Child |
| Backup/Restore | ✅ | ❌ | ❌ | ❌ |

### Deliverables
- [x] RBAC enforced on all endpoints per matrix
- [x] Body limited to 10MB
- [x] All string inputs trimmed and validated
- [x] Audit logs capture IP + user agent

---

## 🔵 Phase 3 — Database (Week 2-3)

### Task 3.1 — Backup existing database
- **File**: Manual operation
- **Description**: Export JSON snapshot + copy `parish.db` before any schema changes
- **Effort**: 10 min

### Task 3.2 — Create `branches` table + seed
- **Files**: `server/src/db/schema.ts`, `server/src/seed.ts`
- **Description**: 5 branches (CC, AU, TN, NS, HS) with scarf_color, age_min, age_max
- **Effort**: 30 min

### Task 3.3 — Create `academic_years` table + seed
- **Files**: `server/src/db/schema.ts`, `server/src/seed.ts`
- **Description**: Seed with 2025-2026, `is_locked` flag
- **Effort**: 30 min

### Task 3.4 — Create `classes` table + seed + data migration
- **Files**: `server/src/db/schema.ts`, `server/src/seed.ts`
- **Description**: 8 classes from MOCK_CLASSES. Create FKs, migrate `students.classId` references
- **Effort**: 1h
- **Risk**: High — existing classId values must map correctly

### Task 3.5 — ALTER existing tables
- **Files**: `server/src/db/schema.ts`
- **Description**: Add `deletedAt`→students, `version`→grades+attendance, `ip`+`user_agent`→audit_logs, `status`+`tokenVersion`+`failedAttempts`+`lastLoginAt`→users
- **Effort**: 1h
- **Risk**: Medium — handle existing rows with defaults

### Task 3.6 — Create `system_settings` table + seed
- **Description**: 4 defaults: min_attendance_pct(70), passing_score(5.0), academic_year_start_month(8), grade_max_score(10)
- **Effort**: 30 min

### Task 3.7 — Create `catechist_assignments` table
- **Description**: Junction: user_id, class_id, role_in_class (chunhiem/phuta)
- **Effort**: 20 min

### Task 3.8 — Create `notifications` history table
- **Description**: Link to students + users, track send/fail/retry per channel
- **Effort**: 20 min

### Task 3.9 — Create `permissions` + `role_permissions` tables
- **Description**: Schema-only, seed 4 roles → all permissions. Frontend still checks `user.role`
- **Effort**: 30 min

### Task 3.10 — Add new indexes
- **Files**: `server/src/db/index.ts`
- **Description**: 9 new indexes per `07_DATABASE_PLAN.md`
- **Effort**: 20 min

### Task 3.11 — Verify data integrity
- **Description**: Health check queries: FK integrity, no orphaned records
- **Effort**: 30 min

### Task 3.12 — Frontend features (parallel track)
- **Files**: UserManagementPage, ExcelImportModal, PrintReportModal, BackupRestoreModal, pdfGenerator, excelParser
- **Description**: IAM UI (create/disable/reset users), Excel roster import, 3 PDF report types (class gradebook, student report card, sacrament certificate), 1-click JSON backup/restore via Dexie
- **Effort**: ~12h

### Deliverables
- [x] All 13 tables created (7 new + 6 existing altered)
- [x] Existing data migrated successfully
- [x] FK constraints verified (ON DELETE RESTRICT)
- [x] 16 indexes created
- [x] Backup confirmed restorable
- [x] IAM UI (UserManagementPage) routed at `/users`
- [x] Excel roster import with loading + error handling
- [x] 3 PDF report types with popup-blocker fallback
- [x] 1-click backup/restore via Dexie IndexedDB

---

## 🟢 Phase 4 — Architecture (Week 3-4)

### Task 4.1 — Create unified response helpers
- **Files**: `server/src/utils/response.ts` (new)
- **Description**: `success(data)`, `error(code, message, details)`, `list(data, total)`
- **Effort**: 30 min

### Task 4.2 — Apply response convention to all routes
- **Files**: All route files
- **Description**: Replace `c.json(data)` with response helpers
- **Effort**: 1h
- **Risk**: Medium — client may expect specific response shapes

### Task 4.3 — Fix deltaSync (phase 1: remove dead variable)
- **Files**: `src/lib/syncProcessor.ts:105-121`
- **Description**: Remove unused `qs` variable (backend `updatedAfter` support added first)
- **Effort**: 1 min

### Task 4.4 — Add `updatedAfter` support to backend
- **Files**: All server route files
- **Description**: Accept `updatedAfter` query param, filter results server-side
- **Effort**: 1h
- **Risk**: Medium — date parsing, ISO format

### Task 4.5 — Fix deltaSync client to pass `updatedAfter`
- **Files**: `src/lib/syncProcessor.ts`
- **Description**: Pass computed `qs` to API fetch params in all case branches
- **Effort**: 15 min

### Task 4.6 — Extract service layer on backend
- **Files**: `server/src/services/studentService.ts`, `gradeService.ts`, `attendanceService.ts`, `noticeService.ts` (new)
- **Description**: Move business logic out of route handlers
- **Effort**: 4h
- **Risk**: High — behavior-preserving refactor

### Task 4.7 — Normalize ID generation (⚡ Quick Win)
- **Files**: Multiple
- **Description**: Create shared `generateId(prefix)` utility; replace inline `Date.now()+Math.random()`
- **Effort**: 20 min

### Deliverables
- [x] All routes return `{ success, data }` / `{ success, error }`
- [x] Delta sync working end-to-end
- [x] Route handlers < 20 lines each
- [x] Consistent ID format across codebase

---

## 🟣 Phase 5 — Frontend (Week 4-5)

### Task 5.1 — Build LoginPage
- **Files**: `src/pages/LoginPage.tsx` (new)
- **Description**: Login form, error display, loading, redirect
- **Effort**: 2h

### Task 5.2 — Add auth guard to router
- **Files**: `src/router.tsx`
- **Description**: Redirect to `/login` if token missing/expired
- **Effort**: 1h
- **Risk**: High — affects all routes

### Task 5.3 — Handle 401 globally in api.ts
- **Files**: `src/lib/api.ts`
- **Description**: On 401 after refresh failure, redirect to `/login`
- **Effort**: 30 min

### Task 5.4 — Add user menu in HeaderBar
- **Files**: `src/components/common/HeaderBar.tsx`
- **Description**: User name + role + logout button
- **Effort**: 30 min

### Task 5.5 — Add class switcher dropdown (MDP Phase 2)
- **Files**: `src/components/common/HeaderBar.tsx`
- **Description**: If user has multiple class assignments, show dropdown to switch scoped view
- **Effort**: 1h

### Task 5.6 — Connect stores to REST API
- **Files**: `src/stores/studentStore.ts`, `gradeStore.ts`, `attendanceStore.ts`, `noticeStore.ts`
- **Description**: Add `fetchXxx()` actions calling API; fall back to Dexie on failure
- **Effort**: 3h
- **Risk**: Medium — maintain offline capability

### Task 5.7 — Deprecate mock data as default
- **Files**: `src/data/mockParishData.ts`, `src/stores/resetStores.ts`
- **Description**: Remove mock defaults; set initial data to `[]` or load from API
- **Effort**: 1h
- **Risk**: Medium — pages must handle empty state

### Task 5.8 — Build User Management UI (MDP Phase 2)
- **Files**: `src/pages/UsersPage.tsx` (new)
- **Description**: User table, create modal, lock/unlock, reset password
- **Effort**: 3h

### Task 5.9 — Build Class Assignment UI (MDP Phase 2)
- **Files**: Integrate into UsersPage or as separate section
- **Description**: Select which classes a GLV is assigned to with role per class
- **Effort**: 2h

### Task 5.10 — Build Excel Roster Import (MDP Phase 2)
- **Files**: `src/components/common/ExcelImportModal.tsx` (new)
- **Description**: Parse `.xlsx`, validate rows with Zod, bulk insert
- **Effort**: 4h

### Task 5.11 — Clean up ConfirmDialog / NotificationPrompt (⚡ Quick Win)
- **Files**: `src/components/common/ConfirmDialog.tsx`, `NotificationPrompt.tsx`
- **Description**: Remove if unused; verify integration if used
- **Effort**: 15 min

### Task 5.12 — Add `type="button"` to non-submit buttons (⚡ Quick Win)
- **Files**: Various component files
- **Description**: Prevent accidental form submissions
- **Effort**: 10 min

### Deliverables
- [x] Login page at `/login` with auth guard
- [x] User menu in HeaderBar with class switcher
- [x] User Management UI (table + create + lock/unlock)
- [x] Class Assignment UI
- [x] Excel Import Modal
- [x] Stores fetch from API with offline fallback
- [x] Mock data removed as default
- [x] All pages handle loading + error states

---

## 🟠 Phase 6 — Backend IAM (Week 5-6)

### Task 6.1 — Verify users table columns
- **Verify**: status, tokenVersion, failedAttempts, lastLoginAt exist (added in Phase 3)

### Task 6.2 — Build User Management API
- **Files**: `server/src/routes/users.ts` (new), `server/src/services/userService.ts` (new)
- **Endpoints**: GET/POST/PUT users, PUT users/:id/status, POST users/:id/force-logout
- **Effort**: 4h

### Task 6.3 — Add change-password endpoint
- **Files**: `server/src/routes/auth.ts`
- **Description**: `POST /api/auth/change-password` with current password validation
- **Effort**: 1h

### Task 6.4 — Add reset-password endpoint
- **Files**: `server/src/routes/users.ts`
- **Description**: Admin generates temp password for user; status → `FORCE_PASSWORD_CHANGE`
- **Effort**: 1h

### Task 6.5 — Add force logout (tokenVersion)
- **Files**: `server/src/middleware/auth.ts`
- **Description**: Include `tokenVersion` in JWT; validate against DB on each request
- **Effort**: 1h
- **Risk**: Medium — affects all authenticated requests

### Task 6.6 — Account lockout logic
- **Files**: `server/src/routes/auth.ts`
- **Description**: Increment `failedAttempts` on failure; auto-lock at 5; reset on success
- **Effort**: 1h

### Task 6.7 — Persist notification queue to DB
- **Files**: `server/src/services/notificationQueue.ts`
- **Description**: Store pending notifications in `notifications` table instead of in-memory
- **Effort**: 2h

### Task 6.8 — Wire notifications to history table
- **Files**: `server/src/services/smartNotifications.ts`
- **Description**: On send/fail, write record to `notifications` table
- **Effort**: 1h

### Task 6.9 — Implement soft delete for students
- **Files**: `server/src/routes/students.ts`
- **Description**: Filter `deletedAt IS NULL`; set `deletedAt` instead of hard delete
- **Effort**: 1h

### Deliverables
- [x] User CRUD API working (admin only)
- [x] Password change + reset endpoints
- [x] Force logout by tokenVersion increment
- [x] Account auto-lock after 5 failed attempts
- [x] Notification persistence (no data loss on restart)
- [x] Soft delete for students

---

## ⚪ Phase 7 — Testing & Polish (Week 6-7)

### Task 7.1 — Add coverage configuration
- **Files**: `vitest.config.ts`
- **Description**: `@vitest/coverage-v8`, thresholds 40/30/45/40
- **Effort**: 30 min

### Task 7.2 — Backend route tests
- **Files**: `server/src/__tests__/` — 5 new test files
- **Description**: Test each route handler with mocked DB
- **Effort**: 6h

### Task 7.3 — Backend middleware tests
- **Files**: `server/src/__tests__/auth-middleware.test.ts`, `security-middleware.test.ts`
- **Description**: Test auth, RBAC, rate limiter, security headers
- **Effort**: 3h

### Task 7.4 — Component tests
- **Files**: `src/__tests__/components/*.test.tsx`
- **Description**: StudentModal, DesktopGradeMatrix, HeaderBar
- **Effort**: 4h

### Task 7.5 — Additional store tests
- **File**: `src/__tests__/stores/gradeStore.test.ts`
- **Description**: Upsert with sync, batch save, average calculation
- **Effort**: 2h

### Task 7.6 — E2E: Login + auth guard
- **File**: `e2e/login.spec.ts` (new)
- **Effort**: 2h

### Task 7.7 — E2E: CRUD flows
- **File**: `e2e/crud.spec.ts` (new)
- **Effort**: 3h

### Task 7.8 — E2E: Role-scoped flows
- **File**: `e2e/roles.spec.ts` (new)
- **Effort**: 2h

### Task 7.9 — PDF Print Engine (MDP Phase 3 — optional fork)
- **Description**: `@react-pdf/renderer` for Sổ Điểm Lớp & Phiếu Điểm
- **Effort**: 8h
- **Note**: Only if report printing is a priority. Otherwise, defer.

### Task 7.10 — 1-Click Backup & Restore (MDP Phase 3 — optional fork)
- **Description**: `.zip` export (JSON + assets) + restore in Settings
- **Effort**: 4h

### Task 7.11 — Regression: Run all tests
- **Command**: `npm test && npm run test:e2e`
- **Effort**: 30 min

### Deliverables
- [x] Coverage reporting configured
- [x] Server test suite: 30+ tests
- [x] Component tests: 10+ tests
- [x] E2E: 15+ tests covering critical paths
- [x] (Optional) PDF export working
- [x] (Optional) 1-Click Backup & Restore

---

## 🟤 Phase 8 — Deployment (Week 8)

### Task 8.1 — Dockerize production stack
- **Files**: `Dockerfile`, `Dockerfile.web`, `docker-compose.yml`
- **Description**: Multi-stage Dockerfile (node:22-alpine) builds server + frontend; Dockerfile.web builds frontend into nginx image; docker-compose.yml orchestrates app + web services with named volumes, healthcheck, restart policy
- **Effort**: 2h

### Task 8.2 — nginx reverse proxy with security headers
- **Files**: `nginx.conf`
- **Description**: Gzip compression, CSP security headers, API proxy to app container, SPA fallback routing
- **Effort**: 1h

### Task 8.3 — SQLite backup automation
- **Files**: `scripts/backup-db.js`, `scripts/entrypoint.sh`
- **Description**: Daily crond backup at 3:00 AM + startup backup, keep last 5 copies, safe readFileSync+writeFileSync pattern, Docker env vars for configurable paths
- **Effort**: 1h

### Task 8.4 — Serve frontend from nginx, not host bind mount
- **Files**: `Dockerfile.web`
- **Description**: Eliminates host `./dist` dependency — frontend built inside Docker and copied into nginx image
- **Effort**: 30 min

### Task 8.5 — Server-side adjustments for Docker
- **Files**: `server/src/index.ts`
- **Description**: Add `HOST=0.0.0.0` env support, `CLIENT_ORIGIN` env for dynamic CORS
- **Effort**: 15 min

### Task 8.6 — Fix Phase 8 review issues
- **Files**: `Dockerfile`, `Dockerfile.web`, `docker-compose.yml`, `nginx.conf`, `scripts/backup-db.js`, `scripts/entrypoint.sh`
- **Description**: Fix 12 issues found in review: server dist compilation (noEmit→false), frontend assets in nginx, .dockerignore, JWT_SECRET env var, CORS dynamic, backup path env vars, Node 24→22 LTS, named volumes, HOST config
- **Effort**: 1h

### Deliverables
- [x] Docker compose up -d runs app + web without host dist
- [x] nginx serves SPA + proxies /api/ to backend
- [x] Daily SQLite backup at 3:00 AM via crond
- [x] All 12 Phase 8 review issues resolved
- [x] No host filesystem dependency for frontend assets

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
- `app`: multi-stage build (node:22-alpine), SQL.js + crond for daily backup, named volumes for data + backups, healthcheck
- `web`: multi-stage build (nginx:1.27-alpine), frontend built inside Docker (no host dist dependency), SPD routing + API proxy

### Recommended Production Setup
```
Ubuntu 24.04 LTS
├── Docker + docker-compose
├── Nginx reverse proxy (SSL via Let's Encrypt)
├── SQL.js file storage → periodic rsync/backup
└── Monitoring: Sentry (errors) + UptimeRobot (health check)
```

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
| Sync Latency (100 records) | < 3.0s | — |

### Security Headers (Current)
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
| Health check | `GET /api/health` — DB connectivity |
| Audit log | All CRUD with userId + timestamp |

### Retention Policy
| Data Type | Retention |
|-----------|-----------|
| Sentry errors | 90 days |
| Audit logs | 3 years |
| Sync queue (completed) | 30 days |
| Backup files | Keep last 5 |

---

## Summary Timeline

```
Week 1:  🔴 Phase 1 (Critical Bugs) + 🟡 Phase 2 (Security) ✅
Week 2:  🔵 Phase 3 (Database + Frontend Features) ✅
Week 3:  🟢 Phase 4 (Architecture) + 🟣 Phase 5 start ✅
Week 4:  🟣 Phase 5 (Frontend) + 🟠 Phase 6 start ✅
Week 5:  🟠 Phase 6 (Backend IAM) ✅
Week 6-7: ⚪ Phase 7 (Testing + Polish) ✅
Week 8:  🟤 Phase 8 (Deployment) ✅
```

## Total Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| 🔴 Phase 1 | 5 tasks (2 no-op) | ~30 min |
| 🟡 Phase 2 | 4 tasks | ~4h |
| 🔵 Phase 3 | 11 tasks | ~6h |
| 🟢 Phase 4 | 7 tasks | ~7h |
| 🟣 Phase 5 | 12 tasks | ~18h |
| 🟠 Phase 6 | 9 tasks | ~13h |
| ⚪ Phase 7 | 11 tasks (2 optional) | ~31h |
| 🟤 Phase 8 | 6 tasks | ~6h |
| **Total** | **65 tasks** | **~85 hours** |