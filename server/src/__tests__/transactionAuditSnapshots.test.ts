import { Worker } from 'node:worker_threads'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, dbConfig } from '../db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  classes,
  feedbackMessages,
  students,
  users,
} from '../db/schema.js'
import { deleteClass, updateClass } from '../services/classService.js'
import { deleteStudent } from '../services/studentService.js'
import { updateFeedbackStatus } from '../services/feedbackService.js'

const parishId = 'parish-tx-audit-snapshot'
const userId = 'usr-tx-audit-snapshot'

async function cleanup() {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(feedbackMessages).where(eq(feedbackMessages.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
}

async function whileAnotherWriterCommits<T>(
  sql: string,
  args: Array<string | number | null>,
  operation: () => Promise<T>,
): Promise<T> {
  if (dbConfig.isRemote) throw new Error('This interleaving test requires the local SQLite test database')
  // libsql's local binding can block this event loop while waiting on a write
  // lock. Hold and release the competing transaction in a worker so the
  // interleaving is real and cannot deadlock the test runner itself.
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads')
    const { createClient } = require('@libsql/client')
    ;(async () => {
      const client = createClient({ url: workerData.url })
      await client.execute('PRAGMA busy_timeout=5000')
      const tx = await client.transaction('write')
      await tx.execute(workerData.sql, workerData.args)
      parentPort.postMessage({ type: 'locked' })
      setTimeout(async () => {
        try {
          await tx.commit()
          client.close()
          parentPort.postMessage({ type: 'committed' })
        } catch (error) {
          parentPort.postMessage({ type: 'error', message: String(error) })
        }
      }, 150)
    })().catch(error => parentPort.postMessage({ type: 'error', message: String(error) }))
  `, {
    eval: true,
    workerData: { url: dbConfig.url, sql, args },
  })

  const waitFor = (type: 'locked' | 'committed') => new Promise<void>((resolve, reject) => {
    const onMessage = (message: { type?: string; message?: string }) => {
      if (message.type === 'error') {
        cleanupListeners()
        reject(new Error(message.message || 'Writer worker failed'))
      } else if (message.type === type) {
        cleanupListeners()
        resolve()
      }
    }
    const onError = (error: Error) => {
      cleanupListeners()
      reject(error)
    }
    const cleanupListeners = () => {
      worker.off('message', onMessage)
      worker.off('error', onError)
    }
    worker.on('message', onMessage)
    worker.on('error', onError)
  })

  try {
    await waitFor('locked')
    const committed = waitFor('committed')
    const [, result] = await Promise.all([committed, operation()])
    return result
  } finally {
    await worker.terminate()
  }
}

async function auditOldValue(entityId: string, action: string) {
  const [row] = await db.select({ oldValue: auditLogs.oldValue }).from(auditLogs).where(and(
    eq(auditLogs.parishId, parishId),
    eq(auditLogs.entityId, entityId),
    eq(auditLogs.action, action),
  )).limit(1)
  return JSON.parse(row.oldValue || '{}') as Record<string, unknown>
}

// The exercised transaction helper deliberately permits a 5s SQLite busy wait
// before retrying. Give the interleaving fixture enough headroom when the full
// focused suite creates transient file-lock contention on slower Windows hosts.
describe('transaction-local audit snapshots', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(branches).values({
      id: 'branch-tx-audit', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId,
    })
    await db.insert(academicYears).values({
      id: '2097-2098', startDate: '2097-08-01', endDate: '2098-07-31', parishId,
    })
    await db.insert(users).values({
      id: userId,
      username: 'tx_audit_admin',
      fullName: 'Transaction Audit Admin',
      passwordHash: 'test-only',
      role: 'admin',
      parishId,
    })
    await db.insert(classes).values([
      { id: 'class-tx-update', code: 'TX-U', name: 'Before update', branchId: 'branch-tx-audit', academicYearId: '2097-2098', parishId },
      { id: 'class-tx-delete', code: 'TX-D', name: 'Before delete', branchId: 'branch-tx-audit', academicYearId: '2097-2098', parishId },
      { id: 'class-tx-student', code: 'TX-S', name: 'Student class', branchId: 'branch-tx-audit', academicYearId: '2097-2098', parishId },
    ])
    await db.insert(students).values({
      id: 'student-tx-delete',
      code: 'ST-TX-DELETE',
      holyName: 'Phêrô',
      fullName: 'Before student delete',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Phụ huynh',
      parentPhone: '0900000000',
      address: 'Giáo xứ',
      branch: 'AuNhi',
      classId: 'class-tx-student',
      parishId,
    })
    await db.insert(feedbackMessages).values({
      id: 'feedback-tx-status',
      parishId,
      targetType: 'PARISH',
      targetUserId: null,
      visibility: 'ANONYMOUS',
      senderUserId: null,
      subject: 'Audit snapshot',
      content: 'Test',
      status: 'NEW',
    })
  })

  afterAll(cleanup)

  it('class UPDATE audit observes the row committed before its transaction begins', async () => {
    await whileAnotherWriterCommits(
      'UPDATE classes SET name = ? WHERE parish_id = ? AND id = ?',
      ['Concurrent class name', parishId, 'class-tx-update'],
      () => updateClass('class-tx-update', { room: 'P2' }, userId, parishId, 'test', 'Vitest'),
    )
    expect(await auditOldValue('class-tx-update', 'UPDATE')).toMatchObject({ name: 'Concurrent class name' })
  })

  it('class DELETE audit observes the latest committed class row', async () => {
    await whileAnotherWriterCommits(
      'UPDATE classes SET name = ? WHERE parish_id = ? AND id = ?',
      ['Concurrent delete name', parishId, 'class-tx-delete'],
      () => deleteClass('class-tx-delete', userId, parishId, 'test', 'Vitest'),
    )
    expect(await auditOldValue('class-tx-delete', 'SOFT_DELETE')).toMatchObject({ name: 'Concurrent delete name' })
  })

  it('student DELETE audit observes the latest committed redacted row', async () => {
    await whileAnotherWriterCommits(
      'UPDATE students SET full_name = ? WHERE parish_id = ? AND id = ?',
      ['Concurrent student name', parishId, 'student-tx-delete'],
      () => deleteStudent('student-tx-delete', userId, parishId, 'test', 'Vitest'),
    )
    expect(await auditOldValue('student-tx-delete', 'SOFT_DELETE')).toMatchObject({
      fullName: 'Concurrent student name',
      parentPhone: '****0000',
      address: '***',
    })
  })

  it('feedback status audit observes the latest committed status', async () => {
    await whileAnotherWriterCommits(
      'UPDATE feedback_messages SET status = ? WHERE parish_id = ? AND id = ?',
      ['READ', parishId, 'feedback-tx-status'],
      () => updateFeedbackStatus('feedback-tx-status', 'ARCHIVED', {
        userId,
        username: 'tx_audit_admin',
        role: 'admin',
        parishId,
      }),
    )
    expect(await auditOldValue('feedback-tx-status', 'FEEDBACK_STATUS_UPDATED')).toEqual({ status: 'READ' })
  })
})
