# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-guard.spec.ts >> E2E Auth Guard & Navigation >> redirects to /login when accessing protected page without token
- Location: e2e\auth-guard.spec.ts:4:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/login/
Received string:  "http://localhost:5173/students"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    11 × unexpected value "http://localhost:5173/students"

```

```yaml
- banner:
  - img "TNTT Logo"
  - heading "Giáo Lý Thiếu Nhi Thánh Thể" [level=1]
  - text: Giáo Xứ Thánh Gia
  - paragraph: Sổ Điểm & Theo Dõi Học Tập • Niên Học 2025 - 2026 (15 Thiếu Nhi)
  - text: "Lớp:"
  - combobox:
    - option "Tất cả lớp học" [selected]
    - option "Chiên Con 1"
    - option "Ấu Nhi 1"
    - option "Ấu Nhi 2 (Rơmêô)"
    - option "Thiếu Nhi 1"
    - option "Thiếu Nhi 2 (Rơmêô)"
    - option "Nghĩa Sĩ 1"
    - option "Hiệp Sĩ 1"
  - textbox "Tìm tên, mã..."
  - button "HK I"
  - button "HK II"
  - button "Bảng Chẩn Đoán System Telemetry"
  - button "Đăng Nhập"
  - button "Chuyển sang Giao diện Desktop"
  - button "Chuyển sang Giao diện Mobile"
  - button
  - button "Khôi phục dữ liệu gốc"
- complementary:
  - text: CHỨC NĂNG QUẢN LÝ
  - navigation:
    - button "Tổng Quan Giáo Xứ"
    - button "Danh Sách Thiếu Nhi"
    - button "Nhập Điểm Hàng Loạt"
    - button "Điểm Danh Chuyên Cần"
    - button "Báo Cáo & In Phiếu"
    - button "Thông Báo Giáo Xứ"
    - button "Quản Lý Tài Khoản"
  - text: BỘ LỌC PHÂN NGÀNH & LỚP Phân Ngành
  - combobox:
    - option "Tất cả Phân ngành" [selected]
    - option "Chiên Con (4 - 6 tuổi)"
    - option "Ấu Nhi (7 - 9 tuổi)"
    - option "Thiếu Nhi (10 - 12 tuổi)"
    - option "Nghĩa Sĩ (13 - 15 tuổi)"
    - option "Hiệp Sĩ (16 - 18 tuổi)"
  - text: Lớp Học
  - combobox:
    - option "Tất cả Lớp học (7)" [selected]
    - option "Chiên Con 1 - Phòng 101"
    - option "Ấu Nhi 1 - Phòng 102"
    - option "Ấu Nhi 2 (Rơmêô) - Phòng 103"
    - option "Thiếu Nhi 1 - Phòng 201"
    - option "Thiếu Nhi 2 (Rơmêô) - Phòng 202"
    - option "Nghĩa Sĩ 1 - Phòng 301"
    - option "Hiệp Sĩ 1 - Phòng 302"
