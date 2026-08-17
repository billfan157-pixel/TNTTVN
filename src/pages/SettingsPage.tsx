import React, { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Moon, Sun, Monitor, Smartphone, LogOut, Database, Activity, ChevronRight, Key, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, UserCog, Calendar, BookOpen, AlertTriangle, Trash2, Settings } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { useTheme } from '../hooks/useTheme'
import { useFilterStore } from '../stores/filterStore'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import { validatePassword } from '../utils/passwordValidation'
import { SystemDiagnosticsModal } from '../components/desktop/SystemDiagnosticsModal'
import { BackupRestoreModal } from '../components/common/BackupRestoreModal'
import { PurgeDataModal } from '../components/common/PurgeDataModal'

const SettingsPage: React.FC = () => {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const viewMode = useFilterStore(s => s.viewMode)
  const setViewMode = useFilterStore(s => s.setViewMode)
  const { user, role } = useAuth()
  const authStore = useAuthStore()
  const isSuperAdmin = user?.username === 'bill'
  const [showBackup, setShowBackup] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showPurge, setShowPurge] = useState(false)

  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpConfirm, setCpConfirm] = useState('')
  const [cpShow, setCpShow] = useState(false)
  const [cpLoading, setCpLoading] = useState(false)
  const [cpError, setCpError] = useState('')
  const [cpSuccess, setCpSuccess] = useState(false)

  const [pfFullName, setPfFullName] = useState('')
  const [pfPhone, setPfPhone] = useState('')
  const [pfLoading, setPfLoading] = useState(false)
  const [pfError, setPfError] = useState('')
  const [pfSuccess, setPfSuccess] = useState(false)

  useEffect(() => {
    if (user) {
      setPfFullName(user.fullName || '')
      setPfPhone((user as any).phone || '')
    }
  }, [user])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setPfError('')
    setPfSuccess(false)
    if (!pfFullName.trim()) { setPfError('Họ và tên không được để trống'); return }
    setPfLoading(true)
    try {
      // ADR-039: phụ huynh không tự đổi SĐT — chỉ gửi fullName (server chặn phone)
      const updated = role === 'phuhuynh'
        ? await api.updateProfile(pfFullName.trim(), undefined)
        : await api.updateProfile(pfFullName.trim(), pfPhone.trim())
      useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, fullName: updated.fullName, phone: updated.phone })
      setPfSuccess(true)
    } catch (err: any) {
      setPfError(err.message || 'Cập nhật thông tin thất bại')
    }
    setPfLoading(false)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setCpError('')
    setCpSuccess(false)
    if (cpNew !== cpConfirm) { setCpError('Mật khẩu mới không khớp'); return }
    const passValidation = validatePassword(cpNew)
    if (passValidation) { setCpError(passValidation); return }
    setCpLoading(true)
    try {
      if (isSuperAdmin) {
        // A06 (2026-08-10): re-authentication — superadmin đổi mật khẩu chính mình
        // cũng phải gửi kèm mật khẩu hiện tại (cpCurrent) để server xác minh lại.
        await api.adminChangePassword(user!.id, cpNew, cpCurrent)
      } else {
        await api.changePassword(cpCurrent, cpNew)
      }
      setCpSuccess(true)
      setCpCurrent(''); setCpNew(''); setCpConfirm('')
    } catch (err: any) {
      setCpError(err.message || 'Đổi mật khẩu thất bại')
    }
    setCpLoading(false)
  }

  const viewModes = [
    { value: 'auto' as const, label: 'Tự Động', icon: Monitor },
    { value: 'desktop' as const, label: 'Máy Tính', icon: Monitor },
    { value: 'mobile' as const, label: 'Điện Thoại', icon: Smartphone },
  ]

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <PageHeader
        icon={<Settings className="w-5 h-5" />}
        title="Cài Đặt Hệ Thống"
        description="Tùy chỉnh giao diện hiển thị, thông tin cá nhân và quản trị hệ thống"
      />

      <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-3">
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Tài Khoản</h2>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-parish-primary/20 flex items-center justify-center text-parish-primary font-bold text-lg">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          <div>
            <div className="font-semibold text-text-main">{user?.fullName}</div>
            <div className="text-sm text-text-muted">@{user?.username} · {role === 'admin' ? 'Quản trị viên' : role === 'chunhiem' ? 'Chủ nhiệm' : role === 'phuta' ? 'Phụ tá' : 'Phụ huynh'}</div>
          </div>
        </div>
        <form onSubmit={handleSaveProfile} className="space-y-3 pt-2 border-t border-surface-border">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Họ Và Tên</label>
            <input type="text" value={pfFullName} onChange={e => setPfFullName(e.target.value)} required maxLength={100}
              className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Số Điện Thoại</label>
            {role === 'phuhuynh' ? (
              <>
                <input type="text" value={pfPhone} disabled
                  className="w-full px-3 py-2 bg-surface-hover border border-surface-border rounded-lg text-sm text-text-muted focus:outline-hidden cursor-not-allowed" />
                <p className="text-[11px] text-text-muted mt-1">
                  Số điện thoại là tên đăng nhập và khóa liên kết con — do Ban Giáo Lý quản lý. Vui lòng liên hệ quản trị viên nếu cần đổi.
                </p>
              </>
            ) : (
              <input type="text" placeholder="0901234567" value={pfPhone} onChange={e => setPfPhone(e.target.value)} maxLength={20}
                className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
            )}
          </div>
          {pfSuccess && (
            <div className="flex items-center gap-2 text-xs text-emerald-600"><CheckCircle2 size={14} />Đã lưu thông tin cá nhân!</div>
          )}
          {pfError && <div className="flex items-center gap-2 text-xs text-rose-600"><AlertCircle size={14} />{pfError}</div>}
          <button type="submit" disabled={pfLoading}
            className="btn btn-primary disabled:opacity-50">
            {pfLoading && <Loader2 size={14} className="animate-spin" />}
            <UserCog size={14} />
            <span>Lưu Thông Tin</span>
          </button>
        </form>
      </section>

      <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-4">
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Đổi Mật Khẩu</h2>
        {cpSuccess ? (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 rounded-lg border border-emerald-200 text-sm">
            <CheckCircle2 size={16} />
            <span>Đổi mật khẩu thành công!</span>
          </div>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-3">
            {!isSuperAdmin && (
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Mật Khẩu Hiện Tại</label>
                <div className="relative">
                  <input type={cpShow ? 'text' : 'password'} value={cpCurrent} onChange={e => setCpCurrent(e.target.value)} required
                    className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary pr-8" />
                  <button type="button" onClick={() => setCpShow(!cpShow)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted">
                    {cpShow ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Mật Khẩu Mới</label>
                <input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} required minLength={8}
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Xác Nhận</label>
                <input type="password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} required minLength={8}
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
              </div>
            </div>
            {cpError && <div className="flex items-center gap-2 text-xs text-rose-600"><AlertCircle size={14} />{cpError}</div>}
            <button type="submit" disabled={cpLoading}
              className="btn btn-primary disabled:opacity-50">
              {cpLoading && <Loader2 size={14} className="animate-spin" />}
              <Key size={14} />
              <span>Cập Nhật Mật Khẩu</span>
            </button>
          </form>
        )}
      </section>

      {role === 'admin' && (
        <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Quản Lý Tài Khoản</h2>
            <button onClick={() => navigate({ to: '/users' })}
              className="flex items-center gap-1 text-xs font-medium text-parish-primary hover:underline">
              <UserCog size={14} /> Quản lý chi tiết
            </button>
          </div>
          <p className="text-xs text-text-muted">
            Tạo tài khoản giáo lý viên, đặt/reset mật khẩu, phân công lớp, khóa/mở khóa và xem mật khẩu hiện tại.
          </p>
        </section>
      )}

      {role === 'admin' && (
        <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Năm Học Giáo Lý</h2>
            <button onClick={() => navigate({ to: '/academic-years' })}
              className="flex items-center gap-1 text-xs font-medium text-parish-primary hover:underline">
              <Calendar size={14} /> Quản lý chi tiết
            </button>
          </div>
          <p className="text-xs text-text-muted">
            Khóa sổ điểm học kỳ, kiểm tra dữ liệu, chốt năm học, xét lên lớp và tạo năm học mới.
          </p>
        </section>
      )}

      {role === 'admin' && (
        <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Lớp Học Giáo Lý</h2>
            <button onClick={() => navigate({ to: '/classes' })}
              className="flex items-center gap-1 text-xs font-medium text-parish-primary hover:underline">
              <BookOpen size={14} /> Quản lý chi tiết
            </button>
          </div>
          <p className="text-xs text-text-muted">
            Tạo lớp học theo phân ngành và niên học trước khi nhập danh sách thiếu nhi.
          </p>
        </section>
      )}

      {role === 'admin' && (
        <section className="bg-surface-card border border-rose-200 dark:border-rose-900 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 dark:bg-rose-950 text-rose-600 rounded-lg">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Vùng Nguy Hiểm</h2>
              <p className="text-xs text-text-muted">Xóa toàn bộ dữ liệu giáo xứ để bắt đầu năm học mới từ đầu</p>
            </div>
          </div>
          <button
            onClick={() => setShowPurge(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-rose-300 dark:border-rose-900 text-rose-600 dark:text-rose-400 font-semibold text-sm hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
          >
            <Trash2 size={16} />
            Xóa Toàn Bộ Dữ Liệu Giáo Xứ
          </button>
        </section>
      )}

      <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-4">
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Giao Diện</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon size={20} className="text-text-main" /> : <Sun size={20} className="text-text-main" />}
            <span className="font-medium text-text-main">Chế Độ Tối</span>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-11 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-parish-primary' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-xs transition-transform ${theme === 'dark' ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div>
          <label className="block font-medium text-text-main mb-2">Bố Cục</label>
          <div className="flex gap-2">
            {viewModes.map(vm => {
              const Icon = vm.icon
              const isActive = viewMode === vm.value
              return (
                <button
                  key={vm.value}
                  onClick={() => setViewMode(vm.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    isActive
                      ? 'bg-parish-primary/10 border-parish-primary text-parish-primary'
                      : 'border-surface-border text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <Icon size={16} />
                  {vm.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card overflow-hidden">
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider px-5 pt-5 pb-1">Tiện Ích</h2>
        <div className="divide-y divide-surface-border">
          <button onClick={() => setShowBackup(true)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors text-text-main font-medium">
            <div className="flex items-center gap-3">
              <Database size={18} className="text-text-muted" />
              <span>Sao Lưu & Phục Hồi</span>
            </div>
            <ChevronRight size={16} className="text-text-muted" />
          </button>
          {role === 'admin' && (
            <button onClick={() => setShowDiagnostics(true)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors text-text-main font-medium">
              <div className="flex items-center gap-3">
                <Activity size={18} className="text-text-muted" />
                <span>Chẩn Đoán Hệ Thống</span>
              </div>
              <ChevronRight size={16} className="text-text-muted" />
            </button>
          )}
        </div>
      </section>

      <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-2">
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Ứng Dụng</h2>
        <div className="text-sm text-text-muted space-y-1">
          <div className="flex justify-between"><span>Phiên bản</span><span className="text-text-main">1.0.0</span></div>
          <div className="flex justify-between"><span>Nền tảng</span><span className="text-text-main">Web</span></div>
        </div>
      </section>

      <button
        onClick={() => { authStore.logout(); navigate({ to: '/login' }) }}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-rose-200 text-rose-600 font-semibold hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950 transition-colors"
      >
        <LogOut size={18} />
        Đăng Xuất
      </button>

      <BackupRestoreModal isOpen={showBackup} onClose={() => setShowBackup(false)} />
      <SystemDiagnosticsModal isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />
      <PurgeDataModal
        isOpen={showPurge}
        onClose={() => setShowPurge(false)}
        onPurged={() => { navigate({ to: '/login' }); window.location.reload() }}
      />
    </div>
  )
}

export default SettingsPage
