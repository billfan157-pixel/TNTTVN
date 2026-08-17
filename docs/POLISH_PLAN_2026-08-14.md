# Kế Hoạch Polishing Toàn Diện — TNTT Parish Management Platform

- **Ngày:** 2026-08-14
- **Trạng thái:** ĐỀ XUẤT (chờ duyệt theo Decision Matrix v4.1.2)
- **Phạm vi:** Client (`src/`), Server (`server/src/`), Docs (`docs/`), Infra (Docker/deps)
- **Cơ sở:** 3 cuộc kiểm toán evidence-first đã hoàn thành (client / server / docs-drift), spot-check trực tiếp các mục P0.
- **Quy tắc:** Mỗi hạng mục HOÀN THÀNH phải kèm đồng bộ Markdown nguồn (AGENTS.md). Thứ tự ưu tiên TNTTVN (§29): Security & Privacy > Data Integrity > Tenant Isolation > Business Rule Correctness > Offline Reliability.

---

## Tổng quan trạng thái

| Lớp | Đánh giá |
|---|---|
| Lõi offline/sync (mã hóa, queue, conflict, idempotency, z-v4 batch isolation) | **Mature** — được audit sâu, ADR-016/017/018, gần như không có TODO |
| UI (mobile PWA, modals, a11y, inline styles) | **Gap lớn nhất** — 1 tính năng chết trên mobile, conflict inbox hiện ciphertext, 181 inline styles |
| Server API (envelope, validation, swallowing errors) | **Trung bình** — envelope 3 shape khác nhau, không response-schema, một số catch mất log |
| Tenant isolation | **Đa số tốt** — 3 lỗ hổng: `users.username` global UNIQUE, idempotency index không prefix parish, authz notification theo tên lớp |
| Docs sync | **~25 mục drift** — chủ yếu count blocks + 2 bảng Telegram thiếu tài liệu + index idempotency exam_sessions bị rơi |

Tổng hợp đề xuất: **4 giai đoạn / 6 nhóm / ~45 hạng mục**, ưu tiên theo mức ảnh hưởng.

---

# GIAI ĐOẠN 0 — Sửa lỗi hiển thị & UX chết (P0, batch nhanh, low-risk)

## Nhóm A. Bug người dùng thấy trực tiếp

| # | Hạng mục | Bằng chứng | Hành động đề xuất | Severity |
|---|---|---|---|---|
| A1 | **Mobile: modal Student/Report/Photo/Certificate không bao giờ mount** — tap vào nút report/edit trên mobile không làm gì | `src/components/common/RootLayout.tsx:131-149` (mobile branch) vs `:173-201` (desktop); `MobileStudentsView.tsx:329`; `StudentsPage.tsx:123-128` | Mount 4 modal vào mobile branch (dùng chung modal desktop, kiểm tra responsive); thêm test mount | **HIGH** |
| A2 | **Conflict Inbox hiển thị ciphertext AES (`enc:v1:…`) thay vì dữ liệu** | `ConflictInboxModal.tsx:116-127` render `c.localValue`/`c.serverValue`; gốc: `useSyncEngine.ts:188-194, 317-325` lưu `op.payload` đã mã hóa | Giải mã payload khi lưu conflict (dùng `offlineCipher.decrypt`) hoặc lưu giá trị plaintext + mã hóa lại riêng; hiển thị dữ liệu đã giải mã + test | **HIGH** |
| A3 | **Store errors không bao giờ hiển thị** — grade/settings/academicYear set `error` nhưng 0 component subscribe; classStore/noticeStore `catch {}` nuốt lỗi | `gradeStore.ts:138`; `settingsStore.ts:74,95`; `classStore.ts:202,210`; `noticeStore.ts:87-91` (grep 0 UI reads) | Toast/ErrorBanner chung cho các store có `error`; bỏ `catch {}` nuốt, ít nhất Sentry + error field | **MED-HIGH** |
| A4 | **11+ native `confirm()/alert()` trong luồng import/exam** — chặn PWA mobile, không style được | `ExcelGradeImportModal.tsx:134,139,184,223,244,287,303,306,322,329,335`; `ExcelImportModal.tsx:227,229,995,998`; `ExamSessionView.tsx:152,166,312`; `ConflictInboxModal.tsx:40`; `SystemDiagnosticsModal.tsx:213`; `DesktopReports.tsx:52` | Thay bằng `ConfirmDialog` đã có (`ConfirmDialog.tsx:16`) | **MED** |
| A5 | **`batchPromote` fire-and-forget** — enqueue không await, không gọi `runSyncFlow()`; promotion có thể không sync đến 30s sau | `studentStore.ts:151-172` | Await enqueue + gọi `runSyncFlow()` sau batch (giống grades/attendance stores) | **MED-HIGH** |
| A6 | **Router context `auth: undefined!` chết** — không ai set, truy cập là throw | `src/router.tsx:254-256`; `main.tsx` không set | Xóa hoặc set thật từ authStore; thêm test | **HIGH (dead code)** |

