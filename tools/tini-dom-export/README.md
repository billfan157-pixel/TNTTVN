# Tiện ích Xuất Điểm Danh TINI cho Catevia (Chrome Extension)

Extension trình duyệt (Manifest V3) hỗ trợ trích xuất an toàn dữ liệu điểm danh thiếu nhi từ trang tra cứu TINI (`ccams.thongtinxuanloc.com/glv`) sang tệp JSON chuẩn hóa cho hệ thống Catevia.

---

## 1. Tính năng & Nguyên lý an toàn

- **Chỉ đọc tại chỗ**: Chỉ đọc DOM hiện có trên tab TINI khi người dùng bấm Xuất. Tiện ích không gọi API, không tự điều hướng, cuộn, phân trang hay bấm nút trên TINI, và không đọc cookie/token.
- **Dữ liệu cần đối chiếu**: Tệp JSON v3 có mã, tên, ngày sinh đang hiển thị ở dòng học viên, mã/tên lớp và thông tin điểm danh. Ngày sinh giúp Catevia gợi ý hồ sơ tương ứng; tiện ích không lấy số điện thoại trong URL, thông tin phụ huynh hoặc nội dung ngoài bảng điểm danh. Tệp được lưu cục bộ trên máy người dùng và cần được bảo quản như dữ liệu học viên.
- **Mã băm SHA-256**: Sinh `sourceFingerprint` cho từng lượt để Catevia phát hiện nội dung thay đổi và gắn lượt xem trước với đúng tệp xác nhận. Đây là dấu vân tay nội dung, không phải chữ ký số của TINI.
- **Nhận diện trạng thái thông minh**:
  - Tự động kiểm tra tab hiện tại có phải trang tra cứu TINI hay không.
  - Tự động phát hiện nút **"Xem thêm"** trên trang TINI và cảnh báo người dùng nếu danh sách chưa được nạp hết (`partial: true`).
- **Xuất tệp JSON & Sao chép Clipboard**: Cho phép tải tệp `tini-attendance-YYYY-MM-DD.json` hoặc bấm sao chép JSON vào clipboard chỉ với 1 cú nhấp.

---

## 2. Hướng dẫn cài đặt vào trình duyệt

Hỗ trợ các trình duyệt nhân Chromium: **Google Chrome, Microsoft Edge, Cốc Cốc, Brave...**

### Cách 1: Cài đặt từ thư mục mã nguồn (Developer Mode — Khuyên dùng)
1. Mở trình duyệt, truy cập vào trang quản lý tiện ích:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Cốc Cốc: `coccoc://extensions/`
2. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Nhấp nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục: `C:\brave-davinci\tools\tini-dom-export`.
5. Tiện ích với biểu tượng sổ điểm danh Catevia sẽ xuất hiện trên thanh công cụ trình duyệt (bạn có thể ghim/pin để tiện sử dụng).

### Cách 2: Cài đặt từ tệp zip phân phối
1. Chạy lệnh: `npm run package:tini-extension` (tệp `.zip` được sinh ra tại `dist/tini-dom-export.zip`).
2. Giải nén tệp `.zip` vào một thư mục cố định trên máy.
3. Thực hiện tương tự Cách 1 để nạp thư mục đã giải nén.

---

## 3. Quy trình sử dụng thực tế

1. **Đăng nhập trang TINI**:
   - Mở và đăng nhập vào: `https://ccams.thongtinxuanloc.com/glv`
2. **Chọn phạm vi điểm danh**:
   - Chọn niên học, khối/lớp mong muốn.
   - Chọn ngày cần xuất: Lưu ý **Từ ngày** và **Đến ngày** phải là **cùng 1 ngày** (ví dụ: `20/09/2026` đến `20/09/2026`).
   - Chọn loại hiện diện / vắng.
3. **Tải hết dữ liệu trên trang**:
   - Nếu cuối bảng có nút **"Xem thêm"**, hãy bấm xem thêm nhiều lần cho đến khi không còn nút này nữa (tất cả học viên trong ngày đã hiển thị trên màn hình).
4. **Trích xuất dữ liệu**:
   - Nhấp vào biểu tượng tiện ích **Xuất điểm danh TINI** trên thanh công cụ.
   - Nhấp nút **"Xuất tệp JSON"**. Tệp `tini-attendance-YYYY-MM-DD.json` sẽ tự động được tải về máy.
5. **Nạp vào Catevia**:
   - Truy cập vào trang Quản lý Điểm danh của Catevia (`/attendance`).
   - Mở tab/mục **Nạp điểm danh TINI**, chọn tệp JSON vừa tải về. Kiểm tra các gợi ý đối chiếu tên, ngày sinh và lớp; quản trị viên phải tự chọn từng liên kết, nhập lý do và duyệt. Trường hợp trùng nhiều hồ sơ cần đối chiếu thủ công qua danh sách hồ sơ. Sau đó xem trước từng lượt và xác nhận nạp điểm danh.
   - Nếu Catevia báo tên, ngày sinh hoặc lớp khác TINI, kiểm tra hồ sơ gốc rồi dùng quy trình sửa học viên hiện có. Nạp điểm danh không tự sửa hồ sơ.

---

## 4. Cấu trúc tệp

```text
tools/tini-dom-export/
├── manifest.json       # Cấu hình Chrome Extension Manifest V3
├── popup.html          # Giao diện hộp thoại tiện ích
├── popup.js            # Điều khiển giao diện, mã băm SHA-256 & tải file
├── extractor.js        # Hàm thuần túy duyệt DOM bảng điểm danh
├── icons/              # Bộ biểu tượng các kích thước (16, 32, 48, 128px)
└── README.md           # Hướng dẫn chi tiết
```
