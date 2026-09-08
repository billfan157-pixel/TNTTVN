# Database Schema Specification & Plan

> Canonical Single Source of Truth (SSOT) for all 71 SQLite production tables managed by the database bootstrap, migration runner and Drizzle mappings.
> Version: 3.3 | Last reviewed: 2026-09-08 | Status: ✅ Current | Prerequisites: 02

---

## All Production Tables (71)

**Recovery readiness (XD-09, 2026-09-07):** startup/restore readiness requires migration markers `20260907-177..181` and the promotion completion / academic policy / cohort / report columns. The isolated restore-target preparation applies the real schema, verifies and removes only the four known freshly created default-fund seeds, and rejects any other application data. Logical restore requires an exact table set and column sequence, then verifies row contents as well as counts and foreign keys. A post-commit mismatch invalidates the target; discard it, do not cut over. Schema readiness does not certify the evidence content of legacy rows or authorize a backfill.

**Historical academic evidence (XD-02/03):** migrations `20260907-179..181` add nullable `academic_years.finalization_policy` (versioned JSON with concrete policy inputs, dates and original class labels), `academic_year_snapshots.source_class_id`, and `academic_year_snapshots.report_snapshot` (versioned effective semester scores and attendance summary, no copied personal profile). Finalize writes these atomically with the year lock. NULL is legacy/unknown, never a backfill from current settings/membership. Readers validate the JSON version/shape and fail closed where required evidence is missing. These additive migrations require no destructive recovery; roll back application deployment without dropping evidence columns. Restore/cutover must preserve them; existing full-DB compatibility gates still apply.

**Read-only reconciliation (XD-02/03/08):** `npm run audit:cross-domain-reconciliation` checks protected years for missing policy/snapshot/cohort evidence and compares daily-derived Grade projections with the full assessment ledger while excluding active manual overrides. It first requires the current evidence columns, opens a read transaction, emits only hashed aggregate references/counts/reason codes by default, and never backfills or changes scores. Use `AUDIT_DATABASE_URL`/`AUDIT_DATABASE_AUTH_TOKEN` for an explicit target; findings require operator review rather than automatic repair.

