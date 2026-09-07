# Assessment — Question Bank, Exam & OMR audit (re-verify)

Ngày: 2026-09-06. Snapshot audit so với HEAD `949ba9ed61b8a766698ffadb8a2ec7f8d3890912` (`feat: single-parish deployment hardening + RBAC/auth audit batch, services, tests and docs`).

Working tree **không sạch** tại thời điểm audit: 12 file đã sửa cục bộ (WIP remediation Phase 0/1/2 của audit 2026-09-06 cũ), chưa commit. Audit này:

1. Tái lập pipeline **từ HEAD sạch** bằng cách đọc lại code + chạy lại probe `scripts/audits/assessment-question-bank-exam-omr-2026-09-06.probe.ts` ở cả hai trạng thái (HEAD và HEAD+WIP).
2. Đối chiếu với `docs/assessment-question-bank-exam-omr-audit-2026-09-06.md` (audit trước) — **không mặc định cũ vẫn đúng**, mà verify lại từng finding bằng probe/test/build.
3. Tách bạch:
   - finding thuộc HEAD sạch (giá trị cho release tag);
   - finding thuộc WIP chưa commit (rủi ro tức thời nếu dev merge mà không test đầy đủ).
4. Mọi con số định lượng dùng benchmark/test evidence (không suy đoán từ source) — với OMR đó là `benchmark:omr` + đoạn policy/detector source-verified.

Mức bằng chứng:

| Tag          | Nghĩa                                                                          |
|--------------|--------------------------------------------------------------------------------|
| REPRODUCED   | Probe/test chạy lại ở HEAD sạch và quan sát thấy hành vi lỗi được mô tả.        |
| MEASURED     | Benchmark/concurrency test chạy lại, có số so sánh điều kiện ngang.            |
| SOURCE       | Đường gọi/điều kiện đọc xuyên suốt code path, chưa có runtime evidence.        |
| UNKNOWN      | Cần corpus, deployment state, thiết bị, telemetry production.                 |

---

## 1. Kết luận điều hành

Pipeline Question Bank → Exam → Variant manifest → QR/OMR → Result → Grade handoff có nền tảng kiến trúc đúng cho modular monolith: versioned bank, materialization trong transaction với snapshot + manifest, server-authoritative scoring, idempotency qua mutation receipt, single writer Exam → Grade, protected manual/override conflict.

Tuy nhiên tại HEAD sạch, **5 defect đã được audit cũ tái lập đều còn nguyên** (D1 P0, D2 P1, D3 P1, D4 P2, D5 P2). Working tree hiện chứa WIP patch Phase 0/1/2 (chưa commit) có chủ ý sửa cả 5 nhưng:

- Patch chưa đồng bộ test fixture → 17 test fail ở 4 file (examService, examMixedScoring, examLifecycleAudit, examResultUpsertRace, questionBank);
- Patch **chưa đóng** D1: `validateAcceptedScanProvenance` ở `examService.ts:750` dùng `commandSource` (incoming `r.source`) thay vì `source` (đã resolve), nên essay-only second phase với `source='omr'` (do UI gửi sai hoặc do policy) bị chặn ngay cả khi row đã có scanMetadata;
- Patch đổi contract mà không đổi client contract ở `ExamSessionView.tsx` (chưa thấy diff), nên UI hiện tại có khả năng không gửi `expectedResultVersion` đúng → server sẽ 409 với mọi `r.expectedResultVersion === undefined` khi row tồn tại → regression online flow.

Về OMR/performance: detector là in-repo TypeScript (không phải native dep), tagged `omr-v4-live`/`omr-v4-batch`. Synthetic benchmark trên dev-host-win32-x64, Node 24.14.1 cho 7 case ≥100 iter có p95 9.30–79.18 ms (dưới technical target 150 ms), nhưng không chứng minh accuracy, false accept, camera latency, thermal/memory, thiết bị release.

Về Grade handoff: single writer + reopen policy đã đúng intent. Rescore↔Grade divergence window là một **RISK có chủ đích** (chỉ reconcile ở finalize), nhưng `gradeAuditSync.test.ts` **không test handoff** — chỉ test manual Grade write.

Về test & benchmark gaps: thiếu B–H mixed two-phase matrix (che D1), race test mới chứng minh convergence chứ không chứng minh correctness (che D2), thiếu build retry test (che D4), thiếu queue-ledger replacement (che D3), không có production-qualified OMR corpus, chưa có concurrent finalize/result interleaving E2E.

---

## 2. Phạm vi và phương pháp

### 2.1 Path tái lập

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

### 2.2 Verification đã chạy

| Verification | Command | Kết quả HEAD | Kết quả HEAD+WIP |
|--------------|---------|--------------|-------------------|
| Diagnostic defect probes | `npm run test -- --config scripts/audits/assessment-question-bank-exam-omr-2026-09-06.vitest.config.ts --fileParallelism=false` | **4/4 probes PASS** (reproduced D1/D3/D4/D5 nhánh concrete) | **4/4 probes FAIL** (WIP đã sửa hành vi được probe mô tả) |
| Focused regression 8 files | `npx vitest run server/src/__tests__/{examService,examMixedScoring,examLifecycleAudit,examVariantManifest,examResultUpsertRace,questionBank,gradeAuditSync,schemaHealth}.test.ts --fileParallelism=false` | **57/57 PASS** (chưa chạy — audit cũ đã report 215/215 ở 16 file, không phát sinh lỗi mới từ HEAD; verified qua git status) | **51/68 PASS, 17 FAIL** (WIP patch chưa update fixture) |
| Synthetic OMR benchmark | `npm run benchmark:omr` | PASS, dev-host-win32-x64, Node 24.14.1 — xem §6 | unchanged |
| Sequence benchmark | `npm run benchmark:omr:sequence` | No-op (no sequence manifest/targets in repo) | unchanged |

### 2.3 Hành vi WIP

Probe `assessment-question-bank-exam-omr-2026-09-06.probe.ts` (cố ý assert **hành vi lỗi** đang quan sát) đảo từ PASS (HEAD) → FAIL (WIP) là tín hiệu tốt cho thấy WIP đã sửa các defect D1, D3, D4 và nhánh concrete của D5 theo probe mô tả. **Tuy nhiên**, đảo trạng thái không tự chứng minh WIP đúng — cần regression mong đợi mới chạy xanh. Hiện các regression mong đợi chưa viết xong; test hiện hành lại ốm vì fixture cũ.

