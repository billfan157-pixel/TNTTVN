import React, { useState, useMemo } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import type { DailyScoreType } from '../../types'
import {
  Calculator, Plus, Trash2,
  CheckCircle2, BarChart3
} from 'lucide-react'
import { PageHeader } from '../common/PageHeader'
import { useAuth } from '../../hooks/useAuth'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { useToastStore } from '../../stores/toastStore'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { StudentName } from '../common/StudentName'
import { EmptyState } from '../common/StateFeedback'

const SCORE_TYPES: { id: DailyScoreType; label: string; color: string }[] = [
  { id: 'oral', label: 'Điểm Miệng', color: 'bg-[var(--color-parish-info)]' },
  { id: '15m', label: 'Điểm 15 Phút', color: 'bg-[var(--color-parish-success)]' },
  { id: '1period', label: 'Điểm 1 Tiết', color: 'bg-[var(--color-parish-warning)]' },
]

export const DesktopDailyGradeEntry: React.FC = () => {
  const { can } = useAuth()
  const canEdit = can('admin', 'chunhiem', 'phuta')
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const findClassById = useClassStore(s => s.findClassById)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const entries = useDailyGradeStore(s => s.entries)
  const addEntry = useDailyGradeStore(s => s.addEntry)
  const removeEntry = useDailyGradeStore(s => s.removeEntry)
  const getAverageForStudent = useDailyGradeStore(s => s.getAverageForStudent)
  const getEntriesForStudent = useDailyGradeStore(s => s.getEntriesForStudent)


  const [activeScoreType, setActiveScoreType] = useState<DailyScoreType>('oral')
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  // P0.9 (audit desktop 2026-08-22): confirm cho xóa điểm & restore override
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

  const filteredStudents = useMemo(
    () => selectedClassId === 'all'
      ? students.filter(s => s.status === 'Đang học')
      : students.filter(s => s.classId === selectedClassId && s.status === 'Đang học'),
    [selectedClassId, students]
  )

  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester)
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess()

  const activeLabel = SCORE_TYPES.find(t => t.id === activeScoreType)?.label || ''

  const handleAddScore = (studentId: string) => {
    const raw = inputValues[studentId]
    if (!raw || raw.trim() === '') return
    const val = parseFloat(raw.replace(',', '.'))
    // P0.9: báo lỗi rõ ràng thay vì bỏ qua im lặng khi điểm invalid
    if (isNaN(val) || val < 0 || val > 10) {
      useToastStore.getState().addToast('Điểm không hợp lệ — chỉ nhận số từ 0 đến 10', 'error')
      return
    }
    addEntry(studentId, activeScoreType, val, selectedSemester)
    setInputValues(prev => ({ ...prev, [studentId]: '' }))
  }

  const handleRemoveEntry = async (entryId: string, studentName: string, value: number) => {
    const ok = await askConfirm({
      title: 'Xác Nhận Xóa Điểm',
      message: `Xóa điểm ${value} của ${studentName}? Hành động này không thể hoàn tác.`,
      confirmText: 'Xóa Điểm',
      variant: 'danger',
    })
    if (ok) removeEntry(entryId)
  }

  const handleRestoreAuto = async (studentId: string, studentName: string, avg: number, scoreType: DailyScoreType) => {
    const label = SCORE_TYPES.find(t => t.id === scoreType)?.label || scoreType
    const ok = await askConfirm({
      title: 'Khôi Phục Điểm Tự Động',
      message: `Ghi ĐTB ${label} (${avg}) vào cột điểm matrix của ${studentName}, thay thế điểm đang override thủ công?`,
      confirmText: 'Khôi Phục',
      variant: 'warning',
    })
    if (!ok) return
    useGradeStore.getState().upsertGrade({
      studentId,
      semester: selectedSemester,
      [SCORE_FIELD_MAP[scoreType]]: avg,
      [`${SCORE_FIELD_MAP[scoreType]}_source`]: 'daily_avg',
      [`${SCORE_FIELD_MAP[scoreType]}_updated_at`]: new Date().toISOString(),
    } as any)
  }

  const handleKeyDown = (e: React.KeyboardEvent, studentId: string) => {
    if (e.key === 'Enter') {
      handleAddScore(studentId)
    }
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
    <div className="product-view flex flex-col gap-6">
      {/* Header with Explicit Semester Selector */}
      <PageHeader
        icon={<Calculator size={20} />}
        title="Nhập Điểm Hằng Ngày"
        description={
          <span>
            Nhập nhiều lần cho mỗi cột điểm — Đang nhập cho <strong className="text-parish-primary font-bold">Học Kỳ {selectedSemester}</strong>
          </span>
        }
        actions={
          <div className="flex items-center gap-1.5 bg-surface-hover p-1.5 rounded-xl border border-surface-border">
            <span className="text-xs font-bold text-text-muted px-2 hidden sm:inline">Học Kỳ:</span>
            {semesterRestricted ? (
              <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-parish-primary text-white shadow-xs">
                Học Kỳ {openSemester === 2 ? 'II' : 'I'}
              </span>
            ) : (
              <>
                <button
                  onClick={() => setSelectedSemester(1)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedSemester === 1
                      ? 'bg-parish-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  Học Kỳ I
                </button>
                <button
                  onClick={() => setSelectedSemester(2)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedSemester === 2
                      ? 'bg-parish-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  Học Kỳ II
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Score Type Tabs */}
      <div className="view-tabs">
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

      {/* Scope note */}
      <p className="text-xs text-text-muted -mt-3">
        Điểm Giữa Kỳ & Cuối Kỳ là điểm duy nhất mỗi học kỳ — nhập trực tiếp qua Bảng Điểm (Ma Trận/Thẻ Điểm), không tính TB qua màn hình này.
      </p>

      {/* Stats Bar */}
      {stats && (
        <div className="app-panel p-4 grid grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">Tổng lượt nhập</div>
            <div className="text-xl font-black text-parish-primary">{stats.count}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">ĐTB cột</div>
            <div className="text-xl font-black text-parish-success">{stats.avg}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">Trung vị</div>
            <div className="text-xl font-black text-parish-warning">{stats.median}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">Cao nhất</div>
            <div className="text-xl font-black text-parish-info">{stats.max}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-text-muted">Thấp nhất</div>
            <div className="text-xl font-black text-parish-danger">{stats.min}</div>
          </div>
        </div>
      )}

      {/* Student List */}
      <div className="table-wrapper">
        <div className="table-scroll min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0">
            <colgroup>
              <col className="w-[320px]" />
              <col className="w-[120px]" />
              <col className="w-auto" />
              <col className="w-[80px]" />
              <col className="w-[220px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-3 px-4 sticky left-0 bg-surface-app z-10" scope="col">Tên Thiếu Nhi</th>
                <th className="py-3 px-4 text-center" scope="col">ĐTB {activeLabel}</th>
                <th className="py-3 px-4" scope="col">Các Lần Nhập ({activeScoreType})</th>
                <th className="py-3 px-4 text-center" scope="col">SL</th>
                <th className="py-3 px-4" scope="col">{canEdit ? 'Nhập điểm mới' : 'Xem chi tiết'}</th>
                <th className="py-3 px-4 text-center" scope="col"></th>
              </tr>
            </thead>
            <tbody className="bg-surface-card">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8">
                    <EmptyState
                      icon={Calculator}
                      title="Không có thiếu nhi nào trong bộ lọc"
                      description="Chọn lớp khác hoặc thêm học sinh để bắt đầu nhập điểm hằng ngày."
                    />
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const studentEntries = getEntriesForStudent(student.id, selectedSemester, activeScoreType)
                  const avg = getAverageForStudent(student.id, selectedSemester, activeScoreType)
                  const existingGrade = getStudentGrade(student.id, selectedSemester)
                  const cls = findClassById(student.classId)
                  const isExpanded = expandedStudent === student.id

                  return (
                    <React.Fragment key={student.id}>
                      <tr className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors">
                        <td className="py-3 px-4 sticky left-0 bg-surface-card z-10 shadow-xs">
                          <StudentName holyName={student.holyName} fullName={student.fullName} size="base" className="whitespace-nowrap" />
                          <div className="text-sm text-text-muted truncate">{cls?.name} • {student.code}</div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className={`text-base font-black ${avg !== null ? 'text-parish-primary' : 'text-text-placeholder'}`}>
                            {avg !== null ? avg : '—'}
                          </div>
                          {existingGrade && (
                            <div className="flex flex-col items-center gap-0.5 mt-0.5">
                              <span className="text-[10px] text-text-muted">
                                (Matrix: {(existingGrade as any)[SCORE_FIELD_MAP[activeScoreType]] ?? '—'})
                              </span>
                              {(existingGrade as any)[`${SCORE_FIELD_MAP[activeScoreType]}_source`] === 'manual' && (
                                <div className="flex flex-col items-center gap-1 mt-1">
                                  <span className="badge badge-warning text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-[var(--color-parish-warning)]/30">
                                    ✏️ Bị Override
                                  </span>
                                  {canEdit && avg !== null && (
                                    <button
                                      onClick={() => void handleRestoreAuto(student.id, `${student.holyName} ${student.fullName}`.trim(), avg, activeScoreType)}
                                      className="badge badge-info text-[10px] font-bold hover:underline px-1.5 py-0.5 rounded border border-[var(--color-parish-info)]/30"
                                      title="Khôi phục điểm tự động từ các bài kiểm tra hằng ngày"
                                    >
                                      🔄 Restore Auto
                                    </button>
                                  )}
                                </div>
                              )}
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
                                    e.value >= 8 ? 'badge-success' :
                                    e.value >= 5 ? 'badge-warning' :
                                    'badge-danger'
                                  }`}
                                  title={`${e.date}`}
                                >
                                  {e.value}
                                  {canEdit && (
                                    <button
                                      onClick={() => void handleRemoveEntry(e.id, `${student.holyName} ${student.fullName}`.trim(), e.value)}
                                      aria-label={`Xóa điểm ${e.value} của ${student.fullName}`}
                                      title="Xóa điểm này"
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
                                aria-label={`Nhập điểm ${activeLabel} cho ${student.holyName ? `${student.holyName} ` : ''}${student.fullName}`}
                                placeholder="0-10"
                                value={inputValues[student.id] || ''}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (v === '' || /^(?:10(?:\.0)?|[0-9](?:\.[05])?)$/.test(v.replace(',', '.')) || /^(?:10\.?|[0-9]\.)$/.test(v.replace(',', '.'))) {
                                    setInputValues(prev => ({ ...prev, [student.id]: v }));
                                  }
                                }}
                                onKeyDown={e => handleKeyDown(e, student.id)}
                                className="w-20 h-8 px-2 text-sm font-bold bg-surface-card text-text-main border border-surface-border rounded-lg focus:border-parish-primary outline-hidden text-center"
                              />
                              <button
                                onClick={() => handleAddScore(student.id)}
                                disabled={!inputValues[student.id]?.trim()}
                                aria-label={`Thêm điểm ${activeLabel} cho ${student.fullName}`}
                                title="Thêm điểm"
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
                            <div className="text-parish-success">
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

      {confirmDialog}

    </div>
  )
}

const SCORE_FIELD_MAP: Record<DailyScoreType, string> = {
  oral: 'scoreOral',
  '15m': 'score15m',
  '1period': 'score1Period',
}
