# Desktop Mode UI — Comprehensive Audit & Improvement Plan

> **Date:** 2026-08-22 · **Scope:** Desktop mode (viewport ≥ 768px) presentation layer · **Decision severity:** D2 (cross-module, presentation-only — no auth/tenant/API/data-schema changes)
> **Method:** Evidence-first (Decision Matrix v4.1.2 §4–§6). 3 parallel investigation tracks (shell/navigation, screen-level, prior-art reconciliation). All HIGH-severity findings independently spot-checked by the auditor before publication.
> **Status of this doc:** AUDIT + PLAN (chưa triển khai code). Mỗi phase phải có verification riêng trước khi đánh dấu ✅.

---

## 0. Executive Summary

| Severity | Count | Note |
|---|---|---|
| **HIGH** | 12 | Gồm 5 functional defects thật sự + 2 data-integrity-adjacent UX defects + structural gaps |
| **MED** | ~25 | Chủ yếu consistency, a11y, responsive 768–1280px |
| **LOW** | ~30 | Polish, tooltips, dark-mode chi tiết |

**5 root causes cấu trúc** (mọi finding đều quy về một trong các gốc này):

1. **Hệ responsive kép không phối hợp**: JS shell-switch tại 768px (`useEffectiveMode`) + Tailwind `sm/md/lg/xl` rải rác không theo contract nào.
2. **Không có `DesktopAppShell`**: mobile có shared contract (`MobileAppShell` + `.mobile-screen`), desktop thì chrome nằm inline trong `RootLayout.tsx:201-256` và mỗi screen tự chế container.
3. **Modal logic copy-paste ở ~20 component**: chỉ `ModalShell`/`ConfirmDialog`/`StudentModal` có focus trap; Escape được re-implement tay ~16 nơi → cascade bug khi stack dialog.
4. **Async-persisted UI state không có bootstrap đồng bộ**: `viewMode`, theme lưu IndexedDB → first paint sai mode/flash light-mode.
5. **Design system thiếu hẳn section desktop** (`03_DESIGN_SYSTEM.md` §8 chỉ có mobile) → không có chuẩn container/breakpoint/grid để lint hay review.

---

## 1. Kiến trúc Shell & Navigation

### 1.1 Cơ chế chuyển mode
- JS-based, threshold 768px: `src/hooks/useEffectiveMode.ts:11,17` (`window.innerWidth < 768`), không dùng `matchMedia`. Override thủ công qua `viewMode` persist trong `filterStore.ts:27,35`; Capacitor force-mobile (`useEffectiveMode.ts:10,23`).
- Điểm phân nhánh: `RootLayout.tsx:150` (mobile) vs `RootLayout.tsx:201-216` (desktop). CSS layer đồng bộ cùng mốc 768 (`index.css:1371-1376`).

### Findings

| # | Sev | Finding | Evidence | Confidence |
|---|---|---|---|---|
| A1 | **HIGH** | Bật chế độ "Mobile" trên viewport ≥768px → **app trắng trơn**: `MobileAppShell` render nhưng bị CSS `display:none` ở ≥768px, không có fallback | `HeaderBar.tsx:225-237` → `useEffectiveMode.ts:24` → `RootLayout.tsx:150` + `index.css:1372-1375` — đã spot-check | HIGH |
| A2 | MED | Crossing 768px remount cả cây page → mất local state (tab GradesPage, focus search…) | `RootLayout.tsx:150` vs `:201`; `GradesPage.tsx:31` | HIGH |
| A3 | MED | First-paint sai mode do `viewMode` rehydrate async từ IndexedDB | `filterStore.ts:35` + `lib/db.ts:142-172` | MED |
| A4 | MED | Hai hệ responsive chồng lớp bên trong desktop mode: `hidden lg:block` tên user (`HeaderBar.tsx:185`), `hidden xl:flex` chip phụng vụ (`DesktopAttendanceGrid.tsx:215`), `md:/lg:` dashboard… | các file đã nêu | HIGH |
| A5 | MED | Force-desktop trên điện thoại <768px: sidebar 260px + p-6 chừa ~65px nội dung @375px; body `overflow-x:auto` cho phép pan | `index.css:129,1942-1951`; `MobileTopBar.tsx:233-235` | HIGH |

### 1.2 Header desktop (`HeaderBar.tsx`) — 10 cụm control trên 1 hàng

Inventory đã verify: offline banner (:55), logo+title+parish badge (:72-84), chips năm học+Sĩ số (:85-92), select lớp (:101-119), global search (:122-131), segmented HK I/II (:134-166), Diagnostics (:169-177), user badge+logout (:180-198), switch Monitor/Mobile (:211-238), theme toggle (:240-248), reset-all-data (:250-258).

| # | Sev | Finding | Evidence | Confidence |
|---|---|---|---|---|
| A6 | **HIGH** | Overload + phẳng hierarchy: control toàn cục (theme/reset/diagnostics/view-mode) trộn lẫn filter dữ liệu (lớp/học kỳ/search), không phân vùng primary/secondary/user-menu | `HeaderBar.tsx:96-260` | HIGH |
| A7 | MED | Overflow 1024–1280px = raw `flex-wrap` → header nhảy hàng, alignment lộn xộn (brand block ~420px + controls ~850-900px vs content width = viewport − 260 sidebar − 48 padding) | `HeaderBar.tsx:67`; `RootLayout.tsx:202-216` | HIGH |
| A8 | MED | 3 cỡ icon-button khác nhau (`w-11 h-11 rounded-2xl` / `w-9 h-9 rounded-xl` / `p-1.5 rounded-xl`) + 2 hệ radius trong cùng 1 bar | `:174,:245,:255` vs `:217,:230,:194` | HIGH |
| A9 | MED | Duplicate/conflicting utilities: `px-3 ... px-3`, `px-2.5 ... px-3` trên cùng element | `:137,:145,:156` | HIGH |
| A10 | LOW | Gradient header hard-code hex, dark mode không đổi | `:61-64` (trùng POLISH D10) | HIGH |
| A11 | LOW | Search `w-28 sm:w-36` quá nhỏ với global search; nút reset-all-data giống hệt theme toggle (chỉ phân biệt bằng title); tooltip toàn native `title` | `:129,:250-258,:172-253` | HIGH |

### 1.3 Sidebar & routes

