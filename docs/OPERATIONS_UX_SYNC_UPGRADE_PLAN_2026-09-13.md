# Nghiên cứu chuyên sâu UX/UI + Đồng bộ Backend trang Operations — Plan cải thiện & nâng cấp

- **Ngày:** 2026-09-13 (làm đêm 2026-09-12) · **Commit nền:** `967f067` (UI Operations không đổi so với `0560dc9`)
- **Phạm vi:** `src/pages/OperationsPage.tsx` (2.132 dòng), 17 component `src/components/operations/*`, `src/stores/operationsStore.ts` (794 dòng), `src/lib/api/operations.ts` (390 dòng, 53 hàm), `src/lib/operationsErrors.ts`, mobile shell (`MobileBottomNav`, `MobileTopBar`, `ModalShell`, `40-mobile-shell.css`, `60-view-language.css`), `server/src/routes/operations.ts` (2.814 dòng, **61 endpoint**), `server/src/services/operationsAuthorization.ts` (586 dòng), `docs/FRONTEND_API_CONTRACT.md` §25.
- **Phương pháp:** đọc mã nguồn trực tiếp 3 hướng (desktop UX / mobile UX / đối chiếu FE↔BE) + tái kiểm chứng từng finding by-line trong working tree; **không chạy runtime/device** → các mục suy luận hành vi đánh dấu *(INFERENCE)*.
- **Phân loại:** D2 (nghiên cứu/plan; không sửa code trong lượt này). Khi thực thi, các wave chạm transition/authorization là **D3**.
- **Kế thừa:** `OPERATIONS_FULL_FEATURE_AUDIT_2026-09-12.md` (lượt 4, phần lớn đã remediation + commit tại `0560dc9`) và `OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md` (Phase A–D). Tài liệu này **không lặp lại** các finding đã FIXED; tập trung vào phần **còn mở, finding mới, và kết luận đồng bộ backend**.
- **Cập nhật 2026-09-13 (sau đối chiếu chéo):** merge 5 hạng mục từ bản audit song song `OPERATIONS_UX_UI_DESKTOP_MOBILE_BACKEND_SYNC_AUDIT_2026-09-12.md` (orphan checklist → W1.7; standalone/TZ → W2.11; dời giờ inbox có gate → W2.12; server-side search → W2.13; overflow menu task → W3.8). Toàn bộ đánh giá chéo: `OPERATIONS_AUDIT_CROSSCHECK_B_VS_A_2026-09-13.md`.

---

## PHẦN 1 — KẾT LUẬN ĐIỀU HÀNH (Executive summary)

1. **Đồng bộ frontend ↔ backend: TỐT ~90%, không có lỗi chết (P0/P1).**
   - 0 endpoint "ma" (client gọi route không tồn tại); **100% khớp idempotency 2 chiều** (mọi `command()` gửi `Idempotency-Key`, mọi 40 POST/PUT server bọc `runIdempotentOperationsCommand`); OCC + `handleConflictSync` chính xác; client gate bằng **đúng 18 key capability của server**, không hardcode role; pagination khớp (`limit ≤ 500`, default 50); doc §25 spot-check 7 bundle đều khớp code.
   - Khoảng trống thật sự: **8 endpoint backend không có UI** (participants/headcount, dispatch history, remove assignee, dependencies, workstream edit), **shape drift** (server trả `participants` + full-row columns, client type bỏ qua; `updateEvent` body thiếu `description/organizer/scope/expectedHeadcount`), **error contract** (409 không code bị gom về `CONFLICT` làm mất message tiếng Việt của server), và **freshness gap** (không poll/push trên trang).
2. **Mobile: Phase A + B của plan 2026-09-12 đã HOÀN THÀNH thật trong code** (bottom-nav, stack Inbox→Việc→Sự kiện, bottom-sheet, fullscreen create, banner trung thực, chip 44px). Phần còn mở là **Phase C/D** + 4 finding mobile mới (FAB lệch primitive, stepper squeeze, badge đếm chờ, KPI→filter không scroll).
3. **Desktop: 4 lỗi P1 thật** (khớp code, không phải suy diễn):
   - **X2:** người có quyền `override_readiness` bị **chính client khóa đường vào** modal override của họ (nút forward `disabled` khi blockers > 0, trong khi modal override chỉ mở khi server trả `READINESS_BLOCKED` — mà không bao giờ được gọi).
   - **X1:** dòng nhắc việc trong inbox **không cho biết nhắc việc gì** (không title event/task, không link mở), dù `reminder.taskId/eventId` có sẵn trong data.
   - **C1:** 3/4 KPI card là **bộ lọc chính cấp trang nhưng không thao tác được bằng bàn phím** (`Surface onClick`, không button/role/tabIndex) — vi phạm WCAG 2.1.1.
   - **G1:** `SmartEventTimePicker` đặt `<button role="switch">` **bên trong** `div role="button" tabIndex={0}` có `onKeyDown` → nested-interactive; Enter/Space trên switch có khả năng toggle 2 lần *(INFERENCE — cần verify browser)*.
4. **Nợ sản phẩm lớn nhất:** sự kiện không có **mô tả / dự kiến số người / đổi Organizer sau tạo** trên UI dù server hỗ trợ đủ trong `eventCreateSchema`/`eventUpdateSchema` (server:131–168) — người dùng không có lối đi, và doc §25 L817 đã mô tả flow đổi organizer/scope.

**Đánh giá tổng:** trang Operations đã ở mức "an toàn về hợp đồng dữ liệu" (idempotency/OCC/tenant/permission mirror chuẩn); độ lệch nằm ở **tầng trải nghiệm** (lối vào override, ngữ cảnh reminder, validation im lặng, desktop-first modal 1040px quá tải) và **tầng tính năng backend-có-UI-chưa** (participants, dependencies, dispatch status, workstream edit). Plan dưới đây xếp 4 wave theo impact ÷ effort.

---

## PHẦN 2 — KẾT QUẢ NGHIÊN CỨU

### 2.1 Hiện trạng kiến trúc (tái xác nhận nhanh)

```
operationsApi (53 hàm; mọi command gắn Idempotency-Key)
  → useOperationsStore (794 dòng; 5 list fetch song song; pageMeta validate; cache Dexie 1 key; abort + generation guard)
    → OperationsPage (2.132 dòng; ~34 useState + 3 useRef; selector hẹp ~24 slice)
      ├─ desktop: KPI → grid 2 cột [Events | Việc của tôi] → Inbox → Utilities
      └─ mobile:  Inbox → Việc của tôi → Events → KPI → Utilities (collapsed "Mở tiện ích")
```
Không optimistic UI; offline = cache read-only + khóa mutation (`canMutate = isOnline && source==='server'` :285). Đúng ADR-110.

### 2.2 Bảng VERIFY Phase A–D mobile (plan 2026-09-12 → code hiện tại)

