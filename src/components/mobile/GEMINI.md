# Mobile Subpage Header Standard (DS v4.5 §5)

> Quy tắc bắt buộc cho mọi subpage / subtab trên giao diện mobile.
> Có hiệu lực cho toàn bộ file trong `src/components/mobile/`.

---

## 1. Component bắt buộc

Mọi subpage trên mobile **phải** dùng component `SubpageHeader` từ `../common/SubpageHeader.tsx`.

**KHÔNG** được tự viết khung tiêu đề subpage bằng HTML/JSX rời.

```tsx
import { SubpageHeader } from '../common/SubpageHeader';
```

---

## 2. Thông số kích thước cố định

| Thành phần | Class CSS | Kích thước |
| :--- | :--- | :--- |
| Container | `.subpage-header` | padding `10px 12px`, border-radius `var(--radius-card)` |
| Icon Tile | `.subpage-header__icon` | `28 × 28px`, SVG bên trong `15 × 15px` |
| Actions button | `.subpage-header__btn` | Cao `30px` |
| Actions button icon-only | `.subpage-header__btn--icon-only` | `30 × 30px` |
| Segmented control | `.subpage-header__seg-control` | padding `2px`, gap `2px` |
| Segmented button | `.subpage-header__seg-btn` | Cao `24px`, padding ngang `8px` |

---

## 3. Typography cố định — KHÔNG được thay đổi

| Vai trò | Font-size | Font-weight | Màu |
| :--- | :--- | :--- | :--- |
| Tiêu đề (`__title`) | `13.5px` | `800` | `var(--color-parish-primary)` |
| Meta / mô tả (`__meta`) | `11px` | `550` | `var(--color-text-muted)` |
| Eyebrow (`__eyebrow`) | `10px` | `700` | `var(--color-text-muted)`, uppercase |
| Button text (`__btn`) | `11.5px` | `700` | theo variant |
| Segmented text (`__seg-btn`) | `11px` | `700` | theo trạng thái active |

---

## 4. Cấu trúc props bắt buộc

Mỗi `<SubpageHeader>` phải có tối thiểu:

```tsx
<SubpageHeader
  icon={<IconComponent size={15} />}    // Bắt buộc — Lucide icon size 15
  title="Tiêu đề subpage"               // Bắt buộc
  meta={<span className="truncate">Dòng ngữ cảnh phụ</span>}  // Khuyến khích
/>
```

Các slot tùy chọn:
- `eyebrow` — Dòng tiền tố ngữ cảnh phía trên tiêu đề
- `badge` — Badge trạng thái cạnh tiêu đề
- `actions` — Cụm nút / toggle bên phải hàng tiêu đề
- `children` — Thanh công cụ / bộ lọc bên dưới (render trong `__toolbar`)

---

## 5. Vị trí đặt SubpageHeader

SubpageHeader **phải** là phần tử đầu tiên bên trong container `product-view`:

```tsx
<TabPanel ...>
  <div className="product-view flex flex-col gap-3 pb-8">
    <SubpageHeader ... />    {/* ← Luôn đầu tiên */}
    {/* Nội dung subpage phía dưới */}
  </div>
</TabPanel>
```

---

## 6. Tích hợp bộ lọc vào SubpageHeader

Khi subpage có bộ lọc chung (ví dụ: chọn học kỳ), **phải** gộp trực tiếp vào slot `actions` của `SubpageHeader`, **KHÔNG** tạo thanh lọc riêng biệt (`.mobile-filter-panel` hoặc tương tự).

### Mẫu chuẩn cho semester selector:

```tsx
const renderSemesterActions = () => {
  if (semesterRestricted) {
    return (
      <span className="subpage-header__btn subpage-header__btn--secondary font-bold text-xs shrink-0 pointer-events-none">
        HK {openSemester === 2 ? 'II' : 'I'}
      </span>
    );
  }
  return (
    <div className="subpage-header__seg-control" role="group" aria-label="Chọn học kỳ">
      <button
        type="button"
        onClick={() => { triggerHaptic(8); setSelectedSemester(1); }}
        className={`subpage-header__seg-btn ${selectedSemester === 1 ? 'is-active' : ''}`}
        aria-pressed={selectedSemester === 1}
        aria-label="Học Kỳ I"
      >
        HK I
      </button>
      <button
        type="button"
        onClick={() => { triggerHaptic(8); setSelectedSemester(2); }}
        className={`subpage-header__seg-btn ${selectedSemester === 2 ? 'is-active' : ''}`}
        aria-pressed={selectedSemester === 2}
        aria-label="Học Kỳ II"
      >
        HK II
      </button>
    </div>
  );
};

// Sử dụng:
<SubpageHeader
  icon={<Printer size={15} />}
  title="Tiêu đề"
  meta={<span className="truncate">...</span>}
  actions={renderSemesterActions()}
/>
```

---

## 7. Danh sách 12 subpage hiện tại

Tất cả 12 subpage dưới đây đã được chuẩn hóa. Khi thêm subpage mới, **phải** tuân thủ cùng chuẩn này.

| # | Phân hệ | File | Tiêu đề |
|---|---------|------|---------|
| 1 | Điểm Danh | `MobileAttendanceView.tsx` | Phiên điểm danh |
| 2 | Điểm Danh | `MobileAttendanceSummaryView.tsx` | Tổng Hợp Chuyên Cần |
| 3 | Điểm Danh | `MobileLeaveRequests.tsx` | Đơn Xin Nghỉ Phép |
| 4 | Sổ Điểm | `MobileGradeBoard.tsx` | Bảng điểm |
| 5 | Sổ Điểm | `MobileDailyGradeEntry.tsx` | Nhập Điểm Hằng Ngày |
| 6 | Sổ Điểm | `MobileGradeComparison.tsx` | So Sánh Học Kỳ I vs II |
| 7 | Sổ Điểm | `MobileGradeMatrix.tsx` | Ma trận điểm |
| 8 | Báo Cáo | `MobileReportsView.tsx` | In Phiếu Điểm & Sổ Điểm |
| 9 | Báo Cáo | `MobileReportsView.tsx` | Thống Kê Học Lực Phân Ngành |
| 10 | Báo Cáo | `MobileReportsView.tsx` | Xuất Báo Cáo & Dữ Liệu |
| 11 | Thiếu Nhi | `MobileStudentsView.tsx` | Danh Sách Thiếu Nhi |
| 12 | Thiếu Nhi | `MobileStudentsView.tsx` | Xét Lên Lớp & Chuyển Ngành |
| 13 | Sổ Điểm | `ExamSessionView.tsx` | Chấm Bài Kiểm Tra |
| 14 | Sổ Điểm | `QuestionBankView.tsx` | Ngân Hàng Đề Thi |

---

## 8. CSS classes — Nguồn chính thức

Tất cả class `.subpage-header*` được định nghĩa tại `src/styles/design-system/60-view-language.css`.

**KHÔNG** được:
- Override các giá trị kích thước / font bằng Tailwind inline
- Tạo class mới có prefix `subpage-` ngoài file CSS chính thức
- Dùng `style={{ }}` inline để ghi đè layout của SubpageHeader
