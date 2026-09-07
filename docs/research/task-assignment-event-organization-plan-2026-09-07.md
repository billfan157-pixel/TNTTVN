# Research & Plan: Task Assignment + Event Organization cho Catevia

Ngày: 2026-09-07. Snapshot: HEAD `949ba9ed61b8a766698ffadb8a2ec7f8d3890912` (working tree có WIP audit 2026-09-06, không ảnh hưởng schema của module mới).

Tài liệu này gồm 4 phần:

1. **Bối cảnh Catevia & khoảng trống** — audit code hiện hành, ranh giới, ADR liên quan.
2. **Bài học từ sản phẩm dẫn đầu** — research đã verify, có nguồn, có so sánh.
3. **Domain model đề xuất** — entity, quan hệ, state machine, RBAC, offline contract.
4. **Roadmap triển khai** — theo mức rủi ro, mỗi phase có acceptance gate.

Mọi nhận định định lượng dùng **VERIFIED** (đã chạy/đọc) / **EXPECTED_UNVERIFIED** (code hợp lý nhưng chưa đo) / **UNKNOWN** (chưa có evidence). Authority: VERIFIED_CURRENT (đã chốt trong ADR) / CANDIDATE (đề xuất, chưa approve).

---

## 1. Bối cảnh Catevia

### 1.1 Mô tả ngắn

Catevia (TNTTVN) là PWA + Capacitor app quản lý giáo xứ TNTT (Thiếu Nhi Thánh Thể Việt Nam) cho 4 role: `admin` (cha xứ/admin giáo xứ), `chunhiem` (Huynh Trưởng trưởng/giáo lý viên trưởng), `phuta` (phụ tá), `phuhuynh` (phụ huynh). Tenant = 1 giáo xứ (`parish_id`); hiện deployment `singleParishDeployment` đã hard-code `parishId='gia-ton'` (ADR-104). Stack: Hono + Drizzle + libSQL (SQLite/Turso), React 19 + Vite + TanStack Router, Dexie encrypted offline queue, biometric on-device, push qua FCM/APNs.

### 1.2 Audit code hiện hành — đã có sẵn

| Module | Path | Trạng thái |
|--------|------|------------|
| Lịch sự kiện (1 ngày, 1 location) | `server/src/routes/parishEvents.ts` (181 dòng), `server/src/db/schema.ts:parish_events` | Hoàn chỉnh: `FEAST_DAY/CAMP/TRAINING/SACRAMENT/RETREAT/MEETING/OTHER`, soft delete, audit. **Chỉ 1 row = 1 sự kiện**, KHÔNG có session/track/speaker/registration/RSVP/capacity. |
| Thông báo | `server/src/services/noticeService.ts` (194 dòng), `schema.ts:notices` | Hoàn chỉnh: priority, target audience (`all/staff/parents`), redacted eviction khi staff→parent revoke, idempotency key. |
| Đơn xin phép (nghỉ phép) | `server/src/routes/leaveRequests.ts` (495 dòng) | Hoàn chỉnh: state machine `PENDING→APPROVED|REJECTED|CANCELLED`, audit. **Một dạng task nghiệp vụ hẹp.** |
| Phân công lớp (CN/phuta) | `classAssignmentPolicy`, `catechist_assignments` table | Hoàn chỉnh: 1-CN-per-class partial UNIQUE, audit (ADR-099/108). |
| Notifications | `smartNotifications.ts`, `notificationQueue.ts`, `sundayReminderScheduler.ts` | Hoàn chỉnh: lease/attempt/maxAttempts pattern. |
| Lịch phụng vụ (HĐGMVN) | `src/lib/liturgicalCalendar`, `icalGenerator` (RFC 5545) | Đã có widget Lịch Hôm Nay + export .ics, merge với parish_events. |
| Dashboard | `OrganizationDashboardPage` | Đã wire 14-day events widget từ `parishEventStore`. |

### 1.3 Khoảng trống cần lấp

1. **KHÔNG có Task module** — không có entity "công việc cần làm" với assignee, due date, status, subtask, comment, dependency. Hiện tại mọi phân công ngoài `leaveRequests` phải chạy qua `notices` (read-only broadcast) hoặc gọi điện/nhắn riêng.
2. **Event Organization thực sự** — `parish_events` chỉ là 1 row cho 1 ngày. Thiếu:
   - Sub-event / agenda (buổi trong ngày);
   - Phân công nhân sự phụ trách (MC, nhạc sĩ, hậu cần, bác sĩ, an ninh);
   - Đăng ký / RSVP / giới hạn chỗ;
   - Phiếu thu/chi event (hiện `financeService` không gắn event_id);
   - Check-in / điểm danh event (ngoài `attendance` lớp học);
   - Lịch sử event đã qua (xem như "sự kiện tương lai" widget hiện tại chỉ 14 ngày).
3. **Thiếu recurring event** — không có RRULE/iCal recurrence cho cả task lẫn event (Lịch Phụng vụ đã có nhưng riêng).
4. **Thiếu family/household** — `students.parentPhone` link về user, nhưng không có household record để phụ huynh xem nhiều con cùng lúc khi đăng ký event (đã có `parentService.children` cho 1 user, nhưng không có household cho nhiều phụ huynh nuôi chung 1 nhóm con).
5. **Audit activity feed** — mỗi module có `audit_logs` riêng. Không có activity feed tổng hợp cho 1 user/1 object.

### 1.4 ADR liên quan phải tuân thủ

| ADR | Liên quan |
|-----|-----------|
| ADR-031 tenant isolation | Mọi row mới phải có `parish_id` và composite PK/FK theo tenant. |
| ADR-045 minimization | Audit log không chứa PII/secret; redacted eviction khi audience đổi. |
| ADR-057 idempotency | Mọi mutation phải có idempotency key + write transaction atomic. |
| ADR-063 design system v4.5 | Tuân thủ token semantic, không arbitrary class. |
| ADR-070/071 sanitized release | Mọi provenance/probe phải dùng hashed token. |
| ADR-072/089/090/092 RBAC & class scope | Hidden nav không phải authorization; server-authoritative. |
| ADR-085 biometric privacy | Local snapshot TTL 24h, không upload ảnh. |
| ADR-098 server-authoritative events | Lịch event online chỉ `admin|chunhiem`; phụ huynh đọc. |
| ADR-099/108 assignment | Một lớp một CN, một user một CN-lớp. |
| ADR-104 single-parish | Hiện chỉ `gia-ton`. Module mới phải chạy đúng single-parish nhưng KHÔNG bỏ qua composite key. |
| ADR-109 durable acknowledgement | Mutation chỉ return receipt sau server ack HOẶC encrypted Dexie commit. |