## Nhóm B. Dead code & trùng lặp (xóa/an toàn)

| # | Hạng mục | Bằng chứng | Hành động | Severity |
|---|---|---|---|---|
| B1 | **`PolishedUI.tsx` chết 100%** (EmptyState/SkeletonRow/FriendlyError) | `src/components/common/PolishedUI.tsx` — 0 import trong `src/` | Xóa file; nếu cần EmptyState/Skeleton thì dùng bản đang dùng thật | **HIGH** |
| B2 | **3 bản in phiếu điểm song song** | `StudentReportModal.tsx:48-49` (`window.print()`); `PrintReportModal.tsx:12` (ReportExportService); `ParentPage.tsx:22-78` (HTML string thủ công) | Hợp nhất về 1 service in; ParentPage dùng lại component | **MED-HIGH** |
| B3 | **4 utility Excel chồng lấn** | `utils/excelParser.ts`, `excelImporter.ts`, `excelGradeParser.ts`, `excelExporter.ts` (các file import khác nhau) | Thống nhất bảng mô tả cột/CSV; ít nhất document boundary từng file | **LOW-MED** |
| B4 | **`/management` trùng 3 route admin top-level; `/users` wrapper mỏng** | `ManagementPage.tsx:4-6,60-62`; `UsersPage.tsx:4-6`; `router.tsx:134-165,200-209` | Quyết định 1 trong 2 (giữ `/management` làm hub hoặc xóa) + đồng bộ router/docs | **MED** |
| B5 | **Server dead code**: `utils/stateMachine.ts` test-only; `pdfService.generateReportCardPDF` stub always-throws; `server/data/_query.js` stray probe | `utils/stateMachine.ts`; `services/pdfService.ts:83-92`; `server/data/_query.js` | Xóa hoặc triển khai/đánh dấu deprecated + docs | **LOW-MED** |
| B6 | **`permissions`/`role_permissions` seeded nhưng không middleware nào dùng** — dead RBAC subsystem | `seed.ts:54-80`; `db/index.ts:70-75,235-240` | Quyết định: triển khai enforcement hoặc tuyên bố deprecated trong docs (D2, cần matrix) | **D2** |
| B7 | **2 Dockerfile phân nhánh** (root: dist+entrypoint+non-root; `server/Dockerfile`: chạy `tsx src/index.ts`, root user, copy cả `test.db`) | `Dockerfile:1-62`; `server/Dockerfile:13-17` | Xóa `server/Dockerfile` cũ hoặc thống nhất 1 build path | **D2** |

---

# GIAI ĐOẠN 1 — Data integrity & offline/sync (P1)

