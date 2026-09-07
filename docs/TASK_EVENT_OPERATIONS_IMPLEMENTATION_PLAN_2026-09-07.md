# Catevia Task & Event Operations Implementation Plan

Status: Proposed
Date: 2026-09-07
Scope: Hệ thống phân công nhiệm vụ và tổ chức sự kiện cho vận hành giáo xứ/xứ đoàn

## 1. Executive decision

Catevia nên xây một bounded context `Operations`, không mở rộng `catechist_assignments` thành hệ thống giao việc và không biến `parish_events` hiện tại thành một event-platform đầy đủ.

Quyền Operations phải dùng mô hình ba lớp, không trộn các tầng:

```text
ACCOUNT ROLE
admin / chunhiem / phuta / phuhuynh
  -> baseline security

ORGANIZATIONAL POSITION
Trưởng Xứ đoàn / Trưởng ngành / Trưởng ban / Thành viên Ban / ...
  -> permanent or term-based organizational scope

OPERATION ROLE
Event Organizer / Workstream Lead / Task Owner /
Contributor / Approver / Observer
  -> event/workstream/task-specific responsibility
```

Ví dụ một actor có thể là `chunhiem`, giữ position `Trưởng ngành Thiếu Nhi`, được grant `Event Organizer` cho Trại Hè, và là `OWNER` của một task cụ thể. Account role không được dùng để encode chức danh tổ chức hoặc operational role.

Mô hình đề xuất:

```text
Event / chương trình
  -> work breakdown: task, checklist, dependency
  -> assignment: owner, participant, role, acknowledgement
  -> execution: status, evidence, comment, completion note
  -> communication: reminder, notification, escalation
  -> review: outcome, attendance, cost/evidence, retrospective
```

`parish_events` hiện tại tiếp tục phục vụ lịch công khai/lightweight. Event operations mới có thể liên kết tới event hiện hữu bằng `event_id`, rồi bổ sung các capability vận hành ở bounded context riêng.

## 2. Nghiên cứu benchmark

### Asana / Microsoft Planner: work management

Các pattern đáng lấy:

- Task luôn có owner, trạng thái, mức ưu tiên, deadline và activity history.
- Subtask/checklist dùng để biến mục tiêu lớn thành công việc có thể kiểm chứng.
- Board/list/calendar là các view khác nhau trên cùng một work item, không phải ba nguồn dữ liệu.
- Assignment cần có acknowledgement và completion signal; “đã gửi thông báo” không đồng nghĩa “đã nhận việc”.

Không nên bê nguyên:

- Portfolio, workload planning, automation rule và dependency graph sâu vào MVP.
- Quá nhiều custom field khiến người dùng giáo xứ ngại nhập liệu.

### monday.com: operational board

Các pattern đáng lấy:

- Một board là nơi điều phối tiến độ; grouping theo giai đoạn/event giúp nhìn nhanh việc đang tắc.
- Status, people, date, files và update/comment là các primitive hữu ích.
- Subitems phù hợp cho checklist chuẩn bị sự kiện.

Điểm cần điều chỉnh:

- Catevia cần role-based workflow, không cho mọi người tự ý sửa mọi cột.
- Cần offline-safe mutation và audit, thay vì chỉ tối ưu trải nghiệm board.

### Cvent: event lifecycle

Các pattern đáng lấy:

- Event có lifecycle trước/trong/sau sự kiện.
- Agenda/session, speaker/role, attendee list, reminder và post-event reporting là các lớp riêng.
- Một event cần checklist readiness và owner cho từng workstream.

Không thuộc MVP:

- Ticketing, payment, public registration, room block và marketing campaign.
- CRM/lead capture trừ khi Catevia sau này có yêu cầu sự kiện mở rộng ra cộng đồng.

### Bizzabo: experience + integration

Các pattern đáng lấy:

- Một nguồn dữ liệu xuyên suốt từ planning tới event experience và hậu kiểm.
- Mobile-first notification, agenda, participant experience và integration.
- Sau sự kiện phải có dữ liệu outcome, không chỉ kết thúc bằng `COMPLETED`.

