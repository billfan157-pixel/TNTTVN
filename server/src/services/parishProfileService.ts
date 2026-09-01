import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db, runDbTransaction, type DbTransaction } from '../db/index.js'
import {
  auditLogs,
  parishArchiveAssets,
  parishOrganizationUnits,
  parishEvents,
  parishPeople,
  parishProfiles,
  parishRecordAssets,
  parishRecordPeople,
  parishRecords,
  parishServiceTerms,
  users,
} from '../db/schema.js'
import { generateId } from '../utils/id.js'
import type {
  MutationContext,
  ParishAssetInput,
  ParishExternalAssetInput,
  ParishPersonInput,
  ParishProfileInput,
  ParishProfileRole,
  ParishRecordInput,
  ParishTermInput,
  ParishUnitInput,
  ParishUploadedAssetInput,
} from '../types/parishProfile.js'

type DomainError = Error & { status: number; code: string }

function parishError(status: number, code: string, message: string): never {
  const error = new Error(message) as DomainError
  error.status = status
  error.code = code
  throw error
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function audit(
  tx: DbTransaction,
  context: MutationContext,
  action: string,
  entityType: string,
  entityId: string,
  changedFields: string[],
) {
  return tx.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: context.userId,
    action,
    entityType,
    entityId,
    oldValue: null,
    // ADR-081 privacy: audit structure, not biography/content/file/link payload.
    newValue: JSON.stringify({ changedFields }),
    ip: context.ip,
    userAgent: context.userAgent,
    parishId: context.parishId,
    createdAt: new Date().toISOString(),
  })
}

async function requirePerson(tx: DbTransaction, parishId: string, id: string) {
  const [row] = await tx.select({ id: parishPeople.id }).from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId),
    eq(parishPeople.id, id),
    isNull(parishPeople.deletedAt),
  )).limit(1)
  if (!row) parishError(404, 'PARISH_PERSON_NOT_FOUND', 'Không tìm thấy hồ sơ nhân sự trong Xứ đoàn hiện tại')
}

async function requireLinkedUser(tx: DbTransaction, parishId: string, id?: string | null) {
  if (!id) return
  const [row] = await tx.select({ id: users.id }).from(users).where(and(
    eq(users.parishId, parishId),
    eq(users.id, id),
    isNull(users.deletedAt),
  )).limit(1)
  if (!row) parishError(404, 'PARISH_LINKED_USER_INVALID', 'Tài khoản liên kết không thuộc Xứ đoàn hiện tại')
}

async function assertLinkedUserAvailable(tx: DbTransaction, parishId: string, linkedUserId?: string | null, personId?: string) {
  if (!linkedUserId) return
  const [existing] = await tx.select({ id: parishPeople.id }).from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId),
    eq(parishPeople.linkedUserId, linkedUserId),
    isNull(parishPeople.deletedAt),
    ...(personId ? [ne(parishPeople.id, personId)] : []),
  )).limit(1)
  if (existing) parishError(409, 'PARISH_LINKED_USER_DUPLICATE', 'Tài khoản này đã có một hồ sơ nhân sự Xứ đoàn')
}

async function requireUnit(tx: DbTransaction, parishId: string, id: string) {
  const [row] = await tx.select({ id: parishOrganizationUnits.id }).from(parishOrganizationUnits).where(and(
    eq(parishOrganizationUnits.parishId, parishId),
    eq(parishOrganizationUnits.id, id),
    isNull(parishOrganizationUnits.deletedAt),
  )).limit(1)
  if (!row) parishError(404, 'PARISH_UNIT_NOT_FOUND', 'Không tìm thấy đơn vị tổ chức trong Xứ đoàn hiện tại')
}

async function requireRecord(tx: DbTransaction, parishId: string, id: string) {
  const [row] = await tx.select({ id: parishRecords.id }).from(parishRecords).where(and(
    eq(parishRecords.parishId, parishId),
    eq(parishRecords.id, id),
    isNull(parishRecords.deletedAt),
  )).limit(1)
  if (!row) parishError(404, 'PARISH_RECORD_NOT_FOUND', 'Không tìm thấy bản ghi trong Xứ đoàn hiện tại')
}

