import { useMemo, useState } from 'react'
import { Calculator, Check, Download, Edit3, Grid3X3, Save, Settings2, Upload } from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useSyncStore } from '../../stores/syncStore'
import { useAuth } from '../../hooks/useAuth'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { exportGradebookToExcel } from '../../utils/excelExporter'
import { ExcelGradeImportModal } from '../common/ExcelGradeImportModal'
import { GradeFormulaConfigModal } from '../desktop/GradeFormulaConfigModal'
import type { GradeRecord, Student } from '../../types'

const SCORE_FIELDS: Array<{
  key: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>
  label: string
  highlight?: boolean
}> = [
  { key: 'scoreOral', label: 'Miệng' },
  { key: 'score15m', label: '15 phút' },
  { key: 'score1Period', label: '1 tiết' },
  { key: 'scoreMidterm', label: 'Giữa kỳ' },
  { key: 'scoreFinal', label: 'Cuối kỳ', highlight: true },
  { key: 'scoreDaoDuc', label: 'Đạo đức' },
]

function parseScore(value: string): number | null | undefined {
  const normalized = value.trim().replace(',', '.')
  if (normalized === '') return null
  if (!/^(?:10(?:\.0)?|[0-9](?:\.[05])?)$/.test(normalized)) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? parsed : undefined
}

interface MobileGradeMatrixProps {
  onViewReport: (student: Student) => void
}

