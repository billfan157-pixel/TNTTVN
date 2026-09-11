# Đích kiến trúc cơ cấu tổ chức và thẩm quyền Operations

> **Thay đổi được duyệt 2026-09-10:** Admin có quyền quản trị toàn giáo xứ cả
> production, bao gồm tự tạo/sửa nhiệm kỳ, phân công và công khai sự kiện.
> Thay thế mọi mô tả read-only production/cấm tự bổ nhiệm/override chỉ dev-test
> trong phiên bản trước bên dưới. Không bỏ reauth, lý do, audit, tenant isolation,
> OCC, idempotency, separation of duty và các kiểm tra toàn vẹn dữ liệu.
> Gate B cập nhật đã qua 3 suites / 70 tests, server build và lint phạm vi sửa.

**Trạng thái:** `IMPLEMENTED TARGET — Gate B và focused regression đã đạt ngày 2026-09-10; dữ liệu local cần reconcile; production rollout chưa xác nhận.`

**Phạm vi phê duyệt:** Cơ cấu tổ chức, nguồn authority, phạm vi giao việc và vai trò vận hành cho Operations.

**Quan hệ với hiện trạng:** Các rule trong tài liệu này đã được đồng bộ vào runtime và contract ở Gate B. Mục 12 phân biệt phần đã chứng minh trong repository với các gate triển khai ngoài môi trường local.

## 1. Mục tiêu và ranh giới

Đích kiến trúc phải bảo đảm:

- đúng cơ cấu vận hành địa phương của Xứ đoàn;
- `Account Role ≠ Organizational Position ≠ Operational Role`;
- Trưởng Xứ đoàn có quyền toàn Xứ đoàn;
- Trưởng ngành và Trưởng ban là hai thẩm quyền ngang cấp, mỗi người chỉ quản lý đơn vị mình;
- quyền được quyết định phía server theo giáo xứ, đơn vị và tài nguyên;
- người được giao chỉ nhận quyền tác nghiệp trên tài nguyên sau khi chấp nhận phân công;
- không mở rộng sang IAM toàn app, tài chính, workflow engine hoặc cơ chế mượn quân khi chưa có nhu cầu được chứng minh.

Đây là policy tổ chức địa phương được cấu hình trong Catevia, có tham chiếu cơ cấu TNTTVN nhưng không tuyên bố mọi chi tiết là mô hình bắt buộc cho tất cả Xứ đoàn.

## 2. Mô hình ba tầng

### 2.1. Account Role — loại tài khoản và baseline truy cập

`users.role` tiếp tục dùng enum hiện hành:

```text
admin | chunhiem | phuta | phuhuynh
```

Trong Operations:

- `chunhiem` và `phuta` chỉ chứng minh tài khoản thuộc nhóm nhân sự có thể tham gia Operations;
- `admin` là quản trị viên kỹ thuật; được xem Operations và audit toàn giáo xứ để hỗ trợ, nhưng không mặc nhiên có quyền tạo, giao, thực hiện, phê duyệt, chuyển/hủy hoặc công khai công việc;
- `phuhuynh` không phải nhân sự Operations và không được nhận task nội bộ;
- `users.role` không xác định người thuộc Ngành/Ban nào và không cấp thẩm quyền tổ chức.

Không đổi `chunhiem/phuta` thành `mainstaff/supportstaff`. Nếu sau này hợp nhất thành `ADMIN|STAFF|PARENT`, đó phải là dự án IAM/Academic riêng với migration và compatibility plan riêng.

### 2.2. Organizational Position — chức vụ và phạm vi tổ chức

Nguồn dữ liệu:

- `parish_people`: danh tính nhân sự trong hồ sơ Xứ đoàn;
- `parish_organization_units`: cây đơn vị tổ chức;
- active `parish_service_terms`: tư cách thành viên, chức vụ, đơn vị và thời hạn nhiệm kỳ;
- `position_code`: chỉ cấp authority cho các chức vụ được hệ thống hiểu;
- `position_title`: tên hiển thị, không tự cấp quyền.

Service term không mang ba authority code chỉ xác định membership và phạm vi có
thể được phân công; nó không tự cấp quyền xem/bình luận Operations. Người đó chỉ
thấy tài nguyên sau khi nhận role event/workstream/task phù hợp.