| # | Sev | Finding | Evidence | Confidence |
|---|---|---|---|---|
| A12 | **HIGH** | Orphan routes `/users`, `/classes`, `/academic-years`: router đăng ký + `routeToTab` map nhưng `menuItems` của sidebar không emit các id đó → deep-link vào route này **không item nào được highlight**, `ClassesPage` là wrapper desktop-only trống | `router.tsx:141-172`; `RootLayout.tsx:46-48`; `DesktopSidebar.tsx:44-60`; `ClassesPage.tsx:4-5` | HIGH |
| A13 | MED | Class selector xuất hiện ở **3 surface luôn hiển thị** cùng bind 1 store field (header select, sidebar branch+class, page toolbar) với option label lệch nhau ("Tất cả lớp học" vs "Tất cả Lớp học (n)") | `HeaderBar.tsx:104-117`; `DesktopSidebar.tsx:108-141`; `DesktopGradeMatrix.tsx:342-352` | HIGH |
| A14 | MED | `/leave-requests` map sang tab attendance (highlight "Điểm Danh Chuyên Cần" + badge pending) trong khi cùng content là sub-tab trong grid — 2 entry point 1 highlight target | `RootLayout.tsx:54`; `DesktopAttendanceGrid.tsx:173-174` | MED |
| A15 | LOW | `setActiveTab={(tab) => navigate(\`/${tab}\` as any)}` — tab id ↔ route path không có compile-time sync | `RootLayout.tsx:156,:206` | HIGH |
| A16 | LOW | Magic number `calc(100vh - 68px)` của `.sidebar-container` ngầm耦合 `--mobile-nav-height: 68px` | `index.css:1942-1951` vs `:1128` | HIGH |

### 1.4 Containers — không có contract desktop

| # | Sev | Finding | Evidence | Confidence |
|---|---|---|---|---|
| A17 | **HIGH** | Không tồn tại `DesktopAppShell`. Container mỗi nơi một kiểu: `max-w-7xl` (Catechist/Finance/AuditLog/AcademicYear/UserManagement), `max-w-3xl` (Settings), `max-w-5xl` (ParentDashboard), và **full-bleed** (Dashboard, Students, Grades) → màn 2560px trải dài hết cỡ trong khi admin pages cap 1280px | `RootLayout.tsx:201-256`; `DesktopDashboard.tsx:92`; `StudentsPage.tsx:77`; `GradesPage.tsx:35` vs `SettingsPage.tsx:98`… | HIGH |
| A18 | MED | Toàn stylesheet chỉ có **2 media query desktop-relevant, đều ở mốc 768** — không có refinement nào >768; wide-screen behavior hoàn toàn ad-hoc | `index.css:1371-1376,1910-1916` | HIGH |

### 1.5 Modal/dialog/tooltip trên desktop

| # | Sev | Finding | Evidence | Confidence |
|---|---|---|---|---|
| A19 | **HIGH** | Focus trap chỉ có ở 3/~20+ dialog (`ModalShell`, `ConfirmDialog`, `StudentModal`). Còn lại — Diagnostics, ConflictInbox, GradeFormula, Backup/Purge, Excel×2, PrintReport, ForcePasswordChange, LeaveRequest, NoticeModal, PhotoCard, Certificate, StudentReport, 11 exam modals, 6 AcademicYear overlays — Tab thoát ra nền đóng băng | `ModalShell.tsx:37`; grep `modal-overlay|fixed inset-0` toàn repo | HIGH |
| A20 | MED | Escape re-implement tay ~16 file; **stack-cascade**: ConfirmDialog mở trên SystemDiagnosticsModal → 1 phím Esc đóng cả hai (2 document-level listeners không arbitration) | `SystemDiagnosticsModal.tsx:86-93` + `ConfirmDialog.tsx:32-40` | HIGH |
| A21 | MED | Body scroll-lock chỉ ở ModalShell + SystemDiagnostics; backdrop-click policy 3 kiểu khác nhau; duplicate static id `'confirm-dialog-title'` khi mở 2 ConfirmDialog song song | `ModalShell.tsx:46-47`; `Certificate.tsx:50`; `ConfirmDialog.tsx:65` | HIGH |
| A22 | MED | Z-index ladder phân mảnh: modal `z-50` == sticky header `z-50` == InstallPrompt `z-50` (paint sau nên đè modal); nav mobile `z-1000`; toast `z-[9999]` — order-dependent painting đang làm việc thật | `index.css:357`; `HeaderBar.tsx:60`; `InstallPrompt.tsx:11`; `RootLayout.tsx:252` | HIGH |
| A23 | MED | Print styles ẩn `header/main/nav/aside` nhưng page-hosted dialogs (ExcelImportModal trong StudentsPage…) sẽ in trắng; report flow chính đi HTML window nên chưa nổ | `index.css:900-938`; `StudentsPage.tsx:128`; `pdfGenerator.ts:28-43` | MED |
| A24 | LOW | Dark-mode flash on reload: `.dark` apply qua React effect sau async store rehydrate, không có bootstrap script trong `index.html` | `useTheme.ts:8-10`; `themeStore.ts:33`; `index.html:3-17` | HIGH |

---

## 2. Screen-by-Screen Audit (desktop)

> Format: `[sev] finding — evidence — confidence`. Đã spot-check độc lập: S1, S3, S4, S5, S6, U1.

### Dashboard (`DesktopDashboard.tsx`, 352 LOC)
- [MED] Analytics nặng tính inline mỗi dependency change, loop toàn bộ attendance records trong `useMemo` — :35-87 — HIGH
- [MED] Ngày thông báo render raw ISO thay vì `vi-VN` — :326 (đối chiếu đúng chuẩn: `AuditLogPage.tsx:359-370`) — HIGH
- [LOW] Empty state tự chế thay `EmptyState`; student hiện classId thô khi lookup fail; **không có loading/skeleton cho bất kỳ widget nào** — :185-187,:205,:341-345 — HIGH

### Students list (`DesktopStudentList.tsx`, 512 LOC)
- [S4] **HIGH — PageSize select hỏng**: state mặc định 20 (:59) nhưng options chỉ có 50/100/200/all (:303-308) → `<select>` không match option nào, counter lại báo "Hiển thị 1-20" (:269). **Đã spot-check CONFIRMED**
- [MED] Prev/next pagination không aria-label; không SkeletonTable (so sánh DesktopClasses có); select-all chỉ chọn trang hiện tại nhưng vị trí header ngụ ý "all filtered" — :478-491,:419-444,:94-131 — HIGH
- [LOW] Không zebra striping, không sticky header ở pageSize lớn — :421-444 — HIGH

### Student form & detail modals
- [MED] `StudentModal` hand-rolled overlay dù có trap+Escape (duplicate shell logic); validation lỗi là span thường, không `aria-invalid`/`htmlFor`; prefill nguy hiểm cho HS mới ('Maria'/'Nữ'/'2016-01-01'/'Giáo xứ Gia Tôn') — `StudentModal.tsx:155,:246-271,:119-134` — HIGH
- [MED] `PhotoCard.tsx:38`, `Certificate.tsx:50`, `StudentReportModal.tsx:86`: hand-rolled overlay, **không trap, không Escape** — HIGH
- [LOW] Hard-code `#1E3A8A` phá dark token — `StudentModal.tsx:159,:232` — HIGH
- (+) Flow tạo tài khoản phụ huynh + temp password one-time copy tốt (:407-456)

