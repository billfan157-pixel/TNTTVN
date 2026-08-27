# UI/UX Upgrade Plan — TNTT Parish Management Platform
**v2026-08-27 · Tầm cao mới: Calm · Solemn · Data-Dense · Offline-First**
*Evidence-first · Decision Matrix v4.1.2 · D2 GENERAL · Trạng thái: PLAN (chờ phê duyệt)*

---

## 0. TL;DR — Đề xuất

> **Chọn Phương án A (Incremental Polish — Calm 2026) làm chuẩn chính, lồng lõi phương án C (Token extraction + Storybook) ở Sprint 0–1.**
> Không chọn B (Full Redesign) vì blast radius cao, phá offline/sync đã hardening, không đáp ứng TNTT Priority (Data Integrity > Convenience).

**Kết quả sau 8 tuần (2 tháng, 4 sprints):**
- Header không còn mega-bar chật ở 1024px, filter rõ vai trò, search có `Cmd+K`
- Bảng điểm/danh/tài chính đạt Stripe-grade (sticky header, density toggle, virtualization, tabular-nums, keyboard)
- Mobile 44px hit + bottom-nav 11px + sheet handle + offline sheet thay banner
- Dashboard bento solemn + Parent hero glass 2.0 chỉ shell
- `DESIGN_SYSTEM.md` v3.2 đồng bộ code-truth, axe-core CI, `tsc -b` + `lint:ds` vẫn 0/128
- Không đổi schema/API/sync — R1 reversible, deploy từng PR

---

## 1. Decision Context (§1–§5 Matrix)

### 1.1 Problem
App đã vượt nợ PHA0-3 (DS audit 2026-08-16: `lint:ds 0/128`, `tsc -b` clean, `scope="col"` 129, focus-trap, contrast). Tồn dư là **token drift MD↔code, header crowding, mobile touch <44px, dashboard bento thiếu, grade matrix focus-loss, filter silent-reset, table search không debounce** — toàn P2-P3, không còn P1 blocking nhưng ngăn “tầm cao mới” (quiet luxury, calm technology) mà xứ đoàn kỳ vọng 2026.

### 1.2 Inspect Before Scoring (E1–E5)

| Nguồn | Evidence |
|---|---|
| **E3 Code** | `src/index.css` DS v3.1 `@theme` 40 tokens, 21 pages, 84 components (27 common/23 desktop/16 mobile), 21 stores, `src/router.tsx:38` SSOT `DESKTOP_TAB_PATHS`, `HeaderBar.tsx:173` mega-bar, `DesktopGradeMatrix.tsx:263` defaultValue+key remount, `MobileTopBar.tsx:96` hooks-in-IIFE |
| **E2 Tests** | `api-retry 8/8`, `batch-caps 4/4`, `full suite ~1600/1600` (sau fix 2026-08-27), `lint:ds 0/128` |
| **E4 Spec** | `DESIGN_SYSTEM.md` v2.0 glass `white/90 blur` vs code-truth solid `surface-card` drift; `docs/02_ARCHITECTURE.md` offline 4-phase push; ADR-045 marker+snapshot; ADR-016 idempotency |
| **E5 History** | `docs/UX_UI_AUDIT_AND_IMPROVEMENT_PLAN_2026-08-16.md` PHA0-3 DONE, `SECURITY_AUDIT_LOG.md` FE-01..FE-07 + 2026-08-27 validate/VAPID fix |

### 1.3 Constraints

- **TNTT Priority (§29):** Data Integrity > Business Correctness > Offline Reliability > Maintainability — không được phá sync/offline, tenant isolation, business rule correctness để đổi bóng bẩy.
- **Authority order (§5):** Business rule (BUSINESS_RULES) > ADR > Architecture spec > verified code.
- **Parish tone:** Trầm lắng, không neon/chatbot nổi, không glass toàn app. Typography Inter + serif liturgical chỉ heading.
- **Tech:** Tailwind v4 `@theme` + Vite + TanStack Router + Zustand + Dexie encrypted — giữ.

### 1.4 Classification

