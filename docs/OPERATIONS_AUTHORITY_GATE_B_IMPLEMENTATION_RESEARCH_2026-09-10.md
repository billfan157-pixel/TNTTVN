# Nghiên cứu và triển khai Gate B — Thẩm quyền tổ chức Operations

> **Superseded in part by ADR-112 (2026-09-11):** position-code vocabulary is now 7 codes (`PARISH_SECRETARY/PARISH_DEPUTY/BRANCH_DEPUTY/COMMITTEE_DEPUTY` added), events carry `eventScopeType`, creator≠organizer is server-enforced, and deputy Field leads are rejected. Historical analysis below is preserved as-is; normative truth lives in `BUSINESS_RULES.md`, `FRONTEND_API_CONTRACT.md` §25 and ADR-112.

> **Policy supersession — 2026-09-10, được chủ sản phẩm phê duyệt:** Admin có
> quyền quản trị toàn giáo xứ trong mọi môi trường, kể cả production; được tạo/sửa
> nhiệm kỳ cho chính mình. Các mô tả admin production read-only, cấm self-grant
> hoặc override chỉ dev/test bên dưới đã bị thay thế. Biến legacy
> `OPERATIONS_ADMIN_MUTATION_OVERRIDE` không còn giới hạn quyền. Vẫn bắt buộc
> reauth + lý do + audit cho nhiệm kỳ; không bỏ tenant isolation, OCC, idempotency,
> kiểm tra phạm vi dữ liệu, trạng thái đóng việc hoặc separation of duty.

## Checkpoint xác minh mới nhất — 2026-09-10

- Continuation rollout evidence: sửa false-pass khi authority inventory rỗng. Manifest thêm `evaluatedOn`, `parishCount` và finding `NO_PARISH_DATA`; CLI hiện hữu trả exit khác 0 qua `requiresOperatorReview`. Preflight 5/5 tests đạt. Không thêm dữ liệu mẫu vào database thật để làm gate pass. Phần còn cần đầu vào: đường dẫn backup production đã hoàn tất và cơ cấu/nhân sự được phê duyệt; thiếu hai đầu vào này không thể xác nhận rollout hoàn thành.

- Đã đóng giới hạn SQL ngoài service của lượt trước bằng migration additive `20260910-252`, trigger `check_parish_unit_position_scope_update`. Trigger kiểm cùng parish/unit và cả term lịch sử chưa xóa, không tự sửa dữ liệu. Schema health yêu cầu marker + trigger; rehearsal cập nhật latest marker. Migration/schema/rehearsal/Parish Profile: 4 files / 54 tests đạt; server build và lint các file sửa đạt. Regression bao gồm ba leader codes, giữ nguyên row khi từ chối, unit ID trùng ở parish khác, no-op type update và term đã xóa. Các gate dữ liệu thật/production tại proposal §13 vẫn mở; không tạo thêm quyền delegated hoặc thay đổi nhân sự để đánh dấu hoàn thành.

- Continuation unit/term integrity: managed unit update nay kiểm các nhiệm kỳ chưa xóa cùng parish/unit trước khi đổi loại đơn vị; trả `409 PARISH_POSITION_SCOPE_MISMATCH` nếu chức vụ không tương thích. Giữ cả lịch sử, không tự chuyển BRANCH_LEADER thành COMMITTEE_LEADER. Regression chứng minh đổi Ngành thành Ban bị từ chối, row vẫn là BRANCH, đổi tên vẫn thành công. Parish Profile 18/18 tests và lint phạm vi sửa đạt. Guard này nằm ở service transaction; không tuyên bố đã thêm DB trigger cho writer SQL ngoài service.

- Continuation deployment gate: sửa thứ tự runbook thành authority audit trước rehearsal; rehearsal nay phát hiện nhiều BOARD active trong cùng giáo xứ trước mọi migration và chỉ báo counts, không tự sửa. Regression backup legacy chứng minh lỗi hướng dẫn rõ, không lộ parish ID và source SHA-256 giữ nguyên. Suite rehearsal 4/4 đạt; server build và lint hai file code thay đổi đạt. Hai lượt đầu timeout do deep comparison Buffer lớn trong test, đã chuyển sang SHA-256 toàn file, không tăng timeout. Full-repo lint hiện chưa đạt do 3 unused imports ở `ParishPersonDetailModal.tsx`; diff check toàn repo còn blank EOF ở `ParishLogoModal.tsx` và test tương ứng (ngoài phần sửa lượt này). Chưa chạy production migration hoặc thay đổi cơ cấu thật.

