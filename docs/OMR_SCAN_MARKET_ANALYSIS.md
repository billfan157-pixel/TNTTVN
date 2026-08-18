# NGHIÊN CỨU THỊ TRƯỜNG & ĐÁNH GIÁ CƠ CHẾ QUÉT CHẤM ĐIỂM (OMR SCAN & GRADING)

**Ngày nghiên cứu:** 2026-08-18 (lần 2 — bản nâng cấp Scan Engine v2)
**Trạng thái:** SCALE FOUNDATION ĐÃ TRIỂN KHAI (ADR-049/050) — batch file explicit, mã đề A–H, analytics và local review đã có; SBD/OCR/mẫu BGD vẫn khóa theo decision gate; **Đánh giá v2 tại §VI**
**Phạm vi:** Tính năng Smart Exam Grading (quét phiếu trả lời + chấm điểm), so sánh với các app trên thị trường
**Framework áp dụng:** Decision Matrix v4.1.2 (Evidence-First; nhận định kèm evidence type + confidence)

---

## I. TỔNG QUAN CƠ CHẾ HIỆN TẠI (TÓM TẮT)

Kiến trúc quét chấm điểm hiện tại (chi tiết: `docs/AI_CONTEXT_MAP.md:98-116`, `docs/FRONTEND_API_CONTRACT.md:371-383`, ADR-023/024/025/043/048):

```
[Giấy in] ← AnswerSheetModal/ExamPaperModal (QR 21 module + Code128 dải cuối + 4 marker góc)
    ↓ (camera / upload 1 ảnh)
[ExamScanModal.tsx] — Bước 1: scanExamCode() QR→barcode → identity lock 20s (examScanIdentity.ts)
    ↓ Bước 2: OMR detect (detectScoreFromImage / detectAnswersFromImage, omr.ts)
    ↓ 2-frame consensus (omrScanConsensus.ts) / nút "Chụp & chấm" (fixed student)
[handleSave] → saveScores() → examStore (source: 'qr_scan' | 'omr' | 'quick_entry')
    ├─ Online: api.saveExamResults → POST /api/exams/:id/results
    └─ Offline: syncService → queue → syncProcessor → api (ADR-023)
[Hoàn Tất Phiên] → POST /api/exams/:id/complete → finalizeExamSession (ADR-048)
[Re-score] → PATCH /api/exams/:id/answer-key (draft MC, giữ quick_entry)
```

Lưu ý phạm vi: **tính năng này là chấm phiếu bài kiểm tra (OMR), KHÔNG phải điểm danh camera**. Điểm danh trên app hiện là thủ công trên mobile (`e2e/qr-attendance.spec.ts`).

---

## II. NGHIÊN CỨU THỊ TRƯỜNG — CƠ CHẾ QUÉT CHẤM ĐIỂM CỦA CÁC APP

### II.1 Nhóm chấm phiếu trắc nghiệm (OMR) — đối thủ trực tiếp

