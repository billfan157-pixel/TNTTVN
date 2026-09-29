import React, { type CSSProperties } from 'react'
import { Award } from 'lucide-react'
import { BRANCHES } from '../../constants/branches'

const BRANCH_BORDER_CLASS: Record<string, string> = {
  ChienCon: 'border-t-branch-chiencon',
  AuNhi: 'border-t-branch-aunhi',
  ThieuNhi: 'border-t-branch-thieunhi',
  NghiaSi: 'border-t-branch-nghiasi',
  HiepSi: 'border-t-branch-hiepsi',
}

const BRANCH_ORDER = ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']

const MOTTO_MAP: Record<string, string> = {
  ChienCon: 'Hiền lành',
  AuNhi: 'Vâng lời',
  ThieuNhi: 'Hy sinh',
  NghiaSi: 'Chinh phục',
  HiepSi: 'Dấn thân',
}

export function LandingBranchJourney() {
  const branches = BRANCH_ORDER.map(key => BRANCHES[key]).filter(Boolean)

  return (
    <section id="tieu-de-nganh" data-landing-scene="branches" data-landing-reveal aria-labelledby="heading-nganh-tntt" className="landing-branches flex flex-col gap-8 scroll-mt-20">
      <div className="landing-narrative text-center flex flex-col items-center gap-3">
        <span className="landing-eyebrow">
          <Award className="w-4 h-4" aria-hidden="true" />
          <span>Hành Trình Trưởng Thành Trong Đức Tin</span>
        </span>
        <h2 id="heading-nganh-tntt" className="landing-section-title m-0 text-balance">
          Năm ngành sinh hoạt TNTT
        </h2>
        <p className="landing-lead m-0 text-balance">
          Mỗi ngành một màu khăn quàng, một châm ngôn sống và một bước ngoặt tâm linh trên con đường nên Thánh.
        </p>
      </div>

      {/* Dải hành trình đơn nhất, thích ứng đa thiết bị (Không trùng lặp phần tử DOM) */}
      <div className="landing-branches__track relative pt-2">
        <ul className="landing-branches__list m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 relative z-10">
          {branches.map((branch, index) => (
            <li
              key={branch.id}
              className={`landing-branches__item flex min-w-0 ${
                index === BRANCH_ORDER.length - 1 ? 'sm:col-span-2 lg:col-span-1' : ''
              }`}
              style={{ '--chapter-color': `var(--color-branch-${branch.id.toLowerCase()})` } as CSSProperties}
            >
              <article
                className={`landing-branches__chapter p-4 sm:p-5 flex flex-col gap-2.5 sm:gap-3 w-full border-t-4 ${
                  BRANCH_BORDER_CLASS[branch.id] ?? 'border-t-parish-primary'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-surface-card border border-surface-border flex items-center justify-center text-xs font-bold text-text-muted shadow-xs">
                    0{index + 1}
                  </span>
                  <span
                    className="text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--chapter-color) 14%, transparent)',
                      color: 'var(--chapter-color)',
                      border: '1px solid color-mix(in srgb, var(--chapter-color) 24%, transparent)',
                    }}
                  >
                    {MOTTO_MAP[branch.id] ?? ''}
                  </span>
                </div>

                <div className="pt-1">
                  <h3 className="m-0 text-base sm:text-lg font-serif font-black text-text-main tracking-tight">
                    {branch.name}
                  </h3>
                  <p className="m-0 mt-1 text-xs font-bold text-parish-primary flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--chapter-color)' }} aria-hidden="true" />
                    <span>{branch.ageRange}</span>
                  </p>
                </div>

                <p className="m-0 text-xs text-text-secondary leading-relaxed flex-1">
                  {branch.description}
                </p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
