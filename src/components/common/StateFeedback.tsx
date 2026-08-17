import React from 'react'
import { FolderOpen, SearchX, AlertTriangle, RefreshCw } from 'lucide-react'

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({
  icon: Icon = FolderOpen,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface-card)] ${className}`} role="status">
      <div className="w-12 h-12 mb-3.5 rounded-[var(--radius-full)] bg-[var(--color-surface-hover)] flex items-center justify-center text-[var(--color-text-muted)]">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="typography-section-title mb-1.5">{title}</h3>
      {description && <p className="typography-body-sm max-w-md mb-4 text-[var(--color-text-muted)]">{description}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn btn-primary btn-sm mt-1">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export interface NoResultStateProps {
  title?: string
  description?: string
  resetLabel?: string
  onReset?: () => void
  className?: string
}

export function NoResultState({
  title = 'Không tìm thấy kết quả phù hợp',
  description = 'Vui lòng thử thay đổi từ khóa tìm kiếm hoặc điều chỉnh bộ lọc.',
  resetLabel = 'Xóa bộ lọc',
  onReset,
  className = '',
}: NoResultStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 md:p-10 text-center rounded-[var(--radius-lg)] border border-[var(--color-surface-border)] bg-[var(--color-surface-card)] ${className}`} role="status">
      <div className="w-12 h-12 mb-3 rounded-[var(--radius-full)] bg-[var(--color-parish-info-bg)] flex items-center justify-center text-[var(--color-parish-info)]">
        <SearchX className="w-6 h-6" />
      </div>
      <h3 className="typography-card-title mb-1">{title}</h3>
      <p className="typography-body-sm max-w-sm mb-4 text-[var(--color-text-muted)]">{description}</p>
      {onReset && (
        <button type="button" onClick={onReset} className="btn btn-secondary btn-sm">
          {resetLabel}
        </button>
      )}
    </div>
  )
}

export interface ErrorStateProps {
  title?: string
  message?: string
  retryLabel?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Không thể tải dữ liệu',
  message = 'Đã có lỗi xảy ra trong quá trình truy xuất dữ liệu. Vui lòng kiểm tra kết nối mạng và thử lại.',
  retryLabel = 'Thử lại',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 md:p-10 text-center rounded-[var(--radius-lg)] border border-[var(--color-parish-danger-bg)] bg-[var(--color-surface-card)] ${className}`} role="alert">
      <div className="w-12 h-12 mb-3 rounded-[var(--radius-full)] bg-[var(--color-parish-danger-bg)] flex items-center justify-center text-[var(--color-parish-danger)]">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="typography-card-title text-[var(--color-parish-danger)] mb-1">{title}</h3>
      <p className="typography-body-sm max-w-md mb-4 text-[var(--color-text-muted)]">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export interface SkeletonTableProps {
  rows?: number
  cols?: number
  className?: string
}

export function SkeletonTable({ rows = 5, cols = 4, className = '' }: SkeletonTableProps) {
  return (
    <div className={`table-wrapper ${className}`} role="status" aria-label="Đang tải bảng dữ liệu">
      <table className="w-full border-collapse bg-surface-card text-text-main">
        <thead>
          <tr className="border-b border-[var(--color-surface-border)]">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="p-3" scope="col">
                <div className="skeleton-text w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-surface-card">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-[var(--color-surface-border)]">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="p-3">
                  <div className={`skeleton-text ${c === 0 ? 'w-28' : c === 1 ? 'w-40' : 'w-16'}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface SkeletonCardGridProps {
  count?: number
  className?: string
}

export function SkeletonCardGrid({ count = 3, className = '' }: SkeletonCardGridProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`} role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="skeleton-avatar" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="skeleton-title w-3/4" />
              <div className="skeleton-text w-1/2" />
            </div>
          </div>
          <div className="skeleton-text w-full mt-2" />
          <div className="skeleton-text w-5/6" />
        </div>
      ))}
    </div>
  )
}
