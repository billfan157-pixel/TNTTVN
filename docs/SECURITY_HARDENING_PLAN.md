# Security Hardening & Multi-Tenant Isolation Audit — Plan v2 (ĐỀ XUẤT)

> Version: 2.0 | Last reviewed: 2026-08-09 | Status: ⏳ ĐỀ XUẤT — chờ phê duyệt | Prerequisites: 02, 07
> Evolution: v1 (phê duyệt có điều kiện — đối chiếu thực tế phát hiện: 4 mục [MODIFY] đều là read-after-write không khai thác được, thiếu ~10 vị trí cùng pattern, mục 2–3 chỉ mô tả trạng thái hiện có, test suite trùng coverage đã có) → v2 (này: mở rộng danh sách quy tắc chuẩn, chuyển mục 2–3 thành checklist, test suite tập trung phần chưa có coverage)

---

## 1. Mục tiêu & Phạm vi

**Vấn đề**: Thiết lập quy tắc bất biến "mọi SELECT dựa trên ID do client cung cấp hoặc đọc lại sau write phải mang theo `parishId`" (defense-in-depth). Audit v1 đã xác nhận: **không có lỗ hổng cross-tenant khai thác được ở tầng service hiện tại** — mọi entry point đều qua `authMiddleware` (parishId từ JWT) và các read-after-write đều nằm trong chính request đã ghi bản ghi thuộc giáo xứ của user. Nhưng quy tắc chưa được tuân thủ đồng nhất ở ~16 vị trí, tạo chỗ ẩn sai cho các refactor tương lai.

**Phạm vi v2**:
- A. Chuẩn hóa read-after-write / dependent-read: kèm `parishId` vào mọi SELECT (10 vị trí chính + các vị trí thuộc nhóm `exam_results` + `importService` 1 vị trí).
- B. Checklist xác minh mechanism bảo mật hiện có (JWT, RBAC, rotation, rate-limit, headers) — **không implementation**, chỉ pass/fail kèm bằng chứng.
- C. Test suite mới `tenantIsolation.test.ts` — cross-parish route-level cho Student/Class/Grade/Attendance/Exam (phần chưa có coverage); KHÔNG trùng reuse-detection (đã có `refresh-rotation.test.ts`).
- D. Fix mở rộng v1: `importService.ts:628` — lookup `academicYears.id` từ input client chưa scope parish.

**Out of scope (chống scope-creep)**:
- Token storage client (localStorage, đã ghi nhận trong `docs/02_ARCHITECTURE.md` §3 — known gap, tách plan riêng).
- CORS wildcard `*.vercel.app` — đánh dấu là decision item (mục 7), **không sửa trong phase này** — ✅ **2026-08-10 đã xử lý ở A13** (allowlist cứng `utils/originPolicy.ts`).
- Thay đổi schema / business rules / offline sync engine / API contract.

---

## 2. Quy tắc bất biến (canonical rule)

> Mọi truy vấn Drizzle (select/update/delete) trên bảng có cột `parish_id` PHẢI kèm `eq(<table>.parishId, parishId)` từ parameter của service. Ngoại lệ chỉ chấp nhận khi: (a) dữ liệu là read-after-write trong cùng transaction *và* row vừa được ghi với `parishId` của request **→ vẫn thêm để đồng nhất**; (b) khóa uniqueness toàn DB (`users.username`, `students.code`, `refresh_tokens.token_hash`) — schema vẫn quy định global unique (xem §5.2).

Không có ngoại lệ ngầm. Mọi PR thêm query mới phải tuân thủ; `tenantIsolation.test.ts` sẽ bảo vệ boundary chính.

---

## 3. [MODIFY] A — Chuẩn hóa read-back & dependent-read (18 vị trí SELECT)

### 3.1 Read-after-write trong cùng transaction/request (10 vị trí)

