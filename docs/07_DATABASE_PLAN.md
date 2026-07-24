# Database Plan

---

## Current Schema Analysis

### Existing Tables (6)

| Table | Rows (seed) | Status | Issues |
|-------|------------|--------|--------|
| `users` | 4 | ✅ Working | Missing: status, tokenVersion, failedAttempts, lastLoginAt, assignedClasses |
| `students` | 15 | ✅ Working | `classId` is string (no FK), `branch` is string (no FK), no `deletedAt` |
| `grades` | 18 | ✅ Working | No `version` field, academicYear is free text |
| `attendance` | 26 | ✅ Working | No `version` field |
| `notices` | 3 | ✅ Working | No `notice_files` relation |
| `audit_logs` | 0 | ✅ Working | Missing: `ip`, `user_agent` |

### Missing Tables (7 needed)

| Table | Priority | Reason |
|-------|----------|--------|
| `classes` | 🔴 High | `students.classId` references non-existent table |
| `academic_years` | 🔴 High | `grades.academicYear` is free text |
| `branches` | 🟡 Medium | `students.branch` is hardcoded enum string |
| `system_settings` | 🔴 High | Needed for config (passing score, attendance %) |
| `notifications` | 🟢 Low | History of sent notifications |
| `permissions` | 🟢 Low | Schema-only, not enforced |
| `role_permissions` | 🟢 Low | Schema-only, not enforced |

---

## New Tables

### 1. `branches` — 🔴 High

```sql
CREATE TABLE branches (
  id          TEXT PRIMARY KEY,    -- 'CC', 'AU', 'TN', 'NS', 'HS'
  name        TEXT NOT NULL,       -- 'Chiên Con', 'Ấu Nhi', ...
  scarf_color TEXT NOT NULL,       -- '#EC4899', '#16A34A', ...
  age_min     INTEGER NOT NULL,
  age_max     INTEGER NOT NULL
);
```

**Seed**: 5 branches matching current hardcoded values.

**Migration**: Map `students.branch` values to `branches.id`. No data change needed — existing values already match.

---

### 2. `academic_years` — 🔴 High

```sql
CREATE TABLE academic_years (
  id          TEXT PRIMARY KEY,    -- '2025-2026'
  start_date  TEXT NOT NULL,       -- '2025-08-01'
  end_date    TEXT NOT NULL,       -- '2026-07-31'
  is_locked   INTEGER DEFAULT 0   -- 1 = grades frozen
);
```

**Migration**: Create row for current academic year (`2025-2026`). Update `grades.academicYear` values to reference FK (current values already match format).

---

### 3. `classes` — 🔴 High

```sql
CREATE TABLE classes (
  id              TEXT PRIMARY KEY,    -- 'CL-xxxx'
  code            TEXT NOT NULL,       -- 'TN3', 'CC1', 'AU2'
  name            TEXT NOT NULL,       -- 'Thiếu Nhi 3', 'Chiên Con 1'
  branch_id       TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  room            TEXT,
  UNIQUE(code, academic_year_id)
);

CREATE INDEX idx_classes_branch ON classes(branch_id);
CREATE INDEX idx_classes_academic_year ON classes(academic_year_id);
```

**Migration**: Create 8 classes from current hardcoded MOCK_CLASSES. Map `students.classId` ('AU2', 'TN3', etc.) to new `classes.id`. After migration, add FK constraint from `students.class_id` to `classes.id`.

---

### 4. `system_settings` — 🔴 High

```sql
CREATE TABLE system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_by  TEXT,
  updated_at  TEXT
);
```

**Seed defaults**:
```
min_attendance_pct   = '70'   ('Tỷ lệ chuyên cần tối thiểu (%)')
passing_score        = '5.0'  ('Điểm trung bình tối thiểu')
academic_year_start  = '8'    ('Tháng bắt đầu năm học')
grade_max_score      = '10'   ('Thang điểm tối đa')
```

---

### 5. `notifications` — 🟢 Low (Phase 1 per blueprint)

