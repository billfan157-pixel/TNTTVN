# Đánh giá chuyên sâu đề xuất thẩm quyền tổ chức Operations

## Kết luận điều hành

**Kết luận lịch sử đối với bản trước Gate A:** `BLOCK — không triển khai nguyên văn bản cũ.`

**Cập nhật 2026-09-10:** `GATE B IMPLEMENTED IN REPOSITORY — chủ sản phẩm đã duyệt mô hình tối giản; capability/scope/public publish/admin transition/service-term reauth/separation-of-duty đã được đồng bộ vào code, tests và contract. Production reconciliation/smoke vẫn là rollout gate.` Các finding dưới đây được giữ lại làm bằng chứng giải thích vì sao bản cũ bị chặn và vì sao proposal hiện tại đã được viết lại.

Bản đề xuất có một nền tảng đúng và nên giữ: `Account Role ≠ Organizational Position ≠ Operational Role`. Tuy nhiên, nội dung hiện tại đã vượt khỏi yêu cầu đã chốt và khỏi kiến trúc Catevia ở nhiều điểm quan trọng. Nó đồng thời:

- mô tả một cơ cấu TNTTVN như thể đã được xác minh tuyệt đối, trong khi có phần là chính sách địa phương của Xứ đoàn và có phần khác văn bản TNTTVN đang công bố;
- đề xuất thay toàn bộ `users.role` thành `ADMIN|STAFF|PARENT`, dù app hiện phụ thuộc sâu vào `admin|chunhiem|phuta|phuhuynh` ở học vụ, route policy, API và dữ liệu;
- tự cấp quyền Operations mặc định cho hai Phó, Thư ký và Thủ quỹ, trái yêu cầu đã nêu rằng thành viên Ban Điều hành ngoài Trưởng Xứ đoàn không tự có quyền tạo/giao việc cho Trưởng ngành, Trưởng ban;
- đưa vào các hệ thống chưa được duyệt như Triple Handshake, guest roster, tài chính sự kiện, `SUSPEND`, grace period 14 ngày và cảnh báo 24 giờ;
- dùng tên trạng thái khác schema/runtime hiện hành;
- chưa giải quyết ba ranh giới quan trọng nhất: quyền công bố sự kiện cho toàn bộ phụ huynh, quyền cấp/thu hồi chức vụ có thẩm quyền, và ý nghĩa chính xác của “thành viên thuộc đơn vị”.

Đây không phải lỗi của hướng phân quyền ba tầng. Vấn đề là bản đề xuất đã trộn bốn loại tài liệu vào một: nội quy tổ chức, chính sách địa phương, thiết kế authorization và roadmap tính năng. Cần viết lại gọn hơn trước khi biến thành rule.

## Phạm vi và trạng thái bằng chứng

Đánh giá này đối chiếu:

- bản đề xuất 252 dòng đang ở trạng thái `CANDIDATE` và hiện là file chưa được git theo dõi;
- business rule, ADR-110, implementation plan và design review hiện tại;
- schema, migrations, route, authorization service và test Operations đang có;
- nội quy TNTTVN đang được website `tntt.vn` công bố;
- nguyên tắc RBAC/ABAC, least privilege, deny-by-default và separation of duty từ NIST/OWASP.

Không có thay đổi authorization hoặc migration nào được thực hiện trong lượt đánh giá này. Các nhận định “runtime hiện tại” dựa trên snapshot worktree ngày 2026-09-09; worktree đang có nhiều thay đổi chưa commit nên phải kiểm lại trước khi triển khai sau này.

## 1. Những điểm đúng nên giữ

### 1.1. Mô hình ba tầng là đúng hướng

Việc tách account baseline, nhiệm kỳ tổ chức và vai trò trên resource phù hợp với Catevia hiện tại và với nguyên tắc authorization theo quan hệ/ngữ cảnh. NIST lưu ý role đơn thuần không đủ cho mọi quan hệ theo từng resource; các constraint có thể được kiểm tra tại thời điểm truy cập.^1 OWASP cũng khuyến nghị dùng thuộc tính/quan hệ khi RBAC thuần túy bắt đầu sinh quá nhiều role.^2

Trong Catevia, nền tảng tương ứng đã có:

- account baseline: `users.role`;
- identity và scope: `parish_people`, `parish_service_terms`, `parish_organization_units`;
- resource authority: organizer, workstream membership, task assignment;
- server resolver: `operationsAuthorization.ts`.

