import React, { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ConfirmDialogProps {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
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
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const modalRef = useFocusTrap(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    confirmRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const variantColors = {
    danger: { bg: '#FEE2E2', icon: '#DC2626', btn: '#DC2626', btnHover: '#B91C1C' },
    warning: { bg: '#FEF3C7', icon: '#D97706', btn: '#D97706', btnHover: '#B45309' },
    info: { bg: '#DBEAFE', icon: '#2563EB', btn: '#2563EB', btnHover: '#1D4ED8' },
  }
  const colors = variantColors[variant]
  const titleId = 'confirm-dialog-title'

  return (
    <div
      className="confirm-dialog-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        ref={modalRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          animation: 'slideUp 0.2s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: colors.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={22} color={colors.icon} aria-hidden="true" />
          </div>
          <h3 id={titleId} style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1E293B' }}>
            {title}
          </h3>
        </div>

        <p style={{ margin: '0 0 24px 0', fontSize: '14px', lineHeight: 1.6, color: '#475569' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              background: 'white',
              color: '#475569',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
            onMouseLeave={e => (e.currentTarget.style.background = 'white')}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '10px',
              border: 'none',
              background: colors.btn,
              color: 'white',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = colors.btnHover)}
            onMouseLeave={e => (e.currentTarget.style.background = colors.btn)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
