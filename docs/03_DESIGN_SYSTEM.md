# Design System (Grounded)

> Real tokens extracted from `src/index.css`. No aspirational code — only what's actually defined.
> Version: 1.0 | Last reviewed: 2026-07-25 | Status: ✅ Current | Prerequisites: 04

## 1. Color Tokens

### Brand / Primary
| Token | Light | Dark |
|-------|-------|------|
| `--color-parish-primary` | `#1E3A8A` (blue-900) | `#60A5FA` (blue-400) |
| `--color-parish-primary-hover` | `#1E40AF` (blue-800) | `#3B82F6` (blue-500) |
| `--color-parish-primary-light` | `#EFF6FF` (blue-50) | `#1E3A5F` |

### Secondary (Amber)
| Token | Light | Dark |
|-------|-------|------|
| `--color-parish-secondary` | `#D97706` | `#FBBF24` |
| `--color-parish-secondary-hover` | `#B45309` | `#FDE68A` |
| `--color-parish-secondary-light` | `#FEF3C7` | `#4A3A0A` |

### Semantic
| Token | Light Success | Dark Success | Light Danger | Dark Danger |
|-------|--------------|-------------|-------------|------------|
| Base | `#16A34A` | `#4ADE80` | `#DC2626` | `#F87171` |
| Hover | `#15803D` | `#22C55E` | `#B91C1C` | `#FCA5A5` |
| BG | `#DCFCE7` | `#14532D` | `#FEE2E2` | `#450A0A` |

Warning: `#EA580C` / `#FB923C` · Warning hover: `#C2410C` / `#FDBA74` · Warning bg: `#FFEDD5` / `#431407`
Info: `#0284C7` / `#38BDF8` · Info hover: `#075985` / `#38BDF8` · Info bg: `#E0F2FE` / `#0C4A6E`

### TNTT Branch Colors
| Branch | CSS Variable | Value |
|--------|-------------|-------|
| Chiên Con | `--color-branch-chiencon` | `#EC4899` |
| Ấu Nhi | `--color-branch-aunhi` | `#16A34A` |
| Thiếu Nhi | `--color-branch-thieunhi` | `#2563EB` |
| Nghĩa Sĩ | `--color-branch-nghiasi` | `#EAB308` |
| Hiệp Sĩ | `--color-branch-hiepsi` | `#854D0E` |

### Surface
| Token | Light | Dark |
|-------|-------|------|
| Card | `#FFFFFF` | `#1E293B` |
| Hover | `#F1F5F9` | `#334155` |
| Border | `#E2E8F0` | `#475569` |
| App BG | `#F8FAFC` | `#0F172A` |

### Text
| Token | Light | Dark |
|-------|-------|------|
| Main | `#0F172A` | `#F1F5F9` |
| Muted | `#64748B` | `#94A3B8` |
| Inverse | `#FFFFFF` | `#0F172A` |
| Secondary | `#475569` | `#94A3B8` |
| Placeholder | `#94A3B8` | `#64748B` |
| Input Border | `#CBD5E1` | `#475569` |

## 2. Spacing (4px base)

| Token | Value |
|-------|-------|
| `--space-3.5` | `14px` |

Uses Tailwind v4 default spacing scale otherwise.

## 3. Border Radius

| Token | Value |
|-------|-------|
| `--radius-sm` | `8px` |
| `--radius-md` | `12px` |
| `--radius-lg` | `16px` |
| `--radius-xl` | `20px` |
| `--radius-full` | `9999px` |

## 4. Shadows

| Token | Shadow |
|-------|--------|
| card | `0 1px 2px 0 rgba(0,0,0,0.05)` |
| card-hover | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)` |
| modal | `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)` |
| dropdown | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)` |
| toast | `0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)` |

Dark variants use black with higher opacity (0.3–0.4).

## 5. Typography

- **Font stack**: `'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`
- **Line height**: `1.5`
- **Antialiasing**: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale`

## 6. Component Styles (CSS Classes)

### Buttons
- `.btn` — base (38px, 14px/600, 8px 16px padding, md radius)
- `.btn-primary` — solid brand background
- `.btn-secondary` — ghost with border
- `.btn-danger` — solid red
- `.btn-ghost` — no border/background
- `.btn-sm` — 32px, 12px, sm radius
- `.btn-lg` — 44px, 14px, md radius

### Pill Buttons
- `.pill-btn` — 32px, 12px/700, full radius
- `.pill-group` — segmented control (flex row with active state)

### Forms
- `.form-group` — flex column with 6px gap
- `.form-label` — 12px/700, muted color
- `.form-input / .form-select / .form-textarea` — 38px, 14px, md radius, border-input
- `.form-input-sm` — pill search input (36px, 13px, full radius, left padding 34px)
- Error state: `[aria-invalid="true"]` → danger border + glow

### Badges
- `.badge` — 22px min-height, 11px/700, full radius, 3px 10px padding
- Variants: `-primary / -success / -warning / -danger / -info / -neutral`

### Cards
- `.card` — white bg, lg radius, 20px padding, card shadow
- `.card-interactive` — hover shadow + transform

### Modals
- `.modal-overlay` — fixed inset, `rgba(15, 23, 42, 0.5)` backdrop (slate-900), flex center, 16px padding, fadeIn
- `.modal-content` — 600px max, 24px padding, lg radius, modal shadow
- `.modal-report` — 750px max
- `.modal-full` — fullscreen

### Tables
- `.table-wrapper` — card bg, lg radius, border, card shadow, overflow hidden

### Icons
- `.icon-container` — 20x20
- `.icon-container-lg` — 24x24

## 7. Animations

| Keyframe | Purpose |
|----------|---------|
| `fadeIn` | Modal open, scale 0.97→1 |
| `fadeInUp` | Content entrance, translateY 8px→0 |
| `slideInRight` | Mobile panel, translateX 100%→0 |
| `slideOutRight` | Mobile panel close |
| `skeleton-pulse` | Loading skeleton, opacity 1→0.5→1 |
| `spin` | Loading spinner |

- All animations play at 0.2s ease-out default
- `@media (prefers-reduced-motion: reduce)` disables all
- `.btn:active` has `scale(0.98)` transform

## 8. Dark Mode

Applied via `.dark` class override. All semantic tokens, surface colors, text colors, shadows, and component-specific dark variants are re-declared under `.dark { ... }`.

## 9. Scrollbar

| Property | Value |
|----------|-------|
| Width | 6px |
| Track | transparent |
| Thumb (light) | `--color-border-input` (`#CBD5E1`) |
| Thumb (dark) | `--color-surface-border` (`#475569`) |

## 10. Accessibility

- `:focus-visible` → 2px solid primary, offset 2px
- `:focus:not(:focus-visible)` → outline none
- `.skip-link` — visually hidden until focused, primary bg, top 8px
- Print styles — inline hides `.modal-overlay`, `.no-print` display none
