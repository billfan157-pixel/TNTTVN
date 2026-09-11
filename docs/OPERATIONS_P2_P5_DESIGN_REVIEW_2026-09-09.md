# Thiết kế triển khai Operations P2–P5

## Amendment cơ cấu tổ chức — 2026-09-09

Ban Điều hành là cấp cao nhất. Ngành và Ban chuyên môn là hai nhánh ngang cấp cùng trực thuộc Ban Điều hành; Trưởng ngành phụ trách công tác giáo lý, Trưởng ban phụ trách công tác chuyên môn Xứ đoàn. Một người được kiêm cả hai bằng hai nhiệm kỳ độc lập và chỉ nhận union capability trong từng scope tương ứng, không tạo quan hệ trên/dưới giữa hai chức vụ. Phó Xứ đoàn 1/2, Thư ký, Thủ quỹ, Ủy viên và Phó ban được lưu như chức vụ tổ chức chính thức nhưng không tự cấp Operations authority; resource role vẫn là đường cấp quyền tác nghiệp hẹp.

UI cây tổ chức và form quản trị đã phản ánh cấu trúc này. Service/DB chặn writer mới tạo Board có parent, tạo Ngành/Ban chuyên môn ngoài active Board, hoặc đổi loại/vô hiệu hóa Board còn child. Nhiệm kỳ leader cùng scope không được chồng ngày (inclusive); quy tắc này bảo đảm một Trưởng ban/Trưởng ngành tại một thời điểm nhưng vẫn cho phép cùng person kiêm nhiệm ở scope khác. Đây là additive guard; dữ liệu legacy không bị tự động reparent hoặc tự chọn leader thắng. Trước rollout phải inventory các root `BRANCH|COMMITTEE` và term overlap, quyết định đúng Board/leader theo nghiệp vụ rồi chạy reconciliation/restore drill có duyệt.

## Kết luận và phạm vi

Catevia tiếp tục phát triển trong modular monolith hiện có. Không cần workflow engine, dịch vụ nhắc việc mới hoặc hệ thống lịch riêng. Việc có giá trị nhất là hoàn thiện vòng đời nhiệm vụ theo giai đoạn, bảo vệ sửa lịch nhắc trước cạnh tranh với worker, đưa nhóm độc lập vào giao diện và tái sử dụng nội dung qua mẫu có kiểm soát.

Đây là bản đối chiếu mã nguồn ngày 2026-09-09, được cập nhật sau khi hoàn thiện các slice local. P2 có phase, closure gate, retrospective bắt buộc trước COMPLETED và đường khôi phục task bị hủy; P3 có reminder OCC/reschedule/cancel; P4 có scoped candidate/group/availability cùng task shift start/end; P5 có retrospective/follow-up và hạ tầng template versioned. Operations hiện là event writer duy nhất; Lịch là read-only public projection. Những kết quả kiểm thử chỉ chứng minh snapshot local đã chạy, không thay thế pilot, thiết bị thật, migration/recovery hoặc triển khai Turso production.

## Amendment: một event writer và public calendar projection

`operation_events` là command aggregate. Khi người có quyền chọn `PUBLIC_SUMMARY`, server tạo hoặc cập nhật đúng một `parish_events` projection và durable notification cho tập phụ huynh ACTIVE tenant-scoped trong cùng receipt transaction; dữ liệu task, phân công, readiness và hậu kiểm không được copy. `INTERNAL` không có projection; chuyển về internal hoặc cancel soft-delete projection. `sourceParishEventId` là server-managed identity và bị từ chối nếu client cố truyền.

Hai Calendar view, calendar store và API client chỉ gọi GET. Direct calendar POST/PUT/DELETE trả 405 kể cả admin, vì frontend ẩn nút không đủ để bảo vệ ownership. Legacy calendar rows được giữ để đọc, không xóa dữ liệu lịch sử. Push vẫn là at-least-once; test queue local không chứng minh máy thật hay multi-instance production.

