# IMPLEMENTATION PLAN: Pixel-Perfect UI/UX Audit & Alignment
## Brave Davinci - Giáo Lý Thiếu Nhi Thánh Thể

> **Objective**: Systematically audit and fix ALL visual inconsistencies across 16 components while preserving 100% business logic.
> **Approach**: Token-driven CSS → Common Components → Desktop → Mobile → Verification
> **Constraint**: Zero logic changes. Only spacing, sizing, alignment, typography tokens.

---

## 📐 DESIGN TOKEN SYSTEM (Single Source of Truth)

### Spacing Scale (4px base)
| Token | Tailwind | Value | Usage |
|-------|----------|-------|-------|
| `space-1` | `gap-1` / `p-1` | 4px | Icon gaps, badge padding |
| `space-2` | `gap-2` / `p-2` | 8px | Form gaps, button gaps |
| `space-3` | `gap-3` / `p-3` | 12px | Card internal gaps |
| `space-3.5` | `gap-3.5` / `p-3.5` | 14px | **Form grid gaps** |
| `space-4` | `gap-4` / `p-4` | 16px | Card padding, page gaps |
| `space-5` | `gap-5` / `p-5` | 20px | Section padding |
| `space-6` | `gap-6` / `p-6` | 24px | Page-level margins |

### Border Radius Tokens
| Token | Tailwind | Value | Usage |
|-------|----------|-------|-------|
| `radius-sm` | `rounded-sm` | 8px | Badges, small chips |
| `radius-md` | `rounded-md` / `rounded-xl` | 12px | **Standard: Inputs, Selects, Buttons** |
| `radius-lg` | `rounded-lg` / `rounded-2xl` | 16px | **Main: Modals, Cards, Panels** |
| `radius-full` | `rounded-full` | 9999px | Pills, badges, circle avatars |

