# Mobile Native UI Audit — 2026-08-12

## Scope
Evidence-first review of the mobile presentation layer, focusing on a native-like PWA shell, navigation, safe areas, touch targets, and screen-level spacing.

## Verified evidence

| Area | Evidence | Finding | Confidence |
| --- | --- | --- | --- |
| Mobile shell | `src/router.tsx:195-206` | Mobile content is wrapped in a generic `pb-20` container, while each screen separately adds bottom offsets. | HIGH |
| Bottom navigation | `src/components/mobile/MobileBottomNav.tsx:26-40` | Fixed nav uses hardcoded `height: 64px` and only adds `env(safe-area-inset-bottom)` to padding; no shared shell contract exists. | HIGH |
| Competing fixed action | `src/components/mobile/MobileStudentsView.tsx:417-449` | Bulk-delete action bar is fixed to `bottom: 0`, so it can overlap the fixed nav and content. | HIGH |
| Competing fixed action | `src/components/mobile/MobileAttendanceView.tsx:233-257` | Save CTA is fixed at `bottom: 76px`, a second hardcoded offset that is not coupled to nav height or safe area. | HIGH |
| Duplicated page offsets | `MobileHomeView.tsx:31-32`, `MobileAttendanceView.tsx:85`, `MobileStudentsView.tsx:141` | Screens independently use `paddingBottom: 80px`, `90px`, and `80px`; spacing can drift and is difficult to maintain. | HIGH |
| Header density | `src/components/common/HeaderBar.tsx:63-244` | The desktop header remains a dense multi-control header in mobile mode, with logo/title, class selector, search, semester, diagnostics, user/logout, mode switch, theme, and reset controls. | HIGH |
| PWA viewport | `index.html:6` | Viewport metadata lacks `viewport-fit=cover`, so edge-to-edge safe-area behavior is incomplete. | HIGH |
| Native interaction primitives | `src/index.css:178-245`, `MobileBottomNav.tsx:46-77` | Existing buttons/nav use mixed inline styles, no shared mobile hit-area/ripple/press-state conventions, and inconsistent control heights. | HIGH |
| Visual rendering | `notices-mobile.png` | Current mobile screen displays a desktop-like top control cluster and a fixed bottom nav, with content ending close to nav; it looks like a responsive dashboard rather than a native app frame. | HIGH |
| Desktop reference | `dashboard-desktop.png` | Desktop intentionally uses a full header plus sidebar; mobile should preserve brand hierarchy but simplify controls into a compact app bar and bottom navigation. | HIGH |

## Native-mobile redesign targets

1. Establish one shared `MobileAppShell` contract that owns top safe-area spacing, content padding, bottom navigation clearance, and transient bottom action stacking.
2. Replace the mobile rendering of `HeaderBar` with a compact mobile app bar: contextual title, page-level context, offline state, and an overflow sheet for secondary controls.
3. Upgrade bottom navigation to a translucent/blurred safe-area-aware bar with 44px minimum hit areas, an active pill indicator, and a stable nav height variable.
4. Replace screen-level hardcoded offsets with shared CSS variables/classes so FABs and bottom action bars stack above the nav consistently.
5. Keep navigation information architecture role-aware; do not change backend/API/business rules.
6. Add reduced-motion and coarse-pointer behavior through CSS rather than introducing a new runtime dependency.

## Risk classification

This is a **D2 cross-module presentation refactor** because it affects `router.tsx`, shared header/navigation components, multiple mobile screens, global CSS, PWA metadata, and UI regression tests. It does not alter auth, tenant isolation, API contracts, data schemas, or offline synchronization semantics.

## Unknowns to verify during implementation

- Whether all mobile route pages are rendered under the same root layout in every role.
- Whether existing screenshot/e2e tests assert exact header/nav text or rely only on routes.
- Whether the user expects the existing desktop header controls to remain directly visible in mobile mode; implementation should preserve access through a mobile overflow control if needed.

## Implemented changes

