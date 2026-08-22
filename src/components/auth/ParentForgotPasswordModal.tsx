import React, { useState, useEffect } from 'react'
import {
  KeyRound,
  ShieldCheck,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  X,
  User,
  Calendar,
  Phone,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ParentForgotPasswordModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (phone: string) => void
}

export const ParentForgotPasswordModal: React.FC<ParentForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'verify' | 'zalo'>('verify')
  // PHA 1 (audit A19): focus trap
  const trapRef = useFocusTrap(isOpen)

  // Tab 1: Form state
  const [phone, setPhone] = useState('')
  const [childDob, setChildDob] = useState('')
  const [childName, setChildName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Tab 2: Zalo state
  const [zaloPhone, setZaloPhone] = useState('')
  const [copiedZalo, setCopiedZalo] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  if (!isOpen) return null

  const cleanPhone = (phone || zaloPhone).trim()
  const zaloMessage = `Kính chào Ban Giáo Lý Giáo Xứ, tôi là phụ huynh số điện thoại ${cleanPhone || '..................'}, tôi bị quên mật khẩu tài khoản Sổ Điểm Giáo Lý, xin Ban Giáo Lý cấp lại mật khẩu tạm giúp tôi.`

  const handleCopyZalo = async () => {
    try {
      await navigator.clipboard.writeText(zaloMessage)
      setCopiedZalo(true)
      setTimeout(() => setCopiedZalo(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleOpenZalo = () => {
    window.open('https://zalo.me', '_blank', 'noopener,noreferrer')
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (!/^0\d{9}$/.test(phone.trim())) {
      setError('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0 (ví dụ: 0901234567)')
      return
    }
    if (!childDob.trim()) {
      setError('Vui lòng nhập ngày tháng năm sinh của con')
      return
    }
    if (!childName.trim()) {
      setError('Vui lòng nhập Tên Thánh hoặc Họ và Tên của con')
      return
    }
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự')
      return
    }
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|`~]/.test(newPassword)) {
      setError('Mật khẩu phải chứa ít nhất 1 chữ HOA, 1 chữ số và 1 ký tự đặc biệt')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp với mật khẩu mới')
      return
    }

    setLoading(true)
    try {
      const res = await api.parentResetPassword({
        phone: phone.trim(),
        childDob: childDob.trim(),
        childName: childName.trim(),
        newPassword,
      })
      setSuccessMsg(res.message || 'Đặt lại mật khẩu thành công!')
    } catch (err: any) {
      setError(err?.message || 'Thông tin xác minh không khớp. Vui lòng kiểm tra lại ngày sinh và tên của con.')
    } finally {
      setLoading(false)
    }
  }

  const handleFinish = () => {
    onSuccess(phone.trim())
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="parent-forgot-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div ref={trapRef} className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-parish-primary/15 flex items-center justify-center text-parish-primary shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 id="parent-forgot-password-title" className="text-base font-bold text-text-main">Quên Mật Khẩu Phụ Huynh</h2>
              <p className="text-xs text-text-muted">Lấy lại quyền truy cập tài khoản Sổ Điểm</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 border-b border-surface-border bg-surface-hover/20 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('verify')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'verify'
                ? 'bg-surface-card text-parish-primary shadow-xs border border-surface-border'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Tự Đổi (Xác Minh Con)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('zalo')
              if (phone && !zaloPhone) setZaloPhone(phone)
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'zalo'
                ? 'bg-surface-card text-parish-primary shadow-xs border border-surface-border'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Nhắn Zalo Ban Giáo Lý</span>
          </button>
        </div>

        {/* Tab 1: Self Verification */}
        {activeTab === 'verify' && (
          <div className="p-6 space-y-4">
            {successMsg ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-text-main">Đặt Mật Khẩu Thành Công!</h3>
                  <p className="text-xs text-text-muted">
                    Mật khẩu mới của bạn đã được cập nhật. Bạn có thể sử dụng số điện thoại <strong>{phone}</strong> để đăng nhập ngay.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="btn btn-primary w-full py-2.5 font-bold"
                >
                  Đăng Nhập Ngay
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3.5">
                <p className="text-xs text-text-muted leading-relaxed">
                  Nhập số điện thoại và thông tin của một trong các người con để hệ thống tự động xác minh và cho phép bạn đặt mật khẩu mới ngay lập tức.
                </p>

                {error && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* SĐT Phụ Huynh */}
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                    Số Điện Thoại Phụ Huynh
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0901234567"
                      className="w-full pl-9 pr-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                    />
                  </div>
                </div>

                {/* Ngày sinh của con */}
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                    Ngày Tháng Năm Sinh Của Con
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
                    <input
                      type="date"
                      required
                      value={childDob}
                      onChange={(e) => setChildDob(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                    />
                  </div>
                  <span className="text-[11px] text-text-muted mt-0.5 block">
                    (Chọn ngày sinh của bất kỳ người con nào đang học giáo lý)
                  </span>
                </div>

                {/* Tên con */}
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                    Tên Thánh hoặc Họ Tên Của Con
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
                    <input
                      type="text"
                      required
                      value={childName}
                      onChange={(e) => setChildName(e.target.value)}
                      placeholder="VD: Giuse hoặc Nguyễn Văn A"
                      className="w-full pl-9 pr-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                    />
                  </div>
                </div>

                {/* Mật khẩu mới */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                      Mật Khẩu Mới
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Tối thiểu 8 ký tự..."
                        className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-2.5 text-text-muted hover:text-text-main"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                      Nhập Lại Mật Khẩu
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu..."
                      className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-text-muted flex items-start gap-1 pt-1">
                  <ShieldCheck size={13} className="shrink-0 mt-0.5 text-parish-primary" />
                  <span>Mật khẩu cần ít nhất 8 ký tự, gồm chữ HOA, chữ số và ký tự đặc biệt.</span>
                </p>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border">
                  <button type="button" onClick={onClose} className="btn btn-ghost">
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    <span>Xác Minh & Đặt Mật Khẩu</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Tab 2: Zalo Support */}
        {activeTab === 'zalo' && (
          <div className="p-6 space-y-4">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 leading-relaxed flex items-start gap-2">
              <MessageCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                Nếu quý phụ huynh không nhớ thông tin ngày sinh hoặc hồ sơ của con, vui lòng nhắn tin trực tiếp qua <strong>Zalo</strong> cho Giáo lý viên chủ nhiệm hoặc Ban Giáo Lý để được hỗ trợ cấp lại mật khẩu tạm.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                Số Điện Thoại Của Bạn (Để Tạo Tin Nhắn Tự Động)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
                <input
                  type="tel"
                  value={zaloPhone}
                  onChange={(e) => setZaloPhone(e.target.value)}
                  placeholder="Nhập số điện thoại của bạn (vd: 0901234567)"
                  className="w-full pl-9 pr-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                Nội Dung Tin Nhắn Mẫu
              </label>
              <div className="p-3.5 bg-surface-hover/50 border border-surface-border rounded-xl text-xs font-mono text-text-main leading-relaxed relative">
                {zaloMessage}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyZalo}
                className="btn btn-secondary flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
              >
                {copiedZalo ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedZalo ? 'Đã Sao Chép Tin Nhắn!' : 'Sao Chép Tin Nhắn'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenZalo}
                className="btn btn-primary flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Mở Ứng Dụng Zalo</span>
              </button>
            </div>

            <div className="pt-2 border-t border-surface-border text-center">
              <button type="button" onClick={onClose} className="btn btn-ghost text-xs">
                Quay Lại Đăng Nhập
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ParentForgotPasswordModal