### Classes (`DesktopClasses.tsx`, 416 LOC)
- [S3] **HIGH — Sort toggle là dead UI**: toolbar set `sortDirection` → `sortedClasses` (:30-32), empty check đọc `sortedClasses` (:260), nhưng rows render `classes.map(...)` (:273). **Đã spot-check CONFIRMED**
- [MED] Save im lặng khi validate fail (:95); label không `htmlFor`; Eye reveal icon phụ thuộc `group-hover` nhưng `<tr>` thiếu class `group` → icon không bao giờ hiện (:284 vs :274); teacher reconcile nuốt mọi error `.catch(() => {})` (:78-92) — HIGH

### Attendance — điểm danh ngày (`DesktopAttendanceGrid.tsx`, 372 LOC)
- [S1] **HIGH — Lưu điểm danh: false success + swallow failure**: `handleSave` không try/catch; `setIsSaved(true)` chạy trước khi kiểm tra result — throw = unhandled rejection, result falsy = hiện "Đã Lưu!" mà không toast. **Đã spot-check CONFIRMED** — :75-90
- [MED] Triad status toggle không có `aria-pressed`/radiogroup, trạng thái truyền bằng màu; keyboard-nav query input theo placeholder text (brittle); placeholder hứa shortcut "P/E/A…" nhưng **không tồn tại handler P/E/A nào** — :99-111,:346-356,:342 — MED/HIGH
- [LOW] Header table không sticky với lớp dài — :277-287 — HIGH

### Attendance analytics (`DesktopAttendanceSummary.tsx`, 801 LOC)
- [MED] Ma trận 19 cột không pagination/virtualization; filtered-empty là text thường thay `NoResultState` — :701-794,:694-699 — MED
- [MED] Split học kỳ hard-code ranh giới 31-12/01-01 kèm fallback '2025'/'2026' — sai âm thầm sau 2026 nếu đổi parsing — :69-86 — MED
- [LOW] Tooltip chart hover-only; sort pill click thứ 3 = bỏ sort (không obvious) — :407-411,:585-610 — HIGH/MED

### Leave requests (`DesktopLeaveRequests.tsx`, 453 LOC) — **screen tốt nhất repo**: Skeleton + EmptyState/NoResult + ModalShell review với banner hậu quả rõ. [LOW] date raw ISO (:252-254); reject icon-only không aria-label (:348-354).

### Grades — matrix (`DesktopGradeMatrix.tsx`, 482 LOC)
- [S8] **HIGH — Score cell uncontrolled `defaultValue`** (:262): server-sync merge vào `matrixData` (:131-148) nhưng DOM giữ giá trị cũ đến khi remount → **điểm hiển thị lệch store sau sync/import** — confidence MED (logic verified, cần runtime test)
- [MED] Sort wired (`getSortedRowModel` :323) nhưng header không có onClick → user không sort được; banner sync `bg-[var(--color-text-main)]` gần-black lệch design system (:393-415); `ConflictResolutionModal` render theo `conflictData` nhưng không chỗ nào setConflictData với data (dead code) (:60,:471-479); input điểm/comment không label accessible (:258-266) — HIGH
- [LOW] Import `semesterRestricted`/`openSemester` nhưng không dùng — hint lock chưa enforce ở đây — :22,:50 — HIGH

### Grades — daily entry (`DesktopDailyGradeEntry.tsx`, 387 LOC)
- [MED] Điểm invalid (>10/<0) **bị ignore im lặng** — :53-60 — HIGH
- [MED] Nút xóa điểm (chip Trash2 size 10) **không aria-label, KHÔNG confirm** — duy nhất destructive action không confirm — :298-305; override restore ghi grade ngay khi click không confirm — :257-274 — MED
- (+) Sticky cột đầu, stats bar avg/median/min/max, expand/collapse — tốt

### Grade cards/comparison
- [S9] **MED→HIGH impact — Casing mismatch**: `rankColors` key `'Xuất sắc'` (`DesktopGradeCards.tsx:28`) ≠ SSOT policy trả `'Xuất Sắc'` (`gradePolicy.tsx:195`) → **học sinh Xuất Sắc nhất lớp nhận badge xám fallback thay vì vàng** — HIGH
- [MED] Cards view render toàn lớp không virtualization — `DesktopGradeCards.tsx:43-49` — MED

### Exam/QR/OMR suite
- [S7-part] **HIGH — 11 modal hand-roll overlay, không trap** (AnswerSheet :398, ExamScan :737, ExamSession :683/:767, Paper/Import/Export/Analytics/BatchScan/Variants/GuidedGrade/ResultsTable) — bypass ModalShell mà Pha 3 audit 08-16 tuyên bố DONE cho Tier A/B — HIGH
- (+) Finalize/delete có askConfirm itemized warnings; two-phase QR→OMR guidance xuất sắc; results có source badges QR/OMR/manual + vi-VN timestamps
- [LOW] Session view tự làm header thay PageHeader; delete-result "Xóa" text-only không confirm — ExamResultsTable.tsx:81-83

### Finance (`FinancePage.tsx`, 652 LOC)
- [S6] **HIGH — Filter client-side áp lên 1 trang server-pagination**: `filteredTransactions` chỉ lọc trang hiện tại (:121-134) nhưng badge count hiện global `pagination.total` (:426) và footer paginate tổng chưa lọc (:137,:608-630) → user thấy số liệu sai/kết quả cụt. **Đã spot-check CONFIRMED**
- [MED] Delete confirm không try/catch — fail = dialog kẹt mở, không toast (:113-118); cột ngày raw ISO (:513); SVG chart tooltip mouse-only (:365-384); roving tabindex fund pills làm dở dang (thiếu Home/End) (:288-330) — HIGH/MED

### Notices (`DesktopNotices.tsx` 138 LOC + `NoticeModal.tsx`)
- [HIGH] NoticeModal bỏ ModalShell + không focus trap (chỉ window Escape listener) — NoticeModal.tsx:51-58,:122 — HIGH
- [MED] Thiếu aria-invalid/htmlFor như StudentModal; bảng desktop **không có chức năng Xóa** dù store/server hỗ trợ DELETE|notice (parity gap) — :138-167; `AuditLogPage.tsx:117` — MED
- [LOW] Content column truncate 1 dòng không cách xem đầy đủ ngoài edit modal; date raw; bell `#1E3A8A` hard-code — :94-96,:109,:126 — HIGH

### Reports (`DesktopReports.tsx`, 244 LOC)
- [S5] **HIGH — Quick-print student picker capped `students.slice(0, 9)` không search/pagination** → không thể in báo cáo cho học sinh thứ 10 trở đi. **Đã spot-check CONFIRMED** — :217
- [MED] `grid-cols-3` cố định không responsive suffix — cramped @1024-1280 — :216 — HIGH

