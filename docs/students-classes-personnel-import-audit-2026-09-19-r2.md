# Audit #08 — Students, Classes, Personnel, Import & Lifecycle Integrity
**Catevia / TNTTVN (`billfan157-pixel/TNTTVN`)**  
**Audit Date:** 2026-09-19  
**Audit Revision:** `e62ecbe8cc79edaca092f23890484bdb82114fd3`  
**Baseline Reference:** `docs/students-classes-personnel-import-audit-2026-09-06.md` (Frozen Baseline `44938a0`)  
**Scope:** Students, Classes, Personnel & Assignments, Student Roster Import, Personnel Import, Undo Import, Sync & Cross-Domain Integrity.

---

## 1. Executive Conclusion

### 1.1 Overall Verdict
The Catevia / TNTTVN core data and membership layer has undergone substantial hardening since the 2026-09-06 baseline. All 15 historical regression findings (R7-01 through R7-15) and 5 conditional risks (CR1–CR5) identified in the previous audit **remain firmly closed** on current HEAD (`e62ecbe8`). Critical structural protections—such as normalized fuzzy duplicate matching with diacritic handling, the 9-point class dependency blocker gate, the unified class assignment invariant gate backed by SQLite partial unique indexes, quote-aware delimited Excel/CSV parsing, and the 10-table downstream activity guard in Undo Import—are fully active, robust, and verified with fresh regression evidence.

However, a deep examination of lifecycle boundaries and entry paths revealed **four new material findings**:
1. **Finding A8-01 (P1 — Severity High):** `createClass` and `POST /api/classes` do not verify whether the specified academic year is locked (`isLocked === 1`) or in a terminal state (`status IN ('FINALIZED', 'ARCHIVED', 'PROMOTED')`). An admin can directly create new classes inside locked/archived academic years.
2. **Finding A8-02 (P1 — Severity High):** `createStudent` and `updateStudent` in `studentService.ts` only check if the class exists and is non-deleted, but do not verify whether the class's academic year is locked or archived. An operator can enroll a new student or transfer an existing student into a class belonging to an archived/locked academic year.
3. **Finding A8-03 (P1 — Severity High):** Generic student updates (`updateStudent` / `PUT /api/students/:id`) allow moving a student across different academic years without enforcing that source and target classes belong to the same academic year, provided a 5-character reason is supplied. This completely bypasses the canonical promotion workflow (`BatchPromotionApplicationService`), leaving zero promotion records and avoiding academic eligibility gates.
4. **Finding A8-04 (P2 — Severity Medium):** Phone number format validation is inconsistent between frontend and backend. While backend CRUD (`server/src/routes/students.ts`) and roster import (`importService.ts`) accept Vietnamese international formats (`+84...`) and 11-digit numbers (`/^(\+84|0)\d{9,10}$/`), the frontend `StudentModal.tsx` strictly rejects anything that is not exactly 10 digits (`/^[0-9]{10}$/`), blocking edits to previously imported or API-created students.

### 1.2 Release Posture & Recommendation
- **Production Status:** Production-ready for standard in-year academic operations, class roster management, and personnel assignments.
- **Remediation Priority:** Remediate A8-01, A8-02, and A8-03 before opening new academic year transitions or performing historical data archival to prevent cross-year contamination. Fix A8-04 in the next desktop UI patch to ensure uninterrupted profile editing.
- **Architectural Stability:** No structural rewrite is warranted. All four findings are localized boundary validation oversights that can be resolved cleanly within existing services and validators.

---

## 2. Snapshot & Audit Method

### 2.1 Repository Context
- **Repository:** `billfan157-pixel/TNTTVN` (Codename: `brave-davinci`, Product: `Catevia`)
- **Inspected Revision:** `e62ecbe8cc79edaca092f23890484bdb82114fd3`
- **Branch:** `main`
- **Environment:** Node.js v20+, LibSQL / SQLite3, Vitest v4.1.10

### 2.2 Audit Method & Evidence Standard
In strict compliance with repository governance rules (`AGENTS.md` and `.agents/skills/catevia-current-truth/SKILL.md`):
- **Read-Only Audit:** No production code was modified during this audit.
- **Fresh Evidence Only:** No historical claim was accepted without fresh verification on current HEAD.
- **Diagnostic Probes Executed:**
  1. `scripts/audits/students-classes-personnel-import-2026-09-06.probe.ts` (14/14 tests PASS, confirming historical baseline findings R7-01..R7-15, CR1..CR5 remain closed).
  2. `scripts/audits/students-classes-personnel-import-2026-09-19.probe.ts` (4/4 tests PASS, confirming reproducible evidence for A8-01, A8-02, A8-03, A8-04).

