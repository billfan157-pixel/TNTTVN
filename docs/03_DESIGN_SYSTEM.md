# 🎨 Design System — Brave Davinci (TNTT Parish Management PWA)

**Phiên bản:** 4.1 (App-wide Calm, Confident Parish Product — Updated 2026-08-27)
**Trạng thái:** ✅ **SSOT DUY NHẤT** — quyết định ADR-030
**Nguồn vận hành (code truth):** `src/index.css` — mọi class/token được khai báo tại đây, tài liệu này là tài liệu hóa của nó.

> **Nguyên tắc bất biến:** Mọi thành phần UI MỚI phải dùng token/class trong tài liệu này. Không dùng hex màu cứng, không dùng class không tồn tại, không dùng màu ngoài bảng palette. Migration các module cũ theo bảng §10.

---

## 1. Triết Lý Thiết Kế

1. **Token-First & Dark-Mode-First:** Mọi màu sắc qua CSS variables (`var(--color-*)`) — tự động thích nghi light/dark. Cấm hex cứng trong JSX (`style={{...}}`) và arbitrary values (`bg-[#...]`).
2. **Source scope:** Tailwind v4 chỉ scan `src/` và `index.html` qua `source(none)` + `@source`; không scan Markdown/audit text để tránh sinh utility giả từ ví dụ tài liệu.
3. **Brand nhất quán:** Màu chủ đạo duy nhất `parish-primary #1E3A8A` (Xanh Đại Hội). `blue-600 #2563EB` KHÔNG phải màu brand — nó là màu khăn chi đoàn **Thiếu Nhi** (dữ liệu nghiệp vụ, xem §2.4).
4. **Accessibility (WCAG AA):** Chữ thường ≥ 4.5:1 trên nền. `text-text-muted #64748B` (4.76:1) là màu chữ phụ tối đa — cấm `text-slate-400 #94A3B8` (2.56:1 FAIL) làm chữ.
5. **Mobile-First, Data-Dense:** Trải nghiệm desktop + mobile PWA đồng bộ qua primitives `mobile-*`; bảng dữ liệu thoáng, rõ, không cắt chữ.
6. **Glassmorphism có kiểm soát:** Chỉ dùng cho header/hero/bottom-nav (có backdrop nền màu phù hợp), KHÔNG dùng cho card nội dung/bảng (cần nền đục để đọc).
7. **Calm, Confident, Crafted:** Giữ brand navy–gold và tính trang nghiêm; content/data là lớp nổi bật nhất. Delight đến từ tốc độ, clarity và chi tiết hoàn thiện, không từ orb/blur/decorative animation.
8. **Elevation có nghĩa:** `surface-sunken → surface-card → surface-raised → overlay`; card tĩnh ưu tiên border + shadow rất nhẹ, chỉ interactive/overlay mới nâng rõ.

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
| Hiệp Sĩ | `#8B4513` (nâu) |

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
- Modal tác vụ dài (ví dụ **Tạo Phiên Chấm**) dùng bottom-sheet ở mobile: tiêu đề/nút đóng và hành động chính sticky, phần nội dung tự cuộn, footer chừa `safe-area-inset-bottom`; từ `sm` trở lên quay về modal giữa màn hình.
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

**UX/UI Audit Batch 2026-08-16 (Pha 1 — Component Standards, ADR-055)**:
- Tạo 3 component chuẩn dùng chung (bắt buộc cho code mới):
  - `src/components/common/PageHeader.tsx` — DS §5: icon tile `bg-parish-primary-light text-parish-primary` + `h1 text-lg font-extrabold text-text-main` + desc `text-xs text-text-muted` + `actions` phải.
  - `src/components/common/ModalShell.tsx` — wrap `.modal-overlay`/`.modal-content` + `role="dialog"` `aria-modal` `aria-labelledby` (useId) + focus trap (`useFocusTrap`) + Escape + scroll-lock + overlay-click policy (`closeOnOverlay`, default true) + close button `btn btn-icon btn-ghost` aria-label "Đóng". (ConfirmDialog giữ `role="alertdialog"` — đúng semantics confirm.)
  - `src/components/common/FormField.tsx` — `htmlFor` + required marker + error `.form-error` `role="alert"` + `aria-invalid`/`aria-describedby` (ưu tiên error hơn hint).
