import React from 'react'
import {
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  HeartHandshake,
  Landmark,
  MessageSquare,
  TrendingUp,
  Users,
} from 'lucide-react'

export interface LandingWorkspaceStoriesProps {
  activeStory?: 'academic' | 'organization' | 'parent'
}

export function LandingWorkspaceStories({ activeStory = 'academic' }: LandingWorkspaceStoriesProps = {}) {
  return (
    <section aria-labelledby="tieu-de-khong-gian-lam-viec" className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2 pb-2">
        <span className="landing-eyebrow">
          <GraduationCap className="w-4 h-4" aria-hidden="true" />
          <span>Ba Chiều Kích Đồng Hành</span>
        </span>
        <h3 id="tieu-de-khong-gian-lam-viec" className="landing-section-title m-0 text-balance text-xl sm:text-2xl">
          Mỗi không gian phục vụ đúng một sứ mạng
        </h3>
        <p className="landing-lead m-0 text-sm sm:text-base">
          Thay vì một danh mục tính năng rời rạc, Catevia tổ chức công việc theo cách Xứ Đoàn và các gia đình vận hành mỗi tuần.
        </p>
      </div>

      {/* Ray tiến trình kể chuyện dọc (Scrolly Spine Container) */}
      <div className="scrolly-spine">
        {/* ── Story 1: Thiếu Nhi & Học Vụ ── */}
        <div className="scrolly-spine-step">
          <span
            aria-hidden="true"
            className={`scrolly-spine-dot hidden lg:block ${activeStory === 'academic' ? 'is-active' : ''}`}
          />
          <article
            id="story-academic"
            data-story-tab="academic"
            className={`scrolly-story-beat card p-4 sm:p-6 lg:p-8 flex flex-col gap-4 border transition-[opacity,transform,border-color,box-shadow] duration-300 ${
              activeStory === 'academic'
                ? 'border-parish-primary/50 shadow-card-hover opacity-100 scale-100'
                : 'border-surface-border scale-[0.99]'
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-parish-primary uppercase tracking-wide">
                <span className="w-2 h-2 rounded-full bg-parish-primary" aria-hidden="true" />
                <span>Phân hệ 01 · Giáo Lý Viên &amp; Huynh Trưởng</span>
              </div>
              <h3 className="m-0 text-xl sm:text-2xl font-black text-text-main tracking-tight">
                Từ buổi học đến trọn vẹn cả niên khóa
              </h3>
              <p className="m-0 text-sm sm:text-base text-text-secondary leading-relaxed">
                Mọi diễn biến học vụ được ghi nhận nhẹ nhàng và liền mạch: từ hồ sơ đoàn sinh, điểm danh Thánh Lễ Chúa Nhật, đến sổ điểm Giáo lý, ngân hàng câu hỏi thi và quy trình xét thăng tiến ngành TNTT chuẩn mực.
              </p>
              <ul className="m-0 p-0 list-none flex flex-col gap-2.5 pt-1" aria-label="Điểm nổi bật của Học vụ">
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Điểm danh &amp; chuyên cần:</strong> Ghi nhận tức thì trên lớp hoặc ngoài sân nhà thờ, lưu trữ ngoại tuyến khi mất mạng.</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Sổ điểm số hóa:</strong> Tính điểm trung bình môn, xếp loại và in học bạ tự động theo đúng quy chế Giáo lý Xứ Đoàn.</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Xét thăng ngành:</strong> Lịch sử chuyên cần và đạo đức nhiều năm được lưu giữ an toàn, đồng hành suốt thời niên thiếu.</span>
                </li>
              </ul>
            </div>

            {/* Mobile-only preview sample */}
            <div className="block lg:hidden pt-3 border-t border-surface-border">
              <div className="rounded-2xl border border-surface-border bg-surface-app p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-parish-primary-light text-parish-primary flex items-center justify-center font-bold text-xs">
                      GL
                    </div>
                    <div>
                      <p className="m-0 text-xs font-bold text-text-main">Sổ Điểm Giáo Lý &amp; Chuyên Cần</p>
                      <p className="m-0 text-xs text-text-muted">Chi đoàn Thiếu Nhi 2 · Chúa Nhật tuần IV</p>
                    </div>
                  </div>
                  <span className="badge badge-success text-xs">Đã chốt tiết học</span>
                </div>

                <div className="space-y-2">
                  <div className="p-2.5 rounded-xl bg-surface-card border border-surface-border flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-parish-primary-light text-parish-primary font-bold text-xs flex items-center justify-center shrink-0">
                        01
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 font-bold text-text-main truncate">Maria Nguyễn Thị An</p>
                        <p className="m-0 text-xs text-text-muted truncate">Thiếu Nhi 2A · Chuyên cần: 100%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="badge badge-success text-xs">Có mặt</span>
                      <span className="font-mono font-bold text-parish-primary">9.5 đ</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-card border border-surface-border flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-parish-primary-light text-parish-primary font-bold text-xs flex items-center justify-center shrink-0">
                        02
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 font-bold text-text-main truncate">Giuse Trần Minh Quân</p>
                        <p className="m-0 text-xs text-text-muted truncate">Thiếu Nhi 2A · Chuyên cần: 96%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="badge badge-success text-xs">Có mặt</span>
                      <span className="font-mono font-bold text-parish-primary">8.8 đ</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-card border border-surface-border flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-parish-primary-light text-parish-primary font-bold text-xs flex items-center justify-center shrink-0">
                        03
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 font-bold text-text-main truncate">Têrêsa Lê Hoàng Yến</p>
                        <p className="m-0 text-xs text-text-muted truncate">Thiếu Nhi 2A · Có đơn xin phép</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="badge badge-warning text-xs">Có phép</span>
                      <span className="font-mono font-bold text-parish-primary">9.0 đ</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-surface-border flex flex-wrap items-center justify-between gap-1 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-parish-success" aria-hidden="true" />
                    <span>Chuyên cần: 98.2%</span>
                  </span>
                  <span>Tổng: 32 đoàn sinh</span>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* ── Story 2: Xứ Đoàn & Giáo Xứ ── */}
        <div className="scrolly-spine-step">
          <span
            aria-hidden="true"
            className={`scrolly-spine-dot hidden lg:block ${activeStory === 'organization' ? 'is-active' : ''}`}
          />
          <article
            id="story-organization"
            data-story-tab="organization"
            className={`scrolly-story-beat card p-4 sm:p-6 lg:p-8 flex flex-col gap-4 border transition-[opacity,transform,border-color,box-shadow] duration-300 ${
              activeStory === 'organization'
                ? 'border-parish-primary/50 shadow-card-hover opacity-100 scale-100'
                : 'border-surface-border scale-[0.99]'
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-parish-primary uppercase tracking-wide">
                <span className="w-2 h-2 rounded-full bg-parish-secondary" aria-hidden="true" />
                <span>Phân hệ 02 · Ban Điều Hành Xứ Đoàn</span>
              </div>
              <h3 className="m-0 text-xl sm:text-2xl font-black text-text-main tracking-tight">
                Một nơi để toàn thể Xứ Đoàn cùng vận hành
              </h3>
              <p className="m-0 text-sm sm:text-base text-text-secondary leading-relaxed">
                Duy trì sự kết nối chặt chẽ giữa Cha Tuyên Úy, Ban Hành Giáo và Ban Huynh Trưởng: lịch phụng vụ, thông báo mục vụ đến từng chi đoàn, phân công công tác sự kiện và quản trị quỹ minh bạch.
              </p>
              <ul className="m-0 p-0 list-none flex flex-col gap-2.5 pt-1" aria-label="Điểm nổi bật của Xứ Đoàn">
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Lịch Phụng Vụ &amp; Sự Kiện:</strong> Thông báo lịch Lễ Bổn Mạng, tĩnh tâm và các chiến dịch thi đua theo mùa phụng vụ.</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Cơ cấu Ban Huynh Trưởng:</strong> Phân bổ trách vụ rõ ràng giữa Ban Điều Hành, Giáo Lý Viên và Dự Trưởng.</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Minh bạch tài chính:</strong> Theo dõi thu chi quỹ sinh hoạt, quỹ trại và các khoản bác ái của Xứ Đoàn.</span>
                </li>
              </ul>
            </div>

            {/* Mobile-only preview sample */}
            <div className="block lg:hidden pt-3 border-t border-surface-border">
              <div className="rounded-2xl border border-surface-border bg-surface-app p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-5 h-5 text-parish-primary" aria-hidden="true" />
                    <div>
                      <p className="m-0 text-xs font-bold text-text-main">Vận Hành &amp; Mục Vụ Xứ Đoàn</p>
                      <p className="m-0 text-xs text-text-muted">Giáo Xứ Gia Tôn · Niên khóa hiện hành</p>
                    </div>
                  </div>
                  <span className="badge badge-primary text-xs">Ban Điều Hành</span>
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-surface-card border border-surface-border flex items-start gap-3 text-xs">
                    <CalendarDays className="w-4 h-4 text-parish-primary mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="m-0 font-bold text-text-main">Thánh Lễ Bổn Mạng &amp; Khai Giảng Niên Khóa</p>
                      <p className="m-0 text-xs text-text-muted">Chúa Nhật tuần III Phục Sinh · 07:00 tại thánh đường</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-surface-card border border-surface-border flex items-start gap-3 text-xs">
                    <Users className="w-4 h-4 text-parish-secondary mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="m-0 font-bold text-text-main">Họp Ban Điều Hành &amp; Huynh Trưởng</p>
                      <p className="m-0 text-xs text-text-muted">Định kỳ đầu tháng · Đánh giá chuyên cần và thăng tiến ngành</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-surface-card border border-surface-border flex items-start gap-3 text-xs">
                    <FileCheck2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="m-0 font-bold text-text-main">Báo cáo Quỹ Xứ Đoàn &amp; Quỹ Thiếu Nhi</p>
                      <p className="m-0 text-xs text-text-muted">Minh bạch thu chi niên khóa · Công khai trong phiên họp điều hành</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* ── Story 3: Cổng Phụ Huynh ── */}
        <div className="scrolly-spine-step">
          <span
            aria-hidden="true"
            className={`scrolly-spine-dot hidden lg:block ${activeStory === 'parent' ? 'is-active' : ''}`}
          />
          <article
            id="story-parent"
            data-story-tab="parent"
            className={`scrolly-story-beat card p-4 sm:p-6 lg:p-8 flex flex-col gap-4 border transition-[opacity,transform,border-color,box-shadow] duration-300 ${
              activeStory === 'parent'
                ? 'border-parish-primary/50 shadow-card-hover opacity-100 scale-100'
                : 'border-surface-border scale-[0.99]'
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-parish-primary uppercase tracking-wide">
                <span className="w-2 h-2 rounded-full bg-parish-info" aria-hidden="true" />
                <span>Phân hệ 03 · Cổng Phụ Huynh</span>
              </div>
              <h3 className="m-0 text-xl sm:text-2xl font-black text-text-main tracking-tight">
                Phụ huynh luôn biết con mình đang đồng hành thế nào
              </h3>
              <p className="m-0 text-sm sm:text-base text-text-secondary leading-relaxed">
                Xóa tan nỗi lo lắng của cha mẹ về việc con đi lễ, đi học Giáo lý. Với số điện thoại đã đăng ký, phụ huynh theo dõi điểm số, chuyên cần và gửi đơn xin phép vắng học trực tuyến chỉ với vài thao tác.
              </p>
              <ul className="m-0 p-0 list-none flex flex-col gap-2.5 pt-1" aria-label="Điểm nổi bật của Cổng Phụ Huynh">
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Tra cứu điểm &amp; chuyên cần:</strong> Xem chi tiết điểm miệng, 15 phút, học kỳ và lịch sử tham dự Thánh Lễ Chúa Nhật.</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Gửi đơn xin phép trực tuyến:</strong> Khi con ốm hoặc có việc gia đình, phụ huynh gửi đơn ngay trên điện thoại cho GLV.</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-parish-success mt-0.5 shrink-0" aria-hidden="true" />
                  <span><strong>Nhận thông báo mục vụ:</strong> Cập nhật nhanh chóng các thông báo từ Cha Tuyên Úy và Ban Điều Hành Xứ Đoàn.</span>
                </li>
              </ul>
            </div>

            {/* Mobile-only preview sample */}
            <div className="block lg:hidden pt-3 border-t border-surface-border">
              <div className="rounded-2xl border border-surface-border bg-surface-app p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-5 h-5 text-parish-primary" aria-hidden="true" />
                    <div>
                      <p className="m-0 text-xs font-bold text-text-main">Sổ Liên Lạc Điện Tử Của Con</p>
                      <p className="m-0 text-xs text-text-muted">Dành riêng cho gia đình · Đăng nhập bảo mật</p>
                    </div>
                  </div>
                  <span className="badge badge-success text-xs">Đang theo học</span>
                </div>

                <div className="p-3.5 rounded-xl bg-parish-primary-light border border-parish-primary/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Chuyên cần Thánh lễ:</span>
                    <span className="font-bold text-parish-success flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> 100% đầy đủ
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Điểm TB Giáo lý:</span>
                    <span className="font-extrabold text-parish-primary">8.8 — Giỏi</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Xứ Đoàn:</span>
                    <span className="font-medium text-text-main">Đức Mẹ Fatima · Xứ Gia Tôn</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-card border border-surface-border flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-parish-primary" aria-hidden="true" />
                    <span className="font-medium text-text-main">Đơn xin phép vắng trực tuyến</span>
                  </div>
                  <span className="font-semibold text-parish-primary">Chạm để gửi</span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