async function requireAsset(tx: DbTransaction, parishId: string, id: string) {
  const [row] = await tx.select({ id: parishArchiveAssets.id }).from(parishArchiveAssets).where(and(
    eq(parishArchiveAssets.parishId, parishId),
    eq(parishArchiveAssets.id, id),
    isNull(parishArchiveAssets.deletedAt),
  )).limit(1)
  if (!row) parishError(404, 'PARISH_ASSET_NOT_FOUND', 'Không tìm thấy tư liệu trong Xứ đoàn hiện tại')
}

async function requireSourceEvent(tx: DbTransaction, parishId: string, id?: string | null) {
  if (!id) return
  const [row] = await tx.select({ id: parishEvents.id }).from(parishEvents).where(and(
    eq(parishEvents.parishId, parishId),
    eq(parishEvents.id, id),
    isNull(parishEvents.deletedAt),
  )).limit(1)
  if (!row) parishError(404, 'PARISH_SOURCE_EVENT_INVALID', 'Sự kiện nguồn không thuộc Xứ đoàn hiện tại')
}

async function requireReferences(
  tx: DbTransaction,
  parishId: string,
  personIds: string[] = [],
  assetIds: string[] = [],
  recordIds: string[] = [],
) {
  const uniquePeople = [...new Set(personIds)]
  const uniqueAssets = [...new Set(assetIds)]
  const uniqueRecords = [...new Set(recordIds)]

  if (uniquePeople.length > 0) {
    const rows = await tx.select({ id: parishPeople.id }).from(parishPeople).where(and(
      eq(parishPeople.parishId, parishId),
      inArray(parishPeople.id, uniquePeople),
      isNull(parishPeople.deletedAt),
    ))
    if (rows.length !== uniquePeople.length) parishError(404, 'PARISH_PERSON_REFERENCE_INVALID', 'Một hồ sơ nhân sự không thuộc Xứ đoàn hiện tại')
  }
  if (uniqueAssets.length > 0) {
    const rows = await tx.select({ id: parishArchiveAssets.id }).from(parishArchiveAssets).where(and(
      eq(parishArchiveAssets.parishId, parishId),
      inArray(parishArchiveAssets.id, uniqueAssets),
      isNull(parishArchiveAssets.deletedAt),
    ))
    if (rows.length !== uniqueAssets.length) parishError(404, 'PARISH_ASSET_REFERENCE_INVALID', 'Một tư liệu không thuộc Xứ đoàn hiện tại')
  }
  if (uniqueRecords.length > 0) {
    const rows = await tx.select({ id: parishRecords.id }).from(parishRecords).where(and(
      eq(parishRecords.parishId, parishId),
      inArray(parishRecords.id, uniqueRecords),
      isNull(parishRecords.deletedAt),
    ))
    if (rows.length !== uniqueRecords.length) parishError(404, 'PARISH_RECORD_REFERENCE_INVALID', 'Một bản ghi không thuộc Xứ đoàn hiện tại')
  }
}

async function assertUnitParent(tx: DbTransaction, parishId: string, unitId: string, parentId?: string | null) {
  if (!parentId) return
  if (parentId === unitId) parishError(409, 'PARISH_UNIT_CYCLE', 'Đơn vị không thể là cấp trên của chính nó')
  await requireUnit(tx, parishId, parentId)
  let cursor: string | null = parentId
  const visited = new Set<string>()
  while (cursor) {
    if (cursor === unitId) parishError(409, 'PARISH_UNIT_CYCLE', 'Cấu trúc tổ chức tạo vòng lặp cấp trên–cấp dưới')
    if (visited.has(cursor)) parishError(409, 'PARISH_UNIT_CYCLE', 'Cấu trúc tổ chức hiện có vòng lặp')
    visited.add(cursor)
    const [parent] = await tx.select({ parentId: parishOrganizationUnits.parentId }).from(parishOrganizationUnits).where(and(
      eq(parishOrganizationUnits.parishId, parishId),
      eq(parishOrganizationUnits.id, cursor),
      isNull(parishOrganizationUnits.deletedAt),
    )).limit(1)
    cursor = parent?.parentId ?? null
  }
}

