# Nghiên cứu và kế hoạch phát triển quét chấm liên tiếp tốc độ cao

**Ngày:** 2026-08-28  
**Trạng thái:** PHASE 0–1 IMPLEMENTED — FIELD VALIDATION CONDITIONAL
**Severity / profile:** D2 / GENERAL cho luồng có người chấm xác nhận; D3 nếu bật tự lưu hoặc quét không giám sát  
**Phạm vi:** camera QR + OMR, chấm nhiều phiếu liên tiếp, lưu online/offline, đồng bộ, server-authoritative scoring, hiệu năng và accuracy gate  
**Quyết định:** đã xây dựng **Supervised Continuous Queue** dưới feature flag; chưa bật unattended/default auto-save

## 1. Kết luận điều hành

Repository đã có nền tảng gần hoàn chỉnh cho quét liên tiếp:

- camera có tùy chọn `Quét liên tiếp`, giữ stream sau khi lưu và dùng `Ghi & Quét Tiếp`;
- identity T3, quality gate, OMR geometry, 2-frame consensus và server recompute đã được harden;
- batch file hỗ trợ tối đa 500 ảnh và xử lý tuần tự có yield;
- detector v4 đạt dư địa hiệu năng tốt trong benchmark synthetic trên máy dev.

Tuy nhiên, luồng hiện hành vẫn là chuỗi tuần tự có điểm nghẽn:

`nhận diện -> chấm -> review -> POST/queue -> refresh kết quả -> reset -> phiếu kế tiếp`.

Không nên chỉ tăng cadence camera hoặc chuyển detector sang Worker. Kiểm toán đã xác nhận hai cổng lớn hơn:

1. **P0 — mất mutation khi offline:** hai lần lưu điểm liên tiếp của hai học sinh trong cùng một phiên thi bị hàng đợi đồng bộ gộp theo `exam + sessionId + UPDATE`; payload `scores[]` của lần sau thay lần trước. Reproduction test tạm thời trong phiên nghiên cứu đã PASS khi chứng minh queue còn đúng 1 operation và chỉ còn học sinh thứ hai.
2. **Accuracy thực địa chưa được chứng minh:** corpus camera hiện chỉ có hợp đồng/README, chưa có ảnh hoặc video đã khử định danh. Theo ADR-060/062 và BUSINESS_RULES, chưa được bật tự lưu hoặc auto-batch mặc định.

Phương án đúng là tách hai nhịp độc lập:

- **capture/review:** tiếp tục quét ngay sau khi người dùng xác nhận và mutation đã được ghi bền vững vào queue local;
- **commit/reconcile:** gửi nền lên server, nhận acknowledgement theo từng bài, hiển thị `Chờ đồng bộ / Đã đồng bộ / Xung đột / Lỗi` mà không chặn camera.

Mục tiêu này cải thiện throughput mà không hạ marker, paper, quality, confidence, 2-frame consensus, tenant isolation hoặc server-authoritative scoring.

## 2. Phạm vi nghiên cứu và nguồn bằng chứng

Đã kiểm tra end-to-end các nguồn sau:

| Lớp | Nguồn chính | Loại evidence |
|---|---|---|
| Camera và UI | `ExamSessionView.tsx`, `ExamScanModal.tsx`, `ExamBatchScanModal.tsx` | E3 |
| Identity / scheduling / consensus | `examScanIdentity.ts`, `omrFrameScheduler.ts`, `omrScanConsensus.ts` | E3 + E2 |
| Quality / acceptance / detector | `scanQuality.ts`, `scanAcceptancePolicy.ts`, `omr.ts`, `examCodeScanner.ts` | E3 + E2 |
| Client API / store / offline | `api.ts`, `examStore.ts`, `syncService.ts`, `syncStore.ts`, `syncProcessor.ts` | E3 + reproduction E2 |
| Server / data integrity | `routes/exams.ts`, `examService.ts`, schema, race tests | E3 + E2 |
| Quy tắc và kiến trúc | BUSINESS_RULES, ADR-023/024/043/048/049/050/060/062, API contract | E4 |
| Accuracy / performance | corpus contract, benchmark harness, targeted test suites | E2 + E4 |

Không có production telemetry hoặc corpus camera thật trong checkout, vì vậy throughput thực địa, độ chính xác camera và hành vi nhiệt/bộ nhớ dài phiên vẫn là `NOT CONFIRMED`.

## 3. Luồng hiện hành

```text
Camera frame
   |
   +--> QR/T3 identity (TTL 8s, recheck 1.2s)
   |
   +--> quality toàn frame
   |
   +--> marker + paper geometry + OMR
   |
   +--> 2 frame cùng answer fingerprint trong 1.8s
   |
   +--> accepted/review/rejected proposal
   |
   +--> người chấm xác nhận
   |
   +--> saveScores (online POST hoặc offline queue)
   |
   +--> refreshResults + reset identity
   |
   '--> camera tiếp tục
```

### 3.1 Điểm mạnh cần giữ nguyên

