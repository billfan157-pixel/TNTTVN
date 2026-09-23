import React, { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock, User, AlertCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { LoginShell } from '../components/auth/LoginShell'
import { ColdStartNotice } from '../components/common/ColdStartNotice'
import { Button, IconButton } from '../components/common/ui/Button'
import { TextInput } from '../components/common/ui/FormControls'
import { useDelayedNotice } from '../hooks/useDelayedNotice'

export function StaffLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const { login, isLoading, error, clearError } = useAuthStore()
  const showColdStartHint = useDelayedNotice(isLoading)

  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      return
    }
    clearError()
    setPortalError(null)
    const success = await login(username, password)
    if (success) {
      const user = useAuthStore.getState().user
      if (user && user.role === 'phuhuynh') {
        // 1 tài khoản = 1 vai trò (ADR-044): tài khoản Phụ huynh phải dùng Cổng Phụ Huynh
        useAuthStore.getState().logout()
        setPortalError('Tài khoản này là tài khoản Phụ huynh. Vui lòng đăng nhập qua Cổng Phụ Huynh.')
        return
      }
      navigate({ to: '/dashboard' })
    }
  }

  return (
    <LoginShell title="Giáo Lý Viên / Nhân Sự" subtitle="Quản lý Giáo lý & Chuyên cần">
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
          <label htmlFor="staff-username" className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Tên Đăng Nhập</label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <TextInput
              type="text"
              id="staff-username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tên đăng nhập giáo lý viên..."
              autoComplete="username"
              className="w-full !pl-10"
            />
          </div>
        </div>

        <div>
          <label htmlFor="staff-password" className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Mật Khẩu</label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <TextInput
              type={showPassword ? 'text' : 'password'}
              id="staff-password"
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

        {isLoading && showColdStartHint && <ColdStartNotice />}
      </form>

      <div className="text-center pb-6 -mt-2 px-6 space-y-3">
        <p className="text-xs text-text-muted">
          Quên mật khẩu? Vui lòng liên hệ <strong>Quản Trị Viên / Ban Giáo Lý</strong> để được cấp lại mật khẩu tạm.
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
    </LoginShell>
  )
}

export default StaffLoginPage