Nguồn ngoài dùng để kiểm tra nguyên tắc thiết kế, không biến hành vi sản phẩm khác thành quy tắc bắt buộc của xứ đoàn. SQLite mô tả isolation và xung đột snapshot; AWS giải thích atomic outbox và duplicate delivery; Planning Center phân biệt blockout với thời gian phục vụ; Google SRE yêu cầu action item có owner rõ ràng.[1][2][3][4] Asana dùng relative dates cho template; Stripe minh họa việc bind idempotency key với cùng tham số; MDN cảnh báo Background Sync không Baseline và trình duyệt giới hạn retry/thời gian worker.[6][7][8] Jira dùng archive như trạng thái ẩn/không chỉnh sửa nhưng có thể khôi phục và bị giới hạn bởi permission; Catevia chỉ áp dụng nguyên tắc lifecycle đảo ngược này, không sao chép mô hình Jira.[9]

## Bằng chứng kiến trúc hiện tại

`server/src/routes/operations.ts` là command/read boundary. Command ghi thông qua `runIdempotentOperationsCommand` trong `server/src/services/operationsIdempotency.ts`; receipt scope theo parish, actor, key và hash payload. Response đã prune để lại tombstone. Không thay bằng hai request remove/create khi bàn giao hoặc cancel/create khi sửa lịch.

`server/src/services/operationsAuthorization.ts::operationRoleAllows` tách manage, execute và approve. Account admin không mặc nhiên được approve/execute. Active organizational position và resource role vẫn là nguồn quyền. P4/P5 phải tái sử dụng resolver này, không suy quyền từ tên chức vụ hoặc từ việc thấy một người trong picker.

`server/src/db/transactions.ts::runDbTransaction` retry SQLITE_BUSY; read-check-write nằm trong transaction nhưng chưa đủ để khẳng định mọi interleaving hoặc remote libSQL đã được kiểm thử. SQLite có thể từ chối nâng snapshot cũ lên write, thay vì âm thầm ghi trên snapshot lỗi thời.[1] Vì vậy test cạnh tranh phải chấp nhận một command bị conflict/retry, tuyệt đối không chấp nhận cả hai commit gây sai điều kiện.

`server/src/services/operationsReminderService.ts` đọc candidate ngoài transaction nhưng hiện đã đọc lại status, version và điều kiện due-time trong transaction trước enqueue. Reschedule/cancel dùng expectedVersion, receipt và CAS; retry path không ghi đè lịch đã dời. Shared notification queue có deterministic ID; provider success vẫn không đồng nghĩa con người đã đọc.[2]

Checkpoint hoàn tất local sau nghiên cứu: `src/pages/OperationsPage.tsx` và các form Operations đã chuyển sang candidate directory tối thiểu theo resource; task list có filter workstream. Picker và write command đều giới hạn Trưởng ngành/Trưởng ban vào người có nhiệm kỳ hiệu lực trong unit/descendants. Membership validity editor/command đã có OCC kép, reason, audit và receipt. Blockout đã có versioned self list/edit/revoke UI; lý do chỉ trả cho chủ nhân và không xuất hiện trong manager warning/audit. LIVE lead replacement dùng command nguyên tử và khóa add/remove/validity rời rạc; target mới phải actionable, đúng org scope và không trùng linked identity. Panel nhóm độc lập dùng `GET /units` được authorize, bắt buộc sourceUnitId và hỗ trợ group → member → task → assignment. E2E real backend/DB đã đạt Chromium và WebKit.

## P2: giai đoạn và các mốc sự kiện

Migration 236 là additive: phase NOT NULL, enum CHECK, mặc định PREPARATION. Nhiệm vụ cũ không được suy phase từ title/deadline; trạng thái DONE và event đã đóng không thay đổi. API create hiện chấp nhận phase; API update chưa hỗ trợ đổi phase. Frontend phải hiển thị phase trên danh sách và chi tiết, cho chọn khi tạo; không làm default của client ghi đè phase server khi chỉ sửa trường khác.

