import React, { useState, useMemo } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { MOCK_CLASSES } from '../../data/mockParishData'
import type { ScoreType, Student } from '../../types'
import {
  Calculator, Plus, Trash2, Calendar, Clock,
  CheckCircle2, Save, TrendingUp, BarChart3
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

const SCORE_TYPES: { id: ScoreType; label: string; color: string }[] = [
  { id: 'oral', label: 'Điểm Miệng', color: 'bg-blue-500' },
  { id: '15m', label: 'Điểm 15 Phút', color: 'bg-emerald-500' },
  { id: '1period', label: 'Điểm 1 Tiết', color: 'bg-amber-500' },
  { id: 'midterm', label: 'Điểm Giữa Kỳ', color: 'bg-purple-500' },
  { id: 'final', label: 'Điểm Cuối Kỳ', color: 'bg-rose-500' },
]

export const DesktopDailyGradeEntry: React.FC = () => {
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
  const syncAllToGradeStore = useDailyGradeStore(s => s.syncAllToGradeStore)

  const [activeScoreType, setActiveScoreType] = useState<ScoreType>('oral')
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [synced, setSynced] = useState(false)
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)

  const filteredStudents = useMemo(
    () => selectedClassId === 'all'
      ? students.filter(s => s.status === 'Đang học')
      : students.filter(s => s.classId === selectedClassId && s.status === 'Đang học'),
    [selectedClassId, students]
  )

  const activeLabel = SCORE_TYPES.find(t => t.id === activeScoreType)?.label || ''

  const handleAddScore = (studentId: string) => {
    const raw = inputValues[studentId]
    if (!raw || raw.trim() === '') return
    const val = parseFloat(raw)
    if (isNaN(val) || val < 0 || val > 10) return
    addEntry(studentId, activeScoreType, val, selectedSemester)
    setInputValues(prev => ({ ...prev, [studentId]: '' }))
  }

  const handleKeyDown = (e: React.KeyboardEvent, studentId: string) => {
    if (e.key === 'Enter') {
      handleAddScore(studentId)
    }
  }

  const handleSync = () => {
    syncAllToGradeStore(filteredStudents.map(s => s.id), selectedSemester)
    setSynced(true)
    setTimeout(() => setSynced(false), 3000)
  }

  const stats = useMemo(() => {
    const allEntries = entries.filter(e =>
      e.scoreType === activeScoreType &&
      e.semester === selectedSemester &&
      filteredStudents.some(s => s.id === e.studentId)
    )
    if (allEntries.length === 0) return null
    const values = allEntries.map(e => e.value)
    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / values.length
    const sorted = [...values].sort((a, b) => a - b)
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
    return { count: values.length, avg: Math.round(avg * 10) / 10, median, min: sorted[0], max: sorted[sorted.length - 1] }
  }, [entries, activeScoreType, selectedSemester, filteredStudents])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-surface-border shadow-card">
        <h2 className="text-lg font-extrabold text-parish-primary m-0 tracking-tight flex items-center gap-2">
          <Calculator size={20} /> Nhập Điểm Hằng Ngày
        </h2>
        <p className="text-sm text-text-muted mt-1 font-medium">
          Nhập nhiều lần cho mỗi cột điểm — hệ thống tự tính ĐTB
        </p>
      </div>

      {/* Score Type Tabs */}
      <div className="bg-white rounded-2xl p-2 border border-surface-border shadow-card flex flex-wrap gap-1.5">
        {SCORE_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveScoreType(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeScoreType === t.id
                ? `${t.color} text-white shadow-xs`
                : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {activeScoreType === t.id && <CheckCircle2 size={14} />}
            {t.label}
            {entries.filter(e =>
              e.scoreType === t.id &&
              e.semester === selectedSemester &&
              filteredStudents.some(s => s.id === e.studentId)
            ).length > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeScoreType === t.id ? 'bg-white/20' : 'bg-surface-border'
              }`}>
                {entries.filter(e =>
                  e.scoreType === t.id &&
                  e.semester === selectedSemester &&
                  filteredStudents.some(s => s.id === e.studentId)
                ).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="bg-white rounded-2xl p-4 border border-surface-border shadow-card grid grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">Tổng lượt nhập</div>
            <div className="text-xl font-black text-parish-primary">{stats.count}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">ĐTB cột</div>
            <div className="text-xl font-black text-emerald-600">{stats.avg}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">Trung vị</div>
            <div className="text-xl font-black text-amber-600">{stats.median}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">Cao nhất</div>
            <div className="text-xl font-black text-blue-600">{stats.max}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">Thấp nhất</div>
            <div className="text-xl font-black text-rose-600">{stats.min}</div>
          </div>
        </div>
      )}

      {/* Student List */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0">
            <colgroup>
              <col className="w-[200px]" />
              <col className="w-[120px]" />
              <col className="w-auto" />
              <col className="w-[80px]" />
              <col className="w-[220px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Tên Thiếu Nhi</th>
                <th className="py-3 px-4 text-center">ĐTB {activeLabel}</th>
                <th className="py-3 px-4">Các Lần Nhập ({activeScoreType})</th>
                <th className="py-3 px-4 text-center">SL</th>
                <th className="py-3 px-4">{canEdit ? 'Nhập điểm mới' : 'Xem chi tiết'}</th>
                <th className="py-3 px-4 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-text-muted">
                    Không có thiếu nhi nào trong bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const studentEntries = getEntriesForStudent(student.id, selectedSemester, activeScoreType)
                  const avg = getAverageForStudent(student.id, selectedSemester, activeScoreType)
                  const existingGrade = getStudentGrade(student.id, selectedSemester)
                  const cls = MOCK_CLASSES.find(c => c.id === student.classId)
                  const isExpanded = expandedStudent === student.id

                  return (
                    <React.Fragment key={student.id}>
                      <tr className="border-b border-surface-hover hover:bg-surface-app transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-text-main truncate">
                            <span className="text-parish-secondary mr-1">{student.holyName}</span>
                            {student.fullName}
                          </div>
                          <div className="text-[11px] text-text-muted truncate">{cls?.name} • {student.code}</div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className={`text-lg font-black ${avg !== null ? 'text-parish-primary' : 'text-slate-300'}`}>
                            {avg !== null ? avg : '—'}
                          </div>
                          {existingGrade && (
                            <div className="text-[10px] text-text-muted">
                              (cột: {(existingGrade as any)[SCORE_FIELD_MAP[activeScoreType]] ?? '—'})
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {studentEntries.length === 0 ? (
                              <span className="text-xs text-text-muted italic">Chưa có</span>
                            ) : (
                              studentEntries.slice(isExpanded ? 0 : -3).map(e => (
                                <span
                                  key={e.id}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                                    e.value >= 8 ? 'bg-emerald-100 text-emerald-700' :
                                    e.value >= 5 ? 'bg-amber-100 text-amber-700' :
                                    'bg-rose-100 text-rose-700'
                                  }`}
                                  title={`${e.date}`}
                                >
                                  {e.value}
                                  {canEdit && (
                                    <button
                                      onClick={() => removeEntry(e.id)}
                                      className="hover:opacity-60"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  )}
                                </span>
                              ))
                            )}
                            {!isExpanded && studentEntries.length > 3 && (
                              <button
                                onClick={() => setExpandedStudent(student.id)}
                                className="text-[10px] text-parish-primary font-bold hover:underline"
                              >
                                +{studentEntries.length - 3} cũ hơn
                              </button>
                            )}
                            {isExpanded && (
                              <button
                                onClick={() => setExpandedStudent(null)}
                                className="text-[10px] text-text-muted font-bold hover:underline"
                              >
                                Thu gọn
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className="text-xs font-bold text-text-muted">{studentEntries.length}</span>
                        </td>

                        <td className="py-3 px-4">
                          {canEdit ? (
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0-10"
                                value={inputValues[student.id] || ''}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (v === '' || /^(?:10(?:\.0)?|[0-9](?:\.[05])?)$/.test(v.replace(',', '.')) || /^(?:10\.?|[0-9]\.)$/.test(v.replace(',', '.'))) {
                                    setInputValues(prev => ({ ...prev, [student.id]: v }));
                                  }
                                }}
                                onKeyDown={e => handleKeyDown(e, student.id)}
                                className="w-20 h-8 px-2 text-sm font-bold border border-surface-border rounded-lg focus:border-parish-primary outline-hidden text-center"
                              />
                              <button
                                onClick={() => handleAddScore(student.id)}
                                disabled={!inputValues[student.id]?.trim()}
                                className="h-8 w-8 flex items-center justify-center bg-parish-primary hover:bg-parish-primary-hover text-white rounded-lg disabled:opacity-40 transition-colors"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted italic">Chỉ xem</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {avg !== null && (
                            <div className="text-emerald-600">
                              <BarChart3 size={16} className="inline" />
                            </div>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sync Button */}
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={handleSync}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-xs ${
              synced
                ? 'bg-emerald-600 text-white'
                : 'bg-parish-primary hover:bg-parish-primary-hover text-white'
            }`}
          >
            {synced ? <CheckCircle2 size={18} /> : <Save size={18} />}
            {synced ? 'Đã đồng bộ vào bảng điểm!' : 'Đồng Bộ Điểm TB Vào Cột'}
          </button>
        </div>
      )}
    </div>
  )
}

const SCORE_FIELD_MAP: Record<ScoreType, string> = {
  oral: 'scoreOral',
  '15m': 'score15m',
  '1period': 'score1Period',
  midterm: 'scoreMidterm',
  final: 'scoreFinal',
}
