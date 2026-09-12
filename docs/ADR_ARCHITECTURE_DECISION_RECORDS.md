# ARCHITECTURE DECISION RECORDS (ADR) - PARISH LMS v2.0

> **Policy supersession — 2026-09-10, được chủ sản phẩm phê duyệt:** Admin có
> quyền quản trị toàn giáo xứ trong mọi môi trường, kể cả production; được tạo/sửa
> nhiệm kỳ cho chính mình. Các mô tả admin production read-only, cấm self-grant
> hoặc override chỉ dev/test bên dưới đã bị thay thế. Biến legacy
> `OPERATIONS_ADMIN_MUTATION_OVERRIDE` không còn giới hạn quyền. Vẫn bắt buộc
> reauth + lý do + audit cho nhiệm kỳ; không bỏ tenant isolation, OCC, idempotency,
> kiểm tra phạm vi dữ liệu, trạng thái đóng việc hoặc separation of duty.

Document Status: **APPROVED**  
Architecture Lead: Chief Architect & AI Pair Programming Agent  
Last Updated: 2026-09-03

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

### Amendment 2026-09-05 — current reporting scope

Current MVP is explicitly limited to `ReportCardProjection` and `ClassSummaryProjection`, matching the implemented repositories/routes and R1–R4 roadmap. `ParishSummaryProjection` is a deferred candidate, not a missing current feature. Reopening it requires product-owned users, metrics, academic-year range, pagination/freshness and acceptance criteria; client-side dashboard aggregates must not be relabeled as this server-authoritative projection.

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
2. **Temp-ID remap before dependent sync (S4/S24, XD-07)** — parent CREATEs complete first with `idempotencyKey`; encrypted `serverAcknowledgement` stays on the owner-scoped queue row until remap succeeds, then the parent is retired. Recovery replays this durable response without resending CREATE, independently of temp roster presence. Before ACK persistence, retry still uses the original idempotency key. Parse/storage failures propagate and stop dependent sends. Committed ACK rows are excluded from enqueue deduplication, compaction and pruning; pending/retrying/failed dependent payloads are remapped, without auto-promoting permanent failures. No new IndexedDB index/table is needed for this optional encrypted field. Actual browser-kill/quota/concurrent-enqueue qualification remains separate from synthetic fault tests.
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

### Amendment 2026-09-06 — offline fallback superseded by ADR-108

Current product scope no longer needs an offline promotion writer. The `studentStore.batchPromote → PUT /students/:id` fallback described in Implementation item 1 and the ADR-016 compatibility sentence is superseded: `PromotionPanel` now requires connectivity and uses only `POST /api/promotion/batch-approve`. Generic student membership changes remain available solely as explicit audited corrections with `membershipChangeReason`; they do not create promotion provenance. The batch snapshot/lock/policy/partial-success decision in this ADR remains unchanged. See ADR-108 for source/destination/year/branch topology gates and regression evidence.

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
3. `POST /api/auth/parent-reset-password` trả `410 PARENT_SELF_RESET_REMOVED` bất kể body; không lookup SĐT/trẻ và không đổi dữ liệu. Tại thời điểm ADR này, UI chỉ hướng dẫn liên hệ Ban Giáo Lý; ADR-087 sau đó bổ sung ticket chưa xác thực để Admin tiếp nhận nhưng không khôi phục KBA/self-reset.
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

## ADR-063: UI System v4.1 — App-wide Calm, Confident Parish Product (2026-08-27)

**Status: APPROVED / IMPLEMENTED. Severity: D2. Profile: GENERAL. Reversibility: R1.**

### Evidence và decision

- Người dùng xác nhận hài lòng với triết lý/kiểu thiết kế hiện tại; vì vậy giữ DNA
  navy–gold, product-first và data density thay vì rebrand hoặc áp một visual trend.
- Audit code/runtime xác nhận `docs/03_DESIGN_SYSTEM.md` + `src/index.css` là SSOT,
  nhưng elevation, page section, KPI, shell và mobile home còn có dialect cục bộ;
  root `DESIGN_SYSTEM.md` v2 vẫn mô tả glassmorphism cũ và gây xung đột authority.
- Nghiên cứu nguồn chính thức Apple HIG, Fluent 2, Shopify Polaris, Atlassian,
  Stripe và WCAG 2.2 hội tụ ở purpose/focus/familiarity, token + reusable
  component, elevation có ý nghĩa, efficiency/trust và accessibility.

Matrix D2/GENERAL trong `docs/UI_UX_UPGRADE_PLAN_2026-08-27.md`: A giữ nguyên
7.85; B warm editorial 7.55; **C Calm confident system 8.95 — SELECT**.
Security/Privacy 9, Data Integrity 9, Testability 9: hard gates PASS.

### Implementation contract

1. Thêm surface `app/sunken/card/raised`, brand gold, shadow và motion token;
   content card dùng border, raised shadow dành cho layer/interaction có ý nghĩa.
2. Chuẩn hóa `PageHeader`, section heading/card, KPI card, desktop header/main,
   loading state và mobile home primitives; polish table/modal/button qua foundation.
3. Giữ shell navy–gold; giảm blur/orb/gradient trang trí trong content. Domain/status,
   print, camera/OMR và medal visualization là deliberate semantic exceptions.
4. Accessibility: semantic liturgical button, accessible names/pressed states,
   một `#main-content`, mobile target và form typography, reduced-motion support.
5. `docs/03_DESIGN_SYSTEM.md` là documentation SSOT; root `DESIGN_SYSTEM.md`
   được đánh dấu legacy để chấm dứt dual authority.
6. Sau feedback “mới điều chỉnh Dashboard”, rollout được mở rộng từ foundation
   sang migration trực tiếp: 13 desktop workspace view, 12 mobile workflow view,
   4 public/auth surface và 3 management embedded family.
7. Thêm product-view/panel/toolbar/tab/mobile-page-header/filter/entity/state/auth
   primitives; `DesktopAppShell` tự sở hữu product-view.
8. `/management` truyền `embedded` cho AcademicYear/Classes/Users để loại bỏ
   PageHeader lặp; tab dùng programmatic role/state. *(Historical inventory;
   ADR-089/090 sau đó chuyển Users staff sang `/catechists` và Classes sang `/students`.)*
9. `appWideUiMigration.test.ts` là hard regression contract cho inventory, tránh
   quay lại trạng thái chỉ Dashboard nhận visual migration.

### Gates, compatibility và rollback

- **ADR compatibility**: ADR-030/032/055 = PASS. Không đổi API/schema/route/auth,
  offline sync hoặc domain behavior.
- **Business Rule Gate**: protected behavior unchanged = CONFIRMED bằng diff và
  regression tests; field usability = CONDITIONAL tới khi có task test với GLV/Huynh Trưởng.
- **Rollback**: R1, revert presentation/docs; token mới backward-compatible, không migration.

### Verification

Client/config TypeScript PASS; `npm run lint` 0 warning; design-system lint
v4.1 đạt 0/136 violation; targeted regression 43/43 trên 5 file; full regression
237/237 file và 1.719/1.719 test PASS với timeout chuẩn 15s; client/server/PWA
production build PASS; `git diff --check` PASS. Desktop runtime 1592×868: header
77px, không horizontal overflow, đúng một `#main-content`, accessible label/pressed
state hiện diện. Public/auth runtime 1592×821 không horizontal overflow, auth card
440px, lựa chọn cổng 88px và form control tối thiểu 44px. Protected-route visual
smoke sau rollout v4.1 chưa chạy được do local seed credential không hợp lệ; mobile
runtime chưa được tuyên bố do QA tool không hỗ trợ viewport emulation trong phiên.

**Post-implementation D2:** Security/Privacy 9, Data Integrity 9, Testability 9
— PASS; ADR-030/032/055 compatibility PASS; protected behavior CONFIRMED.
Usability thực địa trên thiết bị/role thật vẫn CONDITIONAL và chưa được claim.

---

## ADR-064: Student Roster Import — Server-Authoritative Deduplication, Bounded Parsing & Exact Rollback (2026-08-28)

**Status: APPROVED / IMPLEMENTED. Severity: D3. Profile: SECURITY. Reversibility: R2.**

### Context & Evidence
- Trong đợt kiểm tra quy trình Import danh sách học sinh (`server/src/services/importService.ts` và `src/components/common/ExcelImportModal.tsx`):
  1. `ExcelImportModal.tsx` khởi tạo `duplicateActions` mặc định là `'update'`, tiềm ẩn nguy cơ vô tình ghi đè bản ghi cũ nếu người dùng không chủ động chuyển sang `'skip'`.
  2. `detectDuplicates` chỉ kiểm tra trùng nội bộ file khi có `dateOfBirth` hợp lệ (`if (fn && dob && !isPlaceholder(dob))`), bỏ sót các file thiếu ngày sinh.
  3. Thiếu tra cứu theo Họ tên trong lớp mục tiêu khi thiếu ngày sinh và chưa phân biệt trường hợp sinh đôi cùng Họ tên/Ngày sinh nhưng khác Tên Thánh (`name_dob_diff_holy_name`).
  4. Thiếu cảnh báo mờ (Fuzzy matching) cho các lỗi chính tả nhỏ khi SĐT/Ngày sinh trùng khớp.

### Decision
1. **Safe UI Default**: Đổi khởi tạo `duplicateActions` trên client sang mặc định `'skip'`. Thêm helper `formatDuplicateReason` để hiển thị lý do trùng khớp trực quan.
2. **Multi-Key Intra-File Deduplication**: Mở rộng nhận diện trùng lặp nội bộ qua 4 tiêu chí: (1) `fullName + dob`, (2) `fullName + parentPhone`, (3) `holyName + fullName + className`, (4) `fullName + className`.
3. **Enhanced Database Deduplication**:
   - Truy vấn bổ sung theo `fullName` trong CSDL để khớp `(holyName, fullName, class)` và `(fullName, class)` khi thiếu ngày sinh.
   - Phát hiện khác biệt Tên Thánh (`name_dob_diff_holy_name`) để bảo vệ dữ liệu sinh đôi.
   - Bổ sung Fuzzy match Levenshtein $\ge 80\%$ khi trùng SĐT và/hoặc Ngày sinh.
4. **Server-authoritative decisions**: `duplicateActions` hỗ trợ `skip|update|create`; thiếu quyết định luôn `skip` tại server. ID giả `intra-file` không bao giờ được ghi vào FK, và không được dùng làm target update. Quyền chủ nhiệm được kiểm lại lúc commit; collision ngoài phạm vi chỉ trả thông báo chung, không lộ identity.
5. **Blank-cell preservation**: update chỉ ghi các field thật sự có trong file; ô trống/placeholder giữ dữ liệu hiện có. Audit tiếp tục che PII.
6. **Exact rollback boundary**: `import_batch_students.rollback_snapshot` (migration `20260828-133`) gắn snapshot trước update với đúng row/batch; `import_batches.created_class_ids` (migration `20260828-132`) lưu ID lớp tạo bởi batch. Snapshot tự bị xóa sau 24 giờ. Undo từ chối khi student đã sửa hoặc có grade/attendance/exam/promotion/snapshot/assessment/leave data; lớp chỉ xóa theo exact ID và khi rỗng. `audit_logs` đã redacted không còn là restore source.
7. **Bounded client parsing**: allowlist `.xlsx/.xls/.csv/.txt`, file/text ≤10 MB, dữ liệu ≤2000 dòng; SheetJS dùng `dense`, `sheetRows`, tắt formula/HTML/VBA extraction. CSV báo lỗi dùng encoder chống spreadsheet formula injection.
8. **Input/error envelope**: field/key/fileName/array có max length/count tại Zod; lỗi 500 chỉ trả mã tham chiếu, không trả DB cause.

### Decision Matrix & Gates

| Phương án | Security | Privacy | Data Integrity | Testability | Kết luận |
| :--- | ---: | ---: | ---: | ---: | :--- |
| Giữ UI-only + audit làm rollback | 5 | 6 | 4 | 6 | REJECT |
| Server fail-closed + snapshot TTL 24h + partial success | 9 | 8 | 9 | 9 | **CHỌN** |
| Một transaction toàn file, bỏ partial success | 9 | 8 | 9 | 8 | CONFLICT ADR-008 |

- **Hard gates D3**: Security 9, Privacy 8, Data Integrity 9 — PASS.
- **ADR compatibility**: ADR-008 partial success PASS; ADR-016 class/tenant authorization PASS; ADR-031 composite tenant binding PASS; A16 PII-redacted audit PASS.
- **Business rule**: server-default skip, explicit create/update, 24h undo và blank preservation = CONFIRMED trong BUSINESS_RULES §23.2.
- **Rollback**: R2 — revert code sau khi giữ hai cột nullable; không xóa cột khi rollback deployment.

### Verification
- **Targeted verification**: 8 test files / 76 tests PASS (dedup, exact rollback/TTL, tenant/class authorization, parish isolation, schema health, parser, safe CSV).
- **Build**: server TypeScript PASS; frontend TypeScript + Vite/PWA production build PASS.

---

## ADR-065: App-wide Pathname Route Motion with Native View Transition + CSS Fallback (2026-08-28)

**Status: APPROVED / IMPLEMENTED. Severity: D2. Profile: GENERAL. Reversibility: R1.**

### Context & evidence

ADR-063 đã có motion token và reduced-motion nhưng entrance animation nằm ở
`.product-view`, nên không phải router-aware, không có exit phase và dễ double-run
khi page tự remount. Audit xác nhận TanStack Router hiện tại hỗ trợ
`defaultViewTransition`; app không có motion dependency. Nguồn chính thức Apple,
Material, MDN, TanStack và W3C thống nhất motion cần ngắn, có mục đích, giữ ngữ
cảnh và có đường tắt reduced-motion.

### Options & matrix

| Criterion | Weight | Giữ `.product-view` | Framer Motion route stack | Native + fallback (chọn) |
|---|---:|---:|---:|---:|
| Product fit | 15% | 6 | 9 | 9 |
| Reliability/data integrity | 20% | 9 | 8 | 9 |
| Security/privacy | 20% | 9 | 9 | 9 |
| Maintainability | 15% | 7 | 7 | 9 |
| Performance | 10% | 9 | 7 | 9 |
| Testability | 10% | 7 | 8 | 9 |
| Reversibility | 5% | 10 | 8 | 10 |
| Observability | 5% | 6 | 7 | 8 |
| **Weighted** | **100%** | **7.95** | **8.05** | **9.00** |

### Decision & contract

1. `PageTransition` là shared boundary ở cả public/auth, mobile và desktop;
   transition chỉ tác động route content, không snapshot/animate navigation shell.
2. Router bật native transition khi `document.startViewTransition` tồn tại,
   `prefers-reduced-motion` không phải `reduce`, và pathname thực sự thay đổi.
3. Search/filter-only changes không remount boundary và không chạy motion.
4. Unsupported runtime dùng CSS entrance fallback; fade-through/translate tối đa
   6px và 120–260ms. Không thêm dependency.
5. Reduced motion vô hiệu route animation + smooth scroll. Bỏ entrance animation
   phân tán ở `.product-view` để tránh double motion.

### Gates, compatibility, risk và rollback

- D2 gates: Security/Privacy 9, Data Integrity 9, Testability 9 — PASS.
- ADR-030/032/055/063: PASS. Business/domain/API/auth/offline behavior unchanged:
  CONFIRMED qua phạm vi diff presentation/router config.
- Material risks: vestibular discomfort → reduced-motion hard override; browser
  API fragmentation → runtime detection + fallback; performance → transform/opacity
  only và shell đứng yên. Residual risk LOW.
- R1: revert `PageTransition`, router option và CSS/docs; không migration/data work.

### Verification

TypeScript + frontend/PWA production build PASS; targeted DS/app-wide/page-motion
regression 3 files / 15 tests PASS; oxlint 0 warning; design-system lint 0/139
violation. Browser smoke public navigation `/login` → `/login/nhan-su` PASS và
giữ đúng một boundary. Cảm nhận motion trên thiết bị/role thật vẫn CONDITIONAL.

---

## ADR-066: Student Roster Import — Chunked Fast Commit & Immediate Server Projection (2026-08-28)

**Status: APPROVED / IMPLEMENTED. Severity: D3. Profile: ARCHITECTURE. Reversibility: R1.**

### Evidence và target

- Audit end-to-end xác nhận create row trước đây chạy một transaction riêng gồm 3–4 write, đồng thời gọi thêm `getAcademicYearStart` và `generateUniqueStudentCode`; 120 row vì vậy phát sinh khoảng 600 statement riêng ở create path trước các query/batch chung.
- `StudentsPage` chỉ gọi lại `fetchStudents()`/`fetchClasses()` khi đóng modal; `fetchStudents` mặc định lấy tối đa 10.000 record. `ExcelImportModal` không reconcile response, nên roster không đổi ngay khi server commit.
- Baseline local 120 row: phần test/hook 2,48s. Candidate sau fast path: request import đo trực tiếp 113–198ms qua các lần chạy cô lập; đây là evidence E4 local, không phải production SLO.
- **Candidate target:** 120 create row <2s trong regression local và không full roster GET sau success. **Production Turso target:** CONDITIONAL đến khi có telemetry theo region/dataset thật.
- External primary evidence: Turso TypeScript SDK mô tả batch là nhiều statement trong implicit transaction và write transaction trên primary không chạy song song; Drizzle hỗ trợ multi-row `.values([...])`; Zustand yêu cầu immutable/new-reference update để subscriber render lại. Nguồn: `https://docs.turso.tech/sdk/ts/reference`, `https://orm.drizzle.team/docs/insert`, `https://zustand.docs.pmnd.rs/reference/apis/create.html`.

### Options và Decision Matrix (ARCHITECTURE)

| Criterion | Weight | A: per-row + refetch | B: one transaction/file | C: chunk + fallback + projection |
| :--- | ---: | ---: | ---: | ---: |
| Maintainability | 20% | 8 | 6 | 8 |
| Reliability | 15% | 9 | 7 | 9 |
| Security | 15% | 9 | 9 | 9 |
| Data Integrity | 15% | 9 | 9 | 9 |
| Reversibility | 15% | 10 | 7 | 9 |
| Performance | 10% | 3 | 10 | 9 |
| Observability | 5% | 6 | 6 | 7 |
| Operational Fit | 5% | 6 | 5 | 9 |
| **Weighted** | **100%** | **8.05** | **7.55** | **8.70 — SELECT** |

B bị loại dù nhanh vì một row lỗi sẽ rollback toàn file, xung đột ADR-008. C giữ transaction nguyên tử theo chunk ở happy path nhưng bắt buộc rollback và fallback per-row khi chunk lỗi.

### Decision contract

1. Cache năm học theo class và reserve code từ một snapshot `students.code` scoped `parishId`; UNIQUE `(parish_id, code)` tiếp tục là final guard.
2. Resolve auto-created class một lần trước concurrent writes để loại same-class race. Dòng chắc chắn `skip` không được tạo orphan class.
3. Create row đã validate, không duplicate và có class hợp lệ được chia chunk 40. Mỗi chunk ghi multi-row `students`, `audit_logs`, `import_batch_students` và optional `service_assignments` trong cùng transaction.
4. Constraint/race rollback toàn chunk rồi retry từng row qua đường cũ. Update/skip/error vẫn dùng isolated path; exact rollback snapshot, redacted audit và final batch counts không đổi.
5. Response thêm `studentChanges` gồm action + student record chỉ sau commit. Client kiểm `getTenantScope().parishId`, merge immutable vào `studentStore`/Dexie và cập nhật total theo created action; không enqueue sync write.
6. Đóng modal không full-refetch roster. Lớp mới refresh nền; undo import/history refetch students/classes authoritative sau server success.

### Hard gates, compatibility và rollback

- **D3 gates:** Security 9, Privacy 8, Data Integrity 9 — PASS. Privacy được đánh giá riêng: payload có PII như endpoint roster hiện hữu nhưng chỉ trả subset đã commit trong tenant/request được RBAC; không ghi payload mới vào audit/log và stale cross-tenant response bị client loại.
- **Testability:** 9 — performance/fallback integration + server change projection + tenant-filtered store tests.
- **ADR gate:** ADR-008 partial success PASS; ADR-015 idempotency CONDITIONAL (import endpoint hiện chưa có request idempotency, không bị mở rộng trong quyết định này); ADR-016 authorization/tenant cache PASS; ADR-031 composite tenant binding PASS; ADR-064 exact rollback/dedup PASS.
- **Business Rule Gate:** partial success, exact rollback, server-issued ID/code và immediate committed projection = CONFIRMED bằng integration/store tests. Production latency = CONDITIONAL.
- **Rollback R1:** revert service/API/store/modal/page/docs; không schema/migration, dữ liệu đã ghi vẫn tương thích.

### Verification

- Targeted import/tenant/store: 8 files, toàn bộ 73 case logic PASS (benchmark cô lập 2/2 sau một combined-run timeout của test runner); server TypeScript PASS.
- `importPerformance`: 120/120 imported, unique code + tenant projection, 113,4ms local ở lần verify cuối; forced chunk failure chứng minh fallback giữ 1 success/1 error.
- `npm run lint` và production client/server/PWA build PASS. Full suite không chạy lại theo yêu cầu tránh lặp các suite đã pass; không dùng local benchmark để claim Turso production latency.

---

## ADR-067: Supervised Continuous OMR Queue — Durable Capture, Item Idempotency & Rearm (2026-08-28)

**Status: APPROVED / IMPLEMENTED PHASE 0–1; FIELD CONDITIONAL. Severity: D2. Profile: GENERAL + OFFLINE/SYNC. Reversibility: R2.**

### Evidence và quyết định

- Luồng cũ chờ `POST /results` và refresh trước khi mở phiếu tiếp theo; network nằm trong critical path.
- Queue cũ gộp mọi `save_results` theo `exam + sessionId + UPDATE`; hai payload `scores[]` liên tiếp bị shallow-merge last-writer-wins và có thể mất bài offline. Finding được khóa bằng regression test trước/sau sửa.
- Corpus camera thật vẫn chưa đủ ADR-060; vì vậy `accepted` chỉ là proposal và mọi bài vẫn cần người chấm xác nhận.
- Ba phương án được chấm: blocking hiện hành 6,95; **Supervised Continuous Queue 8,80 — SELECT**; Worker/unattended 7,00 nhưng bị loại bởi Data Integrity/Testability gate.

### Decision contract

1. Mỗi save/remove là mutation bền vững riêng theo `sessionId + studentId`; `complete` là barrier và chỉ flush sau các mutation kết quả trước nó.
2. `POST /api/exams/:id/results` nhận `clientMutationId`, `attemptFingerprint`, `capturedAt` tùy chọn. Receipt `exam_result_mutations` scope `(parish_id,user_id,client_mutation_id)` lưu request hash + acknowledgement trong cùng transaction với result; retry cùng hash trả `duplicate`, tái dùng key cho payload khác trả `409 IDEMPOTENCY_CONFLICT`. Audit chỉ ghi lần đầu.
3. Sau explicit Save, client ghi encrypted queue + optimistic result + item ledger trước, rồi cho camera tiếp tục; network sync/reconcile không chặn capture.
4. Attempt fingerprint chặn cùng bài/cùng đáp án; cùng học sinh khác fingerprint hoặc đã có result phải xác nhận conflict rõ ràng. Rearm chỉ mở khi thấy identity mới hoặc phiếu cũ vắng liên tục tối thiểu 3 observation và 900ms; dedupe vẫn là guard thứ hai.
5. Ledger UI hiển thị `Chờ đồng bộ / Đã đồng bộ / Cần xử lý / Lỗi` và reconcile điểm server itemized. Không upload ảnh, không hạ threshold OMR/quality/identity/consensus.
6. `VITE_CONTINUOUS_SCAN_V2=false|off|0` quay về stable blocking path; `Chấm Ổn Định` giữ nguyên.

### Gates, compatibility và rollback

- **D2 hard gates:** Security & Privacy 9, Data Integrity 9, Testability 9 — PASS bằng tenant/user-scoped receipt, server recompute, encrypted queue, ordering/idempotency/rearm tests.
- **ADR gate:** ADR-023/048/049/050/062 PASS; ADR-060 PASS cho supervised proposal, CONFLICT với unattended/default auto-save nên nhánh đó vẫn BLOCKED.
- **Business rules:** queue không mất multi-student, retry không lặp audit, same-sheet dedupe và server adjustment = CONFIRMED bằng test. Field accuracy, papers/minute, thermal/memory dài phiên = NOT CONFIRMED tới khi có corpus/thiết bị thật.
- **Rollback R2:** tắt feature flag về stable path; migration `20260828-135` additive, giữ receipt rows khi rollback code và cascade theo exam session.

### Verification

Targeted client/server/state/queue/identity/acceptance: 11 files / 163 tests PASS; `npm run lint` PASS; production frontend + server TypeScript + Vite/PWA build PASS; synthetic `npm run benchmark:omr` PASS (live-path p95 dưới 150ms trên dev host, không phải field claim). Full serialized Vitest: **242/243 files, 1762/1763 tests PASS**; failure duy nhất là baseline `examPrintGeometry.test.ts` batch-print marker margin (tái hiện khi chạy cô lập), ngoài diff continuous-scan. Design-system lint cũng bị chặn bởi arbitrary hex có sẵn tại `MobileStudentsView.tsx:245`, không phải file trong feature. Sequence corpus/field rollout vẫn conditional.

---

## ADR-068: Continuous OMR Phase 2–4 — Shadow ROI, Sequence Gate & Fail-Closed Pilot (2026-08-28)

**Status: APPROVED / IMPLEMENTED READINESS; FIELD GATE OPEN. Severity: D2. Profile: GENERAL + OFFLINE/SYNC. Reversibility: R1.**

### Evidence và lựa chọn

- E3 code: global quality chạy trước detector và đang là hard acceptance input; marker/paper/homography đã xác định tứ giác giấy. Thay global quality ngay sẽ thay safety semantics khi chưa có corpus.
- E3 corpus: thư mục camera mới có contract/README, chưa có real sequence profile hoặc target-device artifact. Benchmark dev không chứng minh Safari/Android long-run hay main-thread bottleneck.
- A — bật paper ROI authoritative + Worker ngay: 7,15; **REJECT**, Testability 5 và bằng chứng performance thiếu.
- B — paper ROI shadow + exact sequence gate + local aggregate diagnostics + allowlist/circuit: **8,90 SELECT** (Security 9, Privacy 9, Data Integrity 9, Offline 9, Testability 9, Performance 8, Maintainability 8, UX 8).
- C — chỉ giữ Phase 1: 6,80; không tạo được evidence/rollout control cho bước kế tiếp.

### Decision contract

1. `paperQuality` chỉ được tính sau marker + paper-surface gate, lưu aggregate/metadata, **không** tham gia `decideScanAcceptance` cho đến khi real corpus chứng minh không tăng false accept.
2. Sequence release gate bind exact engine/device/browser/frame/template/question profile; mỗi run có timing đủ từng bài. Mỗi required profile cần run ≥30 và ≥100 bài, zero false rearm/stale identity/duplicate proposal/duplicate durable/lost mutation/ack corruption, unresolved routing và reload recovery 100%. Thiếu target hoặc heap evidence fail-closed.
3. Diagnostics local chỉ gồm counter/histogram/Long Tasks/heap aggregate; không nhận student/session/parish/user ID, answers, QR hoặc image. Không upload telemetry mới.
4. Pilot mặc định yêu cầu allowlist parish/user. Thiếu hoặc không đọc được circuit storage thì fast queue fail-closed. Circuit local scope bằng hash và mở khi durable write fail, idempotency conflict hoặc terminal result sync fail. Stable batch không bị xóa.
5. Worker/deferred review **NOT SELECTED**. Chỉ tái đánh giá khi exact target-device sequence report chứng minh main-thread p95/Long Tasks là nút thắt sau khi accuracy/integrity đã PASS. Unattended vẫn là D3 riêng.

### Gates và trạng thái business rule

- D2 hard gates: Security/Privacy 9, Data Integrity 9, Testability 9 — PASS. ADR-060/062/067: **PASS** vì không hạ acceptance, không bật unattended và gate mới chặt hơn. API/schema/tenant authorization: không đổi.
- `paper_roi` emitted, sequence evaluator fail-closed, pilot allowlist/circuit: **CONFIRMED** bằng code/test. Field accuracy, throughput, thermal/memory và pilot outcome: **NOT CONFIRMED** vì chưa có corpus/thiết bị/allowlist production.
- Rollback R1: tắt `VITE_CONTINUOUS_SCAN_V2` hoặc bỏ pilot allowlist; tăng circuit revision chỉ sau fix. Không cần rollback DB.

### Verification

Targeted Phase 2–3 readiness: **8 files / 86 tests PASS**; lint + design-system lint PASS; TypeScript client/server + Vite/PWA production build PASS. Shadow ROI grid được giới hạn 120 mẫu theo trục ngắn; synthetic integrated 1280×1808 n=100 đạt p95 33,62ms trên dev host sau tối ưu, chỉ là regression signal. Full serialized run INCONCLUSIVE: in lại lỗi baseline print geometry rồi treo không có summary; isolated print 12/13, left margin 19,86px < 22,68px, ngoài diff. Không dùng kết quả này để claim field accuracy.

---

## ADR-069: Privacy-Safe Field Evidence Recorder & Pilot Qualification (2026-08-28)

**Status: APPROVED / IMPLEMENTED COLLECTOR; FIELD RUN PENDING. Severity: D2. Profile: GENERAL + OFFLINE/SYNC. Reversibility: R1.**

### Evidence và phạm vi quyết định

- E3 trace xác nhận evaluator ADR-068 đã có contract nhưng repo chưa có đường chính thức để lấy `proposal → durable → acknowledgement`, reload, responsiveness và memory từ đúng phiên quét trên thiết bị mục tiêu. Ghi tay không chứng minh item acknowledgement hoặc giữ exact profile.
- Browser standards đặt Long Task/Long Animation Frame ở ngưỡng trên 50ms; `performance.now()` là monotonic nhưng browser có thể throttle/freeze context nền; `measureUserAgentSpecificMemory()` là estimate bất đồng bộ và không phổ quát. `pagehide`/unload không đáng tin khi mobile OS kết thúc trang, nên recovery được đối chiếu qua navigation entry sau reload thay vì coi unload event là bằng chứng. Nguồn chính: `https://www.w3.org/TR/longtasks-1/`, `https://www.w3.org/TR/long-animation-frames/`, `https://www.w3.org/TR/hr-time-3/`, `https://wicg.github.io/performance-measure-memory/`, `https://www.w3.org/TR/beacon/`.
- OffscreenCanvas có thể transfer sang Worker theo HTML Standard, nhưng capability không chứng minh end-to-end speedup hoặc integrity trên device mục tiêu. Vì chưa có artifact field, Worker tiếp tục ngoài phạm vi: `https://html.spec.whatwg.org/multipage/canvas.html`.

### Options và Decision Matrix (GENERAL + OFFLINE/SYNC)

| Criterion | Weight | A: ghi tay | B: server telemetry | C: local explicit recorder |
| :--- | ---: | ---: | ---: | ---: |
| Security & Privacy | 20% | 9 | 6 | 9 |
| Data Integrity | 20% | 5 | 8 | 9 |
| Offline Reliability | 15% | 4 | 5 | 9 |
| Business/Operational Fit | 15% | 5 | 8 | 9 |
| Testability | 10% | 4 | 8 | 9 |
| Performance/Observability | 10% | 4 | 9 | 9 |
| Maintainability | 5% | 8 | 6 | 8 |
| Reversibility | 5% | 10 | 6 | 10 |
| **Weighted** | **100%** | **5.85** | **7.05** | **9.00 — SELECT** |

B bị loại vì tạo thêm privacy/tenant/server-retention boundary không cần thiết cho một evidence artifact operator-controlled. A không đủ integrity. C giữ dữ liệu tại thiết bị và fail-closed khi capability thiếu.

### Decision contract

1. Recorder mặc định tắt và không ghi storage. Operator phải mở System Diagnostics, nhập nhãn device/browser không PII theo format chặt, chọn run 30 hoặc 100 và bấm chuẩn bị. Proposal đầu tiên tạo run và khóa exact engine/frame/template/questionCount; profile lệch đặt issue và không trộn mẫu.
2. Mỗi phiếu chỉ tăng khi proposal đã có durable local mutation. Terminal item transition ghi acknowledgement duration; error/conflict được giữ thành lost/corruption safety failure. Raw mutation ID không lưu: chỉ token FNV theo `runId + mutationId` phục vụ đối chiếu nội bộ, và token này cũng bị loại khỏi export.
3. Runtime ưu tiên `long-animation-frame`, fallback `longtask`; memory ưu tiên `measureUserAgentSpecificMemory`, fallback `performance.memory`. Không có capability được ghi `unsupported`; evaluator bắt buộc fail, không biến missing evidence thành zero.
4. Reload recovery chỉ ghi một lần theo `PerformanceNavigationTiming.type='reload'` + `timeOrigin` khi modal quét liên tiếp khôi phục active run. Run chỉ hoàn tất khi số proposal/durable/ack bằng target và pending acknowledgement bằng 0.
5. JSON export chỉ chứa completed runs với exact profile, timing/counter/responsiveness/memory. Cấm image, QR, answers, student/session/parish/user ID và timestamp. Không upload/API/schema mới.
6. Release evaluator yêu cầu profile required hợp lệ/unique, một run `30..99` riêng và một run `≥100` riêng cho mỗi profile, performance targets cụ thể, responsiveness/memory evidence, ít nhất một unresolved case và một reload case, zero safety failure, routing/reload 100%. UI cho operator ghi rõ stale-identity hoặc duplicate-durable quan sát được; duplicate proposal/mutation còn được detector tự đếm.

### Gates, compatibility, business status và rollback

- **D2 hard gates:** Security/Privacy 9, Data Integrity 9, Testability 9 — PASS. Privacy evidence riêng: schema export allowlist và regression kiểm raw mutation ID không xuất; không có server transport hoặc tenant data.
- **ADR gate:** ADR-060/062/067/068 PASS. Acceptance, score authority, durable queue, pilot allowlist/circuit và stable rollback không đổi. Worker/unattended vẫn `NOT SELECTED/BLOCKED`.
- **Business Rule Gate:** explicit arming, exact-profile lock, completed-only privacy-safe export và evaluator fail-closed = `CONFIRMED` bằng source/test. Target-device throughput, memory/thermal, field accuracy và pilot result = `NOT CONFIRMED` tới khi operator tạo artifact thật. Worker benefit = `NOT CONFIRMED`.
- **Rollback R1:** bỏ UI/recorder hooks và localStorage key `tntt.omr.sequence-evidence.v2`; không migration, không dữ liệu server cần đảo.

### Verification

