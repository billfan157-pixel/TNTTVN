# OMR camera corpus

Thư mục này dành cho ảnh camera điện thoại đã khử định danh và manifest gán nhãn.
Không commit họ tên, mã học sinh, QR thật, ảnh khuôn mặt hoặc EXIF vị trí.

Nhóm fixture bắt buộc trước khi bật auto batch mặc định:

- `normal/`: thẳng, đủ sáng, bút xanh/đen/chì đậm;
- `stress/`: nghiêng, mờ nhẹ, bóng, giấy cong, camera Android/iOS;
- `negative/`: giấy trắng, nhiều ô, vết tô nhạt, sai template/số câu, QR của phiếu khác.

Mỗi ảnh phải có observation tương ứng với `OmrBenchmarkObservation` trong
`src/lib/omrBenchmark.ts`. Ảnh chỉ được thêm khi đã có sự đồng ý và hoàn tất
khử định danh.

## Release gate

`src/lib/omrBenchmarkGate.ts` định nghĩa ngưỡng release mặc định, nhưng các ngưỡng
đó là **mục tiêu kỹ thuật, không phải tuyên bố accuracy hiện tại**. Không được bật
hard CI gate cho production cho tới khi thư mục này có corpus ảnh thật đủ lớn.

Mức tối thiểu mặc định hiện tại:

- ít nhất 100 mẫu thực;
- answer accuracy >= 99.5%;
- exact-sheet accuracy >= 98%;
- first-capture >= 90%;
- false accept = 0 trong corpus negative;
- review routing >= 99%;
- p95 detector <= 500 ms trên thiết bị benchmark mục tiêu.

Manifest cho mỗi ảnh nên lưu tối thiểu: `sampleId`, loại thiết bị/browser,
`templateMode`, `expectedAnswers`, `expectedOutcome`, `firstCaptureAccepted` và
`durationMs`. Không lưu student/session id thật hoặc nội dung QR production.

CI hiện chỉ kiểm tra logic tính KPI/gate; chưa tuyên bố đạt độ chính xác thực địa
cho tới khi real-camera corpus được bổ sung và runner ảnh thật được bật.
