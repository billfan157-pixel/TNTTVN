# FRONTEND API CONTRACT & INTEGRATION SPECIFICATION - PARISH LMS v2.0

## Academic organization projection — 2026-09-10

`POST /parish-profile/organization/refresh` cho staff đã xác thực, không nhận
structure/personnel payload: chỉ đồng bộ BOARD mặc định, Ngành catalog và Chi
đoàn từ lớp trong parish JWT, ghi audit khi có thay đổi rồi trả snapshot theo
visibility của actor. GET snapshot không ghi. Client profile gọi POST khi tải.
Unit response bổ sung `managedByAcademic`, `sourceClassId`, `academicYearId`,
`chapterLeaderName`; tên trưởng lấy assignment chủ nhiệm của lớp, không suy từ
account role. Client lọc năm học; dữ liệu không realtime. Unit tự động không
được sửa/xóa qua unit API. POST tạo thủ công chỉ chấp nhận COMMITTEE/OTHER.

> **Policy supersession — 2026-09-10, được chủ sản phẩm phê duyệt:** Admin có
> quyền quản trị toàn giáo xứ trong mọi môi trường, kể cả production; được tạo/sửa
> nhiệm kỳ cho chính mình. Các mô tả admin production read-only, cấm self-grant
> hoặc override chỉ dev/test bên dưới đã bị thay thế. Biến legacy
> `OPERATIONS_ADMIN_MUTATION_OVERRIDE` không còn giới hạn quyền. Vẫn bắt buộc
> reauth + lý do + audit cho nhiệm kỳ; không bỏ tenant isolation, OCC, idempotency,
> kiểm tra phạm vi dữ liệu, trạng thái đóng việc hoặc separation of duty.

Document Status: **APPROVED**  
Architecture Lead: Chief Architect & AI Pair Programming Agent  
Last Updated: 2026-08-14  

---

## 1. FRONTEND CLEAN ARCHITECTURE
All frontend components MUST adhere to the multi-tier data flow:

```text
UI Components (Thin Renderers)
       │
       ▼
React Custom Hooks (useAuth, useSyncEngine, useSundayReminder, useOnlineStatus)
       │
       ▼
Zustand State Stores (promotionStore, attendanceStore, studentStore)
       │
       ▼
API Domain Clients (lib/api/academicYears.ts, lib/api/semesterLocks.ts, lib/api/promotion.ts, lib/api/attendance.ts)
       │
       ▼
HTTP Transport Client (lib/api.ts)
       │
       ▼
Backend REST Endpoints (/api/promotion/*, /api/attendance/*, /api/reports/*)
```

---

## 2. STANDARDIZED API RESPONSE FORMATS

### Academic scope-aware pull (XD-06, 2026-09-07)

`GET /api/grades?includeScope=true` and `GET /api/attendance?includeScope=true` return the standard success envelope with `data: { records, mode: 'full' | 'delta', scope: { studentIds, semester, revision } }`. Scope is complete, not cursor-filtered; current actor/assignments, scope and rows share one transaction. Empty scope is deny-all. Grade scope restricts staff to the open semester; admin Grade and Attendance use `semester: null`.

Send `updatedAfter` and the last accepted `scopeRevision` together. Delta is permitted only when the revision still matches; otherwise the server ignores the cursor and returns a full snapshot, including unchanged rows newly brought into scope. Attendance scope pulls ignore `studentId/date/type` UI filters to remain complete. Calls without `includeScope=true` retain the existing array contract.

Clients must validate the envelope, remove cached rows outside scope even when locally pending, and retain the durable mutation queue independently for server rejection/recovery. Inside scope, own pending edits retain their local projection. Reject an unexpected revision on a delta or records outside the declared scope. Cache persistence failure is a failed pull, not permission to advance the shared cursor. This contract does not promise erasure while disconnected or deletion tombstones for every in-scope record.

### Security contract amendment — 2026-09-05

- **ADR-106 deployment scope:** production là one deployment/one parish. Client không chọn tenant: `POST /api/auth/login` và public password-reset có thể còn gửi `parishId` legacy nhưng server bỏ qua và dùng `DEPLOYMENT_PARISH_ID`; access/refresh token parish khác bị từ chối. Public QR vẫn mang signed `parishId`, nhưng verifier chỉ chấp nhận deployment parish. Response/auth marker vẫn giữ `parishId` để scope Dexie/cache/offline chính xác.
- Admin user list/detail trả `isProtectedAdmin` từ configured composite principal; UI dùng marker này thay username hardcode. Marker chỉ là UX, không thay server target guards.
- `POST /api/users`: khi `role=admin`, body bắt buộc có `adminPassword` là mật khẩu hiện tại của caller admin; thiếu/sai → `401 INVALID_ADMIN_PASSWORD`. Áp admin re-auth limiter. Tạo role khác giữ contract hiện hành; không đưa mật khẩu xác nhận vào cache/queue.
- `GET /api/grades` và `GET /api/attendance`: chỉ `admin|chunhiem|phuta`; parent → 403, phải dùng portal/report-card ownership API. Staff scope rỗng → `[]`, không có nghĩa unrestricted. Scope học sinh không phân trang và không lọc bởi sync cursor.
- `POST /api/auth/login`: username không tồn tại, sai password và LOCKED đều `401 INVALID_CREDENTIALS` với cùng thông điệp; không hiển thị số lần thử còn lại từ response.
- `POST /api/verification/sign`: staff có quyền trên lớp hiện hành của active student; `academicYear` là ID năm học có trong parish. Body vẫn `{studentId,academicYear,certId}`. Output thêm `verificationScope: 'signed_identifiers'`.
- `GET /api/verification/verify`: public, bắt buộc đủ `{parishId,studentId,academicYear,certId,sig}`. `verified:true` **chỉ** xác nhận chữ ký tuple, không xác nhận điểm số, bản in, hoặc certificate đã được cấp. UI không được suy rộng. HMAC payload/key không đổi, QR cũ đủ tuple tiếp tục kiểm chữ ký; không có revoke/expiry/issuance guarantee mới.
- `POST /api/notifications/smart/report-cards`: mỗi item bắt buộc `studentId`; `parentPhone` còn được nhận để tương thích nhưng không quyết định người nhận. Server resolve từ active student đúng parish và parent phone trong DB. Trả `{sent,total}`: `sent` là số item đã enqueue có target, không phải provider-delivered; no target → không enqueue hoặc fallback audience rộng.
- Client grades/attendance persist `version:1` loại snapshot cũ khi hydration; cursor v2 buộc full pull. Giữ durable offline mutations và account/tenant namespace. Parent background sync bỏ raw student/grade/attendance pulls.

#### Transaction/delivery amendment — H3/H7/H8

- Login thành công chỉ ghi login state, rehash và phát session nếu credential/principal snapshot còn khớp trong transaction; bị reset/lock/revoke xen kẽ → `401 INVALID_CREDENTIALS`, không phục hồi password cũ. Profile chỉ update field được gửi, mutation và audit cùng transaction; principal/epoch stale → `401 SESSION_INVALID`.
- Admin creation, reset-password, admin-change-password, update-phone và delete-user bind re-auth với actor/tenant/target/action và kiểm lại tại command transaction. Proof chỉ tồn tại nội bộ request, không có token/header mới. Thay đổi actor sau re-auth có thể trả `401 SESSION_INVALID`.
- Daily entries, grade upsert/batch/undo, attendance single/batch và exam mutations kiểm current actor/role/assignment trong transaction, đối chiếu originating epoch khi token có version. Scope list chỉ là giới hạn trên, kể cả admin không được bỏ current-actor check. Giữ response partial-success/OCC/idempotency hiện hành; caller phải đọc kết quả từng item. Đây chưa phải strict-claims migration H2.
- Queue `report|absence` lưu `studentId`; mỗi delivery attempt chỉ gửi Web/native tới original targets còn là parent ACTIVE, chưa xóa, cùng parish và còn khớp canonical phone của trẻ chưa xóa. Body là thông báo chung, push title `Catevia`, link `/`; không đưa tên trẻ/điểm/ngày vắng vào delivery body mới. Không có eligible owner hoặc legacy item thiếu subject/targets → terminal `failed / ACADEMIC_RECIPIENT_NOT_AUTHORIZED`; không có delivery target → `failed / ACADEMIC_DELIVERY_TARGET_UNAVAILABLE`. Không fallback global, không retarget sang parent mới và không tự gửi lại khi account được mở khóa. `{sent,total}` của report-cards vẫn chỉ là enqueue acknowledgement.

### Single Resource Success (`successResponse`)
```json
{
  "success": true,
  "data": { ... }
}
```

### Paginated Success (`paginatedResponse`)
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "error": null
}
```

### Standard Error Response (`errorResponse`)
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN | VERSION_CONFLICT | EVALUATION_ERROR | NOT_FOUND",
    "message": "Chi tiết thông báo lỗi tiếng Việt",
    "details": null
  }
}
```

### Partial-Success Payload Format (ADR-008)
```json
{
  "success": true,
  "data": {
    "total": 40,
    "successCount": 37,
    "skippedCount": 2,
    "conflictCount": 0,
    "errorCount": 1,
    "results": [
      { "studentId": "st-01", "status": "saved", "snapshot": { ... } },
      { "studentId": "st-02", "status": "skipped", "reason": "Already approved" },
      { "studentId": "st-03", "status": "error", "reason": "Semester 2 is unlocked" }
    ]
  }
}
```

---

## 3. FRONTEND ADR ALIGNMENT RULES

### ADR-001 (Optimistic Locking `409 Conflict`)
- When receiving `409 VERSION_CONFLICT`, `promotionStore` and `attendanceStore` MUST capture `err.details`, prompt the user with a Conflict Resolution Dialog, and reload the fresh state.

### ADR-005 & ADR-009 (Semester Lock `403 Forbidden`)
- When receiving `403 FORBIDDEN` with `code: 'FORBIDDEN'`, the store sets `lockError` and disables edit controls in the UI with a notification: *"Học kỳ này đã bị khóa sổ điểm."*

### ADR-008 (Partial Success Rendering)
- Batch operations (`batchApprove`, `batchMarkAttendance`) MUST NOT show a binary "Success/Fail" alert. They MUST render itemized `saved`, `skipped`, `conflict`, and `error` counts and reasons (e.g., `AcademicYearPage.tsx` renders `res.errors[]` line-by-line with severity icons).

### ADR-015 (Idempotency & Double-Click Protection)
- All store actions (`approveStudent`, `batchApprove`) MUST set `isSubmitting = true` immediately to lock submit buttons and prevent double-submission.

### Onboarding Gates (`409` — quy trình bắt buộc Năm học → Lớp → Học sinh)
- `POST /api/classes` → `409 ACADEMIC_YEAR_REQUIRED` ("Vui lòng tạo năm học trước khi tạo lớp học") khi giáo xứ chưa có năm học.
- `POST /api/students` → `409 CLASS_REQUIRED` ("Vui lòng tạo lớp học trước khi thêm học sinh") khi giáo xứ chưa có lớp học.
- UI phải chặn trước (ẩn nút Thêm + banner hướng dẫn) và không fallback "làm ngơ" khi nhận 409 này.

---

## 4. ACADEMIC YEAR LIFECYCLE API (`/api/academic-years`)

Client: `src/lib/api/academicYears.ts` · Page: `src/pages/AcademicYearPage.tsx` (Academic Year Wizard)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/academic-years` | List years with derived status, semester locks, counts | auth (mọi role — `academicYears.ts:17`) | `AcademicYearLifecycleDTO[]` | — |
| `GET /api/academic-years/:id/completeness` | Completeness checklist | admin | `CompletenessChecklist` | 404 |
| `POST /api/academic-years/:id/start-semester-2` | Bắt đầu HK2 | admin | `{ yearId, currentSemester: 2 }` | 403 (HK1 chưa khóa) |
| `POST /api/academic-years/:id/finalize` | Chốt năm học + snapshot | admin | `FinalizeSummary` | 403 (khóa chưa đủ), 400 (`details` = checklist), 409 (đã chốt) |
| `POST /api/academic-years/:id/copy` | Copy lớp + assessments sang năm mới (idempotent) | admin | `CopySummary` | 404 |
| `POST /api/academic-years/:id/promote` | Xét lên lớp (body: `{ nextYearId }`) | admin | `PromoteSummary` | 403 (chưa FINALIZED), 409 (đã PROMOTED) |
| `POST /api/academic-years/:id/archive` | Lưu trữ năm học (chỉ sau PROMOTED) | admin | `{ yearId, status: 'ARCHIVED', archivedAt }` | 403 (chưa PROMOTED), 409 (đã ARCHIVED) |

### `AcademicYearLifecycleDTO` (GET list item)
```ts
{
  id: string; startDate: string; endDate: string; isLocked: number;
  status: 'OPEN' | 'SEMESTER_1_LOCKED' | 'SEMESTER_2_OPEN' | 'SEMESTER_2_LOCKED'
        | 'FINALIZED' | 'PROMOTED' | 'ARCHIVED';
  currentSemester: number;
  semesterLocks: { semester1Locked: boolean; semester2Locked: boolean };
  classCount: number; studentCount: number; snapshotCount: number;
  createdAt: string; updatedAt: string;
}
```

### `CompletenessChecklist` (finalize 400 `details` / GET completeness)
```ts
{
  yearId: string; status: string; ready: boolean;
  totals: { classes: number; students: number; gradeRows: number; openSessions: number };
  issues: { code: string; severity: 'error' | 'warning'; label: string; items: string[] }[];
}
```
- `ready === false` ⇔ có ít nhất 1 issue `severity: 'error'` (`STUDENTS_MISSING_HK1_GRADES`, `STUDENTS_MISSING_HK2_GRADES`, `STUDENTS_NOT_CLASSIFIED`, `CLASS_WITHOUT_HK1_GRADES`, `CLASS_WITHOUT_HK2_GRADES`; `ATTENDANCE_SESSIONS_OPEN` chỉ là warning).

### `PromoteSummary`
```ts
{ yearId: string; nextYearId: string; status: 'PROMOTED'; total: number;
  movedToNextYear: number; retained: number; graduated: number;
  errors: { studentId: string; reason: string }[] }
```
- Batch semantics per ADR-008: `errors` liệt kê từng học sinh thất bại, không rollback toàn bộ.

### Wizard UI Flow (client)
1. `GET /completeness` → hiển thị checklist (modal) → nếu `ready` mới cho Finalize.
2. Finalize thành công → trả `FinalizeSummary`; năm chuyển `FINALIZED` (khóa hết).
3. Promote: người dùng chọn/khai năm học mới (`nextYearId`) → server tự copy lớp + assessments nếu chưa tồn tại.
4. Tạo năm trống trực tiếp vẫn dùng endpoint cũ `POST /api/classes/academic-years` (bỏ qua wizard copy).

---

## 5. SYSTEM PURGE API (`/api/system`)

Client: `src/lib/api.ts` (`purgeAllData`, `probePurgeVersion`) · UI: `src/components/common/PurgeDataModal.tsx` (Danger Zone trong `SettingsPage`)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/system/purge` | Xóa TOÀN BỘ dữ liệu giáo xứ (body: `{ password, confirmKey }`, confirmKey = `XÓA TẤT CẢ`) | admin only + purgeRateLimiter 10/min/IP | `{ success, message, purgeVersion, countsBefore }` | 401 `INVALID_PASSWORD` (mật khẩu sai — KHÔNG xóa gì), 400 `INVALID_CONFIRM_KEY`, 403, 429 |
| `GET /api/system/purge-version` | Trả `purge_version` hiện tại (check ghost data đa thiết bị) | auth (mọi role) | `{ purgeVersion: number }` | — |

### Purge semantics (Business Rules → `docs/BUSINESS_RULES.md` §9)
- Chỉ admin; phải nhập đúng mật khẩu (bcrypt) + chuỗi xác nhận `XÓA TẤT CẢ`.
- Xóa rows của 26 bảng nghiệp vụ trong hợp đồng Purge v2.4 trong 1 transaction (FK order + `PRAGMA defer_foreign_keys`), scope `parish_id`; gồm `password_reset_requests`, `feedback_messages`, và `exam_result_mutations` xóa trước result/session; KHÔNG drop bảng, KHÔNG xóa function/trigger.
- Giữ nguyên: `users`, `branches`, `permissions`, `role_permissions`, `audit_logs`, `push_subscriptions`, `native_push_tokens`, `system_settings`.
- Snapshot v3.1 (26 bảng) tự ghi file trước khi xóa; audit log `SYSTEM_PURGE` ghi counts.
- Sau thành công: client gọi `resetClientData(purgeVersion)` → xóa sạch Dexie + localStorage + đăng xuất. Các thiết bị khác bị `fetchAllData` phát hiện version chênh lệch → tự reset + đăng xuất (chống ghost data).
- **A-NEW-47 (2026-08-13)**: `fetchAllData` chỉ reset khi device ĐÃ TỪNG sync (có key `parish_purge_version` trong localStorage). Device mới/chưa có key chỉ **ghi baseline** `purge_version` hiện tại, KHÔNG wipe, KHÔNG logout — tránh đá user ra khỏi phiên hợp lệ khi `purge_version` server cao hơn từ các lần purge lịch sử (production hiện là 4). Device cũ có key < server version vẫn bị reset (ghost data).
- Sau purge, quy trình bắt đầu lại: Tạo Năm Học → (khóa HK1 mặc định mở vì `semester_locks` đã purge) → Tạo Lớp hoặc Import Excel (tự tạo lớp qua `suggestedNewClasses`) → Nhập điểm / Điểm danh.