- T3 ràng buộc phiên, lớp, học sinh, template, số câu và mã đề; mismatch fail-closed.
- Live QR dùng staged ROI; explicit still/file mới chạy exhaustive mode.
- OMR v4 dùng grayscale + summed-area table một lượt, geometry/paper gate và adaptive bubble threshold.
- `accepted` chỉ là proposal; người chấm vẫn xác nhận trước ghi điểm.
- Server kiểm tra parish/class/session, trạng thái draft, học sinh hợp lệ, tự tính lại điểm từ đáp án và upsert theo `(parish, session, student)`.
- Ảnh camera không đi trong `scan_metadata`; diagnostics hiện hành chỉ lưu aggregate local.
- Camera stream được tái sử dụng giữa các phiếu; fixed-student stable mode không tự chấm liên tục.

### 3.2 Điểm nghẽn và khoảng trống

| Finding | Evidence | Tác động | Phân loại |
|---|---|---|---|
| Lưu offline nhiều bài cùng session làm mất các payload trước | `syncSaveExamResults()` luôn enqueue `exam/UPDATE/sessionId`; `addOp()` dedupe cùng entity/entityId/operation; `compactQueue()` shallow-merge nên mảng `scores` lấy bản cuối | Mất điểm chưa đồng bộ | **CONFIRMED / P0** |
| POST lưu kết quả không có `Idempotency-Key` | `api.saveExamResults()` gọi POST không header/key; retry policy không retry POST thiếu key | Timeout sau commit tạo trạng thái acknowledgement không chắc chắn; thao tác lại có thể thêm audit/ghi đè | **CONFIRMED / P1** |
| Sau save không có re-arm gate xác nhận phiếu cũ đã rời khung | identity/consensus reset rồi camera tiếp tục; `scannedList` chỉ để hiển thị | Cùng phiếu có thể được đề xuất lại; upsert last-write-wins | **CONFIRMED implementation; runtime frequency NOT CONFIRMED** |
| Camera chờ save/refresh trước khi sẵn sàng cho bài tiếp theo | `handleSave()` await store rồi mới reset | Network latency đi thẳng vào cycle time | **CONFIRMED** |
| Quality đo toàn frame trước khi biết paper ROI | `scanQuality.ts` lấy mẫu toàn canvas | Nền sáng/tối hoặc texture có thể chi phối blur/glare/detail | **CONFIRMED implementation; accuracy impact CONDITIONAL** |
| Live detection chạy đồng bộ trên main thread | RAF callback gọi QR/quality/OMR trực tiếp | Có nguy cơ jank trên mobile yếu; máy dev synthetic chưa cho thấy detector là bottleneck | **CONFIRMED architecture; field impact NOT CONFIRMED** |
| Batch file gom mọi accepted rồi gửi một request | `ExamBatchScanModal.tsx` | Request lớn và acknowledgement coarse; server adjustments chưa được phản ánh đầy đủ trong thông báo batch | **CONFIRMED** |
| Corpus thật trống | `tests/fixtures/omr-camera/` chỉ có README | Không được tuyên bố field accuracy hoặc bật unattended | **CONFIRMED** |

## 4. Finding P0 — hàng đợi offline làm mất bài chấm liên tiếp

### 4.1 Cơ chế gây lỗi

Hai thao tác:

```text
save_results(session=S, scores=[student=A])
save_results(session=S, scores=[student=B])
```

đều được mã hóa thành:

```text
entity=exam, entityId=S, operation=UPDATE
```

`syncStore.addOp()` phát hiện operation thứ hai là duplicate và thay payload của operation thứ nhất. Ngay cả khi cả hai operation tồn tại trước compaction, `compactQueue()` shallow-merge object; key `scores` là array nên array thứ hai thay array thứ nhất.

Kết quả thực tế trong reproduction:

```text
pending operations = 1
payload.action      = save_results
payload.scores      = [student B]
student A           = missing
```

Test offline hiện hành của `examStore` mới kiểm một lần save nên không bắt được sequence này.

### 4.2 Cách sửa bắt buộc trước tính năng mới

Không áp dụng shallow-merge chung cho action nghiệp vụ của exam. Chọn một trong hai cấu trúc tương đương về an toàn:

1. **Per-student mutation:** entity key chứa `sessionId + studentId`; mỗi bài là một mutation độc lập, có `clientMutationId`.
2. **Action-aware session queue:** giữ operation theo action; riêng `save_results` merge theo `studentId`, không merge array theo last-writer; `remove_result`, `complete`, `reopen` giữ thứ tự riêng.

Khuyến nghị dùng per-student mutation cho save/remove, kèm barrier của session cho complete/reopen. Điều kiện bất biến:

- không mất mutation khi chấm nhiều học sinh offline;
- cùng mutation retry không ghi lại;
- sửa lại cùng học sinh phải có version/conflict semantics rõ, không silent overwrite;
- `complete` chỉ được gửi sau toàn bộ save/remove trước nó;
- reload app vẫn khôi phục đầy đủ queue và trạng thái item;
- operation của user/parish khác không bao giờ được merge hoặc flush cùng nhau.

## 5. Các phương án

### A. Giữ luồng blocking hiện hành

Giữ camera, detector và server như hiện tại; chỉ tinh chỉnh cadence hoặc nút bấm.

- Ưu: ít thay đổi, rollback dễ.
- Nhược: network/refresh vẫn nằm trong critical path; không giải quyết P0 offline, duplicate/re-arm hoặc acknowledgement không chắc chắn.

### B. Supervised Continuous Queue — khuyến nghị

