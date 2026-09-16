# Audit UX/UI + Frontend + Đồng bộ Backend — Trang Operation Desktop & Mobile

**Ngày:** 2026-09-12
**Phạm vi:** `/operations` — `src/pages/OperationsPage.tsx` (2132 dòng), `src/stores/operationsStore.ts`, `src/lib/api/operations.ts`, `src/components/operations/*` (15 files), `server/src/routes/operations.ts` (61 routes), `e2e/operations.spec.ts` (9 @critical)
**Phương pháp:** đối chiếu code hiện tại (observed truth) với ADR-110/112, Business Rules, Design System v4.5, `docs/OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md`
**Không trong lần này:** đo real-device, kiểm chứng production data. Kết luận cần E2E + manual 390px/1440px trước khi chốt nâng cấp lớn.

> Bản này gộp audit nội bộ (desktop/mobile order, timezone drift, standalone rút gọn, search client-side, FAB offline) với 4 bài học tiếp thu từ audit đối chiếu: bug orphan `TaskChecklistSection`, thiếu nút dời giờ inbox, ma trận gaps theo `endpoint:line + client + UI`, đề xuất `TaskDetailModal` + Segmented mobile tabs.

---

## 1. Tóm tắt điều hành

* Lõi lifecycle **đã đồng bộ tốt**: event FSM 6 bước, task FSM, assign/dispatch/accept/ack, checklist, reminders read/cancel, blockouts, templates, workstreams members/lead/ready, idempotency + OCC + tenant `parishId` fail-closed, `creation-options` server-authoritative lái menu "+ Tạo mới".
* **6 gaps backend có endpoint nhưng thiếu client và/hoặc UI** (chi tiết §3). Trong đó 1 cái có client nhưng thiếu UI inbox (`reschedule`).
* **1 bug UX nghiêm trọng (P0):** orphan task detail render đáy trang `OperationsPage.tsx:1942` — click "Chi tiết nhiệm vụ" từ Việc của tôi không mở modal/drawer, user tưởng click không ăn. Desktop + mobile đều dính.
* Desktop/mobile dùng chung 1 cây logic, khác thứ tự render + modal presentation + FAB. Mạnh về ít drift logic, yếu về đứt mạch nhận thức (mobile Inbox-first, desktop KPI-first).
* DS guard tốt: `lint:ds PASS 0 violations / 155 TSX`, `OperationsPage.test.tsx 40/40 PASS`, semantic tokens đúng, touch-target có document lệch B5.
* Không đụng offline-write, recurrence, RSVP, attachment, workflow generic — đúng ADR-110 out-of-scope.

---

## 2. Kiến trúc hiện tại

### 2.1 Shell + thứ tự sections

* Container: `DesktopAppShell width="wide"` (`max-width:80rem` = `max-w-7xl`, `40-mobile-shell.css:131`) + `PageHeader` `OperationsPage.tsx:1197-1198`.
* Mode: `useEffectiveMode()` — `matchMedia(max-width:1023.9px)`, forced-mobile chỉ khi viewport nhỏ (`useEffectiveMode.ts:14-40`). Fix trắng trang P0.10 đã đúng.
* Desktop `OperationsPage.tsx:1384-1392`: KPI strip → grid 2 cột (Events + My Tasks) → Inbox → Utilities.
* Mobile `OperationsPage.tsx:1375-1382`: Inbox → My Tasks → Events → KPI (thứ 4) → Utilities (collapse).
* Tạo mới: desktop dropdown `role="menu"` + Arrow/Home/End + outside-click/ESC `:1209-1240`; mobile `ModalShell bottom-sheet` + FAB `fixed bottom-20 right-4 h-14 w-14 sm:hidden` `:1292-1374`.
* Chi tiết event: `ModalShell maxWidth="1040px" mobileDisplay="bottom-sheet"` + footer lifecycle `:1395-1471`, grabber mobile `ModalShell.tsx:82-90`.
* Utilities mobile collapse `Thu gọn/Mở tiện ích` + `Suspense lazy` `:1148-1188`.

### 2.2 Luồng dữ liệu

```
fetch() 5 song song [events+tasks+reminders+inbox+permissions] → operationsStore.ts:261
selectEvent/selectTask [AbortController + generation guard] → operationsStore.ts:400-464
mutate + Idempotency-Key ổn định (useStableCommandKey) + OCC version + assertTenant/sameScope
offline → Dexie `parish_operations_overview_v1` chỉ events+tasks → operationsStore.ts:282-302
banner trung thực → operationsViewHelpers.ts:45-63, canMutate = isOnline && source==='server' → OperationsPage.tsx:284-285
```

