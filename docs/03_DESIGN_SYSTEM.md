# 🎨 Design System — Brave Davinci (TNTT Parish Management PWA)

**Phiên bản:** 3.1 (Operational Product UI System — Updated 2026-08-14)
**Trạng thái:** ✅ **SSOT DUY NHẤT** — quyết định ADR-030
**Nguồn vận hành (code truth):** `src/index.css` — mọi class/token được khai báo tại đây, tài liệu này là tài liệu hóa của nó.

> **Nguyên tắc bất biến:** Mọi thành phần UI MỚI phải dùng token/class trong tài liệu này. Không dùng hex màu cứng, không dùng class không tồn tại, không dùng màu ngoài bảng palette. Migration các module cũ theo bảng §10.

---

## 1. Triết Lý Thiết Kế

1. **Token-First & Dark-Mode-First:** Mọi màu sắc qua CSS variables (`var(--color-*)`) — tự động thích nghi light/dark. Cấm hex cứng trong JSX (`style={{...}}`) và arbitrary values (`bg-[#...]`).
2. **Brand nhất quán:** Màu chủ đạo duy nhất `parish-primary #1E3A8A` (Xanh Đại Hội). `blue-600 #2563EB` KHÔNG phải màu brand — nó là màu khăn chi đoàn **Thiếu Nhi** (dữ liệu nghiệp vụ, xem §2.4).
3. **Accessibility (WCAG AA):** Chữ thường ≥ 4.5:1 trên nền. `text-text-muted #64748B` (4.76:1) là màu chữ phụ tối đa — cấm `text-slate-400 #94A3B8` (2.56:1 FAIL) làm chữ.
4. **Mobile-First, Data-Dense:** Trải nghiệm desktop + mobile PWA đồng bộ qua primitives `mobile-*`; bảng dữ liệu thoáng, rõ, không cắt chữ.
5. **Glassmorphism có kiểm soát:** Chỉ dùng cho header/hero/bottom-nav (có backdrop nền màu phù hợp), KHÔNG dùng cho card nội dung/bảng (cần nền đục để đọc).

---

## 2. Bảng Màu Hệ Thống (Tokens — `src/index.css:10-76`)

### 2.1 Brand & Semantic

| Token | Giá trị (Light) | Giá trị (Dark) | Mục đích |
| --- | --- | --- | --- |
| `parish-primary` | `#1E3A8A` | `#60A5FA` | Nút CTA chính, tab active, link, tiêu điểm |
| `parish-primary-hover` | `#1E40AF` | `#3B82F6` | Hover nút chính |
| `parish-primary-light` | `#EFF6FF` | `#1E3A5F` | Nền icon tile, badge-primary |
| `parish-secondary` | `#D97706` | `#FBBF24` | Accent phụ |
| `parish-success` | `#16A34A` | `#4ADE80` | Trạng thái hoàn thành |
| `parish-warning` | `#EA580C` | `#FB923C` | Cần lưu ý |
| `parish-danger` | `#DC2626` | `#F87171` | Xóa, khẩn cấp |
| `parish-info` | `#0284C7` | `#38BDF8` | Thông tin |
| `parish-success-bg` | `#DCFCE7` | `#14532D` | Nền badge success |
| `parish-warning-bg` | `#FFEDD5` | `#431407` | Nền badge warning |
| `parish-danger-bg` | `#FEE2E2` | `#450A0A` | Nền badge danger |
| `parish-info-bg` | `#E0F2FE` | `#0C4A6E` | Nền badge info |

### 2.2 Surface & Text

| Token | Light | Dark | Mục đích |
| --- | --- | --- | --- |
| `surface-card` | `#FFFFFF` | `#1E293B` | Card, modal content, input nền |
| `surface-hover` | `#F1F5F9` | `#334155` | Hover, nền secondary |
| `surface-border` | `#E2E8F0` | `#475569` | Viền card, viền bảng |
| `surface-app` | `#F8FAFC` | `#0F172A` | Nền app, thead |
| `text-main` | `#0F172A` | `#F1F5F9` | Tiêu đề, nội dung chính |
| `text-muted` | `#64748B` | `#94A3B8` | Chữ phụ, chú thích (WCAG AA) |
| `text-secondary` | `#475569` | `#94A3B8` | Chữ cấp 2 |
| `text-inverse` | `#FFFFFF` | `#0F172A` | Chữ trên nền màu |
| `border-input` | `#CBD5E1` | `#475569` | Viền input |
| `text-placeholder` | `#94A3B8` | `#64748B` | Placeholder (chỉ placeholder) |

