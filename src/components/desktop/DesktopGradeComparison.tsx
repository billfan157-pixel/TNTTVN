import React, { useMemo } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'

import { Columns3, TrendingUp, TrendingDown, Minus, BarChart3, type LucideProps } from 'lucide-react'
import { EmptyState } from '../common/StateFeedback'
import { PageHeader } from '../common/PageHeader'
import { StudentName } from '../common/StudentName'

const TrendIcon = ({ trend }: { trend: string } & LucideProps) => {
  if (trend === 'up') return <TrendingUp size={16} className="text-[var(--color-parish-success)]" />
  if (trend === 'down') return <TrendingDown size={16} className="text-[var(--color-parish-danger)]" />
  if (trend === 'same') return <Minus size={16} className="text-text-muted" />
  return null
}

export const DesktopGradeComparison: React.FC = () => {
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const findClassById = useClassStore(s => s.findClassById)
  const selectedClassId = useFilterStore(s => s.selectedClassId)

  const filteredStudents = selectedClassId === 'all'
    ? students
    : students.filter(s => s.classId === selectedClassId)

  const comparisonData = useMemo(() => {
    return filteredStudents.filter(s => {
      const g1 = getStudentGrade(s.id, 1)
      const g2 = getStudentGrade(s.id, 2)
      return g1 || g2
    }).map(s => {
      const avg1 = calculateStudentAvg(s.id, 1)
      const avg2 = calculateStudentAvg(s.id, 2)
      const cls = findClassById(s.classId)

      let trend: 'up' | 'down' | 'same' | 'none' = 'none'
      if (avg1.score !== null && avg2.score !== null) {
        if (avg2.score > avg1.score) trend = 'up'
        else if (avg2.score < avg1.score) trend = 'down'
        else trend = 'same'
      }

      return { student: s, avg1, avg2, trend, cls }
    }).sort((a, b) => {
      const diffA = (a.avg2.score ?? 0) - (a.avg1.score ?? 0)
      const diffB = (b.avg2.score ?? 0) - (b.avg1.score ?? 0)
      return diffB - diffA
    })
  }, [filteredStudents, getStudentGrade, calculateStudentAvg, findClassById])

  const stats = useMemo(() => {
    let up = 0, down = 0, same = 0, none = 0
    comparisonData.forEach(d => {
      if (d.trend === 'up') up++
      else if (d.trend === 'down') down++
      else if (d.trend === 'same') same++
      else none++
    })
    return { up, down, same, none }
  }, [comparisonData])

  return (
    <div className="product-view flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        icon={<Columns3 size={20} />}
        title="So Sánh Học Kỳ I vs Học Kỳ II"
        description={`${comparisonData.length} thiếu nhi được so sánh`}
      />

      {/* Trend Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--color-parish-success-bg)] border border-[var(--color-parish-success)]/20 rounded-2xl p-3 text-center">
          <div className="text-xl sm:text-2xl font-black text-[var(--color-parish-success)]">{stats.up}</div>
          <div className="text-[11px] sm:text-xs font-semibold text-[var(--color-parish-success-hover)] mt-1">Tiến Bộ ↑</div>
        </div>
        <div className="bg-[var(--color-parish-danger-bg)] border border-[var(--color-parish-danger)]/20 rounded-2xl p-3 text-center">
          <div className="text-xl sm:text-2xl font-black text-[var(--color-parish-danger)]">{stats.down}</div>
          <div className="text-[11px] sm:text-xs font-semibold text-[var(--color-parish-danger-hover)] mt-1">Giảm ↓</div>
        </div>
        <div className="bg-surface-hover border border-surface-border rounded-2xl p-3 text-center">
          <div className="text-xl sm:text-2xl font-black text-text-secondary">{stats.same}</div>
          <div className="text-[11px] sm:text-xs font-semibold text-text-secondary mt-1">Giữ Nguyên</div>
        </div>
        <div className="bg-surface-app border border-surface-border rounded-2xl p-3 text-center">
          <div className="text-xl sm:text-2xl font-black text-text-muted">{stats.none}</div>
          <div className="text-[11px] sm:text-xs font-semibold text-text-muted mt-1">Chưa Đủ Dữ Liệu</div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="table-wrapper">
        <div className="table-scroll">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0 bg-surface-card text-text-main">
            <colgroup>
              <col className="w-[220px]" />
              <col className="w-[120px]" />
              <col className="w-[150px]" />
              <col className="w-[150px]" />
              <col className="w-[150px]" />
              <col className="w-[150px]" />
              <col className="w-[60px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-3 px-4 text-left sticky left-0 bg-surface-app z-10" scope="col">Tên Thiếu Nhi & Lớp</th>
                <th className="py-3 px-4 text-center" scope="col">HK I</th>
                <th className="py-3 px-4 text-center" scope="col">Miệng / 15P / 1T / GK / CK</th>
                <th className="py-3 px-4 text-center" scope="col">HK II</th>
                <th className="py-3 px-4 text-center" scope="col">Miệng / 15P / 1T / GK / CK</th>
                <th className="py-3 px-4 text-center" scope="col">Chênh Lệch</th>
                <th className="py-3 px-4 text-center" scope="col"></th>
              </tr>
            </thead>
            <tbody className="bg-surface-card">
              {comparisonData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8">
                    <EmptyState
                      icon={BarChart3}
                      title="Chưa có dữ liệu điểm để so sánh"
                      description="Nhập điểm cho cả hai học kỳ để xem so sánh tiến độ của từng thiếu nhi."
                    />
                  </td>
                </tr>
              ) : (
                comparisonData.map(({ student, avg1, avg2, trend, cls }) => {
                  const g1 = getStudentGrade(student.id, 1)
                  const g2 = getStudentGrade(student.id, 2)
                  const diff = avg1.score !== null && avg2.score !== null
                    ? (avg2.score - avg1.score).toFixed(1)
                    : '—'

                  return (
                    <tr key={student.id} className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors">
                      <td className="py-3 px-4 sticky left-0 bg-surface-card z-10 shadow-xs">
                        <StudentName holyName={student.holyName} fullName={student.fullName} size="base" />
                        <div className="text-sm text-text-muted truncate">{cls?.name} • {student.code}</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="font-black text-base text-parish-primary">{avg1.score !== null ? avg1.score : '—'}</div>
                        <span className="text-xs font-bold text-text-muted">{avg1.label || '—'}</span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="grid grid-cols-5 gap-0.5 text-xs">
                          <div><span className="text-text-muted">M</span><br /><span className="font-bold">{g1?.scoreOral ?? '—'}</span></div>
                          <div><span className="text-text-muted">15</span><br /><span className="font-bold">{g1?.score15m ?? '—'}</span></div>
                          <div><span className="text-text-muted">1T</span><br /><span className="font-bold">{g1?.score1Period ?? '—'}</span></div>
                          <div><span className="text-text-muted">GK</span><br /><span className="font-bold">{g1?.scoreMidterm ?? '—'}</span></div>
                          <div><span className="text-parish-secondary">CK</span><br /><span className="font-bold text-parish-secondary">{g1?.scoreFinal ?? '—'}</span></div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="font-black text-base text-parish-primary">{avg2.score !== null ? avg2.score : '—'}</div>
                        <span className="text-xs font-bold text-text-muted">{avg2.label || '—'}</span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="grid grid-cols-5 gap-0.5 text-xs">
                          <div><span className="text-text-muted">M</span><br /><span className="font-bold">{g2?.scoreOral ?? '—'}</span></div>
                          <div><span className="text-text-muted">15</span><br /><span className="font-bold">{g2?.score15m ?? '—'}</span></div>
                          <div><span className="text-text-muted">1T</span><br /><span className="font-bold">{g2?.score1Period ?? '—'}</span></div>
                          <div><span className="text-text-muted">GK</span><br /><span className="font-bold">{g2?.scoreMidterm ?? '—'}</span></div>
                          <div><span className="text-parish-secondary">CK</span><br /><span className="font-bold text-parish-secondary">{g2?.scoreFinal ?? '—'}</span></div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className={`font-extrabold text-base ${
                          trend === 'up' ? 'text-[var(--color-parish-success)]' :
                          trend === 'down' ? 'text-[var(--color-parish-danger)]' :
                          'text-text-muted'
                        }`}>
                          {diff !== '—' ? (Number(diff) >= 0 ? `+${diff}` : diff) : '—'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <TrendIcon trend={trend} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
