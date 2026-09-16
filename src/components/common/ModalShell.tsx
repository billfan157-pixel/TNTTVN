import React, { useEffect } from 'react'
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
  /** Chế độ hiển thị trên màn hình mobile (mặc định 'bottom-sheet') */
  mobileDisplay?: 'bottom-sheet' | 'fullscreen'
  children: React.ReactNode
}

/**
 * Modal Shell chuẩn DS (ADR-030/032/047/055) — thay thế mọi custom shell:
 * `.modal-overlay`/`.modal-content` + `role="dialog"` `aria-modal` `aria-labelledby`
 * + focus trap (useAccessibleDialog) + Escape + scroll-lock + overlay-click policy.
 * Hỗ trợ tối ưu hóa mobile bottom-sheet chuẩn Apple HIG & Material Design 3.
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
  mobileDisplay = 'bottom-sheet',
  children,
}) => {
  const { dialogRef: modalRef, titleId } = useAccessibleDialog(isOpen, onClose)

  const bodyRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      if (modalRef.current) modalRef.current.scrollTop = 0
      if (bodyRef.current) bodyRef.current.scrollTop = 0
    }
  }, [isOpen, modalRef])

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
          className={`modal-content modal-content--shell !p-0 flex flex-col overflow-hidden relative ${
            mobileDisplay === 'fullscreen'
              ? 'h-[100dvh] max-h-[100dvh] rounded-none sm:rounded-2xl sm:h-auto sm:max-h-[90vh]'
              : ''
          }`}
          style={{ maxWidth }}
        >
          {/* Mobile Bottom-sheet Grabber Handle */}
          {mobileDisplay !== 'fullscreen' && (
            <div
              className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0 w-full bg-surface-card select-none"
              aria-hidden="true"
              data-testid="mobile-sheet-grabber"
            >
              <div className="sheet-grabber !mb-0" />
            </div>
          )}

          {/* W3.6: below sm the header may wrap and headerActions is capped to
              the dialog width (max-w-full) so a long badge group reflows onto
              its own rows instead of forcing horizontal scroll — at 320px the
              old single-line, shrink-to-fit header scrolled the dialog body and
              clipped the title off-screen. sm+ keeps the original nowrap row. */}
          <div className="modal-content__header shrink-0 bg-surface-card px-4 py-3 sm:px-6 sm:py-4 border-b border-surface-border flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {icon && (
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-parish-primary-light text-parish-primary flex items-center justify-center shrink-0 [&>svg]:w-4.5 [&>svg]:h-4.5 sm:[&>svg]:w-5 sm:[&>svg]:h-5">
                  {icon}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {/* W3.6: flex-1 (with min-w-0) is the proper truncate-in-flex
                    pattern; without it the shrink-to-fit mobile sheet at 320px
                    collapsed the title to zero width and clipped the dialog
                    off the left edge. */}
                <h3 id={titleId} className="modal-content__title typography-card-title text-base sm:text-lg font-bold leading-tight m-0 truncate">
                  {title}
                </h3>
                {subtitle && (
                  <p className="typography-body-sm text-text-muted m-0 truncate mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="modal-content__header-actions flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 max-sm:max-w-full">
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

          <div
            ref={bodyRef}
            className={`modal-content__body flex-1 overflow-y-auto p-4 sm:p-6 overscroll-contain ${
              !footer ? 'pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] sm:pb-6' : ''
            }`}
          >
            {children}
          </div>

          {footer && (
            <div className="modal-content__footer shrink-0 bg-surface-card !m-0 px-4 py-3 sm:px-6 sm:py-3.5 border-t border-surface-border pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] sm:pb-3.5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

export default ModalShell
