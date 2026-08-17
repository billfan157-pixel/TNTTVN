import React, { useState, useEffect } from 'react'
import { Database, Download, Upload, CheckCircle, X, Loader2 } from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { db } from '../../lib/db'
import { httpFetch } from '../../lib/api'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import * as Sentry from '@sentry/react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export const BackupRestoreModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<'export' | 'import' | null>(null)
  // A07 (2026-08-10): re-authentication — nhập lại mật khẩu admin trước khi
  // sao lưu / khôi phục (server bắt buộc, verifyAdminReauth).
  const [adminPassword, setAdminPassword] = useState('')

  const setStudents = useStudentStore((s) => s.setStudents)
  const setGrades = useGradeStore((g) => g.setGrades)
  const setAttendance = useAttendanceStore((a) => a.setAttendance)
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleExportBackup = async () => {
    if (!adminPassword.trim()) {
      setStatusMessage('Vui lòng nhập mật khẩu Admin để xác nhận sao lưu')
      return
    }
    setIsLoading('export')
    try {
      // A-NEW-28 (2026-08-11): export chuyển GET?adminPassword → POST body —
      // credential không còn nằm trong URL (rò qua nginx access log / cache proxy).
      const res = await httpFetch.post<any>('/backup/export', { adminPassword: adminPassword.trim() })
      const jsonString = JSON.stringify(res, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      const dateStr = new Date().toISOString().split('T')[0]
      const filename = `parish-lms-backup-${dateStr}.json`
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setStatusMessage(`Đã tạo và tải bản sao lưu ${filename} thành công!`)
      setAdminPassword('')
    } catch (err: any) {
      Sentry.captureException(err)
      await askConfirm({
        title: 'Lỗi sao lưu',
        message: `Có lỗi xảy ra khi tạo bản sao lưu máy chủ: ${err?.message || 'Lỗi không xác định'}`,
        confirmText: 'OK',
        variant: 'danger',
        showCancel: false,
      })
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
          await askConfirm({
            title: 'Sai định dạng',
            message: 'File sao lưu không đúng định dạng chuẩn của Giáo xứ!',
            confirmText: 'OK',
            variant: 'warning',
            showCancel: false,
          })
          setIsLoading(null)
          return
        }

        // A07: phải nhập mật khẩu admin — server bắt buộc re-authentication
        // trước khi thay thế toàn bộ dữ liệu.
        if (!adminPassword.trim()) {
          setStatusMessage('Vui lòng nhập mật khẩu Admin để xác nhận khôi phục')
          setIsLoading(null)
          return
        }

        const restoreRes = await httpFetch.post<any>('/backup/restore', { ...parsed, adminPassword: adminPassword.trim() })

        // Refresh Zustand stores
        if (parsed.data.students) setStudents(parsed.data.students)
        if (parsed.data.grades) setGrades(parsed.data.grades)
        if (parsed.data.attendance) setAttendance(parsed.data.attendance)

        await db.stores.put({ key: 'parish_store_students', value: JSON.stringify(parsed.data.students) })
        await db.stores.put({ key: 'parish_store_grades', value: JSON.stringify(parsed.data.grades) })
        await db.stores.put({ key: 'parish_store_attendance', value: JSON.stringify(parsed.data.attendance) })

        setStatusMessage(restoreRes.message || `Khôi phục thành công dữ liệu ${parsed.data.students.length} em thiếu nhi!`)
        setAdminPassword('')
      } catch (err: any) {
        Sentry.captureException(err)
        await askConfirm({
          title: 'Không thể khôi phục',
          message: `Không thể khôi phục dữ liệu: ${err?.message || 'Vui lòng kiểm tra lại file!'}`,
          confirmText: 'OK',
          variant: 'danger',
          showCancel: false,
        })
      } finally {
        setIsLoading(null)
      }
    }
    reader.onerror = () => {
      Sentry.captureException(new Error('FileReader error during backup import'))
      void askConfirm({
        title: 'Lỗi đọc file',
        message: 'Có lỗi khi đọc file. Vui lòng thử lại!',
        confirmText: 'OK',
        variant: 'danger',
        showCancel: false,
      })
      setIsLoading(null)
    }
    reader.readAsText(file)
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="backup-restore-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-950 text-amber-600 rounded-lg">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 id="backup-restore-title" className="text-lg font-bold text-text-main">Sao Lưu & Khôi Phục Dữ Liệu</h2>
              <p className="text-xs text-text-muted">Giúp Admin Giáo xứ bảo vệ dữ liệu hoạt động (học sinh, lớp, điểm số, điểm danh, kỳ thi) chỉ với 1-Click</p>
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

          {/* A07: Re-authentication — bắt buộc nhập mật khẩu admin hiện tại */}
          <div className="p-4 rounded-xl border border-surface-border bg-surface-hover/20 space-y-2">
            <div>
              <label htmlFor="admin-password-confirm" className="block text-xs font-semibold text-text-muted mb-1">
                Mật Khẩu Admin (xác nhận)
              </label>
              <input
                id="admin-password-confirm"
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="Nhập mật khẩu đăng nhập của bạn"
                autoComplete="current-password"
                className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary/50"
              />
            </div>
            <p className="text-xs text-text-muted">Nhập lại mật khẩu để xác nhận thao tác sao lưu / khôi phục dữ liệu.</p>
          </div>

          {/* Action 1: Backup */}
          <div className="p-4 rounded-xl border border-surface-border bg-surface-hover/20 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-main">Tạo Bản Sao Lưu Dữ Liệu</h3>
                <p className="text-xs text-text-muted">Tải file sao lưu an toàn về máy tính (parish-lms-backup-YYYY-MM-DD.json)</p>
              </div>
            </div>
            <button
              onClick={handleExportBackup}
              disabled={isLoading === 'export'}
              className="w-full py-2.5 px-4 rounded-lg bg-parish-primary hover:bg-parish-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              {isLoading === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isLoading === 'export' ? 'Đang sao lưu...' : 'Sao lưu dữ liệu'}</span>
            </button>
          </div>

          {/* Action 2: Restore */}
          <div className="p-4 rounded-xl border border-surface-border bg-surface-hover/20 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-main">Khôi Phục Dữ Liệu</h3>
                <p className="text-xs text-text-muted">Nạp lại dữ liệu từ file sao lưu khi đổi máy tính hoặc khôi phục hỏng hóc</p>
              </div>
            </div>
            <label className={`flex items-center justify-center w-full py-2.5 px-4 rounded-lg border border-amber-500/50 ${isLoading === 'import' ? 'bg-amber-500/20 cursor-wait' : 'bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer'} text-amber-700 text-xs font-bold transition-colors`}>
              {isLoading === 'import' ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang khôi phục dữ liệu...</>
              ) : (
                <span>Khôi phục dữ liệu (Chọn file)</span>
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
      {confirmDialog}
    </div>
  )
}
