import { sqliteTable, text, integer, real, uniqueIndex, index, primaryKey, foreignKey, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
   id: text('id').notNull(),
   username: text('username').notNull(),
   passwordHash: text('password_hash').notNull(),
   passwordEncrypted: text('password_encrypted'),
   fullName: text('full_name').notNull(),
   holyName: text('holy_name'),
   phone: text('phone'),
   role: text('role', { enum: ['admin', 'chunhiem', 'phuta', 'phuhuynh'] }).notNull().default('phuta'),
   status: text('status', { enum: ['ACTIVE', 'FORCE_PASSWORD_CHANGE', 'LOCKED', 'INACTIVE'] }).notNull().default('ACTIVE'),
   tokenVersion: integer('token_version').notNull().default(1),
   failedAttempts: integer('failed_attempts').notNull().default(0),
   lockedUntil: text('locked_until'),
   lastLoginAt: text('last_login_at'),
   mustChangePassword: integer('must_change_password').notNull().default(1),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   deletedAt: text('deleted_at'),
  }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    index('idx_users_parish_id').on(table.parishId),
    uniqueIndex('idx_users_username_parish').on(table.parishId, table.username),
    index('idx_users_active_role').on(table.parishId, table.role, table.deletedAt),
  ])

// Refresh session management (JWT rotation + reuse detection).
// tokenHash = sha256(refreshToken) — KHÔNG lưu token dạng plaintext.
export const telegramLinkTokens = sqliteTable('telegram_link_tokens', {
  id: text('id').notNull(),
  userId: text('user_id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.userId],
      foreignColumns: [users.parishId, users.id],
    }).onDelete('cascade'),
    index('idx_telegram_link_tokens_user').on(table.parishId, table.userId),
  index('idx_telegram_link_tokens_expiry').on(table.expiresAt),
])

export const telegramLinks = sqliteTable('telegram_links', {
  id: text('id').notNull(),
  userId: text('user_id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  chatId: text('chat_id').notNull().unique(),
  telegramUserId: text('telegram_user_id'),
  telegramUsername: text('telegram_username'),
  status: text('status', { enum: ['ACTIVE', 'REVOKED'] }).notNull().default('ACTIVE'),
  notificationsEnabled: integer('notifications_enabled').notNull().default(1),
  linkedAt: text('linked_at').notNull().$defaultFn(() => new Date().toISOString()),
  revokedAt: text('revoked_at'),
  lastSeenAt: text('last_seen_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.userId],
      foreignColumns: [users.parishId, users.id],
    }).onDelete('cascade'),
    index('idx_telegram_links_user').on(table.parishId, table.userId, table.status),
  index('idx_telegram_links_chat_status').on(table.chatId, table.status),
])

export const refreshTokens = sqliteTable('refresh_tokens', {
   id: text('id').notNull(),
   userId: text('user_id').notNull(),
   parishId: text('parish_id').notNull().default('gia-ton'),
   tokenHash: text('token_hash').notNull().unique(),
   expiresAt: text('expires_at').notNull(),
   revokedAt: text('revoked_at'),
   replacedBy: text('replaced_by'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.userId],
      foreignColumns: [users.parishId, users.id],
    }).onDelete('cascade'),
    index('idx_refresh_tokens_parish_id').on(table.parishId),
    index('idx_refresh_tokens_user_id').on(table.userId),
  ])

export const students = sqliteTable('students', {
   id: text('id').notNull(),
   code: text('code').notNull(),
   holyName: text('holy_name').notNull(),
   fullName: text('full_name').notNull(),
   gender: text('gender', { enum: ['Nam', 'Nữ'] }).notNull(),
   dateOfBirth: text('date_of_birth').notNull(),
   baptismDate: text('baptism_date'),
   firstCommunionDate: text('first_communion_date'),
   confirmationDate: text('confirmation_date'),
   parentName: text('parent_name').notNull(),
   parentPhone: text('parent_phone').notNull(),
   address: text('address').notNull(),
   branch: text('branch', { enum: ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi'] }).notNull(),
   classId: text('class_id').notNull(),
   avatarUrl: text('avatar_url'),
   status: text('status', { enum: ['Đang học', 'Nghỉ học', 'Tạm vắng'] }).notNull().default('Đang học'),
   notes: text('notes'),
   deletedAt: text('deleted_at'),
   idempotencyKey: text('idempotency_key'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedBy: text('updated_by'),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.classId],
      foreignColumns: [classes.parishId, classes.id],
    }).onDelete('restrict'),
    index('idx_students_parish_id').on(table.parishId),
   index('idx_students_class_id').on(table.classId),
   uniqueIndex('idx_students_idempotency').on(table.parishId, table.idempotencyKey),
   uniqueIndex('idx_students_code_parish').on(table.parishId, table.code),
 ])

export const grades = sqliteTable('grades', {
   id: text('id').notNull(),
   studentId: text('student_id').notNull(),
   academicYear: text('academic_year').notNull(),
   semester: integer('semester', { mode: 'number' }).notNull(),
   scoreOral: real('score_oral'),
   score15m: real('score_15m'),
   score1Period: real('score_1_period'),
   scoreMidterm: real('score_midterm'),
   scoreFinal: real('score_final'),
   scoreDaoDuc: real('score_dao_duc'),
   comments: text('comments'),
   scoreOralSource: text('score_oral_source'),
   scoreOralUpdatedAt: text('score_oral_updated_at'),
   score15mSource: text('score_15m_source'),
   score15mUpdatedAt: text('score_15m_updated_at'),
   score1PeriodSource: text('score_1_period_source'),
   score1PeriodUpdatedAt: text('score_1_period_updated_at'),
   scoreMidtermSource: text('score_midterm_source'),
   scoreMidtermUpdatedAt: text('score_midterm_updated_at'),
    scoreFinalSource: text('score_final_source'),
    scoreFinalUpdatedAt: text('score_final_updated_at'),
    scoreDaoDucSource: text('score_dao_duc_source'),
    scoreDaoDucUpdatedAt: text('score_dao_duc_updated_at'),
    version: integer('version').notNull().default(1),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedBy: text('updated_by'),
  }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.studentId],
      foreignColumns: [students.parishId, students.id],
    }),
    index('idx_grades_parish_id').on(table.parishId),
    index('idx_grades_student_id').on(table.studentId),
    index('idx_grades_sync').on(table.parishId, table.updatedAt),
     uniqueIndex('idx_grades_lookup').on(table.parishId, table.studentId, table.academicYear, table.semester),
  ])

