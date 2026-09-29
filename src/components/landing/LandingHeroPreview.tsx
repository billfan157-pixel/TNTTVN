import React, { useId, useRef, useState } from 'react'
import { Award, BookOpen, Building2, CalendarDays, Check, HeartHandshake, QrCode } from 'lucide-react'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { normalizeAcademicYear } from '../../utils/academicYear'

export type PreviewWorkspace = 'academic' | 'organization' | 'parent'

const WORKSPACES = [
  { id: 'academic', label: 'Học vụ', icon: BookOpen },
  { id: 'organization', label: 'Xứ đoàn', icon: Building2 },
  { id: 'parent', label: 'Phụ huynh', icon: HeartHandshake },
] as const

/** Shared illustrative content: real feel, interactive attendance and calendar feedback. */
export function LandingWorkspacePreview({ workspace }: { workspace: PreviewWorkspace }) {
  const currentYear = useAcademicYearStore(s => s.currentYear)
  const displayYear = (normalizeAcademicYear(currentYear) || '2025-2026').replace('-', '–')

  const [students, setStudents] = useState([
    { holy: 'Maria', name: 'Em A', status: 'Có mặt', score: '9.5' },
    { holy: 'Giuse', name: 'Em B', status: 'Có mặt', score: '8.8' },
    { holy: 'Anna', name: 'Em C', status: 'Có phép', score: '9.0' },
    { holy: 'Phêrô', name: 'Em D', status: 'Có mặt', score: '8.5' },
  ])
  const [activeDate, setActiveDate] = useState<number | null>(6)
  const [parentNoticeExpanded, setParentNoticeExpanded] = useState(false)

  const toggleStudent = (index: number) => {
    setStudents(prev => prev.map((s, i) => {
      if (i !== index) return s
      return {
        ...s,
        status: s.status === 'Có mặt' ? 'Có phép' : 'Có mặt',
      }
    }))
  }

  return (
    <div className={`landing-demo landing-demo--${workspace}`}>
      {workspace === 'academic' && (
        <>
          <div className="landing-demo__identity">
            <div>
              <span>Sổ lớp Giáo lý</span>
              <h4>Lớp Thiếu Nhi 1A — niên khóa {displayYear}</h4>
              <p>GLV Chủ Nhiệm: Huynh trưởng Têrêsa</p>
            </div>
            <span className="badge badge-primary">32 Thiếu Nhi</span>
          </div>
          <div className="landing-demo__metrics">
            <div><span>Chuyên cần Lễ</span><strong>97.8<small>%</small></strong><i aria-hidden="true" /></div>
            <div><span>Điểm TB Học Kỳ</span><strong>8.4<small> / 10</small></strong><i aria-hidden="true" /></div>
          </div>
          <div className="landing-demo__omr-badge flex items-center justify-between px-2.5 py-1.5 mb-2.5 rounded-lg bg-parish-primary-light/60 border border-parish-primary/15 text-xs text-parish-primary">
            <span className="inline-flex items-center gap-1.5 font-bold text-xs">
              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Chấm trắc nghiệm OMR qua Camera</span>
            </span>
            <span className="text-xs font-semibold text-text-muted bg-surface-card px-1.5 py-0.5 rounded border border-surface-border">
              Mã đề &middot; 50 câu
            </span>
          </div>
          <div className="landing-demo__roster">
            <div className="landing-demo__roster-heading"><span>Đoàn sinh minh họa</span><span>Chuyên cần</span><span>Điểm</span></div>
            {students.map((student, index) => (
              <button
                key={student.name}
                type="button"
                onClick={() => toggleStudent(index)}
                title="Nhấn để đổi trạng thái điểm danh minh họa"
                className="landing-demo__student w-full text-left bg-transparent hover:bg-surface-hover/60 rounded px-1 transition-colors cursor-pointer border-0"
              >
                <span><i aria-hidden="true">{student.name.slice(-1)}</i><span><strong>{student.holy} {student.name}</strong><small>Chi đoàn Thiếu 1</small></span></span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${student.status === 'Có mặt' ? 'text-parish-success bg-parish-success-bg' : 'text-parish-warning-hover bg-parish-warning-bg'}`}>
                  {student.status}
                </span>
                <strong>{student.score}</strong>
              </button>
            ))}
          </div>
        </>
      )}
      {workspace === 'organization' && (
        <>
          <div className="landing-demo__identity">
            <div>
              <span>Lịch & hoạt động</span>
              <h4>Xứ Đoàn Đức Mẹ Fatima</h4>
              <p>Giáo Xứ Gia Tôn · Ban Điều Hành</p>
            </div>
            <CalendarDays aria-hidden="true" />
          </div>
          <div className="landing-demo__calendar" aria-hidden="true">
            <div><span>THÁNG</span><strong>09</strong><small>Minh họa niên khóa</small></div>
            <div className="landing-demo__calendar-grid">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <small key={day}>{day}</small>)}
              {Array.from({ length: 21 }, (_, index) => {
                const isSunday = [6, 13, 20].includes(index)
                const isSelected = activeDate === index
                return (
                  <span
                    key={index}
                    onClick={() => setActiveDate(index)}
                    className={`${isSunday ? 'is-marked' : ''} ${isSelected ? 'ring-2 ring-parish-secondary' : ''} cursor-pointer transition-colors`}
                  >
                    {index + 1}
                  </span>
                )
              })}
            </div>
          </div>
          <div className="landing-demo__events">
            <div><span>07:00</span><div><strong>Thánh Lễ Bổn Mạng Xứ Đoàn</strong><p>Tại thánh đường · Lịch minh họa</p></div></div>
            <div><span>09:30</span><div><strong>Họp Ban Điều Hành & GLV tháng 9</strong><p>Phân công sinh hoạt và chương trình thi đua</p></div></div>
            <div><span>14:00</span><div><strong>Báo cáo tài chính & quỹ xứ đoàn</strong><p>Theo dõi công việc được giao</p></div></div>
          </div>
        </>
      )}
      {workspace === 'parent' && (
        <>
          <div className="landing-demo__parent-header"><HeartHandshake aria-hidden="true" /><span>Catevia · Gia đình</span></div>
          <div className="landing-demo__identity"><div><span>Đồng hành mỗi ngày</span><h4>Sổ liên lạc điện tử</h4><p>Con của bạn · Chi đoàn Thiếu 2</p></div></div>
          <div className="landing-demo__child"><span aria-hidden="true">A</span><div><strong>Đoàn sinh minh họa</strong><p><Check aria-hidden="true" />Đang theo học · {displayYear}</p></div></div>
          <div className="landing-demo__parent-result"><div><span>Chuyên cần Thánh lễ</span><strong>100<small>%</small></strong><p>Đầy đủ trong kỳ minh họa</p></div><div><span>Điểm trung bình Giáo lý</span><strong>8.8</strong><p>Xếp loại Giỏi</p></div></div>
          <div
            className="landing-demo__notice cursor-pointer rounded-lg p-2 hover:bg-surface-hover/60 transition-colors"
            onClick={() => setParentNoticeExpanded(!parentNoticeExpanded)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setParentNoticeExpanded(!parentNoticeExpanded)}
          >
            <span>Thông báo từ Xứ Đoàn</span>
            <strong>Chuẩn bị cho buổi học Chúa nhật</strong>
            <p>Giữ kết nối với Giáo Lý Viên của con.</p>
            {parentNoticeExpanded && (
              <p className="mt-2 text-xs text-parish-primary font-medium animate-in fade-in">
                Nhắc nhở: Chúa Nhật tuần này thiếu nhi mang theo sách Kinh Thánh và tập bài hát sinh hoạt.
              </p>
            )}
          </div>
          <div className="landing-demo__request"><span>Đơn xin phép nghỉ trực tuyến</span><strong>Gửi từ cổng phụ huynh</strong></div>
        </>
      )}
      <p className="landing-demo__footnote"><Award aria-hidden="true" />Số liệu demo, không phải dữ liệu thật</p>
    </div>
  )
}

export interface LandingHeroPreviewProps {
  externalActiveTab?: PreviewWorkspace
  onTabChange?: (tab: PreviewWorkspace) => void
}

export function LandingHeroPreview({ externalActiveTab, onTabChange }: LandingHeroPreviewProps = {}) {
  const [internalTab, setInternalTab] = useState<PreviewWorkspace>('academic')
  const activeTab = externalActiveTab ?? internalTab
  const id = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const select = (workspace: PreviewWorkspace) => {
    setInternalTab(workspace)
    onTabChange?.(workspace)
  }

  return (
    <div className="landing-preview-device" data-workspace={activeTab}>
      <div className="landing-workspace-tabs" role="tablist" aria-label="Không gian làm việc minh họa">
        {WORKSPACES.map((workspace, index) => {
          const Icon = workspace.icon
          return <button
            key={workspace.id}
            ref={element => { tabRefs.current[index] = element }}
            type="button"
            id={`${id}-${workspace.id}`}
            role="tab"
            tabIndex={activeTab === workspace.id ? 0 : -1}
            aria-selected={activeTab === workspace.id}
            aria-controls={`${id}-panel`}
            onClick={() => select(workspace.id)}
            onKeyDown={event => {
              const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              if (!offset && event.key !== 'Home' && event.key !== 'End') return
              event.preventDefault()
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + offset + 3) % 3
              tabRefs.current[next]?.focus({ preventScroll: true })
              select(WORKSPACES[next].id)
            }}
          ><Icon aria-hidden="true" />{workspace.label}</button>
        })}
      </div>
      <div className="landing-preview-shell">
        <div className="landing-preview-topbar"><span className="landing-preview-topbar__dots" aria-hidden="true"><i /><i /><i /></span><span>Catevia · Bản minh họa</span><span>Giao diện minh họa</span></div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${activeTab}`} tabIndex={0} className="landing-preview-panel">
          <LandingWorkspacePreview key={activeTab} workspace={activeTab} />
        </div>
      </div>
    </div>
  )
}