Điều chỉnh cần thiết so với roadmap cũ: checklist hiện thuộc task và không có phase riêng. Trong phạm vi P2, checklist đi theo phase task. Nếu cần kiểm tra chuẩn bị cho một việc EXECUTION, tạo task PREPARATION riêng; không thêm ngầm cột phase cho checklist. Dependency của công việc tương lai được xét khi hoàn tất task; không yêu cầu tất cả công việc tương lai hoàn tất trước start.

READY/LIVE cần required PREPARATION DONE và các gate chuẩn bị hiện có. Required EXECUTION/FOLLOW_UP cần OWNER accepted, target còn hợp lệ và task không BLOCKED/CANCELLED. COMPLETED cần tất cả required tasks DONE cùng tổng kết. Phần trăm chuẩn bị không phải phần trăm toàn bộ sự kiện. UI cần nhãn rõ “Chuẩn bị” và nhóm việc trong/sau; closure blockers phải hiển thị riêng.

Rủi ro cancelled-required đã được đóng bằng command hẹp `POST /tasks/:id/restore`: không âm thầm coi hủy là hoàn tất và không tạo closure override. Chỉ actor có task.manage trên resource, với reason + current version + receipt/audit, được đưa `CANCELLED -> TODO`; event cha terminal bị từ chối và reminder cũ không tự sống lại. Backend tiếp tục tính readiness/closure từ trạng thái mới.

Gate E2E P2: tạo đủ ba phase bằng UI; giao/nhận người phụ trách; PREPARATION chưa xong chặn start; EXECUTION/FOLLOW_UP TODO có OWNER accepted cho start; summary không cho đóng khi hậu kiểm chưa xong; hoàn tất hậu kiểm rồi đóng; API read-back phase/status và lịch sử. Test backend riêng cho child mutation cạnh tranh với transition, revoked account, cancelled required và stale version. Không dùng phần trăm UI làm bằng chứng authorization.

## P3: sửa lịch nhắc nguyên tử

Giữ inbox cá nhân; thêm list theo resource cho task.assign/event.manage, projection tối thiểu. Reminder version mặc định 1; reschedule chỉ PENDING, nhận expectedVersion, triggerAt, reason. CAS theo parish/id/version/status; không đổi recipient/resource. Reschedule, cancel, enqueue, terminalization đều tăng version. readAt độc lập, không làm lỗi lịch gửi đang chỉnh.

Worker phải recheck triggerAt và nextAttemptAt ngay trong transaction, trước mọi tác động queue. Catch retry cũng phải tránh ghi đè lịch mới bằng metadata của candidate cũ. Cần test có điểm đồng bộ xác định: worker đã chọn candidate, reschedule commit, worker tiếp tục; assert không tạo notification sớm. Không dùng sleep để mong tạo race.

DedupeKey biểu diễn lịch hiện tại, receipt biểu diễn command lịch sử: key cũ không được tái thực thi khi replay. Cần chỉ rõ sau reschedule có cho tạo một reminder khác ở giờ cũ hay không; đề xuất cho phép nếu không trùng lịch hiện hành, nhưng không phục sinh command cũ. Collision lịch mới rollback nguyên vẹn. Cancel client cũ thiếu expectedVersion phải fail rõ ràng khi đã bật reschedule; không duy trì đường ghi bỏ OCC.

E2E P3: tạo → sửa giờ → tải lại → inbox người nhận → hủy; read-back version/status. Integration thêm edit/edit, edit/cancel, edit/worker, response-loss replay, cross-parish, recipient revoke, pruned receipt. Không bổ sung Telegram hoặc provider mới. AWS mô tả outbox vẫn cần consumer idempotent; do đó không tuyên bố exactly-once push.[2]

## P4: nhóm độc lập và lịch phục vụ