export const attendance = sqliteTable('attendance', {
   id: text('id').notNull(),
   studentId: text('student_id').notNull(),
   date: text('date').notNull(),
   type: text('type', { enum: ['SundayMass', 'CatechismClass', 'EucharisticAdoration'] }).notNull(),
   status: text('status', { enum: ['Present', 'AbsentExcused', 'AbsentUnexcused'] }).notNull(),
   note: text('note'),
   version: integer('version').notNull().default(1),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedBy: text('updated_by'),
  }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.studentId],
      foreignColumns: [students.parishId, students.id],
    }).onDelete('restrict'),
    index('idx_attendance_parish_id').on(table.parishId),
    index('idx_attendance_student_id').on(table.studentId),
    index('idx_attendance_sync').on(table.parishId, table.updatedAt),
    index('idx_attendance_lookup').on(table.parishId, table.studentId, table.date),
   // ADR-016: Unique index MUST include parishId for multi-tenancy isolation.
   // This prevents two parishes with coincidentally-same student IDs from
   // conflicting on the attendance unique key.
   uniqueIndex('idx_attendance_unique').on(table.parishId, table.studentId, table.date, table.type),
 ])

export const notices = sqliteTable('notices', {
   id: text('id').notNull(),
   title: text('title').notNull(),
   content: text('content').notNull(),
   date: text('date').notNull(),
   author: text('author').notNull(),
   priority: text('priority', { enum: ['normal', 'important', 'urgent'] }).notNull().default('normal'),
   targetBranch: text('target_branch'),
   targetAudience: text('target_audience', { enum: ['all', 'staff', 'parents'] }).notNull().default('all'),
   idempotencyKey: text('idempotency_key'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedBy: text('updated_by'),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    index('idx_notices_parish_id').on(table.parishId),
   index('idx_notices_date').on(table.parishId, table.date),
   uniqueIndex('idx_notices_idempotency').on(table.parishId, table.idempotencyKey),
 ])

/**
 * Hộp thư góp ý. Thư ẩn danh cố ý KHÔNG có sender_user_id; đây là invariant DB,
 * không chỉ là phép che tên ở response/UI. target_user_id cũng chỉ tồn tại khi
 * thư gửi đích danh GLV chủ nhiệm.
 */
export const feedbackMessages = sqliteTable('feedback_messages', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  targetType: text('target_type', { enum: ['PARISH', 'HOMEROOM_TEACHER'] }).notNull(),
  targetUserId: text('target_user_id'),
  visibility: text('visibility', { enum: ['ANONYMOUS', 'PUBLIC'] }).notNull(),
  senderUserId: text('sender_user_id'),
  subject: text('subject').notNull(),
  content: text('content').notNull(),
  status: text('status', { enum: ['NEW', 'READ', 'ARCHIVED'] }).notNull().default('NEW'),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.targetUserId],
    foreignColumns: [users.parishId, users.id],
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.parishId, table.senderUserId],
    foreignColumns: [users.parishId, users.id],
  }).onDelete('restrict'),
  index('idx_feedback_inbox').on(table.parishId, table.targetType, table.targetUserId, table.status, table.createdAt),
  index('idx_feedback_public_sender').on(table.parishId, table.senderUserId, table.createdAt),
  check('feedback_sender_privacy_check', sql`
    (${table.visibility} = 'ANONYMOUS' AND ${table.senderUserId} IS NULL)
    OR (${table.visibility} = 'PUBLIC' AND ${table.senderUserId} IS NOT NULL)
  `),
  check('feedback_target_check', sql`
    (${table.targetType} = 'PARISH' AND ${table.targetUserId} IS NULL)
    OR (${table.targetType} = 'HOMEROOM_TEACHER' AND ${table.targetUserId} IS NOT NULL)
  `),
])

/**
 * Một hàng trạng thái hiện tại cho mỗi tài khoản phụ huynh. Yêu cầu public chỉ
 * lưu user_id đã khớp server-side; không lưu SĐT nhập vào hay mật khẩu. UNIQUE
 * theo tenant + user giúp spam/retry hội tụ vào một phiếu thay vì làm phình inbox.
 */
export const passwordResetRequests = sqliteTable('password_reset_requests', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  userId: text('user_id').notNull(),
  status: text('status', { enum: ['PENDING', 'RESOLVED', 'DISMISSED'] }).notNull().default('PENDING'),
  requestCount: integer('request_count').notNull().default(1),
  lastRequestedAt: text('last_requested_at').notNull().$defaultFn(() => new Date().toISOString()),
  resolvedAt: text('resolved_at'),
  resolvedBy: text('resolved_by'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.userId],
    foreignColumns: [users.parishId, users.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.parishId, table.resolvedBy],
    foreignColumns: [users.parishId, users.id],
  }).onDelete('restrict'),
  uniqueIndex('idx_password_reset_request_user').on(table.parishId, table.userId),
  index('idx_password_reset_requests_inbox').on(table.parishId, table.status, table.lastRequestedAt),
  check('password_reset_request_count_check', sql`${table.requestCount} >= 1`),
  check('password_reset_request_resolution_check', sql`
    (${table.status} = 'PENDING' AND ${table.resolvedAt} IS NULL AND ${table.resolvedBy} IS NULL)
    OR (${table.status} IN ('RESOLVED', 'DISMISSED') AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedBy} IS NOT NULL)
  `),
])

export const auditLogs = sqliteTable('audit_logs', {
   id: text('id').notNull(),
   userId: text('user_id').notNull(),
   action: text('action').notNull(),
   entityType: text('entity_type').notNull(),
   entityId: text('entity_id').notNull(),
   oldValue: text('old_value'),
   newValue: text('new_value'),
   ip: text('ip'),
   userAgent: text('user_agent'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    index('idx_audit_logs_parish_id').on(table.parishId),
    index('idx_audit_logs_entity').on(table.parishId, table.entityType, table.entityId, table.createdAt),
    // AUDIT-F2 (2026-08-22): phục vụ GET /audit-logs orderBy createdAt DESC
    index('idx_audit_logs_parish_created_at').on(table.parishId, table.createdAt),
  ])

// ─── New Tables ───

export const branches = sqliteTable('branches', {
   id: text('id').notNull(),
   name: text('name').notNull(),
   scarfColor: text('scarf_color').notNull(),
   ageMin: integer('age_min', { mode: 'number' }).notNull(),
   ageMax: integer('age_max', { mode: 'number' }).notNull(),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedBy: text('updated_by'),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    index('idx_branches_parish_id').on(table.parishId),
 ])

export const academicYears = sqliteTable('academic_years', {
   id: text('id').notNull(),
   startDate: text('start_date').notNull(),
   endDate: text('end_date').notNull(),
   isLocked: integer('is_locked', { mode: 'number' }).notNull().default(0),
   status: text('status', {
     enum: ['OPEN', 'SEMESTER_1_LOCKED', 'SEMESTER_2_OPEN', 'SEMESTER_2_LOCKED', 'FINALIZED', 'PROMOTED', 'ARCHIVED'],
   }).notNull().default('OPEN'),
   currentSemester: integer('current_semester', { mode: 'number' }).notNull().default(1),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedBy: text('updated_by'),
  }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    index('idx_academic_years_parish_id').on(table.parishId),
  ])