Đúng invariant: `creation-options` lái menu (`:288-292` ↔ backend `:957`, không hiện nút disabled), permissions chỉ ẩn/hiện UI (backend re-check), không báo thành công giả offline.

### 2.3 KPI + filter hiện tại (đính chính audit khác)

* KPI strip `overviewCards` `:464-493`: `Sự kiện / Việc của tôi / Chờ phản hồi / Đang bị chặn` — **không có thẻ "Hoàn tất"** như audit khác ghi nhầm.
* MyTasks filter `:412-416`: `ALL/PENDING/ACTIVE/BLOCKED/DONE`. Thiếu `OVERDUE` + sort theo `dueAt`.
* Event search `:134-141`: client-side trên page đã tải, chỉ hiện khi `events.length>2`, không debounce, không filter status/date/scope server-side. Sai khi `total>50` (pagination "Tải thêm").
* Filter chips hand-rolled `min-h-[44px] mobile-touch-target` có comment lệch DS B5 `:902-920` — chấp nhận được, đã document.

---

## 3. Ma trận đồng bộ Backend ↔ Frontend

Backend: `61` routes `rg operationsRouter.(get|post|put) = 61`. Frontend: store + ~15 components gọi trực tiếp `operationsApi`.

### 3.1 Đã đồng bộ (lõi)

Event FSM `DRAFT→PLANNING→PREPARING→READY→LIVE→COMPLETED` + rewind reason + `automation/resume`; task FSM + `CANCELLED→TODO` restore audit; assign/dispatch/inbox/accept/ack; checklist add/toggle; reminders read/cancel + phân trang + lọc theo task/event; blockouts mine/create/update/revoke; templates preview/create/version/archive/restore/instantiate; workstreams create/add/remove member/replace lead/validity/ready; retrospective + follow-up; handover; comments. E2E `e2e/operations.spec.ts` phủ 9 luồng @critical.

### 3.2 Gaps — backend có, thiếu client và/hoặc UI

| # | Backend | Client `src/lib/api/operations.ts` | UI | Ảnh hưởng |
|---|---|---|---|---|
| G1 | `POST /tasks/:id/assignments/:assignmentId/remove` `:2563` (gỡ phân công + reason) | **Thiếu method** | Chỉ có `TaskHandoverForm`, không nút gỡ | Không gỡ người nghỉ phục vụ |
| G2 | `PUT /workstreams/:id` `:1986` (sửa tên/isRequired) | **Thiếu `updateWorkstream`** | Chỉ tạo + members/lead/ready | Không sửa tên nhóm sau tạo |
| G3 | `GET /tasks/:id/dispatches` `:2480` (lịch sử mời chính/dự bị) | Chỉ có `getDispatchInbox` | Không xem per-task | Quản lý không biết đã mời ai dự bị |
| G4 | `POST /tasks/:id/dependencies` `:2700` (DFS cycle, cùng event, chặn DONE `:2752-2753`) | **Thiếu**, `dependencies: unknown[]` | Không UI chọn/xem/gỡ | Bị chặn DONE mà không biết vì task nào |
| G5 | `POST /events/:id/participants`, `/status`, `GET /headcount` `:1494-1524` | **Thiếu** | Không UI | `expectedHeadcount` chết, không điểm danh |
| G6 | `POST /reminders/:id/reschedule` | **Có** `:343`, `EventReminderForm.tsx:143` có dùng | `renderInboxSection` chỉ Đọc/Hủy `:1108-1119`, **thiếu Dời giờ** | Phải hủy + tạo lại thay vì dời |

Gaps học từ audit đối chiếu: G6 + format `endpoint:line + client + UI` cụ thể.

### 3.3 Lệch mềm (có client nhưng thiếu)

* `createStandaloneTask` (`operationsStore.ts:501`) chỉ gửi `title/eventId=null/scopeUnitId/dueAt`, trong khi `POST /tasks` hỗ trợ full `phase/priority/scheduled*/isRequired/workstreamId` → task độc lập bị rút gọn.
* Timezone tạo event dùng browser TZ `CreateEventForm.tsx:64`, backend validate IANA + dùng `PARISH_TIME_ZONE` server cho service-term date → nguy cơ drift giờ khi browser ≠ parish TZ. Nên default parish TZ + hiển thị "Giờ Xứ đoàn".
* Hiển thị giờ `toLocaleString('vi-VN')` khắp nơi, không kèm TZ/relative → sự kiện xuyên TZ dễ nhầm.

