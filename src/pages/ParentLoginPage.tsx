import React, { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock, Phone, AlertCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { ParentForgotPasswordModal } from '../components/auth/ParentForgotPasswordModal'
import { LoginShell } from '../components/auth/LoginShell'
import { Button, IconButton } from '../components/common/ui/Button'
import { TextInput } from '../components/common/ui/FormControls'

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
          <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{portalError}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="parent-phone" className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Số Điện Thoại Phụ Huynh</label>
          <div className="relative">
            <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <TextInput
              type="tel"
              id="parent-phone"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="next"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              autoComplete="username"
              className="w-full !pl-10"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="parent-password" className="block text-xs font-semibold text-text-muted uppercase">Mật Khẩu</label>
            <Button
              onClick={() => setIsForgotModalOpen(true)}
              variant="plain"
              size="sm"
              className="min-h-11 px-2 text-xs text-parish-primary hover:underline"
            >
              Quên mật khẩu?
            </Button>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <TextInput
              ref={passwordInputRef}
              id="parent-password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              autoComplete="current-password"
              className="w-full !pl-10 !pr-11"
            />
            <IconButton
              label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              icon={showPassword ? <EyeOff aria-hidden="true" className="w-4 h-4" /> : <Eye aria-hidden="true" className="w-4 h-4" />}
              onClick={() => setShowPassword(!showPassword)}
              size="lg"
              variant="plain"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
            />
          </div>
        </div>

        <Button
          type="submit"
          loading={isLoading}
          loadingLabel="Đang đăng nhập..."
          variant="primary"
          size="lg"
          fullWidth
          className="disabled:opacity-50"
        >
          Đăng Nhập Ngay
        </Button>
      </form>

      <div className="text-center pb-6 -mt-2 px-6 space-y-3">
        <p className="text-xs text-text-muted">
          Quý Phụ Huynh quên mật khẩu?{' '}
          <Button
            onClick={() => setIsForgotModalOpen(true)}
            variant="plain"
            size="sm"
            className="min-h-11 px-1 text-parish-primary hover:underline"
          >
            Nhắn Zalo để được hỗ trợ
          </Button>
        </p>
        <Button
          onClick={() => navigate({ to: '/login' })}
          variant="plain"
          size="sm"
          leadingIcon={<ArrowLeft aria-hidden="true" className="w-3.5 h-3.5" />}
          className="min-h-11 gap-1.5 px-2 text-xs text-parish-primary hover:underline"
        >
          Chọn cổng đăng nhập khác
        </Button>
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