- Continuation preflight SQL: inventory nay bao gồm giáo xứ chỉ còn `parish_people` hoặc `parish_service_terms` legacy. Regression chạy truy vấn thật trên SQLite chứng minh không dùng linked account khác giáo xứ, không bỏ sót giáo xứ legacy-only, không đổi row trước commit và không lộ user ID trong manifest. Suite preflight 4/4 đạt. Transaction được close trong finally theo pattern hiện hành. Fixture file ban đầu vướng handle native trên Windows, đã thay bằng SQLite memory và so sánh snapshot trên chính transaction thật trước commit.

- Đã gỡ blocker runner bằng quyền chạy ngoài sandbox: 7 files / 119 tests đạt, gồm Operations, Parish Profile, preflight, migrationRunner, schemaHealth, migration rehearsal và OperationsPage.
- Rà tiếp phát hiện preflight có thể báo leader linked-admin là hợp lệ dù production từ chối organizational mutation. Đã thêm finding `TECHNICAL_ADMIN_HAS_NO_ORGANIZATIONAL_MUTATION_AUTHORITY`; leader đó không thỏa current-leader readiness.
- Bổ sung regression migration 251: chặn kích hoạt/khôi phục BOARD thứ hai; dữ liệu duplicate trước migration được giữ nguyên và không có marker thành công. Hai file thay đổi sau lượt trên đã rerun: 20 tests đạt. Không cộng hai lượt vì có test trùng.
- Server TypeScript build và full-repo lint đạt. Các ghi chú `spawn EPERM`/rerun pending bên dưới là lịch sử trước checkpoint này.
- Không thay đổi dữ liệu tổ chức thực hoặc chạy migration production. Sáu finding local trước đó vẫn cần người quản trị xác nhận; không suy ra tình trạng production từ fixture.

**Ngày chốt:** 2026-09-10  
**Normative target:** `OPERATIONS_ORGANIZATIONAL_AUTHORITY_PROPOSAL_2026-09-09.md`  
**Kết luận:** `IMPLEMENT — mô hình ba tầng phù hợp Catevia; không mở rộng thành IAM mới hoặc authorization service riêng.`

## 1. Câu hỏi nghiên cứu

Gate B cần trả lời bốn câu hỏi trước khi sửa code:

1. Có nên dùng `users.role` để biểu diễn Trưởng Xứ đoàn/Trưởng ngành/Trưởng ban không?
2. Ai được giao người, chỉ định lead và công khai event trong từng scope?
3. Làm sao giữ technical admin phục vụ xây dựng/test nhưng không tạo backdoor production?
4. Rule chống tự duyệt và thay đổi chức vụ phải được đặt ở đâu để không bị UI/API khác đi vòng?

## 2. Evidence từ hệ thống hiện tại

Đường quyết định quyền thực tế đã được truy từ route đến DB:

- account baseline: JWT `userId|role|parishId` và staff route gate;
- organizational authority: `parish_people.linked_user_id`, cây `parish_organization_units`, active `parish_service_terms.position_code` theo ngày giáo xứ;
- resource authority: event organizer, workstream membership, task assignment;
- write integrity: `runIdempotentOperationsCommand` + transaction + OCC version + audit;
- public calendar: `operation_events` là command owner, `parish_events` là projection do server quản lý;
- service-term writer: admin-only Parish Profile route và transactional domain service.

Observed gaps trước Gate B:

- `admin` nhận broad Operations management trực tiếp từ account role;
- `event.create` đồng thời cho phép `PUBLIC_SUMMARY`, nên unit leader có thể broadcast toàn giáo xứ;
- Workstream Lead có thể cấp tiếp Workstream Lead;
- cùng canonical identity có thể vừa thực hiện vừa duyệt;
- service-term mutation thiếu reauth/reason và service-level self-grant guard;
- E2E public workflow dùng admin override nên không chứng minh organizational authority.

## 3. Kết quả đối chiếu nguồn ngoài

OWASP khuyến nghị least privilege, deny-by-default, kiểm permission trên mọi request và ưu tiên attribute/relationship-based policy khi object scope quan trọng.[^1] Điều này khớp với việc Catevia giữ `users.role` làm baseline, còn quyền thực tế phụ thuộc position + unit + resource; một enum account role không đủ biểu diễn người kiêm nhiệm hoặc hai nhánh Ngành/Ban song song.

NIST mô tả transaction chỉ được thực hiện khi active role được phép và các constraint đi kèm đều thỏa; NIST cũng xem separation of duty là thành phần chính thức của RBAC.[^2] Vì vậy APPROVER không chỉ là nhãn UI: xung đột OWNER/CONTRIBUTOR phải bị chặn lúc gán và kiểm lại lúc duyệt.

OWASP Transaction Authorization yêu cầu authorization nhạy cảm được enforce server-side và không để client parameter vô hiệu hóa bước xác nhận.[^3] Gate B do đó dùng request-bound admin reauth proof, kiểm lại proof bên trong transaction service-term, không chỉ kiểm mật khẩu trước khi gọi service.