| Hạng | Trạng thái | Bằng chứng |
|---|---|---|
| A1 bottom-nav `mobileTab:'operations'` | ✅ DONE | routePolicy.ts:79; MobileBottomNav.tsx:45 (org tab "Công Việc" theo role) |
| A2 prefetch tab org | ✅ DONE | routePolicy.ts:171 `MOBILE_ORG_PRIMARY_TABS`; useMobileRoutePreload + `preloadTab` onPointerDown (MobileBottomNav:78) |
| A3 title MobileTopBar | ✅ DONE (pending-count tùy chọn: CHƯA) | MobileTopBar.tsx:69 `mobileTitle` |
| A4 deep-link `sourceParishEventId` | ✅ RESOLVED (xóa contract chết) | audit 09-12 P0-5 |
| B1 stack my-work-first | ✅ DONE | OperationsPage.tsx:1375–1382 (Inbox→Việc→Events→KPI→Utilities) |
| B2 event detail bottom-sheet + sticky actions | ✅ DONE | :1399 `mobileDisplay="bottom-sheet"`; ModalShell grabber :82–90, footer safe-area :134–138 |
| B3 create fullscreen sheet | ✅ DONE | :1264/:1281 `mobileDisplay="fullscreen"`; menu tạo mới = sheet :1292–1363 |
| B4 banner offline trung thực | ✅ DONE | operationsViewHelpers.ts:44–63 |
| B5 chips 44px + aria-pressed | ✅ DONE | :911, :1796 (`min-h-[44px] sm:min-h-0` + comment giải trình :902–904) |
| C4 per-control busy | ⚠️ MỘT NỬA | page đúng (busyTask/busyInbox :165–174) nhưng **5 panel tiện ích khóa busy cả panel** (AvailabilityPanel:48, StandaloneWorkstreamsPanel:105, EventTemplatesPanel:131, WorkstreamPanel:69, EventReminderForm:79) |
| C1 viewport matrix / C2 dark spot-check / C3 zoom | ❌ CHƯA (gate thiết bị thật, kéo dài từ FUX-06) | — |
| D1 tách monolith | ⚠️ Một nửa (2.399→2.132; section lớn chưa tách) | — |
| D2 `MobileOperationsView` riêng | ❌ CHƯA — và theo phát hiện dưới đây, **chưa cần** | src/components/mobile/* không có file Operations nào |

### 2.3 Findings DESKTOP (mã OPS-U-xx)

| ID | Sev | Finding | Bằng chứng | Hệ quả |
|---|---|---|---|---|
| U-01 | **P1** | Override Readiness bị chính client chặn: nút forward `disabled` khi `readiness.blockers.length>0` (:1446–1448) trong khi modal override chỉ mở qua error `READINESS_BLOCKED` của server (:636–639, :2053–2085); hint :1583 khẳng định "phải xử lý hết điểm chặn" | OperationsPage.tsx | Người giữ `operations.event.override_readiness` mất lối đi nghiệp vụ đã thiết kế (server cho override có lý do + audit) |
| U-02 | **P1** | Dòng reminder không cho biết nhắc gì: chỉ kind+triggerAt+status (:1097–1102) dù `OperationReminder.taskId/eventId` có trong data (api :196–197) | OperationsPage.tsx | Inbox vô nghĩa khi >3 dòng; desktop lẫn mobile phải đoán/mở từng event |
| U-03 | **P1** | KPI cards (:700–728) là `Surface onClick`, không role/tabIndex/aria-pressed; card "Sự kiện" không filterKey → hành vi không đồng nhất | OperationsPage.tsx | Vi phạm WCAG 2.1.1 cho bộ lọc chính cấp trang |
| U-04 | **P1** | TimePicker: `div role="button" tabIndex=0 onKeyDown` bọc ngoài `button role="switch"` (:365–397, :410–442) → nested-interactive + Enter/Space toggle 2 lần *(INFERENCE)*; lỗi a11y pattern APG | SmartEventTimePicker.tsx | Bàn phím/AT không điều khiển được switch; mọi form tạo/sửa event |
| U-05 | **P2** | Sự kiện không có trường **mô tả**, **dự kiến số người (expectedHeadcount)**, không đổi được **Organizer/scope** sau tạo: client body thiếu (api :368–369) so server schema đủ (:131–168); doc §25 L817 mô tả flow đổi organizer | CreateEventForm.tsx:59–70, EventEditForm.tsx:52–61 | Nghiệp vụ có, UI không có; doc-vs-UI drift |
| U-06 | **P2** | Task không bao giờ vào `IN_PROGRESS` từ UI: handler hỗ trợ (:496,:505) nhưng cluster nút (:989–1046) không render nút nào; `BACKLOG` có label (:67) không có action về TODO | OperationsPage.tsx | Trạng thái trung gian chết; tiến độ sự kiện méo |
| U-07 | **P2** | Không deep-link: event modal/tab chỉ nằm trong zustand (:1395, :400–431); F5/back mất modal, không share link, tab reset về 'tasks' | OperationsPage.tsx | Workflow 2 người ("mở link cho tôi duyệt") không có |
| U-08 | **P2** | Create/Edit event: submit disabled tới khi hợp lệ nhưng **không có lỗi per-field** (:147; lỗi chỉ ra sau server reject :78) — ngược hẳn SmartEventTimePicker (validation inline tốt, :539+660+) | CreateEventForm.tsx, EventEditForm.tsx:113 | "Nút chết không lý do" |
| U-09 | **P2** | Dispatch: (a) manager không có view trạng thái lượt mời (ai primary/reserve, còn hạn, hủy) — `GET /tasks/:id/dispatches` không có client fn (server :2480); (b) inbox cap **100 im lặng** — store validate meta dispatch rồi bỏ (:265) | OperationsPage.tsx:878–900 | Người giao không biết mời đến đâu; lời mời 101+ vô hình |
| U-10 | **P2** | "Tải thêm" không loading state riêng + không "x/total" (:852–858,:1053–1059,:1125–1131 chỉ disable theo `loading` global) | OperationsPage.tsx | Không phân biệt được load trang vs refetch; mặc định 50/item |
| U-11 | **P2** | 5 panel tiện ích dùng **một cờ busy khóa cả panel** (U bảng 2.2 C4) | AvailabilityPanel:48 v.v. | Mở 2 form một tab → gõ form A bị khóa khi lệnh form B chạy |
| U-12 | **P2** | O(n²): đếm assignees từng task ngay trong `.map` (:1834 `selectedEvent.assignees.filter`); `myTaskFilterOptions`/sublabel filter per-render (:411–417,:465); search state đặt ở page → gõ 1 ký tự re-render cả cây (:756; 3 panel lazy nhưng không memo) | OperationsPage.tsx | Modal 50 task × 50 assignee = 2.500 phép lọc mỗi render |
| U-13 | **P2** | Templates: nút "Tạo bản nháp từ mẫu" chết im lặng tới khi bấm Xem trước (:199–200) và `setStartsAt` **tự xóa preview** (:173) → chỉnh giờ phải preview lại, không có giải thích | EventTemplatesPanel.tsx | Flow chính bị mắc kẹt bí ẩn |
| U-14 | **P2** | DS batch: (a) empty state raw `<p>` — TaskAssignForm :45–49, EventRetrospectivePanel :88 (vi phạm invariant §8.4); (b) `text-white` thay `text-text-inverse` tại :835,:913,:1369,:1798 + picker :589,:631 trong khi stepper dùng đúng token (:1519–1521) → nghi vấn contrast dark trên `#60A5FA` *(INFERENCE)*; (c) knob switch `bg-white` (:393,:438); (d) search raw `py-1.5 text-xs` ~28px bypass `.form-input` 40px (:751–758) + nút ✕ raw; (e) `Button !min-h-7 !py-0.5` override primitive (picker :673,:682); (f) tiêu đề section `text-sm font-extrabold` lệch chuẩn card `text-base font-bold` (docs/03:167) | nhiều file | Lint DS + nhất quán |
| U-15 | **P3** | Menu "+ Tạo mới" desktop (fix lượt 4 có thật: Escape :198–203, outside :195–196, roving :184–190) còn: mở không auto-focus item đầu; **Tab không đóng menu** (chỉ bắt pointerdown) → menu treo sau focus-loss; menuitem thiếu focus-visible ring; nội dung menu render đúp desktop/`:1221–1238` vs mobile sheet `:1302–1360` | OperationsPage.tsx | A11y APG residual + drift risk 2 bản code |
| U-16 | **P3** | `aria-label` lộ UUID raw ("Bắt đầu vai trò ${member.id}" WorkstreamPanel:30–32,:137; AvailabilityPanel:96–98) | components | SR đọc mã vô nghĩa |
| U-17 | **P3** | TaskCommentsPanel nút "Tải lại nhiệm vụ" (:35) — không phải no-op (vẫn chạy `refresh()` :29) nhưng **im lặng xóa nháp bình luận đang gõ** | TaskCommentsPanel.tsx | Mất nội dung đang soạn không cảnh báo |
| U-18 | **P3** | Emoji 📅⏱🗓 trong badge trạng thái picker (:458–461, `hidden md:flex` desktop-only); `<input type="hidden">` mượn `id`/`aria-label` của field thật để giữ selector test (:553–560) | SmartEventTimePicker.tsx | SR noise; test-coupling fragile |
| U-19 | **P3** | API có không UI: `acknowledgeTask/assignTask` nhận `note` (api :375,:384) — không input nào truyền; checklist không sửa/xóa/reorder mục (chỉ add+toggle, TaskChecklistSection:36–60); `eventType` không hiển thị cho người read-only; timezone hardcode máy tạo (:64) không hiển thị; `getReadiness` dead (:367) | nhiều | Tính năng dormant |

### 2.4 Findings MOBILE mới (mã OPS-MB-xx) — ngoài bảng verify

| ID | Sev | Finding | Bằng chứng | Hệ quả |
|---|---|---|---|---|
| MB-01 | **P2** | FAB dùng class thô `fixed bottom-20 right-4 ... sm:hidden` (:1369) thay primitive `.mobile-floating-action` — primitive tính `bottom: nav-total-height(75px)+safe-area+16px ≈ 91px+safe`, FAB này cố định 80px → **đè nhẹ lên bottom-nav và bỏ `safe-area-inset-right`**; vi phạm hợp đồng "shell là chủ duy nhất của bottom clearance" (comment MobileAppShell.tsx:12–18). Đồng thời khoảng 640–1023px (tablet dọc, vẫn mobile shell theo `useEffectiveMode` <1024px) FAB biến mất do `sm:hidden` | OperationsPage.tsx:1365–1374 | Overlap notch/home-indicator; thiếu quick-create trên tablet |
| MB-02 | **P2** | Lifecycle stepper 6 bước trong bottom-sheet 390px: labels `text-xs whitespace-nowrap` (~56–70px/label) × 6 ≈ 378px > thân sheet ~358px (p-4 + px-2) → tràn/cắt trên 390px, nặng hơn trên 320px *(INFERENCE — đo bằng viewport matrix C1)* | OperationsPage.tsx:1498–1541 | Flow quan trọng nhất trang vỡ bố cục trên phone |
| MB-03 | **P2** | Bottom-nav tab "Công Việc" **không có badge số việc chờ** dù `pendingResponses` (ack + dispatch) đã compute sẵn (:406–407) và KPI "Chờ phản hồi" tồn tại; người phải vào trang mới biết có việc cần phản hồi | MobileBottomNav.tsx:67–97 (không cơ chế badge nào) | Mất signal async của luồng dispatch/acceptance — đúng use-case mobile nhất |
| MB-04 | **P2** | Mobile: KPI strip nằm **dưới Events** (:1380) nhưng tap card chỉ set `myTaskFilter` (:710–712) không scroll về section "Việc của tôi" phía trên → người bấm không thấy gì thay đổi | OperationsPage.tsx:699–728 | Bộ lọc chết trên mobile |
| MB-05 | **P3** | Event modal (maxWidth 1040px, 5 tab, 2 form inline) render nguyên khối trong bottom-sheet: tab strip scroll ngang đúng chuẩn (`.view-tab <1024: flex 1, min-h 44` — 60-view-language.css:1513) nhưng footer 3–4 nút transition wrap 2 dòng trên 390px; nên compact thứ tự ưu tiên hành động | OperationsPage.tsx:1419–1471 | CTA chính (Chuyển giai đoạn) không nổi bật nhất trên mobile |
| MB-06 | **P3** | Không có pull-to-refresh; refresh = nút "Làm mới" trong PageHeader (vẫn render trên mobile, :1243) nhưng bị cuộn khuất; kết hợp OPS-SYNC-01 → người mobile ít khi biết dữ liệu cũ | OperationsPage.tsx | Dữ liệu stale trên thiết bị di động |

### 2.5 Đồng bộ FE ↔ BE (mã OPS-SYNC-xx) — kết quả đối chiếu 61 endpoint

**A. Endpoint matrix (61/61 đã đối):**

- **52** server + client + UI dùng. **1** dead: `GET /events/:id/readiness` (client có hàm, không call site — readiness đã embed trong detail).
- **8** server-có-không-client: `GET /events/public-summary` (calendar-facing, chấp nhận được) và **7 gap sản phẩm**: `GET /tasks/:id/dispatches` (→U-09), `POST /tasks/:id/assignments/:assignmentId/remove` (**không gỡ được assignee** — capability `operations.task.reassign` server đã có, UI không lối gọi), `POST /tasks/:id/dependencies` (readiness blocker `TASK_DEPENDENCY_BLOCKED` server phát ra (:865) nhưng UI không tạo/xem được dependency), `POST /events/:id/participants`, `POST .../participants/:id/status`, `GET /events/:id/headcount` (bộ ba participant/headcount vô hình với UI), `PUT /workstreams/:id` (không sửa được tên/mô tả/isRequired nhóm).
- **0** client-gọi-endpoint-không-tồn-tại → không P0.

**B. Shape drift:**

| ID | Sev | Drift | Bằng chứng |
|---|---|---|---|
| S-01 | P2 | `GET /events/:id` trả `participants[]`; `OperationEventDetail` không khai báo → data bị bỏ rơi giữa đường | server :1434 vs api :269–279 |
| S-02 | P2 | `GET /events`/`GET /tasks` trả **full row** (`parentTaskId/startedAt/completedAt/completionNote/completedBy/updatedBy/createdAt`…); client type thiếu hết → UI không hiển thị được "ai giao/hoàn thành lúc nào" | :1285/:2257 vs api :48–96; `OperationTaskDetail.dependencies: unknown[]` (:184) trong khi server trả row thật (:2367) |
| S-03 | P3 | `OperationWorkstream` thiếu `description/blockedReason` → nhóm BLOCKED không hiển thị được lý do chặn trên list | api :220–229 vs server :2187 |
| S-05 | P2 | `updateEvent` body thiếu `description/expectedHeadcount/organizer*/scope*` (xem U-05) | api :369 vs schema :150–168 |

**C. Error contract:**

| ID | Sev | Lệch | Bằng chứng |
|---|---|---|---|
| E-01 | **P2** | Mọi 409/400 **không code** của server bị `handleError` gắn `CONFLICT`/`VALIDATION_ERROR` (:298–300); `operationsErrorText` ưu tiên map theo code → **message tiếng Việt tuyệt đối của server bị đè bằng text chung** ("Dữ liệu bị trùng lặp…" thay vì "Không thể chuyển task từ X sang Y."). Vị dụ: transition cấm :2748, dependency chưa DONE :2753, checklist bắt buộc :2755, reminder không PENDING :1805/:1853, handover trùng người :2601 | operationsErrors.ts:71/:76 vs routes |
| E-02 | P3 | `EVENT_TRANSITION_NOT_ADJACENT` (:1554–1557, FSM domain :10) thiếu trong map; fallback hiện vẫn ổn vì message VI có sẵn | operationsErrors.ts |

**D–G. Đã kiểm chứng ĐỒNG BỘ TỐT:** authz mirror (18 capability key server dùng nguyên văn, không hardcode role, không nút nào hiện cho role sẽ-bị-403; gate toàn cục `permissions['operations.event.publish_public']` ở catalog là nguồn thứ hai — server vẫn re-check, chỉ là nit P3); pagination (`listPagination` 1..500 default 50 ↔ `pageMeta` validate y hệt, `meta.total` = post-auth count được client tin đúng nguồn); idempotency 2 chiều 100%; OCC (`isOccConflict` phân biệt `VERSION_CONFLICT/MISMATCH`, `handleConflictSync` loại trừ đúng 3 code dialog-chuyên-dụng khớp server :1616–1618).

| ID | Sev | Gap đồng bộ còn lại |
|---|---|---|
| **SYNC-01** | **P2** | **Freshness gap không xác định**: không poll/SSE cho Operations; chỉ refresh on-mount (:388), nút tay (:1243), online↔cache (:396–398), fetch sau accept dispatch (store :609). Actor thiết bị khác mutate → UI này không biết tới khi user tự reload. Server đã có nền notification (web_push qua `notifications` cho dispatch invitation + public event) nhưng trang không subscribe |

---

## PHẦN 3 — PLAN CẢI THIỆN & NÂNG CẤP

### Nguyên tắc bất biến khi thực thi (từ AGENTS.md + ADR-110)
1. Không optimistic mutation offline; không mở rộng cache offline khi chưa có ADR mới.
2. UI ẩn nút ≠ authorization — mọi thay đổi gate phải giữ server re-check; không "mở khóa client" cho các gate 403 thật.
3. Mọi dialog mới tiếp tục `ModalShell`; mọi empty state mới dùng `EmptyState`; nút chuẩn 40px, touch ≥44px mobile; title theo invariant.
4. Không đụng offline-sync engine (Operations chủ ý nằm ngoài nó).
5. Mở endpoint nhóm (3) nào phải chốt BUSINESS_RULES §31/ADR trước (truth model AGENTS §5): **participant/headcount có phải phạm vi Operations không hay chỉ là plumbing lịch xứ** — nếu là plumbing, đóng bằng cách xóa route khỏi SSOT chứ không build UI.

### WAVE 1 — P1 nghiệp vụ & a11y (D2, ~2–3 ngày, effort thấp/impact cao)

| # | Việc | Cách làm | Done khi |
|---|---|---|---|
| W1.1 | **U-01 Mở khóa override readiness** | Nút forward **không** disabled khi blockers>0 nếu `selectedEvent.permissions['operations.event.override_readiness']` — cho gọi server để nhận `READINESS_BLOCKED` → modal override dẫn đường như đã thiết kế; hint :1583 đổi theo permission; người không có quyền giữ nguyên hành vi | Test: holder có override bấm "Đánh dấu sẵn sàng" → modal override mở; non-holder vẫn thấy nút disabled |
| W1.2 | **U-02 Inbox reminder có ngữ cảnh + link** | Store join `events/tasks` đã có trong state để render `title` event/task của reminder (`taskId/eventId` sẵn trong row); bấm dòng → `selectTask(id)`/`selectEvent(id)` (link sự kiện) | Test: reminder TASK_DUE hiện tên task + bấm mở checklist |
| W1.3 | **U-03 KPI cards keyboard** | `Surface onClick` → `Surface as="button"` hoặc `<button>` bọc trong, `aria-pressed` theo filterKey, giữ visual; card "Sự kiện" hoặc bỏ cursor-pointer hoặc cho filter 'ALL'; thêm MB-04: tap card scrollIntoView `#my-tasks` | Test: Enter/Space đổi filter; `focus-visible` ring |
| W1.4 | **U-04 TimePicker switch refactor** | Bỏ wrapper `role="button" tabIndex onKeyDown`; một control duy nhất `role="switch"` + `<label htmlFor>` assoc; giữ hành vi click-vùng-chữ bằng `onClick` trên label (label không tabindex, không nested-interactive) | Test keyboard: Enter/Space toggle đúng 1 lần; APG pass |
| W1.5 | **E-01 Message server không bị đè** | `formatStoreError`: khi code ∈ {`CONFLICT`,`VALIDATION_ERROR`} generic **và** `err.message` có nội dung → trả message server (đã là VI tuyệt đối), không tra map; map chỉ thắng khi code đặc thù Operations. Cộng E-02: map thêm `EVENT_TRANSITION_NOT_ADJACENT` | Test: transition cấm → toast "Không thể chuyển task từ …" đúng message server |
| W1.6 | **U-06 Nút "Bắt đầu làm"** | Thêm `Button` IN_PROGRESS trong cluster (:989–1046) khi `canExecute && task.status==='TODO'`; cân nhắc label/`tone` để khỏi tranh CTA "Hoàn tất" | Test: TODO→IN_PROGRESS qua UI; readiness/KPI "Đang làm" nhảy đúng |
| W1.7 | **Orphan `TaskChecklistSection` (merge từ audit đối chiếu B, §F0/M0)** | Click "Chi tiết nhiệm vụ" (:990–997) hiện render checklist/comments/handover **đáy trang sau cả Tiện ích** (`:1942 {!selectedEvent && <TaskChecklistSection />}` + null-guard TaskChecklistSection:34), desktop lẫn mobile không auto-scroll → thay bằng `TaskDetailModal` (slide-over desktop 640px / bottom-sheet mobile) gom checklist + comments + handover + restore; **xóa render đáy trang**; cập nhật test `OperationsPage.test.tsx:71` thành "click Chi tiết → modal mở" | P1 (bug thật, test pin hành vi hiện tại :71); D1; **E2E @critical #8 đang pin rendering inline qua `getByLabel('Mục checklist mới')` (e2e/operations.spec.ts:643–652) → phải cập nhật spec khi chuyển vào modal**; mọi dialog vẫn dùng ModalShell |