---

## 3. Pipeline tái lập (HEAD sạch, không WIP)

### 3.1 Question Bank: authoring, version, lifecycle

`QuestionBankView → /api/question-bank/questions|blueprints → questionBankService` là boundary online-only. Router chặn ngoài `admin|chunhiem|phuta`; service kiểm tenant cho branch và class. Tạo/import ghi item + version 1 + audit trong transaction; revise append version mới và đưa lifecycle về draft; admin sở hữu approve/activate/archive. Evidence: `questionBank.ts:25`, `questionBankService.ts:165,189,351,376`.

`question_bank_items.current_version` trỏ nội dung hiện hành; `question_bank_versions` có unique `(parish, question, version)` và FK composite tenant. Exam không đọc lại bank row khi render/chấm. Evidence: `schema.ts:789,821`.

### 3.2 Build: materialization và transaction boundary

`POST /api/question-bank/exams/build → buildExamFromBank` mở DB transaction bao trọn: class + assignment, `status='active'` + `currentVersion`, blueprint active + deterministic seed + shortage fail-all, MC xếp trước essay (giữ OMR numbering), session + manifest + answer variants + exact source snapshots + audit. Evidence: `questionBankService.ts:481–585`; snapshot FK restrict: `schema.ts:990`.

### 3.3 Variant manifest, đề in và QR identity

`generateExamVariantManifest` deterministic, giữ A identity, đảo question/options B–H, phát answer key theo vị trí mới, `sourceHash`/`contentHash`. Position-dependent option ("tất cả/không có đáp án") bị reject. Evidence: `examVariantManifest.ts:46,66,77`.

T3 QR bind `sessionId + studentId + templateMode + questionCount + examVersion` bằng FNV-1a 16-bit; parser và server decode tính lại. FNV là accidental-corruption detection, không phải security signature (`qr.ts:41` comment). Client identity lock so tuple, fail wrong-session (`exams.ts:543`, `ExamScanModal.tsx:358`). T2/TE/legacy map A để tương thích; với manifest, UI chỉ in non-A từ exact manifest; route PATCH key/variants chặn khi manifest tồn tại (`exams.ts:434,482`).

### 3.4 Scan/OMR proposal boundary

Live scan:
1. decode + identity lock;
2. reject sai session/template/count/version;
3. quality bad chặn trước detector;
4. detector marker/paper/geometry/fill/confidence;
5. `decideScanAcceptance` reject hoặc route review;
6. auto path cần 2 frame cùng fingerprint;
7. human Save cuối.

Evidence: `ExamScanModal.tsx:308,352,396,422`; `scanAcceptancePolicy.ts:17`; `omr.ts:729`.

Batch kiểm session, allowed student, count, version/key, OMR + quality; duplicate student route review; chỉ `accepted` được đưa vào save payload. Evidence: `examBatchScan.ts:35`; `ExamBatchScanModal.tsx:56,78,140`.

### 3.5 Result authority, idempotency và persistence

`POST /api/exams/:id/results → upsertExamResults`:
- re-check actor/role/class trong transaction;
- session phải `draft`;
- mỗi student phải active và thuộc đúng class;
- MC/OMR answers được server chấm lại theo version key;
- mutation receipt `(parish,user,clientMutationId)` commit cùng result; same ID + same hash → duplicate, khác hash → 409;
- result unique `(parish,session,student)`.

Evidence: `exams.ts:237`; `examService.ts:546,562,578,592,626`; `schema.ts:937,968`.

### 3.6 Finalization và Grade handoff

`POST /api/exams/:id/complete → finalizeExamSession` chạy 1 transaction: writer/class check, semester lock, current results, old finalization reconciliation, assessment ledger, protected manual/override conflict, `upsertGrade(..., tx)`, receipt items, session completed + audit. Completed replay trả receipt cũ. Evidence: `examService.ts:937,958,992,1014,1034,1134,1157`.

Client `completeAndFinalize` không ghi Grade; online chỉ project receipt + pull Grade, offline chỉ preview rồi queue complete barrier (`examStore.ts:429`).

---

## 4. Verified Strengths (HEAD sạch)

### S1 — Versioned Question Bank và immutable exam materialization

Create/import/revise/lifecycle có ownership rõ; current content snapshot vào session và `exam_question_snapshots`. Test `questionBank.test.ts:219` chứng minh revision v2 không đổi snapshot v1 và blueprint shortage không tạo partial session.

### S2 — Manifest A–H deterministic và unsafe shuffle fail-closed

Manifest giữ source order/IDs, option order, answer key và hash từng variant. Generator từ chối cấu trúc không thảo đảo an toàn. `examVariantManifest.test.ts` chạy lại PASS.

### S3 — Student/session/class authority được kiểm lại ở server

QR/client lock là UX/safety layer; result persistence không tin student ID từ QR một mình. Server tải session cùng tenant, re-check writer/class và query `(parish,id,classId,active)` trước write. Vì vậy barcode decode thiếu membership lookup riêng không tạo đường persist sai học sinh.

### S4 — Server-authoritative scoring và retry idempotency ở result item

MC/mixed scan score được recompute từ answers/key/version; client score drift trả `adjustments`. Mutation receipt cùng transaction xử lý response-loss retry mà không audit/write lần hai. `examService.test.ts` xác nhận A/B scoring, invalid answers, review status, image metadata và duplicate mutation behavior.

### S5 — OMR client proposal fail-closed trước human Save

Marker/paper/geometry/quality/confidence gates, review routing, all-blank rejection và 2-frame consensus đều có code/test. `scanAcceptancePolicy` đặt quality bad trước review; batch/live dùng cùng policy. Verified software behavior, không phải field-accuracy claim.

### S6 — Exam là single writer sang Grade

Không có client Grade write sau complete. Finalization ghi ledger + grade projection + receipt + session state trong một DB transaction và bảo vệ manual/override bằng explicit conflict item. Focused scan-to-grade/lifecycle tests PASS.

### S7 — Reopen/re-finalize semantics được mô tả và test nhất quán