- main:
  - button "Danh Sách"
  - button "Thăng Tiến"
  - button "Gửi Phiếu Điểm"
  - heading "Danh Sách Thiếu Nhi Giáo Xứ" [level=2]
  - paragraph:
    - text: Hiển thị
    - strong: "15"
    - text: / 15 thiếu nhi theo bộ lọc
  - button "Thêm Thiếu Nhi Mới"
  - table:
    - rowgroup:
      - row "Mã TN Tên Thánh & Họ Tên Ngành & Lớp Ngày Sinh Phụ Huynh & SĐT Điểm TB CCần Thao Tác":
        - columnheader "Mã TN"
        - columnheader "Tên Thánh & Họ Tên"
        - columnheader "Ngành & Lớp"
        - columnheader "Ngày Sinh"
        - columnheader "Phụ Huynh & SĐT"
        - columnheader "Điểm TB"
        - columnheader "CCần"
        - columnheader "Thao Tác"
    - rowgroup:
      - row "TN2025001 Maria Nguyễn Ngọc Anh Hát trong ca đoàn thiếu nhi Ấu Nhi Ấu Nhi 2 (Rơmêô) 2017-05-14 Nguyễn Văn Bình 0903123456 - Chưa có điểm 100% 0/0 Thẻ Maria Nguyễn Ngọc Anh In phiếu Maria Nguyễn Ngọc Anh Chỉnh sửa Maria Nguyễn Ngọc Anh Xóa Maria Nguyễn Ngọc Anh":
        - cell "TN2025001"
        - cell "Maria Nguyễn Ngọc Anh Hát trong ca đoàn thiếu nhi"
        - cell "Ấu Nhi Ấu Nhi 2 (Rơmêô)"
        - cell "2017-05-14"
        - cell "Nguyễn Văn Bình 0903123456"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Maria Nguyễn Ngọc Anh In phiếu Maria Nguyễn Ngọc Anh Chỉnh sửa Maria Nguyễn Ngọc Anh Xóa Maria Nguyễn Ngọc Anh":
          - button "Thẻ Maria Nguyễn Ngọc Anh": 🪪
          - button "In phiếu Maria Nguyễn Ngọc Anh": In
          - button "Chỉnh sửa Maria Nguyễn Ngọc Anh"
          - button "Xóa Maria Nguyễn Ngọc Anh"
      - row "TN2025002 Giuse Trần Hoàng Minh Ấu Nhi Ấu Nhi 2 (Rơmêô) 2017-09-20 Trần Văn Tuấn 0918234567 - Chưa có điểm 100% 0/0 Thẻ Giuse Trần Hoàng Minh In phiếu Giuse Trần Hoàng Minh Chỉnh sửa Giuse Trần Hoàng Minh Xóa Giuse Trần Hoàng Minh":
        - cell "TN2025002"
        - cell "Giuse Trần Hoàng Minh"
        - cell "Ấu Nhi Ấu Nhi 2 (Rơmêô)"
        - cell "2017-09-20"
        - cell "Trần Văn Tuấn 0918234567"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Giuse Trần Hoàng Minh In phiếu Giuse Trần Hoàng Minh Chỉnh sửa Giuse Trần Hoàng Minh Xóa Giuse Trần Hoàng Minh":
          - button "Thẻ Giuse Trần Hoàng Minh": 🪪
          - button "In phiếu Giuse Trần Hoàng Minh": In
          - button "Chỉnh sửa Giuse Trần Hoàng Minh"
          - button "Xóa Giuse Trần Hoàng Minh"
      - row "TN2025003 Phêrô Vũ Đức Anh Ấu Nhi Ấu Nhi 2 (Rơmêô) 2017-03-10 Vũ Quốc Huy 0977345678 - Chưa có điểm 100% 0/0 Thẻ Phêrô Vũ Đức Anh In phiếu Phêrô Vũ Đức Anh Chỉnh sửa Phêrô Vũ Đức Anh Xóa Phêrô Vũ Đức Anh":
        - cell "TN2025003"
        - cell "Phêrô Vũ Đức Anh"
        - cell "Ấu Nhi Ấu Nhi 2 (Rơmêô)"
        - cell "2017-03-10"
        - cell "Vũ Quốc Huy 0977345678"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Phêrô Vũ Đức Anh In phiếu Phêrô Vũ Đức Anh Chỉnh sửa Phêrô Vũ Đức Anh Xóa Phêrô Vũ Đức Anh":
          - button "Thẻ Phêrô Vũ Đức Anh": 🪪
          - button "In phiếu Phêrô Vũ Đức Anh": In
          - button "Chỉnh sửa Phêrô Vũ Đức Anh"
          - button "Xóa Phêrô Vũ Đức Anh"
      - row "TN2025004 Têrêsa Lê Thảo My Ấu Nhi Ấu Nhi 2 (Rơmêô) 2017-11-05 Lê Minh Tâm 0934456789 - Chưa có điểm 100% 0/0 Thẻ Têrêsa Lê Thảo My In phiếu Têrêsa Lê Thảo My Chỉnh sửa Têrêsa Lê Thảo My Xóa Têrêsa Lê Thảo My":
        - cell "TN2025004"
        - cell "Têrêsa Lê Thảo My"
        - cell "Ấu Nhi Ấu Nhi 2 (Rơmêô)"
        - cell "2017-11-05"
        - cell "Lê Minh Tâm 0934456789"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Têrêsa Lê Thảo My In phiếu Têrêsa Lê Thảo My Chỉnh sửa Têrêsa Lê Thảo My Xóa Têrêsa Lê Thảo My":
          - button "Thẻ Têrêsa Lê Thảo My": 🪪
          - button "In phiếu Têrêsa Lê Thảo My": In
          - button "Chỉnh sửa Têrêsa Lê Thảo My"
          - button "Xóa Têrêsa Lê Thảo My"
      - row "TN2025005 Anrê Phạm Gia Bảo Ấu Nhi Ấu Nhi 2 (Rơmêô) 2017-01-18 Phạm Đức Trọng 0988567890 - Chưa có điểm 100% 0/0 Thẻ Anrê Phạm Gia Bảo In phiếu Anrê Phạm Gia Bảo Chỉnh sửa Anrê Phạm Gia Bảo Xóa Anrê Phạm Gia Bảo":
        - cell "TN2025005"
        - cell "Anrê Phạm Gia Bảo"
        - cell "Ấu Nhi Ấu Nhi 2 (Rơmêô)"
        - cell "2017-01-18"
        - cell "Phạm Đức Trọng 0988567890"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Anrê Phạm Gia Bảo In phiếu Anrê Phạm Gia Bảo Chỉnh sửa Anrê Phạm Gia Bảo Xóa Anrê Phạm Gia Bảo":
          - button "Thẻ Anrê Phạm Gia Bảo": 🪪
          - button "In phiếu Anrê Phạm Gia Bảo": In
          - button "Chỉnh sửa Anrê Phạm Gia Bảo"
          - button "Xóa Anrê Phạm Gia Bảo"
      - row "TN2025006 Catarina Đỗ Hoàng Kim Đã xưng tội rơmêô Thiếu Nhi Thiếu Nhi 2 (Rơmêô) 2014-04-12 Đỗ Văn Thành 0912678901 - Chưa có điểm 100% 0/0 Thẻ Catarina Đỗ Hoàng Kim In phiếu Catarina Đỗ Hoàng Kim Chỉnh sửa Catarina Đỗ Hoàng Kim Xóa Catarina Đỗ Hoàng Kim":
        - cell "TN2025006"
        - cell "Catarina Đỗ Hoàng Kim Đã xưng tội rơmêô"
        - cell "Thiếu Nhi Thiếu Nhi 2 (Rơmêô)"
        - cell "2014-04-12"
        - cell "Đỗ Văn Thành 0912678901"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Catarina Đỗ Hoàng Kim In phiếu Catarina Đỗ Hoàng Kim Chỉnh sửa Catarina Đỗ Hoàng Kim Xóa Catarina Đỗ Hoàng Kim":
          - button "Thẻ Catarina Đỗ Hoàng Kim": 🪪
          - button "In phiếu Catarina Đỗ Hoàng Kim": In
          - button "Chỉnh sửa Catarina Đỗ Hoàng Kim"
          - button "Xóa Catarina Đỗ Hoàng Kim"
      - row "TN2025007 Gioan B. Ngô Quốc Trung Lễ sinh phục vụ bàn thờ Thiếu Nhi Thiếu Nhi 2 (Rơmêô) 2014-08-30 Ngô Tấn Phát 0966789012 - Chưa có điểm 100% 0/0 Thẻ Gioan B. Ngô Quốc Trung In phiếu Gioan B. Ngô Quốc Trung Chỉnh sửa Gioan B. Ngô Quốc Trung Xóa Gioan B. Ngô Quốc Trung":
        - cell "TN2025007"
        - cell "Gioan B. Ngô Quốc Trung Lễ sinh phục vụ bàn thờ"
        - cell "Thiếu Nhi Thiếu Nhi 2 (Rơmêô)"
        - cell "2014-08-30"
        - cell "Ngô Tấn Phát 0966789012"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Gioan B. Ngô Quốc Trung In phiếu Gioan B. Ngô Quốc Trung Chỉnh sửa Gioan B. Ngô Quốc Trung Xóa Gioan B. Ngô Quốc Trung":
          - button "Thẻ Gioan B. Ngô Quốc Trung": 🪪
          - button "In phiếu Gioan B. Ngô Quốc Trung": In
          - button "Chỉnh sửa Gioan B. Ngô Quốc Trung"
          - button "Xóa Gioan B. Ngô Quốc Trung"
      - row "TN2025008 Anna Trịnh Khánh Linh Thiếu Nhi Thiếu Nhi 2 (Rơmêô) 2014-12-01 Trịnh Xuân Hùng 0908890123 - Chưa có điểm 100% 0/0 Thẻ Anna Trịnh Khánh Linh In phiếu Anna Trịnh Khánh Linh Chỉnh sửa Anna Trịnh Khánh Linh Xóa Anna Trịnh Khánh Linh":
        - cell "TN2025008"
        - cell "Anna Trịnh Khánh Linh"
        - cell "Thiếu Nhi Thiếu Nhi 2 (Rơmêô)"
        - cell "2014-12-01"
        - cell "Trịnh Xuân Hùng 0908890123"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Anna Trịnh Khánh Linh In phiếu Anna Trịnh Khánh Linh Chỉnh sửa Anna Trịnh Khánh Linh Xóa Anna Trịnh Khánh Linh":
          - button "Thẻ Anna Trịnh Khánh Linh": 🪪
          - button "In phiếu Anna Trịnh Khánh Linh": In
          - button "Chỉnh sửa Anna Trịnh Khánh Linh"
          - button "Xóa Anna Trịnh Khánh Linh"
      - row "TN2025009 F.X Nguyễn Minh Triết Thiếu Nhi Thiếu Nhi 2 (Rơmêô) 2014-02-15 Nguyễn Văn Cường 0933901234 - Chưa có điểm 100% 0/0 Thẻ F.X Nguyễn Minh Triết In phiếu F.X Nguyễn Minh Triết Chỉnh sửa F.X Nguyễn Minh Triết Xóa F.X Nguyễn Minh Triết":
        - cell "TN2025009"
        - cell "F.X Nguyễn Minh Triết"
        - cell "Thiếu Nhi Thiếu Nhi 2 (Rơmêô)"
        - cell "2014-02-15"
        - cell "Nguyễn Văn Cường 0933901234"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ F.X Nguyễn Minh Triết In phiếu F.X Nguyễn Minh Triết Chỉnh sửa F.X Nguyễn Minh Triết Xóa F.X Nguyễn Minh Triết":
          - button "Thẻ F.X Nguyễn Minh Triết": 🪪
          - button "In phiếu F.X Nguyễn Minh Triết": In
          - button "Chỉnh sửa F.X Nguyễn Minh Triết"
          - button "Xóa F.X Nguyễn Minh Triết"
      - row "TN2025010 Têrêsa Hài Đồng Phan Như Quỳnh Thiếu Nhi Thiếu Nhi 2 (Rơmêô) 2014-07-07 Phan Văn Hải 0944012345 - Chưa có điểm 100% 0/0 Thẻ Têrêsa Hài Đồng Phan Như Quỳnh In phiếu Têrêsa Hài Đồng Phan Như Quỳnh Chỉnh sửa Têrêsa Hài Đồng Phan Như Quỳnh Xóa Têrêsa Hài Đồng Phan Như Quỳnh":
        - cell "TN2025010"
        - cell "Têrêsa Hài Đồng Phan Như Quỳnh"
        - cell "Thiếu Nhi Thiếu Nhi 2 (Rơmêô)"
        - cell "2014-07-07"
        - cell "Phan Văn Hải 0944012345"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Têrêsa Hài Đồng Phan Như Quỳnh In phiếu Têrêsa Hài Đồng Phan Như Quỳnh Chỉnh sửa Têrêsa Hài Đồng Phan Như Quỳnh Xóa Têrêsa Hài Đồng Phan Như Quỳnh":
          - button "Thẻ Têrêsa Hài Đồng Phan Như Quỳnh": 🪪
          - button "In phiếu Têrêsa Hài Đồng Phan Như Quỳnh": In
          - button "Chỉnh sửa Têrêsa Hài Đồng Phan Như Quỳnh"
          - button "Xóa Têrêsa Hài Đồng Phan Như Quỳnh"
      - row "TN2025011 Phaolô Bùi Đức Thắng Đội trưởng Nghĩa Sĩ Nghĩa Sĩ Nghĩa Sĩ 1 2012-06-25 Bùi Văn Tiến 0977123890 - Chưa có điểm 100% 0/0 Thẻ Phaolô Bùi Đức Thắng In phiếu Phaolô Bùi Đức Thắng Chỉnh sửa Phaolô Bùi Đức Thắng Xóa Phaolô Bùi Đức Thắng":
        - cell "TN2025011"
        - cell "Phaolô Bùi Đức Thắng Đội trưởng Nghĩa Sĩ"
        - cell "Nghĩa Sĩ Nghĩa Sĩ 1"
        - cell "2012-06-25"
        - cell "Bùi Văn Tiến 0977123890"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Phaolô Bùi Đức Thắng In phiếu Phaolô Bùi Đức Thắng Chỉnh sửa Phaolô Bùi Đức Thắng Xóa Phaolô Bùi Đức Thắng":
          - button "Thẻ Phaolô Bùi Đức Thắng": 🪪
          - button "In phiếu Phaolô Bùi Đức Thắng": In
          - button "Chỉnh sửa Phaolô Bùi Đức Thắng"
          - button "Xóa Phaolô Bùi Đức Thắng"
      - row "TN2025012 Maria Mẫu Tâm Đặng Bảo Ngọc Nghĩa Sĩ Nghĩa Sĩ 1 2012-10-18 Đặng Văn Nghĩa 0988234901 - Chưa có điểm 100% 0/0 Thẻ Maria Mẫu Tâm Đặng Bảo Ngọc In phiếu Maria Mẫu Tâm Đặng Bảo Ngọc Chỉnh sửa Maria Mẫu Tâm Đặng Bảo Ngọc Xóa Maria Mẫu Tâm Đặng Bảo Ngọc":
        - cell "TN2025012"
        - cell "Maria Mẫu Tâm Đặng Bảo Ngọc"
        - cell "Nghĩa Sĩ Nghĩa Sĩ 1"
        - cell "2012-10-18"
        - cell "Đặng Văn Nghĩa 0988234901"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Maria Mẫu Tâm Đặng Bảo Ngọc In phiếu Maria Mẫu Tâm Đặng Bảo Ngọc Chỉnh sửa Maria Mẫu Tâm Đặng Bảo Ngọc Xóa Maria Mẫu Tâm Đặng Bảo Ngọc":
          - button "Thẻ Maria Mẫu Tâm Đặng Bảo Ngọc": 🪪
          - button "In phiếu Maria Mẫu Tâm Đặng Bảo Ngọc": In
          - button "Chỉnh sửa Maria Mẫu Tâm Đặng Bảo Ngọc"
          - button "Xóa Maria Mẫu Tâm Đặng Bảo Ngọc"
      - row "TN2025013 Giuse Hoàng Minh Khôi Chiên Con Chiên Con 1 2020-03-12 Hoàng Văn Sơn 0901345678 - Chưa có điểm 100% 0/0 Thẻ Giuse Hoàng Minh Khôi In phiếu Giuse Hoàng Minh Khôi Chỉnh sửa Giuse Hoàng Minh Khôi Xóa Giuse Hoàng Minh Khôi":
        - cell "TN2025013"
        - cell "Giuse Hoàng Minh Khôi"
        - cell "Chiên Con Chiên Con 1"
        - cell "2020-03-12"
        - cell "Hoàng Văn Sơn 0901345678"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Giuse Hoàng Minh Khôi In phiếu Giuse Hoàng Minh Khôi Chỉnh sửa Giuse Hoàng Minh Khôi Xóa Giuse Hoàng Minh Khôi":
          - button "Thẻ Giuse Hoàng Minh Khôi": 🪪
          - button "In phiếu Giuse Hoàng Minh Khôi": In
          - button "Chỉnh sửa Giuse Hoàng Minh Khôi"
          - button "Xóa Giuse Hoàng Minh Khôi"
      - row "TN2025014 Maria Lý Thanh Hà Chiên Con Chiên Con 1 2020-08-22 Lý Văn Phúc 0915456789 - Chưa có điểm 100% 0/0 Thẻ Maria Lý Thanh Hà In phiếu Maria Lý Thanh Hà Chỉnh sửa Maria Lý Thanh Hà Xóa Maria Lý Thanh Hà":
        - cell "TN2025014"
        - cell "Maria Lý Thanh Hà"
        - cell "Chiên Con Chiên Con 1"
        - cell "2020-08-22"
        - cell "Lý Văn Phúc 0915456789"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Maria Lý Thanh Hà In phiếu Maria Lý Thanh Hà Chỉnh sửa Maria Lý Thanh Hà Xóa Maria Lý Thanh Hà":
          - button "Thẻ Maria Lý Thanh Hà": 🪪
          - button "In phiếu Maria Lý Thanh Hà": In
          - button "Chỉnh sửa Maria Lý Thanh Hà"
          - button "Xóa Maria Lý Thanh Hà"
      - row "TN2025015 Têrêsa Vũ Thị Hồng Hạnh Dự bị Huynh Trưởng Hiệp Sĩ Hiệp Sĩ 1 2009-02-14 Vũ Văn Long 0922567890 - Chưa có điểm 100% 0/0 Thẻ Têrêsa Vũ Thị Hồng Hạnh In phiếu Têrêsa Vũ Thị Hồng Hạnh Chỉnh sửa Têrêsa Vũ Thị Hồng Hạnh Xóa Têrêsa Vũ Thị Hồng Hạnh":
        - cell "TN2025015"
        - cell "Têrêsa Vũ Thị Hồng Hạnh Dự bị Huynh Trưởng"
        - cell "Hiệp Sĩ Hiệp Sĩ 1"
        - cell "2009-02-14"
        - cell "Vũ Văn Long 0922567890"
        - cell "- Chưa có điểm"
        - cell "100% 0/0"
        - cell "Thẻ Têrêsa Vũ Thị Hồng Hạnh In phiếu Têrêsa Vũ Thị Hồng Hạnh Chỉnh sửa Têrêsa Vũ Thị Hồng Hạnh Xóa Têrêsa Vũ Thị Hồng Hạnh":
          - button "Thẻ Têrêsa Vũ Thị Hồng Hạnh": 🪪
          - button "In phiếu Têrêsa Vũ Thị Hồng Hạnh": In
          - button "Chỉnh sửa Têrêsa Vũ Thị Hồng Hạnh"
          - button "Xóa Têrêsa Vũ Thị Hồng Hạnh"
- contentinfo:
  - button "Open TanStack Router Devtools":
    - img
    - img
    - text: "- TanStack Router"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('E2E Auth Guard & Navigation', () => {
  4  |   test('redirects to /login when accessing protected page without token', async ({ page }) => {
  5  |     await page.goto('/students')
> 6  |     await expect(page).toHaveURL(/\/login/)
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  7  |   })
  8  | 
  9  |   test('shows login form on /login', async ({ page }) => {
  10 |     await page.goto('/login')
  11 |     await expect(page.locator('input[type="text"]')).toBeVisible()
  12 |     await expect(page.locator('input[type="password"]')).toBeVisible()
  13 |     await expect(page.locator('button[type="submit"]')).toBeVisible()
  14 |   })
  15 | 
  16 |   test('navigates to protected pages from dashboard', async ({ page }) => {
  17 |     await page.goto('/')
  18 |     await expect(page.getByText('Giáo Lý Thiếu Nhi Thánh Thể')).toBeVisible()
  19 |   })
  20 | })
  21 | 
```