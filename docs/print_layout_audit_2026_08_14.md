# Báo Cáo Rà Soát Chi Tiết Lỗi Bố Cục Bản In, Phiếu Điểm và PDF (Brave Davinci)

Ngày rà soát: 14/08/2026  
Phạm vi: Rà soát toàn bộ các mẫu báo cáo, phiếu điểm cá nhân, phiếu điểm hàng loạt, sổ điểm lớp và chứng nhận sacraments trong `src/utils/pdfGenerator.ts` cùng cơ chế hiển thị trên trình duyệt / bản in PDF.

---

## 1. Kết Luận Khảo Sát Kiến Trúc Bản In & PDF
Sau khi rà soát toàn bộ mã nguồn của các luồng tạo báo cáo (`PrintReportModal.tsx`, `pdfGenerator.ts`, `reportExportService.ts` và `pdfSanitizer.ts`), hệ thống tồn tại **3 nguyên nhân kỹ thuật thực tế** gây ra hiện tượng lệch chữ, mất nội dung hoặc khác biệt giữa preview trên trình duyệt và bản in PDF:

### Vấn Đề 1: Xung Đột Xử Lý Mã QR Động Giữa Trình Duyệt và Server PDF (`pdfSanitizer.ts` & `pdfGenerator.ts`)
- **Mô tả hiện tượng:** Khi người dùng xem trước phiếu điểm trong trình duyệt, mã QR sinh thông qua thẻ `<script>` bất đồng bộ gọi `/api/verification/sign` hoạt động bình thường. Tuy nhiên, nếu xuất sang PDF bằng server (Puppeteer qua `pdfSanitizer.ts`), lớp bảo mật server chủ động **xóa toàn bộ thẻ `<script>`** (`<script>` tags are stripped at line 105 of `pdfSanitizer.ts`) và chặn mọi request `fetch` nội bộ.
- **Hậu quả:** Bản PDF xuất ra từ server **sẽ hoàn toàn bị trống phần mã QR hoặc không chạy được lệnh ký**, dẫn đến phiếu điểm thiếu mã QR xác thực HMAC.

### Vấn Đề 2: Tràn Cột và Định Dạng Khổ Giấy Trong Sổ Điểm Lớp (`CLASS_GRADEBOOK`)
- **Mô tả hiện tượng:** Sổ điểm lớp (`generateClassGradebookHTML`) được thiết kế trên khổ **A4 Landscape** (`size: A4 landscape; margin: 15mm;`) với 10 cột dữ liệu (STT, Mã TN, Họ Tên, Phái, Ngày Sinh, ĐTB HK1, ĐTB HK2, ĐTB Cả Năm, Chuyên Cần, SĐT Phụ Huynh).
- **Nguy cơ lệch nội dung:** Khi tên thiếu nhi quá dài hoặc trên các máy in có cài đặt lề mặc định lớn, cột Ngày Sinh, Điện thoại và Chuyên cần dễ bị đẩy xuống dòng hoặc tràn lề, gây hiện tượng chữ đè lên nhau.

### Vấn Đề 3: Cứng Nhắc Về Kích Thước Khung Thông Tin Cá Nhân (`.info-grid`)
- **Mô tả hiện tượng:** Trong phiếu điểm cá nhân (`renderStudentReportCardBody`), khung thông tin học sinh sử dụng CSS Grid `grid-template-columns: 1fr 1fr; gap: 8px;`. 
- **Nguy cơ lệch nội dung:** Trường Tên Thánh, Họ và Tên cùng Tên Phụ Huynh có độ dài ký tự tiếng Việt lớn (ví dụ: *Gioan Baotixita Nguyễn Văn Hoàng Minh*) có thể làm ô grid bị kéo dãn không đều, gây mất cân đối trực quan giữa bên trái và bên phải khi in trên khổ A4 Portrait.

---

## 2. Đề Xuất Khắc Phục Triệt Để
1. **Chuyển đổi tạo QR sang Server-Side Rendering (SSR) hoặc Inline Base64 SVG:** Thay vì phụ thuộc vào JavaScript chạy sau khi load trang (bị chặn bởi Puppeteer PDF), mã QR nên được render trực tiếp dưới dạng SVG chuỗi tĩnh hoặc nhúng base64 ngay tại thời điểm tạo HTML.
2. **Tối ưu hóa CSS Table và Padding cho Sổ Điểm Lớp:** Thu nhỏ bớt font-size của các ô dữ liệu dài và cấu hình `overflow: hidden` / `text-overflow: ellipsis` cho các cột tên để tránh vỡ khung in.
