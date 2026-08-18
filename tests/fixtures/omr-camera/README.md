# OMR camera corpus

Thư mục này dành cho ảnh camera điện thoại đã khử định danh và manifest gán nhãn.
Không commit họ tên, mã học sinh, QR thật, ảnh khuôn mặt hoặc EXIF vị trí.

Nhóm fixture bắt buộc trước khi bật auto batch mặc định:

- `normal/`: thẳng, đủ sáng, bút xanh/đen/chì đậm;
- `stress/`: nghiêng, mờ nhẹ, bóng, giấy cong, camera Android/iOS;
- `negative/`: giấy trắng, nhiều ô, vết tô nhạt, sai template/số câu, QR của phiếu khác.

Mỗi ảnh phải có observation tương ứng với `OmrBenchmarkObservation` trong
`src/lib/omrBenchmark.ts`. Ảnh chỉ được thêm khi đã có sự đồng ý và hoàn tất
khử định danh; CI hiện kiểm tra bộ tính KPI, chưa tuyên bố đạt độ chính xác thực địa.