### 2.3 Interaction States & Feedback

| Token | Light | Dark | Mục đích |
| --- | --- | --- | --- |
| `focus-ring` | `rgba(30, 58, 138, 0.35)` | `rgba(96, 165, 250, 0.45)` | Viền focus-visible WCAG AA |
| `surface-selected` | `#EFF6FF` | `#1E3A5F` | Nền hàng/mục được chọn |
| `surface-selected-border` | `#93C5FD` | `#3B82F6` | Viền mục được chọn |
| `surface-disabled` | `#F1F5F9` | `#1E293B` | Nền control bị vô hiệu |
| `text-disabled` | `#94A3B8` | `#64748B` | Chữ control bị vô hiệu |
| `border-disabled` | `#E2E8F0` | `#334155` | Viền control bị vô hiệu |
| `surface-overlay` | `rgba(15, 23, 42, 0.5)` | `rgba(0, 0, 0, 0.75)` | Lớp phủ modal/drawer |

### 2.4 Domain Cell States (Ma Trận Điểm / Điểm Danh / Offline Sync)

| Token / Class | Trạng thái | Visual Feedback |
| --- | --- | --- |
| `cell-state-clean` | Dữ liệu gốc (Clean) | Nền trong suốt |
| `cell-state-edited` | Đang sửa đổi (Dirty) | Nền vàng nhạt, viền hổ phách |
| `cell-state-saving` | Đang lưu cục bộ | Nền xanh dương nhạt, hiệu ứng pulse |
| `cell-state-saved` | Đã lưu cục bộ | Nền xanh lá nhạt, transition mượt |
| `cell-state-conflict` | Xung đột phiên bản | Nền đỏ nhạt, viền đỏ cảnh báo |
| `cell-state-locked` | Khóa sổ / Chỉ đọc | Nền xám, icon khóa, cursor not-allowed |

### 2.3 Radius & Shadow

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `radius-sm` | 8px | Button nhỏ, badge |
| `radius-md` | 12px | Button, input |
| `radius-lg` | 16px | Card, modal content |
| `radius-xl` | 20px | — |
| `shadow-card` | nhẹ | Card |
| `shadow-modal` | lớn | Modal |
| `shadow-toast` | nổi | Toast |

### 2.4 Màu Chi Đoàn (Nghiệp Vụ — KHÔNG ĐƯỢC ĐỔI)

Nguồn: `src/constants/branches.ts` + `--color-branch-*` (`index.css:39-43`). Đây là màu khăn quàng — **ngữ nghĩa nghiệp vụ, cấm dùng làm màu CTA/brand.**

| Chi đoàn | Màu |
| --- | --- |
| Chiên Con | `#EC4899` (hồng) |
| Ấu Nhi | `#16A34A` (xanh lá) |
| Thiếu Nhi | `#2563EB` (xanh dương) — **lưu ý: ≠ parish-primary** |
| Nghĩa Sĩ | `#EAB308` (vàng) |
| Hiệp Sĩ | `#854D0E` (nâu) |

---

## 3. Component Classes (Dùng Trực Tiếp — Không Tự Dựng Lại)

Định nghĩa đầy đủ tại `src/index.css` — **chỉ dùng các class này, không viết lại pattern thủ công.**

### 3.1 Buttons
- `btn` (base) + `btn-primary` / `btn-secondary` / `btn-danger` / `btn-ghost`
- `btn-sm` (32px) / `btn-lg` (44px)
- `pill-btn` / `pill-btn-primary` / `pill-btn-secondary` / `pill-btn-active` + `pill-group` (segmented control)

### 3.2 Form
- `form-group`, `form-label`, `form-input`, `form-select`, `form-textarea`, `form-input-sm` (pill search)
- Error state: `aria-invalid="true"` + `form-error`

### 3.3 Badge
- `badge` + `badge-primary/success/warning/danger/info/neutral`

### 3.4 Card / Table / Modal / Icon
- `card`, `card-interactive`, `table-wrapper`, `table-scroll`, `icon-container`, `icon-container-lg`
- `modal-overlay` + `modal-content` (+ `modal-report` 750px, `modal-full`)

---

## 4. Typography Roles System (DS v3.1)