### Audit log action convention (2026-08-12 — AUDIT-FIX)
- `GET /api/audit-logs` (admin-only, paginated, cap 500) — xem `server/src/routes/auditLogs.ts`.
- `GET /api/audit-logs/policy-history` (admin-only, ADR-047): subset lọc sẵn theo policy (actions `UPDATE`/`OVERRIDE_GRADE`/`RESTORE_GRADE`/`APPROVE_PROMOTION`/`LOCK_SEMESTER`/`UNLOCK_SEMESTER` + entity types `settings`/`grade_override`/`promotion_record`/`semester_lock`), enrich `policyMetadata` (type: `POLICY_UPDATE`/`GRADE_OVERRIDE`/`PROMOTION_DECISION`/`SEMESTER_LOCK`), `studentId`/`studentName` (tenant-scoped) và `meta.summary` (thống kê KPI). UI hiển thị qua tab **"Chính Sách & Tác Động"** trên trang Nhật Ký Hệ Thống (`src/pages/AuditLogPage.tsx`, endpoint `getPolicyHistory` trong `src/lib/api.ts`) — trang `/policy-dashboard` đã gộp vào đây.
- **Server ghi action GENERIC `CREATE`/`UPDATE`/`DELETE` + `entityType`** cho các entity nghiệp vụ (`grade`/`attendance`/`student`/`notice`/`class` — `gradeService.ts`, `attendanceService.ts`, `studentService.ts`, `noticeService.ts`, `classService.ts`). Mọi write điểm — kể cả **import Excel** (qua `POST /api/grades/batch`) — đều ghi audit 1 dòng/học sinh (CREATE nếu grade mới, UPDATE nếu tồn tại).
- Action **đặc biệt** giữ tên riêng: `CREATE_USER`, `UPDATE_USER_STATUS`, `UPDATE_USER_ASSIGNMENTS`, `DELETE_USER_ACCOUNT(_FAILED)`, `RESET_PASSWORD`, `FORCE_LOGOUT`, `CHANGE_PASSWORD`, `REVEAL_PASSWORD`, `RESTORE_BACKUP(_FAILED)`, `SYSTEM_PURGE`, `EXAM_FINALIZE/REOPEN/DELETE_SESSION/DELETE_RESULT`, `DELETE_CLASS_ASSIGNMENT`, `PARENT_ACCOUNTS_PROVISIONED(_FAILED)`, `*_FAILED`.
- **KHÔNG tồn tại action `UPSERT_GRADE`/`UPSERT_ATTENDANCE`** — UI `src/pages/AuditLogPage.tsx` map nhãn/color theo cặp `(action, entityType)` (`CRUD_LABELS`), filter hành động dùng action thật + option ghép `UPDATE|grade` (gửi kèm `entityType`).
- Filter params: `action` (string chính xác), `entityType`, `userId`, `startDate`/`endDate` (ISO), `page`/`limit`.

---

## 6. AUTH SESSION SECURITY API (`/api/auth`)

Client: `src/lib/api.ts` (`api.login/changePassword/adminChangePassword/logout/me`) · Store: `src/stores/authStore.ts`

> **Username unique theo parish (ADR-046, superseded topology by ADR-106)**: DB tiếp tục enforce `idx_users_username_parish UNIQUE(parish_id, username)`. `POST /api/auth/login` còn nhận `parishId` optional để tương thích client/test cũ, nhưng khi deployment scope được enforce server luôn lookup `(username, DEPLOYMENT_PARISH_ID)` và không fallback/global lookup. Production không có parish picker hoặc shared multi-parish login. Dev/test không set deployment scope vẫn có thể gửi `parishId` để chạy isolation regression.

> **2 cổng đăng nhập UI (ADR-044, 2026-08-16)**: client có 3 trang login — `/login` (chooser), `/login/phuhuynh` (SĐT + mật khẩu), `/login/nhan-su` (username + mật khẩu). **Backend KHÔNG đổi**: tất cả cổng gọi chung `POST /api/auth/login`; role gate sau login nằm ở client (sai cổng → logout + chỉ đường). Chi tiết: `docs/BUSINESS_RULES.md` §10.13.

> **Persist session 2 tầng (ADR-045, 2026-08-16)**: localStorage `parish_current_user` chỉ chứa marker không-PII `{id, role, parishId}`; user đầy đủ lưu mã hóa AES-GCM trong IndexedDB (`parish_auth_user`, dexieStorage, tenant-scoped). Khi snapshot local hỏng/thiếu (Dexie purge, key rotate, LAN không có `crypto.subtle`): client gọi `POST /api/auth/refresh` (cookie HttpOnly) rồi **`GET /api/auth/me`** (trả `{id, username, fullName, phone, role, status}` — không có parishId/mustChangePassword; client merge `parishId` từ marker) để rebuild; offline → logout sạch.

### Refresh token rotation (JWT refresh rotation, SSOT)
- Mỗi login/change-password → tạo **1 refresh session** (bảng `refresh_tokens`, chỉ lưu sha256 hash — không lưu plaintext).
- `POST /api/auth/refresh` — **A-NEW-01/A-NEW-02 (2026-08-10): token CHỈ từ HttpOnly cookie `parish_refresh` — body bị IGNORE hoàn toàn** (JS không bao giờ có refresh token). Rate limit 30/60s/IP:
  - Token hợp lệ → **rotate**: thu hồi token cũ (revokedAt + replacedBy), phát hành access token mới + **set cookie mới**. Token cũ không dùng lại được.
  - Token đã bị thu hồi nhưng vẫn được gửi (reuse) → **phát hiện đánh cắp**: 401 `SESSION_REUSE_DETECTED`, server thu hồi TOÀN BỘ phiên user + tăng `tokenVersion` (giết cả access token) → buộc đăng nhập lại.
  - Lỗi khác: 401 `REFRESH_TOKEN_REQUIRED` (thiếu cookie), `INVALID_REFRESH_TOKEN` (không verify được / không tồn tại), `SESSION_INVALID` (tokenVersion lệch — đổi mật khẩu/logout toàn bộ), `REFRESH_EXPIRED`, 403 `USER_LOCKED`, 403 `FORBIDDEN` (Origin ngoài allowlist — CSRF guard bên dưới).
  - Cookie: `parish_refresh`, `HttpOnly; Path=/; Max-Age=7d`. **Production (`SameSite=None; Secure`)** — frontend Vercel gọi API Railway là CROSS-SITE, `SameSite=Lax` sẽ không gửi cookie cho POST cross-site (refresh sau reload fail). Dev/test: `SameSite=Lax` (localhost cùng site).
  - **CSRF guard (A-NEW-02)**: vì production cookie gửi trong cross-site POST, `/refresh` + `/logout` kiểm tra `Origin` header — có `Origin` mà không nằm trong CORS allowlist (tnttvn.vercel.app + localhost dev + origin native Capacitor `capacitor://localhost`/`https://localhost` — A-NEW-58 2026-08-19) → `403`. Origin rỗng (curl/server-to-server) cho qua.
- Client `src/lib/api.ts` tự động gọi refresh (mutex, 1 lần) khi gặp 401 — refresh qua cookie (`credentials: 'include'`), **không gửi body token**. Refresh token **không tồn tại trong JS** (không memory, không localStorage) — A-NEW-01.
- `POST /api/auth/login` + `/change-password` response: **chỉ `accessToken` (không còn `refreshToken` trong JSON)** — refresh token duy nhất ở `Set-Cookie` (A-NEW-01).

### `POST /api/auth/logout` (per-session)
- Body `{ refreshToken }` (chỉ khi client còn giữ trong JS — luồng cũ) → **chỉ thu hồi phiên đó**; client mới KHÔNG gửi body → thu hồi phiên qua cookie (per-session qua cookie), không body+không cookie → thu hồi toàn bộ + tăng `tokenVersion` (backward compatible).
- **A01 Phase 1 + A-NEW-02**: luôn xóa cookie `parish_refresh` (Max-Age=0); chịu CSRF origin guard như `/refresh`.
- Client logout: best-effort — gọi server trước, fail (offline/network) vẫn logout local; token bị phủ bởi rotation/reuse sau đó.

### JWT secrets (production)
- `JWT_SECRET` + `JWT_REFRESH_SECRET` **bắt buộc** riêng biệt (server throw khi thiếu; docker-compose fail-fast `${VAR:?}`). Không còn fallback hardcoded trong repo.

### Credential lifecycle (ADR-058, supersedes ADR-021 reversible copy)
- `POST /api/users`, `POST /api/users/:id/reset-password`, `POST /api/auth/admin-change-password`: server chỉ lưu bcrypt hash; `passwordEncrypted = null`. Create/reset response có thể trả mật khẩu tạm đúng một lần; mất giá trị đó thì phải reset mới.
- Reset/admin-change vẫn bắt buộc `{ adminPassword }`, JWT admin, parish-scoped bcrypt re-auth, `adminReauthRateLimiter` 10/60s/IP và audit success/failure. Chính user đổi qua `POST /api/auth/change-password` được rotate phiên như cũ.
- `GET /api/users` không trả hash/ciphertext; `hasPasswordCopy` nếu còn trong payload legacy luôn `false`.
- `POST /api/users/:id/reveal-password` → **410** `{ success:false, error:{ code:"PASSWORD_REVEAL_REMOVED", ... } }`; không nhận/kiểm tra admin password và không có secret trong response.

### `POST /api/auth/parent-reset-password` compatibility tombstone (ADR-058)
- Endpoint luôn trả **410** `{ success:false, error:{ code:"PARENT_SELF_RESET_REMOVED", ... } }` bất kể body; không lookup SĐT/hồ sơ trẻ và không mutate user/session.
- Client mới không gọi endpoint này; dùng ticket ADR-087 bên dưới.

### Parent password reset request (`/api/password-reset-requests`, ADR-087)

| Method/path | Quyền | Contract |
| :--- | :--- | :--- |
| `POST /` | Public + `parentForgotRateLimiter` 5/60s/IP | Body `{phone, parishId?}`; `parishId` chỉ còn legacy compatibility và bị bỏ qua khi deployment scope được enforce. Server normalize SĐT, chỉ tạo/mở lại ticket nếu khớp `role=phuhuynh` trong `DEPLOYMENT_PARISH_ID`. Luôn `202 {accepted:true,message}` giống nhau cho số có/không có tài khoản; không tự reset. |
| `GET /admin` | admin | Danh sách ticket `PENDING` cùng tenant, mới nhất trước: `{id,userId,fullName,username,phone,status,requestCount,lastRequestedAt}[]`. |
| `POST /admin/:id/reset` | admin + re-auth + `adminReauthRateLimiter` | Body `{adminPassword}`; transaction reset bcrypt + force-change + revoke sessions + resolve ticket + audit. Trả `{username,tempPassword,fullName}` đúng một lần. |
| `PATCH /admin/:id/dismiss` | admin | Đóng ticket sai/không còn cần; audit người xử lý. |

Public response không chứng minh ticket đã được tạo và không được dùng để suy ra account existence. Admin UI bắt buộc xác nhận đã xác minh danh tính qua kênh tin cậy; ticket/SĐT tự khai không phải possession factor. Client không persist/offline-enqueue/auto-retry request này.

---

## 7. APP PUSH API — WEB + NATIVE (`/api/notifications`, ADR-095)