Không nên copy:

- Branded event app, sponsor/exhibitor, networking và streaming vào phiên bản đầu.

### Salesforce: orchestration

Các pattern đáng lấy ở mức khái niệm:

- Phân biệt record nghiệp vụ, workflow/approval và automation.
- Các action cần trace được actor, target, thời điểm và kết quả.
- Integration/event bus chỉ nên xuất hiện sau khi domain contract ổn định.

## 3. Product thesis cho Catevia

Đối tượng chính là admin, trưởng ngành/trưởng xứ đoàn, giáo lý viên và người phục vụ. Họ cần biết bốn điều trong vài giây:

1. Hôm nay/tuần này có sự kiện gì?
2. Tôi phải làm việc gì, hạn khi nào, đang bị chặn bởi ai?
3. Sự kiện đã sẵn sàng chưa và còn thiếu workstream nào?
4. Sau sự kiện, kết quả và việc follow-up là gì?

Mục tiêu MVP là giảm việc điều phối bằng chat/sổ tay, không phải xây một hệ thống quản trị doanh nghiệp tổng quát.

### 3.1. Quy tắc quyền cốt lõi

Permission engine phải trả lời:

```text
Can actor perform CAPABILITY within SCOPE on RESOURCE?
```

Không kiểm tra bằng tên chức danh hard-code. `admin` là technical/system authority và không tự động đồng nghĩa với `Trưởng Xứ đoàn`; ngược lại, `Trưởng Xứ đoàn` có thể có operational authority cấp Xứ đoàn nhưng không được reset password, đổi account role, backup database, cấu hình deployment hoặc xem security logs nếu không có capability kỹ thuật riêng.

Các lớp được resolve theo thứ tự:

1. Account role: xác thực, tenant boundary và baseline security.
2. Organizational position: lấy từ `parish_service_terms`, nối tới cây `parish_organization_units`, xác định scope mặc định và thời hạn hiệu lực.
3. Event/workstream/task grant: mở rộng hoặc giới hạn quyền trong resource cụ thể; grant có actor, scope, role, thời hạn, người cấp và audit.

Mọi quyết định authorization phải được kiểm tra server-side trong transaction hoặc cùng snapshot quyền nhất quán. Frontend route policy chỉ là fail-closed UX.

## 4. Phạm vi sản phẩm

### MVP 1: Event operations core

- Tạo event operation từ event lịch hiện tại hoặc tạo mới.
- Event lifecycle: `DRAFT -> PLANNING -> READY -> LIVE -> COMPLETED`; nhánh `CANCELLED`.
- Event detail gồm thời gian bắt đầu/kết thúc, địa điểm, organizer, mục tiêu, audience, notes.
- Template checklist theo loại event: trại, họp, huấn luyện, bí tích, tĩnh tâm, sinh hoạt.
- Task: title, description, status, priority, owner, due date/time, event link, parent task, checklist, completion note.
- Assignment nhiều người: `OWNER`, `CONTRIBUTOR`, `APPROVER`, `OBSERVER`; mỗi người có acknowledgement/status riêng.
- Board/list view, “việc của tôi”, overdue/upcoming và event readiness summary.
- Comment/update tối thiểu, audit activity và evidence link/file reference nếu storage đã có contract phù hợp.
- Reminder trước deadline/event, overdue notification và in-app unread state.
- Event-task linkage, không phá API đọc lịch hiện tại.

### MVP 1 không làm

- Public ticketing/payment.
- CRM, sponsor/exhibitor, networking, livestream.
- Resource capacity planning nâng cao.
- Dependency graph nhiều cấp, tự động tối ưu phân công.
- Workflow builder cho admin tự lập rule.
- Parent access vào task nội bộ.

### Phase 2: Coordination maturity

- Recurring event và template versioning.
- Task dependencies `BLOCKED_BY`, critical path nhẹ.
- Approval chain cho budget, publication hoặc high-risk event.
- Attendee/participant RSVP nội bộ, session/agenda.
- Escalation policy và delegation.
- Export ICS/CSV/PDF, dashboard theo tháng/học kỳ.
- Mobile push action: acknowledge, complete, snooze.

