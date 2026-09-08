# Catevia Task & Event Operations Implementation Plan

Status: Online-first write MVP plus encrypted offline read projection implemented and locally engineering-verified; pilot/release gates remain
Date: 2026-09-07
Scope: Hệ thống phân công nhiệm vụ và tổ chức sự kiện cho vận hành giáo xứ/xứ đoàn

## Hướng phát triển tiếp — nghiên cứu ngày 2026-09-08

### Checkpoint P0 — approval validity

### Continuation — session ownership và chi tiết nhiệm vụ độc lập

P2 closure UX: màn LIVE liệt kê required task chưa DONE và khóa nút hoàn tất kể cả đã nhập summary/readiness 100%; CANCELLED không bị hiểu thành hoàn tất. Đây là UX từ snapshot; backend vẫn kiểm tra transaction. Phase schema/migration và start-readiness theo phase vẫn còn mở.

P2 bắt đầu bằng closure gate độc lập với schema phase: backend chặn COMPLETED nếu required task còn chưa DONE, kể cả có readiness override; không thay đổi event đã đóng. Regression 27/27 backend đạt, gồm start-with-override rồi thử đóng khi task TODO. Schema phase, readiness theo phase, UI closure blockers và migration/recovery vẫn còn phải triển khai; chưa đóng P2.

E2E handover 2026-09-09 PASS: đổi OWNER qua UI, thấy deadline-blockout warning sau refresh, không thấy private reason, read-back chỉ một OWNER PENDING đúng person mới, API mine của người cũ không còn task. Harness dọn sandbox. Kết hợp E2E standalone approval/evidence và lifecycle đã chạy riêng, các đường P1 chính có bằng chứng cross-layer; chưa suy ra hoàn tất P2–P5 hoặc kiểm chứng thiết bị/production.

E2E 2026-09-09: luồng standalone approval/evidence đã PASS qua browser → API → database sandbox: staff nhận vai trò APPROVER, mở queue, gửi comment HTTPS, duyệt, read-back approval/comment, tải queue xác nhận task đã rời. Test lifecycle cũ không chạy lại trong lượt này (đã PASS riêng trước đó). Sandbox của run được harness dọn. Bàn giao UI vẫn cần E2E riêng; P2 chưa có schema phase và completion gate tương ứng.

Xác minh handover blockout: regression sử dụng blockout person thật, bàn giao qua linked user, kiểm tra khoảng thời gian cảnh báo, không có private reason và replay giữ cùng warning. Backend + handover form: 29 tests đạt; frontend TypeScript, server build và lint đạt. E2E lifecycle hiện tại đang được kiểm tra lại, không suy rộng thành E2E cho toàn bộ hành động P1 mới.

Handover đã nối cảnh báo blockout deadline từ transaction backend qua response tới cảnh báo task detail, giữ trong store để không mất khi detail được tải lại. Không trả lý do báo bận. Cần bổ sung regression có blockout thật và E2E trước khi đóng hạng mục này.

Checkpoint xác minh quyền nhóm: 26 backend Operations tests đạt; regression mới chứng minh APPROVER workstream thấy queue dù không có direct assignment và mất queue sau revoke. Queue UI xóa dữ liệu cũ nếu refresh lỗi thay vì giữ các hành động dựa trên snapshot không xác nhận được. E2E, cảnh báo bận trên handover và các phase P2–P5 vẫn chưa hoàn tất.

Checkpoint 2026-09-09: hàng chờ duyệt lấy từ backend qua `queue=approval`, lọc capability view/approve trước phân trang, không dựa riêng `mine=true`. UI có tải/tải thêm/mở task và EmptyState chuẩn; xóa projection khi offline. Backend/page 34 tests đạt; regression riêng cho quyền APPROVER theo workstream và E2E vẫn còn mở. Không coi P1–P5 đã hoàn tất.

Checkpoint refresh sau mutation: duyệt/comment/handover gọi refreshTaskViews để tải lại overview, event readiness (nếu đang mở event chứa task), rồi task detail. Session/selection generation ngăn mở lại task đã đóng hoặc ghi đè selection mới. Detail cũng kiểm tra parish/task cho assignees/comments trước khi cập nhật projection event. Regression store 23/23 đạt; suite store/page trước bổ sung readiness 32/32 đạt. Cảnh báo blockout trên handover và E2E vẫn chưa đóng.

Checkpoint bàn giao UI: TaskHandoverForm đã nối command nguyên tử, gửi cả task/assignment version, yêu cầu lý do và lọc người hiện tại khỏi danh sách; lỗi giữ draft và không tự đổi detail. Regression: 3 tests form + 33 tests backend/page đạt, bao gồm từ chối alias user→person và giữ nguyên assignment/version. P1 vẫn mở: refresh các projection ngoài detail sau bàn giao/duyệt, inbox chờ duyệt, E2E và blockout warning trên đường handover cần hoàn thiện.

Checkpoint tiếp: comment hỗ trợ nhập liên kết minh chứng HTTPS (4 panel tests đạt). Backend đã có command handover nguyên tử với task/assignment OCC, receipt, kiểm tra target và audit; 24 Operations backend tests đạt. Giao diện bàn giao chưa nối, alias user/person đã được chặn ở implementation nhưng còn cần regression riêng. Chưa coi P1 hoàn thành.

P1 tiếp tục: đã có panel duyệt/yêu cầu chỉnh sửa và trao đổi từ task detail. Dùng capability máy chủ, version hiện tại, API receipt hiện có; không bổ sung quyền từ account role. Task terminal không hiện duyệt, vẫn cho comment retrospective theo capability. Khi lỗi có đường tải lại detail. Chưa đóng P1: OWNER handover nguyên tử, inbox lọc chờ duyệt, minh chứng đính kèm khi viết comment và E2E còn cần hoàn thiện.

Create event, transition event/task và acknowledgement đã kiểm tra generation của phiên, kể cả đăng nhập lại cùng user; lỗi phản hồi từ phiên cũ không ghi vào store mới. “Việc của tôi” có nút mở trực tiếp task detail/checklist, hiển thị description và trạng thái duyệt mà không phụ thuộc selectedEvent. Khi đổi task, detail cũ được ẩn trong lúc tải. Đây là bước đầu P1; approval/comment/atomic OWNER handover UX còn phải triển khai, và E2E độc lập chưa được chứng minh. Regression giao diện: 9/9 đạt.

Đã nối trạng thái duyệt sau thay đổi checklist từ transaction máy chủ tới task detail và danh sách nhiệm vụ. Checklist bắt buộc thay đổi thực tế sẽ trả approval về PENDING, giữ lịch sử trước/sau; gửi lại cùng giá trị không hủy approval. Version và approval được cập nhật cùng CAS, không có lần ghi approval rời. Kiểm thử Operations backend + store: 42/42 đạt. Đây là checkpoint P0, không phải tuyên bố P1–P5 hoặc pilot đã hoàn tất.

[Nghiên cứu và lộ trình phát triển cá nhân hóa Catevia](TASK_EVENT_OPERATIONS_RESEARCH_ROADMAP_2026-09-08.md) đối chiếu current dirty worktree với nguồn chính thức của GitLab, Atlassian, Asana, Microsoft Planner, Planning Center, Google SRE và Cvent. Tài liệu phân biệt observed behavior, khoảng trống cần regression và đề xuất nghiệp vụ chưa phê duyệt; không coi tính năng sản phẩm khác là yêu cầu mặc định của Catevia.

**Trạng thái hiện tại đã hợp nhất:** event/task/workstream core, panel nhóm trong event, nhắc event/task và hủy PENDING đã có code. Task detail độc lập, đầy đủ approval/comment/bàn giao UX, warning bận đi hết user/person→UI, reschedule có OCC, member-validity UI và nhóm độc lập chưa hoàn tất. Các đoạn “continuation/checkpoint” bên dưới là lịch sử từng lần triển khai; câu cũ về chưa có nhắc task hoặc hủy lịch không còn mô tả snapshot hiện tại. Không dùng status đầu tài liệu để kết luận mọi user journey hoặc production đã được chứng nhận.

