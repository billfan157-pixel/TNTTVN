import React from 'react'
import { useState, useEffect } from 'react'
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { validatePassword, SPECIAL_CHAR_REGEX } from '../../utils/passwordValidation'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export function ForcePasswordChangeModal() {
  const { requiresPasswordChange, changePassword, isLoading, error, clearError, user } = useAuthStore()
  // PHA 1 (audit A19): focus trap — gate modal bắt buộc đổi mật khẩu
  const trapRef = useFocusTrap(requiresPasswordChange)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!requiresPasswordChange) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [requiresPasswordChange])

  if (!requiresPasswordChange) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    clearError()

    if (newPassword !== confirmPassword) {
      setLocalError('Mật khẩu xác nhận không khớp!')
      return
    }

    const validation = validatePassword(newPassword)
    if (validation) {
      setLocalError(validation)
      return
    }

    if (currentPassword === newPassword) {
      setLocalError('Mật khẩu mới phải khác mật khẩu hiện tại!')
      return
    }

    const ok = await changePassword(currentPassword, newPassword)
    if (ok) {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    }
  }

  const displayError = localError || error

  const strengthChecks = [
    { label: 'Ít nhất 8 ký tự', ok: newPassword.length >= 8 },
    { label: 'Có chữ HOA (A-Z)', ok: /[A-Z]/.test(newPassword) },
    { label: 'Có chữ số (0-9)', ok: /[0-9]/.test(newPassword) },
    { label: 'Có ký tự đặc biệt (!@#$...)', ok: SPECIAL_CHAR_REGEX.test(newPassword) },
  ]

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="force-password-title" className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div ref={trapRef} className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-500 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-xs rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 id="force-password-title" className="text-lg font-bold">Đổi Mật Khẩu Bắt Buộc</h2>
              <p className="text-xs text-white/80">Xin chào {user?.fullName}, vui lòng đặt mật khẩu mới để tiếp tục.</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {displayError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-600 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Đổi mật khẩu thành công! Đang chuyển hướng...</span>
            </div>
          )}

          {/* Current Password */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Mật Khẩu Hiện Tại</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3 text-text-muted" />
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Nhập mật khẩu được cấp..."
                className="w-full pl-10 pr-10 py-2.5 bg-surface-hover/30 border border-surface-border rounded-xl text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-3 text-text-muted hover:text-text-main">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Mật Khẩu Mới</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3 text-text-muted" />
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới..."
                className="w-full pl-10 pr-10 py-2.5 bg-surface-hover/30 border border-surface-border rounded-xl text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-3 text-text-muted hover:text-text-main">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Password Strength */}
          {newPassword && (
            <div className="space-y-1">
              {strengthChecks.map((check, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs ${check.ok ? 'text-emerald-600' : 'text-text-muted'}`}>
                  <span>{check.ok ? '✓' : '○'}</span>
                  <span>{check.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">Xác Nhận Mật Khẩu Mới</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3 text-text-muted" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface-hover/30 border border-surface-border rounded-xl text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-rose-500 mt-1">Mật khẩu xác nhận không khớp</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Đổi Mật Khẩu & Tiếp Tục</span>}
          </button>
        </form>
      </div>
    </div>
  )
}
