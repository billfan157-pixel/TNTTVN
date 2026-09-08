import React from 'react'

export interface SubpageHeaderProps {
  icon: React.ReactNode
  title: React.ReactNode
  titleId?: string
  eyebrow?: React.ReactNode
  meta?: React.ReactNode
  badge?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
  ariaLabel?: string
}

/**
 * SubpageHeader — Chuẩn hóa khung tiêu đề cho các subpage / subtabs (DS v4.5)
 * Cung cấp bố cục đồng bộ 100% gồm:
 * - Icon tile 32×32px
 * - Eyebrow tùy chọn (tiền đề ngữ cảnh) 11px
 * - Tiêu đề 16px font-bold (Title Case)
 * - Dòng ngữ cảnh / meta 12px text-muted
 * - Badge trạng thái
 * - Cụm nút hành động nhanh bên phải (32px / btn-sm)
 * - Khối thanh công cụ / bộ lọc tùy chọn bên dưới (children)
 */
export const SubpageHeader: React.FC<SubpageHeaderProps> = ({
  icon,
  title,
  titleId,
  eyebrow,
  meta,
  badge,
  actions,
  className = '',
  children,
  ariaLabel,
}) => {
  return (
    <section
      className={`subpage-header ${className}`.trim()}
      aria-label={ariaLabel || (typeof title === 'string' ? title : undefined)}
    >
      <div className="subpage-header__main">
        <div className="subpage-header__identity">
          <div className="subpage-header__icon" aria-hidden="true">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="subpage-header__eyebrow truncate">
                {eyebrow}
              </p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 id={titleId} className="subpage-header__title truncate">
                {title}
              </h2>
              {badge && <div className="subpage-header__badge">{badge}</div>}
            </div>
            {meta && (
              <div className="subpage-header__meta truncate">
                {meta}
              </div>
            )}
          </div>
        </div>

        {actions && (
          <div className="subpage-header__actions">
            {actions}
          </div>
        )}
      </div>

      {children && (
        <div className="subpage-header__toolbar">
          {children}
        </div>
      )}
    </section>
  )
}

export default SubpageHeader
