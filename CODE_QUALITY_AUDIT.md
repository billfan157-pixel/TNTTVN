# 🔬 Comprehensive Code Quality, Technical Debt & Performance Audit
## TNTT Parish Management Platform (`brave-davinci`)

> **Document Version:** 1.0  
> **Inspection Date:** 2026-07-24  
> **Target Scope:** 100% Static Code Inspection across `src/` and `server/`  
> **Audit Focus:** Code Smells, Dead Code, Circular Coupling, Duplicate Logic, Over-engineering, Naming Consistency, Component Complexity, Store Risks, Bundle Metrics, Performance Bottlenecks, React Anti-patterns, and TypeScript Integrity.

---

## 📋 Table of Contents

1. [Executive Summary & Quality Scorecard](#1-executive-summary--quality-scorecard)
2. [Dimension 1: Code Smells](#dimension-1-code-smells)
3. [Dimension 2: Dead Code & Orphan Assets](#dimension-2-dead-code--orphan-assets)
4. [Dimension 3: Circular Dependencies & Store Coupling](#dimension-3-circular-dependencies--store-coupling)
5. [Dimension 4: Duplicate Logic & Redundant Code](#dimension-4-duplicate-logic--redundant-code)
6. [Dimension 5: Over-Engineering & Unnecessary Complexity](#dimension-5-over-engineering--unnecessary-complexity)
7. [Dimension 6: Naming Consistency & Conventions](#dimension-6-naming-consistency--conventions)
8. [Dimension 7: Component Complexity & Monolithic Views](#dimension-7-component-complexity--monolithic-views)
9. [Dimension 8: Store Complexity & Optimistic Mutation Risks](#dimension-8-store-complexity--optimistic-mutation-risks)
10. [Dimension 9: Bundle Size & Asset Distribution Analysis](#dimension-9-bundle-size--asset-distribution-analysis)
11. [Dimension 10: Performance Bottlenecks & DOM Virtualization](#dimension-10-performance-bottlenecks--dom-virtualization)
12. [Dimension 11: React Anti-patterns & State Synchronization Bugs](#dimension-11-react-anti-patterns--state-synchronization-bugs)
13. [Dimension 12: TypeScript Type Safety & Loose Casts](#dimension-12-typescript-type-safety--loose-casts)
14. [Actionable Remediation Prioritized Roadmap](#actionable-remediation-prioritized-roadmap)

---

## 1. Executive Summary & Quality Scorecard

| Quality Dimension | Score (1–10) | Status | Key Finding |
|---|:---:|:---:|---|
| **Code Smells** | **6.5 / 10** | 🟡 Warning | Hardcoded magic academic years (`2025 - 2026`); Store persistence desync in `resetStores.ts`. |
| **Dead Code** | **7.0 / 10** | 🟡 Warning | Unused `roleMiddleware` in `auth.ts`; 182-line `mockParishData.ts` bundled in production. |
| **Store Coupling** | **7.5 / 10** | 🟢 Good | Tight coupling between Zustand stores and `syncService.ts` enqueue functions. |
| **Duplicate Logic** | **6.0 / 10** | 🟡 Warning | Duplicated grade calculation and filtering logic between desktop and mobile components. |
| **Over-Engineering** | **8.0 / 10** | 🟢 Good | Overall pragmatic, but `useFilterSearchSync.ts` introduces unnecessary URL state sync complexity. |
| **Naming Consistency** | **7.0 / 10** | 🟡 Warning | DB column `score_1_period` vs TS property `score1Period`; role keys `chunhiem` vs `Xứ Đoàn Trưởng`. |
| **Component Complexity**| **6.0 / 10** | 🟡 Warning | Monolithic components: `DesktopGradeMatrix.tsx` (416 lines), `DesktopDashboard.tsx` (380+ lines). |
| **Store Risks** | **5.5 / 10** | 🔴 Critical | `gradeStore.ts` line 39 returns early without calling `syncUpsertGrade`; missing optimistic rollbacks. |
| **Bundle Metrics** | **7.5 / 10** | 🟢 Good | ~332.82 KB gzipped JS; Lucide icon bundle (`123.29 KB`) needs tree-shaking optimization. |
| **Performance** | **6.5 / 10** | 🟡 Warning | Un-virtualized 200+ row table rendering in `DesktopGradeMatrix.tsx`. |
| **React Anti-patterns** | **6.5 / 10** | 🟡 Warning | `useFilterSearchSync.ts` L61 early return bug when clearing filters; inline raw hex styles. |
| **TypeScript Integrity** | **6.5 / 10** | 🟡 Warning | 10 API client methods in `src/lib/api.ts` returning `request<any[]>` / `request<any>`. |
| **Overall Score** | **6.7 / 10** | 🟡 **Acceptable MVP — Requires Targeted Code Quality Refactoring** |

---

## Dimension 1: Code Smells

### 1.1 Store Persistence Desynchronization (`src/stores/resetStores.ts`)
- **Location**: `src/stores/resetStores.ts` (Lines 6–10)
- **Code**:
  ```typescript
  export function resetAllStoresToDefault() {
    useStudentStore.getState().setStudents(MOCK_STUDENTS)
    useGradeStore.getState().setGrades(MOCK_GRADES)
    useAttendanceStore.getState().setAttendance(MOCK_ATTENDANCE)
  }
  ```
- **Defect**: Resets memory state in Zustand, but **fails to purge Dexie IndexedDB tables** (`db.stores`, `db.syncQueue`). Upon browser refresh, Dexie re-hydrates old stored state, overwriting the reset memory state.

### 1.2 Scattered Hardcoded Magic Constants
- **Locations**: `src/components/desktop/DesktopGradeMatrix.tsx` (Line 18), `src/components/desktop/DesktopAttendanceGrid.tsx`, `src/components/common/StudentModal.tsx` (Line 61).
- **Code**: `const ACADEMIC_YEAR = '2025 - 2026';` hardcoded as literal string constants across multiple files.
- **Remediation**: Extract `CURRENT_ACADEMIC_YEAR` to a central config file (`src/utils/sacraments.ts` or `src/config/index.ts`).

### 1.3 Inconsistent Entity ID Resolution (`src/lib/syncService.ts`)
- **Location**: `src/lib/syncService.ts` (Lines 31 & 42)
- **Code**:
  - Line 31 (Grade): `data.id as string || data.studentId as string`
  - Line 42 (Attendance): `data.id as string || `${data.studentId}-${data.date}-${data.type}``
- **Smell**: Grade resolution uses `studentId` as fallback ID (overwriting multiple semester grade records for the same student in queue compaction), whereas Attendance creates a composite key.

---

## Dimension 2: Dead Code & Orphan Assets

### 2.1 Unused Server Security Middleware (`server/src/middleware/auth.ts`)
- **Location**: `server/src/middleware/auth.ts` (Lines 52–60)
- **Code**:
  ```typescript
  export function roleMiddleware(...roles: string[]) { ... }
  ```
- **Finding**: Function is defined and exported, but **never imported or applied** in any server route (`server/src/routes/*.ts`).

### 2.2 Production Mock Data Overhead (`src/data/mockParishData.ts`)
- **Location**: `src/data/mockParishData.ts` (182 lines, 17.0 KB)
- **Finding**: Stores large static arrays (`MOCK_STUDENTS`, `MOCK_GRADES`, `MOCK_ATTENDANCE`, `MOCK_NOTICES`). These arrays remain bundled into client production JS even after live REST backend persistence is active.

---

## Dimension 3: Circular Dependencies & Store Coupling

### 3.1 Store-to-Service Tight Coupling
- **Flow**: `studentStore.ts` imports `syncService.ts` $\rightarrow$ `syncService.ts` imports `useSyncStore` $\rightarrow$ `syncStore.ts` imports `db.ts`.
- **Finding**: High coupling between state management layers and sync queue processing. Disabling offline sync requires modifying store mutation methods directly.

---

## Dimension 4: Duplicate Logic & Redundant Code

### 4.1 Grade Average & Evaluation Logic Duplication
- **Locations**: `src/utils/grades.ts`, `src/components/desktop/DesktopGradeMatrix.tsx`, `src/components/mobile/MobileGradeView.tsx`.
- **Finding**: Grade average calculations, rounding logic, and academic status labels (*Giỏi, Khá, Trung bình, Yếu*) are computed independently in desktop and mobile components instead of consuming shared pure functions from `src/utils/grades.ts`.

### 4.2 Class Filtering & Student Search Processing
- **Locations**: `src/components/desktop/DesktopStudentList.tsx`, `src/components/mobile/MobileStudentsView.tsx`.
- **Finding**: Search query matching (*holyName + fullName + code*) and branch filtering logic are duplicated across desktop table views and mobile touch card views.

---

## Dimension 5: Over-Engineering & Unnecessary Complexity

### 5.1 Fragile URL-Store Synchronization Hook (`src/stores/useFilterSearchSync.ts`)
- **Location**: `src/stores/useFilterSearchSync.ts` (77 lines)
- **Finding**: Manually subscribes to Zustand `filterStore` changes to synchronize URL query parameters via `@tanstack/react-router`. It uses manual `setTimeout` debouncers and explicit change checks (`changed = false`), introducing edge-case bugs when clearing filter dropdowns.

---

## Dimension 6: Naming Consistency & Conventions

### 6.1 Database Column vs TypeScript Property Mismatches
- **Database Column**: `score_1_period` in `server/src/db/schema.ts` (Line 44).
- **TypeScript Interface**: `score1Period` in `src/types/index.ts` (Line 52).
- **REST Body**: `score1Period` in JSON payloads.
- **Finding**: Requires manual mapping layer in Drizzle queries to handle snake_case to camelCase conversions.

### 6.2 Domain Role Key Naming
- **Backend Schema**: `role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'` (Vietnamese lowercase keys).
- **UI Labels**: "Admin", "Xứ Đoàn Trưởng", "Giáo Lý Viên", "Phụ Huynh" (Vietnamese display names).
- **Finding**: Lack of shared `ROLE_LABELS` dictionary causes inline ternary labels across components.

---

## Dimension 7: Component Complexity & Monolithic Views

### 7.1 Monolithic Desktop Views
- **`src/components/desktop/DesktopGradeMatrix.tsx`**: **416 lines**  
  *Contains*: Matrix data initialization, state memoization, TanStack Table setup, debounced save callbacks, cell input renders, and summary statistics.
- **`src/components/desktop/DesktopDashboard.tsx`**: **380+ lines**  
  *Contains*: KPI calculations, top student rankings, attendance charts, notice feeds, quick action buttons.
- **`src/components/common/StudentModal.tsx`**: **350+ lines**  
  *Contains*: Form state, validation logic, branch selectors, sacrament date pickers.

---

## Dimension 8: Store Complexity & Optimistic Mutation Risks

### 8.1 Critical Bug in `gradeStore.ts` (`L35-40`)
- **Location**: `src/stores/gradeStore.ts` (Lines 35–40)
- **Code**:
  ```typescript
  if (existingIndex >= 0) {
    const updated = [...state.grades]
    grade = { ...updated[existingIndex], ...gradeData }
    updated[existingIndex] = grade
    return { grades: updated } // ❌ RETURNS EARLY WITHOUT CALLING syncService!
  }
  ```
- **Risk**: Edits to existing grades update memory state but **never queue to offline sync**, causing data loss on server sync.

### 8.2 Missing Optimistic State Rollbacks
- **Affected Stores**: `studentStore.ts`, `gradeStore.ts`, `attendanceStore.ts`.
- **Risk**: When mutations are enqueued, memory state updates immediately. If the server rejects the mutation (e.g. 400 Bad Request or 403 Forbidden), memory state remains out-of-sync with the server DB.

---

## Dimension 9: Bundle Size & Asset Distribution Analysis

### 9.1 Build Output Size Breakdown
- **Total JS Bundle**: **~332.82 KB** (`dist/assets/index-CtIq7zrk.js` — **103.81 KB gzipped**).
- **Total CSS Bundle**: **~48.58 KB** (`dist/assets/index-Djvm_-XB.css` — **9.77 KB gzipped**).
- **Lucide Icon Pack**: **~123.29 KB** (`dist/assets/createLucideIcon-BmiFUKgt.js` — **40.45 KB gzipped**).
- **Finding**: Lucide icon bundle contributes ~37% of total JS bundle. Needs named import tree-shaking audit.

---

## Dimension 10: Performance Bottlenecks & DOM Virtualization

### 10.1 Un-Virtualized Data Grid Rendering
- **Location**: `src/components/desktop/DesktopGradeMatrix.tsx` & `DesktopStudentList.tsx`.
- **Bottleneck**: Renders all 200+ student rows simultaneously into the DOM `<table>`. When editing input cells, all rows re-evaluate, causing frame drops on low-spec parish PCs.
- **Remediation**: Integrate `@tanstack/react-virtual` to render only visible viewport rows (~15–20 rows).

### 10.2 Matrix State Initialization Overhead
- **Location**: `DesktopGradeMatrix.tsx` (Lines 51–75).
- **Bottleneck**: `useEffect` maps through `filteredStudents` and performs array `.find()` queries on `grades` for every student row on class change, causing secondary re-renders.

---

## Dimension 11: React Anti-patterns & State Synchronization Bugs

### 11.1 Filter Reset Early Return Bug (`src/stores/useFilterSearchSync.ts`)
- **Location**: `src/stores/useFilterSearchSync.ts` (Lines 43–61)
- **Code**:
  ```typescript
  if (state.selectedClassId !== prev.selectedClassId) {
    if (state.selectedClassId === 'all') params.delete('classId')
    else { params.set('classId', state.selectedClassId); changed = true }
  }
  ...
  if (!changed && !params.toString()) return // ❌ BUG: Early returns when resetting to 'all'!
  ```
- **Bug**: Resetting a filter to `'all'` deletes the search param but does NOT set `changed = true`. When all filters are cleared, `!changed` is true and `!params.toString()` is true, causing the function to return early without clearing the URL!

### 11.2 Raw Hex Colors Bypassing Dark Mode
- **Location**: `src/components/mobile/MobileGradeView.tsx` (Lines 30, 45, 138, 177).
- **Anti-pattern**: Uses inline style objects with raw hex colors (`style={{ background: '#1E3A8A', color: '#0F172A' }}`), preventing dark mode CSS custom property transitions.

---

## Dimension 12: TypeScript Type Safety & Loose Casts

### 12.1 Loose API Client Return Types (`src/lib/api.ts`)
- **Location**: `src/lib/api.ts` (Lines 99–138)
- **Code**:
  ```typescript
  getStudents: () => request<any[]>('GET', '/students'),
  getStudent: (id: string) => request<any>('GET', `/students/${id}`),
  getGrades: () => request<any[]>('GET', '/grades'),
  getAttendance: () => request<any[]>('GET', '/attendance'),
  ```
- **Defect**: Uses `any[]` and `any` instead of strong generic types (`request<Student[]>`, `request<GradeRecord[]>`).

### 12.2 Loose Type Casts in Hooks
- **Location**: `src/hooks/useInstallPrompt.ts` (Line 20)
- **Code**: `if ((navigator as any).standalone || ...)`
- **Remediation**: Extend `Navigator` interface in `src/types/index.ts` instead of `as any`.

---

## Actionable Remediation Prioritized Roadmap

### 🔴 Critical Fixes (Immediate)
1. **Fix `gradeStore.ts` Sync Bug**: Update line 39 to call `syncService.syncUpsertGrade(grade)` before returning.
2. **Fix `useFilterSearchSync.ts` Bug**: Set `changed = true` whenever a query parameter is deleted.
3. **Attach `roleMiddleware`**: Attach `roleMiddleware('admin')` to administrative REST routes in `server/src/routes/`.
4. **Purge Dexie on Store Reset**: Update `resetStores.ts` to clear Dexie tables (`db.stores.clear()`, `db.syncQueue.clear()`).

### 🟠 High Priority Refactoring (Phase 1–2)
5. **Type Safety in API Client**: Replace `any[]` return types in `src/lib/api.ts` with strong domain types (`Student[]`, `GradeRecord[]`).
6. **Centralize Academic Year**: Replace hardcoded `'2025 - 2026'` strings with `CURRENT_ACADEMIC_YEAR` constant from `src/utils/sacraments.ts`.
7. **Virtualize Table Rows**: Integrate `@tanstack/react-virtual` in `DesktopGradeMatrix.tsx` for large rosters.
8. **Extract Inline Styles**: Replace raw hex styles in mobile views with Tailwind CSS utility classes.

---
*End of Code Quality, Technical Debt & Performance Audit Report.*