| # | File:dòng (hiện tại) | Lệnh đang bỏ sót | Thay đổi |
|---|---|---|---|
| 1 | `services/noticeService.ts:53` | `db.select().from(notices).where(eq(notices.id, id))` | `and(eq(notices.id, id), eq(notices.parishId, parishId))` |
| 2 | `services/noticeService.ts:123` | `select().from(notices).where(eq(notices.id, id))` | như trên |
| 3 | `services/attendanceService.ts:112` | `tx.select().from(attendance).where(eq(attendance.id, existing.id))` | `and(eq(attendance.id, existing.id), eq(attendance.parishId, parishId))` |
| 4 | `services/attendanceService.ts:130` | như trên (`updated`) | như trên |
| 5 | `services/attendanceService.ts:177` | `tx.select().from(attendance).where(eq(attendance.id, id))` | `and(eq(attendance.id, id), eq(attendance.parishId, parishId))` |
| 6 | `services/gradeService.ts:264` | `tx.select().from(grades).where(eq(grades.id, existing.id))` (fresh — VersionConflictError) | kèm `eq(grades.parishId, parishId)` |
| 7 | `services/gradeService.ts:286` | `tx.select().from(grades).where(eq(grades.id, existing.id))` (updated) | như trên |
| 8 | `services/gradeService.ts:337` | `tx.select().from(grades).where(eq(grades.id, id))` (created) | như trên |
| 9 | `services/classService.ts:133` | `tx.select().from(classes).where(eq(classes.id, id))` (created) | `and(eq(classes.id, id), eq(classes.parishId, parishId))` |
| 10 | `services/classService.ts:174` | `tx.select().from(classes).where(eq(classes.id, id))` (updated) | như trên |

### 3.2 Dependent-read theo input (4 vị trí) + import fix (1 vị trí)

| # | File / dòng | Thay đổi |
|---|---|---|
| 11 | `services/examService.ts:347` | `completeExamSession` đọc lại `examSessions` sau update → kèm `eq(examSessions.parishId, parishId)` |
| 12 | `services/examService.ts:373` | `reopenExamSession` đọc lại — như trên |
| 13 | `services/examService.ts:207, 261, 304, 319` | các SELECT `examResults` theo `examSessionId` (upsert/delete/getResults/count) — kèm `eq(examResults.parishId, parishId)` cho đồng nhất (hiện an toàn nhờ `assertSessionAccess` bọc trước) |
| 14 | `services/importService.ts:220` | lookup `academicYears.id` từ input client chưa scope — thêm `eq(academicYears.parishId, parishId)` (hiện: có thể tạo class trỏ sang năm học của giáo xứ khác — lỗi data-integrity, không lọât dữ liệu) |
| 15 | `services/classService.ts:19-23` | `enrichClassList` pre-fetch `users` — thêm `eq(users.parishId, parishId)` (audit v1 đúng) |

### 3.3 Đã xác minh, KHÔNG cần sửa (ghi nhận trong audit)

- `attendanceService.ts:250-253` batch update theo `existing.id` — safe vì `existingMap` xây từ pre-fetch scoped parish (dòng 214-224).
- `services` `AcademicYearLifecycleService` (dòng 203/215/343/365/530/544/547/645/663/668) — mọi entry đều qua `getYearOrThrow(yearId, parishId)` (parish-scoped) → không thêm nợ.
- `userService.ts:57` & `studentService.ts:124` — username/student-code uniqueness là GLOBAL theo schema UNIQUE — thiết kế, không phải leak (bàn ở §5.4).
- `revokeSessionByTokenHash` / `outbox`-worker / `notificationQueue` global status query — hệ thống multi-parish 1 worker queue có chủ đích, không phải leak.

---

## 4. Section B — Checklist bảo mật hiện có (verification-only, PASS/FAIL)

Không sửa code — đối chiếu hiện trạng 2026-08-09. **KẾT QUẢ: 10/10 PASS — xác nhận 2026-08-09 (kèm toàn bộ test suite 904/904 pass, `tsc -b --noEmit` sạch).**