export const classes = sqliteTable('classes', {
   id: text('id').notNull(),
   code: text('code').notNull(),
   name: text('name').notNull(),
   branchId: text('branch_id').notNull(),
   academicYearId: text('academic_year_id').notNull(),
   room: text('room'),
   idempotencyKey: text('idempotency_key'),
   deletedAt: text('deleted_at'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedBy: text('updated_by'),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.branchId],
      foreignColumns: [branches.parishId, branches.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.parishId, table.academicYearId],
      foreignColumns: [academicYears.parishId, academicYears.id],
    }).onDelete('restrict'),
    index('idx_classes_parish_id').on(table.parishId),
   uniqueIndex('idx_classes_code_year').on(table.parishId, table.code, table.academicYearId),
   uniqueIndex('idx_classes_idempotency').on(table.parishId, table.idempotencyKey),
 ])

export const systemSettings = sqliteTable('system_settings', {
   key: text('key'),
   value: text('value').notNull(),
   description: text('description'),
   updatedBy: text('updated_by'),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   parishId: text('parish_id').notNull().default('gia-ton'),
  }, (table) => [
    // A-NEW-36 (2026-08-11): composite PK (key, parish_id) — trước đây PK là key
    // GLOBAL: 2 giáo xứ cùng ghi key 'parish_system_settings' → insert thứ hai
    // SQLITE_CONSTRAINT, và purge (SELECT theo key không lọc parish) upsert đè lên
    // row của parish khác → dữ liệu bị 'cướp', query theo (key, parish_id) trả về
    // DEFAULT → ghost data không bao giờ wipe (A-NEW-36, P2).
    primaryKey({ columns: [table.key, table.parishId] }),
    index('idx_system_settings_parish_id').on(table.parishId),
  ])

export const catechistAssignments = sqliteTable('catechist_assignments', {
   id: text('id').notNull(),
   userId: text('user_id').notNull(),
   classId: text('class_id').notNull(),
   roleInClass: text('role_in_class', { enum: ['chunhiem', 'phuta'] }).notNull(),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   updatedBy: text('updated_by'),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.userId],
      foreignColumns: [users.parishId, users.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.parishId, table.classId],
      foreignColumns: [classes.parishId, classes.id],
    }).onDelete('restrict'),
    index('idx_catechist_assignments_parish_id').on(table.parishId),
   index('idx_catechist_assignments_user_id').on(table.userId),
   uniqueIndex('idx_catechist_assignments_unique').on(table.parishId, table.userId, table.classId),
 ])

export const notifications = sqliteTable('notifications', {
   id: text('id').notNull(),
   studentId: text('student_id'),
   type: text('type', { enum: ['telegram', 'web_push'] }).notNull(),
   channel: text('channel', { enum: ['absence', 'report_card', 'reminder'] }).notNull(),
   status: text('status', { enum: ['sent', 'failed', 'retrying'] }).notNull(),
   recipient: text('recipient').notNull(),
   message: text('message'),
   error: text('error'),
   triggeredByType: text('triggered_by_type', { enum: ['system', 'user'] }).notNull(),
   triggeredByUserId: text('triggered_by_user_id'),
   sentAt: text('sent_at'),
   targetUserIds: text('target_user_ids'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.studentId],
      foreignColumns: [students.parishId, students.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.parishId, table.triggeredByUserId],
      foreignColumns: [users.parishId, users.id],
    }).onDelete('cascade'),
    index('idx_notifications_parish_id').on(table.parishId),
   index('idx_notifications_lookup').on(table.parishId, table.status, table.createdAt),
  ])

export const permissions = sqliteTable('permissions', {
   id: text('id').notNull(),
   name: text('name').notNull(),
   description: text('description'),
   parishId: text('parish_id').notNull().default('gia-ton'),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    index('idx_permissions_parish_id').on(table.parishId),
 ])

export const rolePermissions = sqliteTable('role_permissions', {
   role: text('role', { enum: ['admin', 'chunhiem', 'phuta', 'phuhuynh'] }).notNull(),
   permissionId: text('permission_id').notNull(),
   parishId: text('parish_id').notNull().default('gia-ton'),
 }, (table) => [
   primaryKey({ columns: [table.parishId, table.role, table.permissionId] }),
   foreignKey({
     columns: [table.parishId, table.permissionId],
     foreignColumns: [permissions.parishId, permissions.id],
   }).onDelete('cascade'),
   uniqueIndex('idx_role_permissions_pk').on(table.parishId, table.role, table.permissionId),
 ])

export const importBatches = sqliteTable('import_batches', {
   id: text('id').notNull(),
   userId: text('user_id').notNull(),
   fileName: text('file_name'),
   contentHash: text('content_hash'),
   totalRows: integer('total_rows', { mode: 'number' }).notNull().default(0),
   imported: integer('imported', { mode: 'number' }).notNull().default(0),
   skipped: integer('skipped', { mode: 'number' }).notNull().default(0),
   errorCount: integer('error_count', { mode: 'number' }).notNull().default(0),
   classesCreated: text('classes_created').default('[]'),
   createdClassIds: text('created_class_ids').default('[]'),
   status: text('status', { enum: ['processing', 'completed', 'partial', 'failed', 'undone', 'partial_undone'] }).notNull().default('processing'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
 }, (table) => [
   primaryKey({ columns: [table.parishId, table.id] }),
   foreignKey({
     columns: [table.parishId, table.userId],
     foreignColumns: [users.parishId, users.id],
   }),
   index('idx_import_batches_parish_id').on(table.parishId),
   index('idx_import_batches_user_id').on(table.userId),
 ])

export const importBatchStudents = sqliteTable('import_batch_students', {
   id: text('id').notNull(),
   batchId: text('batch_id').notNull(),
   studentId: text('student_id'),
   action: text('action', { enum: ['created', 'updated', 'skipped', 'error'] }).notNull(),
   rowIndex: integer('row_index', { mode: 'number' }).notNull(),
   // ADR-064: exact, short-lived rollback source. Audit logs remain PII-redacted
   // and must never be used as a restore snapshot.
   rollbackSnapshot: text('rollback_snapshot'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.batchId],
      foreignColumns: [importBatches.parishId, importBatches.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.parishId, table.studentId],
      foreignColumns: [students.parishId, students.id],
    }).onDelete('cascade'),
    index('idx_import_batch_students_batch_id').on(table.batchId),
   index('idx_import_batch_students_parish_id').on(table.parishId),
 ])

