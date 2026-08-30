import type { HTMLAttributes, ReactNode } from 'react'

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet' | 'teal' | 'orange' | 'indigo' | 'purple' | 'syncing' | 'locked' | 'conflict' | 'offline'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  icon?: ReactNode
}
export function Badge({ tone = 'neutral', icon, className = '', children, ...props }: BadgeProps) {
  return (
    <span {...props} className={`badge badge-${tone} ${className}`.trim()}>
      {icon}
      {children}
    </span>
  )
}
