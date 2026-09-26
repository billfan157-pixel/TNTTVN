import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, GraduationCap, HeartHandshake, Search, ShieldCheck } from 'lucide-react'

export function LandingAccessPaths() {
  const navigate = useNavigate()

  return (
    <section id="cong-dang-nhap" data-landing-scene="access" aria-labelledby="tieu-de-cong" className="landing-access scroll-mt-20">
      <div className="landing-access__intro">
        <span className="landing-eyebrow">Cùng bắt đầu</span>
        <h2 id="tieu-de-cong">Chọn cổng phù hợp với bạn</h2>
        <p>Hai lối vào, cùng một Xứ Đoàn. Tài khoản do Xứ Đoàn cấp để mỗi người nhìn thấy đúng phần việc của mình.</p>
      </div>

      <div className="landing-access__doors">
        <article className="landing-access__door landing-access__door--parent">
          <span className="landing-access__icon"><HeartHandshake aria-hidden="true" /></span>
          <p className="landing-access__eyebrow">Dành cho gia đình</p>
          <h3>Cổng Phụ Huynh</h3>
          <p>Theo dõi chuyên cần, kết quả Giáo lý và gửi đơn xin phép cho con ngay trên điện thoại.</p>
          <ul aria-label="Quyền lợi Phụ huynh">
            <li>Thông tin của con trong không gian riêng</li>
            <li>Giữ kết nối với Giáo Lý Viên</li>
          </ul>
          <button type="button" onClick={() => navigate({ to: '/login/phuhuynh', viewTransition: true })} style={{ viewTransitionName: 'portal-parent-button' }} className="btn btn-primary min-h-11">
            Đăng nhập Phụ huynh <ArrowRight aria-hidden="true" />
          </button>
        </article>

        <article className="landing-access__door landing-access__door--staff">
          <span className="landing-access__icon"><GraduationCap aria-hidden="true" /></span>
          <p className="landing-access__eyebrow">Dành cho người phục vụ</p>
          <h3>Cổng GLV &amp; Huynh Trưởng</h3>
          <p>Quản lý lớp Giáo lý, điểm danh và điều hành hoạt động Xứ Đoàn theo vai trò phụ trách.</p>
          <ul aria-label="Quyền lợi GLV và Huynh Trưởng">
            <li>Một mạch công việc từ lớp học đến Xứ Đoàn</li>
            <li>Phân quyền theo trách vụ</li>
          </ul>
          <button type="button" onClick={() => navigate({ to: '/login/nhan-su', viewTransition: true })} style={{ viewTransitionName: 'portal-staff-button' }} className="btn btn-secondary min-h-11">
            Đăng nhập GLV &amp; Huynh Trưởng <ArrowRight aria-hidden="true" />
          </button>
        </article>
      </div>

      <div className="landing-access__verify">
        <div>
          <span>Công khai · Không cần đăng nhập</span>
          <h3>Xác Thực Chứng Chỉ Giáo Lý</h3>
          <p>Kiểm tra chứng nhận qua mã số hoặc mã QR.</p>
        </div>
        <button type="button" onClick={() => navigate({ to: '/verify' })} className="btn btn-secondary min-h-11"><Search aria-hidden="true" />Tra cứu chứng chỉ ngay</button>
      </div>

      <div className="landing-access__onboarding">
        <div>
          <h2 id="tieu-de-bat-dau">Lần đầu đến với Catevia?</h2>
          <p>Tài khoản do Xứ Đoàn cấp phát — thông tin của các em luôn thuộc về Xứ Đoàn và được bảo vệ.</p>
        </div>
        <ol>
          <li><span>01</span><strong>Nhận tài khoản</strong><p>Từ Ban Giáo Lý hoặc Ban Điều Hành Xứ Đoàn.</p></li>
          <li><span>02</span><strong>Chọn đúng cổng</strong><p>Phụ huynh và nhân sự dùng lối vào riêng.</p></li>
          <li><span>03</span><strong>Đồng hành mọi nơi</strong><p>Mở Catevia trên máy tính hoặc điện thoại.</p></li>
        </ol>
        <p className="landing-access__privacy"><ShieldCheck aria-hidden="true" />Đăng nhập và phân quyền theo vai trò bảo vệ dữ liệu trong phạm vi được giao.</p>
      </div>
    </section>
  )
}
