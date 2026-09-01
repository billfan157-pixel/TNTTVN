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
import { hapticFeedback } from '../../utils/haptics'

const SCORE_TYPES: Array<{ id: DailyScoreType; label: string; short: string }> = [
  { id: 'oral', label: 'Điểm miệng', short: 'Miệng' },
  { id: '15m', label: 'Điểm 15 phút', short: '15 phút' },
  { id: '1period', label: 'Điểm 1 tiết', short: '1 tiết' },
]

const QUICK_SCORES = [10, 9, 8, 7, 6, 5]

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
  const [srAnnouncement, setSrAnnouncement] = useState<string>('')

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

  const entryCountsByType = useMemo(() => {
    const counts: Record<DailyScoreType, number> = { oral: 0, '15m': 0, '1period': 0 }
    for (const entry of entries) {
      if (entry.semester === selectedSemester && filteredStudents.some(s => s.id === entry.studentId)) {
        if (entry.scoreType in counts) {
          counts[entry.scoreType]++
        }
      }
    }
    return counts
  }, [entries, filteredStudents, selectedSemester])

  const addScoreValue = (student: Student, scoreValue: number) => {
    if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 10) {
      hapticFeedback.error()
      return
    }
    addEntry(student.id, activeType, scoreValue, selectedSemester)
    hapticFeedback.success()
    setInputValues(previous => ({ ...previous, [student.id]: '' }))
    setSrAnnouncement(`Đã thêm ${activeTypeLabel} ${scoreValue} cho ${student.fullName}`)
  }

  const addScore = (student: Student) => {
    const key = student.id
    const raw = (inputValues[key] || '').replace(',', '.').trim()
    const score = Number(raw)
    if (!raw || !Number.isFinite(score) || score < 0 || score > 10) {
      hapticFeedback.error()
      return
    }
    addScoreValue(student, score)
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
    <div className="product-view flex flex-col gap-2.5">
      {/* Live region for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      <section className="grade-command-deck" aria-label="Bảng chọn loại điểm hằng ngày">
        <div className="grade-command-deck__header">
          <div className="grade-command-deck__title-group">
            <div className="grade-command-deck__icon-tile">
              <BarChart3 size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="grade-command-deck__title">Nhập Điểm Hằng Ngày</h2>
              <p className="grade-command-deck__meta truncate">{activeTypeLabel} · HK {semesterRestricted ? (openSemester === 2 ? 'II' : 'I') : selectedSemester} · {filteredStudents.length} em</p>
            </div>
          </div>
        </div>

        <div className="grade-segmented-group" role="tablist" aria-label="Chọn loại điểm kiểm tra">
          {SCORE_TYPES.map(type => {
            const isActive = activeType === type.id
            const count = entryCountsByType[type.id]
            return (
              <button
                key={type.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => { setActiveType(type.id); hapticFeedback.light(); }}
                className={`grade-segmented-item ${isActive ? 'is-active' : ''}`}
              >
                <span>{type.short}</span>
                {count > 0 && <span className="count-badge tabular-nums">{count}</span>}
              </button>
            )
          })}
        </div>

        {!canEdit && <div className="rounded-xl bg-surface-hover border border-surface-border px-3 py-1.5 text-xs font-semibold text-text-secondary">Tài khoản hiện tại chỉ có quyền xem điểm.</div>}
      </section>

      {stats && (
        <section className="grade-metric-strip grade-metric-strip--3col" aria-label="Thống kê điểm số">
          <div className="grade-metric-cell">
            <span className="grade-metric-cell__label">Lượt nhập</span>
            <strong className="grade-metric-cell__value text-parish-primary">{stats.count}</strong>
          </div>
          <div className="grade-metric-cell">
            <span className="grade-metric-cell__label">Điểm TB</span>
            <strong className="grade-metric-cell__value text-parish-primary">{stats.avg}</strong>
          </div>
          <div className="grade-metric-cell">
            <span className="grade-metric-cell__label">Khoảng điểm</span>
            <strong className="grade-metric-cell__value text-text-secondary">{stats.min}–{stats.max}</strong>
          </div>
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
            <button type="button" onClick={() => toggleExpanded(student.id)} className="w-full text-left p-4 flex items-center justify-between gap-3 min-h-[76px]" aria-expanded={isExpanded}>
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
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              removeEntry(entry.id)
                              hapticFeedback.warning()
                              setSrAnnouncement(`Đã xóa điểm ${entry.value} của ${student.fullName}`)
                            }}
                            className="relative p-1 text-rose-600 after:absolute after:-inset-2.5 after:content-[''] active:text-rose-700"
                            aria-label={`Xóa điểm ${entry.value}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {canEdit ? (
                  <div className="flex flex-col gap-2.5">
                    {/* Quick Score 1-Tap Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Chọn điểm nhanh 1 chạm">
                      <span className="text-xs font-bold text-text-muted shrink-0 mr-1">Nhanh:</span>
                      {QUICK_SCORES.map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => addScoreValue(student, val)}
                          className="h-8 min-w-[36px] px-2 rounded-lg bg-surface-card border border-surface-border text-xs font-extrabold text-text-main active:scale-95 transition-transform hover:border-parish-primary hover:text-parish-primary"
                        >
                          {val}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={inputValues[student.id] || ''}
                        onChange={event => setInputValues(previous => ({ ...previous, [student.id]: event.target.value }))}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addScore(student) } }}
                        inputMode="decimal"
                        placeholder="Nhập 0–10..."
                        aria-label={`Thêm ${activeTypeLabel} cho ${student.fullName}`}
                        className="h-11 min-w-0 flex-1 rounded-xl border border-surface-border bg-surface-card px-3 text-center font-extrabold outline-none focus:border-parish-primary"
                      />
                      <button
                        type="button"
                        onClick={() => addScore(student)}
                        disabled={!inputValues[student.id]?.trim()}
                        className="h-11 w-11 rounded-xl bg-parish-primary text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
                        aria-label={`Thêm ${activeTypeLabel}`}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
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