Zanzibar chứng minh relationship/object authorization có thể biểu diễn quyền theo quan hệ tài nguyên và cần nhất quán với thay đổi object.[^4] Catevia chỉ lấy nguyên tắc phù hợp—quan hệ person/unit/resource và kiểm trong cùng transaction—không sao chép hạ tầng toàn cầu, vì modular monolith hiện tại chưa có nhu cầu hoặc baseline cho một authorization service riêng.

## 4. Quyết định kiến trúc đã áp dụng

### 4.1. Ba tầng quyền, không đổi account enum

- `users.role`: xác thực loại account và staff baseline.
- `position_code`: `PARISH_LEADER|BRANCH_LEADER|COMMITTEE_LEADER` với active service term và unit scope.
- operational role: Organizer, Workstream Lead/member, task OWNER/CONTRIBUTOR/APPROVER/OBSERVER.

`position_title`, class assignment và tên chức vụ tự do không cấp quyền Operations.
Service term thông thường chỉ xác định membership/candidate scope; nó không tự
cấp quyền xem hoặc bình luận tài nguyên nếu người đó chưa nhận operational role.

### 4.2. Technical admin là custodian

Production admin chỉ có `event.view|task.view|audit.view`. Broad management override:

- entrypoint `npm run dev` đặt rõ `NODE_ENV=development`; test/Vitest giữ bootstrap tương ứng;
- runtime thiếu marker môi trường bị deny thay vì được suy đoán là development;
- tắt được bằng `OPERATIONS_ADMIN_MUTATION_OVERRIDE=false`;
- luôn trả false khi `NODE_ENV=production`, kể cả environment cố đặt true;
- admin production không được đi vòng qua person/service term liên kết.

### 4.3. Public publish là capability riêng

Chỉ Trưởng Xứ đoàn có `operations.event.publish_public` trong policy production. Server kiểm capability khi:

- tạo event public;
- sửa bất kỳ event đang public hoặc chuyển public/internal;
- hủy event public vì thao tác này soft-delete calendar projection;
- instantiate template public.

Organizer và unit leader vẫn chuẩn bị event nội bộ. UI chỉ phản chiếu permission; server là boundary quyết định.

### 4.4. Phạm vi chỉ định người

Create/update/instantiate event chuẩn hóa organizer thành `{userId,personId}` rồi kiểm membership trong scope. Trưởng ngành/Trưởng ban chỉ chọn target trong unit/descendants; Trưởng Xứ đoàn parish-wide. Workstream Lead quản lý assignee nhưng không bổ nhiệm Workstream Lead khác.

### 4.5. Separation of duty

Canonical identity nối alias user/person. Hệ thống từ chối:

- thêm APPROVER khi identity đang là OWNER/CONTRIBUTOR của task;
- thêm OWNER/CONTRIBUTOR khi identity là task APPROVER;
- cấp workstream APPROVER cho identity đang thực hiện task trong workstream;
- giao task thực hiện cho identity đang là workstream APPROVER;
- approve khi row legacy/out-of-band cho thấy actor cũng đang thực hiện.

Đổi validity của APPROVER cũng chạy lại cùng invariant; membership đã hết hạn
không còn chặn người thực hiện, nhưng không thể tái kích hoạt APPROVER nếu đã có
OWNER/CONTRIBUTOR xung đột.

Rule chạy trong cùng transaction với mutation và trả `409 SELF_APPROVAL_FORBIDDEN`.

### 4.6. Service-term provisioning

Mọi service term đều authority-bearing vì ngay cả term không có `position_code` vẫn ảnh hưởng membership/read/assignment scope. Create/update/delete yêu cầu:

- admin route + rate limiter;
- `adminPassword` và `authorityReason`;
- credential capture không đưa password vào service payload/audit;
- proof revalidated trong DB transaction;
- reason trong audit;
- service từ chối create/update cho person liên kết chính acting admin.

## 5. Verification gates và mục tiêu định lượng

Các con số dưới đây là invariant kiểm thử, không phải SLO production:

- 100% đường public create/update/template instantiate có server capability check;
- 0 production admin mutation được cấp chỉ từ `users.role=admin`;
- 0 task cho phép cùng canonical identity vừa OWNER/CONTRIBUTOR vừa APPROVER;
- 100% service-term mutation HTTP yêu cầu reauth + reason;
- 100% query/command mới giữ `parish_id` predicate và transaction hiện hữu;
- không thay đổi OCC/idempotency/audit contract của Operations.

Không đặt latency, tải, tỷ lệ reminder hay device reliability target mới vì Gate B không có production baseline/owner/method đo. Các claim đó tiếp tục cần pilot riêng.

## 6. Kết quả repository

