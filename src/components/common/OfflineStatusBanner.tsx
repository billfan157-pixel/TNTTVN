import React from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

/**
 * Sprint 2: Everyday Catechist-Friendly Offline UX Banner
 * Translates complex sync engine state into reassuring natural Vietnamese language.
 */
export const OfflineStatusBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const status = useSyncStore(s => s.status);
  const pendingCount = useSyncStore(s => s.pendingCount);
  const isSyncing = status === 'syncing';

  // 1. Online & fully synced (Normal state → visually silent)
  if (isOnline && !isSyncing && pendingCount === 0 && status !== 'failed') {
    return null;
  }

  // 2. Sync failed / error state
  if (status === 'failed') {
    return (
      <div className="offline-status-banner offline-status-banner--failed bg-rose-50 text-rose-900 border-b border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900 px-4 py-2 text-xs font-semibold flex items-center justify-between transition-all">
        <div className="offline-status-banner__content flex items-center gap-2">
          <WifiOff size={15} className="text-rose-600 shrink-0" />
          <span>🔴 <strong>Lỗi đồng bộ:</strong> Chưa thể gửi dữ liệu lên máy chủ.</span>
        </div>
        <button
          type="button"
          onClick={() => useSyncStore.getState().setStatus('syncing')}
          className="btn btn-danger btn-sm text-[11px]"
        >
          Thử lại
        </button>
      </div>
    );
  }

  // 3. Syncing in progress
  if (isSyncing) {
    return (
      <div className="offline-status-banner offline-status-banner--syncing bg-sky-50 text-sky-800 border-b border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900 px-4 py-2 text-xs font-semibold flex items-center justify-between animate-pulse">
        <div className="offline-status-banner__content flex items-center gap-2">
          <RefreshCw size={15} className="text-sky-600 animate-spin shrink-0" />
          <span>🔄 <strong>Đang đồng bộ:</strong> Đang lưu {pendingCount} thay đổi lên máy chủ...</span>
        </div>
        <div className="offline-status-banner__progress w-20 bg-sky-200 dark:bg-sky-900 h-1.5 rounded-md overflow-hidden">
          <div className="bg-sky-600 dark:bg-sky-400 h-full w-2/3 animate-pulse"></div>
        </div>
      </div>
    );
  }

  // 4. Offline mode
  if (!isOnline) {
    return (
      <div className="offline-status-banner offline-status-banner--offline bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 px-4 py-2 text-xs font-semibold flex items-center justify-between">
        <div className="offline-status-banner__content flex items-center gap-2">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <span>🟡 <strong>Mất kết nối Internet:</strong> Dữ liệu được lưu an toàn trên máy.</span>
        </div>
        {pendingCount > 0 && (
          <span className="offline-status-banner__pending bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-md font-bold text-[11px] border border-amber-300 shrink-0">
            {pendingCount} thay đổi chờ gửi
          </span>
        )}
      </div>
    );
  }

  // 5. Online with pending changes awaiting background push
  return (
    <div className="offline-status-banner offline-status-banner--pending bg-sky-50 text-sky-800 border-b border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900 px-4 py-2 text-xs font-semibold flex items-center justify-between">
      <div className="offline-status-banner__content flex items-center gap-2">
        <Wifi size={15} className="text-sky-600 shrink-0" />
        <span>☁ <strong>Đã lưu trên máy:</strong> {pendingCount} thay đổi sẽ tự đồng bộ khi có mạng.</span>
      </div>
    </div>
  );
};
