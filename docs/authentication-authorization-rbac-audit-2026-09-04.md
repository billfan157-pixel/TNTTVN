# Audit Authentication, Authorization & RBAC — Catevia/TNTTVN

**Ngày audit:** 2026-09-04  
**Snapshot:** branch `main`, commit `62e1199fff35c61e03f874e6e7ba132990891c69`; các thay đổi/tài liệu đồng thời không thuộc audit (`docs/mobile-native-ui-audit-2026-08-12.md`, `docs/architecture-domain-design-audit-2026-09-04.md`) không bị chỉnh sửa.  
**Phạm vi:** source hiện tại, 184 đăng ký HTTP endpoint trong 31 router, middleware, application/domain services, schema/migrations, frontend route policy, refresh/offline sync, background workers, tests và CI.  
**Giới hạn:** đây là audit repository snapshot; không có quyền đọc secret/config production, dữ liệu production, access log, deployment SHA hay kiểm thử thiết bị đang offline.

## Kết luận điều hành

Hệ thống **không đạt** mục tiêu fail-closed và nhất quán trên mọi workflow ở snapshot này.

Ba vấn đề cần xử lý trước phát hành tiếp theo:

1. `GET /api/grades` và `GET /api/attendance` fail-open khi danh sách class scope rỗng. Một phụ huynh hoặc staff không được phân công nhận toàn bộ dữ liệu điểm/chuyên cần trong cùng giáo xứ. Parent sync còn tự động gọi hai endpoint và lưu kết quả vào Dexie theo tài khoản.
2. `POST /api/verification/sign` cho mọi staff ký một tuple chứng nhận tùy ý cho bất kỳ học sinh nào trong giáo xứ; public verifier sau đó công bố tên/lớp và xác nhận “chính hãng”, dù không có certificate/report record tương ứng.
3. Một access token admin hợp lệ là đủ để `POST /api/users` tạo thêm tài khoản `admin` và lấy mật khẩu tạm; create/status/assignment/force-logout không có re-auth. Stolen admin bearer 15 phút có thể chuyển thành quyền truy cập bền vững.

Tenant scoping nhìn chung tốt và không tìm thấy cross-parish read/write bypass trực tiếp trong các đường lõi đã kiểm tra. Tuy vậy, điều này không bù được các object/class-scope bypass trong cùng tenant.

## Phương pháp và mức độ bằng chứng

- Dựng inventory từ route registrations hiện hành, không lấy RBAC docs làm nguồn sự thật runtime.
- Truy vết route → middleware → service/domain → query/transaction → client/offline consumer.
- So sánh JWT claims với user record hiện hành và session table.
- Kiểm tra role `admin`, `chunhiem`, `phuta`, `phuhuynh`, scope cùng lớp/khác lớp/không assignment/cross-parish.
- Chạy bộ test hiện hữu và một test tái hiện độc lập tạm thời. Test tạm được xóa sau khi chạy, không thay đổi product code.
- Phân loại “verified” chỉ khi source path đủ xác định hoặc có runtime reproduction; các giả thiết production/legacy được giữ ở mục Unknown/conditional.

Authorization matrix chi tiết được trình bày trong canvas đi kèm; mỗi hàng là một rule endpoint hoặc một nhóm endpoint có cùng middleware, role và scope. Các pattern trong matrix bao phủ đủ 184 đăng ký route hiện tại.

## Verified vulnerabilities or authorization defects

### AUTHZ-01 — P0 — Empty class scope biến thành full-parish grade/attendance read

**Endpoint và call path**

- `GET /api/grades` → `authMiddleware` → `getUserClassIds()` → `getStudentsByClassIds()` → `getGrades()`.
- `GET /api/attendance` → `authMiddleware` → `getUserClassIds()` → `getStudentsByClassIds()` → `getAttendance()`.

**Authorization path thực tế**

- Router chỉ yêu cầu authentication, không giới hạn role: `server/src/routes/grades.ts:18-19,64-78`; `server/src/routes/attendance.ts:12-13,26-40`.
- Non-admin lấy class IDs. `getStudentsByClassIds()` trả `[]` đúng cách khi không có assignment: `server/src/services/studentService.ts:65-77`.
- `getGrades()` và `getAttendance()` chỉ thêm `IN (...)` khi `studentIds.length > 0`: `server/src/services/gradeService.ts:39-54`; `server/src/services/attendanceService.ts:12-36`. Vì vậy `[]` bị hiểu thành “không áp dụng scope”, không phải “không được thấy dòng nào”.

