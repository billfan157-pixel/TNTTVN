# Audit Frontend Architecture, UX & Performance — Catevia/TNTTVN

Ngày: 2026-09-06. Snapshot audit: branch `main`, HEAD `c1e85e72e50a3ad50c9424181f4f123200b0578b`, đồng bộ `origin/main` (`0 ahead / 0 behind`). Working tree tại lúc bắt đầu chỉ có một file untracked không liên quan: `docs/assessment-question-bank-exam-omr-audit-2026-09-06-r1.md`; file đó không được dùng làm authority và không bị sửa.

Đây là **read-only audit** của current implementation. Audit không sửa source, không refactor và không triển khai remediation. Production DB, telemetry production và thiết bị iOS/Android thật không được truy cập.

> **Remediation update 2026-09-07:** phần 1–14 bên dưới được giữ nguyên như baseline tại HEAD đã audit. Các finding đã được sửa sau snapshot không bị xóa/viết lại; trạng thái current remediation, evidence mới và gate còn mở nằm ở **§15**.

## 1. Kết luận điều hành

Frontend hiện tại có nền tảng tốt hơn một SPA “store-driven” thông thường: route policy tập trung; tất cả page chunk được lazy-load có retry; shell mobile/desktop chia ở một breakpoint; dữ liệu offline nhạy cảm được namespace theo parish + user và mã hóa; sync có durable queue, lease, idempotency/OCC và pull reconciliation; modal lifecycle, design tokens và automated a11y gate đã được chuẩn hóa đáng kể.

Tuy nhiên, audit xác minh được **hai lỗi P0 cùng một root cause**: UI coi local optimistic mutation là “đã lưu” trước khi thao tác tồn tại bền vững trong Dexie queue. Attendance còn tự tạo kết quả `saved` cho mọi record; Grade trả `void`, xóa dirty set rồi hiện “Đã lưu”. Nếu mã hóa/IndexedDB enqueue thất bại, người dùng nhận xác nhận sai và thay đổi có thể mất vĩnh viễn.

Ngoài ra có năm vấn đề P1/P2 đáng xử lý:

1. query `semester` nhận mọi string rồi cast thẳng thành `1 | 2`; URL invalid có thể đưa store vào `NaN/3`, còn thao tác reset filter không xóa query cuối cùng;
2. login lần đầu trên scope/device mới không refetch settings và academic-year SSOT sau khi auth thành công, nên UI/report có thể dùng default policy/parish/year;
3. native WebView luôn chọn mobile shell nhưng CSS ẩn toàn bộ shell từ 1024px, tạo white screen ở native viewport đủ rộng;
4. desktop grade cells dùng uncontrolled input trong renderer column được tái tạo mỗi render; pull 30 giây có thể remount cell và xóa giá trị người dùng đang gõ trước blur;
5. zoom guard chặn pinch zoom toàn app — một policy có chủ đích nhưng không tương thích yêu cầu resize text/zoom 200% của WCAG 2.2 AA.

Production build thành công và cho footprint startup **79 assets, 937,57 KiB raw / 267,86 KiB gzip** (gồm CSS). Đây là số đo bundle, chưa phải latency/device-performance. PWA precache 238 entries / 2.549,80 KiB; `xlsx` và `mammoth` được loại khỏi precache đúng chủ đích. Targeted Vitest pass 9 files / 44 tests; benchmark riêng pass 2 files / 7 tests; Playwright axe/layout pass 33/33. Các suite xanh không phủ đúng failure paths P0, native ≥1024, URL invalid/reset, fresh-login bootstrap, zoom 200% hoặc focused-cell remount.

## 2. Phương pháp và chuẩn bằng chứng

Audit reconstruct theo đường chạy:

```text
route policy / router guard / search parser
  → RootLayout + workspace + effective mode
  → desktop/mobile shell + page composition
  → component local draft + Zustand stores
  → API direct path hoặc encrypted Dexie queue
  → sync claim/batch/retry/OCC/idempotency
  → server acknowledgement + pull/reconciliation
  → UI success/error/dirty state
```

Mức bằng chứng:

- **Verified:** current source tạo ra kết quả xác định hoặc current automated test/build tái hiện điều kiện tương ứng.
- **Verified conditional:** đường lỗi xác định nhưng cần trigger cụ thể chưa được chạy trên production/device thật.
- **Measured:** command hiện tại trả số đo; chỉ kết luận trong phạm vi môi trường test/build đó.
- **Code-supported risk:** cấu trúc có cơ chế gây rủi ro, nhưng chưa có runtime timing/field evidence để gọi là defect performance.
- **Unknown:** cần production config, RUM, device/corpus hoặc product decision ngoài repo.

Tài liệu/ADR chỉ dùng làm normative evidence. Không dùng claim cũ làm bằng chứng rằng code hiện tại đúng.

## 3. Kiến trúc frontend thực tế

### 3.1 Routing, policy và shell