Giữ xác nhận từng phiếu, nhưng sau xác nhận chỉ chờ ghi mutation bền vững local; camera re-arm ngay, server sync chạy nền và trả status theo item.

- Ưu: tăng throughput ở nơi đang bị chặn; bảo toàn human gate và server authority; dùng lại detector v4.
- Nhược: phải sửa queue semantics, idempotency, conflict UX và state machine.

### C. Worker + deferred review + unattended auto-save ngay

Đưa QR/OMR sang Web Worker, tự nhận nhiều phiếu và lưu tự động.

- Ưu: tiềm năng giảm main-thread work và thao tác người dùng.
- Nhược: chưa có target-device evidence, thêm race/out-of-order/memory copy; auto-save xung đột trực tiếp với corpus gate; khó audit hơn trong khi P0 queue chưa được sửa.

## 6. Decision Matrix v4.1.2

Profile GENERAL, trọng số: Business 15%, Data Integrity 20%, Security & Privacy 20%, Maintainability 15%, Performance 10%, Testability 10%, Reversibility 5%, Observability 5%.

| Tiêu chí | A | B | C |
|---|---:|---:|---:|
| Business fit | 6 | 9 | 8 |
| Data integrity | 5 | 9 | 6 |
| Security & privacy | 9 | 9 | 8 |
| Maintainability | 8 | 8 | 6 |
| Performance | 6 | 9 | 9 |
| Testability | 7 | 9 | 5 |
| Reversibility | 10 | 8 | 7 |
| Observability | 5 | 9 | 7 |
| **Weighted score** | **6.95** | **8.80** | **7.00** |

### 6.1 Căn cứ chấm điểm

- **A / integrity 5:** E3 + reproduction E2 xác nhận queue làm mất multi-save offline.
- **A / security 9:** không mở rộng camera upload, auth, tenant hoặc server authority.
- **B / integrity 9:** chỉ đạt sau khi có action-aware/per-student queue, idempotency receipt, ordering test và conflict guard; hiện là target score, không phải trạng thái code.
- **B / performance 9:** loại network/full refresh khỏi capture critical path; đây là lợi ích kiến trúc chắc chắn, mức throughput thực tế vẫn phải đo.
- **C / integrity 6, testability 5:** thiếu sequence corpus và target-device evidence; thêm race bất đồng bộ trong khi storage semantics chưa an toàn.

### 6.2 Hard gates

- A: **REJECT làm nền tảng phát triển** vì Data Integrity 5 < 7.
- B: **CONDITIONAL SELECT**. Được triển khai theo phase, nhưng P0 queue và regression tests phải PASS trước khi mở UI mới.
- C: **REJECT NOW** vì Data Integrity 6 < 7 và Testability 5 < 6. Worker chỉ được đánh giá lại độc lập sau benchmark target device; unattended auto-save là D3 và bị khóa bởi ADR-060.

## 7. Kiến trúc được chọn

### 7.1 Hai pipeline tách rời

```text
CAPTURE PIPELINE                         COMMIT PIPELINE

AWAIT_SHEET                             DURABLE_PENDING
  -> IDENTIFYING                          -> SENDING
  -> ANALYZING                            -> ACKNOWLEDGED
  -> REVIEWING                            -> RECONCILED
  -> USER_CONFIRMED                       -> SYNCED
  -> DURABLE_PENDING --------------------> or CONFLICT / ERROR
  -> AWAIT_REMOVAL_OR_NEW_ID
  -> AWAIT_SHEET
```

Camera không đợi `SENDING -> SYNCED`. Nó chỉ được re-arm sau khi:

1. người dùng đã xác nhận proposal;
2. mutation đã ghi thành công vào storage local được mã hóa;
3. phiếu cũ đã rời khung trong cửa sổ ổn định **hoặc** identity mới khác phiếu trước đã được xác nhận.

Không chọn một timeout tùy ý trước khi có video sequence benchmark. Giá trị cuối phải được tune theo profile thiết bị nhưng vẫn có hard guard không nhận lại cùng sheet.

### 7.2 State machine tối thiểu

| State | Entry condition | Exit condition | Không được phép |
|---|---|---|---|
| `awaiting_sheet` | camera sẵn sàng | identity candidate hợp lệ | tự lưu |
| `identifying` | QR candidate | T3/session/class/student hợp lệ | dùng identity stale vượt TTL |
| `analyzing` | identity hợp lệ | quality + OMR + consensus | bỏ marker/paper/quality gate |
| `reviewing` | proposal accepted/review | người dùng save/skip/rescan | accepted = saved |
| `durable_pending` | local transaction commit | re-arm + background send | đóng modal nếu local write lỗi |
| `awaiting_rearm` | đã ghi local | old sheet absent hoặc new identity stable | nhận lại fingerprint cũ |
| `conflict` | same student khác fingerprint/version/server state | explicit resolve | last-write-wins im lặng |
| `paused/error` | camera/storage lỗi | explicit recovery | tiếp tục ngầm |

### 7.3 Dedupe và conflict

Mỗi proposal sinh:

```text
attemptFingerprint = hash(
  parishId,
  sessionId,
  studentId,
  examVersion,
  normalizedAnswers,
  templateMode,
  questionCount
)
```

