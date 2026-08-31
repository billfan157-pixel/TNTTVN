# Database Schema Specification & Plan

> Canonical Single Source of Truth (SSOT) for all 49 SQLite production tables managed via Drizzle ORM.
> Version: 2.7 | Last reviewed: 2026-08-31 | Status: ✅ Current | Prerequisites: 02

---

## All Production Tables (49)

| # | Table Name | Purpose | Unique Indexes / Constraints |
|---|------------|---------|------------------------------|
| 1 | `users` | User accounts, auth status, roles, token version, bcrypt `password_hash`, `holy_name`. `password_encrypted` là cột legacy deprecated, bắt buộc `NULL`; migration `20260827-131` purge ciphertext (ADR-058) | `(parish_id, username)` UNIQUE (`idx_users_username_parish` — ADR-046, migration `20260816-121` thay `users_username_unique` global), `idx_users_parish_id` |
| 2 | `students` | Student roster (soft-deletable) | `(parish_id, code)` UNIQUE (`idx_students_code_parish`), `idempotency_key` (UNIQUE) |
| 3 | `grades` | Academic scores per semester | `idx_grades_lookup` `(parish_id, student_id, academic_year, semester)` UNIQUE |
| 4 | `attendance` | Mass & Catechism attendance events | `idx_attendance_unique` `(parish_id, student_id, date, type)` UNIQUE |
| 5 | `notices` | Parish announcements | `idx_notices_date` |
| 6 | `audit_logs` | Audit trail with IP & user agent | `idx_audit_logs_entity` |
| 7 | `branches` | TNTT branch definitions | `(parish_id, id)` PK ('CC', 'AU', 'TN', 'NS', 'HS') |
| 8 | `academic_years` | School year config + lifecycle state machine (`status`, `current_semester`, `is_locked`) | `(parish_id, id)` PK ('2025 - 2026') |
| 9 | `classes` | Catechism classes linked to branch + year | `idx_classes_code_year` UNIQUE |
| 10 | `system_settings` | App configuration key-value store | `(key, parish_id)` PK — gồm key `purge_version` (marker đa thiết bị, Purge v2.3) |
| 11 | `catechist_assignments` | User ↔ class mapping with role | `idx_catechist_assignments_unique` `(user_id, class_id)` UNIQUE |
| 12 | `notifications` | Persistent notification history — thêm `target_user_ids` (JSON array userId, migration `20260808-082`): web push CÓ CHỦ ĐÍCH (phụ huynh theo chi đoàn), queue recover sau restart gửi lại đúng nhóm, không broadcast nhầm (ADR-022) | `idx_notifications_lookup` |
| 13 | `permissions` | RBAC permission definitions | `id` PK |
| 14 | `role_permissions` | Role ↔ permission mapping | `idx_role_permissions_pk` `(role, permission_id)` UNIQUE |
| 15 | `import_batches` | Student roster import batch; `created_class_ids` JSON exact IDs phục vụ undo an toàn (migration `20260828-132`); status `processing/completed/partial/failed/undone/partial_undone` | `id` PK |
| 16 | `import_batch_students` | Itemized row status + `rollback_snapshot` nullable, gắn đúng batch và xóa sau cửa sổ 24h (migration `20260828-133`); bắt buộc `parish_id` explicit | `batch_id` FK |
| 17 | `grade_import_hashes` | Content hash deduplication for grade sheets | `idx_grade_import_hashes_unique` UNIQUE |
| 18 | `push_subscriptions` | Web push notification endpoints | `endpoint` UNIQUE |
| 19 | `service_assignments` | Parish service roles (Lễ Phục Vụ) | `idx_service_assignments_unique` UNIQUE |
| 20 | `mapping_memory` | Alias resolution memory for imports | `idx_mapping_memory_unique` UNIQUE |
| 21 | `grade_overrides` | Audited manual grade override records — `parish_id` (P4, migration `20260808-096`) | `idx_grade_overrides_lookup` `(grade_id, score_field)`, `idx_grade_overrides_parish` `(parish_id)` |
| 22 | `outbox_messages` | Integration event outbox queue — `parish_id` (P4, migration `20260808-097`) | `idx_outbox_messages_status` `(status, created_at)`, `idx_outbox_messages_parish` `(parish_id, status)` |
| 23 | `semester_locks` | Operational semester lock state | `idx_semester_locks_unique` `(parish_id, academic_year, semester)` UNIQUE |
| 24 | `promotion_records` | Immutable promotion decision snapshots | `idx_promotion_records_unique` `(parish_id, student_id, academic_year, version)` UNIQUE |
| 25 | `attendance_sessions` | Class-level attendance session state | `idx_attendance_sessions_unique` UNIQUE |
| 26 | `assessments` | Class assessment definitions & weights | `idx_assessments_lookup` |
| 27 | `academic_year_snapshots` | Per-student frozen finalize snapshot (GPA, xếp loại, chuyên cần, decision) | `idx_academic_year_snapshots_student` `(parish_id, student_id, academic_year_id)` UNIQUE |
| 28 | `refresh_tokens` | JWT refresh rotation sessions (chỉ lưu sha256 hash — không plaintext) | `token_hash` UNIQUE, `idx_refresh_tokens_parish_id`, `idx_refresh_tokens_user_id` |
| 29 | `exam_sessions` | Smart Exam Grading session; `exam_type` ∈ `written\|multiple_choice\|mixed` (EXAM-MIXED, ADR-053 — mixed: đề TN + TL, `question_count` = số câu TN); `answer_key` là key legacy/mã A, `answer_variants` nullable JSON map A–H (ADR-050); `questions` JSON ngân hàng câu hỏi (`type`/`points` per câu); idempotency key NOT NULL | migrations cũ + `20260818-124` (`answer_variants`) + `20260815-119` (`questions`); indexes giữ nguyên |
| 30 | `exam_results` | Per-student score; `essay_score` REAL nullable = điểm phần tự luận nhập tay (mixed; `score` = điểm TN tự chấm + essay_score — migration `20260824-129`); `answers`, `scan_metadata` aggregate không ảnh, `exam_version` A–H default A. MC scan được server tính lại bằng key theo version | migrations cũ + `20260818-123` (`scan_metadata`) + `20260818-125` (`exam_version`) + `20260824-129` (`essay_score`); unique `(exam_session_id, student_id)`, lookup tenant/session |
| 31 | `telegram_link_tokens` | One-time link tokens (sha256 hash) để bind tài khoản Telegram với user (`token_hash` — không plaintext), có expiry/consumed | `token_hash` UNIQUE, PK `(parish_id, id)`, `idx_telegram_link_tokens_user` `(parish_id, user_id)`, `idx_telegram_link_tokens_expiry` |
| 32 | `telegram_links` | Chat liên kết Telegram ↔ user (trạng thái `ACTIVE`/`REVOKED`, bật/tắt thông báo, last_seen) | `chat_id` UNIQUE, PK `(parish_id, id)`, `idx_telegram_links_user` `(parish_id, user_id, status)`, `idx_telegram_links_chat_status` `(chat_id, status)` |
| 33 | `exam_result_mutations` | Durable idempotency receipt cho từng mutation kết quả quét liên tiếp; lưu request hash + response acknowledgement, không lưu ảnh (ADR-067, migration `20260828-135`) | PK `(parish_id, user_id, client_mutation_id)`, `idx_exam_result_mutations_session` `(parish_id, exam_session_id, created_at)`; FK cascade session, restrict student |
| 34 | `assessment_entries` | Server assessment ledger lưu attempt sinh grade projection | PK `(parish_id,id)`, `idx_assessment_entries_exam_student` UNIQUE, `idx_assessment_entries_lookup` |
| 35 | `exam_finalizations` | Receipt finalize mỗi exam session | PK `(parish_id,id)`, `idx_exam_finalizations_session` UNIQUE |
| 36 | `exam_finalization_items` | Itemized committed/conflict rows của finalization | PK `(parish_id,id)`, `idx_exam_finalization_items_result` UNIQUE, lookup index |
| 37 | `leave_requests` | Đơn xin nghỉ theo student/class và quy trình duyệt | PK `(parish_id,id)`, parish/class/student/date/status indexes |
| 38 | `funds` | Quỹ thu chi theo giáo xứ | PK `(parish_id,id)`, `(parish_id,code)` UNIQUE |
| 39 | `financial_transactions` | Giao dịch thu/chi/chuyển quỹ | PK `(parish_id,id)`, fund/date/academic/class indexes |
| 40 | `student_fee_records` | Nghĩa vụ và trạng thái đóng phí theo học sinh/năm | PK `(parish_id,id)`, `(parish_id,student_id,academic_year,fee_type)` UNIQUE |
| 41 | `parish_events` | Lịch sự kiện giáo xứ persisted (soft delete) | PK `(parish_id,id)`, parish/date và parish/category indexes |
| 42 | `parish_profiles` | Identity, ngày thành lập, bổn mạng, khẩu hiệu và giới thiệu Xứ đoàn | PK `parish_id` |
| 43 | `parish_people` | Identity tổ chức duy nhất cho người đang/từng phục vụ; có thể liên kết một tài khoản đăng nhập | PK `(parish_id,id)`; partial UNIQUE `(parish_id,linked_user_id)` khi active; name/status indexes |
| 44 | `parish_organization_units` | Ban Trị Sự, ban, ngành, chi đoàn và cây tổ chức | PK `(parish_id,id)`; parent/type indexes; cycle chặn tại service |
| 45 | `parish_service_terms` | Chức vụ, cấp bậc và nhiệm kỳ của một người trong một đơn vị | PK `(parish_id,id)`; person/unit/date indexes; tenant composite FKs |
| 46 | `parish_records` | Cột mốc, hoạt động và thành tích có draft/publication/timeline state | PK `(parish_id,id)`; type/timeline indexes |
| 47 | `parish_record_people` | Quan hệ nhiều-nhiều record ↔ person | PK `(parish_id,record_id,person_id)`; composite tenant FKs |
| 48 | `parish_archive_assets` | Metadata tư liệu upload riêng tư hoặc external HTTPS | PK `(parish_id,id)`; type/storage indexes; storage XOR constraint |
| 49 | `parish_record_assets` | Quan hệ nhiều-nhiều record ↔ asset | PK `(parish_id,record_id,asset_id)`; composite tenant FKs |

