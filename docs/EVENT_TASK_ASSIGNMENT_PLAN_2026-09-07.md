# Event Task Assignment & Organization Plan — Catevia (`brave-davinci` / `TNTTVN`)

> Version: 1.0 | Created: 2026-09-07 | Status: ⏳ ĐỀ XUẤT — chờ phê duyệt | Prerequisites: 02, 07, BUSINESS_RULES
>
> Phạm vi: tính năng **phân công nhiệm vụ & tổ chức chuẩn bị sự kiện** cho workspace `organization`.
> Phân loại: **D2 — Cross-module** (schema mới + notifications + offline queue + organization workspace).

---

## 1. Nghiên cứu đối chiếu các hệ thống hàng đầu thế giới

### 1.1 Nhóm Work Management (phân công nhiệm vụ chung)

| Hệ thống | Core concepts đáng tham khảo | Bài học rút ra cho Catevia |
| --- | --- | --- |
| **Asana** | Task = owner + due date rõ ràng; project làm hub; subtasks; dependencies; custom fields; My Tasks (mission control cá nhân); recurring tasks; workload view | Mọi task phải trả lời được "ai làm gì, trước khi nào". "My Tasks" cho từng tài khoản là view bắt buộc. |
| **Monday.com** | Board → group → item/subitem; cột status/people; nhiều view (kanban, timeline, calendar, workload); automation "when X then Y" | Status column là first-class field; assignment có thể theo **nhóm** chứ không chỉ cá nhân. |
| **ClickUp** | Multiple assignees; checklists; dependencies; custom statuses; priorities; task templates; tags | Checklist có progress bar tự tính là cơ chế rẻ mà hiệu quả nhất để track chuẩn bị sự kiện. |
| **Trello (Kanban)** | Board/list/card; checklist progress; due date + reminder; labels; members trên card | Kanban là view mặc định dễ tiếp nhận nhất cho BGL phi kỹ thuật; card member hiển thị avatar. |

### 1.2 Nhóm Church / Volunteer Management (cùng domain với TNTT — quan trọng nhất)

| Hệ thống | Core concepts | Bài học rút ra |
| --- | --- | --- |
| **Planning Center Services** (78.000+ nhà thờ) | Service Type → Plan → Order of Service items → **Teams → Positions**; quy trình schedule: **request → accept/decline → confirmed**; reminders tự động; **blockout dates**; plan templates tái sử dụng | Đây là SSOT mô hình volunteer scheduling tốt nhất trong domain. Catevia đã có `parish_organization_units` (Ban) + `parish_people` — chỉ còn thiếu lớp assignment + confirmation. |
| **Planning Center Calendar** | Rooms/resources booking với approval request; event request workflow | Giữ đơn giản: Catevia single-parish, chưa cần resource booking — để backlog. |
| **Planning Center Registrations / Check-Ins** | Đăng ký, ticket, attendance volunteer | Tương lai xa; không thuộc phạm vi plan này. |
| **Eventbrite** | Event page, registration, check-in app, analytics | Chỉ tham khảo phần "event detail page" — thông tin tập trung một nơi cho người tham gia. |

### 1.3 Synthesis — pattern lặp lại ở mọi hệ thống đầu ngành

1. **Assignment đa cấp**: cá nhân (assignee) và nhóm/team (unit) đều là first-class.
2. **Confirmation loop**: phân công ≠ đồng ý; có trạng thái chờ phản hồi (Planning Center: request → accept/decline).
3. **Template hóa**: sự kiện lặp (Trại hè, Tĩnh Tâm, Lễ Bổn Mạng) có template checklist; tạo event mới = prefill task.
4. **Nhiều view trên cùng dữ liệu**: calendar (đã có), board/kanban, My Tasks, progress theo event.
5. **Deadline + reminder**: notification gắn với due date và event date, không chỉ với event.
6. **Readiness metric**: % task hoàn thành mỗi event (checklist progress) — số liệu điều hành duy nhất BGL cần nhìn.

---

## 2. Hiện trạng Catevia (verified 2026-09-07)

**Có sẵn — nền tảng tốt:**
- `parish_events` (`server/src/db/schema.ts:1227`): sự kiện phẳng (date, title, category, time, location), soft delete, PK `(parish_id, id)`. Route `server/src/routes/parishEvents.ts` RBAC: `admin|chunhiem` write, mọi role read.
- **Identity tổ chức** (ADR-081): `parish_people` (identity, `linked_user_id` optional), `parish_organization_units` (BOARD/COMMITTEE/BRANCH/CHAPTER, cây đơn vị), `parish_service_terms` (person + unit + chức vụ).
- **Notification queue bền vững** (ADR-102): `notifications` là queue authority với `delivery_kind`, attempt/lease, Telegram/Web/native.
- **Offline queue mã hóa Dexie** scope `(parishId, userId)` + nguyên tắc acknowledgement-truthful UI (ADR-109).
- **Audit + transaction pattern** (ADR-099): domain row + redacted audit trong cùng transaction.
- **Tenant isolation**: composite PK, startup scan chặn row sai scope (ADR-106).

