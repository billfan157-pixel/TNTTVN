# Assessment — Question Bank, Exam & OMR audit — Catevia/TNTTVN

Ngày: 2026-09-06. Snapshot audit: HEAD `949ba9ed61b8a766698ffadb8a2ec7f8d3890912` (`feat: single-parish deployment hardening + RBAC/auth audit batch, services, tests and docs`). Working tree sạch trước audit; audit ban đầu chỉ thêm tài liệu và opt-in diagnostic probe, không sửa product code.

Đây là audit độc lập của **current implementation**. Các kết luận cũ trong ADR/audit chỉ được dùng để tìm vùng cần kiểm tra rồi được đối chiếu lại với route, service, schema, client state, sync engine và tests hiện hành. Không truy cập production DB, thiết bị thật, ảnh bài thi thật hay telemetry production.

> **Remediation follow-up cùng ngày:** sau khi freeze các finding D1–D5, product code/schema/contracts/tests đã được sửa theo ADR-107. Các mục 1–13 bên dưới được giữ nguyên làm bằng chứng của snapshot trước sửa; trạng thái implementation sau sửa, verification và residual risk nằm tại mục 14. Không đọc phần finding lịch sử như claim về working tree hiện hành.

## 1. Kết luận điều hành

Pipeline hiện tại có nền tảng đúng cho một modular monolith: Question Bank versioned và materialize snapshot trong transaction; manifest A–H deterministic; server kiểm học sinh thuộc lớp, tự chấm MC/mixed; retry cùng mutation ID idempotent; Exam là single writer sang Grade trong transaction có ledger và conflict receipt.

Tuy vậy, hệ thống **chưa đạt đầy đủ invariant “đúng mã đề, không lệch do concurrency/stale state, provenance rõ ràng”**. Audit tái lập được năm nhóm lỗi cụ thể:

1. **P0 — D1:** mixed exam mã B–H bị chấm lại theo mã A và mất provenance scan khi nhập điểm tự luận sau OMR. Probe cho kết quả 5 thay vì 7, đổi `examVersion B → A`, xóa `scanMetadata`.
2. **P1 — D2:** server dùng last-writer-wins cho nhiều result mutation khác nhau của cùng học sinh; không có OCC hoặc precondition xác nhận overwrite. Test race hiện hành chứng minh năm điểm 4–8 đều trả success, kết quả cuối là điểm thắng lịch chạy.
3. **P1 — D3:** queue thay mutation cũ bằng mutation mới cho cùng học sinh nhưng client ledger vẫn giữ cả hai là `pending`; complete barrier có thể chờ acknowledgement của mutation đã bị xóa khỏi queue.
4. **P2 — D4:** retry cùng một build request từ Question Bank tạo hai exam session/snapshot/manifest độc lập vì idempotency key được sinh từ session ID mới.
5. **P2 — D5:** provenance OMR/manual correction là client-attested và lossy. Server nhận `source='omr'` khi không có `scanMetadata`; không lưu `attemptFingerprint`, `capturedAt`, detected-before/final-after; rescan và re-finalize thay lịch sử hiện hành.

Không có bằng chứng rằng những lỗi trên cho phép người ngoài lớp ghi điểm: tenant/class/student checks vẫn chạy. Đây là lỗi integrity/provenance của người chấm hợp lệ và failure/retry/concurrency paths.

OMR detector **không được kết luận đạt thực địa**. Repo chỉ có hướng dẫn corpus, không có ảnh corpus hoặc manifest sequence/targets. Benchmark synthetic tại dev host cho OMR p95 9.30–79.18 ms ở các case đo đủ 100 mẫu, dưới target kỹ thuật 150 ms, nhưng không chứng minh accuracy, false accept, camera latency, thermal/memory hoặc đúng thiết bị release.

## 2. Phạm vi, phương pháp và mức bằng chứng

Audit reconstruct các path:

```text
QuestionBankView/import
  → /api/question-bank
  → questionBankService lifecycle/version/blueprint
  → buildExamFromBank transaction
  → exam_sessions + exam_question_snapshots + variant_manifests
  → print T3 QR / Answer Sheet
  → identity lock + quality + OMR + 2-frame consensus + human Save
  → examStore / encrypted Dexie queue
  → POST /api/exams/:id/results
  → upsertExamResults transaction + server scoring + mutation receipt
  → POST /api/exams/:id/complete
  → finalization + assessment_entries + Grade projection + session completed
```

Mức bằng chứng dùng trong báo cáo:

- **Reproduced:** opt-in probe chạy vào SQLite/Dexie thật của test environment và assert hành vi hiện tại.
- **Measured:** benchmark hoặc concurrency test hiện hành đã chạy lại.
- **Source-verified:** đường gọi và điều kiện được đọc xuyên suốt nhưng chưa có runtime production evidence.
- **Unknown:** cần corpus, deployment state, thiết bị hoặc business decision không có trong repo.

Diagnostic probe: [assessment-question-bank-exam-omr-2026-09-06.probe.ts](../scripts/audits/assessment-question-bank-exam-omr-2026-09-06.probe.ts) và [Vitest config](../scripts/audits/assessment-question-bank-exam-omr-2026-09-06.vitest.config.ts). Probe cố ý assert **hành vi lỗi đang quan sát**, không nằm trong normal suite và không được hiểu là acceptance test cho behavior mong muốn.

## 3. Reconstruct pipeline và ownership thực tế

### 3.1 Question Bank: authoring, version và lifecycle