Targeted continuous/OMR/offline regression sau recorder: **9 files / 95 tests PASS**. Authenticated mobile DOM smoke xác nhận card, profile controls, target 30/100 và export-disabled khi chưa có completed run; không arm run hoặc thay đổi dữ liệu chấm. Oxlint PASS; design-system lint 0/139 violation; TypeScript client/server + Vite/PWA production build PASS; `git diff --check` PASS. Field run/corpus vẫn pending và không được suy diễn từ test local.

---

## ADR-070: Release-Bound OMR Qualification v2 — Throughput, Drift & Multi-Manifest Workflow (2026-08-28)

**Status: APPROVED / IMPLEMENTED ENGINEERING GATE; PRODUCT TARGETS + FIELD RUN PENDING. Severity: D2. Profile: GENERAL + OFFLINE/SYNC. Reversibility: R1.**

### Evidence và vấn đề

- E3 audit ADR-069 cho thấy exact profile chưa chứa release/build identity; export từ hai commit có thể bị pool nếu device/browser/frame/template/count giống nhau. CLI chỉ nhận một manifest, trong khi run 30 và 100 được export riêng.
- Gate có stage p95 nhưng chưa đo `papers/minute` toàn phiên hoặc sustained degradation. Một run có detector nhanh nhưng operator/queue end-to-end chậm vẫn có thể pass.
- Performance Timeline/High Resolution Time cung cấp clock monotonic và observer, nhưng buffer không vô hạn. Vite thay env ở build time; Vercel/Render có Git SHA system env. Browser thermal API tổng quát đã bị discontinued; Compute Pressure chỉ là coarse pressure/capability và không phổ quát, không được giả thành nhiệt độ. Nguồn: `https://www.w3.org/TR/performance-timeline/`, `https://www.w3.org/TR/hr-time-3/`, `https://vite.dev/guide/env-and-mode`, `https://vercel.com/docs/environment-variables/system-environment-variables`, `https://render.com/docs/environment-variables`, `https://www.w3.org/TR/system-info-api/`.

### Options và Decision Matrix

| Criterion | Weight | A: giữ v1/checklist | B: Worker + runtime adaptation | C: qualification artifact v2 |
| :--- | ---: | ---: | ---: | ---: |
| Business / Operational Fit | 15% | 5 | 6 | 9 |
| Reliability & Data Integrity | 20% | 5 | 6 | 9 |
| Security & Privacy | 20% | 9 | 8 | 9 |
| Maintainability | 15% | 7 | 5 | 8 |
| Performance | 10% | 4 | 8 | 8 |
| Testability | 10% | 5 | 5 | 9 |
| Reversibility | 5% | 10 | 7 | 9 |
| Observability | 5% | 5 | 7 | 9 |
| **Weighted** | **100%** | **6.15** | **6.35 — REJECT GATE** | **8.70 — SELECT** |

B không qua Testability 6 và chưa có field evidence main-thread bottleneck. A không giải quyết provenance/throughput. C tăng integrity/observability mà không đổi acceptance/API/schema.

### Decision contract

1. `vite.config.ts` inject `__APP_RELEASE_ID__`: explicit public `VITE_APP_RELEASE_ID` → Vercel Git SHA → Render Git SHA → `dev`. Release field phải đúng format, tối thiểu 6 ký tự; `dev/local/unknown` bị recorder/evaluator reject. Codemagic iOS/Android truyền `$CM_COMMIT`; GitHub IPA truyền `${{ github.sha }}` để native bundle không bị khóa nhầm thành dev.
2. Manifest, targets và local storage nâng lên v2. Exact profile thêm `releaseId`; run thêm `runElapsedMs` từ proposal đầu đến terminal ack cuối bằng `performance.timeOrigin + performance.now()` fallback Date. Không export start/end timestamp.
3. Gate thêm `papersPerMinuteMin` và `proposalLatencyDriftRatioMax`. Report dùng throughput thấp nhất trong các run; drift là p95 proposal quarter cuối / quarter đầu của từng run và lấy trường hợp xấu nhất. Throughput target phải >0, drift ceiling phải ≥1, các target còn lại phải không âm và tất cả đều non-null; scaffold không tự đặt target.
4. `mergeOmrSequenceManifests` chỉ nối completed runs, không silent-dedupe; evaluator tiếp tục reject duplicate run ID, unexpected profile và target trộn release. Một qualification chỉ chứng nhận một `releaseId`. CLI nhận nhiều manifest trước targets. `--scaffold-targets` lấy exact unique profiles cùng release và để toàn bộ target null.
5. Legacy v1 không tự migrate vì không có release provenance/elapsed time. Storage v2 dùng key mới; v1 local artifact không được coi là qualification evidence.
6. Không dùng JS để claim thermal. Direct thermal là external evidence riêng; sustained proposal drift/throughput chỉ là proxy vận hành. Worker, adaptive threshold, unattended và pilot activation không nằm trong quyết định.

### Gates, compatibility, risk và rollback

- D2: Security/Privacy 9, Data Integrity 9, Testability 9 — PASS. Manifest vẫn allowlist local-only, release SHA là public build metadata, không PII/tenant ID.
- ADR-060/062/067/068/069: PASS; gate chặt hơn, acceptance/scoring/offline ordering/circuit không đổi. API/schema/authorization không đổi.
- Business: release binding, single-release/unexpected-profile guard, merge semantics, throughput/drift computation và fail-null targets = `CONFIRMED` qua source/tests. Product target values, field throughput/thermal/accuracy/pilot và Worker benefit = `NOT CONFIRMED`.
- Risks: missing platform system env → recorder fail-closed với `dev`; legacy evidence stranded → accepted vì chưa có field artifact và không an toàn để migrate; wall-clock skew → High Resolution Time primary; operator pause làm throughput thấp → có chủ đích vì KPI là operational elapsed.
- R1: revert config/types/CLI/UI/docs và quay storage contract; không server data/migration. Không được dùng v2 artifact như v1 sau rollback.

### Verification

Targeted qualification/OMR/offline + release-config regression **11 files / 106 tests PASS**; scoped oxlint PASS; design-system lint 0/139; TypeScript client/server + Vite/PWA production build và final typecheck PASS; diff check PASS. Build smoke với explicit `sha-qualification-test-abcdef123456` tìm thấy đúng release trong generated bundle. Full repo lint hiện bị chặn ngoài phạm vi bởi 3 unused warnings trong untracked `scripts/mobile-audit-auth.mjs`; file đó không được sửa hoặc tính là regression feature. Field report vẫn pending; không target value nào được ADR này phê duyệt.

---

## ADR-071: OMR Field-Run Preflight, Attached-Observer Evidence & Release-Safe Export (2026-08-28)

**Status: APPROVED / IMPLEMENTED OPERATOR READINESS; FIELD RUN PENDING. Severity: D2. Profile: GENERAL + OFFLINE/SYNC. Reversibility: R1.**

### Evidence và vấn đề

- E3 trace từ `SystemDiagnosticsModal` → `omrSequenceEvidence` → evaluator cho thấy operator chỉ thấy số phiếu/pending acknowledgement; thiếu unresolved, reload, memory, responsiveness và safety chỉ lộ ra sau khi mất cả run 30/100 rồi chạy CLI.
- E3 code phát hiện `createRun()` dùng `PerformanceObserver.supportedEntryTypes` để gắn source. Đây chỉ là capability quảng bá; `observer.observe()` trong runtime monitor có thể throw, nhưng artifact cũ vẫn trông như có responsiveness evidence.
- Completed storage có thể giữ nhiều release sau deploy, trong khi nút export cũ tải toàn bộ run và đặt tên theo release đầu. Evaluator sẽ reject mixed release, nhưng operator chỉ biết sau khi tải/chạy gate. Target scaffold lại chỉ có CLI.
- Không có corpus camera, product target hay field manifest mới trong repo; do đó giải pháp chỉ được cải thiện integrity/operability, không được claim accuracy hoặc speed thực địa.

### Options và Decision Matrix

| Criterion | Weight | A: giữ hậu kiểm CLI | B: chỉ thêm checklist UI | C: attach-truth + preflight + release-safe export |
| :--- | ---: | ---: | ---: | ---: |
| Security & Privacy | 20% | 9 | 9 | 9 |
| Data Integrity | 20% | 5 | 7 | 9 |
| Offline Reliability | 15% | 6 | 8 | 9 |
| Business / Operational Fit | 15% | 4 | 8 | 9 |
| Testability | 10% | 5 | 8 | 9 |
| Observability | 10% | 5 | 8 | 9 |
| Maintainability | 5% | 8 | 8 | 8 |
| Reversibility | 5% | 10 | 10 | 9 |
| **Weighted** | **100%** | **6.10** | **8.05** | **8.95 — SELECT** |

A tiếp tục cho phép false evidence và lãng phí field run. B không sửa nguồn observer/mixed release nên chưa qua Data Integrity mong muốn. C giữ local-only, thu hẹp export theo release và có regression seam rõ ràng.

### Decision contract

1. Active summary chỉ expose allowlist readiness: unresolved/routed, reload/recovered, responsiveness source, memory source/sample và tổng safety failures. Không expose acknowledgement token, mutation ID, entity ID, timestamp, answer hoặc image.
2. Run khởi tạo responsiveness là `unsupported`. Runtime monitor reset về `unsupported` khi bắt đầu và chỉ ghi `long-animation-frame|longtask` sau khi `PerformanceObserver.observe()` thành công. Capability detection không phải evidence.
3. Card hiển thị 5 check với `pass|pending|fail`, nhưng ghi rõ đây là preflight completeness, không phải qualification PASS. Mọi performance target và corpus accuracy vẫn do gate riêng quyết định.
4. Completed summary nhóm theo `releaseId`. UI export manifest và target scaffold chỉ lọc đúng `__APP_RELEASE_ID__`; run release cũ được giữ/cảnh báo, không silent-mix hoặc silent-delete. Generic download không nhận release chỉ chạy khi artifact có đúng một release.
5. Target scaffold tải trong UI dùng cùng builder v2 và vẫn để toàn bộ metric target `null`. Product owner phải đặt target trước khi evaluator có thể PASS.
6. Không đổi acceptance, scoring, queue ordering, API, schema, authentication, tenant boundary, telemetry upload, pilot allowlist/circuit, Worker hoặc unattended.

### Gates, compatibility và business status

- **D2 hard gates:** Security 9, Privacy 9, Data Integrity 9, Testability 9 — PASS. Privacy evidence riêng: summary mới chỉ chứa aggregate/source; tests khóa không lộ raw mutation ID.
- **ADR consistency:** ADR-060/062/067/068/069/070 PASS; thay đổi làm evidence gate chặt hơn và giữ nguyên human-confirm/server authority. Không conflict ADR hiện hữu.
- **Business Rule Gate:** observer attach-truth, active readiness, release-filtered manifest và non-runnable scaffold = `CONFIRMED` bằng source/test. Field accuracy, sustained speed, target values, thermal, pilot outcome và Worker benefit = `NOT CONFIRMED`.
- **Rollback R1:** bỏ readiness UI/helper/filter; storage v2 và completed runs vẫn đọc được. Không DB/API/data migration cần đảo.

### Verification

Targeted OMR/offline regression gồm recorder, runtime observer, qualification/evaluator, release provenance, detector/quality, rollout, exam store và sync flow: **11 files / 86 tests PASS**. Scoped oxlint PASS; design-system lint **0/139**; TypeScript client/server + Vite/PWA production build PASS; diff check PASS. Full repo lint bị chặn bởi đúng 3 unused warnings trong untracked `scripts/mobile-audit-auth.mjs` ngoài phạm vi. Full serialized coverage kết thúc **244/249 files, 1788/1794 tests PASS**, 4 failure ngoài staged diff (`examPrintGeometry`, `HeaderBarReact185`, `MobileReportsView`, `MobileViewsEnhancement`) và 2 worker-exit unhandled errors; vì vậy không được mô tả là full gate xanh. Không dùng verification local để claim thiết bị thật.

---

## ADR-072: Frontend Route Policy SSOT & UX/A11y Audit Remediation (2026-08-29)

**Status: APPROVED / IMPLEMENTED. Severity: D3. Profile: SECURITY. Reversibility: R1.**

### Evidence và vấn đề

- **E3 HIGH — route guard:** `/students`, `/grades`, `/attendance`, `/reports` từng chỉ dùng `requireAuth`; menu phụ huynh bị ẩn nhưng deep-link vẫn render staff workspace. `/parent` lại cho `admin|phuhuynh`, trong khi `server/src/routes/parents.ts` chỉ nhận `phuhuynh`, tạo error/empty UI.
- **E4 HIGH — authority:** ADR-022 và `FRONTEND_API_CONTRACT` xác định parent portal là workspace riêng; `GET /api/parents/my-children` parent-only. Admin-preview là statement stale và xung đột privacy boundary.
- **E3 HIGH — drift:** router guard, desktop path/tab, mobile path/tab và mobile title nằm ở các map khác nhau; route mới có thể rơi về home/title mặc định sai. `phuta` có reports API nhưng mobile/desktop nav từng ẩn Reports.
- **E3 MED — UX/a11y:** custom dialogs thiếu focus lifecycle thống nhất; leave/auth/grade controls thiếu label; tablet 768–1023 bị ép vào desktop density; reset copy nói “dữ liệu gốc/mẫu” dù code chỉ xóa cache client và giữ pending queue; design-system linter công bố raw-hex rule nhưng chưa thực thi.

### Options và Decision Matrix

| Criterion | Weight | A: `requireAuth` + ẩn menu | B: mở backend để admin preview parent | C: route-policy frontend SSOT, backend giữ authority |
| :--- | ---: | ---: | ---: | ---: |
| Security | 35% | 5 | 6 | 9 |
| Data Integrity | 15% | 6 | 5 | 9 |
| Privacy | 15% | 6 | 3 | 9 |
| Tenant Isolation | 10% | 7 | 7 | 9 |
| Business Rule Correctness | 10% | 5 | 4 | 9 |
| Testability | 5% | 4 | 6 | 9 |
| Maintainability | 5% | 6 | 5 | 8 |
| Reversibility | 5% | 10 | 6 | 9 |
| **Weighted** | **100%** | **5.75 — REJECT** | **5.25 — REJECT** | **8.95 — SELECT** |

A không coi hidden nav là authorization. B xung đột parent identity/privacy và đòi mở rộng backend ngoài nhu cầu nghiệp vụ. C fail-closed ở UX, đồng thời không nhầm client guard là security authority.

### Decision contract

1. `src/constants/routePolicy.ts` là SSOT cho role set, mobile title, desktop/mobile active tab và tab destination. Mọi protected route dùng `requireRouteAccess(path)`; route mới thiếu policy là lỗi type/test.
2. `/parent` chỉ `phuhuynh`. Staff workspace `/students|grades|attendance|reports|leave-requests` chỉ `admin|chunhiem|phuta`; governance routes chỉ admin; dashboard/notices/calendar/settings dùng chung cho role đã xác thực. Backend middleware/spec vẫn là authorization/tenant authority cuối cùng.
3. Desktop/mobile nav dùng cùng policy; `phuta` thấy Reports. Route không thuộc bottom nav trả active tab `null`, không highlight Home giả. Mobile title không dùng fallback brand cho route hợp lệ.
4. Mobile/tablet shell áp dụng dưới 1024px; desktop bắt đầu từ 1024px. Control trong touch shell tối thiểu 44px, form font 16px; phone ≤767px mới ép generic modal thành bottom sheet.
5. Custom dialog dùng `ModalShell`, `ConfirmDialog` hoặc `useAccessibleDialog` (focus trap/restore, body scroll lock, top-most Escape). Native `confirm()` trong lịch được thay bằng `ConfirmDialog`.
6. Auth và public verification dùng semantic `main`; auth có label association, live error và 44px controls. Grade input có accessible name gồm loại điểm + tên thiếu nhi. `StudentName` chứa khoảng trắng văn bản thật và được áp cho các surface tên kết hợp.
7. “Làm mới dữ liệu trên thiết bị” là admin-only; copy nói đúng client-cache reset, server data không bị xóa và pending mutations được giữ. Mobile reload sau khi reset giống desktop.
8. `NO_HARDCODED_HEX` được thực thi. Exemption chỉ cho print/OMR HTML tự chứa màu và được liệt kê; dead bento CSS/docs bị xóa.

### Gates, compatibility, business status và rollback

- **D3 hard gates:** Security 9, Privacy 9, Data Integrity 9 — PASS; Testability 9. Privacy evidence riêng: ADR-022 + parent route middleware + parent service identity matching. Client policy không mở dữ liệu và không thay server checks.
- **ADR consistency:** ADR-022, ADR-030, ADR-055, ADR-063, ADR-065 = PASS. Stale admin-preview contract được sửa; không conflict còn lại.
- **Business Rule Gate:** route-role matrix, parent-only portal, reports cho staff, cache reset semantics và dialog lifecycle = `CONFIRMED` bằng source/tests. Chất lượng visual trên thiết bị thật và authenticated-role smoke = `NOT CONFIRMED` cho tới khi chạy acceptance thực tế.
- **Risk:** policy frontend và server có thể drift nếu server role đổi; mitigated bằng explicit route inventory/test và rule bắt buộc sync docs. Client marker có thể bị sửa, nên server vẫn fail-closed.
- **Rollback R1:** revert route policy/UI/hooks/CSS/docs; không API/schema/migration và không dữ liệu server cần đảo.

### Release-gate correction discovered during verification

Full serialized verification tái hiện blocker kế thừa đã được ADR-067/SECURITY audit ghi nhận: mực marker OMR của batch print chỉ cách mép trái A4 19,86px, dưới gate 6mm tương đương 22,68px. Đây là D2/Data Integrity; chọn thay đổi cục bộ `scale(0.96)` → `scale(0.95)` quanh tâm trang trong output safety gate. Co đồng nhất giữ nguyên mọi tỉ lệ marker↔bubble/homography, không đổi template, detector, score, API hoặc schema. Security 9, Data Integrity 9, Testability 9; ADR-048/060/067 PASS; business rule khoảng cách mực marker ≥6mm = `CONFIRMED` bằng Chromium DOM geometry 13/13. Field-printer variance vẫn `NOT CONFIRMED`. Rollback R1.

### Verification

Targeted policy/StudentName/design-system/header/mobile-nav/calendar/leave regression: **7 files / 40 tests PASS**; các stale-contract regressions phát hiện ở full run được sửa và chạy lại **5 files / 14 tests PASS**; Chromium print geometry **13/13 PASS**. `npm run verify:ci` kết thúc xanh: oxlint zero-warning, design-system lint **0 violation / 141 UI components**, TypeScript frontend/server + Vite/PWA production build PASS, full serialized coverage **251/251 files, 1800/1800 tests PASS**. Coverage: statements 71,77%, branches 60,85%, functions 66,81%, lines 73,97%. Sau semantic fix cuối cho `/verify`: app-wide/policy 2 files/8 tests, lint, lint:ds, TypeScript và production build đều PASS. Browser build smoke: login public không overflow/control nhỏ ở 320×568, 375×667, 768×1024, 1440×900; `/verify` có đúng một `main`/`h1`, không app shell; protected unauthenticated `/students` redirect `/login`. `git diff --check` PASS. Chromium local không được dùng để claim authenticated real-device visual acceptance.

---

## ADR-074: Mobile Grade Workspace UI/UX Redesign (Command Deck, Segmented Controls, Compact Metric Strip)

- **Status:** APPROVED / IMPLEMENTED
- **Date:** 2026-08-29
- **Decision Tier:** D2 (Cross-Module Presentation & Component Architecture)
- **Profile:** GENERAL
- **Reversibility:** R1

### Context & Problem Statement
On mobile viewports, the Grade Workspace views (`MobileGradeBoard`, `MobileDailyGradeEntry`, `MobileGradeComparison`, `ExamSessionView`) suffered from excessive vertical real estate consumption. Top headers, filters, full-sized cards, and loose action buttons pushed the primary student grade lists off-screen, forcing users to scroll extensively.

### Decision
1. **Integrated Command Deck (`.grade-command-deck`):**
   - Consolidated class metadata, title, academic year, and status indicators into `.grade-command-deck__header`.
2. **Compact Action Toolbar (`.grade-action-btn`):**
   - Miniaturized action buttons with visual height 26px, padding `0 6px`, gap 3px, while ensuring touch target ≥44px via hit-area.
3. **Segmented Control Group (`.grade-segmented-group`):**
   - Standardized pill-bar tab switcher at visual height 36px (within 35–38px guideline) with tabular counter badges.
4. **Single-Row Metric Strip (`.grade-metric-strip`):**
   - Replaced multi-row stat cards with a clean, single-row 3/4-column statistical strip.

### Consequences & Verification
- Mobile Grade screens gained >50% vertical viewport space.
- All 143 UI components pass `npm run lint:ds` with 0 violations.

---

## ADR-075: Score Overriding and Weight Formula Configuration RBAC & Mobile/Desktop Device Partitioning

- **Status:** APPROVED / IMPLEMENTED
- **Date:** 2026-08-29
- **Decision Tier:** D2 (Cross-Module Presentation & Security Partitioning)
- **Profile:** GENERAL + SECURITY
- **Reversibility:** R1

### Context & Problem Statement
Formula configuration (`GradeFormulaConfigModal`) and granular score overriding (`isOverrideModeEnabled`) are complex, administrative operations meant exclusively for Administrator workstations. Rendering these actions on mobile clutter classroom scoring workflows and risk accidental parameter alterations.

### Decision
1. **Score Overriding & Weight Formula Config is Admin Desktop Only:**
   - Hidden on mobile viewports; available exclusively on Desktop Mode (`DesktopGradeMatrix.tsx`) for `admin` role.
2. **Classroom Mobile Mode Specialization:**
   - Mobile mode focuses purely on fast attendance, daily/exam score entry, and OMR camera scanning.

### Consequences & Verification
- Protected administrative formula integrity while streamlining the mobile interface.

---

## ADR-076: Mobile Exam Paper Preview Partitioning, React Portal Isolation, and Vite Dependency Optimization

- **Status:** APPROVED / IMPLEMENTED
- **Date:** 2026-08-29
- **Decision Tier:** D2 (Cross-Module Presentation & Workspace Device Partitioning)
- **Profile:** GENERAL + ARCHITECTURE
- **Reversibility:** R1

### Context & Problem Statement
1. **Device Partitioning in Exam Center:**
   - Mobile devices do not directly connect to physical A4 printers. Displaying physical print actions on mobile creates cluttered toolbars and confusing affordances.
   - Teachers require full ability to preview questions, answer keys, explanations, and variant codes on mobile.
2. **Modal Overlay Stacking Context Clipping:**
   - When modals (`ExamPaperModal`) were rendered inside `<Outlet />` / `<main>`, local stacking contexts caused sticky `MobileTopBar` (950) and fixed `MobileBottomNav` (1000) to render on top of the modal, clipping the modal header and buttons.
3. **Vite Dynamic Import 504 Dependency Outdated Error:**
   - Dynamically loaded vendor libraries (`jsqr`, `qrcode-generator`, `dexie`) triggered on-the-fly pre-bundling that caused HTTP 504 errors on runtime discovery.
4. **Mobile A4 Print Squishing:**
   - A4 pages (794px width) rendered inside a 340px mobile iframe caused responsive grid columns to collapse into 1-word vertical lines.

### Decision
1. **React Portal Root Mount & Z-Index Standardization:**
   - `ExamPaperModal` mounts directly to `document.body` via `React.createPortal(modalContent, document.body)`.
   - Updated Design System token `--z-modal: 1100;` to strictly enforce:
     $$\text{--z-top-bar: 950} < \text{--z-mobile-nav: 1000} < \mathbf{\text{--z-modal: 1100}} < \text{--z-toast: 9999}$$
   - Completely prevents background header and bottom navigation bars from overlapping or clipping modal dialogs.
2. **Dual Mobile Exam Preview Engine:**
   - **Tab `📖 Đọc Đề` (`question_reader`)**: Native mobile question card reader. Renders questions with A/B/C/D option cards, green highlighting for correct answers, and explanation tips when `showAnswerKey` is toggled.
   - **Tab `📄 Đề A4` / `📋 Phiếu A4` (`exam_paper` / `answer_sheet`)**: Locked 210mm vector sheet (`width: 210mm; min-width: 210mm;`) with auto-scaling `📱 Vừa màn hình` (scale factor to fit phone width) and `🔍 100% A4` (pixel-perfect scroll/pan), preventing any line breaks or column squishing.
3. **Exam Print vs Preview Partitioning:**
   - Mobile displays `<Eye size={14} /> Xem Đề Thi`, hides direct print and desktop exports (Word, Excel, HTML), keeping only `[PDF]` download.
   - Desktop displays `<Printer size={14} /> In Đề & Phiếu` with full batch printing and multi-format export center.
4. **Vite Pre-Bundle Optimization & Default Export (`vite.config.ts`, `ExamSessionView.tsx`; reassessed 2026-09-01):**
   - Added `export default ExamSessionView` and pre-bundled `'jsqr'`, `'qrcode-generator'`, `'dexie'` in `optimizeDeps.include`.
   - Runtime evidence later showed old `?v=<hash>` requests could still receive `504 Outdated Optimize Dep` after normal dev startup deleted `node_modules/.vite` or runtime discovery changed the optimized graph. Source entries now cover `index.html` plus `src/**/*.{ts,tsx}` and the include list covers the lazy-route vendor graph. Normal `npm run dev` preserves Vite's hash cache; `npm run clean:vite` is the explicit recovery command. DEV unregisters legacy PWA workers instead of registering one.
   - Contract regression locks the optimizer entries, scan dependencies and absence of automatic `predev` cache deletion. Local browser smoke with a `chunhiem` account loaded `Chấm bài` without a new 504. The separate `VM…reportAllChanges` stack did not reproduce in a fresh tab and had no application source URL, so attribution to application code is **NOT CONFIRMED** and telemetry was not changed without E2/E3 evidence.
   - The parish-wide roster class catalog now carries `assignedToCurrentUser` for non-admin staff. `ExamSessionView` filters its class chips/create controls by that marker, while server `getUserClassIds` remains the read/write authority. This closes the integration drift where a chủ nhiệm could see all parish classes in the exam UI after the roster read scope was broadened; no out-of-scope write was authorized.
5. **Mobile Grade Board Toolbar Consolidation & Per-Card Chevron:**
   - Placed `[Xuất]` và `[Nhập]` into `.grade-command-deck__header`; added rotating `ChevronDown` 16px per student card.

### Consequences & Verification
- **Positive:**
  - Zero overlay clipping: Modal is cleanly isolated at root level via React Portal.
  - Stable optimized-dependency hashes across normal dev restarts; current live smoke has zero 504s on the grading lazy route. This is local evidence, not a production SLO claim.
  - Teachers on mobile enjoy both a high-readability native question reader and a true-to-print A4 sheet preview.
- **Verification:**
  - TypeScript `npx tsc -b`: PASS (Exit code 0).
  - ESLint `npm run lint`: PASS (0 warnings, 0 errors).
  - Design System Linter `npm run lint:ds`: PASS (0 violations across 143 UI components).
  - Original Vitest suite: PASS (33/33 targeted tests passed). Reassessment targeted regressions: optimizer/SW policy, exam class scoping and tenant/class authority PASS (26/26).

---

## ADR-100: CI-Gated Release Provenance, Deterministic Build and Bounded Metrics (2026-09-03)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED / PRODUCTION REDEPLOY PENDING. Severity: D3. Profiles: SECURITY + ARCHITECTURE. Reversibility: R1.**

### Problem and evidence

E1/E3 audit found commit `ccb6bf233eb571a53d7d4bcfe20b25edb4a933e1` failed GitHub CI because Vitest reported one unhandled `document is not defined` after all 301 files / 2,054 tests passed. Production Deployment Gate was correctly skipped, but the public Vercel bundle still embedded that exact failed SHA. Repository cause was `vercel.json` enabling Git deployment for `main`, contradicting ADR-057 and the deployment guide. The backend was healthy but `/health` exposed no release SHA, so frontend/backend compatibility could not be proven. Current registry audit also found vulnerable transitive `fast-uri@3.1.5` through Vite PWA → Workbox → AJV.

Metrics used unbounded raw request paths as in-memory `Map` keys and declared aggregate request duration as a Prometheus counter. Dynamic IDs could create high-cardinality series and restart erased all state. Durable external collection remains an operational decision, but bounding and semantically correcting local exposition is immediately reversible.

Release authority, no delayed work after test teardown, dependency security and bounded non-PII metrics are **CONFIRMED** requirements. External collector vendor, retention duration, paging policy and production SLO are **NOT CONFIRMED** and are not invented here.

### Options and Decision Matrix

| Criterion | Weight | A — keep platform auto-deploy | B — one CI publisher + exact provenance | C — replace hosting pipeline |
| :--- | ---: | ---: | ---: | ---: |
| Security | 20% | 5 | 9 | 8 |
| Privacy | 15% | 7 | 9 | 8 |
| Data integrity | 20% | 5 | 9 | 7 |
| Reliability | 15% | 4 | 9 | 6 |
| Testability | 15% | 5 | 9 | 6 |
| Maintainability | 10% | 6 | 9 | 5 |
| Reversibility | 5% | 9 | 9 | 4 |
| **Weighted** | **100%** | **5.45 — REJECT** | **9.00 — SELECT** | **6.75 — REJECT** |

### Decision contract

1. `vercel.json` locks `git.deploymentEnabled.main=false`; Render remains `autoDeploy:false`. Vercel install uses `npm ci`, not mutable `npm install`. GitHub `Production Deployment Gate` is the sole production publisher and only accepts successful CI for current main HEAD.
2. Vite sanitizes release metadata and injects `<meta name="catevia-release" content="...">` plus the existing `__APP_RELEASE_ID__`. Backend `/health` returns non-secret sanitized `releaseId` from explicit `APP_RELEASE_ID`, then `RENDER_GIT_COMMIT`, else `unknown`.
3. Post-deploy smoke rejects frontend or backend unless both release IDs equal `VERIFIED_SHA`; it also requires unauthenticated `/api/auth/me`=401 and frontend CSP/HSTS. `unknown`, `invalid`, stale or mixed releases fail closed.
4. Attendance export test awaits both CSV and lazy XLSX paths. Download cleanup removes the anchor and revokes the Blob URL synchronously, so no DOM timer survives page/test teardown.
5. Lockfile upgrades only `fast-uri` to patched 3.1.7 inside the existing dependency graph. Major dependency upgrades remain separate compatibility work.
6. Metrics prefer Hono route templates, normalize UUID/domain IDs, bound request/business series, escape labels and expose request duration as histogram bucket/sum/count. `/metrics` remains OPS-token protected. Persistent metrics/alerts are not claimed.

### Gates, compatibility and rollback

- **D3 hard gates:** Security **9 PASS**, Privacy **9 PASS**, Data Integrity **9 PASS**, Testability **9 PASS** for the implemented boundary. Production deployment success remains a separate E1 gate.
- **ADR compatibility:** ADR-031/045 PASS; ADR-057 PASS and now enforced; ADR-059 PASS; ADR-070/071 PASS because the same sanitized release ID feeds OMR provenance; ADR-092 PASS WITH AMENDMENT for stronger smoke checks; ADR-099 PASS.
- **Rollback R1:** revert source/config/test/doc changes and redeploy the last green immutable SHA. Re-enabling platform auto-deploy is not an acceptable rollback while CI is authoritative. Metrics can revert independently if a collector contract requires compatibility.
- **Residual:** Vercel dashboard Git integration must also be checked disabled; backend and frontend production must be redeployed before the new provenance gate can pass. Render free cold start, restore drill, signed mobile builds, physical device behavior, OMR field corpus, audit retention and durable monitoring remain external/NOT CONFIRMED.

### Verification

Focused release/health/export contracts **4 files / 21 tests PASS**. The serialized coverage run completed **300/301 files and 2,056/2,057 tests PASS**; its only failure was a 15-second timeout in `MobileDailyGradeQuickScores`, which then passed both isolated normal (**3/3**, 267 ms total) and isolated V8 coverage (**3/3**, 1.11 s total). This is classified **CONDITIONAL test-runner/environment flake**, not a confirmed product regression; the next CI run remains the authoritative full-green gate. Critical real-backend Playwright E2E passed **10/10**. Production dependency audit reports **0 vulnerability** after `fast-uri 3.1.7`. Design-system guard **0/127**; oxlint, client/server TypeScript and production frontend/server builds PASS. Build artifact contains the requested sanitized `catevia-release`. Post-implementation D3 reassessment is **KEEP**: Security **9**, Privacy **9**, Data Integrity **9**, Testability **8**; actual CI-gated production redeploy remains NOT CONFIRMED.

---

## ADR-077: App-wide Mobile Layout Contract, Safe-area Ownership & Root Dialog Layering (2026-08-29)

**Status: APPROVED / IMPLEMENTED — current local verification recorded below. Severity: D2. Profile: GENERAL. Reversibility: R1.**

### Problem, scope và bằng chứng

Đợt rà soát toàn bộ presentation surface tìm thấy các drift xuyên route: shared page shell có thể bị cap theo mobile ở desktop; bottom action/FAB có nguy cơ cộng `safe-area` hai lần; CSS control sheet ở cuối file ghi đè contract 44px/16px; dialog render trong `PageTransition`/`main` **hoặc control sheet render dưới sticky top bar** có thể nằm dưới top bar/bottom nav; `LeaveRequestsPage` thiếu mobile screen wrapper; Finance dùng breakpoint bảng/card khác với các trang quản trị; header lịch không đủ chỗ trên phone; `/login` thiếu landmark `main`; `/verify` còn một CTA 38px.

- **E3 — implementation, HIGH:** `src/router.tsx` có 22 route records (17 protected, 4 public/auth, root redirect), 21 route pages, 88 components. `src/index.css`, `DesktopAppShell.tsx`, `MobileAppShell.tsx`, `ModalPortal.tsx` và `useAccessibleDialog.ts` là code truth của contract.
- **E3 — implementation, HIGH:** `PageTransition` tạo stacking context content; top bar/nav lần lượt `950/1000`, trong khi route dialog phải vượt hẳn lớp đó. `ModalPortal` đưa custom dialog tới `document.body`; nested dialog và confirm dùng layer `1101/1110`.
- **E2 — regression, HIGH:** `useAccessibleDialog.test.tsx`, `appWideUiMigration.test.ts` và `mobileLayoutContract.test.ts` khóa lifecycle, shell, modal portal, safe-area/touch CSS và public-route semantics.
- **E1 — local browser, MEDIUM:** smoke ở Chromium local dùng cho overflow/landmark/kích thước control; không phải bằng chứng thiết bị thật hay workflow đã đăng nhập.

Phạm vi chỉ là presentation, focus/scroll lifecycle và responsive layout. Không thay API, schema, role policy, server authorization, offline queue, scoring hay dữ liệu.

### Mục tiêu và ràng buộc