### WAVE 2 — P2 đồng bộ tính năng backend ↔ UI (D2/D3, ~4–6 ngày)

| # | Việc | Cách làm | Ghi chú rủi ro |
|---|---|---|---|
| W2.1 | **U-05/S-05 Sự kiện: mô tả + expectedHeadcount + đổi Organizer** | Thêm trường vào `CreateEventForm`/`EventEditForm` (description textarea, số người dự kiến), mở rộng body `createEvent/updateEvent` trong api; Organizer: chỉ hiện select khi `permissions['operations.event.manage']` + status còn cho phép (server enforce organizer rule — chọn sai sẽ bị 400 đã map sẵn `ORGANIZER_*`) | D3 nhẹ (lifecycle gate giữ nguyên server); test create/update với organizer đổi |
| W2.2 | **U-07 Deep-link** | `?event=<id>&tab=<tab>` qua TanStack `validateSearch` + `searchParams` trong `selectEvent` effect; F5/back mở đúng modal; tab survive reload; mobile sheet cùng URL state | P0-5 cũ xóa `sourceParishEventId` — lần này là event-id Operations thuần, không đụng calendar contract |
| W2.3 | **U-09 Dispatch status view + hasMore** | (a) Client fn `getTaskDispatches(taskId)` gọi `GET /tasks/:id/dispatches` (server có sẵn :2480) — panel "Lượt mời" trong modal task/event: primary/reserve, trạng thái, `acknowledgeBy`, nút hủy reuse cancel? (server chưa có dispatch-cancel command → **chỉ view, không hủy**); (b) store giữ meta phân trang dispatch + nút "Tải thêm" khi `total>100` | Chỉ đọc (GET) — không mở mutation mới; nếu cần hủy dispatch → D3, tách ticket riêng |
| W2.4 | **Remove assignee** | Client fn `POST /tasks/:id/assignments/:assignmentId/remove` (reason bắt buộc — ModalShell + stable key như removeWorkstreamMember); gate `operations.task.reassign` đã mirror sẵn | D3 (mutation mới trong vùng phân quyền); idempotency key theo hook chuẩn |
| W2.5 | **U-11/S-03 Workstream edit + hiện blockedReason/description** | Wire `PUT /workstreams/:id` (đổi tên/mô tả/isRequired, reason + OCC); list WorkstreamPanel hiển `blockedReason` (thêm vào type client theo S-03) | D2; server đã enforce LIVE lead-via-replace |
| W2.6 | **U-13 Templates hết mắc kẹt** | Preview tự invalid thay vì xóa khi đổi giờ: giữ preview cũ + banner "preview lệch giờ — Xem lại" (button bật khi preview khớp); disabled có `title`/hint lý do; message panel tách tone `success`/`danger` (`text-parish-danger`) | D1 |
| W2.7 | **U-08 Validation per-field** | CreateEventForm/EventEditForm/StandaloneTaskForm: lỗi inline dưới từng field (`endsAt<=startsAt`, thiếu organizer, thiếu unit) thay vì chỉ disabled | D1 |
| W2.8 | **MB-01 FAB về primitive** | Đổi sang `.mobile-floating-action` (+ `mobile-touch-target`), bỏ `bottom-20 right-4 sm:hidden`; kiểm tra hệ quả tablet 640–1023px (primitive không có `sm:hidden`) — chủ đích cho tablet có FAB hay không, chốt với product | D0-D1, có test FAB hiện tại (:622) cập nhật selector |
| W2.9 | **U-10 pagination indicator** | "Đang xem {loaded}/{total}" trên 3 list; spinner riêng nút "Tải thêm" (local busy, không dùng `loading` global) | D1 |
| W2.10 | **MB-03 badge chờ trên bottom-nav** | Tab `operations` nhận `badgeCount` (pendingResponses từ store — chọn selector global qua hook riêng để tránh re-render nav); hiển dot/số ≤99; ẩn khi offline/cache | Cần thêm prop từ RootLayout → MobileAppShell → nav (chuỗi props đã có sẵn `activeTab`); giữ `aria-label` + `aria-describedby` đếm được |
| W2.11 | **Merge audit B §3.3:** standalone đủ fields + parish TZ | `createStandaloneTask` (store :501) gửi đủ `phase/priority/scheduled*/isRequired` (server hỗ trợ sẵn, schema :192–196); CreateEventForm/EventTemplatesPanel default timezone = parish TZ + label "Giờ Xứ đoàn" khi browser TZ ≠ parish; hiển giờ kèm chỉ báo TZ ở detail |
| W2.12 | **Merge audit B G6:** "Dời giờ" inbox — **có gate permission** | Nút `Dời giờ` trên dòng inbox reuse `rescheduleReminder` (api :343) **chỉ khi** caller có `permissions['operations.task.assign'/'operations.event.manage']` của resource reminder (server assert :1804 KHÔNG có self-exemption — recipient thường bấm sẽ 403; cancel thì CÓ self-exemption :1852 nên vẫn an toàn cho recipient) |
| W2.13 | **Merge audit B Phase 3:** server-side search events | `GET /events` thêm `q/status/scope` pushdown SQL (two-phase read giữ nguyên total post-auth); client search debounce 300ms, fallback filter client khi cache-mode |

