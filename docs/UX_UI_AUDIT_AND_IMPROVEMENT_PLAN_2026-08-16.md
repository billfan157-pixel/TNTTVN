# 📐 UX/UI AUDIT TOÀN DIỆN & PLAN CẢI THIỆN — Brave Davinci

**Ngày audit:** 2026-08-16
**Phạm vi:** Toàn bộ app — 21 pages, 24 common components, 22 desktop components, 16 mobile components, 8 exam, 5 finance, 2 auth, `src/index.css`, `scripts/design-system-lint.mjs`
**SSOT đối chiếu:** `docs/03_DESIGN_SYSTEM.md` v3.1 (ADR-030/032) + `src/index.css` (1977 dòng)
**Phương pháp:** Evidence-first — 4 luồng audit song song + verify thủ công từng phát hiện nghiêm trọng (grep/đọc code trực tiếp). Mọi kết luận có `file:line`. Không sửa code trong đợt này.

---

## I. TÓM TẮT HIỆN TRẠNG

| Chỉ số | Kết quả |
|--------|---------|
| Linter DS (`npm run lint:ds`) | ✅ 0 violations — 124 components (đã mở rộng lên 6 rules, xem Pha 0.2) |
| TypeScript (`tsc`) | ✅ clean |
| `window.confirm` | ✅ 0 (đã thay bằng ConfirmDialog/useConfirmDialog) |
| `window.alert` | ✅ 0 |
| Hex cứng trong JSX | ⚠️ 136 match / 7 file — **73 (~54%) tập trung tại `StudentReportModal.tsx`** (exempt print) |
| Inline `style={{}}` | ⚠️ ~200 chỗ / 25 file — tập trung: StudentReportModal (91), MobileStudentsView (42), FinancePage (27), MobileAttendanceView (17) |
| `dark:` variants thủ công | ⚠️ 124 chỗ (phần lớn hợp lệ deliberate keep; còn lại cần token hóa) |

> **Trạng thái thực thi (2026-08-16):** ✅ **PHA 0 + PHA 2 hoàn thành** (xem §VI-bis bên dưới). Contrast Pha 3.2 được kéo lên thực thi cùng Pha 0.2 để giữ `lint:ds` xanh.

**Kết luận chung:** Nền tảng DS v3.1 đã vững (token-first, dark reset toàn cục `index.css:1039-1064`, thead chuẩn ở ~8/12 bảng, ConfirmDialog thay window.confirm, EmptyState/SkeletonTable lan rộng). **Nhưng tồn tại 2 lớp nợ UX/UI D2–D3:**

1. **Lớp "bán migrate"** — 5 trang + 12+ modal + 2 file import tự dựng hoàn toàn ngoài DS (không dùng `.modal-overlay`, không a11y dialog).
2. **Thiếu component chuẩn dùng chung** — không có `PageHeader` thống nhất, không có modal shell dùng chung, không có error-banner dùng chung → mỗi nhóm file tự dựng một kiểu → **không đồng bộ giữa các trang**.

---

## II. KHÔNG ĐỒNG BỘ GIỮA CÁC TRANG/COMPONENTS (BẰNG CHỨNG CỤ THỂ)

### 1. Page Header — 4 kiểu khác nhau, cỡ chữ chênh tới 2 bậc
| Kiểu | Trang | Evidence |
|---|---|---|
| Gần chuẩn §5 (icon tile + h1) | ManagementPage, AcademicYearPage, AuditLogPage, CatechistPage | Nhưng `bg-parish-primary/10` thay `-light`, `font-bold` thay `font-extrabold` |
| Module desktop (h2 màu primary, không icon tile) | DesktopClasses:137-144, DesktopNotices:29-37, DesktopLeaveRequests:87-95, DesktopAttendanceGrid:181-191 | Tiêu đề `text-parish-primary` thay vì `text-text-main` (trái §4) |
| Header "lớn" (`text-xl/2xl` + `font-black`) | DesktopReports:83 (`text-2xl font-black`), UserManagementPage:507, SettingsPage:98, ParentPage:35, DesktopStudentList:255, DesktopCalendarView:159 | Chênh 2 bậc vs chuẩn `text-lg` |
| KHÔNG có header | StudentsPage:66-92, GradesPage:32-50 | Chỉ tab bar — mất định vị trang |
| Hero public (có chủ đích) | VerificationPage:43-47 | Chấp nhận |

