# Audit Students, Classes, Personnel & Import — 2026-09-06

## 1. Executive conclusion

**Overall verdict: the current model has a sound stable-ID, tenant-scoped and transactional foundation, but is not yet safe enough to treat every roster/class/import entry path as semantically equivalent.** The audit verified five high-impact root causes:

1. normalized student duplicate detection is followed by exact raw-name SQL retrieval, so the system can create a second identity for the same child;
2. class resolution during import has no academic-year discriminator and fuzzy auto-match has no ambiguity margin, so a valid row can be attached to the wrong class without an explicit decision;
3. class delete/update permits live memberships and assignments to become hidden, stale or historically reclassified;
4. the supported user-centric and create-user assignment writers bypass the invariants enforced by the class-centric writer;
5. Undo Import does not protect updated students against downstream records created after import, and its class cleanup/provenance boundary is incomplete.

The test baseline is healthy but insufficient as integrity proof: the repository's existing targeted suite passed **19 files / 163 tests**, while an opt-in database-backed audit probe passed **11/11** assertions of current defective behavior.

Recommended release posture: **fix R7-01, R7-02, R7-05, R7-06 and R7-10/R7-11 before relying on bulk roster import/undo for a new academic year; fix R7-03/R7-04 before further class or personnel assignment expansion.** No rewrite or new service architecture is justified.

> **Post-audit status:** this document preserves the independently verified `44938a0` baseline. Remediation implemented afterward is recorded separately in §15; historical finding text is not rewritten as if it described the original snapshot.

## 2. Snapshot and audit method

### 2.1 Frozen source snapshot

- Branch: `main`
- HEAD: `44938a0e2b1eed749960a2cbcea7c20a2e58b2f0`
- Relationship to remote at audit start: `main...origin/main [ahead 1]`
- Working tree at audit start: one unrelated untracked file, `docs/assessment-question-bank-exam-omr-audit-2026-09-06-r1.md`; it was not read as authority and was not modified.
- Audit-created evidence files:
  - `scripts/audits/students-classes-personnel-import-2026-09-06.probe.ts`
  - `scripts/audits/students-classes-personnel-import-2026-09-06.vitest.config.ts`

All conclusions below are about this local snapshot. No production database or deployed runtime was accessed.

### 2.2 Evidence standard

- `Verified` means deterministic current-source evidence, an existing test, or a reproduced audit probe.
- `Conditional` means the code path exists but requires an infrastructure/concurrency/data precondition not reproduced here.
- Documentation and comments were used only as normative evidence, never as proof of runtime behavior.
- Source locators use the shortest unique repository suffix (for example, `studentService.ts` or `routes/import.ts`) plus current-snapshot line numbers.
- Prior audits/remediations were not assumed correct; relevant paths were retraced from current route through service, transaction, schema, client and tests.

### 2.3 Verification executed

```text
npx vitest run --config scripts/audits/students-classes-personnel-import-2026-09-06.vitest.config.ts
PASS — 1 file / 11 tests

npm run test -- server/src/__tests__/students.test.ts server/src/__tests__/students-import-routing.test.ts server/src/__tests__/classAssignments.test.ts server/src/__tests__/services/studentService.test.ts server/src/__tests__/services/importServiceHelpers.test.ts server/src/__tests__/services/importPerformance.test.ts server/src/__tests__/services/importParishIsolation.test.ts server/src/__tests__/services/importDuplicateDisambiguation.test.ts server/src/__tests__/services/importDeduplicationHardening.test.ts server/src/__tests__/security/import-data-integrity-audit-d.test.ts server/src/__tests__/userLifecycleAtomicity.test.ts server/src/__tests__/userDeletion.test.ts server/src/__tests__/parishProfile.test.ts server/src/__tests__/parent-provision.test.ts src/__tests__/stores/studentStore.test.ts src/__tests__/stores/classStoreSync.test.ts src/__tests__/utils/excelParser.test.ts src/__tests__/utils/parishPersonImport.test.ts src/__tests__/components/StudentModal.test.tsx --fileParallelism=false
PASS — 19 files / 163 tests
```

The first sandbox attempt hit Windows `spawn EPERM`; the same command succeeded outside the sandbox. This is an environment process-spawn limitation, not a product failure.

## 3. Reconstructed model and ownership

### 3.1 Identity and relationship graph

```text
users (account identity + coarse role)
  ├─ catechist_assignments ──> classes ──> branches
  │                               └──────> academic_years
  └─ optional 1:1 active link ──> parish_people (organization identity)

students (stable parish-scoped ID + server-owned code)
  └─ classId ──> classes
      + denormalized students.branch
  ├─ grades / attendance / exam_results / assessment_entries
  ├─ promotion_records / academic_year_snapshots / leave_requests
  ├─ student_fees / notifications / service_assignments
  └─ import_batch_students (short-lived rollback snapshot)
```

Observed ownership:

- Stable child identity is `(parish_id, students.id)`; `students.code` is unique per parish. Neither is client-writable in normal CRUD (`studentService.ts:12-44`, `schema.ts:92-125`).
- `fullName`, `holyName`, dates, parent fields, `branch`, `classId`, status and notes are mutable profile/membership attributes.
- A class is a year-specific roster entity: `(parish_id, class.id)` references a branch and academic year; class code is unique inside `(parish, academicYear)` (`schema.ts:355-380`).
- `users.role` is current coarse authority. `catechist_assignments` is the class relationship authority. `parish_people` is a separate historical/organization identity with an optional one-to-one active account link (`schema.ts:1250-1270`; Business Rules §24).
- Academic history follows stable `studentId`; moving a student does not create a new child record. Promotion snapshots and class movement are atomic on the canonical promotion paths.