### WAVE 3 — P2/P3 chất lượng & hiệu năng (D1–D2, ~3–5 ngày, làm song song/rải)

| # | Việc |
|---|---|
| W3.1 | **U-12 Perf:** `assigneesByTask = Map` tiền tính (useMemo) thay `.filter` trong map (:1834); memo 3 section lists (KpiStrip/EventsList/MyTasksList) hoặc đẩy `eventSearchQuery` xuống component section Events; `myTaskFilterOptions`/sublabel vào useMemo |
| W3.2 | **D1 (page cũ) B2':** tách `useEventTransitionFlow` hook (transition/cancel/rewind/override state 11 useState gom lại) + `EventList`/`MyTaskBoard` components — target page <1.400 dòng; lưới an toàn 38+5+33 test hiện hành |
| W3.3 | **Menu dùng chung (U-15):** trích `CreateMenuItems` render 1 lần cho cả desktop dropdown + mobile sheet; thêm focus-out (Tab rời) → đóng; auto-focus item đầu khi mở; focus-visible ring menuitem |
| W3.4 | **U-14 batch DS:** EmptyState thay 2 raw `<p>`; `text-white`→`text-text-inverse` (4+2 điểm); knob `bg-white`→`bg-surface-card`; search input→`TextInput` chuẩn 40px; bỏ `!min-h-7` (tăng compact tier `.btn` nếu cần); section title `text-base font-bold` |
| W3.5 | **U-16/U-17/U-18:** aria-label dùng displayName thay UUID (đổi chữ ký component nhận `memberLabel`); nút "Tải lại" comment: giữ nháp, chỉ reload (tách `refresh()` khỏi success-path no-op) hoặc đổi nhãn; bỏ emoji badge → `aria-hidden` icon hoặc text thuần; hidden input bỏ `aria-label` mượn id |
| W3.6 | **MB-02 viewport matrix gate (C1):** Playwright/Vitest layout contract 320/375/390/768 cho `/operations` — đặc biệt stepper: nếu đo thấy tràn, đổi label 6 bước → 2 dòng trên mobile (label nhỏ hơn/abbr) hoặc stepper dọc; **MB-05** footer transition: nút primary full-width + phần còn lại row 2 trên <sm; **MB-06** pull-to-refresh: thêm `overscroll` action hoặc interval poll nhẹ khi tab active (quyết định ở W4.2) |
| W3.7 | **C4 nốt:** per-control busy cho 5 panel tiện ích (pattern `Set<string>` như page) — ưu tiên EventTemplatesPanel & StandaloneWorkstreamsPanel (nhiều nút nhất) |
| W3.8 | **Merge audit B F2:** action cluster task card — giữ `Hoàn tất` + `Chi tiết` (và `Nhận việc` khi pending), gom `Báo chặn/Hủy/Bàn giao/Từ chối` vào `...` overflow menu (role=menu, keyboard pattern như create menu —复用 W3.3); lưu ý `canExecute` vs `hasPending` loại trừ nhau nên hiếm khi đủ 6 nút (đính chính đúng của B) |

