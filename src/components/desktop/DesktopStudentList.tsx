import React, { useState, useMemo, useCallback } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table';
import {
  UserPlus, Search, Edit2, Trash2,
  FileText, Camera, Upload, CheckCircle2, ChevronLeft,
  ChevronRight, CheckSquare, Square,
  Users, ArrowUpDown, ArrowDownAZ, ArrowDownZA, X, ArrowRightLeft,
  UserRound, Lock
} from 'lucide-react';
import { useClassStore, canUserAccessClass, canUserEditStudent } from '../../stores/classStore';
import { useStudentStore } from '../../stores/studentStore';
import { useToastStore } from '../../stores/toastStore';
import { useFilterStore } from '../../stores/filterStore';
import { useUIStore } from '../../stores/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState, NoResultState } from '../common/StateFeedback';
import { compareClassHierarchy } from '../../utils/classSort';
import type { Student } from '../../types';
import { Button, IconButton } from '../common/ui/Button';
import { Select, TextInput } from '../common/ui/FormControls';
import { DesktopClasses } from './DesktopClasses';
import { BulkTransferClassModal } from '../common/BulkTransferClassModal';

interface DesktopStudentListProps {
  onOpenAddStudent?: () => void;
  onImportStudents?: () => void;
  onEditStudent: (student: Student) => void;
  onViewReport: (student: Student) => void;
  onViewPhotoCard: (student: Student) => void;
  onViewProfile?: (student: Student) => void;
}

const columnHelper = createColumnHelper<Student>();