- cùng student + cùng fingerprint trong phiên capture: bỏ qua như duplicate;
- cùng student + fingerprint khác: đưa vào conflict, hiển thị điểm/đáp án cũ và mới;
- server đã có kết quả mà client không có expected version: không silent overwrite;
- `scannedList` không phải source of truth; source of truth là durable queue + reconciled result store.

### 7.4 Mutation và acknowledgement contract đề xuất

Request item cần tối thiểu:

```ts
type ExamResultMutation = {
  clientMutationId: string
  sessionId: string
  studentId: string
  examVersion: string
  answers: string
  clientScore: number       // advisory only
  source: 'omr-continuous-v1'
  scanMetadata: string      // aggregate only, never image
  attemptFingerprint: string
  capturedAt: string
  expectedResultVersion?: string
}
```

Response phải itemized:

```ts
type ExamResultMutationAck = {
  clientMutationId: string
  studentId: string
  status: 'created' | 'updated' | 'duplicate' | 'conflict' | 'rejected'
  serverScore?: number
  resultVersion?: string
  reason?: string
}
```

Server tiếp tục tự tính điểm. `clientMutationId` phải được dedupe bền vững trong transaction với result/audit. Nếu hạ tầng hiện hành chưa có receipt dùng chung, migration additive cho receipt ledger là phương án an toàn hơn việc chỉ gắn key vào request header; receipt cần parish/user scope, request hash, response snapshot và retention policy.

### 7.5 Quality hai tầng

Không hạ các threshold OMR. Thay đổi được đề xuất:

1. **Global viability gate rẻ:** chỉ loại frame cực tối, cực cháy hoặc không đủ detail để tìm marker.
2. **Paper-normalized quality:** sau khi có marker/homography, đo blur/glare/contrast trên paper ROI và vùng bubble; đây mới là quality dùng cho accepted/review/rejected.

Mọi thay đổi threshold chỉ được merge khi synthetic regression không giảm và corpus normal/stress/negative chứng minh không tăng false accept.

## 8. Hiệu năng

### 8.1 Benchmark trong phiên nghiên cứu

`npm run benchmark:omr` PASS trên máy dev, Node 24.14.1. Đây là warm synthetic detector-only; không gồm lấy camera frame thực, decode ảnh file, UI, network hoặc thao tác đổi phiếu.

| Workload | Kích thước | Kết quả |
|---|---:|---:|
| OMR integrated accepted | 800 | p95 7.74 ms |
| OMR integrated accepted | 960 | p95 8.55 ms |
| OMR integrated accepted | 1280 | p95 16.04 ms |
| OMR full-page accepted | 960 | p95 8.55 ms |
| OMR full-page accepted | 1280 | p95 17.14 ms |
| OMR auto -> full-page fallback | 960 | p95 51.08 ms |
| OMR auto no-marker | 960 | p95 13.42 ms |
| QR positive `live_fast` | 960 / 1280 | p95 11.55 / 17.54 ms |
| QR negative `live_fast` | 960 / 1280 | p95 27.46 / 49.59 ms |
| QR negative `live_recovery`, n=10 | 960 / 1280 | max 42.19 / 73.07 ms |
| QR negative `exhaustive`, n=3 | 960 / 1280 | max 256.25 / 465.38 ms |

Không gọi `max` của workload n nhỏ là p95. Kết quả cho thấy detector desktop synthetic chưa phải lý do đủ mạnh để ưu tiên Worker. Nút thắt có xác suất cao hơn là thay phiếu vật lý, 2-frame confirmation, review, durable write, network acknowledgement và full refresh; đây là inference cần đo end-to-end.

### 8.2 KPI bắt buộc cho continuous mode

Không dùng riêng `detector ms` làm KPI. Thu thập theo exact profile:

- `sheet_visible -> proposal_ready` p50/p95;
- `user_confirm -> durable_pending` p50/p95;
- `durable_pending -> server_ack` p50/p95, tách online/offline recovery;
- papers/minute bền vững ở chuỗi 30 và 100 phiếu;
- first-capture rate;
- duplicate proposal rate = 0;
- false identity association = 0;
- lost mutation = 0;
- reload recovery = 100%;
- conflict detection/routing = 100%;
- main-thread long tasks, dropped frames, peak memory và memory slope;
- camera recovery sau background/foreground hoặc track interruption.

Mục tiêu papers/minute và device matrix là quyết định sản phẩm còn thiếu; không được suy ra từ microbenchmark desktop.

### 8.3 Khi nào mới dùng Worker

Chỉ tạo spike Worker/OffscreenCanvas nếu target-device benchmark chỉ ra main-thread long task hoặc input latency không đạt. Spike phải có:

- một frame in-flight, không tạo backlog ảnh;
- transferable buffer hoặc kiểm soát copy;
- generation token để bỏ kết quả stale/out-of-order;
- cấu hình session/template/version snapshot theo job;
- giới hạn memory và release bitmap/buffer;
- crash fallback về main thread;
- parity test bit-for-bit về accepted/review/rejected.

Worker là capability của nền tảng, không tự nó là bằng chứng tăng tốc.

## 9. Accuracy và corpus gate

### 9.1 Gate hiện hành không thay đổi

Unattended/default MC auto-batch chỉ được bật khi corpus privacy-safe có tối thiểu:

- normal >= 200;
- stress >= 100;
- negative >= 100;
- normal exact-sheet >= 99.5%;
- stress exact-sheet >= 98%;
- answer accuracy >= 99.5%;
- first-capture >= 95%;
- false accept = 0;
- review routing = 100%;
- negative routing = 100%;
- detector p95 <= 150 ms trên **mọi** required release profile.

Mọi exact profile cần đủ sample riêng; không pool device/browser/resolution/template/questionCount/cold-warm để làm đẹp p95.

### 9.2 Bổ sung bắt buộc cho continuous sequence

Corpus ảnh tĩnh chưa đủ. Cần video hoặc frame sequence đã khử định danh bao phủ:

- cùng phiếu giữ nguyên trong khung sau khi lưu;
- rút phiếu chậm, che một phần rồi đặt lại;
- đổi phiếu ngay lập tức;
- QR mới mờ/không đọc được trong khi identity cũ còn TTL;
- sai phiên, sai lớp, sai template, sai số câu, sai mã đề;
- cùng học sinh, cùng đáp án;
- cùng học sinh, đáp án khác;
- blank, multi-fill, weak fill, tẩy xóa, gấp giấy, glare, skew;
- mất mạng trước request, trong request và sau server commit nhưng trước response;
- app background/foreground, camera track ended, đổi orientation;
- Worker result out-of-order nếu spike Worker được thực hiện;
- chuỗi dài để đo nhiệt, memory và latency drift.

Sequence gate bổ sung:

- false re-arm = 0;
- stale identity association = 0;
- duplicate durable mutation = 0;
- lost durable mutation = 0;
- out-of-order acknowledgement corrupts UI = 0;
- 100% unresolved cases vào review/conflict, không accepted ngầm.

## 10. Security, privacy, tenant và audit

- Giữ xử lý ảnh on-device; không upload raw frame/snapshot trong continuous mode.
- Preview chỉ tồn tại trong memory. Snapshot debug nếu có phải opt-in, mã hóa local, TTL và không đi vào sync payload.
- `scanMetadata` chỉ chứa version, quality bucket và aggregate diagnostics đã allowlist; không chứa ID nhạy cảm ngoài dữ liệu nghiệp vụ route cần có.
- Server tiếp tục kiểm parish, quyền admin/chủ nhiệm/phụ tá, class access, session draft và student membership.
- Idempotency receipt phải scope theo parish + user + mutation key; không dùng key global làm kênh suy đoán cross-tenant.
- Audit chỉ ghi một lần cho một mutation id; retry trả lại acknowledgement cũ.
- Telemetry hiệu năng chỉ aggregate, không ảnh/QR/student ID; phải có giới hạn retention.
- Không mở OCR/SBD hoặc cloud vision trong phase này.

## 11. ADR và Business Rule Gate

| Nguồn | Kết quả | Điều kiện |
|---|---|---|
| ADR-023 offline exam | **CONDITIONAL** | queue action-aware, ordering và reload recovery phải PASS |
| ADR-024 / ADR-043 auth + tenant | **PASS** | không đổi server access checks |
| ADR-048 / ADR-049 / ADR-050 scan identity/template/version | **PASS** | không hạ T3/checksum/version/template gates |
| ADR-060 corpus gate | **PASS cho supervised proposal; CONFLICT với auto-save hiện tại** | unattended chỉ sau corpus đầy đủ |
| ADR-062 scan engine v4 | **PASS** | giữ staged resolution, consensus, quality/geometry gates; Worker vẫn conditional |

Business rule classification:

- server-authoritative scoring: **CONFIRMED**;
- proposal phải được người chấm xác nhận: **CONFIRMED**;
- fail-closed identity/template/quality/OMR: **CONFIRMED**;
- multi-save offline an toàn: **NOT CONFIRMED và hiện đang sai**;
- field camera accuracy: **NOT CONFIRMED**;
- target-device p95/end-to-end throughput: **NOT CONFIRMED**;
- unattended/default auto-save: **NOT CONFIRMED / BLOCKED**.

## 12. Lộ trình triển khai và trạng thái

### Phase 0 — data integrity gate — ✅ IMPLEMENTED

1. Viết failing regression tests cho hai/ba học sinh lưu liên tiếp offline.
2. Thiết kế per-student/action-aware queue và session barrier.
3. Thêm tests: same student update, save -> remove, remove -> save, saves -> complete, reopen, retrying, reload, user/parish isolation.
4. Bổ sung `clientMutationId`, request hash, itemized acknowledgement và server dedupe transaction.
5. Chứng minh timeout-after-commit retry không thêm audit hoặc ghi đè mutation mới hơn.

**Exit gate:** zero lost mutation, zero cross-user merge, ordering deterministic, targeted + full offline/server suite PASS.

### Phase 1 — supervised continuous queue — ✅ IMPLEMENTED

1. Tách orchestration khỏi `ExamScanModal` thành pure reducer/state machine có test.
2. Giữ detector v4; thêm re-arm/removal gate và attempt fingerprint.
3. Sau explicit save, commit local transaction rồi resume camera; sync chạy nền.
4. UI item ledger: `Chờ đồng bộ`, `Đã đồng bộ`, `Cần xử lý`, `Lỗi`; có pause/resume và retry có kiểm soát.
5. Không gọi full `refreshResults()` sau mỗi phiếu; reconcile itemized acknowledgement vào store.
6. Hiển thị server adjustment theo từng học sinh.
7. Đặt feature flag `continuousScanV2`, giữ `Chấm Ổn Định` làm rollback path.

