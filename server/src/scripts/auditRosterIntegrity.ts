import { createHash } from 'node:crypto'
import { createClient, type Row } from '@libsql/client'
import { getDbConfig } from '../db/dbConfig.js'

const configured = getDbConfig()
const auditUrl = process.env.AUDIT_DATABASE_URL
const url = auditUrl || configured.url
const authToken = auditUrl ? process.env.AUDIT_DATABASE_AUTH_TOKEN : configured.authToken
const includeParishId = process.env.ROSTER_INVENTORY_INCLUDE_PARISH_ID === 'true'
const client = createClient(authToken ? { url, authToken } : { url })

const hashRef = (kind: string, value: unknown): string =>
  `sha256:${createHash('sha256').update(`${kind}:${String(value ?? '')}`).digest('hex').slice(0, 12)}`

const parishRef = (value: unknown): string => includeParishId ? String(value) : hashRef('parish', value)

const canonical = (value: unknown): string => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]/g, '')

const canonicalBranch = (id: unknown, name: unknown): string | null => {
  const normalized = [id, name].map(canonical)
  for (const branch of ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']) {
    const key = canonical(branch)
    if (normalized.some(value => value === key || value.startsWith(key))) return branch
  }
  return null
}

const numberValue = (value: unknown): number => Number(value ?? 0)