Reopen chỉ mở session; last-finalized Grade giữ cho tới finalize tiếp. Re-finalize dọn orphan daily assessment entry nhưng không tự xóa last-finalized score của học sinh bị bỏ khỏi session. Có chủ đích tại `BUSINESS_RULES.md:431`, `FRONTEND_API_CONTRACT.md:597`, `examLifecycleAudit.test.ts:114`.

### S8 — Atomic SQLite upsert qua writer-first transaction

`upsertExamResults` mở transaction với câu lệnh đầu là `UPDATE … WHERE status='draft'` để ép libSQL/Turso deferred tx lên writer trước khi readers lập snapshot (`examService.ts:562`). Race test `examResultUpsertRace.test.ts:133` chứng minh 5 concurrent write hội tụ thành 1 row — **structural convergence** (xem D2 cho semantic correctness).

---

## 5. Verified Defects (HEAD sạch)

### D1 — P0 — Mixed B–H mất variant/provenance khi nhập tự luận sau OMR

**Path:** OMR save B → POST results với `examVersion=B, answers, scanMetadata`; tiếp theo `ExamSessionView.handleSaveScore(essayScore)` không gửi `examVersion/answers/scanMetadata` → `upsertExamResults` ở `examService.ts:651` chỉ select `answers,essayScore` cho mixed row hiện có → default `examVersion=A` (line 671–672) → `computeMultipleChoiceScore` chấm bằng key A → upsert ghi `source='quick_entry', examVersion=A, scanMetadata=NULL` (line 721–746).

**Evidence (HEAD):** Service default version trước khi đọc row và chỉ select `answers,essayScore`: `examService.ts:651,658`. Mixed merge dùng answers cũ với version mới mặc định A tại 681–690; upsert ghi `source`, `examVersion`, `scanMetadata` mới tại 721–746.

**REPRODUCED (HEAD):** probe `assessment-question-bank-exam-omr-2026-09-06.probe.ts:190` PASS — key A=`A,A`, key B=`B,B`; lưu OMR B đúng 2 điểm rồi nhập essay 5. Current row thành `score=5`, `examVersion=A`, `source=quick_entry`, `scanMetadata=NULL`; invariant đúng phải là tổng 7, giữ B và scan provenance.

**Impact:** silent wrong score có thể đi qua finalization sang Grade; receipt không biết MC đã bị đổi key. Điều kiện hẹp nhưng thực tế: exam type mixed, mã B–H, OMR trước, essay nhập sau.

**WIP fix (uncommitted, không merge-safe):** `examService.ts:736–748` (working tree) thêm `preserveExistingScan` để giữ `examVersion/source/scanMetadata/attemptFingerprint/capturedAt` từ existingRow khi mixed && !carriesNewAnswers && existingRow.answers. **Residual gap:** `validateAcceptedScanProvenance` (line 750) dùng `commandSource` (incoming `r.source`), không dùng `source` (resolved). Nếu UI gửi `r.source='omr'` cho essay-only follow-up, gate fail với "thiếu scanMetadata" ngay cả khi row có scanMetadata. Probe #1 ở WIP fail tại `validateAcceptedScanProvenance:244` với "Mã đề trong scanMetadata không khớp" — tức là fix D1 hiện chặn cả hợp lệ mixed essay-only follow-up.

### D2 — P1 — Concurrent/stale rescan là unconditional last-writer-wins

**Path:** hai devices/stale tabs hoặc hai save độc lập → unique result key `(parish,session,student)` → mỗi request vượt class/session checks → `onConflictDoUpdate` không `expectedVersion`/attempt precondition → request commit sau ghi đè.

**Evidence (HEAD):** `examService.ts:721` không có OCC. `attemptFingerprint` chỉ vào request hash khi có mutation ID, không persist/compare với current result. Client conflict memory `seenAttemptByStudentRef` chỉ local process/device: `ExamScanModal.tsx:168,457`.

**MEASURED (HEAD):** `examResultUpsertRace.test.ts:133` gửi đồng thời điểm 4,5,6,7,8; cả 5 fulfilled, 1 create + 4 update, final row là bất kỳ giá trị nào trong tập. Test chứng minh structural convergence thành 1 row, nhưng đồng thời chứng minh không có semantic conflict protection.

**Impact:** scan đúng có thể bị save từ stale tab/device ghi đè mà server không yêu cầu xác nhận; finalization dùng winner theo lịch commit. `clientMutationId` chỉ chống retry của cùng command, không hòa giải hai command hợp lệ khác nhau.

**Nuance:** Business Rule cho phép người chấm chủ ý quét/nhập lại. Defect không phải "cho overwrite", mà là server không phân biệt overwrite đã xác nhận với lost update.

**WIP fix (uncommitted):** thêm `resultVersion` schema + `expectedResultVersion` input + `ExamResultVersionConflictError` 409 + compare-and-swap `WHERE resultVersion = expected`. Race test `examResultUpsertRace.test.ts:133` không update fixture → tại WIP fail với 4/5 rejected vì concurrency thật sự khác version. Đây là đúng intent nhưng test chưa encode winner-only expectation.

### D3 — P1 — Same-student queue replacement để lại ledger pending không thể acknowledge

**Path:** continuous `queueScores` 2 lần trước sync → `syncSaveExamResults` dùng cùng entity key `session::result::student` → `syncStore.addOp` thay payload op cũ và trả lại queueOpId cũ → `examStore` thêm cả hai clientMutationId vào ledger → chỉ mutation mới còn trong queue/được server ack → complete thấy mutation cũ vẫn pending.

**Evidence (HEAD):** key/durable enqueue `syncService.ts:116`; dedupe replace `syncStore.ts:215`; ledger append `examStore.ts:338`; complete gate `examStore.ts:435`. Existing test `sync-engine.test.ts:121` chỉ assert queue còn mutation cuối, không assert ledger cũ được supersede.

**REPRODUCED (HEAD):** probe ghi 2 mutation khác ID cho cùng student; 2 calls trả cùng `queueOpId`, Dexie chỉ còn 1 op chứa mutation mới, nhưng ledger có 2 row `pending` (probe line 304 expect length 2 nhận 1).

