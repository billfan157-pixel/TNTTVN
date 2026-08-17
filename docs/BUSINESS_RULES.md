# BUSINESS RULES - PARISH LMS v2.0

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

---

## 3. REPORTING

### 3.1 Architectural Classification
**Reporting is a Pure CQRS Read Model / Projection Subsystem.**
- 0 DB Mutations (`INSERT`, `UPDATE`, `DELETE` are strictly forbidden).
- 0 Write Aggregates, 0 Domain Events, 0 ACID Write Transactions.
- Pure SQL `SELECT` projections joining `students`, `grades`, `attendance`, `promotion_records`, `classes`, and `academic_years`.

### 3.2 MVP Report Projections
The Reporting subsystem defines 3 core MVP projections for parish administrators and catechists:

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

#### Projection 3: Parish Promotion & Attendance Statistics (`ParishSummaryProjection`)
- **Target**: Parish Administrator / Pastor high-level academic year report.
- **Fields**:
  - Total Students across all branches (Ấu Nhi, Thiếu Nhi, Nghĩa Sĩ, Hiệp Sĩ).
  - Branch-level promotion distribution (% Promoted, % Retained, % Graduated).
  - Parish-wide attendance health metrics.

### 3.3 Micro-Step Roadmap (R1 – R4)
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

### 4.5 Promote Year (Xét Lên Lớp)
Pre-conditions: status must be `FINALIZED` (403); already `PROMOTED` → 409.
- If next year does not exist → auto-copy (see 4.6).
- Per snapshot: `approvePromotion(...)` with `manualDecision = snapshot.promotionStatus` (lớp mapping by class `code`; class id = `<nextYearId>-<code>`), move student to next-year class.
- Summary: `total`, `movedToNextYear`, `retained` (RETAINED), `graduated` (GRADUATED/TRANSFERRED), `errors`.
- Partial success per student (ADR-008); set `status='PROMOTED'` + audit log.

### 4.6 Create / Copy Next Academic Year
`POST /api/academic-years/:id/copy` (idempotent; returns existing year with `copiedClasses=0` if present):
- Creates `academic_years` row (`OPEN`, `current_semester=1`, date range from `computeAcademicYearDateRange`).
- Copies **classes** (new ids, same `code`) and **assessments** (new `ASM-` ids, same weights).
- **NEVER copies** grades, attendance, reports, promotion_records, snapshots.

### 4.7 Archive Year (Lưu Trữ)
`POST /api/academic-years/:id/archive` — chỉ hợp lệ khi status = `PROMOTED` (403 nếu chưa xét lên lớp, 409 nếu đã ARCHIVED):
- Set `status='ARCHIVED'` + audit log. Dữ liệu (điểm, snapshot, promotion_records) được GIỮ để báo cáo lịch sử.
- Năm học đã lưu trữ KHÔNG được chọn làm năm học hiện tại; không còn thao tác khóa/chốt/xét lên lớp.

### 4.8 Onboarding Order Gates (Năm học → Lớp → Học sinh)
Quy trình sử dụng bắt buộc theo thứ tự: **tạo năm học → tạo lớp học → nhập danh sách học sinh**. Server là SSOT enforcement:
- `POST /api/classes` trả **409 `ACADEMIC_YEAR_REQUIRED`** nếu giáo xứ chưa có bất kỳ `academic_years` nào ("Vui lòng tạo năm học trước khi tạo lớp học").
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
- **Bị xóa (23 bảng nghiệp vụ)**: `students`, `grades`, `attendance`, `notices`, `academic_years`, `classes`, `catechist_assignments`, `notifications`, `import_batches`, `import_batch_students`, `grade_import_hashes`, `service_assignments`, `mapping_memory`, `grade_overrides`, `outbox_messages`, `semester_locks`, `academic_year_snapshots`, `promotion_records`, `attendance_sessions`, `assessments`, `exam_results`, `exam_sessions`, `refresh_tokens`. (SSOT: `PURGE_TABLES` — `server/src/services/purgeService.ts`.)
- **Giữ nguyên (7 bảng hệ thống)**: `users`, `branches`, `permissions`, `role_permissions`, `audit_logs`, `push_subscriptions`, `system_settings` (kể cả `purge_version` được tăng +1).
- Chỉ **DELETE rows** — cấm DROP bảng, cấm xóa function/trigger/schema.

### 9.2 Điều kiện thực hiện (hard gates)
1. Người thực hiện phải là **admin** (403 nếu không).
2. Phải nhập đúng **mật khẩu đăng nhập** của admin (bcrypt; sai → 401 `INVALID_PASSWORD`, KHÔNG xóa gì, không tăng version).
3. Phải gõ chính xác chuỗi xác nhận **`XÓA TẤT CẢ`** (sai → 400 `INVALID_CONFIRM_KEY`).
4. Giới hạn **10 lần/phút/IP** (`purgeRateLimiter`).

