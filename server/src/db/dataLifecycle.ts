/**
 * D3 data-lifecycle registry.
 *
 * Keep destructive database operations anchored to one explicit inventory instead
 * of duplicating stale table lists in backup, purge and schema-health code. The
 * order is child-before-parent so RESTRICT foreign keys remain safe even when a
 * deployment does not honor deferred FK checks.
 */
export const PURGE_DELETE_ORDER = [
  'exam_finalization_items',
  'assessment_entries',
  'exam_finalizations',
  'grade_overrides',
  'academic_year_snapshots',
  'promotion_records',
  'student_fee_records',
  'leave_requests',
  'attendance_sessions',
  'exam_results',
  'catechist_assignments',
  'notifications',
  'service_assignments',
  'import_batch_students',
  'attendance',
  'grades',
  'financial_transactions',
  'exam_sessions',
  'import_batches',
  'refresh_tokens',
  'grade_import_hashes',
  'assessments',
  'mapping_memory',
  'notices',
  'outbox_messages',
  'semester_locks',
  'funds',
  'students',
  'classes',
  'academic_years',
] as const

export const PURGE_TABLES = [...PURGE_DELETE_ORDER] as const
export type PurgeTableName = (typeof PURGE_TABLES)[number]

/**
 * Parish-scoped tables intentionally retained by SYSTEM_PURGE because they are
 * identity/security/reference configuration rather than operational parish data.
 */
export const PURGE_PRESERVED_TABLES = [
  'users',
  'branches',
  'permissions',
  'role_permissions',
  'audit_logs',
  'push_subscriptions',
  'system_settings',
  'telegram_link_tokens',
  'telegram_links',
] as const

/**
 * JSON backup v3 restores the parent rows below, therefore every table here is
 * either explicitly deleted by restore or can be changed/deleted through FK
 * cascade/restrict effects of that operation. These tables must be included in
 * both the exported snapshot and the pre-restore safety snapshot.
 */
export const RESTORE_V3_TABLES = [
  'classes',
  'students',
  'grades',
  'attendance',
  'semester_locks',
  'grade_overrides',
  'promotion_records',
  'exam_sessions',
  'exam_results',
  'attendance_sessions',
  'academic_year_snapshots',
  'catechist_assignments',
  'notifications',
  'service_assignments',
  'import_batches',
  'import_batch_students',
  'leave_requests',
  'assessment_entries',
  'exam_finalizations',
  'exam_finalization_items',
  'funds',
  'financial_transactions',
  'student_fee_records',
] as const

/**
 * Structural tenant-PK invariants checked before serving traffic. Tables without
 * an `id` composite PK (for example system_settings/role_permissions) are handled
 * by their own dedicated index/PK rules and are intentionally absent here.
 */
export const REQUIRED_TENANT_COMPOSITE_PRIMARY_KEYS = [
  'users',
  'students',
  'classes',
  'grades',
  'attendance',
  'audit_logs',
  'funds',
  'financial_transactions',
  'student_fee_records',
  'assessment_entries',
  'exam_finalizations',
  'exam_finalization_items',
  'leave_requests',
  'exam_sessions',
  'exam_results',
  'attendance_sessions',
  'academic_year_snapshots',
  'promotion_records',
  'catechist_assignments',
  'notifications',
  'service_assignments',
  'import_batches',
  'import_batch_students',
  'mapping_memory',
  'notices',
  'outbox_messages',
  'semester_locks',
  'assessments',
  'academic_years',
  'branches',
  'permissions',
  'refresh_tokens',
  'push_subscriptions',
  'telegram_link_tokens',
  'telegram_links',
] as const