### Settings (`SettingsPage.tsx`)
- [MED] Theme toggle button trần không `role="switch"`/`aria-checked`/label (:267-272); eye password không aria-label/pressed (:165-167); label-input không associate toàn file — HIGH
  → ✅ **CLOSED (UI-POLISH 2026-08-25)**: theme + view-mode buttons `aria-pressed`; eye `aria-label` + `aria-pressed`; 5/5 field qua `FormField` (htmlFor + aria-describedby) + autoComplete + hint mật khẩu.
- (+) Purge gated PurgeDataModal + reload; phone lock cho phuhuynh có giải thích; sectioned layout tốt

### UI-POLISH batch 2026-08-25 — Sidebar + Settings + Shell header (✅ DONE, user-report driven)

| # | Task | Files | Verification |
|---|---|---|---|
| P.1 | **Shell header full-width** (sửa hệ quả layout A6/A7 + user report "khoảng trống đầu sidebar"): HeaderBar + OfflineStatusBanner chuyển lên trên cùng span toàn viewport; sidebar + main start cùng mép dưới header; sidebar bỏ `sticky top:68px` + `height: calc(100vh - 68px)` → flex stretch | `RootLayout.tsx`, `index.css` | tsc 0 · oxlint 0 · HeaderBar test 8/8 · build pass |
| P.2 | **Sidebar polish**: nền card + border-right cả 2 mode; section-label nhịp 14/12/8; active inset-ring `color-mix` + focus-visible ring; scrollbar 4px hover-only; `.sidebar-footer` (Bộ lọc + Cài Đặt, 1 divider); filter compact 32px; `aria-current`; badge 18px | `DesktopSidebar.tsx`, `index.css` | lint:ds 0/135 · oxlint 0 |
| P.3 | **Settings wide 12-col + a11y** (đóng finding MED §2 ở trên): narrow→wide 7/5; FormField ×5; autoComplete ×5; aria-pressed theme/view-mode/eye; hint mật khẩu; Vùng Nguy Hiểm về cột phải; SectionTitle 32px tile | `SettingsPage.tsx` | tsc 0 · CommonComponents 12/12 · build pass |

> Ghi nhận thay đổi contract: DS §13 container tier — SettingsPage `narrow` → `wide` (kèm note);
> sidebar spec mới document tại DS §13 "Shell & Sidebar desktop". Không đổi API/auth/schema.

### Users/IAM (`src/components/desktop/UserManagementPage.tsx`, 1081 LOC)
- [U1] **HIGH — Force-logout & lock/unlock account KHÔNG có confirm dialog** — direct onClick→API (:659-663 handleForceLogout, :670-675 toggleUserStatus). **Đã spot-check CONFIRMED** (path đúng là `components/desktop/`, không phải `pages/`)
- [MED] Table **không empty state** — search 0 kết quả = tbody trống (:597-681); loading chỉ spinner cạnh search (:577); `lastLoginAt` raw (:643); create-user validation không mark invalid state (:265-306) — HIGH
- (+) Bulk parent provisioning preview→re-auth→itemized result là flow mẫu; 7 modals dùng ModalShell đúng

### Audit logs (`AuditLogPage.tsx`) — (vi-VN datetime ✓, action×entity mapping ✓, expandable diff ✓, aria-expanded ✓) [LOW] loader text thường (:542-549); pagination không aria-label; diff `<pre>` JSON full-size không truncate.

### Academic years (`AcademicYearPage.tsx`, 686 LOC)
- [S7-part] **HIGH — 6 hand-rolled overlay** (checklist/promote/copy/confirm/result/create :492-680) không trap/Escape/aria — HIGH
- [MED] Confirm buttons generic "Xác Nhận" không danger styling cho thao tác irreversible (finalize/promote) — :615-620 — MED
- (+) Wizard 5 bước, status machine badges, contextual gating tốt

### Calendar / Catechists / Management
- Calendar: (button day cells ✓, vi-VN long date ✓, localStorage try/catch ✓) [LOW] month pager title-only; Catechists: [MED] không empty state khi filter trượt (:111-134); Management: tabs thiếu role="tablist"/aria-selected (:37-56).

### Cross-screen systemic
- [S10] **SYSTEMIC — FormField (wrapper WCAG-conform duy nhất) có 0 consumer trong app code**; ToastContainer không `role="status"`/`aria-live`; icon buttons dùng `title` thay `aria-label` rải khắp — FormField usage grep; `ToastContainer.tsx:41-47` — HIGH

---

## 3. Đối chiếu Prior Audits (nợ cũ còn tồn đọng ảnh hưởng desktop)

Từ `UX_UI_AUDIT_AND_IMPROVEMENT_PLAN_2026-08-16.md` + evaluations — cross-check code hôm nay:

| Item cũ | Status | Evidence hiện tại |
|---|---|---|
| Pha 0–3 (lint rules, PageHeader/ModalShell/FormField components, bulk-delete, In Phiếu fix, PromotionPanel, ModalShell 16 modals Tier A, contrast, scope=col) | ✅ DONE | xác nhận bởi agent track 3 + DS §12 |
| Pha 4.5 text <11px (~45 file còn) | OPEN | vẫn phổ biến, gồm desktop files |
| Pha 5.1 ErrorState adoption (0 usages) | OPEN | chỉ test dùng |
| Pha 5.2 "Đang tải..." text loaders | PARTIAL | còn ở CatechistPage:109, AuditLogPage:543,684, AcademicYearPage:329, RootLayout.tsx:30… |
| Pha 5.3 EmptyState adoption | PARTIAL | thiếu: AcademicYear, AuditLog, ParentPage, DailyGradeEntry, GradeComparison, AttendanceSummary |
| Pha 5.5 StudentReportModal rewrite (91 inline style / 73 hex) | **OPEN — unchanged** | counts giống hệt 08-16 |
| Pha 6.1 pill-group 7 desktop files (0 matches trong desktop/) | OPEN | — |
| Pha 6.4 ConfirmDialog cho destructive (LeaveRequests, UserManagement) | PARTIAL→CONFIRMED GAP | = finding U1 |
| Pha 3.1 claim "Tier B direct a11y 15 modals DONE" | **MỤC THÂN TRẮC**: role="dialog" có thật nhưng **focus trap vẫn 0** ở các file đó | A19 |
| Screenshots root (*.png 2026-08-15) | STALE | chụp trước Pha 0-3, không dùng làm evidence nữa |
| axe-core CI (backlog) | OPEN | không thấy trong e2e/vitest |

**Kết luận quan trọng:** audit 08-16 tuyên bố Pha 3 modal-a11y "DONE" là **overstated** — role="dialog" được gán nhưng focus trap/Escape/scroll-lock không đi kèm. Việc này phải được sửa trong plan lần này và ghi chú vào DS §12.

---

## 4. Improvement Plan (phased, ưu tiên theo TNTTVN Priority Order §29)

> Nguyên tắc: mỗi phase độc lập deploy-able, có verification, có rollback R0-R1 (git revert). Không phase nào chạm schema/API/auth.

