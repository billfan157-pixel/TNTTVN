import { useNoticeStore } from '../../stores/noticeStore';
import { Bell, AlertCircle, Calendar, User } from 'lucide-react';

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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-surface-border flex justify-between items-center flex-wrap gap-4 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-parish-primary" />
            <h2 className="text-lg font-extrabold text-parish-primary m-0 tracking-tight">
              Thông Báo Giáo Xứ
            </h2>
          </div>
          <p className="text-sm text-text-muted mt-1 m-0 font-medium">
            Quản lý và xem các thông báo gửi đến thiếu nhi & phụ huynh
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-primary">
            {notices.length} thông báo
          </span>
        </div>
      </div>

      {/* Notices List */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0">
            <colgroup>
              <col className="w-[55px]" />
              <col className="w-auto min-w-0" />
              <col className="w-[140px]" />
              <col className="w-[180px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3">STT</th>
                <th className="py-2.5 px-3">Tiêu Đề / Nội Dung</th>
                <th className="py-2.5 px-3">Độ Ưu Tiên</th>
                <th className="py-2.5 px-3">Tác Giả / Ngày</th>
                <th className="py-2.5 px-3 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {notices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-text-muted">
                    Chưa có thông báo nào. Hãy tạo thông báo đầu tiên!
                  </td>
                </tr>
              ) : (
                notices.map((notice, idx) => {
                  const pc = priorityClass[notice.priority] || priorityClass.normal;
                  const pl = priorityLabel[notice.priority] || priorityLabel.normal;
                  return (
                    <tr key={notice.id} className="border-b border-surface-hover hover:bg-surface-app transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-text-muted">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 overflow-hidden min-w-0">
                        <div className={`font-bold truncate min-w-0 ${pc.split(' ')[1]}`}>
                          {notice.title}
                        </div>
                        <div className="text-xs text-text-muted mt-1 truncate min-w-0">
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
                        <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
                          <User size={12} /> {notice.author}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1 font-medium">
                          <Calendar size={12} /> {notice.date}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Xem chi tiết"
                        >
                          Xem
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
   );
};