import { useMemo, useState, Suspense } from 'react'
import { Check, ChevronDown, Download, Grid3X3, Upload } from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useSyncStore } from '../../stores/syncStore'
import { useAuth } from '../../hooks/useAuth'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { exportOfficialGradebook } from '../../services/reportExporter'
import { useToastStore } from '../../stores/toastStore'
import { lazyWithRetry } from '../../utils/lazyWithRetry'
import { StudentName } from '../common/StudentName'
import { SubpageHeader } from '../common/SubpageHeader'
import { NoResultState } from '../common/StateFeedback'
import { hapticFeedback } from '../../utils/haptics'
import type { GradeRecord, Student } from '../../types'

const ExcelGradeImportModal = lazyWithRetry(() => import('../common/ExcelGradeImportModal'), 'ExcelGradeImportModal')

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

interface MobileGradeBoardProps {
  onViewReport: (student: Student) => void
}

// C1 Unified Board: Bảng điểm tổng hợp trên mobile (View & Export/Import)
export const MobileGradeBoard: React.FC<MobileGradeBoardProps> = ({ onViewReport }) => {
  const { can } = useAuth()
  const canEdit = can('admin', 'chunhiem')
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const classes = useClassStore(s => s.classes)
  const academicYear = useAcademicYearStore(s => s.currentYear)
  const pendingCount = useSyncStore(s => s.pendingCount)
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess()
  const effectiveSemester: 1 | 2 = semesterRestricted ? openSemester : selectedSemester

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showImportModal, setShowImportModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const filteredStudents = useMemo(() => (
    selectedClassId === 'all'
      ? students
      : students.filter(student => student.classId === selectedClassId)
  ), [selectedClassId, students])

  const classNameById = useMemo(() => new Map(classes.map(item => [item.id, item.name])), [classes])
  const selectedClassLabel = selectedClassId === 'all'
    ? 'Tất cả các lớp'
    : classes.find(item => item.id === selectedClassId)?.name || 'Lớp hiện tại'

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await exportOfficialGradebook({ classId: selectedClassId, semester: effectiveSemester, academicYear })
      hapticFeedback.success()
      useToastStore.getState().addToast('Đã xuất bảng điểm chính thức từ máy chủ.', 'success')
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : 'Không thể xuất bảng điểm chính thức.', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const toggleExpanded = (studentId: string) => {
    hapticFeedback.light()
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  return (
    <div className="product-view flex flex-col gap-3">
      <SubpageHeader
        icon={<Grid3X3 size={16} />}
        title="Bảng Điểm"
        meta={<span>HK {effectiveSemester === 1 ? 'I' : 'II'} · {selectedClassLabel} · {filteredStudents.length} em</span>}
        ariaLabel="Bảng điều khiển điểm số"
        actions={
          <div className="flex items-center gap-1.5">
            {pendingCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-parish-info bg-parish-info-bg border border-parish-info/30">
                ☁ {pendingCount}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-parish-success bg-parish-success-bg border border-parish-success/30">
                <Check size={11} /> Đã lưu
              </span>
            )}

            <div className="grade-action-group">
              <button
                type="button"
                onClick={() => { void handleExport() }}
                disabled={filteredStudents.length === 0 || isExporting}
                className="grade-action-btn disabled:opacity-40"
                title="Xuất bảng điểm ra file Excel"
              >
                <Download size={12} /> {isExporting ? 'Đang xuất…' : 'Xuất'}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="grade-action-btn disabled:opacity-40"
                  title="Nhập điểm từ file Excel"
                >
                  <Upload size={12} /> Nhập
                </button>
              )}
            </div>
          </div>
        }
      >
        {!canEdit && <div className="rounded-xl bg-surface-hover border border-surface-border px-3 py-1.5 text-xs font-semibold text-text-secondary">Tài khoản hiện tại chỉ có quyền xem điểm.</div>}
        {semesterRestricted && <div className="rounded-xl bg-parish-warning-bg border border-parish-warning/30 px-3 py-1.5 text-xs font-semibold text-parish-warning">Học kỳ đang khóa theo quyền tài khoản; chỉ được thao tác ở HK {effectiveSemester === 1 ? 'I' : 'II'}.</div>}
      </SubpageHeader>

      {filteredStudents.length === 0 ? (
        <NoResultState title="Không có thiếu nhi" description="Không có thiếu nhi trong bộ lọc hiện tại." />
      ) : filteredStudents.map(student => {
        const grade = getStudentGrade(student.id, effectiveSemester)
        const avg = calculateStudentAvg(student.id, effectiveSemester)
        const isExpanded = expanded.has(student.id)
        return (
          <article key={student.id} className="entity-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleExpanded(student.id)}
              className="w-full text-left flex items-center justify-between gap-3 p-3.5 min-h-[64px]"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Thu gọn' : 'Mở rộng'} chi tiết của ${student.fullName}`}
            >
              <span className="min-w-0 flex-1">
                <StudentName holyName={student.holyName} fullName={student.fullName} size="base" className="flex" />
                <span className="block text-xs text-text-muted mt-0.5 truncate">{student.code} • {classNameById.get(student.classId) || '—'}</span>
              </span>
              <div className="shrink-0 flex items-center gap-2.5">
                <div className="text-right">
                  <span className="block text-lg font-black text-parish-primary leading-tight">{avg.score ?? '—'}</span>
                  <span className="badge badge-primary text-[10px]">{avg.label || 'Chưa nhập'}</span>
                </div>
                <div className={`p-1 rounded-lg text-text-muted bg-surface-hover/60 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-parish-primary' : ''}`} aria-hidden="true">
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            <div className="grid grid-cols-3 gap-px bg-surface-border border-y border-surface-border">
              {SCORE_FIELDS.map(field => {
                const source = field.key === 'scoreDaoDuc' ? undefined : (grade as Record<string, unknown> | undefined)?.[`${field.key}_source`]
                return (
                  <div key={field.key} className={`p-2.5 text-center ${field.highlight ? 'bg-parish-secondary-light/20' : 'bg-surface-card'}`}>
                    <div className={`text-[10px] font-semibold truncate ${field.highlight ? 'text-text-primary' : 'text-text-muted'}`}>{field.label}</div>
                    <div className={`text-sm font-black mt-1 ${field.highlight ? 'text-parish-secondary' : 'text-text-main'}`}>{grade?.[field.key] ?? '—'}</div>
                    {source === 'manual' && <div className="text-[10px] text-parish-warning-hover font-bold mt-0.5">Thủ công</div>}
                    {source === 'daily_avg' && <div className="text-[10px] text-parish-info font-bold mt-0.5">Từ hằng ngày</div>}
                  </div>
                )
              })}
            </div>
            {grade?.comments && !isExpanded && (
              <div className="px-4 py-2 text-xs italic text-text-muted bg-surface-app border-t border-surface-border line-clamp-2">“{grade.comments}”</div>
            )}

            {isExpanded && (
              <div className="p-4 flex flex-col gap-3 bg-surface-app border-t border-surface-border">
                {grade?.comments && <div className="rounded-xl bg-surface-card border border-surface-border px-3 py-2 text-xs italic text-text-muted">“{grade.comments}”</div>}
                <button type="button" onClick={() => onViewReport(student)} className="btn btn-secondary w-full min-h-[44px]">Xem kết quả học tập chi tiết</button>
              </div>
            )}
          </article>
        )
      })}

      {showImportModal && (
        <Suspense fallback={null}>
          <ExcelGradeImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} semester={effectiveSemester} />
        </Suspense>
      )}
    </div>
  )
}

export default MobileGradeBoard
