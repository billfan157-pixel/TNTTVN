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

## Continuous sequence corpus (ADR-067)

Ảnh tĩnh không đủ để chứng nhận rearm và quét liên tiếp. Trước pilot thực địa phải bổ sung video/frame-sequence đã khử định danh và manifest thời gian cho các tình huống:

- giữ nguyên phiếu trong khung sau Save; rút chậm/che một phần/đặt lại;
- đổi phiếu ngay, QR mới mờ trong khi identity cũ còn TTL;
- cùng học sinh cùng fingerprint và khác fingerprint;
- sai session/class/template/questionCount/version, blank/multi/weak/glare/skew;
- mất mạng trước request, trong request, và sau commit trước response;
- reload/background/foreground, camera track ended, đổi orientation;
- chuỗi 30 và 100 phiếu để đo memory slope, thermal drift và papers/minute.

Gate sequence bắt buộc: false rearm = 0; stale identity association = 0; duplicate/lost durable mutation = 0; acknowledgement out-of-order không làm hỏng UI; reload recovery = 100%; mọi case chưa rõ vào review/conflict. Unit tests của `examContinuousScan.ts` chỉ chứng minh state semantics, không thay cho corpus này.

Runner chính thức v2: `npm run benchmark:omr:sequence -- <manifest-30.json> [manifest-100.json ...] <targets.json>`. Tạo target scaffold bằng CLI hoặc nút **Xuất Target Mẫu** trong card; mọi target scaffold để `null` có chủ đích và phải được product owner đặt trước khi gate có thể PASS. Manifest dùng contract v2 trong `src/lib/omrSequenceBenchmark.ts`; exact profile gồm immutable `releaseId`. Card preflight hiển thị unresolved/reload/responsiveness/memory/safety trong lúc thu; observer chỉ được tính khi attach thật. Nút tải chỉ xuất completed run của release hiện tại và cảnh báo run lịch sử, không trộn build. Có thể tạo manifest trên thiết bị thật tại **Chẩn đoán hệ thống → Bằng Chứng OMR Thiết Bị Thật**: release phải khác `dev/local/unknown`, nhập nhãn không PII dạng `iphone-13`/`safari-18`, chọn 30 hoặc 100, rồi bật Quét liên tiếp; file export có dạng `omr-sequence-evidence-v2-<releaseId>.json` và chỉ chứa run đủ acknowledgement. Mỗi exact profile phải chủ động có ít nhất một case review/conflict và một lần reload đã recover; nếu quan sát sai danh tính hoặc durable mutation trùng, dùng nút ghi lỗi để run fail đúng. Không commit manifest có ID/QR/nội dung đáp án production. Gate yêu cầu một run 30 riêng (`30..99`) và một run ≥100 riêng, latency sample đủ bằng số bài, elapsed throughput, proposal drift, responsiveness + memory evidence và target số cụ thể; unexpected profile, mixed release, duplicate run ID, legacy v1, profile malformed/trùng hoặc runtime capability `unsupported` đều fail-closed.