### 9.3 An toàn dữ liệu (bắt buộc)
- Trước khi xóa: snapshot v3.0 đủ 23 bảng + SHA256 checksum ghi vào `server/data/backups/safety/purge-safety-<parish>-<ts>.json` (override bằng env `SAFETY_BACKUP_DIR`, xem `docs/07_DATABASE_PLAN.md`).
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
- `FORCE_PASSWORD_CHANGE` → **bắt buộc đổi mật khẩu lần đầu**; middleware chỉ cho phép truy cập `/change-password`, `/profile`, `/me`, `/logout`, `/refresh`. Khi user đổi mật khẩu thành công → `ACTIVE` + `mustChangePassword=0` + `tokenVersion++`.
- `LOCKED` → khóa (thủ công hoặc tự động sau 5 lần sai); chặn login (`ACCOUNT_LOCKED` 403) và chặn mọi request (trừ super admin).
- Ai tạo trạng thái `FORCE_PASSWORD_CHANGE`: **tạo tài khoản mới** (`createUser`), **reset mật khẩu** (`resetUserPassword`), **admin đặt mật khẩu lại** (`admin-change-password` — `status: 'FORCE_PASSWORD_CHANGE'`).
- **Admin trưởng (superadmin, `SUPER_ADMIN_ID` mặc định `USR-001`)**: không bị khóa/LOCKED (miễn trừ duy nhất xuyên suốt — login, middleware, `verifyAdminReauth`), không bị admin khác reset/reveal/lock/logout (403). **TỰ đổi mật khẩu chính mình qua `admin-change-password` ĐƯỢC PHÉP** (A-NEW-41, 2026-08-12) — vẫn bắt buộc re-auth mật khẩu hiện tại của chính mình (A06) + rate limit + audit; admin KHÔNG phải Admin trưởng vẫn bị chặn (`403 FORBIDDEN`).

### 10.3 Khóa tự động (lockout)
- Sai mật khẩu 5 lần liên tiếp (user không phải admin) → `failedAttempts=5` → `status=LOCKED`. Login sau đó trả `403 ACCOUNT_LOCKED` bất kể mật khẩu đúng.
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

### 10.6 Thông báo — web push (SSOT: `server/src/services/webPushService.ts` + `notificationQueue.ts`)
- Mỗi smart notification (vắng học, phiếu điểm, nhắc lễ/nhắc lớp, tổng kết vắng, thông báo giáo xứ) gửi **CẢ telegram + web push** (trước đây 7 site hardcode chỉ telegram).
- Web push toàn giáo xứ qua `sendWebPushToParish` (SSOT, dùng chung cho `/notifications/send` và queue); web push **CÓ CHỦ ĐÍCH** qua `sendWebPushToUsers(parishId, userIds, payload)` — chỉ gửi tới subscriptions có `user_id` trong danh sách (không đụng sub `user_id = NULL`). `notifyParishNotice` dùng nhánh có chủ đích: khớp phụ huynh (`role = phuhuynh`, khớp `users.phone` ↔ `students.parentPhone` chuẩn hóa qua `phoneMatchVariants`, SSOT `CanAccessStudentSpecification`) và lọc theo `targetBranch` (chi đoàn của con; `All`/null = toàn giáo xứ) — thông báo nhắm một chi đoàn chỉ đến đúng phụ huynh chi đoàn đó. Subscription chết (HTTP 404/410) bị xóa khỏi DB; lỗi tạm thời giữ lại.
- Queue KHÔNG bao giờ đánh dấu `sent` nếu chưa gửi thật: VAPID chưa cấu hình → `failed` với lỗi `VAPID_NOT_CONFIGURED` (không retry vô ích). Item webpush có chủ đích persist danh sách userId vào `notifications.target_user_ids` (JSON, migration `20260808-082`) — recovery sau restart gửi lại ĐÚNG nhóm, không degrade thành broadcast (ADR-022).
- Client đăng ký nhận: sau login (hỏi permission 1 lần) → `PushManager.subscribe` với VAPID public key từ `GET /api/notifications/vapid-public-key` → lưu subscription; logout → unsubscribe. Cần HTTPS (secure context).

