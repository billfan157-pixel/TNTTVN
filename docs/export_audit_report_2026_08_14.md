# Báo Cáo Rà Soát Cấu Trúc Xuất File PDF và Excel (Brave Davinci PWA)

Ngày rà soát: 14/08/2026  
Phạm vi: Toàn bộ mã nguồn xuất báo cáo (`src/utils/pdfGenerator.ts`, `src/services/reportExportService.ts`, `src/utils/excelExporter.ts`, `src/services/reportExporter.ts`, `src/components/common/PrintReportModal.tsx`)

---

## 1. Tổng quan kiến trúc xuất báo cáo hiện tại

Ứng dụng **Brave Davinci** sử dụng phương pháp xuất báo cáo hướng web (HTML-to-Print / HTML-to-Spreadsheet) thay vì phụ thuộc vào các thư viện sinh PDF nhị phân nặng nề phía client. Điều này giúp tối ưu kích thước bundle, đảm bảo font tiếng Việt render chuẩn sắc nét và tận dụng engine in sẵn có của trình duyệt.

| Loại Báo Cáo / Xuất File | Cơ Chế Kỹ Thuật | File Xử Lý Chính | Định Dạng Đầu Ra |
|---|---|---|---|
| **Phiếu điểm cá nhân / Hàng loạt (Batch)** | Sinh chuỗi HTML với CSS `@page { size: A4 portrait; }`, chèn ngắt trang (`page-break`) và phân tách bằng `Blob URL` truyền vào popup/iframe. | `src/utils/pdfGenerator.ts`, `src/services/reportExportService.ts` | Tài liệu HTML in ấn / PDF qua Trình duyệt |
| **Sổ điểm lớp học** | Sinh chuỗi HTML định dạng khổ ngang (`A4 landscape`), tính toán trung bình học kỳ theo trọng số cài đặt giáo xứ (`settings.gradeWeights`). | `src/utils/pdfGenerator.ts` | Tài liệu HTML in ấn |
| **Bảng điểm Excel lớp học** | Sinh bảng HTML tương thích MS Excel Spreadsheet (XML metadata `urn:schemas-microsoft-com:office:excel`) và lưu với phần mở rộng `.xls` ( MIME `application/vnd.ms-excel`). | `src/utils/excelExporter.ts` | Bảng tính MS Excel (`.xls`) |
| **Báo cáo tổng hợp Phân ngành / Chi tiết** | Sử dụng thư viện SheetJS (`xlsx`) chuyển đổi JSON rows sang `.xlsx` đa cột. | `src/services/reportExporter.ts` | Workbook Excel (`.xlsx`) |

---

## 2. Đánh giá chi tiết các điểm mạnh và vấn đề tiềm ẩn

### A. Luồng xuất PDF / In ấn (Print & PDF)
1. **Điểm mạnh:**
   - **Bảo mật & Clean State:** Đã loại bỏ hoàn toàn `document.write` (xem `reportExportService.ts`), chuyển sang sử dụng `Blob URL` và `iframe`/`window.open` an toàn, tránh lỗi CSP và script injection.
   - **Đồng bộ Metadata Xứ đạo:** Tự động lấy tên giáo phận, giáo xứ từ `settingsStore` hoặc `ReportViewModelFactory`, đảm bảo tiêu đề chính xác.
   - **Watermark & Security:** Có sẵn CSS watermark `@media print` (ví dụ: `'Giáo Xứ Gia Tôn'`).
2. **Điểm cần lưu ý trước khi làm Batch Printing & QR Verification:**
   - Hiện tại, chức năng in hàng loạt (`generateBatchReportCardsHTML`) đã gom các phiếu điểm lại và ngăn cách bằng `.page-break`. Tuy nhiên, **chưa tích hợp mã QR xác thực HMAC** trên từng phiếu điểm in, dẫn đến việc khó kiểm tra tính nguyên vẹn của phiếu khi phát cho phụ huynh.

### B. Luồng xuất Excel / Sổ điểm
1. **Điểm mạnh:**
   - **Xử lý số liệu chuẩn xác:** Tích hợp logic chuẩn hóa năm học (`normalizeAcademicYear`), trọng số điểm (`gradeWeights`), và làm tròn theo cấu hình giáo xứ (`roundingDecimal`).
   - **Định dạng bảng tính:** File `.xls` sinh ra có cấu trúc XML giúp Excel hiển thị lưới (gridlines) và màu sắc tiêu đề xanh đậm thương hiệu (`#1E3A8A`).
2. **Điểm cần lưu ý:**
   - Mặc dù xuất `.xls` tương thích tốt với Excel, việc mở rộng sang workbook đa tab (Multi-sheet) cho toàn bộ khối/xứ đoàn cần sử dụng SheetJS (`xlsx`) thay vì HTML-to-XLS đơn luồng để hỗ trợ nhiều sheet trong một file duy nhất.

---

## 3. Khuyến nghị hành động tiếp theo
1. **Đối với Batch Printing & QR Verification:** 
   - Bổ sung trường mã hóa QR (chứa HMAC signature hoặc chuỗi xác thực an toàn) vào `StudentReportCardViewModel` và render trực tiếp SVG/QR code vào phần chân phiếu điểm.
   - Đảm bảo khi bấm "In Hàng Loạt", mỗi phiếu điểm đều có QR xác thực riêng biệt.
2. **Đối với Excel Export:**
   - Giữ nguyên cấu trúc hiện tại cho xuất sổ điểm từng lớp, đồng thời chuẩn bị tích hợp SheetJS workbook cho tính năng xuất báo cáo tổng kết toàn xứ đoàn đa tab.
