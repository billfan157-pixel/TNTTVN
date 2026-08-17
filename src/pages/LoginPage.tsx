import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LogIn, HeartHandshake, GraduationCap, ChevronRight } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-surface-app flex items-center justify-center p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-parish-primary p-8 text-white text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/10 backdrop-blur-xs rounded-2xl flex items-center justify-center">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Xứ Đoàn Thiếu Nhi Thánh Thể</h1>
          <p className="text-xs text-white/80 mt-1">Vui lòng chọn cổng đăng nhập phù hợp</p>
        </div>

        {/* Portal chooser */}
        <div className="p-8 space-y-4">
          <button
            type="button"
            onClick={() => navigate({ to: '/login/phuhuynh' })}
            className="w-full flex items-center gap-4 p-5 bg-surface-hover/40 border border-surface-border rounded-2xl hover:border-parish-primary hover:bg-parish-primary/5 transition-all group text-left"
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
            className="w-full flex items-center gap-4 p-5 bg-surface-hover/40 border border-surface-border rounded-2xl hover:border-parish-primary hover:bg-parish-primary/5 transition-all group text-left"
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
    </div>
  )
}

export default LoginPage