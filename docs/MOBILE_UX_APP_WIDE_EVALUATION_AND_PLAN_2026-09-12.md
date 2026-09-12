# Mobile UX — App-Wide Evaluation & Consolidated Plan (2026-09-12)

> **Product:** Catevia / TNTTVN (`brave-davinci`)  
> **Scope:** Entire authenticated + public mobile experience (PWA / Capacitor), all workspaces (academic, organization, parent, shared).  
> **Companion (Operations-deep):** [`docs/OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md`](./OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md)  
> **Method:** E3 — code + existing audits (2026-08-12…09-12). **Not run this wave:** real-device E1 smoke, field RUM.  
> **Status:** Evaluation + consolidated plan (implementation not started in this document’s authoring turn).

---

## 0. One-page verdict

| Layer | Health | Notes |
| --- | --- | --- |
| **Shell / DS contract** | Strong | MobileAppShell, safe-area, bottom-nav, ModalPortal, 44px, `<1024`/`≥1024` aligned (FUX-05 fixed) |
| **Academic mobile-native views** | Strong–Good | Dedicated `Mobile*View` for Home/Attendance/Grades/Students/Reports/Notices/Calendar/Leave |
| **Organization workspace IA** | Uneven | Bottom-nav strong for parish/calendar/finances/profile; **Operations missing from nav** |
| **Adaptive DesktopAppShell pages on phone** | Mixed / weak for ops | Ops, Parish Profile, Org Dashboard, Finance, Settings, Parent, Audit, Academic Year, Catechists |
| **Admin-only desktop components on mobile** | Weak | Classes/Users render desktop components with no mobile branch |
| **Offline / sync honesty** | Fixed for academic P0; Ops intentional lean cache | FUX-01/02 remediated; Ops cache limits under-communicated |
| **A11y / device acceptance** | Open gates | Zoom guard removed (FUX-06); 200% reflow + role×device smoke still NOT CONFIRMED |

**Largest product gap:** Operations discoverability + density on mobile.  
**Largest structural gap:** Several high-traffic org/admin surfaces still “desktop shell squeezed into phone” rather than mobile-first IA.

---

## 1. Architecture map (current truth)

### 1.1 Shell

```
mode === mobile (RootLayout):
  MobileAppShell
    ├─ HeaderBar → MobileTopBar (+ overflow control sheet)
    ├─ PageTransition → Outlet (page)
    └─ MobileBottomNav (academicTabs | orgTabs by workspace)

mode === desktop:
  desktop header + DesktopAppShell (per page) …
```

Breakpoint SSOT: `useEffectiveMode` and CSS both use **1024px** (FUX-05 resolved). Viewport meta: `viewport-fit=cover`, no `user-scalable=no`.

### 1.2 Route × mobile presence

| Route | Workspace | `mobileTab` | Mobile strategy today |
| --- | --- | --- | --- |
| `/dashboard` | academic | `home` | `MobileHomeView` |
| `/attendance` | academic | `attendance` | `MobileAttendanceView` |
| `/grades` | academic | `grades` | `MobileGradeView` (+ matrix/board/daily) |
| `/students` | academic | `students` | `MobileStudentsView` |
| `/reports` | academic | `reports` | `MobileReportsView` |
| `/leave-requests` | academic | *(via attendance desktopTab)* | `MobileLeaveRequests` + `mobile-screen` |
| `/parent` | parent | `parent` | **Adaptive** `DesktopAppShell` (no Mobile*View) |
| `/parish` | organization | `parish-home` | Adaptive org dashboard |
| `/calendar` | organization | `calendar` | `MobileCalendarView` |
| `/notices` | organization | `notices` | `MobileNoticesView` (also overflow) |
| `/finances` | organization | `finances` | Adaptive + table/card handoff |
| `/parish-profile` | organization | `parish-profile` | Adaptive ~1164 lines |
| `/catechists` | organization | `catechists` | Adaptive thin page |
| **`/operations`** | organization | **none** | Adaptive ~1918 lines; **overflow tile only** |
| `/settings` | shared | `settings` | Adaptive (also TopBar link) |
| `/feedback` | shared | none | Adaptive; overflow tile |
| `/users` `/classes` `/academic-years` `/audit-logs` `/management` | admin | none / management | Desktop components or adaptive shells |

### 1.3 Bottom-nav composition (today)

**Academic:** Home · Điểm Danh · Bảng Điểm · Thiếu Nhi|Con Tôi · Báo Cáo  

**Organization:** Tổng Quan · Huynh Trưởng? · Lịch Xứ · Sổ Quỹ|Thông Báo · Hồ Sơ Xứ  

→ **Công Việc (Operations) is not a primary tab** despite being a core staff workflow (full-feature audit D1).

### 1.4 Mobile component inventory (`src/components/mobile/`)