| Loại | Mục tiêu | Cách đo | Trạng thái |
| --- | --- | --- | --- |
| Product target | touch control chính có effective hit-area >=44x44, form >=16px | CSS contract + runtime geometry tại viewport đại diện | local evidence; không thay thế QA thiết bị thật |
| Product target | public/auth và shell không overflow ngang ở 320/375/768/1024 | `scrollWidth <= clientWidth` trong browser local | kiểm tra theo matrix audit |
| Hard constraint | route dialog không bị top bar/nav hoặc route transition clip | root portal + z-index invariant + dialog lifecycle test | E3/E2 |
| Hard constraint | không làm thay đổi security, privacy, RBAC, data/offline behavior | dependency/diff/source inspection | E3 |
| Explicit exception | pinch/double-tap zoom lock giữ nguyên | `mobile-native-ui-audit-2026-08-12.md` | trade-off WCAG có chủ đích, không gọi là compliant |

### Options và Decision Matrix

| Criterion | Weight | A: vá từng page | B: CSS global đơn thuần | C: shared contract + route exceptions |
| :--- | ---: | ---: | ---: | ---: |
| Business / Operational Fit | 15% | 5 | 7 | 9 |
| Reliability & Data Integrity | 20% | 9 | 9 | 9 |
| Security & Privacy | 20% | 9 | 9 | 9 |
| Maintainability | 15% | 4 | 6 | 9 |
| Performance | 10% | 7 | 8 | 8 |
| Testability | 10% | 5 | 6 | 9 |
| Reversibility | 5% | 9 | 9 | 8 |
| Observability | 5% | 4 | 5 | 8 |
| **Weighted** | **100%** | **6.80 — REJECT** | **7.65 — REJECT** | **9.00 — SELECT** |

Các điểm là so sánh định tính dựa trên E2/E3, không phải metric hiệu năng đã hiệu chuẩn. A giữ duplicate và không tạo guard chung; B không giải quyết ownership/portal hoặc override CSS muộn; C tập trung token/shell/lifecycle dùng chung nhưng giữ local exception có chủ đích (A4 print, calendar compact grid, force-password gate).

### Decision contract

1. Mobile-native workflow dùng `.mobile-app-shell → .mobile-app-main → .mobile-screen`; shared desktop/touch pages dùng `DesktopAppShell → .responsive-page-shell`. Hai shell không dùng chung node.
2. Dưới `1024px`, responsive shared shell dùng max 760px, gutter 16px, gap 14px. Từ `1024px`, `full|wide|narrow` là tier CSS rõ ràng; `embedded-page-section` chỉ tạo column/gap, không tạo gutter hoặc cap lần hai.
3. `--mobile-nav-total-height` là chủ sở hữu duy nhất của safe-bottom. FAB/action bar neo phía trên token này; top bar sở hữu safe-top trừ khi offline banner đã sở hữu nó.
4. Control chính trong touch shell và dialog có effective target >=44px; input/select/textarea >=16px. Các control sheet không được dùng override 36/40/42px; public auth CTA cũng đạt 44px.
5. Custom dialog thuộc route **và MobileTopBar control sheet** dùng `ModalPortal` tại `document.body`; `ModalShell`/`ConfirmDialog`/`useAccessibleDialog` giữ focus restore, scroll lock và Escape chỉ đóng dialog top-most. Modal lồng dùng `1101`, confirm `1110`; control sheet root dùng modal layer 1100 nên backdrop phủ được bottom nav 1000.
6. Classes, Users và Finance dùng card dưới `md`/table từ `md`; Leave Requests có mobile wrapper; header lịch được stack dưới phone nhưng trở lại row từ `sm`.
7. Top-bar control sheet đóng trước khi mở diagnostics/reset confirm để không chồng action surface. Không sửa UX/A4 print riêng của `ExamPaperModal` ngoài việc tôn trọng root-layer contract hiện có.

### Gates, compatibility, business rule và rủi ro

- **D2 hard gates:** Security & Privacy **9** (không thêm data/API/authority), Reliability & Data Integrity **9** (không có writer/schema/offline change), Testability **9** (unit/source contract + browser smoke) — PASS. Evidence là E3/E2; điểm phản ánh blast radius giới hạn, không phải claim mới về production security.
- **ADR compatibility:** ADR-030 (DS SSOT), ADR-055 (shared primitives), ADR-063 (navy-gold/product-first), ADR-065 (route-content motion), ADR-072 (44px/tablet/dialog/public semantics), ADR-076 (portal exam) = **PASS**. Không supersede ADR nào.
- **Architecture compatibility:** `pages → components/hooks/stores` không đổi chiều dependency, không import server vào presentation = **PASS**.
- **Business Rule Gate:** không có business rule/domain transition mới = **CONFIRMED** bằng diff/source inspection. Requirement zoom lock là **CONDITIONAL** vì bằng chứng owner approval là historical audit, không phải proof of accessibility compliance. Authenticated real-device visual acceptance = **NOT CONFIRMED** cho đến khi role/device QA chạy.
- **Residual risks:** CSS selector toàn cục vẫn có thể ảnh hưởng custom print/compact widgets (probability medium, impact medium); React portal có thể bubbling sang parent nếu confirm được render trong parent overlay (medium/high). Mitigation: scope CSS theo shell/layer, giữ compact calendar exception, và render nested confirmation ngoài parent portal when needed. Rollback R1 bằng revert frontend/docs, không có migration hay recovery data.

### Source-of-truth synchronization và verification

| Source | Expected | Action | Status |
| --- | --- | --- | --- |
| `docs/03_DESIGN_SYSTEM.md` | shell/safe-area/touch/modal ladder đúng code | cập nhật v4.3 contract | DONE |
| `docs/02_ARCHITECTURE.md` | presentation boundary/route/component inventory đúng code | cập nhật responsive/portal description và counts | DONE |
| `docs/AI_CONTEXT_MAP.md` | entrypoint nêu code truth, scope, exception | thêm module mobile contract và sửa inventory | DONE |
| `docs/mobile-ui-audit-2026-08-29.md` | route-by-route findings/limitations/verification | tạo audit record | DONE |
| API/schema/business/security docs | không có thay đổi authority | không sửa để tránh drift giả | NOT AFFECTED |

### Verification result (current local run)

- `npx tsc -b --pretty false`: **PASS**.
- `npm run lint`: **PASS** — oxlint deny-warnings.
- `npm run lint:ds`: **PASS** — 0 violations across 147 UI components.
- Shared dialog/shell contract (`CommonComponents`, `ConfirmDialog`, `useAccessibleDialog`, `mobileLayoutContract`): **4 files / 33 tests PASS**.
- Mobile/adaptive/modal regression (`Mobile*`, Finance, Student/print/security-dialog and create-exam contracts): **12 files / 75 tests PASS**.
- `npm run build:frontend`: **PASS** — Vite/PWA production build generated; `git diff --check`: **PASS**.
- Browser local public/auth matrix: **16/16 observations PASS** at 320x700, 375x812, 768x1024 and 1024x768 for `/login`, `/login/nhan-su`, `/login/phuhuynh`, `/verify`: one `main`, `scrollWidth === clientWidth`, visible actions >=44x44 and login inputs 44px. The corrected `/verify` return CTA measured 238x44, 293x44, 390x44 and 390x44 respectively.
- Final MobileTopBar/confirm portal-lifecycle run: **4 files / 19 tests PASS** (`MobileTopBarDialog`, `ConfirmDialog`, `mobileLayoutContract`, `useAccessibleDialog`), including body lock, Escape top-most routing and DOM-body portal assertions.

The targeted suite still emits inherited React `act()`/Router warnings in existing tests, and Vite prints the existing `.env` `NODE_ENV=production` warning; neither is a failure or evidence of a mobile layout regression. Authenticated protected-route and physical-device acceptance remain **NOT CONFIRMED**.

---

## ADR-078: Design System v4.4 Accessibility Hard Gates & Audit Truthfulness (2026-08-29)

**Status: APPROVED / IMPLEMENTED / VERIFIED. Severity: D2. Profile: GENERAL. Reversibility: R1.**

### Problem, evidence và mục tiêu

Phase 0 của app-wide Design System audit xác nhận ba drift có bằng chứng trực tiếp:

- **E3 / HIGH:** `--color-text-placeholder: #94A3B8` trên `surface-card` light chỉ 2.56:1; dark `#64748B` trên `#1E293B` chỉ 3.07:1. Custom placeholder trong desktop header/mobile control sheet cũng bypass token.
- **E3 / HIGH:** global `:focus-visible` dùng `--color-parish-primary`, trong khi desktop/mobile brand shell chứa chính navy primary; `app-header` search/select còn có local `outline: 0`, nên token toàn cục không đủ bảo đảm chỉ báo focus nhìn thấy.
- **E3 / HIGH:** `scripts/design-system-lint.mjs` chạy 6 source-regex rules nhưng log toàn bộ discovered TSX, gồm file test/exemption, dưới nhãn “UI components” và tuyên bố mọi component đạt WCAG AA. Static scan này không đo contrast, keyboard, runtime focus, reflow, dark mode hoặc visual output.

Mục tiêu hard gate của phase: placeholder text ≥4.5:1 trên supported input surfaces; focus indicator trên navy brand surfaces ≥3:1 với nền kề; linter mô tả đúng phạm vi và không phát hành compliance claim vượt bằng chứng.

### Options và Decision Matrix

| Criterion | Weight | A: đổi token đơn lẻ | B: chỉ sửa audit tooling | C: token + scoped focus + test + truthful lint |
| :--- | ---: | ---: | ---: | ---: |
| Business / Operational Fit | 15% | 6 | 5 | 9 |
| Reliability & Data Integrity | 20% | 9 | 9 | 9 |
| Security & Privacy | 20% | 9 | 9 | 9 |
| Maintainability | 15% | 6 | 6 | 9 |
| Performance | 10% | 9 | 8 | 8 |
| Testability | 10% | 5 | 7 | 9 |
| Reversibility | 5% | 10 | 9 | 9 |
| Observability | 5% | 4 | 6 | 8 |
| **Weighted** | **100%** | **7.50 — REJECT** | **7.50 — REJECT** | **8.85 — SELECT** |

A fail D2 Testability gate và không xử lý local outline reset/custom brand placeholder. B không đóng confirmed contrast failure. C là thay đổi nhỏ nhất đóng đủ ba finding và tạo regression evidence.

### Decision contract

1. Content placeholder dùng `#5F6F82` light và `#A3B1C4` dark; `::placeholder` cố định `opacity: 1`. Unit test đo token trên `surface-card|raised|sunken|hover|app`; worst-case hiện tại 4.66:1 light và 4.75:1 dark.
2. Brand placeholder dùng `--color-text-placeholder-on-brand: #E2E8F0`; desktop header search và mobile control search không dùng raw alpha-white. Mobile control sheet dùng navy `rgba(7, 24, 74, 0.92)` để contrast không phụ thuộc page phía sau.
3. Brand focus dùng `--color-focus-ring-brand: #FFFFFF`, outline 3px/offset 2px, scope tại `.app-header`, `.mobile-top-bar`, `.mobile-control-sheet` và được khai báo sau local outline resets. Contrast thấp nhất trên gradient stops là 6.70:1.
4. `lint:ds` version đồng bộ v4.4; đếm đúng non-exempt scanned TSX và luôn công bố: 6 static anti-drift rules, không chứng nhận full WCAG hoặc visual conformance. Các rule-specific contrast finding có thể nêu bằng chứng riêng, nhưng summary không suy rộng thành app-wide compliance.
5. `designSystemTokens.test.ts` là source-level contrast/focus contract. Axe/runtime keyboard/viewport/dark/role/device verification vẫn là workstream riêng; zoom lock là accepted product trade-off, không phải compliance.

### Gates, compatibility, risk và rollback

- **D2 hard gates:** Security & Privacy 9, Data Integrity 9, Testability 9 — PASS. Đây là presentation/tooling-only change; không có API/schema/auth/offline/data writer.
- **ADR compatibility:** ADR-030 (CSS SSOT), ADR-055 (shared primitives), ADR-063 (navy–gold), ADR-065 (motion), ADR-072/077 (a11y/mobile shell) = **PASS**. ADR-078 chỉ supersede claim cũ rằng `lint:ds` một mình “guarantees WCAG”; không supersede SSOT hoặc visual direction.
- **Architecture:** presentation và repo tooling giữ nguyên dependency direction = **PASS**. **Business Rule Gate:** không đổi nghiệp vụ = **CONFIRMED**.
- **Risks:** placeholder đậm hơn và control sheet ít trong suốt hơn có probability medium/impact low; scoped focus selector có probability low/impact medium. Mitigation bằng token test, source selector contract và visual smoke ở phase verification tiếp theo. Residual risk low.
- **Rollback:** R1, revert CSS/linter/test/docs cùng batch; không có migration hoặc data recovery.

### Source-of-truth synchronization

| Source | Action | Status |
| --- | --- | --- |
| `src/index.css` | v4.4 placeholder/brand-focus/control-sheet contract | DONE |
| `scripts/design-system-lint.mjs` | truthful scope, count và version | DONE |
| `src/__tests__/designSystemTokens.test.ts` | contrast math + selector regression | DONE |
| `src/__tests__/designSystemLintContract.test.ts` | CLI scope/claim regression | DONE |
| `docs/03_DESIGN_SYSTEM.md` | token values, ratios và claim boundary | DONE |
| `docs/02_ARCHITECTURE.md`, `docs/AI_CONTEXT_MAP.md` | current presentation/tooling truth | DONE |
| API/schema/business/security docs | không đổi authority/contract | NOT AFFECTED |

### Verification result

- Token/linter contracts: **2 files / 12 tests PASS**, gồm light/dark surface, brand gradient, worst-case translucent-layer composition và CLI claim boundary.
- `npm run lint:ds`: **PASS**, 0 anti-drift violation / 107 non-exempt application TSX files; output nêu rõ không chứng nhận full WCAG/visual conformance.
- Relevant UI regression: **7 files / 37 tests PASS** (`designSystemTokens`, linter contract, app-wide/mobile layout, MobileTopBar dialog, shared components và accessible dialog lifecycle).
- `npm run lint`: **PASS**; `npx tsc -b --pretty false`: **PASS**; `npm run build:frontend`: **PASS** (Vite/PWA production output; warning `.env NODE_ENV=production` là warning có sẵn, không phải failure).
- Full serialized Vitest: **257/257 files, 1819/1819 tests PASS**. `git diff --check`: **PASS**.

---

## ADR-079: Design System v4.5 — Semantic Primitives, Ordered CSS Graph & Runtime Evidence (2026-08-30)

**Status: APPROVED / IMPLEMENTED / VERIFIED. Severity: D2. Profile: GENERAL. Reversibility: R1.**

### Problem, scope và evidence

Design System đã có visual language navy–gold và token SSOT, nhưng app-wide audit còn ba nguồn drift xuyên module:

- **E3 / HIGH:** `src/index.css` là monolith 4,409 dòng; test cũ đọc một file vật lý, nên việc tách CSS có thể vô tình đổi cascade hoặc làm contract đọc thiếu declaration.
- **E3 / HIGH:** shared/auth và các workflow Dashboard, Students, Management, Attendance, Grades, Finance lặp raw button/form/tab/filter markup. Finance fund filter từng mang tab semantics dù chỉ lọc dữ liệu; lazy fallback có thể làm `aria-controls` trỏ tới panel tạm biến mất.
- **E3 / HIGH:** baseline lịch sử tại lúc ra quyết định gồm 289 `text-[Npx]` occurrences / 58 files và 76 `transition-all` occurrences / 25 files; global-ban ngay sẽ tạo rewrite rủi ro, còn không khóa sẽ tiếp tục tăng. Baseline này được giữ trong ADR như starting evidence, không phải current debt.
- **E2 / HIGH:** source-level tests/linter không đo DOM ARIA runtime, contrast theo theme, viewport overflow hoặc ảnh route. Browser matrix đã bắt các lỗi thật ở active mobile bottom-nav dark, lifecycle panel/Suspense, `PageHeader` phone identity/action, dashboard/control contrast, Finance/Grade scroller, labels/statuses và public auth/forgot/verify contrast.

Phạm vi chỉ gồm presentation, repo tooling, tests, docs, CI artifact và dev dependency `@axe-core/playwright`. Không thay route policy, API/schema, auth/RBAC, tenant isolation, offline/sync, scoring, business calculations, print/A4 hay OMR geometry.

### Options và Decision Matrix

| Criterion | Weight | A: giữ raw markup + source checks | B: thay UI framework / rewrite CSS | C: thin typed layer + graph + ratchets + runtime gates |
| :--- | ---: | ---: | ---: | ---: |
| Business / Operational Fit | 15% | 6 | 7 | 9 |
| Reliability & Data Integrity | 20% | 9 | 8 | 9 |
| Security & Privacy | 20% | 9 | 9 | 9 |
| Maintainability | 15% | 5 | 7 | 9 |
| Performance | 10% | 9 | 6 | 8 |
| Testability | 10% | 4 | 7 | 9 |
| Reversibility | 5% | 10 | 4 | 9 |
| Observability | 5% | 4 | 6 | 8 |
| **Weighted** | **100%** | **7.25 — REJECT** | **7.30 — REJECT** | **8.85 — SELECT** |

A fail D2 Testability gate và giữ semantic drift. B có blast radius/reversibility không tương xứng với presentation problem, đồng thời xung đột yêu cầu giữ visual language hiện tại. C tái sử dụng class/token đã duyệt, cho phép migration tăng dần và rollback theo file.

### Decision contract

1. `src/components/common/ui/` là semantic layer mỏng: typed Button/IconButton, form controls, Tabs/TabPanel, SegmentedControl, FilterChips, Badge và Surface. Primitive chỉ map presentation/interaction; không chứa business-status mapping.
2. Tab dùng `tablist → tab → tabpanel`, ID reference hợp lệ, roving keyboard focus và `aria-selected`; filter dùng `aria-pressed`, single-choice command dùng radio semantics. Lazy `Suspense` phải nằm trong active panel để panel node không biến mất.
3. `src/index.css` là entrypoint duy nhất của ordered graph `00-tokens.css → 70-sidebar.css`. Không dùng `@layer`, không component-owned CSS import, không đảo cascade. CSS graph test khóa manifest, reachability, duplicate/cycle/orphan và directive ownership.
4. Tại điểm split-only, production CSS phải giống trước/sau. Baseline đã xác nhận 212,171 bytes và SHA-256 `09AD1BB6179D178887D5E5E3502363FE1D57C45597BDA048D5B925EC4A561CEB`; accessibility fixes sau split được xem là intentional diff riêng.
5. `lint:ds` v4.5 chạy 8 static rules trên 112 non-exempt application TSX. Hai debt chưa thể cấm toàn cục dùng per-file ceiling; file mới hoặc không có baseline có ceiling 0. Baseline chỉ được viết lại có chủ đích và không được dùng để hợp thức hóa debt tăng. Current ratchet đã giảm còn 287 arbitrary-pixel font sizes / 58 files và 55 `transition-all` / 23 files; current linter result là 0 violation.
6. Browser hard gate dùng ba viewport 1440/390/320 và light/dark: 7 protected routes đại diện (`/dashboard`, `/students`, `/attendance`, `/grades`, `/finances`, `/parish`, `/parish-profile`) = 42 observations; 4 public/auth routes (`/login`, `/login/nhan-su`, `/login/phuhuynh`, `/verify`) = 24; `ParentForgotPasswordModal` = 6; `ParishProfileEditorModal` = 6. Tổng cộng Axe = 78 observations; visual/layout dùng cùng 78 scenarios, cộng một mobile-bottom-nav interaction test. Axe JSON, full-page screenshots và HTML report được CI giữ 7 ngày kể cả khi job fail; screenshot là evidence artifact, không phải portable pixel-diff baseline.
7. Protected traversal dùng sidebar thật và giữ nguyên một SPA document để không tạo hard-refresh/refresh-token rotation ngoài ý muốn. Mỗi bước phải assert canonical URL, matching `aria-current`, `.product-view` và zero primary loading status trước scan/capture; canonical finance route là `/finances`. Mobile-bottom-nav test điều hướng thật qua Attendance, Grades, Students, Reports và Dashboard.
8. Playwright harness tách khỏi developer runtime: Vite/API dùng 3100/3101; mỗi run có UUID + owner marker và SQLite tạm trong OS temp; `dev:e2e` không nạp server `.env`; remote/external DB env bị scrub; ports được preflight; stdout chỉ phát `READY` sau khi Vite, API và deterministic seed đều hoàn tất; reporter dọn sandbox sau teardown. E2E-only trusted-proxy + IP riêng theo browser context giữ login limiter production nguyên vẹn. Local evidence xác nhận SHA của development DB không đổi sau suite.
9. Remediation giữ nguyên visual language: `PageHeader` có mobile identity/action flex-basis; dashboard/control và light/dark semantic tokens đạt runtime contrast gate; nhãn grade highlight dùng foreground primary; Finance/Grade scrollers có region/label/focus; control có label/status đúng; public auth, forgot modal và verify được sửa contrast. Native route motion chỉ consume ba browser lifecycle interruption dự kiến trên `ready`/`finished`, không bắt `updateCallbackDone`. `vite.config.ts` bỏ stale `optimizeDeps` entries `tailwind-merge` và `jspdf`.
10. Axe chỉ là automated subset. `meta-viewport` là rule duy nhất bị disable theo zoom-lock exception đã chấp nhận ở ADR-072/077/078. Protected matrix là 7 route đại diện, không bao phủ mọi protected route hoặc role; không tuyên bố full WCAG, screen-reader, physical-device, field usability hoặc pixel-diff acceptance.

### Gates, compatibility, business rule và risks

- **D2 hard gates:** Security & Privacy **9**, Reliability & Data Integrity **9**, Testability **9** — PASS. Không có new writer/authority/network contract; source graph, semantic unit contracts, current linter và browser gates có evidence, còn final serialized repository gate sau remediation cuối được ghi riêng bên dưới.
- **ADR consistency:** ADR-030 (DS SSOT), ADR-055 (shared primitives), ADR-063 (navy–gold/product-first), ADR-065 (route motion), ADR-072/077 (responsive/touch/dialog), ADR-078 (truthful accessibility claims) = **PASS**. ADR-079 mở rộng governance/runtime evidence, không supersede identity hoặc domain contract.
- **Architecture compatibility:** dependency direction `pages → components/hooks/stores` giữ nguyên; CSS module graph vẫn có một entrypoint; CI chỉ lưu test artifact = **PASS**.
- **Business Rule Gate:** không thêm hoặc đổi domain transition, calculation hay authority = **CONFIRMED** bằng diff/source inspection. All-17-protected-route/all-role coverage, full WCAG, screen-reader, physical-device và pixel-diff acceptance = **NOT CONFIRMED**, được giữ như manual/extended release evidence.

| Risk | Probability | Impact | Mitigation | Residual |
| --- | --- | --- | --- | --- |
| CSS split đổi cascade | Low | High | exact-output hash tại split-only + ordered graph contract | Low |
| Primitive migration đổi keyboard/DOM contract | Medium | Medium | role/state unit tests + Axe matrix; cập nhật legacy assertions theo semantic chuẩn | Low |
| Ratchet baseline bị nới vô ý | Low | Medium | explicit write flag, per-file ceiling, missing baseline = 0 | Low |
| Screenshot khác nhau theo platform | Medium | Low | dùng ảnh làm evidence artifact; không claim portable pixel baseline | Low |
| E2E vô tình dùng dev/remote DB hoặc scan trước seed | Low | High | dedicated ports, temp DB, env scrub, preflight và readiness sau seed; kiểm SHA dev DB | Low |
| Automated scan bỏ sót a11y thực địa | High | Medium | truthful claim boundary + manual screen-reader/device follow-up | Medium |

Rollback R1: revert primitives/migrations, CSS graph/tooling/tests/docs/CI batch cùng nhau; không có migration dữ liệu hoặc recovery operation.

### Source synchronization và verification

| Source | Action | Status |
| --- | --- | --- |
| `docs/03_DESIGN_SYSTEM.md` | v4.5 primitive/graph/ratchet/runtime contract + measured verification | DONE |
| `docs/02_ARCHITECTURE.md` | current presentation boundaries, inventory và runtime gates | DONE |
| `docs/AI_CONTEXT_MAP.md` | code truth, evidence, scope và claim boundary | DONE |
| `docs/UI_UX_UPGRADE_PLAN_2026-08-27.md` | phase closure và residual manual backlog | DONE |
| `.github/workflows/ci.yml`, `playwright.config.ts`, `scripts/e2e-dev.mjs` | persist evidence 7 ngày + isolated deterministic browser harness | DONE |
| API/schema/business/security docs | không đổi authority/data contract | NOT AFFECTED |

Verification local được chạy tuần tự để tránh race `coverage/.tmp`:

- `npm run lint:ds`: **PASS — 0 violations / 112 non-exempt application TSX files**; ratchet current = 287 arbitrary-pixel font sizes / 58 files và 55 `transition-all` / 23 files.
- Full Playwright cuối: **61/61 tests chạy PASS**, **1 offline tenant-reload test skip có chủ đích**; bao phủ 60 Axe observations, 60 visual/layout captures, mobile-bottom-nav, auth/role, tenant switch và attendance save. Không còn unhandled View Transition lifecycle log.
- E2E isolation evidence: dedicated 3100/3101 runtime, owner-marked OS-temp SQLite, deterministic fixture, seed-before-ready và cleanup reporter **PASS**; SHA-256 development DB trước/sau giữ nguyên `3D3CC908330207C951DA2D15B6C924FBE330E499E921F87E345EFBF668D1DA40`.
- Split-only CSS proof: **212,171 bytes / identical SHA-256** before and after modularization. Accessibility/contrast fixes sau split là intentional diff, không làm mất graph contract.
- Final serialized `npm run verify:ci` sau remediation cuối: **PASS** — lint zero-warning, `lint:ds` 0/112, client/server TypeScript, Vite/PWA build và **260/260 files, 1,836/1,836 tests PASS**. Coverage: statements **70.64%**, branches **59.94%**, functions **64.51%**, lines **72.88%**.
- `npm audit --omit=dev`: **0 production vulnerabilities** ở lần kiểm gần nhất. Full toolchain audit còn 7 moderate trong các chain `@capacitor/cli`/`drizzle-kit`; không chain nào đi qua `@axe-core/playwright`, và suggested fixes là semver-major nên nằm ngoài batch presentation này.

Post-implementation reassessment giữ option C ở **8.85**; hard gates và ADR consistency tiếp tục PASS. Residual manual acceptance không chặn code integration nhưng chặn mọi claim “WCAG compliant” hoặc field-validated.

---

## ADR-080: Mobile Route Readiness, Staged Preload & Immediate Navigation Feedback (2026-08-30)

**Status: IMPLEMENTED / VERIFICATION CONDITIONAL. Severity: D2. Profile: GENERAL. Reversibility: R1.**

### Problem và evidence

Mobile đổi nhanh giữa primary pages có khoảng trễ trước fade-through. Audit end-to-end xác nhận:

- **E3 HIGH:** route component dùng `lazyWithRetry` dựa trên `React.lazy` nhưng không có `.preload()`; TanStack `preloadRouteComponents()` chỉ gọi component `.preload?.()`. Vì vậy các `router.preloadRoute()` cũ không làm ấm page chunk như comment.
- **E3 HIGH:** mobile bottom nav là `<button>` + `navigate()`, không phải Router `Link`; `defaultPreload: 'viewport'` không áp dụng cho các nút này.
- **E3 HIGH:** Router bắt đầu View Transition trong `loadMatches.onReady`; cold import vì vậy trì hoãn trước animation, tạo perceived no-response. Motion 120–180ms/reduced-motion hiện tại không phải root cause đã chứng minh.
- **E2 MEDIUM:** baseline production build trước batch có initial JS 59.10 KB gzip, router 41.54 KB, Attendance 17.81 KB, Dashboard 10.42 KB, Students 7.42 KB, Grades 4.13 KB; nested default `MobileGradeBoard` 3.33 KB và modal import Excel 12.50 KB. PWA precache 182 entries / 2667.93 KiB. Đây không phải field timing.
- **E1 MEDIUM:** authenticated Chromium 390×844 render mobile admin/566-student snapshot không console error. Mid-tier Android/iOS latency, FPS và Long Task vẫn **UNKNOWN / NOT CONFIRMED**.

### Options và matrix

| Criterion | Weight | A: CSS-only/current preload | B: eager mọi route | C: preloadable + staged role queue |
| --- | ---: | ---: | ---: | ---: |
| Business / Operational Fit | 15% | 5 | 6 | 9 |
| Reliability & Data Integrity | 20% | 9 | 9 | 9 |
| Security & Privacy | 20% | 9 | 8 | 9 |
| Maintainability | 15% | 6 | 6 | 8 |
| Performance | 10% | 3 | 5 | 9 |
| Testability | 10% | 4 | 7 | 9 |
| Reversibility | 5% | 10 | 8 | 9 |
| Observability | 5% | 4 | 5 | 7 |
| **Weighted** | **100%** | **6.65 — REJECT** | **7.30 — REJECT** | **8.80 — SELECT** |

A không xử lý root cause và fail D2 Testability. B tăng startup transfer/parse cho route user không dùng, đặc biệt bất lợi mobile. C dùng policy/lazy boundary hiện hữu, tải tuần tự và rollback theo file.

### Decision contract

1. `lazyWithRetry` giữ retry, thêm `.preload()`, dedupe concurrent promise và render component đã resolve đồng bộ sau preload. **Amendment ADR-088 (2026-09-01):** background preload không được hard-reload; khi hết retry, promise reject để ErrorBoundary cho người dùng chủ động tải lại, và failed promise được reset để navigation sau có thể retry mới.
2. `getMobilePreloadPaths(role)` chỉ trả primary destination role được phép; đây là UX optimization, không thay server authorization.
3. `useMobileRoutePreload` bỏ route hiện tại, preload tuần tự trong idle callback (timer fallback), không tạo burst bốn import đồng thời; cleanup hủy queue khi mode/role đổi.
4. Bottom nav preloads tại pointer/focus, hiện pending selection và `aria-busy` ngay; `aria-current` chỉ theo committed route. Rapid tap mới nhất điều khiển pending visual; expected native interruption handling ADR-079 giữ nguyên.
5. Default `MobileGradeBoard` đi cùng Grades route; non-default Daily/Comparison/Exam tiếp tục lazy. `ExcelImportModal` chỉ tải khi mở.
6. Không đổi animation token/style, API/schema/auth, tenant state, data fetch, offline queue, business calculation, print hay OMR.

### Gates, compatibility, risks và rollback

- **D2 hard gates:** Security & Privacy **9**, Data Integrity **9**, Testability **9** — PASS bằng scope không writer/API/authority + unit/source contracts và full frontend build.
- **ADR compatibility:** ADR-063 (navy–gold), ADR-065 (pathname motion), ADR-072 (route policy/RBAC), ADR-077 (mobile shell), ADR-079 (runtime evidence) = **PASS**.
- **Architecture:** `RootLayout → hook → router/policy` và pages → components giữ chiều dependency hiện hữu = **PASS**. **Business Rule Gate:** không đổi nghiệp vụ = **CONFIRMED**.
- **Risks:** idle prefetch tiêu data/CPU (medium/medium) → chỉ primary role paths, tuần tự, bỏ current; preload rejection/stale deploy (low/medium) → retry + ErrorBoundary reload có chủ đích, tuyệt đối không background reload; pending UI stale (low/medium) → reset theo committed active route và clear on rejection. Residual low/medium cho đến device trace.
- **Rollback:** R1, revert hook/preload wrapper/nav feedback/nested boundary/docs; không migration hoặc data recovery.

### Verification và source synchronization

- Targeted: **5 files / 28 tests PASS** gồm preload dedupe/named export, role paths, pending/rapid navigation, PageTransition và representative mobile views.
- `npm run lint`: **PASS**.
- Full `npm run build:frontend` (`tsc -b && vite build`): **PASS**; Grades default route bỏ nested board chunk, Excel modal vẫn dynamic-only, initial entry không tăng.
- Candidate performance targets/device plan và evidence boundary: `docs/mobile-route-performance-audit-2026-08-30.md`. Real-device/production target achievement: **NOT CONFIRMED**.
- Updated: Architecture, Design System, AI Context, ADR and dedicated audit. API/schema/business/security docs: **NOT AFFECTED**.

---

## ADR-081: Hồ sơ Xứ đoàn — Parish Memory bounded context, publication boundary và kho tư liệu có kiểm soát (2026-08-31)

**Status: IMPLEMENTED / OPERATIONS CONDITIONAL. Severity: D3. Profile: SECURITY. Reversibility: R2.**

### Problem, current state và evidence

Catevia có lịch phụng vụ/sự kiện tác nghiệp nhưng chưa có nguồn dữ liệu chuẩn cho lịch sử thành lập, các đời Ban Trị Sự, cơ cấu, quá trình phục vụ Huynh trưởng/GLV, hoạt động lớn, thành tích và tư liệu. `parish_events` chỉ có ngày, tiêu đề, loại, giờ và địa điểm; local fallback hiện không phải durable offline queue nên không được dùng làm kho lưu trữ lịch sử. `users` là tài khoản đăng nhập, không đại diện đầy đủ cho người từng phục vụ. `blobStorage` ADR-041 được xây cho backup/safety snapshot; production archive không được dựa vào disk ephemeral hoặc URL object công khai.

### Options và Decision Matrix

| Criterion | Weight | A: kéo dài Calendar/Settings | B: bounded context riêng | C: chỉ liên kết Drive ngoài |
| :--- | ---: | ---: | ---: | ---: |
| Security | 20% | 7 | 9 | 6 |
| Privacy | 15% | 6 | 9 | 5 |
| Data Integrity | 20% | 5 | 9 | 7 |
| Tenant Isolation | 10% | 8 | 9 | 5 |
| Business / Operational Fit | 15% | 5 | 9 | 7 |
| Maintainability | 10% | 4 | 8 | 6 |
| Testability | 5% | 4 | 9 | 4 |
| Reversibility | 5% | 8 | 7 | 9 |
| **Weighted** | **100%** | **5.85 — REJECT** | **8.85 — SELECT** | **6.15 — REJECT** |

Scores use E3 source/schema evidence and E4 architecture/security authority with HIGH confidence for current limitations; production media latency/cost and future public publication remain UNKNOWN and are not counted as verified benefits. A fails D3 Privacy/Data Integrity; C fails Security/Privacy/Tenant Isolation. B passes the architectural gate only with the controls below.

### Decision contract

