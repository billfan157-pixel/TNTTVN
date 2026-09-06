# 🎨 Design System — Brave Davinci (TNTT Parish Management PWA)

**Phiên bản:** 4.5 (Semantic Primitives, Modular CSS & Runtime Gates — Updated 2026-08-30)
**Trạng thái:** ✅ **SSOT DUY NHẤT** — quyết định ADR-030
**Nguồn vận hành (code truth):** CSS graph có entrypoint duy nhất `src/index.css`; declarations nằm trong các module có thứ tự tại `src/styles/design-system/`. Tài liệu này là documentation SSOT của graph đó.

> **Nguyên tắc bất biến:** Mọi thành phần UI MỚI phải dùng token/class trong tài liệu này. Không dùng hex màu cứng, không dùng class không tồn tại, không dùng màu ngoài bảng palette. Migration các module cũ theo bảng §10.

---

## 1. Triết Lý Thiết Kế

1. **Token-First & Dark-Mode-First:** Mọi màu sắc qua CSS variables (`var(--color-*)`) — tự động thích nghi light/dark. Cấm hex cứng trong JSX (`style={{...}}`) và arbitrary values (`bg-[#...]`).
2. **Source scope:** Tailwind v4 chỉ scan `src/` và `index.html` qua `source(none)` + `@source`; không scan Markdown/audit text để tránh sinh utility giả từ ví dụ tài liệu.
3. **Brand nhất quán:** Màu chủ đạo duy nhất `parish-primary #1E3A8A` (Xanh Đại Hội). `blue-600 #2563EB` KHÔNG phải màu brand — nó là màu khăn chi đoàn **Thiếu Nhi** (dữ liệu nghiệp vụ, xem §2.4).
   Logo chính thức dùng chung là `src/assets/logo-gia-ton.png` (nền trong suốt); desktop/mobile import asset này, còn các mẫu in/export lấy data URI tự chứa qua `src/utils/parishLogo.ts`.
4. **Accessibility:** Chữ thường và placeholder phải đạt ≥4.5:1 trên đúng surface thực tế; focus indicator phải có độ tương phản ≥3:1 với nền kề. Kết quả `lint:ds` chỉ là anti-drift source scan, không phải chứng nhận WCAG hoặc visual conformance.
5. **Mobile-First, Data-Dense:** Trải nghiệm desktop + mobile PWA đồng bộ qua primitives `mobile-*`; bảng dữ liệu thoáng, rõ, không cắt chữ.
6. **Glassmorphism có kiểm soát:** Chỉ dùng cho header/hero/bottom-nav (có backdrop nền màu phù hợp), KHÔNG dùng cho card nội dung/bảng (cần nền đục để đọc).
7. **Calm, Confident, Crafted:** Giữ brand navy–gold và tính trang nghiêm; content/data là lớp nổi bật nhất. Delight đến từ tốc độ, clarity và chi tiết hoàn thiện, không từ orb/blur/decorative animation.
8. **Elevation có nghĩa:** `surface-sunken → surface-card → surface-raised → overlay`; card tĩnh ưu tiên border + shadow rất nhẹ, chỉ interactive/overlay mới nâng rõ.
9. **Semantic primitive trước markup tùy ý:** control dùng chung phải đi qua typed React primitives; tab, panel, radio group, filter và icon action phải biểu đạt đúng semantics thay vì chỉ giống nhau về màu/class.

---

## 2. Bảng Màu Hệ Thống (Tokens — `src/styles/design-system/00-tokens.css`)

### 2.1 Brand & Semantic

| Token | Giá trị (Light) | Giá trị (Dark) | Mục đích |
| --- | --- | --- | --- |
| `parish-primary` | `#1E3A8A` | `#60A5FA` | Nút CTA chính, tab active, link, tiêu điểm |
| `parish-primary-hover` | `#1E40AF` | `#3B82F6` | Hover nút chính |
| `parish-primary-light` | `#EFF6FF` | `#1E3A5F` | Nền icon tile, badge-primary |
| `parish-secondary` | `#D97706` | `#FBBF24` | Accent phụ |
| `parish-success` | `#15803D` | `#4ADE80` | Trạng thái hoàn thành; foreground light đã tăng tương phản |
| `parish-success-hover` | `#166534` | `#22C55E` | Hover/foreground đậm của success |
| `parish-warning` | `#EA580C` | `#FB923C` | Cần lưu ý |
| `parish-danger` | `#DC2626` | `#F87171` | Xóa, khẩn cấp |
| `parish-info` | `#0369A1` | `#7DD3FC` | Thông tin; foreground đủ đọc trên surface light/dark |
| `parish-success-bg` | `#DCFCE7` | `#14532D` | Nền badge success |
| `parish-warning-bg` | `#FFEDD5` | `#431407` | Nền badge warning |
| `parish-danger-bg` | `#FEE2E2` | `#450A0A` | Nền badge danger |
| `parish-info-bg` | `#E0F2FE` | `#0C4A6E` | Nền badge info |

### 2.2 Surface & Text

| Token | Light | Dark | Mục đích |
| --- | --- | --- | --- |
| `surface-card` | `#FFFFFF` | `#1E293B` | Card, modal content, input nền |
| `surface-hover` | `#F1F4F8` | `#334155` | Hover, nền secondary |
| `surface-border` | `#DDE3EC` | `#475569` | Viền card, viền bảng |
| `surface-app` | `#F7F8FB` | `#0F172A` | Nền app, thead |
| `text-main` | `#0F172A` | `#F1F5F9` | Tiêu đề, nội dung chính |
| `text-muted` | `#5F6F82` | `#A3B1C4` | Chữ phụ, chú thích trên surface nội dung |
| `text-secondary` | `#475569` | `#A3B1C4` | Chữ cấp 2 |
| `text-inverse` | `#FFFFFF` | `#0F172A` | Chữ trên nền màu |
| `border-input` | `#CBD5E1` | `#475569` | Viền input |
| `text-placeholder` | `#5F6F82` | `#A3B1C4` | Placeholder trên surface nội dung; contrast thấp nhất 4.66:1 light / 4.75:1 dark |
| `text-placeholder-on-brand` | `#E2E8F0` | kế thừa | Placeholder trên navy header/control sheet; không dùng trên surface sáng |

### 2.3 Interaction States & Feedback

| Token | Light | Dark | Mục đích |
| --- | --- | --- | --- |
| `focus-ring` | `rgba(30, 58, 138, 0.35)` | `rgba(96, 165, 250, 0.45)` | Feedback focus trên content surface |
| `focus-ring-brand` | `#FFFFFF` | kế thừa | Outline 3px trên `.app-header`, `.mobile-top-bar`, `.mobile-control-sheet` |
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

Nguồn: `src/constants/branches.ts` + `--color-branch-*` trong `src/styles/design-system/00-tokens.css`. Đây là màu khăn quàng — **ngữ nghĩa nghiệp vụ, cấm dùng làm màu CTA/brand.**