| # | Table Name | Purpose | Unique Indexes / Constraints |
|---|------------|---------|------------------------------|
| 1 | `users` | User accounts, auth status, roles, token version, bcrypt `password_hash`, `holy_name`; `deleted_at` soft-delete account (migration `20260901-147`, ADR-089). `password_encrypted` là cột legacy deprecated, bắt buộc `NULL`; migration `20260827-131` purge ciphertext (ADR-058) | `(parish_id, username)` UNIQUE (`idx_users_username_parish` — ADR-046), `idx_users_parish_id`, `idx_users_active_role(parish_id,role,deleted_at)` |
| 2 | `students` | Student roster (soft-deletable) | `(parish_id, code)` UNIQUE (`idx_students_code_parish`), `idempotency_key` (UNIQUE) |
| 3 | `grades` | Academic scores per semester | `idx_grades_lookup` `(parish_id, student_id, academic_year, semester)` UNIQUE |
| 4 | `attendance` | Mass & Catechism attendance events | `idx_attendance_unique` `(parish_id, student_id, date, type)` UNIQUE |
| 5 | `notices` | Parish announcements; `deleted_at` tombstone và `parent_revoked_at` visibility-revocation cursor (ADR-101) | `idx_notices_date`, `(parish_id,id)` PK |
| 6 | `audit_logs` | Audit trail with IP & user agent | `idx_audit_logs_entity` |
| 7 | `branches` | TNTT branch definitions | `(parish_id, id)` PK ('CC', 'AU', 'TN', 'NS', 'HS') |
| 8 | `academic_years` | School year config + lifecycle state machine (`status`, `current_semester`, `is_locked`) | `(parish_id, id)` PK ('2025 - 2026') |
| 9 | `classes` | Catechism classes linked to branch + year | `idx_classes_code_year` UNIQUE |
| 10 | `system_settings` | App configuration key-value store | `(key, parish_id)` PK — gồm key `purge_version` (marker đa thiết bị, Purge v2.4) |
| 11 | `catechist_assignments` | User ↔ class mapping with role | composite pair UNIQUE + partial UNIQUE `(parish_id,class_id)` and `(parish_id,user_id)` where `role_in_class='chunhiem'` |
| 12 | `notifications` | Durable notification queue/history: audience JSON `target_user_ids`; persisted delivery kind, attempt budget, lease và next-attempt time (ADR-102) | `idx_notifications_lookup`, `idx_notifications_worker(status,next_attempt_at,lease_expires_at)` |
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
| 29 | `exam_sessions` | Smart Exam Grading session; `exam_type` ∈ `written\|multiple_choice\|mixed` (EXAM-MIXED, ADR-053 — mixed: đề TN + TL, `question_count` = số câu TN); `answer_key` là key legacy/mã A, `answer_variants` nullable JSON map A–H (ADR-050); `questions` JSON ngân hàng câu hỏi (`type`/`points` per câu); `variant_manifests` nullable immutable JSON set gồm materialized questions/order/options/answer keys/hash/seed (ADR-094); idempotency key NOT NULL | migrations cũ + `20260818-124` (`answer_variants`) + `20260815-119` (`questions`) + `20260901-148` (`variant_manifests`); schema readiness bắt buộc cột mới, indexes giữ nguyên |
| 30 | `exam_results` | Per-student score; `essay_score` REAL nullable = điểm phần tự luận nhập tay (mixed; `score` = điểm TN tự chấm + essay_score — migration `20260824-129`); `answers`, `scan_metadata` aggregate không ảnh, `exam_version` A–H default A. MC scan được server tính lại bằng key theo version | migrations cũ + `20260818-123` (`scan_metadata`) + `20260818-125` (`exam_version`) + `20260824-129` (`essay_score`); unique `(exam_session_id, student_id)`, lookup tenant/session |
| 31 | `telegram_link_tokens` | **Legacy retained (ADR-111):** token hash lịch sử; migration `20260908-235` consume mọi token còn mở, runtime không tạo token mới | `token_hash` UNIQUE, PK `(parish_id, id)`, `idx_telegram_link_tokens_user` `(parish_id, user_id)`, `idx_telegram_link_tokens_expiry` |
| 32 | `telegram_links` | **Legacy retained (ADR-111):** liên kết lịch sử; migration/startup revoke mọi link active/enabled, runtime không đọc để delivery | `chat_id` UNIQUE, PK `(parish_id, id)`, `idx_telegram_links_user` `(parish_id, user_id, status)`, `idx_telegram_links_chat_status` `(chat_id, status)` |
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
| 45 | `parish_service_terms` | Chức vụ, cấp bậc và nhiệm kỳ; `position_title` là nhãn, `position_code` mới là Operations authority có kiểm tra loại unit | PK `(parish_id,id)`; person/unit/date indexes; tenant composite FKs; position-code/unit triggers |
| 46 | `parish_records` | Cột mốc, hoạt động và thành tích có draft/publication/timeline state; `source_event_id` là soft/nonunique history link, không phải Operations ownership key | PK `(parish_id,id)`; type/timeline indexes |
| 47 | `parish_record_people` | Quan hệ nhiều-nhiều record ↔ person | PK `(parish_id,record_id,person_id)`; composite tenant FKs |
| 48 | `parish_archive_assets` | Metadata tư liệu upload riêng tư hoặc external HTTPS | PK `(parish_id,id)`; type/storage indexes; storage XOR constraint |
| 49 | `parish_record_assets` | Quan hệ nhiều-nhiều record ↔ asset | PK `(parish_id,record_id,asset_id)`; composite tenant FKs |
| 50 | `feedback_messages` | Thư góp ý gửi Xứ đoàn/GLV chủ nhiệm; anonymous không giữ sender identity | PK `(parish_id,id)`; sender/target CHECK; `idx_feedback_inbox`, `idx_feedback_public_sender` |
| 51 | `password_reset_requests` | Ticket quên mật khẩu hiện tại của mỗi tài khoản phụ huynh; không lưu SĐT tự khai hay credential | PK `(parish_id,id)`; UNIQUE `(parish_id,user_id)`; inbox index `(parish_id,status,last_requested_at)`; composite FKs tới `users`; resolution/count CHECK |
| 52 | `native_push_tokens` | Binding push token native theo installation/user/parish; token chỉ dùng để giao vận, không ghi audit/client storage (ADR-095) | PK `(parish_id,id)`; UNIQUE `installation_id`, UNIQUE `(platform,token)`; index `(parish_id,user_id)`; composite FK cascade tới `users`; migration `20260902-149` |
| 53 | `question_bank_items` | Định danh và lifecycle câu hỏi tái sử dụng theo tenant/taxonomy | PK `(parish_id,id)`; list/taxonomy/author indexes; composite FK tới branch và creator |
| 54 | `question_bank_versions` | Phiên bản nội dung câu hỏi append-only, hash-bound | PK `(parish_id,id)`; UNIQUE `(parish_id,question_id,version)`; composite FK question/creator |
| 55 | `exam_blueprints` | Blueprint tạo đề theo taxonomy, trạng thái và tổng điểm | PK `(parish_id,id)`; list/taxonomy indexes; composite FK branch/creator |
| 56 | `exam_blueprint_rules` | Các rule có thứ tự của blueprint | PK `(parish_id,id)`; UNIQUE `(parish_id,blueprint_id,ordinal)`; cascade theo blueprint |
| 57 | `exam_question_snapshots` | Snapshot bất biến của đúng version câu hỏi đã materialize vào phiên thi | PK `(parish_id,id)`; UNIQUE session/position; composite FK session/question/version |
| 58 | `rate_limits` | Bộ đếm rate-limit bền vững dùng chung giữa tiến trình/API; dữ liệu vận hành, không phải tenant business record | `key` PK; `count` và epoch `reset_at` bắt buộc |
| 59 | `schema_migrations` | Ledger phiên bản migration đã áp dụng để bootstrap idempotent và fail-closed | `version` PK; `applied_at` mặc định `CURRENT_TIMESTAMP` |
| 60 | `operation_events` | Aggregate điều phối sự kiện nội bộ, optional one-to-one link tới lịch công khai | PK `(parish_id,id)`; source/scope/visibility indexes; source/scope/organizer triggers |
| 61 | `operation_event_participants` | Người tham gia nội bộ theo đúng một active user/person | PK `(parish_id,event_id,id)`; unique active user/person per event; target trigger |
| 62 | `operation_blockouts` | Khoảng không sẵn sàng của user/person dùng để cảnh báo phân công | PK `(parish_id,id)`; target/time indexes và target trigger |
| 63 | `operation_reminders` | Reminder domain dedupe/read/delivery reconciliation | PK `(parish_id,id)`; UNIQUE `(parish_id,dedupe_key)`; due index và target trigger |
| 64 | `operation_workstreams` | Nhóm công việc theo event/unit, readiness và OCC | PK `(parish_id,id)`; event/scope indexes và cross-context scope triggers |
| 65 | `operation_tasks` | Task lifecycle/OCC/approval/completion/block/cancellation | PK `(parish_id,id)`; list/workstream indexes; event/workstream scope và cancellation-reason triggers |
| 66 | `operation_task_dependencies` | Cạnh `BLOCKED_BY` tenant-scoped | PK `(parish_id,task_id,depends_on_task_id)`; composite FKs và self-loop CHECK |
| 67 | `operation_task_assignees` | OWNER/CONTRIBUTOR/APPROVER/OBSERVER có identity, acknowledgement, version và soft revoke | PK `(parish_id,id)`; partial UNIQUE một OWNER active và target-role uniqueness |
| 68 | `operation_checklist_items` | Checklist required/done của task | PK `(parish_id,task_id,id)`; task/sort index; composite FK |
| 69 | `operation_workstream_members` | Resource role có thời hạn/version/soft revoke | PK `(parish_id,id)`; target-role uniqueness và user/person indexes |
| 70 | `operation_task_comments` | Comment/evidence HTTPS metadata riêng của task | PK `(parish_id,id)`; task/time index; composite FKs |
| 71 | `operation_mutation_receipts` | Receipt `(actor,key)` với command/request hash/response snapshot cho retry idempotent; response có thể compact theo policy nhưng identity tombstone không bị xóa | PK `(parish_id,actor_user_id,idempotency_key)`; created-at index; `response_pruned_at` migration `20260908-234`; retention duration còn mở/mặc định tắt |

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

