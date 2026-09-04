# Audit Architecture & Domain Design — Catevia/TNTTVN

> Snapshot gốc kiểm tra: `main@62e1199fff35c61e03f874e6e7ba132990891c69`<br>
> Remediation hiện tại: D1–D9 và các source-fix T1–T5/U1 đã được triển khai trong working tree ngày 2026-09-04; evidence mới được ghi ngay tại từng finding và §11.<br>
> Ngày audit: 2026-09-04<br>
> Phạm vi: current source, dependency flow, runtime composition, persistence/schema, client offline state, tests/CI và các tài liệu kiến trúc/nghiệp vụ có liên quan.<br>
> Ngoài phạm vi xác nhận: production telemetry, Turso/R2 credentials, restore drill thật, tải đồng thời thật và thiết bị mobile thật.

## 1. Kết luận điều hành

Catevia hiện là một **modular monolith có nền tảng vận hành tốt nhưng domain architecture chưa đồng đều**. Hệ thống không cần rewrite hay microservices. Các boundary quan trọng nhất — tenant/RBAC phía server, một số command transaction, exam finalization, migration startup, durable notification và offline ownership — đã có implementation và regression thực chất.

Audit gốc xác nhận bảy defect từ P1 đến P3. Cả bảy đã được remediated theo hướng incremental trong working tree hiện tại:

1. `finalizeYear` nay đặt guard, checklist, source/policy reads, promotion specification, snapshot writes, year lock và audit trong cùng transaction/executor.
2. Local backup đã bỏ raw main-file fallback; `VACUUM INTO` ghi vào unique partial artifact rồi publish bằng rename, failure không upload/retention/ghi marker.
3. Policy/date-range readers chỉ fallback cho missing/malformed business configuration; lỗi database/query propagate và làm operation fail closed.
4. Mọi grade policy-version attribution của base upsert/undo nằm trong đúng write transaction.
5. Reporting application service sở hữu authorization, policy và read snapshot; projection repositories không còn import service hoặc global DB.
6. Batch-promotion retry callback chỉ tạo transaction result; counters/response chỉ đổi sau wrapper resolve.
7. Composition root là nơi duy nhất sở hữu process signal; HTTP, schedulers, notification delivery, browser, Telegram và DB được đóng theo thứ tự có deadline.

Các defect D1–D7 của snapshot gốc không còn mở ở source hiện tại. Deep re-verification T1–T6/U1–U6 sau remediation phát hiện thêm hai defect P2 có consequence cụ thể: lifecycle promotion từng cho phép archive sau partial error mà không có durable reconciliation gate, và Sunday scheduler trong production topology một-process từng chỉ chọn `PARISH_ID || 'gia-ton'`. Cả hai đã được remediated trong working tree. Client `GradeAggregate` dead-but-bundled, sync import cycle và authorization/type dependency seams cũng đã được xử lý; Reporting projection thứ ba vẫn là documentation/product-scope drift cần quyết định sản phẩm, không phải lý do tự động xây thêm endpoint.

Đánh giá tổng thể:

- **Khả năng phát triển tiếp:** Có; toàn bộ D1–D9 đã được khóa bằng targeted remediation, không cần rewrite hoặc hạ tầng mới.
- **Rõ ràng bounded context:** Có ở mức product/domain vocabulary; chưa được phản ánh đồng đều bằng dependency rule thực thi.
- **An toàn tenant/RBAC:** Có cấu trúc tốt và nhiều negative tests; không thấy bằng chứng client state được dùng làm write authority.
- **Transaction design:** Tốt ở attendance, finance, promotion item, exam finalization, academic-year finalization, grade policy attribution và reporting snapshot; retry callback batch đã được làm side-effect-free ngoài DB.
- **DDD/CQRS:** Selective và thực dụng. Đây là điểm mạnh nếu tiếp tục dùng theo risk, không phải lý do để ép mọi service qua aggregate/repository.
- **Ưu tiên tiếp theo:** thực hiện credentialed restore drill; product owner quyết định T6/DR5. Full regression đã hoàn tất và không còn code defect mở từ D1–D9/T1–T5 trong phạm vi audit này.

## 2. Phương pháp và mức chứng cứ

Audit reconstruct observed architecture từ:

- composition root và route mounts;
- import/dependency edges thực tế;
- route → service/application service → domain/specification → repository → DB;
- schema, migration runner và transaction helper;
- Zustand/Dexie/sync engine;
- background workers và external adapters;
- targeted tests hiện tại;
- đối chiếu Architecture, ADR, Business Rules, API contract và CI.

Quy ước:

- **Verified**: chứng minh trực tiếp bằng current source và/hoặc test vừa chạy.
- **Conditional trigger**: defect nằm trong code path nhưng cần race/failure cụ thể để biểu hiện ngoài runtime.
- **Unknown**: repo không có đủ evidence để kết luận current production behavior.

Không dùng số dòng/file lớn, direct DB access, duplication hay khác textbook DDD làm defect nếu chưa có consequence cụ thể.

## 3. Kiến trúc thực tế được reconstruct

### 3.1 Runtime topology

Một Node process sở hữu:

1. Hono HTTP API;
2. DB bootstrap/migration/readiness/seed;
3. in-process notification worker;
4. Sunday reminder scheduler;
5. automatic backup scheduler;
6. import rollback cleanup;
7. Telegram integration và Puppeteer PDF browser lifecycle.

Composition path:

`server/src/index.ts:1-27` → middleware toàn cục `:65-77` → route mounts `:103-140` → database readiness + seed trước bind `:151-180` → worker startup `:232-238`.

Persistence là SQLite local hoặc Turso/libSQL qua Drizzle. Frontend React/Zustand dùng REST; một số store persist vào Dexie đã mã hóa và queue mutation offline theo owner.

### 3.2 Layer shape thực tế

Không có một layer model duy nhất áp cho mọi context. Có ba shape cùng tồn tại:

1. **Vertical slice mới hơn**<br>
   Route → Application Service → Domain Entity/Specification → Drizzle Repository → DB.<br>
   Ví dụ attendance: `routes/attendance.ts` → `AttendanceApplicationService.markAttendance` → `AttendanceRecord` + `SemesterLockSpecification` → `DrizzleAttendanceRepository` → transaction DB.

2. **Transaction script/service-rich slice**<br>
   Route → service function/class → Drizzle schema/DB trực tiếp.<br>
   Ví dụ imports, exams, users, classes, parish profile và một phần grades.

3. **Route-owned orchestration/read/operations**<br>
   Route dùng cả service và DB trực tiếp. Có 18/31 route modules import `db/index` hoặc `db/schema`; nhiều trường hợp là read query hoặc operational boundary, không tự thân là defect.

Inventory current source:

- 31 route modules có `new Hono`;
- 48 service modules (47 ở snapshot gốc; remediation T2 thêm `classAccessQueryService.ts`);
- 6 repositories;
- 12 server domain modules;
- 57 Drizzle `sqliteTable` declarations.

Các số này là scale signal, không phải architecture score.

### 3.3 Bounded contexts và ownership

Các context quan sát được:

- Identity & Access: auth, refresh session, user lifecycle, class assignment, parent recovery.
- Academic Core: students, classes, branches, academic years, semester locks.
- Attendance.
- Grades & Daily Assessment Ledger.
- Smart Exam/OMR & Question Bank.
- Promotion.
- Finance.
- Reporting projections.
- Parish Memory, parish events và notices.
- Communications: notification queue, web/native push, Telegram.
- Operations: import, backup/restore, purge, health/observability.

Domain ownership mạnh nhất hiện nằm ở các use case có application service + transaction rõ: attendance, grade override, promotion approval, finance command, exam finalization, question-bank batch import. Ownership mờ nhất nằm ở academic-year orchestration, reporting policy composition, process lifecycle và client sync trigger.

## 4. Verified architectural strengths

### S1 — Server vẫn là authority cho tenant, role và class scope

Evidence tiêu biểu:

- `server/src/routes/academicYears.ts:10-12,23-24,47-52` đặt auth + admin role trước lifecycle mutation.
- `server/src/routes/grades.ts:81-93` truyền class scope vào service; student/class/lock check chạy trong write transaction ở `server/src/services/gradeService.ts:116-170`.
- `server/src/services/AttendanceApplicationService.ts:64-100` kiểm student tenant, class scope và semester lock trong cùng transaction.
- `server/src/services/PromotionApplicationService.ts:200-219` chạy approve trong transaction và kiểm access qua executor đó.
- Client route/store marker không được dùng làm server write permission.

Impact: UI/Dexie stale state không tự mở được quyền ghi; cross-parish query luôn có `parishId` ở các critical paths đã kiểm.

### S2 — Selective DDD tạo giá trị ở các invariant có rủi ro

Domain entities/specifications không chỉ là folder trang trí:

- `AttendanceRecord` sở hữu transition/version của attendance.
- `GradeAggregate` và `ScoreFields` gom invariant override/source.
- `PromotionEligibilitySpecification` và `PromotionDecision` tách evaluation khỏi persistence.
- `SemesterLockSpecification` tái sử dụng server-side ở nhiều write path.

`server/src/__tests__/architectureBoundaries.test.ts:6-39` chặn runtime import từ domain sang middleware/services/repositories/db/schema. Targeted run hiện tại xác nhận gate này pass.

### S3 — Nhiều write boundary đã atomic và audit cùng domain write

- Attendance: row + redacted audit cùng transaction (`AttendanceApplicationService.ts:64-156`).
- Finance: validation, ledger/fee relation và audit dùng `runDbTransaction`; helper `createTransactionInTx` nhận transaction thay vì nested transaction (`FinanceApplicationService.ts:134-235`).
- Promotion từng student: snapshot + class move cùng transaction (`AcademicYearLifecycleService.ts:699-727`).
- Exam finalization: session/result/ledger/grade/receipt/audit cùng transaction (`examService.ts:913-1147`).

Đây là consistency boundary theo business operation, không đơn thuần theo table.

### S4 — Exam finalization remediation đã đóng root split ở client/server writer

Call path hiện tại:

`POST /api/exams/:id/complete` → `completeExamSession` → `finalizeExamSession` → one DB transaction → ledger + grade + receipt + session + audit.

Client `examStore.completeAndFinalize` queue completion barrier khi offline **hoặc khi còn pending result mutations, kể cả đang online**; chỉ gọi complete trực tiếp và project server receipt khi online và không còn pending acknowledgement. Callbacks local grade trong preview là no-op (`src/stores/examStore.ts:445-516`). Không còn client write grade lần hai sau server acknowledgement.

`examLifecycleAudit.test.ts:114-149` kiểm reopen → delete result → re-finalize loại ledger orphan. Đây là remediation giải quyết writer ownership, không chỉ di chuyển logic.

Giới hạn: `upsertGrade` bên trong flow vẫn có policy-version read không dùng transaction; xem D4.

### S5 — Offline queue có durable ownership và reconciliation bảo thủ

- Queue/conflict schema có `parishId + userId` compound indexes (`src/lib/db.ts:109-128`).
- Payload/store values mã hóa; persisted record key được namespace theo tenant/account qua `scopedStorageKey` và dùng scoped AAD (`src/lib/db.ts:155-195`). Đây là record-key namespacing, không phải một AES key riêng cho từng tenant.
- `addOp` ghi đè owner từ active scope và put/dedupe trong Dexie transaction (`src/stores/syncStore.ts:203-257`).
- Legacy row thiếu parish bị quarantine, không gán cho user mới (`syncStore.ts:121-143`).
- Sync auth guard + cross-tab lease + parent-before-dependent ordering + temp-ID remap được await (`useSyncEngine.ts:191-317`).
- Pull chỉ được coi thành công khi mọi projection fetch fulfilled (`useSyncEngine.ts:506-520`).

Complexity này bảo vệ data integrity/offline convergence và là **intentional complexity**, không nên “simplify” nếu chưa giữ đủ contract.

### S6 — Migration và startup fail closed

`server/src/db/index.ts:8-21` giữ thứ tự bootstrap → migration → defensive sync → indexes. `server/src/index.ts:151-170` chạy executable schema readiness và seed trước HTTP bind/worker.

Multi-statement migration đặt DDL/data + marker trong `BEGIN IMMEDIATE ... COMMIT` (`migrationRunner.ts:55-80`). Test thật với libSQL memory xác nhận partial DDL và marker rollback, foreign keys bật lại (`migrationRunner.test.ts:104-124`).

### S7 — Notification delivery có durable authority và lease

`enqueueNotification` chỉ acknowledgement sau INSERT (`notificationQueue.ts:129-187`); recovery không hardcode parish (`:77-126`); claim có status/attempt/lease predicates (`:211-232`); partial provider failure không đánh dấu sent (`:320-341`). At-least-once và duplicate risk được ghi nhận tường minh thay vì giả vờ exactly-once.

## 5. Verified architectural defects và remediation status

### D1 — P1 — REMEDIATED: `finalizeYear` không có transactionally consistent input snapshot

Defect trên base snapshot:

`POST /api/academic-years/:id/finalize` (`routes/academicYears.ts:47-62`)<br>
→ `AcademicYearLifecycleService.finalizeYear`<br>
→ global reads trước transaction → snapshot writes + year lock trong transaction. Khe check-then-write cho phép snapshot trộn nhiều thời điểm khi lock/policy/input đổi đồng thời.

Remediation hiện tại:

- `finalizeYear` mở `runDbTransaction` trước first guard/read (`AcademicYearLifecycleService.ts:389-410`);
- `getYearOrThrow` và completeness checklist nhận executor (`:217-263`), lock repository được gọi với `tx`;
- class/student/grade/override/attendance/date-range và cả bốn policy reads đều dùng `tx` (`:420-460`);
- `PromotionApplicationService.evaluateStudent(..., tx)` giữ semester-lock specification trên cùng snapshot (`:495-503`);
- year lock là compare-and-set `isLocked=0`, yêu cầu đúng một affected row trước audit (`:550-574`).

Regression `academicYearLifecycle.test.ts:162-185` spy global `db.select`, xác nhận finalize không gọi global read và mỗi evaluation nhận transaction executor. Existing happy path, incomplete guard và override parity vẫn pass. Runtime incidence của race cũ và credentialed Turso concurrency chưa có telemetry/drill; đây là residual evidence limit, không còn là dependency-path defect trong current implementation.

### D2 — P1 — REMEDIATED: Local backup có fallback không snapshot-safe nhưng vẫn trả success

Defect trên base snapshot: checkpoint và `VACUUM INTO` có thể cùng lỗi, sau đó code copy riêng main database file nhưng vẫn upload/retention và return `{ success: true }`. Với WAL còn committed pages, artifact đó không phải consistent SQLite backup.

Remediation hiện tại (`backupScheduler.ts:60-104`):

- `VACUUM INTO` ghi vào unique `.partial-<pid>-<uuid>` path;
- chỉ rename thành `.sqlite` sau khi snapshot hoàn tất;
- snapshot/rename failure xóa partial và return failure qua outer error boundary;
- upload và retention chỉ chạy sau publish thành công;
- `runAutoBackupCheck` chỉ ghi daily marker khi `success === true`;
- raw main-file copy fallback đã bị xóa. Checkpoint failure riêng lẻ vẫn có thể tiếp tục an toàn nếu `VACUUM INTO` thành công.

Regression `infrastructureAuditFixes.test.ts:37-91` mở artifact bằng `ATTACH`, chạy `PRAGMA integrity_check`, đồng thời inject cả checkpoint + `VACUUM INTO` failure và xác nhận: failure result, không marker, không `.sqlite` hoặc partial artifact.

Residual: disk-full/permission failure thật chưa được fault-inject ở OS level và production restore drill vẫn ngoài repo. Failure semantics hiện đúng: có thể miss một lịch backup nhưng không còn false-success artifact.

### D3 — P1 — REMEDIATED: Policy reader biến infrastructure failure thành business default

Defect trên base snapshot: `getSystemSettings` catch chung query + JSON parse rồi trả `{}`, còn `getCurrentPolicyVersionId` catch query rồi trả `null`. DB unavailable/schema/query failure vì vậy bị diễn giải như “chưa cấu hình”.

Remediation hiện tại:

- DB query nằm ngoài parse catch; mọi query failure propagate (`parishSettingsService.ts:25-44`);
- missing row, malformed JSON, non-object JSON và invalid individual fields vẫn dùng documented defaults;
- `getCurrentPolicyVersionId` chỉ trả `null` khi row/version thực sự vắng, không nuốt query error (`:49-62`);
- classification thresholds nhận executor như các policy readers khác (`:152-153`);
- `getAcademicYearDateRange` giữ calendar fallback khi row vắng nhưng không còn catch infrastructure failure (`academicYearService.ts:11-24`).

Regression `parishSettingsService.test.ts:19-78` khóa cả hai phía contract: absent/malformed configuration vẫn default, còn injected DB failure phải reject qua grade/attendance/promotion/classification/version/date-range readers. Promotion, reporting, grade và settings caller suites vẫn pass.

Residual: malformed business config vẫn default theo existing rule và chưa có operational alert riêng; remediation chỉ bảo đảm infrastructure failure không thể masquerade thành business default.

### D4 — P2 — REMEDIATED: Base grade policy-version attribution thoát write transaction

Defect trên base snapshot: `upsertGrade` dùng transaction cho grade/audit nhưng gọi policy-version bằng global DB; `undoGradeImport` đọc version trước transaction. Audit metadata vì vậy có thể thuộc snapshot khác với mutation.

Remediation hiện tại:

- `upsertGrade` truyền chính `tx` vào `getCurrentPolicyVersionId` trước mọi grade write;
- `undoGradeImport` chỉ đọc policy version sau access/lock/audit-window guards và bằng transaction executor của item;
- explicit override/restore tiếp tục dùng transaction như trước.

Regression trong `gradeService.test.ts` và `gradeUndoImport.test.ts` spy global `db.select` quanh hai operation, xác nhận không có query thoát executor. ADR-101 nay đúng với cả base upsert, undo và explicit override/restore.

### D5 — P2 — REMEDIATED: Reporting repository phụ thuộc ngược lên service và torn-read projection

Defect trên base snapshot:

`routes/reporting.ts` → `ReportingApplicationService` → projection repository → policy/date-range services → nhiều global DB reads. Repository vừa phụ thuộc ngược lên service vừa ghép report từ các thời điểm khác nhau.

Call path hiện tại:

`routes/reporting.ts` → `ReportingApplicationService` → `runDbTransaction` → authorization + academic-year range + parish policies → `ReportingProjectionContext{executor, policy snapshot}` → projection repository → DB.

Hai projection repositories đã bỏ runtime import từ services và bỏ global `db`; mọi query nhận cùng executor/context từ application service. Architecture gate mới fail nếu repository import service. Regression `ReportingProjection.test.ts` spy global `db.select` quanh application-service report và xác nhận toàn bộ authorization/policy/projection path nằm trong transaction snapshot.

Residual: transaction snapshot làm report nhất quán ở database boundary nhưng không tạo materialized read model; đây là chủ đích phù hợp scale hiện tại. Concurrent Turso workload/latency vẫn cần production evidence nếu muốn thay đổi chiến lược.

### D6 — P2 — REMEDIATED: Retryable batch-promotion callback mutate response ngoài transaction

Defect trên base snapshot: callback được `runDbTransaction` retry khi commit-time `SQLITE_BUSY`, nhưng callback đã push `results` và tăng counters. Một replay có thể trả duplicate item/count dù DB đúng.

Remediation hiện tại: callback chỉ return một `BatchItemResult`; `results` và counters chỉ được cập nhật sau transaction wrapper resolve. `BatchTransactionRunner` là injection seam hẹp để test retry semantics, không phải abstraction persistence mới.

Regression `BatchPromotionRetrySafety.test.ts` cố ý chạy callback hai lần như một commit-time replay, xác nhận domain operation chạy lại nhưng response vẫn đúng `total=1`, một result và một success. Existing partial-success, item rollback và atomic move tests vẫn pass.

### D7 — P3 — REMEDIATED: Process lifecycle ownership rò khỏi composition root

