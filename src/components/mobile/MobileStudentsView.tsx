import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import type { Student, StudentWorkspace } from '../../types';
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
  Trash2, Printer, Upload, ChevronLeft, ChevronRight, CheckSquare,
  Users, TrendingUp, Send, AlertCircle, ArrowDownAZ, ArrowDownZA, X,
  ArrowRightLeft, UserRound
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { sortStudentsByClassHierarchy } from '../../utils/classSort';
import { SkeletonTable, NoResultState } from '../common/StateFeedback';
import { StudentName } from '../common/StudentName';
import { Button, IconButton } from '../common/ui/Button';
import { Select, TextInput } from '../common/ui/FormControls';
import { TabPanel, Tabs } from '../common/ui/SelectionControls';
import { DesktopClasses } from '../desktop/DesktopClasses';
import { SubpageHeader } from '../common/SubpageHeader';
import { BulkTransferClassModal } from '../common/BulkTransferClassModal';

interface MobileStudentsViewProps {
  workspace: StudentWorkspace;
  onWorkspaceChange: (workspace: StudentWorkspace) => void;
  onViewClassStudents: (classId: string) => void;
  onOpenAddStudent?: () => void;
  onImportStudents?: () => void;
  onEditStudent: (student: Student) => void;
  onViewReport: (student: Student) => void;
  onPrintReport: (student: Student) => void;
  onViewProfile?: (student: Student) => void;
  onSendReportCards?: () => void;
  sendingCards?: boolean;
  cardError?: string | null;
  onViewPhotoCard?: (student: Student) => void;
  onViewCertificate?: (student: Student) => void;
}