Vì vậy không cần generic ACL/grant engine mới cho MVP.

### 1.2. Trưởng ngành và Trưởng ban là hai scope ngang quyền

Việc một người có thể kiêm nhiệm bằng hai service term độc lập là hợp lý. Runtime đã hỗ trợ đúng tinh thần này: capability chỉ phát sinh ở unit có `BRANCH_LEADER` hoặc `COMMITTEE_LEADER`, và test đã kiểm việc kiêm nhiệm không làm rò quyền sang sibling unit.

Điểm cần giữ nguyên:

- Trưởng ngành không mặc nhiên quản lý Trưởng ban;
- Trưởng ban không mặc nhiên quản lý Trưởng ngành;
- một người kiêm hai chức vụ nhận hai scope độc lập;
- quyền được xét theo scope của resource đang thao tác, không hợp nhất thành “siêu quyền”.

### 1.3. Acknowledgement tách khỏi trạng thái task

Việc tách `PENDING|ACCEPTED|DECLINED` khỏi lifecycle task là đúng. Runtime hiện chỉ cho assignment đã `ACCEPTED` tạo quyền execute/approve, còn pending/declined chỉ có visibility cần thiết. Đây là invariant tốt và không cần thay.

### 1.4. Server-authoritative, tenant-scoped, OCC, idempotency và audit

Các nguyên tắc này đúng với ADR-110 và cần giữ làm hard gate. OWASP yêu cầu deny-by-default và kiểm quyền trên mọi request cụ thể, không dựa vào UI hoặc việc khó đoán ID.^2 Proposal nên nói ngắn gọn rằng mọi command phải đi qua cùng resolver và transaction; không cần sáng tạo thêm một “Catevia Engine” mới.

## 2. Các vấn đề phải sửa trước khi duyệt

### F1 — BLOCKER: tuyên bố “đã tích hợp chuẩn xác theo Nội quy TNTTVN” không được bằng chứng hỗ trợ đầy đủ

Dòng trạng thái của proposal vừa ghi `CANDIDATE`, vừa tuyên bố “Đã tích hợp chuẩn xác”. Hai trạng thái này mâu thuẫn.

Văn bản TNTTVN do `tntt.vn` công bố xác nhận:

- Ngành trưởng điều hành và huấn luyện các Phân đoàn trong ngành;
- Xứ đoàn do Cha Tuyên úy dẫn dắt với sự cộng tác của Ban Điều hành;
- Ban Thường vụ gồm Xứ đoàn trưởng, một Phó đặc trách quản trị, một Phó đặc trách huấn luyện, một Thư ký và một Thủ quỹ;
- các Trưởng ngành và Ủy viên được liệt kê là thành viên Ban Điều hành;
- Ban Điều hành phối hợp hoạt động các ngành, đại diện đối ngoại và đào tạo/bồi dưỡng nhân sự.^3

Trong khi đó proposal vẽ Trưởng ngành nằm dưới Ban Điều hành, đặt Ban chuyên môn thành một nhánh song song do Phó quản trị phụ trách, rồi khẳng định đó là “chuẩn TNTTVN”. Phần này có thể là mô hình địa phương mà Xứ đoàn muốn dùng, nhưng không được trình bày như nội dung nguyên văn hoặc hệ quả bắt buộc của nội quy chung.

**Sửa bắt buộc:** phân biệt rõ:

- `Nền tảng TNTTVN tham chiếu`: các chức vụ/cấp được nguồn chính thức xác nhận;
- `Chính sách tổ chức của Xứ đoàn trong Catevia`: Ban chuyên môn là peer với Ngành, ai thuộc Ban Điều hành, ai có quyền giao việc;
- `Quyền số hóa trong app`: capability cụ thể, không suy thẳng từ phẩm trật mục vụ.

Ngoài ra, trang nguồn có metadata ngày hiển thị không đáng tin cậy; trước khi ghi “Nội quy 2019 hiện hành”, cần Xứ đoàn xác nhận đúng bản/văn bản áp dụng tại giáo phận địa phương.

### F2 — BLOCKER: không được đổi `users.role` thành ba role trong dự án Operations

Proposal yêu cầu xóa `chunhiem|phuta` khỏi `users.role` và chuyển sang `ADMIN|STAFF|PARENT`. Đây là một migration IAM toàn app, không phải chỉnh thẩm quyền Operations.

Observed truth hiện tại:

- schema dùng `admin|chunhiem|phuta|phuhuynh` tại `server/src/db/schema.ts:12`;
- `role_permissions` dùng cùng enum tại `server/src/db/schema.ts:481`;
- hàng loạt route học vụ, điểm, thi, lớp, thông báo và UI phân biệt `chunhiem|phuta`;
- implementation plan đã chốt giữ các role hiện hữu làm coarse baseline và không big-bang rewrite;
- Operations cũng dùng ba staff role hiện hành làm baseline tại `server/src/services/operationsAuthorization.ts:80`.

**Sửa bắt buộc:** viết:

> `users.role` tiếp tục là coarse account baseline hiện hành. Operations không thêm chức danh tổ chức mới vào enum này. Việc có nên hợp nhất `chunhiem|phuta` thành `STAFF` là một dự án IAM/Academic riêng, có migration và compatibility plan riêng, không thuộc proposal này.

Điều đó vẫn đáp ứng đúng nguyên tắc `Account Role ≠ Organizational Position` mà không phá các contract học vụ.

### F3 — BLOCKER: quyền của hai Phó, Thư ký và Thủ quỹ trái yêu cầu đã chốt

Proposal tự cấp:

- Phó huấn luyện: quyền tạo event cấp Khối Ngành;
- Phó quản trị: điều phối Khối Ban;
- Thư ký: lập event draft và phân công nội bộ;
- Thủ quỹ: approval bắt buộc;
- một Phó: quyền Trưởng Xứ đoàn khi kích hoạt.

Đây là behavior mới. Yêu cầu hiện tại nói rõ thành viên Ban Điều hành ngoài Trưởng Xứ đoàn không tự có quyền giao việc/tạo event cho Trưởng ngành, Trưởng ban; nếu họ đồng thời giữ chức Trưởng ngành/Trưởng ban thì quyền đến từ service term thứ hai đó.

Runtime và UI hiện cũng đang theo hướng an toàn hơn: chỉ có ba authority code `PARISH_LEADER|BRANCH_LEADER|COMMITTEE_LEADER`; title Phó/Thư ký/Thủ quỹ/Ủy viên là display-only.

**Sửa bắt buộc:** bỏ toàn bộ quyền mặc định trên. Nếu sau này cần “quyền thay mặt”, thiết kế một delegation có:

- capability cụ thể;
- unit/resource scope cụ thể;
- `starts_at`, `ends_at`;
- người cấp quyền;
- lý do;
- revoke;
- OCC, idempotency và audit;
- không được biến thành một account role mới.

Delegation engine chưa cần cho MVP hiện tại.

### F4 — BLOCKER: chưa tách “đưa người vào phạm vi” khỏi “điều hành người đã được duyệt”

Proposal dùng “Event Roster” làm ranh giới nhưng runtime không có roster nhân sự theo nghĩa đó:

- `operation_event_participants` hiện là danh sách attendance/headcount với `PLANNED|CONFIRMED|DECLINED|ATTENDED|ABSENT`;
- participant không phải điều kiện để được assign task;
- task/workstream target hiện được kiểm bằng active service term trong unit tree;
- Event Organizer và Workstream Lead hiện có capability assign/reassign trong resource scope.

Do đó câu “Lead chỉ giao cho người có mặt trong Event Roster” hiện không phải truth của code. Tệ hơn, route thêm participant tại `server/src/routes/operations.ts:1059` chỉ kiểm event-manage và target cùng parish; nó không kiểm target thuộc organizational scope. Nếu coi participant là staffing roster thì đây là lỗ hổng policy. Nếu coi participant là attendance list thì proposal đang gọi sai khái niệm.

**Sửa bắt buộc:** chọn một trong hai, ưu tiên phương án tối giản:

1. `operation_event_participants` chỉ là attendance/headcount, không cấp quyền;
2. assignment eligibility tiếp tục dựa trên active service term cùng unit;
3. Trưởng Xứ đoàn/Trưởng ngành/Trưởng ban bổ nhiệm Organizer/Lead và người tham gia tác nghiệp trong scope của mình;
4. Organizer/Lead chỉ phân việc trong scope đã được cấp, không được đổi `scope_unit_id` hoặc kéo người ngoài scope;
5. không gọi participant list là Event Roster cho tới khi có một model staffing roster thật sự.

Nếu pilot chứng minh cần whitelist roster theo từng event, hãy thêm nó trong một ADR sau, không giả định đã tồn tại.

### F5 — HIGH: chưa định nghĩa chính xác “thành viên thuộc Ngành/Ban”

