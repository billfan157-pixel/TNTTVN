import { and, eq, isNull } from 'drizzle-orm'
import type { DbExecutor } from '../db/index.js'
import { branches, classes } from '../db/schema.js'

export const STUDENT_BRANCHES = ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi'] as const
export type StudentBranch = (typeof STUDENT_BRANCHES)[number]

const normalizeBranchReference = (value: string | null | undefined): string => (value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]/g, '')

const BRANCH_ALIASES: Array<[StudentBranch, string[]]> = [
  ['ChienCon', ['chiencon']],
  ['AuNhi', ['aunhi']],
  ['ThieuNhi', ['thieunhi']],
  ['NghiaSi', ['nghiasi']],
  ['HiepSi', ['hiepsi']],
]

/** Maps stable canonical IDs or canonical Vietnamese labels to student.branch. */
export function resolveStudentBranch(branchId: string, branchName?: string | null): StudentBranch | null {
  for (const candidate of [branchId, branchName]) {
    const normalized = normalizeBranchReference(candidate)
    if (!normalized) continue
    for (const [branch, aliases] of BRANCH_ALIASES) {
      if (aliases.some(alias => normalized === alias || normalized.startsWith(alias))) return branch
    }
  }
  return null
}

export async function resolveMembershipBranch(
  executor: DbExecutor,
  parishId: string,
  classId: string,
  requestedBranch?: string | null,
): Promise<StudentBranch> {
  const [targetClass] = await executor
    .select({ branchId: classes.branchId, branchName: branches.name })
    .from(classes)
    .leftJoin(branches, and(eq(branches.id, classes.branchId), eq(branches.parishId, classes.parishId)))
    .where(and(eq(classes.id, classId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)
  if (!targetClass) {
    throw Object.assign(new Error('Lớp học không tồn tại hoặc đã bị xóa'), { code: 'CLASS_NOT_FOUND' })
  }

  const canonicalBranch = resolveStudentBranch(targetClass.branchId, targetClass.branchName)
  const normalizedRequested = requestedBranch?.trim() || ''
  if (normalizedRequested && !STUDENT_BRANCHES.includes(normalizedRequested as StudentBranch)) {
    throw Object.assign(new Error('Phân ngành học viên không hợp lệ'), { code: 'BRANCH_INVALID' })
  }
  if (!canonicalBranch) {
    if (normalizedRequested) return normalizedRequested as StudentBranch
    throw Object.assign(new Error('Không xác định được phân ngành của lớp; cần chuẩn hóa lớp trước khi thêm học viên'), { code: 'CLASS_BRANCH_UNRESOLVED' })
  }
  if (normalizedRequested && normalizedRequested !== canonicalBranch) {
    throw Object.assign(
      new Error(`Phân ngành học viên (${normalizedRequested}) không khớp phân ngành lớp (${canonicalBranch})`),
      { code: 'BRANCH_CLASS_MISMATCH' },
    )
  }
  return canonicalBranch
}