| Chi đoàn | Màu |
| --- | --- |
| Chiên Con | `#EC4899` (hồng) |
| Ấu Nhi | `#16A34A` (xanh lá) |
| Thiếu Nhi | `#2563EB` (xanh dương) — **lưu ý: ≠ parish-primary** |
| Nghĩa Sĩ | `#EAB308` (vàng); badge dùng foreground đọc được `#854D0E` trên nền vàng nhạt |
| Hiệp Sĩ | `#8B4513` (nâu) |

Việc điều chỉnh foreground Nghĩa Sĩ chỉ sửa contrast của chữ badge; màu khăn/ngữ nghĩa nghiệp vụ `#EAB308` không đổi và không tạo rebrand.

### 2.5 Màu nghiệp vụ Tài chính

| Token | Light | Dark | Mục đích |
| --- | --- | --- | --- |
| `finance-income` | `#15803D` | `#4ADE80` | Khoản thu |
| `finance-expense` | `#DC2626` | `#F87171` | Khoản chi |
| `finance-transfer` | `#0369A1` | `#38BDF8` | Chuyển quỹ |

---

## 3. Component Classes (Dùng Trực Tiếp — Không Tự Dựng Lại)

`src/index.css` là ordered import manifest duy nhất; declarations đầy đủ nằm trong graph `src/styles/design-system/00-tokens.css` đến `70-sidebar.css` — **chỉ dùng các class này, không viết lại pattern thủ công.**

### 3.1 Buttons
- `btn` (base) + `btn-primary` / `btn-secondary` / `btn-danger` / `btn-ghost`
- `btn-sm` (32px) / `btn-lg` (44px)
- `pill-btn` / `pill-btn-primary` / `pill-btn-secondary` / `pill-btn-active` + `pill-group` (segmented control)

### 3.2 Form
- `form-group`, `form-label`, `form-input` (40px, bao gồm date input), `form-select` (40px, bao gồm dropdown chọn lớp), `form-textarea`, `form-input-sm` (pill search 36px), `form-select-sm` / compact select (40px toolbar class picker)
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
- **Quy tắc:** mọi component dùng token sẽ tự thích nghi. **Cấm hardcode** `bg-white`, `text-slate-*`, `bg-white/90`, inline hex màu light-only. Khi cần override dùng `dark:` variants với token dark trong `src/styles/design-system/30-theme-media.css`.

---

## 8. Mobile (PWA/Native)

- **Hai loại shell, một contract chạm:** Workflow mobile-native dùng `.mobile-app-shell` → `.mobile-app-main` → `.mobile-screen` (`max-width: 760px`, gutter token) + `.mobile-screen--stack` (`gap: 14px`, `padding-top: 16px`). Route dùng chung desktop/touch dùng `DesktopAppShell` → `.responsive-page-shell`; đây là primitive khác, không gắn `.mobile-screen` lên cùng node.
- **Responsive `DesktopAppShell`:** dưới `1024px`, `.responsive-page-shell` có `max-width: 760px`, gutter 16px và gap 14px; từ `1024px`, tier được CSS khai báo tường minh: `full` không giới hạn, `wide` 80rem, `narrow` 48rem, gap 24px. `embedded` chỉ dùng `.embedded-page-section`: parent giữ quyền sở hữu gutter/max-width, tránh double padding và cap bề rộng ngoài ý muốn.
- **Responsive Table-to-Card Pattern:** Các trang quản trị phức tạp (`ClassesPage`, `UserManagementPage`, `FinancePage`) triển khai mô hình song song:
  - `block md:hidden`: Mobile Card / List Views (`.entity-card`) với badge trạng thái, phân ngành, thông tin phụ trách và nút hành động touch-friendly (≥44px).
  - `hidden md:block`: Bảng Desktop đầy đủ cột (`.app-panel > .table-wrapper > .table-scroll > table`).
- **Top bar:** `.mobile-top-bar` (gradient brand cố định `#17347f→#2454bf`, ≤767px `#1d3f99→#2c58c7` — giữ nguyên, không phải token).
- **Bottom nav:** `.mobile-bottom-nav` (token-based, tự dark-adapt); action: `.mobile-floating-action`, `.mobile-bottom-action-bar`.
- **Safe area một chủ sở hữu:** `--mobile-nav-total-height` đã gồm `safe-area-inset-bottom`; action bar/FAB chỉ neo phía trên token này, không cộng inset lần nữa. Top bar sở hữu inset trên; khi có `.offline-status-banner`, banner sở hữu inset và top bar/clearance bỏ phần đó để không đếm hai lần.
- **Touch target & Form Controls:** Mọi action control chính trong touch shell có **effective hit-area ≥44×44px** (hoặc 40px cho các form inputs/selects chuẩn: dropdown chọn lớp và ô chọn ngày có chiều cao chuẩn đồng bộ **40px**). Input/select chuẩn hóa cao ≥40px và font-size ≥16px.
- **Modal & Bottom-sheet:** Modal tác vụ dài (ví dụ **Tạo Phiên Chấm**) dùng bottom-sheet ở mobile: tiêu đề/nút đóng và hành động chính sticky, phần nội dung tự cuộn, footer chừa safe area; từ `sm` trở lên quay về modal giữa màn hình. Có hai contract độc lập: lifecycle dùng `ModalShell` / `ConfirmDialog` / `useAccessibleDialog` (focus restore, scroll lock, Escape top-most qua `modalStack`); mọi custom dialog thuộc route **và control sheet có `aria-modal` của shell** mount qua `ModalPortal` ra `document.body` để không bị stacking context của `PageTransition`/`main`/top bar cắt. Dialog lồng dùng `.app-modal-layer--nested`, confirm dùng `.app-confirm-layer`.
- **Horizontal Scrollable Tabs & Charts:** `.view-tabs` và SVG charts trên mobile được bọc container cuộn ngang (`overflow-x-auto scrollbar-none snap-x`) chống co ép thanh biểu đồ hoặc gãy dòng tabs.
- **Cấm** `space-y-*` chồng lên `.mobile-screen--stack` hoặc `.responsive-page-shell` khi cùng sở hữu nhịp dọc — gap 14px đã có, tránh double-spacing.
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
- ✅ Cặp màu chữ/placeholder phải được đo bằng `designSystemTokens.test.ts`; `lint:ds` không đo contrast runtime.
- ❌ Không hex cứng, không `bg-[#...]`, không inline `style={{background/color}}`. (`bg-[var(--color-*)]` **được phép** — token arbitrary hợp lệ.)
- ❌ Không dùng `blue-600` làm CTA (màu chi đoàn Thiếu Nhi).
- ❌ **Không dùng `bg-emerald-600/700`, `bg-rose-600/700`, `bg-amber-600/700`, `bg-sky-600/700`, `bg-green-600/700` trực tiếp trên button** — các class này bỏ qua foreground/background contract đã kiểm chứng của DS (linter rule 6). Dùng `.btn-primary`/`.btn-secondary`/`.btn-danger` hoặc exception có bằng chứng contrast.
- ❌ **Filter/status pill active state không dùng solid 600** — dùng badge domain token: `bg-[var(--color-parish-*-bg)] text-[var(--color-parish-*-hover)] border border-[var(--color-parish-*)]/30` (mapping 2026-08-16).
- ❌ Không tạo class mới ngoài ordered CSS graph — token thuộc `00-tokens.css`, shared primitive thuộc `20-primitives.css`, view language thuộc `60-view-language.css`; mọi thay đổi contract phải cập nhật tài liệu này.
- ❌ Không đụng: `Certificate`/`AnswerSheetModal`/`ExamScanModal` (in ấn + OMR cần contrast riêng), `30-theme-media.css` `@media print`, mobile shell CSS.

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
- `src/styles/design-system/30-theme-media.css` (được chuyển từ monolith khi split v4.5): sở hữu global dark mode reset rules cho `table`, `thead`, `tbody`, `tr`, `td`, `input`, `select`, `textarea`, bảo đảm nền tối `--color-surface-card` và chữ `--color-text-main` nhất quán trên toàn bộ trình duyệt.
- `src/stores/themeStore.ts`: Bổ sung đồng bộ class `.dark` vào `document.documentElement` ngay khi hydrate từ IndexedDB/Dexie và khi toggle theme.
- `AnswerSheetModal`, `ExamScanModal`, `ExamSessionView`: Toàn bộ modal shell, bộ điều khiển, danh sách chọn in và popup đáp án chuẩn chuyển sang Design System v3.1 tokens với Dark Mode hoàn hảo.
- `GradeCellInput`: 100% token-based (`bg-surface-card`, `border-surface-border`, `text-text-main`).

