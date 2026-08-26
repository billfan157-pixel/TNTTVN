import React, { useEffect, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ParentForgotPasswordModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ParentForgotPasswordModal: React.FC<ParentForgotPasswordModalProps> = ({ isOpen, onClose }) => {
  const trapRef = useFocusTrap(isOpen)
  const [phone, setPhone] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [isOpen])

  if (!isOpen) return null

  const message = `Kính chào Ban Giáo Lý Giáo Xứ, tôi là phụ huynh số điện thoại ${phone.trim() || '..................'}, tôi quên mật khẩu tài khoản Sổ Điểm Giáo Lý. Xin Ban Giáo Lý xác minh và cấp lại mật khẩu tạm qua kênh riêng giúp tôi.`

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Người dùng vẫn có thể chọn và sao chép nội dung thủ công.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="parent-recovery-title">
      <div ref={trapRef} className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-surface-border p-5">
          <div>
            <h2 id="parent-recovery-title" className="flex items-center gap-2 text-lg font-bold text-text-main">
              <ShieldCheck className="h-5 w-5 text-parish-primary" /> Khôi Phục Tài Khoản An Toàn
            </h2>
            <p className="mt-1 text-xs text-text-muted">Ban Giáo Lý sẽ xác minh danh tính trước khi cấp mật khẩu tạm.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-2 text-text-muted hover:bg-surface-hover"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-text-main">
            Hệ thống không còn dùng ngày sinh hoặc tên của trẻ để tự đặt lại mật khẩu vì những thông tin này có thể bị đoán hoặc biết bởi người khác.
          </div>
          <label className="block text-xs font-semibold uppercase text-text-muted">
            Số điện thoại phụ huynh
            <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="Ví dụ: 0901234567" className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
          </label>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase text-text-muted">Tin nhắn mẫu</div>
            <div className="rounded-xl border border-surface-border bg-surface-hover/50 p-3 text-xs leading-relaxed text-text-main">{message}</div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={copyMessage} className="btn btn-secondary flex items-center justify-center gap-2">
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Đã sao chép' : 'Sao chép tin nhắn'}
            </button>
            <button type="button" onClick={() => window.open('https://zalo.me', '_blank', 'noopener,noreferrer')} className="btn btn-primary flex items-center justify-center gap-2">
              <MessageCircle className="h-4 w-4" /> Mở Zalo <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost w-full">Quay lại đăng nhập</button>
        </div>
      </div>
    </div>
  )
}

export default ParentForgotPasswordModal
