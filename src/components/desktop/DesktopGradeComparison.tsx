import React, { useMemo } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import type { Student } from '../../types'
import { Columns3, TrendingUp, TrendingDown, Minus } from 'lucide-react'

export const DesktopGradeComparison: React.FC = () => {
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
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
      const cls = useClassStore.getState().findClassById(s.classId)

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
  }, [filteredStudents, getStudentGrade, calculateStudentAvg])

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

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up') return <TrendingUp size={16} className="text-emerald-600" />
    if (trend === 'down') return <TrendingDown size={16} className="text-rose-600" />
    if (trend === 'same') return <Minus size={16} className="text-slate-400" />
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-surface-border shadow-card">
        <h2 className="text-lg font-extrabold text-parish-primary m-0 tracking-tight flex items-center gap-2">
          <Columns3 size={20} /> So Sánh Học Kỳ I vs Học Kỳ II
        </h2>
        <p className="text-sm text-text-muted mt-1 font-medium">
          {comparisonData.length} thiếu nhi được so sánh
        </p>
      </div>

      {/* Trend Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-emerald-600">{stats.up}</div>
          <div className="text-xs font-semibold text-emerald-700 mt-1">Tiến Bộ ↑</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-rose-600">{stats.down}</div>
          <div className="text-xs font-semibold text-rose-700 mt-1">Giảm ↓</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-slate-500">{stats.same}</div>
          <div className="text-xs font-semibold text-slate-600 mt-1">Giữ Nguyên</div>
        </div>
        <div className="bg-surface-app border border-surface-border rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-text-muted">{stats.none}</div>
          <div className="text-xs font-semibold text-text-muted mt-1">Chưa Đủ Dữ Liệu</div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0">
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
              <tr className="bg-parish-primary text-white text-xs font-bold uppercase tracking-wider">
                <th className="py-3 px-4 text-left">Tên Thiếu Nhi & Lớp</th>
                <th className="py-3 px-4 text-center">HK I</th>
                <th className="py-3 px-4 text-center">Miệng / 15P / 1T / GK / CK</th>
                <th className="py-3 px-4 text-center">HK II</th>
                <th className="py-3 px-4 text-center">Miệng / 15P / 1T / GK / CK</th>
                <th className="py-3 px-4 text-center">Chênh Lệch</th>
                <th className="py-3 px-4 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-muted">
                    Chưa có dữ liệu điểm để so sánh.
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
                    <tr key={student.id} className="border-b border-surface-hover hover:bg-surface-app transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-text-main truncate">
                          <span className="text-parish-secondary mr-1">{student.holyName}</span>
                          {student.fullName}
                        </div>
                        <div className="text-xs text-text-muted truncate">{cls?.name} • {student.code}</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="font-black text-lg text-parish-primary">{avg1.score !== null ? avg1.score : '—'}</div>
                        <span className="text-[10px] font-bold text-text-muted">{avg1.label || '—'}</span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="grid grid-cols-5 gap-0.5 text-[10px]">
                          <div><span className="text-text-muted">M</span><br /><span className="font-bold">{g1?.scoreOral ?? '—'}</span></div>
                          <div><span className="text-text-muted">15</span><br /><span className="font-bold">{g1?.score15m ?? '—'}</span></div>
                          <div><span className="text-text-muted">1T</span><br /><span className="font-bold">{g1?.score1Period ?? '—'}</span></div>
                          <div><span className="text-text-muted">GK</span><br /><span className="font-bold">{g1?.scoreMidterm ?? '—'}</span></div>
                          <div><span className="text-parish-secondary">CK</span><br /><span className="font-bold text-parish-secondary">{g1?.scoreFinal ?? '—'}</span></div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="font-black text-lg text-parish-primary">{avg2.score !== null ? avg2.score : '—'}</div>
                        <span className="text-[10px] font-bold text-text-muted">{avg2.label || '—'}</span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="grid grid-cols-5 gap-0.5 text-[10px]">
                          <div><span className="text-text-muted">M</span><br /><span className="font-bold">{g2?.scoreOral ?? '—'}</span></div>
                          <div><span className="text-text-muted">15</span><br /><span className="font-bold">{g2?.score15m ?? '—'}</span></div>
                          <div><span className="text-text-muted">1T</span><br /><span className="font-bold">{g2?.score1Period ?? '—'}</span></div>
                          <div><span className="text-text-muted">GK</span><br /><span className="font-bold">{g2?.scoreMidterm ?? '—'}</span></div>
                          <div><span className="text-parish-secondary">CK</span><br /><span className="font-bold text-parish-secondary">{g2?.scoreFinal ?? '—'}</span></div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className={`font-extrabold text-lg ${
                          trend === 'up' ? 'text-emerald-600' :
                          trend === 'down' ? 'text-rose-600' :
                          'text-slate-400'
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