| # | Hạng mục | Bằng chứng | Hành động | Severity |
|---|---|---|---|---|
| C1 | **Idempotency index `exam_sessions` bị rơi khi rebuild `20260814-109`** — docs vẫn ghi UNIQUE; app chỉ còn dedup logic | `db/index.ts:874-900` (rebuild chỉ 2 indexes); `schema.ts:664-690`; `docs/07_DATABASE_PLAN.md:40` | ~~Thêm UNIQUE index trở lại migration mới (kiểm tra data trùng trước) + cập nhật docs~~ | **✅ DONE (2026-08-14)** — migration `20260814-117` + defensive boot recreate `db/index.ts:483`; schema.ts:695 giữ khai báo; test `migration-integrity.test.ts` `1d` (dup reject + NULL-skip) |
| C2 | **Unstable selectors** — `useClassStore((s) => s.getClassList())` gọi getter bên trong selector → object/array mới mỗi render | `HeaderBar.tsx:34`; `UserManagementPage.tsx:24`; `PrintReportModal.tsx:43` | Dùng form `useClassStore(s => s.getClassList)` (stable fn) hoặc memo selector | **MED** |
| C3 | **`gradeStore` thiếu `loading`** + các `getStudentGrade`/`calculateStudentAvg` O(n) per render | `gradeStore.ts`; `StudentReportModal.tsx:40-46`; `DesktopReports.tsx:30-31` | Index grades theo `(studentId, academicYear, semester)` trong store; thêm `loading` | **MED** |
| C4 | **`syncStore.clearResolvedConflicts` — biến `query` chết + comment lệch** | `syncStore.ts:252-258` | Dọn code | **LOW** |

---

# GIAI ĐOẠN 2 — Security & tenant isolation (P2)

| # | Hạng mục | Bằng chứng | Hành động | Severity |
|---|---|---|---|---|
| D1 | **`users.username` UNIQUE toàn cục** — login lookup không filter parish; chặn multi-parish, nguy cơ collision | `db/index.ts:30`; `routes/auth.ts:116` | ~~Migration composite `(parish_id, username)` + login lookup theo parish (D3 — cần matrix + rollback plan)~~ | **✅ DONE (2026-08-16) — ADR-046 / A-NEW-55**: migration `20260816-121` drop `users_username_unique` + `idx_users_username_parish UNIQUE(parish_id, username)`; login nhận `parishId` optional default `'gia-ton'` + lookup scoped; pre-check createUser/updateUserPhone/provision scoped; test `username-tenant-scope.test.ts` 5/5 + 15 suite auth/user 97/97 |
| D2 | **Idempotency indexes global, không prefix parish** (students, notices, exam_sessions) | `db/index.ts:406`, migration `105-106`, `094` | Đổi sang UNIQUE có parish prefix trong migration rebuild kế | **D2** |
| D3 | **Auth user PII (phone, role) plaintext trong localStorage** — trong khi mọi store khác AES-at-rest | `authStore.ts:34,59,90,103` | ~~Dùng `dexieStorage`/cipher cho user snapshot (giữ `current` flag)~~ | **✅ DONE (2026-08-16) — ADR-045 / A-NEW-54**: marker `{id,role,parishId}` (không PII) ở localStorage + snapshot mã hóa AES-GCM trong Dexie (`parish_auth_user`); rebuild qua `GET /auth/me`; verify 1336/1336 |
| D4 | **Authz notification theo tên lớp (string match)** thay vì class-id | `notifications.ts:151-197` | Đổi sang class-id + check `checkUserClassAccess` | **D1** |
| D5 | **Scheduler hardcode single-parish** | `sundayReminderScheduler.ts:10`; `backupScheduler.ts:11` (`PARISH_ID \|\| 'gia-ton'`) | Lặp qua các parish có dữ liệu | **D1** |
| D6 | **`/api/reports/generate-pdf` nhận `htmlContent` + `options` không validate** (Puppeteer, DoS tiềm năng) | `reporting.ts:62-84` | `zValidator` cho body; giới hạn size/độ sâu HTML; rate limit riêng | **D2** |
| D7 | **Error masking** — students/settings PUT → mọi lỗi thành 400; import → 500 với `String(causeMsg)` | `students.ts:95-98,123-126`; `settings.ts:133-135`; `import.ts:73-77` | Map theo loại lỗi; không leak internals | **D2** |
| D8 | **`notificationQueue` nuốt rejection** — worker chết im lặng | `notificationQueue.ts:147,152` (`processQueue().catch(() => {})`) | Log structured + metric + retry | **D2** |
| D9 | **Audit-write thất bại bị nuốt** trên destructive ops (backup export/restore) | `backup.ts:270,404,516` | Ít nhất log; cân nhắc không chặn nhưng phải observable | **D2** |
| D10 | **HeaderBar gradient inline** — dark mode không đổi | `HeaderBar.tsx:58-61` | Chuyển sang Tailwind/dark variant | **LOW** |
| D11 | **Plaintext `localValue` conflict lưu `JSON.stringify(result.data)`** — xem A2 (giải mã 2 chiều) | `useSyncEngine.ts:192-193` | Trong A2 | — |