### W4 — Quyết định sản phẩm/nền tảng (cần chốt trước khi code, không tự làm)

| # | Vấn đề | Phương án | Khuyến nghị | Quyết định |
|---|---|---|---|---|
| W4.1 | **SYNC-01 freshness:** poll bao lâu / reuse notification | (a) poll `fetch()` khi document visible mỗi 60–120s; (b) chỉ hiển "dữ liệu lúc HH:MM + Làm mới"; (c) subscribe `notifications` đã tồn tại để refetch targeted | (a) là tối thiểu an toàn với ADR-110 online-first (read-only, không mutation); (c) ticket riêng vì đụng module notifications | **✅ CHỐT 2026-09-15: (a)** — poll read-only 90s khi tab visible + online; (c) để ticket riêng. |
| W4.2 | **Participants/headcount/dependencies** | Build UI đầy đủ vs xác nhận plumbing-only | Đối chiếu BUSINESS_RULES §31 + ADR-110 trước; nếu build: participants = tab 6 trong event modal (thêm/xóa/đổi trạng thái + headcount chip). **Dependencies có cửa một chiều**: verify vòng 2 cho thấy server CHỈ có `POST /tasks/:id/dependencies` (:2700), **không có endpoint xóa edge** — cạnh chỉ hết chặn khi task nguồn `DONE/CANCELLED` (:2752–2753); wire UI "thêm dependency" mà không xóa được = user thêm nhầm là kẹt → **điều kiện tiên quyết: backend thêm DELETE dependency (D3) hoặc UI chỉ read-only list dependency hiện có** | **✅ CHỐT 2026-09-15:** Participants = làm tab + headcount chip (API server đã đủ — participant add/status là idempotent command + OCC version; headcount = `GET /events/:id/headcount`; detail `GET /events/:id` đã trả `participants[]`; candidate picker tái dùng `GET /candidates?eventId=`). Dependencies = chỉ read-only list trong TaskDetail, KHÔNG có UI thêm/xóa; DELETE dependency → ticket D3 riêng. |
| W4.3 | **`note` khi giao/nhận việc** | Wire `acknowledgeTask/assignTask note` (API đã hỗ trợ cả server) vào flow "Nhận việc/Từ chối" hiện có dialog chưa có ô ghi chú | Effort thấp, đưa vào Wave 2 khi đụng modal task | **✅ CHỐT 2026-09-15: LÀM** — ô ghi chú vào dialog Nhận/Từ chối (store `acknowledgeTask(task, status, note, key)` + server `acknowledgementSchema.note` đã sẵn từ đầu). |
| W4.4 | **Mobile `MobileOperationsView` riêng (D2 plan cũ)** | Chỉ làm nếu W3.6 xong mà 390px vẫn quá density | Giữ nguyên deferred | **✅ CHỐT 2026-09-15: BỎ QUA** — điều kiện không xảy ra (e2e 320/390px đã pass sau W3.6). |
| W4.5 | **Re-measure benchmark (D4 audit cũ)** | Mọi đụng read-path (không nằm trong plan này ngoài W3.1 client-side) đều đo lại `npm run benchmark:operations` trước/sau | Giữ gate cũ | **✅ CHỐT 2026-09-15: LÀM** — chạy benchmark trước/sau Wave 4, ghi số vào doc. |