**Attacker / hành vi không được phép**

- `phuhuynh` bất kỳ trong giáo xứ, không có `catechistAssignments`, gọi trực tiếp hai endpoint và nhận điểm/chuyên cần của trẻ không phải con mình.
- `chunhiem`/`phuta` không có assignment cũng nhận dữ liệu toàn giáo xứ.
- `studentId` query trên attendance không cứu được authorization; attacker có thể lấy toàn bộ hoặc nhắm một ID biết trước.

**Impact tăng qua alternate/background path**

- `useSyncEngine.fetchAllData()` chạy cho mọi phiên authenticated và luôn gọi `fetchGrades()` + `fetchAttendance()`: `src/hooks/useSyncEngine.ts:506-518`.
- Hai stores ghi dữ liệu nhận được vào persisted `dexieStorage`: `src/stores/gradeStore.ts:115-136,352-355`; `src/stores/attendanceStore.ts:85-106,345-348`.
- Frontend route policy giấu `/grades` và `/attendance` khỏi parent (`src/constants/routePolicy.ts:51-75`) nhưng không phải security control; parent login bình thường vẫn có thể tự động tải và cache dữ liệu bị lộ.

**Runtime reproduction**

- Test tạm tạo một parent không liên quan, một child khác, grade có `private-grade-comment` và attendance có `private-attendance-note`.
- Kết quả: `1 file passed`, `2 tests passed`; cả hai response `200` chứa row và trường riêng tư tương ứng.
- Lệnh: `npm run test -- server/src/__tests__/security/.auth-audit-empty-scope-repro.test.ts --fileParallelism=false`.

**Remediation bắt buộc**

- Tại service, phân biệt `undefined/null = unrestricted admin` với `[] = deny all`; return `[]` ngay hoặc luôn thêm predicate false cho empty scope.
- Tại route, thêm role gate staff cho hai bulk endpoint. Parent phải dùng canonical `/api/reports/report-card/:studentId`, nơi ownership được kiểm server-side.
- Không gọi bulk grade/attendance pull cho parent trong sync engine.
- Thêm regression cho parent, unassigned staff, assigned staff, admin, cross-class và query-filtered read.

### AUTHZ-02 — P1 — Staff có thể phát hành chữ ký cho chứng nhận không tồn tại/không thuộc lớp

**Endpoint và call path**

- `POST /api/verification/sign` → `authMiddleware` → `roleMiddleware(admin,chunhiem,phuta)` → lookup student theo `studentId + parishId` → `signReportPayload()`.
- `GET /api/verification/verify` public → xác minh HMAC → lookup student → trả tên thánh, họ tên và lớp.

**Repository evidence**

- Sign route chỉ kiểm role staff và student tồn tại trong tenant; không gọi `checkUserClassAccess`, không kiểm report/certificate record, trạng thái finalized/locked, hoặc server-owned `certId`: `server/src/routes/verification.ts:19-62`.
- Public verify coi chữ ký của tuple caller-controlled là đủ để trả `verified: true` và PII tên/lớp: `server/src/routes/verification.ts:76-132`.

**Attacker / hành vi không được phép**

- Một `phuta` không được phân công lớp mục tiêu nhưng biết student ID từ parish-wide roster có thể xin chữ ký cho `academicYear` và `certId` tự chọn.
- Attacker nhúng chữ ký vào QR giả; public verifier tuyên bố phiếu/chứng nhận “chính hãng” dù không có bản ghi nghiệp vụ tương ứng.

**Remediation bắt buộc**

- Chỉ ký canonical immutable record đã tồn tại và đủ điều kiện phát hành; server sinh/lookup `certId`, không ký tuple tự khai báo.
- Kiểm class/assignment trong cùng transaction với việc ghi issuance record; xác định rõ role được phát hành (ít nhất không mặc định mọi `phuta`).
- Public verify phải lookup exact issuance record `(parishId, certId, studentId, academicYear, digest/status)` và từ chối revoked/nonexistent record.
- Thêm route-level matrix tests cho assigned/unassigned/cross-class/cross-parish/fake-cert/revoked-cert.

