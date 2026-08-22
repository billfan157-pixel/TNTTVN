import React from 'react'

/**
 * Container contract cho desktop pages (PHA 2 — audit finding A17).
 *
 * Trước đây mỗi page tự chế container (max-w-7xl / max-w-5xl / max-w-3xl /
 * full-bleed) → màn rộng 2560px trải dài hết cỡ ở Dashboard/Students/Grades
 * trong khi admin pages cap 1280px, không có rule documented nào.
 *
 * Width tiers chuẩn (sẽ document vào DS §13):
 *  - 'full'   : data workspace (Dashboard, Students, Grades, Attendance…) — full bleed
 *  - 'wide'   : admin/directory pages (Finance, Users, AuditLog…) — max-w-7xl
 *  - 'narrow' : form/settings pages — max-w-3xl
 */
export type DesktopPageWidth = 'full' | 'wide' | 'narrow'

const WIDTH_CLASSES: Record<DesktopPageWidth, string> = {
  full: 'w-full',
  wide: 'w-full max-w-7xl mx-auto',
  narrow: 'w-full max-w-3xl mx-auto',
}

interface DesktopAppShellProps {
  width?: DesktopPageWidth
  className?: string
  children: React.ReactNode
}

export const DesktopAppShell: React.FC<DesktopAppShellProps> = ({
  width = 'full',
  className = '',
  children,
}) => (
  <div className={`${WIDTH_CLASSES[width]} ${className}`.trim()}>
    {children}
  </div>
)

export default DesktopAppShell
