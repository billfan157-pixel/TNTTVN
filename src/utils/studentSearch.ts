import type { Student } from '../types'

type SearchableStudent = Pick<Student, 'fullName' | 'holyName' | 'code'>

export function normalizeStudentName(value: string): string {
  return (value || '')
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** All query words must match the same student's name, holy name or code. */
export function createStudentSearchMatcher(query: string): (student: SearchableStudent) => boolean {
  const normalizedQuery = normalizeStudentName(query)
  if (!normalizedQuery) return () => query.trim() === ''

  const tokens = normalizedQuery.split(' ')
  return student => {
    const text = normalizeStudentName(`${student.fullName || ''} ${student.holyName || ''} ${student.code || ''}`)
    const compactCode = normalizeStudentName(student.code).replace(/ /g, '')
    return tokens.every(token => text.includes(token) || compactCode.includes(token))
  }
}