### PHA 0 — Functional defects & data-integrity UX (P0) 🔴 ✅ DONE (2026-08-22)
*Mục tiêu: mọi thao tác người dùng phản ánh đúng truth; mọi destructive action có confirm.*

| # | Task | File(s) | Effort | Verification | Status |
|---|---|---|---|---|---|
| 0.1 | Sửa `handleSave`: try/catch, `setIsSaved(true)` chỉ khi result OK & errorCount=0; nút Lưu có state `isSaving` disabled | `DesktopAttendanceGrid.tsx` | S | tsc ✓ · full vitest ✓ · smoke thủ công còn lại | ✅ |
| 0.2 | Render `sortedClasses` thay `classes` | `DesktopClasses.tsx:273` | XS | tsc ✓ · vitest ✓ | ✅ |
| 0.3 | Searchable quick-print picker (search tên/tên thánh, limit 12, NoResultState + counter, grid responsive `1/sm:2/lg:3`) | `DesktopReports.tsx` | M | tsc ✓ · vitest ✓ | ✅ |
| 0.4 | pageSize default 50 khớp option đầu tiên (+comment ràng buộc) | `DesktopStudentList.tsx:59` | XS | tsc ✓ · vitest ✓ | ✅ |
| 0.5 | `confirmForceLogout` + `confirmToggleUserStatus` qua `useConfirmDialog` (warning/danger/info variants), render `{confirmDialog}` | `components/desktop/UserManagementPage.tsx` | S | tsc ✓ · vitest ✓ | ✅ |
| 0.6 | **Server-side ledger filters**: store thêm `ledgerFilters{type,startDate,endDate}` + `setLedgerFilters/resetLedgerFilters`; `fetchTransactions` luôn gửi params (server đã hỗ trợ sẵn finances.ts:113 → KHÔNG đổi API contract); page reset về 1 khi đổi filter; text search giữ client-side với badge trung thực `"N / total khớp (trên trang hiện tại)"`; kèm fix delete-transaction error handling (try/catch + toast lỗi) | `stores/financeStore.ts`, `pages/FinancePage.tsx` | M | tsc ✓ · FinancePage.test ✓ · vitest ✓ | ✅ |
| 0.7 | Score cells keyed `${studentId}:${field}:${val}` → remount hiển thị giá trị mới sau server-sync/import (record dirty đang gõ không bị merge nên focus giữ nguyên) | `DesktopGradeMatrix.tsx:262` | S | tsc ✓ · DesktopGradeMatrix.test ✓ | ✅ |
| 0.8 | rankColors so sánh lowercase (`avg.label.trim().toLowerCase()`) — gradePolicy trả 'Xuất Sắc' giờ match badge-warning | `DesktopGradeCards.tsx` | XS | tsc ✓ · vitest ✓ | ✅ |
| 0.9 | Xóa điểm chip + Restore Auto qua ConfirmDialog (danger/warning) + aria-label; điểm invalid báo toast thay vì im lặng; **phát hiện thêm fix phụ**: `parseFloat(raw)` cũ parse '7,5' thành 7 — giờ normalize ',' trước parse | `DesktopDailyGradeEntry.tsx` | S | tsc ✓ · vitest ✓ | ✅ |
| 0.10 | `useEffectiveMode`: forced-mobile trên viewport ≥768px fallback desktop (đồng bộ CSS guard `.mobile-app-shell display:none @≥768`) — diệt màn trắng; resize listener chạy mọi mode | `hooks/useEffectiveMode.ts` | S | tsc ✓ · vitest ✓ · cần smoke thật trên 1280px | ✅ |

**Verification record Pha 0 (2026-08-22):**
- `npx tsc -b` exit 0.
- oxlint: 0 error trên toàn bộ 11 file sửa; các warning no-unused-vars còn lại đều pre-existing (không do batch này).
- Vitest targeted: FinancePage / DesktopGradeMatrix / DesktopAttendanceSummary / CommonComponents / HeaderBar / zustandStores — **32/32 pass**.
- Full suite: **222 test files, 1617 tests, 0 failed** (baseline trước đó có 5 file fail — các failure cũ đã được fix ở session khác).
- `npm run build:frontend` pass (PWA precache 160 entries).
- **Còn nợ verification:** smoke thủ công trên trình duyệt thật cho 0.1 (lưu offline→online), 0.7 (import Excel → cell cập nhật), 0.10 (toggle mobile @1280px). Playwright e2e chưa assert các fix này (thuộc Pha 6).

**ADR/source-of-truth:** 0.6 dùng query params type/startDate/endDate ĐÃ TỒN TẠI trên server (`server/src/routes/finances.ts:113`) → không phải API contract change, `FRONTEND_API_CONTRACT.md` không cần sửa (ghi nhận tại đây làm evidence).

### PHA 1 — Modal & interaction infrastructure (P1) 🟠 ✅ DONE (batch 2026-08-22, exam suite còn nợ)
*Mục tiêu: 1 đường ray duy nhất cho dialog behavior.*

**Đã thực hiện:**

| # | Task | Files | Status |
|---|---|---|---|
| 1.1 | `src/lib/modalStack.ts` (NEW): global stack registry — Escape chỉ đóng dialog top-most (sửa cascade bug A20) | `modalStack.ts`, `ModalShell.tsx`, `ConfirmDialog.tsx` | ✅ |
| 1.2 | ConfirmDialog: `useId()` thay static `'confirm-dialog-title'` (sửa A21 duplicate id) + prop mới `isBusy` (disable confirm + "Đang xử lý...") | `ConfirmDialog.tsx` | ✅ |
| 1.3 | Z-index ladder tokens `--z-{header:40, install-prompt:30, modal:50, mobile-nav:1000, toast:9999, skip-link:9999}` — sửa A22: InstallPrompt không còn đè modal mở; header (40) dưới modal (50) đúng thứ tự | `index.css`, `HeaderBar.tsx`, `InstallPrompt.tsx`, `ToastContainer.tsx` | ✅ |
| 1.4 | **AcademicYearPage: 6/6 overlay → chuẩn**: checklist/promote/copy/result/create → ModalShell; confirm → ConfirmDialog với `variant` danger (finalize/promote irreversible) / warning + `confirmText` theo hành động (sửa finding "Xác Nhận" generic MED) + `isBusy={busy}` | `AcademicYearPage.tsx` | ✅ |
| 1.5 | NoticeModal → ModalShell đầy đủ (trap + Escape + scroll-lock từ shell, bỏ effect tự viết) | `NoticeModal.tsx` | ✅ |
| 1.6 | Focus trap (`useFocusTrap`) + `role="dialog"` bổ sung cho 10 Tier B modals giữ shell custom: SystemDiagnostics, ConflictInbox, GradeFormulaConfig, ConflictResolution, ExcelImport, ExcelGradeImport, BackupRestore, PurgeData, ForcePasswordChange, ParentForgotPassword, PrintReportModal | 11 files | ✅ |

