import React from 'react';
import { useNoticeStore } from '../../stores/noticeStore';
import { Bell, AlertCircle, Calendar, User } from 'lucide-react';

export const MobileNoticesView: React.FC = () => {
  const notices = useNoticeStore(s => s.notices);

  const priorityColors = {
    urgent: { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', icon: '#DC2626' },
    important: { bg: '#FEF3C7', border: '#FDE68A', text: '#92400E', icon: '#D97706' },
    normal: { bg: 'var(--color-surface-hover)', border: 'var(--color-surface-border)', text: 'var(--color-parish-primary)', icon: 'var(--color-parish-primary)' },
  };

  return (
    <div className="p-4 flex flex-col gap-4 pb-20">
      {/* Banner Header */}
      <div className="bg-gradient-to-r from-parish-primary to-blue-600 text-white rounded-2xl p-5 shadow-card flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bell size={20} className="text-yellow-300" />
            <h2 className="text-base font-extrabold m-0">Thông Báo Giáo Xứ</h2>
          </div>
          <p className="text-xs opacity-90 m-0">
            Tin tức & thông báo mới nhất từ Xứ Đoàn
          </p>
        </div>
        <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold shrink-0">
          {notices.length} tin
        </span>
      </div>

      {/* Notices Cards List */}
      <div className="flex flex-col gap-3">
        {notices.length === 0 ? (
          <div className="bg-surface-card rounded-2xl p-8 text-center text-text-muted border border-surface-border text-sm">
            Chưa có thông báo nào.
          </div>
        ) : (
          notices.map(n => {
            const colors = priorityColors[n.priority as keyof typeof priorityColors] || priorityColors.normal;
            return (
              <div key={n.id} className="bg-surface-card rounded-2xl p-4 border border-surface-border shadow-card flex flex-col gap-2">
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
                  <span className="flex items-center gap-1">
                    <Calendar size={12} /> {n.date}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