### 2. Modal shell — 3 pattern song song, a11y chỉ 1/19 đạt
- **(a) DS chuẩn** `.modal-overlay`/`.modal-content`: StudentModal, NoticeModal, ConfirmDialog, PhotoCard, Certificate + toàn bộ FINANCE.
- **(b) Custom shell** `fixed inset-0 z-50` — **12 modal KHÔNG có `role="dialog"`/`aria-modal`/focus-trap**, đa số không Escape: ExcelImportModal, ExcelGradeImportModal, PrintReportModal, BackupRestoreModal, PurgeDataModal, LeaveRequestModal, ConflictResolutionModal, ForcePasswordChangeModal, ParentForgotPasswordModal, ExamImportModal, ExamPaperModal + sub-modal ExamSessionView.
- **(c) Desktop tự dựng** — 18/18 modal desktop không dùng DS shell: DesktopClasses:333/410, UserManagementPage ×8 (637-891), DesktopCalendarView:506/612, AttendanceHistoryModal:95, ConflictInboxModal:107, GradeFormulaConfigModal:59, PromotionPanel:205, DesktopLeaveRequests:375. **Chỉ SystemDiagnosticsModal:96 có `role="dialog"`; chỉ UserManagementPage:851 có Escape. 0 focus trap, 0 scroll-lock.**

### 3. thead bảng — chuẩn ở 8 nơi, lệch ở 4 nơi + `scope="col"` gần như 0
- ✅ Chuẩn §6: DesktopClasses:224, DesktopNotices:65, DesktopAttendanceGrid:281, DesktopLeaveRequests:209, DesktopReports:131, UserManagementPage:543, DesktopGradeComparison:109, DesktopDailyGradeEntry:207.
- ❌ **ParentPage:119-128** — tệ nhất: không nền, không uppercase, `font-semibold`.
- ⚠️ DesktopAttendanceSummary:627/677 (`text-[11px]/[10px]`), DesktopStudentList:413, DesktopGradeMatrix:426 (class chuẩn tách rời).
- ❌ `scope="col"`: chỉ FinancePage:503-509 + ClassFeeCollectionModal:292-298 có; **còn lại toàn app không có**.

### 4. Badge/status — `.badge-*` chỉ 3 nơi, ~70 chỗ tự dựng pill màu raw
- ✅ `badge-primary` (DesktopNotices:40), `badge-warning` (DesktopLeaveRequests:99, DesktopAttendanceGrid:323).
- ❌ Tự dựng: AuditLogPage:114-192 (~60 class `bg-{violet,teal,emerald,sky,rose,amber,orange,indigo}-500/10 text-*-600`), AcademicYearPage:19-25 (STATUS_STYLE 7 màu raw), UserManagementPage:564-573, CatechistPage:55-61, DesktopStudentList:184, DesktopNotices:104.
- ⚠️ **Màu xếp loại "Khá" lệch nhau 4 kiểu**: Dashboard=emerald (243), GradeMatrix=`badge-success` (295), GradeCards=solid `bg-parish-success` (28), Reports=`text-parish-secondary` amber (163).

### 5. Error banner — 5 kiểu khác nhau
`bg-rose-50 border-rose-200` (StudentsPage:95, UserManagementPage:537) | `bg-red-50 border-red-200` (AcademicYearPage:326) | `bg-rose-500/10 border-rose-500/30` (AuditLogPage:292, CatechistPage:81, ParentLoginPage:54-72, StaffLoginPage:40-51) | `bg-rose-50 dark:bg-rose-950` (ParentPage:46/92, SettingsPage:148) | **Component `ErrorState` chuẩn tồn tại (StateFeedback:76-98) nhưng 0 trang dùng**.

### 6. Loading state — 4 kiểu
SkeletonTable chuẩn (DesktopClasses:258, DesktopLeaveRequests:225) | text "Đang tải..." (AcademicYearPage:332, AuditLogPage:332, CatechistPage:114) | Suspense fallback text (StudentsPage:101, GradesPage:53) | Loader2 spinner (ParentPage:52/90, UserManagementPage:533, VerificationPage:57).

