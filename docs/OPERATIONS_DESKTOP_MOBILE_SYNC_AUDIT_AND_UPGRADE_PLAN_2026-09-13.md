# Operations Desktop ↔ Mobile Sync Audit & Upgrade Plan (2026-09-13)

> **Scope:** Catevia / TNTTVN (`brave-davinci`) — trang `/operations` ở **cả hai chế độ** desktop (≥1024px) và mobile (<1024px), so sánh mức độ đồng bộ UI/UX + frontend, kèm kế hoạch nâng cấp.
> **Method:** E3 code + test + docs cross-read trực tiếp (OperationsPage.tsx 2132 dòng đọc toàn bộ; 13 sub-components; MobileAppShell/DesktopAppShell/RootLayout/PageTransition; CSS 40-mobile-shell / 50-app-shell / 60-view-language; operationsStore.ts; OperationsPage.test.tsx 760 dòng) + 2 fan-out audit (sub-components, tests/docs/history). Kế thừa registry `docs/OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md` (OPS-M0…M8) — không lặp lại các finding đã đóng.
> **Not in this pass:** implement code; real-device E1 QA (giữ làm acceptance gate — OPS-M8).
> **Status:** Evaluation + plan only.

---

## 1. Executive summary — "Đã đồng bộ chưa?"

**Verdict: đồng bộ ~80% về kiến trúc, nhưng KHÔNG đồng bộ ở mức production mobile.**

| Khía cạnh | Đồng bộ? | Ghi chú |
| --- | --- | --- |
| Markup sub-components (13 file) | ✅ | 0 mode-branch; render giống hệt trong 2 mode (chỉ `sm:` CSS + ModalShell responsive) |
| Modal/dialog architecture | ✅ | 100% ModalShell; bottom-sheet/fullscreen đúng DS §8.3; focus trap/ESC/scroll-lock qua `useAccessibleDialog` |
| Action boundary (offline/permission/OCC) | ✅ | Online-first, không fake success; per-row busy (P1-8); 40 test jsdom phủ |
| Design tokens / dark mode | ✅ | 0 raw pastel; `bg-parish-*-bg`, `border-parish-*/30` đúng chỗ |
| **Khung bố cục mobile (gutter ngang)** | ❌ **P0** | Toàn bộ content mobile chạm mép trái/phải 0px — không page nào khác bị |
| **FAB "Tạo mới" mobile** | ❌ **P0** | Hand-rolled `fixed bottom-20 sm:hidden` thay vì `.mobile-floating-action`; **tablet 640–1023px mất hoàn toàn lối tạo mới** |
| Từ vựng hiển thị (labels) | ❌ P1 | 1 enum hiển thị 2 từ ("PENDING" vs "Đang chờ") trên cùng tính năng; role/priority labels lệch giữa các form |
| Lifecycle stepper mobile hẹp | ❌ P1 | 6 bước `whitespace-nowrap`, không wrapper cuộn ngang → tràn ở ≤390px |
| KPI card click | ❌ P1 | Surface `as='div'` + `onClick` → không keyboard/role (WCAG 2.1.1 fail, cả 2 mode) |
| Test mobile | ⚠️ | jsdom: mock `useEffectiveMode`, chỉ 2/40 test mobile; e2e: 9/9 @critical desktop-width; `/operations` ngoài viewport matrix 390/320 (Phase C1 cũ còn mở) |

**Kết luận nghiên cứu:** xương sống đồng bộ tốt (đây là công của pass remediation `0560dc9` ngày 09-12: mobile FAB, mobile stack order, form extraction, P1-1..12). Còn lại **2 lỗi bố cục P0 chỉ xuất hiện trên mobile thật** (gutter + FAB breakpoint) — nguyên nhân chính: `OperationsPage` là page duy nhất dùng `DesktopAppShell embedded` trực tiếp dưới `MobileAppShell`, và các nhánh mobile dùng CSS breakpoint `sm:` (640px) thay vì mode boundary (1024px). Sau đó là nợ vocabulary/DS/test có thể dọn theo đợt.

---

## 2. Evidence baseline