export async function getParishProfileSnapshot(parishId: string, role: ParishProfileRole) {
  const isAdmin = role === 'admin'
  const [profile] = await db.select().from(parishProfiles).where(eq(parishProfiles.parishId, parishId)).limit(1)
  const accounts = isAdmin ? await db.select({
    id: users.id,
    fullName: users.fullName,
    holyName: users.holyName,
    role: users.role,
    status: users.status,
  }).from(users).where(and(eq(users.parishId, parishId), ne(users.role, 'phuhuynh'), isNull(users.deletedAt))) : []

  const people = await db.select().from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId),
    isNull(parishPeople.deletedAt),
    ...(isAdmin ? [] : [eq(parishPeople.visibility, 'STAFF' as const)]),
  )).orderBy(asc(parishPeople.fullName))

  const units = await db.select().from(parishOrganizationUnits).where(and(
    eq(parishOrganizationUnits.parishId, parishId),
    isNull(parishOrganizationUnits.deletedAt),
    ...(isAdmin ? [] : [eq(parishOrganizationUnits.isActive, true)]),
  )).orderBy(asc(parishOrganizationUnits.sortOrder), asc(parishOrganizationUnits.name))

  const visiblePersonIds = new Set(people.map(person => person.id))
  const visibleUnitIds = new Set(units.map(unit => unit.id))
  const allTerms = await db.select().from(parishServiceTerms).where(and(
    eq(parishServiceTerms.parishId, parishId),
    isNull(parishServiceTerms.deletedAt),
  )).orderBy(desc(parishServiceTerms.startDate))
  const terms = allTerms.filter(term => visiblePersonIds.has(term.personId) && (!term.unitId || visibleUnitIds.has(term.unitId)))

  const records = await db.select().from(parishRecords).where(and(
    eq(parishRecords.parishId, parishId),
    isNull(parishRecords.deletedAt),
    ...(isAdmin ? [] : [eq(parishRecords.status, 'PUBLISHED' as const), eq(parishRecords.visibility, 'STAFF' as const)]),
  )).orderBy(desc(parishRecords.occurredOn), desc(parishRecords.createdAt))

  const assets = await db.select().from(parishArchiveAssets).where(and(
    eq(parishArchiveAssets.parishId, parishId),
    isNull(parishArchiveAssets.deletedAt),
    ...(isAdmin ? [] : [eq(parishArchiveAssets.visibility, 'STAFF' as const)]),
  )).orderBy(desc(parishArchiveAssets.capturedOn), desc(parishArchiveAssets.createdAt))

  const recordIds = new Set(records.map(record => record.id))
  const assetIds = new Set(assets.map(asset => asset.id))
  const personLinks = (await db.select().from(parishRecordPeople).where(eq(parishRecordPeople.parishId, parishId)))
    .filter(link => recordIds.has(link.recordId) && visiblePersonIds.has(link.personId))
  const assetLinks = (await db.select().from(parishRecordAssets).where(eq(parishRecordAssets.parishId, parishId)))
    .filter(link => recordIds.has(link.recordId) && assetIds.has(link.assetId))

  const enrichedRecords = records.map(record => ({
    ...record,
    personIds: personLinks.filter(link => link.recordId === record.id).map(link => link.personId),
    assetIds: assetLinks.filter(link => link.recordId === record.id).map(link => link.assetId),
  }))

  const personById = new Map(people.map(person => [person.id, person]))
  const unitById = new Map(units.map(unit => [unit.id, unit]))
  const timeline = [
    ...(profile?.foundedDate ? [{
      id: `profile-founded-${parishId}`,
      kind: 'FOUNDING' as const,
      date: profile.foundedDate,
      endDate: null,
      title: `Thành lập ${profile.displayName}`,
      summary: profile.patronName ? `Bổn mạng: ${profile.patronName}` : null,
      recordType: 'MILESTONE' as const,
    }] : []),
    ...enrichedRecords.filter(record => record.showOnTimeline).map(record => ({
      id: record.id,
      kind: 'RECORD' as const,
      date: record.occurredOn,
      endDate: record.endedOn,
      title: record.title,
      summary: record.summary,
      recordType: record.recordType,
    })),
    ...terms.map(term => ({
      id: `term-start-${term.id}`,
      kind: 'TERM_START' as const,
      date: term.startDate,
      endDate: term.endDate,
      title: `${personById.get(term.personId)?.fullName ?? 'Nhân sự'} — ${term.positionTitle}`,
      summary: term.unitId ? unitById.get(term.unitId)?.name ?? null : null,
      recordType: null,
    })),
    ...terms.filter(term => term.endDate).map(term => ({
      id: `term-end-${term.id}`,
      kind: 'TERM_END' as const,
      date: term.endDate!,
      endDate: null,
      title: `Kết thúc nhiệm kỳ — ${personById.get(term.personId)?.fullName ?? 'Nhân sự'}`,
      summary: `${term.positionTitle}${term.unitId ? ` · ${unitById.get(term.unitId)?.name ?? 'Đơn vị'}` : ''}`,
      recordType: null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'vi'))

  return {
    profile: profile ?? {
      parishId,
      displayName: 'Xứ Đoàn Đức Mẹ Fatima',
      patronName: 'Đức Mẹ Fatima',
      foundedDate: null,
      motto: null,
      description: null,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
    },
    people,
    units,
    terms,
    records: enrichedRecords,
    assets,
    timeline,
    accounts,
    permissions: { canManage: isAdmin, canUpload: isAdmin },
  }
}

export async function updateParishProfile(input: ParishProfileInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    const now = new Date().toISOString()
    const row = {
      parishId: context.parishId,
      displayName: input.displayName.trim(),
      patronName: nullableText(input.patronName),
      foundedDate: input.foundedDate || null,
      motto: nullableText(input.motto),
      description: nullableText(input.description),
      updatedBy: context.userId,
      updatedAt: now,
    }
    await tx.insert(parishProfiles).values({ ...row, createdAt: now }).onConflictDoUpdate({
      target: parishProfiles.parishId,
      set: row,
    })
    await audit(tx, context, 'PARISH_PROFILE_UPDATE', 'parish_profile', context.parishId, Object.keys(input))
    return row
  })
}