Đã triển khai:

- capability policy và admin override fail-closed production;
- public publish + organizer scope guard;
- Workstream Lead delegation boundary;
- server-side separation-of-duty;
- service-term reauth/self-grant guard và UI confirmation bằng `ModalShell`;
- fixture unit/integration + deterministic E2E organization seed;
- Business Rules, ADR-110, API contract và proposal status.
- preflight `audit:operations-authority` đọc-only, xuất manifest riêng tư và fail
  khi cấu trúc/leader-term/account readiness cần operator review.
- service guard và partial unique index migration `20260910-251` chặn tạo hoặc
  kích hoạt BOARD active thứ hai, kể cả writer đi ngoài service.

Evidence local theo snapshot (cần đọc đúng mốc):

- Operations/Parish Profile/Event Template: 3 files, 70 tests pass ở snapshot nền;
- OperationsPage: 18 tests pass và ParishProfilePage: 9 tests pass ở snapshot nền;
- schema health/migration/rehearsal: 3 files, 32 tests pass;
- security-critical: 7 files, 73 tests pass;
- Chromium E2E: Trưởng Xứ đoàn tạo public event tại Operations, parent đọc projection trên Lịch và direct calendar write bị từ chối — pass;
- lint, Design System anti-drift và architecture inventory — pass;
- server TypeScript build pass;
- frontend production TypeScript/Vite/PWA build pass;
- production migration/reconciliation/device/provider vẫn không được suy từ local.

Sau snapshot test trên, delta hardening cuối bổ sung bốn lớp bảo vệ: hủy event public cũng cần capability publish, membership thường không tự cấp quyền đọc Operations, admin override từ chối môi trường không xác định, và preflight authority data. Test regression cho các nhánh này đã được thêm. Server/frontend build, lint, Design System guard và architecture inventory đã đạt trên source tương ứng; focused Vitest cuối chưa chạy lại được vì Windows sandbox trả `spawn EPERM` và escalation bị giới hạn công cụ. Vì vậy số 70/18 phía trên là evidence lịch sử gần nhất, không phải chứng nhận cho delta cuối.

Sau khi phát hiện preflight đơn thuần không ngăn writer tạo BOARD thứ hai, Gate B bổ sung service guard và migration `20260910-251`. Server build và lint phạm vi thay đổi đạt; isolated in-memory smoke của migration đạt: BOARD active thứ hai bị từ chối, BOARD inactive lịch sử vẫn được giữ. Regression Vitest cho service/migration/schema đã được cập nhật nhưng cùng bị giới hạn runner nêu trên.

Preflight read-only đã chạy trên database local ngày 2026-09-10 và trả 6 finding cần operator review:

- 1 parish không có BOARD root active;
- 4 COMMITTEE active đang ở root, chưa trực thuộc BOARD active;
- 1 parish không có đúng một Trưởng Xứ đoàn đang hiệu lực;
- không có finding position-scope, leader identity hoặc leader-term overlap trong snapshot local này.

Manifest mặc định chỉ chứa identifier băm. Không tự sửa vì reparent đơn vị và chọn Trưởng Xứ đoàn là quyết định nghiệp vụ; kết quả này cũng không đại diện cho dữ liệu production.

## 7. Rủi ro còn lại và rollout

- Dữ liệu production có thể thiếu BOARD/person links hoặc có legacy overlap; chạy
  `npm run audit:operations-authority` trên bản sao trước deploy. Công cụ chỉ phát
  hiện, không được dùng để tự backfill hoặc chọn người thắng. Nếu có nhiều BOARD
  active, migration `20260910-251` phải dừng thay vì tự xóa/merge dữ liệu.
- E2E/dev cố ý giữ admin override nên test organizational authority phải đăng nhập đúng seeded leader, không dùng admin làm bằng chứng.
- Reauth bảo vệ người nhập liệu nhưng không thay thế quyết định bổ nhiệm ngoài hệ thống; quy trình quản trị con người vẫn cần biên bản/custodian khác.
- Không có emergency global delegation/Acting Parish Leader. Đây là deferred có chủ ý; chỉ thiết kế sau khi pilot chứng minh nhu cầu.
- Không tuyên bố reminder/push máy thật, multi-instance hay notification provider exactly-once từ thay đổi authorization này.

## Sources

[^1]: OWASP Cheat Sheet Series, [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
[^2]: NIST CSRC, [Role Based Access Control FAQ](https://csrc.nist.gov/projects/role-based-access-control/faqs) và [Separation of Duty glossary](https://csrc.nist.gov/glossary/term/Separation_of_Duty).
[^3]: OWASP Cheat Sheet Series, [Transaction Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html).
[^4]: Google Research, [Zanzibar: Google's Consistent, Global Authorization System](https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/), USENIX ATC 2019.