### AUTHZ-03 — P1 — Admin bearer có thể tạo admin bền vững mà không re-auth/super-admin gate

**Endpoint và call path**

- `POST /api/users` → `authMiddleware` → `roleMiddleware('admin')` → `createUser()`.
- Schema cho phép body `role: 'admin'`: `server/src/routes/users.ts:28-39`.
- Route không nhận `adminPassword`, không dùng `adminReauthRateLimiter`, không kiểm `getSuperAdminId()`: `server/src/routes/users.ts:95-115`.
- Service tạo login-capable user, trả one-time `tempPassword`, transaction user + audit + assignments: `server/src/services/userService.ts:119-193`.

**Attacker / hành vi không được phép**

- Kẻ chiếm một access token admin còn hạn (15 phút) có thể tạo peer admin và lấy mật khẩu tạm, chuyển session compromise ngắn hạn thành foothold bền vững.
- Cùng bearer đó có thể khóa/vô hiệu hóa user (`PUT /api/users/:id/status`), đổi assignment (`PUT /api/users/:id/assignments`) và force logout (`POST /api/users/:id/force-logout`) mà không biết mật khẩu admin: `server/src/routes/users.ts:117-129,191-223`.

**Policy evidence**

- Repo hiện hành tự ghi nhận family này còn mở dưới A08: `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md:417`; `docs/SECURITY_AUDIT_LOG.md:527-528,610-613`. Audit này không mặc định finding cũ đúng; source hiện tại ở trên xác nhận nó vẫn đúng.

**Remediation bắt buộc**

- Bắt re-auth + rate limit + failed-attempt audit cho create/status/assignment/force-logout.
- Tạo role `admin` phải là super-admin-only hoặc một capability tách riêng; regular admin chỉ được tạo/manage non-admin theo policy được phê duyệt.
- Khi tạo admin, không cho client tự chọn quyền vượt actor; ghi security event rõ ràng và cân nhắc revoke/alert.

### AUTHZ-04 — P2 — Recipient confusion trong smart report-card notification

**Endpoint và call path**

- `POST /api/notifications/smart/report-cards` → router-level `admin|chunhiem` → kiểm `studentId` thuộc một assigned class → `notifyBatchReportCards()` → `notifyReportCard()` → `getParentUserIdsForStudent()`.

**Repository evidence**

- Route xác minh class của `studentId` nhưng giữ nguyên `parentPhone`, `studentName`, score/rank/attendance do caller gửi: `server/src/routes/notifications.ts:255-298`.
- Recipient resolver ưu tiên `parentPhone` caller cung cấp và bỏ qua `studentId`: `server/src/services/smartNotifications.ts:71-80,143-163`.

**Attacker / hành vi không được phép**

- `chunhiem` có một student hợp lệ trong lớp mình có thể ghép student ID đó với số điện thoại của phụ huynh khác trong giáo xứ để gửi phiếu điểm giả đến sai object owner.
- Đây là cross-object action/integrity defect; không cần đọc dữ liệu ngoài scope, nhưng phá vỡ ràng buộc student → parent recipient.

**Remediation**

- Khi có `studentId`, bỏ/không nhận `parentPhone` và các identity fields từ request; đọc canonical student, class, parent và số liệu báo cáo server-side.
- Nếu API cần gửi snapshot caller-provided, bind snapshot digest với student/recipient canonical và từ chối mismatch.

## Verified strengths