export async function createParishPerson(input: ParishPersonInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requireLinkedUser(tx, context.parishId, input.linkedUserId)
    await assertLinkedUserAvailable(tx, context.parishId, input.linkedUserId)
    const id = generateId('PPE')
    const now = new Date().toISOString()
    const row = {
      id,
      parishId: context.parishId,
      linkedUserId: nullableText(input.linkedUserId),
      holyName: nullableText(input.holyName),
      fullName: input.fullName.trim(),
      birthYear: input.birthYear ?? null,
      biography: nullableText(input.biography),
      serviceStatus: input.serviceStatus,
      visibility: input.visibility,
      createdBy: context.userId,
      updatedBy: context.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await tx.insert(parishPeople).values(row)
    await audit(tx, context, 'PARISH_PERSON_CREATE', 'parish_person', id, ['serviceStatus', 'visibility'])
    return row
  })
}

export async function updateParishPerson(id: string, input: ParishPersonInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requirePerson(tx, context.parishId, id)
    await requireLinkedUser(tx, context.parishId, input.linkedUserId)
    await assertLinkedUserAvailable(tx, context.parishId, input.linkedUserId, id)
    const row = {
      linkedUserId: nullableText(input.linkedUserId),
      holyName: nullableText(input.holyName),
      fullName: input.fullName.trim(),
      birthYear: input.birthYear ?? null,
      biography: nullableText(input.biography),
      serviceStatus: input.serviceStatus,
      visibility: input.visibility,
      updatedBy: context.userId,
      updatedAt: new Date().toISOString(),
    }
    await tx.update(parishPeople).set(row).where(and(eq(parishPeople.parishId, context.parishId), eq(parishPeople.id, id)))
    await audit(tx, context, 'PARISH_PERSON_UPDATE', 'parish_person', id, Object.keys(input))
    return { id, parishId: context.parishId, ...row }
  })
}

