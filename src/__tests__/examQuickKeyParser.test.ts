import { describe, expect, it } from 'vitest'
import { parseQuickAnswerString } from '../utils/examQuickKeyParser'

describe('parseQuickAnswerString', () => {
  it('returns empty object for empty or whitespace text', () => {
    expect(parseQuickAnswerString('', 20)).toEqual({})
    expect(parseQuickAnswerString('   \n\t  ', 20)).toEqual({})
  })

  it('parses continuous sequence of letters', () => {
    const result = parseQuickAnswerString('ABCDABCD', 8)
    expect(result).toEqual({
      1: 'A',
      2: 'B',
      3: 'C',
      4: 'D',
      5: 'A',
      6: 'B',
      7: 'C',
      8: 'D',
    })
  })

  it('handles lowercase continuous sequence', () => {
    const result = parseQuickAnswerString('abcd', 4)
    expect(result).toEqual({
      1: 'A',
      2: 'B',
      3: 'C',
      4: 'D',
    })
  })

  it('caps continuous sequence at maxCount', () => {
    const result = parseQuickAnswerString('ABCDABCDABCD', 5)
    expect(Object.keys(result)).toHaveLength(5)
    expect(result).toEqual({
      1: 'A',
      2: 'B',
      3: 'C',
      4: 'D',
      5: 'A',
    })
  })

  it('parses numbered pairs separated by spaces', () => {
    const result = parseQuickAnswerString('1A 2B 3C 4D', 10)
    expect(result).toEqual({
      1: 'A',
      2: 'B',
      3: 'C',
      4: 'D',
    })
  })

  it('parses numbered pairs with dots, colons, dashes, and commas', () => {
    const result = parseQuickAnswerString('1.A, 2:B; 3 - C, 4. D', 10)
    expect(result).toEqual({
      1: 'A',
      2: 'B',
      3: 'C',
      4: 'D',
    })
  })

  it('parses Vietnamese format with "câu" prefix', () => {
    const result = parseQuickAnswerString('câu 1: A, câu 2: B, Câu 3: C, CÂU 4: D', 10)
    expect(result).toEqual({
      1: 'A',
      2: 'B',
      3: 'C',
      4: 'D',
    })
  })

  it('correctly handles non-sequential numbered pairs', () => {
    const result = parseQuickAnswerString('3C 1A 4D 2B', 10)
    expect(result).toEqual({
      1: 'A',
      2: 'B',
      3: 'C',
      4: 'D',
    })
  })

  it('ignores out-of-range numbered pairs greater than maxCount', () => {
    const result = parseQuickAnswerString('1A 2B 25C', 20)
    expect(result).toEqual({
      1: 'A',
      2: 'B',
    })
    expect(result[25]).toBeUndefined()
  })

  it('ignores invalid option characters in pairs', () => {
    const result = parseQuickAnswerString('1A 2E 3F 4B', 10)
    expect(result).toEqual({
      1: 'A',
      4: 'B',
    })
  })
})