export const gradeImportHashes = sqliteTable('grade_import_hashes', {
   id: text('id').notNull(),
   hash: text('hash').notNull(),
   classId: text('class_id').notNull(),
   semester: integer('semester', { mode: 'number' }).notNull(),
   academicYear: text('academic_year').notNull(),
   totalRows: integer('total_rows', { mode: 'number' }).notNull(),
   userId: text('user_id').notNull(),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
 }, (table) => ({
   uniqueIdx: uniqueIndex('idx_grade_import_hashes_unique').on(table.hash, table.classId, table.semester, table.academicYear, table.parishId),
 }))

export const pushSubscriptions = sqliteTable('push_subscriptions', {
   id: text('id').notNull(),
   endpoint: text('endpoint').notNull().unique(),
   p256dh: text('p256dh').notNull(),
   auth: text('auth').notNull(),
   userId: text('user_id'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
 }, (table) => [
    primaryKey({ columns: [table.parishId, table.id] }),
    foreignKey({
      columns: [table.parishId, table.userId],
      foreignColumns: [users.parishId, users.id],
    }).onDelete('cascade'),
    index('idx_push_subscriptions_parish_id').on(table.parishId),
   index('idx_push_subscriptions_user_id').on(table.userId),
 ])

// ADR-095: native app installations are authenticated user bindings, separate
// from browser Web Push endpoints. Tokens are required for delivery and must
// never be copied into audit logs or client persistence.
export const nativePushTokens = sqliteTable('native_push_tokens', {
  id: text('id').notNull(),
  installationId: text('installation_id').notNull(),
  platform: text('platform', { enum: ['android', 'ios'] }).notNull(),
  token: text('token').notNull(),
  userId: text('user_id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.userId],
    foreignColumns: [users.parishId, users.id],
  }).onDelete('cascade'),
  uniqueIndex('idx_native_push_tokens_installation').on(table.installationId),
  uniqueIndex('idx_native_push_tokens_platform_token').on(table.platform, table.token),
  index('idx_native_push_tokens_user').on(table.parishId, table.userId),
  check('check_native_push_tokens_platform', sql`${table.platform} IN ('android', 'ios')`),
])

export const serviceAssignments = sqliteTable('service_assignments', {
   id: text('id').notNull(),
   studentId: text('student_id').notNull(),
   serviceType: text('service_type', { enum: ['le_phuc_vu'] }).notNull().default('le_phuc_vu'),
   parishId: text('parish_id').notNull().default('gia-ton'),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
   createdBy: text('created_by'),
 }, (table) => [
   primaryKey({ columns: [table.parishId, table.id] }),
   foreignKey({
     columns: [table.parishId, table.studentId],
     foreignColumns: [students.parishId, students.id],
   }).onDelete('cascade'),
   uniqueIndex('idx_service_assignments_unique').on(table.parishId, table.studentId, table.serviceType),
 ])

export const mappingMemory = sqliteTable('mapping_memory', {
   id: text('id').notNull(),
   parishId: text('parish_id').notNull().default('gia-ton'),
   scope: text('scope', { enum: ['class', 'student'] }).notNull(),
   alias: text('alias').notNull(),
   entityId: text('entity_id').notNull(),
   entityName: text('entity_name'),
   academicYearId: text('academic_year_id'),
   isActive: integer('is_active', { mode: 'number' }).notNull().default(1),
   createdBy: text('created_by').notNull(),
   createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
 }, (table) => [
   primaryKey({ columns: [table.parishId, table.id] }),
   uniqueIndex('idx_mapping_memory_unique').on(table.parishId, table.scope, table.alias, table.academicYearId),
   index('idx_mapping_memory_entity_id').on(table.entityId),
 ])

export const gradeOverrides = sqliteTable('grade_overrides', {
  id: text('id').notNull(),
  gradeId: text('grade_id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  scoreField: text('score_field', { enum: ['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc'] }).notNull(),
  manualValue: real('manual_value').notNull(),
  reasonCode: text('reason_code').notNull().default('TeacherAdjustment'),
  reasonNote: text('reason_note'),
  overriddenBy: text('overridden_by').notNull(),
  overriddenAt: text('overridden_at').notNull().$defaultFn(() => new Date().toISOString()),
  version: integer('version').notNull().default(1),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.gradeId],
    foreignColumns: [grades.parishId, grades.id],
  }).onDelete('cascade'),
  index('idx_grade_overrides_lookup').on(table.gradeId, table.scoreField),
  index('idx_grade_overrides_parish').on(table.parishId),
])

export const outboxMessages = sqliteTable('outbox_messages', {
  id: text('id').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: text('payload').notNull(),
  status: text('status', { enum: ['pending', 'dispatched', 'failed'] }).notNull().default('pending'),
  sequenceNumber: integer('sequence_number').notNull().default(1),
  parishId: text('parish_id').notNull().default('gia-ton'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  index('idx_outbox_messages_status').on(table.status, table.createdAt),
  index('idx_outbox_messages_parish').on(table.parishId, table.status),
])

export const semesterLocks = sqliteTable('semester_locks', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  academicYear: text('academic_year').notNull(),
  semester: integer('semester', { mode: 'number' }).notNull(),
  isLocked: integer('is_locked', { mode: 'number' }).notNull().default(0),
  lockedBy: text('locked_by'),
  lockedAt: text('locked_at'),
  unlockReason: text('unlock_reason'),
  unlockedBy: text('unlocked_by'),
  unlockedAt: text('unlocked_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  index('idx_semester_locks_lookup').on(table.parishId, table.academicYear, table.semester),
  uniqueIndex('idx_semester_locks_unique').on(table.parishId, table.academicYear, table.semester),
])

export const academicYearSnapshots = sqliteTable('academic_year_snapshots', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  academicYearId: text('academic_year_id').notNull(),
  studentId: text('student_id').notNull(),
  semester1Gpa: real('semester1_gpa'),
  semester2Gpa: real('semester2_gpa'),
  yearGpa: real('year_gpa'),
  classification: text('classification'),
  attendanceRate: real('attendance_rate'),
  promotionStatus: text('promotion_status', {
    enum: ['PROMOTED', 'RETAINED', 'GRADUATED', 'CONDITIONALLY_PROMOTED', 'TRANSFERRED'],
  }),
  generatedBy: text('generated_by').notNull(),
  generatedAt: text('generated_at').notNull().$defaultFn(() => new Date().toISOString()),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.academicYearId],
    foreignColumns: [academicYears.parishId, academicYears.id],
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.parishId, table.studentId],
    foreignColumns: [students.parishId, students.id],
  }).onDelete('restrict'),
  index('idx_academic_year_snapshots_student').on(table.parishId, table.studentId, table.academicYearId),
  index('idx_academic_year_snapshots_year').on(table.parishId, table.academicYearId),
  uniqueIndex('idx_academic_year_snapshots_unique').on(table.parishId, table.studentId, table.academicYearId),
])

