import React, { useState } from 'react'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { Printer, FileText, Award, X, Download, Eye, Layers, User, Loader2, FileDown } from 'lucide-react'
import {
  generateClassGradebookHTML,
  generateStudentReportCardHTML,
  generateSacramentCertificateHTML,
  generateBatchReportCardsHTML,
  generateBatchPhotoCardsHTML,
  generateParentInvitationHTML,
  generateBatchParentInvitationsHTML,
  type ReportType,
} from '../../utils/pdfGenerator'
import { ReportViewModelFactory } from '../../utils/reportViewModelFactory'
import { ReportExportService } from '../../services/reportExportService'
import { exportGradebookToExcel } from '../../utils/excelExporter'
import { api } from '../../lib/api'
import { ModalPortal } from './ModalPortal'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { normalizeAcademicYear, getCurrentAcademicYear } from '../../utils/academicYear'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { sortClassesByHierarchy } from '../../utils/classSort'

interface Props {
  isOpen: boolean
  onClose: () => void
  initialReportType?: ReportType
  initialClassId?: string
  initialStudentId?: string
}

export const PrintReportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialReportType,
  initialClassId,
  initialStudentId,
}) => {
  const [reportType, setReportType] = useState<ReportType>(initialReportType || 'CLASS_GRADEBOOK')
  const { dialogRef: trapRef } = useAccessibleDialog(isOpen, onClose)
  const [selectedClassId, setSelectedClassId] = useState(initialClassId || 'AU1')
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId || '')
  const [meetingTime, setMeetingTime] = useState('')
  const [meetingLocation, setMeetingLocation] = useState('')
  const [meetingReason, setMeetingReason] = useState('')
  const [invitationTitle, setInvitationTitle] = useState('Phiếu Mời Phụ Huynh')

  React.useEffect(() => {
    if (isOpen) {
      if (initialReportType) setReportType(initialReportType)
      if (initialClassId) setSelectedClassId(initialClassId)
      if (initialStudentId) setSelectedStudentId(initialStudentId)
    }
  }, [isOpen, initialReportType, initialClassId, initialStudentId])

  // ADR-017 (F4): Mặc định năm học hợp lệ (currentYear hoặc năm hiện tại) —
  // trước đây mặc định '' khiến mọi báo cáo in ra rỗng dữ liệu.
  const [academicYear, setAcademicYear] = useState(
    normalizeAcademicYear(useAcademicYearStore.getState().currentYear) || getCurrentAcademicYear()
  )
  const [semester, setSemester] = useState<1 | 2>(useSettingsStore.getState().settings.currentSemester || 1)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

  const students = useStudentStore((s) => s.students)
  const grades = useGradeStore((g) => g.grades)
  const attendance = useAttendanceStore((a) => a.attendance)
  const rawClassList = useClassStore((s) => s.getClassList)()
  const classList = React.useMemo(() => sortClassesByHierarchy(rawClassList, 'asc'), [rawClassList])
  const findClassById = useClassStore((s) => s.findClassById)

  if (!isOpen) return null

  const classStudents = students.filter((s) => !s.deletedAt && s.classId === selectedClassId)
  const activeStudent = students.find((s) => s.id === selectedStudentId) || classStudents[0]
  const targetClass = findClassById(selectedClassId)

  // Single rendering pipeline for single / batch actions
  const buildHTML = (): { html: string; filename: string } => {
    // ADR-017 (F4): Chuẩn hóa năm học trước khi dùng — người dùng có thể gõ
    // '2025 - 2026' trong ô Năm Học, exact-match với row '2025-2026' sẽ rỗng.
    const resolvedYear = normalizeAcademicYear(academicYear) || getCurrentAcademicYear()
    const currentSettings = useSettingsStore.getState().settings
    const options = {
      academicYear: resolvedYear,
      parishName: currentSettings.parishName || 'Giáo Xứ Gia Tôn',
      dioceseName: currentSettings.dioceseName || 'Giáo Phận Xuân Lộc',
      meetingTime,
      meetingLocation,
      meetingReason,
      title: invitationTitle,
    }

    if (reportType === 'BATCH_STUDENT_REPORT_CARDS') {
      const batchVm = ReportViewModelFactory.createBatchViewModel({
        students,
        grades,
        attendance,
        academicYear: resolvedYear,
        classId: selectedClassId,
      })
      const html = generateBatchReportCardsHTML(batchVm)
      return { html, filename: `PhieuDiemHangLoat_${targetClass?.name || selectedClassId}_${resolvedYear}.html` }
    }

    if (reportType === 'CLASS_GRADEBOOK') {
      const html = generateClassGradebookHTML(selectedClassId, students, grades, attendance, options)
      return { html, filename: `SoDiem_${targetClass?.name || selectedClassId}_${resolvedYear}.html` }
    }

    if (reportType === 'STUDENT_REPORT_CARD' && activeStudent) {
      const html = generateStudentReportCardHTML(activeStudent, grades, attendance, options)
      return { html, filename: `PhieuDiem_${activeStudent.code}_${resolvedYear}.html` }
    }

    if (reportType === 'SACRAMENT_CERTIFICATE' && activeStudent) {
      const html = generateSacramentCertificateHTML(activeStudent, options)
      return { html, filename: `GiayChungNhan_${activeStudent.code}.html` }
    }

    if (reportType === 'BATCH_PHOTO_CARDS') {
      const html = generateBatchPhotoCardsHTML(classStudents, options)
      return { html, filename: `TheThieuNhiHangLoat_${targetClass?.name || selectedClassId}_${resolvedYear}.html` }
    }

    if (reportType === 'PARENT_INVITATION' && activeStudent) {
      const html = generateParentInvitationHTML(activeStudent, options)
      return { html, filename: `PhieuMoiPhuHuynh_${activeStudent.code}_${resolvedYear}.html` }
    }

    if (reportType === 'BATCH_PARENT_INVITATIONS') {
      const html = generateBatchParentInvitationsHTML(classStudents, options)
      return { html, filename: `PhieuMoiPhuHuynhHangLoat_${targetClass?.name || selectedClassId}_${resolvedYear}.html` }
    }

    return { html: '', filename: 'report.html' }
  }

  const handlePrint = () => {
    const { html } = buildHTML()
    if (!html) {
      void askConfirm({
        title: 'Chưa có dữ liệu',
        message: 'Vui lòng chọn dữ liệu để in!',
        confirmText: 'OK',
        variant: 'warning',
        showCancel: false,
      })
      return
    }
    ReportExportService.print(html)
  }

  const handlePreview = () => {
    const { html } = buildHTML()
    if (!html) {
      void askConfirm({
        title: 'Chưa có dữ liệu',
        message: 'Vui lòng chọn dữ liệu để xem trước!',
        confirmText: 'OK',
        variant: 'warning',
        showCancel: false,
      })
      return
    }
    ReportExportService.preview(html)
  }

  const handleDownloadHTML = () => {
    const { html, filename } = buildHTML()
    if (!html) {
      void askConfirm({
        title: 'Chưa có dữ liệu',
        message: 'Vui lòng chọn dữ liệu để tải file!',
        confirmText: 'OK',
        variant: 'warning',
        showCancel: false,
      })
      return
    }
    ReportExportService.downloadHTML(html, filename)
  }

  const handleExportExcel = () => {
    const resolvedYear = normalizeAcademicYear(academicYear) || getCurrentAcademicYear()
    const matrixData: Record<string, any> = {}
    classStudents.forEach((s) => {
      const existing = grades.find((g) => g.studentId === s.id && normalizeAcademicYear(g.academicYear) === resolvedYear)
      if (existing) matrixData[s.id] = existing
    })

    exportGradebookToExcel({
      students: classStudents,
      matrixData,
      className: targetClass?.name || 'Lớp Giáo Lý',
      semester: semester,
      academicYear: resolvedYear,
    })
  }

  // P0 (2026-08-14): Nối UI với server PDF pipeline (Puppeteer) — trước đây
  // api.generatePDF không có caller nào. HTML đã chứa @page (A4/A6/landscape) nên
  // server honor qua preferCSSPageSize; chỉ đổi đuôi filename .html → .pdf.
  const handleExportPdf = async () => {
    const { html, filename } = buildHTML()
    if (!html) {
      void askConfirm({
        title: 'Chưa có dữ liệu',
        message: 'Vui lòng chọn dữ liệu để xuất PDF!',
        confirmText: 'OK',
        variant: 'warning',
        showCancel: false,
      })
      return
    }
    setIsGeneratingPdf(true)
    try {
      const pdfBlob = await api.generatePDF(html)
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename.replace(/\.html$/i, '.pdf')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      void askConfirm({
        title: 'Lỗi tạo PDF',
        message: `Không thể tạo file PDF: ${err?.message || 'lỗi máy chủ'}`,
        confirmText: 'OK',
        variant: 'danger',
        showCancel: false,
      })
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  return (
    <>
    <ModalPortal>
    <div className="app-modal-layer fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="In báo cáo">
      <div ref={trapRef} className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-parish-primary-light text-parish-primary rounded-lg">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main">In Báo Cáo & Sổ Điểm Nhà Xứ</h2>
              <p className="text-xs text-text-muted">Xuất file PDF & HTML chuẩn in ấn Sổ điểm & Phiếu kết quả học tập</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Report Type Selection */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-2">Loại Báo Cáo Cần In</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setReportType('CLASS_GRADEBOOK')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  reportType === 'CLASS_GRADEBOOK'
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary font-semibold'
                    : 'border-surface-border hover:bg-surface-hover text-text-main'
                }`}
              >
                <FileText className="w-5 h-5 mb-2" />
                <span className="text-xs">Sổ Điểm Lớp</span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('BATCH_STUDENT_REPORT_CARDS')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  reportType === 'BATCH_STUDENT_REPORT_CARDS'
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary font-semibold'
                    : 'border-surface-border hover:bg-surface-hover text-text-main'
                }`}
              >
                <Layers className="w-5 h-5 mb-2 text-amber-600" />
                <span className="text-xs">KQ Học Tập (Loạt)</span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('STUDENT_REPORT_CARD')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  reportType === 'STUDENT_REPORT_CARD'
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary font-semibold'
                    : 'border-surface-border hover:bg-surface-hover text-text-main'
                }`}
              >
                <FileText className="w-5 h-5 mb-2" />
                <span className="text-xs">KQ Học Tập (Riêng)</span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('SACRAMENT_CERTIFICATE')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  reportType === 'SACRAMENT_CERTIFICATE'
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary font-semibold'
                    : 'border-surface-border hover:bg-surface-hover text-text-main'
                }`}
              >
                <Award className="w-5 h-5 mb-2" />
                <span className="text-xs">Chứng Nhận</span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('BATCH_PHOTO_CARDS')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  reportType === 'BATCH_PHOTO_CARDS'
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary font-semibold'
                    : 'border-surface-border hover:bg-surface-hover text-text-main'
                }`}
              >
                <User className="w-5 h-5 mb-2 text-emerald-600" />
                <span className="text-xs">Thẻ Thiếu Nhi (Loạt)</span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('BATCH_PARENT_INVITATIONS')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  reportType === 'BATCH_PARENT_INVITATIONS'
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary font-semibold'
                    : 'border-surface-border hover:bg-surface-hover text-text-main'
                }`}
              >
                <Award className="w-5 h-5 mb-2 text-sky-600" />
                <span className="text-xs">Phiếu Mời PH (Loạt)</span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('PARENT_INVITATION')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  reportType === 'PARENT_INVITATION'
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary font-semibold'
                    : 'border-surface-border hover:bg-surface-hover text-text-main'
                }`}
              >
                <FileText className="w-5 h-5 mb-2 text-sky-600" />
                <span className="text-xs">Phiếu Mời PH (Riêng)</span>
              </button>
            </div>
          </div>

          {/* Roster Info Summary Banner for Batch Export */}
          {(reportType === 'BATCH_STUDENT_REPORT_CARDS' || reportType === 'BATCH_PHOTO_CARDS' || reportType === 'BATCH_PARENT_INVITATIONS') && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-xs text-amber-700 dark:text-amber-300">
              <span>Sẵn sàng xuất hàng loạt <strong>{classStudents.length} {reportType === 'BATCH_PHOTO_CARDS' ? 'thẻ thiếu nhi A6' : reportType === 'BATCH_PARENT_INVITATIONS' ? 'giấy mời A4' : 'kết quả học tập A4'}</strong> cho lớp <strong>{targetClass?.name || selectedClassId}</strong></span>
              <span className="px-2 py-0.5 bg-amber-500/20 rounded font-semibold">{classStudents.length} Học sinh</span>
            </div>
          )}

          {/* Controls */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Lớp Giáo Lý</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
              >
                {classList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.academicYear})
                  </option>
                ))}
              </select>
            </div>

            {reportType !== 'CLASS_GRADEBOOK' && reportType !== 'BATCH_STUDENT_REPORT_CARDS' && reportType !== 'BATCH_PHOTO_CARDS' && reportType !== 'BATCH_PARENT_INVITATIONS' && (
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Chọn Thiếu Nhi</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                >
                  {classStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.holyName} {s.fullName} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(reportType === 'PARENT_INVITATION' || reportType === 'BATCH_PARENT_INVITATIONS') && (
              <div className="p-3.5 bg-sky-500/10 border border-sky-500/30 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-sky-700 dark:text-sky-300 uppercase flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>Cấu Hình Chi Tiết Giấy Mời Họp Phụ Huynh</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Tiêu đề giấy mời</label>
                    <input
                      type="text"
                      value={invitationTitle}
                      onChange={(e) => setInvitationTitle(e.target.value)}
                      placeholder="Phiếu Mời Phụ Huynh"
                      className="w-full px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg text-xs text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Thời gian họp</label>
                    <input
                      type="text"
                      value={meetingTime}
                      onChange={(e) => setMeetingTime(e.target.value)}
                      placeholder="Ví dụ: 08g00 Chủ Nhật, ngày 25/08/2026"
                      className="w-full px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg text-xs text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Địa điểm họp</label>
                    <input
                      type="text"
                      value={meetingLocation}
                      onChange={(e) => setMeetingLocation(e.target.value)}
                      placeholder="Ví dụ: Hội trường Giáo xứ"
                      className="w-full px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg text-xs text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Lý do / Nội dung họp</label>
                    <input
                      type="text"
                      value={meetingReason}
                      onChange={(e) => setMeetingReason(e.target.value)}
                      placeholder="Ví dụ: Họp phụ huynh đầu năm học mới"
                      className="w-full px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg text-xs text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Năm Học</label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Học Kỳ (Xuất Excel)</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value) as 1 | 2)}
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                >
                  <option value={1}>Học Kỳ I</option>
                  <option value={2}>Học Kỳ II</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>
            <button
              onClick={handleDownloadHTML}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/30 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải HTML</span>
            </button>
            <button
              onClick={handleExportPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              <span>{isGeneratingPdf ? 'Đang Xuất PDF...' : 'Xuất PDF'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePreview}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-text-main bg-surface-hover hover:bg-surface-border transition-colors border border-surface-border"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Xem Trước</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-parish-primary hover:bg-parish-primary-hover shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Tất Cả / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
    {confirmDialog}
    </>
  )
}
