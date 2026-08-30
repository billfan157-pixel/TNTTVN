import React, { useId, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ModalPortal } from '../common/ModalPortal'
import { Button, IconButton } from '../common/ui/Button'
import { TextInput } from '../common/ui/FormControls'

interface ParentForgotPasswordModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ParentForgotPasswordModal: React.FC<ParentForgotPasswordModalProps> = ({ isOpen, onClose }) => {
  const { dialogRef, titleId } = useAccessibleDialog(isOpen, onClose)
  const phoneId = useId()
  const [phone, setPhone] = useState('')
  const [copied, setCopied] = useState(false)

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
    <ModalPortal>
    <div className="app-modal-layer fixed inset-0 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-surface-border p-5">
          <div>
            <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-text-main">
              <ShieldCheck aria-hidden="true" className="h-5 w-5 text-parish-primary" /> Khôi Phục Tài Khoản An Toàn
            </h2>
            <p className="mt-1 text-xs text-text-muted">Ban Giáo Lý sẽ xác minh danh tính trước khi cấp mật khẩu tạm.</p>
          </div>
          <IconButton
            onClick={onClose}
            label="Đóng"
            icon={<X aria-hidden="true" className="h-5 w-5" />}
            variant="ghost"
            mobile
            className="rounded-lg text-text-muted"
          />
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-text-main">
            Hệ thống không còn dùng ngày sinh hoặc tên của trẻ để tự đặt lại mật khẩu vì những thông tin này có thể bị đoán hoặc biết bởi người khác.
          </div>
          <label htmlFor={phoneId} className="block text-xs font-semibold uppercase text-text-muted">
            Số điện thoại phụ huynh
            <TextInput id={phoneId} value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="Ví dụ: 0901234567" className="mt-1.5 w-full rounded-lg" />
          </label>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase text-text-muted">Tin nhắn mẫu</div>
            <div className="rounded-xl border border-surface-border bg-surface-hover/50 p-3 text-xs leading-relaxed text-text-main">{message}</div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" onClick={copyMessage} variant="secondary" mobile fullWidth>
              {copied ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-parish-success" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
              {copied ? 'Đã sao chép' : 'Sao chép tin nhắn'}
            </Button>
            <Button type="button" onClick={() => window.open('https://zalo.me', '_blank', 'noopener,noreferrer')} variant="primary" mobile fullWidth>
              <MessageCircle aria-hidden="true" className="h-4 w-4" /> Mở Zalo <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button type="button" onClick={onClose} variant="ghost" mobile fullWidth>Quay lại đăng nhập</Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

export default ParentForgotPasswordModal