`MobileAppShell`, `MobileTopBar`, `MobileBottomNav`, `MobileHomeView`, `MobileAttendanceView`, `MobileAttendanceSummaryView`, `MobileGradeView`, `MobileGradeMatrix`, `MobileGradeBoard`, `MobileGradeComparison`, `MobileDailyGradeEntry`, `MobileStudentsView`, `MobileReportsView`, `MobileNoticesView`, `MobileCalendarView`, `MobileLeaveRequests`, `MobileLiturgicalWidget`.

**Missing dedicated views:** Operations, Parent, Parish/Org dashboard, Parish Profile, Finance (partial adaptive), Settings, Feedback, admin management surfaces.

---

## 2. What is already in good shape

1. **Shell synchronization (MOB-01…09, audit 2026-08-29)** — width ownership, safe-area single owner, modal portal above sticky chrome, 44px physical targets on auth/common controls.  
2. **Academic mobile workflows** — separate Mobile* views; attendance/grades save honesty fixed (FUX-01/02).  
3. **URL semester bridge & auth bootstrap** — FUX-03/04 resolved.  
4. **Native vs web shell predicate** — FUX-05 resolved.  
5. **Design System §8** — documented touch/modal/bottom-nav contracts; `lint:ds` as anti-drift.  
6. **Route policy SSOT** — fail-closed navigation by role.  
7. **Leave-requests** — proper `mobile-screen` wrapper (MOB-05 remediation).  

---

## 3. App-wide findings (consolidated)

### P0 — Product / IA

| ID | Finding | Surfaces |
| --- | --- | --- |
| **APP-M0** | Operations absent from org bottom-nav / `mobileTab` | `/operations`, `MobileBottomNav`, `routePolicy` |
| **APP-M1** | Critical org workflow buried in overflow sheet | `MobileTopBar` tiles (Công Việc, Feedback) |

### P1 — Experience / density / honesty

| ID | Finding | Surfaces |
| --- | --- | --- |
| **APP-M2** | Desktop-first megapages on phone (cognitive + scroll + tap cost) | Operations (~1918), ParishProfile (~1164), OrgDashboard (~614), Finance (~686), Audit (~798), AcademicYear (~755) |
| **APP-M3** | Parent portal has no Mobile*View — DesktopAppShell only | `/parent` |
| **APP-M4** | Admin Classes/Users always mount desktop components | `ClassesPage` → `DesktopClasses`; `UsersPage` → `UserManagementPage` |
| **APP-M5** | Org nav slot tradeoffs: finances displaces notices for admin; Operations still nowhere | `MobileBottomNav` orgTabs |
| **APP-M6** | Ops offline cache under-explained in UI | Operations banner vs ADR-110 lean cache |
| **APP-M7** | Calendar→Operations deep-link unfinished | `sourceParishEventId` |
| **APP-M8** | Device / 200% zoom / role smoke still open | FUX-06 acceptance; mobile-ui-audit-08-29 follow-up; PERF-08 |

### P2 — Polish

| ID | Finding |
| --- | --- |
| **APP-M9** | Raw filter chips / mixed `btn-sm` patterns on adaptive pages (Ops called out; check peers) |
| **APP-M10** | Feedback / settings reachable but not first-class in org IA |
| **APP-M11** | Field performance targets (PERF candidate) not yet owner-ratified or device-measured |

### Deliberate non-bugs (keep)

- Calendar 7-column date cells cannot all be 44px wide on 320px — vertical affordance OK (audit exception).  
- A4 / OMR / certificate print geometry stays specialist.  
- Operations online-first (no optimistic write) is ADR, not a mobile defect.  

---

## 4. Priority synthesis (Operations + app-wide)

```
P0  APP-M0/M1     Operations (and any critical org workflow) → primary IA
P1  APP-M2        Mobile IA / sheets for Ops + Parish Profile + Org home
P1  APP-M3/M4     Parent + admin list pages mobile branches or card handoffs
P1  APP-M6/M7     Honesty + deep-link hygiene
P1  APP-M8        Acceptance matrix (device × role × zoom)
P2  APP-M9…M11    Polish, perf field targets
```

Operations-specific phases A–D in the companion doc remain the **sharpest implementation backlog**; app-wide work below extends the same principles.

---

## 5. Consolidated improvement plan


## Wave 0 DECIDED (2026-09-12)

User confirmed org bottom-nav:

`Tổng Quan · Lịch · Công Việc · Thông Báo · Hồ Sơ`

- Demoted to overflow/secondary (no `mobileTab`): Huynh Trưởng (`/catechists`), Sổ Quỹ (`/finances`).
- Deferred: Parent `MobileParentView`; Classes/Users mobile card lists.
- W1.4 / APP-M7: deep-link search param already killed in router (no re-wire).

