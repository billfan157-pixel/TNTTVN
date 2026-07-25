# Refactor Rules

> Rules to follow during the Master Execution Plan to maintain consistency and avoid regression.
> Version: 1.1 | Last reviewed: 2026-07-25 | Status: ✅ Current (cleaned) | Prerequisites: 01, 04

## 1. Database Changes

1. **Never drop columns** — add new ones, migrate data, then mark old as deprecated
2. Always add `parishId` to new tables (even if single-parish for now)
3. All new tables need `createdAt`, `updatedAt`, `updatedBy`
4. Use `text` for SQLite — never `integer` for booleans (use `0`/`1` as integer)
5. Run migration on a copy of `parish.db` before production
6. Audit log every schema change in `audit_logs`

## 2. API Changes

1. Keep `/api/` prefix for all routes (except `/health` which is mounted at root)
2. New routes must have auth middleware (no `NONE` exceptions)
3. Always validate input with Zod (`zValidator('json', ...)`)
4. Return consistent status codes: 200 (ok), 201 (created), 204 (deleted), 400 (bad req), 401 (unauth), 403 (forbidden), 404 (not found), 409 (conflict), 501 (not implemented)
5. Add rate limiting to new public endpoints
6. New endpoints must have OpenAPI-compatible JSDoc

## 3. Frontend Changes

1. Never remove Zustand stores — add or merge
2. New pages go in `src/pages/`, new components in `src/components/{common,desktop,mobile}/`
3. Mobile-first layout — `useEffectiveMode` and `useFilterSearchSync` govern layout mode; components may have separate desktop/mobile implementations under `components/{desktop,mobile}/`
4. All new data-fetching must go through the sync queue (not direct API calls)
5. New stores must use `persist` middleware with `dexieStorage` for offline support
6. Always handle loading, empty, and error states in new components

## 4. Sync Engine Changes

1. The sync queue is append-only — never delete entries
2. Conflict resolution: LWW (last-writer-wins) with 409 auto-skip
3. Max 5 retries with exponential backoff (2s→4s→8s→16s→32s→60s cap)
4. Delta sync must pass `updatedAfter` query param (fix current broken implementation first)
5. Queue compaction only for processed entries >7 days old

## 5. Execution Order

The Master Execution Plan was executed as 9 sequential phases. See `10_MASTER_EXECUTION_PLAN.md` for the complete phase-by-phase summary.

Dependency principle: phases are sequential. Later phases depend on earlier ones. When adding a new feature, follow the same bottom-up order:
1. Schema + DB layer first
2. Service layer
3. API routes
4. Frontend stores + components

## 6. Refactoring Process

1. **Read first** — understand the file's full context before editing
2. **One concern per commit** — never mix refactor + feature in same change
3. **Tests before refactor** — for any file with <50% coverage, write tests first
4. **No dead code left behind** — if you rename/remove a function, remove all references
5. **Update docs** — if you change a public API or store shape, update the relevant doc
6. **Lint before commit** — run `npm run lint` (oxlint)

## 7. What NOT to Do

- No global state for server data (use stores with sync)
- No direct DOM manipulation (use React refs sparingly)
- No `any` type assertions
- No `// eslint-disable-next-line` without justification comment
- No console.log in production code (use Sentry or logger)
- No duplication of mock data in test files (import from `src/data/mockParishData.ts`)