**Thiếu — khoảng trống tính năng:**
- Sự kiện không có trang chi tiết, không có task, không có phân công, không có checklist.
- Không có workflow xác nhận nhận nhiệm vụ.
- Không có template sự kiện lặp.
- Notification chưa gắn được với task/deadline của event.

---

## 3. Thiết kế đề xuất

### 3.1 Data model (migration mới, tuân thủ composite PK + tenant scope)

```
parish_event_tasks
  id, parish_id, event_id → parish_events(parish_id, id),
  title (≤200), description (≤2000, optional),
  status: TODO | IN_PROGRESS | BLOCKED | DONE
  priority: LOW | NORMAL | HIGH (default NORMAL)
  assignee_person_id → parish_people (nullable)
  assignee_unit_id → parish_organization_units (nullable)
  due_date (YYYY-MM-DD, validator lịch thật), sort_order,
  created_by, updated_by, created_at, updated_at, deleted_at
  CHECK: assignee_person_id HOẶC assignee_unit_id phải có ít nhất một
  Index: (parish_id, event_id), (parish_id, assignee_person_id, status), (parish_id, due_date)

parish_event_task_items          -- checklist con (ClickUp/Trello pattern)
  id, parish_id, task_id → parish_event_tasks,
  title (≤200), is_done, sort_order, timestamps, deleted_at

parish_event_assignments         -- Planning Center pattern: phân công vai trò staffing
  id, parish_id, event_id → parish_events,
  person_id → parish_people, unit_id (nullable, bộ phận phụ trách),
  role_title (≤100, vd "Trưởng ban hậu cần"),
  status: PENDING | ACCEPTED | DECLINED
  responded_at, response_note (≤500),
  created_by, timestamps, deleted_at
  UNIQUE (parish_id, event_id, person_id, role_title) khi active

parish_event_templates           -- template sự kiện lặp
  id, parish_id, name, category (tái dùng categoryEnum hiện có),
  payload JSON: [{title, offset_days (so với event date), assignee_unit_id?, items:[...]}],
  timestamps, deleted_at
```

**Ràng buộc bất biến:**
- Task gắn person phải qua `parish_people`, **không** gắn trực tiếp `users` (ADR-081: person là identity tổ chức; `linked_user_id` là cầu nối để gửi notification).
- Mọi bảng: composite PK `(parish_id, id)`, FK composite tenant-scoped, soft delete `deleted_at`, audit redacted cùng transaction (ADR-099).
- Cây đơn vị không được suy quyền: unit assignment không cấp quyền truy cập, chỉ là attribution.

### 3.2 RBAC (backend là authority; UI ẩn control là fail-closed UX)

| Hành động | admin | chunhiem | phuta | glv | phuhuynh |
| --- | --- | --- | --- | --- | --- |
| Xem event detail + tasks + assignments | ✅ | ✅ | ✅ | ✅ | ❌ (giữ nguyên như calendar hiện tại) |
| CRUD task/checklist/assignment/template | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cập nhật trạng thái **task của chính mình** (assigned) | ✅ | ✅ | ✅* | ✅* | ❌ |
| Phản hồi assignment (accept/decline) | ✅ | ✅ | ✅* | ✅* | ❌ |

\* Chỉ khi person tương ứng có `linked_user_id` trùng tài khoản gọi API. Server resolve `parish_people.linked_user_id = user.userId` làm điều kiện where — không tin client.

### 3.3 Notification (tái dùng ADR-102 queue)

- Khi phân công task/assignment → enqueue `target_user_ids` = linked user của assignee; person không linked → **không gửi, không lỗi** (ghi audit với `notify_skipped`).
- Reminder trước due date 3 ngày + trước event date 7 ngày (scheduler tenant-scoped theo ADR-106, pattern Sunday scheduler).
- Nội dung notification chỉ chứa: tên event, tên task, due date. **Không** chứa dữ liệu nhạy cảm học sinh/cha mẹ.
- Idempotency: reminder dùng marker composite `(key, parishId)` như Sunday scheduler — không ghi marker sent khi không recipient.

### 3.4 UX / Views