---

# GIAI ĐOẠN 3 — Architecture & maintainability (P3, sau P0-P2)

| # | Hạng mục | Bằng chứng | Hành động |
|---|---|---|---|
| E1 | **Response envelope 3 shape khác nhau + untyped `successResponse`/`errorResponse` duck-typed** | `utils/response.ts:50-95`; `auth.ts:81`; `grades.ts:95-99`; `backup.ts:314` | Thống nhất 1 contract `{success, data, error?}`; lập kiểu `z.output` cho các endpoint chính (D2) |
| E2 | **Không response-schema validation** (chỉ request body) | tất cả routers | Zod cho response của 10 endpoint nghiệp vụ cốt lõi |
| E3 | **`gradeService.ts` (552 dòng, 29 any) + `GradeApplicationService` + `DrizzleGradeRepository` chồng lấn** | `services/gradeService.ts`; `services/GradeApplicationService.ts`; `repositories/DrizzleGradeRepository.ts` | Consolidation theo DDD đã có; xóa legacy read path |
| E4 | **`importService.ts` monolith 1030 dòng** | `services/importService.ts` | Tách validation / mapping memory / disambiguation / transaction |
| E5 | **`db/index.ts` 1400 dòng** (inline DDL + 116 migrations + triggers) | `db/index.ts:27-400,457-748,1415-1443` | Tách migration files theo năm/ADR; loại `catch {}` silent trong recovery |
| E6 | **Server-only deps nằm trong client `dependencies`** (hono, drizzle, libsql, bcryptjs, jsonwebtoken, web-push, grammy) | `package.json:28-30,36,38-41,49` | Chuyển sang `devDependencies` hoặc tách workspace; đo bundle impact |
| E7 | **Outbox dispatch thất bại không ghi error column, retry vô hạn không backoff/alert** | `outboxService.ts:196-205,151-166` | Ghi error + exponential backoff + metric |
| E8 | **`AcademicYearLifecycleService.ts:543` nuốt lỗi lookup → null** | `services/AcademicYearLifecycleService.ts:543` | Log + phân biệt "không có" vs "DB lỗi" |
| E9 | **Dynamic `await import()` trong handler** (re-import db/eq/schema mỗi request) | `routes/classes.ts:71-84`; `DrizzleGradeRepository.ts:195` | Import tĩnh |
| E10 | **PDF: Puppeteer/Chromium cho 1 endpoint + `pdfGenerator.ts` type-shim** | `server/package.json:25`; `routes/reporting.ts`; `utils/pdfGenerator.ts` | Quyết định giữ/cắt (ADR) — profile GENERAL |
| E11 | **Audit logs: không có action whitelist filter; thiếu audit cho notice/settings/exam mutations** | `auditLogs.ts:18`; `notices.ts`; `settings.ts` | Thêm audit events |
| E12 | **`any` hotspots** — client: `api.ts` (50), `ExcelImportModal.tsx` (45), `syncService.ts` (11); server: `backup.ts` (21), `PromotionApplicationService.ts` (13) | grep counts | Giảm `any` 208→<80 client, theo từng file ưu tiên |

---

# GIAI ĐOẠN 4 — Đồng bộ Docs (bắt buộc AGENTS.md; làm song song từng hạng mục, pass cuối để verify counts)

## F1. Drift phải sửa ngay (kể cả khi chưa đổi code)