| Tiêu chí | **ZipGrade** (Mỹ) | **GradeCam** (Mỹ) | **Azota** (VN — chuẩn mực nội địa) | **App TNTT (hiện tại)** |
|---|---|---|---|---|
| Cơ chế định danh phiếu | Học sinh tự **viết tên/ID** lên phiếu; chấm theo quiz, map sau | Form ID code in trên phiếu | **Tô SBD + mã đề** trên phiếu, hệ thống nhận diện | **QR cá nhân hóa** (`TE:session:student` / legacy `tntt-exam:`) + Code128 dự phòng |
| Nhận diện khung | 4 ô vuông góc khớp 4 viewfinder, **tự động bắt khi đủ nét** (không bấm nút) | Bất kỳ camera nào (mobile/laptop/webcam) | Tự nhận diện trang giấy, đối chiếu **mã mẫu phiếu in cuối phiếu** ("v3.0", "v15.0") | Marker 4 góc + homography; 2 locator (integrated/full-page); cấm fallback chéo (ADR-048) |
| Xử lý chất lượng ảnh | **Cảnh báo "Bright Light Detected"** (glare), "Waiting For Autofocus", thanh trượt Sheet Strictness | — | Yêu cầu in chuẩn A4 100%, không photocopy, nền phẳng sáng | Paper-surface gate, lọc ánh sáng đa vòng tròn (core vs annulus), 2-frame consensus, identity TTL 20s |
| Chấm hàng loạt | Camera liên tục 1-1, **rung xác nhận**, không nút bấm | — | **Chấm file scan trên web: 1000 bài/5 phút** (cả thư mục) | Chỉ quét camera tuần tự + upload 1 ảnh; **chưa có batch upload/đa ảnh** |
| Chấm tự luận | Không | **OCR chữ viết tay** (LSTM, CER 10.63%), lưu ảnh câu hỏi chấm tay | Phiếu hỗn hợp trắc nghiệm + tự luận (tự luận chấm tay) | Chỉ chấm **thang điểm 0-10** dạng ô tô (không OCR) |
| Đặc điểm đáp án | Combination 3 chữ cái (matching), xử lý tẩy xóa kém | — | **Nhiều mã đề đảo** trong 1 kỳ thi | 1 answerKey/phiên; re-score khi sửa đáp án (draft MC) |
| Thống kê | **Item analysis + discriminant factor**, export CSV | Item analysis, báo cáo nhóm | **Phổ điểm, tỷ lệ câu đúng/sai**, gửi kết quả học sinh | Chưa có phân tích câu hỏi/phổ điểm (dữ liệu `exam_results.answers` đã có) |
| Offline | **Chấm hoàn toàn không cần mạng**, sync sau | — | Cần mạng khi chấm | **Offline queue đầy đủ** (ADR-023) — mạnh hơn Azota |
| Quyền riêng tư | Ảnh scan lưu cloud (mặc định) | Cloud | Cloud | **100% client-side**, không vision server (ADR-043: Option C REJECT, Security & Privacy 6<7) |

**Nguồn (E5/secondary):** zipgrade.com + support docs (auto-focus/sharpness slider, bright light detection, sheet strictness, 4-corner viewfinder, vibration confirm, offline grading, CSV export, combination answers), gradecam.com, docs.azota.vn (chấm phiếu trên app, chấm file scan trên web, lưu ý in phiếu chuẩn, mã mẫu phiếu v3.0/v15.0), azota.vn (1000 bài/5 phút, mẫu BGD 2025), RMJ 2024 study (ZipGrade hiệu quả: 69/71 phiếu trong 15 phút), research paper 2024 (LSTM OCR IAM dataset CER 10.63%).

### II.2 Nhóm điểm danh QR (liên quan, khác phạm vi)

| App | Cơ chế | Điểm đáng học |
|---|---|---|
| **Smart QR Edu** (eduz.vn) | Thẻ QR cá nhân học sinh, quét <1s, quét từ ảnh Zalo, điểm danh thủ công dự phòng, import Excel, xuất thẻ PDF chuẩn 5.4x8.6cm, cloud real-time 50k thiết bị | Đa đường nhập (camera/ảnh thư viện/thủ công); luôn có fallback |
| **VnEdu / PHX / Softcenter** | QR + FaceID + RFID đa phương thức; **giới hạn vùng địa lý chống điểm danh hộ**; log thời gian đến phút; thông báo PH tức thì | Anti-cheat bằng geofence; thông báo PH |
| **diemdanh.app / LopHoc.app / Lop Em** | Điểm danh chạm tay theo lịch lớp; QR thanh toán học phí (VietQR); sổ lớp AI | Mô hình điểm danh tối giản không camera |

---

## III. ĐÁNH GIÁ CƠ CHẾ HIỆN TẠI

### III.1 Điểm mạnh (vượt thị trường)