Client: `src/lib/pushManager.ts` (`initPushSubscription`/`disablePushSubscription`) · SW: `public/sw.js` · Service: `server/src/services/webPushService.ts` (SSOT gửi + dọn sub chết)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/notifications/vapid-public-key` | VAPID public key để client `PushManager.subscribe` | auth (mọi role) | `{ publicKey: string \| null, configured: boolean }` — 200 ngay cả khi chưa cấu hình (`{ publicKey: null, configured:false }` để tránh browser log 501 spam; client skip debug, không lỗi) — legacy 501 `VAPID_NOT_CONFIGURED` vẫn được client bắt để tương thích deploy cũ |
| `POST /api/notifications/subscribe` | Lưu PushSubscription (endpoint + p256dh + auth) | auth | `{ ok: true }` | — (idempotent, endpoint UNIQUE) |
| `POST /api/notifications/unsubscribe` | Xóa subscription theo endpoint | auth | `{ ok: true }` | — |
| `POST /api/notifications/native/register` | Bind token OS với installation UUID và user/parish lấy từ JWT; token write + redacted audit commit trong cùng transaction; cùng installation/token được chuyển atomically về account hiện tại | auth | `{ ok: true }` | 400 validation |
| `POST /api/notifications/native/unregister` | Xóa installation chỉ khi thuộc đúng user + parish hiện tại; delete + audit cùng transaction | auth | `{ ok: true }` | 400 validation |
| `POST /api/notifications/send` | Fan-out ngay Web Push + FCM/APNs cho toàn giáo xứ; `url` bắt buộc là route nội bộ `/...` | admin | `{ configured,sent,failed,total,removed,skipped,channels }` | 501 `PUSH_PROVIDER_NOT_CONFIGURED` |
| `GET /api/notifications/subscriptions` | Đếm binding theo giáo xứ, không trả endpoint/token | admin | `{ count, web, native }` | 401/403 |

### Smart notifications (`/api/notifications/smart/*` — F8 drift bổ sung)
Kích hoạt tự động gửi thông báo theo sự kiện bằng Web/Native Push có chủ đích cho staff/phụ huynh. Tất cả dưới `use('/smart/*', roleMiddleware('admin','chunhiem'))`.

| Method & Path | Purpose | Auth | Success `data` |
| :--- | :--- | :--- | :--- |
| `POST /api/notifications/smart/absence` | Thông báo vắng mặt (theo ngày/lớp) | admin + chunhiem | `{ enqueued, failed }` |
| `POST /api/notifications/smart/report-cards` | Gửi phiếu điểm hàng loạt tới parent canonical theo studentId (qua outbox queue) | admin + chunhiem | `{ sent, total }` — sent = số item enqueue có recipient, không phải delivered |
| `POST /api/notifications/smart/reminder/sunday` | Nhắc tham dự Lễ Chúa Nhật | admin + chunhiem | `{ enqueued, failed }` |
| `POST /api/notifications/smart/reminder/class` | Nhắc lớp học | admin + chunhiem | `{ enqueued, failed }` |

### Client flow (pushManager)
1. `main.tsx` → `registerServiceWorkerOnly()` là owner duy nhất của SW (`vite.config.ts: injectRegister=false`): web đăng ký `/sw.js` sớm, KHÔNG hỏi permission; Capacitor native không đăng ký, đồng thời unregister worker/cache PWA còn sót từ build cũ mà không đụng Dexie/auth/offline queue (ADR-088).
2. Web sau login → `initPushSubscription()`: permission 'default' → hỏi 1 lần; lấy VAPID key → subscribe/re-sync. Endpoint upsert luôn chuyển ownership về JWT hiện tại để đổi account không giữ subscription cũ.
3. Native chỉ hỏi quyền khi user bấm **Bật** ở Cài đặt. Khi permission đã granted và không opt-out, login/launch/resume gọi plugin register để lấy token mới rồi POST `/native/register`; client chỉ persist UUID installation + preference scope `parishId:userId`, không persist token. Scope đổi trong khi chờ token phải fail-closed.
4. Người dùng bấm **Tắt** chỉ được đánh dấu disabled sau khi `/native/unregister` thành công; lỗi server phải nổi lỗi và giữ trạng thái bật để tránh false-success. Logout vẫn cố unregister best-effort trước khi access token memory-only bị xóa, rồi unregister OS provider. Soft-delete user cũng xóa cả hai loại binding.
5. SW: `push` → `showNotification(icon: /pwa-icon.svg)`; `notificationclick` → focus window hiện có hoặc `openWindow(url)`.
- Yêu cầu web: secure context. Native dùng FCM/APNs và **không** dùng Web Push/Service Worker trong WebView (ADR-088).

### Delivery semantics (SSOT webPushService)
- Gửi song song tới mọi `push_subscriptions` hợp lệ của parish; cả Web Push và native chỉ chọn binding nối được với account cùng parish còn `ACTIVE`, chưa soft-delete. Binding Web Push cũ không có `user_id` và binding của account đã khóa/xóa không được gửi, kể cả ở endpoint broadcast trực tiếp.
- Endpoint trả `404`/`410` (trình duyệt đã hủy) → **xóa vĩnh viễn** và không làm retry aggregate item; lỗi tạm thời (500…) → đếm failed, GIỮ subscription và retry theo queue. Vì vậy chỉ partial failure tạm thời hoặc crash sau provider acceptance còn có thể gửi trùng tới endpoint đã nhận.
- `sendWebPushToUsers(parishId, userIds, payload)` — gửi **có chủ đích** chỉ tới subscriptions có `user_id` trong danh sách (ví dụ: phụ huynh theo chi đoàn); subscription không thuộc nhóm không bị đụng tới.
- `notificationQueue` channel persisted legacy `webpush`: gửi thật qua `appPushService` rồi mới đánh dấu `sent`; không provider nào cấu hình → `PUSH_PROVIDER_NOT_CONFIGURED`. Item có `webpushUserIds` (tên field legacy) persist JSON vào `notifications.target_user_ids`, và cả Web/native dùng đúng tập này.
- Từ ADR-102/111, enqueue là async durable acknowledgement: row phải được INSERT trước khi worker xử lý. `delivery_kind` giữ nguyên alert/info/absence/report/reminder qua restart. Worker claim bằng lease DB, tăng `attempt_count` atomically, persist exponential backoff trong `next_attempt_at`, thu hồi lease hết hạn khi startup/poll và chỉ cập nhật trạng thái nếu còn sở hữu lease. Mọi queue item mới phải persist một mảng target user rõ ràng; target `NULL`, JSON hỏng hoặc tập rỗng fail closed và không bao giờ chuyển thành parish broadcast. Target còn active nhưng không có endpoint Web/Native khả dụng cũng terminal `DELIVERY_TARGET_UNAVAILABLE`, không được đánh dấu `sent`. Provider không cấu hình hoặc push lỗi tạm thời một phần không được đánh dấu `sent`. Semantics là **at-least-once**, không phải exactly-once qua provider.
- Smart notifications (`smartNotifications`) gửi Web/Native Push có chủ đích cho staff/phụ huynh. `notifyParishNotice` tách hai target groups tenant-scoped; nhóm phụ huynh khớp `users.phone` ↔ `students.parentPhone` qua `phoneMatchVariants` và lọc `targetBranch`. Không có fallback broadcast.

---

## 9. PARENT PORTAL API (`/api/parents`)

Client: `src/lib/api.ts` (`getMyChildren`, `getStudentReportCard`) · Page: `src/pages/ParentPage.tsx` (route `/parent`, frontend policy và backend endpoint đều chỉ role `phuhuynh`; không có admin-preview vì `GET /api/parents/my-children` từ chối admin) · Service: `server/src/services/parentService.ts` · Matching: `server/src/utils/phone.ts` (SSOT `CanAccessStudentSpecification`)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/parents/my-children` | Danh sách con đang học của phụ huynh (khớp `users.phone` ↔ `students.parentPhone` chuẩn hóa, loại học sinh đã xóa) | auth + role `phuhuynh` | `ParentChild[]` — `{ id, code, holyName, fullName, gender, dateOfBirth, parentName, branch, className, classCode, status }` | 401 chưa đăng nhập, 403 không phải phụ huynh |
| `GET /api/reports/report-card/:studentId?academicYear=YYYY-YYYY` | Phiếu điểm của con (grades 2 HK, attendanceSummary, promotion) — phụ huynh chỉ xem được con mình qua `CanAccessStudentSpecification` | auth (mọi role, quyền truy cập qua spec) | `ReportCardDTO` | 403 không sở hữu, 404 không tìm thấy; **500** `REPORT_GENERATION_ERROR` cho lỗi không phân loại (OBS-FIX 2026-08-22: message chung, chi tiết chỉ trong server logs — client hiển thị thông báo thử lại) |
| `POST /api/parents/telegram/link-token` | Compatibility tombstone — kênh đã retire | auth + role `phuhuynh` | Không có | 410 `CHANNEL_RETIRED`; 401/403 vẫn fail closed |
| `GET /api/parents/telegram/status` | Compatibility tombstone — kênh đã retire | auth + role `phuhuynh` | Không có | 410 `CHANNEL_RETIRED`; 401/403 vẫn fail closed |
| `POST /api/parents/telegram/notifications` | Compatibility tombstone — không ghi preference/audit mới | auth + role `phuhuynh` | Không có | 410 `CHANNEL_RETIRED`; 401/403 vẫn fail closed |
| `DELETE /api/parents/telegram/link` | Compatibility tombstone — link active đã được migration/startup revoke | auth + role `phuhuynh` | Không có | 410 `CHANNEL_RETIRED`; 401/403 vẫn fail closed |

- Phone khớp linh hoạt: bỏ khoảng trắng/`-`/`(`/`)`/`.`, đổi đầu `+84` → `0`; `users.phone` có thể lệch định dạng so với `students.parentPhone` mà vẫn khớp.
- Phụ huynh **không** thấy tab Thiếu Nhi/Điểm Danh/Bảng Điểm/Báo Cáo. `GET /api/students` và `GET /api/students/:id` trả **403** cho role `phuhuynh`; dữ liệu con chỉ đi qua `GET /api/parents/my-children` và report-card parent guard. `GET /api/grades` và `GET /api/attendance` cũng trả **403** cho phụ huynh; background sync parent không gọi các staff APIs này. Với `admin|chunhiem|phuta`, `GET /api/students` và `GET /api/classes` trả roster/metadata lớp toàn giáo xứ để duyệt danh sách; response lớp cho GLV không có `homeroomTeacher` hoặc `assistants`, nhưng có `assignedToCurrentUser: boolean` chỉ phản ánh assignment của chính user. `ExamSessionView` bắt buộc dùng marker này để lọc class chips/form tạo phiên. Đây là read scope riêng: endpoint ghi và các module điểm danh/điểm/thi vẫn kiểm tra class assignment tại server.
- Frontend route-policy SSOT: `src/constants/routePolicy.ts`. Router guard, desktop/mobile navigation state và mobile title cùng dẫn xuất từ policy này. `/students`, `/grades`, `/attendance`, `/reports`, `/leave-requests` chỉ `admin|chunhiem|phuta`; `/parent` chỉ `phuhuynh`; governance routes chỉ `admin`; `/dashboard|notices|calendar|settings|feedback` dùng chung cho mọi role đã xác thực. `/feedback` chỉ chung quyền vào trang; quyền gửi/nhận vẫn tách theo endpoint và role. Đây là fail-closed UX boundary; server middleware vẫn là authorization authority.
- ADR-111 đã xóa Telegram UI/hook/client methods. Parent Portal sử dụng thông báo trong ứng dụng và Web/Native Push.

## 9A. USER ACCOUNT PROVISIONING API (`/api/users/parent-*`) — ADR-026

Client: `src/lib/api.ts` (`getParentProvisionPreview`, `provisionParentAccounts`) · UI: `src/components/desktop/UserManagementPage.tsx` (tab "Tài Khoản Phụ Huynh" trong `/management` — `scope='phuhuynh'`, nút "Cấp Tài Khoản Phụ Huynh"; 2026-08-22) · Server: `server/src/routes/users.ts` + `server/src/services/userService.ts` (`getParentProvisionPreview`, `provisionParentAccounts`)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/users/parent-provision-preview` | Danh sách SĐT phụ huynh **chưa có tài khoản** (scan `students.parentPhone` cùng giáo xứ, chưa xóa; normalize + dedupe; anh chị em cùng SĐT → 1 mục `childrenCount`; skip SĐT placeholder/không hợp lệ/đã có user/trùng username trong cùng giáo xứ — ADR-046) | admin | `{ total, candidates: [{ phone, parentName, childrenCount }], validPhoneCount, existingCount }` — `total === 0` + `validPhoneCount === 0` = **chưa có SĐT hợp lệ** (cần cập nhật SĐT học sinh); `total === 0` + `validPhoneCount > 0` = mọi SĐT hợp lệ đã có tài khoản | 401, 403 |
| `POST /api/users/provision-parents` | Tạo hàng loạt tài khoản `phuhuynh` (username = SĐT chuẩn hóa, temp pass `Parish@\d{6}` 1 lần, `FORCE_PASSWORD_CHANGE`, bcrypt 12, `passwordEncrypted` theo ADR-021; **không** gán lớp). Re-auth bắt buộc `{ adminPassword }` (A06: `verifyAdminReauth` + rate limit 10/60s/IP + audit failed). Partial-success itemized (ADR-008); idempotent — chạy lại trả `total: 0` | admin (+ re-auth) | `{ total, successCount, skippedCount, errorCount, results: [{ phone, fullName, status: created\|skipped\|error, reason?, username?, tempPassword? }] }` | 400 thiếu adminPassword, 401 `INVALID_ADMIN_PASSWORD`, 401/403 auth |

- Audit: 1 hàng `PARENT_ACCOUNTS_PROVISIONED` / lần chạy — `{ total, successCount, skippedCount, errorCount, createdIds }`, **không chứa SĐT/mật khẩu** (A16); fail re-auth → `PARENT_ACCOUNTS_PROVISION_FAILED`.
- Không retry tự động (A12 — POST không Idempotency-Key).

## 9B. TẠO TÀI KHOẢN GLV/ADMIN (`POST /api/users`) — ADR-027

Client: `src/lib/api.ts` (`createUser`) · UI: `src/components/desktop/UserManagementPage.tsx` (modal tạo tài khoản, preview username realtime) + `src/components/common/StudentModal.tsx` (nút "Tạo Tài Khoản Phụ Huynh" nhanh khi đã nhập Tên PH + SĐT 10 số — admin-only, 2026-08-22) · Server: `server/src/routes/users.ts` + `server/src/services/userService.ts` (`resolveUsername`) · Quy ước username: `docs/BUSINESS_RULES.md` §10.9 + ADR-027

| Endpoint | Mô tả | Quyền | Response | Lỗi |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/users` | Tạo tài khoản. `username` và `holyName` giờ **optional**: không gửi `username` (role ≠ phuhuynh) → server **tự sinh** `chucvu_TenThanh_HoTen` (bỏ dấu, nối liền, viết thường — `phuta`→`glv_`, `chunhiem`→`cn_`, `admin`→`ad_`); `phuhuynh` không gửi `username` → dùng **SĐT chuẩn hóa** làm username (bắt buộc gửi `phone`). `holyName` (min 2) bắt buộc khi tự sinh | admin | `{ data: { id, username, holyName, fullName, role, ... } }` | 400 `HOLY_NAME_REQUIRED` (thiếu Tên Thánh khi tự sinh), 400 `PHONE_REQUIRED` (phuhuynh thiếu SĐT), 409 `USERNAME_EXISTS` (không tự append số — admin nhập override tay) |
| `POST /api/users/:id/force-logout` | Thu hồi toàn bộ phiên của user: tăng `tokenVersion` (giết mọi access token) + xóa/revoke refresh sessions + audit `FORCE_LOGOUT` | admin | `{ success: true, userId }` | 401/403 |


## 9C. ĐỔI SĐT TÀI KHOẢN (`PUT /api/users/:id/phone`) — ADR-039

Client: `src/lib/api.ts` (`updateUserPhone`) · UI: `src/components/desktop/UserManagementPage.tsx` (nút icon điện thoại mỗi hàng, modal kèm re-auth) · Server: `server/src/routes/users.ts` + `server/src/services/userService.ts` (`updateUserPhone`)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `PUT /api/users/:id/phone` | Đổi SĐT tài khoản — **endpoint duy nhất sửa SĐT**. `phuhuynh` có username = SĐT cũ (quy ước ADR-026/027) → username **đồng bộ theo SĐT mới**. Body `{ phone: ^0\d{9}$, adminPassword }` — re-auth chuẩn A05/A06 (`adminReauthRateLimiter` + audit `UPDATE_USER_PHONE`/`UPDATE_USER_PHONE_FAILED`, **không ghi SĐT thô** — A16) | admin (+ re-auth) | `{ id, phone, username, usernameChanged }` (`usernameChanged: false` nếu không đổi — GLV/CN username custom) | 400 format SĐT, 401 `INVALID_ADMIN_PASSWORD`, 403 Admin trưởng, 404 không tồn tại, 409 `USERNAME_EXISTS` (SĐT mới trùng tài khoản khác) |

## 9D. DANH BẠ GLV & XÓA TÀI KHOẢN (`/api/users`) — ADR-089

| Endpoint | Mô tả | Quyền | Response | Lỗi chính |
|---|---|---|---|---|
| `GET /api/users/catechists` | Danh bạ read-only đã tối thiểu hóa: `id`, `fullName`, `holyName`, `role`, `assignedClasses`, `assignedClassNames`; không trả username, SĐT, status, last-login, token hay credential | admin + chunhiem + phuta | `{ data: CatechistDirectoryEntry[] }` | 401, 403 phụ huynh |
| `DELETE /api/users/:id` | Soft-delete account; body `{ adminPassword }`. Thu hồi sessions/assignment/subscription/link và ghi audit trong transaction; giữ lịch sử nghiệp vụ | admin + re-auth | `{ data: { id, deleted: true, alreadyDeleted } }` | 400 thiếu mật khẩu, 401 `INVALID_ADMIN_PASSWORD`, 403 `PROTECTED_ACCOUNT`, 404 tenant-scoped `NOT_FOUND` |

UI canonical là `/catechists`: admin nhận bảng quản trị đầy đủ và thao tác xóa; `chunhiem`/`phuta` chỉ nhận projection danh bạ. Tab GLV cũ trong `/management` đã bỏ; `/users` còn là deep-link admin tương thích.

- **`PUT /api/auth/profile`**: role `phuhuynh` gửi `phone` khác SĐT hiện tại → **403 `PHONE_CHANGE_NOT_ALLOWED`** (SĐT = identity liên kết con — chỉ admin đổi qua endpoint trên). `phone` validate `^0\d{9}$` cho mọi role. Client `SettingsPage` disable ô SĐT cho phụ huynh + hướng dẫn liên hệ BGL.
- Audit: `UPDATE_USER_PHONE` ghi `{ phoneChanged, usernameChanged }` (không chứa SĐT/mật khẩu — A16).

## 10. SMART EXAM GRADING API (`/api/exams`)

Client: `src/lib/api.ts` (`createExam`, `getExamSessionsForClass`, `getMyExamSessions`, `getExam`, `saveExamResults`, `removeExamResult`, `getExamResults`, `completeExam`, `reopenExam`, `deleteExam`) · Store/UI: `src/stores/examStore.ts` + `src/components/exam/` (tab "Chấm Bài" trong GradesPage) · Server: `server/src/routes/exams.ts` + `server/src/services/examService.ts` · Plan: `exam grading plan (đã triển khai — xem ADR-023/024/025)`

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/exams` | Tạo phiên chấm (`classId`, `subject`, `scoreType`, `maxScore` 1–10, `semester`, `academicYear?`, `examType?` ∈ `written\|multiple_choice\|mixed`; MC/mixed bắt buộc `questionCount` 1–50 (= số câu TN) và `answerKey` JSON đầy đủ **hoặc** `answerVariants` JSON A–H đầy đủ, A bắt buộc; mixed bắt buộc thêm `questions` có ≥1 câu `type:'essay'`, câu TN chiếm index 1..questionCount liên tục; `idempotencyKey?`) | admin, chunhiem, phuta (lớp mình) + `checkUserClassAccess` | `ExamSession` (`EXS-`, `status:'draft'`); retry cùng `idempotencyKey` trả session đã tạo | 403 ngoài lớp, 404 lớp không tồn tại, 400 đáp án/questionCount/questions không hợp lệ |
| `GET /api/exams/class/:classId?subject=&scoreType=&status=` | Danh sách phiên của 1 lớp (mới nhất trước) | auth theo class | `ExamSession[]` | 403 ngoài lớp |
| `GET /api/exams/my-classes` | Danh sách phiên các lớp mình phụ trách (admin: tất cả) | auth | `ExamSession[]` | — |
| `GET /api/exams/:id` | Chi tiết phiên | auth theo class | `ExamSession` | 404 |
| `POST /api/exams/:id/results` | Upsert kết quả (`results[]` — `studentId`, `score`, `essayScore?`, `source`, `examVersion?` A–H, `answers?`, `scanMetadata?` ≤10KB không ảnh; `clientMutationId?`, `attemptFingerprint?`, `capturedAt?`, `expectedResultVersion?`). Update row hiện hữu bắt buộc gửi đúng `expectedResultVersion`; create chỉ nhận absent/0. MC/mixed do server chấm authoritative; command essay-only của mixed giữ nguyên answers, mã đề và provenance phần TN hiện hữu. Source `omr|qr_scan` bắt buộc metadata `detectionStatus='accepted'`; MC/mixed còn phải khớp `examVersion` và `questionCount`. Mutation receipt scope parish+user commit cùng result; retry cùng payload không rewrite/audit lại. | admin / chunhiem / phuta | `{ session, saved, upserted, total, adjustments, items: [{ clientMutationId?, studentId, status: 'created'\|'updated'\|'duplicate', serverScore, resultVersion }] }` | 403 ngoài lớp, 400 payload/provenance không hợp lệ, 409 completed, `EXAM_RESULT_VERSION_CONFLICT` hoặc `IDEMPOTENCY_CONFLICT` |
| `DELETE /api/exams/:id/results/:studentId` | Xóa 1 kết quả (chỉ phiên `draft`) + audit `EXAM_DELETE_RESULT` | admin / chunhiem / phuta | `{ deleted: true, studentId }` | 403 ngoài lớp, 404 không tồn tại, 409 phiên đã hoàn tất |
| `GET /api/exams/:id/results` | Kết quả phiên kèm `studentCode/studentName/holyName`, `answers`, `essayScore` (mixed), `scanMetadata` (aggregate diagnostics, không ảnh), `resultVersion`, `attemptFingerprint`, `capturedAt`, `savedBy`, `savedAt` | auth theo class | `{ session, results }` | 403 ngoài lớp |
| `POST /api/exams/:id/complete` | Finalize server-authoritative trong 1 transaction: validate lock/conflict, ledger + assessment entries + grade projection + session completed + audit; **idempotent** (ADR-048) | admin, chunhiem | `ExamFinalizationResult` (session/items/committed/conflicts) | 403 ngoài lớp / semester locked, 409 chưa có kết quả |
| `POST /api/exams/:id/reopen` | `completed` → `draft` (re-scan) + audit `EXAM_REOPEN` | admin | `ExamSession` | — |
| `DELETE /api/exams/:id` | Xóa phiên chấm **draft** (tạo nhầm) — xóa session + toàn bộ `exam_results` (chưa finalize) trong 1 transaction + audit `EXAM_DELETE_SESSION` (ADR-025) | admin / chunhiem / phuta (lớp mình) | `{ deleted: true, sessionId, resultsDeleted }` | 403 ngoài lớp, 404 không tồn tại, 409 phiên đã hoàn tất (đã ghi bảng điểm — không xóa được, admin mở lại trước nếu cần) |
| `PATCH /api/exams/:id/answer-key` | Cập nhật answer key + re-score kết quả OMR (ADR-043) — chỉ phiên draft MC/mixed; mixed: rescore phần TN theo trọng số câu, GIỮ nguyên essay_score; giữ nguyên quick_entry thuần | admin / chunhiem / phuta (lớp mình) | `{ session, rescored, skipped }` | 403 ngoài lớp, 400 answer key không hợp lệ, 409 phiên đã hoàn tất, 400 không phải MC/mixed |
| `PATCH /api/exams/:id/answer-variants` | Thay map đáp án A–H và re-score theo version trong transaction; A bắt buộc, không được xóa version đang có result; draft MC/mixed (mixed chỉ áp dụng phần TN) | admin / chunhiem / phuta (lớp mình) | `{ session, rescored, skipped }` | 400 JSON/key không hợp lệ, 403 ngoài lớp, 409 completed/version đang dùng |
| `POST /api/exams/:id/variant-manifests` | Tạo và khóa 1–8 mã đề A–H từ ngân hàng câu hỏi; body `{ variantCount, seed? }`. Server materialize thứ tự câu/lựa chọn và answer key, lưu hash/seed bất biến | admin / chunhiem / phuta (lớp mình) | `ExamVariantManifestSet` + session đã cập nhật | 400 câu hỏi/đáp án không an toàn để đảo, 403 ngoài lớp, 409 không draft/đã có result/manifest đã tồn tại |
| `POST /api/exams/barcode/decode` | Decode v3 `T3:{sessionHex8}:{studentHex8}:{I|F}:{questionCount}:{A-H}:{checksum4}`, v2 `T2:*`, compact v1 `TE:*` hoặc legacy. V3 validate checksum có mã đề. | auth | `{ sessionId, studentId, ..., protocolVersion?, templateMode?, examVersion?, formChecksum? }` | 400 format/checksum không hợp lệ, 403 ngoài lớp, 404 phiên không tồn tại |

## 10A. DAILY ENTRIES API (`/api/daily-entries`) — Tier 2

Client: `src/lib/api.ts` (`saveDailyEntries`, `deleteDailyEntry`, `getDailyEntries`) · Store: `src/stores/dailyGradeStore.ts` (`addEntry`/`removeEntry` enqueue op `daily_entry`, `fetchDailyEntries`, `serverEntries`) · UI: `DesktopDailyGradeEntry.tsx` / `MobileDailyGradeEntry.tsx` (block read-only "Bài thi máy · chỉ xem") · Server: `server/src/routes/dailyEntries.ts` + `server/src/services/dailyEntryService.ts` · Quy tắc: `docs/BUSINESS_RULES.md` §12.1 (hai nguồn vào, một trung bình; override thắng)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/daily-entries/batch` | Batch upsert attempts nhập tay (`entries[]` — `id` (= mã entry ổn định `DG-…`), `studentId`, `academicYear` `YYYY-YYYY`, `semester` 1–2, `scoreType` ∈ `oral\|15m\|1period`, `value` 0–10, `date?` YYYY-MM-DD; tối đa 500). Mỗi entry 1 transaction: check lớp + khóa sổ trong tx, idempotent qua PK `(parish_id,id)` — retry trùng payload → `duplicate`, cùng id khác payload → item `error` `IDEMPOTENCY_CONFLICT`. Partial-success itemized (ADR-008). | admin / chunhiem / phuta (lớp mình, `getUserClassIds` + check trong tx) | `{ saved, duplicates, errorCount, total, items: [{ id, studentId, scoreType, status: 'created'\|'duplicate'\|'error', serverScore, reason? }] }` | 401, 403 role; item `error` khi ngoài lớp / kỳ khóa / trùng id khác payload |
| `DELETE /api/daily-entries/:id` | Xóa 1 attempt tay (chỉ `source='manual_entry'`, check lớp + khóa sổ trong tx) + audit `DAILY_ENTRY_DELETE` | admin / chunhiem / phuta (lớp mình) | `{ deleted: true, id }` | 403 ngoài lớp/kỳ khóa, 404 không tồn tại, 409 dòng máy/baseline |
| `GET /api/daily-entries?classId=&studentId=&semester=&academicYear=&scoreType=` | List attempts (tay + máy, loại `legacy_baseline`) cho UI daily read-only. Bắt buộc `classId` hoặc `studentId` (fail-closed scope) | auth theo class | `DailyLedgerEntry[]` (`{ id, studentId, academicYear, semester, scoreType, value, date, origin: 'manual'\|'machine', examSessionId }`) | 400 thiếu scope, 403 ngoài lớp, 404 lớp không tồn tại |

- **Daily idempotency**: `id` entry ổn định từ lúc tạo local qua mọi retry; offline queue entity `daily_entry` op `CREATE` (add-then-remove khi offline được compact hủy cả cặp), `DELETE` khi xóa. Sync item `error` trong response 200 → permanent-fail hiển thị Diagnostics (không nuốt).
- **Averaging SSOT (XD-08):** server tính trung bình toàn ledger trong cùng transaction với add/delete daily entry hoặc Exam complete. Grade update lỗi → rollback ledger mutation; duplicate cùng payload không rewrite Grade/audit. Client chỉ enqueue ledger và preview; authoritative Grade pull không bị partial-device attempts ghi đè. `serverScore` trong daily ACK vẫn là score của entry, không phải average cột; Grade được lấy qua grade pull. Legacy client `daily_avg` payload được server tính lại từ ledger (thiếu ledger mà gửi giá trị → lỗi 409 ở single Grade write / item error ở batch). Legacy null-clear không được xóa average khi còn entries. Undo Grade import trả `not-clean` nếu audit gần nhất là daily-derived projection. `legacy_baseline` chỉ dựng khi sổ trống và có Grade daily_avg cũ; không auto-repair lịch sử.
- **Machine attempts read-only**: UI render block riêng có nhãn "Bài thi máy · chỉ xem (tính vào trung bình)", không nút xóa/sửa; manual entries giữ handler `addEntry/removeEntry` hiện tại.

- **Finalize do server làm authority (ADR-048)**: `POST /complete` ghi finalization ledger + assessment entries + grade projection + session completed trong một transaction; client không tự commit grades. Trước bước finalize, ADR-049 còn yêu cầu server tự tính lại score MC scan ngay tại `POST /results`.
- **Continuous result mutation (ADR-067/107)**: `api.saveExamResults` gửi cùng `Idempotency-Key`, `clientMutationId` và `expectedResultVersion` ổn định trong mọi retry của một request. Offline queue lưu từng item dưới entity `exam_result`/key `sessionId::result::studentId`; op được claim nguyên tử `pending|retrying → processing` trước network I/O nên lần quét mới không thể compact/ghi đè payload đang in-flight. Processing lease hết hạn được phục hồi về retrying. Chỉ mutation thật sự dùng chung queue ID mới supersede ledger cũ; `complete` là barrier sau các item chưa terminal. Stale OCC trả conflict và phải refresh/confirm, không tự replay ghi đè.
- **Continuous pilot control (ADR-068; client-only, không đổi API)**: `VITE_CONTINUOUS_SCAN_PILOT_REQUIRED` mặc định fail-closed; chỉ `VITE_CONTINUOUS_SCAN_PILOT_PARISH_IDS`/`...USER_IDS` mở fast queue. Durable-write/idempotency/terminal-sync failure mở circuit local theo scope hash; `VITE_CONTINUOUS_SCAN_CIRCUIT_REVISION` reset circuit chỉ qua release mới. Khi bị khóa, UI vẫn dùng stable batch và server contract trên giữ nguyên.
- **Field evidence recorder (ADR-069; client-only, không đổi API)**: System Diagnostics cho operator chuẩn bị run 30/100 phiếu và xuất JSON sau khi hoàn tất. Recorder chỉ đọc lifecycle đã có của proposal, durable queue và item acknowledgement; không thêm request/header/server telemetry. Manifest không chứa ảnh/QR/đáp án hay tenant/user/student/session ID; mutation ID chỉ được đối chiếu bằng token băm nội bộ theo run và không xuất.
- **Qualification v2 (ADR-070; build/client-only, không đổi API)**: build inject public non-secret `releaseId` từ `VITE_APP_RELEASE_ID` hoặc platform Git SHA; field recorder từ chối placeholder. Manifest/targets schema v2 thêm `profile.releaseId`, `runElapsedMs`, `papersPerMinuteMin` và `proposalLatencyDriftRatioMax`. CLI có thể gộp nhiều completed export nhưng không dedupe; server request/response, auth, tenant và scoring contract không đổi.
- **Release health contract (ADR-100)**: public `GET /health` trả `{ status, service, releaseId, database, timestamp, uptimeSeconds }`; `releaseId` là immutable Git SHA đã sanitize hoặc `unknown|invalid`, không chứa secret. Production deployment chỉ PASS khi backend `releaseId` và frontend meta `catevia-release` cùng bằng CI `VERIFIED_SHA`.
- **`academicYear` mặc định (EXAM-GAPS, 2026-08-15)**: client `examStore.createSession` tự điền `academicYear` = **năm học đang hoạt động của giáo xứ** (`academicYearStore.resolveActiveYear()`) khi không truyền — cùng nguồn với lưới điểm; KHÔNG lấy theo ngày hiện tại (tránh phiên rơi vào năm mới khi giáo xứ đang làm năm cũ trong giai đoạn chuyển tháng 8).
- **Trắc nghiệm bắt buộc đủ đáp án (client side)**: UI yêu cầu điền đủ `answerKey` cho toàn bộ `questionCount` câu trước khi tạo phiên MC — thiếu câu → OMR detector không chấm được (isCorrect undefined → điểm sai).
- **Manifest lock (ADR-094)**: sau khi `variantManifests` tồn tại, hai endpoint PATCH answer key/variants trả 409 `VARIANT_MANIFEST_LOCKED`. Client chỉ cho in đề B–H bằng question set materialize của manifest; session legacy/no-manifest fail closed về đề A. Phiếu trả lời rời vẫn có thể dùng A–H cho bộ đề ngoài hệ thống.
- **Tạo phiên trên mobile (UI-only)**: `ExamSessionView` mở form thành bottom-sheet có header/nút đóng và footer tạo phiên sticky; lựa chọn hình thức chuyển thành các hàng dễ chạm, lưới đáp án thành từng hàng với nút A/B/C/D 44px và hiện tiến độ `Đáp án: X/N`. Không đổi payload, validation, quyền, hay quy tắc cảnh báo tạo trùng.
- **Cảnh báo tạo trùng (client side)**: nếu đã có phiên `draft` cùng lớp + môn + loại điểm (cùng học kỳ), UI yêu cầu xác nhận trước khi tạo thêm — KHÔNG chặn cứng (re-exam là nhu cầu hợp lệ, không có unique constraint server).
- Xung đột điểm tay (`_source='manual'|'excel_import'`): client **không ghi đè** — trả vào `ExamFinalizeResult.conflicts` và chặn học sinh đó, admin xử lý qua Override (Ma Trận).

### 10.1 Exam Features — Phiếu Trả Lời & Đề Thi (v2.6 — 2026-08-16)

| Feature | Module | Notes |
| :--- | :--- | :--- |
| **Batch Print Progress Bar** | `AnswerSheetModal.tsx` | Animated percentage bar + `Loader2` spinner during batch print; buttons disabled while printing |
| **PDF Export** | `ReportExportService.exportPdf()` | Opens print dialog with "Save as PDF" guidance; single + batch mode |
| **Barcode (Code128)** | `src/lib/barcode.ts` | Pure SVG generator + decoder (no deps); quiet zone 10 modules; decoder scans multiple rows in the upper camera region and validates Code128B checksum |
| **Code Scan Pipeline v4** | `qr.ts` + `cameraFrame.ts` + `cameraStillCapture.ts` + `examCodeScanner.ts` + `examScanIdentity.ts` + `omrFrameScheduler.ts` + `omrScanConsensus.ts` + `scanQuality.ts` + `scanDiagnostics.ts` + `ExamScanModal.tsx` | Phiếu production dùng T3 khi có mã đề (template/số câu/version/checksum); T2/TE/legacy vẫn parse và map A. Live QR chạy 3 frame `live_fast`/1 frame `live_recovery`, đều normal-only; explicit capture/file/batch dùng `exhaustive` 9 normal + 4 `invertFirst`; Code128 fallback mọi mode. Identity TTL 8s/recheck 1,2s và dùng cùng recovery cadence. Auto candidate OMR 960px, QR/recheck/final 1280px; fixed still tới 2200px, upload 1400px; 2-frame consensus giữ nguyên. OMR scratch arena chỉ giữ dữ liệu dẫn xuất cho frame ≤2,5 triệu pixel trong phiên xử lý và được zeroize/release khi dừng camera hoặc kết thúc batch. RAF dùng callback cấu hình mới nhất và backpressure neo sau completion. Quality bad reject sớm; `review_required` khóa Save. Diagnostics v2 chỉ counter/histogram, không ID/ảnh. |
| **Batch Image Grading v4** | `ExamBatchScanModal.tsx` + `examBatchScan.ts` | Chọn tối đa 500 ảnh/thư mục; xử lý tuần tự để giữ trần RAM, commit UI mỗi 8 ảnh/yield sau từng ảnh; generation token + `finally` hủy continuation/zeroize scratch khi đóng modal; fail-closed theo session/student/count/version/OMR/quality; quality bad short-circuit; chỉ accepted proposal được lưu sau xác nhận. Live batch pause analysis nhưng giữ camera stream giữa hai phiếu. |
| **Exam Studio & Analytics** | `ExamVariantsModal.tsx` + `server/src/services/examVariantManifest.ts` + `examAnalytics.ts` | Tạo/khóa manifest A–H bất biến; session legacy còn được quản lý key/re-score thủ công; phổ điểm, item correct/blank rate và point-biserial không sửa dữ liệu. |
| **Local Review Snapshot** | `scanReviewStorage.ts` + scan/results UI | Opt-in, JPEG ≤960px, Dexie tenant-scoped AES-GCM, TTL 24h, không API; xem/xóa trên cùng thiết bị. |
| **Stable Mobile Grading** | `GuidedGradeModal.tsx` + `ExamSessionView.tsx` + `ExamScanModal.tsx` | Nút **Chấm Ổn Định** mở wizard mobile: tìm/chọn học sinh trong `classStudents` của phiên, hiển thị điểm đã lưu, rồi chọn `Chỉ quét OMR` (fixed identity, không decode QR, source=`omr`) hoặc nhập điểm trực tiếp (source=`quick_entry`). Fixed-identity OMR không tự chạy trên mọi frame: người dùng phải căn phiếu và bấm **Chụp & chấm**, ngăn ghi nhận khi chưa đưa vùng đáp án vào khung. Điểm client validate 0..maxScore và server tiếp tục validate/authorize theo session class; cả hai đường dùng `examStore.saveScores`, nên giữ offline queue/upsert hiện có. Modal chỉ báo lưu thành công/đóng sau khi store trả acknowledgement khác `null`. |
| **OMR Field Evidence Preflight** | `SystemDiagnosticsModal.tsx` + `omrSequenceEvidence.ts` + `omrSequenceQualification.ts` | Card local-only hiển thị active progress và 5 readiness check: unresolved routed, reload recovered, responsiveness observer attach thật, memory sample source, zero safety failure. Đây là preflight, không phải qualification PASS. Manifest và target scaffold tải từ UI chỉ lấy completed run có `releaseId` bằng build hiện tại; target scaffold giữ toàn bộ metric `null`, run build cũ được cảnh báo/giữ riêng. Không gọi API, không upload telemetry và không đưa ID/token/timestamp vào summary/export. |
| **Supervised Continuous Queue v2** | `ExamScanModal.tsx` + `examContinuousScan.ts` + `examStore.queueScores` + sync engine | Checkbox `Quét liên tiếp` giữ human-confirm cho từng proposal, nhưng sau Save chỉ chờ encrypted local mutation/ledger rồi resume camera. Fingerprint chặn duplicate; same-student/different-attempt cần explicit conflict confirmation; rearm theo identity mới hoặc old-sheet absence 3 observation/≥900ms. Ledger hiển thị Chờ/Đã đồng bộ/Cần xử lý/Lỗi. Flag `VITE_CONTINUOUS_SCAN_V2=false|off|0` trở về stable path; không bật unattended/default auto-save. |
| **Mobile WebKit Camera Support** | `ExamScanModal.tsx` | Tự động gán MediaStream vào thẻ `<video>`, tương thích iOS Safari WebKit (`autoPlay`, `playsInline`, `onloadedmetadata`), đổi camera trước/sau |
| **Photo Upload Fallback** | `ExamScanModal.tsx` | Nút "Tải ảnh" / "Chọn ảnh" cho phép chụp từ app camera gốc hoặc tải file ảnh phiếu A4 để chấm điểm trực tiếp |
| **A4 Framing Overlay** | `ExamScanModal.tsx` | Khi chưa có định danh, chỉ hiện khung vuông QR gần camera (bước 1/2). Khi đã khóa mã và chấm trắc nghiệm, hiện khung OMR dẹt theo đúng tỷ lệ vùng trả lời thực tế thay vì khung lớn phủ vùng câu hỏi (bước 2/2). Phiếu tự luận tiếp tục dùng khung A4/4 marker thật lấy từ SSOT `CORNER_MARKERS`. Overlay chỉ là hướng dẫn; detector vẫn quyết định theo marker, geometry, bề mặt giấy và confidence. |
| **Barcode Decode API** | `POST /api/exams/barcode/decode` | Server validates barcode format + session + class access |
| **Watermark** | `examSheets.ts` | CSS diagonal parish name watermark (4% opacity) on exam papers |
| **Flexible maxScore** | `answerSheetTemplate.ts` | `scoreToCell(score, maxScore)` — dynamic grid rows for scores >10 |
| **Confidence Tracking** | `ExamScanModal.tsx` | Per-answer confidence stored as `_confidence` in answers JSON |
| **OMR Fail Reasons** | `ExamScanModal.tsx` | Vietnamese tooltips for 10+ OMR failure codes, gồm `NO_PAPER_SURFACE`; trạng thái xanh xác nhận mã được giữ tối đa 8 giây và nêu riêng lý do OMR/chất lượng chưa đạt, trạng thái vàng dành cho mã chưa thấy/không hợp lệ. |

`scanMetadata.engineVersion` của đường mới là `omr-v4-live` hoặc `omr-v4-batch`; đây là field trace additive, server tiếp tục sanitize đệ quy và recompute score như trước. Không có ảnh/frame/base64 trong payload.
Corpus gate ADR-060/062 hiện chỉ định nghĩa `workload=multiple_choice`; report/gate phải tách exact engine/device/runtime/resolution/template/questionCount và release phải cung cấp required profile matrix. Trạng thái accepted ở client vẫn là proposal có thao tác Save; score-grid written không được coi là đã đạt field-accuracy gate.
| **Exam Type Instructions** | `AnswerSheetModal.tsx` | Differentiated MC vs Written instructions |
| **Multi-fill + Blank Highlights** | `ExamScanModal.tsx` | Amber (multi-fill ⚡) + Gray (blank —) in scan detail grid |
| **Multi-Format Exam Exporter** | `src/utils/examExporter.ts` + `ExamExportModal.tsx` | Xuất đề thi 6 định dạng client-side (Word .doc, Excel .xlsx đa sheet, Plain Text .txt, Markdown .md, JSON .json, In/PDF); cấu hình hiển thị đáp án, lời giải, khung thông tin học sinh, ô trả lời trắc nghiệm, bố cục 1/2 cột, mã đề A–H; 100% offline. |
| **Re-score on Answer Key Edit** | `ExamSessionView.tsx` + `examService.ts` | `PATCH /api/exams/:id/answer-key` re-scores OMR results, preserves quick_entry |
| **Mixed Exam (TN + TL)** — EXAM-MIXED v2.7 2026-08-24 (ADR-053) | `examParser.ts` + `ExamImportModal.tsx` + `ExamSessionView.tsx` + `QuickScoreEntry.tsx`/`GuidedGradeModal.tsx` + `ExamResultsTable.tsx` + `examService.ts` | Import đề kết hợp: parser nhận diện `PHẦN I. TRẮC NGHIỆM / PHẦN II. TỰ LUẬN`, Excel cột `Loại`+`Điểm`; preview tách 2 loại câu; tạo phiên `examType='mixed'` (`questionCount` = số câu TN). Chấm: OMR tự cộng phần TN theo trọng số từng câu, GLV nhập điểm TL (trần = Σ points câu TL) qua QuickScore/GuidedGrade; server tổng hợp authoritative + merge 2 pha không mất dữ liệu. In đề mixed: khung OMR chỉ gồm câu TN, câu TL in dòng kẻ trình bày. Chi tiết quy tắc: BUSINESS_RULES §21.5. |

## 8. PARISH SETTINGS API (`/api/settings`)

| Endpoint | Mô tả | Quyền | Success | Lỗi |
|---|---|---|---|---|
| `GET /api/settings` | Đọc parish settings (gradeWeights, attendancePolicy, promotionPolicy, sundayMassTime, academicYear, currentSemester) | auth (mọi role) | `{ data: ParishSettings }` | — |
| `PUT /api/settings` | Cập nhật toàn bộ hoặc từng phần (`gradeWeights`/`attendancePolicy`/`promotionPolicy` merge sâu; scalar field replace) | admin | `{ data: ParishSettings }` | 400 `UPDATE_SETTINGS_FAILED` (validation/DB) |

- `sundayMassTime: string` — định dạng **`HH:MM`** (zod regex `^([01]\d|2[0-3]):[0-5]\d$`), mặc định `'08:00'`. Client: `src/stores/settingsStore.ts` (`ParishSettings.sundayMassTime`, default `'08:00'`).
- Client hiển thị giờ lễ: `src/hooks/useSundayReminder.ts` đọc `useSettingsStore.getState().settings.sundayMassTime`, format hiển thị `formatHourMinute` (`'08:00'` → `'8h00'`, `'08:30'` → `'8h30'`).
- Lưu trữ server: `system_settings` key `parish_system_settings` (PK toàn cục — single-parish deployment); nếu JSON thiếu `sundayMassTime` → fallback `'08:00'`.
- Scheduler dùng cùng nguồn này (SSOT): `sundayReminderScheduler` đọc qua `getSundayMassTime(parishId)` — xem `docs/BUSINESS_RULES.md` §10.7.

## 11. BACKUP API (`/api/backup`)

> **A07 (2026-08-10):** cả hai endpoint yêu cầu **RE-AUTHENTICATION** — gửi kèm `adminPassword`
> (mật khẩu HIỆN TẠI của admin đang thao tác, bcrypt verify qua `verifyAdminReauth` SSOT).
> Thiếu / rỗng → `400` (zValidator); sai → `401 INVALID_ADMIN_PASSWORD` + audit `*_FAILED`;
> rate limit `adminReauthRateLimiter` 10/60s/IP (dùng chung key với reset-password).

### `POST /api/backup/export` — admin

Export partial profile parish **14 bảng nghiệp vụ**: students, grades, attendance, classes,
semester_locks, grade_overrides, promotion_records (payload key giữ tên legacy
`promotionSnapshots`), question-bank items/versions/blueprints/rules, exam_sessions,
exam_question_snapshots và exam_results + `checksum` SHA256 + `counts`.

> **A22 (2026-08-10; cập nhật XD-09 2026-09-07):** KHÔNG phải "100% database" —
> auth/audit/config/import/outbox/notification (kể cả Telegram legacy), academic snapshot, attendance-session,
> assignment, assessment/finalization ledger, leave/finance/event và mutation receipts không nằm
> trong profile. Chúng không được giả định là dữ liệu phái sinh có thể tự sinh lại. Restore chỉ chạy
> khi lifecycle/dependency preflight chứng minh việc thay parent rows không xóa hoặc rebind các facts
> bị loại trừ; nếu không, endpoint trả 409 và yêu cầu full-schema recovery.
> Để khôi phục toàn bộ DB (kể cả users/audit), dùng **backup file DB cấp hệ thống**
> (`scripts/backup-db.mjs` / `BACKUP_DIR` — `docs/DEPLOYMENT_GUIDE.md` §5).

- **A-NEW-28 (2026-08-11):** `POST` body `{ adminPassword }` (≤128 ký tự) — chuyển từ
  `GET ?adminPassword=` trong URL (tránh mật khẩu lọt vào access logs/history).
- 200: `{ version: '2.1-question-bank', parish, exportedAt, checksum, counts, data: { students, grades, ... } }` (stream attachment `parish-lms-backup-<date>.json`)
- 400 thiếu `adminPassword`; 401 sai mật khẩu; 429 quá nhiều lần thử (10/60s/IP)
- Audit: `EXPORT_BACKUP` (thành công) / `EXPORT_BACKUP_FAILED` (thất bại) — userId, entityId=parishId, ip, userAgent.

### `POST /api/backup/restore` — admin (DESTRUCTIVE)

**XD-09 containment:** JSON là partial-data profile, không chứa đủ aggregate học vụ để phục hồi năm đã chốt hoặc các dependency/provenance ngoài payload. Nếu current parish có `academic_year_snapshots`, năm `is_locked=1` hoặc status FINALIZED/PROMOTED/ARCHIVED, trả **409 `RESTORE_PROTECTED_ACADEMIC_STATE`**. Nếu có assessment ledger, exam mutation/finalization receipt, leave request, student fee/financial transaction, import rollback provenance, grade-import receipt/mapping memory, student/staff assignment, attendance session, notification history/delivery intent, outbox chưa dispatch, hoặc exam-question snapshot mà backup legacy 2.0 không mang theo, trả **409 `RESTORE_UNSUPPORTED_DEPENDENCIES`**. Cả hai check chạy trước safety-write và lặp lại trong transaction trước delete để đóng concurrent-write window. Không trường hợp 409 nào delete/insert business data hoặc tăng client generation. Cần quy trình full-DB recovery riêng; không tự xóa evidence/dependency để ép JSON restore chạy. Đây không phải chứng nhận full-DB recovery hay sửa dữ liệu đã mất trước remediation.

Sau khi preflight xác nhận không có dependency ngoài profile, thay atomically 14 nhóm dữ liệu
nghiệp vụ tenant-scoped từ payload; auto safety snapshot lưu trước khi xóa (`ensureSafetyDir`).

- Body: `{ adminPassword, parish, version, exportedAt, checksum, data: { students, grades?, attendance?, classes?, semesterLocks?, gradeOverrides?, promotionSnapshots?, examSessions?, examResults? } }`
  - `adminPassword` **BẮT BUỘC**; `data.students` **BẮT BUỘC** (mảng, có thể rỗng).
  - `checksum` **BẮT BUỘC** (SHA256 hex64) — bảo vệ khỏi file hỏng (corruption);
    sai = `400` (message chứa "Checksum"). KHÔNG phải cơ chế chống giả mạo (không có secret).
  - `parish` **BẮT BUỘC** — phải khớp parish của admin đang thao tác, sai = `400 RESTORE_PARISH_MISMATCH`
    (chống restore nhầm file giáo xứ khác).
- Pipeline: auth → role(admin) → rate limit → zValidator → `verifyAdminReauth` → parish guard
  → checksum → lifecycle/dependency preflight → safety snapshot (fail-closed) → lặp lại preflight
  trong transaction → DELETE (fail-fast, không catch) → UPSERT 9 bảng (`onConflictDoUpdate`, kể
  cả semesterLocks/gradeOverrides/promotionSnapshots) → verify counts thực tế → tăng
  `purge_version`/client-data generation + audit `RESTORE_BACKUP` **trong cùng transaction**.
- 200: `{ success: true, message, counts, verified: true, purgeVersion }`; 400 thiếu
  field/checksum/parish mismatch; 401 sai mật khẩu; 409 protected lifecycle/unsupported dependency;
  500 + audit `RESTORE_BACKUP_FAILED` + **rollback toàn bộ** nếu bất kỳ bước transactional nào fail
  (không commit nửa chừng). Success audit failure cũng rollback restore, không trả false failure sau commit.
- > **A19–A21 (2026-08-10):** restore fail-closed — lỗi DB không còn bị nuốt; trùng ID được
  > upsert (thay vì bỏ im lặng); counts trả theo dữ liệu THỰC TẾ sau restore (verify).
  > **A22 (2026-08-10):** restore insert lại đủ 9 bảng kể cả semesterLocks/gradeOverrides/
  > promotionSnapshots — ghi chú A09 cũ ("restore bỏ qua") đã HẾT HIỆU LỰC.

### Client (A07)

`src/components/common/BackupRestoreModal.tsx` — ô "Mật Khẩu Admin (xác nhận)" bắt buộc trước khi
export/restore; export và restore đều gửi `adminPassword` **trong body POST** (A-NEW-28 — không
còn `?adminPassword=` trong URL); mật khẩu bị xóa sau khi thành công. Sau khi server ACK restore,
client **không hydrate từ file upload**: file chỉ là command input và server có thể rewrite tenant/
normalize row. Trước POST, client từ chối restore nếu thiết bị hiện tại còn mutation của chính user ở
`pending|processing|retrying|failed`. Sau ACK, client bắt buộc nhận `purgeVersion`, gọi
`resetClientData(purgeVersion)` để xóa Dexie/local state rồi đăng xuất; không dùng snapshot cũ hoặc
full-pull trong session đã bị thay generation. Thiết bị khác probe generation trước sync và reset trước
khi queue cũ được push; legacy device chưa có local marker nhưng còn queue cũng reset thay vì lấy server
generation làm baseline. Nếu local reset lỗi sau server commit, UI báo rõ restore đã commit và không mời
retry destructive command; thiết bị vẫn fail-closed khỏi sync cho đến khi reset thành công.

## 12. PDF EXPORT API (`POST /api/reports/generate-pdf`) — nhánh PDF (2026-08-12)

Client: `src/lib/api.ts` (`generatePDF`) · Server: `server/src/routes/reporting.ts` + `server/src/services/pdfService.ts` (Puppeteer) · HTML templates: `src/utils/pdfGenerator.ts` (SSOT client — server chỉ nhận HTML string)

| Endpoint | Mô tả | Quyền | Response | Lỗi |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/reports/generate-pdf` | Nhận `{ htmlContent: string, options?: { format?: 'A4'\|'A3'\|'Letter', landscape?: boolean, margin?: {...} } }` → Puppeteer render → trả PDF bytes (`application/pdf`, `Content-Disposition: attachment`) | admin, chunhiem, phuta | Binary PDF | 400 `BAD_REQUEST` (thiếu htmlContent/không phải string), 401/403 auth, 500 `PDF_GENERATION_FAILED` |

- **Client flow**: `PrintReportModal` tạo HTML (phiếu điểm / chứng chỉ / thẻ thiếu nhi A6 — `BATCH_PHOTO_CARDS` mới) qua `pdfGenerator.ts`, in trình duyệt trực tiếp hoặc **nút "Xuất PDF" gửi HTML lên server** (P0 2026-08-14 — trước đây không có UI caller) để render PDF thật qua Chromium headless.
- **Browser lifecycle**: singleton Puppeteer browser (lazy launch, `--no-sandbox --disable-dev-shm-usage`), `closeBrowser()` gọi ở SIGTERM/SIGINT (reporting.ts).
- **✅ ĐÃ ĐÓNG (A-NEW-42, 2026-08-13)**: endpoint nhận HTML tùy ý từ client + Chromium chạy `--no-sandbox` — đã triển khai `sanitizePDFHTML` (`utils/pdfSanitizer.ts`) + **Puppeteer Request Interception** chặn `file://` (LFI), localhost/IP nội bộ (SSRF), resource type không cần thiết (websocket/xhr/fetch) — chi tiết `server/src/services/pdfService.ts` + `docs/SECURITY_AUDIT_LOG.md` A-NEW-42.






## 13. UNDO IMPORT ĐIỂM API (`POST /api/grades/undo-import`) — ADR-039 (2026-08-12)

Client: `src/lib/api.ts` (`undoGradeImport`) · Server: `server/src/routes/grades.ts` + `server/src/services/gradeService.ts::undoGradeImport` · UI: `src/components/common/ExcelGradeImportModal.tsx` (nút "Hoàn Tác Đợt Nhập Trước")

| Endpoint | Mô tả | Quyền | Response | Lỗi |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/grades/undo-import` | Body `{ semester: 1\|2, academicYear: string, studentIds: string[] (1–500) }` → đảo ngược lần ghi điểm gần nhất của từng bảng điểm trong đợt import (audit entry mới nhất `entityType='grade'`: `CREATE` → xóa row, `UPDATE` → khôi phục `oldValue`). **GRADE-UNDO-F1 (2026-08-21)**: entry UPDATE chứa field `_source === 'manual'` (GLV đã sửa tay sau import) → status `not-clean`, không hoàn tác. Trả `{ results: [{ studentId, status, message? }] }` | admin (toàn parish), chunhiem (chỉ lớp được bổ nhiệm — check trong tx, ADR-016 S24) | 200 `{ success, data: { results } }` | 400 zod (semester/studentIds), 401/403, 409 không dùng |
| `POST /api/grades/restore-batch` | Khôi phục điểm gốc cho các ô điểm đã bị ghi đè — body `{ items: [{ gradeId, scoreField }] }` (`scoreField` ∈ oral/15m/1period/midterm/final/daoDuc). Admin: toàn parish; chunhiem: được kiểm tra class access từng item (403). Audit qua `gradeApplicationService.restoreScoreBatch` | admin + chunhiem | 200 `{ success, data: { results } }` | 400 zod, 403 ngoài lớp, 401/403 |

- **Status per item**: `restored` (UPDATE → về trạng thái trước import), `deleted` (CREATE → xóa bảng điểm mới), `not-found` (không có học sinh/bảng điểm), `no-audit` (không có audit để restore), `not-clean` (entry mới nhất không phải CREATE/UPDATE — đã có thay đổi/undo sau đợt nhập → từ chối), `expired` (quá 7 ngày), `forbidden` (chunhiem không có lớp), `locked` (học kỳ đã khóa sổ).
- **Điều kiện áp dụng**: trong vòng **7 ngày** kể từ lần ghi gần nhất; mỗi item 1 transaction riêng (pattern `upsertGradeBatch`); version +1 sau restore (client phải refetch).
- **Audit**: mỗi item ghi `GRADE_UNDO` (entityType `grade`, oldValue = trạng thái trước undo, newValue = trạng thái sau / `null` khi xóa).
- **Client flow**: sau import thành công, `ExcelGradeImportModal` lưu marker `{ studentIds, semester, academicYear, at, count }` mã hóa qua `dexieStorage`, scope `parishId:userId`, cap 500 ID và TTL 7 ngày → hiển thị nút "Hoàn Tác Đợt Nhập Trước (N)" → xác nhận qua dialog tùy chỉnh → gọi API → dialog kết quả → xóa marker → `useGradeStore.fetchGrades()`. Snapshot sai schema/tenant, trùng ID, quá hạn hoặc plaintext legacy đều bị bỏ fail-closed. Nếu không có bản ghi nào khôi phục được, dialog hiển thị lý do đầu tiên và hướng dẫn sửa tay.

## 14. LEAVE REQUESTS API (`/api/leave-requests`) — ADR-033 (2026-08-14)

Client: `src/lib/api.ts` (`getLeaveRequests`, `getPendingLeaveRequestsCount`, `createLeaveRequest`, `reviewLeaveRequest`, `cancelLeaveRequest`) · Store: `src/stores/leaveRequestStore.ts` · Server: `server/src/routes/leaveRequests.ts`

**XD-05 delivery (ADR-111):** sau review commit, route enqueue durable Web/Native Push chung yêu cầu đăng nhập. Trước enqueue và tại mỗi delivery attempt, original parentId phải còn là current parent ACTIVE, chưa xóa, cùng parish, khớp phone trẻ chưa xóa; không retarget sang parent mới. Không gửi ngày nghỉ/tên trẻ/reviewer/reviewNote ra provider. Lỗi enqueue/delivery không rollback review đã commit.

| Method | Endpoint | Mô tả | Quyền | Body / Query | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/leave-requests` | Tạo đơn xin phép nghỉ cho thiếu nhi | `phuhuynh`, `chunhiem`, `phuta`, `admin` | `{ studentId, date, sessionTypes: ('SundayMass'\|'CatechismClass'\|'EucharisticAdoration')[], reason, parentName?, parentPhone? }` | 201 `{ success: true, data: LeaveRequest }` |
| `GET` | `/api/leave-requests` | Lấy danh sách đơn theo phạm vi quyền (phụ huynh: con của mình; GLV: lớp được phân công; Admin: toàn xứ) | `phuhuynh`, `chunhiem`, `phuta`, `admin` | `?classId=&status=&date=&studentId=` | 200 `{ success: true, data: LeaveRequest[] }` |
| `GET` | `/api/leave-requests/pending-count` | Đếm số đơn PENDING trong phạm vi quản lý của người dùng | `chunhiem`, `phuta`, `admin` | Không | 200 `{ success: true, data: { pendingCount: number } }` |
| `PATCH` | `/api/leave-requests/:id/review` | Duyệt (`APPROVED`) hoặc Từ chối (`REJECTED`) đơn xin nghỉ. Khi APPROVED, tự động upsert vào `attendance` (`AbsentExcused`) | `chunhiem`, `phuta` (chỉ lớp phụ trách), `admin` | `{ status: 'APPROVED'\|'REJECTED', reviewNote?: string }` | 200 `{ success: true, data: LeaveRequest }` |
| `DELETE` | `/api/leave-requests/:id` | Hủy đơn xin phép nghỉ (chỉ khi còn ở trạng thái `PENDING`) | `phuhuynh` (đơn của mình), `admin` | Không | 200 `{ success: true, data: { ok: true, id, status: 'CANCELLED' } }` |

---

## 15. PROMOTION BATCH APPROVE API (`/api/promotion/batch-approve`) — ADR-052 (2026-08-21)

**XD-02/03 historical reads:** finalized-year `GET /reports/report-card/:studentId` and `/reports/class-summary/:classId` use the frozen academic cohort, original class label, effective scores and attendance; no recalculation from current parish settings. Current authorization/ownership and soft-delete checks remain in force. A student/class outside the frozen cohort returns 404. Missing/invalid legacy history returns 409 `REPORT_GENERATION_ERROR` with a reconciliation message, not a live-data substitute. Promotion evaluate/approve/retry validate against finalized metrics and policy, with the existing mismatch and override contracts unchanged. Open years remain live. Class fee lists preserve persisted class/year/type fee facts after membership transfer; for finalized years, synthetic unpaid rows require cohort evidence. This does not grant permission to mutate historical fees or imply legacy debt completeness.

**XD-01 completion contract:** single `/promotion/approve` remains snapshot-only. Batch with a destination writes membership and completion receipt atomically. Year wizard list/reconciliation/retry/archive require ACTIVE/LATEST plus a completion receipt for the persisted target year; an approval without receipt remains unresolved. Missing class mapping now produces an item error (and unresolved count), not merely a warning that still permits archive. No public client field can assert completion. Existing legacy rows are not automatically certified or repaired.

Client: `src/lib/api/promotion.ts` (`promotionApiClient.batchApproveStudents`) · Store: `src/stores/promotionStore.ts` (`batchApproveStudents`) · Server: `server/src/routes/promotion.ts`, `server/src/services/BatchPromotionApplicationService.ts`

> **F1 (audit 2026-08-21; hardened ADR-108)**: đây là đường duyệt thăng tiến thủ công SSOT —
> sinh `promotion_records` snapshot + chuyển lớp/ngành **trong cùng transaction**,
> enforce SemesterLock HK2 + policy phía server. Panel "Xét Lên Lớp"
> (`PromotionPanel`) không ghi offline và KHÔNG dùng `PUT /api/students/:id`; mất mạng
> phải giữ nguyên projection và yêu cầu kết nối lại.

| Method | Endpoint | Mô tả | Quyền | Body | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/promotion/batch-approve` | Duyệt thăng tiến hàng loạt (partial success ADR-008). Mỗi item 1 transaction: `approvePromotion` (snapshot + verify GPA/chuyên cần authoritative) → update `students.classId`/`students.branch`. Source phải là class hiện tại; destination phải active/cùng parish/thuộc target year và branch được derive từ destination. Move được áp cho item `skipped` khi replay idempotent | `admin`, `chunhiem` (bị chặn bởi `CanAccessStudentSpecification` + `checkUserClassAccess(nextClassId)`) | `{ items: [{ studentId, academicYear, targetClassId, nextClassId, newBranch?, gpa, attendanceRate, manualDecision?, overrideReason? }], chunkSize? }`; branch-only promotion bị từ chối | 200 Partial-Success Payload (§2): `saved`/`skipped`/`error`; lỗi từng item kèm `reason` |

Lỗi item thường gặp: `403` HK2 chưa khóa (`...chưa được khóa...`), `409` GPA/chuyên cần lệch máy chủ (`DATA_MISMATCH` — client phải lấy giá trị từ `GET /promotion/evaluate/:studentId`), `400` override thiếu lý do, `404` học sinh đã xóa/hết `'Đang học'`.

### Endpoint liên quan — validate năm học (AY-F5, cùng đợt)

| Method | Endpoint | Thay đổi | Lỗi mới |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/classes/academic-years` | Bắt buộc `id` khớp `YYYY-YYYY` (`parseAcademicYear`); dates hợp lệ, start < end, và nằm trong 01/08 năm đầu–31/07 năm sau. Cho phép năm dạy học ngắn hơn, không cho range vượt năm. | 400 `ACADEMIC_YEAR_INVALID` |
| `POST` | `/api/classes` | Trùng `(parish, code, academicYear)` hoặc FK sai trả rõ nghĩa thay vì 500 | 409 `CLASS_CODE_EXISTS`, 400 `INVALID_REFERENCE` |
| `PUT` | `/api/classes/:id` | Như trên | 409 `CLASS_CODE_EXISTS`, 400 `INVALID_REFERENCE` |

UI canonical (ADR-090, amendment 2026-09-02): desktop/mobile dùng một mục `/students?view=students` có nhãn `Danh Sách & Lớp`. Khi `selectedClassId='all'`, UI render lưới thẻ lớp; bấm `Xem danh sách` đặt class filter và render roster của lớp trong cùng mục. Admin thấy create/edit/delete/phân công; GLV không thấy mutation controls. `view=classes` cũ normalize về index kết hợp, `/classes` vẫn là deep-link admin tương thích, và server `POST|PUT|DELETE /api/classes` cùng assignment endpoints vẫn là authority admin-only. Với `GET /api/classes?updatedAfter=...`, mảng rỗng là delta rỗng và client phải giữ catalog hiện có; chỉ full pull không có `updatedAfter` mới thay thế toàn bộ catalog.
| `POST` | `/api/academic-years/:id/copy` · `/:id/promote` | Năm đích bắt buộc định dạng `YYYY-YYYY` | 400 `COPY_YEAR_ERROR` / `PROMOTE_ERROR` kèm message định dạng |

`PromoteSummary` (response của `/promote`) thêm trường `warnings: { studentId, reason }[]` — học sinh không được chuyển lớp do thiếu lớp cùng `code` ở năm mới (PRM-F4); năm học vẫn `PROMOTED`, admin xử lý thủ công.

---

## 16. EXAM LIFECYCLE HARDENING (`/api/exams`) — EXAM-AUDIT (2026-08-21)

| Endpoint | Thay đổi | Lỗi/Response mới |
| :--- | :--- | :--- |
| `GET /api/exams/my-classes` | **Chỉ `admin`/`chunhiem`/`phuta`** (F1); GLV chưa phân công lớp nào → danh sách rỗng, không còn thấy toàn bộ phiên giáo xứ | 403 với role khác |
| `POST /api/exams` | `academicYear` (nếu gửi) bắt buộc định dạng `YYYY-YYYY` (F3); khi bỏ trống, server tự dùng năm hoạt động của giáo xứ qua `getActiveAcademicYearId` (F4) | 400 validation kèm message `YYYY-YYYY` |
| `PATCH /api/exams/:id/answer-key` | Guard draft nằm trong service transaction (F5) — song song với guard route; TOCTOU route-check vs complete đã đóng | 409 `STATE_TRANSITION_INVALID` |
| `POST /api/exams/:id/complete` (re-finalize sau reopen) | Ledger `assessment_entries` được reconcile theo kết quả hiện hành — entry của HS bị xóa kết quả bị dọn, không còn góp vào daily_avg (F2); audit `EXAM_FINALIZE` thêm `orphanLedgerEntriesDeleted` | — |
| `POST /api/exams` (idempotency) | Insert + audit trong 1 transaction; request đồng thời cùng `idempotencyKey` trả về phiên của request thắng thay vì 500 (F6) | — |

Điểm của học sinh bị xóa kết quả sau reopen giữ nguyên giá trị last-finalized (không tự đè dữ liệu trước kỳ thi) — semantics khớp midterm/final; xem BUSINESS_RULES "Tạo phiên chấm" quy tắc (6).

### Question Bank contract (QB-F1/F2/F3 — 2026-08-21)

| Endpoint | Thay đổi | Lỗi/Response mới |
| :--- | :--- | :--- |
| `POST /api/exams` — `questions` | Bắt buộc mảng JSON 1–50 ExamQuestion hợp lệ: `index` 1..50 (integer), `question` string 1..2000, `options.{A,B,C,D}` string ≤500, `correctOption` ∈ A/B/C/D; chuỗi ≤200KB | 400 validation kèm message chỉ câu/index lỗi |
| `PATCH /api/exams/:id/answer-key` | Sau khi đổi key, server **tự sync** `questions[].correctOption` theo key mã A mới (câu nào có trong key); questions hỏng → bỏ qua silently | Response shape không đổi |

Client import Excel (`examParser.parseExamFromExcel`): ô đáp án trống/không hợp lệ → mặc định `A` + warning hiển thị trong preview import (không còn suy đoán từ nội dung phương án).

## 17. CSP VIOLATION REPORT (`POST /api/csp-report`) — OBS-1 (2026-08-24)

| Hạng mục | Giá trị |
| :--- | :--- |
| Mục đích | Thu báo cáo vi phạm Content-Security-Policy từ browser (header `report-uri /api/csp-report` trong securityHeaders — trước đây trỏ vào 404) |
| Auth | **Public by design** (browser gửi tự động, không credential); đã bọc rateLimiter toàn cục + bodyLimit 10MB |
| Body | Chuẩn `{ "csp-report": { ... } }`; payload lạ/JSON hỏng vẫn chấp nhận |
| Response | **204 No Content** luôn — không bao giờ fail; log structured JSON `CSP_VIOLATION` (chỉ field kỹ thuật, không PII) |

### Batch caps tường minh (SEC-BATCH-CAP-1, 2026-08-24)

| Endpoint | Cap mới | Lỗi vượt cap |
| :--- | :--- | :--- |
| `POST /api/students/validate` + `/import` | `rows ≤ 2000` | 400 zod validation |
| `POST /api/grades/batch` | `grades ≤ 2000` | 400 zod validation |
| `POST /api/attendance/batch` | `records ≤ 500` | 400 zod validation |
| `POST /api/parish-profile/people/import` | `people 1..100` | 400 zod/domain validation; cả batch rollback nếu một row lỗi |

> Lưu ý sync client: sync engine gửi toàn bộ pending grades trong 1 call — cap 2000 đủ dư địa nhiều lớp; nếu tương lai vượt cần chunk phía client.

### Atomic class assignments (ADR-099)

`PUT /api/classes/:id/assignments` (admin-only) nhận `{ homeroomTeacherId: string|null, assistantTeacherIds: string[0..20] }` và thay toàn bộ selection trong một transaction cùng audit. `POST|DELETE` class-centric, `PUT /api/users/:id/assignments` và assignment của create-user đều gọi cùng invariant owner. Chỉ account `chunhiem|phuta` chưa xóa ở `ACTIVE|FORCE_PASSWORD_CHANGE` và class active cùng tenant được nhận; admin/parent/inactive bị từ chối. Một cặp không giữ hai vai trò, một lớp tối đa một CN và một user tối đa một lớp CN; partial UNIQUE indexes chặn race. Lỗi trả 400/404 và giữ nguyên assignment cũ.

### Student roster import contract (ADR-064, 2026-08-28)

| Endpoint | Contract chính |
| :--- | :--- |
| `POST /api/students/validate` | Body bắt buộc `{ rows[0..2000], academicYearId }`; year phải tồn tại, chưa khóa, cùng parish. Trả preview/class suggestions/duplicate reason/previous hash. Exact và fuzzy match chỉ xét year đã chọn; tie/lead không đủ phải chọn tường minh. Validation không tạo year. Duplicate ngoài class scope của CN không lộ metadata. |
| `POST /api/students/import` | Bắt buộc cùng `academicYearId` đã validate. `duplicateActions: Record<rowIndex, 'skip'|'update'|'create'>`; thiếu action cho duplicate = `skip`. `fileName ≤255`, mapping/newClasses/serviceExclusions cap 2000. Partial-success itemized. `studentChanges` chỉ chứa record commit. Row + audit/provenance/counter commit cùng transaction; batch/class bootstrap atomic; stale `processing` từ process trước được recover từ provenance. |
| `POST /api/students/undo/:batchId` | Admin-only, 24h; trả `{ undone, errors, items: [{ rowIndex, studentId, action, status: 'undone'\|'blocked'\|'already_undone', message? }], classesDeleted }`. Exact snapshot + post-import mutation/dependency gate gồm fee; batch có thể `partial_undone` và retry idempotently. |

Lỗi 500 từ validate/import trả message chung kèm mã tham chiếu; chi tiết DB/stack chỉ nằm trong server log. Client chặn file >10 MB hoặc >2000 data rows trước request.

Fast path ADR-066 xử lý các row create hợp lệ theo chunk 40 trong transaction multi-row. Bất kỳ lỗi constraint/race nào rollback nguyên chunk rồi retry từng row, vì vậy response chỉ công bố `studentChanges` sau commit và vẫn giữ chính xác partial-success/undo của ADR-008/064. `studentChanges` không phải optimistic payload: nó là projection của server response; stale response khác tenant bị client bỏ qua. Undo roster tiếp tục refetch authoritative vì có thể delete record mới và restore record cũ.

`POST|PUT /api/students` resolve membership branch từ class active. Khi `PUT` thực sự đổi `classId` hoặc `branch`, body bắt buộc `membershipChangeReason` dài 5–500 ký tự; audit action là `UPDATE_MEMBERSHIP_CORRECTION`. Đây là correction hành chính, không phải promotion. Client StudentModal chỉ đóng/báo đã lưu sau khi durable queue insertion thành công; nếu student mutation bị server từ chối vĩnh viễn, sync giữ failed payload trong Diagnostics và reconcile object từ `GET /api/students/:id` (hoặc bỏ projection không đáng tin nếu authoritative read thất bại).

---

## 18. DURABLE DELTA SYNC API (`/api/sync`, ADR-094)

| Method/path | Contract |
| :--- | :--- |
| `GET /api/sync/watermark` | Auth bắt buộc; trả `{ serverTime: ISO-8601, cursorVersion: 1 }`. `serverTime` là upper bound của một chu kỳ pull, không chứa PII và không nhận parish/user scope từ client. |
| `GET /api/students?updatedAfter=&updatedBefore=&page=&limit=` | Khi có `updatedAfter`, trả cả active rows và soft-delete tombstone trong cửa sổ; thứ tự `(updated_at,id)` tăng dần. `updatedBefore` là watermark server của chu kỳ. Full pull không trả tombstone. |
| `GET /api/classes?updatedAfter=&updatedBefore=` | Cùng snapshot/tombstone contract với students; vẫn áp tenant và class-scope server-side. |

Client chỉ ghi cursor Dexie scope `parishId:userId` sau khi students/classes/grades/attendance/notices đều hoàn tất. Store pull trong sync engine chạy fail-fast; lỗi một trang không được biến thành mảng rỗng thành công. Reload sử dụng cursor bền nếu có; thiếu cursor hoặc local roster rỗng thì full bootstrap/repair. Các entity hard-delete chưa có tombstone riêng được phục hồi qua full pull định kỳ/repair, không được suy là changefeed hoàn chỉnh.

`GET /api/notices?updatedAfter=<ISO>&limit=10000` áp cùng deletion contract: full pull chỉ trả notice active; incremental pull có thể trả `{ id, ..., deletedAt }` để client xóa projection. Notice DELETE là idempotent đối với tombstone đã tồn tại. Khi audience đổi từ `all|parents` sang `staff`, server lưu `parent_revoked_at` và trả phụ huynh một tombstone đã xóa `title/content/author`; notice được tạo staff-only không có marker và không xuất hiện trong parent delta. Client phải lọc pending queue theo exact `parishId:userId`; row không có đủ ownership không được dùng để giữ cache.

## 18A. PARISH EVENTS API (`/api/parish-events`, ADR-098 + ADR-110 amendment 2026-09-09)

Tenant luôn lấy từ JWT; client không gửi `parishId`. Đây là API read projection: `GET` dành cho authenticated roles; mọi `POST|PUT|DELETE` trả `405 CALENDAR_READ_ONLY`, kể cả admin. Chỉ command `/api/operations` được ghi projection trong transaction của aggregate.

| Method/path | Contract |
| :--- | :--- |
| `GET /api/parish-events?from=&to=&category=` | Trả events cùng tenant, có thể giới hạn ngày/category; client từ chối toàn response nếu có row khác tenant. |
| `POST /api/parish-events` | `405 CALENDAR_READ_ONLY`; tạo tại `POST /api/operations/events`. |
| `PUT /api/parish-events/:id` | `405 CALENDAR_READ_ONLY`; sửa tại `PUT /api/operations/events/:id`. |
| `DELETE /api/parish-events/:id` | `405 CALENDAR_READ_ONLY`; hủy/chuyển nội bộ qua Operations. |

Cache sự kiện là read-only encrypted Dexie projection scope `parishId:userId`. Khi API đọc lỗi, UI có thể hiển thị cache kèm trạng thái stale. Calendar store/client không expose mutation command. Key plaintext global `parish_calendar_events_v1` bị loại bỏ an toàn; legacy row thiếu exact `parishId` không được migrate. Lịch phụng vụ tính toán không phụ thuộc API và vẫn hoạt động offline.

Mọi `date`/`from`/`to` phải là ngày `YYYY-MM-DD` tồn tại thật; chuỗi đúng regex nhưng bất khả thi như `2026-02-30` trả 400.

---

## 18B. FINANCE FEE RECONCILIATION (`/api/finances`, ADR-101)

| Method/path | Contract |
| :--- | :--- |
| `POST /api/finances/classes/:classId/fees` | Body là một `UpdateStudentFeeInput`; `body.classId` phải bằng URL. Write-status chỉ nhận `PAID\|UNPAID\|EXEMPTED`; `PARTIAL` chỉ còn trong read model để tương thích dữ liệu cũ. `PAID` bắt buộc `paidAmount > 0`; `UNPAID\|EXEMPTED` bắt buộc `paidAmount = 0`. Lệnh `PAID` tái sử dụng/reconcile linked receipt, không append giao dịch khi retry. `UNPAID\|EXEMPTED` đảo đúng linked receipt trong cùng transaction. Lỗi tham chiếu tenant/lớp/học sinh/quỹ được trả `400 BAD_REQUEST`, không rơi thành `500`. |
| `POST /api/finances/classes/:classId/fees/batch` | Body `{ records: UpdateStudentFeeInput[1..500] }`; mọi record phải mang đúng URL class. Toàn batch commit hoặc rollback; response `StudentFeeRecord[]`. |

Mọi endpoint Finance vẫn admin-only và lấy parish/user từ JWT. Client không được gửi `parishId`, không được loop các request đơn để mô phỏng “Thu Tất Cả”, và chỉ refresh summary sau acknowledgement của batch.

---

## 19. PARISH PROFILE API (`/api/parish-profile`, ADR-081)

Tất cả endpoint yêu cầu auth và tenant lấy từ JWT, không nhận `parishId` từ body. `GET` cho `admin|chunhiem|phuta`; mọi mutation chỉ `admin`; `phuhuynh` trả 403. Response snapshot gồm `profile`, `people`, `units`, `terms`, `records`, `assets`, derived `timeline`, admin-only `accounts` và `permissions`.

Đổi `unitType` bị từ chối với `409 PARISH_POSITION_SCOPE_MISMATCH` nếu loại mới
không tương thích với `positionCode` của nhiệm kỳ chưa xóa trong cùng đơn vị và
giáo xứ (kể cả nhiệm kỳ lịch sử). Không tự chuyển chức vụ theo loại đơn vị mới;
đổi tên đơn vị không bị chặn bởi kiểm tra này.

| Method/path | Contract |
| :--- | :--- |
| `GET /api/parish-profile` | Admin nhận draft/archived/restricted; staff chỉ nhận active/published/STAFF projection. |
| `PUT /profile` | Upsert tên, bổn mạng, ngày thành lập, khẩu hiệu, giới thiệu. |
| `POST|PUT|DELETE /people[/:id]` | Hồ sơ identity tổ chức. `linkedUserId` phải cùng tenant và unique trên active profile. |
| `POST /people/import` | Admin-only; `{ people: ParishPersonInput[1..100] }`; năm sinh 1900..năm hiện tại, trạng thái enum exact. Tạo people + audit trong một transaction, một lỗi rollback cả batch; trả `{ importedCount, people }`. |
| `POST|PUT|DELETE /units[/:id]` | Đơn vị/cây tổ chức; service chặn parent cross-tenant/cycle. `BOARD` phải root; `BRANCH|COMMITTEE` phải trực thuộc active `BOARD`. Board còn Ngành/Ban chuyên môn không được đổi loại, vô hiệu hóa hoặc xóa. |
| `POST|PUT|DELETE /terms[/:id]` | Nhiệm kỳ, chức vụ, cấp bậc; mọi mutation body bắt buộc `{adminPassword,authorityReason}` ngoài dữ liệu term (DELETE chỉ cần hai trường xác nhận). Route rate-limit và capture reauth; service kiểm lại proof trong transaction, audit reason nhưng không ghi password. Admin không thể tạo/sửa term cho person liên kết chính tài khoản mình. References tenant-scoped, date range hợp lệ. Một person được có đồng thời term Trưởng ngành và Trưởng ban. `positionTitle` chỉ hiển thị; chỉ `positionCode` tương thích unit mới cấp authority. |
| `POST|PUT|DELETE /records[/:id]` | Cột mốc/hoạt động/thành tích; person/asset links commit atomically. |
| `POST /assets/external` | External HTTPS metadata + record links. |
| `POST /assets/upload` | Multipart JPEG/PNG/WebP/PDF ≤8 MiB; production thiếu R2 trả 503 fail-closed. |
| `PUT|DELETE /assets/:id` | Sửa metadata/link hoặc soft-delete khi không còn dependency. |
| `GET /assets/:id/download` | Authenticated private blob download; `Cache-Control: private, no-store`. External asset không proxy qua route này. |

Client store không persist/offline-enqueue domain này. FormData không được gắn `Content-Type: application/json`; API client để browser sinh multipart boundary.

---

## 20. FEEDBACK MAILBOX API (`/api/feedback`, ADR-086)

Mọi endpoint yêu cầu JWT và lấy tenant từ token. Admin chỉ có receiver endpoints; `POST /api/feedback`, `/targets`, `/sent` chặn admin ở backend.

| Method/path | Quyền | Contract |
| :--- | :--- | :--- |
| `GET /targets` | `chunhiem|phuta|phuhuynh` | Staff nhận duy nhất đích Xứ đoàn. Parent nhận Xứ đoàn + các chủ nhiệm thuộc lớp của con, server tự suy từ phone/student/class/assignment. |
| `POST /` | `chunhiem|phuta|phuhuynh` | `{targetType,targetUserId?,visibility,subject,content}`. Staff chỉ `PARISH`; parent được `PARISH|HOMEROOM_TEACHER` đúng scope. Admin luôn 403. |
| `GET /inbox` | `admin|chunhiem` | Admin nhận thư `PARISH`; chủ nhiệm chỉ nhận thư đích danh `target_user_id=self`. Tối đa 200 thư mới nhất. |
| `GET /sent` | `chunhiem|phuta|phuhuynh` | Chỉ trả thư `PUBLIC` có `sender_user_id=self`. Anonymous cố ý không có sent history. |
| `PATCH /:id/status` | `admin|chunhiem` receiver | Body `{status:'READ'|'ARCHIVED'}`; chỉ recipient hợp lệ cùng tenant được đổi. |

`FeedbackMessage` response không bao giờ phát `senderUserId`. Anonymous trả `senderName='Ẩn danh'`; public trả display name. Client không retry tự động POST, không queue offline và không persist thư. Sau gửi anonymous chỉ toast xác nhận; sau gửi public refetch sent-box.

## 24. Question Bank & Blueprint API (ADR-096)

Base `/api/question-bank`; mọi endpoint yêu cầu JWT và role `admin|chunhiem|phuta`. Parent trả 403. Response dùng envelope chuẩn; lỗi domain trả `{code,message,details}`.

| Endpoint | Contract |
| :--- | :--- |
| `GET /questions` | Filter `search,status,questionType,branchId,curriculumLevel,difficulty,lessonFrom,lessonTo,topic,limit,offset`; chỉ tenant hiện tại. |
| `POST /questions` | Tạo item nháp + immutable version 1; optional `branchId` phải cùng tenant và được kiểm trong transaction. |
| `POST /questions/import` | Body `{items: QuestionContent[1..100]}`. Server ép `provenance=import`, xác minh mọi `branchId` cùng JWT parish và ghi toàn batch thành draft/version 1 trong một transaction. Trả `{importedCount,questionIds,status:'draft'}`; một dòng lỗi không tạo partial rows. |
| `GET /questions/:id` | Current version, version history và usage history cùng tenant. |
| `PUT /questions/:id` | Tạo version mới; không overwrite version cũ; optional `branchId` được kiểm cùng tenant trong transaction. |
| `POST /questions/:id/lifecycle` | `{action: submit|reject|approve|activate|archive}` theo role/state machine. |
| `GET|POST /blueprints` | Liệt kê hoặc tạo blueprint nháp với ordered rules; optional `branchId` phải cùng tenant trong transaction. |
| `GET /blueprints/:id` | Blueprint và rules. |
| `POST /blueprints/:id/status` | Admin đặt `active|archived`. |
| `POST /exams/build` | Manual `questionIds` hoặc `blueprintId`, cộng class/subject/scoreType/semester/year/maxScore/variantCount và `buildCommandId` ổn định (8–120 ký tự). Client gửi cùng giá trị trong `Idempotency-Key` và tái sử dụng qua network retry. Server derive seed ổn định nếu không truyền seed, lưu request hash cùng session trong transaction; cùng command+hash trả session cũ, cùng command khác hash trả 409. Transaction bao trọn class-access hiện thời, selection/current versions, session/snapshot/manifest/audit. |

`QUESTION_BRANCH_INVALID` trả 400 cho branch không thuộc tenant. `BLUEPRINT_SHORTAGE` và `QUESTION_TYPE_NOT_MATERIALIZABLE` trả 422 và không tạo partial session. Client không queue authoring/build offline; session được tạo thành công xuất hiện trong luồng Smart Exam hiện hành.

---

## 25. OPERATIONS API (`/api/operations`, ADR-110)

Event status contract là `DRAFT|PLANNING|PREPARING|READY|LIVE|COMPLETED|CANCELLED`. DRAFT chỉ creator và non-production admin override đọc được, không có calendar projection/notification dù visibility là public. Transition tiến/lùi chỉ từng bước; lùi cần reason và pause automation, resume là command OCC riêng. `COMPLETED` là trạng thái cuối: mọi chuyển tiếp từ COMPLETED (kể cả lùi có lý do) đều `409 EVENT_COMPLETED_TERMINAL`; UI không hiện nút lùi ở event đã hoàn tất. Worker dùng transaction/CAS để tự LIVE tại `startsAt` và tự COMPLETED tại `endsAt`; auto completion giữ nguyên task/checklist chưa xong và ghi số lượng vào outcome/audit.

Task create nhận `phase?: PREPARATION | EXECUTION | FOLLOW_UP`, mặc định PREPARATION; task response có phase. PUT hiện không hỗ trợ thay phase. Readiness start không yêu cầu EXECUTION/FOLLOW_UP DONE nhưng vẫn kiểm tra OWNER accepted/active và trạng thái BLOCKED/CANCELLED; closure yêu cầu tất cả required task DONE. Phần trăm chỉ đo chuẩn bị, blockers vẫn quyết định start.

Event transition COMPLETED trả `409 COMPLETION_BLOCKED` với danh sách task bắt buộc chưa DONE; `override` readiness không bỏ qua điều kiện đóng này. Cần tổng kết như trước. Kiểm tra và cập nhật event trong cùng transaction.

Handover response bổ sung `conflictWarnings: {id,startsAt,endsAt}[]` theo blockout user/person của người mới tại `task.dueAt`, trong transaction bàn giao. Không trả reason riêng tư; warning không hủy bàn giao, không thay acknowledgement PENDING và không chứng minh khả dụng toàn khoảng công việc.

`POST /tasks/:id/handover` yêu cầu capability `operations.task.reassign`, idempotency key và `{version, assignmentId, assignmentVersion, userId|personId, reason}` (đúng một target). Chỉ thay OWNER hiện hành của task chưa terminal; target phải hợp lệ trong parish và khác người cũ kể cả alias user/person. Thu hồi assignment cũ, tạo OWNER PENDING, tăng task version, audit và receipt nằm cùng transaction. Trả `{assignment, taskVersion}`; stale version 409. Người mới phải tự nhận việc, không kế thừa ACCEPTED.

Checklist create/update trả `{ item, taskVersion }`; client cập nhật version trên detail/list từ response máy chủ. Audit giữ trạng thái trước/sau.

Tất cả route yêu cầu JWT staff baseline (`admin|chunhiem|phuta`); backend tiếp tục resolve capability theo account + active explicit organization `position_code`/unit scope + operation resource role. `position_title` không cấp quyền. Position codes gồm `PARISH_LEADER|PARISH_SECRETARY|PARISH_DEPUTY` (BOARD/toàn xứ), `BRANCH_LEADER|BRANCH_DEPUTY` (BRANCH), `COMMITTEE_LEADER|COMMITTEE_DEPUTY` (COMMITTEE); backend giữ codes tiếng Anh, UI hiển thị nhãn tiếng Việt. Thư ký hẹp hơn văn phòng xứ: đọc toàn xứ + tạo Event Xứ đoàn + toàn quyền trên event/task mình tạo (creator role); không tạo Event chuyên môn, không manage/assign event người khác. Technical admin có parish-wide mutation override theo quyết định O2 đã duyệt (trừ execute vẫn cần assignment ACCEPTED của chính actor). Frontend permission response/route policy chỉ dùng để hiển thị UX.

- `GET /events`, `GET /events/public-summary`, `GET /workstreams`, `GET /tasks` và `GET /reminders/inbox` dùng `page`/`limit`, mặc định 50 và từ chối `limit > 500`; response là `{ success, data, meta:{page,limit,total,totalPages}, error:null }`. Với private list, authorization được áp dụng trước khi tính `total`/slice. `GET /events` (W2.13) nhận thêm filter pushdown SQL `q` (substring title/location, tối đa 200 ký tự), `status`, `scope=XU_DOAN|UNIT` — total phản ánh đúng tập khả kiến sau filter; client Operations debounce 300ms và không ghi danh sách đã lọc vào offline cache. `GET /events/:id`, `/readiness`, `/headcount` là tenant/resource-scoped detail; detail gồm workstreams, tasks, participants, `retrospective|null`, permission map và readiness computed-on-read.
- `GET /candidates?taskId=...|workstreamId=...|eventId=...` yêu cầu đúng một resource và capability quản lý tương ứng trước khi trả dữ liệu. Projection chỉ gồm `{parishId,personId,userId,displayName,eligibility,inResourceScope}`; không trả phone, username, tiểu sử, chức danh hay trạng thái account thô. Với Trưởng ngành/Trưởng ban và resource lead có unit scope, server chỉ trả person có nhiệm kỳ hiệu lực trong unit/descendants; Trưởng Xứ đoàn nhận directory toàn xứ đoàn kèm `inResourceScope` để UX phân biệt. Technical admin chỉ có directory toàn xứ khi non-production override đang hoạt động. `eligibility=PLANNING_ONLY` là person chưa có account, không đồng nghĩa có thể nhận/duyệt/được nhắc.
- `POST /events`, `PUT /events/:id`, `POST /events/:id/transition`: event aggregate và writer duy nhất. Body tạo nhận `eventScopeType?: XU_DOAN|UNIT` (thiếu thì suy từ `scopeUnitId`: NULL→XU_DOAN, có→UNIT; sai khớp trả `OPERATION_EVENT_SCOPE_TYPE_MISMATCH`), `organizerUserId xor organizerPersonId`. Creator và organizer là hai khái niệm khác nhau: sự kiện Xứ đoàn có organizer bắt buộc là Xứ đoàn trưởng active (thiếu thì server tự gán khi đúng một người, sai thì `ORGANIZER_MUST_BE_PARISH_LEADER`); Trưởng Xứ đoàn chỉ được đứng tên event Xứ đoàn — tạo hoặc đổi organizer event chuyên môn sang chính mình bị `400 ORGANIZER_MUST_BE_UNIT_LEADER`; Trưởng Xứ đoàn vẫn được tạo event chuyên môn khi chỉ định đúng Trưởng Ban/Ngành của unit đó. Phó Ban/Phó Ngành tạo sự kiện chuyên môn phải chỉ định Trưởng cùng unit (`ORGANIZER_REQUIRED`). Sự kiện chuyên môn phải thuộc đúng unit của người tạo (`UNIT_SCOPE_MISMATCH`), trừ Trưởng Xứ đoàn và admin (Phó Xứ đoàn/Thư ký chỉ tạo Event Xứ đoàn — tạo chuyên môn luôn 403; menu "+ Tạo mới" ẩn hẳn option unit với hai vai này). Client không gửi/sửa `sourceParishEventId`; nếu gửi server trả `CALENDAR_LINK_SERVER_MANAGED`. Mọi create/update chạm visibility `PUBLIC_SUMMARY` cần capability riêng `operations.event.publish_public`; hiện chỉ Trưởng Xứ đoàn có capability này ngoài admin override mọi môi trường theo O2 (ADR-112). DRAFT không tạo projection. Lần đầu DRAFT→PLANNING mới upsert `parish_events` và ghi durable targeted parent notification; `INTERNAL` không có projection. Chuyển public→internal, CANCELLED hoặc lùi DRAFT soft-delete projection. Hủy event đang public cũng cần publish capability. Transition dùng `version`; PLANNING→PREPARING có structured warning `TASK_ACCEPTANCE_PENDING`, READY/LIVE thủ công có blocker/override reason. Manual COMPLETED cần `outcomeSummary` và toàn bộ task required DONE, không cần retrospective. Event fields không sửa từ LIVE (`409 EVENT_IMMUTABLE`); completed/cancelled event không nhận planning child mới. Đổi scope hoặc organizer cần organizational create authority ở scope đích; đổi `scopeUnitId` tự dẫn `eventScopeType` theo (`OPERATION_EVENT_SCOPE_TYPE_MISMATCH` khi cố tình lệch), đổi organizer kiểm lại rule leader cho business actors (W2.1: UI create/edit nay gửi được `description`, `expectedHeadcount` và đổi `organizerUserId` — body PUT gửi kèm `organizerPersonId: null` khi swap sang user organizer). Completion dùng `completionRecordId` thuộc aggregate để reopen/recomplete cập nhật đúng `ACTIVITY`, không suy ownership từ soft/nonunique `source_event_id`.
- `PUT /events/:id/retrospective`: body `{expectedVersion:number|null,lessonsLearned,improvementNotes?}`; chỉ event `COMPLETED` và caller có `operations.event.manage`. Trạng thái khác trả `409 RETROSPECTIVE_REQUIRES_COMPLETED`. `null` chỉ tạo khi chưa có row; update phải khớp version và tăng version. Nội dung vẫn private trong event detail; audit chỉ ghi version/cờ có nội dung. Response replay theo receipt, stale trả `409 VERSION_CONFLICT`. Đánh giá là phần riêng sau hoàn thành, không phải blocker của `LIVE -> COMPLETED`.
- `POST /events/:id/follow-ups`: body `{eventVersion,title,description?,dueAt,priority?,userId xor personId}`; chỉ event `COMPLETED`, đồng thời cần task.create + task.assign trên event. Server revalidate target actionable và organizational scope trong transaction, CAS event, rồi insert task `FOLLOW_UP` (mang `scopeUnitId` của event) + một OWNER `PENDING` nguyên tử. Response `{task,assignment,eventVersion,conflictWarnings}`; warning chỉ có khoảng thời gian. Đây không mở lại generic task/workstream/participant creation trên event đã đóng.
- `GET /templates?archived=false|true`: mặc định chỉ trả template active; `archived=true` chỉ trả template đã lưu trữ mà caller hiện có `operations.event.create` tại `scopeUnitId`. Cả hai authorize trước pagination. `GET /templates/:id/preview?startsAt=<ISO>&version=<n?>` chỉ nhận template active, trả exact immutable version (mặc định latest) và ngày tuyệt đối đã materialize; khác tenant/scope, template đã archive hoặc snapshot hỏng fail closed.
- `POST /events/:id/templates`: body `{eventVersion,name,description?}`; chụp source event thành template v1 với source-event OCC. `POST /templates/:id/versions`: body `{expectedVersion,expectedLatestVersion,sourceEventId,sourceEventVersion,reason}`; source phải cùng exact organizational scope và tạo content version kế tiếp bất biến, đồng thời tăng family `version`. Cả hai scope theo đúng source event (kể cả `eventId`) nên DRAFT gate creator-only áp dụng: snapshot DRAFT của người khác trả 403 dù caller có event.create cùng scope (hardening 2026-09-16). Cả hai dùng receipt/audit nhưng audit chỉ ghi metadata/count, không copy nội dung snapshot riêng tư. Client giữ cùng idempotency key khi người dùng retry đúng payload chưa được xác nhận; payload đổi tạo key mới, success mới giải phóng key cũ.
- `POST /templates/:id/instantiate`: body `{templateVersion,startsAt,timezone,visibility?,organizerUserId? xor organizerPersonId?}`. Caller phải có create authority hiện tại tại scope template; organizer phải thuộc scope người tạo. Nếu `PUBLIC_SUMMARY`, caller còn phải có `operations.event.publish_public`. Server tạo event `DRAFT`, task `TODO`, checklist chưa hoàn tất nhưng chưa tạo calendar/notification; các projection chỉ sinh khi event chuyển PLANNING. Response `{event,tasks,checklist,template}` mang `sourceTemplateId/sourceTemplateVersion`. Không copy assignee/acceptance/approval result/comment/reminder; retry cùng receipt không nhân đôi event. API cho phép chọn exact version cũ để tái lập, còn UI mặc định preview latest trước khi tạo.
- `POST /templates/:id/archive` và `/restore`: body `{expectedVersion,expectedLatestVersion,reason}`. Cả hai yêu cầu create authority hiện tại tại scope template, receipt và tenant/id/familyVersion/latestContentVersion/status CAS; archive chỉ nhận active, restore chỉ nhận archived. Mỗi success tăng family `version`, chống command cũ hợp lệ lại sau archive→restore (ABA). Archive loại family khỏi catalog/preview/version/instantiate nhưng không xóa snapshot hoặc provenance của event đã tạo. Audit chỉ ghi metadata trạng thái/version và reason, không ghi snapshot. Replay cùng key/payload trả receipt; stale version hoặc cạnh tranh trạng thái trả 409.
- `POST /events/:id/participants`, `POST /events/:eventId/participants/:participantId/status`: participant là đúng một active user/person cùng parish. (W4.2a — client Operations đã có tab "Người tham dự" dùng đúng hai command này + `GET /events/:id/headcount`; add gate `operations.event.manage` và event còn mở planning, status dùng OCC `version` của chính participant row; UI gate bằng permission map detail, server vẫn re-check.)
- `GET|POST /workstreams`, `PUT /workstreams/:id`, `POST /workstreams/:id/members`, `PUT /workstreams/:id/members/:memberId/validity`, `POST /workstreams/:id/members/:memberId/remove`, `POST /workstreams/:id/ready`: scoped workstream và membership role có optional validity range/revoke reason. Validity update chỉ đổi `startsAt/endsAt`, bắt buộc reason + workstream version + member version; role/target phải revoke/replace để giữ lịch sử. Đổi `sourceUnitId` cần organizational create authority ở unit đích.
- `POST /workstreams/:id/lead/replace`: command hẹp chỉ dùng khi event đang `LIVE`. Body gồm `{version,currentLeadMemberId?,currentLeadMemberVersion?,userId xor personId,endsAt?,reason}`. Khi còn lead chưa revoke, phải gửi đúng id/version hiện tại; server soft-remove lead cũ, insert lead mới và tăng workstream version trong một transaction. Khi nhóm LIVE chưa từng có lead, bỏ cả hai trường current để bổ nhiệm lần đầu. Target mới phải là Trưởng Ban/Trưởng Ngành đương nhiệm đúng đơn vị của workstream (staff actionable, không trùng linked identity, thuộc unit/descendants mà caller có quyền điều động), ngược lại `403 WORKSTREAM_LEAD_OUTSIDE_UNIT`. Add/remove/validity rời rạc đối với `WORKSTREAM_LEAD` ở LIVE trả `409 USE_LEAD_REPLACEMENT`.
- `GET /workstreams/:id` trả `{ workstream, members, permissions }` trong success envelope. Máy chủ yêu cầu `operations.task.view` trên chính workstream; authorization và dữ liệu được đọc trong cùng transaction. `members` loại membership đã revoke; validity range được giữ để quản lý phân công, không đồng nghĩa tất cả dòng đều có quyền hiện tại. Không join thông tin liên hệ hay hồ sơ cá nhân. Ngoài parish/phạm vi hoặc resource không tồn tại bị từ chối `403`.
- Quyền cá nhân từ assignment đã `ACCEPTED` được cộng với quyền organizer/workstream lead. Vai trò quản lý không tự cấp execute và cũng không che mất quyền từ assignment hợp lệ. Event Organizer có thể chỉ định Workstream Lead; Workstream Lead không có `operations.workstream.assign_lead` để tự bổ nhiệm/thay người ngang vai trò.
- Task assignment `conflictWarnings` được resolve qua person/account liên kết trong cùng parish; mỗi warning chỉ trả `{id,startsAt,endsAt}`, không trả lý do bận riêng tư. Task có đủ `scheduledStartAt/scheduledEndAt` dùng overlap nửa mở chính xác; task deadline-only cũ dùng point fallback end-exclusive. Assignment đã commit dù có warning, acknowledgement vẫn PENDING; frontend phải hiển thị đúng sự khác biệt này.
- `GET /reminders?taskId=...|eventId=...` yêu cầu đúng một resource và quyền task.assign/event.manage trước pagination; trả projection tối thiểu gồm target/recipient ID, trigger/kind/status/version/read/sent timestamps, không trả dedupe key, queue ID, retry/error nội bộ. `POST /reminders/:id/reschedule` nhận `{expectedVersion,triggerAt,reason}`, chỉ PENDING; giữ nguyên target/recipient/kind, cập nhật trigger + dedupe + version và xóa retry metadata trong transaction với audit/receipt. Stale version hoặc trùng lịch hiện hành trả 409 và giữ nguyên lịch cũ.
- `POST /reminders/:id/cancel` nhận `{expectedVersion,reason}` bắt buộc và Idempotency-Key. Người nhận được hủy lịch của mình; actor khác cần task.assign/event.manage trên resource hiện tại. Chỉ PENDING được chuyển CANCELLED bằng tenant/id/status/version CAS trong cùng transaction với audit/receipt; trạng thái hoặc version khác trả 409, khác parish trả 404. Response tối thiểu `{id,parishId,status:'CANCELLED',version}`. Client thiếu expectedVersion trả 400. Không cam kết thu hồi thông báo đã ENQUEUED; retry cùng key replay receipt, không chạy hủy lần nữa.
- `GET|POST /tasks`, `GET|PUT /tasks/:id`, cùng `/assign`, `/assignments/:assignmentId/remove`, `/acknowledge`, `/checklist`, `/comments`, `/dependencies`, `/transition`: task lifecycle, multi-assignee/revoke, checklist, evidence HTTPS, cycle/readiness gates. Task chỉ có role `OWNER|CONTRIBUTOR`; workstream member chỉ `WORKSTREAM_LEAD|OBSERVER`; không còn approval workflow. `GET /tasks?workstreamId=...` áp dụng tenant/workstream predicate trước authorization và pagination; chỉ tổng/slice các task caller được xem trong nhóm đó. `GET /tasks?mine=true` kèm `myAssignments` để client gửi exact assignment `id+version` khi acknowledge. Acknowledge trong event `DRAFT|COMPLETED|CANCELLED` trả `409 EVENT_NOT_OPEN` (đối xứng dispatch-accept; standalone task không event và task `FOLLOW_UP` — việc tiếp nối sinh ra từ event COMPLETED, phải nhận việc mới bắt đầu — được miễn). Assignment chưa `ACCEPTED` không cấp execute authority; OWNER `PENDING|DECLINED` hoặc không còn active staff vẫn là readiness blocker. `CANCELLED` cần `cancellationReason`; required task bị hủy vẫn block READY. Sau `DONE|CANCELLED`, các mutation structure/assignment/checklist/dependency trả `409 TASK_IMMUTABLE`; comment retrospective vẫn là history path riêng. `POST /tasks/:id/restore` nhận `{version,reason}`, yêu cầu task.manage, chỉ khôi phục `CANCELLED -> TODO`, tăng version và xóa cancellation/block/completion/start fields; event `COMPLETED|CANCELLED` trả 409. Reminder cũ không tự khôi phục. `GET /tasks/:id` (W4.2b) trả `dependencies` dạng edge đã enrichment `{taskId,dependsOnTaskId,dependencyType,dependsOnTitle,dependsOnStatus}` — LEFT JOIN cùng parish tới task nguồn đã xóa mềm trả title/status `null` (edge vẫn giải thích lý do chặn); `POST /tasks/:id/dependencies/:dependsOnTaskId/remove` nhận `{version,reason}` (reason bắt buộc), yêu cầu task.manage trên task bị chặn, OCC bump task version + audit `DEPENDENCY_REMOVE`, edge thiếu trả 404 (không silent no-op); client TaskDependenciesPanel vẫn read-only (UI gỡ là follow-up riêng). Tạo edge yêu cầu thêm task.view trên task đích (thiếu/không quyền đều 403 đồng nhất, chống oracle UUID).
- `POST /tasks/:id/dispatch`: body `{version,primaryUserId xor primaryPersonId,reserveUserId xor reservePersonId?,acknowledgeBy}`; chỉ task event ở DRAFT/PLANNING/PREPARING/READY. Target phải actionable và thuộc phạm vi điều động. DRAFT trả dispatch `SCHEDULED` và không gửi; phase sau trả `PENDING`, gửi primary và tính `reserveInviteAt` tại 70% khoảng gửi→hạn. Task version tăng bằng CAS; mỗi task chỉ có một dispatch `SCHEDULED|PENDING`, và `/assign` với role OWNER trả `TASK_DISPATCH_ACTIVE` nếu cố đi vòng.
- `GET /dispatches/inbox` trả projection tối thiểu `{id,parishId,taskId,version,target,acknowledgeBy,invitedAt,taskTitle,eventId,eventTitle}` cho đúng primary/reserve đã thực sự được mời. Không trả identity của target còn lại; DRAFT/COMPLETED/CANCELLED không xuất hiện. `POST /tasks/:taskId/dispatches/:dispatchId/accept` nhận exact `{version,target}` và chỉ đúng target đã mời. Dispatch CAS trước khi insert OWNER; first valid acceptance thắng, stale/đã xử lý trả 409. Task/event terminal hủy dispatch mở; nhận trong DRAFT/terminal trả `DISPATCH_EVENT_NOT_OPEN`.
- `GET /creation-options`: menu "+ Tạo mới" server-authoritative, trả `{canCreateXuDoanEvent, xuDoanOrganizers:[{userId,displayName,positionCode}], units:[{id,name,unitType,canCreateEvent,canCreateTask,organizers,myRole}]}` chỉ gồm hành động caller được phép; UI chỉ hiển thị đúng các option này, mutation routes kiểm tra lại. `POST /tasks` nhận thêm `scopeUnitId?`; task độc lập (không event/workstream) bắt buộc có scope (`STANDALONE_TASK_SCOPE_REQUIRED`, trừ tương thích admin cho dữ liệu cũ) và scope được backfill từ workstream/event khi thiếu. Task gắn graph có scope đơn vị cụ thể phải ghi đúng scope của graph (`scopeUnitId == workstream.source ?? event.scope`, hardening 2026-09-16 theo BUSINESS_RULES #9/O6 — lệch scope mà không có authority ở scope đích trả 403, kể cả khi caller có quyền ở scope khai báo). Field trong sự kiện Xứ đoàn bắt buộc `sourceUnitId` (`FIELD_SCOPE_REQUIRED`, trừ admin); Field Lead phải là Trưởng Ban/Trưởng Ngành đương nhiệm đúng đơn vị — Phó, member thường, Trưởng đơn vị khác và Xứ đoàn trưởng đều trả `403 WORKSTREAM_LEAD_OUTSIDE_UNIT`.
- `/tasks/:id/assign`, `/tasks/:id/handover` và `/workstreams/:id/members` revalidate target scope trong cùng command transaction. Trưởng ngành/Trưởng ban chỉ chọn được người có service term hiện hành trong unit phụ trách hoặc descendants; gọi API trực tiếp ngoài phạm vi trả `403 TARGET_OUTSIDE_ORGANIZATION_SCOPE` và không tăng aggregate version. Admin/Trưởng Xứ đoàn/Phó Xứ đoàn giữ quyền phân công toàn xứ đoàn; Thư ký chỉ đọc toàn xứ và hành động trên event/task mình tạo (creator role), target-scope áp unit như actor thường. Picker là UX, không phải authorization boundary.
- `POST /blockouts`, `GET /blockouts/mine`, `PUT /blockouts/:id`, `POST /blockouts/:id/revoke`: create/self list/edit/revoke availability. Migration `20260909-238` backfill `version=1`; edit/revoke bắt buộc current version, dùng receipt và tenant/id/version/deleted-at CAS. `mine` trả lý do riêng tư cho đúng linked user/person; admin không đọc/sửa blockout người khác qua các route self-service. Revoke là soft delete. Assignment/handover warning vẫn chỉ trả `{id,startsAt,endsAt}`, không trả reason.
- `GET /permissions?unitId=&eventId=&workstreamId=&taskId=`: capability map server-authoritative `{parishId,timezone,permissions}` cho đúng một resource graph; nhiều ID không cùng graph trả toàn bộ `false`. `timezone` (W2.11) là IANA zone của xứ đoàn để form default theo giờ xứ thay vì browser zone; server vẫn validate `timezone` gửi lên từng request. Chỉ dùng để hiển thị UX, mutation routes kiểm tra lại. `GET /units`: active org units mà caller hiện có `operations.workstream.create` (authorize trước pagination); client dùng cho scope picker, không thay thế server check.
- `GET /tasks/:id/dispatches`: lịch sử dispatch đầy đủ của task (mới nhất trước), yêu cầu `operations.task.view` trên task; khác `GET /dispatches/inbox` (chỉ lời mời PENDING của chính caller). `POST /events/:id/automation/resume`: body `{version,reason}` (reason bắt buộc); chỉ khi `automationPaused=true` (ngược lại `409 AUTOMATION_NOT_PAUSED`), yêu cầu `operations.event.transition` + version CAS; audit `RESUME_AUTOMATION`. `POST /events/:id/restore`: body `{version,reason}` (reason bắt buộc); chỉ khi event đang `CANCELLED` (ngược lại `409 EVENT_NOT_CANCELLED`), yêu cầu capability `operations.event.transition` + version CAS; chuyển `status` về `PLANNING`, đặt `automationPaused: true`, tăng aggregate version, audit `'RESTORE'`; public calendar mirror cũ (nếu có) giữ nguyên soft-deleted (`deletedAt`) và chỉ tái lập khi sự kiện được tái chuyển tiếp/công bố.
- `GET /reminders/inbox`, `POST /reminders`, `POST /reminders/:id/read`: reminder read/delivery state riêng. `kind` gồm `TASK_DUE|EVENT_START|OVERDUE|MANAGER_PREP` (`MANAGER_PREP` do worker tạo mỗi ngày xứ đoàn cho event PLANNING đủ acceptance, dedupe theo recipient+ngày). Inbox SQL-page/count và trả `{id,parishId,taskId,eventId,triggerAt,kind,status,version,readAt,sentAt,createdAt}` — `taskId/eventId` (W1.2) là con trỏ tài nguyên trong phạm vi người nhận: inbox chỉ chứa reminder của chính caller và recipientship đã được gate `assertReminderRecipientCanView` khi tạo lẫn khi đến hạn, nên caller được phép resolve title từ list scoped của mình; không phát dedupe/queue/provider-error/recipient-identity internals và client không cache inbox. Operational target phải là staff account active hoặc person planning record không có account; parent/parent-linked target trả `400 INVALID_OPERATIONS_TARGET`. Reminder recipient phải là active staff còn quyền xem resource khi tạo và khi đến hạn, nếu không trả/fail `REMINDER_RECIPIENT_NOT_AUTHORIZED|RECIPIENT_NOT_AUTHORIZED`; resource đã terminal fail `RESOURCE_TERMINAL` trước enqueue; push body không chứa task/event title. Notification ID là deterministic; worker kiểm lại due-time trong transaction, targeted user được revalidate ACTIVE/same-parish trước provider delivery và missing queue ownership sau enqueue không tự replay.

Mọi `POST|PUT` Operations bắt buộc header `Idempotency-Key` (hoặc compatibility alias `X-Idempotency-Key`); CORS production cho phép cả hai qua preflight. Replay cùng command/payload trả response đã commit và header `Idempotency-Replayed: true`; reuse khác payload trả `409 IDEMPOTENCY_CONFLICT`. Nếu policy đã compact response snapshot cũ, cùng key/hash trả `409 IDEMPOTENCY_REPLAY_EXPIRED` và không thực thi lại. Aggregate mutation stale trả `409 VERSION_CONFLICT`. Permission query có nhiều `eventId|workstreamId|taskId` không cùng resource graph trả toàn bộ capability `false`. Mọi ISO datetime có offset được canonicalize về UTC trước persistence; event `timezone` phải là tên IANA hợp lệ và vẫn là field riêng để hiển thị/materialize ngày dân sự. Client persist overview read-only đã server-confirmed qua encrypted `dexieStorage` exact `parishId:userId`; cache không chứa permission, chỉ fallback cho transport status `0`, hiển thị stale timestamp và không cho mutation/detail refresh tới khi có snapshot server mới. Durable mutation queue/optimistic success vẫn không thuộc MVP; mỗi online command tạo một key ổn định cho chuỗi retry của request.

Client import không upload file binary lên API. `QuestionBankImportModal` đọc `.xlsx|.xls|.csv|.docx` tối đa 5 MB tại thiết bị, dùng parser hiện hữu/Mammoth raw text, giới hạn 50 câu/file, hiển thị preview rồi ánh xạ lớp đã chọn thành `branchId + curriculumLevel=class.name`. `.doc`, ảnh và object nhúng không thuộc contract. Nút tạo câu hỏi chỉ mount `QuestionEditorModal` khi mở; form nháp không còn chiếm chỗ thường trực trong trang.