**Verification record PHA 1 (2026-08-22):**
- `npx tsc -b` exit 0 · oxlint sạch trên các file đổi.
- Vitest targeted (CommonComponents + ConfirmDialog + ForcePasswordChange + BackupRestore + ExcelGradeImport): **58/58 pass**.
- Full suite: **1615/1617 pass** — 2 fail là server timing tests (`auth-lockout`, `superadmin-self-service`) flaky khi chạy song song, **pass 14/14 khi chạy riêng**, không liên quan thay đổi frontend (không file server nào bị sửa).
- `npm run build:frontend` pass · `npm run lint:ds`: **0 violations / 134 components**.
- Smoke thủ công còn nợ: Esc trên Diagnostics→ConfirmDialog stack (chỉ đóng confirm), Tab-trap qua từng modal migrated.

**Còn nợ PHA 1 (chuyển sang session sau):**
- Exam suite: 11 modals hand-roll chưa migrate/trap (ExamScan, AnswerSheet, ExamSession×2, Paper, Import, Export, Analytics, BatchScan, Variants, GuidedGrade).
- Print trio (PhotoCard, Certificate, StudentReportModal) — cần cẩn thận layout A4 print, gộp với Pha 5.5 cũ.
- StudentModal consolidate vào ModalShell (đã có trap riêng nên ưu tiên thấp).

### PHA 1 — Nợ exam suite: ✅ DONE (2026-08-22, cùng ngày)

11/11 exam modals đã có focus trap (`useFocusTrap`) trên content container, giữ nguyên shell custom + camera/print flow:

| File | Modal | Trap trigger |
|---|---|---|
| `AnswerSheetModal.tsx` | Duyệt phiếu/in loạt | mount-time (`true`) |
| `ExamImportModal.tsx` | Import đề | `isOpen` |
| `ExamPaperModal.tsx` | Xuất đề in | `isOpen` |
| `ExamExportModal.tsx` | Export Word/Excel/HTML | `isOpen` |
| `ExamScanModal.tsx` | Quét QR/OMR | mount-time |
| `ExamBatchScanModal.tsx` | Quét hàng loạt | mount-time |
| `ExamAnalyticsPanel.tsx` | Phân tích điểm | mount-time |
| `ExamVariantsModal.tsx` | Cấu hình mã đề | mount-time |
| `GuidedGradeModal.tsx` | Chấm có hướng dẫn | mount-time |
| `ExamResultsTable.tsx` | Xem ảnh rà soát | `Boolean(snapshot)` |
| `ExamSessionView.tsx` | Answer-key + Create session | `showAnswerKeyModal` / `showCreate` |

**Verification:** tsc exit 0 · oxlint 0 error · exam tests 15/15 · **full suite 222 files / 1617 tests ALL PASS** · build pass.

**Còn lại của PHA 1 (ưu tiên thấp):** ~~print trio~~ → **DONE 2026-08-22 (xem Pha 3 batch)**; StudentModal consolidation (đã có trap riêng, defer vô thời hạn trừ khi refactor lớn).

### PHA 3 — Consistency sweeps: ✅ BATCH 1 DONE (2026-08-22)

| # | Task | Files | Status |
|---|---|---|---|
| 3.1 | **Print trio focus trap** (chốt PHA 1): PhotoCard/Certificate/StudentReportModal — hook trước early-return (rules-of-hooks), ref trên `.modal-content`, layout A4 print không đụng vào | 3 files | ✅ |
| 3.2 | **vi-VN dates**: `src/utils/formatDate.ts` (NEW) — `formatDateVi` + `formatDateTimeVi`, an toàn ISO/date/null/invalid. Áp 6 site: Dashboard notices, LeaveRequests date col, FinancePage ledger (desktop + mobile card), Notices date, UserManagement lastLoginAt (`formatDateTimeVi`) | 7 files | ✅ |
| 3.3 | **StateFeedback adoption**: Users table empty→NoResultState (+reset search); CatechistPage loader→SkeletonCardGrid + filter-miss→NoResultState; AuditLogPage "Đang tải..."→SkeletonTable + empty→EmptyState; DailyGradeEntry empty→EmptyState; GradeComparison empty→EmptyState; AttendanceSummary filtered-empty→NoResultState | 6 files | ✅ |
| 3.4 | **ToastContainer** `role="status" aria-live="polite"` (SR đọc được toast) | ToastContainer.tsx | ✅ |

**Còn mở của PHA 3:** ~~FormField adoption~~ → **DONE (xem PHA 5 batch)**; pill-group/.btn/.card sweeps DS §11 (mechanical, batch sau); icon-button aria-label sweep — **phần desktop chính đã xong**, còn file lẻ.

### PHA 5 — A11y polish: ✅ 5.1 DONE + PHA 3 hoàn tất phần chính (2026-08-22)

| # | Task | Files | Status |
|---|---|---|---|
| 5.1 | **Attendance keyboard/a11y**: triad trạng thái → `role="radiogroup"`/`role="radio"` + `aria-checked` + ArrowLeft/Right chọn & focus option kế; shortcut **P/E/A thật** trên note input theo đúng promise của placeholder (chỉ áp khi ô lý do TRỐNG — không lật trạng thái khi đang gõ) | `DesktopAttendanceGrid.tsx` | ✅ |
| 5.1b | Classes modal: sửa **silent-fail validation** (audit MED) — thiếu trường bắt buộc giờ hiện alert trong modal thay vì return im lặng; toàn bộ 7 field chuyển `FormField` (htmlFor + association) | `DesktopClasses.tsx` | ✅ |
| 5.1c | NoticeModal: 5 field chuyển `FormField` (aria-invalid/describedby tự động, hint chuẩn DS) | `NoticeModal.tsx` | ✅ |
| 5.1d | aria-label sweep: Classes Sửa/Xóa (kèm tên lớp), AuditLog pagination Trang trước/sau, Calendar tháng trước/sau, DailyGradeEntry nút thêm điểm (kèm tên HS + loại điểm) | 4 files | ✅ |

**Verification record (double-check theo yêu cầu owner):**
- `tsc -b` exit 0 · oxlint 0 error / 6 file.
- Re-grep: radiogroup :363 / radio :128 / focus-nav :120 / P-E-A shortcut ✓; FormField ×11 (NoticeModal) + ×15 (Classes); formError ×3; aria-label mới đủ 4 site.
- Full vitest: **222 files / 1618 tests ALL PASS** · build pass · lint:ds 0/134.
- Lưu ý quy trình: một lệnh đếm rg bị PowerShell quoting làm kết quả sai (0 matches cho pattern có dấu `"`), đã verify lại bằng Select-String — bài học: double-check bằng ≥1 phương pháp khác nhau.

**Còn mở Pha 5:** ~~ErrorState unify~~ → **DONE (xem dưới)**; custom tooltip primitive thay native `title`; dark-mode gradient header (DS §12 đánh dấu *deliberate keep* — cần quyết định product); StudentReportModal rewrite 91 inline/73 hex (Pha 5.5 cũ, lớn).
**Còn mở Pha 6:** axe-core CI (cần thêm dependency — qua decision riêng), visual regression baselines, Playwright viewport matrix {1024,1280,1440,1920,2560}.

