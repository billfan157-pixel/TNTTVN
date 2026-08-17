# System Architecture & Layer Boundaries

> Version: 2.5 | Last reviewed: 2026-08-15 | Status: ✅ Current | Prerequisites: none

---

## 1. Current Architecture

### Layer Diagram

```text
┌──────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                             │
│  Pages: 17 route pages (14 protected + 3 login)                    │
│  Components: 57 (common: 22, desktop: 18, exam: 6, mobile: 12)     │
│  Router: TanStack Router (18 paths: 15 pages + 3 login, no 404)    │
│  State: 18 Zustand stores (13 persist → Dexie, 5 in-memory)       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ reads/writes
┌────────────────────────────▼─────────────────────────────────────┐
│                     DATA LAYER (Client-side)                      │
│  Dexie IndexedDB: Zustand persist (13 stores) + syncQueue        │
│  Sync Engine: useSyncEngine → syncService.ts → syncProcessor.ts  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP (JSON + JWT)
┌────────────────────────────▼─────────────────────────────────────┐
│              BACKEND (Hono + @libsql/client)                       │
│  Auth: JWT (access 15m, refresh 7d), bcrypt, RBAC enforced       │
│  Routes: 20 route handlers under server/src/routes/               │
│  Repositories: 6 (2 projection read models + 4 Drizzle write)    │
│  Services: 31 under server/src/services/                          │
│  Middleware: 4 (auth, security, logger, metrics)                  │
│  DB: SQLite/Turso via @libsql/client, Drizzle ORM (32 tables)    │
│     (WAL mode local; TURSO_URL → managed libSQL, ADR-041)        │
└──────────────────────────────────────────────────────────────────┘
```

### Key Architectural Characteristics

- **Modular Monolith** — Single-parish deployment with zero distributed microservice complexity.
- **Login Gate & Security Envelopes** — **2 cổng đăng nhập UI, chung 1 backend auth (ADR-044)**: `/login` (chọn cổng) → `/login/phuhuynh` (SĐT + mật khẩu, quên mật khẩu ADR-042) hoặc `/login/nhan-su` (tên đăng nhập + mật khẩu, liên hệ BGL khi quên). **1 tài khoản = 1 vai trò** (`users.role` enum): đăng nhập sai cổng → role gate logout + chỉ đường sang cổng đúng (GLV kiêm PH dùng 2 tài khoản riêng). Backend KHÔNG đổi: `POST /api/auth/login` duy nhất, JWT `tokenVersion` validated trên mọi API call.
- **RBAC & Class Scope Guards** — `roleMiddleware` and `checkUserClassAccess` enforced across all REST endpoints. Client-side: TanStack Router `requireRole` guards per route; admin-only admin pages consolidated into the **"Quản Lý Hệ Thống" hub** (`/management` — tabs: Năm Học, Lớp Học, Tài Khoản); `/classes` + `/academic-years` + `/catechists` client guards là `admin`-only (server API roles: `/users/catechists` vẫn `admin + chunhiem`, xem `router.tsx:170`).
- **Automatic Viewport Adaptation (`useEffectiveMode`)** — Dynamically switches between Desktop (≥768px) and Mobile (<768px) components while respecting explicit user override mode in `filterStore`.
- **Capacitor Native Shell (2026-08-13)** — Dual-platform: Web (PWA, `vite-plugin-pwa` + `sw.ts`) **và** App native (Android/iOS) qua Capacitor 8 (`@capacitor/core` + `@capacitor/android` + `@capacitor/ios`, config `capacitor.config.json`, appId `com.tnttvn.app`, webDir `dist`). `useEffectiveMode` ép `mobile` mode khi `Capacitor.isNativePlatform()`. API base cho native build lấy từ `VITE_API_BASE` (production: `https://tnttvn-production.up.railway.app/api` — `.env.production`; dev web giữ proxy `/api` → `localhost:3001`). Web Push (`pushManager.ts`) tự disable trên native (không service worker — `isSupported()` false, không crash); push native dùng plugin `@capacitor/push-notifications` (backlog). Build: `npm run capacitor:sync` → `npx cap open android` (Gradle `assembleDebug` ra `app-debug.apk`); project native trong `android/` + `ios/` (đã commit cùng repo). Lưu ý build Windows: `android/local.properties` dùng **forward slashes** (`sdk.dir=C:/...`) vì Java Properties parse `\b`/`\u` làm hỏng path, và `JAVA_HOME` nên trỏ JDK 21 (Android Studio JBR). **CI/CD native qua Codemagic** (`codemagic.yaml`, ADR-029): workflow `ios` build web → `cap sync ios` → `xcode-project build-ipa` (auto signing) → TestFlight; workflow `android` → `gradlew assembleDebug` → artifact APK. Không cần máy Mac — runner macOS cloud của Codemagic (free tier ~500 build phút/tháng; TestFlight yêu cầu Apple Developer $99/năm).
- **Offline Sync Engine (`useSyncEngine`)** — 4-phase push pipeline + delta pull:
  1. **Phase 1 — Compact & Flush**: merge duplicate ops in the queue, then flush batched UPDATEs. Safe compaction rule: `CREATE` + `DELETE` pairs only canceled if `CREATE` is unsent local-only (`pending` status, `retryCount` 0). If `CREATE` has retried, keep BOTH `CREATE` and `DELETE` so Phase 1.5 retries `CREATE` with `idempotencyKey`, remaps Temp ID to Server Real ID, and Phase 3 executes `DELETE` with real ID (zero lost mutation).
  2. **Phase 1.5 — Parent CREATEs first**: parent entities (student/class/notice/exam) are created with `idempotencyKey` and client temp IDs remapped to server IDs BEFORE dependents sync.
  3. **Phase 2 — Group batchable ops**: grade/attendance UPDATEs grouped into batch requests.
  4. **Phase 3 — Individual ops**: student/class/notice/exam CREATE, DELETE and non-UPDATE ops processed one-by-one.
  Then **Pull Delta** (`fetchAllData`) refreshes client state.
  - Conflict handling: LWW field-level merge on version conflict for Grade/Attendance (client edit kept), Server-Wins for Student/Class/Notice/Exam CRUD (with explicit Toast separation). Strict Optimistic Concurrency Control (OCC) version enforcement, exponential backoff. Retry thresholds: server/client errors retry up to 3 (`MAX_RETRIES`), network errors bypass the cap up to 5 attempts. Dexie operations wrapped in atomic `db.transaction`. User isolation enforced fail-closed (`isOwnOp`) with 1-time `migrateLegacyQueueUserIds`.