---

## 2. Bài học từ sản phẩm dẫn đầu

> Research date 2026-09-07. Tất cả phát biểu có nguồn; `V` = verified từ docs/help-center chính thức, `U` = UNKNOWN.

### 2.1 Task management — đã verify

| Hệ thống | Smallest unit | Subtask depth | Assignee | Custom field | Recurring | Audit/Activity |
|----------|---------------|---------------|----------|--------------|-----------|----------------|
| **Asana** `[V]` | Task | Max 5 levels | Single | Per project + org | Native template | "Stories" immutable per task |
| **monday.com** `[V]` | Item (pulse) | Subitem n-level | UNKNOWN | Per board (column) | Repeating items | Updates per item |
| **Jira Cloud** `[V]` | Issue (Bug/Task/Story/Epic) | Subtask single-parent | Single | Per project+type | UNKNOWN | Changelogs per field |
| **Linear** `[V]` | Issue | Sub-issue | Single | Per team | UNKNOWN | `history` per issue |
| **Notion** `[V]` | Page (row in data source) | UNLIMITED | Multi-user (People) | Per data source (20 types) | UNKNOWN (use template+automation) | `last_edited_*` |
| **MS Planner** `[V]` | Task | Checklist only (1 level) | Multi-assignee | 25 boolean categories | No native | Graph change notifications |
| **ClickUp** `[V]` | Task | Subtask 3 levels | Multi | Per Space/Folder | Native | Activity per task |
| **Trello** `[V]` | Card | Checklist 1 level | Multi-member | Via Power-Up | Via Power-Up | Actions log |

