// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '../db/migrations.js'

const migration260 = MIGRATIONS.find(migration => migration.version === '20260912-260')
if (!migration260) throw new Error('Migration 20260912-260 is missing')

function legacyDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE users (parish_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (parish_id, id));
    CREATE TABLE parish_people (parish_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (parish_id, id));
    CREATE TABLE parish_organization_units (parish_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (parish_id, id));
    CREATE TABLE operation_events (parish_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (parish_id, id));
    CREATE TABLE operation_workstreams (parish_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (parish_id, id));
    CREATE TABLE operation_tasks (
      id TEXT NOT NULL, parish_id TEXT NOT NULL, operation_event_id TEXT, workstream_id TEXT,
      scope_unit_id TEXT, parent_task_id TEXT, phase TEXT NOT NULL DEFAULT 'PREPARATION',
      title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'TODO',
      priority TEXT NOT NULL DEFAULT 'NORMAL', is_required INTEGER NOT NULL DEFAULT 0,
      due_at TEXT, scheduled_start_at TEXT, scheduled_end_at TEXT, started_at TEXT,
      completed_at TEXT, completion_note TEXT, blocked_reason TEXT, cancellation_reason TEXT,
      approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
      approved_by TEXT, approved_at TEXT,
      version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
      completed_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT,
      PRIMARY KEY (parish_id, id)
    );
    CREATE TABLE operation_task_assignees (
      id TEXT NOT NULL, parish_id TEXT NOT NULL, task_id TEXT NOT NULL, user_id TEXT, person_id TEXT,
      assignment_role TEXT NOT NULL, acknowledgement_status TEXT NOT NULL DEFAULT 'PENDING',
      assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at TEXT, completed_at TEXT, note TEXT, version INTEGER NOT NULL DEFAULT 1,
      removed_at TEXT, PRIMARY KEY (parish_id, id)
    );
    CREATE TABLE operation_workstream_members (
      id TEXT NOT NULL, parish_id TEXT NOT NULL, workstream_id TEXT NOT NULL, user_id TEXT, person_id TEXT,
      operation_role TEXT NOT NULL, assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      starts_at TEXT, ends_at TEXT, version INTEGER NOT NULL DEFAULT 1, removed_at TEXT,
      PRIMARY KEY (parish_id, id)
    );
    INSERT INTO users VALUES ('p', 'u1');
    INSERT INTO operation_tasks (id, parish_id, title, created_by, updated_by) VALUES ('t1', 'p', 'Task', 'u1', 'u1');
  `)
  return db
}

function tableInfo(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(column => column.name)
}

function triggerNames(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'operation_tasks'`).all() as Array<{ name: string }>).map(row => row.name).sort()
}

describe('Migration 20260912-260 approval/observer removal', () => {
  it('rebuilds tasks without approval columns and keeps data, indexes and triggers', () => {
    const db = legacyDatabase()
    db.exec(migration260.sql)
    const columns = tableInfo(db, 'operation_tasks')
    expect(columns).not.toContain('approval_status')
    expect(columns).not.toContain('approved_by')
    expect(columns).not.toContain('approved_at')
    expect(columns).toEqual(expect.arrayContaining(['id', 'parish_id', 'title', 'status', 'version', 'scope_unit_id', 'phase']))
    expect(db.prepare('SELECT COUNT(*) AS n FROM operation_tasks').get()).toMatchObject({ n: 1 })
    const indexes = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'operation_tasks'`).all() as Array<{ name: string }>).map(row => row.name)
    expect(indexes).toEqual(expect.arrayContaining(['idx_operation_tasks_list', 'idx_operation_tasks_workstream', 'idx_operation_tasks_schedule', 'idx_operation_tasks_scope']))
    expect(triggerNames(db)).toEqual([
      'check_operation_task_cancellation_insert',
      'check_operation_task_cancellation_update',
      'check_operation_task_schedule_insert',
      'check_operation_task_schedule_update',
      'check_operation_task_scope_insert',
      'check_operation_task_scope_unit_insert',
      'check_operation_task_scope_unit_update',
      'check_operation_task_scope_update',
    ])
    db.close()
  })

  it('aborts on live legacy assignment, membership and pending-review rows', () => {
    // Fresh database per case: like the production runner (single explicit
    // transaction around the batch), a failed attempt leaves no residue, so
    // each guard is exercised from a clean slate.
    const assigneeDb = legacyDatabase()
    assigneeDb.exec(`INSERT INTO operation_task_assignees (id, parish_id, task_id, user_id, assignment_role, assigned_by) VALUES ('a1', 'p', 't1', 'u1', 'APPROVER', 'u1')`)
    expect(() => assigneeDb.exec(migration260.sql)).toThrow(/operations_approval_removal_guard_task_assignees/)
    assigneeDb.close()
    const memberDb = legacyDatabase()
    memberDb.exec(`INSERT INTO operation_workstream_members (id, parish_id, workstream_id, user_id, operation_role, assigned_by) VALUES ('m1', 'p', 'w1', 'u1', 'CONTRIBUTOR', 'u1')`)
    expect(() => memberDb.exec(migration260.sql)).toThrow(/operations_approval_removal_guard_workstream_members/)
    memberDb.close()
    const taskDb = legacyDatabase()
    taskDb.exec(`UPDATE operation_tasks SET approval_status = 'PENDING' WHERE id = 't1'`)
    expect(() => taskDb.exec(migration260.sql)).toThrow(/operations_approval_removal_guard_tasks/)
    taskDb.close()
  })
})