1. **Fail-closed toàn diện** — hiếm app đạt: paper-surface gate (`omr.ts:416-447`), marker isolation + quadrant + geometry/aspect/convexity gates (`omr.ts:225-293, 305-409`), cấm fallback chéo template (ADR-048), 2-frame consensus (`omrScanConsensus.ts`), identity TTL 20s + wrong-session hard-stop (`examScanIdentity.ts`). Nền bàn nâu từng sinh điểm ảo `score=8` → sau fix trả `NO_PAPER_SURFACE` (E2 fixture, ADR-043). Confidence: HIGH.
2. **Chuẩn hóa in-quét SSOT** (`answerSheetTemplate.ts`): geometry in = geometry detect, sai số tâm ≤2px verify bằng render Chromium thật (ADR-048). Confidence: HIGH.
3. **Bảo mật/riêng tư**: toàn bộ CV client-side, không gửi ảnh PII ra ngoài — vượt ZipGrade/Azota (đều cloud). Audit đầy đủ (`EXAM_CREATE/SAVE_RESULTS/FINALIZE/RESCORE...`, SECURITY_AUDIT_LOG). Confidence: HIGH.
4. **Chống gán nhầm phiếu**: QR cá nhân + khóa phiên + ràng buộc học sinh thuộc lớp phiên ở server (`examService.ts:210-227`). Confidence: HIGH.
5. **Hiệu năng**: summed-area table đưa OMR từ 1.0-1.17s → 12-50ms/lần (E2, ADR-043). Confidence: HIGH.
6. **Vận hành offline**: queue + idempotency + parent-first (ADR-023) — khác biệt lớn so Azota (cần mạng). Confidence: HIGH.

### III.2 Khoảng trống so với thị trường

| # | Khoảng trống | Bằng chứng | Đối thủ làm gì |
|---|---|---|---|
| G1 | **Không có chấm hàng loạt từ file ảnh/thư mục scan** — kỳ thi 100-200 TNTT phải quét từng phiếu qua camera | `ExamScanModal` chỉ nhận camera/1 ảnh; không pipeline batch (E3) | Azota: 1000 bài/5 phút |
| G2 | **Phụ thuộc giấy in sẵn QR cá nhân** — phiếu photocopy/tự in lại mất định danh → không chấm được | Identity = QR/Code128 bắt buộc; không có chế độ SBD (E3) | Azota: tô SBD + mã đề |
| G3 | **Chưa có chẩn đoán điều kiện ảnh cho người dùng** (glare, nét/mờ, strictness) | `OMR_FAIL_REASONS` là code kỹ thuật; không có cảnh báo "Bright Light Detected" kiểu ZipGrade (E3) | ZipGrade: 3 cảnh báo trực quan + thanh trượt cấu hình |
| G4 | **Không có thống kê/phân tích câu hỏi** (phổ điểm, tỷ lệ đúng/sai từng câu, câu khó/dễ) | `exam_results.answers` JSON đã lưu nhưng chưa có view khai thác (E3) | Azota phổ điểm; ZipGrade item analysis + discriminant |
| G5 | **Chỉ 1 mã đề/phiên** — không hỗ trợ trộn đề nhiều mã | `answerKey` đơn, re-score theo 1 key (E3) | Azota hỗ trợ nhiều mã đề |
| G6 | **Không hỗ trợ mẫu phiếu chuẩn BGD** và dạng đáp án khác (matching, combination, trả lời nhiều ô) | Template geometry tự định nghĩa duy nhất (E3) | Azota: mẫu BGD 2025, A4/A5/A6; ZipGrade: 20/50/100 câu + 3-letter combos |
| G7 | **Không lưu ảnh phiếu để rà soát/hiệu đính sau** | Không có lưu scan image (E3) | GradeCam lưu ảnh câu hỏi; ZipGrade "Review Papers" có ảnh gốc |
| G8 | Không OCR chữ viết tay phần tự luận | Chỉ ô điểm 0-10 (E3) | GradeCam (LSTM, CER 10.63%) |

### III.3 Đánh giá tổng thể (D2 / GENERAL)

