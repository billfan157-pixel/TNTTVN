# Architecture
> Version: 1.0 | Last reviewed: 2026-07-25 | Status: ✅ Current | Prerequisites: 01

## 1. Current Architecture

### Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                             │
│  Pages: 12 route pages (Dashboard, Students, Grades, ... Login)  │
│  Components: Desktop/Common/Mobile (~36 total)                    │
│  Router: TanStack Router (12 routes, auth guard on 11)           │
│  State: 15 Zustand stores (6 persist → Dexie, 9 in-memory)      │
└────────────────────────────┬─────────────────────────────────────┘
                             │ reads/writes
┌────────────────────────────▼─────────────────────────────────────┐
│                     DATA LAYER (Client-side)                      │
│  Dexie IndexedDB: Zustand persist (6 stores) + syncQueue         │
│  MOCK_PARISH_DATA: Fallback when no backend / offline            │
│  Sync Engine: syncService.ts → syncProcessor.ts → api.ts (Δ)     │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP (JSON + JWT)
┌────────────────────────────▼─────────────────────────────────────┐
│              BACKEND (Hono + @libsql/client)                       │
│  Auth: JWT (access 15m, refresh 7d), bcrypt, RBAC enforced       │
│  Routes: 9 files, endpoints auth-protected + role-scoped         │
│  Services: 10 files (business logic extracted from routes)       │
│  DB: SQLite via @libsql/client, Drizzle ORM (15 tables), WAL mode│
└──────────────────────────────────────────────────────────────────┘
```

### Key Characteristics

- **Dual data source** — frontend uses mock data initially, syncs to backend
- **Login gate** — LoginPage required before accessing protected routes
- **RBAC enforced** — `roleMiddleware` applied on all CRUD endpoints
- **Class-scoped access** — phuta/phuhuynh limited to assigned classes
- **Notification persistence** — queue + history in DB (no data loss on restart)
- **Push subscriptions** — stored in `push_subscriptions` table
- **Delta sync** — client passes `updatedAfter`, server filters results

---

## 2. Folder Responsibilities

```
src/                          ─ Frontend application
├── main.tsx                  ─ Entry: Sentry init + DB init + Router
├── router.tsx                ─ Routes + auth guard + layout
├── pages/                    ─ 12 lazy-loaded route pages
├── components/
│   ├── common/               ─ Shared across desktop/mobile
│   ├── desktop/              ─ Desktop-only (large screens)
│   └── mobile/               ─ Mobile-only (touch-first)
├── stores/                   ─ 15 Zustand state containers
├── hooks/                    ─ 9 React hooks (side effects)
├── lib/                      ─ Pure utilities, API client, sync engine
├── utils/                    ─ Pure functions (grades, sacraments, export, excelParser, getDefaultDate)
├── types/                    ─ TypeScript type definitions
└── __tests__/                ─ Vitest unit + integration tests (9 files)

server/src/                   ─ Backend application
├── index.ts                  ─ Entry: Hono app, middleware, routes
├── routes/                   ─ 9 route handlers (thin — delegate to services)
├── services/                 ─ 10 business logic service files
├── middleware/                ─ Auth, RBAC, security, role guards
├── db/
│   ├── schema.ts             ─ Drizzle schema (15 tables)
│   └── index.ts              ─ @libsql/client init + connection (WAL mode)
├── seed.ts                   ─ Database seed
└── __tests__/                ─ Backend tests (12 files)
```

## 3. Layer Boundaries

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

## 4. Dependency Rules

1. **No circular imports** — stores must not import other stores directly; use `getState()` for cross-store reads
2. **No server code in client** — `server/` is never imported from `src/`
3. **Routes delegate to services** — route handlers should be < 20 lines; business logic lives in services
4. **Services are stateless** — all state goes to DB or in-memory caches with persistence
5. **Pure functions are pure** — `utils/` functions have no side effects (no API calls, no store writes)
6. **Hooks own side effects** — `useSyncEngine.ts` orchestrates sync; components only call hooks

## 5. Key Architectural Decisions (ADRs)

See `01_PROJECT_AUDIT.md §12` for the complete ADR table with rationale. Key highlights relevant to architecture:

- **ADR-001**: Single-Parish Modular Monolith — no distributed complexity
- **ADR-003**: Hono + Drizzle + @libsql/client — type-safe, zero native deps, WAL mode
- **ADR-006**: LWW + Queue > CRDT — rare conflicts in a single parish