---

## Key Drizzle Schema Definitions (`server/src/db/schema.ts`)

### `semester_locks`
| Column | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `id` | TEXT PK | | Primary Key |
| `parish_id` | TEXT | `'gia-ton'` | Multi-tenancy isolation |
| `academic_year` | TEXT | | e.g. `'2025 - 2026'` |
| `semester` | INTEGER | | 1 or 2 |
| `is_locked` | INTEGER | 0 | 1 = Lock operational edits |
| `locked_by` / `locked_at` | TEXT | NULL | Admin audit info |
| `unlockReason` | TEXT | NULL | Audit justification |
| `unlocked_by` / `unlocked_at` | TEXT | NULL | Admin unlock audit info (schema.ts:545-546) |

### `promotion_records`
| Column | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `id` | TEXT PK | | `PRM-` prefix |
| `student_id` | TEXT | | FK → `students.id` |
| `academic_year` | TEXT | | e.g. `'2025 - 2026'` |
| `auto_decision` | TEXT | | `PROMOTED`, `RETAINED`, `GRADUATED`, etc. |
| `final_decision` | TEXT | | Overridden or auto decision |
| `gpa_snapshot` | REAL | | Immutable GPA at approval time |
| `attendance_snapshot` | REAL | | Immutable attendance rate snapshot |
| `rules_version` | TEXT | `'v1.0'` | Evaluation rules version |
| `status` | TEXT | `'ACTIVE'` | `'ACTIVE'` or `'SUPERSEDED'` |
| `version` | INTEGER | 1 | Increments on re-evaluations |

