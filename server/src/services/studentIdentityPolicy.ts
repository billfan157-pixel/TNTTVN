import { eq } from 'drizzle-orm'
import type { DbTransaction } from '../db/index.js'
import { students } from '../db/schema.js'

type StudentIdentity = { fullName: string; dateOfBirth?: string | null }

export function normalizeStudentName(value: string): string {
  return value.toLocaleLowerCase('vi').normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function identityKey(student: StudentIdentity): string {
  const dob = student.dateOfBirth?.trim() || ''
  return JSON.stringify([normalizeStudentName(student.fullName), dob === 'Chưa cập nhật' ? '' : dob])
}

export function isSameStudentIdentity(left: StudentIdentity, right: StudentIdentity): boolean {
  return identityKey(left) === identityKey(right)
}

/**
 * Call inside the same write transaction as INSERT. libsql write transactions
 * acquire BEGIN IMMEDIATE before reads, so other creators cannot pass this
 * check concurrently. Includes tombstones; never returns another student's PII.
 * Batch checks also reserve identities within the chunk before its bulk insert.
 */
export async function assertStudentIdentitiesAvailable(
  tx: DbTransaction,
  parishId: string,
  incoming: StudentIdentity[],
): Promise<void> {
  const existing = await tx.select({ fullName: students.fullName, dateOfBirth: students.dateOfBirth })
    .from(students).where(eq(students.parishId, parishId))
  const reserved = new Set(existing.map(identityKey))
  for (const student of incoming) {
    const key = identityKey(student)
    if (reserved.has(key)) {
      throw Object.assign(new Error('Học viên có cùng họ tên và ngày sinh đã có hồ sơ trong giáo xứ. Vui lòng kiểm tra hồ sơ hiện có.'), {
        code: 'STUDENT_ALREADY_EXISTS', status: 409,
      })
    }
    reserved.add(key)
  }
}