export const promotionRecords = sqliteTable('promotion_records', {
  id: text('id').notNull(),
  studentId: text('student_id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  academicYear: text('academic_year').notNull(),
  targetClassId: text('target_class_id').notNull(),
  nextClassId: text('next_class_id'),
  autoDecision: text('auto_decision', { enum: ['PROMOTED', 'RETAINED', 'GRADUATED', 'CONDITIONALLY_PROMOTED', 'TRANSFERRED'] }).notNull(),
  finalDecision: text('final_decision', { enum: ['PROMOTED', 'RETAINED', 'GRADUATED', 'CONDITIONALLY_PROMOTED', 'TRANSFERRED'] }).notNull(),
  isOverridden: integer('is_overridden', { mode: 'number' }).notNull().default(0),
  overrideReason: text('override_reason'),
  gpaSnapshot: real('gpa_snapshot').notNull(),
  attendanceSnapshot: real('attendance_snapshot').notNull(),
  conductSnapshot: text('conduct_snapshot'),
  rulesVersion: text('rules_version').notNull().default('v1.0'),
  approvedBy: text('approved_by').notNull(),
  approvedAt: text('approved_at').notNull().$defaultFn(() => new Date().toISOString()),
  status: text('status', { enum: ['ACTIVE', 'SUPERSEDED'] }).notNull().default('ACTIVE'),
  version: integer('version').notNull().default(1),
  isLatest: integer('is_latest', { mode: 'number' }).notNull().default(1),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.studentId],
    foreignColumns: [students.parishId, students.id],
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.parishId, table.approvedBy],
    foreignColumns: [users.parishId, users.id],
  }),
  index('idx_promotion_records_lookup').on(table.parishId, table.studentId, table.academicYear),
  uniqueIndex('idx_promotion_records_unique').on(table.parishId, table.studentId, table.academicYear, table.version),
])

export const attendanceSessions = sqliteTable('attendance_sessions', {
  id: text('id').notNull(),
  classId: text('class_id').notNull(),
  date: text('date').notNull(),
  type: text('type', { enum: ['SundayMass', 'CatechismClass'] }).notNull(),
  status: text('status', { enum: ['OPEN', 'CLOSED', 'LOCKED'] }).notNull().default('OPEN'),
  parishId: text('parish_id').notNull().default('gia-ton'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.classId],
    foreignColumns: [classes.parishId, classes.id],
  }).onDelete('restrict'),
  uniqueIndex('idx_attendance_sessions_unique').on(table.parishId, table.classId, table.date, table.type),
])

export const assessments = sqliteTable('assessments', {
  id: text('id').notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['ORAL', '15MIN', '1PERIOD', 'MIDTERM', 'FINAL', 'ETHICS'] }).notNull(),
  weight: real('weight').notNull().default(1.0),
  semester: integer('semester', { mode: 'number' }).notNull(),
  academicYearId: text('academic_year_id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.academicYearId],
    foreignColumns: [academicYears.parishId, academicYears.id],
  }).onDelete('restrict'),
  index('idx_assessments_lookup').on(table.parishId, table.academicYearId, table.semester),
])

// ─── Question Bank & Exam Blueprint (ADR-096) ─────────────────────────────
// `question_bank_items` is the mutable catalogue head used for search and
// lifecycle. Every content edit appends an immutable `question_bank_versions`
// row; historical exams reference the exact version through
// `exam_question_snapshots` below.
export const questionBankItems = sqliteTable('question_bank_items', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  status: text('status', { enum: ['draft', 'in_review', 'approved', 'active', 'archived'] }).notNull().default('draft'),
  currentVersion: integer('current_version', { mode: 'number' }).notNull().default(1),
  branchId: text('branch_id'),
  curriculumLevel: text('curriculum_level'),
  book: text('book'),
  chapter: text('chapter'),
  lesson: text('lesson'),
  lessonOrder: integer('lesson_order', { mode: 'number' }),
  topic: text('topic'),
  difficulty: text('difficulty', { enum: ['recognition', 'understanding', 'application'] }),
  tags: text('tags').notNull().default('[]'),
  source: text('source'),
  provenance: text('provenance', { enum: ['human', 'ai', 'import'] }).notNull().default('human'),
  createdBy: text('created_by').notNull(),
  reviewedBy: text('reviewed_by'),
  approvedBy: text('approved_by'),
  archivedBy: text('archived_by'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  archivedAt: text('archived_at'),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({ columns: [table.parishId, table.branchId], foreignColumns: [branches.parishId, branches.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.parishId, table.createdBy], foreignColumns: [users.parishId, users.id] }).onDelete('restrict'),
  index('idx_question_bank_list').on(table.parishId, table.status, table.updatedAt),
  index('idx_question_bank_taxonomy').on(table.parishId, table.branchId, table.curriculumLevel, table.lessonOrder, table.difficulty),
  index('idx_question_bank_author').on(table.parishId, table.createdBy, table.status),
])

export const questionBankVersions = sqliteTable('question_bank_versions', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  questionId: text('question_id').notNull(),
  version: integer('version', { mode: 'number' }).notNull(),
  questionType: text('question_type', { enum: ['multiple_choice', 'true_false', 'multiple_select', 'short_answer', 'fill_blank', 'matching', 'essay'] }).notNull(),
  stem: text('stem').notNull(),
  answerData: text('answer_data').notNull(),
  explanation: text('explanation'),
  metadataSnapshot: text('metadata_snapshot').notNull(),
  changeNote: text('change_note'),
  contentHash: text('content_hash').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({ columns: [table.parishId, table.questionId], foreignColumns: [questionBankItems.parishId, questionBankItems.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.parishId, table.createdBy], foreignColumns: [users.parishId, users.id] }).onDelete('restrict'),
  uniqueIndex('idx_question_bank_versions_number').on(table.parishId, table.questionId, table.version),
  index('idx_question_bank_versions_question').on(table.parishId, table.questionId, table.createdAt),
])

export const examBlueprints = sqliteTable('exam_blueprints', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['draft', 'active', 'archived'] }).notNull().default('draft'),
  branchId: text('branch_id'),
  curriculumLevel: text('curriculum_level'),
  totalQuestions: integer('total_questions', { mode: 'number' }).notNull(),
  maxScore: integer('max_score', { mode: 'number' }).notNull().default(10),
  version: integer('version', { mode: 'number' }).notNull().default(1),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({ columns: [table.parishId, table.branchId], foreignColumns: [branches.parishId, branches.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.parishId, table.createdBy], foreignColumns: [users.parishId, users.id] }).onDelete('restrict'),
  index('idx_exam_blueprints_list').on(table.parishId, table.status, table.updatedAt),
  index('idx_exam_blueprints_taxonomy').on(table.parishId, table.branchId, table.curriculumLevel),
])