Ba authority code của Operations:

```text
PARISH_LEADER
BRANCH_LEADER
COMMITTEE_LEADER
```

`catechist_assignments.role_in_class` tiếp tục là nguồn vai trò học vụ theo lớp. Nó không tự cấp quyền Operations và không thay thế membership trong `parish_service_terms`.

### 2.3. Operational Role — quyền trên tài nguyên cụ thể

Nguồn dữ liệu:

- Event Organizer trên một event;
- Workstream Lead hoặc membership trên một workstream;
- `OWNER|CONTRIBUTOR|APPROVER|OBSERVER` trên một task.

Operational role không biến thành chức vụ tổ chức và không mở rộng sang event/workstream/task khác.

## 3. Cơ cấu tổ chức địa phương

```text
Cha Tuyên úy / Quản xứ
  └─ thẩm quyền mục vụ; chưa tự động có app capability

Ban Điều hành — một BOARD active
  ├─ Trưởng Xứ đoàn
  ├─ Phó 1
  ├─ Phó 2
  ├─ Thư ký
  ├─ Thủ quỹ
  └─ Ủy viên

Dưới BOARD là hai loại đơn vị ngang cấp
  ├─ Ngành — BRANCH
  │   ├─ Trưởng ngành
  │   └─ Chi đoàn/lớp và thành viên trong Ngành
  └─ Ban chuyên môn — COMMITTEE
      ├─ Trưởng ban
      ├─ Phó ban
      └─ thành viên trong Ban
```

Nguyên tắc cơ cấu:

- Trưởng ngành phụ trách công tác giáo lý và nhân sự trong Ngành.
- Trưởng ban phụ trách công tác chuyên môn của Ban.
- Trưởng ngành không cao hơn Trưởng ban và Trưởng ban không cao hơn Trưởng ngành.
- Một người có thể đồng thời giữ nhiều nhiệm kỳ, kể cả thành viên Ban Điều hành kiêm Trưởng ngành hoặc Trưởng ban.
- Quyền kiêm nhiệm là hợp của từng capability, nhưng mỗi quyết định vẫn phải khớp đúng scope tài nguyên.
- Membership Ban Điều hành không làm Trưởng ngành/Trưởng ban trở thành cấp dưới có thể bị mọi thành viên Ban Điều hành giao việc. Chỉ Trưởng Xứ đoàn có quyền toàn Xứ đoàn.

## 4. Membership và phạm vi “thuộc Ngành/Ban”

Một người là target hợp lệ để được giao việc trong một đơn vị khi đồng thời thỏa mãn:

1. cùng `parish_id` với actor và resource;
2. `parish_people` đang `ACTIVE`, không bị xóa;
3. nếu có linked account thì account đang hoạt động và không phải `phuhuynh`;
4. có `parish_service_term` đang hiệu lực tại đúng unit hoặc một descendant của unit đó;
5. task/workstream/event cũng thuộc đúng organization scope;
6. actor có capability giao vai trò đó trong scope tương ứng.

Person chưa liên kết account chỉ có thể xuất hiện ở trạng thái lập kế hoạch (`PLANNING_ONLY`). Họ chưa có digital authority, không thể chấp nhận/thực hiện/phê duyệt và không nhận push cho đến khi được liên kết với một account nhân sự đang hoạt động.

Ngày hiệu lực nhiệm kỳ dùng ngày dân sự theo `PARISH_TIME_ZONE`; `end_date` có hiệu lực đến hết ngày được ghi.

Ví dụ:

- GLV có `users.role=chunhiem` và term trong Ngành Thiếu có thể được Trưởng ngành Thiếu phân công.
- GLV có `users.role=phuta` và term trong Ngành Thiếu cũng là target hợp lệ như nhau.
- `chunhiem` thuộc Ngành Ấu không thể bị Trưởng ngành Thiếu phân công chỉ vì cùng account role.
- Một Trưởng ban đồng thời có term trong Ngành Thiếu có thể nhận việc của Trưởng ngành Thiếu.
- Một Trưởng ngành đồng thời có term trong Ban Truyền thông có thể nhận việc của Trưởng ban Truyền thông.

