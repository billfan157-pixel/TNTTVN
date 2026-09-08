# Catevia — Nghiên cứu và lộ trình phát triển vận hành xứ đoàn

Ngày nghiên cứu: 2026-09-08. Trạng thái: **kế hoạch đề xuất cho vòng phát triển tiếp theo, chưa phải tính năng đã triển khai**.

Tài liệu thực thi hiện hành: [Task & Event Operations Implementation Plan](TASK_EVENT_OPERATIONS_IMPLEMENTATION_PLAN_2026-09-07.md). Tài liệu này bổ sung cơ sở nghiên cứu, ưu tiên và đặc tả các lát cắt tiếp theo; không thay thế ADR-110/111 hoặc tự phê duyệt thay đổi nghiệp vụ.

## 1. Kết luận dành cho chủ sản phẩm

Catevia nên là **không gian điều phối phục vụ xứ đoàn**, không phải bản sao Jira/Asana hoặc phần mềm tổ chức hội nghị thương mại.

Một người phục vụ cần biết: được giao việc gì, đã nhận chưa, cần làm lúc nào, liên hệ ai khi không làm được. Một trưởng nhóm cần biết: thiếu người ở đâu, việc nào đang chặn, quyết định nào đang chờ. Trưởng Xứ đoàn cần nhìn mức sẵn sàng và kết quả, không phải đọc toàn bộ nhật ký của mọi người.

Hướng phát triển đề xuất:

1. Vá các khoảng trống của luồng đang có: phản hồi đến muộn, cảnh báo bận bị bỏ qua, quyền theo đúng nhiệm vụ và hiệu lực phê duyệt.
2. Hoàn thiện công việc cá nhân và phối hợp nhóm: chi tiết nhiệm vụ độc lập, nhận/từ chối, báo vướng, duyệt, bình luận, bàn giao.
3. Tách chuẩn bị, thực hiện và hậu kiểm sự kiện; không buộc công việc trong/sau sự kiện phải hoàn thành trước giờ bắt đầu.
4. Hoàn thiện nhắc việc có thể quản lý, lịch phục vụ/báo bận, thời hạn vai trò.
5. Sau pilot mới thêm mẫu sự kiện và view tổng hợp. Chưa làm hệ thống tự động hóa, Gantt, chấm năng suất cá nhân hoặc ghi ngoại tuyến riêng.

Đây là kế hoạch phát triển tiếp từ code hiện hữu. Không dựng lại bảng task mới dưới `parish_events`; không đưa chức danh tổ chức vào `users.role`; không đưa Telegram trở lại.

## 2. Phạm vi và độ tin cậy của nghiên cứu

### 2.1 Snapshot dự án

- Repository `C:\brave-davinci`, HEAD đọc được: `4738160` — `fix(csp): allow Google Fonts in connect-src for SW font caching`.
- Worktree có nhiều thay đổi chưa commit, gồm các file Operations mới và thay đổi ở module khác. HEAD riêng lẻ **không đại diện** cho toàn bộ implementation đã đọc. Trước mỗi slice phải kiểm tra lại diff.
- Đã đối chiếu route → authorization → schema/transaction → store/API → UI, cùng test source, CI, ADR-110/111 và Business Rules §31.
- Đây là nghiên cứu source và tài liệu công khai. Không truy cập production, không khảo sát người dùng thật, không chứng nhận SLA, không chạy lại toàn bộ test suite trong lượt lập kế hoạch.
- Những kết quả test cũ trong implementation plan là bằng chứng lịch sử của từng checkpoint, không được cộng thành một lần kiểm chứng current snapshot.

### 2.2 Cách chọn mẫu quốc tế

Chọn theo vấn đề cần giải quyết, không xếp hạng “tốt nhất thế giới” bằng uy tín thương hiệu:

- **Quy trình công khai của tổ chức:** GitLab Handbook, Google SRE.
- **Khung thực hành do nhà cung cấp công bố:** Atlassian Team Playbook.
- **Hành vi sản phẩm có tài liệu chính thức:** Asana, Microsoft Planner, Planning Center.
- **Thực hành chuyên ngành sự kiện:** Cvent.

Tài liệu sản phẩm không chứng minh mọi khách hàng của họ vận hành theo cùng cách. Handbook GitLab/Google không chứng minh Catevia sẽ đạt hiệu quả tương tự. Các đề xuất chuyển sang xứ đoàn dưới đây là suy luận thiết kế, không phải kết quả thử nghiệm.

## 3. Những gì nên học — và không sao chép

### R1. GitLab: một đầu mối chịu trách nhiệm