| # | Drift | Bằng chứng | Hành động |
|---|---|---|---|
| F1 | 2 bảng `telegram_link_tokens`, `telegram_links` thiếu trong "30 tables" | `docs/07_DATABASE_PLAN.md:3,10`; `schema.ts:27-67` | Cập nhật 07_DATABASE_PLAN (32 bảng) |
| F2 | Backup export: docs ghi `GET ?adminPassword=`, code là `POST` body | `docs/FRONTEND_API_CONTRACT.md:341-343,371-375`; `backup.ts:159` | Sửa contract §11 |
| F3 | Bảng `promotion_snapshots` trong contract không tồn tại (thực tế `promotion_records`, payload key `promotionSnapshots`) | `docs/FRONTEND_API_CONTRACT.md:326-327`; `schema.ts:587`; `backup.ts:60-65` | Sửa §11 |
| F4 | Purge scope không nhất quán: 20 (BUSINESS_RULES:228) / 21 (contract:176) / 23 (code) | `purgeService.ts:18-42` | Thống nhất 23 ở cả 3 docs |
| F5 | A-NEW-42 ghi "TRACKING" ở 2 docs — thực tế CLOSED | `02_ARCHITECTURE.md:57`; `FRONTEND_API_CONTRACT.md:385-387` | Đánh dấu CLOSED |
| F6 | `students.code` UNIQUE → composite `(parish_id, code)`; `branches`/`academic_years` PK → composite; `system_settings` PK → `(key, parish_id)` | `07_DATABASE_PLAN.md:13,18-19,21`; migrations `116`, rebuild `20260814-109` | Cập nhật rows 7/8/10/2 |
| F7 | `semester_locks` thiếu `unlocked_by`/`unlocked_at` trong docs | `07_DATABASE_PLAN.md:47-56`; `schema.ts:545-546` | Cập nhật |
| F8 | Endpoints thiếu trong contract: `GET /notifications/subscriptions`, `POST /smart/*`, `POST /parents/telegram/*`, `POST /users/:id/force-logout`, `POST /grades/restore-batch` | `notifications.ts:107-179`; `parents.ts:24-70`; `users.ts:190-201`; `grades.ts:344` | Bổ sung §7/§9 |
| F9 | Role drift: `/catechists` client admin-only (docs: admin+chunhiem+phuta); `/parent` admin+phuhuynh (docs: chỉ phuhuynh); `GET /academic-years` auth-only (docs: admin+chunhiem) | `router.tsx:170,211-220`; `academicYears.ts:17-21` | Sửa docs theo code (hoặc ngược lại nếu là bug — cần confirm) |
| F10 | Count blocks: pages 14→15, components 40→56, stores 15→17 (persist 11→12), services 28→31, paths 16→17 (không có 404) | `02_ARCHITECTURE.md:14-17,31,33`; `AI_CONTEXT_MAP.md:54,64` | Cập nhật count blocks |
| F11 | Header dates stale (4 docs) | `FRONTEND_API_CONTRACT.md:5`; `BUSINESS_RULES.md:4`; `AI_CONTEXT_MAP.md:4`; `07_DATABASE_PLAN.md:4` | Cập nhật ngày |

## F2. Open item bên ngoài repo

| # | Hạng mục | Chi tiết |
|---|---|---|
| F12 | **A-NEW-17 (SOLE OPEN security item)**: GitHub `refs/pull/1/head` giữ 17 commits chứa `parish.db`; purge ticket soạn xong chưa submit | `SECURITY_AUDIT_LOG.md:62` — cần repo owner action |
| F13 | Backlog đã ghi nhận (không due date): Redis rate-limiter khi scale multi-instance; CSP `style-src 'self'`; push native Capacitor; streaming backup; jose migration | AUDIT lines 1166-1172, 1751-1766 |

---

# Đề xuất phân bổ công việc

