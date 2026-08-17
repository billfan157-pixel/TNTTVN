CREATE TABLE `academic_year_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_academic_year_snapshots_student` ON `academic_year_snapshots` (`parish_id`,`student_id`,`academic_year_id`);--> statement-breakpoint
CREATE INDEX `idx_academic_year_snapshots_year` ON `academic_year_snapshots` (`parish_id`,`academic_year_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_academic_year_snapshots_unique` ON `academic_year_snapshots` (`parish_id`,`student_id`,`academic_year_id`);--> statement-breakpoint
CREATE TABLE `academic_years` (
	`id` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_locked` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`current_semester` integer DEFAULT 1 NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_academic_years_parish_id` ON `academic_years` (`parish_id`);--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`semester` integer NOT NULL,
	`academic_year_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_assessments_lookup` ON `assessments` (`parish_id`,`academic_year_id`,`semester`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_attendance_parish_id` ON `attendance` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_attendance_student_id` ON `attendance` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_attendance_sync` ON `attendance` (`parish_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_attendance_lookup` ON `attendance` (`parish_id`,`student_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendance_unique` ON `attendance` (`parish_id`,`student_id`,`date`,`type`);--> statement-breakpoint
CREATE TABLE `attendance_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendance_sessions_unique` ON `attendance_sessions` (`parish_id`,`class_id`,`date`,`type`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`ip` text,
	`user_agent` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_parish_id` ON `audit_logs` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_entity` ON `audit_logs` (`parish_id`,`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`scarf_color` text NOT NULL,
	`age_min` integer NOT NULL,
	`age_max` integer NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_branches_parish_id` ON `branches` (`parish_id`);--> statement-breakpoint
CREATE TABLE `catechist_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`class_id` text NOT NULL,
	`role_in_class` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_catechist_assignments_parish_id` ON `catechist_assignments` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_catechist_assignments_user_id` ON `catechist_assignments` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_catechist_assignments_unique` ON `catechist_assignments` (`user_id`,`class_id`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_classes_parish_id` ON `classes` (`parish_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_classes_code_year` ON `classes` (`code`,`academic_year_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_classes_idempotency` ON `classes` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `exam_results` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`score` real NOT NULL,
	`source` text DEFAULT 'qr_scan' NOT NULL,
	`answers` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`exam_session_id`) REFERENCES `exam_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_exam_results_unique` ON `exam_results` (`exam_session_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_exam_results_lookup` ON `exam_results` (`parish_id`,`exam_session_id`);--> statement-breakpoint
CREATE TABLE `exam_sessions` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_exam_sessions_class` ON `exam_sessions` (`parish_id`,`class_id`,`score_type`);--> statement-breakpoint
CREATE INDEX `idx_exam_sessions_status` ON `exam_sessions` (`parish_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `grade_import_hashes` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`class_id` text NOT NULL,
	`semester` integer NOT NULL,
	`academic_year` text NOT NULL,
	`total_rows` integer NOT NULL,
	`user_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_grade_import_hashes_unique` ON `grade_import_hashes` (`hash`,`class_id`,`semester`,`academic_year`,`parish_id`);--> statement-breakpoint
CREATE TABLE `grade_overrides` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`grade_id`) REFERENCES `grades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_grade_overrides_lookup` ON `grade_overrides` (`grade_id`,`score_field`);--> statement-breakpoint
CREATE INDEX `idx_grade_overrides_parish` ON `grade_overrides` (`parish_id`);--> statement-breakpoint
CREATE TABLE `grades` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_grades_parish_id` ON `grades` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_grades_student_id` ON `grades` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_grades_sync` ON `grades` (`parish_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_grades_lookup` ON `grades` (`parish_id`,`student_id`,`academic_year`,`semester`);--> statement-breakpoint
CREATE TABLE `import_batch_students` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`student_id` text,
	`action` text NOT NULL,
	`row_index` integer NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_import_batch_students_batch_id` ON `import_batch_students` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_import_batch_students_parish_id` ON `import_batch_students` (`parish_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_import_batches_parish_id` ON `import_batches` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_import_batches_user_id` ON `import_batches` (`user_id`);--> statement-breakpoint
CREATE TABLE `mapping_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`scope` text NOT NULL,
	`alias` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_name` text,
	`academic_year_id` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mapping_memory_unique` ON `mapping_memory` (`parish_id`,`scope`,`alias`,`academic_year_id`);--> statement-breakpoint
CREATE INDEX `idx_mapping_memory_entity_id` ON `mapping_memory` (`entity_id`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
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
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_notices_parish_id` ON `notices` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_notices_date` ON `notices` (`parish_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notices_idempotency` ON `notices` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`triggered_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_parish_id` ON `notifications` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_lookup` ON `notifications` (`parish_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `outbox_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`aggregate_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sequence_number` integer DEFAULT 1 NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_outbox_messages_status` ON `outbox_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_outbox_messages_parish` ON `outbox_messages` (`parish_id`,`status`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_permissions_parish_id` ON `permissions` (`parish_id`);--> statement-breakpoint
CREATE TABLE `promotion_records` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_promotion_records_lookup` ON `promotion_records` (`parish_id`,`student_id`,`academic_year`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_promotion_records_unique` ON `promotion_records` (`parish_id`,`student_id`,`academic_year`,`version`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_id` text,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_parish_id` ON `push_subscriptions` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user_id` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`replaced_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_parish_id` ON `refresh_tokens` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_user_id` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role` text NOT NULL,
	`permission_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_role_permissions_pk` ON `role_permissions` (`role`,`permission_id`);--> statement-breakpoint
CREATE TABLE `semester_locks` (
	`id` text PRIMARY KEY NOT NULL,
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
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_semester_locks_lookup` ON `semester_locks` (`parish_id`,`academic_year`,`semester`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_semester_locks_unique` ON `semester_locks` (`parish_id`,`academic_year`,`semester`);--> statement-breakpoint
CREATE TABLE `service_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`service_type` text DEFAULT 'le_phuc_vu' NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_assignments_unique` ON `service_assignments` (`student_id`,`service_type`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_students_parish_id` ON `students` (`parish_id`);--> statement-breakpoint
CREATE INDEX `idx_students_class_id` ON `students` (`class_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_students_idempotency` ON `students` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_students_code_parish` ON `students` (`parish_id`,`code`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` text,
	`value` text NOT NULL,
	`description` text,
	`updated_by` text,
	`updated_at` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	PRIMARY KEY(`key`, `parish_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_system_settings_parish_id` ON `system_settings` (`parish_id`);--> statement-breakpoint
CREATE TABLE `telegram_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parish_id` text DEFAULT 'gia-ton' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_link_tokens_token_hash_unique` ON `telegram_link_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_telegram_link_tokens_user` ON `telegram_link_tokens` (`parish_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_telegram_link_tokens_expiry` ON `telegram_link_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `telegram_links` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_chat_id_unique` ON `telegram_links` (`chat_id`);--> statement-breakpoint
CREATE INDEX `idx_telegram_links_user` ON `telegram_links` (`parish_id`,`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_telegram_links_chat_status` ON `telegram_links` (`chat_id`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
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
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_parish_id` ON `users` (`parish_id`);