| Nguồn | Dùng để |
| --- | --- |
| `src/pages/OperationsPage.tsx` (2132L, đọc toàn bộ) | Toàn bộ cấu trúc 2 mode, FAB L1365-1374, create menu L1204-1363, stepper L1498-1541, KPI L699-730, utilities expander L1148-1155, shell L1193/L1197 |
| `src/components/desktop/DesktopAppShell.tsx` L36 | `embedded` → class `embedded-page-section` (bỏ gutter/max-width) |
| `src/styles/design-system/40-mobile-shell.css` L100-118, L514-540 | `.responsive-page-shell` có `padding: 16px var(--mobile-content-gutter) 0`; `.embedded-page-section` **không có**; `.mobile-floating-action` primitive có sẵn |
| `src/components/mobile/MobileAppShell.tsx` L15-18, L27-30 | Hợp đồng: "screens must NOT add their own fixed bottom offsets unless dùng `.mobile-floating-action`"; `.mobile-app-main` chỉ padding-bottom |
| `src/components/common/PageTransition.tsx`; `50-app-shell.css` L340-346, L350-355 | `.route-transition-frame` width 100%, không padding ngang; `.app-main-content` (desktop) có `padding: clamp(18px, 1.8vw, 28px)` — desktop được bù, mobile thì không |
| `src/components/common/RootLayout.tsx` L192-254 | Mobile: MobileAppShell → HeaderBar → PageTransition → Outlet (chuỗi DOM xác minh loss gutter) |
| `src/components/operations/*` (13 file, fan-out audit) | Mode-agnostic; vocabulary maps cục bộ; DS deviations |
| `src/stores/operationsStore.ts` | Fetch/pagination/OCC/idempotency; không có gì mode-specific |
| `src/__tests__/components/OperationsPage.test.tsx` (760L) | 40 test; 2 mobile; gaps liệt kê §5 |
| `e2e/operations.spec.ts` + `playwright.config.ts` + `e2e/design-system-matrix.ts` L26-34 | 9 @critical desktop-width; `/operations` ngoài `representativeProtectedRoutes` |
| `docs/03_DESIGN_SYSTEM.md` §8 (L232-264) | Touch ≥44px, title 20px/800, ModalShell bắt buộc, shell contracts, FAB neo `--mobile-nav-total-height`, tabs mobile bọc cuộn ngang |
| `docs/OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md` | Registry OPS-M0…M8; Phase A/B done, C/D open — kế hoạch này nối tiếp C và mở rộng |
| `git log` | 3 commit chạm OperationsPage: `e6c7a36` (09-09), `274a963` (09-11), `0560dc9` (09-12 big remediation pass) |

---

## 3. Findings mới (mã **OPS-S** — "sync"; không trùng OPS-M đã đóng)

