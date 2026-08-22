import { useNoticeStore } from '../../stores/noticeStore';
import { NoticeModal } from '../../components/common/NoticeModal';
import { PageHeader } from '../common/PageHeader';
import { EmptyState } from '../../components/common/StateFeedback';
import { Bell, AlertCircle, Calendar, User, Plus } from 'lucide-react';
import { formatDateVi } from '../../utils/formatDate';
import { useState } from 'react';

const priorityClass: Record<string, string> = {
  urgent: 'bg-parish-danger-bg text-parish-danger border-parish-danger-bg',
  important: 'bg-parish-secondary-light text-parish-secondary border-parish-secondary-light',
  normal: 'bg-surface-app text-parish-primary border-surface-border',
};

const priorityLabel: Record<string, string> = {
  urgent: 'Khẩn',
  important: 'Thông tin',
  normal: 'Bình thường',
};

export function DesktopNotices() {
  const notices = useNoticeStore(s => s.notices);
  const [showModal, setShowModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState<import('../../types').ParishNotice | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        icon={<Bell size={20} />}
        title="Thông Báo Giáo Xứ"
        description="Quản lý và xem các thông báo gửi đến thiếu nhi & phụ huynh"
        actions={
          <>
            <span className="badge badge-primary">
              {notices.length} thông báo
            </span>
            <button
              className="btn btn-primary"
              onClick={() => { setEditingNotice(null); setShowModal(true); }}
            >
              <Plus size={16} /> Thêm Thông Báo
            </button>
          </>
        }
      />

      {/* Notices List */}
      <div className="bg-surface-card rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="table-wrapper">
          <div className="table-scroll">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0 bg-surface-card text-text-main">
            <colgroup>
              <col className="w-[55px]" />
              <col className="w-auto min-w-0" />
              <col className="w-[140px]" />
              <col className="w-[180px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3" scope="col">STT</th>
                <th className="py-2.5 px-3" scope="col">Tiêu Đề / Nội Dung</th>
                <th className="py-2.5 px-3" scope="col">Độ Ưu Tiên</th>
                <th className="py-2.5 px-3" scope="col">Tác Giả / Ngày</th>
                <th className="py-2.5 px-3 text-center" scope="col">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="bg-surface-card">
              {notices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8">
                    <EmptyState
                      icon={Bell}
                      title="Chưa có thông báo nào"
                      description="Hiện tại chưa có thông báo nào được đăng tải. Hãy tạo thông báo đầu tiên!"
                      actionLabel="Thêm thông báo mới"
                      onAction={() => { setEditingNotice(null); setShowModal(true); }}
                    />
                  </td>
                </tr>
              ) : (
                notices.map((notice, idx) => {
                  const pc = priorityClass[notice.priority] || priorityClass.normal;
                  const pl = priorityLabel[notice.priority] || priorityLabel.normal;
                  return (
                    <tr key={notice.id} className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-text-muted">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 overflow-hidden min-w-0">
                        <div className={`font-bold truncate min-w-0 ${pc.split(' ')[1]}`}>
                          {notice.title}
                        </div>
                        <div className="text-sm text-text-muted mt-1 truncate min-w-0">
                          {notice.content}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${pc}`}>
                          <AlertCircle size={12} />
                          {pl}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 text-sm text-text-muted font-medium">
                          <User size={12} /> {notice.author}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-text-muted mt-1 font-medium">
                          <Calendar size={12} /> {formatDateVi(notice.date)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setEditingNotice(notice); setShowModal(true); }}
                          title="Chỉnh sửa"
                        >
                          Sửa
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
         </div>
         </div>
       </div>

      <NoticeModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingNotice(null); }}
        noticeToEdit={editingNotice}
      />
    </div>
  );
}