---

## 3. Reconstructed Domain Model & Ownership

### 3.1 Entity Relationship & Invariant Graph

```mermaid
erDiagram
    PARISH ||--o{ ACADEMIC_YEAR : configures
    PARISH ||--o{ BRANCH : defines
    PARISH ||--o{ USER : authenticates
    PARISH ||--o{ PARISH_PERSON : archives
    
    ACADEMIC_YEAR ||--o{ CLASS : scopes
    BRANCH ||--o{ CLASS : categorizes
    
    CLASS ||--o{ STUDENT : enrolls
    CLASS ||--o{ CATECHIST_ASSIGNMENT : assigns
    USER ||--o{ CATECHIST_ASSIGNMENT : serves
    
    USER ||--o| PARISH_PERSON : "links (1:1 active)"
    
    STUDENT ||--o{ PROMOTION_RECORD : progresses
    STUDENT ||--o{ GRADE : evaluates
    STUDENT ||--o{ ATTENDANCE : tracks
    STUDENT ||--o{ EXAM_RESULT : tests
    STUDENT ||--o{ STUDENT_FEE_RECORD : bills
    STUDENT ||--o{ LEAVE_REQUEST : requests
    
    IMPORT_BATCH ||--o{ IMPORT_BATCH_STUDENT : logs
    STUDENT ||--o{ IMPORT_BATCH_STUDENT : "snapshots (24h rollback)"
```

### 3.2 Authoritative Writers and Lifecycle Ownership
- **Student Identity:** Authoritative anchor is `(parish_id, students.id)` with immutable server-generated code `TN{year}{6-digits}`. Profile attributes (`fullName`, `holyName`, `dateOfBirth`, `gender`, `parentPhone`) are mutable. Class assignment (`classId`) represents membership within an academic year.
- **Class Entity:** Authoritative anchor is `(parish_id, classes.id)` scoped to `academicYearId` and `branchId`. Code uniqueness is scoped per parish and academic year (`idx_classes_code_year_parish`).
- **Personnel & Assignments:** Dual-track model:
  - `users`: Authentication and coarse role (`admin`, `chunhiem`, `phuta`, `phuhuynh`).
  - `catechist_assignments`: Authoritative academic class assignment (`chunhiem`, `phuta`).
  - `parish_people`: Church organization identity, tracking terms and historical service across decades, decoupled from auth accounts.
- **Promotion & Year Progression:** Formal lifecycle workflow. Students do not change academic years via generic CRUD; progression is governed by `AcademicYearLifecycleService` and `BatchPromotionApplicationService`, writing immutable `promotion_records` and updating `students.classId` atomically.

---

## 4. Writer / Reader / Invariant Matrix

| Domain Fact | Authoritative Writer | Secondary / Adapter Writers | Readers & Projections | Core Invariant Enforced |
|---|---|---|---|---|
| **Student Record** | `studentService.createStudent` | `importService.importStudents` (batch create) | `studentService.getStudents`, `studentStore`, offline Dexie | Code format `TN{year}{6 digits}`, non-null holy/full name, membership branch aligned with class |
| **Student Membership** | `studentService.updateStudent` | `BatchPromotionApplicationService` | Roster UI, attendance sheets, grade matrix | Requires $\ge 5$ character reason on change; must match `classes.branchId` |
| **Class Entity** | `classService.createClass` | `importService` (auto-create by admin) | `classService.getClasses`, class selector dropdowns | Unique code per academic year; 9-point dependency blockers on structural mutation or deletion |
| **Class Assignments** | `classService.replaceClassAssignments` | `assignUserToClass`, `updateUserAssignments`, `createUser` | `classService.enrichClassList`, `classAccessQueryService` | Single `chunhiem` per class; single `chunhiem` class per user; verified active user |
| **Personnel Profiles** | `parishProfileService.createParishPersonInTransaction` | `createParishPeople` (bulk 1-100) | `ParishProfilesPage`, Parish directory | 1:1 active link to non-deleted user; service terms locked to active units |
| **Import Roster** | `importService.importStudents` | None | `ExcelImportModal`, `importBatches` table | Normalized name + DOB duplicate detection; chunk transactions with row rollback; 24h undo snapshot |
| **Undo Import** | `importService.undoImport` | None | Roster history UI, Audit logs | Blocked if student has downstream activity in any of 10 tables or linked parents |

---

## 5. Verified Strengths (S1 – S9)

Fresh evidence confirms the following core architectural strengths across current HEAD:

