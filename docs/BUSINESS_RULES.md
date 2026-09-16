# BUSINESS RULES - PARISH LMS v2.0

> **Policy supersession — 2026-09-10, được chủ sản phẩm phê duyệt:** Admin có
> quyền quản trị toàn giáo xứ trong mọi môi trường, kể cả production; được tạo/sửa
> nhiệm kỳ cho chính mình. Các mô tả admin production read-only, cấm self-grant
> hoặc override chỉ dev/test bên dưới đã bị thay thế. Biến legacy
> `OPERATIONS_ADMIN_MUTATION_OVERRIDE` không còn giới hạn quyền. Vẫn bắt buộc
> reauth + lý do + audit cho nhiệm kỳ; không bỏ tenant isolation, OCC, idempotency,
> kiểm tra phạm vi dữ liệu, trạng thái đóng việc hoặc separation of duty.

Document Status: **APPROVED**
Last Updated: 2026-08-14

> Consolidated business rules for the core domains (Promotion, Attendance, Reporting).
> Supersedes BDR-001, BDR-002, BDR-003.

---

## 1. PROMOTION

### 1.1 Architectural Classification
**Promotion is a Business Process & Immutable Snapshot**, NOT a traditional mutable aggregate.
- It reads data from multiple projections (`GradeRecord`, `AttendanceRecord`, `SacramentalRecord`, `SemesterLock`).
- It executes domain validation rules (Specifications) and produces an **Immutable Historical Snapshot** in `promotion_records`.

### 1.2 Full Snapshot Schema (`promotion_records`)
Every approved promotion record stores full historical data and rule context:

```typescript
export interface PromotionRecordSnapshot {
  id: string; // Unique ID (e.g. PRM-2026-ST100)
  studentId: string;
  parishId: string;
  academicYear: string; // e.g. "2025-2026"
  targetClassId: string; // Class in current academic year
  nextClassId?: string | null; // Class assigned for next academic year upon PROMOTED/GRADUATED

  // Decisions
  autoDecision: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'CONDITIONALLY_PROMOTED' | 'TRANSFERRED';
  finalDecision: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'CONDITIONALLY_PROMOTED' | 'TRANSFERRED';
  isOverridden: boolean;
  overrideReason?: string | null;

  // Snapshots at Approval Time
  gpaSnapshot: number; // e.g. 8.2
  attendanceSnapshot: number; // e.g. 88.5 (%)
  conductSnapshot?: string | null; // e.g. "Tốt"
  rulesVersion: string; // e.g. "v1.0"

  // Metadata & Audit
  approvedBy: string; // User ID of Admin / Education Leader
  approvedAt: string; // Timestamp
  status: 'ACTIVE' | 'SUPERSEDED'; // Handles re-evaluations
  version: number; // 1, 2, ...
}
```

### 1.3 Rule Versioning & Historical Auditability
- All evaluation logic tags snapshots with `rulesVersion: 'v1.0'`.
- Future changes to thresholds (e.g. GPA requirement changed from 5.0 to 6.0 in 2028) will NOT affect past snapshot evaluations or historical reporting.
- At academic-year finalization, concrete grade weights/rounding, attendance and promotion policies, classification thresholds, date range and class labels are frozen in the same transaction as student snapshots. Historical reports consume frozen effective scores/attendance and source cohort; promotion evaluate/approve/retry consume the finalized metrics and policy. Open years continue to use current settings. Manual promotion decisions still require an override reason when differing from the frozen-policy decision.
- Legacy finalized years without valid policy/cohort/report evidence must not be reconstructed from today's settings or class pointer: affected reporting/promotion paths stop with a historical-evidence conflict until operator reconciliation. Personal profiles, parent ownership, class authorization and soft-delete visibility remain current, not frozen privileges. Fee lists retain persisted original-class fee facts after transfer; synthetic unpaid rows require current open-year membership or an evidenced frozen cohort and are not historical payment facts.

### 1.4 Idempotency & Unique Constraints
- Promotion approval is **100% Idempotent**.
- Unique constraint: `UNIQUE(parish_id, student_id, academic_year, version)`.
- Repeated calls to `approvePromotion(studentId, academicYear)` return the existing active snapshot without duplicating records.

### 1.5 Re-Evaluation & Rollback Policy
- **Pre-requisite**: Grade edits are ONLY possible if Admin unlocks Semester 2.
- If Semester 2 is unlocked → Grade edited → Semester 2 re-locked → Admin re-evaluates Promotion:
  1. The existing active snapshot is marked as `status: 'SUPERSEDED'`.
  2. A new snapshot with `version: version + 1` and `status: 'ACTIVE'` is inserted.
  3. Full audit lineage is preserved.

### 1.6 Pre-Condition Dependency (Semester Lock)
- Promotion evaluation **STRICTLY REQUIRES Semester 2 of the target Academic Year to be LOCKED**.
- If HK2 is `UNLOCKED`: `SemesterLockSpecification` fails → Throws `403 Forbidden: Học kỳ 2 năm học 2025-2026 chưa được khóa sổ điểm. Không thể thực hiện xét duyệt lên lớp.`

### 1.7 Auto Decision vs Manual Override Preservation
- Both `autoDecision` (calculated by `PromotionEligibilitySpecification`) and `finalDecision` (manual choice) are preserved.
- If `autoDecision !== finalDecision`: `isOverridden = true` and `overrideReason` is **MANDATORY**.

### 1.8 Đường duyệt thăng tiến thủ công — SSOT qua `POST /api/promotion/batch-approve` (ADR-052, 2026-08-21)
Panel "Xét Lên Lớp" (`PromotionPanel`) **chỉ hoạt động khi có kết nối máy chủ** và PHẢI đi qua `POST /api/promotion/batch-approve`:
- Server tự đánh giá lại (`PromotionEligibilitySpecification`) — HK2 chưa khóa → item lỗi 403, KHÔNG có ngoại lệ cho client bỏ qua.
- Mỗi item 1 transaction: snapshot `promotion_records` → update `students.classId` và `students.branch`. Lớp nguồn phải là lớp hiện tại của học viên; lớp đích phải active, cùng giáo xứ, thuộc `promotionTargetYearId` của năm nguồn (hoặc năm sau gần nhất khi mapping chưa persist) và phân ngành phải khớp lớp đích. Không thể có snapshot mà mất move hoặc ngược lại.
- `gpa`/`attendanceRate` client gửi BẮT BUỘC lấy từ `GET /api/promotion/evaluate/:studentId` (authoritative); lệch → 409 `DATA_MISMATCH`.
- Move được áp lại cho item `skipped` khi chạy lần 2 (idempotent hội tụ).
- **Completion khác approval (XD-01):** `/promotion/approve` chỉ lưu quyết định, không chứng minh chuyển lớp. Year reconciliation/list/retry/archive chỉ công nhận active/latest record có `completed_at` và `completed_target_year_id` khớp target đã persist. Receipt và audit `COMPLETE_PROMOTION` commit cùng membership move; GRADUATED/TRANSFERRED có thể hoàn tất với no-move tường minh. Thiếu lớp đích cho trường hợp cần chuyển → unresolved/error, archive bị chặn. Receipt lịch sử không bị suy lại từ class pointer hiện tại. Legacy thiếu receipt không tự backfill.
- Không dùng hàng đợi generic `PUT /students/:id` để thăng tiến: khi offline UI phải giữ nguyên dữ liệu và yêu cầu kết nối lại. `PUT /students/:id` chỉ cho correction hồ sơ/membership có lý do audit tường minh, không thay thế promotion snapshot.

---

## 2. ATTENDANCE

### 2.1 Architectural Classification
**Attendance does NOT require a bloated Domain Aggregate.**
- Attendance records are discrete event entries representing student participation per session.
- The module relies on a lean `AttendanceRecord` Domain Object, `AttendanceRateSpecification` (for rate calculations), and `AttendanceApplicationService`.

### 2.2 Business Status Types & Session Boundaries
- **Status Types**:
  - `Present`: Hiện diện (1.0)
  - `AbsentExcused`: Vắng có phép (Configurable weight in `systemSettings`, default 1.0 / excusable)
  - `AbsentUnexcused`: Vắng không phép (0.0)
- **Session Types**:
  - `SundayMass`: Đi Lễ Chúa Nhật
  - `CatechismClass`: Đi học Giáo lý
  - `EucharisticAdoration`: Chầu Thánh Thể / Giờ sinh hoạt đoàn thể (ADR-033 / ADR-034)
- **Boundary Constraint**:
  - Attendance uniqueness is enforced by composite index `UNIQUE(parish_id, student_id, date, type)` (migration `20260803-063`, see ADR-016) — ensures at most ONE attendance entry per student per session type per date, scoped per parish. Legacy DBs pre-ADR-016 retain the old inline `UNIQUE(student_id, date, type)` (SQLite cannot drop it without a destructive rebuild); the composite index enforces the correct multi-tenant key on top of it.

### 2.3 Semester Lock Intersection
- Attendance entries for dates belonging to a locked Semester are **STRICTLY LOCKED**.
- Catechists cannot insert, update, or batch-enter attendance for dates within a locked semester unless Admin unlocks that semester (`SemesterLockSpecification` pre-condition enforced at Application Layer).

### 2.4 Attendance Rate & Aggregation Specification
The attendance percentage formula used by `PromotionEligibilitySpecification` and `attendanceAnalyticsService` is:

$$\text{Attendance Rate (\%)} = \frac{\text{Present} + (\text{AbsentExcused} \times \text{excusedWeight})}{\text{Total Sessions}} \times 100$$

- Default `excusedWeight = 1.0` (read dynamically from `systemSettings.attendancePolicy.excusedWeight`).
- Calculated independently for `SundayMass`, `CatechismClass`, and `EucharisticAdoration` as well as the composite overall rate.
- **Attendance Classification Thresholds**:
  - **Xuất Sắc (`excellent`)**: $\ge 95\%$
  - **Đạt Chuẩn (`good`)**: $\ge \text{minRateThreshold}$ (mặc định $80\%$)
  - **Cần Lưu Ý (`warning`)**: $\ge \text{minRateThreshold} - 10\%$ (hoặc vắng không phép $\ge 3$ buổi)
  - **Nguy Cơ Vắng Nhiều (`critical`)**: $< \text{minRateThreshold} - 10\%$
- **Early Warning Identification**: Tự động cảnh báo học sinh vắng không phép $\ge 2$ buổi theo từng môn hoặc tỷ lệ chung dưới ngưỡng để GLV/Admin liên hệ phụ huynh kịp thời.

### 2.5 Batch Attendance Entry (ADR-008 Compliance)
- Class-wide batch attendance entries (`POST /api/attendance/batch`) follow **ADR-008 Partial-Success Semantics**.
- Processed in chunks of 10-20 students, returning itemized results (`saved`, `skipped`, `error`).
- Mỗi item hợp lệ phải dùng ngày `YYYY-MM-DD` tồn tại thật và commit attendance + audit metadata trong cùng transaction. Lỗi một item không rollback item khác đã commit theo ADR-008; audit tổng hợp batch chỉ là diagnostic, không được biến kết quả item thành thất bại giả.
- Ghi chú điểm danh có thể chứa dữ liệu nhạy cảm và không được sao chép vào `audit_logs`; audit chỉ giữ trạng thái/type/date và ID cần cho truy vết.

---

## 3. REPORTING

### 3.1 Architectural Classification
**Reporting is a Pure CQRS Read Model / Projection Subsystem.**
- 0 DB Mutations (`INSERT`, `UPDATE`, `DELETE` are strictly forbidden).
- 0 Write Aggregates, 0 Domain Events, 0 ACID Write Transactions.
- Pure SQL `SELECT` projections joining `students`, `grades`, `attendance`, `promotion_records`, `classes`, and `academic_years`.
- Authorization, academic-year range and parish policy inputs are resolved by `ReportingApplicationService` through the same database transaction snapshot as all projection queries. Repositories receive this immutable context and must not call application services or global DB state themselves (ADR-104).

### 3.2 Current MVP Report Projections
The Reporting subsystem defines exactly 2 current MVP projections for parish administrators and catechists:

#### Projection 1: Student Report Card Projection (`ReportCardProjection`)
- **Target**: Individual Student Academic & Conduct Certificate / Report Card.
- **Fields**:
  - Student Profile (code, holy name, full name, dob, class).
  - Grade Breakdown per Subject & Semester (Oral, 15m, 1 Period, Midterm, Final, Computed GPA).
  - Attendance Summary (% Mass attendance, % Catechism attendance).
  - Promotion Status (`PROMOTED`, `RETAINED`, etc.).

#### Projection 2: Class Academic & Attendance Summary (`ClassSummaryProjection`)
- **Target**: Class-wide roster report for Catechist / Parish Admin.
- **Fields**:
  - Total Students, Class Average GPA, Class Attendance Rate.
  - Ranked Student Roster with individual GPA, Attendance %, and Promotion Status.

### 3.3 Deferred Candidate — not current MVP

#### Parish Promotion & Attendance Statistics (`ParishSummaryProjection`)
- **Status**: DEFERRED — no server projection, API contract, or acceptance criteria in the current MVP. The R1–R4 roadmap below covers Projections 1–2 only. Client-side KPI aggregates are not this projection. Implementation requires explicit product approval defining users, metrics, year range, pagination, freshness, and acceptance criteria.
- **Target**: Parish Administrator / Pastor high-level academic year report.
- **Fields**:
  - Total Students across all branches (Ấu Nhi, Thiếu Nhi, Nghĩa Sĩ, Hiệp Sĩ).
  - Branch-level promotion distribution (% Promoted, % Retained, % Graduated).
  - Parish-wide attendance health metrics.

### 3.4 Current MVP Micro-Step Roadmap (R1 – R4)
- **R1**: Business Discovery & Architectural Freeze (BDR-003 & ADR-010) [COMPLETED]
- **R2**: Projection Repositories (`ReportCardProjectionRepository`, `ClassSummaryProjectionRepository`)
- **R3**: `ReportingApplicationService` (Orchestrates queries, formatting, pagination)
- **R4**: REST Routes (`GET /api/reports/report-card/:studentId`, `GET /api/reports/class-summary/:classId`) & Integration Tests

---

## 4. ACADEMIC YEAR LIFECYCLE (STATE MACHINE)

### 4.1 Architectural Classification
**Academic Year Lifecycle is an orchestration process** living in `AcademicYearLifecycleService`.
It reuses existing SSOT building blocks (never duplicates logic):
- Semester lock/unlock: `DrizzleSemesterLockRepository` (same rows gating grade edits).
- Snapshot/evaluation/approval: `promotion_records` + `PromotionApplicationService`.
- Grade weights / promotion policy / attendance policy / classification thresholds: `parishSettingsService`.

### 4.2 State Machine
`OPEN → SEMESTER_1_LOCKED → SEMESTER_2_OPEN → SEMESTER_2_LOCKED → FINALIZED → PROMOTED → ARCHIVED`

Status is **derived** (priority order, `deriveAcademicYearStatus`):
1. `PROMOTED` / `ARCHIVED` / `FINALIZED` stored in `academic_years.status` wins.
2. Else: `is_locked=1` → `FINALIZED`.
3. Else: HK2 locked → `SEMESTER_2_LOCKED`.
4. Else: HK1 locked → `SEMESTER_1_LOCKED` (or `SEMESTER_2_OPEN` when `current_semester=2`).
5. Else `OPEN`.

Only admins (or chủ nhiệm via permissions) may transition; all transitions are audit-logged (`audit_logs`).

### 4.3 Semester Transitions
- **Date-keyed attendance (XD-04):** một ngày điểm danh phải qua khóa calendar-year và mọi `academic_years` cùng parish có range chứa ngày đó (kể cả legacy IDs/ranges). `is_locked=1`, FINALIZED/PROMOTED/ARCHIVED hoặc khóa học kỳ tương ứng của bất kỳ range đó đều chặn direct/batch/leave-approved writes trong transaction; không tự chọn một range overlap để bỏ qua khóa. Tạo năm mới chỉ chấp nhận khoảng ngày nằm trong 01/08 năm đầu–31/07 năm sau; năm dạy học ngắn hơn vẫn hợp lệ. Không tự sửa range legacy hoặc dữ liệu lịch sử.
- **Lock HK1** → status `SEMESTER_1_LOCKED`; grade/attendance writes for semester 1 now blocked server-side.
- **Bắt Đầu HK2** (`POST /api/academic-years/:id/start-semester-2`) requires HK1 locked; sets `current_semester=2`.
- **Lock HK2** → status `SEMESTER_2_LOCKED`.

### 4.4 Finalize Year (Chốt Năm Học)
Pre-conditions (403 otherwise, 409 if already locked):
- HK1 **and** HK2 must be locked.
- Completeness checklist must have **no `error`-severity issues** (400 + `details` payload):
  - `STUDENTS_MISSING_HK1_GRADES`, `STUDENTS_MISSING_HK2_GRADES`
  - `STUDENTS_NOT_CLASSIFIED` (thiếu điểm một học kỳ)
  - `CLASS_WITHOUT_HK1_GRADES`, `CLASS_WITHOUT_HK2_GRADES`
  - `ATTENDANCE_SESSIONS_OPEN` (warning only, không chặn)

Action (per active student, `status = 'Đang học'`):
- Compute `semester1Gpa`, `semester2Gpa` (weighted), `yearGpa = round((gpa1 + gpa2)/2, roundingDecimal)`,
  `classification` (thresholds from settings, `getClassificationLabel`), `attendanceRate` (chuyên cần theo policy).
- Evaluate decision via `PromotionApplicationService.evaluateStudent` → upsert **`academic_year_snapshots`** (immutable per finalize; re-finalize after unlock overwrites).
- Set `is_locked=1, status='FINALIZED'` + audit log.
- Toàn bộ pre-condition, checklist, source/policy read, evaluation, snapshot write, year lock và audit phải dùng **cùng một database transaction/executor**. Lỗi query policy/date-range phải rollback và báo lỗi; chỉ row cấu hình vắng hoặc JSON/field cấu hình không hợp lệ mới dùng business default.

### 4.5 Promote Year (Xét Lên Lớp)
Pre-conditions: status must be `FINALIZED` (403); already `PROMOTED` → 409; năm đích phải định dạng `YYYY-YYYY` (400 — AY-F5).
- If next year does not exist → auto-copy (see 4.6).
- Per snapshot: `approvePromotion(...)` with `manualDecision = snapshot.promotionStatus` (lớp mapping by class `code`; class id = `<nextYearId>-<code>`), move student to next-year class.
- **PRM-F4 (2026-08-21)**: học sinh không tìm được lớp cùng `code` ở năm mới (hoặc không có lớp nguồn) → ghi vào `summary.warnings[]` (kèm lý do), KHÔNG chuyển lớp, KHÔNG tính lỗi — năm học vẫn `PROMOTED`, admin tự xử lý thủ công. Trước đây trường hợp này im lặng.
- Snapshot GPA ÁP grade overrides (AYL-F2, 2026-08-21) — khớp `computeAuthoritativeMetrics` lúc verify promote và báo cáo phiếu điểm; HS có override không còn bị 409 `DATA_MISMATCH`.
- Summary: `total`, `attempted`, `movedToNextYear`, `retained` (RETAINED), `graduated` (GRADUATED/TRANSFERRED), `unresolvedCount`, `errors`, `warnings`.
- Partial success per student (ADR-008) được giữ. Khi bắt đầu promote, source year chuyển atomically sang `PROMOTED` và persist `promotion_target_year_id`; từng item sau đó vẫn transaction riêng. Snapshot chưa có active/latest `promotion_record` tạo durable reconciliation worklist, không chỉ tồn tại trong response/modal.
- `POST /api/academic-years/:id/promotion-retry` chỉ retry item unresolved với chính target year đã persist và skip item đã resolve. `GET /api/academic-years/:id/promotion-reconciliation` cho phép UI tải lại worklist sau reload/crash.

### 4.6 Create / Copy Next Academic Year
`POST /api/academic-years/:id/copy` (idempotent; returns existing year with `copiedClasses=0` if present):
- Năm mới bắt buộc định dạng `YYYY-YYYY` (400 nếu sai — AY-F5, 2026-08-21).
- Creates `academic_years` row (`OPEN`, `current_semester=1`, date range from `computeAcademicYearDateRange`).
- Copies **classes** (new ids, same `code`) and **assessments** (new `ASM-` ids, same weights).
- **NEVER copies** grades, attendance, reports, promotion_records, snapshots.

