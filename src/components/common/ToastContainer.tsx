import React from 'react'
import { useToastStore } from '../../stores/toastStore'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

const typeConfig = {
  success: {
    icon: CheckCircle2,
    bg: 'bg-emerald-50 dark:bg-emerald-950',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-300',
    iconColor: 'text-emerald-500',
  },
  error: {
    icon: AlertCircle,
    bg: 'bg-rose-50 dark:bg-rose-950',
    border: 'border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-300',
    iconColor: 'text-rose-500',
  },
  info: {
    icon: Info,
    bg: 'bg-sky-50 dark:bg-sky-950',
    border: 'border-sky-200 dark:border-sky-800',
    text: 'text-sky-700 dark:text-sky-300',
    iconColor: 'text-sky-500',
  },
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
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
              className={`shrink-0 mt-0.5 ${config.text} opacity-60 hover:opacity-100 transition-opacity`}
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
