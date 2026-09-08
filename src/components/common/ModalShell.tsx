import React from 'react'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ModalPortal } from './ModalPortal'
import { IconButton } from './ui/Button'

interface ModalShellProps {
  isOpen: boolean
  onClose: () => void
  title: React.ReactNode
  /** icon tile bên trái title (như TransactionModal/FundManageModal) */
  icon?: React.ReactNode
  /** subtitle dưới title (text-text-muted) */
  subtitle?: string
  /** action buttons hiển thị bên phải header (trước nút Đóng) */
  headerActions?: React.ReactNode
  /** max-width cho .modal-content (mặc định 560px) */
  maxWidth?: string
  /** overlay-click đóng modal (mặc định true) */
  closeOnOverlay?: boolean
  /** hiển thị nút đóng ✕ ở header (mặc định true, tắt đối với modal bắt buộc) */
  showCloseButton?: boolean
  /** vùng hành động cố định dưới nội dung cuộn */
  footer?: React.ReactNode
  children: React.ReactNode
}

/**
 * Modal Shell chuẩn DS (ADR-030/032/047) — thay thế mọi custom shell:
 * `.modal-overlay`/`.modal-content` + `role="dialog"` `aria-modal` `aria-labelledby`
 * + focus trap (useFocusTrap) + Escape + scroll-lock + overlay-click policy.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  subtitle,
  headerActions,
  maxWidth = '560px',
  closeOnOverlay = true,
  showCloseButton = true,
  footer,
  children,
}) => {
  const { dialogRef: modalRef, titleId } = useAccessibleDialog(isOpen, onClose)

  if (!isOpen) return null

  return (
    <ModalPortal>
      <div
        className="modal-overlay app-modal-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={closeOnOverlay ? onClose : undefined}
      >
        <div
          ref={modalRef}
          onClick={(e) => e.stopPropagation()}
          className="modal-content"
          style={{ maxWidth }}
        >
          <div className="modal-content__header flex items-center justify-between gap-4 mb-4 border-b border-surface-border pb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {icon && (
                <div className="icon-container-lg rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <h3 id={titleId} className="modal-content__title typography-card-title m-0 truncate">
                  {title}
                </h3>
                {subtitle && (
                  <p className="typography-body-sm text-text-muted m-0">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="modal-content__header-actions flex items-center gap-2 shrink-0">
              {headerActions}
              {showCloseButton && (
                <IconButton
                  onClick={onClose}
                  label="Đóng"
                  icon={<span aria-hidden="true">✕</span>}
                  size="sm"
                  variant="ghost"
                  className="mobile-touch-target shrink-0"
                />
              )}
            </div>
          </div>
          <div className="modal-content__body">{children}</div>
          {footer && <div className="modal-content__footer">{footer}</div>}
        </div>
      </div>
    </ModalPortal>
  )
}

export default ModalShell
