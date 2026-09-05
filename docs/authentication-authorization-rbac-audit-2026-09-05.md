# Authentication, Authorization & RBAC audit — Catevia/TNTTVN

Ngày: 2026-09-05. HEAD: `09ee9ff263838b062d84657277bd6d230eba99c5`.

> **Remediation follow-up:** đã sửa product code trong working tree sau snapshot trên; xem §13 và trạng thái mới nhất ở §15. §14 là nghiên cứu trước implementation H3/H7/H8. Sections 1–12, CSV matrix, hashes và opt-in probes giữ evidence **trước sửa**; không phải mô tả trạng thái mới. Chưa triển khai production.

Đây là audit độc lập của **current implementation**, không phải xác nhận hoàn tất remediation của bản 2026-09-04. Không sửa product code, không truy cập DB/secret production, không gửi Telegram/push thật. Các mã D1–D11 bên dưới thuộc **audit auth này**, không phải D1–D7 của architecture audit.

## 1. Kết luận điều hành

**Chưa đạt fail-closed, tenant-safe và object/class-scope-safe trên mọi entry path.** Middleware có nhiều kiểm soát đúng, nhưng authority bị mất ở một số query cuối, alternate workflow và chuyển trạng thái phiên.

Ưu tiên xử lý:

1. **P0 — D9:** parent không có assignment đọc được điểm/chuyên cần của trẻ khác trong giáo xứ. `[]` bị biến thành không giới hạn; nhánh delta cũng có thể làm scope của GLV thành rỗng rồi mở rộng ra toàn giáo xứ.
2. **P1 — D1:** ghi grade đã tồn tại có thể cập nhật cả giáo xứ khác nếu cùng logical ID/version, dù mọi kiểm tra trước đó đúng tenant/lớp.
3. **P1 — D5:** một yêu cầu đổi mật khẩu đã kiểm tra password có thể chạy sau thao tác khóa tài khoản, tự đặt lại ACTIVE và phát access token mới hợp lệ.
4. **P1 — D2:** duyệt đơn nghỉ ghi attendance qua đường không kiểm semester lock và dùng lớp lưu trên đơn thay cho lớp hiện hành của học sinh.
5. **P1 — D10:** server ký tuple certificate/year do staff khai báo, rồi public verifier khẳng định phiếu điểm chính hãng dù không có issuance record hay digest nội dung tương ứng.

D3/D4/D6/D7/D8/D11 là các lỗi P2 cụ thể về người nhận, trạng thái bắt buộc đổi mật khẩu, composite identity, import read-model và enumeration. Không có bằng chứng trong audit này rằng attacker chưa xác thực có thể tự ký JWT, tự đổi role lên admin hoặc tự chọn tenant bất kỳ để đọc dữ liệu bảo vệ. Điều đó **không** phủ nhận các bypass đã tái hiện.

## 2. Snapshot, phương pháp và giới hạn bằng chứng

- Inventory từ composition root và registrations: **31 router modules, 186 method/path registrations**. Không đếm middleware `use`, CORS OPTIONS tự sinh hay endpoint của Telegram thành HTTP route.
- [Ma trận 186 endpoint](authentication-authorization-rbac-matrix-2026-09-05.csv) ghi bốn role, action, resource, tenant boundary, class/object ownership, public/capability access, source line và ngoại lệ. Đây là reconstruction của hành vi, **không phải** policy đề xuất hoặc 186 endpoint đã được chạy đủ mọi tổ hợp.
- [Snapshot và SHA-256 router sources](authentication-authorization-rbac-snapshot-2026-09-05.json); [inventory script](../scripts/audits/auth-rbac-inventory-2026-09-05.mjs) chỉ đọc, xuất JSON ra stdout. Các annotation scope là diễn giải đã đối chiếu source, không phải static analyzer có thể tự chứng minh an toàn.
- Worktree không sạch trước audit: architecture follow-up, Sunday reminder, schema readiness, restore CLI, docs và mobile UI đang có thay đổi. Không ghi đè các thay đổi đó. Auth middleware/routes và các query gây D1–D11 không có local product edits; thay đổi local `smartNotifications.ts` chỉ đổi return value của Sunday reminder, không đổi nhánh recipient/report-card được tái hiện.
- Truy vết HTTP → auth → role → class/parent/tenant → service/specification → query/write; kiểm cả import, batch, override/restore, leave review, barcode, report signing, backup, refresh, Telegram và client sync.
- Dùng Decision Matrix theo AGENTS vì chạm invariant D3: phân biệt lab/runtime evidence với production, không lấy tỷ lệ test pass làm error budget cho tenant/privacy invariant.
- Sau khi dựng các đường đi độc lập mới đối chiếu bản audit cũ. Những nội dung cũ không được tự động coi là đúng/đã sửa.
- Evidence runtime là Hono router requests + SQLite tạm với schema/migrations thật. Một số pending-request fixtures được arrange trực tiếp; đây là kiểm consumer authorization, không phải chứng minh toàn bộ UI nộp đơn. D5 dùng deterministic barrier ngay trước DB transaction, không dùng sleep để đoán race.
- Không thử exploit production, không chạy thiết bị thật hay browser E2E. Không kiểm chứng secret deployment, proxy đang chạy, dữ liệu collision thực tế hoặc thông báo đã giao tới thiết bị.

### Challenge pass sau bản đầu

Một lượt tìm cách **bác bỏ** từng finding và quét lại JOIN/mutation theo composite identity giữ nguyên D1–D10, nhưng làm rõ thêm ba điểm:

- Phát hiện mới **D11** ở import duplicate preview: student base query đúng tenant nhưng JOIN class chỉ theo `classId`, nên cùng ID giữa hai parish có thể ghép class name của tenant khác vào response.
- Không nâng refresh-session CAS thiếu `parishId` thành defect: token được lookup bằng `(tokenHash, parishId)` và session ID dùng `randomUUID()` đầy đủ. Predicate tenant vẫn nên explicit, nhưng audit chưa chứng minh consequence thực tế tương đương D1.
- H4 vẫn là defense-in-depth: current user/create/update APIs chặn parent assignment; schema không chặn và một số exam handlers không tự role-check. Hai class-assignment APIs lại cho phép `admin` dù comment/ADR-026 trong user path nói chỉ GLV, nhưng admin vốn đã có exam authority nên chưa chứng minh privilege escalation; đây là implementation/documentation inconsistency cần dọn, không phải thêm một bypass giả.

### Quy ước đọc matrix

Các ô role giả định bearer hợp lệ và tài khoản hiện hành được phép hoạt động. `DENY_ROLE` là cấm theo role; `TENANT` **không** có nghĩa cross-tenant; `ASSIGNED_CLASS`/`CURRENT_STUDENT_CLASS` cần scope hiện hành; `SELF` là tài khoản JWT; `CURRENT_PHONE_CHILD` là ownership DB qua phone chuẩn hóa. Các ô chứa `D9` là **hành vi sai đang quan sát**, không phải quyền được duyệt. `CONSTANT_ZERO` là response không cung cấp pending data, không phải được xem staff inbox.

Để ra verdict cần kết hợp ô role với trạng thái tài khoản, tenant, object và lifecycle; biết role đơn thuần là chưa đủ.

## 3. Authentication và state/authority matrix thực tế

### A. Token và account state