### 4.7 Archive Year (Lưu Trữ)
`POST /api/academic-years/:id/archive` — chỉ hợp lệ khi status = `PROMOTED` (403 nếu chưa xét lên lớp, 409 nếu đã ARCHIVED):
- Archive phải fail closed với 409 và danh sách item nếu promotion reconciliation còn unresolved. Warning “không có lớp đích” vẫn là explicit warning theo quy tắc PRM-F4, không tự động biến thành error.
- Set `status='ARCHIVED'` + audit log. Dữ liệu (điểm, snapshot, promotion_records) được GIỮ để báo cáo lịch sử.
- Năm học đã lưu trữ KHÔNG được chọn làm năm học hiện tại; không còn thao tác khóa/chốt/xét lên lớp.

### 4.8 Onboarding Order Gates (Năm học → Lớp → Học sinh)
Quy trình sử dụng bắt buộc theo thứ tự: **tạo năm học → tạo lớp học → nhập danh sách học sinh**. Server là SSOT enforcement:
- `POST /api/classes/academic-years` (tạo năm học) validate: `id` khớp `YYYY-YYYY`, `startDate`/`endDate` (nếu gửi) `YYYY-MM-DD` hợp lệ và start < end → 400 `ACADEMIC_YEAR_INVALID` (AY-F5, 2026-08-21 — trước đây chấp nhận chuỗi tự do dẫn tới range 2000-2099 làm lệch `getOpenSemester` và bounding chuyên cần).
- `POST /api/classes` trả **409 `ACADEMIC_YEAR_REQUIRED`** nếu giáo xứ chưa có bất kỳ `academic_years` nào ("Vui lòng tạo năm học trước khi tạo lớp học"); trùng `(parish, code, year)` → **409 `CLASS_CODE_EXISTS`**, FK sai → **400 `INVALID_REFERENCE`** (ERR-F6 — trước đây 500).
- `POST /api/students` trả **409 `CLASS_REQUIRED`** nếu giáo xứ chưa có lớp nào (không tính lớp đã soft-delete) ("Vui lòng tạo lớp học trước khi thêm học sinh").
- UI đồng bộ: nút "Thêm Lớp"/"Thêm Thiếu Nhi" được thay bằng nút điều hướng + banner hướng dẫn khi chưa đủ điều kiện; `StudentModal` chặn form khi không có lớp.

### 4.9 Fixed Branches (5 Ngành TNTT Cố Định)
Phân ngành TNTT là **cố định bất biến** gồm đúng 5 ngành: `Chiên Con`, `Ấu Nhi`, `Thiếu Nhi`, `Nghĩa Sĩ`, `Hiệp Sĩ`:
- Client: hằng số `src/constants/branches.ts` (id, tên, màu khăn, độ tuổi) — không có UI tạo/sửa/xóa ngành.
- Server: `studentSchema.branch` là `z.enum` cố định 5 giá trị; bảng `branches` chỉ có `GET /api/classes/branches`, không có route CRUD ngành; seed chỉ ghi 5 ngành mặc định.
- Bất kỳ thay đổi danh sách ngành nào đều phải qua code change + migration, không thể thực hiện từ UI.

---

## 9. PURGE — Xóa Toàn Bộ Dữ Liệu Giáo Xứ (Danger Zone)

### 9.1 Phạm vi
- **Bị xóa (26 bảng nghiệp vụ)**: `password_reset_requests`, `feedback_messages`, `students`, `grades`, `attendance`, `notices`, `academic_years`, `classes`, `catechist_assignments`, `notifications`, `import_batches`, `import_batch_students`, `grade_import_hashes`, `service_assignments`, `mapping_memory`, `grade_overrides`, `outbox_messages`, `semester_locks`, `academic_year_snapshots`, `promotion_records`, `attendance_sessions`, `assessments`, `exam_result_mutations`, `exam_results`, `exam_sessions`, `refresh_tokens`. Receipt phải xóa trước `exam_results/exam_sessions`; ticket reset xóa trước các quan hệ user được giữ. (SSOT: `PURGE_TABLES` — `server/src/services/purgeService.ts`.)
- **Giữ nguyên (8 bảng hệ thống)**: `users`, `branches`, `permissions`, `role_permissions`, `audit_logs`, `push_subscriptions`, `native_push_tokens`, `system_settings` (kể cả `purge_version` được tăng +1).
- Chỉ **DELETE rows** — cấm DROP bảng, cấm xóa function/trigger/schema.

### 9.2 Điều kiện thực hiện (hard gates)
1. Người thực hiện phải là **admin** (403 nếu không).
2. Phải nhập đúng **mật khẩu đăng nhập** của admin (bcrypt; sai → 401 `INVALID_PASSWORD`, KHÔNG xóa gì, không tăng version).
3. Phải gõ chính xác chuỗi xác nhận **`XÓA TẤT CẢ`** (sai → 400 `INVALID_CONFIRM_KEY`).
4. Giới hạn **10 lần/phút/IP** (`purgeRateLimiter`).

### 9.3 An toàn dữ liệu (bắt buộc)
- Trước khi xóa: snapshot v3.1 đủ 26 bảng + SHA256 checksum ghi vào `server/data/backups/safety/purge-safety-<parish>-<ts>.json` (override bằng env `SAFETY_BACKUP_DIR`, xem `docs/07_DATABASE_PLAN.md`).
- Toàn bộ DELETE nằm trong **1 transaction** (FK order con→cha + `PRAGMA defer_foreign_keys`); sau transaction, verify từng bảng về 0 — nếu không, purge coi như FAILED.
- Audit log `SYSTEM_PURGE` ghi counts trước-khi-xóa.
- Sau purge, mọi thiết bị đang đăng nhập phải bị vô hiệu hóa dữ liệu offline (ghost data): device thực hiện tự reset + đăng xuất; các device khác bị chặn ở lần sync kế tiếp qua so sánh `purge_version`.
- **A-NEW-47 (2026-08-13)**: device **mới** (chưa có key `parish_purge_version`) KHÔNG bị reset — chỉ ghi baseline `purge_version` hiện tại (device mới không có dữ liệu offline nào để trở thành ghost data; reset ở đây chỉ đá user khỏi phiên hợp lệ). Chỉ device ĐÃ TỪNG sync có key cũ < server version mới bị reset + đăng xuất.

### 9.4 Trạng thái sau purge
- Không còn năm học/lớp/học sinh/điểm → quy trình vận hành bắt đầu lại từ đầu: **Tạo Năm Học → Khóa HK1 mặc định MỞ (semester_locks đã sạch) → Tạo Lớp hoặc Import Excel (tự tạo lớp) → Nhập điểm / Điểm danh**.

---

## 10. ACCOUNT & PASSWORD POLICY (Auth Lifecycle)

