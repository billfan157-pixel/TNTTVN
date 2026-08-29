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
  Save,
  Users,
  XCircle,
} from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useLeaveRequestStore } from '../../stores/leaveRequestStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAuth } from '../../hooks/useAuth'
import { getDefaultDate } from '../../utils/getDefaultDate'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'
import { LITURGICAL_COLORS } from '../../constants/liturgical'
import { StudentName } from '../common/StudentName'
import { MobileLeaveRequests } from './MobileLeaveRequests'
import { MobileAttendanceSummaryView } from './MobileAttendanceSummaryView'
import type { AttendanceType } from '../../types'

type AttendanceStatus = 'Present' | 'AbsentExcused' | 'AbsentUnexcused'
type AttendanceDraft = { status: AttendanceStatus; note: string }
type AttendanceSubTab = 'attendance' | 'summary' | 'leave-requests'

const SESSION_LABELS: Record<AttendanceType, string> = {
  SundayMass: 'Thánh Lễ Chúa Nhật',
  CatechismClass: 'Giờ Giáo Lý',
  EucharisticAdoration: 'Chầu Thánh Thể',
}

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
  const { role } = useAuth()
  const students = useStudentStore(s => s.students)
  const attendance = useAttendanceStore(s => s.attendance)
  const batchSaveAttendance = useAttendanceStore(s => s.batchSaveAttendance)
  const isSubmitting = useAttendanceStore(s => s.isSubmitting)
  const error = useAttendanceStore(s => s.error)
  const lockError = useAttendanceStore(s => s.lockError)
  const clearErrors = useAttendanceStore(s => s.clearErrors)
  const pendingCount = useLeaveRequestStore(s => s.pendingCount)
  const fetchPendingCount = useLeaveRequestStore(s => s.fetchPendingCount)
  const classList = useClassStore(s => s.getClassList)()
  const findClassById = useClassStore(s => s.findClassById)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const [activeSubTab, setActiveSubTab] = useState<AttendanceSubTab>('attendance')
  const [date, setDate] = useState<string>(getDefaultDate)
  const [type, setType] = useState<AttendanceType>('SundayMass')
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceDraft>>({})
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const needsAdminClassSelection = role === 'admin' && selectedClassId === 'all'

  const filteredStudents = useMemo(
    () => selectedClassId === 'all' ? students : students.filter(student => student.classId === selectedClassId),
    [selectedClassId, students]
  )

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
    clearErrors()
  }, [attendanceIndex, clearErrors, filteredStudents])

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
    setAttendanceMap(previous => ({
      ...previous,
      [studentId]: { ...previous[studentId], status },
    }))
    setSaveMessage(null)
    clearErrors()
  }

  const handleMarkAllPresent = () => {
    setAttendanceMap(previous => Object.fromEntries(
      Object.entries(previous).map(([studentId, draft]) => [studentId, { ...draft, status: 'Present' }])
    ))
    setSaveMessage(null)
    clearErrors()
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
    if (!result) return

    const unresolvedCount = result.errorCount + result.conflictCount
    setSaveMessage(unresolvedCount > 0
      ? `Đã lưu ${result.successCount}/${result.total}. Còn ${unresolvedCount} mục cần kiểm tra.`
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
            <h2 id="attendance-session-title">{SESSION_LABELS[type]}</h2>
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
            <div className="attendance-summary-item attendance-summary-item--present">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Có mặt</span>
              <strong>{statusCounts.Present}</strong>
            </div>
            <div className="attendance-summary-item attendance-summary-item--excused">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Có phép</span>
              <strong>{statusCounts.AbsentExcused}</strong>
            </div>
            <div className="attendance-summary-item attendance-summary-item--absent">
              <XCircle size={15} aria-hidden="true" />
              <span>Vắng</span>
              <strong>{statusCounts.AbsentUnexcused}</strong>
            </div>
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
            <button type="button" onClick={handleMarkAllPresent} className="btn btn-secondary attendance-mark-all">
              <Check size={15} aria-hidden="true" /> Có mặt tất cả
            </button>
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
          ) : (
            <ol className="attendance-roster" aria-label={`Danh sách điểm danh gồm ${filteredStudents.length} thiếu nhi`}>
              {filteredStudents.map((student, index) => {
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
                        {isOnlineLeave && <span className="attendance-online-leave">Phép online</span>}
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
                            className={`attendance-status-button attendance-status-button--${option.value} ${isActive ? 'is-active' : ''}`}
                            aria-label={`${option.label}: ${student.holyName} ${student.fullName}`}
                            aria-pressed={isActive}
                            title={option.label}
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
              disabled={isSubmitting || filteredStudents.length === 0 || unsavedCount === 0}
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
      <div className="view-tabs" role="tablist" aria-label="Chức năng điểm danh">
        <button
          type="button"
          onClick={() => setActiveSubTab('attendance')}
          className={`view-tab ${activeSubTab === 'attendance' ? 'is-active' : ''}`}
          role="tab"
          id="attendance-tab"
          aria-controls="attendance-panel"
          aria-selected={activeSubTab === 'attendance'}
        >
          <CheckSquare size={14} aria-hidden="true" />
          <span>Điểm Danh</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('summary')}
          className={`view-tab ${activeSubTab === 'summary' ? 'is-active' : ''}`}
          role="tab"
          id="attendance-summary-tab"
          aria-controls="attendance-summary-panel"
          aria-selected={activeSubTab === 'summary'}
        >
          <BarChart2 size={14} aria-hidden="true" />
          <span>Tổng Hợp</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('leave-requests')}
          className={`view-tab relative ${activeSubTab === 'leave-requests' ? 'is-active' : ''}`}
          role="tab"
          id="attendance-leave-tab"
          aria-controls="attendance-leave-panel"
          aria-selected={activeSubTab === 'leave-requests'}
        >
          <CalendarClock size={14} aria-hidden="true" />
          <span>Đơn Xin Nghỉ</span>
          {pendingCount > 0 && (
            <span className={`attendance-pending-badge ${activeSubTab === 'leave-requests' ? 'is-active' : ''}`} aria-label={`${pendingCount} đơn chờ duyệt`}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      <div
        id={activeSubTab === 'attendance' ? 'attendance-panel' : activeSubTab === 'summary' ? 'attendance-summary-panel' : 'attendance-leave-panel'}
        role="tabpanel"
        aria-labelledby={activeSubTab === 'attendance' ? 'attendance-tab' : activeSubTab === 'summary' ? 'attendance-summary-tab' : 'attendance-leave-tab'}
      >
        {activeSubTab === 'leave-requests'
          ? <MobileLeaveRequests />
          : activeSubTab === 'summary'
            ? <MobileAttendanceSummaryView />
            : renderAttendanceWorkspace()}
      </div>
    </div>
  )
}