- Thêm **domain badge colors** vào `@theme` (AA trên pastel — violet 6.6:1, teal ~7:1, orange 4.6:1, indigo ~7:1, purple ~6:1): `--color-parish-violet/-bg #6D28D9/#EDE9FE`, `--color-parish-teal/-bg #0F766E/#CCFBF1`, `--color-parish-orange/-bg #C2410C/#FFEDD5`, `--color-parish-indigo/-bg #4338CA/#E0E7FF`, `--color-parish-purple/-bg #7E22CE/#F3E8FF` + `.badge-{violet,teal,orange,indigo,purple}` + dark overrides (text sáng trên nền tối).
- Verify: `CommonComponents.test.tsx` 13/13 PASS · `lint:ds` 0/128 · `tsc -b` clean · oxlint 0 error.

**UX/UI Audit Batch 2026-08-16 (Pha 3 — a11y modal + tables + icon buttons)**:
- `scope="col"` cho **129 `<th>` / 18 file** (scripted; `ExamResultsTable` 1 th tự-đóng → `aria-label="Thao tác"`).
- `aria-label` cho icon-only buttons: HeaderBar 6 nút, DesktopStudentList 5 nút, AuditLogPage Eye (+`aria-expanded`), ParentLoginPage show/hide. UserManagementPage không còn reveal-password (ADR-058).
- `ModalShell` mở rộng props optional: `icon` (icon tile), `subtitle`, `headerActions` (như PrintReceiptModal); `title` kiểu `ReactNode` (icon trong title). **Batch 1 migrate (finance 4/4)**: `FundManageModal`, `TransactionModal`, `PrintReceiptModal`, `ClassFeeCollectionModal` — shell full-bleed (toolbar `-mt-4 -mx-6`) giữ nguyên visual. **Batch 2 migrate (desktop 16 modal)**: `AttendanceHistoryModal`, `DesktopCalendarView` ×2, `DesktopClasses` ×2 (confirmDelete → `ConfirmDialog`), `DesktopLeaveRequests` review, `PromotionPanel` confirm, `UserManagementPage` 8/8.
- **Quy ước Tier B** (modal giữ shell custom — header brand/màu, tabs, sticky footer, camera/print): thêm trực tiếp `role="dialog"|"alertdialog"` + `aria-modal` + `aria-labelledby` (id trên heading) + Escape + scroll-lock. Đã áp: `ConflictInboxModal`, `GradeFormulaConfigModal`, `SystemDiagnosticsModal`, `ExcelImportModal`, `ExcelGradeImportModal`, `ConflictResolutionModal`, `BackupRestoreModal`, `PurgeDataModal` (alertdialog), `ForcePasswordChangeModal` (gate — chỉ scroll-lock, không Escape), `ParentForgotPasswordModal`, `ExamPaperModal`, `ExamImportModal`, `AnswerSheetModal`, `ExamScanModal`, `ExamSessionView` ×2.
- **Lưu ý kỹ thuật**: effect a11y (Escape/scroll-lock) phải đặt TRƯỚC early-return `if (!isOpen) return null` (guard bên trong effect) — nếu không, oxlint `rules-of-hooks` báo error.

**UX/UI Layout Standardization (Hoàn thành 2026-08-16)**:
- Chuẩn hóa toàn bộ Page & Desktop views sử dụng `PageHeader` (`src/components/common/PageHeader.tsx`), đồng nhất Macro-layout (tiêu đề trang, icon tile, mô tả, thanh công cụ/actions):
  - `AcademicYearPage`, `AuditLogPage`, `CatechistPage`, `FinancePage`, `SettingsPage`
  - `DesktopAttendanceGrid`, `DesktopClasses`, `DesktopLeaveRequests`, `DesktopNotices`, `DesktopReports`, `DesktopStudentList`, `UserManagementPage`
  - `DesktopGradeMatrix`, `DesktopGradeCards`, `DesktopGradeComparison`, `DesktopDailyGradeEntry`, `DesktopCalendarView`
