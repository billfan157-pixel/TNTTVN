import React, { useMemo, useState } from 'react'
import { BarChart3, CheckCircle2, Clock3, Plus, Trash2 } from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAuth } from '../../hooks/useAuth'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import type { DailyScoreType, Student } from '../../types'
import { StudentName } from '../common/StudentName'

const SCORE_TYPES: Array<{ id: DailyScoreType; label: string; short: string; color: string }> = [
  { id: 'oral', label: 'Điểm miệng', short: 'Miệng', color: 'bg-[var(--color-parish-info)]' },
  { id: '15m', label: 'Điểm 15 phút', short: '15 phút', color: 'bg-[var(--color-parish-success)]' },
  { id: '1period', label: 'Điểm 1 tiết', short: '1 tiết', color: 'bg-[var(--color-parish-warning)]' },
]

interface MobileDailyGradeEntryProps {
  onViewReport: (student: Student) => void
}

export const MobileDailyGradeEntry: React.FC<MobileDailyGradeEntryProps> = ({ onViewReport }) => {
  const { can } = useAuth()
  const canEdit = can('admin', 'chunhiem', 'phuta')
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const entries = useDailyGradeStore(s => s.entries)
  const addEntry = useDailyGradeStore(s => s.addEntry)
  const removeEntry = useDailyGradeStore(s => s.removeEntry)
  const getAverageForStudent = useDailyGradeStore(s => s.getAverageForStudent)
  const getEntriesForStudent = useDailyGradeStore(s => s.getEntriesForStudent)
  const classes = useClassStore(s => s.classes)
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess()
  const [activeType, setActiveType] = useState<DailyScoreType>('oral')
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filteredStudents = useMemo(() => (
    selectedClassId === 'all'
      ? students.filter(student => student.status === 'Đang học')
      : students.filter(student => student.classId === selectedClassId && student.status === 'Đang học')
  ), [selectedClassId, students])
  const classNameById = useMemo(() => new Map(classes.map(item => [item.id, item.name])), [classes])
  const activeTypeLabel = SCORE_TYPES.find(item => item.id === activeType)?.label || ''
  const activeEntries = useMemo(() => entries.filter(entry => entry.scoreType === activeType && entry.semester === selectedSemester && filteredStudents.some(student => student.id === entry.studentId)), [entries, activeType, selectedSemester, filteredStudents])
  const stats = useMemo(() => {
    if (!activeEntries.length) return null
    const values = activeEntries.map(entry => entry.value).sort((a, b) => a - b)
    const total = values.reduce((sum, value) => sum + value, 0)
    const middle = values.length % 2 === 0 ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2 : values[Math.floor(values.length / 2)]
    return { count: values.length, avg: Math.round((total / values.length) * 10) / 10, median: middle, min: values[0], max: values[values.length - 1] }
  }, [activeEntries])

  const addScore = (student: Student) => {
    const key = student.id
    const raw = (inputValues[key] || '').replace(',', '.').trim()
    const score = Number(raw)
    if (!raw || !Number.isFinite(score) || score < 0 || score > 10) return
    addEntry(student.id, activeType, score, selectedSemester)
    setInputValues(previous => ({ ...previous, [key]: '' }))
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
    <div className="product-view flex flex-col gap-3">
      <section className="mobile-page-header flex-col items-stretch">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-parish-primary m-0">Nhập Điểm Hằng Ngày</h2>
            <p className="text-xs text-text-muted mt-1 mb-0">{activeTypeLabel} · Học kỳ {semesterRestricted ? (openSemester === 2 ? 'II' : 'I') : selectedSemester}</p>
          </div>
          <BarChart3 size={20} className="text-parish-secondary shrink-0" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-4">
          {SCORE_TYPES.map(type => (
            <button key={type.id} type="button" onClick={() => setActiveType(type.id)} className={`min-h-[44px] rounded-xl px-2 text-[11px] font-extrabold ${activeType === type.id ? `${type.color} text-white` : 'bg-surface-hover text-text-secondary'}`}>
              {type.short}
            </button>
          ))}
        </div>
        {!canEdit && <div className="mt-3 rounded-xl bg-surface-hover border border-surface-border px-3 py-2 text-xs font-semibold text-text-secondary">Tài khoản hiện tại chỉ có quyền xem điểm.</div>}
      </section>

      {stats && (
        <section className="grid grid-cols-3 gap-2">
          {[['Lượt nhập', stats.count], ['ĐTB', stats.avg], ['Khoảng', `${stats.min}–${stats.max}`]].map(([label, value]) => (
            <div key={String(label)} className="bg-surface-card rounded-xl border border-surface-border p-3 text-center shadow-sm">
              <div className="text-[10px] font-semibold text-text-muted">{label}</div>
              <div className="text-base font-black text-parish-primary mt-1">{value}</div>
            </div>
          ))}
        </section>
      )}

      {filteredStudents.length === 0 ? (
        <div className="bg-surface-card rounded-2xl border border-surface-border p-8 text-center text-sm text-text-muted">Không có thiếu nhi trong lớp hiện tại.</div>
      ) : filteredStudents.map(student => {
        const studentEntries = getEntriesForStudent(student.id, selectedSemester, activeType)
        const average = getAverageForStudent(student.id, selectedSemester, activeType)
        const grade = getStudentGrade(student.id, selectedSemester)
        const isExpanded = expanded.has(student.id)
        return (
          <article key={student.id} className="entity-card overflow-hidden">
            <button type="button" onClick={() => toggleExpanded(student.id)} className="w-full text-left p-4 flex items-center justify-between gap-3 min-h-[76px]">
              <span className="min-w-0">
                <StudentName holyName={student.holyName} fullName={student.fullName} size="base" className="flex" />
                <span className="block text-xs text-text-muted mt-1 truncate">{classNameById.get(student.classId) || '—'} • {student.code}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-lg font-black text-parish-primary">{average ?? '—'}</span>
                <span className="text-[10px] font-semibold text-text-muted">{studentEntries.length} lần nhập</span>
              </span>
            </button>
            <div className="px-4 pb-3 flex items-center justify-between gap-3 text-xs text-text-muted">
              <span>Điểm ma trận: <strong className="text-text-main">{grade?.[activeType === 'oral' ? 'scoreOral' : activeType === '15m' ? 'score15m' : 'score1Period'] ?? '—'}</strong></span>
              {average !== null && <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={13} /> Có TB</span>}
            </div>
            {isExpanded && (
              <div className="border-t border-surface-border bg-surface-app p-4 flex flex-col gap-3">
                {studentEntries.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {studentEntries.map(entry => (
                      <span key={entry.id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-card border border-surface-border px-2.5 py-1.5 text-xs font-bold">
                        <Clock3 size={12} className="text-text-muted" /> {entry.value}
                        {canEdit && <button type="button" onClick={() => removeEntry(entry.id)} className="relative p-1 text-rose-600 after:absolute after:-inset-2.5 after:content-[''] active:text-rose-700" aria-label={`Xóa điểm ${entry.value}`}><Trash2 size={12} /></button>}
                      </span>
                    ))}
                  </div>
                )}
                {canEdit ? (
                  <div className="flex gap-2">
                    <input
                      value={inputValues[student.id] || ''}
                      onChange={event => setInputValues(previous => ({ ...previous, [student.id]: event.target.value }))}
                      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addScore(student) } }}
                      inputMode="decimal"
                      placeholder="0–10"
                      aria-label={`Thêm ${activeTypeLabel} cho ${student.fullName}`}
                      className="h-11 min-w-0 flex-1 rounded-xl border border-surface-border bg-surface-card px-3 text-center font-extrabold outline-none focus:border-parish-primary"
                    />
                    <button type="button" onClick={() => addScore(student)} disabled={!inputValues[student.id]?.trim()} className="h-11 w-11 rounded-xl bg-parish-primary text-white flex items-center justify-center disabled:opacity-40" aria-label={`Thêm ${activeTypeLabel}`}><Plus size={18} /></button>
                  </div>
                ) : <span className="text-xs text-text-muted italic">Chỉ xem</span>}
                <button type="button" onClick={() => onViewReport(student)} className="btn btn-secondary w-full min-h-[44px]">Xem kết quả học tập</button>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

export default MobileDailyGradeEntry
