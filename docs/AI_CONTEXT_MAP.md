# AI Context Map

> Quick-reference for LLM-assisted development. Maps files to their roles so AI can navigate the codebase efficiently.

## File Index

| File | Role |
|------|------|
| `docs/01_PROJECT_AUDIT.md` | Bugs, tech debt, architecture decisions, risks, inventory |
| `docs/02_ARCHITECTURE.md` | Layer diagram, data flow, sync model, tech stack rationale |
| `docs/03_DESIGN_SYSTEM.md` | Design tokens (colors, spacing, shadows, typography, radii) |
| `docs/04_CODING_STANDARDS.md` | TypeScript, React, Zustand, hooks, CSS conventions |
| `docs/05_REFACTOR_RULES.md` | Migration order, refactoring process, DB/API/frontend change rules |
| `docs/06_COMPONENT_MAP.md` | Every component: props, state, layout, dependencies |
| `docs/07_DATABASE_PLAN.md` | Current schema, missing tables, migration plan |
| `docs/08_SECURITY_PLAN.md` | Auth gaps, RBAC, rate limiting, CSP, audit plan |
| `docs/09_TEST_PLAN.md` | Test gaps, targets, infrastructure plan |
| `docs/10_MASTER_EXECUTION_PLAN.md` | 7-phase execution plan with dependency graph |
| `docs/CHANGELOG.md` | Unreleased changes, restructuring history |
| `docs/AI_CONTEXT_MAP.md` | (this file) — entry point for AI |

## Source Map

```
src/
├── main.tsx                     # App entry, renders <Router>
├── router.tsx                   # TanStack Router, 6 routes
├── index.css                    # Tailwind v4 + design tokens + component styles
├── types/index.ts               # BranchType, Student, GradeRecord, AttendanceRecord, etc.
├── data/mockParishData.ts       # Hardcoded mock data for offline/dev
├── lib/
│   ├── api.ts                   # Fetch-based API client
│   ├── db.ts                    # Dexie IndexedDB setup
│   ├── sentry.ts                # Sentry init
│   ├── syncService.ts           # Background sync orchestrator (30s interval)
│   └── syncProcessor.ts         # Queue processor, retry, delta sync
├── stores/                      # 11 Zustand stores
│   ├── studentStore.ts          # Student CRUD + sync
│   ├── gradeStore.ts            # Grade CRUD (⚠️ bug: no sync on update)
│   ├── attendanceStore.ts       # Attendance CRUD + rate calc
│   ├── noticeStore.ts           # Mock-only, no API
│   ├── filterStore.ts           # UI filters (persisted)
│   ├── themeStore.ts            # Dark/light (persisted via Dexie)
│   ├── uiStore.ts               # Modal state only
│   ├── syncStore.ts             # Queue status + pending count
│   ├── sacramentStore.ts        # Promotion logic
│   ├── useFilterSearchSync.ts   # URL ↔ filterStore sync
│   └── resetStores.ts           # Reset to mock data
├── hooks/
│   ├── useOnlineStatus.ts       # navigator.onLine listener
│   ├── useSyncEngine.ts         # Sync orchestrator hook
│   ├── useSyncQueue.ts          # Queue push helper
│   ├── useSyncProcessor.ts      # Processor hook
│   ├── useSyncPriority.ts       # Priority ordering
│   ├── useStudentSync.ts        # Student sync binding
│   ├── useSubjects.ts           # Subject list from mock
│   └── useBranchColor.ts        # Branch → color mapping
├── pages/
│   ├── Dashboard.tsx            # /dashboard
│   ├── Students.tsx             # /students
│   ├── Grades.tsx               # /grades
│   ├── Attendance.tsx           # /attendance
│   ├── Reports.tsx              # /reports
│   └── Notices.tsx              # /notices
├── components/
│   ├── common/                  # Shared components (10)
│   │   ├── HeaderBar.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── NotificationPrompt.tsx
│   │   ├── InstallPrompt.tsx
│   │   ├── StudentModal.tsx
│   │   ├── StudentReportModal.tsx
│   │   ├── PhotoCard.tsx
│   │   ├── Certificate.tsx
│   │   └── SacramentSection.tsx
│   ├── desktop/                 # Desktop layout (8)
│   │   ├── DesktopSidebar.tsx
│   │   ├── DesktopDashboard.tsx
│   │   ├── DesktopStudentList.tsx
│   │   ├── DesktopGradeMatrix.tsx
│   │   ├── DesktopAttendanceGrid.tsx
│   │   ├── DesktopReports.tsx
│   │   ├── DesktopNotices.tsx
│   │   └── PromotionPanel.tsx
│   └── mobile/                  # Mobile layout (7)
│       ├── MobileBottomNav.tsx
│       ├── MobileHomeView.tsx
│       ├── MobileStudentsView.tsx
│       ├── MobileGradeView.tsx
│       ├── MobileAttendanceView.tsx
│       ├── MobileReportsView.tsx
│       └── MobileNoticesView.tsx
└── __tests__/
    ├── grades.test.ts           # 25 unit tests
    └── sync-engine.test.ts      # ~27 integration tests

server/src/
├── index.ts                     # Hono app, CORS, middleware registration
├── seed.ts                      # DB seed script
├── db/
│   ├── schema.ts                # Drizzle schema (6 tables + 3 generated)
│   └── index.ts                 # DB connection (sql.js)
├── middleware/
│   ├── auth.ts                  # authMiddleware + roleMiddleware (unused)
│   └── security.ts              # CSP, HSTS, rate limiter
├── routes/
│   ├── auth.ts                  # POST login/refresh, GET me
│   ├── students.ts              # CRUD + audit log
│   ├── grades.ts                # GET + upsert + batch
│   ├── attendance.ts            # GET + upsert + batch
│   ├── notices.ts               # GET + POST + DELETE
│   └── notifications.ts         # subscribe/send/smart (NO AUTH)
└── services/
    ├── telegram.ts              # Grammy bot
    ├── smartNotifications.ts    # Absence/report/reminder logic
    ├── notificationQueue.ts     # In-memory queue
    └── templateEngine.ts        # Variable substitution
```

## Quick AI Onboarding

1. **Start here** → `docs/AI_CONTEXT_MAP.md`
2. **Understand scope** → `docs/01_PROJECT_AUDIT.md` (bugs, risks, debt)
3. **Architecture** → `docs/02_ARCHITECTURE.md`
4. **Plan** → `docs/10_MASTER_EXECUTION_PLAN.md` (what to do, in what order)
5. **Rules** → `docs/05_REFACTOR_RULES.md` (how to do it safely)
6. **Standards** → `docs/04_CODING_STANDARDS.md` (code style to match)
7. **Design** → `docs/03_DESIGN_SYSTEM.md` (colors, tokens, component classes)
8. **Components** → `docs/06_COMPONENT_MAP.md`
9. **Database** → `docs/07_DATABASE_PLAN.md`
10. **Security** → `docs/08_SECURITY_PLAN.md`
11. **Tests** → `docs/09_TEST_PLAN.md`