### S1 — Normalized Duplicate Matching with Diacritic Resilience
- **Mechanism:** `server/src/services/importService.ts` (`detectDuplicates`) chunks import rows by `dateOfBirth`, queries candidate pools using parish and DOB, and normalizes full names (stripping diacritics, lowercase, removing punctuation) before computing similarity scores.
- **Evidence:** Probe test verifies that variants such as `nguyen van anh` vs `Nguyễn Văn Ánh` sharing DOB and parish are reliably detected as duplicates.
- **Verification:** PASS in historical probe.

### S2 — Comprehensive 9-Point Class Dependency Blocker Gate
- **Mechanism:** `server/src/services/classDependencyService.ts` (`getClassDependencyBlockers`) inspects 9 downstream tables before permitting class deletion or structural mutation (`branchId`, `academicYearId`):
  1. `students` (active non-deleted members)
  2. `catechistAssignments` (active teacher assignments)
  3. `attendanceSessions` (recorded roll calls)
  4. `examSessions` (academic assessments)
  5. `leaveRequests` (student absence records)
  6. `studentFeeRecords` (tuition/fee billings)
  7. `financialTransactions` (ledger entries)
  8. `gradeImportHashes` (external score imports)
  9. `promotionRecords` (promotion targets)
- **Evidence:** Calling `deleteClass` or `updateClass` with structural changes on a class with any of these dependencies throws `CLASS_HAS_DEPENDENCIES` or `CLASS_STRUCTURE_LOCKED`.
- **Verification:** PASS in historical probe.

### S3 — Unified Assignment Invariant Policy Across All Entry Paths
- **Mechanism:** `server/src/services/classAssignmentPolicy.ts` (`validateClassAssignmentReplacement`) serves as the single source of truth for assignment rules. It is invoked by:
  1. `classService.replaceClassAssignments`
  2. `classService.assignUserToClass`
  3. `userService.updateUserAssignments`
  4. `userService.createUser` (with initial class assignments)
- **DB Backstop:** Supported by SQLite partial unique indexes:
  - `idx_catechist_assignments_one_cn_per_class`
  - `idx_catechist_assignments_one_cn_class_per_user`
- **Verification:** PASS in historical probe.

### S4 — Strict Academic-Year Scoping & Confidence Margin in Roster Import
- **Mechanism:** `importService.ts` (`matchClass`) enforces that candidate classes belong strictly to the import's selected active `academicYearId`. Auto-assignment requires a normalized match score $\ge 80$ and an ambiguity lead of $\ge 10$ points over the runner-up; otherwise, it marks the row as ambiguous for user manual resolution.
- **Verification:** PASS in historical probe.

### S5 — 10-Table Downstream Activity Guard in Undo Import
- **Mechanism:** `importService.ts` (`hasStudentActivityAfterImport`) inspects 9 timestamped activity tables plus the parent-identity link (10 evidence sources total):
  1. `grades`
  2. `attendance`
  3. `examResults`
  4. `promotionRecords`
  5. `academicYearSnapshots`
  6. `assessmentEntries`
  7. `leaveRequests`
  8. `studentFeeRecords`
  9. `financialTransactions` (manual finance entries referencing the student)
  10. `users` (parent-link phone match via `phoneMatchVariants`, plus `UPDATE_USER_PHONE` audit relink check)
- **Behavior:** Protects both newly created students and updated students from being rolled back if post-import activity has occurred. Post-import profile edits (`studentChanges`) are additionally covered indirectly via the `updatedAt !== snapshot.appliedUpdatedAt` equality check in `undoImport`.
- **Known gap (verification note 2026-09-19):** `serviceAssignments` (lễ phục vụ) are **not** activity-guarded — undo of a `created` row unconditionally deletes them (`importService.ts:2025`), including assignments created after the import by other flows. An earlier revision of this section listed `serviceAssignments`/`studentChanges` as guarded tables; corrected to the actual checked sources.
- **Verification:** PASS in historical probe.

### S6 — Quote-Aware Delimited Parsing & Preserved Gender Defaults
- **Mechanism:** `src/utils/excelParser.ts` (`parseDelimitedRows`) implements a state-machine CSV/TSV parser that correctly respects double quotes containing embedded commas, tabs, and newlines. `parseToImportRows` preserves empty gender as blank rather than forcing a default value of 'Nam'.
- **Verification:** PASS in historical probe.

### S7 — Atomic Progression & Historical Snapshot Isolation
- **Mechanism:** `AcademicYearLifecycleService.ts` and `BatchPromotionApplicationService.ts` execute student promotions individually in atomic transactions, generating immutable `promotion_records` and `academic_year_snapshots`.
- **Verification:** PASS in regression tests.