**Thứ tự thực thi đề xuất thay cho việc tiếp tục thêm hành động rời rạc:**

1. P0: regression và hardening response ownership/latest selection, cảnh báo bận, hiệu lực approval, đồng bộ tài liệu.
2. P1: chi tiết nhiệm vụ trực tiếp, “Chờ tôi nhận/duyệt”, bình luận và thay OWNER nguyên tử.
3. P2: tách PREPARATION/EXECUTION/FOLLOW_UP và gate bắt đầu/đóng sự kiện; cần duyệt Business Rules/ADR trước migration.
4. P3: quản lý nhắc theo resource và reschedule có version; kiểm tra lại due-time trong transaction của scheduler.
5. P4: nhóm độc lập, thời hạn membership, directory tối thiểu, báo bận/lịch phục vụ.
6. P5: tổng kết, follow-up và mẫu versioned sau pilot; chưa thêm recurrence engine.

Chi tiết contract, dependency, migration/recovery, acceptance và nguồn nghiên cứu nằm trong roadmap liên kết. Phê duyệt kế hoạch không tự thay authority/phase/approval/retention hiện hành; những thay đổi đó cần cập nhật SSOT cùng implementation. Lượt nghiên cứu này chỉ sửa tài liệu, không sửa code, chạy migration hoặc deploy.

Implementation checkpoint reviewed 2026-09-07 against HEAD `856a75e` plus the dirty worktree:

- **Present but unfinished:** migrations `20260907-182..212`, Drizzle declarations, `/api/operations`, an initial organization resolver, reminder producer, API/store, route policy and `/operations` page.
- **Verified broken before takeover:** server TypeScript reports five errors in the participant route because reminder fields were copied into the participant handler. No passing Operations test/build evidence existed at this checkpoint.
- **Foundation drift requiring repair:** task-assignee primary key permits only one assignee per role; event/resource scope is absent; operational roles are not authoritative inputs to the resolver; several compare-and-set updates do not check the affected row; acknowledge/approve/participant/blockout/reminder/dependency writes are not consistently transactional with audit; POST commands have no general mutation receipt; reminder status conflates enqueue with provider delivery; checklist, workstream-member, comment/activity and inbox contracts are incomplete.
- **Initial frontend only:** the page reads events and “my tasks” and offers acknowledge/decline/complete, but lacks creation/detail/readiness/checklist/workstream flows, tests, dashboard entry and offline projection.
- **Preserved boundary at takeover:** Operations writes remained online-first. Durable offline Operations mutations and private task caching were deferred until an Operations ADR defined encrypted scope, receipts, temp-ID mapping, reconciliation and conflict UX.

The implementation order below is corrected to repair these foundations before adding more UI. Unrelated dirty logo/landing changes are outside this plan and must remain untouched.

Completion checkpoint 2026-09-08 (same working tree, continuing rather than restarting):

- **Foundation repaired:** migrations now span `20260907-182..226` and `20260908-227..235`; schema health covers all Operations tables, indexes, receipt-compaction marker, Telegram-retirement marker and cross-context integrity triggers. Assignment and membership have independent identity, version, soft revoke and scoped uniqueness.
- **Authority implemented:** server resolver composes staff account baseline, explicit active `parish_service_terms.position_code` + unit scope, and event/workstream/task role. Admin domain-management authority excludes task execution/approval by implication. Exact position-code/unit compatibility is enforced by service and database triggers; active/expired scope, a deputy title without a leader code, and operational-role expiry are covered by integration tests.
- **Acknowledgement is authoritative:** task assignment creates visibility and an explicit response obligation, but only `ACCEPTED` OWNER/CONTRIBUTOR/APPROVER roles grant execute/approve capability. A pending or declined OWNER does not satisfy readiness.
- **Command integrity implemented:** every Operations `POST|PUT` requires a receipt-backed `Idempotency-Key`; aggregate mutations use OCC/CAS, audit and domain writes in one transaction. Reassignment/revoke, participant OCC and dependency-cycle/readiness gates are present. Response bodies of old receipts can be policy-gated compacted while key/command/hash tombstones remain; late replay fails closed with `IDEMPOTENCY_REPLAY_EXPIRED` rather than executing twice.
- **Calendar boundary repaired:** `parish_events` remains the public calendar source. Operations public-summary projection joins and serializes canonical calendar fields rather than the potentially different private operation title/date/location.
- **Notification semantics repaired:** reminder enqueue and a deterministic durable notification row commit atomically; Operations marks `SENT` only after Web/Native Push delivery state becomes `sent`. The shared worker revalidates the targeted user as same-parish and active immediately before provider delivery, and ambiguous missing queue ownership is terminal rather than auto-replayed. ADR-111 retires Telegram globally without changing the Operations domain contract; migration/startup terminalizes legacy Telegram work rather than replaying it.
- **Frontend vertical slice implemented:** organization dashboard entry, responsive Design System workspace, event create/detail/readiness/lifecycle, task create/assign, direct task checklist, personal acknowledge/complete and reminder inbox read-state. The overview has an encrypted exact-`parishId:userId` server-confirmed event/task read cache with stale timestamp; reminder inbox and permissions are deliberately excluded from cache, and every mutation remains disabled until a fresh server snapshot is obtained.
- **Deliberately deferred:** generic grants/workflow, templates, recurrence, delegate/snooze, budget/finance, RSVP/public registration, attachment upload and durable offline Operations **mutations**. These are not required to make the current online-first write MVP coherent and still lack approved conflict/remap/business semantics.

Residual-risk hardening checkpoint 2026-09-08:

P0 roadmap execution checkpoint: 5 newly added failing regressions reproduced stale detail overwrite/error, reset resurrection, cross-selection assignment append and same-parish account-switch task creation. Store now uses detail/overview request generations and reset generation for scoped requests; createTask/assignTask responses validate ownership, task/event identity and do not apply to another selected event. Offline overview fallback discards details and assignment warnings. Assignment blockout lookup now resolves linked person/user consistently and returns only id/time intervals; UI exposes the persisted-assignment warning without implying acceptance or full service-shift conflict detection. Initial targeted backend/store/page run passed 47 tests; subsequent new tests cover successful response after close and rendered warning. Approval invalidation and remaining P0 command/session cases are still pending, not claimed complete.

Task reminder authoring continuation: the shared reminder form now accepts a task detail and requires its current task.assign capability, exact event/parish relationship and nonterminal task status. It sends only taskId/TASK_DUE, never both eventId and taskId, through the existing receipt-backed command. The form appears for the task opened through Checklist in the event workspace. Event-level management does not substitute for task permission. Standalone task navigation remains separate work.

Rescheduling research: reminders have no monotonic version. An expected-triggerAt-only check would miss an ABA change (time changed away then back), so no such partial OCC contract is introduced. Implementing editing still requires either a migration-backed version on create/edit/cancel/enqueue transitions or an atomic immutable replacement preserving old dedupe/receipt history, plus concurrent scheduler tests. Pending cancellation is delivered; rescheduling is not.

Pending-reminder cancellation continuation: `POST /reminders/:id/cancel` accepts a required reason and receipt key. The recipient may cancel their own pending reminder; another actor needs task.assign/event.manage on its current resource. Tenant lookup, PENDING compare-and-set, audit and receipt commit together. ENQUEUED/SENT/FAILED/CANCELLED reject new cancellation commands with 409; same-key replay returns the committed receipt. Inbox exposes cancellation only for PENDING rows and applies server acknowledgement only in the original account scope. This deliberately does not claim recall after queue handoff, and does not mutate the shared provider queue. Editing/rescheduling is not silently implemented as cancel-then-create because that would need an atomic replacement contract.

Event reminder authoring continuation: the event-local form now schedules an exact linked active-person account through the existing receipt-backed command. It requires fresh online state, event.manage and a planning-phase event; backend remains authoritative for active staff/tenant/resource visibility and rechecks recipients at delivery. The form rejects past/invalid local timestamps, converts to UTC, prevents concurrent submissions and ignores responses after account change/disposal. Success means schedule persisted, not provider/device delivery. Task-specific authoring, editing/cancelling schedules, role validity editing and standalone workstream navigation remain outside this delivered form; no automatic recurrence or offline write queue is added.