**Exit gate:** sequence tests, offline reload, duplicate/conflict, tenant/auth và accessibility PASS.

### Phase 2 — quality ROI, corpus và target devices — 🟠 ENGINEERING GATE IMPLEMENTED / CHƯA CÓ FIELD EVIDENCE

1. Thêm paper-ROI quality mà không hạ global safety gate.
2. Thu corpus normal/stress/negative và continuous sequences theo manifest privacy-safe.
3. Chạy release matrix trên low/mid Android Chrome, iPhone Safari/PWA và desktop Chrome sau khi product chốt thiết bị mục tiêu.
4. Benchmark chuỗi 30/100 phiếu; đo cả capture, durable write, acknowledgement, memory và nhiệt.
5. Tune cadence/re-arm bằng evidence, không bằng cảm giác.

Đã triển khai ngày 2026-08-28: `paper_roi` quality chạy **shadow-only** sau paper/marker gate; acceptance vẫn dùng global frame quality. ROI grid giới hạn 120 mẫu theo trục ngắn để không nhân đôi hot path; synthetic integrated 1280×1808 n=100 đạt p95 33,62ms trên dev host sau tối ưu, không phải target-device claim. Diagnostics v3 chỉ lưu counter so sánh `frame`/`paper_roi`, không ảnh/ID. `omrSequenceBenchmark.ts` + `npm run benchmark:omr:sequence -- <manifest> <targets>` fail-closed nếu thiếu exact profile, target, timing từng bài, responsiveness/memory evidence, một run 30 riêng và một run 100 riêng; mọi integrity failure, unresolved không route hoặc reload không recover đều chặn release.

ADR-069 bổ sung collector chính thức trong **Chẩn đoán hệ thống → Bằng Chứng OMR Thiết Bị Thật**. Operator nhập nhãn không PII, chọn 30/100 và chủ động chuẩn bị; recorder chỉ bắt đầu ở proposal đầu, khóa exact engine/device/browser/frame/template/questionCount, nối timing proposal → durable → terminal acknowledgement và chỉ export completed run. Raw mutation ID chỉ được đối chiếu bằng token băm per-run và không đi vào JSON; ảnh/QR/đáp án/student/session/parish/user/timestamp đều không được lưu. Responsiveness ưu tiên Long Animation Frame, fallback Long Task; memory ưu tiên Measure Memory, fallback Chromium heap, thiếu capability ghi `unsupported` để gate fail. Corpus/target-device artifact thật vẫn chưa có nên Phase 2 **chưa đạt exit gate**.

Quy trình vận hành tối thiểu cho mỗi required profile:

1. Trên đúng thiết bị/browser/release cần chứng nhận, mở Chẩn đoán hệ thống và đặt nhãn ổn định như `iphone-13` + `safari-18`.
2. Chạy riêng 30 phiếu; trong profile phải có ít nhất một proposal vào review/conflict và một lần reload đã recover. Chờ mọi item hết pending, export JSON. Sau đó chạy riêng 100 phiếu và export lần nữa. Không dùng run 100 để thay run 30; ghi ngay stale identity/mutation trùng nếu operator quan sát thấy.
3. Gộp các completed runs privacy-safe vào một manifest, khai báo exact `requiredProfiles` và target số trong targets JSON, rồi chạy `npm run benchmark:omr:sequence -- <manifest> <targets>`.
4. Chỉ mở pilot khi sequence gate PASS **và** corpus accuracy ADR-060 PASS. Nếu capability memory/responsiveness thiếu, chọn phương pháp đo external có kiểm soát hoặc giữ gate đóng; không gán số 0.

#### Phase 2.5 — qualification v2 — ✅ ENGINEERING IMPLEMENTED / PRODUCT TARGETS PENDING

- Exact profile bind immutable release Git SHA; build `dev/local/unknown` không được arm field run.
- `runElapsedMs` đo toàn khoảng proposal đầu → ack cuối, không export timestamp; gate tính minimum papers/minute.
- Sustained drift lấy proposal p95 quarter cuối / quarter đầu trên từng run và dùng trường hợp xấu nhất.
- CLI nhận nhiều export **cùng release**: `npm run benchmark:omr:sequence -- run30.json run100.json targets.json`; unexpected profile, mixed release và duplicate run đều fail.
- Scaffold: `npm run benchmark:omr:sequence -- --scaffold-targets run30.json run100.json`; tất cả target null và không thể PASS trước khi product owner đặt số.
- Manifest/targets/storage v2; legacy v1 không tự migrate vì thiếu release/elapsed provenance.

#### Phase 2.6 — operator preflight và release-safe export — ✅ ENGINEERING IMPLEMENTED / FIELD RUN PENDING

- Active run hiển thị trực tiếp unresolved routed, reload recovered, observer responsiveness, nguồn memory và safety failures; trạng thái này chỉ là evidence completeness, không phải qualification PASS.
- Responsiveness source chỉ được ghi sau khi `PerformanceObserver.observe()` attach thành công. Chỉ nhìn thấy entry type được browser quảng bá không còn được coi là evidence.
- Completed runs được đếm theo release. Nút manifest và target scaffold chỉ xuất run của release hiện tại, vì vậy artifact không bị mixed-build khi local storage còn run lịch sử.
- Target scaffold trong UI vẫn cố ý để toàn bộ target `null`; product owner phải đặt ngưỡng và CLI evaluator vẫn là release gate cuối.
- Summary/preflight không chứa mutation token, ID nghiệp vụ, ảnh, đáp án hoặc timestamp; không API/schema/upload mới.