### Phase 3: Measurement and integration

- Post-event review, outcome metrics, attendance reconciliation.
- Cost/budget link tới finance khi business rule được phê duyệt.
- Integration với Telegram/push sâu hơn nhưng vẫn giữ target authorization.
- Public event portal chỉ khi có requirement rõ về đối tượng bên ngoài.

## 5. Domain model đề xuất

Không dùng `catechist_assignments` cho task. Giữ invariant hiện tại: phân lớp là bounded context riêng.

### `operations_events`

- `id`, `parish_id`, `source_parish_event_id` nullable
- `title`, `description`, `event_type`
- `starts_at`, `ends_at`, `timezone`, `location`
- `status`, `visibility`, `organizer_user_id`
- `audience`, `readiness_percent` derived, `version`
- `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`

- `scope_type`, `scope_unit_id` nullable: cấp `PARISH`, `BRANCH`, `COMMITTEE` hoặc `CHAPTER`.
- `organizer_person_id`, `organizer_user_id` nullable: tách người tổ chức khỏi account role.
- `created_by` không thay thế organizer và không tự cấp operational authority.

`parish_events` hiện tại vẫn là calendar source/lightweight record. `operations_events.source_parish_event_id` là liên kết, không phải lý do để thay đổi contract CRUD lịch hiện hữu.

### `operation_workstreams`

- `id`, `parish_id`, `operation_event_id`, `source_unit_id` nullable
- `name`, `description`, `status`, `sort_order`, `is_required`
- `leader_person_id`, `leader_user_id` nullable
- `scope_mode`: `UNIT_SCOPE` hoặc `EVENT_GRANT`
- `created_by`, `updated_by`, `version`, timestamps, `deleted_at`

Workstream là đơn vị điều phối event. `source_unit_id` trỏ tới `parish_organization_units` để kế thừa scope; `leader_*` là operational assignment theo event, không ghi đè Trưởng ban/Trưởng ngành thường trực trong `parish_service_terms`.

### `operation_workstream_members`

- `parish_id`, `workstream_id`, `person_id` hoặc `user_id`
- `operation_role`: `WORKSTREAM_LEAD`, `CONTRIBUTOR`, `APPROVER`, `OBSERVER`
- `assigned_by`, `assigned_at`, `starts_at`, `ends_at`, `version`

Một Trưởng ban thường trực có thể khác Workstream Lead của cùng ban trong một event. Workstream Lead điều phối workstream đó nhưng không được suy rộng thành quyền quản lý toàn event hoặc thành viên của đơn vị khác.

### `operation_tasks`

- `id`, `parish_id`, `operation_event_id` nullable, `workstream_id` nullable, `parent_task_id` nullable
- `title`, `description`, `status`, `priority`
- `due_at`, `started_at`, `completed_at`
- `created_by`, `updated_by`, `completed_by`, `completion_note`
- `sort_order`, `version`, `created_at`, `updated_at`, `deleted_at`

Task status MVP: `BACKLOG`, `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELLED`.

### `operation_task_assignees`

- `parish_id`, `task_id`, `user_id` hoặc `parish_person_id`
- `assignment_role`, `ack_status`, `assigned_by`, `assigned_at`
- `responded_at`, `completed_at`, `note`

`assignment_role` là task-level operational role (`OWNER`, `CONTRIBUTOR`, `APPROVER`, `OBSERVER`), không phải organizational position. Một workstream lead không mặc định là OWNER của mọi task trong workstream.

Chỉ cho `linked_user_id` nhận notification/action. `parish_people` chưa đăng nhập chỉ là participant/role record, không phải actor có quyền.

### `operation_checklist_items`

- `parish_id`, `task_id`, `label`, `is_required`, `is_done`
- `completed_by`, `completed_at`, `sort_order`

### `operation_dependencies`

Chỉ thêm ở Phase 2. Dùng `task_id`, `depends_on_task_id`, `type`, `parish_id`; cấm self-loop và kiểm tra cycle trong transaction.