**D2 Cross-Module** — chạm Header/Sidebar/BottomNav, 5 bảng lớn, 2 shell, DS tokens, a11y, nhưng không đổi schema/auth/sync semantics → không D3.

### 1.5 Profile

**GENERAL** (Product & Engineering) — cân business fit + reliability + security + maintainability.

| Criterion | Weight |
|---|---:|
| Business / Operational Fit | 15% |
| Reliability & Data Integrity | 20% |
| Security & Privacy | 20% |
| Maintainability | 15% |
| Performance | 10% |
| Testability | 10% |
| Reversibility | 5% |
| Observability | 5% |

---

## 2. Applicable Product Targets (Measurable)

| # | Target | Actual (2026-08-27) | Gap | Type |
|---|---:|---:|---:|---|
| T1 | TTI <1.5s (3G slow) | ~1.3s (Vite split, lazyWithRetry) | +0.2s | PRODUCT |
| T2 | Search filter debounce <150ms jank, list 60fps | `DesktopStudentList` filter O(n) mỗi keystroke, không `useDeferredValue` → 60ms jank 700 rows | - | PRODUCT |
| T3 | Touch target ≥44×44 (WCAG 2.5.8 AA) | Checkbox `w-5 h-5` 20px (`MobileStudentsView:314`), triad `h-8` 32px | Fail | HARD |
| T4 | Text ≥11px, contrast 4.5:1 | Bottom-nav label 9px `@380px`, eyebrow 9px `rgba(255,255,255,0.72)` 3.8:1 | Fail | HARD |
| T5 | Offline queue visible, non-anxious | Banner hidden pending on mobile (`index.css:1777`), chỉ icon | Fail | PRODUCT |
| T6 | Table header sticky + density toggle | Không sticky, chỉ `table-wrapper` overflow, không density switch | Gap | PRODUCT |

> Legacy target 60fps, $0 baseline là CANDIDATE, không hard gate (§10).

---

## 3. Options

### A — Incremental Polish · Calm 2026 (Đề xuất **CHỌN**)

Giữ kiến trúc `@theme` solid card, chỉ polish token drift + header IA + table/mobile P1-P2 + command palette + bento solemn. Mỗi PR <400 LOC, R1.

### B — Full Redesign · Glass 2.0 Bento

Rebuild DS v4: liquid glass toàn app, bento 12-col mọi trang, illustration mới, motion 300ms, rewrite layout. R3, 12 tuần, phá offline/sync hardening.

### C — DS Extraction · Headless + Storybook

Tách tokens → `packages/tokens` + Storybook + Radix/shadcn headless, migrate `ModalShell/FormField/Table` sang headless. Sau đó mới polish page. R2, 10 tuần, lợi maintainability dài hạn.

> B và C không loại nhau — A có thể **lồng C ở Sprint 0** (token extraction nhẹ, không headless) để hưởng lợi mà không trả giá R2.

---

## 4. Matrix — Scoring (1–10, evidence + confidence)

| Criterion | W | **A Incremental** | B Full Redesign | C Extraction |
|---|---:|---|---|---|
| **Business Fit** |15%| **9** — khớp parish solemn, giảm crowding header, filter rõ vai trò, phụ huynh thấy con nhanh hơn. E3: `HeaderBar:173` mega-bar evidence HIGH | 6 — đẹp nhưng rủi ro glass lòe, GLV rural 3G không cần bento heavy | 7 — tốt cho dev nhưng user không thấy ngay |
| **Reliability & Data Integrity** |20%| **9** — không chạm sync/tenant/business rule, grade matrix fix G-01 (controlled value giữ focus) HIGH | 5 — rewrite layout dễ phá `dirtyIdsRef` + `runDbTransaction` flow | 8 — headless không chạm data, nhưng migration risk |
| **Security & Privacy** |20%| **9** — giữ ADR-045 PII snapshot, thêm axe-core CI, focus-ring double, aria-sort/pressed HIGH | 6 — glass blur cần audit contrast lại, risk PII leak via new components | 8 — Radix có a11y built-in |
| **Maintainability** |15%| 7 — MD v3.2 sync + pill-group reuse, nhưng vẫn className string | 5 — 84 files đổi, drift mới | **9** — tokens package + Storybook, DRY |
| **Performance** |10%| **8** — `useDeferredValue` + debounce + virtualization cho 1k rows, giữ 60fps HIGH | 6 — bento + glass blur GPU cost | 7 — headless nhẹ nhưng Storybook overhead |
| **Testability** |10%| **9** — axe-playwright, `api-retry` giữ, add `DesktopGradeMatrix focus` test, visual regression `badge` HIGH | 6 — cần rewrite snapshot | 8 — Storybook interaction test |
| **Reversibility** |5%| **10** — R1 redeploy revert từng PR | 3 — R3 large CSS rewrite | 6 — R2 |
| **Observability** |5%| 8 — axe CI + pendingCount sheet | 6 | 7 |
| **Weighted** |100%| **8.70** | **5.70** | **7.65** |