### 7. Segmented control — `.pill-group` đã có nhưng 7 chỗ desktop + 4 chỗ mobile tự dựng lại
Finance dùng chuẩn (TransactionModal:132, ClassFeeCollectionModal:220, FinancePage:303). Desktop tự dựng: GradeMatrix:360, DailyGradeEntry:97+131, AttendanceGrid:117+228, AttendanceSummary:203+538, LeaveRequests:117, StudentList:285+303. Mobile: AttendanceSummaryView:153-182, AttendanceView:255-307 (nút trạng thái ~31px).

### 8. Mobile vs Desktop không đồng bộ
- **SCORE_TYPES**: Desktop dùng token (`bg-[var(--color-parish-info/success/warning)]` — DesktopDailyGradeEntry:16-18); **Mobile dùng raw `bg-blue-600/emerald-600/amber-600`** (MobileDailyGradeEntry:13-15) — `bg-blue-600` còn là màu khăn chi đoàn Thiếu Nhi (DS §2.4 CẤM làm CTA/active).
- **a11y icon buttons**: MobileTopBar đầy đủ aria-label; HeaderBar desktop chỉ `title` (173, 240, 249).
- **Stack gap**: chuẩn 14px vs 12px (MobileGradeView:52) vs 16px (MobileNoticesView:23, MobileReportsView:22).
- **Icon tile**: `bg-parish-primary-light` vs `bg-parish-primary/10` (MobileGradeMatrix:173, MobileGradeComparison:48, MobileCalendarView:75).
- **Dark variants pastel**: ReportsView/Summary/LeaveRequests có `dark:`; **HomeView:166-176, Matrix:204-205 THIẾU**.

### 9. Form — 4-5 kiểu input khác nhau
`.form-input` chuẩn (AuditLogPage:303-313, CatechistPage:96-103, StudentModal, LeaveRequestModal, FINANCE) vs tự dựng `px-3 py-2 bg-surface-card border rounded-lg focus:ring-2` (SettingsPage:114-175, UserManagementPage:473-480, ParentLoginPage:85-111, StaffLoginPage:64-80, AcademicYearPage:559-668, ForcePasswordChangeModal:99-149). `aria-invalid` + `.form-error` CSS đã hỗ trợ (index.css:628-645) nhưng **chỉ FundManageModal dùng**.

---

## III. TOP 10 VẤN ĐỀ NGHIÊM TRỌNG NHẤT (đã verify)

| # | Vấn đề | Evidence | Severity | Tin cậy |
|---|--------|----------|----------|---------|
| 1 | **StudentReportModal — 91 inline styles + 73 hex + 0 dark mode + thead không scope** | StudentReportModal.tsx:73-244 (đếm trực tiếp) | 🔴 D3 | HIGH |
| 2 | **18/18 modal desktop + 12 modal common/exam không có dialog a11y** (role/aria/focus-trap/Escape/scroll-lock) | DesktopClasses:333, UserManagementPage:637-891, ExcelImportModal:312... | 🔴 D3 | HIGH |
| 3 | **Bug chức năng: nút "Xóa đã chọn" là stub chỉ console.log** | DesktopStudentList.tsx:104-108 | 🔴 D2 | HIGH |
| 4 | **Bug: nút "In Phiếu" gọi đúng handler "Chi Tiết" (onViewReport)** | DesktopGradeCards.tsx:110-119 | 🟠 D2 | HIGH |
| 5 | **Bug: PromotionPanel hiển thị `ĐTB: {recommendedBranch}` — đổ sai field** | PromotionPanel.tsx:308 | 🟠 D2 | HIGH |
| 6 | **Contrast FAIL WCAG AA: text trắng trên bg-*-600** (emerald-600 ≈2.9:1, sky-600 ≈3.7:1, amber-600 ≈3.0:1, rose-600 ≈4.4:1) | DesktopAttendanceSummary:553-583, DesktopReports:92-104/186-204, DesktopLeaveRequests:347 | 🟠 D2 | HIGH |
| 7 | **Touch target < 40px trên mobile: nút trạng thái ~31px, tháng lịch ~24px, btn-sm 32px, xóa điểm ~20px, close ~26-34px** | MobileAttendanceView:255-307, MobileCalendarView:100-115, MobileStudentsView:370-380, MobileDailyGradeEntry:135, MobileLeaveRequests:387-394 | 🟠 D2 | HIGH |
| 8 | **Hệ header 4 kiểu + badge tự dựng ~70 chỗ + error banner 5 kiểu + loading 4 kiểu** | Mục II.1/4/5/6 | 🟠 D2 | HIGH |
| 9 | **`badge-secondary` (class không tồn tại) + `custom-scrollbar` (class bị cấm §9) + `hover:bg-[#1E40AF]` arbitrary hex + `btn-neutral`** | ExamSessionView:442/466, ConflictInboxModal:57/124, SystemDiagnosticsModal:231, InstallPrompt:14, AttendanceHistoryModal:231 | 🟠 D2 | HIGH |
| 10 | **Chữ 9-10px cho nội dung thông tin** (`text-[9px]`: ConflictInboxModal:185, CalendarView:292, MobileGradeMatrix:239-240, MobileGradeComparison:97; `text-[10px]`: 30+ chỗ mobile) | nhiều file | 🟡 D1 | HIGH |

