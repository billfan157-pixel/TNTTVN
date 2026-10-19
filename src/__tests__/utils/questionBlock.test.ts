import { describe, expect, it } from 'vitest'
import {
  buildQuestionBlockOptions,
  deriveQuestionBlockLabel,
  findQuestionBlockForLevel,
  type QuestionBlockOption,
} from '../../utils/questionBlock'
import type { QuestionClassOption } from '../../utils/questionEditorModel'

describe('questionBlock — khối Ngân hàng đề thi', () => {
  it('deriveQuestionBlockLabel bỏ hậu tố phân ban sau số khối', () => {
    expect(deriveQuestionBlockLabel('Thiếu Nhi 1A')).toBe('Thiếu Nhi 1')
    expect(deriveQuestionBlockLabel('Thiếu Nhi 1B')).toBe('Thiếu Nhi 1')
    expect(deriveQuestionBlockLabel('Thiếu Nhi 1')).toBe('Thiếu Nhi 1')
    expect(deriveQuestionBlockLabel(' Ấu Nhi 3C ')).toBe('Ấu Nhi 3')
    expect(deriveQuestionBlockLabel('Chiên Con')).toBe('Chiên Con')
  })

  it('buildQuestionBlockOptions gộp các lớp cùng ngành cùng số khối thành một lựa chọn khối', () => {
    const classes: QuestionClassOption[] = [
      { id: 'c1', name: 'Thiếu Nhi 1A', branchId: 'ThieuNhi', academicYear: '2026-2027' },
      { id: 'c2', name: 'Thiếu Nhi 1B', branchId: 'ThieuNhi', academicYear: '2026-2027' },
      { id: 'c3', name: 'Thiếu Nhi 2A', branchId: 'ThieuNhi', academicYear: '2026-2027' },
      { id: 'c4', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYear: '2026-2027' },
      { id: 'c5', name: 'Chiên Con', branchId: 'ChienCon', academicYear: '2026-2027' },
      { id: 'c6', name: 'Thiếu Nhi 1A', branchId: 'ThieuNhi', academicYear: '2025-2026' },
    ]

    const blocks = buildQuestionBlockOptions(classes)
    expect(blocks.map(block => block.label)).toEqual(['Ấu Nhi 1', 'Thiếu Nhi 1', 'Thiếu Nhi 2', 'Chiên Con'])

    const thieuNhi1 = blocks.find(block => block.label === 'Thiếu Nhi 1')!
    expect(thieuNhi1.branchId).toBe('ThieuNhi')
    expect(thieuNhi1.classNames).toEqual(['Thiếu Nhi 1A', 'Thiếu Nhi 1B'])
    expect(thieuNhi1.academicYear).toBe('2026-2027')

    const chienCon = blocks.find(block => block.label === 'Chiên Con')!
    expect(chienCon.classNames).toEqual(['Chiên Con'])
  })

  it('findQuestionBlockForLevel khớp tên khối trước, rồi nhận diện taxonomy cũ gắn theo tên lớp', () => {
    const blocks: QuestionBlockOption[] = [
      { id: 'b1', branchId: 'ThieuNhi', label: 'Thiếu Nhi 1', classNames: ['Thiếu Nhi 1A', 'Thiếu Nhi 1B'], academicYear: '2026-2027' },
      { id: 'b2', branchId: 'ThieuNhi', label: 'Thiếu Nhi 2', classNames: ['Thiếu Nhi 2A'], academicYear: '2026-2027' },
    ]

    expect(findQuestionBlockForLevel(blocks, 'Thiếu Nhi 1')?.id).toBe('b1')
    expect(findQuestionBlockForLevel(blocks, 'Thiếu Nhi 1B')?.id).toBe('b1')
    expect(findQuestionBlockForLevel(blocks, 'Thiếu Nhi 3')).toBeUndefined()
    expect(findQuestionBlockForLevel(blocks, null)).toBeUndefined()
  })
})
