PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_academic_year_snapshots` (
	`id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`academic_year_id` text NOT NULL,
	`student_id` text NOT NULL,
	`semester1_gpa` real,
	`semester2_gpa` real,
	`year_gpa` real,
	`classification` text,
	`attendance_rate` real,
	`promotion_status` text,
	`generated_by` text NOT NULL,
	`generated_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`academic_year_id`) REFERENCES `academic_years`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parish_id`,`student_id`) REFERENCES `students`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_academic_year_snapshots`("id", "parish_id", "academic_year_id", "student_id", "semester1_gpa", "semester2_gpa", "year_gpa", "classification", "attendance_rate", "promotion_status", "generated_by", "generated_at", "created_at", "updated_at") SELECT "id", "parish_id", "academic_year_id", "student_id", "semester1_gpa", "semester2_gpa", "year_gpa", "classification", "attendance_rate", "promotion_status", "generated_by", "generated_at", "created_at", "updated_at" FROM `academic_year_snapshots`;--> statement-breakpoint
DROP TABLE `academic_year_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_academic_year_snapshots` RENAME TO `academic_year_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_academic_year_snapshots_student` ON `academic_year_snapshots` (`parish_id`,`student_id`,`academic_year_id`);--> statement-breakpoint
CREATE INDEX `idx_academic_year_snapshots_year` ON `academic_year_snapshots` (`parish_id`,`academic_year_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_academic_year_snapshots_unique` ON `academic_year_snapshots` (`parish_id`,`student_id`,`academic_year_id`);--> statement-breakpoint
CREATE TABLE `__new_assessments` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`semester` integer NOT NULL,
	`academic_year_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`academic_year_id`) REFERENCES `academic_years`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_assessments`("id", "name", "type", "weight", "semester", "academic_year_id", "parish_id", "created_at", "updated_at") SELECT "id", "name", "type", "weight", "semester", "academic_year_id", "parish_id", "created_at", "updated_at" FROM `assessments`;--> statement-breakpoint
DROP TABLE `assessments`;--> statement-breakpoint
ALTER TABLE `__new_assessments` RENAME TO `assessments`;--> statement-breakpoint
CREATE INDEX `idx_assessments_lookup` ON `assessments` (`parish_id`,`academic_year_id`,`semester`);--> statement-breakpoint
CREATE TABLE `__new_attendance` (
	`id` text NOT NULL,
	`student_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`student_id`) REFERENCES `students`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_attendance`("id", "student_id", "date", "type", "status", "note", "version", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "student_id", "date", "type", "status", "note", "version", "parish_id", "created_at", "updated_at", "updated_by" FROM `attendance`;--> statement-breakpoint
DROP TABLE `attendance`;--> statement-breakpoint
ALTER TABLE `__new_attendance` RENAME TO `attendance`;--> statement-breakpoint
CREATE INDEX `idx_attendance_parish_id` ON `attendance` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_attendance_student_id` ON `attendance` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_attendance_sync` ON `attendance` (`parish_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_attendance_lookup` ON `attendance` (`parish_id`,`student_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendance_unique` ON `attendance` (`parish_id`,`student_id`,`date`,`type`);--> statement-breakpoint
CREATE TABLE `__new_attendance_sessions` (
	`id` text NOT NULL,
	`class_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`class_id`) REFERENCES `classes`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_attendance_sessions`("id", "class_id", "date", "type", "status", "parish_id", "created_at", "updated_at") SELECT "id", "class_id", "date", "type", "status", "parish_id", "created_at", "updated_at" FROM `attendance_sessions`;--> statement-breakpoint
DROP TABLE `attendance_sessions`;--> statement-breakpoint
ALTER TABLE `__new_attendance_sessions` RENAME TO `attendance_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendance_sessions_unique` ON `attendance_sessions` (`parish_id`,`class_id`,`date`,`type`);--> statement-breakpoint
CREATE TABLE `__new_catechist_assignments` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`class_id` text NOT NULL,
	`role_in_class` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`user_id`) REFERENCES `users`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parish_id`,`class_id`) REFERENCES `classes`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_catechist_assignments`("id", "user_id", "class_id", "role_in_class", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "user_id", "class_id", "role_in_class", "parish_id", "created_at", "updated_at", "updated_by" FROM `catechist_assignments`;--> statement-breakpoint
DROP TABLE `catechist_assignments`;--> statement-breakpoint
ALTER TABLE `__new_catechist_assignments` RENAME TO `catechist_assignments`;--> statement-breakpoint
CREATE INDEX `idx_catechist_assignments_parish_id` ON `catechist_assignments` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_catechist_assignments_user_id` ON `catechist_assignments` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_catechist_assignments_unique` ON `catechist_assignments` (`user_id`,`class_id`);--> statement-breakpoint
CREATE TABLE `__new_classes` (
	`id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`branch_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`room` text,
	`idempotency_key` text,
	`deleted_at` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`branch_id`) REFERENCES `branches`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parish_id`,`academic_year_id`) REFERENCES `academic_years`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_classes`("id", "code", "name", "branch_id", "academic_year_id", "room", "idempotency_key", "deleted_at", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "code", "name", "branch_id", "academic_year_id", "room", "idempotency_key", "deleted_at", "parish_id", "created_at", "updated_at", "updated_by" FROM `classes`;--> statement-breakpoint
DROP TABLE `classes`;--> statement-breakpoint
ALTER TABLE `__new_classes` RENAME TO `classes`;--> statement-breakpoint
CREATE INDEX `idx_classes_parish_id` ON `classes` (`parish_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_classes_code_year` ON `classes` (`code`,`academic_year_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_classes_idempotency` ON `classes` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `__new_exam_results` (
	`id` text NOT NULL,
	`exam_session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`score` real NOT NULL,
	`source` text DEFAULT 'qr_scan' NOT NULL,
	`answers` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`exam_session_id`) REFERENCES `exam_sessions`(`parish_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parish_id`,`student_id`) REFERENCES `students`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_exam_results`("id", "exam_session_id", "student_id", "score", "source", "answers", "parish_id", "created_at") SELECT "id", "exam_session_id", "student_id", "score", "source", "answers", "parish_id", "created_at" FROM `exam_results`;--> statement-breakpoint
DROP TABLE `exam_results`;--> statement-breakpoint
ALTER TABLE `__new_exam_results` RENAME TO `exam_results`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_exam_results_unique` ON `exam_results` (`exam_session_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_exam_results_lookup` ON `exam_results` (`parish_id`,`exam_session_id`);--> statement-breakpoint
CREATE TABLE `__new_exam_sessions` (
	`id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`class_id` text NOT NULL,
	`subject` text NOT NULL,
	`score_type` text NOT NULL,
	`max_score` integer DEFAULT 10 NOT NULL,
	`semester` integer NOT NULL,
	`academic_year` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`completed_by` text,
	`completed_at` text,
	`exam_type` text DEFAULT 'written' NOT NULL,
	`question_count` integer,
	`answer_key` text,
	`idempotency_key` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`class_id`) REFERENCES `classes`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_exam_sessions`("id", "parish_id", "class_id", "subject", "score_type", "max_score", "semester", "academic_year", "status", "created_by", "completed_by", "completed_at", "exam_type", "question_count", "answer_key", "idempotency_key", "created_at") SELECT "id", "parish_id", "class_id", "subject", "score_type", "max_score", "semester", "academic_year", "status", "created_by", "completed_by", "completed_at", "exam_type", "question_count", "answer_key", "idempotency_key", "created_at" FROM `exam_sessions`;--> statement-breakpoint
DROP TABLE `exam_sessions`;--> statement-breakpoint
ALTER TABLE `__new_exam_sessions` RENAME TO `exam_sessions`;--> statement-breakpoint
CREATE INDEX `idx_exam_sessions_class` ON `exam_sessions` (`parish_id`,`class_id`,`score_type`);--> statement-breakpoint
CREATE INDEX `idx_exam_sessions_status` ON `exam_sessions` (`parish_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_grade_import_hashes` (
	`id` text NOT NULL,
	`hash` text NOT NULL,
	`class_id` text NOT NULL,
	`semester` integer NOT NULL,
	`academic_year` text NOT NULL,
	`total_rows` integer NOT NULL,
	`user_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_grade_import_hashes`("id", "hash", "class_id", "semester", "academic_year", "total_rows", "user_id", "parish_id", "created_at") SELECT "id", "hash", "class_id", "semester", "academic_year", "total_rows", "user_id", "parish_id", "created_at" FROM `grade_import_hashes`;--> statement-breakpoint
DROP TABLE `grade_import_hashes`;--> statement-breakpoint
ALTER TABLE `__new_grade_import_hashes` RENAME TO `grade_import_hashes`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_grade_import_hashes_unique` ON `grade_import_hashes` (`hash`,`class_id`,`semester`,`academic_year`,`parish_id`);--> statement-breakpoint
CREATE TABLE `__new_grade_overrides` (
	`id` text NOT NULL,
	`grade_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`score_field` text NOT NULL,
	`manual_value` real NOT NULL,
	`reason_code` text DEFAULT 'TeacherAdjustment' NOT NULL,
	`reason_note` text,
	`overridden_by` text NOT NULL,
	`overridden_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`grade_id`) REFERENCES `grades`(`parish_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_grade_overrides`("id", "grade_id", "parish_id", "score_field", "manual_value", "reason_code", "reason_note", "overridden_by", "overridden_at", "version", "deleted_at", "created_at", "updated_at") SELECT "id", "grade_id", "parish_id", "score_field", "manual_value", "reason_code", "reason_note", "overridden_by", "overridden_at", "version", "deleted_at", "created_at", "updated_at" FROM `grade_overrides`;--> statement-breakpoint
DROP TABLE `grade_overrides`;--> statement-breakpoint
ALTER TABLE `__new_grade_overrides` RENAME TO `grade_overrides`;--> statement-breakpoint
CREATE INDEX `idx_grade_overrides_lookup` ON `grade_overrides` (`grade_id`,`score_field`);--> statement-breakpoint
CREATE INDEX `idx_grade_overrides_parish` ON `grade_overrides` (`parish_id`);--> statement-breakpoint
CREATE TABLE `__new_grades` (
	`id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year` text NOT NULL,
	`semester` integer NOT NULL,
	`score_oral` real,
	`score_15m` real,
	`score_1_period` real,
	`score_midterm` real,
	`score_final` real,
	`score_dao_duc` real,
	`comments` text,
	`score_oral_source` text,
	`score_oral_updated_at` text,
	`score_15m_source` text,
	`score_15m_updated_at` text,
	`score_1_period_source` text,
	`score_1_period_updated_at` text,
	`score_midterm_source` text,
	`score_midterm_updated_at` text,
	`score_final_source` text,
	`score_final_updated_at` text,
	`score_dao_duc_source` text,
	`score_dao_duc_updated_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`student_id`) REFERENCES `students`(`parish_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_grades`("id", "student_id", "academic_year", "semester", "score_oral", "score_15m", "score_1_period", "score_midterm", "score_final", "score_dao_duc", "comments", "score_oral_source", "score_oral_updated_at", "score_15m_source", "score_15m_updated_at", "score_1_period_source", "score_1_period_updated_at", "score_midterm_source", "score_midterm_updated_at", "score_final_source", "score_final_updated_at", "score_dao_duc_source", "score_dao_duc_updated_at", "version", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "student_id", "academic_year", "semester", "score_oral", "score_15m", "score_1_period", "score_midterm", "score_final", "score_dao_duc", "comments", "score_oral_source", "score_oral_updated_at", "score_15m_source", "score_15m_updated_at", "score_1_period_source", "score_1_period_updated_at", "score_midterm_source", "score_midterm_updated_at", "score_final_source", "score_final_updated_at", "score_dao_duc_source", "score_dao_duc_updated_at", "version", "parish_id", "created_at", "updated_at", "updated_by" FROM `grades`;--> statement-breakpoint
DROP TABLE `grades`;--> statement-breakpoint
ALTER TABLE `__new_grades` RENAME TO `grades`;--> statement-breakpoint
CREATE INDEX `idx_grades_parish_id` ON `grades` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_grades_student_id` ON `grades` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_grades_sync` ON `grades` (`parish_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_grades_lookup` ON `grades` (`parish_id`,`student_id`,`academic_year`,`semester`);--> statement-breakpoint
CREATE TABLE `__new_import_batch_students` (
	`id` text NOT NULL,
	`batch_id` text NOT NULL,
	`student_id` text,
	`action` text NOT NULL,
	`row_index` integer NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`batch_id`) REFERENCES `import_batches`(`parish_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parish_id`,`student_id`) REFERENCES `students`(`parish_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_import_batch_students`("id", "batch_id", "student_id", "action", "row_index", "parish_id", "created_at") SELECT "id", "batch_id", "student_id", "action", "row_index", "parish_id", "created_at" FROM `import_batch_students`;--> statement-breakpoint
DROP TABLE `import_batch_students`;--> statement-breakpoint
ALTER TABLE `__new_import_batch_students` RENAME TO `import_batch_students`;--> statement-breakpoint
CREATE INDEX `idx_import_batch_students_batch_id` ON `import_batch_students` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_import_batch_students_parish_id` ON `import_batch_students` (`parish_id`);--> statement-breakpoint
CREATE TABLE `__new_import_batches` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text,
	`content_hash` text,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`imported` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`classes_created` text DEFAULT '[]',
	`status` text DEFAULT 'processing' NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`user_id`) REFERENCES `users`(`parish_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_import_batches`("id", "user_id", "file_name", "content_hash", "total_rows", "imported", "skipped", "error_count", "classes_created", "status", "parish_id", "created_at") SELECT "id", "user_id", "file_name", "content_hash", "total_rows", "imported", "skipped", "error_count", "classes_created", "status", "parish_id", "created_at" FROM `import_batches`;--> statement-breakpoint
DROP TABLE `import_batches`;--> statement-breakpoint
ALTER TABLE `__new_import_batches` RENAME TO `import_batches`;--> statement-breakpoint
CREATE INDEX `idx_import_batches_parish_id` ON `import_batches` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_import_batches_user_id` ON `import_batches` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text NOT NULL,
	`student_id` text,
	`type` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`recipient` text NOT NULL,
	`message` text,
	`error` text,
	`triggered_by_type` text NOT NULL,
	`triggered_by_user_id` text,
	`sent_at` text,
	`target_user_ids` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`student_id`) REFERENCES `students`(`parish_id`,`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parish_id`,`triggered_by_user_id`) REFERENCES `users`(`parish_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "student_id", "type", "channel", "status", "recipient", "message", "error", "triggered_by_type", "triggered_by_user_id", "sent_at", "target_user_ids", "parish_id", "created_at") SELECT "id", "student_id", "type", "channel", "status", "recipient", "message", "error", "triggered_by_type", "triggered_by_user_id", "sent_at", "target_user_ids", "parish_id", "created_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
CREATE INDEX `idx_notifications_parish_id` ON `notifications` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_lookup` ON `notifications` (`parish_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_promotion_records` (
	`id` text NOT NULL,
	`student_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`academic_year` text NOT NULL,
	`target_class_id` text NOT NULL,
	`next_class_id` text,
	`auto_decision` text NOT NULL,
	`final_decision` text NOT NULL,
	`is_overridden` integer DEFAULT 0 NOT NULL,
	`override_reason` text,
	`gpa_snapshot` real NOT NULL,
	`attendance_snapshot` real NOT NULL,
	`conduct_snapshot` text,
	`rules_version` text DEFAULT 'v1.0' NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`student_id`) REFERENCES `students`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parish_id`,`approved_by`) REFERENCES `users`(`parish_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_promotion_records`("id", "student_id", "parish_id", "academic_year", "target_class_id", "next_class_id", "auto_decision", "final_decision", "is_overridden", "override_reason", "gpa_snapshot", "attendance_snapshot", "conduct_snapshot", "rules_version", "approved_by", "approved_at", "status", "version", "created_at", "updated_at") SELECT "id", "student_id", "parish_id", "academic_year", "target_class_id", "next_class_id", "auto_decision", "final_decision", "is_overridden", "override_reason", "gpa_snapshot", "attendance_snapshot", "conduct_snapshot", "rules_version", "approved_by", "approved_at", "status", "version", "created_at", "updated_at" FROM `promotion_records`;--> statement-breakpoint
DROP TABLE `promotion_records`;--> statement-breakpoint
ALTER TABLE `__new_promotion_records` RENAME TO `promotion_records`;--> statement-breakpoint
CREATE INDEX `idx_promotion_records_lookup` ON `promotion_records` (`parish_id`,`student_id`,`academic_year`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_promotion_records_unique` ON `promotion_records` (`parish_id`,`student_id`,`academic_year`,`version`);--> statement-breakpoint
CREATE TABLE `__new_push_subscriptions` (
	`id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_id` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`user_id`) REFERENCES `users`(`parish_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_push_subscriptions`("id", "endpoint", "p256dh", "auth", "user_id", "parish_id", "created_at") SELECT "id", "endpoint", "p256dh", "auth", "user_id", "parish_id", "created_at" FROM `push_subscriptions`;--> statement-breakpoint
DROP TABLE `push_subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_push_subscriptions` RENAME TO `push_subscriptions`;--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_parish_id` ON `push_subscriptions` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user_id` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_refresh_tokens` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`replaced_by` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`user_id`) REFERENCES `users`(`parish_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_refresh_tokens`("id", "user_id", "parish_id", "token_hash", "expires_at", "revoked_at", "replaced_by", "created_at") SELECT "id", "user_id", "parish_id", "token_hash", "expires_at", "revoked_at", "replaced_by", "created_at" FROM `refresh_tokens`;--> statement-breakpoint
DROP TABLE `refresh_tokens`;--> statement-breakpoint
ALTER TABLE `__new_refresh_tokens` RENAME TO `refresh_tokens`;--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_parish_id` ON `refresh_tokens` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_user_id` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_role_permissions` (
	`role` text NOT NULL,
	`permission_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	PRIMARY KEY(`parish_id`, `role`, `permission_id`),
	FOREIGN KEY (`parish_id`,`permission_id`) REFERENCES `permissions`(`parish_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_role_permissions`("role", "permission_id", "parish_id") SELECT "role", "permission_id", "parish_id" FROM `role_permissions`;--> statement-breakpoint
DROP TABLE `role_permissions`;--> statement-breakpoint
ALTER TABLE `__new_role_permissions` RENAME TO `role_permissions`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_role_permissions_pk` ON `role_permissions` (`role`,`permission_id`);--> statement-breakpoint
CREATE TABLE `__new_service_assignments` (
	`id` text NOT NULL,
	`student_id` text NOT NULL,
	`service_type` text DEFAULT 'le_phuc_vu' NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`student_id`) REFERENCES `students`(`parish_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_service_assignments`("id", "student_id", "service_type", "parish_id", "created_at", "created_by") SELECT "id", "student_id", "service_type", "parish_id", "created_at", "created_by" FROM `service_assignments`;--> statement-breakpoint
DROP TABLE `service_assignments`;--> statement-breakpoint
ALTER TABLE `__new_service_assignments` RENAME TO `service_assignments`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_assignments_unique` ON `service_assignments` (`student_id`,`service_type`);--> statement-breakpoint
CREATE TABLE `__new_students` (
	`id` text NOT NULL,
	`code` text NOT NULL,
	`holy_name` text NOT NULL,
	`full_name` text NOT NULL,
	`gender` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`baptism_date` text,
	`first_communion_date` text,
	`confirmation_date` text,
	`parent_name` text NOT NULL,
	`parent_phone` text NOT NULL,
	`address` text NOT NULL,
	`branch` text NOT NULL,
	`class_id` text NOT NULL,
	`avatar_url` text,
	`status` text DEFAULT 'Đang học' NOT NULL,
	`notes` text,
	`deleted_at` text,
	`idempotency_key` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`class_id`) REFERENCES `classes`(`parish_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_students`("id", "code", "holy_name", "full_name", "gender", "date_of_birth", "baptism_date", "first_communion_date", "confirmation_date", "parent_name", "parent_phone", "address", "branch", "class_id", "avatar_url", "status", "notes", "deleted_at", "idempotency_key", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "code", "holy_name", "full_name", "gender", "date_of_birth", "baptism_date", "first_communion_date", "confirmation_date", "parent_name", "parent_phone", "address", "branch", "class_id", "avatar_url", "status", "notes", "deleted_at", "idempotency_key", "parish_id", "created_at", "updated_at", "updated_by" FROM `students`;--> statement-breakpoint
DROP TABLE `students`;--> statement-breakpoint
ALTER TABLE `__new_students` RENAME TO `students`;--> statement-breakpoint
CREATE INDEX `idx_students_parish_id` ON `students` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_students_class_id` ON `students` (`class_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_students_idempotency` ON `students` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_students_code_parish` ON `students` (`parish_id`,`code`);--> statement-breakpoint
CREATE TABLE `__new_telegram_link_tokens` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`user_id`) REFERENCES `users`(`parish_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_telegram_link_tokens`("id", "user_id", "parish_id", "token_hash", "expires_at", "consumed_at", "created_at") SELECT "id", "user_id", "parish_id", "token_hash", "expires_at", "consumed_at", "created_at" FROM `telegram_link_tokens`;--> statement-breakpoint
DROP TABLE `telegram_link_tokens`;--> statement-breakpoint
ALTER TABLE `__new_telegram_link_tokens` RENAME TO `telegram_link_tokens`;--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_link_tokens_token_hash_unique` ON `telegram_link_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_telegram_link_tokens_user` ON `telegram_link_tokens` (`parish_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_telegram_link_tokens_expiry` ON `telegram_link_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_telegram_links` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`chat_id` text NOT NULL,
	`telegram_user_id` text,
	`telegram_username` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`notifications_enabled` integer DEFAULT 1 NOT NULL,
	`linked_at` text NOT NULL,
	`revoked_at` text,
	`last_seen_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`),
	FOREIGN KEY (`parish_id`,`user_id`) REFERENCES `users`(`parish_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_telegram_links`("id", "user_id", "parish_id", "chat_id", "telegram_user_id", "telegram_username", "status", "notifications_enabled", "linked_at", "revoked_at", "last_seen_at", "created_at", "updated_at") SELECT "id", "user_id", "parish_id", "chat_id", "telegram_user_id", "telegram_username", "status", "notifications_enabled", "linked_at", "revoked_at", "last_seen_at", "created_at", "updated_at" FROM `telegram_links`;--> statement-breakpoint
DROP TABLE `telegram_links`;--> statement-breakpoint
ALTER TABLE `__new_telegram_links` RENAME TO `telegram_links`;--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_chat_id_unique` ON `telegram_links` (`chat_id`);--> statement-breakpoint
CREATE INDEX `idx_telegram_links_user` ON `telegram_links` (`parish_id`,`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_telegram_links_chat_status` ON `telegram_links` (`chat_id`,`status`);--> statement-breakpoint
CREATE TABLE `__new_academic_years` (
	`id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_locked` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`current_semester` integer DEFAULT 1 NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_academic_years`("id", "start_date", "end_date", "is_locked", "status", "current_semester", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "start_date", "end_date", "is_locked", "status", "current_semester", "parish_id", "created_at", "updated_at", "updated_by" FROM `academic_years`;--> statement-breakpoint
DROP TABLE `academic_years`;--> statement-breakpoint
ALTER TABLE `__new_academic_years` RENAME TO `academic_years`;--> statement-breakpoint
CREATE INDEX `idx_academic_years_parish_id` ON `academic_years` (`parish_id`);--> statement-breakpoint
CREATE TABLE `__new_audit_logs` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`ip` text,
	`user_agent` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_audit_logs`("id", "user_id", "action", "entity_type", "entity_id", "old_value", "new_value", "ip", "user_agent", "parish_id", "created_at") SELECT "id", "user_id", "action", "entity_type", "entity_id", "old_value", "new_value", "ip", "user_agent", "parish_id", "created_at" FROM `audit_logs`;--> statement-breakpoint
DROP TABLE `audit_logs`;--> statement-breakpoint
ALTER TABLE `__new_audit_logs` RENAME TO `audit_logs`;--> statement-breakpoint
CREATE INDEX `idx_audit_logs_parish_id` ON `audit_logs` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_entity` ON `audit_logs` (`parish_id`,`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_branches` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`scarf_color` text NOT NULL,
	`age_min` integer NOT NULL,
	`age_max` integer NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_branches`("id", "name", "scarf_color", "age_min", "age_max", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "name", "scarf_color", "age_min", "age_max", "parish_id", "created_at", "updated_at", "updated_by" FROM `branches`;--> statement-breakpoint
DROP TABLE `branches`;--> statement-breakpoint
ALTER TABLE `__new_branches` RENAME TO `branches`;--> statement-breakpoint
CREATE INDEX `idx_branches_parish_id` ON `branches` (`parish_id`);--> statement-breakpoint
CREATE TABLE `__new_mapping_memory` (
	`id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`scope` text NOT NULL,
	`alias` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_name` text,
	`academic_year_id` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_mapping_memory`("id", "parish_id", "scope", "alias", "entity_id", "entity_name", "academic_year_id", "is_active", "created_by", "created_at") SELECT "id", "parish_id", "scope", "alias", "entity_id", "entity_name", "academic_year_id", "is_active", "created_by", "created_at" FROM `mapping_memory`;--> statement-breakpoint
DROP TABLE `mapping_memory`;--> statement-breakpoint
ALTER TABLE `__new_mapping_memory` RENAME TO `mapping_memory`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mapping_memory_unique` ON `mapping_memory` (`parish_id`,`scope`,`alias`,`academic_year_id`);--> statement-breakpoint
CREATE INDEX `idx_mapping_memory_entity_id` ON `mapping_memory` (`entity_id`);--> statement-breakpoint
CREATE TABLE `__new_notices` (
	`id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`date` text NOT NULL,
	`author` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`target_branch` text,
	`idempotency_key` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_notices`("id", "title", "content", "date", "author", "priority", "target_branch", "idempotency_key", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "title", "content", "date", "author", "priority", "target_branch", "idempotency_key", "parish_id", "created_at", "updated_at", "updated_by" FROM `notices`;--> statement-breakpoint
DROP TABLE `notices`;--> statement-breakpoint
ALTER TABLE `__new_notices` RENAME TO `notices`;--> statement-breakpoint
CREATE INDEX `idx_notices_parish_id` ON `notices` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_notices_date` ON `notices` (`parish_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notices_idempotency` ON `notices` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `__new_outbox_messages` (
	`id` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sequence_number` integer DEFAULT 1 NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_outbox_messages`("id", "aggregate_id", "event_type", "payload", "status", "sequence_number", "parish_id", "created_at") SELECT "id", "aggregate_id", "event_type", "payload", "status", "sequence_number", "parish_id", "created_at" FROM `outbox_messages`;--> statement-breakpoint
DROP TABLE `outbox_messages`;--> statement-breakpoint
ALTER TABLE `__new_outbox_messages` RENAME TO `outbox_messages`;--> statement-breakpoint
CREATE INDEX `idx_outbox_messages_status` ON `outbox_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_outbox_messages_parish` ON `outbox_messages` (`parish_id`,`status`);--> statement-breakpoint
CREATE TABLE `__new_permissions` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_permissions`("id", "name", "description", "parish_id") SELECT "id", "name", "description", "parish_id" FROM `permissions`;--> statement-breakpoint
DROP TABLE `permissions`;--> statement-breakpoint
ALTER TABLE `__new_permissions` RENAME TO `permissions`;--> statement-breakpoint
CREATE INDEX `idx_permissions_parish_id` ON `permissions` (`parish_id`);--> statement-breakpoint
CREATE TABLE `__new_semester_locks` (
	`id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`academic_year` text NOT NULL,
	`semester` integer NOT NULL,
	`is_locked` integer DEFAULT 0 NOT NULL,
	`locked_by` text,
	`locked_at` text,
	`unlock_reason` text,
	`unlocked_by` text,
	`unlocked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_semester_locks`("id", "parish_id", "academic_year", "semester", "is_locked", "locked_by", "locked_at", "unlock_reason", "unlocked_by", "unlocked_at", "created_at", "updated_at") SELECT "id", "parish_id", "academic_year", "semester", "is_locked", "locked_by", "locked_at", "unlock_reason", "unlocked_by", "unlocked_at", "created_at", "updated_at" FROM `semester_locks`;--> statement-breakpoint
DROP TABLE `semester_locks`;--> statement-breakpoint
ALTER TABLE `__new_semester_locks` RENAME TO `semester_locks`;--> statement-breakpoint
CREATE INDEX `idx_semester_locks_lookup` ON `semester_locks` (`parish_id`,`academic_year`,`semester`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_semester_locks_unique` ON `semester_locks` (`parish_id`,`academic_year`,`semester`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_encrypted` text,
	`full_name` text NOT NULL,
	`holy_name` text,
	`phone` text,
	`role` text DEFAULT 'phuta' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`token_version` integer DEFAULT 1 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`must_change_password` integer DEFAULT 1 NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`parish_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "password_hash", "password_encrypted", "full_name", "holy_name", "phone", "role", "status", "token_version", "failed_attempts", "locked_until", "last_login_at", "must_change_password", "parish_id", "created_at") SELECT "id", "username", "password_hash", "password_encrypted", "full_name", "holy_name", "phone", "role", "status", "token_version", "failed_attempts", "locked_until", "last_login_at", "must_change_password", "parish_id", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_parish_id` ON `users` (`parish_id`);