# IMPORT & EXPORT SPECIFICATION - PARISH LMS v2.0

Document Status: **APPROVED**  
Architecture Lead: Chief Architect & AI Pair Programming Agent  
Last Updated: 2026-08-07  

---

## 1. ARCHITECTURAL CLASSIFICATION
This document is the **Canonical Single Source of Truth (SSOT)** for all data import, Excel parsing, hash deduplication, column mapping memory, PDF generation, and HTML export operations in the Parish LMS system.

---

## 2. EXCEL IMPORT PIPELINE & PARSING LIFECYCLE

The import system processes uploaded Excel files via two dedicated, high-performance client parsers and server-side deduplication services:

```text
Excel File Upload (.xlsx / .xls)
       │
       ▼
Dedicated Parser (src/utils/excelParser.ts OR src/utils/excelGradeParser.ts)
       │
       ├── 1. Column Normalization (Vietnamese headers & Alias Resolution via mapping_memory)
       ├── 2. Row Validation & Sanitization (Date parsing, score clamping 0.0 - 10.0)
       └── 3. Empty-Cell Preservation (Empty score cells preserve existing DB values)
       │
       ▼
Import Processing Route (server/src/routes/import.ts)
       │
       ├── 1. Duplicate Hash Check (grade_import_hashes table lookup)
       ├── 2. Batch Transaction Execution (import_batches & import_batch_students tracking)
        └── 3. Class Alias Memory Retention (mapping_memory auto-save)
```

---

## 3. STUDENT ROSTER IMPORT SPECIFICATION (`excelParser.ts`)

- **Supported Columns**:
  - `Mã số` / `Mã học sinh` (`code`)
  - `Tên thánh` (`holyName`)
  - `Họ và tên` / `Họ tên` (`fullName`)
  - `Phái` / `Giới tính` (`gender`: 'Nam' | 'Nữ')
  - `Ngày sinh` (`dateOfBirth`: DD/MM/YYYY or YYYY-MM-DD)
  - `Tên cha mẹ` / `Phụ huynh` (`parentName`)
  - `Số điện thoại` (`parentPhone`)
  - `Địa chỉ` (`address`)
  - `Lớp` / `Tên lớp` (`classId` resolution)
- **Cell Preservation Guarantee**:
  - Empty student fields do NOT overwrite existing non-null database fields during re-import updates.

---

## 4. GRADE SHEET IMPORT SPECIFICATION (`excelGradeParser.ts` & `excelImporter.ts`)

- **Smart Column Detection & Alias Resolution (`detectGradeColumns`)**:
  - Uses scoring-based keyword matching (Exact match = 100, Header-contains-keyword = 80+, Keyword-contains-header abbreviation = 70+). Single-char exact-match guards (`m` → Miệng, `h` → Họ, `t` → Tên) are retained at low priority; any keyword ≤2 characters (`gk`, `ck`, `1t`, `15p`, `dd`...) only ever matches **exactly** to prevent false positives (e.g., `TB` can no longer alias `scoreMidterm`). Priority-2 fields (`lastName`, `firstName`) receive a −5 score penalty so `fullName`/`holyName` win when ambiguous.
  - **Supported Grade Fields & Aliases**:
    - `scoreOral`: `Miệng`, `KT Miệng`, `Điểm Miệng`, `Oral`, `M` (exact match)
    - `score15m`: `15 Phút`, `15P`, `KT 15P`, `15 minutes`
    - `score1Period`: `1 Tiết`, `1T`, `KT 1 Tiết`, `Viết`, `1 Period`
    - `scoreMidterm`: `Giữa Kỳ`, `GK`, `Giữa HK`, `Midterm` (Note: `TB`/`T.B` excluded to prevent computed average collision)
    - `scoreFinal`: `Cuối Kỳ`, `CK`, `Thi Cuối Kỳ`, `Final`, `Điểm Thi`
    - `scoreDaoDuc`: `Đạo Đức`, `ĐĐ`, `DD`, `Đạo Đ`, `Hạnh Kiểm`, `Đức` (Note: `HK` excluded due to Học Kỳ ambiguity)
    - `comments`: `Nhận xét`, `Ghi chú`, `Note`, `Lưu ý`, `Comments`
- **Token-Boundary Ignored Columns (`isIgnoredColumn`)**:
  - Exact token matching ignores computed/metadata headers: `ĐTB`, `Điểm Trung Bình`, `Trung Bình`, `TB`, `T.B`, `T.B - Cả n`, `Avg`, `Xếp Loại`, `Rank`, `STT`, `Số Thứ Tự`, `Giới Tính`, `Ngày Sinh`, `Năm Sinh`. Token-boundary means `TB 15 Phút` is NOT ignored — only exact header equality matches. Prevents computed averages from overwriting raw score slots while keeping valid composite headers (`1 Tiết`, `15 Phút`...) mapped.
