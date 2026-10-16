import React, { useMemo, useState } from 'react'
import { Save, Search, X } from 'lucide-react'
import { StudentName } from '../common/StudentName'
import { Badge } from '../common/ui/Badge'
import { useMediaQuery } from '../../hooks/useMediaQuery'

interface QuickScoreEntryProps {
  students: { id: string; name: string; code: string; holyName?: string | null }[]
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
export const QuickScoreEntry: React.FC<QuickScoreEntryProps> = ({
  students,
  savedScores,
  maxScore,
  onSave,
  disabled,
  essayMode,
  totalScores,
}) => {
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  // MOBILE-UX: < 1024px dùng danh sách thẻ thay bảng 1312px (ô nhập từng bị trôi
  // ngoài màn hình). jsdom không có matchMedia → false → giữ bảng cho unit test.
  const isMobile = useMediaQuery('(max-width: 1023.9px)')

  const commit = (studentId: string) => {
    const raw = values[studentId]
    if (raw === undefined || raw.trim() === '') return
    const val = parseFloat(raw.replace(',', '.'))
    if (isNaN(val)) {
      setErrors(prev => ({ ...prev, [studentId]: 'Điểm không hợp lệ' }))
      return
    }
    if (val < 0 || val > maxScore) {
      setErrors(prev => ({ ...prev, [studentId]: `Điểm từ 0 đến ${maxScore}` }))
      return
    }
    setErrors(prev => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })
    onSave(studentId, val)
    setValues(prev => ({ ...prev, [studentId]: '' }))
  }

  const missingCount = useMemo(() => {
    return students.filter(st => savedScores[st.id] === undefined).length
  }, [students, savedScores])

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(st => {
      if (onlyMissing && savedScores[st.id] !== undefined) return false
      if (!q) return true
      const name = st.name.toLowerCase()
      const code = st.code.toLowerCase()
      const holy = (st.holyName || '').toLowerCase()
      return name.includes(q) || code.includes(q) || holy.includes(q)
    })
  }, [students, search, onlyMissing, savedScores])

  /**
   * Ô nhập điểm dùng chung: cột bảng (desktop) và thẻ (mobile).
   * Mobile: cao ≥ 44px + nhãn riêng từng em; desktop giữ đúng kích thước cũ.
   */
  const renderScoreField = (st: { id: string; name: string }, variant: 'table' | 'card') => (
    <div className="flex flex-col">
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
        onChange={e => {
          setValues(prev => ({ ...prev, [st.id]: e.target.value }))
          if (errors[st.id]) {
            setErrors(prev => {
              const next = { ...prev }
              delete next[st.id]
              return next
            })
          }
        }}
        onBlur={() => commit(st.id)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit(st.id)
          if (e.key === 'Tab') commit(st.id)
        }}
        aria-invalid={Boolean(errors[st.id])}
        aria-describedby={errors[st.id] ? `score-err-${st.id}` : undefined}
        aria-label={variant === 'card' ? `Nhập điểm cho ${st.name}` : undefined}
        className={`${variant === 'card' ? 'min-h-11 w-full px-3 text-base' : 'min-h-9 w-24 px-2.5 text-sm'} py-1 rounded-lg bg-surface-card text-text-main border focus:outline-none font-semibold transition-colors ${
          errors[st.id]
            ? 'border-parish-danger text-parish-danger focus:border-parish-danger'
            : 'border-surface-border focus:border-parish-primary'
        }`}
      />
      {errors[st.id] && (
        <span
          id={`score-err-${st.id}`}
          role="alert"
          className="text-xs font-semibold text-parish-danger mt-1 leading-tight"
        >
          {errors[st.id]}
        </span>
      )}
    </div>
  )

  return (
    <div>
      {/* Search and Missing Filter Toolbar */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã thiếu nhi..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input min-h-9 w-full pl-8 pr-3 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyMissing(prev => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              onlyMissing
                ? 'bg-parish-primary text-white shadow-2xs'
                : 'bg-surface-app border border-surface-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Chỉ hiện chưa có điểm ({missingCount})
          </button>
          <span className="text-xs text-text-muted">
            Hiển thị {filteredStudents.length}/{students.length} em
          </span>
        </div>
      </div>

      {isMobile ? (
        /* MOBILE-UX: mỗi em một thẻ — điểm đã lưu, ô nhập và nút Lưu nằm cùng
           màn hình, không phải cuộn ngang như bảng 1312px trước đây. */
        <div className="flex flex-col gap-2">
          {filteredStudents.length === 0 ? (
            <div className="rounded-xl border border-surface-border bg-surface-card py-6 text-center text-xs text-text-muted">
              Không tìm thấy thiếu nhi nào phù hợp.
            </div>
          ) : (
            filteredStudents.map((st, i) => (
              <div key={st.id} className="flex flex-col gap-2.5 rounded-xl border border-surface-border bg-surface-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs text-text-muted">{i + 1}.</span>
                    <StudentName holyName={st.holyName} fullName={st.name} size="base" />
                  </div>
                  <span className="shrink-0 font-mono text-xs text-text-muted">{st.code}</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {savedScores[st.id] !== undefined ? (
                    <Badge tone="primary">
                      {essayMode ? 'Điểm TL' : 'Đã lưu'}: {savedScores[st.id]}
                    </Badge>
                  ) : (
                    <span className="text-xs italic text-text-muted">Chưa có điểm</span>
                  )}
                  {essayMode && totalScores?.[st.id] !== undefined && (
                    <Badge tone="success">Tổng (TN+TL): {totalScores[st.id]}</Badge>
                  )}
                </div>

                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">{renderScoreField(st, 'card')}</div>
                  <button
                    type="button"
                    onClick={() => commit(st.id)}
                    disabled={disabled || maxScore <= 0 || !(values[st.id] ?? '').trim()}
                    className="btn btn-primary btn-sm min-h-11 shrink-0 px-4"
                  >
                    <Save size={15} /> Lưu
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-sm bg-surface-card text-text-main">
            <thead>
              <tr className="text-left text-xs font-bold text-text-muted border-b border-surface-border bg-surface-app">
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">#</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">Thiếu Nhi</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">
                  {essayMode ? 'Điểm TL đã lưu' : 'Đã Lưu'}
                </th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">
                  {essayMode ? `Tự Luận (0–${maxScore})` : `Điểm (0–${maxScore})`}
                </th>
                {essayMode && <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">Tổng (TN+TL)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/60 bg-surface-card">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={essayMode ? 5 : 4} className="text-center py-6 text-xs text-text-muted">
                    Không tìm thấy thiếu nhi nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st, i) => (
                  <tr key={st.id} className="bg-surface-card hover:bg-surface-app/70 transition-colors">
                    <td className="px-3 py-2.5 text-text-muted text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <StudentName holyName={st.holyName} fullName={st.name} size="base" />
                        <span className="text-xs text-text-muted font-mono">{st.code}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {savedScores[st.id] !== undefined ? (
                        <Badge tone="primary">
                          {savedScores[st.id]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-text-muted italic">Chưa có</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{renderScoreField(st, 'table')}</td>
                    {essayMode && (
                      <td className="px-3 py-2.5">
                        {totalScores?.[st.id] !== undefined ? (
                          <Badge tone="success">
                            {totalScores[st.id]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default QuickScoreEntry