Runtime hiện coi một person “thuộc scope” nếu có **bất kỳ** `parish_service_terms` active nào gắn unit hoặc descendant. `position_code` quyết định authority của leader; nhưng mọi term có unit đều đang được dùng như bằng chứng membership của target.

Proposal lại liệt kê `parish_service_terms / catechist_assignments` ở cùng tầng. Điều này không đúng với Operations hiện tại: resolver không dùng `catechist_assignments`, và implementation plan đã chủ ý không suy task authority từ class assignment.

**Sửa bắt buộc:** chốt một câu normative:

> Trong MVP, một `parish_service_terms` active, chưa xóa, gắn `unit_id` là bằng chứng person thuộc unit để được chọn làm target. `position_code` mới cấp quyền quản lý; `position_title` chỉ hiển thị. `catechist_assignments` không cấp quyền Operations.

Nếu service term không được nghiệp vụ coi là membership, cần model membership riêng trước khi dùng scope assignment; không được parse title để đoán.

### F6 — HIGH: quyền “Công khai” đang rộng hơn phạm vi tổ chức

Current route cho bất kỳ actor có `operations.event.create` tại unit tạo `PUBLIC_SUMMARY`. Server sau đó tạo calendar projection và gửi durable push cho **mọi parent ACTIVE trong giáo xứ** tại `server/src/routes/operations.ts:326-337`.

Như vậy một Trưởng ban/Trưởng ngành scoped có thể phát thông báo parish-wide. Đây là một capability truyền thông khác hẳn quyền tạo event nội bộ. Proposal không hề phân biệt hai quyền này.

**Khuyến nghị chốt cho MVP:**

- Trưởng ngành/Trưởng ban được tạo `INTERNAL` trong unit của mình;
- chỉ Trưởng Xứ đoàn được tạo/chuyển sang `PUBLIC_SUMMARY` cho đến khi app có audience scope đáng tin cậy;
- Organizer không được đổi visibility hoặc scope;
- nếu sau này muốn unit leader công bố cho phụ huynh đúng Ngành, phải có audience mapping server-authoritative và test không gửi toàn giáo xứ.

Nên thêm capability riêng `operations.event.publish_public` thay vì dùng chung `operations.event.create`.

### F7 — HIGH: quyền cấp chức vụ chưa được quản trị

Proposal tách technical admin khỏi organizational authority nhưng không trả lời ai được tạo/sửa/xóa `PARISH_LEADER|BRANCH_LEADER|COMMITTEE_LEADER`.

Observed truth: mọi writer people/unit/service-term hiện là `roleMiddleware('admin')` trong `server/src/routes/parishProfile.ts:178-221`. Một admin có thể ghi service term authority, kể cả cho chính mình; đồng thời runtime Operations hiện còn cấp toàn bộ domain-management capabilities cho `admin` tại `operationsAuthorization.ts:82-89`.

NIST chỉ ra rằng mô hình RBAC không tự quyết định ai được phép gán/revoke role; đó là một chính sách quản trị riêng phải được thiết kế.^4 Vì vậy proposal chưa hoàn chỉnh nếu chỉ nói admin không có authority mà bỏ qua authority provisioning.

**Khuyến nghị MVP:**

- admin tiếp tục là người nhập liệu/custodian cho organization registry;
- thay đổi `position_code` có quyền phải bắt buộc fresh re-auth, reason và audit redacted;
- admin không nhận quyền tạo/giao việc Operations chỉ vì là admin;
- bootstrap Trưởng Xứ đoàn đầu tiên phải có quy trình có kiểm soát và được ghi audit;
- chưa cần two-person approval nếu Xứ đoàn chưa có đủ người vận hành, nhưng phải ghi đây là residual governance risk.

### F8 — HIGH: Triple Handshake là workflow mới, chưa được duyệt và chưa có model

“Bên mượn → bên quản lý → người được điều động” là một ý tưởng tốt cho tình nguyện viên, nhưng hiện không có:

- resource request aggregate;
- provider approval state;
- mobilization offer;
- guest event membership;
- revoke/expiry/retry/conflict contract;
- notification ownership;
- tests hoặc UI.

Trong trường hợp người giữ Trưởng ban cũng có active term trong Ngành, hoặc ngược lại, không cần mượn quân: họ đã là member của scope đó và được leader scope phân công bình thường. Với người thật sự ngoài scope, yêu cầu hiện tại đã có đường đơn giản: Trưởng Xứ đoàn có quyền toàn Xứ đoàn.