**UX/UI Audit Batch 2026-08-16 (Pha 0 + Pha 2, kế thừa plan `docs/UX_UI_AUDIT_AND_IMPROVEMENT_PLAN_2026-08-16.md`)**:
- Linter mở rộng lên **6 rules**: + `NO_NONEXISTENT_CLASS` (badge-secondary/btn-neutral/custom-scrollbar/bg-surface-main), + `NO_ARBITRARY_HEX` (chỉ `[#hex]`, không chặn `[var(--color-*)]`), + `NO_RAW_600_BUTTON` (emerald/rose/amber/sky/green 600-700 trên button, quét button-context 3 dòng và buộc dùng variant đã kiểm chứng).
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
- **Modal tạo phiên chấm trên desktop**: giữ bottom-sheet một cột và touch target 44px ở mobile; từ desktop breakpoint mở rộng tối đa `max-w-5xl`, dùng lưới 12 cột để đặt Lớp/Hình thức và Import/Thông tin điểm theo cặp, còn đáp án chuẩn chiếm toàn chiều ngang. Khung modal `overflow-hidden`, body là vùng cuộn duy nhất và footer hành động sticky; không nhân đôi form hoặc thay đổi validation/nghiệp vụ tạo phiên.
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

**QuestionBankView Layout & UI Optimization (Hoàn thành 2026-09-02, ADR-096)**:
- **Macro-layout**: Chuẩn hóa `PageHeader` (icon tile + tiêu đề + server badge + quick actions), thanh 4 KPI cards (Tổng số câu hỏi, Đang dùng, Chờ duyệt, Bản nháp) và typed `Tabs` / `TabPanel` (DS §1.9) thay thế các button tab thô.
- **Master-Detail Workspace**: Tái thiết kế bộ lọc mượt mà (debounce search, filter reset, counter), danh sách câu hỏi với line-clamp, highlight câu hỏi đang mở (`surface-selected`, border-primary), thanh tác vụ nổi (Sticky Batch Action Bar) khi chọn câu hỏi sinh đề, và Master-Detail 2 cột (Desktop sticky preview, Mobile/Tablet slide-over modal).
- **Exam Blueprint Builder**: Bổ sung nút xóa dòng quy tắc (`Trash2`), nhãn trường rõ ràng cho số câu & điểm, validator thang điểm 10 thời gian thực, cùng modal kiểm tra cấu trúc ma trận chi tiết.
- **Exam Builder**: Phân nhóm 2 bước rõ ràng (Thông tin kỳ thi & Nguồn câu hỏi), hỗ trợ duyệt danh sách câu hỏi đã chọn thủ công và chuyển nhanh sang tab Chấm bài sau khi tạo đề thành công.
- **Modals**: Chuẩn hóa `QuestionEditorModal` và `QuestionBankImportModal` với 100% token CSS, `FormField` labels đầy đủ, touch target ≥40px, drag & drop tinh tế và 0 lỗi `lint:ds`.

**ExamSessionView Layout & Workspace Standardization (Hoàn thành 2026-09-02, ADR-055, ADR-072)**:
- **Macro-layout**: Chuẩn hóa `PageHeader` (`ClipboardList` tile + tiêu đề + phụ đề lớp/năm học + nút tạo phiên `btn-primary`) và thanh 4 thẻ KPI metrics (Tổng phiên, Đang chấm, Đã hoàn tất, Phiên đang chọn).
- **Mô hình Chuyển đổi Catalog & Workspace (Desktop Full-Width)**:
  - *Catalog View*: Lưới thẻ phiên chấm 3 cột rộng rãi (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), thanh tìm kiếm & bộ lọc trạng thái (Tất cả / Đang chấm / Đã xong), hiển thị đầy đủ thông tin loại điểm, môn, lớp, thang điểm và CTA rõ ràng ("Vào Chấm Điểm" / "Xem Kết Quả").
  - *Workspace View*: Không gian chấm bài chiếm trọn **100% bề rộng toàn màn hình (Full-Width)** khi click chọn phiên, giải phóng tối đa không gian cho bảng điểm 40+ học sinh, có nút quay lại `← Danh sách phiên` và dropdown chuyển nhanh giữa các phiên trên toolbar.
- **Sub-components**: `ExamResultsTable` & `QuickScoreEntry` tuân thủ thead DS §6, tích hợp bộ lọc tìm kiếm theo tên/mã thiếu nhi, lọc nguồn điểm (QR/OMR/Nhập tay) và lọc các em chưa có điểm.
- **Test Contracts & Anti-Drift**: Bảo toàn 100% 13 chuỗi kiểm thử trong `examCreateMobileUiContract.test.ts` và `mobileLayoutContract.test.ts`; 0 lỗi vi phạm `npm run lint:ds`.