Các ngưỡng `papersPerMinuteMin` và `proposalLatencyDriftRatioMax` chưa có authority nên vẫn **NOT CONFIRMED**. Browser không có thermal API ổn định; phép đo nhiệt trực tiếp phải là external protocol riêng. Không được suy luận nhiệt độ từ throughput/drift.

### Phase 3 — pilot và rollout — 🟠 ROLLOUT CONTROLS IMPLEMENTED / PILOT CHƯA BẬT

1. Internal pilot có feature flag, một nhóm vận hành được đào tạo.
2. So sánh với stable mode bằng throughput, review rate, conflict, duplicate và lost mutation.
3. Canary theo parish/user, không bật global một lần.
4. Tự động tắt flag nếu có false accept, identity mismatch, lost mutation, queue growth không thoát hoặc crash/memory regression.

Đã triển khai readiness: pilot mặc định fail-closed, chỉ mở theo parish/user allowlist; thiếu/không đọc được circuit storage cũng không bật fast queue và stable batch vẫn là fallback. Durable-write failure, idempotency conflict hoặc terminal result-sync failure mở circuit local theo scope đã hash. Circuit chỉ reset bằng revision mới sau khi phát hành fix. Không có allowlist production/corpus đạt gate trong repo, vì vậy đây **không phải tuyên bố pilot đã chạy**.

### Phase 4 — đánh giá Worker hoặc deferred review — ⏸ BLOCKED BY EVIDENCE

- Worker chỉ khi target-device profile không đạt do main thread.
- Deferred review chỉ khi supervised per-paper mode đạt accuracy/data-integrity gate và operator study chứng minh lợi ích.
- Unattended/default auto-save là quyết định D3 riêng; phải chạy lại SECURITY/OFFLINE matrix và ADR-060 corpus gate.

Post-review ADR-068 giữ Worker/deferred review ở trạng thái `NOT SELECTED`: build/dev benchmark không chứng minh main-thread bottleneck trên thiết bị mục tiêu. OffscreenCanvas/Worker là capability kỹ thuật, không phải bằng chứng cải thiện end-to-end; chỉ mở lại lựa chọn này nếu sequence report chỉ ra p95/Long Tasks không đạt trong khi accuracy/integrity đã PASS.

Reassessment ADR-069 không thay kết luận trên. Standards xác định Long Task/Long Animation Frame trên 50ms và cung cấp OffscreenCanvas transferable, nhưng timer có thể bị throttle/freeze khi page nền, unload không đáng tin trên mobile, còn memory API là estimate và không phổ quát. Vì vậy artifact phải ghi rõ observer/measurement source; capability browser không đủ để chọn Worker. Nguồn: `https://www.w3.org/TR/longtasks-1/`, `https://www.w3.org/TR/long-animation-frames/`, `https://www.w3.org/TR/hr-time-3/`, `https://wicg.github.io/performance-measure-memory/`, `https://www.w3.org/TR/beacon/`, `https://html.spec.whatwg.org/multipage/canvas.html`.

Reassessment ADR-070 tiếp tục giữ Phase 4 đóng. Chỉ khi v2 field artifact vượt accuracy/integrity nhưng hụt proposal p95/drift hoặc Long Frames mới đủ evidence để chấm lại Worker. Hụt acknowledgement/throughput do mạng hoặc thao tác vận hành không phải bằng chứng cho Worker.

Reassessment ADR-071 không thay trạng thái Phase 4/pilot. Preflight giảm rủi ro thu một run không dùng được và sửa capability-only false evidence, nhưng chưa tạo bất kỳ measurement thiết bị thật nào. Accuracy, target số, thermal, Worker benefit và pilot result vẫn `NOT CONFIRMED`.

## 13. File impact dự kiến

Không phải danh sách commit cứng; cần xác nhận lại sau Phase 0 design.

| Khu vực | File/module dự kiến |
|---|---|
| State machine / UI | `ExamScanModal.tsx`, module `examContinuousScan*`, component ledger/conflict |
| Queue / offline | `syncService.ts`, `syncStore.ts`, `syncProcessor.ts`, `examStore.ts` |
| API | `api.ts`, `FRONTEND_API_CONTRACT.md` |
| Server | `routes/exams.ts`, `examService.ts`, schema/migration nếu cần receipt ledger |
| Scan quality | `scanQuality.ts`, acceptance policy, tests |
| Corpus / benchmark | `tests/fixtures/omr-camera`, benchmark runner/gate, sequence fixtures |
| Tests | store/sync/server race/idempotency, state-machine, fake-camera sequence, E2E |

## 14. Verification matrix

