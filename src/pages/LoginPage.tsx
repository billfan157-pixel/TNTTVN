import { useNavigate } from '@tanstack/react-router'
import { LogIn, HeartHandshake, GraduationCap, ChevronRight } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <main className="auth-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-hero">
          <div className="auth-hero__mark">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="auth-hero__title">Xứ Đoàn Thiếu Nhi Thánh Thể</h1>
          <p className="auth-hero__subtitle">Vui lòng chọn cổng đăng nhập phù hợp</p>
        </div>

        {/* Portal chooser */}
        <div className="p-8 space-y-4">
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
