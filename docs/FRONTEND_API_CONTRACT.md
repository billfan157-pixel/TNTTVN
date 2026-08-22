# FRONTEND API CONTRACT & INTEGRATION SPECIFICATION - PARISH LMS v2.0

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
- Xóa rows của 23 bảng nghiệp vụ trong 1 transaction (FK order + `PRAGMA defer_foreign_keys`), scope `parish_id`; KHÔNG drop bảng, KHÔNG xóa function/trigger.
- Giữ nguyên: `users`, `branches`, `permissions`, `role_permissions`, `audit_logs`, `push_subscriptions`, `system_settings`.
- Snapshot v3.0 (23 bảng) tự ghi file trước khi xóa; audit log `SYSTEM_PURGE` ghi counts.
- Sau thành công: client gọi `resetClientData(purgeVersion)` → xóa sạch Dexie + localStorage + đăng xuất. Các thiết bị khác bị `fetchAllData` phát hiện version chênh lệch → tự reset + đăng xuất (chống ghost data).
- **A-NEW-47 (2026-08-13)**: `fetchAllData` chỉ reset khi device ĐÃ TỪNG sync (có key `parish_purge_version` trong localStorage). Device mới/chưa có key chỉ **ghi baseline** `purge_version` hiện tại, KHÔNG wipe, KHÔNG logout — tránh đá user ra khỏi phiên hợp lệ khi `purge_version` server cao hơn từ các lần purge lịch sử (production hiện là 4). Device cũ có key < server version vẫn bị reset (ghost data).
- Sau purge, quy trình bắt đầu lại: Tạo Năm Học → (khóa HK1 mặc định mở vì `semester_locks` đã purge) → Tạo Lớp hoặc Import Excel (tự tạo lớp qua `suggestedNewClasses`) → Nhập điểm / Điểm danh.

### Audit log action convention (2026-08-12 — AUDIT-FIX)
- `GET /api/audit-logs` (admin-only, paginated, cap 500) — xem `server/src/routes/auditLogs.ts`.
- `GET /api/audit-logs/policy-history` (admin-only, ADR-047): subset lọc sẵn theo policy (actions `UPDATE`/`OVERRIDE_GRADE`/`RESTORE_GRADE`/`APPROVE_PROMOTION`/`LOCK_SEMESTER`/`UNLOCK_SEMESTER` + entity types `settings`/`grade_override`/`promotion_record`/`semester_lock`), enrich `policyMetadata` (type: `POLICY_UPDATE`/`GRADE_OVERRIDE`/`PROMOTION_DECISION`/`SEMESTER_LOCK`), `studentId`/`studentName` (tenant-scoped) và `meta.summary` (thống kê KPI). UI hiển thị qua tab **"Chính Sách & Tác Động"** trên trang Nhật Ký Hệ Thống (`src/pages/AuditLogPage.tsx`, endpoint `getPolicyHistory` trong `src/lib/api.ts`) — trang `/policy-dashboard` đã gộp vào đây.
- **Server ghi action GENERIC `CREATE`/`UPDATE`/`DELETE` + `entityType`** cho các entity nghiệp vụ (`grade`/`attendance`/`student`/`notice`/`class` — `gradeService.ts`, `attendanceService.ts`, `studentService.ts`, `noticeService.ts`, `classService.ts`). Mọi write điểm — kể cả **import Excel** (qua `POST /api/grades/batch`) — đều ghi audit 1 dòng/học sinh (CREATE nếu grade mới, UPDATE nếu tồn tại).
- Action **đặc biệt** giữ tên riêng: `CREATE_USER`, `UPDATE_USER_STATUS`, `UPDATE_USER_ASSIGNMENTS`, `RESET_PASSWORD`, `FORCE_LOGOUT`, `CHANGE_PASSWORD`, `REVEAL_PASSWORD`, `RESTORE_BACKUP(_FAILED)`, `SYSTEM_PURGE`, `EXAM_FINALIZE/REOPEN/DELETE_SESSION/DELETE_RESULT`, `DELETE_CLASS_ASSIGNMENT`, `PARENT_ACCOUNTS_PROVISIONED(_FAILED)`, `*_FAILED`.
- **KHÔNG tồn tại action `UPSERT_GRADE`/`UPSERT_ATTENDANCE`** — UI `src/pages/AuditLogPage.tsx` map nhãn/color theo cặp `(action, entityType)` (`CRUD_LABELS`), filter hành động dùng action thật + option ghép `UPDATE|grade` (gửi kèm `entityType`).
- Filter params: `action` (string chính xác), `entityType`, `userId`, `startDate`/`endDate` (ISO), `page`/`limit`.

---

## 6. AUTH SESSION SECURITY API (`/api/auth`)

Client: `src/lib/api.ts` (`api.login/changePassword/adminChangePassword/logout/me`) · Store: `src/stores/authStore.ts`

> **Username unique theo parish (ADR-046, 2026-08-16)**: `POST /api/auth/login` nhận thêm **`parishId` optional** (body) — lookup theo `(username, parishId)`, **default `'gia-ton'`** nếu không gửi (backward-compatible với client hiện tại; KHÔNG fallback lookup toàn cục — fail-closed). Client cũ không đổi; khi multi-parish go-live client phải gửi `parishId` (parish picker / config deploy). DB: `idx_users_username_parish UNIQUE(parish_id, username)` (migration `20260816-121`).

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

