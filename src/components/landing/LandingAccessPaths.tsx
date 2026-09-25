import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  Building2,
  GraduationCap,
  HeartHandshake,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'

export function LandingAccessPaths() {
  const navigate = useNavigate()

  return (
    <section id="cong-dang-nhap" aria-labelledby="tieu-de-cong" className="flex flex-col gap-10 scroll-mt-20">
      <div className="landing-narrative text-center flex flex-col items-center gap-3">
        <span className="landing-eyebrow">
          <UserCheck className="w-4 h-4" aria-hidden="true" />
          <span>Hai Cổng Xác Thực</span>
        </span>
        <h2 id="tieu-de-cong" className="landing-section-title m-0 text-balance">
          Chọn cổng phù hợp với bạn
        </h2>
        <p className="landing-lead m-0 text-balance">
          Mỗi tài khoản gắn với đúng một vai trò duy nhất — hãy vào đúng cổng để thấy đúng không gian làm việc của mình.
        </p>
      </div>

      {/* ── 2 Cổng Xác Thực Chính Thức ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full">
        {/* Cổng 1: GLV & Huynh Trưởng */}
        <article className="card card-interactive p-6 sm:p-8 flex flex-col justify-between gap-5 border border-surface-border">
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-parish-primary-light text-parish-primary flex items-center justify-center">
              <GraduationCap className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="m-0 text-lg font-bold text-text-main">
                Cổng GLV &amp; Huynh Trưởng
              </h3>
              <p className="m-0 mt-1 text-xs sm:text-sm text-text-secondary leading-relaxed">
                Dành cho Giáo Lý Viên, Huynh Trưởng và Ban Điều Hành xứ đoàn. Sau khi đăng nhập, hệ thống sẽ tự động mở đúng không gian thuộc thẩm quyền:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-surface-app border border-surface-border flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-parish-primary shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="m-0 text-xs font-bold text-text-main">Thiếu nhi &amp; Học vụ</p>
                  <p className="m-0 text-xs text-text-muted">Sổ điểm &amp; Điểm danh</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-app border border-surface-border flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-parish-secondary shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="m-0 text-xs font-bold text-text-main">Xứ đoàn &amp; Giáo xứ</p>
                  <p className="m-0 text-xs text-text-muted">Lịch lễ &amp; Điều hành</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate({ to: '/login/nhan-su' })}
              className="btn btn-primary w-full min-h-11 flex items-center justify-center gap-2"
            >
              <span>Đăng nhập GLV &amp; Huynh Trưởng</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </article>

        {/* Cổng 2: Phụ Huynh */}
        <article className="card card-interactive p-6 sm:p-8 flex flex-col justify-between gap-5 border border-surface-border">
          <div className="flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-parish-info-bg text-parish-info flex items-center justify-center">
              <HeartHandshake className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="m-0 text-lg font-bold text-text-main">
                Cổng Phụ Huynh
              </h3>
              <p className="m-0 mt-1 text-xs sm:text-sm text-text-secondary leading-relaxed">
                Dành cho cha mẹ thiếu nhi: đồng hành cùng đời sống đức tin của con, tra cứu điểm số Giáo lý và gửi đơn xin phép vắng học trực tuyến.
              </p>
            </div>

            <ul className="m-0 p-0 list-none flex flex-col gap-2 pt-1" aria-label="Quyền lợi Phụ huynh">
              <li className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-parish-info shrink-0" aria-hidden="true" />
                <span>Theo dõi chuyên cần Thánh lễ Chúa Nhật và giờ học Giáo lý</span>
              </li>
              <li className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-parish-info shrink-0" aria-hidden="true" />
                <span>Xem chi tiết sổ điểm định kỳ và phiếu liên lạc đức tin</span>
              </li>
              <li className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-parish-info shrink-0" aria-hidden="true" />
                <span>Gửi đơn xin phép nghỉ lễ trực tuyến ngay trên điện thoại</span>
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate({ to: '/login/phuhuynh' })}
              className="btn btn-secondary w-full min-h-11 flex items-center justify-center gap-2"
            >
              <span>Đăng nhập Phụ huynh</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </article>
      </div>

      {/* ── Compact Onboarding ── */}
      <div className="card p-6 sm:p-8 flex flex-col gap-5 max-w-5xl mx-auto w-full border border-surface-border">
        <div>
          <h2 id="tieu-de-bat-dau" className="m-0 text-lg sm:text-xl font-extrabold text-text-main">
            Lần đầu đến với Catevia?
          </h2>
          <p className="m-0 mt-1 text-xs sm:text-sm text-text-secondary">
            Tài khoản do xứ đoàn cấp phát — thông tin của các em luôn thuộc về xứ đoàn và được bảo vệ.
          </p>
        </div>

        <ol className="m-0 p-0 list-none grid grid-cols-1 md:grid-cols-3 gap-4">
          <li className="rounded-xl border border-surface-border bg-surface-app p-4 flex flex-col gap-1.5">
            <span className="w-7 h-7 rounded-full bg-parish-primary text-text-inverse text-xs font-bold flex items-center justify-center" aria-hidden="true">
              1
            </span>
            <p className="m-0 text-xs sm:text-sm font-bold text-text-main">Nhận tài khoản</p>
            <p className="m-0 text-xs text-text-secondary leading-relaxed">
              Do Ban Giáo Lý và Ban Điều Hành Xứ Đoàn cấp phát theo danh sách lớp và ban huynh trưởng đã duyệt.
            </p>
          </li>

          <li className="rounded-xl border border-surface-border bg-surface-app p-4 flex flex-col gap-1.5">
            <span className="w-7 h-7 rounded-full bg-parish-primary text-text-inverse text-xs font-bold flex items-center justify-center" aria-hidden="true">
              2
            </span>
            <p className="m-0 text-xs sm:text-sm font-bold text-text-main">Chọn đúng cổng</p>
            <p className="m-0 text-xs text-text-secondary leading-relaxed">
              Giáo Lý Viên dùng Cổng GLV &amp; Huynh Trưởng; phụ huynh dùng Cổng Phụ Huynh với số điện thoại đã đăng ký.
            </p>
          </li>

          <li className="rounded-xl border border-surface-border bg-surface-app p-4 flex flex-col gap-1.5">
            <span className="w-7 h-7 rounded-full bg-parish-primary text-text-inverse text-xs font-bold flex items-center justify-center" aria-hidden="true">
              3
            </span>
            <p className="m-0 text-xs sm:text-sm font-bold text-text-main">Đồng hành mọi nơi</p>
            <p className="m-0 text-xs text-text-secondary leading-relaxed">
              Mở Catevia trên máy tính hoặc điện thoại, có thể thêm vào màn hình chính để truy cập nhanh như ứng dụng.
            </p>
          </li>
        </ol>

        <p className="m-0 flex items-start gap-2 text-xs text-text-muted pt-1 border-t border-surface-border">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-parish-success" aria-hidden="true" />
          <span>
            Đăng nhập được bảo vệ bằng mật khẩu mã hóa và phân quyền chặt chẽ: bảo mật dữ liệu xứ đoàn, an toàn tuyệt đối và tôn trọng sự riêng tư của gia đình.
          </span>
        </p>
      </div>
    </section>
  )
}