GitLab dùng DRI để làm rõ trách nhiệm cho công việc/sáng kiến và phân biệt trách nhiệm với việc tham vấn người khác. [Nguồn chính thức: GitLab DRI](https://handbook.gitlab.com/handbook/people-group/directly-responsible-individuals/).

**Áp dụng cho Catevia:** giữ một OWNER active cho một nhiệm vụ, nhiều CONTRIBUTOR khi cần; nhóm có trưởng nhóm; sự kiện có người tổ chức rõ ràng. Draft có thể chưa đủ người, nhưng phải hiện thiếu trách nhiệm trước mốc kiểm tra.

**Không áp dụng máy móc:** OWNER không được quyền vượt phạm vi giáo xứ, tự duyệt mọi việc hoặc thay quyền cấp tổ chức. Trách nhiệm thực hiện không đồng nghĩa toàn quyền quyết định. Không diễn giải nguồn này thành bằng chứng về hệ thống nội bộ Apple.

### R2. Atlassian: tách người thúc đẩy công việc với người quyết định

DACI phân biệt Driver, Approver, Contributors và Informed trong quyết định. Đây là khung quyết định, không phải schema task bắt buộc. [Nguồn: Atlassian DACI](https://www.atlassian.com/team-playbook/plays/daci).

**Áp dụng:** việc cần duyệt phải biết ai duyệt, duyệt điều gì và phiên bản nào; chỉ những việc thật sự cần mới bật approval. Hiện UI nên ưu tiên một đầu mối duyệt, nhưng không âm thầm xóa các assignment APPROVER hiện hữu.

**Không sao chép:** không bắt mọi việc đơn giản như kê ghế, mang dụng cụ qua một quy trình duyệt nhiều tầng. Không đổi tên bốn vai trò Operations thành DACI vì chúng không tương đương hoàn toàn.

### R3. Asana: công việc có chủ thể, hạn và một bản ghi

Asana mô tả task có một assignee và nhiều collaborators; có deadline, dependency, approval và My Tasks. [Nguồn: Asana Tasks](https://asana.com/features/project-management/tasks).

**Áp dụng:** giữ task ID duy nhất; “việc của tôi”, danh sách nhóm và trang sự kiện là các view của cùng task. Hoàn thiện chi tiết nhiệm vụ với kết quả cần đạt, người chính, người hỗ trợ, hạn, checklist và trao đổi.

**Không sao chép:** không tự thêm multi-homing giữa nhiều sự kiện; Catevia đang bảo vệ một resource graph event/workstream/task. Không đồng nhất collaborator của Asana với CONTRIBUTOR có quyền thực thi của Catevia. Tránh custom-field builder, portfolio và workload scoring ở giai đoạn này.

### R4. Microsoft Planner: bắt đầu từ công việc cá nhân

Planner có My Tasks/My Day để tập hợp công việc và tập trung việc hôm nay; task vẫn liên kết với plan gốc. [Nguồn: Microsoft My Tasks and My Day](https://support.microsoft.com/en-US/Planner/training/manage-your-tasks-with-my-tasks-and-my-day).

**Áp dụng:** landing theo vai trò với “Chờ tôi nhận”, “Hôm nay”, “Sắp đến hạn”, “Đang vướng”, “Chờ tôi duyệt”. Mở task trực tiếp từ danh sách hoặc đường dẫn, không bắt vào sự kiện rồi bấm Checklist.

**Không sao chép:** không dựng task cá nhân ngoài phạm vi tổ chức hay đồng bộ Outlook/Teams; không nhân bản task cho từng view hoặc tự xóa nhiệm vụ qua ngày.

### R5. Planning Center: phối hợp người phục vụ

My Schedule trình bày lời mời phục vụ, thời gian/vị trí, chấp nhận hoặc từ chối và lịch đã xác nhận. [Nguồn: Planning Center My Schedule](https://help.planningcenter.com/en/143027-my-schedule.html).

**Áp dụng:** acknowledgement là bước nghiệp vụ riêng; chưa phản hồi không được coi là đồng ý. Từ chối cần đưa việc trở lại hàng chờ điều phối. Đề nghị người thay thế không được tự chuyển quyền hoặc tự chấp nhận thay họ.

Planning Center cũng dùng khoảng thời gian đã phân công và blockout để cảnh báo trùng lịch; cảnh báo không nhất thiết là lệnh cấm tuyệt đối. [Nguồn: Scheduling conflicts and blockouts](https://help.planningcenter.com/en/142878-scheduling-conflicts-and-blockouts.html).

**Áp dụng:** thêm lịch bận tự khai, cảnh báo thời gian có căn cứ. Không suy “bận cả buổi” từ một deadline. Chỉ hiển thị khoảng bận cần thiết, không phát tán lý do cá nhân.

**Không sao chép:** tính năng quản lý lịch hộ gia đình, phụ huynh nhận thay, tự đăng ký và phục vụ công khai không tự trở thành phạm vi Catevia. Staff baseline hiện hữu vẫn giữ nguyên.

### R6. Google SRE: điều phối lúc đang diễn ra và học sau sự kiện

Google công bố cách phân chia chỉ huy, điều phối thao tác và truyền thông khi ứng phó sự cố. [Nguồn: Google Incident Response](https://sre.google/workbook/incident-response/).

**Áp dụng có giới hạn:** sự kiện lớn cần một đầu mối điều phối, đầu mối từng nhóm và cập nhật ngắn khi có trở ngại. Không triển khai pager/on-call, độ nghiêm trọng sự cố IT hoặc một incident-management module vào xứ đoàn.

Google nhấn mạnh hậu kiểm không đổ lỗi và action item có người phụ trách, mức ưu tiên, kết quả kiểm chứng. [Nguồn: Google Postmortem Culture](https://sre.google/workbook/postmortem-culture/).

**Áp dụng:** tổng kết gồm kết quả, điều cần cải thiện, việc tiếp theo và người chịu trách nhiệm. Không dùng số lần từ chối, trễ hạn hay số task để xếp hạng đạo đức/năng lực người phục vụ.

### R7. Cvent: kết quả sau sự kiện

Cvent hướng dẫn tổng kết sau sự kiện để nhìn điều hiệu quả và điều chưa hiệu quả, làm đầu vào lần sau. [Nguồn: Cvent Post-event Report](https://www.cvent.com/en/blog/events/post-event-report).

**Áp dụng:** tái sử dụng `outcomeSummary` và Parish Memory ACTIVITY; kết nối follow-up task thật, không chỉ đổi nhãn COMPLETED.

**Không sao chép:** ROI thương mại, lead capture, sponsor, bán vé, khách sạn, marketing automation. Thành công của xứ đoàn phải do mục tiêu mục vụ/phục vụ được người có thẩm quyền xác định, không mượn KPI doanh thu.

## 4. Catevia hiện có gì: bằng chứng theo code

Các đường dẫn sau được đối chiếu trực tiếp trong snapshot. “Có code” không đồng nghĩa mọi tình huống production đã được chứng minh.

- **Bounded context:** [kiến trúc §7](02_ARCHITECTURE.md), [ADR-110/111](ADR_ARCHITECTURE_DECISION_RECORDS.md), [schema](../server/src/db/schema.ts). `operation_events`, workstreams, tasks, assignments, participants, comments, reminders, receipts đã có; `parish_events` là lịch công khai, không đổi thành kho task.
- **Authority:** [operationsAuthorization.ts](../server/src/services/operationsAuthorization.ts), nhất là `loadResource`, `loadAuthorizationSnapshot`, `decideOperationsAuthorization`, `operationRoleAllows`. Có staff baseline; position_code + unit scope + service-term; resource roles và accepted assignment. Chức danh hiển thị không cấp quyền.
- **Command:** [routes/operations.ts](../server/src/routes/operations.ts) và [operationsIdempotency.ts](../server/src/services/operationsIdempotency.ts). Các command dùng receipt, OCC/CAS và audit; unique active OWNER; mốc LIVE/terminal và readiness đã có guard.
- **Client:** [API](../src/lib/api/operations.ts), [store](../src/stores/operationsStore.ts), [trang Operations](../src/pages/OperationsPage.tsx), [WorkstreamPanel](../src/components/operations/WorkstreamPanel.tsx), [ReminderForm](../src/components/operations/EventReminderForm.tsx). Có luồng tạo sự kiện/nhóm/task, gán nhóm/nhân sự, nhận việc, checklist, hoàn tất, nhắc event/task và hủy nhắc PENDING.
- **Notifications:** [operationsReminderService.ts](../server/src/services/operationsReminderService.ts) bàn giao atomic sang bảng notification dùng chung; [notificationQueue.ts](../server/src/services/notificationQueue.ts) xử lý gửi. PENDING/ENQUEUED/SENT không phải cùng một trạng thái. Nội dung push chung chung; Telegram đã được loại khỏi current architecture.
- **Offline:** `operationsStore` chỉ có encrypted scoped overview cache. Không có durable Operations mutation queue; permissions không được persist. Đây là lựa chọn có chủ ý, không phải tính năng ghi offline đã hỏng.
- **Verification source:** [integration](../server/src/__tests__/operations.test.ts), [store tests](../src/__tests__/stores/operationsStore.test.ts), các component tests Operations/WorkstreamPanel/EventReminderForm, [E2E](../e2e/operations.spec.ts), [CI](../.github/workflows/ci.yml). Lượt nghiên cứu này không chạy lại các suite.

### 4.1 Khoảng trống được chứng minh ở source

**F1 — Chi tiết nhiệm vụ chưa độc lập.** `OperationsPage` hiển thị chi tiết/checklist khi có selectedEvent và task nằm trong event đó; `router.tsx` mới có `/operations`. Người chỉ có task assignment không nhất thiết được xem toàn event. Cần task route/drawer được authorize theo task, không chữa bằng việc mở quyền toàn event.

**F2 — Phản hồi đến muộn chưa được bảo vệ đồng đều.** `operationsStore.selectEvent/selectTask` so account scope nhưng không có request-generation/latest-selection; đóng detail chưa vô hiệu request cũ. `createTask/assignTask` mới so parish sau response; `assignTask` append assignee vào selectedEvent hiện tại. Đây là rủi ro trộn trạng thái giao diện khi đổi lựa chọn/tài khoản, cần test tái hiện trước patch. Không kết luận đã có rò rỉ production.

**F3 — Cảnh báo bận không đi hết luồng.** Route assign chỉ query blockout khi `body.userId && task.dueAt`; form hiện gán `personId`, store không đưa `conflictWarnings` vào state cho UI. Cần canonical hóa person ↔ linked user và hiển thị cảnh báo; kiểm tra deadline chưa phải kiểm tra ca phục vụ.

**F4 — Readiness chỉ có một nghĩa “trước khi bắt đầu”.** `readiness()` yêu cầu mọi required task DONE; READY→LIVE dùng lại cùng blocker. LIVE→COMPLETED yêu cầu outcomeSummary nhưng không áp readiness blockers làm completion gate. Đây là giới hạn nghiệp vụ của thiết kế hiện tại, không được tự gọi là sai rồi bỏ guard. Muốn phục vụ công việc trong/sau sự kiện phải sửa contract rõ ràng.

**F5 — Approval chưa ràng buộc với nội dung được duyệt.** `PUT /tasks/:id` sửa description/title và tăng version nhưng không reset approval; checklist mutation cũng không reset approval. DONE chỉ kiểm tra approvalStatus. Hành vi source xác nhận được; policy “sửa gì phải duyệt lại” chưa được chốt. Cần regression và quyết định trước khi mở rộng approval UI.

**F6 — Task API phong phú hơn UI.** Backend có update, approve, comments, dependencies, revoke; client/UI chưa cung cấp đầy đủ các hành động này. Có nhãn APPROVER nhưng chưa có trải nghiệm “Chờ tôi duyệt” xuyên suốt. Không coi endpoint tồn tại là user flow đã hoàn tất.

**F7 — Người quản lý chưa theo dõi được lịch nhắc đã tạo cho người khác.** Inbox chỉ là recipient-scoped projection tối thiểu, không có resource/recipient detail. Không mở rộng inbox thành danh sách của cả nhóm. Cần màn hình/lối đọc quản lý riêng, authorize lại theo resource.

**F8 — Reschedule chưa có concurrency contract.** `operation_reminders` có dedupeKey và trạng thái, không có version; lịch hủy còn giữ dedupe key. Không thể triển khai “sửa” bằng hai request hủy/tạo hoặc chỉ expectedTriggerAt rồi coi tương đương OCC đầy đủ.

**F9 — Workstream UI còn giới hạn.** Panel mới nằm trong event, không điều hướng nhóm độc lập; API member có startsAt/endsAt nhưng typed client/form chưa expose; member tạo bằng userId có thể chỉ hiện nhãn chung do form tra personId. Cần identity projection tối thiểu, không tải toàn bộ hồ sơ để có tên.

**F10 — Tài liệu có nhiều checkpoint chưa được hợp nhất.** Plan cũ còn câu “nhắc task/hủy lịch chưa có” cạnh checkpoint đã triển khai; đề xuất ban đầu còn schema `parish_event_tasks`. Cần phân biệt lịch sử với hợp đồng hiện hành để tránh agent tạo nguồn dữ liệu thứ hai.

### 4.2 Chủ ý phải giữ và phần chưa biết

- Giữ monolith, transactional command, source lịch công khai, privacy, current role baseline, terminal history, no Telegram.
- Chưa biết số người dùng đồng thời, quy mô dữ liệu thực, trình độ thao tác, chất lượng mạng tại nhà thờ/trại, thiết bị tối thiểu và nhu cầu in giấy. Không tự chọn cơ sở hạ tầng mới hoặc cam kết deadline phát triển từ các giả định này.
- Chưa kiểm chứng runtime của F2/F5 bằng test mới trong lượt này; không gắn nhãn vulnerability đã khai thác.
- Dữ liệu cache chi tiết đang giữ trong memory khi fallback, hiệu lực quyền sau revoke và receipt replay sau thay đổi quyền cần regression riêng trong P0; không suy rằng encrypted cache tự giải quyết mọi revoke.

## 5. Mô hình tổ chức cá nhân hóa

### 5.1 Ba lớp authority

**Account Role ≠ Organizational Position ≠ Operational Role.**

- Account role: baseline truy cập hệ thống. Giữ `admin|chunhiem|phuta` cho Operations hiện tại; không mở parent thành staff bằng assignment.
- Organizational position: `parish_people.linkedUserId` + `parish_service_terms.position_code` có hiệu lực + `parish_organization_units`. Tên “Trưởng…” chỉ là nhãn hiển thị; hết nhiệm kỳ phải mất authority tổ chức.
- Operational role: organizer, workstream member, task assignee; có actor cấp, phạm vi, trạng thái/time/revoke tương ứng. Quyền được cộng trong cùng resource graph, không lan ngang sang nhóm khác.

### 5.2 Ai làm được gì

- **Trưởng Xứ đoàn:** điều phối toàn xứ đoàn theo position_code hợp lệ; quản lý sự kiện/nhóm/phân công, xem blocker, quyết định readiness override có lý do. Không tự có quyền đổi tài khoản, mật khẩu, backup. Không tự execute/approve task.
- **Trưởng ngành:** quản lý trong ngành và các đơn vị con được resolver cho phép. Không can thiệp ngành khác; quyền transition toàn event phải có vai trò organizer hoặc authority cấp xứ đoàn, không mặc định theo tên chức danh.
- **Trưởng ban:** tương tự theo phạm vi COMMITTEE; quan hệ ban và ngành không được đoán thành một cây mới ngoài tổ chức hiện hữu.
- **Người tổ chức sự kiện:** điều phối đúng event; không tự chuyển event sang ngành/ban khác để mở rộng quyền.
- **Trưởng nhóm công việc:** quản lý nhóm và task thuộc nhóm; không tự hủy/bắt đầu toàn event; vai trò có thời hạn phải được kiểm tra server tại command.
- **OWNER:** đầu mối chịu trách nhiệm, sau ACCEPTED được thực hiện; vẫn cần approval/checklist/dependency hợp lệ để DONE. Người hỗ trợ không làm mất trách nhiệm của OWNER.
- **CONTRIBUTOR:** sau ACCEPTED được cùng thực hiện theo contract hiện tại. Nếu muốn chỉ OWNER được DONE, đó là thay đổi policy riêng, không cài ngầm.
- **APPROVER:** quyền duyệt riêng; không tự được sửa nội dung/phân công. Workstream APPROVER hiện có thể được resolver cấp task.approve trong nhóm; phải phân biệt với task APPROVER cần ACCEPTED. Không ghi tài liệu giả rằng mọi approval đều qua task acknowledgement.
- **OBSERVER:** xem/bình luận theo scope hiện tại, không execute/approve/manage.

Self-approval và số approver: current code không cấm một actor vừa OWNER vừa APPROVER và không có quorum. Đề xuất giữ `ANY_ONE` cho compatibility, UI khuyến nghị người duyệt khác OWNER với việc cần kiểm soát độc lập; policy cấm tự duyệt chỉ được bật sau quyết định và kiểm tra dữ liệu cũ. Không áp nguyên DACI thành unique constraint mới.

### 5.3 Người chưa có tài khoản và bảo vệ trẻ em

Hồ sơ người phục vụ chưa có account có thể là planning record, không được coi là đã nhận việc/actionable readiness. UI phải nói rõ “chưa có tài khoản để nhận việc”, không âm thầm cấp account/role. Không đưa lịch học, thông tin gia đình hoặc lý do vắng cá nhân vào activity feed Operations. Việc mở vai trò tình nguyện viên ngoài staff cần thiết kế onboarding và privacy riêng.

## 6. Trải nghiệm đích

### 6.1 Bốn lối vào, một dữ liệu

1. **Việc của tôi:** lời mời mới, việc đang làm, sắp hạn, đang vướng, chờ duyệt; mỗi hàng có hành động tiếp theo rõ ràng.
2. **Nhóm phụ trách:** việc chưa có người chính, người chưa nhận, từ chối, trở ngại, lịch nhóm; chỉ hiện nhóm trong scope.
3. **Sự kiện:** tổng quan mục tiêu/thời gian/người tổ chức; nhóm/việc; mức sẵn sàng; thực hiện; tổng kết.
4. **Nhắc việc:** inbox cá nhân và trang lịch nhắc của resource dành cho người quản lý — hai projection khác nhau.

Đề xuất deep link `/operations/tasks/:taskId`, `/operations/events/:eventId`, `/operations/workstreams/:workstreamId` theo TanStack Router đang có. Mobile dùng trang/drawer một cột; desktop dùng danh sách và panel chi tiết. Không bắt thao tác kéo-thả; nếu thêm board thì mọi chuyển trạng thái vẫn có nút và validation.

### 6.2 Ngôn ngữ và thao tác

Đổi nhãn hiển thị Owner/Contributor/Approver/Observer thành “Phụ trách chính/Phối hợp/Người duyệt/Theo dõi”; giữ enum API. Dùng “Mức sẵn sàng”, “Danh sách kiểm tra”, “Báo vướng”, “Cần điều phối lại”, tránh raw blocker code làm nội dung chính. Giữ navy–gold, Surface/Button/Select hiện hữu, focus/keyboard và mobile safe area.

Không ghép lỗi “đã lưu nhưng tải lại thất bại” với “chưa lưu”. Conflict giữ bản nháp và cho tải bản mới; không tự replay dưới key mới. Mỗi form có trạng thái đang gửi rõ ràng và chống submit trùng.

## 7. Các lát cắt thực thi theo thứ tự

### P0 — Ổn định nền hiện tại trước khi thêm bề mặt (D3)

Approval implementation continuation: theo yêu cầu thực hiện plan, invalidation được triển khai bằng reset trạng thái hiện hành trong cùng transaction, không thêm content revision khi chưa cần trả bằng chứng version riêng. Nội dung title/description/isRequired, checklist bắt buộc thay đổi, dependency mới yêu cầu duyệt lại; priority/dueAt/comment không reset. Audit giữ quyết định cũ. Cần tiếp tục regression bao phủ từng đường và UI refresh approval trước khi coi toàn P0 hoàn tất.

Checkpoint implementation 2026-09-08: đã tái hiện 5 lỗi bằng store tests trước sửa, sau đó sửa latest event/task selection, close/reset invalidation, same-parish account change cho createTask/assignTask và assignment không append vào event khác. Cache fallback loại detail/permissions/warnings và vô hiệu detail request đang chờ. Blockout lookup đã nối person/account cho cả hai hướng, trả khoảng thời gian không có reason riêng tư; UI hiển thị warning sau server acknowledgement, không giả đã nhận việc. P0 chưa hoàn tất: approval invalidation, hardening đồng đều các command/read còn lại và E2E warning vẫn còn. Không đánh dấu P1–P5 đã thực hiện.

**Vấn đề:** F2, F3, F5 và tài liệu drift. **Phụ thuộc:** không.

**Thực hiện:**

- Viết test deferred Promise cho A→B, A→đóng, logout/login cùng parish, reset rồi login lại; áp request generation cho reads và scope/resource ownership cho writes.
- Cache fallback phải loại quyền/detail không còn đủ provenance; lỗi cũ không ghi vào phiên mới. Không tạo queue mới.
- Chuẩn hóa target lookup người/tài khoản khi kiểm tra blockout; giữ reason riêng tư. Đưa warning hiện có ra UI trước/hoặc cùng acknowledgement rõ ràng, không nuốt return value.
- Test approve→sửa nội dung→DONE; chốt trường nào invalidates approval. Đề xuất title/description/required-checklist/dependency thay đổi phải duyệt lại; comment và read-state không reset. Không dùng task.version chung làm content revision nếu acknowledgement/metadata cũng thay đổi.
- Hợp nhất trạng thái tài liệu, giữ đề xuất lịch sử nhưng đánh dấu superseded.

**Files chính:** operationsStore, OperationsPage, WorkstreamPanel, EventReminderForm; routes/operations, operationsAuthorization; component/store/integration tests.

**Nghiệm thu:** response cũ không mở lại detail hoặc append dữ liệu vào event khác; person-linked assignment nhận warning tương đương user-linked; chấp nhận cũ không hợp lệ cho nội dung mới theo policy đã duyệt; không thay invariant tenant/terminal.

**Khôi phục:** thay đổi frontend additive, không sửa dữ liệu người dùng. Nếu approval cần schema mới, triển khai theo migration additive sau khi chốt, không xóa lịch sử approval.

### P1 — Hoàn chỉnh công việc cá nhân và bàn giao (D2/D3)

**Phụ thuộc:** P0. **Giá trị:** người nhận việc làm được hết hành trình, không chỉ người tạo.

- Task detail route/drawer độc lập: thông tin, assignees, checklist, comments, dependency đơn giản, quyền/action riêng.
- Expose update, approve/reject, comment, remove/reassign qua typed API; không đặt business logic tại component.
- “Chờ tôi duyệt” và “Cần điều phối lại” là query/projection dựa dữ liệu hiện có, không dựng bảng task bản sao.
- Từ chối phải lưu lý do và hiện cho điều phối viên. Đề xuất `replace-owner` command nhận taskVersion + assignmentVersion + người mới + reason; revoke cũ/assign mới PENDING trong một receipt transaction. Không giả ACCEPTED cho người mới, không mất OWNER nếu tạo người mới thất bại.
- Vì current OWNER còn giữ unique slot khi DECLINED, UI không chỉ gọi assign mới và để người dùng gặp unique conflict; dùng bàn giao nguyên tử hoặc hướng dẫn revoke rõ ràng trong interim.
- Khi task-only user mở detail, không cấp toàn event view. Có thể trả header event tối thiểu, scoped và được contract cho phép, thay vì tải nguyên event detail.

**Nghiệm thu:** E2E OWNER từ chối → manager thay người → người mới nhận → hoàn tất; APPROVER duyệt đúng phiên bản; OBSERVER bị server từ chối execute; deep link task-only không lộ tasks cùng sự kiện; fail giữa replace rollback toàn bộ.

**Docs:** API, Business Rules/ADR nếu thay policy; không đổi `users.role`.

### P2 — Lifecycle trước/trong/sau sự kiện (D3, cần duyệt nghiệp vụ)

**Phụ thuộc:** P0/P1. **Đề xuất cụ thể để quyết định:** giữ `isRequired`; thêm `phase = PREPARATION | EXECUTION | FOLLOW_UP` trên task. Đây là proposal, chưa tồn tại trong schema.

- Backfill task hiện có thành PREPARATION để giữ nghĩa readiness đang dùng; không suy phase từ deadline hoặc title. Event đã COMPLETED/CANCELLED không bị mở lại.
- READY/LIVE: required PREPARATION phải hoàn tất; required EXECUTION/FOLLOW_UP chưa phải DONE, nhưng phải có người chịu trách nhiệm đã nhận và không có blocker chuẩn bị rõ ràng. Chỉ checklist chuẩn bị được tính ở cổng bắt đầu.
- COMPLETED: kiểm tra required tasks của các phase đã hoàn tất và có outcomeSummary; việc còn lại phải hoàn tất hoặc được xử lý bằng quyết định rõ ràng, không bỏ qua chỉ vì hủy task. Readiness override hiện có không tự được dùng làm quyền override closure.
- Tách dữ liệu trả về: blockers trước bắt đầu, việc đang thực hiện, việc hậu kiểm. Không gộp thành một phần trăm khiến người dùng hiểu “100%” là mọi việc đã xong.
- Giữ event lifecycle hiện tại; thời gian thực tế kết thúc có thể ghi riêng, không đổi nghĩa LIVE/COMPLETED tùy tiện. Chưa cần thêm state machine builder.
- Có kế hoạch thay người khi LIVE bằng capability cụ thể/audit, vì current workstream member mutation bị planning gate chặn. Không mở lại toàn bộ cấu hình event chỉ để đổi người trực.
- Completion gate phải nhất quán với snapshot nhiệm vụ. Nếu version event không bao quát child mutations, dùng transaction/readiness token hoặc aggregate revision có chủ đích; không tin phần trăm client.

**Nghiệm thu:** chuẩn bị chưa xong chặn LIVE; trực trong sự kiện chưa DONE không chặn khởi động; hậu kiểm bắt buộc chưa xong chặn COMPLETED; sửa child giữa read/transition được phát hiện; override, cancelled required task, account mất quyền đều có regression.

**Migration/recovery:** schema/migration/schemaHealth cùng commit; validate legacy rows trước backfill, kiểm tra old/new client compatibility; chặn down-version writer không hiểu phase trong rollout hoặc giữ feature disabled. Không drop phase/dữ liệu để rollback; ưu tiên rollback UI và forward fix, khôi phục backup chỉ qua quy trình restore đã duyệt.

### P3 — Nhắc việc đáng tin và quản lý được (D3)

**Phụ thuộc:** P0; approval/assignment trigger tích hợp sau P1. Nhắc event/task thủ công và hủy PENDING đã có, không làm lại.

**Read model:** thêm resource reminder list cho actor có task.assign/event.manage; trả trạng thái, thời gian, recipient label tối thiểu, version, khả năng sửa/hủy. Inbox cá nhân hiện tại vẫn tối thiểu. Không trả provider error, queue IDs hoặc lý do bận ra client.

**Reschedule — lựa chọn đề xuất:** thêm `version` monotonic cho reminder, mặc định 1; command nhận expectedVersion + triggerAt mới + reason, chỉ PENDING. CAS gồm tenant/id/version/status. Cập nhật triggerAt, dedupeKey, retry metadata và audit/receipt cùng transaction; unique conflict phải rollback giữ nguyên lịch cũ. Không đổi resource hoặc người nhận bằng endpoint này.

- cancel/enqueue/terminalization và mọi scheduling-relevant writer phải tăng version; readAt không cần làm invalid lịch gửi nếu được định nghĩa là state độc lập.
- Due worker đang chọn candidate ngoài transaction: trước enqueue phải kiểm tra lại **current triggerAt/nextAttemptAt <= now** trong transaction, không chỉ status PENDING. Nếu không, lịch vừa dời có thể bị gửi sớm. Đây là gate bắt buộc khi thêm reschedule, chưa khẳng định bug hiện tại vì chưa có reschedule writer.
- ENQUEUED/SENT không sửa/thu hồi; UI nói rõ giới hạn. “Đã bàn giao”, “Nhà cung cấp đã nhận”, “Đã đọc” không đổi thành “người nhận chắc chắn đã thấy”.
- Legacy cancel client không gửi version: hoặc nâng toàn bộ client/route cùng đợt có compatibility gate, hoặc fail bằng upgrade-required; không giữ đường hủy không có version âm thầm sau khi cho sửa lịch.
- Xác định semantics dedupe tombstone: key cũ/receipt cũ vẫn chứng minh command cũ đã xảy ra, không tự tạo lại khi replay. Test tạo mới cùng lịch sau reschedule, lịch hủy và receipt-expired trước rollout.
- Chưa thêm auto-reminder hàng loạt. Khi bổ sung assignment notification/digest, reuse shared queue, enqueue sau domain commit bằng transaction/outbox hiện hữu, chống trùng theo domain event; thời gian nhắc/quiet hours cần cấu hình hợp lệ và timezone rõ ràng.

**Nghiệm thu:** edit vs edit, edit vs cancel, edit vs due-worker (lịch được dời không gửi sớm), response loss cùng key, dedupe conflict rollback, revoke recipient, khác parish, expired receipt; E2E create→edit→recipient inbox→cancel. Mock provider để chứng minh domain flow; physical push là gate riêng.

**Recovery:** additive migration version; rollback frontend không cho writer cũ bỏ expectedVersion; không xóa receipt/tombstone hoặc đẩy lại ENQUEUED để “khôi phục”.

### P4 — Nhóm độc lập, nhiệm kỳ và lịch phục vụ (D3)

**Phụ thuộc:** P0/P1; phối hợp P2 cho thay người khi LIVE.

- Expose `GET /workstreams` đã có cho lối vào nhóm độc lập. Typed create hỗ trợ eventId nullable và sourceUnitId theo backend; giữ authority organizational create cho nhóm không có event.
- Dùng cùng panel/detail, không tạo group engine khác. Cần danh sách task theo workstream có auth/pagination server, không lấy toàn parish rồi lọc client.
- Membership form expose startsAt/endsAt; hiển thị chưa hiệu lực/đã hết hạn. Đề xuất endpoint cập nhật validity với aggregate+member version, audit; đổi role/target qua revoke/replace rõ ràng, không mutate identity lịch sử.
- Candidate lookup theo scope trả id, tên, account eligibility tối thiểu; dùng cho workstream/task/reminder. Không fetch toàn parish profile chỉ để chọn tên.
- Báo bận: API list/edit/revoke self-scoped và UI; manager chỉ nhận warning thời gian, không mặc định thấy reason riêng tư.
- Task deadline không phải ca phục vụ. Chỉ thêm `scheduledStartAt/scheduledEndAt` optional khi cần phân ca thật; khoảng hợp lệ và timezone theo event. Cảnh báo overlap chỉ có độ tin cậy khi có interval, không suy bằng số lượng task.

**Nghiệm thu:** trưởng ngành không thấy nhóm ngành khác, người giữ vai trò hết hạn không ghi được, user/person lookup nhất quán, offset/time-boundary tests; E2E nhóm không có event → task → giao/nhận; membership expiry không cần logout để quyền bị thu hồi server-side.

### P5 — Tổng kết và mẫu tái sử dụng có giới hạn (D2/D3)

**Phụ thuộc:** P2 và pilot luồng thủ công ổn định.

- Hoàn thiện tổng kết theo cấu trúc nhẹ: kết quả, điều cần cải thiện, follow-up có OWNER/hạn. Parish Memory là lịch sử; task follow-up là công việc thật liên kết lại nguồn, không copy nội dung cá nhân ra bản công khai.
- Mẫu đầu tiên do người vận hành duyệt: sinh hoạt định kỳ, lễ bổn mạng, trại/sa mạc. Đây là tập mẫu đề xuất, không mặc định lịch phụng vụ hoặc nghi thức.
- Mẫu copy nội dung/checklist/phase và thời hạn tương đối; không copy accepted assignments, approval, attendance, comments riêng, receipt hoặc nhắc đã gửi.
- Có template version, preview và xác nhận ngày/nhân sự; instantiate receipt-backed all-or-nothing. Event đã tạo không tự đổi khi template thay đổi.
- Thực hiện nhân bản từ mẫu bằng tay trước khi cân nhắc recurrence scheduler. Không tự xếp lịch theo lịch phụng vụ khi chưa có nguồn/calendar policy.

**Nghiệm thu:** double-click chỉ một event, lỗi child rollback, không mang quyền/nhân sự lịch sử sang lần mới, sửa template không sửa event cũ, linked calendar vẫn một SSOT.

## 8. Ví dụ end-to-end cá nhân hóa: lễ bổn mạng xứ đoàn

Đây là kịch bản nghiệm thu tổng hợp giả lập, không phải quy trình tôn giáo được xác nhận.

1. Người tổ chức tạo operation và liên kết lịch công khai hiện có; chọn nhóm phụng vụ, hậu cần, truyền thông từ scope phù hợp.
2. Trưởng nhóm giao người chính và người phối hợp; hệ thống cảnh báo lịch bận, không tự kết luận người đó đồng ý.
3. Người phục vụ vào “Việc của tôi”, nhận hoặc từ chối kèm lý do; manager xử lý thay thế không mất lịch sử.
4. Việc chuẩn bị “kiểm tra âm thanh” phải xong trước LIVE; việc “trực âm thanh” chạy trong sự kiện; “trả thiết bị” là hậu kiểm.
5. Người duyệt xác nhận chương trình trên nội dung hiện tại. Sửa nội dung sau duyệt yêu cầu duyệt lại theo policy.
6. Trong sự kiện, người trực báo vướng và trưởng nhóm điều phối trong scope; không cần mở toàn quyền admin.
7. Sau sự kiện, hậu kiểm xong và có tổng kết mới đóng; một follow-up cải tiến được giao thành task thật.
8. Lịch công khai và Parish Memory không chứa lời từ chối, lý do bận hay bình luận nội bộ.

## 9. Kiểm chứng và triển khai

### 9.1 Ma trận kiểm thử theo boundary

- **Domain:** state machine, required-phase readiness, approval invalidation, owner replacement, role expiry, dedupe/reschedule state.
- **Security/tenant:** parent denied; staff không scope denied; trưởng ngành/ban đúng và sai scope; expired term; mixed IDs; account locked/deleted; person unlink; organizer+OWNER/APPROVER; task-only deep link.
- **Concurrency:** generation/ABA/session change; stale aggregate/member/reminder; failed transaction không partial write; simultaneous claim/reschedule; replay sau mất response; receipt pruning.
- **Privacy/offline:** cache exact account, không cached permission hoặc private reminder projection, no detail resurrection; mất mạng không báo lưu; push không có nội dung task; PII không vào audit/telemetry ngoài contract.
- **UI/DS:** nhãn tiếng Việt, keyboard, lý do bắt buộc, conflict giữ draft, tránh double-submit, trạng thái gửi/lưu khác nhau, mobile controls không bị bàn phím/safe area che.
- **E2E:** tập hành trình P1/P2/P3/P4/P5 trên backend và DB sandbox thật; API read-back kết quả, không chỉ kiểm tra có nút. Không arbitrary sleep hoặc xóa assertion để pass.
- **Migration:** fresh + upgrade từ snapshot hiện hữu, schemaHealth, tenant composite constraints, backfill bảo toàn dữ liệu, negative tests cho version/phase invalid, old writer compatibility.

### 9.2 Lệnh/điểm kiểm tra trong repo

Kiểm tra lại package/CI trước khi chạy ở mỗi implementation slice:

- Targeted `npm run test -- <affected files> --fileParallelism=false`.
- `npm run test:security-critical` khi thay auth/tenant; Operations integration phải chạy riêng vì không được giả định mọi case Operations nằm trong script đó.
- `npx tsc -b --noEmit`, `npx tsc --noEmit -p server/tsconfig.json`, `npm run lint`, `npm run lint:ds`, `npm run lint:architecture-inventory` theo scope.
- `npm run test:e2e -- e2e/operations.spec.ts` và file journey bổ sung; không chiếm cổng hay kill server của task khác.
- Broad `npm run verify:ci` trước release khi phạm vi thay đổi rộng; không chạy nhiều coverage process tranh thư mục.
- `npm run benchmark:operations` chỉ hỗ trợ baseline synthetic; không kết luận field performance từ đó.

### 9.3 Pilot và khôi phục

Pilot đề xuất: một nhóm phục vụ với một sự kiện thường kỳ và một sự kiện có nhiều nhóm, do chủ sản phẩm chọn; số người/quy mô chưa có dữ liệu để chốt. Quan sát khả năng nhận việc, từ chối, thay người, mở task, hiểu blocker, đặt/hủy nhắc và đóng sự kiện.

Release gate: migration đã rehearsal trên bản sao hợp lệ, restore procedure đã kiểm tra, cấp quyền đúng, không có lỗi critical tenant/data-loss, E2E liên quan đạt, thiết bị/mạng thực có kết quả và người vận hành hiểu giới hạn offline/push. Không deploy hoặc thay retention tự động từ tài liệu này.

Rollback ứng dụng phải tương thích schema mới. Khi không tương thích, tắt bề mặt mới/forward-fix thay vì chạy binary cũ có thể ghi mất phase/version. Không “khôi phục” bằng xóa dữ liệu Operations, receipt hoặc hàng đợi.

## 10. Đo hiệu quả mà không biến phục vụ thành chấm điểm

Áp dụng `quantitative-targets`: các chỉ số dưới đây là **đề xuất đo, baseline UNKNOWN, chưa có SLO hoặc ngưỡng nghiệm thu số được phê duyệt**. Không dùng ngưỡng tùy ý thay correctness gate.

- Thời gian nhận việc: assignedAt→respondedAt cho lời mời hợp lệ; báo median/p95 khi mẫu đủ, tách ngoài giờ và lời mời bị thu hồi, không xếp hạng từng người.
- Tỷ lệ lời mời chưa phản hồi tại mốc chuẩn bị: mẫu số là lời mời active trong event scope; hiển thị thiếu coverage thay vì quy kết từ chối là lỗi.
- Khả năng bắt đầu sự kiện: blockers BEFORE_START theo loại và tuổi blocker; không dùng phần trăm hoàn thành task để thay readiness.
- Nhắc việc: schedule→enqueue và enqueue→provider outcome đo riêng; loại nhắc bị hủy hợp lệ khỏi chỉ số gửi, nhưng báo số bị suppress vì mất quyền. Provider success không đo được người thực sự đọc.
- UX: tỷ lệ hoàn thành hành trình trong pilot, lỗi thao tác và nơi phải quay lại chat; không tự hứa giảm bao nhiêu phần trăm thời gian.
- Kỹ thuật: p95 list/detail/command theo workload, network/device và kích thước data; query-count/heap cho authorization pagination. Chỉ tối ưu DB khi có baseline và vẫn chứng minh auth predicate tương đương.

Security, tenant isolation và không mất mutation là invariant PASS/BLOCK/UNKNOWN, không có error budget. Telemetry chỉ metadata/timing/count trong scope cần thiết, không log nội dung task, lý do từ chối hoặc tên trẻ em.

## 11. Quyết định cần chủ sản phẩm xác nhận

Các quyết định sau không cản P0 viết test và hoàn thiện luồng đang được phê duyệt, nhưng phải chốt trước slice thay đổi nghĩa nghiệp vụ:

1. **P2 — Phân phase:** đề xuất PREPARATION/EXECUTION/FOLLOW_UP + isRequired; đóng sự kiện sau hậu kiểm bắt buộc. Xác nhận đây có đúng cách xứ đoàn muốn vận hành không.
2. **Approval:** đề xuất chỉ bật khi cần; nội dung/checklist yêu cầu đổi thì duyệt lại. Có cấm OWNER tự duyệt không? Không mặc định cấm hay cho thêm vai trò ngoài staff.
3. **Thay người khi LIVE:** đề xuất trưởng nhóm được thay trong nhóm với reason/audit và người mới phải nhận; không tự sửa organizer/scope hoặc trạng thái event.
4. **Timezone tổ chức:** đề xuất cấu hình parish IANA timezone làm chuẩn cho ngày nhiệm kỳ; event vẫn giữ timezone riêng. Giá trị cụ thể không tự suy từ timezone máy developer.
5. **Pilot:** chọn một nhóm/sự kiện đại diện, ai duyệt mẫu và mục tiêu phục vụ. Lịch triển khai theo tuần/ngày chỉ ước tính sau khi biết nguồn lực và các quyết định này.

Không cần quyết định mới để bảo vệ tenant, giữ receipt, loại Telegram, không báo lưu giả hoặc sửa lỗi phản hồi cũ: đó là invariant/định hướng đã có.

## 12. Những gì chủ động chưa xây

- Gantt/critical-path engine, OKR/portfolio, timesheet, bảng xếp hạng năng suất, AI tự giao người hoặc tự duyệt.
- CRM, hộ gia đình, payment/ticketing, đăng ký công khai và đồng bộ bộ sản phẩm doanh nghiệp.
- Recurrence vô hạn, automation builder, generic permission grants, email/Telegram provider mới.
- Offline writes trước khi có durable ownership/remap/receipt/reconciliation/expiry/conflict design và nhu cầu field thật. Có thể cải thiện read-only snapshot trước.
- Exactly-once push: endpoint ledger có thể giảm gửi trùng nhưng không chứng minh người dùng chỉ nhận đúng một lần qua mọi crash/provider/network. Không dùng tên gọi đó làm lời hứa sản phẩm.

Ưu tiên tiếp theo đề xuất là **P0 → P1 → P2**, không tiếp tục thêm nút nhắc việc rời rạc trong khi luồng nhận việc, bàn giao và mốc hoàn tất còn khoảng trống.