| Change | Implementation | Verification |
| --- | --- | --- |
| Shared shell | `src/components/mobile/MobileAppShell.tsx` now owns the mobile content container, bottom-nav composition, and `mobile-screen`/`mobile-scroll-content` contract. | `src/router.tsx` renders every mobile route through the shell; screen-level duplicate bottom offsets removed from Home, Attendance, Students, Grades, Notices, and Reports. |
| Compact app bar | `src/components/mobile/MobileTopBar.tsx` provides contextual title/subtitle, back navigation for nested routes, offline status, user identity, and an overflow sheet for class/semester/search/theme/diagnostics/reset/logout controls. | `HeaderBar.tsx` keeps the desktop header unchanged and delegates mobile rendering to `MobileTopBar`. |
| Native bottom navigation | `MobileBottomNav.tsx` uses role-aware tab definitions, `aria-current`, 44px touch targets, active-pill treatment, safe-area padding, and a stable CSS height variable. | Added regression tests for staff and parent information architectures plus active-tab callbacks. |
| Fixed-action stacking | `mobile-floating-action` and `mobile-action-bar` position transient actions above `--mobile-nav-clearance`, including bottom safe-area inset. | Attendance save CTA and Students bulk-action bar no longer use independent hardcoded bottom offsets. |
| PWA edge-to-edge | `index.html` now includes `viewport-fit=cover`. | Safe-area CSS variables are available to the shell and bottom navigation. |
| Interaction system | Global mobile primitives add touch-action, press states, reduced-motion handling, coarse-pointer adjustments, scrollbar behavior, and horizontal scroll-snap for chip/tab rows. | `git diff --check` is clean and the focused mobile suite passes. |

## Verification record

- Focused Vitest: **8/8 tests passed** in `src/__tests__/components/MobileViewsEnhancement.test.tsx`, including two new native-navigation regression tests.
- Vite production build: **passed**; PWA service worker generated successfully.
- `npx tsc -b`: the modified mobile/header code typechecks after fixing a desktop-branch narrowing issue. The repository still reports three pre-existing errors outside this refactor: missing `beforeAll` in `src/__tests__/utils/gradeLifecycleVerification.test.ts`, and nullable `comments`/optional `semester` mismatches in `server/src/repositories/ReportCardProjectionRepository.ts` and `server/src/services/PromotionApplicationService.ts`.
- The build emitted one existing `INEFFECTIVE_DYNAMIC_IMPORT` warning for `src/hooks/useSyncEngine.ts`; it is unrelated to this UI refactor.

## Follow-up items

- Run the full Vitest suite and end-to-end viewport matrix in CI before release.
- Validate the exposed mobile shell at 320px, 375px, 390px, and 430px widths on physical iOS/Android devices, especially keyboard avoidance and browser safe-area behavior.
- If product wants persistent class/semester controls rather than the overflow sheet, promote them to a context-specific secondary toolbar instead of restoring the desktop header cluster.

## Final QA adjustments

The second review found one concrete information-architecture mismatch: `router.tsx` maps `/notices` to the `notices` mobile tab, but the first native bottom-nav implementation did not render a Notices item. This is now fixed by adding a role-aware `Thông báo` item for staff while keeping the bar at six items by moving Settings to the top-bar overflow. Parent users retain the reduced `Trang chủ` / `Bảng điểm` / `Con tôi` / `Cài đặt-through-overflow` experience without staff-only tabs.

The top bar now adapts its eyebrow and summary copy for `phuhuynh` accounts, closes its overflow sheet after route changes, and includes a full-screen dismissal scrim. The sheet is bounded and scrollable on short devices, avoiding a viewport-height overflow trap.

## Final verification snapshot

| Check | Result |
| --- | --- |
| Focused mobile Vitest | **8/8 passed** after the final nav changes. |
| Production Vite/PWA build | **Passed**; service worker and precache generated. |
| TypeScript build | No errors remain in the mobile refactor. The same **four unrelated repository errors** remain: missing `beforeAll` in one test and three server DTO/nullable type mismatches. |
| Full Vitest run | **144 test files passed, 5 failed; 1,149 passed, 7 failed, 5 skipped**. The failures are existing backend/test-environment issues (missing seeded academic-year records, a concurrency transaction constraint, and the pre-existing lifecycle test import), not mobile-shell failures. |
| Diff hygiene | `git diff --check` passed. |


## Header balance refinement — 2026-08-12

The supplied mobile screenshot exposed a concrete composition issue that was not fully covered by the earlier shell refactor: `OfflineStatusBanner` rendered before `MobileTopBar` owned no mobile safe-area contract, while `MobileTopBar` also added `env(safe-area-inset-top)`. This could count the system status area twice and made the status strip appear visually pressed against the device chrome. The screenshot also showed excessive vertical header height and an uneven relationship between the `GL` brand mark, title stack, and menu trigger.

The refinement adds semantic `offline-status-banner*` classes and makes the connection banner the sole owner of the top safe-area inset on mobile. The mobile top bar now starts directly below that banner, uses a compact 42px brand mark and 46px menu hit area, centers the identity group vertically, and reduces typography/spacing while preserving the existing desktop header unchanged. The sync progress/pending badge is hidden on narrow mobile widths because the primary connection state remains readable without creating a second competing control row.

Verification: `npx tsc -b` passed with no output, `npm run build:frontend` passed, and the existing Vite warning about an ineffective dynamic import remains unrelated to the header change.