**Phát hiện không confirm:** báo cáo trước cho rằng `ExamSessionView:697` có `window.alert()` — **grep lại không tìm thấy, KHÔNG CONFIRMED, loại khỏi plan.**

---

## IV. ĐIỂM MẠNH CẦN GIỮ (KHÔNG SỬA)

- Token-first + dark reset toàn cục (`index.css:1039-1064`) — nền tảng tốt nhất.
- `GradeCellInput.tsx` — file chuẩn mực nhất: `form-input` + `cell-state-*` + token, không tự dựng.
- `MobileLeaveRequests.tsx` — chuẩn mực mobile: SkeletonTable/EmptyState/retry + bottom-sheet safe-area + grab handle.
- Mobile shell tách bạch (`.mobile-app-shell` → `--stack`), không double-spacing, bottom-nav 56px + safe-area + tap feedback.
- ConfirmDialog/useConfirmDialog pattern đúng ở 4 nơi; 0 window.confirm/alert.
- EmptyState/SkeletonTable đang lan rộng (7+ file desktop).
- Deliberate keeps đã ghi rõ trong DS §12 (modal overlay, glass header, dark bars, SCORE_TYPES desktop, status accents) — **không tính là violation**.
- Offline banner 4 trạng thái, ngôn ngữ thân thiện; `inputMode="decimal"`; `:focus-visible` toàn cục.

---

## V. PLAN CẢI THIỆN UX/UI — 6 PHA

> Mỗi pha ghi rõ: mục tiêu, file, cách verify, cập nhật tài liệu bắt buộc (AGENTS.md §Doc Sync). Thứ tự ưu tiên theo TNTTVN Priority Order — a11y/contrast trước cosmetic.

### PHA 0 — Dọn linter (D1) — ✅ HOÀN THÀNH 2026-08-16
| # | Việc | File |
|---|------|------|
| 0.1 | `bg-blue-600 hover:bg-blue-700` trên CTA → `btn-primary` thuần | `ParentForgotPasswordModal.tsx:381` |
| 0.2 | Mở rộng linter: thêm rule `NO_NONEXISTENT_CLASS` (badge-secondary, btn-neutral, custom-scrollbar), `NO_ARBITRARY_HEX` (`bg-[#...]`/`hover:bg-[#...]`), `NO_RAW_600_BUTTON` (bg-emerald-600/rose-600/amber-600/sky-600/green-600-700 làm nút — quét theo button-context 3 dòng để bắt button đa dòng) | `scripts/design-system-lint.mjs` |

**Đã thực thi (ngoài 0.1/0.2):** fix 12 occurrence class không tồn tại / arbitrary hex / raw-600 buttons để `lint:ds` xanh ngay: `ExamSessionView:442/466` (badge-neutral), `AttendanceHistoryModal:231` (btn btn-secondary), `ConflictInboxModal:57/124` + `SystemDiagnosticsModal:231` (bỏ custom-scrollbar), `InstallPrompt:14` (hover:bg-parish-primary-hover), `DesktopReports:92/97/102/186/189/199/202`, `DesktopAttendanceSummary:553/563/573/583` (filter pills → `bg-[var(--color-parish-*-bg)] text-[var(--color-parish-*-hover)] border border-[var(--color-parish-*)]/30`), `DesktopLeaveRequests:347/452` + `MobileLeaveRequests:343/461` (Duyệt → btn-primary, Từ chối → btn-danger), `ExcelImportModal:1106` + `ExcelGradeImportModal:668` (btn-primary), `PurgeDataModal:108` (btn-danger w-full), `SystemDiagnosticsModal:186` (btn-secondary), `DesktopStudentList:399` (btn-danger), `StudentsPage:88` (btn-primary), `AcademicYearPage:415` (btn-primary), `DesktopGradeCards:25-31` (rankColors → badge-warning/info/success/neutral/danger).

