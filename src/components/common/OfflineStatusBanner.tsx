import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

const ConflictInboxModal = lazy(() =>
  import('../desktop/ConflictInboxModal').then((m) => ({ default: m.ConflictInboxModal }))
);

/**
 * Sprint 2: Everyday Catechist-Friendly Offline UX Banner & Conflict Detector.
 * Translates complex sync engine state into reassuring natural Vietnamese language.
 */
export const OfflineStatusBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const status = useSyncStore(s => s.status);
  const pendingCount = useSyncStore(s => s.pendingCount);
  const unresolvedConflictsCount = useSyncStore(s => s.unresolvedConflictsCount);
  const isSyncing = status === 'syncing';
  const [showConflictModal, setShowConflictModal] = useState(false);

  useEffect(() => {
    void useSyncStore.getState().refreshConflictsCount();
  }, []);

  const conflictBanner = unresolvedConflictsCount > 0 ? (
    <div className="offline-status-banner offline-status-banner--conflict bg-parish-warning-bg text-parish-warning border-b border-parish-warning/30 px-4 py-2 text-xs font-semibold flex items-center justify-between transition-colors">
      <div className="offline-status-banner__content flex items-center gap-2">
        <AlertTriangle size={15} className="text-parish-warning shrink-0" />
        <span>⚠️ <strong>Xung đột dữ liệu:</strong> Có {unresolvedConflictsCount} mục cần bạn kiểm tra phiên bản.</span>
      </div>
      <button
        type="button"
        onClick={() => setShowConflictModal(true)}
        className="btn btn-warning btn-sm text-xs font-bold px-3 py-1 shadow-2xs"
      >
        Xem xung đột
      </button>
    </div>
  ) : null;

  const conflictModal = showConflictModal ? (
    <Suspense fallback={null}>
      <ConflictInboxModal
        isOpen={showConflictModal}
        onClose={() => {
          setShowConflictModal(false);
          void useSyncStore.getState().refreshConflictsCount();
        }}
      />
    </Suspense>
  ) : null;

  // 1. Online & fully synced & no conflicts (Normal state → visually silent)
  if (isOnline && !isSyncing && pendingCount === 0 && status !== 'failed' && unresolvedConflictsCount === 0) {
    return conflictModal;
  }

  // 2. Sync failed / error state
  if (status === 'failed') {
    return (
      <>
        {conflictBanner}
        <div className="offline-status-banner offline-status-banner--failed bg-parish-danger-bg text-parish-danger border-b border-parish-danger/30 px-4 py-2 text-xs font-semibold flex items-center justify-between transition-all">
          <div className="offline-status-banner__content flex items-center gap-2">
            <WifiOff size={15} className="text-parish-danger shrink-0" />
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
        {conflictModal}
      </>
    );
  }

  // 3. Syncing in progress
  if (isSyncing) {
    return (
      <>
        {conflictBanner}
        <div className="offline-status-banner offline-status-banner--syncing bg-parish-info-bg text-parish-info border-b border-parish-info/30 px-4 py-2 text-xs font-semibold flex items-center justify-between animate-pulse">
          <div className="offline-status-banner__content flex items-center gap-2">
            <RefreshCw size={15} className="text-parish-info animate-spin shrink-0" />
            <span>🔄 <strong>Đang đồng bộ:</strong> Đang lưu {pendingCount} thay đổi lên máy chủ...</span>
          </div>
          <div className="offline-status-banner__progress w-20 bg-parish-info/20 h-1.5 rounded-md overflow-hidden">
            <div className="bg-parish-info h-full w-2/3 animate-pulse"></div>
          </div>
        </div>
        {conflictModal}
      </>
    );
  }

  // 4. Offline mode
  if (!isOnline) {
    return (
      <>
        {conflictBanner}
        <div className="offline-status-banner offline-status-banner--offline bg-parish-warning-bg text-parish-warning border-b border-parish-warning/30 px-4 py-2 text-xs font-semibold flex items-center justify-between">
          <div className="offline-status-banner__content flex items-center gap-2">
            <WifiOff size={15} className="text-amber-600 shrink-0" />
            <span>🟡 <strong>Mất kết nối Internet:</strong> Dữ liệu được lưu an toàn trên máy.</span>
          </div>
          {pendingCount > 0 && (
            <span className="offline-status-banner__pending bg-parish-warning-bg text-parish-warning px-2 py-0.5 rounded-md font-bold text-[11px] border border-parish-warning/30 shrink-0">
              {pendingCount} thay đổi chờ gửi
            </span>
          )}
        </div>
        {conflictModal}
      </>
    );
  }

  // 5. Online with pending changes awaiting background push OR conflicts
  return (
    <>
      {conflictBanner}
      {pendingCount > 0 && (
        <div className="offline-status-banner offline-status-banner--pending bg-parish-info-bg text-parish-info border-b border-parish-info/30 px-4 py-2 text-xs font-semibold flex items-center justify-between">
          <div className="offline-status-banner__content flex items-center gap-2">
            <Wifi size={15} className="text-parish-info shrink-0" />
            <span>☁ <strong>Đã lưu trên máy:</strong> {pendingCount} thay đổi sẽ tự đồng bộ khi có mạng.</span>
          </div>
        </div>
      )}
      {conflictModal}
    </>
  );
};