export const MobileGradeMatrix: React.FC<MobileGradeMatrixProps> = ({ onViewReport }) => {
  const { can } = useAuth()
  const canEdit = can('admin', 'chunhiem')
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const upsertGrade = useGradeStore(s => s.upsertGrade)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const classes = useClassStore(s => s.classes)
  const academicYear = useAcademicYearStore(s => s.currentYear)
  const pendingCount = useSyncStore(s => s.pendingCount)
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess()
  const effectiveSemester: 1 | 2 = semesterRestricted ? openSemester : selectedSemester

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [invalidKey, setInvalidKey] = useState<string | null>(null)
  const [isOverrideModeEnabled, setIsOverrideModeEnabled] = useState(false)
  const [showFormulaModal, setShowFormulaModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  const filteredStudents = useMemo(() => (
    selectedClassId === 'all'
      ? students
      : students.filter(student => student.classId === selectedClassId)
  ), [selectedClassId, students])

  const classNameById = useMemo(() => new Map(classes.map(item => [item.id, item.name])), [classes])
  const selectedClassLabel = selectedClassId === 'all'
    ? 'Tất cả các lớp'
    : classes.find(item => item.id === selectedClassId)?.name || 'Lớp hiện tại'

  const matrixData = useMemo(() => {
    const result: Record<string, Partial<GradeRecord>> = {}
    filteredStudents.forEach(student => {
      const grade = getStudentGrade(student.id, effectiveSemester)
      result[student.id] = {
        studentId: student.id,
        semester: effectiveSemester,
        scoreOral: grade?.scoreOral ?? null,
        score15m: grade?.score15m ?? null,
        score1Period: grade?.score1Period ?? null,
        scoreMidterm: grade?.scoreMidterm ?? null,
        scoreFinal: grade?.scoreFinal ?? null,
        scoreDaoDuc: grade?.scoreDaoDuc ?? null,
        comments: grade?.comments || '',
      }
    })
    return result
  }, [effectiveSemester, filteredStudents, getStudentGrade])

  const getValue = (student: Student, field: typeof SCORE_FIELDS[number]['key']) => {
    const key = `${student.id}:${field}`
    if (key in drafts) return drafts[key]
    const grade = getStudentGrade(student.id, effectiveSemester)
    const value = grade?.[field]
    return value === null || value === undefined ? '' : String(value)
  }

  const markSaved = (key: string) => {
    setSavedKey(key)
    window.setTimeout(() => setSavedKey(current => current === key ? null : current), 1400)
  }

  const commit = (student: Student, field: typeof SCORE_FIELDS[number]['key']) => {
    if (!canEdit || !isOverrideModeEnabled) return
    const key = `${student.id}:${field}`
    const parsed = parseScore(drafts[key] ?? getValue(student, field))
    if (parsed === undefined) {
      setInvalidKey(key)
      return
    }
    setInvalidKey(null)
    const now = new Date().toISOString()
    const payload: Partial<GradeRecord> & { studentId: string; semester: 1 | 2 } = {
      studentId: student.id,
      semester: effectiveSemester,
      [field]: parsed,
    }
    if (field !== 'scoreDaoDuc') {
      ;(payload as any)[`${field}_source`] = 'manual'
      ;(payload as any)[`${field}_updated_at`] = now
    }
    upsertGrade(payload)
    setDrafts(previous => {
      const next = { ...previous }
      delete next[key]
      return next
    })
    markSaved(key)
  }

  const commitComment = (student: Student) => {
    if (!canEdit || !isOverrideModeEnabled) return
    const key = student.id
    if (!(key in commentDrafts)) return
    upsertGrade({ studentId: student.id, semester: effectiveSemester, comments: commentDrafts[key].slice(0, 500) })
    setCommentDrafts(previous => {
      const next = { ...previous }
      delete next[key]
      return next
    })
    markSaved(`${student.id}:comments`)
  }

  const handleExport = () => {
    exportGradebookToExcel({
      students: filteredStudents,
      matrixData,
      className: selectedClassLabel,
      semester: effectiveSemester,
      academicYear,
    })
  }

  const toggleExpanded = (studentId: string) => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface-card rounded-2xl border border-surface-border shadow-card p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-parish-primary/10 text-parish-primary flex items-center justify-center shrink-0">
            <Grid3X3 size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-parish-primary m-0">Ma trận điểm</h2>
            <p className="text-xs text-text-muted mt-1 mb-0">HK {effectiveSemester === 1 ? 'I' : 'II'} · {selectedClassLabel} · {filteredStudents.length} em</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            type="button"
            onClick={() => setIsOverrideModeEnabled(previous => !previous)}
            disabled={!canEdit}
            className={`min-h-[44px] rounded-xl px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-50 ${isOverrideModeEnabled ? 'bg-amber-500 text-white border-amber-500' : 'bg-surface-hover text-text-secondary border-surface-border'}`}
            aria-pressed={isOverrideModeEnabled}
          >
            <Edit3 size={14} /> {isOverrideModeEnabled ? 'Tắt chỉnh sửa' : 'Bật chỉnh sửa'}
          </button>
          <button type="button" onClick={() => setShowFormulaModal(true)} className="min-h-[44px] rounded-xl px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 bg-surface-hover text-text-secondary border border-surface-border">
            <Settings2 size={14} /> Hệ số
          </button>
          <button type="button" onClick={handleExport} disabled={filteredStudents.length === 0} className="min-h-[44px] rounded-xl px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 bg-parish-primary text-white disabled:opacity-50">
            <Download size={14} /> Xuất Excel
          </button>
          <button type="button" onClick={() => setShowImportModal(true)} disabled={!canEdit} className="min-h-[44px] rounded-xl px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 bg-parish-primary text-white disabled:opacity-50">
            <Upload size={14} /> Nhập Excel
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
          {canEdit && <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 border ${isOverrideModeEnabled ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900' : 'text-text-secondary bg-surface-hover border-surface-border'}`}><Calculator size={12} /> {isOverrideModeEnabled ? 'Đang cho phép ghi đè thủ công' : 'Chạm Bật chỉnh sửa để nhập điểm'}</span>}
          {pendingCount > 0 ? <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-900">☁ {pendingCount} thay đổi chờ đồng bộ</span> : <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900"><Check size={12} /> Đã lưu cục bộ</span>}
        </div>

        {!canEdit && <div className="mt-3 rounded-xl bg-surface-hover border border-surface-border px-3 py-2 text-xs font-semibold text-text-secondary">Tài khoản hiện tại chỉ có quyền xem điểm.</div>}
        {semesterRestricted && <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300">Học kỳ đang khóa theo quyền tài khoản; chỉ được thao tác ở HK {effectiveSemester === 1 ? 'I' : 'II'}.</div>}
      </div>

      {filteredStudents.length === 0 ? (
        <div className="bg-surface-card rounded-2xl border border-surface-border p-8 text-center text-sm text-text-muted">Không có thiếu nhi trong bộ lọc hiện tại.</div>
      ) : filteredStudents.map(student => {
        const grade = getStudentGrade(student.id, effectiveSemester)
        const avg = calculateStudentAvg(student.id, effectiveSemester)
        const isExpanded = expanded.has(student.id)
        const commentValue = commentDrafts[student.id] ?? grade?.comments ?? ''
        return (
          <article key={student.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-card overflow-hidden">
            <button type="button" onClick={() => toggleExpanded(student.id)} className="w-full text-left p-4 flex items-center justify-between gap-3 min-h-[76px]">
              <span className="min-w-0">
                <span className="block font-extrabold text-parish-primary truncate"><span className="text-parish-secondary mr-1">{student.holyName}</span>{student.fullName}</span>
                <span className="block text-xs text-text-muted mt-1 truncate">{student.code} • {classNameById.get(student.classId) || '—'}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-lg font-black text-parish-primary">{avg.score ?? '—'}</span>
                <span className="badge badge-primary text-[10px]">{avg.label || 'Chưa nhập'}</span>
              </span>
            </button>

            <div className="grid grid-cols-3 gap-px bg-surface-border border-y border-surface-border">
              {SCORE_FIELDS.map(field => {
                const source = field.key === 'scoreDaoDuc' ? undefined : (grade as Record<string, unknown> | undefined)?.[`${field.key}_source`]
                return (
                  <div key={field.key} className={`p-2.5 text-center ${field.highlight ? 'bg-parish-secondary-light/20' : 'bg-surface-card'}`}>
                    <div className="text-[10px] font-semibold text-text-muted truncate">{field.label}</div>
                    <div className={`text-sm font-black mt-1 ${field.highlight ? 'text-parish-secondary' : 'text-text-main'}`}>{grade?.[field.key] ?? '—'}</div>
                    {source === 'manual' && <div className="text-[9px] text-amber-700 font-bold mt-0.5">Thủ công</div>}
                    {source === 'daily_avg' && <div className="text-[9px] text-sky-700 font-bold mt-0.5">Từ hằng ngày</div>}
                  </div>
                )
              })}
            </div>

            {isExpanded && (
              <div className="p-4 bg-surface-app flex flex-col gap-3">
                {canEdit && isOverrideModeEnabled ? (
                  <>
                    <div className="text-xs font-bold text-text-secondary flex items-center gap-1.5"><Edit3 size={13} /> Nhập nhanh điểm</div>
                    <div className="grid grid-cols-2 gap-2">
                      {SCORE_FIELDS.map(field => {
                        const key = `${student.id}:${field.key}`
                        const invalid = invalidKey === key
                        return (
                          <label key={field.key} className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-text-muted">{field.label}</span>
                            <input
                              value={getValue(student, field.key)}
                              onChange={event => setDrafts(previous => ({ ...previous, [key]: event.target.value }))}
                              onBlur={() => commit(student, field.key)}
                              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(student, field.key) } }}
                              inputMode="decimal"
                              aria-label={`${field.label} của ${student.fullName}`}
                              className={`h-11 rounded-xl border bg-surface-card px-3 text-center text-sm font-extrabold outline-none focus:border-parish-primary ${invalid ? 'border-rose-500 bg-rose-50' : 'border-surface-border'}`}
                            />
                            {invalid && <span className="text-[10px] text-rose-600 font-semibold">Nhập 0–10, bước 0,5.</span>}
                            {savedKey === key && <span className="text-[10px] text-emerald-600 font-semibold flex items-center justify-center gap-1"><Check size={11} /> Đã lưu cục bộ</span>}
                          </label>
                        )
                      })}
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-text-muted">Nhận xét / ghi chú</span>
                      <textarea
                        value={commentValue}
                        maxLength={500}
                        onChange={event => setCommentDrafts(previous => ({ ...previous, [student.id]: event.target.value }))}
                        onBlur={() => commitComment(student)}
                        rows={3}
                        className="rounded-xl border border-surface-border bg-surface-card px-3 py-2 text-sm outline-none focus:border-parish-primary resize-none"
                        placeholder="Nhập nhận xét cho thiếu nhi..."
                      />
                      <span className="text-[10px] text-text-muted text-right">{commentValue.length}/500</span>
                    </label>
                    <div className="text-[11px] text-text-muted flex items-center gap-1.5"><Save size={12} /> Rời khỏi ô hoặc nhấn Enter để lưu.</div>
                  </>
                ) : (
                  <div className="text-xs text-text-muted">{canEdit ? 'Bật chế độ chỉnh sửa để nhập điểm hoặc nhận xét.' : 'Bạn không có quyền chỉnh sửa điểm.'}</div>
                )}
                {grade?.comments && !isOverrideModeEnabled && <div className="rounded-xl bg-surface-card border border-surface-border px-3 py-2 text-xs italic text-text-muted">“{grade.comments}”</div>}
                <button type="button" onClick={() => onViewReport(student)} className="btn btn-secondary w-full min-h-[44px]">Xem kết quả học tập chi tiết</button>
              </div>
            )}
          </article>
        )
      })}

      <GradeFormulaConfigModal isOpen={showFormulaModal} onClose={() => setShowFormulaModal(false)} />
      <ExcelGradeImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} semester={effectiveSemester} />
    </div>
  )
}

export default MobileGradeMatrix