| Nhóm | Trường hợp bắt buộc |
|---|---|
| Pure state | mọi transition hợp lệ; stale callback/generation bị bỏ |
| Identity | TTL, recheck, wrong session/class/student/template/version |
| Rearm/dedupe | same sheet retained, remove/reinsert, immediate swap, same/different fingerprint |
| OMR | blank/multi/weak/skew/glare; 2-frame consensus; no threshold regression |
| Storage | multi-student, same-student revision, reload, quota/error, encrypted payload |
| Ordering | save/remove/complete/reopen permutations |
| API | timeout before/after commit, duplicate mutation id, hash mismatch, itemized partial result |
| Server | tenant/class membership, draft guard, server score adjustment, concurrent requests |
| UX | pause/resume, per-item statuses, conflict resolution, camera denied/ended |
| Performance | exact device profiles, 30/100-sheet sustained run, memory/thermal drift |
| Privacy | no image/QR leakage in request, queue, diagnostics, log hoặc audit |

Baseline nghiên cứu đã PASS **17 test files / 182 tests**. Sau Phase 0–1: targeted queue/store/API/server/idempotency/rearm/identity/acceptance PASS **11 files / 163 tests**; `npm run lint`, production frontend + server TypeScript + Vite/PWA build và `npm run benchmark:omr` PASS. Phase 2–3 readiness targeted PASS **8 files / 86 tests**, lint/design-system lint và production client/server/PWA build PASS. Full serialized Phase 2–3 run **INCONCLUSIVE**: tái hiện lỗi baseline `examPrintGeometry.test.ts` rồi runner không xuất summary/progress và được dừng; isolated print PASS 12/13, cùng left margin 19,86px < 22,68px, ngoài diff feature. Full serialized gần nhất hoàn tất ở Phase 0–1 là 242/243 files, 1762/1763 tests. Các số synthetic/test không chứng nhận field accuracy.

## 15. Rollback

- Feature flag tắt `continuousScanV2` và quay về stable per-paper flow.
- Request fields mới phải optional trong giai đoạn tương thích; server cũ/client cũ không bị phá.
- Nếu có receipt ledger, migration additive; rollback code không xóa ledger hoặc result.
- Không đổi các threshold OMR cùng commit với orchestration/queue để khoanh vùng regression.
- Không xóa stable mode cho tới khi pilot và corpus gate hoàn tất.

Rollback trigger tức thời:

- bất kỳ lost mutation hoặc cross-tenant result;
- false identity association hoặc false accept;
- duplicate proposal không được chặn;
- queue không drain sau khi mạng phục hồi;
- server/client reconciliation lệch điểm mà không hiển thị adjustment;
- memory tăng không giới hạn hoặc camera mất ổn định trong long run.

## 16. Tài liệu phải đồng bộ khi triển khai

Khi Phase 0/1 thay code hoặc contract, cùng commit phải cập nhật tối thiểu:

- `docs/02_ARCHITECTURE.md`;
- `docs/AI_CONTEXT_MAP.md`;
- `docs/BUSINESS_RULES.md`;
- `docs/FRONTEND_API_CONTRACT.md`;
- `docs/SECURITY_AUDIT_LOG.md`;
- `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md`;
- `docs/07_DATABASE_PLAN.md` nếu có schema/migration;
- `docs/OMR_SCAN_MARKET_ANALYSIS.md`;
- `tests/fixtures/omr-camera/README.md`.

## 17. Các quyết định sản phẩm còn mở

Không chặn Phase 0, nhưng phải chốt trước field acceptance:

1. device/browser matrix chính thức;
2. throughput mục tiêu theo papers/minute cho chuỗi 30 và 100 bài;
3. Phase 1 luôn xác nhận từng bài hay cho phép deferred review sau khi corpus đạt;
4. policy khi cùng học sinh xuất hiện lần hai với đáp án khác;
5. retention của mutation receipt và aggregate telemetry;
6. nhóm pilot và quyền bật feature flag.

Khuyến nghị mặc định: xác nhận từng bài, same-student/different-answer luôn conflict, không auto-overwrite, không auto-save.

## 18. Tham chiếu ngoài

- ZipGrade mô tả flow căn bốn góc, nhận feedback rồi lặp lại với phiếu tiếp theo; ứng dụng cũng hỗ trợ scan/review offline: [Getting started](https://support.zipgrade.com/hc/en-us/articles/202512589-How-do-I-get-started-with-ZipGrade), [Offline use](https://support.zipgrade.com/hc/en-us/articles/202512779-Is-an-always-on-internet-connection-required-to-use-ZipGrade).
- Azota mô tả batch từ thư mục/ảnh rồi kiểm tra trước khi lưu, củng cố việc tách capture khỏi review/commit: [Chấm từ file scan trên web](https://docs.azota.vn/docs/huong-dan-su-dung/thi-offline/cham-tu-file-scan-tren-web/).
- jsQR ghi nhận `attemptBoth` có chi phí hiệu năng đáng kể, phù hợp với staged fast/recovery/exhaustive mode hiện hành: [jsQR](https://github.com/cozmo/jsQR).
- OffscreenCanvas có thể dùng trong Worker nhưng specification chỉ xác nhận capability, không bảo đảm nhanh hơn trên thiết bị mục tiêu: [WHATWG Canvas](https://html.spec.whatwg.org/multipage/canvas.html).

---

**Post-implementation recommendation:** giữ Phase 0–1 dưới feature flag và thu thập sequence corpus/target-device evidence trước pilot. Không đầu tư Worker hoặc unattended auto-save cho tới khi queue integrity, sequence corpus và target-device evidence đạt gate.
