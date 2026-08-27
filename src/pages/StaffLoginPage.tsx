import React, { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock, User, AlertCircle, Loader2, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { LoginShell } from '../components/auth/LoginShell'

export function StaffLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const { login, isLoading, error, clearError } = useAuthStore()

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
    <LoginShell title="Giáo Lý Viên / Nhân Sự" subtitle="Đăng nhập Hệ Thống Quản Lý Giáo Lý & Chuyên Cần">
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
          <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Tên Đăng Nhập</label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3.5 top-3.5 text-text-muted" />
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tên đăng nhập giáo lý viên..."
              autoComplete="username"
              className="form-input w-full pl-10"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Mật Khẩu</label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-text-muted" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              autoComplete="current-password"
              className="form-input w-full pl-10 pr-10"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-text-muted hover:text-text-main">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary btn-lg w-full disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Đăng Nhập Ngay</span>}
        </button>
      </form>

      <div className="text-center pb-6 -mt-2 px-6 space-y-3">
        <p className="text-xs text-text-muted">
          Quên mật khẩu? Vui lòng liên hệ <strong>Quản Trị Viên / Ban Giáo Lý</strong> để được cấp lại mật khẩu tạm.
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
    </LoginShell>
  )
}

export default StaffLoginPage
