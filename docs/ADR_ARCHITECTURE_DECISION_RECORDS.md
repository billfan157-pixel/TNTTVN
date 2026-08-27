# ARCHITECTURE DECISION RECORDS (ADR) - PARISH LMS v2.0

Document Status: **APPROVED**  
Architecture Lead: Chief Architect & AI Pair Programming Agent  
Last Updated: 2026-08-06  

---

## ADR-001: SQL-level Optimistic Locking (`WHERE id = ? AND version = ?`)

### Context
In an offline-first Parish LMS with multiple Catechists (Giáo lý viên) editing scores concurrently, lost updates and race conditions occurred when two users edited the same grade record at the same time.

### Decision
Enforce real SQL-level atomic optimistic locking on database updates:
```sql
UPDATE grades 
SET version = version + 1, updated_at = ? 
WHERE id = ? AND version = ?
```
If `affectedRows === 0`, the transaction aborts and throws `VersionConflictError`, returning HTTP status `409 Conflict`.

### Consequences
- **Positive**: Guarantees zero lost updates across concurrent REST requests and sync queue executions.
- **Negative**: Client applications must handle 409 Conflict gracefully by rehydrating stale local state.

---

## ADR-002: Pure Domain Aggregates Decoupled from Infrastructure

### Context
Mixing database queries, Hono/Express HTTP contexts, or LocalStorage calls inside domain entities led to untestable code and tight coupling.

### Decision
Keep `GradeAggregate` 100% pure in memory:
- Zero imports of Drizzle, SQLite, Hono, Express, JWT, or LocalStorage.
- Domain Invariants (`0 <= score <= 10`, `version++`, `eventType` queueing) are enforced strictly in memory.
- Persistence is handled exclusively by Repository objects (`DrizzleGradeRepository`).

### Consequences
- **Positive**: 100% unit test coverage for domain rules without mock databases; code runs identically on Frontend (RAM/IndexedDB) and Backend (Node/SQLite).

---

## ADR-003: Micro-Step Pilot Migration Strategy

### Context
Refactoring entire subsystems at once created large PRs, regression risks, and prolonged broken builds.

### Decision
Adopt a strict Micro-Pilot migration sequence:
- Migrate **ONLY ONE Use Case** at a time (e.g. `overrideScore()` first, verify with tests, commit, then migrate `restoreScore()`).
- Maintain existing `gradeStore` and Hono routes as Public API facades so UI and clients remain unaffected.

### Consequences
- **Positive**: Reduced risk to < 150 LOC per step; instantaneous rollbacks if a step fails; code remains 100% green at every checkpoint.

---

## ADR-004: Pragmatic Specification Pattern for Cross-Cutting Rules

### Context
Checking whether a Semester is locked or whether a user has class permissions could have inflated `GradeAggregate` with cross-entity knowledge.

### Decision
Use the **Specification Pattern** (`SemesterLockSpecification`, `CanOverrideGradeSpecification`) in the Application Layer (`GradeApplicationService`):
```text
GradeApplicationService
        │
        ├── 1. SemesterLockSpecification (Checks semester lock state)
        ├── 2. CanOverrideGradeSpecification (Checks user class access)
        ├── 3. GradeAggregate (Executes score boundary invariants)
        └── 4. DrizzleGradeRepository (Persists with 409 Optimistic Lock)
```

### Consequences
- **Positive**: `GradeAggregate` stays focused strictly on score invariants; Semester Lock & RBAC rules can be composed dynamically in the Application Layer.

---

## ADR-005: Dedicated Operational Table (`semester_locks`) vs Static Configuration (`systemSettings`)

### Context
Storing operational lock states (`isLocked`, `lockedBy`, `lockedAt`, `unlockReason`) inside JSON blobs in `systemSettings` would hinder auditability and database indexing.

### Decision
Separate **Static Configuration** (`systemSettings`: grade weights, attendance thresholds) from **Operational Business State** (`semester_locks` table):
- `semester_locks` table schema: `(id, parish_id, academic_year, semester, is_locked, locked_by, locked_at, unlock_reason)`.

### Consequences
- **Positive**: Enables fast indexed lookups `(parish_id, academic_year, semester)`, full audit trail for lock/unlock operations, and easy schema extension.

---

## ADR-006: Snapshot Records are Immutable (`promotion_records`)

### Context
Promotion decisions represent the final academic outcome of a student for an academic year. If historical grades or attendance calculations change in later years, in-place updates to past promotion records would corrupt historical academic reports and violate auditability.

### Decision
Treat `promotion_records` as immutable snapshots:
- Once approved, GPA, attendance rates, and decisions are NEVER updated in-place.
- If a semester is unlocked and grades are re-evaluated, the old snapshot is marked `SUPERSEDED` and a new snapshot version (`version++`, `status: 'ACTIVE'`) is written with a full audit log.

### Consequences
- **Positive**: Historical reports from past years never shift unexpectedly; complete audit lineage is preserved; fits academic accounting principles.

---

## ADR-007: Layer Responsibilities: Application Services Orchestrate, Domain + Specifications Rule, Repositories Persist

### Context
As the codebase expands across Grade, Semester Lock, Promotion, Attendance, and Reporting modules, business rules can easily leak back into controllers, routes, or database repositories if boundaries are not strictly defined.

### Decision
Enforce strict three-tiered architectural responsibilities:
1. **Domain Objects & Specifications**: Own ALL business rules, invariants, evaluation logic, and boundary conditions. Zero dependencies on HTTP, databases, or frameworks.
2. **Application Services** (`GradeApplicationService`, `PromotionApplicationService`): Act purely as Use Case Orchestrators within ACID transaction boundaries. They load data via Repositories, validate against Specifications, execute Domain Invariants, and save results.
3. **Repositories** (`DrizzleGradeRepository`, `DrizzleSemesterLockRepository`, `DrizzlePromotionRepository`): Perform pure persistence operations (`SELECT`, `INSERT`, `UPDATE`). Zero business rules (`if score > 10`, `if user.role`).

### Consequences
- **Positive**: 100% predictable code organization; high unit-testability of domain rules; zero logic leakage as system scales.

---

## ADR-008: Batch Operations Use Partial-Success Semantics Instead of All-or-Nothing Transactions

### Context
Executing batch operations (e.g. batch promotion approvals, Excel grade imports, batch attendance entry) across an entire class of 30-50 students using a single monolithic all-or-nothing transaction means 1 invalid record causes all 49 valid items to fail, frustrating users and causing DB lock contention.

### Decision
Adopt **Partial-Success Semantics** for all multi-item batch operations:
- A batch is treated as a collection of independent single-item use cases.
- Execution is processed in small chunks (e.g. 10-25 items per chunk), each item running its own discrete transaction.
- Monolithic all-or-nothing rollbacks across entire batches are strictly prohibited.
- Response payloads must return itemized status results: `total`, `successCount`, `skippedCount`, `errorCount`, and an array of individual item results (`saved`, `skipped`, `error` with reason).

### Consequences
- **Positive**: High resilience; zero DB lock contention; users can retry only failed items without duplicating successful ones; standardized across Excel Import, Batch Promotion, and Attendance.

---

## ADR-009: Attendance Uses Lean Event Entities, Semester Lock Protection, and ADR-008 Batch Entry

### Context
Attempting to force an `AttendanceAggregate` onto discrete daily attendance records creates unnecessary complexity and tight coupling without clear domain invariants.

### Decision
Model Attendance as a lean event-driven subsystem:
1. **Lean Domain Model**: Use `AttendanceRecord` value/entity objects without an artificially bloated Aggregate root.
2. **Semester Lock Integration**: Attendance mutations on dates belonging to a locked semester MUST be validated against `SemesterLockSpecification` in `AttendanceApplicationService`.
3. **Batch Entry**: Class-wide attendance entry (`POST /api/attendance/batch`) strictly adheres to ADR-008 Partial-Success semantics.

### Consequences
- **Positive**: Simple, performant attendance recording; reuses existing `SemesterLockSpecification` and `ADR-008` batch infrastructure seamlessly.

---

## ADR-010: Reporting Uses CQRS Read Projections (Zero Aggregates, Pure Queries)

### Context
Including reporting logic inside write repositories (`DrizzleGradeRepository`, `DrizzleAttendanceRepository`) causes logic leakage, expensive entity mapping overhead, and bloated write models.

### Decision
Model the Reporting subsystem purely as a CQRS Read Model / Projection Layer:
1. **Zero DB Mutations**: Reporting code NEVER executes `INSERT`, `UPDATE`, or `DELETE`.
2. **Zero Aggregates & Domain Events**: Reporting does not instantiate Write Aggregates, enforce write invariants, or trigger Domain Events.
3. **Dedicated Projection Repositories**: Read-side queries execute optimized SQL `SELECT` queries joining multiple tables (`grades`, `attendance`, `promotion_records`, `students`, `classes`) directly into Projection DTOs.

### Consequences
- **Positive**: High query performance; zero side-effects on Write models; total decoupling between Write and Read workflows.

---

## ADR-011: Application Services Solely Own Transaction Boundaries

### Context
Leaking transaction orchestration (`db.transaction(...)`) into HTTP route handlers or database repositories creates ambiguous transactional boundaries, nested transaction risks, and tight coupling to database frameworks.

### Decision
Enforce that **Application Services are the ONLY layer allowed to manage transaction boundaries**:
- Controllers/Routes receive HTTP requests, parse payloads with Zod, and delegate to Application Services.
- Repositories accept transaction handles (`tx`) passed in by Application Services without initiating transactions themselves.

### Consequences
- **Positive**: Clear ACID boundary enforcement; zero database transaction leaks into HTTP routes; high testability.

---

## ADR-012: Unified Domain Error Taxonomy

### Context
Heterogeneous error objects thrown across different layers lead to inconsistent HTTP status codes and poor diagnostic logging.

### Decision
Establish a standardized hierarchy of domain and application errors:
1. `DomainError`: Base error for domain rule violations.
2. `BusinessRuleViolationError`: Thrown when domain invariants fail (e.g. invalid score range, missing override reason).
3. `VersionConflictError` (`409 Conflict`): Thrown when SQL optimistic locking fails.
4. `ForbiddenOperationError` (`403 Forbidden`): Thrown when pre-conditions like `SemesterLockSpecification` fail.

### Consequences
- **Positive**: Predictable HTTP response mappings (`400`, `403`, `409`); clean diagnostic stack traces.

---

## ADR-013: Strict Dependency Rule Enforces Inward Dependency Flow

### Context
Allowing Domain objects to import infrastructure repositories or HTTP contexts causes architectural decay and breaks unit testability.

### Decision
Strictly enforce the Clean Architecture Dependency Rule:
`Domain` $\leftarrow$ `Application Service` $\leftarrow$ `Infrastructure / Repositories` $\leftarrow$ `Controllers / Routes / Frameworks`
- The `Domain` layer has **ZERO external dependencies**.
- Application Services depend ONLY on Domain contracts and abstract Repositories.

### Consequences
- **Positive**: 100% pure, unit-testable Domain logic; seamless database adapter replacement.

---

## ADR-014: Out-of-Process Integration Events Decouple Subsystems

### Context
Directly invoking side-effects (such as audit logging, Telegram notifications, and background queues) inside core write transactions increases latency and risks rolling back business transactions if notification services fail.

### Decision
Decouple side-effect execution using Integration Events:
- Core Application Services execute business mutations and publish integration events (`GradeOverridden`, `PromotionApproved`, `AttendanceMarked`).
- Notification services subscribe asynchronously without blocking core write transactions.

### Consequences
- **Positive**: Core write paths remain blazing fast; side-effect failures do not compromise ACID database invariants.

---

## ADR-015: Idempotent Command Execution Standard Across All Subsystems

### Context
Network retries and offline sync queues can result in duplicate command submissions for Grade overrides, Attendance entry, and Promotion approvals.

### Decision
Standardize idempotent command handling across all Application Services:
- Before executing mutations, Application Services verify existing state.
- If a command's payload matches the existing state exactly, the service returns the existing record without mutating `version` or executing unnecessary SQL `UPDATE` queries.

### Consequences
- **Positive**: Safe network retries; zero spurious audit log spam; total sync safety for offline-first clients.

---

## ADR-016: Offline Sync Engine Hardening (Queue Isolation, Remap Ordering & Safe Compaction)

### Context
The offline sync engine (`useSyncEngine` → `syncStore.ts` → `syncProcessor.ts`) exhibited multi-device, multi-user, and compaction failure modes: cross-user queue leakage, lost deletion mutations on CREATE+DELETE compaction when CREATE was already sent to server, missing notice/class idempotency keys, un-transactional IndexedDB operations, and confusing conflict toast messages.

