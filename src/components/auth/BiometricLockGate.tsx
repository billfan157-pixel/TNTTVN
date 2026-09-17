import React from 'react'
import { Fingerprint, Loader2, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'
import appLogo from '../../assets/app-logo-192.png'
import { appLockAccountKey, isNativeBiometricPlatform, type AppLockAccount } from '../../lib/biometricAppLock'
import { useAppLockStore } from '../../stores/appLockStore'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../common/ui/Button'

export function BiometricLockGate({ children }: { children: React.ReactNode }) {
  const authReady = useAuthStore(s => s.authReady)
  const user = useAuthStore(s => s.user)
  const initializedFor = useAppLockStore(s => s.initializedFor)
  const capability = useAppLockStore(s => s.capability)
  const enabled = useAppLockStore(s => s.enabled)
  const locked = useAppLockStore(s => s.locked)
  const authenticating = useAppLockStore(s => s.authenticating)
  const error = useAppLockStore(s => s.error)
  const initialize = useAppLockStore(s => s.initialize)
  const unlock = useAppLockStore(s => s.unlock)
  const clearForPasswordRecovery = useAppLockStore(s => s.clearForPasswordRecovery)

  const userId = user?.id
  const parishId = user?.parishId
  const account = React.useMemo<AppLockAccount | null>(
    () => userId && parishId ? ({ userId, parishId }) : null,
    [userId, parishId],
  )
  const accountKey = account ? appLockAccountKey(account) : null
  const native = isNativeBiometricPlatform()
  const autoAttemptedRef = React.useRef(false)

  React.useEffect(() => {
    if (!authReady) return
    void initialize(account)
  }, [account, authReady, initialize])

  React.useEffect(() => {
    if (!locked) {
      autoAttemptedRef.current = false
      return
    }
    if (enabled && capability?.available && !authenticating && !autoAttemptedRef.current) {
      autoAttemptedRef.current = true
      void unlock()
    }
  }, [authenticating, capability?.available, enabled, locked, unlock])

  if (!native) return <>{children}</>

  if (!authReady) {
    return (
      <div className="min-h-screen bg-surface-app flex items-center justify-center text-text-muted" role="status" aria-live="polite">
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
        Đang xác thực phiên làm việc…
      </div>
    )
  }

  if (!account) return <>{children}</>

  if (initializedFor !== accountKey) {
    return (
      <div className="min-h-screen bg-surface-app flex items-center justify-center text-text-muted" role="status" aria-live="polite">
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
        Đang kiểm tra khóa ứng dụng…
      </div>
    )
  }

  if (!enabled || !locked) return <>{children}</>

  const recoverWithPassword = async () => {
    clearForPasswordRecovery(account)
    await useAuthStore.getState().logout()
    // Keep the current document alive until revocation/cleanup completes and
    // preserve any local-only logout warning on the login screen.
    const { router } = await import('../../router')
    await router.navigate({ to: '/login' })
  }

  return (
    <main className="min-h-screen bg-surface-app flex items-center justify-center p-5 font-sans">
      <section className="auth-card w-full max-w-md p-7 text-center space-y-5" aria-labelledby="app-lock-title">
        <div className="mx-auto w-20 h-20 rounded-3xl overflow-hidden shadow-md border border-surface-border bg-surface-card">
          <img src={appLogo} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-parish-primary-light dark:bg-parish-primary/15 text-parish-primary flex items-center justify-center">
            <LockKeyhole className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 id="app-lock-title" className="text-xl font-extrabold text-text-main m-0">Catevia đang khóa</h1>
          <p className="text-sm text-text-muted m-0">
            Xác minh bằng {capability?.label || 'Face ID hoặc dấu vân tay'} để tiếp tục.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-600">
            {error}
          </div>
        )}

        <Button
          type="button"
          onClick={() => void unlock()}
          loading={authenticating}
          loadingLabel="Đang xác minh…"
          disabled={!capability?.available}
          variant="primary"
          size="lg"
          fullWidth
          leadingIcon={<Fingerprint className="w-5 h-5" aria-hidden="true" />}
        >
          Mở khóa Catevia
        </Button>

        <div className="flex items-start gap-2 text-left text-xs text-text-muted rounded-xl bg-surface-hover p-3">
          <ShieldCheck className="w-4 h-4 text-parish-primary shrink-0 mt-0.5" aria-hidden="true" />
          <span>Dữ liệu khuôn mặt và vân tay chỉ được hệ điều hành xử lý, Catevia không đọc hoặc lưu dữ liệu sinh trắc học.</span>
        </div>

        <Button
          type="button"
          onClick={recoverWithPassword}
          variant="plain"
          size="md"
          fullWidth
          leadingIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
          className="text-text-muted"
        >
          Đăng xuất và dùng mật khẩu
        </Button>
      </section>
    </main>
  )
}