### 10.7 Nhắc Lễ Chủ Nhật tự động — `sundayReminderScheduler` (SSOT: `server/src/services/sundayReminderScheduler.ts`)
- **Giờ lễ KHÔNG hardcode**: `sundayMassTime` nằm trong parish settings (`GET/PUT /api/settings`, định dạng `HH:MM`, mặc định `08:00`). Client hiển thị qua `useSundayReminder` (đọc `settingsStore.settings.sundayMassTime`); server render template qua `getSundayMassTime(parishId)` (SSOT đọc `system_settings` key `parish_system_settings`, fallback `'08:00'`).
- **Scheduler** chạy trong tiến trình server (`initSundayReminderScheduler()` khởi động trong `server/src/index.ts`): check mỗi 60s, chỉ xử lý **Chúa Nhật** (`getDay() === 0`), cửa sổ gửi `[sundayMassTime, sundayMassTime + 120 phút]`.
- **Idempotent**: mỗi Chúa Nhật gửi đúng **1 lần** — marker `sunday_reminder_last_sent` (YYYY-MM-DD) trong `system_settings`; marker đã có cho ngày hôm nay → bỏ qua. Quá cửa sổ 2h → bỏ qua hôm đó (không gửi trễ, không gửi lại).
- Test: `server/src/__tests__/services/sundayReminderScheduler.test.ts` (mock `notifySundayMassReminder` + `getSundayMassTime`; `PARISH_ID` đọc tại module import nên set env trước `import()`).

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
- **Giao credential mới**: admin giao SĐT mới + mật khẩu tạm (đặt lại qua reset-password) cho phụ huynh qua kênh riêng; UI provision hỗ trợ "Sao Chép Tất Cả Credential" dạng văn bản.
### 10.12 Quên mật khẩu phụ huynh — Tự Phục Hồi & Hỗ Trợ Zalo (ADR-042, 2026-08-15)
- **Tầng 1: Tự phục hồi 24/7 (Self-Service)**: Phụ huynh tự đặt lại mật khẩu bằng cách xác minh đồng thời 2 yếu tố dữ liệu học sinh (`POST /api/auth/parent-reset-password`):
  1. **Số điện thoại phụ huynh**: Đúng format `^0\d{9}$` (đã đăng ký trong tài khoản role `phuhuynh`).
  2. **Thông tin xác minh con**: Ngày tháng năm sinh của con (`DD/MM/YYYY` hoặc `YYYY-MM-DD`) **VÀ** Tên Thánh / Họ tên của con (so khớp không dấu, không phân biệt hoa thường). Hỗ trợ gia đình có nhiều con (anh chị em ruột) — chỉ cần nhập đúng thông tin của bất kỳ người con nào.
- **Bảo mật**:
  - `parentForgotRateLimiter`: Tối đa 10 lần thử / 60s / IP.
  - *Timing-neutral*: Chạy `consumeDummyPassword()` với cost 12 khi SĐT không tồn tại hoặc dữ liệu con không khớp (chống timing enumeration).
  - Khi thành công: Băm `passwordHash` (bcrypt cost 12), xóa `passwordEncrypted` về `NULL`, tăng `tokenVersion` hủy toàn bộ phiên cũ, ghi audit log `PARENT_RESET_PASSWORD` che PII (chuẩn A16).
- **Tầng 2: Hỗ trợ Zalo 1-chạm**: Modal cung cấp tab "Nhắn Zalo Ban Giáo Lý" tự động tạo sẵn nội dung tin nhắn kèm SĐT phụ huynh để gửi qua Zalo cho GLV/Ban Giáo Lý cấp lại mật khẩu tạm.

### 10.13 Hai cổng đăng nhập — Phụ Huynh & Giáo Lý Viên/Nhân Sự (ADR-044, 2026-08-16)
- **2 cổng UI, chung 1 backend auth** (chỉ tách giao diện, KHÔNG tách endpoint/session/bảo mật):
  - `/login` — trang chọn cổng (chooser).
  - `/login/phuhuynh` — cổng Phụ Huynh: đăng nhập bằng **SĐT** (username phụ huynh = SĐT chuẩn hóa, quy ước §10.8) + mật khẩu; "Quên mật khẩu?" mở modal ADR-042 (§10.12 — tự đổi xác minh con / Zalo).
  - `/login/nhan-su` — cổng Giáo Lý Viên / Nhân Sự: đăng nhập bằng **tên đăng nhập** (prefix `glv_`/`cn_`/`ad_`, ADR-027) + mật khẩu; quên mật khẩu → liên hệ Quản Trị Viên / Ban Giáo Lý cấp mật khẩu tạm (admin flow, KHÔNG dùng luồng xác minh con).