## Trạng thái thực hiện (cập nhật 2026-08-14)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| A1 | ✅ XONG | 4 modal mount vào mobile branch `RootLayout.tsx` |
| A2 | ✅ XONG | `ConflictValue` component + mã hóa `serverValue` tại 2 site `useSyncEngine`; test mới `syncStore.test.ts` |
| A3 | ✅ XONG | `useStoreErrorWatcher.ts` + error field classStore/noticeStore, bỏ `catch {}` im lặng |
| A4 | ✅ XONG | `useConfirmDialog.tsx`; 27 call sites convert; 0 native confirm/alert trong `src/components` |
| A5 | ✅ XONG | `batchPromote` async + `runSyncFlow()`; tests await |
| A6 | ✅ XONG | Xóa `context.auth` chết trong `router.tsx` |
| B1 | ✅ XONG | Xóa `PolishedUI.tsx` (0 import) |
| B5 | ✅ XONG | Xóa `stateMachine.ts` (+test 1 productionHardening), bỏ stub `generateReportCardPDF` + re-export `puppeteer`, xóa `_query.js` |
| C2 (một phần) | ✅ XONG | `PrintReportModal.tsx` dùng form stable selector; `HeaderBar.tsx`/`UserManagementPage.tsx` còn lại |
| C4 | ✅ XONG | Dọn dead query + comment lệch `clearResolvedConflicts` |
| F1-F11 | ✅ XONG | Docs drift đồng bộ (xem `docs/` tương ứng) |
| B2 | ✅ XONG | `generateParentReportCardHTML` (pdfGenerator, server DTO → escaped + watermark + promotion); ParentPage bỏ HTML thủ công (~50 dòng); StudentReportModal `window.print()` → `generateStudentReportCardHTML` + ReportExportService. Test mới #9 pdfGeneratorBatch. **Leftover (2026-08-16) ✅**: 8 native `alert()` còn lại đã thay bằng `useToastStore` toast — `reportExportService.ts` (6: preview/print/download/PDF blocked+error), `ExamSessionView.tsx:697` (lỗi chấm lại), `receiptGenerator.ts:349` (popup blocked). 0 native alert trong `src/` (chỉ còn fixture test XSS) |

**Verification đã chạy (2026-08-14):** `tsc -b` pass, `oxlint` 0 errors (154 warnings cũ), `vitest run` toàn repo **1225/1225 pass** (159 files) — trước B2; sau B2: utils + security + dialog suites 248/248 pass + pdfGeneratorBatch 9/9 + tsc pass. 2 test CRITICAL-2 `ExcelGradeImportModal` đã cập nhật sang dialog tùy chỉnh A4.

| Giai đoạn | Ước lượng | Phụ thuộc |
|---|---|---|
| **G0 — Bug UX + dead code** (A1-A6, B1-B4, B5) | 2-3 ngày | Không |
| **G1 — Data integrity/sync** (C1-C4) | 1-2 ngày | Không |
| **G2 — Security/tenant** (D1-D11) | 3-5 ngày | G1 (migration sequencing), D1 cần matrix D3 |
| **G3 — Architecture** (E1-E12) | 5-8 ngày | G0-G2 ổn định |
| **G4 — Docs sync** (F1-F11) | 1 ngày (song song) | Mọi thay đổi; pass cuối verify |

**Thứ tự khuyến nghị:** G0 → F (pass sửa drift cơ bản ngay đầu G0) → G1 → G2 → G3 → G4 verify cuối.

## Hạng mục cần Decision Matrix chính thức (D2/D3)
1. **D1**: composite UNIQUE `(parish_id, username)` + login lookup — D3 (auth/tenant), profile SECURITY.
2. **C1**: khôi phục idempotency index — D2 migration (đảm bảo rollback + check data trùng).
3. **B6**: dead RBAC subsystem — triển khai hoặc deprecate (D2, profile GENERAL).
4. **E1**: thống nhất response envelope — D2 contract (phải đổi client đồng bộ).
5. **B7**: thống nhất Dockerfile — D2 infra.

## Rủi ro chính
- **A2/A1** đụng luồng conflict/offline — phải có test trước khi đổi.
- **D1** migration đổi unique index — chạy check data trùng trước, rollback plan, phased (compat → migrate → verify).
- **E1** đổi envelope — đổi server + client + contract trong cùng 1 PR (tránh window mismatch).

## Verification định nghĩa
- G0: vitest cho từng fix + manual smoke mobile (Playwright mobile viewport).
- G1: migration test + index verification script.
- G2: security/tenant test suites (đã có 15 tests tenant isolation) + test mới cho từng thay đổi.
- G3: `tsc --noEmit` + oxlint + vitest toàn repo; bundle analyze (`ANALYZE` flag) trước/sau E6.
- G4: script grep counts đối chiếu docs (pages, components, stores, services, tables).