XD-01 adds nullable `completed_at` and `completed_target_year_id` in migrations `20260907-177/178`. These are completion metadata, not mutable decision fields: membership transaction writes them once plus `COMPLETE_PROMOTION` audit. Legacy rows remain NULL; approval alone is insufficient evidence to backfill. Reconciliation requires ACTIVE/LATEST plus a receipt matching `academic_years.promotion_target_year_id`. Run the read-only promotion inventory against an explicitly selected target after migration; old ARCHIVED rows without receipts require operator review, not automatic unarchive/move. These additive columns require no data deletion; retain them on rollback, and do not deploy an older writer that can again create receipt-less transitions without re-enabling the old defect.

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

### `feedback_messages` (migration `20260831-145`, ADR-086)

| Column | Type | Notes |
| :--- | :--- | :--- |
| `parish_id,id` | TEXT | Composite PK và tenant scope bắt buộc |
| `target_type,target_user_id` | TEXT | `PARISH` bắt buộc target null; `HOMEROOM_TEACHER` bắt buộc target user |
| `visibility,sender_user_id` | TEXT | `ANONYMOUS` bắt buộc sender null; `PUBLIC` bắt buộc sender user bằng DB CHECK |
| `subject,content` | TEXT | Nội dung thư; không sao chép vào audit log |
| `status,read_at` | TEXT | `NEW|READ|ARCHIVED`; thời điểm đọc nullable |