- **Smart Header Detection & Fallback**:
  - Scans initial 10 rows for optimal header row (a row qualifies when it has ≥1 name field + ≥1 score field, or ≥3 score fields, or ≥2 name fields); the highest-confidence candidate wins and becomes `headerRowIndex`.
  - Falls back to data-based numerical inference (numbers 0-10 in ≥60% cells) with low-confidence diagnostic warnings.
  - **STT-like columns excluded from inference**: sequential integer columns (1,2,3... or 0,1,2...) are never mapped to score fields (prevents STT values from being written as Điểm Miệng).
  - **Inference confirmation gate**: when columns are inferred (no header row found), the import UI shows a prominent warning and `window.confirm` before saving — no silent auto-import.
- **Unified Score Parsing (`parseScore` in `excelImporter.ts`)**:
  - Single shared implementation (the duplicated copy in `excelGradeParser.ts` was removed). Returns `{ value, error?, warning? }`.
  - Empty / `-` / `—` → `null` (preserves existing DB values); numbers are parsed with Vietnamese comma decimals (`8,5` → `8.5`), rounded to 1 decimal, and clamped to 0–10; invalid text produces an `error` (row rejected).
- **Special Cell Values & Warning Collection**:
  - Values like `V` (Vắng), `X` (Không xếp loại), `KXL`, `Đ` (Đạt), `KĐ` are parsed as `null` with explicit per-row warnings (rendered per-cell in the import UI), preserving existing DB values without triggering invalid row errors.
- **Diagnostics & UI Feedback**:
  - `detectGradeColumns` returns `{ colMap, detections, ignoredColumns, unmappedColumns }`; `parseGradeFile` returns `{ rows, diagnostics }` (no more throw-on-first-error).
  - The import modal renders a column-mapping summary panel, ignored/unmapped column chips, and a warning banner for rows with special values or skipped columns — errors no longer crash the modal (defensive `detectedColumns || []`).
- **Cell Preservation Rules**:
  - **Scores**: Empty score cells in Excel preserve existing score values in local Dexie & SQLite DB (`buildGradeRecords` in `excelImporter.ts`).
  - **Comments**: Non-empty comments cells overwrite; empty/absent comments cells preserve existing notes.
- **Student Matching**:
  - **Primary (name-based)**: `matchStudentWithConfidence` matches by `holyName` + `fullName` — exact match after normalization, or token-overlap/Levenshtein similarity ≥ 90%.
  - **Fallback (Mã số)**: when the name pass finds no candidate, an **exact `code` match** (trimmed, case-insensitive) against the selected class's students is accepted at confidence 100 (`✓ Khớp Mã số chính xác`); rows matched this way carry a visible `Khớp theo Mã số (không khớp theo tên)` warning. Covers files with Mã số but no/typo name columns.
  - **Never matched**: students outside the selected class, or rows with neither a matching name nor Mã số. Date of Birth matching remains disabled.
  - **Detailed failure diagnostics (`explainMatchFailure`)**: when a row cannot be matched, the parser no longer emits the generic `Không tìm thấy học sinh`. It returns a specific reason so the user knows exactly what to fix:
    - **Empty class**: `Lớp hiện tại chưa có học sinh nào — vui lòng kiểm tra danh sách lớp trước khi import điểm`
    - **Missing name column** (no Họ Tên / Tên Thánh detected): `Không tìm thấy cột tên học sinh (Họ và Tên / Tên Thánh) — kiểm tra header file có đúng tên cột không`
    - **Name mismatch with closest candidate**: reports the nearest student and similarity score — `Không tìm thấy học sinh "X" — học sinh gần nhất là "Y" (độ tương đồng 75%, cần ≥ 90%). Kiểm tra chính tả, tên đệm, hoặc tên thánh trong file`
    - **Code present but name mismatch**: reminds the user matching is name-based — `Không tìm thấy học sinh "X" — lưu ý: hệ thống chỉ khớp theo Tên Thánh + Họ Tên (không dùng Mã TN). Kiểm tra tên trong file có khớp chính xác với danh sách lớp không`
    - **Generic fallback**: `Không tìm thấy học sinh "X" trong lớp hiện tại — kiểm tra học sinh đã được thêm vào lớp chưa`
  - Both import paths (file upload via `parseGradeFile`, paste via `parseGradeText`) surface these reasons in the per-row `errors`/`warnings` rendered in the import preview table.
- **Source Tracking**:
  - Imported scores receive `_source = 'excel_import'` and timestamp tracking (`scoreOralSource`, `scoreOralUpdatedAt`, etc.) stored in DB columns.

---

## 5. DUPLICATE IMPORT DETECTION & HASHING (`grade_import_hashes`)

- Unique Constraint: `UNIQUE(hash, class_id, semester, academic_year, parish_id)` on `grade_import_hashes`.
- If an identical file content hash is re-uploaded for the same class, semester, and academic year, the system flags a duplicate warning payload while preventing accidental double-processing.

---

## 6. EXPORT PIPELINE SPECIFICATION

### 6.1 PDF Report Card Generation (`src/utils/pdfGenerator.ts`)
- Generates individual student report cards containing:
  - Full Academic Breakdown (`scoreOral`, `score15m`, `score1Period`, `scoreMidterm`, `scoreFinal`, `scoreDaoDuc`, Computed Semester GPA).
  - Attendance Summary (% Mass attendance & % Catechism attendance).
  - Promotion Decision (`PROMOTED`, `RETAINED`, etc.).

