import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/exam/ExamSessionView.tsx'),
  'utf8',
)

describe('create exam session mobile UI contract', () => {
  it('uses a bottom sheet on mobile with an accessible close action', () => {
    expect(source).toContain('items-end justify-center p-0 sm:items-center sm:p-4')
    expect(source).toContain('rounded-t-3xl sm:rounded-2xl')
    expect(source).toContain('aria-label="Đóng tạo phiên chấm"')
  })

  it('keeps creation controls and answer progress visible while content scrolls', () => {
    expect(source).toContain('sticky top-0 z-10 bg-surface-card')
    expect(source).toContain('sticky bottom-0 -mx-4 sm:-mx-5')
    expect(source).toContain('Đáp án: {completedAnswerCount}/{createForm.questionCount} câu')
  })

  it('uses touch-sized answer choices and one question row per mobile grid row', () => {
    expect(source).toContain('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5')
    expect(source).toContain('w-11 h-11 sm:w-auto sm:h-7.5')
    expect(source).toContain('aria-label={`Câu ${q}, đáp án ${opt}`}')
  })

  it('expands into a structured desktop grid without duplicating the form', () => {
    expect(source).toContain('max-w-2xl lg:max-w-5xl')
    expect(source).toContain('lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-4')
    expect(source).toContain("createForm.examType === 'written' ? 'lg:col-span-12' : 'lg:col-span-5'")
    expect(source).toContain('lg:col-span-7')
  })

  it('renders each session card as a keyboard-operable button', () => {
    expect(source).toContain('as="button"')
    expect(source).toContain('type="button"')
    expect(source).toContain("aria-label={`${s.subject} — ${sessionClass?.name || 'chưa xếp lớp'}")
  })
})
