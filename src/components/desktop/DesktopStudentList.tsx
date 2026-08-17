import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table';
import {
  UserPlus, Search, Filter, MoreVertical, Edit2, Trash2,
  FileText, Camera, Upload, CheckCircle2, XCircle, ChevronLeft,
  ChevronRight, Download, School, AlertCircle, Send, CheckSquare, Square,
  Users, ArrowUpDown, ArrowDownAZ, ArrowDownZA
} from 'lucide-react';
import { useClassStore } from '../../stores/classStore';
import { useStudentStore } from '../../stores/studentStore';
import { useToastStore } from '../../stores/toastStore';
import { useFilterStore } from '../../stores/filterStore';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from '@tanstack/react-router';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState, NoResultState } from '../common/StateFeedback';
import { PageHeader } from '../common/PageHeader';
import { compareClassHierarchy } from '../../utils/classSort';
import type { Student } from '../../types';

interface DesktopStudentListProps {
  onOpenAddStudent: () => void;
  onImportStudents: () => void;
  onEditStudent: (student: Student) => void;
  onViewReport: (student: Student) => void;
  onViewPhotoCard: (student: Student) => void;
}

export const DesktopStudentList: React.FC<DesktopStudentListProps> = ({
  onOpenAddStudent,
  onImportStudents,
  onEditStudent,
  onViewReport,
  onViewPhotoCard,
}) => {
  const navigate = useNavigate();
  const { isAdmin, isChunhiem, isPhuta } = useAuth();
  const canEdit = isAdmin || isChunhiem || isPhuta;
  const canDelete = isAdmin;

  const students = useStudentStore((s) => s.students);
  const selectedClassId = useFilterStore((s) => s.selectedClassId);
  const setSelectedClassId = useFilterStore((s) => s.setSelectedClassId);
  const selectedBranchId = useFilterStore((s) => s.selectedBranchId);
  const setSelectedBranchId = useFilterStore((s) => s.setSelectedBranchId);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const classes = useClassStore((s) => s.classes);
  const hasClasses = classes.length > 0;

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageSize, setPageSize] = useState(20);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

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

  const columnHelper = createColumnHelper<Student>();

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
      cell: (info) => <span className="text-sm font-bold text-parish-primary">{info.getValue()}</span>,
      size: 120,
    }),
    columnHelper.accessor('fullName', {
      header: 'Họ và Tên',
      cell: (info) => <span className="text-base font-extrabold text-text-main">{info.getValue()}</span>,
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
            <button
              onClick={() => meta.onViewReport(info.row.original)}
              title="Xem kết quả học tập"
              aria-label="Xem kết quả học tập"
              className="p-1.5 rounded-lg hover:bg-parish-primary-light text-parish-primary transition-colors"
            >
              <FileText size={16} />
            </button>
            <button
              onClick={() => meta.onViewPhotoCard(info.row.original)}
              title="Xem thẻ ảnh"
              aria-label="Xem thẻ ảnh"
              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
            >
              <Camera size={16} />
            </button>
            {meta.canEdit && (
              <button
                onClick={() => meta.onEditStudent(info.row.original)}
                title="Chỉnh sửa"
                aria-label="Chỉnh sửa học viên"
                className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
              >
                <Edit2 size={16} />
              </button>
            )}
          </div>
        );
      },
      size: 120,
    }),
  ], []);

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
      onViewReport,
      onViewPhotoCard,
      onEditStudent,
      classes,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header card */}
      <PageHeader
        icon={<Users className="text-parish-primary" size={24} />}
        title="Danh Sách Thiếu Nhi"
        description={
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
            Hiển thị <span className="text-parish-primary font-bold">{start + 1}-{Math.min(start + pageSize, totalFiltered)}</span> trên tổng số <span className="text-parish-primary font-bold">{totalFiltered}</span> em
          </span>
        }
        actions={
          <>
            {/* Quick Search */}
            <div className="relative w-56">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
              <input
                type="text"
                placeholder="Tìm theo tên, mã thiếu nhi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 text-xs font-medium rounded-xl outline-none pl-9 pr-8 bg-surface-hover text-text-main placeholder:text-text-placeholder border border-surface-border focus:bg-surface-card focus:border-parish-primary transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-placeholder hover:text-text-secondary text-xs font-bold"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 bg-surface-hover p-1 rounded-xl border border-surface-border shadow-inner">
              <span className="text-[10px] font-black text-text-secondary uppercase px-2">Xem:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value
                  handlePageSizeChange(val === 'all' ? totalFiltered : Number(val))
                }}
                className="text-xs font-bold border-none bg-transparent outline-none cursor-pointer pr-2"
              >
                <option value="50">50 / trang</option>
                <option value="100">100 / trang</option>
                <option value="200">200 / trang</option>
                <option value="all">Tất cả</option>
              </select>
            </div>

            {/* Nút Sắp Xếp Cấp Bậc Lớp */}
            <div className="flex items-center bg-surface-hover p-1 rounded-xl border border-surface-border shadow-inner gap-1">
              <button
                type="button"
                onClick={() => {
                  if (sorting[0]?.id === 'classId' && !sorting[0]?.desc) {
                    setSorting([])
                  } else {
                    setSorting([{ id: 'classId', desc: false }])
                  }
                }}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  sorting[0]?.id === 'classId' && !sorting[0]?.desc
                    ? 'bg-parish-primary text-white shadow-xs'
                    : 'text-text-secondary hover:bg-surface-card hover:text-text-main'
                }`}
                title="Sắp xếp danh sách học sinh theo lớp từ thấp đến cao (Chiên -> Ấu 1A -> Ấu 1B...)"
              >
                <ArrowDownAZ size={14} />
                <span>Lớp: Thấp → Cao</span>
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
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  sorting[0]?.id === 'classId' && sorting[0]?.desc
                    ? 'bg-parish-primary text-white shadow-xs'
                    : 'text-text-secondary hover:bg-surface-card hover:text-text-main'
                }`}
                title="Sắp xếp danh sách học sinh theo lớp từ cao đến thấp (Hiệp 2 -> ... -> Chiên)"
              >
                <ArrowDownZA size={14} />
                <span>Lớp: Cao → Thấp</span>
              </button>
            </div>
            
            {canEdit && (
              <div className="flex gap-2">
                <button 
                  onClick={onImportStudents} 
                  className="flex items-center gap-1.5 px-4 py-2 bg-surface-card border border-surface-border text-text-main font-bold text-xs rounded-xl shadow-sm hover:bg-surface-hover transition-all active:scale-95"
                >
                  <Upload size={14} /> Import Excel
                </button>
                <button 
                  onClick={onOpenAddStudent} 
                  className="flex items-center gap-1.5 px-4 py-2 bg-parish-primary text-white font-bold text-xs rounded-xl shadow-md hover:bg-parish-primary-hover transition-all active:scale-95"
                >
                  <UserPlus size={14} /> Thêm Mới
                </button>
              </div>
            )}
          </>
        }
      />

      {/* Warning if no classes */}
      {canEdit && !hasClasses && (
        <div className="bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
            <School size={20} />
          </div>
          <div>
            <p className="text-sm font-black text-amber-900 m-0 uppercase tracking-wide">Chưa có lớp học</p>
            <p className="text-xs text-amber-800 mt-1 m-0 font-bold">
              Bạn cần tạo lớp học trước khi thêm thiếu nhi.
              <button className="ml-2 text-parish-primary underline decoration-2 underline-offset-2" onClick={() => navigate({ to: '/classes' })}>
                Quản lý lớp học →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
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

      {/* Table Section */}
      <div className="bg-surface-card rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-base text-left border-collapse bg-surface-card text-text-main">
            <thead>
              <tr className="bg-surface-app border-b-2 border-surface-border">
                {table.getHeaderGroups().map(headerGroup => (
                  headerGroup.headers.map(header => (
                    <th key={header.id} className="px-6 py-4.5 font-bold text-text-muted text-xs uppercase tracking-wider" style={{ width: header.getSize() }} scope="col">
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
                    <td key={cell.id} className="px-6 py-4 align-middle">
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
                actionLabel={canEdit ? "Thêm thiếu nhi" : undefined}
                onAction={canEdit ? onOpenAddStudent : undefined}
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
          <div className="px-6 py-4 bg-surface-app border-t border-surface-border flex items-center justify-between">
            <p className="text-xs font-bold text-text-secondary">
              Trang <span className="text-text-main">{pageIndex + 1}</span> / {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={pageIndex === 0}
                onClick={() => setPageIndex(p => p - 1)}
                className="p-2 rounded-xl border border-surface-border bg-surface-card text-text-secondary disabled:opacity-30 transition-all hover:bg-surface-hover active:scale-90 shadow-sm"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={pageIndex >= totalPages - 1}
                onClick={() => setPageIndex(p => p + 1)}
                className="p-2 rounded-xl border border-surface-border bg-surface-card text-text-secondary disabled:opacity-30 transition-all hover:bg-surface-hover active:scale-90 shadow-sm"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
};