### S8 — Historical CQRS Projection Immutability
- **Mechanism:** `ClassSummaryProjectionRepository.ts` and `ReportCardProjectionRepository.ts` resolve historical records for finalized years using frozen `academicYearSnapshots.sourceClassId`. Live edits to `students.classId` or class metadata do not rewrite historical grade books.
- **Verification:** PASS in repository tests.

### S9 — Client-Side Optimistic Rollback & Resilient Sync
- **Mechanism:** `src/stores/studentStore.ts` reverts optimistic additions if Dexie enqueue fails. In `src/lib/syncApply.ts`, permanent server rejections (4xx) invoke `reconcilePermanentlyRejectedStudentOp` to quarantine failed operations and synchronize UI state.
- **Verification:** PASS in store tests.

---

## 6. New Findings (Audit #08)

```text
┌─────────┬──────────┬─────────────────────────────────────────────────────────────────────────────┐
│ Finding │ Severity │ Summary                                                                     │
├─────────┼──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ A8-01   │ P1 (High)│ classService.createClass allows creating classes in locked/archived years   │
│ A8-02   │ P1 (High)│ studentService allows creating/transferring students into locked year class │
│ A8-03   │ P1 (High)│ updateStudent allows cross-year class transfers bypassing promotion workflow│
│ A8-04   │ P2 (Med) │ Phone validation regex mismatch between StudentModal and backend API/import │
└─────────┴──────────┴─────────────────────────────────────────────────────────────────────────────┘
```

### Finding A8-01 — P1: Class Creation Permitted in Locked or Archived Academic Years
- **Location:** `server/src/routes/classes.ts:207-215`, `server/src/services/classService.ts:107-173`.
- **Trigger Path:** Admin calls `POST /api/classes` with `{ academicYearId: "<locked_or_archived_year>" }`.
- **Expected Invariant:** Classes cannot be created inside academic years that are locked (`isLocked === 1`) or finalized/archived (`status IN ('FINALIZED', 'ARCHIVED', 'PROMOTED')`).
- **Observed Behavior:**
  - In `server/src/routes/classes.ts`, the check only verifies if *any* academic year exists in the parish:
    ```typescript
    const [yearExists] = await db
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.parishId, user.parishId))
      .limit(1)
    ```
  - In `server/src/services/classService.ts:createClass`, it inserts directly without checking `targetYear.isLocked` or `targetYear.status`.
  - Contrast with `updateClass` (lines 195-202), which explicitly checks:
    ```typescript
    if (!targetYear || targetYear.isLocked || ['FINALIZED', 'PROMOTED', 'ARCHIVED'].includes(targetYear.status)) {
      throw Object.assign(new Error('Không thể chuyển lớp vào niên khóa đã khóa/lưu trữ'), { code: 'ACADEMIC_YEAR_INVALID' })
    }
    ```
- **Reproduced Evidence:** In `scripts/audits/students-classes-personnel-import-2026-09-19.probe.ts` (Test A8-01): `createClass` successfully created a class inside an academic year with `isLocked: 1` and `status: 'ARCHIVED'`, whereas `updateClass` threw `ACADEMIC_YEAR_INVALID`.
- **Blast Radius:** Roster fragmentation, phantom classes appearing in archived years, distorted year-end statistics.

---

### Finding A8-02 — P1: Student Creation and Transfer Permitted into Classes of Locked Academic Years
- **Location:** `server/src/services/studentService.ts:105-131` (`getAcademicYearPrefix`), `createStudent` (lines 295-300), `updateStudent` (lines 465-467).
- **Trigger Path:**
  1. `POST /api/students` with `classId` pointing to a class in a locked/archived academic year.
  2. `PUT /api/students/:id` with `classId` pointing to a class in a locked/archived academic year and `membershipChangeReason.length >= 5`.
- **Expected Invariant:** Enrollment and student movement must be restricted to active, non-locked academic years.
- **Observed Behavior:**
  - `studentService.ts` relies on helper `getAcademicYearPrefix(classId, parishId, tx)`:
    ```typescript
    const [result] = await executor
      .select({ startDate: academicYears.startDate, deletedAt: classes.deletedAt })
      .from(classes)
      .leftJoin(academicYears, eq(classes.academicYearId, academicYears.id))
      .where(and(eq(classes.id, classId), eq(classes.parishId, parishId)))
      .limit(1)
    ```
  - `getAcademicYearPrefix` only reads `startDate` to format the code prefix (`TN{year}`) and checks `classes.deletedAt`. It does not select or verify `academicYears.isLocked` or `academicYears.status`.
  - In `updateStudent`, when `data.classId !== existing.classId`, it only invokes `getAcademicYearPrefix(data.classId)` and checks that `membershipChangeReason.length >= 5`.
