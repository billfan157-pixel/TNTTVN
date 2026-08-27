# 🎨 Brave Davinci — Design System
**Phiên bản:** 3.2 (Calm 2026 — Phase 0 Foundation)
**Tác giả:** TNTT Design Team (Manus → Muse Spark)
**Trạng thái:** ✅ Current (2026-08-27) — đồng bộ 100% với `src/index.css` `@theme`
**Tham chiếu:** `src/index.css` là SSOT token; file này là diễn giải. Drift trước v3.1 đã đóng (Phase 0).

> **Triết lý Phase 0:** *Glass chỉ shell, card solid* — tôn nghiêm, không lòe. Motion êm, touch đủ 44px, table data-dense.

---

## 1. Triết Lý Thiết Kế (v3.2 Calm)

- **Glass 2.0 chỉ shell (Header / BottomNav / ControlSheet):** `backdrop-blur 16-18px + saturate 140-145% + border-white/15 + shadow 0_8px_26px rgba(15,23,42,0.1)`. **Không** áp card/bảng dữ liệu — card giữ `surface-card #FFFFFF + shadow-card` solid để đọc rõ, không mờ.
- **Quiet Luxury:** Whitespace là công cụ, typography làm hierarchy, chỉ 1 accent `parish-primary #1E3A8A` + `amber` pastoral. Không pastel neon.
- **Data-Dense Readability:** Cột có `colgroup` rõ (`w-[60]/[120]/[240]`), `tabular-nums` cho điểm/tiền, sticky header.
- **Mobile-First & Offline Calm:** Touch ≥44px (WCAG 2.5.8), sheet có handle, sync indicator muted không banner đỏ.
- **AI as Infrastructure:** Không banner “AI”, chỉ inline assist muted.

**So với v2.0 (glass toàn app `bg-white/90 backdrop-blur-sm`):** v3.2 ghi rõ phân biệt shell vs card — là *code-truth* từ `src/index.css:48` (`--color-surface-card:#FFFFFF` solid).

---

## 2. Tokens — `@theme` trong `src/index.css:12-118`

### 2.1 Brand & Semantic

| Token | Hex | Dùng |
|---|---|---|
| `--color-parish-primary` | `#1E3A8A` | CTA, tab active, focus ring |
| `--color-parish-primary-hover` | `#1E40AF` | Hover |
| `--color-parish-primary-light` | `#EFF6FF` | Selected bg, badge-primary |
| `--color-parish-success` | `#16A34A` / bg `#DCFCE7` | Lưu, Giỏi |
| `--color-parish-warning` | `#EA580C` / bg `#FFEDD5` | Cần lưu ý, vắng có phép |
| `--color-parish-danger` | `#DC2626` / bg `#FEE2E2` | Xóa, vắng không phép |
| `--color-parish-info` | `#0284C7` / bg `#E0F2FE` | Info, syncing |

### 2.2 Branch (TNTT)

`ChienCon #EC4899`, `AuNhi #16A34A`, `ThieuNhi #2563EB`, `NghiaSi #EAB308`, `HiepSi #8B4513` — chỉ badge/indicator, không CTA (tránh trùng Thiếu Nhi `#2563EB`).

### 2.3 Surface & Text

`surface-card #FFFFFF`, `surface-hover #F1F5F9`, `surface-border #E2E8F0`, `surface-app #F8FAFC`; `text-main #0F172A`, `text-muted #64748B`, `text-secondary #475569`; `border-input #CBD5E1`. Dark: `surface-card #1E293B`, `surface-app #0F172A`.

### 2.4 Shadows & Radii

`shadow-card 0 1px 2px rgba(0,0,0,0.05)`, `card-hover 0 4px 6px`, `modal 0 10px 15px`, `radius-sm 8px / md 12px / lg 16px / xl 20px / full 9999px`.

### 2.5 Motion (Phase 0 mới)

`--motion-ease-out: cubic-bezier(0.23,1,0.32,1)`, `--motion-duration: 160ms`, `--glass-blur: 16px`, `--glass-border: rgba(255,255,255,0.15)`. Đồng nhất header/bottomNav/sheet. Tôn trọng `prefers-reduced-motion`.

### 2.6 Z-Index Ladder

`--z-install-prompt 30` < `--z-secondary-toolbar 39` < `--z-header 40` < `--z-mobile-nav 1000` < `--z-modal 1100` < `--z-toast 9999`.

### 2.7 Focus & Scroll

`--color-focus-ring rgba(30,58,138,0.35)` — double ring `0 0 0 2px white, 0 0 0 4px parish-primary` ở Sprint 1. `html { scroll-padding-top: calc(var(--app-bar-height)+16px) }` cho Focus Not Obscured 2.4.11.

---

## 3. Glass Quy Ước (v3.2 mới)

