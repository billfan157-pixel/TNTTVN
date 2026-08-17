# 📋 ĐÁNH GIÁ UX/UI TOÀN ỨNG DỤNG & PLAN NÂNG CẬP DESIGN SYSTEM v3.1

**Ngày đánh giá:** 2026-08-15
**Ngày cập nhật lần cuối:** 2026-08-15
**Phạm vi:** Tất cả pages, desktop components, mobile components, common components
**Design System tham chiếu:** `docs/03_DESIGN_SYSTEM.md` v3.1 + `src/index.css`
**Đã hoàn thành:** `FinancePage.tsx` + `ConfirmDialog.tsx` (template)

---

## I. TỔNG QUAN HIỆN TRẠNG

Toàn bộ ứng dụng có **~1,750+ violations** across **66 files**. Chỉ **1 file** tuân thủ DS (StateFeedback.tsx). Tỷ lệ tuân thủ hiện tại: **1.4%**.

### Phân loại violations

| Category | Mô tả | Số lượng | Files ảnh hưởng |
|----------|-------|----------|----------------|
| C1 | Raw Tailwind colors (bg-rose-*, bg-emerald-*, bg-sky-*, bg-amber-*, bg-slate-*, text-*, border-*) | ~680 | 47 |
| C2 | Thiếu `.btn` trên buttons | ~280 | 48 |
| C3 | Thiếu `.card` trên card containers | 12 | 7 |
| C4 | Thiếu `.form-*` trên form elements | ~80 | 18 |
| C5 | Thiếu `.table-wrapper` trên tables | 14 | 14 |
| C6 | Thiếu `.typography-*` trên headings | ~120 | 44 |
| C7 | Thiếu `.badge-*` trên status badges | ~60 | 15+ |
| C8 | Inline `style={{}}` | ~280 | 25 |
| C9 | Raw `dark:` variants | ~120 | 19 |
| C10 | Raw hex colors trong style | ~100 | 5 |

---

## II. TOP 15 WORST OFFENDERS

| # | File | Violations | Priority |
|---|------|-----------|----------|
| 1 | `src/components/common/StudentReportModal.tsx` | 179+ | CRITICAL |
| 2 | `src/components/common/ExcelImportModal.tsx` | 119 | HIGH |
| 3 | `src/components/desktop/DesktopAttendanceSummary.tsx` | 89 | HIGH |
| 4 | `src/components/desktop/UserManagementPage.tsx` | 86 | HIGH |
| 5 | `src/pages/AuditLogPage.tsx` | 61 | HIGH |
| 6 | `src/components/mobile/MobileStudentsView.tsx` | 55 | HIGH |
| 7 | `src/components/common/ExcelGradeImportModal.tsx` | 49 | HIGH |
| 8 | `src/pages/VerificationPage.tsx` | 44 | HIGH |
| 9 | `src/pages/SettingsPage.tsx` | 35 | HIGH |
| 10 | `src/pages/AcademicYearPage.tsx` | 38 | HIGH |
| 11 | `src/components/desktop/DesktopDashboard.tsx` | 37 | HIGH |
| 12 | `src/components/common/HeaderBar.tsx` | 37 | HIGH |
| 13 | `src/components/desktop/DesktopCalendarView.tsx` | 35 | HIGH |
| 14 | `src/components/mobile/MobileReportsView.tsx` | 32 | HIGH |
| 15 | `src/components/desktop/DesktopStudentList.tsx` | 29 | MEDIUM |

---

## III. PHÂN NHÓM THEO PHASE

### Phase 1: Quick Wins — LOW violations (1-9 each, 36 files)

Các file có ít violations, sửa nhanh:

| File | Violations | Focus |
|------|-----------|-------|
| `StudentsPage.tsx` | 3 | C1 buttons |
| `ManagementPage.tsx` | 2 | C2, C6 |
| `GradesPage.tsx` | 1 | C2 |
| `DesktopClasses.tsx` | 5 | C5, C6 |
| `DesktopGradeCards.tsx` | 7 | C1, C2, C6 |
| `DesktopNotices.tsx` | 4 | C2, C5, C6 |
| `GradeCellInput.tsx` | 1 | C4 |
| `MobileBottomNav.tsx` | 1 | C2 |
| `MobileGradeView.tsx` | 6 | C2, C8 |
| `MobileNoticesView.tsx` | 6 | C2, C8 |
| `MobileGradeComparison.tsx` | 4 | C1, C6 |
| `MobileLiturgicalWidget.tsx` | 4 | C1, C6, C8 |
| `Certificate.tsx` | 4 | C3, C8 |
| `PhotoCard.tsx` | 3 | C3, C8 |
| `ConflictResolutionModal.tsx` | 4 | C2, C6 |
| `ErrorBoundary.tsx` | 2 | C2, C6 |
| `InstallPrompt.tsx` | 2 | C2, C10 |
| `SacramentSection.tsx` | 1 | C6 |
| `CatechistPage.tsx` | 8 | C1, C4, C6 |
| `LoginPage.tsx` | 5 | C1, C2, C3, C6 |