| Typography Role Class | Cỡ / Line-height | Weight / Format | Mục đích sử dụng |
| --- | --- | --- | --- |
| `.typography-display` | 30px / 36px | Bold (700) | Hero banner, số liệu tổng kết lớn |
| `.typography-page-title` | 24px / 32px | Bold (700) | Tiêu đề trang chính |
| `.typography-section-title` | 18px / 28px | Semibold (600) | Tiêu đề phân đoạn, tiêu đề nhóm |
| `.typography-card-title` | 16px / 24px | Semibold (600) | Tiêu đề thẻ, tiêu đề modal |
| `.typography-body` | 14px / 22px | Regular (400) | Văn bản nội dung chuẩn |
| `.typography-body-sm` | 12px / 18px | Regular (400) | Văn bản phụ, chú thích nhỏ |
| `.typography-caption` | 11px / 16px | Medium (500) CAPS | Nhãn phân loại, badge caption |
| `.typography-label` | 12px / 18px | Semibold (600) | Nhãn form input, header nhỏ |
| `.typography-metadata` | 12px / 18px | Regular (400) | Ngày giờ, người tạo, phiên bản |
| `.typography-numeric` | 14px | Mono, Tabular-nums | Mã số, tỷ lệ phần trăm |
| `.typography-numeric-emphasis` | 18px | Mono Bold, Brand color | Điểm trung bình GPA, tổng số lượng |
| `.typography-grade-value` | 14px | Mono Bold, Tabular-nums | Điểm số trong ô ma trận (0.0 - 10.0) |
| `.typography-status-label` | 12px | Semibold CAPS | Nhãn trạng thái (Active, Locked, ...) |

## 4. Typography Hierarchy (Chuẩn Hóa — `docs/03` thay bảng cũ)

| Thành phần | Cỡ | Weight | Màu |
| --- | --- | --- | --- |
| **Tiêu đề trang** | `text-lg md:text-xl` | `font-extrabold` | `text-text-main` |
| **Tiêu đề card/modal** | `text-base` | `font-bold` | `text-text-main` |
| **Tên học viên (nội dung chính)** | `text-base` | `font-extrabold` | `text-text-main` |
| **Mã thiếu nhi / tên thánh** | `text-sm` | `font-bold` | `text-parish-primary` / `text-text-muted` |
| **Tiêu đề cột bảng** | `text-xs` | `font-bold uppercase tracking-wider` | `text-text-muted` |
| **Chữ phụ / chú thích** | `text-xs` | `font-medium` | `text-text-muted` |
| Icon tile trang | `w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary` | | |

Cấm: `text-slate-*`, `text-gray-*`, `text-[10px]/[11px]` tùy tiện (dùng `text-xs`/`text-[10px]` chỉ khi thật cần và đồng nhất).

---

## 5. Page Pattern (Khung Trang Tiêu Chuẩn)

```tsx
<div className="flex flex-col gap-6 max-w-7xl mx-auto p-6">
  {/* Header */}
  <div className="card flex justify-between items-center flex-wrap gap-4">
    <div>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center">
          <Icon size={20} />
        </div>
        <h1 className="text-lg font-extrabold text-text-main m-0">Tiêu Đề Trang</h1>
      </div>
      <p className="text-xs font-medium text-text-muted mt-1 m-0">Mô tả chức năng</p>
    </div>
    <div className="flex items-center gap-3">
      <button className="btn btn-primary">Hành Động Chính</button>
    </div>
  </div>

  {/* Nội dung */}
  <div className="card">{/* content */}</div>
</div>
```

---

## 6. Tables & Grids (Chuẩn thead THỐNG NHẤT)

1. **Container:** `.table-wrapper` > `.table-scroll` (hoặc card + `overflow-x-auto`).
2. **thead (DUY NHẤT 1 kiểu):** `bg-surface-app text-text-muted text-xs font-bold uppercase tracking-wider border-b-2 border-surface-border` — `py-2.5 px-3`.
3. **Row:** `border-b border-surface-hover hover:bg-surface-app transition-colors`, cell `px-4 py-3`.
4. **colgroup (chống cắt chữ):** Họ và Tên `w-[240px]`→`w-[260px]`, STT `w-[60px]`, Tên Thánh `w-[120px]`, Mã `w-[100px]`.
5. **Số liệu quan trọng:** `font-semibold text-parish-primary`.

