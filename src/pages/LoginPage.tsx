import React, { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LogIn, Lock, User, AlertCircle, Loader2 } from 'lucide-react'
import { api, setTokens } from '../lib/api'
import * as Sentry from '@sentry/react'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setError('Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu!')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await api.login(username, password)
      if (res && res.accessToken) {
        setTokens(res.accessToken, res.refreshToken)
        localStorage.setItem('parish_current_user', JSON.stringify(res.user))
        navigate({ to: '/dashboard' })
      } else {
        setError('Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin!')
      }
    } catch (err: any) {
      Sentry.captureException(err)
      setError(err?.message || 'Tên đăng nhập hoặc mật khẩu không chính xác!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-app flex items-center justify-center p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-parish-primary p-8 text-white text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/10 backdrop-blur-xs rounded-2xl flex items-center justify-center">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Xứ Đoàn Thiếu Nhi Thánh Thể</h1>
          <p className="text-xs text-white/80 mt-1">Đăng nhập Hệ Thống Quản Lý Giáo Lý & Chuyên Cần</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="p-8 space-y-5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Tên Đăng Nhập (Username)</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-3.5 text-text-muted" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên đăng nhập..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface-hover/30 border border-surface-border rounded-xl text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Mật Khẩu</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-text-muted" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface-hover/30 border border-surface-border rounded-xl text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-parish-primary hover:bg-parish-primary-hover text-white text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Đăng Nhập Ngay</span>}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