| Shell | Blur | Bg | Border | Khi nào |
|---|---|---|---|---|
| **Header** (desktop) | — | `linear-gradient 135deg #0F172A→#1E3A8A→#1D4ED8` solid | `border-white/15` | Luôn solid để brand nổi, không glass |
| **BottomNav** | `18px saturate 145%` | `color-mix(surface-card 90%, transparent)` | `border surface-border 78%` | `mobile-bottom-nav` |
| **ControlSheet** | `14px` | `rgba(7,24,74,0.32)` | `rgba(255,255,255,0.18)` | `mobile-control-sheet` |
| **Secondary Toolbar** (Phase 1) | `16px` | `surface-card 95%` | `surface-border` | Sticky dưới header, chứa filters |
| **Card / Table / Modal** | **Không blur** | `surface-card #FFFFFF` solid | `surface-border` | Data container |

> **Cấm:** `bg-white/90 backdrop-blur-sm` toàn app (v2.0 cũ) — chỉ shell mới glass.

---

## 4. Typography

| Thành phần | Token | Ví dụ |
|---|---|---|
| Page Title | `24px/700 -0.02em` `typography-page-title` | `Thiếu Nhi` |
| Section | `18px/600` `typography-section-title` | `Bảng Điểm` |
| Card Title | `16px/600` | `Thông Báo` |
| Body | `14px/400` | Họ tên |
| Caption | `11px/500 uppercase 0.05em` `text-muted` | Nhãn cột |
| Numeric | `tabular-nums mono 500` | Điểm, tiền |
| Numeric Emphasis | `18px/700 mono parish-primary` | GPA |

Vietnamese diacritics cần `line-height 1.5` + Inter full.

---

## 5. Tables & Grids (v3.2)

- **colgroup bắt buộc:** `STT w-[60]`, `Tên Thánh w-[120]`, `Họ Tên w-[240]` — tránh cắt chữ.
- **Padding:** `px-4 py-3` comfortable / `8/12` dense — via `density-*` vars.
- **Sticky:** header `position:sticky top-0 z-10 bg-surface-card` + first col `sticky left-0` (Phase 1).
- **Alignment:** Text/date left, number/money right `tabular-nums`.
- **Rows:** `hover:bg-surface-hover transition-colors border-b border-slate-100`.
- **Density toggle:** `Comfortable 48px / Dense 40px / Ultra 32px` — pill `Comfortable | Compact`.
- **Virtualize:** >1k rows dùng `@tanstack/virtual`, giữ col widths.

---

## 6. Components

### 6.1 Page Container (chuẩn v3.2 solid)

```tsx
<div className="flex flex-col gap-6 max-w-7xl mx-auto p-6">
  <PageHeader icon={Users} title="Tiêu Đề" description="Mô tả" actions={<button className="btn btn-primary">CTA</button>} />
  <div className="card"> {/* surface-card solid, không glass */}
    {/* content */}
  </div>
</div>
```

### 6.2 Buttons

`.btn h38 14px/600` + `.btn-primary parish-primary` / `secondary surface-hover` / `danger` / `ghost` / `sm h32` / `mobile-btn 44px` / `btn-icon 38px`. Active `scale 0.98`.

Pill: `.pill-btn h32 full` + `.pill-group h36 bg-surface-hover p-3 pill-group-item active white+shadow`.

### 6.3 Forms

`.form-group gap6`, `form-label 12px/700 muted`, `form-input h38 px12 border-input radius-md focus parish-primary ring 2px`, `form-input-sm h36 pill pl34 icon`, `form-error danger`, `alert-error danger 12px/600`.

### 6.4 Badges & Cards

`.badge 22px 11px/700 full` — `primary/success/warning/danger/info/neutral/violet/teal/orange/indigo/purple` + `syncing/conflict pulsing`. `.card surface-card radius-lg p20 shadow-card`.

---

## 7. Motion

`transition: background-color 150ms var(--motion-ease-out), box-shadow, transform`. Tôn trọng `prefers-reduced-motion: reduce * 0.01ms`.

---

## 8. Dark Mode

Tự adapt via `.dark` vars: `parish-primary #60A5FA`, `surface-card #1E293B`, `surface-app #0F172A`. Shadows `0.3-0.4` opacity. Glass bg `surface-card 90%` vẫn blur.

---

## 9. Version History

- **v2.0 (2026):** Glass toàn app `white/90 blur` — đã drift.
- **v3.1 (2026-08-22):** `@theme` solid card, thêm finance/branch/domain tokens.
- **v3.2 (2026-08-27) Phase 0:** Ghi rõ glass chỉ shell, thêm `motion-ease-out`, `glass-blur`, `z-secondary-toolbar`, `scroll-padding`, table density, sticky spec. Đồng bộ 100% `src/index.css`.

*Tài liệu này là SSOT bắt buộc — drift sẽ bị `npm run lint:ds` chặn.*