### 3.2 Route and role matrix

| Resource/action | admin | chunhiem | phuta | phuhuynh | Effective scope |
|---|---|---|---|---|---|
| Read students/list/detail | yes | yes | yes | no | parish-wide staff roster, intentional |
| Create student | yes | yes | no | no | CN limited to assigned target class |
| Update/transfer student | yes | yes | no | no | CN must own current and target class |
| Delete student | yes | no | no | no | soft delete |
| Read classes | yes | yes | yes | authenticated route currently allows parent too | parish-wide; non-admin projection redacts assignment identities |
| Create/update/delete class | yes | no | no | no | parish |
| Manage class assignments | yes | no | no | no | three production writers exist |
| Validate/import roster | yes | yes | no | no | CN limited to assigned class IDs; no class creation |
| Undo roster import | yes | no | no | no | parish + batch ID |
| Manage `parish_people`/bulk import | yes | no | no | no | parish; bulk 1–100 all-or-nothing |

Important nuance: parent access to `GET /api/classes` exposes class catalog metadata, not student records or assignment identities. It is outside the requested Auth re-audit and no concrete child-data leak was found in this path.

### 3.3 Assignment invariant matrix

| Account role | `roleInClass` accepted by class-centric writer | user-centric/create-user behavior | Runtime consequence |
|---|---|---|---|
| `admin` | `chunhiem` or `phuta` accepted | non-empty user-centric rejected; create-user ignores assignments | policy is inconsistent; admin already bypasses class scope |
| `chunhiem` | accepted after active/class checks and homeroom uniqueness checks | defaults every newly selected class to `chunhiem`; no active/class/homeroom limit checks | can become homeroom of multiple classes |
| `phuta` | accepted after active/class checks | defaults new rows to `phuta`; no active/class validation | can be assigned to deleted class or while inactive |
| `phuhuynh` | rejected | rejected/ignored | fail-closed as intended |

Normative contract: one class has at most one homeroom teacher; one user is homeroom teacher of at most one class; all assignment selections validate same-tenant active class, active account and staff role (Business Rules §11.3/§11.5).

## 4. End-to-end flows

### 4.1 Manual student CRUD

```text
StudentModal
  → studentStore optimistic mutation
  → encrypted user+parish-scoped Dexie queue
  → syncProcessor
  → POST/PUT/DELETE /api/students
  → role + current/target class assignment checks
  → studentService writable allowlist / class lookup / code generation
  → transaction(student + redacted audit)
  → server ID remap + dependent queue remap
```

Create is idempotent through the durable client temp ID used as server `idempotencyKey`; concurrent same-key creates converge on one row. Update cannot rewrite ID/code/parish/timestamps. Full pulls replace the roster; bounded delta pulls include student tombstones.

### 4.2 Import pipeline

```text
.xlsx/.xls/.csv/.txt or pasted text
  → ExcelImportModal read/parse
  → excelParser column detection + row normalization
  → POST /api/students/validate
  → server normalization + duplicate detection + class/mapping match
  → user duplicate/class decisions
  → POST /api/students/import
  → pre-create explicit classes
  → batch row
  → fast create chunks or per-row transactions
       student change + service assignment + audit + rollback snapshot
  → aggregate counts/status + mapping memory + orphan report
  → server-authoritative `studentChanges` tenant-checked into store
  → optional admin Undo Import
```

Partial success is intentional. The correct atomic unit is a row (or a create-only fast chunk), not the whole batch.

### 4.3 Personnel identities

`parish_people` and `users` are intentionally separate. The people import parser handles quoted CSV, exact status normalization, real birth-year bounds and blocks the whole submit if any parsed row is invalid. The server validates all 1–100 rows and writes the batch in one transaction. An active personnel profile can link to at most one same-parish, nondeleted user; deleting an account atomically revokes sessions/assignments and unlinks the profile without deleting historical organization identity.

## 5. Verified Strengths

### S1 — Stable, server-owned student identity and retry-safe create

- Evidence: writable allowlist omits `id`, `code`, `parishId`, timestamps and deletion fields (`studentService.ts:12-44`); create checks active class, generates a year-prefixed code and commits student + audit in one transaction (`studentService.ts:179-319`).
- Backstops: composite student/class FK, unique `(parish,idempotencyKey)` and `(parish,code)` (`schema.ts:92-125`).
- Tests: `studentService.test.ts` covers normal creation, same-key replay, concurrent same-key creation, collision retry, fallback and invalid/deleted class.
- Impact: network-response loss does not create a second student, and profile edits cannot replace the identity anchor.

### S2 — Student soft delete preserves history and produces offline tombstones

- `deleteStudent` sets `deletedAt` and audits atomically rather than cascading academic history (`studentService.ts:394+`).
- Full reads omit deleted rows; deltas deliberately include tombstones in stable `(updatedAt,id)` order (`studentService.ts:49-88`). Client delta reconciliation removes tombstones (`studentStore.ts:52-101`).
- Existing tests verify both tombstone behavior and exclusion from class/report projections.
- This non-cascade behavior is intentional complexity, not a defect: historical grades/attendance/exams retain the same `studentId`.

### S3 — Server-authoritative write scope for normal student routes

- `POST /api/students` requires admin/CN and validates CN target class assignment.
- `PUT /api/students/:id` validates both existing and requested target class for CN.
- Delete is admin-only; all service reads/writes are parish-scoped (`routes/students.ts:47-136`).
- Parish-wide staff roster reading is explicitly separate from write authority and documented as intentional.

### S4 — Canonical promotion flows preserve identity and history