- `PageHeader` hỗ trợ `card?: boolean` (mặc định `true` cho styled card container) và `className?: string` cho layout tùy biến linh hoạt.

**UI-POLISH Batch 2026-08-25 (Sidebar + Settings + Shell header)**:
- **Shell**: HeaderBar + OfflineStatusBanner lên full-width top (RootLayout) — diệt góc trên-trái trống lệch với sidebar; sidebar bỏ sticky/`calc(100vh - …)`, chuyển flex stretch (xem §13 Shell & Sidebar).
- **Sidebar**: nền card + border-right cả 2 mode (light trước đây trong suốt); section-label padding-top tạo nhịp; active inset-ring + `:focus-visible` ring; scrollbar 4px hover-only; `.sidebar-footer` ghim đáy (Bộ lọc admin + Cài Đặt, 1 divider); filter select compact 32px; `aria-current="page"`; badge 18px chuẩn.
- **SettingsPage**: `narrow` → `wide` grid `lg:grid-cols-12` (7/5) — form `max-w-lg`; FormField ×5 (htmlFor/aria-describedby); autoComplete `name/tel/current-password/new-password`; eye + theme + view-mode `aria-pressed`; hint quy tắc mật khẩu; Vùng Nguy Hiểm về cột phải; SectionTitle tile `w-8 h-8` icon `w-4 h-4`. Đóng finding MED a11y Settings (desktop audit 2026-08-22 §2).
- Verify: tsc 0 · oxlint 0 · lint:ds 0/135 · HeaderBar+CommonComponents 20/20 · build pass.

## §13. Desktop Layout Contract (2026-08-22)

> Nguồn: `docs/desktop-ui-audit-and-improvement-plan-2026-08-22.md` và audit ADR-072. Áp dụng cho desktop mode (viewport ≥ 1024px).

### Breakpoints
| Mốc | Ý nghĩa |
|---|---|
| `md` (768px) | Tablet bắt đầu; vẫn dùng mobile shell và touch contract, modal có thể dùng layout giữa màn hình. |
| `lg` (1024px) | Ranh giới shell mobile/tablet↔desktop (`useEffectiveMode` + CSS guard `.mobile-app-shell`); force-desktop bị chặn dưới mốc này. |
| `xl` (1280px) | Side content — **cấm `hidden xl:` giấu thông tin duy nhất**, phải degrade |

### Container tiers (`DesktopAppShell`)
| Tier | Class | Dành cho |
|---|---|---|
| `full` | `w-full` | Data workspace: Dashboard, Students, Grades, Attendance, Calendar |
| `wide` | `w-full max-w-7xl mx-auto` | Admin/directory: Finance, Users, AuditLog, AcademicYear, Catechist, ParentDashboard, **SettingsPage** (UI-POLISH 2026-08-25: narrow→wide — grid 12-col 7/5, form giới hạn `max-w-lg` giữ nhịp đọc; narrow trước đây gây chật 2-col + trống ~800px hai bên màn rộng) |
| `narrow` | `w-full max-w-3xl mx-auto` | (Hiện không còn page nào — dành cho form đơn giản tương lai) |

### Shell & Sidebar desktop (UI-POLISH 2026-08-25)

**Cấu trúc shell (RootLayout desktop branch):**
```
flex h-screen flex-col
├── HeaderBar (FULL-WIDTH: OfflineStatusBanner + header gradient 68px)
└── flex flex-1 min-h-0
    ├── DesktopSidebar (260px, stretch full chiều cao còn lại)
    └── main#main-content (flex-1 overflow-y-auto p-6) + global modals
```
> Header full-width → sidebar + content start cùng mép trên; header có thêm ~260px
> chống overflow (audit A7). Sidebar KHÔNG dùng `position: sticky` hay
> `height: calc(100vh - …)` — là flex child stretch của row.