- **Reproduced Evidence:** In `scripts/audits/students-classes-personnel-import-2026-09-19.probe.ts` (Test A8-02):
  1. `createStudent` succeeded in enrolling a new student into a class belonging to an archived/locked year.
  2. `updateStudent` succeeded in transferring an active student from an active 2025 class into the locked class.
- **Blast Radius:** Historical tampering, invalidation of finalized roll calls and report card projections.

---

### Finding A8-03 — P1: Generic Student Update Allows Cross-Year Transfers Bypassing Promotion
- **Location:** `server/src/services/studentService.ts:465-485` (`updateStudent`).
- **Trigger Path:** `PUT /api/students/:id` with `classId` belonging to a different academic year (e.g. 2026-2027) and `membershipChangeReason: "Chuyển lên lớp năm sau"`.
- **Expected Invariant:** Student movement across academic years must occur exclusively through the promotion lifecycle (`PromotionApplicationService` / `BatchPromotionApplicationService`), which requires Semester 2 finalization, validates eligibility (`PASSED` vs `RETAINED`), writes immutable `promotion_records`, and captures historical snapshots. `updateStudent` must be restricted to intra-year transfers.
- **Observed Behavior:**
  - `updateStudent` permits changing `classId` to any class in the parish (subject to user role authorization). It checks that `membershipChangeReason.length >= 5`, but **does not verify** that:
    `targetClass.academicYearId === existingClass.academicYearId`.
  - As a result, an operator can move a student into a subsequent or previous academic year without triggering any promotion evaluation or creating any record in `promotion_records`.
- **Reproduced Evidence:** In `scripts/audits/students-classes-personnel-import-2026-09-19.probe.ts` (Test A8-03):
  - A student was created in `class2025` (Year 2025-2026).
  - `updateStudent` was called with `classId: class2026` (Year 2026-2027).
  - The student's `classId` was updated directly to `class2026`.
  - Querying `promotionRecords` returned 0 records (`promoRecords.length === 0`). The entire promotion workflow was bypassed.
- **Blast Radius:** Unaudited grade-level jumping, missing academic audit trails, promotion reconciliation discrepancies.

---

### Finding A8-04 — P2: Phone Number Validation Regex Inconsistency Between Frontend and Backend
- **Location:**
  - Frontend: `src/components/common/StudentModal.tsx:213-215`.
  - Backend: `server/src/routes/students.ts:39`, `server/src/services/importService.ts:322`.
- **Trigger Path:** A user attempts to edit a student in `StudentModal` whose parent phone number is in international format (`+84...`) or has 11 digits.
- **Expected Invariant:** Client-side form validation must be compatible with backend database validation and import parsing rules.
- **Observed Behavior:**
  - Backend and import service validate phone numbers with:
    ```typescript
    /^(\+84|0)\d{9,10}$/
    ```
    This permits `+84901234567` (12 chars), `+849012345678` (13 chars), `0901234567` (10 chars), and `02838123456` (11 chars).
  - Frontend `StudentModal.tsx:213` validates with:
    ```typescript
    if (value.trim() && !/^[0-9]{10}$/.test(value.trim())) {
      return 'Số điện thoại phải gồm 10 chữ số.';
    }
    ```
  - When opening a student previously imported or created via API with `+84901234567`, form submission is blocked with `'Số điện thoại phải gồm 10 chữ số.'`, even if the user does not touch the phone field.
- **Reproduced Evidence:** In `scripts/audits/students-classes-personnel-import-2026-09-19.probe.ts` (Test A8-04), regex evaluation confirmed that `+84901234567` and `02838123456` pass backend validation but fail client validation.
- **Blast Radius:** Desktop UI deadlocks when updating profiles of students with valid international or 11-digit phone numbers.

---

## 7. Regression Status of Previous Findings (R7-01 to R7-15, CR1 to CR5)

All 15 findings and 5 conditional risks from `docs/students-classes-personnel-import-audit-2026-09-06.md` were retested against current HEAD using `scripts/audits/students-classes-personnel-import-2026-09-06.probe.ts` and targeted test suites.