export async function deleteParishPerson(id: string, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requirePerson(tx, context.parishId, id)
    const [term] = await tx.select({ id: parishServiceTerms.id }).from(parishServiceTerms).where(and(
      eq(parishServiceTerms.parishId, context.parishId), eq(parishServiceTerms.personId, id), isNull(parishServiceTerms.deletedAt),
    )).limit(1)
    const [recordLink] = await tx.select({ personId: parishRecordPeople.personId }).from(parishRecordPeople).where(and(
      eq(parishRecordPeople.parishId, context.parishId), eq(parishRecordPeople.personId, id),
    )).limit(1)
    if (term || recordLink) parishError(409, 'PARISH_PERSON_IN_USE', 'Không thể xóa nhân sự đang có nhiệm kỳ hoặc được liên kết với bản ghi')
    const now = new Date().toISOString()
    await tx.update(parishPeople).set({ deletedAt: now, updatedAt: now, updatedBy: context.userId }).where(and(
      eq(parishPeople.parishId, context.parishId), eq(parishPeople.id, id),
    ))
    await audit(tx, context, 'PARISH_PERSON_DELETE', 'parish_person', id, ['deletedAt'])
    return true
  })
}

export async function createParishUnit(input: ParishUnitInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    const id = generateId('POU')
    await assertUnitParent(tx, context.parishId, id, input.parentId)
    const now = new Date().toISOString()
    const row = {
      id,
      parishId: context.parishId,
      parentId: input.parentId || null,
      name: input.name.trim(),
      unitType: input.unitType,
      description: nullableText(input.description),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      createdBy: context.userId,
      updatedBy: context.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await tx.insert(parishOrganizationUnits).values(row)
    await audit(tx, context, 'PARISH_UNIT_CREATE', 'parish_organization_unit', id, ['unitType', 'parentId', 'isActive'])
    return row
  })
}

export async function updateParishUnit(id: string, input: ParishUnitInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requireUnit(tx, context.parishId, id)
    await assertUnitParent(tx, context.parishId, id, input.parentId)
    const row = {
      parentId: input.parentId || null,
      name: input.name.trim(),
      unitType: input.unitType,
      description: nullableText(input.description),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedBy: context.userId,
      updatedAt: new Date().toISOString(),
    }
    await tx.update(parishOrganizationUnits).set(row).where(and(
      eq(parishOrganizationUnits.parishId, context.parishId), eq(parishOrganizationUnits.id, id),
    ))
    await audit(tx, context, 'PARISH_UNIT_UPDATE', 'parish_organization_unit', id, Object.keys(input))
    return { id, parishId: context.parishId, ...row }
  })
}

export async function deleteParishUnit(id: string, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requireUnit(tx, context.parishId, id)
    const [child] = await tx.select({ id: parishOrganizationUnits.id }).from(parishOrganizationUnits).where(and(
      eq(parishOrganizationUnits.parishId, context.parishId), eq(parishOrganizationUnits.parentId, id), isNull(parishOrganizationUnits.deletedAt),
    )).limit(1)
    const [term] = await tx.select({ id: parishServiceTerms.id }).from(parishServiceTerms).where(and(
      eq(parishServiceTerms.parishId, context.parishId), eq(parishServiceTerms.unitId, id), isNull(parishServiceTerms.deletedAt),
    )).limit(1)
    if (child || term) parishError(409, 'PARISH_UNIT_IN_USE', 'Không thể xóa đơn vị đang có đơn vị con hoặc nhiệm kỳ liên kết')
    const now = new Date().toISOString()
    await tx.update(parishOrganizationUnits).set({ deletedAt: now, updatedAt: now, updatedBy: context.userId }).where(and(
      eq(parishOrganizationUnits.parishId, context.parishId), eq(parishOrganizationUnits.id, id),
    ))
    await audit(tx, context, 'PARISH_UNIT_DELETE', 'parish_organization_unit', id, ['deletedAt'])
    return true
  })
}