- **1 tài khoản = 1 vai trò** (`users.role` enum — không đổi schema): người vừa là GLV vừa là phụ huynh dùng **2 tài khoản riêng** (nhân sự + phụ huynh qua Parent Provisioning ADR-026).
- **Role gate sau login**: đăng nhập cổng Phụ Huynh với tài khoản không phải `phuhuynh` (hoặc ngược lại) → hệ thống **tự logout** phiên vừa tạo + hiện thông báo chỉ đường sang cổng đúng. Không tồn tại session nhầm vai trò.
- **Backend bất biến**: `POST /api/auth/login` duy nhất cho mọi role; lockout/rate-limit/refresh rotation/audit giữ nguyên.
- **Local-storage policy (ADR-045, 2026-08-16)**: `parish_current_user` chỉ chứa **marker không-PII** `{id, role, parishId}` (guard đồng bộ); bản đầy đủ (username/fullName/phone — SĐT PH = username) ở snapshot `parish_auth_user` **mã hóa AES-256-GCM** trong IndexedDB (dexieStorage, tenant-scoped). Snapshot hỏng/thiếu → rebuild qua `GET /auth/me` khi online, offline → logout sạch. Ghi fail-safe: lỗi Dexie/crypto không làm hỏng login. Mọi đường session chết dọn cả marker lẫn snapshot.

---


## 11. RBAC & PHÂN QUYỀN (Permissions)

### 11.1 Quyền theo ROL (code-enforced) — SSOT
Quyền được kiểm tra **trong code** qua `roleMiddleware` + `checkUserClassAccess` (4 vai trò `admin` / `chunhiem` / `phuta` / `phuhuynh`). KHÔNG có bảng permission điều khiển tại runtime.

### 11.2 `permissions` / `role_permissions` — DEPRECATED
Bảng `permissions` và `role_permissions` tồn tại vật lý trong DB (giữ để tương thích purge + tài liệu schema) nhưng **KHÔNG được đọc bởi code nghiệp vụ** tại thời điểm hiện tại — mọi phân quyền phải implement trong middleware/route (SSOT), không dùng `role_permissions` để phân quyền runtime.

**Ngoại lệ duy nhất cho phép GHI (seed-time metadata)**: `server/src/seed.ts` là nơi duy nhất được insert vào 2 bảng này khi tạo DB mới (DB rỗng, chạy 1 lần). Danh sách permission trong seed **chỉ mang tính tài liệu/đối chiếu** — nó phản ánh đúng các quyền đã được enforce trong `roleMiddleware`, KHÔNG tự nó cấp quyền gì. Khi mở rộng `roleMiddleware` cho quyền mới:
- **BẮT BUỘC**: thêm quyền vào `roleMiddleware`/route (đây là SSOT thực thi).
- **Tùy chọn (khuyến nghị)**: thêm dòng tương ứng vào seed.ts để bảng metadata khớp với code — ghi ở đây KHÔNG thay thế việc mở rộng code, chỉ là phản ánh tài liệu.

Quy chiếu: quyền `exam.create`/`exam.delete` cho `phuta`/`chunhiem` (ADR-025) — enforced trong `server/src/routes/exams.ts` (roleMiddleware + checkUserClassAccess), seed.ts chỉ lưu metadata đối chiếu.

### 11.3 Phân công giáo lý viên vào lớp — SSOT là class-centric
- Source of truth = `catechist_assignments` (1 hàng = 1 user × 1 lớp, `roleInClass ∈ {'chunhiem','phuta'}`).
- **Quản lý phân công** (UI Settings → phân công giáo lý viên): dùng `POST /api/classes/:id/assignments` và `DELETE /api/classes/:id/assignments/:userId` (thêm/xóa từng lớp).
- `PUT /api/users/:id/assignments` (replace-toàn-bộ, `server/src/services/userService.ts::updateUserAssignments`) **được hỗ trợ** và vẫn được UI dùng (batch sync toàn bộ assignment của một user: thay đổi hàng mới + giữ `roleInClass` cũ qua `prevMap` + ghi audit `UPDATE_USER_ASSIGNMENTS`). Không deprecated. Lưu ý ngữ nghĩa **replace-toàn-bộ** — chỉ gọi khi có danh sách phân công đầy đủ, không gọi theo từng thay đổi nhỏ.
- Quy tắc: 1 lớp tối đa 1 chủ nhiệm; 1 user là chủ nhiệm của tối đa 1 lớp.

