import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, CheckCircle2, Loader2, Smartphone } from 'lucide-react'
import {
  disablePushSubscription,
  enableNativePushNotifications,
  getNativePushStatus,
  isNativePushAvailable,
  type NativePushStatus,
} from '../../lib/pushManager'

const INITIAL_STATUS: NativePushStatus = { available: false, permission: 'prompt', active: false }

export function NativePushSettings() {
  const available = isNativePushAvailable()
  const [status, setStatus] = useState<NativePushStatus>(INITIAL_STATUS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setStatus(await getNativePushStatus())
  }, [])

  useEffect(() => {
    if (!available) {
      setLoading(false)
      return
    }
    refresh().catch(() => setError('Không thể đọc trạng thái thông báo')).finally(() => setLoading(false))
  }, [available, refresh])

  if (!available || (!status.available && !loading)) return null

  const toggle = async () => {
    setLoading(true)
    setError('')
    try {
      if (status.active) await disablePushSubscription(true)
      else await enableNativePushNotifications()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật thông báo')
      await refresh().catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="app-panel p-5 space-y-4" aria-labelledby="native-push-title">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-parish-primary-light dark:bg-parish-primary/15 text-parish-primary flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4" />
        </span>
        <div>
          <h2 id="native-push-title" className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">Thông Báo Trên Thiết Bị</h2>
          <p className="text-xs text-text-muted m-0 mt-0.5">Nhận điểm danh, phiếu điểm, lịch học và thông báo giáo xứ</p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 border-t border-surface-border pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
            <Smartphone size={15} /> Android / iPhone
          </div>
          <p className="text-xs text-text-muted mt-1 mb-0">
            {status.active
              ? 'Thiết bị này đã được đăng ký nhận thông báo.'
              : status.permission === 'denied'
                ? 'Quyền đang bị chặn. Hãy bật Thông báo cho Catevia trong Cài đặt hệ thống rồi thử lại.'
                : 'Catevia chỉ xin quyền khi bạn chủ động bật.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={loading}
          aria-pressed={status.active}
          className={`btn shrink-0 disabled:opacity-50 ${status.active ? 'btn-secondary' : 'btn-primary'}`}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : status.active ? <BellOff size={15} /> : <Bell size={15} />}
          {status.active ? 'Tắt' : 'Bật'}
        </button>
      </div>

      {status.active && (
        <div className="flex items-center gap-2 text-xs text-emerald-600" role="status">
          <CheckCircle2 size={14} /> Sẵn sàng nhận thông báo native
        </div>
      )}
      {error && <p className="text-xs text-rose-600 m-0" role="alert">{error}</p>}
    </section>
  )
}