- **CQRS Read Model Projections** — Pure SQL read repositories (`ReportCardProjectionRepository`, `ClassSummaryProjectionRepository`) separate from write models (4 Drizzle write repositories).
- **Outbox & Notification Infra** — `outboxService.ts` (outbox-message pattern) + `notificationQueue.ts` (retryable delivery queue, ADR-014) + `telegram.ts`/`smartNotifications.ts`/`webPushService.ts` for notifications. Web push end-to-end: client `pushManager.ts` + `public/sw.js` (SW nhận push khi app đóng), server `webPushService.ts` là SSOT gửi (`/notifications/send` + queue đều đi qua), queue không còn đánh dấu `sent` giả — VAPID thiếu → `failed`. Web push **CÓ CHỦ ĐÍCH**: `sendWebPushToUsers` lọc theo `user_id`; `notifyParishNotice` gửi phụ huynh khớp phone (SSOT `phoneMatchVariants` + `CanAccessStudentSpecification`) theo `targetBranch`, persist `notifications.target_user_ids` để recover không broadcast nhầm (ADR-022). Offline sync engine hardening follows ADR-016 (queue user-scoping, temp-ID remap before dependent sync, per-request zod batch isolation, `lastSyncAt` timing, transient-failed promotion, per-user queue compaction).
- **Cổng Phụ Huynh** — `GET /api/parents/my-children` (role `phuhuynh`, `parentService.ts`) + `src/pages/ParentPage.tsx` (route `/parent`, tab "Con Của Tôi" thay Thiếu Nhi/Điểm Danh/Bảng Điểm/Báo Cáo cho phụ huynh; phiếu điểm qua `ReportViewModelFactory`/`GET /api/reports/report-card/:studentId`). **Dashboard riêng cho PH**: `src/pages/DashboardPage.tsx` render `src/components/common/ParentDashboard.tsx` (responsive desktop + mobile) khi role = `phuhuynh` — greeting, chọn con (chip), thẻ điểm HK1/HK2/Xếp Loại/Chuyên Cần, kết quả năm (promotion), thông báo mới nhất (`useNoticeStore`), CTA sang `/parent` để in phiếu điểm. Data fetching SSOT: `src/hooks/useParentPortal.ts` (children + report card, dùng chung cho `ParentDashboard` và `ParentPage`). Liên kết PH ↔ con bằng số điện thoại chuẩn hóa (`utils/phone.ts`) — quyết định ADR-022 (Option A decision matrix: 9/9/9 vs Option B 6/6/6).
- **Cấp Tài Khoản Phụ Huynh Hàng Loạt (Parent Provisioning, ADR-026)** — `GET /api/users/parent-provision-preview` + `POST /api/users/provision-parents` (admin-only + re-auth `adminPassword` chuẩn A06 + `adminReauthRateLimiter`): scan `students.parentPhone` cùng giáo xứ → normalize/dedupe SĐT (anh chị em cùng SĐT → 1 account `childrenCount`), skip placeholder `'Chưa cập nhật'`/invalid/đã có user/trùng username toàn cục; tạo `role='phuhuynh'`, username = SĐT chuẩn hóa, temp pass `Parish@\d{6}` + `FORCE_PASSWORD_CHANGE` (policy §10.1/§10.2), bcrypt 12, `passwordEncrypted` theo ADR-021, **không** gán `catechistAssignments` (fix: `createUser` chỉ gán lớp cho `chunhiem`/`phuta`). Audit gộp `PARENT_ACCOUNTS_PROVISIONED` không PII (A16, `entityId='bulk-parent-provision'`); idempotent (ADR-015), partial-success itemized (ADR-008). UI: `UserManagementPage` nút "Cấp Tài Khoản Phụ Huynh" (modal preview → re-auth → kết quả + copy temp pass); service: `userService.ts`.
- **Báo Cáo Nâng Cao & Xuất File** — `src/services/reportExporter.ts`: xuất CSV (BOM UTF-8) / XLSX (`xlsx` v0.18) cho bảng thống kê phân ngành + chi tiết học sinh, tái sử dụng `ReportViewModelFactory` làm SSOT tính điểm; UI ở `DesktopReports.tsx` (admin/chunhiem/phuta).
- **Sunday Mass Reminder Scheduler** — `sundayReminderScheduler.ts` (`initSundayReminderScheduler` khởi động trong `server/src/index.ts`): check 60s, chỉ Chúa Nhật, cửa sổ `[sundayMassTime, +120min]`, idempotent qua marker `sunday_reminder_last_sent` trong `system_settings`. Giờ lễ đọc từ parish settings (SSOT `getSundayMassTime` trong `smartNotifications.ts`, default `'08:00'`) — không còn hardcode (xem `docs/BUSINESS_RULES.md` §10.7).
- **PDF Export (nhánh PDF, 2026-08-12)** — In ấn 3 lớp: (1) in trình duyệt trực tiếp (client-side, `src/utils/pdfGenerator.ts` tạo HTML phiếu điểm/chứng chỉ/thẻ thiếu nhi A6 — `BATCH_PHOTO_CARDS`); (2) **server render PDF qua Puppeteer**: `POST /api/reports/generate-pdf` (admin/chunhiem/phuta) nhận `htmlContent` → `server/src/services/pdfService.ts` (singleton browser, lazy launch, close ở SIGTERM/SIGINT) → trả PDF binary. Types `ReportType`/`ReportOptions` mirror 2 phía (`server/src/utils/pdfGenerator.ts` = contract, client = SSOT nội dung). Chứng chỉ in có mã QR xác thực (`src/lib/qr.ts` — payload `tntt-cert:{certId}:{studentId}:{type}`). **✅ A-NEW-42 (CLOSED 2026-08-13)**: `sanitizePDFHTML` (`utils/pdfSanitizer.ts`) + Puppeteer Request Interception chặn `file://` (LFI) và local/private IP (SSRF) — chi tiết `docs/SECURITY_AUDIT_LOG.md`.
- **Khôi Phục Đợt Nhập Điểm (Undo Import, ADR-028, 2026-08-12)** — `POST /api/grades/undo-import` (admin/chunhiem theo class-access): đảo ngược lần ghi điểm gần nhất của từng bảng điểm trong đợt import dựa trên **audit_logs làm nguồn restore** (không bảng mới): entry mới nhất `entityType='grade'` — `CREATE` → xóa row, `UPDATE` → khôi phục `oldValue` (version +1). Cửa sổ **7 ngày** (`UNDO_GRADE_WINDOW_DAYS`); từ chối nếu entry mới nhất không phải CREATE/UPDATE (`not-clean` — chống undo lặp/mất sửa tay); semester lock + access check trong cùng tx (ADR-016 S24). Audit mỗi item `GRADE_UNDO`. UI: `ExcelGradeImportModal` snapshot localStorage → nút "Hoàn Tác Đợt Nhập Trước" → refetch. Service: `gradeService.undoGradeImport`; tests `gradeUndoImport.test.ts`.