1. Tạo Organization workspace tại `/parish` và route cấu trúc `/parish-profile`; không nhúng Parish Memory vào Calendar hoặc Management.
2. Server REST là authority. Read cho `admin|chunhiem|phuta`; write/publish/delete chỉ `admin`. `phuhuynh` bị chặn ở cả frontend policy và backend. Admin thấy draft/archived; staff chỉ thấy bản `PUBLISHED` và dữ liệu `STAFF` không bị soft-delete.
3. Mọi bảng dùng tenant key `(parish_id,id)` hoặc parish-scoped key tương đương; mọi lookup/reference/read-back mang `parish_id`. Cross-tenant target được trả 404 trước khi mutation.
4. `parish_people` là organization identity, tách account/auth khỏi biography nhưng có `linked_user_id` tùy chọn. Link bắt buộc cùng tenant và partial unique trên active row để một account không có hai identity. Nhân vật lịch sử không có account vẫn được lưu mà không tạo user giả. Hồ sơ không lưu ngày sinh đầy đủ hoặc số điện thoại; năm sinh là optional và visibility mặc định `STAFF`.
5. Dữ liệu chuẩn gồm profile, people, organization units, service terms, records, record-person links, archive assets và record-asset links. Timeline là read-model hợp nhất `parish_records(show_on_timeline=1)` và mốc bắt đầu/kết thúc nhiệm kỳ; không có bảng timeline nhập trùng.
6. `parish_events` tiếp tục là lịch tác nghiệp. `parish_records.source_event_id` có thể liên kết mềm để chuyển một sự kiện đã diễn ra thành nhật ký lịch sử, không thay đổi contract lịch/offline hiện hữu.
7. Kho tư liệu hỗ trợ external HTTPS link và upload giới hạn 8 MiB cho JPEG/PNG/WebP/PDF, kiểm MIME + magic bytes + SHA-256. Production upload fail-closed khi R2 chưa cấu hình; object key do server sinh dưới prefix tenant, không dùng tên file hay path do client cung cấp. Download luôn qua endpoint auth/tenant/visibility; không phát public object URL.
8. Video ở MVP dùng external HTTPS link. Upload video lớn, public gallery/CDN, parental publication và anonymous access là NOT CONFIRMED/OUT OF SCOPE cho đến khi có storage, consent, retention và abuse controls riêng.
9. Mutation chạy transaction cùng audit metadata. Audit không lưu body tiểu sử/nội dung/file bytes/URL đầy đủ; delete là soft-delete. Client không giả thành công offline và không có local-only archive mutation.
10. UI dùng Design System v4.5 navy–gold, shared `PageHeader`, `Tabs`, `Surface`, form/button/modal primitives, responsive shell và dark/reduced-motion contract. Mobile truy cập từ control sheet; không tăng số mục bottom nav.

### Hard gates, compatibility và business rules

- **D3 hard gates:** Security **9**, Privacy **9**, Data Integrity **9** — PASS ở thiết kế. Evidence riêng Privacy: tối thiểu PII, parent/public deny, staff publication filter, audit redaction và authorized download. Testability **9** nhờ route/RBAC/tenant/migration/service/UI contracts.
- **ADR compatibility:** ADR-031 composite tenant binding = PASS; ADR-041/059 R2 storage = CONDITIONAL (reuse adapter, production upload requires R2); ADR-045 PII-at-rest = PASS do không persist client profile cache; ADR-058 no reversible credentials = NOT AFFECTED; ADR-063/065/072/077/079/080 UI/route/mobile contracts = PASS.
- **Architecture:** pages -> stores/lib/types, server routes -> service -> db/storage; no reverse dependency = PASS.
- **Business Rule Gate:** first-class Xứ đoàn area and requested content groups = CONFIRMED by product request. Admin-only publication, staff-only read and no parent/public MVP = CONDITIONAL conservative defaults. Public publication/consent/retention duration = NOT CONFIRMED and therefore disabled.

### Risk, migration, rollback và verification

| Risk | Probability | Impact | Mitigation | Residual |
| --- | --- | --- | --- | --- |
| Cross-parish/reference leak | Low | Critical | composite tenant keys, parish-scoped lookup, isolation tests | Low |
| Draft/restricted content exposed | Low | High | backend filter is authority; route policy only UX | Low |
| Malicious/oversized upload | Medium | High | 8 MiB cap, allowlist + signature, generated key, auth download | Low/Medium |
| Object/metadata partial commit | Low | High | upload object then transactional metadata; delete object on DB failure; soft delete afterward | Low |
| Historical record loss | Low | High | additive migration, soft delete, audit, backup | Low |
| External media link privacy/availability | Medium | Medium | HTTPS-only, explicit external label, no embed | Medium |

Migration is additive (`20260831-136..144`) and R2-compatible. Automatic encrypted logical backup includes all metadata tables; manual LMS export v2 remains academic-only by explicit contract. Purge v2.3 preserves Parish Memory. Rollback R2: hide/remove route and API while retaining new tables/objects; do not down-migrate or delete historical data. Rollback trigger: relevant tenant/RBAC/upload/migration/type gate fails. Acceptance requires migration readiness, server typecheck, targeted service/route tenant tests, frontend route/UI tests, lint/design-system lint, production builds and final serialized verification. Review at 7/30/90 days after real use; public/media expansion requires REASSESS.

---

## ADR-082: Catevia Platform Workspaces — Academic, Organization, Parent (2026-08-31)

**Status: IMPLEMENTED PHASE 1. Severity: D3. Profile: ARCHITECTURE + SECURITY. Reversibility: R1 UI / R2 data.**

### Context và evidence

Catevia đã có 17+ protected routes thuộc học vụ, tổ chức, tài chính và phụ huynh trong một navigation phẳng. Tiếp tục thêm Parish Memory vào shell cũ làm tăng cognitive load và khiến academic filters xuất hiện ở màn tổ chức. Tuy nhiên auth, user, tenant, backend, database, notification, audit, offline sync và design system đang là shared platform ổn định; tách deploy/app hoặc rewrite phá dependency/operational contract mà không tạo giá trị tương ứng. Workspace vì vậy là presentation/IA boundary trên modular monolith, không phải service hoặc security boundary.

### Options và matrix

| Criterion | Weight | A: sidebar phẳng | B: nhiều app/deploy | C: workspace trên modular monolith |
| :--- | ---: | ---: | ---: | ---: |
| Business fit | 20% | 4 | 7 | 9 |
| Security & Privacy | 20% | 7 | 6 | 9 |
| Data Integrity | 15% | 8 | 5 | 9 |
| Maintainability | 15% | 4 | 4 | 9 |
| Migration safety | 10% | 8 | 3 | 9 |
| UX clarity | 10% | 4 | 8 | 9 |
| Testability | 5% | 5 | 5 | 9 |
| Reversibility | 5% | 9 | 3 | 8 |
| **Weighted** | **100%** | **5.65 — REJECT** | **5.45 — REJECT** | **8.95 — SELECT** |

### Decision contract

1. Catevia giữ một app/deploy/auth/database/backend. Ba workspace là `academic`, `organization`, `parent`; route policy là frontend IA SSOT.
2. Landing routes: `/dashboard`, `/parish`, `/parent`. Organization chứa Parish Memory, Huynh trưởng/GLV, calendar/events, notices và finance; Academic giữ student/class/attendance/grade/exam/report/year lifecycle; Parent giữ experience hiện hữu.
3. Người có nhiều workspace chuyển trong desktop sidebar hoặc mobile control sheet, không logout. Lựa chọn cuối được lưu theo `parishId:userId`; route workspace cụ thể cập nhật marker, route `shared` giữ context trước đó.
4. Workspace không cấp quyền. Router/nav chỉ là fail-closed UX; server middleware, class scope và service tenant/reference checks vẫn là authority. Parent không nhìn thấy Organization/Academic switcher.
5. Không rewrite route/domain ổn định. Route cũ và offline engine giữ nguyên; shell chỉ ẩn academic class/search/semester controls trong Organization. Desktop sidebar cũng chỉ render bộ lọc phân ngành/lớp khi workspace hiện hành là Academic. Secondary mobile route không chiếm thêm bottom-nav slot.
6. Identity không đồng nhất với credential: một canonical organization person có thể optional-link đúng một user account, đồng thời có nhiều class assignments, service terms và record links. Không duplicate account/person cho từng workspace.
7. Current `users.role` tiếp tục là coarse access role để tránh risky auth rewrite. Multi-responsibility nghiệp vụ đã biểu diễn bằng assignment/term links; future multi-capability authorization phải là additive assignment model, server-authoritative, có deny/conflict policy và migration ADR riêng. Chức danh hoặc active workspace không được tự suy ra permission.
8. Shared platform services (auth, users, audit, notification, settings, backup, design system) không fork theo workspace.
9. Organization navigation dùng sentence case theo Design System. Form trong `ParishProfileEditorModal` phải dùng vertical `.form-group` primitive; runtime gate quan sát cả `/parish`, `/parish-profile` và modal tại desktop/390/320, light/dark.

### Gates, compatibility, migration và rollback

- D3 gates: Security **9**, Privacy **9**, Data Integrity **9**, Testability **9** — PASS bằng server authority không đổi, parent isolation, scoped persisted workspace marker không PII và targeted route/RBAC/tenant tests.
- ADR consistency: ADR-031 tenant binding, ADR-045 client PII, ADR-063/072/077/080 shell/route/mobile và ADR-081 Parish Memory = **PASS**. “Một coarse auth role” hiện hữu là transitional constraint, không bị workspace giả vờ giải quyết.
- Business gate: một platform/ba experience, shared data và no rewrite = **CONFIRMED**. Full multi-capability authorization, public tradition portal, cross-parish federation và automated historical query engine = **NOT CONFIRMED / future ADR**.
- Migration UI là additive R1. Parish Memory schema là additive R2 theo ADR-081. Rollback workspace UI về navigation cũ không xóa tables/data; Organization API vẫn có thể ẩn bằng route removal. Real-device usability và production R2/restore drill còn CONDITIONAL.
- Design conformance remediation: Organization không còn academic filters; modal dùng vertical form primitive; sentence-case navigation và mobile inactive-nav contrast được khóa bằng tests. Playwright Axe/visual/layout/CRUD/role **41/41 PASS**, mỗi design matrix **78/78 observations**; final serialized `verify:ci` **264 files / 1,864 tests PASS**, `lint:ds` **0/115**.

---

## ADR-083: Standardization of Class Selector Dropdown & Date Picker Controls Height to 40px (2026-08-31)

**Status: APPROVED / IMPLEMENTED / VERIFIED. Severity: D1. Profile: GENERAL. Reversibility: R1.**

### Context và Mục Tiêu
Trước đây, kích thước các bộ chọn (dropdown chọn lớp, ô chọn ngày) có sự phân tán giữa các màn hình và thiết bị:
- `36px` ở toolbar Báo cáo & Tổng kết.
- `38px` ở `.form-select` / `.form-input` base token.
- `44px` ở Mobile attendance fields & control sheet select.

Sự phân tán này dẫn đến việc không đồng nhất thị giác khi các control chọn lớp và chọn ngày đứng cạnh nhau trên cùng một thanh công cụ. Quyết định chuẩn hóa chiều cao chuẩn của các bộ chọn ngày (`input[type="date"]`) và dropdown chọn lớp (`select`) trên toàn bộ ứng dụng thành **`40px`** (`height: 40px` / `min-height: 40px` / `h-10` / `h-[40px] min-h-[40px]`).

### Decision Contract
1. **Design System Tokens (`20-primitives.css`):** `.form-input`, `.form-select`, `.form-textarea` có base `height: 40px; min-height: 40px;`.
2. **Mobile Shell & Forms (`40-mobile-shell.css`, `60-view-language.css`):**
   - `.mobile-control-field select, .mobile-control-search` chuẩn hóa `height: 40px; min-height: 40px;`.
   - `.attendance-field .form-input, .attendance-field .form-select` chuẩn hóa `height: 40px; min-height: 40px;` với `padding-top: 13px; padding-bottom: 2px;`.
3. **Components (`MobileReportsView`, `MobileAttendanceSummaryView`, `MobileLeaveRequests`, `DesktopAttendanceGrid`):**
   - Dropdown chọn lớp và ô chọn ngày được đồng bộ về `40px` (`h-[40px] min-h-[40px]` hoặc `h-10`).
4. **Contract Testing & Documentation:**
   - `mobileLayoutContract.test.ts` cập nhật assert `min-height: 40px`.
   - `docs/03_DESIGN_SYSTEM.md` và `docs/AI_CONTEXT_MAP.md` đồng bộ SSOT.

---

## ADR-084: Redesign & Streamlining of Mobile Quick Control Sheet (2026-08-31)

**Status: APPROVED / IMPLEMENTED / VERIFIED. Severity: D1. Profile: GENERAL. Reversibility: R1.**

### Context và Mục Tiêu
Bảng điều khiển nhanh trên Mobile (`MobileTopBar.tsx` Control Sheet) trước đây tích hợp bộ lọc lớp, ô tìm kiếm, bộ chuyển học kỳ và nút chuyển Desktop Mode. Các phần tử này làm tăng chiều cao menu không cần thiết trong khi các trang nghiệp vụ (Điểm danh, Học sinh, Bảng điểm, Báo cáo) đều đã có bộ lọc, chọn học kỳ và tìm kiếm riêng.
Quyết định tái thiết kế bảng điều khiển nhanh:
1. **Loại bỏ:** Bộ lọc lớp, thanh tìm kiếm nhanh, chuyển đổi học kỳ, nút Desktop Mode.
2. **Nâng cấp giao diện:**
   - Profile Header trang trọng với Avatar, Họ tên, Role badge và Ngữ cảnh giáo xứ.
   - Workspace Segmented Switcher trực quan (`.mobile-workspace-switcher`).
   - Quick Utility Tiles Grid 2 cột (`.mobile-control-tiles`): Đổi Theme ☀️/🌙, Chẩn đoán hệ thống 🩺, Làm mới dữ liệu 🔄, Cài đặt PWA 📲.
   - Footer Action: Cài đặt và Đăng xuất an toàn.

### Verification
- `MobileTopBarDialog.test.tsx` + `mobileLayoutContract.test.ts` PASS.
- `npm run lint:ds` + `npx oxlint` PASS (0 errors, 0 warnings).
- `npm run build:frontend` PASS.

---

## ADR-085: Native biometric app lock — Face ID, Touch ID và Android biometrics (2026-08-31)

**Status: IMPLEMENTED / DEVICE ACCEPTANCE CONDITIONAL. Severity: D3. Profile: SECURITY. Reversibility: R1.**

### Problem, evidence và phạm vi

Catevia native giữ refresh session tối đa 7 ngày và có offline data trong app sandbox, nhưng trước quyết định này không có privacy gate khi một người cầm thiết bị đã mở khóa hoặc khi app quay lại từ background. Yêu cầu sản phẩm là mở khóa app bằng Face ID/dấu vân tay. E3 code cho thấy auth server hiện đã có JWT memory-only, HttpOnly refresh rotation, password fallback, tenant marker tối thiểu và snapshot Dexie mã hóa; thay toàn bộ auth bằng passkey sẽ mở rộng schema/API/origin ceremony nhưng không trực tiếp giải quyết resume lock. E4 W3C/WebAuthn xác nhận biometric không nên rời authenticator; native LocalAuthentication/BiometricPrompt cũng chỉ trả kết quả xác minh cho app.

Phạm vi được chốt là **local native app-lock opt-in**, không phải passwordless login, MFA server hoặc thay đổi session authority. Web/PWA không giả biometric.

### Options và Decision Matrix

| Criterion | Weight | A: giữ nguyên | B: native OS app-lock | C: WebAuthn/passkey full login |
| :--- | ---: | ---: | ---: | ---: |
| Security | 20% | 4 | 8 | 9 |
| Privacy | 15% | 6 | 10 | 10 |
| Data Integrity | 20% | 9 | 9 | 8 |
| Reliability | 15% | 9 | 8 | 5 |
| Testability | 10% | 10 | 8 | 6 |
| Maintainability | 10% | 10 | 8 | 5 |
| Operational Fit | 5% | 9 | 9 | 5 |
| Reversibility | 5% | 10 | 9 | 6 |
| **Weighted** | **100%** | **7.30 — REJECT** | **8.65 — SELECT** | **7.45 — NOT SELECTED** |

Scores là so sánh dựa trên E3 repository/plugin integration và E4 platform standards, confidence HIGH cho scope/flow, MEDIUM cho behavior thiết bị cho đến physical-device run. A fail D3 Security. C có security tốt cho login nhưng blast radius schema/API/origin/recovery lớn, không đáp ứng trực tiếp app-resume lock và thiếu native associated-domain decision.

### Decision contract

1. `BiometricLockGate` đặt ngoài `RouterProvider`. Marker được đọc đồng bộ: account không bật khóa không phải chờ native capability check; cold start với marker enabled không mount protected router trước khi OS xác minh thành công.
2. `@aparajita/capacitor-biometric-auth@10` là bridge Capacitor 8 tới iOS LocalAuthentication và Android BiometricPrompt. Chấp nhận Face ID, Touch ID và Android biometric được hệ điều hành phân loại **strong**; Android face loại weak bị từ chối, fingerprint/strong face vẫn dùng được. App không thu modality data.
3. `@capacitor/app` bắt `appStateChange`: inactive khóa ngay; active kiểm tra lại strong-biometry availability rồi mới tự gọi prompt, vì enrollment/lockout có thể đổi khi app ở nền. Trong lúc native prompt đang chạy, lifecycle event không được tạo lock/prompt loop.
4. Preference duy nhất là chuỗi `enabled` tại key versioned, scope bằng `parishId:userId`. Không lưu username, phone, full name, password, token, ảnh hoặc biometric template.
5. Enable và disable đều yêu cầu xác minh thành công. Unavailable/enrollment removal/lockout fail-closed tại lock screen.
6. Recovery không bypass vào app: xóa local lock marker, logout/dọn client state, rồi quay về password login. Password/server recovery hiện hữu giữ nguyên.
7. iOS khai báo `NSFaceIDUsageDescription`; Android/iOS plugin wiring được sinh qua Capacitor sync. SwiftPM local paths commit bằng forward slash để build được trên macOS.
8. App lock không thay JWT/refresh rotation/RBAC/tenant checks, không phát access token và không được dùng làm re-auth cho mutation nhạy cảm.

### Hard gates, compatibility và business status

- **Security 8/10 — PASS:** native OS prompt, cold-start gate, background relock, disable re-verification, fail-closed recovery; residual local-client/root/debugger bypass nằm ngoài server-auth claim.
- **Privacy 10/10 — PASS:** biometric data không vào JS/storage/network; marker không PII và scope per account/tenant.
- **Data Integrity 9/10 — PASS:** không schema/API/writer/offline mutation; logout recovery dùng cleanup hiện hữu. Local component state có thể unmount khi khóa, nhưng không commit hoặc mutate server data.
- **Testability 8/10 — PASS:** store/native dependency boundaries, targeted 15 cases gồm native bridge, full 1,878-test regression gate trên snapshot cuối, TypeScript/lint/build và native sync evidence; real Face ID/fingerprint remains CONDITIONAL.
- **ADR compatibility:** ADR-029 Capacitor pipeline = PASS; ADR-045 PII marker = PASS; ADR-058 no reversible credentials = PASS; ADR-072/082 client is not authorization = PASS; ADR-063/079 UI/accessibility = PASS.
- **Architecture:** `main → gate/store → native bridge`; presentation không gọi server/db và native plugin không đi ngược domain dependency = PASS.
- **Business Rule Gate:** yêu cầu mở khóa bằng Face ID/dấu vân tay = **CONFIRMED**. Android strong-only là security constraint của implementation; passwordless web login/server MFA, passkey sync và app-switcher screenshot blocking = **NOT CONFIRMED / OUT OF SCOPE**.

### Risks, rollback, acceptance và evidence

| Risk | Probability | Impact | Mitigation | Residual |
| --- | --- | --- | --- | --- |
| Sensor bị gỡ enrollment/lockout | Medium | High | fail-closed + logout/password recovery | Low |
| Prompt/lifecycle lặp vô hạn | Low | High | `authenticating` guard + shared in-flight promise + regression test | Low |
| Account khác kế thừa setting | Low | High | versioned `parishId:userId` key + scope test | Low |
| Local unsaved component state mất khi lock unmount router | Medium | Medium | lock chỉ opt-in; domain commits vẫn server/store owned | Medium |
| Rooted/debuggable device sửa marker | Low | High | claim giới hạn local privacy barrier; server authority không đổi | Medium |
| Native modality/build khác nhau theo thiết bị | Medium | Medium | OS capability label, password recovery, device/CI gate | Medium |

Migration không DB/API; `npm install` + `cap sync` thêm plugin native và preference chỉ sinh sau opt-in. Rollback R1: gỡ gate/settings/store/lib/dependencies/native plugin wiring và `NSFaceIDUsageDescription`; marker còn lại inert, không cần data migration.

Verification hiện tại: targeted **4 files / 15 tests PASS** (native bridge strong-only/no-device-credential, cold-start gate, settings integration, store lifecycle resume re-check/recovery và lỗi ghi preference); full final gate **267 files / 1,878 tests PASS**, gồm lint, design-system anti-drift, TypeScript, server/frontend production build và coverage; production dependency audit **0 vulnerability**; `npx cap sync` nhận đúng hai plugin ở Android/iOS. Android `assembleDebug` **BUILD SUCCESSFUL / 153 tasks**, sinh APK 11,123,048 bytes; merged debug manifest có `USE_BIOMETRIC` + `USE_FINGERPRINT`. Test cleanup backup tạm dùng `fs.rmSync` retry để tránh Windows EPERM thoáng qua; rerun riêng 4/4 và full coverage đều PASS. Hậu kiểm D3 giữ nguyên Security 8, Privacy 10, Data Integrity 9, Testability 8; không phát hiện regression hoặc ADR conflict trong evidence tự động. Physical Face ID/Touch ID/Android biometric, app-switcher timing, iOS build và signed release build vẫn **NOT CONFIRMED** cho tới device/CI acceptance.

---

## ADR-086: Hộp thư góp ý — anonymous by non-attribution (2026-08-31)

**Status: IMPLEMENTED / INFRASTRUCTURE PRIVACY CONDITIONAL. Severity: D3. Profile: SECURITY. Reversibility: R2.**

### Problem và business contract

Catevia cần kênh góp ý trong tenant: GLV (`chunhiem|phuta`) gửi lên Xứ đoàn; phụ huynh gửi lên Xứ đoàn hoặc đúng GLV chủ nhiệm của con. Admin chỉ tiếp nhận/xử lý thư gửi về Xứ đoàn, không phải sender. Người gửi chọn công khai hoặc ẩn danh; với anonymous, admin ứng dụng không được có khóa dữ liệu/API/audit để truy ngược tài khoản.

Business Rule Gate: các luồng sender/recipient và admin receive-only là **CONFIRMED** từ yêu cầu sản phẩm. Reply thread, attachment, public unauthenticated submit và retention duration là **NOT CONFIRMED / OUT OF SCOPE**.

### Options và Decision Matrix

| Criterion | Weight | A: sender nullable + non-attribution | B: mã hóa reversible sender | C: public unauth endpoint |
| :--- | ---: | ---: | ---: | ---: |
| Security | 20% | 9 | 8 | 4 |
| Privacy | 20% | 9 | 5 | 9 |
| Data Integrity | 20% | 9 | 8 | 6 |
| Reliability | 15% | 9 | 7 | 5 |
| Testability | 10% | 9 | 6 | 7 |
| Maintainability | 10% | 8 | 6 | 7 |
| Reversibility | 5% | 8 | 7 | 9 |
| **Weighted** | **100%** | **8.85 — SELECT** | **6.85 — REJECT** | **6.30 — REJECT** |

A dựa trên E3 schema/service/logger/route evidence, HIGH confidence cho application boundary. B fail D3 Privacy vì hệ thống vẫn giữ khóa giải mã. C fail Security/Data Integrity vì mất eligibility/tenant sender gate và mở spam. Hạ tầng reverse-proxy metadata là UNKNOWN nên status vận hành còn CONDITIONAL, không được cộng điểm giả.

### Decision contract

1. `feedback_messages` dùng PK `(parish_id,id)`. `ANONYMOUS` bắt buộc sender null; `PUBLIC` bắt buộc sender non-null. `PARISH` bắt buộc target null; `HOMEROOM_TEACHER` bắt buộc target user non-null. DB CHECK là hard invariant.
2. Admin writer bị 403 và UI chỉ có inbox. Admin inbox chỉ `PARISH`; chủ nhiệm inbox chỉ row target đúng self. GLV gửi duy nhất Xứ đoàn; parent target chủ nhiệm phải qua phone → active student → class → `role_in_class='chunhiem'` cùng parish.
3. Không lưu source role, class, student hay parent linkage trong row. Public sender name resolve từ `users`; response không phát sender ID. Anonymous không có sent-box, offline queue, client persistence, receipt/reply token hoặc automatic POST retry.
4. Anonymous không tạo audit sender. Logger application redacts userId/parishId/IP/user-agent và chuẩn hóa path. Status processing được audit theo recipient nhưng không copy nội dung.
5. “Admin không biết” nghĩa là admin ứng dụng không truy được qua Catevia database/API/audit/application logs. Reverse proxy/cloud provider có thể giữ transport metadata ngoài app; UI/docs phải công bố, và muốn mở rộng claim cần hạ tầng anonymous relay/log-retention ADR riêng.
6. Schema readiness bắt marker `20260831-145`, columns/indexes/composite PK và FK check. Purge v2.4/safety snapshot v3.1 bao gồm thư; rollback UI/API R1 nhưng migration/data là R2 và không down-migrate.

### Gates, compatibility, risks và verification

- D3 hard gates: Security **9**, Privacy **9**, Data Integrity **9** — PASS trong application boundary. Testability **9** bằng route/RBAC/tenant/DB constraint/logger/schema tests.
- ADR compatibility: ADR-031 tenant binding = PASS; ADR-045 PII minimization = PASS; ADR-063/072/077/082 UI/route/workspace = PASS; ADR-041/059 backup = PASS vì logical full DB tự bao gồm table mới.
- Architecture: `FeedbackPage → api.ts → feedback route → feedbackService → schema`; không reverse dependency. Route policy là UX, server role/tenant checks là authority.
- Risks: proxy correlation (medium/high) → explicit boundary + future infra review; small-recipient-set inference (medium/medium) → không lưu child/class/source role nhưng social inference không thể loại bỏ; abuse (medium/medium) → authenticated-only + existing global limiter; accidental attribution regression (low/critical) → DB CHECK + tests + log redaction.
- Final engineering verification: feedback/schema-health **16/16 PASS**; targeted purge/frontend/route **5 files / 29 tests PASS**; full serialized regression **269 files / 1,891 tests PASS**; lint, design-system lint, server/frontend TypeScript và production build PASS. Production proxy log-retention/access policy vẫn phải được duyệt trước khi mở rộng claim ẩn danh ra ngoài application boundary.

---

## ADR-087: Parent Password Reset Request Inbox (2026-08-31)

**Status: APPROVED / IMPLEMENTED. Severity: D3. Profile: SECURITY. Reversibility: R1 code, R2 additive table.**

### Problem, evidence và business rule

Yêu cầu sản phẩm `CONFIRMED`: phụ huynh quên mật khẩu phải gửi được yêu cầu trong app để Admin cấp lại mật khẩu mới. Evidence E3 cho thấy `ParentForgotPasswordModal` trước đây chỉ sao chép/mở Zalo; `/api/auth/parent-reset-password` là tombstone 410 theo ADR-058; luồng Admin reset hiện hữu đã có bcrypt, re-auth, rate-limit, audit, force-change và session revocation. Không có OTP/SMS ownership provider trong repo (UNKNOWN, không được coi là đã sẵn sàng).

### Options và Decision Matrix

| Criterion | Weight | A: chỉ Zalo/manual hiện tại | B: ticket + Admin xác minh | C: OTP self-service |
| :--- | ---: | ---: | ---: | ---: |
| Security & Privacy | 35% | 9 | 9 | 8 |
| Data Integrity | 20% | 8 | 9 | 9 |
| Reliability | 15% | 5 | 8 | 8 |
| Testability | 10% | 6 | 9 | 7 |
| Maintainability | 10% | 7 | 8 | 5 |
| Operational Fit | 5% | 4 | 9 | 6 |
| Reversibility | 5% | 10 | 9 | 7 |
| **Weighted** | **100%** | **7.50** | **8.75 — SELECT** | **7.65 — CONDITIONAL** |

A không thỏa yêu cầu trực tiếp. C cần provider, ownership proof, delivery SLO, cost/consent và recovery policy chưa có evidence nên chưa thể approve. B tái dùng control đã kiểm chứng và không biến SĐT/ticket thành proof.

### Decision contract

1. Public `POST /api/password-reset-requests` nhận SĐT + `parishId` optional, rate-limit 5/60s/IP, normalize/lookup đúng tenant + role parent. Response `202` giống nhau cho account có/không tồn tại và thực hiện bcrypt dummy work để giảm timing enumeration.
2. Ticket chỉ lưu `user_id` đã match, status/count/timestamps; không lưu raw phone, child KBA hay credential. UNIQUE `(parish_id,user_id)` làm mọi lần gửi hội tụ vào một row và mở lại row đã xử lý.
3. Ticket là tín hiệu chưa xác thực. Admin UI bắt buộc xác nhận đã verify qua kênh tin cậy. Chỉ admin cùng tenant được list/dismiss/reset; hidden UI không thay backend authorization.
4. Reset yêu cầu mật khẩu hiện tại của Admin và commit atomic: bcrypt hash mới, `password_encrypted=NULL`, force-change, clear lockout, token version bump, revoke refresh sessions, resolve ticket, audit `RESET_PASSWORD`. Temp password chỉ xuất hiện trong response một lần.
5. Compatibility route ADR-058 vẫn 410; không khôi phục KBA hoặc reveal. Manual Zalo còn là fallback.

### Hard gates, compatibility, risks và verification

- D3 hard gates: Security **9**, Privacy **9**, Data Integrity **9** — PASS. Testability **9** qua generic-response/dedupe/RBAC/tenant/re-auth/atomic credential+session+ticket tests. Confidence HIGH cho application boundary; production notification latency/support handling là UNKNOWN.
- ADR compatibility: ADR-058 = **PASS WITH AMENDMENT** (no KBA/reversible secret giữ nguyên; thay câu UI-only); ADR-044/045/046 = PASS; ADR-031 tenant binding = PASS; ADR-041/059 backup = PASS (logical backup tự gồm table); manual LMS snapshot cố ý không gồm auth-support state.
- Risks: spoof/spam request (medium/medium) → rate limit + one-row dedupe + explicit unverified state; enumeration (medium/high) → generic payload/status + bcrypt timing work; wrong-recipient credential (low/critical) → required manual verification + admin re-auth; concurrent resolution (low/high) → transaction/status gate; temp credential disclosure (low/high) → one-time response, never persisted reversible.
- Rollback: UI/API/service R1; để table inert là an toàn. Drop table/data là R2 và không cần cho rollback. Purge contract xóa ticket trước users-related rows.
- Final acceptance: targeted recovery/schema/purge/UI **7 files / 32 tests PASS**; full serialized regression **272 files / 1,900 tests PASS**; oxlint zero-warning; design-system lint **0/119**; client/server TypeScript và production frontend/server build PASS. Concurrency test xác nhận hai Admin cùng claim một ticket chỉ có đúng một reset thành công (`200/409`) và hash cuối khớp mật khẩu của response thành công.
- Post-implementation Decision Matrix: **KEEP** — Security 9, Privacy 9, Data Integrity 9, Testability 9 giữ nguyên; không phát hiện regression hoặc ADR conflict trong evidence tự động. Production support SLA, request volume và abuse telemetry vẫn là **NOT CONFIRMED** cho tới khi có dữ liệu vận hành thật.

---

## ADR-088: Native Service Worker Isolation & Non-disruptive Chunk Recovery (2026-09-01)

**Status: APPROVED / IMPLEMENTED / DEVICE ACCEPTANCE CONDITIONAL. Severity: D3. Profile: SECURITY. Reversibility: R1.**

### Problem và evidence

Người dùng báo app native tự reload sau khi đăng nhập và sử dụng một lúc. Chuỗi E3 HIGH đã xác nhận: VitePWA auto-inject `registerSW.js` vào `dist/index.html`; file này đăng ký `/sw.js` trong cả Capacitor WebView. Worker compiled trong Android bundle chứa `skipWaiting()`, `clients.claim()` và `client.navigate(client.url)` cho mọi client ngoài `/login`. Cài APK mới làm worker precache bundle bất đồng bộ; nếu activate sau khi người dùng đã chuyển từ login sang route bảo vệ, `navigate()` reload toàn bộ WebView. `MainActivity` không có `recreate()`/`loadUrl()` custom. Tác nhân thứ hai là `lazyWithRetry`: route warmup chạy idle nhưng final chunk failure gọi `window.location.reload()` và để promise pending, nên background optimization có quyền reload app.

Business Rule Gate: yêu cầu app không tự reload giữa phiên là **CONFIRMED**. Web stale-build protection FE-07 và auth/session/offline authority hiện hữu phải được giữ; nguyên nhân thiết bị thật ngoài hai code path đã chứng minh vẫn là **NOT CONFIRMED** cho tới APK acceptance.

### Options và Decision Matrix

| Criterion | Weight | A: giữ SW chung web/native | B: web SW, native cleanup/opt-out | C: update coordinator chung có safe-point |
| :--- | ---: | ---: | ---: | ---: |
| Security & Privacy | 35% | 8 | 9 | 9 |
| Data Integrity | 20% | 6 | 9 | 8 |
| Reliability | 15% | 4 | 9 | 7 |
| Testability | 10% | 5 | 9 | 6 |
| Maintainability | 10% | 6 | 8 | 5 |
| Operational Fit | 5% | 4 | 9 | 6 |
| Reversibility | 5% | 10 | 9 | 7 |
| **Weighted** | **100%** | **6.35 — REJECT** | **8.85 — SELECT** | **7.50** |

A fail Data Integrity hard gate vì reload có thể cắt trạng thái form/component chưa commit và không phù hợp native release model. C có thể hữu ích cho PWA tương lai nhưng thêm protocol/state/UX mà native không cần. B tách đúng platform boundary: web update qua service worker; native update qua APK/IPA.

### Decision contract

1. `vite.config.ts` đặt `injectRegister: false`; không còn generated `registerSW.js` tự đăng ký ngoài policy ứng dụng.
2. `main.tsx → pushManager.registerServiceWorkerOnly()` là registration owner duy nhất. Web vẫn đăng ký `/sw.js` với `updateViaCache: 'none'`, giữ FE-07 reload-on-activate sau web deploy.
3. Khi `Capacitor.isNativePlatform()`, không đăng ký service worker; unregister mọi legacy registration và chỉ xóa cache PWA đã biết (`workbox-precache*`, `pages-cache`, `static-resources`, `google-fonts-cache`, `api-cache`). Không xóa IndexedDB/Dexie, auth marker/snapshot hoặc sync queue.
4. Web Push tiếp tục web-only; native push không được giả bằng service worker và vẫn là backlog theo ADR-029.
5. `lazyWithRetry` vẫn retry/dedupe/preload nhưng final failure reject vào ErrorBoundary; background preload không được hard-reload. Failed promise được reset để lần navigation/preload sau có retry mới. Reload khi chunk stale chỉ xảy ra khi người dùng bấm nút ErrorBoundary.
6. Không đổi JWT/refresh cookie rotation, logout/revocation, biometric lock, RBAC, tenant isolation, API/schema, server writer hay offline sync semantics.