Thiếu membership rõ ràng phải fail closed. Không suy ra “thuộc Ngành” chỉ từ `users.role` hoặc tên chức vụ tự do.

## 5. Thẩm quyền tổ chức

### 5.1. Trưởng Xứ đoàn

Phạm vi: toàn Xứ đoàn.

Được phép:

- tạo và quản lý event/workstream/task ở mọi unit;
- giao việc cho mọi nhân sự hợp lệ trong giáo xứ;
- chỉ định hoặc thay Event Organizer và Workstream Lead;
- chuyển trạng thái, hủy và override readiness theo policy vòng đời;
- xem audit Operations;
- bật hoặc tắt `PUBLIC_SUMMARY` cho event.

Trưởng Xứ đoàn có thể ủy nhiệm tác nghiệp bằng operational role trên tài nguyên cụ thể. Việc đó không biến người được ủy nhiệm thành Trưởng Xứ đoàn.

### 5.2. Trưởng ngành

Phạm vi: Ngành mình và các unit con.

Được phép:

- tạo event/workstream/task trong scope Ngành;
- quản lý tài nguyên do Ngành sở hữu;
- chỉ định Organizer/Lead và giao task cho target có active membership trong scope Ngành;
- quản lý tiến độ và readiness trong scope được phép.

Không được phép:

- giao việc cho người chỉ thuộc Ngành khác hoặc Ban khác;
- quản lý tài nguyên của Ban chuyên môn chỉ vì là Trưởng ngành;
- tự bật event thành `PUBLIC_SUMMARY`;
- có quyền toàn Xứ đoàn.

### 5.3. Trưởng ban chuyên môn

Phạm vi: Ban mình và các unit con.

Được phép tương đương Trưởng ngành trong scope Ban:

- tạo event/workstream/task;
- quản lý tài nguyên do Ban sở hữu;
- chỉ định Organizer/Lead và giao task cho target có active membership trong scope Ban;
- quản lý tiến độ và readiness trong scope được phép.

Không được phép giao việc hoặc quản lý ngoài scope Ban, không tự công khai event và không có quyền toàn Xứ đoàn.

### 5.4. Các chức danh không tự sinh quyền Operations

Các chức danh sau không có Operations authority chỉ từ membership hoặc `position_title`:

- Phó 1;
- Phó 2;
- Thư ký;
- Thủ quỹ;
- Ủy viên;
- Phó ban hoặc Phó ngành;
- Cha Tuyên úy/Quản xứ trong giai đoạn hiện tại.

Họ chỉ có quyền Operations khi:

- có thêm một active term mang `PARISH_LEADER|BRANCH_LEADER|COMMITTEE_LEADER`; hoặc
- được giao operational role trên event/workstream/task cụ thể.

Không có cơ chế Acting Parish Leader hoặc delegation toàn cục trong phạm vi đã duyệt.

### 5.5. Technical admin

Technical admin quản trị account, cấu hình và organization registry qua route riêng.

- Chỉ nhận capability đọc Operations/audit toàn giáo xứ từ `users.role=admin` để hỗ trợ và điều tra sự cố.
- Không nhận mutation capability tạo, giao, thực hiện, phê duyệt, chuyển/hủy hoặc public publish chỉ vì là admin.
- Không được tự cấp thẩm quyền tổ chức cho mình.
- Mutation cấp/sửa/thu hồi authority-bearing service term phải có tái xác thực, lý do và audit.
- Việc ghi nhận/bãi nhiệm Trưởng Xứ đoàn phải dựa trên quyết định quản trị ngoài hệ thống; technical admin chỉ là người nhập liệu/custodian.
- Quy trình bootstrap hoặc thay Trưởng Xứ đoàn phải được triển khai fail-closed ở Gate B, không dùng quyền Operations mặc định của admin làm đường vòng.

#### Ngoại lệ chuyển tiếp trong giai đoạn xây dựng và test

Runtime hiện tại vẫn cho `admin` toàn bộ quyền Operations để xây dựng tính năng, tạo fixture và kiểm thử các workflow chưa có đủ dữ liệu tổ chức. Đây là `TRANSITIONAL CURRENT-STATE EXCEPTION`, được chấp nhận tạm thời và không làm thay đổi target production ở trên.