- **JWT-to-DB freshness:** mọi protected route qua `authMiddleware` đều lookup `users` theo `(userId, parishId)`, chặn deleted/inactive/locked, role claim stale và tokenVersion mismatch: `server/src/middleware/auth.ts:78-111`.
- **Secrets và algorithm fail-closed:** production bắt buộc access/refresh secret riêng; verify khóa HS256; access TTL 15 phút, refresh TTL 7 ngày: `server/src/middleware/auth.ts:14-33,43-75`.
- **Refresh sessions:** refresh token chỉ lưu SHA-256 hash; rotation dùng conditional atomic claim; reuse đã-observed thu hồi toàn bộ phiên và bump token version: `server/src/services/refreshSessionService.ts:25-45,55-145`.
- **Password transitions atomic:** self change, admin reset, parent reset resolution, lock/inactivate, force logout và account delete kết hợp password/status/tokenVersion/session revocation/audit trong transaction ở các application services tương ứng.
- **Login hardening:** lookup username tenant-scoped; unknown/inactive dùng dummy bcrypt; non-admin lockout counter và audit cùng transaction; login/session/audit/rehash cùng transaction: `server/src/routes/auth.ts:117-231`.
- **Forced password change:** server middleware chỉ allow change-password/profile/me/logout/refresh, không dựa vào modal frontend: `server/src/middleware/auth.ts:102-108`.
- **Parent ownership canonical path:** `/api/parents/my-children` và report-card dùng DB user phone + normalized variants + student parish binding; `CanAccessStudentSpecification` fail-closed cho unknown role: `server/src/services/parentService.ts:24-70`; `server/src/domain/CanAccessStudentSpecification.ts:20-39`.
- **Write-side class/object scope:** grade, attendance, daily entry, exam finalization/override và question-bank exam build nhìn chung re-read target object in-transaction, enforce parish and reject empty `allowedClassIds`.
- **Tenant storage model:** user và nhiều domain identity dùng composite key `(parishId,id)`; user username unique trong parish: `server/src/db/schema.ts:4-27`.
- **Frontend token handling:** access token memory-only, refresh cookie HttpOnly, 401 refresh mutex và session-generation guard chặn stale in-flight response resurrect session: `src/lib/api/core.ts:5-16,68-96,104-157,235-311`.
- **Backup/purge/password reset:** destructive backup restore/export và purge yêu cầu admin password re-auth; public parent-reset ticket trả generic 202 và không tự reset bằng KBA.
- **Sensitive role projections:** parent bị chặn khỏi staff roster; staff directory projection không trả credential fields; audit logs và finance router admin-only.

## Defense-in-depth gaps

### DI-01 — `tokenVersion` là optional và versionless token fail-open

`JwtPayload.tokenVersion?: number`; access/refresh chỉ so sánh khi claim khác `undefined`: `server/src/middleware/auth.ts:35-41,89-100`; `server/src/services/refreshSessionService.ts:69-82`. Issuer hiện tại luôn đặt claim, nên không chứng minh có token production versionless còn sống. Tuy nhiên token legacy/test/internal được ký hợp lệ mà thiếu claim sẽ bỏ qua invalidation. Access token như vậy sống đến TTL; refresh token như vậy có thể rotate nếu session hash tồn tại.

**Khắc phục:** sau một cutoff/migration rõ ràng, bắt claim integer và equality tuyệt đối; đổi type thành required; test password reset/force logout/reuse với claim thiếu.

### DI-02 — Assignment snapshot vẫn nằm ngoài transaction ở nhiều write path

Grade/attendance/daily/exam/import routes thường gọi `getUserClassIds()` trước khi mở transaction rồi truyền mảng IDs vào service. Service re-read student/session in-transaction nên đóng race “student đổi lớp”, nhưng không đóng race “assignment của actor vừa bị thu hồi”. Ví dụ: `server/src/routes/grades.ts:81-93` + `server/src/services/gradeService.ts:111-148`; `server/src/routes/attendance.ts:51-73`.

Đây là TOCTOU window hẹp, chưa được runtime-exploit trong audit. Khắc phục bằng cách truyền actor identity và query assignment trong cùng transaction, không truyền snapshot quyền.

### DI-03 — Super-admin identity không tenant-qualified

Schema cho phép cùng `users.id` ở nhiều parish vì PK là `(parishId,id)`, nhưng `isSuperAdmin(userId)` chỉ so ID toàn cục: `server/src/db/schema.ts:4-27`; `server/src/middleware/auth.ts:128-140`. Nếu một tenant khác có cùng ID với `SUPER_ADMIN_ID`, account đó được lock bypass/protected-target semantics. Không có bằng chứng current production có collision hoặc normal API cho chọn ID, nên đây là conditional structural gap, không phải verified live bypass.

### DI-04 — Identity profile mutation và audit không atomic

