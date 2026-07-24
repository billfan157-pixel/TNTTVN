import React, { useState } from 'react'
import { Database, Download, Upload, CheckCircle, X, Loader2 } from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { db } from '../../lib/db'
import * as Sentry from '@sentry/react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export const BackupRestoreModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<'export' | 'import' | null>(null)
  const students = useStudentStore((s) => s.students)
  const grades = useGradeStore((g) => g.grades)
  const attendance = useAttendanceStore((a) => a.attendance)

  const setStudents = useStudentStore((s) => s.setStudents)
  const setGrades = useGradeStore((g) => g.setGrades)
  const setAttendance = useAttendanceStore((a) => a.setAttendance)

  if (!isOpen) return null

  const handleExportBackup = () => {
    setIsLoading('export')
    try {
      const backupData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        parish: 'Giáo Xứ Gia Tôn',
        data: {
          students,
          grades,
          attendance,
        },
      }

      const jsonString = JSON.stringify(backupData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      const dateStr = new Date().toISOString().split('T')[0]
      link.href = url
      link.download = `parish_backup_${dateStr}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setStatusMessage(`Đã xuất thành công bản sao lưu parish_backup_${dateStr}.json!`)
    } catch (err) {
      Sentry.captureException(err)
      alert('Có lỗi xảy ra khi xuất file sao lưu!')
    } finally {
      setIsLoading(null)
    }
  }

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading('import')
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string
        const parsed = JSON.parse(content)

        if (!parsed.data || !parsed.data.students) {
          alert('File sao lưu không đúng định dạng chuẩn của hệ thống Nhà Xứ!')
          return
        }

        setStudents(parsed.data.students || [])
        setGrades(parsed.data.grades || [])
        setAttendance(parsed.data.attendance || [])

        await db.stores.put({ key: 'parish_store_students', value: JSON.stringify(parsed.data.students) })
        await db.stores.put({ key: 'parish_store_grades', value: JSON.stringify(parsed.data.grades) })
        await db.stores.put({ key: 'parish_store_attendance', value: JSON.stringify(parsed.data.attendance) })

        setStatusMessage(`Khôi phục thành công ${parsed.data.students.length} Thiếu nhi từ file sao lưu!`)
      } catch (err) {
        Sentry.captureException(err)
        alert('Không thể đọc file sao lưu. Vui lòng kiểm tra lại file `.json`!')
      } finally {
        setIsLoading(null)
      }
    }
    reader.onerror = () => {
      Sentry.captureException(new Error('FileReader error during backup import'))
      alert('Có lỗi khi đọc file. Vui lòng thử lại!')
      setIsLoading(null)
    }
    reader.readAsText(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-950 text-amber-600 rounded-lg">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main">Sao Lưu & Khôi Phục Dữ Liệu 1-Click</h2>
              <p className="text-xs text-text-muted">Xuất hoặc nạp bản sao lưu dữ liệu toàn bộ Nhà Xứ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {statusMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 rounded-lg text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Action 1: Export */}
          <div className="p-4 rounded-xl border border-surface-border bg-surface-hover/20 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-main">Xuất Bản Sao Lưu (.json)</h3>
                <p className="text-xs text-text-muted">Tải file sao lưu chứa tất cả học sinh, điểm số, điểm danh</p>
              </div>
            </div>
            <button
              onClick={handleExportBackup}
              disabled={isLoading === 'export'}
              className="w-full py-2 px-4 rounded-lg bg-parish-primary hover:bg-parish-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              {isLoading === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isLoading === 'export' ? 'Đang xuất...' : 'Tải Xuất File Backup Ngay (.json)'}</span>
            </button>
          </div>

          {/* Action 2: Import */}
          <div className="p-4 rounded-xl border border-surface-border bg-surface-hover/20 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-main">Khôi Phục Dữ Liệu Từ File</h3>
                <p className="text-xs text-text-muted">Nạp file sao lưu `.json` để khôi phục dữ liệu đã lưu</p>
              </div>
            </div>
            <label className={`flex items-center justify-center w-full py-2 px-4 rounded-lg border border-amber-500/50 ${isLoading === 'import' ? 'bg-amber-500/20 cursor-wait' : 'bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer'} text-amber-600 text-xs font-semibold transition-colors`}>
              {isLoading === 'import' ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang khôi phục...</>
              ) : (
                <span>Chọn File Backup (.json) Để Khôi Phục...</span>
              )}
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" disabled={isLoading === 'import'} />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-surface-border bg-surface-hover/30">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold text-text-main hover:bg-surface-hover transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