| Criterion | Weight | Điểm | Evidence / Rationale |
|---|--:|--:|---|
| Business / Operational Fit | 15% | 7 | Đường chấm manual đúng đắn (ADR-043) nhưng thiếu batch scale (G1/G2) |
| Reliability & Data Integrity | 20% | 9 | Ledger + finalization + conflict + idempotency (E3) |
| Security & Privacy | 20% | 9 | Client-side CV, fail-closed, audit; không vision server (E3) |
| Maintainability | 15% | 8 | SSOT geometry, detector 684 dòng tập trung (E3) |
| Performance | 10% | 9 | 12-50ms/lần OMR (E2) |
| Testability | 10% | 9 | 1468 tests, regression Chromium thật (E2) |
| Reversibility | 5% | 9 | Các fix đều R1, không đổi schema/API |
| Observability | 5% | 6 | Thiếu chẩn đoán ảnh đầu vào cho UX (G3) |
| **Weighted Score** | **100%** | **8.4** | |

**Kết luận chung (CONFIRMED):** lõi quét OMR thuộc **hàng đầu về an toàn dữ liệu + độ chính xác fail-closed** (ngang/hơn ZipGrade, vượt Azota về Privacy), nhưng **thua xa về vận hành quy mô** (batch scan, SBD, mã đề) và **chẩn đoán trải nghiệm quét** so với Azota/ZipGrade. Định hướng ADR-043 (camera là tùy chọn, không bắt buộc) giữ nguyên.

---

## IV. PHƯƠNG HƯỚNG PHÁT TRIỂN & CẢI THIỆN (ROADMAP ĐỀ XUẤT)

Thứ tự ưu tiên theo TNTTVN Priority Order (§29): Security & Privacy > Data Integrity > Tenant Isolation > Business Rule Correctness > Offline Reliability > Reliability > Maintainability > Observability > Performance > Convenience.

### Giai đoạn 1 — Tăng thông lượng + độ bền vận hành (ưu tiên cao)

**P1.1 Batch scan từ nhiều ảnh/file (web + mobile)** — G1 — D2/GENERAL (đề xuất, chưa chấp thuận)
- Xử lý **client-side tuần tự** các ảnh đã chọn (giữ nguyên Privacy — không gửi ảnh lên server), reuse detector hiện tại → POST kết quả theo luồng cũ (`examStore.saveScores`).
- Bổ sung màn hình kết quả từng phiếu + sửa tay + lưu hàng loạt; tương đương "Chấm file scan" của Azota không cần vision server.
- Không đổi schema/API; gate dự kiến: Security & Privacy ≥ 7, Data Integrity ≥ 7, Testability ≥ 6.

**P1.2 Chế độ SBD + mã đề (thay thế QR khi photocopy)** — G2 — **D3/SECURITY** (đọc nhầm SBD = gán nhầm điểm → phải đánh giá riêng Privacy/Data Integrity)
- Thêm lưới tô SBD vào template; bắt buộc confidence gate + đọc 2 lần + xác nhận thủ công trước khi map học sinh; giữ nguyên chế độ QR.
- Cần ADR mới + decision record đầy đủ (D3: Security ≥ 8, Privacy ≥ 8, Data Integrity ≥ 8).

**P1.3 Chẩn đoán điều kiện ảnh kiểu ZipGrade** — G3 — D1 — ✅ FOUNDATION 2026-08-18
- Đo glare (vùng sáng chói trong bubble), độ nét (sharpness score), độ chênh bản in → cảnh báo tiếng Việt cụ thể thay vì fail code; tùy chọn chỉnh ngưỡng. Tăng tỷ lệ quét thành công lượt đầu trên máy phổ thông (đối tượng GLV TNTT).

**P1.4 Nhiều mã đề đảo / phiên** — G5 — D2 (schema: answerKey → map mã→key)

### Giai đoạn 2 — Phân tích & phản hồi (ưu tiên trung bình)

**P2.1 Phổ điểm + item analysis** (tỷ lệ đúng/sai từng câu, câu khó/dễ, discriminant factor) — D1/D2 — khai thác `exam_results.answers` có sẵn, view + export CSV.
**P2.2 Gửi kết quả cho phụ huynh** qua pipeline smart notification đã có (VnEdu/Azota đều làm).