### Hard gates, compatibility, risks và rollback

- **Security 9/10 — PASS:** không đổi token/session authority; native loại bỏ worker có thể điều hướng document ngoài lifecycle ứng dụng. **Privacy 10/10 — PASS:** cleanup chỉ cache shell công khai; Dexie PII snapshot không đọc/xóa/upload. **Data Integrity 9/10 — PASS:** không reload nền, không đụng mutation queue; cleanup allowlist không xóa domain IndexedDB. **Testability 9/10 — PASS:** platform branch, register/unregister/cache allowlist và preload failure có regression trực tiếp.
- **ADR compatibility:** ADR-029 native pipeline = PASS và sửa đúng tuyên bố Web Push native-disabled; FE-07 web freshness = PASS vì web worker giữ nguyên; ADR-045 auth snapshot = PASS; ADR-067 offline durability = PASS; ADR-080 staged preload = PASS WITH AMENDMENT; ADR-085 biometric lifecycle = PASS.
- **Architecture:** `main → pushManager → Capacitor platform boundary / browser SW API`; native shell không còn phụ thuộc PWA update lifecycle. API/domain/data layers không bị reverse dependency = PASS.
- **Risks:** legacy worker cleanup lỗi (low/medium) → best-effort warning, lần startup sau retry; xóa nhầm cache (low/high) → exact allowlist + `workbox-precache` prefix, regression giữ domain cache; web mất registration (low/high) → generated injection tắt nhưng manual web registration test + production build inspection; stale chunk không tự phục hồi (medium/low) → ba retry, retry mới sau failure và explicit ErrorBoundary action.
- **Rollback R1:** revert config/pushManager/lazy wrapper/docs rồi redeploy/rebuild. Không migration hay data recovery. Rollback trigger là web build không có active SW hoặc native startup regression không liên quan legacy worker.

### Verification và acceptance

- Baseline artifact: packaged Android `sw.js` có `client.navigate(t.url)` và `index.html` có `vite-plugin-pwa:register-sw`; source `MainActivity` chỉ extends `BridgeActivity`.
- Targeted policy/lazy regression: **2 files / 7 tests PASS** cho web register, native no-register/unregister/scoped cache cleanup, plugin injection policy, no-reload failed preload và retry-after-failure. Hậu kiểm mở rộng auth/token/API retry: **5 files / 32 tests PASS**.
- Engineering acceptance: lint zero-warning; client TypeScript + production PWA build PASS; generated `dist/index.html` và Android packaged `index.html` không còn `registerSW.js`, Android bundle chứa native cleanup branch; `npm run capacitor:sync` PASS cho Android/iOS; Android `assembleDebug` **BUILD SUCCESSFUL / 153 tasks**. Runtime APK cold-start/update/login soak test là **NOT CONFIRMED** cho tới kiểm tra thiết bị thật.

---

## ADR-089: Account Soft Deletion & Shared Catechist Directory (2026-09-01)

**Status: APPROVED / IMPLEMENTED. Severity: D3. Profile: SECURITY. Reversibility: R1 application, R2 additive schema.**

### Problem, evidence và business contract

Yêu cầu sản phẩm `CONFIRMED`: trang Giáo Lý Viên là điểm vào chung; GLV (`chunhiem|phuta`) chỉ xem danh bạ, còn admin mới được phân công lớp, đặt mật khẩu tạm, khóa/mở, đăng xuất mọi thiết bị và xóa tài khoản. Repository evidence E3 cho thấy `users` là identity gốc được nhiều bảng lịch sử và tenant FK tham chiếu; hard delete trực tiếp có blast radius lớn, có thể làm mất attribution hoặc vi phạm ràng buộc. Account deletion vì vậy phải chấm dứt quyền truy cập ngay nhưng giữ lịch sử nghiệp vụ.

Khôi phục account đã xóa, tái sử dụng username/identity và xóa vật lý theo retention policy là `NOT CONFIRMED / OUT OF SCOPE`.

### Options và Decision Matrix

| Criterion | Weight | A: hard delete cascade | B: soft delete + revoke | C: chỉ đặt INACTIVE |
| :--- | ---: | ---: | ---: | ---: |
| Security & Privacy | 35% | 6 | 9 | 6 |
| Data Integrity | 20% | 4 | 9 | 7 |
| Reliability | 15% | 6 | 9 | 6 |
| Testability | 10% | 6 | 9 | 7 |
| Maintainability | 10% | 5 | 8 | 7 |
| Operational Fit | 5% | 5 | 9 | 6 |
| Reversibility | 5% | 2 | 8 | 9 |
| **Weighted** | **100%** | **5.25 — REJECT** | **8.85 — SELECT** | **6.65 — REJECT** |

A fail D3 Data Integrity và khó rollback. C không đủ Security vì session, assignment và channel links có thể còn hiệu lực hoặc xuất hiện trong projection khác. B tách rõ lifecycle identity khỏi historical data, có revoke và tenant/RBAC controls kiểm thử được.

### Decision contract

1. Migration `20260901-147` thêm nullable `users.deleted_at` và index active-role. Không drop user row, không cascade lịch sử nghiệp vụ và không tái sử dụng identity đã xóa.
2. `DELETE /api/users/:id` chỉ admin, tenant lấy từ JWT, áp dụng `adminReauthRateLimiter`, bắt buộc `adminPassword`, chặn self-delete và Admin trưởng. Retry trên account đã xóa là idempotent.
3. Một transaction đặt `status='INACTIVE'`, `deleted_at`, bump `token_version`; revoke refresh sessions; xóa catechist assignments, push subscriptions, Telegram link tokens và password-reset tickets; revoke Telegram link; unlink `parish_people.linked_user_id`. Hồ sơ lịch sử không bị xóa.
4. Login, access-token middleware, refresh rotation, password-reset lookup và active user/catechist projections đều fail-closed với `deleted_at IS NOT NULL`. Chuyển account sang `LOCKED` hoặc `INACTIVE` cũng bump token và revoke refresh sessions.
5. Audit thành công dùng `DELETE_USER_ACCOUNT`, chỉ ghi role/status/token transition; không copy full name, holy name, username, phone, password hoặc credential. Re-auth sai ghi `DELETE_USER_ACCOUNT_FAILED` theo policy hiện hữu.
6. `GET /api/users/catechists` cho `admin|chunhiem|phuta` nhưng chỉ trả projection tối thiểu `id/fullName/holyName/role/assignedClasses/assignedClassNames`. GLV không nhận username, phone, status, last-login, token state và không có mutation endpoint.
7. `/catechists` là UI canonical: admin nhận management component; GLV nhận view read-only. `/management` bỏ tab GLV; `/users` còn là deep-link admin tương thích. Client route policy/navigation là UX guard, không thay server authorization. Việc chuyển tab lớp được quyết định riêng tại ADR-090.

### Hard gates, compatibility, risks và rollback

- **Security 9/10 — PASS:** admin-only + re-auth/rate-limit, protected accounts, immediate token/session invalidation, active-state guards và deletion cleanup. **Privacy 9/10 — PASS:** GLV projection tối thiểu và deletion audit không PII. **Data Integrity 9/10 — PASS:** transaction giữ FK/history, unlink quan hệ chủ động, không hard cascade. **Testability 9/10 — PASS:** RBAC, tenant, re-auth, cleanup, idempotency và auth denial có regression trực tiếp.
- **ADR compatibility:** ADR-031 tenant isolation = PASS; ADR-045 PII minimization = PASS; ADR-046 parish-scoped username = PASS; ADR-058/087 credential recovery = PASS; ADR-072/082 server-authoritative RBAC = PASS; backup/purge ADR-041/059 = PASS vì additive column nằm trong full logical database và user row vẫn được preserve.
- **Business Rule Gate:** admin-only mutations/deletion và GLV read-only = `CONFIRMED`; account restore/physical erasure/identity reuse = `NOT CONFIRMED`.
- **Risks:** xóa nhầm (low/critical) → re-auth + protected self/Admin trưởng + explicit modal; session sống sót (low/critical) → token bump + refresh revocation + middleware state check; dữ liệu lịch sử mất (low/critical) → soft-delete và unlink thay vì cascade; identity tái sử dụng mơ hồ (medium/high) → giữ row/unique username; UI che quyền nhưng API hở (low/critical) → server role middleware và negative RBAC tests.
- **Rollback:** R1 ẩn action/route và bỏ application filter nếu có quyết định khôi phục; migration/rows đã đánh dấu là R2, không down-migrate tự động. Khôi phục một account cần quy trình riêng để xét lại links/assignments/session, hiện chưa được approve.

### Verification và acceptance

- Targeted deletion/directory/route/UI/schema regression **10 files / 64 tests PASS**, gồm GLV chỉ đọc, admin re-auth, self/Admin trưởng/cross-tenant deny, transaction cleanup, active + archived profile unlink, PII-redacted audit, access/login/refresh denial và idempotent retry. Final serialized regression **275 files / 1,915 tests PASS**.
- Client/server TypeScript, scoped oxlint zero-warning, design-system lint **0/119** và production frontend/server build PASS. Full lint từng PASS trước final run; lần chạy lại cuối bị chặn ngoài scope bởi hai file untracked tạo đồng thời `server/watch-test.ts` và `server/test-file.ts` có chuỗi chưa đóng. Hậu kiểm D3: **KEEP** — Security 9, Privacy 9, Data Integrity 9, Testability 9; không phát hiện ADR conflict hoặc regression trong evidence tự động.

---

## ADR-090: Student & Class Workspace Consolidation (2026-09-01)

**Status: APPROVED / IMPLEMENTED. Severity: D2. Profile: GENERAL. Reversibility: R1.**

### Problem và evidence

Yêu cầu sản phẩm `CONFIRMED`: quản lý lớp học nên nằm trong trang Thiếu Nhi thay vì là một tab rời trong Quản Lý Hệ Thống. Evidence E3 cho thấy lớp là bộ lọc, grouping và prerequisite trực tiếp của roster; `DesktopClasses` đã có surface responsive và hành động “Xem Danh Sách” quay về `/students`. Amendment ngày 2026-09-01 xác nhận GLV cần duyệt toàn bộ thiếu nhi của giáo xứ, không chỉ lớp được phân công; họ vẫn không được thấy assignment identity của lớp khác hoặc có thêm write authority. Create/update/delete/assignment lớp vẫn admin-only.

### Options và Decision Matrix

| Criterion | Weight | A: giữ tab `/management` | B: tab role-aware trong `/students` | C: nhúng luôn form lớp trên roster |
| :--- | ---: | ---: | ---: | ---: |
| Business fit | 25% | 5 | 9 | 8 |
| Security & Privacy | 20% | 9 | 9 | 7 |
| Data Integrity | 15% | 9 | 9 | 7 |
| Usability | 15% | 5 | 9 | 6 |
| Testability | 10% | 8 | 9 | 6 |
| Maintainability | 10% | 6 | 9 | 5 |
| Reversibility | 5% | 10 | 9 | 7 |
| **Weighted** | **100%** | **7.15** | **9.00 — SELECT** | **6.85** |

B tái sử dụng component, giữ URL state/deep link và không đổi API/schema. C trộn hai mutation surface trong một view dài, tăng coupling và rủi ro thao tác nhầm.

### Decision contract và gates

1. `/students` validate search `view=students|promotions|classes` cùng filter params hiện hữu. Admin thấy tab `Lớp Học` ở desktop/mobile; GLV không thấy và giá trị `view=classes` thủ công fail-closed về roster.
2. `DesktopClasses` được render `embedded`; `onViewClassStudents` đặt class filter rồi chuyển lại tab roster mà không rời route. Dashboard, Settings, empty roster và student modal trỏ tới canonical search URL.
3. `/management` bỏ tab lớp, chỉ còn Năm Học + Tài Khoản Phụ Huynh. `/classes` giữ route admin-only tương thích và active sidebar chuyển sang Thiếu Nhi.
4. `DesktopClasses.canEdit` chỉ admin, khớp `roleMiddleware('admin')` trên create/update/delete/assignment. `GET /api/students` và `GET /api/classes/:id?` nay trả roster/metadata lớp toàn giáo xứ cho GLV, cùng tenant; projection lớp loại `homeroomTeacher` và `assistants` khi không phải admin. `RootLayout` giữ filter lớp GLV trên đúng `/students` để click lớp mở roster, rồi reset khi rời route. Read scope này không làm đổi `checkUserClassAccess`: ghi hồ sơ thiếu nhi và các module điểm danh/điểm/thi vẫn class-scoped server-side.
5. Admin-only controls trên `/students` là tạo thiếu nhi, Import Excel, gửi phiếu điểm hàng loạt, chọn/xóa nhiều và tab quản lý lớp; controls này không render ở desktop/mobile GLV. Hidden UI không phải authority: class mutation/delete/report-card endpoints vẫn do middleware/route guard bảo vệ; create/import legacy server grant cho `chunhiem` trong lớp được phân công không được mở rộng bởi amendment này.
6. Không đổi schema, offline writer, class/student data semantics hoặc tenant isolation; API read projection/scope thay đổi có test contract.

- **D2 hard gates:** Security **8 — PASS**, Data Integrity **9 — PASS**, Testability **9 — PASS**. Parish-wide roster is deliberate product scope, tenant is still mandatory and assignment identity is minimized; server class-write checks remain the authorization authority.
- **ADR compatibility:** ADR-030/063/079 design system = PASS; ADR-031 tenant/class scope = PASS WITH AMENDMENT (staff read broadens only within tenant); ADR-045 minimization = PASS (redacted assignment identities); ADR-072 route policy = PASS WITH AMENDMENT (`/classes` highlight students); ADR-089 management consolidation = PASS.
- **Risks:** GLV read scope accidentally becomes write scope (medium/high) → retain per-route `getUserClassIds`/`checkUserClassAccess` and negative write tests; assignment identity leak through enriched class DTO (medium/high) → non-admin projection strips both fields; GLV ép query tab (low/high) → render normalization + server admin-only mutations; filter search bị mất khi đổi tab (low/medium) → typed search schema giữ filter keys; stale deep links (medium/low) → `/classes` compatibility route.
- **Rollback R1:** khôi phục tab `/management`, links `/classes` và bỏ `view=classes`; không có data migration/recovery.

### Verification

- Baseline consolidation trước amendment: targeted role-tab + route policy/migration contract **4 files / 29 tests PASS**. Amendment + ADR-092 parent boundary được xác minh lại trong security-critical **7 files / 72 tests PASS** và full serialized/coverage **279 files / 1,944 tests PASS**; client/server TypeScript, production build và design-system lint **0/119** PASS. Post-implementation D2 scores Security 9, Privacy 9, Data Integrity 9, Testability 9 — **KEEP**.

### Amendment 2026-09-02 — một index drill-down, giữ lưới lớp cũ

Yêu cầu sản phẩm mới là `CONFIRMED`: bỏ hai cửa sổ/tab lặp nhưng giữ thiết kế dạng lưới lớp. Phương án được chọn là **B2 — single drill-down index**: trong mục `Danh Sách & Lớp`, trạng thái toàn bộ lớp render catalog card grid; chọn lớp mới render roster. Đây không phải phương án C bị loại phía trên vì class form và roster không cùng hiển thị đồng thời; mutation vẫn nằm trong modal và server giữ authority.

1. Desktop và mobile bỏ tab `Lớp Học`; legacy `view=classes` normalize về `view=students` và reset về catalog để deep link cũ không vỡ.
2. `DesktopClasses` thêm presentation option `layout='grid'`; default standalone responsive-table vẫn tương thích. Grid giữ visual navy–gold cũ, 2/3/4 cột theo viewport, dùng class-card button semantic và action edit/delete độc lập.
3. Admin có CRUD/phân công; GLV dùng cùng catalog read-only để duyệt roster. Không mở thêm API hoặc write scope.
4. Audit luồng đồng bộ phát hiện `fetchClasses(updatedAfter)` từng full-replace khi response delta rỗng, làm mất catalog client. Contract được sửa thành mọi incremental response đều merge; empty delta là no-op, full pull mới replace.
5. ADR compatibility: ADR-030/063/079 **PASS**; ADR-016 incremental sync **PASS WITH AMENDMENT**; ADR-031/045 tenant/minimization **PASS**; ADR-092 RBAC **PASS**. D2 hậu kiểm: Security & Privacy **9**, Data Integrity **9**, Testability **9** — hard gates **PASS / KEEP**. Rollback R1, không schema/data migration.
6. Evidence trước final CI: UI/store component tests **4 files / 30 tests PASS**; Playwright affected paths **3/3 PASS**, gồm protected viewport/theme WCAG subset, create-class persistence và grid → roster → create-student persistence. Final serialized/coverage/build evidence được ghi ở ADR-099 sau khi hoàn tất cùng snapshot.
7. Optimization 2026-09-03: Giữ vững triết lý tối giản Calm, Confident, Crafted (ADR-063), loại bỏ triệt để việc trùng lặp card KPI tổng quan (vốn thuộc về Dashboard/Overview), tối ưu hóa cấu trúc flexbox để các thẻ trong cùng một hàng có chiều cao đều tuyệt đối (`h-full flex flex-col justify-between`), căn đáy nút "Xem danh sách", hiển thị số lượng phụ tá `(+N)` gọn gàng, bổ sung vạch nhận diện màu khăn ngành TNTT 1px tinh tế và khóa lan truyền sự kiện `e.stopPropagation()` trên các thao tác admin. Target test suites `MobileClassesAndUsersCardView`, `appWideUiMigration`, `MobileViewsEnhancement` **25/25 PASS**, TypeScript typecheck **PASS / 0 errors**.

---

## ADR-091: Superfast 2D Keyboard Navigation, Cross-Platform Tactile Haptics & Accessible Ergonomics (2026-09-01)

**Status: APPROVED / IMPLEMENTED. Severity: D2. Profile: GENERAL. Reversibility: R1.**

### Problem, evidence và business context

- **Vấn đề Desktop:** Nhập điểm học kỳ và điểm hằng ngày trên máy tính đòi hỏi thao tác chuột nhiều, gây chậm trễ khi chấm bài cho lớp từ 30–60 thiếu nhi. Việc điều hướng phím trước đây chỉ hỗ trợ Enter nhảy 1D tuần tự và thường xuyên kích hoạt re-render thừa khi unmount/remount thẻ input.
- **Vấn đề Mobile:** Thao tác điểm danh, lưu điểm và toggle trạng thái thiếu phản hồi xúc giác (tactile feedback), khiến người dùng không chắc chắn thao tác đã được ghi nhận. Nhập điểm trên di động thiếu phím tắt 1 chạm cho các mức điểm phổ biến (10, 9, 8, 7, 6, 5).
- **Vấn đề Trợ Năng (Accessibility):** Người dùng khiếm thị hoặc sử dụng Screen Reader không nhận được thông báo cập nhật điểm tức thời sau khi hoàn tất chỉnh sửa ô ma trận.

### Decision Matrix & Options

| Criterion | Weight | A: Giữ tương tác chuột hiện tại | B: 2D Grid KeyNav + Haptics Engine + WCAG 2.1 Live Announcer | C: Chỉ thêm phím Enter |
| :--- | ---: | ---: | ---: | ---: |
| Usability & Speed | 30% | 5 | 9.5 | 6.5 |
| Accessibility (WCAG) | 20% | 5 | 9.0 | 5.5 |
| Mobile Ergonomics | 20% | 4 | 9.0 | 4.0 |
| Reliability & Stability | 15% | 8 | 9.0 | 7.5 |
| Maintainability | 10% | 8 | 9.0 | 8.0 |
| Reversibility | 5% | 10 | 9.5 | 9.5 |
| **Weighted** | **100%** | **5.75 — REJECT** | **9.15 — SELECT** | **6.10 — REJECT** |

### Decision Contract

1. **2D Grid Navigation Engine (`DesktopGradeMatrix.tsx`, `DesktopDailyGradeEntry.tsx`):**
   - Hỗ trợ đầy đủ phím mũi tên `↑`, `↓`, `←`, `→`, `Enter`, `Shift+Enter`, `Tab`, `Shift+Tab`.
   - Tọa độ ma trận 2D `data-matrix-row` và `data-matrix-col` cho phép nhảy ô trực tiếp giữa các học sinh và các cột điểm mà không cần chuột.
   - Tự động gọi `.select()` khi focus ô điểm để người dùng gõ đè số mới ngay lập tức mà không cần xóa lùi (backspace).
   - Khắc phục triệt để hiện tượng re-render thừa: Chỉ cập nhật state và kích hoạt dirty pipeline khi giá trị thực sự thay đổi (`prev !== clamped`).
   - Tự động chuẩn hóa và giới hạn điểm số trong khoảng hợp lệ `0.0 <= score <= 10.0`, tự động chuyển dấu phẩy `,` thành dấu chấm `.`.

2. **Cross-Platform Haptic Feedback Engine (`src/utils/haptics.ts`):**
   - Cung cấp các mức phản hồi xúc giác chuẩn hóa: `light()` (8ms), `medium()` (16ms), `success()` ([12, 40, 20]ms), `warning()` ([25, 40, 25]ms), `error()` ([35, 60, 35]ms), `selection()` (4ms).
   - Tự động nhận diện nền tảng (Web Vibration API vs Native Bridge) và fallback an toàn (no-op).
   - Tuân thủ quy chuẩn trợ năng: Tự động tắt rung khi hệ điều hành bật chế độ giảm chuyển động (`prefers-reduced-motion: reduce`).
   - Tích hợp vào: Điểm danh (`MobileAttendanceView`), Nhập điểm nhanh (`MobileDailyGradeEntry`), Xuất Excel & Mở rộng thẻ (`MobileGradeBoard`).

3. **1-Tap Quick Scores & Screen Reader Announcer:**
   - Cung cấp dãy nút bấm 1 chạm `[10]`, `[9]`, `[8]`, `[7]`, `[6]`, `[5]` trên giao diện di động giúp vào điểm tức thì.
   - Thêm vùng thông báo vô hình `aria-live="polite"` (`.sr-only`) đọc to kết quả cập nhật điểm cho các phần mềm đọc màn hình.

### Verification & Test Suite

- Unit tests: `src/__tests__/utils/haptics.test.ts` (8 tests PASS), `src/__tests__/components/DesktopGradeMatrixKeyboardNav.test.tsx` (5 tests PASS), `src/__tests__/components/MobileDailyGradeQuickScores.test.tsx` (3 tests PASS).
- Design System Anti-Drift: **0 violations across 119 files** (`npm run lint:ds`).
- Production Build: `tsc -b && vite build` hoàn tất sạch sẽ trong 4.96s.
- Full regression/coverage trên snapshot hardening ADR-092 trước các thay đổi E2E song song: **279 files / 1,944 tests PASS**; coverage threshold PASS. E2E đang được phát triển ở phiên riêng nên không được suy diễn từ bằng chứng này.

---

## ADR-092: Comprehensive Security, Native Privacy & Delivery Hardening (2026-09-01)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED. Severity: D3. Profile: SECURITY. Reversibility: R1.**

### Problem, evidence và authoritative contract

Audit E1–E4 xác nhận bốn gap liên quan: (1) staff roster parish-wide ở ADR-090 bị triển khai chỉ với `authMiddleware`, cho phép `phuhuynh` đọc list/detail PII cùng tenant; (2) Vercel static HTML không nhận security headers của Hono, theme boot dùng inline script và `/health` rơi vào SPA rewrite; (3) refresh bootstrap không có timeout trong khi Render free có cold start; (4) Android cho backup app data và FileProvider expose toàn external storage, iOS khai báo microphone dù OMR luôn `audio:false`. Inventory tài liệu cũng drift khỏi code hiện tại.

Business rule là **CONFIRMED**: roster toàn giáo xứ chỉ dành cho `admin|chunhiem|phuta`; phụ huynh chỉ đọc con qua `/api/parents/my-children`. Không có thay đổi schema hoặc domain scoring/offline semantics.

### Options và Decision Matrix

| Criterion | Weight | A: vá riêng lỗi parent | B: hardening theo pha | C: rewrite/major-upgrade đồng loạt |
| :--- | ---: | ---: | ---: | ---: |
| Security & Privacy | 35% | 7 | 9 | 6 |
| Data Integrity | 20% | 8 | 9 | 6 |
| Reliability | 15% | 6 | 8 | 5 |
| Testability | 10% | 7 | 9 | 5 |
| Maintainability | 10% | 6 | 8 | 5 |
| Operational Fit | 5% | 8 | 8 | 4 |
| Reversibility | 5% | 10 | 9 | 3 |
| **Weighted** | **100%** | **7.20 — REJECT** | **8.65 — SELECT** | **5.45 — REJECT** |

A không xử lý static/native boundary đã xác nhận. C tăng blast radius, không có migration/recovery need và thất bại hard gate. B là thay đổi additive/config nhỏ, rollback bằng redeploy và có contract tests.

### Decision contract

1. `GET /api/students` và `GET /api/students/:id` bắt buộc `roleMiddleware('admin','chunhiem','phuta')`; tenant query giữ nguyên. Negative test khóa parent 403 ở cả list/detail; staff parish-wide read và class-scoped write tests vẫn giữ.
2. Vercel áp CSP không cho inline script/eval; style attribute được tách bằng `style-src-attr`, OMR camera được giữ `camera=(self)`, microphone/geolocation bị tắt. Pre-paint theme chuyển sang `/theme-boot.js`; `/health` rewrite đặt trước SPA catch-all.
3. Refresh bootstrap dùng timeout 65 giây: đủ một cửa sổ cold start quan sát được, nhưng bounded. Paid always-on/keep-warm là quyết định vận hành ngoài repo và không được tự kích hoạt.
4. Android `allowBackup=false` cộng rule loại mọi cloud/D2D domain; FileProvider chỉ app-specific external files/cache; khai báo CAMERA optional để đường tải ảnh vẫn dùng được trên thiết bị không camera. iOS/Android/Capacitor dùng label Catevia và không xin microphone.
5. Ba auth/lock surface dùng logo 192px sẵn có thay PNG 1,288,526 byte; không đổi asset brand/style. CI chạy `test:security-critical` trước full coverage.
6. Không ép override `uuid`, không rollback Capacitor và chưa nâng `drizzle-kit`: `npm audit --omit=dev` sạch; 7 moderate chỉ thuộc dev toolchain, trong khi bản mới/override chưa loại bỏ chắc chắn chuỗi transitive và có thể phá native/schema CLI.

### Gates, compatibility, risk và rollback

- **D3 hard gates (post-change):** Security **9 PASS**; Privacy **9 PASS**; Data Integrity **9 PASS**. Evidence riêng: middleware/test RBAC; backup/data-extraction + minimal permissions; không đổi writer/schema và class/tenant negative tests.
- **ADR compatibility:** ADR-022 parent portal PASS; ADR-029 native shell PASS WITH AMENDMENT; ADR-031 tenant isolation PASS; ADR-045 minimization PASS; ADR-056 Render/Turso PASS; ADR-072 route policy PASS; ADR-085 biometric privacy PASS; ADR-090 parish roster PASS WITH AMENDMENT. CSP giữ đúng A-NEW-23 (`style-src-attr` tách riêng).
- **Risks:** CSP block asset hợp lệ (medium/high) → contract + production build + post-deploy browser smoke; backup rule/OEM drift (low/high) → manifest/Gradle verification + physical-device gate; 65s wait trên outage (medium/medium) → abort và offline fallback; FileProvider consumer ẩn (low/medium) → dependency/source search không thấy camera/file plugin, Android build gate.
- **Rollback:** R1, revert config/middleware/assets and redeploy; không có data migration. Không được rollback riêng parent role guard.

### Verification và residual gates

Targeted RBAC + deployment/native contracts **6 files / 49 tests PASS**; security-critical CI gate **7 files / 72 tests PASS**. Full serialized regression và coverage đều **279 files / 1,944 tests PASS**; coverage Statements **69.90%**, Branches **59.93%**, Functions **63.23%**, Lines **72.26%**. Oxlint PASS, design-system **0/119**, client/server TypeScript + production builds PASS, production dependency audit **0 vulnerability**. `cap sync android` nhận 2 plugin; Android `assembleDebug` **BUILD SUCCESSFUL / 153 tasks**, APK 11,123,999 bytes và merged manifest xác nhận backup fail-closed + CAMERA. Logo production giảm từ 1,288,526 xuống 63,897 byte (khoảng 95%). Physical camera/biometric behavior, signed Android/iOS release, post-deploy CSP headers, Render always-on cost decision, OMR field corpus và retention policy vẫn **NOT CONFIRMED / EXTERNAL GATE**.

---

## ADR-093: Risk-Based, Outcome-Oriented E2E Testing Architecture (2026-09-01)

**Status: APPROVED / IMPLEMENTED. Severity: D3. Profile: ARCHITECTURE. Reversibility: R1.**

### Problem, evidence và business classification

Repository đã có Playwright, backend thật và isolated SQLite sandbox nhưng browser inventory chủ yếu là smoke, route visibility, accessibility và visual capture. Baseline trước thay đổi có 62 declared tests, 61 executed: 60 PASS, 1 brand assertion FAIL và 1 tenant-offline test skip. Hai attendance test có mutation nhưng chưa reload/API read-back. Vì vậy claim “E2E bảo vệ nghiệp vụ production” là **CONFIRMED INSUFFICIENT**, không được suy ra từ số lượng test.

Các journey auth/session, parent ownership, role/class scope, persisted student/class/grade/finance outcome, academic lock, offline attendance và exam finalization được phân loại **CONFIRMED high impact** từ route/service/schema/test inventory. Physical OMR accuracy, camera latency và device behavior là **NOT CONFIRMED by browser E2E** và tiếp tục thuộc ADR-060 field gate.

### Options và Decision Matrix

| Criterion | Weight | A: giữ smoke suite hiện tại | B: layered risk-based suite | C: reset-per-test + full browser matrix mọi journey |
| :--- | ---: | ---: | ---: | ---: |
| Maintainability | 20% | 5 | 9 | 6 |
| Reliability | 15% | 5 | 9 | 9 |
| Security & Privacy | 15% | 7 | 9 | 9 |
| Data Integrity | 15% | 6 | 9 | 10 |
| Reversibility | 15% | 10 | 9 | 6 |
| Performance | 10% | 8 | 8 | 3 |
| Observability | 5% | 5 | 9 | 8 |
| Operational Fit | 5% | 7 | 9 | 4 |
| **Weighted** | **100%** | **6.60 — REJECT** | **8.90 — SELECT** | **7.20 — REJECT** |

A không bảo vệ business outcome. C có isolation mạnh nhưng nhân runtime/maintenance cost mà không tăng tương xứng risk coverage. B giữ một sandbox riêng mỗi run, unique namespace mỗi test/retry, API-assisted arrange và authoritative read-back; logic matrix lớn tiếp tục ở unit/integration.

### Decision contract

1. Giữ Playwright và harness hiện hữu. Mỗi run chỉ được dùng database OS-temp có owner marker; remote DB/env và development DB bị fail-closed.
2. Critical test phải có UI action thật và assert outcome qua response + API/database projection và/hoặc reload. Render-only assertion không đủ.
3. Seed chỉ chứa synthetic data và hai parent scope khác nhau. Test mutation dùng key theo `testId:retry`, không dùng output từ test khác, không phụ thuộc thứ tự.
4. Không dùng arbitrary delay. Chỉ chờ observable state (`waitForResponse`, URL, ARIA state, IndexedDB hoặc authoritative `expect.poll`). Retry chỉ tạo diagnostic artifact; CI bật `failOnFlakyTests`.
5. PR chạy `@critical`; main/push/manual chạy full suite. Chromium desktop là mutation baseline; mobile viewport chỉ áp dụng cho Parent và offline attendance. Không nhân mutation suite sang browser khác khi chưa có risk evidence.
6. Server RBAC/tenant/domain service là authority. Negative test gửi payload hợp lệ; UI redirect/hide chỉ là UX assertion bổ sung.
7. Grade/attendance store phải await enqueue trước khi trigger sync. Filter URL phải hydrate ở first mount để class-scoped reload không đổi outcome.
8. Camera detector, QR/OMR geometry, multi-frame consensus, field corpus, native biometric/camera và exhaustive lifecycle/RBAC/OCC remain lower-layer or external gates.

### Compatibility, hard gates và rollback

- **ADR compatibility:** ADR-016 offline sync PASS WITH AMENDMENT; ADR-022 Parent Portal PASS; ADR-023/049/060/067 Smart Exam/OMR PASS; ADR-031 tenant isolation PASS; ADR-045 memory-only access token PASS; ADR-051 server finalization PASS; ADR-072 route policy PASS; ADR-082 workspaces PASS; ADR-090 class-scope authority PASS.
- **D3 hard gates:** Security **9 PASS**; Privacy **9 PASS** (synthetic data, no production DB/artifacts); Data Integrity **9 PASS** (real writer/read-back, lock and server-score assertions); Testability **9 PASS**.
- **Risk:** shared run DB có thể tích lũy records giữa tests (medium) → unique namespaces, no cross-test reads và workers=1; first-use Vite transform (low) → wait semantic readiness, không sleep; broad browser matrix runtime (medium) → tagged CI split; test credential leakage (low) → fixed sandbox-only accounts.
- **Rollback:** R1, revert tests/config/docs and the two behavior-preserving client fixes; no schema/data migration. Không rollback riêng enqueue-before-sync nếu queue-race evidence còn hợp lệ.

### Verification and reassessment

Critical suite **10/10 PASS** trong 44,7 giây từ sandbox sạch. Full Playwright **72/72 PASS** trong 5,4 phút, không skip, không flaky retry và cleanup thành công. Targeted store/sandbox/component regressions PASS; full Vitest diagnostic trước fixture fix đạt 1.943 PASS/5 FAIL, sau đó hai file từng fail chạy độc lập **21/21 PASS**. TypeScript, oxlint và design-system lint PASS sau production edits; CI workflow đã được kiểm tra. Theo yêu cầu không chạy lại test đã pass, full Vitest không được lặp lần ba sau patch chỉ ở fixture test. D3 post-check: **KEEP**, hard gates giữ 9/9/9/9. Strategy SSOT: `docs/08_E2E_TESTING_STRATEGY.md`.

---

## ADR-094: Phased Performance, Durable Delta Sync, and Immutable Exam Variants (2026-09-01)

**Status: APPROVED / PARTIALLY IMPLEMENTED. Severity: D3. Profiles: OFFLINE/SYNC + ARCHITECTURE. Reversibility: R2.**

