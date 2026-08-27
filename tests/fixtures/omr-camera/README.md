# OMR camera corpus

Thư mục này dành cho ảnh camera điện thoại đã khử định danh và manifest gán nhãn.
Không commit họ tên, mã học sinh, QR thật, ảnh khuôn mặt hoặc EXIF vị trí.

Nhóm fixture MC bắt buộc trước khi bật unattended/default auto batch:

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
Trạng thái `accepted` hiện hành chỉ là proposal chờ người chấm bấm Save; gate này
không chứng nhận score-grid written vì workload đó chưa có expectedScore KPI.

Mức tối thiểu mặc định hiện tại:

- ít nhất 400 mẫu thực: 200 normal, 100 stress và 100 negative;
- answer accuracy >= 99.5%;
- exact-sheet accuracy >= 99,5% ở normal và >= 98% ở stress;
- first-capture >= 95% trên các mẫu kỳ vọng được chấp nhận;
- false accept = 0 trong corpus negative;
- review routing = 100%, riêng negative routing cũng = 100%;
- p95 detector <= 150 ms trên thiết bị benchmark mục tiêu.

Manifest cho mỗi ảnh phải lưu tối thiểu: `sampleId`, SHA-256 `fileChecksum`,
`cohort`, `workload='multiple_choice'`, `engineVersion` (`omr-v4-*`),
`deviceProfile`, `browser`, `frameWidth`, `frameHeight`, `runKind` (`cold|warm`),
`templateMode`, `questionCount`, `expectedAnswers`, `detectedAnswers`,
`expectedOutcome`, `firstCaptureAccepted` và `durationMs`. `durationMs` là thời
gian **detector-only** (không gồm decode file, QR, render UI hay network). Timing
được tách exact workload/engine/device/browser/resolution/template/questionCount/
cold-warm, mỗi profile ≥20 mẫu. Accuracy/routing dùng cùng identity nhưng gộp
cold/warm, mỗi profile ≥40 mẫu gồm normal 20, stress 10, negative 10, review 10
và accepted 20. Không trộn profile và không lưu student/session id thật hoặc nội
dung QR production.

Mỗi release phải truyền exact `requiredTimingProfiles` và
`requiredAccuracyProfiles` cho toàn bộ engine/device/browser/resolution/template/
questionCount được bật; mỗi accuracy profile phải có cả cold và warm timing.
Default để rỗng có chủ đích và luôn fail-closed; thiếu chỉ một profile production
cũng không được đạt gate.

Semantics KPI ADR-062:

- exact-sheet chỉ dùng normal/stress; negative không được làm đẹp accuracy;
- answer accuracy chỉ tính ô có `expectedAnswers[i]` khác `null`;
- review routing chỉ dùng các mẫu `expectedOutcome='review_required'`;
- `detectedAnswers` thiếu/thừa ô là kết quả sai, không được loại để làm đẹp KPI;
- duration thiếu, `NaN` hoặc âm; answer/outcome/profile/engine/checksum malformed;
  corpus thiếu required profile/quota đều làm gate fail-closed;
- mỗi `sampleId` và SHA-256 file phải unique; duplicate bị loại khỏi mọi mẫu số và
  làm gate fail để một ảnh không thể được nhân bản nhằm đủ 400 mẫu.

`npm run benchmark:omr` hiện là benchmark synthetic/performance regression, gồm
đường integrated/full-page production, auto fallback/no-marker và QR theo từng
mode; không thay runner corpus ảnh thật. CI hiện chỉ kiểm tra logic detector/KPI/gate; chưa
tuyên bố đạt độ chính xác thực địa cho tới khi real-camera corpus được bổ sung và
runner ảnh thật được bật.
