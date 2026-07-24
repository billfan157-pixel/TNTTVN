import React, { useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { useWebPush } from '../../hooks/useWebPush';

export const NotificationPrompt: React.FC = () => {
  const { isSupported, subscription, permission, subscribe, unsubscribe } = useWebPush();
  const [dismissed, setDismissed] = useState(false);

  if (!isSupported || permission === 'denied' || dismissed) return null;

  return (
    <div className="bg-white rounded-xl border border-surface-border p-4 shadow-card mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {subscription ? (
            <Bell size={20} className="text-parish-primary shrink-0" />
          ) : (
            <BellOff size={20} className="text-text-muted shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-bold text-sm text-text-main m-0">
              {subscription ? 'Thông báo đã bật' : 'Nhận thông báo từ hệ thống'}
            </p>
            <p className="text-xs text-text-muted m-0 mt-0.5 truncate">
              {subscription
                ? 'Bạn sẽ nhận thông báo khi có cập nhật mới'
                : 'Bật thông báo để không bỏ lỡ tin quan trọng'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {subscription ? (
            <button onClick={unsubscribe} className="btn btn-secondary btn-sm" aria-label="Tắt thông báo">
              Tắt
            </button>
          ) : (
            <button onClick={subscribe} className="btn btn-primary btn-sm" aria-label="Bật thông báo">
              Bật
            </button>
          )}
          <button onClick={() => setDismissed(true)} className="bg-transparent border-0 cursor-pointer p-1" aria-label="Đóng">
            <X size={16} className="text-text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
};