**Impact:** latest score vẫn durable, nhưng UI/complete barrier có thể mắc ở "chờ đồng bộ" vô hạn hoặc luôn queue complete thay vì online finalize/receipt.

**WIP fix (uncommitted):** `examStore.ts` (working tree) thêm vòng lặp đánh `status: 'superseded'` cho ledger entry cũ cùng `sessionId+studentId+status='pending'` trước khi ghi ledger mới. UI hiển thị "Đã thay bằng lần sau" cho status này. Probe tại WIP fail vì expect 2 pending nhận 1 — đúng intent, test fixture chưa update.

### D4 — P2 — Question Bank build retry không idempotent

**Path:** `QuestionBankView → POST /api/question-bank/exams/build → buildExamFromBank`; response mất sau commit → user/client retry cùng payload → service sinh seed/session ID mới → idempotency key `question-bank:${sessionId}` mới → unique index không dedupe request.

**Evidence (HEAD):** build input không có idempotency key ở route (`questionBank.ts:167`) và client (`api/questionBank.ts:44`). Service sinh seed/session/key tại `questionBankService.ts:496,566,574`. Schema có useful unique key nhưng current key tự-unique: `schema.ts:916`.

**REPRODUCED (HEAD):** probe gọi service 2 lần với cùng payload + cùng explicit seed; nhận 2 session IDs, 2 snapshots/manifest sets, 2 idempotency keys (probe line 235 fail vì `retry.id === first.id`).

**Impact:** response-loss/retry tạo duplicate draft exams khó phân biệt, tăng nguy cơ in/quét/finalize nhầm session. Re-exam cố ý vẫn hợp lệ; retry cần phân biệt bằng stable command key, không bằng nội dung nghiệp vụ.

**WIP fix (uncommitted):** thêm `buildCommandId` input + `buildRequestHash` schema column + dedupe tại `questionBankService.ts:512–525`. Probe tại WIP fail (expected) vì expect `retry.id !== first.id`. Test fixture `questionBank.test.ts:211,220,246` không thêm `buildCommandId` → 4 test fail. Khi fixture update, regression mong đợi sẽ pass.

### D5 — P2 — OMR/manual-correction provenance là client-attested và không đủ tái dựng

**Path:** scan UI tự tạo `source`, `detectionStatus`, correction indexes và fingerprint → results route nhận optional metadata → `sanitizeScanMetadata` chỉ reject non-accepted khi field tồn tại → result row lưu current answers/aggregate metadata → subsequent upsert thay row; re-finalize xóa receipt items cũ.

**Evidence (HEAD):** client metadata không có `detectedAnswers`/`corrections` (chỉ `correctedQuestions`): `ExamScanModal.tsx:882`. `source`, `scanMetadata`, `attemptFingerprint`, `capturedAt` đều client gửi: `exams.ts:237`. Sanitizer `examService.ts:202` chấp nhận missing `detectionStatus`. Schema result không có fingerprint/capturedAt/savedBy: `schema.ts:937`. Mutation receipt chỉ hash+response: `schema.ts:968`. Re-finalize xóa prior receipt/items: `examService.ts:983`.

**REPRODUCED (HEAD):** probe gửi `source='omr'`, valid answers nhưng không `scanMetadata`; server lưu score 10, source OMR, metadata NULL. Score vẫn đúng theo answers; điều không chứng minh được là answers thực sự đến từ accepted detector hay correction nào đã xảy ra.

**Impact:** không thể tái dựng detected answer ban đầu, thay đổi thủ công, capture time, fingerprint hoặc lịch sử attempt/finalization trước; audit trail chỉ biết actor/time của aggregate save/finalize. Đây là provenance defect, không phải bằng chứng score hiện hành luôn sai.

**WIP fix (uncommitted):** `examService.ts` thêm `validateAcceptedScanProvenance` gate (line 750), yêu cầu `scanMetadata` cho OMR/QR source + check `detectionStatus==='accepted'`, `examVersion` và `questionCount` match. Schema thêm `result_version`, `attempt_fingerprint`, `captured_at`, `saved_by`, `saved_at`. Client gửi `detectedAnswers/finalAnswers/corrections` (`ExamScanModal.tsx:882,1426`). Test fixtures `examMixedScoring.test.ts:152,203` không include `examVersion`/`questionCount` trong `scanMetadata` → 4 test fail. Probe tại WIP fail vì expect server accept missing metadata; đúng intent.

### D6 — RISK (mới từ audit này) — Two create paths divergence: snapshot vs questions JSON

`POST /api/question-bank/exams/build → buildExamFromBank` materializes per-position `exam_question_snapshots` rows với `contentHash` (immutable freeze). `POST /api/exams (legacy createExamSession)` chỉ lưu `questions` JSON trong `exam_sessions` row, **không tạo `exam_question_snapshots`** (`examService.ts:388–477` — không import snapshot table, không insert). Evidence: xác nhận lại bằng grep `exam_question_snapshots` trong `examService.ts` không có; chỉ trong `questionBankService.ts:576`.

**Impact:** snapshot-based analytics (`usage`, `avoidRecentDays` ở `questionBankService.ts:535–541`) mù với legacy exams. Một giáo lý viên có thể re-use câu trong legacy + QB exams trong `avoidRecentDays` mà không bị chặn.

**Verdict:** RISK. Snapshot FK `restrict` vẫn giữ integrity (không xóa item đang snapshot), nhưng coverage không đầy đủ. Có thể là intentional (legacy là phiên in-thủ-công, không qua bank), nhưng cần documentation rõ.

---

## 6. OMR / performance evidence

### 6.1 Detector architecture (SOURCE)