Workstream UI implementation sequence (2026-09-08 continuation):
1. Extend the typed client with scoped detail, create, member add/revoke and readiness commands; preserve receipt keys and aggregate versions.
2. Add an event-local manager panel using existing Design System controls. Read current workstream permissions before member/readiness actions; disallow writes without fresh server state and outside DRAFT/PLANNING/READY events. Assign tasks to an event workstream explicitly.
3. Guard in-flight responses against component disposal and parish/user changes; refresh detail after commands and on conflicts instead of optimistic version fabrication.
4. Verify component permission/offline gates, command payload/version and server integration; run relevant type/lint/Design System checks. Keep device/production validation distinct from local evidence.

- **Deferred reassessment — delivered:** scoped workstream detail, typed commands and event-local management UI now support group creation, member assignment/revocation, readiness/blocking, and selecting a group on task creation. Writes use server permissions, aggregate/member versions and existing receipt-backed commands. A failed mutation discards stale controls and requires explicit group reload; no automatic replay. The panel guards account changes, disposal and overlapping submissions. It is online-only and configuration writes are hidden outside DRAFT/PLANNING/READY. Optional membership validity editing and standalone workstream navigation are not included in this event-local slice.
- **Current workstream verification:** OperationsPage component tests 7/7; WorkstreamPanel tests 5/5 including resource permission, offline, account-switch and conflict cases; TypeScript project check, lint and Design System guard passed (0 violations/135 files). Extended real-backend Chromium E2E passed 1/1: create required group, assign lead, mark ready, create task in group, accept/complete as that lead, then complete event with server read-back. Initial 30-second run timed out; the expanded two-user journey now has a 90-second test budget, with no arbitrary waits or assertions removed; isolated rerun test body completed in 9 seconds. This is local workflow evidence, not device/production certification.
- **Multi-role correctness:** organizer/workstream-lead evaluation previously returned before considering accepted task roles. Personal execute/approve checks now compose with management roles without granting either capability implicitly. Regression coverage exercises both manager roles, pending vs accepted assignment, actual task transition/approval, and workstream detail tenant/revocation boundaries. Current focused Operations integration suite: **21/21 passed**.
- **Deferred order:** finish workstream management UI first, then evaluate reminder authoring against its existing scoped command. Durable offline writes need ownership/reconciliation/conflict design before implementation; retention duration must not be guessed; recurrence/templates/RSVP remain separate business-scope decisions rather than automatic additions.

- Authority-bearing event changes (scope, organizer, public calendar link/visibility) and workstream re-scope now require organizational create authority in the destination scope; an organizer/lead cannot use resource-local management permission to expand organizational scope.
- Authorization rejects mixed `eventId`/`workstreamId`/`taskId` combinations that do not belong to the same resource graph; permission explainability can no longer combine unrelated operational roles.
- API instants are canonicalized to UTC before persistence, so offset strings cannot break lexicographic expiry, overdue or blockout comparisons.
- Required cancelled tasks remain readiness blockers; a rejected approval cannot be completed; task cancellation requires a persisted reason and has a database trigger backstop.
- Pending or declined task assignments no longer grant execute/approve authority, and readiness requires an active, nondeleted staff account behind the accepted OWNER/required workstream lead. Parent accounts and parent-linked people cannot be operational assignees/leads/organizers/reminder recipients; an unlinked active person may remain a planning record but cannot satisfy actionable readiness.
- `DONE|CANCELLED` tasks reject later structural, assignment, checklist, dependency and approval mutations; event configuration becomes immutable at `LIVE`; completed/cancelled events reject new tasks, workstreams, participants and reminders. `READY -> LIVE` recomputes readiness so work added after READY cannot bypass the gate. Retrospective comments and attendance reconciliation remain explicitly separate history/correction paths.
- Reminder creation and due processing both recompute the recipient's current resource visibility. Revoked/locked/out-of-scope recipients and reminders for already terminal resources fail terminal before enqueue; the external message is generic so a post-enqueue authority change cannot disclose an internal title.
- Completing a public-source operation event always inserts a new Operations-owned `ACTIVITY` record in the same idempotent transaction. It never updates an arbitrary existing `parish_record`, because `parish_records.source_event_id` is a nonunique soft history link rather than an ownership key.
- Private events/workstreams/tasks/reminder inbox are paginated with the repository's established 50-row default and 500-row request cap; Operations UI exposes load-more and total counts. List authorization now loads one actor snapshot and decides the already-loaded resource graph in batch, eliminating authorization N+1 behavior while preserving the same three-layer policy. A representative production/pilot latency target remains evidence-gated.
- Production browser preflight now permits `Idempotency-Key` and `X-Idempotency-Key`; without this, cross-origin Operations commands could pass same-origin E2E yet fail in the deployed browser.
- Reminder inbox now selects only user-facing fields and paginates/counts in SQL. It no longer sends dedupe keys, queue notification IDs, attempt counters, provider errors, recipient IDs or stale resource IDs to the browser.

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

`parish_events` hiện tại tiếp tục là **nguồn duy nhất của lịch công khai/lightweight**. `operation_events` là aggregate điều phối nội bộ và có thể liên kết một-đối-một tới `parish_events`; nó không tự trở thành writer lịch thứ hai. Event nội bộ có thể không có link. Event đánh dấu `PUBLIC_SUMMARY` phải có `source_parish_event_id`; phần công khai vẫn được đọc từ row `parish_events`, không serialize task/assignee/comment từ Operations.

### 1.1. Quyết định giảm phức tạp sau audit

- MVP không thêm generic workflow engine hoặc bảng grant tùy ý. Capability được suy ra server-side từ ba nguồn có cấu trúc: account baseline, nhiệm kỳ tổ chức đang hiệu lực, và role gắn resource (`organizer`, workstream membership, task assignment). Generic temporary grant chỉ được thêm khi có use case không biểu diễn được bằng ba nguồn này.
- `operation_workstream_members` là nguồn thật của role theo workstream. Các cột leader ban đầu trong WIP phải được migrate/backfill rồi không được dùng như nguồn quyền song song.
- Task hỗ trợ nhiều `CONTRIBUTOR`/`APPROVER`/`OBSERVER` và tối đa một active `OWNER`; identity của assignment phải độc lập với role, không dùng `(task, role)` làm primary key.
- Dependencies và approval đã được code sớm hơn roadmap. Chúng được giữ lại để không hủy valid work, nhưng chỉ được coi là backend extension sau khi có cycle/OCC/audit/authorization tests; chúng không mở rộng MVP UI.
- KPI pilot ở §13 là metric candidate, không phải invariant hay release SLO. Security, tenant isolation, no-silent-loss và OCC là hard invariant không có error budget.

## 2. Nghiên cứu benchmark

### Asana / Microsoft Planner: work management

Các pattern đáng lấy:

- Task cần trạng thái, mức ưu tiên, deadline và activity history; draft task có thể chưa có owner, nhưng required readiness phải chặn cho tới khi có OWNER actionable đã nhận việc.
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
- Current MVP phải audit và không được báo thành công trước server ACK. Nếu sau này thêm offline write thì mutation phải durable/tenant-scoped theo contract riêng, không mô phỏng thành công cục bộ.

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
3. Event/workstream/task role: organizer, membership hoặc assignment mở quyền trong đúng resource; role có target, phạm vi, thời hạn/revoke khi áp dụng, người cấp và audit. Generic grant table chưa thuộc MVP.

Mọi quyết định authorization phải được kiểm tra server-side trong transaction hoặc cùng snapshot quyền nhất quán. Frontend route policy chỉ là fail-closed UX.

## 4. Phạm vi sản phẩm

### MVP 1: Event operations core