**Sidebar spec (`src/index.css` block SIDEBAR):**
| Class | Vai trò |
|---|---|
| `.sidebar-container` | 260px · `bg-surface-card` + `border-right surface-border` (CẢ HAI mode) · padding 16/14 · flex-col gap 16 |
| `.sidebar-nav` | flex:1 min-h-0 overflow-y-auto · scrollbar 4px chỉ hiện khi hover |
| `.sidebar-section-label` | 11px/700 CAPS · padding 14/12/8 (nhịp phân nhóm) |
| `.sidebar-nav-item` | 9px 12px · radius 10px · 13.5px/600 · `:focus-visible` ring `--color-focus-ring` |
| `.sidebar-nav-item-active` | `parish-primary-light` + inset ring `color-mix(parish-primary 25%)` + `aria-current="page"` |
| `.sidebar-footer` | ghim đáy: border-top + gap 12 — chứa Bộ lọc (admin) + Cài Đặt, MỘT divider duy nhất |
| `.sidebar-filter-field` | label 11px/600 · select compact 32px/12.5px |

### Quy tắc
1. Cấm container max-width tự phát ngoài 3 tier trên.
2. Control trong toolbar: ưu tiên `min-w-0`/`max-w-full` thay width cứng khi nằm trong `justify-between`.
3. Icon-button desktop chuẩn: `h-10 w-10 rounded-xl`; segment trong pill: `h-9 rounded-lg`.
4. Header chia zone: Brand │ Data filters │ Utilities │ User identity (cùng phải).
5. Z-index dùng token `--z-*` (xem `index.css :root`), không hard-code z mới.

## §14. Visual Language v4.1 — Calm, Confident Parish Product (2026-08-27)

> Quyết định và nghiên cứu đầy đủ: `docs/UI_UX_UPGRADE_PLAN_2026-08-27.md`;
> ADR-063. Phạm vi là presentation layer, không đổi domain/API/schema/auth.

### Triết lý

1. **Calm** — bố cục có nhịp, content surface phẳng và yên; không dùng blur,
   gradient hoặc shadow như trang trí mặc định.
2. **Confident** — hierarchy, trạng thái, CTA và hành động nguy hiểm phải rõ;
   navy–gold là tín hiệu nhận diện có kiểm soát, không lấn dữ liệu.
3. **Crafted** — trạng thái focus/loading/empty/error, dark mode, mobile touch và
   reduced motion đều là một phần của chất lượng hoàn thiện.

### Surface và elevation

| Level | Token / primitive | Dùng cho |
|---|---|---|
| App | `--color-surface-app` | Nền canvas toàn app |
| Sunken | `--color-surface-sunken`, `.surface-sunken` | Filter well, nhóm control phụ |
| Card | `--color-surface-card`, `.card`, `.section-card` | Nội dung thông thường; border là phân cách chính |
| Raised | `--color-surface-raised`, `--shadow-raised` | Popover/modal/hover có quan hệ cao độ thật |

### Primitive bắt buộc cho code mới

- Page identity: `PageHeader` / `.page-header*`.
- Nhóm nội dung: `.section-card` + `.section-heading*`.
- KPI: `.metric-card*`; accent chỉ là một spine 3px và phải dùng semantic token.
- Desktop shell: `.app-header*`, `.app-main-content`, `.app-page-loader*`.
- Mobile home: `.mobile-home-hero`, `.mobile-quick-action*`,
  `.mobile-stat-card*`, `.mobile-content-card`.
- Motion: `--motion-fast|standard|slow` + `--motion-ease-out`; luôn tôn trọng
  `prefers-reduced-motion`.
- Route motion: `PageTransition` là boundary duy nhất; `router.defaultViewTransition`
  chỉ chạy khi **pathname thay đổi**, không chạy lại khi đổi search/filter. Shell
  (header/sidebar/bottom nav) đứng yên; `app-page` fade-through + dịch dọc tối đa
  6px, 120–260ms. Trình duyệt thiếu `document.startViewTransition` dùng
  `.route-transition-frame--fallback`; reduced-motion tắt animation và smooth scroll.
