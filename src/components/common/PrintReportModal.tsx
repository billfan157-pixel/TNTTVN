import React, { useState } from 'react'
import { Printer, FileText, Award, Download, Eye, Layers, User, Loader2, FileDown } from 'lucide-react'
import {
  generateOfficialClassGradebookHTML,
  generateParentReportCardHTML,
  generateSacramentCertificateHTML,
  generateOfficialBatchReportCardsHTML,
  generateBatchPhotoCardsHTML,
  generateParentInvitationHTML,
  generateBatchParentInvitationsHTML,
  type ReportType,
} from '../../utils/pdfGenerator'
import { ReportExportService } from '../../services/reportExportService'
import { fetchOfficialClassReport, fetchOfficialReportClasses, type OfficialClassMetadata, type OfficialClassReport } from '../../services/officialReporting'
import { exportGradebookToExcel } from '../../utils/excelExporter'
import { api } from '../../lib/api'
import { ModalShell } from './ModalShell'
import { useStudentStore } from '../../stores/studentStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { normalizeAcademicYear, getCurrentAcademicYear } from '../../utils/academicYear'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { sortClassesByHierarchy } from '../../utils/classSort'
import type { Student } from '../../types'

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
  const [isBuildingReport, setIsBuildingReport] = useState(false)
  const [officialClassReport, setOfficialClassReport] = useState<OfficialClassReport | null>(null)
  const [officialClassList, setOfficialClassList] = useState<OfficialClassMetadata[]>([])
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

  const students = useStudentStore((s) => s.students)
  const rawClassList = useClassStore((s) => s.getClassList)()
  const classList = React.useMemo(() => sortClassesByHierarchy(rawClassList, 'asc'), [rawClassList])
  const findClassById = useClassStore((s) => s.findClassById)

  const classStudents = students.filter((s) => !s.deletedAt && s.classId === selectedClassId)
  const activeStudent = students.find((s) => s.id === selectedStudentId) || classStudents[0]
  const targetClass = findClassById(selectedClassId)
  const profileMap = React.useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )
  const isAcademicReport = reportType === 'CLASS_GRADEBOOK'
    || reportType === 'BATCH_STUDENT_REPORT_CARDS'
    || reportType === 'STUDENT_REPORT_CARD'

  React.useEffect(() => {
    if (!isOpen || !isAcademicReport) return
    let active = true
    const year = normalizeAcademicYear(academicYear) || getCurrentAcademicYear()
    void fetchOfficialReportClasses(year).then((items) => {
      if (!active) return
      setOfficialClassList(items)
      if (!items.some((item) => item.id === selectedClassId)) setSelectedClassId(items[0]?.id || '')
    }).catch(() => {
      if (active) setOfficialClassList([])
    })
    return () => { active = false }
  }, [academicYear, isAcademicReport, isOpen, selectedClassId])

  React.useEffect(() => {
    if (!isOpen || !isAcademicReport || !selectedClassId) return
    let active = true
    const year = normalizeAcademicYear(academicYear) || getCurrentAcademicYear()
    void fetchOfficialClassReport(selectedClassId, year).then((result) => {
      if (!active) return
      setOfficialClassReport(result)
      setSelectedStudentId((current) => result.reportCards.some((report) => report.student.id === current)
        ? current
        : result.reportCards[0]?.student.id || '')
    }).catch(() => {
      if (active) setOfficialClassReport(null)
    })
    return () => { active = false }
  }, [academicYear, isAcademicReport, isOpen, selectedClassId])

  if (!isOpen) return null

  // Single rendering pipeline for single / batch actions
  const buildHTML = async (): Promise<{ html: string; filename: string }> => {
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
      const official = await fetchOfficialClassReport(selectedClassId, resolvedYear)
      const html = generateOfficialBatchReportCardsHTML(
        official.reportCards,
        profileMap,
        { id: official.summary.classId, name: official.summary.className },
        options,
      )
      return { html, filename: `PhieuDiemHangLoat_${official.summary.className}_${resolvedYear}.html` }
    }

    if (reportType === 'CLASS_GRADEBOOK') {
      const official = await fetchOfficialClassReport(selectedClassId, resolvedYear)
      const html = generateOfficialClassGradebookHTML(official.reportCards, official.summary.className, profileMap, options)
      return { html, filename: `SoDiem_${official.summary.className}_${resolvedYear}.html` }
    }

    if (reportType === 'STUDENT_REPORT_CARD') {
      const official = await fetchOfficialClassReport(selectedClassId, resolvedYear)
      const report = official.reportCards.find((item) => item.student.id === selectedStudentId) || official.reportCards[0]
      if (!report) return { html: '', filename: 'report.html' }
      const html = generateParentReportCardHTML(report, options)
      return { html, filename: `PhieuDiem_${report.student.code}_${resolvedYear}.html` }
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

  const handleBuildError = (err: unknown) => {
    void askConfirm({
      title: 'Không thể tải dữ liệu báo cáo',
      message: err instanceof Error ? err.message : 'Dữ liệu authoritative từ máy chủ không khả dụng.',
      confirmText: 'OK',
      variant: 'danger',
      showCancel: false,
    })
  }

  const handlePrint = async () => {
    setIsBuildingReport(true)
    try {
      const { html } = await buildHTML()
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
    } catch (err) {
      handleBuildError(err)
    } finally {
      setIsBuildingReport(false)
    }
  }

  const handlePreview = async () => {
    setIsBuildingReport(true)
    try {
      const { html, filename } = await buildHTML()
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
      ReportExportService.preview(html, filename)
    } catch (err) {
      handleBuildError(err)
    } finally {
      setIsBuildingReport(false)
    }
  }

  const handleDownloadHTML = async () => {
    setIsBuildingReport(true)
    try {
      const { html, filename } = await buildHTML()
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
    } catch (err) {
      handleBuildError(err)
    } finally {
      setIsBuildingReport(false)
    }
  }

  const handleExportExcel = async () => {
    setIsBuildingReport(true)
    try {
      const resolvedYear = normalizeAcademicYear(academicYear) || getCurrentAcademicYear()
      const official = await fetchOfficialClassReport(selectedClassId, resolvedYear)
      const matrixData: Record<string, any> = {}
      const authoritativeResults: Record<string, { gpa: number | null; classification: string | null }> = {}
      const exportStudents: Student[] = official.reportCards.map((report) => {
        const existing = profileMap.get(report.student.id)
        const grade = report.grades.find((item) => item.semester === semester)
        if (grade) matrixData[report.student.id] = { ...grade, studentId: report.student.id, academicYear: resolvedYear }
        authoritativeResults[report.student.id] = { gpa: grade?.gpa ?? null, classification: grade?.classification ?? null }
        return {
          id: report.student.id,
          code: report.student.code,
          holyName: report.student.holyName || '',
          fullName: report.student.fullName,
          gender: (report.student.gender === 'Nữ' ? 'Nữ' : 'Nam'),
          dateOfBirth: report.student.dateOfBirth || '',
          parentName: existing?.parentName || '',
          parentPhone: existing?.parentPhone || '',
          address: existing?.address || '',
          branch: existing?.branch || 'ChienCon',
          classId: selectedClassId,
          status: existing?.status || 'Đang học',
        }
      })

      exportGradebookToExcel({
        students: exportStudents,
        matrixData,
        authoritativeResults,
        className: official.summary.className,
        semester: semester,
        academicYear: resolvedYear,
      })
    } catch (err) {
      handleBuildError(err)
    } finally {
      setIsBuildingReport(false)
    }
  }

  // P0 (2026-08-14): Nối UI với server PDF pipeline (Puppeteer) — trước đây
  // api.generatePDF không có caller nào. HTML đã chứa @page (A4/A6/landscape) nên
  // server honor qua preferCSSPageSize; chỉ đổi đuôi filename .html → .pdf.
  const handleExportPdf = async () => {
    setIsGeneratingPdf(true)
    try {
      const { html, filename } = await buildHTML()
      if (!html) throw new Error('Vui lòng chọn dữ liệu để xuất PDF.')
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
      handleBuildError(err)
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const printFooter = (
    <div className="w-full px-4 sm:px-6 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-3 border-t border-surface-border space-y-2">
      <div className="flex gap-2">
        <button onClick={() => void handlePreview()} disabled={isBuildingReport || isGeneratingPdf} className="btn btn-secondary flex-1 min-h-[44px] text-xs font-semibold disabled:opacity-50">
          <Eye className="w-4 h-4" />
          <span>Xem Trước</span>
        </button>
        <button onClick={() => void handlePrint()} disabled={isBuildingReport || isGeneratingPdf} className="btn btn-primary flex-[2] min-h-[44px] text-xs font-semibold disabled:opacity-50">
          <Printer className="w-4 h-4" />
          <span>In Tất Cả / PDF</span>
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void handleExportExcel()}
          disabled={isBuildingReport || isGeneratingPdf}
          className="flex flex-1 items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-xs font-semibold text-parish-success bg-parish-success-bg border border-parish-success/30 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Excel</span>
        </button>
        <button onClick={() => void handleDownloadHTML()} disabled={isBuildingReport || isGeneratingPdf} className="btn btn-secondary flex-1 min-h-[44px] text-xs font-semibold disabled:opacity-50">
          <Download className="w-3.5 h-3.5" />
          <span>HTML</span>
        </button>
        <button
          onClick={handleExportPdf}
          disabled={isGeneratingPdf || isBuildingReport}
          className="flex flex-1 items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-xs font-semibold text-parish-warning bg-parish-warning-bg border border-parish-warning/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          <span>{isGeneratingPdf ? 'Đang Xuất PDF...' : 'PDF'}</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="In Báo Cáo & Sổ Điểm Nhà Xứ"
        subtitle="Xuất file PDF & HTML chuẩn in ấn Sổ điểm & Phiếu kết quả học tập"
        icon={<Printer className="w-5 h-5" />}
        maxWidth="576px"
        closeOnOverlay={false}
        footer={printFooter}
      >
        <div className="space-y-4">
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
                <Layers className="w-5 h-5 mb-2" />
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
                <User className="w-5 h-5 mb-2" />
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
                <Award className="w-5 h-5 mb-2" />
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
                <FileText className="w-5 h-5 mb-2" />
                <span className="text-xs">Phiếu Mời PH (Riêng)</span>
              </button>
            </div>
          </div>

          {/* Roster Info Summary Banner for Batch Export */}
          {(reportType === 'BATCH_STUDENT_REPORT_CARDS' || reportType === 'BATCH_PHOTO_CARDS' || reportType === 'BATCH_PARENT_INVITATIONS') && (
            <div className="p-3 bg-parish-warning-bg border border-parish-warning/30 rounded-lg flex items-center justify-between text-xs text-parish-warning">
              <span>Sẵn sàng xuất hàng loạt <strong>{reportType === 'BATCH_STUDENT_REPORT_CARDS' ? (officialClassReport?.reportCards.length ?? 0) : classStudents.length} {reportType === 'BATCH_PHOTO_CARDS' ? 'thẻ thiếu nhi A6' : reportType === 'BATCH_PARENT_INVITATIONS' ? 'giấy mời A4' : 'kết quả học tập A4'}</strong> cho lớp <strong>{officialClassReport?.summary.className || targetClass?.name || selectedClassId}</strong></span>
              <span className="px-2 py-0.5 bg-parish-warning/20 rounded font-semibold">{reportType === 'BATCH_STUDENT_REPORT_CARDS' ? (officialClassReport?.reportCards.length ?? 0) : classStudents.length} Học sinh</span>
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
                {(isAcademicReport ? officialClassList : classList).map((c) => (
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
                  {(reportType === 'STUDENT_REPORT_CARD' && officialClassReport
                    ? officialClassReport.reportCards.map((report) => report.student)
                    : classStudents).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.holyName} {s.fullName} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(reportType === 'PARENT_INVITATION' || reportType === 'BATCH_PARENT_INVITATIONS') && (
              <div className="p-3.5 bg-parish-info-bg border border-parish-info/30 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-parish-info uppercase flex items-center gap-1.5">
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
      </ModalShell>
      {confirmDialog}
    </>
  )
}
