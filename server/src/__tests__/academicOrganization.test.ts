// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { academicYears, branches, classes, catechistAssignments, users, parishOrganizationUnits } from '../db/schema.js'
import { refreshAcademicOrganization, academicUnitId } from '../services/academicOrganizationService.js'
import { getParishProfileSnapshot, updateParishUnit } from '../services/parishProfileService.js'

describe('canonical academic organization', () => {
  it('provisions defaults once, scopes classes and reads current primary assignment without copying terms', async () => {
    const parishId = `academic-org-${Date.now()}`
    const actor = 'admin'
    await db.insert(branches).values({ parishId, id: 'AuNhi', name: 'Ấu Nhi', scarfColor: 'green', ageMin: 7, ageMax: 9 })
    await db.insert(academicYears).values({ parishId, id: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-01' })
    await db.insert(classes).values({ parishId, id: 'class', code: 'A1', name: 'Ấu 1', branchId: 'AuNhi', academicYearId: '2026-2027' })
    await refreshAcademicOrganization(parishId, actor)
    await refreshAcademicOrganization(parishId, actor)
    let snapshot = await getParishProfileSnapshot(parishId, 'admin')
    expect(snapshot.units).toHaveLength(7)
    const chapter = snapshot.units.find(u => u.sourceClassId === 'class')!
    expect(chapter).toMatchObject({ parentId: academicUnitId('branch', 'AuNhi'), academicYearId: '2026-2027', chapterLeaderName: null })
    expect(snapshot.terms).toHaveLength(0)
    await db.insert(users).values({ parishId, id: 'teacher', username: `${parishId}-teacher`, passwordHash: 'unused', fullName: 'Chủ nhiệm', role: 'phuta', status: 'ACTIVE' })
    await db.insert(catechistAssignments).values({ parishId, id: 'assignment', classId: 'class', userId: 'teacher', roleInClass: 'chunhiem' })
    snapshot = await getParishProfileSnapshot(parishId, 'admin')
    expect(snapshot.units.find(u => u.sourceClassId === 'class')?.chapterLeaderName).toBe('Chủ nhiệm')
    // Account role alone is not a class appointment.
    await db.insert(users).values({ parishId, id: 'replacement', username: `${parishId}-replacement`, passwordHash: 'unused', fullName: 'Chủ nhiệm mới', role: 'chunhiem', status: 'ACTIVE' })
    expect((await getParishProfileSnapshot(parishId, 'admin')).units.find(u => u.sourceClassId === 'class')?.chapterLeaderName).toBe('Chủ nhiệm')
    await db.update(catechistAssignments).set({ userId: 'replacement' }).where(and(eq(catechistAssignments.parishId, parishId), eq(catechistAssignments.id, 'assignment')))
    expect((await getParishProfileSnapshot(parishId, 'admin')).units.find(u => u.sourceClassId === 'class')?.chapterLeaderName).toBe('Chủ nhiệm mới')
    await db.update(users).set({ deletedAt: '2026-09-10T00:00:00Z' }).where(and(eq(users.parishId, parishId), eq(users.id, 'replacement')))
    expect((await getParishProfileSnapshot(parishId, 'admin')).units.find(u => u.sourceClassId === 'class')?.chapterLeaderName).toBeNull()
    await db.update(classes).set({ name: 'Ấu 1 đổi tên' }).where(and(eq(classes.parishId, parishId), eq(classes.id, 'class')))
    await refreshAcademicOrganization(parishId, actor)
    expect((await getParishProfileSnapshot(parishId, 'admin')).units.find(u => u.sourceClassId === 'class')?.name).toBe('Ấu 1 đổi tên')
    await expect(updateParishUnit(chapter.id, { ...chapter, isActive: false }, { parishId, userId: actor, ip: '127.0.0.1', userAgent: 'vitest' }))
      .rejects.toMatchObject({ code: 'PARISH_UNIT_SOURCE_MANAGED' })
    const other = `${parishId}-other`
    await refreshAcademicOrganization(other, actor)
    expect((await db.select().from(parishOrganizationUnits).where(eq(parishOrganizationUnits.parishId, other)))).toHaveLength(6)
  })
})
