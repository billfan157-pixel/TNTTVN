# ⚠️ Tài liệu lịch sử — không còn là nguồn chuẩn

> **Deprecated từ 2026-08-27.** Nguồn chuẩn hiện hành là
> [`docs/03_DESIGN_SYSTEM.md`](docs/03_DESIGN_SYSTEM.md) (Design System v4.1 —
> **Calm, Confident Parish Product**) và implementation token/component trong
> [`src/index.css`](src/index.css). Nội dung v2 bên dưới chỉ được giữ để truy vết;
> không dùng các màu/class hard-code hoặc glassmorphism mặc định của tài liệu này
> cho code mới.

# 🎨 Brave Davinci - Parish Management PWA Design System (Legacy v2)
**Phiên bản:** 2.0 (Historical snapshot)
**Tác giả:** Manus AI  
**Mục tiêu lịch sử:** Ghi lại quy chuẩn UI/UX v2 trước khi được thay thế bởi Design System v4.1.

---

## 1. Triết Lý Thiết Kế (Design Philosophy)
- **Hiện đại & Tinh tế (Modern & Refined):** Sử dụng phong cách **Glassmorphism** kết hợp hiệu ứng kính mờ (`backdrop-blur-sm`), viền sáng nhẹ (`border-white/40`) và bóng đổ mềm mại (`shadow-sm`, `shadow-md`).
- **Tập trung vào Dữ liệu (Data-Dense Readability):** Đảm bảo thông tin giáo lý, điểm số, điểm danh và danh sách thiếu nhi luôn rõ ràng, dễ đọc, không bị che khuất nhờ tối ưu hóa kích thước font chữ và độ rộng cột.
- **Thân thiện Mobile-First:** Trải nghiệm mượt mà trên cả máy tính (Desktop) lẫn thiết bị di động (Mobile PWA) với các thanh điều hướng chuẩn native.

---

## 2. Bảng Màu Hệ Thống (Color Palette)

| Phân loại | Tên Biến / Class | Mã Hex / Tailwind | Mục Đích Sử Dụng |
| :--- | :--- | :--- | :--- |
| **Primary** | `bg-blue-600` / `#2563EB` | Xanh dương chủ đạo | Nút hành động chính (CTA), tab đang chọn, huy hiệu nổi bật |
| **Primary Hover** | `bg-blue-700` / `#1D4ED8` | Xanh đậm | Hiệu ứng khi hover nút chính |
| **Surface Card** | `bg-white/90 backdrop-blur-sm` | Trắng mờ kính | Khung chứa nội dung (Card), Header, Modal containers |
| **Surface App** | `bg-slate-100/80` | Xám nhạt | Nền input, ô tìm kiếm, bảng điều khiển phụ |
| **Text Main** | `text-slate-800` / `#1E293B` | Xám đậm | Tiêu đề chính, họ và tên thiếu nhi, nội dung quan trọng |
| **Text Muted** | `text-slate-400` / `#94A3B8` | Xám vừa | Gợi ý (placeholder), chú thích, thời gian |
| **Success** | `bg-emerald-600` / `#059669` | Xanh lá | Nút lưu, trạng thái hoàn thành, học lực Giỏi/Xuất sắc |
| **Warning** | `bg-amber-500` / `#D97706` | Vàng cam | Trạng thái cần lưu ý, vắng có phép |
| **Danger** | `bg-rose-600` / `#E11D48` | Đỏ | Nút xóa, trạng thái khẩn cấp, vắng không phép |

---

## 3. Quy Chuẩn Bo Góc & Đổ Bóng (Radii & Shadows)

- **Main Containers / Cards:** 
  - Class: `rounded-2xl border border-white/40 shadow-sm bg-white/90 backdrop-blur-sm p-6`
  - Áp dụng cho: Tất cả các khung nội dung, bảng thống kê, header trang.
- **Interactive Elements (Buttons, Inputs, Selects):**
  - Class: `rounded-xl border border-slate-200 bg-slate-100/80 px-4 py-2.5 text-sm font-semibold transition-all shadow-inner`
  - Áp dụng cho: Ô tìm kiếm, hộp chọn (select), nút bấm hành động.
- **Badges & Pills:**
  - Class: `rounded-full px-3 py-1 text-xs font-bold`

---

## 4. Quy Chuẩn Kiểu Chữ (Typography Hierarchy)

| Thành Phần | Cỡ Chữ (Tailwind) | Độ Đậm (Font Weight) | Màu Sắc |
| :--- | :--- | :--- | :--- |
| **Tiêu đề trang (Page Title)** | `text-lg md:text-xl` | `font-extrabold` | `text-slate-800` |
| **Tiêu đề bảng / Card (Header)** | `text-base` | `font-bold` | `text-slate-800` |
| **Nội dung chính (Họ tên thiếu nhi)**| `text-base` | `font-extrabold` | `text-slate-800` |
| **Mã thiếu nhi / Tên thánh** | `text-sm` | `font-bold` | `text-blue-600` / `text-slate-500` |
| **Tiêu đề cột (Table Headers)** | `text-xs` | `font-bold uppercase` | `text-slate-500` hoặc nền tối `text-white` |
| **Chữ phụ / Chú thích (Metadata)** | `text-xs` | `font-medium` | `text-slate-400` |

---

## 5. Quy Chuẩn Bảng Biểu (Tables & Grids)

1. **Độ rộng cột tối thiểu (Min Width):** Các cột chứa tên người hoặc dữ liệu quan trọng phải được định nghĩa rõ ràng trong thẻ `<colgroup>` để tránh bị cắt cụt (cắt chữ).
   - Ví dụ cột *Họ và Tên*: Tối thiểu `w-[240px]` đến `w-[260px]`.
   - Ví dụ cột *STT*: `w-[60px]`.
   - Ví dụ cột *Tên Thánh*: `w-[120px]`.
2. **Padding hàng:** `px-4 py-3` hoặc `px-5 py-4` để tạo không gian thoáng đãng, dễ nhìn.
3. **Hiệu ứng dòng:** `hover:bg-slate-50/80 transition-colors border-b border-slate-100`.

---

## 6. Mẫu Code Chuẩn (Standard Component Pattern)

### 📄 Khung Trang Tiêu Chuẩn (Page Container)
```tsx
export function StandardPage() {
  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto p-6">
      {/* Header Bar */}
      <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl border border-white/40 shadow-sm flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Tiêu Đề Trang</h1>
          <p className="text-sm font-medium text-slate-400 mt-1">Mô tả chi tiết chức năng của trang</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all">
            Hành Động Chính
          </button>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-white/40 shadow-sm p-6">
        {/* Nội dung bên trong */}
      </div>
    </div>
  )
}
```

---
*Tài liệu này là chuẩn mực bắt buộc cho mọi thành phần UI trong dự án Brave Davinci.*