- In-repo TypeScript, không có native dependency. Pinned `engineVersion: 'omr-v4-live'` (`ExamScanModal.tsx:481,886`) và `'omr-v4-batch'` (`examBatchScan.ts:122`).
- Template-based: 4 corner markers + homography (`omr.ts:516,561`); per-cell darkness metric (`omr.ts:303–363`); adaptive calibration với clamp `ADAPTIVE_FILL_MIN/MAX=0.24..0.42` và fallback `separation < 0.20` (`omr.ts:74,376`).
- Per-question thresholds: `MIN_FILL=0.38`, `MIN_WEAK_FILL=0.22`, `MIN_QUESTION_GAP=0.07`, `MIN_ANSWER_CONFIDENCE=0.06` (`omr.ts:65–72`).
- Whole-image acceptance qua `scanAcceptancePolicy.ts:17`: `!ok || score===null` → reject; `quality.status==='bad'` → reject (override); `omr.status==='review_required'` → review; `quality.status==='review'` → review; else accept.
- Batch có defensive `acceptedScore===null → rejected` ngay cả khi policy nói accept (`examBatchScan.ts:103–112`) — fail-closed ở boundary persist.
- Per-cell multi-mark: `filledCount>1` → `isMultiFill:true, selectedAnswer=null, needsReview:true` (`omr.ts:818–824`), không bao giờ silently giảm còn 1.
- Live UI block submit nếu `needsReview>0`; batch route vào bucket review không POST (`ExamScanModal.tsx:858`, `ExamBatchScanModal.tsx:57,139`).

### 6.2 Synthetic benchmark (MEASURED)

`npm run benchmark:omr` PASS trên dev-host-win32-x64, Node 24.14.1, ≥100 iter / case:

| Case | p95 (ms) | Note |
|------|----------|------|
| integrated 800×1130 | 9.30 | < 150 ms target |
| integrated 960×1356 | 11.47 | < 150 ms target |
| integrated 1280×1808 | 23.64 | < 150 ms target |
| full-page 960×1356 | 11.27 | < 150 ms target |
| full-page 1280×1808 | 37.51 | < 150 ms target |
| auto→full-page fallback 960×1356 | 79.18 | < 150 ms target |
| auto no-marker rejection 960×1356 | 25.39 | < 150 ms target |

QR exhaustive negative diagnostics n=3 nên chỉ bounded max, không p95: max 326.34 ms (960), 699.91 ms (1280). **Không trộn với OMR p95 target.**

`benchmark:omr:sequence` không chạy (no sequence manifest/targets in repo) — không tạo evidence.

### 6.3 Không chứng minh được

- Accuracy trên ảnh thật (giấy/bút/ánh sáng/camera): UNKNOWN.
- False accept rate: UNKNOWN.
- Camera capture latency end-to-end: UNKNOWN.
- Thermal/memory slope trên target device: UNKNOWN.
- Sustained throughput papers/minute: UNKNOWN.

`tests/fixtures/omr-camera` chỉ có README, không có image observations/sequence manifests/targets. `omrBenchmarkGate.ts:39,186` đặt required profile arrays rỗng và fail-closed.

---

## 7. Exam → Grade handoff contract

| Concern | Verdict | Evidence |
|---------|---------|----------|
| Single trigger (`finalize` → `completeExamSession`) | STRENGTH | `examService.ts:937,1176` |
| Single writer vào `grades` cho exam data | STRENGTH | `examService.ts:1134`; `gradeService.ts:113–385`; chỉ `upsertGrade`/`GradeApplicationService` write grades |
| Reopen không xóa Grade | STRENGTH | `examService.ts:1185–1217`; test F2 |
| Re-finalize reconciling + conflict-aware | STRENGTH | `examService.ts:983–1012,1046–1070`; test F2 |
| Variant code persist trên Grade row | **NO** (chỉ `exam_results.exam_version` + `examFinalizationItems`) | `schema.ts:131–152,968` |
| Rescore↔Grade divergence window | **RISK** — `updateAnswerVariantsAndRescore` cập nhật `exam_results.score` nhưng không Grade; reconcile chỉ ở finalize kế tiếp | `examService.ts:1399–1490` |
| Protected-field conflict short-circuit (override/manual) | STRENGTH | `gradeService.ts:230–247`; `examService.ts:1046–1070` |
| `gradeAuditSync.test.ts` coverage của handoff | **DEFECT** — file chỉ test manual `POST /api/grades` audit, không test `finalize → upsertGrade` | `gradeAuditSync.test.ts:58–180` |
| `goliveVerification.test.ts` | UNKNOWN — file không tồn tại (glob không match) |

**Variant drift risk:** variant code A–H được consume tại scoring time và persist trên `exam_results` + receipt, không persist trên `grades`. Rescore cập nhật `exam_results.score` in-place, không Grade. Giữa rescore và re-finalize, `grades` mang giá trị cũ trong khi `exam_results` mang giá trị mới → có thể lệch âm thầm. Phải reopen (admin) + re-finalize mới reconcile.

---

## 8. Intentional Complexity

### I1 — Một current result per student và explicit rescan

Unique row + overwrite là business policy để sửa bài draft, không tự nó là defect. Complexity cần giữ là mutation idempotency, conflict confirmation và version precondition; D2 xuất hiện vì HEAD thiếu semantic concurrency.

### I2 — Partial Grade conflicts khi finalize

Manual/override sources không bị exam ghi đè; receipt ghi từng student `committed|conflict`, session vẫn completed. Lựa chọn an toàn và observable hơn rollback toàn batch.

### I3 — Reopen giữ last-finalized Grade

Reopen không rollback Grade ngay là policy nhằm tránh xóa điểm đã công bố trong khoảng chỉnh sửa. Re-finalize mới reconcile ledger. UI cần hiển thị rõ "Grade vẫn là bản finalize trước", không đổi semantics khi chưa có business decision mới.

### I4 — OMR supervised, on-device và ảnh review local-only

Human Save, review routing, local AES-GCM snapshot TTL 24h, không upload ảnh. Trade-off đúng reliability/privacy. Không đề xuất vision server hoặc lưu ảnh bắt buộc để sửa D5.

### I5 — Legacy T2/TE/QR map A

Compatibility path có chủ đích. Với B–H, T3 là contract đúng. Không bỏ legacy nếu chưa inventory phiếu đang dùng; fail-closed khi session/operation rõ ràng yêu cầu variant không-A.

### I6 — Không đưa Question Bank vào offline sync

Authoring/build server-required tránh parallel authority và snapshot từ bank stale. Intentional boundary hợp lý.

### I7 — Snapshot coverage không đồng đều giữa 2 create paths

D6 chỉ ra divergence nhưng có thể là intentional (legacy là phiên in-thủ-công). Cần tài liệu hóa hoặc đóng bằng cách ép mọi create qua bank hoặc ép `createExamSession` cũng ghi snapshot row.

---