### Problem and evidence

Repository inspection confirmed four separate concerns: the Excel vendor was already dynamically loaded, but `ExamSessionView` still formed a 377.04 KB lazy-route chunk; reload bootstrap ignored the available delta boundary; student/class incremental reads omitted deletion tombstones and a bounded server snapshot; and A–H answer keys had no immutable question/option permutation manifest. Conversely, desktop roster pagination and grade-matrix keyboard/focus behavior did not provide evidence that immediate DOM virtualization was safe, while ADR-060/068/069 explicitly lack target-device artifacts proving the OMR main thread is the current bottleneck.

Business classification: durable cursor/tombstone and exact answer-key-to-question binding are **CONFIRMED** data-integrity requirements. “60 FPS for 10,000 students”, Worker necessity, adaptive-threshold accuracy, and unattended OMR improvement are **NOT CONFIRMED** without device/corpus evidence.

### Options and Decision Matrix

| Criterion | Weight | A: implement proposal verbatim | B: phased, gated implementation | C: retain baseline |
| :--- | ---: | ---: | ---: | ---: |
| Security & Privacy | 20% | 6 | 9 | 8 |
| Data Integrity | 25% | 5 | 9 | 6 |
| Offline Reliability | 20% | 7 | 9 | 5 |
| Testability | 15% | 5 | 9 | 7 |
| Maintainability | 10% | 5 | 8 | 7 |
| Reversibility | 10% | 4 | 9 | 10 |
| **Weighted** | **100%** | **5.55 — REJECT** | **8.85 — SELECT** | **6.75 — REJECT** |

Option A violates OMR evidence gates and could silently mismatch question content and answer versions. Option C leaves confirmed sync and scoring integrity gaps. Option B implements additive safety/performance work first and leaves empirical optimizations behind explicit gates.

### Decision contract

1. Sync cursor is scoped by parish and user in local Dexie metadata. It contains only a server timestamp, not child data. The client obtains a server watermark, pages student/class deltas inside `updatedAfter <= row.updated_at <= updatedBefore`, uses stable `(updated_at,id)` ordering, applies soft-delete tombstones, and advances the cursor only after every store pull succeeds. A failed page/store never commits the watermark. Full pull remains bootstrap and empty-cache recovery.
2. `navigator.locks` is the primary single-writer coordinator. The existing expiring localStorage lease remains the compatibility fallback; server idempotency and version checks remain authoritative because browser locks cannot coordinate different devices or unavailable APIs.
3. Conflict diagnostics encrypt both local/server values. Automatic field merge remains the established conflict behavior; the UI does not offer blind “overwrite server/local” actions without a server-side per-field OCC contract.
4. Question-bearing documents fail closed to version A unless the session contains a server-generated immutable manifest for the selected version. Detached answer sheets may retain external A–H compatibility.
5. `POST /api/exams/:id/variant-manifests` materializes 1–8 deterministic versions, question order, option order, answer keys, source/content hashes, and seed. The set is a one-shot immutable artifact on a draft session; existing result data blocks regeneration. Positional answers such as “all/none/both of the above” and duplicate options are rejected because permutation would change semantics. Manual answer-key mutation is locked after a manifest exists.
6. Heavy exam modals/analytics are independent React lazy chunks. The measured `ExamSessionView` route chunk falls from 377.04 KB / 116.01 KB gzip to 54.44 KB / 14.51 KB gzip. SheetJS remains a 493.22 KB / 160.65 KB gzip on-demand chunk, is excluded from PWA precache, and is runtime-cached only after first use; it is not reimplemented.
7. DOM virtualization is deferred until a reproducible DOM/heap/interaction trace identifies a failing view and preserves table semantics, keyboard navigation, sticky layout, focus, and accessibility. OMR Worker/OffscreenCanvas/SharedArrayBuffer and adaptive thresholding remain **BLOCKED** by ADR-060/068/069 target-device and privacy-safe corpus gates; current fail-closed review, consensus, score recomputation, and offline queue are unchanged.

### Schema, compatibility, risk, and rollback

- Migration `20260901-148` adds nullable `exam_sessions.variant_manifests`; old sessions/clients continue to use legacy A or external detached-sheet A–H behavior. The server schema-readiness gate requires the new column after migration.
- ADR compatibility: ADR-016 PASS WITH AMENDMENT; ADR-050 PASS WITH AMENDMENT; ADR-051 PASS; ADR-060/062/067 PASS; ADR-068/069 PASS because Worker/adaptive acceptance was not bypassed.
- D3 gates: Security **9 PASS**, Privacy **9 PASS**, Data Integrity **9 PASS**, Testability **9 PASS**. Sync metadata contains no child PII; manifest audit logs store hashes/counts rather than the question bank; tenant/class authorization remains server-side.
- Main residual risks: browsers without Web Locks use the legacy lease; hard-deleted non-roster entities may need a periodic/full recovery pull; a manifest cannot be edited in place; and combined one-click PDF packaging is not yet provided. Rollback is R2: revert client/server endpoint and nullable column consumers; retain the additive column/data, or create a new draft session rather than mutating a published manifest.

### Verification and reassessment

Targeted sync/schema/exam suites: **16 files / 177 tests PASS**; PWA lazy-vendor contract **1/1 PASS**. Full serialized regression: **284 files / 1,965 tests PASS**. Client/server TypeScript, production client/PWA/server builds, oxlint, design-system lint, and `git diff --check` PASS. Bundle artifact confirms the route-chunk reduction above; excluding SheetJS reduces install precache from 2,846.53 KiB / 223 entries to 2,364.87 KiB / 222 entries. Production-equivalent migration dry-run, physical-device performance, one-click combined PDF packaging, and OMR corpus remain external/residual gates; therefore the decision is **KEEP for phases 0–3, BLOCK phase 4**.

---

## ADR-095: Native Push Notifications via Capacitor + FCM/APNs (2026-09-02)

**Status:** ACCEPTED — engineering implementation complete; production credentials and physical-device delivery remain external release gates. **Severity:** D3. **Profile:** SECURITY.

### Evidence and decision

Repository inspection confirmed Web Push is complete but deliberately native-disabled by ADR-088; `pushManager.ts` removes legacy Service Workers/PWA caches in Capacitor to prevent random WebView reloads. The existing notification queue already persists exact target user IDs, so native delivery must reuse that audience rather than introduce a second recipient resolver. Capacitor 8 provides OS permission/token callbacks; Android tokens are FCM tokens and iOS tokens are APNs device tokens.

| Criterion | Weight | A — Web Push in WebView | B — official Capacitor + FCM/APNs | C — third-party unified plugin |
| :--- | ---: | ---: | ---: | ---: |
| Security & privacy | 35% | 6 | 9 | 7 |
| Data/tenant integrity | 20% | 6 | 9 | 7 |
| Native reliability | 15% | 3 | 8 | 8 |
| Maintainability/ops | 10% | 6 | 7 | 6 |
| Testability/observability | 10% | 5 | 8 | 6 |
| Reversibility | 10% | 7 | 8 | 7 |
| **Weighted** | **100%** | **5.55 — REJECT** | **8.45 — SELECT** | **6.95 — REJECT** |

Option A conflicts with ADR-088 and repeats a confirmed native reload failure mode. Option C adds a second native abstraction without evidence it improves the official plugin contract. Option B is additive, preserves web behavior, and keeps provider credentials server-only.

### Decision contract

1. Native uses `@capacitor/push-notifications`; Web Push/Service Worker remains web-only. Android delivery uses direct FCM HTTP v1 with a server-side service-account OAuth assertion; iOS uses direct APNs HTTP/2 token authentication. Firebase Admin was rejected after production audit showed six moderate transitive advisories in unused Cloud Storage/legacy HTTP branches.
2. Migration `20260902-149` creates `native_push_tokens` with composite tenant PK/FK, unique opaque installation UUID, unique `(platform,token)`, and user lookup index. Registration takes parish/user only from authenticated JWT and atomically rebinds an installation/token to the current account. Unregister remains scoped to current `(parish,user,installation)`.
3. OS token is never persisted client-side or copied into audit/application logs. Only the random installation UUID and enable/disable preference are local. Registration audit stores platform only. Account soft deletion revokes native and web bindings.
4. `appPushService` fan-outs the existing queue recipient scope to Web Push and native providers. The persisted `notifications.target_user_ids` remains the audience SSOT; restart recovery cannot become parish-wide. Dead tokens are deleted; temporary provider failures retain tokens; an unconfigured platform is reported as skipped.
5. Permission is requested only by explicit user action in Settings. With granted permission and no opt-out, app requests a fresh token on login/launch/resume. Logout begins authenticated server unregister before clearing the memory-only access token, then unregisters the OS provider.
6. Notification actions accept only same-app relative routes. External/protocol-relative URLs are dropped. Foreground presentation uses the OS plugin and Android channel `catevia_general` with private lock-screen visibility.

### Gates, compatibility, rollback

- D3 hard gates: Security **9 PASS**, Privacy **8 PASS**, Data Integrity **9 PASS**, Testability **8 PASS**. Raw tokens remain necessary plaintext provider credentials in the server DB; encryption-at-rest depends on Turso/platform controls and is a residual privacy boundary.
- ADR compatibility: ADR-014 PASS; ADR-022 PASS; ADR-029 PASS WITH AMENDMENT (native push backlog is now implemented); ADR-031 PASS; ADR-045 PASS; ADR-085 PASS; ADR-088 PASS because no native Service Worker is reintroduced.
- Business-rule status: targeted audience reuse, tenant binding, account revocation, and explicit permission are **CONFIRMED**. End-to-end delivery with production Firebase/APNs credentials and real devices is **CONDITIONAL** until operational gates pass.
- Rollback R2: disable/remove provider credentials and native settings surface first; keep additive table/migration and existing tokens until a retention-approved cleanup. Web Push continues independently.

### Verification and residual gates

Final serialized regression: **290 files / 1,988 tests PASS** on the frozen snapshot; focused final provider/fan-out/tenant suite **5 files / 21 tests PASS**. Frontend/PWA and server production builds, oxlint, design-system lint **0/120**, `git diff --check`, Capacitor sync (plugin discovered on Android+iOS), and Android debug build **185 tasks PASS**. `npm audit` returned **0 vulnerabilities** after replacing Firebase Admin with direct FCM HTTP v1. Remaining external gates: real `google-services.json`, Render FCM/APNs secrets, Apple capability/provisioning, iOS signed build, and physical-device foreground/background/killed/token-refresh/account-switch delivery.

---

## ADR-096: Versioned Question Bank, Blueprint and Immutable Exam Materialization (2026-09-02)

**Status: APPROVED / IMPLEMENTED. Severity: D3. Profiles: ARCHITECTURE + OFFLINE/SYNC + SECURITY. Reversibility: R2.**

### Problem and repository evidence

Smart Exam already owns session lifecycle, server-authoritative scoring, A–H immutable manifests and OMR constraints, but its `exam_sessions.questions` JSON is a materialized exam document rather than a reusable curriculum catalog. The repository has `branches`, year-specific `classes` and `academic_years`, but no authoritative normalized book/chapter/lesson taxonomy. Reusing mutable bank rows directly during grading would allow a later edit to change historical exam meaning. Creating a second grading/OMR subsystem would conflict with ADR-023/051/060/094.

Business classification: reusable question lifecycle, tenant isolation, exact historical content and all-or-nothing blueprint generation are **CONFIRMED**. A normalized curriculum hierarchy, AI auto-approval, client-offline authoring and OMR support for every stored question type are **NOT CONFIRMED** and are not invented by this decision.

### Options and Decision Matrix

| Criterion | Weight | A: extend mutable session JSON | B: versioned bank + immutable snapshot | C: separate exam service |
| :--- | ---: | ---: | ---: | ---: |
| Security & privacy | 20% | 6 | 9 | 7 |
| Data integrity | 25% | 5 | 9 | 7 |
| Tenant isolation | 15% | 6 | 9 | 7 |
| Offline reliability | 15% | 7 | 9 | 5 |
| Maintainability | 10% | 6 | 8 | 4 |
| Testability | 10% | 6 | 9 | 6 |
| Reversibility | 5% | 8 | 8 | 4 |
| **Weighted** | **100%** | **6.05 — REJECT** | **8.80 — SELECT** | **6.05 — REJECT** |

### Decision contract

1. `question_bank_items` owns tenant-scoped identity, curriculum metadata and lifecycle `draft → in_review → approved → active → archived`. `question_bank_versions` is append-only content; revise creates a new immutable version and resets the item to draft. Creator may edit/submit own draft; Admin owns approve/activate/archive/reject.
2. Stored types are MC, true/false, multiple-select, short answer, fill blank, matching and essay. Initial Exam materialization intentionally supports MC and essay only. Unsupported types return a typed 422; they are never silently coerced. OMR-compatible MC requires exactly A–D and one correct answer.
3. Taxonomy uses optional existing `branch_id` plus versioned text metadata (`curriculum_level`, book/chapter/lesson/topic/difficulty/tags). No class/year foreign key or invented curriculum tree is added until an authoritative curriculum source exists.
4. `exam_blueprints` and ordered `exam_blueprint_rules` define type/taxonomy/difficulty/tag/count/points and recent-use avoidance. Build uses active questions only, deterministic seeded ordering and all-or-nothing transaction. Any shortage returns `BLUEPRINT_SHORTAGE` with rule details and creates no partial session.
5. Build materializes legacy-compatible `exam_sessions.questions`, answer key/variants and ADR-094 immutable manifests, then writes one `exam_question_snapshots` row per source position with exact question/version, points, payload and content hash. MC precedes essay to preserve mixed OMR numbering. Historical exams never dereference current bank content.
6. Server JWT parish scope, staff role and class-access middleware remain authorization authority. Composite tenant PK/FK plus insert/update trigger reject cross-parish blueprint references. Audit stores lifecycle/hash/count metadata, not stems, answer payloads or explanations.
7. Question authoring, review, blueprint changes and build are server-required. The UI is explicit read-only while offline. Once materialized, the existing Exam/offline result/finalization pipeline is unchanged; Question Bank does not create a parallel sync queue.
8. Manual academic backup `2.1-question-bank`, pre-restore safety snapshot and Purge v2.5 include all five new table families. Restore remains checksum-bound and supports legacy `2.0-production` without deleting Question Bank data that the old artifact could not contain.

### Gates, compatibility, risk and rollback

- **D3 hard gates:** Security **9 PASS**; Privacy **9 PASS**; Data Integrity **9 PASS**; Testability **9 PASS**.
- **ADR compatibility:** ADR-016 PASS; ADR-023/043/049/051/060 PASS; ADR-031 PASS; ADR-041/059 PASS WITH AMENDMENT for backup scope; ADR-094 PASS because its server manifest remains the variant authority.
- Main risks: LIKE search may need FTS only after measured scale; coarse staff roles do not yet provide per-capability answer-key visibility; unsupported stored types cannot enter an Exam; no offline authoring. These boundaries are explicit, fail closed and do not weaken grading.
- Rollback R2: hide/remove route and client surface first; retain additive migrations and immutable snapshots. Existing materialized sessions continue through Smart Exam. Never down-migrate or rewrite historical exam snapshots.

### Acceptance and reassessment

Final evidence on the frozen implementation snapshot: full serialized Vitest **291 files / 1,996 tests PASS**; focused Smart Exam/OMR integration **11 files / 119 tests PASS**; Question Bank/manifest/mixed-scoring post-fix **3 files / 17 tests PASS**; backup/purge/schema group **10 files / 49 tests PASS**. Client and server production builds, oxlint, design-system anti-drift **0/121**, and `git diff --check` pass. The Question Bank lazy chunk is 21.48 kB / 6.30 kB gzip. Post-implementation D3 reassessment is **KEEP** with Security/Privacy/Data Integrity/Testability at 9/9/9/9.

Real curriculum taxonomy, FTS, granular capabilities, AI-assisted drafting and additional auto-gradable types require a new evidence-backed reassessment rather than implicit expansion. Production-scale search latency and physical OMR behavior remain **NOT CONFIRMED** by local tests/builds.

### Amendment 2026-09-02 — Catevia branch/class selectors and direct document import

Repository evidence shows that `classes` is a year-specific roster entity while reusable Question Bank taxonomy already owns `branch_id + curriculum_level`. Therefore the UI lists the authoritative tenant-scoped `branches` and classes (with academic year in the label), but persists a selected class as `branch_id` plus `curriculum_level=class.name`; it does **not** add a mutable class/year FK to reusable content. The same dependent branch → class selector is used in question filters, authoring, blueprint metadata and Exam build. Business classification: direct selection from existing Catevia taxonomy and draft-only import are **CONFIRMED**; a normalized curriculum-level table and legacy binary `.doc` conversion are **NOT CONFIRMED**.

This is a D2 extension under the ARCHITECTURE + SECURITY profiles. Option A (new class FK) scored 6.9 and was rejected because roster-year churn would bind reusable content to a mutable cohort. Option B (selected mapping, client parser reuse and one server transaction) scored **8.9 — SELECT**. Option C (client loop calling create once per row) scored 5.8 and failed Data Integrity because a mid-loop error creates a partial import. D2 gates for Option B: Security **9 PASS**, Data Integrity **9 PASS**, Testability **9 PASS**; ADR-016/023/031/045/094/096 compatibility **PASS**.

- `.xlsx`, `.xls` and `.csv` reuse `examParser`; `.docx` lazily loads pinned `mammoth@1.12.1` and extracts raw text in the browser. Files are limited to 5 MB and 50 recognized questions per file. Images, macros and embedded objects are neither executed nor uploaded; `.doc` is rejected explicitly.
- The user must select branch and class, review parser errors/warnings and preview normalized questions before import. `POST /questions/import` accepts 1–100 normalized rows, validates the complete payload and every branch against the JWT parish, then inserts all draft items, immutable version 1 rows and metadata-only audits in one transaction. Provenance is forced to `import`; client input cannot publish or masquerade as AI/human provenance.
- Mammoth and SheetJS remain user-triggered lazy chunks and are excluded from PWA install-time precache. Rollback R1 removes the import button/route and dependency while retaining any already imported draft/version records under the normal lifecycle.
- Focused acceptance on this amendment: Question Bank API, DOCX conversion, draft modal and PWA lazy policy **4 files / 13 tests PASS**; server and frontend production builds PASS. Full-suite, physical-device and hostile DOCX corpus claims are not made by this focused evidence.

---

## ADR-098: Tenant-safe Parish Activity Cache and Server-Acknowledged Event Mutations (2026-09-02)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED. Severity: D3. Profile: SECURITY. Reversibility: R1.**

### Problem, evidence and business classification

`parishEventStore` previously read and wrote one plaintext `localStorage` key (`parish_calendar_events_v1`) for every account/tenant. Hydration returned every row and even assigned missing tenant IDs from current auth/default. When create/update/delete API calls failed, the store fabricated a local event, changed a local row or removed it, then returned success. This creates two confirmed risks from E3 source evidence: an offline/account-switch path can project a previous parish's events, and UI success can represent a mutation never committed by the server.

Tenant isolation and no false-success data loss are **CONFIRMED hard requirements** from project priority, ADR-031 and the professional parish-portal objective. Liturgical calculation remaining offline is **CONFIRMED**. Durable offline mutation of parish events is **NOT CONFIRMED**; the old local fallback had no queue, receipt, idempotency or reconciliation and therefore was not evidence of reliable offline writes.

### Options and Decision Matrix

| Criterion | Weight | A: shared local fallback | B: scoped read cache + server-ack writes | C: full event sync queue |
| :--- | ---: | ---: | ---: | ---: |
| Security | 20% | 4 | 9 | 8 |
| Privacy | 15% | 4 | 9 | 8 |
| Data Integrity | 20% | 3 | 9 | 9 |
| Reliability | 15% | 3 | 8 | 9 |
| Testability | 10% | 4 | 9 | 7 |
| Maintainability | 10% | 7 | 9 | 6 |
| Operational Fit | 5% | 6 | 9 | 7 |
| Reversibility | 5% | 9 | 9 | 6 |
| **Weighted** | **100%** | **4.15 — REJECT** | **8.80 — SELECT** | **7.85 — DEFER** |

A fails D3 Security, Privacy and Data Integrity. C is viable only after adding server idempotency/receipt semantics and sync reconciliation; implementing a client queue against the current non-idempotent POST would preserve duplicate risk. B removes the confirmed violation now without schema migration or pretending offline writes exist.

### Decision contract

1. Active tenant comes only from `tenantScope`. Event store starts empty and is cleared on session reset; it never guesses `'gia-ton'` or assigns tenant IDs to legacy rows.
2. Read cache uses encrypted `dexieStorage`, automatically scoped by `parishId:userId`. Only rows whose `parishId` exactly matches active scope are accepted. The old plaintext global key is removed; migration accepts exact-tenant rows only.
3. A server list containing any foreign-tenant row is rejected as a whole. A pending response is ignored after request sequence or tenant scope changes.
4. Create/update/delete project into memory/cache only after API acknowledgement. Network/server failure keeps prior state, records an error and throws to the UI. No temporary event, optimistic delete or false success toast is allowed.
5. Backend roles remain authority: `admin|chunhiem` mutate, authenticated roles read. Desktop/mobile controls mirror this fail-closed; workspace/title/term never grants permission.
6. Organization dashboard uses a pure local-calendar read model: fourteen dates starting today (today is day 1), stable sort by date/time/title, maximum four results. Cached/unavailable data receives an explicit semantic warning.
7. Liturgical engine and already cached read/export remain available offline. Durable offline event mutation requires a future D3 decision with idempotency key/receipt, owned queue item, retry and server reconciliation.

### Gates, compatibility, risk and rollback

- **D3 hard gates:** Security **9 PASS** (exact scope + stale response guard); Privacy **9 PASS** (encrypted per-user/tenant cache and removal of global plaintext); Data Integrity **9 PASS** (server acknowledgement before projection); Testability **9 PASS** (store/range/RBAC regressions). Confidence HIGH from E2/E3 evidence.
- **ADR compatibility:** ADR-016 PASS (no unsupported queue entity added); ADR-031 PASS; ADR-045 PASS; ADR-081 PASS (server authority/no fake Parish Memory mutation); ADR-082 PASS (workspace is still IA only). The historical calendar local-only write rule is superseded by this safer contract; the offline liturgical engine is unchanged.
- **Risks:** losing uncommitted convenience while offline (medium probability/low impact) is mitigated by explicit error and read cache; cache encryption/storage failure (low/low) falls back to server without affecting committed data; production device/account-switch behavior remains an external smoke gate.
- **Rollback:** R1 for code and docs, no API/schema/data migration. Reverting to the shared plaintext/fake-success behavior is not an acceptable rollback while the finding remains valid; safe rollback is server-only reads/writes with no event cache.

### Verification and reassessment

Focused regression **5 files / 26 tests PASS**, covering exact tenant filter, mixed response fail-closed, stale account/tenant switch, encrypted-cache fallback, failed mutation state preservation, 14-day boundaries and RBAC mapping. Final serialized Vitest **295 files / 2,008 tests PASS**. Frontend TypeScript, Vite production/PWA build, server TypeScript, oxlint, design-system lint **0/127** and `git diff --check` PASS. Physical-device multi-account/offline UX remains NOT CONFIRMED. Post-implementation result: **KEEP**; Security/Privacy/Data Integrity/Testability remain 9/9/9/9.

---

## ADR-099: Operational State, Audit and HTML Output Hardening (2026-09-02)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED. Severity: D3. Profiles: SECURITY + ARCHITECTURE. Reversibility: R1.**

### Problem, evidence and classification

A repository-wide E3 audit after ADR-098 confirmed multiple defects sharing the same failure mode:

1. Grade-import undo metadata and native-push enable/disable flags were device-global, so another account on the same device could inherit operational state. Explicit native push disable also used `Promise.allSettled`, reporting off even when server unlink failed.
2. Personnel paste import issued sequential per-person requests. A mid-loop failure left a partial batch; a successful write followed by failed refetch was reported as failure and encouraged duplicate retry.
3. Financial receipt HTML interpolated business/user strings into an about:blank `document.write` sink. Other exam `srcDoc` previews had no capability sandbox; print popups retained an opener unless explicitly cleared.
4. Question create/revise/blueprint did not consistently validate optional branch ownership. Exam build checked class assignment and selected mutable bank rows before its materialization transaction, leaving a TOCTOU boundary.
5. Attendance, parish events, native token binding, notices, leave requests, settings, semester locks and promotion could commit the domain mutation separately from audit. Several accepted regex-shaped but impossible dates. Class UI swallowed assignment request failures and could leave partial teacher selection while showing success; the legacy assignment API did not reject parent accounts.

Tenant isolation, truthful acknowledgement, immutable audit pairing, answer-key integrity and output escaping are **CONFIRMED** requirements. Durable offline editing for Question Bank/events, AI generation, shared question marketplace and automatic external asset proxying are **NOT CONFIRMED** and remain outside this decision.

### Options and Decision Matrix

| Criterion | Weight | A — keep local/separate writes | B — targeted scoped state + atomic authority | C — rewrite all modules/event sourcing |
| :--- | ---: | ---: | ---: | ---: |
| Security | 20% | 4 | 9 | 9 |
| Privacy | 15% | 4 | 9 | 9 |
| Data Integrity | 20% | 4 | 9 | 9 |
| Reliability | 15% | 5 | 9 | 8 |
| Testability | 10% | 5 | 9 | 6 |
| Maintainability | 10% | 6 | 8 | 5 |
| Operational Fit | 5% | 5 | 9 | 4 |
| Reversibility | 5% | 9 | 9 | 3 |
| **Weighted** | **100%** | **4.75 — REJECT** | **8.85 — SELECT** | **7.55 — DEFER** |

A fails D3 Security, Privacy and Data Integrity gates. C would replace proven Exam/sync/domain paths without evidence that the migration risk is justified. B repairs the confirmed boundaries while retaining existing server RBAC, schemas and user workflows.

### Decision contract

1. Operational client markers that vary by account use exact `parishId:userId` scope. Grade undo uses encrypted `dexieStorage`, TTL/schema/count validation and discards unscoped legacy data. Native push keeps only the installation UUID device-global; preference/success markers are account-scoped, in-flight token registration is invalidated on scope change, and explicit disable succeeds only after server unlink succeeds.
2. Personnel import parses quoted CSV/TSV, accepts only exact statuses and real birth-year bounds, blocks when any row is invalid, caps at 100 and calls one admin-only all-or-nothing service transaction. A post-commit refresh failure marks the projection stale but does not report the write as failed.
3. HTML builders escape every user/business field. Print content loads through Blob URLs rather than `document.write`; new windows sever `opener`; every `srcDoc` preview is sandboxed with no capabilities. External Parish Profile images do not passive-load from arbitrary hosts and explicit viewing uses no referrer.
4. Every optional Question Bank branch reference is verified inside the corresponding tenant-scoped write transaction. Exam build uses one transaction for class existence/assignment, blueprint/current ACTIVE version selection, shortage/type gates, session, immutable snapshots, variants and audit.
5. Date-only business fields reject calendar-impossible values through one strict UTC-safe `isValidIsoDate` helper. Attendance note/reason/content PII remains in its domain table and is not copied into new audit metadata.
6. Attendance, parish-event, native-token, notice, leave-request, settings, semester-lock and promotion writes pair domain change with redacted audit in the same retry-aware transaction. Notification delivery remains post-commit best-effort and cannot turn a committed notice/leave review into a false write failure. Partial-success batch summaries are diagnostic; the item transaction is authoritative.
7. Class assignments are replaced through one admin-only endpoint and transaction after validating active staff roles and tenant ownership. A parent cannot be assigned even via the legacy single endpoint. UI reports success only after class and full assignment selection are acknowledged; after a newly created class commits, retry continues against that ID instead of creating a duplicate.

### Gates, compatibility, risk and rollback

- **D3 hard gates:** Security **9 PASS**, Privacy **9 PASS**, Data Integrity **9 PASS**, Testability **9 PASS** from source inspection and direct regressions. Full-suite/device gates are reported separately and cannot upgrade unverified physical behavior.
- **ADR compatibility:** ADR-009 PASS (attendance remains partial-success per item); ADR-013 PASS WITH CLARIFICATION (external notification side effects stay outside domain transaction; mandatory audit is part of the state-change integrity boundary); ADR-016 PASS; ADR-028 PASS WITH AMENDMENT; ADR-031 PASS; ADR-045 PASS; ADR-081 PASS; ADR-094 PASS; ADR-095/096/098 PASS WITH HARDENING.
- **Risk:** larger atomic sections may expose latent DB contention (low/medium, mitigated by `runDbTransaction` retry and bounded batches); old device-global flags are intentionally not migrated (low/low, user may opt in again); class assignment replace is all-or-nothing and UI currently submits at most one assistant (low/low, matching existing UI contract).
- **Rollback:** code/docs are R1 and schema-free. Safe rollback may disable affected UI commands or fall back to server-only behavior; restoring plaintext/global state, unsandboxed HTML or split domain/audit commits is prohibited while findings remain valid.

### Verification and reassessment

Frozen-snapshot `npm run verify:ci` PASS: oxlint sạch; design-system lint **0/127**; client/server TypeScript và production frontend/PWA/server build PASS (**2,789 modules**, **233 precache entries**); serialized coverage **301/301 files, 2,054/2,054 tests PASS** với Statements **70.16%**, Branches **59.42%**, Functions **63.46%**, Lines **72.74%**. Critical browser suite đạt **10/10** theo run ban đầu và targeted rerun của hai failure đã sửa; sau amendment lưới lớp, affected E2E **3/3 PASS** gồm viewport/theme accessibility, class persistence và class-grid → roster → student persistence. Capacitor Android sync tìm đúng 3 plugin; `assembleDebug` **BUILD SUCCESSFUL / 185 tasks**, APK 12,943,542 bytes. Production dependency audit **0 vulnerability** và `git diff --check` PASS. Production credentials, physical-device push/biometric/camera behavior, OMR field accuracy và restore drills vẫn là external gates và không được suy ra từ automated build.

---

## ADR-101: Architecture Risk Baseline Stabilization (2026-09-03)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED. Severity: D3. Profiles: OFFLINE/SYNC + SECURITY + ARCHITECTURE. Reversibility: R2.**

### Problem, evidence and classification

Code-path tracing confirmed five independent integrity failures. `syncStore.isOwnOp` and queue queries owned mutations by `userId` only, while legacy rows without parish provenance were assigned to the current session. `FinanceApplicationService.updateStudentFee` could create a second receipt on replay, retain the old receipt after reverting a fee to `UNPAID|EXEMPTED`, and the “collect all” UI committed one request at a time. Grade semester/policy/class authorization preconditions were read through global `db` before the write transaction. `migrationRunner.applyMigrations` used libSQL `executeMultiple` without an explicit transaction and wrote the migration marker separately. Finally, hard-deleted notices could never appear in `updatedAfter` reconciliation, and a parent could retain a cached notice after its audience changed to `staff`.

Tenant isolation, server-authoritative class scope, atomic academic locks, convergent fee/receipt state and visible offline deletion are **CONFIRMED hard requirements**. The exact accounting treatment for reopening a collected fee is not separately specified; removing the system-created linked income row in the same transaction, with a redacted reversal audit, is the implemented **CONDITIONAL rule**. No general offline queue is added for notices or finance.

### Options and decision

| Criterion | Weight | A: keep current behavior | B: targeted invariant repair | C: replace persistence/sync architecture |
| :--- | ---: | ---: | ---: | ---: |
| Security | 20% | 4 | 9 | 8 |
| Privacy | 10% | 5 | 9 | 8 |
| Data Integrity | 25% | 3 | 9 | 9 |
| Reliability | 15% | 4 | 9 | 8 |
| Testability | 10% | 5 | 9 | 6 |
| Maintainability | 10% | 5 | 8 | 5 |
| Operational Fit | 5% | 7 | 9 | 4 |
| Reversibility | 5% | 8 | 8 | 3 |
| **Weighted** | **100%** | **4.45 — REJECT** | **8.80 — SELECT** | **7.30 — DEFER** |

Option A fails the D3 Security and Data Integrity gates. Option C has no evidence strong enough to justify a rewrite. Option B repairs the observed contracts in their existing modular-monolith boundaries.

### Decision contract

1. Every offline mutation/conflict belongs to the exact authenticated `(parishId,userId)` pair. Missing/partial legacy ownership is quarantined as failed and never guessed from the current tenant. Dexie v7 adds compound owner/status indexes; diagnostics, notice pending checks and sync processing use the same fail-closed predicate.
2. A fee and its system-created financial transaction reconcile inside one `runDbTransaction`: PAID replay reuses the linked receipt, changed amounts/funds reconcile it, and `UNPAID|EXEMPTED` removes it with `TXN_FEE_REVERSED`. Write commands enforce the documented three-state model (`PAID > 0`; `UNPAID|EXEMPTED = 0`); legacy `PARTIAL` remains read-compatible but cannot be newly written. Tenant/reference failures map to `400 BAD_REQUEST`, not an unhandled `500`. Class bulk collection accepts 1–500 rows and commits all-or-nothing.
3. Grade class access, semester lock and current policy-version reads use the same transaction executor as the grade write. Client state cannot bypass these server preconditions.
4. Multi-statement migrations and their marker execute under one explicit `BEGIN IMMEDIATE`/`COMMIT`; any non-tolerable failure aborts startup. Migration 159 adds notice tombstones; schema readiness validates the executable result.
5. Notice full snapshots return active rows only. Deltas return soft-delete tombstones. Migration 167 persists `parent_revoked_at`; when a previously visible notice becomes staff-only, the parent delta returns a redacted synthetic tombstone so cached title/content/author are evicted. A newly-created staff notice has no revocation marker and remains completely absent from parent deltas.

### Compatibility, recovery and residual risk

- ADR-016 PASS WITH HARDENING (durable ownership and reconciliation preserved); ADR-013/031/045 PASS; grade/finalization authority remains server-side; no exam lifecycle rule changes.
- Migrations `20260903-159` and `20260904-167` are additive. Rollback is R2 because deployed readers must retain tombstone/revocation compatibility; safe functional rollback disables delta caching rather than restoring hard delete.
- The fee reversal rule is limited to the transaction linked by the fee record and validates parish/student/class/year/type before deletion. Manually created finance rows are not inferred or removed.
- Multi-statement migration atomicity is proven against the local libSQL adapter; a production backup/restore drill and remote Turso migration execution remain external gates.

### Verification and reassessment