Cấm: thead `bg-slate-800 text-white`, `bg-slate-50/*`, `bg-parish-primary text-white` (trừ bảng báo cáo in ấn).

---

## 7. Dark Mode

- Toggle: `themeStore` → `.dark` trên `<html>` (`@custom-variant dark`).
- **Quy tắc:** mọi component dùng token sẽ tự thích nghi. **Cấm hardcode** `bg-white`, `text-slate-*`, `bg-white/90`, inline hex màu light-only. Khi cần override dùng `dark:` variants với token dark (`index.css:641-736`).

---

## 8. Mobile (PWA/Native)

- Shell: `.mobile-app-shell` → `.mobile-app-main` → `.mobile-screen` (+ `--stack`/`--wide`).
- Top bar: `.mobile-top-bar` (gradient brand cố định `#17347f→#2454bf`, ≤767px `#1d3f99→#2c58c7` — giữ nguyên, không phải token).
- Bottom nav: `.mobile-bottom-nav` (token-based, tự dark-adapt); action: `.mobile-floating-action`, `.mobile-bottom-action-bar`.
- Touch target tối thiểu: **44×44px** (`.mobile-touch-target`). Cấm button < 40px trên mobile.
- **Cấm** `space-y-*` chồng lên `.mobile-screen--stack` (gap 14px đã có) — tránh double-spacing.
- Không lạm dụng `backdrop-blur` cho nội dung cuộn (tốn GPU trên máy yếu).

---

## 9. Bảng Mapping Legacy → Token (Migration Checklist)

Khi migrate module cũ, dùng bảng này — **không đổi layout, chỉ đổi màu/class:**

| Legacy (CẤM từ nay) | Thay bằng |
| --- | --- |
| `bg-blue-600` / `bg-blue-700` + text-white (CTA, tab active) | `bg-parish-primary` / `hover:bg-parish-primary-hover` |
| `text-blue-600` / `bg-blue-500/10 text-blue-600` (icon tile) | `bg-parish-primary-light text-parish-primary` |
| `bg-white/90` / `bg-white/80` + `border-white/40` (card nội dung) | `card` hoặc `bg-surface-card border border-surface-border rounded-2xl shadow-card` |
| `bg-slate-100/80` + `shadow-inner` (input) | `form-input` / `form-select` |
| `border-slate-200` / `border-slate-100` | `border-surface-border` |
| `text-slate-800` / `text-slate-900` | `text-text-main` |
| `text-slate-500` / `text-slate-600` | `text-text-secondary` |
| `text-slate-400` (chữ) | `text-text-muted` |
| `text-slate-400` (placeholder) | `placeholder:text-text-placeholder` |
| thead `bg-slate-800 text-white` / `bg-slate-50/*` / `bg-parish-primary text-white` | thead chuẩn §6 |
| `bg-white` (card/modal content) | `bg-surface-card` (+ `dark:` nếu cần) |
| `px-4 py-2` button tự dựng | `.btn` / `.btn-primary`... |
| `rounded-lg` button/input | `rounded-xl` (radius-md) |
| Class không tồn tại (`input`, `bg-surface-main`, `custom-scrollbar`...) | class chuẩn tương ứng (xem §10) |

### 10. Class Không Tồn Tại (Fixes Đã Đóng)

| Class lỗi | Đã thay bằng | File |
| --- | --- | --- |
| `input` (không có rule) | `form-input` | `DesktopClasses.tsx` (ADR-030) |
| `bg-surface-main` (undefined token) | `bg-surface-app` | `RootLayout.tsx`, `ConflictInboxModal.tsx` (ADR-030) |
| `badge-secondary` (không tồn tại) | `badge-neutral` | `ExamSessionView.tsx:442/466` (2026-08-16) |
| `btn-neutral` (không tồn tại) | `btn btn-secondary` | `AttendanceHistoryModal.tsx:231` (2026-08-16) |
| `custom-scrollbar` (bị cấm §9) | bỏ class (đã có `overflow-*-auto`) | `ConflictInboxModal.tsx:57/124`, `SystemDiagnosticsModal.tsx:231` (2026-08-16) |

---

## 11. Do / Don't Checklist