### 6.2 Excel Gradebook Export (`src/utils/excelExporter.ts`)
- Exports full class gradebooks with subject column headers, student metadata, computed averages, and attendance summaries.

### 6.3 Class Summary HTML Print View
- Renders printable HTML views adhering to standard A4 page layout guidelines with exact parish branding tokens.

---

## 7. EXAM QUESTION IMPORT SPECIFICATION (`examParser.ts`) — EXAM-MIXED (ADR-053, 2026-08-24)

Import đề thi (trắc nghiệm, tự luận hoặc KẾT HỢP) chạy 100% client-side/offline; kết quả đi vào `POST /api/exams` như một phiên chấm.

### 7.1 Văn bản / Word / Markdown paste
- Tiêu đề phần chuyển mode phân tích: `PHẦN I. TRẮC NGHIỆM` → câu TN; `PHẦN II. TỰ LUẬN` → câu TL. Chấp nhận: prefix `Phần/Part/Phần số La Mã/số Ả Rập`, nhãn ngắn ≤40 ký tự chứa từ khóa (`trắc nghiệm`, `TN`, `tự luận`, `TL`, `essay`). Không có tiêu đề phần → toàn bộ là TN (tương thích ngược).
- Câu TN giữ nguyên quy tắc §21.1 BUSINESS_RULES (A–D, đáp án inline/bảng cuối đề). Câu TL: toàn bộ khối là nội dung; KHÔNG parse A–D; không có key.
- Điểm: `(3 điểm)` / `(0,5 đ)` trên dòng câu hỏi hoặc trong nội dung được trích làm `points` và gỡ khỏi text hiển thị; điểm khai báo ở TIÊU ĐỀ PHẦN được chia đều cho các câu chưa có điểm riêng của phần đó (warning kèm theo). Regex mở đầu câu chấp nhận chú thích điểm xen giữa: `Câu 4 (5 điểm): ...`.
- Kết quả trả thêm thống kê: `mcQuestionCount`, `essayQuestionCount`, `mcPoints`, `essayPoints`, `totalPoints`; `answerKey` CHỈ chứa câu TN.
- Giới hạn tổng 50 câu (khớp server + OMR).

### 7.2 Excel (.xlsx/.xls/.csv)
- Layout cũ 7 cột `[Câu, Nội dung, A, B, C, D, Đáp án]`: import bình thường, toàn bộ là TN.
- Layout mở rộng: parser map cột THEO TÊN HEADER (`Câu/Nội dung/Lựa chọn A–D/Đáp án/Loại/Điểm`) nên thứ tự cột linh hoạt. Ô `Loại`: `TL/Tự luận/Essay` → essay; còn lại/mặc định → TN. Ô `Điểm`: số thập phân (>0); thiếu → default 1đ khi tính điểm.
- File mẫu 9 cột tải về từ modal import gồm cả dòng TL minh họa.

### 7.3 Round-trip export
- `generateExamExcelWorkbook` xuất sheet `Danh_Sach_Cau_Hoi` 10 cột `[Câu Số, Loại, Nội Dung, A, B, C, D, Đáp Án, Điểm, Giải Thích]` — file xuất ra có thể import lại trực tiếp.
- Word/Text/Markdown/PDF: câu TL in không kèm A–D, có chú thích điểm; bảng đáp án chỉ liệt kê câu TN + danh sách câu TL chấm tay.

### 7.4 Ràng buộc dữ liệu khi tạo phiên mixed
- `questionCount` = số câu TN (phiếu OMR bubble 1..N); các câu TN phải chiếm index 1..questionCount LIÊN TỤC từ đầu đề; ≥1 câu TL bắt buộc; server reject nếu vi phạm hoặc thiếu `questions`/`answerKey`. Chi tiết hợp đồng điểm xem BUSINESS_RULES §21.5.

### 7.5 Import theo phần — 2 ô riêng TN / TL (UI-POLISH 2026-08-25)
- Modal "Tạo Phiên Chấm" có **2 ô import độc lập**: "Phần Trắc Nghiệm" và "Phần Tự Luận" (mỗi ô mở `ExamImportModal` với prop `scope = 'multiple_choice' | 'essay'`; vẫn còn đường import đề gộp qua scope `'both'` nếu cần tái sử dụng).
- `scopeExamParseResult()` (`examParser.ts`) lọc kết quả parse theo scope: phần không thuộc scope bị **bỏ qua kèm warning**; phần giữ lại được **đánh lại index 1..N** và `answerKey` rebuild theo index mới (khóa OMR không được lệch). Không có câu nào khớp scope → `ok=false` + lỗi hướng dẫn, chặn nút "Áp Dụng".
- Ghép 2 phần ở `ExamSessionView.mergeExamParts()`: TN index 1..N + TL tiếp N+1..N+M — khớp ràng buộc §7.4. examType tự suy: chỉ TN → `multiple_choice`; có TL → `mixed` (thiếu phần TN khi submit bị chặn với thông báo rõ). Mẫu "Dán Đề Mẫu" sinh theo scope.