**Khuyến nghị:** chuyển Triple Handshake sang `DEFERRED CANDIDATE`. Chỉ triển khai khi pilot chứng minh nhu cầu thường xuyên và Trưởng Xứ đoàn trở thành nút thắt thực tế.

### F9 — HIGH: grace period 14 ngày làm mờ ranh giới hết nhiệm kỳ

Con số 14 ngày không có owner, baseline, dữ liệu pilot hoặc nguồn nghiệp vụ. Theo nguyên tắc quantitative target, đây chỉ là `CANDIDATE`, không thể trở thành acceptance rule.

Mô hình ba tầng đã cung cấp cách sạch hơn:

- hết service term thì hết organizational authority ngay theo ngày giáo xứ;
- operational appointment đã được cấp cho event/workstream cụ thể tiếp tục theo lifecycle/validity của chính appointment;
- quyền đó không phải “gia hạn chức vụ” và không cho tạo resource mới;
- event terminal hoặc explicit revoke chấm dứt authority.

Do đó bỏ grace period cố định khỏi MVP. Nếu cần bàn giao, dùng explicit handover có audit.

### F10 — HIGH: trạng thái trong proposal không khớp domain hiện tại

Proposal dùng task `OPEN|COMPLETED`; runtime dùng `BACKLOG|TODO|IN_PROGRESS|BLOCKED|DONE|CANCELLED`. Proposal dùng event “IN_PROGRESS” trong grace period; runtime dùng `LIVE`. `STAGNANT` và `UNSTAFFED` cũng chưa phải field/state hiện hành.

**Sửa bắt buộc:** dùng vocabulary hiện tại hoặc ghi mapping rõ. Không đổi enum chỉ để khớp proposal vì sẽ kéo theo migration, API, UI, template snapshot, readiness và test.

Cảnh báo quá 24 giờ phải được ghi là candidate derived warning, không phải hard-coded rule. Chưa có bằng chứng cho thấy 24 giờ phù hợp với task có deadline 2 giờ hoặc 30 ngày.

### F11 — HIGH: Finance/Treasurer approval là scope creep đã bị plan hoãn

Current plan ghi rõ budget/cost và finance integration là deferred. Schema task không có `financial_impact`; Operations chưa có expense aggregate hoặc transaction link. Proposal tự thêm mandatory Treasurer approver và cổng hoàn tất hai lớp.

Separation of duty có giá trị cho giao dịch nhạy cảm; NIST coi đây là constraint có chủ đích, không phải quyền mặc định áp dụng cho mọi transaction.^1 Tuy nhiên, gắn nó vào Operations ngay bây giờ sẽ tạo coupling với Finance khi chưa có contract về số tiền, trạng thái chi, người đề nghị, người duyệt, hoàn ứng hoặc sửa chứng từ.

**Khuyến nghị:** bỏ khỏi rule hiện tại. Mở ADR riêng khi Finance event expense được duyệt. Task thường có thể dùng `requiresApproval` hiện tại; không được giả danh approval nghiệp vụ tài chính.

### F12 — MEDIUM/HIGH: Cha Tuyên úy là thẩm quyền tổ chức thật nhưng quyền số hóa chưa được duyệt

Nguồn TNTTVN xác nhận Cha Tuyên úy dẫn dắt Xứ đoàn, chấp thuận nhân sự Ban Điều hành và việc bầu/bổ nhiệm tạo quyền, trách nhiệm tổ chức.^3 Proposal đã đi xa hơn bằng các capability app `view all`, `audit.view`, `SUSPEND`, `CANCEL` mà không có account model, position code, route, lifecycle hoặc yêu cầu trực tiếp.

**Khuyến nghị:**

- giữ Cha Tuyên úy trong mô tả governance/pastoral oversight;
- chưa cấp quyền digital tự động;
- nếu Xứ đoàn muốn có tài khoản Cha Tuyên úy, mở quyết định riêng về visibility, privacy, approval/veto, delegation và audit;
- không biến vai trò mục vụ thành technical admin.

### F13 — MEDIUM: chưa có cardinality “một Ban Điều hành active” — resolved in Gate B

Tại snapshot deep review, migrations chỉ buộc `BOARD` ở root và Branch/Committee trực thuộc một Board active, nhưng chưa cấm nhiều Board active cùng parish. Chỉ overlap của `PARISH_LEADER` được chặn parish-wide.

Nếu business rule thực sự là một Ban Điều hành hiện hành cho một Xứ đoàn, cần:

- inventory dữ liệu trước migration;
- constraint một active nondeleted `BOARD`/parish;
- hoặc ghi rõ nhiều Board lịch sử được phép nhưng tại một thời điểm chỉ một Board active.

Gate B sau đó đã bổ sung preflight chỉ đọc, service guard và partial unique index migration `20260910-251`. Nhiều Board lịch sử vẫn được phép nếu inactive/deleted, nhưng chỉ tối đa một Board active. Migration cố ý fail khi còn legacy duplicate; production vẫn phải inventory/reconcile trước và không được tự chọn Board thắng.

### F14 — MEDIUM: “phải có chuyên môn phù hợp” không phải policy máy có thể kiểm

Proposal yêu cầu APPROVER có chuyên môn phù hợp nhưng không định nghĩa nguồn dữ liệu, tiêu chí hoặc người xác nhận. Đây là hướng dẫn con người, không phải authorization invariant.

Current runtime còn cho cùng một user mang OWNER và APPROVER trên cùng task. Separation of duty không nhất thiết phải bắt buộc cho mọi task tình nguyện; nhưng với task nhạy cảm, self-approval có thể làm approval mất ý nghĩa.

**Khuyến nghị:**

- MVP: người tạo task chọn APPROVER; lưu audit, không tự suy “chuyên môn”;
- quyết định rõ có cấm self-approval khi `requiresApproval=true` hay không;
- nếu cần nhiều mức nhạy cảm sau pilot, thêm một policy cụ thể, không thêm title parsing.

## 3. Mô hình đã chỉnh nên đưa ra duyệt

### 3.1. Cơ cấu tổ chức địa phương trong Catevia

```text
Cha Tuyên úy / Quản xứ
  └─ pastoral governance; chưa tự động là app capability

Ban Điều hành (một BOARD active)
  ├─ Trưởng Xứ đoàn
  ├─ Phó 1
  ├─ Phó 2
  ├─ Thư ký
  ├─ Thủ quỹ
  └─ Ủy viên

Dưới BOARD, hai loại unit ngang cấp
  ├─ Ngành (BRANCH)
  │   ├─ Trưởng ngành
  │   └─ Chi đoàn/lớp và thành viên trong ngành
  └─ Ban chuyên môn (COMMITTEE)
      ├─ Trưởng ban
      ├─ Phó ban
      └─ thành viên trong ban
```

Đây phải được gọi là **policy tổ chức địa phương được cấu hình trong Catevia**, có tham chiếu nội quy TNTTVN nhưng không tuyên bố mọi chi tiết đều là cấu trúc bắt buộc toàn quốc.

### 3.2. Nguồn authority

- `users.role`: giữ enum hiện hành, chỉ làm baseline truy cập.
- `parish_people`: organizational identity.
- active `parish_service_terms`: membership và nhiệm kỳ theo unit.
- `position_code`: chỉ ba authority code hiện tại.
- `position_title`: tên chức vụ hiển thị, không cấp quyền.
- organizer/workstream/task role: authority đúng resource, kết thúc theo resource/validity/revoke.
- `catechist_assignments`: authority học vụ/lớp; không cấp Operations authority.

### 3.3. Quyền tổ chức tối thiểu

- **Trưởng Xứ đoàn:** tạo/quản lý/giao việc toàn Xứ đoàn; bổ nhiệm organizer/lead/member trên mọi scope; quyền công bố public cho phụ huynh.
- **Trưởng ngành:** tạo event/workstream/task trong Ngành và descendants; chỉ chọn person có active membership trong scope đó; có thể chọn một Trưởng ban nếu người đó đồng thời có term trong Ngành.
- **Trưởng ban:** tương tự trong Ban; có thể chọn một Trưởng ngành nếu người đó đồng thời có term trong Ban.
- **Phó 1, Phó 2, Thư ký, Thủ quỹ, Ủy viên, Phó ban:** không có Operations authority chỉ từ title hoặc membership Ban Điều hành.
- **Người kiêm nhiệm:** nhận union các capability từ từng term, nhưng mỗi decision vẫn phải khớp resource scope.
- **Technical admin:** quản trị account/cấu hình/registry theo route riêng; không mặc định tạo/giao việc, execute hay approve trong Operations.

### 3.4. Quyền vận hành tối thiểu

