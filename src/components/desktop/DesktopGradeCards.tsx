import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import type { Student } from '../../types'
import { FileSpreadsheet, Eye, Printer } from 'lucide-react'
import { PageHeader } from '../common/PageHeader'

interface DesktopGradeCardsProps {
  onViewReport: (student: Student) => void
  onPrintReport: (student: Student) => void
}

export const DesktopGradeCards: React.FC<DesktopGradeCardsProps> = ({ onViewReport, onPrintReport }) => {
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const findClassById = useClassStore(s => s.findClassById)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const selectedSemester = useFilterStore(s => s.selectedSemester)

  const filteredStudents = selectedClassId === 'all'
    ? students
    : students.filter(s => s.classId === selectedClassId)

  // P0.8 (audit desktop 2026-08-22): so sánh label KHÔNG phân biệt hoa/thường —
  // gradePolicy.ts:195 trả 'Xuất Sắc' (S hoa) nhưng key cũ là 'Xuất sắc' khiến
  // học sinh xuất sắc rơi vào fallback xám thay vì badge vàng.
  const rankColors: Record<string, string> = {
    'xuất sắc': 'badge-warning',
    'giỏi': 'badge-info',
    'khá': 'badge-success',
    'trung bình': 'badge-neutral',
    'yếu': 'badge-danger',
  }

  return (
    <div className="product-view flex flex-col gap-6">
      <PageHeader
        icon={<FileSpreadsheet size={20} />}
        title="Thẻ Điểm Cá Nhân"
        description={`Học Kỳ ${selectedSemester} • ${filteredStudents.length} thiếu nhi`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredStudents.length === 0 ? (
          <div className="col-span-full text-center py-12 text-text-muted bg-surface-card rounded-2xl border border-surface-border shadow-card">
            Không có thiếu nhi nào trong bộ lọc.
          </div>
        ) : (
          filteredStudents.map(student => {
            const grade = getStudentGrade(student.id, selectedSemester)
            const avg = calculateStudentAvg(student.id, selectedSemester)
            const cls = findClassById(student.classId)
            const rankClass = rankColors[avg.label?.trim().toLowerCase()] || 'bg-surface-hover text-text-secondary'

            return (
              <div key={student.id} className="entity-card app-panel--interactive overflow-hidden">
                {/* Card Header */}
                <div className="p-4 border-b border-surface-border">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-parish-primary truncate">
                        <span className="text-parish-secondary mr-1">{student.holyName}</span>
                        <span>{student.fullName}</span>
                      </div>
                      <div className="text-xs text-text-muted mt-0.5 truncate">
                        {student.code} • {cls?.name || '—'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-black text-parish-primary leading-tight">
                        {avg.score !== null ? avg.score : '—'}
                      </div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${rankClass}`}>
                        {avg.label || 'Chưa nhập'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score Grid */}
                <div className="grid grid-cols-6 gap-px bg-surface-border">
                  {[
                    { label: 'Miệng', value: grade?.scoreOral },
                    { label: '15P', value: grade?.score15m },
                    { label: '1 Tiết', value: grade?.score1Period },
                    { label: 'Giữa Kỳ', value: grade?.scoreMidterm },
                    { label: 'Cuối Kỳ', value: grade?.scoreFinal, highlight: true },
                    { label: 'Đạo Đức', value: grade?.scoreDaoDuc },
                  ].map(col => (
                    <div key={col.label} className={`p-3 text-center ${col.highlight ? 'bg-parish-secondary-light/20' : 'bg-surface-card'}`}>
                      <div className="text-[10px] font-semibold text-text-muted uppercase">{col.label}</div>
                      <div className={`text-sm font-bold mt-0.5 ${col.highlight ? 'text-parish-secondary' : 'text-text-main'}`}>
                        {col.value !== null && col.value !== undefined ? col.value : '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Comments */}
                {grade?.comments && (
                  <div className="px-4 py-2 text-xs italic text-text-muted bg-surface-app border-t border-surface-border">
                    "{grade.comments}"
                  </div>
                )}

                {/* Actions */}
                <div className="px-4 py-3 bg-surface-app border-t border-surface-border flex gap-2">
                  <button
                    onClick={() => onViewReport(student)}
                    className="btn btn-sm flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-parish-primary bg-surface-card border border-surface-border rounded-lg hover:bg-parish-primary-light transition-colors"
                  >
                    <Eye size={14} /> Chi Tiết
                  </button>
                  <button
                    onClick={() => onPrintReport(student)}
                    className="btn btn-sm flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-parish-secondary bg-surface-card border border-surface-border rounded-lg hover:bg-parish-secondary-light transition-colors"
                  >
                    <Printer size={14} /> In Phiếu
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
