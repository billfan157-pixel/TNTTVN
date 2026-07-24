# Project Audit

> Repository overview, inventory, bugs, technical debt, architecture decisions, risks.

## 1. Repository Overview

- **Project**: brave-davinci — Giáo Lý Thiếu Nhi Thánh Thể
- **Frontend**: React 19, TypeScript 6, Vite 8, Tailwind CSS 4, TanStack Router, TanStack Table, Zustand, Dexie
- **Backend**: Hono (Node.js), Drizzle ORM, sql.js (SQLite), JWT, bcryptjs, grammy (Telegram Bot), web-push
- **Testing**: Vitest (52 unit/integration), Playwright (5 E2E)
- **Other**: Sentry, PWA (vite-plugin-pwa), Workbox
- **DB**: SQLite via sql.js at `server/data/parish.db`; client-side IndexedDB via Dexie
- **Auth**: JWT (access 15m, refresh 7d), bcrypt, roles: admin/chunhiem/phuta/phuhuynh
- **Monorepo**: Frontend at root `src/`, backend at `server/src/`

## 2. Folder Structure

```
brave-davinci/
├── package.json, tsconfig.json, vite.config.ts, vitest.config.ts, playwright.config.ts
├── index.html, MASTER_DEVELOPMENT_PLAN.md
├── public/                     # Static assets
├── e2e/app.spec.ts            # 5 Playwright tests
├── src/                        # Frontend
│   ├── main.tsx, router.tsx, index.css, types.ts
│   ├── data/mockParishData.ts
│   ├── lib/                    # api.ts, db.ts, sentry.ts, syncService.ts, syncProcessor.ts
│   ├── stores/                 # 11 Zustand stores
│   ├── hooks/                  # 8 hooks
│   ├── utils/                  # grades.ts, sacraments.ts
│   ├── pages/                  # 6 pages
│   ├── components/{common,desktop,mobile}/  # 25 components
│   └── __tests__/              # 2 test files
├── server/src/
│   ├── index.ts, seed.ts
│   ├── db/{schema.ts, index.ts}
│   ├── middleware/{auth.ts, security.ts}
│   ├── routes/{auth,students,grades,attendance,notices,notifications}.ts
│   └── services/{smartNotifications,notificationQueue,templateEngine,telegram}.ts
└── docs/                       # Architecture documents
```

## 3. Database Inventory

### Existing Tables (6)

**users**: id, username, passwordHash, fullName, role, parishId, createdAt
**students**: id, code, holyName, fullName, gender, dateOfBirth, baptismDate, firstCommunionDate, confirmationDate, parentName, parentPhone, address, branch, classId, avatarUrl, status, notes, parishId, createdAt, updatedAt, updatedBy
**grades**: id, studentId, academicYear, semester, scoreOral, score15m, score1Period, scoreMidterm, scoreFinal, comments, parishId, createdAt, updatedAt, updatedBy
**attendance**: id, studentId, date, type, status, note, parishId, createdAt, updatedAt, updatedBy
**notices**: id, title, content, date, author, priority, targetBranch, parishId, createdAt, updatedAt, updatedBy
**audit_logs**: id, userId, action, entityType, entityId, oldValue, newValue, parishId, createdAt

### Missing Tables
- `classes` (🔴 High) — students.classId references non-existent table
- `academic_years` (🔴 High) — academicYear is free text
- `branches` (🟡 Medium) — branch is hardcoded string
- `system_settings` (🟢 Low) — no config table
- `notifications` (🟢 Low) — no history
- `permissions` + `role_permissions` (🟢 Low) — schema only

### Deprecated
- `users.parishId` — single-parish app, always 'thanh-gia'
- `grades.scoreOral` — Vietnamese-English hybrid naming

## 4. API Inventory