### 11.4 Bộ lọc học kỳ (RBAC semester gating)
- **Học kỳ đang mở** = `academic_years.current_semester` của năm học hoạt động (năm chưa Finalize, đang chứa ngày hiện tại; fallback năm chưa khóa mới nhất). Đây là SSOT duy nhất — do admin điều khiển qua "Bắt Đầu HK2" trong Quản Lý Năm Học.
- **Chỉ `admin`** được chuyển bộ lọc giữa HK1/HK2 (đọc cả hai học kỳ).
- **Tài khoản khác** (`chunhiem`/`phuta`/`phuhuynh`): bộ lọc bị khóa cứng ở học kỳ đang mở — UI không hiện nút chuyển học kỳ (hiển thị tĩnh) và **server bắt buộc**:
  - `GET /api/grades` với user không phải admin **luôn** trả đúng học kỳ đang mở, bất kể query param `semester` gửi lên (param bị bỏ qua).
  - Implementation: `AcademicYearLifecycleService.getOpenSemester(parishId)` (SSOT) + `routes/grades.ts` GET `/`.
- Client: `src/hooks/useSemesterAccess.ts` (`restricted`/`openSemester`/`ready`); `RootLayout` pin `selectedSemester` về học kỳ đang mở cho non-admin; 5 switcher UI (HeaderBar, DesktopGradeMatrix, DesktopDailyGradeEntry, MobileGradeView, MobileReportsView) hiển thị chip tĩnh khi restricted.

### 11.5 Bộ lọc phân ngành & lớp (RBAC class/branch gating)
- **Chỉ `admin`** được hiển thị & thao tác bộ lọc phân ngành (branch) và lớp học (class) trên toàn UI (desktop + mobile).
- **Tài khoản khác** (`chunhiem`/`phuta`/`phuhuynh`): bộ lọc lớp/phân ngành **bị ẩn hoàn toàn** khỏi UI — vì GLV chủ nhiệm/phụ tá chỉ được phân công 1 lớp duy nhất (SSOT `catechist_assignments`), nên không có nhu cầu chọn lớp.
- **Client bắt buộc giữ `selectedClassId`/`selectedBranchId = 'all'`** với non-admin: `RootLayout` tự reset về `'all'` nếu persist còn giữ giá trị cũ (tránh trạng thái danh sách trống rỗng). Dữ liệu hiển thị vẫn chính xác vì **server tự scope theo lớp phân công** (`getUserClassIds` — classes/students/grades/attendance/exams) — `'all'` ngầm định = "các lớp của tôi".
- UI hidden sites (7): DesktopSidebar (block "Bộ lọc phân ngành & lớp"), HeaderBar (class switcher), MobileTopBar ("Lớp đang xem"), MobileHomeView (chips lớp), MobileStudentsView (chips lớp), MobileGradeView (chips lớp), MobileAttendanceView (select lớp).
- **Phiên chấm bài (ExamSessionView)**: `chunhiem`/`phuta` chỉ tạo/xem/xóa phiên ở **lớp được phân công** (SSOT `catechist_assignments`). Khi bộ lọc ở chế độ "Tất cả các lớp" (`selectedClassId === null` hoặc `'all'`), client chuẩn hóa thành `null` và tải `GET /api/exams/my-classes`: admin thấy toàn bộ xứ đoàn, GLV chỉ thấy các lớp phân công. Danh sách kèm badge tên lớp trên từng thẻ phiên. Nút "Tạo Phiên Chấm" luôn khả dụng và cung cấp bộ chọn lớp trong form khi đang ở chế độ xem tất cả các lớp. (A-NEW-48 / ADR-025)
- **Tạo phiên chấm — quy tắc dữ liệu (EXAM-GAPS 2026-08-15)**: (1) Phiên trắc nghiệm **bắt buộc** có `questionCount` (1–50) + đáp án đủ cho toàn bộ câu hỏi — thiếu đáp án → OMR không chấm được câu đó; server validate format `answerKey` (JSON, key 1..N, giá trị A/B/C/D); (2) `academicYear` mặc định = **năm học đang hoạt động của giáo xứ** (không theo ngày hiện tại) — đảm bảo điểm finalize rơi đúng năm trên lưới điểm; (3) Tạo phiên trùng (draft cùng lớp + môn + loại điểm cùng học kỳ) → UI **cảnh báo xác nhận**, vẫn cho phép tạo (re-exam hợp lệ) — không chặn cứng; (4) Hoàn tất phiên khi còn học sinh chưa có điểm → UI cảnh báo danh sách/đếm trước khi đóng phiên; (5) Quét lại / nhập lại điểm 1 học sinh trong phiên draft = ghi đè kết quả cũ (UI hiện cảnh báo nếu khác điểm).
- **Re-score khi sửa answer key (ADR-043 2026-08-15)**: (1) Chỉ áp dụng cho phiên **draft** trắc nghiệm; (2) `PATCH /api/exams/:id/answer-key` cập nhật answer key + chấm lại điểm cho tất cả kết quả có source `qr_scan`/`omr` — kết quả `quick_entry` (nhập tay) **giữ nguyên**; (3) Điểm mới = `correctCount / totalQuestions × maxScore` (làm tròn 1 số thập phân, clamp ≤ maxScore) — câu bỏ trống = sai (không đếm vào correctCount nhưng vẫn nằm trong mẫu số); đồng nhất với frontend `omr.ts:275`; (4) UI hiển button "Chấm Lại Điểm" trong Answer Key Viewer modal, kèm confirm dialog trước khi thực hiện; (5) Kết quả hiển số kết quả đã chấm lại + số kết quả giữ nguyên.

