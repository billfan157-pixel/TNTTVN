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

function queryTokens(query: string): string[] {
  // Keep dotted initials together: N.Đ.Đ. must have the same meaning as NĐĐ.
  const normalized = normalizeStudentName(query.replace(/(?:\p{L}\.){2,}\p{L}?/gu, value => value.replace(/\./g, '')))
  return normalized ? normalized.split(' ') : []
}

function searchKeys(student: SearchableStudent) {
  const fullName = normalizeStudentName(student.fullName)
  const holyName = normalizeStudentName(student.holyName)
  const code = normalizeStudentName(student.code)
  const names = [fullName, holyName, `${holyName} ${fullName}`.trim(), `${fullName} ${holyName}`.trim()]
  return {
    text: `${fullName} ${holyName} ${code}`,
    compactCode: code.replace(/ /g, ''),
    compactNames: names.map(name => name.replace(/ /g, '')),
    initials: names.map(name => name.split(' ').map(word => word[0] || '').join('')),
    words: `${fullName} ${holyName}`.split(' ').filter(Boolean),
  }
}

function matchesKey(token: string, keys: ReturnType<typeof searchKeys>): boolean {
  return keys.text.includes(token) || keys.compactCode.includes(token)
    || keys.compactNames.some(name => name.includes(token))
    || (token.length >= 2 && keys.initials.some(initials => initials.includes(token)))
}

/** All keywords must match one student; accepts name initials and names typed without spaces. */
export function createStudentSearchMatcher(query: string): (student: SearchableStudent) => boolean {
  const tokens = queryTokens(query)
  if (!tokens.length) return () => query.trim() === ''

  return student => {
    const keys = searchKeys(student)
    return tokens.every(token => matchesKey(token, keys))
  }
}

/** One insertion, deletion, substitution or adjacent transposition in a long name word. */
function isSmallNameTypo(query: string, word: string): boolean {
  if (query.length < 5 || word.length < 5 || !/^[a-z]+$/.test(query) || Math.abs(query.length - word.length) > 1) return false
  let i = 0
  while (i < query.length && query[i] === word[i]) i++
  if (query.length === word.length) {
    return query.slice(i + 1) === word.slice(i + 1)
      || (query[i] === word[i + 1] && query[i + 1] === word[i] && query.slice(i + 2) === word.slice(i + 2))
  }
  return query.length > word.length
    ? query.slice(i + 1) === word.slice(i)
    : query.slice(i) === word.slice(i + 1)
}

/** Suggest approximate names only when there are no keyword/initial/code matches in this scope. */
export function searchStudents<T extends SearchableStudent>(students: readonly T[], query: string): { students: T[]; isApproximate: boolean } {
  const exact = students.filter(createStudentSearchMatcher(query))
  if (exact.length || !query.trim()) return { students: exact, isApproximate: false }

  const tokens = queryTokens(query)
  if (!tokens.length) return { students: [], isApproximate: false }

  const approximate = students.filter(student => {
    const keys = searchKeys(student)
    let typoCount = 0
    return tokens.every(token => {
      if (matchesKey(token, keys)) return true
      typoCount++
      return typoCount <= 1 && keys.words.some(word => isSmallNameTypo(token, word))
    })
  })
  return { students: approximate, isApproximate: approximate.length > 0 }
}
