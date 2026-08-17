# 📋 ĐÁNH GIÁ UX/UI TRANG "QUỸ THU CHI" & PLAN NÂNG CẬP

**Ngày đánh giá:** 2026-08-15
**Ngày cập nhật lần cuối:** 2026-08-15 (tất cả phases hoàn thành)
**File đánh giá:** `src/pages/FinancePage.tsx` + 4 modals (`TransactionModal`, `ClassFeeCollectionModal`, `FundManageModal`, `PrintReceiptModal`)
**Design System tham chiếu:** `docs/03_DESIGN_SYSTEM.md` v3.1 + `src/index.css`

---

## I. TỔNG QUAN HIỆN TRẠNG

Trang `FinancePage.tsx` quản lý quỹ và thu chi Xứ Đoàn TNTT với 4 modals phụ:
- `TransactionModal` — tạo phiếu thu/chi/chuyển quỹ
- `ClassFeeCollectionModal` — sổ thu niên liễm theo lớp
- `FundManageModal` — quản lý danh mục quỹ
- `PrintReceiptModal` — xem trước & in phiếu

---

## II. CÁC VẤN ĐỀ ĐÃ ĐƯỢC PHÁT HIỆN & FIX

### ✅ Phase 1: Design System Compliance (HOÀN THÀNH)

| # | Vấn đề | File | Trạng thái |
|---|--------|------|------------|
| 1.1 | Nút action dùng inline styles | `FinancePage.tsx` | ✅ Migrate sang `.btn .btn-sm` + domain color tokens |
| 1.2 | Cards viết thủ công | `FinancePage.tsx` | ✅ Migrate sang `.card` |
| 1.3 | Fund filter pills viết thủ công | `FinancePage.tsx` | ✅ Migrate sang `.pill-btn .pill-btn-primary/.pill-btn-secondary` |
| 1.4 | Forms viết thủ công | `TransactionModal.tsx`, `ClassFeeCollectionModal.tsx`, `FundManageModal.tsx` | ✅ Migrate sang `.form-group/.form-label/.form-input/.form-select/.form-textarea` |
| 1.5 | Bảng viết thủ công | `FinancePage.tsx`, `ClassFeeCollectionModal.tsx` | ✅ Migrate sang `.table-wrapper .table-scroll` + thead chuẩn §6 |
| 1.6 | Badges viết thủ công | `FinancePage.tsx`, `ClassFeeCollectionModal.tsx` | ✅ Migrate sang `.badge-*` classes |
| 1.7 | Typography không chuẩn hóa | Tất cả finance files | ✅ Apply `.typography-page-title`, `.typography-card-title`, `.typography-numeric-emphasis`, `.typography-caption`, `.typography-body-sm` |
| 1.8 | Màu hard-coded thay vì tokens | `index.css` + tất cả finance files | ✅ Define `--color-finance-income/expense/transfer` tokens + dark mode overrides |

### ✅ Phase 2: UX Improvements (HOÀN THÀNH)

| # | Vấn đề | File | Trạng thái |
|---|--------|------|------------|
| 2.1 | Không có loading skeleton | `FinancePage.tsx` | ✅ Thêm `SkeletonCardGrid` + `SkeletonTable` |
| 2.2 | Delete dùng `window.confirm()` | `FinancePage.tsx` | ✅ Thay bằng `ConfirmDialog` với focus trap |
| 2.3 | Không có toast feedback | `FinancePage.tsx` | ✅ Thêm `useToastStore` + toast sau khi xóa |
| 2.4 | Empty state viết thủ công | `FinancePage.tsx`, `ClassFeeCollectionModal.tsx` | ✅ Thay bằng `EmptyState` component |
| 2.5 | Type filter pills thủ công | `ClassFeeCollectionModal.tsx` | ✅ Migrate sang `.pill-group .pill-group-item` |

### ✅ Phase 3: Dark Mode (HOÀN THÀNH)

| # | Vấn đề | File | Trạng thái |
|---|--------|------|------------|
| 3.1 | Raw `dark:` variants | `FinancePage.tsx` | ✅ Thay bằng token-based CSS vars |
| 3.2 | Status badges dùng raw dark colors | `ClassFeeCollectionModal.tsx` | ✅ Thay bằng `.badge-*` |
| 3.3 | Error banner không có dark variant | `TransactionModal.tsx` | ✅ Dùng domain tokens + `color-mix()` |

### ✅ Phase 4: Accessibility (HOÀN THÀNH)

| # | Vấn đề | File | Trạng thái |
|---|--------|------|------------|
| 4.1 | Bảng không có `scope` cho `<th>` | `FinancePage.tsx`, `ClassFeeCollectionModal.tsx` | ✅ Thêm `scope="col"` |
| 4.2 | Modal focus trap | `ConfirmDialog.tsx` | ✅ `useFocusTrap` |
| 4.3 | SVG chart không có ARIA | `FinancePage.tsx` | ✅ `role="img"` + `aria-label` |
| 4.4 | Nút xóa không confirmation accessible | `FinancePage.tsx` | ✅ `ConfirmDialog` |