### PHA 5.6 — ErrorState/alert unify: ✅ DONE (2026-08-22)

| # | Task | Files |
|---|---|---|
| 5.6a | `.alert-error` utility mới trong `index.css` — alert lỗi nội tuyến dùng danger tokens (tự dark mode), thay banner rose-*/red-* hardcode | `index.css` |
| 5.6b | UserManagementPage error banner + AcademicYearPage error banner → `.alert-error` | 2 files |
| 5.6c | GradesPage sync banner near-black `bg-[var(--color-text-main)]` → card chuẩn DS (`bg-surface-card border-surface-border shadow-card`) | `DesktopGradeMatrix.tsx` |

**DOUBLE-CHECK record + PHÁT HIỆN QUAN TRỌNG:**
1. tsc lần 1: **exit 2** với lỗi type ở `src/__tests__/pages/AuditLogPage.test.tsx` (missing `totalPages`/`success`) — điều tra git xác nhận file này + `src/lib/api.ts` là **thay đổi của một session song song khác** đang chạy trên cùng working tree (không phải của audit này). Giữa 2 lần chạy tsc, session đó đã tự sửa xong test → tsc lần 2 **exit 0**.
2. ⚠️ **Khuyến nghị operation**: không nên chạy 2 agent đụng chéo cùng working tree; nếu có, cần phân vùng file hoặc rebase thường xuyên.
3. Verification phần của audit này: oxlint 0 error · targeted tests (DesktopGradeMatrix + AuditLogPage) 6/6 · re-grep `alert-error` ×3 đúng chỗ · GradesPage banner card chuẩn ✓.
4. Full vitest: **222 files / 1618 tests ALL PASS** · build pass · lint:ds 0/134.

**DOUBLE-CHECK record (2026-08-22, theo yêu cầu owner):**
1. `tsc -b`: bắt 1 lỗi cú pháp do edit (`)}` thừa sau map trong UserManagementPage) → sửa → exit 0.
2. oxlint: 0 error / 14 file đổi.
3. Re-grep verify: 0 raw `{notice.date}`/`{req.date}`/`{tx.transactionDate}` còn lại; `formatDateVi` ở 4 file + `formatDateTimeVi` ở UserManagement; `trapRef` ×2 (import+usage) đủ 3 print trio; StateFeedback components hiện diện đủ 6 target; toast có `role="status"`.
4. Full vitest: **222 files / 1618 tests ALL PASS**.
5. `build:frontend` pass · `lint:ds` 0 violations / 134 components.

### PHA 2 — DesktopAppShell + navigation contract (P1) 🟠 ✅ DONE (2026-08-22)

| # | Task | Files | Status |
|---|---|---|---|
| 2.1 | **Bootstrap sync** (A3+A24): `src/lib/uiBoot.ts` (NEW) — localStorage mirror cho viewMode/theme; filterStore/themeStore khởi tạo đồng bộ từ mirror + ghi mirror khi đổi & sau rehydrate; inline script trong `index.html` thêm `.dark` trước CSS paint → diệt light-flash và wrong-shell first paint | `uiBoot.ts`, `filterStore.ts`, `themeStore.ts`, `index.html` | ✅ |
| 2.2 | **Header redesign** (A6–A9): tách zone rõ ràng — Brand │ data filters (class+search+semester) │ divider │ app utilities (view-mode/theme/diagnostics/reset) │ user badge (cùng phải); standalone icon buttons thống nhất `h-10 w-10 rounded-xl`; segment buttons `h-9 rounded-lg`; nút Reset có rose hover tint (destructive hint); search input grow `lg:w-44`; bỏ toàn bộ duplicate `px-*`; wrap gap chặt `gap-y-2` | `HeaderBar.tsx` | ✅ |
| 2.3 | **Orphan routes** (A12): `/users`, `/classes`, `/academic-years` giờ highlight tab "Quản Lý Hệ Thống" (chúng là deep-link của các tab management, không thêm menu item để tránh overload A6) | `RootLayout.tsx` | ✅ |
| 2.4 | **Type-safe tab map** (A15): `DESKTOP_TAB_PATHS` SSOT (`satisfies Record<DesktopTab, \`/${string}\`>`) — setActiveTab dùng path map, không còn `as any`; routeToTab typed `Record<string, DesktopTab>` | `RootLayout.tsx` | ✅ |
| 2.5 | **Magic 68px** (A16): token `--app-bar-height: 68px` — mobile nav height + sidebar min-height cùng tham chiếu | `index.css` | ✅ |
| 2.6 | **DesktopAppShell** (NEW component, A17): width tiers `full/wide/narrow`; migrate 7 page phân tán — wide: Catechist, AcademicYear, Finance, AuditLog, UserManagement, ParentDashboard (5xl→7xl chuẩn hóa); narrow: Settings. Data workspaces (Dashboard/Students/Grades) giữ full-bleed theo contract | `DesktopAppShell.tsx` (NEW) + 7 pages | ✅ |

**Verification record PHA 2 (2026-08-22):**
- `npx tsc -b` exit 0 · oxlint sạch trên file mới (uiBoot/DesktopAppShell), warnings còn lại pre-existing.
- Full vitest: **222 files / 1617 tests / ALL PASS** (kể cả 2 server tests flaky lần trước).
- `build:frontend` pass · `lint:ds`: 0 violations / 134 components.
- HeaderBar.test 8 assertions giữ nguyên hành vi (title/search/HK I-II/logout/login/class-switcher visibility).
- Smoke còn nợ: reload với dark mode (không flash), resize ngang 767↔769 (shell flip), deep-link /classes (highlight Quản Lý Hệ Thống).

**Ghi chú thiết kế:** forced-desktop-on-phone (<768px) chưa có floor — thuộc Pha 3 (responsive 768–1280). DS §13 Desktop Layout section sẽ được bổ sung khi hoàn tất Pha 3 để document đầy đủ tiers + breakpoints.

### PHA 3 — Consistency sweeps (P2) 🟡
Áp dụng pattern đã chứng tỏ hiệu quả (DS §12 batches):

1. **vi-VN dates toàn desktop**: helper `formatDateVi()` áp vào Dashboard:326, LeaveRequests:252, FinancePage:513, UserManagement lastLoginAt:643, Notices:109 (+AuditLog làm chuẩn).
2. **StateFeedback adoption**: EmptyState/SkeletonTable/SkeletonCardGrid cho: Users table, CatechistPage, AcademicYearPage, AuditLogPage, DailyGradeEntry, GradeComparison, AttendanceSummary, DesktopDashboard widgets.
3. **FormField adoption** cho StudentModal, NoticeModal, Classes modal, UserManagement create-form (+aria-invalid/htmlFor).
4. **pill-group/.btn/.card sweeps** theo DS §11 cho 7 desktop files (Pha 6.1-6.3 cũ) + xoá conflicting `px-*` utilities (A9).
5. Icon-button aria-label sweep (title→aria-label giữ nguyên title).
6. ToastContainer: thêm `role="status" aria-live="polite"`.