---

## 4. Audit UX/UI

### 4.1 Desktop (`isMobileLayout===false`)

**Đạt:** shell rộng đúng DS §13, KPI click-lọc được, 2 cột xem song song, stepper + readiness bar + closure blockers rõ (`:1498-1603`), per-row `busyInbox` Set tránh lock toàn inbox, skeleton/error/offline states đủ.

**Vấn đề:**

* **F0 (P0, nghiêm trọng): Orphan task detail.** `OperationsPage.tsx:1942` `{!selectedEvent && <TaskChecklistSection />}` + `TaskChecklistSection.tsx:34` null-guard. Click "Chi tiết nhiệm vụ" ở cột Việc của tôi → checklist/comments/handover render đáy trang dưới cả Tiện ích, không auto-scroll. Fix: `TaskDetailModal/Drawer` (học từ audit khác).
* F1: Event modal ôm đồm — lifecycle hub + KPI 4 ô + 5 tabs + 2 forms `lg:grid-cols-[1fr_0.9fr]` (`:1785`). Cần accordion 1 cột + KPI gọn.
* F2: Task card tới 4-5 nút đồng thời (`Chi tiết/Hoàn tất/Nhận/Từ chối/Báo chặn/Hủy` `:990-1046`; `canExecute` vs `hasPending` loại trừ nhau nên hiếm khi đủ 6). Cần giữ nút chính + gom phụ vào `...` menu (học từ audit khác).
* F3: G4 khiến desktop không biết bị chặn bởi task nào; G1/G2 thiếu nút gỡ/sửa.
* F4: Thiếu Table/Kanban — ghi nhận là improvement, không phải bug. Khuyến nghị sau P0.

### 4.2 Mobile (`isMobileLayout===true`)

**Đạt:** chung logic desktop, bottom-sheet + grabber, FAB, utilities collapse + lazy, chips đủ 44px.

**Vấn đề:**

* **M0 (P0): cùng bug orphan như F0, nặng hơn trên 375px** — user hoàn toàn không biết detail đã mở tít dưới.
* M1: Cuộn dọc 5 khối, KPI thứ 4 (`:1377-1381`). Đứt mạch khi đổi thiết bị. Trước mắt thống nhất `KPI-compact → Events → MyTasks → Inbox → Utilities`; sau đó Phase B Segmented Tabs `Việc của tôi (default) · Sự kiện · Hộp thư · Tiện ích` (học từ audit khác + doc Phase B hiện vẫn open).
* M2: FAB ẩn hẳn khi offline (đk `canCreateAnything && canMutate && isMobileLayout` `:1365`). Nên giữ FAB disabled + tooltip "Cần mạng để tạo" thay vì biến mất.
* M3: Header mobile dùng `PageHeader` chung. `GEMINI.md:3` scope bắt buộc `SubpageHeader` chỉ cho `src/components/mobile/` — nên `OperationsPage` (ở `src/pages`, Pattern A) **không vi phạm**, nhưng nên hybrid như `QuestionBankView.tsx:393-395` (desktop PageHeader + mobile SubpageHeader 32×32, title 20px/800) để chuẩn DS v4.5. Đính chính claim "vi phạm" của audit khác.
* M4: Event modal bottom-sheet chứa stepper + 5 tabs + 2 cột form → cuộn dài, footer transition dễ bị che. Cần single-column + sticky bottom-bar.
* Tiến hóa đã fix mà audit khác miss: `routePolicy.ts:79` đã có `mobileTab:'operations'`, `MobileBottomNav.tsx:45` đã có tab `Công Việc` — discoverability P0 trong doc 2026-09-12 đã xong.

### 4.3 Design System invariants

* Tokens navy-gold + semantic `bg-parish-*-bg` đúng, không raw pastel. `lint:ds PASS 0/155`.
* Button 40px + touch 44px đúng; chips lệch DS có document B5.
* `ModalShell` focus trap + ESC + scroll-lock + overlay policy đúng; rủi ro nested modals (event + edit task + reason + override + completion) cần kiểm tab-order.
* Typography placeholder/contrast: `lint:ds` chỉ anti-drift, không certify WCAG — cần axe + manual như Verification Plan.

---

## 5. Verification đã chạy (evidence)

