import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/exam/ExamSessionView.tsx'),
  'utf8',
)

describe('create exam session mobile UI contract', () => {
  it('uses a bottom sheet on mobile with an accessible close action', () => {
    expect(source).toContain('<ModalShell isOpen={showCreate}')
    expect(source).toContain('onClose={editorExit.requestExit}')
    expect(source).toContain('onExit: closeCreateModal')
    const shell = readFileSync(resolve(process.cwd(), 'src/components/common/ModalShell.tsx'), 'utf8')
    expect(shell).toContain('useAccessibleDialog')
    expect(shell).toContain('mobile-sheet-grabber')
    expect(shell).toContain('label="Đóng"')
  })

  it('keeps creation controls and answer progress visible while content scrolls', () => {
    expect(source).toContain('footer={(')
    expect(source).toContain('Đáp án: ${completedAnswerCount}/${createForm.questionCount} câu')
    const shell = readFileSync(resolve(process.cwd(), 'src/components/common/ModalShell.tsx'), 'utf8')
    expect(shell).toContain('modal-content__footer shrink-0')
    expect(shell).toContain('modal-content__body flex-1 overflow-y-auto')
  })

  // Layout and effective touch sizes are measured in exam-session-editor.spec.ts.
  it('gives every answer choice a question-specific accessible name and selected state', () => {
    expect(source).toContain('aria-label={`Câu ${q}, đáp án ${opt}`}')
    expect(source).toContain('aria-pressed={current === opt}')
  })

  it('renders each session card as a keyboard-operable button', () => {
    expect(source).toContain('as="button"')
    expect(source).toContain('type="button"')
    expect(source).toContain("aria-label={`${s.subject} — ${sessionClass?.name || 'chưa xếp lớp'}")
  })
})