- Không loại quyền này đột ngột khi chưa có fixture/seed cho Trưởng Xứ đoàn, Trưởng ngành, Trưởng ban và các membership cần thiết.
- Gate B phải bổ sung dữ liệu test và negative authorization tests trước khi thu hẹp admin.
- Override mặc định bật trong development/test để giữ luồng xây dựng hiện tại; entrypoint dev đặt rõ `NODE_ENV=development`, có thể tắt bằng `OPERATIONS_ADMIN_MUTATION_OVERRIDE=false`. Runtime thiếu marker môi trường bị deny và production không thể bật override.
- Không dùng admin override để chứng minh rằng organizational RBAC đã hoạt động đúng.

## 6. Thẩm quyền vận hành

### 6.1. Event Organizer

Organizer do Trưởng Xứ đoàn hoặc leader có authority trong organization scope chỉ định; người tạo event không mặc nhiên phải giữ vai trò này.

Organizer được:

- quản lý nội dung và tiến độ event đã được giao;
- tạo/quản lý workstream và task trong event theo capability;
- chỉ định Workstream Lead và phân công người hợp lệ trong organization scope của event;
- xem readiness và xử lý các blocker vận hành trong phạm vi được giao.

Organizer không được:

- thay đổi `scope_unit_id`;
- bật/tắt public visibility;
- kéo người ngoài organization scope;
- dùng vai trò này để quản lý event khác.

### 6.2. Workstream Lead

Workstream Lead được:

- quản lý workstream được giao;
- tạo/quản lý task trong workstream;
- giao OWNER/CONTRIBUTOR/APPROVER/OBSERVER cho target hợp lệ trong resource scope;
- đánh dấu readiness của workstream theo rule.

Workstream Lead không được thay scope, chuyển/hủy toàn event hoặc quản lý workstream khác.

### 6.3. Task roles

- `OWNER`: chịu trách nhiệm chính; execute sau `ACCEPTED`.
- `CONTRIBUTOR`: cùng thực hiện; execute sau `ACCEPTED`.
- `APPROVER`: approve/reject sau `ACCEPTED`.
- `OBSERVER`: xem và bình luận; không execute, approve hoặc manage.

Một task chỉ có một OWNER active. Người được giao không tự chuyển giao quyền cho người khác nếu không có capability reassign.

Với task yêu cầu phê duyệt, một người không được đồng thời là active OWNER/CONTRIBUTOR và APPROVER. Self-approval phải bị từ chối phía server.

## 7. Event công khai và lịch

- `/operations` là nơi duy nhất tạo và sửa event.
- Event `INTERNAL` chỉ tồn tại trong Operations, không xuất hiện trên Lịch phụ huynh.
- Event `PUBLIC_SUMMARY` tạo/cập nhật projection sang `parish_events` để Lịch đọc; `parish_events` không trở thành nguồn ghi thứ hai.
- DesktopCalendarView và MobileCalendarView là read-only.
- Chỉ Trưởng Xứ đoàn có capability `operations.event.publish_public` trong giai đoạn hiện tại.
- Trưởng ngành, Trưởng ban và Organizer có thể chuẩn bị event nội bộ nhưng phải nhờ Trưởng Xứ đoàn công khai.
- Task, checklist, assignee, comment, workstream và audit luôn nội bộ; không đi vào lịch/phụ huynh.

Giới hạn này cần thiết vì public projection hiện hướng tới toàn bộ phụ huynh active trong giáo xứ, chưa có audience scope đáng tin cậy theo Ngành/lớp.

## 8. Vocabulary vòng đời hiện hành

Không tạo state machine mới trong proposal. Dùng đúng vocabulary runtime:

```text
Event:
DRAFT | PLANNING | READY | LIVE | COMPLETED | CANCELLED

Workstream:
PLANNING | IN_PROGRESS | READY | BLOCKED

Task:
BACKLOG | TODO | IN_PROGRESS | BLOCKED | DONE | CANCELLED

Assignment acknowledgement:
PENDING | ACCEPTED | DECLINED

Task approval:
NOT_REQUIRED | PENDING | APPROVED | REJECTED
```

