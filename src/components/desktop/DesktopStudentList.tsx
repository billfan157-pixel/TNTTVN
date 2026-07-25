import React, { useMemo, useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useFilterStore } from '../../stores/filterStore';
import type { Student } from '../../types';
import { BRANCHES } from '../../data/mockParishData';
import { useClassStore } from '../../stores/classStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { UserPlus, Edit3, Trash2, Printer, Phone, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface DesktopStudentListProps {
  onOpenAddStudent: () => void;
  onEditStudent: (student: Student) => void;
  onViewReport: (student: Student) => void;
  onViewPhotoCard: (student: Student) => void;
}

interface RowData {
  student: Student;
  avg: { score: number | null; label: string };
  att: { rate: number; presentCount: number; totalCount: number };
}

export const DesktopStudentList: React.FC<DesktopStudentListProps> = ({
  onOpenAddStudent, onEditStudent, onViewReport, onViewPhotoCard
}) => {
  const students = useStudentStore(s => s.students);
  const deleteStudent = useStudentStore(s => s.deleteStudent);
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg);
  const getStudentAttendanceRate = useAttendanceStore(s => s.getStudentAttendanceRate);
  const selectedClassId = useFilterStore(s => s.selectedClassId);
  const selectedBranchId = useFilterStore(s => s.selectedBranchId);
  const searchQuery = useFilterStore(s => s.searchQuery);
  const selectedSemester = useFilterStore(s => s.selectedSemester);

  const { can } = useAuth();
  const canEdit = can('admin', 'chunhiem');
  const canDelete = can('admin');

  const [sorting, setSorting] = useState<SortingState>([]);

  const filteredStudents = useMemo(
    () => students.filter(s => {
      if (selectedBranchId !== 'all' && s.branch !== selectedBranchId) return false;
      if (selectedClassId !== 'all' && s.classId !== selectedClassId) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        if (!s.holyName.toLowerCase().includes(q) &&
            !s.fullName.toLowerCase().includes(q) &&
            !s.code.toLowerCase().includes(q) &&
            !s.parentName.toLowerCase().includes(q)) return false;
      }
      return true;
    }),
    [students, selectedBranchId, selectedClassId, searchQuery]
  );

  const tableData = useMemo<RowData[]>(
    () => filteredStudents.map(s => ({
      student: s,
      avg: calculateStudentAvg(s.id, selectedSemester),
      att: getStudentAttendanceRate(s.id),
    })),
    [filteredStudents, calculateStudentAvg, getStudentAttendanceRate, selectedSemester]
  );

  const [pendingDelete, setPendingDelete] = useState<Student | null>(null);

  const handleDelete = useCallback((s: Student) => {
    setPendingDelete(s);
  }, []);

  const columnHelper = createColumnHelper<RowData>();

  const colWidths: Record<string, string> = {
    code: '90px',
    name: '260px',
    class: '190px',
    dob: '110px',
    parent: '200px',
    avg: '110px',
    attendance: '110px',
    actions: '190px',
  };

  const columns = useMemo(() => [
    columnHelper.accessor(row => row.student.code, {
      id: 'code',
      header: 'Mã TN',
      enableSorting: true,
      cell: info => <span className="font-semibold text-text-muted">{info.getValue()}</span>,
    }),
    columnHelper.accessor(row => `${row.student.holyName} ${row.student.fullName}`, {
      id: 'name',
      header: 'Tên Thánh & Họ Tên',
      enableSorting: true,
      cell: info => {
        const s = info.row.original.student;
        return (
          <>
            <div className="font-bold text-text-main truncate min-w-0" title={`${s.holyName} ${s.fullName}`}>
              <span className="text-parish-secondary font-bold mr-1.5">{s.holyName}</span>
              <span>{' '}{s.fullName}</span>
            </div>
            {s.notes && <div className="text-xs text-text-muted italic truncate min-w-0">{s.notes}</div>}
          </>
        );
      },
    }),
    columnHelper.accessor(row => {
      const branch = BRANCHES[row.student.branch];
      const cls = useClassStore.getState().findClassById(row.student.classId);
      return `${branch?.name || ''} ${cls?.name || ''}`;
    }, {
      id: 'class',
      header: 'Ngành & Lớp',
      enableSorting: true,
      cell: info => {
        const s = info.row.original.student;
        const branch = BRANCHES[s.branch];
        const cls = useClassStore.getState().findClassById(s.classId);
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="badge shrink-0" style={{ background: branch?.badgeBg, color: branch?.textColor }}>
              {branch?.name}
            </span>
            <span className="font-semibold text-parish-primary truncate min-w-0">{cls?.name}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor(row => row.student.dateOfBirth || '', {
      id: 'dob',
      header: 'Ngày Sinh',
      enableSorting: true,
      cell: info => <span className="text-text-muted">{info.getValue() || '-'}</span>,
    }),
    columnHelper.accessor(row => `${row.student.parentName} ${row.student.parentPhone}`, {
      id: 'parent',
      header: 'Phụ Huynh & SĐT',
      enableSorting: false,
      cell: info => {
        const s = info.row.original.student;
        return (
          <>
            <div className="font-medium truncate text-slate-700" title={s.parentName || ''}>{s.parentName || '-'}</div>
            <div className="text-xs text-text-muted flex items-center gap-1 truncate">
              <Phone size={12} /> {s.parentPhone || '-'}
            </div>
          </>
        );
      },
    }),
    columnHelper.accessor(row => row.avg.score ?? -1, {
      id: 'avg',
      header: 'Điểm TB',
      enableSorting: true,
      sortingFn: (a, b) => (a.original.avg.score ?? -1) - (b.original.avg.score ?? -1),
      cell: info => {
        const avg = info.row.original.avg;
        return (
          <div className="flex flex-col items-center justify-center gap-0.5">
            <div className="font-extrabold text-base text-parish-primary leading-tight">
              {avg.score !== null ? avg.score : '-'}
            </div>
            <span className="badge badge-primary text-xs">{avg.label}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor(row => row.att.rate, {
      id: 'attendance',
      header: 'CCần',
      enableSorting: true,
      cell: info => {
        const att = info.row.original.att;
        return (
          <div className="flex flex-col items-center justify-center gap-0.5">
            <div className="font-bold leading-tight" style={{ color: att.rate >= 80 ? '#16A34A' : '#DC2626' }}>
              {att.rate}%
            </div>
            <div className="text-xs text-text-muted">{att.presentCount}/{att.totalCount}</div>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao Tác',
      cell: info => {
        const s = info.row.original.student;
        return (
          <div className="flex justify-end gap-1.5">
            <button onClick={() => onViewPhotoCard(s)} className="btn btn-secondary btn-sm" aria-label={`Thẻ ${s.holyName} ${s.fullName}`} title="Thẻ thiếu nhi">
              🪪
            </button>
            <button onClick={() => onViewReport(s)} className="btn btn-secondary btn-sm" aria-label={`In phiếu ${s.holyName} ${s.fullName}`}>
              <Printer size={14} color="#1E3A8A" /> In
            </button>
            {canEdit && (
              <button onClick={() => onEditStudent(s)} className="btn btn-secondary btn-sm" aria-label={`Chỉnh sửa ${s.holyName} ${s.fullName}`}>
                <Edit3 size={14} color="#475569" aria-hidden="true" />
              </button>
            )}
            {canDelete && (
              <button onClick={() => handleDelete(s)} className="btn btn-secondary btn-sm" aria-label={`Xóa ${s.holyName} ${s.fullName}`}>
                <Trash2 size={14} color="#DC2626" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      },
    }),
  ], [selectedSemester, onViewReport, onEditStudent, handleDelete, columnHelper]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const SortIcon = ({ columnId }: { columnId: string }) => {
    const sort = sorting.find(s => s.id === columnId);
    if (!sort) return <ArrowUpDown size={12} className="inline ml-1 opacity-50" />;
    return sort.desc ? <ArrowDown size={12} className="inline ml-1" /> : <ArrowUp size={12} className="inline ml-1" />;
  };

  const isCenter = (id: string) => ['avg', 'attendance'].includes(id);

  return (
    <>
    <div className="flex flex-col gap-6">
      {/* Header card */}
      <div className="bg-white rounded-2xl p-5 border border-surface-border flex justify-between items-center flex-wrap gap-4 shadow-card">
        <div>
          <h2 className="text-lg font-extrabold text-parish-primary m-0 tracking-tight">
            Danh Sách Thiếu Nhi Giáo Xứ
          </h2>
          <p className="text-sm text-text-muted mt-1 m-0 font-medium">
            Hiển thị <strong>{tableData.length}</strong> / {students.length} thiếu nhi theo bộ lọc
          </p>
        </div>
        <div className="flex gap-3">
          {canEdit && (
            <button onClick={onOpenAddStudent} className="btn btn-primary">
              <UserPlus size={16} /> Thêm Thiếu Nhi Mới
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0">
            <colgroup>
              {table.getAllLeafColumns().map(col => (
                <col key={col.id} style={{ width: colWidths[col.id] || 'auto' }} />
              ))}
            </colgroup>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className={`py-3 px-4 select-none align-middle ${header.column.getCanSort() ? 'cursor-pointer' : ''}`}
                      style={{
                        textAlign: header.id === 'actions' ? 'right' : isCenter(header.id) ? 'center' : 'left',
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <SortIcon columnId={header.column.id} />}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-text-muted">
                    Không tìm thấy thiếu nhi phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="border-b border-surface-hover transition-colors hover:bg-surface-hover">
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className="py-3 px-4 overflow-hidden min-w-0 align-middle"
                        style={{
                          textAlign: cell.column.id === 'actions' ? 'right' : isCenter(cell.column.id) ? 'center' : 'left',
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Xóa thiếu nhi"
        message={pendingDelete ? `Bạn có chắc chắn muốn xóa thiếu nhi ${pendingDelete.holyName} ${pendingDelete.fullName} (${pendingDelete.code})?` : ''}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) deleteStudent(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
};