- Tạo event operation từ event lịch hiện tại hoặc tạo mới.
- Event lifecycle: `DRAFT -> PLANNING -> READY -> LIVE -> COMPLETED`; nhánh `CANCELLED`.
- Event detail gồm thời gian bắt đầu/kết thúc, địa điểm, organizer, mô tả, headcount, workstream/task và readiness.
- Checklist trực tiếp theo task; template checklist theo loại event được deferred cùng template versioning.
- Task: title, description, status, priority, owner, due date/time, event link, parent task, checklist, completion note.
- Assignment nhiều người: `OWNER`, `CONTRIBUTOR`, `APPROVER`, `OBSERVER`; mỗi người có acknowledgement/status riêng.
- Board/list view, “việc của tôi”, overdue/upcoming và event readiness summary.
- Comment/update tối thiểu, audit activity và evidence link/file reference nếu storage đã có contract phù hợp.
- Reminder tối thiểu trước deadline/event, overdue notification và in-app unread state; capability này phải hoàn thành trong Slice 1 để MVP nghiệm thu được.
- Headcount và danh sách participant nội bộ tối giản cho event cần chuẩn bị người/xe/ăn ở.
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
- RSVP/registration nâng cao, session/agenda và participant workflow đầy đủ.
- Escalation policy và delegation.
- Export ICS/CSV/PDF, dashboard theo tháng/học kỳ.
- Mobile push action: acknowledge, complete, snooze.

### Phase 3: Measurement and integration

- Post-event review, outcome metrics, attendance reconciliation.
- Cost/budget link tới finance khi business rule được phê duyệt.
- Integration Web/Native Push sâu hơn nhưng vẫn giữ target authorization; Telegram không còn thuộc roadmap theo ADR-111.
- Public event portal chỉ khi có requirement rõ về đối tượng bên ngoài.

## 5. Domain model đã chốt cho MVP hiện tại

Không dùng `catechist_assignments` cho task. Giữ invariant hiện tại: phân lớp là bounded context riêng.

### `operation_events`

- `id`, `parish_id`, `source_parish_event_id` nullable
- `title`, `description`, `event_type`
- `starts_at`, `ends_at`, `timezone`, `location`
- `status`, `visibility`, `scope_unit_id`
- `organizer_person_id` hoặc `organizer_user_id`, `expected_headcount`, `outcome_summary`, `version`
- `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`

- `scope_unit_id` nullable; loại/phạm vi được derive từ `parish_organization_units`, không lưu `scope_type` song song.
- `organizer_person_id`, `organizer_user_id` nullable và exactly-at-most-one: tách người tổ chức khỏi account role.
- `created_by` không thay thế organizer và không tự cấp operational authority.

`visibility` bắt buộc có semantics rõ: `INTERNAL` (chỉ actor có Operations scope) hoặc `PUBLIC_SUMMARY` (chỉ metadata đã duyệt để hiển thị công khai). Operations detail, task, comment, assignee, activity và reminder không bao giờ được serialize qua `/api/parish-events`.

`parish_events` hiện tại vẫn là calendar source/lightweight record. `operation_events.source_parish_event_id` là liên kết, không phải lý do để thay đổi contract CRUD lịch hiện hữu.

### `operation_workstreams`

- `id`, `parish_id`, `operation_event_id`, `source_unit_id` nullable
- `name`, `description`, `status`, `blocked_reason`, `is_required`
- `leader_person_id`, `leader_user_id` là cột compatibility đã backfill; authorization chỉ đọc `operation_workstream_members`
- `created_by`, `updated_by`, `version`, timestamps, `deleted_at`

Workstream là đơn vị điều phối event. `source_unit_id` trỏ tới `parish_organization_units` để kế thừa scope; membership `WORKSTREAM_LEAD` là operational assignment theo event, không ghi đè Trưởng ban/Trưởng ngành thường trực trong `parish_service_terms`.

### `operation_workstream_members`

- `parish_id`, `workstream_id`, `person_id` hoặc `user_id`
- `operation_role`: `WORKSTREAM_LEAD`, `CONTRIBUTOR`, `APPROVER`, `OBSERVER`
- `assigned_by`, `assigned_at`, `starts_at`, `ends_at`, `version`

Nếu bảng membership cho phép target là account hoặc `parish_people`, phải có invariant database và validator exactly-one: một dòng phải có đúng một trong `user_id` và `person_id`; cấm cả hai null và cấm cả hai cùng set. User target hoặc person liên kết một active staff account mới có thể hành động; unlinked person chỉ là planning record.

Một Trưởng ban thường trực có thể khác Workstream Lead của cùng ban trong một event. Workstream Lead điều phối workstream đó nhưng không được suy rộng thành quyền quản lý toàn event hoặc thành viên của đơn vị khác.

### `operation_tasks`

- `id`, `parish_id`, `operation_event_id` nullable, `workstream_id` nullable, `parent_task_id` nullable
- `title`, `description`, `status`, `priority`
- `due_at`, `started_at`, `completed_at`
- `created_by`, `updated_by`, `completed_by`, `completion_note`, `blocked_reason`, `cancellation_reason`
- `version`, `created_at`, `updated_at`, `deleted_at`

Task status MVP: `BACKLOG`, `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELLED`.

### `operation_task_assignees`

- `id`, `parish_id`, `task_id`, `user_id` hoặc `person_id`
- `assignment_role`, `ack_status`, `assigned_by`, `assigned_at`
- `responded_at`, `completed_at`, `note`, `version`, `removed_at`

`assignment_role` là task-level operational role (`OWNER`, `CONTRIBUTOR`, `APPROVER`, `OBSERVER`), không phải organizational position. Một workstream lead không mặc định là OWNER của mọi task trong workstream.

Chỉ user active thuộc staff baseline nhận Operations notification/action. `parish_people` chưa liên kết account chỉ là participant/role record, không phải actor có quyền hay readiness owner.

### `operation_checklist_items`

- `parish_id`, `task_id`, `label`, `is_required`, `is_done`
- `completed_by`, `completed_at`, `sort_order`

### `operation_task_dependencies`

Backend extension hiện hữu dùng `task_id`, `depends_on_task_id`, `dependency_type`, `parish_id`; cấm self-loop, khác event và cycle trong transaction. UI dependency graph nâng cao vẫn deferred.

### `operation_task_comments` và audit

Comment là append-only task record; security/business history dùng `audit_logs` ghi cùng transaction. Không có bảng `operation_activity` hoặc dùng notification table làm activity log.

### `operation_reminders`

- `parish_id`, `task_id/event_id`, `recipient_user_id`
- `trigger_at`, `kind`, `dedupe_key`, `status`, `attempt_count`, `sent_at`, `error`

- Unique constraint bắt buộc trên `(parish_id, dedupe_key)`.
- `dedupe_key` là domain idempotency key, không phải capability tự có của `notifications`.

Có thể tận dụng delivery queue hiện có nhưng phải tạo reminder domain record và dedupe trước khi enqueue; `notifications` hiện có lease/retry nhưng không có dedupe key/unique constraint. Phải phân biệt:

- domain reminder đã tạo;
- notification đã enqueue;
- provider delivery thành công/thất bại;
- user đã đọc/acknowledge.

Reminder retry không được tạo notification mới cho cùng `(parish_id, dedupe_key)`. Nếu enqueue sau khi transaction reminder commit bị lỗi, worker phải retry enqueue dựa trên reminder row, không insert reminder thứ hai.

## 6. State machine và business rules

### Event

- `DRAFT -> PLANNING`: bắt đầu lập kế hoạch.
- `PLANNING -> READY`: mọi required task hoàn tất hoặc được explicit override bởi người có quyền.
- `READY -> LIVE`: event bắt đầu.
- `LIVE -> COMPLETED`: ghi nhận outcome hoặc kết thúc.
- `DRAFT|PLANNING|READY -> CANCELLED`: bắt buộc reason.
- Không cho sửa event fields từ `LIVE`; current MVP không có hợp đồng override edit. Mở lại field sau LIVE cần decision/audit contract riêng.

`READY` không chỉ là số phần trăm. Required task chưa done, owner bị thiếu, task quá hạn hoặc dependency bị block phải hiện thành reason cụ thể.

### Task

