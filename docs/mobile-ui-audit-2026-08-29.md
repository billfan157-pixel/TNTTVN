# Mobile UI Audit & Synchronization — 2026-08-29

## Scope, method và confidence

Đợt này truy vết toàn bộ route/page/shell/dialog thay vì chỉ sửa màn hình đang mở: `src/router.tsx` (22 route records), 21 pages, 88 TSX components, `RootLayout`/`MobileAppShell`/`DesktopAppShell`, public/auth, mobile views, adaptive admin pages và route-owned dialog. Code truth là `src/index.css`; documentation SSOT là `docs/03_DESIGN_SYSTEM.md`.

Evidence được phân loại theo Decision Matrix v4.1.2: **E3** source/CSS/route inspection; **E2** targeted unit/source-contract tests; **E1** browser local geometry. Khẳng định về browser local có confidence **MEDIUM**; visual QA trên thiết bị thật và flow đã đăng nhập không được suy diễn từ đó.

## Route inventory

| Surface | Routes / modules | Mobile contract | Kết luận |
| --- | --- | --- | --- |
| Root | `/` | redirect `/dashboard` | không có page layout riêng |
| Auth/public | `/login`, `/login/nhan-su`, `/login/phuhuynh`, `/verify` | `auth-page`, semantic `main`, 44px form/CTA, safe-area padding | dùng parish identity chung, không app shell |
| Dedicated mobile workspace | Dashboard, Students, Grades, Attendance, Reports, Notices, Calendar, Leave Requests | `MobileAppShell`, top bar, bottom nav, `mobile-screen` | preserve data-first mobile workflow |
| Adaptive staff/admin | Users, Classes, Academic Years, Catechists, Audit Logs, Settings, Management, Finance | `DesktopAppShell` responsive + card/table handoff at `md` where applicable | one shell owns width/gutter |
| Parent | Dashboard/`/parent` | responsive parent widgets/shell | role policy unchanged |
| Exam / print | ExamSession, import/export/scan/result/variant/analytics/answer-sheet | route dialog portal; A4 preview stays specialist | print/OMR dimensions deliberately not normalized as ordinary cards |

Route count: **17 protected + 4 public/auth + root redirect = 22**. No route, server endpoint, policy or role set was added/removed.

## Confirmed findings and synchronized remediation

| ID | Evidence | Finding | Remediation |
| --- | --- | --- | --- |
| MOB-01 | E3 HIGH — `DesktopAppShell`/CSS order | Shared page could inherit a mobile-width cap on desktop because width ownership was implicit | `.responsive-page-shell` has explicit 760px touch rule and `full|wide|narrow` desktop tiers from 1024px; embedded pages use no second cap/gutter |
| MOB-02 | E3 HIGH — safe-area tokens | FAB/action bar could double-count bottom inset; offline banner/top bar could double-count top inset | `--mobile-nav-total-height` owns bottom inset; top ownership documented and coordinated by banner presence |
| MOB-03 | E3 HIGH — PageTransition + dialog source | Route-local fixed dialogs can be clipped below sticky mobile top bar/nav | `ModalPortal` mounts custom route dialog to `document.body`; modal/nested/confirm ladder = 1100/1101/1110; shared lifecycle owns focus/scroll/Escape |
| MOB-04 | E3 + E1 HIGH — late CSS overrides | Mobile control sheet controls were rendered at 36–42px and select/input inherited 10px label font; `/verify` CTA measured 38px | common CSS now enforces 44px physical targets and 16px control font; auth `.btn` gets 44px minimum |
| MOB-05 | E3 HIGH — route/page inspection | `/leave-requests` mobile branch did not use `mobile-screen`; Finance table/card handoff differed from peer admin pages | added mobile wrapper and aligned Finance at `md` |
| MOB-06 | E3 MED — calendar header/layout | Month navigation/actions could over-compress on phone | header stacks below `sm`, reverts to row at `sm`; date grid remains a compact-data exception |
| MOB-07 | E3 HIGH — public semantic audit | Login chooser lacked a landmark `main` | Login uses `<main className="auth-page">`; `/verify` already does likewise |
| MOB-08 | E3 MED — action layering | Mobile control sheet could remain open while diagnostics/reset confirmation opens | close the sheet before opening either action |
| MOB-09 | E3 HIGH — `MobileTopBar`/top-bar stacking context | Control sheet declared `aria-modal` but was a child of z-950 sticky top bar, so its z-0/2 scrim/sheet could not cover z-1000 bottom nav | portal the sheet + scrim to `document.body` at modal layer 1100 and move focus/scroll/Escape to `useAccessibleDialog` |