### Thứ tự thực hiện đề xuất

```
Sprint A (Wave 1):        W1.1 W1.2 W1.3 W1.4 W1.5 W1.6 W1.7   — 1 PR nhỏ mỗi hạng mục, D2, test mới kèm từng cái
Sprint B (Wave 2):        W2.1 W2.2 W2.6 W2.7 W2.8 W2.9 W2.11 W2.12   — D1/D2 trước
                          W2.3 (GET-only) → W2.10; W2.13 (server route + client)
                          W2.4 W2.5                        — D3, cần review + chạy test:security-critical
Sprint C (Wave 3):        W3.1 W3.4 W3.5 (quick) → W3.3 W3.7 W3.8 → W3.2 (decompose) → W3.6 (viewport gate)
Chờ quyết định:           W4.1–W4.5
```

### Verification gates bắt buộc khi thực thi

- Mỗi PR: `tsc` + lint (`lint:ds` cho batch token/empty-state) + Vitest targeted (`OperationsPage.test`, `OperationsForms.test`, store tests, `OperationsPage.test.tsx` mobile tests :606/:622 cập nhật theo W2.8/W1.3).
- Wave 1+2 đụng transition/mutation: chạy `server` operations tests + `test:security-critical` (có `operationsRouteGuard`).
- E2E: `e2e/operations.spec.ts` @critical phải xanh; thêm 1 case deep-link (W2.2), 1 case override-readiness (W1.1), 1 case badge mobile (W2.10) khi CI device-ready thì thuộc gate C-series cũ.
- W3.1 perf: đo React Profiler trước/sau trên fixture 50 task × 50 assignee; không claim bằng cảm giác.
- **Docs sync khi làm:** API contract §25 cập nhật client body fields mới (W2.1), dispatch view (W2.3), remove assignment (W2.4), workstream PUT (W2.5); `AI_CONTEXT_MAP.md` stamp; doc này chuyển trạng thái plan→remediation-note nếu có batch sửa đi kèm.

