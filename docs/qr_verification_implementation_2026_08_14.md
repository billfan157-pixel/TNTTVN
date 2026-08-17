# Triển Khai Xác Thực QR Code trên Phiếu Điểm (Brave Davinci PWA)

Ngày hoàn thành: 14/08/2026  
Mã nguồn liên quan: `src/utils/pdfGenerator.ts`, `src/lib/qr.ts`

---

## 1. Tổng quan kỹ thuật
Để nâng tầm chuyên nghiệp và bảo mật cho hệ thống báo cáo in ấn (Milestone 3), chúng tôi đã tích hợp thành công **mã QR xác thực tính nguyên vẹn** trực tiếp vào từng phiếu điểm cá nhân và hàng loạt (`generateStudentReportCardHTML`, `generateBatchReportCardsHTML`).

### A. Cấu trúc Payload QR (`buildCertificateQrPayload`)
- Định dạng chuẩn: `tntt-cert:{certId}:{studentId}:{certType}`
- Trong đó:
  - `certId`: `REP-{studentId}-{academicYear}` (Mã định danh chứng nhận/phiếu điểm duy nhất theo năm học).
  - `studentId`: ID định danh thiếu nhi.
  - `certType`: `'completion'` (Phiếu điểm tổng kết).

### B. Giao diện In ấn (Print Layout)
- Mã QR SVG được render trực tiếp vào góc dưới của phiếu điểm, đi kèm khung viền gọn gàng, mã thiếu nhi (`student.code`) và hướng dẫn quét mã xác thực.
- Sử dụng độ phân giải và kích thước module tối ưu (`cellSize = 3`), đảm bảo máy quét hoặc camera điện thoại đọc chính xác ngay cả khi in trên giấy A4 thông thường.

---

## 2. Kiểm thử & Đảm bảo chất lượng
- Đã kiểm tra tính tương thích với hàm sinh HTML in ấn (`renderStudentReportCardBody`).
- Đảm bảo không làm ảnh hưởng đến các layout in ngang (landscape) như sổ điểm lớp học.
