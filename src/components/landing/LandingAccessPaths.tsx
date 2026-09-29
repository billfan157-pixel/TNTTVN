import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, CheckCircle2, GraduationCap, HeartHandshake, QrCode, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

export function LandingAccessPaths() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const isLoggedIn = !!user

  return (
    <section
      id="cong-dang-nhap"
      data-landing-scene="access"
      data-landing-reveal="crest"
      aria-labelledby="tieu-de-cong"
      className="landing-access scroll-mt-20 relative overflow-hidden"
    >
      {/* Background ambient lighting accents */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-brand-gold/5 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-0 left-10 w-60 h-60 bg-parish-primary/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      {/* Intro Header - Compact */}
      <div className="landing-access__intro relative z-10 flex flex-col items-center text-center gap-2 mb-6">
        <span className="landing-eyebrow inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-brand-gold font-semibold text-xs tracking-wider uppercase border border-brand-gold/30">
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          <span>Cùng bắt đầu</span>
        </span>
        <h2 id="tieu-de-cong" className="m-0 text-balance font-extrabold tracking-tight text-white text-2xl sm:text-3xl lg:text-4xl">
          Chọn cổng phù hợp với bạn
        </h2>
        <p className="m-0 text-balance text-white/80 max-w-2xl text-xs sm:text-sm leading-relaxed">
          Hai lối vào, cùng một Xứ Đoàn. Tài khoản do Xứ Đoàn cấp để mỗi người nhìn thấy đúng phần việc của mình.
        </p>
      </div>

      {/* Compact Bento Dual-Wing Layout */}
      <div className="landing-access__grid relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Wing (7 Cols): Two Main Gateways */}
        <div className="lg:col-span-7">
          <div className="landing-access__doors grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
            {/* Door 1: Phụ Huynh */}
            <article className="landing-access__door landing-access__door--parent group flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-surface-card border border-surface-border text-text-main shadow-md hover:shadow-xl transition-transform duration-250">
              <div className="flex flex-col items-start gap-3">
                <span className="landing-access__icon w-11 h-11 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center shrink-0 border border-parish-primary/15 shadow-xs transition-transform duration-300 group-hover:scale-105">
                  <HeartHandshake className="w-5 h-5" aria-hidden="true" />
                </span>

                <div>
                  <p className="landing-access__eyebrow m-0 text-xs font-bold uppercase tracking-wider text-parish-primary">
                    Dành cho gia đình
                  </p>
                  <h3 className="m-0 mt-0.5 text-xl font-black text-text-main tracking-tight">
                    Cổng Phụ Huynh
                  </h3>
                </div>

                <p className="m-0 text-xs text-text-secondary leading-relaxed">
                  Theo dõi chuyên cần, kết quả Giáo lý và gửi đơn xin phép cho con ngay trên điện thoại.
                </p>

                <ul aria-label="Quyền lợi Phụ huynh" className="m-0 p-0 list-none flex flex-col gap-2 w-full pt-1">
                  <li className="flex items-center gap-2 text-xs text-text-secondary">
                    <CheckCircle2 className="w-3.5 h-3.5 text-parish-primary shrink-0" aria-hidden="true" />
                    <span>Thông tin của con trong không gian riêng</span>
                  </li>
                  <li className="flex items-center gap-2 text-xs text-text-secondary">
                    <CheckCircle2 className="w-3.5 h-3.5 text-parish-primary shrink-0" aria-hidden="true" />
                    <span>Giữ kết nối với Giáo Lý Viên</span>
                  </li>
                </ul>
              </div>

              <div className="mt-5 pt-3 border-t border-surface-border/60 w-full">
                <button
                  type="button"
                  onClick={() => navigate({ to: '/login/phuhuynh', viewTransition: true })}
                  style={{ viewTransitionName: 'portal-parent-button' }}
                  className="btn btn-primary min-h-11 w-full justify-center text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-colors rounded-xl"
                >
                  <span>Đăng nhập Phụ huynh</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                </button>
              </div>
            </article>

            {/* Door 2: GLV & Huynh Trưởng */}
            <article className="landing-access__door landing-access__door--staff group flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-surface-card border border-surface-border text-text-main shadow-md hover:shadow-xl transition-transform duration-250">
              <div className="flex flex-col items-start gap-3">
                <span className="landing-access__icon w-11 h-11 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center shrink-0 border border-parish-primary/15 shadow-xs transition-transform duration-300 group-hover:scale-105">
                  <GraduationCap className="w-5 h-5" aria-hidden="true" />
                </span>

                <div>
                  <p className="landing-access__eyebrow m-0 text-xs font-bold uppercase tracking-wider text-parish-primary">
                    Dành cho người phục vụ
                  </p>
                  <h3 className="m-0 mt-0.5 text-xl font-black text-text-main tracking-tight">
                    Cổng GLV &amp; Huynh Trưởng
                  </h3>
                </div>

                <p className="m-0 text-xs text-text-secondary leading-relaxed">
                  Quản lý lớp Giáo lý, điểm danh và điều hành hoạt động Xứ Đoàn theo vai trò phụ trách.
                </p>

                <ul aria-label="Quyền lợi GLV và Huynh Trưởng" className="m-0 p-0 list-none flex flex-col gap-2 w-full pt-1">
                  <li className="flex items-center gap-2 text-xs text-text-secondary">
                    <CheckCircle2 className="w-3.5 h-3.5 text-parish-primary shrink-0" aria-hidden="true" />
                    <span>Một mạch công việc từ lớp học đến Xứ Đoàn</span>
                  </li>
                  <li className="flex items-center gap-2 text-xs text-text-secondary">
                    <CheckCircle2 className="w-3.5 h-3.5 text-parish-primary shrink-0" aria-hidden="true" />
                    <span>Phân quyền theo trách vụ</span>
                  </li>
                </ul>
              </div>

              <div className="mt-5 pt-3 border-t border-surface-border/60 w-full">
                <button
                  type="button"
                  onClick={() => navigate({ to: '/login/nhan-su', viewTransition: true })}
                  style={{ viewTransitionName: 'portal-staff-button' }}
                  className="btn btn-primary min-h-11 w-full justify-center text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-colors rounded-xl"
                >
                  <span>Đăng nhập GLV &amp; Huynh Trưởng</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                </button>
              </div>
            </article>
          </div>
        </div>

        {/* Right Wing (5 Cols): Utility & Onboarding */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Block 1: Verify Certificate */}
          <div className="landing-access__verify flex flex-col sm:flex-row lg:flex-col xl:flex-row items-start sm:items-center lg:items-start xl:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl bg-white/[0.07] border border-white/15 backdrop-blur-sm hover:border-brand-gold/35 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-gold/20 text-brand-gold flex items-center justify-center shrink-0 border border-brand-gold/25 shadow-xs">
                <QrCode className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <span className="block text-xs font-bold text-brand-gold uppercase tracking-wider">
                  Công khai · Không cần đăng nhập
                </span>
                <h3 className="m-0 text-sm sm:text-base font-bold text-white tracking-tight">
                  Xác Thực Chứng Chỉ Giáo Lý
                </h3>
                <p className="m-0 text-xs text-white/75">
                  Kiểm tra chứng nhận qua mã số hoặc mã QR.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate({ to: '/verify' })}
              className="btn btn-secondary min-h-11 text-xs font-bold text-white bg-white/10 hover:bg-white/20 border-white/20 shrink-0 w-full sm:w-auto lg:w-full xl:w-auto justify-center rounded-xl shadow-xs transition-colors"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tra cứu chứng chỉ ngay</span>
            </button>
          </div>

          {/* Block 2: Onboarding 3 Steps & Crescendo */}
          <div className="landing-access__onboarding flex flex-col justify-between flex-1 p-4 sm:p-5 rounded-2xl bg-white/[0.07] border border-white/15">
            <div>
              <h2 id="tieu-de-bat-dau" className="text-base sm:text-lg font-black text-white m-0 tracking-tight">
                Lần đầu đến với Catevia?
              </h2>
              <p className="m-0 mt-1 text-xs text-white/80 leading-relaxed">
                Tài khoản do Xứ Đoàn cấp phát — thông tin của các em luôn thuộc về Xứ Đoàn và được bảo vệ.
              </p>

              <ol className="m-0 p-0 list-none grid grid-cols-3 gap-2 my-3">
                <li className="flex flex-col p-2.5 sm:p-3 rounded-xl bg-white/[0.06] border border-white/15 hover:bg-white/[0.12] transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-base sm:text-lg font-bold text-brand-gold leading-none">01</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-gold/60" aria-hidden="true" />
                  </div>
                  <strong className="mt-1.5 text-xs font-bold text-white">Nhận tài khoản</strong>
                  <p className="m-0 mt-0.5 text-xs text-white/75 leading-tight">
                    Từ Ban Giáo Lý.
                  </p>
                </li>
                <li className="flex flex-col p-2.5 sm:p-3 rounded-xl bg-white/[0.06] border border-white/15 hover:bg-white/[0.12] transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-base sm:text-lg font-bold text-brand-gold leading-none">02</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-gold/60" aria-hidden="true" />
                  </div>
                  <strong className="mt-1.5 text-xs font-bold text-white">Chọn đúng cổng</strong>
                  <p className="m-0 mt-0.5 text-xs text-white/75 leading-tight">
                    Lối vào riêng.
                  </p>
                </li>
                <li className="flex flex-col p-2.5 sm:p-3 rounded-xl bg-white/[0.06] border border-white/15 hover:bg-white/[0.12] transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-base sm:text-lg font-bold text-brand-gold leading-none">03</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-gold/60" aria-hidden="true" />
                  </div>
                  <strong className="mt-1.5 text-xs font-bold text-white">Đồng hành mọi nơi</strong>
                  <p className="m-0 mt-0.5 text-xs text-white/75 leading-tight">
                    Máy tính, điện thoại.
                  </p>
                </li>
              </ol>
            </div>

            <div className="pt-2 border-t border-white/15 flex flex-col gap-3">
              <p className="landing-access__privacy m-0 flex items-center gap-1.5 text-xs text-white/75">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-gold shrink-0" aria-hidden="true" />
                <span>Đăng nhập và phân quyền theo vai trò bảo vệ dữ liệu trong phạm vi được giao.</span>
              </p>

              <button
                type="button"
                onClick={() => navigate({ to: '/login', viewTransition: true })}
                className="landing-access__crescendo btn btn-primary min-h-11 w-full justify-center rounded-xl font-bold shadow-md hover:shadow-lg transition-colors text-xs sm:text-sm group"
              >
                <span>{isLoggedIn ? 'Vào hệ thống' : 'Bắt đầu đăng nhập'}</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
