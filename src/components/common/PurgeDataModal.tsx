import React, { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { resetClientData } from '../../lib/resetClientData'
import * as Sentry from '@sentry/react'
import { ModalShell } from './ModalShell'

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
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={<AlertTriangle className="w-5 h-5 text-parish-danger" />}
      title="Xóa Toàn Bộ Dữ Liệu Giáo Xứ"
      subtitle="Hành động KHÔNG THỂ HOÀN TÁC"
      maxWidth="32rem"
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-parish-danger/30 bg-parish-danger-bg text-parish-danger space-y-2">
          <p className="text-sm font-semibold">
            Thao tác này sẽ xóa vĩnh viễn 100% dữ liệu của giáo xứ:
          </p>
          <ul className="text-xs list-disc pl-5 space-y-1 opacity-90">
            <li>Học sinh, lớp học, năm học, điểm số, điểm danh, điểm danh buổi</li>
            <li>Thông báo, lịch sử import, bản ghi lên lớp, khóa học kỳ, tin nhắn chờ gửi</li>
            <li>Một bản snapshot an toàn sẽ được lưu trong máy chủ trước khi xóa</li>
          </ul>
          <p className="text-xs font-medium opacity-90">
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
            className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-danger"
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
            className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-danger"
          />
        </div>

        {error && (
          <div className="p-3 bg-parish-danger-bg border border-parish-danger/30 text-parish-danger rounded-lg text-xs font-semibold">
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
    </ModalShell>
  )
}
