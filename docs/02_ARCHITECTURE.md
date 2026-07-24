# Architecture

## 1. Current Architecture

### Layer Diagram (as-is)

```
┌──────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                             │
│  Pages: Dashboard, Students, Grades, Attendance, Reports, Notices│
│  Components: Desktop/Common/Mobile (25 total)                    │
│  Router: TanStack Router (6 routes + index redirect)             │
│  State: 9 Zustand stores (6 persist → Dexie, 3 in-memory)       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ reads/writes
┌────────────────────────────▼─────────────────────────────────────┐
│                     DATA LAYER (Client-side)                      │
│  Dexie IndexedDB: Zustand persist (6 stores) + syncQueue         │
│  MOCK_PARISH_DATA: Default initial data when no backend          │
│  Sync Engine: syncService.ts → syncProcessor.ts → api.ts         │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP (JSON)
┌────────────────────────────▼─────────────────────────────────────┐
│                     BACKEND (Hono + SQL.js)                       │
│  Auth: JWT (access 15m, refresh 7d), bcrypt, no RBAC enforced    │
│  Routes: 6 files, 22 endpoints (6 unprotected)                   │
│  Services: Telegram, Notifications, Template Engine              │
│  DB: SQLite via sql.js, Drizzle ORM (6 tables), save-on-write    │
└──────────────────────────────────────────────────────────────────┘
```

### Key Characteristics

- **Flat structure** — no service layer on backend; business logic in route handlers
- **Dual data source** — frontend uses mock data initially, syncs to backend
- **In-memory state loss** — rate limiter, notification queue, push subscriptions all volatile
- **No RBAC enforcement** — `roleMiddleware` defined but never applied
- **No auth on notifications** — 6 notification routes are publicly accessible
- **No login page** — frontend loads even without authentication

---

## 2. Target Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                             │
│  Login Page (gate) → Authenticated Pages                         │
│  Role-scoped rendering (admin sees all, phuta sees own class)    │
│  Same 25 components, same 6 pages + 1 login page                 │
└────────────────────────────┬─────────────────────────────────────┘
                             │ reads/writes
┌────────────────────────────▼─────────────────────────────────────┐
│                     STATE LAYER (Client-side)                     │
│  Zustand stores → persist to Dexie (offline-first pattern)       │
│  Stores call REST API directly (not just sync queue)             │
│  Sync engine: fix deltaSync, add gradeStore update sync          │
│  Remove mock data as default — real data comes from server       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP (JSON + JWT)
┌────────────────────────────▼─────────────────────────────────────┐
│              BACKEND SERVICE LAYER (Hono + Drizzle)               │
│  ├── Middleware: authMiddleware + roleMiddleware (enforced)       │
│  ├── Routes: 7 files (new: users.ts)                             │
│  ├── Services layer: extract business logic from routes           │
│  ├── DB: 13 tables (6 existing + 7 new), Drizzle ORM             │
│  ├── Migrations: versioned scripts (not schema auto-push)        │
│  └── Notifications: persistent queue, history table              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Folder Responsibilities (Target)

```
src/                          ─ Frontend application
├── main.tsx                  ─ Entry: Sentry init + DB init + Router
├── router.tsx                ─ Routes + auth guard + layout
├── pages/                    ─ 7 lazy-loaded route pages
├── components/
│   ├── common/               ─ Shared across desktop/mobile
│   ├── desktop/              ─ Desktop-only (large screens)
│   └── mobile/               ─ Mobile-only (touch-first)
├── stores/                   ─ Zustand state containers
├── hooks/                    ─ React hooks (side effects)
├── lib/                      ─ Pure utilities, API client, sync engine
├── utils/                    ─ Pure functions (grades, sacraments)
├── types/                    ─ TypeScript type definitions
└── __tests__/                ─ Vitest unit + integration tests

server/src/                   ─ Backend application
├── index.ts                  ─ Entry: Hono app, middleware, routes
├── routes/                   ─ Route handlers (thin — delegate to services)
├── services/                 ─ Business logic layer
├── middleware/                ─ Auth, security, role guards
├── db/
│   ├── schema.ts             ─ Drizzle schema (all 13 tables)
│   ├── index.ts              ─ SQL.js init + connection
│   └── migrations/           ─ Versioned SQL migration scripts
├── utils/                    ─ Shared utilities
├── seed.ts                   ─ Database seed
└── __tests__/                ─ Backend tests
```

## 4. Layer Boundaries

| Layer | Can Import From | Cannot Import From |
|-------|----------------|-------------------|
| `pages/` | `components/`, `stores/`, `hooks/`, `utils/`, `lib/` | `server/` |
| `components/` | `stores/`, `hooks/`, `utils/`, `lib/` | `pages/`, `server/` |
| `stores/` | `lib/`, `utils/`, `types/` | `components/`, `pages/`, `hooks/` |
| `hooks/` | `stores/`, `lib/`, `utils/` | `components/`, `pages/` |
| `lib/` | `types/` | `stores/`, `components/`, `pages/`, `hooks/` |
| `utils/` | `types/` | `stores/`, `components/`, `pages/`, `hooks/`, `lib/` |
| `routes/` (server) | `services/`, `middleware/`, `db/`, `utils/` | `client/` |
| `services/` (server) | `db/`, `utils/` | `routes/`, `middleware/` |

## 5. Dependency Rules

1. **No circular imports** — stores must not import other stores directly; use `getState()` for cross-store reads
2. **No server code in client** — `server/` is never imported from `src/`
3. **Routes delegate to services** — route handlers should be < 20 lines; business logic lives in services
4. **Services are stateless** — all state goes to DB or in-memory caches with persistence
5. **Pure functions are pure** — `utils/` functions have no side effects (no API calls, no store writes)
6. **Hooks own side effects** — `useSyncEngine.ts` orchestrates sync; components only call hooks

## 6. Key Architectural Decisions (ADRs)

| ADR | Decision | Reason |
|-----|----------|--------|
| ADR-001 | Single-Parish Modular Monolith | 1–3 devs, no distributed complexity |
| ADR-002 | Dexie.js (IndexedDB) for offline | Multi-MB cache, background queue |
| ADR-003 | Hono + Drizzle + SQL.js | Type-safe, zero native deps |
| ADR-004 | Zustand > Redux/Context | Simpler, no Provider wrapper |
| ADR-005 | Tailwind v4 custom > shadcn/ui | Full control, TNTT branding |
| ADR-006 | LWW + Queue > CRDT | Rare conflicts in 1 parish |
| ADR-007 | Keep `/api/` prefix | Existing clients + tokens |
| ADR-008 | Role-based RBAC > capability | 4 roles, sufficient for now |
