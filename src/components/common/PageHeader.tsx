
export interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  card?: boolean
  className?: string
}

/**
 * Page Header chuẩn DS §5 (ADR-030/032) — khung tiêu đề trang cấp cao nhất:
 * card nền gradient brand dịu (`.page-header--card`) + thanh accent vàng→xanh
 * chuyển sắc mượt ở cạnh trái (vẽ bằng nền layer của card, bo góc khít viền)
 * + icon tile gradient xanh Xứ Đoàn 46px, icon màu vàng kem (`.page-header__icon`
 * là chủ sở hữu màu icon — class màu trên svg tại call site không phá vỡ phối màu)
 * + `h1.page-header__title` 23px/800 + desc `.page-header__description` 13px
 * + `actions` bên phải. Thích nghi dark mode qua token, không cần variant riêng.
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

  return content
}

export default PageHeader
