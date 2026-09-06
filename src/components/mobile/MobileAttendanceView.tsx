import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BarChart2,
  CalendarClock,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Lock,
  MessageSquare,
  Save,
  Users,
  XCircle,
} from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useLeaveRequestStore } from '../../stores/leaveRequestStore'
import { useFilterStore } from '../../stores/filterStore'
import { getFilteredClassList, scopeClassesForAssignedWrites, useClassStore } from '../../stores/classStore'
import { useAuth } from '../../hooks/useAuth'
import { getDefaultDate } from '../../utils/getDefaultDate'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'
import { LITURGICAL_COLORS } from '../../constants/liturgical'
import { StudentName } from '../common/StudentName'
import { ModalPortal } from '../common/ModalPortal'
import { MobileLeaveRequests } from './MobileLeaveRequests'
import { MobileAttendanceSummaryView } from './MobileAttendanceSummaryView'
import type { AttendanceType, Student } from '../../types'
import { TabPanel, Tabs } from '../common/ui/SelectionControls'
import { hapticFeedback } from '../../utils/haptics'

type AttendanceStatus = 'Present' | 'AbsentExcused' | 'AbsentUnexcused'
type AttendanceDraft = { status: AttendanceStatus; note: string }
type AttendanceSubTab = 'attendance' | 'summary' | 'leave-requests'

const SESSION_LABELS: Record<AttendanceType, string> = {
  SundayMass: 'Thánh Lễ Chúa Nhật',
  CatechismClass: 'Giờ Giáo Lý',
  EucharisticAdoration: 'Chầu Thánh Thể',
}

const QUICK_NOTE_SUGGESTIONS = ['Bệnh', 'Về quê', 'Bận việc gia đình', 'Đi trễ', 'Có phép miệng', 'Thi cử']

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus
  shortLabel: string
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}> = [
  { value: 'Present', shortLabel: 'Có mặt', label: 'Có mặt', icon: CheckCircle2 },
  { value: 'AbsentExcused', shortLabel: 'Có phép', label: 'Vắng có phép', icon: AlertTriangle },
  { value: 'AbsentUnexcused', shortLabel: 'Vắng', label: 'Vắng không phép', icon: XCircle },
]

