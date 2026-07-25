# Project Audit

> Repository overview, inventory, bugs, technical debt, architecture decisions, risks.
> Version: 1.0 | Last reviewed: 2026-07-25 | Status: ✅ Current | Prerequisites: none

## 1. Repository Overview

- **Project**: brave-davinci — Giáo Lý Thiếu Nhi Thánh Thể
- **Frontend**: React 19, TypeScript 5.8, Vite 8, Tailwind CSS 4, TanStack Router, TanStack Table, Zustand, Dexie
- **Backend**: Hono (Node.js), Drizzle ORM, @libsql/client (libsql — SQLite), JWT, bcryptjs, grammy (Telegram Bot), web-push
- **Testing**: Vitest (~21 test files), Playwright (E2E)
- **Other**: Sentry, PWA (vite-plugin-pwa), Workbox
- **DB**: SQLite via @libsql/client at `server/data/parish.db`; WAL mode enabled; client-side IndexedDB via Dexie
- **Auth**: JWT (access 15m, refresh 7d), bcrypt, roles: admin/chunhiem/phuta/phuhuynh; RBAC enforced on all routes
- **Monorepo**: Frontend at root `src/`, backend at `server/src/`

## 2. Folder Structure

```
brave-davinci/
├── package.json, tsconfig.json, vite.config.ts, vitest.config.ts, playwright.config.ts
├── index.html
├── Dockerfile, Dockerfile.web, docker-compose.yml, nginx.conf, railway.json
├── scripts/backup-db.js, scripts/entrypoint.sh
├── public/                     # Static assets
├── e2e/                        # Playwright E2E tests
├── src/                        # Frontend
│   ├── main.tsx, router.tsx, index.css, types.ts
│   ├── data/mockParishData.ts
│   ├── lib/                    # api.ts, db.ts, sentry.ts, syncService.ts, syncProcessor.ts
│   ├── stores/                 # 15 Zustand stores
│   ├── hooks/                  # 9 hooks
│   ├── utils/                  # grades.ts, sacraments.ts, excelExporter.ts, pdfGenerator.ts
│   ├── pages/                  # 12 pages
│   ├── components/{common,desktop,mobile}/  # ~36 components
│   └── __tests__/              # 9 test files
├── server/src/
│   ├── index.ts, seed.ts
│   ├── db/{schema.ts, index.ts}
│   ├── middleware/{auth.ts, security.ts}
│   ├── routes/                 # 9 route files
│   └── services/               # 10 service files
└── docs/                       # Architecture documents
```

## 3. Database Inventory

### Tables (15)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| users | User accounts + auth | id, username, passwordHash, fullName, role, status, tokenVersion, failedAttempts, lockedUntil, lastLoginAt, mustChangePassword, parishId, createdAt |
| students | Student roster (soft delete) | id, code, holyName, fullName, gender, dateOfBirth, baptismDate, firstCommunionDate, confirmationDate, parentName, parentPhone, address, branch, classId, avatarUrl, status, notes, deletedAt, parishId, createdAt, updatedAt, updatedBy |
| grades | Academic scores | id, studentId, academicYear, semester, scoreOral, score15m, score1Period, scoreMidterm, scoreFinal, scoreDaoDuc, comments, version, parishId, createdAt, updatedAt, updatedBy |
| attendance | Attendance records | id, studentId, date, type, status, note, version, parishId, createdAt, updatedAt, updatedBy |
| notices | Parish announcements | id, title, content, date, author, priority, targetBranch, parishId, createdAt, updatedAt, updatedBy |
| audit_logs | CRUD audit trail | id, userId, action, entityType, entityId, oldValue, newValue, ip, userAgent, parishId, timestamp |
| notifications | Notification history | id, studentId, type, channel, status, recipient, message, error, triggeredByType, triggeredByUserId, sentAt, parishId, createdAt |
| branches | TNTT branch definitions | id, name, scarfColor, ageMin, ageMax, parishId, createdAt, updatedAt, updatedBy |
| academic_years | School year config | id, startDate, endDate, isLocked, parishId, createdAt, updatedAt, updatedBy |
| classes | Catechism classes | id, code, name, branchId, academicYearId, room, parishId, createdAt, updatedAt, updatedBy |
| system_settings | App configuration | key, value, description, updatedBy, updatedAt, parishId |
| catechist_assignments | User ↔ class mapping | id, userId, classId, roleInClass, parishId, createdAt, updatedAt, updatedBy |
| permissions | RBAC permission definitions | id, name, description, parishId |
| role_permissions | Role ↔ permission mapping | role, permissionId, parishId |
| push_subscriptions | Web push endpoints | id, endpoint, p256dh, auth, userId, parishId, createdAt |

