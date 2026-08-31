import { Fingerprint, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { type AppLockAccount } from '../../lib/biometricAppLock'
import { useAppLockStore } from '../../stores/appLockStore'
import { useAuthStore } from '../../stores/authStore'

export function BiometricLockSettings() {
  const user = useAuthStore(s => s.user)
  const capability = useAppLockStore(s => s.capability)
  const enabled = useAppLockStore(s => s.enabled)
  const authenticating = useAppLockStore(s => s.authenticating)
  const error = useAppLockStore(s => s.error)
  const enable = useAppLockStore(s => s.enable)
  const disable = useAppLockStore(s => s.disable)

  if (!user) return null
  const account: AppLockAccount = { userId: user.id, parishId: user.parishId }

  const toggle = async () => {
    if (enabled) await disable(account)
    else await enable(account)
  }

  return (
    <section className="app-panel p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-parish-primary-light dark:bg-parish-primary/15 text-parish-primary flex items-center justify-center shrink-0">
          <Fingerprint className="w-4 h-4" aria-hidden="true" />
        </span>
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">Khóa Sinh Trắc Học</h2>
      </div>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text-main m-0">Mở khóa bằng {capability?.label || 'Face ID hoặc dấu vân tay'}</p>
          <p className="text-xs text-text-muted mt-1 mb-0">
            Tự khóa khi Catevia ra nền. Sinh trắc học chỉ được xử lý trong vùng bảo mật của thiết bị.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Khóa Catevia bằng sinh trắc học"
          disabled={!capability?.available || authenticating}
          onClick={() => void toggle()}
          className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${enabled ? 'bg-parish-primary' : 'bg-surface-border'}`}
        >
          <span className={`absolute left-0 top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {authenticating && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Đang xác minh trên thiết bị…
        </div>
      )}
      {!capability?.available && capability?.reason && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{capability.reason}</span>
        </div>
      )}
      {error && capability?.available && <div role="alert" className="text-xs text-rose-600">{error}</div>}
      {enabled && (
        <div className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Đã bật. Việc tắt khóa cũng yêu cầu xác minh sinh trắc học.</span>
        </div>
      )}
    </section>
  )
}