export const MobileAttendanceView: React.FC = () => {
  const { role, can } = useAuth()
  const canEditAttendance = can('admin', 'chunhiem', 'phuta')
  const students = useStudentStore(s => s.students)
  const attendance = useAttendanceStore(s => s.attendance)
  const batchSaveAttendance = useAttendanceStore(s => s.batchSaveAttendance)
  const isSubmitting = useAttendanceStore(s => s.isSubmitting)
  const error = useAttendanceStore(s => s.error)
  const lockError = useAttendanceStore(s => s.lockError)
  const clearErrors = useAttendanceStore(s => s.clearErrors)
  const pendingCount = useLeaveRequestStore(s => s.pendingCount)
  const fetchPendingCount = useLeaveRequestStore(s => s.fetchPendingCount)
  const rawClasses = useClassStore(s => s.classes)
  const classList = useMemo(() => getFilteredClassList(rawClasses), [rawClasses])
  const findClassById = useClassStore(s => s.findClassById)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const isLocked = !canEditAttendance || Boolean(lockError)

  const [activeSubTab, setActiveSubTab] = useState<AttendanceSubTab>('attendance')
  const [date, setDate] = useState<string>(getDefaultDate)
  const [type, setType] = useState<AttendanceType>('SundayMass')
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceDraft>>({})
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all')
  const [editingNoteStudent, setEditingNoteStudent] = useState<Student | null>(null)
  const [noteInputText, setNoteInputText] = useState<string>('')
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const needsAdminClassSelection = role === 'admin' && selectedClassId === 'all'

  const writableClassList = useMemo(
    () => scopeClassesForAssignedWrites(classList, role),
    [classList, role]
  )
  const writableClassIds = useMemo(
    () => new Set(writableClassList.map(classItem => classItem.id)),
    [writableClassList]
  )

  const filteredStudents = useMemo(
    () => selectedClassId === 'all'
      ? (role === 'admin' ? students : students.filter(student => writableClassIds.has(student.classId)))
      : students.filter(student => student.classId === selectedClassId && (role === 'admin' || writableClassIds.has(student.classId))),
    [role, selectedClassId, students, writableClassIds]
  )

  const displayedStudents = useMemo(() => {
    return filteredStudents.filter(student => {
      const draft = attendanceMap[student.id] || { status: 'Present', note: '' }
      if (statusFilter !== 'all' && draft.status !== statusFilter) return false
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim()
        const matchHoly = (student.holyName || '').toLowerCase().includes(q)
        const matchFull = (student.fullName || '').toLowerCase().includes(q)
        const matchCode = (student.code || '').toLowerCase().includes(q)
        if (!matchHoly && !matchFull && !matchCode) return false
      }
      return true
    })
  }, [filteredStudents, attendanceMap, statusFilter, searchQuery])

  const classStudentCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const student of students) counts.set(student.classId, (counts.get(student.classId) || 0) + 1)
    return counts
  }, [students])

  const attendanceIndex = useMemo(() => {
    const index = new Map<string, AttendanceDraft>()
    for (const record of attendance) {
      if (record.date !== date || record.type !== type) continue
      index.set(record.studentId, { status: record.status, note: record.note || '' })
    }
    return index
  }, [attendance, date, type])

  useEffect(() => {
    const nextMap: Record<string, AttendanceDraft> = {}
    for (const student of filteredStudents) {
      nextMap[student.id] = attendanceIndex.get(student.id) || { status: 'Present', note: '' }
    }
    setAttendanceMap(nextMap)
    setSaveMessage(null)
  }, [attendanceIndex, filteredStudents])

  useEffect(() => {
    void fetchPendingCount()
  }, [fetchPendingCount])

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
  }, [])

  const statusCounts = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      Present: 0,
      AbsentExcused: 0,
      AbsentUnexcused: 0,
    }
    for (const draft of Object.values(attendanceMap)) counts[draft.status]++
    return counts
  }, [attendanceMap])

  const unsavedCount = useMemo(() => filteredStudents.reduce((count, student) => {
    const draft = attendanceMap[student.id]
    const persisted = attendanceIndex.get(student.id)
    if (!draft || !persisted) return count + 1
    return count + (draft.status !== persisted.status || draft.note !== persisted.note ? 1 : 0)
  }, 0), [attendanceIndex, attendanceMap, filteredStudents])

  const liturgicalDay = useMemo(() => getLiturgicalDay(date), [date])
  const liturgicalColor = LITURGICAL_COLORS[liturgicalDay.color] || LITURGICAL_COLORS.GREEN

  const handleToggle = (studentId: string, status: AttendanceStatus) => {
    hapticFeedback.medium()
    setAttendanceMap(previous => ({
      ...previous,
      [studentId]: { ...previous[studentId], status },
    }))
    setSaveMessage(null)
    clearErrors()
  }

  const handleMarkAllPresent = () => {
    hapticFeedback.success()
    setAttendanceMap(previous => Object.fromEntries(
      Object.entries(previous).map(([studentId, draft]) => [studentId, { ...draft, status: 'Present' }])
    ))
    setSaveMessage(null)
    clearErrors()
  }

  const handleOpenNote = (student: Student) => {
    hapticFeedback.light()
    setEditingNoteStudent(student)
    setNoteInputText(attendanceMap[student.id]?.note || '')
  }

  const handleSaveNote = () => {
    if (!editingNoteStudent) return
    hapticFeedback.light()
    setAttendanceMap(previous => ({
      ...previous,
      [editingNoteStudent.id]: {
        ...previous[editingNoteStudent.id],
        note: noteInputText.trim()
      }
    }))
    setEditingNoteStudent(null)
  }

  const handleToggleStatusFilter = (status: AttendanceStatus) => {
    hapticFeedback.light()
    setStatusFilter(current => current === status ? 'all' : status)
  }

  const handleSave = async () => {
    if (isSubmitting || filteredStudents.length === 0 || unsavedCount === 0) return

    setSaveMessage(null)
    clearErrors()
    const records = Object.entries(attendanceMap).map(([studentId, draft]) => ({
      studentId,
      status: draft.status,
      note: draft.note,
    }))
    const result = await batchSaveAttendance(records, date, type)
    if (!result) {
      hapticFeedback.error()
      return
    }

    const unresolvedCount = result.errorCount + result.conflictCount
    if (unresolvedCount > 0) {
      hapticFeedback.warning()
    } else {
      hapticFeedback.success()
    }
    setSaveMessage(unresolvedCount > 0
      ? `Đã lưu ${result.successCount}/${result.total}. Còn ${unresolvedCount} mục cần kiểm tra.`
      : result.acknowledgement === 'durable_queue'
        ? `Đã lưu trên thiết bị cho ${result.successCount} thiếu nhi, chờ đồng bộ máy chủ.`
        : `Đã lưu điểm danh cho ${result.successCount} thiếu nhi.`)

    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = setTimeout(() => setSaveMessage(null), 5000)
  }

  const renderAttendanceWorkspace = () => (
    <>
      <section className="attendance-session-panel" aria-labelledby="attendance-session-title">
        <div className="attendance-session-panel__heading">
          <div>
            <p className="attendance-eyebrow">Phiên điểm danh</p>
            <div className="flex items-center gap-2">
              <h2 id="attendance-session-title">{SESSION_LABELS[type]}</h2>
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  <Lock size={12} /> {lockError ? 'Khóa sổ' : 'Chỉ xem'}
                </span>
              )}
            </div>
            <div className={`attendance-session-context ${liturgicalColor.textClass}`}>
              <span className="attendance-liturgical-dot" style={{ backgroundColor: liturgicalColor.hex }} aria-hidden="true" />
              <span className="truncate">{liturgicalDay.title}</span>
              <span aria-hidden="true">·</span>
              <strong>{liturgicalDay.colorName}</strong>
            </div>
          </div>
          {!needsAdminClassSelection && (
            <span className="attendance-total-badge tabular-nums">
              <Users size={14} aria-hidden="true" /> {filteredStudents.length} em
            </span>
          )}
        </div>

        <div className="attendance-session-grid">
          <label className="attendance-field">
            <span><CalendarClock size={13} aria-hidden="true" /> Ngày</span>
            <input
              type="date"
              value={date}
              onChange={event => setDate(event.target.value)}
              className="form-input"
            />
          </label>

          <label className="attendance-field">
            <span><Clock3 size={13} aria-hidden="true" /> Buổi sinh hoạt</span>
            <select
              value={type}
              onChange={event => setType(event.target.value as AttendanceType)}
              className="form-select"
            >
              <option value="SundayMass">Lễ CN</option>
              <option value="CatechismClass">Giáo lý</option>
              <option value="EucharisticAdoration">Chầu TT</option>
            </select>
          </label>

          {role === 'admin' && (
            <label className="attendance-field attendance-field--class">
              <span><Users size={13} aria-hidden="true" /> Lớp điểm danh</span>
              <select
                value={selectedClassId}
                onChange={event => setSelectedClassId(event.target.value)}
                className="form-select"
              >
                <option value="all">Chọn một lớp</option>
                {classList.map(classItem => (
                  <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!needsAdminClassSelection && (
          <div className="attendance-status-summary" aria-label="Tổng hợp trạng thái hiện tại">
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('Present')}
              className={`attendance-summary-item attendance-summary-item--present ${statusFilter === 'Present' ? 'is-selected' : ''}`}
              aria-label={`Lọc có mặt: ${statusCounts.Present} em`}
              aria-pressed={statusFilter === 'Present'}
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Có mặt</span>
              <strong>{statusCounts.Present}</strong>
            </button>
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('AbsentExcused')}
              className={`attendance-summary-item attendance-summary-item--excused ${statusFilter === 'AbsentExcused' ? 'is-selected' : ''}`}
              aria-label={`Lọc có phép: ${statusCounts.AbsentExcused} em`}
              aria-pressed={statusFilter === 'AbsentExcused'}
            >
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Có phép</span>
              <strong>{statusCounts.AbsentExcused}</strong>
            </button>
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('AbsentUnexcused')}
              className={`attendance-summary-item attendance-summary-item--absent ${statusFilter === 'AbsentUnexcused' ? 'is-selected' : ''}`}
              aria-label={`Lọc vắng không phép: ${statusCounts.AbsentUnexcused} em`}
              aria-pressed={statusFilter === 'AbsentUnexcused'}
            >
              <XCircle size={15} aria-hidden="true" />
              <span>Vắng</span>
              <strong>{statusCounts.AbsentUnexcused}</strong>
            </button>
          </div>
        )}
      </section>

      {(error || lockError) && (
        <div className="attendance-feedback attendance-feedback--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{lockError || error}</span>
        </div>
      )}

      {saveMessage && (
        <div className="attendance-feedback attendance-feedback--success" role="status" aria-live="polite">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{saveMessage}</span>
        </div>
      )}

      {needsAdminClassSelection ? (
        <section className="attendance-class-picker" aria-labelledby="attendance-class-picker-title">
          <div className="attendance-class-picker__heading">
            <div>
              <p className="attendance-eyebrow">Bắt đầu nhanh</p>
              <h2 id="attendance-class-picker-title">Chọn lớp cần điểm danh</h2>
            </div>
            <span>{classList.length} lớp</span>
          </div>
          <p className="attendance-class-picker__hint">
            Mỗi phiên được lưu theo một lớp để dễ kiểm tra và tránh ghi nhầm toàn xứ đoàn.
          </p>
          <div className="attendance-class-grid">
            {classList.map(classItem => (
              <button
                type="button"
                key={classItem.id}
                className="attendance-class-option"
                onClick={() => setSelectedClassId(classItem.id)}
                aria-label={`Chọn lớp ${classItem.name}, ${classStudentCounts.get(classItem.id) || 0} thiếu nhi`}
              >
                <span className="attendance-class-option__mark">{classItem.name.slice(0, 2).toUpperCase()}</span>
                <span className="attendance-class-option__copy">
                  <strong>{classItem.name}</strong>
                  <span>{classStudentCounts.get(classItem.id) || 0} thiếu nhi</span>
                </span>
                <span className="attendance-class-option__arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="attendance-roster-section" aria-labelledby="attendance-roster-title">
          <div className="attendance-roster-toolbar">
            <div>
              <p className="attendance-eyebrow">Danh sách lớp</p>
              <h2 id="attendance-roster-title">Ghi nhận chuyên cần</h2>
            </div>
            <button
              type="button"
              onClick={handleMarkAllPresent}
              disabled={isLocked}
              className={`btn btn-secondary attendance-mark-all ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Check size={15} aria-hidden="true" /> Có mặt tất cả
            </button>
          </div>

          {/* Quick Search & Filter Bar */}
          <div className="px-3.5 pb-2.5 flex flex-col gap-2">
            <div className="relative">
              <input
                type="search"
                inputMode="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm tên hoặc mã thiếu nhi..."
                className="form-input text-xs font-medium w-full min-h-[44px] rounded-xl pr-8"
                style={{ paddingLeft: '36px' }}
                aria-label="Tìm thiếu nhi trong lớp"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
                <Users size={14} />
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-1 rounded-full text-xs font-bold"
                  aria-label="Xóa tìm kiếm"
                >
                  ✕
                </button>
              )}
            </div>

            {statusFilter !== 'all' && (
              <div className="flex items-center justify-between text-xs bg-surface-hover px-2.5 py-1.5 rounded-lg">
                <span className="font-semibold text-text-secondary">
                  Đang lọc: <strong>{statusFilter === 'Present' ? 'Có mặt' : statusFilter === 'AbsentExcused' ? 'Có phép' : 'Vắng'}</strong> ({displayedStudents.length}/{filteredStudents.length})
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="text-parish-primary font-bold hover:underline text-xs"
                >
                  Xem tất cả
                </button>
              </div>
            )}
          </div>

          <div className="attendance-status-legend" aria-label="Chú giải trạng thái">
            {STATUS_OPTIONS.map(option => {
              const Icon = option.icon
              return (
                <span key={option.value} className={`attendance-legend-item attendance-legend-item--${option.value}`}>
                  <Icon size={13} aria-hidden="true" /> {option.label}
                </span>
              )
            })}
          </div>

          {filteredStudents.length === 0 ? (
            <div className="state-feedback state-feedback--empty attendance-empty-state">
              <Users size={24} aria-hidden="true" />
              <strong>Chưa có thiếu nhi trong lớp này</strong>
              <span>Hãy kiểm tra lại lớp đang chọn hoặc dữ liệu danh sách.</span>
            </div>
          ) : displayedStudents.length === 0 ? (
            <div className="state-feedback state-feedback--empty attendance-empty-state">
              <Users size={24} aria-hidden="true" />
              <strong>Không tìm thấy thiếu nhi phù hợp</strong>
              <span>Hãy thử đổi từ khóa tìm kiếm hoặc bỏ lọc trạng thái.</span>
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                className="btn btn-secondary btn-sm mt-2"
              >
                Đặt lại bộ lọc
              </button>
            </div>
          ) : (
            <ol className="attendance-roster" aria-label={`Danh sách điểm danh gồm ${displayedStudents.length} thiếu nhi`}>
              {displayedStudents.map((student, index) => {
                const item = attendanceMap[student.id] || { status: 'Present', note: '' }
                const isOnlineLeave = item.status === 'AbsentExcused' && item.note.includes('[Đơn')
                return (
                  <li key={student.id} className={`attendance-roster-row attendance-roster-row--${item.status}`}>
                    <span className="attendance-roster-row__index tabular-nums" aria-hidden="true">{index + 1}</span>
                    <div className="attendance-roster-row__identity">
                      <StudentName holyName={student.holyName} fullName={student.fullName} layout="stacked" size="sm" />
                      <div className="attendance-roster-row__meta">
                        <span>{student.code}</span>
                        <span aria-hidden="true">•</span>
                        <span className="truncate">{findClassById(student.classId)?.name || '—'}</span>
                        {isOnlineLeave ? (
                          <button
                            type="button"
                            onClick={() => handleOpenNote(student)}
                            className="attendance-online-leave text-left cursor-pointer"
                            title={item.note}
                          >
                            Phép online
                          </button>
                        ) : item.note ? (
                          <button
                            type="button"
                            onClick={() => handleOpenNote(student)}
                            className="attendance-note-badge"
                            title={`Ghi chú: ${item.note}`}
                          >
                            <MessageSquare size={10} aria-hidden="true" />
                            <span className="truncate max-w-[120px]">{item.note}</span>
                          </button>
                        ) : (
                          item.status !== 'Present' && (
                            <button
                              type="button"
                              onClick={() => handleOpenNote(student)}
                              className="text-xs text-text-muted hover:text-parish-primary flex items-center gap-0.5 font-semibold py-0.5"
                            >
                              + Ghi chú
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    <div className="attendance-status-control" role="group" aria-label={`Trạng thái của ${student.holyName} ${student.fullName}`}>
                      {STATUS_OPTIONS.map(option => {
                        const Icon = option.icon
                        const isActive = item.status === option.value
                        return (
                          <button
                            type="button"
                            key={option.value}
                            onClick={() => handleToggle(student.id, option.value)}
                            disabled={isLocked}
                            className={`attendance-status-button attendance-status-button--${option.value} ${isActive ? 'is-active' : ''} ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                            aria-label={`${option.label}: ${student.holyName} ${student.fullName}`}
                            aria-pressed={isActive}
                            title={isLocked ? `${option.label} (Không thể chỉnh sửa)` : option.label}
                          >
                            <Icon size={17} strokeWidth={2.25} aria-hidden="true" />
                            <span>{option.shortLabel}</span>
                          </button>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      )}

      {!needsAdminClassSelection && (
        <div className="mobile-bottom-action-bar attendance-save-bar">
          <div className="mobile-bottom-action-bar__inner attendance-save-bar__inner">
            <div className="attendance-save-bar__status" aria-live="polite">
              <span className={unsavedCount > 0 ? 'is-pending' : 'is-saved'} aria-hidden="true" />
              <span>
                <strong>{unsavedCount > 0 ? `${unsavedCount} chưa lưu` : 'Đã cập nhật'}</strong>
                <small>{SESSION_LABELS[type]}</small>
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSubmitting || filteredStudents.length === 0 || unsavedCount === 0 || isLocked}
              className="btn btn-primary attendance-save-button"
            >
              {isSubmitting ? (
                <><span className="attendance-save-spinner" aria-hidden="true" /> Đang lưu</>
              ) : (
                <><Save size={17} aria-hidden="true" /> Lưu điểm danh</>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className={`mobile-screen mobile-screen--stack product-view ${activeSubTab === 'attendance' && !needsAdminClassSelection ? 'mobile-screen--stack--with-action-bar' : ''}`}>
      <Tabs
        id="mobile-attendance-tabs"
        ariaLabel="Chức năng điểm danh"
        items={[
          { value: 'attendance', label: 'Điểm Danh', icon: <CheckSquare aria-hidden="true" size={14} /> },
          { value: 'summary', label: 'Tổng Hợp', icon: <BarChart2 aria-hidden="true" size={14} /> },
          {
            value: 'leave-requests',
            icon: <CalendarClock aria-hidden="true" size={14} />,
            label: (
              <>
                <span>Đơn Xin Nghỉ</span>
                {pendingCount > 0 && (
                  <span className={`attendance-pending-badge ${activeSubTab === 'leave-requests' ? 'is-active' : ''}`}>
                    {pendingCount}
                  </span>
                )}
              </>
            ),
            ariaLabel: `Đơn xin nghỉ${pendingCount > 0 ? `, ${pendingCount} đơn chờ duyệt` : ''}`,
          },
        ] as const}
        value={activeSubTab}
        onValueChange={setActiveSubTab}
      />

      <TabPanel tabsId="mobile-attendance-tabs" value="attendance" activeValue={activeSubTab}>
        {renderAttendanceWorkspace()}
      </TabPanel>
      <TabPanel tabsId="mobile-attendance-tabs" value="summary" activeValue={activeSubTab}>
        <MobileAttendanceSummaryView />
      </TabPanel>
      <TabPanel tabsId="mobile-attendance-tabs" value="leave-requests" activeValue={activeSubTab}>
        <MobileLeaveRequests />
      </TabPanel>

      {/* Note Modal / Bottom Sheet */}
      {editingNoteStudent && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-dialog-title"
            onClick={() => setEditingNoteStudent(null)}
          >
            <div
              className="w-full max-w-md bg-surface-card border-t sm:border border-surface-border rounded-t-2xl sm:rounded-2xl p-4 shadow-xl space-y-3 animate-in slide-in-from-bottom-4 duration-200"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-text-muted">Ghi chú chuyên cần</p>
                  <h3 id="note-dialog-title" className="text-sm font-extrabold text-text-main mt-0.5">
                    <StudentName holyName={editingNoteStudent.holyName} fullName={editingNoteStudent.fullName} size="sm" />
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingNoteStudent(null)}
                  className="p-1.5 rounded-full text-text-muted hover:text-text-main"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>

              {/* Quick suggestions */}
              <div>
                <span className="text-xs font-semibold text-text-muted block mb-1.5">Lý do nhanh:</span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_NOTE_SUGGESTIONS.map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setNoteInputText(sug)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${noteInputText === sug ? 'bg-parish-primary text-white border-parish-primary' : 'bg-surface-hover border-surface-border text-text-secondary hover:text-text-main'}`}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="note-input" className="text-xs font-semibold text-text-muted block mb-1">
                  Nội dung ghi chú:
                </label>
                <input
                  id="note-input"
                  type="text"
                  value={noteInputText}
                  onChange={e => setNoteInputText(e.target.value)}
                  placeholder="Nhập lý do vắng / phép / ghi chú..."
                  className="form-input w-full min-h-[44px] text-sm rounded-xl"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setNoteInputText('')
                    if (editingNoteStudent) {
                      setAttendanceMap(prev => ({
                        ...prev,
                        [editingNoteStudent.id]: { ...prev[editingNoteStudent.id], note: '' }
                      }))
                    }
                    setEditingNoteStudent(null)
                  }}
                  className="btn btn-secondary flex-1 min-h-[44px] text-xs font-bold"
                >
                  Xóa ghi chú
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="btn btn-primary flex-1 min-h-[44px] text-xs font-bold shadow-xs"
                >
                  Lưu ghi chú
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
