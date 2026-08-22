import React, { useMemo } from 'react'
import { ArrowDown, ArrowUp, Columns3, Minus } from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import type { GradeRecord } from '../../types'

const SCORE_FIELDS: Array<{ key: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal'>; label: string }> = [
  { key: 'scoreOral', label: 'M' },
  { key: 'score15m', label: '15' },
  { key: 'score1Period', label: '1T' },
  { key: 'scoreMidterm', label: 'GK' },
  { key: 'scoreFinal', label: 'CK' },
]

export const MobileGradeComparison: React.FC = () => {
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const classes = useClassStore(s => s.classes)

  const comparisonData = useMemo(() => {
    const selected = selectedClassId === 'all' ? students : students.filter(student => student.classId === selectedClassId)
    return selected.filter(student => getStudentGrade(student.id, 1) || getStudentGrade(student.id, 2)).map(student => {
      const first = calculateStudentAvg(student.id, 1)
      const second = calculateStudentAvg(student.id, 2)
      const difference = first.score !== null && second.score !== null ? Number((second.score - first.score).toFixed(1)) : null
      const trend = difference === null ? 'none' : difference > 0 ? 'up' : difference < 0 ? 'down' : 'same'
      return { student, first, second, firstGrade: getStudentGrade(student.id, 1), secondGrade: getStudentGrade(student.id, 2), difference, trend }
    }).sort((a, b) => (b.difference ?? -Infinity) - (a.difference ?? -Infinity))
  }, [selectedClassId, students, getStudentGrade, calculateStudentAvg])

  const stats = useMemo(() => comparisonData.reduce((result, item) => {
    if (item.trend === 'up') result.up += 1
    else if (item.trend === 'down') result.down += 1
    else if (item.trend === 'same') result.same += 1
    else result.none += 1
    return result
  }, { up: 0, down: 0, same: 0, none: 0 }), [comparisonData])
  const classNameById = useMemo(() => new Map(classes.map(item => [item.id, item.name])), [classes])

  return (
    <div className="flex flex-col gap-3">
      <section className="bg-surface-card rounded-2xl border border-surface-border shadow-card p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-parish-primary/10 text-parish-primary flex items-center justify-center shrink-0"><Columns3 size={19} /></div>
          <div>
            <h2 className="text-base font-extrabold text-parish-primary m-0">So Sánh Học Kỳ I vs Học Kỳ II</h2>
            <p className="text-xs text-text-muted mt-1 mb-0">Học kỳ I và Học kỳ II · {comparisonData.length} thiếu nhi có dữ liệu</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        {[
          ['Tiến bộ', stats.up, 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900'],
          ['Giảm', stats.down, 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900'],
          ['Giữ nguyên', stats.same, 'text-text-secondary bg-surface-hover border-surface-border'],
          ['Thiếu dữ liệu', stats.none, 'text-text-muted bg-surface-hover border-surface-border'],
        ].map(([label, value, style]) => (
          <div key={String(label)} className={`rounded-xl border p-3 text-center ${style}`}>
            <div className="text-xl font-black">{value}</div>
            <div className="text-[11px] font-bold mt-1">{label}</div>
          </div>
        ))}
      </section>

      {comparisonData.length === 0 ? (
        <div className="bg-surface-card rounded-2xl border border-surface-border p-8 text-center text-sm text-text-muted">Chưa có dữ liệu điểm để so sánh.</div>
      ) : comparisonData.map(item => (
        <article key={item.student.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-extrabold text-text-main truncate"><span className="text-parish-secondary mr-1">{item.student.holyName}</span>{item.student.fullName}</div>
              <div className="text-xs text-text-muted mt-1 truncate">{item.student.code} • {classNameById.get(item.student.classId) || '—'}</div>
            </div>
            <div className={`shrink-0 flex items-center gap-1 text-sm font-black ${item.trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : item.trend === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-text-muted'}`}>
              {item.trend === 'up' && <ArrowUp size={16} />}
              {item.trend === 'down' && <ArrowDown size={16} />}
              {item.trend === 'same' && <Minus size={16} />}
              {item.difference === null ? '—' : `${item.difference >= 0 ? '+' : ''}${item.difference}`}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {[['HK I', item.first, item.firstGrade], ['HK II', item.second, item.secondGrade]].map(([label, average, grade]) => (
              <div key={String(label)} className="rounded-xl bg-surface-app border border-surface-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text-muted">{String(label)}</span>
                  <span className="text-lg font-black text-parish-primary">{(average as any).score ?? '—'}</span>
                </div>
                <div className="text-[11px] text-text-muted font-semibold mt-1">{(average as any).label || 'Chưa xếp loại'}</div>
                <div className="grid grid-cols-5 gap-1 mt-3 text-center">
                  {SCORE_FIELDS.map(field => (
                    <div key={field.key} className="min-w-0">
                      <div className="text-[10px] text-text-muted">{field.label}</div>
                      <div className="text-xs font-bold text-text-main mt-0.5">{(grade as GradeRecord | undefined)?.[field.key] ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

export default MobileGradeComparison
