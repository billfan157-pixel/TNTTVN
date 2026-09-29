import React from 'react'
import { Landmark, ShieldCheck, Smartphone, WifiOff } from 'lucide-react'

interface TrustPillar {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  title: string
  description: string
}

const PILLARS: TrustPillar[] = [
  {
    icon: WifiOff,
    title: 'Ngoại tuyến (Offline-First)',
    description:
      'Tiếp tục điểm danh và nhập điểm với dữ liệu đã tải trên thiết bị; theo dõi trạng thái đồng bộ khi kết nối trở lại.',
  },
  {
    icon: ShieldCheck,
    title: 'Phân quyền theo vai trò (RBAC)',
    description:
      'Mỗi tài khoản gắn với đúng một vai trò duy nhất. Người dùng chỉ xem và thao tác trên dữ liệu thuộc phạm vi phụ trách.',
  },
  {
    icon: Smartphone,
    title: 'Máy tính & Điện thoại PWA',
    description:
      'Dùng trên máy tính và điện thoại; có thể thêm Catevia vào màn hình chính để truy cập nhanh.',
  },
  {
    icon: Landmark,
    title: 'Dữ liệu thuộc về Giáo xứ',
    description:
      'Thông tin thiếu nhi và gia đình được quản lý trong phạm vi Giáo xứ Gia Tôn, với quyền truy cập theo vai trò và trách nhiệm.',
  },
]

export function LandingTrustStrip() {
  return (
    <section data-landing-scene="trust" data-landing-reveal aria-labelledby="tieu-de-tin-cay" className="landing-trust flex flex-col gap-8">
      <div className="landing-narrative text-center flex flex-col items-center gap-3">
        <span className="landing-eyebrow">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          <span>Nền Tảng Vững Chắc</span>
        </span>
        <h2 id="tieu-de-tin-cay" className="landing-section-title m-0 text-balance">
          Bền bỉ, an toàn và tôn trọng quyền riêng tư
        </h2>
        <p className="landing-lead m-0 text-balance">
          Những công việc hằng tuần cần một nơi rõ ràng, dùng được trên nhiều thiết bị và tôn trọng dữ liệu của gia đình.
        </p>
      </div>

      <div className="landing-trust__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {PILLARS.map((pillar, idx) => (
          <article
            key={pillar.title}
            className="landing-trust__card flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-surface-card border border-surface-border hover:border-parish-primary/40 hover:shadow-lg transition-transform duration-250 group"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-parish-primary-light text-parish-primary flex items-center justify-center shrink-0 border border-parish-primary/15 shadow-xs transition-transform duration-300 group-hover:scale-105">
                  <pillar.icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <span aria-hidden="true" className="text-xs font-serif font-bold text-text-muted px-2 py-0.5 rounded-full bg-surface-app border border-surface-border/60 tracking-wider">
                  0{idx + 1}
                </span>
              </div>
              <div>
                <h3 className="m-0 text-base font-bold text-text-main group-hover:text-parish-primary transition-colors tracking-tight">
                  {pillar.title}
                </h3>
                <p className="m-0 mt-2 text-xs sm:text-sm text-text-secondary leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-surface-border/60 flex items-center justify-between text-xs font-semibold text-text-muted group-hover:text-parish-primary transition-colors">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-parish-success" aria-hidden="true" />
                <span>Tiêu chuẩn Catevia</span>
              </span>
              <span className="text-xs uppercase font-bold text-text-muted tracking-wider">Xứ Đoàn</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
