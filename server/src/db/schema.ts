import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role', { enum: ['admin', 'chunhiem', 'phuta', 'phuhuynh'] }).notNull().default('phuta'),
  status: text('status', { enum: ['ACTIVE', 'FORCE_PASSWORD_CHANGE', 'LOCKED', 'INACTIVE'] }).notNull().default('ACTIVE'),
  tokenVersion: integer('token_version').notNull().default(1),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: text('locked_until'),
  lastLoginAt: text('last_login_at'),
  mustChangePassword: integer('must_change_password').notNull().default(1),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const students = sqliteTable('students', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
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
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by'),
})

export const grades = sqliteTable('grades', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id),
  academicYear: text('academic_year').notNull(),
  semester: integer('semester', { mode: 'number' }).notNull(),
  scoreOral: real('score_oral'),
  score15m: real('score_15m'),
  score1Period: real('score_1_period'),
  scoreMidterm: real('score_midterm'),
  scoreFinal: real('score_final'),
  comments: text('comments'),
  version: integer('version').notNull().default(1),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by'),
})

export const attendance = sqliteTable('attendance', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id),
  date: text('date').notNull(),
  type: text('type', { enum: ['SundayMass', 'CatechismClass'] }).notNull(),
  status: text('status', { enum: ['Present', 'AbsentExcused', 'AbsentUnexcused'] }).notNull(),
  note: text('note'),
  version: integer('version').notNull().default(1),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by'),
})

export const notices = sqliteTable('notices', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  date: text('date').notNull(),
  author: text('author').notNull(),
  priority: text('priority', { enum: ['normal', 'important', 'urgent'] }).notNull().default('normal'),
  targetBranch: text('target_branch'),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by'),
})

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// ─── New Tables ───

export const branches = sqliteTable('branches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scarfColor: text('scarf_color').notNull(),
  ageMin: integer('age_min', { mode: 'number' }).notNull(),
  ageMax: integer('age_max', { mode: 'number' }).notNull(),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by'),
})

export const academicYears = sqliteTable('academic_years', {
  id: text('id').primaryKey(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  isLocked: integer('is_locked', { mode: 'number' }).notNull().default(0),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by'),
})

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  branchId: text('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  academicYearId: text('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'restrict' }),
  room: text('room'),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by'),
}, (table) => [
  uniqueIndex('idx_classes_code_year').on(table.code, table.academicYearId),
])

export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  parishId: text('parish_id').notNull().default('thanh-gia'),
})

export const catechistAssignments = sqliteTable('catechist_assignments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'restrict' }),
  roleInClass: text('role_in_class', { enum: ['chunhiem', 'phuta'] }).notNull(),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedBy: text('updated_by'),
}, (table) => [
  uniqueIndex('idx_catechist_assignments_unique').on(table.userId, table.classId),
])

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  studentId: text('student_id').references(() => students.id, { onDelete: 'set null' }),
  type: text('type', { enum: ['telegram', 'web_push'] }).notNull(),
  channel: text('channel', { enum: ['absence', 'report_card', 'reminder'] }).notNull(),
  status: text('status', { enum: ['sent', 'failed', 'retrying'] }).notNull(),
  recipient: text('recipient').notNull(),
  message: text('message'),
  error: text('error'),
  triggeredByType: text('triggered_by_type', { enum: ['system', 'user'] }).notNull(),
  triggeredByUserId: text('triggered_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  sentAt: text('sent_at'),
  parishId: text('parish_id').notNull().default('thanh-gia'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  parishId: text('parish_id').notNull().default('thanh-gia'),
})

export const rolePermissions = sqliteTable('role_permissions', {
  role: text('role', { enum: ['admin', 'chunhiem', 'phuta', 'phuhuynh'] }).notNull(),
  permissionId: text('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  parishId: text('parish_id').notNull().default('thanh-gia'),
}, (table) => ({
  pk: uniqueIndex('idx_role_permissions_pk').on(table.role, table.permissionId),
}))
