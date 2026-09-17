import { useNavigate } from '@tanstack/react-router'
import { HeartHandshake, GraduationCap, ChevronRight } from 'lucide-react'
import appLogo from '../assets/app-logo-192.png'
import { useAuthStore } from '../stores/authStore'

export function LoginPage() {
  const navigate = useNavigate()
  const error = useAuthStore(state => state.error)
  const isLoading = useAuthStore(state => state.isLoading)

  return (
    <main className="auth-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-hero">
          <div className="auth-hero__mark">
            <img src={appLogo} alt="Logo Catevia" className="w-full h-full object-cover" />
          </div>
          <h1 className="auth-hero__title">Catevia</h1>
          <div className="auth-hero__subtitle-wrap">
            <span className="auth-hero__subtitle">
              <span className="auth-hero__subtitle-dot" aria-hidden="true" />
              Quản lý Giáo lý &amp; Thiếu Nhi Thánh Thể
            </span>
          </div>
        </div>

        {/* Portal chooser */}
        <div className="p-8 space-y-4">
          {isLoading && <p role="status" className="text-sm text-text-muted">Đang kết thúc phiên đăng nhập…</p>}
          {error && <p role="alert" className="text-sm text-parish-danger">{error}</p>}
          <button
            type="button"
            onClick={() => navigate({ to: '/login/phuhuynh' })}
            className="auth-option group"
          >
            <div className="w-12 h-12 rounded-xl bg-parish-primary/15 text-parish-primary flex items-center justify-center shrink-0">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-main">Cổng Phụ Huynh</p>
              <p className="text-xs text-text-muted mt-0.5">Xem điểm, chuyên cần và xin phép nghỉ cho con</p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-parish-primary transition-colors shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigate({ to: '/login/nhan-su' })}
            className="auth-option group"
          >
            <div className="w-12 h-12 rounded-xl bg-parish-primary/15 text-parish-primary flex items-center justify-center shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-main">Giáo Lý Viên / Nhân Sự</p>
              <p className="text-xs text-text-muted mt-0.5">Quản lý thiếu nhi, điểm danh, bảng điểm và báo cáo</p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-parish-primary transition-colors shrink-0" />
          </button>
        </div>
      </div>
    </main>
  )
}

export default LoginPage
