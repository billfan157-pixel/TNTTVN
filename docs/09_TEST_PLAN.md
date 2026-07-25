# Test Plan
> Version: 1.1 | Last reviewed: 2026-07-25 | Status: ✅ Current (counts corrected) | Prerequisites: 01

## Current Coverage

### Server Tests (12 files)
| File | Description | Priority |
|------|-------------|----------|
| `students.test.ts` | Student route handler auth guards | P1 |
| `grades.test.ts` | Grade route handler auth guards | P1 |
| `attendance.test.ts` | Attendance route handler auth guards | P1 |
| `notices.test.ts` | Notice route handler auth guards | P1 |
| `auth-routes.test.ts` | Login/refresh/me/change-password | P1 |
| `users-routes.test.ts` | User CRUD + status/reset/force-logout | P1 |
| `auth-middleware.test.ts` | authMiddleware + roleMiddleware | P1 |
| `security-middleware.test.ts` | Rate limiter, security headers | P1 |
| `studentService.test.ts` | Student service CRUD | P2 |
| `gradeService.test.ts` | Grade service upsert + batch | P2 |
| `attendanceService.test.ts` | Attendance service upsert + batch | P2 |
| `noticeService.test.ts` | Notice service CRUD | P2 |

### Client Tests (9 files)
| File | Description | Type |
|------|-------------|------|
| `grades.test.ts` | Pure utility functions (25 tests) | Unit |
| `sync-engine.test.ts` | Queue operations, retry, backoff (~30 tests) | Integration |
| `zustandStores.test.ts` | Store state + actions | Unit |
| `gradeStore.test.ts` | Upsert, batch, average calculation | Unit |
| `dailyGradeStore.test.ts` | Daily grade entry store | Unit |
| `StudentModal.test.tsx` | Form validation, sacraments | Component |
| `DesktopGradeMatrix.test.tsx` | Matrix rendering, inline edit | Component |
| `HeaderBar.test.tsx` | Theme toggle, sync status | Component |
| `OfflineBanner.test.tsx` | Offline indicator | Component |

### E2E Tests (Playwright)
- Login flow + auth guard
- Student CRUD (admin)
- Grade entry + matrix batch edit
- Attendance flow
- Role-scoped flows (phuta, chunhiem)

---

## Coverage Gaps

| Area | Status |
|------|--------|
| Frontend components (36) | **9 of 36 tested** (25%) |
| Frontend pages (12) | **0 tested** |
| Backend routes (9) | **8 of 9 tested** (89%) |
| Backend services (10) | **4 of 10 tested** (40%) |
| Backend middleware (2) | **2 of 2 tested** (100%) |
| E2E flows | Login, CRUD, roles covered |

### Backend Untested
- notifications route
- telegram, smartNotifications, notificationQueue, templateEngine services

### Coverage Configuration
- Provider: v8
- Thresholds: lines 40%, functions 45%, branches 30%, statements 40%

---

## Running Tests

```bash
# Unit + Integration (Vitest)
npm test                    # vitest run
npm run test:watch          # vitest (watch mode)

# E2E (Playwright)
npm run test:e2e            # playwright test

# Coverage
npx vitest --coverage

# Server tests only (from root)
npx vitest run server/src/__tests__/
```