Defect trên base snapshot: reporting route đăng ký `SIGTERM/SIGINT`; root gọi `process.exit(0)` ngay trong `server.close` callback và không await Sunday scheduler, notification worker, Puppeteer hoặc Telegram.

Remediation hiện tại:

- route không còn đăng ký process signal hoặc import browser cleanup;
- composition root sở hữu idempotent shutdown promise và deadline 10 giây;
- root dừng producers, ngừng nhận HTTP và await active backup/Sunday runs, sau đó drain notification delivery, đóng browser/Telegram, checkpoint và đóng DB rồi mới exit;
- backup/Sunday stop APIs await active tick; notification stop hủy poll/retry wake-up và await active delivery.

Architecture regressions chặn `process.on` trong route và kiểm root sở hữu đủ stop calls, không còn `server.close(() => process.exit(...))`. Notification regression dùng deferred provider promise để chứng minh stop chưa resolve trước active delivery.

Residual: deadline vẫn có thể force-exit sau 10 giây; durable notification rows/leases là recovery boundary nếu external provider hoặc resource cleanup treo. Đây là bounded failure policy, không phải exactly-once guarantee.

### D8 — P2 — REMEDIATED: Durable promotion reconciliation và archive gate

Normative rule cố ý giữ partial success theo từng học sinh (`BUSINESS_RULES.md` §4.5; ADR-008). Mỗi `promotion_record` + class move đúng là atomic theo item. Defect nằm ở **batch recovery boundary**, không phải ở việc batch không all-or-nothing:

`AcademicYearPage.handlePromote` (`src/pages/AcademicYearPage.tsx:183-211`)<br>
→ `POST /api/academic-years/:id/promote`<br>
→ `AcademicYearLifecycleService.promoteYear` xử lý từng snapshot, bắt lỗi vào `summary.errors[]` (`:700-734`)<br>
→ vẫn chuyển year sang `PROMOTED` và chỉ persist aggregate `errorCount` trong audit JSON (`:737-754`)<br>
→ UI hiển thị lỗi trong result modal rồi refresh; không có durable worklist/status trên year<br>
→ `archiveYear` chỉ kiểm `status === 'PROMOTED'` (`:761-786`) nên Archive xuất hiện ngay (`AcademicYearPage.tsx:454-462`).

Lần gọi lại lifecycle promotion bị 409 vì year đã `PROMOTED` (`AcademicYearLifecycleService.ts:584-587`). Repo có batch-promotion endpoint và `PromotionPanel`, nhưng chúng không nhận/reconstruct danh sách lỗi lifecycle, không được liên kết từ result, và không bảo đảm xử lý được mọi snapshot `RETAINED`/failed trước archive. Test archive hiện chỉ chứng minh “promote xong thì archive được”; chưa có negative case “promotion còn lỗi thì archive bị chặn”.

Impact: sau khi modal đóng, một year có thể mang terminal-looking state và được archive trong khi một số snapshot chưa có active promotion record/class transition. Lỗi ban đầu không silent, nhưng trạng thái recovery không durable và không enforce được. Đây là failure-recovery defect P2.

Remediation hiện tại giữ nguyên partial success ADR-008 nhưng thêm đúng recovery boundary:

1. Migration `20260904-169` thêm nullable `academic_years.promotion_target_year_id`; lần promote đầu atomically chuyển `FINALIZED → PROMOTED` và persist target trước khi xử lý item.
2. `getPromotionReconciliation` derive tenant-scoped worklist từ snapshot thiếu active/latest promotion record; `GET /:id/promotion-reconciliation` cho phép reload trạng thái, không dùng audit JSON làm authority.
3. `POST /:id/promotion-retry` dùng đúng target đã persist, chỉ xử lý item unresolved và skip item đã resolve; mỗi student vẫn transaction riêng.
4. `archiveYear` đọc reconciliation trong transaction và trả 409 kèm details nếu còn unresolved; UI chỉ mở Archive khi count bằng 0 và có Retry action.
5. Regression fault-inject một item fail, chứng minh target/worklist durable, archive bị chặn, retry hội tụ và archive chỉ thành công sau khi worklist rỗng.

### D9 — P2 — REMEDIATED: Sunday scheduler explicit opt-in và multi-parish

Current deployment blueprint có **một** Render web service dùng Turso chung và không khai báo `PARISH_ID` (`render.yaml`). Trong khi đó scheduler đóng `const PARISH_ID = process.env.PARISH_ID || 'gia-ton'` lúc module load và toàn bộ setting/marker/send chỉ dùng đúng ID này (`sundayReminderScheduler.ts:10,37-62`). Notification recovery đã iterate mọi parish, nhưng producer Sunday reminder thì không.

Vì server/schema/authorization được thiết kế multi-tenant và không có one-parish-per-process deployment contract, đây là verified structural defect có conditional activation: production hiện chỉ có một parish thì chưa biểu hiện; parish thứ hai trong cùng DB/process sẽ không được scheduler xét. Test hiện chỉ cover `gia-ton`, còn set `process.env.PARISH_ID` trong `beforeAll` sau static import nên cũng không chứng minh env override behavior.

Remediation dùng `parish_system_settings` làm explicit control plane:

1. `sundayReminderEnabled` mặc định `false`, được validate/persist theo parish và có control admin tại Settings.
2. Tick enumerate chỉ parish opt-in, gọi exported `runSundayReminderForParish`, trả aggregate checked/sent/failed/failures và isolate exception từng parish.
3. Marker tiếp tục composite `(key, parishId)`; hai parish có giờ/marker độc lập.
4. `notifySundayMassReminder` không enqueue khi không resolve được parent targets; không còn global Telegram admin fallback. Explicit recipients được enqueue cho Telegram và Web/native trong đúng parish.
5. Regression cover opt-in default, hai parish, khác giờ, marker độc lập, per-parish failure isolation và audience no-target fail closed.

## 6. Intentional complexity

### I1 — Partial success theo item

Attendance/import/promotion dùng transaction theo item hoặc chunk để một row lỗi không rollback toàn batch. Đây là business rule ADR-008, không phải thiếu atomicity toàn batch. Với promotion year, từng snapshot + move là atomic (`AcademicYearLifecycleService.ts:699-727`), rồi year transition ghi error/warning count.

Partial success vẫn là intentional complexity; D8 đã bổ sung durable reconciliation/retry/archive gate mà không đổi transaction granularity theo item.

### I2 — Offline sync nhiều phase

Parent-before-dependent ordering, temp-ID mapping, exact owner, retry class, conflict policy, pull cursor và queue encryption tạo complexity nhưng mỗi phần bảo vệ một invariant cụ thể. Không nên thay bằng generic “cache then sync later” hoặc optimistic local success.

### I3 — At-least-once notification

