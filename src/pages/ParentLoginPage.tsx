import React, { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock, Phone, AlertCircle, Loader2, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { ParentForgotPasswordModal } from '../components/auth/ParentForgotPasswordModal'
import { LoginShell } from '../components/auth/LoginShell'

export function ParentLoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const { login, isLoading, error, clearError } = useAuthStore()

  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone || !password) {
      return
    }
    clearError()
    setPortalError(null)
    const success = await login(phone.trim(), password)
    if (success) {
      const user = useAuthStore.getState().user
      if (user && user.role !== 'phuhuynh') {
        // 1 tài khoản = 1 vai trò (ADR-044): tài khoản nhân sự phải dùng Cổng Giáo Lý Viên / Nhân Sự
        useAuthStore.getState().logout()
        setPortalError('Tài khoản này không phải tài khoản Phụ huynh. Vui lòng đăng nhập qua Cổng Giáo Lý Viên / Nhân Sự.')
        return
      }
      navigate({ to: '/dashboard' })
    }
  }

  return (
    <LoginShell title="Cổng Phụ Huynh" subtitle="Sổ Điểm Giáo Lý — Xem điểm & chuyên cần của con">
      <form onSubmit={handleLogin} className="p-8 space-y-5">
        {portalError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{portalError}</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Số Điện Thoại Phụ Huynh</label>
          <div className="relative">
            <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-text-muted" />
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              autoComplete="username"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-hover/30 border border-surface-border rounded-xl text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-text-muted uppercase">Mật Khẩu</label>
            <button
              type="button"
              onClick={() => setIsForgotModalOpen(true)}
              className="text-xs text-parish-primary hover:underline font-semibold transition-colors"
            >
              Quên mật khẩu?
            </button>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-text-muted" />
            <input
              ref={passwordInputRef}
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              autoComplete="current-password"
              className="w-full pl-10 pr-10 py-2.5 bg-surface-hover/30 border border-surface-border rounded-xl text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-3 top-3 text-text-muted hover:text-text-main">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-parish-primary hover:bg-parish-primary-hover text-white text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Đăng Nhập Ngay</span>}
        </button>
      </form>

      <div className="text-center pb-6 -mt-2 px-6 space-y-3">
        <p className="text-xs text-text-muted">
          Quý Phụ Huynh quên mật khẩu?{' '}
          <button
            type="button"
            onClick={() => setIsForgotModalOpen(true)}
            className="text-parish-primary font-semibold hover:underline"
          >
            Tự đổi hoặc nhắn Zalo hỗ trợ
          </button>
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: '/login' })}
          className="inline-flex items-center gap-1.5 text-xs text-parish-primary font-semibold hover:underline transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Chọn cổng đăng nhập khác</span>
        </button>
      </div>

      {/* Parent Forgot Password Modal */}
      <ParentForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
      />
    </LoginShell>
  )
}

export default ParentLoginPage
