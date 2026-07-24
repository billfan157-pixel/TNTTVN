# Test Plan

---

## Current Coverage

| Layer | Tests | File | Type | Lines |
|-------|-------|------|------|-------|
| Business Logic | 25 | `grades.test.ts` | Unit | 253 |
| Sync Engine | ~30 | `sync-engine.test.ts` | Integration | 445 |
| E2E | 5 | `app.spec.ts` | Playwright | 46 |
| **Total** | **~60** | **3 files** | — | **744** |

### Coverage Gaps

| Area | Current | Target | Gap |
|------|---------|--------|-----|
| Frontend components | 0% | 60%+ | All 25 components untested |
| Frontend pages | 0% | 50%+ | All 6 pages untested |
| Backend routes | 0% | 80%+ | All 6 route files untested |
| Backend services | 0% | 80%+ | All 4 service files untested |
| Backend middleware | 0% | 90%+ | auth.ts, security.ts untested |
| Database schema | 0% | 100% | schema validation untested |
| E2E flows | 5 tests | 15+ | No login, CRUD, role tests |

---

## Testing Priority

### Priority 1: Fix existing tests + add backend tests

The two existing test files are well-written and cover critical paths. Ensure they continue to pass after all fixes.

### Priority 2: Backend route + service tests

Backend has zero tests. Every route handler contains business logic that can regress.

### Priority 3: Component tests for shared components

StudentModal, DesktopGradeMatrix, HeaderBar are used on every page and should be tested.

### Priority 4: E2E for critical user flows

Currently only smoke + attendance. Need login, CRUD student, grades, role-scoped flows.

### Priority 5: Coverage threshold enforcement

Add coverage reporting and enforce minimum thresholds.

---

## Unit Tests

### Where to Add

| File | Component Under Test | Tests | Priority |
|------|---------------------|-------|----------|
| `server/src/__tests__/auth.test.ts` | auth routes (login, refresh, me, change-password) | 8 | P1 |
| `server/src/__tests__/students.test.ts` | student CRUD route logic | 6 | P1 |
| `server/src/__tests__/grades.test.ts` | grade upsert + batch logic | 6 | P1 |
| `server/src/__tests__/attendance.test.ts` | attendance upsert + batch logic | 6 | P1 |
| `server/src/__tests__/notices.test.ts` | notice CRUD | 4 | P1 |
| `server/src/__tests__/auth-middleware.test.ts` | authMiddleware + roleMiddleware | 6 | P1 |
| `server/src/__tests__/security-middleware.test.ts` | rate limiter, security headers | 4 | P1 |
| `server/src/__tests__/notification-queue.test.ts` | enqueue, retry, backoff | 5 | P2 |
| `server/src/__tests__/template-engine.test.ts` | renderTemplate, buildContext | 4 | P2 |
| `src/__tests__/components/StudentModal.test.tsx` | form validation, sacraments | 4 | P2 |
| `src/__tests__/components/DesktopGradeMatrix.test.tsx` | matrix rendering, inline edit | 4 | P2 |
| `src/__tests__/components/HeaderBar.test.tsx` | theme toggle, sync status display | 3 | P3 |
| `src/__tests__/utils/sacraments.test.ts` | getAge, getBranchForAge, getAcademicYear | 8 | P3 |

### Testing Framework
- Vitest (already configured)
- `@testing-library/react` (already in devDependencies)
- `jsdom` (already in devDependencies)
- `fake-indexeddb` (already in devDependencies — used by sync-engine tests)

---

## Integration Tests

### Existing
- `sync-engine.test.ts` — 30 tests covering queue operations, compaction, processing, retry policy, backoff, and full lifecycle

### Where to Add

| Test | Description | Priority |
|------|-------------|----------|
| Store + API integration | Mock API, verify store fetches + syncs correctly | P2 |
| Sync conflict resolution | Test LWW behavior with simulated conflicts | P2 |
| Offline → online transition | Queue accumulates → syncs on reconnect | P2 |
| Dexie schema migration | Test v1 → v2 migration preserves data | P3 |

---

## E2E Tests (Playwright)

### Existing (5 tests)
1. Dashboard loads with header and student count
2. Navigate to Students page via sidebar
3. Navigate to Grades page via sidebar
4. Navigate to Attendance page via sidebar
5. Change student status and save attendance

### Target (15+ tests)

| Test | Priority | Description |
|------|----------|-------------|
| Login flow | P1 | Enter credentials → redirect to dashboard |
| Login with wrong password | P1 | Show error, no redirect |
| Login with locked account | P1 | Show lock message |
| Logout | P1 | Clear session → redirect to login |
| Auth guard | P1 | Access protected page without token → redirect to login |
| Student CRUD (admin) | P1 | Create → verify in list → edit → delete |
| Student CRUD (phuta, own class) | P1 | Verify can only edit own class |
| Student CRUD (phuta, other class) | P1 | Verify cannot edit other class |
| Grade entry | P2 | Enter grade → verify avg calculated |
| Grade matrix batch edit | P2 | Edit multiple → batch save |
| Attendance flow | P2 | Mark present/absent → batch save → verify |
| Report card view | P2 | Open report → verify data |
| Notice CRUD | P2 | Create, view, delete notice |
| Dark mode toggle | P3 | Toggle theme → persists on reload |
| Offline banner | P3 | Go offline → see banner → come online → sync |
| Photo card / certificate | P3 | Open photo card, certificate for a student |
| Promotion panel | P3 | View promotion suggestions |

### Playwright Config Notes
- Already configured (`playwright.config.ts`)
- Use `webServer` to auto-start dev server
- Chromium only (already set)
- Retry 1x on CI (already set)

---

## Coverage Configuration

### Target Thresholds

| Metric | Current | Target (Phase 7) | Target (Final) |
|--------|---------|------------------|-----------------|
| Statements | ~5% | 40% | 65% |
| Branches | ~3% | 30% | 55% |
| Functions | ~8% | 45% | 70% |
| Lines | ~5% | 40% | 65% |

### Implementation

In `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/utils/**', 'src/stores/**', 'src/lib/**', 'server/src/**'],
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 45,
        lines: 40,
      },
    },
  },
})
```

---

## Test Implementation Order

```
Phase 7 (after all fixes):
├── Week 1:
│   ├── server route tests (students, grades, attendance)
│   ├── server middleware tests (auth, security)
│   └── backend achieves 60%+ coverage
├── Week 2:
│   ├── component tests (StudentModal, DesktopGradeMatrix)
│   ├── store tests (gradeStore sync update)
│   └── E2E login flow + auth guard
├── Week 3:
│   ├── remaining component tests
│   ├── remaining E2E flows
│   └── coverage threshold enforcement
```

---

## Running Tests

```bash
# Unit + Integration (Vitest)
npm test                    # vitest run
npm run test:watch          # vitest (watch mode)

# E2E (Playwright)
npm run test:e2e            # playwright test

# Coverage
npx vitest --coverage       # after adding @vitest/coverage-v8

# Server tests (to be added)
cd server && npm test       # when server tests are created
```
