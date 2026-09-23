import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { academicYears, attendance, auditLogs, branches, classes, externalEntityLinks,
  externalImportItems, externalImportRuns, students, users } from '../../db/schema.js'
import { commitTiniAttendance, previewTiniAttendance, retireTiniLink,
  saveSuggestedTiniLinks, saveTiniLink } from '../../services/TiniAttendanceImportService.js'

const parishId = 'parish-tini-import-test'
const actorId = 'usr-tini-import-admin'
const yearId = 'AY-TINI-2026'
const classId = 'CLS-TINI-2026'
const otherClassId = 'CLS-TINI-OTHER-2026'
const studentId = 'ST-TINI-1'
const secondStudentId = 'ST-TINI-2'
const actor = { userId: actorId, parishId, role: 'admin' as const }

function bundle(sourceTitle = 'Có mặt Thánh lễ') {
  const observation = { externalStudentId: '1000001', studentName: 'Học viên Mẫu', externalClassId: 'l_22',
    dateOfBirth: '2015-01-01', className: 'ẤU NHI 1A', date: '2026-09-20', sourceTitle, late: false }
  const sourceFingerprint = createHash('sha256').update(JSON.stringify([
    '2', observation.externalStudentId, observation.externalClassId, observation.date,
    observation.sourceTitle, observation.late, observation.studentName, observation.className,
    observation.dateOfBirth,
  ])).digest('hex')
  return JSON.stringify({
    format: 'catevia-tini-dom-attendance', schemaVersion: 3, provider: 'tini',
    extractedAt: '2026-09-20T12:00:00.000Z', sourcePageKind: 'glv-attendance', sourcePath: '/glv',
    academicYear: { externalId: '2', label: '2026-2027' },
    scope: { date: '2026-09-20', filter: 'Hiện diện - Tất cả', externalClassId: 'l_22', className: 'ẤU NHI 1A' },
    partial: true, renderedStudentRows: 1, rowErrors: [],
    observations: [{ ...observation, sourceFingerprint }],
  })
}

function refreshFingerprints(source: any): string {
  for (const observation of source.observations) {
    observation.sourceFingerprint = createHash('sha256').update(JSON.stringify([
      source.academicYear.externalId, observation.externalStudentId, observation.externalClassId,
      observation.date, observation.sourceTitle, observation.late,
      ...(source.schemaVersion >= 2 ? [observation.studentName, observation.className] : []),
      ...(source.schemaVersion >= 3 ? [observation.dateOfBirth ?? null] : []),
    ])).digest('hex')
  }
  return JSON.stringify(source)
}

async function linkIdentities() {
  await saveTiniLink({ parishId, actorId, entityKind: 'class', externalScope: '2',
    externalId: 'l_22', targetId: classId, expectedVersion: 0, reason: 'Đã đối chiếu lớp gốc',
    sourceYearLabel: '2026-2027' })
  await saveTiniLink({ parishId, actorId, entityKind: 'student', externalScope: '',
    externalId: '1000001', targetId: studentId, expectedVersion: 0, reason: 'Đã đối chiếu mã học viên' })
}