export const MobileStudentsView: React.FC<MobileStudentsViewProps> = ({
  workspace,
  onWorkspaceChange,
  onViewClassStudents,
  onOpenAddStudent,
  onImportStudents,
  onEditStudent,
  onViewReport: _onViewReport,
  onPrintReport,
  onViewProfile,
  onSendReportCards,
  sendingCards,
  cardError,
  onViewPhotoCard,
  onViewCertificate,
}) => {
  const globalOpenProfile = useUIStore(s => s.openStudentProfile)
  const handleViewProfile = onViewProfile || globalOpenProfile

  const students = useStudentStore(s => s.students)
  const deleteStudent = useStudentStore(s => s.deleteStudent)
  const deleteStudents = useStudentStore(s => s.deleteStudents)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const classList = useClassStore(s => s.classes)
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
  const [pendingBulkTransfer, setPendingBulkTransfer] = React.useState(false);
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [confirmSendCards, setConfirmSendCards] = React.useState(false);

  const { can } = useAuth();
  const canDelete = can('admin');
  const canTransfer = can('admin', 'chunhiem');
  const canPromoteAction = can('admin', 'chunhiem');
  const managementActionCount = [
    canDelete && onOpenAddStudent,
    canDelete && onImportStudents,
    canDelete && onSendReportCards,
    canDelete,
  ]
    .filter(Boolean)
    .length

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
  const activeWorkspace: StudentWorkspace = workspace === 'classes'
    || (workspace === 'promotions' && !canPromoteAction)
    ? 'students'
    : workspace;
  const workspaceItems = [
    { value: 'students' as const, label: 'Danh Sách & Lớp', icon: <Users aria-hidden="true" size={14} /> },
    ...(canPromoteAction
      ? [{ value: 'promotions' as const, label: 'Thăng Tiến', icon: <TrendingUp aria-hidden="true" size={14} /> }]
      : []),
  ];

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
      {/* View Switcher Bar */}
      <div className="view-toolbar">
        <Tabs
          id="mobile-students-workspace-tabs"
          ariaLabel="Không gian quản lý thiếu nhi"
          items={workspaceItems}
          value={activeWorkspace}
          onValueChange={onWorkspaceChange}
          className="w-full"
        />
      </div>

      {cardError && (
        <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-[var(--color-parish-danger-bg)] border border-[var(--color-parish-danger)] text-xs font-semibold text-[var(--color-parish-danger-hover)]">
          <AlertCircle size={16} />
          <span>{cardError}</span>
        </div>
      )}

      <TabPanel tabsId="mobile-students-workspace-tabs" value="promotions" activeValue={activeWorkspace}>
        <div className="product-view flex flex-col gap-3 pb-8">
          <SubpageHeader
            icon={<TrendingUp size={16} />}
            title="Xét Lên Lớp & Chuyển Ngành"
            meta={<span className="truncate">Quản lý tiến trình hoàn thành chương trình giáo lý</span>}
          />
          <Suspense fallback={<div className="p-2"><SkeletonTable rows={6} cols={3} /></div>}>
            <PromotionPanel onViewPhotoCard={onViewPhotoCard} onViewCertificate={onViewCertificate} />
          </Suspense>
        </div>
      </TabPanel>
      <TabPanel
        tabsId="mobile-students-workspace-tabs"
        value="students"
        activeValue={activeWorkspace}
      >
        <div className="product-view flex flex-col gap-3 pb-8">
          <SubpageHeader
            icon={<Users size={16} />}
            title="Danh Sách Thiếu Nhi"
            meta={<span className="truncate">{selectedClassId === 'all' ? 'Toàn xứ đoàn' : (classList.find(c => c.id === selectedClassId)?.name || 'Theo lớp')} · {filteredStudents.length} em</span>}
            actions={
              <span className="attendance-total-badge tabular-nums">
                <Users size={13} aria-hidden="true" /> {filteredStudents.length} em
              </span>
            }
          />
          {/* Search & Actions — responsive: search full width + actions row */}
      <div className="flex flex-col gap-2.5">
        <div className="relative flex-1 block">
          <Search size={16} className="text-text-placeholder absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <TextInput
            aria-label="Tìm thiếu nhi"
            type="text"
            inputMode="search"
            placeholder="Tìm tên thánh, họ tên hoặc mã..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] rounded-xl text-sm"
            style={{ paddingLeft: '40px', paddingRight: searchQuery ? '42px' : '12px' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-main active:scale-95 transition-transform"
              aria-label="Xóa tìm kiếm"
            >
              <X size={16} />
            </button>
          )}
        </div>
        {managementActionCount > 0 && <div className={`grid gap-1.5 sm:gap-2 ${
          managementActionCount === 4 ? 'grid-cols-4' : managementActionCount === 3 ? 'grid-cols-3' : managementActionCount === 2 ? 'grid-cols-2' : 'grid-cols-1'
        }`}>
          {canDelete && onOpenAddStudent && <Button
            onClick={onOpenAddStudent}
            variant="primary"
            mobile
            fullWidth
            leadingIcon={<UserPlus aria-hidden="true" size={15} />}
            className="min-w-0 rounded-xl px-1.5 sm:px-2 text-xs shadow-sm"
            aria-label="Thêm thiếu nhi"
          >
            Thêm em
          </Button>}
          {canDelete && onImportStudents && <Button
            onClick={onImportStudents}
            variant="secondary"
            mobile
            fullWidth
            leadingIcon={<Upload aria-hidden="true" size={14} />}
            className="min-w-0 rounded-xl px-1.5 sm:px-2 text-xs"
            aria-label="Nhập danh sách thiếu nhi từ Excel"
          >
            Nhập Excel
          </Button>}
          {canDelete && onSendReportCards && (
            <Button
              onClick={() => setConfirmSendCards(true)}
              loading={sendingCards}
              loadingLabel="Gửi..."
              variant="secondary"
              mobile
              fullWidth
              leadingIcon={<Send aria-hidden="true" size={14} />}
              className="min-w-0 rounded-xl px-1.5 sm:px-2 text-xs"
              aria-label="Gửi kết quả học tập"
            >
              Gửi KQ
            </Button>
          )}
          {canDelete && (
            <Button
              onClick={toggleSelectionMode}
              variant={selectionMode ? 'primary' : 'secondary'}
              mobile
              fullWidth
              leadingIcon={<CheckSquare aria-hidden="true" size={14} />}
              className="min-w-0 rounded-xl px-1.5 sm:px-2 text-xs"
              aria-label={selectionMode ? 'Kết thúc chọn nhiều' : 'Chọn nhiều thiếu nhi'}
              aria-pressed={selectionMode}
            >
              {selectionMode ? 'Xong' : 'Chọn'}
            </Button>
          )}
        </div>}
      </div>

      {/* Catalog lớp và roster dùng chung một workspace, không còn tab lặp. */}
      {selectedClassId === 'all' && (
        <section aria-label="Lớp học và phân lớp" className="mt-3.5">
          <DesktopClasses embedded layout="grid" onViewClassStudents={onViewClassStudents} />
        </section>
      )}
      {selectedClassId !== 'all' && (
        <button onClick={() => setSelectedClassId('all')} className="flex items-center gap-1.5 text-xs font-bold text-parish-primary">
          <ChevronLeft size={14} /> Quay lại lưới lớp
        </button>
      )}

      {/* Class Selector Pill Bar — all staff can browse the parish-wide roster. */}
      {selectedClassId !== 'all' && (
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedClassId('all')}
          className={`py-2 px-4 rounded-2xl border-none min-h-[44px] text-xs font-bold whitespace-nowrap ${selectedClassId === 'all' ? 'bg-parish-primary text-text-inverse' : 'bg-surface-hover text-text-secondary'}`}
        >
          Tất cả lớp
        </button>
        {classList.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedClassId(c.id)}
            className={`py-2 px-4 rounded-2xl border-none min-h-[44px] text-xs font-bold whitespace-nowrap ${selectedClassId === c.id ? 'bg-parish-primary text-text-inverse' : 'bg-surface-hover text-text-secondary'}`}
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
            className={`px-3 py-2 rounded-xl font-bold transition-colors flex items-center gap-1 min-h-[44px] ${
              sortClassDirection === 'asc'
                ? 'bg-parish-primary text-text-inverse shadow-xs'
                : 'bg-surface-app text-text-secondary hover:bg-surface-hover'
            }`}
          >
            <ArrowDownAZ size={14} />
            <span>Thấp → Cao</span>
          </button>
          <button
            type="button"
            onClick={() => setSortClassDirection(prev => prev === 'desc' ? null : 'desc')}
            className={`px-3 py-2 rounded-xl font-bold transition-colors flex items-center gap-1 min-h-[44px] ${
              sortClassDirection === 'desc'
                ? 'bg-parish-primary text-text-inverse shadow-xs'
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
          <NoResultState
            title="Không tìm thấy thiếu nhi"
            description="Không tìm thấy thiếu nhi nào trong lớp này hoặc khớp với từ khóa tìm kiếm."
          />
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
                  <label className="absolute top-3 left-3 flex items-center justify-center w-6 h-6 rounded-md border bg-surface-card cursor-pointer has-[input:checked]:bg-[var(--color-parish-danger)] has-[input:checked]:border-[var(--color-parish-danger)] has-[input:checked]:text-text-inverse transition-colors after:absolute after:-inset-2.5 after:content-['']">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      className="sr-only"
                      aria-label={`Chọn ${s.holyName} ${s.fullName}`}
                    />
                    {selectedIds.has(s.id) ? <CheckSquare size={14} className="text-text-inverse" /> : <span className="w-3.5 h-3.5 rounded-sm border-2 border-surface-border block" />}
                  </label>
                )}
                <div
                  className={`flex justify-between items-start cursor-pointer group ${selectionMode ? 'pl-8' : ''}`}
                  onClick={() => handleViewProfile(s)}
                  title={`Xem hồ sơ chi tiết của ${s.holyName} ${s.fullName}`}
                >
                  <div className="min-w-0 overflow-hidden">
                    <StudentName
                      holyName={s.holyName}
                      fullName={s.fullName}
                      size="base"
                      layout="stacked"
                      fullNameClassName="group-hover:text-parish-primary transition-colors"
                    />
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
                    <span className="badge badge-primary text-xs font-bold mt-0.5 inline-flex">
                      {avg.label}
                    </span>
                  </div>
                </div>

                {/* Info row */}
                <div className="bg-surface-app text-text-secondary flex items-center justify-between text-xs px-2.5 py-2 rounded-xl border border-surface-border/60">
                  <div className="min-w-0 truncate flex items-center gap-1">
                    <span className="text-xs font-semibold">PH:</span> <strong className="truncate">{s.parentName || '—'}</strong>
                  </div>
                  {s.parentPhone && (
                      <a
                      href={`tel:${s.parentPhone}`}
                      className="text-parish-primary no-underline font-bold flex items-center gap-1 shrink-0 ml-2 min-h-[44px] px-2 rounded-lg bg-parish-primary-light/50 hover:bg-parish-primary-light transition-colors"
                    >
                      <Phone size={12} /> Gọi
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 border-t border-surface-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() => handleViewProfile(s)}
                    className="btn btn-secondary min-h-[44px] px-3 text-xs font-bold rounded-xl inline-flex items-center gap-1 text-parish-primary"
                  >
                    <UserRound size={13} /> Hồ Sơ
                  </button>
                  <button onClick={() => onPrintReport(s)} className="btn btn-secondary min-h-[44px] px-3 text-xs font-bold rounded-xl inline-flex items-center gap-1">
                    <Printer size={13} /> In Phiếu
                  </button>
                  <button onClick={() => onEditStudent(s)} className="btn btn-secondary min-h-[44px] px-3 text-xs font-bold rounded-xl inline-flex items-center gap-1">
                    <Edit3 size={13} /> Sửa
                  </button>
                  {!selectionMode && canDelete && (
                    <button onClick={() => handleDelete(s)} className="btn btn-secondary min-h-[44px] min-w-[44px] p-0 rounded-xl flex items-center justify-center" aria-label={`Xóa ${s.fullName}`}>
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
            <Select
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value
              handlePageSizeChange(val === 'all' ? totalFiltered : Number(val))
            }}
            className="text-xs min-h-[44px] rounded-xl"
            aria-label="Số lượng mỗi trang"
          >
            <option value="50">50 / trang</option>
            <option value="100">100 / trang</option>
            <option value="200">200 / trang</option>
            <option value="all">Tất cả</option>
          </Select>
          <div className="text-text-muted text-xs font-semibold tabular-nums whitespace-nowrap">Trang {safePage}/{totalPages}</div>
          <div className="flex gap-1.5">
            <IconButton
              onClick={() => handlePageChange(safePage - 1)}
              disabled={safePage <= 1}
              label="Trang trước"
              icon={<ChevronLeft aria-hidden="true" size={16} />}
              variant="secondary"
              mobile
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl border border-surface-border bg-surface-card flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
            />
            <IconButton
              onClick={() => handlePageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              label="Trang sau"
              icon={<ChevronRight aria-hidden="true" size={16} />}
              variant="secondary"
              mobile
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl border border-surface-border bg-surface-card flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
            />
          </div>
        </div>
      )}
      </>
      )}
      </div>
      </TabPanel>
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
            {canTransfer && (
              <button
                type="button"
                onClick={() => setPendingBulkTransfer(true)}
                className="btn mobile-btn btn-secondary flex items-center gap-1.5"
              >
                <ArrowRightLeft size={14} /> Chuyển lớp
              </button>
            )}
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
      {pendingBulkTransfer && (
        <BulkTransferClassModal
          isOpen={pendingBulkTransfer}
          studentIds={selectedStudents.map((s) => s.id)}
          onClose={() => setPendingBulkTransfer(false)}
          onSuccess={() => {
            clearSelection();
            setSelectionMode(false);
            setPendingBulkTransfer(false);
          }}
        />
      )}
    </>
  );
};
