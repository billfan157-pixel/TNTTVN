# Database Schema

> Current state of all 15 tables. This is a reference, not a plan — all planned tables have been created.
> Version: 1.1 | Last reviewed: 2026-07-25 | Status: ✅ Current (constraints corrected) | Prerequisites: 02

---

## All Tables (15)

| # | Table | Rows (seed) | Purpose |
|---|-------|------------|---------|
| 1 | `users` | 2 | User accounts with auth status, role, lockout |
| 2 | `students` | 15 | Student roster (soft-deletable) |
| 3 | `grades` | 18 | Academic scores per semester |
| 4 | `attendance` | 30 | Mass & catechism attendance |
| 5 | `notices` | 3 | Parish announcements |
| 6 | `audit_logs` | 0 | CRUD audit trail with IP & user agent |
| 7 | `notifications` | 0 | Persistent notification history |
| 8 | `branches` | 5 | TNTT branch definitions (CC, AU, TN, NS, HS) |
| 9 | `academic_years` | 1 | School year config with lock flag |
| 10 | `classes` | 7 | Catechism classes linked to branch + year |
| 11 | `system_settings` | 4 | App configuration key-value store |
| 12 | `catechist_assignments` | 2 | User ↔ class mapping with role |
| 13 | `permissions` | 21 | RBAC permission definitions |
| 14 | `role_permissions` | Full | Role ↔ permission mapping |
| 15 | `push_subscriptions` | 0 | Web push notification endpoints |

---

## Table Definitions

### users
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | | `USR-` prefix |
| username | TEXT UNIQUE | | Login name |
| password_hash | TEXT | | bcrypt |
| full_name | TEXT | | Display name |
| role | TEXT | 'phuta' | admin, chunhiem, phuta, phuhuynh |
| status | TEXT | 'ACTIVE' | ACTIVE, FORCE_PASSWORD_CHANGE, LOCKED, INACTIVE |
| token_version | INTEGER | 1 | Increment → invalidates all sessions |
| failed_attempts | INTEGER | 0 | Consecutive login failures |
| locked_until | TEXT | NULL | Auto-unlock timestamp |
| last_login_at | TEXT | NULL | Last successful login |
| must_change_password | INTEGER | 1 | Force change on first login |
| parish_id | TEXT | 'thanh-gia' | Single-parish |
| created_at | TEXT | CURRENT_TIMESTAMP | |

### students
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | | `ST-` prefix |
| code | TEXT UNIQUE | | Generated student code |
| holy_name | TEXT | | e.g. Phêrô |
| full_name | TEXT | | |
| gender | TEXT | | CHECK('Nam', 'Nữ') |
| date_of_birth | TEXT | | |
| baptism_date | TEXT | NULL | Sacrament tracking |
| first_communion_date | TEXT | NULL | |
| confirmation_date | TEXT | NULL | |
| parent_name | TEXT | | |
| parent_phone | TEXT | | |
| address | TEXT | | |
| branch | TEXT | | CHECK branch enum |
| class_id | TEXT | | References classes.id |
| avatar_url | TEXT | NULL | |
| status | TEXT | 'Đang học' | Đang học, Nghỉ học, Tạm vắng |
| notes | TEXT | NULL | |
| deleted_at | TEXT | NULL | Soft delete |
| parish_id | TEXT | 'thanh-gia' | |
| created_at / updated_at / updated_by | TEXT | | |

### grades
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | | `GR-` prefix |
| student_id | TEXT | | FK → students.id |
| academic_year | TEXT | | e.g. '2025 - 2026' |
| semester | INTEGER | | 1 or 2 |
| score_oral | REAL | NULL | |
| score_15m | REAL | NULL | |
| score_1_period | REAL | NULL | |
| score_midterm | REAL | NULL | |
| score_final | REAL | NULL | |
| score_dao_duc | REAL | NULL | Conduct score |
| comments | TEXT | NULL | |
| version | INTEGER | 1 | Optimistic locking |
| parish_id | TEXT | 'thanh-gia' | |
| timestamps + updated_by | | | |