### Phase 2: Medium Complexity — MEDIUM violations (10-34 each, 19 files)

| File | Violations | Focus |
|------|-----------|-------|
| `DesktopDailyGradeEntry.tsx` | 23 | C1, C2, C4, C5, C6 |
| `DesktopGradeComparison.tsx` | 12 | C1, C5, C6 |
| `DesktopLeaveRequests.tsx` | 26 | C1, C2, C4, C5, C6, C9 |
| `DesktopGradeMatrix.tsx` | 20 | C1, C2, C4, C5, C6, C8 |
| `DesktopAttendanceGrid.tsx` | 15 | C2, C4, C5, C6, C8 |
| `DesktopStudentList.tsx` | 29 | C1, C2, C4, C5, C6, C8 |
| `DesktopReports.tsx` | 19 | C1, C2, C5, C6, C8 |
| `AttendanceHistoryModal.tsx` | 11 | C1, C2, C4, C6 |
| `ConflictInboxModal.tsx` | 11 | C1, C2, C3 |
| `PromotionPanel.tsx` | 13 | C1, C2, C6, C8 |
| `GradeFormulaConfigModal.tsx` | 22 | C1, C2, C3, C6 |
| `SystemDiagnosticsModal.tsx` | 29 | C1, C2, C3, C6 |
| `LiturgicalTodayWidget.tsx` | 7 | C1, C2, C6, C8, C9 |
| `MobileAttendanceView.tsx` | 23 | C2, C6, C8 |
| `MobileHomeView.tsx` | 24 | C1, C2, C6 |
| `MobileGradeMatrix.tsx` | 17 | C1, C2, C4, C6 |
| `MobileAttendanceSummaryView.tsx` | 22 | C1, C2, C4, C8, C9 |
| `MobileCalendarView.tsx` | 16 | C1, C2, C6, C8 |
| `MobileDailyGradeEntry.tsx` | 11 | C1, C2, C4, C6 |
| `MobileTopBar.tsx` | 8 | C1, C2, C4 |
| `ToastContainer.tsx` | 23 | C1, C2, C8, C9 |
| `OfflineStatusBanner.tsx` | 18 | C1, C9 |
| `ForcePasswordChangeModal.tsx` | 12 | C1, C2, C4, C6 |
| `ParentDashboard.tsx` | 19 | C1, C2, C6, C9 |
| `PurgeDataModal.tsx` | 17 | C1, C2, C4, C6, C9 |
| `LeaveRequestModal.tsx` | 14 | C1, C2, C4, C6, C9 |
| `TelegramLinkCard.tsx` | 11 | C1, C2, C6, C9 |
| `BackupRestoreModal.tsx` | 15 | C1, C2, C4, C6, C9 |
| `StudentModal.tsx` | 21 | C1, C2, C4, C6 |
| `NoticeModal.tsx` | 7 | C2, C4, C6 |
| `ParentPage.tsx` | 10 | C1, C2, C5, C6, C9 |

### Phase 3: High Complexity — HIGH violations (35+ each, 14 files)

| File | Violations | Focus |
|------|-----------|-------|
| `DesktopAttendanceSummary.tsx` | 89 | C1, C2, C4, C5, C6, C8, C9 |
| `UserManagementPage.tsx` | 86 | C1, C2, C4, C5, C6, C9 |
| `AuditLogPage.tsx` | 61 | C1, C2, C6 |
| `VerificationPage.tsx` | 44 | C1, C2, C3, C6 |
| `SettingsPage.tsx` | 35 | C1, C2, C4, C6, C9 |
| `AcademicYearPage.tsx` | 38 | C1, C2, C6 |
| `DesktopDashboard.tsx` | 37 | C1, C2, C6, C8 |
| `HeaderBar.tsx` | 37 | C1, C2, C3, C4, C6, C8, C10 |
| `DesktopCalendarView.tsx` | 35 | C1, C2, C4, C6, C8, C9 |
| `MobileReportsView.tsx` | 32 | C1, C2, C6, C8, C9 |
| `PrintReportModal.tsx` | 38 | C1, C2, C4, C6, C9 |
| `ExcelImportModal.tsx` | 119 | C1, C2, C4, C5, C6, C9 |
| `ExcelGradeImportModal.tsx` | 49 | C1, C2, C4, C5, C6, C9 |

### Phase 4: CRITICAL — StudentReportModal.tsx (179+)

File này hoàn toàn viết bằng inline styles + hex colors. Cần rewrite toàn bộ.

---

## IV. DOMAIN COLOR TOKENS CẦN ĐỊNH NGHĨA