- Year promotion derives new-year classes and commits promotion snapshot + student movement per student transaction (`AcademicYearLifecycleService.ts:750-884`).
- Online manual promotion uses `BatchPromotionApplicationService`, re-evaluates server metrics/policy and moves the same student row with the snapshot in one transaction (`BatchPromotionApplicationService.ts:45-105`).
- This is the correct model: class/year movement changes membership, not student identity.

### S5 — Core import transaction islands and result accounting are materially sound

- Duplicate decisions default to `skip`, including missing/tampered client decisions; intra-file synthetic duplicates cannot be updated as a real student (`importService.ts:451-737`, `1333-1508`).
- Create-only validated rows use chunk transactions; a failed chunk rolls back and falls back to isolated row transactions. Update rows commit student, redacted audit, rollback snapshot and service assignment together.
- `studentChanges` contains only committed rows and client reconciliation rejects another parish (`importService.ts:1508-1564`; `studentStore.ts:112-142`).
- Existing tests cover sibling disambiguation, same-file collisions, default skip, explicit create/update, exact snapshot restoration, 24-hour expiry, chunk fallback, tenant scope, partial/failed counts and 120-row local performance.

### S6 — Class and personnel storage has useful integrity backstops

- Class creation is idempotent and class code is unique per academic year (`classService.ts:104-151`; `schema.ts:379-380`).
- Composite FKs prevent cross-parish student/class, assignment/user/class and most downstream identity breaks.
- The canonical class-centric replacement validates active class, active staff accounts, role validity and homeroom rules, then replaces + audits in one transaction (`classService.ts:400+`).
- Account deletion atomically deactivates the credential, bumps token version, revokes sessions/channels, removes assignments and unlinks `parish_people` (`userService.ts:519-577`).

### S7 — Parish personnel bulk import is safer than roster CSV parsing

- `parishPersonImport.ts:13-106` correctly parses quoted comma/tab data, validates birth year/status and caps 100 rows.
- UI refuses submit unless every row is valid (`ParishBulkImportModal.tsx:54-61`).
- Server performs all rows through `createParishPeople` in one transaction; linked account existence and one-active-profile uniqueness are checked inside it (`parishProfileService.ts:77-102`, `333-374`).

### S8 — Offline identity ownership and remapping are durable

- Student/class mutations are encrypted at rest and scoped by exact user+parish in Dexie.
- Parent creates are flushed before dependent grade/attendance operations; accepted server IDs are awaited and remapped through pending operations (`syncCoordinator.ts:199-250`; `syncApply.ts:96-109`; `syncQueueMaintenance.ts:140+`).
- Permanent 4xx/business conflicts remain quarantined in diagnostics instead of being silently discarded.

## 6. Verified defects

## 6.1 Student Identity Defects

### R7-01 — P0: normalized-name duplicate detection can miss the existing student

- **Trigger path:** `ExcelImportModal → POST /api/students/validate or /import → normalizeImportRows → detectDuplicates → importStudents create`.
- **Expected invariant:** if duplicate identity comparison is defined as normalized name + DOB, retrieval must find every row capable of matching that normalized key.
- **Observed:** `detectDuplicates` builds `nameDobPairs` from the raw trimmed import name (`importService.ts:530-538`) and queries `eq(students.fullName, fn)` (`:600-639`). Only after retrieval are database names normalized into `byNameDob`. A case/diacritic variant is never retrieved and therefore cannot match.
- **Reproduced:** existing `Nguyễn Văn Ánh`, import `nguyen van anh`, same DOB, no usable phone → no duplicate returned (`audit probe`, test “normalized name plus DOB…”).
- **Consequence:** the default import action becomes `create`, yielding two stable student IDs. Grades, attendance, exams, parents and promotion history can then split between identities.
- **Confidence:** high, reproduced against current schema.
- **Root cause:** normalization is applied to in-memory comparison but not to candidate retrieval.

### R7-02 — P1: `students.branch` and `classes.branchId` have no shared invariant

- **Trigger paths:**
  - manual create/update: `POST|PUT /api/students → studentService`;
  - roster import update/create: `importStudents`;
  - class update: `PUT /api/classes/:id → updateClass`.
- **Expected invariant:** a student's membership branch and selected class branch must either agree, or the product must explicitly model and display a justified exception.
- **Observed:** student services validate that a class exists but never compare `students.branch` with `classes.branchId`. Import accepts/invents row branch independently. `updateClass` can rewrite the class branch while member rows remain unchanged.
- **Reproduced:** manual create accepted `branch='HiepSi'` into an `AuNhi` class; changing a populated class from `AuNhi/current year` to `HiepSi/old year` left its student `branch='AuNhi'` (`audit probe`, two tests).
- **Concrete consequence:** notice targeting explicitly keys from `students.branch` while class catalog/grouping keys from `classes.branchId`; the same child can appear in one class branch and receive another branch's communications. Promotion and UI fallback logic may infer different branch labels.
- **Confidence:** high. The denormalized field is intentional; absence of consistency enforcement is not.

## 6.2 Class & Membership Defects

### R7-03 — P1: deleting a populated class creates a hidden live membership and stale authority island