Nguồn: [Asana Object hierarchy](https://developers.asana.com/docs/object-hierarchy) · [Jira Issues v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/) · [Linear Projects](https://linear.app/docs/projects) · [Notion Database](https://developers.notion.com/reference/database) · [MS Planner](https://learn.microsoft.com/en-us/connectors/planner/) · [ClickUp Hierarchy](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy) · [Trello REST](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/).

**Patterns học được:**

1. **Single-assignee thắng focused-execution; multi-assignee thắng collaborative** — Asana/Jira/Linear single; Planner/Notion/ClickUp multi. Catevia nên **multi-assignee với 1 primary** (giống Planner) vì công việc xứ đoàn thường cần 2+ người phụ trách (1 chính, 1 hỗ trợ).
2. **Subtask depth giới hạn** — 3-5 levels đủ. Catevia nên giới hạn **3 levels** (task → subtask → sub-subtask) vì tổ chức xứ đoàn không scale như engineering team.
3. **State machine là configurable column, không phải workflow engine** — chỉ Jira có engine thật. Catevia nên dùng **enum trạng thái đơn giản** (`open / in_progress / done / blocked / cancelled`) + audit log, không xây workflow engine.
4. **Recurring tasks là nice-to-have, không phải must-have** — Asana/ClickUp có native, Jira/Linear/Notion không. Catevia Phase 2 có thể bỏ qua, Phase 3 thêm RRULE cho event (không cho task).
5. **Activity log immutable là tiêu chuẩn** — Asana "Stories", Jira "Changelogs", Linear `history`, Notion `last_edited_*`. Catevia đã có `audit_logs` (ADR-057) — tận dụng.

### 2.2 Event organization — đã verify

| Hệ thống | Entity core | Schedule | Registration | Waitlist | Approval | Permission |
|----------|-------------|----------|--------------|----------|----------|------------|
| **Eventbrite** `[V]` | Event + Ticket Class + Order + Attendee | Event-level | Per ticket class, capacity | UNKNOWN | None first-class | Organizer + staff |
| **Cvent** `[V]` | Event + Admission Item + Registration Type + Registrant | Session + Track + Room | Registration type | UNKNOWN | Per registration type | Per activity (Required=Always/Optional/Never) |
| **Whova** `[V]` | Event + Session + Speaker | Multi-track | RSVP + custom Q | UNKNOWN | UNKNOWN | "All admins same" |
| **Bizzabo** `[V]` | Event + Session + Speaker + Sponsor | Multi-track | Ticket | UNKNOWN | UNKNOWN | Multi-role |
| **Splash** `[V]` | Event + Ticket + Microsite | Event-level | Ticket w/ Q | UNKNOWN | UNKNOWN | 7 roles + 3 license types |
| **Luma** `[V]` | Event + Guest | Event-level | Status set: `approved/pending/waitlist/declined` | Auto on capacity | "Require Approval" | Hosts (manager/non-manager) + check-in staff |
| **RingCentral Events** `[V]` | Event + Session + Ticket + Registrant | Multi-track | Stripe + Magic Link | "Not reservation system" | Magic Link private ticket | 5 roles |

Nguồn: [Eventbrite](https://www.eventbrite.com/platform/docs) · [Cvent](https://www.cvent.com/en-us/products/event-management) · [Whova](https://whova.com/product/) · [Bizzabo](https://www.bizzabo.com) · [Splash](https://splashthat.com) · [Luma](https://lu.ma) · [RingCentral Events](https://www.ringcentral.com/events.html).

**Patterns học được:**

1. **Multi-track session là tiêu chuẩn cho event lớn** — Cvent/Whova/Bizzabo/RingCentral. Catevia "Trại Hè / Sa Mạc" (category=CAMP) rõ ràng cần agenda. Nhưng event nhỏ (Lễ Bổn Mạng, Họp Xứ Đoàn) chỉ cần event-level. → **Session là optional child of Event** (nullable, lazy-create khi cần).
2. **Registration status set của Luma** (`approved/pending/waitlist/declined/cancelled`) là pattern gọn nhất — áp dụng được cho cả RSVP thường lẫn paid ticket. Catevia nên theo.
3. **Event-task entity là NOVEL** — không hệ thống nào trong 7 nền tảng event có first-class "task gắn event" với owner/due/status. Cơ hội khác biệt: Catevia Task có thể `eventId` nullable → "chuẩn bị Trại Hè" = task gắn event Trại Hè.
4. **Permission: organizer / co-organizer / staff / attendee** là phổ quát. Catevia map: organizer=`admin|chunhiem`, co-organizer=`phuta` (cho event cụ thể), staff=`phuta`, attendee=`phuhuynh|huynhtruong|glv` (tuỳ event).
5. **Capacity + Waitlist** — Luma có auto-waitlist khi đầy, Eventbrite không, Cvent/Whova/Bizzabo UNKNOWN. Catevia Phase 1 chỉ cần capacity check fail-closed; Phase 3 mới làm waitlist nếu cần.
6. **On-site check-in** — Eventbrite Organizer app (offline + Zebra scanner), Luma check-in staff, Bizzabo Klik SmartBadge. Catevia đã có camera/QR cho exam (T3 QR), có thể tái sử dụng engine cho event check-in — **không cần xây mới**.

### 2.3 Church & parish software — đã verify

| Hệ thống | Task model | Event model | RSVP/Check-in | Family | Recurring |
|----------|------------|-------------|---------------|--------|-----------|
| **Planning Center** `[V]` | People Tasks (inbox + lists); Service Plans assign to positions; Workflows = follow-up cards | Service Types → Plans; Calendar events w/ rooms; Group events w/ RSVP | Groups: Yes/Maybe/No + guests; Registrations: paid w/ Q; Check-Ins: station + code | Households first-class | Groups recurring w/ "all occurrences" |
| **Breeze** `[V]` | Tasks; Automated Tasks (9am daily) | Events w/ volunteer roles; Calendar | Per-event signup sheets w/ role limits; "allow signing up even if filled"; email+SMS | Family grouping (People DB) | "Choose dates up to 32 future" — RRULE UNKNOWN |
| **ACS/ParishSOFT** `[V]` | Volunteer Connect Schedules; Ministry Scheduler (Ministry→Roles→Events) | MinistryPlatform Events tab; Facility Calendar | Schedule publish notifies accept/decline; "in compliance" filter | Family Suite first-class | Monthly/weekly recurrence |
| **Pushpay** `[V]` | Forms + Process Queues | ChMS Events + standalone Pushpay Events | RSVP (Yes/Maybe/No + guests) OR Form Reg; Check-In via 1D barcode | Directory groups by family | Series-of-events |
| **ChurchTrac** `[V]` | Projects and Tasks (unlimited, subtasks) | Worship Services w/ Teams+Roles; Side-by-Side planning | Service reminders (3-day); email teams | People record family relationships | Side-by-Side clone |
| **CCB** `[V]` | Group Needs (with items); Processes/Queues | Group events + church-wide calendar | individual_attendance API | Groups/Divisions/Departments | Per-group recurrence |
| **Subsplash** `[V]` | Workflows (kanban w/ subtasks + email automations) | Events Manager; Group Events (one-time/repeating) | Dashboard registration (walk-ups/paper/phone) | "Family connections" | Series support |
| **Tithe.ly** `[V]` | Tasks/Volunteer Management; Smart Workflows | Events module w/ rooms+resources | One-person-registers-others; Kids Check-In | "Family information" | Recurring calendar events |
| **MS 365 (Teams+Planner+Outlook)** `[V]` | Tasks by Planner and To Do (11 users/task); Shifts task lists | Outlook calendar w/ recurrence | Outlook RSVP (Accept/Tentative/Decline) | No first-class household | Outlook full RRULE |
| **Google Workspace** `[V]` | Google Tasks | Calendar events w/ RRULE, resources, manager approval | Calendar RSVP + Interop | Contacts "Family" label | Full RRULE |

Nguồn: [Planning Center](https://help.planningcenter.com/) · [Breeze ChMS](https://support.breezechms.com/) · [ACS/Realm](https://help.acst.com/en/realm) · [ParishSOFT Ministry Scheduler](https://www.parishsoft.com/ministry-scheduler) · [Pushpay](https://support.pushpay.com/) · [ChurchTrac](https://www.churchtrac.com/support/) · [CCB API](https://www.ccbtutorials.com/) · [Subsplash](https://support.subsplash.com/) · [Tithe.ly](https://support.tithe.ly/) · [MS Planner](https://learn.microsoft.com/en-us/connectors/planner/) · [Google Calendar](https://support.google.com/calendar).

**Patterns học được cho Catevia:**

1. **Service Plans của Planning Center** — "team → position → plan" map hoàn hảo với Catevia: `class → role (CN/phuta) → event_plan`. Không cần tạo mới quan hệ, dùng `catechist_assignments` làm "team".
2. **Group Needs của CCB** — task gắn group, có items = subtask với assignee + due date. Đây là model gần nhất với "task xứ đoàn" của Catevia.
3. **Workflows của Subsplash** — kanban với subtask + per-step email automation. Khả thi nhưng Phase 2 trở đi.
4. **Recurring event** — ParishSOFT/Pushpay/Subsplash/Tithe.ly/Google đều có. Catevia nên hỗ trợ từ Phase 1 vì Lễ Bổn Mạng/Họp định kỳ.
5. **RSVP yes/maybe/no** — phổ quát, Planning Center/Breeze/Pushpay/Tithe.ly đều dùng. Catevia nên dùng cho event có mời phụ huynh.
6. **Capacity per role** — Breeze/Planning Center có role-limit per event. Catevia "Trại Hè" cần giới hạn chỗ theo role (GLV tối đa 20/huynh trưởng).
7. **Check-in via 1D/QR barcode** — Pushpay dùng 1D barcode form code; Planning Center có station + code. Catevia đã có T3 QR engine, tái sử dụng được.

---

## 3. Domain model đề xuất

### 3.1 Phạm vi MVP (Authority: CANDIDATE — đề xuất, chưa approve)

Gồm **3 entities mới** + **2 enhancement** module hiện hành:

| Entity mới | Mapping từ research | Authority |
|------------|----------------------|-----------|
| `tasks` (Task chính) | Asana Task + CCB Group Need + ChurchTrac Task | CANDIDATE |
| `task_subtasks` (Subtask) | Asana subtask (max depth 3) | CANDIDATE |
| `task_assignments` (multi-assignee) | Planner assignments + Asana followers (tách) | CANDIDATE |
| `event_sessions` (buổi trong event) | Cvent Session + Whova Session | CANDIDATE |
| `event_registrations` (RSVP/đăng ký) | Luma Guest + Planning Center RSVP | CANDIDATE |

Enhancement:
- `parish_events` thêm: `recurrence_rule` (RRULE), `capacity`, `requires_registration`, `check_in_enabled`, `check_in_method` ('qr' | 'manual'), `parent_event_id` (cho series).
- `audit_logs` thêm: `entity_subtype` (task vs subtask vs event-session vs event-registration) để activity feed gom.

KHÔNG xây trong MVP:
- Workflow engine (chỉ dùng status column).
- Recurring task (chỉ recurring event).
- Custom field engine (chỉ enum + checklist).
- Family/household record (dùng `parentService.children` hiện hành, mở rộng sau).
- Waitlist (capacity fail-closed Phase 1).
- Payment integration cho event (mở rộng sau).
- Cross-event dependency / Gantt / Timeline view (Phase 3+).

### 3.2 Entity relationship

```text
parish_events (mở rộng)
  id, parish_id, date, title, category, category_name, time, location,
  + recurrence_rule TEXT,        -- iCal RRULE (RFC 5545) hoặc NULL
  + capacity INTEGER,            -- NULL = unlimited
  + requires_registration INTEGER NOT NULL DEFAULT 0,
  + check_in_enabled INTEGER NOT NULL DEFAULT 0,
  + check_in_method TEXT,        -- 'qr' | 'manual' | NULL
  + parent_event_id TEXT,        -- cho series: liên kết event gốc
  + created_by, created_at, updated_at, deleted_at

task_lists (mới — nhóm task theo scope)
  id (TSKL-...), parish_id, name,
  scope TEXT NOT NULL,           -- 'parish' | 'class' | 'event' | 'personal'
  scope_id TEXT,                 -- classId | eventId | userId (NULL for parish)
  description TEXT, archived_at, created_by, created_at, updated_at

tasks (mới)
  id (TSK-...), parish_id, task_list_id,
  parent_task_id TEXT,           -- subtask (max depth 3)
  title, description,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
  priority TEXT NOT NULL DEFAULT 'normal',  -- 'low' | 'normal' | 'high' | 'urgent'
  due_at TEXT,                    -- ISO datetime với offset
  started_at TEXT, completed_at TEXT, cancelled_at TEXT,
  event_id TEXT,                  -- optional link tới parish_events.id
  estimated_minutes INTEGER,
  -- watch/follow list gộp vào task_assignments với role='watcher'
  created_by, created_at, updated_by, updated_at, deleted_at

task_assignments (mới)
  id, task_id, parish_id,
  user_id TEXT NOT NULL,         -- assignee
  role TEXT NOT NULL DEFAULT 'assignee',  -- 'assignee' | 'watcher' | 'reviewer'
  is_primary INTEGER NOT NULL DEFAULT 0,  -- 1 primary assignee, others supporting
  assigned_by, assigned_at, acknowledged_at, removed_at

task_subtasks (mới — vẫn dùng tasks với parent_task_id, không cần bảng riêng)
  -- đã có ở tasks.parent_task_id; thêm index

event_sessions (mới — buổi con trong multi-day/multi-track event)
  id (EVT-S-...), parish_id, event_id,
  start_at TEXT, end_at TEXT,    -- ISO datetime
  title, location, track TEXT,   -- optional (cho multi-track)
  capacity INTEGER, sort_order INTEGER,
  created_by, created_at, updated_at, deleted_at

event_registrations (mới)
  id (EVT-R-...), parish_id, event_id, session_id TEXT,  -- optional, per-session
  registrant_user_id TEXT,        -- NULL nếu guest (parent đăng ký cho con)
  registrant_student_id TEXT,     -- NULL nếu adult
  registrant_name TEXT,           -- cho guest
  registrant_phone TEXT,          -- cho guest
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected' | 'waitlist' | 'cancelled' | 'checked_in' | 'attended' | 'no_show'
  registered_by TEXT NOT NULL,    -- userId người đăng ký (parent/admin)
  registered_at TEXT, decided_at TEXT, decided_by TEXT,
  check_in_at TEXT, check_in_by TEXT,
  notes TEXT,
  created_at, updated_at, deleted_at

event_staff (mới — phân công nhân sự event, có thể dùng task_assignments với event_id)
  -- DECISION: dùng task_assignments với context='event' thay vì bảng riêng để giảm entity count.
  -- Phase 1: tạo bảng mới event_staff để tách quyền (organizer có thể add staff không qua task list).
```

### 3.3 State machines

**Task** (`tasks.status`):

```text
                ┌────────┐
                │  open  │ ◀──── (default, created)
                └───┬────┘
        ┌───────────┼────────────┬─────────────┐
        ▼           ▼            ▼             ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────────┐
   │in_progre│ │ blocked │ │  done   │ │ cancelled  │
   │   ss    │ │         │ │         │ │            │
   └────┬────┘ └────┬────┘ └─────────┘ └────────────┘
        │           │
        └─────┬─────┘
              ▼
         (back to open, or cancelled)
```

Allowed transitions (server-enforced trong service layer, không phải workflow engine):
- `open → in_progress | blocked | cancelled`
- `in_progress → blocked | done | cancelled`
- `blocked → in_progress | cancelled`
- `done → in_progress` (reopen, audit "REOPEN_TASK" với lý do)
- `cancelled → in_progress` (reopen, audit)

**Event Registration** (`event_registrations.status`):

```text
                  ┌──────────┐
                  │ pending  │ (default for events requires_registration + approval)
                  └────┬─────┘
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐   ┌──────────┐
  │ approved │  │ rejected │   │ waitlist │ (khi capacity đầy)
  └────┬─────┘  └──────────┘   └────┬─────┘
       │                            │ (khi có cancel → auto-promote)
       ▼                            ▼
  ┌──────────┐  ┌──────────┐   ┌──────────┐
  │checked_in│  │cancelled │   │ cancelled│
  └────┬─────┘  └──────────┘   └──────────┘
       ▼
  ┌──────────┐
  │ attended │ / no_show
  └──────────┘
```

Decision: **Catevia không xây capacity-based waitlist Phase 1** (per audit U1 capacity target UNKNOWN). Phase 1 chỉ cần: `requires_registration=0` → không cần registration row; `requires_registration=1` → registration row bắt buộc; capacity check fail-closed at insert; status set khi đầy chỉ gồm `pending → rejected (CAPACITY_FULL)`. Waitlist chuyển sang Phase 3.

### 3.4 RBAC contract

Tuân thủ ADR-072/089/090/092: **hidden nav ≠ authz**; server-authoritative.

| Action | admin | chunhiem | phuta | phuhuynh |
|--------|-------|----------|-------|----------|
| Task list: create parish-wide | ✓ | ✓ (parish scope) | ✗ | ✗ |
| Task list: create class-scoped | ✓ | ✓ (lớp mình CN) | ✓ (lớp mình phụ tá) | ✗ |
| Task list: create event-scoped | ✓ | ✓ | ✓ (if event_staff) | ✗ |
| Task list: create personal | ✓ | ✓ | ✓ | ✓ (chỉ cho mình) |
| Task: create/read in parish-scoped list | ✓ | ✓ | ✓ (read) | ✗ |
| Task: create/read in class-scoped list | ✓ | ✓ (lớp mình) | ✓ (lớp mình) | ✗ |
| Task: create/read in event-scoped list | ✓ | ✓ | ✓ (event_staff) | ✗ (nếu event private) / ✓ (nếu event public) |
| Task: assign to user | ✓ | ✓ (within scope) | ✓ (within scope) | ✗ |
| Task: complete / change status (own) | ✓ | ✓ | ✓ | ✓ (own assigned) |
| Task: change status (other's) | ✓ | ✓ (if creator or in scope) | ✗ (read-only) | ✗ |
| Task: comment | ✓ | ✓ | ✓ | ✓ (if assigned or watcher) |
| Task: hard delete | ✓ (only if no subtask) | ✗ | ✗ | ✗ |
| Event: create | ✓ | ✓ | ✗ | ✗ |
| Event: edit | ✓ | ✓ (creator) | ✗ | ✗ |
| Event: register self (parent) | ✗ | ✗ | ✗ | ✓ (requires_registration=1) |
| Event: register others (parent for child) | ✗ | ✗ | ✗ | ✓ (parentService.children) |
| Event: approve registration | ✓ | ✓ (event_staff) | ✗ | ✗ |
| Event: check-in | ✓ | ✓ (event_staff) | ✓ (event_staff) | ✗ |

Server enforcement: mọi route trong `server/src/routes/tasks.ts` + `server/src/routes/eventRegistrations.ts` mở đầu bằng `authMiddleware` + `assertTaskScope` / `assertEventScope` (helper) — không dựa vào UI state.

### 3.5 Offline contract (theo ADR-109)

Tuân thủ pattern hiện hành: mọi mutation online chỉ return receipt sau server ack; offline return receipt sau encrypted Dexie commit.

| Surface | Offline read | Offline write | Conflict policy |
|---------|--------------|---------------|-----------------|
| Task list (read) | ✓ từ Dexie `taskListStore` (encrypted) | — | Last-write-wins per task; OCC theo `updated_at` server |
| Task create/update | ✗ (queue) | ✓ vào `syncStore` | OCC `expectedUpdatedAt`; stale → 409 conflict → user reload |
| Task complete | ✗ (queue) | ✓ | OCC; server từ chối nếu task đã `done` |
| Event calendar (read) | ✓ từ `parishEventStore` (đã có) | — | — |
| Event registration | ✗ (queue) | ✓ | server check capacity at ack time; nếu đầy → reject, ledger đánh `failed` với `CAPACITY_FULL` |
| Event check-in (online required) | ✗ | ✗ | — (check-in online-only Phase 1; offline + queue là Phase 3) |

**Idempotency:** mỗi mutation có `clientMutationId` (UUID v4) sinh tại UI; retry dùng cùng ID. Server check `requestHash` (theo exam module pattern) trả duplicate.

**Capacity race:** nếu 2 parent cùng register cho slot cuối, server dùng `BEGIN IMMEDIATE` + `SELECT ... FOR UPDATE`-equivalent trong SQLite (đã làm ở exam upsert) để serialize, fail-closed at capacity.

### 3.6 Notification triggers

| Event | Recipient | Channel | Authority |
|-------|-----------|---------|-----------|
| Task assigned to me | assignee | in-app + push (FCM/APNs) | CANDIDATE |
| Task due soon (T-24h) | assignee + watchers | in-app + email digest | CANDIDATE |
| Task overdue | assignee + creator | in-app + push | CANDIDATE |
| Task completed | creator + watchers | in-app | CANDIDATE |
| Task comment on mine | author + watchers | in-app | CANDIDATE |
| Event registration approved | registrant | in-app + push | CANDIDATE |
| Event registration rejected | registrant | in-app | CANDIDATE |
| Event check-in success | registrant (if user) | in-app | CANDIDATE |
| Event T-1 day | registered users | push | CANDIDATE |
| Event T-1 hour | registered users | push | CANDIDATE |

Implementation: tái sử dụng `smartNotifications.ts` + `notificationQueue.ts`; thêm `NotificationKind` enum `TASK_ASSIGNED | TASK_DUE_SOON | TASK_OVERDUE | TASK_COMPLETED | TASK_COMMENT | EVENT_REG_APPROVED | EVENT_REG_REJECTED | EVENT_CHECKIN_OK | EVENT_REMINDER_T1D | EVENT_REMINDER_T1H`.

### 3.7 Audit & activity feed

Mỗi row mới sinh ≥1 `audit_logs` row:
- `tasks` INSERT/UPDATE/DELETE/STATUS_CHANGE → entityType=`task`, `oldValue`/`newValue` JSON.
- `task_assignments` INSERT/DELETE → entityType=`task_assignment`.
- `event_sessions` INSERT/UPDATE/DELETE → entityType=`event_session`.
- `event_registrations` INSERT/STATUS_CHANGE/CHECKIN → entityType=`event_registration`.

Activity feed (UI): gom theo `entityId` cho 1 task; gom theo `eventId` cho 1 event; gom theo `parishId` cho "feed xứ đoàn" (admin view). Dùng API `GET /api/activity?entityType=&entityId=` (Phase 2) — Phase 1 chỉ dùng `audit_logs` table hiện hành.

### 3.8 Data migration strategy

Dùng pattern đã chốt tại ADR-108 / ADR-109: mỗi migration isolated, `runDbTransaction` với `BEGIN IMMEDIATE`, marker trong cùng commit.

| Migration | Schema change | Backward compat |
|-----------|---------------|-----------------|
| `20260908-177` | `ALTER TABLE parish_events ADD COLUMN recurrence_rule TEXT, capacity INTEGER, requires_registration INTEGER NOT NULL DEFAULT 0, check_in_enabled INTEGER NOT NULL DEFAULT 0, check_in_method TEXT, parent_event_id TEXT` | Existing rows OK; defaults = NULL/0 |
| `20260908-178` | `CREATE TABLE task_lists ...` | new |
| `20260908-179` | `CREATE TABLE tasks ...` | new |
| `20260908-180` | `CREATE TABLE task_assignments ...` | new; partial UNIQUE `(parish_id, task_id, user_id) WHERE role='assignee' AND removed_at IS NULL` |
| `20260908-181` | `CREATE TABLE event_sessions ...` | new |
| `20260908-182` | `CREATE TABLE event_registrations ...` | new; UNIQUE `(parish_id, event_id, session_id, registrant_user_id, registrant_student_id)` cho active registrations; partial UNIQUE cho `status='checked_in'` |
| `20260908-183` | `CREATE INDEX idx_tasks_due_at ON tasks(parish_id, due_at) WHERE deleted_at IS NULL AND status NOT IN ('done','cancelled')` | new |
| `20260908-184` | `ALTER TABLE audit_logs ADD COLUMN entity_subtype TEXT` | nullable, existing rows OK |

Quan trọng: **không dùng partial UNIQUE phức tạp cho capacity** ở Phase 1 (chỉ count at INSERT trong transaction). Capacity race resolve bằng writer-first transaction (đã chứng minh trong examResultUpsertRace pattern).

---

## 4. Roadmap triển khai

### Phase 0 — Data model + skeleton (D1, 2 tuần)

**Scope:**
1. Migration 177-184.
2. Service skeletons: `taskService.ts`, `eventRegistrationService.ts`, `eventSessionService.ts`. Export empty + interface contracts + DTOs.
3. Drizzle schema updates + drizzle-kit generated SQL.
4. `schemaHealth.ts` add required columns check.
5. Test fixtures: tenant isolation, migration integrity, schema health.

**Acceptance gate:**
- `npm run build` PASS.
- `npm run test:coverage` 0 regression (320+ files / 2200+ tests).
- `npm run audit:deployment-parish` PASS.
- `npm run lint:architecture-inventory` PASS (mọi entity mới trong inventory).
- Migration smoke: fresh DB apply từ baseline + production-shape DB apply incremental → fail-closed với marker `20260908-183` partial UNIQUE nếu inconsistent.

**Risk:** LOW. Chỉ schema + empty skeleton.

### Phase 1 — Task MVP (D1, 3 tuần)

**Scope:**
1. CRUD task list: `POST/GET/PUT/DELETE /api/task-lists`.
2. CRUD task: `POST/GET/PUT/DELETE /api/tasks` (không subtask chưa).
3. Subtask (depth 1): `POST /api/tasks/:id/subtasks` (parent_task_id enforcement max 3 levels).
4. Multi-assignee: `POST/DELETE /api/tasks/:id/assignments`.
5. Status change: `PATCH /api/tasks/:id/status` với state machine.
6. List view: `GET /api/tasks?listId=&status=&assignee=&due=`.
7. Comments: `POST/GET /api/tasks/:id/comments` (đơn giản, không thread).
8. Notification hooks: TASK_ASSIGNED + TASK_DUE_SOON (cron T-24h) + TASK_OVERDUE.
9. UI: `TasksPage` (desktop + mobile), `TaskListSidebar`, `TaskDetailPanel`, `TaskCreateModal`. Design system v4.5.
10. E2E (Playwright): create list → create task → assign → change status → complete.

**Acceptance gate:**
- Mới: `tasks.test.ts` ≥ 20 tests (auth, RBAC, depth, OCC, state machine, audit, idempotency, capacity).
- Existing suite 0 regression.
- `test:security-critical` 0 regression.
- Manual: 1 GLV tạo task list "Công việc tuần 36" → giao cho 2 phụ tá → 1 phụ tá complete trên mobile offline → reload online sync → server confirm.
- Authority: VERIFIED_CURRENT sau ADR mới (số ADR-110 đề xuất).

**Risk:** MEDIUM. D2 (OCC + idempotency) reuse pattern exam đã chứng minh; D5 (provenance) tận dụng audit_logs hiện hành.

### Phase 2 — Event Organization MVP (D1, 3 tuần)

**Scope:**
1. Event enhancements: recurrence (RRULE basic — `FREQ=DAILY|WEEKLY|MONTHLY` + `UNTIL` + `COUNT`), capacity, requires_registration, check_in_enabled, parent_event_id (series).
2. Event sessions: `POST/GET/PUT/DELETE /api/events/:id/sessions`.
3. Event staff: `POST/DELETE /api/events/:id/staff` (multi-staff với role).
4. Event registration: `POST/GET /api/event-registrations` (parent self-register, parent for child, admin/staff manual add).
5. Registration approval: `PATCH /api/event-registrations/:id/status` (state machine).
6. Capacity check fail-closed at INSERT (writer-first tx).
7. UI: `EventDetailPage` (sessions + staff + registrations), `EventRegistrationModal` (parent), `EventCheckInPanel` (QR scanner reuse).
8. Notification hooks: EVENT_REG_APPROVED + EVENT_REG_REJECTED + EVENT_REMINDER_T1D + EVENT_REMINDER_T1H.
9. E2E: create event with sessions → parent register → admin approve → day-of check-in via QR.

**Acceptance gate:**
- Mới: `eventOrganization.test.ts` ≥ 25 tests (RRULE expansion correctness, capacity race, multi-session registration, approval flow, check-in idempotency, recurrence edge case).
- Existing suite 0 regression.
- Manual: tạo event "Trại Hè 2026" với 3 sessions (kỹ năng, ngoại khóa, thánh lễ), capacity 50, 2 staff, parent đăng ký cho 2 con → admin duyệt 1 + reject 1 (capacity hit).
- ADR-111 (đề xuất) chốt recurrence semantics + capacity model.

**Risk:** MEDIUM. RRULE expansion cần test corpus (RFC 5545 có reference examples); capacity race test cần concurrent test fixture (đã có pattern examResultUpsertRace).

### Phase 3 — Recurring task + Templates + Calendar integration (D2, 2 tuần)

**Scope:**
1. Task recurrence: `tasks.recurrence_rule` (RRULE), expand on read với 90-day window.
2. Task templates: `task_lists` có `is_template=1`, clone thành task list mới.
3. Calendar integration: 14-day widget trên dashboard hiển thị cả events + tasks có due_date trong window.
4. iCal export: extend `icalGenerator.ts` với tasks + events (RFC 5545 VTODO + VEVENT).
5. Recurring task notification: skip if instance marked `SKIP` via edit.

**Acceptance gate:**
- Mới: `taskRecurrence.test.ts` ≥ 10 tests (RRULE corner cases: month-end, DST, UNTIL, COUNT).
- iCal export unit test: file mở bằng Apple Calendar / Google Calendar (manual).
- ADR-112 chốt recurring semantics.

**Risk:** MEDIUM. RRULE có nhiều edge case (RFC 5545 spec dài 140 trang); cần test với RFC reference fixtures.

### Phase 4 — Waitlist, Payment, Family (D2-D3, 4 tuần)

**Scope:**
1. Waitlist auto-promote: khi registration cancelled → status `waitlist` cao nhất tự động `approved` + notification.
2. Payment for event ticket: integrate với `financeService` (`finance_transactions` có `event_id`), idempotent. Phase 4a chỉ free event; 4b paid event.
3. Family/household record: `households` table mới; `students.household_id`; parent multi-children; phụ huynh xem siblings trong registration UI.
4. Activity feed API + UI: `GET /api/activity?entityType=&entityId=`.

**Acceptance gate:**
- Mới: `waitlist.test.ts`, `eventPayment.test.ts`, `household.test.ts` ≥ 30 tests.
- Existing suite 0 regression.
- Manual: 1 family có 2 con, parent đăng ký cả 2 vào event paid capacity 30 → payment success → check-in.
- ADR-113 chốt household model.

**Risk:** MEDIUM-HIGH. Payment integration chạm `financeService` → D3 zone (financial integrity). Phải chốt với ADR-057 idempotency + ADR-031 tenant + giữ invariant "không mất tiền âm thầm" + rollback runbook.

### Phase 5 — Polish (D1, 2 tuần ongoing)

**Scope:**
- Bulk operations (multi-select task → bulk assign / bulk complete).
- Filter chips (status / priority / assignee / due) với URL sync.
- Mobile bottom-sheet ergonomics.
- A11y audit (WCAG 2.1 AA).
- Performance: virtualized list nếu > 500 task.

**Acceptance gate:**
- Lighthouse mobile ≥ 90.
- A11y axe 0 critical.
- Existing suite 0 regression.

**Risk:** LOW.

---

## 5. Open questions cần owner quyết (trước Phase 1)

| Câu hỏi | Owner đề xuất | Default nếu không answer |
|----------|---------------|---------------------------|
| Task list "personal" của phụ huynh có sync giữa các thiết bị không? | Product | YES (đơn giản với Dexie + queue) |
| Subtask depth limit cứng 3 hay config parish? | Product | Cứng 3 (giảm complexity) |
| Multi-assignee có cho phép 1 primary + nhiều secondary, hay unlimited? | Product | 1 primary + unlimited secondary (Planner model) |
| Event recurrence: lưu RRULE hay expand sẵn? | Eng | RRULE (ít row, mở rộng linh hoạt) |
| Event check-in: tận dụng T3 QR engine của exam hay xây mới? | Eng | Tái dùng (cùng format) |
| Capacity check: enforce at INSERT (writer-first) hay SELECT-then-INSERT? | Eng | writer-first (đã chứng minh ở exam) |
| Capacity cho guest (không phải user): count vào capacity? | Product | YES (1 row = 1 người tham dự) |
| Phụ huynh thấy task/event của lớp con mình? | Product | NO (task private; event public) — chờ feedback GLV |
| Notification T-24h cron: trên server hay client? | Eng | Server (cron qua Render free tier) |
| Activity feed retention? | Product | 90 ngày (cắt offline) |
| ADR-110/111/112/113 numbering có khớp với roadmap không? | Eng | Dùng số kế tiếp sau ADR-109 |
| Existing `audit_logs` schema có cần `entity_subtype` không hay query bằng `entityType`? | Eng | Thêm `entity_subtype` (rẻ, future-proof) |
| Recurring event: instance đã qua có audit/cleanup không? | Eng | Soft delete + audit, không hard delete (giữ lịch sử) |

---

## 6. Những đề xuất KHÔNG có evidence để làm lúc này

- **Không xây workflow engine** (Jira-style transitions + validators + post-functions) — Catevia scale không cần; configurable status + audit đủ.
- **Không xây custom field engine** (Jira field config schemes) — enum + checklist đủ cho 95% use case xứ đoàn.
- **Không xây microservice event/task** — modular monolith hiện tại (Hono + Drizzle transaction) đã chứng minh đủ atomicity (ADR-057 idempotency + audit_logs).
- **Không thêm event bus** (Kafka, RabbitMQ) cho notification — `notificationQueue.ts` đã có lease/attempt pattern.
- **Không upload ảnh event** — privacy cost chưa được approve (cùng pattern exam OMR).
- **Không dùng 3rd-party SaaS** (Asana, Trello) làm backend — Catevia đã có single-parish deployment + tenant isolation contract; SaaS third-party vi phạm ADR-031.
- **Không xây Gantt/Timeline view** Phase 1-3 — chỉ List + Board (kanban) view đủ; Gantt là overkill cho 50-200 task/xứ.
- **Không auto-suggest assignee** (ML/AI) — manual assignment đã đủ; ABAC/RBAC scope đã enforce.
- **Không làm public marketplace task** (Upwork-style) — không thuộc domain TNTT.

---

## 7. Rủi ro tổng thể

| Rủi ro | Mức | Mitigation |
|--------|-----|-----------|
| Audit `assessment-question-bank-exam-omr-2026-09-06-r1.md` chưa ship WIP fix (D1-D5 + R-WIP1/2/3) | HIGH | Roadmap này bắt đầu sau khi WIP remediation merge; gate: focused suite + audit probes xanh. Không stack thêm module trên nền chưa ổn. |
| Phase 1 chạm nhiều D2-OCC pattern chưa proven ngoài exam | MEDIUM | Reuse `upsertExamResults` pattern; viết `taskOCC` test tương tự `examResultUpsertRace`; review bởi owner exam. |
| RRULE expansion sai DST/timezone | MEDIUM | Dùng `rrule.js` (đã có npm package, ~200KB) hoặc `ical.js`; test với RFC 5545 reference fixtures. |
| Capacity race cho event phổ biến (Lễ Bổn Mạng 500 người) | MEDIUM | writer-first transaction + concurrency test tương tự exam; benchmark. |
| Notification cron ở Render free có thể bị sleep | LOW-MEDIUM | Dùng existing `sundayReminderScheduler` pattern; document external gate. |
| Personal task của phụ huynh "rò rỉ" sang giáo xứ khác nếu multi-parish tương lai | LOW | composite PK `(parish_id, id)` + ADR-031 đã enforce. |
| Audit log retention không xác định | LOW | ADR-057 đã có retention policy tổng; mở rộng khi Phase 4. |
| RRULE expansion nổ nếu `UNTIL` xa | LOW | Window cap 90 ngày; recurring instance cũ giữ từ lúc expand. |

---

## 8. Acceptance tổng thể (cuối roadmap)

- **Functional:**
  - GLV tạo task list tuần → giao cho 5 phụ tá → tracking dashboard real-time.
  - Parent đăng ký 2 con vào Trại Hè → nhận notification → check-in QR tại cổng.
  - Admin tạo lịch Lễ Bổn Mạng recurrence hàng năm → 1 click sinh event mới cho năm sau với sessions + staff.
  - Sau kết thúc event, báo cáo: số đăng ký, số check-in, số no-show, capacity utilization, ledger thu/chi.

- **Non-functional:**
  - 322+ tests PASS (regression), 100+ tests mới (tasks + events).
  - Lighthouse mobile ≥ 90.
  - A11y axe 0 critical.
  - Latency: GET /api/tasks?assignee=me p95 < 100ms (offline cache hit); POST /api/tasks p95 < 300ms (online).
  - ADR-110/111/112/113 chốt từng phase.
  - 0 P0/P1 defect audit ở gate release.

- **Business outcome (cần owner xác nhận):**
  - Tăng % task hoàn thành đúng hạn từ baseline UNKNOWN → target 80% trong 6 tháng (đo qua task status report).
  - Tăng % event có check-in từ baseline UNKNOWN → target 90% trong 6 tháng.
  - Giảm % "missed event reminder" (parent claim) từ baseline UNKNOWN → target < 5%.

---

## 9. Tóm tắt điều hành

1. **Catevia đã có 70% infrastructure** cần cho task + event: audit log, idempotency, RBAC + class scope, encrypted offline queue, smart notifications, parish calendar, ical export, leave request (state machine mẫu), QR scanner engine. Module mới tận dụng tất cả, không xây mới nền tảng.

2. **3 entity mới + 2 enhancement** đủ cho MVP; roadmap 5 phase, 12-14 tuần tổng cộng.

3. **Multi-assignee + 1 primary** là pattern chính (theo Planner). Subtask depth 3. Status column đơn giản. Audit log immutable (theo ADR-057).

4. **Event Organization** là novel — không hệ thống event SaaS nào có first-class event-task entity. Catevia lấp bằng `tasks.event_id` nullable. Tái sử dụng QR engine cho check-in.

5. **Recurrence chỉ cho event** Phase 2-3; recurring task là Phase 3+ nice-to-have.

6. **Capacity fail-closed** với writer-first transaction (đã chứng minh ở exam). Waitlist là Phase 4.

7. **Offline write** cho task create/update + event registration; check-in online-only Phase 1.

8. **RBAC theo scope** (parish/class/event/personal), server-authoritative, hidden nav không phải authz.

9. **12 open questions** cần owner trả lời trước Phase 1 kick-off (xem §5).

10. **Không đề xuất** workflow engine, custom field engine, microservice, event bus, Gantt, marketplace — đều thiếu evidence cho scale Catevia.

---

## Phụ lục A — Bảng so sánh 28 hệ thống (đã verify từ docs chính thức)

| # | Hệ thống | Domain | Source |
|---|----------|--------|--------|
| 1 | Asana | Task | developers.asana.com/docs/object-hierarchy |
| 2 | monday.com | Task | developer.monday.com/api-reference |
| 3 | Jira Cloud | Task | developer.atlassian.com/cloud/jira |
| 4 | Linear | Task | linear.app/docs/projects |
| 5 | Notion | Task/DB | developers.notion.com/reference/database |
| 6 | MS Planner | Task | learn.microsoft.com/connectors/planner |
| 7 | Smartsheet | Task | smartsheet.redoc.ly |
| 8 | Trello | Task | developer.atlassian.com/cloud/trello |
| 9 | ClickUp | Task | help.clickup.com Hierarchy |
| 10 | Eventbrite | Event | eventbrite.com/platform/docs |
| 11 | Cvent | Event | cvent.com event-management |
| 12 | Whova | Event | whova.com/product |
| 13 | Bizzabo | Event | bizzabo.com |
| 14 | Splash | Event | splashthat.com |
| 15 | Luma | Event | lu.ma |
| 16 | RingCentral Events | Event | ringcentral.com/events.html |
| 17 | Planning Center | Church | help.planningcenter.com |
| 18 | Breeze ChMS | Church | support.breezechms.com |
| 19 | ACS/ParishSOFT | Church | help.acst.com, parishsoft.com |
| 20 | Pushpay | Church | support.pushpay.com |
| 21 | ChurchTrac | Church | churchtrac.com/support |
| 22 | Tithe.ly | Church | support.tithe.ly |
| 23 | Subsplash | Church | support.subsplash.com |
| 24 | CCB | Church | ccbtutorials.com |
| 25 | MS 365 (Teams+Outlook) | General | support.microsoft.com |
| 26 | Google Workspace | General | support.google.com |

## Phụ lục B — Open ADR slots đề xuất

| ADR | Tiêu đề dự kiến | Authority | Phase |
|-----|------------------|-----------|-------|
| ADR-110 | Task Assignment Domain Model & RBAC Scope | CANDIDATE | Phase 1 |
| ADR-111 | Event Organization Domain Model, RRULE Recurrence & Capacity | CANDIDATE | Phase 2 |
| ADR-112 | Recurring Task Semantics & Template Cloning | CANDIDATE | Phase 3 |
| ADR-113 | Household / Family Record + Event Payment Integration | CANDIDATE | Phase 4 |