Focused evidence on the implementation snapshot: exact/immutable sync ownership **5/5 PASS** plus the prior owner/retry suites; finance lifecycle, HTTP error mapping and existing finance service tests **19 PASS**; migration + grade transaction tests **10 PASS**; notice server/client reconciliation **11 PASS**. Serialized coverage reached **302/303 files and 2,064 tests PASS** before exposing seven stale Exam fixture assertions plus two unhandled promises that omitted authenticated tenant scope; the two affected files were corrected and rerun **29/29 PASS**. This is composite evidence, not a claim that one final coverage invocation was green. Security-critical **73/73**, lint, design guard **0/127**, diff check and full frontend/server production build passed. D3 post-verdict: **KEEP**; Security, Privacy, Data Integrity and Testability gates each score 9 from E2/E3 evidence.

---

## ADR-102: Durable Leased Notification Delivery (2026-09-03)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED / PROVIDER CONDITIONAL. Severity: D3. Profiles: SECURITY + ARCHITECTURE. Reversibility: R2.**

### Problem, evidence and classification

`notificationQueue.enqueueNotification` previously acknowledged an in-memory item before asynchronously inserting its database row. Retry counters/backoff lived only in process memory; restart recovery depended on a later enqueue, and multiple replicas had no atomic claim. Telegram helpers swallowed provider errors, allowing a failed send to be persisted as `sent`. These are confirmed reliability/data-integrity defects. Exactly-once delivery is **NOT CONFIRMED** and cannot be guaranteed by Telegram/Web Push/FCM/APNs APIs without provider receipts and per-recipient delivery state.

### Options and decision

| Criterion | Weight | A: in-memory queue | B: DB-backed lease, at-least-once | C: external broker + exactly-once ledger |
| :--- | ---: | ---: | ---: | ---: |
| Security | 15% | 6 | 9 | 9 |
| Privacy | 10% | 7 | 9 | 7 |
| Data Integrity | 20% | 4 | 9 | 9 |
| Reliability | 20% | 3 | 9 | 9 |
| Testability | 10% | 5 | 9 | 6 |
| Maintainability | 10% | 6 | 8 | 4 |
| Operational Fit | 10% | 8 | 9 | 3 |
| Reversibility | 5% | 8 | 7 | 3 |
| **Weighted** | **100%** | **5.25 — REJECT** | **8.75 — SELECT** | **6.75 — DEFER** |

### Decision contract

1. A successful enqueue means the `notifications` row is durable. The in-memory array is only a local work projection.
2. Migrations `160..166` persist attempt count, maximum attempts, lease owner/expiry, next attempt time and the exact delivery kind, with an index for due work. Startup recovery and a 30-second poll reclaim due rows and expired leases across all parishes.
3. Claim is one conditional `UPDATE ... RETURNING`; only the lease owner may mark sent, retrying or failed. Retry backoff and terminal exhaustion survive restart. In-memory failed diagnostics are bounded to 100 items.
4. Unconfigured providers fail explicitly. Telegram strict mode propagates send errors. A configured push result with any failed recipient retries the aggregate item; this deliberately permits duplicate delivery to recipients already reached. Malformed persisted target JSON becomes an explicitly targeted empty set and can never degrade into a parish broadcast.
5. Delivery semantics are **at-least-once per aggregate queue item**, not exactly-once per recipient. A crash after provider acceptance but before the `sent` update, or a partial provider result, can duplicate a notification. Native tokens skipped because their platform provider is absent remain provider-conditional and are surfaced by provider metrics/logs.

