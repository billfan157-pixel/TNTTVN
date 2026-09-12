# Báo cáo đánh giá toàn diện phân hệ Operations (trang `/operations`) — Catevia

- **Ngày audit gốc:** 2026-09-12 · **Lượt 2:** re-audit toàn diện sau batch remediation chưa commit · **Lượt 3:** hiệu chỉnh sau đối chiếu độc lập bởi second agent (mọi điều chỉnh dưới đây đều được auditor này tái kiểm chứng bằng code trước khi áp dụng; các đánh giá của second agent bị bác có ghi rõ lý do) · **Lượt 4:** cập nhật sau product quyết định xóa approval workflow (xem P1-12 bổ sung, A3'/A4'/A5'/A6'/A7'/A8', B3', blockouts ACTIVE)
- **Phạm vi:** Toàn bộ phân hệ Operations — trang `src/pages/OperationsPage.tsx`, 16 component `src/components/operations/*`, store `operationsStore.ts`, API client (`src/lib/api/operations.ts` + `src/lib/api/core.ts`), `server/src/routes/operations.ts` (61 endpoint sau khi xóa `/approve`), 8 service backend + service mới `operationsManagerReminderService.ts`, domain FSM, schema DB (73 bảng Drizzle, 16 bảng `operation_*` + bảng hỗ trợ), 5 scheduler/worker, migration/readiness tooling (`20260907-182..20260912-260`), test (unit + E2E + benchmark), tài liệu chuẩn (ADR-110/112, BUSINESS_RULES §31, API contract §25) và các trang liên quan (Calendar, Dashboard, Parish Profile, Parish Events, Mobile shell).
- **Phương pháp:** Đọc mã nguồn trực tiếp (read/grep toàn bộ file chính của working tree hiện hành), đối chiếu từng finding của bản audit 2026-09-12 (lượt 1) với implementation hiện tại; mọi trạng thái FIXED/STILL_TRUE dưới đây đều kèm vị trí bằng chứng mới đã tự đọc lại trong lượt này.
- **Phân loại nhiệm vụ:** D3 (chạm phân quyền, tenant isolation, idempotency, lifecycle, data integrity).
- **Quy ước mức độ:** `[P0]` sửa ngay (bug thật, rủi ro cao) → `[P1]` quan trọng → `[P2]` nên sửa → `[P3]` sản phẩm/governance. Các mục đánh dấu **(INFERENCE)** là suy luận chưa kiểm chứng runtime. Trạng thái remediation: **[FIXED]** / **[PARTIALLY FIXED]** / **[STILL TRUE]** / **[NEW]** (finding mới của lượt này).

---

## PHẦN A — CƠ CHẾ HOẠT ĐỘNG (đã kiểm chứng lại, lượt 2)

### A.1. Vị trí trong hệ thống

Operations là **bộ phận vận hành sự kiện & công việc** nội bộ của giáo xứ (Xứ đoàn), theo ADR-110 (docs/ADR_ARCHITECTURE_DECISION_RECORDS.md:3753, sửa đổi 2026-09-11) và ADR-112 (O1–O8):

- `operation_events` là **aggregate gốc duy nhất**; `parish_events` (Lịch xứ) chỉ là **projection đọc** do Operations tự sinh/quản lý — client không bao giờ tự set `sourceParishEventId` (route từ chối với `CALENDAR_LINK_SERVER_MANAGED`, operations.ts:1301, 1331). Event giờ mang `eventScopeType` (`XU_DOAN↔scopeUnitId NULL`) với DB trigger ràng buộc (migration 20260912-257).
- Trang `/operations` (src/router.tsx:331-340) chỉ dành cho STAFF (`admin|chunhiem|phuta` — server gate operations.ts:44-45 + roleMiddleware; client routePolicy.ts:79), vào từ: sidebar desktop (DesktopSidebar.tsx:85), **bottom-nav mobile** (MobileBottomNav.tsx:45 — mới, tile "Công Việc" theo role; MobileTopBar.tsx:203 ghi chú đã hạ org surfaces xuống overflow), thẻ nhanh Dashboard (OrganizationDashboardPage.tsx:33,264), nút "tổ chức sự kiện này" từ Calendar (DesktopCalendarView.tsx:387, MobileCalendarView.tsx:302 — vẫn `/operations` trơn, không kèm id).
- Cơ quan dữ liệu: đơn vị tổ chức (BOARD → BRANCH/COMMITTEE) + nhiệm kỳ `parish_service_terms.position_code` (7 mã chức vụ, CHECK constraint tại schema + migration 20260912-256) cấp quyền Operations; `users.role` chỉ là gate thô ở router.

### A.2. Luồng dữ liệu frontend (1 lần đọc)

```
operationsApi (src/lib/api/operations.ts — mọi command gắn header Idempotency-Key;
               getEvent/getTask nhận AbortSignal — P1-4 đã wired, operations.ts:368-369)
  → useOperationsStore (zustand, 794 dòng — fetch 5 list song song + validate tenant/pagination từng response)
  → OperationsPage (2.119 dòng sau khi tách 6 form + checklist ra component riêng)
     → 17 panel; 13/17 dùng useStableCommandKey (hook mới src/hooks/useStableCommandKey.ts)
```

- **Không optimistic UI:** mọi mutation chờ server ack (BUSINESS_RULES §31 rule online-first).
- **Cache offline:** 1 key Dexie mã hóa `parish_operations_overview_v1` chứa `{events, tasks, totals}` (operationsStore.ts:8,279); chỉ dùng khi lỗi transport thật (`ApiError.status===0 && code!=='REQUEST_ABORTED'`, :144-150); vào cache-mode → mọi nút mutation khóa (`canMutate = isOnline && source==='server'`, OperationsPage.tsx:254-255). Reminders/permissions/dispatch không cache (store reset rỗng khi offline, :291) — banner offline giờ **nói rõ trung thực** nội dung cache qua `operationsOfflineBannerText` (operationsViewHelpers.ts:24-43) — khép P3 offline-communication.
- **Idempotency key ổn định theo payload:** hook chuẩn hóa `useStableCommandKey` dùng chung 14 component (CreateEventForm, EventEditForm, EventTaskForm, StandaloneTaskForm, TaskAssignForm, TaskChecklistSection, AvailabilityPanel, EventReminderForm, EventRetrospectivePanel, StandaloneWorkstreamsPanel, TaskRestorePanel, TaskHandoverForm, TaskCommentsPanel, WorkstreamPanel — grep useStableCommandKey).

### A.3. Hai state machine

**Sự kiện** (server/src/domain/OperationsEventLifecycle.ts):
```
DRAFT → PLANNING → PREPARING → READY → LIVE → COMPLETED   (+ CANCELLED từ DRAFT..READY)
```
- Chuyển liền kề ±1; lùi/hủy bắt buộc lý do; lùi ⇒ `automationPaused`, chỉ resume bằng command riêng có OCC (`POST /events/:id/automation/resume` — route :1618). `COMPLETED` là trạng thái cuối từ 2026-09-12 (product): mọi chuyển tiếp từ COMPLETED đều `409 EVENT_COMPLETED_TERMINAL`, UI gỡ nút lùi ở event đã hoàn tất.
- Gate khi tiến: `PLANNING→PREPARING` yêu cầu mọi task có owner đã xác nhận; `READY/LIVE` readiness sạch (override được với lý do); `COMPLETED` yêu cầu `outcomeSummary` + closure không overridable.
- Automation 30s/tick CAS multi-instance; khi COMPLETED tự ghi Parish Memory ACTIVITY + hủy dispatch mở.

**Task** (operations.ts): `BACKLOG→TODO→IN_PROGRESS→(BLOCKED)→DONE/CANCELLED`; DONE = dependency xong + checklist bắt buộc xong (không còn gate approval từ 2026-09-12); `restore` chỉ từ CANCELLED→TODO. DONE/CANCELLED terminal.

### A.4. Phân quyền 3 lớp (server/src/services/operationsAuthorization.ts — 580 dòng)

1. **Tài khoản** (`users.role` + authMiddleware đọc lại DB mỗi request).
2. **Chức vụ tổ chức** theo `position_code` (7 mã) + phạm vi đơn vị; ngày dân sự theo `PARISH_TIME_ZONE` (parishTimeZone.ts).
3. **Vai trò tài nguyên**: EVENT_CREATOR/ORGANIZER, WORKSTREAM_LEAD/OBSERVER, TASK_OWNER/CONTRIBUTOR (chỉ sau assignment **ACCEPTED**).
- **Separation of duty (retired 2026-09-12 cùng approval workflow):** service `operationsSeparationOfDuty.ts` đã xóa — với 2 role còn lại mỗi cấp không còn xung đột nào để check.
- **Admin override** (ADR-112 O2): admin mutate mọi thứ trong parish, **trừ** `task.execute`. Override giờ **để lại dấu vết audit**: `audit()` lấy `peekOperationsAuthorizationReason(tx)` ghi vào `newValue.authorizationReason` (operations.ts:322-327) — **P1-3 [FIXED]**, có test riêng `operationsAuthorizationAudit.test.ts` (sticky ADMIN_OVERRIDE, executor-scoped).
- **Tenant isolation:** mọi query `eq(…, user.parishId)`; composite PK `(parish_id,id)`; cross-parish fail-closed. Grep lại toàn route file ở lượt này — **không tìm thấy lỗ hổng tenant mới**.

### A.5. Idempotency & OCC (operationsIdempotency.ts)

- PK `(parish, actor, key)`; request-hash SHA256 payload canonical; **42 mutation command** chạy trong `runIdempotentOperationsCommand` (62 endpoint − 20 GET = 36 POST + 6 PUT; lượt 2 ghi 43 do tính cả dòng import khi grep — đã đếm lại theo call sites thật) = 1 transaction (business + receipt + audit cùng commit/rollback).
- Replay cùng key+hash → response cũ + `Idempotency-Replayed: true`; khác payload → 409 `IDEMPOTENCY_CONFLICT`; response compact → 409 `IDEMPOTENCY_REPLAY_EXPIRED`. Tombstone vĩnh viễn.
- **Nhánh recovery UNIQUE-violation giờ có test pin** (`operationsIdempotencyRace.test.ts`: stub tx layer, race receipt → replay, không receipt → rethrow, non-constraint → không đụng receipt table) — **P1-12d [FIXED]**.
- OCC: mọi update kèm `WHERE version` + `.returning()`; request 0 row → `VersionConflictError`.

### A.6. Worker tự động (5 scheduler, wired server/src/index.ts:329-332 + init receipt maintenance :228, shutdown :262-266)

| Worker | Việc | Cơ chế an toàn |
|---|---|---|
| Event lifecycle | auto LIVE/COMPLETED đúng giờ | CAS + re-check trong tx; skip automationPaused |
| Reminder | PENDING→ENQUEUED→SENT/FAILED | re-authorize người nhận đúng lúc gửi; terminal ⇒ FAILED có lý do; **retry ceiling 25 lần** (`MAX_REMINDER_ENQUEUE_ATTEMPTS`, reminderService.ts:19) với attemptCount+1, CAS version, ceiling → FAILED `REMINDER_ENQUEUE_FAILED` — **P0-7 [FIXED]** |
| Task dispatch | mời dự bị 70% cửa sổ chờ | CAS + kiểm tra task/event còn mở |
| Manager prep *(service mới `operationsManagerReminderService.ts`, 183 dòng)* | nhắc manager (creator + organizer) 1 lần/ngày xứ đoàn khi PLANNING đủ điều kiện PREPARING | eligibility predicate **tái dùng đúng hàm `preparationAcceptanceReadiness` của transition gate** (:39-68); dedupe `MANAGER_PREP:event:recipient:day` (:88); re-authorize recipient trong tx (:150-151); CAS PENDING→ENQUEUED version 1→2 (:113-119) |
| Receipt maintenance | compact response body cũ | tắt mặc định khi `OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS` trống — có test lifecycle (`operationsSchedulerLifecycle.test.ts` pin init/stop idempotent 5 scheduler + disabled-without-retention) — **P1-12e [FIXED]** |

### A.7. Liên kết các trang/chức năng

- **Calendar ⇄ Operations:** PUBLIC_SUMMARY sinh projection 1-1 (partial UNIQUE schema.ts:1292-1293 + trigger); INTERNAL không lên lịch; `/api/parish-events` readonly 405.
- **Parish Profile (Management):** quản trị đơn vị/nhiệm kỳ/position_code — nơi "cấp quyền" cho Operations.
- **Dashboard:** đếm badge "chờ phản hồi" từ tasks Operations.
- **Mobile bottom-nav:** Operations giờ là org-tab chính (`routePolicy.ts:79 mobileTab: 'operations'`; MobileBottomNav.tsx:45 theo role) — **P3 mobile [IMPLEMENTED]** theo plan `OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md` Phase A.
- **Offline sync engine:** không áp dụng cho Operations — chủ ý ADR-110.

### A.8. Test & CI hiện trạng (đếm lại lượt này)

- Backend: `operations.test.ts` **2.242 dòng / 60 test** (tăng từ 53) + 6 file test Operations mới: `operationsRouteGuard.test.ts` (5 test 401/403), `operationsIdempotencyRace.test.ts` (3), `operationsOnErrorClassification.test.ts` (6), `operationsReminderRetryCeiling.test.ts` (2), `operationsSchedulerLifecycle.test.ts` (5 — 4 init/stop idempotent + 1 receipt-maintenance disabled; lượt 2 ghi 6 là đếm sai), `operationsAuthorizationAudit.test.ts` (5) — tổng **86 server test Operations** (lượt 2 ghi 87).
- `test:security-critical` giờ **gồm `operationsRouteGuard.test.ts`** (package.json:22) — **P0-8 [FIXED]**.
- Frontend: OperationsPage **38 test** (từ 30, thêm P1-4 reconnect refetch, P1-8 busy không khóa chéo, filter chips role=group, FAB, keyboard Enter mở event); store **33 test**; mới: `OperationsForms.test.tsx` (5 test cho 6 form tách riêng), `useStableCommandKey.test.tsx`, `api-abort.test.ts` (5 test P1-4 REQUEST_ABORTED/timeout/retry).
- E2E: 9/9 `@critical` (`e2e/operations.spec.ts` — đếm regex trực tiếp).
- Benchmark: `scripts/run-operations-benchmark.mjs` chạy isolate (temp DB, scrub env) — vẫn synthetic, không threshold/CI, không baseline persist (**D4 chưa làm**).
- **Bằng chứng kiểm chứng độc lập (lượt 3):** cấu hình Vitest (`vitest.config.ts:9-22`) — môi trường test **không tải `.env` thật**, tự set `JWT_SECRET` test riêng + `NODE_ENV=test`, `maxWorkers: 1`; server-side `db/index.ts:15-21` chạy bootstrap + migrations khi import — nghĩa là các test server Operations thực sự exercise schema/migration thật (bootstrap DDL → migrations → defensive sync → indices → drizzle) trong SQLite test. Điều này khẳng định các FIX ở trên không chỉ "có test" mà test chạy trên đúng contract schema. (Chú ý: chính auditor này vẫn chưa tự chạy suite trong lượt 2/3 — xem Phần D.1.)

---

## PHẦN B — ĐÁNH GIÁ (lượt 2, sau remediation)

### B.1. Điểm mạnh đã kiểm chứng (giữ nguyên + mở rộng)

1. **Bảo mật & tenant isolation chắc** (như lượt 1, re-verified) + audit giờ phân biệt "admin đè quyền" vs "quyền nghiệp vụ" qua `authorizationReason`.
2. **Idempotency + OCC + audit 1 transaction cho 43 command**; recovery branch có test.
3. **State machine sạch**; FSM domain thuần có unit test; gate readiness/closure tách 3 mức.
4. **Worker scheduler an toàn concurrent**: CAS + ceiling retry có test terminal hành vi; manager-prep eligibility tái dùng predicate của transition gate (không drift logic).
5. **List endpoint đã không còn load-and-slice toàn parish full rows** — two-phase read (xem B.2 P0-1 resolution).
6. **Test guard composition-root**: `operationsRouteGuard.test.ts` đỏ ngay khi ai sửa chuỗi role ở :44-45 — vào cổng security-critical.
7. **Decompose frontend có kỷ luật**: 6 form + checklist section tách thành component độc lập có test riêng, dùng chung hook stable-key — mỗi mutation path đều được server dedup.

### B.2. Findings P0 — trạng thái sau remediation

**P0-1. [Server/HIGH] List endpoint đọc toàn parish rồi filter/paginate in-memory — [PARTIALLY FIXED → không còn là P0]**
Hiện trạng (tự đọc lại): cả 3 list endpoint đã chuyển sang **two-phase read**:
- `GET /events` (operations.ts:1260-1289): phase 1 select **narrow auth columns** (id/scope/organizer/status/createdBy, 6 cột) toàn parish → batch authorize → slice page → phase 2 hydrate **full row chỉ các ID trang đó** qua `inArray`. Total vẫn chính xác vì per-row auth không push được vào SQL.
- `GET /tasks` (:2192-2271): tương tự + **chỉ load workstream/event referenced IDs** (chunk 400 chống SQL var limit, :2210-2219); `mine=true` chỉ load assignments khớp user/person (không còn tải toàn parish assignments); person lookup ép `serviceStatus='ACTIVE'` (:2218).
- `GET /workstreams` (:1885-1928): tương tự, events map restricted to referenced IDs.
- Còn lại: phase 1 vẫn quét **narrow rows toàn parish** (không keyset/COUNT-pushdown cho per-row auth) — chi phí tăng theo lịch sử nhưng đã cắt bỏ phần hydrate đắt (full row + related). Đây giờ là **mặt bằng P2 tiếp tục tối ưu** (keyset batching như kế hoạch B1 bước 2 cũ), không còn P0. Egress/DoS bề mặt đã hẹp đáng kể (payload mỗi trang chỉ ≤ limit row).
- Ghi chú: `pageMeta` client vẫn chặn limit ≤500; server `listPagination` (:291-298) chặn 1..500 — khớp.

**P0-2. [Frontend/HIGH] `formatStoreError` ép mọi 409 thành VERSION_CONFLICT — [FIXED]**
Hiện trạng: operationsStore.ts:169-194 — `isOccConflict()` chỉ nhận `code === VERSION_CONFLICT|VERSION_MISMATCH` hoặc message-match; **mọi code khác giữ message riêng** (comment ghi rõ dispatch/duplicate/replay/template/self-approval). `handleConflictSync` (:196-216) chỉ refetch khi thật sự OCC, và **loại trừ** TASK_ACCEPTANCE_PENDING/READINESS_BLOCKED/COMPLETION_BLOCKED (dialog riêng sở hữu flow).

**P0-3. [Frontend/HIGH] OperationsPage 2.399 dòng subscribe toàn store — [PARTIALLY FIXED, còn P1]**
Hiện trạng: **2.119 dòng** (từ 2.399); subscription đã chuyển **selector hẹp toàn phần** (`useOperationsStore(s => s.events)` … 30 selector riêng, :118-164); 6 form lớn + checklist tách thành component (`CreateEventForm` 171d, `EventEditForm` 110d, `EventTaskForm` 92d, `StandaloneTaskForm` 87d, `TaskAssignForm` 120d, `TaskChecklistSection` 102d) + helper chung `operationsViewHelpers.ts`; các list compute chuyển sang `useMemo` (closureTasks :271, filteredTasks :285, taskGroups :293, modalTabs :303).
Còn lại: page gốc vẫn giữ ~19 useState + 2 useRef + các handler phức hợp (transition/cancel/rewind flow) — **chưa tách section lớn** (EventList, MyTaskBoard, KpiStrip, UtilityTabs) như kế hoạch B2 bước 1 cũ. Hạ từ P0 → **P1 (tiếp tục decompose)** vì risk re-render giờ đã локализ qua selector + memo.

**P0-4. [Frontend/HIGH] Modal "thân rỗng" khi tab biến mất — [FIXED]**
Hiện trạng: OperationsPage.tsx:344-348 — `activeModalTab = modalTabs.some(tab => tab.value === eventModalTab) ? eventModalTab : 'tasks'` (comment ghi rõ fallback khi rewind khỏi COMPLETED). Không còn TabPanel trống.

**P0-5. [Frontend/HIGH] Deep-link `sourceParishEventId` hợp đồng chết — [FIXED bằng cách xóa]**
Hiện trạng: `router.tsx:331-340` **không còn validateSearch**; grep `sourceParishEventId` trong src/ chỉ còn type field API (:62), hiển thị badge (:822) và 2 test chốt client không tự set — đúng quyết định A11 (xóa khỏi contract chết). Nút Calendar vẫn `/operations` trơn (không id) — nhất quán với việc đã xóa param.

**P0-6. [Server/MEDIUM-D3] Checklist item không có OCC riêng — [FIXED lượt 4 cùng đợt xóa approval]**
B3'-quick đã áp dụng: update item kèm `WHERE isDone/isRequired = previousItem`, 0 row → `VersionConflictError` (409, đúng ngôn ngữ OCC của route). Phân tích reachability lượt 3 giữ nguyên giá trị lịch sử (in-band đã an toàn nhờ task-CAS; guard mới đóng nốt đường out-of-band). Không thêm cột version riêng — không cần thiết sau khi approval workflow (lý do duy nhất cần invalidation chính xác từng field) đã xóa.

**P0-7. [Server/MEDIUM] Vòng retry enqueue-reminder vô hạn — [FIXED]**
Hiện trạng: reminderService.ts:176-195 — catch Phase B: `attempts = reminder.attemptCount + 1`; `exhausted = attempts >= MAX_REMINDER_ENQUEUE_ATTEMPTS (25)`; chưa ceiling → PENDING + `nextAttemptAt +60s` + CAS theo (status,version,triggerAt); ceiling → FAILED `REMINDER_ENQUEUE_FAILED` + `nextAttemptAt:null`. Comment giải thích rationale. Test `operationsReminderRetryCeiling.test.ts` dùng seam `beforeClaim` ném lỗi: (1) attemptCount 0→1 giữ PENDING retryable; (2) ceiling 24→25 terminal FAILED. Counter monitoring giờ đúng.

**P0-8. [Test/SECURITY] Router guard không test 401/403 — [FIXED]**
Hiện trạng: `operationsRouteGuard.test.ts` (mới, 5 test): no token → 401; token rác → 401; `phuhuynh` → 403 GET; `phuhuynh` POST không token hợp lệ → 403 **trước khi validation chạy**; staff baseline 200. File nằm trong `test:security-critical` (package.json:22). Comment đầu file ghi rõ mối đe dọa được chốt: "A role-list edit here must turn this file red before any E2E run."

### B.3. Findings P1 — trạng thái sau remediation

**P1-1a. [Server] Dependency cycle quét full-table — [FIXED]**
operations.ts:2720-2732: comment "Same-event edges only — parish-wide dependency scan was a write-path full table read"; edges join `operationTasks` lọc `operationEventId = eventId` (hoặc standalone `isNull`). DFS giữ nguyên. Ràng buộc same-event đã có từ trước (:2717).

**P1-1b. [Server] `listOperationsCandidates` tải toàn person+staff — [FIXED]**
operationsAuthorization.ts:323-394: unit-scoped picker chỉ load person qua **service terms trong unit subtree** (`descendantIds` → `inArray`, chunks) + ACTIVE; staff accounts chỉ load theo `linkedUserIds` đã thu hẹp; full-directory giữ cho parish-wide actors (admin/Xứ đoàn office) — đúng thiết kế `inResourceScope`. Ghi chú mới: `selectInChunks` mất ORDER BY nên có sort lại localeCompare 'vi' (:359-360).

**P1-2. [Server] `app.onError` đánh hơi chuỗi con — [FIXED]**
Hiện trạng: logic tách ra `server/src/utils/onErrorClassification.ts` (66 dòng, testable): (1) status 4xx tường minh là authoritative — giữ status+code; (2) chỉ match **2 cụm Việt chuẩn** ('không hợp lệ', 'không đúng định dạng') và **không bao giờ** khi message mang marker internal DB/driver (`/SQLITE|CONSTRAINT|Drizzle|libsql|Turso|FOREIGN KEY|NOT NULL|UNIQUE|CHECK constraint|Failed query|QueryError/i`); chuỗi "required" **không bao giờ** bị sniff; (3) còn lại 500. Client message truncate 500 ký tự. `index.ts:44` gọi `classifyOnError` + structured request log. Test 6 case gồm wiring Hono handler thật.

**P1-3. [Server/D3] Admin override không ghi authorization reason vào audit — [FIXED]**
operations.ts:322-327: `peekOperationsAuthorizationReason(tx)` (executor-scoped, sticky ADMIN_OVERRIDE, last-business-wins) gộp vào `newValue.authorizationReason` — không đổi schema. Test `operationsAuthorizationAudit.test.ts` (5 test) chốt semantics per-executor.

**P1-4. [Frontend] Không AbortController + không refetch khi online — [FIXED]**
- Abort: `api/core.ts:230-344` `combineWithTimeout(externalSignal, timeoutMs)`; superseded → `ApiError(0, 'REQUEST_ABORTED')` (:259) **không** rơi vào cache fallback (store :144-150 comment rõ). Store giữ `eventDetailAbort`/`taskDetailAbort` (:17-18, :405, :435) — đổi selection abort request cũ, response stale bị backstop generation counter (:416, :446). `api/operations.ts:368-369` getEvent/getTask nhận signal.
- Refetch khi online: OperationsPage.tsx:360-368 — effect keyed trực tiếp vào `(isOnline, source)`; comment giải thích anti-loop (success flips source, failure giữ cache và sẽ retry ở transition sau). Test P1-4 tại OperationsPage.test.tsx:681-699 (2 case).

**P1-5. [Frontend] TaskRestorePanel không stable key — [FIXED]**
TaskRestorePanel.tsx:31-38: `stableKey('task-restore', {id, version, reason})` + release sau ack — comment nhắc P1-5. Hook chuẩn `useStableCommandKey` giờ dùng 13/17 panel (mọi mutation path còn lại).

**P1-6. [Frontend] createTask không try/catch — [FIXED]**
operationsStore.ts:482-496: try/catch set `error` qua `formatStoreError` — comment "mirroring createStandaloneTask (P1-6)". Hai create giờ đối xứng.

**P1-7. [Frontend] refreshTaskViews counter số học — [FIXED]**
operationsStore.ts:466-480: so `selection !== taskRequest` snapshot, rồi so **token trả về** `appliedEventRequest !== eventRequest` từ `await selectEvent` (comment "P1-7: compare the token … instead of inferring it with `selection + 1` arithmetic"). Có kiểm `selectedTask?.task.id !== id` chốt đúng task mới reopen.

**P1-8. [Frontend] busyTask dùng chung chặn chéo — [FIXED]**
OperationsPage.tsx:166 `busyTask` (task id), :170 `busyInbox: Set<string>` (reminder + dispatch id riêng từng row). Guard từng handler theo đúng phạm vi (:638, :650, :662 dùng `busyInbox.has(id)`; :467 `busyTask === task.id`). Test chốt: "a reminder action in flight does not lock the dispatch accept button" (OperationsPage.test.tsx:701-703).

**P1-9. [Frontend] WorkstreamPanel reason dùng chung — [FIXED]**
WorkstreamPanel.tsx:45-50: `removeReasons: Record<string,string>` (per member), `leadReplaceReason`, `blockedReason` riêng — comment "One reason draft per destructive command".

**P1-10. [Frontend] TaskApprovalQueue mất refresh token — [FIXED]**
TaskApprovalQueue.tsx:39-47: effect so `refreshToken !== lastRefreshToken.current` → `load(1)` **ngay cả khi chưa từng load thủ công** (comment "P1-10: honor the refresh signal even before the first manual load").

**P1-11. [Docs] Drift tài liệu ↔ code — [FIXED toàn bộ 5 mục]**
- `07_DATABASE_PLAN.md`: header giờ ghi **75 bảng production = 73 Drizzle + 2 infra** (line 3), `operation_task_dispatches` có dòng #101 đầy đủ (PK/FK/partial UNIQUE/CHECK/migration 254). `02_ARCHITECTURE.md:35` ghi 73 tables — **hai phía + đếm thật (grep sqliteTable = 73) đồng nhất**.
- `08_E2E_TESTING_STRATEGY.md:46`: bảng rủi ro có dòng Operations (9 @critical + matrix rủi ro + kiểm chứng integration).
- `FRONTEND_API_CONTRACT.md` §25: đủ `GET /permissions` (:840), `GET /units` (:840), `GET /tasks/:id/dispatches` (:841), `POST /events/:id/automation/resume` (:841), `GET /creation-options` (:837), bảng reminder kinds TASK_DUE|EVENT_START|OVERDUE|MANAGER_PREP + chính sách dedupe/inbox (:842), `GET /candidates` projection + unit-scoped semantics (:818).
- ADR-110 :3761-3763: hai đoạn supersede annotation đầy đủ "[SUPERSEDED IN PART BY ADR-112 O1–O2]", câu production read-only được strike-through và ghi "retained for lineage only".
- `AI_CONTEXT_MAP.md:9`: "Version 3.11 | Last reviewed: 2026-09-12 | Status: ✅ Current"; module Operations cập nhật ADR-112, 7 position codes, operationsManagerReminderService, migrations đến 259.

**P1-12. [Test] Lỗ hổng phủ — [FIXED toàn bộ]**
- `/workstreams/:id/ready`: operations.test.ts:2121-2135 (400 thiếu reason, OCC stale 409, READY/BLOCKED version bump, audit MARK_READY ×2).
- `/reminders/:id/read`: :2137-2152 (OCC expectedVersion 409, read-idempotent giữ readAt, per-recipient 404 contributor/foreign).
- `/tasks/:id/dispatches`: :2154-2165 (tenant scope: foreign 403, not-exist 403).
- Idempotency UNIQUE-recovery: `operationsIdempotencyRace.test.ts` (3 test stub tx).
- 5 scheduler lifecycle + receipt maintenance: `operationsSchedulerLifecycle.test.ts` (5 test).
- A10 soft assertion: **hết** — foreign reminder list đã pin `toBe(403)`.
- Approval removal (lượt 4, product decision 2026-09-12): migration `20260912-260` (bỏ 3 cột approval, guard abort khi còn review/state legacy) có test riêng `operationsApprovalRemovalMigration.test.ts` (đường sạch + 3 đường guard-abort); rehearsal pin marker mới.
- Coverage folder: **vẫn stale** (footer 2026-09-09, không có `src/components/operations/*` trong coverage-summary.json; có routes/operations.ts 88.52%) — D5 chưa làm, giữ cảnh báo "không trích số từ coverage/".

### B.4. Findings P2 — trạng thái sau remediation

- **[Frontend] Menu "+ Tạo mới" role="menu" thiếu keyboard/Escape/outside-click — [STILL TRUE]** (OperationsPage.tsx:1203-1226 desktop, :1288 mobile — không có onKeyDown/Escape/outside-click handler; chỉ aria-haspopup/expanded). Có test menu-permission nhưng chưa có test keyboard.
- **[Frontend] Hàng event `<article tabIndex={0}>` thiếu `role="button"` — [PARTIALLY FIXED; lượt 3 THAY ĐỔI ĐỀ XUẤT A6' — đề xuất cũ "thêm role=button" SAI]**: hiện trạng có onKeyDown Enter/Space rõ ràng (:790-799) + focus-visible ring; **nhưng** article này chứa `<Button>Xem chi tiết</Button>` lồng bên trong (:830-845). Thêm `role="button"` cho article sẽ tạo **nested-interactive violation** (ARIA: button không được chứa interactive descendants) — tệ hơn hiện trạng. **Đề xuất đúng (A6'-revised):** bỏ row-level interactivity — xóa `tabIndex`/`onKeyDown` khỏi article, giữ nút "Xem chi tiết" tường minh làm cách duy nhất mở event (nút đã có `stopPropagation`). Trade-off UX: mất click-to-open toàn row; cân nhắc giữ click-vào-row như shortcut pointer nếu muốn, nhưng keyboard vẫn qua nút. Duplicate-path keyboard hiện tại (row keydown + nút) cũng tự hết theo hướng này.
- **[Frontend] Empty state raw `<p>` — [FIXED lượt 4]**: TaskCommentsPanel (kế thừa TaskReviewPanel đã xóa) và TaskChecklistSection đều dùng `<EmptyState>` chuẩn. Các empty state chính của page đã dùng `<EmptyState>` chuẩn (:763, :771, :922, :1079, :1797, :1890 — 6 chỗ).
- **[Frontend] Filter chips raw button — [FIXED]**: giờ `role="group"` + `aria-pressed` + `min-h-[44px] mobile-touch-target sm:min-h-0` (:901-916) — đúng invariant 44px mobile; có test "accessible quick filter chips with role=group and aria-pressed" (OperationsPage.test.tsx:589).
- **[Frontend] Panels không dùng operationsErrorText — [FIXED lượt 4]**: mọi panel Operations hiển thị lỗi qua `operationsErrorText(code, fallback)` (`src/lib/operationsErrors.ts`, map VI đầy đủ) — gồm 5 panel còn lại lượt 3 (EventReminderForm, EventRetrospectivePanel, EventTemplatesPanel, TaskRestorePanel, TaskApprovalQueue) và TaskCommentsPanel mới.
- **[Frontend] eventType options lặp — [PARTIALLY FIXED theo hướng khác]**: danh sách 7 option giờ nằm ở **CreateEventForm.tsx:129** và **EventEditForm.tsx:95** (2 chỗ form tách riêng) — không có const dùng chung (`EVENT_TYPE_OPTIONS` không tồn tại); schedule validation: predicate lặp còn 2 chỗ (OperationsPage.tsx:525-528 taskEdit, EventTaskForm.tsx:26-28) — cùng logic "bắt buộc đủ cặp + end > start", chưa tách hàm chung. A12 làm một nửa (drift scope giảm vì form riêng, nhưng vẫn copy-paste).
- **[Frontend] Token trắng thô — [STILL TRUE, giảm mật độ]**: OperationsPage.tsx:909, :1356 (FAB), :1785 (chip active); SmartEventTimePicker.tsx:393,438 (knob switch), :589, :631. Không vi phạm lệnh cấm pastel; các chỗ `bg-parish-primary text-white` là pattern token-brand-on-primary — dùng `text-white` với nền brand là chấp nhận được, chỉ knob switch (`bg-white` trên track) đáng thay bằng token surface.
- **[Server] `operations.audit.view` capability chết — [FIXED lượt 4]**: đã xóa khỏi capability type, mọi role-set và permissions map (0 reference trong `server/src`); đọc audit đi qua `auditLogsRouter` admin-only riêng.
- **[Server] Promise.all nhiều statement trên một tx — [PARTIALLY FIXED]**: event detail (:1406-1416) tách đa số read ra `db` ngoài tx, chỉ còn `readiness + closureReadiness` trong 1 tx (2 statement, giảm từ 5); readiness vẫn 4 statement `Promise.all` trong tx (:821-846); các write path còn ~10 chỗ `Promise.all` trên tx (2034, 2145, 2451, 2502, 2577, 2637…). **(INFERENCE)** về Turso multi-instance như cũ.
- **[Server] `/blockouts/mine` không ép ACTIVE — [FIXED lượt 4]**: `/mine`, PUT và revoke đều lọc `serviceStatus='ACTIVE'` khi resolve person-link (nhất quán với `/tasks` mine=true); ownership self-check 404 giữ nguyên. Vốn chỉ là self-data nit (lượt 3).
- **[Server] GET resource id không qua Zod — [STILL TRUE]**: `/permissions`, `/reminders`, `/workstreams/:id`, `/tasks/:id`, `/events/:id` đọc `c.req.param('id')` thô; fail-closed (403/404) nhưng trả 403 thay vì 400 cho id rác — giữ nguyên finding.
- **[Test-Pattern] Over-mocking — [PARTIALLY FIXED]**: OperationsPage.test giờ mock store qua `useOperationsStore(selector)` pattern (:44-59) khớp selector-based page thật (không còn destructure-whole-store mock lệch); form test riêng dùng mock API đúng component. Vẫn còn: page test mock 3 panel (:66-68); server fixture vẫn biến module-level, `as any` nhiều chỗ. 2 negative-only assertion cũ đã có positive-assertion kèm theo (test mới :2141-2165 pin 404/403 cụ thể).
- **[Server] Dedupe reminder theo UTC instant — [DECIDED: giữ exact-instant]** (:1785 `${kind}:${target}:recipient:${userId}:at:${triggerAt}` — TASK_DUE 19:00/19:01 vẫn 2 row; MANAGER_PREP đã theo ngày xứ đoàn service mới :88). Product quyết ngày 2026-09-12: giữ nguyên, không đổi day-bucket (tránh migration dữ liệu cũ). Bù bằng cảnh báo gần-trùng client-side không chặn (EventReminderForm, xem D3').

### B.4bis — Findings mới của lượt 3 (kiểm chứng độc lập bởi second agent; auditor này đã tái đọc code xác nhận)

- **[NEW-1] Manager-prep dedupe race là robustness nit, không phải integrity bug:** `createDailyManagerReminder` check dedupeKey (:89-92) rồi insert với **PK deterministic** `OPR-MGRPREP-day-event-recipient` (:87,94). Hai run chồng nhau (tick 30s + init lúc boot) → PK UNIQUE violation → **cả tx fail** → caller chỉ đếm `failed++` + log (:154-165 catch block). Không có row mồ côi, không double-notify (PK chặn), không corrupt — chỉ mất notification của lần chạy va chạm đó (tick sau sẽ thấy dedupeKey tồn tại mà bỏ qua). Không cần fix để đúng dữ liệu; nếu muốn sạch hơn thì bắt UNIQUE tương tự `operationsIdempotencyRace` rồi trả 0.
- **[NEW-2] Worker scan không có predicate parish:** các worker (`processDueManagerPrepReminders` :132-134 quét `operationEvents` toàn bảng không `eq(parishId)`; reminder/dispatch scheduler tương tự) — an toàn **theo invariant hiện hành** vì (a) ADR-106 single-parish deployment lock `DEPLOYMENT_PARISH_ID`, (b) mọi write bên trong tx đều ép scope theo `event.parishId`/row data. Ghi nhận để ngày nào multi-parish thì không vấp — không phải bug hôm nay.

### B.5. Findings P3 — sản phẩm & governance (cập nhật)

- **Mobile UX: [IMPLEMENTED Phase A]** — `/operations` có `mobileTab: 'operations'` (routePolicy.ts:79), entry bottom-nav theo role (MobileBottomNav.tsx:45), MobileTopBar overflow tái cấu trúc (:203 comment). FAB tạo mới mobile đã có (:1352-1356, có test :606). **Còn mở:** Phase B (mobile IA bên trong page — theo `OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md`).
- **Offline nghèo nàn có chủ ý — [COMMUNICATED]**: banner offline giờ liệt kê trung thực những gì không có offline (operationsViewHelpers.ts:24-43 — "Bản offline chỉ gồm danh sách sự kiện và việc đã lưu — không có hộp nhắc, lời mời nhận việc, hay quyền tạo/sửa"). Richer offline vẫn cần ADR mới (rule 8) — không đổi.
- **Benchmark: [UNCHANGED]** — không baseline persist, không gate, không CI. Kết quả textual duy nhất trong plan doc (§18: event p50 11.34/p95 13.43ms; tasks p50 71.28/p95 78.12ms; readiness p50 29.92/p95 32.49ms @ 250 events/1000 tasks, synthetic-local). **Lưu ý:** các số này đo **trước** two-phase read refactor — cần đo lại nếu dùng làm baseline so sánh (nguyên tắc quantitative-targets: measurement comparability).
- **i18n: [UNCHANGED]** — hard-code VI (giới hạn portability, không phải drift cục bộ).
- **Open gates ADR-110 (giữ nguyên):** preflight `db:audit:operations-authority` trước prod upgrade (migration 20260912-259 backfill deputy/secretary theo exact-match title, abort nếu overlap — migrations.ts:2347-2356 comment yêu cầu rõ preflight); `OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS` vẫn trống trong `.env.example:59` (maintenance off — có ý nghĩa: policy-gated, chỉ set sau khi data-retention owner duyện; DEPLOYMENT_GUIDE.md:76 ghi rõ hợp đồng này); pilot acceptance thiết bị thật chưa có bằng chứng.

---

## PHẦN C — ĐỀ XUẤT CẢI THIỆN (hiệu chỉnh lượt 3 theo hiện trạng còn lại)

> Nguyên tắc giữ nguyên: mọi tối ưu hiệu năng phải đo trước/sau bằng `npm run benchmark:operations` (profile chuẩn + profile 10x) — không claim cải thiện bằng suy đoán. Đánh số lại theo nhóm việc còn lại.

### C.1. Nhóm A — Quick wins còn lại (rủi ro thấp, D0-D1)

| # | Việc | Fix cụ thể | Ảnh hưởng |
|---|---|---|---|
| A1' | Pin soft assertion cuối (A10) | `operations.test.ts:1790` `.not.toBe(200)` → `toBe(403)` | Hết assertion mềm |
| A2' | `/blockouts/mine` ép ACTIVE — **[DONE lượt 4]** | Đã thêm `serviceStatus='ACTIVE'` vào cả 3 chỗ resolve person-link (`/mine`, PUT, revoke); ownership 404-check giữ nguyên | Nhất quán với `/tasks`; self-data only |
| A3' | 5 panel còn lại dùng `operationsErrorText` — **[DONE lượt 4]** | EventReminderForm, EventRetrospectivePanel, EventTemplatesPanel, TaskRestorePanel (catch path), TaskApprovalQueue (+ TaskCommentsPanel mới) | Thông điệp lỗi nhất quán toàn feature |
| A4' | Tách `EVENT_TYPE_OPTIONS` + `isTaskScheduleInvalid` dùng chung — **[DONE lượt 4]** | Const + hàm vào `operationsViewHelpers.ts`; CreateEventForm/EditForm dùng chung options; EventTaskForm + OperationsPage delegate predicate | Hết copy-paste drift |
| A5' | Menu "+ Tạo mới" keyboard — **[DONE lượt 4]** | Escape (đóng + refocus nút trigger) + outside-pointerdown + ArrowUp/Down/Home/End roving focus ở dropdown desktop; mobile sheet giữ nguyên nhờ ModalShell; có test P1-A5 | WCAG menu pattern |
| A6' | **(Hiệu chỉnh lượt 3)** Bỏ row-level interactivity — **[DONE lượt 4]** | Đã xóa `tabIndex`/`onKeyDown`/`focus-ring` khỏi article; giữ `onClick` pointer + nút "Xem chi tiết" (`stopPropagation`) cho keyboard/AT; test keyboard viết lại theo hướng này | Hết duplicate keyboard path, không nested-interactive |
| A7' | 2 empty state còn lại — **[DONE lượt 4]** | TaskCommentsPanel (kế thừa TaskReviewPanel đã xóa), TaskChecklistSection → `<EmptyState>` | Hết vi phạm invariant DS |
| A8' | Quyết định `operations.audit.view` — **[DONE lượt 4]** | Đã xóa khỏi capability type, mọi role-set và permissions map (0 reference trong `server/src`); đọc audit đi qua `auditLogsRouter` admin-only riêng; không đụng `audit()` writes | Governance sạch, permission matrix không nói dối |

### C.2. Nhóm B — Cấu trúc (D2, có benchmark kèm theo)

- **B1'. List endpoint phase-1 keyset batching (tiếp P0-1 phần còn lại):** phase 1 narrow-read giờ trả toàn parish; khi per-row auth cần nhiều hơn 1 trang, fetch theo batch 500 con trỏ (`startsAt <` cursor) thay vì một query lớn; cần quyết định contract `meta.total` (count() song song giữ total chính xác cho đến khi keyset vượt batch đầu). **Bắt buộc đo trước/sau** vì two-phase đã thay đổi baseline (số §18 cũ không còn so sánh được).
- **B2'. Decompose tiếp OperationsPage (P0-3 phần còn lại):** tách EventList, MyTaskBoard, KpiStrip, UtilityTabs thành component con (page còn 2.119 dòng, ~19 useState); state form transition/cancel/rewind gom thành hook `useEventTransitionFlow`. Test 38-test hiện hành + form test làm lưới an toàn.
- **B3'. Checklist item OCC — [DONE lượt 4]** (đã áp dụng đúng phương án nhanh: WHERE guard + 409; phương án cột version riêng bỏ hẳn vì lý do duy nhất của nó — invalidation chính xác — đã biến mất cùng approval workflow).
- **B4'. GET id qua Zod:** `/permissions|/reminders|/workstreams/:id|/tasks/:id|/events/:id` nhận `zValidator('param', …)` trả 400 cho id rác — đối xứng validate.
- **B5'. Promise-all-on-tx còn lại:** tuần tự hóa hoặc tách `db` ngoài tx cho các write path (:2034, :2145, :2451, :2502, :2577, :2637) — ưu tiên chỗ nào semantic cần read-after-write trong cùng snapshot; giữ nguyên nếu các statement độc lập.
- **B6'. Dedupe reminder theo khoảng thời gian:** xác nhận ý định sản phẩm — TASK_DUE/OVERDUE dedupe theo bucket (ví dụ cùng task+recipient+ngày) hay giữ exact-instant; nếu đổi, cần quyết định cho dữ liệu cũ hoặc chỉ áp dụng reminder mới.

### C.3. Nhóm C — Documentation & governance (đã khép phần lớn ở lượt remediation; còn)

1. ~~07_DATABASE_PLAN / 02_ARCHITECTURE / inventory count~~ — **DONE** (75/73 đồng nhất).
2. ~~08_E2E_TESTING_STRATEGY Operations~~ — **DONE** (:46).
3. ~~API contract §25 4 route + reminder kinds + creation-options + candidates semantics~~ — **DONE**.
4. ~~ADR-110 supersede annotation~~ — **DONE** (:3761, :3763).
5. ~~AI_CONTEXT_MAP stamp~~ — **DONE** (v3.11, 2026-09-12).
6. Còn: quyết định `operations.audit.view` (trùng A8').
7. Còn: `OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS` — giữ tắt cho đến khi data-retention owner duyệt số ngày; không tự set để "bật maintenance" (đây là gate có chủ ý, không phải bug).
8. Còn: làm mới `coverage/` sau khi CI coverage chạy (D5) — hiện stale 2026-09-09, không trích số từ đó cho đến khi có run mới.

### C.4. Nhóm D — Sản phẩm/UX (cần quyết định product)

- **D1'. Operations Mobile Phase B:** thực hiện IA mobile bên trong page theo `OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md` (Phase A discoverability đã xong ở lượt này).
- **D2'. Offline:** giữ lean cache có chủ ý; nếu cần reminders offline → ADR mới.
- **D3'. Reminder UX — [DONE phần cảnh báo; còn hiển thị ENQUEUED/SENT/FAILED]:** cảnh báo gần-trùng khi draft rơi trong ±60 phút của một PENDING cùng recipient (EventReminderForm, advisory không chặn, có test "D3: warns…"); hiển thị trạng thái ENQUEUED/SENT/FAILED vẫn mở.
- **D4'. Benchmark baseline:** lưu kết quả ra file kèm điều kiện đo + **re-measure sau two-phase read** (số hiện hành không còn làm baseline được); CI gate tùy chọn (nightly).
- **D5'. Coverage refresh:** chạy `test:coverage` một lượt sau khi merge để thay thế footer 2026-09-09.

### C.5. Thứ tự thực hiện đề xuất (hiệu chỉnh lượt 3)

```
Sprint 1  : B3'-quick checklist OCC (3 dòng, đầu tiên) + A1' pin assertion + A8' xóa capability chết
            + A5' menu keyboard + A7' empty states + A4' tách const + A6'-revised (bỏ row-interactive)
            + A3' (rảnh thì làm)
Hoãn (lý do): B1' — chưa có số đo sau two-phase read, mọi claim hiệu năng đều EXPECTED_UNVERIFIED;
              thêm mâu thuẫn contract meta.total chưa quyết
              B2' — decompose tiếp chưa có lợi đúng đắn (file vừa phình lại 2.119→2.120);
              lưới test 38+5 hiện hành đủ an toàn
              B4' — 403-vs-400 cho id rác vẫn fail-closed, cosmetic
              B5' — INFERENCE về Turso multi-instance chưa có evidence; Promise.all reads trong tx
              đang chạy xanh, đụng vào chỉ thêm rủi ro latency
Bỏ/hạ     : A2' (hạ optional — self-data nit, không security)
Chờ product: D1' (mobile Phase B); B6' đã quyết giữ exact-instant (xem B.4); D3' còn hiển thị ENQUEUED/SENT/FAILED
Ops       : D4' re-measure sau two-phase read; D5' coverage refresh sau khi CI chạy;
             cập nhật Phần D.1 bằng evidence test đã chạy
```

*(Lượt 2 xếp B3' ở Sprint 2 — sai thứ tự: chi phí 3 dòng không đáng trì hoãn trong khi đường reachable out-of-band có thật. Lượt 2 cũng xếp B4'/B5' như việc nên làm — lượt 3 hạ xuống hoãn với lý do cụ thể ở trên.)*

---

## PHẦN D — GIỚI HẠN CỦA BÁO CÁO & RỦI RO CÒN LẠI (lượt 3)

1. **Bằng chứng thực thi (cập nhật lượt 3):** lượt 2 của auditor này thuần tĩnh (không chạy test). **Sau đó tác giả remediation báo cáo đã chạy**: 90 server tests Operations + full frontend suites + `tsc` + lint + architecture-inventory, **đều xanh** — kèm đối chiếu độc lập cấu hình kiểm chứng tính chất các suite đó: `vitest.config.ts:9-22` set JWT secret test riêng + `NODE_ENV=test` (không nạp `.env` thật), `maxWorkers: 1`, `server/src/db/index.ts:15-21` chạy bootstrap+migrations thật khi import nên server tests thực sự exercise schema contract. **Giữ ranh giới trung thực:** auditor này xác nhận cấu hình + nội dung test bằng đọc code, nhưng việc "suite đã chạy xanh" là **báo cáo của tác giả remediation**, chưa được auditor độc lập tái lập trong môi trường tách biệt — xếp loại bằng chứng "reproducible-test-evidence (self-reported green)". Batch remediation vẫn chưa commit (91 file dirty/untracked tại HEAD 274a963 2026-09-11).
2. **Rủi ro chưa đo:** hiệu năng của two-phase read chưa có số mới; các số benchmark §18 cũ (plan doc TASK_EVENT… §18: event p50 11.34/p95 13.43ms; tasks p50 71.28/p95 78.12ms; readiness p50 29.92/p95 32.49ms) đo trên implementation cũ — không dùng so sánh, không dùng làm baseline.
3. **Open gates vận hành (giữ nguyên):** preflight `db:audit:operations-authority` trước prod upgrade (dữ liệu position_code legacy, migration 20260912-259 abort khi overlap); pilot acceptance thiết bị thật; push-provider smoke; retention days policy (`OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS` giữ trống cho đến khi data-retention owner duyệt).
4. **Không có phát hiện lỗ hổng tenant-isolation/security bypass nào** trong ba lượt đọc (2 lượt của auditor này + 1 lượt second-agent đối chiếu); nhóm rủi ro đúng đắn còn lại là P0-6 (checklist OCC — reachable duy nhất qua out-of-band writer; fix 3 dòng ở Sprint 1) và các mục chất lượng/robustness P2.
5. **Trạng thái đối chiếu chéo (lượt 3):** báo cáo của second-agent được auditor này tái kiểm chứng chọn lọc theo code: **chấp nhận** A6'-revised (nested-interactive), hạ A2', nâng B3' lên Sprint 1, 2 nits mới (NEW-1/NEW-2), sửa 3 lỗi đếm (42 commands, 86 tests, 5 scheduler tests). **Không có claim nào của second-agent bị bác** — trừ một điểm không thể xác minh: "test đã chạy xanh" là self-report của tác giả remediation (xem D.1); second-agent viết "đây đều là code tôi viết/verify" nghĩa là nó chính là tác giả remediation, không phải auditor độc lập hoàn toàn — báo cáo này ghi nhận đúng trọng số đó.

---

*Audit lượt 3 (2026-09-12): lượt 2 re-audit toàn diện sau batch remediation (chưa commit); lượt 3 hiệu chỉnh theo đối chiếu độc lập của second agent — mỗi điều chỉnh đều được auditor tái kiểm chứng bằng code trước khi áp dụng (A6' revised vì nested-interactive; A2' hạ optional; B3' lên đầu Sprint 1; lỗi đếm 42/86/5 đã sửa; thêm NEW-1/NEW-2). Tất cả citations `file:line` kiểm tra trực tiếp trong working tree (dirty, pre-commit). Báo cáo giữ vị trí audit artifact độc lập, không promote thành SSOT; không sửa đổi tài liệu chuẩn nào ngoài chính file audit trong lượt này.*