Lease + durable intent là phù hợp modular monolith. ADR-102 xác nhận semantics **at-least-once per aggregate queue item**: crash sau provider accept/trước DB ack hoặc partial fan-out có thể làm người đã nhận nhận lại. Current schema chỉ có trạng thái queue item tổng hợp, không có per-recipient/provider receipt. Đây là intentional, documented residual risk; không còn xếp U5 là “unknown”. Không thêm event bus, external queue hay exactly-once ledger nếu product chưa xác nhận duplicate là unacceptable và provider chưa có idempotency/receipt contract phù hợp.

### I4 — Route direct DB ở operational boundaries

Backup/restore, health và một số read/diagnostic routes cần query hoặc streaming đặc thù. Direct DB chỉ là concern khi làm mất transaction/tenant/invariant ownership; không áp rule cấm tuyệt đối.

### I5 — Route mount ordering cho students/import

`server/src/index.ts:110-114` phải mount import static routes trước student `/:id`. Đây là coupling của router hiện tại nhưng đã có regression `students-import-routing.test.ts`. Nên giữ test; chưa cần router rewrite.

## 7. Transitional debt

### T1 — REMEDIATED: Domain policy contracts infrastructure-neutral

Trước remediation, architecture gate bỏ qua type-only import. Dependency chính xác theo từng file là:

- `server/src/domain/ports.ts:1,19-35` import `DbExecutor` từ DB;
- `SemesterLockSpecification.ts:1` import `DbExecutor` từ DB;
- `PromotionSpecifications.ts:2` import `DbExecutor` từ DB;
- `CanAccessStudentSpecification.ts:1-2,20` import cả `DbExecutor` từ DB và `JwtPayload` từ middleware.

Deep re-verification xác nhận coupling cũ **không tạo runtime cycle** và không làm mất transaction consistency; executor parameter từng là cách application service giữ policy read trong cùng transaction. Vì vậy remediation không thay type bằng `unknown`/generic repository mà chuyển binding executor ra adapter factory.

Remediation triển khai đúng hướng đã chọn:

- `types/actor.ts` định nghĩa `ActorContext` tối thiểu; `JwtPayload` chỉ là transport type extends context;
- `policyAdapters` tạo transaction-bound specifications bằng closures giữ `DbExecutor`; domain ports/specs không còn import/nhận DB executor;
- promotion/reporting/grade/attendance/daily-entry/exam critical paths tạo spec với active `tx`; tests chứng minh bound adapters đọc đúng dữ liệu authorization/lock trong transaction.

Architecture gate mới cấm cả type-only edge từ domain tới `db/` hoặc `middleware/`. Transaction consistency của D1/D3/D4 được giữ thay vì thay executor bằng `unknown`.

### T2 — REMEDIATED: Application authorization không phụ thuộc HTTP middleware

Runtime edge trước remediation được xác nhận:

- `PromotionApplicationService.ts:18,211-224` import và gọi `checkUserClassAccess` trong transaction;
- `ReportingApplicationService.ts:8,64-78` làm tương tự;
- `policyAdapters.ts:4,26-29` wrap chính helper middleware thành `ClassAccessPort`.

Các import `JwtPayload` khác ở `feedbackService`/`refreshSessionService` là type-only; chúng không thuộc runtime defect này. Consequence trước remediation là authorization query có implementation nằm trong HTTP middleware module, khiến application service không thể được architecture gate bảo vệ khỏi transport layer và phải mock/inject ở level không đồng đều.

Remediation đã extract `getUserClassIds/checkUserClassAccess` sang `classAccessQueryService.ts`, module biết Drizzle nhưng không biết Hono/JWT. Routes nhận compatibility re-export từ middleware; promotion/reporting/policy adapters import module mới trực tiếp và dùng `ActorContext`. Executable rule cấm service runtime-import middleware, chỉ allowlist `refreshSessionService` (token adapter) và `userService` (super-admin configuration). Backend authorization và tenant-scoped query vẫn là authority; không chuyển role check lên client.

### T3 — REMEDIATED: Sync coordinator/trigger tách khỏi React lifecycle

`useSyncEngine.ts` import student/grade/attendance/notice/class/exam stores (`:2-13`), trong khi `examStore`, `classStore`, `studentStore`, `noticeStore` import ngược `runSyncFlow` từ hook. Grade/attendance đã chuyển sang dynamic import để tránh cycle/test-router coupling, nhưng bốn store còn static edge.

Deep trace sửa một nuance cũ: `useSyncEngine` chỉ **dynamic-import** router ở unauthorized paths (`:270,389`), nên không thể nói mọi static store import luôn kéo router vào initial module graph. Consequence verified vẫn còn: bốn direct static cycles; grade/attendance dùng ad-hoc dynamic import chỉ để né cycle; store tests phải mock hook; một file React hook đồng thời export imperative runtime API cho stores và diagnostics.

Remediation behavior-preserving dùng hai seam:

1. `syncCoordinator` framework-neutral sở hữu `runSyncFlow/fetchAllData` và có thể import stores.
2. `syncTrigger` cực nhỏ không import store/hook, cho phép register runner + `requestSync()`; stores chỉ signal trigger. React hook đăng ký runner và chỉ sở hữu online/offline/timer/lifecycle. Diagnostics có thể gọi coordinator trực tiếp.

Durable queue, lease, owner scope, ordering, retry/conflict và pull cursor giữ nguyên. Bốn static và hai dynamic workaround đã migrate sang `syncTrigger`; diagnostics gọi coordinator trực tiếp. Architecture test cấm `stores/**` import `hooks/**`; targeted sync regression 8 files/60 tests pass.

### T4 — Responsibility concentration có change amplification cục bộ

Đếm lại current working tree theo **physical lines / nonblank lines**: `importService.ts` 1.907/1.728, `examService.ts` 1.460/1.347, `AcademicYearLifecycleService.ts` 911/835, `parishProfileService.ts` 751/705, `userService.ts` 668/597, `examStore.ts` 652/617, `FinanceApplicationService.ts` 620/570. Cả hai con số tự thân đều không phải defect.

Git history hiện có 305 commits trong cửa sổ 90 ngày (cũng gần như toàn lịch sử repo). Directional churn: import 13 commits/2.220 additions/313 deletions; exam 15/1.656/196; academic-year 4/981/71; user 7/990/322; examStore 10/704/52. Metric này bị ảnh hưởng bởi initial implementation và broad commits nên chỉ chứng minh các file là change hotspots, không phải SLO hay causal defect.

Kích thước không phải defect. Consequence quan sát được là:

- academic-year orchestration trộn preload/checklist/policy/evaluation/write nên transaction input bị lọt;
- exam service trộn CRUD, scoring, idempotency, finalization và ledger nhưng critical finalization vẫn có cohesive transaction + tests;
- import service chứa parse/dedupe/commit/rollback cleanup, làm thay đổi taxonomy/import có blast radius cao.

