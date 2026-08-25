import React, { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Moon, Sun, Monitor, Smartphone, LogOut, Database, Activity, ChevronRight, Key,
  Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, UserCog, Calendar, BookOpen,
  AlertTriangle, Trash2, Settings, ShieldCheck, Palette, Info, Users
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { FormField } from '../components/common/FormField'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { useTheme } from '../hooks/useTheme'
import { useFilterStore } from '../stores/filterStore'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import { validatePassword } from '../utils/passwordValidation'
import { SystemDiagnosticsModal } from '../components/desktop/SystemDiagnosticsModal'
import { BackupRestoreModal } from '../components/common/BackupRestoreModal'
import { PurgeDataModal } from '../components/common/PurgeDataModal'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị viên',
  chunhiem: 'Chủ nhiệm',
  phuta: 'Phụ tá',
  phuhuynh: 'Phụ huynh',
}

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

  const SectionTitle: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
    <div className="flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-lg bg-parish-primary-light dark:bg-parish-primary/15 text-parish-primary flex items-center justify-center shrink-0">
        {icon}
      </span>
      <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">{text}</h2>
    </div>
  )

  const inputCls = 'w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary transition-shadow'

  return (
    <DesktopAppShell width="wide" className="flex flex-col gap-5">
      <PageHeader
        icon={<Settings className="w-5 h-5" />}
        title="Cài Đặt Hệ Thống"
        description="Tùy chỉnh giao diện hiển thị, thông tin cá nhân và quản trị hệ thống"
      />

      {/* UI-POLISH 2026-08-25: narrow (max-w-3xl) → wide 12-col — màn desktop rộng
          trước đây trống ~800px hai bên, grid 3/2 bị chật. 7/5 cân bằng hơn;
          form giới hạn max-w-lg để giữ nhịp đọc (DS §13 đã cập nhật tier). */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        {/* ─── CỘT TRÁI: tài khoản & bảo mật ─── */}
        <div className="lg:col-span-7 space-y-5 min-w-0">
          <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-4">
            <SectionTitle icon={<UserCog className="w-4 h-4" />} text="Hồ Sơ Cá Nhân" />
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-parish-primary to-parish-primary-hover flex items-center justify-center text-white font-extrabold text-lg shrink-0 shadow-xs">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-text-main truncate">{user?.fullName}</span>
                  <span className={`badge ${role === 'admin' ? 'badge-danger' : role === 'phuhuynh' ? 'badge-neutral' : 'badge-primary'}`}>
                    {ROLE_LABELS[role ?? ''] ?? role}
                  </span>
                </div>
                <div className="text-xs text-text-muted truncate mt-0.5">@{user?.username}{(user as any).phone ? ` · ${(user as any).phone}` : ''}</div>
              </div>
            </div>
            <form onSubmit={handleSaveProfile} className="space-y-3 pt-3 border-t border-surface-border max-w-lg">
              <FormField label="Họ Và Tên" htmlFor="pf-fullname" required>
                <input id="pf-fullname" type="text" autoComplete="name" value={pfFullName} onChange={e => setPfFullName(e.target.value)} required maxLength={100} className={inputCls} />
              </FormField>
              <FormField
                label="Số Điện Thoại"
                htmlFor="pf-phone"
                hint={role === 'phuhuynh' ? 'Số điện thoại là tên đăng nhập và khóa liên kết con — do Ban Giáo Lý quản lý. Vui lòng liên hệ quản trị viên nếu cần đổi.' : undefined}
              >
                {role === 'phuhuynh' ? (
                  <input id="pf-phone" type="text" value={pfPhone} disabled
                    className="w-full px-3 py-2 bg-surface-hover border border-surface-border rounded-lg text-sm text-text-muted focus:outline-hidden cursor-not-allowed" />
                ) : (
                  <input id="pf-phone" type="tel" autoComplete="tel" placeholder="0901234567" value={pfPhone} onChange={e => setPfPhone(e.target.value)} maxLength={20} className={inputCls} />
                )}
              </FormField>
              {pfSuccess && (
                <div className="flex items-center gap-2 text-xs text-emerald-600"><CheckCircle2 size={14} />Đã lưu thông tin cá nhân!</div>
              )}
              {pfError && <div className="flex items-center gap-2 text-xs text-rose-600"><AlertCircle size={14} />{pfError}</div>}
              <button type="submit" disabled={pfLoading} className="btn btn-primary disabled:opacity-50">
                {pfLoading && <Loader2 size={14} className="animate-spin" />}
                <UserCog size={14} />
                <span>Lưu Thông Tin</span>
              </button>
            </form>
          </section>

          <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-4">
            <SectionTitle icon={<Key className="w-4 h-4" />} text="Đổi Mật Khẩu" />
            {cpSuccess ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 rounded-lg border border-emerald-200 text-sm">
                <CheckCircle2 size={16} />
                <span>Đổi mật khẩu thành công! Lần đăng nhập sau vui lòng dùng mật khẩu mới.</span>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                {!isSuperAdmin && (
                  <FormField label="Mật Khẩu Hiện Tại" htmlFor="cp-current" required>
                    <div className="relative">
                      <input id="cp-current" type={cpShow ? 'text' : 'password'} autoComplete="current-password" value={cpCurrent} onChange={e => setCpCurrent(e.target.value)} required
                        className={`${inputCls} pr-9`} />
                      <button type="button" onClick={() => setCpShow(!cpShow)}
                        aria-label={cpShow ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        aria-pressed={cpShow}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors" tabIndex={-1}>
                        {cpShow ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </FormField>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  <FormField label="Mật Khẩu Mới" htmlFor="cp-new" required hint="Tối thiểu 8 ký tự, gồm chữ HOA, số và ký tự đặc biệt">
                    <input id="cp-new" type="password" autoComplete="new-password" value={cpNew} onChange={e => setCpNew(e.target.value)} required minLength={8} className={inputCls} />
                  </FormField>
                  <FormField label="Xác Nhận" htmlFor="cp-confirm" required>
                    <input id="cp-confirm" type="password" autoComplete="new-password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} required minLength={8} className={inputCls} />
                  </FormField>
                </div>
                {cpError && <div className="flex items-center gap-2 text-xs text-rose-600"><AlertCircle size={14} />{cpError}</div>}
                <button type="submit" disabled={cpLoading} className="btn btn-primary disabled:opacity-50">
                  {cpLoading && <Loader2 size={14} className="animate-spin" />}
                  <Key size={14} />
                  <span>Cập Nhật Mật Khẩu</span>
                </button>
              </form>
            )}
          </section>
        </div>

        {/* ─── CỘT PHẢI: giao diện & tiện ích ─── */}
        <div className="lg:col-span-5 space-y-5 min-w-0">
          <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-4">
            <SectionTitle icon={<Palette className="w-4 h-4" />} text="Giao Diện" />
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">Chế Độ Hiển Thị</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { if (theme !== 'light') toggleTheme() }}
                  aria-pressed={theme === 'light'}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    theme === 'light'
                      ? 'bg-parish-primary-light dark:bg-parish-primary/15 border-parish-primary text-parish-primary shadow-xs'
                      : 'border-surface-border text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <Sun size={16} /> Sáng
                </button>
                <button
                  onClick={() => { if (theme !== 'dark') toggleTheme() }}
                  aria-pressed={theme === 'dark'}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    theme === 'dark'
                      ? 'bg-parish-primary-light dark:bg-parish-primary/15 border-parish-primary text-parish-primary shadow-xs'
                      : 'border-surface-border text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <Moon size={16} /> Tối
                </button>
              </div>
            </div>
            <div className="pt-3 border-t border-surface-border">
              <label className="block text-xs font-semibold text-text-muted mb-2">Bố Cục Ưu Tiên</label>
              <div className="grid grid-cols-3 gap-2">
                {viewModes.map(vm => {
                  const Icon = vm.icon
                  const isActive = viewMode === vm.value
                  return (
                    <button
                      key={vm.value}
                      onClick={() => setViewMode(vm.value)}
                      title={vm.label}
                      aria-pressed={isActive}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-[11px] font-semibold transition-all ${
                        isActive
                          ? 'bg-parish-primary-light dark:bg-parish-primary/15 border-parish-primary text-parish-primary shadow-xs'
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

          {role === 'admin' && (
            <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-5 space-y-1">
              <div className="mb-2"><SectionTitle icon={<ShieldCheck className="w-4 h-4" />} text="Quản Trị Nhanh" /></div>
              {[
                { to: '/users' as const, icon: Users, title: 'Tài Khoản', desc: 'GLV, phân công, mật khẩu' },
                { to: '/academic-years' as const, icon: Calendar, title: 'Năm Học', desc: 'Khóa sổ, chốt năm, lên lớp' },
                { to: '/classes' as const, icon: BookOpen, title: 'Lớp Học', desc: 'Tạo lớp theo phân ngành' },
              ].map(link => {
                const Icon = link.icon
                return (
                  <button key={link.to} onClick={() => navigate({ to: link.to })}
                    className="w-full flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-xl hover:bg-surface-hover transition-colors group text-left">
                    <span className="w-8 h-8 rounded-lg bg-parish-primary-light dark:bg-parish-primary/15 text-parish-primary flex items-center justify-center shrink-0">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-text-main group-hover:text-parish-primary transition-colors">{link.title}</span>
                      <span className="block text-[11px] text-text-muted truncate">{link.desc}</span>
                    </span>
                    <ChevronRight size={15} className="text-text-muted shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                )
              })}
            </section>
          )}

          <section className="bg-surface-card border border-surface-border rounded-2xl shadow-card overflow-hidden">
            <div className="px-5 pt-5 pb-2"><SectionTitle icon={<Database className="w-4 h-4" />} text="Dữ Liệu & Hệ Thống" /></div>
            <div className="divide-y divide-surface-border/70 pb-1">
              <button onClick={() => setShowBackup(true)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition-colors group">
                <span className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-surface-hover text-text-muted flex items-center justify-center"><Database size={15} /></span>
                  <span className="text-sm font-medium text-text-main">Sao Lưu & Phục Hồi</span>
                </span>
                <ChevronRight size={16} className="text-text-muted group-hover:text-parish-primary transition-colors" />
              </button>
              {role === 'admin' && (
                <button onClick={() => setShowDiagnostics(true)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition-colors group">
                  <span className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-surface-hover text-text-muted flex items-center justify-center"><Activity size={15} /></span>
                    <span className="text-sm font-medium text-text-main">Chẩn Đoán Hệ Thống</span>
                  </span>
                  <ChevronRight size={16} className="text-text-muted group-hover:text-parish-primary transition-colors" />
                </button>
              )}
              <div className="flex items-center justify-between px-5 py-3">
                <span className="flex items-center gap-3 text-xs text-text-muted">
                  <Info size={13} /> Phiên bản 1.0.0 · Web
                </span>
              </div>
            </div>
          </section>

          {/* UI-POLISH 2026-08-25: Vùng Nguy Hiểm chuyển vào cột phải — full-width
              max-w-7xl trước đây khiến banner kéo dài bất thường. */}
          {role === 'admin' && (
            <section className="bg-surface-card border border-rose-200 dark:border-rose-900 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 dark:bg-rose-950 text-rose-600 rounded-lg">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider m-0">Vùng Nguy Hiểm</h2>
                  <p className="text-xs text-text-muted m-0 mt-0.5">Xóa toàn bộ dữ liệu giáo xứ để bắt đầu năm học mới từ đầu</p>
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

          <button
            onClick={() => { authStore.logout(); navigate({ to: '/login' }) }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-rose-200 text-rose-600 font-semibold hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950 transition-colors"
          >
            <LogOut size={18} />
            Đăng Xuất
          </button>
        </div>
      </div>

      <BackupRestoreModal isOpen={showBackup} onClose={() => setShowBackup(false)} />
      <SystemDiagnosticsModal isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />
      <PurgeDataModal
        isOpen={showPurge}
        onClose={() => setShowPurge(false)}
        onPurged={() => { navigate({ to: '/login' }); window.location.reload() }}
      />
    </DesktopAppShell>
  )
}

export default SettingsPage