```sql
CREATE TABLE notifications (
  id                TEXT PRIMARY KEY,
  student_id        TEXT REFERENCES students(id) ON DELETE SET NULL,
  type              TEXT NOT NULL,     -- 'telegram' | 'web_push'
  channel           TEXT NOT NULL,     -- 'absence' | 'report_card' | 'reminder'
  status            TEXT NOT NULL,     -- 'sent' | 'failed' | 'retrying'
  recipient         TEXT NOT NULL,
  message           TEXT,
  error             TEXT,
  triggered_by_type TEXT NOT NULL,     -- 'system' | 'user'
  triggered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sent_at           TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX idx_notifications_student ON notifications(student_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

---

### 6. `permissions` — 🟢 Low (schema only)

```sql
CREATE TABLE permissions (
  id          TEXT PRIMARY KEY,    -- 'student.edit', 'grade.edit'
  name        TEXT NOT NULL,
  description TEXT
);
```

### 7. `role_permissions` — 🟢 Low (schema only)

```sql
CREATE TABLE role_permissions (
  role          TEXT NOT NULL,   -- 'admin', 'chunhiem', 'phuta', 'phuhuynh'
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_id)
);
```

---

## Existing Table Modifications

### `users` — Add columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `status` | TEXT | 'ACTIVE' | ACTIVE / FORCE_PASSWORD_CHANGE / LOCKED / INACTIVE |
| `tokenVersion` | INTEGER | 1 | Force logout (increment → invalidates all sessions) |
| `failedAttempts` | INTEGER | 0 | Track consecutive login failures |
| `lockedUntil` | TEXT | NULL | Auto-unlock timestamp (or NULL for manual) |
| `lastLoginAt` | TEXT | NULL | Last successful login timestamp |
| `mustChangePassword` | INTEGER | 1 | Force password change on first login |

### `students` — Add columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `deletedAt` | TEXT | NULL | Soft delete (filter in queries) |

### `grades` — Add columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `version` | INTEGER | 1 | Optimistic locking (not enforced yet) |

### `attendance` — Add columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `version` | INTEGER | 1 | Optimistic locking (not enforced yet) |

### `audit_logs` — Add columns

| Column | Type | Purpose |
|--------|------|---------|
| `ip` | TEXT | Client IP address |
| `user_agent` | TEXT | Client user agent string |

---

## Foreign Key Strategy

All new FK relationships use `ON DELETE RESTRICT` unless noted:

```
students.class_id → classes.id                          ON DELETE RESTRICT
grades.student_id → students.id                         ON DELETE RESTRICT
attendance.student_id → students.id                     ON DELETE RESTRICT
notices.author (no FK — author is display name)
audit_logs.user_id → users.id                           ON DELETE SET NULL
notifications.student_id → students.id                  ON DELETE SET NULL
notifications.triggered_by_user_id → users.id           ON DELETE SET NULL
```

Exception: `audit_logs.userId` and `notifications` FK use `SET NULL` to preserve historical data when a user is deleted.

---

## Indexes

### Current
| Index | Table | Purpose |
|-------|-------|---------|
| `idx_students_parish` | students(parish_id) | Multi-parish (unused currently) |
| `idx_grades_student` | grades(student_id) | Grade lookup by student |
| `idx_attendance_student` | attendance(student_id) | Attendance lookup by student |
| `idx_attendance_date` | attendance(date) | Date-range queries |

### New Indexes Needed

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_classes_branch` | classes(branch_id) | Filter classes by branch |
| `idx_classes_academic_year` | classes(academic_year_id) | Filter by academic year |
| `idx_users_status` | users(status) | List active/locked users |
| `idx_students_status` | students(status) | Filter active vs archived |
| `idx_students_class` | students(class_id) | Students by class |
| `idx_grades_academic_year` | grades(academic_year, semester) | Grade queries by year+semester |
| `idx_attendance_type_date` | attendance(type, date) | Mass vs class attendance |
| `idx_notifications_status` | notifications(status) | Failed notification queries |
| `idx_audit_logs_entity` | audit_logs(entity_type, entity_id) | Entity audit trail |

---

## Migration Order

```
Step 0: BACKUP — export JSON snapshot + copy parish.db
Step 1: Create branches table + seed
Step 2: Create academic_years table + seed
Step 3: Create classes table + seed (mapping from MOCK_CLASSES)
Step 4: ALTER students — add deletedAt column
Step 5: ALTER grades — add version column
Step 6: ALTER attendance — add version column
Step 7: ALTER audit_logs — add ip, user_agent columns
Step 8: ALTER users — add status, tokenVersion, failedAttempts, lastLoginAt
Step 9: Create system_settings table + seed defaults
Step 10: Create catechist_assignments table (for Phase 2 IAM)
Step 11: Create notifications table
Step 12: Create permissions + role_permissions tables + seed
Step 13: Verify data integrity — run health checks
```

---

## Constraints

### Current (implicit)
- `students.code` — UNIQUE
- `students.id` — PK on all tables
- `grades(student_id, semester, academic_year)` — implicitly unique via upsert logic

### New Constraints
- `classes(code, academic_year_id)` — UNIQUE (same code can repeat across years)
- `students.class_id` → FK to `classes.id` (after migration)
- `students.status` → CHECK ('Đang học', 'Nghỉ học', 'Tạm vắng', 'Archived')
- `users.status` → CHECK ('ACTIVE', 'FORCE_PASSWORD_CHANGE', 'LOCKED', 'INACTIVE')
- `grades.version` → NOT NULL DEFAULT 1
- `attendance.version` → NOT NULL DEFAULT 1