Verification: `design-system-lint.mjs` mở rộng rule (text<11px trong desktop/, px-conflict); vitest snapshot các screen đã sweep.

### PHA 4 — Responsive 768–1280 & wide-screen (P2) 🟡 ✅ BATCH 1 DONE (2026-08-22)

| # | Task | Files | Status |
|---|---|---|---|
| 4.1 | `useMediaQuery` hook (NEW, jsdom-safe) + chặn force-desktop trên màn <768px: nút Monitor disabled + tooltip giải thích (A5 — trước đây chỉ còn ~65px nội dung ở 375px) | `useMediaQuery.ts` (NEW), `HeaderBar.tsx` | ✅ |
| 4.2 | GradesPage tab strip `flex-wrap` (trước đây no-wrap tràn ngang @1024px — MED finding) | `GradesPage.tsx` | ✅ |
| 4.3 | Fixed-width controls → responsive: StudentList search `w-56`→`w-full max-w-[224px]`; AttendanceSummary select min-w chỉ từ `sm:`; Calendar month label min-w từ `sm:` + truncate; LeaveRequests search thêm `max-w-full` | 4 files | ✅ |
| 4.4 | AcademicYearPage "Đang tải..." text → SkeletonCardGrid (nợ Pha 3 batch 1) | `AcademicYearPage.tsx` | ✅ |
| 4.5 | DS §13 Desktop Layout Contract documented (breakpoints/tiers/quy tắc) | `03_DESIGN_SYSTEM.md` | ✅ |

**Deferred có lý do (kỹ thuật):** sticky thead cho bảng dài — wrapper `overflow-x-auto` quanh bảng tạo scroll container riêng khiến `position:sticky; top:0` KHÔNG track được scroll dọc của `<main>` (CSS spec: overflow-x:auto ép overflow-y thành auto). Cần quyết định UX "bounded pane" (wrapper max-h + overflow-auto) trước khi làm — đề xuất gộp với virtualization Summary/GradeCards ở batch sau.
**Virtualization** (tanstack-virtual): cần thêm dependency mới — theo quy trình phải qua decision riêng.

**DOUBLE-CHECK record (2026-08-22):**
1. Full suite lần 1: **8 test HeaderBar FAIL** — nguyên nhân `window.matchMedia` không tồn tại trong jsdom, useMediaQuery throw khi render → **double-check bắt được regression**, sửa hook defensive (`typeof window.matchMedia !== 'function'` guard) → pass lại 8/8.
2. Re-run full suite: **222 files / 1618 tests ALL PASS**.
3. tsc exit 0 · oxlint 0 error / 8 file · re-grep đủ (flex-wrap/useMediaQuery/max-w fixes/SkeletonCardGrid).
4. `build:frontend` pass · `lint:ds` 0 violations.

### PHA 5 — Accessibility & polish (P3) 🟢
1. Keyboard nav attendance triads (radiogroup + arrow keys) + implement thật P/E/A shortcuts mà placeholder hứa (hoặc bỏ promise).
2. Custom Tooltip primitive thay native `title` (delay/touch/a11y) — reuse pattern FinanceChart tooltip.
3. Dark-mode: gradient header → tokens; hardcoded `#1E3A8A` sites → `var(--color-parish-primary)`.
4. Print: move page-hosted modals ra portal ngoài main hoặc print-only classes.
5. StudentReportModal rewrite (Pha 5.5 cũ — 91 inline/73 hex) giữ nguyên output A4.
6. ErrorState/ErrorBanner unify (Pha 5.1 cũ).

### PHA 6 — Verification infrastructure (chạy song song từ P0) 🔧
1. Re-capture screenshots desktop (cũ stale 08-15) sau mỗi phase.
2. axe-core vào Playwright CI (backlog cũ) cho 5 routes chính @1280.
3. Visual regression `toHaveScreenshot` baseline cho Dashboard/Students/Grades/Finance/Notices @1440.
4. Breakpoint-boundary e2e: 767↔768 crossing giữ state (kiểm chứng A2 fix nếu làm).

---

## 5. Estimation & sequencing tổng

| Phase | Effort | Rủi ro chính | Rollback |
|---|---|---|---|
| P0 | ~3-4 ngày dev | 0.6 finance filter quyết định server-side chạm API params → cần confirm contract | R0 git revert từng task |
| P1 | ~4-5 ngày | Modal migration chạm 20+ file → regression risk cao, cần e2e suite xanh trước merge | R0 theo batch domain |
| P2 | ~3-4 ngày | Shell refactor chạm RootLayout (file nóng) | R0 |
| P3 | ~2-3 ngày | Sweep rộng, mechanical | R0 |
| P4 | ~3 ngày | Virtualization thay đổi DOM → visual tests | R0 |
| P5 | ~3-4 ngày | Print/A4 sensitive | R0 |

**Thứ tự khuyến nghị:** P0 → P1(modal infra trước, migration theo batch) → P2 → P6(cài đặt sớm) → P3/P4/P5 theo nguồn lực.

## 6. Gates & compliance

- **ADR check:** PASS/CONDITIONAL — kế hoạch phù hợp hướng ADR-030 (DS SSOT) + ADR-055 (shared primitives); ModalShell migration hoàn tất điều mà Pha 3.1 cũ tuyên bố sai; **không CONFLICT phát hiện**. Nếu P0.6 chọn server-side filtering → cập nhật `FRONTEND_API_CONTRACT.md` trước khi làm.
- **Source-of-truth updates bắt buộc khi implement:** `03_DESIGN_SYSTEM.md` (thêm §13 Desktop Layout, cập nhật §12), `AI_CONTEXT_MAP.md` (entry changelog), `ADR_ARCHITECTURE_DECISION_RECORDS.md` (ADR mới nếu P0.6 đổi API contract), `SECURITY_AUDIT_LOG.md` (confirm gates cho account actions).
- **Business-rule items CONDITIONAL** (cần owner xác nhận intent): A13 (class selector 3 nơi — có chủ đích convenience?), A14 (/leave-requests highlight attendance), Pha 2.3 orphan-route strategy (redirect vs promote).

## 7. Verification record của chính audit này

- 3 investigation tracks song song, mọi finding có file:line.
- Spot-check độc lập bởi lead auditor: findings S1, S3, S4, S5, S6, U1, A1-mechanism — **6/6 CONFIRMED** (1 path correction: UserManagementPage nằm ở `src/components/desktop/`, không phải `src/pages/`).
- Hạn chế: chưa runtime-test Ctrl+P path (A23), chưa repro runtime A2/A3 timing, chưa xem screenshots stale (loại khỏi evidence).