try {
  const tx = await client.transaction('read')
  try {
    const [studentResult, classResult, assignmentResult, importResult, orphanResult] = await Promise.all([
      tx.execute(`
        SELECT s.parish_id, s.id, s.full_name, s.date_of_birth, s.branch, s.class_id,
               c.deleted_at AS class_deleted_at, c.branch_id, b.name AS branch_name
        FROM students s
        LEFT JOIN classes c ON c.parish_id = s.parish_id AND c.id = s.class_id
        LEFT JOIN branches b ON b.parish_id = c.parish_id AND b.id = c.branch_id
        WHERE s.deleted_at IS NULL
      `),
      tx.execute(`
        SELECT parish_id, id, name, code, academic_year_id, deleted_at
        FROM classes
      `),
      tx.execute(`
        SELECT ca.parish_id, ca.id, ca.user_id, ca.class_id, ca.role_in_class,
               c.deleted_at AS class_deleted_at, u.deleted_at AS user_deleted_at, u.status AS user_status
        FROM catechist_assignments ca
        LEFT JOIN classes c ON c.parish_id = ca.parish_id AND c.id = ca.class_id
        LEFT JOIN users u ON u.parish_id = ca.parish_id AND u.id = ca.user_id
      `),
      tx.execute(`
        SELECT ib.parish_id, ib.id, ib.status, ib.total_rows, ib.imported, ib.skipped,
               ib.error_count, ib.created_class_ids,
               SUM(CASE WHEN ibs.rollback_snapshot IS NOT NULL THEN 1 ELSE 0 END) AS rollback_rows,
               COUNT(ibs.id) AS provenance_rows
        FROM import_batches ib
        LEFT JOIN import_batch_students ibs
          ON ibs.parish_id = ib.parish_id AND ibs.batch_id = ib.id
        WHERE ib.status IN ('processing', 'failed', 'partial', 'partial_undone')
        GROUP BY ib.parish_id, ib.id
      `),
      tx.execute(`
        SELECT c.parish_id, c.id,
               COUNT(DISTINCT s.id) AS active_students,
               COUNT(DISTINCT ca.id) AS assignments,
               COUNT(DISTINCT es.id) AS exam_sessions,
               COUNT(DISTINCT ats.id) AS attendance_sessions,
               COUNT(DISTINCT sfr.id) AS fee_records
        FROM classes c
        LEFT JOIN students s ON s.parish_id = c.parish_id AND s.class_id = c.id AND s.deleted_at IS NULL
        LEFT JOIN catechist_assignments ca ON ca.parish_id = c.parish_id AND ca.class_id = c.id
        LEFT JOIN exam_sessions es ON es.parish_id = c.parish_id AND es.class_id = c.id
        LEFT JOIN attendance_sessions ats ON ats.parish_id = c.parish_id AND ats.class_id = c.id
        LEFT JOIN student_fee_records sfr ON sfr.parish_id = c.parish_id AND sfr.class_id = c.id
        WHERE c.deleted_at IS NULL
        GROUP BY c.parish_id, c.id
        HAVING COUNT(DISTINCT s.id) = 0
      `),
    ])
    await tx.commit()

    const students = studentResult.rows as Row[]
    const classes = classResult.rows as Row[]
    const assignments = assignmentResult.rows as Row[]

    const duplicateGroups = new Map<string, Row[]>()
    for (const student of students) {
      const name = canonical(student.full_name)
      const dob = String(student.date_of_birth ?? '').trim()
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) continue
      const key = `${student.parish_id}\u0000${name}\u0000${dob}`
      const group = duplicateGroups.get(key) || []
      group.push(student)
      duplicateGroups.set(key, group)
    }
    const normalizedIdentityDuplicates = [...duplicateGroups.values()]
      .filter(group => group.length > 1)
      .map(group => ({
        parishRef: parishRef(group[0].parish_id),
        count: group.length,
        studentRefs: group.map(row => hashRef('student', `${row.parish_id}:${row.id}`)).sort(),
      }))

    const membershipBranchMismatches = students.flatMap(student => {
      const expected = canonicalBranch(student.branch_id, student.branch_name)
      if (!expected || expected === String(student.branch)) return []
      return [{
        parishRef: parishRef(student.parish_id),
        studentRef: hashRef('student', `${student.parish_id}:${student.id}`),
        classRef: hashRef('class', `${student.parish_id}:${student.class_id}`),
      }]
    })

    const deletedClassReferences = {
      activeStudents: students.filter(row => row.class_deleted_at != null).map(row => ({
        parishRef: parishRef(row.parish_id),
        studentRef: hashRef('student', `${row.parish_id}:${row.id}`),
        classRef: hashRef('class', `${row.parish_id}:${row.class_id}`),
      })),
      assignments: assignments.filter(row => row.class_deleted_at != null).map(row => ({
        parishRef: parishRef(row.parish_id),
        assignmentRef: hashRef('assignment', `${row.parish_id}:${row.id}`),
        classRef: hashRef('class', `${row.parish_id}:${row.class_id}`),
      })),
    }

    const groupAssignments = (keyOf: (row: Row) => string) => {
      const groups = new Map<string, Row[]>()
      for (const row of assignments.filter(item => item.role_in_class === 'chunhiem')) {
        const key = keyOf(row)
        const group = groups.get(key) || []
        group.push(row)
        groups.set(key, group)
      }
      return [...groups.values()].filter(group => group.length > 1)
    }
    const homeroomCardinality = {
      multiplePerClass: groupAssignments(row => `${row.parish_id}\u0000${row.class_id}`).map(group => ({
        parishRef: parishRef(group[0].parish_id),
        classRef: hashRef('class', `${group[0].parish_id}:${group[0].class_id}`),
        count: group.length,
      })),
      multipleClassesPerUser: groupAssignments(row => `${row.parish_id}\u0000${row.user_id}`).map(group => ({
        parishRef: parishRef(group[0].parish_id),
        userRef: hashRef('user', `${group[0].parish_id}:${group[0].user_id}`),
        count: new Set(group.map(row => String(row.class_id))).size,
      })).filter(row => row.count > 1),
      staleAssignments: assignments.filter(row => row.class_deleted_at != null || row.user_deleted_at != null || !['ACTIVE', 'FORCE_PASSWORD_CHANGE'].includes(String(row.user_status))).map(row => ({
        parishRef: parishRef(row.parish_id),
        assignmentRef: hashRef('assignment', `${row.parish_id}:${row.id}`),
      })),
    }

    const classAliases = new Map<string, Row[]>()
    for (const cls of classes.filter(row => row.deleted_at == null)) {
      for (const value of [cls.name, cls.code]) {
        const alias = canonical(value)
        if (!alias) continue
        const key = `${cls.parish_id}\u0000${alias}`
        const group = classAliases.get(key) || []
        if (!group.some(item => item.id === cls.id)) group.push(cls)
        classAliases.set(key, group)
      }
    }
    const reusedClassAliasesAcrossYears = [...classAliases.values()]
      .filter(group => group.length > 1 && new Set(group.map(row => String(row.academic_year_id))).size > 1)
      .map(group => ({
        parishRef: parishRef(group[0].parish_id),
        count: group.length,
        classRefs: group.map(row => hashRef('class', `${row.parish_id}:${row.id}`)).sort(),
        academicYearCount: new Set(group.map(row => String(row.academic_year_id))).size,
      }))

    const importRecovery = (importResult.rows as Row[]).map(row => {
      let createdClassCount = 0
      try {
        const parsed = JSON.parse(String(row.created_class_ids ?? '[]'))
        createdClassCount = Array.isArray(parsed) ? parsed.length : 0
      } catch {}
      return {
        parishRef: parishRef(row.parish_id),
        batchRef: hashRef('import-batch', `${row.parish_id}:${row.id}`),
        status: String(row.status),
        totalRows: numberValue(row.total_rows),
        committedRows: numberValue(row.provenance_rows),
        imported: numberValue(row.imported),
        skipped: numberValue(row.skipped),
        errors: numberValue(row.error_count),
        rollbackRows: numberValue(row.rollback_rows),
        createdClassCount,
      }
    })

    const emptyActiveClasses = (orphanResult.rows as Row[]).map(row => ({
      parishRef: parishRef(row.parish_id),
      classRef: hashRef('class', `${row.parish_id}:${row.id}`),
      assignments: numberValue(row.assignments),
      examSessions: numberValue(row.exam_sessions),
      attendanceSessions: numberValue(row.attendance_sessions),
      feeRecords: numberValue(row.fee_records),
    }))

    const findings = {
      normalizedIdentityDuplicates,
      membershipBranchMismatches,
      deletedClassReferences,
      homeroomCardinality,
      reusedClassAliasesAcrossYears,
      importRecovery,
      emptyActiveClasses,
    }
    const findingCount = normalizedIdentityDuplicates.length
      + membershipBranchMismatches.length
      + deletedClassReferences.activeStudents.length
      + deletedClassReferences.assignments.length
      + homeroomCardinality.multiplePerClass.length
      + homeroomCardinality.multipleClassesPerUser.length
      + homeroomCardinality.staleAssignments.length
      + reusedClassAliasesAcrossYears.length
      + importRecovery.length
      + emptyActiveClasses.length

    console.log(JSON.stringify({
      status: 'read_only_roster_inventory_complete',
      targetFingerprint: createHash('sha256').update(url).digest('hex').slice(0, 16),
      parishIdentifiers: includeParishId ? 'plain_explicit_opt_in' : 'sha256_truncated',
      findingCount,
      requiresOperatorReview: findingCount > 0,
      findings,
    }, null, 2))
  } catch (error) {
    try { await tx.rollback() } catch { /* read transaction may already be closed */ }
    throw error
  }
} finally {
  client.close()
}