> **IMPORTANT**: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px` are set in `@theme`. This SHIFTS Tailwind 4 defaults (sm=4, md=6, lg=8). `rounded-xl` stays at 12px (Tailwind default), `rounded-2xl` stays at 16px. Use `rounded-md` for 12px, `rounded-lg` for 16px, OR `rounded-xl`/`rounded-2xl` for same values via Tailwind default.

### Component Dimensions (NON-NEGOTIABLE)
| Component | Height | Width | Padding | Radius |
|-----------|--------|-------|---------|--------|
| `.btn` (default) | 38px | auto | 8px 16px | 12px |
| `.btn-sm` | 32px | auto | 4px 12px | 8px |
| `.btn-lg` | 44px | auto | 10px 20px | 12px |
| `.form-input` / `.form-select` | 38px | 100% | 8px 12px | 12px |
| `.form-input-sm` (search) | 36px | 100% | 6px 12px 6px 34px | 9999px |
| `.badge` | **22px** | auto | 3px 10px | 9999px |
| `.modal-content` | auto | max 600/750px | 24px | 16px |

### Icon Container Standard
```css
.icon-container { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-container-lg { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
```

### Vertical Baseline Rules
- **Section Titles**: `flex items-center gap-2 text-base font-extrabold text-parish-primary mb-4 h-6`
- **Form Labels**: `text-xs font-bold text-slate-600 mb-1.5` (12px, weight 700, margin-bottom 6px)
- **Table Cells**: `py-2.5 px-3.5` (10px 14px) — center for STT/Avg/Att, left for names, right for actions

---

## 🔍 GAP ANALYSIS: Current Code vs Token Spec

### ✅ ALREADY COMPLIANT (No Changes Needed)
- `StudentModal.tsx` — Grid gaps, labels, footer buttons **match spec exactly**
- `DesktopDashboard.tsx` — KPI cards h-[135px], branch cards, tables **~95% compliant**
- `DesktopReports.tsx` — Stat table, print cards **~90% compliant** (minor table cell padding)

### ⚠️ NEEDS CSS FOUNDATION FIXES (Phase 0)
| File | Gaps |
|------|------|
| `src/index.css` | `.badge` missing `height: 22px`; Missing `.form-input-sm`, `.icon-container`, `.icon-container-lg`; Missing `space-3.5` token |
| Tailwind class risk | `rounded-md` = 12px (not 6px) due to radius override — affects all `rounded-md` usage in codebase |

### ⚠️ NEEDS ALIGNMENT (Priority Order)

| File | Category | Key Gaps |
|------|----------|----------|
| `HeaderBar.tsx` | Common | Search pl 34→36px, pr 12→14px; Semester/View buttons h-30→36px; Theme/Reset radius 10→12px |
| `StudentReportModal.tsx` | Common | Table cell padding 8px→10px 12px; Attendance card radius 8→12px |
| `DesktopSidebar.tsx` | Desktop | Menu item px 12→14px; Select height 38→36px |
| `DesktopGradeMatrix.tsx` | Desktop | Grade input cells: missing fixed 32x52px & radius 8px; Class select height 38→36px; Semester pills missing h-8 |
| `DesktopAttendanceGrid.tsx` | Desktop | Date input height 38→36px; Type pills missing h-8; Status buttons: missing h-32px, padding fix, radius 8px, gap 6px; Controls bar rounded-lg→rounded-2xl |
| `DesktopStudentList.tsx` | Desktop | DoB/Parent/Att column widths off by 5px; Holy name mr-1→mr-1.5 |
| `DesktopNotices.tsx` | Desktop | Table cell padding py-3.5 px-4→py-2.5 px-3.5 |
| `MobileBottomNav.tsx` | Mobile | Icon wrapper not 20x20 fixed; gap 3→4px; Label mt-0.5 missing; font-weight inconsistent |
| `MobileHomeView.tsx` | Mobile | Welcome p-18→20px; Stats p-14→16px r-12→16px; Actions gap 10→12px; Icon circle 36→40x40 |
| `MobileStudentsView.tsx` | Mobile | Search pl 32→36px r-20→full; Filter pills padding/radius/weight all wrong; Card p-14→16px r-12→16px |
| `MobileGradeView.tsx` | Mobile | **MAJOR REFACTOR**: Separate select+switcher → single pill bar; Card gap missing; Score grid gap 6→8px |
| `MobileAttendanceView.tsx` | Mobile | **MAJOR**: Type selector is native select, needs pill buttons; Date input h-38→36px; Status pills missing h-36; Floating save bottom 76→80px |

---

## 🚀 IMPLEMENTATION PHASES

### PHASE 0: CSS FOUNDATION (30 min)
**File**: `src/index.css`
- [ ] Add `height: 22px` to `.badge` CSS class
- [ ] Add `.form-input-sm` class:
  ```css
  .form-input-sm {
    padding: 6px 12px 6px 34px; height: 36px; font-size: 12.5px;
    border: 1px solid #CBD5E1; border-radius: 9999px; outline: none;
    background: white; color: #0F172A; font-family: inherit;
    transition: border-color 0.15s ease;
  }
  .form-input-sm:focus { border-color: #1E3A8A; box-shadow: 0 0 0 2px rgba(30, 58, 138, 0.15); }
  .form-input-sm::placeholder { color: #94A3B8; }
  ```
- [ ] Add `.icon-container` and `.icon-container-lg` classes
- [ ] Add `--space-3.5: 14px` to `@theme` block
- [ ] ✅ Run `npm run build` — must pass with 0 TS errors
- [ ] ✅ Run `npm run test` — 25/25 passing

---

### PHASE 1: COMMON COMPONENTS & MODALS (2-3 hrs)

#### 1.1 `HeaderBar.tsx` — Search Bar Alignment
```tsx
// Search input: height 36px, pl-9 (36px), pr-3.5 (14px), border-radius 9999px
// Search icon: absolute left-3 top-1/2 -translate-y-1/2
// Semester/View buttons: height 36px, rounded-xl (12px)
// Theme/Reset buttons: height 36px, rounded-xl (12px)
```

#### 1.2 `StudentModal.tsx` — Already compliant ✅
- Grid gaps already 14px
- Labels already .form-label (font-weight 700)
- Footer buttons already .btn/.btn-primary/.btn-secondary

#### 1.3 `StudentReportModal.tsx` — Print Card Polish
```tsx
// Student header card: p-4(16px) rounded-xl(12px) ✅ already correct
// Holy name: mr-1.5 (6px) ✅ already correct
// Report table cells: py-2.5 px-3 (10px 12px) ← NEEDS FIX
// Attendance cards: p-3(12px) rounded-xl(12px) ← NEEDS FIX
```

---

### PHASE 2: DESKTOP COMPONENTS (3-4 hrs)

#### 2.1 `DesktopSidebar.tsx`
```tsx
// Menu buttons: py-2.5 px-3.5 (10px 14px) ← px 12→14px
// Icon container: w-5 h-5 (20x20) ✅ already correct
// Filter selects: height 36px ← 38→36px
```

#### 2.2 `DesktopGradeMatrix.tsx`
```tsx
// Class select: height 36px rounded-xl px-3 ← 38→36px
// Semester pills: height 32px px-3 rounded-lg ← ADD height: 32px
// Grade inputs: style={{ height: '32px', width: '52px', borderRadius: '8px', textAlign: 'center' }} ← MAJOR CHANGE from w-full
//   NOTE: wrapped in a container when width is restricted vs. responsive columns
// Save button: .btn (38px) ✅ already correct
```

#### 2.3 `DesktopAttendanceGrid.tsx`
```tsx
// Controls bar: rounded-2xl ← rounded-lg→16px
// Date input: height 36px rounded-xl px-3 ← 38→36px
// Type pills: height 32px px-3 rounded-lg ← ADD h-32px
// Status button group: 
//   height: 32px, padding: 4px 10px, borderRadius: 8px, gap: 6px
//   Use inline-flex items-center justify-center
```

#### 2.4 Minor Desktop Touch-ups
- `DesktopStudentList.tsx`: Column widths DoB 105→110px, Parent 195→200px, Att 105→110px; Holy name mr-1→mr-1.5
- `DesktopReports.tsx`: Table header/cell padding to `py-2.5 px-3.5`
- `DesktopNotices.tsx`: Table cell padding to `py-2.5 px-3.5`
- `DesktopDashboard.tsx`: Verify KPI card h-[135px] ✅ already correct

---

### PHASE 3: MOBILE COMPONENTS (4-5 hrs)

#### 3.1 `MobileBottomNav.tsx` — Tab Bar Alignment
```tsx
// Tab button: flex flex-col items-center justify-center gap-1 (4px) ← 3→4px
// Icon wrapper: w-5 h-5 (20x20 fixed) flex items-center justify-center ← CHANGE from padded wrapper
// Label: text-[11px] font-semibold mt-0.5 (2px) ← ADD mt-0.5, font-semibold (600) regardless of active state
```

#### 3.2 `MobileHomeView.tsx`
```tsx
// Welcome card: rounded-2xl(16px) ✅, padding 18→20px, ADD gap-1.5(6px)
// Quick actions: grid-cols-3 ✅, gap 10→12px
// Action btn: padding 12px uniform ← 12px 8px→12px all, gap 6→8px
// Icon circle: size 36→40x40, radius 10→12px
// Stats cards: padding 14→16px, radius 12→16px (rounded-2xl)
```

#### 3.3 `MobileStudentsView.tsx` — **MANY FIXES**
```tsx
// Search input: height 36px, pl-9 (36px), rounded-full (9999px)
// Add button: height 36px, rounded-full, px-4 ← currently btn-sm (32px)
// Filter pills: py-1.5(6px) px-3.5(14px) font-bold(700) rounded-full
// Student cards: padding 14→16px, radius 12→16px, gap 10→12px
// Name row: flex items-center gap-1.5(6px) ← ADD flex layout
```

#### 3.4 `MobileGradeView.tsx` — **MAJOR REFACTOR**
```tsx
// DESIGN DECISION NEEDED: Choose Option A or Option B
//
// Option A — Single pill bar (as planned):
//   Replace header card with scrollable pill row containing class + semester pills
//
// Option B — Keep current layout but align tokens:
//   Semester pills: height 34→36px, inner pills 28→30px
//   Class select: form-select height 38→36px
//   Card gap: ADD gap-3(12px) between header row + score grid
//
// Student cards: p-4(16px) rounded-2xl ← already correct ✅
// Score grid: gap 6→8px
```

#### 3.5 `MobileAttendanceView.tsx`
```tsx
// Date input: height 36px ← 38→36px
// Type selector: REPLACE native select WITH pill buttons:
//   <div class="flex p-1 rounded-xl bg-surface-hover">
//     <button class="h-9 px-3 text-xs font-bold rounded-lg">Lễ Chủ Nhật</button>
//     <button class="h-9 px-3 text-xs font-bold rounded-lg">Lớp Giáo Lý</button>
//   </div>
// Status pills (3 per student): 
//   height 36px, flex-1, gap-1.5(6px) ← ADD h-9, gap fix
//   Present: bg-green-600 text-white ✅ already correct
//   Excused: bg-orange-600 text-white ✅ already correct  
//   Unexcused: bg-red-600 text-white ✅ already correct
// Floating save: bottom 76→80px
```

---

### PHASE 4: VERIFICATION & REGRESSION TESTING (1 hr)

#### 4.1 Automated
```bash
npm run test        # 25/25 unit tests pass ✅ current: 25/25
npm run build       # 0 TS errors, successful Vite build ✅ current: 0 errors
npm run lint        # 0 errors (warnings OK but target 0)
```

#### 4.2 Manual Visual Checklist
| View | Components to Verify | Dark Mode? |
|------|---------------------|------------|
| **Desktop** | Sidebar menu px-3.5, HeaderBar search centered+h-9, KPI cards h-[135px], Grade inputs 32x52px, Attendance status pills h-32px | ✅ Check each |
| **Mobile** | Bottom nav 64px icons 20x20 centered, Home welcome p-5, Students cards p-4 rounded-2xl, Grade pill bar scroll, Attendance pills h-36px | ✅ Check each |
| **Modals** | Student form grid gap-3.5, Report modal student header p-4, Table cells py-2.5 px-3 | ✅ Check each |

#### 4.3 Cross-Browser Spot Check
- Chrome, Edge, Firefox (desktop)
- Chrome DevTools device toolbar: iPhone 14, iPad, Galaxy S23
- Verify dark mode toggle on each view

---

## 📋 FILE-BY-FILE CHANGE LOG TEMPLATE

Use this template when making changes to track compliance:

```markdown
## File: src/components/common/HeaderBar.tsx
### Changes Made
- [ ] Search input: height 36px, pl-9, pr-3.5
- [ ] Search icon: absolute left-3 top-1/2 -translate-y-1/2
- [ ] Semester/View/Theme/Reset buttons: unified h-9
- [ ] All flex items: items-center
### Verification
- [ ] Desktop: Search bar centered vertically with logo
- [ ] Mobile: Search bar fits without overflow
```

---

## ⚠️ CRITICAL RULES (DO NOT VIOLATE)

1. **NO LOGIC CHANGES** — Only CSS/Tailwind/inline-style modifications
2. **NO NEW DEPENDENCIES** — Use existing: TailwindCSS 4, lucide-react, zustand, tanstack
3. **PRESERVE DARK MODE** — All tokens work in `.dark` via CSS variables. Verify each component.
4. **PERSISTENCE INTACT** — Dexie/IndexedDB stores untouched
5. **TESTS MUST PASS** — `npm run test` before and after each phase

---

## 🎯 SUCCESS CRITERIA

| Metric | Target | Current |
|--------|--------|---------|
| Visual consistency score | 100% tokens applied | ~60% (see gap count) |
| TypeScript errors | 0 | 0 ✅ |
| Unit tests | 25/25 passing | 25/25 ✅ |
| Build time | < 30s | 1.44s ✅ |
| Lint errors | 0 | 0 errors (15 warnings) |
| Manual QA sign-off | All 3 views (Desktop/Mobile/Modals) | Not yet |

---

## 📦 DELIVERABLES

1. **Updated `IMPLEMENTATION_PLAN.md`** (this file)
2. **Modified source files** (16 components + index.css)
3. **Verification checklist** (completed manually)
4. **Git commit** with message: `feat(ui): pixel-perfect alignment per design tokens`

---

## 🧮 IMPACT SUMMARY

| Category | Files | Gap Count | Severity |
|----------|-------|-----------|----------|
| CSS Foundation | 1 | 5 | Medium |
| Common Components | 3 | 6 | Low-Medium |
| Desktop Components | 5 | 17 | Medium |
| Mobile Components | 5 | 26 | High |
| **Total** | **14+1** | **~54 gaps** | |

---

*Generated: 2026-07-23 | Based on full codebase audit of 24 source files | Revised: 2026-07-23 with 54 documented gaps*