# UI & Design System Synchronization Rules (Catevia / TNTTVN)

> Phạm vi: Toàn bộ giao diện frontend (src/, components/, pages/, styles/).
> Cơ chế: Luôn tự động áp dụng (Always Active) trong toàn bộ phiên làm việc của Agent.

---

## 1. Chuẩn Kích Thước Nút Bấm & Vùng Chạm (Button & Touch Targets)

1. **Chiều cao chuẩn Base Button:** Đồng bộ chuẩn **40px** (`--control-height-md: 40px`, class `.btn`, `.form-input`, `.form-select`).
2. **Chiều cao Compact Button:** **32px** (`.btn-sm`, các nút phụ / icon-only trong toolbar).
3. **Vùng chạm tối thiểu trên Mobile (Touch Target Invariant):**
   - Trên màn hình cảm ứng / mobile (`(pointer: coarse)` hoặc `max-width: 768px`), mọi nút bấm và interactive control **phải có effective hit-area tối thiểu 44 × 44px** (`min-height: max(var(--touch-target-min), 44px)`).
   - Nếu nút có chiều cao thị giác 32px hoặc 40px, phải được bọc padding hoặc pseudo-element mở rộng để đảm bảo vùng chạm thực tế ≥ 44px.

---

## 2. Phân Cấp & Định Dạng Tiêu Đề (Typography Hierarchy)

1. **Quy tắc bất biến:** Tiêu đề màn hình và trang con **luôn luôn lớn hơn, đậm hơn và nổi bật hơn** các nút bấm và phần tử tương tác trong cùng trang.
2. **Tiêu đề Subpage (`SubpageHeader`):**
   - Class: `.subpage-header__title`
   - Kích thước: **20px (1.25rem)**
   - Độ đậm: **800 (`font-extrabold`)**
   - Letter-spacing: **-0.02em**
   - Màu sắc: `var(--color-text-main)` (hoặc `var(--color-parish-primary)`)
3. **Tiêu đề Trang Mobile Chính (`mobile-page-header`):**
   - Class: `.mobile-page-header__title`
   - Kích thước: **20px (1.25rem)**, `font-weight: 800`, `letter-spacing: -0.02em`.
4. **Tiêu đề Trang Desktop (`PageHeader`):**
   - Sử dụng `<PageHeader icon={...} title="..." description="..." actions={...} />`.

---

## 3. Kiến Trúc Modal Chuẩn Hóa (`ModalShell`)

1. **Thành phần bắt buộc:** 100% modal trong ứng dụng **phải sử dụng `<ModalShell>`** từ `src/components/common/ModalShell.tsx`.
2. **CẤM:** Tự viết khung modal với `fixed inset-0`, tự dựng overlay bán trong suốt hoặc tự bắt sự kiện phím Escape riêng rẽ.
3. **Các tính năng tích hợp sẵn của `<ModalShell>`:**
   - Focus trapping chuẩn WCAG 2.1 AA và phục hồi focus khi đóng.
   - Khóa cuộn trang nền (`scroll lock`).
   - Xử lý phím `ESC` và click overlay an toàn qua stack quản lý modal.
   - Tự động chuyển đổi thành **Mobile Bottom-Sheet** mượt mà trên thiết bị di động.
   - Hỗ trợ prop `showCloseButton={false}` cho các modal bắt buộc (ví dụ đổi mật khẩu lần đầu).

---

## 4. Chuẩn Hóa Trạng Thái Rỗng (Empty States)

1. **Thành phần bắt buộc:** Khi danh sách hoặc bảng dữ liệu không có phần tử, **phải sử dụng `<EmptyState>` hoặc `<NoResultState>`** từ `src/components/common/StateFeedback.tsx`.
2. **CẤM:** Hiển thị text trần dạng `<p>Chưa có dữ liệu...</p>` hoặc `<p>Không có kết quả...</p>` không có icon hay hướng dẫn hành động.

---

## 5. Vệ Sinh Màu Sắc & Dark Mode (Semantic Tokens)

1. **CẤM màu pastel thô không thích ứng:** Không sử dụng các class Tailwind thô:
   - `bg-rose-50`, `bg-rose-100`, `text-rose-600`
   - `bg-emerald-50`, `bg-emerald-100`, `text-emerald-600`
   - `bg-amber-50`, `bg-amber-100`, `text-amber-600`
   - `bg-sky-50`, `bg-sky-100`, `text-sky-600`
2. **BẮT BUỘC dùng Semantic Tokens:**
   - **Thành công (Success):** `bg-parish-success-bg text-parish-success border-parish-success/30`
   - **Cảnh báo (Warning):** `bg-parish-warning-bg text-parish-warning border-parish-warning/30`
   - **Nguy hiểm / Lỗi (Danger):** `bg-parish-danger-bg text-parish-danger border-parish-danger/30`
   - **Thông tin (Info):** `bg-parish-info-bg text-parish-info border-parish-info/30`