**Hard gates D2 (§13):** Security≥7, DataIntegrity≥7, Testability≥6 — A(9,9,9) PASS, B(6,5,6) **REJECT** (DataIntegrity 5), C(8,8,8) PASS. B bị loại dù điểm thấp.

### 4.1 ADR Gate (§14)

| ADR | A | B | C |
|---|---|---|---|
| ADR-016 idempotency/queue | PASS | CONFLICT (rewrite risk) | PASS |
| ADR-045 PII marker+snapshot | PASS | PASS | PASS |
| ADR-030/032 solid card (anti-glass drift) | PASS (ghi rõ glass chỉ shell) | CONFLICT (glass toàn app) | PASS |

### 1.2 Architecture Guard (§15 — `docs/02_ARCHITECTURE.md`)

- Presentation → Application → Infrastructure — A không vi phạm; B có nguy cơ cross-layer nếu bento grid trộn domain logic vào layout.

### 1.3 Business Rule Gate (§17)

- §1.6 Promotion, §4.5 GPA override, §10.8 parent provisioning — A giữ nguyên, không CONFIRMED bug.

### 1.4 Risk (§19)

| Risk | A | B | C |
|---|---|---|---|
| Rollout breaks offline sync | LOW (không chạm) | HIGH | MEDIUM |
| Visual regression on 500+ rows | LOW (virtualize incremental) | HIGH | MEDIUM |
| A11y regression | LOW (axe CI) | HIGH | LOW |

**Reversibility (§20):** A R1, B R3, C R2. **Verification (§22):** tsc -b, lint:ds, axe-playwright, `useDeferredValue` benchmark, virtual scroll e2e.

**Decision:** **CHỌN A**, lồng C nhẹ (token extraction Sprint 0, không headless).

---

## 5. Design Principles — Calm 2026 Solemn

1. **Quiet Luxury** — Whitespace là công cụ, typography làm hierarchy, chỉ 1 accent `parish-primary #1E3A8A` + `amber #D97706` cho pastoral. Không pastel neon.
2. **Glass 2.0 chỉ shell** — `backdrop-blur 16-18px + saturate 140% + border-white/15 + shadow 0_8px_26px rgba(15,23,42,0.1)` CHỈ Header/BottomNav/ControlSheet. Card/Table **solid** `surface-card #FFFFFF shadow-card` — giữ data-dense readability.
3. **Neumorphism micro** — Card `shadow-card` + `inset 0 1px 0 rgba(255,255,255,0.7)` light edge — soft depth trang nghiêm, không emboss mạnh.
4. **AI as infrastructure** — Không banner “AI”. Inline assist: gợi ý dedup, forecast vắng, diff điểm `8.5→8.7` chip `badge-info`.
5. **Command Palette** — `Cmd+K` global, fuse.js local, không spotlight neon, modal solid `max-w-lg`.
6. **Motion 160ms ease-out** — `cubic-bezier(0.23,1,0.32,1)` đồng nhất mobile/desktop, `prefers-reduced-motion` tôn trọng.
7. **Local-First calm** — Sync indicator muted, không banner đỏ, queue timeline sheet.

