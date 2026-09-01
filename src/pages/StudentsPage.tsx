import { MobileStudentsView } from '../components/mobile/MobileStudentsView'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { useUIStore } from '../stores/uiStore'
import { useStudentStore } from '../stores/studentStore'
import { useFilterStore } from '../stores/filterStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { useClassStore } from '../stores/classStore'
import { useToastStore } from '../stores/toastStore'
import { api, ApiError } from '../lib/api'
import { useState, useCallback, Suspense, useMemo } from 'react'
import { TrendingUp, Users, Send, AlertCircle, CheckCircle, BookOpen } from 'lucide-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import type { Student, StudentWorkspace } from '../types'
import { Button } from '../components/common/ui/Button'
import { TabPanel, Tabs } from '../components/common/ui/SelectionControls'
import { useAuth } from '../hooks/useAuth'

const STUDENT_WORKSPACE_TABS = [
  { value: 'students' as const, label: 'Danh Sách', icon: <Users aria-hidden="true" size={14} /> },
  { value: 'promotions' as const, label: 'Thăng Tiến', icon: <TrendingUp aria-hidden="true" size={14} /> },
]

const DesktopStudentList = lazyWithRetry<React.FC<{
  onOpenAddStudent: () => void
  onImportStudents: () => void
  onEditStudent: (student: Student) => void
  onViewReport: (student: Student) => void
  onViewPhotoCard: (student: Student) => void
  onManageClasses: () => void
}>>(() => import('../components/desktop/DesktopStudentList'), 'DesktopStudentList')

const DesktopClasses = lazyWithRetry<React.FC<{
  embedded?: boolean
  onViewClassStudents?: (classId: string) => void
}>>(() => import('../components/desktop/DesktopClasses').then(module => ({ default: module.DesktopClasses })), 'DesktopClasses')

const PromotionPanel = lazyWithRetry<React.FC<{
  onViewPhotoCard?: (student: Student) => void
  onViewCertificate?: (student: Student) => void
}>>(() => import('../components/desktop/PromotionPanel'), 'PromotionPanel')

const ExcelImportModal = lazyWithRetry<React.FC<{
  isOpen: boolean
  onClose: () => void
}>>(() => import('../components/common/ExcelImportModal'), 'ExcelImportModal')