## 4. API Inventory

| Method | Route | Auth | RBAC | Handler |
|--------|-------|------|------|---------|
| GET | `/health` | No | — | `index.ts` |
| POST | `/api/auth/login` | No (10/min) | — | `routes/auth.ts` |
| POST | `/api/auth/refresh` | No | — | `routes/auth.ts` |
| POST | `/api/auth/change-password` | Bearer | — | `routes/auth.ts` |
| GET | `/api/auth/me` | Bearer | — | `routes/auth.ts` |
| GET/POST/PUT/DELETE | `/api/students[/:id]` | Bearer | ✅ | `routes/students.ts` |
| GET/POST | `/api/grades[/batch]` | Bearer | ✅ | `routes/grades.ts` |
| GET/POST | `/api/attendance[/batch]` | Bearer | ✅ | `routes/attendance.ts` |
| GET/POST/DELETE | `/api/notices[/:id]` | Bearer | ✅ | `routes/notices.ts` |
| POST/GET | `/api/notifications/*` | Bearer | ✅ | `routes/notifications.ts` |
| GET/POST/PUT | `/api/users[/:id]` | Bearer | ✅ | `routes/users.ts` |
| GET/POST/PUT/DELETE | `/api/classes[/:id]` | Bearer | ✅ | `routes/classes.ts` |
| GET | `/api/audit-logs` | Bearer | ✅ (admin) | `routes/auditLogs.ts` |

**Status codes**: 200, 201, 204, 400, 401, 403, 404, 409, 501

## 5. Frontend Inventory

### Zustand Stores (15)
- **studentStore** — CRUD + sync via queue
- **gradeStore** — CRUD + avg calc
- **attendanceStore** — CRUD + rate calc
- **noticeStore** — CRUD + API fetch
- **filterStore** — UI filters, persisted
- **themeStore** — dark/light toggle
- **uiStore** — modal state only
- **syncStore** — sync queue state + Dexie ops
- **sacramentStore** — promotion logic
- **authStore** — JWT + user session
- **classStore** — class list from API
- **academicYearStore** — current academic year
- **dailyGradeStore** — daily grade entry
- **useFilterSearchSync** — URL ↔ filterStore sync
- **resetStores** — reset all to mock data

### Pages (12 routes)
Dashboard → `/dashboard`, Students → `/students`, Grades → `/grades`, Attendance → `/attendance`,
Reports → `/reports`, Notices → `/notices`, Users → `/users`, Classes → `/classes`,
Catechist → `/catechists`, Academic Year → `/academic-years`, Audit Log → `/audit-logs`,
Login → `/login`

### Components (~36)
- Common (14): HeaderBar, ErrorBoundary, ConfirmDialog, InstallPrompt,
  StudentModal, StudentReportModal, PhotoCard, Certificate, SacramentSection, PrintReportModal,
  OfflineBanner, BackupRestoreModal, ExcelImportModal, ForcePasswordChangeModal
- Desktop (15): DesktopSidebar, DesktopDashboard, DesktopStudentList, DesktopGradeMatrix,
  DesktopAttendanceGrid, DesktopReports, DesktopNotices, PromotionPanel, UserManagementPage,
  SystemDiagnosticsModal, DesktopClasses, DesktopDailyGradeEntry, DesktopGradeCards,
  DesktopGradeComparison, GradeFormulaConfigModal
- Mobile (7): MobileBottomNav, MobileHomeView, MobileStudentsView, MobileGradeView,
  MobileAttendanceView, MobileReportsView, MobileNoticesView

## 6. Backend Inventory

### Middleware
- `auth.ts`: authMiddleware ✅, roleMiddleware ✅ (enforced on all routes), getUserClassIds, isAdmin, checkUserClassAccess
- `security.ts`: CSP, HSTS, rate limiter 30/m, login rate limiter 10/m, body limit