Read contract tối thiểu: task list filter workstreamId phía server, áp dụng tenant và capability trước pagination; candidate lookup theo resource trả id, tên, eligibility, không trả liên hệ/hồ sơ đầy đủ. Hai contract này hiện đã triển khai. Trưởng ngành/Trưởng ban chỉ được đọc/chọn/ghi target có active service term trong unit phụ trách hoặc descendants; Admin/Trưởng Xứ đoàn parish-wide. Group không event phải có organizational scope rõ; không dùng eventId giả. Tái sử dụng panel bằng context nullable có kiểu rõ ràng thay vì dựng một engine khác.

Validity edit chỉ đổi startsAt/endsAt với groupVersion/memberVersion và audit; role/target đổi bằng replace/revoke để giữ lịch sử. LIVE đã có đường thay/bổ nhiệm lead giới hạn và nguyên tử, không mở toàn bộ planning mutations. Quyền hết hạn được đánh giá tại thời điểm command, không đợi đăng nhập lại.

Blockout self list/edit/revoke có version riêng; lý do không đưa vào manager list. Task hiện hỗ trợ đủ cặp `scheduledStartAt/scheduledEndAt`; schema, trigger và API từ chối cặp thiếu hoặc end không sau start. Assignment/handover/follow-up dùng overlap nửa mở để hai ca giáp nhau không tự trùng; deadline-only cũ vẫn có point fallback end-exclusive. Planning Center chỉ là nguồn đối chiếu nguyên tắc conflict theo thời điểm phục vụ, không thay thế policy Catevia.[3]

E2E P4: nhóm độc lập → task → giao/nhận; đổi validity → hết quyền server; báo bận → cảnh báo tối thiểu. Integration phải thử cùng linked person/user, khác ngành, khác parish, mốc đầu/cuối validity và tài khoản bị khóa. Picker chỉ là UX, endpoint ghi luôn revalidate target.

## P5: tổng kết và mẫu

Giữ outcomeSummary và Parish Memory draft hiện có; thêm lessons/follow-up chỉ khi có contract lưu rõ ràng. Action item cần một OWNER và đường theo dõi, không chỉ một đoạn ghi chú; đây là phần phù hợp từ thực hành Google SRE.[4] Nội dung riêng tư không tự được công khai cùng calendar summary.

Checkpoint triển khai 2026-09-09: structured retrospective và follow-up đã hoàn tất local. Migration `20260909-239` tạo row 1:1 `(parish_id,event_id)` có OCC; event detail trả `retrospective|null`. PUT retrospective chỉ sau COMPLETED, dùng receipt/version và audit metadata không chứa nội dung. POST follow-up là command nguyên tử CAS event + task phase FOLLOW_UP + OWNER PENDING, bắt buộc hạn, revalidate actionable target và đúng scope Ban/Ngành; generic child create sau completion vẫn khóa. UI giữ outcome read-only, lọc người có account, cảnh báo blockout không lộ reason và chống response muộn/React Strict Mode. Regression migration/schema/backend/component đạt; E2E UI→server→recipient acknowledgement→read-back đạt Chromium và WebKit.

Template versioned hiện đã được triển khai bằng migrations `20260909-240..243`: family theo organizational scope, immutable JSON content version, monotonic family version và provenance `source_template_id/version` có trigger same-parish/existing-version/delete protection. Snapshot copy metadata event, task chưa hủy, checklist, phase/priority/required/approval requirement và deadline tương đối; không copy assignee identity, ACCEPTED, APPROVED, attendance, comment, dependency/workstream, receipt hoặc notification. Planning Center cho phép lưu snapshot nội dung và cả người trong template; Catevia cố ý không kế thừa lựa chọn copy người để tránh chuyển authority lịch sử sang kỳ mới.[5] Relative dates theo mốc event giúp mẫu không khóa vào ngày cũ, tương ứng nguyên tắc template của Asana.[6]