- Không bearer, chữ ký sai, hết hạn, `alg=none`/khác HS256: endpoint bảo vệ từ chối. JWT được đối chiếu user bằng `(userId, parishId)` mỗi request; user đã xóa/INACTIVE hoặc role khác claim bị từ chối. Evidence: [auth.ts:79](../server/src/middleware/auth.ts#L79).
- `tokenVersion` có mặt và lệch DB: từ chối. **Không có version: bỏ kiểm tra này**, H2. Các issuer runtime hiện hành truyền version; không được suy từ token helper của test rằng production đang có versionless token.
- LOCKED: từ chối, **trừ** `userId === SUPER_ADMIN_ID`; không kiểm tenant/role của exemption, D6.
- FORCE_PASSWORD_CHANGE: middleware dùng `path.endsWith(...)`, không route identity/method. Chỉ một phần hệ thống bị khóa đúng, D4.
- Đổi password/reset/force-logout: các service đã gom thay đổi version và revoke refresh trong transaction. Tuy nhiên atomic commit không tự bảo vệ precondition đọc trước transaction; D5 chứng minh khác biệt này.
- Logout thường chỉ thu hồi refresh session được chọn, không làm mọi access token cùng tài khoản mất hiệu lực ngay. TTL access 15 phút là intentional bounded residual; force-logout/admin lock là cơ chế khác.

### B. Refresh và transport

`POST /api/auth/login` → username+parish lookup → bcrypt → issue session. Access TTL 15m, refresh TTL 7d; JTI ngẫu nhiên, refresh DB chỉ lưu hash. Production thiếu access/refresh secret thì module từ chối khởi tạo, không dùng dev default. Evidence: [middleware/auth.ts:20](../server/src/middleware/auth.ts#L20), [refreshSessionService.ts:29](../server/src/services/refreshSessionService.ts#L29).

`POST /api/auth/refresh` chỉ đọc cookie; cookie HttpOnly, Secure/SameSite theo môi trường HTTPS; Origin khác allowlist bị chặn. Missing Origin được phép cho non-browser caller; đây không phải quyền giả mạo refresh token. Refresh token cũ được claim bằng CAS `revokedAt IS NULL`. Sequential reuse và concurrent loser có policy khác nhau: reuse đã thấy revoked làm revoke-all/bump; loser của cùng race bị reject nhưng không giết phiên thắng. Evidence: [routes/auth.ts:35](../server/src/routes/auth.ts#L35), [routes/auth.ts:366](../server/src/routes/auth.ts#L366), [refreshSessionService.ts:64](../server/src/services/refreshSessionService.ts#L64).

`POST /api/auth/logout` vẫn nhận body refreshToken legacy trước cookie, nhưng yêu cầu bearer và thu hồi theo tenant/hash; không tìm được cross-tenant escalation từ compatibility path này. Cookie/CORS đúng ở test không chứng minh reverse proxy production đã truyền đúng scheme/header.

### C. Resource/ownership policy tổng hợp

- **Student roster:** admin/CN/PT đọc parish-wide là policy chủ ý, không phải lộ ngoài lớp. Ghi student phải qua assigned-class scope; parent bị chặn staff roster và dùng `/parents/my-children`. Class catalog rộng hơn quyền sửa; nonadmin không nhận teacher assignment của lớp khác. Evidence: [students.ts:47](../server/src/routes/students.ts#L47), [classes.ts:27](../server/src/routes/classes.ts#L27), BUSINESS_RULES §11.
- **Grades/attendance/daily:** admin tenant-wide; CN ghi aggregate grade/override, CN/PT ghi attendance/manual daily. Generic reads dựa assignment thay vì parent relation; **grade/attendance empty-list bị fail-open D9**. Domain override có kiểm role/assignment trong transaction; không được đánh đồng với upsert D1.
- **Exams:** create/result/delete/manifest cho admin/CN/PT trong class của session; complete chỉ admin/CN; reopen chỉ admin. Session tenant + child belongs-to-session-class + lifecycle/lock/manifest là các điều kiện độc lập. PATCH answer-key/variants và một số read/barcode dùng auth+assignment, thiếu role gate trực tiếp: H4, không phải chứng minh parent bình thường sửa exam.
- **Reports/promotion:** report-card parent theo con hiện hành; CN/PT theo class. Class summary admin/CN; approve promotion admin/CN và có source/target-class restrictions. Sign verification là alternate authority yếu hơn đọc report, D10.
- **Leave:** parent tạo/xem theo child phone, hủy theo creator `request.parentId` khi pending; staff review/cancel dùng assignment với `request.classId`. Parent không review; admin toàn tenant. Khác biệt current student vs historical request là D2, không được ghi matrix thành current-class-safe.
- **User management:** admin tạo/status/assignments/force-logout; reset/delete/phone/provision cần thêm password reauth. Directory chỉ staff DTO giảm dữ liệu; parent không vào user management. Superadmin target exemption có D6; admin creation không step-up là H1.
- **Finance/audit/backup/purge:** finance và audit logs admin-only ở router; finance kiểm fund/class/student tenant và quan hệ trong transaction. Backup reauth, checksum/source tenant, force row parish và composite upsert; purge password + confirm key, tenant scope. Không có route restore users/refresh sessions từ backup nghiệp vụ.
- **Question Bank:** staff dùng bank chung toàn parish; revise own draft hoặc admin; submit ownership, approve/activate/archive admin; build exam kiểm assignment cùng transaction. Không coi đọc shared question bank/answer content là leak ngoài lớp chỉ vì exam có class scope.
- **Notices/events/profile:** notices/events admin/CN quản lý toàn parish, không creator-only; parent notice audience được lọc. Profile/archive chỉ staff, admin mutation, nonadmin STAFF visibility và published records; download recheck tenant/visibility. FORCE_PASSWORD_CHANGE profile mutation vẫn có D4.
- **Import:** validate/import admin/CN; CN bị giới hạn lớp được giao, history/detail còn kiểm owner. Student base predicates đúng tenant/class, nhưng duplicate preview JOIN class thiếu composite tenant condition, D11.
- **Feedback:** CN/PT/parent gửi; admin/CN inbox theo recipient; parent chỉ nhắm homeroom CN của con hoặc parish board. Anonymous không lưu sender/audit identity là privacy contract, không phải thiếu logging cần “sửa”.
- **Parent recovery:** public ticket chỉ generic 202; admin same tenant + password reauth + pending CAS mới reset. UI checkbox xác nhận xác minh là bước người vận hành, không bằng chứng sở hữu phone và không nằm trong API schema; xem U4.
- **Notifications:** self subscription/register/unregister; admin `/send`; admin/CN smart paths. Absence/class-reminder kiểm class, report-card authorize một object nhưng lấy recipient từ phone khác, D3. Manual Sunday broadcast CN parish-wide chưa có policy đủ rõ để coi là defect.

Public paths có chủ đích: login bằng credentials, refresh bằng cookie capability, public recovery ticket không reset, retired KBA trả 410, `/verification/verify` cần HMAC capability, CSP report ingest, `/health` tối thiểu. `/ready` và `/metrics` cần OPS token. Worker/Telegram không đi qua bearer middleware và phải được đánh giá bằng authority riêng, không được coi “không có HTTP route” là ngoài scope.

## 4. Verified Defects

### D9 — P0 — Empty class/student scope mở grade/attendance reads ra toàn giáo xứ

**Path:** `GET /api/grades` hoặc `/api/attendance` → auth → `getUserClassIds(user, parish)` → `getStudentsByClassIds(..., updatedAfter)` → `getGrades/getAttendance(..., studentIds)`.

**Evidence:** [grades route:64](../server/src/routes/grades.ts#L64), [attendance route:26](../server/src/routes/attendance.ts#L26), [gradeService.ts:39](../server/src/services/gradeService.ts#L39), [attendanceService.ts:12](../server/src/services/attendanceService.ts#L12). Điều kiện chỉ thêm `IN` khi `studentIds && studentIds.length > 0`. `[]` đúng ở upstream trở thành unrestricted ở query cuối. Tenant predicate vẫn có; đây là cross-object/class leak **trong** parish, không phải cross-parish read.

**Tái hiện:** parent1 không assignment/không liên hệ child2 gọi hai endpoint, nhận comment điểm và note chuyên cần của child2. Không cần sửa JWT hay biết mật khẩu admin. Grade vẫn có nonadmin open-semester filter; filter đó không thay thế ownership.

**Nhánh rộng hơn:** ngay cả GLV có assignment, nếu incremental `updatedAfter` không trả học sinh đã thay đổi thì danh sách scope rỗng. Attendance mới của lớp khác vẫn có thể đi qua. Không dùng “danh sách object thay đổi từ cursor” làm danh sách object được phép truy cập.

**Client amplification:** [useSyncEngine.ts:10](../src/hooks/useSyncEngine.ts#L10) chạy theo isAuthenticated → [syncCoordinator.ts:399](../src/lib/syncCoordinator.ts#L399) → Promise.allSettled gọi cả grades/attendance tại 447–448 cho mọi role → stores pull/persist Dexie. Việc parent `/students` bị 403 không hủy các request khác đã chạy và không rollback cache của chúng. Đây là source-verified path; chưa chạy browser E2E chứng minh dữ liệu trên thiết bị thật.

**Fix root cause:** phân biệt unrestricted explicit với empty deny-all ở service, scope query độc lập cursor, parent generic endpoint fail-closed hoặc projection riêng theo child. Hiding UI/skip parent sync chỉ là bổ trợ. Recovery phải xử lý cache có thể đã nhận PII sai; deploy server fix không tự xóa bản sao offline.

### D1 — P1 — Grade UPDATE mất tenant predicate sau authorization đúng

**Path:** `POST /api/grades` và batch → role admin/CN → allowedClassIds → `upsertGrade` transaction → tenant student/year/lock/existing-grade reads → UPDATE.

**Evidence:** [grades.ts:81](../server/src/routes/grades.ts#L81), [gradeService.ts:111](../server/src/services/gradeService.ts#L111), **[gradeService.ts:284](../server/src/services/gradeService.ts#L284)**: UPDATE chỉ `grades.id = existing.id AND grades.version = expectedVersion`. `rowsAffected > 1` vẫn success. Schema [schema.ts:128](../server/src/db/schema.ts#L128) có PK `(parishId,id)`; cùng ID giữa tenants là dữ liệu hợp lệ.

**Tái hiện:** teacher A chỉ có class1 ở A sửa grade A từ 2 → 9; grade B có cùng ID/version cũng thành 9/version2; response 200. Audit entry chỉ ghi tenant A. Không cần quyền đối với B trong request ghi.

**Điều kiện/giới hạn:** cần collision ID và expectedVersion trùng tại thời điểm UPDATE; không nói mọi write đều cross-tenant hay production đã có collision. Không coi random ID là tenant boundary. Backup restore hiện chủ ý cho tenant-local IDs: [backup.ts:107](../server/src/routes/backup.ts#L107); không còn global-ID guard. Probe arrange collision trực tiếp, chưa chạy chuỗi attacker restore → write end-to-end.

**Fix:** final predicate `(parishId,id,version)`, expected one-row semantics và audit các writer/join khác theo composite identity. Regression phải dùng **cùng ID** ở hai tenants, không chỉ distinct IDs như nhiều tenant tests hiện có.

### D5 — P1 — Password-change đã verify có thể vượt thao tác khóa/revoke chạy xen giữa

**Path:** `POST /api/auth/change-password` → middleware DB-check → load user → bcrypt current password/new password → bcrypt hash → transaction UPDATE → revoke sessions → issue phiên mới.

**Evidence:** [auth route:234](../server/src/routes/auth.ts#L234). Password/status/version snapshot nằm trước các await bcrypt; UPDATE tại 259 chỉ ràng `(userId,parishId)`, đặt `status=ACTIVE` và `tokenVersion=current+1`, không CAS verified hash/version/status. Admin lock tại [userService.ts:195](../server/src/services/userService.ts#L195) đã tăng version và revoke đúng nhưng có thể bị command cũ chạy sau.

**Tái hiện deterministic:** request của racing account đã verify; ngay trước transaction, barrier chạy `updateUserStatus(LOCKED)` thật. Sau đó change-password trả 200, DB ACTIVE/version3, access token mới gọi `/auth/me` 200. Không phải chỉ một request đang bay hoàn tất sau revoke: attacker có **phiên mới hợp lệ sau thao tác khóa**.

**Fix:** commit password change chỉ khi verified credential/version và trạng thái vẫn khớp; reject stale operation, không tự ACTIVE account vừa bị admin khóa/inactivate. Kiểm cả reset/force-logout và legacy login rehash/reuse-version writes cùng họ precondition; không tuyên bố các sibling race đã tái hiện khi chưa có test.

### D2 — P1 — Leave review là alternate attendance writer vượt lock và current-class ownership

**Path:** `PATCH /api/leave-requests/:id/review` → auth, chặn parent → tenant request → transaction check assignment theo **request.classId** → pending CAS → direct attendance insert/update.

**Evidence:** [leaveRequests.ts:247](../server/src/routes/leaveRequests.ts#L247), assignment tại 295, attendance tại 334. So với canonical [AttendanceApplicationService.ts:42](../server/src/services/AttendanceApplicationService.ts#L42) đọc active student/current class và semester lock trong transaction.

**Hai tái hiện:**

- Ngày nằm trong semester1 đã khóa: canonical POST attendance 403; review đơn APPROVED 200 và DB có AbsentExcused.
- Đơn tạo khi học sinh ở class1, sau đó chuyển sang class2: teacher chỉ còn authority class1 gọi canonical attendance 403, nhưng review theo lớp cũ 200 và tạo attendance cho học sinh class2.

BUSINESS_RULES §17.2 quy định GLV không duyệt học sinh ngoài lớp được giao; protected locked-state invariant cũng áp dụng alternate writers. Pending CAS/atomic review hiện có là cải thiện thật, **không** đóng hai precondition này. Existing-attendance update còn không tăng version, làm OCC khó phát hiện chỉnh sửa; đây là consequence cùng writer, chưa có probe OCC riêng.

**Fix:** review transaction resolve student hiện hành/active, actor scope và lock cho ngày request trước mọi write; dùng chung policy/writer primitives với attendance mà không tạo nested transaction. Giữ request history.classId nếu cần, không dùng nó làm current authority. Chốt rõ nghiệp vụ duyệt đơn tương lai; không áp máy móc “cấm mọi future leave” từ endpoint điểm danh trực tiếp.

### D10 — P1 — Verification attests quá mức authority của tuple được ký

**Path:** `POST /api/verification/sign` → staff role + student tồn tại cùng tenant → `signReportPayload(parish,student,year,cert)`; public `GET /api/verification/verify` → HMAC check → student lookup → `verified:true`, thông báo phiếu điểm chính hãng.

**Evidence:** [verification.ts:19](../server/src/routes/verification.ts#L19), [verification.ts:76](../server/src/routes/verification.ts#L76). Không resolve report/certificate issuance, finalized state, server-owned cert ID hay digest score/content. HMAC cryptography đúng không thể khắc phục payload không đại diện cho tài liệu được tuyên bố xác thực.

**Tái hiện:** teacher không phụ trách child2 xin ký `not-a-real-year`/`not-an-issued-certificate` thành công; public verifier trả verified true cùng tên child2. Không bypass thuật toán ký. Read report-card của cùng child cần class/parent ownership nhưng signing chỉ cần staff parish.

**Nuance:** staff parish-wide roster read và public verification riêng lẻ là intentional. Nếu yêu cầu sản phẩm thực sự chỉ là “staff đã ký một tuple identity”, cần thu hẹp wording/contract và quyết định ai có quyền công khai tên. Với claim hiện tại “phiếu điểm chính hãng/chỉnh sửa sẽ bị phát hiện”, implementation không chứng minh được điều đó.

**Fix incremental:** chọn contract trước: giới hạn thành xác thực tuple identity, hoặc gắn signer vào immutable server-issued report/certificate snapshot + digest/status và class permission. Chỉ thêm issuance record khi thật sự giữ tính năng attestation tài liệu; không đề xuất subsystem PKI mới. QR UI hiện không đọc hoặc truyền `parishId` ở [VerificationPage.ts:22](../src/pages/VerificationPage.tsx#L22), trong khi API bắt buộc tham số này; vì vậy browser flow hiện nhận 400 trước khi có thể hiện success. Repro D10 gọi public API trực tiếp với đủ tuple. Đây là companion contract/coverage gap cần sửa cùng workflow, không biện hộ cho API authority sai.

### D3 — P2 — Smart report-card authorize student A nhưng enqueue parent B

**Path:** `POST /api/notifications/smart/report-cards` → admin/CN gate → assigned-class check của studentId/classId → `notifyBatchReportCards` → `getParentUserIdsForStudent` ưu tiên **caller parentPhone** trước studentId → queue.

**Evidence:** [notifications.ts:255](../server/src/routes/notifications.ts#L255), [smartNotifications.ts:78](../server/src/services/smartNotifications.ts#L78), [smartNotifications.ts:161](../server/src/services/smartNotifications.ts#L161). Tenant recipient query vẫn có; đây là same-tenant confused recipient, không arbitrary external phone broadcast.

**Tái hiện:** teacher class1 gửi authorized child1 và phone của parent2/class2; response 200, real resolver enqueue webpush target parent2 và không target parent1. Chỉ mock enqueue để không gửi thật; không mock auth hay recipient resolution.

**Impact:** gửi nội dung phiếu điểm/PII cho phụ huynh không sở hữu trẻ, hoặc dùng kênh chính thức gửi nội dung giả tới người ngoài scope lớp. Nội dung score/name còn caller-controlled; không tuyên bố route tự đọc và làm lộ report DB của class2.

**Fix:** authorize canonical student, resolve phone/parent từ cùng student server-side; className/name chỉ display, không identity. Nếu vẫn hỗ trợ preview dữ liệu client thì recipient không được caller override. No-recipient global fallback tách ở H5.

### D4 — P2 — FORCE_PASSWORD_CHANGE allowlist dựa suffix cho phép mutation khác resource

**Evidence/path:** [middleware/auth.ts:106](../server/src/middleware/auth.ts#L106) dùng `endsWith('/profile')`; `PUT /api/parish-profile/profile` → middleware pass → admin role → [parishProfile.ts:176](../server/src/routes/parishProfile.ts#L176) update parish profile.

**Tái hiện:** forced admin gọi GET grades bị 403, nhưng PUT parish profile trả 200 trước đổi mật khẩu. Đây là bypass account lifecycle, không nâng role từ parent thành admin. Middleware còn allow `/admin-change-password` trong forced state; sensitive action này không giống self-change và cần policy rõ.

**Fix:** explicit method+canonical route allowlist/self-service grouping, không suffix. Test full mount path để không nhầm auth profile với parish profile. BUSINESS_RULES §10.2 là normative reference cho limited forced-state access.

### D6 — P2 conditional — Superadmin exemption dùng userId không tenant/role qualified

**Evidence:** [middleware/auth.ts:96](../server/src/middleware/auth.ts#L96), [middleware/auth.ts:129](../server/src/middleware/auth.ts#L129), login [auth.ts:134](../server/src/routes/auth.ts#L134), refresh [refreshSessionService.ts:64](../server/src/services/refreshSessionService.ts#L64); user management protects target bằng ID ở [userService.ts:203](../server/src/services/userService.ts#L203).

**Tái hiện:** một parent LOCKED ở B có id trùng configured SUPER_ADMIN_ID được `/auth/me` 200; ordinary locked parent ở B nhận 401. Tenant+role của token và DB vẫn khớp parent B: không có giả role, không cấp admin API.

**Impact/điều kiện:** wrong principal nhận locked-state exemption và protected-target semantics. Cần ID collision; chưa có evidence collision production, normal createUser không cho client chọn ID. Không gọi đây là đã chiếm superadmin production.

**Fix:** protected principal là `(parishId,userId)` kèm expected admin role, nhất quán login/middleware/refresh/admin-target checks; migration/config validation fail-closed. Không cấm toàn bộ tenant-local IDs để né lỗi identity của một privileged principal.

### D7 — P2 conditional — Telegram status JOIN users chỉ theo ID làm lộ tên khác tenant

**Path:** bot `/status` → `getTelegramLinkForChat(chatId)` → telegram link ACTIVE → `users.id = telegramLinks.userId` → reply fullName.

**Evidence:** [telegram.ts:86](../server/src/services/telegram.ts#L86), [telegramLinkService.ts:160](../server/src/services/telegramLinkService.ts#L160). JOIN thiếu parish; LIMIT 1 không làm kết quả tenant-safe.

**Tái hiện:** A/B có cùng user ID nhưng tên khác, chat chỉ liên kết B; function trả `parishId=B` kèm fullName của A. Đây là service/SQL repro, không gửi tin Telegram thật. Việc row nào được chọn phụ thuộc dữ liệu/query order; không cần khẳng định mọi collision đều trả A mới xác nhận thiếu isolation.

**Sibling source evidence:** active-chat ownership ở 109 chỉ so userId; consume/update theo token/link id có predicate đơn. Chưa tái hiện exploit từng sibling, không cộng thành nhiều defects độc lập. Rebinding active chat vẫn cần link token và control chat, không đồng nghĩa remote takeover không credentials.

**Fix:** composite join/predicates và principal equality nhất quán. Audit bot authority private/group/from identity riêng ở H6.

### D8 — P2 — Login enumeration qua response body/status dù có dummy bcrypt

**Path/evidence:** [auth.ts:117](../server/src/routes/auth.ts#L117): nonexistent/deleted/inactive → generic credentials error; existing active nonadmin wrong-password → “Lần thử: n/5”; locked → 403 ACCOUNT_LOCKED trước password comparison.

**Tái hiện:** cùng parish/password sai, parent1 và username không tồn tại cùng 401 nhưng message phân biệt chắc chắn. Không cần timing inference. Dummy work không khắc phục explicit disclosure.

**Impact:** unauthenticated actor dò tài khoản/parent phone usernames, kết hợp policy 5 lần sai để gây khóa tài khoản đã biết. Không coi policy lockout tự nó là defect mới; đó là approved trade-off có availability consequence. Limiter hạn chế tốc độ, không xóa oracle.

**Fix:** public error/status thống nhất theo phạm vi sản phẩm chấp nhận; giữ reason/counter ở audit/telemetry được bảo vệ. Không bỏ rate limit/lockout chỉ để đồng nhất message.

### D11 — P2 conditional — Import duplicate preview ghép class name từ tenant khác

**Path:** `POST /api/students/validate` → admin/CN role gate → assigned-class list → `validateImport` → `detectDuplicates` → student query tenant/class-scoped → `LEFT JOIN classes` → `duplicateOf.currentClassName` trong response.

**Evidence:** route [import.ts:30](../server/src/routes/import.ts#L30); sáu query/fallback ở [importService.ts:547](../server/src/services/importService.ts#L547) đều có `students.parishId = parishId`, nhưng JOIN tại 570/588/619/638/665/683 chỉ dùng `students.classId = classes.id`. Schema dùng composite class identity `(parishId,id)`, nên class ID không global-unique.

**Tái hiện:** class `class1` tồn tại ở A và B; CN A chỉ được gán class1 A. Khi validate một dòng khớp child A, response 200 chứa `duplicateOf.currentClassName = "Synthetic parish B private class name"`. Student PII vẫn đến từ A; finding này chứng minh cross-tenant **class metadata** và read-model corruption, không tuyên bố đọc student B. Điều kiện là same class ID và một duplicate candidate trong tenant gọi; incidence production chưa biết.

**Impact:** lộ tên lớp tenant khác và có thể làm duplicate resolution/decision UI dùng class sai. Đây cùng root cause composite join với D7 nhưng entry path, resource và caller khác nên cần regression riêng.

**Fix:** mọi JOIN student→class dùng `(parishId,classId)`; key `existingMap` theo composite identity hoặc tenant-local result đã được chứng minh; regression dùng cùng class ID khác parish và assert không có foreign class name.

## 5. Verified Strengths — phạm vi được chứng minh, không blanket approval

**S1 — DB-backed identity gate:** bearer không đủ nếu user deleted/inactive/role stale/version stale. HS256 explicit, production secrets bắt buộc, JTI/session hash; auth and cookie regression pass. Ngoại lệ D4/D5/D6/H2 vẫn áp dụng.

**S2 — Parent portal ownership thật ở server:** [parentService.ts:28](../server/src/services/parentService.ts#L28) đọc user phone hiện hành, variants, child cùng parish/chưa xóa, class join composite. Report-card specification dùng actor/child authority, không tin childId/client route. Parent self-edit phone bị chặn ở [auth.ts:426](../server/src/routes/auth.ts#L426). Strength của portal **không bù** generic reads D9.

**S3 — Credential reset transactional và reauthenticated:** [passwordResetRequests.ts:48](../server/src/routes/passwordResetRequests.ts#L48), [passwordResetRequestService.ts:146](../server/src/services/passwordResetRequestService.ts#L146): admin tenant + password + pending CAS + version/revoke/audit cùng tx. Public ticket không self-reset; retired KBA/reveal 410. Không coi checkbox UI là server proof of identity.

**S4 — Positive object boundaries ở nhiều critical commands:** GradeApplicationService override/restore reload role/class trong tx ([GradeApplicationService.ts:73](../server/src/services/GradeApplicationService.ts#L73)); report context bound tx ([ReportingApplicationService.ts:44](../server/src/services/ReportingApplicationService.ts#L44)); FinanceApplicationService checks references ([FinanceApplicationService.ts:80](../server/src/services/FinanceApplicationService.ts#L80)); Question Bank build check assignment trong tx ([questionBankService.ts:484](../server/src/services/questionBankService.ts#L484)). Không suy rộng strength này sang upsert grade hoặc leave review.

**S5 — Admin-only infrastructure/data tools không dựa UI:** finance/audit router gates; backup reauth/body credential/checksum/tenant-forced restore; purge password+confirmation; operations health endpoints cần OPS token. Targeted backup/tenant tests pass. Scope này không attest operational ACL bucket hay remote CLI production.

**S6 — Data minimization và recipient-specific operations đã có:** GLV directory/assignment redaction, parent notice audience/tombstone filtering, profile asset visibility, feedback recipient/anonymous contract, unsubscribe/native unregister tenant+user scoped. D3/D7/D11 là exceptions thực sự, không lý do bỏ các controls đúng.

**S7 — Client không sở hữu write authority:** [api/core.ts:11](../src/lib/api/core.ts#L11) giữ access token memory-only, refresh HttpOnly cookie; auth-session generation từ chối late response sau account switch; scoped stores/queue không tự cấp server permission. [authStore.ts:230](../src/stores/authStore.ts#L230) set tenant:user trước đọc snapshot; encryption offline dùng nonextractable CryptoKey. Storage namespace/AAD không phải per-tenant crypto key độc lập và không chống JavaScript cùng origin bị compromise. Client tests 6 files/50 assertions pass; không chứng minh offline remote wipe.

## 6. Defense-in-Depth Gaps

**H1 — P1 hardening, không gọi là role bypass: admin bearer → durable admin creation.** `POST /api/users` schema nhận role admin; [users.ts:95](../server/src/routes/users.ts#L95) không reauth; [userService.ts:124](../server/src/services/userService.ts#L124) tạo account với temp password trả một lần. Attacker đã có bearer admin có thể giữ quyền bằng account mới sau token gốc hết hạn. Đây là concrete expansion của stolen-session impact; chưa có normative requirement “chỉ superadmin được tạo admin”, nên không mặc định đó là verified escalation từ role thấp. Đề nghị step-up riêng lúc tạo admin, cân nhắc các thao tác mở khóa/assignment; không tự thu hẹp quyền admin hợp lệ bằng requirement mới.

**H2 — Versionless JWT/claim schema:** optional tokenVersion bỏ revocation epoch check ở access và refresh. Runtime issuer truyền version; tests/helper có thể omit. Require explicit claim shape/type/version và tách access/refresh token kind là hardening có target cụ thể; chưa chứng minh current production có legacy token hợp lệ để khai thác. Refresh/access secrets bắt buộc có không có nghĩa code kiểm chúng khác nhau hay đủ entropy.

**H3 — Assignment snapshots ngoài tx:** nhiều route lấy `getUserClassIds` trước service transaction (grades:91, attendance:59, daily:59, exams:271). Kiểm student.classId trong tx đóng transfer race nhưng không đóng assignment-revocation race sau khi list được chụp. D5 đã chứng minh auth-state stale write riêng; assignment interleaving chưa có runtime repro, không giả vờ remediation “đưa check vào tx” đã giải quyết tất cả.

**H4 — Một số academic reads/answer mutation thiếu explicit staff role:** `GET /class/:classId`, `GET /:id[/results]`, `PATCH /:id/answer-key|answer-variants` và barcode decode chỉ dùng auth + assignment. Current APIs chặn parent assignment, nên với dữ liệu hợp lệ điều này chưa tạo normal parent takeover; schema vẫn cho row đó tồn tại và handler không tự bảo vệ. `assignUserToClass`/`replaceClassAssignments` còn cho phép role admin trái với comment ADR-026 ở user assignment path, nhưng admin vốn đã có authority nên đây là drift, không phải privilege escalation. Thêm role predicate và tests cho alternate handlers; D9 là leak thực tế không cần corrupt assignment, đã tách riêng.

**H5 — No-recipient report/absence/class notification fallback global Telegram admin:** [smartNotifications.ts:35](../server/src/services/smartNotifications.ts#L35) → queue không target IDs → [notificationQueue.ts:285](../server/src/services/notificationQueue.ts#L285) gọi global sender. DB queue.parishId không đồng nghĩa recipient admin thuộc đúng parish. Nếu global chat không được quyền nhận PII mọi tenant thì có leak; chưa biết deployment recipient policy nên giữ conditional gap, không claim đã rò production. Sunday scheduler đã có no-target return, không được suy rằng report-card fallback cũng đã sửa.

**H6 — Bot chat authority:** [telegram.ts:43](../server/src/services/telegram.ts#L43) link/status/optin/optout/unlink dùng chatId, không kiểm private chat hay from-user bằng linked telegramUserId. Group chat có thể trở thành nơi nhận thông tin con và thành viên khác điều khiển link. Cần quyết định group support/consent; không gọi shared group là unauthorized mặc định khi chưa có policy. Không có runtime Telegram update test cho privacy này.

**H7 — Revocation và delivery chưa cùng semantics:** smart recipients lọc `status != INACTIVE`, không chỉ ACTIVE; queued user IDs/subscriptions không đồng nghĩa user còn quyền login lúc delivery. User delete có cleanup bindings, lock không có cùng semantics. Cần quyết định LOCKED có dừng thông báo hay chỉ login, và xử lý stale queued child ownership/phone changes. Chưa chứng minh người nhận thực tế sau reassignment bằng delivery test.

**H8 — Privileged/profile precondition, audit và ID-only CAS:** self-profile write/audit tách statement; admin password reauth thường nằm trước command transaction. Refresh CAS update theo session ID mà không lặp parish predicate, nhưng ID là full `randomUUID` và lookup token đã tenant-scoped; Telegram token/link có vài ID-only updates trong khi `generateId` chỉ lấy 32 bit. Các gaps này cần conditional/interleaving hoặc collision consequence riêng; không gộp thành D1/D5 chỉ vì predicate nhìn giống nhau. Refresh sequential-reuse bump dùng snapshot + constant assignment cũng cần monotonic-version test dưới concurrent revocation.

## 7. Intentional Policy và điều không report thành lỗi

- GLV parish-wide roster read ≠ class write permission. Shared Question Bank, admin/CN parish notices/events cũng không có owner-only requirement.
- Finance/audit/settings mutation/academic lifecycle admin-only; PT có attendance/daily/result-entry nhưng không aggregate-grade write hay exam completion.
- Parent identity↔child dựa normalized phone và trusted admin quản trị phone, không có claim cần thay ngay bằng relation table. Duplicate/shared/recycled phone data thực tế là U3.
- Anonymous feedback deliberately không trace sender. Không thêm audit identity vào anonymous workflow.
- Offline cache sau khi mất mạng không thể biết server đã revoke; force-logout không phải remote data erasure. Online mutation vẫn phải qua auth. Đây là intentional offline trade-off, nhưng cache sai do D9 không phải intentional disclosure.
- Logout một refresh session và revoke-all/tokenVersion là hai thao tác khác nhau. Body-token logout legacy không được nhầm là endpoint cấp token.
- Failed-password lockout admin exemption có chủ đích; superadmin LOCKED exemption có chủ đích cho **đúng principal**, D6 là identity mapping sai.
- Public verify và parent class metadata không tự là bypass. Tính chất authority của signature và dữ liệu public được xác nhận mới là vấn đề D10.

## 8. Test Coverage Gaps

**C1. Matrix chưa thành executable completeness contract.** 186 endpoint registrations đã inventory, nhưng không phải mọi role×tenant×ownership×state combination đã test. Existing RBAC suites có giá trị nhưng không phủ các counterexamples D1–D11.

**C2. Empty/delta scope và offline exposure:** cần parent/unassigned staff, empty assigned roster, no changed students + changed grade/attendance, explicit studentId foreign-to-class; E2E assert IndexedDB không có trẻ khác sau parent login. Chỉ test parent POST 403 là thiếu.

**C3. Composite IDs:** test tenant A/B distinct IDs không bắt UPDATE/JOIN thiếu parish. Đưa same logical ID, equal/different version và same user ID/different role vào fixtures canonical.

**C4. State races:** password verified rồi admin lock/reset/forceLogout; assignment revoked rồi write; student transfer rồi review; API reauth rồi actor revoked. D5 barrier chứng minh cần conditional commit, không chỉ rollback-on-audit-fail.

**C5. Alternate authority:** report-card read vs sign vs notification recipient; canonical attendance vs review; exam normal vs barcode/answer-variants; single/batch/import/restore paths cùng object. D2/D3/D10 probes là điểm bắt đầu, không exhaustive Cartesian suite.

**C6. Mounted runtime vs router-only:** full prefix allowlist D4, import-before-students mount, cookie scheme/Origin, global limiter + route limiter. Source hiện gắn loginRateLimiter ở cả index:77 và auth:117, cùng bucket; đáng có mounted test cho effective budget, không lấy router-only test làm production timing/throughput evidence.

**C7. Bot/delivery/device:** private vs group, link account switch, queued recipients sau ownership revocation, native shared-device switch, offline retained data, prod refresh cookie. Chưa chạy thiết bị/bot thật.

## 9. Unknown / insufficient evidence

- **U1 — Deployment:** SHA production, secret quality/rotation/separation, SUPER_ADMIN_ID tenant ownership, OPS token, URL/proxy/Origin config thật. Không đọc `.env` để công khai secrets.
- **U2 — Exposure incidence:** chưa query production collisions, access logs hay cache; đã chứng minh capability D1/D7/D9/D11, chưa định lượng số trẻ/người dùng/lớp đã bị tác động. Không dùng “chưa có incident” để hạ invariant violation.
- **U3 — Identity data:** duplicate/recycled parent phone, stale parent links, cross-tenant same IDs, versionless sessions hiện có. Cần read-only diagnostic do operator được phép chạy; không tự động quét PII production.
- **U4 — Recovery operating process:** API không nhận `identityVerified`; UI checkbox có và chặn submit. Tính đúng của xác minh qua kênh riêng/giao temp password là human workflow chưa được audit ngoài repo. Thêm boolean server không biến nó thành proof of identity.
- **U5 — Notification recipient policy:** global Telegram admin được phép nhận tenant nào, group chat có được hỗ trợ, lock có revoke delivery hay không. Không tự đổi semantics khi chưa chốt.
- **U6 — Document authenticity scope:** có cần xác thực nội dung report/certificate immutable và revoke/expiry không, hay chỉ identity tuple. Runtime claim hiện quá rộng; D10 vẫn verified ở contract đang trả về, remediation chi tiết cần quyết định này.

## 10. Đối chiếu audit cũ và remediation gần đây

- Old **AUTHZ-01** empty scope: **còn**, independently reverified bằng D9. Hook sync đã chuyển sang coordinator; thay vị trí orchestration không sửa scope query hoặc role-specific pull.
- Old **AUTHZ-02** verification: source behavior còn; D10 tái hiện arbitrary tuple + public verdict. Không tự coi parish-wide staff signing một mình là defect; evidence mạnh là mismatch giữa tuple signature và claim tính thật của phiếu điểm. UI integration chưa hoạt động đúng không vô hiệu hóa direct API.
- Old **AUTHZ-03** admin creation: còn behavior bearer-only, nhưng bản này phân loại **H1 privileged-operation hardening** thay vì suy ra unauthorized role escalation/superadmin-only policy không có normative proof.
- Old **AUTHZ-04** recipient confusion: còn, D3 tái hiện actual recipient resolver. Sunday reminder changes không sửa nhánh report-card.
- Old nhận xét “không tìm thấy cross-parish bypass” không còn đủ làm baseline assurance: D1/D7/D11 chứng minh same-ID write/JOIN defects. Điều kiện collision cần ghi rõ, không chuyển thành unconditional production claim.
- Transaction remediation có giá trị thật: auth reset/write/session atomic, leave pending CAS, reporting tx context, override specs. Nhưng **atomicity ≠ fresh authorization preconditions**; D2/D5 vẫn vi phạm đúng boundary cần bảo vệ.
- Architecture cleanup attendanceService chỉ giữ read có comment “đường ghi duy nhất” ở dòng 5; leave review vẫn direct-write attendance. Đây là documentation/ownership overstatement có concrete consequence D2, không phải chê direct DB access theo textbook.
- Một tenant restore regression còn title “foreign ID rejected” và mong HTTP 500, nhưng không assert error code/body. Payload có `classes: []` trong khi student restore tham chiếu `classA1Id`; transaction có thể fail vì quan hệ dữ liệu sau khi classes tenant A đã bị xóa. Test chỉ chứng minh row B không đổi sau failure/rollback, không chứng minh một global-ID tenant guard còn tồn tại. Source hiện chủ ý dùng composite identity và ép row vào authenticated parish. Không dùng tên test hay status chung làm bằng chứng về nguyên nhân từ chối.
- ADR-087 UI identity-verification checkbox đúng là UI control; không ghi audit rằng API đã enforce acknowledgement. Cần phân biệt normative human verification với server authorization của admin.

## 11. Risk-prioritized incremental remediation roadmap

### P0 — Đóng broad reads và đánh giá dữ liệu đã phát tán

1. Sửa D9 tại service/query boundary: explicit unrestricted vs scoped IDs; empty deny; scope lookup không dùng cursor. Canonical parent endpoints/role gates và role-aware sync là lớp bổ trợ.
2. Thêm negative regression + parent sync/cache E2E trước đóng finding. Xác định cache invalidation/version bump và hướng dẫn refresh/wipe scoped cache cho thiết bị bị ảnh hưởng; không hứa thu hồi thiết bị offline. Không xóa tất cả local pending mutations để dọn cache đọc.
3. Operator đánh giá log/data exposure ở môi trường thật nếu được cấp quyền; report artifact này không thay incident investigation.

### P1 — Đóng tenant write và stale-state acceptance

4. D1 thêm parish vào final UPDATE và same-ID regression; rà writer/joins của identity composite theo call paths, không rewrite repository layer. Read-only reconciliation để phát hiện grade có audit bất thường nếu có production collision.
5. D5 conditional credential-state transition và tests interleaving lock/reset/revoke. Không rollback admin lock vì request password-change đã bắt đầu trước đó.
6. D2 centralize attendance policy checks với tx executor hiện hành, resolve active student/current class, lock, version; giữ pending CAS và review+attendance+audit atomic. Chốt handling của pending request sau transfer/locked semester/future day, không tạo silent partial success.
7. D10 chốt attestation scope rồi làm signer/verifier/UI dùng cùng contract. Nếu giữ “phiếu điểm chính hãng”, dùng server-owned issuance snapshot/digest/status và scoped issuing action; không ký dữ liệu tùy ý để giả lập success. Existing QR compatibility/revocation cần migration plan, không thay key mù.
8. H1 step-up khi tạo privileged account: mục tiêu cụ thể chống stolen-bearer → durable access; yêu cầu product approval nếu thu hẹp ai được tạo admin, không mặc định superadmin-only.

### P2 — Đồng nhất identity/recipient/account-state boundaries

9. D3 recipient resolve từ canonical authorized student; D4 exact self-service route/method; D6 composite privileged principal; D7/D11 composite joins/ownership; D8 generic public auth error. Mỗi thay đổi có endpoint negative regression và readback/recipient assertions.
10. H2 version/claim validation có legacy session strategy; H3 authorization freshness trong critical tx; H4 explicit staff roles cho academic alternate paths.
11. Chốt H5–H7 delivery semantics rồi sửa no-recipient fallback/group authority/stale-recipient handling; không gộp login revocation với notification consent bằng suy đoán.

### P3 — Kiểm soát drift và verification thực tế

12. Biến matrix thành reviewed policy cases cho route mới; ưu tiên equivalence/negative cases theo boundaries thay vì hàng nghìn combinations vô nghĩa. Test actual mounted app, parent offline workflow và privileged step-up.
13. Đồng bộ authority docs sau khi contract thay đổi; report này là snapshot lịch sử, không ghi “resolved” trước regression/exploit probe đảo kết quả đúng.
14. Production/native/proxy verification do operator có quyền thực hiện; record exact release/device/config không secrets. Không đề xuất microservices, generic policy engine, full DDD rewrite, PKI hay relation-table migration khi chưa chứng minh giải quyết vấn đề hiện tại.

## 12. Verification thực sự đã chạy

- **30 server/security/deployment regression files: 219/219 tests PASS**, 137.37s. Gồm auth middleware/routes/lockout/atomicity; refresh rotation/race; username tenant; authorization-boundaries; RBAC; parents/provision/recovery; leave; question bank; finance tenant; parish profile; feedback; Telegram link; auth cookie; authorization-matrix-b; tenant isolation; admin invalidation; backup tenant/reauth; native push; security regressions; CORS; golive; smokePhase15; deploymentSecurityContract.
- **6 client files: 50/50 tests PASS**, 17.73s: authStore, api-tokens, routePolicy, offline-cipher, syncTenantOwnership, PasswordResetRequestsPanel.
- [Opt-in repro harness](../scripts/audits/auth-rbac-2026-09-05.probe.ts), [config](../scripts/audits/auth-rbac-2026-09-05.vitest.config.ts): các lượt dựng bằng chứng ban đầu D1–D10/D9b đều tái hiện. Challenge pass thêm D11 và lượt full-harness hiện tại qua đúng production mount: **13/13 tái hiện**, 10.25s.
- **Quan trọng:** assertions trong `.probe.ts` mô tả hành vi sai đang tồn tại. PASS nghĩa là **defect reproduced**, không phải security gate xanh. File opt-in nằm ngoài regular test include; remediation phải thêm inverse invariant tests vào suite chuẩn và làm exploit không còn thành công.
- Lần khởi động sandbox đầu gặp Windows `spawn EPERM`; rerun được phép mới chạy. Một cấu hình merge include ban đầu vô tình kéo suite mặc định, đã dừng và sửa harness, không dùng run đó làm acceptance evidence. Hai lần thử bcrypt interception không chạm đúng dependency nên D5 harness thất bại; đã thay bằng deterministic transaction barrier, D5 sau đó tái hiện thành công. Không sửa/skip product tests để làm xanh.
- Không chạy full toàn repo/coverage/build vì đây là audit không đổi product code; không claim CI full/E2E/native/production đã pass. 269 regular tests pass vẫn đồng thời với các defects được tái hiện; đây chính là coverage gap, không phải kết quả mâu thuẫn.

**Handoff:** chưa implement remediation. Artifacts của audit gồm report, endpoint matrix, source snapshot và opt-in reproduction/inventory scripts. Giữ nguyên bản 2026-09-04 để tránh trộn evidence giữa hai HEAD.

## 13. Remediation — working tree sau audit, 2026-09-05

### Đã thay đổi implementation

- **D9:** raw grades/attendance routes có staff role gate; `getGrades/getAttendance` deny explicit `[]` ngay tại service. `getStudentIdsForClasses` resolve toàn bộ active student IDs theo tenant/lớp, độc lập pagination và delta cursor. Parent coordinator không gọi staff academic pulls. Grades/attendance snapshot migration version 1 + cursor v2 bắt full pull, giữ nguyên durable mutation queue. Regression bao gồm parent 403, empty+explicit studentId, delta không có student thay đổi và >50 học sinh. Đây là sửa access path và cache khi ứng dụng mới chạy, **không phải thu hồi mọi bản sao đã phát tán**.
- **D1:** final grade UPDATE có `(parishId,id,version)`; same-ID/version fixture ở tenant B giữ nguyên khi A ghi thành công.
- **D5:** password-change CAS ràng buộc hash, version, role, status đã verify và active/nondeleted state; lock/reset/revoke xen giữa không bị ghi đè. Deterministic lock barrier xác nhận 401, LOCKED/version của admin vẫn còn.
- **D2:** leave review resolve active student/current class trong transaction; approval dùng SemesterLockSpecification; update attendance tăng version; giữ review PENDING CAS + attendance + audit cùng transaction. Lớp cũ không thể duyệt sau transfer; locked semester không tạo attendance. Không tự hủy các đơn pending cũ hay chuyển lớp trên lịch sử đơn.
- **D3:** report-card schema yêu cầu studentId; recipient chỉ từ active student đúng parish và parent phone canonical. Caller phone không chọn được người nhận khác. Không có target → không enqueue, `sent` không tăng.
- **D4:** forced-password allowlist theo đúng method + full path; chỉ self-service auth endpoints, không còn suffix `/profile` mở parish mutation.
- **D6:** protected superadmin cần đồng thời configured ID + configured parish + admin role, áp dụng login/middleware/refresh/reauth và target protection. Admin user list/detail trả `isProtectedAdmin`; UI bỏ heuristic username `bill`. `SUPER_ADMIN_PARISH_ID` mặc định `gia-ton`; operator phải xác nhận đúng deployment principal.
- **D7/D11:** Telegram user join, ownership/collision checks, token/link update và cả sáu import student→class joins có composite tenant identity. Không sửa dữ liệu collision hoặc xóa row existing.
- **D8:** unknown/wrong-password/LOCKED cùng 401, code và message; giữ dummy bcrypt, counter, limiter, audit. Không tuyên bố timing side-channel bằng zero hoặc thay anti-lockout policy của admin.
- **D10 — sửa theo scope hẹp:** signer kiểm current class + năm học tồn tại trong parish; API trả `verificationScope: signed_identifiers`, public verifier/UI bỏ khẳng định bản in/điểm số/cấp chứng nhận chính hãng. UI truyền parishId, không đoán tenant. Giữ HMAC tuple/key tương thích QR cũ. **Không xây issuance snapshot/digest/revoke:** đây là chấm dứt claim vượt evidence, không phải triển khai chứng thực tài liệu bất biến; U6 về nhu cầu sản phẩm vẫn mở.

### Hardening làm kèm và phần chưa đóng

- **H1:** tạo role admin cần mật khẩu hiện tại + rate limiter; UI/API client đã hỗ trợ, không persist password xác nhận; không thu hẹp thành superadmin-only. Missing password bị chặn, đúng password tạo được account.
- **H3 — partial:** grade upsert và attendance mark kiểm lại assignment/current account qua tx executor. Daily grades, exam/finalization và các privileged preconditions khác chưa được chứng minh fresh ở mọi boundary; không đánh dấu H3 toàn bộ resolved.
- **H4:** các exam read/answer/barcode alternate handlers được bổ sung staff roles; class access helper cũng loại nonstaff/inactive/deleted account. Inconsistency admin assignment vs comment ADR là debt riêng.
- **H5:** academic enqueue helper không fallback global Telegram khi recipient rỗng. Sunday scheduler changes có trước remediation được giữ nguyên. Explicit parish notice/staff operational alert policy không tự đổi.
- **H8 — partial:** refresh reuse tăng tokenVersion bằng SQL trên giá trị hiện hành, thêm tenant vào refresh CAS và Telegram mutations; deterministic concurrent revoke/login/revoke regression chứng minh không hồi sinh access token. Profile write/audit, successful-login rehash và admin reauth-before-command freshness vẫn cần vòng hardening riêng.
- **H2, H6, H7 và U1–U6:** vẫn mở ở những phần chưa có bằng chứng/decision. Chưa áp strict token-kind/version migration; chưa đổi group chat policy hoặc quan hệ LOCKED/notification consent; chưa kiểm production exposure/config/thiết bị, phone reassignment hay quy trình xác minh người thật. Local fixes không biến unknown thành verified strength.

### Verification sau sửa

- Suite chuẩn mới: `server/src/__tests__/authAuditRemediation.test.ts` (inverse invariants, Hono + SQLite thật), `src/__tests__/authAuditCacheRemediation.test.ts` (Dexie migration/queue/cursor/parent pull), `src/__tests__/components/VerificationPage.test.tsx` (QR tenant + contract).
- Các tests cũ mong enumeration/global fallback/ID-only superadmin được chuyển sang contract an toàn hoặc fixture đủ composite principal; không xóa negative assertions.
- Targeted remediation + user-management: **32/32 PASS**; client migration/QR: **5/5 PASS**. `npm run lint`, TypeScript frontend/backend và `npm run build`: **PASS**. Build có warning NODE_ENV trong .env và deprecated PWA bundler option, không thay cấu hình ngoài scope.
- Full serialized `npm run test:coverage -- --fileParallelism=false`: **317 files, 2.161 PASS / 8 FAIL**, 913,05s. Năm file fail chỉ ra expected contract cũ: `admin-lock-invalidate`, `userDeletion`, `superadmin-self-service` chưa khai báo composite protected principal; `auto-username` tạo admin chưa reauth; `syncCursor` assert v1 thay v2. Lượt full này đã hoàn tất, nhưng **không được gọi full CI/coverage gate xanh**. Fixture được sửa sau khi đã được load trong lượt full; stack trace cuối có thể hiển thị dòng file mới. Không dùng historical exploit probes làm green security gate.
- Rerun sau sửa fixture lần đầu: **5 files / 44 tests PASS**, gồm 21 tests trong authAuditRemediation (bổ sung open-semester approval/version/replay và corrupt-parent exam assignment). **Lượt xác nhận cuối: 10 files / 76 tests PASS**, 42,22s — bao gồm toàn bộ 5 file từng fail, authAuditRemediation, users-routes, user-management, cache migration và QR UI. Không rerun 312 file đã xanh; chưa có một lượt full coverage hoàn toàn xanh sau chỉnh fixture. Build frontend/backend, lint, design-system guard sau patch cuối PASS; architecture inventory gate PASS, `git diff --check` PASS.
- Browser E2E `critical-auth-permissions.spec.ts`: **3/3 PASS**, 39,2s, backend thật + SQLite tạm + cổng riêng 3210/3211; staff login/refresh/logout, mobile parent linked-child UI + raw grades/attendance 403, backend deny mutation và readback. Sandbox đã cleanup. Không phải E2E đủ mọi route hoặc browser cache-upgrade từ bản cũ.
- Chưa native/device hay production smoke. Cần backend/frontend rollout cùng contract và reload ứng dụng để migrate read cache; không xóa pending queue, không có schema migration hoặc key rotation trong patch. H1 UI submit và cache migration qua browser release-upgrade chưa có dedicated E2E; server integration/real Dexie regression là evidence hiện có.

## 14. Decision research — H2/H6/H7, phần còn lại H3/H8 và production unknowns

### 14.1. Snapshot, phương pháp và thay đổi mức độ tin cậy

Nghiên cứu tiếp ngày 2026-09-05 trên **HEAD `09ee9ff263838b062d84657277bd6d230eba99c5` + dirty working tree**, bao gồm remediation §13. SHA không đại diện một bản đã commit/deploy chứa các remediation. Các mục §1–12 là evidence lịch sử; §13 là thay đổi trước vòng nghiên cứu này. **Vòng này chỉ bổ sung diagnostic probes và decision record, chưa sửa product code hoặc triển khai production.**

Áp dụng Decision Matrix cho D3: atomicity, tenant identity và quyền tại thời điểm quyết định ghi là invariant, không lấy tỷ lệ test pass/SLO làm error budget cho sai quyền. So sánh phương án theo hậu quả đã chứng minh, compatibility, recovery và chi phí thay đổi; không dùng điểm số giả khi thiếu dữ liệu production.

Diagnostic opt-in: `scripts/audits/auth-hardening-decisions-2026-09-05.probe.ts`, cấu hình riêng `auth-hardening-decisions-2026-09-05.vitest.config.ts`. Dùng Hono routes/services hiện tại + SQLite tạm của global setup, dữ liệu synthetic; provider gửi thông báo được mock. Deterministic barrier cho một lệnh quản trị thật commit ngay trước transaction của request đang kiểm tra. Đây là lịch xen kẽ hợp lệ có kiểm soát, **không phải đo tần suất race production**.

- **H8-A/H8-B: nâng từ hardening chưa chứng minh sang Verified conditional defects, đề xuất P1.** Có credential rollback và privileged command commit sau actor lock; chi tiết bên dưới.
- **H3-A: Verified conditional defect, đề xuất P1** cho daily-entry write sau assignment revocation. Những exam/undo paths khác vẫn phân biệt source evidence với runtime repro.
- **H7-A: Verified stale-recipient selection, đề xuất P1 cho academic PII.** Queue recovery chọn gửi nội dung cho old parent sau phone reassignment + LOCKED. Chưa chứng minh delivery qua provider thật; chính sách riêng của LOCKED vẫn cần phê duyệt.
- **H2: giữ Defense-in-Depth Gap có counterexample synthetic**, không biến token test thành bằng chứng có phiên legacy ở production.
- **H6: verified service contract + bot source gap**, chưa có Telegram update-dispatch/private-group E2E thành công; group-support/consent vẫn là policy decision.

### 14.2. H8 — bảo vệ credential và principal tại command transaction trước

**H8-A — rehash-on-login có thể phục hồi mật khẩu cũ sau reset.** Path: `POST /api/auth/login` → [auth.ts:140](../server/src/routes/auth.ts#L140) verify password bằng snapshot → [auth.ts:182](../server/src/routes/auth.ts#L182) transaction → legacy-cost rehash UPDATE chỉ theo `(id,parishId)` tại dòng 191 → issue session từ snapshot cũ tại dòng 195. Probe cho `resetUserPassword` commit trước transaction login: account giữ `FORCE_PASSWORD_CHANGE`, `tokenVersion=2`, nhưng hash lưu lại khớp mật khẩu cũ và không khớp temp password vừa reset; **một lần login mới bằng mật khẩu cũ trả 200**. Access token của request đầu có epoch cũ bị middleware từ chối không đủ bảo vệ: credential đã bị ghi đè và login tiếp theo lấy epoch mới.

Điều kiện cụ thể: user có bcrypt cost 10 được nhận dạng bởi `isLegacyCostHash`, password verification thành công trước reset, rehash UPDATE sau reset. Không suy mọi login hay mọi hash đều có credential rollback. Root cause là stale precondition, không phải thiếu transaction hay bcrypt cost yếu.

**Quyết định đề xuất:** verify password và tính upgraded hash ngoài write transaction; trước bất kỳ login-state write/session issuance nào, trong transaction kiểm lại `(id,parishId,passwordHash,tokenVersion,role,status,deletedAt)` tương ứng snapshot đã xác minh và allowed account state. Snapshot stale → từ chối, không ghi đè reset/lock, không phát session từ snapshot cũ. Giữ session + audit + login-state atomic. Không kéo bcrypt vào transaction dài. Test inverse: reset temp password còn đúng, mật khẩu cũ không login được; lock/revoke/role-change xen kẽ bị từ chối; audit failure rollback toàn bộ.

**H8-B — admin reauth không gắn với command commit.** Path: `POST /api/users` → [users.ts:95](../server/src/routes/users.ts#L95) role admin + password verification → [userService.ts:303](../server/src/services/userService.ts#L303) trả boolean → `createUser` hash temp password → [userService.ts:141](../server/src/services/userService.ts#L141) insert user/assignment/audit, không kiểm lại caller. Probe cho `updateUserStatus(caller,'LOCKED')` commit sau reauth nhưng trước create transaction: API vẫn 201, admin mới tồn tại, trong khi token caller đã 401. Đây là **conditional revocation bypass**, không phải low-role account tự tạo admin; H1 step-up vẫn hữu ích nhưng chưa đóng boundary này.

**Quyết định đề xuất:** mang verified actor snapshot nội bộ từ reauth vào command và kiểm lại trong transaction tiêu thụ nó. Bind principal composite, epoch, role, trạng thái, hash đã verify và action tương ứng; chỉ dữ liệu nội bộ request, không trả cho client hoặc tạo reusable step-up token mới. Cùng cách kiểm phải được rà trên reset-password/admin-change-password/phone/delete và destructive admin commands; chỉ kiểm target không thay cho kiểm actor. Dùng helper nhỏ theo executor và patterns hiện có, không dựng policy engine. Không thay requirement thành superadmin-only.

**H8-C — profile còn source-verified consistency gap, đề xuất P2:** `PUT /api/auth/profile` [auth.ts:427](../server/src/routes/auth.ts#L427) đọc user ngoài transaction; dòng 445–450 ghi cả `phone` từ snapshot ngay cả khi request chỉ đổi tên; audit insert dòng 459 tách commit. Một concurrent admin phone change có thể bị ghi đè bằng phone cũ của parent, chạm khóa liên kết con; audit failure có thể để mutation đã commit. Chưa có dynamic probe riêng cho hai tình huống này trong vòng này. Sửa tối thiểu: update chỉ field thực sự được yêu cầu, kiểm current role/phone ownership và epoch trong transaction, mutation + audit atomic, response dùng row đã ghi. Giữ nguyên parent không tự đổi phone và không đưa PII/password vào log.

**H8 refresh — không đánh đồng với hai defects trên:** [refreshSessionService.ts:64](../server/src/services/refreshSessionService.ts#L64) vẫn đọc user trước tx, nhưng rotation CAS dòng 127 còn yêu cầu session chưa revoked; sanctioned reset/lock/revoke có revoke sessions. Monotonic increment đã sửa ở §13 là giá trị thật. Nên đưa final user/session-principal/epoch validation vào cùng rotation tx, giữ concurrent loser không revoke winner; chưa có evidence trong vòng này cho một refresh bypass mới tương đương H8-A/B.

### 14.3. H3 — chốt điểm quyết định quyền, không chỉ chuyển danh sách vào transaction

**H3-A — daily grade:** `POST /api/daily-entries/batch` → [dailyEntries.ts:49](../server/src/routes/dailyEntries.ts#L49) lấy allowed classes → [dailyEntryService.ts:148](../server/src/services/dailyEntryService.ts#L148) per-item tx → `assertWritable` dòng 90–110 chỉ kiểm student/current class nằm trong list chụp trước đó. Probe `removeUserFromClass` commit trước item tx: response 200/`saved=1`, `assessment_entries` có row mới sau thu hồi assignment. Tenant và semester checks vẫn hoạt động; chúng không giải quyết stale actor scope.

**Coverage còn thiếu tại các writer khác:**

- [gradeService.ts:146](../server/src/services/gradeService.ts#L146) và [AttendanceApplicationService.ts:76](../server/src/services/AttendanceApplicationService.ts#L76) đã kiểm assignment fresh bằng tx khi có list. Nhánh `allowedClassIds=null/undefined` bỏ qua fresh actor check; `checkUserClassAccess` không nhận originating token epoch. Không coi admin snapshot/unrestricted list là authority vĩnh viễn.
- Grade undo [gradeService.ts:432](../server/src/services/gradeService.ts#L432) còn list-only check. `BUSINESS_RULES.md` dòng 449 mô tả `checkUserClassAccess` cùng transaction; đây là drift cụ thể cần sửa implementation, không chỉ sửa lời mô tả cho khớp.
- Exam `assertSessionAccess` [examService.ts:448](../server/src/services/examService.ts#L448), result mutation dòng 565 và finalization dòng 928 còn list-only. **Nuance quan trọng:** normal finalization gọi `upsertGrade(...,tx,allowedClassIds)` tại dòng 1108–1116, nên assignment fresh check ở grade có thể rollback normal grade writes. Protected-source conflict nhánh dòng 1030 không gọi upsert; completed replay cũng có early return. Vì vậy không được claim mọi finalization đều bypass, hoặc mọi path đã được nested grade check bảo vệ. Các nhánh này mới có source evidence, cần negative runtime tests riêng.

**Quyết định đề xuất:** định nghĩa authorization linearization point là trong write transaction sau khi giành write boundary, trước mutation đầu tiên. Revocation commit trước điểm này phải chặn command; revocation đến sau một command đã giành transaction có thể serialize sau command đó. Không hứa hủy tức thời một transaction hợp lệ đang commit.

Mở rộng actor context hiện có bằng expected epoch cho request-originated commands; cùng executor resolve current principal/status/role/assignment và current object tenant/class. Kiểm theo allowed roles của từng action, không `null == admin`. Reuse query helper, không truyền HTTP middleware/JWT parser xuống domain. Background/system job cần explicit internal authority thay vì dựng fake user token. Giữ per-item partial-success của daily/batch, OCC, idempotency và nested externalTx; không bọc mọi read route trong transaction hoặc đổi batch thành all-or-nothing ngoài requirement.

Acceptance: revoke assignment/account/epoch trước write → không có mutation/audit-success; transfer/empty scope/foreign tenant → deny; admin hợp lệ vẫn được ghi; exam conflict-only/replay/variant/result/undo đều kiểm đúng authorization path. Idempotent receipt không tự cấp quyền sau revocation.

### 14.4. H7 — tách quyền nhận hiện tại khỏi consent và phiên đăng nhập

**Evidence:** smart recipient resolver [smartNotifications.ts:54](../server/src/services/smartNotifications.ts#L54) dùng parent phone tại enqueue. Queue [notificationQueue.ts:133](../server/src/services/notificationQueue.ts#L133) lưu rendered message + target IDs; recovery dòng 81–124 dựng lại item với `context={}`. `notifications.studentId` có trong schema nhưng enqueue này không lưu subject. Drain dòng 285–292 → [telegramLinkService.ts:209](../server/src/services/telegramLinkService.ts#L209) chỉ kiểm link ACTIVE/opt-in/tenant/user ID, không join current user state hoặc current child ownership. Web/native push targeted sender cũng chọn subscription/device theo IDs, không tự resolve parent-child authority.

Probe seed một report pending của parent, dùng API service đổi canonical phone rồi LOCKED, sau đó queue recovery: sender mock nhận đúng chat và nội dung phiếu điểm cũ, DB status `sent`, `studentId=null`. Đây là proof lựa chọn recipient ở delivery boundary, **không phải bằng chứng Telegram thật đã nhận**, và probe kết hợp phone-change + lock chứ không đo từng tác nhân riêng. Source cho thấy thiếu cả hai predicates. Ownership đã mất là vấn đề quyền nhận độc lập với quyết định LOCKED có ngừng notification hay không.

**Quyết định đề xuất ưu tiên:**

1. Với academic notification, lưu subject tối thiểu để re-authorize ở mỗi delivery attempt, tận dụng `studentId` hiện có cho single-child report/absence. Recipient = **original targets giao với current eligible owners**, không retarget nội dung đã render sang phụ huynh mới. Nếu cần class reminder, khai báo scope riêng đúng nhu cầu đó; không serialize một policy engine tùy ý.
2. Giảm notification body về thông báo chung + đường vào ứng dụng kiểm quyền hiện tại; tránh tên trẻ/điểm/ngày vắng trong body ngoài ứng dụng. Đây là thay đổi UX cần phê duyệt, nhưng đóng cả rủi ro lock-screen/shared chat và khoảng trễ không thể triệt tiêu giữa DB check và provider send. Chỉ thêm một DB check không tạo được atomicity với mạng bên ngoài.
3. Đề xuất state policy: ACTIVE + current ownership + consent mới được nhận academic notification; LOCKED/INACTIVE/deleted không gửi nội dung nhạy cảm; FORCE_PASSWORD_CHANGE tối đa thông báo chung. Giữ opt-out qua lock/unlock, không tự opt-in. Logout một phiên không đồng nghĩa revoke toàn bộ kênh/thiết bị; force-logout phục vụ nghi ngờ compromise cần thao tác containment rõ ràng, không đánh đồng với logout thường.
4. Không còn eligible target → terminal suppressed với reason code không PII (hoặc dùng trạng thái failed hiện có với lý do riêng nếu chưa cần mở schema), không ghi `sent` giả, không retry vô hạn chờ user được mở khóa. Provider transient failure mới retry; không giữ DB transaction qua network.

**Legacy recovery là phần bắt buộc của fix:** pending report/absence thiếu subject không đủ evidence để kiểm lại ownership. Quarantine/suppress những item đó, không parse rendered text để đoán trẻ, không xóa hàng loạt lịch sử; nếu cần phát lại phải resolve authority mới và regenerate payload. Pending row `targetUserIds=null` còn recovery thành undefined rồi global Telegram fallback ([notificationQueue.ts:118](../server/src/services/notificationQueue.ts#L118), dòng 293–298). H5 đã sửa new enqueue **không tự sửa backlog cũ**. Explicit operational notice/global admin channel cần audience policy riêng, không mặc định được nhận PII mọi parish. Message đã giao cho provider không thể hứa thu hồi.

### 14.5. H6 — đề xuất private-only cho liên kết phụ huynh

Bot source [telegram.ts:43](../server/src/services/telegram.ts#L43) `/link` lấy chatId/from nhưng không kiểm chat type; `/status`, `/optout`, `/optin`, `/unlink` dòng 87–147 chỉ dùng chatId. Service identity [telegramLinkService.ts:9](../server/src/services/telegramLinkService.ts#L9) không có chatType; setters dòng 184/194 không nhận sender identity. Probe service tiêu thụ token hợp lệ với group-shaped chatId `-100123`, lưu user `1001`, sau đó đổi preference chỉ bằng chatId thành công. **Chưa chạy thành công test dispatch update từ một thành viên group khác**; kết luận về handlers dựa source, không che giới hạn này.

**Lựa chọn đề xuất:** parent account binding chỉ qua private chat, sender bắt buộc và phải khớp linked Telegram user trên mọi lệnh nhạy cảm. Guard trước khi consume token hoặc trả tên/trạng thái; service contract phải nhận verified identity đầy đủ, không chỉ thêm UI/bot guard rồi giữ alternate service path yếu. Reject missing IDs, không biến `undefined` thành string; không dùng dấu âm của chatId làm bằng chứng duy nhất về chat type. `/start`/`help` có thể trả hướng dẫn chung ở group. Không tự cấm operational admin group vì đó là audience khác.

Rollout phải xử lý link cũ thiếu sender/type assurance: read-only aggregate preflight, ngừng sensitive delivery và yêu cầu relink cho binding không chứng minh được phù hợp. Không tự đoán mọi row cũ là private, không lấy DB hiện tại làm proof chat type vì schema chưa lưu nó. Nếu cần persisted binding version/type để đánh dấu verified private link, chỉ thêm trường hẹp phục vụ migration này; không xây group-membership subsystem khi chưa có requirement cho group. Không auto-delete tokens/links/history production trong nghiên cứu.

### 14.6. H2 — strict claims với migration có điểm kết thúc

[auth.ts:40](../server/src/middleware/auth.ts#L40) cho optional tokenVersion; verifier dòng 65/73 chỉ cast kết quả signature verification; middleware dòng 96 và refresh dòng 79 bỏ epoch check nếu version vắng. Hai issuer session runtime trong [refreshSessionService.ts:30](../server/src/services/refreshSessionService.ts#L30) và dòng 110 có truyền version. Probe ký synthetic versionless token bằng test secret rồi force logout: versioned control bị 401, versionless còn 200. Không ai chỉ biết public API có thể tự bỏ field trong token đã ký mà vẫn giữ chữ ký đúng; **production legacy-token availability chưa biết**.

**Đề xuất:** bắt buộc claim schema ở verifier và issuer: principal/tenant/username hợp lệ, explicit role enum, tokenVersion integer hợp lệ (schema hiện khởi tạo từ 1), iat/exp/jti đúng kiểu/lifetime; tách access/refresh purpose và schema version. Input principal của issuer khác verified-token output; bỏ fallback `tokenVersion || 1` cho dữ liệu sai. Production startup kiểm secret presence, minimum length và access/refresh separation; độ dài không chứng minh entropy. Không đổi HS256/key hoặc xây key registry chỉ để thêm token purpose.

**Compatibility:** tokens hợp lệ hiện hành chưa có purpose, nên strict-purpose bật ngay sẽ buộc mọi người login lại. Ưu tiên staged issuance + verifier với **absolute cutoff cấu hình cố định**: token mới luôn typed/versioned; legacy access chỉ cho qua khi secrets riêng biệt, tuổi/lifetime hợp lệ với 15 phút hiện tại và phát hành trước thời điểm chuyển; legacy refresh vẫn phải versioned + hash-bound DB/session/principal/tenant/expiry và có hạn cuối tối đa theo 7 ngày hiện tại. Không chấp nhận versionless chỉ vì gọi nó legacy, không có fallback vô hạn hoặc cutoff trượt theo startup. Wrong explicit purpose luôn deny.

Nếu không xác nhận được key separation hoặc nguồn issuer cũ, chọn controlled re-login thay cho compatibility mơ hồ. Không cần re-key khi secrets vẫn hợp lệ; nếu phát hiện dùng chung/không đạt gate thì việc cấu hình secret đúng và kế hoạch đăng nhập lại là phần riêng cần operator. Refresh token đang lưu hash nên **không thể đếm claim shape của các phiên cũ từ DB hash**. Dùng metadata/counter không PII, không decode/log plaintext session thật. Giữ durable offline queue khi phiên bị buộc login lại; không wipe pending mutations để migrate auth.

Acceptance: thiếu/sai version/type/purpose/exp/jti → deny; refresh-as-access và access-as-refresh → deny; same-ID tenant tests; legacy đúng trước cutoff → rotate sang typed, sau cutoff → deny; reuse/concurrent refresh winner, force-password flows, native/browser refresh và offline re-login không mất queue. Chưa chọn ngày cutoff khi chưa biết release schedule production.

### 14.7. Production unknowns — evidence cần để quyết định, không giả vờ đã verify

- **U1 — deployment/config:** operator xác nhận đúng backend/frontend release và config đang dùng, không lấy `render.yaml` làm trạng thái service thực. `/health` có releaseId tại [health.ts:10](../server/src/routes/health.ts#L10), nhưng connectivity/ready không chứng minh auth readiness. Preflight chỉ xuất booleans/counts: secret hiện diện/đủ độ dài/khác nhau; protected principal composite tồn tại, role admin, trạng thái đúng; config URL/Origin/proxy. Không xuất giá trị secret/token/hash/phone. `DEPLOYMENT_GUIDE.md:63` còn ghi SUPER_ADMIN_ID optional/default/role bypass, mâu thuẫn hướng dẫn đầu file và implementation mới — documentation drift, không coi dòng cũ là authority.
- **U1 — proxy/cookie:** [ip.ts:39](../server/src/utils/ip.ts#L39) TRUST_PROXY tin x-real-ip hoặc cuối XFF. Cần synthetic low-volume smoke qua đúng edge và direct backend để xác nhận proxy overwrite và effective limiter identity, cùng Secure/SameSite refresh-cookie ở browser/native thật. Không suy từ CORS hoặc router-only tests; không brute-force/load test production để kiểm điều này.
- **U2 — incidence/exposure:** read-only aggregate collision counts chỉ là tín hiệu, vì same-ID khác parish được composite schema cho phép. Muốn kết luận tác động D1 cần đối chiếu grade/audit/version có thẩm quyền; thiếu log không chứng minh chưa leak. Không query/export hồ sơ trẻ vào chat. Cache đã phát tán/offline không thể truy hồi chỉ bằng server fix, không có số lượng thiết bị thực từ repo.
- **U3 — identity/data quality:** counts về normalized duplicate/shared phone, orphan/stale parent links, legacy Telegram bindings, pending notifications thiếu subject/targets, legacy bcrypt cost 10, invalid epochs và nonstaff assignments. Duplicate phone không tự là fraud vì có shared-family policy; phải phân biệt duplicate hợp lệ/recycled number trước data correction. Phiên versionless không thể xác định bằng refresh-token hash. Chưa chạy các query này trên production.
- **U4 — recovery:** giữ admin authority + verified fresh reauth + atomic audit, nhưng cần người phụ trách chốt cách xác minh người thật và giao temp password qua kênh đáng tin. UI checkbox hay server boolean `identityVerified` không thay được proof ngoài hệ thống. Không tự triển khai KYC hoặc lưu giấy tờ định danh để đóng unknown này.
- **U5 — notification policy:** cần chốt private-only parent binding; LOCKED/FORCE behavior; academic body có chỉ là thông báo chung; operational admin audience được phép nhận parish nào. Khuyến nghị ở §14.4–14.5 chưa phải approved business rule.
- **U6 — authenticity:** giữ `signed_identifiers` đã thu hẹp ở §13 làm scope hiện hành. Chỉ bổ sung immutable issuance/digest/revoke khi có requirement cần chứng thực nội dung phiếu/chứng nhận; không xây PKI để giải quyết một claim UI đã được bỏ.

Không đọc secrets/live DB, không truy cập bot/provider thật, không rotate key, reset user, purge dữ liệu hoặc deploy để hoàn thành nghiên cứu này. Bước production cần operator chỉ định đúng môi trường và cho phép phạm vi read-only; mọi correction/destructive operation có approval/recovery riêng.

### 14.8. Roadmap và verification của vòng nghiên cứu

1. **P1 — H8-A/B:** đóng stale credential/principal trước, thêm inverse deterministic race tests. Đưa H8-C profile vào cùng vòng nhỏ nếu giữ scope atomic identity update, không refactor user service toàn bộ.
2. **P1 — H3:** fresh actor/object checks cho daily/undo/exam alternate paths, giữ đúng transaction, role và partial-batch semantics. Không đánh dấu resolved chỉ vì helper đã được viết hoặc normal grade path đã pass.
3. **P1 privacy — H7:** current ownership tại dispatch + legacy queue suppression; chốt body/state policy trước thay UX. **H6 P2 policy hardening** triển khai đồng bộ nếu parent notifications còn hoạt động, vì private binding không tự sửa stale owner và dispatch check không tự sửa shared-group disclosure.
4. **H2 P2 rollout hardening:** issuer/claim tests có thể chuẩn bị song song về kế hoạch; enforcement/cutoff chỉ triển khai sau preflight và re-login recovery. Nếu preflight phát hiện secrets dùng chung hoặc legacy invalid sessions thật, đánh giá lại urgency theo evidence đó.
5. Production unknowns là release/evidence gates riêng, không đánh dấu đóng bằng local tests. Không rewrite/microservices/generic policy engine, không remote wipe offline queue, không đổi parent identity sang relation table chỉ để sửa recipient stale.

**Đã chạy:** cấu hình probe riêng với lệnh `npm exec vitest run -- --config scripts/audits/auth-hardening-decisions-2026-09-05.vitest.config.ts`: **1 file / 6 probes PASS, 14,25s**. PASS ở đây nghĩa là tái hiện observed gap, **không phải 6 security invariants đã được sửa**. Bốn probes H2/H8/H3 dùng real endpoint/service + DB; H6 là service-level; H7 dùng real recovery/recipient selection + sender mock.

`npm run lint`: **PASS** sau khi bổ sung probes và report. Không có thay đổi product code trong vòng nghiên cứu này.

Lượt đầu có 4 pass/2 fail do harness H6 không capture được command registrations và H7 phụ thuộc fixture H6. Đã tách fixture H7, thay H6 bằng probe service có scope trung thực; **không xem failure của harness là defect sản phẩm, không tuyên bố đã có bot-update test**. Một lượt startup `spawn EPERM` do sandbox không tạo được child process; chạy lại được ở môi trường cho phép. Không rerun full coverage/build/E2E trong vòng chỉ nghiên cứu này; kết quả §13 vẫn là lịch sử riêng, không trở thành full-green mới.

## 15. Implementation follow-up — H3/H7/H8

### 15.1. Snapshot và giới hạn kết luận

Tiếp tục theo yêu cầu thực hiện các đề xuất: **HEAD `09ee9ff263838b062d84657277bd6d230eba99c5` + working-tree remediation**, ngày 2026-09-05. Đây là implementation sau nghiên cứu §14, chưa commit/deploy. Không ghi đè evidence lịch sử của CSV/snapshot/probes. Diagnostic probes §14 cố tình assert hành vi có lỗi nên không còn là green gate cho code đã sửa; regression inverse nằm trong test suite chuẩn bên dưới.

Áp dụng Decision Matrix D3: sửa điểm quyết định quyền/credential và delivery scope trong modular monolith hiện tại; không thêm policy engine, broker, migration hoặc reusable step-up token. Kiểm chứng dưới đây dùng SQLite/Hono và dữ liệu synthetic; provider mock không chứng minh delivery thực, và lịch xen kẽ có kiểm soát không đo xác suất race production.

### 15.2. H8 — credential, privileged commands và profile

- **H8-A — fixed ở successful-login boundary:** `POST /api/auth/login` → [auth.ts](../server/src/routes/auth.ts), successful-login transaction. Bcrypt verify/upgrade ngoài write transaction; UPDATE login state/rehash chỉ thành công nếu composite principal, hash, epoch, role, status và nondeleted snapshot còn khớp. Zero updated rows → generic `401 INVALID_CREDENTIALS`, không phát session hoặc success audit. Reset đã commit không bị rehash phục hồi mật khẩu cũ. Inverse test dùng legacy cost-10 hash và real reset service, xác nhận temp password còn đúng và old password không đăng nhập được.
- **H8-B — fixed cho những HTTP commands đã chuyển:** `/users` tạo admin; `/users/:id/reset-password`, `/users/:id/phone`, `DELETE /users/:id`; `/auth/admin-change-password` → [captureAdminReauth](../server/src/services/userService.ts#L314) → request-local `AdminReauthProof` → kiểm lại trong consuming transaction. Proof bind actor/parish/target/action, password hash đã verify, role/status/epoch; không trả cho client hoặc persist. Actor bị lock/revoke sau re-auth → rollback, `401 SESSION_INVALID`. Test missing/wrong-action proof chặn admin creation; bốn lifecycle endpoints có inverse epoch-race tests.
- **H8-C — fixed ở profile boundary:** `PUT /api/auth/profile` đọc principal hiện hành, chỉ update field được gửi và ghi audit cùng transaction. Parent vẫn không tự sửa phone; name-only patch giữ phone admin vừa đổi; audit failure rollback profile; empty patch với phone null không ghi/audit giả. Có ba tests cho các trường hợp này.
- **Không đóng toàn bộ H8:** `verifyAdminReauth` boolean compatibility vẫn có caller provisioning/backup/recovery; chưa chuyển toàn bộ các lệnh quản trị. Proof ở reset/phone/delete service signature vẫn optional cho internal callers, không được mô tả là capability bắt buộc ở mọi service entry. Tạo admin service thì bắt buộc proof. Refresh vẫn cần nghiên cứu final principal read cùng rotation transaction; không tuyên bố có bypass mới từ gap chưa tái hiện. Target preconditions ở mọi command cũng chưa được chứng minh exhaustively.

### 15.3. H3 — freshness ở academic write boundaries

Route mang `{role, epoch: tokenVersion}` nội bộ → [checkAcademicWriteAccess](../server/src/services/classAccessQueryService.ts#L10), cùng executor với mutation. Helper kiểm current composite actor, nondeleted, allowed role/status, expected role/epoch nếu được cung cấp, rồi current assignment. Giữ ngoại lệ protected admin LOCKED theo composite principal hiện hành; `null` scope không còn bỏ fresh actor check. Danh sách lớp chụp ở route chỉ là giới hạn trên, không tự cấp quyền.

Các đường đã nối:

- Daily upsert per-item và delete → [dailyEntryService.ts](../server/src/services/dailyEntryService.ts#L87): kiểm trước idempotent ack/write; revoked assignment → batch item error, không `saved` giả.
- Grade upsert/batch/undo → [gradeService.ts](../server/src/services/gradeService.ts#L113): admin/chunhiem; undo kiểm trước cả nhánh no-audit. Attendance single/batch → [AttendanceApplicationService.ts](../server/src/services/AttendanceApplicationService.ts#L45): admin/chunhiem/phuta. Unrestricted admin vẫn bị deny khi epoch thay đổi trước transaction.
- Exam create, result upsert/delete, delete session, answer-key/variant update, immutable manifests, finalize/complete/reopen → [assertExamWriter](../server/src/services/examService.ts#L13). Finalize/complete chỉ admin/chunhiem; reopen admin. Fresh check trước completed replay và finalization branches nên không phụ thuộc việc nhánh đó có gọi nested grade upsert hay không. Create idempotency read-return cũng kiểm fresh authority, nhưng read-return này không được mô tả như một write transaction.

Giữ tenant/object checks, semester locks, OCC, idempotency, partial-batch semantics và caller-owned nested transaction. Không thêm bcrypt/network vào transaction. Query service dùng [protectedPrincipal.ts](../server/src/utils/protectedPrincipal.ts), middleware re-export helper cũ; không đưa Hono/JWT parsing xuống service.

**Evidence:** inverse tests revoke assignment trước daily/undo; revoke epoch trước daily delete, HTTP grade/attendance và 10 exam operations (bao gồm completed replay). Assert không có row/audit-success ngoài quyền. Exam regression suite tiếp tục kiểm các luồng hợp lệ, conflict và score/finalization. Không tuyên bố đã fault-inject mọi tổ hợp role/transfer/assignment cho cả 10 exam paths. **H2 vẫn mở:** versionless JWT chưa bị reject; epoch expectation optional không tạo ra originating version khi token vốn thiếu. Không đánh dấu mọi writer của toàn sản phẩm đã có freshness chỉ từ coverage academic này.

### 15.4. H7 — single-child dispatch và legacy recovery

`smartNotifications.notifyReportCard/notifyAbsence` → queue enqueue persist existing `notifications.student_id` và original targets → restart/retry recovery → lease claim → [currentChildRecipients](../server/src/services/notificationQueue.ts#L36) → channel-specific binding lookup → send. Recipient phải nằm trong **original targets giao với current eligible parent owners**: cùng parish, role parent, ACTIVE, nondeleted, phone chuẩn hóa còn khớp với child nondeleted. Không lấy parent mới làm người nhận thay item cũ. Telegram vẫn yêu cầu link ACTIVE/opt-in; Web/native chỉ nhận user IDs đã kiểm lại.

- Queue kind `report|absence` dùng body cố định: “Có cập nhật học vụ trong ứng dụng Catevia. Vui lòng đăng nhập để xem.” Push title `Catevia`, URL `/`; new persisted message/recipient không chứa tên/điểm/phone. Recovery không gửi lại rendered PII cũ. Không suy rằng mọi context trong memory hay mọi message lịch sử đã được xóa PII.
- LOCKED/INACTIVE/FORCE_PASSWORD_CHANGE/deleted hoặc mất ownership bị ngừng item này. Đây là chính sách bảo thủ **ACTIVE-only** cho single-child channel, không sửa consent hoặc đồng nhất logout một phiên với khóa account.
- Legacy thiếu subject/targets hoặc không còn eligible owner → terminal `failed / ACADEMIC_RECIPIENT_NOT_AUTHORIZED`; không có usable link/push target → `failed / ACADEMIC_DELIVERY_TARGET_UNAVAILABLE`. Clear lease/backoff, không fallback global, không ghi sent giả, không retry chờ unlock. Provider transient failure vẫn retry theo ADR-102; không giữ DB transaction qua network.
- **Chưa đóng toàn bộ H7:** class reminders, parish/operational notices và batch absence summary kind `info` chưa áp dụng policy này. `/smart/absence` vẫn resolve học sinh từ phone theo contract cũ, chưa thay bằng required studentId public API; ambiguity của shared phone cần vòng riêng. H6 group binding chưa sửa. Các thay đổi sau DB check nhưng trước network vẫn có cửa sổ; generic body giảm lộ nội dung, không tạo atomicity với provider hay khả năng thu hồi tin đã giao.

**Evidence:** [academicNotificationAuthority.test.ts](../server/src/__tests__/academicNotificationAuthority.test.ts) có 13 cases: valid delivery, phone changed, locked/inactive/forced/deleted/wrong-role, missing subject, legacy global, missing link, valid/stale push, và enqueue subject/generic body. Dùng real queue/recovery/SQLite/recipient/link selection; chỉ sender mock. Các trường hợp cùng phone không retarget sang người không thuộc original targets. Không phải Telegram private/group dispatch E2E hoặc kiểm chứng native device thật.

### 15.5. Verification thực chạy

- Inverse suite mới [authHardeningTransactions.test.ts](../server/src/__tests__/authHardeningTransactions.test.ts): **26/26 PASS trong một lượt cuối, 19.75s**, kiểm cả tương tác fixture khi chạy chung. Bao gồm login/reset race, admin proof/lifecycle, daily/undo, ba profile cases, 10 exam cases và hai HTTP grade/attendance cases. Các subset cũng đã chạy trong quá trình sửa; không cộng số tests trùng nhau thành total mới.
- Auth/admin lifecycle regression ở bước H8: **8 files / 69 tests PASS, 49.61s** (gồm inverse subset lúc đó và user-management/users-routes/userDeletion/superadmin/admin-lock/backup-reauth/parent-provision).
- Exam/grade regression sau H3: **6 files / 80 tests PASS, 32.45s** (`examService`, `examLifecycleAudit`, `examMixedScoring`, `examResultUpsertRace`, `authAuditRemediation`, `gradeUndoImport`).
- Grade/attendance group: lượt đầu **31 pass / 10 fail**, hai fixture files seed teacher nhưng thiếu assignment nên fresh check từ chối đúng. Bổ sung assignment hợp lệ, không nới guard/assertions; hai files đó rerun **13/13 PASS, 10.66s**. Năm files còn lại đã pass, không rerun chỉ để cộng số.
- H7 queue/smart/inverse sau sửa propagation và fixtures: **3 files / 43 tests PASS, 13.02s**. Trước đó có lỗi implementation thiếu truyền studentId và fixture thiếu FK subject/class; đã sửa và rerun cả nhóm, không coi lỗi harness là production defect.
- Notification HTTP/Telegram compatibility sau cùng: **3 files / 24 tests PASS, 13.58s** (`notifications`, `telegramLinkService`, `services/telegram`).
- **Security-critical sau product changes: 7 files / 73 tests PASS, 32.00s.** `npm run build:server`, `npm run lint`, `npm run lint:architecture-inventory`, `git diff --check`: **PASS**; inventory 31 routes / 6 repositories / 48 services / 12 domain files / 57 tables.
- Một undo inverse fixture ban đầu đụng assignment trùng; tách teacher fixture, rerun **1/1 PASS, 7.79s**. Sandbox startup `spawn EPERM` đã vượt qua bằng môi trường cho phép child process. Không bỏ test fail để báo green.
- **Chưa chạy full coverage/full browser E2E/frontend build trong vòng này.** Source thay đổi ở server; evidence build/E2E §13 là lịch sử riêng. Local mock/provider tests không đóng production readiness, multi-replica soak hoặc browser/native session recovery.

### 15.6. Recovery và công việc tiếp theo

Không migrate schema, đọc secrets/live DB, đổi auth keys, thu hồi phiên production, purge queue/link/history hoặc deploy trong vòng này. Chặn stale command trả lỗi để client reconcile/đăng nhập lại; giữ durable offline mutations, không xóa queue để xử lý auth failure. Single-child item bị suppress không tự phát lại: nếu cần phát lại phải resolve owner mới và tạo thông báo mới có authority; không bulk reset status để bypass guard. Rollback worker cần giữ rows/lease metadata và tránh quay về sender gửi PII/global fallback cũ.

Thứ tự tiếp theo: **H6** private-only + sender-bound service/handler và read-only legacy binding preflight; **H8** các caller boolean còn lại + refresh final-read; **H7** reminder/operational audience và absence subject contract; **H2** typed/strict claims với fixed migration cutoff hoặc controlled re-login đã chốt ở release. Không tự chọn cutoff trượt hoặc bật strict enforcement mù khi chưa có rollout/recovery evidence. **U1–U6 giữ unknown/policy/evidence gates** như §14.7; không nâng local test PASS thành xác nhận production an toàn.

## 16. Single-parish deployment follow-up — tenant model được giữ làm safety boundary

### 16.1. Quyết định sau nghiên cứu

Yêu cầu vận hành hiện tại là một giáo xứ. Quyết định tốt nhất không phải xóa `parish_id`, mà là **one parish per production deployment** và giữ tenant-scoped persistence. Lý do đã verify từ current source: tenant identity đi xuyên JWT, composite keys/FKs, route/service predicates, backup và namespace Dexie/offline. Drop toàn bộ model sẽ tạo destructive migration + cache rewrite và làm yếu defense-in-depth, trong khi client hiện vốn không có parish picker. Shared multi-parish runtime lại giữ dư public/config/worker selection paths không phục vụ deployment thật. ADR-106 chốt topology này; ADR-046 multi-parish login rollout và phần production enumeration ADR-105 bị supersede, không xóa lịch sử.

### 16.2. Boundary thực thi

- Composition: [deploymentParish.ts](../server/src/utils/deploymentParish.ts) yêu cầu/validate `DEPLOYMENT_PARISH_ID` ở production, từ chối `PARISH_ID`/`SUPER_ADMIN_PARISH_ID` mâu thuẫn và cung cấp exact-scope guard. [index.ts](../server/src/index.ts) chạy configuration + database preflight trước HTTP/workers.
- Persistence: [deploymentParishHealth.ts](../server/src/db/deploymentParishHealth.ts) khám phá mọi table có `parish_id` từ `sqlite_master`, từ chối null/foreign scope trước seed và kiểm lại sau seed; không tự rewrite/purge và error không chứa row/PII. Schema/composite keys không đổi.
- Auth/public: [auth middleware](../server/src/middleware/auth.ts) bind issue/verify access+refresh token với deployment scope; [login](../server/src/routes/auth.ts) và [password reset request](../server/src/routes/passwordResetRequests.ts) bỏ quyền chọn tenant của legacy body; [public verification](../server/src/routes/verification.ts) trả generic false cho signed QR thuộc deployment khác.
- Infrastructure: [seed](../server/src/seed.ts) và [scheduled backup](../server/src/services/backupScheduler.ts) dùng cùng installation identity. [Sunday scheduler](../server/src/services/sundayReminderScheduler.ts) chỉ enumerate deployment parish và direct runner cũng bị guard. [notification queue](../server/src/services/notificationQueue.ts) chỉ recover/claim đúng scope; direct enqueue foreign parish bị từ chối.
- Client/offline không cần migration: authenticated response vẫn mang parish ID; encrypted cache và durable mutations tiếp tục scope `parishId:userId`. Dev/test không set env vẫn giữ multi-parish negative fixtures để tránh mất isolation regression.

### 16.3. Impact, recovery và unknown

Impact thực tế: client không thể dùng legacy payload để chuyển tenant; token/QR/worker alternate path của database khác không được process; cấu hình split-brain hoặc database mixed/null parish làm startup dừng trước traffic. Đây là fail-closed deployment safety, không phải bằng chứng rằng mọi object-level RBAC finding H2/H6/H7/H8 đã tự được giải quyết; một parish vẫn có nhiều lớp/trẻ/phụ huynh và các ownership guards tiếp tục bắt buộc.

Không có automatic migration. Trước rollout phải inventory read-only live DB, xác nhận exact parish slug rồi đặt env. Nếu preflight fail, operator phải backup/điều tra/migrate trên target riêng; không purge hoặc đổi scope để làm service start. **Production release SHA, live Turso row scopes, actual `gia-ton` mapping, startup latency và recovery drill vẫn UNKNOWN** vì vòng này không đọc credential/live DB hoặc deploy. Local source/config không được nâng thành production confirmation.

Repo cung cấp `npm run audit:deployment-parish`: command dùng `AUDIT_DATABASE_URL`/token read-only nếu được set, gọi cùng dynamic table preflight, hash target/parish reference mặc định và exit non-zero khi mismatch. Nó không import DB bootstrap, không migrate/seed/write; do không có live credential trong vòng này, command production chưa được chạy và unknown ở trên vẫn giữ nguyên.

Command đã được smoke trên database local mặc định và trả non-zero với đúng output redacted: chỉ báo `academic_years`, `branches`, `mapping_memory` có unexpected scope, không row/parish ID. Không có dữ liệu bị đổi. Kết quả này chứng minh failure path của CLI, **không** chứng minh live production mixed và không cho phép purge local data. Dev startup không set explicit scope vẫn giữ multi-parish fixture; hard gate chỉ bật ở production hoặc khi dev operator set `DEPLOYMENT_PARISH_ID`.

### 16.4. Verification

Test mới [singleParishDeployment.test.ts](../server/src/__tests__/singleParishDeployment.test.ts) kiểm missing/invalid/conflicting config, legacy login/reset selector, foreign token/QR, direct scope guard và isolated database preflight. Worker regression bổ sung exact deployment enumeration/recovery và foreign direct-call denial. Boundary/worker **3 files / 35 tests PASS**; schema/seed **3/14 PASS**; security-critical **7/73 PASS**; server typecheck, lint zero-warning, architecture inventory và diff check PASS.

Full serialized run đầu đạt **318/320 files, 2.217/2.219 tests PASS** trong 859,27s. Hai failure không phải tenant bypass: `concurrency.test` tạo hai `chunhiem` nhưng không tạo assignment lớp, còn `gradeLifecycleVerification` gọi hardened writer bằng admin ID không tồn tại. Fixtures được bổ sung current authority hợp lệ, production guard giữ nguyên; rerun đúng hai file **2/2, 8/8 PASS**. Không rerun 318 file đã pass để tô lại số. Production smoke/inventory vẫn là gate riêng.
