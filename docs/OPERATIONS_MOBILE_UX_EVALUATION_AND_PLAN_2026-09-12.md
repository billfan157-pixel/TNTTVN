# Operations Mobile UX — Evaluation & Improvement Plan (2026-09-12)

> **Scope:** Catevia / TNTTVN (`brave-davinci`) — `/operations` in mobile mode, plus related mobile shell contracts.  
> **Method:** E3 code + documentation cross-read (existing mobile audits 2026-08-12…08-29, Design System, Operations full-feature audit 2026-09-12, frontend UX audit 2026-09-06 §15).  
> **Not in this pass:** real-device E1 browser/device smoke (noted as acceptance gates).  
> **Status:** Evaluation + plan only (no UI implementation in this document’s authoring turn).

---

## 1. Executive summary

App-wide mobile **shell** is mature (safe-area, bottom nav, modal portal, 44px targets, responsive breakpoints). **Operations is the largest mobile product gap**: staff reach it only via MobileTopBar overflow tile, there is no `mobileTab` / bottom-nav entry, and the page remains a ~1.7k-line desktop-first adaptive surface nested under `MobileAppShell`.

**Top priority:** Phase A discoverability (add Operations to organization mobile IA), then Phase B mobile information architecture inside the page.

---

## 2. Evidence baseline (docs + code)

| Source | Relevance |
| --- | --- |
| `docs/mobile-native-ui-audit-2026-08-12.md` | Shared MobileAppShell / TopBar / BottomNav / safe-area foundation |
| `docs/mobile-ui-audit-2026-08-22.md` | Screen-level mobile view fixes (grades/attendance/home…) |
| `docs/mobile-ui-audit-2026-08-29.md` | MOB-01…09 shell synchronization; route inventory |
| `docs/03_DESIGN_SYSTEM.md` §8 | Touch ≥44px, two shell contracts, bottom-sheet modals |
| `docs/frontend-architecture-ux-performance-audit-2026-09-06.md` §15 | FUX-01…07 mostly remediated; zoom acceptance still open |
| `docs/OPERATIONS_FULL_FEATURE_AUDIT_2026-09-12.md` §D | Explicitly flags missing Operations bottom-nav / mobileTab |
| `src/constants/routePolicy.ts` | `/operations` has `desktopTab` but **no** `mobileTab` |
| `src/components/mobile/MobileTopBar.tsx` | Overflow tile “Công Việc” → `/operations` |
| `src/components/mobile/MobileBottomNav.tsx` | Org tabs exclude Operations |
| `src/pages/OperationsPage.tsx` | `DesktopAppShell width="wide"`; KPI/filter/utility density |
| `src/components/common/RootLayout.tsx` | Mobile mode wraps all authenticated routes in `MobileAppShell` |

---

## 3. Findings (Operations-focused)

| ID | Finding | Severity | Evidence |
| --- | --- | --- | --- |
| OPS-M0 | No `mobileTab` / bottom-nav entry for Operations | **P0** | `routePolicy.ts` `/operations` policy; org `MobileBottomNav` tabs |
| OPS-M1 | Discoverability only via hamburger/overflow tile | **P0** | `MobileTopBar.tsx` ~206–213 |
| OPS-M2 | Desktop-first page (~1689 lines) under mobile shell | **P1** | `OperationsPage` + `DesktopAppShell width="wide"` |
| OPS-M3 | No dedicated `MobileOperations*` view (unlike Grades/Attendance) | **P1** | `src/components/mobile/*` inventory |
| OPS-M4 | High cognitive load: KPI strip + my-tasks + events + utility tabs + modals | **P1** | Page structure `lg:grid-cols`, utility tabs, create inline form |
| OPS-M5 | Offline banner exists but does not spell out cache limits (reminders/permissions absent) | **P1** | ADR-110 + cache banner copy |
| OPS-M6 | Calendar → Operations deep-link unfinished (`sourceParishEventId`) | **P1** | Router `validateSearch` vs page not reading param (full-feature audit) |
| OPS-M7 | Filter chips are raw `<button>` (has `mobile-touch-target`, not DS Selection/Button) | **P2** | `OperationsPage` ~908–922 |
| OPS-M8 | Device/zoom acceptance still open app-wide | **P1 gate** | FUX-06 remediation note |