### `operation_comments` / `operation_activity`

Activity nên là append-only audit domain record, không dùng notification table làm activity log.

### `operation_reminders`

- `parish_id`, `task_id/event_id`, `recipient_user_id`
- `trigger_at`, `kind`, `dedupe_key`, `status`, `attempt_count`, `sent_at`, `error`

Có thể tận dụng delivery queue hiện có nhưng phải phân biệt:

- domain reminder đã tạo;
- notification đã enqueue;
- provider delivery thành công/thất bại;
- user đã đọc/acknowledge.

## 6. State machine và business rules

### Event

- `DRAFT -> PLANNING`: bắt đầu lập kế hoạch.
- `PLANNING -> READY`: mọi required task hoàn tất hoặc được explicit override bởi người có quyền.
- `READY -> LIVE`: event bắt đầu.
- `LIVE -> COMPLETED`: ghi nhận outcome hoặc kết thúc.
- `DRAFT|PLANNING|READY -> CANCELLED`: bắt buộc reason.
- Không cho sửa các field nhạy cảm sau `LIVE` nếu không có quyền override và audit.

`READY` không chỉ là số phần trăm. Required task chưa done, owner bị thiếu, task quá hạn hoặc dependency bị block phải hiện thành reason cụ thể.

### Task

- Chỉ owner/assignee có quyền acknowledge và cập nhật execution fields.
- Người giao việc có thể reassign; reassign phải giữ lịch sử.
- `DONE` cần completion timestamp; required checklist chưa xong thì bị chặn, trừ override có reason.
- `BLOCKED` yêu cầu block reason và có thể liên kết dependency ở Phase 2.
- Delete là soft delete; task đã có activity không bị hard delete.
- Mọi mutation ghi tenant, actor, before/after và version.

### Assignment

- Server kiểm tra parish, user active, account baseline, organizational position/scope và event-specific grant trong cùng transaction.
- Không tự động gán một task nội bộ cho parent.
- Assignee phải có thể `ACCEPT`, `DECLINE` với reason hoặc `DELEGATE` nếu policy cho phép.
- Không gửi thông tin nhạy cảm của học sinh trong task notification body.

### Workstream readiness

- Workstream Lead được mark `READY` hoặc yêu cầu follow-up trong workstream của mình.
- Chỉ event authority được transition toàn event sang `READY`/`LIVE`.
- Override readiness bắt buộc capability cấp resource tương ứng, reason và audit; không dùng một cờ boolean không có provenance.

## 7. RBAC và phạm vi truy cập

Permission engine dùng capability + scope:

### Account baseline

- `admin`, `chunhiem`, `phuta`, `phuhuynh` chỉ là account roles hiện có.
- `phuhuynh` mặc định không có quyền Operations nội bộ.
- `admin` có technical capabilities hiện hành; không tự động được ghi nhận là organizer/position nếu chưa có grant nghiệp vụ.

### Organizational scope

Đọc từ `parish_organization_units` + `parish_service_terms`:

- `BOARD`: cấp Xứ đoàn, ví dụ Trưởng Xứ đoàn.
- `BRANCH`: cấp Ngành, ví dụ Trưởng ngành Thiếu Nhi.
- `COMMITTEE`: cấp Ban, ví dụ Ban Phụng vụ.
- `CHAPTER`: Chi đoàn/lớp hoặc đơn vị con.

Position scope mặc định:

- Trưởng Xứ đoàn: toàn Xứ đoàn, gồm ngành, ban, chi đoàn/lớp và event cấp Xứ đoàn.
- Trưởng ngành: ngành mình phụ trách và descendants được policy cho phép.
- Trưởng ban: ban/workstream thuộc ban mình phụ trách; không mặc nhiên quản lý ngành.
- Thành viên Ban: chỉ Ban được bổ nhiệm và các task/workstream được giao; không có quyền điều phối Ban mặc định.

### Operations capabilities

