import React, { useState, useEffect } from 'react';
import { AlertTriangle, UserCheck, Server, Eye } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface ConflictData {
  studentName: string;
  field: string;
  localValue: string | number;
  serverValue: string | number;
  updatedBy?: string;
}

interface Props {
  isOpen: boolean;
  conflict: ConflictData | null;
  onUseLocal: () => void;
  onUseServer: () => void;
  onClose: () => void;
}

export const ConflictResolutionModal: React.FC<Props> = ({
  isOpen,
  conflict,
  onUseLocal,
  onUseServer,
  onClose,
}) => {
  const [showDiff, setShowDiff] = useState(false);
  // PHA 1 (audit A19): focus trap
  const trapRef = useFocusTrap(isOpen && !!conflict);

  useEffect(() => {
    if (!isOpen || !conflict) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [isOpen, conflict, onClose])

  if (!isOpen || !conflict) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="conflict-resolution-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div ref={trapRef} className="bg-surface-card rounded-2xl border border-surface-border shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-parish-warning-bg/40 border-b border-parish-warning/30 p-4 flex items-center gap-3">
          <div className="p-2 bg-parish-warning/20 rounded-xl text-parish-warning">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 id="conflict-resolution-title" className="font-extrabold text-text-main text-sm m-0">Phát Hiện Khác Biệt Dữ Liệu</h3>
            <p className="text-xs text-parish-warning mt-0.5 m-0 font-medium">Cần sự xác nhận của bạn để hoàn tất đồng bộ</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-text-main font-semibold m-0 leading-relaxed">
            Điểm số của em <strong className="text-parish-primary">{conflict.studentName}</strong> đã được một giáo lý viên khác thay đổi trên máy chủ.
          </p>

          {showDiff && (
            <div className="bg-surface-app p-3.5 rounded-xl border border-surface-border text-xs space-y-2 animate-fade-in">
              <div className="flex justify-between items-center pb-2 border-b border-surface-border">
                <span className="text-text-muted font-medium">Trường thông tin:</span>
                <span className="font-bold text-text-main">{conflict.field}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-parish-warning font-bold flex items-center gap-1">
                  <UserCheck size={13} /> Dữ liệu của bạn:
                </span>
                <span className="font-extrabold text-parish-warning bg-parish-warning-bg px-2 py-0.5 rounded-md border border-parish-warning/30">
                  {conflict.localValue ?? '(trống)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-parish-primary font-bold flex items-center gap-1">
                  <Server size={13} /> Dữ liệu máy chủ:
                </span>
                <span className="font-extrabold text-parish-primary bg-parish-primary-light px-2 py-0.5 rounded-md border border-parish-primary/30">
                  {conflict.serverValue ?? '(trống)'}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 pt-2">
            <button
              onClick={() => setShowDiff(prev => !prev)}
              className="w-full py-2 px-3 text-xs font-bold text-text-secondary bg-surface-hover hover:bg-surface-border rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-surface-border"
            >
              <Eye size={14} />
              {showDiff ? 'Ẩn khác biệt' : 'Xem khác biệt'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { onUseLocal(); onClose(); }}
                className="py-2.5 px-3 text-xs font-bold text-white bg-parish-warning hover:bg-parish-warning-hover rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors"
              >
                <UserCheck size={14} />
                Dùng dữ liệu của tôi
              </button>

              <button
                onClick={() => { onUseServer(); onClose(); }}
                className="py-2.5 px-3 text-xs font-bold text-white bg-parish-primary hover:bg-parish-primary-hover rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors"
              >
                <Server size={14} />
                Giữ dữ liệu máy chủ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
