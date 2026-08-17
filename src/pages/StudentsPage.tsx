import { MobileStudentsView } from '../components/mobile/MobileStudentsView'
import { ExcelImportModal } from '../components/common/ExcelImportModal'
import { useUIStore } from '../stores/uiStore'
import { useStudentStore } from '../stores/studentStore'
import { useFilterStore } from '../stores/filterStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { useClassStore } from '../stores/classStore'
import { api, ApiError } from '../lib/api'
import { useState, useCallback, Suspense } from 'react'
import { TrendingUp, Users, Send, AlertCircle } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import type { Student } from '../types'

const DesktopStudentList = lazyWithRetry<React.FC<{
  onOpenAddStudent: () => void
  onImportStudents: () => void
  onEditStudent: (student: Student) => void
  onViewReport: (student: Student) => void
  onViewPhotoCard: (student: Student) => void
}>>(() => import('../components/desktop/DesktopStudentList'), 'DesktopStudentList')

const PromotionPanel = lazyWithRetry<React.FC<{
  onViewPhotoCard?: (student: Student) => void
  onViewCertificate?: (student: Student) => void
}>>(() => import('../components/desktop/PromotionPanel'), 'PromotionPanel')

export function StudentsPage() {
  const navigate = useNavigate()
  const effectiveMode = useEffectiveMode()
  const { openAddStudent, openEditStudent, openReport, openReportForPrint, openPhotoCard, openCertificate } = useUIStore()
  const [showPromotions, setShowPromotions] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [sendingCards, setSendingCards] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const students = useStudentStore(s => s.students)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const getStudentAttendanceRate = useAttendanceStore(s => s.getStudentAttendanceRate)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const findClassById = useClassStore(s => s.findClassById)

  const handleSendReportCards = useCallback(async () => {
    setSendingCards(true)
    setCardError(null)
    try {
      const list = students
        .filter(s => s.status === 'Đang học')
        .map(s => {
          const avg = calculateStudentAvg(s.id, selectedSemester)
          const att = getStudentAttendanceRate(s.id)
          const cls = findClassById(s.classId)
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
      const message = err instanceof ApiError ? err.message : 'Không thể gửi kết quả học tập'
      setCardError(message)
    } finally {
      setSendingCards(false)
    }
  }, [students, calculateStudentAvg, getStudentAttendanceRate, selectedSemester])

  if (effectiveMode === 'desktop') {
    return (
      <><div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setShowPromotions(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                !showPromotions ? 'bg-parish-primary text-white shadow-sm' : 'bg-surface-card text-text-secondary hover:bg-surface-hover border border-surface-border'
              }`}
            >
              <Users size={14} /> Danh Sách
            </button>
            <button
              onClick={() => setShowPromotions(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                showPromotions ? 'bg-parish-primary text-white shadow-sm' : 'bg-surface-card text-text-secondary hover:bg-surface-hover border border-surface-border'
              }`}
            >
              <TrendingUp size={14} /> Thăng Tiến
            </button>
          </div>
          <button
            onClick={handleSendReportCards}
            disabled={sendingCards}
            className="btn btn-primary text-xs font-bold flex items-center gap-2"
          >
            <Send size={14} /> {sendingCards ? 'Đang gửi...' : 'Gửi Kết Quả Học Tập'}
          </button>
        </div>

        {cardError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{cardError}</span>
          </div>
        )}

        <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải dữ liệu thiếu nhi...</div>}>
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
        </Suspense>
      </div>

      <ExcelImportModal isOpen={showImportModal} onClose={() => { setShowImportModal(false); useStudentStore.getState().fetchStudents(); useClassStore.getState().fetchClasses(); useFilterStore.getState().setSelectedClassId('all'); useFilterStore.getState().setSelectedBranchId('all'); }} />
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
        onPrintReport={openReportForPrint}
        onNavigateToClasses={() => navigate({ to: '/classes' })}
        onSendReportCards={handleSendReportCards}
        sendingCards={sendingCards}
      />
      <ExcelImportModal isOpen={showImportModal} onClose={() => { setShowImportModal(false); useStudentStore.getState().fetchStudents(); useClassStore.getState().fetchClasses(); useFilterStore.getState().setSelectedClassId('all'); useFilterStore.getState().setSelectedBranchId('all'); }} />
    </>
  )
}

export default StudentsPage