describe('TINI manual file import through canonical Attendance writer', () => {
  beforeAll(async () => {
    await db.insert(branches).values({ id: 'BR-TINI', parishId, name: 'Ấu Nhi',
      scarfColor: 'Xanh', ageMin: 6, ageMax: 10 }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, parishId, startDate: '2026-08-01',
      endDate: '2027-06-30', status: 'OPEN' }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, parishId, code: 'AN1A-TINI',
      name: 'Ấu Nhi 1A', branchId: 'BR-TINI', academicYearId: yearId }).onConflictDoNothing()
    await db.insert(classes).values({ id: otherClassId, parishId, code: 'AN1B-TINI',
      name: 'Ấu Nhi 1B', branchId: 'BR-TINI', academicYearId: yearId }).onConflictDoNothing()
    await db.insert(users).values({ id: actorId, parishId, username: 'tini-import-admin',
      fullName: 'TINI Import Admin', passwordHash: 'hash', role: 'admin' }).onConflictDoNothing()
    for (const [id, code, dateOfBirth] of [[studentId, 'TINI-ST-1', '2015-01-01'], [secondStudentId, 'TINI-ST-2', '2014-01-01']]) {
      await db.insert(students).values({ id, parishId, code, holyName: 'Phaolô',
        fullName: 'Học viên Mẫu', gender: 'Nam', dateOfBirth,
        parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId })
        .onConflictDoNothing()
    }
  })

  beforeEach(async () => {
    await db.delete(externalImportItems).where(eq(externalImportItems.parishId, parishId))
    await db.delete(externalImportRuns).where(eq(externalImportRuns.parishId, parishId))
    await db.delete(externalEntityLinks).where(eq(externalEntityLinks.parishId, parishId))
    await db.delete(attendance).where(eq(attendance.parishId, parishId))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.update(academicYears).set({ status: 'OPEN' }).where(and(eq(academicYears.parishId, parishId), eq(academicYears.id, yearId)))
    await db.update(students).set({ classId, holyName: 'Phaolô', fullName: 'Học viên Mẫu',
      dateOfBirth: '2015-01-01' })
      .where(and(eq(students.parishId, parishId), eq(students.id, studentId)))
    await db.update(students).set({ classId, holyName: 'Phaolô', fullName: 'Học viên Mẫu',
      dateOfBirth: '2014-01-01' }).where(and(eq(students.parishId, parishId), eq(students.id, secondStudentId)))
  })

  it('requires reviewed IDs even when students share the same name', async () => {
    const preview = await previewTiniAttendance(bundle(), actorId, parishId)
    expect(preview.counts.unmapped).toBe(1)
    expect(preview.studentProfileSuggestions).toEqual([])
    expect(await db.select().from(attendance).where(eq(attendance.parishId, parishId))).toHaveLength(0)
    await linkIdentities()
    const mapped = await previewTiniAttendance(bundle(), actorId, parishId)
    expect(mapped.items[0]).toMatchObject({ classification: 'new', targetStudentId: studentId,
      expectedVersion: 0 })
  })

  it('proposes a unique name, birth-date and class match and reviews all links atomically', async () => {
    const raw = bundle()
    const preview = await previewTiniAttendance(raw, actorId, parishId)
    const classSuggestion = preview.identityLinkSuggestions.find(item => item.entityKind === 'class')!
    const studentSuggestion = preview.identityLinkSuggestions.find(item => item.entityKind === 'student')!
    expect(classSuggestion).toMatchObject({ status: 'review', recommendedTargetId: classId })
    expect(studentSuggestion).toMatchObject({ status: 'high_confidence', recommendedTargetId: studentId,
      sourceDateOfBirth: '2015-01-01' })
    expect(studentSuggestion.candidates[0].evidence).toEqual(expect.arrayContaining([
      'name_exact', 'date_of_birth_exact', 'class_name_exact',
    ]))

    const selected = [classSuggestion, studentSuggestion].map(item => ({
      entityKind: item.entityKind, externalId: item.externalId, targetId: item.recommendedTargetId!,
    }))
    const saved = await saveSuggestedTiniLinks({ raw, runId: preview.runId, selected,
      reason: 'Đã đối chiếu tự động theo ba trường', parishId, actorId })
    expect(saved.links).toHaveLength(2)
    expect(saved.links.every(item => item.outcome === 'created')).toBe(true)
    const replay = await saveSuggestedTiniLinks({ raw, runId: preview.runId, selected,
      reason: 'Đã đối chiếu tự động theo ba trường', parishId, actorId })
    expect(replay.links.every(item => item.outcome === 'existing')).toBe(true)
    expect((await previewTiniAttendance(raw, actorId, parishId)).items[0].classification).toBe('new')
  })

  it('keeps ambiguous same-name and same-birth-date candidates manual and rolls back a mixed bulk review', async () => {
    await db.update(students).set({ dateOfBirth: '2015-01-01' }).where(and(
      eq(students.parishId, parishId), eq(students.id, secondStudentId)))
    const raw = bundle()
    const preview = await previewTiniAttendance(raw, actorId, parishId)
    const classSuggestion = preview.identityLinkSuggestions.find(item => item.entityKind === 'class')!
    const studentSuggestion = preview.identityLinkSuggestions.find(item => item.entityKind === 'student')!
    expect(studentSuggestion).toMatchObject({ status: 'ambiguous', recommendedTargetId: null })
    await expect(saveSuggestedTiniLinks({ raw, runId: preview.runId, parishId, actorId,
      reason: 'Không được duyệt ứng viên mơ hồ', selected: [
        { entityKind: 'class', externalId: classSuggestion.externalId, targetId: classSuggestion.recommendedTargetId! },
        { entityKind: 'student', externalId: studentSuggestion.externalId, targetId: studentId },
      ] })).rejects.toThrow(/không còn hợp lệ/)
    expect(await db.select().from(externalEntityLinks).where(eq(externalEntityLinks.parishId, parishId)))
      .toHaveLength(0)
  })

  it('does not suggest a Catevia student or class already linked to another TINI ID', async () => {
    await linkIdentities()
    await saveTiniLink({ parishId, actorId, entityKind: 'class', externalScope: '2',
      externalId: 'l_other', targetId: otherClassId, expectedVersion: 0, reason: 'Đã đối chiếu lớp khác',
      sourceYearLabel: '2026-2027' })
    await saveTiniLink({ parishId, actorId, entityKind: 'student', externalScope: '',
      externalId: '1000099', targetId: secondStudentId, expectedVersion: 0, reason: 'Đã đối chiếu học viên khác' })
    const source = JSON.parse(bundle())
    source.scope.externalClassId = 'l_23'
    source.observations[0].externalStudentId = '1000002'
    source.observations[0].externalClassId = 'l_23'
    const preview = await previewTiniAttendance(refreshFingerprints(source), actorId, parishId)
    expect(preview.identityLinkSuggestions).toEqual([
      expect.objectContaining({ entityKind: 'class', status: 'not_found', recommendedTargetId: null }),
      expect.objectContaining({ entityKind: 'student', status: 'not_found', recommendedTargetId: null }),
    ])
  })

  it('does not report a false name difference when TINI includes the Catevia holy name', async () => {
    await linkIdentities()
    const source = JSON.parse(bundle())
    source.observations[0].studentName = 'Phaolô Học viên Mẫu'
    const preview = await previewTiniAttendance(refreshFingerprints(source), actorId, parishId)
    expect(preview.studentProfileSuggestions).toEqual([])
  })

  it('proposes reviewed profile differences once per linked student without changing the student', async () => {
    await linkIdentities()
    const source = JSON.parse(bundle())
    source.observations[0].studentName = 'Học viên Đúng Trên TINI'
    const namePreview = await previewTiniAttendance(refreshFingerprints(source), actorId, parishId)
    expect(namePreview).toMatchObject({ sourceSchemaVersion: 3, profileComparisonAvailable: true })
    expect(namePreview.studentProfileSuggestions).toEqual([expect.objectContaining({
      externalStudentId: '1000001', targetStudentId: studentId,
      identityBasis: 'reviewed_external_id_link',
      differences: [expect.objectContaining({
        field: 'displayName', kind: 'content', cateviaValue: 'Phaolô Học viên Mẫu',
        tiniValue: 'Học viên Đúng Trên TINI', recommendation: 'review_name_parts',
      })],
    })])
    const [unchanged] = await db.select().from(students).where(and(
      eq(students.parishId, parishId), eq(students.id, studentId)))
    expect(unchanged).toMatchObject({ holyName: 'Phaolô', fullName: 'Học viên Mẫu', classId })

    await db.update(students).set({ classId: otherClassId }).where(and(
      eq(students.parishId, parishId), eq(students.id, studentId)))
    const classPreview = await previewTiniAttendance(bundle(), actorId, parishId)
    expect(classPreview.studentProfileSuggestions[0].differences).toContainEqual(expect.objectContaining({
      field: 'classMembership', kind: 'membership', cateviaValue: 'Ấu Nhi 1B',
      tiniValue: 'Ấu Nhi 1A', proposedClassId: classId,
      recommendation: 'use_membership_correction_workflow',
    }))
  })

  it('suggests a birth-date correction only after a reviewed identity link and leaves the profile unchanged', async () => {
    await linkIdentities()
    const source = JSON.parse(bundle())
    source.observations[0].dateOfBirth = '2015-02-02'
    const preview = await previewTiniAttendance(refreshFingerprints(source), actorId, parishId)
    expect(preview.studentProfileSuggestions).toEqual([expect.objectContaining({
      identityBasis: 'reviewed_external_id_link',
      differences: [expect.objectContaining({
        field: 'dateOfBirth', kind: 'birth_date', cateviaValue: '2015-01-01',
        tiniValue: '2015-02-02', recommendation: 'review_birth_date',
      })],
    })])
    const [unchanged] = await db.select({ dateOfBirth: students.dateOfBirth }).from(students)
      .where(and(eq(students.parishId, parishId), eq(students.id, studentId)))
    expect(unchanged.dateOfBirth).toBe('2015-01-01')
  })

  it('accepts legacy schema v1 for attendance but does not trust it for profile proposals', async () => {
    await linkIdentities()
    const source = JSON.parse(bundle())
    source.schemaVersion = 1
    source.observations[0].studentName = 'Tên có thể đã bị sửa trong tệp cũ'
    const preview = await previewTiniAttendance(refreshFingerprints(source), actorId, parishId)
    expect(preview).toMatchObject({ sourceSchemaVersion: 1, profileComparisonAvailable: false,
      studentProfileSuggestions: [] })
    expect(preview.items[0].classification).toBe('new')
  })

  it('rejects contradictory profile values for one TINI student ID', async () => {
    const source = JSON.parse(bundle())
    source.observations.push({ ...source.observations[0], studentName: 'Một tên khác', sourceTitle: 'Có mặt Giáo lý' })
    await expect(previewTiniAttendance(refreshFingerprints(source), actorId, parishId))
      .rejects.toThrow(/hồ sơ mâu thuẫn/)
  })

  it('rejects contradictory class names for one TINI class ID', async () => {
    const source = JSON.parse(bundle())
    source.scope.externalClassId = null
    source.observations.push({ ...source.observations[0], externalStudentId: '1000002',
      className: 'Một lớp khác' })
    await expect(previewTiniAttendance(refreshFingerprints(source), actorId, parishId))
      .rejects.toThrow(/tên lớp mâu thuẫn/)
  })

  it('commits through Attendance, then replays receipt without a second mutation or audit', async () => {
    await linkIdentities()
    const raw = bundle()
    const preview = await previewTiniAttendance(raw, actorId, parishId)
    const first = await commitTiniAttendance(raw, preview.runId, [0], actor)
    expect(first.receipts).toMatchObject([{ index: 0, outcome: 'created', version: 1 }])
    const replay = await commitTiniAttendance(raw, preview.runId, [0], actor)
    expect(replay.receipts).toEqual(first.receipts)
    const rows = await db.select().from(attendance).where(eq(attendance.parishId, parishId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ studentId, date: '2026-09-20', type: 'SundayMass', status: 'Present', version: 1 })
    const mutationAudit = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishId),
      eq(auditLogs.action, 'IMPORT_TINI_ATTENDANCE')))
    expect(mutationAudit).toHaveLength(1)
    expect(mutationAudit[0].newValue).toContain(preview.runId)
    const again = await previewTiniAttendance(raw, actorId, parishId)
    expect(again.items[0].classification).toBe('identical')
    const identical = await commitTiniAttendance(raw, again.runId, [0], actor)
    expect(identical.receipts[0].outcome).toBe('identical')
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishId),
      eq(auditLogs.action, 'IMPORT_TINI_ATTENDANCE')))).toHaveLength(1)
  })

  it('rolls back every selected item when a later receipt is no longer committable', async () => {
    await linkIdentities()
    const source = JSON.parse(bundle())
    const catechism = { ...source.observations[0], sourceTitle: 'Có mặt Giáo lý' }
    catechism.sourceFingerprint = createHash('sha256').update(JSON.stringify([
      source.academicYear.externalId, catechism.externalStudentId, catechism.externalClassId,
      catechism.date, catechism.sourceTitle, catechism.late,
      catechism.studentName, catechism.className,
      catechism.dateOfBirth,
    ])).digest('hex')
    source.observations.push(catechism)
    const raw = JSON.stringify(source)
    const preview = await previewTiniAttendance(raw, actorId, parishId)
    await db.update(externalImportItems).set({ classification: 'invalid' }).where(and(
      eq(externalImportItems.parishId, parishId), eq(externalImportItems.runId, preview.runId),
      eq(externalImportItems.itemIndex, 1),
    ))
    await expect(commitTiniAttendance(raw, preview.runId, [0, 1], actor))
      .rejects.toThrow(/Chỉ có thể xác nhận/)
    expect(await db.select().from(attendance).where(eq(attendance.parishId, parishId))).toHaveLength(0)
    const [firstItem] = await db.select().from(externalImportItems).where(and(
      eq(externalImportItems.parishId, parishId), eq(externalImportItems.runId, preview.runId),
      eq(externalImportItems.itemIndex, 0),
    ))
    expect(firstItem.receipt).toBeNull()
  })

  it('rejects changed file under the same preview identity and stale mapping versions', async () => {
    await linkIdentities()
    const raw = bundle()
    const preview = await previewTiniAttendance(raw, actorId, parishId)
    await expect(commitTiniAttendance(bundle('Vắng có phép Thánh lễ'), preview.runId, [0], actor))
      .rejects.toThrow(/không khớp/)
    const tampered = JSON.parse(raw)
    tampered.observations[0].sourceTitle = 'Vắng không phép Thánh lễ'
    await expect(previewTiniAttendance(JSON.stringify(tampered), actorId, parishId))
      .rejects.toThrow(/Dấu vân tay/)
    const tamperedProfile = JSON.parse(raw)
    tamperedProfile.observations[0].studentName = 'Tên đã bị sửa sau khi xuất'
    await expect(previewTiniAttendance(JSON.stringify(tamperedProfile), actorId, parishId))
      .rejects.toThrow(/Dấu vân tay/)
    await saveTiniLink({ parishId, actorId, entityKind: 'student', externalScope: '',
      externalId: '1000001', targetId: studentId, expectedVersion: 1,
      reason: 'Xác nhận lại hồ sơ gốc' })
    const stale = await commitTiniAttendance(raw, preview.runId, [0], actor)
    expect(stale.receipts[0].outcome).toBe('stale')
    expect(await db.select().from(attendance).where(eq(attendance.parishId, parishId))).toHaveLength(0)
  })

  it('does not overwrite attendance or membership that changes after preview', async () => {
    await linkIdentities()
    const raw = bundle()
    const attendancePreview = await previewTiniAttendance(raw, actorId, parishId)
    await db.insert(attendance).values({ id: 'ATT-TINI-CONCURRENT', parishId, studentId,
      date: '2026-09-20', type: 'SundayMass', status: 'AbsentExcused', version: 1 })
    expect((await commitTiniAttendance(raw, attendancePreview.runId, [0], actor)).receipts[0].outcome).toBe('stale')
    const [unchanged] = await db.select().from(attendance).where(and(
      eq(attendance.parishId, parishId), eq(attendance.id, 'ATT-TINI-CONCURRENT')))
    expect(unchanged.status).toBe('AbsentExcused')

    await db.delete(attendance).where(eq(attendance.parishId, parishId))
    const membershipPreview = await previewTiniAttendance(raw, actorId, parishId)
    await db.update(students).set({ classId: otherClassId }).where(and(
      eq(students.parishId, parishId), eq(students.id, studentId)))
    expect((await commitTiniAttendance(raw, membershipPreview.runId, [0], actor)).receipts[0].outcome).toBe('stale')
    expect(await db.select().from(attendance).where(eq(attendance.parishId, parishId))).toHaveLength(0)
  })

  it('preserves a visible late marker as audit provenance without inventing a new status', async () => {
    await linkIdentities()
    const source = JSON.parse(bundle())
    source.observations[0].late = true
    const raw = refreshFingerprints(source)
    const preview = await previewTiniAttendance(raw, actorId, parishId)
    await commitTiniAttendance(raw, preview.runId, [0], actor)
    const [row] = await db.select().from(attendance).where(eq(attendance.parishId, parishId))
    expect(row).toMatchObject({ status: 'Present', note: null })
    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId), eq(auditLogs.action, 'IMPORT_TINI_ATTENDANCE')))
    expect(JSON.parse(audit.newValue!).provenance).toMatchObject({ provider: 'tini', late: true })
  })

  it('classifies unsupported, duplicates, conflicts and finalized-year locks without writing', async () => {
    await linkIdentities()
    expect((await previewTiniAttendance(bundle('Chầu Thánh Thể'), actorId, parishId)).items[0].classification).toBe('unsupported')
    const duplicated = JSON.parse(bundle())
    duplicated.observations.push(duplicated.observations[0])
    expect((await previewTiniAttendance(JSON.stringify(duplicated), actorId, parishId)).counts.invalid).toBe(2)
    await db.insert(attendance).values({ id: 'ATT-TINI-EXISTING', parishId, studentId,
      date: '2026-09-20', type: 'SundayMass', status: 'AbsentUnexcused', version: 1 })
    expect((await previewTiniAttendance(bundle(), actorId, parishId)).items[0].classification).toBe('conflict')
    await db.update(academicYears).set({ status: 'FINALIZED' }).where(and(eq(academicYears.parishId, parishId), eq(academicYears.id, yearId)))
    expect((await previewTiniAttendance(bundle(), actorId, parishId)).items[0].classification).toBe('locked')
  })

  it('normalizes the verified absent badges, and rejects a badge that disagrees with the selected filter', async () => {
    await linkIdentities()
    const absent = JSON.parse(bundle('Vắng không phép Giáo lý'))
    absent.scope.filter = 'Vắng - Tất cả'
    const valid = await previewTiniAttendance(JSON.stringify(absent), actorId, parishId)
    expect(valid.items[0]).toMatchObject({ classification: 'new', normalized: {
      type: 'CatechismClass', status: 'AbsentUnexcused',
    } })
    absent.scope.filter = 'Hiện diện - Tất cả'
    expect((await previewTiniAttendance(JSON.stringify(absent), actorId, parishId)).items[0].classification).toBe('invalid')
  })

  it('classifies a future source date as invalid', async () => {
    const future = JSON.parse(bundle())
    future.academicYear.label = '2099-2100'
    future.scope.date = '2099-09-20'
    future.observations[0].date = '2099-09-20'
    expect((await previewTiniAttendance(refreshFingerprints(future), actorId, parishId)).items[0].classification)
      .toBe('invalid')
  })

  it('rejects cross-parish target IDs when creating a mapping', async () => {
    await expect(saveTiniLink({ parishId: 'other-parish', actorId, entityKind: 'student',
      externalScope: '', externalId: '1000001', targetId: studentId, expectedVersion: 0,
      reason: 'Đã đối chiếu hồ sơ' })).rejects.toThrow(/Không tìm thấy/)
  })

  it('prevents two source IDs from claiming one target and rejects stale relinks', async () => {
    await linkIdentities()
    await expect(saveTiniLink({ parishId, actorId, entityKind: 'student', externalScope: '',
      externalId: '1000002', targetId: studentId, expectedVersion: 0,
      reason: 'Thử liên kết trùng hồ sơ' })).rejects.toThrow(/mã TINI khác/)
    await expect(saveTiniLink({ parishId, actorId, entityKind: 'student', externalScope: '',
      externalId: '1000001', targetId: secondStudentId, expectedVersion: 0,
      reason: 'Thử ghi đè liên kết cũ' })).rejects.toThrow(/đã thay đổi/)
  })

  it('retires and relinks an identity with a reason while preserving the prior audit', async () => {
    await linkIdentities()
    const [old] = await db.select().from(externalEntityLinks).where(and(
      eq(externalEntityLinks.parishId, parishId), eq(externalEntityLinks.externalId, '1000001')))
    await retireTiniLink({ parishId, actorId, id: old.id, expectedVersion: 1,
      reason: 'Phát hiện liên kết nhầm hồ sơ' })
    const next = await saveTiniLink({ parishId, actorId, entityKind: 'student', externalScope: '',
      externalId: '1000001', targetId: secondStudentId, expectedVersion: 0,
      reason: 'Đã đối chiếu lại hồ sơ gốc' })
    expect(next.id).not.toBe(old.id)
    const linked = await db.select().from(externalEntityLinks).where(and(
      eq(externalEntityLinks.parishId, parishId), eq(externalEntityLinks.externalId, '1000001')))
    expect(linked).toHaveLength(2)
    expect(linked.find(item => item.id === old.id)?.retiredAt).toBeTruthy()
    expect(linked.find(item => item.id === next.id)?.targetId).toBe(secondStudentId)
  })
})