**Organization Workspace & Parish Portal Standardization (Hoàn thành 2026-09-02, ADR-072, ADR-081/082)**:
- **OrganizationDashboardPage (Cổng Xứ Đoàn & Giáo Xứ - `/parish`)**:
  - *Hero Căn Tính Xứ Đoàn*: Tên Xứ đoàn & Giáo xứ, huy hiệu Bổn Mạng, Khẩu hiệu châm ngôn ("motto"), ngày thành lập và mô tả truyền thống.
  - *Executive KPI Strip*: 4 thẻ chỉ số tổng quan (Huynh trưởng/GLV đang phục vụ vs tổng số, Đơn vị trực thuộc, Hoạt động & Cột mốc, Tư liệu truyền thống).
  - *Desktop 2-Cột (8/4 Grid)*: Cột trái (8-col) kết nối dữ liệu sống với widget Ban Trị Sự đương nhiệm (trích xuất từ terms/people đang hoạt động), Lịch sự kiện & Phụng vụ đúng cửa sổ 14 ngày lịch địa phương (từ `parishEventStore`), Hoạt động & Cột mốc tiêu biểu; Cột phải (4-col) hiển thị Thông báo điều hành mới nhất (từ `noticeStore`) và Lưới phím tắt Công việc Xứ đoàn tương tác cao cấp. Nếu API lịch lỗi, widget dùng warning semantic để phân biệt cache đã lưu với trạng thái không có dữ liệu; không trình bày cache như dữ liệu live.
  - *Calendar RBAC*: desktop/mobile chỉ render Thêm/Sửa/Xóa sự kiện cho `admin|chunhiem`, khớp server route; `phuta|phuhuynh` giữ trải nghiệm đọc. Ẩn control là UX fail-closed, không thay server authorization.
- **ParishProfilePage (Hồ Sơ Xứ Đoàn - `/parish-profile`)**:
  - *Loại bỏ màu thô*: Chuyển đổi toàn bộ `text-amber-950` sang semantic tokens `text-parish-primary`, banner đồng bộ tài khoản dùng `bg-parish-info-bg border-parish-info/30 text-parish-info`.
  - *Bộ lọc thông minh theo Tab*: Tích hợp tìm kiếm tên/tên thánh và bộ lọc trạng thái (`ACTIVE`, `FORMER`, `DECEASED`) trong Tab Huynh trưởng/GLV; tìm kiếm trong Tab Hoạt động, Lịch sử, Thành tích; tìm kiếm và lọc loại tệp (Ảnh, Video, Tài liệu, Giấy khen) trong Tab Kho tư liệu.
  - *Tư Liệu Trực Quan & Lightbox Gallery*: Tích hợp `ParishAssetLightboxModal` hỗ trợ xem ảnh/poster thu nhỏ (thumbnail) và phóng to toàn màn hình với tải xuống an toàn.
  - *Sơ Đồ Phân Cấp Cơ Cấu Tổ Chức*: Tích hợp `ParishOrgChart` với nút chuyển đổi Dạng thẻ / Sơ đồ phân cấp 3 tầng (Ban Trị Sự ➔ Ban Chuyên Môn ➔ Ngành & Chi đoàn).
  - *Chi Tiết Hồ Sơ Huynh Trưởng*: Tích hợp `ParishPersonDetailModal` hiển thị toàn diện tiểu sử, dòng thời gian các nhiệm kỳ và sự kiện liên quan khi bấm vào thẻ nhân sự.
  - *Nhập Danh Sách Hàng Loạt*: Tích hợp `ParishBulkImportModal` hỗ trợ dán dữ liệu Excel/CSV với bản xem trước kiểm tra tính hợp lệ trước khi lưu.
- **Anti-Drift & Contracts**: Đạt 0 lỗi vi phạm `lint:ds` trên 127 TSX files; bảo đảm 100% test contract trong `ParishProfilePage.test.tsx` và `parishProfile.test.ts`.

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
| `full` | `.responsive-page-shell--full` | Data workspace; touch vẫn bị giới hạn 760px, desktop từ 1024px không cap bề rộng. |
| `wide` | `.responsive-page-shell--wide` | Directory/admin nhiều cột; touch là 760px, desktop là 80rem (1280px) và canh giữa. |
| `narrow` | `.responsive-page-shell--narrow` | Form/summary cần nhịp đọc hẹp; touch là 760px, desktop là 48rem (768px) và canh giữa. |

`DesktopAppShell` là owner duy nhất của ba tier trên. Child render bên trong `/management` hoặc shell cha truyền `embedded`; `.embedded-page-section` chỉ tạo column/gap, không tạo thêm gutter hay max-width.

### Lưới lớp trong `Danh Sách & Lớp` (ADR-090 amendment 2026-09-02, tối ưu hóa 2026-09-03)

- Giữ phong cách tối giản, tĩnh lặng (Calm, Confident, Crafted): không chèn card KPI trùng lặp với Trang Tổng Quan, không dùng toolbar phụ gây rườm rà.
- Bố cục lưới responsive: 2 cột trên touch, 3 cột desktop thường và 4 cột tại `xl`; cấu trúc `h-full flex flex-col justify-between` đảm bảo tất cả thẻ trong cùng một hàng có chiều cao đều tăm tắp, nút "Xem danh sách" căn đáy đồng bộ.
- Thẻ giữ badge ngành, mã lớp, phòng học, vạch accent màu khăn ngành TNTT 1px tinh tế ở mép trên; sắc độ trong suốt dùng CSS `color-mix(...)` để cả mã hex lẫn semantic fallback đều hợp lệ.
- Phân công Huynh Trưởng: hiển thị Huynh Trưởng chủ nhiệm, số lượng phụ tá `(+N)` tinh tế, và hiển thị rõ trạng thái `Chưa phân công` khi lớp chưa có người phụ trách.
- Toàn vùng nội dung là button accessible `Xem danh sách lớp {name}`; icon-button edit/delete là các action độc lập có `e.stopPropagation()` và chỉ hiển thị cho admin.
- Chọn lớp chuyển cùng surface sang roster; nút quay lại `Tất cả lớp` trả về lưới. Empty state và dark mode dùng semantic surface/text tokens.

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

**Sidebar spec (`src/styles/design-system/70-sidebar.css`):**
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
5. Z-index dùng token `--z-*` (xem `src/styles/design-system/40-mobile-shell.css`), không hard-code z mới.

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
- Desktop shell: `.app-header*`, `.app-main-content`, `.app-page-loader*`; `.app-header__mark` là logo nhận diện 60px, nền trắng đục, luôn dùng `object-fit: contain`.
- Mobile home: `.mobile-home-hero`, `.mobile-quick-action*`,
  `.mobile-stat-card*`, `.mobile-content-card`.
- Motion: `--motion-fast|standard|slow` + `--motion-ease-out`; luôn tôn trọng
  `prefers-reduced-motion`.
- Route motion: `PageTransition` là boundary duy nhất; `router.defaultViewTransition`
  chỉ chạy khi **pathname thay đổi**, không chạy lại khi đổi search/filter. Shell
  (header/sidebar/bottom nav) đứng yên; `app-page` fade-through + dịch dọc tối đa
  6px, 120–260ms. Trình duyệt thiếu `document.startViewTransition` dùng
  `.route-transition-frame--fallback`; reduced-motion tắt animation và smooth scroll.
- Route readiness (ADR-080): route component dùng `lazyWithRetry` phải giữ
  `.preload()` để TanStack thực sự tải chunk trước navigation. Mobile primary routes
  được làm ấm **tuần tự** theo role khi browser idle; bottom-nav pointer/focus khởi
  động preload còn thiếu và pending highlight phản hồi ngay. Không preload đồng loạt
  mọi route, không replay motion cho search/filter, không đổi `aria-current` trước URL commit.
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
- Phone modal (≤767px) chuẩn chuyển thành bottom sheet; tablet giữ bề rộng dialog phù hợp. Mọi custom dialog/control sheet có `aria-modal` dùng `ModalShell`, `ConfirmDialog` hoặc lifecycle tương đương (`useAccessibleDialog` khi phù hợp) để giữ focus trap/restore, top-most Escape, `aria-modal` và scroll lock; overlay render trong route hoặc shell phải được mount bởi `ModalPortal` ra `document.body`.
- Chỉ một `#main-content`; owner mobile là `MobileAppShell`, owner desktop là
  `RootLayout`.