Dựa trên phân tích, cần thêm domain tokens cho các status colors:

```css
/* Light Mode */
--color-success: #16A34A;
--color-success-bg: #DCFCE7;
--color-danger: #DC2626;
--color-danger-bg: #FEE2E2;
--color-warning: #D97706;
--color-warning-bg: #FEF3C7;
--color-info: #0284C7;
--color-info-bg: #E0F2FE;

/* Dark Mode */
--color-success: #4ADE80;
--color-success-bg: #14532D;
--color-danger: #F87171;
--color-danger-bg: #450A0A;
--color-warning: #FBBF24;
--color-warning-bg: #451A03;
--color-info: #38BDF8;
--color-info-bg: #0C4A6E;
```

---

## V. QUY TẮC MIGRATION

### Buttons (C2 → `.btn`)
- Tất cả action buttons phải có `.btn` class
- Size variants: `.btn-sm` (28-36px), `.btn-md` (36-44px), `.btn-lg` (44-52px)
- Style variants: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`
- Không dùng `bg-blue-600`/`bg-emerald-600` trên buttons — dùng `.btn-primary` hoặc domain color tokens

### Cards (C3 → `.card`)
- Tất cả card containers phải dùng `.card` class
- glassmorphism chỉ dùng cho header/hero/bottom-nav

### Forms (C4 → `.form-*`)
- Input: `.form-input`
- Select: `.form-select`
- Textarea: `.form-textarea`
- Label: `.form-label`
- Group: `.form-group`

### Tables (C5 → `.table-wrapper .table-scroll`)
- Tất cả tables phải bọc trong `.table-wrapper .table-scroll`
- Head: `<thead className="bg-surface-card">`

### Typography (C6 → `.typography-*`)
- Page title: `.typography-page-title`
- Card title: `.typography-card-title`
- Section title: `.typography-section-title`
- Body: `.typography-body`
- Caption: `.typography-caption`

### Badges (C7 → `.badge-*`)
- Success: `.badge-success`
- Danger: `.badge-danger`
- Warning: `.badge-warning`
- Info: `.badge-info`
- Branch colors dùng domain tokens

### Colors (C1 → tokens)
- Thay raw `bg-emerald-*` bằng `var(--color-success-bg)`
- Thay raw `text-emerald-*` bằng `var(--color-success)`
- Thay raw `bg-rose-*` bằng `var(--color-danger-bg)`
- Thay raw `text-rose-*` bằng `var(--color-danger)`
- Thay raw `bg-amber-*` bằng `var(--color-warning-bg)`
- Thay raw `text-amber-*` bằng `var(--color-warning)`
- Thay raw `bg-sky-*` / `bg-blue-*` bằng `var(--color-info-bg)`
- Thay raw `text-sky-*` / `text-blue-*` bằng `var(--color-info)`
- Thay raw `bg-slate-*` bằng surface tokens (`var(--color-surface-app)`, `var(--color-surface-card)`, etc.)

### Dark Mode (C9 → tokens)
- Xóa tất cả `dark:bg-*`, `dark:text-*`, `dark:border-*`
- Dùng CSS variables đã define dark mode overrides trong `index.css`

### Inline Styles (C8 → CSS classes)
- Di chuyển layout/spacing vào CSS classes
- Chỉ giữ `style={{}}` cho dynamic values (width计算, height动画)

---

## VI. KẾT QUẢ KIỂM TRA HIỆN TẠI

| Kiểm tra | Kết quả |
|----------|---------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| Design System Lint (`npm run lint:ds`) | ⚠️ 1 violation (ParentForgotPasswordModal.tsx) |

---

## VII. FILES ĐÃ HOÀN THÀNH

| File | Trạng thái |
|------|-----------|
| `src/pages/FinancePage.tsx` | ✅ Hoàn thành (Phase 1-5) |
| `src/components/finance/TransactionModal.tsx` | ✅ Hoàn thành |
| `src/components/finance/ClassFeeCollectionModal.tsx` | ✅ Hoàn thành |
| `src/components/finance/FundManageModal.tsx` | ✅ Hoàn thành |
| `src/components/finance/PrintReceiptModal.tsx` | ✅ Hoàn thành |
| `src/components/common/ConfirmDialog.tsx` | ✅ Hoàn thành |
| `src/components/common/StateFeedback.tsx` | ✅ Tuân thủ DS |

---

## VIII. TÀI LIỆU THAM KHẢO

| File | Mục đích |
|------|----------|
| `docs/03_DESIGN_SYSTEM.md` | Design System v3.1 — SSOT |
| `src/index.css` | Design tokens + component classes |
| `scripts/design-system-lint.mjs` | Anti-drift linter |
| `docs/UX_UI_EVALUATION_FINANCE_PAGE.md` | Template cho migration |