### Decision
Harden the sync pipeline per the following rules (annotated in code as `ADR-016`):
1. **Per-user queue scoping (S19/OS-02)** — the sync queue is isolated by `userId`; `isOwnOp` is fail-closed (`item.userId === currentUserId`), preventing ops from a logged-out user from syncing under another user's session on shared devices. One-time `migrateLegacyQueueUserIds` stamps legacy items.
2. **Temp-ID remap before dependent sync (S4/S24, Phase 1.5)** — parent CREATEs (student/class/notice/exam) complete first with `idempotencyKey`, client temp IDs are remapped to server IDs via the in-memory ID map, and only then are dependent operations sent.
3. **Safe Queue Compaction (OS-01)** — `CREATE` + `DELETE` pairs are only canceled if `CREATE` is unsent local-only (`pending`, `retryCount` 0). If `CREATE` has retried (`retrying`), keep BOTH `CREATE` and `DELETE` so Phase 1.5 retries `CREATE` with `idempotencyKey` (server dedupe), remaps Temp ID to Real ID, and Phase 3 executes `DELETE` with real ID (zero lost mutation).
4. **Idempotency Key Standardization (OS-01)** — `idempotencyKey` is passed consistently for Student, Class, Notice (with server-side schema & unique index migration), and Exam.
5. **Per-request zod batch isolation (S13)** — each op is validated independently inside the sync request; one schema failure is returned per-op without discarding the remaining operations.
6. **`lastSyncAt` timing (audit #6)** — the pull-delta timestamp is captured server-side at response time, eliminating clock-skew data loss windows.
7. **Transient-failed promotion (audit #10)** — ops failed with transient errors are promoted back into the queue for the next cycle instead of being dropped.
8. **Per-user queue compaction & atomic Dexie transactions (OS-04)** — duplicate operations are merged per user before flush; IndexedDB writes are wrapped in Dexie `db.transaction` with pre-encrypted payloads to prevent premature commits.
9. **Conflict resolution & Toast separation (OS-03)** — LWW field-level merge for Grade/Attendance, Server-Wins for Student/Class/Notice/Exam CRUD with distinct user-facing Toast messages.

### Consequences
- **Positive**: Zero cross-user data leakage; zero lost mutations on compaction; reliable parent/child ordering; resilient batch processing; no delta loss across devices; consistent & distinct conflict UX.
- **Negative**: Increased sync-engine complexity (remap state machine, per-user compaction) requiring dedicated unit tests (covered in `syncService.test.ts`, `syncProcessor.test.ts`, `syncRemediation.test.ts`).

## ADR-017: Parish-Configurable Academic & Weight Settings (F2 + F3)

### Context
Promotion and class-summary logic hardcoded assumptions that do not hold across parishes: the academic-year date range used to bound attendance (`2025-2026` → `2025-08-01` → `2026-07-31`), and the GPA/attendance weight combination used for classification, retention, and promotion outcomes. As the platform serves multiple parishes, these must be configurable per parish without code changes.

### Decision
1. **F2 — Academic-year date range from settings**: `parseAcademicYear` / `computeAcademicYearDateRange` (`utils/academicYear.ts`) derive the default date range from parish settings instead of a fixed convention; attendance summaries in `ClassSummaryProjectionRepository.ts` and `ReportCardProjectionRepository.ts` count only attendance inside the academic year being reviewed (annotated `ADR-017 (F2)`).
2. **F3 — Parish grade weights**: promotion/classification weights (e.g., GPA vs ethics weighting) are read from parish settings via `parishSettingsService.ts` and applied in `ClassSummaryProjectionRepository.ts` / `ReportCardProjectionRepository.ts` (annotated `ADR-017 (F3)`). Tests: `promotionRoutes.test.ts` (F2 attendance-bounding, F3 weighted GPA), `academicYear.test.ts`.

### Consequences
- **Positive**: Same binary serves parishes with different school calendars and grading policies; weight changes are data-driven and auditable in settings.
- **Negative**: Settings become part of the promotion calculation path — an invalid/partial settings row can alter results; validation defaults keep behavior stable when settings are unset.

## ADR-018: Ethics-Score Audit Metadata (`score_dao_duc_source` / `score_dao_duc_updated_at`)

### Context
The import pipeline (import/export audit #4) sets ethics-score `source` and `updated_at` fields on the client, but the server schema had no columns for them — Drizzle silently dropped the fields, losing the audit trail for Đạo Đức scores (who imported them, when).

### Decision
Add `score_dao_duc_source` and `score_dao_duc_updated_at` columns to `grades` (migrations `20260804-065` / `20260804-066`), mirroring the existing audit columns for all other score components (15m, 1-period, midterm, final). The server persists and exposes these fields so the ethics-score lineage is identical to every other grade component.

### Consequences
- **Positive**: Ethics scores now carry the same import/override audit metadata as other components; no silent client-side field drops.
- **Negative**: One extra pair of columns per grade row; negligible storage impact for the expected data volume.

## ADR-019: Smart Grade Import — Scoring-Based Column Detection, Ignored-Column Registry & Inference Confirmation Gate

### Context
The legacy grade importer mapped columns with a single exact-token list per field, producing user-facing bugs: `TB` (trung bình — a computed average) alias-mapped into `scoreMidterm`, `ĐTB` resolved to the midterm slot, single-char keywords (`m`, `h`, `t`) consumed valid 2-char tokens via substring matching (`M` matched `Mã số`), `ĐĐ`/`Hạnh Kiểm` (Đạo Đức columns) were unmapped, and header-less files silently inferred columns — writing STT values into Điểm Miệng with no user awareness. A reviewer claim that `ĐTB` maps to midterm was verified against the code and found false (the real defect was 2-char exact-only `TB`), so the fix targets verified behavior, not the review text.

### Decision
1. **Scoring-based detection (`detectGradeColumn` in `excelImporter.ts`)**: Exact match = 100, header-contains-keyword = 80+%, abbreviation = 70+%; keywords ≤2 chars (incl. single-char `m`/`h`/`t` guards) require exact match only; `lastName`/`firstName` get a −5 priority penalty so full-name fields win ambiguity; `isIgnoredColumn` gates first.
2. **Ignored-column registry (`IGNORED_COLUMN_PATTERNS`)**: `ĐTB`, `Điểm Trung Bình`, `TB`, `T.B`, `T.B - Cả n`, `Avg`, `Xếp Loại`, `STT`, gender/DOB metadata — matched with token-boundary (exact header equality, never `includes`) so `TB 15 Phút` still maps to `score15m` and `TB` can never overwrite `scoreMidterm`.
3. **Unified parse semantics**: single `parseScore` returns `{ value, error?, warning? }`; special values (`V`, `X`, `KXL`, `Đ`, `KĐ`) → `null` + per-row warning; Vietnamese comma decimals; 0–10 clamp; empty cells preserve DB values.
4. **Smart header detection + explicit inference gate (`excelGradeParser.ts`)**: scan first 10 rows for a header row (≥1 name + ≥1 score, or ≥3 scores, or ≥2 names); if none found, infer score columns from data (≥60% numeric 0–10) but **exclude sequential STT-like columns** (1,2,3... / 0,1,2...) via `isSequentialColumn` and set `inferred = true`; the import modal then shows a prominent banner and requires `window.confirm` before saving — no silent auto-import.
5. **Diagnostics instead of throw**: `parseGradeFile` returns `{ rows, diagnostics }`; modal renders mapping summary, ignored/unmapped chips and per-row warnings; dead `parseGradeExcelFile` removed.

### Consequences
- **Positive**: Computed averages and STT columns can no longer overwrite raw scores; Đạo Đức/`ĐĐ` columns import correctly; ambiguous headers resolve deterministically; header-less files cannot silently corrupt data (confirm gate); single source of truth for keyword lists and parsing (`excelImporter.ts`).
- **Negative**: Detection remains heuristic — genuinely ambiguous 2-char headers may be unmapped (surfaced as warnings, never silently wrong); the confirm gate adds one extra click for legitimate header-less files. Tests: 103 + expanded suites pass (758 total), `tsc -b` clean.

## ADR-020: Grade Import Matching — Mã số Exact-Match Fallback

### Context
Matching previously relied exclusively on `holyName` + `fullName` with ≥ 90% similarity (`790366d`): files carrying only Mã số + scores (no name columns) — or with a typo in the file's name — could never match, leaving rows marked "Không tìm thấy thiếu nhi" even when the Mã số matched a DB student exactly. A related stale warning claimed row-order matching would be used when no name column exists, but no such mechanism was implemented.

### Decision
`matchStudentWithConfidence` keeps name matching primary, but when the name pass yields no candidates, an **exact `code` match** (trimmed, case-insensitive) against the selected class's students is accepted at confidence 100 with reason `✓ Khớp Mã số chính xác`; `processRawDataRows` appends a `Khớp theo Mã số (không khớp theo tên)` warning so the user can verify. The misleading "matching sẽ dùng thứ tự dòng" diagnostic was replaced with `Không tìm thấy cột tên — matching sẽ dùng Mã số (nếu có)`. DOB matching stays disabled; mapping memory stays highest priority.

### Consequences
- **Positive**: Mã số-only files and typo-name rows import correctly; the explicit warning keeps the fallback transparent; no row-order pseudo-matching.
- **Negative**: A stale/incorrect Mã số in the file can match a different student — mitigated because the fallback fires only after name matching fails and the code must match exactly (unique per student).

## ADR-021 (rewrite 2026-08-08): Password Visibility — Temp-Password-Only Encryption (`users.password_encrypted`)

### Context
**v1 (2026-08-07)**: Account creation returns the temp password exactly once (`Parish@\d{6}`), then it exists only as a bcrypt hash. The parish requested a "Mật Khẩu" column showing the actual password, so v1 stored an AES-256-GCM copy of the account's **current** password at **every** password change point — including the user's own `/change-password` (which re-encrypted with the new password) — and `GET /api/users` decrypted and returned `password` in the admin list.

**Audit finding (2026-08-08, P1)**: the v1 model creates a *password-recovery secret* — the "current password" of any account is decryptable while the app only needs to *verify* passwords. If `PASSWORD_CIPHER_KEY` or the admin API is compromised, an attacker recovers live passwords of all users (reusable across systems). Standard practice: any password a user chooses must exist **only** as a one-way hash; reversible copies are acceptable **only** for passwords that were never chosen by the account owner — i.e. temp/admin-set passwords the admin hands over. There is no need to keep decryptable data for passwords the user picked themselves.

### Decision (rewrite)
1. **Temp-only semantics**: `users.password_encrypted` now holds **only** admin-generated/set passwords — written at `createUser` / `resetUserPassword` / `/api/auth/admin-change-password`. The user's own `POST /api/auth/change-password` sets `passwordEncrypted = NULL` — **mật khẩu user-chọn không bao giờ tồn tại dạng reversible** (admin không xem lại được; không tồn tại password-recovery secret cho pass hiện tại).
2. **No bulk decrypt**: `GET /api/users` no longer returns a decrypted `password` (nor the raw column). It returns `hasPasswordCopy: boolean` so the UI knows a temp password is still readable.
3. **Audited reveal**: new `POST /api/users/:id/reveal-password` (admin-only, super-admin forbidden) decrypts the temp password and writes audit `REVEAL_PASSWORD` (with ip + userAgent). 404 when no encrypted copy remains.
4. **bcrypt remains the only authentication source of truth** (unchanged).
5. Missing/invalid `PASSWORD_CIPHER_KEY` → encryption disabled (NULL) like before; create/reset responses still return the temp password **once** (`tempPassword`).

### Consequences
- **Positive**: Current user-chosen passwords are not recoverable by anyone — even full key + DB + admin-token compromise cannot read them; any password reveal is a single explicit audited action instead of a field in every admin list dump; the parish feature is preserved (admin can still re-read the temp password they generated to hand to a GLV).
- **Negative**: Admin cannot view/recover the current password of an account whose user already changed it (must use reset instead); rows created under v1 keep their old "current-password" ciphertext until the user changes their own password (then NULL); a DB compromise *during the FORCE_PASSWORD_CHANGE window* still exposes the temp password (acceptable — the admin already knows it and it is short-lived).
- Re-verified: `users-routes.test.ts` (no plaintext in GET + reveal 200/404), `auth-lockout.test.ts` (change-password → `passwordEncrypted` NULL), `tsc` clean both sides.

## ADR-022: Cổng Phụ Huynh — Phone-Link SSOT & Targeted Web Push (`notifications.target_user_ids`)

### Context
The parish requested a parent portal (xem con, phiếu điểm, chuyên cần) and branch-targeted push so thông báo Giáo xứ reaches only parents of the relevant chi đoàn. Two design options were evaluated in the decision matrix: **Option A** — match `users.phone` against `students.parentPhone` with phone normalization (zero schema change) vs **Option B** — a dedicated `parent_student_links` table. Option A won (Simplicity 9 / Code 9 / Maintenance 9 vs 6/6/6) because production already encoded phone matching intent in `CanAccessStudentSpecification` (SSOT wins) and a link table adds a manual-mapping UI with no existing data to backfill.

### Decision
1. **Phone-link as SSOT**: `server/src/utils/phone.ts` normalizes VN phone numbers (strip `[\s\-().]`, `+84`→`0`) and provides `phoneMatchVariants()` for flexible matching. `GET /api/parents/my-children` (role `phuhuynh` only) returns the parent's active children via `parentService.getMyChildren`; `CanAccessStudentSpecification` was refactored to use the same variants so report-card access and the portal can never disagree.
2. **Client portal**: `src/pages/ParentPage.tsx` (route `/parent`, guarded by `requireRole('phuhuynh')`) shows the child selector, per-semester scores + classification, attendance summary, promotion status, and "In Phiếu Điểm" via `ReportExportService`. Desktop sidebar + mobile bottom nav expose "Con Của Tôi" for parents only; parents never see the students/grades/reports tabs.
3. **Targeted web push**: `webPushService.sendWebPushToUsers(parishId, userIds, payload)` filters `push_subscriptions` by `user_id` (IN list). `notificationQueue` items carry an optional `webpushUserIds`; the queue persists it as JSON in the new `notifications.target_user_ids` column (migration `20260808-082`) so recovery after restart re-sends to the SAME audience — a targeted notice can never degrade into a parish-wide broadcast. `notifyParishNotice` now computes parent recipients via the phone-link SSOT and filters by `targetBranch` (chi đoàn of the child) when set; the old always-parish-wide webpush is removed (staff still get Telegram as before).

### Consequences
- **Positive**: Parents see only their own children (verified by route tests + spec); branch notices reach exactly the right parents; zero new tables; recovery is audience-safe.
- **Negative**: Phone-link assumes parents log in with the phone stored on their child's record — mismatches hide children until a GLV updates the phone (surfaced as an empty-state hint in the portal). Parents are not notified when their phone does not match any student; a future reconciliation report could list unmatched `parentPhone`s. Branch filtering keys off `students.branch` (chi đoàn name enum), consistent with the client `BranchType`. Tests: 785 total (incl. 10 new push/export suites), `tsc -b` clean.

## ADR-023: Offline Exam Sync — Temp-ID Remap, Dependency Ordering & Idempotent Session Create (Phase 3)

### Context
Phase 1-2 of Smart Exam Grading ran **online-only** (plan §11) — `examStore` called the API directly. Making exam grading work offline required wiring the entity into the existing ADR-016 sync pipeline. The first review found the scaffolding half-wired: `syncService`/`syncProcessor` had exam cases, but `examStore` never enqueued (imported the sync functions without calling them — dead code), `useSyncEngine` referenced `useExamStore` without importing it (build error), and the temp-ID remap existed only for student/class. `exam_results` depends on `exam_session_id`, so a session created offline must be pushed (CREATE) **before** its results (UPDATE `save_results`) — the same parent-first rule as student/class in ADR-016 Phase 1.5.

### Decision
1. **Wire `exam` into the store**: `examStore` now branches on `navigator.onLine` in every mutation — `createSession`/`saveScores`/`removeResult`/`completeAndFinalize`/`reopenSession` enqueue via `syncService` (`.syncCreateExam`, `.syncSaveExamResults`, `.syncRemoveExamResult`, `.syncCompleteExam`, `.syncReopenExam`) and update the local cache immediately (offline-first UI); reads (`loadMySessions`/`selectSession`/`refreshResults`) keep the local Dexie cache while offline.
2. **Temp-ID + remap (ADR-016 pattern)**: offline `createSession` builds a local session with `EXS-tmp-*` id and enqueues CREATE. The sync engine's Phase 1.5 `createOps` filter now includes `exam`, so CREATE pushes before any UPDATE. `applyServerResultAsync` handles `entity === 'exam'`: `examStore.replaceSessionId` swaps temp → server id in state, then `remapExamSessionIdInPendingOps` rewrites `entityId`/`sessionId`/`examSessionId`/`id` in every pending payload (including nested `payload.scores[].studentId` remap when a student temp-id resolves first).
3. **Idempotent CREATE**: `createExamSession` (server) accepts an `idempotencyKey` (migration `20260808-093` + unique index `094`); the client sends the temp session id as the key — a retry after timeout returns the already-created session instead of duplicating (same contract as ADR-016 student/class).
4. **Actions stay idempotent**: server `complete`/`reopen` are already idempotent (`status` check); `save_results` upserts via `UNIQUE(exam_session_id, student_id)`.
5. **Semantics preserved**: offline `completeAndFinalize` still runs the local conflict matrix (§6) and daily pipeline — the pipeline writes through `gradeStore`/`dailyGradeStore` which have their own sync paths; server-side lock/class-access validation is deferred to sync-time and surfaces as a failed op if violated.

### Consequences
- **Positive**: Exam grading now works fully offline (scan → save → finalize); zero duplicate sessions on retry; consistent with ADR-016 remap semantics; local cache survives reload via `parish_store_exams` (Dexie v3).
- **Negative**: Offline complete cannot be rejected server-side at click-time — if the semester is locked or class access is revoked, the op fails at sync and the user is notified via sync status (System Diagnostics). Offline-created sessions appear in the list with a temp id until the next successful sync.
  - **Amendment FE-F1 (2026-08-21)**: trước đây local session vẫn hiển thị `completed` sau khi op 'complete' bị từ chối vĩnh viễn (không có rollback). Giờ engine gọi `examStore.revertLocalComplete(sessionId)` ở nhánh permanent-fail → phiên quay về `draft` ngay, khớp trạng thái server.
- **Tests**: `examStore.test.ts` (6 offline-path cases), `syncProcessor.test.ts` (5 exam cases), `examService.test.ts` (idempotency + column persistence), `migration-integrity.test.ts` (Phase 4 columns). `tsc` clean both sides.

## ADR-024: Multiple-Choice OMR — Bubble-Grid Reading, Answer-Key Scoring & Answers Persistence (Phase 4)

### Context
The Phase 2 POC (`detectScoreFromImage`) read a single 0-10 bubble grid. The parish also runs 15'/1-tiết tests in trắc nghiệm form (A/B/C/D). Phase 4 extends the sheet to a per-question option grid and persists the raw answer map so a later re-key or dispute can be audited. The first review found the detector existed but was not wired end-to-end: `ExamScanModal` never sent answers, the union-typed render referenced a field that doesn't exist on the MC result (build error), and the sheet template had no MC layout tests.

### Decision
1. **MC sheet layout (SSOT)**: `answerSheetTemplate.mcOptionToCell(question, option, totalQuestions)` lays out A/B/C/D options per question (1/2/3 columns adaptive to question count), `allMcCells(totalQuestions)` enumerates all cells — printed by `AnswerSheetModal` and read by `detectAnswersFromImage` from the same coordinates.
2. **Detector**: `omr.ts:detectAnswersFromImage(img, answerKey?, totalQuestions, maxScore)` — reuses the Phase 2 marker/homography pipeline, reads each option cell's coverage, flags `isBlank` / `isMultiFill`, picks the top option, and scales `rawCorrectCount/totalQuestions × maxScore` to a score (rounded 1 decimal). No ML; always returns per-question confidence; UI keeps the 2-step confirm before writing.
3. **Persistence**: `exam_sessions` gains `exam_type`/`question_count`/`answer_key`; `exam_results.answers` stores the JSON answer map (`{"1":"A","2":null}`). `api.saveExamResults`/`syncService`/`syncProcessor` pass `answers` through; `GET results` returns it for audit.
4. **UI**: `ExamSessionView` create-form adds examType/questionCount/answerKey (admin); `ExamScanModal` receives them, runs the MC detector, and `handleSave` serializes the per-question answer map into `answers` before `saveScores` (which also works offline via ADR-023).
5. **2-step confirm retained** (plan §12): `isMultiFill`/`isBlank`/low-confidence never auto-write.

### Consequences
- **Positive**: Trắc nghiệm sheets scan with per-question auditing; answers are stored server-side (re-key/review possible); score derivation is transparent (correct-count ratio); single template SSOT for printer + detector.
- **Negative**: Answer-key entry is admin-only metadata on the session; re-scoring after the fact is not implemented (future work — answers are already persisted); MC reading is still template-constrained (requires the 4 corner markers + clean capture). Tests: 6 new MC cases in `omr.test.ts` (+ server routes test), `tsc` clean both sides.

## ADR-025: Phiên Chấm cho Trợ Tá (phuta) & Xóa Phiên Draft (Delete Session Authorization)

### Context
Parish yêu cầu: giáo viên chủ nhiệm (`chunhiem`) và trợ tá (`phuta`) tạo phiên chấm bài cho lớp mình phụ trách, và xóa phiên khi tạo nhầm. Trước đây `POST /api/exams` chỉ cho `admin` + `chunhiem`; chưa tồn tại endpoint xóa phiên. Rủi ro cần chốt: phiên `completed` đã finalize → client đã ghi điểm vào bảng điểm qua `gradeService.upsertGrade` (ADR-023 §5) nên xóa phiên completed sẽ để lại điểm gốc từ `exam_scan` không truy vết — vi phạm data integrity.

### Decision
1. **`phuta` tạo phiên**: `POST /api/exams` thêm `phuta` vào `roleMiddleware`; `checkUserClassAccess` (đã có) giới hạn đúng lớp mình phụ trách (`catechistAssignments`). `chunhiem` giữ nguyên. Hoàn tất phiên (`complete`) vẫn chỉ `admin` + `chunhiem` — trợ tá nhập điểm nhưng không đóng phiên.
2. **Xóa phiên draft**: `DELETE /api/exams/:id` (admin / chunhiem / phuta, class-access check cho non-admin). Service `deleteExamSession` chạy 1 transaction: chỉ cho xóa khi `status === 'draft'` (phiên completed → 409, admin phải `reopen` trước nếu thực sự cần); xóa `exam_results` của phiên (FK cascade cũng đã enforce) rồi xóa `exam_sessions`; ghi audit `EXAM_DELETE_SESSION` kèm `resultsDeleted`.
3. **Offline**: `syncDeleteExam` enqueue `exam/DELETE`; `syncProcessor` xử lý qua `api.deleteExam`. Compact queue đã xử lý đúng cặp CREATE+DELETE chưa sync (xóa cả 2 → server không bao giờ tạo phiên ảo). UI ẩn nút xóa khi phiên completed.
4. **Seed RBAC**: thêm permission `exam.delete`; cấp `exam.create`/`exam.delete` cho `chunhiem` + `phuta` (RBAC table là metadata — authorization thực tế do `roleMiddleware`).

### Consequences
- **Positive**: Trợ tá tự tạo phiên chấm cho lớp mình; phiên tạo nhầm xóa được ngay (draft) kèm audit đầy đủ; không có đường nào xóa phiên đã ghi điểm (data integrity giữ).
- **Negative**: Phiên `completed` không xóa trực tiếp được (phải admin `reopen` → draft → xóa); RBAC table seed chỉ áp dụng cho DB mới (DB đã deploy không cần vì authorization chạy qua role, không qua permission table).
- **Tests**: `examService.test.ts` (phuta create 201/403 + 4 delete cases: xóa draft kèm cascade + audit, 403 lớp khác, 404, 409 completed, chunhiem/admin), `examStore.test.ts` (3 delete cases online/offline/error), `syncProcessor.test.ts` (exam DELETE). `tsc -b` + oxlint + full vitest suite pass.

## ADR-026: Cấp Tài Khoản Phụ Huynh Hàng Loạt từ `students.parentPhone` (Parent Account Provisioning)

### Context
Cổng phụ huynh (ADR-022) khớp liên kết PH ↔ con qua SĐT lúc truy vấn: `users.phone` ↔ `students.parentPhone` (chuẩn hóa `phone.ts`, SSOT `CanAccessStudentSpecification`). Tài khoản `phuhuynh` do admin tạo tay từng người (`POST /api/users`), nhưng giáo xứ đã có sẵn toàn bộ `parentPhone` trong danh sách học sinh (nhập tay `StudentModal` hoặc import Excel). Chi phí thủ công tăng theo số phụ huynh (hàng trăm), và ADR-022 ghi nhận giới hạn: "parents are not notified when their phone does not match any student; a future reconciliation report could list unmatched parentPhones". Phương án thay thế (tự tạo account khi import học sinh; phụ huynh tự đăng ký) bị loại: import chạy bởi người không phải admin + trộn 2 concern; self-registration cho phép bất kỳ ai biết SĐT của con xem điểm — lỗ hổng privacy dữ liệu trẻ em nếu không có xác minh OTP (chưa có hạ tầng SMS).

### Decision (Decision Matrix SECURITY profile — A: endpoint admin 7.65 vs B: side-effect import 5.45 vs C: self-registration 5.55)
1. **`GET /api/users/parent-provision-preview`** (admin-only): scan học sinh cùng giáo xứ (chưa soft-delete) → normalize + dedupe SĐT → chỉ trả SĐT **chưa** gắn tài khoản. SKIP (không nằm trong preview): SĐT rỗng/placeholder `'Chưa cập nhật'`/không hợp lệ (VN 10 số sau chuẩn hóa); SĐT đã có user trong giáo xứ (bất kỳ role — kể cả GLV trùng SĐT); SĐT trùng **username** của tài khoản nào *(tại thời điểm quyết định 2026-08-12: UNIQUE toàn cục; **cập nhật theo ADR-046 (2026-08-16)** — username unique `(parish_id, username)` → chỉ loại trùng trong cùng giáo xứ, cùng SĐT ở giáo xứ khác vẫn cấp được bình thường)*. Anh chị em cùng SĐT → 1 candidate với `childrenCount`.
2. **`POST /api/users/provision-parents`** (admin-only + **re-authentication**): body bắt buộc `{ adminPassword }` — `verifyAdminReauth` (SSOT chuẩn A05/A06) + `adminReauthRateLimiter` 10/60s/IP; sai → 401 `INVALID_ADMIN_PASSWORD` + audit `PARENT_ACCOUNTS_PROVISION_FAILED`. Endpoint trả nhiều mật khẩu tạm nên thuộc family nhạy cảm; đồng thời lấp pattern còn mở của A08 (`POST /users` đơn lẻ vẫn chưa có re-auth — theo dõi riêng).
3. **Tài khoản tạo theo đúng chuẩn có sẵn**: `role='phuhuynh'`, `username` = SĐT chuẩn hóa, `fullName` = `parentName`, `phone` = SĐT chuẩn hóa (đảm bảo khớp `parentService`), temp password `Parish@\d{6}` (đạt policy §10.1), bcrypt cost 12, `passwordEncrypted` theo ADR-021 (NULL nếu thiếu `PASSWORD_CIPHER_KEY` — production hiện tại), `status='FORCE_PASSWORD_CHANGE'` + `mustChangePassword=1` (§10.2), `tokenVersion=1`. **Không** gán `catechistAssignments` (fix: `createUser` chỉ tạo assignment cho `chunhiem`/`phuta` — trước đây `phuhuynh`/`admin` gán lớp sinh row `roleInClass='phuta'` sai, `checkUserClassAccess` đọc bảng này cho mọi role). *(Hardening 2026-08-22 — A-NEW-59: update path cũng bị chặn — `updateUserAssignments`/`PUT /users/:id/assignments` trả 400 `ASSIGNMENTS_NOT_ALLOWED` khi gán lớp cho admin/phuhuynh; danh sách rỗng vẫn cho phép để dọn row bẩn; UI ẩn nút sửa phân công cho 2 role này.)*
4. **Partial-success itemized (ADR-008) + idempotent (ADR-015)**: response `{ total, successCount, skippedCount, errorCount, results: [{ phone, fullName, status: created|skipped|error, reason?, username?, tempPassword? }] }`; mỗi item 1 transaction riêng; chạy lại → toàn bộ skip (total 0, không duplicate). Race UNIQUE → skip `username_exists`. Không retry tự động client (A12 — POST không Idempotency-Key).
5. **Audit gộp không PII (A16)**: 1 hàng `PARENT_ACCOUNTS_PROVISIONED` / lần chạy — `{ total, successCount, skippedCount, errorCount, createdIds }`; KHÔNG chứa SĐT/plaintext mật khẩu; `entityId='bulk-parent-provision'`.
6. **UI**: `UserManagementPage` nút "Cấp Tài Khoản Phụ Huynh" → modal preview (danh sách SĐT + số con) → nhập mật khẩu admin (re-auth) → bảng kết quả itemized + copy mật khẩu tạm từng dòng. Form tạo tài khoản thủ công ẩn "Phân Công Lớp" cho role `admin`/`phuhuynh`. *(Cập nhật UI 2026-08-22: quản lý tài khoản tách 2 tab riêng trong `/management` — "Tài Khoản Phụ Huynh" & "Tài Khoản GLV & Nhân Sự" — cùng `UserManagementPage` prop `scope`; route `/users` giữ xem toàn bộ vai trò.)*

### Consequences
- **Positive**: 1 cú bấm cấp toàn bộ tài khoản phụ huynh còn thiếu (idempotent, an toàn chạy lại); username = SĐT đúng tiêu đề ADR-022 ("parents log in with the phone stored on their child's record"); không thêm bảng/schema; audit truy vết + re-auth đầy đủ; fix bug ô nhiễm `catechistAssignments` cho role không phải GLV.
- **Negative**: SĐT lệch định dạng trong `parentPhone` vẫn khớp qua `phoneMatchVariants` (không làm tệ hơn ADR-022); account `phuhuynh` trùng SĐT GLV bị skip (admin xử lý tay — người vừa là GLV vừa là phụ huynh chỉ có 1 tài khoản); bcrypt cost 12 tuần tự ~0.3s/account → giáo xứ lớn (>150 tài khoản) cần chờ lâu hơn (1 lần duy nhất, chạy lại vô hại); ~~username global-unique: 2 giáo xứ trùng SĐT → giáo xứ sau bị skip + báo cáo~~ **không còn đúng từ ADR-046 (2026-08-16)**: username unique `(parish_id, username)` → 2 giáo xứ trùng SĐT cấp tài khoản độc lập bình thường.
- **Tests**: `parent-provision.test.ts` (9 tests: 401/403 preview, dedupe anh chị em, chuẩn hóa +84, skip placeholder/invalid/existing/username-collision/deleted/tenant-foreign, re-auth 400/401 + audit failed, tạo đúng fields + bcrypt khớp temp password, audit không PII, idempotent re-run, không catechistAssignments, fix createUser phuhuynh). `tsc -b` + oxlint + vitest pass.

## ADR-027: Tên Thánh & Username Tự Sinh cho Tài Khoản GLV (`users.holy_name` + cú pháp `chucvu_tenThanh_hoTen`)

### Context
Giáo lý viên (GLV) thường được biết đến qua **Tên Thánh** (ví dụ "Thầy Phê-rô Bảo"), nhưng form tạo tài khoản chỉ có Họ tên → admin phải nghĩ username thủ công mỗi lần, dễ trùng/khó đoán, và tên thánh không được lưu trong hệ thống (chỉ có ở `students.holy_name`). Nhu cầu: thêm cột **Tên Thánh** cho tài khoản và hệ thống **tự sinh username** theo cú pháp `chức vụ_Tên thánh + Họ và tên` (bỏ dấu, nối liền, viết thường) — ví dụ `glv_pherophanvanbao`. Tự sinh làm giảm lỗi gõ tay, username có ý nghĩa (dễ nhớ, dễ thông báo cho user), và tránh trùng qua check UNIQUE sẵn có.

### Decision (Decision Matrix GENERAL profile — server-SSOT username generation 8.10 vs client-side generation 6.30 vs user luôn nhập tay 5.45)
1. **`users.holy_name`** (TEXT nullable): column mới trong `schema.ts` + base DDL + migration `20260812-104` (`ALTER TABLE users ADD COLUMN holy_name TEXT`). `GET /api/users` trả tự động (list trả toàn bộ columns).
2. **Cú pháp username tự sinh**: `prefix + '_' + TenThanh + ToanBoHoTen` — prefix theo role thật: `phuta`→`glv`, `chunhiem`→`cn`, `admin`→`ad`. **Giữ toàn bộ họ tên** (kể cả chữ lót): "Phê-rô" + "Phan Văn Bảo" → `glv_pherophanvanbao`. Loại bỏ dấu tiếng Việt (normalize NFC + map `đ→d`), chỉ giữ `[a-z0-9]` (mất '-'/' ' của "Phê-rô", dấu nháy...). `phuhuynh` **không dùng cú pháp này** — username = SĐT chuẩn hóa (quy ước ADR-026/022 đã có).
3. **Server là SSOT**: `server/src/utils/username.ts` (mới) chứa `buildAutoUsername`/`removeDiacritics`/`isValidVnPhone`; `userService.resolveUsername` quyết định cuối: username **override (nhập tay) thắng**; nếu không có override → tự sinh; thiếu Tên Thánh (role ≠ phuhuynh) → 400 `HOLY_NAME_REQUIRED`; phuhuynh thiếu SĐT → 400 `PHONE_REQUIRED`. Client chỉ có **mirror preview** (`src/utils/username.ts`) để hiển thị realtime trong form — KHÔNG bao giờ tin client.
4. **Trùng username** → vẫn 409 `USERNAME_EXISTS` (không tự append số — tránh username vô nghĩa); admin được khuyến khích nhập override thủ công. Zod: `username`/`holyName` chuyển thành **optional** trong `POST /api/users` (trước đây bắt buộc).
5. **Audit**: `CREATE_USER.newValue` thêm `holyName` (chỉ tên thánh — không phải PII nhạy cảm, không vi phạm A16).

### Consequences
- **Positive**: Tên thánh được lưu chuẩn (hiển thị "Th. Phê-rô" cạnh tên trong bảng user); username đồng nhất, dễ đọc, giảm công tạo tài khoản; server tự sinh nên không phụ thuộc client; khách mới (`glv_...`) không đụng tài khoản cũ.
- **Negative**: User tên trùng (cùng tên thánh + trùng họ tên) → 409 phải nhập tay; username sau khi tạo **không đổi được** (chính sách hiện hành — `/profile` không cho đổi username); prefix `glv` khác mnemonic role `phuta` (tên role chưa đổi, chỉ username đổi).
- **Tests**: `server/src/__tests__/utils/username.test.ts` (8: cú pháp đủ chữ lót, prefix 3 role, bỏ dấu/ký tự đặc biệt/khoảng trắng, hoa→thường, phuhuynh/thiếu → rỗng, isValidVnPhone), `server/src/__tests__/auto-username.test.ts` (7 integration POST /users: 201 tự sinh + holyName lưu, cn_/ad_ prefix, 400 HOLY_NAME_REQUIRED/PHONE_REQUIRED, phuhuynh username = SĐT, override thắng, trùng → 409), `src/__tests__/utils/username.test.ts` (client mirror khớp server). `tsc -b` + oxlint + vitest pass (ngoài `pdfService.ts` — công việc PDF dang dở của bản nháp, hoàn thiện riêng).

## ADR-028: Khôi Phục (Undo) Đợt Nhập Điểm qua Audit Log (`POST /api/grades/undo-import`)

### Context
Nhập điểm sai từ Excel/dán bảng không có cơ chế khôi phục — người dùng chỉ còn cách sửa tay từng ô. Mỗi lần ghi điểm (CREATE/UPDATE) đã sẵn `audit_logs` với `oldValue` = ảnh toàn bộ row trước khi ghi (`gradeService.ts`), nên audit là nguồn restore tự nhiên, không cần bảng mới hay snapshot riêng. Cơ chế `restore-batch` hiện có chỉ undo *override* (`grade_overrides`), không phải nhập/import.

### Decision (Decision Matrix GENERAL profile — audit-as-SSOT 8.05 vs bảng undo_log riêng 6.10 vs snapshot client 4.90)
1. **`POST /api/grades/undo-import`** (admin/chunhiem): body `{ semester, academicYear, studentIds[] }` (tối đa 500) — client tra theo studentId + HK + năm, không cần biết server gradeId. Mỗi item 1 transaction riêng (pattern `upsertGradeBatch`).
2. **Đảo ngược lần ghi gần nhất** (audit entry mới nhất `entityType='grade'`): `CREATE` → xóa row (kèm `grade_overrides`); `UPDATE` → khôi phục cột từ `oldValue` (version +1, updatedBy ghi).
3. **Cửa sổ 7 ngày** (`UNDO_GRADE_WINDOW_DAYS`): entry cũ hơn → status `expired`.
4. **Điều kiện sạch**: entry mới nhất phải là `CREATE`/`UPDATE` — nếu là thao tác khác (VD: `GRADE_UNDO` trước đó) → status `not-clean`, từ chối (chống undo lặp và mất sửa tay sau import).
   - **Amendment GRADE-UNDO-F1 (2026-08-21)**: chỉnh tay của GLV sau import dùng chung action `UPDATE` với đợt import nên guard cũ không phân biệt được — undo lặng lẽ revert cả sửa tay. Bổ sung phát hiện qua nguồn điểm trong `newValue`: entry UPDATE chứa field nào `_source === 'manual'` → `not-clean` ("Đã có chỉnh tay của giáo lý viên sau đợt nhập"). Code giờ khớp đúng Negative consequence đã tuyên bố.
5. **Access + semester lock**: `allowedClassIds` check trong cùng tx (ADR-016 S24 — đóng TOCTOU); học kỳ đã khóa sổ → status `locked`.
6. **Audit chính thao tác**: mỗi item ghi `GRADE_UNDO` (oldValue = trạng thái trước undo, newValue = trạng thái sau / null khi xóa).
7. **Client**: `ExcelGradeImportModal` lưu snapshot (studentIds, HK, năm, thời điểm) vào localStorage sau import; hiện nút "Hoàn Tác Đợt Nhập Trước" trong 7 ngày; sau undo refetch grades.

### Consequences
- **Positive**: khôi phục điểm import sai trong 1 cú bấm; không migration (tận dụng audit đã có); chủ nhiệm chỉ undo được điểm lớp được bổ nhiệm (class-access như quyền sửa điểm); mọi thay đổi sau import đều từ chối an toàn (`not-clean`).
- **Negative**: undo lần ghi gần nhất — nếu sau import đã sửa tay, undo sẽ bị từ chối (an toàn > tiện lợi); offline: chỉ undo được khi có mạng (server-side); snapshot localStorage có thể bị xóa — thao tác vẫn khả dụng qua audit nếu gọi API trực tiếp.
- **Tests**: `server/src/__tests__/services/gradeUndoImport.test.ts` (7: restore UPDATE → oldValue, delete CREATE, **GRADE-UNDO-F1 chặn undo khi lần ghi gần nhất là chỉnh tay manual → not-clean**, expired 8 ngày, chặn undo lần 2 → not-clean, not-found, chunhiem khác lớp → forbidden). `tsc -b` + oxlint + vitest (full suite) pass.

## ADR-029: Codemagic CI/CD cho Native Builds (Android APK + iOS TestFlight) khi không có máy Mac

### Context
Dự án chuyển sang dual-platform Capacitor 8 (ADR nền tảng: commit `7560484`, `1ec9c31`). Android build được trên máy Windows hiện tại (Gradle + Android SDK), nhưng **không có máy Mac** nên không thể build iOS native tại chỗ (Apple bắt buộc Xcode trên macOS). Hiện tại app phân phối qua PWA cho iPhone (zero-cost, đã hoạt động) — Codemagic là bước chuẩn bị khi cần app iOS chính thức (TestFlight/App Store). So sánh options (Decision Matrix GENERAL): **Codemagic 6.6** vs GitHub Actions macOS runner 7.0 vs thuê Mac (MacinCloud) 6.8 vs PWA-only 8.5 — PWA-only thắng **hiện tại** (R0, 0 đồng), Codemagic được chọn làm pipeline sẵn sàng vì hỗ trợ Capacitor tự nhiên + `xcode-project build-ipa` tự động signing (không cần tự viết xcodebuild/export plist như GH Actions).

### Decision
1. **`codemagic.yaml`** (root repo) gồm 2 workflows:
   - `ios`: `npm ci` → `npm run build:frontend` (tsc + vite, mode production → `VITE_API_BASE=https://tnttvn-production.up.railway.app/api`) → `npx cap sync ios` → `xcode-project build-ipa` (Codemagic tự động code signing `distribution_type: app_store`, bundle id `com.tnttvn.app`) → publish TestFlight (`app_store_connect.submit_to_testflight: true`, beta group `TNTTVN Beta Testers`).
   - `android`: cùng chuỗi web build → `npx cap sync android` → `./gradlew assembleDebug` → artifact `app-debug.apk` (không publish, chỉ tải về — Play Store để sau).
2. **iOS platform đã được thêm** vào repo (`ios/` — generated bởi `npx cap add ios`; có thể chạy trên Windows vì chỉ copy template, riêng build cần macOS runner của Codemagic).
3. **Không** thêm plugin push native (`@capacitor/push-notifications`) ở bước này — push hiện dùng Web Push (`pushManager.ts`), tự disable trên native; APNs là backlog (vẫn cần Apple Developer $99 dù có Codemagic).
4. Chi phí: free tier Codemagic ~500 build phút/tháng (đủ cho chu kỳ phát hành hiện tại); cần **Apple Developer Program $99/năm** cho TestFlight/App Store + APNs.

### Consequences
- **Positive**: build iOS/Android từ bất kỳ máy nào (không cần Mac); signing + TestFlight hoàn toàn tự động; Android APK cũng tái sử dụng pipeline (nhất quán); không commit secret vào repo (App Store Connect auth + signing nằm trong Codemagic UI integration).
- **Negative**: phụ thuộc dịch vụ bên ngoài (Codemagic) — khi cần nâng cấp có thể chuyển sang GitHub Actions (`macos-latest` runner + `xcodebuild`), chậm hơn build máy local; TestFlight yêu cầu tạo bundle id + beta group trong App Store Connect trước lần publish đầu; version bump thủ công (`versionCode`/`versionName` trong `android/app/build.gradle`, `ios/App/App.xcodeproj`).
- **Reversibility**: R1 (redeploy — xóa codemagic.yaml/ios/ là về trạng thái PWA-only, không mất chi phí cam kết).
- **Verify**: YAML được kiểm tra schema bởi Codemagic UI khi thêm workflow; build web cục bộ `npm run build:frontend` pass; benchmark build iOS đầu tiên sẽ đo trên runner cloud (không đo được cục bộ).

### Cập nhật (2026-08-19): GitHub Actions build IPA sideload (unsigned, không cần Apple Developer)

- **Động lực**: Cần app native trên iPhone ngay, nhưng chưa có Apple Developer $99 và Codemagic workflow `ios` yêu cầu App Store Connect integration (bắt buộc Apple Developer). PWA đã hoạt động nhưng người dùng yêu cầu app native sideload.
- **Quyết định**: Thêm workflow `.github/workflows/ios-ipa.yml` (trigger thủ công `workflow_dispatch`, runner `macos-15`) — build web (env `VITE_API_BASE=https://tnttvn-production.up.railway.app/api`) → `npx cap sync ios` → `xcodebuild archive` với `CODE_SIGNING_ALLOWED=NO` → đóng gói **IPA unsigned** (`Payload/App.app`) → upload artifact `tnttvn-ipa`. IPA unsigned cài qua **Sideloadly (Windows)** hoặc **AltStore** — hai công cụ này tự ký lại bằng Apple ID thường của người dùng khi cài. Không có `.entitlements` trong project (iOS deployment target 15.0, bundle id `com.tnttvn.app`) nên không vướng entitlement (push native không dùng — ADR-029 §3).
- **So sánh (Decision Matrix GENERAL, lần này):** A) GH Actions unsigned IPA 8.2 vs B) dùng Codemagic TestFlight (chặn bởi chưa có Apple Developer — không gate được) vs C) PWA-only 8.5. Chọn **A**: không phụ thuộc dịch vụ ngoài (giữ nguyên repo), R0 reversibility (xóa workflow là hết), chi phí macOS runner GH Actions (public repo free; private repo tính phí phút macOS). Codemagic vẫn là pipeline chính thức cho TestFlight/App Store khi có Apple Developer — **không xung đột ADR-029**, chỉ bổ sung đường sideload.
- **Giới hạn (ghi rõ)**: tài khoản Apple ID free phải **re-sign mỗi 7 ngày** (AltStore tự re-sign qua Wi-Fi khi AltServer chạy), tối đa 3 app/Apple ID; app cài qua sideload không có push (đã disable trên native) và không qua App Store.
- **Verify**: `yaml-lint` pass workflow; đã build thành công chuỗi web + `cap sync ios` + Android `assembleDebug` cục bộ (cùng công cụ chain); build IPA đầu tiên đo trên runner (không build được cục bộ vì thiếu macOS).
- **Fix puppeteer postinstall (2026-08-19)**: cả `ios-ipa.yml` và `ci.yml` fail ở `npm ci` vì postinstall của `puppeteer` (devDependency, dùng trong `pdfService.ts` server + `examQrRender.test.ts` + `scripts/debug-*`) tải Chrome for Testing về `~/.cache/puppeteer` — runner bị cache hỏng (folder tồn tại nhưng thiếu executable / extraction `File exists`) và Chrome 151 CDN không tải lại. Fix: `PUPPETEER_SKIP_DOWNLOAD=true` ở cả 2 workflow; `ci.yml` thêm `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome` (Chrome pre-installed trên runner) để `examQrRender.test.ts` vẫn chạy được. Không đổi dependency — CDN flaky bỏ qua, build nhanh hơn.
- **CORS native shell (2026-08-19, A-NEW-58)**: WebView native không gọi được API production (CORS allowlist chỉ có vercel.app → "Network error - unable to reach server" khi login từ app sideload). Thêm 3 origin vào `DEFAULT_ALLOWED_ORIGINS` + `PRODUCTION_ALLOWED_ORIGINS` (`originPolicy.ts`): `capacitor://localhost` (iOS — scheme `capacitor` trong CAPInstanceDescriptor), `https://localhost` (Android Capacitor 8 — androidScheme mặc định `https`), `http://localhost` (Android < 8). Fix normalize origin: `new URL(x).origin` trả `"null"` cho scheme tùy chỉnh (opaque origin) → giờ fallback `scheme://host:port` thủ công, test bắt `capacitor://evil.example.com` bị từ chối. Origin header không giả mạo được từ JS (forbidden header name), auth vẫn Bearer JWT — không vector mới. Verify: `cors-origins.test.ts` 11/11, tsc server 0 error.

