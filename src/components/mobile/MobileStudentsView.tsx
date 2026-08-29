import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { Student } from '../../types';
import { useClassStore } from '../../stores/classStore';
import { BRANCHES } from '../../constants/branches';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';
import { Suspense } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
const PromotionPanel = lazyWithRetry<React.FC<{
  onViewPhotoCard?: (student: any) => void
  onViewCertificate?: (student: any) => void
}>>(() => import('../desktop/PromotionPanel'), 'PromotionPanel')
import { 
  Phone, UserPlus, Search, Edit3, 
  Trash2, Printer, Upload, ChevronLeft, ChevronRight, School, CheckSquare,
  Users, TrendingUp, Send, AlertCircle, ArrowDownAZ, ArrowDownZA
} from 'lucide-react';
import { sortStudentsByClassHierarchy } from '../../utils/classSort';
import { SkeletonTable } from '../common/StateFeedback';

interface MobileStudentsViewProps {
  onOpenAddStudent: () => void;
  onImportStudents: () => void;
  onEditStudent: (student: Student) => void;
  onViewReport: (student: Student) => void;
  onPrintReport: (student: Student) => void;
  onNavigateToClasses: () => void;
  onSendReportCards?: () => void;
  sendingCards?: boolean;
  cardError?: string | null;
  onViewPhotoCard?: (student: Student) => void;
  onViewCertificate?: (student: Student) => void;
}

