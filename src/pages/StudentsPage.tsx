import { DesktopStudentList } from '../components/desktop/DesktopStudentList'
import { MobileStudentsView } from '../components/mobile/MobileStudentsView'
import { PromotionPanel } from '../components/desktop/PromotionPanel'
import { ExcelImportModal } from '../components/common/ExcelImportModal'
import { useUIStore } from '../stores/uiStore'
import { useStudentStore } from '../stores/studentStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { useClassStore } from '../stores/classStore'
import { api, ApiError } from '../lib/api'
import { useState, useCallback } from 'react'
import { TrendingUp, Users, Send, AlertCircle } from 'lucide-react'

export function StudentsPage() {
  const effectiveMode = useEffectiveMode()
  const { openAddStudent, openEditStudent, openReport, openPhotoCard, openCertificate } = useUIStore()
  const [showPromotions, setShowPromotions] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [sendingCards, setSendingCards] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const students = useStudentStore(s => s.students)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const getStudentAttendanceRate = useAttendanceStore(s => s.getStudentAttendanceRate)

  const handleSendReportCards = useCallback(async () => {
    setSendingCards(true)
    setCardError(null)
    try {
      const list = students
        .filter(s => s.status === 'Đang học')
        .map(s => {
          const avg = calculateStudentAvg(s.id, 2)
          const att = getStudentAttendanceRate(s.id)
          const cls = useClassStore.getState().findClassById(s.classId)
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

      await api.sendReportCards({ students: list })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể gửi phiếu điểm'
      setCardError(message)
    } finally {
      setSendingCards(false)
    }
  }, [students, calculateStudentAvg, getStudentAttendanceRate])

  if (effectiveMode === 'desktop') {
    return (
      <><div className="flex flex-col gap-4">
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
        {cardError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{cardError}</span>
          </div>
        )}
        {showPromotions ? (
          <PromotionPanel onViewPhotoCard={openPhotoCard} onViewCertificate={(s) => openCertificate(s, 'promotion')} />
        ) : (
          <DesktopStudentList
            onOpenAddStudent={openAddStudent}
            onImportStudents={() => setShowImportModal(true)}
            onEditStudent={openEditStudent}
            onViewReport={openReport}
            onViewPhotoCard={openPhotoCard}
          />
        )}
      </div>

      <ExcelImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />
      </>
    )
  }

  return (
    <>
      <MobileStudentsView
        onOpenAddStudent={openAddStudent}
        onImportStudents={() => setShowImportModal(true)}
        onEditStudent={openEditStudent}
        onViewReport={openReport}
      />
      <ExcelImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />
    </>
  )
}

export default StudentsPage
