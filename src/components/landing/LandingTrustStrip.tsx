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
      'Điểm danh Thánh lễ và vào điểm Giáo lý trơn tru ngay cả khi nhà thờ mất mạng; tự động đồng bộ an toàn khi có kết nối trở lại.',
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
      'Tương thích hoàn hảo mọi kích thước màn hình. Có thể thêm vào màn hình chính điện thoại để sử dụng tức thì.',
  },
  {
    icon: Landmark,
    title: 'Dữ liệu thuộc về Giáo xứ',
    description:
      'Thông tin thiếu nhi và gia đình thuộc quyền sở hữu trọn vẹn của Giáo xứ Gia Tôn, tôn trọng quyền riêng tư tuyệt đối.',
  },
]

export function LandingTrustStrip() {
  return (
    <section aria-labelledby="tieu-de-tin-cay" className="flex flex-col gap-6">
      <div className="landing-narrative text-center flex flex-col items-center gap-3">
        <span className="landing-eyebrow">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          <span>Nền Tảng Vững Chắc</span>
        </span>
        <h2 id="tieu-de-tin-cay" className="landing-section-title m-0 text-balance">
          Bền bỉ, an toàn và tôn trọng quyền riêng tư
        </h2>
        <p className="landing-lead m-0 text-balance">
          Được thiết kế riêng cho môi trường nhà thờ và sinh hoạt mục vụ, Catevia ưu tiên tính tin cậy cao nhất trong từng thao tác.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PILLARS.map(pillar => (
          <article
            key={pillar.title}
            className="card card-interactive p-4 sm:p-5 lg:p-6 flex flex-col gap-3 border border-surface-border bg-surface-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:shadow-card-hover"
          >
            <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center shrink-0">
              <pillar.icon className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="m-0 text-sm font-bold text-text-main">
                {pillar.title}
              </h3>
              <p className="m-0 mt-1.5 text-xs text-text-secondary leading-relaxed">
                {pillar.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