| Method | Route | Auth | Status | Handler |
|--------|-------|------|--------|---------|
| GET | `/health` | No | ✅ | `index.ts:21` |
| POST | `/api/auth/login` | No (10/min) | ✅ | `routes/auth.ts:18` |
| POST | `/api/auth/refresh` | No | ✅ | `routes/auth.ts:40` |
| GET | `/api/auth/me` | Bearer | ✅ | `routes/auth.ts:59` |
| GET/POST/PUT/DELETE | `/api/students[/:id]` | Bearer | ✅ | `routes/students.ts` |
| GET/POST | `/api/grades[/batch]` | Bearer | ✅ | `routes/grades.ts` |
| GET/POST | `/api/attendance[/batch]` | Bearer | ✅ | `routes/attendance.ts` |
| GET/POST/DELETE | `/api/notices[/:id]` | Bearer | ✅ | `routes/notices.ts` |
| POST/GET | `/api/notifications/*` | ❌ **None** | ⚠️ Public | `routes/notifications.ts` |

**Status codes**: 200, 201, 204, 400, 401, 403, 404, 501

## 5. Frontend Inventory

### Zustand Stores (11)
- **studentStore** — CRUD + sync via queue
- **gradeStore** — CRUD + avg calc (⚠️ bug: missing sync on update)
- **attendanceStore** — CRUD + rate calc
- **noticeStore** — mock-only, no API, no persist
- **filterStore** — UI filters, persisted
- **themeStore** — dark/light toggle
- **uiStore** — modal state only
- **syncStore** — sync queue state + Dexie ops
- **sacramentStore** — promotion logic
- **useFilterSearchSync** — URL ↔ filterStore sync
- **resetStores** — reset all to mock data

### Pages (6 routes)
Dashboard → `/dashboard`, Students → `/students`, Grades → `/grades`, Attendance → `/attendance`, Reports → `/reports`, Notices → `/notices`

### Components (25)
- Common (10): HeaderBar, ErrorBoundary, ConfirmDialog, NotificationPrompt, InstallPrompt, StudentModal, StudentReportModal, PhotoCard, Certificate, SacramentSection
- Desktop (8): Sidebar, Dashboard, StudentList, GradeMatrix, AttendanceGrid, Reports, Notices, PromotionPanel
- Mobile (7): BottomNav, HomeView, StudentsView, GradeView, AttendanceView, ReportsView, NoticesView

## 6. Backend Inventory

### Middleware
- `auth.ts`: authMiddleware ✅, roleMiddleware ❌ (unused)
- `security.ts`: CSP, HSTS, rate limiter 30/m, login rate limiter 10/m

### Routes (6 files)
- auth (login/refresh/me)
- students (CRUD + audit log)
- grades (GET/upsert/batch)
- attendance (GET/upsert/batch)
- notices (GET/POST/DELETE)
- notifications (subscribe/send/smart — **no auth**)

### Services (4)
- telegram.ts — grammy bot
- smartNotifications.ts — absence/report/reminder logic
- notificationQueue.ts — in-memory queue
- templateEngine.ts — variable substitution

## 7. Authentication

- **Login**: `POST /api/auth/login` → bcrypt verify → JWT pair
- **Tokens**: Access 15m + Refresh 7d, same secret, payload `{userId, username, role, parishId}`
- **JWT**: jsonwebtoken, HS256, `JWT_SECRET` required env
- **Role checking**: `roleMiddleware` defined but **never used** — no RBAC enforced
- **Password**: bcrypt with 10 rounds
- **Frontend**: No login page — app loads with mock data; tokens in localStorage

## 8. Sync Engine

- **Queue**: Dexie IndexedDB `syncQueue` table
- **Entities**: student (C/U/D), grade (U), attendance (U)
- **Retry**: Max 5, exponential backoff 2s→4s→...→60s
- **Conflict**: LWW — 409 Conflict auto-skipped
- **Offline**: `useOnlineStatus` + `useSyncEngine` (30s interval) + queue compaction
- **Delta sync**: ⚠️ Broken — `qs` computed but ignored; backend has no `updatedAfter` param

## 9. Test Coverage

- **Unit**: 25 tests (grades.ts — pure functions)
- **Integration**: ~27 tests (sync-engine.test.ts — Dexie mock)
- **E2E**: 5 Playwright tests (smoke + attendance)
- **Gaps**: 0% backend, 0% frontend components, no coverage config

## 10. Bugs (10)