### Password visibility (`password_encrypted`, ADR-021 rewrite 2026-08-08)
- `POST /api/users` (tạo GLV), `POST /api/users/:id/reset-password`, `POST /api/auth/admin-change-password` → server lưu bản **AES-256-GCM** của **password tạm** (admin-đặt) vào `users.password_encrypted` (key `PASSWORD_CIPHER_KEY`, không plaintext).
  - **A06 (2026-08-10) — RE-AUTHENTICATION** mở rộng cho cả `reset-password` và `admin-change-password`: body bắt buộc `{ adminPassword }` (mật khẩu HIỆN TẠI của admin đang thao tác, `min(1)`/`max(128)`). Server xác minh bcrypt parish-scoped qua `verifyAdminReauth` (SSOT dùng chung với `reveal-password`) trước khi đổi password. Sai → `401 INVALID_ADMIN_PASSWORD` + audit `RESET_PASSWORD_FAILED` / `ADMIN_CHANGE_PASSWORD_FAILED`; admin LOCKED bị chặn; rate limit `adminReauthRateLimiter` 10 lần/60s/IP. Audit thành công: `RESET_PASSWORD` (service, có sẵn), `ADMIN_CHANGE_PASSWORD` (bổ sung — endpoint trước đây KHÔNG ghi audit).
- `POST /api/auth/change-password` (chính user đổi pass) → **`passwordEncrypted = NULL`** — mật khẩu user-chọn không bao giờ tồn tại dạng reversible.
- `GET /api/users` (admin/chunhiem) **không trả plaintext** — chỉ cờ `hasPasswordCopy: boolean` (còn bản mã hóa password tạm để xem lại).
- `POST /api/users/:id/reveal-password` (admin-only) → `{ username, password }` — truy xuất password tạm có chủ đích, ghi audit `REVEAL_PASSWORD`; 404 khi không còn bản mã hóa.
  - **A05 (2026-08-10) — RE-AUTHENTICATION**: body `{ adminPassword }` (mật khẩu HIỆN TẠI của admin đang thao tác, `min(1)`/`max(128)`). Server xác minh bcrypt (parish-scoped) trước khi giải mã. Sai → `401 INVALID_ADMIN_PASSWORD` + audit `REVEAL_PASSWORD_FAILED`; admin LOCKED bị chặn như login; rate limit 10 lần/60 giây/IP (`revealPasswordRateLimiter`). Không đổi `failedAttempts` (lockout chỉ áp dụng login per BUSINESS_RULES §10.1). Target superadmin → `403 FORBIDDEN`.
- Mật khẩu tạm (`Parish@\d{6}` / `Reset@\d{6}`) trả 1 lần ở response tạo/reset; sau đó xem lại qua `reveal-password`.

### `POST /api/auth/parent-reset-password` (ADR-042, 2026-08-15)
- **Mục đích**: Phụ huynh tự đặt lại mật khẩu bằng cách xác minh thông tin bảo mật của con (0đ SMS, không cần Telegram).
- **Rate limit**: `parentForgotRateLimiter` 10 requests / 60s / IP.
- **Request Body**:
  ```json
  {
    "phone": "0901234567",
    "childDob": "2015-05-20",
    "childName": "Nguyễn Văn An",
    "newPassword": "StrongPassword@123"
  }
  ```
- **Xác thực**: Khớp SĐT phụ huynh (`role = 'phuhuynh'`) + Ngày sinh của con (`YYYY-MM-DD` hoặc `DD/MM/YYYY`) + Tên Thánh / Họ tên của con (so khớp không dấu). Hỗ trợ anh chị em ruột.
- **Response**: `{ "success": true, "data": { "success": true, "message": "Đặt lại mật khẩu thành công!..." } }`.
- **Errors**:
  - `400 INVALID_VERIFICATION_DATA`: Thông tin không khớp với hồ sơ học sinh hoặc SĐT không tồn tại (timing-neutral).
  - `429 TOO_MANY_REQUESTS`: Quá số lần thử cho phép.
  - `400 VALIDATION_ERROR`: Mật khẩu mới không đạt chuẩn mạnh.

---

## 7. WEB PUSH API (`/api/notifications`)