- Mọi route/view: `.product-view`; `DesktopAppShell` tự gắn class này.
- Generic content: `.app-panel`, `.app-panel--interactive`, `.entity-card`.
- Filter/action cluster: `.view-toolbar`; switcher/tab: `.view-tabs` + `.view-tab.is-active`.
- Mobile page identity/filter: `.mobile-page-header*`, `.mobile-filter-panel`.
- Empty/no-result/error: `.state-feedback*`.
- Public/auth: `.auth-page`, `.auth-card`, `.auth-hero*`, `.auth-option`.

### App-wide coverage contract

- Desktop: Dashboard, Students, Grade Cards/Daily/Matrix/Comparison, Attendance,
  Attendance Summary, Leave Requests, Calendar, Reports, Notices, Classes,
  Users và admin pages qua `DesktopAppShell`.
- Mobile: Home, Students, Attendance/Summary/Leave, Grade Cards/Daily/Matrix/
  Comparison, Calendar, Reports, Notices.
- Public: portal chooser, staff/parent login, certificate verification.
- `/management` chỉ có một page identity; child AcademicYear/Classes/Users dùng
  `embedded` để không lặp PageHeader.
- Anti-drift: `src/__tests__/appWideUiMigration.test.ts`.

### Interaction contract

- Icon-only button phải có accessible name; toggle/segment phải có
  `aria-pressed` hoặc semantic state tương đương.
- Mobile/tablet shell (<1024px) có control chính tối thiểu 44×44px; input/select/textarea dùng
  font-size tối thiểu 16px để tránh auto-zoom.
- Phone modal (≤767px) chuẩn chuyển thành bottom sheet; tablet giữ bề rộng dialog phù hợp. Mọi custom dialog dùng `ModalShell` hoặc `useAccessibleDialog` để giữ focus trap/restore, top-most Escape, `aria-modal` và scroll lock.
- Chỉ một `#main-content`; owner mobile là `MobileAppShell`, owner desktop là
  `RootLayout`.
- Không tự gắn entrance animation ở từng `.product-view`; page-level motion chỉ
  thuộc `PageTransition` để tránh double animation và visual drift.

### Deliberate exceptions

Gradient navy–gold ở brand shell, domain/status color, print/certificate layout,
camera/OMR guide và medal visualization vẫn được phép khi có semantic purpose.
Mọi exception mới phải được ghi tại đây hoặc ADR liên quan, không tạo visual
dialect riêng ở từng page.

---

## 15. Mobile Product UX/UI System (Cập nhật 2026-08-29)

### 15.1 Tokens Mở Rộng
- **Radius**: `--radius-nav: 14px` (bottom-nav items, sheet triggers), `--radius-sheet-lg: 18px` (control sheets, brand page headers), `--radius-hero: 22px` (hero cards).
- **Z-Index Ladder**:
  `--z-install-prompt: 30` < `--z-sticky-filter: 30` < `--z-header: 40` < `--z-modal: 50` < `--z-bottom-action: 850` < `--z-floating-action: 900` < `--z-top-bar: 950` < `--z-mobile-nav: 1000` < `--z-toast: 9999`.
- **Motion**: Thống nhất dùng `--motion-standard: 180ms` và `--motion-fast: 120ms` cho toàn bộ micro-interactions mobile.

### 15.2 Mobile Component Primitives
- `.sheet-grabber`: Visual drag handle (Apple HIG & Material Design 3) cho tất cả bottom sheets (`width: 36px; height: 5px; border-radius: var(--radius-full); margin: 0 auto 12px;`).
- `.mobile-top-bar`: Khai báo duy nhất với `z-index: var(--z-top-bar)`, dynamic clearance token `--mobile-topbar-clearance`, loại bỏ xung đột giữa desktop và mobile media queries.
- `.mobile-filter-panel`: Tối ưu hiệu năng cuộn trên mobile bằng việc loại bỏ `backdrop-filter: blur(12px)` trên sticky panel trong scroll area, sử dụng 97% surface-card background.