- ✅ Dùng `.btn`, `.card`, `.badge`, `.form-*`, `.modal-overlay/.modal-content`, token `parish-*`/`surface-*`/`text-*`.
- ✅ Mọi màu mới phải nằm trong §2 hoặc mapping §9.
- ✅ Kiểm tra dark mode cho mọi component mới.
- ✅ Kiểm tra WCAG: chữ thường ≥ 4.5:1 (linter rule 6).
- ❌ Không hex cứng, không `bg-[#...]`, không inline `style={{background/color}}`. (`bg-[var(--color-*)]` **được phép** — token arbitrary hợp lệ.)
- ❌ Không dùng `blue-600` làm CTA (màu chi đoàn Thiếu Nhi).
- ❌ **Không dùng `bg-emerald-600/700`, `bg-rose-600/700`, `bg-amber-600/700`, `bg-sky-600/700`, `bg-green-600/700` trên button** — white text FAIL WCAG AA (linter rule 6, 2026-08-16). Thay bằng `.btn-primary`/`.btn-secondary`/`.btn-danger` (không có `.btn-success` vì success #16A34A ≈ 3.0:1 không đạt AA với chữ trắng).
- ❌ **Filter/status pill active state không dùng solid 600** — dùng badge domain token: `bg-[var(--color-parish-*-bg)] text-[var(--color-parish-*-hover)] border border-[var(--color-parish-*)]/30` (mapping 2026-08-16).
- ❌ Không tạo class mới ngoài `index.css` — mở rộng `@theme` + khai báo tại đây.
- ❌ Không đụng: `Certificate`/`AnswerSheetModal`/`ExamScanModal` (in ấn + OMR cần contrast riêng), `index.css` `@media print`, mobile shell CSS.

---

## 12. Migration Status (ADR-030, cập nhật 2026-08-13)

**Phase 1 — Đã đóng**: class không tồn tại (`input` → `form-input`, `bg-surface-main` → `bg-surface-app`), 8 chỗ `bg-blue-600/700` CTA/tab-active → `bg-parish-primary`.

**Phase 2 — Đã hoàn tất**: chuẩn hóa glass/slate/toàn bộ file modified còn lại (sweep hex/slate/white/blue/glass = 0 ở mọi file đã migrate):

| Nhóm | File đã migrate |
| --- | --- |
| Desktop | `DesktopSidebar`, `DesktopGradeMatrix`, `DesktopDailyGradeEntry`, `DesktopGradeCards`, `DesktopGradeComparison`, `DesktopStudentList`, `DesktopClasses`, `DesktopDashboard`, `DesktopReports`, `DesktopAttendanceGrid`, `DesktopAttendanceSummary` |
| Pages | `CatechistPage`, `AcademicYearPage`, `AuditLogPage`, `UserManagementPage`, `SettingsPage` (còn 1 chỗ `bg-white` toggle-knob — deliberate) |
| Modal | `ConflictInboxModal`, `GradeFormulaConfigModal`, `SystemDiagnosticsModal`, `PromotionPanel`, `AttendanceHistoryModal`, `UserManagementPage` modals |
| Mobile | `MobileHomeView`, `MobileReportsView`, `MobileGradeComparison`, `MobileGradeView`, `MobileNoticesView`, `MobileStudentsView`, `MobileDailyGradeEntry`, `MobileAttendanceSummaryView` |
| Exam | `ExamSessionView`, `ExamResultsTable`, `QuickScoreEntry` |
| Common | `OfflineStatusBanner` (pending state → sky) |

**Quy ước đã chuẩn hóa**: thead unified (`bg-surface-app text-text-muted border-b-2 border-surface-border` + th `px-4 py-2.5 font-bold text-xs uppercase tracking-wider` — §6); rank "Giỏi" = **sky family** (Giỏi: sky-800/700/600, Trung Bình: `surface-hover`/`text-text-secondary`); `badge-secondary` (không tồn tại) → `badge-neutral`; icon tile → `bg-parish-primary-light text-parish-primary`.

**Deliberate keeps (ĐÃ quyết định giữ, không phải leftover)**: modal overlay `bg-black/50-60 backdrop-blur`; icon `bg-white/10-20` trên header gradient modal; hero/header translucency (HeaderBar, LoginPage, MobileHomeView orb, MobileReportsView switcher, MobileNoticesView badge); glass container pattern page-header (`bg-surface-card/80 backdrop-blur-md border-surface-border`) ở DesktopGradeMatrix + DesktopStudentList; dark bar bulk-action `DesktopStudentList:320` + sync banner; SCORE_TYPES data-type color; status accents emerald/amber/rose/sky; toggle knob `SettingsPage`; medal gradient `DesktopDashboard`; print/exam exempt files (`Certificate.tsx`, `PhotoCard.tsx`, A4 print sheets).

**Dark Mode Full Polish (Hoàn thành 2026-08-14)**:
- `ConflictResolutionModal`: Chuyển 100% sang `bg-surface-card`, `bg-surface-app`, `text-text-main`, `border-surface-border`.
- `ExcelImportModal`: Dọn dẹp toàn bộ ô duplicate mapping sang `bg-surface-card` và `bg-surface-app`.
- `DesktopGradeMatrix` & `DesktopStudentList`: Header chuyển thành `bg-surface-card/80 backdrop-blur-md border-surface-border`. Bổ sung `bg-surface-card text-text-main` cho toàn bộ thẻ `table`, `tbody`, `tr`, các ô nhập điểm (`input[data-matrix-cell]`) và ô nhập ghi chú (`input[placeholder*="ghi chú"]`).
- `DesktopDailyGradeEntry`, `DesktopGradeComparison`, `DesktopAttendanceGrid`, `DesktopAttendanceSummary`, `DesktopLeaveRequests`, `DesktopClasses`, `DesktopNotices`, `DesktopReports`, `UserManagementPage`, `ExamResultsTable`, `QuickScoreEntry`, `ParentPage`: Đồng bộ 100% `bg-surface-card text-text-main` trên bảng và thẻ hàng `tr`.
- `src/index.css`: Bổ sung global dark mode reset rules cho `table`, `thead`, `tbody`, `tr`, `td`, `input`, `select`, `textarea` đảm bảo nền tối `--color-surface-card` và chữ `--color-text-main` nhất quán trên toàn bộ trình duyệt.
- `src/stores/themeStore.ts`: Bổ sung đồng bộ class `.dark` vào `document.documentElement` ngay khi hydrate từ IndexedDB/Dexie và khi toggle theme.
- `AnswerSheetModal`, `ExamScanModal`, `ExamSessionView`: Toàn bộ modal shell, bộ điều khiển, danh sách chọn in và popup đáp án chuẩn chuyển sang Design System v3.1 tokens với Dark Mode hoàn hảo.
- `GradeCellInput`: 100% token-based (`bg-surface-card`, `border-surface-border`, `text-text-main`).

**UX/UI Audit Batch 2026-08-16 (Pha 0 + Pha 2, kế thừa plan `docs/UX_UI_AUDIT_AND_IMPROVEMENT_PLAN_2026-08-16.md`)**:
- Linter mở rộng lên **6 rules**: + `NO_NONEXISTENT_CLASS` (badge-secondary/btn-neutral/custom-scrollbar/bg-surface-main), + `NO_ARBITRARY_HEX` (chỉ `[#hex]`, không chặn `[var(--color-*)]`), + `NO_RAW_600_BUTTON` (emerald/rose/amber/sky/green 600-700 trên button, quét button-context 3 dòng).
- Contrast sweep: 19 button + 4 filter pill + rankColors → theo mapping §11 mới.
- Nút "In Phiếu" (DesktopGradeCards/MobileStudentsView/DesktopReports/MobileReportsView) → `uiStore.openReportForPrint` + `StudentReportModal autoPrint` (print qua `ReportExportService.print` — cùng pipeline PrintReportModal, iframe fallback chống popup-block).
- `DesktopStudentList.handleDelete` nối `studentStore.deleteStudents` + toast.
- `PromotionPanel` "ĐTB" hiển thị `avg.score` thay `recommendedBranch`.

**UX/UI Audit Batch 2026-08-16 (Pha 1 — Component Standards, ADR-047)**:
- Tạo 3 component chuẩn dùng chung (bắt buộc cho code mới):
  - `src/components/common/PageHeader.tsx` — DS §5: icon tile `bg-parish-primary-light text-parish-primary` + `h1 text-lg font-extrabold text-text-main` + desc `text-xs text-text-muted` + `actions` phải.
  - `src/components/common/ModalShell.tsx` — wrap `.modal-overlay`/`.modal-content` + `role="dialog"` `aria-modal` `aria-labelledby` (useId) + focus trap (`useFocusTrap`) + Escape + scroll-lock + overlay-click policy (`closeOnOverlay`, default true) + close button `btn btn-icon btn-ghost` aria-label "Đóng". (ConfirmDialog giữ `role="alertdialog"` — đúng semantics confirm.)
  - `src/components/common/FormField.tsx` — `htmlFor` + required marker + error `.form-error` `role="alert"` + `aria-invalid`/`aria-describedby` (ưu tiên error hơn hint).
- Thêm **domain badge colors** vào `@theme` (AA trên pastel — violet 6.6:1, teal ~7:1, orange 4.6:1, indigo ~7:1, purple ~6:1): `--color-parish-violet/-bg #6D28D9/#EDE9FE`, `--color-parish-teal/-bg #0F766E/#CCFBF1`, `--color-parish-orange/-bg #C2410C/#FFEDD5`, `--color-parish-indigo/-bg #4338CA/#E0E7FF`, `--color-parish-purple/-bg #7E22CE/#F3E8FF` + `.badge-{violet,teal,orange,indigo,purple}` + dark overrides (text sáng trên nền tối).
- Verify: `CommonComponents.test.tsx` 13/13 PASS · `lint:ds` 0/128 · `tsc -b` clean · oxlint 0 error.

**UX/UI Audit Batch 2026-08-16 (Pha 3 — a11y modal + tables + icon buttons)**:
- `scope="col"` cho **129 `<th>` / 18 file** (scripted; `ExamResultsTable` 1 th tự-đóng → `aria-label="Thao tác"`).
- `aria-label` cho icon-only buttons: HeaderBar 6 nút, DesktopStudentList 5 nút, AuditLogPage Eye (+`aria-expanded`), UserManagementPage reveal-password, ParentLoginPage show/hide.
- `ModalShell` mở rộng props optional: `icon` (icon tile), `subtitle`, `headerActions` (như PrintReceiptModal); `title` kiểu `ReactNode` (icon trong title). **Batch 1 migrate (finance 4/4)**: `FundManageModal`, `TransactionModal`, `PrintReceiptModal`, `ClassFeeCollectionModal` — shell full-bleed (toolbar `-mt-4 -mx-6`) giữ nguyên visual. **Batch 2 migrate (desktop 16 modal)**: `AttendanceHistoryModal`, `DesktopCalendarView` ×2, `DesktopClasses` ×2 (confirmDelete → `ConfirmDialog`), `DesktopLeaveRequests` review, `PromotionPanel` confirm, `UserManagementPage` 8/8.
- **Quy ước Tier B** (modal giữ shell custom — header brand/màu, tabs, sticky footer, camera/print): thêm trực tiếp `role="dialog"|"alertdialog"` + `aria-modal` + `aria-labelledby` (id trên heading) + Escape + scroll-lock. Đã áp: `ConflictInboxModal`, `GradeFormulaConfigModal`, `SystemDiagnosticsModal`, `ExcelImportModal`, `ExcelGradeImportModal`, `ConflictResolutionModal`, `BackupRestoreModal`, `PurgeDataModal` (alertdialog), `ForcePasswordChangeModal` (gate — chỉ scroll-lock, không Escape), `ParentForgotPasswordModal`, `ExamPaperModal`, `ExamImportModal`, `AnswerSheetModal`, `ExamScanModal`, `ExamSessionView` ×2.
- **Lưu ý kỹ thuật**: effect a11y (Escape/scroll-lock) phải đặt TRƯỚC early-return `if (!isOpen) return null` (guard bên trong effect) — nếu không, oxlint `rules-of-hooks` báo error.

**UX/UI Layout Standardization (Hoàn thành 2026-08-16)**:
- Chuẩn hóa toàn bộ Page & Desktop views sử dụng `PageHeader` (`src/components/common/PageHeader.tsx`), đồng nhất Macro-layout (tiêu đề trang, icon tile, mô tả, thanh công cụ/actions):
  - `AcademicYearPage`, `AuditLogPage`, `CatechistPage`, `FinancePage`, `SettingsPage`
  - `DesktopAttendanceGrid`, `DesktopClasses`, `DesktopLeaveRequests`, `DesktopNotices`, `DesktopReports`, `DesktopStudentList`, `UserManagementPage`
  - `DesktopGradeMatrix`, `DesktopGradeCards`, `DesktopGradeComparison`, `DesktopDailyGradeEntry`, `DesktopCalendarView`
- `PageHeader` hỗ trợ `card?: boolean` (mặc định `true` cho styled card container) và `className?: string` cho layout tùy biến linh hoạt.