`PUT /api/auth/profile` update user trước rồi insert audit bằng hai transaction riêng: `server/src/routes/auth.ts:426-481`. Không tạo RBAC bypass, nhưng crash/audit failure có thể để thay đổi identity thiếu trail.

### DI-05 — Offline revocation không xóa dữ liệu đã có trên thiết bị

Client cho phép xem cache đã sync khi offline và chỉ phát hiện server revocation khi kết nối lại. Queue mutations vẫn phải qua server auth/scope khi push nên không tạo write authority, nhưng force-logout không thể thu hồi dữ liệu cục bộ khỏi một thiết bị đang offline. Đây là trade-off offline rõ ràng; mức rủi ro thực tế phụ thuộc threat model thiết bị và chưa có evidence production.

## Inconsistent policy enforcement

- **Bulk academic reads:** frontend parent không vào `/grades`/`/attendance`, backend lại cho authenticated role đi qua và hiện fail-open. Đây là inconsistency có exploit, đã nâng thành AUTHZ-01.
- **Verification:** report-card read dùng parent ownership/class assignment, nhưng signing chỉ dùng broad staff role + same parish. Đây là inconsistency có exploit, đã nâng thành AUTHZ-02.
- **Privileged admin re-auth:** reset password/delete/phone/provision/backup/purge yêu cầu re-auth; create/status/assignment/force-logout thì không.
- **Smart notifications:** absence/class/report paths cố áp class scope, nhưng Sunday reminder cho mọi `chunhiem` broadcast toàn parish; chưa tìm thấy business rule đủ rõ để gọi đây là defect.
- **Class catalog:** backend cho cả parent đọc `/api/classes`, `/branches`, `/academic-years` (assignment identities được redacted), trong khi frontend `/classes` là admin-only. Parent portal đã có class name qua child projection; mục đích của broad catalog chưa có normative evidence.
- **Logout contract:** refresh endpoint cookie-only, nhưng logout vẫn ưu tiên `body.refreshToken` nếu có: `server/src/routes/auth.ts:366-409`. Do logout còn cần Bearer và revoke hash tenant-scoped, audit không tìm thấy privilege escalation; đây là compatibility path làm policy khó reasoning.
- **Deployment docs:** `docs/DEPLOYMENT_GUIDE.md:56` nói `SUPER_ADMIN_ID` optional/default `USR-001`, trong khi production code throw nếu thiếu: `server/src/middleware/auth.ts:128-135`.

## Intentional policy đã xác minh

- `admin` được miễn failed-password account lockout; các non-admin lock ở 5 lần. Chỉ configured super-admin được miễn trạng thái LOCKED ở login/middleware/refresh.
- `chunhiem` và `phuta` được đọc parish-wide staff roster/student roster/class metadata nhưng write/exam/report scope vẫn theo assignment. Đây là policy được ghi trong architecture hiện hành, không bị report thành horizontal read bypass.
- Parent ownership dựa trên số điện thoại chuẩn hóa, không phải bảng relation riêng.
- Finance và audit logs là admin-only toàn router.
- Anonymous feedback cố ý không lưu sender/audit identity; inbox vẫn target-scoped.
- Question Bank là parish-shared cho staff; edit draft theo creator, lifecycle approve/activate/archive admin-only, build exam kiểm assignment trong transaction.
- Public certificate verification là intentional; defect nằm ở issuance authorization/canonical-record binding.

## Test coverage gaps

- Không có negative test cho parent/unassigned staff `GET /api/grades` và `GET /api/attendance`; security-critical suite chỉ kiểm admin tenant read và parent write denial.
- Không có route-level authorization test cho `/api/verification/sign` hoặc exact issuance record.
- Không có matrix test cho re-auth của create/status/assignment/force-logout vì implementation hiện không yêu cầu nó.
- Nhiều test dùng `generateTokens()` không truyền `tokenVersion`, vô tình hợp thức hóa versionless JWT; ví dụ `server/src/__tests__/security/tenantIsolation.test.ts:22-24`.
- Chưa có deterministic concurrency test “assignment revoked between route check and transaction write”.
- Chưa có parent sync E2E assertion rằng IndexedDB không chứa grade/attendance của trẻ khác.
- Chưa có exhaustive generated contract test buộc mọi route mới khai báo role/scope class; current matrix phần lớn là hand-maintained behavior.
- Chưa có live deployment verification cho cookie flags/CORS/origin/env, legacy session population, backup ACL hay super-admin ID uniqueness.