Disposition: **NO STANDALONE “SPLIT LARGE FILES” PROJECT**. Ưu tiên extraction chỉ khi đi cùng một change có oracle:

- academic-year: tách promotion reconciliation khi fix D8;
- sync: tách coordinator theo T3;
- import: tách validate/plan, commit và rollback cleanup khi chạm tiếp import, giữ `importPerformance` + rollback tests;
- exam: finalization hiện cohesive và có strong tests; chưa tách chỉ vì 1.460 LOC;
- parish profile/finance/user: nhiều use case nhưng transaction seams rõ; monitor, không refactor ngay.

### T5 — REMEDIATED: Client GradeAggregate dead path đã xóa

Deep re-verification nâng confidence từ “có dấu hiệu” thành **verified dead-but-bundled production path**:

- toàn repo production chỉ có `gradeStore` gọi `gradeAggregateAdapter`; không UI/hook/service nào gọi `gradeStore.overrideScore`, `restoreScore` hay adapter `getEffectiveView`;
- callers duy nhất là `GradeAggregateAdapter.test.ts`, `GradeAggregate.test.ts` và hai store tests;
- production build hiện chứa các literal riêng của path (`Invalid manual score`, `GradeOverrideCreated/Removed`, `AUTO_UPDATED_WHILE_OVERRIDDEN`) trong `dist/assets/gradeStore-MBTayA0J.js`, nên code không được tree-shake;
- nếu bị gọi, client aggregate chỉ tăng local version/tạo event in-memory rồi gọi generic grade upsert; nó không dùng server override/restore command và không sở hữu server audit/semester-lock/policy semantics.

Remediation đã xóa hai client domain files, `gradeStore.overrideScore/restoreScore`, các type chỉ phục vụ effective-view path và bốn tests chỉ bảo vệ API chết. Server `GradeAggregate`/`GradeApplicationService` vẫn là sole authority. Caller search không còn hit; frontend production build pass, các literal riêng đã biến mất và gradeStore chunk giảm từ khoảng 11,75 kB xuống 8,04 kB. Không repurpose nhánh client thành write authority.

### T6 — Reporting MVP contract chưa khép kín

Business Rules §3.2 gọi ba projections là “core MVP”, nhưng chính roadmap §3.3 chỉ nêu hai repositories và hai REST routes. Current server cũng chỉ có `ReportCardProjectionRepository`, `ClassSummaryProjectionRepository` và hai endpoints. Desktop/mobile Reports đang tính KPI học lực từ client Zustand; chúng không phải historical/server-authoritative `ParishSummaryProjection` về promotion distribution + attendance health.

Disposition: **RECLASSIFY AS DOCUMENTATION/PRODUCT-SCOPE DRIFT (DR5), không tự động code feature**. Nếu product xác nhận parish historical dashboard là current MVP, implement một server CQRS projection qua `ReportingApplicationService`, admin-only, cùng transaction/policy context và pagination/bounded year. Nếu chưa xác nhận, sửa Business Rules để Projection 3 là deferred candidate và giữ R2/R4 đúng hai projection hiện hữu. Không gọi client aggregate hiện tại là implementation của Projection 3.

## 8. Documentation drift

### DR1 — REMEDIATED: Inventory trong Architecture đã cũ

Base doc ghi 28 routes, 39 services, 51 tables trong khi snapshot audit có 31 Hono route modules, 47 service modules và 57 Drizzle table declarations. Working tree sau remediation T2 có 48 service modules do thêm `classAccessQueryService.ts`; `docs/02_ARCHITECTURE.md` hiện đã cập nhật đúng inventory/review date. Generated inventory vẫn là roadmap để ngăn drift tái diễn.

### DR2 — REMEDIATED: “Pure SQL read repositories” không đúng dependency graph

Normative rule được giữ thay vì hạ tài liệu: reporting repositories nay chỉ nhận executor + immutable policy/date-range context, không import services. Executable architecture gate đã được mở rộng để chặn edge repository → service.

### DR3 — REMEDIATED: ADR-101 policy read claim rộng hơn implementation

Base upsert và undo hiện truyền transaction executor cho policy-version read, khớp claim đã công bố cho toàn bộ grade write/audit path. ADR-104 ghi rõ remediation và regression evidence.

### DR4 — REMEDIATED: Backup docs không nói rõ unsafe fallback

Unsafe raw-copy success fallback đã bị xóa. Architecture/Deployment Guide/ADR-103 nay mô tả đúng partial `VACUUM INTO` → atomic rename và fail-closed marker/upload semantics.

### DR5 — OPEN: Reporting “3 core MVP projections” mâu thuẫn roadmap và implementation

`BUSINESS_RULES.md` §3.2 liệt kê `ParishSummaryProjection`, nhưng §3.3, ADR-010, repositories, routes và client contract chỉ đóng hai projection. Cần product owner chọn một trong hai truth: (a) projection thứ ba là requirement hiện tại và phải có acceptance/API contract; hoặc (b) là deferred candidate và phải bỏ nhãn core MVP. Cho tới khi chọn, không dùng câu §3.2 làm bằng chứng rằng runtime thiếu một defect.

## 9. Unknown / insufficient evidence

### U1 — CODE HARDENED / EXTERNAL UNKNOWN: Production restore và remote migration

Phần external vẫn **UNKNOWN**: chưa có credentialed Turso/R2 restore drill, remote migration execution, measured RPO/RTO hoặc evidence chuyển traffic sang target đã restore. Unit/local tests không chứng minh recovery production.

Deep source review đã tìm thấy các code-level pre-drill gaps trong `remoteBackup.ts` và `restoreRemoteBackup.ts`:

- target từng chỉ bị chặn khi URL trùng `TURSO_URL`; chưa có second explicit confirmation hoặc fresh/empty-target preflight;
- snapshot từng kiểm format/checksum/row width nhưng không chạy post-restore `foreign_key_check`;
- hàm từng trả counter attempted insert, không read-back per-table counts/critical schema readiness;
- post-commit validation không thể tự rollback target, nên runbook luôn phải restore vào isolated disposable target rồi promote/switch, không restore thẳng production.

Code-level hardening đã hoàn tất: CLI bắt buộc SHA-256 fingerprint của normalized target URL; restore kiểm đủ table, exact ordered columns và target rỗng trước write; sau commit read-back per-table counts, chạy `foreign_key_check`, rồi CLI chạy `assertDatabaseReady` và in machine-readable manifest. Unit integration cover success, non-empty target preservation và invalid FK detection. Phần còn lại vẫn là **EXTERNAL RELEASE GATE**: credentialed Turso/R2 drill trên target disposable, đo riêng download/decrypt/migrate/restore/verify và ghi recovery decision. Post-commit validation fail phải discard target; không tự đặt RTO/RPO.

### U2 — Runtime incidence của race

