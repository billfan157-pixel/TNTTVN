# Mobile Route Performance Audit — 2026-08-30

## Kết luận

Độ trễ cảm nhận khi đổi nhanh các trang mobile không xuất phát chủ yếu từ duration CSS. Nút điều hướng đổi URL bằng `navigate()`, trong khi route component dùng `React.lazy` qua `lazyWithRetry` và không cung cấp `.preload()`. TanStack Router chỉ tải trước component có `.preload()`, nên `defaultPreload: 'viewport'` và `router.preloadRoute()` trước đây không làm ấm page chunk như comment trong mã nguồn. View Transition chỉ bắt đầu sau khi route match/component đã sẵn sàng; phần tải chunk lạnh vì vậy xảy ra trước animation và tạo cảm giác chạm nhưng app đứng lại.

Batch ADR-080 sửa đúng pipeline này, giữ nguyên visual language và business/data contract.

## Phạm vi đã truy vết

`MobileBottomNav` / quick action → `navigate()` → TanStack `loadMatches` / component preload → `PageSuspense` → `PageTransition` / native View Transition → mount page mobile → Zustand persisted data → paint. Audit bao phủ 21 page paths, mobile shell/top/bottom nav, lazy route/nested lazy, startup rehydrate, PWA build output, reduced motion và rapid-navigation interruption handling.

## Evidence và findings

| ID | Finding | Evidence | Classification |
| --- | --- | --- | --- |
| PERF-01 | Route preload cũ không tải component chunk | E3 HIGH: `lazyWithRetry` trả `React.lazy` không có `.preload()`; TanStack `load-matches.ts::preloadRouteComponents` chỉ gọi `route.options[type]?.preload?.()` | CONFIRMED |
| PERF-02 | `defaultPreload: 'viewport'` không áp dụng cho bottom nav | E3 HIGH: `MobileBottomNav` dùng `<button>` + `navigate()`, còn TanStack viewport preload nằm trong `Link`/IntersectionObserver | CONFIRMED |
| PERF-03 | Cold-load delay xảy ra trước route animation | E3 HIGH: TanStack chỉ gọi `startViewTransition` trong `loadMatches.onReady`; chunk chưa sẵn sàng thì shell chưa bắt đầu fade-through | CONFIRMED |
| PERF-04 | Preload song song 4 route có thể tạo burst parse trên máy yếu | E3 MEDIUM: router cũ gọi bốn `preloadRoute()` cùng một idle callback; không có field trace để định lượng Long Task | CONDITIONAL |
| PERF-05 | Mobile Grades có nested cold boundary ở view mặc định | E3 HIGH: `GradesPage → MobileGradeView → lazy MobileGradeBoard`; outer route preload không chạy dynamic importer bên trong view mặc định | CONFIRMED |
| PERF-06 | Students route kéo modal import khi đóng | E3 HIGH: `StudentsPage` static-import `ExcelImportModal`; baseline build tách chunk modal 12.50 KB gzip nhưng vẫn là static dependency của route graph | CONFIRMED |
| PERF-07 | Motion contract hiện tại hợp lý, không phải root cause đã chứng minh | E3/E2 HIGH: pathname-only, shell đứng yên, 120–180ms mobile, reduced-motion tắt animation; rapid View Transition interruptions đã có regression test | CONFIRMED |
| PERF-08 | Trải nghiệm thiết bị thật/production chưa được đo | Không có trace mid-tier Android/iOS, Web Vitals route metric hoặc field RUM cho tap→content / dropped frames | NOT CONFIRMED |

Baseline build thu trong pre-push gate trước batch: initial JS `59.10 KB gzip`, router `41.54 KB gzip`, CSS `32.80 KB gzip`; route đáng chú ý gồm Attendance `17.81 KB`, Dashboard `10.42 KB`, Students `7.42 KB`, Grades `4.13 KB`; nested `MobileGradeBoard` `3.33 KB`, `ExcelImportModal` `12.50 KB`; PWA precache `182` entries / `2667.93 KiB`. Đây là local production-build evidence, không phải network/CPU timing thiết bị thật.

## Decision và implementation

Chọn preload có khả năng thực thi + staged mobile warmup:

1. `lazyWithRetry` cung cấp `.preload()`, dedupe promise và render component đã resolve trực tiếp để tránh Suspense pass thứ hai. Amendment ADR-088: preload nền hết retry chỉ reject/cho lần sau retry mới, không tự hard-reload app; navigation lỗi đi vào ErrorBoundary với nút tải lại có chủ đích.
2. `useMobileRoutePreload` chỉ lấy primary destinations hợp lệ với role từ route-policy SSOT, bỏ route hiện tại và tải tuần tự trong idle callback; fallback timer dùng cho WebView cũ.
3. Bottom nav gọi preload tại `pointerdown`/focus và hiển thị pending highlight + `aria-busy` ngay, trong khi `aria-current` vẫn phản ánh URL đã commit.
4. `MobileGradeBoard` đi cùng default mobile Grades path; các tab Daily/Comparison/Exam vẫn lazy.
5. `ExcelImportModal` chỉ tải khi mở; route Students không trả chi phí công cụ import ở lần xem danh sách.

Không preload dữ liệu server mới, không đổi cache tenant, offline queue, auth guard, API/schema hoặc scoring.

## Candidate targets và measurement plan

Các số sau là **CANDIDATE TARGET**, chưa phải hard requirement cho đến khi owner xác nhận và có device matrix:

| Metric | Candidate | Cách đo |
| --- | ---: | --- |
| Tap → visual acknowledgement | ≤50 ms p75 | `pointerdown` mark → pending nav style paint |
| Warm primary route tap → content ready | ≤200 ms p75, ≤350 ms p95 | navigation mark → route-specific readiness marker |
| Cold cached-PWA primary route | ≤500 ms p75 | service-worker cache warm, JS chunk chưa evaluate |
| Route transition smoothness | ≥55 FPS p75; không Long Task >100 ms trong transition | Chrome trace / Long Animation Frame trên mid-tier Android |
| Rapid 5-tab burst | URL cuối đúng, không unhandled rejection, không stale pending tab | automated interaction + console assertion |

Device matrix tối thiểu: Android mid-tier Chrome/PWA, Android WebView/Capacitor, iPhone Safari/PWA; 390×844 và 320×720; light/dark + reduced-motion; admin/chủ nhiệm/phụ tá/phụ huynh. Thu cold/warm/offline-cache riêng, không trộn số local desktop Chromium thành field evidence.

## Verification record

- Targeted route/lazy/navigation regression: 5 files / 28 tests PASS, gồm rapid-tap newest-intent ownership.
- `npm run lint`: PASS, zero warning.
- Authenticated local Chromium at 390×844 loaded real admin mobile shell and 566-student snapshot without console warning/error; this is smoke evidence, not device performance proof.
- Full `npm run build:frontend` (`tsc -b && vite build`): PASS. Grades default path còn `6.21 KB gzip` và không còn chunk `MobileGradeBoard` riêng (baseline hai tầng `4.13 + 3.33 = 7.46 KB gzip`); `ExcelImportModal` vẫn là dynamic-only chunk `12.53 KB gzip`; initial entry giữ khoảng `59.09 KB gzip`; router tăng có kiểm soát từ `41.54` lên `41.89 KB gzip` cho preload orchestration. Global precache/Reports không dùng để so sánh vì concurrent dirty workstream thay đổi các asset đó.
- Real-device latency/FPS: NOT CONFIRMED.