| # | Issue | File | Severity |
|---|-------|------|----------|
| 1 | gradeStore.upsertGrade skips sync on existing grade update | `src/stores/gradeStore.ts:35-39` | 🔴 High |
| 2 | deltaSync computes qs but never passes it | `src/lib/syncProcessor.ts:105-121` | 🟡 Medium |
| 3 | roleMiddleware defined but never used | `server/src/middleware/auth.ts:52-59` | 🔴 High |
| 4 | Notification routes have no auth | `server/src/routes/notifications.ts:20` | 🔴 High |
| 5 | No login page on frontend | N/A | 🔴 High |
| 6 | Hardcoded class/branch data | `src/data/mockParishData.ts` | 🟡 Medium |
| 7 | In-memory state loss on restart | 3 files | 🟡 Medium |
| 8 | Audit logs missing ip/user_agent | `server/src/db/schema.ts` | 🟢 Low |
| 9 | GET /notifications/subscriptions leaks count | `server/src/routes/notifications.ts:63` | 🟢 Low |
| 10 | Student code generation may conflict | `server/src/routes/students.ts:47` | 🟢 Low |

## 11. Technical Debt Summary

| Priority | Count | Est. Effort |
|----------|-------|-------------|
| Critical | 3 | ~6.5h |
| High | 4 | ~12.5h |
| Medium | 7 | ~18h |
| Low | 6 | ~10h |
| **Total** | **20** | **~63h** |

## 12. Quick Wins (<30 min each)

| # | Item | Effort | Phase |
|---|------|--------|-------|
| 1 | Fix gradeStore sync on update (Bug #1) | 5m | 1 |
| 2 | Add auth middleware to notification routes (Bug #4) | 5m | 1 |
| 3 | Fix StudentsPage report cards auth header | 10m | 1 |
| 4 | Remove unused roleMiddleware import warning | 2m | 1 |
| 5 | Add seed conflict logging | 5m | 1 |
| 6 | Add coverage config to vitest | 5m | 7 |
| 7 | Add body size limit middleware | 5m | 2 |
| 8 | Add Zod trim() refinement to all string inputs | 15m | 2 |
| 9 | Remove dead deltaSync variable | 1m | 4 |
| 10 | Normalize ID generation across codebase | 20m | 4 |
| 11 | Clean up dead components (ConfirmDialog, NotificationPrompt) | 2m | 5 |
| 12 | Add type="button" to non-submit buttons | 10m | 5 |

## 13. Architecture Decisions (ADRs)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| 001 | Single-Parish Modular Monolith | 1–3 devs, no distributed complexity |
| 002 | Dexie.js (IndexedDB) for offline | Multi-MB cache, background queue |
| 003 | Hono + Drizzle + SQL.js | Type-safe, zero native deps |
| 004 | Zustand > Redux/Context | Simpler, no Provider wrapper |
| 005 | Tailwind v4 custom > shadcn/ui | Full control, TNTT branding |
| 006 | LWW + Queue > CRDT | Rare conflicts in 1 parish |
| 007 | Keep `/api/` prefix | Existing clients + tokens |
| 008 | Role-based RBAC > capability | 4 roles sufficient for now |

## 14. Known Limitations

- Single tenant (1 parish hardcoded as 'thanh-gia')
- Rate limiter is in-memory (resets on restart)
- Notification queue is in-memory (lost on restart)
- Push subscriptions are in-memory (lost on restart)
- No CSV/Excel import yet
- No PDF export yet
- No data retention/archival policy
- No CI/CD for server (GitHub Actions only checks build)
- 0% test coverage on backend and frontend components
- No login page — app uses mock data by default

## 15. Dependency Notes

- **sql.js** requires WebAssembly — ensure correct `.wasm` file in deployment
- **bcryptjs** is pure JS (not native bcrypt) — slower but no native deps
- **Dexie** with `fake-indexeddb` in tests must match Dexie version exactly
- **Vite 8** requires Node.js 22+
- **TypeScript 6** is latest — some `@types/*` packages may lag

## 16. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Schema migration breaks existing parish.db | Medium | High | Backup first; test migration on copy |
| RBAC applied incorrectly blocks legit users | Medium | High | Test every role × endpoint combo |
| Auth guard on frontend breaks offline mode | Medium | High | Allow fallback to local data |
| No backend tests → regression on route refactor | High | Medium | Add tests before refactoring routes |
| sql.js WAL mode corruption on power loss | Low | High | Periodic JSON backup |
