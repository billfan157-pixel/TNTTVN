# Rà soát vòng đời sự kiện và quyền hiển thị

## Phạm vi và kết luận

Đây là thiết kế đã được nối vào runtime local theo yêu cầu đã duyệt. Nó không phải chứng nhận production: migration backup, remote multi-instance và push thiết bị thật vẫn cần gate môi trường.

## Quy tắc đã chốt

- DRAFT chỉ creator và admin được thấy. Organizer được chỉ định không thấy nháp; Trưởng Xứ đoàn không có ngoại lệ đọc nháp người khác.
- Từ PLANNING: nội bộ chỉ thành viên trong scope, admin và Trưởng Xứ đoàn; thông tin công khai theo visibility, task/phân công luôn nội bộ.
- Tạo task, phân công và dùng/lưu mẫu ở DRAFT; tiếp tục tạo task ở PLANNING, PREPARING, READY. Không gửi lời mời nhận việc trước PLANNING. Creator/organizer quản lý mọi task trong event, admin vẫn có quyền. Không tự thêm quyền Operations cho thành viên chỉ vì họ được xem event.
- Nhận việc là assignment ACCEPTED, khác task approval. Khi tất cả người cần thực hiện nhận việc thì banner đề xuất PREPARING; người quản lý quyết định chuyển. Chuyển sớm phải xác nhận warning danh sách chưa nhận.
- Nhắc quản lý tối đa một lần/ngày, chỉ khi đủ điều kiện và event còn PLANNING. Dừng khi chuyển hoặc điều kiện mất hiệu lực.
- Chuỗi tiến: DRAFT → PLANNING → PREPARING → READY → LIVE → COMPLETED. Đánh giá sau hoàn thành. Lùi từng bước kể cả COMPLETED, bắt buộc lý do và audit; giữ task/acknowledgement. Lùi DRAFT gỡ calendar, không thu hồi thông báo đã giao.
- Không có task: không báo/nhắc đủ người nhận; quản lý vẫn có thể chuyển PREPARING bằng xác nhận.
- Đúng giờ bắt đầu, event đã xuất bản tự chuyển LIVE kể cả chưa READY, ghi lại trạng thái/điều kiện chưa đạt. Đến giờ kết thúc tự COMPLETED dù task/checklist chưa xong; không tự đánh dấu các công việc đó DONE. Worker phải xử lý bù nếu thức dậy sau giờ kết thúc.
- Lùi giai đoạn tạm dừng bền vững cả tự bắt đầu và tự kết thúc; chỉ tiếp tục khi quản lý chủ động bật lại. Không tự xuất bản DRAFT hoặc khởi động lại CANCELLED.
- Sửa nội dung quan trọng/người phụ trách yêu cầu nhận lại; sửa lỗi chính tả không reset. UI phải cho biết rõ loại thay đổi và server thực thi, không dùng suy đoán ngôn ngữ tự động.
- Một người chính và tối đa một dự bị; người giao chọn hạn nhận việc. Gửi sớm cho dự bị tại 70% khoảng từ thời điểm gửi lời mời thực tế đến hạn nhận việc (còn 30%), không tính từ ngày tạo nháp hay thời lượng thực hiện task. Ai nhận hợp lệ trước thắng nguyên tử trên server; vô hiệu lời mời còn lại.

## Checkpoint triển khai hiện tại

- Migration `20260910-253` đã thêm PREPARING, completion ownership và automation pause; `20260910-254` thêm persistence người chính/dự bị cùng active-dispatch uniqueness.
- Authorization chặn DRAFT trước resource role; list/detail/task graph đều giữ creator/admin-only. Calendar và parent notification chỉ materialize khi DRAFT → PLANNING; lùi DRAFT gỡ projection nhưng giữ task/acknowledgement và không giả vờ thu hồi notification đã gửi.
- Transition tiến/lùi liền kề, warning nhận việc, pause/resume và completion record ownership chạy trong transaction với OCC, receipt và audit. Worker 30 giây dùng CAS để nhiều instance hội tụ auto LIVE/COMPLETED; auto completion ghi số task/checklist chưa xong và không tự đổi chúng.
- Dispatch OWNER có primary, optional reserve, acknowledgeBy và mốc reserve 70%. DRAFT lưu SCHEDULED; PLANNING mới gửi primary; reserve worker revalidate event/task/recipient authority. Inbox tối thiểu chỉ hiện lời mời đã gửi cho đúng user; first valid acceptance CAS thành một OWNER ACCEPTED. Dispatch mở bị hủy khi task/event terminal và direct OWNER không thể đi vòng.
- UI Operations đã có lifecycle warning/rewind/pause, form primary/reserve/deadline và inbox nhận việc. Targeted backend 52/52, client/store 49/49 và hai TypeScript build đạt ở checkpoint 2026-09-11.

