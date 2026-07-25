import React, { useState } from 'react'
import { Printer, FileText, Award, X, Download } from 'lucide-react'
import {
  generateClassGradebookHTML,
  generateStudentReportCardHTML,
  generateSacramentCertificateHTML,
  printHTMLReport,
  type ReportType,
} from '../../utils/pdfGenerator'
import { exportGradebookToExcel } from '../../utils/excelExporter'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export const PrintReportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [reportType, setReportType] = useState<ReportType>('CLASS_GRADEBOOK')
  const [selectedClassId, setSelectedClassId] = useState('AU1')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [academicYear, setAcademicYear] = useState(useAcademicYearStore.getState().currentYear)

  const students = useStudentStore((s) => s.students)
  const grades = useGradeStore((g) => g.grades)
  const attendance = useAttendanceStore((a) => a.attendance)

  if (!isOpen) return null

  const classStudents = students.filter((s) => s.classId === selectedClassId)
  const activeStudent = students.find((s) => s.id === selectedStudentId) || classStudents[0]

  const handlePrint = () => {
    let html = ''
    const options = {
      academicYear,
      parishName: 'Giáo Xứ Gia Tôn',
      dioceseName: 'Giáo Phận Xuân Lộc',
    }

    if (reportType === 'CLASS_GRADEBOOK') {
      html = generateClassGradebookHTML(selectedClassId, students, grades, attendance, options)
    } else if (reportType === 'STUDENT_REPORT_CARD' && activeStudent) {
      html = generateStudentReportCardHTML(activeStudent, grades, attendance, options)
    } else if (reportType === 'SACRAMENT_CERTIFICATE' && activeStudent) {
      html = generateSacramentCertificateHTML(activeStudent, options)
    } else {
      alert('Vui lòng chọn học sinh để in phiếu!')
      return
    }

    printHTMLReport(html)
  }

  const handleExportExcel = () => {
    const targetClass = useClassStore.getState().findClassById(selectedClassId)
    const targetStudents = students.filter((s) => s.classId === selectedClassId)

    const matrixData: Record<string, any> = {}
    targetStudents.forEach((s) => {
      const existing = grades.find((g) => g.studentId === s.id && g.academicYear === academicYear)
      if (existing) matrixData[s.id] = existing
    })

    exportGradebookToExcel({
      students: targetStudents,
      matrixData,
      className: targetClass?.name || 'Lớp Giáo Lý',
      semester: 1,
      academicYear,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-parish-primary-light text-parish-primary rounded-lg">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main">In Báo Cáo & Sổ Điểm Nhà Xứ</h2>
              <p className="text-xs text-text-muted">Xuất file PDF chuẩn in ấn Sổ điểm & Phiếu điểm</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                onClick={() => setReportType('STUDENT_REPORT_CARD')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  reportType === 'STUDENT_REPORT_CARD'
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary font-semibold'
                    : 'border-surface-border hover:bg-surface-hover text-text-main'
                }`}
              >
                <FileText className="w-5 h-5 mb-2" />
                <span className="text-xs">Phiếu Điểm</span>
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
                <span className="text-xs">Giấy Chứng Nhận</span>
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Lớp Giáo Lý</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
              >
                {useClassStore.getState().getClassList().map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.academicYear})
                  </option>
                ))}
              </select>
            </div>

            {reportType !== 'CLASS_GRADEBOOK' && (
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

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Năm Học</label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border bg-surface-hover/30">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:bg-surface-hover transition-colors">
            Hủy Bỏ
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Xuất File Excel</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-parish-primary hover:bg-parish-primary-hover shadow-xs transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Mở Trang In / PDF</span>
          </button>
        </div>
      </div>
    </div>
  )
}
