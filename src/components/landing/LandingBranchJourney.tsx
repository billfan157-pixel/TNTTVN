import React from 'react'
import { Award } from 'lucide-react'
import { BRANCHES } from '../../constants/branches'

const BRANCH_DOT_CLASS: Record<string, string> = {
  ChienCon: 'bg-branch-chiencon',
  AuNhi: 'bg-branch-aunhi',
  ThieuNhi: 'bg-branch-thieunhi',
  NghiaSi: 'bg-branch-nghiasi',
  HiepSi: 'bg-branch-hiepsi',
}

const BRANCH_BORDER_CLASS: Record<string, string> = {
  ChienCon: 'border-t-branch-chiencon',
  AuNhi: 'border-t-branch-aunhi',
  ThieuNhi: 'border-t-branch-thieunhi',
  NghiaSi: 'border-t-branch-nghiasi',
  HiepSi: 'border-t-branch-hiepsi',
}

const BRANCH_BADGE_BORDER: Record<string, string> = {
  ChienCon: 'border-branch-chiencon/30',
  AuNhi: 'border-branch-aunhi/30',
  ThieuNhi: 'border-branch-thieunhi/30',
  NghiaSi: 'border-branch-nghiasi/30',
  HiepSi: 'border-branch-hiepsi/30',
}

const BRANCH_ORDER = ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']

export function LandingBranchJourney() {
  const branches = BRANCH_ORDER.map(key => BRANCHES[key]).filter(Boolean)

  return (
    <section id="tieu-de-nganh" aria-labelledby="heading-nganh-tntt" className="flex flex-col gap-8 scroll-mt-20">
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
      <div className="relative pt-2">
        {/* Đường nối ngang mờ trên desktop */}
        <div
          aria-hidden="true"
          className="hidden lg:block absolute top-9 left-[8%] right-[8%] h-0.5 bg-surface-border -z-0"
        />
        {/* Đường nối quang phổ ngũ sắc kết nối 5 ngành TNTT (Scene 3 Rail) */}
        <div
          aria-hidden="true"
          className="hidden lg:block branch-track-fill branch-track-animated -z-0"
        />

        <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 relative z-10">
          {branches.map((branch, index) => (
            <li key={branch.id} className="flex">
              <article
                className={`card card-interactive p-4 sm:p-5 flex flex-col gap-2.5 sm:gap-3 w-full border-t-4 ${
                  BRANCH_BORDER_CLASS[branch.id] ?? 'border-t-parish-primary'
                } ${BRANCH_BADGE_BORDER[branch.id] ?? ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-surface-app border border-surface-border flex items-center justify-center text-xs font-bold text-text-muted">
                    0{index + 1}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 rounded-full ${
                      BRANCH_DOT_CLASS[branch.id] ?? 'bg-parish-primary'
                    } shadow-xs`}
                  />
                </div>

                <div>
                  <h3 className="m-0 text-sm sm:text-base font-extrabold text-text-main">
                    {branch.name}
                  </h3>
                  <p className="m-0 mt-0.5 text-xs font-semibold text-parish-primary">
                    {branch.ageRange}
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