- `operations.event.view`
- `operations.event.create`
- `operations.event.manage`
- `operations.event.transition`
- `operations.event.cancel`
- `operations.event.override_readiness`
- `operations.workstream.create`
- `operations.workstream.manage`
- `operations.workstream.assign_lead`
- `operations.workstream.mark_ready`
- `operations.task.view`
- `operations.task.create`
- `operations.task.assign`
- `operations.task.execute`
- `operations.task.reassign`
- `operations.task.approve`
- `operations.audit.view`

### Resource-specific grant

Grant có dạng `actor + capability + resource_type + resource_id/scope + valid_from/to + granted_by + reason`. Ví dụ Trưởng ngành được grant `operations.event.manage` trên một event cấp Xứ đoàn; Trưởng ban được grant `WORKSTREAM_LEAD` trên workstream cụ thể. Grant không được mở rộng ngầm sang event, ban hoặc task khác.

### Capability matrix trọng tâm

| Capability | Trưởng Xứ đoàn | Trưởng ngành | Trưởng ban | Thành viên Ban | Workstream Lead | Task Owner |
| --- | --- | --- | --- | --- | --- | --- |
| Xem Operations trong scope | Toàn Xứ đoàn | Ngành | Ban | Ban được bổ nhiệm | Workstream | Task được giao |
| Tạo task | Xứ đoàn | Ngành | Ban | Không mặc định | Workstream nếu được grant | Không mặc định |
| Assign/reassign | Xứ đoàn | Trong ngành | Trong ban | Không mặc định | Trong workstream | Không mặc định |
| Tạo/quản lý workstream | Có | Nếu policy/grant | Không ngoài ban | Không | Không mặc định | Không |
| Mark workstream READY | Có | Phần ngành | Phần ban | Không | Có | Không |
| Transition event | Có theo policy | Chỉ nếu event grant | Không | Không | Không | Không |
| Override readiness | Có, reason + audit | Không toàn event | Không ngoài workstream | Không | Không | Không |
| Execute task | Nếu được giao | Nếu được giao | Nếu được giao | Nếu được giao | Nếu được giao | Có trong task được giao |
| Technical account/security | Không mặc định | Không | Không | Không | Không | Không |

Trưởng ban chịu trách nhiệm toàn workstream nhưng không cần là OWNER của từng task. Task Owner chịu trách nhiệm execution của task được giao.
Thành viên Ban là organizational member, không mặc định là `CONTRIBUTOR` của mọi task và không mặc định nhận quyền của Workstream Lead.

Frontend route policy chỉ là UX fail-closed. Backend vẫn là authority, giống contract hiện tại.

## 8. API surface đề xuất

Giữ response envelope hiện tại.

- `GET /api/operations/events?from=&to=&status=&owner=`
- `POST /api/operations/events`
- `GET /api/operations/events/:id`
- `PUT /api/operations/events/:id`
- `POST /api/operations/events/:id/transition`
- `POST /api/operations/events/:id/apply-template`
- `GET /api/operations/events/:id/readiness`
- `GET /api/operations/events/:id/permissions`
- `POST /api/operations/events/:id/grants`
- `POST /api/operations/events/:id/transition`
- `GET /api/operations/events/:id/workstreams`
- `POST /api/operations/events/:id/workstreams`
- `PUT /api/operations/workstreams/:id`
- `POST /api/operations/workstreams/:id/members`
- `POST /api/operations/workstreams/:id/ready`
- `GET /api/operations/tasks?mine=&status=&overdue=&eventId=`
- `POST /api/operations/tasks`
- `GET /api/operations/tasks/:id`
- `PUT /api/operations/tasks/:id`
- `POST /api/operations/tasks/:id/transition`
- `POST /api/operations/tasks/:id/acknowledge`
- `POST /api/operations/tasks/:id/assign`
- `POST /api/operations/tasks/:id/comments`
- `POST /api/operations/tasks/:id/checklist`
- `GET /api/operations/inbox`

Permission endpoint chỉ là explainability/UX aid; server không được tin kết quả từ client. Các command route phải re-evaluate capability + scope ngay trước mutation.

Mutation contract bắt buộc:

- `version` hoặc `If-Match` cho OCC, conflict trả `409 VERSION_CONFLICT`.
- Idempotency key cho transition, assignment và reminder enqueue.
- Mutation + audit/outbox trong cùng transaction khi có side effect.
- List query có filter server-side và không trả task ngoài parish/actor scope.

## 9. Frontend information architecture

### Desktop

Thêm workspace/tab `Vận hành` với ba điểm vào:

- `Tổng quan`: overdue, due soon, events needing attention, my assignments.
- `Sự kiện`: list/calendar/board theo event.
- `Việc của tôi`: inbox cá nhân, acknowledge, update, complete.

Event detail nên là trang làm việc chính, không phải modal dài:

- Header: status, readiness, organizer, date/location.
- Main: task board/list grouped by workstream.
- Side panel: event info, assignees, activity, reminders.
- Completion: outcome, attendance/evidence, follow-up tasks.

### Mobile

Ưu tiên inbox và action nhanh:

- “Việc của tôi hôm nay”.
- Acknowledge/decline/complete bằng một action rõ ràng.
- Event detail dạng section cuộn, checklist có touch target ổn định.
- Offline đọc cache và durable mutation queue; không optimistic publish/cancel nếu chưa có conflict UX.

## 10. Offline, notification và integrity

Đây là phần không được giản lược:

- Cache key phải scope theo `parishId:userId` như parish event store.
- Pull có revision/cursor; mutation queue giữ actor/tenant, idempotency và thứ tự parent/dependent.
- Tạm thời không queue mutation tạo task con nếu task cha chưa có server ID, hoặc phải có remapping contract rõ.
- Khi scope thay đổi, loại cache ngoài scope nhưng không xóa durable mutation chưa xử lý.
- Conflict phải hiển thị bản server và local, không tự ghi đè.
- Reminder scheduler dùng durable queue, lease, retry và dedupe key có sẵn trong hạ tầng notification.
- Notification inbox cần `read_at`, nhưng không dùng `notifications.status` để biểu diễn trạng thái task.
- Sensitive data minimization: title/body notification không chứa điểm, tên học sinh hoặc dữ liệu phụ huynh nếu không cần.

## 11. Migration và triển khai theo vertical slice

### Slice 0: contract and policy

- Chốt glossary, ba lớp quyền, capability/scope matrix, state transitions và event ownership.
- Map `parish_organization_units` + `parish_service_terms` vào position resolver; không thêm account roles cho chức danh.
- Chốt resource-specific grant, expiry, revoke và explainability/audit format.
- Viết ADR cho Operations bounded context.
- Chốt có dùng `parish_people` làm participant không đăng nhập trong MVP.

### Slice 1: task core

- Schema `operation_tasks`, `operation_task_assignees`, position/grant resolver, audit/activity.
- Service + route + capability/scope authorization, OCC/idempotency.
- `My Tasks` list và task detail tối giản.
- Tests: lifecycle, assignment, tenant isolation, version conflict, audit.

### Slice 2: event operations

- `operations_events`, link tới `parish_events`, event lifecycle.
- Event detail + template checklist + readiness.
- Preserve existing `/api/parish-events` behavior and tests.

### Slice 3: notification and offline

- Reminder scheduling, in-app read/unread, push/Telegram integration theo target.
- Dexie/cache/store/sync integration.
- Tests restart recovery, duplicate suppression, offline replay, scope change.

### Slice 4: mobile and post-event

- Mobile inbox/action flow.
- Complete event, outcome, follow-up task.
- E2E critical path: create event -> assign -> acknowledge -> complete -> ready/live/completed.

### Slice 5: Phase 2 extensions

- Recurrence, dependencies, approvals, RSVP/session, exports.
- Mỗi extension phải có business rule/ADR trước khi schema hóa.

## 12. Verification plan

### Backend unit/integration