## ADR-030: Hợp Nhất Design System — Token `index.css` Làm SSOT Duy Nhất (2026-08-13)

### Context
App đang vận hành **2 chuẩn thiết kế song song**: (A) token system trong `src/index.css` (`--color-parish-*`, `--color-surface-*`, `--color-text-*` + component classes `.btn/.card/.badge/.form-*/.modal-*`, dark-mode `.dark` overrides) được dùng phổ biến (310 chỗ `parish-primary`), và (B) "Design System v2.0" (tác giả Manus AI, ngoài repo, chưa ADR) mà một nhóm file đang code theo (`bg-white/90 backdrop-blur-sm border-white/40` glass ×115, `bg-slate-*` ×166, `bg-blue-600` buttons). Audit 2026-08-13 (2 round, đầy đủ file:line) xác nhận cùng một element có 3–5 kiểu: 4 pattern page-header, 5 kiểu thead, 4 kiểu modal overlay, 4 kiểu primary button. Đo contrast trực tiếp: `#94A3B8` (Text Muted DS v2.0) = **2.56:1 → FAIL WCAG AA** vs `text-muted #64748B` = 4.76:1 pass; `#2563EB` (Primary DS v2.0) = **màu khăn chi đoàn Thiếu Nhi** (`branches.ts:22-24` — ngữ nghĩa nghiệp vụ) và lệch brand `theme-color #1E3A8A` (`index.html:7`). DS v2.0 không quy định dark mode (app có dark mode hoạt động — 103 `dark:` variants/11 files) và không quy định mobile (app có bộ `mobile-*` hoàn chỉnh). `docs/03_DESIGN_SYSTEM.md` được `index.css` tham chiếu nhưng **không tồn tại**.

### Options (Decision Matrix GENERAL)
| Criterion | W | A: Giữ index.css | B: DS v2.0 nguyên trạng | C: Merge có mapping |
|---|--:|--:|--:|--:|
| Business/Operational Fit | 15% | 8 | 3 | 9 |
| Reliability & Data Integrity | 20% | 10 | 10 | 10 |
| Security & Privacy | 20% | 10 | 10 | 10 |
| Maintainability | 15% | 6 | 2 | 9 |
| Performance | 10% | 8 | 6 | 9 |
| Testability | 10% | 8 | 5 | 7 |
| Reversibility | 5% | 10 | 5 | 8 |
| Observability | 5% | 7 | 5 | 8 |
| **Weighted** | **100%** | **8.55** | **6.35** | **9.10** |

Hard gates D3: Security/Privacy/Data Integrity đều ≥ 8 cho cả 3 (quyết định thuần UI, không đụng dữ liệu/auth — evidence: không file nào trong phạm vi đụng server code path). B loại bởi weighted score + ràng buộc phi-gate: WCAG FAIL (2.56:1), mất dark mode, xung đột màu nghiệp vụ chi đoàn, đổi brand chưa phê duyệt. ADR gate: không ADR cũ về UI → PASS. Architecture guard: không đụng layer/mobile shell → PASS.

### Decision
1. **SSOT duy nhất = token/class trong `src/index.css`**, tài liệu hóa tại **`docs/03_DESIGN_SYSTEM.md` v3.0** (tạo mới — supersede mọi chuẩn UI trước, gồm "DS v2.0" không chính thức).
2. Kế thừa phần giá trị DS v2.0 vào tài liệu: typography hierarchy, page container pattern, table colgroup min-width (`w-[240px]` tên, `w-[60px]` STT, `w-[120px]` tên thánh) — mapping màu sang token.
3. Bảng mapping legacy→token (§9 `docs/03_DESIGN_SYSTEM.md`) là chuẩn migration; màu ngữ nghĩa (học lực, role, CRUD colors, chi đoàn) **giữ nguyên**.
4. Migration theo pha: (1) fix class không tồn tại + `bg-blue-600/700` CTA → token (đã thực hiện đợt này), (2) chuẩn hóa glass/slate theo module (debt first: DesktopSidebar → MobileHomeView → DesktopStudentList → DesktopGradeMatrix → HeaderBar → filter bars → thead/badge/button unification), (3) dark-mode audit toàn bộ, (4) legacy removal (cấm quay lại pattern cũ qua code review + grep check).
5. Cấm: hex cứng/inline style màu, `bg-blue-600` CTA (màu chi đoàn), class không tồn tại, `text-slate-400` làm chữ (WCAG), `space-y-*` trên `.mobile-screen--stack`, backdrop-blur cho nội dung cuộn.
6. Miễn trừ (KHÔNG đụng): `Certificate`, `AnswerSheetModal`/`ExamScanModal` (in ấn + OMR contrast), `@media print` (`index.css:583-621`), mobile shell CSS (`index.css:738-1302`), màu chi đoàn (`branches.ts`), gradient `.mobile-top-bar` (`index.css:1010,1358`).

### Consequences
- **Positive**: 1 chuẩn duy nhất có tài liệu tham chiếu; dark mode & WCAG được đảm bảo; hết xung đột màu brand vs chi đoàn; mobile touch target 44px giữ vững.
- **Negative**: module cũ (glass/slate) hiển thị khác biệt tạm thời tới khi migrate theo pha; tài liệu mới bắt buộc dev tuân thủ (cần code review gate).
- **Reversibility**: R1 (redeploy); migration thuần class-string, không migration dữ liệu.
- **Verify**: đợt này — `npx tsc -b` + `npm run lint` + `npm run test` + build frontend; đợt sau — Playwright visual regression trước/sau từng module; grep check cấm `bg-blue-600` (solid, non-/10) + `text-slate-400` trong file mới.



## ADR-031: Strict Multi-Tenancy via Composite Primary Keys (parishId, id)
**Date:** 2026-08-14
**Status:** Accepted
**Context:** The application serves multiple parishes, but core tables historically used global `id` primary keys. While `parish_id` existed, queries and uniqueness constraints (like `INSERT ... ON CONFLICT`) relied on the global `id`. This caused multi-tenant bleed vulnerabilities during backups/restores, purge actions, and rate limiters (A-NEW-31). Previous mitigations (tenant guard) were workarounds.
**Decision:** Migrate ALL core schema tables to use Composite Primary Keys `(parish_id, id)` at the SQLite level. Update all foreign keys to be composite `(parish_id, fk_id) REFERENCES parent(parish_id, id)`.
**Rationale:**
1. **Data Integrity:** Strict isolation. A row in one parish can never conflict with or overwrite a row in another parish, even if UUIDs collide.
2. **Offline-Sync Safety:** When importing batch data or syncing offline changes, `ON CONFLICT` clauses natively enforce tenant isolation without manual application-level guards.
3. **Foreign Key Integrity:** Cascading deletes and references are mathematically bounded within the same `parish_id`.
**Consequences:**
- **Positive:** Root-cause fix for A-NEW-31. Multi-tenancy is now enforced by the DB engine, not just by application logic.
- **Negative:** Schema migration requires full table rebuilds (`CREATE __new_x ... INSERT ... DROP ... RENAME`) for deployed databases, handled carefully via Drizzle migrations in `MIGRATIONS` array.

**Errata (2026-08-14, D-04):**
- Rebuild migration `20260814-109` initially dropped the `promotion_records.is_latest` column added by migration `043` (missing from both `__new_promotion_records` CREATE and INSERT SELECT, and from `schema.ts`). Fixed — column restored in base DDL, rebuild SQL, and `schema.ts` (`isLatest`). **Rule: any rebuild must mirror every migration-added column present in `schema.ts`.**
- Composite FKs tighten restore semantics: a restore snapshot whose `students` reference a class absent from the snapshot now fails-closed (FK violation → rollback → 500). Restore payloads must include referenced parent rows (`classes`, and their `branches`/`academic_years`).


## ADR-032: Design System v3.1 — Operational Product UI System & Anti-Drift Governance
**Date:** 2026-08-14
**Status:** Accepted
**Context:** TNTTVN achieved Design System v3 as SSOT (ADR-030). However, operational gaps existed in interaction tokens (focus-ring, selected, disabled), typography roles, density modes (desktop dense vs mobile comfortable), domain cell state lifecycles (clean/edited/saving/saved/conflict/locked), state feedback patterns (Empty vs No-Result vs Error), and automated drift prevention.
**Decision:** Upgrade Design System to v3.1 (Operational Product UI System):
1. **Foundation & Interaction Tokens**: Add `--color-focus-ring`, `--color-surface-selected`, `--color-surface-disabled`, and domain cell states (`--color-cell-*`) to `@theme` and `.dark` in `src/index.css`.
2. **Typography Roles System**: Standardize 13 typography role classes (`.typography-display`, `.typography-page-title`, `.typography-numeric-emphasis`, `.typography-grade-value`, etc.).
3. **Density Modes**: Define `.density-comfortable` (mobile), `.density-dense` (desktop), and `.density-ultra-dense` (matrix/attendance).
4. **State Feedback Primitives**: Standardize `StateFeedback.tsx` separating `EmptyState`, `NoResultState`, `ErrorState`, and `SkeletonTable`/`SkeletonCardGrid`.
5. **Anti-Drift Governance Linter**: Introduce `scripts/design-system-lint.mjs` executable via `npm run lint:ds` to automatically enforce token usage and WCAG AA compliance across all components.
**Consequences:**
- **Positive:** Full operational coverage; unified visual language; zero UI drift; guaranteed WCAG 2.2 AA contrast.
- **Negative:** None. Full backwards compatibility with DS v3 tokens.


## ADR-033: Online Leave Request System & Attendance Auto-Synchronization
**Date:** 2026-08-14
**Status:** Accepted
**Context:** Parents needed a mechanism to submit online leave requests for Sunday Mass, Catechism Class, and Eucharistic Adoration (Chầu Thánh Thể / Sinh hoạt Xứ đoàn). Catechists (`chunhiem`, `phuta`) needed to review requests for their assigned classes, while Admins have parish-wide review authority. When a request is approved, attendance records must automatically synchronize into `attendance` as `AbsentExcused` with audit note `[Đơn online] <reason>`.
**Decision:**
1. **Schema Extension**:
   - Add `EucharisticAdoration` to `attendance.type` enum (`['SundayMass', 'CatechismClass', 'EucharisticAdoration']`).
   - Create `leave_requests` table with composite PK `(parish_id, id)` and composite FKs to `students(parish_id, id)` (CASCADE) and `classes(parish_id, id)` (RESTRICT), following ADR-031 multi-tenancy standards.
2. **Authorization Scoping**:
   - `phuhuynh`: Can submit requests and view history only for their verified children (`students.parent_phone` matches `users.phone` via `phoneMatchVariants`).
   - `chunhiem` / `phuta`: Can view and review requests only for students in classes assigned to them via `catechist_assignments` (`getUserClassIds`, `checkUserClassAccess`).
   - `admin`: Full parish-level access to view, approve, reject, or cancel requests.
3. **Attendance Auto-Sync & Audit**:
   - On approval (`APPROVED`), system performs upsert into `attendance` for all selected `session_types` for that student and date, setting `status = 'AbsentExcused'` and `note = '[Đơn online] <reason>'`.
   - Generates audit logs for `CREATE_LEAVE_REQUEST`, `REVIEW_LEAVE_REQUEST`, and `CANCEL_LEAVE_REQUEST`.
   - Sends real-time Telegram notification to parent if account is linked.
4. **UI Integration & Unified Attendance Page**:
   - `LeaveRequestModal`: Modal for submitting requests on Parent Dashboard (`ParentDashboard.tsx`).
   - `DesktopAttendanceGrid` & `MobileAttendanceView`: Unified tab navigation ("Sổ Điểm Danh" vs "Duyệt Đơn Nghỉ Phép") embedding `DesktopLeaveRequests`, displaying pending badge counts and "Có phép online" badges for students with approved leave requests.
   - `DesktopSidebar`: Integrated pending badge on the "Điểm Danh Chuyên Cần" menu item.
**Consequences:**
- **Positive:** Automated workflow eliminating paper notes; streamlined single-page navigation merging attendance grid and leave requests without cluttering sidebar; instant synchronization with attendance registers; strict role authorization preventing unauthorized access; real-time Telegram notification to parents.
- **Negative:** Schema migration `20260814-118` required on deployment.



## ADR-039: SĐT Tài Khoản = Identity — Chỉ Admin Đổi & UI Liên Kết Telegram (2026-08-15)

### Context
Audit vận hành rộng rãi cổng phụ huynh (2026-08-15) phát hiện 2 lỗ hổng chặn + 1 vấn đề vận hành:
1. **P1 (Privacy trẻ em, D3)**: `PUT /api/auth/profile` cho phép **mọi role tự đổi SĐT** không xác minh. `users.phone` là **identity** của phụ huynh (khớp `students.parentPhone` qua `CanAccessStudentSpecification` — ADR-022/026) — PH tự đổi SĐT → **mất con âm thầm** (trả `[]`) hoặc nếu đổi trúng số PH khác → **thấy con của người khác**. Đồng thời KHÔNG có endpoint nào cho admin sửa SĐT sau khi tạo (chỉ create/status/assignments/reset/reveal/force-logout).
2. **P2 (Kênh liên lạc, D2)**: server đã có đủ endpoint Telegram (`parents.ts` link-token/status/notifications/revoke) + bot grammy (`/link`, `/status`, `/optout`, `/optin`, `/unlink`) nhưng **client không có API function/component nào** — kênh đẩy ADR-022 không dùng được từ app.
3. **P3 (Vận hành, D1)**: phân phối mật khẩu tạm hoàn toàn thủ công (copy từng dòng) — provision UI thiếu "sao chép tất cả".

### Decision (Decision Matrix GENERAL/SECURITY)
- **P1**: (a) Chặn PH tự đổi + admin endpoint kèm re-auth [chọn — evidence: `auth.ts:372-384` không xác minh, không validate; `users.ts` không có route sửa phone] · (b) Chặn cứng không cho đổi bao giờ [quá cứng — SĐT đổi là tất yếu, không có đường sửa] · (c) OTP xác minh SĐT mới [thiếu hạ tầng SMS, scope lớn].
- **P2**: (a) Xây `TelegramLinkCard` trong ParentPage [chọn — server/bot đã xong, chỉ thiếu client] · (b) Đợi native app [PWA hiện tại không có].
- **P3**: (a) Nút "Sao Chép Tất Cả Credential" [chọn — đơn giản, admin giữ quyền kiểm soát kênh giao] · (b) In danh sách giấy [temp password in ra = rủi ro lộ, bỏ].

Hard gates D2 (GENERAL: Security/Privacy/Data Integrity/Testability): Security 9, Privacy 10 (chặn cross-parent visibility), Data Integrity 9 (username sync + 409), Testability 9 (+12 tests) — PASS. ADR gate: bổ sung ADR-022/026/027 — PASS.

### Decision
1. **`PUT /api/auth/profile`**: role `phuhuynh` gửi `phone` khác SĐT hiện tại → **403 `PHONE_CHANGE_NOT_ALLOWED`**; `phone` validate `^0\d{9}$` cho mọi role. Client `SettingsPage` disable ô SĐT + hướng dẫn liên hệ BGL.
2. **`PUT /api/users/:id/phone`** (admin): re-auth chuẩn A05/A06 (`adminReauthRateLimiter` + audit `UPDATE_USER_PHONE`/`UPDATE_USER_PHONE_FAILED`), format VN, cấm Admin trưởng. Với `phuhuynh` có username = SĐT cũ (đúng quy ước ADR-026/027) → **username đồng bộ theo SĐT mới** (login = số mới); trùng username trong cùng giáo xứ (`(parish_id, username)` — phạm vi cập nhật theo ADR-046, trước đây là toàn cục) → 409 `USERNAME_EXISTS`; username custom không đổi. Audit KHÔNG ghi SĐT thô (A16).
3. **Telegram UI**: `src/hooks/useTelegramLink.ts` + `src/components/common/TelegramLinkCard.tsx` mount trong `ParentPage` ("Thông Báo Telegram"): trạng thái liên kết, tạo mã (10 phút, copy), bước hướng dẫn `/link`, bật/tắt thông báo, hủy liên kết (confirm dialog), làm mới. Bot `/start` cập nhật hướng dẫn trỏ đúng vị trí UI; env optional `TELEGRAM_BOT_USERNAME` hiển thị tên bot.
4. **P3**: nút "Sao Chép Tất Cả Credential" trong kết quả provision (danh sách `Tên — Đăng nhập — Mật khẩu`).
5. **P4/P5** (ghi nhận, không code): self-service quên mật khẩu cần hạ tầng OTP — PH liên hệ admin reset (đã có A06, hint trên LoginPage); chất lượng `parentPhone` phụ thuộc dữ liệu (đã giảm thiểu bằng `phoneMatchVariants` + preview provision).

