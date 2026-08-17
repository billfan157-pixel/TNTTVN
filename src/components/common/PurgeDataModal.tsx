import React, { useState, useEffect } from 'react'
import { AlertTriangle, X, Loader2, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { resetClientData } from '../../lib/resetClientData'
import * as Sentry from '@sentry/react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onPurged: () => void
}

const CONFIRM_KEY = 'XÓA TẤT CẢ'

export const PurgeDataModal: React.FC<Props> = ({ isOpen, onClose, onPurged }) => {
  const [password, setPassword] = useState('')
  const [confirmKey, setConfirmKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handlePurge = async () => {
    setError('')
    if (confirmKey.trim() !== CONFIRM_KEY) {
      setError(`Bạn phải gõ chính xác "${CONFIRM_KEY}" để xác nhận`)
      return
    }
    setIsLoading(true)
    try {
      const res = await api.purgeAllData(password, confirmKey)
      await resetClientData(res.purgeVersion)
      onPurged()
    } catch (err: any) {
      Sentry.captureException(err)
      setError(err?.message || 'Xóa dữ liệu thất bại')
      setIsLoading(false)
    }
  }

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="purge-data-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 dark:bg-rose-950 text-rose-600 rounded-lg">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 id="purge-data-title" className="text-lg font-bold text-text-main">Xóa Toàn Bộ Dữ Liệu Giáo Xứ</h2>
              <p className="text-xs text-text-muted">Hành động KHÔNG THỂ HOÀN TÁC</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 space-y-2">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
              Thao tác này sẽ xóa vĩnh viễn 100% dữ liệu của giáo xứ:
            </p>
            <ul className="text-xs text-rose-700/90 dark:text-rose-300/80 list-disc pl-5 space-y-1">
              <li>Học sinh, lớp học, năm học, điểm số, điểm danh, điểm danh buổi</li>
              <li>Thông báo, lịch sử import, bản ghi lên lớp, khóa học kỳ, tin nhắn chờ gửi</li>
              <li>Một bản snapshot an toàn sẽ được lưu trong máy chủ trước khi xóa</li>
            </ul>
            <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
              Giữ nguyên: tài khoản người dùng, phân quyền, nhật ký hoạt động, cấu hình hệ thống.
              Sau khi xóa, mọi thiết bị đang đăng nhập sẽ bị đăng xuất và yêu cầu tạo năm học mới.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Mật Khẩu Admin</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu đăng nhập của bạn"
              className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Gõ chính xác "{CONFIRM_KEY}" để xác nhận
            </label>
            <input
              type="text"
              value={confirmKey}
              onChange={e => setConfirmKey(e.target.value)}
              placeholder={CONFIRM_KEY}
              className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-600 rounded-lg text-xs font-semibold">
              {error}
            </div>
          )}

          <button
            onClick={handlePurge}
            disabled={isLoading || !password || confirmKey.trim() !== CONFIRM_KEY}
            className="btn btn-danger w-full text-xs font-bold flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span>{isLoading ? 'Đang xóa toàn bộ dữ liệu...' : 'Xóa Toàn Bộ Dữ Liệu'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
