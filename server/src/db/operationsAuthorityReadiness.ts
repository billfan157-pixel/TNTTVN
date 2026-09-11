import { createHash } from 'node:crypto'
import type { Client, Row } from '@libsql/client'

type Snapshot = {
  parishes: string[]
  units: Row[]
  terms: Row[]
}

export type OperationsAuthorityReadinessManifest = {
  status: 'operations_authority_preflight_passed' | 'operations_authority_preflight_requires_review'
  parishIdentifiers: 'sha256_truncated' | 'plain_explicit_opt_in'
  evaluatedOn: string
  parishCount: number
  findingCount: number
  requiresOperatorReview: boolean
  findings: {
    inventory: Array<{ reason: 'NO_PARISH_DATA' }>
    boardRootCardinality: Array<{ parishRef: string; activeBoards: number; activeRootBoards: number; boardRefs: string[] }>
    branchCommitteeParent: Array<{ parishRef: string; unitRef: string; unitType: string; parentRef: string | null }>
    positionScope: Array<{ parishRef: string; termRef: string; positionCode: string; unitRef: string | null }>
    leaderIdentity: Array<{ parishRef: string; termRef: string; reasons: string[] }>
    leaderTermOverlap: Array<{ parishRef: string; firstTermRef: string; secondTermRef: string; positionCode: string; scopeRef: string }>
    parishLeaderCurrentCardinality: Array<{ parishRef: string; activeLeaders: number; termRefs: string[] }>
  }
}

const value = (row: Row, key: string): string => String(row[key] ?? '')
const nullable = (row: Row, key: string): string | null => row[key] == null ? null : String(row[key])
const activeFlag = (row: Row, key: string): boolean => Number(row[key] ?? 0) === 1
const hashRef = (kind: string, raw: string): string => `sha256:${createHash('sha256').update(`${kind}:${raw}`).digest('hex').slice(0, 12)}`

function overlaps(first: Row, second: Row): boolean {
  const firstEnd = nullable(first, 'end_date') ?? '9999-12-31'
  const secondEnd = nullable(second, 'end_date') ?? '9999-12-31'
  return value(first, 'start_date') <= secondEnd && value(second, 'start_date') <= firstEnd
}