## Shared contract after synchronization

```text
mobile-native route:  MobileAppShell → mobile-app-main → mobile-screen
shared route:         DesktopAppShell → responsive-page-shell

safe-bottom:          mobile-nav-total-height (single owner)
action/FAB:            positioned above that token
route dialog:          ModalPortal → document.body → z 1100+
nested / confirm:      z 1101 / z 1110
```

This keeps the existing navy–gold parish identity, flat data surfaces and restrained motion. It deliberately does not replace the product with a glass/bento visual language.

## Deliberate exceptions and non-claims

- **Zoom lock:** `index.html` + `zoomGuard` remain because the owner-approved `mobile-native-ui-audit-2026-08-12.md` requires it. This is a WCAG trade-off; it is not an accessibility pass.
- **Calendar dates:** a seven-column compact data grid cannot physically be 44px wide at small phone widths. Its controls retain 44px vertical affordance/semantics; do not force seven 44px columns and introduce horizontal overflow.
- **A4/OMR/certificate/photo-card:** fixed print geometry and specialist previews are not ordinary responsive content. They use their own scale/scroll strategy and preserve print correctness.
- **Force-password gate:** intentional non-dismissible security UX remains outside generic dismissible-dialog behavior.
- **Runtime limitation:** local Chromium can establish DOM geometry/overflow/landmark facts, but not real-device touch ergonomics, Safari keyboard behavior, native safe-area rendering, role-authenticated workflow quality, or production performance.

## Verification record

| Check | Evidence | Status |
| --- | --- | --- |
| Source route/component/shell inventory | E3 | PASS — 22 / 21 / 88 enumerated |
| Dialog/shell/portal contract | E2 — `CommonComponents`, `ConfirmDialog`, `useAccessibleDialog`, `mobileLayoutContract` | PASS — 4 files / 33 tests |
| MobileTopBar/confirm portal-lifecycle final fix | E2 — `MobileTopBarDialog`, `ConfirmDialog`, `mobileLayoutContract`, `useAccessibleDialog` | PASS — 4 files / 19 tests |
| App-wide/mobile/adaptive regression | E2 — `appWideUiMigration`, Mobile views, Finance, dialog/print and exam contracts | PASS — 12 files / 75 tests |
| Lint / TypeScript / design-system lint / production build | E2 | PASS — oxlint deny-warnings; `tsc -b`; 0 violations / 147; Vite/PWA build |
| Diff hygiene | E2 — `git diff --check` | PASS |
| Browser matrix: 320, 375, 768, 1024 public/auth | E1 | PASS — 16/16 route-viewport observations: one `main`, `scrollWidth === clientWidth`, visible action controls >=44px; login inputs 44px |
| Authenticated protected-route and physical-device QA | E1 | NOT CONFIRMED / follow-up acceptance |

## Follow-up acceptance

Before release, run a role-based mobile smoke for admin, `chunhiem`, `phuta` and parent at real device/safe-area conditions; open a representative nested dialog and an exam A4 preview; verify dark mode and OS text/keyboard behavior. The 320px local visual review found no clipping/overlap; an Ejoy floating icon was browser-extension UI, not app UI. This is acceptance work, not a reason to modify server/domain code in this layout synchronization scope.