Historical production incidence của ba race cũ vẫn không thể suy ra từ repo. Tuy nhiên câu hỏi này **không còn chặn quyết định sửa**: D1/D5/D6 đã loại dependency path bằng same-executor snapshot, side-effect-free retry callback và CAS; full suite/targeted replay đã pass.

Disposition: **NO FURTHER CODE FIX BASED ONLY ON UNKNOWN INCIDENCE**. Evidence bổ sung đáng làm là two-connection local barrier test và credentialed Turso integration cho finalize/report snapshot, cộng low-cardinality counters cho CAS conflict/backup failure/retry exhaustion nếu ops cần. Không log student/parent payload. Telemetry dùng để định lượng residual contention, không quyết định có cho phép silent corruption hay không.

### U3 — Recovery workflow sau partial `promoteYear`

Deep trace đã đủ evidence để reclassify thành D8; remediation hiện đã persist target, expose durable reconciliation/retry và chặn archive. Warning policy PRM-F4 không đổi.

### U4 — Multi-tenant topology của Sunday scheduler

Deep trace đã đủ evidence để reclassify thành D9; remediation hiện enumerate `parish_system_settings` explicit opt-in, marker/audience tenant-scoped và failure isolated. `PARISH_ID` không còn là scheduler authority.

### U5 — Exactly-once provider delivery

Không còn là Unknown. ADR-102 và code xác nhận at-least-once aggregate semantics cùng duplicate window; đây là **Intentional complexity / accepted residual risk I3**. Chỉ reopen nếu product xác nhận duplicate theo notification kind là unacceptable hoặc field metrics cho thấy impact; khi đó đánh giá per-recipient receipts/provider idempotency trước external broker.

### U6 — Performance và maintainability SLO

Không có field SLO cho reporting latency, sync convergence, change lead time hay defect density. Có một executable **lab regression budget**, không phải full SLO: `importPerformance.test.ts` yêu cầu 120 create-only rows trên local test DB dưới 2.000 ms. Re-run 2026-09-04 đạt **119,9 ms** cho measured operation (test case 125 ms; whole Vitest run 6,47 s). Scope là synthetic/local/warm process; không được suy ra Turso/network/user latency hoặc 2.000-row behavior.

Decision Matrix record:

- Record type: `METRIC_TARGET`; obligation: `OPTIMIZATION_TARGET` enforced trong CI; authority: current executable regression guard nhưng product owner/field SLO `UNKNOWN`.
- Target: `< 2.000 ms`; actual: `119,9 ms`; scope: 120 create-only rows, local libSQL, synthetic data, một run; measurement mode: LAB/SYNTHETIC.
- Decision consequence: giữ test như regression guard, không dùng nó để biện minh thêm abstraction hoặc tuyên bố production performance.

Disposition: **DO NOT INVENT SLO / DO NOT SPLIT BY LOC**. Trước materialized reporting, workerization hoặc service split, đo field p95 theo endpoint + dataset/tenant size và Turso concurrency. Với maintainability, dùng change evidence cụ thể (files/modules/tests phải đổi cho một use case, escaped transaction bugs, review ownership), không đặt LOC threshold làm acceptance gate.

## 10. Risk-prioritized incremental roadmap

### P0/P1 — Khóa consistency và recovery boundary trước feature expansion

1. **COMPLETED — Finalize year:** toàn bộ guard/read/policy/evaluation/snapshot/write/audit đã nằm trong một `runDbTransaction`; `tx` được truyền qua year/checklist/date-range/policy/specification. Có executor-identity regression và compare-and-set year lock. Cross-connection barrier test trên Turso thật vẫn là external evidence bổ sung, không phải dependency gap còn mở.
2. **COMPLETED — Policy reads:** missing/malformed business configuration vẫn fallback; DB/query exception nay throw cho write/decision path. `getParishClassificationThresholds` và date-range path nhận executor, có injected-failure regression.
3. **COMPLETED — Grade policy version:** base upsert và undo cùng explicit override/restore đều resolve policy version qua write transaction executor; executor-identity regressions pass.
4. **COMPLETED — Local backup:** đã xóa raw main-file copy fallback; `VACUUM INTO` failure return false, xóa partial và không upload/rotate/ghi marker. Happy artifact được `PRAGMA integrity_check`; forced checkpoint + snapshot failure được regression test.
5. **COMPLETED — Batch retry:** transaction callback chỉ return result; `results/counters` đổi sau wrapper resolve. Replay injection chạy callback hai lần và vẫn trả đúng một result/count.

### P2 — Recovery và tenant coverage

1. **COMPLETED — D8 Promotion reconciliation:** durable worklist/retry, persisted target và archive gate đã triển khai, giữ per-item transaction/partial success.
2. **COMPLETED — D9 Multi-parish Sunday scheduler:** explicit parish opt-in, per-parish runner/marker/audience và failure isolation đã triển khai.
3. **CODE COMPLETED / EXTERNAL OPEN — U1 Restore:** fingerprint, empty/schema preflight, row-count/FK/schema verification và manifest đã triển khai. Còn credentialed Turso/R2 drill và đo recovery phases; không tự đặt RTO/RPO.
4. **U2 — Evidence bổ sung, không phải blocker:** chỉ thêm two-connection/local hoặc Turso integration barrier và low-cardinality contention metrics nếu cần định lượng residual risk. Không mở thêm refactor chỉ vì historical incidence chưa biết.
5. **Architecture checks:** sau mỗi extraction, thêm rule hẹp tương ứng: store không import hook; application service không runtime-import middleware; retry callback critical không mutate state ngoài transaction.

### P3 — Thu hẹp transitional coupling theo seam có oracle

1. **COMPLETED — T3 Sync trigger/coordinator:** two-seam architecture đã triển khai; store→hook edge bị architecture gate cấm, offline contracts giữ nguyên.
2. **COMPLETED — T5 Client GradeAggregate:** dead aggregate/adapter/store API/types/tests đã xóa; bundle/caller gate pass, server vẫn sole authority.
3. **COMPLETED — T2/T1 Authorization/type boundary:** class-access query tách khỏi middleware, ActorContext transport-neutral, policy ports bind active transaction executor và domain không còn DB/JWT import.
4. **T6/DR5 — Product decision trước code:** hoặc xác nhận `ParishSummaryProjection` là current MVP với API/acceptance rõ, hoặc sửa Business Rules thành deferred candidate. Chỉ implement projection khi nhánh đầu được owner xác nhận.
5. **T4 — Extract on touch:** tách academic reconciliation cùng D8, sync seam cùng T3, import validate/plan/commit/rollback khi có change liên quan. Không mở project “split large files”; exam finalization và các service còn lại tiếp tục monitor bằng change evidence.
6. **Generated inventory:** sinh đếm mounted routes/services/repos/tables để Architecture không tiếp tục drift theo số hardcode.