* `npm run lint:ds` → `PASS 0 violations / 155 TSX`.
* `vitest run src/__tests__/components/OperationsPage.test.tsx` → `40 passed`.
* `rg` counts: `OperationsPage 2132 dòng`, `61 backend routes`, inbox chỉ Đọc/Hủy không Dời giờ, 5 methods G1-G5 vắng mặt trong `operations.ts`.
* Chưa chạy: full `verify:ci`, E2E `@critical`, real-device 375/390 + 1440/1920, axe keyboard/screen-reader — để ở Verification Plan.

---

## 6. Plan nâng cấp (gộp)

### Phase 1 — Client sync (0.5–1d, D1)

Thêm vào `src/lib/api/operations.ts`: `removeTaskAssignment`, `updateWorkstream`, `getTaskDispatches`, `addTaskDependency (+remove nếu backend bổ sung)`, `getEventHeadcount/addEventParticipant`, tái dùng `rescheduleReminder` cho inbox. Không UI vội. Verify: `tsc -b`, unit store/forms, `lint:ds`.

### Phase 2 — Fix P0 UX (1–2d, D1)

* `TaskDetailModal.tsx` (Desktop SlideOver 640px / Mobile bottom-sheet): Checklist + Comments + Handover + Restore + Dependencies (read-only trước). Xóa `OperationsPage.tsx:1942` đáy trang.
* Inbox thêm nút `Dời giờ` (dùng G6 sẵn có).
* Task card: giữ `Hoàn tất/Nhận việc/Chi tiết`, gom `Báo chặn/Hủy/Bàn giao` vào `...` menu.
* FAB offline: disabled + tooltip thay vì ẩn.
* Standalone task full fields + default parish TZ + label "Giờ Xứ đoàn".
* Verify: `OperationsPage.test` + test mới "click Chi tiết → modal mở", E2E 2 spec đầu (public-calendar, dispatch), manual 390+1440.

### Phase 3 — Tách monolith + điều hướng (3–5d, D2)

* Tách `OperationsKpiStrip/EventsSection/MyTasksSection/InboxSection/EventDetailModal`. Page <400 dòng, draft/busy cô lập như `CreateEventForm`.
* Deep-link `/operations/events/:id?tab=` (TanStack Router): mở link → `selectEvent` + modal; đóng → replace `/operations`. Mobile deep-link fullscreen.
* Event modal 1 cột accordion + KPI gọn + sticky footer.
* Server-side search/filter events (`q/scope/status`), debounce; giữ client filter làm fallback cache.
* MyTasks thêm `Quá hạn` + sort `Quá hạn → Hạn gần → Ưu tiên`; giờ hiển thị kèm TZ + relative (`trong 2 giờ nữa · 08:00 GMT+7`).
* G1-G5 UI tối thiểu: rename workstream, remove assignment, dispatch history, dependency list, headcount view.
* Verify: `npm run build`, `test:security-critical` (route guard), full `e2e/operations.spec.ts`, axe modal, 2 devices.

### Phase 4 — Mobile Phase B polish (2–3d, sau P3)

Hybrid `PageHeader` desktop + `SubpageHeader` mobile; Segmented Tabs 4 tabs; sticky action bar `100dvh` không bị keyboard che; telemetry nhẹ (select latency, `VERSION_CONFLICT` rate, offline banner impression, không PII).

**Không làm:** offline write queue, recurrence, RSVP/ticketing, attachment, workflow generic, đổi RBAC/tenant/OCC/idempotency. Participants full CRUD + Kanban để sau khi có business rule.

---

## 7. Open questions cho chủ sản phẩm

1. Kanban (List ↔ Board TODO/IN_PROGRESS/BLOCKED/DONE) có làm ngay P3 không? Khuyến nghị: **không** — sort overdue + filter đủ trước.
2. Participants/headcount tab riêng trong event modal ngay hay sau? Khuyến nghị: **sau** (hiển thị headcount trước, CRUD sau khi rõ rule điểm danh).
3. Phase B mobile tabs có làm ngay sau P2 hay chờ P3 tách xong? Khuyến nghị: **sau P3** để tránh refactor 2 lần.

---

## 8. Rủi ro & invariants phải giữ

* Backend auth authoritative; ẩn UI không phải boundary. Mọi nút mới phải có `test:security-critical` xanh.
* Không cache permissions/inbox/reminders offline; giữ fallback chỉ events/tasks + banner trung thực.
* Không suy diễn business rule participants/dependencies mới — tra `BUSINESS_RULES.md` + ADR-110/112 trước.
* Docs SSOT (`02_ARCHITECTURE`, `BUSINESS_RULES`, `FRONTEND_API_CONTRACT`, `07_DATABASE_PLAN`) chỉ sửa khi hợp đồng API/schema đổi thật.