## Unknown or insufficient evidence

- SHA đang chạy production có trùng snapshot audit hay không.
- Giá trị/độ mạnh/rotation của `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REPORT_HMAC_SECRET`, `OPS_TOKEN`, `SUPER_ADMIN_ID` ở production.
- Có refresh/access token versionless hoặc duplicate logical user ID giữa parishes trong dữ liệu thật hay không.
- Reverse proxy có luôn truyền URL/proto để cookie production nhận `Secure; SameSite=None` hay không.
- Quyền truy cập bucket/local backup và key management ngoài repository.
- Mức chấp nhận business cho `chunhiem` parish-wide Sunday broadcast và parent class catalog.
- Khả năng xóa cache từ xa trên thiết bị offline; hiện không có cơ chế chứng minh.

## Verification đã chạy

- `npm run test:security-critical` → **7 files, 73 tests passed**.
- Nhóm auth/session/ownership mục tiêu (12 files: lockout, middleware, auth atomicity/routes, refresh rotation/race, user lifecycle, super-admin, parent reset, authorization boundaries, reporting ownership) → **12 files, 55 tests passed**.
- Reproduction tạm AUTHZ-01 → **1 file, 2 tests passed**, chứng minh parent nhận grade + attendance của unrelated child; file tạm đã xóa.
- Lần chạy reproduction đầu trong sandbox lỗi `spawn EPERM` tại Vite config; chạy lại ngoài sandbox thành công. Đây là lỗi môi trường child-process Windows, không phải product failure.

Các test hiện hữu xanh không phải verdict “RBAC an toàn”: reproduction đã chứng minh một bypass mà suite 73-test không phát hiện.

## Risk-prioritized remediation roadmap

### P0 — Chặn data exposure ngay

1. Sửa empty-scope semantics cho `getGrades/getAttendance`; thêm staff role gate; ngừng parent bulk pull.
2. Thêm regression unit/integration/E2E cho parent, unassigned staff, assigned/other class, admin và tenant B.
3. Nếu production đã chạy code này, đánh giá incident: API/access logs cho hai endpoint, thời điểm release, parent sessions và dữ liệu cached; chuẩn bị forced client cache purge theo scope nếu cần.

### P1 — Đóng privilege và authenticity boundaries

4. Thay verification signing bằng issuance record canonical + class/capability check + revocation semantics; không ký arbitrary tuple.
5. Re-auth create/status/assignment/force-logout; giới hạn create-admin về super-admin/capability riêng. Sau fix, rotate/revoke admin sessions nếu incident review cho thấy nghi ngờ.
6. Canonicalize smart report-card recipient/data từ DB; không ưu tiên caller `parentPhone`.

### P2 — Loại bỏ stale/race ambiguity

7. Bắt buộc `tokenVersion` trên access và refresh sau migration cutoff; test legacy rejection.
8. Chuyển assignment lookup vào transaction cho grade/attendance/daily/exam/import/promotion/student mutations.
9. Tenant-qualify super-admin identity, ví dụ `(SUPER_ADMIN_PARISH_ID, SUPER_ADMIN_ID)`, và thêm collision test.
10. Gộp profile update + audit transaction; đồng bộ logout cookie-only contract.

### P3 — Governance và coverage

11. Chốt policy cho parent class catalog, Sunday broadcast và role-capability mapping; cập nhật SSOT sau khi quyết định, không dùng docs để hợp thức hóa code trước quyết định.
12. Sinh route authorization contract test từ matrix để route mới thiếu explicit policy bị fail CI.
13. Thêm production qualification riêng cho env/cookie/CORS/backup/offline-device behavior; không suy diễn từ unit tests.

## Handoff

Audit này chỉ tạo report và canvas; không sửa product code hoặc test suite. Thứ tự an toàn để triển khai là AUTHZ-01 trước, sau đó AUTHZ-02/AUTHZ-03, rồi AUTHZ-04 và các defense-in-depth gaps. Sau mỗi bước cần chạy focused tests; chỉ chạy lại full security/broad suite khi boundary liên quan đã thay đổi.
