import React, { useEffect, useState } from 'react'
import { useToastStore } from '../../stores/toastStore'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { haptics } from '../../utils/haptics'
import type { ToastType } from '../../stores/toastStore'

const typeConfig = {
  success: {
    icon: CheckCircle2,
    bg: 'bg-parish-success-bg',
    border: 'border-parish-success/30',
    text: 'text-parish-success',
    iconColor: 'text-parish-success',
  },
  error: {
    icon: AlertCircle,
    bg: 'bg-parish-danger-bg',
    border: 'border-parish-danger/30',
    text: 'text-parish-danger',
    iconColor: 'text-parish-danger',
  },
  info: {
    icon: Info,
    bg: 'bg-parish-info-bg',
    border: 'border-parish-info/30',
    text: 'text-parish-info',
    iconColor: 'text-parish-info',
  },
}

interface ToastItemProps {
  id: string
  message: string
  type: ToastType
  duration?: number
  onClose: (id: string) => void
}

const ToastItem: React.FC<ToastItemProps> = ({ id, message, type, duration = 4000, onClose }) => {
  const [isExiting, setIsExiting] = useState(false)
  const config = typeConfig[type]
  const Icon = config.icon

  useEffect(() => {
    if (type === 'success') {
      haptics.success()
    } else if (type === 'error') {
      haptics.error()
    } else {
      haptics.tap()
    }

    if (duration > 300) {
      const exitTimer = setTimeout(() => {
        setIsExiting(true)
      }, duration - 200)
      return () => clearTimeout(exitTimer)
    }
  }, [duration, type])

  const handleManualClose = () => {
    haptics.tap()
    setIsExiting(true)
    setTimeout(() => {
      onClose(id)
    }, 200)
  }

  return (
    <div
      className={`pointer-events-auto relative overflow-hidden flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-toast ${
        isExiting ? 'toast-slide-out' : 'toast-slide-in'
      } ${config.bg} ${config.border}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconColor}`} />
      <p className={`flex-1 text-sm font-medium leading-snug ${config.text}`}>{message}</p>
      <button
        onClick={handleManualClose}
        className={`toast-close-button shrink-0 ${config.text} opacity-60 hover:opacity-100 transition-opacity p-1 -m-1`}
        aria-label="Đóng thông báo"
      >
        <X size={14} />
      </button>

      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-xl opacity-30" aria-hidden="true">
          <div
            className={`h-full ${config.bg.replace('-bg', '')} toast-countdown-bar`}
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-[calc(var(--mobile-nav-total-height,0px)+16px)] sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[var(--z-toast)] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label="Thông báo từ hệ thống"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={removeToast}
        />
      ))}
    </div>
  )
}

