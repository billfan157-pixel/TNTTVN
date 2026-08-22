import React, { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { pushModal, popModal, isTopModal } from '../../lib/modalStack'

interface ConfirmDialogProps {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  /** false = alert 1 nút (không hiện nút Hủy) */
  showCancel?: boolean
  /** Đang chạy thao tác — khóa nút xác nhận, hiển thị "Đang xử lý..." */
  isBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title = 'Xác nhận',
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  variant = 'warning',
  showCancel = true,
  isBusy = false,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const modalRef = useFocusTrap(isOpen)
  // PHA 1 (audit A20/A21): useId thay static id (2 ConfirmDialog song song không
  // còn trùng aria id) + stack arbitration (Esc chỉ đóng dialog top-most).
  const titleId = React.useId()
  const instanceId = React.useId()

  useEffect(() => {
    if (!isOpen) return
    pushModal(instanceId)
    return () => popModal(instanceId)
  }, [isOpen, instanceId])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(instanceId)) onCancel()
    }
    document.addEventListener('keydown', handleKey)
    confirmRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onCancel, instanceId])

  if (!isOpen) return null

  const variantConfig = {
    danger: {
      iconBg: 'var(--color-parish-danger-bg)',
      iconColor: 'var(--color-parish-danger)',
      btnBg: 'var(--color-parish-danger)',
      btnHoverBg: 'var(--color-parish-danger-hover)',
    },
    warning: {
      iconBg: 'var(--color-parish-warning-bg)',
      iconColor: 'var(--color-parish-warning)',
      btnBg: 'var(--color-parish-warning)',
      btnHoverBg: 'var(--color-parish-warning-hover)',
    },
    info: {
      iconBg: 'var(--color-parish-info-bg)',
      iconColor: 'var(--color-parish-info)',
      btnBg: 'var(--color-parish-info)',
      btnHoverBg: 'var(--color-parish-info-hover)',
    },
  }
  const config = variantConfig[variant]

  return (
    <div
      className="modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="modal-content w-[90%] max-w-[400px]"
        style={{ padding: '24px' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="icon-container-lg rounded-xl flex items-center justify-center shrink-0"
            style={{ width: '44px', height: '44px', background: config.iconBg }}
          >
            <AlertTriangle size={22} style={{ color: config.iconColor }} aria-hidden="true" />
          </div>
          <h3 id={titleId} className="typography-section-title m-0">
            {title}
          </h3>
        </div>

        <p className="typography-body mb-6 text-text-secondary">
          {message}
        </p>

        <div className="flex gap-2.5 justify-end">
          {showCancel && (
            <button
              onClick={onCancel}
              className="btn btn-secondary"
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={isBusy}
            className="btn text-white disabled:opacity-50"
            style={{ background: config.btnBg }}
            onMouseEnter={(e) => { if (!isBusy) e.currentTarget.style.background = config.btnHoverBg }}
            onMouseLeave={(e) => (e.currentTarget.style.background = config.btnBg)}
          >
            {isBusy ? 'Đang xử lý...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