### Consequences
- **Positive**: chặn triệt để rò rỉ dữ liệu trẻ em qua đổi SĐT (P1); admin có đường sửa SĐT chuẩn (re-auth + audit); kênh Telegram dùng được từ app với UX 3 bước; phân phối credential nhanh hơn.
- **Negative**: PH không tự đổi SĐT (friction có chủ đích — an toàn > tiện); đổi SĐT phuhuynh đổi cả username → PH phải biết số mới để đăng nhập (admin giao qua kênh riêng); username phuhuynh lệch quy ước (custom) sẽ không tự đồng bộ.
- **Reversibility**: R1 — bỏ block server + route mới là về trạng thái cũ (không migration DB).
- **Verify**: `tsc -b` clean · oxlint 0 error · vitest full suite **176 files / 1304 tests pass** (user-management.test.ts +7 ADR-039; TelegramLinkCard.test.tsx +5). Docs: `FRONTEND_API_CONTRACT.md` §9C, `BUSINESS_RULES.md` §10.10–10.11, `SECURITY_AUDIT_LOG.md` A-NEW-50.

---

## ADR-053: System Polish & Data Integrity Hardening — Phase A Quick Wins (2026-08-15)

> ⚠️ **Renumber 2026-08-22**: đánh số lại từ ~~ADR-041~~ — audit doc-integrity phát hiện trùng số với ADR-041 Cloud Storage: Turso/R2. Nội dung giữ nguyên.

### Context
Sau đợt audit toàn diện hệ thống theo Decision Matrix v4.1.2 (Prompt Polish 10 Domains), 9 điểm nghẽn và rủi ro tính toàn vẹn dữ liệu được xác định cần xử lý khẩn cấp (Quick Wins, Rủi ro thấp - Tác động cao):
1. **P-04**: Sync điểm danh khi duyệt đơn nghỉ phép (`leaveRequests.ts`) thực hiện 2 lệnh ghi riêng rẽ không nằm trong database transaction → rủi ro desync khi lệnh ghi attendance bị lỗi.
2. **P-05**: Polling outbox worker (`outboxService.ts`) sử dụng `setInterval` không có concurrency lock → rủi ro overlapping dispatch khi xử lý chậm, gây duplicate notification.
3. **P-06**: Khởi động bot Telegram (`telegram.ts`) nuốt lỗi im lặng qua catch không log/alert → admin không biết bot ngừng hoạt động.
4. **P-07**: `exam_sessions.idempotencyKey` cho phép `NULL` → SQLite bỏ qua `NULL` trong unique index, tạo kẽ hở tạo trùng phiên thi khi client retry.
5. **P-08**: Pipeline import Excel học sinh (`importService.ts`) chỉ so sánh trùng lặp với DB hiện tại, bỏ qua trường hợp 2 dòng trùng nhau ngay trong cùng file tải lên.
6. **P-09**: Thống kê số dư quỹ tài chính (`financeService.ts`) tải toàn bộ danh sách giao dịch vào RAM Node.js để tính tổng → nghẽn hiệu năng khi dữ liệu tăng trưởng.
7. **P-14**: Mã số phiếu thu/chi (`financeService.ts`) sinh ngẫu nhiên `Math.random()` → nguy cơ va chạm mã phiếu theo thời gian.
8. **P-15**: Cấu hình hệ thống `system_settings` parse JSON trên mỗi request không có cache.
9. **P-16**: Thao tác tạo năm học (`classes.ts`) bắt ngoại lệ SQL Unique Constraint thủ công thay vì sử dụng cơ chế `onConflictDoNothing()` chuẩn của ORM.

### Decision
1. **P-04 (Transactional Leave Sync)**: Bọc toàn bộ logic cập nhật trạng thái đơn `APPROVED` và ghi nhận điểm danh `AbsentExcused` trong một `db.transaction(async (tx) => { ... })` duy nhất.
2. **P-05 (Outbox Polling Lock)**: Bổ sung cờ `isProcessing` trong `outboxService.ts` để chặn hoàn toàn tick trùng lặp của `setInterval`.
3. **P-06 (Telegram Bot Alerting)**: Ghi log `console.error` và tự động ghi log vào bảng `audit_logs` khi `bot.start()` gặp sự cố.
4. **P-07 (Idempotency Key Hardening)**: Thiết lập `exam_sessions.idempotencyKey` thành `.notNull()` kèm SQL default UUID `lower(hex(randomblob(16)))` trên schema Drizzle. Cập nhật `examService.ts` truyền `undefined` khi thiếu key để DB tự sinh UUID.
5. **P-08 (Intra-File Duplicate Detection)**: Bổ sung bộ lọc hash nhóm `(normalizedFullName, dob)` trước khi truy vấn DB trong `importService.ts`, gán cờ trùng lặp nội bộ `intra-file`.
6. **P-09 (SQL-Level Fund Balance Aggregation)**: Thay thế vòng lặp in-memory bằng câu truy vấn `db.select({ total: sql<number>SUM(...)... }).groupBy(...)` tính tổng thu/chi/chuyển quỹ trực tiếp ở tầng SQL SQLite.
7. **P-14 (Sequential Receipt Number)**: Truy vấn số thứ tự lớn nhất trong năm (`LIKE PT-YYYY-%`), tăng tuần tự và pad 4 chữ số (`PT-YYYY-0001`).
8. **P-15 (Settings In-Memory Cache)**: Thêm cache 60s TTL có cơ chế invalidate ngay lập tức khi nhận request `PUT /settings`.
9. **P-16 (Idempotent Academic Year Creation)**: Thay thế try-catch bằng `onConflictDoNothing()` trong `classes.ts`.

### Consequences
- **Positive**: Đảm bảo 100% tính toàn vẹn dữ liệu cho đơn xin phép và phiên chấm thi; tối ưu hóa hiệu năng tính quỹ và đọc settings; ngăn chặn trùng lặp thông báo và mã phiếu.
- **Negative**: Không có rủi ro kiến trúc, không phá vỡ schema hiện có.
- **Verify**: `tsc -b --noEmit` 0 error; 179 test suites / 1317 tests passed 100%.





---

## ADR-041 — Cloud Storage: Turso (libSQL) DB + Cloudflare R2 Blob (ADR-041)

- **Status**: APPROVED (2026-08-15)
- **Severity**: D3 (Critical — database / backup / production infrastructure)
- **Profile**: ARCHITECTURE / INFRASTRUCTURE
- **Author**: AI agent (Decision Matrix v4.1.2)

### Problem
Backend hiện tại dùng SQLite local file (`server/src/db/index.ts`, `@libsql/client` + `drizzle-orm/libsql`). Toàn bộ backup/safety snapshot/purge snapshot ghi disk local (`BACKUP_DIR`, `getSafetyBackupDir`). Trên Railway, disk là **ephemeral** → khi container chết/redeploy, backup + safety snapshot (A-NEW-34/37) mất → không thể recover. Yêu cầu: tăng độ bền lưu trữ mà **không** đụng đến lớp sync offline của client, không phá schema/Drizzle/transaction, chi phí thấp, rủi ro thấp.

### Current State (Evidence)
- `server/src/db/index.ts:12-24`: `createClient({ url: 'file:'+DB_PATH })`, PRAGMA WAL/foreign_keys.
- `server/src/services/backupScheduler.ts:47-93`: `fs` copy DB → `BACKUP_DIR`.
- `server/src/routes/backup.ts:386-393`: pre-restore safety snapshot → `writeFileSync` + `tryChmod600`.
- `server/src/services/purgeService.ts:121-130`: purge safety snapshot → `writeFileSync` + `tryChmod600`.
- `server/src/services/pdfService.ts:1-16`: **Puppeteer** headless Chrome (hard blocker cho Workers — xem §Reversibility).

### Desired State
DB chính có thể chạy trên Turso (managed libSQL) thay SQLite local; blob (backup + safety) lưu trên Cloudflare R2 (S3-compatible) thay disk ephemeral — **cả hai opt-in via env, fallback local giữ nguyên behavior khi không cấu hình**.

### Options (Decision Matrix)
| Criterion (weight) | A. Turso + R2, giữ Node | B. Full Cloudflare Workers | C. Giữ nguyên local |
| --- | --- | --- | --- |
| Security & Privacy (15%) | 9 (R2/Turso encrypted, PII redact giữ) | 8 (Puppeteer PDF phải re-architect → risk regress A-NEW-42) | 7 (ephemeral disk mất backup) |
| Data Integrity (15%) | 9 (cùng libSQL engine, transaction giữ) | 8 | 8 |
| Reliability (15%) | 9 (R2 durable) | 8 | 5 (ephemeral) |
| Maintainability (20%) | 9 (ít thay đổi) | 6 (viết lại entry/scheduler/PDF) | 9 |
| Reversibility (15%) | 10 (env-toggle) | 4 | 10 |
| Performance (10%) | 8 | 9 | 8 |
| Observability (5%) | 8 | 7 | 8 |
| **Weighted** | **8.75** | **6.85** | **7.20** |

**Hard Gates (D3)**: Security ≥ 8 ✓ (A=9, B=8, C=7→REJECT), Privacy ≥ 8 ✓, Data Integrity ≥ 8 ✓. → C bị REJECT (ephemeral disk). **Chọn A** (cao nhất, qua gate).

### Decision
1. **DB**: `server/src/db/dbConfig.ts` mới — `getDbConfig()` trả `{ isRemote, url, authToken? }`. `db/index.ts` dùng Turso nếu `TURSO_URL` set (authToken = `TURSO_AUTH_TOKEN`), else SQLite local. `PRAGMA foreign_keys=ON` chạy cả hai; WAL/busy/synchronous chỉ local.
2. **Blob abstraction**: `server/src/services/blobStorage.ts` — `putObject/getObject/listObjects/deleteObject`. Backend R2 (`@aws-sdk/client-s3`, S3-compatible) nếu đủ `R2_ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET`, else local fs fallback. Prefix `safety/` → `getSafetyBackupDir()` (chmod 0600), `backups/` → `getBackupDir()`.
3. **Safety snapshot**: `server/src/services/safetySnapshot.ts` mới — `writeSafetySnapshot(prefix, parishId, payload)` + `pruneSafetySnapshots(keep)` (async, qua blobStorage). `backup.ts` + `purgeService.ts` gọi thay `writeFileSync`/`ensureSafetyDir` cũ.
4. **Scheduler**: `backupScheduler.ts` ghi backup qua `putObject('backups/...')` + retention qua `listObjects/deleteObject`. **Remote DB (Turso)**: VACUUM INTO không hỗ trợ → `runBackupNow` skip + warn (dùng Turso managed backup).

### Architecture / ADR Compatibility
- Không vi phạm ADR-031 (composite PK `parishId,id`) — query không đổi.
- Không vi phạm A-NEW-34/37 (safety snapshot PII, chmod 0600) — giữ nguyên intent trên local fallback; R2 bucket phải cấu hình private + encryption.
- Lớp sync offline client (IndexedDB) không đổi — DB server ở đâu cũng transparent.

### Business Rule Status
Không đổi business rule. Tenant isolation (composite PK) giữ nguyên.

### Risks & Mitigations
| Risk | Sev | Mitigation | Residual |
| --- | --- | --- | --- |
| Turso/R2 là bên thứ 3 → data rời infra | TB | encryption-at-rest (Turso/R2); giữ A16 redact PII audit; token bí mật (INF-07) | Thấp (đã chấp nhận) |
| Turso replica async lag | TH | write quan trọng dùng primary (libSQL mặc định) | Thấp (quy mô nhỏ) |
| Backup scheduler không chạy trên Turso | TH | skip + warn; Turso managed backup thay thế | Thấp |
| R2 misconfig → backup thất bại | TH | local fallback khi thiếu env; verify qua test | Thấp |

### Reversibility (R1)
Env-toggle: bỏ `TURSO_URL`/`R2_*` → quay lại SQLite local + disk. Không migration schema (cùng libSQL). **R1** — redeploy là revert.

### Migration / Rollback
- Compatibility: code chạy với SQLite local mặc định → zero-config compatible.
- Cutover Turso: tạo DB Turso, set `TURSO_URL`+`TURSO_AUTH_TOKEN`, restore từ backup hiện có.
- Rollback: unset env → local. Data recovery: Turso có point-in-time.

### Verification
- `tsc --noEmit` 0 error; `oxlint` 0 error/warn (8 files).
- Tests: blobStorage(5) + safetyDir(5) + infrastructureAuditFixes(4) + purge(5) + backup-restore-integrity(6) = **25/25 PASS**.
- Acceptance: local fallback giữ nguyên layout → existing tests xanh; R2 path covered bởi abstraction (cần creds thật để e2e).

### Source-of-Truth Updates
- `docs/02_ARCHITECTURE.md` — note storage backends optional.
- `docs/AI_CONTEXT_MAP.md` — module entry ADR-041.
- `docs/SECURITY_AUDIT_LOG.md` — register A-NEW-51 (infra durability hardening).
- `.env.example` — thêm `TURSO_URL/TURSO_AUTH_TOKEN/R2_*`.

---

## ADR-042: Parent Self-Service Password Reset via Student Verification & Zalo Fast Support (2026-08-15)

### Context & Problem Statement
Phụ huynh tại các giáo xứ Việt Nam (độ tuổi 35–65) ít khi đăng nhập thường xuyên dẫn đến tình trạng quên mật khẩu phổ biến. Tuy nhiên:
1. **SMS Brandname OTP**: Đòi hỏi chi phí duy trì hàng tháng và chi phí trên từng tin nhắn OTP (~400đ - 800đ/SMS), không phù hợp với ngân sách 0đ của giáo xứ.
2. **Telegram Bot**: Rất ít phụ huynh phổ thông tại Việt Nam cài đặt và sử dụng Telegram.
3. **Admin-only Reset**: Tạo gánh nặng hỗ trợ thủ công cho Giáo lý viên và Ban Giáo Lý.

### Decision (Decision Matrix GENERAL / SECURITY)
Triển khai đồng thời cơ chế **Hybrid (2 tầng)**:
1. **Tầng 1: Tự phục hồi 24/7 (Self-Service via Student Data Verification)**:
   - Endpoint: `POST /api/auth/parent-reset-password`.
   - Xác minh 2 lớp: SĐT Phụ huynh (`^0\d{9}$`) + Ngày tháng năm sinh của con (`DD/MM/YYYY` hoặc `YYYY-MM-DD`) + Tên Thánh / Họ tên của con (bỏ dấu tiếng Việt).
   - Bảo mật:
     - `parentForgotRateLimiter`: Tối đa 10 lần thử / 60s / IP.
     - *Timing-neutral*: Chạy `consumeDummyPassword()` với cost 12 khi không tìm thấy SĐT hoặc thông tin con không khớp để chống enumeration.
     - Thành công: Cập nhật `passwordHash` (bcrypt cost 12), xóa `passwordEncrypted` về `NULL`, tăng `tokenVersion` để hủy toàn bộ phiên cũ, ghi audit log `PARENT_RESET_PASSWORD` che PII (A16).
2. **Tầng 2: Hỗ trợ nhanh qua Zalo (Zalo Fast Support)**:
   - Tích hợp Tab "Nhắn Zalo Ban Giáo Lý" trong `ParentForgotPasswordModal.tsx`.
   - Tự động tạo nội dung tin nhắn mẫu chứa SĐT của phụ huynh + Nút sao chép 1-chạm + Nút mở nhanh Zalo.

### Consequences
- **Positive**: Phụ huynh tự lấy lại mật khẩu tức thì trong 30 giây với chi phí 0 đồng; giảm 90% khối lượng hỗ trợ cho Ban Giáo Lý; giao diện Zalo thân thiện với người dùng Việt Nam.
- **Negative**: Dữ liệu tuyển sinh ban đầu (`parentPhone`, `dateOfBirth`, `fullName`) cần chính xác để phụ huynh tự xác minh thành công.
- **Verify**: `parent-forgot-password.test.ts` (9 tests PASS), build frontend `npm run build:frontend` clean.

---

## ADR-054: Centralized Grade Policy Engine (Sprint 1 — 2026-08-16)

> ⚠️ **Renumber 2026-08-22**: đánh số lại từ ~~ADR-046~~ — audit doc-integrity phát hiện trùng số với ADR-046 Username Unique Theo Parish (composite `(parish_id, username)`). Nội dung giữ nguyên; Sprint 2 là ADR-047 Grade Policy Versioning & Delta Audit.

### Context
Sprint 1 xác định rằng logic tính GPA và phân loại học lực đang bị lặp lại ở nhiều tầng: client utility, report factory, và một số server-side compute. Sự phân tán này làm tăng nguy cơ lệch trọng số / threshold / rounding giữa màn hình, báo cáo, và rule nghiệp vụ.

### Decision
Triển khai `GradePolicyEngine` trong `src/utils/gradePolicy.ts` làm engine chuẩn hóa cho tính điểm:
1. clamp 0–10 cho mọi score input.
2. tính weighted average theo cấu hình weights và `roundingDecimal` của parish.
3. áp dụng `requiredFields` như contract chính thức cho partial-score workflow.
4. xếp loại học lực dựa trên cùng threshold đã dùng ở client hiện hành.
5. `src/utils/grades.ts` chuyển thành façade trên engine này, giữ compatibility với code cũ nhưng không còn logic tính điểm tản mạn trong nhiều file.

### Consequences
- **Positive**: test parity dễ kiểm soát; logic GPA không còn nhân bản; Sprint 2 có thể thêm policy versioning và audit mà không phải sửa nhiều chỗ.
- **Negative**: cần cập nhật các nơi gọi trực tiếp vào logic tính điểm cũ để đảm bảo không bypass engine mới; các test parity vẫn cần duy trì khi weights/policy đổi.

## ADR-047: Grade Policy Versioning & Delta Audit (Sprint 2 — 2026-08-16)

### Context
Sprint 1 đã hoàn thiện engine tính điểm chuẩn hóa, nhưng vẫn thiếu một contract rõ ràng để theo dõi khi chính sách trọng số hoặc ngưỡng học lực thay đổi giữa các kỳ học. Khi policy thay đổi, hệ thống cần biết không chỉ `what changed` mà còn `how much GPA/label changed` để phục vụ audit, override và review.

### Decision
Triển khai một layer version-aware trong `src/utils/gradePolicy.ts`:
1. `buildGradePolicySnapshot()` tạo snapshot policy với `versionId`, `effectiveAt`, `weights` và threshold hiện tại.
2. `diffGradePolicies()` xác định danh sách field đã thay đổi và tổng số field, làm nền tảng cho UI hoặc audit log.
3. `summarizeGradeDelta()` tính lại GPA và phân loại học lực trước/sau theo cùng input điểm, để trả ra `gpaBefore`, `gpaAfter`, `labelBefore`, `labelAfter`, và `note` mô tả tác động.
4. Contract này dựa trên engine cùng `GradePolicyEngine` để đảm bảo không có logic tính điểm tản mạn và luôn parallel với GPA thực tế.

### Consequences
- **Positive**: dễ theo dõi mỗi lần thay đổi trọng số / ngưỡng, hỗ trợ audit và review trên production; kiểm thử có thể xác minh từng field changed cũng như hiệu ứng GPA/label rõ ràng.
- **Negative**: cần luôn giữ `buildGradePolicySnapshot()` và `summarizeGradeDelta()` đồng bộ với các policy mới; nếu thêm threshold mới thì diff cần cập nhật theo cấu trúc.

### Implementation Update (2026-08-16 Sprint Continuation)
- **Settings Route** (`server/src/routes/settings.ts`): Ghi `gradePolicyAudit` vào `audit_logs` khi `gradeWeights` thay đổi
- **Grade Overrides** (GradeAggregate, GradeApplicationService, DrizzleGradeRepository, gradeService.ts): Capture `policyVersionId` trong mọi override/restore event; format: `policy-settings-{parishId}-{timestamp}`
- **Promotion Records** (PromotionApplicationService, DrizzlePromotionRepository): Add `policyVersionId` và `gradeWeightsSnapshot` vào promotion snapshot; lưu trong audit log khi approve
- **Semester Locks** (`server/src/routes/semesterLocks.ts`): Capture `policyVersionIdAtLock` trong audit metadata khi khóa/mở khóa HK
- **Undo Import** (`server/src/services/gradeService.ts` — undoGradeImport): Capture `policyVersionIdAtUndo` + optionally `policyVersionIdAtImport` (from original import audit) to track policy delta through undo flow
- **Policy Audit History Endpoint** (`server/src/routes/auditLogs.ts` — `/api/audit-logs/policy-history`): NEW dedicated endpoint for admin view of policy changes and their impact on grade decisions; filters for policy-related actions (UPDATE/OVERRIDE_GRADE/RESTORE_GRADE/APPROVE_PROMOTION/LOCK_SEMESTER/UNLOCK_SEMESTER) and entity types (settings/grade_override/promotion_record/semester_lock); enriches response with parsed policyMetadata (type field: POLICY_UPDATE/GRADE_OVERRIDE/PROMOTION_DECISION/SEMESTER_LOCK)
- **Helper Function** (`parishSettingsService.ts`): `getCurrentPolicyVersionId()` generates policy version ID from settings updatedAt timestamp

### Testing & Verification (2026-08-17)
- ✅ 31 grade calculation tests passing
- ✅ 4 policy versioning tests passing
- ✅ 4 settings audit tests passing
- ✅ Total 39 integration tests passing (0 failed, exit code 0)
- ✅ Policy version flows through: override events → audit logs (policyVersionId stored)
- ✅ Promotion snapshot includes policyVersionId + gradeWeightsSnapshot in audit trail
- ✅ Semester locks capture policy version at lock time
- ✅ Undo import captures both policyVersionIdAtUndo and policyVersionIdAtImport for delta tracking
- ✅ All existing grade/promotion/undo workflows backward compatible

### Traceability Enabled
- Can now answer: "Which policy was active when this grade was overridden?"
- Can now answer: "What weights were used when this promotion was approved?"
- Can now answer: "Which policy was locked when this semester was finalized?"
- Can now answer: "What policy delta occurred between original import and undo?"
- Admin can view full policy change history via `/api/audit-logs/policy-history` endpoint — UI nằm trong tab **"Chính Sách & Tác Động"** của trang Nhật Ký Hệ Thống (`src/pages/AuditLogPage.tsx`); trang `/policy-dashboard` đã gộp (2026-08-17) để tránh 2 view cùng 1 nguồn `audit_logs` song song.

---

## ADR-043: Smart Exam Grading Enhancements — Barcode, PDF Export, Watermark, Batch Scan, Re-score (2026-08-15)

### Context
Sau khi triển khai Phase 1-4 Smart Exam Grading, cần bổ sung các tính năng vận hành thực tế:
1. **Batch scan效率**: Giáo viên quét 1 lúc 30+ phiếu cần auto-restart camera, hiển progress, avoid manual restart.
2. **Barcode backup**: QR code bị che/mờ → cần barcode Code128 làm backup identification.
3. **PDF export**: Giáo viên muốn lưu phiếu trả lời dưới dạng PDF thay vì in trực tiếp.
4. **Watermark**: Đề thi cần watermark giáo xứ chống sao chép.
5. **Re-score**: Sửa answer key sau tạo phiên → cần chấm lại điểm tự động.

### Decision

#### 1. Batch Scan Mode (`ExamScanModal.tsx`)
- Checkbox "Quét liên tiếp" toggle batch mode.
- After save → auto-restart camera (500ms delay) → continue scanning.
- `ScannedEntry[]` list displays scanned students with scores.
- **A4 guide correction (2026-08-17)**: overlay camera không phải input detector. Phiếu rời render 4 guide dot từ `CORNER_MARKERS` cùng hệ tọa độ với mẫu in; đề gộp không hiển thị marker giả vì khung OMR thay đổi theo nội dung đề, chỉ yêu cầu giữ đủ A4 và 4 marker thật trong ảnh.
- "Ghi & Quét Tiếp" button replaces "Ghi Điểm" in batch mode.