## 12. ĐIỂM SỐ — NHẬP ĐIỂM HẰNG NGÀY (Daily Entry Scope)

### 12.1 Phạm vi Nhập Điểm Hằng Ngày (SSOT: `src/stores/dailyGradeStore.ts` + `src/types/index.ts` `DailyScoreType`)
- Nhập Điểm Hằng Ngày chỉ áp dụng cho **3 loại điểm nhập nhiều lần**: Điểm Miệng (`oral`), Điểm 15 Phút (`15m`), Điểm 1 Tiết (`1period`). Mỗi lần nhập = 1 `DailyGradeEntry`; điểm cột = **trung bình** các lần nhập (`_source: 'daily_avg'`, làm tròn 1 số thập phân — `getAverageForStudent`).
- **Giữa Kỳ (`midterm`) & Cuối Kỳ (`final`) KHÔNG qua daily entry**: mỗi học kỳ chỉ có 1 điểm duy nhất cho mỗi loại, nhập trực tiếp qua Ma Trận/Thẻ Điểm (manual) hoặc Import Excel (`excel_import`). UI daily entry không hiển thị tab Giữa Kỳ/Cuối Kỳ; store chặn ở type-level (`DailyScoreType`).
- **Dữ liệu cũ**: daily entry loại `midterm`/`final` có trước quy tắc này (nếu còn trong Dexie) ngừng ảnh hưởng tới `syncAllToGradeStore`; giá trị đã sync vào `GradeRecord` giữ nguyên theo source cũ.

### 12.2 Nguồn điểm & xung đột (SSOT: `dailyGradeStore.syncAllToGradeStore`)
- `manual` và `override` là nguồn cao nhất: `daily_avg` **không bao giờ ghi đè** field đang có `_source: 'manual'` hoặc `'override'` — chỉ khi `_source` là `daily_avg`/`excel_import`/null thì TB hằng ngày mới được áp dụng.
- Ghi đè điểm đã nhập tay phải đi qua luồng Override chính thức (audit `grade_overrides` + lý do), không ghi đè trực tiếp.



### 12.3 Khôi phục (undo) đợt nhập điểm — ADR-028 (2026-08-12)
- **Phạm vi**: chỉ undo **đợt import điểm** (Excel/dán bảng), không undo nhập tay từng ô. Client lưu snapshot đợt nhập gần nhất (localStorage `gradeImportSnapshot`) và hiện nút "Hoàn Tác Đợt Nhập Trước" khi còn hạn.
- **Cửa sổ thời gian**: **7 ngày** kể từ lần ghi điểm gần nhất của từng bảng điểm (`UNDO_GRADE_WINDOW_DAYS`). Hết hạn → từ chối với status `expired`.
- **Quyền**: `admin` (toàn giáo xứ) và `chunhiem` (chỉ lớp được bổ nhiệm — `checkUserClassAccess` trong cùng transaction, ADR-016 S24). Học kỳ đã khóa sổ → không undo được (status `locked`).
- **Cơ chế** (audit-as-SSOT): với mỗi bảng điểm trong đợt, lấy audit entry mới nhất (`entityType='grade'`):
  - `CREATE` → xóa bảng điểm mới tạo (kèm `grade_overrides`).
  - `UPDATE` → khôi phục các cột về `oldValue` (trạng thái trước import), version +1.
  - Entry mới nhất KHÔNG phải CREATE/UPDATE (VD: đã undo trước đó, hoặc thao tác khác) → **từ chối** (`not-clean`): không được phép undo 2 lần, không mất sửa tay sau import.
- **Audit**: mỗi bảng điểm được undo ghi 1 dòng `GRADE_UNDO` vào nhật ký hệ thống (trạng thái trước/sau).
- **Offline**: undo cần kết nối mạng (thao tác server-side); sau undo client refetch lại điểm từ server.

## 16. UI CHUẨN — KÍCH THƯỚC CHỮ TRONG BẢNG (A-NEW-49)