- **Trigger path:** admin `DELETE /api/classes/:id → deleteClass`.
- **Expected invariant:** class deletion must either be blocked while active references exist, or atomically transition/reassign all live membership and authority relationships according to an approved archive policy.
- **Observed:** `deleteClass` only sets `classes.deletedAt`, deactivates mapping memory and writes audit (`classService.ts:195-228`). It does not inspect active students or assignments. `getUserClassIds` reads assignment rows without joining active classes (`classAccessQueryService.ts:32-40`). Student roster reads do not join active class, and an update that keeps the same `classId` does not revalidate the class.
- **Reproduced:** deleting a class with an active student and CN assignment returned success; the student remained active and `getUserClassIds` continued to authorize the deleted class (`audit probe`).
- **UI consequence:** the class disappears from the catalog but its student remains in the parish roster with an unresolvable class ID; the dialog only says deletion is irreversible and does not disclose live dependencies (`DesktopClasses.tsx:117-130`, `643-653`).
- **Downstream consequence:** services that require `classes.deletedAt IS NULL` stop seeing the class, while raw assignment checks and student reads still do. Authorization and domain visibility diverge.
- **Confidence:** high, reproduced.

### R7-04 — P1: class branch and academic year are mutable after dependent records exist

- **Trigger path:** admin `PUT /api/classes/:id → updateClass`.
- **Observed:** `updateClass` writes `branchId` and `academicYearId` without checking active students, exam sessions, attendance sessions, fees, assignments, finalization state or semester/year lock (`classService.ts:154-192`).
- **Reproduced:** a populated current-year `AuNhi` class was rewritten to old-year `HiepSi`; the student membership row was not changed (`audit probe`).
- **Consequence:** lifecycle counts and year projections now classify the same class/members under a different year, while exam sessions and other records retain their own original academic-year fields. This is historical reclassification, not a harmless label edit.
- **Confidence:** high. The exact remediation policy (block versus constrained migration workflow) is product-dependent.

## 6.3 Personnel Assignment Defects

### R7-05 — P1: three supported assignment writers enforce different invariants

- **Writers:**
  1. `POST /api/classes/:id/assignments → assignUserToClass`;
  2. `PUT /api/classes/:id/assignments → replaceClassAssignments`;
  3. `PUT /api/users/:id/assignments → updateUserAssignments`, plus `POST /api/users → createUser(assignedClasses)`.
- **Expected:** Business Rules §11.3/§11.5 requires active class, active staff user, one CN per class and one CN class per user for every writer.
- **Observed:** class-centric writers perform these checks. `updateUserAssignments` only rejects admin/parent; it does not check account status, class active state, one-CN-per-class or one-class-per-CN (`userService.ts:427-475`). `createUser` inserts every selected class with `roleInClass='chunhiem'` for a CN, with only FK existence as a backstop (`userService.ts:124-182`). Soft-deleted classes remain valid FK targets.
- **Reproduced:** the user-centric writer assigned one CN to two classes (`audit probe`).
- **Production callers:** `UserManagementPage.tsx:292` uses user-centric replacement and its create form sends multiple `assignedClasses` (`:256-265`); `DesktopClasses.tsx` uses class-centric replacement. This is not dead code.
- **Consequence:** admin UI choice determines whether core personnel invariants are enforced. Violating rows directly expand class-scoped academic write authority.
- **Confidence:** high, reproduced and contract-backed.

## 6.4 Import Integrity Defects

### R7-06 — P0: import can silently bind a student to the wrong class

Two deterministic mechanisms share one root cause: class matching lacks a mandatory unambiguous cohort identity.

1. **No academic-year discriminator.** `getClasses` returns all nondeleted classes across years (`classService.ts:54-89`), but validation flattens away `academicYearId` (`routes/import.ts:35-55`). `matchClass` and commit-time `findKnownClassId` use first canonical name/code match. The database explicitly allows the same class name across years.
2. **No fuzzy ambiguity margin.** `matchClass` sorts candidates and auto-selects `candidates[0]` whenever its score is at least 80, without comparing the runner-up (`importService.ts:300-364`).

- **Reproduced:** two exact `Ấu Nhi 1` classes in different years matched whichever array element came first; two tied fuzzy candidates above the auto threshold also selected the first (`audit probe`, two tests).
- **UI behavior:** exact/auto matches are treated as resolved. The manual class selector is shown for unmatched/new-class rows, so these ambiguous auto decisions are not forced through user confirmation (`ExcelImportModal.tsx:804-895`).
- **Consequence:** a valid bulk import/update can attach or move children to the wrong cohort. Every subsequent assignment, grade, attendance and exam scope follows that wrong `classId`.
- **Confidence:** high, reproduced. Real-data incidence is unknown.

### R7-07 — P1: missing gender/branch becomes authoritative guessed data

- **Trigger path:** raw spreadsheet row with blank/unknown gender or branch.
- **Observed:** `parseToImportRows` converts every gender not recognized as female—including blank, typo and unknown token—to `Nam` (`excelParser.ts:143-201`). The server then sees an explicit valid value, so its own inference cannot detect absence. Independently, server normalization turns unresolved blank gender into inferred-or-`Nam` and unresolved branch into inferred-or-`ThieuNhi` (`importService.ts:418-447`).
- **Reproduced:** blank spreadsheet gender for `Trần Thị Mai` became `Nam` client-side and remained `Nam` after server normalization (`audit probe`).
- **Consequence:** uncertainty is lost and a heuristic becomes authoritative profile data without a required review decision. Parent/profile/report exports can silently carry false demographic data; default branch can also create the mismatch in R7-02.
- **Confidence:** high. Whether the product wants nullable/unknown gender is not documented; silently claiming a known value is still unsafe.

### R7-08 — P1: validation is a structural write path that CN can invoke