- Không tự gắn entrance animation ở từng `.product-view`; page-level motion chỉ
  thuộc `PageTransition` để tránh double animation và visual drift.

### Deliberate exceptions

Gradient navy–gold ở brand shell, domain/status color, print/certificate layout,
camera/OMR guide và medal visualization vẫn được phép khi có semantic purpose.
Mọi exception mới phải được ghi tại đây hoặc ADR liên quan, không tạo visual
dialect riêng ở từng page.

Quy định về Pinch/Double-tap Zoom (Đã cập nhật sau Audit UX/UI v4.6):
Trước đây, hệ thống áp dụng khóa pinch-zoom tại `index.html` và một JS gesture guard toàn cục. Theo ADR-109, `maximum-scale=1.0, user-scalable=no` không còn trong viewport meta, `zoomGuard` đã được gỡ khỏi bootstrap, và Axe không còn miễn rule `meta-viewport`. Vì vậy trình duyệt/WebView được quyền cung cấp zoom tự nhiên; kiểm tra automated này vẫn không thay thế manual 200% reflow và thiết bị thật.

---

## 15. Mobile Product UX/UI System (Cập nhật 2026-08-29)

### 15.1 Tokens Mở Rộng
- **Radius**: `--radius-nav: 14px` (bottom-nav items, sheet triggers), `--radius-sheet-lg: 18px` (control sheets, brand page headers), `--radius-hero: 22px` (hero cards).
- **Z-Index Ladder**:
  `--z-install-prompt: 30` < `--z-sticky-filter: 30` < `--z-header: 40` < `--z-bottom-action: 850` < `--z-floating-action: 900` < `--z-top-bar: 950` < `--z-mobile-nav: 1000` < `--z-modal: 1100` < `.app-modal-layer--nested: 1101` < `.app-confirm-layer: 1110` < `--z-toast: 9999`.
- **Motion**: Thống nhất dùng `--motion-standard: 180ms` và `--motion-fast: 120ms` cho toàn bộ micro-interactions mobile.

### 15.2 Mobile Component Primitives
- `.sheet-grabber`: Visual drag handle (Apple HIG & Material Design 3) cho tất cả bottom sheets (`width: 36px; height: 5px; border-radius: var(--radius-full); margin: 0 auto 12px;`).
- `.mobile-top-bar`: Khai báo duy nhất với `z-index: var(--z-top-bar)`, dynamic clearance token `--mobile-topbar-clearance`, logo mark nền trắng 52px (48px ở viewport ≤380px), loại bỏ xung đột giữa desktop và mobile media queries.
- `.mobile-filter-panel`: Tối ưu hiệu năng cuộn trên mobile bằng việc loại bỏ `backdrop-filter: blur(12px)` trên sticky panel trong scroll area, sử dụng 97% surface-card background.

### 15.3 Dark Mode Overrides cho Mobile Brand Components
- `.dark .mobile-home-hero`: Gradient xanh navy trầm + shadow tối phù hợp dark background.
- `.dark .mobile-top-bar`: Gradient navy-dark thích ứng, tăng độ tương phản của brand mark và sheet trigger.
- `.dark .mobile-page-header--brand`: Gradient tối đồng bộ với hệ thống.
- Dark shadows: `.mobile-floating-action`, `.mobile-bottom-nav`, `.mobile-bottom-action-bar` chuyển sang shadow tối (`rgba(0, 0, 0, 0.3-0.5)`).

### 15.4 Mobile Ergonomics & Accessibility
- Universal Touch Targets: Tất cả search inputs, action buttons (In Phiếu, Sửa, Xóa), filter pills, select dropdowns (`pageSize`, `reportType`, `selectedClass`) trong mobile/tablet shell đều đạt kích thước vùng chạm chuẩn tối thiểu 44×44px (`min-h-[44px]` / `min-w-[44px]`).
- Keyboard Ergonomics: Toàn bộ search inputs trên mobile khai báo tường minh `inputMode="search"`. Numeric inputs (điểm số) khai báo `inputMode="decimal"`.
- Zero-CLS Loading Skeletons: Thay thế toàn bộ raw text / spinner fallback ("Đang tải...") trong Suspense và async queries bằng `<SkeletonCardGrid>` và `<SkeletonTable>` từ `StateFeedback`, bảo toàn layout container và triệt tiêu Layout Shift (CLS).
- Accessible Inline Form Validation: Các modal biểu mẫu (`StudentModal`, `LeaveRequestModal`) áp dụng validation inline trên sự kiện `onBlur` và `onSubmit`, sử dụng Design System v4.5 semantic tokens (`border-parish-danger`, `text-parish-danger`, `focus:ring-parish-danger`), liên kết ngữ nghĩa bằng `aria-invalid="true"`, `aria-describedby` và thông báo lỗi có `role="alert"`.
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
| **Tên Thánh (Holy Name)** | Tôn nghiêm Kitô giáo, Tên quan thầy bảo trợ | `text-amber-950 dark:text-amber-400` (`#451a03` / Amber 950 — nâu sẫm đậm trang nghiêm), `font-semibold` (weight 600) | `.student-holy-name` | *Phêrô*, *Maria*, *Giuse*, *Têrêsa* |
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

---

## 18. Mobile Grade Workspace Primitives (v4.2 / ADR-074)

Để giải quyết vấn đề chiếm dụng chiều dọc (vertical real estate) và phân tán nút thao tác trong các chế độ xem điểm ở mobile mode (`MobileGradeBoard`, `MobileDailyGradeEntry`, `MobileGradeComparison`, `ExamSessionView`), Design System cung cấp bộ primitive chuyên dụng:

1. **Command Deck (`.grade-command-deck`):**
   - Hộp điều khiển tích hợp 2 vùng (Header + Action Toolbar) gom nhóm tiêu đề, metadata lớp/năm học, cụm badge trạng thái đồng bộ (`☁ pending` / `✓ Đã lưu`) và chế độ sửa (`Sửa` / `Xem`).
   - `.grade-command-deck__header`: Hàng đầu gồm `.grade-command-deck__title-group` (icon tile 32×32px, tiêu đề 14px font-black, subtitle 11px) và `.grade-command-deck__status-cluster`.
2. **Action Toolbar (`.grade-toolbar-row` & `.grade-action-group`):**
   - Phân cụm các nút thao tác thành 2 nhóm rõ ràng (Nhóm hiển thị bên trái & Tiện ích Excel bên phải), chống tràn ngang trên các thiết bị màn hình nhỏ (320px–390px).
   - `.grade-action-btn`: Nút bấm thanh công cụ phụ siêu gọn (visual height **26px**, đệm ngang hẹp **`padding: 0 6px`**, khoảng cách `gap: 3px`, nhãn súc tích `Thu/Mở`, `Xuất`, `Nhập`), viền bo ôm khít chữ và icon 12px, đảm bảo vùng chạm $\ge 44\text{px}$ qua pseudo hit-area.