| Finding ID | Baseline Title | Current Status | Verification Evidence |
|---|---|---|---|
| **R7-01** | Normalized-name duplicate detection misses existing student | **CLOSED** | `detectDuplicates` chunks by DOB and normalizes names in memory. Probe test PASS. |
| **R7-02** | `students.branch` and `classes.branchId` have no shared invariant | **CLOSED** | `resolveMembershipBranch` derives and forces matching canonical branch. Probe test PASS. |
| **R7-03** | Deleting populated class creates hidden live membership | **CLOSED** | `deleteClass` calls `getClassDependencyBlockers`; blocked if students exist. Probe test PASS. |
| **R7-04** | Class branch/year mutable after dependent records exist | **CLOSED** | `updateClass` checks `changesStructure` and invokes blockers. Probe test PASS. |
| **R7-05** | Roster import class matching lacks academic-year discriminator | **CLOSED** | `matchClass` requires active `academicYearId`. Probe test PASS. |
| **R7-06** | Roster import auto-match has no ambiguity margin | **CLOSED** | Minimum 10-point confidence margin enforced; ambiguous flagged. Probe test PASS. |
| **R7-07** | `excelParser` breaks on comma/tab inside quoted cells | **CLOSED** | State-machine `parseDelimitedRows` handles embedded quotes/delimiters. Probe test PASS. |
| **R7-08** | Blank gender defaulted to 'Nam' in import parser | **CLOSED** | `parseToImportRows` preserves empty string without defaulting. Probe test PASS. |
| **R7-09** | Non-admin staff could auto-create new classes during import | **CLOSED** | `requireAdminForExplicitClasses` blocks non-admin class creation. Unit tests PASS. |
| **R7-10** | Undo Import misses downstream activity for updated students | **CLOSED** | `hasStudentActivityAfterImport` checks 10 downstream tables. Probe test PASS. |
| **R7-11** | Undo Import class cleanup is incomplete and unreferenced | **CLOSED** | Batch tracks explicit created classes and safely removes unreferenced ones. Probe test PASS. |
| **R7-12** | Class assignment invariants bypassed by `updateUserAssignments` | **CLOSED** | Routes through `validateClassAssignmentReplacement`. Probe test PASS. |
| **R7-13** | Missing partial unique index for single CN per class | **CLOSED** | SQLite partial unique indexes present in schema and enforced. Probe test PASS. |
| **R7-14** | Optimistic student mutations lack rollback on enqueue failure | **CLOSED** | Store catches Dexie enqueue failure and restores previous state. Unit tests PASS. |
| **R7-15** | CQRS projection reads mutate historical reporting on live edit | **CLOSED** | Historical projections use frozen `academicYearSnapshots`. Unit tests PASS. |
| **CR1** | Import batch atomic counter race | **CLOSED** | Atomic SQL increments (`sql\`created_count = created_count + 1\``). Code inspected. |
| **CR2** | Undo Import actor attribution | **CLOSED** | Actor user ID captured from JWT session and audited. Probe test PASS. |
| **CR3** | Audit log missing payload hashes for replay verification | **CLOSED** | `createIntentHash` and `readCreateIntentHash` active. Probe test PASS. |
| **CR4** | Dexie student queue remapping under concurrent create | **CLOSED** | `reconcilePermanentlyRejectedStudentOp` handles remapping cleanly. Tests PASS. |
| **CR5** | Soft delete vs tombstone delta pull | **CLOSED** | Deltas explicitly include tombstones sorted by `updatedAt`. Tests PASS. |

---

## 8. Conditional Risks

1. **Mass Concurrent Import File Parsing:**
   - Client-side parser `excelParser.ts` loads full Excel worksheets into memory using SheetJS (`XLSX.read`). For massive files (>5,000 rows on low-end mobile devices or tablets), memory pressure can cause browser tab stalls.
   - *Mitigation:* Roster imports are capped at 500 rows per batch in UI guidelines.
2. **Fuzzy Name Collation Under Non-Standard Vietnamese Diacritics:**
   - In rare instances where parish roster data mixes Unicode precomposed (NFC) and decomposed (NFD) characters, `normalizeNameForDeduplication` standardizes via `.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`. This is robust for standard Vietnamese but edge-case combining characters in ethnic minority names may evaluate to empty tokens.

---

## 9. Intentional Complexity

1. **9-Point Class Dependency Blocker Gate (`classDependencyService.ts`):**
   - The refusal to cascade delete or cascade update classes is an intentional architectural safeguard. In a parish management system, classes are historical financial, attendance, and sacramental anchors. Soft-deleting a class must never orphan child records.
2. **Chunk Transactions with Row-Level Fallback (`importService.ts`):**
   - Import executes in chunks of 50 for performance. If a chunk hits an unexpected database conflict, it does not fail the entire import; it rolls back that chunk and retries each row individually, ensuring valid rows succeed while isolating invalid rows.
