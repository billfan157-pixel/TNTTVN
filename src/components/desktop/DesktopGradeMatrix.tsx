import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import { useFilterStore } from '../../stores/filterStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { calculateGradeAverage } from '../../utils/grades';
import type { GradeRecord, Student } from '../../types';
import { useClassStore, getFilteredClassList } from '../../stores/classStore';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import { normalizeAcademicYear, getCurrentAcademicYear } from '../../utils/academicYear';
import { FileSpreadsheet,  CheckCircle,    Calculator, Download, Upload, RefreshCw,   Settings2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSemesterAccess } from '../../hooks/useSemesterAccess';
import { useSyncStore } from '../../stores/syncStore';
import { GradeFormulaConfigModal } from './GradeFormulaConfigModal';
import { exportGradebookToExcel } from '../../utils/excelExporter';
import { ExcelGradeImportModal } from '../common/ExcelGradeImportModal';
import { EmptyState, NoResultState } from '../common/StateFeedback';
import { PageHeader } from '../common/PageHeader';

interface RowData {
  student: Student
  index: number
  currentRec: Partial<GradeRecord>
}

export const DesktopGradeMatrix: React.FC = () => {
  const { can } = useAuth();
  const canEditGrades = can('admin', 'chunhiem');
  const academicYear = useAcademicYearStore(s => s.currentYear);
  const matrixAcademicYear = normalizeAcademicYear(academicYear) || getCurrentAcademicYear();
  const students = useStudentStore(s => s.students);
  const grades = useGradeStore(s => s.grades);
  const batchSaveGrades = useGradeStore(s => s.batchSaveGrades);
  const selectedClassId = useFilterStore(s => s.selectedClassId);
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester);
  const { restricted: _semesterRestricted, openSemester: _openSemester } = useSemesterAccess();

  const [matrixData, setMatrixData] = useState<Record<string, Partial<GradeRecord>>>({});
  const [isOverrideModeEnabled, setIsOverrideModeEnabled] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const syncPendingCount = useSyncStore(s => s.pendingCount);
  const formulaWeights = useSettingsStore(s => s.settings.gradeWeights);
  const rawClasses = useClassStore(s => s.classes);
  const classList = useMemo(() => getFilteredClassList(rawClasses), [rawClasses]);

  const filteredStudents = useMemo(() => {
    if (selectedClassId === 'all') return students;
    return students.filter(s => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  const matrixDataRef = useRef(matrixData);
  useEffect(() => {
    matrixDataRef.current = matrixData;
  }, [matrixData]);

  // GRADE-SYNC-1 (2026-08-14): chỉ gửi đúng các học sinh có thay đổi (dirtyIdsRef)
  // thay vì toàn bộ lớp; đồng thời flush phần chưa kịp lưu khi unmount/chuyển lớp
  // để debounce 2s cũ (hủy bằng clearTimeout khi rời trang) không làm mất điểm.
  const dirtyIdsRef = useRef<Set<string>>(new Set());

  const saveDirtyGrades = useCallback(async () => {
    const ids = dirtyIdsRef.current
    if (ids.size === 0) return
    const records: GradeRecord[] = []
    ids.forEach(id => {
      const rec = matrixDataRef.current[id]
      if (rec) records.push(rec as GradeRecord)
    })
    ids.clear()
    if (records.length === 0) return
    await batchSaveGrades(records)
    setIsDirty(false)
    setIsSaved(true)
    setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  }, [batchSaveGrades])

  const saveDirtyRef = useRef(saveDirtyGrades)
  saveDirtyRef.current = saveDirtyGrades

  useEffect(() => {
    return () => { void saveDirtyRef.current() }
  }, [])

  const currentInitKey = `${selectedClassId}_${selectedSemester}`;
  
  // REACT-185 (2026-08-14): tách rebuild theo init-key (class/học kỳ) khỏi merge theo
  // grades/students. Trước đây deps [.., students, grades] khiến MỖI lần sync (grades
  // đổi tham chiếu) chạy lại effect: setMatrixData(initialData) reset dữ liệu đang gõ
  // dở + flush thừa — tạo re-render storm nuôi loop #185 (HeaderBar unstable selector).
  useEffect(() => {
    void saveDirtyRef.current()
    dirtyIdsRef.current.clear()
    const normAY = matrixAcademicYear;
    const initialData: Record<string, Partial<GradeRecord>> = {};
    
    students.forEach(s => {
      const g = grades.find(gr => gr.studentId === s.id && gr.semester === selectedSemester && normalizeAcademicYear(gr.academicYear) === normAY);
      if (g) {
        initialData[s.id] = { ...g };
      }
    });
    
    setMatrixData(initialData);
    setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentInitKey, matrixAcademicYear]);

  // Merge nhẹ khi sync đẩy grades mới: chỉ cập nhật record KHÔNG đang dirty (đang
  // chỉnh sửa dở giữ nguyên) và chỉ trong class/học kỳ hiện tại — không rebuild toàn
  // bộ matrix, không mất dữ liệu chưa lưu.
  useEffect(() => {
    const normAY = matrixAcademicYear
    const studentIds = new Set(filteredStudents.map(s => s.id))
    setMatrixData(prev => {
      let changed = false
      const next: Record<string, Partial<GradeRecord>> = { ...prev }
      for (const g of grades) {
        if (!studentIds.has(g.studentId)) continue
        if (g.semester !== selectedSemester) continue
        if (normalizeAcademicYear(g.academicYear) !== normAY) continue
        if (dirtyIdsRef.current.has(g.studentId)) continue
        if (next[g.studentId] === g) continue
        next[g.studentId] = { ...g }
        changed = true
      }
      return changed ? next : prev
    })
  }, [grades, filteredStudents, selectedSemester, matrixAcademicYear])

  const updateField = useCallback((studentId: string, field: keyof GradeRecord, val: any) => {
    dirtyIdsRef.current.add(studentId)
    setMatrixData(prev => {
      const current = prev[studentId] || { studentId, semester: selectedSemester, academicYear: matrixAcademicYear };
      return {
        ...prev,
        [studentId]: {
          ...current,
          [field]: val,
          [`${field}_source`]: 'manual',
          [`${field}_updated_at`]: new Date().toISOString()
        }
      };
    });
    setIsDirty(true);
    setIsSaved(false);
  }, [selectedSemester, matrixAcademicYear]);

  const handleScoreBlur = useCallback((e: React.FocusEvent<HTMLInputElement>, studentId: string, field: keyof GradeRecord) => {
    const raw = e.target.value;
    if (raw === '') {
      updateField(studentId, field, null);
      return;
    }
    const val = parseFloat(raw.replace(',', '.'));
    if (!isNaN(val)) {
      updateField(studentId, field, val);
    } else {
      const prev = matrixDataRef.current[studentId]?.[field];
      e.target.value = prev === null || prev === undefined ? '' : String(prev);
    }
  }, [updateField]);

  const handleScoreKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, _studentId: string, _field: keyof GradeRecord) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-matrix-cell="true"]'));
      const idx = inputs.indexOf(e.currentTarget);
      if (idx !== -1 && idx + 1 < inputs.length) {
        inputs[idx + 1].focus();
        inputs[idx + 1].select();
      }
    }
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    // GRADE-SYNC-1 (2026-08-14): debounce 800ms (trước 2s). Chỉ gửi dirty records;
    // phần chưa kịp gửi được flush khi unmount/chuyển lớp (saveDirtyRef effect).
    const timer = setTimeout(() => {
      void saveDirtyRef.current()
    }, 800);
    return () => clearTimeout(timer);
  }, [isDirty, saveDirtyGrades]);

  const handleExportExcel = () => {
    const className = classList.find(c => c.id === selectedClassId)?.name || 'TatCaLop';
    exportGradebookToExcel({
      students: filteredStudents,
      matrixData,
      className,
      semester: selectedSemester,
      academicYear: matrixAcademicYear
    });
  };

  const tableData: RowData[] = useMemo(() => {
    return filteredStudents.map((s, idx) => ({
      student: s,
      index: idx + 1,
      currentRec: matrixData[s.id] || {
        studentId: s.id,
        semester: selectedSemester,
        academicYear: matrixAcademicYear,
      }
    }));
  }, [filteredStudents, matrixData, selectedSemester, matrixAcademicYear]);

  const columnHelper = createColumnHelper<RowData>();

  const columns = useMemo(() => [
    columnHelper.accessor('index', {
      id: 'stt',
      header: 'STT',
      cell: info => <span className="font-bold text-text-secondary text-sm">{info.getValue()}</span>,
      size: 62,
    }),
    columnHelper.accessor(row => row.student.holyName || '', {
      id: 'holyName',
      header: 'Tên Thánh',
      cell: info => <span className="font-bold text-parish-primary bg-parish-primary-light px-2.5 py-1 rounded-lg border border-parish-primary/10">{info.getValue() || '-'}</span>,
      size: 175,
    }),
    columnHelper.accessor(row => row.student.fullName, {
      id: 'fullName',
      header: 'Họ và Tên',
      cell: info => <span className="font-extrabold text-text-main text-base">{info.getValue()}</span>,
      size: 240,
    }),
    ...(['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc'] as const).map(field => 
      columnHelper.accessor(row => row.currentRec[field], {
        id: field,
        header: field === 'scoreOral' ? 'Miệng' : field === 'score15m' ? '15P' : field === 'score1Period' ? '1 Tiết' : field === 'scoreMidterm' ? 'Giữa Kỳ' : field === 'scoreFinal' ? 'Cuối Kỳ' : 'Đạo Đức',
        cell: info => {
          const val = info.getValue();
          const { student } = info.row.original;
          return (
            <input
              type="text"
              data-matrix-cell="true"
              disabled={!canEditGrades || (!isOverrideModeEnabled && field !== 'scoreDaoDuc' && field !== 'scoreOral')}
              // P0.7 (audit desktop 2026-08-22): key theo giá trị → khi server-sync/import
              // merge điểm mới vào matrixData (record KHÔNG dirty), input remount và hiển thị
              // đúng giá trị mới thay vì giữ defaultValue stale đến khi remount trang.
              // Trong lúc đang gõ record là dirty nên không bị merge → key ổn định, focus giữ nguyên.
              key={`${student.id}:${field}:${val === null || val === undefined ? '' : String(val)}`}
              defaultValue={val === null || val === undefined ? '' : String(val)}
              onBlur={e => handleScoreBlur(e, student.id, field)}
              onKeyDown={e => handleScoreKeyDown(e, student.id, field)}
              className="form-input w-14 h-9 text-center text-base font-black bg-surface-card text-text-main border border-surface-border rounded-xl focus:border-parish-primary focus:ring-2 focus:ring-parish-primary/20 outline-none transition-all disabled:bg-surface-app disabled:text-text-placeholder shadow-xs"
            />
          );
        },
        size: 85,
      })
    ),
    columnHelper.accessor(row => {
      const avg = calculateGradeAverage(row.currentRec as GradeRecord, formulaWeights);
      return avg.score ?? -1;
    }, {
      id: 'avg',
      header: 'ĐTB',
      cell: info => {
        const { currentRec } = info.row.original;
        const avg = calculateGradeAverage(currentRec as GradeRecord, formulaWeights);
        return <span className="font-black text-lg text-parish-success">{avg.score ?? '-'}</span>;
      },
      size: 95,
    }),
    columnHelper.accessor(row => {
      const avg = calculateGradeAverage(row.currentRec as GradeRecord, formulaWeights);
      return avg.label;
    }, {
      id: 'rank',
      header: 'Xếp Loại',
      cell: info => {
        const label = info.getValue();
        if (!label) return '-';
        const style = label === 'Xuất Sắc' ? 'badge-warning border-[var(--color-parish-warning)]/30' :
                      label === 'Giỏi' ? 'badge-info border-[var(--color-parish-info)]/30' :
                      label === 'Khá' ? 'badge-success border-[var(--color-parish-success)]/30' : 'bg-surface-hover text-text-secondary border-surface-border';
        return <span className={`text-xs font-black px-2.5 py-1 rounded-full border uppercase tracking-wider ${style}`}>{label}</span>;
      },
      size: 170,
    }),
    columnHelper.accessor(row => row.currentRec.comments, {
      id: 'comments',
      header: 'Nhận Xét',
      cell: info => (
        <input
          type="text"
          placeholder="Nhập ghi chú..."
          value={info.getValue() || ''}
          onChange={e => updateField(info.row.original.student.id, 'comments', e.target.value)}
          className="form-input w-full h-9 px-3 text-sm font-medium bg-surface-card text-text-main border border-surface-border rounded-xl focus:border-parish-primary outline-none shadow-xs"
        />
      ),
      size: 170,
    }),
  ], [columnHelper, canEditGrades, isOverrideModeEnabled, handleScoreBlur, handleScoreKeyDown, formulaWeights, updateField]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const currentClassName = classList.find(c => c.id === selectedClassId)?.name || 'Tất cả lớp';

  return (
    <div className="product-view space-y-6 pb-10">
      {/* Modern Header */}
      <PageHeader
        icon={<FileSpreadsheet size={22} />}
        title="Ma Trận Nhập Điểm"
        description={
          <span>
            Lớp: <span className="text-parish-primary font-bold">{currentClassName}</span> • Học Kỳ {selectedSemester}
          </span>
        }
        actions={
          <>
            {/* Class Select */}
            <div className="flex items-center gap-2 bg-surface-hover p-1 rounded-xl border border-surface-border shadow-inner">
              <span className="text-[10px] font-black text-text-secondary uppercase px-2">Lớp:</span>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="text-xs font-bold border-none bg-transparent outline-none cursor-pointer pr-2"
              >
                <option value="all">Tất cả lớp</option>
                {classList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Semester Switcher */}
            <div className="flex bg-surface-hover p-1 rounded-xl border border-surface-border shadow-inner">
              <button
                onClick={() => setSelectedSemester(1)}
                className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all ${selectedSemester === 1 ? 'bg-surface-card text-parish-primary shadow-sm' : 'text-text-secondary'}`}
              >
                HK I
              </button>
              <button
                onClick={() => setSelectedSemester(2)}
                className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all ${selectedSemester === 2 ? 'bg-surface-card text-parish-primary shadow-sm' : 'text-text-secondary'}`}
              >
                HK II
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button onClick={() => setShowFormulaModal(true)} className="p-2 rounded-xl bg-surface-card border border-surface-border text-text-secondary hover:bg-surface-hover transition-all shadow-sm active:scale-95" title="Cấu hình hệ số">
                <Settings2 size={18} />
              </button>
              <button 
                onClick={() => setIsOverrideModeEnabled(!isOverrideModeEnabled)} 
                className={`btn btn-sm flex items-center gap-1.5 px-4 py-2 font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 ${isOverrideModeEnabled ? 'bg-parish-warning text-white shadow-[var(--color-parish-warning)]/20' : 'bg-surface-card border border-surface-border text-text-main hover:bg-surface-hover'}`}
              >
                <Calculator size={14} /> {isOverrideModeEnabled ? 'Đang Điều Chỉnh' : 'Chế Độ Điều Chỉnh'}
              </button>
              <button onClick={() => setShowImportModal(true)} className="btn btn-primary btn-sm flex items-center gap-1.5 px-4 py-2 bg-parish-primary text-white font-bold text-xs rounded-xl shadow-md hover:bg-parish-primary-hover transition-all active:scale-95">
                <Upload size={14} /> Import
              </button>
              <button onClick={handleExportExcel} className="btn btn-sm flex items-center gap-1.5 px-4 py-2 bg-parish-success text-white font-bold text-xs rounded-xl shadow-md hover:bg-parish-success-hover transition-all active:scale-95">
                <Download size={14} /> Export
              </button>
            </div>
          </>
        }
      />

      {/* Sync Status Banner — PHA 5.6: card chuẩn DS thay strip near-black */}
      <div className="view-toolbar animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          {isDirty ? (
            <div className="flex items-center gap-2 text-[var(--color-parish-warning)] text-[11px] font-black uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[var(--color-parish-warning)] animate-ping"></span>
              Đang lưu thay đổi...
            </div>
          ) : isSaved ? (
            <div className="flex items-center gap-2 text-[var(--color-parish-success)] text-[11px] font-black uppercase tracking-wider">
              <CheckCircle size={14} />
              Đã lưu: {lastSavedTime}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-[11px] font-black uppercase tracking-wider">
              <RefreshCw size={14} className={syncPendingCount > 0 ? 'animate-spin' : ''} />
              {syncPendingCount > 0 ? `${syncPendingCount} chờ đồng bộ` : 'Đã đồng bộ máy chủ'}
            </div>
          )}
        </div>
        <div className="text-[10px] font-bold text-[var(--color-text-muted)] italic">
          Mẹo: Nhấn Enter để xuống dòng, Tab để sang ô tiếp theo.
        </div>
      </div>

      {/* Matrix Table */}
      <div className="table-wrapper">
        <div className="table-scroll">
          <table className="w-full text-sm text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-surface-app border-b-2 border-surface-border">
                {table.getHeaderGroups().map(headerGroup => (
                  headerGroup.headers.map(header => (
                    <th key={header.id} className="px-4 py-2.5 font-bold text-text-muted text-xs uppercase tracking-wider" style={{ width: header.getSize() }} scope="col">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-hover bg-surface-card">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8">
                    {students.length === 0 ? (
                      <EmptyState
                        title="Chưa có thiếu nhi nào trong lớp"
                        description="Vui lòng chọn lớp khác hoặc thêm thiếu nhi vào lớp để nhập điểm."
                      />
                    ) : (
                      <NoResultState
                        title="Không có thiếu nhi phù hợp với bộ lọc"
                        description="Hãy thử chọn lớp học hoặc phân ngành khác."
                      />
                    )}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="bg-surface-card hover:bg-surface-app transition-colors group">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-5 py-3.5 align-middle">
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

      <GradeFormulaConfigModal isOpen={showFormulaModal} onClose={() => setShowFormulaModal(false)} />
      <ExcelGradeImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        semester={selectedSemester as 1 | 2}
      />
    </div>
  );
};