export function analyzeOperationsAuthoritySnapshot(
  snapshot: Snapshot,
  options: { today: string; includeParishId?: boolean },
): OperationsAuthorityReadinessManifest {
  const parishRef = (parishId: string) => options.includeParishId ? parishId : hashRef('parish', parishId)
  const entityRef = (kind: string, parishId: string, id: string) => hashRef(kind, `${parishId}:${id}`)
  const unitsByKey = new Map(snapshot.units.map(row => [`${value(row, 'parish_id')}\u0000${value(row, 'id')}`, row]))
  const activeUnits = snapshot.units.filter(row => nullable(row, 'deleted_at') === null && activeFlag(row, 'is_active'))
  const authorityTerms = snapshot.terms.filter(row => nullable(row, 'deleted_at') === null && value(row, 'position_code'))

  const boardRootCardinality = snapshot.parishes.flatMap(parishId => {
    const boards = activeUnits.filter(row => value(row, 'parish_id') === parishId && value(row, 'unit_type') === 'BOARD')
    const rootBoards = boards.filter(row => nullable(row, 'parent_id') === null)
    return boards.length === 1 && rootBoards.length === 1 ? [] : [{
      parishRef: parishRef(parishId),
      activeBoards: boards.length,
      activeRootBoards: rootBoards.length,
      boardRefs: boards.map(row => entityRef('unit', parishId, value(row, 'id'))).sort(),
    }]
  })

  const branchCommitteeParent = activeUnits.flatMap(row => {
    const unitType = value(row, 'unit_type')
    if (!['BRANCH', 'COMMITTEE'].includes(unitType)) return []
    const parishId = value(row, 'parish_id')
    const parentId = nullable(row, 'parent_id')
    const parent = parentId ? unitsByKey.get(`${parishId}\u0000${parentId}`) : undefined
    if (parent && nullable(parent, 'deleted_at') === null && activeFlag(parent, 'is_active') && value(parent, 'unit_type') === 'BOARD') return []
    return [{ parishRef: parishRef(parishId), unitRef: entityRef('unit', parishId, value(row, 'id')), unitType, parentRef: parentId ? entityRef('unit', parishId, parentId) : null }]
  })

  const positionScope = authorityTerms.flatMap(term => {
    const parishId = value(term, 'parish_id')
    const code = value(term, 'position_code')
    const unitId = nullable(term, 'unit_id')
    const unit = unitId ? unitsByKey.get(`${parishId}\u0000${unitId}`) : undefined
    const activeUnitType = unit && nullable(unit, 'deleted_at') === null && activeFlag(unit, 'is_active') ? value(unit, 'unit_type') : null
    const valid = code === 'PARISH_LEADER'
      ? unitId === null || activeUnitType === 'BOARD'
      : code === 'BRANCH_LEADER'
        ? activeUnitType === 'BRANCH'
        : code === 'COMMITTEE_LEADER' && activeUnitType === 'COMMITTEE'
    return valid ? [] : [{ parishRef: parishRef(parishId), termRef: entityRef('term', parishId, value(term, 'id')), positionCode: code, unitRef: unitId ? entityRef('unit', parishId, unitId) : null }]
  })

  const leaderIdentity = authorityTerms.flatMap(term => {
    const reasons: string[] = []
    if (!value(term, 'person_id')) reasons.push('PERSON_MISSING')
    if (value(term, 'person_service_status') !== 'ACTIVE' || nullable(term, 'person_deleted_at') !== null) reasons.push('PERSON_NOT_ACTIVE')
    if (!value(term, 'linked_user_id')) reasons.push('STAFF_ACCOUNT_MISSING')
    if (!['admin', 'chunhiem', 'phuta'].includes(value(term, 'user_role'))) reasons.push('STAFF_ROLE_INVALID')
    if (value(term, 'user_status') !== 'ACTIVE' || nullable(term, 'user_deleted_at') !== null) reasons.push('STAFF_ACCOUNT_NOT_ACTIVE')
    if (reasons.length === 0) return []
    const parishId = value(term, 'parish_id')
    return [{ parishRef: parishRef(parishId), termRef: entityRef('term', parishId, value(term, 'id')), reasons }]
  })

  const leaderTermOverlap: OperationsAuthorityReadinessManifest['findings']['leaderTermOverlap'] = []
  for (let index = 0; index < authorityTerms.length; index += 1) {
    const first = authorityTerms[index]
    for (let compare = index + 1; compare < authorityTerms.length; compare += 1) {
      const second = authorityTerms[compare]
      const parishId = value(first, 'parish_id')
      const code = value(first, 'position_code')
      if (parishId !== value(second, 'parish_id') || code !== value(second, 'position_code')) continue
      const firstScope = code === 'PARISH_LEADER' ? parishId : nullable(first, 'unit_id')
      const secondScope = code === 'PARISH_LEADER' ? parishId : nullable(second, 'unit_id')
      if (!firstScope || firstScope !== secondScope || !overlaps(first, second)) continue
      leaderTermOverlap.push({
        parishRef: parishRef(parishId),
        firstTermRef: entityRef('term', parishId, value(first, 'id')),
        secondTermRef: entityRef('term', parishId, value(second, 'id')),
        positionCode: code,
        scopeRef: code === 'PARISH_LEADER' ? parishRef(parishId) : entityRef('unit', parishId, firstScope),
      })
    }
  }

  const invalidTermRefs = new Set([
    ...positionScope.map(item => item.termRef),
    ...leaderIdentity.map(item => item.termRef),
  ])
  const parishLeaderCurrentCardinality = snapshot.parishes.flatMap(parishId => {
    const terms = authorityTerms.filter(term => {
      if (value(term, 'parish_id') !== parishId || value(term, 'position_code') !== 'PARISH_LEADER') return false
      const ref = entityRef('term', parishId, value(term, 'id'))
      const endDate = nullable(term, 'end_date')
      return !invalidTermRefs.has(ref) && value(term, 'start_date') <= options.today && (!endDate || endDate >= options.today)
    })
    return terms.length === 1 ? [] : [{ parishRef: parishRef(parishId), activeLeaders: terms.length, termRefs: terms.map(term => entityRef('term', parishId, value(term, 'id'))).sort() }]
  })

  const inventory: OperationsAuthorityReadinessManifest['findings']['inventory'] = snapshot.parishes.length === 0 ? [{ reason: 'NO_PARISH_DATA' }] : []
  const findings = { inventory, boardRootCardinality, branchCommitteeParent, positionScope, leaderIdentity, leaderTermOverlap, parishLeaderCurrentCardinality }
  const findingCount = Object.values(findings).reduce((total, rows) => total + rows.length, 0)
  return {
    status: findingCount === 0 ? 'operations_authority_preflight_passed' : 'operations_authority_preflight_requires_review',
    parishIdentifiers: options.includeParishId ? 'plain_explicit_opt_in' : 'sha256_truncated',
    evaluatedOn: options.today,
    parishCount: snapshot.parishes.length,
    findingCount,
    requiresOperatorReview: findingCount > 0,
    findings,
  }
}

export async function auditOperationsAuthorityReadiness(
  client: Client,
  options: { today: string; includeParishId?: boolean },
): Promise<OperationsAuthorityReadinessManifest> {
  const tx = await client.transaction('read')
  try {
    const [parishes, units, terms] = await Promise.all([
      tx.execute(`SELECT parish_id FROM parish_profiles UNION SELECT parish_id FROM users UNION SELECT parish_id FROM parish_organization_units UNION SELECT parish_id FROM parish_people UNION SELECT parish_id FROM parish_service_terms ORDER BY parish_id`),
      tx.execute(`SELECT parish_id, id, parent_id, unit_type, is_active, deleted_at FROM parish_organization_units`),
      tx.execute(`
        SELECT t.parish_id, t.id, t.person_id, t.unit_id, t.position_code, t.start_date, t.end_date, t.deleted_at,
               p.linked_user_id, p.service_status AS person_service_status, p.deleted_at AS person_deleted_at,
               u.role AS user_role, u.status AS user_status, u.deleted_at AS user_deleted_at
        FROM parish_service_terms t
        LEFT JOIN parish_people p ON p.parish_id = t.parish_id AND p.id = t.person_id
        LEFT JOIN users u ON u.parish_id = p.parish_id AND u.id = p.linked_user_id
        WHERE t.position_code IS NOT NULL
      `),
    ])
    await tx.commit()
    return analyzeOperationsAuthoritySnapshot({
      parishes: parishes.rows.map(row => value(row, 'parish_id')),
      units: units.rows,
      terms: terms.rows,
    }, options)
  } catch (error) {
    try { await tx.rollback() } catch { /* read transaction may already be closed */ }
    throw error
  } finally {
    tx.close()
  }
}