export function StudentsPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/students' })
  const { role } = useAuth()
  const effectiveMode = useEffectiveMode()
  const { openAddStudent, openEditStudent, openReport, openReportForPrint, openPhotoCard, openCertificate } = useUIStore()
  const [showImportModal, setShowImportModal] = useState(false)
  const [sendingCards, setSendingCards] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [cardSuccess, setCardSuccess] = useState<string | null>(null)
  const [showConfirmSend, setShowConfirmSend] = useState(false)
  const requestedWorkspace = search.view || 'students'
  const activeWorkspace: StudentWorkspace = requestedWorkspace === 'classes' && role !== 'admin'
    ? 'students'
    : requestedWorkspace
  const workspaceTabs = role === 'admin'
    ? [...STUDENT_WORKSPACE_TABS, { value: 'classes' as const, label: 'Lớp Học', icon: <BookOpen aria-hidden="true" size={14} /> }]
    : STUDENT_WORKSPACE_TABS
  const setActiveWorkspace = useCallback((view: StudentWorkspace) => {
    navigate({ to: '/students', search: previous => ({ ...previous, view }), replace: true })
  }, [navigate])
  const openClassRoster = useCallback((classId: string) => {
    navigate({
      to: '/students',
      search: previous => ({ ...previous, view: 'students', classId }),
      replace: true,
    })
  }, [navigate])
  const students = useStudentStore(s => s.students)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const getStudentAttendanceRate = useAttendanceStore(s => s.getStudentAttendanceRate)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const findClassById = useClassStore(s => s.findClassById)

  const filteredStudentsForSend = useMemo(() => {
    let list = students.filter(s => s.status === 'Đang học')
    if (selectedClassId && selectedClassId !== 'all') {
      list = list.filter(s => s.classId === selectedClassId)
    }
    return list
  }, [students, selectedClassId])

  const confirmSendInfo = useMemo(() => {
    const count = filteredStudentsForSend.length
    if (selectedClassId !== 'all') {
      const cls = findClassById(selectedClassId)
      return { count, label: cls?.name || selectedClassId }
    }
    return { count, label: 'toàn xứ' }
  }, [filteredStudentsForSend, selectedClassId, findClassById])

  const handleSendReportCards = useCallback(async () => {
    const listToSend = filteredStudentsForSend
    if (listToSend.length === 0) {
      setCardError(selectedClassId !== 'all' ? 'Không có thiếu nhi nào trong lớp đã chọn để gửi' : 'Không có thiếu nhi nào để gửi kết quả')
      return
    }
    setSendingCards(true)
    setCardError(null)
    setCardSuccess(null)
    try {
      const list = listToSend.map(s => {
          const avg = calculateStudentAvg(s.id, selectedSemester)
          const att = getStudentAttendanceRate(s.id)
          const cls = findClassById(s.classId)
          return {
            studentId: s.id,
            parentPhone: s.parentPhone,
            classId: s.classId,
            studentName: s.fullName,
            holyName: s.holyName,
            className: cls?.name || '',
            score: avg.score ?? 0,
            rank: avg.label || '—',
            attendanceRate: att.rate,
            attendancePresent: att.presentCount,
            attendanceTotal: att.totalCount,
          }
        })

      const res: any = await api.sendReportCards({ students: list })
      const sent = res?.sent ?? list.length
      const total = res?.total ?? list.length
      const msg = `Đã gửi ${sent}/${total} phiếu điểm đến phụ huynh${confirmSendInfo.label !== 'toàn xứ' ? ` (${confirmSendInfo.label})` : ''}`
      setCardSuccess(msg)
      useToastStore.getState().addToast(msg, 'success', 6000)
      if (sent < total) {
        setCardError(`Lưu ý: ${total - sent} em chưa có tài khoản phụ huynh liên kết SĐT — chỉ gửi được Telegram broadcast`)
      }
    } catch (err) {
      let raw = err instanceof ApiError ? err.message : 'Không thể gửi kết quả học tập'
      // Làm thân thiện: bỏ tiền tố [students.0.xxx] và dịch lỗi kỹ thuật
      let friendly = raw.replace(/^\[.*?\]\s*/, '').trim()
      if (/Number must be|String must contain|Required|Invalid/i.test(friendly)) {
        friendly = 'Dữ liệu phiếu điểm chưa hợp lệ. Vui lòng kiểm tra lại điểm/chuyên cần (có thể do lớp chưa có buổi học nào) và thử lại.'
      } else if (friendly.length > 140) {
        friendly = 'Không thể gửi kết quả học tập. Vui lòng kiểm tra lại dữ liệu và thử lại.'
      } else if (!friendly) {
        friendly = 'Không thể gửi kết quả học tập'
      }
      setCardError(friendly)
      useToastStore.getState().addToast(friendly, 'error', 7000)
    } finally {
      setSendingCards(false)
      setShowConfirmSend(false)
    }
  }, [filteredStudentsForSend, calculateStudentAvg, getStudentAttendanceRate, selectedSemester, selectedClassId, findClassById, confirmSendInfo])

  if (effectiveMode === 'desktop') {
    return (
      <><div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Tabs
            id="students-workspace-tabs"
            ariaLabel="Không gian quản lý thiếu nhi"
            items={workspaceTabs}
            value={activeWorkspace}
            onValueChange={setActiveWorkspace}
            className="w-fit"
          />
          {activeWorkspace === 'students' && <Button
            onClick={() => setShowConfirmSend(true)}
            disabled={sendingCards || filteredStudentsForSend.length === 0}
            loading={sendingCards}
            loadingLabel="Đang gửi..."
            leadingIcon={<Send aria-hidden="true" size={14} />}
            title={filteredStudentsForSend.length === 0 ? 'Không có thiếu nhi để gửi' : `Gửi cho ${confirmSendInfo.count} em ${confirmSendInfo.label}`}
            variant="primary"
            className="text-xs font-bold disabled:opacity-50"
          >
            {`Gửi Kết Quả Học Tập${confirmSendInfo.count > 0 ? ` (${confirmSendInfo.count})` : ''}`}
          </Button>}
        </div>

        {cardSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{cardSuccess}</span>
          </div>
        )}
        {cardError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{cardError}</span>
          </div>
        )}

        <TabPanel tabsId="students-workspace-tabs" value="promotions" activeValue={activeWorkspace}>
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải dữ liệu thiếu nhi...</div>}>
            <PromotionPanel onViewPhotoCard={openPhotoCard} onViewCertificate={(s) => openCertificate(s, 'promotion')} />
          </Suspense>
        </TabPanel>
        <TabPanel tabsId="students-workspace-tabs" value="students" activeValue={activeWorkspace}>
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải dữ liệu thiếu nhi...</div>}>
            <DesktopStudentList
              onOpenAddStudent={openAddStudent}
              onImportStudents={() => setShowImportModal(true)}
              onEditStudent={openEditStudent}
              onViewReport={openReport}
              onViewPhotoCard={openPhotoCard}
              onManageClasses={() => setActiveWorkspace('classes')}
            />
          </Suspense>
        </TabPanel>
        {role === 'admin' && (
          <TabPanel tabsId="students-workspace-tabs" value="classes" activeValue={activeWorkspace}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-sm font-medium text-text-secondary">Đang tải lớp học...</div>}>
              <DesktopClasses embedded onViewClassStudents={openClassRoster} />
            </Suspense>
          </TabPanel>
        )}
      </div>

      {showImportModal && (
        <Suspense fallback={null}>
          <ExcelImportModal isOpen onClose={() => { setShowImportModal(false); useFilterStore.getState().setSelectedClassId('all'); useFilterStore.getState().setSelectedBranchId('all'); }} />
        </Suspense>
      )}
      <ConfirmDialog
        isOpen={showConfirmSend}
        title="Gửi Kết Quả Học Tập"
        message={`Bạn có chắc muốn gửi phiếu điểm học kỳ ${selectedSemester} cho ${confirmSendInfo.count} em ${confirmSendInfo.label !== 'toàn xứ' ? `lớp ${confirmSendInfo.label}` : 'toàn xứ đang học'}? Phụ huynh đã liên kết SĐT sẽ nhận Web Push + Telegram.`}
        confirmText={`Gửi ${confirmSendInfo.count} phiếu`}
        variant="info"
        onConfirm={handleSendReportCards}
        onCancel={() => setShowConfirmSend(false)}
      />
      </>
    )
  }

  return (
    <>
      <MobileStudentsView
        workspace={activeWorkspace}
        onWorkspaceChange={setActiveWorkspace}
        onViewClassStudents={openClassRoster}
        onOpenAddStudent={openAddStudent}
        onImportStudents={() => setShowImportModal(true)}
        onEditStudent={openEditStudent}
        onViewReport={openReport}
        onPrintReport={openReportForPrint}
        onSendReportCards={handleSendReportCards}
        sendingCards={sendingCards}
      />
      {showImportModal && (
        <Suspense fallback={null}>
          <ExcelImportModal isOpen onClose={() => { setShowImportModal(false); useFilterStore.getState().setSelectedClassId('all'); useFilterStore.getState().setSelectedBranchId('all'); }} />
        </Suspense>
      )}
      <ConfirmDialog
        isOpen={showConfirmSend}
        title="Gửi Kết Quả Học Tập"
        message={`Bạn có chắc muốn gửi phiếu điểm học kỳ ${selectedSemester} cho ${confirmSendInfo.count} em ${confirmSendInfo.label !== 'toàn xứ' ? `lớp ${confirmSendInfo.label}` : 'toàn xứ đang học'}?`}
        confirmText={`Gửi ${confirmSendInfo.count} phiếu`}
        variant="info"
        onConfirm={handleSendReportCards}
        onCancel={() => setShowConfirmSend(false)}
      />
    </>
  )
}

export default StudentsPage