- Chỉ owner/assignee có quyền acknowledge và cập nhật execution fields.
- Người giao việc có thể reassign; reassign phải giữ lịch sử.
- `DONE` cần completion timestamp; required checklist chưa xong thì bị chặn. Task yêu cầu approval chỉ được `DONE` sau `APPROVED`; `REJECTED` không phải trạng thái hoàn tất.
- `BLOCKED` yêu cầu block reason và có thể liên kết dependency ở Phase 2.
- `CANCELLED` yêu cầu cancellation reason; task required bị hủy vẫn là readiness blocker và chỉ event-authority override có reason mới cho phép event vượt blocker đó.
- Delete là soft delete; task đã có activity không bị hard delete.
- Mọi mutation ghi tenant, actor, before/after và version.

### Assignment

- Server kiểm tra parish, user active, account baseline, organizational position/scope và event-specific grant trong cùng transaction.
- Không tự động gán một task nội bộ cho parent.
- Assignee có thể `ACCEPT|DECLINE`; delegate vẫn deferred cho tới khi có policy về người cấp, scope và acknowledgement mới.
- Không gửi thông tin nhạy cảm của học sinh trong task notification body.

### Workstream readiness

- Workstream Lead được mark `READY` hoặc yêu cầu follow-up trong workstream của mình.
- Chỉ event authority được transition toàn event sang `READY`/`LIVE`.
- Override readiness bắt buộc capability cấp resource tương ứng, reason và audit; không dùng một cờ boolean không có provenance.

`readiness_percent` là derived value computed-on-read từ required workstream/task/checklist hiện tại; không lưu một số phần trăm có thể stale trong MVP. Nếu cần materialize ở scale lớn, phải có recompute transaction và test consistency.

## 7. RBAC và phạm vi truy cập

Permission engine dùng capability + scope:

### Account baseline

- `admin`, `chunhiem`, `phuta`, `phuhuynh` chỉ là account roles hiện có.
- `phuhuynh` mặc định không có quyền Operations nội bộ.
- `admin` có technical capabilities hiện hành; không tự động được ghi nhận là organizer/position nếu chưa có grant nghiệp vụ.

Migration authorization dùng strangler approach: giữ `roleMiddleware` làm baseline gate trong Slice 1, sau đó thêm `authorizeOperation(capability, resource)` phía sau gate. Từng route Operations chuyển dần sang resolver mới; chỉ xóa role-only gate sau khi matrix tests và audit chứng minh capability resolver bao phủ đủ. Không big-bang rewrite các route hiện hữu.

### Organizational scope

Đọc từ `parish_organization_units` + `parish_service_terms`:

`position_title` chỉ là nhãn hiển thị. Quyền được resolve bằng vocabulary kiểm soát `position_code = PARISH_LEADER|BRANCH_LEADER|COMMITTEE_LEADER`; code phải khớp loại unit, nhiệm kỳ hiệu lực và unit active. Migration chỉ backfill các legacy title khớp chính xác trong đúng loại unit; ví dụ `Phó trưởng ngành` không được suy thành `BRANCH_LEADER`.

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

### Resource-specific operational authority

MVP không lưu một bảng capability grant tổng quát. Quyền tạm thời gắn đúng aggregate:

- `operation_events.organizer_*` cấp quyền organizer trên đúng event;
- `operation_workstream_members` cấp `WORKSTREAM_LEAD|CONTRIBUTOR|APPROVER|OBSERVER` trên đúng workstream, có thời hạn/revoke/audit;
- `operation_task_assignees` cấp `OWNER|CONTRIBUTOR|APPROVER|OBSERVER` trên đúng task, có acknowledgement/revoke/audit; execute/approve chỉ có hiệu lực sau `ACCEPTED`.

Resolver ánh xạ các role có cấu trúc này sang capability. Không role nào tự mở rộng sang event/workstream/task khác. Nếu sau pilot cần một grant không tương ứng với responsibility trên resource, phải bổ sung decision riêng thay vì nhét chức danh vào `users.role`.

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

## 8. API surface hiện tại

Giữ response envelope hiện tại.

- `GET /api/operations/permissions?unitId=&eventId=&workstreamId=&taskId=`
- `GET /api/operations/events?page=&limit=` và `/events/public-summary`
- `POST /api/operations/events`
- `GET /api/operations/events/:id`
- `PUT /api/operations/events/:id` (đổi scope/organizer/public link hoặc visibility cần organizational create authority ở scope đích)
- `POST /api/operations/events/:id/transition`
- `GET /api/operations/events/:id/readiness`
- `GET /api/operations/events/:id/headcount`
- `POST /api/operations/events/:id/participants` và `/events/:eventId/participants/:participantId/status`
- `GET|POST /api/operations/workstreams`, `PUT /api/operations/workstreams/:id`
- `POST /api/operations/workstreams/:id/members`, `/members/:memberId/remove`
- `POST /api/operations/workstreams/:id/ready`
- `GET /api/operations/tasks?mine=&status=&overdue=&eventId=&page=&limit=`
- `POST /api/operations/tasks`
- `GET /api/operations/tasks/:id`
- `PUT /api/operations/tasks/:id`
- `POST /api/operations/tasks/:id/transition`
- `POST /api/operations/tasks/:id/acknowledge`
- `POST /api/operations/tasks/:id/assign`, `/assignments/:assignmentId/remove`
- `POST /api/operations/tasks/:id/comments`
- `POST /api/operations/tasks/:id/checklist`, `/tasks/:taskId/checklist/:itemId`
- `POST /api/operations/tasks/:id/dependencies`, `/tasks/:id/approve`
- `POST /api/operations/blockouts`
- `GET /api/operations/reminders/inbox`, `POST /api/operations/reminders`, `/reminders/:id/read`

Không có `apply-template`, generic `grants`, nested event-workstream route hoặc generic `/inbox` trong current contract; các tên đó không được xem là remaining implementation.

Permission endpoint chỉ trả capability/scope của caller hiện tại trên resource đã chỉ định, phục vụ explainability/UX aid; không nhận `userId` tuỳ ý để trở thành permission oracle. Server không được tin kết quả từ client. Các command route phải re-evaluate capability + scope ngay trước mutation.

Mutation contract bắt buộc:

- Aggregate/independent mutable row gửi `version`; stale conflict trả `409 VERSION_CONFLICT`.
- Mọi `POST|PUT` gửi idempotency key, không chỉ transition/assignment/reminder.
- Domain mutation + redacted audit + idempotency receipt nằm trong cùng transaction khi command có audit.
- List query áp dụng tenant/resource authorization trước khi tính total và slice; current in-memory candidate materialization là load risk đã ghi ở §14–15.
- Mọi timestamp có offset được canonicalize thành UTC ISO instant trước khi lưu; IANA timezone của event vẫn được giữ riêng để trình bày.

## 9. Frontend information architecture

### Desktop

Current `/operations` là một responsive workspace duy nhất để giữ MVP gọn:

- Thẻ tổng quan: event, việc của tôi, chờ phản hồi, đang bị chặn.
- Hai danh sách chính: event trong scope và task của tôi; hỗ trợ pagination/load-more.
- Event detail inline: readiness blockers, task list, direct checklist, create task/assign và lifecycle DRAFT→PLANNING→READY→LIVE→COMPLETED theo capability/OCC; cancellation reason và completion outcome được nhập tại cùng workspace.
- Reminder inbox có read/unread online-only và không hydrate từ cache. Board/calendar riêng, activity side panel và reminder authoring là UX mở rộng; không được xem là backend gap của MVP.

### Mobile

Ưu tiên inbox và action nhanh:

- “Việc của tôi hôm nay”.
- Acknowledge/decline/complete bằng một action rõ ràng.
- Event detail dạng section cuộn, checklist có touch target ổn định.
- Overview persist một read projection đã server-confirmed qua `dexieStorage`, được mã hóa và namespace theo `parishId:userId`. Khi transport thật sự mất kết nối, UI có thể hiển thị snapshot cùng thời điểm lưu; cache sai scope/mixed-tenant bị từ chối. Cached permissions không được hydrate và mọi mutation/detail refresh bị khóa cho tới khi có snapshot server mới. Durable mutation vẫn là future slice sau ADR conflict/ownership/remap.

