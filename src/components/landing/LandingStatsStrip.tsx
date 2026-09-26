import React from 'react'

const STATS = [
  { number: '5', label: 'Ngành sinh hoạt TNTT', detail: 'Chiên Con · Ấu · Thiếu · Nghĩa · Hiệp Sĩ' },
  { number: '3', label: 'Không gian làm việc', detail: 'Học vụ · Xứ đoàn · Cổng Phụ Huynh' },
  { number: '2', label: 'Cổng đăng nhập', detail: 'GLV / Huynh Trưởng · Phụ huynh' },
  { number: '1', label: 'Tài khoản — 1 Vai trò', detail: 'Đúng công việc, đúng phạm vi' },
] as const

export function LandingStatsStrip() {
  return (
    <div role="region" aria-label="Thông số hệ thống Catevia" className="landing-facts">
      {STATS.map(stat => (
        <article key={stat.label} className="landing-facts__item">
          <span aria-hidden="true">{stat.number}</span>
          <div>
            <p>{stat.label}</p>
            <small>{stat.detail}</small>
          </div>
        </article>
      ))}
    </div>
  )
}