## Drift ban đầu đã xác minh và trạng thái xử lý

1. `server/src/routes/operations.ts`, create event: row DRAFT có PUBLIC_SUMMARY đã gọi upsertPublicCalendarEvent và enqueuePublicEventParentNotification. Phải chuyển thời điểm publish sang lần vào PLANNING; rà cả update và template instantiate.
2. `eventTransitionSchema` và transition map không có PREPARING hay lùi về DRAFT. Migration 193 có SQLite CHECK cố định, nên sửa TypeScript không đủ. `src/lib/api/operations.ts` cũng khai báo union cũ.
3. Drift đánh giá đã sửa: `closureReadiness` không còn chặn khi thiếu retrospective; PUT chỉ cho COMPLETED. Blocker task required và outcome summary của manual completion vẫn được giữ; auto completion đã triển khai bằng worker CAS với báo cáo việc chưa xong.
4. Transition COMPLETED hiện insert một parishRecord mới. Reopen rồi complete với idempotency key mới có thể tạo thêm hồ sơ. Cần ownership/receipt theo event cho completion artifact, không suy uniqueness từ source_event_id vốn là soft link.
5. `decideOperationsAuthorization` ưu tiên resource role trước kiểm tổ chức và không có hàng rào nháp tại đầu quyết định. Guard DRAFT phải đi trước organizer/assignee/workstream role, sau tenant guard. Collection/count/detail/export/candidates/linked tasks đều phải tuân theo.
6. Drift tạo task LIVE đã sửa ở API. Template instantiate tạo task cùng event DRAFT phù hợp quyết định cuối; phải kiểm soát việc gửi lời mời/public projection, không trì hoãn tạo task sang PLANNING.
7. Readiness hiện gồm công việc chuẩn bị DONE, required workstream READY, owner/chỉ tiêu/checklist/dependency. Không dùng predicate này để quyết định tất cả người đã nhận việc; cần predicate nhận việc riêng.
8. Operations store có persisted scoped cache. Server thu hồi visibility không thể thu hồi dữ liệu đang nằm trên máy offline ngay lập tức; cần purge sau authoritative refresh và UX ghi rõ dữ liệu cũ, không hứa thu hồi tức thì.

## Thiết kế và thứ tự triển khai

### 1. Migration và domain contract

Thêm PREPARING vào CHECK/Drizzle/API/UI bằng migration mới; không sửa migration đã áp dụng. Giữ nguyên status của event cũ, không tự đưa READY về PREPARING. Kiểm FK/index/trigger khi rebuild bảng SQLite; rehearsal trên backup có task, membership, reminder, public links. Phải bảo toàn hash dữ liệu/cột cũ và có backup phục hồi. Không vô hiệu FK hay bỏ guard để ép migration qua.

Đánh giá đề xuất là workflow riêng sau COMPLETED, tránh một status mới làm tất cả query terminal phải đổi nghĩa. Lưu đánh giá cũ khi reopen, hiển thị là đánh giá của lần hoàn tất trước; không tự xóa.

### 2. Quyền và visibility dùng chung

Đưa trạng thái và createdBy vào resource authorization context, kể cả khi truy cập từ task/workstream. Chặn nháp trước mọi resource role. Từ PLANNING, membership trong scope cho view event nhưng không tự cho quyền sửa hoặc xem dữ liệu ngoài scope. Public endpoint chỉ trả projection tối thiểu, không task. Creator vẫn phải thuộc giáo xứ; creator không tự có quyền parish-wide ngoài event mình quản lý.

### 3. Transition command và calendar

Trong cùng transaction: tải event → quyền → OCC → adjacency → reason/warning confirmation → kiểm lại điều kiện → cập nhật state/projection/audit. Warning cần mã lỗi có structured pending list, không chỉ text. Khi người dùng xác nhận lại, server phải tính lại danh sách chứ không tin modal cũ.

Vào PLANNING mới upsert public projection và enqueue thông báo. Lùi DRAFT tombstone projection, dừng pending reminder; giữ source link để tái sử dụng khi mở lại. Khi complete lần nữa cập nhật đúng completion artifact do Operations sở hữu, không ghi đè parishRecord do người dùng nhập riêng.

### 4. Nhận việc và thông báo