export const examBlueprintRules = sqliteTable('exam_blueprint_rules', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  blueprintId: text('blueprint_id').notNull(),
  ordinal: integer('ordinal', { mode: 'number' }).notNull(),
  questionType: text('question_type', { enum: ['multiple_choice', 'true_false', 'multiple_select', 'short_answer', 'fill_blank', 'matching', 'essay'] }).notNull(),
  chapter: text('chapter'),
  lessonFrom: integer('lesson_from', { mode: 'number' }),
  lessonTo: integer('lesson_to', { mode: 'number' }),
  topic: text('topic'),
  difficulty: text('difficulty', { enum: ['recognition', 'understanding', 'application'] }),
  tags: text('tags').notNull().default('[]'),
  questionCount: integer('question_count', { mode: 'number' }).notNull(),
  pointsEach: real('points_each').notNull().default(1),
  avoidRecentDays: integer('avoid_recent_days', { mode: 'number' }).notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({ columns: [table.parishId, table.blueprintId], foreignColumns: [examBlueprints.parishId, examBlueprints.id] }).onDelete('cascade'),
  uniqueIndex('idx_exam_blueprint_rules_order').on(table.parishId, table.blueprintId, table.ordinal),
  index('idx_exam_blueprint_rules_blueprint').on(table.parishId, table.blueprintId),
])

// ─── Smart Exam Grading (Phase 1) — plan exam grading plan (đã triển khai — xem ADR-023/024) §3 ───
// Server chỉ lưu phiên chấm + kết quả. Server KHÔNG tự ghi grades —
// mọi điểm đi qua gradeService.upsertGrade (OCC + lock + class access).

export const examSessions = sqliteTable('exam_sessions', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  classId: text('class_id').notNull(),
  subject: text('subject').notNull(),
  scoreType: text('score_type', { enum: ['oral', '15m', '1period', 'midterm', 'final'] }).notNull(),
  maxScore: integer('max_score', { mode: 'number' }).notNull().default(10),
  semester: integer('semester', { mode: 'number' }).notNull(),
  academicYear: text('academic_year').notNull(),
  status: text('status', { enum: ['draft', 'completed'] }).notNull().default('draft'),
  createdBy: text('created_by').notNull(),
  completedBy: text('completed_by'),
  completedAt: text('completed_at'),
  // EXAM-MIXED (20260824-129): 'mixed' = đề kết hợp trắc nghiệm (chấm OMR tự động) + tự luận (nhập tay).
  examType: text('exam_type', { enum: ['written', 'multiple_choice', 'mixed'] }).notNull().default('written'),
  questionCount: integer('question_count', { mode: 'number' }),
  answerKey: text('answer_key'), // JSON string: {"1":"A","2":"C"}
  // JSON map mã đề A..H -> answer key đầy đủ. `answer_key` tiếp tục là mã A để tương thích.
  answerVariants: text('answer_variants'),
  variantManifests: text('variant_manifests'), // immutable materialized A-H question/option permutations
  questions: text('questions'), // JSON string: ExamQuestion[]
  sourceType: text('source_type').notNull().default('legacy'),
  blueprintId: text('blueprint_id'),
  blueprintSnapshot: text('blueprint_snapshot'),
  idempotencyKey: text('idempotency_key').notNull().default(sql`(lower(hex(randomblob(16))))`),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.classId],
    foreignColumns: [classes.parishId, classes.id],
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.parishId, table.blueprintId],
    foreignColumns: [examBlueprints.parishId, examBlueprints.id],
  }).onDelete('restrict'),
  index('idx_exam_sessions_class').on(table.parishId, table.classId, table.scoreType),
  index('idx_exam_sessions_status').on(table.parishId, table.status, table.createdAt),
  index('idx_exam_sessions_blueprint').on(table.parishId, table.blueprintId),
  // C1 (2026-08-14): UNIQUE idempotency guard (ADR-023) — rebuild 109 đánh rơi, khôi phục
  // qua migration 20260814-117 + INDICES defensive. NULL idempotency_key được phép trùng
  // (SQLite UNIQUE bỏ qua NULL) nên chỉ ràng buộc các key client gửi temp id.
  uniqueIndex('idx_exam_sessions_idempotency').on(table.parishId, table.idempotencyKey),
])

export const examResults = sqliteTable('exam_results', {
  id: text('id').notNull(),
  examSessionId: text('exam_session_id').notNull(),
  studentId: text('student_id').notNull(),
  score: real('score').notNull(),
  // EXAM-MIXED: điểm phần tự luận nhập tay; score = điểm TN tự chấm + essay_score.
  essayScore: real('essay_score'),
  source: text('source').notNull().default('qr_scan'),
  answers: text('answers'), // JSON string: {"1":"A","2":null}
  examVersion: text('exam_version').notNull().default('A'),
  // Aggregate diagnostics only (engine/template/quality/corrections); never image/base64.
  scanMetadata: text('scan_metadata'),
  parishId: text('parish_id').notNull().default('gia-ton'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.examSessionId],
    foreignColumns: [examSessions.parishId, examSessions.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.parishId, table.studentId],
    foreignColumns: [students.parishId, students.id],
  }).onDelete('restrict'),
  uniqueIndex('idx_exam_results_unique').on(table.parishId, table.examSessionId, table.studentId),
  index('idx_exam_results_lookup').on(table.parishId, table.examSessionId),
])

// EXAM-CONTINUOUS-P0: durable per-item idempotency receipt. A retry after the
// result transaction committed but before its response arrived returns the
// original acknowledgement without rewriting the result or audit log.
export const examResultMutations = sqliteTable('exam_result_mutations', {
  clientMutationId: text('client_mutation_id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  userId: text('user_id').notNull(),
  examSessionId: text('exam_session_id').notNull(),
  studentId: text('student_id').notNull(),
  requestHash: text('request_hash').notNull(),
  responseJson: text('response_json').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.userId, table.clientMutationId] }),
  foreignKey({
    columns: [table.parishId, table.examSessionId],
    foreignColumns: [examSessions.parishId, examSessions.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.parishId, table.studentId],
    foreignColumns: [students.parishId, students.id],
  }).onDelete('restrict'),
  index('idx_exam_result_mutations_session').on(table.parishId, table.examSessionId, table.createdAt),
])