### Giai đoạn 3 — Chiến lược dài hạn (cần decision matrix riêng)

**P3.1 Lưu ảnh phiếu tùy chọn để rà soát sau** (G7) — **privacy gate D3** (ảnh chứa PII trẻ em): opt-in theo giáo xứ, mã hóa, chính sách lưu giữ + xóa tự động; không mặc định bật.
**P3.2 OCR tự luận** (G8) — chi phí cao, cần ML on-device hoặc vision server (xung đột ADR-043 hiện tại); chỉ mở lại khi có bằng chứng nhu cầu cụ thể. Không ưu tiên cho quy mô TNTT.
**P3.3 Điểm danh QR cổng lớp** (đọc thẻ QR học sinh tại lớp → chuyên cần tự động) — tiếp cận thị trường Smart QR/VnEdu; có sẵn `qr.ts`, chuyên cần, offline queue. Đề xuất riêng nếu phù hợp nghiệp vụ TNTT.

### Khuyến nghị KHÔNG làm

- **Vision server / cloud ML** — đã REJECT tại ADR-043 (Security & Privacy 6<7). Giữ nguyên.
- Đổi sang định danh "viết tên" kiểu ZipGrade — vi phạm Data Integrity / tenant scope hiện có.

---

## V. TIẾN ĐỘ THEO DÕI

| Mục | Trạng thái | Ngày |
|---|---|---|
| Nghiên cứu thị trường (ZipGrade, GradeCam, Azota, nhóm điểm danh QR) | ✅ XONG | 2026-08-18 |
| Đánh giá cơ chế hiện tại + roadmap đề xuất | ✅ XONG (báo cáo này) | 2026-08-18 |
| Scan Engine v2 foundation: T2 protocol, review states, high-res capture, server recompute, diagnostics/KPI | ✅ XONG (ADR-049) | 2026-08-18 |
| P1.3 quality diagnostics + telemetry aggregate không PII | ✅ FOUNDATION | 2026-08-18 |
| P1.1 batch ảnh/thư mục explicit accepted-only | ✅ XONG (ADR-050); auto-live mặc định vẫn chờ corpus | 2026-08-19 |
| P1.2 SBD | ⏸ BLOCKED D3: thiếu corpus false-link/human review | — |
| P1.4 nhiều mã đề A–H + QR T3 + server score | ✅ XONG (ADR-050) | 2026-08-19 |
| P2.1 analytics câu hỏi/phổ điểm | ✅ XONG (ADR-050) | 2026-08-19 |
| G7 ảnh rà soát | ✅ LOCAL OPT-IN/24h; server archive vẫn không có | 2026-08-19 |
| Cập nhật ADR / business rules / API / DB / security docs | ✅ XONG (ADR-049/050) | 2026-08-19 |
| Đánh giá chuyên sâu bản nâng cấp v2 (commit 04b326d + 875d2be) | ✅ XONG (§VI) | 2026-08-18 |

---

## VI. ĐÁNH GIÁ CHUYÊN SÂU BẢN NÂNG CẤP MỚI — SCAN ENGINE V2 (ADR-049 + OMR ACCURACY FIX)

> Bản nâng cấp gồm 2 commit liên tiếp: `04b326d` (fix mobile OMR grading accuracy — detector/geometry) và `875d2be` (harden mobile OMR scan engine — ADR-049 foundation, +1250 dòng, 38 files). Verify: targeted OMR/QR/scan 132/132 + diagnostics 4/4 PASS, tree clean.

### VI.1 Cơ chế mới — phân tích từng lớp (E3)

