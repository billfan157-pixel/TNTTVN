# AI Context Map

> Quick-reference for LLM-assisted development. Maps files to their roles so AI can navigate the codebase efficiently.
> Version: 1.1 | Last reviewed: 2026-07-25 | Status: ✅ Current | Prerequisites: none (entry point)

## File Index

| File | Role |
|------|------|
| `docs/01_PROJECT_AUDIT.md` | Bugs, tech debt, architecture decisions, risks, inventory |
| `docs/02_ARCHITECTURE.md` | Layer diagram, data flow, sync model, tech stack rationale |
| `docs/03_DESIGN_SYSTEM.md` | Design tokens (colors, spacing, shadows, typography, radii) |
| `docs/04_CODING_STANDARDS.md` | TypeScript, React, Zustand, hooks, CSS conventions |
| `docs/05_REFACTOR_RULES.md` | Migration order, refactoring process, DB/API/frontend change rules |
| `docs/06_COMPONENT_MAP.md` | Every component: props, state, layout, dependencies |
| `docs/07_DATABASE_PLAN.md` | Current schema (15 tables), indexes, constraints |
| `docs/08_SECURITY_PLAN.md` | Auth, RBAC, rate limiting, CSP, audit status |
| `docs/09_TEST_PLAN.md` | Test gaps, targets, infrastructure plan |
| `docs/10_MASTER_EXECUTION_PLAN.md` | Completed 9-phase execution plan |
| `docs/CHANGELOG.md` | Unreleased changes, restructuring history |
| `docs/AI_CONTEXT_MAP.md` | (this file) — entry point for AI |

## Source Map

