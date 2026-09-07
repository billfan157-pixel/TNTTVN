import React from 'react'
import { Award, Layers, LogIn, UserCheck } from 'lucide-react'

interface StatItem {
  number: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const STATS: StatItem[] = [
  {
    number: '5',
    label: 'Ngành sinh hoạt TNTT',
    description: 'Chiên Con · Ấu · Thiếu · Nghĩa · Hiệp Sĩ',
    icon: Award,
  },
  {
    number: '3',
    label: 'Không gian làm việc',
    description: 'Học vụ · Xứ đoàn · Cổng Phụ Huynh',
    icon: Layers,
  },
  {
    number: '2',
    label: 'Cổng đăng nhập',
    description: 'Cổng GLV / Huynh Trưởng & Cổng Phụ Huynh',
    icon: LogIn,
  },
  {
    number: '1',
    label: 'Tài khoản — 1 Vai trò',
    description: 'Phân quyền chặt chẽ, bảo mật đúng phạm vi',
    icon: UserCheck,
  },
]

export function LandingStatsStrip() {
  return (
    <section role="region" aria-label="Thông số hệ thống" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {STATS.map(stat => (
          <article
            key={stat.number + stat.label}
            className="card p-4 sm:p-5 flex flex-col justify-between gap-3 border border-surface-border bg-surface-card"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xl sm:text-4xl font-black tracking-tight text-parish-primary font-mono">
                {stat.number}
              </span>
              <div className="w-8 h-8 rounded-lg bg-parish-primary-light text-parish-primary flex items-center justify-center shrink-0">
                <stat.icon aria-hidden="true" className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="m-0 text-xs sm:text-sm font-extrabold text-text-main">
                {stat.label}
              </p>
              <p className="m-0 mt-0.5 text-xs text-text-muted leading-relaxed">
                {stat.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