- **Event Organizer:** quản lý nội dung và tiến độ event đã được giao; không đổi scope/public visibility; không kéo người ngoài organization scope.
- **Workstream Lead:** quản lý workstream/task của mình; chỉ phân công target hợp lệ trong resource organization scope; không transition/cancel toàn event.
- **OWNER:** chịu trách nhiệm task, execute sau `ACCEPTED`; không tự giao quyền quản lý người khác.
- **CONTRIBUTOR:** execute phần việc sau `ACCEPTED`.
- **APPROVER:** approve/reject sau `ACCEPTED`; policy self-approval còn cần quyết định.
- **OBSERVER:** view/comment, không execute/approve/manage.

### 3.5. Các rule fail-closed cần ghi thẳng

- thiếu `scope_unit_id` trên resource quản lý tổ chức không được hiểu là “ai cũng được giao việc”; chỉ Trưởng Xứ đoàn hoặc explicit resource authority đã hợp lệ được thao tác;
- target cross-parish, parent, inactive/deleted account hoặc person không thuộc scope phải bị từ chối;
- active term dùng ngày dân sự của `PARISH_TIME_ZONE`, ngày kết thúc inclusive;
- scope/organizer/public-visibility change phải kiểm capability ở destination scope trong cùng transaction;
- quyền trên frontend/cache không có giá trị authorization;
- mọi mutation authority-bearing có idempotency, OCC và audit cùng transaction;
- hết nhiệm kỳ không còn organizational authority; không có grace mặc định;
- public publish là capability riêng, không tự đi kèm event create.

## 4. Thứ tự sửa proposal và implementation

### Gate A — sửa tài liệu trước code

**Trạng thái:** `COMPLETE — proposal đã được viết lại và được chủ sản phẩm duyệt làm đích ngày 2026-09-09.`

1. Đổi trạng thái thành `CANDIDATE — chưa duyệt`, bỏ câu “đã tích hợp chuẩn xác”.
2. Tách nguồn TNTTVN khỏi policy địa phương.
3. Bỏ account-role migration.
4. Bỏ quyền tự động cho Phó/Thư ký/Thủ quỹ.
5. Bỏ Triple Handshake, Finance integration, 24h stagnant và 14-day grace khỏi current scope.
6. Dùng state vocabulary hiện hành.
7. Chốt membership semantics, public-publish authority, technical-admin boundary và self-approval.

### Gate B — sửa foundation authorization

Tại thời điểm deep review, Gate A đã được duyệt và Gate B chưa được thực hiện. Gate B sau đó đã được triển khai ngày 2026-09-10; trạng thái source, verification theo snapshot và data preflight hiện hành nằm tại [nghiên cứu triển khai Gate B](OPERATIONS_AUTHORITY_GATE_B_IMPLEMENTATION_RESEARCH_2026-09-10.md) và proposal đích. Danh sách dưới đây được giữ làm acceptance scope lịch sử:

1. ghi nhận quyền toàn bộ của `admin` là ngoại lệ chuyển tiếp phục vụ xây dựng/test; tạo fixture organizational RBAC rồi cô lập override khỏi production trước khi chỉ giữ quyền đọc Operations/audit và technical routes;
2. thêm `operations.event.publish_public` và giới hạn Parish Leader;
3. rà toàn bộ create/update/template instantiate để public visibility không đi vòng;
4. làm rõ participant attendance khác staffing authority;
5. thêm negative tests cho Board member, deputy, admin, organizer/lead ngoài scope, public publish và dual tenure;
6. bảo vệ writer của authority-bearing service terms bằng re-auth/reason/audit;
7. inventory nhiều active Board trước khi cân nhắc constraint.

### Gate C — pilot trước phần mở rộng

Theo dõi định tính và count thực tế, không đặt KPI tùy ý:

- số lần Trưởng Xứ đoàn phải xử lý cross-unit assignment;
- số lần Organizer/Lead cần người ngoài scope;
- số lần task pending gây chậm và distribution thời gian phản hồi;
- số event public do unit leader đề nghị;
- số tình huống hết nhiệm kỳ khi event còn LIVE;
- số task requiring approval có nguy cơ self-approval.

Chỉ khi dữ liệu cho thấy nút thắt mới cân nhắc Triple Handshake, delegated authority, stale-warning threshold hoặc grace/handover policy.

## 5. Các quyết định đã được chủ sản phẩm duyệt tại Gate A