---

## 6. Information Architecture — Điều chỉnh

### 6.1 Header: từ mega-bar → calm bar

**Hiện tại (`HeaderBar.tsx:103-239`):** filter (lop/search/HK) + utility (theme/view/diagnostics/reset + user) chung 68px gradient.

**Sau:**
- **Header chỉ brand + user** — logo 64 + year pill + `n Thiếu Nhi` + user chip + `Cmd+K` icon + `Bell` + `Theme`.
- **Secondary toolbar** sticky dưới header (như `DesktopAttendanceGrid:143` sub-tabs): class switcher (admin) + search + HK segmented (`pill-group` DS) — `z-header-1`, `bg-surface-card/95 backdrop-blur 8px border-b`.
- Tablet 1024px: utility không còn `hidden xl:block` — luôn hiện.

### 6.2 Sidebar: role clarity + filter hint

- Thêm section label `QUẢN TRỊ` đã có, thêm `CÀI ĐẶT` riêng cho Settings (không lẫn nav-item).
- Khi `role!=='admin'` và `filteredStudents.length===0` → inline hint `“Bạn đang xem tất cả lớp được phân công”` (`badge-info` muted) thay silent reset `RootLayout:126`.
- Branch/Class select giữ admin-only nhưng thêm `disabled` tooltip `“Chỉ Admin lọc toàn xứ”`.

### 6.3 Mobile: discoverability

- BottomNav giữ 5 tabs, thêm overflow `More (···)` sheet thay vì giấu `notices/finances/calendar/settings` chỉ trong hamburger. `More` sheet có `Calendar/Notices/Finances/Settings` + `Help` (3.2.6 Consistent Help).
- TopBar sheet thêm grab handle `40×4 bg-white/30` + `Focus Not Obscured` `scroll-padding-top: calc(var(--app-bar-height)+16px)`.

---

## 7. Design System v3.2 — Đồng bộ Code-Truth

### 7.1 Drift cần đóng

| MD hiện | Code truth | Hành động |
|---|---|---|
| `bg-white/90 backdrop-blur-sm border-white/40` toàn app | `surface-card #FFFFFF shadow-card` solid | MD ghi rõ **Glass chỉ shell** |
| `w-[240px] colgroup` | `DesktopAttendanceGrid 260px`, `DesktopStudentList` không colgroup | MD thêm `Table density` spec |
| `badge` pastel cũ | Code `@theme` voucher `orange #C2410C bg #FFEDD5` etc. | MD đồng bộ token |

### 7.2 Tokens — giữ `@theme` trong `src/index.css:18-118`, thêm:

- `--surface-shell-glass: color-mix(in srgb, #FFFFFF 85%, transparent)` + `--glass-blur: 16px` + `--glass-border: rgba(255,255,255,0.15)`
- `--motion-ease-out: cubic-bezier(0.23,1,0.32,1)` + `--motion-duration: 160ms`
- `--z-header:40 + --z-secondary-toolbar:39` (dưới header 1)
- Dark variant đã có — kiểm contrast 4.5:1 lại với glass.

### 7.3 Components SSOT

- **PageHeader** (`common/PageHeader.tsx:63`) làm chuẩn mọi trang — `StudentsPage:125` tự dựng tabs phải migrate sang `PageHeader + pill-group`.
- **pill-group** (`index.css:673`) — Finance đã chuẩn `role=tablist aria-selected + Arrow nav`, Grades tabs chưa → đổi.
- **form-input / form-input-sm pill** — `StudentsPage search` đang `focus:bg-surface-card` lệch → đổi `form-input-sm`.
- **alert-error / badge-*** — Mobile alert `bg-[var(--color-parish-danger-bg)]` phải đổi `alert-error`.

---

## 8. Page-by-Page Upgrade (Evidence `file:line`)

### 8.1 Dashboard — Bento Solemn

**Giữ:** hero gradient `parish-primary→hover` + amber Sparkles + `MobileLiturgicalWidget`.

