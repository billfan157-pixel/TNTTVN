# Mobile UI Audit & Optimization — 2026-08-22

## Scope & Method

Audit giao diện chế độ mobile app (PWA responsive mode) sau đợt refactor shell ngày 2026-08-12 (`mobile-native-ui-audit-2026-08-12.md` — đã xử lý MobileAppShell / MobileTopBar / BottomNav / safe-area). Đợt này quét **lớp màn hình thực dụng**: 16 file `src/components/mobile/*.tsx`, đối chiếu token DS trong `src/index.css`.

Phương pháp: agent sweep toàn bộ 16/16 file theo checklist anti-pattern (touch target, hardcoded offset, font nhỏ, tràn ngang, modal/sheet, loading/error state, dark mode, inline màu cứng) → verify thủ công từng vị trí HIGH trước khi sửa (Decision Matrix v4.1.2, evidence-first).

## Findings đã xác minh (bằng chứng file:line)

| # | Vị trí | Vấn đề | Mức độ |
|---|--------|--------|--------|
| 1 | `MobileDailyGradeEntry.tsx:135` | Nút **xóa điểm** ~20×20px (`p-1` + icon 12) — hành động phá hủy dữ liệu với vùng chạm 1/4 chuẩn | 🔴 HIGH |
| 2 | `MobileHomeView.tsx:160,190` | Link "Chi tiết"/"Tất cả" ~18px cao, không vùng chạm | 🔴 HIGH |
| 3 | `MobileAttendanceView.tsx:107,118,129` | 3 subtab điều hướng chính (Điểm Danh/Tổng Hợp/Đơn Xin Nghỉ) ~32px | 🔴 HIGH |
| 4 | `MobileGradeView.tsx:53` vs `index.css` `.mobile-top-bar` z-950 | Filter bar sticky `top-0 z-20` trượt vào sau top bar → bị che khi cuộn danh sách điểm dài | 🟠 MED-HIGH |
| 5 | Dark mode gãy hàng loạt: `MobileHomeView.tsx:94,114,166-177`; `MobileGradeMatrix.tsx:204-209`; `MobileGradeComparison.tsx:58-59` | Khối pastel `*-50/*-200` không có variant `dark:` — chói lóa trong theme tối ở đúng các màn hình chính (Trang chủ, Ma trận điểm, So sánh HK) | 🔴 HIGH |
| 6 | `MobileLeaveRequests.tsx:363-366` | Bottom sheet xét duyệt đơn: **không khóa cuộn nền**, overlay không đóng khi chạm | 🟠 MED |
| 7 | `NoticeModal.tsx` (common, dùng cả mobile) | Modal thiếu scroll-lock nền (khác hành vi ModalShell) | 🟠 MED |
| 8 | `MobileHomeView.tsx:61` | `pb-12` trùng lặp clearance — shell đã sở hữu padding-bottom (`MobileAppShell` contract) | 🟡 LOW-MED |
| 9 | Font nội dung chính quá nhỏ: `MobileGradeComparison.tsx:93,97,98` (10/9/11px trên điểm số), thẻ học lực Home `text-[10px]` | Dữ liệu chính hiển thị cỡ hint | 🟡 MED |

**Positive (tuân thủ, không cần sửa):** không có `<table>` tràn ngang; không dùng `window.confirm/alert` (đúng ConfirmDialog); SkeletonTable/EmptyState đúng chuẩn; `.mobile-floating-action`/`.mobile-bottom-action-bar` dùng đúng primitive; ConfirmDialog trong MobileTopBar/MobileStudentsView đạt a11y.

## Fixes implemented (2026-08-22)

| Fix | File(s) | Chi tiết |
|-----|---------|----------|
| F1 — Nút xóa điểm mở rộng vùng chạm | `MobileDailyGradeEntry.tsx` | Thêm `relative after:-inset-2.5 after:content-['']` — hit area +20px mỗi phía mà không phá layout chip |
| F2 — Link Trang chủ đạt 44px | `MobileHomeView.tsx` ×2 | `-m-2 p-2 min-h-[44px]` (negative-margin trick: layout giữ nguyên, vùng chạm mở rộng vào khoảng trắng xung quanh) |
| F3 — Subtab Điểm Danh ≥44px | `MobileAttendanceView.tsx` ×3 | Thêm `min-h-[44px]` |
| F4 — Sticky filter dưới top bar | `src/index.css` + `MobileGradeView.tsx` | Biến mới `--mobile-topbar-clearance: calc(62px + var(--mobile-top-safe-area))` + class `.mobile-sticky-under-topbar` (sticky top = chiều cao top bar + safe area); thay `sticky top-0 z-20` |
| F5 — Dark mode cho khối pastel | `MobileHomeView.tsx` (2 tile + 3 thẻ học lực), `MobileGradeMatrix.tsx` (3 pill + banner HK khóa), `MobileGradeComparison.tsx` (4 badge + màu trend) | Thêm `dark:bg-*-950/60 dark:border-*-900 dark:text-*-300/400` theo hệ |
| F6 — Bottom sheet xét duyệt | `MobileLeaveRequests.tsx` | Body scroll-lock khi sheet mở (+cleanup); overlay `onClick` đóng + `role="presentation"` |
| F7 — NoticeModal scroll-lock | `NoticeModal.tsx` | Effect khóa `document.body.style.overflow` khi open (đồng bộ ModalShell, áp cả desktop) |
| F8 — Bỏ pb-12 trùng lặp | `MobileHomeView.tsx:61` | Shell là chủ sở hữu duy nhất bottom clearance |
| F9 — Font nội dung chính | `MobileGradeComparison.tsx`, `MobileHomeView.tsx` | Điểm số 11→12px, nhãn cột 9→10px, xếp loại 10→11px, thẻ học lực 10→11px |

## Verification

| Check | Kết quả |
|-------|---------|
| `tsc -b` | ✅ 0 error |
| oxlint (toàn thư mục mobile + NoticeModal) | ✅ 0 error mới — 3 warning unused-vars **pre-existing** trong `MobileCalendarView.tsx` (file không đụng tới) |
| `lint:ds` | ✅ 0 violations / 134 components |
| Vitest `MobileViewsEnhancement.test.tsx` | ✅ 8/8 PASS |
| `build:frontend` (Vite PWA) | ✅ pass, SW precache generated |

## Follow-ups (chưa làm — ghi nhận cho đợt sau)

1. **Desktop modal nhúng trong mobile**: `ExcelGradeImportModal` (max-w-5xl), `AttendanceHistoryModal` (672px), `GradeFormulaConfigModal` hiển thị dạng centered dialog trên màn hình nhỏ — cân nhắc chuyển sang bottom-sheet qua breakpoint của ModalShell.
2. **iOS auto-zoom**: inputs `fontSize < 16px` (ví dụ `MobileAttendanceView` 12.5px) gây zoom khi focus — cân nhắc rule toàn cục `font-size: 16px` cho input/select trong mobile shell.
3. **Badge phân ngành** dùng hex pastel từ `branches.ts` (inline style, không dark variant) — cần redesign token hai tầng light/dark.
4. **Dot màu phụng vụ** (`LITURGICAL_COLORS.hex` gần trắng `#F8FAFC`) tàng hình trên card sáng — cần thêm viền/đổi giá trị.
5. **NoticeModal focus trap** đầy đủ (hiện chỉ có Escape + scroll-lock).
6. 3 warning oxlint pre-existing trong `MobileCalendarView.tsx` (unused vars).