1. **Event Detail Modal/Page** (mở từ Calendar desktop + mobile): info + readiness progress bar (X/Y task + checklist %) + tab "Nhiệm vụ" & "Phân công".
2. **Kanban Board theo event** (desktop): cột = status, card có avatar assignee/unit badge, due date.
3. **My Tasks** (`/parish/my-tasks`): mọi task/assignment của tài khoản đang đăng nhập, gộp từ mọi event, sort theo due date — pattern "My Tasks" Asana.
4. **Templates**: khi tạo event category CAMP/RETREAT/… có thể chọn template → prefill task + checklist, due date = event date − offset_days.
5. Mobile: bottom sheet công thái học theo pattern `ExamSessionView`; chỉ read + update trạng thái task của mình + accept/decline.

### 3.5 Offline & sync (theo ADR-109 / PARISH-EVENT-CACHE-1)

- Giai đoạn 1: task/assignment **online-first** — mutation chỉ cập nhật store/cache sau server response (không tạo temp ID, không optimistic delete, không toast success giả) — đúng boundary hiện hành của `parishEventStore`.
- Giai đoạn sau (nếu field cần): đưa vào durable Dexie queue với acknowledgement trước khi hiển thị trạng thái local — phải qua ADR mới, không quảng bá offline writes khi chưa có receipt/idempotency.

---

## 4. Kế hoạch triển khai theo phase

| Phase | Nội dung | Deliverables | Rủi ro chính |
| --- | --- | --- | --- |
| **P0 — Decision & Docs** (0.5–1 ngày) | ADR mới (đề xuất ADR-110) chốt: data model, RBAC matrix, notification semantics, online-first boundary; cập nhật BUSINESS_RULES | ADR + business rules + plan này được phê duyệt | Không |
| **P1 — Core task CRUD** (3–5 ngày) | Migration + `parish_event_tasks` + `parish_event_task_items`; route/service `parishEventTasks`; Event Detail modal desktop + task list; audit cùng transaction | Server tests (RBAC, tenant, migration), client tests, API contract | Schema drift; checklist FK cascade |
| **P2 — Assignment + confirmation** (3–4 ngày) | `parish_event_assignments`; endpoint accept/decline resolve qua `linked_user_id`; enqueue notification; UI phân công theo person/unit | Tests: confirmation loop, unlinked-person skip, tenant isolation | Suy quyền từ unit; leak danh sách person |
| **P3 — Templates + reminders** (2–3 ngày) | `parish_event_templates` + prefill khi tạo event; scheduler reminder với marker idempotent | Scheduler tests (marker, tenant scope, opt-in) | Reminder double-send; background worker scope |
| **P4 — Views: Kanban + My Tasks + readiness** (3–4 ngày) | Board view, `/parish/my-tasks`, progress metrics, mobile parity | Component tests, design-system guard pass | Nested container; DS token violations |
| **P5 — E2E + hardening** (2 ngày) | Playwright workflow critical: tạo event → template → phân công → accept → hoàn thành task → readiness 100% | E2E green; `verify:ci` pass | Flaky selectors |

Tổng ước tính: **13–17 ngày làm việc**.

## 5. Verification plan

- **Bắt buộc (D2 gates):** targeted vitest cho route/service/store mới; `test:security-critical` (tenant isolation, RBAC matrix) vì chạm authorization + notification; `tsc -b`, `oxlint`, `lint:ds`, `lint:architecture-inventory`; migration test + update `schemaHealth`.
- **Contract:** cập nhật `docs/FRONTEND_API_CONTRACT.md` với endpoints mới trước khi implement client.
- **E2E (P5):** workflow đa lớp như trên; không hạ mức test đang fail.
- **Không chạy ritual:** bỏ qua benchmark OMR, backup audit — không liên quan.

## 6. Rủi ro còn mở / quyết định cần BGL (sản phẩm)

1. `phuta` có được manage task của unit mình không, hay chỉ admin/chunhiem như calendar hiện tại? *(Đề xuất: không — giữ parity với calendar, mở rộng sau khi có nhu cầu thực.)*
2. Task có cần dependency giữa các task (Asana/ClickUp) không? *(Đề xuất: không — over-engineering cho TNTT; checklist đủ dùng.)*
3. Phụ huynh có cần thấy event detail (read-only) không? *(Đề xuất: không, giữ nguyên behavior calendar hiện tại.)*
4. Reminder qua Telegram bắt buộc hay opt-in như Sunday scheduler? *(Đề xuất: opt-in mặc định false, thống nhất ADR-105/106.)*

## 7. Điều bất biến không được phá vỡ khi triển khai

- Server authorization là authority duy nhất; ẩn UI không phải boundary.
- Cross-parish fail-closed; mọi bảng mới có `parish_id` composite và được startup scan bao phủ.
- Không partial success ngầm: task tạo kèm checklist prefill từ template phải 1 transaction.
- Không tiết lộ dữ liệu nhạy cảm vào log/audit/notification.
- Audit luôn trong cùng transaction với domain mutation (ADR-099).
- Offline: không quảng bá durable offline write khi chưa có receipt/idempotency (ADR-109).