`UNSTAFFED`, `OVERDUE` hoặc cảnh báo chậm phản hồi nếu cần phải là dữ liệu suy ra/UX warning, không được nhập nhằng với lifecycle state.

## 9. Các invariant bắt buộc

- Mọi read/write authority-bearing phải có predicate `parish_id` và từ chối cross-parish.
- Backend authorization là nguồn quyết định; route policy, UI và cache chỉ là UX.
- Thiếu scope hoặc membership không được hiểu thành parish-wide.
- Target là parent, inactive/deleted account, inactive/deleted person hoặc ngoài scope phải bị từ chối.
- Scope/organizer/public-visibility change phải kiểm capability ở destination scope trong cùng transaction.
- Mọi mutation Operations phải duy trì idempotency, OCC/version và audit cùng transaction.
- Quyền tổ chức hết ngay khi service term hết hiệu lực hoặc bị thu hồi; không có grace mặc định.
- Quyền vận hành hết khi role bị revoke/hết validity hoặc resource đi vào terminal state.
- Public publish là capability riêng, không tự đi kèm event create/manage.
- Attendance participant/headcount không phải staffing roster và không cấp authority.

## 10. Cơ chế cộng tác liên đơn vị trong phạm vi hiện tại

- Trưởng Xứ đoàn có thể phân công toàn giáo xứ.
- Trưởng ngành/Trưởng ban chỉ phân công trong scope của mình.
- Người có active membership ở cả hai unit có thể nhận việc từ cả hai leader, mỗi việc vẫn giữ scope riêng.
- Không có Event Roster hoặc guest authority riêng trong MVP.
- Không triển khai Triple Handshake ở giai đoạn hiện tại.

Nếu pilot cho thấy Trưởng Xứ đoàn trở thành nút thắt thường xuyên cho cross-unit staffing, cơ chế yêu cầu hỗ trợ liên đơn vị mới được thiết kế như một capability/workflow riêng.

## 11. Các mục deferred, không phải business rule hiện tại

- đổi `users.role` sang `ADMIN|STAFF|PARENT`;
- `mainstaff|supportstaff`;
- Triple Handshake, Resource Request và Guest Event Member;
- Event Roster độc lập;
- quyền số hóa riêng cho Cha Tuyên úy;
- Acting Parish Leader hoặc generic delegated authority;
- tích hợp tài chính và bắt buộc Thủ quỹ duyệt task;
- cảnh báo `STAGNANT` sau 24 giờ;
- grace period 14 ngày sau hết nhiệm kỳ;
- workflow engine, ticketing, CRM hoặc Gantt.

Các con số 24 giờ và 14 ngày có authority status `CANDIDATE`, baseline `UNKNOWN`, owner `UNKNOWN`; không được dùng làm acceptance gate trước pilot.

## 12. Trạng thái triển khai Gate B

Đã triển khai trong repository ngày 2026-09-10:

1. `operationsAuthorization` tách `ADMIN_READ_CAPABILITIES` khỏi admin override; production luôn từ chối mutation theo account role, kể cả admin có person/term liên kết.
2. `operations.event.publish_public` là capability riêng của Trưởng Xứ đoàn; create/update/template instantiate và hủy event public đều kiểm server-side trong transaction. Unit leader chỉ tạo event nội bộ và không thể dùng quyền cancel để tắt projection công khai.
3. Organizer được kiểm lại theo scope tổ chức khi create/update/instantiate; client chỉ hiển thị nút Công khai khi permission response cho phép.
4. Workstream Lead không còn capability bổ nhiệm Workstream Lead khác; Event Organizer và organizational leader phù hợp vẫn có quyền này.
5. Task/workstream assignment và thay đổi validity APPROVER kiểm canonical user/person để cấm OWNER/CONTRIBUTOR kiêm APPROVER; approval kiểm lại để chặn row legacy/out-of-band.
6. Mọi service-term create/update/delete yêu cầu rate-limited admin reauth + lý do; proof được kiểm lại trong transaction, audit reason không chứa credential, service chặn admin tự cấp/sửa term cho person của mình.
7. Fixture unit/integration và E2E seed đã có BOARD, BRANCH, Trưởng Xứ đoàn, Trưởng ngành, deputy, BOARD member, dual tenure và cross-scope targets; public-calendar E2E dùng chính Trưởng Xứ đoàn thay vì admin override.
8. `BUSINESS_RULES`, ADR-110 và `FRONTEND_API_CONTRACT` đã đồng bộ với runtime.
9. Có preflight chỉ đọc `npm run audit:operations-authority`, mặc định băm identifier và trả exit code khác 0 khi cấu trúc hoặc nhiệm kỳ cần người vận hành duyệt. Managed writer đồng thời từ chối tạo/kích hoạt BOARD thứ hai; migration `20260910-251` thêm partial unique index để chặn cả writer ngoài service.