export const examQuestionSnapshots = sqliteTable('exam_question_snapshots', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  examSessionId: text('exam_session_id').notNull(),
  questionId: text('question_id').notNull(),
  questionVersionId: text('question_version_id').notNull(),
  sourcePosition: integer('source_position', { mode: 'number' }).notNull(),
  points: real('points').notNull().default(1),
  snapshotJson: text('snapshot_json').notNull(),
  contentHash: text('content_hash').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({ columns: [table.parishId, table.examSessionId], foreignColumns: [examSessions.parishId, examSessions.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.parishId, table.questionId], foreignColumns: [questionBankItems.parishId, questionBankItems.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.parishId, table.questionVersionId], foreignColumns: [questionBankVersions.parishId, questionBankVersions.id] }).onDelete('restrict'),
  uniqueIndex('idx_exam_question_snapshots_position').on(table.parishId, table.examSessionId, table.sourcePosition),
  index('idx_exam_question_snapshots_usage').on(table.parishId, table.questionId, table.createdAt),
])

// Server-side assessment ledger.  A grade row remains the fast projection used by
// existing reports, while this table preserves the individual source attempt that
// produced it.  `legacy_baseline` is only used when a pre-ledger daily average
// already exists and its original attempt count is unavailable.
export const assessmentEntries = sqliteTable('assessment_entries', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  studentId: text('student_id').notNull(),
  examSessionId: text('exam_session_id'),
  academicYear: text('academic_year').notNull(),
  semester: integer('semester', { mode: 'number' }).notNull(),
  scoreType: text('score_type', { enum: ['oral', '15m', '1period', 'midterm', 'final'] }).notNull(),
  rawScore: real('raw_score').notNull(),
  maxScore: real('max_score').notNull().default(10),
  score: real('score').notNull(),
  source: text('source', { enum: ['exam_finalization', 'legacy_baseline'] }).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.studentId],
    foreignColumns: [students.parishId, students.id],
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.parishId, table.examSessionId],
    foreignColumns: [examSessions.parishId, examSessions.id],
  }).onDelete('cascade'),
  uniqueIndex('idx_assessment_entries_exam_student').on(table.parishId, table.examSessionId, table.studentId),
  index('idx_assessment_entries_lookup').on(table.parishId, table.studentId, table.academicYear, table.semester, table.scoreType),
])

export const examFinalizations = sqliteTable('exam_finalizations', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  examSessionId: text('exam_session_id').notNull(),
  completedBy: text('completed_by').notNull(),
  completedAt: text('completed_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.examSessionId],
    foreignColumns: [examSessions.parishId, examSessions.id],
  }).onDelete('cascade'),
  uniqueIndex('idx_exam_finalizations_session').on(table.parishId, table.examSessionId),
])

export const examFinalizationItems = sqliteTable('exam_finalization_items', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  finalizationId: text('finalization_id').notNull(),
  examResultId: text('exam_result_id').notNull(),
  studentId: text('student_id').notNull(),
  gradeId: text('grade_id'),
  scoreField: text('score_field').notNull(),
  status: text('status', { enum: ['committed', 'conflict'] }).notNull(),
  existingSource: text('existing_source'),
  rawScore: real('raw_score').notNull(),
  finalScore: real('final_score'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.finalizationId],
    foreignColumns: [examFinalizations.parishId, examFinalizations.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.parishId, table.studentId],
    foreignColumns: [students.parishId, students.id],
  }).onDelete('restrict'),
  uniqueIndex('idx_exam_finalization_items_result').on(table.parishId, table.finalizationId, table.examResultId),
  index('idx_exam_finalization_items_lookup').on(table.parishId, table.finalizationId, table.studentId),
])


export const leaveRequests = sqliteTable('leave_requests', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  studentId: text('student_id').notNull(),
  classId: text('class_id').notNull(),
  parentId: text('parent_id'),
  parentName: text('parent_name').notNull(),
  parentPhone: text('parent_phone').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  sessionTypes: text('session_types').notNull(), // JSON: ["SundayMass", "CatechismClass", "EucharisticAdoration"]
  reason: text('reason').notNull(),
  status: text('status', { enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] }).notNull().default('PENDING'),
  reviewedBy: text('reviewed_by'),
  reviewerName: text('reviewer_name'),
  reviewNote: text('review_note'),
  reviewedAt: text('reviewed_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.studentId],
    foreignColumns: [students.parishId, students.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.parishId, table.classId],
    foreignColumns: [classes.parishId, classes.id],
  }).onDelete('restrict'),
  index('idx_leave_requests_parish').on(table.parishId),
  index('idx_leave_requests_class').on(table.parishId, table.classId),
  index('idx_leave_requests_student').on(table.parishId, table.studentId),
  index('idx_leave_requests_date').on(table.parishId, table.date),
  index('idx_leave_requests_status').on(table.parishId, table.status),
])

// ─── Parish Financial & Fund Management (ADR-039) ───

export const funds = sqliteTable('funds', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description'),
  initialBalance: real('initial_balance').notNull().default(0),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  uniqueIndex('idx_funds_code_parish').on(table.parishId, table.code),
  index('idx_funds_parish').on(table.parishId),
])

export const financialTransactions = sqliteTable('financial_transactions', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  fundId: text('fund_id').notNull(),
  type: text('type', { enum: ['INCOME', 'EXPENSE', 'TRANSFER'] }).notNull(),
  amount: real('amount').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  personName: text('person_name'),
  personPhone: text('person_phone'),
  studentId: text('student_id'),
  classId: text('class_id'),
  academicYear: text('academic_year').notNull(),
  transactionDate: text('transaction_date').notNull(), // YYYY-MM-DD
  receiptNumber: text('receipt_number'),
  proofUrl: text('proof_url'),
  targetFundId: text('target_fund_id'),
  recordedBy: text('recorded_by').notNull(),
  recordedByName: text('recorded_by_name').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.fundId],
    foreignColumns: [funds.parishId, funds.id],
  }).onDelete('restrict'),
  index('idx_transactions_fund').on(table.parishId, table.fundId),
  index('idx_transactions_date').on(table.parishId, table.transactionDate),
  index('idx_transactions_academic').on(table.parishId, table.academicYear),
  index('idx_transactions_class').on(table.parishId, table.classId),
])