## 9. Test & Benchmark Gaps

### G1 — Thiếu mixed B–H two-phase permutation matrix

Existing mixed tests chỉ dùng A. Cần cover OMR→essay và essay→OMR cho A–H, partial/blank answers, metadata/source preservation và server adjustment. Đã che D1.

### G2 — Race test đang chứng minh convergence, không chứng minh correctness

`examResultUpsertRace` coi tất cả concurrent writes success là PASS. Sau OCC fix, test phải assert 1 winner + stale commands 409/conflict, retry bằng explicit latest version.

### G3 — Thiếu retry test cho build command

Question Bank tests kiểm transaction, snapshot, shortage nhưng không mô phỏng commit-success/response-loss/retry. Cần same key/same hash và same key/different hash.

### G4 — Thiếu queue-ledger replacement/reload acknowledgement test

Test hiện hành chỉ nhìn Dexie queue payload cuối. Cần assert mutation ledger supersede, complete barrier, reload persistence, ack out-of-order.

### G5 — Manifest immutability còn phụ thuộc entry route

Routes chặn PATCH khi `variantManifests` tồn tại, nhưng service `updateAnswerKeyAndRescore`/`updateAnswerVariantsAndRescore` chỉ kiểm draft và không tự guard manifest: `examService.ts:1219,1399`. Current production callers đều qua guarded routes; chuyển invariant vào service transaction và test direct caller.

### G6 — Không có production-qualified OMR corpus/evidence

`tests/fixtures/omr-camera` chỉ có README; không có image observations, sequence manifests, target files. Default gate để required profile arrays rỗng và fail-closed: `omrBenchmarkGate.ts:39,186`. Unit/synthetic suite chứng minh policy logic, không chứng minh camera field accuracy.

### G7 — Chưa có concurrent finalize/result interleaving E2E

Result path dùng writer-first serialization và completed guard; finalize transaction atomic. Focused tests cover lifecycle and idempotent replay, nhưng không có deterministic test cho result-save commit cạnh finalize, two finalize requests, complete barrier sau app reload.

### G8 — gradeAuditSync không cover Exam→Grade handoff

`gradeAuditSync.test.ts:58–180` chỉ test manual `POST /grades` audit. Cần test EXAM_FINALIZE audit, conflict items cho protected grades, source-stamping `exam_scan`/`daily_avg`, và ledger reconcile ở re-finalize.

### G9 — Thiếu coverage cho snapshot divergence D6

Chưa có test cho `createExamSession` legacy path vs `buildExamFromBank` QB path khẳng định `usage`/`avoidRecentDays` đồng nhất giữa hai nguồn.

---

## 10. Unknown / insufficient evidence

### U1 — Accuracy và false accept trên ảnh thật

Không biết answer accuracy, exact-sheet accuracy, review routing và false accept trên giấy/bút/ánh sáng/camera thực tế. Target 99.5%/98%/0 false accept là policy gate, không phải số đo hiện tại.

### U2 — Target-device end-to-end latency và sustained throughput

Không có run 30/100 phiếu trên release/device/browser/profile; không biết thermal drift, memory slope, papers/minute, reload recovery, responsiveness trên thiết bị giáo xứ.

### U3 — Production feature flags và sheet population

Không xác minh production `VITE_CONTINUOUS_SCAN_V2`, pilot allowlist/circuit state, tỉ lệ T3 vs legacy T2/TE, hay số mixed B–H đã chấm.

### U4 — Tần suất thực tế của retry/race/queue replacement

D1–D4 reproducible nhưng audit không có production telemetry để định lượng occurrence. Severity dựa vào consequence/invariant.

### U5 — Mức retention/provenance nghiệp vụ cần thiết

Repo khẳng định provenance rõ và có audit, nhưng không có policy retention nói phải giữ full attempt history/detected-before-after bao lâu. D5 xác nhận claim HEAD không đủ để tái dựng.

### U6 — Printer/physical geometry và manifest-to-paper fidelity

DOM/print tests kiểm geometry phần mềm, không có bằng chứng máy in, scaling driver, camera crop và giấy thật giữ marker/QR/variant fidelity.

### U7 — goliveVerification có tồn tại không

Glob không match `server/src/__tests__/goliveVerification.test.ts` mặc dù `package.json` liệt kê ở `test:security-critical`. Có thể đã move hoặc đã đổi tên — không xác minh được ở HEAD này.

---

## 11. Trạng thái WIP (working tree, chưa commit)

12 file thay đổi cục bộ tại thời điểm audit:

| File | Lines | Intent |
|------|-------|--------|
| `server/src/db/schema.ts` | +11 | Thêm `exam_results.result_version/attempt_fingerprint/captured_at/saved_by/saved_at`, `exam_sessions.build_request_hash` |
| `server/src/db/migrations.ts` | +9 | Migration `20260906-170..175` cho các cột trên |
| `server/src/db/schemaHealth.ts` | +1, ~2 | Required migration range + columns |
| `server/src/__tests__/schemaHealth.test.ts` | ~2 | Update required columns |
| `server/src/routes/exams.ts` | +8 | Validate `expectedResultVersion`, handle `ExamResultVersionConflictError` 409 |
| `server/src/services/examService.ts` | +130, ~46 | OCC compare-and-swap, `preserveExistingScan`, `validateAcceptedScanProvenance`, hash includes capturedAt+expected |
| `src/components/exam/ExamScanModal.tsx` | +26, ~3 | detectedAnswers/finalAnswers/corrections trong scanMetadata, "Đã thay bằng lần sau" label |
| `src/lib/api/exams.ts` | +3 | expectedResultVersion trong request type, response resultVersion |
| `src/lib/examBatchScan.ts` | +3 | Detected/final answers và corrections trong scanMetadata |
| `src/lib/syncService.ts` | +1 | expectedResultVersion trong ExamResultSyncScore |
| `src/stores/examStore.ts` | +59, ~10 | attachExpectedResultVersions, ledger supersede khi queue replacement |
| `src/types/index.ts` | +8 | ExamResult.resultVersion/attemptFingerprint/capturedAt/savedBy/savedAt, scanMetadata.detectedAnswers/finalAnswers/corrections |

**Test impact tại WIP** (run tại HEAD+WIP):