| ID | Finding | Severity | Evidence |
| --- | --- | --- | --- |
| **OPS-S1** | **Mất gutter ngang trên mobile.** `OperationsPage` dùng `<DesktopAppShell width="wide" embedded={isMobileLayout}>` (L1197; skeleton L1193). `embedded` → `.embedded-page-section` vốn dành cho **route lồng** (Users/AcademicYear inside ManagementPage có shell cha). Ở `/operations` route đứng trực tiếp dưới `MobileAppShell` → chuỗi `.mobile-app-main` (chỉ padding-bottom, 40-mobile-shell L53-55) → `.route-transition-frame` (width 100%) → `.embedded-page-section` (flex gap 14, **không padding-inline**, L100-118) → mọi card (PageHeader card, KPI, Events/Tasks/Inbox, Utilities) **viền chạm mép 0px** hai bên. Mọi page responsive khác (OrganizationDashboard L144, Finance L197, Settings L139, ParishProfile L343…) dùng `responsive-page-shell` có `padding: 16px var(--mobile-content-gutter) 0` dưới 1024px. Desktop không lộ lỗi vì `.app-main-content` có padding riêng. | **P0** | DesktopAppShell.tsx L36; 40-mobile-shell.css L100-118; so sánh grep `DesktopAppShell width` 19 pages — Operations là route duy nhất `embedded` mà không có shell cha |
| **OPS-S2** | **FAB mobile sai primitive + mất FAB trên tablet band.** (a) FAB là raw button `fixed bottom-20 right-4 … sm:hidden` (L1365-1374) thay vì `.mobile-floating-action` (DS §8 L260-261: "FAB chỉ neo phía trên `--mobile-nav-total-height`, không cộng inset lần nữa" — class có sẵn ở 40-mobile-shell L514-532 với right/bottom safe-area-aware, z-index 900). `bottom-20` (80px) hardcode < chuẩn `calc(68+7+safe-area+16)`: iPhone safe-area 34px → chuẩn ≈125px, FAB hiện 80px → **đè lên/sát bottom nav**. (b) `sm:hidden` cắt ở **640px** nhưng mobile mode chạy tới **1023px** (useEffectiveMode) → tablet 640–1023px ở mobile mode: desktop dropdown không render (L1209 `!isMobileLayout`), FAB bị ẩn → **không còn bất kỳ lối "Tạo mới" nào**. (c) Vi phạm hợp đồng MobileAppShell L15-18 đã comment rõ. | **P0** | OperationsPage L1365-1374, L1204-1240; MobileAppShell.tsx L15-18; 40-mobile-shell.css L514-540 |
| **OPS-S3** | **Lifecycle stepper tràn ngang trên mobile hẹp.** 6 bước `whitespace-nowrap` ("Bản nháp"…"Hoàn tất") trong `flex justify-between px-2 sm:px-6` (L1498-1541) **không có wrapper `overflow-x-auto`** — tổng nhãn tối thiểu ~450-550px > viewport 320-390px; `.mobile-app-shell { overflow-x: clip }` (L49) làm mất chữ. Trái chiều với chính DS L264 (tabs/charts mobile phải bọc cuộn ngang — `.view-tabs` có `overflow-x: auto` + snap, 60-view-language L41-67) và với modal Tabs ngay bên dưới — cùng modal, 2 pattern. | **P1** | OperationsPage L1498-1541; 40-mobile-shell.css L49; 60-view-language.css L41-67 |
| **OPS-S4** | **KPI card là clickable `div`** — `<Surface variant="card" onClick=… cursor-pointer>` (L702-712) nhưng `Surface` mặc định `as='div'` (Surface.tsx L22-26): không `role`, không `tabIndex`, không keyboard → WCAG 2.1.1 fail **ở cả 2 mode**. `Surface` đã hỗ trợ `as='button'`; chip chọn đang có visual state (`border-parish-primary ring-2`) nhưng không `aria-pressed`. | **P1** | Surface.tsx L22-26; OperationsPage L699-730 |
| **OPS-S5** | **Vocabulary không tập trung — 1 enum, nhiều từ vựng.** (a) `EventReminderForm` L132 render raw enum `reminder.status` ("PENDING"/"SENT") trong khi inbox cùng trang dùng `reminderStatusLabel` ("Đang chờ"/"Đã gửi", page L81/L1100) — **người dùng thấy 2 ngôn ngữ cho cùng dữ liệu trong một tính năng**. (b) Role labels: TaskAssignForm L101-102 "Owner (Phụ trách chính)"/"Contributor (Thực hiện)" vs StandaloneWorkstreamsPanel L200 "Phụ trách chính"/"Phối hợp". (c) Priority: EventRetrospectivePanel L109 "Thấp/Bình thường/Cao/Khẩn" vs page L1955-1958 "Ưu tiên thấp/…". (d) Visibility INTERNAL/PUBLIC_SUMMARY segmented control hand-rolled **3×** với 3 đoạn copy khác nhau (CreateEventForm L115-122, EventEditForm L81-88, EventTemplatesPanel L190-197) — DS có `SegmentedControl`. (e) `mảng`/`nhóm` dual vocabulary rải rác không trung tâm hóa. (f) `localDateTime` 3 bản sao (WorkstreamPanel L17, EventReminderForm L17, AvailabilityPanel L9) dù `toDateTimeInput` đã có trong helpers L8-11; page tự giữ `toIso` L106 + `isTerminalTask` L69 trùng helpers. (g) Predicate `['DRAFT','PLANNING','PREPARING','READY']` lặp 4 chỗ (WorkstreamPanel L57, EventReminderForm L49, page L1897/L1907) dù `canCreateEventTask` helpers L37 đã có. (h) Candidate option strings ("Đang tải nhân sự…", "Chọn nhân sự", "· chưa có tài khoản") lặp 5 files. (i) `roles`/`memberRoles` 2 map trùng nhau. (j) Phase options EventTaskForm L75-77 hand-duplicate `taskPhaseLabel` (helpers L39-41). | **P1** | Fan-out audit #1, mục (c) đầy đủ với line numbers |
| **OPS-S6** | **TaskAssignForm bỏ lỡ pass DS:** (a) empty state "no assignable tasks" L33-52 là raw `<p>` trong card — vi phạm EmptyState invariant (DS §8.4; 5/6 panel còn lại đều đúng); (b) không có desktop grid (L77 single column) trong khi EventTaskForm ngay bên cạnh `sm:grid-cols-2` L69/L81 → desktop nhận form xếp dọc hẹp, mobile không khác; (c) role labels song ngữ (mục S5b). | **P1** | TaskAssignForm.tsx L33-52, L77, L101-102 |
| **OPS-S7** | **Kênh feedback phân mảnh:** thành công qua toast (EventEditForm L65) vs inline `role="status"` (EventReminderForm L165, AvailabilityPanel L111, StandaloneWorkstreamsPanel L225, EventTemplatesPanel L324); lỗi form `role="alert"` danger (đồng nhất — tốt); WorkstreamPanel L132 render status plain text trong khi page L1413-1414 render Badge + `statusTone` cho cùng cấp dữ liệu. | **P2** | Fan-out audit #1 §(a)-10 |
| **OPS-S8** | **WorkstreamPanel L128: checkbox trần không min-height** — touch target < 44px duy nhất trong feature (peers dùng `min-h-11`: TaskChecklistSection L85/L101, EventTaskForm L86); CSS floor 40-mobile-shell L152-176 chỉ phủ button, không phủ bare checkbox. | **P2** | WorkstreamPanel.tsx L128 |
| **OPS-S9** | **Test mobile hẹp + 0 e2e mobile.** jsdom: mock `useEffectiveMode` (test L41-42), chỉ 2/40 test mobile (L574 order, L622 FAB); thiếu: FAB negative rules (offline/cache/no-perm), mobile bottom-sheet dismissal (chỉ desktop dropdown được test A5'), desktop layout order, cache-banner copy (OPS-M5 đã remediate nhưng chưa assert), 6 EmptyState, ErrorState retry, pagination buttons, `Tạo mới`/`Làm mới` disabled states, KPI content. e2e: 9/9 @critical desktop-width; `/operations` không thuộc `representativeProtectedRoutes` (design-system-matrix L26-34) → viewport matrix 1440/390/320 × light/dark không bao giờ tới Operations — trùng Phase C1 còn mở của plan 09-12. | **P1** | Fan-out audit #2 §(a)/(d) đầy đủ |
| **OPS-S10** | **Utilities expander mobile là chủ đích nhưng lệch default giữa 2 mode** (mobile ẩn mặc định + nút "Mở tiện ích", desktop hiển thị đầy) — đã có test aria-expanded L596-602, giữ nguyên IA (B1). Chỉ cần bổ test desktop default (hiện chưa có) + cân nhắc hiển thị số lượng chờ (nếu cần). Ghi nhận để không re-flag. | P3 | OperationsPage L1148-1155 |
| **OPS-S11** | **Mobile title 15px vs chuẩn mobile identity 20px.** Mobile ≤767px PageHeader title còn 15px (60-view-language L1543) trong khi DS §8.2 + `.mobile-page-header__title` chuẩn 20px/800 (chỉ MobileCalendarView dùng). Đây là **nợ chung của cả nhóm responsive pages** (Finance/Settings/ParishProfile cùng dùng PageHeader trong responsive shell), không riêng Operations → cần **quyết định ở cấp DS** (exempt responsive pages hay đưa `.mobile-page-header` variant), không fix đơn lẻ ở Operations. | P3 | 60-view-language.css L1536-1560; DS §8.2 L237-240 |
| **OPS-S12** | **Page tự giữ idempotency-key map riêng** (commandKeys ref L229-241, ~15 dòng) trong khi mọi sub-component đã dùng hook `useStableCommandKey` (TaskChecklistSection L30, WorkstreamPanel L55, EventReminderForm L35…) — drift implementation sau pass P1-5. | **P2** | OperationsPage.tsx L229-241 vs hooks/useStableCommandKey |

### Những gì đã đồng bộ (đừng re-flag — kết quả xác minh tích cực)

- **0 mode-branch trong 13 sub-component** — markup giống hệt 2 mode; ModalShell đảm nhiệm responsive sheet.
- **0 raw pastel color; 0 hand-rolled overlay/popover** trong sub-components; desktop create-menu là dual-mode có chủ đích (`A5'` L181-211 + mobile ModalShell L1292-1363, có test).
- Row-click mouse-only là **thiết kế có chủ đích** (`A6'`, test L530: article không tabindex, keyboard đi qua nút "Xem chi tiết").
- Per-row busy (P1-8), abortable superseded loads (P1-4), scoped reason drafts (P1-9), stable keys (P1-5), error banner (P1-6) — đã có test hồi quy.
- Mobile DOM reading order Inbox → My Tasks → Events → KPI → Utilities đúng IA B1 và có test (L574).
- `EVENT_TYPE_OPTIONS` + `OPERATIONS_POSITION_LABELS_VI` đã trung tâm hóa đúng (A4').
- Không sub-component nào fixed/sticky/bottom-anchored → không thể đụng bottom nav.

---

## 4. Nguyên nhân gốc (root causes)

1. **Nhánh mobile dùng CSS breakpoint `sm:` (640px) thay vì mode boundary (1024px)** — sinh ra OPS-S2b (tablet band mất FAB) và góp phần S3.
2. **Dùng `embedded` cho một route không có shell cha** — hợp đồng `embedded-page-section` bị áp sai ngữ cảnh (OPS-S1).
3. **Pass remediation 0560dc9 tập trung authority/OCC/idempotency + mobile IA nhánh chính**, chưa có đợt nào chạy **song song hai viewport thật** (Phase C1 chưa từng chạy cho `/operations`) — nên S1/S2/S3 không bị bắt.
4. **Vocabulary sinh cục bộ theo từng form** khi feature lớn lên (274a963 +1636 dòng) — chưa có module labels trung tâm cho Operations.

---

## 5. Kế hoạch nâng cấp (upgrade plan)

> Nguyên tắc giữ nguyên từ plan 09-12: online-first không optimistic mutation (ADR-109/110); một shell contract; IA mobile **my work → claim/accept → blockers → events**; evidence-first (Vitest + viewport check trước device QA). Mọi phase dưới đây là **UI-layer only** — không chạm API/store semantics, permission boundary hay OCC.

### Phase U1 — Mobile skeleton fixes (P0, ~1 ngày) — làm ngay

| ID | Work | Done when |
| --- | --- | --- |
| U1.1 (S1) | Bỏ `embedded={isMobileLayout}` ở cả 2 nhánh (L1193, L1197) → dùng `responsive-page-shell--wide` chuẩn như mọi responsive page (mobile tự nhận gutter 16px + max 760px; desktop ≥1024 giữ 80rem). Kiểm tra không double-gutter ở desktop (`.app-main-content` đã có padding; OrganizationDashboard là tiền lệ đúng). | Render `/operations` ở 390px: mọi card cách mép ≥16px; desktop ≥1024 không đổi layout (so sánh screenshot) |
| U1.2 (S2) | FAB chuyển sang class `.mobile-floating-action` (xóa `fixed bottom-20 right-4 h-14 w-14 sm:hidden …`); giữ điều kiện render `canCreateAnything && canMutate && isMobileLayout`; bỏ `sm:hidden` (mode branch đã đủ) → tablet band 640–1023px có lại FAB neo đúng `--mobile-nav-total-height`. | FAB hiện đúng vị trí trên iPhone (safe-area 34px) không đè bottom nav; tablet 768px mobile-mode có FAB; test L622 cập nhật assert class mới + thêm negative tests (offline/cache/no-perm) |

**Verification U1:** `pnpm vitest run src/__tests__/components/OperationsPage.test.tsx` (sửa 2 assert liên quan FAB class), thêm 2 test mới; `pnpm build` (type-check); manual 390/768/1280 bằng dev server. Risk thấp: chỉ shell class + 1 button class.

### Phase U2 — Vocabulary & DS convergence (P1, ~2-3 ngày)

| ID | Work | Done when |
| --- | --- | --- |
| U2.1 (S5) | Tạo `src/components/operations/operationsLabels.ts` (mở rộng operationsViewHelpers): `statusLabel`, `statusTone`, `reminderKindLabel`, `reminderStatusLabel`, `transitionLabel`, `EVENT_STEPS`, `workstreamRoles` (gộp roles/memberRoles), `assignmentRoleOptions`, `priorityOptions`, `candidateOptionStrings`, `writableStatuses` (thay 4 bản predicate bằng `canCreateEventTask` đã có). Rồi thay toàn bộ bản sao cục bộ (page L65-101 + 5 form). | Grep không còn `localDateTime`, `"PENDING"`-hiển-thị-raw (EventReminderForm L132), duplicate role/priority maps; reminder hiển thị "Đang chờ" ở mọi nơi |
| U2.2 (S5d) | Visibility INTERNAL/PUBLIC_SUMMARY: 3 hand-rolled copy → 1 component dùng DS `SegmentedControl` + 1 đoạn copy duy nhất (đặt cạnh operationsLabels). | 3 form dùng chung 1 control; copy giống nhau |
| U2.3 (S3) | Bọc lifecycle stepper trong `overflow-x-auto` + snap wrapper (pattern `.view-tabs`), giữ ngưỡng desktop không cuộn. | 320px: cuộn ngang được đầy đủ 6 bước, không chữ bị cắt |
| U2.4 (S4) | KPI card filter: `Surface as="button" type="button"` + `aria-pressed` theo filterKey (Surface đã hỗ trợ as='button'); 2 card không filter (Sự kiện) giữ div. | Keyboard focus + Enter chuyển filter được; `axe` không còn violation trên KPI strip |
| U2.5 (S6) | TaskAssignForm: empty state → DS `EmptyState`; thêm `sm:grid-cols-2` cho khối input chính (theo EventTaskForm); role labels dùng map trung tâm U2.1 | Không còn raw `<p>` empty state; desktop form 2 cột |
| U2.6 (S8, S12, S7) | WorkstreamPanel checkbox `min-h-11`; page thay commandKeys ref bằng `useStableCommandKey` hook; chuẩn hóa feedback: mutation-success → toast, load-error → inline alert, WorkstreamPanel status → Badge + statusTone trung tâm. | Grep `commandKeys` ở page = 0; feedback nhất quán theo bảng quy ước mới |

**Verification U2:** full `OperationsPage.test.tsx` + `OperationsForms.test.tsx` + sub-component tests (WorkstreamPanel 8 its, EventReminderForm 6 its…); `pnpm lint` + `lint:ds` (nếu có guard DS); grep-negative checklist trên.

### Phase U3 — Test & viewport matrix (P1, ~2 ngày) — đóng Phase C1 của plan 09-12

| ID | Work | Done when |
| --- | --- | --- |
| U3.1 | Thêm `/operations` vào `representativeProtectedRoutes` của `e2e/design-system-matrix.ts` → chạy a11y + visual matrix 1440/390/320 × light/dark cho route này | Matrix CI phủ `/operations`; snapshot baseline được duyệt |
| U3.2 | Thêm **1 e2e mobile journey** tối thiểu (`operations.spec.ts`, viewport 390×844 hoặc theo policy mở rộng `08_E2E_TESTING_STRATEGY.md` L65): login staff → mobile stack hiện đúng thứ tự → FAB tạo sự kiện → bottom-sheet → inbox accept dispatch | E2E @critical mobile đầu tiên của Operations pass trong CI |
| U3.3 | jsdom bổ khuyết 15 gaps (fan-out #2 §d): FAB negative (offline/cache/no-perm/desktop), desktop layout order, cache-banner copy (OPS-M5), 6 EmptyState, ErrorState retry, pagination buttons disabled-gating, `Tạo mới`/`Làm mới` disabled, KPI content + keyboard, mobile bottom-sheet dismissal (Escape/overlay cho variant mobile) | Mỗi gap có ít nhất 1 assertion tên rõ ràng trong describe hiện có |
| U3.4 | Smoke 200% zoom + dark-mode spot-check `/operations` (đóng C2/C3) | Không overflow/lost content ở 200%; dark tokens đúng (screenshot) |

**Verification U3:** `pnpm e2e` (hoặc project Playwright tương ứng); CI xanh.

### Phase U4 — Polish & structural (P2/P3, tuần 2+, theo trigger)

| ID | Work | Trigger |
| --- | --- | --- |
| U4.1 (S11) | **Quyết định cấp DS** về mobile page identity cho responsive pages (15px PageHeader vs 20px `.mobile-page-header`) — ADR nhỏ; nếu quyết định 20px thì áp cho cả nhóm responsive pages, không riêng Operations | Cần product/DS owner chốt; chặn ở đó, không tự quyết |
| U4.2 | Tách monolith OperationsPage → orchestrator mỏng (giai đoạn D1 của plan 09-12, giữ sau khi U1-U3 ổn định để tránh diff lớn vô ích) | Sau khi U2/U3 merge + không còn thay đổi IA |
| U4.3 | `MobileOperationsHome` riêng (D2 cũ) — **chỉ nếu** sau U1/U2 thực tế điện thoại vẫn quá dày | Real-device pilot (U5) báo dense |
| U4.4 (OPS-M8) | Real-device QA iOS Safari (keyboard, safe-area, zoom) | Sau U3 |

### Thứ tự thực thi đề xuất

1. **U1.1 + U1.2** (P0 — mobile đang broken khung hiển thị + tablet mất create path)
2. **U2.1 + U2.2** (vocabulary trung tâm — nền cho phần còn lại)
3. **U2.3 → U2.6**
4. **U3.1 + U3.2** (chốt hạ tầng verify để mọi thay đổi sau có lưới an toàn)
5. **U3.3 + U3.4**, rồi U4 theo trigger.

---

## 6. Risks

- **U1 đổi shell class** có thể ảnh hưởng selector test đang truy `.embedded-page-section`? — đã kiểm: test OperationsPage chỉ assert role/label, không assert shell class; chỉ 2 assert FAB class (`toHaveClass('fixed')`, L633) cần cập nhật theo primitive mới.
- **U1.2 bỏ `sm:hidden`**: cần đảm bảo không render FAB ở desktop mode (điều kiện `isMobileLayout` đã chặn; viewport 640-1023 desktop-mode không có FAB vì isMobileLayout=false — đúng ý).
- **Viewport matrix (U3.1) có thể phơi thêm finding** (stepper S3, KPI text-overflow, dark-mode edge) — dự kiến có follow-up nhỏ; đó là mục đích của matrix.
- **e2e mobile mới (U3.2)** tăng CI time — cân nhắc project riêng `mobile-ops` hoặc gộp vào project chạy song song hiện có.
- **U2.1 đổi nhãn hiển thị** (ví dụ "PENDING"→"Đang chờ" trong reminder tab, role/priority labels) — là behavior change UI có chủ đích, không phải refactor ngầm; cập nhật test khớp + ghi chú trong PR.

---

## 7. Đối chiếu kế hoạch cũ

| Plan 09-12 | Trạng thái sau audit này |
| --- | --- |
| Phase A (discoverability) | Done (A1-A4) — giữ |
| Phase B (B1 stack, B3 sheet, B4 banner, B5 chips aria) | Done; B5 nốt phần 44px-DS-chip hóa → gộp vào U2 nếu DS cập nhật FilterChips ≥44px (hiện chips hand-rolled có lý do B5 — giữ, chỉ cần lint:ds bỏ qua có marker) |
| Phase C (C1 viewport, C2 dark, C3 zoom, C4 busy) | C4 done (P1-8); C1-C3 → **U3** |
| Phase D (D1 split, D2 MobileHome, D3 ADR offline) | → **U4** (giữ trigger gốc) |

---

*Tạo bởi agent nghiên cứu 2026-09-13 (audit 2 viewport + 2 fan-out). Tiền thể: `docs/OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md`; companion full-feature: `docs/OPERATIONS_FULL_FEATURE_AUDIT_2026-09-12.md`.*
