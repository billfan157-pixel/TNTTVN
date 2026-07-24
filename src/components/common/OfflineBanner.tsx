import { useSyncStore } from '../../stores/syncStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { Wifi, WifiOff, RefreshCw, AlertCircle, Clock } from 'lucide-react'

export const OfflineBanner = () => {
  const status = useSyncStore((s) => s.status)
  const pendingCount = useSyncStore((s) => s.pendingCount)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const lastError = useSyncStore((s) => s.lastError)
  const isOnline = useOnlineStatus()

  const isVisible = !isOnline || status === 'offline' || status === 'retrying' || status === 'syncing' || (status === 'failed' && pendingCount > 0)

  if (!isVisible) return null

  const timeAgo = lastSyncAt
    ? (() => {
        const diff = Date.now() - new Date(lastSyncAt).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'Vài giây trước'
        if (mins < 60) return `${mins} phút trước`
        return `${Math.floor(mins / 60)} giờ trước`
      })()
    : null

  return (
    <div className="w-full">
      {!isOnline || status === 'offline' ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 text-xs">
          <div className="flex items-center gap-2">
            <WifiOff size={14} className="shrink-0 text-amber-600" />
            <span className="font-semibold">Bạn đang ngoại tuyến.</span>
            <span className="text-amber-700">{pendingCount > 0 ? `Có ${pendingCount} thao tác chờ đồng bộ.` : 'Thao tác sẽ được đồng bộ khi có kết nối.'}</span>
          </div>
          {timeAgo && (
            <span className="flex items-center gap-1 text-amber-600 shrink-0">
              <Clock size={12} />
              {timeAgo}
            </span>
          )}
        </div>
      ) : status === 'syncing' ? (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-b border-blue-500/30 text-blue-700 text-xs">
          <RefreshCw size={14} className="animate-spin shrink-0" />
          <span className="font-semibold">Đang đồng bộ dữ liệu...</span>
          <span className="text-blue-600">(Còn {pendingCount} thao tác)</span>
        </div>
      ) : status === 'retrying' ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/30 text-indigo-800 text-xs">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="animate-spin shrink-0 text-indigo-600" />
            <span className="font-semibold">Đang thử lại đồng bộ...</span>
            {lastError && <span className="text-indigo-700">({lastError})</span>}
          </div>
          {timeAgo && (
            <span className="flex items-center gap-1 text-indigo-600 shrink-0">
              <Clock size={12} />
              {timeAgo}
            </span>
          )}
        </div>
      ) : status === 'failed' ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-rose-500/10 border-b border-rose-500/30 text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0 text-rose-600" />
            <span className="font-semibold">Đồng bộ thất bại.</span>
            {lastError && <span className="text-rose-700">{lastError}</span>}
          </div>
          {timeAgo && (
            <span className="flex items-center gap-1 text-rose-600 shrink-0">
              <Clock size={12} />
              {timeAgo}
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