### 15.3 Dark Mode Overrides cho Mobile Brand Components
- `.dark .mobile-home-hero`: Gradient xanh navy trầm + shadow tối phù hợp dark background.
- `.dark .mobile-top-bar`: Gradient navy-dark thích ứng, tăng độ tương phản của brand mark và sheet trigger.
- `.dark .mobile-page-header--brand`: Gradient tối đồng bộ với hệ thống.
- Dark shadows: `.mobile-floating-action`, `.mobile-bottom-nav`, `.mobile-bottom-action-bar` chuyển sang shadow tối (`rgba(0, 0, 0, 0.3-0.5)`).

### 15.4 Mobile Ergonomics & Accessibility
- Universal Touch Targets: Tất cả search inputs, action buttons, filter pills trong mobile/tablet shell đều đạt tối thiểu `min-height: 44px`.
- Keyboard Ergonomics: Toàn bộ search inputs trên mobile khai báo tường minh `inputMode="search"`. Numeric inputs (điểm số) khai báo `inputMode="decimal"`.
- Asynchronous Loading Perception: Thay thế toàn bộ raw text fallback ("Đang tải...") trong Suspense boundaries bằng `<SkeletonCardGrid>` và `<SkeletonTable>` từ `StateFeedback`.
- Accessible Semantics: Quick action buttons và icon actions đều có `aria-label` chi tiết; modal forms có `role="dialog"` và `aria-modal="true"`; calendar tiles có `aria-label` và `aria-pressed`.

---

## 16. Home Dashboard Version 2.1 Standards ("Less, but better")

### 16.1 Phân Cấp Thông Tin (Information Architecture)
1. **Header / Identity**: Route `/dashboard` mang tên "Tổng quan xứ đoàn" (thay vì cấp giáo xứ); hiển thị số lượng thiếu nhi đang quản lý; trạng thái kết nối hoàn toàn tĩnh lặng khi hoạt động bình thường, chỉ hiển thị cảnh báo khi offline hoặc có dữ liệu chờ đồng bộ.
2. **Hero Section (Single Focal Point)**:
   - Eyebrow: `GIÁO XỨ GIA TÔN`
   - Lời chào thời gian thực cá nhân hóa 2 tầng: `{greeting},` trên dòng 1, `{displayName}` lớn và nổi bật ở dòng 2.
   - Context: `[Vai trò] · Học kỳ [I/II] · Niên học [YYYY-YYYY]`
3. **Thẻ Lịch Phụng Vụ (`MobileLiturgicalWidget`)**: Entry point duy nhất dẫn đến `/calendar`, hiển thị trực tiếp màu áo lễ và câu Lời Chúa trong ngày.
4. **Thao Tác Nhanh (Primary Actions)**: Lưới 2×2 thẻ thao tác sản phẩm: *Điểm danh (Sổ chuyên cần), Bảng điểm (Sổ điểm giáo lý), Duyệt nghỉ ({X} đơn chờ / Đơn vắng phép), Thêm thiếu nhi (Tạo hồ sơ mới)* với touch target ≥54px, phản hồi rung haptic và badge số đơn chờ duyệt.
5. **Việc Cần Xử Lý (Action Required)**: Khối điều hành có điều kiện — CHỈ hiển thị khi có đơn/công việc chờ duyệt (`pendingCount > 0`); hoàn toàn ẩn khi không có việc tồn đọng.
6. **Tổng Quan Xứ Đoàn (KPI Cards)**: 2 cột đối xứng trả lời câu hỏi cốt lõi: Sĩ số (`Tổng thiếu nhi`) và Chuyên cần (`Tỷ lệ chuyên cần`).
7. **Học Lực Giáo Lý (Academic Summary)**: Đọc số liệu trực tiếp (`Xuất sắc`, `Giỏi`, `Khá`), thanh phân bổ mini hỗ trợ trực quan phân bổ của tập học viên đã có điểm, không gây nhầm lẫn với tổng sĩ số.
8. **Quy Chuẩn Chính Tả Tiếng Việt (Sentence Case)**: Toàn bộ nhãn chức năng, tiêu đề khối dùng Sentence case (*Điểm danh, Bảng điểm, Duyệt nghỉ, Thêm thiếu nhi, Tổng thiếu nhi, Tỷ lệ chuyên cần, Thông báo giáo xứ*).