### `academic_years` — lifecycle columns (migrations 067–070)
| Column | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `is_locked` | INTEGER | 0 | 1 = year closed (finalize) |
| `status` | TEXT | `'OPEN'` | State machine: `OPEN`, `SEMESTER_1_LOCKED`, `SEMESTER_2_OPEN`, `SEMESTER_2_LOCKED`, `FINALIZED`, `PROMOTED`, `ARCHIVED` |
| `current_semester` | INTEGER | 1 | 1 = HK1, 2 = HK2 (set by start-semester-2) |

### `academic_year_snapshots` (migration 071)
| Column | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `id` | TEXT PK | | `SNA-` prefix |
| `parish_id` | TEXT | | Multi-tenancy isolation |
| `academic_year_id` | TEXT | | FK → `academic_years.id` |
| `student_id` | TEXT | | FK → `students.id` |
| `semester1_gpa` / `semester2_gpa` | REAL | NULL | Weighted GPA per semester |
| `year_gpa` | REAL | NULL | `round((gpa1+gpa2)/2, roundingDecimal)` |
| `classification` | TEXT | NULL | `Xuất Sắc` … `Yếu` (thresholds from settings) |
| `attendance_rate` | REAL | | Chuyên cần % (policy `excusedWeight`) |
| `promotion_status` | TEXT | | `PROMOTED`, `RETAINED`, `GRADUATED`, `TRANSFERRED`, `CONDITIONALLY_PROMOTED` |
| `generated_by` / `generated_at` | TEXT | | Finalize actor + timestamp |
| Unique | | | `(parish_id, student_id, academic_year_id)` — upsert on re-finalize |