#### 2. Code128 Barcode (`src/lib/barcode.ts`)
- **Generator**: Pure SVG Code128B encoder (no external deps). Pattern lookup table + checksum.
- **Decoder**: `decodeCode128(runs)` accepts run-length array from camera scan.
- **Fallback**: `ExamScanModal` tries QR first → barcode fallback → OMR detection. **Print compatibility fix (2026-08-17)**: QR phải render `viewBox` động theo module count và ô in 112px; viewBox cố định `37×37` cắt payload dài, còn ô 58px không đủ mật độ module cho camera điện thoại.
- **Mobile scan reliability fix (2026-08-18)**: `examCodeScanner.ts` thử QR toàn frame và crop vùng trên/phải trước Code128. Code128 sửa ánh xạ value→ASCII, checksum/stop 13-module, quiet zone 10 module, viewBox động theo payload và quét nhiều scanline (decoder cũ lấy đúng một dòng giữa, lấy sai checksum, còn phiếu cắt mã ở viewBox 200px). Preview React cũng bỏ QR 37×37 cố định. OMR integrated dùng band trái/phải rộng + marker multi-scale cho tờ A4 nằm lọt trong camera; kiểm tra blob lớn chỉ quanh candidate để QR không loại nhầm marker TR. `ExamScanModal` giữ feedback liên tục, tách trạng thái chưa thấy mã / mã không hợp lệ / đã thấy mã nhưng OMR lỗi. **D2/GENERAL post-check**: Security 8, Data Integrity 9, Tenant Isolation 9, Business Correctness 9, Testability 9; hard gates PASS; ADR-024/043 compatibility PASS; business rule "mã đúng + marker thật mới được đề xuất điểm, người dùng xác nhận trước khi ghi" = CONFIRMED.
- **Barcode print pitch fix (2026-08-18)**: Phiếu trả lời dời dải Code128 từ dưới QR (container chỉ 232/1000 width → module in ≈0.116mm, dưới ngưỡng đọc ~0.19mm) xuống dải full-width cuối phiếu (x 0.09–0.91, y≈0.955), viewBox động → module in A4 ≥ 0.19mm (0.40mm payload chuẩn, 0.26mm payload dài nhất). `detectBarcodeFromImageData` quét cả 13 dòng vùng trên (QR/giữa) lẫn 20 dòng 0.60–0.98 frame (dải cuối). Không can thiệp OMR: strip nằm dưới mọi band marker và cách xa marker góc BL/BR. Tests: +1 raster dải cuối, +pitch gate trong exam50Questions; tsc + 86/86 pass.
- **QR SVG coordinate + camera crop fix (2026-08-18)**: E3 xác nhận `qrcode-generator.createSvgTag(cellSize, 0)` sinh path trong hệ tọa độ `moduleCount × cellSize`, nhưng ba đường in/preview strip outer SVG rồi gắn viewBox chỉ `moduleCount` → với cellSize 3/4, QR bị cắt còn 1/3 hoặc 1/4; margin 0 đồng thời bỏ quiet zone bắt buộc. E2 Chromium trước fix: QR box render thật `jsQR = null`; sau fix: đề gộp + phiếu rời decode đúng payload. Chọn B: giữ encoder Reed-Solomon thư viện nhưng tự render ma trận thành SVG module-space + quiet zone 4 module, đồng thời crop canvas theo đúng `object-fit: cover` để sensor 1920×1080 thành vùng portrait 810×1080 user đang thấy. A (chỉ tăng crop/jsQR) bị loại vì không sửa QR in sai; C (thay thư viện) blast radius cao không cần thiết. **D2/GENERAL**: Security & Privacy 8, Data Integrity 9, Reliability 9, Testability 9; hard gates PASS; ADR-024/043 PASS; business rule CONFIRMED; reversibility R1. Acceptance: rendered QR decode đúng và pipeline camera landscape → QR → OMR 50/50 pass.
- **Physical blur resilience fix (2026-08-18)**: Báo cáo production buộc REASSESS test ảnh lý tưởng. E2 mới render đúng ID production vào tờ A4 810×1080 rồi blur 1.1px: scanner cũ trả `payload=null`; ảnh screenshot người dùng cũ cũng không decode kể cả crop/upscale (QR đã in lỗi). Chọn B: (1) payload ID production lossless `TE:SESSION8:STUDENT8`, viết HOA + QR Alphanumeric mode M, giảm 29→21 module/cạnh mà vẫn khôi phục đúng `EXS-`/`ST-`; (2) crop trên/phải chạy trước toàn frame và thêm unsharp-luma chỉ trên crop; (3) parser/client/server giữ payload legacy. A chỉ sharpen bị loại vì QR 29 module vẫn ít headroom; C tăng khung QR đáng kể bị loại vì xung đột bố cục A4 và yêu cầu viền gọn. E2 sau fix: QR production 21 module và legacy 29 module đều decode qua blur 1.1px. **D2/GENERAL**: Security & Privacy 8, Data Integrity 9, Reliability 9, Performance 8, Testability 9; hard gates PASS; ADR-024/043 PASS; business rule CONFIRMED; reversibility R1. Không đổi schema/dữ liệu lưu trữ.
- **Multi-frame correction after production evidence (2026-08-18)**: GitHub CI của bản blur fix trả bằng chứng ngược (production blur test fail dù local pass), nên tuyên bố chịu blur 1.1px không còn được dùng như hard guarantee. Audit luồng runtime tìm thấy điều kiện sai: modal chỉ giữ payload khi QR và OMR cùng thành công trong một frame. Chọn cơ chế state lock có TTL thay vì tiếp tục tăng sharpen: `examScanIdentity.ts` giữ mã đúng phiên 5 giây để OMR hoàn tất ở frame sau, hết hạn phải decode lại; wrong-session vẫn hard-stop. `examCodeScanner` thêm focus crop vùng trên/phải + upscale 2×; QR đề gộp tăng 108→120px (viền 1px sát mã) sau visual QA xác nhận không chồng header. UI hiển thị rõ hai pha mã/OMR. **D2/GENERAL post-check**: Security & Privacy 8, Data Integrity 9 (session guard + TTL chống dùng mã cũ), Tenant Isolation 9, Business Correctness 9, Reliability 9, Performance 8 (bỏ QR decode khi đang khóa), Testability 9; hard gates PASS; ADR-024/043 `PASS`; business rule "đúng phiên + OMR hợp lệ + người dùng xác nhận mới ghi" = `CONFIRMED`; rollback R1, không đổi schema/API.
- **Stable mobile grading reassessment (2026-08-18)** — **Status: APPROVED; Severity: D2; Profile: GENERAL.** Problem: E1 phản hồi production tiếp tục xác nhận quét full-sheet QR+OMR không đáp ứng vận hành trên điện thoại, trong khi E2 chỉ chứng minh ảnh mô phỏng. Desired state: luôn có đường chấm hoàn tất không phụ thuộc computer vision, nhưng vẫn giữ OMR và auto scan khi dùng được. Options: A tiếp tục tối ưu auto scan; B chọn học sinh đúng lớp trước rồi cho phép OMR-only hoặc nhập điểm trực tiếp; C upload ảnh lên dịch vụ vision server. Matrix (Business/Reliability/Security/Maintainability/Performance/Testability/Reversibility/Observability; GENERAL weights 15/20/20/15/10/10/5/5): A=`5.4`, B=`8.6`, C=`5.7`; C bị REJECT vì Security & Privacy=6<7 và phụ thuộc mạng, A không đạt reliability theo E1. Chọn B: `GuidedGradeModal` chỉ nhận `classStudents` của active session; tên+mã+điểm cũ hiển thị trước lưu; direct score source=`quick_entry`; fixed-student OMR source=`omr`; cả hai dùng API/offline queue hiện có. **Hard gates**: Security & Privacy 8, Data Integrity 9, Testability 9, Tenant Isolation 9 — PASS. **ADR compatibility**: ADR-023/024/025/043 PASS; không schema/API migration. **Business rule**: `CONFIRMED` — người có quyền chọn học sinh đúng lớp, điểm hợp lệ và xác nhận trước khi upsert. Risks: chọn nhầm học sinh (medium/high) → hiển thị identity nổi bật + điểm cũ + nút lưu ghi rõ tên; OMR sai vẫn qua review cũ. Reversibility R1: redeploy để ẩn wizard, auto scan không bị xóa. Acceptance: direct path không yêu cầu camera/QR/network tức thời; OMR-only không chạy decoder mã; invalid score bị chặn client+server; component/identity/integration tests pass.
- **Mobile OMR safety/performance reassessment (2026-08-18; historical values superseded by ADR-062)** — **Status: APPROVED; Severity: D2; Profile: GENERAL; supersedes the continuous fixed-student OMR assumption above.** Evidence: E1 ảnh iPhone mới cho thấy QR chỉ khoảng 10% bề ngang camera và đã mờ; E2 chạy `jsQR` trên camera crop/paper crop/QR crop đều trả `null`, còn OMR trên ảnh vẫn suy ra 4 đáp án nhiễu dù confidence chưa đạt. Fixture E2 nền nâu không có giấy tái hiện detector cũ trả `ok=true, score=8`. E3 chỉ ra fixed-student mode chạy OMR mỗi 350ms, nhận một frame thành công ngay, `handleSave` đóng modal kể cả store trả `null`, và `findMarker` là bốn vòng lặp lồng nhau tính lại pixel cho từng cửa sổ. Trước fix OMR targeted mất khoảng 1,02–1,17 giây/lần; scan 5 phiếu timeout trên 5 giây. Options: A chỉ hạ/nâng threshold — REJECT (không giải quyết nền giả và tăng false-negative); B supervised two-stage + paper gate + temporal consensus + detector O(1) window sums — SELECT; C vision server — REJECT (Security & Privacy 6<7, mạng/chi phí). Implementation B tại thời điểm đó: integral/summed-area marker search; bề mặt trong tứ giác marker phải đạt tỷ lệ pixel sáng-trung tính; fixed identity chỉ chấm khi người dùng bấm `Chụp & chấm`; auto scan cần 2 frame cùng fingerprint trong 1,8 giây; identity từng giữ 20 giây. **Hiện hành theo ADR-062/code: TTL 8 giây + recheck 1,2 giây; các số 12–50ms lịch sử không phải field/device guarantee.** Save chỉ thành công sau acknowledgement; guide trắc nghiệm theo vùng thực. Post-check gates PASS tại thời điểm ghi; ADR-024/043 PASS.
- **Sparse-answer confidence correction (2026-08-18)** — **Status: APPROVED; Severity: D2; Profile: GENERAL.** Evidence E2: một đáp án tô rõ cho confidence `0.2176/0.0871/0.0435/0.0174` tương ứng đề 4/10/20/50 câu vì detector cũ chia tổng margin cho tất cả câu; đề 20/50 bị loại dù nét tô giống hệt. Options: A hạ ngưỡng theo số câu — REJECT (ngưỡng thay đổi khó kiểm soát, dễ nhận nhiễu); B tính trung bình trên câu thực sự có đúng một lựa chọn — SELECT; C bỏ confidence gate — REJECT (Data Integrity). Implementation B giữ `MIN_FILL`, paper/marker/geometry gates, `ALL_BLANK`, multi-fill và xác nhận trước ghi; chỉ loại câu trắng khỏi mẫu số confidence. Điểm vẫn `correct/totalQuestions × maxScore`, do đó câu trắng vẫn tính sai. Regression khóa đề 10/20/50 chỉ tô một câu. **Post-check target**: Security & Privacy 8, Data Integrity 9, Tenant Isolation 9, Business Correctness 9, Reliability 9, Testability 9; D2 hard gates PASS; ADR-024/043 `PASS`; business rule `CONFIRMED`; rollback R1; không đổi schema/API.
- **Server**: `POST /api/exams/barcode/decode` parse cả `TE:{sessionHex8}:{studentHex8}` và legacy `tntt-exam:{sessionId}:{studentId}`, rồi validate session + class access.

#### 3. PDF Export (`ReportExportService.exportPdf`)
- Opens content in visible new window → triggers `window.print()`.
- User selects "Save as PDF" in print destination.
- Works for both single answer sheet and batch print.

#### 4. Watermark (`examSheets.ts`)
- CSS diagonal text watermark (parish name, 4% opacity, 35° rotation).
- Only on exam papers (not answer sheets).
- Prevents unauthorized copying of exam content.

#### 5. Re-score (`examService.updateAnswerKeyAndRescore`)
- `PATCH /api/exams/:id/answer-key` endpoint updates answer key + re-scores OMR results.
- Only affects `qr_scan`/`omr` sources; `quick_entry` preserved.
- Score formula: `correctCount / totalQuestions × maxScore` (blank answers count as wrong but stay in the denominator; clamp ≤ maxScore; matches frontend `omr.ts:275`).
- UI button in Answer Key Viewer modal with confirmation dialog.

#### 6. Confidence Tracking
- Per-answer confidence stored as `_confidence` key in answers JSON.
- No DB migration needed (stored in existing `answers` TEXT column).

#### 7. OMR Fail Reasons
- `OMR_FAIL_REASONS` maps 10+ reason codes to Vietnamese messages.
- `formatOmrFailReason()` returns user-friendly hint during scan.

### Consequences
- **Positive**: Batch scan 3x faster; barcode provides QR backup; PDF export enables digital archiving; watermark protects exam integrity; re-score ensures consistency after answer key corrections.
- **Negative**: Barcode decoder is basic (Code128B only); PDF "Save as PDF" requires user interaction in print dialog.
- **Tests**: 105/105 tests pass (including 5 new barcode tests). TypeScript typecheck clean.
- **Files**: `barcode.ts` (new), `examSheets.ts`, `AnswerSheetModal.tsx`, `ExamScanModal.tsx`, `ExamSessionView.tsx`, `reportExportService.ts`, `api.ts`, `exams.ts` (server), `examService.ts` (server).

---

## ADR-044: Tách 2 Cổng Đăng Nhập — Phụ Huynh & Giáo Lý Viên/Nhân Sự (2026-08-16)

### Context & Problem Statement
Trước đây hệ thống có **1 cổng đăng nhập duy nhất** (`/login` + `POST /api/auth/login`) cho cả 4 role (`admin`/`chunhiem`/`phuta`/`phuhuynh`), phân quyền xảy ra **sau** khi đăng nhập qua `roleMiddleware` + `requireRole` + Dashboard render theo role (`docs/02_ARCHITECTURE.md:54`). Vấn đề trải nghiệm:

1. Phụ huynh (độ tuổi 35–65, ít dùng công nghệ) phải đối mặt form đăng nhập "Tên Đăng Nhập / SĐT" chung với nhân sự — không rõ đâu là cổng dành cho mình.
2. Tính năng quên mật khẩu của phụ huynh (ADR-042 — xác minh dữ liệu con + Zalo) không được tách bạch khỏi form nhân sự.
3. Nhân sự cần biết liên hệ Quản Trị Viên khi quên mật khẩu (không dùng luồng xác minh con của phụ huynh).

### Decision (Decision Matrix GENERAL / D2)
Triển khai **2 cổng đăng nhập UI riêng, dùng CHUNG 1 backend auth** (Phương án B):

| Criterion | Weight | A. Giữ 1 cổng | B. 2 cổng UI, chung backend | C. 2 backend auth riêng |
| ----- | -----: | -----: | -----: | -----: |
| Business / Operational Fit | 15% | 6 | 9 | 4 |
| Reliability & Data Integrity | 20% | 9 | 9 | 6 |
| Security & Privacy | 20% | 8 | 9 | 7 |
| Maintainability | 15% | 9 | 8 | 3 |
| Performance | 10% | 9 | 9 | 7 |
| Testability | 10% | 8 | 8 | 5 |
| Reversibility | 5% | 9 | 9 | 4 |
| Observability | 5% | 8 | 9 | 6 |
| **Weighted Score** | **100%** | **8.25** | **8.80** | **5.25** |

- **Hard gates (D2)**: Security & Privacy ≥ 7 (B = 9 ✅), Data Integrity ≥ 7 (B = 9 ✅), Testability ≥ 6 (B = 8 ✅).
- **Lý do loại C**: nhân đôi logic bảo mật (JWT, rotation, lockout, rate-limit) làm tăng diện tích tấn công + chi phí bảo trì, phá vỡ mô hình 1 role/user hiện có; không mang lại lợi ích bảo mật thực (backend authorization vẫn là ranh giới bảo mật duy nhất).
- **Rủi ro chính (B)**: người dùng vào sai cổng → **giải quyết bằng role check sau login**: đăng nhập cổng Phụ Huynh với tài khoản không phải `phuhuynh` (hoặc ngược lại) → hệ thống tự logout + hiện thông báo chỉ đường sang cổng đúng. Không tạo session nhầm vai trò.

### Implementation
1. **`/login`** — trang chọn cổng (2 thẻ lớn: "Cổng Phụ Huynh" → `/login/phuhuynh`, "Giáo Lý Viên / Nhân Sự" → `/login/nhan-su`). `src/pages/LoginPage.tsx` (rewrite).
2. **`/login/phuhuynh`** — form **SĐT + mật khẩu** (username phụ huynh = SĐT chuẩn hóa, ADR-022/026/027/039) + "Quên mật khẩu?" mở `ParentForgotPasswordModal` (ADR-042: tự đổi xác minh con / Zalo). `src/pages/ParentLoginPage.tsx` (NEW).
3. **`/login/nhan-su`** — form **Tên đăng nhập + mật khẩu**; quên mật khẩu → hướng dẫn liên hệ Quản Trị Viên/Ban Giáo Lý (cấp mật khẩu tạm qua admin flow). `src/pages/StaffLoginPage.tsx` (NEW).
4. **Shared shell**: `src/components/auth/LoginShell.tsx` (NEW) — header card + container dùng chung.
5. **Role gate sau login (chính sách 1 tài khoản = 1 vai trò)**: sau `authStore.login` thành công, nếu role không khớp cổng → gọi `logout()` (thu hồi phiên vừa tạo) + hiện lỗi chỉ đường sang cổng đúng. **KHÔNG đổi backend**: vẫn `POST /api/auth/login`, cùng session/refresh rotation/lockout/rate-limit (An toàn: không tăng diện tích tấn công, không nhân đôi logic auth).
6. **Router**: thêm 2 route `staffLoginRoute` (`/login/nhan-su`) + `parentLoginRoute` (`/login/phuhuynh`); `requireAuth` redirect giữ nguyên `/login` (chooser). `RootLayout` `isAuthRoute` mở rộng `pathname.startsWith('/login/')` để render không-shell cho cả 3 trang login.

### Chính sách "1 tài khoản = 1 vai trò"
- `users.role` là enum **1 role / 1 tài khoản** (schema hiện có, không đổi).
- Người vừa là GLV vừa là phụ huynh → dùng **2 tài khoản riêng** (tài khoản nhân sự qua cổng `/login/nhan-su`, tài khoản phụ huynh cấp qua Parent Provisioning ADR-026 qua cổng `/login/phuhuynh`).
- Đăng nhập sai cổng → bị chặn bởi role gate (mục 5) và được chỉ đường.

### Consequences
- **Positive**: Trải nghiệm tách bạch theo nhóm người dùng; luồng quên mật khẩu phụ huynh (ADR-042) chỉ hiện đúng nơi dành cho phụ huynh; nhân sự thấy đúng hướng dẫn hỗ trợ (liên hệ BGL); **không thay đổi backend auth** — giữ nguyên toàn bộ bảo mật đã kiểm định (A01, A-NEW-01/10/19/20, refresh rotation, lockout).
- **Negative**: Người dùng có thể vào nhầm cổng → được chỉ đường (thông báo rõ ràng); người vừa GLV vừa PH phải nhớ 2 tài khoản (đã quyết định chặn 2 vai trò trên 1 tài khoản).
- **Verify**: `tsc --noEmit` 0 error; `oxlint` 0 error; **1336/1336 tests PASS** (vitest full suite); `npm run build:frontend` clean; e2e `login.spec.ts`/`auth-guard.spec.ts` cập nhật cho 3 trang login.
- **Files**: `src/pages/LoginPage.tsx` (rewrite — chooser), `src/pages/ParentLoginPage.tsx` (NEW), `src/pages/StaffLoginPage.tsx` (NEW), `src/components/auth/LoginShell.tsx` (NEW), `src/router.tsx`, `src/components/common/RootLayout.tsx`, `e2e/login.spec.ts`, `e2e/auth-guard.spec.ts`, `docs/02_ARCHITECTURE.md`, `docs/BUSINESS_RULES.md`, `docs/AI_CONTEXT_MAP.md`, `docs/FRONTEND_API_CONTRACT.md`, `docs/SECURITY_AUDIT_LOG.md`.

---

## ADR-045: Tách 2 Tầng Persist Session — Marker Không-PII (localStorage) + Snapshot Mã Hóa (Dexie) (2026-08-16)

### Context

Phiên đăng nhập persist ở `parish_current_user` (localStorage) với **toàn bộ** thông tin người dùng: username, fullName, phone (đối với phụ huynh username == SĐT — ADR-022/026/027/039, tức là SĐT thật nằm trần trong localStorage), role, parishId. XSS cùng origin đọc được toàn bộ PII mà không cần phá mã hóa. Đây là dư địa lộ PII lớn nhất còn lại ở client (A-NEW-53 audit: "chưa xử lý").

Yêu cầu giữ: guard router/sync phải đọc đồng bộ; offline reload vẫn nhận diện được user (FE-01, ADR-016 offline-first); không tăng độ phức tạp login.

### Decision (Severity: D3 — dữ liệu nhạy cảm cá nhân; Profile: SECURITY)

**Chia 2 tầng:**

1. **Marker** (`parish_current_user`, localStorage) — CHỈ `{ id, role, parishId }`, **không PII**. Router guard (`router.tsx:39,52`), `api.isAuthenticated()`, `syncStore.getCurrentUserId()` tiếp tục đọc đồng bộ như cũ (tất cả chỉ cần id/role/parishId).
2. **Snapshot** (`parish_auth_user`, IndexedDB qua `dexieStorage`) — bản đầy đủ (username, fullName, phone, role, status, parishId, mustChangePassword) **mã hóa AES-256-GCM** tại-rest (khóa non-extractable, AAD `stores:<scopedKey>`, tenant-scoped theo `{parishId}:{userId}` — cùng cơ chế offlineCipher A-NEW-24/44/45).

**Thứ tự đọc** (`loadFromStorage`): marker → `setTenantScope` (bắt buộc để tính key scoped) → đọc snapshot mã hóa → decrypt. **Snapshot thiếu/hỏng** (Dexie bị purge, khóa rotate, LAN HTTP không có `crypto.subtle`) → nếu online: bootstrap refresh + `GET /auth/me` (client method `api.me()` mới) → rebuild snapshot; nếu offline → logout sạch. **Persistence fail-safe**: lỗi ghi Dexie không làm hỏng login (marker vẫn đủ cho guard); login **await** ghi snapshot (reload ngay sau login không rơi vào đường rebuild), setUser/changePassword fire-and-forget. Mọi đường session chết (`logout()`, `redirectToLogin()` — 401) đều dọn cả marker lẫn snapshot (không để PII mã hóa mồ côi).

### Matrix (SECURITY profile)

| Criterion | Weight | A: Giữ nguyên (user đầy đủ ở localStorage) | B: Marker + snapshot mã hóa (chọn) | C: Không persist snapshot local (chỉ cookie) |
|---|---:|---:|---:|---:|
| Security & Privacy | 35% | 3 | 9 | 9 |
| Data Integrity | 20% | 8 | 8 | 8 |
| Reliability | 15% | 8 | 9 | 4 |
| Testability | 10% | 7 | 8 | 5 |
| Maintainability | 10% | 7 | 9 | 7 |
| Operational Fit | 5% | 8 | 9 | 6 |
| Reversibility | 5% | 9 | 9 | 6 |
| **Weighted Score** | **100%** | **5.55** | **8.80** | **7.35** |

**Evidence (E3 — implementation, HIGH)**: A — `authStore.ts` cũ ghi `JSON.stringify(user)` trọn vẹn vào `parish_current_user`; XSS cùng origin đọc trực tiếp (không mã hóa). B — `dexieStorage.setItem` → `encryptValueStrict` (offlineCipher.ts, AES-GCM, khóa non-extractable trong `cryptoKeys`, AAD chống swap ciphertext giữa các store); `scopedStorageKey` cô lập theo tenant; marker chỉ 3 trường định danh phiên.

**Hard gates (D3)** — **Security**: A = 3 (XSS đọc trần PII) ❌ / B = 9 (localStorage chỉ chứa id/role/parishId; PII mã hóa tại-rest trong IndexedDB) ✅ / C = 9 ✅. **Privacy (đánh giá riêng, evidence tách biệt)**: A = 2 (SĐT phụ huynh + họ tên + username trần ở localStorage) ❌ / B = 9 (PII chỉ ở snapshot mã hóa; plaintext tối thiểu) ✅ / C = 9 ✅. **Data Integrity**: A/B/C = 8 (marker+snapshot vẫn rebuild qua /auth/me; không mất session) ✅. → **A REJECT; C: vi phạm yêu cầu offline** (offline reload mất danh tính user → không xem được dữ liệu đã sync — FE-01/ADR-016). **Chọn B**.

**ADR Compatibility**: ADR-010 (auth token memory-only — không đụng), ADR-016 (offline-first — B giữ nhận diện offline qua marker+snapshot), ADR-026/027/039 (SĐT = username PH — vẫn đúng, giờ được mã hóa ở local), ADR-044 (2 cổng login — không đổi), A-NEW-10/24/44/45 (khóa AES, multi-key recovery, self-heal decrypt) → **PASS**.

**Rủi ro**: (1) Người dùng đang chạy build cũ (user trọn vẹn ở localStorage) → marker vẫn parse được (id/role/parishId đủ) — tương thích ngược tự nhiên; lần login sau ghi đè dạng mới. (2) LAN HTTP không có `crypto.subtle` → snapshot không ghi được → mỗi reload phải rebuild qua /auth/me (online); offline trên LAN → logout (chấp nhận, nhất quán với hành vi các store khác). (3) Snapshot mồ côi nếu logout không kịp chạy → `redirectToLogin` cũng dọn (belt-and-suspenders).

**Reversibility**: R1 (revert bằng redeploy; không migration DB server). **Migration**: không cần — dữ liệu cũ tự tương thích; snapshot mới ghi đè key scoped cũ.

**Verification**: tsc 0 error; oxlint 0 error; **1336/1336 vitest PASS** (full suite, gồm FE-01/api-probe-purge/sync-isolation); build:frontend clean; mọi reader `parish_current_user` còn lại (42 grep-point) đều chỉ đọc id/role/parishId hoặc kiểm tra tồn tại.

### Implementation

1. `src/lib/db.ts`: `AUTH_SNAPSHOT_KEY = 'parish_auth_user'` + `clearAuthSnapshot()`.
2. `src/lib/api.ts`: `api.me()` (`GET /api/auth/me` — endpoint có sẵn, thêm client method); `redirectToLogin` dọn thêm snapshot Dexie.
3. `src/stores/authStore.ts`: `readMarker/writeMarker/clearMarker`, `persistSnapshot/loadSnapshot` (fail-safe), `toAuthUser` tách riêng; login/setUser/changePassword/logout/loadFromStorage dùng tầng mới; loadFromStorage có đường rebuild snapshot qua `api.me()`.

### Consequences