- **SSOT chuẩn**: bảng danh sách thiếu nhi `src/components/desktop/DesktopStudentList.tsx`.
- **Quy ước**: header bảng (`<th>`) = `text-xs`; cell dữ liệu (`<td>`) = `text-sm`; tên chính (cột nhận diện — Họ Tên / Tên Lớp / fullName) = `text-base`; badge/tag nhỏ = `text-xs`.
- **Cấm** `text-[10px]` / `text-[11px]` / `text-lg` trong cell dữ liệu — chỉ dùng cho chú thích phụ ngoài bảng (legend) và badge.
- **Đã đồng bộ (2026-08-13)**: DesktopClasses, DesktopNotices, DesktopAttendanceGrid, DesktopDailyGradeEntry, DesktopGradeComparison, DesktopGradeMatrix (header 10px→xs), UserManagementPage, ExamResultsTable, QuickScoreEntry.
- Bảng preview import (ExcelImportModal / ExcelGradeImportModal) và phiếu in (StudentReportModal) giữ nguyên — modal chuyên dụng.



### 14. Nhật Ký Hoạt Động & Đồng Bộ Tức Thì (AUDIT-SYNC-01)
- Mọi thao tác ghi dữ liệu (Điểm số, Điểm danh, Thiếu nhi, Lớp học, Kỳ thi, Tài khoản, Cấu hình hệ thống, Đăng nhập, Telegram phụ huynh) BẮT BUỘC phải được ghi nhận vào bảng `audit_logs` trên máy chủ.
- Mọi store phía client (`gradeStore`, `attendanceStore`, `studentStore`, v.v.) sau khi ghi hàng đợi Dexie BẮT BUỘC phải gọi `triggerSyncFlow()` ngay lập tức để chuyển dữ liệu lên máy chủ và hiển thị tức thời trong Nhật Ký Hoạt Động.
- **Trang Nhật Ký Hệ Thống (`/audit-logs`, admin-only)** có 2 tab (2026-08-17, gộp từ trang `/policy-dashboard`): (1) **Toàn Bộ Nhật Ký** — toàn bộ `audit_logs` với filter action/entity + diff raw; (2) **Chính Sách & Tác Động** — subset policy (ADR-047) qua `/api/audit-logs/policy-history`: KPI 4 loại (Cập nhật chính sách / Ghi đè điểm / Xét lên / Khóa sổ điểm), filter theo loại, timeline enriched tên học sinh + tác động GPA (policy version traceability).

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
- Khi GLV hoặc Admin chấp thuận đơn (`status = 'APPROVED'`):
  - Hệ thống tự động thực hiện thao tác upsert vào bảng `attendance` cho **tất cả các buổi** (`session_types`) được chọn trong ngày đó của thiếu nhi.
  - Trạng thái điểm danh được ghi: **`AbsentExcused`** (Vắng có phép).
  - Ghi chú điểm danh: **`[Đơn online] <lý do xin nghỉ của phụ huynh>`**.
  - Người cập nhật: ID của GLV/Admin đã duyệt đơn.
  - Bảng điểm danh (`DesktopAttendanceGrid`, `MobileAttendanceView`) sẽ tự động hiển thị badge **"Có phép online"** bên cạnh tên thiếu nhi.
- Nếu đơn bị từ chối (`status = 'REJECTED'`), không thay đổi dữ liệu điểm danh và thông báo phản hồi được gửi tới phụ huynh.

### 17.4 Thông báo Phản Hồi (Telegram Notifications & Audit Log)
- Mọi thao tác Nộp đơn (`CREATE_LEAVE_REQUEST`), Duyệt/Từ chối (`REVIEW_LEAVE_REQUEST`), và Hủy đơn (`CANCEL_LEAVE_REQUEST`) đều được lưu vết đầy đủ trong `audit_logs`.
- Nếu phụ huynh đã kết nối bot Telegram, hệ thống sẽ tự động gửi tin nhắn báo kết quả duyệt đơn tức thì về Telegram của phụ huynh.

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
3. **Trang Lịch Toàn Diện (`/calendar`)**: Lưới lịch tháng/tuần, chấm màu phụng vụ, chi tiết phụng vụ và hỗ trợ quản lý Sự Kiện Xứ Đoàn:
   - **Thêm sự kiện**: Modal có bộ chọn ngày (`<input type="date">`, mặc định là ngày đang chọn trên lịch) cho phép tạo sự kiện ở bất kỳ ngày nào mà không cần chuyển ngày trước.
   - **Chỉnh sửa sự kiện**: Mỗi sự kiện xứ đoàn có nút sửa (bút chì) mở lại modal với dữ liệu sẵn (ngày, tên, loại, thời gian, địa điểm) để cập nhật.
   - **Lưu trữ cục bộ (Offline)**: Sự kiện xứ đoàn được lưu `localStorage` (key `parish_calendar_events_v1`) — tồn tại qua các lần tải lại trang và được nhúng vào file `.ics` khi xuất lịch.
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
3. **Giới Hạn & Ràng Buộc**:
   - Tự động đồng bộ số câu `questionCount` (tối đa 50 câu) và bảng đáp án `answerKey` vào phiên chấm bài.