### Không đề xuất hiện tại

- microservices;
- database-per-context;
- generic repository cho mọi table;
- event bus/outbox cho mọi mutation;
- full DDD rewrite;
- tách frontend/backend repo;
- thay toàn bộ Zustand/Dexie sync bằng framework khác.
- exactly-once notification ledger/broker khi duplicate vẫn là accepted risk U5;
- field SLO hoặc LOC threshold tự đặt để ép refactor U6.

Không có evidence hiện tại rằng các thay đổi đó giải quyết rủi ro ưu tiên tốt hơn việc siết transaction/executor/lifecycle boundary.

## 11. Verification thực tế đã chạy

Lệnh:

```text
npm run test -- server/src/__tests__/architectureBoundaries.test.ts server/src/__tests__/services/academicYearLifecycle.test.ts server/src/__tests__/services/BatchPromotionService.test.ts server/src/__tests__/services/promotionConcurrency.test.ts server/src/__tests__/examLifecycleAudit.test.ts server/src/__tests__/migrationRunner.test.ts server/src/__tests__/services/notificationQueue.test.ts server/src/__tests__/financeFeeLifecycle.test.ts src/__tests__/syncTenantOwnership.test.ts --fileParallelism=false
```

Kết quả re-verification trên cùng snapshot: **9/9 test files, 61/61 tests PASS**, 27.60 giây.

Remediation D1–D3 sau audit:

```text
npm run test -- server/src/__tests__/services/academicYearLifecycle.test.ts server/src/__tests__/services/parishSettingsService.test.ts server/src/__tests__/services/PromotionService.test.ts server/src/__tests__/services/promotionConcurrency.test.ts server/src/__tests__/promotionPath.test.ts server/src/__tests__/routes/promotionRoutes.test.ts server/src/__tests__/services/gradeService.test.ts server/src/__tests__/services/gradeOverrideService.test.ts server/src/__tests__/services/gradeUndoImport.test.ts server/src/__tests__/gradeAuditSync.test.ts server/src/__tests__/routes/reportingRoutes.test.ts server/src/__tests__/settings-route.test.ts server/src/__tests__/infrastructure/infrastructureAuditFixes.test.ts server/src/__tests__/infrastructure/remoteBackup.test.ts --fileParallelism=false
npm run build:server
```

Kết quả: **14/14 files, 80/80 tests PASS**; server TypeScript build PASS. Targeted lõi riêng trước đó cũng pass 3/3 files, 20/20 tests. Regression mới phủ executor identity D1, failure injection/default separation D3, SQLite integrity + no-artifact/no-marker failure path D2.

Lần chạy trong sandbox đầu tiên không load được Vite config do Windows `spawn EPERM`; chạy lại ngoài sandbox với cùng command pass. Không có product-test failure.

Remediation D4–D7 targeted gate:

```text
npm run test -- server/src/__tests__/services/gradeService.test.ts server/src/__tests__/services/gradeUndoImport.test.ts server/src/__tests__/services/ReportingProjection.test.ts server/src/__tests__/services/BatchPromotionRetrySafety.test.ts server/src/__tests__/services/BatchPromotionService.test.ts server/src/__tests__/services/notificationQueue.test.ts server/src/__tests__/services/sundayReminderScheduler.test.ts server/src/__tests__/architectureBoundaries.test.ts server/src/__tests__/infrastructure/infrastructureAuditFixes.test.ts --fileParallelism=false
```

Kết quả: **9/9 files, 59/59 tests PASS**. Regression phủ grade transaction executor, reporting snapshot/dependency direction, callback replay và notification shutdown drain. Regression mở rộng reporting/PDF/grade-audit bổ sung: **6/6 files, 26/26 tests PASS**.

Final quality gate trên working tree D1–D7:

```text
npm run lint
npm run build:server
npm run test -- --fileParallelism=false --reporter=verbose
```

Kết quả: lint zero-warning PASS; server TypeScript build PASS; full Vitest **315/315 files, 2.141/2.141 tests PASS**, 865,87 giây. Suite có các stderr/warning dự kiến từ negative-path/fault-injection và React/jsdom warnings hiện hữu, nhưng không có failed test hoặc unhandled-test summary.

Một full-suite checkpoint trước khi scope được mở rộng sang D4–D7 đã bị dừng thủ công sau hơn 12 phút vì reporter mặc định không phát progress; không có assertion failure được ghi ở lượt đó. Final verbose run nêu trên là acceptance evidence hoàn chỉnh, không dùng checkpoint bị dừng làm bằng chứng pass/fail.

Deep re-verification T1–T6/U1–U6:

```text
npm run test -- server/src/__tests__/services/importPerformance.test.ts --fileParallelism=false
```

Kết quả: **1/1 file, 2/2 tests PASS**; measured import operation 120 create-only rows trên local libSQL là **119,9 ms** (test case 125 ms; whole Vitest invocation 6,47 giây). Đây chỉ là LAB/SYNTHETIC regression evidence. Dependency/caller/build-artifact, deployment topology, restore path và git-churn conclusions trong §7–§9 được kiểm bằng current source/import graph, `render.yaml`, built `dist` chunk và repository history; không dùng chúng làm production telemetry. Lượt sandbox đầu gặp Windows `spawn EPERM` khi Vite load; retry cùng command ngoài sandbox pass.

Final quality gate cho complete remediation D1–D9/T1–T5/U1:

```text
npm run lint
npm run build:server
npm run build:frontend
npm run test -- --fileParallelism=false --reporter=verbose
```

Kết quả: lint zero-warning PASS; server và frontend production builds PASS; full serialized Vitest **313/313 files, 2.138/2.138 tests PASS**, 823,00 giây. Hai test file client GradeAggregate bị xóa cùng dead production API nên tổng file/test thấp hơn checkpoint D1–D7; đây không phải test skip. Suite có stderr/warning dự kiến từ negative-path/fault-injection và React/jsdom hiện hữu, nhưng exit code 0, không có failed test hoặc unhandled-test summary. Credentialed Turso/R2 restore drill, production scheduler soak và recovery RPO/RTO vẫn chưa được kiểm chứng bởi local suite.

## 12. File/change hygiene

Remediation sửa các service/repository/composition-root/client sync/UI/tests cho D1–D9, T1–T3, T5 và phần code của U1; đồng bộ Architecture, Business Rules, Deployment Guide, ADR-103/104/105 cùng file audit này. T4 được giữ ở trạng thái intentional concentration/extract-on-touch; T6/DR5 cần product decision; U2/U5/U6 vẫn là evidence gate hoặc câu hỏi kiến trúc, không được trình bày như source defect đã sửa. Không sửa file đang dirty của người dùng: `docs/mobile-native-ui-audit-2026-08-12.md`; không chạm `docs/authentication-authorization-rbac-audit-2026-09-04.md`.