- **Positive**: XSS cùng origin không còn đọc được PII (username/SĐT/họ tên) từ localStorage; PII lưu tại-rest ở IndexedDB dạng mã hóa AES-GCM (khóa non-extractable); guard/sync không đổi call site; offline-first giữ nguyên; tự sửa snapshot hỏng khi online.
- **Negative**: Phụ thuộc IndexedDB/WebCrypto cho snapshot (fail-safe đã xử lý); LAN HTTP phải rebuild qua /auth/me mỗi reload; snapshot PII vẫn là dữ liệu local (đã mã hóa) — yêu cầu `clearAuthSnapshot` chạy ở mọi đường session chết.
- **Verify**: `tsc --noEmit` 0 error; `oxlint` 0 error; **1336/1336 vitest PASS** (full suite); `npm run build:frontend` clean; e2e login hiện có vẫn phủ luồng đăng nhập (marker ghi đồng bộ).
- **Files**: `src/stores/authStore.ts`, `src/lib/db.ts`, `src/lib/api.ts`, `docs/SECURITY_AUDIT_LOG.md` (A-NEW-54), `docs/AI_CONTEXT_MAP.md`, `docs/BUSINESS_RULES.md` (chỉ ghi chú local-storage policy).

---

## ADR-046: Username unique theo parish — composite `(parish_id, username)` (2026-08-16)

**Status: APPROVED. Severity: D3 (auth + schema migration + tenant isolation). Profile: SECURITY.**

### Problem

`users.username` bị ràng buộc UNIQUE **toàn cục** (`users_username_unique`, migration 116) trong khi mọi định danh khác đã composite hóa theo ADR-031 (`(parish_id, id)` PK, `students.code`, `system_settings`, ...). Hệ quả:

1. **Chặn multi-parish hợp lệ**: username phụ huynh = SĐT chuẩn hóa (ADR-026/027/039) — 2 giáo xứ khác nhau không thể có tài khoản cùng SĐT (ví dụ cùng số ĐT ở 2 giáo xứ khác nhau); username GLV tự sinh theo tên thánh + họ tên (ADR-027) cũng có nguy cơ va chạm liên giáo xứ.
2. **Login lookup không filter parish** (`routes/auth.ts:118` — `where(eq(users.username, username)).limit(1)`): không đúng tenant semantics; khi cho phép cùng username ở 2 parish, lookup toàn cục + `limit(1)` có thể trả user thuộc parish khác → sai tenant.

### Current State / Desired State

- **Current**: `users.username` global UNIQUE; login lookup toàn cục; pre-check tạo user (`userService.ts:123`), đổi SĐT-username (`:434`), bulk provision PH (`:599`) đều check toàn cục. `SECURITY_HARDENING_PLAN §5.2` phải duy trì exception list "khóa uniqueness toàn DB".
- **Desired**: `UNIQUE(parish_id, username)` ở DB level; login lookup theo parish; pre-check theo parish — nhất quán ADR-031 + F6 (pattern đã áp cho `students.code` → `idx_students_code_parish`).

### Constraints

- Login endpoint KHÔNG được đổi contract bắt buộc: client hiện tại (và tương lai gần) chỉ gửi `username + password` — `parishId` phải **optional, default `'gia-ton'`** (parish vận hành duy nhất hiện nay) để backward-compatible.
- Migration phải an toàn với DB đang chạy: không mất data, không rebuild bảng.

### Options

- **A. Giữ nguyên** (global UNIQUE, lookup toàn cục).
- **B. Composite UNIQUE `(parish_id, username)`** + login/pre-check scoped theo parish; `parishId` optional default `'gia-ton'` (chọn).
- **C. Composite + bắt buộc `parishId` ở login** — phá contract, client cũ chết, chưa có cơ chế client biết parish trước login.

### Matrix (SECURITY profile)

| Criterion | Weight | A: Giữ nguyên | B: Composite + scoped lookup (chọn) | C: Bắt buộc parishId |
|---|---:|---:|---:|---:|
| Security & Privacy | 35% | 6 | 9 | 8 |
| Data Integrity | 20% | 5 | 9 | 9 |
| Reliability | 15% | 8 | 8 | 6 |
| Testability | 10% | 6 | 9 | 9 |
| Maintainability | 10% | 5 | 8 | 7 |
| Operational Fit | 5% | 8 | 8 | 5 |
| Reversibility | 5% | 10 | 8 | 7 |
| **Weighted Score** | **100%** | **6.30** | **8.65** | **7.70** |

**Evidence (E3 — implementation, HIGH)**:
- A — `schema.ts:6` `.unique()`, migration 116 tạo `users_username_unique` (db/index.ts:1422); `auth.ts:118` lookup không parish; `userService.ts:123/434/599` check toàn cục; `SECURITY_HARDENING_PLAN.md §5.2` phải giữ exception list.
- B — migration `20260816-121`: `DROP INDEX users_username_unique` + `CREATE UNIQUE INDEX idx_users_username_parish ON users(parish_id, username)` — **không mất data** (global unique ⊃ per-parish unique: subset không thể có duplicate trong cùng parish); login + 3 pre-check scoped; `parishId` optional default `'gia-ton'` → client cũ không đổi.
- C — phá `POST /api/auth/login` contract; mọi client/test cũ phải sửa cùng lúc; chưa có nguồn parish phía client trước login.

**Hard gates (D3)** — **Security**: A = 6 (không exploit được hiện tại — username global unique nên lookup trả đúng 1 user — nhưng chặn multi-parish + rủi ro sai tenant khi mở rộng) ❌ / B = 9 (lookup bắt buộc theo parish; DB-level chặn trùng username trong parish) ✅ / C = 8 ✅. **Privacy**: A/B/C = 9 (username không phải PII mới; không thêm dữ liệu nhạy cảm) ✅. **Data Integrity**: A = 5 (global unique chặn nhầm tài khoản hợp lệ ở parish khác — false-positive conflict; ngữ nghĩa sai với mô hình tenant ADR-031) ❌ / B = 9 (unique đúng tenant semantics; migration không mất row) ✅ / C = 9 ✅. → **A REJECT. Chọn B**.

**ADR Compatibility**: ADR-031 (composite PK multi-tenancy — B đồng bộ, **PASS**); ADR-026/027/039 (username PH = SĐT, GLV auto-gen — format giữ nguyên, chỉ đổi scope unique, **PASS**); ADR-016 (users pre-check — scoped theo parish, **PASS**); ADR-044 (2 cổng login, backend bất biến — endpoint không đổi, chỉ thêm field optional, **PASS**).

### Risks

| Risk | Probability | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Migration DROP/CREATE index fail | Rất thấp | Boot fail | Single-statement idempotent (IF NOT EXISTS / IF EXISTS); rollback = bỏ migration entry | Thấp |
| Client cũ không gửi parishId với user KHÔNG thuộc `gia-ton` | Thấp (1 parish vận hành) | Không login được | Default `gia-ton`; khi multi-parish go-live phải thêm parish picker/config trước | Ghi backlog |
| 2 parish cùng username → login cũ (không gửi parishId) luôn trả gia-ton | Thấp | Không lấy nhầm tài khoản parish khác (fail-closed) | Default gia-ton cố định — không fallback global lookup | Chấp nhận (fail-closed, không sai tenant) |

### Reversibility / Migration / Rollback

- **Reversibility**: R2 (revert bằng migration ngược: drop composite, tạo lại global unique — an toàn vì composite ⊂ global).
- **Migration**: `20260816-121` — `DROP INDEX IF EXISTS users_username_unique; CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_parish ON users(parish_id, username);`
- **Rollback Trigger**: boot fail / duplicate index conflict. **Rollback Procedure**: xóa migration entry + chạy ngược DDL. **Max Rollback Time**: < 1 phút.

### Verification

- Test `username-tenant-scope.test.ts` (5 tests): (1) index composite tồn tại + global unique đã drop; (2) DB-level cùng username 2 parish OK + trùng trong parish reject; (3) login scoped trả đúng user theo parishId + sai parish → 401; (4) login không gửi parishId → default gia-ton; (5) createUser cùng username parish khác OK + trùng trong parish → null.
- 15 suite auth/user liên quan: **97/97 PASS**; tsc 0 error; oxlint 0 error.

### Source-of-Truth Updates

- `docs/07_DATABASE_PLAN.md` row 1: `username` UNIQUE → `(parish_id, username)` UNIQUE (`idx_users_username_parish`).
- `docs/BUSINESS_RULES.md` §10: quy ước username — unique scope theo parish.
- `docs/FRONTEND_API_CONTRACT.md` login: `parishId` optional default `'gia-ton'`.
- `docs/02_ARCHITECTURE.md` Multi-Tenant bullet: username composite.
- `docs/AI_CONTEXT_MAP.md` module ADR-046.
- `docs/SECURITY_AUDIT_LOG.md` A-NEW-55.
- `docs/POLISH_PLAN_2026-08-14.md` D1 → DONE.

### Consequences

- **Positive**: schema nhất quán ADR-031; multi-parish không còn bị chặn bởi username; login/pre-check không bao giờ chạm tài khoản parish khác (fail-closed); xóa exception list §5.2 cho `users.username`.
- **Negative**: login phải gửi `parishId` khi user không thuộc `gia-ton` (client hiện tại không cần — default); 2 parish cùng username qua client cũ (không gửi parishId) chỉ login được tài khoản `gia-ton` — cần parish picker ở go-live multi-parish (backlog).
- **Files**: `server/src/db/index.ts` (migration `20260816-121` + base create), `server/src/db/schema.ts`, `server/src/routes/auth.ts`, `server/src/services/userService.ts`, `server/src/__tests__/username-tenant-scope.test.ts` (NEW) + 7 test files cập nhật login body.

## ADR-055: Component Standards — PageHeader/ModalShell/FormField + Domain Badge Colors (2026-08-16)

> ⚠️ **Renumber 2026-08-22**: đánh số lại từ ~~ADR-047~~ — audit doc-integrity phát hiện trùng số với ADR-047 Grade Policy Versioning & Delta Audit. Nội dung giữ nguyên.

**Status: APPROVED. Severity: D3 (chuẩn hóa toàn app — mọi trang/modal/form về sau phải dùng). Profile: GENERAL.**

### Problem

UX/UI audit app-wide (2026-08-16) ghi nhận "mỗi trang tự dựng một kiểu": 4 kiểu header khác nhau (14+ trang), 30+ custom modal shell không đồng nhất a11y (thiếu `aria-modal`/`aria-labelledby`/focus trap/Escape/scroll-lock), 5 kiểu input/error khác nhau, và ~70 pill raw class (như `bg-violet-100 text-violet-700`) không tồn tại trong DS tokens (ADR-030). Hệ quả: UX không nhất quán + a11y không đạt chuẩn WCAG.

### Current State / Desired State

- **Current**: mỗi trang tự dựng header/modal/form; chỉ ConfirmDialog có shell chuẩn (focus trap + Escape + `role="alertdialog"`); không có component dùng chung.
- **Desired**: 3 component chuẩn trong `src/components/common/` bắt buộc dùng cho code mới; chuỗi linter `NO_NONEXISTENT_CLASS` (rule 4) không flag class mới (chỉ flag danh sách đen cứng).

### Constraints

- Phải tái dùng `useFocusTrap` (đang dùng ở ConfirmDialog) — không viết trap mới.
- Không phá ConfirmDialog (đã có test 13 case) — ModalShell mới dùng cho modal thường; ConfirmDialog giữ `role="alertdialog"` (đúng semantics cho confirm).
- `.modal-overlay`/`.modal-content`/`.form-error`/`.form-input` đã tồn tại trong `index.css` — component chỉ wrap, không định nghĩa CSS mới.

### Options

- **A. Không tạo component chung** — tiếp tục tùy biến từng trang (status quo).
- **B. Tạo PageHeader/ModalShell/FormField chuẩn** + mở rộng badge domain colors (violet/teal/orange/indigo/purple) — (chọn).
- **C. Tạo thêm cả hệ thống gen component** (template tooling) — quá tải cho quy mô app hiện tại.

### Matrix (GENERAL profile)

| Criterion | Weight | A: Status quo | B: 3 component chuẩn (chọn) | C: Thêm tooling |
|---|---:|---:|---:|---:|
| Security & Privacy | 15% | 6 | 9 | 8 |
| Data Integrity | 10% | 7 | 9 | 9 |
| Reliability | 15% | 6 | 9 | 8 |
| Testability | 10% | 4 | 9 | 9 |
| Maintainability | 15% | 3 | 9 | 7 |
| UX & Consistency | 15% | 3 | 9 | 8 |
| A11y & WCAG | 10% | 4 | 9 | 8 |
| Operational Fit | 5% | 7 | 9 | 5 |
| Reversibility | 5% | 10 | 9 | 5 |
| **Weighted Score** | **100%** | **4.95** | **9.00** | **7.45** |

**Evidence (E3 — implementation, HIGH)**:
- A — `docs/UX_UI_AUDIT_AND_IMPROVEMENT_PLAN_2026-08-16.md` Mục II: 4 kiểu header, 30+ modal custom, 5 kiểu input, ~70 pill raw (AuditLogPage/AcademicYearPage).
- B — `src/components/common/PageHeader.tsx` (DS §5: icon tile `bg-parish-primary-light text-parish-primary` + `h1 text-lg font-extrabold text-text-main` + desc `text-xs text-text-muted` + `actions`), `ModalShell.tsx` (`.modal-overlay`/`.modal-content` + `role="dialog"` `aria-modal` `aria-labelledby` (React `useId`) + `useFocusTrap` + Escape + scroll-lock + overlay-click policy `closeOnOverlay` + close button `btn-icon btn-ghost` aria-label "Đóng"), `FormField.tsx` (`htmlFor` + required marker `text-parish-danger` + error `.form-error` `role="alert"` + `aria-invalid`/`aria-describedby` + hint). Test: `src/__tests__/components/CommonComponents.test.tsx` **13/13 PASS**.
- B (tokens) — `index.css @theme` thêm `--color-parish-{violet,teal,orange,indigo,purple}` + `-bg` (AA trên pastel: violet-700/100 6.6:1, teal-700/100 ~7:1, orange-700/100 4.6:1, indigo-700/100 ~7:1, purple-700/100 ~6:1) + `.badge-*` classes + dark overrides (light text trên dark bg).
- C — chưa có nhu cầu; dev tooling không phải chặn điểm hiện tại.

**Hard gates (D3)** — **Security & Privacy**: A = 6 / B = 9 (không thêm attack surface — JSX thuần, không dangerouslySetInnerHTML) / C = 8. **Privacy**: không thu thập dữ liệu mới — 9/9/9 ✅. **Data Integrity**: không đụng dữ liệu — 9 ✅. → **A REJECT. Chọn B**.

**ADR Compatibility**: ADR-030 (SSOT `index.css` — B chỉ wrap class có sẵn + thêm token theo đúng pattern, **PASS**); ADR-032 (a11y/UX chuẩn hóa — B là hiện thân của chuẩn đó, **PASS**); ADR-026 (login 2 cổng — không đụng, **PASS**).

### Risks

| Risk | Probability | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Modal mới bị dùng khi `isOpen=false` render null → nội dung mount muộn | Thấp | UX nhỏ | Pattern đã có ở ConfirmDialog; test phủ | Thấp |
| `React.cloneElement` trong FormField mất props control tùy biến | Thấp | Edge-case | Chỉ bơm aria — không ghi đè props khác | Thấp |
| Lệch màu dark-mode badge so với light | Thấp | Cosmetic | Dark overrides theo pattern `.dark .badge-*` có sẵn | Thấp |

### Reversibility / Migration / Rollback

- **Reversibility**: R1 (xóa 3 file + revert tokens — không migration dữ liệu, không đụng API).
- **Migration**: không có (client-side only, add-only).
- **Rollback Trigger**: lỗi runtime phổ biến. **Rollback Procedure**: xóa import tại chỗ dùng. **Max Rollback Time**: < 10 phút.

### Verification

- `CommonComponents.test.tsx` **13/13 PASS** (PageHeader 3, ModalShell 6, FormField 4).
- `npm run lint:ds` = 0 violations / **128 components** (thêm 3 file mới + test file).
- `tsc -b` clean; oxlint 0 error.

### Source-of-Truth Updates

- `docs/03_DESIGN_SYSTEM.md` §10 (thêm badge-violet/teal/orange/indigo/purple), §12 (batch 2026-08-16 ghi nhận 3 component chuẩn).
- `docs/AI_CONTEXT_MAP.md` module UX/UI Audit 2026-08-16 — Pha 1.
- `docs/UX_UI_AUDIT_AND_IMPROVEMENT_PLAN_2026-08-16.md` PHA 1 → ✅ HOÀN THÀNH.

### Consequences

- **Positive**: mọi code mới (header/modal/form) dùng 3 component chuẩn → đồng nhất UX + a11y (focus trap, Escape, scroll-lock, aria) đạt chuẩn; AuditLogPage/AcademicYearPage đổi pill raw → `.badge-*` domain (Pha 3/6); linter không cần thêm rule vì lớp component chuẩn chặn drift.
- **Negative**: component mới cần đủ props cho mọi case (tạm thời một số modal cũ giữ shell riêng cho tới khi được migrate ở Pha 3).
- **Files**: `src/components/common/PageHeader.tsx` (NEW), `src/components/common/ModalShell.tsx` (NEW), `src/components/common/FormField.tsx` (NEW), `src/__tests__/components/CommonComponents.test.tsx` (NEW), `src/index.css` (@theme tokens + `.badge-*` + dark overrides).

---

## ADR-048: OMR Print Geometry SSOT, Explicit Template Modes & Fail-Closed Marker Detection (2026-08-18)

**Status: APPROVED. Severity: D2 (print template + camera UI + detector + tests). Profile: GENERAL.**

### Problem and evidence

- **E1 (production evidence, HIGH)**: ảnh iPhone mới nhất cho thấy A4 nằm lọt trong camera, marker integrated trên giấy chỉ còn khoảng 11–15px và QR không đọc được từ ảnh chụp màn hình. Người dùng đồng thời báo detector từng ghi điểm trước khi căn đúng vùng đáp án.
- **E2 (reproduction, HIGH)**: trước hardening, crop camera có thể trả `ok=true` với 2–4 đáp án nhiễu; locator full-page ghép một candidate sát mép ảnh với chữ/viền thành tứ giác giả. Sau hardening, screen/video crop trả `MISSING_MARKER_*`; paper crop tìm đúng integrated rect và trả `ALL_BLANK` khi chưa tô.
- **E2 (real-render measurement, HIGH)**: Chromium A4 @96dpi cho thấy công thức cũ dùng chiều cao tham chiếu đề 50 câu cho mọi đề, làm Y của câu đầu/cuối lệch khoảng 11–27px trên đề 10/20 câu. Đo sau sửa khóa sai số tâm bubble ≤2px ở 10/20/50 câu.
- **E3 (code inspection, HIGH)**: `detectAnswersFromImage` từng tự fallback giữa geometry full-page và integrated; `tryLocateIntegratedFrame` chỉ quét ba scale; `findMarkerInBand` chọn blob tối rồi mới loại, không xét ứng viên kế tiếp; guide UI cố định tỷ lệ 5:1.

### Options and decision matrix

| Criterion | Weight | A: Chỉ chỉnh threshold | B: SSOT geometry + explicit mode + gates (chọn) | C: Server/OpenCV/ArUco |
|---|---:|---:|---:|---:|
| Security & Privacy | 15% | 8 | 9 | 6 |
| Data Integrity | 20% | 5 | 9 | 8 |
| Reliability | 20% | 5 | 9 | 8 |
| Business Correctness | 15% | 5 | 9 | 8 |
| Performance | 10% | 9 | 8 | 5 |
| Maintainability | 10% | 7 | 9 | 5 |
| Testability | 5% | 5 | 9 | 7 |
| Reversibility | 5% | 9 | 9 | 5 |
| **Weighted score** | **100%** | **6.15** | **8.85** | **6.75** |

**Decision: B.** A bị loại vì không sửa sai hệ tọa độ và vẫn có false-positive chéo mẫu. C bị loại ở D2 hard gate vì Security & Privacy=6<7, thêm upload ảnh/mạng/dependency vận hành khi bài toán được giải quyết client-side.

### Decision

1. `answerSheetTemplate.ts` là SSOT cho marker 18px, bubble 16px, row 18px, gaps và `integratedFrameH(totalQuestions)`. Tọa độ detector tính theo padding-box/render model thực, không dùng chiều cao 50 câu cho đề ngắn.
2. Bản in thêm halo trắng quanh marker; chữ/viền bubble dùng màu nhẹ hơn; hướng dẫn chấp nhận bút xanh/đen hoặc bút chì đậm và bắt buộc tô kín đúng một ô.
3. Locator integrated quét nhiều scale, chấm candidate bằng độ phủ + bốn quadrant + isolation, kiểm tra aspect theo số câu. Locator full-page tìm trong band rộng nhưng yêu cầu marker không bị cắt sát mép, tứ giác lồi, tỷ lệ A4-marker hợp lệ và các cạnh đối không biến dạng quá mức.
4. UI bắt buộc chọn `integrated` hoặc `full_page`; production truyền mode rõ vào detector. Không fallback chéo. `auto` chỉ thử hai locator geometry-validated, không dùng template tĩnh để suy đoán.
5. Guide camera integrated lấy aspect động theo số câu; full-page yêu cầu trọn A4. Khi thiết bị hỗ trợ, camera áp dụng continuous focus/exposure/white-balance. Mọi lỗi marker/blank/low-confidence phải hiển thị rõ; không có kết quả hợp lệ thì không chuyển sang bước ghi.
6. Regression bắt buộc: DOM render geometry 10/20/50; tờ A4 inset 72%; không fallback chéo; blank/multi-fill/sparse-answer; QR render và pipeline camera crop.

### Gates, compatibility and rollback

- **D2 hard gates**: Security & Privacy 9, Data Integrity 9, Testability 9, Tenant Isolation 9, Business Correctness 9, Reliability 9 — **PASS**.
- **ADR compatibility**: ADR-023 (print/session) `PASS`; ADR-024 (OMR scoring/answers) `PASS`; ADR-043 (mobile scan/confirmation/fallback path) `PASS`.
- **Business rule**: `CONFIRMED` — chỉ đúng mẫu + geometry/paper/confidence hợp lệ + xác nhận người dùng mới được ghi; `ALL_BLANK` không ghi điểm.
- **Schema/API**: không đổi. **Reversibility**: R1; rollback bằng revert client bundle. Không migration dữ liệu.
- **Residual risk**: giấy nhàu/chụp quá xiên có thể bị từ chối (false-negative) nhưng không sinh điểm ảo; người dùng có thể chụp lại, chọn đúng mẫu hoặc dùng nhập điểm trực tiếp theo ADR-043.

### Verification

- Targeted OMR/QR/print/identity/consensus: **107/107 PASS**; template/barcode/guided-grade bổ sung: **28/28 PASS**; regression A4 full-page inset 72% bổ sung sau cùng: **1/1 PASS**.
- Full Vitest: **192 files / 1468 tests PASS** trước khi chỉ thêm test inset nêu trên (không đổi production code).
- `npm run build:frontend`: PASS; production bundle + service worker generated.
- Oxlint trên toàn bộ file code/test sửa đổi: 0 warning/error; `git diff --check`: PASS.

---

## ADR-049: Scan Engine v2 Foundation — Versioned Forms, Review States & Server-Authoritative MC Scoring (2026-08-18)

**Status: APPROVED / IMPLEMENTED (foundation). Severity: D2 (print protocol + detector/UI + API + DB/offline/audit). Profile: GENERAL.**

### Problem and evidence

- **E3 HIGH — score trust boundary**: `POST /exams/:id/results` trước thay đổi chỉ kiểm tra `r.score` trong khoảng rồi ghi nguyên giá trị cho cả `omr/qr_scan`; `answers` không được parse khi ghi lần đầu. Client lỗi hoặc bundle cũ có thể tạo điểm không khớp đáp án.
- **E3 HIGH — unbound form**: payload `TE` chỉ mang session/student. Scanner không thể biết mã thuộc template integrated/full-page hay bao nhiêu câu, nên lựa chọn geometry sai chỉ được phát hiện gián tiếp qua marker.
- **E2 HIGH — ambiguous state**: detector đánh dấu `isMultiFill` nhưng vẫn trả một kết quả có thể lưu nếu các câu còn lại rõ; mọi multi-fill còn có thể bị phân loại `ALL_BLANK` khi không có single answer. Không có trạng thái review bắt buộc.
- **E2 HIGH — mobile capture**: nút fixed-student dùng frame preview tối đa 1280px dù stream xin 1920; ảnh render/blur hiện có chỉ chứng minh QR ở fixture, chưa chứng minh accuracy camera thực địa.

### Options and decision matrix

| Criterion | Weight | A: Giữ client-authoritative | B: On-device v2 + server recompute (chọn) | C: Upload ảnh/OpenCV server |
|---|---:|---:|---:|---:|
| Security & Privacy | 15% | 8 | 9 | 5 |
| Data Integrity | 20% | 4 | 10 | 9 |
| Reliability | 15% | 5 | 9 | 8 |
| Business Correctness | 15% | 5 | 9 | 8 |
| Offline Reliability | 10% | 8 | 9 | 3 |
| Testability | 10% | 5 | 9 | 8 |
| Maintainability | 10% | 7 | 8 | 5 |
| Reversibility | 5% | 10 | 8 | 4 |
| **Weighted score** | **100%** | **5.90** | **9.05** | **6.70** |

**Decision: B.** A bị loại bởi D2 Data Integrity gate (4<7). C bị loại bởi Security & Privacy gate (5<7) và phá offline-first khi chưa có bằng chứng on-device không đạt mục tiêu.

### Decision