export async function createParishTerm(input: ParishTermInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requirePerson(tx, context.parishId, input.personId)
    if (input.unitId) await requireUnit(tx, context.parishId, input.unitId)
    const id = generateId('PST')
    const now = new Date().toISOString()
    const row = {
      id,
      parishId: context.parishId,
      personId: input.personId,
      unitId: input.unitId || null,
      positionTitle: input.positionTitle.trim(),
      rankTitle: nullableText(input.rankTitle),
      startDate: input.startDate,
      endDate: input.endDate || null,
      notes: nullableText(input.notes),
      createdBy: context.userId,
      updatedBy: context.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await tx.insert(parishServiceTerms).values(row)
    await audit(tx, context, 'PARISH_TERM_CREATE', 'parish_service_term', id, ['personId', 'unitId', 'positionTitle', 'startDate', 'endDate'])
    return row
  })
}

export async function updateParishTerm(id: string, input: ParishTermInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    const [existing] = await tx.select({ id: parishServiceTerms.id }).from(parishServiceTerms).where(and(
      eq(parishServiceTerms.parishId, context.parishId), eq(parishServiceTerms.id, id), isNull(parishServiceTerms.deletedAt),
    )).limit(1)
    if (!existing) parishError(404, 'PARISH_TERM_NOT_FOUND', 'Không tìm thấy nhiệm kỳ trong Xứ đoàn hiện tại')
    await requirePerson(tx, context.parishId, input.personId)
    if (input.unitId) await requireUnit(tx, context.parishId, input.unitId)
    const row = {
      personId: input.personId,
      unitId: input.unitId || null,
      positionTitle: input.positionTitle.trim(),
      rankTitle: nullableText(input.rankTitle),
      startDate: input.startDate,
      endDate: input.endDate || null,
      notes: nullableText(input.notes),
      updatedBy: context.userId,
      updatedAt: new Date().toISOString(),
    }
    await tx.update(parishServiceTerms).set(row).where(and(eq(parishServiceTerms.parishId, context.parishId), eq(parishServiceTerms.id, id)))
    await audit(tx, context, 'PARISH_TERM_UPDATE', 'parish_service_term', id, Object.keys(input))
    return { id, parishId: context.parishId, ...row }
  })
}

export async function deleteParishTerm(id: string, context: MutationContext) {
  return runDbTransaction(async tx => {
    const [existing] = await tx.select({ id: parishServiceTerms.id }).from(parishServiceTerms).where(and(
      eq(parishServiceTerms.parishId, context.parishId), eq(parishServiceTerms.id, id), isNull(parishServiceTerms.deletedAt),
    )).limit(1)
    if (!existing) parishError(404, 'PARISH_TERM_NOT_FOUND', 'Không tìm thấy nhiệm kỳ trong Xứ đoàn hiện tại')
    const now = new Date().toISOString()
    await tx.update(parishServiceTerms).set({ deletedAt: now, updatedAt: now, updatedBy: context.userId }).where(and(
      eq(parishServiceTerms.parishId, context.parishId), eq(parishServiceTerms.id, id),
    ))
    await audit(tx, context, 'PARISH_TERM_DELETE', 'parish_service_term', id, ['deletedAt'])
    return true
  })
}

async function replaceRecordLinks(tx: DbTransaction, parishId: string, recordId: string, personIds: string[], assetIds: string[]) {
  await requireReferences(tx, parishId, personIds, assetIds)
  await tx.delete(parishRecordPeople).where(and(eq(parishRecordPeople.parishId, parishId), eq(parishRecordPeople.recordId, recordId)))
  await tx.delete(parishRecordAssets).where(and(eq(parishRecordAssets.parishId, parishId), eq(parishRecordAssets.recordId, recordId)))
  if (personIds.length > 0) await tx.insert(parishRecordPeople).values([...new Set(personIds)].map(personId => ({ parishId, recordId, personId })))
  if (assetIds.length > 0) await tx.insert(parishRecordAssets).values([...new Set(assetIds)].map(assetId => ({ parishId, recordId, assetId })))
}