export const DesktopStudentList: React.FC<DesktopStudentListProps> = ({
  onOpenAddStudent,
  onImportStudents,
  onEditStudent,
  onViewReport,
  onViewPhotoCard,
  onViewProfile,
}) => {
  const { role, isAdmin, isChunhiem, isPhuta } = useAuth();
  const students = useStudentStore((s) => s.students);
  const selectedClassId = useFilterStore((s) => s.selectedClassId);
  const setSelectedClassId = useFilterStore((s) => s.setSelectedClassId);
  const selectedBranchId = useFilterStore((s) => s.selectedBranchId);
  const setSelectedBranchId = useFilterStore((s) => s.setSelectedBranchId);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const classes = useClassStore((s) => s.classes);

  const isCurrentClassAssigned = canUserAccessClass(selectedClassId, classes, role);
  const canEdit = isAdmin || isChunhiem || isPhuta;
  const canDelete = isAdmin;
  const canTransfer = isAdmin || (isChunhiem && isCurrentClassAssigned);

  // 2026-08-22: mặc định xếp theo cấp bậc lớp (Chiến Con → Ấu Nhi → Thiếu Nhi →
  // Nghĩa Sĩ → Hiệp Sĩ; trong lớp theo tên) thay vì thứ tự nhập từ server
  // (Excel nhập A-Z nên trông như alphabet) — nút "Sắp Xếp Cấp Bậc Lớp" bật sẵn.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'classId', desc: false }]);
  // Phải khớp một option của select "Xem" (50/100/200/all) — trước đây default 20
  // không tồn tại trong options khiến select hiển thị giá trị trống/misleading.
  const [pageSize, setPageSize] = useState(50);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [pendingBulkTransfer, setPendingBulkTransfer] = useState(false);

  // Filter logic
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchClass = selectedClassId === 'all' || s.classId === selectedClassId;
      const matchBranch = selectedBranchId === 'all' || s.branch === selectedBranchId;
      const matchSearch = !searchQuery ||
        s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.holyName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchClass && matchBranch && matchSearch;
    });
  }, [students, selectedClassId, selectedBranchId, searchQuery]);

  const totalFiltered = filteredStudents.length;
  const totalPages = Math.ceil(totalFiltered / pageSize);
  const start = pageIndex * pageSize;
  const pagedStudents = useMemo(() => filteredStudents.slice(start, start + pageSize), [filteredStudents, start, pageSize]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPageIndex(0);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectPage = () => {
    const allOnPageSelected = pagedStudents.every(s => selectedIds.has(s.id));
    const next = new Set(selectedIds);
    pagedStudents.forEach(s => {
      if (allOnPageSelected) next.delete(s.id);
      else next.add(s.id);
    });
    setSelectedIds(next);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleDelete = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    try {
      await useStudentStore.getState().deleteStudents(ids);
      useToastStore.getState().addToast(`Đã xóa ${ids.length} thiếu nhi`, 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể xóa thiếu nhi. Vui lòng thử lại.';
      useToastStore.getState().addToast(msg, 'error');
    }
  }, []);

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => {
        const meta = table.options.meta as any;
        return (
          <button onClick={meta.toggleSelectPage} aria-label="Chọn tất cả học viên trên trang" className="p-1 text-text-muted hover:text-parish-primary transition-colors">
            {meta.pagedStudents.length > 0 && meta.pagedStudents.every((s: Student) => meta.selectedIds.has(s.id)) ? 
              <CheckSquare size={18} className="text-parish-primary" /> : <Square size={18} />
            }
          </button>
        );
      },
      cell: (info) => {
        const meta = info.table.options.meta as any;
        return (
          <button onClick={() => meta.toggleSelect(info.row.original.id)} aria-label="Chọn học viên" className="p-1 text-text-muted hover:text-parish-primary transition-colors">
            {meta.selectedIds.has(info.row.original.id) ? 
              <CheckSquare size={18} className="text-parish-primary" /> : <Square size={18} />
            }
          </button>
        );
      },
      size: 40,
    }),
    columnHelper.accessor('code', {
      header: 'Mã',
      cell: (info) => <span className="font-mono text-sm font-bold text-text-secondary">{info.getValue()}</span>,
      size: 90,
    }),
    columnHelper.accessor('holyName', {
      header: 'Tên Thánh',
      cell: (info) => <span className="text-sm font-bold text-amber-950 dark:text-amber-400">{info.getValue() || '—'}</span>,
      size: 120,
    }),
    columnHelper.accessor('fullName', {
      header: 'Họ và Tên',
      cell: (info) => {
        const meta = info.table.options.meta as any;
        return (
          <button
            type="button"
            onClick={() => meta.onViewProfile?.(info.row.original)}
            className="text-left font-extrabold text-base text-text-main hover:text-parish-primary hover:underline transition-colors flex items-center gap-1 group cursor-pointer bg-transparent border-0 p-0"
            title={`Bấm để xem hồ sơ chi tiết của ${info.row.original.holyName} ${info.getValue()}`}
          >
            <span>{info.getValue()}</span>
          </button>
        );
      },
      size: 200,
    }),
    columnHelper.accessor('classId', {
      header: ({ column }) => {
        const sorted = column.getIsSorted()
        return (
          <button
            type="button"
            onClick={() => column.toggleSorting(sorted === 'asc')}
            className="flex items-center gap-1.5 hover:text-text-main transition-colors font-bold text-xs uppercase tracking-wider bg-transparent border-none cursor-pointer p-0 text-text-muted"
            title="Nhấp để đảo chiều sắp xếp theo cấp bậc lớp"
          >
            <span>Lớp</span>
            <ArrowUpDown size={13} className={sorted ? 'text-parish-primary' : 'text-text-muted opacity-60'} />
          </button>
        )
      },
      sortingFn: (rowA, rowB) => {
        const clsA = classes.find(c => c.id === rowA.original.classId) || { name: '', branchId: rowA.original.branch }
        const clsB = classes.find(c => c.id === rowB.original.classId) || { name: '', branchId: rowB.original.branch }
        return compareClassHierarchy(clsA, clsB, 'asc')
      },
      cell: (info) => {
        const meta = info.table.options.meta as any;
        const cls = meta.classes.find((c: any) => c.id === info.getValue());
        return <span className="text-sm font-bold text-text-secondary">{cls?.name || info.getValue()}</span>;
      },
      size: 110,
    }),
    columnHelper.accessor('status', {
      header: 'Trạng thái',
      cell: (info) => {
        const status = info.getValue();
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
            status === 'Đang học' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'bg-surface-hover text-text-secondary border-surface-border'
          }`}>
            {status}
          </span>
        );
      },
      size: 120,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: (info) => {
        const meta = info.table.options.meta as any;
        return (
          <div className="flex items-center gap-1.5">
            <IconButton
              onClick={() => meta.onViewProfile?.(info.row.original)}
              title="Xem hồ sơ chi tiết"
              label="Xem hồ sơ chi tiết"
              icon={<UserRound aria-hidden="true" size={16} />}
              variant="plain"
              size="sm"
              className="p-1.5 rounded-lg hover:bg-parish-primary-light text-parish-primary transition-colors"
            />
            <IconButton
              onClick={() => meta.onViewReport(info.row.original)}
              title="Xem kết quả học tập"
              label="Xem kết quả học tập"
              icon={<FileText aria-hidden="true" size={16} />}
              variant="plain"
              size="sm"
              className="p-1.5 rounded-lg hover:bg-parish-primary-light text-parish-primary transition-colors"
            />
            <IconButton
              onClick={() => meta.onViewPhotoCard(info.row.original)}
              title="Xem thẻ ảnh"
              label="Xem thẻ ảnh"
              icon={<Camera aria-hidden="true" size={16} />}
              variant="plain"
              size="sm"
              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
            />
            {meta.canEditStudent?.(info.row.original) && (
              <IconButton
                onClick={() => meta.onEditStudent(info.row.original)}
                title="Chỉnh sửa"
                label="Chỉnh sửa học viên"
                icon={<Edit2 aria-hidden="true" size={16} />}
                variant="plain"
                size="sm"
                className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
              />
            )}
          </div>
        );
      },
      size: 150,
    }),
  ], [classes]);

  const globalOpenProfile = useUIStore((s) => s.openStudentProfile);
  const handleViewProfile = onViewProfile || globalOpenProfile;

  const table = useReactTable({
    data: pagedStudents,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      pagedStudents,
      selectedIds,
      toggleSelectPage,
      toggleSelect,
      canEdit,
      canEditStudent: (student: Student) => (isAdmin || isChunhiem) && canUserEditStudent(student, classes, role),
      onViewProfile: handleViewProfile,
      onViewReport,
      onViewPhotoCard,
      onEditStudent,
      classes,
    },
  });

  // Lưới lớp — khi đang xem "Tất cả", hiển thị các lớp để bấm vào xem học viên từng lớp
  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId)
    setPageIndex(0)
    clearSelection()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBackToClasses = () => {
    setSelectedClassId('all')
    setPageIndex(0)
    clearSelection()
  }

  return (
    <div className="product-view flex flex-col gap-3 sm:gap-3.5">
      {/* Subtab Controls Command Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-1.5 rounded-xl border border-surface-border bg-surface-card shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <Users size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text-primary truncate">
              Danh Sách Thiếu Nhi
            </h2>
            <div className="text-xs text-text-muted truncate hidden xl:block">
              {selectedClassId !== 'all' ? (
                <span className="inline-flex items-center gap-1">
                  <button onClick={handleBackToClasses} className="text-parish-primary hover:underline font-bold">
                    Tất cả lớp
                  </button>
                  <span>/</span>
                  <span className="font-bold text-parish-primary">{classes.find(c => c.id === selectedClassId)?.name || 'Lớp'}</span>
                  <span>({totalFiltered} em)</span>
                </span>
              ) : (
                <span>
                  Hiển thị <strong className="text-parish-primary">{start + 1}-{Math.min(start + pageSize, totalFiltered)}</strong> / {totalFiltered} em
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {/* Quick Search */}
          <div className="relative min-w-[160px] max-w-[220px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-placeholder pointer-events-none" />
            <TextInput
              density="sm"
              type="text"
              placeholder="Tìm theo tên, mã thiếu nhi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 text-xs font-medium rounded-xl !pl-8 !pr-7 bg-surface-hover text-text-main placeholder:text-text-placeholder focus:bg-surface-card transition-colors shadow-inner"
            />
            {searchQuery && (
              <IconButton
                onClick={() => setSearchQuery('')}
                label="Xóa tìm kiếm"
                icon={<X aria-hidden="true" size={13} />}
                variant="quiet"
                size="sm"
                className="absolute right-0.5 top-1/2 -translate-y-1/2"
              />
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-surface-hover px-2 py-0.5 rounded-lg border border-surface-border shadow-inner shrink-0">
            <span className="text-[10px] font-black text-text-secondary uppercase whitespace-nowrap">Xem:</span>
            <Select
              aria-label="Số dòng mỗi trang"
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value
                handlePageSizeChange(val === 'all' ? totalFiltered : Number(val))
              }}
              className="text-xs font-bold !border-none bg-transparent outline-none cursor-pointer pr-1 h-7"
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="all">Tất cả</option>
            </Select>
          </div>

          {/* Nút Sắp Xếp Cấp Bậc Lớp */}
          <div className="flex items-center bg-surface-hover p-0.5 rounded-lg border border-surface-border shadow-inner gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (sorting[0]?.id === 'classId' && !sorting[0]?.desc) {
                  setSorting([])
                } else {
                  setSorting([{ id: 'classId', desc: false }])
                }
              }}
              className={`px-2 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${
                sorting[0]?.id === 'classId' && !sorting[0]?.desc
                  ? 'bg-parish-primary text-text-inverse shadow-xs'
                  : 'text-text-secondary hover:bg-surface-card hover:text-text-main'
              }`}
              title="Sắp xếp lớp từ thấp đến cao"
            >
              <ArrowDownAZ size={13} />
              <span className="hidden 2xl:inline">Thấp → Cao</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (sorting[0]?.id === 'classId' && sorting[0]?.desc) {
                  setSorting([])
                } else {
                  setSorting([{ id: 'classId', desc: true }])
                }
              }}
              className={`px-2 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${
                sorting[0]?.id === 'classId' && sorting[0]?.desc
                  ? 'bg-parish-primary text-text-inverse shadow-xs'
                  : 'text-text-secondary hover:bg-surface-card hover:text-text-main'
              }`}
              title="Sắp xếp lớp từ cao đến thấp"
            >
              <ArrowDownZA size={13} />
              <span className="hidden 2xl:inline">Cao → Thấp</span>
            </button>
          </div>

          {isAdmin && onImportStudents && onOpenAddStudent && (
            <div className="flex gap-1.5 shrink-0">
              <Button
                onClick={onImportStudents}
                variant="secondary"
                size="sm"
                leadingIcon={<Upload aria-hidden="true" size={13} />}
                className="h-8 px-2.5 text-xs font-bold rounded-xl shadow-xs whitespace-nowrap"
              >
                Import Excel
              </Button>
              <Button
                onClick={onOpenAddStudent}
                variant="primary"
                size="sm"
                leadingIcon={<UserPlus aria-hidden="true" size={13} />}
                className="h-8 px-2.5 text-xs font-bold rounded-xl shadow-xs whitespace-nowrap"
              >
                Thêm Mới
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Một index duy nhất: catalog/CRUD lớp ở cấp đầu, roster khi drill-down. */}
      {selectedClassId === 'all' && (
        <section aria-label="Lớp học và phân lớp">
          <DesktopClasses embedded
            layout="grid"
            onViewClassStudents={handleSelectClass}
            sortDirection={sorting[0]?.id === 'classId' && sorting[0]?.desc ? 'desc' : 'asc'}
          />
        </section>
      )}

      {/* Khi đã chọn 1 lớp cụ thể, hiện danh sách học viên của lớp đó */}
      {selectedClassId !== 'all' && (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <button onClick={handleBackToClasses} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-hover border border-surface-border text-text-secondary font-bold hover:bg-surface-card hover:text-parish-primary transition-colors">
            <ChevronLeft size={14} /> Quay lại lưới lớp
          </button>
          <span className="text-text-muted">Đang xem lớp <strong className="text-parish-primary">{classes.find(c => c.id === selectedClassId)?.name}</strong> — {totalFiltered} em</span>
          {!isAdmin && !isCurrentClassAssigned && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-bold">
              <Lock size={12} /> Chỉ xem (Không phụ trách)
            </span>
          )}
        </div>
      )}

      {/* Bulk Action Bar — chỉ hiện khi đã vào danh sách lớp cụ thể hoặc đang xem tất cả qua nút */}
      {(selectedClassId !== 'all' ? selectedIds.size > 0 : false) && (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl px-6 py-3.5 flex items-center justify-between gap-4 shadow-xl sticky top-4 z-20 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-lg">
              <CheckCircle2 size={18} />
            </div>
            <p className="text-sm font-black text-white m-0">
              Đã chọn <span className="text-blue-400">{selectedIds.size}</span> thiếu nhi
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={clearSelection} className="px-4 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition-colors">
              Bỏ chọn
            </button>
            {canTransfer && (
              <button
                type="button"
                onClick={() => setPendingBulkTransfer(true)}
                className="btn btn-primary text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <ArrowRightLeft size={14} /> Chuyển lớp
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setPendingBulkDelete(true)}
                className="btn btn-danger text-xs font-bold flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Xóa đã chọn
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table Section — chỉ hiện khi đã chọn 1 lớp cụ thể, khi đang xem lưới lớp thì ẩn */}
      {selectedClassId !== 'all' && (
      <div className="app-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-base text-left border-collapse bg-surface-card text-text-main">
            <thead>
              <tr className="bg-surface-app border-b-2 border-surface-border">
                {table.getHeaderGroups().map(headerGroup => (
                  headerGroup.headers.map(header => (
                    <th key={header.id} className="px-4.5 py-3 font-bold text-text-muted text-xs uppercase tracking-wider" style={{ width: header.getSize() }} scope="col">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-hover bg-surface-card">
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="bg-surface-card hover:bg-surface-app transition-colors group">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4.5 py-2.5 sm:py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Empty / No result states */}
        {totalFiltered === 0 && (
          students.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="Chưa có thiếu nhi nào"
                description="Danh sách thiếu nhi hiện đang trống. Hãy thêm mới hoặc import từ file Excel."
                actionLabel={isAdmin && onOpenAddStudent ? "Thêm thiếu nhi" : undefined}
                onAction={isAdmin ? onOpenAddStudent : undefined}
              />
            </div>
          ) : (
            <div className="p-8">
              <NoResultState
                onReset={() => {
                  setSearchQuery('')
                  setSelectedBranchId('all')
                  setSelectedClassId('all')
                }}
              />
            </div>
          )
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="px-4.5 py-2.5 sm:py-3 bg-surface-app border-t border-surface-border flex items-center justify-between">
            <p className="text-xs font-bold text-text-secondary">
              Trang <span className="text-text-main">{pageIndex + 1}</span> / {totalPages}
            </p>
            <div className="flex gap-2">
              <IconButton
                disabled={pageIndex === 0}
                onClick={() => setPageIndex(p => p - 1)}
                label="Trang trước"
                icon={<ChevronLeft aria-hidden="true" size={16} />}
                variant="secondary"
                className="p-2 rounded-xl border border-surface-border bg-surface-card text-text-secondary disabled:opacity-30 transition-all hover:bg-surface-hover active:scale-90 shadow-sm"
              />
              <IconButton
                disabled={pageIndex >= totalPages - 1}
                onClick={() => setPageIndex(p => p + 1)}
                label="Trang sau"
                icon={<ChevronRight aria-hidden="true" size={16} />}
                variant="secondary"
                className="p-2 rounded-xl border border-surface-border bg-surface-card text-text-secondary disabled:opacity-30 transition-all hover:bg-surface-hover active:scale-90 shadow-sm"
              />
            </div>
          </div>
        )}
      </div>
      )}

      <ConfirmDialog
        isOpen={pendingBulkDelete}
        title="Xóa nhiều thiếu nhi"
        message={`Bạn có chắc chắn muốn xóa ${selectedIds.size} thiếu nhi đã chọn? Hành động này không thể hoàn tác.`}
        confirmText="Đồng ý xóa"
        variant="danger"
        onConfirm={() => {
          handleDelete(Array.from(selectedIds));
          setSelectedIds(new Set());
          setPendingBulkDelete(false);
        }}
        onCancel={() => setPendingBulkDelete(false)}
      />

      {pendingBulkTransfer && (
        <BulkTransferClassModal
          isOpen={pendingBulkTransfer}
          studentIds={Array.from(selectedIds)}
          onClose={() => setPendingBulkTransfer(false)}
          onSuccess={() => {
            setSelectedIds(new Set());
            setPendingBulkTransfer(false);
          }}
        />
      )}
    </div>
  );
};

export default DesktopStudentList;