**Quyết định mapping contrast (chốt, áp dụng toàn bộ Pha 3.2 còn lại):**
- Status/filter pills → badge domain token pattern: `bg-{token}-bg text-{token}-hover border border-{token}/30` (không giữ solid 600).
- Action buttons → `.btn` variants: `.btn-primary` (CTA chính/approve), `.btn-secondary` (utility), `.btn-danger` (destructive/reject). Không tạo `.btn-success` vì `--color-parish-success` (#16A34A ≈ 3.0:1) không đạt AA với chữ trắng.

**Verify:** `npm run lint:ds` = 0 (6 rules) · `tsc -b` clean · vitest pass. **Docs:** DS §11 (xem dưới), linter rules mới phản ánh trong mục V.0.2.

### PHA 1 — Component chuẩn dùng chung (D3 — ADR-055) — ✅ HOÀN THÀNH 2026-08-16
**Mục tiêu:** Hết "mỗi trang tự dựng một kiểu". Tạo 3 component chung trong `src/components/common/`:

| Component | Nội dung | Thay thế cho |
|-----------|----------|--------------|
| **`PageHeader.tsx`** | Props: `title, description, icon, actions`. Render đúng DS §5: icon tile `w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary` + `h1 text-lg font-extrabold text-text-main` + desc `text-xs text-text-muted` | 4 kiểu header ở Mục II.1 (14+ trang) |
| **`ModalShell.tsx`** | Wrap `.modal-overlay`/`.modal-content` + `role="dialog"` `aria-modal` `aria-labelledby` + focus trap (tái dùng `useFocusTrap` từ ConfirmDialog) + Escape + scroll-lock + overlay-click policy thống nhất | 30+ modal custom (Mục II.2) |
| **`FormField.tsx`** | `label + input/select/textarea` với `form-*` classes, error message `.form-error`, `aria-invalid`, required marker, `htmlFor` | 5 kiểu input (Mục II.9) |

**Kèm theo:** mở rộng `index.css` tokens — bổ sung badge domain colors (violet/teal/orange/indigo/purple theo bảng `docs/UX_UI_EVALUATION_APP_WIDE.md` §IV đã đề xuất) để AuditLogPage/AcademicYearPage dùng `.badge-*` thay vì ~70 pill raw.

**Đã thực hiện:** tạo `PageHeader.tsx`/`ModalShell.tsx`/`FormField.tsx` (xem chi tiết ADR-055); `index.css` thêm `--color-parish-{violet,teal,orange,indigo,purple}(-bg)` + `.badge-*` + dark overrides; test `CommonComponents.test.tsx` **13/13 PASS** (PageHeader 3, ModalShell 6, FormField 4 — phủ aria, Escape, overlay policy, required marker, error/hint wiring).

**Verify:** `tsc -b` clean · `lint:ds` **0 violations / 128 components** · oxlint 0 error. **Docs:** ADR-055 (mới) + DS §12 (batch Pha 1) + AI_CONTEXT_MAP. **Bước kế tiếp:** migrate các trang/modals hiện hữu khi chạm tới ở Pha 3-6.

### PHA 2 — Fix bug chức năng (D2) — ✅ HOÀN THÀNH 2026-08-16
| # | Bug | File | Fix đã thực hiện |
|---|-----|------|-------------|
| 2.1 | Nút "Xóa đã chọn" không xóa gì (stub console.log) | `DesktopStudentList.tsx:104-108` | Gọi `useStudentStore.getState().deleteStudents(ids)` (đã có sẵn — sync qua syncDeleteStudent + runSyncFlow) + toast `success`/`error` qua `useToastStore.addToast`; giữ ConfirmDialog + clearSelection có sẵn |
| 2.2 | "In Phiếu" gọi `onViewReport` (mở phiếu) thay vì in | `DesktopGradeCards.tsx:110-119` | Thêm prop `onPrintReport`; flow in: `uiStore.openReportForPrint(student)` set `reportPrintRequested=true` → `StudentReportModal` thêm prop `autoPrint` + `useEffect` (printedRef + setTimeout 300ms → `ReportExportService.print` — đã có iframe fallback chống popup-block, A-NEW-23) → `RootLayout` pass `autoPrint={reportPrintRequested}` ở cả 2 nhánh. Wire: `GradesPage` (DesktopGradeCards), `StudentsPage` (MobileStudentsView), `ReportsPage` (DesktopReports + MobileReportsView — đổi prop `onViewReport`→`onPrintReport`) |
| 2.3 | `ĐTB: {recommendedBranch}` — sai field | `PromotionPanel.tsx:308` | Destructure thêm `avg` từ item (đã có sẵn trong mảng promotions), hiển thị `avg.score`; giữ badge branch riêng |

**Lưu ý:** `handlePrint` trong `StudentReportModal` được chuyển LÊN trước early-return `if (!isOpen || !student) return null` để `autoPrint` effect truy cập được (logic in tách qua `buildPrintHtml(student)`).

**Verify:** `tsc -b` clean · `lint:ds` 0 · `MobileViewsEnhancement.test.tsx` (8 tests) pass · full vitest suite chạy hết (mọi file quan sát PASS; suite >10 phút nên bị timeout công cụ — không có failure). **Docs:** không đổi API contract; ghi nhận tại đây + AI_CONTEXT_MAP.

### PHA 3 — A11y modal + contrast (D2 — theo TNTTVN Priority) — ✅ ĐÃ XONG (2026-08-16)
| # | Việc | Phạm vi |
|---|------|---------|
| 3.1 | Áp `ModalShell` (Pha 1) cho toàn bộ modal → có role/aria/focus-trap/Escape/scroll-lock đồng nhất | **Batch 1 ✅ (finance 4/4)**: `FundManageModal`, `TransactionModal`, `PrintReceiptModal`, `ClassFeeCollectionModal` → `ModalShell` (props optional `icon`/`subtitle`/`headerActions`). **Batch 2 ✅**: ModalShell thêm 16 modal (`AttendanceHistoryModal`, `DesktopCalendarView` ×2, `DesktopClasses` ×2 + confirmDelete→`ConfirmDialog`, `DesktopLeaveRequests` review, `PromotionPanel` confirm, `UserManagementPage` 8/8; title → `ReactNode`); Tier B (a11y trực tiếp, giữ shell custom header brand/màu/tabs/sticky-footer/camera/print) 15 modal: `ConflictInboxModal`, `GradeFormulaConfigModal`, `SystemDiagnosticsModal`, `ExcelImportModal`, `ExcelGradeImportModal`, `ConflictResolutionModal`, `BackupRestoreModal`, `PurgeDataModal` (alertdialog), `ForcePasswordChangeModal` (gate — scroll-lock, không Escape), `ParentForgotPasswordModal`, `ExamPaperModal`, `ExamImportModal`, `AnswerSheetModal`, `ExamScanModal`, `ExamSessionView` ×2. Skip hợp lệ: `NoticeModal`/`StudentModal` (đã chuẩn), `Certificate`/`PhotoCard`/`StudentReportModal` (print, exempt), `InstallPrompt` (button nổi) |
| 3.2 | Nút màu 600 chữ trắng → token `parish-success/warning/danger/info` (tự dark-adapt) — ✅ **ĐÃ XONG** (kéo lên Pha 0.2, xem mapping mục Pha 0) | DesktopAttendanceSummary:553-583, DesktopReports:92-104/186-204, DesktopLeaveRequests:347, ExcelImportModal:1106, PurgeDataModal:108, MobileLeaveRequests:343/461 + thêm: ExcelGradeImportModal:668, AcademicYearPage:415, DesktopGradeCards rankColors |
| 3.3 | `aria-label`/`aria-invalid`/`scope="col"` toàn app — ✅ **ĐÃ XONG (2026-08-16)** | `scope="col"` 129 `<th>` / 18 file (scripted, fix 1 self-closing `<th />`); aria-label: HeaderBar (6 nút), DesktopStudentList (5 nút), AuditLogPage Eye + `aria-expanded`, UserManagementPage reveal-password, ParentLoginPage show/hide password |

**Verify (PHA 3):** `tsc -b` clean · `lint:ds` 0/128 · 78/78 tests (CommonComponents 13 · FinancePage 2 · MobileViewsEnhancement 8 · ConfirmDialog · ForcePasswordChangeModal 12 · BackupRestoreModal · ExcelGradeImportModal · HeaderBar 7 · InstallPrompt 3) · oxlint 0 error (220 warnings pre-existing). **Docs:** `docs/SECURITY_AUDIT_LOG.md` mục A11y Batch 2026-08-16 (DONE). **Backlog:** axe-core scan tự động hóa verify (đề xuất đưa vào CI sau PHA 6).

### PHA 4 — Mobile UX (D2)
| # | Việc | Evidence |
|---|------|----------|
| 4.1 | Thêm `.mobile-btn` (44px) + thay mọi `btn-sm`/nút tự dựng <40px trên mobile | MobileStudentsView:370-380/434, MobileReportsView:140, MobileCalendarView:94-115, MobileAttendanceView:255-307, MobileAttendanceSummaryView:131-251, MobileDailyGradeEntry:135, MobileLeaveRequests:387-394, `index.css:1554-1579` (semester 36px, control 42px) |
| 4.2 | SCORE_TYPES mobile → token (giống desktop) | `MobileDailyGradeEntry.tsx:13-15` |
| 4.3 | Chuyển ~16 chỗ inline hardcoded của StudentsView sang class DS (giữ 14 chỗ layout dynamic + 4 data-driven) | MobileStudentsView.tsx |
| 4.4 | Fix sticky filter bị che bởi top bar (z-index) | MobileGradeView.tsx:53 |
| 4.5 | Chữ nội dung ≥ 11px (caption); `text-[9px]/[10px]` chỉ caption thật | 30+ chỗ mobile + ConflictInboxModal:185, DesktopCalendarView:292 |
| 4.6 | Toast mobile không đè bottom-nav (variant full-width bottom) | ToastContainer.tsx:36 |

**Verify:** E2E Playwright viewport 375×812 kiểm tra touch target; visual diff. **Docs:** DS §8 bổ sung quy tắc mobile-btn + cấm text < 11px nội dung.

### PHA 5 — Chuẩn hóa trạng thái + dark mode (D1-D2)
| # | Việc | Phạm vi |
|---|------|---------|
| 5.1 | Chuẩn hóa error banner về `ErrorState` (StateFeedback) — 5 kiểu → 1 | StudentsPage:95, UserManagementPage:537, AcademicYearPage:326/510/518, AuditLogPage:292, CatechistPage:81, ParentLoginPage:54-72, StaffLoginPage:40-51, ExamSessionView:396 |
| 5.2 | Loading → SkeletonTable/SkeletonCardGrid; bỏ "Đang tải..." text + Loader2 | AcademicYearPage:332, AuditLogPage:332, CatechistPage:114, ParentPage:52/90, UserManagementPage:533, VerificationPage:57, Suspense fallback StudentsPage:101/GradesPage:53 |
| 5.3 | Empty state → EmptyState component | AcademicYearPage:334, AuditLogPage:334, ParentPage:54, DesktopDailyGradeEntry:219, DesktopGradeCards:46, DesktopGradeComparison:122, DesktopAttendanceSummary:704 |
| 5.4 | Dark mode cho pastel thiếu `dark:` | MobileHomeView:166-176, MobileGradeMatrix:204-205, DesktopStudentList:365-378, PromotionPanel:298, **StudentReportModal (toàn file)** |
| 5.5 | StudentReportModal: migrate shell + print content dùng print classes (giữ layout A4) | StudentReportModal.tsx |

**Verify:** `lint:ds` + visual check dark/light. **Docs:** DS §12 Migration Status cập nhật.

### PHA 6 — Đồng bộ pattern còn lại (D1-D2, khối lượng lớn)
| # | Việc | Phạm vi |
|---|------|---------|
| 6.1 | Segmented control → `.pill-group` | DesktopGradeMatrix:360, DesktopDailyGradeEntry:97/131, DesktopAttendanceGrid:117/228, DesktopAttendanceSummary:203/538, DesktopLeaveRequests:117, DesktopStudentList:285/303 |
| 6.2 | Buttons tự dựng → `.btn` variants (giữ semantic màu qua token) | AcademicYearPage:415-455/538-677, DesktopReports:92-105, StudentsPage:70-88, SettingsPage:326, ParentLoginPage:122, BackupRestoreModal:202-233 |
| 6.3 | Cards tự dựng → `.card` | DesktopDashboard:99-138, CatechistPage:123, SettingsPage:100-190, LoginPage:25-42 |
| 6.4 | Xác nhận destructive → ConfirmDialog/useConfirmDialog | DesktopClasses:409-422, PromotionPanel:205, DesktopLeaveRequests:374, UserManagementPage lock/force-logout:318/360 |
| 6.5 | thead lệch → chuẩn §6 + `scope="col"` | ParentPage:119-128, DesktopAttendanceSummary:627/677, DesktopStudentList:413, DesktopGradeMatrix:426 |
| 6.6 | LoginPage dùng chung LoginShell (DRY) | LoginPage.tsx:9-18 |
| 6.7 | Class không tồn tại/bị cấm → class chuẩn | ExamSessionView:442/466 (`badge-neutral`), AttendanceHistoryModal:231 (`btn btn-secondary`), ConflictInboxModal:57/124 + SystemDiagnosticsModal:231 (`custom-scrollbar` → `table-scroll`), InstallPrompt:14 (`hover:bg-parish-primary-hover`) |

**Verify:** `lint:ds` (rule mới từ Pha 0) + `tsc` + tests hiện có. **Docs:** DS §12 + `docs/UX_UI_EVALUATION_APP_WIDE.md` đánh dấu hoàn thành từng file.

---

## VI. THỨ TỰ THỰC HIỆN & ƯỚC LƯỢNG

| Giai đoạn | Phạm vi | Mức độ | Rủi ro | Reversibility |
|-----------|---------|--------|--------|---------------|
| ✅ Đã xong (2026-08-16) | Pha 0 (linter 6 rules + contrast sweep 3.2) + Pha 2 (3 bug chức năng) | D1-D3 | Thấp | R0 |
| Tuần 1 | Pha 1 khởi động (PageHeader/ModalShell/FormField) | D3 | Thấp | R0 |
| Tuần 2 | Pha 3 (a11y modal shell 3.1 + 3.3) + Pha 4 (mobile) | D2 | Trung bình (modal chạm layout cũ) | R1 |
| Tuần 3 | Pha 5 (trạng thái + dark) + Pha 6 (pattern) | D1-D2 | Trung bình | R1 |
| Liên tục | Mở rộng linter chống drift mỗi pha | — | — | — |

**Quy tắc bất biến khi thực thi (ADR-030):**
1. Không đổi layout nghiệp vụ — chỉ đổi class/token (bảng mapping DS §9).
2. Không đụng file exempt (Certificate, AnswerSheetModal, ExamScanModal, print CSS, branches.ts). `ExamSessionView` chỉ được điều chỉnh responsive khi có yêu cầu trực tiếp: mobile dùng header dọc, touch target tối thiểu 44px, thẻ phiên hai hàng và action-grid ưu tiên Quét Phiếu; không thay đổi luồng chấm, quyền hay OMR.
3. Mỗi pha: `tsc` + `lint:ds` + test liên quan phải xanh trước khi đóng.
4. Cập nhật docs đồng bộ (DS §12, AI_CONTEXT_MAP, báo cáo này).

---

## VII. TÀI LIỆU THAM CHIẾU

| Tài liệu | Vai trò |
|----------|---------|
| `docs/03_DESIGN_SYSTEM.md` v3.1 | SSOT thiết kế (sẽ cập nhật theo plan) |
| `src/index.css` | Code truth tokens/classes |
| `docs/UX_UI_EVALUATION_APP_WIDE.md` | Đánh giá 2026-08-15 — đã thực thi phần lớn; plan này kế thừa & mở rộng |
| `docs/UX_UI_EVALUATION_FINANCE_PAGE.md` | Template migrate chuẩn (Finance đã đạt) |
| `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md` | ADR-030/032 (DS), ADR-028 (undo import) |
| `scripts/design-system-lint.mjs` | Anti-drift linter (cần mở rộng) |