**Lớp in-định danh (Form Protocol v2, `qr.ts`)**
- Payload mới `T2:{sessionHex8}:{studentHex8}:{I|F}:{questionCount}:{checksum4}` — Alphanumeric mode M, 25 module/cạnh (v1 21). Mang theo `templateMode` + `questionCount` + checksum FNV-1a 16-bit (chỉ chống cắt/sửa nhầm, không phải chữ ký — ghi rõ trong code `qr.ts`).
- Phiếu rời (`AnswerSheetModal`) dùng mode `F`, số câu = questionCount (MC) hoặc maxScore+1 (tự luận); đề gộp (`examSheets.ts`) dùng mode `I`, câu = số câu đề.
- Server `/api/exams/barcode/decode` validate checksum + count 1–50 (duplicate FNV server-side) — backward-compat TE/legacy giữ nguyên.

**Lớp detector (commit `04b326d`, `omr.ts` + `answerSheetTemplate.ts`)**
- `tryLocateFullPageFrame` MỚI: band rộng (x 0.01–0.44/0.56–0.99), **edge margin 0.62×sizePx** (chống lấy mép UI/vật tối bị crop làm marker — tái hiện trên ảnh iPhone TR cách mép 13px), min width 36%/height 30%, aspect 0.72–1.40, convexity gate (4 cross product cùng dấu).
- `tryLocateIntegratedFrame`: 6 scale (1→0.38) bắt marker 10–16px khi A4 chỉ chiếm 50–70% khung; aspect gate theo `integratedFrameAspectRatio(totalQuestions)` ±62–155%.
- `findMarkerInBand`: single-pass + quadrant + isolation (bigHalf 1.55×, thay 2× — trước nuốt bubble sát mép) + stride half/3.
- Geometry SSOT: marker 18px, bubble 16px, row 18px, `INTEGRATED_REF_H=174`, normalize Y theo `integratedFrameH(totalQuestions)` — fix lệch tâm 11–27px ở đề 10/20 câu.
- Written (`detectScoreFromImage`) bỏ hẳn fallback integrated; MC (`detectAnswersFromImage`) nhận `templateMode` bắt buộc từ UI — cấm fallback chéo (ADR-048 kế thừa).

**Lớp quyết định & ghi điểm (commit `875d2be`, ADR-049)**
- Trạng thái 3 mức `accepted | review_required | rejected`: `isWeakMark` = 0.24 ≤ coverage < 0.38 (MIN_WEAK_FILL), `needsReview` = multiFill || weakMark; phiếu không đáp án → ALL_BLANK (rejected); review trạng thái có thể trả score nhưng **không ghi được**.
- **Save khóa cứng**: còn `needsReview` hoặc không còn đáp án được chọn → nút Ghi Điểm disabled + banner hướng dẫn; edit câu lưu vào `wasCorrected/correctedQuestions`.
- **Server authoritative** (`examService.upsertExamResults`): MC + source `omr|qr_scan` → bắt buộc parse/validate `answers` (index 1..N, A/B/C/D/null, bỏ key `_*`), tính lại `correct/N × maxScore` từ session answerKey; sai lệch trả `adjustments` + ghi audit `EXAM_SAVE_RESULTS`. Metadata `scanMetadata` (≤10KB) qua **sanitizer đệ quy cấm image/photo/frame/blob/base64/data URL**; `detectionStatus ≠ accepted` → 400.
- **Capture**: `cameraStillCapture.ts` — ImageCapture API (Chromium/Android) lấy frame sensor tới 2200px, fallback video-frame cho iOS Safari.
- **Quan sát**: `scanQuality.ts` (meanLuma/GLARE/LOW_DETAIL — advisory, không phải hard gate) + `scanDiagnostics.ts` (telemetry localStorage **aggregate counter/timing, không ID/ảnh**) + `omrBenchmark.ts` (KPI: exactSheetAccuracy, falseAcceptCount, firstCaptureRate, reviewRoutingAccuracy, p95DurationMs) + corpus contract khử định danh (`tests/fixtures/omr-camera/README.md`).
- **DB/offline**: migration `20260818-123` (`exam_results.scan_metadata` nullable, add-only); offline sync gửi metadata + re-pull results khi server trả adjustments (`useSyncEngine.ts`).
- **Tenant fix**: `updateAnswerKeyAndRescore` + `getExamResults` bổ sung `parishId` filter (A-NEW-56 hardening).