3. **Segmented Control Group (`.grade-segmented-group` & `.grade-segmented-item`):**
   - Thanh chọn tab/loại điểm dạng viên thuốc liền khối (pill bar) ôm sát màn hình mobile, chiều cao trực quan **36px** (thuộc dải 35px–38px), có counter badge `.count-badge` với `tabular-nums`.
4. **Metric Strip (`.grade-metric-strip`):**
   - Băng số liệu 1 hàng siêu gọn (`--3col` hoặc `--4col`) thay thế các card thống kê 2x2 đồ sộ, tiết kiệm >60% chiều cao màn hình trước khi hiển thị danh sách thiếu nhi.
5. **Tiered Action Cluster (trong Exam Grading Session):**
   - Phân tầng thao tác chấm điểm:
     - Tier 1 (Primary CTAs): Nút chấm ổn định + Quét QR OMR chiếm vị trí nổi bật 2 cột.
     - Tier 2 (Utility Actions): Các nút chức năng phụ (Mã đề, Chấm nhiều ảnh, Phân tích, In ấn) xếp gọn gàng trong lưới responsive.
6. **Phân định Khả năng Thao tác Mobile vs Desktop (RBAC Partitioning - ADR-075):**
   - Giao diện Mobile tối ưu hoàn toàn cho tra cứu và chấm điểm nhanh; không render nút Cấu hình hệ số (`GradeFormulaConfigModal`) hay Chế độ ghi đè điểm (`isOverrideModeEnabled`).
   - Thao tác điều chỉnh hệ số điểm và ghi đè điểm thành phần học kỳ là đặc quyền cho vai trò **Admin** trên **Desktop Mode** (`DesktopGradeMatrix.tsx`).
7. **Thu Gọn Thanh Thao Tác & Icon Mở Rộng Thẻ Cá Nhân (ADR-076):**
   - Loại bỏ nút `[Thu/Mở]` toàn cục trên thanh công cụ; tích hợp trực tiếp `[Xuất]` và `[Nhập]` vào `.grade-command-deck__header`, giải phóng hoàn toàn hàng toolbar thứ hai.
   - Mỗi thẻ học sinh (`MobileGradeBoard`, `MobileGradeMatrix`) trang bị icon `ChevronDown` 16px ở góc phải tiêu đề với animation xoay 180° mượt mà (`transition-transform duration-200`) để thu/mở độc lập từng học sinh.
8. **Phân Định In Đề vs Xem Đề Thi Mobile (Exam Paper Preview Partitioning - ADR-076):**
   - **Mobile Mode**: Thiết bị di động không kết nối máy in văn phòng; nút thao tác trên `ExamSessionView` hiển thị nhãn **`[Xem Đề Thi]`** (`<Eye size={14} />`). Modal `ExamPaperModal` mang tiêu đề *"Xem Đề Thi & Tài Liệu"*, ẩn các nút In trực tiếp (`handlePrint`) và xuất Word/Excel/HTML, trang bị chế độ Đọc Đề di động (`question_reader`) và chế độ Xem bản in A4 chuẩn với nút Tải PDF về máy.
   - **Desktop Mode**: Đầy đủ trung tâm in ấn và xuất bản đa định dạng (**`[In Đề & Phiếu]`**, Word, Excel, PDF vector, HTML độc lập).
9. **Chuẩn Hóa Portal Mounting & Z-Index Layering Cho Modal Mobile (ADR-076):**
   - **React Portal Root Mount**: Toàn bộ các modal kích thước lớn hoặc toàn màn hình trên mobile (`ExamPaperModal`) bắt buộc phải mount trực tiếp ra `document.body` thông qua `React.createPortal(modalContent, document.body)` nhằm triệt tiêu hoàn toàn hiện tượng Stacking Context con bị giới hạn bởi `<main>` hoặc `<PageTransition>`.
   - **Hệ thống Phân tầng Z-Index Bất Biến**:
     $$\text{--z-header: 40} < \text{--z-bottom-action: 850} < \text{--z-floating-action: 900} < \text{--z-top-bar: 950} < \text{--z-mobile-nav: 1000} < \mathbf{\text{--z-modal: 1100}} < \text{--z-toast: 9999}$$
     Bảo đảm khi mở Modal trên Mobile, `MobileTopBar` và `MobileBottomNav` sẽ bị che phủ 100% bên dưới backdrop, không bao giờ đè lên thanh tiêu đề hay các nút điều hướng của Modal.
10. **Trải Nghiệm Xem Đề Đa Chế Độ Trên Mobile (Mobile Dual-Preview Engine - ADR-076):**
    - **Tab `📖 Đọc Đề` (Native Mobile Reader)**: Trình đọc thẻ câu hỏi chuyên dụng cho điện thoại. Hiển thị điểm số, badge Tự luận/Trắc nghiệm, 4 thẻ phương án A/B/C/D rõ nét với khả năng highlight đáp án đúng (xanh lá) và hộp giải thích chi tiết (`💡 Lời giải`) khi bật Hiện Đáp Án.
    - **Tab `📄 Đề A4` & `📋 Phiếu A4` (Vector Print Preview)**: Giữ nguyên tỷ lệ 210mm A4 chuẩn (`min-width: 210mm`), hỗ trợ 2 chế độ xem: 📱 *Vừa màn hình* (tự động tính toán scale factor để trang A4 khớp 100% chiều rộng điện thoại mà không bị vỡ cột/bẻ dòng chữ) và 🔍 *100% A4* (tỷ lệ gốc chuẩn pixel cho phép vuốt ngang/dọc kiểm tra chi tiết khung OMR).

---

## 19. Accessibility Hard Gates & Audit Claim Contract (v4.4 / ADR-078)

1. `--color-text-placeholder` phải đạt tối thiểu 4.5:1 trên toàn bộ `surface-card|raised|sunken|hover|app` ở cả light và dark. Giá trị hiện tại có worst-case lần lượt **4.66:1** và **4.75:1**; `::placeholder` dùng `opacity: 1` để phép đo token không bị user-agent làm giảm.
2. Brand placeholder dùng riêng `--color-text-placeholder-on-brand`; navy control sheet phải đủ đục để contrast không phụ thuộc vào nội dung page phía sau. Worst-case tự động hiện tại ≥5.43:1 trên gradient và ≥12.23:1 trên control sheet.
3. Brand focus dùng outline 3px `--color-focus-ring-brand` với offset 2px, scope tại `.app-header`, `.mobile-top-bar`, `.mobile-control-sheet`; contrast thấp nhất giữa các gradient stop là **6.70:1**.
4. Từ v4.5, `npm run lint:ds` thực thi **8 static anti-drift rules** trên TSX không miễn trừ: 6 prohibition rules và 2 per-file debt ratchets. `0 violations` không đồng nghĩa toàn bộ component đã được quan sát runtime hoặc chứng nhận WCAG/visual conformance.
5. Hard gate gồm token/graph/linter unit contracts và Playwright axe/layout matrix ở §20. Thẻ viewport tại `index.html` đã được chuẩn hóa để tuân thủ WCAG 2.1 SC 1.4.4 (bỏ `maximum-scale=1.0, user-scalable=no`).