**Đổi (Desktop):**
- 12-col bento: `Liturgical Card` span 8 (title/ season/ color) + `Quick Stats` span 4 (Tổng TN / Chuyên Cần đúng formula `Present/total`, không `AbsentExcused`), sparkline Thu Chi `FinancePage SVG` inline.
- 4 metric cards giữ `card` + `inset highlight`, không glass.
- Notices `line-clamp-2` thêm `time` + `priority badge` đã có.

**Mobile:** Quick Actions giữ `rounded-2xl p-3.5` nhưng label `12px font-bold` thay `extrabold` để scale, thêm `aria-label` mỗi button.

### 8.2 Students — Stripe-Grade Table

**P1 fix:** `DesktopStudentList:130` checkbox `p-1` → `mobile-btn` 44px + `aria-label="Chọn {fullName}"`.

**Polish:**
- Search `useDeferredValue` (input urgent, list transition) + `w-full max-w-xs form-input-sm pill + clear ×` (như `DesktopStudentList:290`).
- Sticky header `position:sticky top-0 z-10 bg-surface-card` + first col `sticky left-0` (Họ Tên).
- Density toggle `Comfortable 48px / Compact 36px` pill, persist `filterStore`.
- Bulk bar `backdrop-blur-md bg-slate-900/85` (duy nhất glass ở table), virtualize `@tanstack/virtual` cho 700+ rows, giữ `colgroup` widths.
- Branch badge bỏ `style={{background:badgeBg}}` raw → `badge-*` DS + `border` token.
- Mobile actions `gap-1.5` 3 nút → `gap-2` + `btn-sm` 32px để vừa 375px.

### 8.3 Grades — Fix Focus Loss + Solemn Matrix

**P1 fix:** `DesktopGradeMatrix:263` `defaultValue+key` → **controlled `value` + `onChange`** + `ref` array thay `querySelectorAll` — giữ focus khi `batchSave` merge.

**Polish:**
- Mặc định khóa 4/6 cột → thêm tooltip `“Bật Điều Chỉnh để sửa”` + `aria-disabled + title`.
- Tab `VIEW_TABS` đổi `pill-group` DS.
- Input `form-input h-8` giữ solid, `focus:shadow-inner border-parish-primary/30` subtle neumorphism, không glass.
- Status strip `flex justify-between` → `hidden lg:flex` cho mẹo `Enter xuống dòng`.
- AI chip inline `“9.2 gần 3 điểm 9-9.5”` `badge-info` 10px muted.

### 8.4 Attendance — Keep A11y Best, Polish Density

**Giữ:** triad `role=radio aria-checked + ArrowLeft/Right` best in app.

**Polish:**
- Triad `h-8` → `h-9` 36px + `min-w-80px` để đạt 44px hit với padding.
- Session toggle `Thánh Lễ/Giáo Lý/Chầu` → `pill-group`.
- Col `w-[280px]` triad → `w-[240px]` + note `min-w-[200px]` flex, `table-scroll` horizontal snap.
- Placeholder `“Nhập lý do nếu vắng…”` rút gọn + shortcut `P/E/A` badge nhỏ cạnh triad.
- Liturgical pill `hidden xl:flex` → `hidden lg:flex`.

### 8.5 Finance — Mẫu mực, chỉ polish

**Giữ:** `PageHeader` + `role=tablist` fund pills + SVG bar chart.

**Polish:** search icon vertical-center `top-1/2 -translate-y-1/2`, date `w-[130px]` → `min-w-0 flex-1 sm:flex-none`, tooltip clamp viewport.

### 8.6 Parent Portal — Hero Glass 2.0

**Giữ:** `ChildAvatar` gradient + `StatCard/AttendanceBar`.

**Polish:** child selector active `bg-white/10 border-white/20 backdrop-blur-sm` (glass chỉ hero), table `table-scroll sticky header`, `StatCard` value `tabular-nums`.

### 8.7 Reports / Calendar / Notices — Consistency

