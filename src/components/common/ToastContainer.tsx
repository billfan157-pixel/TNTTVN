import { useToastStore } from '../../stores/toastStore'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

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
      {toasts.map((toast) => {
        const config = typeConfig[toast.type]
        const Icon = config.icon
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-toast ${config.bg} ${config.border}`}
            style={{ animation: 'toastSlideIn 0.25s ease-out' }}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconColor}`} />
            <p className={`flex-1 text-sm font-medium leading-snug ${config.text}`}>{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className={`toast-close-button shrink-0 ${config.text} opacity-60 hover:opacity-100 transition-opacity`}
              aria-label="Đóng thông báo"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