### attendance
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | | `AT-` prefix |
| student_id | TEXT | | FK → students.id |
| date | TEXT | | |
| type | TEXT | | CHECK('SundayMass', 'CatechismClass') |
| status | TEXT | | CHECK('Present', 'AbsentExcused', 'AbsentUnexcused') |
| note | TEXT | NULL | |
| version | INTEGER | 1 | |
| parish_id + timestamps | | | |

### notices, audit_logs, notifications
Standard CRUD tables with parish_id, timestamps. See `schema.ts` for full column lists.

### branches
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | 'CC', 'AU', 'TN', 'NS', 'HS' |
| name | TEXT | Chiên Con, Ấu Nhi, ... |
| scarf_color | TEXT | Hex color |
| age_min / age_max | INTEGER | Age range |
| parish_id + timestamps | | |

### academic_years
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | '2025 - 2026' |
| start_date / end_date | TEXT | |
| is_locked | INTEGER | 1 = grades frozen |
| parish_id + timestamps | | |

### classes
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `CL-` prefix |
| code | TEXT | e.g. 'TN3' |
| name | TEXT | e.g. 'Thiếu Nhi 3' |
| branch_id | TEXT | FK → branches.id |
| academic_year_id | TEXT | FK → academic_years.id |
| room | TEXT | NULL |
| parish_id + timestamps | | |

### system_settings
Key-value store with 4 defaults: min_attendance_pct (70), passing_score (5.0), academic_year_start_month (8), grade_max_score (10).

### catechist_assignments
Junction: user_id + class_id + role_in_class (chunhiem/phuta).

### permissions + role_permissions
RBAC schema: 21 permissions, 4 roles with full matrix.

### push_subscriptions
Web push endpoints: endpoint (UNIQUE), p256dh, auth, user_id (optional).

---

## Indexes (planned — only 3 unique indexes currently in DDL; most are aspirational)

| Index | Table | Purpose |
|-------|-------|---------|
| idx_students_parish | students(parish_id) | Multi-parish |
| idx_grades_student | grades(student_id) | Grade lookup |
| idx_attendance_student | attendance(student_id) | Attendance lookup |
| idx_attendance_date | attendance(date) | Date-range queries |
| idx_classes_branch | classes(branch_id) | Filter by branch |
| idx_classes_academic_year | classes(academic_year_id) | Filter by year |
| idx_users_status | users(status) | List active/locked |
| idx_students_status | students(status) | Filter active vs archived |
| idx_students_class | students(class_id) | Students by class |
| idx_grades_academic_year | grades(academic_year, semester) | Year + semester queries |
| idx_attendance_type_date | attendance(type, date) | Mass vs class |
| idx_notifications_status | notifications(status) | Failed notification queries |
| idx_audit_logs_entity | audit_logs(entity_type, entity_id) | Entity audit trail |

---

## Constraints

- `users.username` — UNIQUE
- `students.code` — UNIQUE
- `classes(code, academic_year_id)` — UNIQUE
- `push_subscriptions.endpoint` — UNIQUE
- `students.status` — CHECK ('Đang học', 'Nghỉ học', 'Tạm vắng')
- `users.status` — CHECK ('ACTIVE', 'FORCE_PASSWORD_CHANGE', 'LOCKED', 'INACTIVE')

### Foreign Keys

| FK Column | References | onDelete |
|-----------|-----------|----------|
| `grades.student_id` | `students.id` | no action (default) |
| `attendance.student_id` | `students.id` | no action (default) |
| `classes.branch_id` | `branches.id` | restrict |
| `classes.academic_year_id` | `academic_years.id` | restrict |
| `catechist_assignments.user_id` | `users.id` | restrict |
| `catechist_assignments.class_id` | `classes.id` | restrict |
| `notifications.student_id` | `students.id` | set null |
| `notifications.triggered_by_user_id` | `users.id` | set null |
| `push_subscriptions.user_id` | `users.id` | set null |
| `role_permissions.permission_id` | `permissions.id` | cascade |
| `audit_logs.user_id` | — | no FK constraint (stored as plain text) |

## Migration Note

Schema is managed via raw DDL in `db/index.ts` (CREATE TABLE IF NOT EXISTS + ALTER TABLE migrations). Drizzle Kit is configured but not yet used for versioned migrations. Always backup `parish.db` before any schema change.