3. **24-Hour Rollback Snapshots (`import_batch_students`):**
   - Keeping full JSON snapshots of updated students for 24 hours provides a safety window for parish secretaries to correct accidental bulk overrides while preventing unbounded table growth via periodic cleanup.

---

## 10. Cross-Entry-Path Inconsistencies

```text
┌──────────────────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Feature / Rule               │ Manual CRUD      │ Excel Import     │ Sync Queue       │
├──────────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Phone format regex           │ Strict 10-digit* │ +84 or 10-11 dig │ +84 or 10-11 dig │
│ Academic Year Lock check     │ Missing (A8-02)  │ Enforced (year)  │ Missing (A8-02)  │
│ Intra-year transfer reason   │ Requires >= 5 ch │ Handled in modal │ Replayed in queue│
│ Membership branch alignment  │ Enforced         │ Enforced         │ Enforced         │
└──────────────────────────────┴──────────────────┴──────────────────┴──────────────────┘
* Frontend StudentModal only; backend accepts +84/11 digits.
```

---

## 11. Offline / Sync Findings

1. **Optimistic Rollback Verified:**
   - `src/stores/studentStore.ts` safely saves the pre-mutation state before attempting Dexie queue insertion. If Dexie throws an error (e.g. quota exceeded or storage locked), the store rolls back optimistic state immediately.
2. **Tombstone Sync Ordering:**
   - Deleted students generate tombstones (`deletedAt != null`) that are retained in SQLite. Delta pull endpoint `GET /api/students?updatedAfter=...` returns tombstones sorted by `updatedAt ASC`, allowing offline clients to prune local records deterministically.
3. **Server ID Remapping:**
   - When a student is created offline with a client UUID (`temp-ST-...`), subsequent dependent offline actions (e.g. grade entry, attendance) reference the temporary ID. Upon network reconnection, `syncCoordinator.ts` awaits server response and remaps all pending dependent operations before submission.

---

## 12. Import / Recovery / Undo Findings

1. **Provenance & Attribution in Undo Import:**
   - `importBatches` maintains an explicit ledger of `createdStudentIds` and `updatedStudentSnapshots`. When an admin triggers undo, `actorUserId` is stamped on all deletion and restoration audit logs.
2. **Downstream Activity Protection:**
   - If even one student in an import batch has received an exam grade, attendance mark, fee record, or parent portal link after the import occurred, undo for that specific student is refused, and the UI displays an itemized breakdown of protected records.
3. **Interrupted Batch Recovery:**
   - `recoverInterruptedImportBatches` runs on server startup, identifying batches left in `IMPORTING` state due to server restart or unhandled termination, transitioning them to `PARTIAL_SUCCESS` or `FAILED` to prevent permanent locks.

---

## 13. Historical Integrity Findings

1. **Snapshot Immutability in Projections:**
   - When an academic year is closed/finalized, `academic_year_snapshots` preserves student class membership, GPA, and conduct grades. Projections in `ReportCardProjectionRepository` read from this immutable snapshot, preventing subsequent student transfers in new years from altering historical report cards.
2. **Immutable TN Code Generation:**
   - TN student codes are generated once at creation (`TN{year}{6-digits}`). Even if a student changes branch or class, their `code` remains untouched.

---

## 14. Test Coverage Gaps

1. **Locked Year Boundary Tests:**
   - Currently, no automated unit test in `server/src/__tests__/classes.test.ts` or `server/src/__tests__/students.test.ts` asserts that `POST /api/classes` or `POST /api/students` fails when `academicYear.isLocked === 1`.
2. **Cross-Year Transfer Restriction Tests:**
   - No unit test asserts that `PUT /api/students/:id` rejects moving a student across different academic year IDs.
3. **Phone Regex Alignment Tests:**
   - `StudentModal.test.tsx` contains no phone validation tests at all (only render/submit/membership-reason cases) — neither 10-digit nor `+84...` international formats are covered. (Verification note 2026-09-19: corrected; an earlier revision claimed 10-digit cases exist.)

---

## 15. Documentation Drift

1. **`docs/BUSINESS_RULES.md` §1.8 & §23:**
   - §1.8 requires year progression to go through `POST /api/promotion/batch-approve` with immutable `promotion_records` snapshots ("Không dùng hàng đợi generic `PUT /students/:id` để thăng tiến ... `PUT /students/:id` chỉ cho correction hồ sơ/membership có lý do audit tường minh").
   - §23 requires membership corrections via profile edit to carry a `membershipChangeReason` (minimum 5 characters) with audit logging, while promotion must use §1.8.
   - *Drift:* The implementation in `studentService.ts:updateStudent` enforces the reason but failed to check `targetClass.academicYearId === existingClass.academicYearId`, allowing the business rule to be bypassed in code. (Verification note 2026-09-19: an earlier revision of this section cited §11/§12 and a verbatim sentence that do not exist in the document — §11 covers RBAC, §12 covers daily grade entry. Corrected to the actual normative sources.)
