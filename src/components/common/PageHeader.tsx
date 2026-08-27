
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
    <div className={`page-header ${card ? 'page-header--card' : 'w-full'} ${className}`}>
      <div className="page-header__identity">
        {icon && (
          <div className="page-header__icon">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="page-header__title">
            {title}
          </h1>
          {description && (
            <div className="page-header__description">
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div className="page-header__actions">
          {actions}
        </div>
      )}
    </div>
  )

  if (card) {
    return content
  }

  return content
}

export default PageHeader