## 10. Notification, integrity và future offline contract

Notification/integrity và encrypted read cache là current MVP. Durable mutation/pull reconciliation bên dưới vẫn là **future contract đã deferred**, không phải capability hiện có:

- **Đã triển khai cho read projection:** cache key scope theo `parishId:userId`, payload lặp lại scope để fail closed và chỉ lưu response server đã xác nhận; không persist permission để tránh authority snapshot trở thành guard.
- Pull có revision/cursor; mutation queue giữ actor/tenant, idempotency và thứ tự parent/dependent.
- Tạm thời không queue mutation tạo task con nếu task cha chưa có server ID, hoặc phải có remapping contract rõ.
- Khi scope thay đổi, loại cache ngoài scope nhưng không xóa durable mutation chưa xử lý.
- Conflict phải hiển thị bản server và local, không tự ghi đè.
- Reminder delivery dùng durable queue, lease và retry của notification infrastructure; deduplication bắt buộc dựa trên `operation_reminders` và unique `(parish_id, dedupe_key)`.
- Notification inbox cần `read_at`, nhưng không dùng `notifications.status` để biểu diễn trạng thái task.
- Sensitive data minimization: Operations push dùng nội dung chung, không chứa title event/task; chi tiết chỉ tải lại sau đăng nhập và kiểm quyền hiện thời.

## 11. Migration và triển khai theo vertical slice

### Slice 0: contract and policy

- Chốt glossary, ba lớp quyền, capability/scope matrix, state transitions và event ownership.
- Map `parish_organization_units` + `parish_service_terms` vào position resolver; không thêm account roles cho chức danh.
- Chốt resource-specific role, expiry, revoke và explainability/audit format; generic capability-grant table deferred.
- Định nghĩa `INTERNAL`/`PUBLIC_SUMMARY`, cấm operations payload trong `/api/parish-events`, và thêm test calendar response không chứa task/comment/assignee.
- Chốt timezone: dữ liệu operation dùng ISO instant + IANA timezone của event; dữ liệu lịch cũ `date` + `time` giữ nguyên contract và được chuyển đổi chỉ tại boundary. Chốt timezone mặc định của parish, DST policy và cách xử lý event không có giờ.
- Chốt ownership với `parish_records.source_event_id`: đây là soft/nonunique history link, không phải Operations ownership key. Khi hoàn tất, Operations luôn tạo một `ACTIVITY` record mới trong cùng transaction/idempotency; không cập nhật record hiện hữu và không copy task/comment/private activity vào history record.
- Chốt `blockout_dates`/availability và conflict policy cho người + resource; conflict ban đầu là cảnh báo khi assign, không tự động hủy assignment.
- Viết ADR cho Operations bounded context.
- **Đã chốt:** `parish_people` được dùng cho participant/assignment không đăng nhập; chỉ `linked_user_id` đang active mới có thể hành động hoặc nhận notification.

### Slice 1: task core

- Schema `operation_tasks`, `operation_task_assignees`, organizational-position + resource-role resolver, audit/activity.
- Service + route + capability/scope authorization, OCC/idempotency.
- `My Tasks` list và task detail tối giản.
- Minimal reminder: tạo `operation_reminders` với unique `(parish_id, dedupe_key)` và inbox unread/read; producer/reconciliation scheduler dùng shared `notificationQueue` được hoàn thiện ở Slice 3.
- Availability foundation: `blockout_dates` cho user/person và cảnh báo conflict khi assign task/event.
- Tests: lifecycle, assignment, tenant isolation, version conflict, audit.

Checkpoint: **IMPLEMENTED / LOCALLY VERIFIED**. Multi-assignee/revoke, resource-role authorization, transactional OCC/audit/idempotency, checklist/comment/detail, personal task actions, reminder inbox read-state và matrix tests đã có. Template checklist và attachment evidence không thuộc MVP này.

### Slice 2: event operations

- `operation_events`, link tới `parish_events`, event lifecycle.
- Event detail + task checklist + readiness; template instantiation deferred.
- Minimal headcount/participant list cho event: số lượng dự kiến, participant record tối thiểu, không public registration/approval workflow.
- Preserve existing `/api/parish-events` behavior and tests.

Checkpoint: **IMPLEMENTED / LOCALLY VERIFIED**. Scope, one-source constraint, canonical calendar projection, event lifecycle, derived readiness reasons, workstream membership/revoke, participant OCC/headcount và event/checklist cross-layer UI đã có. Workstream/member administration vẫn là API-authorized manager surface; board/editor riêng không thuộc responsive MVP workspace hiện tại.

### Slice 3: notification and offline

- Reminder producer/reconciliation, in-app read/unread và durable handoff vào shared notification worker; dedupe dựa trên `operation_reminders`, không dựa vào `notifications`. Provider channels tiếp tục do shared queue sở hữu, không thêm Telegram-specific path cho Operations.
- Encrypted Dexie read-cache/store integration; durable mutation queue vẫn deferred.
- Tests restart recovery, duplicate suppression và user-scope change; offline replay chỉ thêm cùng ADR future.

Checkpoint: reminder producer/reconciliation, online inbox read-state và encrypted exact-scope event/task read cache **IMPLEMENTED / LOCALLY VERIFIED**. Inbox không được cache. Operations offline mutation **DEFERRED**; UI hiển thị snapshot stale rõ ràng, buộc fresh server state trước mutation và không optimistic success.

### Slice 4: mobile and post-event

- Mobile inbox/action flow.
- Complete event và outcome; follow-up là một task thường do user tạo, không thêm workflow tự động.
- E2E critical path: create event -> assign -> acknowledge -> complete -> ready/live/completed.

Checkpoint: **IMPLEMENTED / LOCALLY VERIFIED**. Responsive inbox/action flow, direct checklist, lifecycle completion, outcome summary và idempotent `parish_records` activity projection đã có; real-backend E2E đi qua UI để chứng minh create event -> create/check task -> assign -> acknowledge/complete -> PLANNING/READY/LIVE/COMPLETED.

### Slice 5: Phase 2 extensions

- Recurrence, RSVP/session, exports và template automation. Dependency DAG tối thiểu và explicit approval role đã được kéo vào task core vì readiness/completion hiện tại phụ thuộc trực tiếp vào chúng.
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
- Store response/pagination validation, encrypted cache exact-scope validation và in-flight `parishId:userId` scope rejection.
- Online-first failure giữ state đã acknowledged; cache chỉ fallback cho transport error status `0`, không che auth/validation/server failure; offline khóa mutation và không báo thành công. Queued replay không thuộc current MVP.
- No binary success UI cho batch/partial outcomes.

### E2E critical path

1. Admin tạo operation event từ lịch.
2. Tạo task/checklist trực tiếp và phân công.
3. Người nhận acknowledge.
4. Một task bị block và readiness hiển thị đúng lý do.
5. Hoàn thành task/checklist, event chuyển READY/LIVE/COMPLETED.
6. Assignee accept/decline và manager revoke/reassign có reason/quyền đúng scope.
7. Reminder tạo đúng một lần, retry/restart không gửi duplicate và inbox cập nhật read state.
8. Response-loss retry dùng cùng idempotency key; stale OCC giữ state server và hiển thị conflict. Offline replay là deferred gate.
9. Calendar response/projection lấy canonical `parish_events` fields và không chứa operations detail.

## 13. Success metrics sau pilot

Các dòng dưới đây là **metric candidates để thu baseline**, chưa phải SLO/KPI threshold đã được chứng minh. Đo theo pilot một xứ đoàn có nhiều event; nếu pilot nhiều giáo xứ thì mỗi giáo xứ vẫn theo deployment scope ADR-106 riêng:

- Tỷ lệ task có owner và deadline.
- Tỷ lệ assignee acknowledge trong 24 giờ.
- Tỷ lệ task hoàn thành trước deadline.
- Số task overdue trên mỗi event.
- Thời gian từ tạo event tới trạng thái READY.
- Tỷ lệ event có required task chưa hoàn thành khi bắt đầu.
- Tỷ lệ notification duplicate/failure.
- Tỷ lệ OCC conflict/idempotent retry failure trong MVP online; chỉ đo offline replay sau khi capability đó được phê duyệt và triển khai.
- Số event cần quay lại chat/sổ ngoài hệ thống để biết trạng thái.