### VI.2 Nghiên cứu thị trường cập nhật (2025–2026)

| Nguồn | Cơ chế | Kết quả công bố | Liên hệ với app TNTT |
|---|---|---|---|
| Review 25 papers (2026, ResearchGate) | Template matching: error-free khi shape cố định; DL (YOLO/CNN) linh hoạt hơn nhưng cần annotated data + compute; **hybrid pipeline là xu hướng** | — | Kiến trúc hiện tại (marker+homography+coverage) thuộc nhóm classical mạnh nhất; đúng quỹ đạo hybrid nếu bổ sung ML sau |
| JENER 2026 (marker-guided, ArUco + homography + normalized coords) | ĐÚNG kiến trúc TNTT (marker + homography) | IoU 0.96, reproj 2.1px, MC 99.1%, **205ms/phiếu**, mobile 95.4% robustness | Xác nhận hướng đi: marker-guided + SSOT geometry là chuẩn SOTA; TNTT đạt ≤2px Chromium — ngang tầm |
| Tinh & Minh (2024, ĐH Bách Khoa HN) | YOLOv8 tìm marker → segment → đọc bubble | error <0.5%, ~50 phiếu/phút | DL dùng để **locate** marker — khả thi thay `findMarkerInBand` sau này |
| MDPI 2025 (Mexico, 6029 phiếu thật) | Classical processing, desktop | 96.15% phiếu chính xác tuyệt đối, 99.95% câu 4-option, 1.04s/phiếu | Cùng triết lý fail-closed: độ chính xác câu cao hơn độ chính xác phiếu |
| OMRNet (MobileNetV2, 2024) | CNN phân loại bubble | 95.96% classification | DL thuần có accuracy **thấp hơn** classical tốt — không hấp dẫn thay thế |
| Azota 2026 | OCR 99.8% (tuyên bố), **AI chấm tự luận theo prompt + trả Point**, SBD+tô mã đề, batch scan, phổ điểm | — | Đối thủ vận hành quy mô vẫn dẫn đầu; AI tự luận là khác biệt lớn (G8) |

### VI.3 Đánh giá — bản v2 đã giải quyết gì (đối chiếu khoảng trống cũ)

| Khoảng trống cũ | Trạng thái sau v2 | Nhận xét (evidence) |
|---|---|---|
| G3 chẩn đoán ảnh | ✅ **PARTIAL → FOUNDATION** | `scanQuality.ts` + badge UI "Chất lượng ảnh: Đạt/Nên kiểm tra" + telemetry. Còn thiếu: hướng dẫn khắc phục theo reason (bật đèn pin khi TOO_DARK...), chưa có strictness slider kiểu ZipGrade |
| Trust boundary (score client) | ✅ **GIẢI QUYẾT TRIỆT ĐỂ** | Server recompute + adjustments + audit — vượt ZipGrade/Azota (cả hai tin client/cloud). Đây là nâng cấp Data Integrity lớn nhất |
| Sai mẫu/sai số câu | ✅ **GIẢI QUYẾT** | T2 metadata + mismatch hard-stop (camera dừng, chặn ghi) — chưa app nào có |
| Mobile accuracy | ✅ **CẢI THIỆN ĐÁNG KỂ** | 2200px still capture, 6-scale locator, full-page edge margin, geometry normalize theo câu — nhưng **E1 thực địa chưa xác nhận** (gate §21.3 vẫn đóng) |
| Tenant isolation | ✅ **FIX** | parishId filter trong rescore/getResults (A-NEW-56) |
| G1 batch scan | ✅ **FILE/FOLDER EXPLICIT** | Tối đa 500 ảnh, xử lý tuần tự; chỉ accepted + quality good mới vào nhóm chờ lưu. Auto-live mặc định vẫn đóng theo gate §21.3 |
| G3 chẩn đoán ảnh | ✅ **FOUNDATION + REMEDIATION** | Badge quality kèm hướng dẫn tối/chói/mất nét; batch route quality khác good sang review |
| G4 item analysis | ✅ **TRIỂN KHAI** | Phổ điểm, tỷ lệ đúng/trống A-D và point-biserial có minimum-sample gate |
| G5 nhiều mã đề | ✅ **TRIỂN KHAI A–H** | T3 checksum-bound; DB lưu version; server chọn key và recompute |
| G7 ảnh lưu trữ | 🟡 **LOCAL OPT-IN** | Ảnh nén mã hóa tenant-scoped, TTL 24h, không upload. Chưa có kho server/long-term review |
| G2 SBD / G6 BGD-A5-A6 / G8 OCR | ⏸ **BLOCKED** | Không đủ corpus/calibration/false-link evidence để vượt D3 Security/Privacy/Data Integrity gate |