```
src/
├── main.tsx                     # App entry, renders <Router>
├── router.tsx                   # TanStack Router, 12 routes + auth guard
├── index.css                    # Tailwind v4 + design tokens + component styles
├── types/index.ts               # BranchType, Student, GradeRecord, AttendanceRecord, etc.
├── data/mockParishData.ts       # Hardcoded mock data for offline/dev
├── lib/
│   ├── api.ts                   # Fetch-based API client (with delta sync support)
│   ├── db.ts                    # Dexie IndexedDB setup
│   ├── sentry.ts                # Sentry init
│   ├── syncService.ts           # Background sync orchestrator (30s interval)
│   └── syncProcessor.ts         # Queue processor, retry, delta sync
├── stores/                      # 15 Zustand stores
│   ├── studentStore.ts          # Student CRUD + sync
│   ├── gradeStore.ts            # Grade CRUD + sync + avg calc
│   ├── attendanceStore.ts       # Attendance CRUD + rate calc
│   ├── noticeStore.ts           # CRUD + API fetch
│   ├── filterStore.ts           # UI filters (persisted)
│   ├── themeStore.ts            # Dark/light (persisted via Dexie)
│   ├── uiStore.ts               # Modal state only
│   ├── syncStore.ts             # Queue status + pending count
│   ├── sacramentStore.ts        # Promotion logic
│   ├── authStore.ts             # JWT + user session
│   ├── classStore.ts            # Class list from API
│   ├── academicYearStore.ts     # Current academic year
│   ├── dailyGradeStore.ts       # Daily grade entry
│   ├── useFilterSearchSync.ts   # URL ↔ filterStore sync
│   └── resetStores.ts           # Reset to mock data
├── hooks/
│   ├── useAuth.ts               # Auth state + login/logout
│   ├── useEffectiveMode.ts      # View mode (desktop/mobile)
│   ├── useFocusTrap.ts          # A11y focus trap
│   ├── useInstallPrompt.ts      # PWA install
│   ├── useOnlineStatus.ts       # navigator.onLine listener
│   ├── useSundayReminder.ts     # Sunday mass reminder
│   ├── useSyncEngine.ts         # Sync orchestrator hook
│   ├── useTheme.ts              # Theme toggle
│   └── useWebPush.ts            # Push notification subscription
├── pages/
│   ├── LoginPage.tsx            # /login
│   ├── DashboardPage.tsx        # /dashboard
│   ├── StudentsPage.tsx         # /students
│   ├── GradesPage.tsx           # /grades
│   ├── AttendancePage.tsx       # /attendance
│   ├── ReportsPage.tsx          # /reports
│   ├── NoticesPage.tsx          # /notices
│   ├── UsersPage.tsx            # /users
│   ├── ClassesPage.tsx          # /classes
│   ├── CatechistPage.tsx        # /catechists
│   ├── AcademicYearPage.tsx     # /academic-years
│   └── AuditLogPage.tsx         # /audit-logs
├── components/
│   ├── common/                  # Shared components (14)
│   │   ├── HeaderBar.tsx        # User badge, theme toggle, sync status
│   │   ├── ErrorBoundary.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── InstallPrompt.tsx
│   │   ├── StudentModal.tsx
│   │   ├── StudentReportModal.tsx
│   │   ├── PrintReportModal.tsx
│   │   ├── PhotoCard.tsx
│   │   ├── Certificate.tsx
│   │   ├── SacramentSection.tsx
│   │   ├── OfflineBanner.tsx
│   │   ├── BackupRestoreModal.tsx
│   │   ├── ExcelImportModal.tsx
│   │   └── ForcePasswordChangeModal.tsx
│   ├── desktop/                 # Desktop layout (15)
│   │   ├── DesktopSidebar.tsx
│   │   ├── DesktopDashboard.tsx
│   │   ├── DesktopStudentList.tsx
│   │   ├── DesktopGradeMatrix.tsx
│   │   ├── DesktopAttendanceGrid.tsx
│   │   ├── DesktopReports.tsx
│   │   ├── DesktopNotices.tsx
│   │   ├── PromotionPanel.tsx
│   │   ├── UserManagementPage.tsx
│   │   ├── SystemDiagnosticsModal.tsx
│   │   ├── DesktopClasses.tsx
│   │   ├── DesktopDailyGradeEntry.tsx
│   │   ├── DesktopGradeCards.tsx
│   │   ├── DesktopGradeComparison.tsx
│   │   └── GradeFormulaConfigModal.tsx
│   └── mobile/                  # Mobile layout (7)
│       ├── MobileBottomNav.tsx
│       ├── MobileHomeView.tsx
│       ├── MobileStudentsView.tsx
│       ├── MobileGradeView.tsx
│       ├── MobileAttendanceView.tsx
│       ├── MobileReportsView.tsx
│       └── MobileNoticesView.tsx
├── utils/
│   ├── grades.ts                # Score calculation
│   ├── sacraments.ts            # Age/branch logic
│   ├── excelExporter.ts         # Excel export
│   ├── excelParser.ts           # Excel import parsing
│   ├── pdfGenerator.ts          # PDF generation
│   └── getDefaultDate.ts        # Date defaults
└── __tests__/
    ├── grades.test.ts           # 25 unit tests
    ├── sync-engine.test.ts      # ~30 integration tests
    ├── stores/                  # 3 store test files
    ├── components/              # 4 component test files
    └── utils/                   # (empty)

server/src/
├── index.ts                     # Hono app, CORS, middleware registration
├── seed.ts                      # DB seed script (with per-table logging)
├── db/
│   ├── schema.ts                # Drizzle schema (15 tables)
│   └── index.ts                 # DB connection (@libsql/client + WAL mode)
├── middleware/
│   ├── auth.ts                  # authMiddleware + roleMiddleware + getUserClassIds + isAdmin + checkUserClassAccess
│   └── security.ts              # CSP, HSTS, rate limiter
├── routes/
│   ├── auth.ts                  # POST login/refresh/change-password, GET me
│   ├── students.ts              # CRUD + audit log + class-scoped filter
│   ├── grades.ts                # GET + upsert + batch
│   ├── attendance.ts            # GET + upsert + batch
│   ├── notices.ts               # GET + POST + DELETE
│   ├── notifications.ts         # subscribe/send/smart (AUTHENTICATED)
│   ├── users.ts                 # CRUD + status/reset-password/force-logout/assignments
│   ├── classes.ts               # CRUD
│   └── auditLogs.ts             # GET (admin only)
└── services/
    ├── studentService.ts        # Business logic + ID generation
    ├── gradeService.ts          # Upsert + batch
    ├── attendanceService.ts     # Upsert + batch
    ├── noticeService.ts         # CRUD
    ├── userService.ts           # CRUD + assignments
    ├── classService.ts          # CRUD + lookup
    ├── telegram.ts              # Grammy bot
    ├── smartNotifications.ts    # Absence/report/reminder logic
    ├── notificationQueue.ts     # DB-persisted queue
    └── templateEngine.ts        # Variable substitution
```

## Quick AI Onboarding

1. **Start here** → `docs/AI_CONTEXT_MAP.md`
2. **Understand scope** → `docs/01_PROJECT_AUDIT.md` (bugs, risks, debt)
3. **Architecture** → `docs/02_ARCHITECTURE.md`
4. **Plan** → `docs/10_MASTER_EXECUTION_PLAN.md` (what was done)
5. **Rules** → `docs/05_REFACTOR_RULES.md` (how to do it safely)
6. **Standards** → `docs/04_CODING_STANDARDS.md` (code style to match)
7. **Design** → `docs/03_DESIGN_SYSTEM.md` (colors, tokens, component classes)
8. **Components** → `docs/06_COMPONENT_MAP.md`
9. **Database** → `docs/07_DATABASE_PLAN.md`
10. **Security** → `docs/08_SECURITY_PLAN.md`
11. **Tests** → `docs/09_TEST_PLAN.md`