Predicate: task chưa xóa/chưa hủy; mọi OWNER/CONTRIBUTOR chưa removed phải ACCEPTED và là target hợp lệ. Task thiếu owner không tính là đủ; không để tập rỗng tự báo sẵn sàng. APPROVER/OBSERVER không thuộc người cần thực hiện. Không có task không phát nhắc đủ người nhận, nhưng cho quản lý xác nhận chuyển.

Nhắc dùng outbox/lease hiện có; key unique theo parish/event/recipient/ngày giáo xứ. Kiểm lại PLANNING và predicate trước enqueue/send. Không reset daily key khi lùi rồi tiến trong cùng ngày; banner lấy từ server. Provider retry không đồng nghĩa bảo đảm exactly-once giao push.

### 5. Frontend, template và offline

ModalShell warning, hành động tiến/lùi dựa permission server, task create gate theo phase. Cache phải bỏ event/task không còn quyền sau refresh; queued mutation bị từ chối phải giữ trạng thái xung đột rõ ràng, không tự retry vô hạn hay mất mutation. Template được tạo task DRAFT; lời mời chỉ gửi từ PLANNING.

## Quyết định đã được xác nhận và rủi ro triển khai còn lại

1. Không còn chờ duyệt lại template DRAFT, tập task rỗng, đánh giá riêng sau COMPLETED hay nhận lại khi sửa quan trọng: đã được người dùng chốt như trên.
2. Auto completion phải ghi số task/checklist chưa xong, không làm mất blocker nghiệp vụ của task. Không bỏ guard thủ công chỉ để scheduler chạy được.
3. Primary/reserve đã có persistence invitation riêng; không tạo hai OWNER. Transaction CAS + unique owner chứng minh người nhận đầu tiên thắng trong local integration.
4. Reopen/recomplete đã dùng `completion_record_id` thuộc event để cập nhật đúng artifact, không tạo trùng; migration vẫn cần rehearsal trên backup thật.
5. Tách notification eligibility khỏi creation: recheck trạng thái và quyền trước delivery, giữ receipt/outbox và giới hạn nhắc theo ngày địa phương. Push thiết bị thật/multi-instance vẫn cần chứng cứ ngoài unit tests.

## Verification gates

### Kết quả checkpoint tách đánh giá

- Domain lifecycle + API Operations: 58/58 PASS trước lát cắt đánh giá.
- Sau thay đổi đánh giá: API Operations + OperationsPage + EventRetrospectivePanel: 71/71 PASS, gồm từ chối ghi ở DRAFT/LIVE, cho hoàn thành khi chưa có đánh giá, OCC/replay/audit và UI chỉ ghi sau completion.
- Server TypeScript build, frontend `tsc -b`, lint các file liên quan và Design System anti-drift: PASS.
- E2E Chromium `Operations P5`: 2/2 PASS trên database tạm, cổng 3210/3211; đánh giá → follow-up → nhận việc → API read-back và template instantiate. Sandbox đã cleanup. Chưa chạy WebKit trong checkpoint này; chưa xác minh push thiết bị thật hoặc scheduler đa instance.

### Gates còn lại cho toàn bộ vòng đời

- Local integration đã phủ ma trận DRAFT âm, public projection ở PLANNING/lùi DRAFT, OCC/idempotency, reopen/recomplete, auto lifecycle CAS và primary/reserve first-accept-wins. Gate tổng hợp cần tiếp tục được chạy khi các lát cắt thay đổi.
- Chưa có E2E trình duyệt mới đi trọn manager tạo dispatch → publish → recipient inbox → accept → task xuất hiện; đây là gate local còn lại.
- Chưa có bằng chứng push Web/Native trên máy thật, failover nhiều instance remote, production backup migration/recovery hoặc scheduler soak. Các mục này không thể được chứng nhận bằng unit test local.
- Daily manager reminder “đủ điều kiện chuyển PREPARING” và reset acknowledgement khi sửa nội dung quan trọng chưa được triển khai; cần lát cắt riêng, vì dispatch notification không thay thế hai semantics này.

## Nguồn

- [Operations routes](../server/src/routes/operations.ts): eventTransitionSchema, create/update/instantiate, readiness, closureReadiness, transition, acknowledge.
- [Authorization](../server/src/services/operationsAuthorization.ts): decideOperationsAuthorization, operationRoleAllows.
- [Schema migrations](../server/src/db/migrations.ts): migration 193 và các migration Operations tiếp theo.
- [Client contract](../src/lib/api/operations.ts), [store](../src/stores/operationsStore.ts).
- [Reminder service](../server/src/services/operationsReminderService.ts): enqueue/lease, không chứng nhận provider delivery.
