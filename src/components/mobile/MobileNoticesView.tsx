import React, { useState } from 'react';
import { useNoticeStore } from '../../stores/noticeStore';
import { NoticeModal } from '../common/NoticeModal';
import { useAuth } from '../../hooks/useAuth';
import { ParishNotice } from '../../types';
import { Bell, AlertCircle, Calendar, User, Plus, Pencil } from 'lucide-react';
import { SubpageHeader } from '../common/SubpageHeader';
import { EmptyState } from '../common/StateFeedback';
import { Button } from '../common/ui/Button';

export const MobileNoticesView: React.FC = () => {
  const notices = useNoticeStore(s => s.notices);
  const { can } = useAuth();
  const canManageNotices = can('admin');

  const [showModal, setShowModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState<ParishNotice | null>(null);

  const priorityColors = {
    urgent: { bg: 'var(--color-parish-danger-bg)', border: 'var(--color-parish-danger)', text: 'var(--color-parish-danger-hover)', icon: 'var(--color-parish-danger)' },
    important: { bg: 'var(--color-parish-warning-bg)', border: 'var(--color-parish-warning)', text: 'var(--color-parish-warning-hover)', icon: 'var(--color-parish-secondary)' },
    normal: { bg: 'var(--color-surface-hover)', border: 'var(--color-surface-border)', text: 'var(--color-parish-primary)', icon: 'var(--color-parish-primary)' },
  };

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* Subpage Header */}
      <SubpageHeader
        icon={<Bell size={16} />}
        title="Thông Báo Giáo Xứ"
        meta={<span>{notices.length} tin thông báo</span>}
        actions={
          canManageNotices && (
            <Button
              onClick={() => { setEditingNotice(null); setShowModal(true); }}
              variant="primary"
              size="sm"
              leadingIcon={<Plus size={14} />}
            >
              Thêm
            </Button>
          )
        }
      />

      {/* Notices Cards List */}
      <div className="flex flex-col gap-3">
        {notices.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Chưa có thông báo nào"
            description="Các thông báo gửi đến thiếu nhi và phụ huynh sẽ hiển thị ở đây."
          />
        ) : (
          notices.map(n => {
            const colors = priorityColors[n.priority as keyof typeof priorityColors] || priorityColors.normal;
            return (
              <article key={n.id} className="entity-card p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="text-sm font-bold text-text-main m-0 leading-snug" style={{ color: colors.text }}>
                    {n.title}
                  </h3>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                    style={{
                      background: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`
                    }}
                  >
                    <AlertCircle size={10} style={{ color: colors.icon }} />
                    {n.priority === 'urgent' ? 'Khẩn' : n.priority === 'important' ? 'Thông tin' : 'Bình thường'}
                  </span>
                </div>
                <p className="text-xs text-text-muted m-0 leading-relaxed">
                  {n.content}
                </p>
                <div className="flex justify-between items-center text-[11px] text-text-muted pt-2 mt-1 border-t border-surface-border">
                  <span className="flex items-center gap-1">
                    <User size={12} /> {n.author}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {n.date}
                    </span>
                    {canManageNotices && (
                      <button
                        type="button"
                        onClick={() => { setEditingNotice(n); setShowModal(true); }}
                        className="btn btn-secondary mobile-btn min-h-[44px] min-w-[44px] px-3 text-xs"
                        aria-label={`Sửa thông báo: ${n.title}`}
                      >
                        <Pencil size={12} /> Sửa
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      <NoticeModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingNotice(null); }}
        noticeToEdit={editingNotice}
      />
    </div>
  );
};