Instantiate bắt buộc preview ở UI, nhận exact template version, scope authorization hiện tại, receipt và all-or-nothing children. API vẫn cho exact version cũ để tái lập có chủ ý. Event mới là DRAFT; task TODO, checklist chưa xong và không có assignee. Internal instance không tạo calendar row; public instance dùng server-owned projection + parent notification trong cùng transaction, không nhận calendar link từ client. Sửa mẫu không sửa event đã sinh. Receipt bind key với canonical command/payload; client giữ lại key cho cả retry tự động lẫn lần bấm lại cùng payload chưa được ACK, chỉ đổi key khi payload đổi hoặc success, nên response-loss không tạo bản sao trong cùng phiên panel. Cách này cùng nguyên tắc an toàn retry trong API idempotent.[7] Không triển khai recurrence tự động, Gantt hoặc workflow builder.

Checkpoint lifecycle template 2026-09-09: archive/restore metadata đã được bổ sung vì `is_active` và immutable version/provenance đã có sẵn, còn xóa hoặc bỏ mặc mẫu sai làm UX kém an toàn. Hai command yêu cầu current `operations.event.create` đúng scope, reason, expected monotonic family version + latest content version, status CAS, receipt và audit metadata. Family version tăng ở create-version/archive/restore; regression xác nhận command lifecycle cũ trả 409 sau một vòng archive→restore, đóng rủi ro ABA mà `latestVersion + isActive` đơn thuần không chặn được. Archive loại mẫu khỏi catalog, preview, versioning và instantiate; restore bật lại đúng family, không tạo bản sao và không xóa snapshot/event provenance. UI quản lý snapshot/version/lifecycle nằm trong tab Mẫu của modal event, còn catalog instantiate nằm trong tab tiện ích trang chính; refresh giữa hai view tránh catalog stale. Projection template gắn với exact `parishId:userId`, ẩn ngay khi scope thay đổi và loại response tenant cũ về muộn. Journey UI→API→DB gồm snapshot, preview, instantiate không kế thừa assignee, archive và restore đã đạt Chromium 16,1 giây và WebKit 43,2 giây trên sandbox độc lập. Final affected-boundary regression đạt 84/84; full lint, Design System, architecture inventory và production build đạt.

Checkpoint authority/date 2026-09-09: audit phát hiện cả resolver chức vụ actor và guard phạm vi người được giao việc cùng so `parish_service_terms` bằng ngày UTC. Với giáo xứ UTC+7, khoảng 00:00–06:59 ngày biên có thể giữ quyền nhiệm kỳ cũ hoặc trì hoãn quyền nhiệm kỳ mới. Backend nay dùng ngày dân sự từ `PARISH_TIME_ZONE` do deployment quản lý, mặc định `Asia/Ho_Chi_Minh`, và startup fail nếu IANA timezone không hợp lệ. Regression cố định instant `2026-12-31T17:30Z` chứng minh nhiệm kỳ bắt đầu `2027-01-01` đã có quyền đúng unit còn nhiệm kỳ kết thúc `2026-12-31` không còn quyền. Audit kế tiếp còn phát hiện event nhận timezone tùy ý và Parish Memory completion cắt ngày UTC; API nay từ chối timezone không phải IANA và materialize `occurred_on/ended_on` theo timezone của event. Regression event 00:30 giờ Việt Nam chứng minh memory vẫn thuộc đúng ngày địa phương thay vì ngày UTC trước đó. Đây là invariant quyền/lịch sử, không suy từ timezone thiết bị.[12] Current boundary đạt **8 files / 92 tests qua hai bounded runs**; server TypeScript, full oxlint, architecture inventory và scoped diff check đạt.

Gate pilot trong roadmap vẫn giữ: hạ tầng template và fixture có thể hoàn tất local, nhưng không gọi mẫu nghi thức là được xứ đoàn duyệt khi chưa có người vận hành xác nhận. Chỉ release mẫu curated còn deferred; không coi thiếu pilot là lý do dừng hạ tầng P5.

## Lộ trình phần còn lại sau audit

