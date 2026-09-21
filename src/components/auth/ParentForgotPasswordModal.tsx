import React, { useEffect, useId, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, MessageCircle, Send, ShieldCheck } from 'lucide-react'
import { Button } from '../common/ui/Button'
import { TextInput } from '../common/ui/FormControls'
import { ModalShell } from '../common/ModalShell'
import { api } from '../../lib/api'
import { isValidVnPhone, parentUsername } from '../../utils/username'

interface ParentForgotPasswordModalProps {
  isOpen: boolean
  onClose: () => void
  initialPhone?: string
}

export const ParentForgotPasswordModal: React.FC<ParentForgotPasswordModalProps> = ({ isOpen, onClose, initialPhone = '' }) => {
  const phoneId = useId()
  const [phone, setPhone] = useState('')
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setPhone(initialPhone)
    setError('')
    setSuccessMessage('')
    setSubmitting(false)
  }, [initialPhone, isOpen])

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

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault()
    const normalizedPhone = parentUsername(phone)
    if (!isValidVnPhone(normalizedPhone)) {
      setError('Số điện thoại phải có 10 chữ số và bắt đầu bằng 0.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const result = await api.requestParentPasswordReset(normalizedPhone)
      setSuccessMessage(result.message)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể gửi yêu cầu. Vui lòng thử lại sau.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={<ShieldCheck aria-hidden="true" className="h-5 w-5 text-parish-primary" />}
      title="Khôi Phục Tài Khoản An Toàn"
      subtitle="Ban Giáo Lý sẽ xác minh danh tính trước khi cấp mật khẩu tạm."
      maxWidth="32rem"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg p-3 text-xs leading-relaxed text-text-main">
          Yêu cầu này không tự đổi mật khẩu. Admin sẽ xác minh danh tính trước khi cấp mật khẩu tạm qua kênh riêng; hệ thống không dùng tên hoặc ngày sinh của trẻ để xác thực.
        </div>

        {successMessage ? (
          <div role="status" className="rounded-xl border border-parish-success/30 bg-parish-success-bg p-4 text-sm leading-relaxed text-text-main">
            <div className="mb-1 flex items-center gap-2 font-bold text-parish-success-hover">
              <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> Đã tiếp nhận yêu cầu
            </div>
            {successMessage}
          </div>
        ) : (
          <form onSubmit={submitRequest} className="space-y-3">
            <label htmlFor={phoneId} className="block text-xs font-semibold uppercase text-text-secondary">
              Số điện thoại đăng nhập
              <TextInput id={phoneId} value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="username" placeholder="Ví dụ: 0901234567" className="mt-1.5 w-full rounded-lg" />
            </label>
            {error && <div role="alert" className="text-xs font-semibold text-parish-danger">{error}</div>}
            <Button type="submit" loading={submitting} loadingLabel="Đang gửi yêu cầu..." variant="primary" mobile fullWidth>
              <Send aria-hidden="true" className="h-4 w-4" /> Gửi yêu cầu cho Admin
            </Button>
          </form>
        )}

        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-surface-border" />
          <span className="text-xs font-semibold uppercase text-text-secondary">Hoặc liên hệ trực tiếp</span>
          <span className="h-px flex-1 bg-surface-border" />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase text-text-secondary">Tin nhắn mẫu</div>
          <div className="rounded-xl border border-surface-border bg-surface-hover/50 p-3 text-xs leading-relaxed text-text-main">{message}</div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" onClick={copyMessage} variant="secondary" mobile fullWidth>
            {copied ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-parish-success" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            {copied ? 'Đã sao chép' : 'Sao chép tin nhắn'}
          </Button>
          <Button type="button" onClick={() => window.open('https://zalo.me', '_blank', 'noopener,noreferrer')} variant="secondary" mobile fullWidth>
            <MessageCircle aria-hidden="true" className="h-4 w-4" /> Mở Zalo <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button type="button" onClick={onClose} variant="ghost" mobile fullWidth>Quay lại đăng nhập</Button>
      </div>
    </ModalShell>
  )
}

export default ParentForgotPasswordModal