### Routes (9 files)
- auth (login/refresh/me/change-password)
- students (CRUD + audit log + class-scoped filter)
- grades (GET/upsert/batch + class-scoped filter)
- attendance (GET/upsert/batch + class-scoped filter)
- notices (GET/POST/DELETE + RBAC)
- notifications (subscribe/send/smart — all authenticated)
- users (CRUD + status/reset-password/force-logout/assignments — admin only)
- classes (CRUD — admin/chunhiem)
- auditLogs (GET — admin only)

### Services (10)
- studentService.ts — business logic + ID generation
- gradeService.ts — upsert + batch + validation
- attendanceService.ts — upsert + batch
- noticeService.ts — CRUD
- userService.ts — CRUD + assignments
- classService.ts — CRUD + lookup
- telegram.ts — grammy bot
- smartNotifications.ts — absence/report/reminder logic
- notificationQueue.ts — DB-persisted queue
- templateEngine.ts — variable substitution

## 7. Authentication

- **Login**: `POST /api/auth/login` → bcrypt verify → JWT pair
- **Tokens**: Access 15m + Refresh 7d, same secret, payload `{userId, username, role, parishId, tokenVersion}`
- **JWT**: jsonwebtoken, HS256, `JWT_SECRET` required env
- **RBAC**: `roleMiddleware('admin', 'chunhiem', ...)` enforced on all protected endpoints
- **Class-scoped**: `checkUserClassAccess()` for phuta/phuhuynh — limits data to assigned classes
- **Password**: bcrypt with 10 rounds; first login forces `mustChangePassword`
- **Lockout**: Auto-lock after 5 consecutive failed attempts
- **Force logout**: `tokenVersion` validated against DB on each request
- **Frontend**: Login page at `/login`; auth guard on protected routes; 401 redirect in api.ts; tokens in localStorage

## 8. Sync Engine

- **Queue**: Dexie IndexedDB `syncQueue` table
- **Entities**: student (C/U/D), grade (U), attendance (U)
- **Retry**: Max 5, exponential backoff 2s→4s→...→60s
- **Conflict**: LWW — 409 Conflict auto-skipped
- **Offline**: `useOnlineStatus` + `useSyncEngine` (30s interval) + queue compaction
- **Delta sync**: Working — client passes `updatedAfter`, server filters via `gte`

## 9. Test Coverage

- **Server unit/integration**: 12 test files (routes + services + middleware)
- **Client unit/integration**: 9 test files (components + stores + utils + sync)
- **E2E**: Playwright tests (login, CRUD, roles)
- **Coverage config**: v8 provider, thresholds 40/30/45/40

## 10. Known Limitations

- Single tenant (1 parish hardcoded as 'thanh-gia')
- Rate limiter is in-memory (resets on restart)
- Excel roster import UI exists (ExcelImportModal); backend route not wired
- No data retention/archival policy
- No CI/CD for server (GitHub Actions only checks build)
- NotificationPrompt component removed (was dead code)

## 11. Dependency Notes

- **@libsql/client** uses WASM — no native compilation
- **bcryptjs** is pure JS (not native bcrypt) — slower but no native deps
- **Dexie** with `fake-indexeddb` in tests must match Dexie version exactly
- **Vite 8** requires Node.js 22+
- **TypeScript 5.8** with `erasableSyntaxOnly` — no legacy enums

## 12. Architecture Decisions (ADRs)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| 001 | Single-Parish Modular Monolith | 1–3 devs, no distributed complexity |
| 002 | Dexie.js (IndexedDB) for offline | Multi-MB cache, background queue |
| 003 | Hono + Drizzle + @libsql/client | Type-safe, zero native deps, WAL mode |
| 004 | Zustand > Redux/Context | Simpler, no Provider wrapper |
| 005 | Tailwind v4 custom > shadcn/ui | Full control, TNTT branding |
| 006 | LWW + Queue > CRDT | Rare conflicts in 1 parish |
| 007 | Keep `/api/` prefix | Existing clients + tokens |
| 008 | Role-based RBAC > capability | 4 roles sufficient for now |
