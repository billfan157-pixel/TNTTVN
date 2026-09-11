import { createHash, randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, runDbTransaction } from '../db/index.js'
import { auditLogs, branches, classes, catechistAssignments, parishOrganizationUnits, users } from '../db/schema.js'

const catalog = [
  ['ChienCon', 'Chiên Con'], ['AuNhi', 'Ấu Nhi'], ['ThieuNhi', 'Thiếu Nhi'],
  ['NghiaSi', 'Nghĩa Sĩ'], ['HiepSi', 'Hiệp Sĩ'],
] as const
export const academicUnitId = (kind: 'branch' | 'class', source: string) =>
  `AUTO-${kind}-${createHash('sha256').update(source).digest('hex').slice(0, 32)}`
export const isAcademicUnit = (id: string) => id === 'AUTO-BOARD' || /^AUTO-(branch|class)-[a-f0-9]{32}$/.test(id)

/** Explicit server-owned provisioning, never writes from GET. No term/role grants. */
export async function refreshAcademicOrganization(parishId: string, actorId: string) {
  await runDbTransaction(async tx => {
    const units = await tx.select().from(parishOrganizationUnits).where(and(eq(parishOrganizationUnits.parishId, parishId), isNull(parishOrganizationUnits.deletedAt)))
    const boards = units.filter(u => u.unitType === 'BOARD' && u.isActive)
    if (boards.length > 1) throw new Error('Cần đối soát Ban Điều hành trước khi đồng bộ')
    const boardId = boards[0]?.id ?? 'AUTO-BOARD'
    const sourceBranches = await tx.select().from(branches).where(eq(branches.parishId, parishId))
    const sourceClasses = await tx.select().from(classes).where(eq(classes.parishId, parishId))
    const now = new Date().toISOString()
    let changed = 0
    const save = async (id: string, name: string, unitType: 'BOARD' | 'BRANCH' | 'CHAPTER', parentId: string | null, sortOrder: number, isActive = true) => {
      const existing = units.find(u => u.id === id)
      if (existing && existing.name === name && existing.parentId === parentId && existing.isActive === isActive) return
      const values = { parishId, id, name, unitType, parentId, sortOrder, isActive, updatedBy: actorId, updatedAt: now }
      await tx.insert(parishOrganizationUnits).values({ ...values, createdBy: actorId, createdAt: now })
        .onConflictDoUpdate({ target: [parishOrganizationUnits.parishId, parishOrganizationUnits.id], set: values })
      changed++
    }
    if (!boards.length) await save(boardId, 'Ban Điều hành', 'BOARD', null, 0)
    const allBranches = new Map<string, string>(catalog)
    for (const branch of sourceBranches) allBranches.set(branch.id, branch.name)
    let order = 1
    for (const [id, name] of allBranches) await save(academicUnitId('branch', id), name, 'BRANCH', boardId, order++)
    for (const classroom of sourceClasses) {
      if (!allBranches.has(classroom.branchId)) throw new Error('Lớp có Ngành không hợp lệ; cần đối soát dữ liệu')
      await save(academicUnitId('class', classroom.id), classroom.name, 'CHAPTER', academicUnitId('branch', classroom.branchId), 0, !classroom.deletedAt)
    }
    if (changed) await tx.insert(auditLogs).values({ id: randomUUID(), parishId, userId: actorId, action: 'PARISH_ACADEMIC_ORGANIZATION_SYNC', entityType: 'parish_organization_unit', entityId: boardId, newValue: JSON.stringify({ changed }), createdAt: now })
  })
}

export async function academicOrganizationMetadata(parishId: string) {
  return db.select({ classId: classes.id, academicYearId: classes.academicYearId, leaderName: users.fullName })
    .from(classes)
    .leftJoin(catechistAssignments, and(eq(catechistAssignments.parishId, classes.parishId), eq(catechistAssignments.classId, classes.id), eq(catechistAssignments.roleInClass, 'chunhiem')))
    .leftJoin(users, and(eq(users.parishId, catechistAssignments.parishId), eq(users.id, catechistAssignments.userId), inArray(users.role, ['admin', 'chunhiem', 'phuta']), eq(users.status, 'ACTIVE'), isNull(users.deletedAt)))
    .where(eq(classes.parishId, parishId))
}