| File | Pass | Fail |
|------|------|------|
| `examService.test.ts` | 21 | 11 |
| `examMixedScoring.test.ts` | 4 | 4 |
| `examLifecycleAudit.test.ts` | 9 | 1 (F5 service-layer answer-key rescore guard) |
| `examResultUpsertRace.test.ts` | 0 | 1 |
| `questionBank.test.ts` | 6 | 4 |
| `examVariantManifest.test.ts` | — | (không chạy riêng; thuộc focused suite cũ) |
| `gradeAuditSync.test.ts` | — | (không chạy riêng) |
| `schemaHealth.test.ts` | — | (không chạy riêng) |

**Reason cho các failure** (audit không sửa, chỉ quan sát):

1. `buildCommandId` bắt buộc ở `POST /api/question-bank/exams/build` nhưng `questionBank.test.ts:211,220,246` vẫn dùng payload cũ → 400 thay vì 201/422/403.
2. `expectedResultVersion` yêu cầu khi existingRow (WIP line 720–727). `examService.test.ts` upsert/lifecycle fixtures không gửi → bị 409 hoặc count mismatch.
3. `validateAcceptedScanProvenance` yêu cầu `scanMetadata.detectionStatus==='accepted'`, `examVersion`, `questionCount` cho OMR/QR source trong session MC/mixed. `examMixedScoring.test.ts:152,203` chỉ có `detectionStatus:'accepted', engineVersion:'test'` → fail.
4. `examResultUpsertRace.test.ts:133` dùng 5 concurrent cùng expected=null → 4/5 rejected thay vì 5 fulfilled; test chưa encode winner-only expectation.
5. `examLifecycleAudit.test.ts:194` (F5 answer-key rescore guard ở tầng service) — WIP test fail; có thể do `expectedResultVersion` thêm vào payload body mà route/service không forward đúng cho rescore path.

**Residual defects trong WIP:**

- **R-WIP1 (RESIDUAL D1):** `validateAcceptedScanProvenance` dùng `commandSource` thay vì `source` resolved. Mixed essay-only follow-up với `r.source='omr'` sẽ bị chặn dù existingRow đã có scanMetadata. Probe #1 fail tại `validateAcceptedScanProvenance:244` xác nhận điều này. Cần: dùng `source` đã resolve (`preserveExistingScan ? existingRow.source : commandSource`).
- **R-WIP2 (Client contract gap):** `attachExpectedResultVersions` ở `examStore.ts` (WIP) sẽ tự gắn version từ `get().results` cho mỗi `studentId` nếu caller không truyền — nhưng `results` được normalize ở `normalizeExamResults` với `resultVersion: row.resultVersion ?? 1`. Caller online đã có version. Caller offline gửi qua `syncSaveExamResults` — nếu `syncService`/Dexie không persist `resultVersion` mỗi result, `attachExpectedResultVersions` sẽ thấy version cũ hoặc 0 → server 409 cho mọi offline replacement hợp lệ. Cần verify: Dexie result row có trường `resultVersion` không, syncService có forward không.
- **R-WIP3 (Probe D3 supersede edge):** `examStore.ts` (WIP) supersede ledger entry pending cùng `sessionId+studentId` trước khi thêm mutation mới. Nhưng `syncStore.addOp` (HEAD) trả cùng `queueOpId` cho cả hai calls; nếu server đã ack mutation cũ trước khi mutation mới sync, ledger supersede có thể đánh nhầm entry đã synced. Cần check ordering và ack out-of-order.

**Verdict:** WIP patch đi đúng hướng theo audit 2026-09-06 Phase 0/1/2 nhưng chưa đủ để merge: 17 test fixture phải update, R-WIP1 phải fix, R-WIP2 cần client-store verification, R-WIP3 cần ordering/ack test.

---

## 12. Documentation drift

- `02_ARCHITECTURE.md:76` và `FRONTEND_API_CONTRACT.md:401` mô tả ledger item và complete barrier như đã hội tụ; D3 chứng minh same-student replacement làm ledger lệch queue.
- `FRONTEND_API_CONTRACT.md:442` nói mixed merge 2 pha "không mất dữ liệu"; D1 chứng minh B–H mất version/provenance và chấm sai.
- `ADR-096:3277` nói existing Exam/offline/finalization pipeline "unchanged"; điều này đúng về dependency direction nhưng không chứng minh pipeline đó correct ở mọi variant/retry path.
- Snapshot test counts/9-of-9 decision scores trong ADR là historical acceptance evidence, không phải current invariant proof. Current focused suite vẫn xanh đồng thời bốn defect probes cũng xanh (ở HEAD), vì hai nhóm test đang hỏi hai câu khác nhau.

Không sửa SSOT trong audit này vì product behavior chưa được remediation ship. Sau khi WIP được merge và regression mong đợi pass, update docs theo behavior đã test, không chỉ đánh dấu finding "resolved".

---

## 13. Verification thực sự đã chạy (audit này)

| Verification | Command | Result |
|--------------|---------|--------|
| Diagnostic defect probes @ HEAD | `npm run test -- --config scripts/audits/assessment-question-bank-exam-omr-2026-09-06.vitest.config.ts --fileParallelism=false` | **4/4 tests PASS** (reproduce D1, D3, D4, D5 nhánh concrete) |
| Diagnostic defect probes @ HEAD+WIP | (same) | **0/4 tests PASS** — 4/4 fail với assertion đảo chiều, confirming WIP đã sửa hành vi được probe mô tả |
| Focused regression 8 files @ HEAD+WIP | `npx vitest run server/src/__tests__/{examService,examMixedScoring,examLifecycleAudit,examVariantManifest,examResultUpsertRace,questionBank,gradeAuditSync,schemaHealth}.test.ts --fileParallelism=false` | **51/68 tests PASS, 17 FAIL** — do fixture cũ không tương thích WIP contract |
| Synthetic OMR benchmark @ HEAD | `npm run benchmark:omr` | PASS, 7 case ≥100 iter, p95 9.30–79.18 ms |
| Sequence benchmark @ HEAD | `npm run benchmark:omr:sequence` | No-op (no manifest/targets) |

**Không chạy:** full repository suite lần nữa (audit không sửa product code); browser E2E; camera/printer/physical device; production DB/log/telemetry; external services.