---

## 20. Semantic Primitives, CSS Graph & Verification Governance (v4.5 / ADR-079)

### 20.1 Typed React primitives

`src/components/common/ui/` là semantic layer mỏng trên class contract hiện hữu; không phải framework UI thứ hai:

- `Button`/`IconButton`: `forwardRef`, mặc định `type="button"`, loading có `aria-busy`; icon-only bắt buộc có accessible label.
- `TextInput`/`Select`/`TextArea` + `FormField`: mapping form class, invalid state và nối `aria-describedby` của caller với hint/error thay vì ghi đè.
- `Tabs`/`TabPanel`: `tablist → tab → tabpanel`, ID/controls/labelledby khớp nhau, roving ArrowLeft/ArrowRight/Home/End và bỏ qua disabled item. Panel active tồn tại bên ngoài `Suspense` fallback để ARIA reference không mất trong lúc lazy chunk tải.
- `SegmentedControl`: single selection qua `radiogroup/radio`; `FilterChips`: filter qua button `aria-pressed`, không giả làm content tab.
- `Badge` và `Surface`: chỉ map presentation tone/surface; không tự nhúng business-status mapping.

Batch v4.5 áp dụng cho shared modal/state, hai cổng auth, Dashboard, Students, Management, Attendance, Grades và Finance. Domain selector điểm danh, print/A4, camera/OMR và business calculations giữ contract riêng.

### 20.2 CSS graph có thứ tự

`src/index.css` sở hữu duy nhất Tailwind import, `@source`, dark custom variant và import manifest sau:

1. `00-tokens.css`
2. `10-foundations.css`
3. `20-primitives.css`
4. `30-theme-media.css`
5. `40-mobile-shell.css`
6. `50-app-shell.css`
7. `60-view-language.css`
8. `70-sidebar.css`

Không dùng `@layer`, không import module từ component và không đảo cascade. `designSystemCssGraph.test.ts` khóa order, reachability, duplicate/cycle/orphan, ownership của `@source`/dark variant và cấm `transition: all`. Test đọc CSS phải dùng helper mở rộng relative-import graph thay vì giả định mọi declaration nằm vật lý trong entrypoint. Tại điểm tách thuần túy, production CSS trước/sau cùng **212,171 bytes** và SHA-256 `09AD1BB6179D178887D5E5E3502363FE1D57C45597BDA048D5B925EC4A561CEB`; các accessibility fix sau đó được kiểm thử như thay đổi có chủ đích.

### 20.3 Anti-drift ratchets

Hai debt hiện hữu chưa thể global-ban được khóa theo file tại `scripts/design-system-debt-baseline.json`:

- `text-[Npx]`: 287 occurrences / 58 files.
- `transition-all`: 55 occurrences / 23 files.

Mỗi file chỉ được giữ nguyên hoặc giảm; file mới/missing baseline có ceiling bằng 0. Baseline chỉ được viết lại có chủ đích bằng `npm run lint:ds -- --write-debt-baseline` sau khi xác nhận mức debt mới thấp hơn hoặc bằng mức đã duyệt.

### 20.4 Runtime evidence và claim boundary

- Axe gate dùng `@axe-core/playwright` với tags `wcag2a|wcag2aa|wcag21aa|wcag22aa`: 7 protected routes đại diện (`/dashboard|/students|/attendance|/grades|/finances|/parish|/parish-profile`) × 3 viewport (`1440×900`, `390×844`, `320×720`) × light/dark = **42 observations**; 4 public routes (`/login`, `/login/nhan-su`, `/login/phuhuynh`, `/verify`) × 3 × 2 = **24**; modal quên mật khẩu phụ huynh × 3 × 2 = **6**; modal tạo bản ghi Xứ đoàn × 3 × 2 = **6**. Tổng cộng **78 automated Axe observations**.
- Visual layout gate dùng cùng ma trận **42 protected + 24 public + 6 forgot-modal + 6 parish-record-modal = 78 observations**; assert document/body/main không horizontal overflow, token hiện diện, modal Xứ đoàn có `.form-group` dọc không chồng label/control, và đính kèm full-page PNG làm evidence artifact. PNG là bằng chứng quan sát, **không phải** pixel-diff baseline. Một test tương tác riêng đi qua đủ năm đích mobile bottom-nav chính và kiểm tra URL + `aria-current`.
- Protected matrix điều hướng qua sidebar SPA thật trước khi resize, xác nhận canonical URL/active nav/shared shell, rồi đợi lazy route và primary data readiness. Cách này tránh tạo refresh-token rotation race giả do reload lặp lại trong cùng một ma trận authenticated.
- Harness Playwright chạy trên cặp cổng riêng `3100/3101`, DB SQLite tạm cô lập dưới OS temp, vô hiệu server `.env`, và chỉ phát stdout `READY` sau khi Vite + API + seed hoàn tất. Vì vậy E2E không reuse hay chiếm phiên dev `3000/3001`.
- Remediation từ runtime gate: token success/info/muted và finance foreground được tăng contrast; nhãn ô điểm cuối kỳ dùng `text-primary` trên nền highlight ở mobile/desktop; public auth/forgot/verify dùng semantic foreground/control; `ParentForgotPasswordModal` dùng portal + accessible typed controls; `PageHeader` ở dưới `1024px` reset flex-basis của identity/actions để không kế thừa khoảng trắng dọc từ desktop; `vite.optimizeDeps.include` bỏ hai entry stale `tailwind-merge`/`jspdf`.
- Dark mobile bottom-nav active background dùng primary mix 12% để label 10px vượt axe contrast gate. Motion CSS chỉ transition properties thực sự thay đổi.
- Inactive mobile bottom-nav dùng `--color-text-secondary` thay vì muted để nhãn 9px ở compact vẫn đạt contrast trên nền navigation/active-transition; runtime audit phải chờ finite UI animations kết thúc trước khi đo màu trạng thái ổn định.
- Native View Transition giữ nguyên pathname-only contract. Wrapper trong `router.tsx` chỉ consume rejection lifecycle dự kiến `AbortError|InvalidStateError|TimeoutError` ở `ready`/`finished` khi điều hướng SPA nhanh thay thế transition đang chạy; `updateCallbackDone` không bị bắt để lỗi render/domain vẫn nổi lên.
- Axe tự động chỉ phủ một tập con WCAG. Thẻ viewport tại `index.html` đã được chuẩn hóa để tuân thủ WCAG 2.1 SC 1.4.4 (bỏ `maximum-scale=1.0, user-scalable=no`). Runtime protected hiện chỉ là 7 route đại diện, không phải toàn bộ protected routes hay mọi role. Full WCAG audit, physical-device, screen-reader và task acceptance vẫn là manual release evidence.