export const studentFeeRecords = sqliteTable('student_fee_records', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  studentId: text('student_id').notNull(),
  classId: text('class_id').notNull(),
  academicYear: text('academic_year').notNull(),
  feeType: text('fee_type', { enum: ['NIEN_LIEM', 'TRAI_HE', 'DONG_PHUC', 'GIAO_LY', 'OTHER'] }).notNull().default('NIEN_LIEM'),
  title: text('title').notNull(),
  expectedAmount: real('expected_amount').notNull(),
  paidAmount: real('paid_amount').notNull().default(0),
  status: text('status', { enum: ['UNPAID', 'PARTIAL', 'PAID', 'EXEMPTED'] }).notNull().default('UNPAID'),
  paidDate: text('paid_date'),
  transactionId: text('transaction_id'),
  note: text('note'),
  updatedBy: text('updated_by'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.studentId],
    foreignColumns: [students.parishId, students.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.parishId, table.classId],
    foreignColumns: [classes.parishId, classes.id],
  }).onDelete('restrict'),
  uniqueIndex('idx_student_fees_unique').on(table.parishId, table.studentId, table.academicYear, table.feeType),
  index('idx_student_fees_class').on(table.parishId, table.classId, table.academicYear),
])

export const parishEvents = sqliteTable('parish_events', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull().default('gia-ton'),
  date: text('date').notNull(),
  title: text('title').notNull(),
  category: text('category', { enum: ['FEAST_DAY', 'CAMP', 'TRAINING', 'SACRAMENT', 'RETREAT', 'MEETING', 'OTHER'] }).notNull(),
  categoryName: text('category_name'),
  time: text('time'),
  location: text('location'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  index('idx_parish_events_parish_date').on(table.parishId, table.date),
  index('idx_parish_events_parish_category').on(table.parishId, table.category),
])

// ADR-081: Hồ sơ Xứ đoàn is a separate bounded context from operational calendar.
export const parishProfiles = sqliteTable('parish_profiles', {
  parishId: text('parish_id').notNull(),
  displayName: text('display_name').notNull(),
  patronName: text('patron_name'),
  foundedDate: text('founded_date'),
  motto: text('motto'),
  description: text('description'),
  updatedBy: text('updated_by'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  primaryKey({ columns: [table.parishId] }),
])

export const parishPeople = sqliteTable('parish_people', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull(),
  linkedUserId: text('linked_user_id'),
  holyName: text('holy_name'),
  fullName: text('full_name').notNull(),
  birthYear: integer('birth_year'),
  biography: text('biography'),
  serviceStatus: text('service_status', { enum: ['ACTIVE', 'FORMER', 'DECEASED'] }).notNull().default('ACTIVE'),
  visibility: text('visibility', { enum: ['STAFF', 'ADMIN'] }).notNull().default('STAFF'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  index('idx_parish_people_name').on(table.parishId, table.fullName),
  index('idx_parish_people_status').on(table.parishId, table.serviceStatus),
  uniqueIndex('idx_parish_people_linked_user').on(table.parishId, table.linkedUserId)
    .where(sql`${table.linkedUserId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
])

export const parishOrganizationUnits = sqliteTable('parish_organization_units', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull(),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  unitType: text('unit_type', { enum: ['BOARD', 'COMMITTEE', 'BRANCH', 'CHAPTER', 'OTHER'] }).notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  index('idx_parish_units_parent').on(table.parishId, table.parentId, table.sortOrder),
  index('idx_parish_units_type').on(table.parishId, table.unitType),
])

export const parishServiceTerms = sqliteTable('parish_service_terms', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull(),
  personId: text('person_id').notNull(),
  unitId: text('unit_id'),
  positionTitle: text('position_title').notNull(),
  rankTitle: text('rank_title'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  foreignKey({
    columns: [table.parishId, table.personId],
    foreignColumns: [parishPeople.parishId, parishPeople.id],
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.parishId, table.unitId],
    foreignColumns: [parishOrganizationUnits.parishId, parishOrganizationUnits.id],
  }).onDelete('restrict'),
  index('idx_parish_terms_person').on(table.parishId, table.personId, table.startDate),
  index('idx_parish_terms_unit').on(table.parishId, table.unitId, table.startDate),
])

export const parishRecords = sqliteTable('parish_records', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull(),
  recordType: text('record_type', { enum: ['MILESTONE', 'ACTIVITY', 'ACHIEVEMENT'] }).notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content'),
  occurredOn: text('occurred_on').notNull(),
  endedOn: text('ended_on'),
  location: text('location'),
  status: text('status', { enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }).notNull().default('DRAFT'),
  visibility: text('visibility', { enum: ['STAFF', 'ADMIN'] }).notNull().default('STAFF'),
  showOnTimeline: integer('show_on_timeline', { mode: 'boolean' }).notNull().default(true),
  sourceEventId: text('source_event_id'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  publishedBy: text('published_by'),
  publishedAt: text('published_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  index('idx_parish_records_timeline').on(table.parishId, table.status, table.showOnTimeline, table.occurredOn),
  index('idx_parish_records_type').on(table.parishId, table.recordType, table.occurredOn),
])

export const parishRecordPeople = sqliteTable('parish_record_people', {
  parishId: text('parish_id').notNull(),
  recordId: text('record_id').notNull(),
  personId: text('person_id').notNull(),
  relationRole: text('relation_role'),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.recordId, table.personId] }),
  foreignKey({
    columns: [table.parishId, table.recordId],
    foreignColumns: [parishRecords.parishId, parishRecords.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.parishId, table.personId],
    foreignColumns: [parishPeople.parishId, parishPeople.id],
  }).onDelete('restrict'),
  index('idx_parish_record_people_person').on(table.parishId, table.personId),
])

export const parishArchiveAssets = sqliteTable('parish_archive_assets', {
  id: text('id').notNull(),
  parishId: text('parish_id').notNull(),
  assetType: text('asset_type', { enum: ['IMAGE', 'VIDEO', 'POSTER', 'DOCUMENT', 'MINUTES', 'CERTIFICATE', 'OTHER'] }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  capturedOn: text('captured_on'),
  storageType: text('storage_type', { enum: ['UPLOAD', 'EXTERNAL'] }).notNull(),
  objectKey: text('object_key'),
  externalUrl: text('external_url'),
  originalFilename: text('original_filename'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  checksumSha256: text('checksum_sha256'),
  visibility: text('visibility', { enum: ['STAFF', 'ADMIN'] }).notNull().default('STAFF'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.id] }),
  index('idx_parish_assets_type').on(table.parishId, table.assetType, table.capturedOn),
  index('idx_parish_assets_storage').on(table.parishId, table.storageType),
])

export const parishRecordAssets = sqliteTable('parish_record_assets', {
  parishId: text('parish_id').notNull(),
  recordId: text('record_id').notNull(),
  assetId: text('asset_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.parishId, table.recordId, table.assetId] }),
  foreignKey({
    columns: [table.parishId, table.recordId],
    foreignColumns: [parishRecords.parishId, parishRecords.id],
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.parishId, table.assetId],
    foreignColumns: [parishArchiveAssets.parishId, parishArchiveAssets.id],
  }).onDelete('restrict'),
  index('idx_parish_record_assets_asset').on(table.parishId, table.assetId),
])