| # | Cơ chế | Bằng chứng | Status |
|---|---|---|---|
| B1 | `JWT_SECRET`/`JWT_REFRESH_SECRET` bắt buộc prod, tách riêng | `middleware/auth.ts:14-30` (`NODE_ENV=production` throw nếu thiếu) | ✅ PASS |
| B2 | Access 15m / refresh 7d, `jwtid` random mỗi lần | `middleware/auth.ts:32-49` | ✅ PASS |
| B3 | `tokenVersion` validate mỗi request; lock LOCKED, FORCE_PASSWORD_CHANGE allowlist | `middleware/auth.ts:78-89` | ✅ PASS |
| B4 | Refresh rotation + reuse detection → revoke toàn bộ + bump tokenVersion | `services/refreshSessionService.ts:59-118`; test `refresh-rotation.test.ts` | ✅ PASS |
| B5 | `roleMiddleware` 4 vai trò trên mọi route | `middleware/auth.ts:95-103`; test `rbac-matrix.test.ts`, `authorization-boundaries-audit.test.ts` | ✅ PASS |
| B6 | Class-scope cho chunhiem/phuta: `checkUserClassAccess` + `getUserClassIds` | `middleware/auth.ts:117-130`; dùng ở `routes/grades.ts:293,319`, `exams.ts:70,90`, `attendance.ts:32-35,54,122`, `notifications.ts:123` | ✅ PASS |
| B7 | 4 rate limiter: 1000/10/30/10 per 60s | `middleware/security.ts:48-112` | ✅ PASS |
| B8 | Security headers + CSP + HSTS | `middleware/security.ts:20-29` | ✅ PASS |
| B9 | CORS allowlist cứng (hostname match, KHÔNG wildcard — A13) | `utils/originPolicy.ts` + `server/src/index.ts:38-63`; test `security/cors-origins.test.ts` | ✅ PASS (A13 2026-08-10) |
| B10 | Khóa sổ điểm (semester lock) + OCC nghiêm ngặt | `semesterLockSpecification`, `gradeService` OCC — test `SemesterLock.test.ts` | ✅ PASS |

Kết quả: **10/10 PASS** — xem chi tiết từng mục + lệnh test tương ứng: `${RUN}:` full `npx vitest run --fileParallelism=false` (904/904), `refresh-rotation.test.ts` (B4), `rbac-matrix.test.ts` + `authorization-boundaries-audit.test.ts` (B5), `SemesterLock.test.ts` (B10). Không mục nào FAIL → không dừng phase.

---

## 5. Section C — Test suite bảo mật tự động (mới)

### 5.1 File mới: `server/src/__tests__/security/tenantIsolation.test.ts`

Pattern chuẩn theo suite hiện tại: seed DB trực tiếp (`db.insert` + prefix unique theo `Date.now()`), tạo token bằng `generateTokens` (không cần login), gọi `router.request(...)` như `authorization-boundaries-audit.test.ts`.

### 5.2 Test cases (bổ sung — KHÔNG trùng `refresh-rotation`, `authorization-boundaries-audit`)

1. **Cross-parish READ (admin A vs data B)**: admin parish A không đọc được Student/Class/Grade/Attendance/ExamSession của parish B — qua endpoints `/api/students/:id`, `/api/classes/:id`, `/api/grades?studentId=...`, `/api/attendance`, `/api/exams/:id`. Expect: `403` hoặc `404`/rỗng (theo contract từng endpoint — assert theo thực tế route, không đoán).
2. **Cross-parish WRITE (catechist A vs student B)**: upsertGrade + upsertAttendance thẳng vào student của parish B → `403`/`404`; upsertExamResults phiên của parish B → `403`.
3. **Class-level (chủ nhiệm A trong cùng parish)**: chủ nhiệm lớp X1 không thể đọc/ghi điểm, điểm danh, đề thi của học sinh lớp X2 (không được phân công) → `403`. (Phần bổ sung coverage cho grades/attendance/exams; reporting/promotion/notifications đã phủ ở `authorization-boundaries-audit`.)
4. **Reference-only**: reuse-detection → xem `refresh-rotation.test.ts` (không viết lại).

**Tiêu chí hoàn thành**: case 1–3 pass với data real seeded trong test (không dùng fixture mock DB layer). Case 4 là reference-only.

**KẾT QUẢ: 15/15 PASS — xác nhận 2026-08-09 (suite mới `tenantIsolation.test.ts` 15 tests; full suite 919/919 pass, `npx tsc -b --noEmit` sạch).**

---

## 6. Verification Plan