### Rủi ro & điểm trung thực còn lại

1. **(INFERENCE)** G1 double-toggle và MB-02 stepper-tràn chưa đo runtime — phải verify bằng browser/viewport trước khi kết luận độ nghiêm trọng; fix đề xuất là safe cả hai trường hợp.
2. Contrast `text-white` trên `parish-primary` dark mode (#60A5FA) chưa đo — W3.4 đổi token là đúng hướng bất kể kết quả.
3. W2.4/W2.5 thêm mutation mới → bề mặt idempotency/OCC mở rộng; phải dùng `runIdempotentOperationsCommand` server-side (đã có sẵn route, chỉ client wire) và stable-key hook phía client — không tự phát sinh key mới mỗi retry.
4. W2.10 badge đưa store state vào nav → cẩn thận re-render nav (selector riêng, so sánh primitive).
5. Báo cáo này là **audit artifact tĩnh**; không phải SSOT; không có bằng chứng "test đã chạy xanh" cho chính nó vì không sửa code.

*Auditor: Qwen3.8 Flash Free (Kira AI) · tổng hợp 3 hướng đọc song song + tái kiểm chứng độc lập từng file:line trong working tree `967f067`. Sửa 1 claim sai của subagent (TaskCommentsPanel "no-op" — thực tế có reload nhưng mất nháp → U-17).*

---

## Trạng thái thực thi (cập nhật 2026-09-13 — remediation note)

- **Wave 1 — XONG 7/7** (W1.1 override-readiness gate; W1.2 inbox pointer + nút "Mở"; W1.3 KPI filterable aria-pressed + scroll; W1.4 switch APG hết nested-interactive; W1.5 `operationsErrors` ưu tiên server message cho code chung; W1.6 "Bắt đầu làm"; W1.7 TaskDetail thành ModalShell dialog — sửa cả orphan checklist MB-04).
- **Wave 2 — XONG 13/13**: W2.1 (description/expectedHeadcount/organizer-swap trên create+edit; contract §25 updated), W2.2 (`?event=&tab=` validateSearch + hook `useOperationsEventUrlSync` 2 chiều, replace-only), W2.3 (panel "Lịch sử lời mời" GET-only + phân trang dispatch inbox `dispatchTotal/HasMore/loadMoreDispatches` + nút "Tải thêm lời mời"), W2.4 (`TaskAssigneesPanel` + client fn remove-assignment, gate `operations.task.reassign`, reason bắt buộc, stable key), W2.5 (`updateWorkstream` wired ở WorkstreamPanel + StandaloneWorkstreamsPanel, type S-03 thêm description/blockedReason), W2.6 (preview templates giữ nguyên khi đổi giờ → stale banner + lý do disabled), W2.7 (missing-fields hint cho 3 form), W2.8 (FAB → `.mobile-floating-action` + `mobile-touch-target`, bỏ `sm:hidden` — hiện cả tablet 640–1023px; test cập nhật), W2.9 (badge `{loaded}/{total}` sự kiện + việc của tôi + lời mời; local busy từng nút "Tải thêm"), W2.10 (hook `useOperationsPendingCount` dynamic-import, prop `operationsBadge` RootLayout→Shell→nav, CSS `.mobile-bottom-nav__badge`, ẩn khi offline/cache, cap 99+, aria-label đếm được), W2.11 (`/permissions` trả `timezone` xứ đoàn; form + template instantiate default theo parish TZ + note lệch giờ; standalone task đủ description/phase/priority/scheduled*/isRequired; helper `formatEventInstant` gắn tag TZ ở detail subtitle), W2.12 ("Dời giờ" inline editor trên dòng inbox PENDING, gate `task.assign`/`event.manage` theo resource — mirror đúng rule không self-exemption server :1804), W2.13 (`GET /events` pushdown `q/status/scope` vào SQL trước two-phase authz; client debounce 300ms; filtered snapshot không ghi offline cache; test server mới 1 case 7 assertion nhóm).
- **Verification đã chạy:** full client Vitest **372 files / 2785 passed**; server operations **65 passed**; `test:security-critical` **8 files / 78 passed** (W2.4/W2.5 D3 gate); `tsc -b` ✓; server `tsc --noEmit` ✓; `oxlint --deny-warnings` toàn repo 0 warning; `lint:ds` **0/157**. E2e @critical không chạy (cần dev stack CI); test mới cho các luồng deep-link/badge vẫn thuộc gate C-series như ghi chú ở §Verification.
- **Bổ sung ngoài plan (đã verify cần thiết):** `TaskAssigneesPanel` mount trong dialog W1.7; `useOperationCandidates` cho displayName ở panel assignee; `searchEvents`/`setEventSearch` + `eventQuery` trên store; `parishTimezone` trên store; `clear()` reset field mới.
- **Chưa làm (giữ nguyên quyết định):** W4.1–W4.5 cần product chốt.
- **Wave 3 — XONG 8/8 (2026-09-13):**
  - **W3.1 perf:** `assigneeCountByTask` Map thay filter O(n²) per-row; `overviewCards`/`activeEventsCount`/`myTaskFilterOptions` memo; `activateKpiFilter` useCallback; KPI strip memo-element; toàn bộ state tìm kiếm sự kiện + debounce + pending-row + load-more-busy dời vào `OperationsEventList` (typing trong ô search không còn re-render cả trang).
  - **W3.3 + A5' menu:** `CreateMenuItems.tsx` — mọt nguồn dropdown desktop + sheet mobile (trước đây 2 bản markup dễ trôi); auto-focus item đầu khi mở menu; Tab rời menu → đóng; `focus-visible:ring` trên mọi item.
  - **W3.4 DS batch:** raw `<p>` → `EmptyState` (TaskAssignForm, EventRetrospectivePanel); `text-white` → `text-text-inverse` (page ×3 + picker ×3; pill-btn gốc của DS giữ nguyên scope); search input thô → `TextInput` chuẩn 40px + nút ✕ lucide `X`; bỏ `!min-h-7` trên 2 nút preset (bỏ luôn override `!` đang thắng cả luật touch 44px mobile); tiêu đề section card → `text-base font-bold` theo docs/03:167; section title W3.6 label stepper `text-xs` hợp chuẩn.
  - **W3.5:** aria-label thành viên dùng displayName (MemberValidityEditor nhận `memberLabel` prop), AvailabilityPanel dùng cửa sổ thời gian thay UUID; nút "Tải lại nhiệm vụ" của TaskCommentsPanel không còn qua `run()` — giữ nháp bình luận khi reload; badge emoji 📅⏱🗓 → lucide icon `aria-hidden`; hidden input bỏ `id`/`aria-label` mượn.
  - **W3.6 viewport:** label stepper `w-11 wrap break-words` dưới `sm` (sm+ giữ whitespace-nowrap); footer transition: primary `order-first w-full` dưới `sm` — rewind/cancel/close xuống hàng sau; **e2e mới `operations-viewport.spec.ts` @critical (đã chạy PASS thật trên Chromium)** phát hiện bug thật ở 320px: header ModalShell single-line khiến badge group của page push cả dialog (title collapse 0 width, scrollLeft 86px) — sửa `flex-wrap sm:flex-nowrap` + `flex-1 min-w-0` + `max-sm:max-w-full` (desktop sm+ không đổi; regression 5 file modal 45/45 xanh).
  - **W3.7:** `busyControl` per-button spinner cho EventTemplatesPanel (preview/instantiate/snapshot/version/archive/restore) + StandaloneWorkstreamsPanel (create/update/member/add-task/assign) — serializer `inFlight` giữ nguyên; test bằng chứng assert đúng nút bấm mới `aria-busy`.
  - **W3.8:** "Từ chối/Báo bị chặn/Hủy việc" gom vào overflow `···` (fixed popup, APG keys Arrow/Home/End/Escape/Tab, auto-focus, dismiss khi scroll/resize) — hàng chờ thao tác phụ trên mobile, primary actions ở lại inline; test `Thêm thao tác cho …` phủ cơ chế.
  - **W3.2 decompose (page 2309→~1277 dòng):** tách `useOperationsEventTransitionFlow` (+`EVENT_STEPS`), `OperationsEventList`, `OperationsMyTaskBoard`, `OperationsInboxList`, `EventLifecycleHub`, `EventTasksTab`, `EventOverviewStats`, `TaskEditDialog`, `OperationsEventDialogs`; vocabulary dùng chung (`statusLabel/statusTone/nextEventStatus/...`) về `operationsViewHelpers` một nguồn; **hành vi giữ nguyên — OperationsPage.test 51/51 xanh suốt từng bước tách, không đổi một assertion nào**.
- **Verification Wave 3:** tsc -b ✓ · server tsc ✓ · oxlint toàn repo 0 warning ✓ · lint:ds 0/166 ✓ · OperationsPage **52/52** ✓ · security-critical 8 files / 78 passed ✓ · modal regression (ModalShellMobile + 4 modal khác) 45/45 ✓ · e2e `operations-viewport` **1 passed trên Chromium thật** (deep-link ?event=, no horizontal overflow @320/390, primary button full-width row) · **full client+server Vitest sau Wave 3: 373 files / 2791 tests — 2790 passed, 1 fail FLAKY tái kiểm chứng** (`sync-engine.test.ts` EXAM-CONTINUOUS-P0 thứ tự queue IndexedDB; chạy độc lập 35/35 xanh, khu vực sync không nằm trong scope Wave 3 — 0 file sync nào bị sửa).

---

## Trạng thái thực thi Wave 4 (chốt + thực hiện 2026-09-15)

Quyết định sản phẩm của owner (2026-09-15, qua bảng câu hỏi): W4.1=(a) poll · W4.2=participants làm UI, dependencies read-only · W4.3=làm · W4.4=bỏ · W4.5=làm.

- **W4.1 ✅ poll read-only 90s:** hook `useOperationsAutoRefresh` (interval chỉ chạy khi `active && document.visibilityState==='visible'`; page gate `active = isOnline && source==='server' && !loading` — serialize qua loading, không stack request, không poll offline/cache, đúng ADR-110). Test hook: fake timers + visibility stub (2 ca). 
- **W4.2a ✅ tab "Người tham dự":** `EventParticipantsPanel` trong event modal (tab mới, `?tab=participants` deep-link hợp lệ, count chip). Gọi đúng 3 API server đã có: add participant (candidate picker theo `GET /candidates?eventId=`, role tùy chọn), status OCC theo `version` từng participant row, headcount rollup `GET /events/:id/headcount` (lỗi rollup → ẩn dòng, không hiển "đang tải" giả). Gate UI = `operations.event.manage` + event chưa COMPLETED/CANCELLED (mirror `assertEventAcceptsPlanningMutation`); server vẫn là authz thật. `participants` được thêm vào type `OperationEventDetail` client (server vốn đã trả). Test 6/6.
- **W4.2b ✅ dependencies read-only:** `GET /tasks/:id` server giờ LEFT JOIN trả edge `{…,dependsOnTitle,dependsOnStatus}` (soft-deleted source → null, hiển "Nhiệm vụ đã xóa"); client `TaskDependenciesPanel` trong task detail giải thích "chưa thể hoàn tất/mở chặn cho tới khi …" — **không có UI thêm/xóa** theo quyết định chống cửa-một-chiều; DELETE dependency vẫn là ticket D3 riêng. Contract §25 cập nhật (response shape đổi + note không có DELETE). Test server assertion mới + panel 2/2.
- **W4.3 ✅ ghi chú Nhận/Từ chối:** `TaskAcknowledgeDialog` (ModalShell) — bấm Nhận việc/Từ chối (inline + overflow `···`) mở dialog, TextArea "Ghi chú khi phản hồi nhiệm vụ" (không bắt buộc, tối đa 2000), confirm mới gửi `acknowledgeTask(task, status, note, stableKey)` — `note` đã được cả 3 tầng store/api/server (acknowledgementSchema) hỗ trợ từ trước; stable key giờ bao gồm note nên đổi ghi chú = command mới, gửi lại y nguyên = replay an toàn. 2 test cũ cập nhật hành vi có chủ đích + test mới assert note được truyền.
- **W4.4 ❌ bỏ:** điều kiện "390px vẫn quá dens sau W3.6" không xảy ra (e2e viewport pass).
- **W4.5 ✅ benchmark (kết luận trung thực, cần đo lại khi máy nghỉ):** `npm run benchmark:operations` profile 250/1000/250, 5 warmup/20 sample. Baseline sáng 15/09 (trước Wave 4): events p50 6.4ms · tasks 12.2ms · readiness 14.1ms. Sau Wave 4 (4 lần chạy, sau full suite ~15 node process đang hoạt động): events ~19–21ms · tasks ~35ms · readiness ~38–40ms — cao bất thường **trên cả 3 endpoint mà Wave 4 KHÔNG đụng** (Wave 4 chỉ thêm enrichment cho `GET /tasks/:id` detail, không nằm trong nhóm đo) → dấu hiệu nhiễu tài nguyên máy, không phải hồi quy read-path; cần chạy lại khi dev stack nghỉ trước khi quy kết. Không có threshold fail trong script (exit 0 cả 4 lần).
- **Gate Wave 4:** tsc -b ✓ · server tsc ✓ · oxlint toàn repo 0 warning ✓ · lint:ds 0/169 ✓ · OperationsPage 55/55 ✓ (test do editor song song thêm phần archive/restore vẫn xanh) · EventParticipantsPanel 6/6 · TaskDependenciesPanel 2/2 · useOperationsAutoRefresh 2/2 · server operations 66/66 · security-critical 78/78 ✓ · **full client+server Vitest: 376 files / 2806 tests — 2806 passed (0 fail, kể cả ca flaky sync-engine lần này pass)** ✓ · e2e operations.spec + operations-viewport chromium: xem nhật ký run.