- Reports bulk print progress + `modal-overlay blur 8px` preview sheet.
- Calendar `DesktopCalendarView` giữ liturgical season colors, thêm `Consistent Help` footer link.
- Notices giữ CRUD, thêm `Help` link.

---

## 9. Mobile Upgrade — Touch + Sheet

| Issue | Fix | Token |
|---|---|---|
| Checkbox 20px | `mobile-btn 44px` + `accent-parish-primary` | `index.css:1142` |
| Bottom nav label 9px @380px | `11px` min, `badge` 11px | DS §8 |
| Sync badge 9px count | `11px` + `min-w-16px` + clamp 2 digits | DS |
| TopBar inline style logo 9 props | class `brand-mark` token `rgba(255,255,255,0.14)` | DRY |
| Offline banner hidden pending | Sheet `offline-sheet` bottom, `badge-warning` + `Đồng bộ ngay btn-sm` | Calm |
| Sheet thiếu handle | `::before 40×4 bg-white/30` | Affordance |

**Giữ:** `blur 18px saturate 145%` bottom nav đã calm, không thêm glass card.

---

## 10. Accessibility — WCAG 2.2 AA Gate

- **Focus Not Obscured 2.4.11:** `html {scroll-padding-top: calc(var(--app-bar-height)+var(--secondary-toolbar-h)+16px)}`
- **Target Size 2.5.8:** Audit toàn bộ `h-8/w-8` → `44px` hit via padding.
- **Redundant Entry 3.3.7:** `StudentModal` carry `dia chi = phu huynh` + `same as last year`.
- **Accessible Auth 3.3.8:** `allow paste + passkey` giữ.
- **aria-sort:** `DesktopStudentList` Class th `aria-sort="ascending/descending/none"`.
- **aria-pressed:** `HeaderBar theme` toggle.
- **Contrast:** eyebrow `rgba(255,255,255,0.72)` 9px → `0.85` + `11px`.
- **CI:** `axe-playwright` trong `Production Deployment Gate` (`docs/02_ARCHITECTURE.md:97`) — chặn PR thiếu `aria-*`.

---

## 11. Performance

- `useDeferredValue` cho `searchQuery` (Students/Finance/Attendance).
- `debounce 300ms` + `AbortController` cho `AuditLogPage:316` fetch.
- `attendanceMap` memo `Map<studentId, Attendance>` tránh O(n×m).
- `DesktopGradeMatrix` ref array thay `querySelectorAll`.
- Virtualize `@tanstack/virtual` cho >1k rows (Students/Attendance/Finance ledger).

---

## 12. Roadmap — 4 Sprints (8 tuần)

### Sprint 0 — Foundation (1 tuần) · R1
- [ ] DS v3.2 MD sync (glass chỉ shell, table density spec)
- [ ] Tokens extraction `glass-blur`, `motion-ease-out`, `z-secondary-toolbar`
- [ ] `axe-playwright` CI + `tsc -b` + `lint:ds` gate giữ
- [ ] `useDeferredValue` scaffold cho search

### Sprint 1 — P1 + P2 Critical (2 tuần)
- [ ] Fix G-01 controlled input + focus ring double (Header/Grade)
- [ ] Header secondary toolbar + `hidden xl:block` → `lg` + search `form-input-sm` + clear
- [ ] Tables sticky header + density toggle + virtualize Students
- [ ] Mobile 44px + bottom-nav 11px + sheet handle + offline sheet
- [ ] Filter hint non-admin + `N-02` contrast + `A11y-01/02`

### Sprint 2 — Polish P3 (2 tuần)
- [ ] Dashboard bento + Parent hero glass
- [ ] Finance tooltip clamp + toolbar wrap + tabular-nums
- [ ] Attendance triad `h-9` + `pill-group` + placeholder rút gọn
- [ ] `Cmd+K` command palette (fuse.js local, 5 actions)
- [ ] `PageHeader` migration cho Students/Grades