```bash
# 1. Suite mới
npx vitest run server/src/__tests__/security/tenantIsolation.test.ts

# 2. Hồi quy các suite liên quan
npx vitest run server/src/__tests__/refresh-rotation.test.ts
npx vitest run server/src/__tests__/authorization-boundaries-audit.test.ts
npx vitest run server/src/__tests__/services/attendanceService.test.ts
npx vitest run server/src/__tests__/services/noticeService.test.ts
npx vitest run server/src/__tests__/examService.test.ts

# 3. Toàn bộ suites
npx vitest run

# 4. TypeScript (lệnh chuẩn của repo — README §Testing; tsc tay bỏ build mode)
npx tsc -b --noEmit
```

---

## 7. Decision Items (cần duyệt trong phase này)

| # | Mục | Khuyến nghị | Rủi ro nếu hoãn |
|---|---|---|---|
| D1 | CORS wildcard `*.vercel.app` (`index.ts:56`) | ✅ **ĐÃ XỬ LÝ (2026-08-10, A13)**: đổi sang allowlist cứng — `utils/originPolicy.ts` (`DEFAULT_ALLOWED_ORIGINS` + env `CLIENT_ORIGIN`), wildcard bị xóa; test `security/cors-origins.test.ts` | — |
| D2 | `!origin → true` trong `isOriginAllowed` | Giữ (curl/server-to-server hợp lệ) | Low |
| D3 | Global unique username/student code | Giữ (schema UNIQUE global). Ghi nhận: `SELECT.username` không scoped parish là 1 kiểu enumeration — chấp nhận ở mức hệ đơn giáo xứ | Low |

Không có rủi ro cao trong phase này — đây là phase defense-in-depth thuần.

---

## 8. Verification & Rollback

- **Automated**: mục 6.
- **Manual smoke**: login + tạo notice + điểm danh 1 buổi + chấm 1 phiên exam (sanity qua UI).
- **Rollback**: các thay đổi thuần query filter — revert từng PR mà không cần migration. Không có nguy cơ phá schema.
- **Impact**: không đụng `src/` (client), business rules, sync engine, API contract (response shape không đổi).

---

## 9. Documentation Sync (sau khi pass quality gate)

- `docs/02_ARCHITECTURE.md` §3 Security Envelope → ghi thêm rule §2 mới: "mọi query phải mang parish_id (Plan v2); read-back không ngoại lệ" + status test suite mới.
- `docs/AI_CONTEXT_MAP.md` → thêm `server/src/__tests__/security/tenantIsolation.test.ts` vào index test.
- Không cần đổi `07_DATABASE_PLAN.md` / `FRONTEND_API_CONTRACT.md` (không có schema/API thay đổi).

---

## 10. Quality Gate (chỉ hoàn thành khi tất cả pass)

- [x] `npx tsc -b --noEmit` pass
- [x] Toàn bộ test suites pass (kể cả suite mới)
- [x] Không vi phạm Dependency Flow (services → db/utils; không route/middleware import ngược)
- [x] Không đụng business rule / schema / API contract
- [x] Documentation cập nhật (§9)
- [x] Không có query new select/update/delete nào thêm vào mà thiếu `eq(parishId)`
- [x] Dead code: không log/dev secret nào rò rỉ

---

## 11. Decision Matrix (v2 sau điều chỉnh)

| Tiêu chí | Trọng số | v1 | v2 |
|---|---|---|---|
| Parish Operational Simplicity | 20% | 9 | 9 |
| Offline Reliability | 20% | 10 | 10 (không đụng) |
| Security & RBAC | 20% | 6 | 8 (phủ hết read-missing + test route-level) |
| Maintenance Cost | 15% | 9 | 9 |
| Performance | 15% | 9 | 9 |
| Code Quality | 10% | 8 | 8 |
| **Tổng** | | **8.5** | **8.9** |

**Hard gates**: Security ≥ 8 ✅ (v2) | RBAC không đổi ✅ | Offline ≥ 8 ✅ | Không data-loss/migration ✅ | Không vi phạm kiến trúc ✅ | TypeScript pass ✅

**Verdict**: ✅ Phê duyệt theo Plan v2, task list đi theo 4 Section A–D trong §3–§6.