`router.tsx` khai báo 24 path ứng dụng, mỗi page là `lazyWithRetry`; protected routes lấy role từ `ROUTE_POLICIES`, public auth/verify đi ngoài shell dữ liệu. Search schema chỉ tồn tại ở Students, Grades, Attendance và Finance. Evidence: [router.tsx](../src/router.tsx#L9), [routePolicy.ts](../src/constants/routePolicy.ts#L47).

`RootLayout` là composition root runtime của frontend: auth-ready/public-shell, workspace memory, route↔filter sync, semester restriction, class-scope cleanup, sync engine, reminders, error watcher, scroll restoration, mobile preload và global modals. Nó chọn `MobileAppShell` hoặc desktop header/sidebar bằng `useEffectiveMode`. Evidence: [RootLayout.tsx](../src/components/common/RootLayout.tsx#L67), [RootLayout.tsx](../src/components/common/RootLayout.tsx#L192), [RootLayout.tsx](../src/components/common/RootLayout.tsx#L256).

Đây là responsibility concentration có thật, nhưng chưa tự nó là defect: logic ở đây chủ yếu là cross-cutting composition. Consequence đã chứng minh chỉ được report ở các finding cụ thể bên dưới.

### 3.2 Role × workspace × route matrix

| Route/workspace | admin | chunhiem | phuta | phuhuynh | Shell/task |
|---|---:|---:|---:|---:|---|
| `/dashboard` academic | yes | yes | yes | yes | staff dashboard; parent được route nhưng product landing riêng là `/parent` |
| `/students`, `/grades`, `/attendance`, `/reports` | yes | yes | yes | no | core academic workflows |
| `/leave-requests` | yes | yes | yes | no | attendance sub-workflow |
| `/parish`, `/parish-profile`, `/catechists` | yes | yes | yes | no | organization workspace |
| `/calendar`, `/notices`, `/settings`, `/feedback` | yes | yes | yes | yes | shared/organization UX; server vẫn là authority |
| `/parent` | no | no | no | yes | parent workspace |
| `/users`, `/classes`, `/academic-years`, `/audit-logs`, `/management` | yes | no | no | no | admin governance |
| `/finances` | yes | no | no | no | organization finance |

Desktop sidebar và mobile navigation đều derive access/active route từ policy thay vì duy trì role map độc lập. Mobile primary tabs chỉ giữ high-frequency destinations; secondary routes nằm trong control sheet/workspace navigation. Evidence: [DesktopSidebar.tsx](../src/components/desktop/DesktopSidebar.tsx#L49), [MobileBottomNav.tsx](../src/components/mobile/MobileBottomNav.tsx#L1), [MobileTopBar.tsx](../src/components/mobile/MobileTopBar.tsx#L40).

Frontend policy là UX gate, không phải security authority. API authorization vẫn nằm ở backend; audit này không lặp lại Auth/RBAC trừ khi ảnh hưởng trực tiếp tới trạng thái/UX frontend.

### 3.3 State ownership map

| State | Client owner | Persistence/scope | Server authority & reconciliation |
|---|---|---|---|
| auth/session | `authStore` + API core token memory | minimal marker localStorage; encrypted snapshot in scoped Dexie | refresh cookie + `/auth/me`; request generation rejects stale-session response |
| active workspace | `RootLayout` local state | localStorage key `parishId:userId` | UX-only; route policy constrains accessible workspace |
| branch/class/semester/search/view mode | `filterStore` + URL bridge | encrypted scoped Dexie; selected fields projected to URL | UX state; class list and semester state constrain validity |
| students/classes | `studentStore`, `classStore` | encrypted scoped Dexie | API + delta/full pull; sync remaps temporary IDs before dependents |
| grades/daily grades | `gradeStore`, `dailyGradeStore` | encrypted scoped Dexie + durable mutation queue | server validates/scopes; pull merges by natural key and protects pending records |
| attendance | `attendanceStore` | encrypted scoped Dexie + durable queue | direct online batch; OCC version; offline flush and reconciliation |
| exams/results | `examStore` | encrypted scoped Dexie + mutation ledger/queue | server scoring/finalization and result acknowledgements |
| settings/policy | `settingsStore` | encrypted scoped Dexie | `/api/settings`; default is fallback, not authoritative parish configuration |
| academic year | `academicYearStore` + class catalog | encrypted scoped Dexie | class academic-year endpoint; local calendar fallback only when unavailable |
| notices | `noticeStore` | encrypted scoped Dexie | pull/sync, tenant scoped |
| parish profile/events, finance, leave requests, promotions | dedicated non-persisted stores | memory/request state (events have their own cache path) | direct server list/mutation and refetch policies |
| modal/toast/transient UI | `uiStore`, `toastStore`, component state | memory | no server authority |
| sync status/queue/conflicts | `syncStore` + `syncCoordinator` | Dexie queue rows own exact parish + user | claim/lease/compact/retry/failed diagnostics; pull watermark commits only on successful pull |

The critical ownership contract should be: **a local write is acknowledged to the user only after either server acknowledgement or durable queue acknowledgement**. FUX-01/FUX-02 violate exactly this contract; the deeper sync engine itself preserves it once a row exists.

## 4. Verified strengths

### S1 — Route-policy SSOT và fail-closed UX navigation

Router guard, workspace, desktop tab và mobile tab share `ROUTE_POLICIES`; inaccessible route redirects rather than rendering an unauthorized workspace. Route components are preloadable and failures retry without silently reloading from background preload. Evidence: [routePolicy.ts](../src/constants/routePolicy.ts#L47), [router.tsx](../src/router.tsx#L90), [lazyWithRetry.ts](../src/utils/lazyWithRetry.ts#L10). Targeted route/lazy tests passed.

### S2 — Server/session authority không bị thay bằng cache

Access token memory-only; API request restores through HttpOnly refresh flow and rejects a response if `authSessionGeneration` changed while in flight. Auth snapshot and persisted domain stores are activated only after exact `(parishId,userId)` scope exists. Evidence: [core.ts](../src/lib/api/core.ts#L40), [core.ts](../src/lib/api/core.ts#L235), [authStore.ts](../src/stores/authStore.ts#L55), [tenantScope.ts](../src/lib/tenantScope.ts#L30).

### S3 — Offline queue sau khi enqueue có ownership và recovery rõ

`syncStore.addOp` encrypts payload, overwrites caller-supplied owner with current parish/user, persists transactionally, compacts natural duplicates and only then resolves. Sync claims operations, restores expired processing leases, orders parent creates before child grades/attendance, remaps IDs, isolates batch failures and retains permanent failures for diagnostics. Evidence: [syncStore.ts](../src/stores/syncStore.ts#L252), [syncCoordinator.ts](../src/lib/syncCoordinator.ts#L142).

### S4 — Responsive shell contract rõ ở web

Web viewport uses the same 1024px boundary in JS and CSS; below it is mobile/tablet touch shell, from it is desktop. Desktop pages use explicit `full|wide|narrow` width tiers. The 33-test runtime matrix found no horizontal overflow on its selected 320/390/1440 observations. Evidence: [useEffectiveMode.ts](../src/hooks/useEffectiveMode.ts#L12), [40-mobile-shell.css](../src/styles/design-system/40-mobile-shell.css#L607), [DesktopAppShell.tsx](../src/components/desktop/DesktopAppShell.tsx#L11).

### S5 — Design-system anti-drift có scope và giới hạn được nói đúng

Ordered CSS graph, semantic tokens/primitives and touch rules are guarded by a linter. Current run: 0 violations / 127 scanned non-exempt TSX files. The command explicitly says it does not certify WCAG or visual conformance, which avoids false assurance. Evidence: [index.css](../src/index.css), [design-system-lint.mjs](../scripts/design-system-lint.mjs), [03_DESIGN_SYSTEM.md](03_DESIGN_SYSTEM.md#L387).

### S6 — Accessibility plumbing tốt ở các dialog chính

`useAccessibleDialog` centralizes focus trap/restore, nested Escape arbitration and body scroll lock; most custom modals use it, and `ModalShell` owns correct dialog semantics. Playwright axe WCAG automated subset passed protected/public matrices in light/dark. Evidence: [useAccessibleDialog.ts](../src/hooks/useAccessibleDialog.ts#L29), [ModalShell.tsx](../src/components/common/ModalShell.tsx#L27), [a11y.spec.ts](../e2e/a11y.spec.ts#L77).

### S7 — Performance architecture có chủ đích

All pages are route-lazy; expensive grade subviews and exam/import modals are nested-lazy. PWA excludes user-triggered `xlsx` and `mammoth` chunks from install precache. Current build kept them isolated at 493,22 KiB and 498,80 KiB raw respectively. Matrix pre-index benchmark measured 1,03 ms vs 10,78 ms legacy for 500 students × 5.000 grades. Store benchmark measured 14,08 ms for 1.000 grade updates into 5.000 rows and 7,61 ms for attendance in this dev environment. Evidence: [vite.config.ts](../vite.config.ts#L47), [GradesPage.tsx](../src/pages/GradesPage.tsx#L12), [desktopGradeMatrixGoldenAndBenchmark.test.ts](../src/__tests__/desktopGradeMatrixGoldenAndBenchmark.test.ts#L111).

### S8 — Error/loading/motion states có shared contract

Page suspense emits a semantic busy status and skeleton; route transitions respect reduced motion; expected View Transition interruption is consumed while application errors still reach ErrorBoundary. Chunk failures offer explicit retry/reload instead of silent blank state. Evidence: [RootLayout.tsx](../src/components/common/RootLayout.tsx#L39), [router.tsx](../src/router.tsx#L34), [ErrorBoundary.tsx](../src/components/common/ErrorBoundary.tsx#L29).

## 5. Verified defects

### FUX-01 — P0 — Attendance báo “đã lưu” trước durable enqueue

- **Severity / confidence:** P0 / High / Verified source path.
- **Role/task:** admin, chủ nhiệm; mobile/desktop bulk attendance khi offline hoặc request online rơi vào network fallback.
- **Path:** `MobileAttendanceView|DesktopAttendanceGrid → attendanceStore.batchSaveAttendance → queueOffline → syncService.syncBatchSaveAttendance → syncStore.addOp → encrypt/Dexie transaction`.
- **Invariant:** success chỉ được hiển thị sau server ack hoặc durable queue ack.
- **Actual:** `queueOffline` optimistic-update local store, gọi enqueue fire-and-forget, nuốt rejection vào `console.warn`, rồi tự tạo response có `successCount = records.length` và mọi item `status='saved'`. `addOp` có nhiều await có thể reject: encrypt, `syncQueue.put`, compact/update/delete và refresh count. Mobile hiện “Đã lưu điểm danh…”; desktop toast “Đã lưu điểm danh thành công!”.
- **Evidence:** [attendanceStore.ts](../src/stores/attendanceStore.ts#L205), [attendanceStore.ts](../src/stores/attendanceStore.ts#L240), [syncStore.ts](../src/stores/syncStore.ts#L252), [MobileAttendanceView.tsx](../src/components/mobile/MobileAttendanceView.tsx#L216), [DesktopAttendanceGrid.tsx](../src/components/desktop/DesktopAttendanceGrid.tsx#L110).
- **Impact:** khi WebCrypto/IndexedDB quota/transaction/storage fail, sheet có thể biến mất sau reload mà UI đã xác nhận lưu. Đây là silent data loss và misleading authority.
- **Remediation direction (not implemented):** make `queueOffline` async; await durable enqueue before applying success contract; on failure preserve/editable draft and return/throw explicit failure; add regression with real rejected `addOp`, not only mocked delayed batch response.

### FUX-02 — P0 — Grade dirty state bị clear trước durable enqueue và UI xác nhận sai

- **Severity / confidence:** P0 / High / Verified source path.
- **Role/task:** admin/chủ nhiệm nhập điểm matrix hoặc import grade.
- **Path:** `DesktopGradeMatrix.saveDirtyGrades → gradeStore.batchSaveGrades → fire-and-forget syncBatchUpsertGrades → syncStore.addOp`.
- **Invariant:** dirty state survives until durable ownership; “Đã lưu” distinguishes local durable vs server synchronized.
- **Actual:** `batchSaveGrades` is a synchronous Zustand setter returning `void`; it schedules enqueue without awaiting and catches failure internally. Caller clears `dirtyIdsRef` before calling it, `await`s `void`, then sets `isDirty=false`, `isSaved=true`. Header can subsequently say either “Đã lưu” or “Đã đồng bộ máy chủ” while queue count remains zero because enqueue failed.
- **Evidence:** [gradeStore.ts](../src/stores/gradeStore.ts#L138), [gradeStore.ts](../src/stores/gradeStore.ts#L183), [DesktopGradeMatrix.tsx](../src/components/desktop/DesktopGradeMatrix.tsx#L84), [DesktopGradeMatrix.tsx](../src/components/desktop/DesktopGradeMatrix.tsx#L522), [syncService.ts](../src/lib/syncService.ts#L40).
- **Impact:** a storage/encryption failure can silently lose grades and their dirty recovery signal. Import flow inherits the same store contract.
- **Remediation direction (not implemented):** return a durable receipt/promise; clear dirty IDs only after success; keep failed records dirty and surface a blocking error; represent `local-durable`, `sync-pending`, `server-acked` as distinct states.

### FUX-03 — P1 — URL filter bridge accepts invalid semester and cannot reliably canonicalize defaults

- **Severity / confidence:** P1 / High / Verified deterministic source behavior.
- **Role/task:** staff deep-link/reload/share Grades or Students filters.
- **Path:** `router.validateSearch → useFilterSearchSync URL→store → filterStore → page/store writes`; reverse path is `filterStore.subscribe → URLSearchParams → navigate`.
- **Invariant:** URL and store converge on one valid, canonical state; semester is only 1 or 2.
- **Actual:** router validates `semester` only as arbitrary string, then hook does `Number(semester) as 1|2` without runtime check. `?semester=foo` writes `NaN`; `?semester=3` writes 3 and can propagate into grade composition. In store→URL direction, delete branches do not set `changed=true`, and if the last param is deleted line 81 returns early, leaving stale query text that can rehydrate on reload.
- **Evidence:** [router.tsx](../src/router.tsx#L142), [router.tsx](../src/router.tsx#L160), [useFilterSearchSync.ts](../src/stores/useFilterSearchSync.ts#L32), [useFilterSearchSync.ts](../src/stores/useFilterSearchSync.ts#L61).
- **Impact:** invalid deep link can render no active semester, empty/wrong dataset and enqueue invalid grade payload; reset filters can appear reset until reload, then stale URL resurrects them.
- **Remediation direction (not implemented):** validate `z.enum(['1','2'])`, normalize invalid/missing params, treat deletion as a change and always navigate to the canonical empty search when needed; add reload/back-forward/reset regressions.

### FUX-04 — P1 — Fresh login does not bootstrap server settings/academic-year SSOT

- **Severity / confidence:** P1 / High / Verified conditional on a new/empty scoped cache and non-default parish configuration.
- **Role/task:** all roles immediately after first login on a new device/scope; dashboards, grade calculations, reports/prints, attendance eligibility and semester display.
- **Path:** `main setTimeout(fetchAll/settings/year) [runs before login] → authStore.login → reset defaults → activate/rehydrate empty scope → isAuthenticated=true → useSyncEngine.runInitialSync → fetchAllData`.
- **Invariant:** after online authentication, server-owned configuration required for calculations/rendering is loaded or UI clearly remains unready.
- **Actual:** startup calls settings/year once. With no prior marker/token it returns early. Successful `login` rehydrates persisted stores but does not call either fetch. `fetchAllData` pulls students, grades, attendance, classes and notices, not settings or `academicYearStore`. `SettingsPage` does not fetch on mount; only admin `AcademicYearPage` retries the year list. Defaults therefore remain valid-looking.
- **Evidence:** [main.tsx](../src/main.tsx#L28), [main.tsx](../src/main.tsx#L43), [authStore.ts](../src/stores/authStore.ts#L155), [settingsStore.ts](../src/stores/settingsStore.ts#L58), [academicYearStore.ts](../src/stores/academicYearStore.ts#L39), [syncCoordinator.ts](../src/lib/syncCoordinator.ts#L456), [AcademicYearPage.tsx](../src/pages/AcademicYearPage.tsx#L79).
- **Impact:** custom weights, attendance thresholds, parish/diocese name, current semester or date ranges can display and print using plausible defaults. Server-side protected decisions remain authoritative, but human-facing grade/report projections can be misleading.
- **Remediation direction (not implemented):** one post-auth bootstrap owner should await all required reference/config reads per scope and expose readiness/error; remove the unauthenticated one-shot race; regression must start with empty Dexie and non-default server settings.

### FUX-05 — P1 — Native viewport ≥1024px renders a shell CSS hides completely

- **Severity / confidence:** P1 / High / Verified conditional; device prevalence unknown.
- **Role/task:** any authenticated native user on wide tablet/foldable/desktop-mode/external-display WebView with CSS viewport ≥1024px.
- **Path:** `Capacitor.isNativePlatform → useEffectiveMode='mobile' → RootLayout renders MobileAppShell → @media(min-width:1024px) display:none`.
- **Invariant:** JS shell selection and CSS visibility use the same predicate for every runtime.
- **Actual:** native bypasses viewport tracking and always returns mobile; CSS has no native exception and hides `.mobile-app-shell` and `.mobile-bottom-nav` at 1024px.
- **Evidence:** [useEffectiveMode.ts](../src/hooks/useEffectiveMode.ts#L18), [useEffectiveMode.ts](../src/hooks/useEffectiveMode.ts#L37), [RootLayout.tsx](../src/components/common/RootLayout.tsx#L192), [40-mobile-shell.css](../src/styles/design-system/40-mobile-shell.css#L607).
- **Impact:** complete blank authenticated app at the trigger, not merely a cramped layout.
- **Remediation direction (not implemented):** derive both render and visibility from one capability/breakpoint contract, or explicitly scope CSS guard to web desktop; test mocked native at 1023 and 1024 plus an actual supported tablet profile.

### FUX-06 — P1 — Unconditional JS zoom guard blocks the primary user-agent enlargement mechanism

- **Severity / confidence:** P1 / High / Verified policy and code; exact assistive-tech behavior varies by platform.
- **Role/task:** low-vision/touch users on public and authenticated screens.
- **Path:** `main.tsx import/call installZoomGuard → gesturestart/change/end preventDefault + touchmove(2 fingers) preventDefault`.
- **Invariant:** content can be enlarged to 200% without loss of function, or an equivalent in-app mechanism exists.
- **Actual:** guard installs globally before render and intentionally prevents pinch zoom; no equivalent full-app text scaling control was found. Current axe suite disables its meta-viewport rule and cannot detect this JS event policy. W3C’s WCAG 2.2 guidance states text must be resizable to 200%, with zoom as a standard user-agent mechanism: [Understanding SC 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).
- **Evidence:** [main.tsx](../src/main.tsx#L21), [zoomGuard.ts](../src/lib/zoomGuard.ts#L1), [a11y.spec.ts](../e2e/a11y.spec.ts#L59).
- **Impact:** users who rely on pinch zoom cannot enlarge dense rosters, grade matrices or forms. Automated a11y green cannot be presented as WCAG 2.2 AA compliance.
- **Remediation direction (not implemented):** remove the global prevention unless a narrowly evidenced OMR/camera surface needs it; scope any exception to that surface and verify 200% zoom/reflow across representative workflows.

### FUX-07 — P1 — Grade cell renderer remount can discard focused, unblurred input during periodic pull

- **Severity / confidence:** P1 / Medium-High / Verified code-supported failure path; no browser timing probe was added because this audit is read-only.
- **Role/task:** admin/chủ nhiệm typing in desktop grade matrix while the 30-second sync pull completes.
- **Path:** `useSyncEngine interval 30s → fetchGrades(updatedAfter) → new grades array → DesktopGradeMatrix merge setMatrixData → render → createColumnHelper() new object → columns recreated → flexRender function component identity changes → uncontrolled input remount`.
- **Invariant:** an in-progress edit remains owned by the input/component until commit/cancel; background synchronization cannot erase it.
- **Actual:** score inputs use `defaultValue` and only commit on blur. `columnHelper` is constructed inside render and is a dependency of `useMemo`, so cell-renderer functions are recreated on every render. TanStack `flexRender` renders those functions as React component types. A store-driven rerender can therefore replace the focused DOM input with its last matrix value before `onBlur` captures the typed value.
- **Evidence:** [useSyncEngine.ts](../src/hooks/useSyncEngine.ts#L7), [gradeStore.ts](../src/stores/gradeStore.ts#L100), [DesktopGradeMatrix.tsx](../src/components/desktop/DesktopGradeMatrix.tsx#L324), [DesktopGradeMatrix.tsx](../src/components/desktop/DesktopGradeMatrix.tsx#L345), [DesktopGradeMatrix.tsx](../src/components/desktop/DesktopGradeMatrix.tsx#L419), [DesktopGradeMatrix.tsx](../src/components/desktop/DesktopGradeMatrix.tsx#L581).
- **Impact:** a narrow but recurring timing window can silently drop the number currently being typed and move focus, degrading the highest-frequency desktop workflow.
- **Remediation direction (not implemented):** stabilize column definitions/render component identity and give each edit explicit draft ownership (controlled cell or isolated memoized cell); regression should type without blur, trigger a grades pull/rerender, and assert value/focus survive.

## 6. Measured performance findings and code-supported risks

### PERF-01 — P2 — Startup graph includes on-demand diagnostics and has high request fan-out

- **Evidence class:** measured build footprint; actual network/device latency unknown.
- Production build: 2.814 transformed modules; startup HTML references 79 JS/CSS assets totaling 937,57 KiB raw / 267,86 KiB gzip.
- `HeaderBar` statically imports `SystemDiagnosticsModal`; its output chunk is 55,70 KiB raw / 16,24 KiB gzip and appears in startup modulepreload graph even when diagnostics is never opened. Evidence: [HeaderBar.tsx](../src/components/common/HeaderBar.tsx#L8), [HeaderBar.tsx](../src/components/common/HeaderBar.tsx#L210).
- Main CSS is 223,62 KiB raw / 34,03 KiB gzip. This can be reasonable for the current single design graph, but no route-level CSS split or critical-CSS measurement exists.
- **Impact:** extra parse/compile and many requests are plausible on parish mobile networks. HTTP/2, cache warmth and device speed decide real impact, so this is not labeled a reproduced slow interaction.
- **Direction:** lazy-load diagnostics and measure cold authenticated startup on target devices before broader chunk surgery; set a product budget only after baseline LCP/INP/route-ready evidence.

### PERF-02 — Intentional offline install cost

PWA injectManifest precaches 238 entries / 2.549,80 KiB. That cost is intentional for offline reliability; `xlsx` and `mammoth` are explicitly excluded. No defect is assigned without install/update failure rate or agreed byte budget. Evidence: [vite.config.ts](../vite.config.ts#L67).

### PERF-03 — Large modules are change-amplification signals, not proven runtime defects

Largest presentation modules include `ExamSessionView` 2.036 LOC, `QuestionBankView` 1.836, `ExamScanModal` 1.586, `ExcelImportModal` 1.269 and `UserManagementPage` 1.255. Several own orchestration, modal state, domain mapping and rendering together. The build already creates route/modal chunks, and no regression rate/profile ties LOC alone to user harm, so these are **maintainability/concentration risks**, not defects. Extract only around verified ownership seams or independently tested view models.

### PERF-04 — Existing synthetic benchmarks have weak gates

Store benchmarks log elapsed time but do not assert an upper bound; matrix benchmark asserts only “optimized faster than legacy”. They prove algorithm behavior and relative improvement in one dev process, not device latency, React commit cost, memory, long tasks or INP. Evidence: [performanceGoldenAndBenchmark.test.ts](../src/__tests__/performanceGoldenAndBenchmark.test.ts#L115), [desktopGradeMatrixGoldenAndBenchmark.test.ts](../src/__tests__/desktopGradeMatrixGoldenAndBenchmark.test.ts#L111).

## 7. Intentional complexity

1. **Separate mobile/desktop task surfaces:** Dashboard, Students, Attendance, Grades, Reports and Calendar choose different components while sharing stores/API. This duplicates presentation logic but enables card/touch workflows instead of shrinking desktop tables. It is justified where task interaction differs; parity tests must own the cost. Evidence: [AttendancePage.tsx](../src/pages/AttendancePage.tsx#L1), [GradesPage.tsx](../src/pages/GradesPage.tsx#L36), [StudentsPage.tsx](../src/pages/StudentsPage.tsx#L50).
2. **Durable sync complexity:** ownership, encryption, parent-before-child ordering, ID remap, OCC, retry isolation and conflict diagnostics protect real offline invariants. Do not simplify it into “API call plus optimistic cache”. FUX-01/FUX-02 occur before this boundary, not because the sync engine is intrinsically over-engineered.
3. **RootLayout orchestration:** composition of shell, auth, global modals and cross-cutting hooks belongs near the root. Split only if lifecycle ownership becomes testable and clearer; file size alone is not evidence.
4. **238-entry PWA precache:** offline availability trades install/update bandwidth for resilience. Keep policy explicit and measure update failure/cold install before changing it.

## 8. Design-system and accessibility assessment

### Verified good

- one ordered CSS entry graph and semantic token language;
- shared buttons/forms/panels/page headers/state feedback;
- 44px mobile nav/touch assertions in runtime matrix;
- skip link and unique main-landmark checks;
- modal portal, focus restore/trap, Escape and body-lock primitives;
- reduced-motion handling for route/nav transitions;
- 33/33 Playwright axe/layout tests passed on selected routes/themes/viewports.

### Drift/gaps

- FUX-06 is a real accessibility policy conflict outside axe’s detection model.
- Automated protected coverage is admin-only and representative-route-only; it does not exercise role-specific parent/CN/PT states, destructive dialogs, error/empty/offline/conflict states, grade/exam dense subviews, keyboard-only completion or screen-reader announcements end to end.
- Viewport matrix is 320, 390 and 1440. It does not cover 768/tablet, 1023↔1024 boundary, common laptop widths, wide desktop, landscape native or 200%/400% zoom/reflow.
- Static linter scans 127 non-exempt TSX files, while repository has 189 TSX files; exemptions/generated/print/special surfaces need explicit ownership rather than being described as globally covered.

## 9. Test and benchmark gaps

| Gap | Existing green evidence | Missing regression/evidence | Priority |
|---|---|---|---|
| Durable mutation acknowledgement | sync engine/store tests | reject encrypt/Dexie enqueue and assert no success + draft retained for attendance/grade/import | P0 |
| Filter URL convergence | route view-tab tests | invalid semester, reset last param, reload, back/forward, route switch | P1 |
| Fresh post-login bootstrap | auth-store tests | empty scoped Dexie + non-default server settings/year after first login | P1 |
| Native responsive boundary | web layout tests | mocked Capacitor native at 1023/1024 plus real tablet/foldable profile | P1 |
| Grade in-progress edit | keyboard navigation/clamp tests | type without blur, trigger 30s pull/state rerender, preserve DOM value and focus | P1 |
| Zoom/reflow | axe with meta-viewport rule disabled | 200% text/full-page zoom and 320 CSS px reflow across high-frequency tasks | P1 |
| Role journeys | admin representative routes | CN/PT/parent nav, empty/limited class scope and task completion UX | P1 |
| Runtime performance | synthetic pure-store timing | cold/warm LCP, route-ready, INP, long tasks, memory and failure rate on target hardware/network | P2 |
| PWA lifecycle | build/precache generation | cold install/update byte/time, interrupted update, storage pressure/eviction behavior | P2 |

## 10. Documentation drift

### DR-01 — Architecture claims web breakpoint consistency as universal

`02_ARCHITECTURE.md` states forced-mobile is normalized above 1024 so JS mode and CSS cannot diverge. That is true on web, false on native because `Capacitor.isNativePlatform()` returns mobile before normalization. Evidence: [02_ARCHITECTURE.md](02_ARCHITECTURE.md#L49) versus [useEffectiveMode.ts](../src/hooks/useEffectiveMode.ts#L37).

### DR-02 — Automated a11y gate must not be described as WCAG certification

The test itself correctly calls its scope an “automated subset” and explicitly disables the meta-viewport rule, while older narrative can be read as broad conformance. Current truth is: selected axe observations pass; zoom policy, keyboard task completion, assistive technology and untested states remain outside the gate. Evidence: [a11y.spec.ts](../e2e/a11y.spec.ts#L54), [design-system-lint.mjs](../scripts/design-system-lint.mjs).

## 11. Unknown / insufficient evidence

1. Production LCP/INP/CLS, route-ready latency, JS long tasks, memory pressure and crash rate: no RUM trace was found or accessed.
2. Real iOS Safari/WKWebView, Android WebView, tablets/foldables, landscape, safe-area and software-keyboard behavior: no device run in this audit.
3. Actual native CSS viewport distribution: FUX-05 trigger is deterministic, prevalence is unknown.
4. Screen-reader completion with VoiceOver/TalkBack/NVDA and Vietnamese announcements: automated semantics are not equivalent evidence.
5. PWA cold install/update on weak parish connectivity, storage quota/eviction and service-worker recovery: build contract exists, field reliability unknown.
6. Whether every parish deliberately keeps settings equal to frontend defaults: production configuration was not read; FUX-04 impact is conditional on divergence.

## 12. Risk-prioritized remediation roadmap

No rewrite, new frontend framework, microfrontend, event bus or wholesale store replacement is justified.

### P0 — Before relying on offline academic entry

1. Fix FUX-01 and FUX-02 at the durable acknowledgement boundary.
2. Define a small receipt contract shared by attendance/grade mutations: `serverAcked | queuedDurably | rejected` plus operation IDs.
3. Flip failure probes into regressions using rejected encryption/Dexie transactions; verify UI does not clear dirty draft or announce success.

### P1 — Next hardening slice

1. Canonicalize URL schemas and bidirectional clearing (FUX-03).
2. Add a single post-auth/scope bootstrap barrier for settings/reference state (FUX-04).
3. Make native shell/CSS breakpoint predicates identical and test 1023/1024 (FUX-05).
4. Stabilize grade cell edit ownership across background pulls (FUX-07).
5. Remove or narrowly scope global zoom prevention; add 200% zoom/reflow verification (FUX-06).

### P2 — Evidence-driven performance work

1. Lazy-load System Diagnostics, rebuild, and compare startup graph.
2. Collect cold/warm route-ready, LCP/INP/long-task/memory data on one low-end Android profile and one supported desktop before setting budgets.
3. Expand viewport matrix to tablet/boundary/laptop/wide; add role-specific task journeys and difficult states.
4. Split god modules only along seams exposed by defects/tests; do not optimize LOC as a target.

## 13. Verification executed

```text
npm run lint:ds
PASS — 0 violations / 127 scanned non-exempt TSX files

npm run test -- <9 targeted frontend files> --fileParallelism=false
PASS — 9 files / 44 tests

npm run test -- performanceGoldenAndBenchmark.test.ts desktopGradeMatrixGoldenAndBenchmark.test.ts --fileParallelism=false --reporter=verbose
PASS — 2 files / 7 tests
Measured — grade batch 14.08 ms; attendance batch 7.61 ms; matrix optimized 1.03 ms vs legacy 10.78 ms

npm run build:frontend
PASS — TypeScript + Vite/PWA production build; 2,814 modules; build 5.29 s
Measured — startup HTML graph 79 assets, 937.57 KiB raw / 267.86 KiB gzip
Measured — PWA precache 238 entries / 2549.80 KiB; xlsx/mammoth excluded

npm run test:e2e -- e2e/a11y.spec.ts e2e/design-system-visual.spec.ts
PASS — 33/33 in 3.8 min; isolated sandbox cleaned
```

Initial targeted Vitest attempt inside the sandbox failed before test discovery with Windows `spawn EPERM`; the identical command passed outside the sandbox. This is an environment process-spawn limitation, not a product test failure.

## 14. Release posture

Frontend is structurally coherent and its normal online/read paths have good automated coverage. It should **not yet claim fail-safe offline academic entry or full WCAG 2.2 AA** because FUX-01/FUX-02 can silently lose acknowledged mutations and FUX-06 deliberately blocks zoom. The remaining P1 defects are incremental to fix within the modular monolith/current React-Zustand architecture; none requires a rewrite.

## 15. Remediation status — 2026-09-07

Snapshot triển khai bắt đầu từ đúng audit HEAD `c1e85e72e50a3ad50c9424181f4f123200b0578b`. Đây là trạng thái working tree sau remediation, chưa phải production deployment.

### Resolved in current working tree

- **FUX-01 — resolved by code + regression:** `attendanceStore` chỉ cập nhật read model/trả receipt sau server acknowledgement hoặc encrypted Dexie transaction thành công. Receipt phân biệt `server` và `durable_queue`; enqueue failure trả `null`, đặt lỗi và không tạo local saved projection. Mobile/Desktop hiển thị “lưu trên thiết bị, chờ đồng bộ” cho durable-local receipt. Failure probe xác nhận enqueue reject không áp attendance và không báo thành công.
- **FUX-02 — resolved by code + regression:** Grade store mutation trả `Promise` và propagate lỗi enqueue. `DesktopGradeMatrix` giữ dirty IDs cho tới durable acknowledgement, chỉ clear exact snapshot đã ghi, giữ edit mới hơn và có nút retry khi lỗi. Đổi lớp/học kỳ/năm chỉ kích hoạt context mới sau khi draft cũ được durable-own; enqueue reject phục hồi context cũ và giữ draft trên màn hình. Excel import `await` boundary trước khi ghi undo/success state. Regression xác nhận rejected enqueue không resolve success, không làm mất dirty draft và không cho context switch nuốt dữ liệu.
- **FUX-03 — resolved by code + regression:** Students/Grades route chỉ nhận semester `1|2`; bridge đọc raw `searchStr`, xóa giá trị semester invalid khỏi URL và hydrate param vắng thành default canonical thay vì giữ state persisted cũ. Mọi nhánh xóa param đánh dấu thay đổi và vẫn navigate khi query cuối cùng trở về rỗng. Probe khóa invalid canonicalization, missing-param defaults và reset-last-param.
- **FUX-04 — resolved by code + regression:** `runInitialSync` là post-auth owner duy nhất cho settings + academic years trước push/pull; pre-auth `main.tsx` one-shot đã bị bỏ. Probe fresh authenticated state xác nhận cả hai reference fetch chạy.
- **FUX-05 — resolved by code + source contract:** `useEffectiveMode` không còn native override; web và Capacitor cùng dùng `<1024`/`>=1024`, khớp CSS visibility. Static regression khóa không tái thêm `Capacitor.isNativePlatform` vào shell predicate.
- **FUX-06 — code policy resolved; manual acceptance open:** global `zoomGuard` và bootstrap wiring đã bị gỡ; Axe không còn disable `meta-viewport`. Điều này loại bỏ verified blocker nhưng chưa chứng minh reflow 200% hoặc VoiceOver/TalkBack trên thiết bị thật.
- **FUX-07 — resolved by code + regression:** `createColumnHelper` chuyển ra module scope; cell key bind student/year/semester/field. Regression gõ nhưng chưa blur, kích store rerender và xác nhận cùng DOM input vẫn giữ value + focus.
- **PERF-01 diagnostics slice — resolved and remeasured:** `HeaderBar`/`MobileTopBar` lazy-load diagnostics với pointer/focus preload. Production startup HTML giảm từ 79 xuống **70 assets**; final remediation artifact là **926.389 bytes raw (~904,68 KiB)** và không còn `SystemDiagnosticsModal` trong preload graph. Đây vẫn là footprint measurement, không phải LCP/INP field claim.

### Verification on remediation snapshot

```text
npx tsc -b --pretty false
PASS

npm run lint
PASS — zero warning

npm run test -- <9 remediation files> --fileParallelism=false
PASS — 9 files / 55 tests

npm run test:coverage -- --fileParallelism=false
PASS — 322 files / 2.256 tests
Coverage — statements 70,52%; branches 59,56%; functions 63,19%; lines 73,14%

npm run build:frontend
PASS — 2.813 modules; PWA 238 precache entries / 2.552,29 KiB

npx playwright test e2e/a11y.spec.ts --project=chromium
PASS — 25 tests / 2,7 phút; `meta-viewport` rule enabled

startup HTML graph
MEASURED — 70 assets / 926.389 raw bytes; diagnostics excluded
```

Targeted Vitest/build lần đầu trong sandbox lỗi trước discovery do Windows `spawn EPERM`; chạy ngoài boundary đã pass. Regression context-switch ban đầu bắt một race thật của remediation (initial context chưa được thiết lập trước thao tác đổi lớp); implementation chuyển initial activation thành synchronous và cùng targeted suite pass 55/55. `lint:ds` từng bắt một class typography mới trong error state; implementation đã đổi về token `text-xs` và final `lint:ds` pass 0/127. Full serialized Vitest coverage và backend/frontend type/build gate đều pass; đây là local engineering evidence, không thay secret scan hay toàn bộ Playwright release suite.

Phần Playwright ngoài Axe đã chạy một vòng **42/47 PASS**. Năm failure đều được trace tới fixture/assertion drift, không cung cấp evidence về regression của các remediation FUX: promotion fixture dùng năm học không khớp lớp nguồn; Smart Exam thiếu `scanMetadata` bắt buộc; ba QR probes thiếu parish binding, dùng chữ ký giả hoặc copy cũ. Sau khi đưa fixtures về current server contract, exact rerun xác nhận **3/5 PASS** (promotion và hai QR paths). Hai correction cuối — Smart Exam tự mở khóa HK1 để không kế thừa state test trước, và invalid-QR assert đúng fail-closed response — đã qua TypeScript/lint nhưng runner chưa được thực thi lại vì quota của execution environment từ chối job trước khi start. Vì vậy hai probes này vẫn là **UNVERIFIED**, không được tính PASS.

### Remaining evidence gates, not reopened defects

1. Chạy lại hai probes Smart Exam + invalid QR, sau đó chạy trọn phần Playwright regression ngoài targeted Axe gate trước release. Kết quả hiện tại là 42/47 ở vòng full và 3/5 ở exact remediation rerun; không được suy diễn thành full-green.
2. Manual 200% zoom/reflow trên các workflow chính; Axe 25/25 đã pass nhưng không chứng minh thao tác/phóng to trên assistive technology thật.
3. Smoke native thực trên viewport quanh 1023/1024 hoặc tablet/foldable được hỗ trợ.
4. Thu LCP/INP/route-ready/long-task/memory trên target hardware trước khi đặt budget hoặc làm chunk/CSS surgery tiếp.

### Current release posture

Hai defect mất dữ liệu giả-success P0 và năm defect P1 đã có remediation trực tiếp, targeted regression, full serialized Vitest coverage và production build; targeted Axe runtime cũng xanh. Snapshot vẫn chưa được gọi là release-verified cho đến khi phần Playwright còn lại, manual reflow và native boundary gates ở trên hoàn tất. Không có rewrite, framework/store replacement, microfrontend hoặc schema/backend migration được đưa vào.