1. **Public event:** chỉ Trưởng Xứ đoàn được bật `Công khai` trong giai đoạn hiện tại.
2. **Technical admin:** runtime hiện giữ toàn quyền Operations cho admin để xây dựng/test. Đây là ngoại lệ chuyển tiếp; target production chỉ giữ account/config/registry và quyền đọc Operations/audit, không mặc nhiên có mutation authority.
3. **Organizer/Lead staffing:** được phân công target có active membership trong cùng organization scope; không tạo Event Roster riêng trong MVP.
4. **Self-approval:** không cho một người đồng thời là active OWNER/CONTRIBUTOR và APPROVER trên task cần duyệt.
5. **Cha Tuyên úy:** chỉ là governance/person record trong giai đoạn hiện tại, chưa tự động có digital capability.
6. **Account role:** giữ enum hiện hành làm compatibility baseline; `users.role` không quyết định unit scope và không đổi thành `mainstaff|supportstaff`.

Các quyết định này đã được hợp nhất vào proposal đích. Mọi thay đổi sau đó phải đi qua business-rule/ADR change tương ứng, không được suy diễn từ chức danh hiển thị.

## 6. Đánh giá theo invariant

- **Tenant isolation:** `PASS` ở thiết kế nền hiện tại; proposal không được làm yếu predicate `parish_id`.
- **Account/organization/resource separation:** `PASS về nguyên lý`, `BLOCK về nội dung account migration`.
- **Leader scope:** `PASS` cho Branch/Committee parallel và dual tenure; `BLOCK` cho các quyền Phó/Thư ký/Thủ quỹ tự phát sinh.
- **Target scope:** `PARTIAL`; current service-term guard tốt nhưng proposal dùng Event Roster không tồn tại và chưa định nghĩa membership semantics.
- **Public communication authority:** `BLOCK`; create-event scope hiện có thể phát push toàn parish.
- **Authority provisioning/revocation:** `BLOCK`; admin-only writer tồn tại nhưng governance/re-auth chưa được định nghĩa.
- **OCC/idempotency/audit:** `PASS` cho Operations command pattern hiện tại; các workflow mới trong proposal chưa có contract.
- **MVP complexity:** `BLOCK`; Triple Handshake, Finance, grace và state rewrite là scope expansion chưa được chứng minh.

## 7. Nguồn

1. NIST, “[Role Based Access Control FAQ](https://csrc.nist.gov/Projects/Role-Based-Access-Control/faqs),” các mục về role authorization, transaction authorization, hierarchy, constraints và relationship-specific access.
2. OWASP, “[Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),” các mục Least Privilege, Deny by Default, Validate Permissions on Every Request và ABAC/ReBAC.
3. Hội đồng Giám mục Việt Nam — Ủy ban Giới trẻ và Thiếu nhi, “[Nội quy Thiếu Nhi Thánh Thể](https://tntt.vn/index.php/tu-nhien/item/92-noi-quy-tntt),” Chương III, Điều 23–29 và Điều 53–54; truy cập 2026-09-09. Metadata phiên bản/ngày trên trang cần xác nhận lại với Xứ đoàn/giáo phận.
4. Sandhu, Ferraiolo và Kuhn, “[The NIST Model for Role Based Access Control: Towards a Unified Standard](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=916402),” mục 7.8 về authorization quản trị cho role assignment/revocation.
5. NIST, “[Adding Attributes to Role Based Access Control](https://www.nist.gov/publications/adding-attributes-role-based-access-control),” 2010, về role explosion và nhu cầu kết hợp thuộc tính động.

## 8. Evidence nội bộ chính

- `docs/OPERATIONS_ORGANIZATIONAL_AUTHORITY_PROPOSAL_2026-09-09.md:1-252`
- `docs/BUSINESS_RULES.md:789-799` và `docs/BUSINESS_RULES.md:845-865`
- `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md:3745-3777`
- `docs/TASK_EVENT_OPERATIONS_IMPLEMENTATION_PLAN_2026-09-07.md:272-535`
- `server/src/db/schema.ts:4-22`, `server/src/db/schema.ts:1249-1429`
- `server/src/services/operationsAuthorization.ts:18-95`, `server/src/services/operationsAuthorization.ts:211-404`
- `server/src/routes/operations.ts:308-337`, `server/src/routes/operations.ts:909-972`, `server/src/routes/operations.ts:1059-1084`, `server/src/routes/operations.ts:1479-1551`, `server/src/routes/operations.ts:1783-1843`
- `server/src/routes/parishProfile.ts:169-221`
- `server/src/db/migrations.ts:1904-1969`
- `server/src/__tests__/operations.test.ts:480-650`