### ✅ Phase 5: Remaining Issues (HOÀN THÀNH)

| # | Vấn đề | File | Trạng thái |
|---|--------|------|------------|
| 5.1 | **Pagination缺失** | `api.ts`, `financeStore.ts`, `FinancePage.tsx` | ✅ Backend hỗ trợ `limit/offset`, API trả `{data, total}`, store track `pagination` state, UI pagination controls |
| 5.2 | **Mobile card view** | `FinancePage.tsx` | ✅ Responsive: `hidden sm:block` cho desktop table, `sm:hidden` cho mobile card list |
| 5.3 | **Date range filter** | `FinancePage.tsx` | ✅ Thêm 2 date inputs (`startDate`, `endDate`) filter client-side |
| 5.4 | **`handleCollectAll` dùng `window.confirm`** | `ClassFeeCollectionModal.tsx` | ✅ Thay bằng `ConfirmDialog` với state `isCollectAllConfirmOpen` |
| 5.5 | **Search debounce** | `FinancePage.tsx` | ✅ Thêm `debouncedSearch` state với 300ms `setTimeout` |
| 5.6 | **Chart interactive tooltip** | `FinancePage.tsx` | ✅ Custom tooltip div với `onMouseEnter/onMouseLeave`, hiển thị thu/chi VND |
| 5.7 | **Keyboard navigation cho fund pills** | `FinancePage.tsx` | ✅ Thêm `onKeyDown` ArrowLeft/ArrowRight + `role="tab"` + `aria-selected` |
| 5.8 | **ConfirmDialog inline styles** | `ConfirmDialog.tsx` | ✅ Migrate sang `.modal-overlay`, `.modal-content`, `.btn`, `.typography-*` |

---

## III. DOMAIN COLOR TOKENS

Đã thêm vào `src/index.css`:

```css
/* Light Mode */
--color-finance-income: #16A34A;
--color-finance-income-bg: #DCFCE7;
--color-finance-expense: #DC2626;
--color-finance-expense-bg: #FEE2E2;
--color-finance-transfer: #0284C7;
--color-finance-transfer-bg: #E0F2FE;

/* Dark Mode */
--color-finance-income: #4ADE80;
--color-finance-income-bg: #14532D;
--color-finance-expense: #F87171;
--color-finance-expense-bg: #450A0A;
--color-finance-transfer: #38BDF8;
--color-finance-transfer-bg: #0C4A6E;
```

**Cách dùng:** `style={{ color: 'var(--color-finance-income)' }}`

---

## IV. KẾT QUẢ KIỂM TRA

| Kiểm tra | Kết quả |
|----------|---------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| Design System Lint (`npm run lint:ds`) | ✅ 0 violations |
| Unit Tests (FinancePage + ReceiptGenerator) | ✅ 6/6 pass |

---

## V. FILES ĐÃ SỬA

| File | Thay đổi chính |
|------|----------------|
| `src/index.css` | Thêm 12 domain tokens (light + dark) cho finance |
| `src/lib/api.ts` | `getTransactions` trả `{data, total}` thay vì array |
| `src/stores/financeStore.ts` | Thêm `pagination` state, `setPage` action, gửi `limit/offset` params |
| `src/pages/FinancePage.tsx` | Pagination, mobile card view, date range filter, search debounce, chart tooltip, keyboard nav, ARIA |
| `src/components/finance/TransactionModal.tsx` | Rewrite: design system classes, domain tokens |
| `src/components/finance/ClassFeeCollectionModal.tsx` | Rewrite: design system, ConfirmDialog cho handleCollectAll |
| `src/components/finance/FundManageModal.tsx` | Rewrite: design system classes |
| `src/components/finance/PrintReceiptModal.tsx` | Rewrite: design system classes |
| `src/components/common/ConfirmDialog.tsx` | Migrate inline styles → design system classes |
| `src/__tests__/components/FinancePage.test.tsx` | Update mocks cho pagination format |

---

## VI. TÀI LIỆU THAM KHẢO

| File | Mục đích |
|------|----------|
| `docs/03_DESIGN_SYSTEM.md` | Design System v3.1 — SSOT |
| `src/index.css` | Design tokens + component classes |
| `scripts/design-system-lint.mjs` | Anti-drift linter |
| `src/components/common/StateFeedback.tsx` | SkeletonCardGrid, SkeletonTable, EmptyState |
| `src/components/common/ConfirmDialog.tsx` | Confirmation dialog (design system) |
| `src/stores/toastStore.ts` | Toast notification store |