---

## 17. Chuẩn Định Dạng Tên Thánh & Họ Và Tên Học Viên (Student Identity Typography Standard)

Nhằm đảm bảo tính tôn nghiêm Công Giáo (Catholic Spiritual Identity) kết hợp sự chuẩn mực trong quản lý học vụ học đường, toàn bộ hệ thống áp dụng bộ quy chuẩn bất biến cho việc hiển thị **Tên Thánh** và **Họ và Tên**:

### 17.1 Quy Tắc Phân Cấp Thị Giác & Màu Sắc

| Thành phần | Ý nghĩa nghiệp vụ | Token màu & Phông chữ | CSS Class | Ví dụ hiển thị |
|:---|:---|:---|:---|:---|
| **Tên Thánh (Holy Name)** | Tôn nghiêm Kitô giáo, Tên quan thầy bảo trợ | `text-amber-900 dark:text-amber-400` (`#78350F` / Amber 900 — nâu đậm trang nghiêm), `font-semibold` (weight 600) | `.student-holy-name` | *Phêrô*, *Maria*, *Giuse*, *Têrêsa* |
| **Họ và Tên (Full Legal Name)** | Định danh pháp lý & học vụ chính | `text-text-main` (`var(--color-text-main)`: Slate 900 `#0F172A` / Dark `#F1F5F9`), `font-extrabold` (weight 800) | `.student-full-name` | **Phan Bảo**, **Nguyễn Văn An** |

### 17.2 Quy Tắc Hiển Thị Bất Biến:
1. **Không dùng màu xanh Brand cho Họ và Tên**: Cấm tuyệt đối render `fullName` bằng `text-parish-primary` (màu xanh dương). Màu xanh dương là màu của interactive links/buttons/branding, việc tô xanh họ tên học sinh làm sai lệch affordance và giảm độ tương phản đọc.
2. **Tên Thánh đi liền trước Họ và Tên**: Luôn đặt Tên Thánh đứng trước Họ và Tên (khoảng cách `mr-1.5` hoặc `gap-1.5`).
3. **Trường hợp khuyết Tên Thánh**: Khi học viên chưa có Tên Thánh, hiển thị dấu gạch ngang thanh nhã `—` (`text-text-muted`) trong bảng ma trận/danh sách, hoặc bỏ qua trong thẻ tóm tắt.
4. **Thành phần dùng chung (Reusable Component)**:
   - `<StudentName holyName={student.holyName} fullName={student.fullName} layout="inline" | "stacked" size="xs" | "sm" | "base" | "lg" />` từ `src/components/common/StudentName.tsx`.
   - Component chèn khoảng trắng văn bản thật giữa Tên Thánh và Họ Tên (không chỉ dựa vào CSS `gap`) để copy, text extraction và assistive technology đọc đúng.
   - Đã áp dụng cho dashboard/parent portal, grade cards/daily/comparison, reports, leave requests và attendance summary trên desktop/mobile; bảng tách cột vẫn dùng `StudentHolyName`/`StudentFullName` hoặc typography classes tương ứng.

### 17.3 Anti-drift và accessibility audit (ADR-072)

- `scripts/design-system-lint.mjs` thực thi thật `NO_HARDCODED_HEX`; exemption chỉ dành cho print/OMR document tự chứa màu và phải liệt kê rõ.
- Custom dialog không được tự quản lý một phần lifecycle. Dùng `ModalShell`, `ConfirmDialog` hoặc `useAccessibleDialog`.
- Input điểm phải có accessible name chứa loại điểm và tên thiếu nhi; form auth phải dùng `main`, `htmlFor`/`id`, `role="alert"` và control ≥44px.
- Action “Làm mới dữ liệu trên thiết bị” chỉ hiện cho admin và mô tả đúng: xóa cache client, giữ mutation đang chờ đồng bộ, không xóa dữ liệu server.