### VI.4 Rủi ro mới & điểm cần theo dõi (post-review ADR-049)

1. **QR v2 25 module > v1 21** — mật độ module/px giảm ~19% ở cùng ô in; đã có regression blur/render, nhưng cần theo dõi E1 trên máy rẻ tiền (CONFIDENCE MEDIUM).
2. **Checksum FNV duplicate client/server** (`qr.ts` vs `routes/exams.ts`) — 2 nguồn sự thật, rủi ro drift nếu đổi thuật toán; cần test khớp chéo (hiện đã có qr.test.ts +17, giữ nguyên).
3. **Phiên MC cũ (tạo trước bản vá) thiếu answerKey** — server recompute không reject, chỉ tính 0 cho câu thiếu key; cần cân nhắc chặn hoặc cảnh báo khi complete (CONDITIONAL).
4. **Weak-mark band 0.24–0.38** — máy in kém/bút chì nhạt có thể tạo nhiều review_required, tốc độ giảm; đây là trade-off fail-safe có chủ đích (ADR-049), theo dõi qua telemetry.
5. **Telemetry local-only** — không quan sát được từ server; đề xuất sau khi đủ cờ: gửi aggregate counters (không PII) lên server để đo thực địa.
6. **capture 2200px 1 lần/chụp** — thêm latency ~100–300ms khi bấm `Chụp & chấm`; p95 detector vẫn trong gate.

### VI.5 Ma trận cập nhật (D2/GENERAL — sau v2)

| Criterion | Weight | Trước v2 | Sau v2 | Thay đổi |
|---|--:|--:|--:|---|
| Business / Operational Fit | 15% | 7 | 8 | Scan mobile khả dụng hơn; batch giữ đóng |
| Reliability & Data Integrity | 20% | 9 | 9.5 | Server authoritative + tenant fix + review states |
| Security & Privacy | 20% | 9 | 9.5 | Sanitizer đệ quy + telemetry không PII + checksum |
| Maintainability | 15% | 8 | 8.5 | Protocol SSOT + benchmark harness (−: FNV duplicate) |
| Performance | 10% | 9 | 9 | Detector giữ 12–50ms; still capture 1 lần/chụp |
| Testability | 10% | 9 | 9.5 | 1478 tests + corpus contract + KPI harness |
| Reversibility | 5% | 9 | 9 | Migration add-only, R1 |
| Observability | 5% | 6 | 7.5 | Quality assessment + diagnostics telemetry (local-only) |
| **Weighted** | **100%** | **8.4** | **8.8** | |

**Kết luận v2 (CONFIRMED):** bản nâng cấp giải quyết đúng 2 rủi ro Data Integrity/Privacy nghiêm trọng nhất (server tin điểm client; không ràng buộc mẫu) và đưa chất lượng quét mobile lên ngang chuẩn SOTA classical (marker-guided homography, JENER 2026). Khoảng trống vận hành quy mô (batch/SBD/mã đề) được **khóa có chủ đích** theo gate §21.3 thay vì vô tình triển khai chưa chuẩn — đúng ưu tiên TNTTVN. Còn lại: hoàn thiện hướng dẫn khắc phục quality, xem xét SBD (D3) và item analysis (P2.1) khi có nhu cầu, không đổi hướng kiến trúc client-side.