Không đặt KPI “số task tạo ra” làm mục tiêu; hệ thống tốt là hệ thống giảm việc mơ hồ và giảm follow-up thủ công.

## 14. Quyết định đã chốt và còn mở

Đã chốt cho implementation hiện tại:

- `parish_events` sở hữu lịch công khai; `operation_events` sở hữu điều phối nội bộ và link một-đối-một khi có source.
- Account role không suy ra organizational position. `admin` có thể thực hiện domain-administration/khôi phục trong tenant nhưng không tự trở thành organizer, workstream lead hoặc task owner; execution/approval cá nhân vẫn cần operational role tương ứng.
- Phạm vi phân công không dựa vào class assignment. Actor phải có capability tổ chức trên unit/resource hoặc operational role trên resource.
- Người không có account có thể là participant/assignee record nhưng không thể acknowledge/execute/nhận notification.
- `READY` không bắt buộc account role `admin`; event organizer hoặc Trưởng Xứ đoàn có capability transition, và override bắt buộc reason + audit.
- `READY -> LIVE` revalidate toàn bộ readiness. Sau `LIVE`, event fields bất biến; sau `DONE|CANCELLED`, task không nhận structural/assignment/approval changes; completed/cancelled event không nhận planning children mới.
- Evidence MVP chỉ là comment/note hoặc external HTTPS reference theo contract asset hiện có; không thêm upload riêng.
- Budget/cost, snooze, delegate, recurrence, workflow builder và finance integration đều deferred.
- Operations durable mutation offline deferred; private overview read cache dùng `dexieStorage` exact-scope nhưng không hydrate permission và không cho ghi từ stale state. Event calendar cache hiện hữu giữ nguyên contract ADR-098.

Còn mở sau MVP: reminder default/opt-in policy theo loại event, nhu cầu generic temporary capability grant, **thời lượng** retention cho receipt response (cơ chế compaction đã có nhưng mặc định tắt), và production/pilot load target sau baseline. Pagination contract 50 mặc định/500 tối đa là giới hạn tải theo pattern repo, không phải latency SLO. Không open decision nào được tự biến thành code default mang tính nghiệp vụ hoặc ngưỡng số tùy ý.

## 15. Risk register

- **Scope creep từ event platform doanh nghiệp:** giữ ticketing/CRM/marketing ngoài MVP.
- **Nhầm lẫn giữa class assignment và task assignment:** không dùng chung bảng/service.
- **Notification thành nguồn sự thật giả:** tách delivery, read state và task state.
- **Thay đổi scope bằng quyền cục bộ:** organizer/workstream lead chỉ quản lý resource hiện tại; thay đổi authority-bearing scope/organizer/public link cần quyền tổ chức tại scope đích.
- **Sai thứ tự thời gian do offset:** canonicalize instant về UTC trước mọi so sánh/persistence.
- **Hủy việc bắt buộc để vượt readiness:** cancelled required task vẫn block và task cancellation bắt buộc reason.
- **Offline conflict làm mất việc:** read cache hiện có không sở hữu mutation và không hydrate quyền; current MVP không nhận write offline. OCC/idempotency bảo vệ retry online. Chỉ thêm durable queue sau ADR conflict/remap/reconciliation riêng.
- **Receipt retention làm mất idempotency:** không xóa receipt key/hash. Compaction chỉ thay response body, giữ tombstone; retry cũ trả `409 IDEMPOTENCY_REPLAY_EXPIRED`. Duration là config policy-gated và mặc định tắt.
- **Cross-origin command fail dù E2E xanh:** CORS allow-header phải gồm cả hai idempotency header và có regression test; same-origin proxy không đủ bằng chứng production.
- **Task tạo nhưng không ai chịu trách nhiệm:** chặn publish/READY nếu required workstream thiếu owner.
- **Quyền frontend rộng hơn backend:** thêm authorization matrix tests trước khi mở UI.
- **Ghép quyền từ resource không liên quan:** resolver từ chối tổ hợp ID không cùng event/workstream/task graph trước khi quyết định capability.
- **Sửa ngược trạng thái đã kết thúc:** terminal task/event bị khóa tại server; UI chỉ là affordance và cũng ẩn action không hợp lệ.
- **Ghi đè Parish Memory do soft link trùng:** completion luôn insert `ACTIVITY` riêng, không update record tìm theo `source_event_id`.
- **Event model hiện tại bị breaking change:** link bằng `source_parish_event_id`, giữ contract đọc lịch cũ.

## 16. Nguồn tham khảo đã đối chiếu

- Asana Tasks: https://asana.com/guide/help/tasks
- monday.com Event Management: https://monday.com/lp/event-management-software
- monday.com Calendar View: https://support.monday.com/hc/en-us/articles/360000221209-How-to-use-the-Calendar-view
- Cvent Event Management: https://www.cvent.com/en/event-marketing-management/event-management-software
- Salesforce Event Management overview: https://www.salesforce.com/products/event-management/overview/
- Bizzabo Event Management Software: https://www.bizzabo.com/event-management-software
- Planning Center Calendar: https://www.planningcenter.com/calendar

Planning Center là benchmark gần domain giáo hội hơn: nguồn chính thức xác nhận central church calendar, event details, templates, resource/facility catalog, approval requests, conflict management, mobile/public sharing và integrations. Các claim cụ thể hơn như tự động xếp lịch volunteer, volunteer tự tìm người thay hoặc approval hai tầng cần nguồn sản phẩm riêng trước khi dùng làm requirement.

Các nguồn trên là benchmark capability/product positioning. Quyết định triển khai Catevia phải ưu tiên observed architecture hiện tại, business rule được phê duyệt và các invariant tenant/RBAC/offline/data integrity của repository.

## 17. Reconciliation với review ngày 2026-09-07

### Verified và đã sửa trong plan

- **H1 — Đúng về gap, HIGH:** `notifications` hiện có retry/lease/recovery nhưng không có domain dedupe key hoặc unique dedupe constraint. Không thể kết luận mọi retry hiện tại đều gửi trùng vì lease/claim bảo vệ cùng một notification row; rủi ro đã xác nhận là duplicate scheduling/enqueue và at-least-once delivery không có idempotency ở domain reminder. Plan đã chuyển dedupe về `operation_reminders`, bắt buộc unique `(parish_id, dedupe_key)` và không còn mô tả đây là capability có sẵn.
- **H2 — Đúng, HIGH:** MVP đã hứa reminder/unread nhưng Slice 1 trước đây chưa cung cấp. Plan hiện đưa minimal reminder + unread/read state vào Slice 1; Slice 3 chỉ mở rộng worker/recovery/provider integration.
- **H3 — Đúng, HIGH về privacy boundary:** `/api/parish-events` đang trả calendar row tối giản và parent có thể đọc lịch. Plan đã định nghĩa `INTERNAL`/`PUBLIC_SUMMARY`, cấm operations payload trong calendar response và yêu cầu regression test.
- **M2 — Đúng, MEDIUM:** chưa có availability/blockout/conflict domain. Plan đưa foundation `blockout_dates` và cảnh báo conflict vào Slice 1; chưa tự động hủy assignment.
- **M3 — Đúng, MEDIUM:** headcount là nhu cầu event planning thực tế. Plan đưa minimal headcount/participant list vào Slice 2, giữ RSVP/registration nâng cao ở Phase 2.
- **M4 — Đúng, MEDIUM:** `parish_records.source_event_id` là historical soft link và không unique. Plan chốt completion tạo một Operations-owned `ACTIVITY` mới bằng transaction/idempotency; không tìm rồi ghi đè một record hiện hữu có cùng link.
- **M5 — Đúng, MEDIUM:** calendar hiện dùng `YYYY-MM-DD` + time text như `HH:MM`; plan đã yêu cầu chốt instant/timezone boundary, parish default timezone và DST trước schema.
- **M6 — Đúng, MEDIUM nhưng D3-impact:** route hiện dùng `roleMiddleware`; plan đã thêm strangler migration, giữ baseline gate rồi đưa capability resolver vào từng Operations route, không big-bang rewrite.
- **M7 — Đúng, MEDIUM:** target assignee kép cần invariant exactly-one. Plan đã yêu cầu CHECK/validator cho đúng một trong `user_id` và `person_id`.

