import React, { useState } from 'react'

interface QuickScoreEntryProps {
  students: { id: string; name: string; code: string }[]
  savedScores: Record<string, number>
  maxScore: number
  onSave: (studentId: string, score: number) => void
  disabled?: boolean
  /**
   * EXAM-MIXED: true = ô nhập là ĐIỂM TỰ LUẬN (phần TN tự chấm qua OMR);
   * totalScores hiển thị điểm tổng hiện có (TN + TL) để giáo viên đối chiếu.
   */
  essayMode?: boolean
  totalScores?: Record<string, number>
}

/**
 * Smart Exam Grading — QuickScoreEntry: nhập điểm nhanh từng em (Phase 1).
 * Enter hoặc blur → lưu ngay qua saveScores (upsert server).
 */
export const QuickScoreEntry: React.FC<QuickScoreEntryProps> = ({ students, savedScores, maxScore, onSave, disabled, essayMode, totalScores }) => {
  const [values, setValues] = useState<Record<string, string>>({})

  const commit = (studentId: string) => {
    const raw = values[studentId]
    if (raw === undefined || raw.trim() === '') return
    const val = parseFloat(raw.replace(',', '.'))
    if (isNaN(val) || val < 0 || val > maxScore) return
    onSave(studentId, val)
    setValues(prev => ({ ...prev, [studentId]: '' }))
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm bg-surface-card text-text-main">
        <thead>
          <tr className="text-left text-xs font-bold text-text-muted border-b border-surface-border">
            <th className="py-2 pr-2" scope="col">#</th>
            <th className="py-2 pr-2" scope="col">Thiếu Nhi</th>
            <th className="py-2 pr-2" scope="col">{essayMode ? 'Điểm TL đã lưu' : 'Đã Lưu'}</th>
            <th className="py-2 pr-2" scope="col">{essayMode ? `Tự Luận (0–${maxScore})` : `Điểm (0–${maxScore})`}</th>
            {essayMode && <th className="py-2" scope="col">Tổng (TN+TL)</th>}
          </tr>
        </thead>
        <tbody className="bg-surface-card">
          {students.map((st, i) => (
            <tr key={st.id} className="border-b border-surface-border/60 bg-surface-card hover:bg-surface-app transition-colors">
              <td className="py-2 pr-2 text-text-muted">{i + 1}</td>
              <td className="py-2 pr-2 font-semibold text-base">
                {st.name}
                <span className="ml-1 text-sm text-text-muted font-normal">{st.code}</span>
              </td>
              <td className="py-2 pr-2">
                {savedScores[st.id] !== undefined ? (
                  <span className={`badge ${essayMode ? '' : 'badge-primary'} text-xs`}>{savedScores[st.id]}</span>
                ) : (
                  <span className="text-sm text-text-muted">—</span>
                )}
              </td>
              <td className="py-2 pr-2">
                <input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  min={0}
                  max={maxScore}
                  step={0.5}
                  value={values[st.id] ?? ''}
                  disabled={disabled || maxScore <= 0}
                  placeholder={savedScores[st.id] !== undefined ? String(savedScores[st.id]) : '…'}
                  onChange={e => setValues(prev => ({ ...prev, [st.id]: e.target.value }))}
                  onBlur={() => commit(st.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commit(st.id)
                    if (e.key === 'Tab') commit(st.id)
                  }}
                  className="w-20 px-2 py-1.5 rounded-lg bg-surface-card text-text-main border border-surface-border focus:border-parish-primary focus:outline-none text-sm"
                />
              </td>
              {essayMode && (
                <td className="py-2">
                  {totalScores?.[st.id] !== undefined ? (
                    <span className="badge badge-primary text-xs">{totalScores[st.id]}</span>
                  ) : (
                    <span className="text-sm text-text-muted">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