### `password_reset_requests` (migration `20260831-146`, ADR-087)

| Column | Type | Notes |
| :--- | :--- | :--- |
| `parish_id,id` | TEXT | Composite PK; mọi admin query bắt buộc scope từ JWT |
| `user_id` | TEXT | Tài khoản `phuhuynh` đã match server-side; UNIQUE với `parish_id` để retry/spam hội tụ |
| `status` | TEXT | `PENDING|RESOLVED|DISMISSED` |
| `request_count,last_requested_at` | INTEGER/TEXT | Số lần gửi và thời điểm mới nhất; gửi lại mở lại row hiện hữu |
| `resolved_at,resolved_by` | TEXT | Người/thời điểm Admin xử lý; nullable khi pending |

DB CHECK bắt buộc `request_count >= 1`; `PENDING` phải chưa có resolver, còn `RESOLVED|DISMISSED` phải có đủ `resolved_at/resolved_by`. Không có cột phone/password/IP/user-agent trong ticket. Network metadata chỉ nằm trong audit bảo mật hiện hữu; `PASSWORD_RESET_REQUESTED` ghi rõ actor là unauthenticated request, không tuyên bố `user_id` là người đã xác thực.

## Client data generation — legacy key `purge_version` (ghost/replay prevention)

- Key persisted `purge_version` trong bảng `system_settings` được giữ để tương thích client (value = số nguyên, mặc định `1`). Đây là client-data generation theo parish, tăng +1 trong cùng transaction với mỗi purge hoặc partial JSON restore thành công.
- Mọi client lưu `purge_version` local (localStorage `parish_purge_version`); mỗi chu kỳ sync, `GET /api/system/purge-version` được gọi trước pull delta.
- Nếu server version > local version → cache/queue offline thuộc generation cũ → client tự xóa sạch Dexie + localStorage + đăng xuất trước push. Thiết bị legacy chưa có marker nhưng còn mutation chưa settled cũng reset thay vì baseline generation hiện tại. Restore UI chặn command khi chính thiết bị còn mutation `pending|processing|retrying|failed`.
- Generation increment và success audit nằm trong transaction destructive tương ứng: rollback không phát generation giả; audit failure không được tạo trạng thái server đã thay nhưng HTTP báo restore thất bại.
- Purge **không DROP bảng** — chỉ `DELETE rows` của 26 bảng trong hợp đồng `PURGE_TABLES`, gồm `password_reset_requests` và `feedback_messages`. `exam_result_mutations` được xóa trước `exam_results`/`exam_sessions`; mọi bảng trong danh sách đều có `parish_id`.
- Trước khi xóa: snapshot v3.1 (26 bảng, SHA256 checksum) ghi tại `server/data/backups/safety/purge-safety-<parish>-<ts>.json` (mặc định; override bằng env `SAFETY_BACKUP_DIR` — xem `server/src/utils/safetyDir.ts` và `docs/DEPLOYMENT_GUIDE.md` §3).