---

## 2. Layer Boundaries & Dependency Rules

| Layer | Can Import From | Cannot Import From |
| :--- | :--- | :--- |
| `pages/` | `components/`, `stores/`, `hooks/`, `utils/`, `lib/` | `server/` |
| `components/` | `stores/`, `hooks/`, `utils/`, `lib/` | `pages/`, `server/` |
| `stores/` | `lib/`, `utils/`, `types/` | `components/`, `pages/`, `hooks/` |
| `hooks/` | `stores/`, `lib/`, `utils/` | `components/`, `pages/` |
| `lib/` | `types/` | `stores/`, `components/`, `pages/`, `hooks/` |
| `utils/` | `types/` | `stores/`, `components/`, `pages/`, `hooks/`, `lib/` |
| `routes/` (server) | `services/`, `middleware/`, `db/`, `utils/` | `client/` |
| `services/` (server) | `db/`, `utils/`, `repositories/` | `routes/`, `middleware/` |
| `repositories/` (server) | `db/` | `routes/`, `middleware/`, `services/` |

---

## 3. Security Envelope

- **Auth** — JWT HS256 (access 15m, refresh 7d, tách `JWT_SECRET`/`JWT_REFRESH_SECRET` bắt buộc ở production), bcrypt 12 rounds (A-NEW-19, 2026-08-11: upgrade từ 10 theo OWASP, rehash-on-login cho hash legacy cost 10), `tokenVersion` validated on every request (revoked on logout & password reset), `failedAttempts` auto-lock at 5 (atomic SQL increment — A-NEW-19 fix TOCTOU lost update). **Refresh token rotation** (`refresh_tokens` — lưu sha256 hash, rotate mỗi `/refresh`, reuse detection thu hồi toàn bộ phiên khi phát hiện đánh cắp; logout per-session). **A01 Phase 1 (2026-08-10)**: refresh token chuyển sang **HttpOnly cookie** `parish_refresh` (`Secure` ở production, `SameSite=Lax`, `Path=/`, 7 ngày; client `credentials:'include'`; `/refresh` đọc cookie trước, body chỉ là backward-compat). Access token (15m) giờ **memory-only** (A-NEW-10/20, 2026-08-11: không persist localStorage — XSS không lấy được; sau reload bootstrap lại qua `/auth/refresh` cookie HttpOnly). **A01 Phase 2 (2026-08-10)**: XSS sinks đã đóng — `ReportExportService` không còn `document.write` (Blob URL/srcdoc); print popup escape toàn bộ field user; A01 đã đóng P1. **ADR-045 (2026-08-16)**: session state persist 2 tầng — localStorage `parish_current_user` chỉ chứa **marker không-PII** `{id, role, parishId}` (guard đồng bộ); snapshot đầy đủ (username/fullName/phone) **mã hóa AES-256-GCM tại-rest trong IndexedDB** (`parish_auth_user`, dexieStorage, khóa non-extractable, AAD + tenant-scope); snapshot hỏng/thiếu → rebuild qua `GET /auth/me` khi online (offline → logout sạch); mọi đường session chết dọn cả marker lẫn snapshot (A-NEW-54).
- **Authorization (RBAC)** — 4 roles (`admin`, `chunhiem`, `phuta`, `phuhuynh`); `roleMiddleware` on all routes + `checkUserClassAccess` for class-scoped roles.
- **Multi-Tenant Isolation (Plan v2)** — **Mọi query phải mang `parish_id`**; read-back không ngoại lệ. Cross-parish read/write bị chặn trước khi check quyền chi tiết (sai parish → 404, không lộ sự tồn tại). Mọi định danh đều composite hóa theo ADR-031 — kể cả `users.username` → `UNIQUE(parish_id, username)` (`idx_users_username_parish`, ADR-046, migration `20260816-121`); login lookup theo parish (body `parishId` optional default `'gia-ton'`). Test suite: `server/src/__tests__/security/tenantIsolation.test.ts` (15 tests — cross-parish read/write + class-scope isolation; ✅ pass 2026-08-09, full suite 919/919 + `tsc -b` sạch) + `server/src/__tests__/username-tenant-scope.test.ts` (5 tests — ADR-046).
- **Input validation** — Zod schemas on all endpoints (trim, enums, max lengths); 10MB body limit.
- **Security headers** — CSP, HSTS, X-Frame-Options `DENY`, `nosniff`, Referrer-Policy, Permissions-Policy.
- **Rate limiting** — in-memory Map: 1000 req/60s per IP general, 10 req/60s login (resets on restart; acceptable for single-parish scale).
- **Data safety** — destructive ops (purge/restore) snapshot to `SAFETY_BACKUP_DIR` before execution (qua `server/src/services/safetySnapshot.ts` + `blobStorage.ts`, ADR-041); default `server/data/backups/safety`, hoặc `{DB_PATH dir}/backups/safety` khi `DB_PATH` set. Snapshot lưu local (chmod 0600) hoặc Cloudflare R2 nếu cấu hình `R2_*`. Automated daily DB backups qua `backupScheduler.ts` → `BACKUP_DIR` (disk) hoặc R2 (`backups/` prefix). **Lưu ý**: disk Railway là ephemeral → nên bật R2 để backup/safety bền vững qua redeploy (ADR-041).

## 4. Architecture Decision Records (ADR Links)

For full rationale and trade-offs of key architectural decisions, see [`docs/ADR_ARCHITECTURE_DECISION_RECORDS.md`](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
