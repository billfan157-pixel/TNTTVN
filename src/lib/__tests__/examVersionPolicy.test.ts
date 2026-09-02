import { describe, expect, it } from 'vitest'
import { canSelectExternalExamVersion, resolvePrintableExamVersion } from '../examVersionPolicy'

describe('exam version print policy', () => {
  it.each(['exam_paper', 'question_reader', 'qr_sheet'] as const)(
    'forces question-bearing document %s to version A',
    (docType) => {
      expect(resolvePrintableExamVersion(docType, 'H', ['A', 'H'])).toBe('A')
      expect(canSelectExternalExamVersion(docType)).toBe(false)
    },
  )

  it('allows A-H only for detached answer sheets prepared for external shuffled papers', () => {
    expect(resolvePrintableExamVersion('answer_sheet', 'H', ['A', 'H'])).toBe('H')
    expect(canSelectExternalExamVersion('answer_sheet')).toBe(true)
  })

  it('allows question-bearing B-H only when that version has an immutable manifest', () => {
    expect(resolvePrintableExamVersion('exam_paper', 'B', ['A', 'B'], ['A', 'B'])).toBe('B')
    expect(resolvePrintableExamVersion('exam_paper', 'C', ['A', 'B', 'C'], ['A', 'B'])).toBe('A')
    expect(canSelectExternalExamVersion('exam_paper', true)).toBe(true)
  })

  it('falls back safely when a requested detached-sheet version is unavailable', () => {
    expect(resolvePrintableExamVersion('answer_sheet', 'H', ['A', 'B'])).toBe('A')
  })
})
