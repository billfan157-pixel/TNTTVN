import React, { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, Loader2, Save, ScanLine, Search, X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export interface GuidedGradeStudent {
  id: string
  name: string
  code: string
}

interface GuidedGradeModalProps {
  students: GuidedGradeStudent[]
  savedScores: Record<string, number>
  maxScore: number
  onSave: (studentId: string, score: number) => Promise<boolean>
  onScanOmr: (student: GuidedGradeStudent) => void
  onClose: () => void
  /** EXAM-MIXED: nhập ĐIỂM TỰ LUẬN; totalScores hiển thị tổng TN+TL đối chiếu. */
  essayMode?: boolean
  totalScores?: Record<string, number>
}

/**
 * Luồng chấm ổn định cho điện thoại: chọn học sinh theo danh sách lớp trước,
 * sau đó nhập điểm trực tiếp hoặc chỉ quét OMR. Không phụ thuộc QR/camera để
 * xác định danh tính nên luôn có đường hoàn tất phiên chấm.
 */
export const GuidedGradeModal: React.FC<GuidedGradeModalProps> = ({
  students,
  savedScores,
  maxScore,
  onSave,
  onScanOmr,
  onClose,
  essayMode,
  totalScores,
}) => {
  const [query, setQuery] = useState('')
  // PHA 1 nợ (audit A19): focus trap
  const trapRef = useFocusTrap(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scoreText, setScoreText] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [localScores, setLocalScores] = useState<Record<string, number>>(savedScores)

  const normalizedQuery = query.trim().toLocaleLowerCase('vi')
  const filteredStudents = useMemo(() => students.filter(student => (
    !normalizedQuery
    || student.name.toLocaleLowerCase('vi').includes(normalizedQuery)
    || student.code.toLocaleLowerCase('vi').includes(normalizedQuery)
  )), [students, normalizedQuery])

  const selected = students.find(student => student.id === selectedId) ?? null
  const parsedScore = Number(scoreText.replace(',', '.'))
  const scoreValid = scoreText.trim() !== ''
    && Number.isFinite(parsedScore)
    && parsedScore >= 0
    && parsedScore <= maxScore

  const chooseStudent = (student: GuidedGradeStudent) => {
    setSelectedId(student.id)
    setScoreText(localScores[student.id] === undefined ? '' : String(localScores[student.id]))
    setMessage('')
    setError('')
  }

  const adjustScore = (delta: number) => {
    const current = scoreValid ? parsedScore : 0
    const next = Math.min(maxScore, Math.max(0, Math.round((current + delta) * 10) / 10))
    setScoreText(String(next))
    setError('')
  }

  const saveAndContinue = async () => {
    if (!selected || !scoreValid || saving) return
    setSaving(true)
    setError('')
    const ok = await onSave(selected.id, parsedScore)
    setSaving(false)
    if (!ok) {
      setError('Không lưu được điểm. Kiểm tra kết nối rồi thử lại; nếu đang offline, đảm bảo ứng dụng vẫn mở đúng phiên chấm.')
      return
    }

    const nextScores = { ...localScores, [selected.id]: parsedScore }
    setLocalScores(nextScores)
    setMessage(essayMode
      ? `Đã lưu điểm tự luận ${parsedScore}/${maxScore} cho ${selected.name}.`
      : `Đã lưu ${parsedScore}/${maxScore} cho ${selected.name}.`)
    const currentIndex = students.findIndex(student => student.id === selected.id)
    const nextStudent = students
      .slice(currentIndex + 1)
      .concat(students.slice(0, currentIndex))
      .find(student => nextScores[student.id] === undefined)
    setSelectedId(nextStudent?.id ?? null)
    setScoreText('')
  }

  const quickScores = Number.isInteger(maxScore) && maxScore <= 20
    ? Array.from({ length: maxScore + 1 }, (_, index) => index)
    : []

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="guided-grade-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <div ref={trapRef} className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h4 id="guided-grade-title" className="font-extrabold text-parish-primary">Chấm ổn định trên điện thoại</h4>
            <p className="text-[11px] text-text-muted">Không cần QR · chọn đúng học sinh trước khi chấm</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Đóng chấm ổn định">
            <X size={15} /> Đóng
          </button>
        </div>

        {message && (
          <div role="status" className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-600">
            <CheckCircle2 size={15} /> {message}
          </div>
        )}

        {error && (
          <div role="alert" className="mx-3 mt-3 flex items-start gap-2 rounded-xl border border-parish-danger/30 bg-parish-danger-bg/40 px-3 py-2 text-xs text-parish-danger">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {!selected ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <label className="relative block">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Tìm tên hoặc mã thiếu nhi…"
                className="form-input min-h-11 w-full pl-10"
              />
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-surface-border">
              {filteredStudents.length === 0 ? (
                <p className="p-5 text-center text-sm text-text-muted">Không tìm thấy học sinh trong lớp của phiên này.</p>
              ) : filteredStudents.map(student => {
                const saved = localScores[student.id]
                return (
                  <button
                    type="button"
                    key={student.id}
                    onClick={() => chooseStudent(student)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-surface-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-app"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-text-main">{student.name}</span>
                      <span className="text-xs text-text-muted">{student.code}</span>
                    </span>
                    <span className={saved === undefined ? 'badge badge-neutral text-xs' : 'badge badge-primary text-xs'}>
                      {saved === undefined ? 'Chưa chấm' : `${saved}/${maxScore}`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <button type="button" className="mb-3 flex min-h-11 items-center gap-1 text-sm font-bold text-parish-primary" onClick={() => setSelectedId(null)}>
              <ChevronLeft size={17} /> Chọn học sinh khác
            </button>

            <div className="mb-3 rounded-xl border-2 border-parish-primary/30 bg-parish-primary-light p-3 text-center">
              <p className="text-lg font-black text-parish-primary">{selected.name}</p>
              <p className="text-sm font-semibold text-text-muted">Mã {selected.code}</p>
              {localScores[selected.id] !== undefined && (
                <p className="mt-1 text-xs font-bold text-amber-600">
                  {essayMode ? 'Điểm tự luận đang lưu' : 'Điểm đang lưu'}: {localScores[selected.id]}/{maxScore}
                  {essayMode && totalScores?.[selected.id] !== undefined ? ` — tổng hiện tại: ${totalScores[selected.id]}` : ''}
                  {' — '}lưu mới sẽ ghi đè phần này.
                </p>
              )}
            </div>

            <button type="button" className="btn btn-secondary mb-4 min-h-12 w-full justify-center" onClick={() => onScanOmr(selected)}>
              <ScanLine size={17} /> Chỉ quét khung OMR cho em này
            </button>

            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-extrabold text-text-main">{essayMode ? 'Nhập điểm tự luận' : 'Hoặc nhập điểm trực tiếp'}</span>
              <span className="text-xs text-text-muted">0–{maxScore}</span>
            </div>
            <div className="grid grid-cols-[48px_1fr_48px] gap-2">
              <button type="button" className="btn btn-secondary min-h-12 justify-center text-xl" onClick={() => adjustScore(-0.5)} aria-label="Giảm 0.5 điểm">−</button>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={maxScore}
                step={0.5}
                value={scoreText}
                onChange={event => { setScoreText(event.target.value); setError('') }}
                className="form-input min-h-12 text-center text-2xl font-black"
                placeholder="Điểm"
                aria-label="Điểm cần lưu"
              />
              <button type="button" className="btn btn-secondary min-h-12 justify-center text-xl" onClick={() => adjustScore(0.5)} aria-label="Tăng 0.5 điểm">+</button>
            </div>

            {quickScores.length > 0 && (
              <div className="mt-3 grid grid-cols-6 gap-1.5">
                {quickScores.map(score => (
                  <button
                    type="button"
                    key={score}
                    className={`min-h-10 rounded-lg border text-sm font-black ${parsedScore === score && scoreValid ? 'border-parish-primary bg-parish-primary text-white' : 'border-surface-border bg-surface-app text-text-main'}`}
                    onClick={() => setScoreText(String(score))}
                  >
                    {score}
                  </button>
                ))}
              </div>
            )}

            {!scoreValid && scoreText.trim() !== '' && (
              <p className="mt-2 text-xs font-semibold text-parish-danger">Điểm phải nằm trong khoảng 0–{maxScore}.</p>
            )}

            <button
              type="button"
              disabled={!scoreValid || saving}
              onClick={() => void saveAndContinue()}
              className="btn btn-primary mt-4 min-h-12 w-full justify-center"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              {saving ? 'Đang lưu…' : `Lưu điểm cho ${selected.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