**Strengths to preserve:** online-first no fake success; ModalShell for event detail; empty/error/offline states; Operations “mobile-safe action boundary” tests; Design System navy–gold + `lint:ds`.

---

## 4. Principles (do not break ADR)

1. No optimistic Operations mutations offline (ADR-109/110).
2. One shell contract — avoid double ownership; prefer embedded/responsive page content inside existing `MobileAppShell`.
3. Mobile IA priority: **my work → claim/accept → blockers → today’s events**; deep admin (templates/lead replace) secondary.
4. Evidence-first: Vitest layout contracts + 375/390 viewport checks before real-device QA.

---

## 5. Improvement plan


## Wave 0 DECIDED (2026-09-12)

Org bottom-nav pentagon (user confirmed): **Tổng Quan · Lịch · Công Việc · Thông Báo · Hồ Sơ**.  
Huynh Trưởng + Sổ Quỹ → MobileTopBar overflow (secondary routes, no `mobileTab`).  
Parent / Classes·Users Mobile*View deferred past Wave 1.

### Phase A / Wave 1 implementation status

| ID | Status |
| --- | --- |
| A1 / W1.1 | Implemented — `mobileTab: 'operations'` + org bottom-nav |
| A2 / W1.2 | Implemented — `MOBILE_ORG_PRIMARY_TABS` in idle preload |
| A3 / W1.3 | Title already from `mobileTitle`; Ops removed from overflow; Catechists/Finances added |
| A4 / W1.4 | **RESOLVED earlier** — dead `validateSearch({sourceParishEventId})` already removed from router; domain field kept |

### Phase A — Discoverability & IA (1–3 days) — **do first**

| ID | Work | Done when |
| --- | --- | --- |
| A1 | Add `mobileTab: 'operations'` (or org tab “Công Việc”) to routePolicy + MobileBottomNav org tabs; product-decide which tab to demote if >5 | STAFF reaches Operations in ≤1 tap from org workspace |
| A2 | Prefetch Operations chunk for organization workspace | Prefetch list includes `/operations` for staff |
| A3 | Contextual MobileTopBar title/subtitle on `/operations` | Title reflects “Công việc” + pending count if cheap |
| A4 | Resolve `sourceParishEventId`: implement deep-link **or** delete dead `validateSearch` | One coherent contract |

### Phase B — In-page mobile IA (3–7 days)

| ID | Work |
| --- | --- |
| B1 | Primary mobile stack: inbox (dispatch/reminder) → my tasks + chips → active events; utilities secondary (sheet/tab) |
| B2 | Event detail ModalShell as bottom-sheet &lt;sm; single-column; sticky primary actions |
| B3 | Create event/task as full-screen/sheet modal — not long inline forms |
| B4 | Cache banner honesty: what is/isn’t available offline |
| B5 | Chips → DS toggle/Selection with `aria-pressed` + ≥44px |

### Phase C — Polish & a11y (2–4 days)

| ID | Work |
| --- | --- |
| C1 | Viewport matrix 320/375/390/768 for `/operations` |
| C2 | Dark-mode token spot-check |
| C3 | 200% zoom reflow smoke (partial FUX-06 acceptance) |
| C4 | Per-control busy state (avoid global busy lock UX) |

### Phase D — Structural (week 2+)

| ID | Work |
| --- | --- |
| D1 | Split OperationsPage monolith → thin orchestrator |
| D2 | Optional dedicated `MobileOperationsHome` if B still too dense on real phones |
| D3 | New offline ADR only if pilot proves need |

---

## 6. Risks

- Org bottom-nav slot pressure → need explicit product choice before A1.
- Large `OperationsPage` diffs → lean on Operations unit + e2e `@critical`.
- Real iOS Safari keyboard/safe-area not replaced by Chromium-local checks.

---

## 7. Recommended immediate sequence

1. A1 + A2  
2. B1 + B3 + B4  
3. A4  
4. C1  
5. D1 after UX stabilizes  

---

*Authoring agent: Bill — 2026-09-12. Companion app-wide synthesis: see `docs/MOBILE_UX_APP_WIDE_EVALUATION_AND_PLAN_2026-09-12.md` (produced in the same research wave).*