---

## Foreign Key Cascade Policies

- `students.class_id` $\rightarrow$ `classes.id` (`onDelete: 'restrict'`)
- `attendance.student_id` $\rightarrow$ `students.id` (`onDelete: 'restrict'`)
- `role_permissions.permission_id` $\rightarrow$ `permissions.id` (`onDelete: 'cascade'`)
- `import_batch_students.batch_id` $\rightarrow$ `import_batches.id` (`onDelete: 'cascade'`)
- `grade_overrides.grade_id` $\rightarrow$ `grades.id` (`onDelete: 'cascade'`)

## Question Bank and Blueprint Schema (ADR-096)

- `question_bank_items`: tenant identity, lifecycle, current version pointer, taxonomy/provenance and reviewer metadata.
- `question_bank_versions`: immutable content/answer/explanation/metadata snapshot and SHA-256 hash; unique `(parish_id,question_id,version)`.
- `exam_blueprints` + `exam_blueprint_rules`: tenant-scoped reusable selection matrices and ordered constraints.
- `exam_question_snapshots`: immutable bridge from a materialized session position to exact question/version/payload/hash.
- `exam_sessions.source_type|blueprint_id|blueprint_snapshot`: additive provenance only; existing Smart Exam columns remain authoritative for execution.
- Migrations `20260902-150..158` are additive and schema readiness requires tables, columns, indexes, composite PKs and the same-parish blueprint insert/update triggers.
- Delete order is snapshots → sessions → blueprint rules → blueprints → question versions → question items. Purge v2.5 and backup v2.1 follow this order.

## Stabilization migrations 20260903-159..20260904-167 (ADR-101/102)

- `159` adds nullable `notices.deleted_at`. Existing rows remain active; no destructive backfill. Full notice reads require `deleted_at IS NULL`, while `updatedAfter` reads deliberately include tombstones.
- `160..164` add `notifications.attempt_count`, `max_attempts`, `lease_owner`, `lease_expires_at`, and `next_attempt_at`. Existing `retrying` rows receive defaults and are recoverable by the worker.
- `165` adds `idx_notifications_worker(status,next_attempt_at,lease_expires_at)` for bounded polling/claim lookup.
- `166` persists `notifications.delivery_kind` so a recovered alert/info retains its dispatch behavior and Web Push title instead of falling back to the legacy `absence` channel.
- `167` adds `notices.parent_revoked_at`: parent deltas receive a redacted eviction tombstone only for rows whose parent visibility was actually revoked; brand-new staff notices remain undisclosed.
- Startup readiness requires all nine markers, the new columns and worker index. Compatibility ALTERs remain duplicate-safe for historical deployments.
- Rollback is R2: code can stop consuming the new fields, but additive columns/tombstones should be retained. Do not hard-delete notice tombstones or down-migrate queue state during an incident; restore a pre-migration snapshot only through the documented database recovery procedure.

## Roster assignment migration `20260906-176` (ADR-108)

- Adds partial UNIQUE index `idx_catechist_assignments_one_cn_per_class` on `(parish_id,class_id)` where `role_in_class='chunhiem'`.
- Adds partial UNIQUE index `idx_catechist_assignments_one_cn_class_per_user` on `(parish_id,user_id)` under the same predicate.
- Existing compliant rows need no rewrite. If historical duplicates exist, migration fails closed; run the read-only roster inventory, review the actual assignments with the parish owner and apply a separate approved correction before retrying. The migration never chooses or deletes a CN automatically.
- These indexes are concurrency backstops. `classAssignmentPolicy` remains the domain error/role/class-status owner for every writer.