---

## 14. Risk-prioritized remediation roadmap

### Phase 0 — Khóa silent wrong score trước release tiếp theo (giữ nguyên từ audit cũ, vẫn mở ở HEAD)

1. Sửa D1 bằng component-aware merge (WIP đã làm một phần). **Fix thêm R-WIP1**: `validateAcceptedScanProvenance` phải dùng `source` resolved (sau `preserveExistingScan`), không dùng `commandSource`. Hoặc skip gate khi `preserveExistingScan` true vì row đã có scanMetadata hợp lệ.
2. Thêm invariant check trước finalize: với mixed result có answers từ B–H, key/version phải tồn tại và score recompute khớp current component data.
3. Sau fix, chạy focused Exam/mixed/manifest/scan-to-grade và một E2E tạo mixed B, scan/save essay/finalize rồi đọc Grade authoritative.

### Phase 1 — Khóa concurrency và durable barrier (WIP một phần)

1. Thêm OCC `resultVersion` + `expectedResultVersion` (WIP đã làm). Update `examResultUpsertRace.test.ts` để assert 1 winner + 4 stale 409/conflict, retry bằng explicit latest version.
2. Sửa D3 bằng `superseded` state (WIP đã làm). Verify R-WIP3 ordering/ack test: ack out-of-order, supersede không đánh nhầm entry đã `synced`.
3. Verify R-WIP2 client contract: Dexie result row + syncService payload có `resultVersion`, attachExpectedResultVersions không 409 mọi offline replacement hợp lệ.
4. Test two devices/tabs, offline replacement, reload, ack out-of-order, save-vs-complete, complete replay.

### Phase 2 — Idempotent build và provenance tối thiểu đủ dùng (WIP một phần)

1. Thêm `buildCommandId + buildRequestHash` (WIP đã làm). Update `questionBank.test.ts` fixture gồm 4 build tests + thêm regression test same key/same hash trả cùng session và same key/different hash trả 409.
2. Với source OMR/QR, server yêu cầu structured metadata `detectionStatus='accepted'`, `engineVersion`, `examVersion`, `questionCount` consistency; unknown/malformed fail 400. (WIP đã làm gate, fixture chưa update.)
3. Persist server actor/time, client capture time, fingerprint và correction diff/hash (WIP đã làm schema). Chọn retention trước khi thêm append-only attempt table; không upload image mặc định.
4. Update `examMixedScoring.test.ts` scanMetadata fixture bao gồm `examVersion`, `questionCount`, `engineVersion`.

### Phase 3 — Đưa invariant xuống đúng ownership boundary

1. Chuyển manifest lock vào service transaction cho cả answer-key và variants; thêm direct-service regression. (G5)
2. Đóng D6: hoặc ép mọi exam create qua bank, hoặc `createExamSession` cũng ghi snapshot row. Tài liệu hóa intentional nếu chọn giữ.
3. Thêm consistency health check: `manifest variant key == answerVariants`, source/content hashes parseable, snapshots đủ vị trí.
4. Đồng bộ `02_ARCHITECTURE`, API contract, Business Rules/ADR chỉ sau khi behavior mới có evidence.

### Phase 4 — Field qualification, không mở rộng architecture

1. Thu corpus ≥400 ảnh đã khử định danh theo exact production profile và run sequence 30/100 với immutable release ID/targets.
2. Chỉ bật broader continuous/unattended behavior nếu accuracy/routing/false-accept/latency/reload/memory gates đạt. Nếu không đạt, giữ supervised human-confirm.
3. Không chọn worker, adaptive threshold hoặc server vision trước khi trace thiết bị cho thấy bottleneck/root cause cụ thể.

### Phase 5 — Test coverage handoff (mới từ audit này)

1. G8: viết test EXAM_FINALIZE audit + conflict items + source-stamping `exam_scan`/`daily_avg` cho finalize path.
2. G9: viết test cho `usage`/`avoidRecentDays` bao gồm cả legacy exams và QB exams.
3. G7: viết E2E result-save commit cạnh finalize + two finalize requests + complete barrier sau app reload.

---

## 15. Những đề xuất không có evidence để làm lúc này

- Không rewrite Exam/Question Bank hoặc tách microservice.
- Không thêm event bus chỉ để xử lý Grade handoff; transaction monolith hiện đúng ownership.
- Không thay SQLite hay Dexie vì D1–D5 là command/invariant/provenance contract, không phải giới hạn engine.
- Không gom mọi write thành generic repository; fix cần nằm ở semantic boundary cụ thể.
- Không bật unattended auto-save từ benchmark synthetic.
- Không upload/lưu vĩnh viễn ảnh bài thi để "giải quyết provenance" khi structured audit data đủ và privacy cost chưa được chấp thuận.
- Không merge WIP Phase 0/1/2 mà không: (a) fix R-WIP1/2/3, (b) update test fixtures, (c) chạy focused suite + 4 probes + sequence benchmark, (d) tài liệu hóa contract mới.

---

## 16. Final verdict

**HEAD sạch (`949ba9e`):** Assessment pipeline có nền tảng kiến trúc đúng nhưng 5 defect integrity/provenance được reproduce qua probe (D1 P0, D2 P1, D3 P1, D4 P2, D5 P2) + 1 RISK structural (D6 snapshot coverage divergence). Không phải việc thiếu microservice hay thiếu DDD abstraction — là command/invariant/provenance contract chưa đầy đủ.

**HEAD+WIP (chưa commit):** WIP patch sửa đúng hướng D1–D5 nhưng chưa đủ merge-safe. 17 test fail vì fixture chưa update, R-WIP1 còn residual D1, R-WIP2 cần client-store verification, R-WIP3 cần ordering/ack test.

**OMR:** synthetic latency dưới target 150 ms nhưng không có field evidence. Fail-closed gates đúng intent (review/reject/blocked submit); detector là in-repo TypeScript với threshold/calibration có defense.

**Thứ tự ưu tiên:** D1 → R-WIP1/D2/D3 → D4/D5/R-WIP2/R-WIP3 → D6 → field qualification. Sau Phase 0–2, chạy lại audit probes dưới dạng regression mong đợi, focused suite, rồi full CI-equivalent một lần trước release.