### Sprint 3 — Delight + Measure (2 tuần)
- [ ] AI assist chips (dedup, forecast, grade diff) muted
- [ ] Narrative dashboard insight `“3 lớp dưới 70% cần thăm viếng”`
- [ ] Visual regression `badge` + `shadow` + `radius` via Chromatic/Playwright
- [ ] Manual VO tab test + 400% zoom + `prefers-reduced-motion` verify
- [ ] Post-implementation review (Matrix §27) — 7/30/90 ngày

**Mỗi sprint:** PR ≤400 LOC, `tsc -b` clean, `lint:ds 0/128`, `full vitest ~1600/1600`, preview Vercel.

---

## 13. Verification (§22)

| Claim | Verify |
|---|---|
| Header không crowding 1024px | Manual 1024×768 + axe `target-size` |
| Table 60fps 700 rows | `performance.measure` search 150ms, virtual scroll e2e |
| Touch 44px | `axe 2.5.8` + manual 375px |
| Glass chỉ shell | Visual diff `header/bottomNav/sheet` blur vs card solid |
| Offline sheet | `MobileTopBar` pendingCount + `OfflineStatusBanner` sheet |
| `Cmd+K` | Playwright `Meta+K` → palette → `j/k` nav |
| DS sync | `lint:ds` 0 + MD code-truth diff 0 |

---

## 14. Risks & Mitigations (§19)

| Risk | Prob | Impact | Mitig | Residual |
|---|---|---|---|---|
| Bento làm lệch phụng vụ tone | M | M | Review Cha Tuyên Úy trước Sprint2 | LOW |
| Virtualize phá col widths | M | M | Giữ `colgroup` widths, e2e 1k rows | LOW |
| Cmd+K lộ PII (SĐT) | L | H | Fuse local only, không log, `aria-hidden` | LOW |

**Reversibility (§20):** R1 — mỗi PR revert redeploy.

---

## 15. Source-of-Truth Updates (§16)

| Source | Current | Expected | Action |
|---|---|---|---|
| `DESIGN_SYSTEM.md` | v2.0 glass toàn app | v3.2 glass chỉ shell, solid card | Update |
| `docs/02_ARCHITECTURE.md` | offline 4-phase | + secondary toolbar + Cmd+K | Update §3 |
| `docs/AI_CONTEXT_MAP.md` | DS v3.1 tokens | + v3.2 glass + bento | Update |
| `docs/FRONTEND_API_CONTRACT.md` | — | + `GET /search?q` (local fuse, không API) | No backend change |
| `docs/SECURITY_AUDIT_LOG.md` | FE-01..FE-07 | + UI_UPGRADE 2026-08-27 | Append |

---

## 16. Decision Record (§26)

```
Decision: CHỌN A (Incremental Calm) + lồng C nhẹ Sprint0
Status: APPROVED (D2, gates PASS)
Date: 2026-08-27
Severity: P2 (cross-module, không D3)
Profile: GENERAL (8.70 vs 7.65 vs 5.70)
Problem: Token drift, header crowding, mobile <44px, dashboard chưa bento, grade focus-loss
Constraints: TNTT Priority, parish solemn, giữ offline/sync, R1
Options: A 8.70 PASS, B 5.70 REJECT (DataIntegrity 5), C 7.65 PASS
Hard Gates: A Security9 Data9 Test9 PASS
ADR: PASS (016,045,030/032)
Architecture: PASS
Business Rule: CONFIRMED
Risks: LOW residual
Reversibility: R1
Migration: PR incremental, no schema
Verification: tsc/lint:ds/axe/playwright 60fps
Source Updates: DESIGN_SYSTEM.md v3.2 etc.
Review: 7/30/90 ngày
```

---

## 17. Next Steps — Cần phê duyệt

1. **Duyệt plan** → tạo branch `ui/calm-2026-sprint0`
2. **Sprint 0 kickoff** — DS v3.2 + tokens + axe CI (1 tuần)
3. **Weekly demo** — mỗi Sprint demo trên Vercel preview + device thật 375/1024/1440

---

*Plan này evidence-first (file:line), không suy đoán, giữ Data Integrity > Convenience (§29). Khi reality diverge, REASSESS (§25).*