### `refresh_tokens` (migration 080 — JWT refresh rotation, ADR S1)
| Column | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `id` | TEXT PK | | `rts-` prefix (UUID) |
| `user_id` | TEXT | | FK → `users.id` (ON DELETE CASCADE) |
| `parish_id` | TEXT | | Multi-tenancy isolation |
| `token_hash` | TEXT | | sha256 hash của refresh token — **KHÔNG lưu plaintext**, UNIQUE |
| `expires_at` | TEXT | | 7 ngày (`REFRESH_TTL_MS`) |
| `revoked_at` | TEXT | NULL | Set khi rotate/logout (reuse nếu còn được gửi → đánh cắp) |
| `replaced_by` | TEXT | NULL | id session mới (rotation chain — dùng debug) |
| `created_at` | TEXT | | |

### `exam_result_mutations` (migration `20260828-135`, ADR-067)

| Column | Type | Notes |
| :--- | :--- | :--- |
| `client_mutation_id` | TEXT | ID ổn định do client sinh và giữ nguyên qua retry |
| `parish_id` / `user_id` | TEXT | Scope tenant + actor; cùng key ở user/parish khác không va chạm |
| `exam_session_id` / `student_id` | TEXT | FK tới result target; session delete cascade receipt |
| `request_hash` | TEXT | SHA-256 business payload; key reuse khác hash bị từ chối 409 |
| `response_json` | TEXT | Item acknowledgement gốc để retry trả lại không rewrite/audit lại |
| `created_at` | TEXT | Phục vụ tra soát và session index |
| Primary key | | `(parish_id, user_id, client_mutation_id)` |

### `users` — cột `holy_name` (migration `20260812-104`, ADR-027)
| Column | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `holy_name` | TEXT | NULL | Tên Thánh của tài khoản (bắt buộc khi tự sinh username GLV/CN/admin — chỉ hiển thị, không dùng xác thực) |

---

## Purge v2.3 — `purge_version` marker (ghost-data prevention)

- Key `purge_version` trong bảng `system_settings` (value = số nguyên, mặc định `1`, tăng +1 mỗi lần purge).
- Mọi client lưu `purge_version` local (localStorage `parish_purge_version`); mỗi chu kỳ sync, `GET /api/system/purge-version` được gọi trước pull delta.
- Nếu server version > local version → dữ liệu offline của thiết bị là **GHOST DATA** (đã bị xóa trên server) → client tự xóa sạch Dexie + localStorage + đăng xuất, không bao giờ push lại queue cũ.
- Purge **không DROP bảng** — chỉ `DELETE rows` của 24 bảng trong hợp đồng `PURGE_TABLES`. `exam_result_mutations` được xóa trước `exam_results`/`exam_sessions`; mọi bảng trong danh sách đều có `parish_id`.
- Trước khi xóa: snapshot v3.0 (24 bảng, SHA256 checksum) ghi tại `server/data/backups/safety/purge-safety-<parish>-<ts>.json` (mặc định; override bằng env `SAFETY_BACKUP_DIR` — xem `server/src/utils/safetyDir.ts` và `docs/DEPLOYMENT_GUIDE.md` §3).

---

## Foreign Key Cascade Policies

- `students.class_id` $\rightarrow$ `classes.id` (`onDelete: 'restrict'`)
- `attendance.student_id` $\rightarrow$ `students.id` (`onDelete: 'restrict'`)
- `role_permissions.permission_id` $\rightarrow$ `permissions.id` (`onDelete: 'cascade'`)
- `import_batch_students.batch_id` $\rightarrow$ `import_batches.id` (`onDelete: 'cascade'`)
- `grade_overrides.grade_id` $\rightarrow$ `grades.id` (`onDelete: 'cascade'`)