export async function createParishRecord(input: ParishRecordInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requireSourceEvent(tx, context.parishId, input.sourceEventId)
    const id = generateId('PRC')
    const now = new Date().toISOString()
    const published = input.status === 'PUBLISHED'
    const row = {
      id,
      parishId: context.parishId,
      recordType: input.recordType,
      title: input.title.trim(),
      summary: nullableText(input.summary),
      content: nullableText(input.content),
      occurredOn: input.occurredOn,
      endedOn: input.endedOn || null,
      location: nullableText(input.location),
      status: input.status,
      visibility: input.visibility,
      showOnTimeline: input.showOnTimeline,
      sourceEventId: nullableText(input.sourceEventId),
      createdBy: context.userId,
      updatedBy: context.userId,
      publishedBy: published ? context.userId : null,
      publishedAt: published ? now : null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await tx.insert(parishRecords).values(row)
    await replaceRecordLinks(tx, context.parishId, id, input.personIds ?? [], input.assetIds ?? [])
    await audit(tx, context, 'PARISH_RECORD_CREATE', 'parish_record', id, ['recordType', 'status', 'visibility', 'showOnTimeline', 'personIds', 'assetIds'])
    return { ...row, personIds: input.personIds ?? [], assetIds: input.assetIds ?? [] }
  })
}

export async function updateParishRecord(id: string, input: ParishRecordInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    const [existing] = await tx.select().from(parishRecords).where(and(
      eq(parishRecords.parishId, context.parishId), eq(parishRecords.id, id), isNull(parishRecords.deletedAt),
    )).limit(1)
    if (!existing) parishError(404, 'PARISH_RECORD_NOT_FOUND', 'Không tìm thấy bản ghi trong Xứ đoàn hiện tại')
    await requireSourceEvent(tx, context.parishId, input.sourceEventId)
    const now = new Date().toISOString()
    const published = input.status === 'PUBLISHED'
    const row = {
      recordType: input.recordType,
      title: input.title.trim(),
      summary: nullableText(input.summary),
      content: nullableText(input.content),
      occurredOn: input.occurredOn,
      endedOn: input.endedOn || null,
      location: nullableText(input.location),
      status: input.status,
      visibility: input.visibility,
      showOnTimeline: input.showOnTimeline,
      sourceEventId: nullableText(input.sourceEventId),
      updatedBy: context.userId,
      publishedBy: published ? (existing.publishedBy || context.userId) : null,
      publishedAt: published ? (existing.publishedAt || now) : null,
      updatedAt: now,
    }
    await tx.update(parishRecords).set(row).where(and(eq(parishRecords.parishId, context.parishId), eq(parishRecords.id, id)))
    await replaceRecordLinks(tx, context.parishId, id, input.personIds ?? [], input.assetIds ?? [])
    await audit(tx, context, 'PARISH_RECORD_UPDATE', 'parish_record', id, Object.keys(input))
    return { id, parishId: context.parishId, ...row, personIds: input.personIds ?? [], assetIds: input.assetIds ?? [] }
  })
}

export async function deleteParishRecord(id: string, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requireRecord(tx, context.parishId, id)
    const now = new Date().toISOString()
    await tx.update(parishRecords).set({ deletedAt: now, updatedAt: now, updatedBy: context.userId }).where(and(
      eq(parishRecords.parishId, context.parishId), eq(parishRecords.id, id),
    ))
    await audit(tx, context, 'PARISH_RECORD_DELETE', 'parish_record', id, ['deletedAt'])
    return true
  })
}

async function linkAssetToRecords(tx: DbTransaction, parishId: string, assetId: string, recordIds: string[]) {
  await requireReferences(tx, parishId, [], [], recordIds)
  await tx.delete(parishRecordAssets).where(and(eq(parishRecordAssets.parishId, parishId), eq(parishRecordAssets.assetId, assetId)))
  if (recordIds.length > 0) await tx.insert(parishRecordAssets).values([...new Set(recordIds)].map(recordId => ({ parishId, recordId, assetId })))
}