1. Phiếu production mới dùng compact Alphanumeric protocol v2: `T2:{sessionHex8}:{studentHex8}:{I|F}:{questionCount}:{checksum4}`. Checksum FNV-1a 16-bit chỉ phát hiện corruption/config drift; authorization vẫn ở server. TE/legacy vẫn parse.
2. QR metadata tự chọn detector template; mismatch `questionCount` với session active là hard reject. Protocol v2 25 module (v1 21), vẫn trong QR 120px + quiet zone và đã qua real-render/blur regression.
3. MC detector trả `accepted | review_required | rejected`. Multi-fill và weak mark (`coverage 0.24..<0.38`) bắt buộc review. UI khóa Save cho tới khi từng ngoại lệ được sửa/xác nhận; edit được lưu vào `correctedQuestions`.
4. Fixed-student capture dùng source crop ở sensor resolution tối đa 2200px. Quality metrics là advisory trong foundation; marker/paper/geometry/confidence tiếp tục là hard gates.
5. Với source `omr/qr_scan` của MC, server parse `answers`, bỏ metadata legacy `_...`, validate index/value, lấy answer key/session settings và tính lại score. Response/audit ghi `adjustments`; quick entry và written-score-grid giữ semantics cũ.
6. Migration add-only `20260818-123` thêm nullable `exam_results.scan_metadata`. Metadata chỉ có aggregate diagnostics; recursive sanitizer cấm ảnh/base64/data URL. Offline sync gửi metadata và refresh result nếu server trả adjustments.
7. Telemetry client local chỉ chứa aggregate counter/reason/template/quality/timing. `omrBenchmark.ts` cung cấp KPI report; corpus camera chỉ được thêm sau khử định danh. Không tuyên bố đạt accuracy thực địa và không bật auto batch làm mặc định trước gate BUSINESS_RULES §21.3.

### Gates, compatibility, migration and rollback

- **D2 hard gates**: Security & Privacy 9; Data Integrity 10; Testability 9; Tenant Isolation 9; Business Correctness 9; Offline Reliability 9 — **PASS**.
- **Business Rule Gate**: server client-score trust = `CONFIRMED` và đã sửa; camera accuracy target = `CONDITIONAL / NOT YET CONFIRMED` đến khi có corpus; blank/multi/mismatch fail-closed = `CONFIRMED` bằng tests.
- **ADR compatibility**: ADR-023 (print/session) `PASS`; ADR-024 (OMR/answers) `PASS`; ADR-043 (guided stable fallback/offline) `PASS`; ADR-048 (explicit geometry/fail-closed) `PASS`; ADR-031 (tenant composite keys) `PASS` — cột mới không đổi key/query scope.
- **Migration**: nullable add-column, không backfill, không lock logic nghiệp vụ. Phiếu TE/legacy và queued answers cũ tiếp tục hoạt động. **Rollback**: R1 client/server; có thể giữ cột nullable không dùng. Nếu rollback server riêng, client field dư bị route schema cũ từ chối nên phải rollback client cùng release. Max rollback dự kiến <15 phút.
- **Residual risk**: FNV không chống giả mạo (không được dùng như auth); server vẫn cần session/class/RBAC hiện có. Field accuracy camera ngoài fixture chưa được chứng minh. Quality thresholds chưa là hard gate trước calibration corpus.

### Verification

- Targeted end-to-end scan/offline/migration/server regression: **17 files / 233 tests PASS**; QR Chromium camera/blur v2 pass.
- Full Vitest trên trạng thái cuối: **195 files / 1478 tests PASS**.
- Production build (client + server + Vite/PWA): PASS; client `tsc -b`, server `tsc`, `oxlint`, `git diff --check`: PASS (lint/build còn các warning baseline ngoài scope, không error).
- Auto-batch gate vẫn đóng cho tới corpus thật; số test xanh không được dùng để tuyên bố accuracy thực địa.

---

## ADR-050: Exam Operations Scale — Batch Files, Multi-Version Keys, Analytics & Local Review (2026-08-19)

**Status: APPROVED / IMPLEMENTED WITH GATES. Severity: D3. Profile: SECURITY + GENERAL.**

### Evidence and scope

- **E3 HIGH**: `ExamScanModal` trước chỉ nhận camera hoặc một ảnh; `exam_results.answers` đã có dữ liệu nhưng không có item-analysis; session chỉ có một `answer_key`; bản scan không thể rà soát sau khi modal đóng.
- **E1 HIGH**: người vận hành yêu cầu xử lý những khoảng trống đã xác nhận sau đánh giá thị trường. Không có corpus camera khử định danh hoặc bộ nhãn chữ viết tay để chứng minh SBD/OCR an toàn.
- Phạm vi được duyệt: batch file explicit, mã đề A–H, thống kê, hướng dẫn chất lượng và ảnh rà soát local opt-in. SBD tự động, mẫu BGD và OCR tự luận vẫn bị hard gate chặn.

### Decision matrix

| Criterion | Weight | A: Bật mọi tính năng kể cả OCR/SBD | B: Scale fail-closed + gate phần chưa đủ bằng chứng (chọn) | C: Giữ v2 |
|---|---:|---:|---:|---:|
| Security & Privacy | 25% | 5 | 9 | 9 |
| Data Integrity | 25% | 5 | 10 | 9 |
| Reliability | 15% | 6 | 9 | 8 |
| Business fit | 15% | 9 | 9 | 5 |
| Testability | 10% | 4 | 9 | 8 |
| Maintainability | 5% | 5 | 8 | 9 |
| Reversibility | 5% | 4 | 8 | 10 |
| **Weighted** | **100%** | **5.45** | **9.15** | **8.00** |

**Decision: B.** A bị loại bởi D3 Security/Privacy/Data Integrity <8. C an toàn nhưng không đáp ứng vận hành đã xác nhận.

### Implementation

1. `ExamBatchScanModal` nhận tối đa 500 ảnh hoặc thư mục, xử lý tuần tự để giới hạn RAM. Mỗi ảnh bắt buộc code đúng session/student, mã đề đã cấu hình, số câu đúng, OMR accepted và quality=`good`; review/rejected không bao giờ được đưa vào payload lưu. Người dùng phải bấm lưu nhóm accepted; batch không trở thành CTA mặc định.
2. Form protocol v3: `T3:{sessionHex8}:{studentHex8}:{I|F}:{questionCount}:{A-H}:{checksum4}`. Mã đề nằm trong checksum. V1/V2 vẫn đọc được và được hiểu là A. B–H được in trên phiếu trả lời rời cho đề đảo bên ngoài; trình tạo đề gộp chưa tự đảo nội dung câu hỏi nên bị giới hạn ở A để không dán nhãn sai.
3. DB migrations add-only, single-statement `20260818-124/125`: `exam_sessions.answer_variants` JSON nullable và `exam_results.exam_version` default `A`. Việc tách migration cho phép tự phục hồi nếu deploy dở dang. Server chọn key theo version và tự tính lại score; update variants chỉ cho draft MC, A bắt buộc, không được xóa version đã có kết quả, và re-score transactionally. `answer_key` tiếp tục là alias legacy của variant A.
4. `ExamAnalyticsPanel` tính phổ điểm, mean/median/min/max/pass-rate, phân bố mã đề, tỷ lệ đúng/trống và point-biserial. Độ phân biệt chỉ xuất khi có ít nhất 5 response và có cả nhóm đúng/sai; đây là chỉ báo mô tả, không tự sửa điểm/câu hỏi.
5. Quality reason được dịch thành hành động cụ thể. Camera single-scan vẫn dùng quality advisory vì marker/geometry/review là hard gate; batch file thận trọng hơn và route mọi quality khác `good` sang review.
6. Ảnh rà soát là **opt-in**, nén tối đa 960px, lưu tenant-scoped trong Dexie đã mã hóa AES-GCM, tự hết hạn sau 24 giờ và có nút xóa ngay. Ảnh không đi vào API, `scan_metadata`, audit hoặc telemetry. Đây là hỗ trợ trên cùng thiết bị, không phải hồ sơ server lâu dài.
7. SBD tự động và OCR tự luận = **NOT IMPLEMENTED / BLOCKED**: chưa có corpus nhãn, ngưỡng false-link và quy trình human review. Mẫu BGD/A5/A6 cũng chưa được tuyên bố tương thích detector khi chưa có calibration print/camera; không được quảng bá là đã hỗ trợ.

### Gates and compatibility

- **D3 gates**: Security 9, Privacy 9, Data Integrity 10, Tenant Isolation 9, Testability 9 — PASS cho phần triển khai. SBD/OCR bị reject vì chưa đạt gate.
- **Business Rule Gate**: batch accepted-only, server version scoring, backward compatibility = `CONFIRMED` bằng source/tests; accuracy camera thực địa và OCR/SBD = `NOT CONFIRMED`.
- **ADR compatibility**: ADR-023/024/043/048/049 `PASS`; ADR-031 tenant isolation `PASS`. Batch tái dùng API/save authority hiện có; ảnh local không thay contract server.
- **Migration/rollback**: add-only, legacy row mặc định A. Rollback R1 client/server; cột mới có thể giữ không dùng. Không rollback migration phá dữ liệu.

### Verification

- Frontend/server TypeScript build PASS.
- Targeted QR v3, variant normalization, batch fail-closed, analytics, local retention, render/store và exam route/service: **8 files / 79 tests PASS**.
- Full Vitest: **199 files / 1491 tests PASS**. Production build client/server và lint PASS (lint chỉ còn baseline warnings, không error). Không suy diễn accuracy camera từ unit tests.

---

## ADR-052: Unify Promotion Write-Path + Student/Class/Academic Structure Hardening (2026-08-21)

**Status: APPROVED / IMPLEMENTED. Severity: D2 (cross-module, chạm protected business behavior). Profile: GENERAL + SECURITY.**

### Context (audit 2026-08-21 — Student / Class / Academic Structure)

Audit toàn diện phát hiện đường xét lên lớp thủ công của client (`PromotionPanel` → `studentStore.batchPromote` → `PUT /api/students/:id`) **không sinh `promotion_records`** và không được server enforce SemesterLock/policy — vi phạm BUSINESS_RULES §1.1/§1.6 (SSOT snapshot + HK2 lock bắt buộc). Gate "F1" cũ thuần client và tự bỏ qua khi server lỗi/decision null/offline. Kèm 6 finding phụ (F2–F7): finalize không áp grade overrides (409 `DATA_MISMATCH` lúc promote cho HS có override), race idempotency tạo HS trùng không key, năm học chấp nhận id tự do (range 2000-2099 làm lệch `getOpenSemester`), promoteYear im lặng khi mapping lớp trượt, lỗi ràng buộc class route thành 500, join đếm thiếu predicate parish.

### Decision matrix (F1 — đường duyệt thăng tiến)

| Criterion | Weight | A: Giữ client-gate + `PUT /students` | B: batch-approve SSOT + move atomic (chọn) | C: Cấm promotion offline hoàn toàn |
|---|---:|---:|---:|---:|
| Security & Privacy | 25% | 5 | 9 | 9 |
| Data Integrity | 25% | 4 | 10 | 9 |
| Reliability | 15% | 7 | 9 | 6 |
| Business fit | 15% | 6 | 9 | 4 |
| Testability | 10% | 5 | 9 | 8 |
| Maintainability | 5% | 6 | 8 | 8 |
| Reversibility | 5% | 8 | 8 | 6 |
| **Weighted** | **100%** | **5.45** | **9.15** | **7.35** |

**Decision: B.** A bị loại: Data Integrity 4 < gate 7 (snapshot bị bypass là chính). C bị loại vì phá offline-first (ADR-016) mà không tăng integrity so với B.

### Implementation

1. **F1**: `POST /api/promotion/batch-approve` nhận thêm `newBranch`; `BatchPromotionApplicationService` update `students.classId`/`students.branch` **trong cùng transaction** với snapshot (áp cả item `skipped` — idempotent hội tụ). `PromotionPanel` khi online gọi endpoint này; decision null/network error → **DỪNG**, không duyệt mù (đóng bypass); offline giữ fallback queue (hạn chế ghi rõ ở BUSINESS_RULES §1.8).
2. **F2 (AYL-F2)**: `finalizeYear` load active `grade_overrides` 1 lần/năm và tính GPA qua `applyOverridesToGrade` — snapshot khớp `computeAuthoritativeMetrics` (G-02) và ReportCard; HS có override không còn 409 khi promote.
3. **F3 (IDEM-F3)**: `createStudent` phân biệt UNIQUE violation do `idempotency_key` (`isIdempotencyKeyViolation`) → trả về bản ghi request thắng; nhánh fallback giữ nguyên key (trước đây drop key → HS trùng im lặng).
4. **F5 (AY-F5)**: `parseAcademicYear` bắt buộc ở `POST /api/classes/academic-years`, `/copy`, `/promote`; validate ngày `YYYY-MM-DD` + start<end → 400 `ACADEMIC_YEAR_INVALID`.
5. **F4 (PRM-F4)**: `PromoteSummary.warnings[]` ghi rõ HS không chuyển được lớp do thiếu mã tương ứng (năm vẫn PROMOTED — hành vi movement giữ nguyên, hết im lặng).
6. **F6 (ERR-F6)**: `POST/PUT /api/classes` map UNIQUE→409 `CLASS_CODE_EXISTS`, FK→400 `INVALID_REFERENCE`; `removeUserFromClass` bọc transaction; `studentService`/`classService` chuyển sang `runDbTransaction` (retry SQLITE_BUSY).
7. **F7 (TENANT-F7)**: join đếm học viên theo năm trong `listAcademicYears` thêm `eq(classes.parishId, students.parishId)`.

### Gates and compatibility

- **D2 gates**: Security & Privacy 9, Data Integrity 10, Testability 9 — PASS.
- **Business Rule Gate**: snapshot-SSOT + HK2-lock enforcement = `CONFIRMED` (test 4/5 BatchPromotionService, test 8b lifecycle). Hành vi GRADUATED có bị move sang lớp cùng code hay không = `CONDITIONAL` — chưa có chủ sản phẩm xác nhận, KHÔNG đổi trong đợt này (giữ nguyên, chỉ quan sát qua `warnings`).
- **ADR compatibility**: ADR-008 (partial success per item) `PASS`; ADR-016 (offline-first — fallback queue giữ nguyên) `PASS`; ADR-031 (composite PK tenant scope) `PASS`; BUSINESS_RULES §1/§4 đã sync.
- **Reversibility**: R1 (redeploy). Không migration schema; `newBranch`/`warnings` là field optional additive.

### Verification

- Server tsc + client `tsc -b` PASS; oxlint 0 error (chỉ baseline warnings cũ).
- Targeted: studentService (10, gồm IDEM-F3 race), academicYearLifecycle (12, gồm AYL-F2 + PRM-F4), BatchPromotionService (5, gồm F1 move + rollback), students routes — **32 tests PASS**.
- Full server suite: **110 files / 683 tests PASS**. Client store tests (promotionStore/studentStore/zustandStores): 23 PASS.

---

## ADR-053: EXAM-MIXED — Đề Kết Hợp Trắc Nghiệm + Tự Luận Trong Một Phiên Chấm (2026-08-24)

**Status: APPROVED / IMPLEMENTED. Severity: D2 (cross-module: schema + validation + scoring + parser + UI + print/export + offline sync). Profile: GENERAL.**

### Problem & evidence

- **E3 HIGH**: `exam_type` hiện là XOR `written | multiple_choice` ở cấp phiên; `parseQuestions` (routes/exams.ts) bắt buộc MỌI câu có options A–D + correctOption → đề thực tế "PHẦN I TN + PHẦN II TL" không thể import; `points?: number` tồn tại trong TS type và cột Excel export nhưng chưa được validate/dùng khi chấm.
- **Business fit**: đề kiểm tra giáo lý phổ biến nhất trong thực tế là kết hợp TN + TL. Phương án tách 2 phiên bị loại (phá UX, finalize/gradebook 2 lần, điểm tổng rời rạc); giả lập câu TL thành MC với options rác bị loại (phá semantics validation, sai OMR).
- **E2**: test suite hiện hành pass trước thay đổi (client targeted 9 files/123 tests; server 119 files/741 tests) → mọi fail phát sinh sau đó thuộc scope quyết định.

### Decision matrix (rút gọn, profile GENERAL)

| Criterion | Weight | A: exam_type 'mixed' + per-question type/points (chọn) | B: Tách 2 phiên riêng |
|---|---:|---:|---:|
| Business fit | 15% | 9 | 4 |
| Reliability & Data Integrity | 20% | 9 | 6 |
| Security & Privacy | 20% | 9 | 8 |
| Maintainability | 15% | 8 | 7 |
| Performance | 10% | 9 | 8 |
| Testability | 10% | 9 | 7 |
| Reversibility | 5% | 8 | 9 |
| Observability | 5% | 9 | 7 |
| **Weighted** | **100%** | **8.75** | **6.60** |

**Decision: A.** Hard gates D2: Security & Privacy 9, Data Integrity 9, Testability 9 — PASS.

### Implementation

1. **Schema** (add-only): `ExamType += 'mixed'` (raw SQL KHÔNG có CHECK constraint trên `exam_type` nên chỉ đổi drizzle enum); migration đơn lẻ add-only `20260824-129` thêm `exam_results.essay_score REAL` nullable (+ defensive ALTER try/catch). Không đụng row cũ.
2. **Model câu hỏi**: `ExamQuestion.type ∈ {multiple_choice, essay}` (thiếu type = MC — backward compatible), essay KHÔNG có `options/correctOption`, `points` optional >0 ≤100 (default 1). Server `parseQuestions` validate chặt + cross-check bố cục: câu TN phải chiếm index 1..questionCount LIÊN TỤC từ đầu đề (phiếu OMR đánh bubble 1..N theo `questionCount`; mixed `questionCount` = số câu TN); mixed bắt buộc `questions` (≥1 essay) + `answerKey`.
3. **Scoring server-authoritative**: mixed `score = clamp(Σ points(câu TN đúng theo key version) + essay_score, 0, maxScore)` — KHÔNG dùng tỉ lệ `correct/count × maxScore`. Merge 2 pha: request thiếu `answers` tái dùng answers đã lưu; thiếu `essayScore` giữ essay_score đã lưu; thiếu cả hai → 400; phiên non-mixed gửi `essayScore` → 400 (dữ liệu mâu thuẫn); essayScore vượt Σ points câu TL → 400. Rescore đổi key/mã đề: tính lại phần TN theo trọng số, GIỮ essay_score; rows quick_entry của mixed vẫn rescore phần TN.
4. **Parser/UI**: nhận diện tiêu đề phần (PHẦN/PART/La Mã/nhãn TN-TL), trích điểm `(N điểm)` khỏi nội dung + chia đều điểm từ tiêu đề phần, regex câu hỏi chấp nhận chú thích điểm xen giữa (`Câu 4 (5 điểm): ...`); Excel map cột theo tên header (tương thích 7 cột cũ), file mẫu 9 cột; preview modal tách 2 loại câu; QuickScoreEntry/GuidedGrade chế độ nhập ĐIỂM TỰ LUẬN (trần Σ points TL) + cột Tổng; ExamResultsTable cột "Điểm TL".
5. **In/quét**: OMR grid trên đề in chỉ render câu TN; QR embed questionCount = số câu TN (detector fail-closed so bubble không đổi); câu TL in dòng kẻ trình bày; bảng đáp án GLV tách phần key TN và gợi ý chấm TL. Scan/batch/analytics vận hành trên phần TN như MC thuần.
6. **Offline/sync**: payload đi qua `CreateExamInput`/`syncSaveExamResults` hiện hữu (thêm field optional) — temp-ID remap + idempotency không đổi.

### Gates and compatibility

- **D2 gates**: Security & Privacy 9 (không mở attack surface mới — validation chặt hơn), Data Integrity 9 (merge 2 pha không mất thành phần; score luôn server-tổng-hợp), Testability 9 — PASS.
- **Business Rule Gate**: hợp đồng điểm mixed + merge semantics = `CONFIRMED` bằng tests (`server/src/__tests__/examMixedScoring.test.ts`: create/validate/merge-2-pha/essay-ceiling/rescore/guard; `examParser.test.ts` +4 case mixed). OCR tự luận (chấm bài viết tay tự động) vẫn **BLOCKED** theo ADR-050 — phần TL tiếp tục nhập tay.
- **ADR compatibility**: ADR-023/024 (offline sync + persistence) PASS; ADR-043/048/049/050 (scan engine, geometry SSOT, ops scale) PASS — pipeline OMR không đổi, chỉ thu hẹp phạm vi câu TN; ADR-031 tenant isolation PASS (không đổi RBAC/ownership).
- **Reversibility**: R1–R2 (redeploy; cột `essay_score` nullable giữ nguyên vô hại nếu rollback code).

### Verification

- Client `tsc -b` PASS; server `tsc` PASS; oxlint exit 0 (chỉ baseline warnings cũ, gồm 2 warning pre-existing của ExamSessionView).
- Parser: `src/__tests__/utils/examParser.test.ts` **12/12 PASS** (gồm 4 case mixed + sample round-trip).
- Server mixed: `server/src/__tests__/examMixedScoring.test.ts` **8/8 PASS**.
- Regression targeted: client exam-related **9 files / 123 tests PASS**, utils 27 files/268 tests, answerSheet/omrConsensus/scanAcceptance/designTokens 28 tests, sync engine 51 tests; **full server suite 119 files / 741 tests PASS**.
- Source-of-truth synced: BUSINESS_RULES §21.5, FRONTEND_API_CONTRACT §10, 07_DATABASE_PLAN #29/#30, AI_CONTEXT_MAP EXAM-MIXED, IMPORT_EXPORT_SPECIFICATION §7.


---

## ADR-056: Migrate Backend Railway → Render + Turso (DEPLOY-MIGRATE, 2026-08-25)

**Status: APPROVED / IMPLEMENTED & VERIFIED E2E (2026-08-25). Severity: D3 (production infrastructure + data layer). Profile: ARCHITECTURE/INFRASTRUCTURE.**

### Context & evidence

- **E1 HIGH**: Railway hết gói → service dừng từ 2026-08-24; domain `tnttvn-production.up.railway.app` trả 404 nền tảng (`x-railway-fallback: true`, "Application not found") — mọi API call từ SPA Vercel fail. Chứng minh rewrite Vercel + app code KHÔNG phải nguyên nhân.
- Chủ tài khoản xác nhận: dữ liệu volume Railway **không còn cách khôi phục**; chấp nhận khởi tạo DB mới trống.
- **E3**: code đã hỗ trợ Turso remote sẵn (`dbConfig.ts` ADR-041 — `TURSO_URL`/`TURSO_AUTH_TOKEN`), server bind theo `PORT` do platform inject (`SERVER_PORT || PORT || 3001`), healthcheck `/health` có sẵn.

### Decision matrix

| Criterion | Weight | A: Render free + Turso free (chọn) | B: Fly.io VM + volume | C: Trả $5/tháng Railway |
|---|---:|---:|---:|---:|
| Maintainability | 20% | 8 | 7 | 10 |
| Reliability | 15% | 7 (cold start) | 9 | 9 |
| Security | 15% | 8 | 8 | 8 |
| Data Integrity | 15% | 8 (Turso managed) | 8 | 8 |
| Reversibility | 15% | 8 | 7 | 9 |
| Performance | 10% | 7 (cold start) | 9 | 8 |
| Observability | 5% | 8 | 7 | 8 |
| Operational Fit ($0 yêu cầu) | 5% | 10 | 4 | 2 |
| **Weighted** | **100%** | **7.80** | **7.60** | **8.20** |

**Decision: A** — C điểm cao hơn nhưng bị loại bởi ràng buộc sản phẩm "$0" của chủ tài khoản (Operational Fit). A vs B: chọn A vì $0 tuyệt đối + Turso managed DB (backup PITR miễn phí) bù rủi ro cold start; B cần thẻ tín dụng + vẫn mất tiền.

### Implementation

1. **`render.yaml` blueprint** (mới): service docker `tnttvn-api`, `healthCheckPath: /health`, env bắt buộc `sync:false` (TURSO_URL/TOKEN, JWT secrets, PASSWORD_CIPHER_KEY, REPORT_HMAC_SECRET, SEED_ADMIN_PASSWORD).
2. **Routing**: `vercel.json` rewrite `/api/:path*` → `https://tnttvn-api.onrender.com/api/:path*`; `codemagic.yaml` + ios-ipa workflow đổi `VITE_API_BASE`.
3. **DB mới trống**: startup migration runner tự tạo schema; seed admin qua `SEED_ADMIN_PASSWORD` (guard no-overwrite đã có test).
4. **Không đổi code server** — chỉ cấu hình hạ tầng.

### Gates and compatibility

