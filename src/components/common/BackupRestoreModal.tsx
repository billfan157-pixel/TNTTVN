import React, { useState } from 'react'
import { Database, Download, Upload, CheckCircle, Loader2 } from 'lucide-react'
import { httpFetch } from '../../lib/api'
import { resetClientData } from '../../lib/resetClientData'
import { getOwnUnsettledSyncOperations } from '../../stores/syncStore'
import { useAuthStore } from '../../stores/authStore'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import * as Sentry from '@sentry/react'
import { ModalShell } from './ModalShell'

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

  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

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

        // A destructive replacement cannot safely race this device's durable
        // intent. Failed/processing rows count too: both may be retried later.
        const unsettled = await getOwnUnsettledSyncOperations()
        if (unsettled.length > 0) {
          setStatusMessage(`Không thể khôi phục khi thiết bị còn ${unsettled.length} thay đổi chưa hoàn tất. Hãy đồng bộ hoặc xử lý các thay đổi này trước.`)
          setIsLoading(null)
          return
        }

        const restoreRes = await httpFetch.post<any>('/backup/restore', { ...parsed, adminPassword: adminPassword.trim() })

        // The uploaded JSON is command input, never a local read model. Server
        // restore advances the durable client generation so this device and all
        // other devices must discard pre-restore caches/queues before syncing.
        try {
          if (!Number.isFinite(restoreRes.purgeVersion)) throw new Error('Server không trả client data generation sau restore')
          await resetClientData(restoreRes.purgeVersion)
          useAuthStore.getState().logout()
        } catch (resetError) {
          Sentry.captureException(resetError)
          setStatusMessage('Khôi phục trên máy chủ đã thành công, nhưng thiết bị chưa thể cách ly dữ liệu cũ. Không thực hiện lại restore; hãy tải lại trang và xử lý cảnh báo đồng bộ.')
          setAdminPassword('')
          return
        }

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
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        icon={<Database className="w-5 h-5 text-parish-primary" />}
        title="Sao Lưu & Khôi Phục Dữ Liệu"
        subtitle="Giúp Admin Giáo xứ bảo vệ dữ liệu hoạt động chỉ với 1-Click"
        maxWidth="32rem"
      >
        <div className="space-y-5">
          {statusMessage && (
            <div className="p-3 bg-parish-success-bg border border-parish-success/30 text-parish-success-hover rounded-lg text-xs font-semibold flex items-center gap-2">
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
              <div className="p-2 rounded-lg bg-parish-primary-light text-parish-primary">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-main">Tạo Bản Sao Lưu Dữ Liệu</h3>
                <p className="text-xs text-text-muted">Tải file sao lưu an toàn về máy tính (.json)</p>
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
              <div className="p-2 rounded-lg bg-parish-warning-bg text-parish-warning-hover">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-main">Khôi Phục Dữ Liệu</h3>
                <p className="text-xs text-text-muted">Nạp lại dữ liệu từ file sao lưu khi đổi máy hoặc khắc phục sự cố</p>
              </div>
            </div>
            <label className={`flex items-center justify-center w-full py-2.5 px-4 rounded-lg border border-parish-warning/40 ${isLoading === 'import' ? 'bg-parish-warning-bg cursor-wait' : 'bg-parish-warning-bg hover:bg-parish-warning-bg/80 cursor-pointer'} text-parish-warning-hover text-xs font-bold transition-colors`}>
              {isLoading === 'import' ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang khôi phục dữ liệu...</>
              ) : (
                <span>Khôi phục dữ liệu (Chọn file)</span>
              )}
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" disabled={isLoading === 'import'} />
            </label>
          </div>
        </div>
      </ModalShell>
      {confirmDialog}
    </>
  )
}