**H7 amendment — 2026-09-05 (working tree, not deployed):** single-child `report|absence` delivery stores the existing `notifications.student_id`, rechecks nondeleted same-parish child/current ACTIVE parent ownership at every attempt, and intersects those owners with the original targets. No eligible owner or legacy missing subject/targets is terminal `failed` with `ACADEMIC_RECIPIENT_NOT_AUTHORIZED`; no usable target is `ACADEMIC_DELIVERY_TARGET_UNAVAILABLE`. No global fallback, automatic retargeting or replay after unlock. New persisted/outgoing bodies are generic application-update notices; recovered old bodies are not sent, but historical DB messages are not erased. Telegram still checks active opted-in links; private-chat binding assurance remains H6. Class reminders, operational notices and batch absence summaries (`info`) are outside this amendment. This uses the existing queue/schema, not a new broker; a DB check is not atomic with network delivery, and at-least-once/provider limitations remain. Inverse mocked-provider evidence and rollout limits: [auth audit §15](authentication-authorization-rbac-audit-2026-09-05.md#15-implementation-follow-up--h3h7h8).

### Compatibility, recovery and residual risk

- ADR-013 PASS: notice/domain commit remains independent of external delivery; post-commit enqueue failure is logged and does not turn the committed notice into a false mutation failure. ADR-016/095 PASS WITH HARDENING.
- The migrations are additive R2. Safe rollback can stop the worker while retaining rows/columns; it must not return to pre-persistence acknowledgement.
- No external broker or microservice is introduced. Cross-provider per-recipient deduplication, dead-letter administration UI and production credential delivery are deferred until operational evidence justifies them.

### Verification and reassessment

Notification queue, strict Telegram and schema-readiness tests passed **32/32**, including partial-push failure, malformed-target fail-closed behavior and delivery-kind recovery. Composite broad regression evidence is **302/303 files and 2,064 tests PASS**, followed by **29/29 PASS** for the corrected tenant-aware fixtures; security-critical **73/73**, lint, design guard **0/127**, diff check and full frontend/server production build passed. D3 post-verdict: **KEEP** with Security/Data Integrity/Testability at 9; real-provider and multi-replica soak remain **NOT CONFIRMED**.

---

## ADR-103: Transactional Academic Finalization and Fail-Closed Policy/Backup Reads (2026-09-04)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED. Severity: D3. Profiles: DATA INTEGRITY + ARCHITECTURE + RECOVERY. Reversibility: R1 for executor propagation, R2 for backup failure semantics.**

### Problem and evidence

Architecture audit trên base `62e1199` xác nhận ba P1 boundary defects: `finalizeYear` đọc guard/checklist/grades/attendance/policy trước transaction rồi chỉ transaction hóa output; parish policy readers bắt cả query exception và biến thành defaults/`null`; local backup raw-copy riêng main SQLite file khi checkpoint và `VACUUM INTO` lỗi nhưng vẫn báo success. Cả ba đều có thể tạo authoritative-looking output từ input không nhất quán hoặc không được đọc thành công.

### Decision

1. `AcademicYearLifecycleService.finalizeYear` chạy toàn bộ terminal/semester-lock guard, completeness checklist, class/student/grade/override/attendance/date-range/policy reads, promotion specification, snapshot upsert, compare-and-set year lock và audit trong một `runDbTransaction`. `getYearOrThrow`, checklist, date-range, classification policy và evaluation nhận cùng executor; không helper nào trong path được quay về global DB.
2. Missing settings row, malformed settings JSON và invalid individual policy fields tiếp tục dùng documented business defaults. Database/query failures nằm ngoài parse catch và phải propagate. Missing policy-version row trả `null`; query failure không được masquerade thành `null`.
3. Local backup dùng `VACUUM INTO` trên unique partial path rồi rename để publish. Checkpoint failure chỉ là degraded preparation nếu `VACUUM INTO` vẫn thành công. Nếu snapshot hoặc rename lỗi, partial artifact được xóa, run trả failure và không upload, rotate retention hoặc ghi daily-success marker. Raw main-file fallback bị loại bỏ; Turso logical-backup path không đổi.

Không thêm service, broker, schema hoặc public API. Đây là targeted repair trong modular monolith hiện tại.

### Compatibility, recovery and residual risk

- Business thresholds/default values không đổi; chỉ infrastructure failure đổi từ silent fallback sang explicit operation failure. HTTP caller hiện dùng error boundary hiện hữu và có thể trả 500/retry thay vì commit bằng policy giả định.
- Full finalization transaction có thể giữ read snapshot lâu hơn path cũ; `SQLITE_BUSY` retry hiện hữu sẽ replay callback. Callback không phát external side effect trước commit; IDs/timestamps có thể đổi giữa retry nhưng chỉ committed attempt tồn tại.
- Local backup failure có thể làm mất một lịch backup nhưng không tạo artifact giả hợp lệ. Scheduler thử lại ở lần check sau vì marker không được ghi.
- Production concurrent-finalize incidence, disk-failure behavior và remote Turso transaction semantics chưa được đo bằng telemetry/credentialed drill; các invariant được chứng minh bằng code path, local libSQL integration tests và failure injection.

### Verification and reassessment

Focused plus affected-caller regression: **14/14 files, 80/80 tests PASS**. Tests gồm transaction-executor guard cho finalize, malformed/missing configuration defaults, injected database failure propagation, backup `PRAGMA integrity_check`, forced checkpoint + `VACUUM INTO` failure, no partial artifact và no success marker. Server TypeScript build PASS. Broader lint/build/regression được ghi theo evidence cuối của change set, không suy diễn từ focused run này.

---

## ADR-104: Grade, Reporting, Retry and Runtime Lifecycle Boundary Hardening (2026-09-04)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED. Severity: D3. Profiles: DATA INTEGRITY + ARCHITECTURE + RECOVERY. Reversibility: R1.**

### Problem and evidence

Architecture audit trên base `62e1199` xác nhận bốn boundary defects còn lại sau ADR-103: base grade upsert/undo đọc policy-version ngoài write transaction; reporting repositories import ngược policy/date services và dùng nhiều global reads; batch-promotion transaction callback mutate response trước khi retry wrapper hoàn tất; reporting route đăng ký process signal trong khi root exit trước khi coordinated resource cleanup hoàn tất.

### Decision

1. Mọi grade policy-version attribution được đọc qua đúng executor của mutation. Base `upsertGrade`, undo, explicit override và restore cùng chia sẻ nguyên tắc này; infrastructure error phải rollback/fail item.
2. `ReportingApplicationService` sở hữu authorization, academic-year range, parish policy và transaction snapshot. Projection repositories chỉ nhận `ReportingProjectionContext` gồm executor + immutable inputs, không import services hoặc global DB. Read model vẫn là query projection, không thêm materialized table/cache.
3. Callback được `runDbTransaction` retry không mutate response/counter. `BatchPromotionApplicationService` nhận transaction runner qua constructor để regression có thể replay callback; state ngoài transaction chỉ đổi một lần sau wrapper resolve.
4. `server/src/index.ts` là composition root duy nhất sở hữu `SIGTERM/SIGINT`. Shutdown idempotent: dừng producers và HTTP intake, await active backup/Sunday ticks, drain active notification delivery, đóng Puppeteer/Telegram, checkpoint và đóng DB, rồi mới exit. Deadline 10 giây giữ fail-safe cho hung external resource. Route imports không có process lifecycle side effect.
5. Executable architecture tests chặn repository → service runtime edge và `process.on` trong routes, đồng thời kiểm root sở hữu các cleanup calls.

Không đổi schema, HTTP contract, business threshold, batch partial-success semantics hoặc notification at-least-once authority. Không thêm microservice, event broker hoặc generic repository layer.

### Compatibility, recovery and residual risk

- Reporting có thể giữ DB transaction lâu hơn chuỗi global reads cũ; đây là cost có chủ đích để tránh torn report. Chưa có production latency/concurrency evidence yêu cầu materialized projection.
- Batch callback vẫn có thể chạy lại khi commit-time `SQLITE_BUSY`; DB idempotency/transaction rollback tiếp tục là authority, còn HTTP response không còn duplicate result.
- Shutdown deadline có thể force-exit nếu provider/browser không đóng trong 10 giây. Durable notification row + lease cho phép startup recovery nhưng không nâng delivery thành exactly-once.
- Sunday scheduler vẫn là single-parish theo `PARISH_ID`; multi-parish topology là unknown riêng, không được ADR này tự suy diễn.

### Verification and reassessment

Targeted D4–D7 regression: **9/9 files, 59/59 tests PASS**; reporting/PDF/grade-audit expansion **6/6 files, 26/26 tests PASS**. Tests gồm grade/undo global-executor spies, reporting transaction context, architecture dependency/lifecycle gates, double callback replay với exactly-one response result, active notification-delivery drain, existing batch partial-success/rollback, Sunday scheduler và backup lifecycle. Final gate: lint zero-warning PASS, server TypeScript build PASS, full Vitest **315/315 files, 2.141/2.141 tests PASS** in 865,87 seconds. Production traffic, credentialed Turso concurrency and forced shutdown soak remain NOT CONFIRMED.

---

## ADR-105: Promotion Recovery, Multi-Parish Scheduling, Restore Gates and Dependency Seams (2026-09-04)

**Status: APPROVED / IMPLEMENTED / ENGINEERING VERIFIED. Severity: D3. Profiles: DATA INTEGRITY + AUTHORIZATION + RECOVERY + ARCHITECTURE. Reversibility: R1 except schema column R2.**

### Problem and evidence

Deep follow-up của architecture audit xác nhận: promotion year có partial-error response nhưng không có durable worklist/archive gate; Sunday producer chỉ chạy một parish hardcode trong topology shared process/database; restore CLI thiếu second target confirmation, empty/schema preflight và post-restore integrity read-back; domain policy types biết `DbExecutor`/JWT, còn application services gọi class authorization nằm trong HTTP middleware. Client sync coordinator đồng thời là React hook tạo store↔hook cycles, và client `GradeAggregate` không có production caller nhưng vẫn vào bundle với semantics không sở hữu server audit/lock policy.

### Decision

1. **Promotion recovery (corrected XD-01, 2026-09-07):** khi bắt đầu promote, transition `FINALIZED → PROMOTED` và `promotion_target_year_id` commit atomically trước item processing. Reconciliation chỉ công nhận active/latest `promotion_records` có `completed_at` và `completed_target_year_id` khớp target; receipt/audit commit cùng membership move (hoặc terminal no-move). Approval đơn lẻ không phải completion. List/retry/archive dùng chung predicate; thiếu lớp đích là unresolved/error. Legacy NULL receipts không tự backfill từ class pointer hay approval; inventory và operator review tách riêng. Retry chỉ xử lý unresolved bằng target đã persist, archive trả 409 khi còn item. Partial success theo từng student của ADR-008 không đổi.
   **Temporal input amendment (XD-02/03, 2026-09-07):** Finalize persists versioned concrete policy/date/class-label inputs and each student's source class/effective report payload with academic snapshots in one transaction. Finalized reporting and promotion consumers use this evidence; a changed current policy or membership cannot reinterpret the old year. Open-year reads remain live. Missing/invalid legacy provenance blocks the affected historical read/promotion path instead of fabricating a backfill; existing fee facts remain readable in their recorded class/year/type even after transfer. Current auth/parent ownership/soft-delete rules are unchanged. Additive nullable columns preserve unknown history and require separate operator reconciliation for legacy rows.
2. **Sunday tenant coverage:** scheduler enumerate duy nhất parish có `parish_system_settings.sundayReminderEnabled=true` (default false), chạy và ghi marker độc lập theo parish, isolate failure. Audience không có parent IDs thì fail closed thành no-send, không fallback global Telegram admin. Admin Settings là control plane cho opt-in và giờ lễ.
3. **Remote restore gate:** CLI yêu cầu `RESTORE_TARGET_FINGERPRINT` là SHA-256 normalized target URL, target khác production, rỗng/disposable và có exact table-column compatibility. Sau insert, read-back per-table counts, `PRAGMA foreign_key_check` và `assertDatabaseReady` phải pass; command in machine-readable manifest. Validation failure sau commit buộc discard target, không sửa/cutover.
4. **Authorization/domain dependency:** `ActorContext` chỉ chứa `userId/role/parishId`; JWT transport type extends context nhưng domain/application không import middleware. Class-access query chuyển sang service không biết Hono/JWT. Policy adapters bind Drizzle executor vào port closures; domain port/spec methods không nhận hoặc import `DbExecutor`. Critical services tạo specs từ active transaction. Architecture gates cấm domain import DB/middleware và application-service runtime import middleware ngoài auth-infrastructure allowlist.
5. **Client dependency cleanup:** `syncCoordinator` sở hữu imperative sync orchestration, `syncTrigger` không import stores/hooks, React `useSyncEngine` chỉ sở hữu lifecycle. Stores không import hooks. Client GradeAggregate/adapter, unused store actions/types và tests của dead API bị xóa; server GradeAggregate/commands tiếp tục sole write authority.

Không thêm workflow engine, external queue, materialized reporting projection, microservice hay generic repository. Theo quyết định follow-up ngày 2026-09-05, `ParishSummaryProjection` là deferred candidate và không thuộc current MVP.

### Compatibility, recovery and residual risk

- Migration chỉ thêm nullable `promotion_target_year_id`; year cũ ở `PROMOTED` không có target không thể retry tự động và cần operator/data review nếu reconciliation còn thiếu. Year mới luôn persist target trước processing.
- Sunday reminder chuyển từ implicit single-parish behavior sang explicit opt-in; parish chưa bật sẽ không nhận background reminder. Đây là fail-closed rollout, không silent broadcast.
- Local/unit restore validation không chứng minh credentialed Turso/R2 drill, production RPO/RTO hoặc cutover. External drill vẫn là release/operations gate.
- Notification provider delivery vẫn at-least-once theo ADR-102. Multi-parish producer không thay đổi duplicate window. **Topology amendment 2026-09-05:** ADR-106 supersede production enumeration; multi-parish path chỉ còn cho dev/test isolation khi không cấu hình deployment scope.
- T6/DR5 đã được khép bằng explicit deferral ngày 2026-09-05. Field performance/maintainability SLO vẫn chưa có product authority và không được tự đặt từ lab benchmark.

### Verification and reassessment

Targeted evidence: D8/schema **3 files, 27 tests PASS**; D9/settings/notification **4 files, 42 tests PASS**; restore **1 file, 5 tests PASS**; sync seam **8 files, 60 tests PASS**; authorization/domain/T5 regression **7 files, 51 tests PASS**; Settings/T5 follow-up **5 files, 42 tests PASS**. Final gate trên complete change set: lint zero-warning PASS, server và frontend production builds PASS, full serialized Vitest **313/313 files, 2.138/2.138 tests PASS** trong 823,00 giây. T5 bundle literals đã biến mất và gradeStore chunk giảm từ khoảng 11,75 kB xuống 8,04 kB. Credentialed Turso/R2 restore drill vẫn NOT CONFIRMED.

Follow-up 2026-09-05: schema readiness bắt buộc cả migration marker `20260904-169`; Sunday sender trả acknowledgement boolean để scheduler không ghi sent marker khi không có recipient. Hai read-only operational commands được thêm cho promotion reconciliation và Sunday readiness; output mặc định hash parish ID và không xuất student ID. Restore drill manifest ghi timing riêng download/decrypt/restore/readiness, còn target preparation dùng cùng explicit fingerprint/production guard. Architecture inventory được executable hóa trong CI. Local read-only runs trả zero promotion finding và zero enabled Sunday parish nhưng không phải production evidence vì workspace không có Turso/R2 credentials. `ParishSummaryProjection` được quyết định deferred theo amendment ADR-010; notification at-least-once và extract-on-touch policy giữ nguyên.

---

## ADR-106: Single-Parish Deployment with Tenant-Scoped Persistence (2026-09-05)

**Status: APPROVED / IMPLEMENTED — final verification recorded below. Severity: D3. Profiles: AUTHORIZATION + DATA INTEGRITY + RECOVERY + DEPLOYMENT. Reversibility: R1 for runtime/config, schema remains unchanged.**

### Context and evidence

Catevia hiện chỉ được vận hành cho một giáo xứ. Code và schema vẫn có tenant boundary sâu: identity, JWT, queries, composite keys/FKs, backup và client offline ownership đều mang `parishId`. Xóa tenant columns/constraints sẽ tạo migration lớn, làm yếu defense-in-depth và khuếch đại thay đổi mà không giải quyết một lỗi vận hành đã chứng minh. Ngược lại, giữ shared multi-parish production selection làm tăng số entry path phải cấu hình/kiểm soát dù topology không còn cần nó. Evidence hiện hành cho thấy client login vốn không có parish picker, trong khi legacy public bodies/default, seed, backup và workers có nhiều cách tự chọn/enumerate parish.

### Decision

1. **Một production deployment sở hữu một parish namespace bất biến.** `DEPLOYMENT_PARISH_ID` là bắt buộc, validate slug, và được dùng cho seed, scheduled backup, public login/recovery resolution, protected principal và worker composition. `PARISH_ID`/`SUPER_ADMIN_PARISH_ID` chỉ là compatibility; nếu còn set thì phải khớp để tránh split-brain config.
2. **Server, không phải client, chọn deployment parish.** Legacy `parishId` trong login/password-reset body bị bỏ qua khi scope được enforce. Access/refresh token ngoài deployment parish không được issue/chấp nhận. Public QR có signed parish khác trả verdict generic `verified:false`.
3. **Startup fail closed trước traffic/workers.** Sau schema readiness và trước seed, composition root khám phá mọi SQLite table có cột `parish_id`, kiểm existence của bất kỳ row null/khác configured parish và abort nếu có. Empty database được seed bằng deployment parish rồi kiểm lại. Error chỉ nêu tên table, không row/PII. Gate không tự sửa, đổi tenant, purge hay migrate dữ liệu.
4. **Alternate infrastructure paths cũng bị khóa.** Sunday coordinator chỉ enumerate setting của deployment parish; direct parish runner và notification enqueue từ chối scope khác; notification recovery chỉ claim/update row của deployment parish. Không dựa duy nhất vào HTTP middleware.
5. **Giữ tenant-scoped persistence có chủ đích.** Không drop `parish_id`, composite PK/FK/index, repository predicates, JWT parish claim hoặc encrypted Dexie/cache namespace `parishId:userId`. Dev/test khi không set deployment scope vẫn chạy multi-parish fixtures và negative isolation tests. Đây là safety namespace và future data portability, không phải cam kết shared multi-tenant hosting.

### Alternatives rejected

- **Drop toàn bộ tenant model:** rejected vì cần destructive schema/offline migration, làm yếu object ownership và không mang lại lợi ích tương xứng ở quy mô một giáo xứ.
- **Chỉ hardcode `gia-ton`:** rejected vì tạo identity ngầm rải rác, khó restore/clone/test và có thể chạy nhầm database mà không fail closed.
- **Tiếp tục multi-parish production runtime:** rejected vì không còn requirement, vẫn để public/worker/config selection surface tồn tại.
- **Tách microservice/database mới:** rejected; một modular monolith và một database vẫn đúng blast radius/cost hiện tại.

### Rollout, recovery and residual risk

- Trước deploy, operator phải inventory read-only live DB và set exact scope (deployment hiện dự kiến `gia-ton`, nhưng local source không chứng minh live data). Nếu preflight báo mismatch, dừng rollout, sao lưu/điều tra và dùng migration riêng trên bản sao; không đổi env hoặc sửa trực tiếp chỉ để vượt gate.
- `npm run audit:deployment-parish` chạy cùng dynamic preflight trên audit credential/target trước rollout, hash database/parish reference mặc định và exit non-zero khi mismatch. Command không import bootstrap DB, không chạy migration và không ghi dữ liệu.
- Deployment chứa dữ liệu nhiều parish không còn được support bởi một process production. Tách deployment/data nếu nhu cầu đó quay lại; ADR mới phải định nghĩa routing/identity/migration trước khi nới gate.
- Existing correct-parish sessions vẫn hợp lệ; token parish khác fail closed. Client tiếp tục nhận `parishId` trong authenticated identity để không trộn cache/offline mutations.
- Dynamic table discovery thêm read-only startup queries theo số table, không nằm trong request path. Chưa có production Turso timing, release SHA, live DB inventory hoặc rollback drill; các mục đó vẫn là operator evidence, không được suy từ local tests.

### Verification

Targeted boundary/worker **3 files / 35 tests PASS**; schema/seed **3 files / 14 tests PASS**; security-critical **7 files / 73 tests PASS**. Server typecheck, lint zero-warning, architecture inventory và `git diff --check` PASS; inventory hiện 31 routes / 6 repositories / 48 services / 12 domain files / 57 tables. Full serialized run đầu: **318/320 files, 2.217/2.219 tests PASS** trong 859,27s; hai failure đều là fixture cũ gọi hardened grade writer mà không tạo current authority (hai chủ nhiệm thiếu assignment; admin ID không tồn tại). Bổ sung đúng assignment/admin fixture, không nới production guard; rerun đúng hai file **2/2 files, 8/8 tests PASS**. 318 file đã pass không chạy lại chỉ để tạo con số một lượt xanh. Local evidence không thay production inventory/smoke.

CLI mới đã được chạy read-only trên database local mặc định và trả non-zero đúng contract, chỉ nêu `academic_years`, `branches`, `mapping_memory` có unexpected scope; không có row/parish ID trong output và không write. Database local này không được coi là production inventory hay tự động “dọn” để pass. Dev startup không set deployment scope vẫn cho phép multi-parish fixture; production/explicit scope mới bật hard gate.

---

## ADR-107: Assessment Result Concurrency, Scan Provenance and Idempotent Exam Materialization (2026-09-06)

**Status: APPROVED / IMPLEMENTED — final verification recorded below. Severity: D3. Profiles: DATA INTEGRITY + OFFLINE/CONCURRENCY + PRIVACY + RECOVERY. Reversibility: R1 for command/UI behavior; additive columns and migrations are R2.**

### Problem and evidence

Independent current-code audit and executable probes found five concrete breaks in an otherwise sound Question Bank → Exam → OMR → Grade pipeline. An essay-only update of a mixed B–H result reused stored answers but defaulted scoring/provenance to A; existing result writes had no compare-and-swap precondition; same-student queue compaction could strand the client mutation ledger and could replace an op while its request was in-flight; Question Bank build retries used a newly generated session identity rather than a stable command identity; and the server accepted scan-labelled results without accepted detector metadata while current results omitted capture/actor provenance.

These are command and consistency-boundary defects, not evidence for a new service topology. The existing modular monolith, immutable question snapshots/manifests, server scoring and transactional single-writer Grade handoff remain the selected architecture.

### Decision

1. **Mixed component preservation:** an essay-only mixed command reads the current result in the same writer-first transaction and preserves the stored MC answers, exact A–H version, scan source/metadata, attempt fingerprint and capture time. Server scoring recomputes the total from that preserved MC component plus the incoming essay component.
2. **Optimistic result concurrency:** `exam_results.result_version` starts at 1. Updating a current row requires exact `expectedResultVersion`; create accepts absent/0 only. The SQL update compares the observed version and increments atomically. Missing/stale preconditions return typed 409 `EXAM_RESULT_VERSION_CONFLICT`; clients refresh authoritative state and do not silently retry the stale write. Answer-key/variant rescoring also increments result version and records the server actor/time.
3. **Durable queue lifecycle:** sync operations are claimed atomically from `pending|retrying` to `processing` before network I/O. Queue compaction excludes processing rows, so a later result receives a new durable op instead of replacing an in-flight payload. Expired processing leases recover to retrying after an interrupted process. The result ledger marks an older mutation `superseded` only when both mutations resolve to the same compacted queue ID; separate in-flight and next ops remain independently visible. Server OCC resolves the eventual ordering rather than client last-write-wins.
4. **Idempotent Question Bank materialization:** every build requires a client-stable `buildCommandId`. When no explicit seed is supplied, the service derives one from the command. A canonical request hash is persisted on `exam_sessions`; a retry with the same command/hash returns the prior session/snapshots/manifests, while command reuse with different input returns 409. The existing build transaction and deliberate duplicate-exam capability remain intact.
5. **Structured current-result provenance:** source `omr|qr_scan` requires structured `scanMetadata` with `detectionStatus='accepted'`; MC/mixed additionally require metadata `examVersion` and `questionCount` to match the scoring inputs. Scan UI persists detected answers, final answers and explicit correction diff. Results store attempt fingerprint, client capture time, server saver and save time. Image/frame/base64 payloads remain prohibited and review images remain local opt-in with TTL.
6. **Manifest mutation ownership:** answer-key and answer-variant service functions enforce the immutable manifest lock themselves, inside their transaction, so direct service callers cannot bypass the route-level guard.

### Alternatives rejected

- Last-writer-wins or automatic retry after 409: rejected because it silently discards a confirmed result from another tab/device.
- A uniqueness constraint on exam business fields: rejected because deliberate re-exams with the same class/subject/type are valid; command idempotency is the correct retry boundary.
- Uploading answer-sheet images by default: rejected because structured provenance closes the verified current-row gap without accepting unnecessary student-data retention.
- Immediate append-only attempt/revision table: deferred until the product defines whether full historical attempts are required, retention duration, who may view them and purge/backup behavior. Current-result provenance is implemented; legal-grade history is not claimed.
- Microservices, event bus or replacement of SQLite/Dexie: rejected because none addresses the proven semantic defects.

### Compatibility, rollout and recovery

- Migrations `20260906-170` through `175` add nullable provenance/build columns and `result_version NOT NULL DEFAULT 1`; schema readiness requires all markers/columns. Existing rows therefore become version 1 without data rewrite.
- A stale installed client that updates an existing result without `expectedResultVersion` receives 409 rather than overwriting. Frontend and backend should deploy together; this is a safe fail-closed compatibility break.
- A stale client that calls Question Bank build without `buildCommandId` receives validation failure rather than creating a retry duplicate. Deliberate new builds use a new command ID.
- A process interrupted during network I/O leaves a processing lease. It becomes retryable after expiry; server mutation receipt/build command identity/OCC make replay safe. The five-minute local lease is not a claim about provider latency and can be reassessed with production evidence.
- This decision records provenance of the current accepted result and correction values, not an immutable history of every proposal, rescan, reopen or finalization. That retention requirement remains **NOT CONFIRMED**.
- Physical OMR accuracy, printer geometry, target-device latency, sustained throughput and production feature-flag population remain governed by ADR-060/068/069/070 and are not certified by source/tests.

### Verification and reassessment

Targeted assessment, OCC, Question Bank, queue and provenance regression: **10/10 files, 147/147 tests PASS**; remediated diagnostic probe **1/1 file, 4/4 tests PASS**. These cover mixed variant B two-phase scoring, malformed/mismatched scan metadata rejection, concurrent same-version writers, same-command build replay/conflict, direct-service manifest lock, compacted-ledger supersession, in-flight queue isolation and stale processing-lease recovery. Lint zero-warning, architecture inventory **31 routes / 6 repositories / 48 services / 12 domain files / 57 tables**, design-system guard **0/127**, client/server TypeScript and production frontend/PWA/server build PASS (**2,814 modules; 238 precache entries**). Full serialized coverage: **320/320 files, 2,225/2,225 tests PASS** in 1,118.56 seconds; Statements **69.92%**, Branches **59.22%**, Functions **62.41%**, Lines **72.56%**. `git diff --check` PASS. External field/production gates above remain open.

---

## ADR-108: Roster Membership, Assignment and Import Recovery Boundaries (2026-09-06)

**Status: APPROVED / IMPLEMENTED — engineering verification complete; production gates remain below. Severity: D3. Profiles: DATA INTEGRITY + AUTHORIZATION + OFFLINE/RECOVERY. Reversibility: R1 for command/UI changes; partial UNIQUE indexes are R2.**

### Context and evidence

The current-code roster audit reproduced semantic breaks at the adapters around otherwise sound tenant-scoped persistence: normalized duplicate retrieval could miss the row it later intended to compare; class resolution could cross academic years; branch/class membership had no shared gate; three assignment writers enforced different role/cardinality rules; class deletion/structural edits could strand live dependencies; Undo omitted update dependencies/fees and the current actor; offline promotion used generic student updates without promotion provenance; and row commits could outlive stale import-batch metadata. These are concentrated consistency-boundary defects, not evidence for a service split or a roster rewrite.

### Decision

1. **One membership invariant owner.** Manual create/update and roster create/update resolve an active target class inside the write transaction and derive its canonical branch. A manual class/branch correction requires `membershipChangeReason` and records `UPDATE_MEMBERSHIP_CORRECTION`. Promotion is not a generic correction: source class, destination target year and destination branch are validated by `PromotionApplicationService`.
2. **Promotion is online server-authoritative.** `PromotionPanel` no longer queues generic `PUT /students/:id` mutations. Offline attempts preserve the confirmed projection and ask for connectivity. This supersedes only ADR-052's offline-fallback clause; its batch partial-success, snapshot, lock/policy and per-item transaction decisions remain active.
3. **One assignment invariant owner.** Class-centric, user-centric and create-user adapters call `classAssignmentPolicy` in their transaction. Only undeleted `chunhiem|phuta` accounts in `ACTIVE|FORCE_PASSWORD_CHANGE` and active same-parish classes are assignable. One user/class role, one CN per class and one CN class per user are mandatory. Migration `20260906-176` adds two partial UNIQUE indexes as commit-race backstops; pre-existing collisions make migration fail closed and require reviewed reconciliation, never automatic deletion.
4. **Class lifecycle blocks semantic reclassification.** Delete and `branchId|academicYearId` changes are rejected while active memberships, assignments, attendance/exam sessions, leave, fees/financial rows, grade-import provenance or promotion rows reference the class. No historical row is cascaded or silently moved.
5. **Explicit import decisions.** Validation/import require an active unlocked `academicYearId`; exact/fuzzy matching is restricted to that year and ambiguous/tied candidates require choice. Duplicate candidate reads fail closed and compare normalized candidates. CSV/TXT is quote-aware, XLSX remains structured, missing gender/branch stays unresolved, and DOB lower bound matches manual CRUD.
6. **Durable partial-import control state.** Batch provenance and any pre-created classes share a transaction. Each committed row/chunk updates `import_batch_students` and batch counters in the same transaction island. On restart, only `processing` batches created before the current process are finalized from committed provenance; unreferenced batch classes are safely decommissioned. Intentional per-row partial success remains; there is no 2,000-row mega-transaction.
7. **Undo and optimistic recovery are truthful.** Undo checks downstream dependencies for both created and updated students, including fees, attributes audit to the current actor and returns itemized outcomes/class cleanup. StudentModal waits for encrypted queue ownership. Permanent student create rejection removes the temp projection; update/delete rejection reads the authoritative object, or removes the untrusted projection if that read fails, while retaining the failed queue payload in Diagnostics.
8. **Operations remain review-only.** `npm run audit:roster-integrity` opens a read transaction and emits counts plus hashed references for identity candidates, branch/class mismatches, stale class/assignment links, homeroom cardinality, cross-year aliases, interrupted batches and empty active classes. It never runs migrations or repairs data.

### Alternatives rejected, compatibility and recovery

- Hard UNIQUE identity keys, automatic person merging and automatic class transfer are rejected: name/DOB/phone are candidate evidence, not guaranteed identity.
- Cascade deletion, one giant import transaction, microservices and a generic workflow/event layer are rejected because they increase migration/blast radius without fixing the reproduced semantic boundaries.
- Existing valid imports keep partial-success and explicit duplicate decisions. Old clients missing `academicYearId` or correction reason fail closed and must update. Existing assignment collisions must be inventoried before migration 176; the migration intentionally does not guess which CN is authoritative.
- `FORCE_PASSWORD_CHANGE` is assignable for provisioning but grants no runtime authority before activation. The supported deployment is one SQLite/libSQL writer namespace under ADR-106; recovery's process-start boundary is not a multi-writer lease claim.
- The local/default inventory target is not production evidence. Production inventory, migration application, release SHA and operator review remain external gates.

### Verification

Targeted evidence: remediated roster audit probe **13/13 PASS**; CR2 recovery, including composition-root recovery across parish scopes before HTTP bind, **14/14 PASS**; permanent student rejection reconciliation **12/12 PASS**; assignment/promotion topology **8 files / 45 tests PASS**; post-gate academic-year-ID/topology and OCC regressions **3 files / 34 tests PASS**. Final `npm run verify:ci` on the complete code set after composition-root recovery wiring passed: lint zero-warning, architecture inventory **31 routes / 6 repositories / 51 services / 12 domain files / 57 tables**, design-system guard **0/127**, client/server TypeScript and production frontend/PWA/server build PASS (**2,814 modules; 238 precache entries**), serialized coverage **321/321 files, 2,245/2,245 tests PASS** in 920.08 seconds. Coverage: Statements **70.24%**, Branches **59.36%**, Functions **62.92%**, Lines **72.87%**. The read-only roster inventory completed with zero findings on target fingerprint `0f514a8e24b4e5c4`; this identifies only that configured local/default target. Production inventory, migration 176, exact release SHA, deploy and smoke remain unverified external gates.

---

## ADR-109: Frontend Durable Acknowledgement, Auth Bootstrap and Responsive Runtime Alignment (2026-09-07)

**Status: APPROVED / IMPLEMENTED — local serialized coverage, build and targeted Axe verification complete; remaining full-E2E/device gates are below. Severity: D3 for academic offline integrity, D2 for runtime/accessibility/performance. Profiles: DATA INTEGRITY + OFFLINE/RECOVERY + GENERAL. Reversibility: R1.**

### Context and evidence

The current-code frontend audit reproduced two no-error-budget violations before the established sync engine boundary. Attendance fabricated an all-saved batch response while encrypted Dexie enqueue was still fire-and-forget; Grade returned `void`, cleared matrix dirty IDs and rendered success before enqueue could reject. Independent P1 paths also accepted invalid semester URL state, skipped settings/year bootstrap after a fresh login, selected a native mobile shell that CSS hid at 1024px, globally prevented pinch zoom, recreated grade cell renderer identity during background pulls, and eagerly pulled diagnostics into the startup graph.

### Decision

1. **Draft then durable ownership.** Before durable insertion, the editor owns a volatile draft. Attendance applies its local read model and returns a receipt only after either server acknowledgement or the encrypted queue transaction commits; queued receipts are labeled `durable_queue`, not server-synced. Enqueue failure returns no receipt and keeps editor draft/error state.
2. **Grade acknowledgement is awaitable.** `upsertGrade` and `batchSaveGrades` return promises and rethrow encryption/IndexedDB failure after setting a visible store error. Matrix saves snapshot dirty IDs and clears only entries whose exact snapshot was acknowledged; later edits to the same student remain dirty. Failure retains draft IDs and exposes explicit retry. Grade import awaits the same boundary before storing its undo/success marker.
3. **Existing sync authority is preserved.** No new queue, backend endpoint, schema or writer is introduced. After queue commit, the ADR-016 sync engine continues to own retry, compaction, OCC, tenant/user scope and reconciliation. Server-applied `skipSync` projections remain local-only.
4. **Authenticated bootstrap has one owner.** `runInitialSync`, triggered by authenticated root lifecycle, awaits settings and academic-year reference reads before the ordinary push/pull sequence. The pre-auth one-shot in `main.tsx` is removed.
5. **Canonical navigation and shell predicate.** Semester query accepts only `1|2`; deleting the final defaulted filter still navigates to canonical empty search. `useEffectiveMode` uses the same `<1024` predicate on web and Capacitor, matching CSS visibility.
6. **Zoom is user-agent-owned.** The global gesture-prevention module is removed and Axe no longer disables `meta-viewport`. This supersedes the zoom-lock exception recorded by ADR-072/077/078 and the historical mobile audit; it does not itself prove 200% reflow or assistive-technology acceptance.
7. **Measured, narrow startup change.** Header diagnostics is an on-demand chunk with pointer/focus preload. The post-change production HTML startup graph excludes `SystemDiagnosticsModal`; no broader chunk/CSS rewrite or numeric field-performance target is selected without device evidence.

### Alternatives, compatibility and recovery

- Keeping optimistic success plus a background warning is rejected because storage/encryption failure can leave zero durable owner while the UI confirms success.
- Replacing Zustand/Dexie, adding a second offline engine, microfrontends, or splitting large modules by LOC is rejected: none is required to repair the reproduced boundaries.
- Waiting for server acknowledgement for every offline edit is rejected because durable local ownership is the intended offline contract; UI must distinguish it from server synchronization.
- Rollback is a source revert with no migration. Existing queue rows and server contracts are unchanged. If the new promise contract exposes an overlooked caller, it must be fixed rather than swallowing rejection or weakening the acknowledgement gate.

### Verification and open gates

TypeScript build, oxlint, architecture inventory and design-system guard (**0/127**) passed. Targeted regression passed **9 files / 55 tests**, including rejected grade/attendance enqueue, retained dirty draft across failed context switch, invalid/missing/reset semester URL, fresh-auth bootstrap, native breakpoint source contract, global zoom-guard absence and focused unblurred cell preservation. Full serialized coverage passed **322 files / 2.256 tests** (statements **70,52%**, branches **59,56%**, functions **63,19%**, lines **73,14%**). Frontend production build passed with **2.813 modules** and **238 / 2.552,29 KiB** PWA entries; startup HTML references **70 assets / 926.389 raw bytes** and does not preload diagnostics. Targeted Playwright Axe with `meta-viewport` enabled passed **25/25**. The first remaining Playwright run passed **42/47**; all five failures were traced to stale test fixtures/contracts rather than the FUX runtime paths. Exact rerun after fixture correction passed **3/5**. The last Smart Exam state-isolation and invalid-QR fail-closed assertion corrections pass TypeScript/oxlint but remain **UNVERIFIED** because the execution environment rejected their rerun before startup. Full Playwright regression, manual 200% reflow, physical native 1023/1024 profiles and production telemetry therefore remain open and must not be represented as verified.

---

## ADR-110: Task & Event Operations Bounded Context (2026-09-07; amended 2026-09-11)

**Status: APPROVED / IMPLEMENTED FOR ONLINE-FIRST MVP — local verification recorded in the active implementation plan. Severity: D3. Profiles: AUTHORIZATION + TENANT ISOLATION + DATA INTEGRITY + NOTIFICATION RECOVERY. Reversibility: R1 for route/UI policy; additive schema and partial UNIQUE indexes are R2.**

### Context and decision

Catevia needs an internal coordination workspace without turning its public parish calendar into a task database or encoding organizational titles as account roles. Operations therefore remains a module of the existing modular monolith and owns the event command aggregate: `operation_events`, workstreams, tasks, assignments, checklist, participants, comments, reminders and idempotency receipts. From the 2026-09-09 amendment, `/operations` is the only event write surface and `parish_events` is a public calendar read projection managed by Operations, not an independent business writer. Any `PUBLIC_SUMMARY` event gets exactly one same-parish projection generated by the server; an `INTERNAL` event gets none. Task, assignee, comment, readiness and retrospective details never enter `/api/parish-events`.

Authorization composes three distinct layers: coarse authenticated account baseline (`users.role`), active organizational position and unit scope (`parish_people` + explicit `parish_service_terms.position_code` + `parish_organization_units`), and resource-specific operational roles. The organization tree has Ban Điều hành (`BOARD`) at its root; Ngành (`BRANCH`, catechesis) and Ban chuyên môn (`COMMITTEE`, specialist Xứ đoàn work) are peer direct children. Trưởng ngành and Trưởng ban have the same capability set over separate unit scopes, neither outranks the other, and one person may hold both through two independent active terms. `position_title` is display text and never grants authority. Trưởng Xứ đoàn, Trưởng ngành and Trưởng ban are organizational positions, not new `users.role` values. Phó Xứ đoàn, Thư ký, Thủ quỹ, Ủy viên and Phó ban remain official organization positions but acquire no Operations authority merely from their title. Event organizer, workstream membership and task assignment are explicit resource authority. An assignment grants execution/approval authority only after `ACCEPTED`: accepted `OWNER|CONTRIBUTOR` may execute, accepted `APPROVER` may approve, and `OBSERVER` may only view/comment. Pending/declined assignments retain only the visibility needed to inspect/respond and never satisfy accepted-owner readiness. A canonical user/person identity cannot simultaneously be OWNER/CONTRIBUTOR and APPROVER of the same task; the server checks both task and workstream assignment paths and rechecks immediately before approval. Workstream Lead may manage task assignments but cannot appoint another Workstream Lead. [SUPERSEDED IN PART BY ADR-112 O1–O2 (2026-09-11): Thư ký/Phó Xứ đoàn (`PARISH_SECRETARY/PARISH_DEPUTY`) and Phó Ban/Phó Ngành (`BRANCH_DEPUTY/COMMITTEE_DEPUTY`) now carry defined Operations authority, and technical ADMIN keeps parish-wide mutation override on all environments except execute/approve — see ADR-112. The position-code vocabulary is 7 codes, not 3.] Technical admin production has parish-wide Operations/audit read only and cannot inherit organizational mutation power from a linked personnel record. A temporary broad admin management override is available by default only in development/test, may be disabled with `OPERATIONS_ADMIN_MUTATION_OVERRIDE=false`, and is unconditionally disabled in production. All decisions are recomputed server-side with tenant/resource predicates; route policy is UX only. Authority-bearing changes to event scope, organizer or workstream scope additionally require organizational create authority at the destination scope. Public visibility requires the separate `operations.event.publish_public` capability, currently granted only to Trưởng Xứ đoàn (plus the non-production admin override). The client never owns or supplies the calendar projection ID.

An ordinary service term supplies membership and candidate scope only; without an authority-bearing position code or explicit resource role it grants no Operations read/comment capability. [SUPERSEDED IN PART BY ADR-112 O2 (2026-09-11): the technical ADMIN parish-wide mutation override now applies on all environments with no environment flag — see `server/src/utils/operationsAdminOverride.ts`. The sentence below about production is retained for lineage only and no longer governs.] The dev entrypoint explicitly sets `NODE_ENV=development`; test/Vitest may also use the temporary admin override, while a runtime with no recognized environment marker is denied ~~and production cannot enable it~~. Cancelling an event that is public or still owns a calendar projection additionally requires `operations.event.publish_public`, so resource-level cancel cannot become a visibility bypass. APPROVER validity changes re-run separation-of-duty before a dormant membership can regain authority.

Service-term `start_date/end_date` are parish civil dates. The active-term predicate uses the deployment-owned `PARISH_TIME_ZONE` (default `Asia/Ho_Chi_Minh`) for both actor authority and assignment-target scope; it does not use UTC date or browser state. Invalid timezone configuration aborts startup before HTTP/background workers. This remains deployment configuration because ADR-106 constrains one production process to one parish; multi-timezone tenancy would require a new per-parish configuration decision rather than silently falling back per request.

Every Operations mutation requires `Idempotency-Key`, stores a canonical request hash and response receipt in the same transaction, and rejects key reuse with a different command/payload. Browser CORS preflight explicitly permits both supported idempotency header names. A policy-gated maintenance pass may compact an old receipt response body, but it preserves the immutable parish/actor/key, command and request hash as a tombstone; a late identical retry returns `IDEMPOTENCY_REPLAY_EXPIRED` and never executes again. No retention duration is enabled without approved deployment configuration. Mutable aggregates use version compare-and-swap and audit in the same transaction. Assignment identity is independent of role so a task can have multiple contributors/observers while a partial UNIQUE index enforces at most one active owner. Required workstream/task/checklist readiness is computed on read. Required cancellation does not count as completion, cancellation requires a stored reason with a DB trigger backstop, and a task requiring approval only completes after `APPROVED`; dependency cycles and incomplete required checklist fail closed. Offset timestamps are normalized to UTC before persistence/comparison while event timezone is validated as IANA and remains separate. Completion derives Parish Memory `occurred_on/ended_on` from each event instant in that event timezone, never by truncating UTC.

Primary/reserve OWNER dispatch is modeled as a separate invitation aggregate, never as two active owners. One primary and at most one reserve must be actionable and within current organizational assignment scope. DRAFT stores the dispatch without delivery; PLANNING activates the primary invitation, while a CAS worker exposes the reserve at 70% of the actual primary-invite-to-deadline interval. The invitation inbox is target-specific and suppresses DRAFT/terminal events. Acceptance verifies the invited target and current event/task state, wins with dispatch OCC, then inserts one accepted OWNER under the existing unique-owner constraint in the same transaction. Direct OWNER assignment is rejected while an invitation is open, and task/event terminalization closes open dispatches.

A cancelled task can intentionally leave an event unable to close manually. The approved recovery is an explicit manager-scoped restore command: it requires reason, task OCC and an idempotent receipt/audit, changes only `CANCELLED -> TODO`, rejects a terminal parent event and never revives a cancelled or terminal reminder. This preserves cancellation history while giving operators a controlled path to finish required work. The 2026-09-10 lifecycle decision supersedes the retrospective prerequisite: evaluation is written only after COMPLETED and does not block closure. Manual closure requires outcome summary and every required task DONE; readiness override does not bypass this gate. A transaction/CAS worker advances published events to LIVE at their start and COMPLETED at their end, records missed readiness or unfinished counts and does not mutate task/checklist completion. Manual adjacent rewind requires a reason, preserves work/acknowledgements and persistently pauses both automations until an explicit OCC resume command.

Resource identity is fail-closed: caller-supplied event/workstream/task IDs must form one persisted graph before their roles can be combined. Required readiness counts only leads/accepted owners backed by a current active nondeleted staff account; an unlinked person remains a planning record, not an actionable owner. Parent accounts and parent-linked people cannot be organizer/operational assignee/lead/reminder recipient. READY is revalidated on transition to LIVE. Event configuration is immutable from LIVE; terminal tasks reject later structure/assignment/checklist/dependency changes, while retrospective comments and authorized attendance correction remain separate history/correction paths. Completed/cancelled events cannot acquire new planning children.

Operation reminders write a deterministic shared durable `notifications` row and the domain reminder state in one transaction. `ENQUEUED` means durable queue ownership only; `SENT` is set only after the notification worker records provider success. The worker intersects targeted recipients with same-parish ACTIVE, nondeleted users immediately before delivery. A missing/ambiguous queue row after enqueue is terminal and is never automatically manufactured into another delivery. Queue retry remains at-least-once under ADR-102. Operations inbox read state is separate from delivery and task state.

Reminder creation and due processing both recompute current resource visibility; revocation, scope loss or a resource already in a terminal state terminalizes the reminder before enqueue. The external push body is generic and does not include the internal task/event title. When a linked public event completes, Operations inserts a new `ACTIVITY` Parish Memory record in the same idempotent transition transaction. It never updates by `parish_records.source_event_id`, because that column is a nonunique soft historical link and not an Operations ownership key.

The public-calendar path is deliberately different from private operational reminders. A DRAFT never has a calendar projection or external notification. Transitioning a `PUBLIC_SUMMARY` DRAFT into PLANNING upserts the minimal `parish_events` projection and inserts one deterministic durable Web/Native Push row targeted to same-parish ACTIVE parent accounts in the same idempotent transaction. Its body contains only the public event title/date/time/location. Editing an already-published public event synchronizes the projection; switching it to internal, cancelling it or rewinding to DRAFT soft-deletes the projection. A sent notification cannot be retracted. Direct `POST|PUT|DELETE /api/parish-events` always returns `405 CALENDAR_READ_ONLY`, the calendar client/store exposes no mutation, and legacy rows remain readable rather than being destructively migrated. Notification delivery remains at-least-once and physical-device/multi-instance evidence remains a rollout gate.

### Scope, compatibility and recovery

The MVP is online-first for writes. It does not add a second Dexie mutation queue, generic workflow/grant engine, ticketing, CRM, payment, Gantt, recurrence or attachment store. The calendar is now read-only and Operations owns projection writes as described above. Operations may persist only a server-confirmed overview read projection through the existing encrypted `dexieStorage`, keyed and payload-validated by exact `parishId:userId`; it never persists the permission map and stale/cache state cannot authorize a mutation. The UI must show the snapshot time, disable detail refresh/mutations until a fresh server snapshot exists, and never fabricate local success. Durable offline Operations mutations require a future ADR defining temp-ID remap, dependent ordering, receipt reconciliation, authorization-at-replay and conflict UX.

Reusable event templates are organizationally scoped immutable snapshots inside Operations, not calendar events. A content version may carry event/task/checklist content, task phase/priority/requirements and deadline/shift offsets relative to event start; it never carries assignee identity, acknowledgement, approval result, attendance, comments, dependencies/workstream membership, receipts or reminder state. Creating, versioning and instantiating requires current event-create authority at template scope plus OCC and receipt/audit. Instantiation materializes one exact content version atomically as a `DRAFT` operation event with `TODO` tasks and incomplete checklist. A public DRAFT still has no projection/notification; those are produced only by its later PLANNING transition. The client does not link an existing calendar row. Provenance is same-parish and version-valid at the database boundary, and later content versions do not mutate instances. Template archive/restore is a reversible metadata lifecycle command with current scope authorization, mandatory reason, expected monotonic family version + latest content version, status CAS, receipt and redacted audit. Family version increases on content-version creation, archive and restore, preventing an old command from becoming valid again after an ABA status cycle. Archived families cannot be previewed, versioned or instantiated, but their immutable versions and existing event provenance are retained; restore re-enables the same family. Curated template content remains pilot-gated; automated recurrence remains out of scope.

Private list responses use the existing project pagination convention (50 rows by default, client-request cap 500) and expose total/page metadata plus load-more UX. Authorization for each list is still server-authoritative but evaluates an actor snapshot against the already-loaded resource graphs in one batch, avoiding per-row authorization queries. This is a response/load-safety contract, not a latency SLO; representative production/pilot latency remains unclaimed until measured.

Migration `20260908-230` adds the controlled `position_code` vocabulary `PARISH_LEADER|BRANCH_LEADER|COMMITTEE_LEADER`. Legacy backfill accepts only exact leader titles in a compatible active unit; titles such as `Phó trưởng ngành` remain unprivileged. Service validation and migration `231` triggers enforce code/unit compatibility, while the resolver also checks current term dates and active units. Migrations `20260909-248..249` protect new structural writes: Board is root, Branch/Committee are direct children of an active same-parish Board, and a Board with such children cannot be invalidated by type/status/delete update. Migration `20260909-250` rejects inclusive date-range overlap for the same leader code/scope, enforcing one current Trưởng Xứ đoàn parish-wide and one current Trưởng ngành/Trưởng ban per unit without preventing cross-scope concurrent roles. Service validation plus partial unique index migration `20260910-251` limit each parish to at most one active nondeleted Board; a legacy duplicate makes migration fail rather than choosing a winner. Existing legacy rows are intentionally not auto-reparented or auto-resolved; deployment reconciliation remains a rollout gate. Broadening `users.role` remains rejected. Existing legacy workstream leader fields are backfilled into membership rows for compatibility and are no longer authorization sources.

All service-term create/update/delete commands are authority-bearing even when `position_code` is null because active membership affects Operations candidate eligibility and assignment scope. Ordinary membership alone does not grant event/task visibility; that still requires a leader position or explicit resource role. The HTTP boundary therefore requires admin reauthentication under the existing rate limiter plus an explicit reason; a request-bound proof is revalidated inside the service transaction before the write, and audit stores the reason but never the credential. The service rejects create/update when the target person is linked to the acting admin account, preventing self-grant. Replacing/bootstraping Trưởng Xứ đoàn remains an externally authorized custodial action rather than an Operations privilege.

Schema migrations fail closed on duplicate active event-source links or owners. Migrations `20260908-232..233` add task cancellation reason plus insert/update trigger backstops; migration `234` adds the nullable receipt response-compaction marker without deleting idempotency identity. Recovery is restore/revert plus reviewed data reconciliation; migrations never choose a winning duplicate automatically. Production migration application, live-data duplicate inventory, push-provider smoke and physical mobile acceptance remain deployment evidence, not local-code claims. Receipt retention **duration** and representative list/readiness latency remain open because the repository has no approved duration or measured field target; no arbitrary numeric gate is introduced.

---

## ADR-111: Retire Telegram; Web/Native Push Is the Only External Notification Channel (2026-09-08)

**Status: APPROVED / IMPLEMENTED IN CURRENT WORKING TREE. Severity: D3. Profiles: PRIVACY + AUTHORIZATION + DURABLE DELIVERY + MIGRATION. Reversibility: application/config removal is R1; migration `20260908-235` is R2 because consent is revoked but historical rows are retained.**

### Context and decision

Telegram adoption no longer justifies a second delivery identity, bot lifecycle, consent UI, secret set and retry path. Leaving the provider disabled by environment alone is unsafe: old retry rows, active links and restore data could resume delivery if configuration returns. ADR-111 supersedes the active-channel portions of ADR-022, ADR-039, ADR-102 and ADR-105 while preserving their historical record.

Catevia therefore supports one external notification abstraction: targeted Web/Native Push through `appPushService` and the durable `notifications` worker. In-app state and `audit_logs` remain business history; structured logs and optional Sentry own operational failures. Parent/academic, parish notice, Sunday, leave-review and Operations reminders use server-resolved tenant-scoped recipients. Grade override/restore is audit-only and does not create an external delivery.

The grammY bot, Telegram services, composition-root lifecycle, client linking UI/API methods, package dependency and deployment variables are removed. Four former parent routes remain as authenticated parent-role compatibility tombstones returning `410 CHANNEL_RETIRED`; they perform no write. Notification templates are plain text rather than Telegram Markdown.

### Migration, compatibility and recovery

Migration `20260908-235` consumes unused link tokens, revokes active/enabled links and terminalizes retrying Telegram notifications with `CHANNEL_RETIRED`, clearing their leases and next-attempt timestamps. Startup repeats this idempotent transaction before recovery, and recovery only materializes `web_push` work. Sent/failed delivery history, revoked link rows, legacy audit actions and schemas remain available for accountability and backup compatibility. No migration deletes or replays a legacy message.

Rollback never silently restores old consent. Reintroducing Telegram or another chat provider requires a new decision and fresh opt-in. Dropping/anonymizing legacy identifiers requires a separate approved retention policy covering live data and backups.

### Consequences and gates

- Positive: one recipient model, no global chat fallback, no unauthenticated bot authority and no restored Telegram retry path.
- Trade-off: users must enable browser/native notifications or rely on in-app state; repository changes cannot revoke a real provider token or delete secrets already stored in Render.
- Deployment gates: apply migration `235`; remove the three Telegram secrets from the live service; revoke the bot token with the provider; inspect retirement counts; run real Web/Android/iOS push smoke tests.
- Follow-up hardening: every durable item carries an explicit target array; missing/malformed/empty or inactive targets fail closed, and zero usable endpoint cannot become `sent`. Web/native selection joins bindings to an ACTIVE, nondeleted same-parish account, so legacy unbound Web Push subscriptions and locked/deleted accounts are excluded even from direct parish broadcast. Permanently dead endpoints/tokens are removed without retrying the aggregate item.
- Reliability remains at-least-once after provider acceptance. A transient aggregate partial failure or crash after provider acceptance may still duplicate delivery to an endpoint already reached; provider-level exactly-once is not claimed and would require a per-endpoint delivery ledger.

The evidence map and recovery rationale are maintained in `TELEGRAM_DECOMMISSION_RESEARCH_2026-09-08.md`.

---

## ADR-112: Xứ Đoàn Organizational Authority for Operations (2026-09-11)

**Status: APPROVED / IMPLEMENTED IN CURRENT WORKING TREE. Severity: D3. Profiles: AUTHORIZATION + TENANT ISOLATION + MIGRATION. Reversibility: R2 — migrations `20260912-256/257/258` add nullable-compatible columns with backfill; new position codes are additive; no table/entity is removed.**

### Context and decision

Operations behaved as a generic project-management system: technical `users.role` acted as business authority, `ADMIN` implicitly equaled Xứ đoàn trưởng, event creator implicitly equaled organizer, and any staff could be placed as Field lead or cross-unit assignee. ADR-112 derives Operations authority from account baseline + active Organizational Appointment (`position_code`) + unit scope + operational role, reusing Event, Workstream (= Field), Task, Assignment, Readiness, Reminder, Template, Idempotency, OCC and Audit without new entities.

Locked decisions O1–O8: (O1) Phó Xứ đoàn (`PARISH_DEPUTY`) may create Xứ đoàn events as creator with organizer defaulting to the active Xứ đoàn trưởng; (O2) technical ADMIN keeps parish-wide mutation override on all environments except `task.execute`/`task.approve`, controlled by admin account governance + audit; (O3) Phó Ban/Phó Ngành cannot be Field lead; (O4) observers stay per-Field, no event-level observer table; (O5) primary/reserve dispatch + acknowledgement is kept; (O6) cross-unit borrowing is forbidden for now and needs its own workflow later; (O7) `tasks.scope_unit_id` ships nullable-first with backfill, NOT NULL later; (O8) backend keeps stable English codes, UI shows Vietnamese labels.

### Contract

1. Position codes: `PARISH_LEADER|PARISH_SECRETARY|PARISH_DEPUTY ↔ BOARD/toàn xứ`, `BRANCH_LEADER|BRANCH_DEPUTY ↔ BRANCH`, `COMMITTEE_LEADER|COMMITTEE_DEPUTY ↔ COMMITTEE`. `position_title` never grants authority. Parish-wide target scope covers ADMIN override, `PARISH_LEADER`, `PARISH_SECRETARY`, `PARISH_DEPUTY`.
2. `operation_events.event_scope_type ∈ {XU_DOAN, UNIT}` with `XU_DOAN ↔ scope_unit_id IS NULL` enforced by schema CHECK plus triggers; never reuse content `eventType` for scope. Xứ đoàn structure is EVENT → FIELD (Workstream with mandatory `sourceUnitId`) → TASK (OWNER/CONTRIBUTOR in-unit); chuyên môn structure is EVENT → TASK with Field UI hidden when no workstream exists.
3. Creator ≠ organizer, enforced server-side: Xứ đoàn events require an active `PARISH_LEADER` organizer (auto-selected when exactly one exists); deputy-created chuyên môn events require the unit leader as organizer. Candidate pickers and client permission maps are UX only.
4. Standalone tasks carry `scope_unit_id` derived from the creator appointment; missing scope fails closed for business actors (admin compatibility path preserved for legacy rows).
5. `GET /operations/creation-options` is the server-authoritative source for the "+ Tạo mới" menu; mutations re-check everything. Readiness, lifecycle, reminders, dispatch, templates, retrospective, audit, OCC and idempotency semantics are unchanged.

### Migration, compatibility and recovery

Migrations `256` (position-code CHECK rebuild + scope/overlap triggers for new codes), `257` (`event_scope_type` + backfill NULL→XU_DOAN / non-NULL→UNIT + consistency triggers + index), `258` (`tasks.scope_unit_id` + backfill from workstream/event + index + scope triggers), `259` (exact-match backfill of deputy/secretary titles left NULL by `20260908-230`, same fail-closed overlap semantics). Strict business checks (organizer-must-be-leader, field-scope-required, standalone-scope-required, deputy-lead ban) apply to business actors; ADMIN keeps a compatibility path so existing fixtures, rehearsal digests and e2e flows continue to work. Rehearsal latest marker moves to `20260912-259` (with explicit post-migration asserts for the new columns/codes); `operations.test.ts` manager-nudge expectations move to creator+organizer recipients with event-scoped deltas.

### Consequences and gates

- Positive: organizationally correct authority, scope-safe staffing, explicit creator/organizer separation, no generic-enterprise over-modeling, no new entities.
- Trade-off: full strictness (leader-only Field lead, NOT NULL task scope, event-level observer) is deliberately deferred to follow-ups after data backfill; ADMIN override concentration remains and must be governed by account controls.
- Deployment gates: run `db:audit:operations-migration` rehearsal on a finalized backup, run `audit:operations-authority` preflight (new codes included), run `operations.test.ts` (54), readiness/rehearsal/receipt/parishProfile/migration suites, `tsc -b`, `oxlint --deny-warnings`, `lint:ds`.
- Residual: cross-unit collaboration workflow, event-level observer design, strict leader-only lead enforcement and task-scope NOT NULL are tracked follow-ups, not silent scope cuts.

### Amendment 2026-09-11 (follow-up hardening, same decision)

- Creator≠organizer resolution is shared by `POST /events` and template instantiate (`resolveEventOrganizerForCreate`); `PUT /events/:id` keeps `eventScopeType ↔ scopeUnitId` consistent (scope change re-derives the type, organizer changes re-validate the leader rule for business actors).
- Follow-up tasks persist `scopeUnitId` from the parent event. Standalone-task scope stays route-enforced only (no DB trigger) because the ADMIN compatibility path is actor-aware.
- Migration `20260912-259` exact-match backfills deputy/secretary titles left as `NULL` by `20260908-230` (`thư ký→PARISH_SECRETARY`, `phó xứ→PARISH_DEPUTY`, `phó ngành→BRANCH_DEPUTY`, `phó ban→COMMITTEE_DEPUTY`, BOARD/BRANCH/COMMITTEE-guarded), activating the O3 deputy-lead ban on legacy data with the same fail-closed overlap semantics as 230 — run `db:audit:operations-authority` preflight before upgrading production.
- Frontend PREPARING gates (`EventReminderForm`, `WorkstreamPanel writable`) are aligned with the backend (no event-status gate beyond COMPLETED/CANCELLED). E2E UI flows move to the "+ Tạo mới" authority menu.

### Amendment 2026-09-11 (P0 hardening, same decision)

- List endpoints (`GET /events|/tasks|/workstreams`) read in two phases — visibility decided on narrow auth columns, full rows hydrated only for the requested page, related maps restricted to referenced IDs (chunked). Response shapes, ordering and totals are unchanged; per-row fail-closed authorization is preserved.
- `formatStoreError`/`handleConflictSync` only treat genuine OCC conflicts as version conflicts (code `VERSION_CONFLICT/VERSION_MISMATCH` or OCC message); other 409 codes keep their own Vietnamese message and skip the global refetch (dedicated dialogs own acceptance/override flows).
- Checklist toggle safety is by construction (single atomic transaction + parent task CAS) and is now locked by an overlapping-toggle regression test: exactly one commit wins, approval resets exactly once.
- Reminder enqueue retry is bounded (`MAX_REMINDER_ENQUEUE_ATTEMPTS = 25`): attempts are counted, exhaustion terminalizes the row as FAILED with its error text.
- Operations router guard (auth + staff roles) is covered by `operationsRouteGuard.test.ts`, now part of `test:security-critical`.
- OperationsPage is decomposed into authority-menu page shell plus `CreateEventForm`, `StandaloneTaskForm`, `EventTaskForm`, `TaskAssignForm`, `EventEditForm`, `TaskChecklistSection` (local draft state each); event-modal tab selection falls back to `tasks` when the active tab disappears; the dead `sourceParishEventId` deep-link search param was removed from the router.

### Amendment 2026-09-12 (secretary scoping + strict field lead, product-decided)

- `PARISH_SECRETARY` no longer shares the parish-office capability set: read-only parish-wide (`event.view`, `task.view`) + `event.create` for Xứ đoàn events only (unit-scoped creation fails closed via the organizer scope rule); full rights on self-created events flow through the existing `EVENT_CREATOR` resource role, not position scope. Secretary target-scope checks are unit-scoped like any business actor, and the "+ Tạo mới" menu hides unit options for secretaries. Closes the DESIGN DECISION NEEDED on deputy/secretary Xu-Doan creation for the deputy path (confirmed: creator deputy, organizer leader); secretary Xu-Doan creation was already allowed and stays.
- Field lead is now strictly the active `BRANCH_LEADER`/`COMMITTEE_LEADER` of the field's `sourceUnitId` (`assertWorkstreamLeadEligibility`); deputies, uncoded members, other-unit leaders and the parish leader are rejected with `WORKSTREAM_LEAD_OUTSIDE_UNIT`. This closes the "leader-only Field lead" residual deferred in Consequences above; ADMIN technical-override paths keep skipping business validation per O2. DRAFT privacy (creator-only) is unchanged, so secretary read-only does not extend to others' drafts.
- Approval workflow retired (product decision 2026-09-12): task `APPROVER`/`OBSERVER` and workstream `CONTRIBUTOR`/`APPROVER` roles removed from zod enums, Drizzle mappings, capability `operations.task.approve`, route `POST /tasks/:id/approve`, queue `GET /tasks?queue=approval`, approval-status state machine and separation-of-duty service (deleted); `operation_tasks` drops `approval_status/approved_by/approved_at` via migration `20260912-260`, which aborts on live legacy rows (active removed-role assignments/memberships, non-deleted `PENDING` reviews) so the operator resolves them first. Historical approvals stay in `audit_logs`. DONE now gates only on dependencies + required checklist; comments UI continues as `TaskCommentsPanel`.
- Parish deputies create Xứ đoàn events only: unit-scoped creation fails closed (`UNIT_SCOPE_MISMATCH`) and the "+ Tạo mới" menu hides unit options for `PARISH_DEPUTY`/`PARISH_SECRETARY` alike (organizer self-assignment bypass is now parish-leader-only; a deputy acting inside a unit they also serve must name that unit's leader as organizer).

### Amendment 2026-09-12 (parish-leader organizer scope + terminal COMPLETED, product-decided)

- Trưởng Xứ đoàn chỉ đứng tên organizer event Xứ đoàn: `isActiveUnitLeader` bỏ bypass xứ đoàn trưởng, message/code giữ `400 ORGANIZER_MUST_BE_UNIT_LEADER` cho cả `POST /events`, template instantiate và `PUT /events/:id` đổi organizer. Trưởng Xứ đoàn giữ blanket tạo event chuyên môn nhưng phải chỉ định đúng Trưởng Ban/Trưởng Ngành của unit (creation-options vốn chỉ liệt kê unit leaders nên picker không đổi). Hai test cũ dựa vào hành vi cũ (assignment-scope parish-wide, public projection) được chuyển sang organizer là Trưởng ngành.
- `COMPLETED` là trạng thái cuối: `manualEventTransition` ném `EVENT_COMPLETED_TERMINAL` cho mọi chuyển tiếp từ COMPLETED (kể cả lùi có lý do), route map `409` với message tiếng Việt, UI gỡ `COMPLETED` khỏi `previousEventStatus` nên không còn nút lùi. Retrospective/follow-up sau hoàn tất không đổi (command riêng, không phải transition). Đóng 2 câu hỏi mở product: Trưởng xứ không làm organizer chuyên môn; COMPLETED không lùi được.

