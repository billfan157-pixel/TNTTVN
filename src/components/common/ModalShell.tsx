import React, { useEffect } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { pushModal, popModal, isTopModal } from '../../lib/modalStack'

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
  children,
}) => {
  const modalRef = useFocusTrap(isOpen)
  const titleId = React.useId()
  // PHA 1 (audit A20): instance id cho stack arbitration — Escape chỉ đóng top-most
  const instanceId = React.useId()

  useEffect(() => {
    if (!isOpen) return
    pushModal(instanceId)
    return () => popModal(instanceId)
  }, [isOpen, instanceId])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(instanceId)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose, instanceId])

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay"
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
        <div className="flex items-center justify-between gap-4 mb-4 border-b border-surface-border pb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="icon-container-lg rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 id={titleId} className="typography-card-title m-0 truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="typography-body-sm text-text-muted m-0">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <button
              onClick={onClose}
              className="btn btn-icon btn-sm btn-ghost shrink-0"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default ModalShell