1. Gate local restore/template đã hoàn tất ở targeted backend/component, TypeScript/server build và journey Chromium/WebKit; trước release vẫn chạy CI-equivalent trên snapshot worktree đã đóng băng.
2. Local SQLite rehearsal tooling đã được triển khai bằng `npm --prefix server run db:audit:operations-migration -- <finalized-backup.sqlite>`. Command từ chối DB live/default, chạy trong child process trên bản sao tạm, kiểm `integrity_check` + `foreign_key_check` trước/sau migration, startup schema readiness, bảo toàn count + SHA-256 của mọi cột cũ trong `operation_*`, rồi tạo và đối chiếu recovery snapshot. Source backup được hash lại để chứng minh không đổi và temp chỉ bị xóa sau khi worker thoát. Vẫn phải chạy command trên backup dữ liệu hợp lệ của môi trường mục tiêu; với Turso/R2 vẫn cần restore drill remote hiện hữu và forward-fix drill trước production. Không down-migrate/xóa snapshot hay receipt để rollback.[11]
3. Pilot nội bộ với một Ban và một Ngành: đo số event dùng template, số lần phải sửa sau preview, lỗi phân công ngoài scope, số lần archive/restore và task bị khôi phục. Đây là observation để quyết định nội dung curated, không phải KPI ép người phục vụ.
4. Kiểm chứng Web/Native Push trên thiết bị/mạng thật và multi-instance remote; local queue test không chứng minh delivery thực địa hoặc exactly-once.
5. Chỉ mở ADR mới cho durable offline mutations nếu pilot chứng minh nhu cầu. Background Sync không sẵn trên mọi trình duyệt và có retry/time limits; Workbox có thể lưu request lỗi trong IndexedDB và fallback replay khi service worker khởi động, nhưng điều đó vẫn không tự giải quyết authorization-at-replay, temp-ID graph hoặc conflict UX của Operations.[8][10] ADR tương lai phải chốt durable ownership, encryption/scope, temp-ID remap, dependency ordering, authorization-at-replay, receipt reconciliation, tombstone/pull và conflict UX trước code.

Các mục tiếp tục deferred có chủ ý: recurrence/RSVP, generic grant/workflow engine, Gantt, attachment store, chấm năng suất cá nhân, curated ritual templates chưa duyệt và durable offline mutation. Archive/restore template UI không còn deferred; nó đã được triển khai như lifecycle metadata đảo ngược, không phải delete. Các phần còn lại chưa có bằng chứng lợi ích đủ lớn để đổi lấy thêm nguồn trạng thái/quyền/đồng bộ.

## Thứ tự thực hiện và phục hồi

1. P2–P5 code local: phase/restore → reminder OCC → scoped groups/availability → retrospective/follow-up → template versioning/lifecycle.
2. Gate local cuối: CI-equivalent trên snapshot ổn định và diff review toàn worktree; targeted template E2E hai browser đã đạt.
3. Gate môi trường: chạy migration/recovery rehearsal vừa có trên backup mục tiêu, Turso/R2 restore drill, remote multi-instance và push thiết bị thật.
4. Pilot mới quyết định release mẫu nội dung curated hoặc mở ADR offline/recurrence riêng.

Mỗi slice chạy targeted domain/security tests, schema gates nếu có migration, TypeScript/build, lint/Design System và E2E khi claim đi qua UI/server. Sau các slice, broad regression/CI-equivalent trước release. Không chạy lại suite không bị ảnh hưởng chỉ để tăng số pass.

Rollout phải nâng toàn bộ backend writer trước khi bật UI phase/reschedule; client cũ không được ghi thiếu contract concurrency mới. Rollback ưu tiên tắt UI mới, giữ cột/receipt/history, forward fix. Không drop phase/version hoặc xóa notification để chạy lại. Rehearsal harness local đã có regression fail-closed; production backup/Turso recovery và physical push vẫn là gate môi trường chưa có bằng chứng.