### Đúng một phần hoặc cần diễn đạt thận trọng

- **M1 — Đúng về hướng benchmark, chưa đủ bằng chứng cho mọi claim:** Planning Center là benchmark church-domain phù hợp; nguồn chính thức đã xác nhận calendar, templates, facilities/resources, approval requests, conflict management và public/mobile sharing. Các claim cụ thể về auto-scheduling volunteer, self-replacement và approval hai tầng vẫn là `UNKNOWN` cho tới khi có nguồn sản phẩm tương ứng.
- **L1 — Đúng:** endpoint permissions phải chỉ explain capability của caller trên resource được chỉ định, không nhận user tùy ý. Plan đã khóa điều này.
- **L2 — Đúng:** duplicate transition endpoint đã xóa.
- **L3 — Đúng:** readiness là derived; plan chốt computed-on-read ở MVP và nêu điều kiện nếu materialize sau này.
- **L4 — Đúng về nhu cầu test, nhưng checkpoint cũ đã diễn đạt quá mức:** E2E hiện chứng minh create/assign/acknowledge/complete và event lifecycle qua real backend. Decline/revoke/reassign, idempotency/OCC và public-calendar privacy được chứng minh ở integration tests; delegate và offline replay vẫn deferred.
- **L5 — Đúng về product risk:** snooze chưa đủ semantics. Plan giữ snooze ở Phase 2 và không cho phép nó xóa overdue; semantics cần chốt trước khi triển khai gồm `snoozed_until`, actor, reason, max extension và escalation behavior.

Không có nhận định nào ở trên được dùng làm bằng chứng thay thế cho runtime tests. Tại checkpoint takeover, các bảng/route đã tồn tại trong dirty worktree nhưng chưa qua typecheck/test/build; chỉ được nâng trạng thái sau các gate ở §12.

## 18. Local completion evidence — 2026-09-08

- Operations domain/authorization/OCC/idempotency/readiness/reminder/post-event integration: **18/18 PASS**, gồm exact position-code authority, destination re-scope denial, mixed-resource fail-closed, active actionable target, lifecycle immutability, READY-to-LIVE revalidation, reminder reauthorization/terminal-resource suppression/privacy, safe inbox projection, non-overwrite Parish Memory, UTC normalization, accepted-assignment execution/approval và cancelled-required readiness.
- Exact affected-boundary rerun sau residual lifecycle/authority hardening: **6 files / 56 tests PASS** (`operations`, Operations page/store, receipt maintenance, schema health và migration runner).
- Latest focused authority/schema/notification/frontend regression before ADR-111: **9 files / 93 tests PASS**. Schema health and migration markers now include `20260908-230..235`, position-scope/cancellation-reason triggers, receipt-response compaction and Telegram retirement. ADR-111 verification is tracked separately in `TELEGRAM_DECOMMISSION_RESEARCH_2026-09-08.md`.
- ADR-111 retirement and adjacent shared regressions: **29 files / 219 tests PASS**, covering migration `20260908-235`, queue recovery/recipient revalidation, parent `410` tombstones, leave review, smart notifications, grade audit, Web/Native Push, Operations and parent UI.
- Residual notification hardening: **10 files / 77 tests PASS**. Queue target bắt buộc explicit và fail closed khi null/hỏng/rỗng; zero usable endpoint không còn được ghi `sent`; dead endpoint bị loại mà không retry aggregate; targeted/direct parish delivery đều bỏ qua unbound, locked và deleted account. Chỉ transient partial failure/crash-after-acceptance còn cửa sổ duplicate theo at-least-once.
- Existing security-critical suite: **7 files / 73 tests PASS**. Current Operations frontend inventory: **3 files / 32 tests PASS across bounded runs**, gồm lifecycle UI, server-acknowledged checklist, online-only reminder inbox, pagination/acknowledgement validation và tenant/scope guards. Một combined rerun dưới tải tiến trình đồng thời hoàn tất 31 assertions nhưng timeout một OperationsPage case ở mốc 5 giây; exact file rerun ngay sau đó **7/7 PASS**, không đổi timeout/guard. Architecture boundary suite: **1 file / 7 tests PASS**.
- Real-backend isolated Playwright workflow: **1/1 PASS**. Workflow hiện tạo/tick checklist và chuyển toàn bộ event lifecycle qua UI; lần chạy đầu sau mở rộng phát hiện `.check()` giả định optimistic checkbox trong khi UI chờ server acknowledgement, exact rerun bằng click→response→DOM acknowledgement đã xanh.
- Client/server TypeScript and production `npm run build` PASS after residual-risk hardening (**2,824 modules; PWA 266 entries**). Final `npm run lint`, `npm run lint:ds` (**0/134**) and `npm run lint:architecture-inventory` (**32 routes / 6 repositories / 54 services / 12 domain files / 69 tables**) all PASS on the final change set.
- Repeatable isolated `benchmark:operations` local synthetic profile (Windows x64, Node 24.14.1, SQLite; 250 events, 1,000 tasks, 250 required readiness tasks, 5 warmups + 20 samples, response page 50) completed with no temp artifact: event list p50 **11.34 ms** / p95 **13.43 ms**; task list p50 **71.28 ms** / p95 **78.12 ms**; readiness p50 **29.92 ms** / p95 **32.49 ms**. Đây là measurement evidence của một lab profile, không phải production SLO hoặc pilot workload authority.
- Serialized Vitest covered the current inventory in two bounded runs: **332 files / 2,377 tests PASS** with `password-reset-requests.test.ts` excluded, plus that exact file **1 file / 6 tests PASS** in isolation. A broad invocation exited non-zero only because a concurrently created `zz-scratch-gen.test.ts` disappeared between discovery and import; the file no longer exists and no executed product test failed. The partition proves every current test file but does not erase the existing suite-order/resource-isolation risk. Coverage instrumentation was not rerun.
- Operations-owned files pass targeted whitespace inspection. Latest full-worktree `git diff --check` is currently non-green only because concurrent out-of-scope `src/__tests__/components/CommonComponents.test.tsx` has a blank line at EOF; it is preserved rather than silently rewriting another change. Manual device/accessibility pilot remains a release/pilot gate and is not claimed from local automation.

Residual risks sau current hardening: retention **duration** chưa được governance phê duyệt nên maintenance mặc định tắt; event/workstream/task list vẫn phải materialize candidate resource graphs trước khi batch-authorize/slice và cần production/pilot telemetry để đặt SLO (reminder inbox đã SQL-page/count); event detail/readiness aggregate mới có synthetic local baseline, chưa có field/soak evidence; durable Operations writes, provider-level exactly-once và manual mobile/device acceptance vẫn deliberately deferred. Dead endpoint không còn gây retry trùng, nhưng transient partial provider failure hoặc crash sau acceptance vẫn cần per-endpoint ledger nếu sản phẩm yêu cầu exactly-once. Parish-local timezone cho ngày hiệu lực service term chưa có SSOT riêng; resolver dùng UTC calendar date nhất quán với code hiện tại và không tự hard-code múi giờ mới. Recurrence/templates/RSVP/generic grants cũng decision-blocked vì chưa có business rule/ADR, không phải thiếu code trong current approved MVP. Controlled `position_code` đã đóng rủi ro suy quyền từ title; `position_title` chỉ còn là nhãn hiển thị. Workstream/member manager UI trong event đã triển khai và có E2E; chỉnh validity range, quản trị nhóm độc lập ngoài event và reminder authoring UI vẫn chưa thuộc slice vừa hoàn tất. Suite-order/resource interaction của password-reset test cần được theo dõi ở CI nhưng isolated behavior đã xanh và không có evidence nối nó với Operations.
