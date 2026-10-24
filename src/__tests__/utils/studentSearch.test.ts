import { describe, expect, it } from 'vitest'
import { createStudentSearchMatcher, searchStudents } from '../../utils/studentSearch'

const student = { fullName: 'Nguyễn Đình Đức', holyName: 'Giuse', code: 'TN-001' }

describe('student search', () => {
  it.each([
    ['duc', true],
    ['ĐÌNH ĐỨC', true],
    ['  DUC\t nguyen  ', true],
    ['giuse duc', true],
    ['Giuse, Đức', true],
    ['NĐĐ', true],
    ['đđ giuse', true],
    ['nguyendinhduc', true],
    ['dinhduc giuse', true],
    ['giusenguyendinhduc', true],
    ['tn001', true],
    ['TN-001', true],
    ['tn 001', true],
    ['', true],
    [' \t ', true],
    ['phan duc', false],
    ['duc maria', false],
    ['giuse 999', false],
    ['%%%', false],
    ['nd', true],
    ['ndx', false],
    ['TN002', false],
  ])('query %j matches: %s', (query, expected) => {
    expect(createStudentSearchMatcher(query)(student)).toBe(expected)
  })

  it('accepts decomposed Vietnamese accents and partial names', () => {
    expect(createStudentSearchMatcher('nguy đứ'.normalize('NFD'))({
      ...student, fullName: student.fullName.normalize('NFD'),
    })).toBe(true)
  })

  it('requires all words to match one student, without mutating the input', () => {
    const roster = Object.freeze([
      Object.freeze(student),
      Object.freeze({ fullName: 'Trần Văn An', holyName: 'Maria', code: 'TN-002' }),
    ])
    expect(roster.filter(createStudentSearchMatcher('nguyen maria'))).toEqual([])
    expect(roster.filter(createStudentSearchMatcher('duc giuse'))).toEqual([student])
  })

  it('recognizes contiguous initials in full and holy names, including dotted abbreviations', () => {
    const child = { fullName: 'Nguyễn Hoàng Minh Anh', holyName: 'Gioan Baotixita', code: 'AN-017' }
    for (const query of ['NHMA', 'hma', 'gb minh anh', 'G.B. Nguyễn', 'n.h.m.a.']) {
      expect(createStudentSearchMatcher(query)(child), query).toBe(true)
    }
    expect(createStudentSearchMatcher('NMA')(child)).toBe(false)
    expect(createStudentSearchMatcher('gb maria')(child)).toBe(false)
  })

  it('does not invent matches from punctuation, missing names, or reordered initials', () => {
    const empty = { fullName: '', holyName: '', code: '' }
    expect(createStudentSearchMatcher('ndd')(empty)).toBe(false)
    expect(createStudentSearchMatcher('ddn')(student)).toBe(false)
    expect(searchStudents([student], '%%%').students).toEqual([])
  })

  it.each(['nguyne duc', 'nguyeen duc', 'nguyn duc', 'nguyem duc'])('suggests one small typo only as a fallback: %s', query => {
    expect(searchStudents([student], query)).toEqual({ students: [student], isApproximate: true })
  })

  it('prefers direct matches over approximate names and preserves input order', () => {
    const exact = { ...student, fullName: 'Nguyệt Đình Đức' }
    const roster = Object.freeze([Object.freeze(student), Object.freeze(exact)])
    expect(searchStudents(roster, 'nguyet duc')).toEqual({ students: [exact], isApproximate: false })
    expect(searchStudents(roster, 'duc').students).toEqual([student, exact])
    expect(searchStudents(roster, 'ndd').students).toEqual([student, exact])
  })

  it.each(['duc maria', 'ducc', 'TN002', 'tn00x', 'nguxen giuxe', 'nguxxn duc', 'nguyem 999'])('does not guess codes, short names, multiple typos or unrelated words: %s', query => {
    expect(searchStudents([student], query)).toEqual({ students: [], isApproximate: false })
  })
})
