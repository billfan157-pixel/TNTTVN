import { describe, expect, it } from 'vitest'
import { createStudentSearchMatcher } from '../../utils/studentSearch'

const student = { fullName: 'Nguyễn Đình Đức', holyName: 'Giuse', code: 'TN-001' }

describe('student search', () => {
  it.each([
    ['duc', true],
    ['ĐÌNH ĐỨC', true],
    ['  DUC\t nguyen  ', true],
    ['giuse duc', true],
    ['Giuse, Đức', true],
    ['tn001', true],
    ['TN-001', true],
    ['tn 001', true],
    ['', true],
    [' \t ', true],
    ['phan duc', false],
    ['duc maria', false],
    ['giuse 999', false],
    ['%%%', false],
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
})