- **Trigger path:** CN calls `POST /api/students/validate` in a parish with no unlocked academic year.
- **Observed:** `validateImport` always calls `getCurrentAcademicYearId`; when none exists, that helper inserts a default academic year with `updatedBy='system'` (`importService.ts:149-180`, `840-855`). Canonical academic-year creation is otherwise admin-only (`routes/classes.ts:137+`).
- **Reproduced:** validating an empty row list in an empty parish created one academic-year row (`audit probe`).
- **Consequence:** preview/dry-run changes governance state and bypasses the normal admin wizard/date confirmation. It may make later onboarding steps believe the year was deliberately created.
- **Confidence:** high, reproduced.

### R7-09 — P1: failed batches can leave active orphan classes that cannot be undone

- **Trigger:** request includes explicit `newClasses`, then every row fails validation or processing.
- **Observed:** classes are committed before `import_batches` and row processing (`importService.ts:1052-1106`). Orphans are only reported after successful completion (`:1566+`). A zero-success batch becomes `failed`, while `undoImport` only accepts `completed|partial|partial_undone` (`:1749-1762`).
- **Reproduced:** an all-error batch left its pre-created class active and Undo rejected the failed batch (`audit probe`).
- **Consequence:** catalog pollution and later accidental matching to a class that was never populated successfully.
- **Confidence:** high, reproduced.

### R7-10 — P0: Undo Import can restore membership across newer downstream activity

- **Trigger path:** import updates an existing student's class/profile; a grade/attendance/exam/etc. is then created without changing `students.updatedAt`; admin invokes Undo within 24 hours.
- **Expected:** dependency guard must apply to every rollback that can invalidate later business records.
- **Observed:** `hasStudentActivityAfterImport` is called only for `snapshot.kind === 'created'` (`importService.ts:1733-1801`). The `updated` branch checks only student-row OCC and restores class/profile fields even when downstream rows were created afterward (`:1802-1827`).
- **Reproduced:** import moved a student A→B, an exam result was created in a B exam, then Undo succeeded and restored the student to A while the B exam result remained (`audit probe`).
- **Additional unsafe cleanup:** imported classes are soft-deleted after Undo based only on absence of active students; assignments, exams and other class dependencies are not checked (`:1840-1851`). The created-student dependency list also omits `student_fees`.
- **Consequence:** recovery itself can create wrong-class academic history or hide a class still referenced by operational data.
- **Confidence:** high for updated-student/exam path; high source confidence for incomplete class/fee checks.

### R7-11 — P1: Undo attribution and UI result reporting are incorrect

- **Actor provenance:** `undoImport(batchId, parishId)` does not accept the current admin ID. It writes `updatedBy`, service assignment creator and `UNDO_IMPORT` audit user as the original `batch.userId` (`importService.ts:1749`, `1797-1833`). If admin B undoes a CN/admin A import, the audit falsely attributes the reversal to A.
- **Partial-result UI:** API returns `{undone, errors}`, but both current-result and history handlers ignore it and always report complete success (`ExcelImportModal.tsx:280-302`, `1130-1138`). The current-result handler reports the original imported count, not actual undone count, and says all were soft-deleted even for restored updates.
- **Consequence:** operators cannot tell which items failed closed and the audit trail names the wrong actor for a destructive recovery.
- **Confidence:** high, direct source path.

### R7-12 — P2: roster CSV/TXT parsing does not implement CSV quoting

- **Observed:** `ExcelImportModal.parseText` chooses a delimiter per line and calls `line.split(delim)`, then trims edge quotes (`ExcelImportModal.tsx:123-137`). A quoted address/name containing comma shifts every following column. XLSX rows are also flattened to tab-delimited text before the same parser.
- **Contrast:** the personnel parser has a real quote-aware state machine (`parishPersonImport.ts:13-37`).
- **Consequence:** a syntactically valid CSV can map phone/address/branch/class into the wrong fields. Preview reduces likelihood but does not make a shifted row invalid in every case.
- **Confidence:** high source evidence; no end-to-end roster CSV fixture currently covers quoted delimiters.

### R7-13 — P2: manual and import DOB bounds differ

- Manual CRUD rejects a birth year before 1900 (`studentService.ts:141-151`).
- Import validation accepts any real past `YYYY-MM-DD`; it only rejects impossible or future dates (`importService.ts:227-253`).
- Consequence is bounded data-quality drift, not identity loss by itself.
- Confidence: high source evidence.

## 6.5 Cross-Entry-Path Inconsistencies

### R7-14 — P1: generic/offline membership moves bypass the promotion contract

- **Canonical path:** `POST /api/promotion/batch-approve` creates/reuses a promotion snapshot, checks semester lock/policy and moves the student atomically.
- **Alternate path:** `PUT /api/students/:id` accepts `classId`/`branch` as an ordinary profile update. It does not know whether the move is an administrative correction or promotion and checks no promotion snapshot, year status or semester lock (`studentService.ts:337-391`).
- **Concrete caller:** offline `PromotionPanel` invokes `studentStore.batchPromote`, which queues generic student updates and immediately presents “Thăng Tiến Thành Công” (`PromotionPanel.tsx:223-244`; `studentStore.ts:196-218`).
- **Observed contract drift:** Business Rules §1.8 says the server will reject this queued PUT if it violates lock/policy, but current student route/service has no such rejection.
- **Consequence:** a promotion performed while offline can later change class/branch without the required `promotion_records` provenance. The same API remains useful for a legitimate correction, so remediation needs an explicit move intent/command rather than globally banning `classId` edits.
- **Confidence:** high current-source verification. This audit reports only the membership/provenance consequence, not a duplicate Academic Lifecycle finding.

### R7-15 — P2: optimistic StudentModal reports success before durable ownership