- Event/task tenant isolation: cross-parish read/write fail closed.
- Three-layer authorization matrix cho account role, organizational position, event/workstream/task role.
- Position expiry/revoke, nested unit scope và event-specific grant narrowing/expansion.
- Trưởng Xứ đoàn không có technical admin capabilities nếu không được cấp riêng.
- Trưởng ban thường trực và Workstream Lead có thể là hai người khác nhau.
- Workstream Lead không thể transition toàn event hoặc override workstream khác.
- State transition table, invalid transition và cancel reason.
- Concurrent update trả `409` và không mất mutation.
- Assignment/reassignment/decline/acknowledge atomicity.
- Required checklist/readiness calculation.
- Notification dedupe, retry, lease recovery và target authorization.
- Soft delete và audit before/after.

### Frontend

- Route policy fail-closed.
- Store response validation và cache namespace.
- Offline read, queued mutation, replay và conflict handling.
- No binary success UI cho batch/partial outcomes.

### E2E critical path

1. Admin tạo operation event từ lịch.
2. Tạo template tasks và phân công.
3. Người nhận acknowledge.
4. Một task bị block và readiness hiển thị đúng lý do.
5. Hoàn thành task/checklist, event chuyển READY/LIVE/COMPLETED.
6. Reminder tạo đúng một lần và inbox cập nhật read state.

## 13. Success metrics sau pilot

Đo theo một pilot 2-4 giáo xứ hoặc 1 xứ đoàn có nhiều event:

- Tỷ lệ task có owner và deadline.
- Tỷ lệ assignee acknowledge trong 24 giờ.
- Tỷ lệ task hoàn thành trước deadline.
- Số task overdue trên mỗi event.
- Thời gian từ tạo event tới trạng thái READY.
- Tỷ lệ event có required task chưa hoàn thành khi bắt đầu.
- Tỷ lệ notification duplicate/failure.
- Tỷ lệ conflict/offline replay failure.
- Số event cần quay lại chat/sổ ngoài hệ thống để biết trạng thái.

Không đặt KPI “số task tạo ra” làm mục tiêu; hệ thống tốt là hệ thống giảm việc mơ hồ và giảm follow-up thủ công.

## 14. Quyết định cần chốt trước khi code

- Event operations dùng chung event lịch hay tạo event record độc lập rồi sync một chiều?
- `chunhiem` có được phân công `phuta` ngoài lớp mình phụ trách không?
- Có cần cho người chưa có user account làm participant/assignee ở MVP không?
- Reminder mặc định là trước deadline bao lâu, và ai được snooze?
- Event `READY` có bắt buộc approval của admin không?
- Evidence dùng file upload hiện có hay chỉ URL/note ở MVP?
- Có cần budget/cost trong MVP hay để Phase 2 sau khi finance contract rõ?

## 15. Risk register

- **Scope creep từ event platform doanh nghiệp:** giữ ticketing/CRM/marketing ngoài MVP.
- **Nhầm lẫn giữa class assignment và task assignment:** không dùng chung bảng/service.
- **Notification thành nguồn sự thật giả:** tách delivery, read state và task state.
- **Offline conflict làm mất việc:** dùng OCC, durable queue và explicit conflict UI.
- **Task tạo nhưng không ai chịu trách nhiệm:** chặn publish/READY nếu required workstream thiếu owner.
- **Quyền frontend rộng hơn backend:** thêm authorization matrix tests trước khi mở UI.
- **Event model hiện tại bị breaking change:** link bằng `source_parish_event_id`, giữ contract đọc lịch cũ.

## 16. Nguồn tham khảo đã đối chiếu

- Asana Tasks: https://asana.com/guide/help/tasks
- monday.com Event Management: https://monday.com/lp/event-management-software
- monday.com Calendar View: https://support.monday.com/hc/en-us/articles/360000221209-How-to-use-the-Calendar-view
- Cvent Event Management: https://www.cvent.com/en/event-marketing-management/event-management-software
- Salesforce Event Management overview: https://www.salesforce.com/products/event-management/overview/
- Bizzabo Event Management Software: https://www.bizzabo.com/event-management-software

Các nguồn trên là benchmark capability/product positioning. Quyết định triển khai Catevia phải ưu tiên observed architecture hiện tại, business rule được phê duyệt và các invariant tenant/RBAC/offline/data integrity của repository.
