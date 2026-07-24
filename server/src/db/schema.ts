import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role', { enum: ['admin', 'chunhiem', 'phuta', 'phuhuynh'] }).notNull().default('phuta'),
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
