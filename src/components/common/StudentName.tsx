import React from 'react'

export interface StudentNameProps {
  holyName?: string | null
  fullName?: string | null
  layout?: 'inline' | 'stacked'
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl'
  className?: string
  holyNameClassName?: string
  fullNameClassName?: string
  showEmptyHolyNameDash?: boolean
}

/**
 * Standardized Student Name Component (Tên Thánh + Họ và Tên)
 * Design System SSOT: docs/03_DESIGN_SYSTEM.md §17
 *
 * - Tên Thánh: Spiritual patronal dignity, styled in deep rich brown (text-amber-950 dark:text-amber-400 / #451a03), font-bold.
 * - Họ và Tên: Primary legal/academic identity, styled in high-contrast text-text-main, font-extrabold / font-bold.
 */
export const StudentName: React.FC<StudentNameProps> = React.memo(({
  holyName,
  fullName,
  layout = 'inline',
  size = 'sm',
  className = '',
  holyNameClassName = '',
  fullNameClassName = '',
  showEmptyHolyNameDash = false,
}) => {
  const cleanHolyName = holyName?.trim() || ''
  const cleanFullName = fullName?.trim() || ''

  const sizeMap = {
    xs: {
      holy: 'text-[11px]',
      full: 'text-xs',
      gap: layout === 'inline' ? 'gap-1' : 'gap-0.5',
    },
    sm: {
      holy: 'text-xs',
      full: 'text-[13.5px]',
      gap: layout === 'inline' ? 'gap-1.5' : 'gap-0.5',
    },
    base: {
      holy: 'text-sm',
      full: 'text-base',
      gap: layout === 'inline' ? 'gap-1.5' : 'gap-0.5',
    },
    lg: {
      holy: 'text-base',
      full: 'text-lg',
      gap: layout === 'inline' ? 'gap-2' : 'gap-1',
    },
    xl: {
      holy: 'text-lg',
      full: 'text-xl',
      gap: layout === 'inline' ? 'gap-2' : 'gap-1',
    },
  }

  const { holy: holySize, full: fullSize, gap } = sizeMap[size]

  if (layout === 'stacked') {
    return (
      <div className={`student-name-group student-name-group--stacked flex flex-col min-w-0 ${gap} ${className}`}>
        {(cleanHolyName || showEmptyHolyNameDash) && (
          <span
            className={`student-holy-name ${holySize} font-bold text-amber-950 dark:text-amber-400 leading-tight truncate ${holyNameClassName}`}
          >
            {cleanHolyName || '—'}
          </span>
        )}
        {(cleanHolyName || showEmptyHolyNameDash) && ' '}
        <span
          className={`student-full-name ${fullSize} font-extrabold text-text-main leading-tight truncate ${fullNameClassName}`}
        >
          {cleanFullName}
        </span>
      </div>
    )
  }

  return (
    <span className={`student-name-group student-name-group--inline inline-flex items-baseline min-w-0 max-w-full truncate ${gap} ${className}`}>
      {cleanHolyName ? (
        <span
          className={`student-holy-name ${holySize} font-bold text-amber-950 dark:text-amber-400 shrink-0 ${holyNameClassName}`}
        >
          {cleanHolyName}
        </span>
      ) : showEmptyHolyNameDash ? (
        <span aria-hidden="true" className={`student-holy-name ${holySize} font-medium text-text-muted shrink-0`}>—</span>
      ) : null}
      {(cleanHolyName || showEmptyHolyNameDash) && ' '}
      <span
        className={`student-full-name ${fullSize} font-extrabold text-text-main truncate ${fullNameClassName}`}
      >
        {cleanFullName}
      </span>
    </span>
  )
})

export const StudentHolyName: React.FC<{ holyName?: string | null; size?: 'xs' | 'sm' | 'base' | 'lg'; className?: string }> = ({
  holyName,
  size = 'sm',
  className = '',
}) => {
  const sizeClasses = {
    xs: 'text-[11px]',
    sm: 'text-xs',
    base: 'text-sm',
    lg: 'text-base',
  }
  return (
    <span className={`student-holy-name ${sizeClasses[size]} font-bold text-amber-950 dark:text-amber-400 ${className}`}>
      {holyName?.trim() || '—'}
    </span>
  )
}

export const StudentFullName: React.FC<{ fullName: string; size?: 'xs' | 'sm' | 'base' | 'lg'; className?: string }> = ({
  fullName,
  size = 'base',
  className = '',
}) => {
  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
  }
  return (
    <span className={`student-full-name ${sizeClasses[size]} font-extrabold text-text-main ${className}`}>
      {fullName.trim()}
    </span>
  )
}