Focused regression ngày 2026-09-10 đã đạt: 7 files / 119 tests (Operations, Parish Profile, preflight, migration, schema, rehearsal và OperationsPage). Sau đó 2 files / 20 tests đạt cho delta preflight admin và migration duplicate/activation/restore. Hai lượt có test trùng nhau, không cộng thành số test độc lập. Server build và full-repo lint đạt. Lỗi `spawn EPERM` của sandbox đã được xử lý bằng lượt chạy được phê duyệt ngoài sandbox. Preflight không công nhận leader liên kết technical admin là sẵn sàng vì account đó không có organizational mutation authority trên production.

Gate B không đổi vocabulary hoặc xóa dữ liệu. Migration additive `20260910-251` bảo vệ cardinality tối đa một BOARD active mỗi giáo xứ. Nếu target còn duplicate legacy, tạo index phải fail-closed; phải chạy preflight và reconcile có duyệt trước migration, không được tự xóa/merge BOARD để ép migration pass.

## 13. Gate rollout và phần chưa thể tuyên bố tại local

DB hardening bổ sung: migration `20260910-252` chặn SQL trực tiếp đổi loại đơn vị
làm sai phạm vi chức vụ chưa xóa, kể cả lịch sử. Schema health kiểm marker/trigger;
4 suites / 54 tests đạt cho migration, schema health, rehearsal và Parish Profile.
Đây là bằng chứng local, không thay thế các gate dưới đây.

Trước production cần:

1. chạy `npm run audit:operations-authority` trên bản sao dữ liệu production để xác nhận toàn giáo xứ có đúng một BOARD active và BOARD đó ở root, Ngành/Ban trực thuộc BOARD, không có leader-term overlap/mismatch, đủ person-account links và đúng một Trưởng Xứ đoàn đang hiệu lực; manifest chỉ đọc, mặc định băm identifier và không tự sửa/chọn người thắng;
2. cấu hình/kiểm tra `PARISH_TIME_ZONE`, chạy toàn bộ migration/schema health trên target thực;
3. xác nhận production chạy `NODE_ENV=production`; `OPERATIONS_ADMIN_MUTATION_OVERRIDE` không thể mở mutation nhưng vẫn nên bỏ khỏi production config để tránh hiểu nhầm;
4. chạy smoke bằng tài khoản Trưởng Xứ đoàn thật, Trưởng ngành thật, Trưởng ban thật và technical admin thật;
5. kiểm tra audit/re-auth, public projection và notification trên deployment thật; không dùng kết quả local để tuyên bố provider/device readiness.

Preflight trên database local ngày 2026-09-10 trả `requiresOperatorReview=true` với 6 finding: không có BOARD root active (1), bốn COMMITTEE active còn ở root thay vì trực thuộc BOARD (4), và chưa có Trưởng Xứ đoàn đang hiệu lực (1). Không phát hiện mismatch position scope, lỗi liên kết identity hay overlap leader-term trong snapshot này. Đây là bằng chứng về dữ liệu local, không phải production. Không tự reparent unit hoặc tự chọn người làm Trưởng Xứ đoàn; hai việc đó cần quyết định nghiệp vụ và người quản trị dữ liệu xác nhận.

Gate C chỉ xem xét các mục deferred sau khi có dữ liệu pilot thực tế. Không đặt ngưỡng định lượng tùy ý trước khi xác định metric, owner, baseline và phương pháp đo.