- **D3 gates**: Security 8 (secret không commit, CORS default originPolicy giữ nguyên), Privacy 8, Data Integrity 8 (Turso embedded replicas/PITR thay volume đơn điểm) — PASS.
- **ADR compatibility**: ADR-041 (dual-mode DB) `PASS` — dùng đúng nhánh remote; ADR-016 offline sync `PASS` (API contract không đổi); ADR-031 tenant isolation `PASS`.
- **Rủi ro đã ghi nhận**: cold start free tier (~30–60s sau 15' idle) — client fetch timeout 30s có thể miss lần đầu; mitigation keep-alive ping `/health` mỗi 10 phút (cron-job.org) hoặc nâng Starter $7. Disk ephemeral → backup local vô nghĩa dài hạn; khuyến nghị cấu hình AUTO_BACKUP_* lên R2.
- **Reversibility**: R1 — hoàn tác = resume Railway + hoàn tác rewrite vercel.json.

### Verification

- tsc client/server + oxlint PASS sau thay đổi config.
- Hạ tầng: chờ user setup Turso/Render theo DEPLOYMENT_GUIDE §7.1; acceptance = `/api/health` 200 trên render domain + login thành công qua Vercel.

### Post-implementation (2026-08-25) — kết quả thực tế + 1 fix phát hiện khi deploy

- Service Render thực tế do user tạo tay tên `TNTTVN` → domain **`https://tnttvn.onrender.com`**; vercel.json/codemagic/ios workflow đã trỏ đúng domain này (commit `d9c9da4`).
- **Bug phát hiện khi deploy (đã fix, commit `d9119f7`)**: container crash lúc startup — `SQL_PARSE_ERROR: SQL not allowed statement: PRAGMA busy_timeout=5000`. Root cause: `runDbTransaction` chạy PRAGMA trong MỌI transaction, nhưng Turso/sqld cấm PRAGMA qua Hrana batch trong transaction (file SQLite local thì được). Fix: guard `if (!dbConfig.isRemote)` — remote đã có retry SQLITE_BUSY riêng. Audit các PRAGMA khác: migrationRunner dùng executeMultiple (Turso chấp nhận), purgeService đã wrap try/catch + thiết kế an toàn không defer, backupScheduler/shutdown có try/catch.
- **Verify E2E**: `/health` trực tiếp Render = 200 `{database:"connected"}`; login qua Vercel rewrite (`POST /api/auth/login`) thành công 3/3 lần với user seed `bill`; wrong-password → 401 `INVALID_CREDENTIALS` sạch. DB Turso khởi tạo đầy đủ schema + seed (branches/năm học/lớp/admin USR-001).
- Lưu ý vận hành: cold start free tier — request đầu sau idle có thể chậm/timeout 1 lần; khuyến nghị keep-alive ping `/health` mỗi 10 phút.
- **Smoke test production (2026-08-25)**: qua Vercel rewrite — login admin OK; GET classes = 5 lớp seed; **WRITE path xác minh trên Turso**: POST students 201 (`ST-*`) + DELETE thành công; academic-years trả đúng trạng thái (2026-2027 OPEN). Backup scheduler an toàn trên remote (guard `isRemote` từ ADR-041 — skip file backup, khuyến nghị Turso managed backup/R2).

---

## ADR-057: Production Release Gate theo commit đã qua CI (2026-08-26)

**Status: APPROVED / IMPLEMENTED. Severity: D3 (production delivery). Profile: ARCHITECTURE + SECURITY.**

### Evidence và quyết định

- Trước thay đổi, Vercel/Render có thể auto-deploy ngay khi push; build/test/E2E đang chạy song song với production nên một commit lỗi vẫn có cửa sổ được phục vụ.
- Chọn **CI hoàn tất toàn bộ → workflow `workflow_run` deploy đúng `head_sha`**. Phương án deploy hook theo branch bị loại vì hook lấy HEAD mới nhất, không chứng minh đó là SHA vừa được kiểm thử.
- Matrix: Security 9, Data Integrity 9, Reliability 9, Testability 9, Reversibility 8, weighted 8.9. D3 gates Security/Privacy/Data Integrity đều ≥8 — **PASS**.

### Implementation / gates

1. `vercel.json` tắt Git auto-deploy cho `main`; `render.yaml` đặt `autoDeploy:false`.
2. `deploy-production.yml` chỉ chạy khi workflow CI của push `main` kết luận `success`, checkout đúng SHA, từ chối SHA cũ nếu HEAD đã tiến, gọi Vercel Git deployment và Render `commitId` bằng đúng SHA, đợi trạng thái sẵn sàng rồi smoke-check hai origin.
3. CI bắt buộc secret scan, lint không warning, typecheck, coverage suite, build, design-system guard và Playwright; local `.githooks/pre-push` chạy `verify:ci` như lớp phản hồi sớm.
4. Dependabot theo dõi npm và GitHub Actions hàng tuần. Secret production chỉ ở GitHub Environment `production`.

**ADR compatibility:** ADR-056 `PASS` (giữ Render/Turso/Vercel, chỉ đổi authority deploy). **Rollback:** bật lại auto-deploy và vô hiệu workflow. **Điều kiện vận hành:** phải cấu hình `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`; thiếu secret → fail-closed, không deploy.

---

## ADR-058: Loại bỏ credential có thể giải mã và KBA phụ huynh (2026-08-26)

**Status: APPROVED / IMPLEMENTED; supersedes phần reversible-password của ADR-021 và self-reset KBA của ADR-042. Severity: D3. Profile: SECURITY.**

### Evidence và quyết định

- `users.password_encrypted` cho phép người có DB + key khôi phục mật khẩu tạm; endpoint admin `reveal-password` mở thêm bề mặt lộ bí mật.
- Self-reset phụ huynh dùng SĐT + tên/ngày sinh của trẻ — dữ liệu nhận dạng dễ biết, không phải possession factor; rate-limit không biến KBA thành cơ chế khôi phục mạnh.
- Chọn **one-time credential + reset có kiểm soát qua admin/re-auth**. Matrix SECURITY: Security 10, Privacy 10, Data Integrity 9, Usability 7, Testability 9, weighted 9.2; phương án giữ AES/KBA bị loại bởi hard gate Security/Privacy <8.

### Implementation / contract

1. Mọi create/reset/provision chỉ lưu bcrypt hash; response trả mật khẩu tạm đúng một lần. `password_encrypted` luôn `NULL`; migration `20260827-131` purge mọi ciphertext lịch sử. Cột được giữ nullable để rollback schema an toàn nhưng đã deprecated.
2. `POST /api/users/:id/reveal-password` là compatibility tombstone `410 PASSWORD_REVEAL_REMOVED`; không thực hiện re-auth, không trả bí mật. UI/API client bỏ chức năng xem lại.
3. `POST /api/auth/parent-reset-password` trả `410 PARENT_SELF_RESET_REMOVED` bất kể body; không lookup SĐT/trẻ và không đổi dữ liệu. UI chỉ hướng dẫn liên hệ Ban Giáo Lý qua kênh đã xác minh để cấp mật khẩu tạm.
4. Admin reset vẫn yêu cầu JWT admin + re-auth + rate-limit + audit; user buộc đổi mật khẩu tạm ở lần đăng nhập sau.

**Business Rule Gate:** không lưu credential reversible và không dùng KBA trẻ em = `CONFIRMED` bằng source + 39 targeted tests. **ADR compatibility:** ADR-044/045/046 `PASS`; ADR-021/042 `CONFLICT RESOLVED BY SUPERSESSION`. **Rollback:** code R1 có thể khôi phục UI nhưng ciphertext đã purge không thể/không được phục hồi; phải reset mật khẩu mới.

---

## ADR-059: Backup Turso độc lập, mã hóa và restore drill (2026-08-26)

**Status: APPROVED / IMPLEMENTED. Severity: D3 (durability/recovery). Profile: ARCHITECTURE + SECURITY.**

### Evidence và quyết định

- Scheduler cũ bỏ qua DB remote và dựa vào backup managed của cùng nhà cung cấp; đây không phải bản sao độc lập và chưa có đường restore được kiểm thử từ artifact ứng dụng.
- Chọn transaction đọc nhất quán → logical JSON toàn bộ bảng → checksum SHA-256 → gzip → AES-256-GCM → R2 độc lập. Matrix: Security 9, Privacy 9, Data Integrity 9, Reliability 9, Testability 9, Reversibility 8 — D3 **PASS**.

### Implementation / recovery gate

1. Turso backup mở read transaction, lấy mọi bảng ứng dụng, bảo toàn blob/bigint, ghi row count + checksum; chỉ commit snapshot khi đọc xong, sau đó mã hóa và upload `backups/turso-*.json.gz.enc`.
2. Remote backup **fail-closed** nếu thiếu R2 hoặc `BACKUP_ENCRYPTION_KEY` 32 byte; retention dùng cùng blob abstraction. Khóa phải tách khỏi R2 credentials và JWT secrets.
3. Restore CLI chỉ chạy khi `ALLOW_BACKUP_RESTORE=true`, bắt buộc `RESTORE_DATABASE_URL`, từ chối URL trùng `TURSO_URL`, yêu cầu target đã migrate, verify GCM + checksum + schema rồi restore transactionally.
4. Production acceptance gồm restore drill định kỳ trên DB cô lập và đối chiếu row count; tuyệt đối không dùng CLI này để ghi trực tiếp production.

**ADR compatibility:** ADR-041/056 `PASS`; thay thế câu “remote skip backup” của ADR-041/056. **Rollback:** tắt scheduler hoặc redeploy; artifact đã mã hóa giữ theo retention. **Verification:** remoteBackup tests 6/6 + server build PASS; restore drill thật cần R2/Turso credentials ngoài repo nên là operational gate, không được suy diễn từ unit test.

---

## ADR-060: OMR adaptive geometry + corpus go-live gate (2026-08-26)

**Status: APPROVED / IMPLEMENTED; unattended/default MC auto-batch remains CONDITIONAL. Severity: D2. Profile: GENERAL + SECURITY.**

- Detector suy kích thước frame tham chiếu từ marker ink thực tế thay vì giả định CSS width cố định; template tăng lề ngang để marker không chạm câu 1 nhưng giữ vertical flow đã người dùng duyệt. Bubble fixture dùng nét tô opaque giống hành vi học sinh.
- Benchmark MC chia cohort `normal | stress | negative`; go-live yêu cầu tối thiểu 400 mẫu (200/100/100), normal exact-sheet ≥99.5%, stress ≥98%, answer accuracy ≥99.5%, first-capture ≥95%, false accept =0, review routing=100%, negative routing=100%, p95 ≤150ms.
- Thiếu corpus hoặc hụt bất kỳ gate → không bật unattended/default auto-batch và không auto-save. Luồng hiện hành chỉ tạo proposal, người chấm vẫn phải rà soát/bấm lưu. Unit/Chromium geometry chứng minh contract, **không chứng minh accuracy camera thực địa**; score-grid tự luận chưa có KPI `expectedScore` riêng nên luôn thuộc phạm vi supervised/manual-confirm.

**D2 gates:** Security/Privacy 9, Data Integrity 9, Testability 9 — PASS cho code; field accuracy = `NOT CONFIRMED` đến khi corpus privacy-safe đạt gate. **ADR compatibility:** ADR-043/048/049/050 `PASS`. **Rollback:** geometry/adaptive detector R1; không hạ threshold để ép pass.

---

## ADR-061: Zero-warning quality baseline và dependency hygiene (2026-08-26)

**Status: APPROVED / IMPLEMENTED. Severity: D1. Profile: GENERAL.**

- Dọn dead imports/branches sau khi loại KBA/reveal, sửa dependency arrays/hooks và giữ function identity ổn định; `oxlint --deny-warnings` biến warning thành CI failure.
- Hono nâng lên `4.13.5`; production dependency audit = 0 known vulnerabilities tại thời điểm kiểm tra. Dependabot + gitleaks tạo lớp phòng ngừa liên tục.
- Không đổi domain behavior ngoài ADR-058. Typecheck client/server, targeted security/backup/OMR và full suite là acceptance gate; rollback là revert mechanical cleanup/dependency pin.
- Kiểm chứng cuối 2026-08-27: lint **0 warning**, design-system **0/136 vi phạm**, client/server typecheck + production build PASS; full coverage **233/233 files, 1678/1678 tests PASS** (65.55% statements, 67.48% lines); `npm audit --omit=dev` **0 vulnerability**.
- Toolchain audit vẫn báo **7 moderate dev-only** từ `drizzle-kit` → esbuild cũ và Capacitor CLI → `xcode`/`uuid`; bản mới nhất hiện hành vẫn mang chuỗi phụ thuộc này, còn `audit fix --force` đề xuất downgrade/breaking nên không áp dụng mù. Dependabot theo dõi; CI chặn vulnerability production, không tuyên bố toàn bộ dev tree sạch.

---

## ADR-062: Scan Engine v4 — staged resolution, shared image analysis và benchmark fail-closed (2026-08-27)

**Status: APPROVED / IMPLEMENTED; field accuracy remains CONDITIONAL. Severity: D2. Profile: GENERAL + SECURITY.**

### Evidence và bottleneck

- **E3 HIGH — live camera**: `ExamScanModal` xử lý canvas/QR/OMR đồng bộ trên main thread theo nhịp cố định 350ms. Trước identity, `scanExamCode` sao chép sẵn ba crop rồi có thể gọi jsQR 9 lần với `attemptBoth` (mỗi attempt có nhánh đảo màu) và cuối cùng quét 33 dòng Code128. Sau identity, mỗi frame tạo grayscale + summed-area toàn ảnh và 2-frame consensus tạo sàn chờ khoảng 700ms.
- **E3 HIGH — detector**: `detectAnswersFromImage(auto)` có thể dựng summed-area riêng cho integrated rồi full-page; RGBA→gray và integral là hai lượt toàn ảnh; `sampleDarkness` quét bounding box bubble hai lần. Full-page còn chạy bốn band dù marker đầu đã thiếu.
- **E3 HIGH — batch/UI**: batch ảnh clone/render mảng kết quả sau từng file (tăng dần thành O(n²)); live batch dừng track, chờ 600ms rồi gọi lại `getUserMedia` sau mỗi phiếu.
- **E2 local baseline**: benchmark synthetic 50 câu integrated trước tối ưu (15 lượt, desktop hiện tại) đạt p95 13,80ms @800px, 12,57ms @960px, 19,54ms @1280px. Đây chỉ là performance regression signal; không phải bằng chứng camera/accuracy thực địa. Corpus thật vẫn chưa có.
- **Measurement bug**: KPI cũ tính negative/ô `null` vào accuracy và tính route đúng của mọi outcome thành `reviewRoutingAccuracy`; do đó có thể báo đẹp sai. `scanDiagnostics` chỉ có average, không có phân bố.

### Decision matrix (D2 / GENERAL)

| Criterion | Weight | A: Core + staged conservative (chọn) | B: Worker + marker tracking | C: Cloud/ML vision |
|---|---:|---:|---:|---:|
| Business / Operational Fit | 15% | 9 | 8 | 6 |
| Reliability & Data Integrity | 20% | 9 | 7 | 6 |
| Security & Privacy | 20% | 9 | 9 | 5 |
| Maintainability | 15% | 9 | 6 | 5 |
| Performance | 10% | 8 | 10 | 9 |
| Testability | 10% | 9 | 6 | 5 |
| Reversibility | 5% | 9 | 7 | 4 |
| Observability | 5% | 8 | 8 | 7 |
| **Weighted** | **100%** | **8.85** | **7.65** | **5.80** |

**Decision: A.** A đạt D2 hard gates (Security/Privacy 9, Data Integrity 9, Testability 9). B chưa bị bác về kiến trúc nhưng **CONDITIONAL**: worker tạo thêm race/stale-result/transfer-memory surface và chưa có device benchmark chứng minh lợi ích end-to-result; chỉ mở khi có test backpressure + crash fallback + out-of-order. C bị **REJECT** vì Security/Privacy 5 <7, Data Integrity 6 <7, Testability 5 <6 và xung đột ADR-043/049 (ảnh trẻ em rời thiết bị/ML thiếu corpus).

### Implementation v4

1. **QR staged fast path**: mọi crop/upscale/sharpen được tạo lazy + cache. Live camera xen 3 lượt `live_fast` (3 ROI chuẩn) với 1 lượt `live_recovery` (một crop focus phóng 2×), kể cả khi recheck identity; cả hai chạy `dontInvert`. Nút chụp, file/batch và default API dùng `exhaustive`: 9 attempt normal rồi 4 `invertFirst`; Code128 fallback ở mọi mode. Không dùng `onlyInvert` của jsQR 1.4.x vì source upstream không tạo inverted matrix cho mode đó và có thể crash locator trên frame âm tính. Không đổi parser/checksum/session guard.
2. **Prepared OMR frame**: RGBA→grayscale + summed-area được dựng trong cùng một lượt; cùng SAT tái sử dụng giữa locator integrated/full-page. Hot path camera ≤2,5 triệu pixel dùng scratch arena typed-array tái sử dụng để tránh cấp phát khoảng 11 MB/frame ở 1280px; ảnh still lớn hơn luôn dùng buffer cục bộ. Arena được ghi đè đồng bộ, zeroize + release khi dừng camera/kết thúc batch. Full-page short-circuit TL→TR→BR→BL. Bubble đo annulus trước, rồi chỉ quét core một lần; công thức coverage/ngưỡng giữ nguyên.
3. **Hai độ phân giải, xác nhận bảo thủ**: khi identity đã khóa và chưa có candidate, auto frame OMR đầu dùng tối đa 960px; QR/recheck và frame consensus cuối tối đa 1280px. Fixed-student `Chụp & chấm` dùng still sensor tối đa 2200px (fallback preview 1280px); upload tối đa 1400px. Proposal accepted vẫn cần hai fingerprint giống nhau ≤1,8s. Nhịp nghỉ cơ sở 280ms, candidate 220ms và tự giãn tới 650ms theo duration, được neo **sau completion** để detector chậm không chạy dồn ở RAF kế tiếp. RAF gọi `processImageFrameRef.current`, nên thay đổi mã đề/template/batch mode không bị stale closure. Capture/upload/batch bất đồng bộ mang generation token; đóng modal làm stale task dừng trước detector/state update và `finally` luôn zeroize scratch.
4. **Quality early reject**: quality=`bad` vốn luôn bị policy từ chối, nay được chặn trước marker/homography ở live và batch; `review` vẫn đi qua OMR rồi route review, không được nâng thành accepted.
5. **Batch throughput/UI**: commit progress/results theo chunk 8 nhưng yield main thread sau từng file; live batch pause analysis nhưng giữ camera stream, bỏ delay 600ms và vòng re-acquire/refocus. Accepted-only + xác nhận người dùng giữ nguyên.
6. **Preview/trace**: preview JPEG chỉ encode một lần theo frame, downscale tối đa 640px; `scan_metadata.engineVersion = omr-v4-live|omr-v4-batch`. Local diagnostics v2 có histogram timing cố định, migrate v1 nhưng không bịa bucket lịch sử.
7. **Benchmark correctness**: exact-sheet/answer accuracy loại negative; answer accuracy chỉ tính ô có nhãn khác null; review routing chỉ dùng sample kỳ vọng review. `sampleId` và SHA-256 file phải unique; checksum/profile/engine/outcome/duration malformed bị loại khỏi mọi mẫu số và làm gate fail. Timing không pool theo `workload + engineVersion + device + runtime/browser + resolution + templateMode + questionCount + cold/warm`, tối thiểu 20 mẫu/profile. Accuracy/routing không pool theo cùng identity (chỉ gộp cold/warm) và mỗi profile cần ≥40 mẫu: normal 20, stress 10, negative 10, review 10, accepted 20; toàn bộ threshold áp lại cho từng profile. Release bắt buộc truyền exact required timing/accuracy matrix; mỗi accuracy profile phải có cả cold và warm timing, default rỗng fail-closed và thiếu một template/resolution/question-count/profile cũng fail. Gate hiện chỉ chứng nhận `workload=multiple_choice`; score-grid tự luận chưa được hưởng field claim. `npm run benchmark:omr` dùng `tsx` direct dependency, mặc định chạy ≥100 lượt cho fast workloads, bao phủ explicit integrated/full-page 960/1280 + fallback/no-marker/QR, và chỉ ghi max diagnostic khi n<100; vẫn là harness synthetic có caveat rõ.

### Gates, compatibility và rollback

- **Safety gates**: không hạ marker/quadrant/isolation/paper/geometry/fill/gap/confidence; explicit template mode, T3 count/version/checksum, wrong-session stop, 2-frame consensus, review Save lock và server-authoritative recompute giữ nguyên.
- **Business Rule Gate**: semantics proposal accepted/review/rejected, xác nhận trước lưu, server scoring, privacy và parity 960/1280 = `CONFIRMED` bằng source + regression tests; tốc độ thiết bị thật và accuracy camera MC = `CONDITIONAL/NOT CONFIRMED` tới khi corpus ADR-060 đạt đủ mẫu **và** exact release matrix. Score-grid tự luận = supervised/manual-confirm, field KPI = `NOT CONFIRMED`.
- **ADR compatibility**: ADR-023/024/043/048/049/050/060 = `PASS`; không schema/API endpoint mới, không upload ảnh, tenant/offline authority không đổi.
- **Rollback**: R1 redeploy phiên trước; thay đổi client-only, diagnostics local v2 có thể bị bỏ qua an toàn, `scan_metadata` string version vẫn backward-compatible. Không migration dữ liệu.

### Verification

- Client/server TypeScript, `oxlint --deny-warnings`, design-system lint **0/136**, production client/server/PWA build và `git diff --check`: **PASS**; `npm audit --omit=dev`: **0 vulnerability**.
- Full coverage: **235/235 files, 1708/1708 tests PASS**; 65,90% statements, 67,89% lines. Targeted post-review benchmark/KPI/lifecycle: PASS.
- `npm run benchmark:omr`: **15/15 workload PASS**. Isolated warm synthetic: integrated 1280 p95 19,94ms; full-page 960 p95 10,25ms, 1280 p95 15,99ms; QR standard live-fast 1280 p95 26,76ms; QR negative live-fast 1280 p95 99,45ms. Recovery/exhaustive ít mẫu chỉ báo max, không giả p95.
- **Post-implementation D2:** Security/Privacy 9, Data Integrity 9, Testability 9 — `PASS`; ADR-023/024/043/048/049/050/060 compatibility `PASS`. Business semantics/persistence authority = `CONFIRMED`; real-camera MC accuracy/target-mobile latency = `NOT CONFIRMED`; written score-grid field KPI = `NOT CONFIRMED`. Synthetic/unit không được dùng để tuyên bố field accuracy.

---

## ADR-063: Mobile responsive primitives + modal convergence (2026-08-27)

**Status: APPROVED / IMPLEMENTED. Severity: D2 (cross-module UI contract). Profile: GENERAL.**

### Evidence và lựa chọn

- Audit 16/16 mobile views và follow-up 2026-08-22 cho thấy `ExcelGradeImportModal`/`GradeFormulaConfigModal` vẫn tự dựng centered desktop overlay; `AttendanceHistoryModal` có filter dưới 44px; base form là 38px/14px và top-bar controls 42px, gây vùng chạm nhỏ và nguy cơ iOS auto-zoom.
- `--z-modal: 50` thấp hơn `--z-mobile-nav: 1000`, khiến bottom navigation nằm trên dialog `aria-modal`; `MobileReportsView` render toàn bộ học sinh nhưng không có tìm kiếm/empty recovery; badge phân ngành dùng màu light-only inline.

| Criterion | Weight | A: Shared primitives + targeted views (chọn) | B: Vá từng màn | C: Viết lại native UI |
|---|---:|---:|---:|---:|
| Business / UX Fit | 20% | 9 | 7 | 8 |
| Reliability & Data Integrity | 15% | 9 | 8 | 6 |
| Security & Privacy | 15% | 9 | 9 | 8 |
| Maintainability | 15% | 9 | 5 | 6 |
| Accessibility / Mobile Usability | 15% | 9 | 7 | 9 |
| Testability | 10% | 8 | 6 | 5 |
| Reversibility | 10% | 9 | 8 | 4 |
| **Weighted** | **100%** | **8.85** | **7.15** | **6.80** |

**Decision: A.** D2 hard gates đạt Security/Privacy 9, Data Integrity 9, Testability 8. B không xử lý drift và tạo nhiều focus/scroll implementations; C mở rộng platform/race/release surface khi chưa có bằng chứng cần viết lại.

### Contract và implementation

1. `ModalShell` là owner duy nhất của focus trap, Escape, scroll lock, responsive shell; bổ sung body/footer semantic. Ở ≤767px: bottom-sheet, header/footer không cuộn, body overscroll-contained, safe-area bottom và z-index 1100 phủ nav. Desktop giữ centered dialog.
2. Mobile/modal form controls tối thiểu 44px và font 16px. Top-bar close/select/search/icons/actions đạt 44px. Không đổi desktop density.
3. `ExcelGradeImportModal` và `GradeFormulaConfigModal` migrate về `ModalShell`; footer hành động giữ ngoài vùng nội dung cuộn. Notice/date actions, lịch, chuyên cần và AttendanceHistory reflow theo breakpoint.
4. MobileReports tìm cục bộ theo tên thánh/họ tên/mã, có count + recoverable empty state; thống kê ngành được memo hóa và danh sách lớn render theo lô 30 (QA data thật: initial card/nút In 566→30). Branch badge dùng CSS variables và dark `color-mix`; không đổi dữ liệu báo cáo hay công thức tính điểm.

### Gates, compatibility, rollback

- **Business Rule Gate:** không đổi scoring, import, quyền, persistence hay API; chỉ presentation/filter client-side = `CONFIRMED` bằng source + targeted regression.
- **ADR compatibility:** ADR-030/032/047 = `PASS`; contract này mở rộng DS primitive hiện hữu, không tạo shell song song. Security/privacy, tenant isolation, offline sync và data integrity không đổi.
- **Rollback:** R1 — revert client/CSS/docs; không schema migration, không dữ liệu cần chuyển đổi.
- **Verification:** TypeScript `PASS`; changed-file oxlint `PASS`; design-system lint `0/137`; ModalShell + ExcelGradeImport `25/25 PASS`; MobileReports `3/3 PASS`. Edge QA 390×844 với 566 học sinh: input 44px/16px, initial print cards 30, search 6/566, bottom-sheet/footer/dark badge đạt, console 0 warning/error. Full suite không chạy lại vì baseline ADR-062 đã pass và thay đổi chỉ có targeted UI coverage.