- `StudentModal.handleSubmit` is synchronous and does not await `addStudent`/`updateStudent`; it toasts success and closes immediately (`StudentModal.tsx:223-250`).
- Store actions optimistically mutate memory before awaiting encrypted queue insertion (`studentStore.ts:143-181`). If Dexie/encryption fails, the promise rejects after the UI has reported success. A later server 4xx quarantines the operation; unlike exam completion, there is no student-specific rollback marker.
- Successful server ID remap is strong, and a later authoritative full pull can heal many failures. However an incremental pull does not inherently remove an unacknowledged temp student.
- Consequence: a device can display a durable-looking student identity that never existed on the server, or show a rejected edit until a later reconciliation.
- Confidence: high source evidence; exact persistence after every failure/reload combination remains a test gap.

## 7. Conditional Risks

### CR1 — Duplicate safety degrades on duplicate-query errors

Chunk and per-key query failures in `detectDuplicates` are logged and swallowed (`importService.ts:574-692`). If reads fail selectively but later writes succeed, import proceeds as though no candidate exists. This is a code-supported fail-open risk, not reproduced infrastructure behavior.

### CR2 — Final batch metadata is outside row transactions

Committed rows are aggregated, then batch status/counts and mapping memory are updated afterward (`importService.ts:1508-1564`). A late database failure can leave committed row changes with a `failed`/stale control row. Partial success itself is intentional; the risk is inaccurate recovery/control metadata after a late failure.

### CR3 — Class-centric homeroom uniqueness relies on SQLite transaction serialization

The schema only enforces unique `(parish,user,class)`, not one CN per class or one CN class per user (`schema.ts:400-421`). Service checks run inside retryable transactions, and SQLite single-writer behavior likely serializes ordinary races, so no duplicate was asserted here. A deterministic concurrency test is still needed before deciding whether partial unique indexes are warranted.

### CR4 — Manual promotion accepts structurally valid but semantically unrelated classes

`PromotionApplicationService.approvePromotion` verifies `targetClassId`/`nextClassId` exist in the parish, but does not require active classes, bind `targetClassId` to the student's current class, bind `nextClassId` to the intended next academic year, or ensure `newBranch` matches the destination class (`PromotionApplicationService.ts:215-263`). UI currently supplies derived values, so exploitation requires a stale/buggy/alternate caller. This should be closed when R7-02/R7-14 membership commands are unified.

### CR5 — Single-parish deployment masks one import predicate omission

The import-update removal of `serviceAssignments` filters `studentId + serviceType` but omits `parishId` (`importService.ts:1458-1468`). Current deployment is single-parish, so no present cross-parish consequence was established. The composite schema still supports repeated student IDs across parishes; include the predicate as low-risk hardening if multi-parish data remains possible in backups/tests.

## 8. Intentional Complexity

1. **No natural-key UNIQUE on a child.** Names, DOB and parent phone are not globally unique. Heuristic detection plus explicit skip/update/create is the correct shape; the retrieval bug must be fixed without inventing a false uniqueness constraint.
2. **Partial-success roster import.** Per-row outcomes, fast chunks and row fallback are intentional and tested. Making the whole 2,000-row import one transaction is not recommended.
3. **Soft-deleted students with retained academic history.** This protects attribution and downstream continuity. The defect is unsafe class lifecycle, not lack of student cascade.
4. **Denormalized `students.branch`.** It supports student-targeted communication and progression independent of mutable class labels. Keeping it is reasonable if every membership command enforces or explicitly records exceptions.
5. **Separate user and parish-person identities.** A credential is not a historical person. The optional one-to-one link, preserved profile and multiple terms/assignments are intentional domain modeling.
6. **Parish-wide staff roster read with class-scoped writes.** This is an approved product policy and is correctly enforced at server write boundaries.
7. **Year-specific class copies.** Classes are cohorts, not timeless taxonomy. Copying structure into a new year while keeping the child ID stable is preferable to mutating old classes.

## 9. Test Coverage Gaps

The following were absent from the normal suite and reproduced only by the opt-in audit probe:

- normalized accented/case-variant name + DOB database duplicate;
- exact same class name across academic years;
- tied high-confidence fuzzy class candidates;
- class delete with active students and assignments;
- class branch/year mutation with active membership;
- one CN assigned to multiple classes through user-centric API;
- validate-only creation of an academic year;
- blank gender becoming male before server validation;
- undo of updated student after an exam result;
- failed batch orphan class that cannot be undone;
- manual branch/class mismatch.

Additional missing gates:

- route-level inverse matrix for all three assignment writers, including inactive users and deleted classes;
- concurrent homeroom assignment stress test on the actual SQLite/Turso transaction implementation;
- quoted CSV/TXT roster end-to-end fixtures, embedded newline/tab XLSX cells and `+84`/Excel scientific phone corpus;
- updated-student Undo dependencies for grades, attendance, exam, promotion, year snapshots, assessments, leave and fees;
- imported-class cleanup with assignments/exams/fees but no active students;
- StudentModal/Dexie enqueue failure and permanent server-rejection reconciliation;
- real anonymized roster benchmark/accuracy corpus for fuzzy matching and duplicate false-positive/false-negative rates. The 120-row local performance test is not production-scale correctness evidence.

## 10. Documentation Drift

### DR1 — Architecture says class-centric assignment is the UI contract

`docs/02_ARCHITECTURE.md:87` says UI assignment uses `PUT /api/classes/:id/assignments`, but `UserManagementPage.tsx:292` still uses `PUT /api/users/:id/assignments`, and create-user also writes assignments. Business Rules acknowledges the user-centric path, but does not disclose its weaker enforcement.

### DR2 — Offline promotion rejection claim is false

Business Rules §1.8 and the `PromotionPanel` comment say generic queued `PUT /students/:id` will be rejected for lock/policy violations. Current student route/service has no promotion/lock/policy guard. ADR-052 correctly calls this path temporary, but labels the remediation implemented more strongly than current runtime supports.