export const MobileStudentsView: React.FC<MobileStudentsViewProps> = ({
  onOpenAddStudent,
  onImportStudents,
  onEditStudent,
  onViewReport: _onViewReport,
  onPrintReport,
  onNavigateToClasses,
  onSendReportCards,
  sendingCards,
  cardError,
  onViewPhotoCard,
  onViewCertificate,
}) => {
  const students = useStudentStore(s => s.students)
  const deleteStudent = useStudentStore(s => s.deleteStudent)
  const deleteStudents = useStudentStore(s => s.deleteStudents)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const classList = useClassStore(s => s.getClassList)()
  const findClassById = useClassStore(s => s.findClassById)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)
  const selectedBranchId = useFilterStore(s => s.selectedBranchId)
  const searchQuery = useFilterStore(s => s.searchQuery)
  const setSearchQuery = useFilterStore(s => s.setSearchQuery)
  const selectedSemester = useFilterStore(s => s.selectedSemester)

  const pagination = useStudentStore(s => s.pagination)
  const _setPagination = useStudentStore(s => s.setPagination)

  const [pageSize, setPageSize] = React.useState(pagination.limit || 50)
  const [page, setPage] = React.useState(pagination.page || 1)

  const hasClasses = useClassStore(s => s.classes.length > 0)

  React.useEffect(() => {
    setPage(1)
  }, [selectedClassId, selectedBranchId, searchQuery])

  // 2026-08-22: mặc định 'asc' — danh sách mở lên đã nhóm theo cấp bậc lớp
  // (Chiến Con → Ấu → Thiếu → Nghĩa → Hiệp; trong lớp theo tên), không còn
  // thứ tự nhập thô từ server. Bấm lại nút để tắt/toggle như cũ.
  const [sortClassDirection, setSortClassDirection] = React.useState<'asc' | 'desc' | null>('asc')

  const filteredStudents = React.useMemo(() => {
    return students.filter(s => {
      if (selectedBranchId !== 'all' && s.branch !== selectedBranchId) return false;
      if (selectedClassId !== 'all' && s.classId !== selectedClassId) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchHoly = s.holyName.toLowerCase().includes(q);
        const matchFull = s.fullName.toLowerCase().includes(q);
        const matchCode = s.code.toLowerCase().includes(q);
        if (!matchHoly && !matchFull && !matchCode) return false;
      }
      return true;
    });
  }, [students, selectedBranchId, selectedClassId, searchQuery]);

  const sortedStudents = React.useMemo(() => {
    if (!sortClassDirection) return filteredStudents
    return sortStudentsByClassHierarchy(filteredStudents, findClassById, sortClassDirection)
  }, [filteredStudents, sortClassDirection, findClassById])

  const totalFiltered = sortedStudents.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pagedStudents = sortedStudents.slice(start, start + pageSize)

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage)
  }

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize)
    setPage(1)
  }

  const [pendingDelete, setPendingDelete] = React.useState<Student | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = React.useState(false);
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [showPromotions, setShowPromotions] = React.useState(false);
  const [confirmSendCards, setConfirmSendCards] = React.useState(false);

  const { can, role } = useAuth();
  const canDelete = can('admin');
  const canPromoteAction = can('admin', 'chunhiem');

  const handleDelete = (s: Student) => {
    setPendingDelete(s);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectionMode = () => {
    setSelectionMode(prev => {
      const next = !prev;
      if (!next) setSelectedIds(new Set());
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedStudents = students.filter(s => selectedIds.has(s.id));

  const buildBulkDeleteMessage = (list: Student[]): string => {
    const count = list.length;
    if (!count) return '';
    const shown = list.slice(0, 4).map(s => `${s.holyName} ${s.fullName}`).join(', ');
    const suffix = count > 4 ? ` và ${count - 4} thiếu nhi khác` : '';
    return `Bạn có chắc chắn muốn xóa ${count} thiếu nhi đã chọn? (${shown}${suffix})`;
  };

  return (
    <>
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* View Switcher & Send Report Cards Bar */}
      <div className="view-toolbar">
        <div className="flex gap-2">
          <button
            onClick={() => setShowPromotions(false)}
            className={`btn mobile-btn rounded-full ${!showPromotions ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Users size={14} /> Danh Sách
          </button>
          {canPromoteAction && (
            <button
              onClick={() => setShowPromotions(true)}
              className={`btn mobile-btn rounded-full ${showPromotions ? 'btn-primary' : 'btn-secondary'}`}
            >
              <TrendingUp size={14} /> Thăng Tiến
            </button>
          )}
        </div>
        {onSendReportCards && (
          <button
            onClick={() => setConfirmSendCards(true)}
            disabled={sendingCards}
            className="btn btn-primary mobile-btn rounded-full"
          >
            <Send size={14} /> {sendingCards ? 'Đang gửi...' : 'Gửi Kết Quả Học Tập'}
          </button>
        )}
      </div>

      {cardError && (
        <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-[var(--color-parish-danger-bg)] border border-[var(--color-parish-danger)] text-xs font-semibold text-[var(--color-parish-danger-hover)]">
          <AlertCircle size={16} />
          <span>{cardError}</span>
        </div>
      )}

      {showPromotions ? (
        <Suspense fallback={<div className="p-2"><SkeletonTable rows={6} cols={3} /></div>}>
          <PromotionPanel onViewPhotoCard={onViewPhotoCard} onViewCertificate={onViewCertificate} />
        </Suspense>
      ) : (
        <>
          {/* Search & Actions — responsive: search full width + actions row */}
      <div className="flex flex-col gap-2.5">
        <label className="relative flex-1 block" aria-label="Tìm thiếu nhi">
          <Search size={16} className="text-text-placeholder absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            inputMode="search"
            placeholder="Tìm tên thánh, họ tên hoặc mã..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="form-input w-full pr-3 min-h-[44px] rounded-xl text-sm"
            style={{ paddingLeft: '40px' }}
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x scrollbar-none" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', maskImage: 'linear-gradient(to right, black calc(100% - 12px), transparent)' }}>
          {canDelete && (
            <button
              onClick={toggleSelectionMode}
              className={`btn mobile-btn rounded-full px-4 text-xs whitespace-nowrap shrink-0 snap-start ${selectionMode ? 'btn-primary' : 'btn-secondary'}`}
              aria-label={selectionMode ? 'Kết thúc chọn nhiều' : 'Chọn nhiều thiếu nhi'}
              aria-pressed={selectionMode}
            >
              <CheckSquare size={14} /> {selectionMode ? 'Xong' : 'Chọn nhiều'}
            </button>
          )}
          <button onClick={onImportStudents} className="btn btn-secondary mobile-btn rounded-full px-4 text-xs shrink-0 snap-start">
            <Upload size={14} /> Nhập Excel
          </button>
          <button onClick={onOpenAddStudent} className="btn btn-primary mobile-btn rounded-full px-5 shrink-0 snap-start shadow-sm">
            <UserPlus size={16} /> Thêm em
          </button>
        </div>
      </div>

      {!hasClasses && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[var(--color-parish-warning-bg)] border border-[var(--color-parish-warning)]">
          <School size={16} className="text-parish-secondary shrink-0 mt-0.5" />
          <p className="m-0 text-xs font-semibold text-[var(--color-parish-warning-hover)] leading-relaxed">
            Chưa có lớp học nào. Import Excel sẽ tự động tạo lớp mới từ cột "Lớp" trong file, hoặc bạn có thể tạo lớp thủ công.
            <button type="button" onClick={onNavigateToClasses} className="text-parish-primary font-bold underline cursor-pointer inline p-0 bg-transparent border-0 font-inherit text-xs">
              {' '}Tạo lớp →
            </button>
          </p>
        </div>
      )}

      {/* Lưới lớp — khi đang xem Tất cả, hiển thị các lớp để bấm vào xem học viên */}
      {selectedClassId === 'all' && classList.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setSelectedClassId('all')}
            className="text-left rounded-2xl p-3 bg-gradient-to-br from-parish-primary to-parish-primary-hover text-white flex flex-col gap-2 border border-parish-primary"
          >
            <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center"><Users size={16} /></span>
            <span className="font-black text-sm">Tất cả</span>
            <span className="text-xs opacity-80">{students.length} em • Toàn xứ</span>
          </button>
          {classList.map(c => {
            const count = students.filter(s => s.classId === c.id).length
            return (
              <button
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                className="text-left rounded-2xl p-3 bg-surface-card border border-surface-border flex flex-col gap-2 active:scale-[0.98] transition-transform"
              >
                <span className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs border" style={{ background: (BRANCHES as any)[c.branch]?.badgeBg || 'var(--color-parish-primary-light)', color: (BRANCHES as any)[c.branch]?.textColor || 'var(--color-parish-primary)', borderColor: (BRANCHES as any)[c.branch]?.scarfColor ? `${(BRANCHES as any)[c.branch].scarfColor}40` : 'var(--color-surface-border)' }}>{c.name.slice(0,2).toUpperCase()}</span>
                <span className="font-bold text-sm text-text-main truncate">{c.name}</span>
                <span className="text-xs text-text-muted">{count} em • {(BRANCHES as any)[c.branch]?.name || c.branch}</span>
              </button>
            )
          })}
        </div>
      )}
      {selectedClassId !== 'all' && (
        <button onClick={() => setSelectedClassId('all')} className="flex items-center gap-1.5 text-xs font-bold text-parish-primary">
          <ChevronLeft size={14} /> Quay lại lưới lớp
        </button>
      )}

      {/* Class Selector Pill Bar (admin only — GLV only sees their assigned classes) */}
      {role === 'admin' && selectedClassId !== 'all' && (
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedClassId('all')}
          className={`py-2 px-4 rounded-2xl border-none min-h-[44px] text-xs font-bold whitespace-nowrap ${selectedClassId === 'all' ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary'}`}
        >
          Tất cả lớp
        </button>
        {classList.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedClassId(c.id)}
            className={`py-2 px-4 rounded-2xl border-none min-h-[44px] text-xs font-bold whitespace-nowrap ${selectedClassId === c.id ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary'}`}
          >
            {c.name}
          </button>
        ))}
      </div>
      )}

      {/* Sắp Xếp Cấp Bậc Lớp (Mobile Sort Bar) */}
      <div className="view-toolbar text-xs">
        <span className="font-bold text-text-muted px-2">Sắp xếp:</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSortClassDirection(prev => prev === 'asc' ? null : 'asc')}
            className={`px-3 py-2 rounded-xl font-bold transition-all flex items-center gap-1 min-h-[44px] ${
              sortClassDirection === 'asc'
                ? 'bg-parish-primary text-white shadow-xs'
                : 'bg-surface-app text-text-secondary hover:bg-surface-hover'
            }`}
          >
            <ArrowDownAZ size={14} />
            <span>Thấp → Cao</span>
          </button>
          <button
            type="button"
            onClick={() => setSortClassDirection(prev => prev === 'desc' ? null : 'desc')}
            className={`px-3 py-2 rounded-xl font-bold transition-all flex items-center gap-1 min-h-[44px] ${
              sortClassDirection === 'desc'
                ? 'bg-parish-primary text-white shadow-xs'
                : 'bg-surface-app text-text-secondary hover:bg-surface-hover'
            }`}
          >
            <ArrowDownZA size={14} />
            <span>Cao → Thấp</span>
          </button>
        </div>
      </div>

      {/* Student List — chỉ hiện khi đã chọn 1 lớp cụ thể, khi đang xem lưới lớp thì ẩn để tập trung */}
      {selectedClassId !== 'all' && (
      <>
      <div className="flex flex-col gap-3">
        {pagedStudents.length === 0 ? (
          <div className="bg-surface-card rounded-2xl text-text-muted text-center p-8">
            Không tìm thấy thiếu nhi nào trong lớp này.
          </div>
        ) : (
          pagedStudents.map(s => {
            const branch = BRANCHES[s.branch];
            const cls = findClassById(s.classId);
            const avg = calculateStudentAvg(s.id, selectedSemester);

            return (
              <div
                key={s.id}
                className={`entity-card p-4 flex flex-col gap-3 relative overflow-hidden ${selectedIds.has(s.id) ? 'ring-2 ring-[var(--color-parish-danger)] ring-offset-0 border-[var(--color-parish-danger)]' : ''}`}
              >
                {selectionMode && (
                  <label className="absolute top-3 left-3 flex items-center justify-center w-6 h-6 rounded-md border bg-surface-card cursor-pointer has-[input:checked]:bg-[var(--color-parish-danger)] has-[input:checked]:border-[var(--color-parish-danger)] has-[input:checked]:text-white transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      className="sr-only"
                      aria-label={`Chọn ${s.holyName} ${s.fullName}`}
                    />
                    {selectedIds.has(s.id) ? <CheckSquare size={14} className="text-white" /> : <span className="w-3.5 h-3.5 rounded-sm border-2 border-surface-border block" />}
                  </label>
                )}
                <div className={`flex justify-between items-start ${selectionMode ? 'pl-8' : ''}`}>
                  <div className="min-w-0 overflow-hidden">
                    <div className="text-amber-900 dark:text-amber-400 text-xs font-bold truncate">
                      {s.holyName || '—'}
                    </div>
                    <div className="text-text-main text-[15px] font-extrabold truncate">
                      {s.fullName}
                    </div>
                    <div className="text-text-muted text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="badge shrink-0" style={{ background: branch?.badgeBg, color: branch?.textColor }}>
                        {branch?.name}
                      </span>
                      <span className="truncate">• {cls?.name}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div className="text-parish-primary text-[15px] font-extrabold tabular-nums">
                      {avg.score !== null ? avg.score : '-'}
                    </div>
                    <span className="badge badge-primary text-[10px] mt-0.5 inline-flex">
                      {avg.label}
                    </span>
                  </div>
                </div>

                {/* Info row */}
                <div className="bg-surface-app text-text-secondary flex items-center justify-between text-xs px-2.5 py-2 rounded-xl border border-surface-border/60">
                  <div className="min-w-0 truncate flex items-center gap-1">
                    <span className="text-[11px]">PH:</span> <strong className="truncate">{s.parentName || '—'}</strong>
                  </div>
                  {s.parentPhone && (
                      <a
                      href={`tel:${s.parentPhone}`}
                      className="text-parish-primary no-underline font-bold flex items-center gap-1 shrink-0 ml-2 min-h-[32px] px-2 rounded-lg bg-parish-primary-light/50 hover:bg-parish-primary-light transition-colors"
                    >
                      <Phone size={12} /> Gọi
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 border-t border-surface-border/60 pt-3">
                  <button onClick={() => onPrintReport(s)} className="btn btn-secondary min-h-[40px] px-3.5 text-xs font-bold rounded-xl">
                    <Printer size={13} /> In Phiếu
                  </button>
                  <button onClick={() => onEditStudent(s)} className="btn btn-secondary min-h-[40px] px-3.5 text-xs font-bold rounded-xl">
                    <Edit3 size={13} /> Sửa
                  </button>
                  {!selectionMode && canDelete && (
                    <button onClick={() => handleDelete(s)} className="btn btn-secondary min-h-[40px] w-10 p-0 rounded-xl" aria-label={`Xóa ${s.fullName}`}>
                      <Trash2 size={14} className="text-parish-danger" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalFiltered > 0 && (
        <div className="bg-surface-card rounded-2xl border border-surface-border p-3 flex items-center justify-between gap-2">
            <select
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value
              handlePageSizeChange(val === 'all' ? totalFiltered : Number(val))
            }}
            className="form-select text-xs min-h-[40px] rounded-xl"
            aria-label="Số lượng mỗi trang"
          >
            <option value="50">50 / trang</option>
            <option value="100">100 / trang</option>
            <option value="200">200 / trang</option>
            <option value="all">Tất cả</option>
          </select>
          <div className="text-text-muted text-xs font-semibold tabular-nums whitespace-nowrap">Trang {safePage}/{totalPages}</div>
          <div className="flex gap-1.5">
            <button
              onClick={() => handlePageChange(safePage - 1)}
              disabled={safePage <= 1}
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl border border-surface-border bg-surface-card flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => handlePageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl border border-surface-border bg-surface-card flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      </>
      )}
      </>
      )}
    </div>
      {selectionMode && selectedStudents.length > 0 && (
        <div className="mobile-bottom-action-bar">
          <div className="mobile-bottom-action-bar__inner">
          <p className="text-parish-danger m-0 text-[13px] font-bold">
            Đã chọn {selectedStudents.length} thiếu nhi
          </p>
          <div className="flex gap-2">
            <button onClick={clearSelection} className="btn btn-secondary mobile-btn">
              Bỏ chọn
            </button>
            <button
              onClick={() => setPendingBulkDelete(true)}
              className="btn mobile-btn btn-danger"
            >
              <Trash2 size={14} /> Xóa
            </button>
          </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={pendingBulkDelete}
        title={`Xóa ${selectedStudents.length} thiếu nhi`}
        message={buildBulkDeleteMessage(selectedStudents)}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
        onConfirm={() => {
          const ids = selectedStudents.map(s => s.id);
          if (ids.length > 0) deleteStudents(ids);
          clearSelection();
          setPendingBulkDelete(false);
          setSelectionMode(false);
        }}
        onCancel={() => setPendingBulkDelete(false)}
      />
      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Xóa thiếu nhi"
        message={pendingDelete ? `Bạn có chắc chắn muốn xóa thiếu nhi ${pendingDelete.holyName} ${pendingDelete.fullName}?` : ''}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) deleteStudent(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        isOpen={confirmSendCards}
        title="Gửi Kết Quả Học Tập"
        message={`Bạn có chắc chắn muốn gửi kết quả học tập cho ${selectedStudents.length > 0 ? selectedStudents.length : totalFiltered} thiếu nhi?`}
        confirmText="Gửi Kết Quả Học Tập"
        cancelText="Hủy"
        variant="info"
        onConfirm={() => {
          setConfirmSendCards(false);
          onSendReportCards?.();
        }}
        onCancel={() => setConfirmSendCards(false)}
      />
    </>
  );
};
