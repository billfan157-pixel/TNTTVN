import React from 'react'
import { Award, Layers, DoorOpen, ShieldCheck } from 'lucide-react'

const STATS = [
  {
    number: '5',
    label: 'Ngành sinh hoạt TNTT',
    detail: 'Chiên Con · Ấu · Thiếu · Nghĩa · Hiệp Sĩ',
    icon: Award,
    colorClass: 'text-parish-gold',
    badgeBg: 'bg-parish-gold-light',
    badgeText: 'text-parish-gold',
    accentBorder: 'border-t-2 border-t-parish-gold',
  },
  {
    number: '3',
    label: 'Không gian làm việc',
    detail: 'Học vụ · Xứ đoàn · Cổng Phụ Huynh',
    icon: Layers,
    colorClass: 'text-parish-primary',
    badgeBg: 'bg-parish-primary-light',
    badgeText: 'text-parish-primary',
    accentBorder: 'border-t-2 border-t-parish-primary',
  },
  {
    number: '2',
    label: 'Cổng đăng nhập',
    detail: 'GLV / Huynh Trưởng · Phụ huynh',
    icon: DoorOpen,
    colorClass: 'text-parish-info',
    badgeBg: 'bg-parish-info-bg',
    badgeText: 'text-parish-info',
    accentBorder: 'border-t-2 border-t-parish-info',
  },
  {
    number: '1',
    label: 'Tài khoản — 1 Vai trò',
    detail: 'Đúng công việc, đúng phạm vi',
    icon: ShieldCheck,
    colorClass: 'text-parish-success',
    badgeBg: 'bg-parish-success-bg',
    badgeText: 'text-parish-success',
    accentBorder: 'border-t-2 border-t-parish-success',
  },
] as const

export function LandingStatsStrip() {
  return (
    // Joins the one-shot reveal chain so the proof rail arrives with the same
    // choreography as the sections around it; its four cards stagger via CSS
    // (`.landing-facts` nth-child indices), no motion-only DOM attributes.
    <div
      role="region"
      aria-label="Thông số hệ thống Catevia"
      className="landing-facts"
      data-landing-reveal
    >
      {STATS.map(stat => {
        const Icon = stat.icon
        return (
          <article
            key={stat.label}
            className={`landing-facts__item group ${stat.accentBorder}`}
          >
            <div className="flex items-center justify-between gap-3 w-full">
              <span aria-hidden="true" className={`landing-facts__number ${stat.colorClass}`}>
                {stat.number}
              </span>
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${stat.badgeBg} ${stat.badgeText} shadow-xs transition-transform duration-300 group-hover:scale-110`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              </div>
            </div>
            <div className="min-w-0 mt-3 sm:mt-4">
              <p className="font-extrabold text-text-main text-sm sm:text-base leading-snug">
                {stat.label}
              </p>
              <small className="text-text-secondary text-xs leading-relaxed block mt-1">
                {stat.detail}
              </small>
            </div>
          </article>
        )
      })}
    </div>
  )
}
