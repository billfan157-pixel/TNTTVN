import type { AcademicPullResponse } from '../../lib/academicPull'

export function academicPullFixture(records: any[], studentIds = records.map(row => row.studentId), mode: 'full' | 'delta' = 'full'): AcademicPullResponse {
  return { records, mode, scope: { revision: 'test-scope', studentIds: [...new Set(studentIds)], semester: null } }
}
