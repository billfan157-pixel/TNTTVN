import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore, getCurrentAcademicYear } from '../../stores/gradeStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import type { DailyScoreType } from '../../types'
import {
  Calculator, Plus, Trash2,
  CheckCircle2, BarChart3
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { useToastStore } from '../../stores/toastStore'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { StudentName } from '../common/StudentName'
import { EmptyState } from '../common/StateFeedback'
import { hapticFeedback } from '../../utils/haptics'

const SCORE_TYPES: { id: DailyScoreType; label: string; color: string }[] = [
  { id: 'oral', label: 'Điểm Miệng', color: 'bg-[var(--color-parish-info)]' },
  { id: '15m', label: 'Điểm 15 Phút', color: 'bg-[var(--color-parish-success)]' },
  { id: '1period', label: 'Điểm 1 Tiết', color: 'bg-[var(--color-parish-warning)]' },
]

export const DesktopDailyGradeEntry: React.FC = () => {
  const savingEntries = useRef(new Set<string>())
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
  const getMachineEntries = useDailyGradeStore(s => s.getMachineEntries)
  const fetchDailyEntries = useDailyGradeStore(s => s.fetchDailyEntries)
  const currentYear = useAcademicYearStore(s => s.currentYear)
  const academicYear = currentYear && currentYear.trim() !== '' ? currentYear : getCurrentAcademicYear()

  // Tier 2: kéo attempts server (gồm bài thi máy) khi xem 1 lớp — read-only,
  // có nhãn rõ. Chế độ 'all' không fetch (tránh N+1 theo lớp).
  useEffect(() => {
    if (selectedClassId && selectedClassId !== 'all') {
      void fetchDailyEntries({ classId: selectedClassId, semester: selectedSemester, academicYear })
    }
  }, [selectedClassId, selectedSemester, academicYear, fetchDailyEntries])

  const [activeScoreType, setActiveScoreType] = useState<DailyScoreType>('oral')
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [srAnnouncement, setSrAnnouncement] = useState<string>('')
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

  const focusDailyRow = (rowIdx: number): boolean => {
    if (rowIdx < 0 || rowIdx >= filteredStudents.length) return false
    const target = document.querySelector<HTMLInputElement>(
      `input[data-daily-row="${rowIdx}"]`
    )
    if (target && !target.disabled) {
      target.focus()
      target.select()
      return true
    }
    return false
  }

  const handleAddScore = async (studentId: string, rowIdx?: number) => {
    if (savingEntries.current.has(studentId)) return
    const raw = inputValues[studentId]
    if (!raw || raw.trim() === '') return
    const val = parseFloat(raw.replace(',', '.'))
    if (isNaN(val) || val < 0 || val > 10) {
      hapticFeedback.error()
      useToastStore.getState().addToast('Điểm không hợp lệ — chỉ nhận số từ 0 đến 10', 'error')
      return
    }
    const clamped = Math.round(val * 10) / 10
    savingEntries.current.add(studentId)
    try {
      await addEntry(studentId, activeScoreType, clamped, selectedSemester)
      hapticFeedback.medium()
      setInputValues(prev => ({ ...prev, [studentId]: '' }))

      const student = filteredStudents.find(s => s.id === studentId)
      if (student) {
        setSrAnnouncement(`Đã thêm điểm ${activeLabel} ${clamped} cho ${student.fullName}`)
      }

      if (rowIdx !== undefined) {
        focusDailyRow(rowIdx + 1)
      }
    } catch {
      useToastStore.getState().addToast('Chưa lưu được điểm trên thiết bị. Hãy thử lại.', 'error')
    } finally { savingEntries.current.delete(studentId) }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, studentId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const raw = inputValues[studentId]?.trim()
      if (raw) {
        handleAddScore(studentId, rowIdx)
      } else {
        focusDailyRow(rowIdx + 1)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusDailyRow(rowIdx + 1)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusDailyRow(rowIdx - 1)
      return
    }
  }

  const handleRemoveEntry = async (entryId: string, studentName: string, value: number) => {
    hapticFeedback.warning()
    const ok = await askConfirm({
      title: 'Xác Nhận Xóa Điểm',
      message: `Xóa điểm ${value} của ${studentName}? Hành động này không thể hoàn tác.`,
      confirmText: 'Xóa Điểm',
      variant: 'danger',
    })
    if (ok) {
      try {
        await removeEntry(entryId)
        hapticFeedback.light()
        setSrAnnouncement(`Đã xóa điểm ${value} của ${studentName}`)
      } catch {
        useToastStore.getState().addToast('Chưa lưu được thao tác xóa điểm. Hãy thử lại.', 'error')
      }
    }
  }

  const handleRestoreAuto = async (studentId: string, studentName: string, avg: number, scoreType: DailyScoreType) => {
    const label = SCORE_TYPES.find(t => t.id === scoreType)?.label || scoreType
    hapticFeedback.warning()
    const ok = await askConfirm({
      title: 'Khôi Phục Điểm Tự Động',
      message: `Ghi ĐTB ${label} (${avg}) vào cột điểm matrix của ${studentName}, thay thế điểm đang override thủ công?`,
      confirmText: 'Khôi Phục',
      variant: 'warning',
    })
    if (!ok) return
    try {
      await useGradeStore.getState().upsertGrade({
        studentId,
        semester: selectedSemester,
        [SCORE_FIELD_MAP[scoreType]]: avg,
        [`${SCORE_FIELD_MAP[scoreType]}_source`]: 'daily_avg',
        [`${SCORE_FIELD_MAP[scoreType]}_updated_at`]: new Date().toISOString(),
      } as any)
      hapticFeedback.success()
      setSrAnnouncement(`Đã khôi phục điểm tự động cho ${studentName}`)
    } catch {
      hapticFeedback.error()
      setSrAnnouncement(`Không thể lưu điểm tự động cho ${studentName}. Vui lòng thử lại.`)
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
    <div className="product-view flex flex-col gap-3 sm:gap-3.5">
      {/* Hidden Live Announcer for Screen Readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      {/* Subtab Header Strip with Explicit Semester Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-1.5 rounded-xl border border-surface-border bg-surface-card shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <Calculator size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text-primary truncate">
              Nhập Điểm Hằng Ngày
            </h2>
            <p className="text-xs text-text-muted truncate hidden xl:block">
              <span>
                Nhập nhiều lần theo cột điểm — Đang nhập cho <strong className="text-parish-primary font-bold">Học Kỳ {selectedSemester}</strong>
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-surface-hover p-1 rounded-xl border border-surface-border">
          <span className="text-xs font-bold text-text-muted px-2 hidden sm:inline">Học Kỳ:</span>
          {semesterRestricted ? (
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-parish-primary text-white shadow-xs">
              Học Kỳ {openSemester === 2 ? 'II' : 'I'}
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setSelectedSemester(1); hapticFeedback.light(); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedSemester === 1
                    ? 'bg-parish-primary text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                Học Kỳ I
              </button>
              <button
                type="button"
                onClick={() => { setSelectedSemester(2); hapticFeedback.light(); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
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
      </div>

      {/* Score Type Tabs */}
      <div className="view-tabs">
        {SCORE_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveScoreType(t.id); hapticFeedback.light(); }}
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
                filteredStudents.map((student, idx) => {
                  const studentEntries = getEntriesForStudent(student.id, selectedSemester, activeScoreType)
                  // Tier 2: bài thi máy cùng cột — read-only, nhãn rõ, không nút xóa/sửa.
                  const machineEntries = getMachineEntries(student.id, selectedSemester, activeScoreType)
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
                                className="text-xs text-parish-primary font-semibold hover:underline"
                              >
                                +{studentEntries.length - 3} cũ hơn
                              </button>
                            )}
                            {isExpanded && (
                              <button
                                onClick={() => setExpandedStudent(null)}
                                className="text-xs text-text-muted font-semibold hover:underline"
                              >
                                Thu gọn
                              </button>
                            )}
                          </div>
                          {machineEntries.length > 0 && (
                            <div aria-label={`Bài thi máy của ${student.fullName}`} className="mt-1.5 border-t border-dashed border-surface-border pt-1.5">
                              <span className="text-xs font-bold uppercase tracking-wide text-text-muted">
                                Bài thi máy · chỉ xem (tính vào trung bình)
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {machineEntries.map(m => (
                                  <span
                                    key={m.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold badge-info"
                                    title={`${m.date ?? 'Không rõ ngày'} · máy chấm, không xóa/sửa tại đây`}
                                  >
                                    {m.value}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
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
                                data-daily-row={idx}
                                aria-label={`Nhập điểm ${activeLabel} cho ${student.holyName ? `${student.holyName} ` : ''}${student.fullName}`}
                                placeholder="0-10"
                                value={inputValues[student.id] || ''}
                                onFocus={e => e.currentTarget.select()}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (v === '' || /^(?:10(?:.0)?|[0-9](?:.[05])?)$/.test(v.replace(',', '.')) || /^(?:10.?|[0-9].)$/.test(v.replace(',', '.'))) {
                                    setInputValues(prev => ({ ...prev, [student.id]: v }));
                                  }
                                }}
                                onKeyDown={e => handleKeyDown(e, idx, student.id)}
                                className="w-20 h-8 px-2 text-sm font-bold bg-surface-card text-text-main border border-surface-border rounded-lg focus:border-parish-primary outline-hidden text-center"
                              />
                              <button
                                onClick={() => handleAddScore(student.id, idx)}
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
