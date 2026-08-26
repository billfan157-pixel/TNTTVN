
export interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  card?: boolean
  className?: string
}

/**
 * Page Header chuẩn DS §5 (ADR-030/032):
 * icon tile `bg-parish-primary-light text-parish-primary` + `h1 text-lg font-extrabold text-text-main`
 * + desc `text-xs text-text-muted` + actions bên phải.
 * card prop (mặc định true): bọc trong thẻ Card kính mờ đồng bộ toàn hệ thống.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon,
  actions,
  card = true,
  className = '',
}) => {
  const content = (
    <div className={`flex items-center justify-between flex-wrap gap-4 ${card ? '' : 'w-full'}`}>
      <div className="flex items-center gap-3.5 min-w-0">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center shrink-0 shadow-xs">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-text-main m-0 tracking-tight truncate">
            {title}
          </h1>
          {description && (
            <div className="text-xs text-text-muted mt-1 m-0 font-medium">
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  )

  if (card) {
    return (
      <div className={`bg-surface-card rounded-2xl p-5 md:p-6 border border-surface-border shadow-card ${className}`}>
        {content}
      </div>
    )
  }

  return <div className={className}>{content}</div>
}

export default PageHeader