### DR3 — Undo contract overstates dependency protection

Business Rules §23.2 says Undo refuses a student with grades/attendance/exam/promotion/year snapshot/assessment/leave data. Current implementation applies this list only to imported-created students, not imported-updated students, and omits fees.

### DR4 — UI says 10 minutes while server/docs enforce 24 hours

`ExcelImportModal.tsx:298` and `:1008` say ten minutes. `ROSTER_UNDO_WINDOW_MS` and Business Rules §23.2 say 24 hours.

### DR5 — Admin-as-class-personnel policy is internally inconsistent

The class-centric endpoint and available-teacher query deliberately allow `admin`; `FRONTEND_API_CONTRACT.md:633` documents it. User-centric assignment rejects admin and ADR-026 describes admin assignments as dirty legacy data. Product ownership must decide whether an admin may simultaneously serve as CN/PT; current code/docs cannot establish one authoritative answer.

## 11. Unknown / insufficient evidence

1. Number of duplicate student identities, branch/class mismatches, multi-CN assignments, orphan classes and failed/partial undo batches in the deployed database.
2. Whether existing class names are reused across archived years and how often fuzzy candidates tie or fall within a narrow margin.
3. Approved policy for deleting/archiving a populated class: block, close/archive, or guided transfer. Current “soft delete and leave live references” is unsafe, but the correct UX requires product decision.
4. Whether `gender` may be unknown/blank in the parish's canonical roster. No approved rule authorizes guessing; no production data was inspected.
5. Whether admin accounts are allowed to hold `roleInClass` as a real teaching assignment.
6. Production migration/schema readiness and Turso transaction behavior under homeroom races. Local SQLite-backed tests do not prove deployment state.
7. Physical Excel/CSV corpus correctness and 2,000-row latency/memory on target devices. No anonymized field corpus was available.

## 12. Risk-prioritized incremental roadmap

### Phase 0 — Data reconnaissance, no mutation

Add read-only, privacy-minimized audit commands that report counts and hashed IDs for:

- normalized-name+DOB duplicates and other duplicate candidate clusters;
- student branch versus class branch mismatch;
- students/assignments/downstream rows referencing soft-deleted classes;
- multiple CN per class and one CN across multiple classes;
- same canonical class name/code across active years;
- failed imports with `createdClassIds`, rollback-capable batches with dependencies, and orphan classes.

Do not auto-merge or auto-move records. Identity resolution requires human review.

### Phase 1 — Close P0 import/undo boundaries

1. **R7-01:** retrieve duplicate candidates using a normalized indexed representation or a bounded parish candidate query, then apply the existing normalized comparison. Backfill/index only after measuring data shape; preserve explicit “different person” decisions.
2. **R7-06:** make academic year explicit in validation/import class resolution. Exact name without an unambiguous year must require selection. Fuzzy auto-match should require both a threshold and a minimum lead over runner-up; ties always require confirmation. Persist mapping against the selected class's academic year.
3. **R7-10/R7-11:** pass current undo actor context; apply dependency checks to updated snapshots; include fees and complete class dependencies; return exact item outcomes and render them. Class cleanup should call the same safe class-decommission policy as normal deletion.
4. Add the audit probes as normal regression tests after fixing their expectations from “defect exists” to “defect rejected/handled”.

### Phase 2 — Unify membership and assignment commands

1. Introduce one existing-module membership validator used by manual create/update, import create/update, promotion and class mutation. It should validate active class, class/year state and branch consistency; exceptional corrections must carry an explicit intent and audit reason.
2. Route every assignment writer through one invariant-preserving replacement operation. Keep both HTTP shapes if useful, but make them adapters to the same service. Validate active class/user/staff role and both homeroom limits in every path.
3. Decide admin-as-teacher policy, then align `getAvailableTeachers`, class-centric and user-centric APIs, UI and docs.
4. Block class delete/update of structural fields when active/dependent records exist, or implement an explicit guided decommission/migration command. Do not cascade historical data.

### Phase 3 — Remove silent import authority guesses

1. Preserve blank/unknown gender and branch as unresolved validation state; require explicit user choice before commit. If schema non-null constraints must remain, use a review-state value outside authoritative student rows rather than guessing.
2. Replace roster `split(delimiter)` with the already proven quote-aware parser pattern; parse XLSX as structured rows without lossy TSV round-trip.
3. Align manual/import DOB rules and phone canonicalization. Add real-date, pre-1900, `+84`, numeric/scientific and quoted-field fixtures.
4. Move default academic-year creation out of `validateImport`; return `ACADEMIC_YEAR_REQUIRED` or a suggestion. Only the admin command creates governance state.
5. If explicit classes are pre-created, either include them in a compensating transaction/control state or allow safe cleanup of failed batches. Never silently leave an unusable class.

### Phase 4 — Offline truthfulness and recovery

1. Await durable queue insertion before StudentModal closes or says the change was saved; label the result “đã lưu trên thiết bị/chờ đồng bộ” until server acknowledgement.
2. On permanent student create/update/delete rejection, reconcile that entity from an authoritative server read or retain an explicit pending/error marker beside it. Never leave an ordinary-looking temp identity.
3. Keep current encrypted ownership, create-before-dependent ordering and awaited ID remap; these are protective complexity.

### Phase 5 — Documentation and release gates