## Nguồn

Đối chiếu ngày 2026-09-09; tài liệu sản phẩm có thể đổi URL/nội dung. Không sử dụng thời gian crawl như ngày công bố.

1. SQLite, [Isolation In SQLite](https://www.sqlite.org/isolation.html). Nguyên tắc snapshot/write conflict; không phải chứng nhận cấu hình libSQL production.
2. AWS Prescriptive Guidance, [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html). Atomic persistence và duplicate processing; áp dụng nguyên tắc, không yêu cầu dịch vụ AWS.
3. Planning Center, [Scheduling conflicts and blockouts](https://help.planningcenter.com/en/142878-scheduling-conflicts-and-blockouts.html). Thời điểm phục vụ và cảnh báo, không phải quy tắc Catevia.
4. Google, [Postmortem Culture](https://sre.google/workbook/postmortem-culture/), Site Reliability Workbook. Ownership/action items; không đưa quy trình incident doanh nghiệp nguyên khối vào xứ đoàn.
5. Planning Center Services, [Set up plan templates](https://pcoservices.zendesk.com/hc/en-us/articles/204461380-Set-up-plan-templates), trang ghi cập nhật 17-12-2025 tại lần tra cứu. Snapshot reuse và giới hạn thiết kế cá nhân hóa.
6. Asana, [Project templates](https://help.asana.com/s/article/project-templates). Relative dates dựa trên ngày bắt đầu/kết thúc và cảnh báo về task assignment trong template; chỉ dùng làm đối chiếu UX.
7. Stripe, [Idempotent requests](https://docs.stripe.com/api/idempotent_requests). Retry cùng key và kiểm tham số; Catevia dùng receipt nội bộ, không phụ thuộc Stripe.
8. MDN, [Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) và [Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation). Hỗ trợ trình duyệt/retry/time limit; dùng để giữ offline mutation fail-closed, không phải benchmark Catevia.
9. Atlassian, [Archive a work item](https://support.atlassian.com/jira-software-cloud/docs/archive-an-issue/) và [Delete or archive your plan](https://support.atlassian.com/jira-software-cloud/docs/delete-or-archive-your-plan/). Archive bị ẩn/không chỉnh sửa nhưng có thể restore và permission-scoped; chỉ dùng làm đối chiếu lifecycle đảo ngược.
10. Chrome for Developers, [Workbox Background Sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync) và [Retrying requests when back online](https://developer.chrome.com/docs/workbox/retrying-requests-when-back-online). Queue IndexedDB/replay fallback là transport aid, không phải bằng chứng an toàn domain/offline của Catevia.
11. SQLite, [SQLite Backup API](https://www.sqlite.org/backup.html), [VACUUM](https://www.sqlite.org/lang_vacuum.html) và [PRAGMA statements](https://www.sqlite.org/pragma.html). `VACUUM INTO` tạo bản sao nhất quán; `integrity_check` không kiểm foreign key nên rehearsal bắt buộc chạy thêm `foreign_key_check`. Đây là cơ sở kỹ thuật cho harness local, không chứng nhận Turso/R2 production.
12. MDN, [`Intl.DateTimeFormat` constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat). Tùy chọn `timeZone` nhận tên IANA và cho phép server format cùng một instant theo ngày dân sự đã cấu hình; nguồn này giải thích primitive nền tảng, còn policy quyền là quyết định riêng của Catevia.

Nguồn repo: `server/src/routes/operations.ts`, `server/src/services/operationsAuthorization.ts`, `server/src/services/operationsIdempotency.ts`, `server/src/services/operationsReminderService.ts`, `server/src/db/transactions.ts`, `server/src/db/schema.ts`, `server/src/db/migrations.ts`, `src/pages/OperationsPage.tsx`, `src/lib/api/operations.ts`, `e2e/operations.spec.ts` và roadmap P2–P5 hiện hành. Đây là đường dẫn để tái kiểm tra, không thay cho test runtime.
