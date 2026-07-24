import { DesktopStudentList } from '../components/desktop/DesktopStudentList'
import { MobileStudentsView } from '../components/mobile/MobileStudentsView'
import { PromotionPanel } from '../components/desktop/PromotionPanel'
import { useUIStore } from '../stores/uiStore'
import { useStudentStore } from '../stores/studentStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { MOCK_CLASSES } from '../data/mockParishData'
import { useState, useCallback } from 'react'
import { TrendingUp, Users, Send } from 'lucide-react'

export function StudentsPage() {
  const effectiveMode = useEffectiveMode()
  const { openAddStudent, openEditStudent, openReport, openPhotoCard, openCertificate } = useUIStore()
  const [showPromotions, setShowPromotions] = useState(false)
  const [sendingCards, setSendingCards] = useState(false)
  const students = useStudentStore(s => s.students)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const getStudentAttendanceRate = useAttendanceStore(s => s.getStudentAttendanceRate)

  const handleSendReportCards = useCallback(async () => {
    setSendingCards(true)
    try {
      const list = students
        .filter(s => s.status === 'Đang học')
        .map(s => {
          const avg = calculateStudentAvg(s.id, 2)
          const att = getStudentAttendanceRate(s.id)
          const cls = MOCK_CLASSES.find(c => c.id === s.classId)
          return {
            studentName: s.fullName,
            holyName: s.holyName,
            className: cls?.name || '',
            score: avg.score ?? 0,
            rank: avg.label,
            attendanceRate: att.rate,
            attendancePresent: att.presentCount,
            attendanceTotal: att.totalCount,
          }
        })

      const token = localStorage.getItem('parish_access_token')
      await fetch('/api/notifications/smart/report-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ students: list }),
      })
    } finally {
      setSendingCards(false)
    }
  }, [students, calculateStudentAvg, getStudentAttendanceRate])

  if (effectiveMode === 'desktop') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setShowPromotions(false)}
              className={`btn btn-sm ${!showPromotions ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Users size={14} /> Danh Sách
            </button>
            <button
              onClick={() => setShowPromotions(true)}
              className={`btn btn-sm ${showPromotions ? 'btn-primary' : 'btn-secondary'}`}
            >
              <TrendingUp size={14} /> Thăng Tiến
            </button>
          </div>
          <button
            onClick={handleSendReportCards}
            disabled={sendingCards}
            className="btn btn-primary btn-sm"
          >
            <Send size={14} /> {sendingCards ? 'Đang gửi...' : 'Gửi Phiếu Điểm'}
          </button>
        </div>
        {showPromotions ? (
          <PromotionPanel onViewPhotoCard={openPhotoCard} onViewCertificate={(s) => openCertificate(s, 'promotion')} />
        ) : (
          <DesktopStudentList
            onOpenAddStudent={openAddStudent}
            onEditStudent={openEditStudent}
            onViewReport={openReport}
            onViewPhotoCard={openPhotoCard}
          />
        )}
      </div>
    )
  }

  return (
    <MobileStudentsView
      onOpenAddStudent={openAddStudent}
      onEditStudent={openEditStudent}
      onViewReport={openReport}
    />
  )
}

export default StudentsPage
