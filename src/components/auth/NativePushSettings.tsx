import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Bell, BellOff, CheckCircle2, Globe, Info, Loader2, Smartphone } from 'lucide-react'
import {
  disablePushSubscription,
  enableNativePushNotifications,
  enableWebPushNotifications,
  getNativePushStatus,
  getWebPushStatus,
  isNativePushAvailable,
  type NativePushStatus,
  type WebPushStatus,
} from '../../lib/pushManager'

const INITIAL_NATIVE_STATUS: NativePushStatus = { available: false, permission: 'prompt', active: false }
const INITIAL_WEB_STATUS: WebPushStatus = {
  supported: false,
  permission: 'unsupported',
  vapidConfigured: false,
  active: false,
  isStandalonePwa: false,
  isIos: false,
}

export function NativePushSettings() {
  const isNative = isNativePushAvailable()
  const [nativeStatus, setNativeStatus] = useState<NativePushStatus>(INITIAL_NATIVE_STATUS)
  const [webStatus, setWebStatus] = useState<WebPushStatus>(INITIAL_WEB_STATUS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (isNative) {
      setNativeStatus(await getNativePushStatus())
    } else {
      setWebStatus(await getWebPushStatus())
    }
  }, [isNative])

  useEffect(() => {
    refresh().catch(() => setError('Không thể đọc trạng thái thông báo')).finally(() => setLoading(false))
  }, [refresh])

  if (isNative && !nativeStatus.available && !loading) return null
  if (!isNative && !webStatus.supported && !loading && !webStatus.isIos) return null

  const toggle = async () => {
    setLoading(true)
    setError('')
    try {
      if (isNative) {
        if (nativeStatus.active) await disablePushSubscription(true)
        else await enableNativePushNotifications()
      } else {
        if (webStatus.active) await disablePushSubscription(true)
        else await enableWebPushNotifications()
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật thông báo')
      await refresh().catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  const isActive = isNative ? nativeStatus.active : webStatus.active
  const isDenied = isNative ? nativeStatus.permission === 'denied' : webStatus.permission === 'denied'

  return (
    <section className="app-panel p-5 space-y-4" aria-labelledby="push-settings-title">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-parish-primary-light dark:bg-parish-primary/15 text-parish-primary flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4" />
        </span>
        <div>
          <h2 id="push-settings-title" className="text-sm font-bold text-text-main tracking-wide m-0">
            Thông Báo Trên Thiết Bị {isNative ? '(Native)' : '(Web PWA)'}
          </h2>
          <p className="text-xs text-text-muted m-0 mt-0.5">Nhận điểm danh, phiếu điểm, lịch học và thông báo giáo xứ</p>
        </div>
      </div>

      {!isNative && webStatus.isIos && !webStatus.isStandalonePwa && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Để nhận thông báo trên iPhone/iPad khi đóng app:</strong>
            <p className="mt-1 mb-0">
              Hãy mở trang này bằng trình duyệt Safari, bấm nút <strong>Chia sẻ (Share)</strong> &rarr; chọn <strong>&ldquo;Thêm vào MH chính&rdquo; (Add to Home Screen)</strong>. Sau đó mở ứng dụng từ Màn hình chính để bật thông báo.
            </p>
          </div>
        </div>
      )}

      {!isNative && !webStatus.vapidConfigured && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800/40 dark:bg-rose-950/20 p-3 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <strong>Máy chủ chưa bật dịch vụ thông báo Web Push:</strong>
            <p className="mt-1 mb-0">
              Backend Render cần được cấu hình <code>VAPID_PUBLIC_KEY</code> và <code>VAPID_PRIVATE_KEY</code>. Vui lòng thêm hai biến này trên Render Dashboard để kích hoạt.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 border-t border-surface-border pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
            {isNative ? <Smartphone size={15} /> : <Globe size={15} />}
            {isNative ? 'Android / iPhone (Ứng dụng cài đặt)' : 'Trình duyệt Web / PWA Màn hình chính'}
          </div>
          <p className="text-xs text-text-muted mt-1 mb-0">
            {isActive
              ? 'Thiết bị này đã được kích hoạt nhận thông báo.'
              : isDenied
                ? 'Quyền thông báo đang bị chặn. Hãy bật thông báo trong Cài đặt hệ thống / Cài đặt trang web rồi thử lại.'
                : !isNative && !webStatus.vapidConfigured
                  ? 'Dịch vụ thông báo web trên máy chủ đang tạm tắt.'
                  : 'Catevia chỉ gửi thông báo khi bạn chủ động bật.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={loading || (!isNative && !webStatus.vapidConfigured && !isActive)}
          aria-pressed={isActive}
          className={`btn shrink-0 disabled:opacity-50 ${isActive ? 'btn-secondary' : 'btn-primary'}`}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : isActive ? <BellOff size={15} /> : <Bell size={15} />}
          {isActive ? 'Tắt' : 'Bật'}
        </button>
      </div>

      {isActive && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400" role="status">
          <CheckCircle2 size={14} /> Sẵn sàng nhận thông báo khi có sự kiện mới
        </div>
      )}
      {error && <p className="text-xs text-rose-600 m-0" role="alert">{error}</p>}
    </section>
  )
}