Wave 1 code targets: `routePolicy.ts`, `MobileBottomNav.tsx`, `MobileTopBar.tsx`, preload helpers + tests.

### Wave 0 — Decisions (half-day, product)

1. **Org bottom-nav pentagon** for STAFF — proposed default:  
   `Tổng Quan · Lịch · Công Việc · Thông Báo · Hồ Sơ`  
   (Finances/Catechists → overflow or role-conditional 5th slot).  
2. Confirm whether Parent needs a true Mobile*View this quarter or card-handoff only.  
3. Confirm Classes/Users mobile: card list + detail sheet vs “admin desktop only / landscape recommended”.

### Wave 1 — Discoverability (1–3 days) = Ops Phase A + nav hygiene

| ID | Work | Owns |
| --- | --- | --- |
| W1.1 | `mobileTab: 'operations'` + org bottom-nav entry | Ops APP-M0 |
| W1.2 | Prefetch `/operations` for org workspace staff | Ops A2 |
| W1.3 | TopBar contextual titles; keep overflow for secondary (Feedback, diagnostics) | APP-M1 |
| W1.4 | Kill or wire `sourceParishEventId` | APP-M7 |

### Wave 2 — Mobile IA for heavy adaptive pages (1–2 weeks)

| ID | Work | Priority |
| --- | --- | --- |
| W2.1 | Operations Phase B (inbox → my work → events; create as sheet; cache honesty) | Highest |
| W2.2 | Parish Profile: tabbed mobile with sticky section nav; defer archive/admin blocks | High |
| W2.3 | Org Dashboard: KPI + 3 primary CTAs (Operations, Calendar, Profile); demote dense widgets | High |
| W2.4 | Finance: ensure `md` table/card handoff + sticky fund switcher; verify MOB-05 still holds | Medium |
| W2.5 | Parent: either `MobileParentView` or tighten DesktopAppShell embedded + entity cards | Medium |
| W2.6 | Settings/Feedback: single-column, 44px rows, group “account / data / about” | Medium |

### Wave 3 — Admin & shared (parallel / later)

| ID | Work |
| --- | --- |
| W3.1 | Users/Classes: mobile card lists + detail ModalShell; or explicit empty-state “dùng máy tính / xoay ngang” for destructive bulk |
| W3.2 | Academic Year / Audit / Management: progressive disclosure; no multi-column wizards on &lt;640px |
| W3.3 | Catechists: already thin; verify touch targets on assignment actions |

### Wave 4 — Quality gates (ongoing)

| ID | Work |
| --- | --- |
| W4.1 | Reinstate/extend `mobileLayoutContract` (+ Ops viewport probes 320/375/390/768) |
| W4.2 | Role×device smoke checklist: admin / chunhiem / phuta / parent × iOS+Android safe-area |
| W4.3 | 200% zoom reflow on Home, Attendance, Grades, Operations, Parent |
| W4.4 | Optional: mid-tier device tap→content metric vs PERF candidates |

### Wave 5 — Structural (after Waves 1–2)

| ID | Work |
| --- | --- |
| W5.1 | Split OperationsPage monolith (Ops Phase D1) |
| W5.2 | Optional dedicated `MobileOperationsHome` if Wave 2 still fails phone QA |
| W5.3 | New offline ADR only if pilot demands richer Ops cache |

---

## 6. Suggested sequencing (next 3 weeks)

| Week | Focus |
| --- | --- |
| **1** | Wave 0 decisions + W1.1–W1.4 + start W2.1 (Ops mobile IA) |
| **2** | Finish W2.1; W2.2–W2.3; W4.1 Ops contracts |
| **3** | W2.4–W2.6; W3.1 spike; W4.2–W4.3 acceptance pass |

---

## 7. Risks & non-goals

**Risks:** Org nav overcrowding; regressions in Operations critical e2e; double shell padding if pages keep `DesktopAppShell` chrome inside `MobileAppShell` without `embedded`.  

**Non-goals this program:** Redesign brand/visual language; enable optimistic Ops offline; normalize print/OMR layouts; claim WCAG AA without device evidence.

---

## 8. Document index

| Doc | Role |
| --- | --- |
| This file | App-wide evaluation + consolidated plan |
| `OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md` | Operations-deep findings + phases A–D |
| `mobile-ui-audit-2026-08-29.md` | Shell sync baseline |
| `frontend-architecture-ux-performance-audit-2026-09-06.md` §15 | FUX remediation status |
| `OPERATIONS_FULL_FEATURE_AUDIT_2026-09-12.md` | Ops product/tech audit incl. mobile D1 |
| `03_DESIGN_SYSTEM.md` §8 | Mobile contracts SSOT |

---

*Authoring agent: Bill — 2026-09-12.*