`QuestionBankView → /api/question-bank/questions|blueprints → questionBankService` là boundary online-only. Router chặn ngoài `admin|chunhiem|phuta`; service kiểm tenant cho branch và class. Tạo/import ghi item + version 1 + audit trong transaction; revise append version mới và đưa lifecycle về draft; admin sở hữu approve/activate/archive. Evidence: [questionBank.ts:25](../server/src/routes/questionBank.ts#L25), [questionBankService.ts:165](../server/src/services/questionBankService.ts#L165), [questionBankService.ts:189](../server/src/services/questionBankService.ts#L189), [questionBankService.ts:351](../server/src/services/questionBankService.ts#L351), [questionBankService.ts:376](../server/src/services/questionBankService.ts#L376).

`question_bank_items.current_version` trỏ nội dung hiện hành; `question_bank_versions` có unique `(parish, question, version)` và FK composite tenant. Exam không đọc lại bank row khi render/chấm. Evidence: [schema.ts:789](../server/src/db/schema.ts#L789), [schema.ts:821](../server/src/db/schema.ts#L821).

### 3.2 Build: materialization và transaction boundary

`POST /api/question-bank/exams/build → buildExamFromBank` mở một DB transaction bao trọn:

- class tồn tại và assignment hiện hành;
- chỉ lấy question status `active` + đúng `currentVersion`;
- blueprint active, deterministic seed, shortage fail-all;
- MC xếp trước essay để giữ numbering OMR;
- tạo session, manifest/answer variants, exact source snapshots và audit.

Evidence: [questionBankService.ts:481](../server/src/services/questionBankService.ts#L481), đặc biệt transaction/access tại 485–495, selection tại 500–554, materialization tại 556–582. `exam_question_snapshots` giữ question/version/content/points và FK restrict về version: [schema.ts:990](../server/src/db/schema.ts#L990).

Boundary này ngăn sửa Question Bank làm thay đổi đề lịch sử. Điểm yếu retry nằm ở D4, không làm mất atomicity của một lần build.

### 3.3 Variant manifest, đề in và QR identity

`generateExamVariantManifest` sắp thứ tự deterministic theo seed, giữ A identity, đảo question/options cho B–H, phát answer key theo vị trí mới, lưu `sourceHash` và `contentHash`. Option trùng nội dung hoặc phụ thuộc vị trí “tất cả/không có đáp án” bị reject. Evidence: [examVariantManifest.ts:46](../server/src/services/examVariantManifest.ts#L46), [examVariantManifest.ts:66](../server/src/services/examVariantManifest.ts#L66), [examVariantManifest.ts:77](../server/src/services/examVariantManifest.ts#L77).

T3 QR bind `sessionId + studentId + templateMode + questionCount + examVersion` bằng checksum FNV-1a 16-bit; parser và server decode tính lại. Checksum này là accidental-corruption detection, không phải chữ ký bảo mật. Client identity lock so khớp toàn bộ tuple và fail wrong-session. Evidence: [qr.ts:39](../src/lib/qr.ts#L39), [qr.ts:64](../src/lib/qr.ts#L64), [examScanIdentity.ts:45](../src/lib/examScanIdentity.ts#L45), [exams.ts:543](../server/src/routes/exams.ts#L543).

T2/TE/legacy không có version và map A để tương thích. Với session manifest, UI chỉ in non-A từ exact manifest; route PATCH key/variants chặn khi manifest tồn tại. Evidence: [exams.ts:434](../server/src/routes/exams.ts#L434), [exams.ts:482](../server/src/routes/exams.ts#L482).

### 3.4 Scan/OMR proposal boundary

Live scan:

1. decode và lock identity;
2. reject sai session/template/count/version;
3. quality bad chặn trước detector;
4. detector marker/paper/geometry/fill/confidence;
5. `decideScanAcceptance` reject hoặc route review;
6. auto path cần 2 frame cùng fingerprint;
7. human Save cuối cùng.

Evidence: [ExamScanModal.tsx:308](../src/components/exam/ExamScanModal.tsx#L308), [ExamScanModal.tsx:352](../src/components/exam/ExamScanModal.tsx#L352), [ExamScanModal.tsx:396](../src/components/exam/ExamScanModal.tsx#L396), [ExamScanModal.tsx:422](../src/components/exam/ExamScanModal.tsx#L422), [scanAcceptancePolicy.ts:17](../src/lib/scanAcceptancePolicy.ts#L17), [omr.ts:729](../src/lib/omr.ts#L729).

Batch file scan kiểm session, allowed student set, count, version/key, OMR và quality; duplicate student trong cùng batch bị route review; chỉ `accepted` được đưa vào save payload. Evidence: [examBatchScan.ts:35](../src/lib/examBatchScan.ts#L35), [ExamBatchScanModal.tsx:56](../src/components/exam/ExamBatchScanModal.tsx#L56), [ExamBatchScanModal.tsx:78](../src/components/exam/ExamBatchScanModal.tsx#L78), [ExamBatchScanModal.tsx:140](../src/components/exam/ExamBatchScanModal.tsx#L140).

### 3.5 Result authority, idempotency và persistence

`POST /api/exams/:id/results → upsertExamResults` là write authority:

- re-check actor/role/class trong transaction;
- session phải draft;
- mỗi student phải active và thuộc đúng session class;
- MC/OMR answers được server chấm lại theo version key;
- mutation receipt `(parish,user,clientMutationId)` commit cùng result; cùng ID+cùng hash trả duplicate, khác hash trả 409;
- result unique `(parish,session,student)`.

Evidence: [exams.ts:237](../server/src/routes/exams.ts#L237), [examService.ts:546](../server/src/services/examService.ts#L546), [examService.ts:562](../server/src/services/examService.ts#L562), [examService.ts:578](../server/src/services/examService.ts#L578), [examService.ts:592](../server/src/services/examService.ts#L592), [examService.ts:626](../server/src/services/examService.ts#L626), [schema.ts:937](../server/src/db/schema.ts#L937), [schema.ts:968](../server/src/db/schema.ts#L968).

Client API tự gắn mutation ID khi caller chưa có. Continuous/offline queue mã hóa payload, scope tenant+user, một op per `session::result::student`; complete được enqueue sau result items. Evidence: [api/exams.ts:27](../src/lib/api/exams.ts#L27), [syncService.ts:116](../src/lib/syncService.ts#L116), [syncStore.ts:215](../src/stores/syncStore.ts#L215), [examStore.ts:338](../src/stores/examStore.ts#L338).

### 3.6 Finalization và Grade handoff

`POST /api/exams/:id/complete → finalizeExamSession` chạy một transaction: dynamic writer/class check; semester lock; current results; old finalization reconciliation; assessment ledger; protected manual/override conflict; `upsertGrade(..., tx)`; receipt items; session completed và audit. Completed replay trả receipt cũ, không ghi lần hai. Evidence: [examService.ts:937](../server/src/services/examService.ts#L937), [examService.ts:958](../server/src/services/examService.ts#L958), [examService.ts:992](../server/src/services/examService.ts#L992), [examService.ts:1014](../server/src/services/examService.ts#L1014), [examService.ts:1034](../server/src/services/examService.ts#L1034), [examService.ts:1134](../server/src/services/examService.ts#L1134), [examService.ts:1157](../server/src/services/examService.ts#L1157).

Client `completeAndFinalize` không ghi Grade; online chỉ project receipt và pull Grade, offline/pending chỉ tạo preview rồi queue complete barrier. Evidence: [examStore.ts:429](../src/stores/examStore.ts#L429).

## 4. Verified Strengths

### S1 — Versioned Question Bank và immutable exam materialization

Create/import/revise/lifecycle có ownership rõ; current content được snapshot vào session và `exam_question_snapshots`. Test hiện hành chứng minh revision v2 không đổi snapshot v1 và blueprint shortage không tạo partial session: [questionBank.test.ts:219](../server/src/__tests__/questionBank.test.ts#L219).

### S2 — Manifest A–H deterministic và unsafe shuffle fail-closed

Manifest giữ source order/IDs, option order, answer key và hash từng variant. Generator từ chối cấu trúc không thể đảo an toàn. `examVariantManifest.test.ts` chạy lại PASS trong focused suite.

### S3 — Student/session/class authority được kiểm lại ở server

QR/client lock là UX/safety layer; result persistence không tin student ID từ QR một mình. Server tải session cùng tenant, re-check writer/class và query tất cả student `(parish,id,classId,active)` trước write. Vì vậy barcode decode thiếu membership lookup riêng không tạo đường persist sai học sinh.

### S4 — Server-authoritative scoring và retry idempotency ở result item

MC/mixed scan score được recompute từ answers/key/version; client score drift trả `adjustments`. Mutation receipt cùng transaction xử lý response-loss retry mà không audit/write lần hai. `examService.test.ts` và focused suite xác nhận A/B scoring, invalid answers, review status, image metadata và duplicate mutation behavior.

### S5 — OMR client proposal fail-closed trước human Save

Marker/paper/geometry/quality/confidence gates, review routing, all-blank rejection và 2-frame consensus đều có code/test. `scanAcceptancePolicy` đặt quality bad trước review; batch/live dùng cùng policy. Đây là verified software behavior, không phải field-accuracy claim.

### S6 — Exam là single writer sang Grade

Không còn client Grade write sau complete. Finalization ghi ledger + grade projection + receipt + session state trong một DB transaction và bảo vệ manual/override bằng explicit conflict item. Focused scan-to-grade/lifecycle tests PASS.

### S7 — Reopen/re-finalize semantics được mô tả và test nhất quán

Reopen chỉ mở session; last-finalized Grade vẫn giữ cho tới lần finalize tiếp. Re-finalize dọn orphan daily assessment entry nhưng không tự xóa last-finalized score của học sinh bị bỏ khỏi session. Đây là policy có chủ đích tại [BUSINESS_RULES.md:431](BUSINESS_RULES.md#L431), [FRONTEND_API_CONTRACT.md:597](FRONTEND_API_CONTRACT.md#L597) và [examLifecycleAudit.test.ts:114](../server/src/__tests__/examLifecycleAudit.test.ts#L114), không phải defect chỉ vì khác rollback toàn phần.

## 5. Verified Defects

### D1 — P0 — Mixed B–H mất variant/provenance khi nhập tự luận sau OMR

**Path:** `ExamScanModal Save B → POST results → examResults(B,answers,metadata)`; sau đó `ExamSessionView.handleSaveScore(essay) → POST results` không gửi `examVersion/answers/scanMetadata` → `upsertExamResults` default `examVersion=A`, lấy answers cũ nhưng chấm bằng key A → overwrite source/version/metadata.

**Evidence:** UI payload tại [ExamSessionView.tsx:510](../src/components/exam/ExamSessionView.tsx#L510). Service default version trước khi đọc row và chỉ select `answers,essayScore`: [examService.ts:651](../server/src/services/examService.ts#L651), [examService.ts:658](../server/src/services/examService.ts#L658). Mixed merge dùng answers cũ với version mới mặc định A tại 681–690; upsert ghi `source`, `examVersion`, `scanMetadata` mới tại 721–746.

**Reproduced:** probe tạo key A=`A,A`, key B=`B,B`; lưu OMR B đúng 2 điểm rồi nhập essay 5. Current row thành `score=5`, `examVersion=A`, `source=quick_entry`, `scanMetadata=NULL`; invariant đúng phải là tổng 7, giữ B và scan provenance.

**Impact:** silent wrong score có thể đi qua finalization sang Grade; receipt không biết MC đã bị đổi key. Điều kiện hẹp nhưng thực tế: exam type mixed, mã B–H, OMR trước, essay nhập sau.

**Root fix:** tách “field có mặt trong command” khỏi default; với essay-only merge phải dùng `existingRow.examVersion/source/scanMetadata/answers` cho thành phần MC. Tối thiểu select và preserve các field đó. Thiết kế bền hơn là provenance riêng cho `mcComponent` và `essayComponent`, không ép một `source` mô tả hai nguồn.

### D2 — P1 — Concurrent/stale rescan là unconditional last-writer-wins

**Path:** two devices/stale tabs hoặc hai save độc lập → unique result key cùng `(parish,session,student)` → mỗi request vượt class/session checks → `onConflictDoUpdate` không `expectedVersion`/attempt precondition → request commit sau ghi đè.

**Evidence:** [examService.ts:721](../server/src/services/examService.ts#L721). `attemptFingerprint` chỉ vào request hash khi có mutation ID, không persist/compare với current result. Client conflict memory `seenAttemptByStudentRef` chỉ local process/device: [ExamScanModal.tsx:168](../src/components/exam/ExamScanModal.tsx#L168), [ExamScanModal.tsx:457](../src/components/exam/ExamScanModal.tsx#L457).

**Measured:** [examResultUpsertRace.test.ts:133](../server/src/__tests__/examResultUpsertRace.test.ts#L133) gửi đồng thời điểm 4,5,6,7,8; cả năm fulfilled, một create + bốn update, final row là bất kỳ giá trị nào trong tập. Test chứng minh structural convergence thành một row, nhưng đồng thời chứng minh không có semantic conflict protection.

**Impact:** scan đúng có thể bị save từ stale tab/device ghi đè mà server không yêu cầu xác nhận; finalization dùng winner theo lịch commit. `clientMutationId` chỉ chống retry của cùng command, không hòa giải hai command hợp lệ khác nhau.

**Nuance:** Business Rule cho phép người chấm chủ ý quét/nhập lại. Defect không phải “cho overwrite”, mà là server không phân biệt overwrite đã xác nhận với lost update.

**Root fix:** thêm `resultVersion`/ETag và `expectedResultVersion`; create dùng expected absent, update stale trả 409 với current result. Explicit overwrite phải gửi version hiện hành + confirmation intent. Offline queue giữ precondition tại thời điểm capture và route conflict khi stale.

### D3 — P1 — Same-student queue replacement để lại ledger pending không thể acknowledge

**Path:** continuous `queueScores` hai lần trước sync → `syncSaveExamResults` dùng cùng entity key `session::result::student` → `syncStore.addOp` thay payload op cũ và trả lại queueOpId cũ → `examStore` thêm cả hai clientMutationId vào ledger → chỉ mutation mới còn trong queue/được server ack → complete thấy mutation cũ vẫn pending.

**Evidence:** key/durable enqueue tại [syncService.ts:116](../src/lib/syncService.ts#L116); dedupe replace tại [syncStore.ts:215](../src/stores/syncStore.ts#L215); ledger append tại [examStore.ts:338](../src/stores/examStore.ts#L338); complete gate kiểm mọi pending tại [examStore.ts:435](../src/stores/examStore.ts#L435). Existing test [sync-engine.test.ts:121](../src/__tests__/sync-engine.test.ts#L121) chỉ assert queue còn explicit mutation cuối, không assert ledger cũ được supersede.

**Reproduced:** probe ghi hai mutation khác ID cho cùng student; hai calls trả cùng `queueOpId`, Dexie chỉ còn một op chứa mutation mới, nhưng ledger có hai row `pending`.

**Impact:** latest score vẫn durable, nhưng UI/complete barrier có thể mắc ở trạng thái “chờ đồng bộ” vô hạn hoặc luôn queue complete thay vì online finalize/receipt.

**Root fix:** queue replacement phải là event có contract: trả `supersededClientMutationId`, atomically mark ledger cũ `superseded`, và complete chỉ chờ mutation có queue op sống. Không gắn nhãn cũ là `synced`. Thêm reload/persist regression.

### D4 — P2 — Question Bank build retry không idempotent

**Path:** `QuestionBankView → POST /api/question-bank/exams/build → buildExamFromBank`; response mất sau commit → user/client retry cùng payload → service sinh seed/session ID mới nếu không có seed, luôn sinh session ID mới, đặt key `question-bank:${sessionId}` → unique index không dedupe request.

**Evidence:** build input không có idempotency key tại [questionBank.ts:167](../server/src/routes/questionBank.ts#L167) và [api/questionBank.ts:44](../src/lib/api/questionBank.ts#L44). Service seed/session/key tại [questionBankService.ts:496](../server/src/services/questionBankService.ts#L496), [questionBankService.ts:566](../server/src/services/questionBankService.ts#L566), [questionBankService.ts:574](../server/src/services/questionBankService.ts#L574). Schema có useful unique key nhưng current key tự-unique: [schema.ts:916](../server/src/db/schema.ts#L916).

**Reproduced:** probe gọi service hai lần với cùng payload và cùng explicit seed; nhận hai session IDs, hai snapshots/manifest sets và hai distinct idempotency keys.

**Impact:** response-loss/retry tạo duplicate draft exams khó phân biệt, tăng nguy cơ in/quét/finalize nhầm session. Việc cố ý tạo re-exam vẫn hợp lệ; retry cần được phân biệt bằng stable command key, không bằng nội dung nghiệp vụ.

**Root fix:** client tạo stable `buildCommandId` trước request và reuse qua retry; server lưu key + request hash, same key/same hash trả session cũ, same key/different hash trả 409. Không thêm unique theo subject/class vì re-exam là policy hợp lệ.

### D5 — P2 — OMR/manual-correction provenance là client-attested và không đủ tái dựng

**Path:** scan UI tự tạo `source`, `detectionStatus`, correction indexes và fingerprint → results route nhận optional metadata → `sanitizeScanMetadata` chỉ reject non-accepted khi field tồn tại → result row lưu current answers/aggregate metadata → subsequent upsert thay row; re-finalize xóa receipt items cũ.

**Evidence:** client metadata chỉ có `correctedQuestions`, không detected-before/final-after: [ExamScanModal.tsx:882](../src/components/exam/ExamScanModal.tsx#L882). `source`, `scanMetadata`, `attemptFingerprint`, `capturedAt` đều do client gửi: [exams.ts:237](../server/src/routes/exams.ts#L237). Sanitizer tại [examService.ts:202](../server/src/services/examService.ts#L202) chấp nhận missing `detectionStatus`. Schema result không có fingerprint/capturedAt/savedBy: [schema.ts:937](../server/src/db/schema.ts#L937). Mutation receipt chỉ hash+response: [schema.ts:968](../server/src/db/schema.ts#L968). Re-finalize xóa prior receipt/items: [examService.ts:983](../server/src/services/examService.ts#L983).

**Reproduced:** probe gửi `source='omr'`, valid answers nhưng không `scanMetadata`; server lưu score 10, source OMR, metadata NULL. Server scoring vẫn đúng theo answers; điều không chứng minh được là answers thực sự đến từ accepted detector hay correction nào đã xảy ra.

**Impact:** không thể tái dựng detected answer ban đầu, thay đổi thủ công, capture time, fingerprint hoặc lịch sử attempt/finalization trước; audit trail chỉ biết actor/time của aggregate save/finalize. Đây là provenance defect, không phải bằng chứng score hiện hành luôn sai.

**Root fix incremental:** bắt buộc/validate structured scan provenance cho OMR/QR sources; persist server `savedBy/savedAt`, client `capturedAt`, fingerprint, detector version, detected answers hash và corrected final answers/diff. Giữ image local opt-in/TTL; không cần upload ảnh để có provenance có cấu trúc. Nếu cần lịch sử pháp lý, thêm append-only attempt/revision record; nếu không, tài liệu phải thu hẹp claim từ “provenance đầy đủ” thành “current result + aggregate diagnostics”.

## 6. Intentional Complexity

### I1 — Một current result per student và explicit rescan

Unique row + overwrite là business policy để sửa bài draft, không tự nó là defect. Complexity cần giữ là mutation idempotency, conflict confirmation và version precondition; D2 xuất hiện vì current server chỉ có hai phần đầu ở client/receipt, thiếu phần semantic concurrency.

### I2 — Partial Grade conflicts khi finalize

Manual/override sources không bị exam ghi đè; receipt ghi từng student `committed|conflict`, session vẫn completed. Đây là lựa chọn an toàn và observable hơn rollback toàn batch chỉ vì một manual conflict. Operator phải xử lý conflict rõ ràng.

### I3 — Reopen giữ last-finalized Grade

Reopen không rollback Grade ngay là policy nhằm tránh xóa điểm đã công bố trong khoảng chỉnh sửa. Re-finalize mới reconcile ledger. Cần UI hiển thị rõ “Grade vẫn là bản finalize trước”, nhưng không đổi semantics khi chưa có business decision mới.

### I4 — OMR supervised, on-device và ảnh review local-only

Human Save, review routing, local AES-GCM snapshot TTL 24h và không upload ảnh là trade-off đúng giữa reliability/privacy. Không đề xuất vision server hoặc lưu ảnh bắt buộc để sửa D5.

### I5 — Legacy T2/TE/QR map A

Đây là compatibility path có chủ đích. Với B–H, T3 là contract đúng. Không bỏ legacy nếu chưa inventory phiếu đang dùng; thay vào đó fail-closed khi session/operation rõ ràng yêu cầu variant không-A.

### I6 — Không đưa Question Bank vào offline sync

Authoring/build server-required tránh parallel authority và snapshot từ bank stale. Đây là intentional boundary hợp lý; không thêm offline QB chỉ để “đồng nhất” với result queue.

## 7. Test & Benchmark Gaps

### G1 — Thiếu mixed B–H two-phase permutation matrix

Existing mixed tests chỉ dùng A. Cần cover OMR→essay và essay→OMR cho A–H, cả partial/blank answers, metadata/source preservation và server adjustment. Đây là gap đã che D1.

### G2 — Race test đang chứng minh convergence, không chứng minh correctness

`examResultUpsertRace` coi tất cả concurrent writes success là PASS. Sau OCC fix, test phải assert một winner và stale commands 409/conflict, rồi retry bằng explicit latest version.

### G3 — Thiếu retry test cho build command

Question Bank tests kiểm transaction, snapshot và shortage nhưng không mô phỏng commit-success/response-loss/retry. Cần same key/same hash và same key/different hash.

### G4 — Thiếu queue-ledger replacement/reload acknowledgement test

Test hiện hành chỉ nhìn Dexie queue payload cuối. Cần assert mutation ledger supersede, complete barrier, reload persistence và ack out-of-order.

### G5 — Manifest immutability còn phụ thuộc entry route

Routes chặn PATCH khi `variantManifests` tồn tại, nhưng service `updateAnswerKeyAndRescore`/`updateAnswerVariantsAndRescore` chỉ kiểm draft và không tự guard manifest: [examService.ts:1219](../server/src/services/examService.ts#L1219), [examService.ts:1399](../server/src/services/examService.ts#L1399). Current production callers tìm thấy đều qua guarded routes, nên chưa có alternate-path defect. Nên chuyển invariant vào service transaction và test direct caller. Scoring cũng dùng `answerVariants`, không recompute/verify manifest content hash mỗi read; cần consistency assertion/migration health check, không cần một abstraction mới.

### G6 — Không có production-qualified OMR corpus/evidence

`tests/fixtures/omr-camera` chỉ có README; không có image observations, sequence manifests hoặc target files. Default gate để required profile arrays rỗng và fail-closed: [omrBenchmarkGate.ts:39](../src/lib/omrBenchmarkGate.ts#L39), [omrBenchmarkGate.ts:186](../src/lib/omrBenchmarkGate.ts#L186). Unit/synthetic suite chứng minh policy logic, không chứng minh camera field accuracy.

### G7 — Chưa có concurrent finalize/result interleaving E2E

Result path dùng writer-first serialization và completed guard; finalize transaction atomic. Focused tests cover lifecycle and idempotent replay, nhưng audit không tìm thấy deterministic test cho result-save commit cạnh finalize, two finalize requests, và complete barrier sau app reload. Đây là coverage gap; source hiện chưa đủ để report defect.

## 8. Unknown / insufficient evidence

### U1 — Accuracy và false accept trên ảnh thật

Không biết answer accuracy, exact-sheet accuracy, review routing và false accept trên giấy/bút/ánh sáng/camera thực tế. Target 99.5%/98%/0 false accept là policy gate, không phải số đo hiện tại.

### U2 — Target-device end-to-end latency và sustained throughput

Không có run 30/100 phiếu đúng release/device/browser/profile; không biết thermal drift, memory slope, papers/minute, reload recovery hoặc responsiveness trên thiết bị giáo xứ.

### U3 — Production feature flags và sheet population

Không xác minh production `VITE_CONTINUOUS_SCAN_V2`, pilot allowlist/circuit state, tỷ lệ T3 so với legacy T2/TE, hay số mixed B–H đã chấm.

### U4 — Tần suất thực tế của retry/race/queue replacement

Defects D2–D4 reproducible nhưng audit không có production telemetry để định lượng occurrence. Severity dựa vào consequence/invariant, không dựa vào số lần giả định.

### U5 — Mức retention/provenance nghiệp vụ cần thiết

Repo khẳng định provenance rõ và có audit, nhưng không có policy retention nói phải giữ full attempt history/detected-before-after bao lâu. D5 xác nhận claim hiện tại không đủ để tái dựng; mức schema/history cuối cùng cần product owner quyết định.

### U6 — Printer/physical geometry và manifest-to-paper fidelity

DOM/print tests kiểm geometry phần mềm, nhưng không có bằng chứng máy in, scaling driver, camera crop và giấy thật của deployment hiện tại luôn giữ marker/QR/variant fidelity.

## 9. Documentation drift

- [02_ARCHITECTURE.md:76](02_ARCHITECTURE.md#L76) và [FRONTEND_API_CONTRACT.md:401](FRONTEND_API_CONTRACT.md#L401) mô tả ledger item và complete barrier như đã hội tụ; D3 chứng minh same-student replacement làm ledger lệch queue.
- [FRONTEND_API_CONTRACT.md:442](FRONTEND_API_CONTRACT.md#L442) nói mixed merge hai pha “không mất dữ liệu”; D1 chứng minh B–H mất version/provenance và chấm sai.
- [ADR-096:3277](ADR_ARCHITECTURE_DECISION_RECORDS.md#L3277) nói existing Exam/offline/finalization pipeline “unchanged”; điều này đúng về dependency direction nhưng không chứng minh pipeline đó correct ở mọi variant/retry path.
- Snapshot test counts/9-of-9 decision scores trong ADR là historical acceptance evidence, không phải current invariant proof. Current focused suite vẫn xanh đồng thời bốn defect probes cũng xanh, vì hai nhóm test đang hỏi hai câu khác nhau.

Không sửa SSOT trong audit này vì product behavior chưa được remediation. Sau fix, update docs theo behavior đã được test, không chỉ đánh dấu finding “resolved”.

## 10. Verification thực sự đã chạy

### Diagnostic defect probes

Command:

`npm run test -- --config scripts/audits/assessment-question-bank-exam-omr-2026-09-06.vitest.config.ts --fileParallelism=false`

Kết quả: **1 file / 4 tests PASS**. Bốn tests tái lập D1, D3, D4 và nhánh concrete của D5. Probe excluded khỏi normal suite và dùng unique tenant fixtures + cleanup.

### Focused regression hiện hữu

16 files: Question Bank, manifest, Exam service/mixed/lifecycle/race, scan-to-grade, identity, consensus, OMR detector/hardening/acceptance/gates/sequence và sync engine.

Kết quả: **16/16 files, 215/215 tests PASS**, serialized.

Điều này xác nhận strengths và đồng thời cho thấy existing suite chưa encode bốn invariant bị probe bắt. Không có test nào bị sửa/skip để đạt xanh.

### Synthetic OMR benchmark

`npm run benchmark:omr` PASS trên `dev-host-win32-x64`, Node 24.14.1. Các OMR case đủ 100 iterations:

- integrated 800×1130: p95 **9.30 ms**;
- integrated 960×1356: p95 **11.47 ms**;
- integrated 1280×1808: p95 **23.64 ms**;
- full-page 960×1356: p95 **11.27 ms**;
- full-page 1280×1808: p95 **37.51 ms**;
- auto→full-page fallback 960×1356: p95 **79.18 ms**;
- auto no-marker rejection 960×1356: p95 **25.39 ms**.

QR exhaustive negative diagnostics dùng n=3 nên chỉ có bounded max, không có p95; max 326.34 ms (960) và 699.91 ms (1280). Không trộn các số này với OMR p95 target.

Benchmark tự ghi caveat synthetic/dev-host; không phải field/device qualification. `benchmark:omr:sequence` không chạy vì repo không có manifest/targets thật để đánh giá—chạy không input chỉ kiểm CLI usage, không tạo evidence.

### Không chạy

- Không chạy full repository suite lần nữa: phạm vi audit không sửa product code; focused 215 tests + 4 probes trực tiếp hơn. Full pre-audit release evidence không được dùng thay current targeted evidence.
- Không chạy browser E2E, camera/printer/physical device, production DB/log/telemetry hoặc external services.

## 11. Risk-prioritized remediation roadmap

### Phase 0 — Khóa silent wrong score trước release tiếp theo

1. Sửa D1 bằng component-aware merge; giữ existing MC variant/answers/metadata khi command chỉ cập nhật essay. Thêm A–H two-phase matrix và regression từ probe đổi sang expected behavior.
2. Thêm invariant check trước finalize: với mixed result có answers từ B–H, key/version phải tồn tại và score recompute khớp current component data. Đây là guard phát hiện, không thay root fix.
3. Sau fix chạy focused Exam/mixed/manifest/scan-to-grade và một E2E tạo mixed B, scan/save essay/finalize rồi đọc Grade authoritative.

### Phase 1 — Khóa concurrency và durable barrier

1. Thêm OCC `resultVersion` + `expectedResultVersion`; stale update trả itemized 409/conflict. Explicit rescan overwrite phải dùng current version và confirmation intent.
2. Sửa D3 bằng trạng thái `superseded` hoặc replacement receipt atomically nối queue↔ledger. Complete chỉ dựa queue/live mutation truth, không dựa stale persisted ledger.
3. Test two devices/tabs, offline replacement, reload, ack out-of-order, save-vs-complete và complete replay. Không bỏ server mutation receipt hiện có.

### Phase 2 — Idempotent build và provenance tối thiểu đủ dùng

1. Thêm `buildCommandId + requestHash` cho QB build; reuse key qua retry. Không chặn deliberate duplicate exam bằng business-field unique constraint.
2. Với source OMR/QR, server yêu cầu structured metadata `detectionStatus='accepted'`, engine/template/count/version consistency; unknown/malformed fail 400.
3. Persist server actor/time, client capture time, fingerprint và correction diff/hash. Chọn retention trước khi thêm append-only attempt table; không upload image mặc định.

### Phase 3 — Đưa invariant xuống đúng ownership boundary

1. Chuyển manifest lock vào service transaction cho cả answer-key và variants; thêm direct-service regression.
2. Thêm consistency health check: `manifest variant key == answerVariants`, source/content hashes parseable và snapshots đủ vị trí. Fail readiness hoặc quarantine session sai thay vì chấm đoán.
3. Đồng bộ `02_ARCHITECTURE`, API contract, Business Rules/ADR chỉ sau khi behavior mới có evidence.

### Phase 4 — Field qualification, không mở rộng architecture

1. Thu corpus ≥400 ảnh đã khử định danh theo exact production profile và run sequence 30/100 với immutable release ID/targets.
2. Chỉ bật broader continuous/unattended behavior nếu accuracy/routing/false-accept/latency/reload/memory gates đạt. Nếu không đạt, giữ supervised human-confirm.
3. Không chọn worker, adaptive threshold hoặc server vision trước khi trace thiết bị cho thấy bottleneck/root cause cụ thể.

## 12. Những đề xuất không có evidence để làm lúc này

- Không rewrite Exam/Question Bank hoặc tách microservice.
- Không thêm event bus chỉ để xử lý Grade handoff; transaction monolith hiện đúng ownership.
- Không thay SQLite hay Dexie vì D1–D5 là command/invariant/provenance contract, không phải giới hạn engine.
- Không gom mọi write thành generic repository; fix cần nằm ở semantic boundary cụ thể.
- Không bật unattended auto-save từ benchmark synthetic.
- Không upload/lưu vĩnh viễn ảnh bài thi để “giải quyết provenance” khi structured audit data đủ và privacy cost chưa được chấp thuận.

## 13. Final verdict

**Kiến trúc assessment hiện tại đáng giữ và tiến hóa incremental, nhưng chưa đủ an toàn để tuyên bố mọi kết quả luôn đúng mã đề và chống stale/concurrent mutation.** Question Bank snapshot, manifest generation, tenant/class checks, server scoring và single-writer Grade finalization là verified strengths. Root-risk tập trung ở semantic merge/concurrency và sự không khớp giữa queue/provenance state—không phải ở việc thiếu microservice hay thiếu DDD abstraction.

Thứ tự nên làm: **D1 → D2/D3 → D4/D5 → field qualification**. Sau Phase 0–2, chạy lại audit probes dưới dạng regression mong muốn, focused suite, rồi full CI-equivalent một lần trước release.

## 14. Remediation follow-up — trạng thái implementation sau audit

### 14.1 Finding disposition

- **D1 — REMEDIATED / VERIFIED:** essay-only update của mixed result đọc current row trong writer-first transaction và giữ exact `answers`, mã đề A–H, scan source/metadata, fingerprint và capture time. Regression mã B chấm TN 2 điểm rồi nhập TL 5 điểm giữ B/provenance và trả tổng 7.
- **D2 — REMEDIATED / VERIFIED:** `exam_results.result_version` + `expectedResultVersion` tạo OCC boundary. Existing update thiếu/sai version trả typed 409; SQL compare-and-swap chỉ cho một writer thắng. Race năm writer cùng expected version xác nhận đúng một update commit và bốn conflict.
- **D3 — REMEDIATED / VERIFIED:** mutation bị compact thật sự dùng chung queue ID thì ledger cũ chuyển `superseded`, không còn pending vĩnh viễn. Follow-up còn phát hiện và đóng race sâu hơn: op được claim nguyên tử sang `processing` trước network, compaction không sửa payload in-flight, op mới nhận ID riêng, expired lease được recover về retrying. Hai ledger entry riêng không bị supersede nhầm; server OCC giải quyết thứ tự đến.
- **D4 — REMEDIATED / VERIFIED:** Question Bank build bắt buộc `buildCommandId`, derive seed ổn định khi caller không truyền, lưu canonical request hash trên session. Retry cùng command/hash trả đúng session cũ; cùng command khác payload trả 409. Client giữ command ID qua retry và gửi `Idempotency-Key`.
- **D5 concrete — REMEDIATED / VERIFIED:** server từ chối `omr|qr_scan` thiếu metadata accepted; MC/mixed còn bắt buộc metadata khớp version/count. UI lưu detected answers, final answers và correction diff. Result lưu fingerprint/capture time/server actor/time/version. **Full append-only attempt/reopen/finalization history vẫn UNKNOWN/NOT IMPLEMENTED** vì chưa có retention/access/purge requirement; hệ thống chỉ claim provenance của current accepted result.
- **G5 manifest ownership — REMEDIATED / VERIFIED:** lock được enforce trong cả hai service transaction sửa answer key/variants; direct service calls đã có regression, không còn phụ thuộc route guard.

### 14.2 Schema, compatibility và recovery

Migrations `20260906-170..175` thêm `build_request_hash`, `result_version`, `attempt_fingerprint`, `captured_at`, `saved_by`, `saved_at`; mỗi `ALTER TABLE` nằm trong migration riêng để SQLite không rollback cả nhóm theo duplicate-column compatibility path. Schema readiness yêu cầu đủ marker/column trước startup.

Đây là fail-closed contract change có chủ đích: client cũ update result hiện hữu không có version nhận 409; client cũ build Question Bank thiếu command ID nhận 400. Frontend/backend phải rollout cùng release. Nếu browser/process dừng sau claim queue, lease processing hết hạn được chuyển retrying; mutation receipt, build command identity và OCC làm replay an toàn. Không có auto-overwrite sau conflict.

### 14.3 Verification thực sự chạy sau remediation

- Targeted assessment/OCC/QB/queue/provenance: **10/10 files, 147/147 tests PASS**.
- Diagnostic probe đã đảo từ tái lập defect sang khóa behavior đúng: **1/1 file, 4/4 tests PASS**.
- Queue-flow focused bổ sung: **3/3 files, 70/70 tests PASS**.
- Lint zero-warning; architecture inventory **31 routes / 6 repositories / 48 services / 12 domain files / 57 tables**; design-system guard **0/127**.
- Client/server TypeScript và production frontend/PWA/server build PASS: **2.814 modules**, PWA **238 precache entries**.
- Full serialized Vitest coverage: **320/320 files, 2.225/2.225 tests PASS** trong **1.118,56 giây**. Coverage: Statements **69,92%**, Branches **59,22%**, Functions **62,41%**, Lines **72,56%**.
- `git diff --check` PASS.

Lần build/test đầu trong filesystem sandbox gặp Windows `spawn EPERM` và native Tailwind binary read error; cùng command ngoài sandbox pass. Đây được phân loại là lỗi execution environment, không phải product failure.

### 14.4 Residual risk và verdict hiện hành

Không chạy browser E2E mixed-B scan → essay → finalize → Grade trong follow-up này; correctness path đã được integration/service tests bao phủ nhưng camera/browser workflow end-to-end vẫn là test gap. Không có production DB/log/traffic, ảnh corpus thật, printer/device run hoặc field sequence manifest, nên U1–U4/U6 vẫn giữ nguyên. U5 được thu hẹp: current-result provenance đã đủ tái dựng giá trị accepted hiện hành, còn full historical/legal retention chưa có authority.

**Current implementation verdict:** D1–D4 và phần concrete, có bằng chứng của D5 đã được đóng theo hướng incremental trong modular monolith. Assessment vẫn không được tuyên bố field-qualified hoặc có append-only legal history. Không có evidence cần rewrite, microservice, event bus, server vision hay upload ảnh mặc định.