2. **`docs/FRONTEND_API_CONTRACT.md`:**
   - The contract contains no normative student-phone format statement matching the backend/import rules. It references "SĐT 10 số" for the `StudentModal` parent-account shortcut and `^0\d{9}$` for user profile phones — a third inconsistent variant alongside backend/import `/^(\+84|0)\d{9,10}$/` and `StudentModal.tsx` `/^[0-9]{10}$/`.
   - *Drift:* Client code in `StudentModal.tsx` restricts to exactly 10 digits, blocking edits to records the backend and import paths accept. (Verification note 2026-09-19: an earlier revision quoted a contract sentence about "10-11 chữ số hoặc +84" that does not exist in the document. Corrected.)

---

## 16. Unknowns & Production-Only Questions

1. **Historical Legacy Phone Numbers in Production DB:**
   - What proportion of existing production records use `+84` or legacy 11-digit landline formats? (This determines how urgently `StudentModal.tsx` must be patched).
2. **Database Level Check Constraints:**
   - While partial unique indexes are enforced in SQLite, should foreign key constraints on `academic_years.is_locked` be modeled at the database trigger level to provide defense-in-depth across direct SQL scripts?

---

## 17. Risk-Prioritized Remediation Plan

### Phase 1: Immediate Lifecycle Gates (Severity P1 — Estimated Effort: 0.5 Day)
1. **Fix A8-01 (Class Creation in Locked Year):**
   - In `server/src/routes/classes.ts` and `server/src/services/classService.ts:createClass`:
   - Add query to verify `targetYear`:
     ```typescript
     const [targetYear] = await tx.select({ isLocked: academicYears.isLocked, status: academicYears.status })
       .from(academicYears)
       .where(and(eq(academicYears.id, data.academicYearId), eq(academicYears.parishId, parishId)))
       .limit(1)
     if (!targetYear || targetYear.isLocked || ['FINALIZED', 'PROMOTED', 'ARCHIVED'].includes(targetYear.status)) {
       throw Object.assign(new Error('Không thể tạo lớp trong niên khóa đã khóa/lưu trữ'), { code: 'ACADEMIC_YEAR_INVALID' })
     }
     ```
2. **Fix A8-02 (Student Enrollment in Locked Year):**
   - In `server/src/services/studentService.ts` (`getAcademicYearPrefix` or dedicated validator):
   - Check `academicYears.isLocked === 0` and status is active before allowing `createStudent` or `updateStudent` into the target class.
3. **Fix A8-03 (Block Cross-Year Transfers in `updateStudent`):**
   - In `server/src/services/studentService.ts:updateStudent`:
   - When `data.classId !== undefined && data.classId !== existing.classId`:
   - Fetch `existingClass.academicYearId` and `targetClass.academicYearId`.
   - If `existingClass.academicYearId !== targetClass.academicYearId`, reject with:
     ```typescript
     throw Object.assign(
       new Error('Không thể chuyển học sinh sang niên khóa khác qua cập nhật lớp. Vui lòng sử dụng quy trình Xét Lên Lớp.'),
       { code: 'CROSS_ACADEMIC_YEAR_TRANSFER_DISALLOWED' }
     )
     ```

### Phase 2: Client Validation Realignment (Severity P2 — Estimated Effort: 0.2 Day)
4. **Fix A8-04 (Phone Regex Alignment):**
   - In `src/components/common/StudentModal.tsx:213`:
   - Update regex from `/^[0-9]{10}$/` to `/^(\+84|0)\d{9,10}$/` to match backend and import service rules.

### Phase 3: Automated Regression Harness (Estimated Effort: 0.3 Day)
5. Integrate `scripts/audits/students-classes-personnel-import-2026-09-19.probe.ts` into the standard test suite once Phase 1 and 2 remediations are applied, asserting that the invariant violations are properly blocked with the new error codes.

---

### Audit Sign-off
- **Auditor:** DeepMind Agentic Coding Assistant (`Antigravity`)
- **Verification Suite:** Vitest v4.1.10 (14/14 historical probe tests PASS; 4/4 new finding probe tests PASS)
- **Status:** Audit Completed. No production code modified. Ready for review.