### 10.1 Chính sách mật khẩu (bắt buộc, cả client + server)
Mọi mật khẩu **mới** (đổi mật khẩu, admin đặt lại, user đổi lần đầu) phải thỏa:
1. Ít nhất **8 ký tự**, tối đa 128.
2. Có **chữ HOA** (`A-Z`).
3. Có **chữ số** (`0-9`).
4. Có **ký tự đặc biệt** (`!@#$%^&*()_+-=[]{};:'",.<>?/\|`~\`).

Enforcement:
- **Server (SSOT)**: `z.string().min(8)` + 3 regex trong `server/src/routes/auth.ts` (`strongPassword`, dùng chung cho `changePasswordSchema` và `adminChangePasswordSchema`). Vi phạm → 400.
- **Client (UX, không phải bảo mật)**: `src/utils/passwordValidation.ts` (`validatePassword`) — SettingsPage, UserManagementPage, ForcePasswordChangeModal. Các input mật khẩu bắt buộc dùng `minLength={8}`.

### 10.2 Lifecycle trạng thái tài khoản
- `ACTIVE` → user dùng bình thường.
- `FORCE_PASSWORD_CHANGE` → **bắt buộc đổi mật khẩu lần đầu**; bearer middleware chỉ cho phép đúng `POST /api/auth/change-password`, `PUT /api/auth/profile`, `GET /api/auth/me`, `POST /api/auth/logout`. Refresh dùng cookie/rotation riêng, không mở quyền tài nguyên. Đổi mật khẩu chỉ chuyển sang `ACTIVE` + `mustChangePassword=0` + `tokenVersion++` nếu credential/version/role/status đã kiểm còn khớp lúc ghi; lock/reset/revoke xen giữa → 401, không khôi phục trạng thái cũ.
- `LOCKED` → khóa (thủ công hoặc tự động sau 5 lần sai); chặn login bằng `401 INVALID_CREDENTIALS` chung như tài khoản không tồn tại/sai mật khẩu, không tiết lộ lockout counter; chặn bearer (trừ protected superadmin).
- Ai tạo trạng thái `FORCE_PASSWORD_CHANGE`: **tạo tài khoản mới** (`createUser`), **reset mật khẩu** (`resetUserPassword`), **admin đặt mật khẩu lại** (`admin-change-password` — `status: 'FORCE_PASSWORD_CHANGE'`).
- **Admin trưởng** là principal có đồng thời `id=SUPER_ADMIN_ID`, `parishId=SUPER_ADMIN_PARISH_ID` (mặc định seed parish `gia-ton`) và `role=admin`; production bắt buộc cấu hình ID, chỉ dev/test fallback `USR-001`. Collision ID ở parish khác hoặc role khác không hưởng miễn trừ. Protected principal không bị admin khác reset/reveal/lock/logout (403); tự đổi mật khẩu qua Settings hoặc admin-change-password vẫn cần mật khẩu hiện tại và đúng flow. Tạo **admin mới** qua `POST /api/users` phải re-auth bằng `adminPassword` và rate-limit; không thay đổi quyền tạo admin thành superadmin-only.

### 10.3 Khóa tự động (lockout)
- Sai mật khẩu 5 lần liên tiếp (user không phải admin) → `failedAttempts=5` → `status=LOCKED`. Login sau đó trả `401 INVALID_CREDENTIALS` chung bất kể mật khẩu đúng.
- Reset về `ACTIVE` bởi admin; `failedAttempts` xóa khi đổi mật khẩu thành công.

### 10.4 Hồ sơ cá nhân (`PUT /api/auth/profile`)
- User tự sửa `fullName` + `phone` (không đổi username/role).
- Client sau khi lưu phải cập nhật user trong `useAuthStore.setUser(...)` để phản ánh UI ngay lập tức.

### 10.5 Phiên đăng nhập — refresh token rotation (SSOT: `server/src/services/refreshSessionService.ts`)
- Mỗi login/change-password tạo **1 refresh session** trong `refresh_tokens` (chỉ lưu sha256 hash — không bao giờ lưu plaintext). Token JWT thêm `jti` ngẫu nhiên mỗi lần phát hành (2 login cùng giây không trùng hash).
- `POST /api/auth/refresh` **luôn rotate**: token cũ bị thu hồi (revokedAt + replacedBy), phát hành cặp mới. Token cũ dùng lại → **phát hiện đánh cắp**: `401 SESSION_REUSE_DETECTED`, thu hồi TOÀN BỘ phiên + `tokenVersion++` (giết mọi access token còn sống).
- **Đổi mật khẩu / admin đặt lại mật khẩu / force-logout** → `tokenVersion++` + thu hồi toàn bộ phiên → mọi thiết bị đăng xuất (bất kể có biết mật khẩu cũ).
- **Logout**: client gửi `refreshToken` → chỉ thu hồi phiên đó (multi-device an toàn, không đụng `tokenVersion`); nếu không gửi (cũ) → thu hồi toàn bộ + bump version.
- **`SEED_ADMIN_PASSWORD`** (A-NEW-38, 2026-08-11): chỉ dùng để **tạo admin ban đầu** khi DB trống (`seedIfEmpty` / `npm run db:seed`). **KHÔNG còn reset mật khẩu admin khi server khởi động** — block reset trong `index.ts` đã bị xóa; chạy lại seed trên DB đã có user dùng `onConflictDoNothing` (không ghi đè `passwordHash`). Reset mật khẩu admin chính thức qua admin flow / `POST /api/auth/admin-change-password`.
- **`ALLOW_SEED_ADMIN_RESET`** (A-NEW-38, 2026-08-11): **đã loại bỏ** — biến này không còn được đọc trong code (dùng để gate block reset đã xóa).

### 10.6 Thông báo ứng dụng — Web Push + native FCM/APNs (ADR-022/088/095/111)
- Telegram đã retire. Mỗi smart notification chỉ enqueue `web_push`; `appPushService` fan-out Web Push + native theo **tập userId tenant-scoped được server resolve**. `notifications.target_user_ids` phải được persist và recovery không bao giờ được hạ thành broadcast.
- Mọi queue item mới phải có target array rõ ràng. Target `NULL`, JSON hỏng, rỗng hoặc không còn account `ACTIVE` cùng parish đều fail closed; account còn active nhưng không có endpoint Web/Native khả dụng phải terminal `DELIVERY_TARGET_UNAVAILABLE`, không được tính là đã gửi. Cả targeted send và parish broadcast trực tiếp chỉ dùng binding gắn account `ACTIVE`, chưa soft-delete; Web Push binding legacy không có user không được broadcast.
- **Single-child delivery (H7, 2026-09-05; ADR-111):** queue `report|absence` lưu subject bằng `studentId`; tại mỗi attempt lấy original targets giao với current parent owners ACTIVE, chưa xóa, cùng parish theo canonical phone của trẻ chưa xóa. LOCKED/INACTIVE/FORCE_PASSWORD_CHANGE/deleted hoặc mất ownership không nhận item này; không tự opt-in hoặc retarget sang account khác. Body mới chỉ báo có cập nhật học vụ và yêu cầu đăng nhập Catevia, không chứa tên trẻ/điểm/ngày vắng. Pending cũ thiếu subject/targets bị terminal `failed` với reason riêng, không xóa lịch sử hoặc tự replay sau unlock.
- **Retirement:** migration/startup consume token cũ, revoke link cũ và chuyển Telegram row đang `retrying` thành `failed/CHANNEL_RETIRED`. API cũ trả `410`; không tạo consent/audit mới. Lịch sử delivered/failed và audit cũ được giữ.
- Web dùng VAPID/Service Worker; native tuyệt đối không dùng Service Worker trong WebView (ADR-088), dùng Capacitor Push Notifications. Android token gửi qua FCM, iOS token gửi trực tiếp APNs. Token/endpoint chết bị xóa và không tự kích hoạt retry aggregate; lỗi tạm thời giữ binding và retry. Nếu không provider nào cấu hình, queue `failed` với `PUSH_PROVIDER_NOT_CONFIGURED`; provider chưa cấu hình cho riêng một platform được đếm `skipped`, không giả là đã gửi. Partial failure tạm thời vẫn có thể gửi trùng theo at-least-once và cần delivery ledger nếu sau này muốn exactly-once theo endpoint.
- `native_push_tokens` bind token với UUID installation + authenticated `(parish_id,user_id)`. Đổi tài khoản trên cùng installation chuyển binding sang tài khoản hiện tại; unregister chỉ xóa binding thuộc chính user/parish; soft-delete account xóa cả Web Push và native token. Token không được persist ở client, không được ghi audit/log; audit chỉ giữ platform.
- Native chỉ hỏi quyền khi người dùng chủ động bật tại Cài đặt. Khi đã cấp quyền và không opt-out, app xin token mới ở launch/resume rồi đồng bộ server; logout unregister provider + server. Notification action chỉ điều hướng đường dẫn nội bộ dạng `/...`; URL ngoài app bị loại.

### 10.7 Nhắc Lễ Chủ Nhật tự động — `sundayReminderScheduler` (SSOT: `server/src/services/sundayReminderScheduler.ts`)
- **Explicit parish opt-in**: background reminder chỉ chạy cho row `parish_system_settings` có `sundayReminderEnabled=true`; default `false`. Admin bật/tắt và đặt giờ tại Cài đặt. Client-local reminder không bị cờ background này cấp thêm quyền.
- **Giờ lễ KHÔNG hardcode**: `sundayMassTime` nằm trong parish settings (`GET/PUT /api/settings`, định dạng `HH:MM`, mặc định `08:00`). Server render template qua `getSundayMassTime(parishId)`.
- **Scheduler theo deployment parish (ADR-106 supersede production topology của ADR-105):** mỗi 60s chỉ xét `DEPLOYMENT_PARISH_ID` nếu giáo xứ đó đã opt-in, xử lý **Chúa Nhật** (`getDay() === 0`) trong cửa sổ `[sundayMassTime, sundayMassTime + 120 phút]`. Direct runner parish khác bị từ chối. Dev/test không set deployment scope vẫn enumerate multi-parish để giữ regression isolation/failure containment.
- **Idempotent theo tenant**: marker `sunday_reminder_last_sent` dùng composite `(key, parishId)`; marker cùng ngày của parish khác không ảnh hưởng. Quá cửa sổ 2h thì bỏ qua hôm đó.
- **Audience fail closed**: chỉ enqueue Web/native tới user IDs phụ huynh được resolve trong đúng parish. Không có phụ huynh đích thì không gửi và không fallback sang audience rộng.
- Test: `sundayReminderScheduler.test.ts` cover hai parish/giờ/marker độc lập và failure isolation; `smartNotifications.test.ts` cover no-target + explicit target channels.

### 10.8 Cấp tài khoản phụ huynh hàng loạt — Parent Provisioning (ADR-026)
- **Nguồn dữ liệu**: `students.parentPhone` của học sinh **cùng giáo xứ, chưa soft-delete**. SĐT được chuẩn hóa (`phone.ts`) và phải hợp lệ VN (`^0\d{9}$` sau chuẩn hóa). `'Chưa cập nhật'` (placeholder của import) và SĐT sai định dạng → **bỏ qua** (không tạo tài khoản).
- **Quy tắc 1 tài khoản / 1 SĐT**: anh chị em cùng SĐT → 1 tài khoản chung (hiển thị `childrenCount`). SĐT **đã gắn tài khoản** trong giáo xứ (bất kỳ role nào — kể cả GLV trùng SĐT) → **không tạo mới** (admin xử lý tay nếu cần).
- **Username = SĐT chuẩn hóa**; `username` unique **theo parish** (ADR-046 — `(parish_id, username)`; trước 2026-08-16 là UNIQUE toàn cục) → SĐT trùng username của tài khoản **cùng giáo xứ** bị loại khỏi danh sách cấp phát (cùng SĐT ở giáo xứ khác vẫn hợp lệ).
- **Tài khoản tạo**: `role='phuhuynh'`, `fullName` = `parentName` của học sinh, `phone` = SĐT chuẩn hóa (đảm bảo khớp `parentService`), temp password `Parish@\d{6}` (thỏa §10.1), trạng thái `FORCE_PASSWORD_CHANGE` (§10.2), **KHÔNG gán lớp** (`catechistAssignments` chỉ dành cho `chunhiem`/`phuta`).
- **Vận hành**: admin-only + re-auth mật khẩu admin (chuẩn A06); chạy lại an toàn (idempotent — tài khoản đã có sẽ bỏ qua); audit `PARENT_ACCOUNTS_PROVISIONED` gộp counts, không lưu SĐT (A16).

### 10.9 Tên Thánh & username tự động (ADR-027, 2026-08-12)
- **Tên Thánh** (`users.holy_name`, bắt buộc khi tạo tài khoản `chunhiem`/`phuta`/`admin`): cột mới (migration `20260812-104`), hiển thị dạng "Th. {holyName}" cạnh Họ tên trong danh sách tài khoản.
- **Username tự sinh** khi KHÔNG nhập tay: `chức vụ_Tên thánh + Toàn bộ Họ tên` — bỏ dấu tiếng Việt, nối liền, viết thường, chỉ giữ `[a-z0-9]`. Ví dụ: Tên Thánh "Phê-rô" + "Phan Văn Bảo" (role `phuta`) → `glv_pherophanvanbao`. Prefix theo role: `phuta`→`glv`, `chunhiem`→`cn`, `admin`→`ad`.
- **Phụ huynh KHÔNG dùng cú pháp trên**: username = SĐT chuẩn hóa (quy ước §10.8 / ADR-022).
- **Server là SSOT** (`server/src/utils/username.ts` + `userService.resolveUsername`): username nhập tay (override) luôn thắng; tự sinh chỉ khi thiếu override; thiếu Tên Thánh (role ≠ phuhuynh) → 400 `HOLY_NAME_REQUIRED`; phuhuynh thiếu SĐT → 400 `PHONE_REQUIRED`. Client (`src/utils/username.ts`) chỉ preview realtime — không bao giờ là nguồn quyết định.
- **Trùng username** → 409 `USERNAME_EXISTS`, **không tự append số** — admin nhập override tay. Phạm vi trùng: **trong cùng giáo xứ** (`(parish_id, username)` UNIQUE, ADR-046 — cùng username ở giáo xứ khác hợp lệ). Username không đổi được sau khi tạo.

### 10.10 SĐT tài khoản = identity — chỉ Admin đổi (ADR-039, 2026-08-15)
- **SĐT của phụ huynh là khóa liên kết con** (`users.phone` ↔ `students.parentPhone`, SSOT `CanAccessStudentSpecification`) và **đồng thời là tên đăng nhập** (quy ước §10.8). Phụ huynh **KHÔNG tự đổi SĐT** (chống: mất con âm thầm / nhìn thấy con người khác nếu trùng số PH khác).
- **Endpoint duy nhất sửa SĐT**: `PUT /api/users/:id/phone` — admin-only + **re-auth mật khẩu admin** (chuẩn A05/A06 + rate limit + audit `UPDATE_USER_PHONE`/`UPDATE_USER_PHONE_FAILED`, không ghi SĐT thô — A16). SĐT phải hợp lệ VN (`^0\d{9}$`).
- **Username phụ huynh đồng bộ theo SĐT**: nếu username đang là SĐT cũ (đúng quy ước) → admin đổi SĐT sẽ cập nhật username = SĐT mới (PH đăng nhập bằng số mới); trùng username tài khoản khác → 409, không đổi. Username custom (admin nhập override) KHÔNG bị đổi.
- **GLV/CN tự đổi SĐT** qua `PUT /api/auth/profile` vẫn được phép (SĐT của họ không phải identity liên kết dữ liệu) — format validate `^0\d{9}$`.
- **Profile transaction (H8, 2026-09-05):** chỉ update field được yêu cầu, kiểm current role/status/epoch và commit audit cùng thay đổi. Request chỉ đổi tên không được ghi lại SĐT từ snapshot cũ sau khi admin đã đổi liên kết con.
- **Giao credential mới**: admin giao SĐT mới + mật khẩu tạm (đặt lại qua reset-password) cho phụ huynh qua kênh riêng; UI provision hỗ trợ "Sao Chép Tất Cả Credential" dạng văn bản.
### 10.12 Quên mật khẩu phụ huynh — Hỗ trợ có xác minh (ADR-058, supersedes ADR-042)
- Không được dùng SĐT + tên/ngày sinh của trẻ làm yếu tố tự đặt lại mật khẩu. Đây là KBA từ dữ liệu nhận dạng dễ biết, không chứng minh người yêu cầu đang sở hữu kênh liên lạc.
- `POST /api/auth/parent-reset-password` chỉ là compatibility tombstone: luôn `410 PARENT_SELF_RESET_REMOVED`, không lookup hồ sơ và không đổi credential.
- ADR-087 bổ sung ticket: modal gửi SĐT tới `POST /api/password-reset-requests`; response `202` luôn giống nhau dù tài khoản có/không tồn tại. Ticket không tự đổi credential, không xác minh danh tính và không được coi là bằng chứng sở hữu SĐT.
- Mỗi tài khoản phụ huynh chỉ có một row ticket; gửi lại mở lại cùng row và tăng `request_count`. Chỉ Admin cùng `parish_id` được đọc, bỏ qua hoặc xử lý. Admin bắt buộc xác minh qua kênh tin cậy, xác nhận trong UI và re-auth bằng mật khẩu hiện tại trước khi reset.
- Reset từ ticket phải commit atomic: đổi bcrypt hash, `FORCE_PASSWORD_CHANGE`, `must_change_password=1`, xóa lockout, tăng `tokenVersion`, thu hồi mọi refresh session, đóng ticket và ghi audit. Mật khẩu tạm chỉ trả một lần để Admin giao riêng.
- Hệ thống chỉ lưu bcrypt hash. `users.password_encrypted` bị purge về `NULL`; `reveal-password` luôn `410 PASSWORD_REVEAL_REMOVED`. Nếu mất mật khẩu tạm, phải tạo mật khẩu tạm mới, không xem lại bí mật cũ.

### 10.13 Hai cổng đăng nhập — Phụ Huynh & Giáo Lý Viên/Nhân Sự (ADR-044, 2026-08-16)
- **2 cổng UI, chung 1 backend auth** (chỉ tách giao diện, KHÔNG tách endpoint/session/bảo mật):
  - `/login` — trang chọn cổng (chooser).
  - `/login/phuhuynh` — cổng Phụ Huynh: đăng nhập bằng **SĐT** (username phụ huynh = SĐT chuẩn hóa, quy ước §10.8) + mật khẩu; "Quên mật khẩu?" mở hướng dẫn liên hệ BGL theo ADR-058 (§10.12).
  - `/login/nhan-su` — cổng Giáo Lý Viên / Nhân Sự: đăng nhập bằng **tên đăng nhập** (prefix `glv_`/`cn_`/`ad_`, ADR-027) + mật khẩu; quên mật khẩu → liên hệ Quản Trị Viên / Ban Giáo Lý cấp mật khẩu tạm (admin flow, KHÔNG dùng luồng xác minh con).
- **1 tài khoản = 1 vai trò** (`users.role` enum — không đổi schema): người vừa là GLV vừa là phụ huynh dùng **2 tài khoản riêng** (nhân sự + phụ huynh qua Parent Provisioning ADR-026).

### 10.14 Xóa tài khoản có truy vết (ADR-089, 2026-09-01)
- Chỉ `admin` được gọi `DELETE /api/users/:id`; bắt buộc re-auth bằng mật khẩu hiện tại và rate limit. Admin không được tự xóa, không được xóa Admin trưởng và không được tác động tài khoản ở giáo xứ khác.
- Xóa tài khoản là **soft delete**: đặt `users.deleted_at`, chuyển `status='INACTIVE'`, tăng `tokenVersion`, thu hồi refresh sessions, gỡ `catechist_assignments`, push subscription, legacy Telegram link token, password-reset ticket và gỡ liên kết `parish_people.linked_user_id`. Hồ sơ nhân sự và lịch sử nghiệp vụ/audit vẫn được giữ.
- Tài khoản đã xóa không được đăng nhập, refresh, truy cập bằng access token cũ, xuất hiện trong `/api/users`, danh bạ GLV hoặc danh sách đồng bộ Hồ sơ Xứ đoàn. Username vẫn được giữ để không tái sử dụng nhầm identity lịch sử.
- Audit `DELETE_USER_ACCOUNT` chỉ ghi role/status/token transition, không sao chép họ tên, username, SĐT hoặc credential; xác nhận sai ghi `DELETE_USER_ACCOUNT_FAILED`.
- **Role gate sau login**: đăng nhập cổng Phụ Huynh với tài khoản không phải `phuhuynh` (hoặc ngược lại) → hệ thống **tự logout** phiên vừa tạo + hiện thông báo chỉ đường sang cổng đúng. Không tồn tại session nhầm vai trò.
- **Backend bất biến**: `POST /api/auth/login` duy nhất cho mọi role; lockout/rate-limit/refresh rotation/audit giữ nguyên.
- **Local-storage policy (ADR-045, 2026-08-16)**: `parish_current_user` chỉ chứa **marker không-PII** `{id, role, parishId}` (guard đồng bộ); bản đầy đủ (username/fullName/phone — SĐT PH = username) ở snapshot `parish_auth_user` **mã hóa AES-256-GCM** trong IndexedDB (dexieStorage, tenant-scoped). Snapshot hỏng/thiếu → rebuild qua `GET /auth/me` khi online, offline → logout sạch. Ghi fail-safe: lỗi Dexie/crypto không làm hỏng login. Mọi đường session chết dọn cả marker lẫn snapshot.

---


## 11. RBAC & PHÂN QUYỀN (Permissions)

### 11.1 Quyền theo ROL (code-enforced) — SSOT
Quyền được kiểm tra **trong code** qua `roleMiddleware` + `checkUserClassAccess` (4 vai trò `admin` / `chunhiem` / `phuta` / `phuhuynh`). KHÔNG có bảng permission điều khiển tại runtime.

#### 11.1.1 Frontend route boundary (ADR-072)

`src/constants/routePolicy.ts` là SSOT trình bày/điều hướng phía client; server middleware vẫn là SSOT cấp quyền thật.

| Nhóm route | Vai trò được vào |
| :--- | :--- |
| `/dashboard`, `/notices`, `/calendar`, `/settings`, `/feedback` | mọi role đã xác thực; quyền thao tác `/feedback` phân tách ở backend theo §26 |
| `/students`, `/grades`, `/attendance`, `/reports`, `/leave-requests` | `admin`, `chunhiem`, `phuta` |
| `/parent` | chỉ `phuhuynh` |
| `/users`, `/classes`, `/academic-years`, `/audit-logs`, `/management`, `/finances` | chỉ `admin` |
| `/catechists` | `admin`, `chunhiem`, `phuta`; GLV chỉ đọc danh bạ đã tối thiểu hóa dữ liệu, mọi mutation tài khoản/phân công vẫn chỉ `admin` |

- **UI/API canonical (ADR-090/092, amendment 2026-09-02):** `/students` có một mục `Danh Sách & Lớp`; cấp đầu là lưới lớp, chọn một lớp mới drill-down sang roster. Không còn tab `Lớp Học` riêng; `view=classes` cũ normalize về index kết hợp và `/classes` vẫn admin-only để tương thích deep link. Admin thấy class mutation controls trên thẻ; GLV chỉ đọc. Chỉ staff `admin|chunhiem|phuta` được gọi `GET /api/students` và `GET /api/students/:id`; GLV được xem roster/metadata lớp toàn giáo xứ nhưng không nhận danh sách GLV được phân công cho lớp khác. `phuhuynh` phải nhận 403 ở hai endpoint staff và chỉ đọc con qua `/api/parents/my-children`. Ghi hồ sơ thiếu nhi vẫn chỉ trong lớp được phân công; create/update/delete lớp và assignment vẫn admin-only ở server. Empty incremental response của catalog lớp là no-op merge, không mang nghĩa full replacement.

- Ẩn menu không thay thế route guard. Deep-link sai vai trò phải bị chuyển về `/dashboard` trước khi render workspace.
- Phụ huynh không vào workspace nhân sự; admin/GLV/phụ tá không dùng `/parent` để “xem trước”, vì endpoint `my-children` là parent-only và quan hệ con dựa trên identity phụ huynh.
- Khi thêm route bảo vệ mới, bắt buộc thêm policy, title và tab mapping (nếu có) trong cùng thay đổi; regression `routePolicy.test.ts` khóa role set và mapping.

### 11.2 `permissions` / `role_permissions` — DEPRECATED
Bảng `permissions` và `role_permissions` tồn tại vật lý trong DB (giữ để tương thích purge + tài liệu schema) nhưng **KHÔNG được đọc bởi code nghiệp vụ** tại thời điểm hiện tại — mọi phân quyền phải implement trong middleware/route (SSOT), không dùng `role_permissions` để phân quyền runtime.

**Ngoại lệ duy nhất cho phép GHI (seed-time metadata)**: `server/src/seed.ts` là nơi duy nhất được insert vào 2 bảng này khi tạo DB mới (DB rỗng, chạy 1 lần). Danh sách permission trong seed **chỉ mang tính tài liệu/đối chiếu** — nó phản ánh đúng các quyền đã được enforce trong `roleMiddleware`, KHÔNG tự nó cấp quyền gì. Khi mở rộng `roleMiddleware` cho quyền mới:
- **BẮT BUỘC**: thêm quyền vào `roleMiddleware`/route (đây là SSOT thực thi).
- **Tùy chọn (khuyến nghị)**: thêm dòng tương ứng vào seed.ts để bảng metadata khớp với code — ghi ở đây KHÔNG thay thế việc mở rộng code, chỉ là phản ánh tài liệu.

Quy chiếu: quyền `exam.create`/`exam.delete` cho `phuta`/`chunhiem` (ADR-025) — enforced trong `server/src/routes/exams.ts` (roleMiddleware + checkUserClassAccess), seed.ts chỉ lưu metadata đối chiếu.

### 11.3 Phân công giáo lý viên vào lớp — SSOT là class-centric
- Source of truth = `catechist_assignments` (1 hàng = 1 user × 1 lớp, `roleInClass ∈ {'chunhiem','phuta'}`).
- Các HTTP shape class-centric (`POST|PUT|DELETE /api/classes/:id/assignments`), user-centric (`PUT /api/users/:id/assignments`) và assignment trong create-user đều là adapter tới cùng `classAssignmentPolicy`; không entry path nào được tự nới invariant.
- Chỉ account `chunhiem|phuta` chưa xóa và ở trạng thái `ACTIVE|FORCE_PASSWORD_CHANGE` được gán lớp. Admin/phụ huynh/inactive account và lớp đã xóa đều bị từ chối. `FORCE_PASSWORD_CHANGE` chỉ cho phép cấu hình trước; account chưa có runtime class authority cho tới khi active.
- Quy tắc: một cặp user×lớp chỉ có một vai trò; 1 lớp tối đa 1 chủ nhiệm; 1 user là chủ nhiệm của tối đa 1 lớp. Hai partial UNIQUE index ở DB là backstop cho race; service vẫn trả lỗi domain `ALREADY_HAS_CN|USER_ALREADY_CN`.
- Mỗi replace và audit phải commit trong cùng transaction. User-centric có ngữ nghĩa **replace-toàn-bộ** — chỉ gọi khi có danh sách đầy đủ.

### 11.4 Bộ lọc học kỳ (RBAC semester gating)
- **Học kỳ đang mở** = `academic_years.current_semester` của năm học hoạt động (năm chưa Finalize, đang chứa ngày hiện tại; fallback năm chưa khóa mới nhất). Đây là SSOT duy nhất — do admin điều khiển qua "Bắt Đầu HK2" trong Quản Lý Năm Học.
- **Chỉ `admin`** được chuyển bộ lọc giữa HK1/HK2 (đọc cả hai học kỳ).
- **Tài khoản khác** (`chunhiem`/`phuta`/`phuhuynh`): bộ lọc bị khóa cứng ở học kỳ đang mở — UI không hiện nút chuyển học kỳ (hiển thị tĩnh) và **server bắt buộc**:
  - `GET /api/grades` với user không phải admin **luôn** trả đúng học kỳ đang mở, bất kể query param `semester` gửi lên (param bị bỏ qua).
  - Implementation: `AcademicYearLifecycleService.getOpenSemester(parishId)` (SSOT) + `routes/grades.ts` GET `/`.
- Client: `src/hooks/useSemesterAccess.ts` (`restricted`/`openSemester`/`ready`); `RootLayout` pin `selectedSemester` về học kỳ đang mở cho non-admin; 5 switcher UI (HeaderBar, DesktopGradeMatrix, DesktopDailyGradeEntry, MobileGradeView, MobileReportsView) hiển thị chip tĩnh khi restricted.

### 11.5 Bộ lọc phân ngành & lớp (RBAC class/branch gating)
- **`/students` là ngoại lệ read-only có chủ đích:** `admin`, `chunhiem` và `phuta` đều có thể chọn lớp trong lưới/pill để xem roster toàn giáo xứ. GLV không có controls quản trị roster và không được suy diễn quyền ghi từ filter này.
- **Các module khác:** chỉ `admin` được hiển thị & thao tác bộ lọc phân ngành/lớp trên toàn UI. Điểm danh, điểm, thi và các write route của GLV vẫn dùng `catechist_assignments` làm server-side scope.
- **Client:** `RootLayout` giữ `selectedClassId` của GLV khi pathname là `/students` để click lớp mở đúng danh sách; khi rời route này hoặc với `selectedBranchId`, giá trị non-admin được normalize về `'all'` để không mang filter stale sang module class-scoped.
- UI hidden sites (7): DesktopSidebar (block "Bộ lọc phân ngành & lớp"), HeaderBar (class switcher), MobileTopBar ("Lớp đang xem"), MobileHomeView (chips lớp), MobileStudentsView (chips lớp), MobileGradeView (chips lớp), MobileAttendanceView (select lớp).
- **Phiên chấm bài (ExamSessionView)**: `chunhiem`/`phuta` chỉ tạo/xem/xóa phiên ở **lớp được phân công** (SSOT `catechist_assignments`). `GET /api/classes` có thể trả catalog parish-wide cho roster nhưng với GLV phải bỏ danh tính phân công và gắn `assignedToCurrentUser` chỉ cho assignment của chính tài khoản; client lọc class chips/form tạo phiên bằng marker này. Khi bộ lọc ở chế độ "Tất cả các lớp" (`selectedClassId === null` hoặc `'all'`), client chuẩn hóa thành `null` và tải `GET /api/exams/my-classes`: admin thấy toàn bộ xứ đoàn, GLV chỉ thấy các lớp phân công. Danh sách kèm badge tên lớp trên từng thẻ phiên. Nút "Tạo Phiên Chấm" luôn khả dụng và cung cấp bộ chọn lớp trong form khi đang ở chế độ xem tất cả các lớp. Server `getUserClassIds` vẫn là authority cho mọi read/write; marker client chỉ là fail-closed UX boundary. (A-NEW-48 / ADR-025)
- **Phân công nhân sự lớp:** chỉ admin thay đổi. Toàn bộ lựa chọn chủ nhiệm/phụ tá phải được validate cùng tenant, account active và role nhân sự rồi replace + audit trong một transaction; parent không bao giờ được gán lớp. UI chỉ báo thành công sau acknowledgement của cả lớp và assignment, không được nuốt lỗi từng request.
- **Membership/class lifecycle:** tạo/cập nhật/import học viên phải resolve `students.branch` từ lớp active và từ chối branch không khớp. Sửa `classId`/`branch` qua hồ sơ là correction, bắt buộc `membershipChangeReason` tối thiểu 5 ký tự và ghi audit; promotion phải dùng §1.8. Không được xóa lớp hoặc đổi `branchId`/`academicYearId` khi còn học viên, assignment, điểm danh, kỳ thi, đơn nghỉ, học phí/giao dịch, dấu import điểm hoặc promotion tham chiếu; cần xử lý dependency bằng workflow riêng, không cascade.
- **Chấm ổn định trên điện thoại (ADR-043/048, reassess 2026-08-18)**: Quét QR+OMR tự động là tùy chọn, không phải đường duy nhất để hoàn tất phiên. Với phiên draft, người chấm có thể chọn học sinh từ **đúng danh sách lớp của phiên** rồi: (1) chỉ quét khung OMR, bỏ toàn bộ bước nhận QR; chế độ này **không được tự chấm liên tục** mà phải chờ người dùng căn phiếu rồi bấm `Chụp & chấm`; kết quả lưu source=`omr` và giữ answers để có thể re-score; hoặc (2) nhập điểm trực tiếp 0..`maxScore`, source=`quick_entry`, dùng chung API/offline queue hiện có. Với trắc nghiệm, người chấm **bắt buộc chọn đúng loại mẫu**: `Khung trên đề thi` hoặc `Phiếu trả lời A4`; detector không được fallback chéo giữa hai geometry vì chữ/QR/viền có thể bị hiểu sai thành marker và sinh điểm ảo. Mọi kết quả OMR phải qua marker isolation/scale gate, quadrilateral/aspect gate, paper-surface gate và confidence gate. Marker bị cắt sát mép ảnh hoặc bốn điểm không tạo đúng tỷ lệ mẫu phải fail-closed. **Confidence trắc nghiệm chỉ tính trên các câu có đúng một lựa chọn được nhận diện**, không chia cho các câu bỏ trống. Vì vậy chỉ tô một câu rõ trên đề 10/20/50 câu vẫn là kết quả hợp lệ; điểm vẫn tính trên **tổng số câu**, nên câu trắng tính sai. Phiếu không có câu nào được tô vẫn trả `ALL_BLANK` và **không ghi điểm**; lựa chọn mơ hồ vẫn trả `LOW_CONFIDENCE`; tô nhiều ô trong một câu không được tính là câu trả lời. Chế độ QR tự động còn phải nhận cùng một fingerprint đáp án ở 2 frame liên tiếp trước khi đề xuất điểm. UI phải hiện rõ tên+mã học sinh và điểm cũ trước nút lưu; điểm ngoài khoảng bị chặn; lưu lại cùng học sinh là upsert có cảnh báo; modal chỉ báo thành công/đóng sau khi `saveScores` xác nhận đã nhận thao tác. Luồng nhập trực tiếp phải hoạt động không cần camera, QR hay mạng tức thời (offline queue), bảo đảm luôn có đường chấm khả dụng trên điện thoại.
- **Tạo phiên chấm — quy tắc dữ liệu (EXAM-GAPS 2026-08-15; EXAM-AUDIT 2026-08-21)**: (1) Phiên trắc nghiệm **bắt buộc** có `questionCount` (1–50) + đáp án đủ cho toàn bộ câu hỏi — thiếu đáp án → OMR không chấm được câu đó; server validate format `answerKey` (JSON, key 1..N, giá trị A/B/C/D); (2) `academicYear` mặc định = **năm học đang hoạt động của giáo xứ** (server tự resolve qua `getActiveAcademicYearId`: năm có range ngày chứa hôm nay → fallback năm mới nhất → quy ước tháng 8 — EXAM-AUDIT F4); `academicYear` client gửi phải định dạng `YYYY-YYYY` → 400 ngay tại create (F3); (3) Tạo phiên trùng (draft cùng lớp + môn + loại điểm cùng học kỳ) → UI **cảnh báo xác nhận**, vẫn cho phép tạo (re-exam hợp lệ) — không chặn cứng; (4) Hoàn tất phiên khi còn học sinh chưa có điểm → UI cảnh báo danh sách/đếm trước khi đóng phiên; (5) Quét lại / nhập lại điểm 1 học sinh trong phiên draft = ghi đè kết quả cũ (UI hiện cảnh báo nếu khác điểm); (6) **Re-finalize đồng bộ ledger** (F2): sau reopen → xóa kết quả → complete lại, entry `assessment_entries` của học sinh bị xóa kết quả phải rời khỏi trung bình daily_avg — điểm của học sinh đó giữ nguyên giá trị last-finalized (không tự đè dữ liệu trước kỳ thi, khớp semantics midterm/final); (7) `GET /api/exams/my-classes` chỉ cho admin/chunhiem/phuta; GLV chưa phân công lớp nào nhận danh sách rỗng, không bao giờ thấy toàn bộ phiên giáo xứ (F1).
- **Re-score khi sửa answer key (ADR-043 2026-08-15)**: (1) Chỉ áp dụng cho phiên **draft** trắc nghiệm; (2) `PATCH /api/exams/:id/answer-key` cập nhật answer key + chấm lại điểm cho tất cả kết quả có source `qr_scan`/`omr` — kết quả `quick_entry` (nhập tay) **giữ nguyên**; (3) Điểm mới = `correctCount / totalQuestions × maxScore` (làm tròn 1 số thập phân, clamp ≤ maxScore) — câu bỏ trống = sai (không đếm vào correctCount nhưng vẫn nằm trong mẫu số); đồng nhất với frontend `omr.ts:275`; (4) UI hiển button "Chấm Lại Điểm" trong Answer Key Viewer modal, kèm confirm dialog trước khi thực hiện; (5) Kết quả hiển số kết quả đã chấm lại + số kết quả giữ nguyên.

## 12. ĐIỂM SỐ — NHẬP ĐIỂM HẰNG NGÀY (Daily Entry Scope)

### 12.1 Phạm vi Nhập Điểm Hằng Ngày (server: `dailyEntryService` + `gradeService`; client: `dailyGradeStore` + `DailyScoreType`)
- Nhập Điểm Hằng Ngày chỉ áp dụng cho **3 loại điểm nhập nhiều lần**: Điểm Miệng (`oral`), Điểm 15 Phút (`15m`), Điểm 1 Tiết (`1period`). Mỗi lần nhập = 1 `DailyGradeEntry`; điểm cột = **trung bình** các lần nhập (`_source: 'daily_avg'`, làm tròn 1 số thập phân). `getAverageForStudent` là preview từ ledger mà thiết bị đang biết, không thay thế server authority.
- **Hai nguồn vào, một trung bình**: mỗi cột daily nhận attempts từ (1) nhập tay (`manual_entry` trong sổ `assessment_entries`) và (2) bài thi máy cùng `scoreType` (`exam_finalization` trong cùng sổ). Điểm cột = trung bình **toàn bộ** attempts trong sổ theo `(student, academicYear, semester, scoreType)`, làm tròn 1 số thập phân. Server tính authoritative trong transaction của add/delete manual entry và Exam finalize; client chỉ enqueue ledger và preview, không ghi Grade lần hai. Payload `daily_avg` của client cũ được server tính lại từ ledger; thiếu ledger mà gửi giá trị thì từ chối, không đoán dữ liệu. `legacy_baseline` chỉ dựng khi sổ hoàn toàn trống và Grade đang có daily_avg cũ; giữ baseline đã có, không backfill lại điểm lịch sử tự động. Undo Import không được hoàn tác projection daily như một lần nhập Excel độc lập với ledger.
- **Giữa Kỳ (`midterm`) & Cuối Kỳ (`final`) KHÔNG qua daily entry**: mỗi học kỳ chỉ có 1 điểm duy nhất cho mỗi loại, nhập trực tiếp qua Ma Trận/Thẻ Điểm (manual) hoặc Import Excel (`excel_import`). UI daily entry không hiển thị tab Giữa Kỳ/Cuối Kỳ; store chặn ở type-level (`DailyScoreType`).
- **Dữ liệu cũ**: daily entry loại `midterm`/`final` có trước quy tắc này (nếu còn trong Dexie) ngừng ảnh hưởng tới `syncAllToGradeStore`; giá trị đã sync vào `GradeRecord` giữ nguyên theo source cũ.

### 12.2 Nguồn điểm & xung đột (SSOT server: `gradeService.upsertGrade`; client chỉ preview)
- `manual` và `override` là nguồn cao nhất: `daily_avg` **không bao giờ ghi đè** field đang có `_source: 'manual'` hoặc `'override'` — chỉ khi `_source` là `daily_avg`/`excel_import`/null thì TB hằng ngày mới được áp dụng.
- Ghi đè điểm đã nhập tay phải đi qua luồng Override chính thức (audit `grade_overrides` + lý do), không ghi đè trực tiếp.



### 12.3 Khôi phục (undo) đợt nhập điểm — ADR-028 (2026-08-12)
- **Phạm vi**: chỉ undo **đợt import điểm** (Excel/dán bảng), không undo nhập tay từng ô. Client lưu marker đợt nhập gần nhất đã mã hóa trong Dexie, scope đúng `parishId:userId`, và hiện nút "Hoàn Tác Đợt Nhập Trước" khi còn hạn. Key plaintext/unscoped legacy bị xóa, không migrate sang tài khoản hiện tại.
- **Cửa sổ thời gian**: **7 ngày** kể từ lần ghi điểm gần nhất của từng bảng điểm (`UNDO_GRADE_WINDOW_DAYS`). Hết hạn → từ chối với status `expired`.
- **Quyền**: `admin` (toàn giáo xứ) và `chunhiem` (chỉ lớp được bổ nhiệm — `checkAcademicWriteAccess` kiểm current actor/assignment trong cùng transaction, ADR-016 S24 và H3 amendment 2026-09-05). Request-originated undo đối chiếu epoch khi token có version; list scope chụp trước transaction không thay thế current authority. Học kỳ đã khóa sổ → không undo được (status `locked`).
- **Cơ chế** (audit-as-SSOT): với mỗi bảng điểm trong đợt, lấy audit entry mới nhất (`entityType='grade'`):
  - `CREATE` → xóa bảng điểm mới tạo (kèm `grade_overrides`).
  - `UPDATE` → khôi phục các cột về `oldValue` (trạng thái trước import), version +1.
  - Entry mới nhất KHÔNG phải CREATE/UPDATE (VD: đã undo trước đó, hoặc thao tác khác) → **từ chối** (`not-clean`): không được phép undo 2 lần, không mất sửa tay sau import.
- **Audit**: mỗi bảng điểm được undo ghi 1 dòng `GRADE_UNDO` vào nhật ký hệ thống (trạng thái trước/sau); policy version tại thời điểm undo phải được đọc bằng cùng transaction executor với mutation. Quy tắc executor này cũng áp dụng cho base grade upsert và explicit override/restore (ADR-104).
- **Offline**: undo cần kết nối mạng (thao tác server-side); sau undo client refetch lại điểm từ server.

### 12.4 Phân Quyền Điều Chỉnh Hệ Số & Ghi Đè Điểm (Mobile vs Desktop RBAC - ADR-075)
- **Cấu hình hệ số điểm (`GradeFormulaConfigModal`)**:
  - Độc quyền cho vai trò **Admin** (`isAdmin = can('admin')`).
  - Chỉ xuất hiện và thao tác trên giao diện **Desktop** (`DesktopGradeMatrix.tsx`). Hoàn toàn không hiển thị trên Mobile.
- **Chế độ ghi đè điểm (`isOverrideModeEnabled`)**:
  - Độc quyền cho vai trò **Admin** (`isAdmin = can('admin')`).
  - Chỉ xuất hiện và thao tác trên giao diện **Desktop** (`DesktopGradeMatrix.tsx`). Hoàn toàn không hiển thị trên Mobile.
- **Quy tắc nhập điểm trên Ma trận Desktop (`DesktopGradeMatrix.tsx`)**:
  - Giáo lý viên chủ nhiệm (`chunhiem`): Chỉ được phép nhập/chỉnh sửa điểm Miệng (`scoreOral`) và điểm Đạo Đức (`scoreDaoDuc`).
  - Các cột điểm khác (15 Phút, 1 Tiết, Giữa Kỳ, Cuối Kỳ): Bị khóa đối với giáo lý viên (được tính toán từ điểm hằng ngày hoặc nạp qua phiên chấm thi / Import Excel). Chỉ Admin khi bật "Chế độ điều chỉnh" mới có thể ghi đè trực tiếp trên ma trận.
- **Giao diện Bảng điểm Mobile (`MobileGradeBoard.tsx`, `MobileGradeMatrix.tsx`)**:
  - Đóng vai trò là bảng tra cứu, xem điểm tổng quan (read-only), thu mở thẻ (`Thu` / `Mở`), xem phiếu điểm cá nhân chi tiết và Xuất / Nhập Excel.
  - Giáo lý viên thực hiện nhập điểm quá trình thông qua tab **Nhập Hằng Ngày** (`MobileDailyGradeEntry.tsx`) hoặc quét bài kiểm tra qua **Chấm Điểm** (`ExamSessionView.tsx`).

## 16. UI CHUẨN — KÍCH THƯỚC CHỮ TRONG BẢNG (A-NEW-49)

- **SSOT chuẩn**: bảng danh sách thiếu nhi `src/components/desktop/DesktopStudentList.tsx`.
- **Quy ước**: header bảng (`<th>`) = `text-xs`; cell dữ liệu (`<td>`) = `text-sm`; tên chính (cột nhận diện — Họ Tên / Tên Lớp / fullName) = `text-base`; badge/tag nhỏ = `text-xs`.
- **Cấm** `text-[10px]` / `text-[11px]` / `text-lg` trong cell dữ liệu — chỉ dùng cho chú thích phụ ngoài bảng (legend) và badge.
- **Đã đồng bộ (2026-08-13)**: DesktopClasses, DesktopNotices, DesktopAttendanceGrid, DesktopDailyGradeEntry, DesktopGradeComparison, DesktopGradeMatrix (header 10px→xs), UserManagementPage, ExamResultsTable, QuickScoreEntry.
- Bảng preview import (ExcelImportModal / ExcelGradeImportModal) và phiếu in (StudentReportModal) giữ nguyên — modal chuyên dụng.



### 14. Nhật Ký Hoạt Động & Đồng Bộ Tức Thì (AUDIT-SYNC-01)
- Mọi thao tác ghi dữ liệu đang hỗ trợ (Điểm số, Điểm danh, Thiếu nhi, Lớp học, Kỳ thi, Tài khoản, Cấu hình hệ thống, Đăng nhập) BẮT BUỘC phải được ghi nhận vào bảng `audit_logs` trên máy chủ; audit Telegram lịch sử vẫn được hiển thị nhưng không phát sinh mới.
- Với mutation nghiệp vụ bắt buộc truy vết, domain row và audit metadata phải commit/rollback cùng nhau. Web/Native Push là side effect sau commit hoặc durable handoff cùng transaction theo từng domain; lỗi delivery không được khiến client tưởng mutation chưa commit. Audit không sao chép nội dung thông báo, lý do/người duyệt đơn nghỉ hoặc ghi chú điểm danh.
- Mọi store phía client (`gradeStore`, `attendanceStore`, `studentStore`, v.v.) sau khi ghi hàng đợi Dexie BẮT BUỘC phải gọi `triggerSyncFlow()` ngay lập tức để chuyển dữ liệu lên máy chủ và hiển thị tức thời trong Nhật Ký Hoạt Động.
- **Trang Nhật Ký Hệ Thống (`/audit-logs`, admin-only)** có 2 tab (2026-08-17, gộp từ trang `/policy-dashboard`): (1) **Toàn Bộ Nhật Ký** — toàn bộ `audit_logs` với filter action/entity + diff raw; (2) **Chính Sách & Tác Động** — subset policy (ADR-047) qua `/api/audit-logs/policy-history`: KPI 4 loại (Cập nhật chính sách / Ghi đè điểm / Xét lên / Khóa sổ điểm), filter theo loại, timeline enriched tên học sinh + tác động GPA (policy version traceability).

### 14.1 Delta Sync Snapshot (ADR-094)

- Cursor đồng bộ phải scope theo `parish_id + user_id`, lấy mốc thời gian từ `GET /api/sync/watermark`, không lấy `Date.now()` của thiết bị làm authority.
- Pull tăng dần chỉ hợp lệ khi mọi trang và mọi store thành công. Có một lỗi mạng/parse/apply thì giữ nguyên cursor cũ để retry; không được đánh dấu đồng bộ thành công từng phần.
- Student/class delta dùng cửa sổ đóng `updatedAfter..updatedBefore`, thứ tự ổn định `(updated_at,id)` và phải truyền tombstone xóa mềm để client loại record. Full pull dùng khi chưa có cursor hoặc phát hiện cache nền rỗng/không còn là delta base hợp lệ.
- Web Locks chỉ điều phối nhiều tab cùng origin. Khi trình duyệt không hỗ trợ thì dùng lease localStorage có hạn; mọi thiết bị vẫn phải dựa vào idempotency, version/OCC và transaction của server để bảo vệ dữ liệu.

## 17. QUẢN LÝ ĐƠN XIN PHÉP NGHỈ ONLINE & ĐỒNG BỘ CHUYÊN CẦN (ADR-033)

### 17.1 Các loại buổi sinh hoạt được xin phép (`attendance.type` & `leave_requests.session_types`)
Hệ thống hỗ trợ xin phép nghỉ cho 3 loại buổi chính thức trong xứ đoàn:
1. **`SundayMass`** (Thánh Lễ Chúa Nhật)
2. **`CatechismClass`** (Giờ Học Giáo Lý)
3. **`EucharisticAdoration`** (Giờ Chầu Thánh Thể / Sinh Hoạt Xứ Đoàn)

### 17.2 Phân quyền & Phạm vi truy cập (Authorization Scoping)
- **Phụ huynh (`phuhuynh`)**:
  - Chỉ được tạo đơn và xem lịch sử đơn xin nghỉ cho các con được liên kết qua số điện thoại (`students.parent_phone = user.phone`).
  - Được phép hủy đơn khi đơn còn ở trạng thái `PENDING`. Không được quyền duyệt/từ chối đơn.
- **Giáo lý viên Chủ nhiệm & Phụ tá (`chunhiem`, `phuta`)**:
  - Xem danh sách và duyệt/từ chối đơn của các thiếu nhi thuộc lớp mình được phân công phụ trách (`catechist_assignments` / `getUserClassIds`).
  - Không thể duyệt đơn của học sinh ngoài lớp được giao quản lý (403 Forbidden).
- **Ban Quản Trị (`admin`)**:
  - Toàn quyền xem, duyệt, từ chối hoặc hủy đơn trong toàn bộ giáo xứ (`parish_id`).

### 17.3 Cơ chế Tự Động Đồng Bộ Điểm Danh khi Duyệt Đơn (Auto-Sync to Attendance)
- Review phải resolve thiếu nhi chưa xóa và lớp **hiện hành** trong transaction; không dùng lớp lịch sử trên đơn làm quyền ghi sau transfer. APPROVED phải qua semester-lock theo ngày đơn (kể cả admin); khóa → 403 và đơn vẫn PENDING. Update attendance tăng version để offline writer cũ nhận conflict. Review state CAS + attendance + audit commit cùng nhau; REJECTED không ghi attendance nên không bị semester-lock chặn.
- Khi GLV hoặc Admin chấp thuận đơn (`status = 'APPROVED'`):
  - Hệ thống tự động thực hiện thao tác upsert vào bảng `attendance` cho **tất cả các buổi** (`session_types`) được chọn trong ngày đó của thiếu nhi.
  - Trạng thái điểm danh được ghi: **`AbsentExcused`** (Vắng có phép).
  - Ghi chú điểm danh: **`[Đơn online] <lý do xin nghỉ của phụ huynh>`**.
  - Người cập nhật: ID của GLV/Admin đã duyệt đơn.
  - Bảng điểm danh (`DesktopAttendanceGrid`, `MobileAttendanceView`) sẽ tự động hiển thị badge **"Có phép online"** bên cạnh tên thiếu nhi.
- Nếu đơn bị từ chối (`status = 'REJECTED'`), không thay đổi dữ liệu điểm danh và thông báo phản hồi được gửi tới phụ huynh.

### 17.4 Thông báo Phản Hồi (App Push & Audit Log)
- Mọi thao tác Nộp đơn (`CREATE_LEAVE_REQUEST`), Duyệt/Từ chối (`REVIEW_LEAVE_REQUEST`), và Hủy đơn (`CANCEL_LEAVE_REQUEST`) đều được lưu vết đầy đủ trong `audit_logs`.
- Sau khi review commit, hệ thống enqueue Web/Native Push chung tới đúng tài khoản phụ huynh hiện còn sở hữu thiếu nhi. Worker kiểm lại cùng parish, tài khoản ACTIVE/chưa xóa và quan hệ số điện thoại trước khi gửi; mất quyền thì fail closed. Body ngoài ứng dụng không chứa lý do, review note hoặc thông tin riêng của trẻ.

## 18. QUY TẮC PHÂN CẤP VÀ SẮP XẾP LỚP HỌC (CLASS HIERARCHY SORTING - ADR-036)

### 18.1 Phân cấp Cấp bậc Ngành & Khối Lớp (3-Tier Sorting Rule)
Khi người dùng kích hoạt sắp xếp danh sách học sinh hoặc lớp học từ **Thấp đến Cao** (`asc`) hoặc **Cao đến Thấp** (`desc`), thứ tự được giải quyết theo 3 cấp độ:
1. **Cấp 1 — Trọng số Ngành sinh hoạt (`Branch Priority`)**:
   - `ChienCon` (Chiên Con / 4-6 tuổi): Trọng số 1
   - `AuNhi` (Ấu Nhi / 7-9 tuổi): Trọng số 2
   - `ThieuNhi` (Thiếu Nhi / 10-12 tuổi): Trọng số 3
   - `NghiaSi` (Nghĩa Sĩ / 13-15 tuổi): Trọng số 4
   - `HiepSi` (Hiệp Sĩ / 16-18 tuổi): Trọng số 5
2. **Cấp 2 — Số Khối lớp (`Grade Number`)**:
   - So sánh số tự nhiên: Lớp 1 < Lớp 2 < Lớp 3.
3. **Cấp 3 — Hậu tố phân ban / tổ đội (`Section Suffix`)**:
   - So sánh thứ tự chữ cái Alphabet: `A` < `B` < `C` < `D`.

### 18.2 Chuẩn hóa và Nhận diện Chuỗi Tên Lớp (`classSort.ts`)
- Bộ phân tích `parseClassHierarchy` tự động nhận diện từ nhiều định dạng tên khác nhau (ví dụ: `Ấu Nhi 1A`, `Au 1B`, `1A`, `Thiếu 2C`, `TN2`, `Hiệp Sĩ 2B`, `Chiên Con 1`).
- Các trang được trang bị nút sắp xếp:
  - Danh Sách Thiếu Nhi Desktop (`DesktopStudentList`) & Mobile (`MobileStudentsView`).
  - Quản Lý Lớp Học (`DesktopClasses`).
  - Bảng Tổng Hợp Chuyên Cần (`DesktopAttendanceSummary`).
  - Dropdown chọn lớp in ấn báo cáo (`PrintReportModal`).

## 19. QUY CHẾ LỊCH PHỤNG VỤ CÔNG GIÁO & SỰ KIỆN XỨ ĐOÀN (CATHOLIC LITURGICAL CALENDAR - ADR-037)

### 19.1 Nguồn Thẩm Quyền Phụng Vụ (Canonical SSOT)
Hệ thống sử dụng các quy chuẩn chính thống của Giáo hội Công giáo Việt Nam và Tòa Thánh:
1. **Ủy Ban Phụng Tự — Hội Đồng Giám Mục Việt Nam (`hdgmvietnam.com`)**: Quy chế Năm Phụng Vụ và Lịch Riêng Giáo Hội Việt Nam.
2. **Nhóm Phiên Dịch Các Giờ Kinh Phụng Vụ (`ktcgkpv.org`)**: Chu kỳ Lời Chúa Năm A/B/C và Năm I/II.
3. **Quy chế Tổng Quát Sách Lễ Rôma (*IGMR*) & Bảng Thứ Bậc Ưu Tiên (*Table of Liturgical Days*)**: Giải quyết trường hợp trùng lễ.

### 19.2 Mùa Phụng Vụ & Màu Sắc Áo Lễ
- **Mùa Phụng Vụ**:
  - `Mùa Vọng` (`ADVENT`): 4 Chúa Nhật trước Giáng Sinh (Màu Tím / Hồng ngày CN III Gaudete).
  - `Mùa Giáng Sinh` (`CHRISTMAS`): Từ Đêm Giáng Sinh 24/12 đến Lễ Chúa Giêsu Chịu Phép Rửa (Màu Trắng).
  - `Mùa Chay` (`LENT`): Từ Thứ Tư Lễ Tro đến Thứ Năm Tuần Thánh (Màu Tím / Hồng ngày CN IV Laetare, Đỏ ngày CN Lễ Lá).
  - `Tam Nhật Vượt Qua` (`EASTER_TRIDUUM`): Chiều Thứ Năm Tuần Thánh đến Chúa Nhật Phục Sinh (Màu Trắng / Đỏ Thứ Sáu Tuần Thánh).
  - `Mùa Phục Sinh` (`EASTER`): Từ Chúa Nhật Phục Sinh đến Đại Lễ Chúa Thánh Thần Hiện Xuống (50 ngày - Màu Trắng / Đỏ Hiện Xuống).
  - `Mùa Thường Niên` (`ORDINARY_TIME`): 33 hoặc 34 tuần trong năm (Màu Xanh Lá / Trắng ngày Lễ Trọng).
- **Màu Áo Lễ**:
  - ⚪ **Trắng / Vàng kim**: Lễ Chúa, Đức Mẹ, Thiên Thần, Các Thánh không Tử đạo.
  - 🔴 **Đỏ**: Lễ Chúa Thánh Thần, Lễ Thương Khó, Các Thánh Tử Đạo.
  - 🟢 **Xanh Lá**: Mùa Thường Niên.
  - 🟣 **Tím**: Mùa Vọng, Mùa Chay, Cầu Hồn.
  - 🌸 **Hồng**: Chúa Nhật III Mùa Vọng (*Gaudete*), Chúa Nhật IV Mùa Chay (*Laetare*).

### 19.3 Tích Hợp Hệ Thống
1. **Engine Cục Bộ 100% Offline (`src/utils/liturgicalEngine.ts`)**: Tính toán vĩnh cửu không cần internet, sử dụng thuật toán Meeus Computus cho Lễ Phục Sinh.
2. **Dashboard Widget (`LiturgicalTodayWidget` & `MobileLiturgicalWidget`)**: Hiển thị tên Lễ, bậc lễ, màu áo lễ và câu Lời Chúa tâm niệm trong ngày.
3. **Trang Lịch Toàn Diện (`/calendar`)**: Lưới lịch tháng/tuần, chấm màu phụng vụ, chi tiết phụng vụ và bản chiếu sự kiện Xứ đoàn ở chế độ chỉ đọc:
   - **Một nơi ghi duy nhất**: tạo/sửa/hủy sự kiện tại `/operations`. DesktopCalendarView và MobileCalendarView chỉ tải/hiển thị; `POST|PUT|DELETE /api/parish-events` luôn trả `405 CALENDAR_READ_ONLY`, kể cả với admin.
   - **Công khai có chủ đích**: event Operations `PUBLIC_SUMMARY` tự tạo/cập nhật một row `parish_events` trong cùng transaction; event `INTERNAL` không có bản chiếu và không xuất hiện trên Lịch. Chuyển về nội bộ hoặc hủy event sẽ soft-delete bản chiếu.
   - **Tối thiểu dữ liệu**: Lịch chỉ mang metadata công khai cần hiển thị/xuất lịch (tên, ngày, giờ, loại, địa điểm); không mang task, assignee, comment, readiness, hậu kiểm hay audit. Khi công khai lần đầu, server ghi durable Web/Native Push cho đúng tập phụ huynh ACTIVE trong cùng giáo xứ; nội dung chỉ dùng metadata công khai.
   - **Đọc khi mất mạng**: Lịch phụng vụ tính cục bộ vẫn hoạt động 100% offline. Bản chiếu Xứ đoàn đã tải thành công được cache mã hóa trong Dexie theo đúng `parishId:userId` để xem và xuất `.ics`; cache không phải nguồn dữ liệu chuẩn và không có mutation API.
4. **Bộ Chọn Ngày Điểm Danh (`DesktopAttendanceGrid`, `MobileAttendanceView`)**: Tự động hiển thị huy hiệu ngày lễ phụng vụ tương ứng với ngày được chọn.

### 19.4 Chuẩn Xuất & Đồng Bộ Lịch iCalendar RFC 5545 (ADR-038)
Hệ thống hỗ trợ xuất và đồng bộ hai chiều Lịch Phụng Vụ & Lịch Xứ Đoàn:
1. **Chuẩn iCalendar RFC 5545 (`src/utils/icalGenerator.ts`)**:
   - Xuất file `.ics` tương thích tiêu chuẩn quốc tế cho **Apple Calendar** (iOS, iPadOS, macOS), **Google Calendar** (Android, Web), và **Microsoft Outlook**.
   - Hỗ trợ đầy đủ các trường: `UID`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `LOCATION`, `CATEGORIES`, `STATUS`, `TRANSP`.
   - Tự động nhúng chi tiết: Mùa Phụng vụ, Bậc lễ, Màu áo lễ, Lễ Buộc, Trích dẫn Phúc Âm và Câu Lời Chúa tâm niệm trong ngày.
2. **Tích hợp Nhanh Google Calendar Web**:
   - Cung cấp nút 1-chạm tạo sự kiện Google Calendar trực tiếp qua URL query parameters (`https://calendar.google.com/calendar/render?...`).
3. **Phạm vi Xuất Linh Hoạt**:
   - Cả năm dương lịch (365 ngày + Sự kiện xứ đoàn).
   - Tháng hiện tại.
   - Chỉ các ngày Lễ Trọng & Lễ Buộc.

## 20. QUY CHẾ PHÂN TÍCH CHUYÊN CẦN TRÊN PHIẾU ĐIỂM THIẾU NHI (ATTENDANCE BREAKDOWN - ADR-038)

### 20.1 Phân Loại 3 Cột Trụ Chuyên Cần & Sinh Hoạt
Phiếu điểm cá nhân và phiếu điểm hàng loạt bắt buộc phải phân tách minh bạch thành 3 nhóm dữ liệu:
1. **Thánh Lễ Chúa Nhật (`SundayMass`)**:
   - Số buổi tham dự có mặt (hoặc có phép có trọng số).
   - Số buổi vắng.
   - Tổng số buổi lễ trong niên học.
2. **Giờ Học Giáo Lý (`CatechismClass`)**:
   - Số buổi đi học / Số buổi vắng / Tổng số buổi học giáo lý.
3. **Chầu Thánh Thể & Sinh Hoạt Xứ Đoàn (`EucharisticAdoration`)**:
   - Số buổi tham dự chầu & sinh hoạt / Số buổi vắng / Tổng số buổi.

### 20.2 Tính Toán Tỷ Lệ & Trình Bày
- **Tỷ Lệ Chuyên Cần Tổng Thể (%)**:
  $$\text{Tỷ lệ (\%)} = \text{round}\left(\frac{\text{Tổng buổi có mặt (kèm hệ số có phép)}}{\text{Tổng số buổi diễn ra}} \times 100\right)$$
- **Đồng Bộ Hiển Thị**:
  - Giao diện xem trực tiếp (`StudentReportModal.tsx`): 3 thẻ trạng thái màu sắc trực quan (Thánh Lễ xanh dương, Giáo Lý xanh lá, Chầu & Sinh Hoạt cam).
  - Bản in PDF chuẩn A4 (`pdfGenerator.ts` - `renderStudentReportCardBody`): Khung thống kê 3 cột rõ ràng, trang trọng, phục vụ lưu trữ học bạ và ký nhận phụ huynh.

---

## 21. QUY CHẾ QUẢN LÝ, SOẠN THẢO, IMPORT & IN ĐỀ THI TRẮC NGHIỆM THÔNG MINH (ADR-023 / LEVEL 2)

### 21.1 Bộ Phân Tích Đề Thi Tự Động (Smart Exam Parser - `src/utils/examParser.ts`)
Hệ thống cung cấp cơ chế phân tích đề thi thông minh Client-side, hoạt động 100% Offline:
1. **Định dạng Văn Bản / Word / Markdown Paste**:
   - Nhận diện linh hoạt tiền tố câu hỏi: `Câu 1:`, `Câu 1.`, `Bài 1:`, `Question 1:`, `1.`, `1)`, `1:`, `1/`.
   - Tự động tách 4 phương án $A, B, C, D$ dù nằm trên từng dòng riêng biệt hay gộp trên 1 dòng.
   - Tự động trích xuất đáp án đúng:
     - Dòng đáp án riêng: `Đáp án: A`, `Đ/A: B`, `Key: C`, `Chọn: D`.
     - Đánh dấu inline: `*A. Nội dung`, `[B] Nội dung`.
     - Bảng đáp án tổng hợp ở cuối đề: `BẢNG ĐÁP ÁN: 1A 2B 3C 4D...`.
2. **Định dạng File Bảng Tính Excel (`.xlsx`, `.xls`, `.csv`)**:
   - Nhận diện tự động file 7 cột: `[Câu số, Nội dung, Phương án A, B, C, D, Đáp án đúng]`.
   - Cung cấp sẵn file mẫu chuẩn `.xlsx` để tải về và nhập liệu.
   - **QB-F1 (2026-08-21)**: ô đáp án TRỐNG hoặc không chứa A/B/C/D → mặc định gán `A` **kèm warning** hiển thị cho người nhập; TUYỆT ĐỐI không suy đoán đáp án từ nội dung phương án (trước đây "Bác Hồ" → B im lặng). Ô dạng dài hợp lệ như `Đáp án: C` vẫn trích được `C`.
3. **Giới Hạn & Ràng Buộc**:
   - Tự động đồng bộ số câu `questionCount` (tối đa 50 câu) và bảng đáp án `answerKey` vào phiên chấm bài.
   - **UI-POLISH (2026-08-25) — Import theo hình thức**: form tạo phiên chọn Hình thức TRƯỚC — `mixed`: 2 ô import riêng (Phần Trắc Nghiệm / Phần Tự Luận); `multiple_choice`: chỉ ô Trắc Nghiệm; `written` (tô điểm): không import đề; đổi hình thức tự dọn phần không phù hợp. `scopeExamParseResult()` lọc kết quả parse theo scope, bỏ phần không thuộc scope kèm warning, đánh lại index 1..N trên phần giữ lại; ghép 2 phần: TN 1..N + TL N+1..N+M (giữ ràng buộc MC contiguous §21.5). Chỉ nạp TL mà chưa có TN → chặn submit với thông báo; chỉ TN → `multiple_choice`; có cả hai → `mixed`.
4. **Hợp đồng lưu trữ ngân hàng câu hỏi (QB-F2/F3, 2026-08-21)**:
   - Server validate `questions` ở `POST /api/exams`: mảng 1–50 ExamQuestion, mỗi câu có `index` 1..50, `question` 1..2000 ký tự, đủ `options.A–D` (≤500 ký tự), `correctOption ∈ A/B/C/D`; chuỗi ≤200KB. Vi phạm → 400 ngay tại create.
   - `questions[].correctOption` là **bản chiếu của key mã A**: khi admin đổi answer-key (`PATCH /:id/answer-key`), server tự sync `correctOption` theo key mới (câu nào có trong key). Questions hỏng/không parse được → bỏ qua silently, rescore vẫn chạy. Renderers (ExamPaperModal/ExamExportModal) vẫn remap theo activeKey khi hiển thị — questions JSON trong DB giờ luôn nhất quán với key mã A.

### 21.2 Bản In Đề Thi A4 Chuẩn Nhà Xứ (`src/utils/examSheets.ts` - `buildExamPaperHtml`)
- **Nhận diện Giáo Xứ**: Header trang trọng gồm Giáo phận, Giáo xứ, Xứ đoàn TNTT, Tên lớp, Niên khóa, Tên bài kiểm tra và thời gian làm bài.
- **Bố Cục Trang In A4**:
  - Tùy chọn 2 cột (tiết kiệm giấy A4) hoặc 1 cột.
  - Khung thông tin học sinh (Họ tên, Tên thánh, Mã số) và ô chấm điểm / lời phê của GLV.
  - Tùy chọn in kèm hoặc ẩn Bảng Đáp Án (đề thi cho học sinh vs. đáp án chấm cho Ban Giáo Lý).
- **Tính Đồng Bộ OMR**: Đề thi và Phiếu trả lời OMR in từ hệ thống tương thích tuyệt đối về số lượng câu hỏi và mã phiên chấm. Geometry của khung tích hợp có một SSOT tại `answerSheetTemplate.ts`: marker 18px có halo trắng, bubble 16px, hàng 18px; chiều cao khung và tỷ lệ guide/detector được tính động theo số câu (10/20/50), không normalize Y bằng chiều cao cố định của đề 50 câu. Tâm bubble do detector tính phải được regression-test với `DOMRect` của bản in Chromium ở sai số ≤2px. Bản in hướng dẫn dùng bút bi xanh/đen hoặc bút chì đậm, tô kín đúng một ô; nét chữ/viền bubble in dùng màu nhẹ hơn để tăng tương phản giữa ô trống và ô tô. QR định danh phải render trong hệ tọa độ module chuẩn, có quiet zone trắng 4 module mỗi cạnh và `viewBox` bao trọn data modules + quiet zone; không được ghép inner SVG tọa độ `moduleCount × cellSize` vào viewBox chỉ `moduleCount`. Với ID production chuẩn `EXS-xxxxxxxx`/`ST-xxxxxxxx`, bản in mới dùng payload v2 Alphanumeric `T2:*` 25 module ràng buộc template/số câu/checksum; scanner và API vẫn đọc compact v1 `TE:XXXXXXXX:XXXXXXXX` 21 module và legacy `tntt-exam:{sessionId}:{studentId}`. Việc rút gọn không truncate ID. Code128 dự phòng có quiet zone 10 module, viewBox động theo payload và được in thành dải full-width cuối phiếu (module in A4 ≥ 0.19mm). Scanner camera phải xử lý đúng vùng `object-fit: cover` portrait mà người dùng nhìn thấy thay vì toàn sensor landscape, ưu tiên crop tập trung trên/phải và phóng 2× trước khi làm sắc vùng mã; nếu thiết bị hỗ trợ thì áp dụng continuous focus/exposure/white-balance. QR của đề gộp in ở 120px; luồng camera tự động là **hai bước có hướng dẫn**: (1) đưa riêng QR lại gần; (2) sau khi đọc đúng mã, lùi máy/căn đúng loại khung OMR. Định danh đúng phiên được giữ tối đa **8 giây** và được recheck mỗi 1,2 giây; hết TTL phải đọc lại mã. OMR detector dùng summed-area table, dò marker cô lập qua nhiều scale, bắt buộc đúng geometry/bề mặt giấy và cần 2 frame đáp án giống nhau trong tối đa 1,8 giây trước khi đề xuất điểm tự động. UI phải phân biệt rõ `mã đang tìm` / `mã đã đọc, OMR đang tìm` / lỗi OMR / đã nhận diện; người dùng vẫn phải xác nhận trước khi ghi.

### 21.3 Scan Engine v2 — Form Protocol, ngoại lệ và điểm authoritative (ADR-049)

1. **Phiếu mới / phiếu cũ**: ID production có mã đề dùng payload v3 `T3:{sessionHex8}:{studentHex8}:{I|F}:{questionCount}:{A-H}:{checksum4}`; mã đề được ràng buộc vào checksum. Scanner tiếp tục đọc `T2:*`, `TE:*` và `tntt-exam:*` cũ, mặc định các phiếu này thuộc mã A. `I` = khung OMR trên đề, `F` = phiếu A4 rời. Checksum chỉ chống payload bị cắt/sửa nhầm, không thay thế xác thực/RBAC.
2. **Ràng buộc mẫu**: sau khi đọc v2, scanner tự chọn đúng template; `questionCount` trên phiếu khác phiên hiện tại phải dừng fail-closed và thông báo, không chạy OMR/không ghi điểm.
3. **Trạng thái quyết định**: kết quả trắc nghiệm thuộc một trong `accepted`, `review_required`, `rejected`. Phiếu trắng hoàn toàn = `rejected/ALL_BLANK`; câu có nhiều ô hoặc vết tô đáng kể nhưng dưới ngưỡng = `review_required`. Nút ghi điểm bị khóa cho đến khi người chấm xác nhận/sửa tất cả câu ngoại lệ. Câu bỏ trắng thật vẫn hợp lệ và tính sai; chỉ tô một đáp án rõ vẫn được chấm trên tổng số câu như quy tắc hiện hành.
4. **Server authoritative + OCC**: với phiên trắc nghiệm và source `omr|qr_scan`, server bắt buộc parse/validate `answers`, lấy key của đúng `examVersion` từ `answerVariants`, `questionCount`, `maxScore` rồi tự tính lại `correct/totalQuestions × maxScore` (làm tròn 0,1). `answerKey` legacy là mã A. Mã chưa cấu hình bị từ chối. Điểm client chỉ là proposal; sai lệch được trả trong `adjustments` và ghi audit. Mỗi result có `resultVersion`; update phải gửi đúng `expectedResultVersion`, stale/missing precondition trả 409 và không ghi đè. Source `quick_entry` tiếp tục dùng score đã validate.
5. **Dấu vết & riêng tư**: source `omr|qr_scan` bắt buộc `scan_metadata.detectionStatus='accepted'`; với MC/mixed, metadata phải khớp mã đề và số câu dùng để chấm. Metadata lưu detected answers, final answers và correction diff/corrected questions; result lưu thêm attempt fingerprint, thời điểm capture, actor/time server và version. API cấm mọi key ảnh/frame/photo/blob/base64 ở mọi cấp và cấm data URL. Ảnh rà soát chỉ được lưu khi người dùng opt-in, trên thiết bị hiện tại bằng Dexie tenant-scoped mã hóa AES-GCM, tối đa 24 giờ, không upload và có thể xóa ngay. Current-row provenance không đồng nghĩa full append-only attempt history; nếu nghiệp vụ yêu cầu lịch sử đó phải có quyết định retention riêng.
6. **Chất lượng/capture**: nút `Chụp & chấm` lấy frame từ độ phân giải sensor tới 2200px (fallback video preview tối đa 1280px); file upload được co tối đa 1400px. Quality=`bad` bắt buộc reject, quality=`review` bắt buộc route rà soát; marker/paper/geometry/confidence tiếp tục là hard gates.
7. **Gate bật auto batch mặc định**: chưa được coi là đạt độ chính xác thực địa cho tới khi corpus camera MC đã khử định danh chứng minh: false accept = 0 ở negative set; exact sheet ≥99,5% normal và ≥98% stress; first capture ≥95%; 100% blank/multi/weak/template mismatch được route đúng; p95 detector ≤150ms trên từng required release profile. Cho tới lúc đó `Chấm Ổn Định` (chọn học sinh → chụp → review → lưu) là CTA chính; QR+OMR chỉ tạo proposal trong luồng có người chấm xác nhận, không auto-save.
8. **Batch file explicit**: người có quyền có thể chọn tối đa 500 ảnh/thư mục và xem ba nhóm accepted/review/rejected. Chỉ nhóm accepted mới được lưu sau thao tác xác nhận; ảnh sai phiên, sai lớp, sai số câu, mã đề thiếu key, OMR ngoại lệ hoặc quality khác `good` không được tự ghi điểm.
9. **Analytics**: thống kê chỉ đọc `exam_results`; không thay đổi điểm. Point-biserial chỉ hiển thị khi tối thiểu 5 bài và tồn tại cả response đúng/sai. SBD/OCR/mẫu BGD chưa đạt D3 evidence gate nên không được gán identity hoặc điểm tự động.
10. **Phạm vi mã đề**: Phiếu trả lời rời tiếp tục hỗ trợ A–H cho đề đảo được chuẩn bị bên ngoài. Đề có câu hỏi nhưng không có `variant_manifests` chỉ được in mã A; tuyệt đối không đổi nhãn B–H trên cùng nội dung. Khi server đã tạo manifest bất biến, `In Đề & Phiếu Gộp` được chọn đúng version A–H và bắt buộc dùng câu hỏi, thứ tự lựa chọn và answer key đã materialize của chính version đó.
11. **Go-live gate camera OMR (ADR-060)**: unattended/default MC auto-batch chỉ được bật khi corpus privacy-safe có ≥400 mẫu gồm normal ≥200, stress ≥100, negative ≥100 và đồng thời đạt normal exact-sheet ≥99.5%, stress ≥98%, answer ≥99.5%, first-capture ≥95%, false accept =0, review routing=100%, negative routing=100%, p95 ≤150ms trên mọi required release profile. Thiếu corpus/hụt một ngưỡng/profile → vẫn chỉ dùng proposal có người chấm rà soát và bấm lưu; test tổng hợp không được dùng để tuyên bố accuracy thực địa. Trạng thái `accepted` trong UI hiện hành chỉ có nghĩa “đủ điều kiện đề xuất”, không phải đã tự ghi điểm. Score-grid tự luận chưa có `expectedScore` corpus KPI nên luôn manual-confirm và không nằm trong chứng nhận MC này.
12. **Scan Engine v4 — tốc độ không hạ safety gate (ADR-062)**: QR live dùng chu kỳ 3 `live_fast` (3 ROI chuẩn) + 1 `live_recovery` (một crop focus phóng 2×), kể cả lúc recheck identity; cả hai không inversion. Nút chụp/tải file/batch dùng `exhaustive` 9 normal + 4 `invertFirst`; Code128 vẫn fallback. OMR dùng chung grayscale/summed-area đã chuẩn bị một lần và chỉ tái sử dụng scratch arena cho frame ≤2,5 triệu pixel; ảnh lớn dùng buffer cục bộ, arena phải zeroize/release khi dừng camera hoặc kết thúc batch. Auto candidate đầu tối đa 960px nhưng QR/recheck/frame xác nhận cuối tối đa 1280px; fixed-student still tối đa 2200px, upload tối đa 1400px; vẫn bắt buộc 2 fingerprint giống nhau. RAF phải gọi cấu hình mã đề/template mới nhất và neo backpressure sau khi xử lý xong. Quality=`bad` bị từ chối trước detector; quality=`review` không được tự nâng lên accepted. Live batch giữ camera stream khi chuyển phiếu; batch file commit UI mỗi 8 ảnh, yield sau từng ảnh nhưng vẫn tuần tự/giới hạn RAM. Mọi kết quả v4 vẫn là proposal và server tự chấm lại.
13. **Hợp đồng KPI corpus MC**: observation bắt buộc `workload=multiple_choice`, exact-sheet/answer accuracy chỉ tính cohort normal/stress; negative không được làm đẹp accuracy, ô expected `null` không được tính vào answer accuracy. `reviewRoutingAccuracy` chỉ có mẫu số là mẫu kỳ vọng `review_required`. Mỗi `sampleId` và SHA-256 file phải unique; answer length thiếu được tính sai, còn observation/profile/NaN/âm malformed bị loại khỏi mẫu số và làm gate fail. Timing tách theo exact `engineVersion + device + runtime/browser + resolution + templateMode + questionCount + cold/warm`, ≥20 mẫu/profile. Accuracy/routing gộp cold/warm nhưng vẫn tách các chiều còn lại, ≥40 mẫu/profile (normal 20, stress 10, negative 10, review 10, accepted 20) và từng profile phải đạt toàn bộ threshold. Release phải cung cấp exact required timing/accuracy matrix, mỗi accuracy profile có cả cold và warm timing; default rỗng hoặc thiếu bất kỳ profile nào đều fail-closed. Benchmark synthetic chỉ là regression signal.
14. **Quét liên tiếp có giám sát (ADR-067/107)**: chỉ hoạt động khi người chấm bật `Quét liên tiếp`; mỗi proposal vẫn phải bấm Save. Save phải ghi encrypted durable queue theo từng `sessionId + studentId` trước khi camera re-arm; network acknowledgement không được chặn capture. Trước khi gửi, op được claim sang `processing`; lần quét mới không được compact vào op đang gửi. Lease hết hạn sau tiến trình bị ngắt được phục hồi để retry. `complete` chỉ flush sau toàn bộ save/remove chưa terminal đã xếp trước.
15. **Rearm, dedupe và conflict**: cùng attempt fingerprint trong một capture session bị bỏ qua; cùng học sinh nhưng fingerprint khác hoặc đã có result phải vào `Cần xử lý` và cần xác nhận rõ ràng, không last-write-wins im lặng. Cùng phiếu chỉ được re-arm khi identity mới đã ổn định hoặc phiếu cũ vắng liên tục ít nhất 3 observation và 900ms; fingerprint là guard thứ hai.
16. **Idempotency + concurrency kết quả**: client gửi `clientMutationId` và `expectedResultVersion` ổn định qua retry. Server scope receipt theo `(parish_id,user_id,client_mutation_id)`, lưu request hash + acknowledgement trong cùng transaction với result; cùng hash trả `duplicate` mà không rewrite/audit lại, cùng key khác payload trả 409 `IDEMPOTENCY_CONFLICT`. Update chỉ thắng nếu SQL compare-and-swap đúng version; stale trả `EXAM_RESULT_VERSION_CONFLICT`. Server vẫn tự chấm MC/mixed và response itemized phải reconcile `serverScore + resultVersion` vào ledger.
17. **Quality ROI shadow (ADR-068)**: paper-ROI chỉ là số đo quan sát sau marker/paper gate; không được thay global quality trong acceptance cho tới khi real corpus đạt ADR-060/062. Diagnostics không lưu ảnh hoặc định danh.
18. **Sequence/pilot gate (ADR-068)**: fast continuous queue chỉ mở cho parish/user allowlist; thiếu scope/allowlist hoặc circuit lỗi thì dùng stable batch. Mỗi required exact profile cần một run 30 riêng và một run ≥100 riêng, ít nhất một unresolved case và một reload case, zero false rearm/stale identity/duplicate/lost/ack corruption, unresolved routing và reload recovery 100%; thiếu target-device/responsiveness/memory evidence là fail.
19. **Bằng chứng thiết bị thật (ADR-069)**: recorder chỉ được ghi sau thao tác chuẩn bị run rõ ràng của người vận hành. Một run phải khóa cùng engine/device/browser/frame/template/questionCount; profile lệch không được trộn. Chỉ run đã đủ proposal/durable/ack cho mọi phiếu mới được export. Manifest cấm ảnh, QR, đáp án, student/session/parish/user ID và timestamp; raw mutation ID không được lưu hoặc xuất. Runtime không hỗ trợ Long Animation Frame/Long Task hoặc memory measurement phải ghi `unsupported` và fail gate, không được suy đoán PASS.
20. **Rollback và field gate**: `VITE_CONTINUOUS_SCAN_V2=false|off|0` quay về luồng stable; không xóa stable mode. Tính năng không hạ threshold, không upload ảnh và không cho unattended/default auto-save. Accuracy, throughput, thermal và memory thực địa tiếp tục `NOT CONFIRMED` cho tới khi corpus sequence/thiết bị đạt gate ở mục 7/11/13/18/19.
21. **Qualification provenance và sustained performance (ADR-070)**: mọi field run phải bind exact immutable `releaseId`; build `dev/local/unknown` không được arm. Mỗi run export `runElapsedMs` nhưng không timestamp; gate bắt buộc chủ sản phẩm cấu hình `papersPerMinuteMin` và `proposalLatencyDriftRatioMax`, đồng thời đánh giá throughput thấp nhất và proposal drift xấu nhất, không chỉ aggregate p95. Một qualification chỉ được chứa một release và đúng required profiles; unexpected profile, release trộn, duplicate run ID hoặc manifest v1 đều fail, không được silent-dedupe/tự migrate. Thermal trực tiếp chưa có browser API ổn định nên chỉ được ghi từ phương pháp external đã mô tả; thiếu bằng chứng vẫn `NOT CONFIRMED`.
22. **Field-run preflight và export release-safe (ADR-071)**: UI phải cho operator thấy trong active run số unresolved đã route, reload đã recover, nguồn responsiveness/memory và mọi safety failure trước khi mất cả run 30/100. `PerformanceObserver.supportedEntryTypes` không đủ làm evidence; chỉ `observe()` attach thành công mới được ghi nguồn supported. Manifest/scaffold tải từ UI chỉ được chứa completed run của release hiện tại; run release cũ được giữ và cảnh báo riêng, không silent-mix/xóa. Preflight/scaffold không được gắn nhãn PASS và không thay sequence evaluator, product target hoặc corpus accuracy gate.
23. **Exam Studio manifest bất biến (ADR-094)**: chỉ phiên `draft` có ngân hàng câu hỏi và chưa có kết quả mới được tạo 1–8 mã. Server là authority sinh deterministic permutation, lưu seed/source hash/content hash, question order, option order và answer key cho từng mã trong `exam_sessions.variant_manifests`. Tập manifest chỉ tạo một lần; muốn thay đổi phải tạo phiên draft mới. Sau khi có manifest, endpoint sửa answer key/answer variants thủ công trả 409. Câu có lựa chọn trùng nhau hoặc đáp án phụ thuộc vị trí như “tất cả/không đáp án nào/cả A và B” phải bị từ chối, không tự xáo trộn làm đổi nghĩa.
24. **Giới hạn OMR v5 (ADR-094)**: Web Worker, OffscreenCanvas, SharedArrayBuffer và adaptive threshold không được bật chỉ từ benchmark desktop hoặc kỳ vọng 60 FPS. Chúng chỉ được chọn khi exact target-device artifact chứng minh main-thread bottleneck và corpus ADR-060/068/069 chứng minh không giảm false-accept/review routing/accuracy. Cho tới lúc đó Scan Engine v4, 2-frame consensus, human review, server recompute và durable offline queue là contract bắt buộc.

---

### 21.4 Xuất Đề Thi Đa Định Dạng (Multi-Format Exam Exporter - `src/utils/examExporter.ts`)
Hệ thống cung cấp tính năng xuất đề thi và bảng đáp án đa định dạng 100% Client-side, hoạt động hoàn toàn Offline:
1. **Microsoft Word (.doc)**: Header Giáo Phận / Giáo Xứ, lớp, niên khóa, khung thông tin học sinh, ô trả lời trắc nghiệm nhanh, 1 hoặc 2 cột, bảng đáp án và giải thích chi tiết cho GLV.
2. **Excel (.xlsx)**: File đa sheet bằng SheetJS (`Danh_Sach_Cau_Hoi` tương thích import, `Bang_Dap_An_Ma_De` ma trận đáp án mã đề A–H, `Thong_Tin_De_Thi`).
3. **Plain Text (.txt) & Markdown (.md)**: Định dạng phân đoạn rõ ràng, bảng Markdown GFM.
4. **JSON (.json)**: Gói dữ liệu đầy đủ metadata, câu hỏi, điểm và đáp án. Phiên key-only (không có ngân hàng câu hỏi) đánh dấu `metadata.syntheticQuestions = true` — danh sách câu hỏi kèm theo là PLACEHOLDER, không phải dữ liệu thật (EP-F3).
5. **Bảo mật**: Khử XSS toàn bộ nội dung HTML sinh ra bằng `escapeHtml`; tên file xuất qua `sanitizeFilename` (thay `[<>:"/\\|?*]`) và `<title>` PDF export được sanitize qua `applyPdfTitle` — chặn stored XSS từ `subject` của phiên chấm khi nạn nhân bấm "Tải PDF" (EP-F1/F2, AUDIT-EP-01 2026-08-21).
6. **Phân Định In Đề vs Xem Đề Thi Trên Thiết Bị (ADR-076)**:
   - **Mobile Mode**: Chế độ di động phục vụ đọc đề, đối chiếu đáp án và chấm điểm nhanh trong lớp; nút mở hiển thị `[Xem Đề Thi]` (`<Eye size={14} />`). Modal `ExamPaperModal` được mount độc lập ra `document.body` qua `React.createPortal` (Z-Index 1100), cung cấp 2 chế độ xem trước:
     - `📖 Đọc Đề`: Danh sách thẻ câu hỏi tối ưu cho điện thoại (phương án A/B/C/D, highlight đáp án đúng màu xanh và lời giải chi tiết khi bật Hiện Đáp Án).
     - `📄 Đề A4` & `📋 Phiếu A4`: Bản xem trước tờ A4 giữ nguyên tỷ lệ 210mm vector chuẩn (`Fit Width` co vừa màn hình không vỡ dòng và `100% A4` cuộn chi tiết).
     - **Quy tắc bảo vệ**: Ẩn hoàn toàn 100% các chức năng in trực tiếp (`handlePrint`) và xuất file máy tính (Word, Excel, HTML) trên mobile để tránh sai sót thao tác; chỉ giữ nút tải file `[PDF]` về bộ nhớ điện thoại khi cần.
   - **Desktop Mode**: Chế độ máy tính đóng vai trò trung tâm học vụ và in ấn đầy đủ; nút mở hiển thị `[In Đề & Phiếu]` (`<Printer size={14} />`), modal hỗ trợ toàn diện các tùy chọn in trực tiếp (`printBatchExamPapers`, `printBatchAnswerSheets`, `printQrSheet`) và xuất bản đa định dạng (Word .doc, Excel .xlsx, HTML độc lập, PDF vector).

### 21.5 Đề Kết Hợp Trắc Nghiệm + Tự Luận — EXAM-MIXED (ADR-053, 2026-08-24)

Phiên `exam_type = 'mixed'` gồm CẢ phần trắc nghiệm (chấm tự động OMR/QR) và phần tự luận (nhập tay):

1. **Mô hình dữ liệu**: `ExamQuestion.type ∈ {multiple_choice, essay}` (thiếu `type` ở dữ liệu cũ → mặc định `multiple_choice`). Câu `essay` KHÔNG có `options`/`correctOption` (server từ chối nếu có). Mỗi câu có thể khai báo `points` (mặc định 1đ, range (0,100]).
2. **Ràng buộc bố cục**: các câu TN phải chiếm CHÍNH XÁC index `1..questionCount` liên tục từ đầu đề (phiếu OMR đánh bubble 1..N theo `questionCount`); câu TL đứng sau. `questionCount` của phiên mixed = **số câu trắc nghiệm**. Server validate chặt ở create; vi phạm → 400.
3. **Import đề mixed**:
   - Văn bản: tiêu đề phần `PHẦN I. TRẮC NGHIỆM` / `PHẦN II. TỰ LUẬN` (hoặc `Part`, số La Mã, nhãn TN/TL ngắn) chuyển mode phân tích; câu sau tiêu đề TL không cần phương án. Điểm câu `(3 điểm)`/`(0,5 đ)` được trích khỏi nội dung hiển thị; điểm khai báo ở TIÊU ĐỀ PHẦN được chia đều cho các câu chưa có điểm riêng kèm warning. Regex mở đầu câu hỏi chấp nhận chú thích điểm: `Câu 4 (5 điểm): ...`.
   - Excel: layout mở rộng có cột `Loại` (TN/TL) + cột `Điểm`; parser map cột THEO TÊN HEADER nên thứ tự cột linh hoạt; file 7 cột cũ vẫn import bình thường (toàn bộ hiểu là TN).
   - `answerKey` chỉ chứa đáp án câu TN. Xuất Excel round-trip ghi thêm cột `Loại`.
4. **Hợp đồng điểm (server-authoritative)**:
   - Phần TN tự chấm theo trọng số từng câu: `mcEarned = Σ points(câu đúng)`. KHÔNG dùng tỉ lệ `correct/count × maxScore` như đề thuần TN.
   - Phần TL nhập tay per-student (`essayScore` trên `POST /:id/results`), lưu cột `essay_score` (migration `20260824-129`), bị từ chối nếu vượt tổng điểm câu TL của đề hoặc `maxScore`.
   - `score = clamp(mcEarned + essayScore, 0, maxScore)` luôn do server tổng hợp từ thành phần đã lưu — merge 2 pha (quét trước/nhập sau hoặc ngược lại) KHÔNG làm mất `answers` hay `essay_score`. Command essay-only phải tái dùng đúng `examVersion`, source/provenance, fingerprint và capture time của thành phần TN đã lưu; tuyệt đối không default về mã A. Request mixed thiếu cả hai thành phần → 400.
   - Phiên không phải mixed gửi `essayScore` → 400.
   - Rescore (đổi key/mã đề): chấm lại phần TN theo trọng số + giữ nguyên `essay_score` đã lưu; rows `quick_entry` của mixed vẫn được rescore phần TN.
5. **In & quét**: khung OMR tích hợp trên đề in chỉ render các câu TN; QR payload embed `questionCount` = số câu TN (detector fail-closed so số bubble). Bản in hiển thị câu TL với dòng kẻ trình bày; bảng đáp án GLV tách phần TN (key) và gợi ý chấm TL. Scan/batch scan/analytics hoạt động trên phần TN; analytics ghi rõ phạm vi khi mixed.
6. **Nhập điểm UI**: QuickScoreEntry/GuidedGrade ở chế độ mixed là "Nhập điểm TỰ LUẬN" (trần = Σ points câu TL), hiển thị cột Tổng (TN+TL); bảng kết quả có cột riêng "Điểm TL". Hoàn tất phiên/finalize dùng điểm tổng như thường lệ.

---

## 22. QUY CHẾ QUẢN LÝ NGÂN QUỸ & THU CHI XỨ ĐOÀN TNTT (ADR-039)

### 22.1 Phân Quyền & Bảo Mật Ngân Quỹ (Strict Admin-Only RBAC)
1. **Phân Quyền Tuyệt Đối**:
   - Toàn bộ phân hệ Quản Lý Quỹ & Thu Chi (`/finances`, `/api/finances/*`) được giới hạn nghiêm ngặt **CHỈ DÀNH CHO ROLE `admin`** (Ban Quản Trị / Thủ Quỹ).
   - Mọi truy cập trái phép từ các role khác (`chunhiem`, `phuta`, `phuhuynh`) đều bị từ chối với HTTP 403 Forbidden.
2. **Kiểm Toán Bất Biến (Audit Trail)**:
   - Tất cả giao dịch Thu, Chi, Chuyển Quỹ, Tạo Quỹ và Thu Tiền Đoàn Sinh đều được tự động ghi nhận vào `audit_logs` kèm `userId`, `ip`, `userAgent` và thời điểm thực hiện.

### 22.2 Danh Mục Quỹ & Cơ Chế Tính Số Dư
1. **Hệ Thống Quỹ Độc Lập**:
   - Hệ thống tự động khởi tạo 4 quỹ mặc định cho mỗi Giáo Xứ:
     - `GENERAL` — Quỹ Chung Xứ Đoàn (Quỹ mặc định cho các hoạt động thường nhật).
     - `CHARITY` — Quỹ Bác Ái (Hỗ trợ thiếu nhi có hoàn cảnh khó khăn, bác ái mùa Chay).
     - `CAMP` — Quỹ Trại Hè & Sự Kiện (Sa mạc huấn luyện, lễ hội Giáng Sinh, Trung Thu, Bổn Mạng).
     - `LEADERS` — Quỹ Huynh Trưởng (Sinh hoạt, bồi dưỡng và đào tạo Ban Huynh Trưởng).
   - Cho phép Ban Quản Trị tạo thêm các Quỹ riêng biệt theo nhu cầu thực tế của Xứ Đoàn.
2. **Cơ Chế Tính Số Dư Toàn Vẹn**:
   - `Số Dư Khả Dụng = Số Dư Ban Đầu + Tổng Thu - Tổng Chi`.
   - Giao dịch Chuyển Quỹ (`TRANSFER`): Trừ tiền từ Quỹ Nguồn và Cộng tiền vào Quỹ Nhận trong cùng một giao dịch an toàn.

### 22.3 Thu Niên Liễm & Đóng Tiền Đoàn Sinh Theo Lớp
1. **Sổ Thu Tiền Theo Lớp**:
   - Ban Quản Trị theo dõi danh sách đóng tiền theo từng lớp với 3 trạng thái: `PAID` (Đã nộp), `UNPAID` (Chưa nộp), `EXEMPTED` (Miễn giảm hoàn cảnh khó khăn).
   - Hỗ trợ 1-chạm xác nhận đã nộp và tự động sinh Phiếu Thu vào Quỹ Xứ Đoàn.
   - Hỗ trợ thao tác thu hàng loạt ("Thu Tất Cả") cho các em còn lại trong lớp.
2. **Nhất quán giữa nghĩa vụ phí và sổ quỹ (ADR-101)**:
   - Mỗi `(parish, student, academicYear, feeType)` chỉ có một `student_fee_record`. Khi xác nhận `PAID` kèm tự động tạo phiếu thu, `transaction_id` là liên kết authoritative tới đúng giao dịch `INCOME` của học sinh/lớp/năm đó.
   - Gửi lại cùng lệnh `PAID` không được tạo phiếu thu thứ hai. Thay đổi số tiền/quỹ của khoản đã nộp phải reconcile đúng giao dịch đang liên kết trong cùng transaction.
   - Chuyển khoản đã nộp sang `UNPAID` hoặc `EXEMPTED` phải xóa đúng phiếu thu tự động đang liên kết, xóa liên kết và ghi audit `TXN_FEE_REVERSED` trong cùng transaction. Đây là quy tắc **CONDITIONAL** được chọn để số dư không giữ khoản thu đã hủy; không sinh giao dịch chi giả lập.
   - “Thu Tất Cả” là lệnh all-or-nothing tối đa 500 bản ghi. Một học sinh/quỹ/lớp không hợp lệ làm rollback toàn batch; UI không được báo hoàn tất từng phần.
   - Write contract chỉ cho ba trạng thái nghiệp vụ trên. `PAID` phải có `paidAmount > 0`; `UNPAID|EXEMPTED` phải có `paidAmount = 0`. Enum `PARTIAL` chỉ được giữ trong read model/schema để đọc dữ liệu legacy và không được tạo mới; cần audit dữ liệu production trước khi loại bỏ hoàn toàn khỏi schema.

### 22.4 Chứng Từ & Bản In Phiếu Thu / Phiếu Chi Chuẩn A5/A4
1. **Chuyển Đổi Số Tiền Thành Chữ**:
   - Tự động chuyển đổi số tiền VND sang chữ tiếng Việt chuẩn xác theo quy chuẩn kế toán (VD: `150.000đ` $\rightarrow$ *"Một trăm năm mươi nghìn đồng chẵn."*).
2. **Bản In Chuẩn Mực Nhà Xứ**:
   - Sinh Phiếu Thu / Phiếu Chi trang trọng chuẩn nhận diện Xứ Đoàn với 4 chữ ký: Cha Tuyên Úy, Xứ Đoàn Trưởng, Thủ Quỹ, và Người nộp/nhận tiền.

---

## 23. QUY TẮC TOÀN VẸN DỮ LIỆU & KIỂM SOÁT ĐỒNG BỘ NÂNG CAO (ADR-053)

### 23.1 Tính Nguyên Tử Trong Duyệt Đơn Nghỉ Phép (Atomic Leave Approval)
- Khi Ban Giáo Lý hoặc Admin duyệt (`APPROVED`) đơn xin nghỉ phép của phụ huynh:
  - Cập nhật trạng thái đơn thành `APPROVED` và ghi nhận trạng thái điểm danh `AbsentExcused` (kèm ghi chú `[Đơn online] <lý do>`) **BẮT BUỘC** nằm trong cùng một Database Transaction.
  - Nếu việc ghi nhận điểm danh thất bại, toàn bộ thao tác duyệt đơn bị hủy bỏ (Rollback), đảm bảo trạng thái hiển thị của đơn và sổ điểm danh luôn đồng nhất 100%.

### 23.2 Kiểm Soát Trùng Lặp Nội Bộ Khi Nhập Danh Sách (Intra-File Duplicate Protection)
- Trong quá trình Import Excel danh sách học sinh:
  - Hệ thống thực hiện kiểm tra 2 lớp:
    1. **Lớp 1 (Nội bộ file)**: Phát hiện các dòng trùng lặp `(Họ và tên chuẩn hóa, Ngày sinh)` ngay trong cùng một file Excel tải lên, gắn cờ `intra-file` cảnh báo người dùng.
    2. **Lớp 2 (Cơ sở dữ liệu)**: Đối chiếu với CSDL hiện tại để phân biệt anh chị em cùng số điện thoại (IE-01) hoặc học sinh trùng tên khác ngày sinh (IE-02).
  - Mọi collision mặc định **Bỏ qua** ở cả UI và server. Người dùng phải chọn tường minh **Cập nhật hồ sơ hiện có** hoặc **Đây là người khác — tạo mới**; dòng `intra-file` không được cập nhật bằng ID giả.
  - Preview và commit đều bắt buộc `academicYearId` active/unlocked. Exact/fuzzy class match chỉ xét lớp của năm đã chọn; tie hoặc lead dưới ngưỡng phải yêu cầu người dùng chọn, không tự gán. Validation không được tạo năm học.
  - CSV/TXT phải parse quote-aware; XLSX giữ cell theo structured rows. Gender/branch trống hoặc không hợp lệ phải ở trạng thái lỗi cần sửa, không được đoán thành `Nam`/`ThieuNhi`. Ngày sinh hợp lệ phải từ năm 1900 và không ở tương lai, đồng nhất manual CRUD.
  - Ô trống/placeholder trong file không được xóa dữ liệu đang có khi update. `fullName` và lớp mục tiêu vẫn bắt buộc hợp lệ.
  - Chủ nhiệm chỉ xem collision trong lớp được phân công ở preview; lúc commit server vẫn chặn tạo trùng toàn giáo xứ nhưng trả thông báo chung cho collision ngoài phạm vi.
  - Undo danh sách chỉ trong 24 giờ, dùng snapshot exact gắn batch. Nếu học viên đã sửa hoặc có điểm, điểm danh, kỳ thi, xét lên lớp, snapshot năm, assessment, đơn nghỉ hoặc học phí thì item đó bị từ chối; kết quả itemized có thể `partial_undone`. Audit redacted không phải nguồn restore; actor undo hiện tại phải là người được ghi attribution.
  - Batch `partial_undone` có thể retry trong cửa sổ 24 giờ sau khi người dùng xử lý dependency; item đã undo bị bỏ qua idempotently.
  - Tối ưu hiệu năng không được đổi kết quả nghiệp vụ: fast path chỉ nhận dòng tạo mới đã validate, không collision và đã resolve lớp; lỗi của chunk phải rollback rồi chuyển sang xử lý từng dòng. Chỉ học viên đã commit mới được trả trong `studentChanges` và hiển thị ngay trên roster.
  - `import_batches` và class tạo riêng cho batch phải commit cùng transaction. Mỗi row provenance và counter batch commit cùng row write; sau restart, batch `processing` cũ được finalize từ provenance đã commit và class không tham chiếu được cleanup an toàn. Partial-success vẫn là chủ đích, không gom 2.000 dòng vào một transaction.
  - Màn hình phải cập nhật từ record server đã commit, không tự dựng mã/ID và không enqueue một lệnh sync thứ hai. Response đến sau khi người dùng đổi giáo xứ phải bị loại theo tenant scope. Hoàn tác là thao tác đảo ngược nên phải tải lại snapshot authoritative.

### 23.3 Quy Chuẩn Đánh Số Phiếu Thu / Chi Tuần Tự (Sequential Voucher Numbering)
- Số phiếu thu (`PT-YYYY-XXXX`) và phiếu chi (`PC-YYYY-XXXX`) được sinh tuần tự tăng dần dựa trên dữ liệu thực tế của từng năm trong CSDL (bắt đầu từ `0001`), không sử dụng số ngẫu nhiên nhằm đảm bảo tính duy nhất và tính liên tục của sổ sách kế toán Xứ Đoàn.

---

## 24. HỒ SƠ, TỔ CHỨC VÀ BỘ NHỚ SỐ XỨ ĐOÀN (ADR-081/082)

1. Catevia là một platform duy nhất với ba experience: `academic`, `organization`, `parent`. Đổi workspace không đổi tài khoản, tenant hoặc quyền; backend authorization vẫn là nguồn quyết định.
2. Một tài khoản nhân sự chỉ được liên kết tối đa một `parish_people` active trong cùng giáo xứ. Nhân vật lịch sử không có tài khoản vẫn có một identity tổ chức độc lập; không tạo tài khoản giả.
3. Một người có thể đồng thời có nhiều `catechist_assignments`, `parish_service_terms` và record/event links. Vì vậy cùng một người được phép đồng thời là Trưởng ngành và Trưởng ban bằng hai nhiệm kỳ độc lập. `users.role` vẫn là coarse access role hiện hành; workspace không được dùng để suy diễn quyền write.
4. Ban Điều hành là cấp cao nhất, không có parent, gồm các chức vụ tổ chức Trưởng Xứ đoàn, Phó Xứ đoàn 1, Phó Xứ đoàn 2, Thư ký, Thủ quỹ và Ủy viên. Ngành và Ban chuyên môn là hai loại đơn vị ngang cấp, cùng trực thuộc trực tiếp Ban Điều hành: Trưởng ngành phụ trách công tác dạy giáo lý; Trưởng ban phụ trách công tác chuyên môn Xứ đoàn. Mỗi Ban chuyên môn có đúng một Trưởng ban tại một thời điểm và có thể có nhiều Phó ban/Ủy viên; các nhiệm kỳ Trưởng ban cùng Ban không được chồng ngày (ngày kết thúc là inclusive). Cùng nguyên tắc một người đứng đầu tại một thời điểm áp dụng cho Trưởng ngành trong mỗi Ngành và Trưởng Xứ đoàn trong toàn giáo xứ. Không được suy rằng Trưởng ngành quản lý Trưởng ban hoặc ngược lại.
5. Nhiệm kỳ phải tham chiếu person và unit cùng tenant; ngày kết thúc không trước ngày bắt đầu. Cây đơn vị không được tự tham chiếu hoặc tạo vòng lặp. Writer mới bắt buộc `BOARD` ở root và `BRANCH|COMMITTEE` có parent là một `BOARD` active cùng tenant; không được đổi loại, vô hiệu hóa hoặc soft-delete Board khi còn Ngành/Ban chuyên môn trực thuộc. Dữ liệu legacy không được tự động đổi parent nếu chưa qua reconciliation có duyệt.
6. Record có ba loại `MILESTONE|ACTIVITY|ACHIEVEMENT`, ba trạng thái `DRAFT|PUBLISHED|ARCHIVED` và visibility `STAFF|ADMIN`. Nhân sự không phải admin chỉ đọc `PUBLISHED+STAFF`; phụ huynh không truy cập domain này.
7. Timeline là projection từ ngày thành lập, record có `show_on_timeline` và mốc nhiệm kỳ. Không nhập một bản sao timeline riêng.
8. Tư liệu upload chỉ JPEG/PNG/WebP/PDF tối đa 8 MiB, kiểm signature; video dùng external HTTPS. Production upload bắt buộc independent R2. Download upload phải qua auth/tenant/visibility route.
9. Delete domain là soft delete và bị chặn khi entity còn dependency. Audit chỉ ghi loại thay đổi, không sao chép tiểu sử, nội dung, URL hoặc file bytes.
10. `parish_events` là lịch vận hành; `parish_records` là ký ức có cấu trúc. Liên kết nguồn không làm thay đổi offline/calendar contract cũ.
11. Manual LMS export/restore hiện vẫn là snapshot học vụ theo hợp đồng v2; full encrypted logical backup tự động bao gồm các bảng Parish Memory. Không được quảng bá manual export là bản sao toàn platform.
12. Import nhân sự từ dữ liệu dán chấp nhận 1–100 dòng CSV/TSV có quote, đúng 1–5 cột. Mọi dòng, trạng thái và năm sinh `1900..năm hiện tại` phải hợp lệ trước khi gửi; server admin-only tạo toàn bộ people + audit trong một transaction. Một dòng lỗi hoặc constraint lỗi rollback cả batch, không được chuyển thành N request/partial success.
13. Sau khi server đã commit mutation Parish Profile, lỗi refetch chỉ đánh dấu projection `stale` và hướng dẫn tải lại; UI không được trả false-failure khiến người dùng lặp write. External image không tự tải khi render danh sách; chỉ mở theo thao tác chủ động và không gửi referrer.

---

## 25. KHÓA ỨNG DỤNG BẰNG SINH TRẮC HỌC (ADR-085)

1. Khóa sinh trắc học là tùy chọn riêng của bản native Android/iOS và scope theo đúng `parishId:userId`; tài khoản khác trên cùng thiết bị không được kế thừa lựa chọn.
2. Bật hoặc tắt khóa đều phải hoàn tất xác minh native; Android chỉ chấp nhận biometric được OS phân loại `strong`. Khi app ra nền, phiên UI đã bật phải chuyển sang trạng thái khóa; cold start không được mount protected router trước khi mở khóa.
3. Catevia không thu, đọc, gửi hoặc lưu ảnh khuôn mặt, vân tay hay biometric template. Chỉ hệ điều hành trả kết quả thành công/thất bại; local marker chỉ mang giá trị `enabled` và không chứa PII/credential.
4. Nếu sinh trắc học mất enrollment, không khả dụng hoặc lockout, app không được bypass vào dữ liệu. Đường recovery phải xóa marker khóa, đăng xuất/dọn client session rồi quay về đăng nhập mật khẩu.
5. Khóa local không thay thế mật khẩu, server session, RBAC, tenant isolation hoặc yêu cầu re-auth cho thao tác nhạy cảm. Không được mô tả nó là MFA/passkey/server authentication.

---

## 26. HỘP THƯ GÓP Ý VÀ ẨN DANH (ADR-086)

1. `admin` chỉ tiếp nhận/xử lý thư gửi tới `PARISH`; admin không có chức năng viết hoặc gửi thư góp ý. Backend phải trả 403 nếu admin gọi writer, dù UI đã ẩn.
2. `chunhiem|phuta` chỉ gửi góp ý lên Ban điều hành Xứ đoàn. `phuhuynh` gửi lên Xứ đoàn hoặc tới đúng tài khoản `chunhiem` được phân công lớp của ít nhất một người con đang liên kết với phụ huynh.
3. Người gửi chọn `PUBLIC` hoặc `ANONYMOUS`. Public lưu `sender_user_id` và người nhận thấy họ tên. Anonymous bắt buộc `sender_user_id IS NULL` bằng DB CHECK; không được lưu tên, role, lớp/con được chọn, phone, IP hoặc user-agent trong row thư.
4. Thư anonymous không tạo audit theo sender, không nằm trong sent-box và không được đưa vào offline queue/client persistence. Chỉ phản hồi xác nhận gửi thành công; không có receipt/reply token có thể nối ngược với tài khoản.
5. Admin đọc mọi thư `PARISH` cùng giáo xứ; `chunhiem` chỉ đọc thư `HOMEROOM_TEACHER` có `target_user_id` đúng tài khoản mình. `phuta|phuhuynh` không có inbox nhận.
6. Người nhận được chuyển `NEW → READ|ARCHIVED`; thay đổi trạng thái được audit theo người xử lý nhưng audit không sao chép subject/content hay sender của thư ẩn danh.
7. Request anonymous được log ứng dụng dưới path tổng quát và bỏ `userId`, `parishId`, IP, user-agent. Cam kết “admin không biết người gửi” áp dụng cho admin ứng dụng/Catevia; metadata transport do reverse proxy/cloud provider nằm ngoài database và quyền admin ứng dụng phải được công bố rõ.
8. Nội dung dài 10–5000 ký tự, tiêu đề 3–160 ký tự; mọi query/mutation scope bằng `parish_id`. Không có gửi anonymous public/không-auth vì eligibility và chống lạm dụng phải được giữ.

## 30. Ngân hàng câu hỏi, Ma trận đề và Smart Exam (ADR-096)

1. Câu hỏi thuộc đúng một `parish_id`; `branch_id` nếu có phải cùng giáo xứ. Kiểm tra này áp dụng bên trong transaction cho tạo mới, sửa phiên bản, import và tạo blueprint, không chỉ ở batch import. Cấp/lớp giáo lý, sách, chương, bài, chủ đề, độ khó và tag là metadata phiên bản, không được suy thành quan hệ lớp/năm học khi chưa có taxonomy chuẩn.
2. Trạng thái câu hỏi đi theo `DRAFT → IN_REVIEW → APPROVED → ACTIVE → ARCHIVED`. Tác giả staff chỉ sửa/gửi duyệt bản nháp do mình tạo; Admin duyệt, trả về, kích hoạt và lưu trữ. Chỉ `ACTIVE` được chọn để sinh đề.
3. Sửa câu hỏi luôn tạo `question_bank_versions` mới và đưa item về `DRAFT`; không update nội dung version cũ. Đề đã tạo giữ snapshot + hash của đúng version nên lịch sử chấm không đổi theo ngân hàng hiện tại.
4. Ngân hàng lưu được 7 loại câu hỏi; bản tích hợp Smart Exam đầu tiên chỉ materialize trắc nghiệm một đáp án và tự luận. Loại chưa hỗ trợ phải trả 422 rõ ràng. Trắc nghiệm dùng OMR phải đúng 4 lựa chọn A–D, một đáp án; mixed exam đặt toàn bộ trắc nghiệm trước tự luận.
5. Blueprint chỉ dùng câu `ACTIVE` và phải thỏa toàn bộ rule về loại, taxonomy, độ khó, tag, số lượng, điểm và khoảng tránh dùng gần đây. Thiếu bất kỳ rule nào thì rollback toàn bộ, trả `BLUEPRINT_SHORTAGE`, không tạo đề thiếu.
6. Sinh đề là một transaction server-authoritative bao trọn kiểm tra lớp/phân công, đọc blueprint + current ACTIVE versions, recent-use selection, tạo `exam_sessions`, snapshot nguồn, answer key, 1–8 manifest và audit rồi mới commit. Mỗi lệnh có `buildCommandId` + request hash; retry cùng command/payload trả đúng session đã commit, còn tái dùng command cho payload khác phải conflict. Khi caller không chỉ định seed, seed được derive ổn định từ command. Không được kiểm quyền hoặc chọn câu bên ngoài transaction làm nguồn quyết định. OMR/scoring/finalization tiếp tục dùng authority ADR-051/094, không đọc đáp án hiện tại từ Question Bank.
7. Staff phải có quyền với lớp đích tại thời điểm transaction sinh đề; parent không được truy cập module. Audit chỉ ghi hash, version, trạng thái và số lượng, không sao chép câu hỏi/đáp án/lời giải.
8. Authoring/review/blueprint/build cần mạng; offline chỉ đọc dữ liệu đã tải trong bộ nhớ UI. Sau khi đề được materialize, quy tắc offline hiện hữu của Exam vẫn giữ nguyên.

---

## 31. VẬN HÀNH SỰ KIỆN VÀ CÔNG VIỆC (ADR-110)

Giai đoạn nhiệm vụ (P2): tạo task nhận PREPARATION (mặc định), EXECUTION hoặc FOLLOW_UP. Dữ liệu cũ được backfill PREPARATION, không suy từ tên/hạn. Cổng READY/LIVE đòi PREPARATION bắt buộc hoàn tất theo các gate hiện có; EXECUTION/FOLLOW_UP bắt buộc cần OWNER đã nhận và còn tài khoản hợp lệ, không BLOCKED/CANCELLED, nhưng chưa cần DONE/checklist hoàn tất. Dependency/checklist của việc trong/sau được kiểm tra khi thực thi/hoàn tất, không giả định chúng phải kết thúc trước event. Cổng COMPLETED vẫn yêu cầu mọi task bắt buộc DONE. Phần trăm readiness chỉ tính công việc chuẩn bị và workstream bắt buộc, không có nghĩa toàn bộ event đã hoàn tất. API chưa hỗ trợ đổi phase sau khi tạo.

Điều kiện đóng sự kiện thủ công: LIVE → COMPLETED yêu cầu tổng kết và mọi task bắt buộc chưa xóa của event phải DONE. Task CANCELLED vẫn là chưa hoàn tất cho cổng này; readiness override không cấp quyền bỏ qua closure. Kiểm tra task và cập nhật event nằm cùng transaction. Riêng worker đến `ends_at` phải tự chuyển COMPLETED, ghi số task/checklist chưa xong vào outcome/audit và giữ nguyên trạng thái công việc; đây là ghi nhận sự kiện đã kết thúc ngoài đời, không phải xác nhận mọi việc đã hoàn tất.

Approval workflow retired (2026-09-12, product decision): task/workstream không còn role APPROVER, route `/approve`, hàng chờ duyệt hay trạng thái `approvalStatus` — DONE chỉ còn gate dependency + checklist bắt buộc. Lịch sử duyệt cũ vẫn ở audit, không xóa. Migration `20260912-260` từ chối chạy khi còn review PENDING live để operator xử lý trước (không tự quyết hộ).

1. `operation_events` là command aggregate và nơi duy nhất tạo/sửa/hủy sự kiện. `parish_events` là read projection công khai do Operations quản lý, không phải writer/source nghiệp vụ độc lập. DRAFT chỉ creator và non-production admin override được đọc, kể cả đã chỉ định organizer/assignee; DRAFT không có calendar projection hay notification. Khi vào PLANNING, `PUBLIC_SUMMARY` có đúng một projection cùng giáo xứ do server sinh còn `INTERNAL` không có projection. Client không được chọn/sửa `sourceParishEventId`. Lùi về DRAFT gỡ projection nhưng không tuyên bố thu hồi notification đã gửi. Không được làm lộ task, assignee, comment, readiness, hậu kiểm hoặc audit qua API lịch.
2. `users.role` chỉ là account baseline. Trưởng Xứ đoàn, Trưởng ngành và Trưởng ban là vị trí tổ chức đang hiệu lực, lấy từ person + service term `position_code` + phạm vi cây đơn vị; `position_title` chỉ là nhãn hiển thị và không tự cấp quyền. Code phải khớp loại unit (`PARISH_LEADER|PARISH_SECRETARY|PARISH_DEPUTY↔BOARD/toàn xứ`, `BRANCH_LEADER|BRANCH_DEPUTY↔BRANCH`, `COMMITTEE_LEADER|COMMITTEE_DEPUTY↔COMMITTEE`). `BRANCH_LEADER` và `COMMITTEE_LEADER` có cùng cấp capability nhưng hai scope độc lập; một người kiêm nhiệm phải có hai term hiện hành. Service term thông thường chỉ xác định membership/candidate scope, không tự cấp quyền xem hoặc bình luận tài nguyên Operations. Thủ quỹ và Ủy viên là chức vụ tổ chức chính thức nhưng không tự có quyền Operations; quyền chỉ phát sinh từ capability được duyệt hoặc role event/workstream/task cụ thể. Thư ký Xứ đoàn và Phó Xứ đoàn (`PARISH_SECRETARY|PARISH_DEPUTY`) được tạo sự kiện Xứ đoàn với organizer bắt buộc là Xứ đoàn trưởng đang đương nhiệm (creator giữ toàn quyền trên event mình tạo qua creator role). Thư ký ngoài ra chỉ đọc toàn xứ: không tạo Event chuyên môn, không manage/assign event của người khác. Phó Xứ đoàn giữ diện văn phòng xứ. Phó Ban/Phó Ngành (`BRANCH_DEPUTY|COMMITTEE_DEPUTY`) được tạo sự kiện chuyên môn và standalone task trong đúng unit mình với organizer bắt buộc là Trưởng Ban/Trưởng Ngành tương ứng, nhưng không được làm WORKSTREAM_LEAD. Event có `eventScopeType` riêng (`XU_DOAN↔scopeUnitId NULL`, `UNIT↔scopeUnitId NOT NULL`), không dùng `eventType` nội dung để biểu diễn phạm vi. Creator (người thao tác) và Organizer (người chịu trách nhiệm) là hai khái niệm khác nhau và server enforce quan hệ trên, không suy diễn creator thành organizer. Trưởng Xứ đoàn chỉ được đứng tên organizer event Xứ đoàn, không đứng tên event chuyên môn Ban/Ngành (tạo/đổi organizer sang chính mình bị `ORGANIZER_MUST_BE_UNIT_LEADER`); Trưởng Xứ đoàn vẫn được tạo event chuyên môn khi chỉ định đúng Trưởng unit phụ trách. Event organizer, workstream lead/member và task assignment là vai trò vận hành gắn resource. Không thêm các chức danh này vào enum account role.
3. Technical admin có parish-wide mutation override trên Operations theo quyết định O2 đã duyệt (mọi môi trường), trừ `operations.task.execute` vẫn yêu cầu assignment đã ACCEPTED của chính actor; kiểm soát dựa vào quản trị tài khoản admin và audit đầy đủ, không dựa vào ẩn UI. Admin không tự trở thành người thực thi task hoặc kế thừa quyền tổ chức từ person liên kết. Assignment `PENDING|DECLINED` chỉ giữ quyền xem/bình luận cần thiết cho acknowledgement; chỉ `OWNER|CONTRIBUTOR` đã `ACCEPTED` được transition task (đổi trạng thái — `operations.task.execute`, không có đường vòng qua manage). Riêng tick checklist cho phép thêm người giữ `operations.task.manage` trên đúng resource (quyết định nới theo implementation 2026-09-16: workstream lead tick hộ khi thực hiện thay, vẫn OCC + audit cùng transaction; transition không được nới tương tự). Workstream lead quản lý workstream/task thuộc phạm vi nhưng không được bổ nhiệm một Workstream Lead khác, transition hoặc override toàn event. Mọi operational actor/recipient trực tiếp phải có account ACTIVE, chưa xóa thuộc staff baseline; parent account không trở thành Operations actor chỉ vì được chọn làm target.
4. Task có tối đa một OWNER active và có thể có nhiều CONTRIBUTOR. Workstream member chỉ có `WORKSTREAM_LEAD` hoặc `OBSERVER`. Phân công OWNER mới có thể dùng một lời mời người chính và tối đa một người dự bị với hạn nhận việc do manager chọn. Ở DRAFT chỉ lưu `SCHEDULED`; vào PLANNING mới gửi người chính. Nếu chưa ai nhận, dự bị được mời khi đã dùng 70% khoảng từ lúc gửi chính thực tế đến hạn. Chỉ target đã được mời mới được nhận; CAS server bảo đảm người nhận hợp lệ đầu tiên tạo đúng một OWNER `ACCEPTED`, lời mời còn lại hết hiệu lực. Không được dùng endpoint assign OWNER trực tiếp để đi vòng dispatch đang mở; DRAFT/event terminal không nhận lời mời và task/event terminal phải đóng dispatch mở. User hoặc person là đúng một target; person chưa liên kết account có thể là planning record nhưng không hành động, nhận push hoặc thỏa readiness. Person đã liên kết chỉ actionable khi account đó ACTIVE, chưa xóa và thuộc staff baseline. Revoke assignment/membership là soft removal có reason, OCC và audit trước khi cấp người thay thế. Chỉnh validity membership chỉ được đổi `starts_at/ends_at`, bắt buộc reason và OCC trên cả workstream lẫn membership; đổi role/target phải revoke/replace, không sửa ngược lịch sử. Khi event đang `LIVE`, không được thêm/gỡ/làm hết hạn `WORKSTREAM_LEAD` bằng command membership rời rạc. Phải dùng command bàn giao nguyên tử có reason, aggregate/member OCC, idempotency và audit; người mới phải actionable và còn nằm trong phạm vi tổ chức của người giao. Nếu nhóm phát sinh khi LIVE chưa có lead, cùng command hẹp này được phép bổ nhiệm lead đầu tiên mà không mở lại các mutation cấu hình khác.
5. Mọi mutation yêu cầu idempotency key, OCC version khi aggregate thay đổi, audit cùng transaction và predicate `parish_id`. Reuse key khác payload trả conflict; stale version không được commit một phần.
6. Chuỗi event là `DRAFT → PLANNING → PREPARING → READY → LIVE → COMPLETED`; chuyển tay và lùi chỉ từng bước. Lùi bắt buộc lý do/audit, giữ task/acknowledgement và tạm dừng bền vững auto LIVE/COMPLETED cho đến khi manager resume. `COMPLETED` là trạng thái cuối, không lùi/mở lại bằng transition (kể cả có lý do — `409 EVENT_COMPLETED_TERMINAL`); đúc kết và việc tiếp nối sau hoàn tất đi bằng command riêng (retrospective/follow-up), không phải transition ngược. Đến `starts_at`, worker tự LIVE kể cả chưa READY và ghi missed-readiness; đến `ends_at`, worker tự COMPLETED như quy tắc đóng tự động ở trên. Task DONE bị chặn khi dependency chưa xong hoặc checklist required chưa xong. Readiness chỉ coi task/workstream có OWNER/LEAD khi target còn actionable; OWNER đang chờ, đã từ chối, bị khóa hoặc không còn staff baseline vẫn là blocker. BLOCKED/CANCELLED/override readiness phải có lý do theo endpoint và cancellation reason có trigger DB. Task required ở trạng thái CANCELLED vẫn chặn event READY; chuyển READY/LIVE thủ công phải tính lại blockers. Task `DONE|CANCELLED` không nhận thay đổi structure/assignment/checklist/dependency; event fields bất biến từ `LIVE`, và event `COMPLETED|CANCELLED` không nhận planning child mới. Hoàn thành sở hữu một `completion_record_id`; reopen rồi complete lại cập nhật đúng artifact Operations, không suy uniqueness từ soft `source_event_id` và không copy nội dung vận hành riêng tư.
7. Reminder dedupe theo parish + target + recipient + kind + trigger và dùng notification ID xác định từ reminder ID. Lịch có `version` monotonic; reschedule chỉ áp dụng PENDING, cần expectedVersion + trigger mới + lý do và không đổi recipient/resource. Cancel cũng cần expectedVersion; client cũ thiếu version bị từ chối. Reschedule/cancel/enqueue/terminalization dùng tenant + id + status + version CAS và audit/receipt; read state độc lập, không tăng version lịch gửi. Worker phải đọc lại triggerAt/nextAttemptAt đến hạn trong transaction ngay trước enqueue, nên candidate lấy từ lịch cũ không được gửi sớm sau khi dời. `ENQUEUED` chỉ có nghĩa durable notification row đã được ghi; chỉ khi ít nhất một endpoint provider nhận thành công mới chuyển `SENT`. Quyền xem resource và account staff của recipient phải được kiểm khi tạo và kiểm lại khi đến hạn; mất quyền hoặc resource đã terminal thì fail terminal trước enqueue. External body là thông báo chung, không chứa task/event title. Trước provider delivery phải kiểm lại targeted user còn ACTIVE, chưa xóa và đúng parish; không còn endpoint khả dụng, queue row mất/không xác định hoặc target cũ thiếu/hỏng phải fail terminal, không tự tạo một delivery mới hay broadcast. Inbox read state không đổi delivery/task state.
8. Operations MVP là online-first: mutation chỉ cập nhật UI sau server acknowledgement. Offline phải disable write và báo cần kết nối; không optimistic success. Offline cache/mutation riêng chỉ được triển khai sau ADR về mã hóa, actor scope, remap, ordering, receipts và conflict.
9. Mọi instant đầu vào có offset phải được canonicalize thành UTC ISO trước persistence/so sánh; timezone của event phải là IANA hợp lệ và được giữ riêng để hiển thị/tính ngày dân sự. Khi event hoàn tất tạo Parish Memory `ACTIVITY`, `occurred_on/ended_on` phải được suy từ instant theo timezone của chính event, không cắt ngày UTC. Quyền local của organizer/workstream không đủ để đổi scope, organizer hoặc public calendar boundary; thay đổi authority-bearing phải có organizational create authority ở scope đích. Khi caller cung cấp nhiều resource ID, chúng phải thuộc cùng event/workstream/task graph; mismatch phải fail closed trước khi ghép operational roles.
10. List authorization phải fail closed theo từng resource nhưng lỗi query/infrastructure phải nổi thành request failure, không được bị nuốt và trả danh sách thiếu như dữ liệu hợp lệ. Pagination/retention chỉ được đặt sau khi có contract và baseline; không dùng một ngưỡng tùy ý để thay invariant security/integrity.
11. Trưởng ngành và Trưởng ban chỉ được giao task, bàn giao OWNER, chỉ định organizer hoặc thêm thành viên workstream cho person có `parish_service_terms` đang hiệu lực trong chính unit họ phụ trách hoặc đơn vị con của unit đó. Picker phải dùng directory tối thiểu theo resource, nhưng command server vẫn kiểm tra lại target trong transaction. Trưởng Xứ đoàn và Phó Xứ đoàn có phạm vi toàn xứ cho cấu hình Event/Field; Thư ký chỉ đọc toàn xứ và hành động trên event/task mình tạo. WORKSTREAM_LEAD của Field phải là Trưởng Ban/Trưởng Ngành đang đương nhiệm đúng `sourceUnitId` của Field (Phó, member thường, Trưởng đơn vị khác và Xứ đoàn trưởng đều bị từ chối `WORKSTREAM_LEAD_OUTSIDE_UNIT`), và Field trong sự kiện Xứ đoàn bắt buộc có `sourceUnitId`. Sự kiện chuyên môn (`UNIT`) phải thuộc đúng unit của người tạo (trừ Trưởng Xứ đoàn và admin; Phó Xứ đoàn/Thư ký chỉ tạo Event Xứ đoàn nên tạo chuyên môn luôn bị từ chối). Task độc lập mang `scopeUnitId` của Ban/Ngành sở hữu; standalone thiếu scope bị từ chối trừ đường tương thích admin cho dữ liệu cũ. Event organizer/Workstream Lead không được dùng vai trò resource để kéo người ngoài `scope_unit_id/source_unit_id`; resource không có unit được hiểu là phạm vi toàn xứ đoàn và chỉ actor đã có quyền trên resource đó mới được phân công. Person chưa liên kết account có thể được ghi như planning-only nếu thuộc scope, nhưng không thể hành động hoặc thỏa readiness.
12. Blockout là lịch bận riêng của user/person, không phải ca phục vụ. Chủ nhân được list/sửa/thu hồi bằng `version`; edit/revoke dùng receipt, OCC và soft delete. Admin không có self-service read/edit đối với blockout của người khác. Lý do đầy đủ chỉ trả trong `/blockouts/mine`; assignment/handover warning và audit không được sao chép lý do riêng tư. Task có thể khai báo đủ cặp `scheduled_start_at/scheduled_end_at`; server dùng overlap nửa mở (`blockout.start < shift.end && blockout.end > shift.start`) để cảnh báo chính xác và không coi hai ca giáp nhau là trùng. Task cũ chỉ có deadline dùng point fallback end-exclusive; cảnh báo không tự từ chối phân công.
13. Đánh giá có cấu trúc là phần riêng sau `COMPLETED`, bản ghi 1:1 tenant-scoped giữ `lessons_learned`, `improvement_notes` và `version`; sửa bằng OCC, receipt và audit chỉ ghi metadata, không sao chép nội dung vào audit. Không yêu cầu đánh giá trước khi hoàn thành. Chuyển hoàn thành thủ công yêu cầu `outcome_summary` và mọi task required đều DONE; tự hoàn thành theo giờ ghi rõ việc chưa xong như rule 6. `outcome_summary` không bị thay bằng retrospective. Việc cải tiến cần theo dõi chỉ được tạo sau `COMPLETED` qua command follow-up nguyên tử: target là staff actionable trong đúng phạm vi Ban/Ngành, task phase `FOLLOW_UP` và đúng một OWNER `PENDING` được insert cùng transaction với CAS event. Hạn follow-up là bắt buộc; warning lịch bận không trả lý do riêng tư. Command này là ngoại lệ hẹp cho planning-child immutability sau completion; generic create task trên event đã đóng vẫn bị từ chối.
14. Task `CANCELLED` không được tự coi là hoàn tất và không có closure override. Người có `operations.task.manage` trên đúng resource được khôi phục task về `TODO` bằng command riêng, bắt buộc reason, current version, receipt và audit trong cùng transaction. Command chỉ nhận task đang `CANCELLED`, xóa trạng thái/lý do cancellation, blocked, started và completion hiện hành, tăng version và bị từ chối khi event cha đã `COMPLETED|CANCELLED`. Phân công/checklist/dependency cũ vẫn là lịch sử hiện hành; reminder đã hủy hoặc terminal không tự sống lại. Readiness/closure được tính lại từ dữ liệu sau khôi phục.
15. Mẫu sự kiện là snapshot nội dung có phiên bản bất biến và phạm vi tổ chức, không phải nguồn lịch thứ hai. Mỗi content version chỉ copy metadata sự kiện, task chưa hủy, phase/priority/required/approval requirement, deadline/ca tương đối theo giờ bắt đầu và checklist; không copy assignee, acknowledgement, approval result, attendance, comment, dependency, workstream, receipt hoặc reminder. Tạo/version hóa/instantiate phải có `operations.event.create` ở scope của mẫu; source event được scope đúng bằng `eventId` nên DRAFT chỉ creator/admin được snapshot (quyền cùng scope không đủ — hardening 2026-09-16); source event, monotonic family version và latest content version dùng OCC, mutation dùng receipt/audit. Instantiate exact content version tạo nguyên tử event `DRAFT`, task `TODO`, checklist chưa hoàn tất và không có assignee. Nếu chọn `PUBLIC_SUMMARY`, caller còn phải có capability riêng `operations.event.publish_public`, hiện chỉ cấp cho Trưởng Xứ đoàn, nhưng DRAFT vẫn chưa tạo calendar/notification; projection và durable parent notification chỉ sinh khi event vào PLANNING. Client không truyền calendar source. Hủy event public cũng cần capability này vì hủy sẽ tắt projection trên Lịch; quyền cancel của Organizer/unit leader không được dùng làm đường vòng. Phiên bản mới không sửa event đã sinh. Archive/restore template là thay đổi metadata có thể đảo ngược, bắt buộc reason, expected family version + latest content version, receipt, status CAS và audit; family version tăng ở create-version/archive/restore để command cũ không hợp lệ lại sau vòng trạng thái ABA. Chỉ người còn `operations.event.create` tại đúng scope được thực hiện. Mẫu archive bị loại khỏi catalog và không thể preview, tạo version hay instantiate, nhưng version/provenance cũ không bị xóa; restore chỉ bật lại đúng family hiện hữu. Mẫu nội dung curated chỉ được công bố sau pilot/duyệt nghiệp vụ; recurrence tự động không thuộc contract hiện tại.
16. `parish_service_terms.start_date/end_date` là ngày dân sự của giáo xứ, không phải instant UTC. Operations phải xác định nhiệm kỳ đang hiệu lực bằng ngày tại `PARISH_TIME_ZONE` do deployment server quản lý (mặc định `Asia/Ho_Chi_Minh`), dùng cùng một quy tắc cho quyền actor và phạm vi người được phân công. Không dùng ngày UTC hoặc timezone trình duyệt để cấp/thu quyền; timezone cấu hình sai phải làm startup fail trước HTTP/workers.
17. Tạo/sửa/xóa `parish_service_terms` là thay đổi authority-bearing: route chỉ cho admin, có rate limit, bắt buộc `adminPassword` và `authorityReason`; proof xác thực lại phải được kiểm tra lần nữa trong cùng DB transaction trước mutation. Mật khẩu không được ghi log/audit; audit chỉ ghi trường thay đổi và lý do. Admin không được tạo hoặc sửa service term cho person liên kết với chính tài khoản admin đó; bootstrap/thay Trưởng Xứ đoàn phải dựa trên quyết định ngoài hệ thống và do custodian khác nhập.


