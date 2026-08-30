# UI/UX Upgrade 2026 — Calm, Confident Parish Product

**Ngày:** 2026-08-27

**Trạng thái:** IMPLEMENTED / AUTOMATED GATES PASS — runtime protected đại diện và field usability còn CONDITIONAL tại §8, §10

**Severity / Profile:** D2 / GENERAL
**SSOT:** `src/index.css` → tài liệu hóa tại `docs/03_DESIGN_SYSTEM.md`

## 1. Mục tiêu và ràng buộc

Giữ nguyên DNA hiện tại mà người dùng đã duyệt: xanh navy–vàng, trang nghiêm, tin cậy, dữ liệu dày nhưng dễ quét, desktop và mobile phục vụ hai ngữ cảnh khác nhau. Đợt nâng cấp không thay app thành bản sao của một brand khác và không đổi business rule, API, schema, auth, offline sync hay dữ liệu.

Mục tiêu:

1. Làm hierarchy rõ hơn nhưng giảm visual noise.
2. Giảm số quyết định tùy ý ở từng màn hình bằng token và primitive dùng chung.
3. Tăng tốc thao tác lặp lại: header gọn, hành động nhất quán, trạng thái rõ.
4. Đảm bảo responsive, keyboard, reduced-motion, dark mode và touch target.
5. Mọi cải tiến phải deploy được độc lập và rollback R1.

## 2. Evidence hiện trạng

### E3 — code, HIGH

- `src/index.css` đã là SSOT theo ADR-030/032 nhưng còn thiếu surface elevation có nghĩa, motion token và primitive metric/section thống nhất.
- `HeaderBar.tsx` dùng nhiều inline color/style và glass group; logo 64px làm header cao, nhiều controls cùng độ nhấn.
- `DesktopDashboard.tsx` tự dựng card/heading/icon/status bằng nhiều raw color family; hierarchy giữa KPI và section chưa có primitive.
- `PageHeader.tsx` được dùng trên gần 20 màn hình nhưng typography và wrapper còn là chuỗi utility riêng.
- Mobile đã có shell tốt, nhưng `MobileHomeView.tsx` tiếp tục tự dựng hero, quick action và stat card; `MobileTopBar.tsx` còn inline style trên logo.
- Runtime baseline 1592×868: shell không tràn ngang; header trước nâng cấp khoảng 92px. Sau nâng cấp đo trực tiếp 77px, `body.scrollWidth = viewport width`, một `#main-content` duy nhất.

### E1 — feedback trực tiếp, HIGH

Người dùng “khá ưng” triết lý và kiểu thiết kế hiện tại, vì vậy redesign phá DNA hoặc thay brand là không phù hợp. Đề xuất Warm Minimal/serif toàn app trong file V2 chưa được dùng làm authority và không bị sửa trong đợt này.

### E1 — correction trực tiếp, HIGH

Sau batch foundation, người dùng xác nhận thay đổi nhìn thấy mới tập trung chủ yếu ở
Dashboard và yêu cầu migrate **toàn diện từng màn hình**. Vì vậy việc chỉ để token /
`PageHeader` tự lan được đánh giá là `PARTIAL SUCCESS`; ADR-063 được mở rộng thành
rollout v4.1 có inventory và regression contract theo route/view.

## 3. Nghiên cứu brand và nguyên lý áp dụng

Chỉ lấy nguyên lý từ nguồn chính thức, không sao chép diện mạo:

| Nguồn | Nguyên lý | Áp dụng cho TNTTVN |
|---|---|---|
| [Apple HIG — Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles) | Purpose, familiarity, simplicity, hierarchy; delight không phải decoration | Mọi element phải phục vụ tác vụ; giữ pattern quen thuộc; bỏ blur/orb không cần thiết |
| [Microsoft Fluent 2 — Design principles](https://fluent2.microsoft.design/design-principles) | Natural on every platform, built for focus, less clutter | Desktop ưu tiên data workspace; mobile ưu tiên touch, bottom nav và task nhanh |
| [Shopify Polaris — Experience values](https://polaris-site-prod-kit.shopify.prod.shopifyapps.com/foundations/experience-values) | Considerate, efficient, trustworthy, crafted; sức mạnh thay vì trang trí | Safe action dễ làm; risky action rõ hậu quả; polish từ hiệu quả và consistency |
| [Atlassian Design System](https://atlassian.design/get-started/about-atlassian-design-system) | Foundation + token + reusable component; lưu quyết định trong hệ thống | Đổi foundation một lần để nâng nhiều màn hình; cấm per-page visual drift |
| [Atlassian elevation](https://atlassian.design/foundations/elevation/) | Shadow chỉ dùng khi elevation có ý nghĩa; tránh quá nhiều raised surface | Card nội dung mặc định phẳng + border; hover/overlay mới nâng cao |
| [Stripe Apps design](https://docs.stripe.com/stripe-apps/design) | Hạn chế custom styling để giữ consistency và accessibility | Brand expression tập trung ở shell/logo/accent; control dùng DS chung |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Focus not obscured, target size, predictable interaction | Focus ring, một skip target, mobile controls ≥44px, reflow và reduced motion |

Kết luận triết lý: **Calm, Confident Parish Product** — trang nghiêm nhưng không cổ điển giả tạo; thân thiện nhưng không trẻ con hóa; giàu dữ liệu nhưng không ồn; brand rõ ở shell, còn content để dữ liệu lên tiếng.

## 4. Alternatives và Decision Matrix

| Criterion | Weight | A. Giữ nguyên | B. Warm serif/editorial | C. Calm confident system (chọn) |
|---|---:|---:|---:|---:|
| Business / Operational Fit | 15% | 7 | 6 | 9 |
| Reliability & Data Integrity | 20% | 9 | 9 | 9 |
| Security & Privacy | 20% | 9 | 9 | 9 |
| Maintainability | 15% | 6 | 6 | 9 |
| Performance | 10% | 8 | 7 | 9 |
| Testability | 10% | 7 | 7 | 9 |
| Reversibility | 5% | 10 | 8 | 9 |
| Observability | 5% | 6 | 6 | 8 |
| **Weighted** | **100%** | **7.85** | **7.55** | **8.95** |

**Hard gates D2:** Security/Privacy 9, Data Integrity 9, Testability 9 — PASS.

**ADR gate:** ADR-030 PASS; ADR-032 PASS; ADR-055 PASS.

**Business Rule Gate:** không đổi protected behavior — CONFIRMED bằng diff phạm vi frontend presentation/docs/tests.
**Reversibility:** R1 — revert frontend commit/redeploy; không migration.

## 5. Implementation

### Foundation toàn app

- Surface levels `app / sunken / card / raised`, gold brand accent, shadow và motion token.
- `.card`, `.table-wrapper`, `.modal-content`, button và focus/motion được polish qua SSOT.
- Mobile form font 16px để tránh Safari auto-zoom; modal chuẩn thành bottom sheet ở viewport nhỏ.
- Shared primitives mới: `page-header`, `section-card`, `section-heading`, `metric-card`, `app-header`, `mobile-home-*`, `app-page-loader`.

### Shell và navigation

- Header desktop gọn, giảm glass, gom control theo chức năng, brand vẫn navy–gold.
- Search/class/semester/view/theme có accessible name hoặc pressed state.
- `main` dùng responsive gutter và stable scrollbar; sidebar nav có label.
- Sửa duplicate `#main-content` ở mobile: `MobileAppShell` là owner duy nhất.

### Hai mặt tiền ban đầu

- Dashboard desktop: KPI cùng một grammar; mỗi metric chỉ có một accent mảnh; section heading nhất quán; primary action dùng `.btn` chuẩn.
- Home mobile: hero bớt blur; quick action và stats dùng primitive touch-first; Lịch Phụng Vụ là `<button>` semantic thay `div role=button`.

### Cross-page

- `PageHeader` mới tự lan tới mọi consumer.
- Table, modal, card, loading state nhận polish qua foundation.
- Notices bỏ nested card/table shell và cho nội dung preview hai dòng.

### App-wide migration v4.1

- Primitive mới: `.product-view`, `.app-panel`, `.view-toolbar`, `.view-tabs`,
  `.view-tab`, `.mobile-page-header`, `.mobile-filter-panel`, `.entity-card`,
  `.state-feedback`, `.auth-page/.auth-card/.auth-hero/.auth-option`.
- **Desktop workspace**: Students, Grades (Cards/Daily/Matrix/Comparison),
  Attendance (entry/summary/leave), Calendar, Reports, Notices, Classes và
  Dashboard được migrate trực tiếp, không chỉ nhận token gián tiếp.
- **Admin/directory**: Academic Year, Users, Catechists, Audit Log, Finance,
  Settings và Parent portal dùng cùng product-view/panel/toolbar language.
- **Mobile workflow**: Home, Students, Attendance/Summary/Leave, Grades
  (Cards/Daily/Matrix/Comparison), Calendar, Reports và Notices dùng shared
  page identity, tabs/filter panel và entity card.
- **Public/auth**: portal chooser, staff login, parent login và verification
  dùng cùng parish identity; auth control tối thiểu 44px và mobile font 16px.
- **Dialogs/states**: ModalShell + custom dialog tier cùng overlay/elevation;
  empty/no-result/error state có chung `.state-feedback`.
- **Management hierarchy**: trang con nhận `embedded`, bỏ PageHeader lặp bên
  trong hub `/management`; tab có `role=tab` + `aria-selected`.

### Coverage inventory

| Surface | Coverage code trực tiếp |
|---|---:|
| Desktop workspace views | 13/13 |
| Mobile workflow inventory | 13/13 (12 active + `MobileGradeMatrix` legacy không còn route import) |
| Public/auth surface | 4/4 |
| Management embedded families | 3/3 |
| Shared form/table/modal/state foundation | PASS |

`src/__tests__/appWideUiMigration.test.ts` là anti-regression contract: một view
trong inventory rời visual language chung sẽ làm targeted test fail.

## 6. Acceptance criteria

- `body.scrollWidth === viewport width` ở desktop baseline.
- Một và chỉ một `#main-content`.
- Header desktop ≤80px ở baseline 1592px khi không wrap.
- Controls chính có accessible name; toggle/segment có state programmatic.
- Mobile quick actions ≥44px; input mobile không kích hoạt Safari auto-zoom.
- Reduced motion vô hiệu transition/animation không thiết yếu.
- `lint:ds` 0 violation; TypeScript, targeted tests, full tests và production build pass.
- App-wide migration contract phải phủ 13 desktop + 13 mobile inventory files + public/auth +
  management embedded hierarchy.

## 7. Risk / mitigation

| Risk | Probability | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Token foundation làm thay đổi nhiều trang | Medium | Medium | Giữ tên token cũ, thêm token mới backward-compatible; visual smoke các route đại diện | Low |
| Header wrap ở desktop hẹp | Medium | Low | Wrap có chủ đích dưới 1280; mobile shell tách ở <768 | Low |
| Dark mode elevation mất phân tầng | Low | Medium | Surface raised/sunken riêng trong `.dark` | Low |
| Motion gây khó chịu | Low | Medium | `prefers-reduced-motion` hard override | Low |
| Modal mobile thay đổi vị trí | Medium | Low | Chỉ presentation; semantics/focus trap/stack giữ nguyên | Low |

## 8. Verification record

| Gate | Kết quả |
|---|---|
| Client/config TypeScript | PASS: `tsconfig.app.json`, `tsconfig.node.json`, và `tsc -b` |
| `npm run lint` | PASS, 0 warning |
| Design-system anti-drift | PASS, 0/136 violation; linter nhận diện DS v4.1 |
| Targeted regression | PASS, 43/43 trên 5 file, gồm app-wide migration contract |
| Full regression | PASS, 237/237 file, 1.719/1.719 test, chạy tuần tự với timeout chuẩn 15s |
| Production build | PASS: client + server + PWA; precache 164 entry |
| `git diff --check` | PASS |
| Desktop runtime smoke 1592×868 | PASS: header 77px; `body.scrollWidth === viewport`; đúng một `#main-content`; accessible label/pressed state có trong DOM |
| Public/auth runtime smoke 1592×821 | PASS: không horizontal overflow; auth card 440px; lựa chọn cổng 88px; form control tối thiểu 44px |

Lần chạy full đầu với timeout mặc định 5s có đúng một timeout ở test Sentry
`observability.test.ts`; test này chạy cô lập 4/4 PASS và full suite chạy lại với
timeout 15s của quality workflow PASS toàn bộ. Kết luận: resource/timing noise,
không phải regression UI.

Không chạy E2E điểm danh vì kịch bản hiện tại có thể ghi attendance vào local data.
Không tuyên bố visual QA cho protected route sau rollout v4.1 vì credential seed cục bộ
không đăng nhập được; browser runtime mobile cũng không được tuyên bố do công cụ QA
không áp viewport emulation trong phiên này. Protected desktop đã có runtime smoke ở
rollout foundation; mobile component/semantic/CSS và app-wide inventory contracts đã
qua regression test.
Screenshot và unit test không chứng minh usability thực địa: task validation với
Huynh Trưởng/GLV trên thiết bị thật vẫn là **CONDITIONAL follow-up**.

### Post-implementation D2

- Security/Privacy 9, Data Integrity 9, Testability 9 — PASS.
- ADR-030/032/055 compatibility — PASS.
- Protected behavior unchanged — CONFIRMED.
- Usability thực địa và mức tăng task efficiency — CONDITIONAL, chưa được claim.

## 9. Route Motion Upgrade v4.2 — 2026-08-28

### Research và decision

- [Apple HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion):
  motion phải truyền đạt trạng thái/phản hồi và dùng có tiết chế.
- [Material Motion](https://m1.material.io/motion/material-motion.html): transition
  giúp giữ ngữ cảnh và dẫn sự chú ý, nhưng nhiều chuyển động giao nhau gây khó hiểu.
- [TanStack Router View Transitions](https://tanstack.com/router/latest/docs/framework/react/examples/view-transitions):
  router hỗ trợ `defaultViewTransition` và phân biệt `pathChanged`.
- [MDN View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API):
  browser quản lý snapshot cũ/mới giúp tránh tự giữ hai page tương tác cùng lúc.
- [W3C WCAG 2.3.3](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html):
  animation do tương tác phải có thể bị vô hiệu hóa khi không thiết yếu.

Ba phương án D2/GENERAL: giữ entrance animation rải ở `.product-view` (7.95),
thêm Framer Motion/giữ hai route trong React (8.05), và native View Transition +
CSS fallback tại shared boundary (9.00 — chọn). Hard gates: Security/Privacy 9,
Data Integrity 9, Testability 9 — PASS. ADR-030/032/055/063 — PASS; không đổi
route tree, auth, API, dữ liệu hay business rule. Rollback R1.

### Implementation contract

1. `PageTransition` bao quanh đúng vùng route content ở auth, mobile và desktop;
   header/sidebar/bottom nav không di chuyển.
2. TanStack `defaultViewTransition` chỉ bật khi runtime hỗ trợ, người dùng không
   yêu cầu reduced motion và `pathChanged=true`; query/filter update không animate.
3. Motion dùng fade-through + translate dọc 6px tối đa, duration 120–260ms;
   mobile dùng duration chuẩn 180ms.
4. Trình duyệt thiếu API dùng class fallback được phát hiện bằng JavaScript;
   không dùng CSS `@supports` vì có runtime hỗ trợ property nhưng thiếu API.
5. `prefers-reduced-motion: reduce` tắt route animation và smooth scrolling.
6. Entrance animation cũ của từng `.product-view` bị loại để không double-motion.

### Verification

- `pageTransition.test.tsx` khóa pathname-only remount, fallback, native CSS và
  reduced-motion contract.
- Targeted UI contracts: 3 files / 15 tests PASS; oxlint 0 warning;
  design-system lint 0/139 violation; TypeScript + frontend/PWA build PASS.
- Browser smoke public flow `/login` → `/login/nhan-su`: đúng một motion boundary,
  shell/page semantics không đổi, điều hướng thành công. Protected-route task
  usability và cảm nhận motion trên thiết bị thật vẫn CONDITIONAL.

## 10. Design System v4.5 closure — 2026-08-30

Các phase còn lại của rollout app-wide được đóng theo ADR-079 bằng semantic layer mỏng, CSS graph có thứ tự và runtime evidence; không thay navy–gold identity hoặc business behavior:

- Typed `Button`, form controls, `Tabs/TabPanel`, `SegmentedControl`, `FilterChips`, `Badge` và `Surface` đã được dùng ở shared/auth cùng các workflow Dashboard, Students, Management, Attendance, Grades và Finance.
- CSS monolith 4,409 dòng được tách thành graph `00-tokens.css → 70-sidebar.css`. Tại điểm split-only, production CSS trước/sau giống hệt 212,171 bytes và SHA-256; graph contract khóa order, ownership, duplicate/cycle/orphan.
- `src/index.css` là ordered manifest duy nhất cho tám module `00`–`70`; component không import module rời hoặc đảo cascade.
- Token contrast được điều chỉnh mà không đổi navy–gold identity: success light `#15803D` (hover `#166534`), info `#0369A1`/dark `#7DD3FC`, muted `#5F6F82`/dark `#A3B1C4`, dark secondary `#A3B1C4`; Finance giữ cặp income `#15803D/#4ADE80`, expense `#DC2626/#F87171`, transfer `#0369A1/#38BDF8`. Nghĩa Sĩ chỉ đổi foreground badge sang `#854D0E`, không đổi màu khăn.
- `lint:ds` v4.5 có 8 rule trên 112 TSX không miễn trừ, kết quả 0 violation. Debt per-file ratchet hiện là 287 `text-[Npx]` trên 58 file và 55 `transition-all` trên 23 file; file mới có ceiling 0. Đây là anti-drift gate, không phải chứng nhận WCAG.
- Protected runtime matrix phủ 5 route đại diện × 3 viewport (`1440×900`, `390×844`, `320×720`) × 2 theme = 30 observations. Public matrix phủ `/login`, `/login/nhan-su`, `/login/phuhuynh`, `/verify` × 3 × 2 = 24; forgot-password modal thêm 6. Tổng: Axe **60 observations** và visual/layout **60 full-page PNG observations**, cộng một test tương tác đi qua đủ mobile bottom-nav chính.
- PNG là evidence artifact, không phải pixel-diff baseline. Protected routes đi qua sidebar SPA thật rồi mới resize và đợi route/data readiness, tránh reload authenticated app lặp lại gây refresh-token race giả.
- Harness E2E dùng cổng riêng `3100/3101`, SQLite DB tạm cô lập trong OS temp, không nạp server `.env`, và chỉ báo stdout `READY` sau khi Vite + API + seed hoàn tất; phiên dev `3000/3001` không bị reuse hoặc chiếm dụng.
- Runtime remediation đóng các lỗi contrast/public auth: semantic foreground cho login/verify, typed control và portal cho forgot modal; token muted/info/success/finance được tăng khả năng đọc. `PageHeader` mobile reset desktop flex-basis để không tạo khoảng trắng dọc bất thường; Vite `optimizeDeps` bỏ hai entry stale `tailwind-merge`/`jspdf`.
- Final serialized `npm run verify:ci` sau toàn bộ remediation: lint zero-warning + `lint:ds` 0/112 + client/server/PWA build + **260/260 files, 1,836/1,836 tests PASS**. Coverage: statements 70.64%, branches 59.94%, functions 64.51%, lines 72.88%.
- Full Playwright cuối: **61/61 tests chạy PASS**, 1 offline tenant-reload test skip có chủ đích. Axe 60/60 observations, visual/layout 60/60 observations, mobile-bottom-nav, role, tenant-switch và attendance save đều PASS; development DB SHA không đổi và 3100/3101 được giải phóng sau cleanup.
- Runtime gate cuối phát hiện thêm contrast của nhãn “Cuối kỳ” trên nền highlight (4.10:1 light, 3.77:1 dark); foreground được đồng bộ sang `text-primary` ở mobile board/legacy matrix/desktop card và protected Axe matrix chạy lại PASS. View Transition wrapper không còn phát unhandled lifecycle abort trong full suite nhưng vẫn giữ update callback errors.

Giới hạn claim không chặn v4.5: 5 protected routes là tập đại diện, chưa phải mọi role hay đủ 17 protected routes; Axe chỉ kiểm tra tập con tự động, không thay full WCAG audit; chưa có screen-reader/physical-device task acceptance; screenshot không phải pixel-diff baseline. Tooltip chuyên biệt và refactor sâu StudentReportModal vẫn là backlog riêng nếu thay đổi workflow hoặc print geometry.