### 20.5 Verification record

- Baseline `npm run verify:ci` trước Organization remediation: **PASS** — lint zero-warning, 8-rule design-system guard, client/server TypeScript, Vite/PWA production build và serialized coverage suite.
- Baseline Vitest trước Organization remediation: **260/260 files, 1,836/1,836 tests PASS**. Coverage tổng: statements **70.64%**, branches **59.94%**, functions **64.51%**, lines **72.88%**.
- Semantic/CSS/mobile targeted regression: **12 files / 72 tests PASS**; legacy tab contract được nâng sang `role="tab"`/`aria-selected` và file hồi quy liên quan **11/11 tests PASS**.
- Full Playwright baseline trước khi thêm Organization matrix: **61/61 tests chạy PASS**, **1 offline tenant-reload test được skip có chủ đích**; gồm Axe **60/60 observations**, visual/layout **60/60 observations**, mobile-bottom-nav, role, tenant isolation và attendance save. Không còn unhandled View Transition log. CI lưu `playwright-report/` và `test-results/` trong artifact `playwright-runtime-evidence` 7 ngày, kể cả khi job fail.
- Organization remediation gate 2026-08-31: **41/41 Playwright tests PASS** trong nhóm Axe + visual/layout + CRUD + role. Axe **78/78 observations** và visual/layout **78/78 observations** bao gồm `/parish`, `/parish-profile` và modal bản ghi ở desktop/390/320, light/dark; finite animations được chờ hoàn tất trước khi đo contrast trạng thái ổn định.
- Final serialized `npm run verify:ci` 2026-08-31: **PASS** — lint zero-warning; `lint:ds` **0/115**; client/server TypeScript + Vite/PWA build; Vitest **264/264 files, 1,864/1,864 tests PASS**. Coverage: statements **69.44%**, branches **59.59%**, functions **61.96%**, lines **71.79%**.
- ADR-098 activity-cache hardening 2026-09-02: focused **5 files / 26 tests PASS**; final serialized Vitest **295 files / 2,008 tests PASS**; frontend production/PWA build, server TypeScript, oxlint, `lint:ds` **0/127** và diff check PASS. Đây là static/unit/build evidence; chưa thay thế real-device/account-switch/screen-reader gate.
- UX/UI Comprehensive Audit Waves 1–4 (2026-09-04): Hoàn tất 4 đợt nâng cấp chất lượng giao diện & công thái học toàn diện:
  - **Đợt 1 (Error Prevention & Forms)**: Loại bỏ giá trị mặc định giả định trong `StudentModal` (bỏ "Maria", "Nữ", "2016-01-01"), thêm inline error validation + `aria-invalid` cho `QuickScoreEntry`, loại bỏ dropdown bộ lọc trùng lặp cạnh tranh tại HeaderBar.
  - **Đợt 2 (Deep Linking & Navigation Context)**: Đồng bộ sub-view/tabs/filter 2 chiều với URL SearchParams (`/grades?view=`, `/attendance?tab=&date=&type=`), loại bỏ search placeholder mồ côi tại HeaderBar và Parent portal.
  - **Đợt 3 (Accessibility & Feedback System)**: Khôi phục pinch-to-zoom (WCAG 2.1 SC 1.4.4) tại `index.html`, Zero-CLS SkeletonTable & SkeletonCardGrid cho Lazy Pages, cải thiện phản hồi tải báo cáo tài chính/học vụ (Toast + Loading progress spinner).
  - **Đợt 4 (Mobile Ergonomics & Accessible Form Validation)**: Chuẩn hóa kích thước vùng chạm tối thiểu 44×44px trên toàn bộ mobile views (`MobileStudentsView`, `MobileAttendanceSummaryView`, `MobileReportsView`, `MobileLeaveRequests`), dọn dẹp typography arbitrary (`text-[10px]`, `text-[11px]`), hoàn thiện inline form error state với DS v4.5 semantic tokens trong `StudentModal` và `LeaveRequestModal`.
  - Targeted unit & regression suites: **9 files / 37 tests PASS**; static lint, DS anti-drift và production build đạt 100% tiêu chuẩn chất lượng.

---

## 21. Workspace navigation contract (ADR-082)

- Catevia giữ một brand/header và navy–gold token system; workspace không được tạo theme hoặc app shell riêng.
- Nhân sự có hai workspace: `Thiếu nhi & Học vụ` và `Xứ đoàn & Giáo xứ`. Desktop switcher nằm đầu sidebar (`.sidebar-workspace`); mobile switcher nằm trong control sheet (`.mobile-workspace-switcher`). Control sheet được tinh gọn, tối ưu hóa (loại bỏ bộ lọc lớp, thanh tìm kiếm, chuyển đổi học kỳ và nút desktop mode; tổ chức theo Profile Header, Workspace Segmented Switcher, Quick Utility Tiles Grid ☀️/🩺/🔄/📲 và Settings/Logout).
- Sidebar chỉ hiển thị navigation của workspace hiện hành. Bộ lọc phân ngành/lớp ở desktop chỉ render khi `activeWorkspace="academic"`; Organization không được kế thừa academic filters. Parent Portal không thấy switcher quản trị.
- Navigation label mới dùng sentence case nhất quán (`Tổng quan Xứ đoàn`, `Hồ sơ Xứ đoàn`, `Quỹ & thu chi`, `Giáo lý viên`, `Cài đặt`); section label viết hoa vẫn là exception phân cấp thị giác có chủ đích.
- `/parish` dùng `DesktopAppShell width="wide"`, `PageHeader`, `Surface`; `/parish-profile` dùng shared `Tabs/TabPanel`, entity cards, states và modal primitives. Field trong modal dùng `.form-group → .form-label + control` để giữ label/control theo cột ở 320px; tab rail được cuộn ngang trên màn nhỏ, không tăng primary bottom-nav item.
- Secondary mobile route không có `mobileTab` thì bottom nav được ẩn và shell tự bỏ clearance; control sheet là đường quay/chuyển workspace. Dark mode, reduced motion, focus-visible và modal accessibility giữ contract chung.

---

## 22. Native biometric lock surface (ADR-085)

- Lock screen dùng lại navy–gold auth surface, logo Catevia, semantic `main/section/h1`, live status và control tối thiểu 44px; không tạo visual language riêng cho native.
- Primary action nêu đúng capability do OS báo (`Face ID`, `Touch ID`, nhận diện khuôn mặt, dấu vân tay). Không khẳng định một modality cụ thể khi Android chỉ trả capability tổng hợp.
- Error là `role="alert"`; trạng thái xác minh là `role="status"`. Nút mở khóa có loading label; nút recovery luôn mô tả hậu quả “Đăng xuất và dùng mật khẩu”.
- Setting dùng switch có `role="switch"`, `aria-checked`, disabled khi OS báo unavailable và giải thích lý do. Tắt khóa cũng yêu cầu xác minh.
- Web/PWA hiển thị trạng thái không khả dụng trong Settings, không mô phỏng biometric hoặc hiển thị control có vẻ hoạt động.