- Update Business Rules §1.8/§11.3/§23.2, Architecture assignment wording, API assignment/undo results and the 10-minute UI copy after behavior is fixed.
- Add the role × writer × invariant matrix and class decommission contract as executable route/service tests.
- Run targeted suites, typechecks and relevant E2E journeys for class creation/decommission, student import/move, assignment replacement and partial Undo. A broad suite is appropriate only after these cross-module fixes land.

## 13. What is not recommended

- No microservices split, event bus or repository-wide DDD rewrite.
- No hard UNIQUE constraint on name/DOB/phone as a substitute for identity review.
- No cascade delete of students, classes, accounts or academic history.
- No conversion of intentionally partial import into one giant transaction.
- No automatic repair of deployed duplicate/mismatch records without a reviewed reconciliation plan.
- No new generic abstraction merely to hide the three assignment entry paths; first make them call the same concrete invariant owner.

## 14. Final disposition by requested category

- **Verified Strengths:** S1–S8.
- **Student Identity Defects:** R7-01, R7-02.
- **Class & Membership Defects:** R7-03, R7-04.
- **Personnel Assignment Defects:** R7-05.
- **Import Integrity Defects:** R7-06 through R7-13.
- **Cross-Entry-Path Inconsistencies:** R7-02, R7-05, R7-06, R7-13, R7-14, R7-15.
- **Conditional Risks:** CR1–CR5.
- **Intentional Complexity:** §8.
- **Test Coverage Gaps:** §9.
- **Documentation Drift:** DR1–DR5.
- **Unknown:** §11.

The domain is not “broken”: its stable IDs, FK scoping, transaction islands, tombstones, server acknowledgement for import and personnel identity separation are strong. The remaining risk is concentrated at **semantic adapters**—class matching, alternate assignment writers, mutable/deleted class boundaries, and recovery—where valid-looking data can cross into a different class/year/person meaning without an explicit decision.

## 15. Post-audit remediation status (working tree, 2026-09-06)

This section reports current remediation evidence separately from the frozen audit. It does not claim deployment until the exact release and production database are verified.

| Finding | Current disposition | Concrete boundary change |
|---|---|---|
| R7-01 / CR1 | Fixed in current working tree | `detectDuplicates` uses bounded parish candidates with normalized comparison and propagates candidate-query failures instead of treating them as no match. |
| R7-02 | Fixed | `studentMembershipPolicy` resolves active class branch for manual/import creates and updates; mismatch is rejected. |
| R7-03 / R7-04 | Fixed | `classDependencyService` blocks delete and structural branch/year mutation while direct live/history dependencies exist; assignment scope ignores deleted classes. |
| R7-05 / CR3 | Fixed | All three assignment writers call `classAssignmentPolicy`; migration `20260906-176` adds partial UNIQUE race backstops for one CN per class and one CN class per user. |
| R7-06 | Fixed | Validation and commit require explicit active/unlocked `academicYearId`; class candidates are year-scoped and ties/insufficient fuzzy lead require explicit selection. |
| R7-07 / R7-08 | Fixed | Blank/invalid gender or branch remains a validation error; preview no longer creates a default academic year. |
| R7-09 | Fixed | Import batch and new class provenance bootstrap atomically; failed/interrupted imports decommission only unreferenced classes through the dependency guard. |
| R7-10 / R7-11 | Fixed | Undo checks dependencies for updated and created rows, includes fees, uses the current admin actor and returns/render itemized outcomes plus deleted classes. |
| R7-12 / R7-13 | Fixed | CSV/TXT parser is quote-aware with embedded newline support; XLSX retains structured cells; import DOB lower bound is 1900. |
| R7-14 / CR4 | Fixed | Promotion is online-only through the snapshot writer. Service validates current source class, active same-parish destination, target academic year and canonical destination branch. Generic membership correction requires an audit reason. |
| R7-15 | Fixed | StudentModal awaits durable enqueue and rolls back on enqueue failure. Permanent create/update/delete rejection reconciles or removes the optimistic projection while retaining the failed queue payload. |
| CR2 | Fixed | Row provenance and counters commit with each row/chunk; batches from an earlier process are finalized from committed provenance without racing current-process imports. |
| CR5 | Fixed | Service-assignment removal includes `parishId` in the predicate. |
| DR1–DR5 | Resolved by behavior + SSOT amendment | Business Rules, Architecture, API contract and ADR-052/108 now describe canonical assignment, online promotion, itemized Undo and the chosen no-admin-as-class-personnel policy. |

### Regression and operational evidence

- Remediated opt-in audit probe: **13/13 PASS**.
- Import recovery regression, including composition-root recovery across parish scopes before HTTP bind: **14/14 PASS**; permanent student rejection reconciliation: **12/12 PASS**.
- Assignment/promotion topology cluster: **8 files / 45 tests PASS**; earlier focused roster/import/membership/undo clusters also passed before the final broad gate.
- Client and server TypeScript checks passed after CR2/R7-15.
- `npm run audit:roster-integrity` completed read-only on target fingerprint `0f514a8e24b4e5c4` with **0 findings** after excluding non-date placeholders from identity keys. This closes the local-target reconnaissance only. Production URL/credentials were not established, so §11 production-data and migration-readiness unknowns remain open.
- Final `npm run verify:ci` on the complete code set after composition-root recovery wiring: **PASS** — lint zero-warning; architecture inventory **31/6/51/12/57** (routes/repositories/services/domain/tables); design-system guard **0/127**; client/server TypeScript + production frontend/PWA/server build (**2,814 modules; 238 precache entries**); serialized coverage **321/321 files, 2,245/2,245 tests** in 920.08 seconds. Coverage: statements **70.24%**, branches **59.36%**, functions **62.92%**, lines **72.87%**. Production inventory, migration application, release SHA, deploy and smoke remain open external gates.
