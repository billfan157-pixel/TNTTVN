# Kiến Trúc Xác Thực QR Code bằng HMAC-SHA256 (Brave Davinci PWA)

Ngày hoàn thành: 14/08/2026  
Mã nguồn liên quan: 
- `server/src/utils/hmacSigner.ts` (Thư viện sinh và kiểm tra chữ ký HMAC)
- `server/src/routes/verification.ts` (API endpoints `/api/verification/sign` và `/api/verification/verify`)
- `src/pages/VerificationPage.tsx` (Trang giao diện xác thực trên trình duyệt cho người quét QR)
- `src/utils/pdfGenerator.ts` (Tích hợp client-side fetch chữ ký và render QR SVG có chữ ký thực tế)

---

## 1. Luồng Hoạt Động Bảo Mật End-to-End

Để ngăn chặn tuyệt đối tình trạng giả mạo hoặc chỉnh sửa bảng điểm/phiếu điểm in ra, hệ thống áp dụng mô hình bảo mật **Server-Side HMAC-SHA256 Signatures**:

1. **Ký Chữ Ký (Signing):**
   - Khi tạo phiếu điểm (qua `pdfGenerator.ts`), client yêu cầu server ký mã định danh chứng nhận (`certId`), `studentId`, và `academicYear`.
   - Server sử dụng secret key bảo mật (`REPORT_HMAC_SECRET` hoặc `JWT_SECRET`) để tạo chữ ký HMAC-SHA256. Secret key này **chỉ tồn tại trên server**, client không hề biết khóa bí mật.

2. **Nhúng Mã QR (QR Embedding):**
   - Mã QR trên phiếu điểm mã hóa URL xác thực dạng:  
     `/verify?studentId={id}&academicYear={year}&certId={certId}&sig={signature}`

3. **Xác Thực (Verification):**
   - Khi phụ huynh hoặc ban quản lý dùng camera điện thoại quét mã QR, trình duyệt mở trang `/verify` của ứng dụng.
   - Trang web tự động gọi API GET `/api/verification/verify` kèm theo các tham số.
   - Server tính toán lại chữ ký HMAC và đối chiếu chống timing attack (`crypto.timingSafeEqual`).
   - Nếu hợp lệ: Hiển thị thông tin thiếu nhi và nhãn **"Phiếu Điểm Hợp Lệ"**.
   - Nếu sai chữ ký hoặc bị sửa đổi: Hiển thị cảnh báo **"Cảnh Báo Giả Mạo"**.

---

## 2. Cấu Hình Biến Môi Trường (Environment Variables)
Trên môi trường Production (Railway / Vercel), cần cấu hình:
- `REPORT_HMAC_SECRET`: Chuỗi khóa bí mật dùng riêng cho việc ký phiếu điểm (nếu không thiết lập, hệ thống tự động fallback sang `JWT_SECRET`).