Client: `src/lib/pushManager.ts` (`initPushSubscription`/`disablePushSubscription`) · SW: `public/sw.js` · Service: `server/src/services/webPushService.ts` (SSOT gửi + dọn sub chết)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/notifications/vapid-public-key` | VAPID public key để client `PushManager.subscribe` | auth (mọi role) | `{ publicKey }` | 501 `VAPID_NOT_CONFIGURED` |
| `POST /api/notifications/subscribe` | Lưu PushSubscription (endpoint + p256dh + auth) | auth | `{ ok: true }` | — (idempotent, endpoint UNIQUE) |
| `POST /api/notifications/unsubscribe` | Xóa subscription theo endpoint | auth | `{ ok: true }` | — |
| `POST /api/notifications/send` | Gửi ngay tới mọi subscription của giáo xứ (title/body/url) | admin + chunhiem | `{ sent, failed, total, removed }` | 501 `VAPID_NOT_CONFIGURED` |
| `GET /api/notifications/subscriptions` | Danh sách push subscription của giáo xứ (admin xem/quản lý endpoints) | admin | `PushSubscription[]` | 401/403 |

### Smart notifications (`/api/notifications/smart/*` — F8 drift bổ sung)
Kích hoạt tự động gửi thông báo theo sự kiện (webpush có chủ đích + telegram cho staff). Tất cả dưới `use('/smart/*', roleMiddleware('admin','chunhiem'))`.

| Method & Path | Purpose | Auth | Success `data` |
| :--- | :--- | :--- | :--- |
| `POST /api/notifications/smart/absence` | Thông báo vắng mặt (theo ngày/lớp) | admin + chunhiem | `{ enqueued, failed }` |
| `POST /api/notifications/smart/report-cards` | Gửi phiếu điểm hàng loạt (qua outbox queue) | admin + chunhiem | `{ enqueued, failed }` |
| `POST /api/notifications/smart/reminder/sunday` | Nhắc tham dự Lễ Chúa Nhật | admin + chunhiem | `{ enqueued, failed }` |
| `POST /api/notifications/smart/reminder/class` | Nhắc lớp học | admin + chunhiem | `{ enqueued, failed }` |

### Client flow (pushManager)
1. `main.tsx` → `registerServiceWorkerOnly()` — đăng ký `public/sw.js` sớm, KHÔNG hỏi permission.
2. Sau **login thành công** (authStore) → `initPushSubscription()`: permission 'default' → hỏi 1 lần; lấy public key → `PushManager.subscribe({ userVisibleOnly: true })` → POST `/subscribe`; có sẵn subscription (reload) → re-sync idempotent.
3. Logout → `disablePushSubscription()`: POST `/unsubscribe` (best-effort) + `subscription.unsubscribe()`.
4. SW: `push` → `showNotification(icon: /pwa-icon.svg)`; `notificationclick` → focus window hiện có hoặc `openWindow(url)`.
- Yêu cầu: secure context (HTTPS/localhost) — web push không hoạt động trên HTTP plain.

### Delivery semantics (SSOT webPushService)
- Gửi song song tới mọi `push_subscriptions` của parish; endpoint trả `404`/`410` (trình duyệt đã hủy) → **xóa vĩnh viễn**; lỗi tạm thời (500…) → đếm failed nhưng GIỮ subscription.
- `sendWebPushToUsers(parishId, userIds, payload)` — gửi **có chủ đích** chỉ tới subscriptions có `user_id` trong danh sách (ví dụ: phụ huynh theo chi đoàn); subscription không thuộc nhóm (kể cả `user_id = NULL`) không bị đụng tới.
- `notificationQueue` channel `webpush`: gửi thật qua webPushService rồi mới đánh dấu `sent`; VAPID chưa cấu hình → mark `failed` (`VAPID_NOT_CONFIGURED`), KHÔNG còn đánh dấu `sent` giả. Item có `webpushUserIds` → queue persist JSON vào `notifications.target_user_ids` (migration `20260808-082`) để recovery sau restart gửi lại ĐÚNG nhóm người nhận (không degrade thành broadcast toàn giáo xứ).
- Smart notifications (`smartNotifications`) gửi **telegram cho staff + webpush CÓ CHỦ ĐÍCH cho phụ huynh** (`notifyParishNotice` khớp `users.phone` ↔ `students.parentPhone` qua `phoneMatchVariants`, lọc theo `targetBranch` khi thông báo nhắm vào một chi đoàn; `All`/null = toàn giáo xứ). Không còn webpush broadcast toàn parish.

---

## 9. PARENT PORTAL API (`/api/parents`)

Client: `src/lib/api.ts` (`getMyChildren`, `getStudentReportCard`) · Page: `src/pages/ParentPage.tsx` (route `/parent`, guard `requireRole('admin', 'phuhuynh')` — admin xem trước giao diện phụ huynh; dữ liệu vẫn khóa theo `CanAccessStudentSpecification` phía server) · Service: `server/src/services/parentService.ts` · Matching: `server/src/utils/phone.ts` (SSOT `CanAccessStudentSpecification`)

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/parents/my-children` | Danh sách con đang học của phụ huynh (khớp `users.phone` ↔ `students.parentPhone` chuẩn hóa, loại học sinh đã xóa) | auth + role `phuhuynh` | `ParentChild[]` — `{ id, code, holyName, fullName, gender, dateOfBirth, parentName, branch, className, classCode, status }` | 401 chưa đăng nhập, 403 không phải phụ huynh |
| `GET /api/reports/report-card/:studentId?academicYear=YYYY-YYYY` | Phiếu điểm của con (grades 2 HK, attendanceSummary, promotion) — phụ huynh chỉ xem được con mình qua `CanAccessStudentSpecification` | auth (mọi role, quyền truy cập qua spec) | `ReportCardDTO` | 403 không sở hữu, 404 không tìm thấy; **500** `REPORT_GENERATION_ERROR` cho lỗi không phân loại (OBS-FIX 2026-08-22: message chung, chi tiết chỉ trong server logs — client hiển thị thông báo thử lại) |
| `POST /api/parents/telegram/link-token` | Tạo token liên kết Telegram ↔ tài khoản phụ huynh (token_hash sha256, hết hạn, chỉ dùng 1 lần) | role `phuhuynh` | `{ token, expiresAt }` (201) | 401/403, 403 `PARENT_ACCOUNT_REQUIRED`, 500 `TELEGRAM_LINK_TOKEN_FAILED` |
| `GET /api/parents/telegram/status` | Trạng thái liên kết Telegram hiện tại của tài khoản (mỗi link: chatId, username, status ACTIVE/REVOKED, notificationsEnabled, linkedAt…) | role `phuhuynh` | `TelegramLink[]` | 401/403 |
| `POST /api/parents/telegram/notifications` | Bật/tắt nhận thông báo qua Telegram (body `{ enabled: boolean }` — áp dụng mọi link ACTIVE của tài khoản) | role `phuhuynh` | `{ enabled, updatedLinks }` | 400 `VALIDATION_ERROR`, 404 `TELEGRAM_NOT_LINKED` |
| `DELETE /api/parents/telegram/link` | Hủy liên kết Telegram (thu hồi mọi link ACTIVE của tài khoản) | role `phuhuynh` | `{ revokedLinks }` | 401/403 |

- Phone khớp linh hoạt: bỏ khoảng trắng/`-`/`(`/`)`/`.`, đổi đầu `+84` → `0`; `users.phone` có thể lệch định dạng so với `students.parentPhone` mà vẫn khớp.
- Phụ huynh **không** thấy tab Thiếu Nhi/Điểm Danh/Bảng Điểm/Báo Cáo; `GET /api/students`, `/api/grades`, `/api/attendance` trả rỗng cho role `phuhuynh` (guard an toàn hiện có).
- Telegram UI (ADR-022 hoàn thiện, 2026-08-15): `src/components/common/TelegramLinkCard.tsx` + `src/hooks/useTelegramLink.ts` (mount trong `ParentPage` mục "Thông Báo Telegram") — tạo mã (10 phút), sao chép, bật/tắt thông báo, hủy liên kết; bot nhận `/link <mã>`, `/status`, `/optout`, `/optin`, `/unlink` (`server/src/services/telegram.ts`). Hướng dẫn bot trỏ tới "Con Của Tôi" → "Thông Báo Telegram".

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

- **`PUT /api/auth/profile`**: role `phuhuynh` gửi `phone` khác SĐT hiện tại → **403 `PHONE_CHANGE_NOT_ALLOWED`** (SĐT = identity liên kết con — chỉ admin đổi qua endpoint trên). `phone` validate `^0\d{9}$` cho mọi role. Client `SettingsPage` disable ô SĐT cho phụ huynh + hướng dẫn liên hệ BGL.
- Audit: `UPDATE_USER_PHONE` ghi `{ phoneChanged, usernameChanged }` (không chứa SĐT/mật khẩu — A16).

## 10. SMART EXAM GRADING API (`/api/exams`)

Client: `src/lib/api.ts` (`createExam`, `getExamSessionsForClass`, `getMyExamSessions`, `getExam`, `saveExamResults`, `removeExamResult`, `getExamResults`, `completeExam`, `reopenExam`, `deleteExam`) · Store/UI: `src/stores/examStore.ts` + `src/components/exam/` (tab "Chấm Bài" trong GradesPage) · Server: `server/src/routes/exams.ts` + `server/src/services/examService.ts` · Plan: `exam grading plan (đã triển khai — xem ADR-023/024/025)`

| Method & Path | Purpose | Auth | Success `data` | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/exams` | Tạo phiên chấm (`classId`, `subject`, `scoreType`, `maxScore` 1–10, `semester`, `academicYear?`, `examType?`; MC bắt buộc `questionCount` 1–50 và `answerKey` JSON đầy đủ **hoặc** `answerVariants` JSON A–H đầy đủ, A bắt buộc; `idempotencyKey?`) | admin, chunhiem, phuta (lớp mình) + `checkUserClassAccess` | `ExamSession` (`EXS-`, `status:'draft'`); retry cùng `idempotencyKey` trả session đã tạo | 403 ngoài lớp, 404 lớp không tồn tại, 400 đáp án/questionCount không hợp lệ |
| `GET /api/exams/class/:classId?subject=&scoreType=&status=` | Danh sách phiên của 1 lớp (mới nhất trước) | auth theo class | `ExamSession[]` | 403 ngoài lớp |
| `GET /api/exams/my-classes` | Danh sách phiên các lớp mình phụ trách (admin: tất cả) | auth | `ExamSession[]` | — |
| `GET /api/exams/:id` | Chi tiết phiên | auth theo class | `ExamSession` | 404 |
| `POST /api/exams/:id/results` | Upsert kết quả (`results[]` — `studentId`, `score`, `source`, `examVersion?` A–H default A, `answers?`, `scanMetadata?` ≤10KB không ảnh). Với MC scan, server chọn key đúng version và tự tính lại điểm; version thiếu key hoặc metadata khác `accepted` bị chặn. | admin / chunhiem / phuta | `{ session, saved, upserted, total, adjustments }` | 403 ngoài lớp, 400 điểm/answers/version/metadata/thiếu nhi không hợp lệ, 409 completed |
| `DELETE /api/exams/:id/results/:studentId` | Xóa 1 kết quả (chỉ phiên `draft`) + audit `EXAM_DELETE_RESULT` | admin / chunhiem / phuta | `{ deleted: true, studentId }` | 403 ngoài lớp, 404 không tồn tại, 409 phiên đã hoàn tất |
| `GET /api/exams/:id/results` | Kết quả phiên kèm `studentCode/studentName/holyName`, `answers`, `scanMetadata` (aggregate diagnostics, không ảnh) | auth theo class | `{ session, results }` | 403 ngoài lớp |
| `POST /api/exams/:id/complete` | Finalize server-authoritative trong 1 transaction: validate lock/conflict, ledger + assessment entries + grade projection + session completed + audit; **idempotent** (ADR-048) | admin, chunhiem | `ExamFinalizationResult` (session/items/committed/conflicts) | 403 ngoài lớp / semester locked, 409 chưa có kết quả |
| `POST /api/exams/:id/reopen` | `completed` → `draft` (re-scan) + audit `EXAM_REOPEN` | admin | `ExamSession` | — |
| `DELETE /api/exams/:id` | Xóa phiên chấm **draft** (tạo nhầm) — xóa session + toàn bộ `exam_results` (chưa finalize) trong 1 transaction + audit `EXAM_DELETE_SESSION` (ADR-025) | admin / chunhiem / phuta (lớp mình) | `{ deleted: true, sessionId, resultsDeleted }` | 403 ngoài lớp, 404 không tồn tại, 409 phiên đã hoàn tất (đã ghi bảng điểm — không xóa được, admin mở lại trước nếu cần) |
| `PATCH /api/exams/:id/answer-key` | Cập nhật answer key + re-score kết quả OMR (ADR-043) — chỉ phiên draft MC; giữ nguyên quick_entry | admin / chunhiem / phuta (lớp mình) | `{ session, rescored, skipped }` | 403 ngoài lớp, 400 answer key không hợp lệ, 409 phiên đã hoàn tất, 400 không phải MC |
| `PATCH /api/exams/:id/answer-variants` | Thay map đáp án A–H và re-score theo version trong transaction; A bắt buộc, không được xóa version đang có result; draft MC only | admin / chunhiem / phuta (lớp mình) | `{ session, rescored, skipped }` | 400 JSON/key không hợp lệ, 403 ngoài lớp, 409 completed/version đang dùng |
| `POST /api/exams/barcode/decode` | Decode v3 `T3:{sessionHex8}:{studentHex8}:{I|F}:{questionCount}:{A-H}:{checksum4}`, v2 `T2:*`, compact v1 `TE:*` hoặc legacy. V3 validate checksum có mã đề. | auth | `{ sessionId, studentId, ..., protocolVersion?, templateMode?, examVersion?, formChecksum? }` | 400 format/checksum không hợp lệ, 403 ngoài lớp, 404 phiên không tồn tại |

- **Finalize do server làm authority (ADR-048)**: `POST /complete` ghi finalization ledger + assessment entries + grade projection + session completed trong một transaction; client không tự commit grades. Trước bước finalize, ADR-049 còn yêu cầu server tự tính lại score MC scan ngay tại `POST /results`.
- **`academicYear` mặc định (EXAM-GAPS, 2026-08-15)**: client `examStore.createSession` tự điền `academicYear` = **năm học đang hoạt động của giáo xứ** (`academicYearStore.resolveActiveYear()`) khi không truyền — cùng nguồn với lưới điểm; KHÔNG lấy theo ngày hiện tại (tránh phiên rơi vào năm mới khi giáo xứ đang làm năm cũ trong giai đoạn chuyển tháng 8).
- **Trắc nghiệm bắt buộc đủ đáp án (client side)**: UI yêu cầu điền đủ `answerKey` cho toàn bộ `questionCount` câu trước khi tạo phiên MC — thiếu câu → OMR detector không chấm được (isCorrect undefined → điểm sai).
- **Cảnh báo tạo trùng (client side)**: nếu đã có phiên `draft` cùng lớp + môn + loại điểm (cùng học kỳ), UI yêu cầu xác nhận trước khi tạo thêm — KHÔNG chặn cứng (re-exam là nhu cầu hợp lệ, không có unique constraint server).
- Xung đột điểm tay (`_source='manual'|'excel_import'`): client **không ghi đè** — trả vào `ExamFinalizeResult.conflicts` và chặn học sinh đó, admin xử lý qua Override (Ma Trận).

### 10.1 Exam Features — Phiếu Trả Lời & Đề Thi (v2.6 — 2026-08-16)

| Feature | Module | Notes |
| :--- | :--- | :--- |
| **Batch Print Progress Bar** | `AnswerSheetModal.tsx` | Animated percentage bar + `Loader2` spinner during batch print; buttons disabled while printing |
| **PDF Export** | `ReportExportService.exportPdf()` | Opens print dialog with "Save as PDF" guidance; single + batch mode |
| **Barcode (Code128)** | `src/lib/barcode.ts` | Pure SVG generator + decoder (no deps); quiet zone 10 modules; decoder scans multiple rows in the upper camera region and validates Code128B checksum |
| **Code Scan Pipeline** | `qr.ts` + `cameraFrame.ts` + `cameraStillCapture.ts` + `examCodeScanner.ts` + `examScanIdentity.ts` + `omrScanConsensus.ts` + `scanQuality.ts` + `scanDiagnostics.ts` + `ExamScanModal.tsx` | Phiếu production dùng T3 khi có mã đề (template/số câu/version/checksum); T2/TE/legacy vẫn parse và map A. Fixed identity chụp tới 2200px; `review_required` khóa Save. Telemetry không ID/ảnh. |
| **Batch Image Grading** | `ExamBatchScanModal.tsx` + `examBatchScan.ts` | Chọn tối đa 500 ảnh/thư mục; xử lý tuần tự, fail-closed theo session/student/count/version/OMR/quality; chỉ accepted được lưu sau xác nhận. |
| **Exam Variants & Analytics** | `ExamVariantsModal.tsx` + `examAnalytics.ts` | Quản lý key A–H và server re-score; phổ điểm, item correct/blank rate và point-biserial không sửa dữ liệu. |
| **Local Review Snapshot** | `scanReviewStorage.ts` + scan/results UI | Opt-in, JPEG ≤960px, Dexie tenant-scoped AES-GCM, TTL 24h, không API; xem/xóa trên cùng thiết bị. |
| **Stable Mobile Grading** | `GuidedGradeModal.tsx` + `ExamSessionView.tsx` + `ExamScanModal.tsx` | Nút **Chấm Ổn Định** mở wizard mobile: tìm/chọn học sinh trong `classStudents` của phiên, hiển thị điểm đã lưu, rồi chọn `Chỉ quét OMR` (fixed identity, không decode QR, source=`omr`) hoặc nhập điểm trực tiếp (source=`quick_entry`). Fixed-identity OMR không tự chạy trên mọi frame: người dùng phải căn phiếu và bấm **Chụp & chấm**, ngăn ghi nhận khi chưa đưa vùng đáp án vào khung. Điểm client validate 0..maxScore và server tiếp tục validate/authorize theo session class; cả hai đường dùng `examStore.saveScores`, nên giữ offline queue/upsert hiện có. Modal chỉ báo lưu thành công/đóng sau khi store trả acknowledgement khác `null`. |
| **Mobile WebKit Camera Support** | `ExamScanModal.tsx` | Tự động gán MediaStream vào thẻ `<video>`, tương thích iOS Safari WebKit (`autoPlay`, `playsInline`, `onloadedmetadata`), đổi camera trước/sau |
| **Photo Upload Fallback** | `ExamScanModal.tsx` | Nút "Tải ảnh" / "Chọn ảnh" cho phép chụp từ app camera gốc hoặc tải file ảnh phiếu A4 để chấm điểm trực tiếp |
| **A4 Framing Overlay** | `ExamScanModal.tsx` | Khi chưa có định danh, chỉ hiện khung vuông QR gần camera (bước 1/2). Khi đã khóa mã và chấm trắc nghiệm, hiện khung OMR dẹt theo đúng tỷ lệ vùng trả lời thực tế thay vì khung lớn phủ vùng câu hỏi (bước 2/2). Phiếu tự luận tiếp tục dùng khung A4/4 marker thật lấy từ SSOT `CORNER_MARKERS`. Overlay chỉ là hướng dẫn; detector vẫn quyết định theo marker, geometry, bề mặt giấy và confidence. |
| **Barcode Decode API** | `POST /api/exams/barcode/decode` | Server validates barcode format + session + class access |
| **Watermark** | `examSheets.ts` | CSS diagonal parish name watermark (4% opacity) on exam papers |
| **Flexible maxScore** | `answerSheetTemplate.ts` | `scoreToCell(score, maxScore)` — dynamic grid rows for scores >10 |
| **Confidence Tracking** | `ExamScanModal.tsx` | Per-answer confidence stored as `_confidence` in answers JSON |
| **OMR Fail Reasons** | `ExamScanModal.tsx` | Vietnamese tooltips for 10+ OMR failure codes, gồm `NO_PAPER_SURFACE`; trạng thái xanh xác nhận mã đã được giữ 20 giây và nêu riêng lý do OMR chưa đạt, trạng thái vàng dành cho mã chưa thấy/không hợp lệ. |
| **Exam Type Instructions** | `AnswerSheetModal.tsx` | Differentiated MC vs Written instructions |
| **Multi-fill + Blank Highlights** | `ExamScanModal.tsx` | Amber (multi-fill ⚡) + Gray (blank —) in scan detail grid |
| **Multi-Format Exam Exporter** | `src/utils/examExporter.ts` + `ExamExportModal.tsx` | Xuất đề thi 6 định dạng client-side (Word .doc, Excel .xlsx đa sheet, Plain Text .txt, Markdown .md, JSON .json, In/PDF); cấu hình hiển thị đáp án, lời giải, khung thông tin học sinh, ô trả lời trắc nghiệm, bố cục 1/2 cột, mã đề A–H; 100% offline. |
| **Re-score on Answer Key Edit** | `ExamSessionView.tsx` + `examService.ts` | `PATCH /api/exams/:id/answer-key` re-scores OMR results, preserves quick_entry |

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

Export snapshot parish **9 bảng nghiệp vụ**: students, grades, attendance, classes,
semester_locks, grade_overrides, promotion_records (`promotion_records` — payload key giữ
tên legacy `promotionSnapshots`, backup.ts:60-65), exam_sessions, exam_results
+ `checksum` SHA256 + `counts`.

> **A22 (2026-08-10):** KHÔNG phải "100% database" — schema có 32 bảng; 23 bảng còn lại
> (users, refreshTokens, auditLogs, notices, branches, academicYears, systemSettings,
> catechistAssignments, notifications, permissions, rolePermissions, importBatches,
> importBatchStudents, gradeImportHashes, pushSubscriptions, serviceAssignments,
> mappingMemory, outboxMessages, academicYearSnapshots, attendanceSessions, assessments,
> telegramLinks, telegramLinkTokens)
> được loại trừ vì: (1) mật khẩu/token/session KHÔNG được phục hồi qua restore (an toàn);
> (2) cấu hình (academicYears, settings, branches) admin khởi tạo lại qua UI;
> (3) dữ liệu phái sinh (audit, import hashes, outbox, snapshots) tự sinh lại.
> Để khôi phục toàn bộ DB (kể cả users/audit), dùng **backup file DB cấp hệ thống**
> (`scripts/backup-db.js` / `BACKUP_DIR` — `docs/DEPLOYMENT_GUIDE.md` §5).

- **A-NEW-28 (2026-08-11):** `POST` body `{ adminPassword }` (≤128 ký tự) — chuyển từ
  `GET ?adminPassword=` trong URL (tránh mật khẩu lọt vào access logs/history).
- 200: `{ version: '2.0-production', parish, exportedAt, checksum, counts, data: { students, grades, ... } }` (stream attachment `parish-lms-backup-<date>.json`)
- 400 thiếu `adminPassword`; 401 sai mật khẩu; 429 quá nhiều lần thử (10/60s/IP)
- Audit: `EXPORT_BACKUP` (thành công) / `EXPORT_BACKUP_FAILED` (thất bại) — userId, entityId=parishId, ip, userAgent.

### `POST /api/backup/restore` — admin (DESTRUCTIVE)

Xóa dữ liệu nghiệp vụ của parish (gồm 3 bảng FK-restrict còn sót dữ liệu cũ:
`attendance_sessions`, `academic_year_snapshots`, `catechist_assignments` — parish-scoped)
rồi insert lại từ payload (tenant-scoped); auto safety snapshot lưu trước khi xóa
(`ensureSafetyDir`).

- Body: `{ adminPassword, parish, version, exportedAt, checksum, data: { students, grades?, attendance?, classes?, semesterLocks?, gradeOverrides?, promotionSnapshots?, examSessions?, examResults? } }`
  - `adminPassword` **BẮT BUỘC**; `data.students` **BẮT BUỘC** (mảng, có thể rỗng).
  - `checksum` **BẮT BUỘC** (SHA256 hex64) — bảo vệ khỏi file hỏng (corruption);
    sai = `400` (message chứa "Checksum"). KHÔNG phải cơ chế chống giả mạo (không có secret).
  - `parish` **BẮT BUỘC** — phải khớp parish của admin đang thao tác, sai = `400 RESTORE_PARISH_MISMATCH`
    (chống restore nhầm file giáo xứ khác).
- Pipeline: auth → role(admin) → rate limit → zValidator → `verifyAdminReauth` → parish guard
  → checksum → safety snapshot (fail-closed) → DELETE (fail-fast, không catch) → UPSERT 9 bảng
  (`onConflictDoUpdate`, kể cả semesterLocks/gradeOverrides/promotionSnapshots) → verify counts
  thực tế (`verified: true`) → audit `RESTORE_BACKUP`.
- 200: `{ success: true, message, counts, verified: true }`; 400 thiếu field/checksum/parish
  mismatch; 401 sai mật khẩu; 500 + audit `RESTORE_BACKUP_FAILED` + **rollback toàn bộ** nếu
  bất kỳ bước nào fail (không commit nửa chừng).
- > **A19–A21 (2026-08-10):** restore fail-closed — lỗi DB không còn bị nuốt; trùng ID được
  > upsert (thay vì bỏ im lặng); counts trả theo dữ liệu THỰC TẾ sau restore (verify).
  > **A22 (2026-08-10):** restore insert lại đủ 9 bảng kể cả semesterLocks/gradeOverrides/
  > promotionSnapshots — ghi chú A09 cũ ("restore bỏ qua") đã HẾT HIỆU LỰC.

### Client (A07)

`src/components/common/BackupRestoreModal.tsx` — ô "Mật Khẩu Admin (xác nhận)" bắt buộc trước khi
export/restore; export và restore đều gửi `adminPassword` **trong body POST** (A-NEW-28 — không
còn `?adminPassword=` trong URL); mật khẩu bị xóa sau khi thành công.

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
- **Client flow**: sau import thành công, `ExcelGradeImportModal` lưu snapshot `{ studentIds, semester, academicYear, at, count }` vào localStorage (`gradeImportSnapshot`) → hiển thị nút "Hoàn Tác Đợt Nhập Trước (N)" (ẩn sau 7 ngày) → xác nhận qua dialog tùy chỉnh (A4 — không còn native confirm/alert) → gọi API → dialog kết quả số bản ghi khôi phục được → xóa snapshot → `useGradeStore.fetchGrades()`. Nếu không có bản ghi nào khôi phục được (hết hạn / đã thay đổi), dialog hiển thị lý do đầu tiên và hướng dẫn sửa tay.

## 14. LEAVE REQUESTS API (`/api/leave-requests`) — ADR-033 (2026-08-14)

Client: `src/lib/api.ts` (`getLeaveRequests`, `getPendingLeaveRequestsCount`, `createLeaveRequest`, `reviewLeaveRequest`, `cancelLeaveRequest`) · Store: `src/stores/leaveRequestStore.ts` · Server: `server/src/routes/leaveRequests.ts`

| Method | Endpoint | Mô tả | Quyền | Body / Query | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/leave-requests` | Tạo đơn xin phép nghỉ cho thiếu nhi | `phuhuynh`, `chunhiem`, `phuta`, `admin` | `{ studentId, date, sessionTypes: ('SundayMass'\|'CatechismClass'\|'EucharisticAdoration')[], reason, parentName?, parentPhone? }` | 201 `{ success: true, data: LeaveRequest }` |
| `GET` | `/api/leave-requests` | Lấy danh sách đơn theo phạm vi quyền (phụ huynh: con của mình; GLV: lớp được phân công; Admin: toàn xứ) | `phuhuynh`, `chunhiem`, `phuta`, `admin` | `?classId=&status=&date=&studentId=` | 200 `{ success: true, data: LeaveRequest[] }` |
| `GET` | `/api/leave-requests/pending-count` | Đếm số đơn PENDING trong phạm vi quản lý của người dùng | `chunhiem`, `phuta`, `admin` | Không | 200 `{ success: true, data: { pendingCount: number } }` |
| `PATCH` | `/api/leave-requests/:id/review` | Duyệt (`APPROVED`) hoặc Từ chối (`REJECTED`) đơn xin nghỉ. Khi APPROVED, tự động upsert vào `attendance` (`AbsentExcused`) | `chunhiem`, `phuta` (chỉ lớp phụ trách), `admin` | `{ status: 'APPROVED'\|'REJECTED', reviewNote?: string }` | 200 `{ success: true, data: LeaveRequest }` |
| `DELETE` | `/api/leave-requests/:id` | Hủy đơn xin phép nghỉ (chỉ khi còn ở trạng thái `PENDING`) | `phuhuynh` (đơn của mình), `admin` | Không | 200 `{ success: true, data: { ok: true, id, status: 'CANCELLED' } }` |

---

## 15. PROMOTION BATCH APPROVE API (`/api/promotion/batch-approve`) — ADR-052 (2026-08-21)

Client: `src/lib/api/promotion.ts` (`promotionApiClient.batchApproveStudents`) · Store: `src/stores/promotionStore.ts` (`batchApproveStudents`) · Server: `server/src/routes/promotion.ts`, `server/src/services/BatchPromotionApplicationService.ts`

> **F1 (audit 2026-08-21)**: đây là đường duyệt thăng tiến thủ công SSOT khi online —
> sinh `promotion_records` snapshot + chuyển lớp/ngành **trong cùng transaction**,
> enforce SemesterLock HK2 + policy phía server. Panel "Xét Lên Lớp"
> (`PromotionPanel`) KHÔNG còn dùng `PUT /api/students/:id` khi online; offline
> fallback cũ giữ nguyên (hạn chế đã ghi nhận trong ADR-052).

| Method | Endpoint | Mô tả | Quyền | Body | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/promotion/batch-approve` | Duyệt thăng tiến hàng loạt (partial success ADR-008). Mỗi item 1 transaction: `approvePromotion` (snapshot + verify GPA/chuyên cần authoritative) → update `students.classId`/`students.branch` nếu có `nextClassId`/`newBranch`. Move được áp cho cả item `skipped` (idempotent re-run hội tụ) | `admin`, `chunhiem` (bị chặn bởi `CanAccessStudentSpecification` + `checkUserClassAccess(nextClassId)`) | `{ items: [{ studentId, academicYear, targetClassId, nextClassId?, newBranch? ('ChienCon'\|'AuNhi'\|'ThieuNhi'\|'NghiaSi'\|'HiepSi'), gpa, attendanceRate, manualDecision?, overrideReason? }], chunkSize? }` | 200 Partial-Success Payload (§2): `saved`/`skipped`/`error`; lỗi từng item kèm `reason` |

Lỗi item thường gặp: `403` HK2 chưa khóa (`...chưa được khóa...`), `409` GPA/chuyên cần lệch máy chủ (`DATA_MISMATCH` — client phải lấy giá trị từ `GET /promotion/evaluate/:studentId`), `400` override thiếu lý do, `404` học sinh đã xóa/hết `'Đang học'`.

### Endpoint liên quan — validate năm học (AY-F5, cùng đợt)

| Method | Endpoint | Thay đổi | Lỗi mới |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/classes/academic-years` | Bắt buộc `id` khớp `YYYY-YYYY` (`parseAcademicYear`); `startDate`/`endDate` (nếu gửi) phải `YYYY-MM-DD` hợp lệ và start < end | 400 `ACADEMIC_YEAR_INVALID` |
| `POST` | `/api/classes` | Trùng `(parish, code, academicYear)` hoặc FK sai trả rõ nghĩa thay vì 500 | 409 `CLASS_CODE_EXISTS`, 400 `INVALID_REFERENCE` |
| `PUT` | `/api/classes/:id` | Như trên | 409 `CLASS_CODE_EXISTS`, 400 `INVALID_REFERENCE` |
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