### 21.2 Bản In Đề Thi A4 Chuẩn Nhà Xứ (`src/utils/examSheets.ts` - `buildExamPaperHtml`)
- **Nhận diện Giáo Xứ**: Header trang trọng gồm Giáo phận, Giáo xứ, Xứ đoàn TNTT, Tên lớp, Niên khóa, Tên bài kiểm tra và thời gian làm bài.
- **Bố Cục Trang In A4**:
  - Tùy chọn 2 cột (tiết kiệm giấy A4) hoặc 1 cột.
  - Khung thông tin học sinh (Họ tên, Tên thánh, Mã số) và ô chấm điểm / lời phê của GLV.
  - Tùy chọn in kèm hoặc ẩn Bảng Đáp Án (đề thi cho học sinh vs. đáp án chấm cho Ban Giáo Lý).
- **Tính Đồng Bộ OMR**: Đề thi và Phiếu trả lời OMR in từ hệ thống tương thích tuyệt đối về số lượng câu hỏi và mã phiên chấm. QR định danh dùng `viewBox` đúng số module của payload và ô in 112px; không được ép vào `37×37` hoặc giảm kích thước đến mức camera không đọc được.

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

### 22.4 Chứng Từ & Bản In Phiếu Thu / Phiếu Chi Chuẩn A5/A4
1. **Chuyển Đổi Số Tiền Thành Chữ**:
   - Tự động chuyển đổi số tiền VND sang chữ tiếng Việt chuẩn xác theo quy chuẩn kế toán (VD: `150.000đ` $\rightarrow$ *"Một trăm năm mươi nghìn đồng chẵn."*).
2. **Bản In Chuẩn Mực Nhà Xứ**:
   - Sinh Phiếu Thu / Phiếu Chi trang trọng chuẩn nhận diện Xứ Đoàn với 4 chữ ký: Cha Tuyên Úy, Xứ Đoàn Trưởng, Thủ Quỹ, và Người nộp/nhận tiền.

---

## 23. QUY TẮC TOÀN VẸN DỮ LIỆU & KIỂM SOÁT ĐỒNG BỘ NÂNG CAO (ADR-041)

### 23.1 Tính Nguyên Tử Trong Duyệt Đơn Nghỉ Phép (Atomic Leave Approval)
- Khi Ban Giáo Lý hoặc Admin duyệt (`APPROVED`) đơn xin nghỉ phép của phụ huynh:
  - Cập nhật trạng thái đơn thành `APPROVED` và ghi nhận trạng thái điểm danh `AbsentExcused` (kèm ghi chú `[Đơn online] <lý do>`) **BẮT BUỘC** nằm trong cùng một Database Transaction.
  - Nếu việc ghi nhận điểm danh thất bại, toàn bộ thao tác duyệt đơn bị hủy bỏ (Rollback), đảm bảo trạng thái hiển thị của đơn và sổ điểm danh luôn đồng nhất 100%.

### 23.2 Kiểm Soát Trùng Lặp Nội Bộ Khi Nhập Danh Sách (Intra-File Duplicate Protection)
- Trong quá trình Import Excel danh sách học sinh:
  - Hệ thống thực hiện kiểm tra 2 lớp:
    1. **Lớp 1 (Nội bộ file)**: Phát hiện các dòng trùng lặp `(Họ và tên chuẩn hóa, Ngày sinh)` ngay trong cùng một file Excel tải lên, gắn cờ `intra-file` cảnh báo người dùng.
    2. **Lớp 2 (Cơ sở dữ liệu)**: Đối chiếu với CSDL hiện tại để phân biệt anh chị em cùng số điện thoại (IE-01) hoặc học sinh trùng tên khác ngày sinh (IE-02).

### 23.3 Quy Chuẩn Đánh Số Phiếu Thu / Chi Tuần Tự (Sequential Voucher Numbering)
- Số phiếu thu (`PT-YYYY-XXXX`) và phiếu chi (`PC-YYYY-XXXX`) được sinh tuần tự tăng dần dựa trên dữ liệu thực tế của từng năm trong CSDL (bắt đầu từ `0001`), không sử dụng số ngẫu nhiên nhằm đảm bảo tính duy nhất và tính liên tục của sổ sách kế toán Xứ Đoàn.