export async function createExternalParishAsset(input: ParishExternalAssetInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    const id = generateId('PAS')
    const now = new Date().toISOString()
    const row = {
      id,
      parishId: context.parishId,
      assetType: input.assetType,
      title: input.title.trim(),
      description: nullableText(input.description),
      capturedOn: input.capturedOn || null,
      storageType: 'EXTERNAL' as const,
      objectKey: null,
      externalUrl: input.externalUrl,
      originalFilename: null,
      mimeType: null,
      sizeBytes: null,
      checksumSha256: null,
      visibility: input.visibility,
      createdBy: context.userId,
      updatedBy: context.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await tx.insert(parishArchiveAssets).values(row)
    await linkAssetToRecords(tx, context.parishId, id, input.recordIds ?? [])
    await audit(tx, context, 'PARISH_ASSET_CREATE_EXTERNAL', 'parish_archive_asset', id, ['assetType', 'visibility', 'recordIds'])
    return { ...row, recordIds: input.recordIds ?? [] }
  })
}

export async function createUploadedParishAsset(input: ParishUploadedAssetInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    const id = generateId('PAS')
    const now = new Date().toISOString()
    const row = {
      id,
      parishId: context.parishId,
      assetType: input.assetType,
      title: input.title.trim(),
      description: nullableText(input.description),
      capturedOn: input.capturedOn || null,
      storageType: 'UPLOAD' as const,
      objectKey: input.objectKey,
      externalUrl: null,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      visibility: input.visibility,
      createdBy: context.userId,
      updatedBy: context.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await tx.insert(parishArchiveAssets).values(row)
    await linkAssetToRecords(tx, context.parishId, id, input.recordIds ?? [])
    await audit(tx, context, 'PARISH_ASSET_UPLOAD', 'parish_archive_asset', id, ['assetType', 'visibility', 'mimeType', 'sizeBytes', 'recordIds'])
    return { ...row, recordIds: input.recordIds ?? [] }
  })
}

export async function updateParishAsset(id: string, input: ParishAssetInput, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requireAsset(tx, context.parishId, id)
    const row = {
      assetType: input.assetType,
      title: input.title.trim(),
      description: nullableText(input.description),
      capturedOn: input.capturedOn || null,
      visibility: input.visibility,
      updatedBy: context.userId,
      updatedAt: new Date().toISOString(),
    }
    await tx.update(parishArchiveAssets).set(row).where(and(eq(parishArchiveAssets.parishId, context.parishId), eq(parishArchiveAssets.id, id)))
    await linkAssetToRecords(tx, context.parishId, id, input.recordIds ?? [])
    await audit(tx, context, 'PARISH_ASSET_UPDATE', 'parish_archive_asset', id, Object.keys(input))
    return { id, parishId: context.parishId, ...row, recordIds: input.recordIds ?? [] }
  })
}

export async function deleteParishAsset(id: string, context: MutationContext) {
  return runDbTransaction(async tx => {
    await requireAsset(tx, context.parishId, id)
    const now = new Date().toISOString()
    await tx.update(parishArchiveAssets).set({ deletedAt: now, updatedAt: now, updatedBy: context.userId }).where(and(
      eq(parishArchiveAssets.parishId, context.parishId), eq(parishArchiveAssets.id, id),
    ))
    await audit(tx, context, 'PARISH_ASSET_DELETE', 'parish_archive_asset', id, ['deletedAt'])
    return true
  })
}

export async function getDownloadableParishAsset(id: string, parishId: string, role: ParishProfileRole) {
  const [asset] = await db.select().from(parishArchiveAssets).where(and(
    eq(parishArchiveAssets.parishId, parishId),
    eq(parishArchiveAssets.id, id),
    eq(parishArchiveAssets.storageType, 'UPLOAD'),
    isNull(parishArchiveAssets.deletedAt),
    ...(role === 'admin' ? [] : [eq(parishArchiveAssets.visibility, 'STAFF' as const)]),
  )).limit(1)
  if (!asset?.objectKey) parishError(404, 'PARISH_ASSET_NOT_FOUND', 'Không tìm thấy tư liệu có thể tải xuống')
  return asset
}
