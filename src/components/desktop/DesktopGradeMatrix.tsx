import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { calculateGradeAverage, getStoredGradeWeights } from '../../utils/grades';
import type { GradeRecord, Student } from '../../types';
import { useClassStore, getFilteredClassList } from '../../stores/classStore';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import { FileSpreadsheet, Save, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown, Settings, Calculator, Download, Upload } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { GradeFormulaConfigModal } from './GradeFormulaConfigModal';
import { exportGradebookToExcel } from '../../utils/excelExporter';
import { ExcelGradeImportModal } from '../common/ExcelGradeImportModal';

interface RowData {
  student: Student
  index: number
  currentRec: Partial<GradeRecord>
}

export const DesktopGradeMatrix: React.FC = () => {
  const { can } = useAuth();
  const canEditGrades = can('admin', 'chunhiem', 'phuta');
  const academicYear = useAcademicYearStore(s => s.currentYear);
  const students = useStudentStore(s => s.students);
  const grades = useGradeStore(s => s.grades);
  const batchSaveGrades = useGradeStore(s => s.batchSaveGrades);
  const selectedClassId = useFilterStore(s => s.selectedClassId);
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester);

  const [matrixData, setMatrixData] = useState<Record<string, Partial<GradeRecord>>>({});
  const [isSaved, setIsSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [formulaWeights, setFormulaWeights] = useState(getStoredGradeWeights());
  const rawClasses = useClassStore(s => s.classes);
  const classList = useMemo(() => getFilteredClassList(rawClasses), [rawClasses]);

  const filteredStudents = useMemo(() => {
    if (selectedClassId === 'all') return students;
    return students.filter(s => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  const currentInitKey = `${selectedClassId}_${selectedSemester}`;
  const initRef = useRef('');

  useEffect(() => {
    if (initRef.current === currentInitKey && Object.keys(matrixData).length > 0) {
      return;
    }
    initRef.current = currentInitKey;
    const initialMap: Record<string, Partial<GradeRecord>> = {};
    filteredStudents.forEach(s => {
      const existing = grades.find(
        g => g.studentId === s.id && g.semester === selectedSemester && g.academicYear === academicYear
      );
      initialMap[s.id] = {
        studentId: s.id,
        semester: selectedSemester,
        academicYear: academicYear,
        scoreOral: existing?.scoreOral ?? null,
        score15m: existing?.score15m ?? null,
        score1Period: existing?.score1Period ?? null,
        scoreMidterm: existing?.scoreMidterm ?? null,
        scoreFinal: existing?.scoreFinal ?? null,
        scoreDaoDuc: existing?.scoreDaoDuc ?? null,
        comments: existing?.comments || ''
      };
    });
    setMatrixData(initialMap);
  }, [selectedClassId, selectedSemester, filteredStudents, grades, currentInitKey, matrixData]);

  const saveFn = useCallback((data: Record<string, Partial<GradeRecord>>) => {
    const recordsToSave = Object.values(data).map(rec => ({
      studentId: rec.studentId!,
      semester: selectedSemester,
      academicYear: academicYear,
      scoreOral: rec.scoreOral ?? null,
      score15m: rec.score15m ?? null,
      score1Period: rec.score1Period ?? null,
      scoreMidterm: rec.scoreMidterm ?? null,
      scoreFinal: rec.scoreFinal ?? null,
      scoreDaoDuc: rec.scoreDaoDuc ?? null,
      comments: rec.comments || ''
    }));

    batchSaveGrades(recordsToSave);
    setIsSaved(true);
    setIsDirty(false);
    setTimeout(() => setIsSaved(false), 2000);
  }, [selectedSemester, batchSaveGrades]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateField = useCallback((studentId: string, field: keyof GradeRecord, value: any) => {
    if (!canEditGrades) return;
    setMatrixData(prev => {
      const next = {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [field]: value
        }
      };

      setIsDirty(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveFn(next);
      }, 2000);

      return next;
    });
  }, [canEditGrades, saveFn]);

  const handleSaveNow = () => {
    if (!canEditGrades) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveFn(matrixData);
  };

  const handleExportExcel = () => {
    const currentClassName = classList.find(c => c.id === selectedClassId)?.name || 'Tất cả các lớp';
    exportGradebookToExcel({
      students: filteredStudents,
      matrixData,
      className: currentClassName,
      semester: selectedSemester,
      academicYear: academicYear,
    });
  };

  const matrixDataRef = useRef(matrixData);
  matrixDataRef.current = matrixData;

  const handleScoreBlur = (e: React.FocusEvent<HTMLInputElement>, studentId: string, field: keyof GradeRecord) => {
    let raw = e.target.value;
    if (raw === '') {
      updateField(studentId, field, null);
      return;
    }
    let normalized = raw.replace(',', '.');

    // Auto-convert: gõ "67" → "6.7", "85" → "8.5" (giữ nguyên "10" là 10)
    const asNum = parseFloat(normalized);
    if (!isNaN(asNum) && asNum >= 11 && asNum <= 99 && Number.isInteger(asNum) && !normalized.includes('.')) {
      normalized = (asNum / 10).toFixed(1);
      e.target.value = normalized;
    }

    if (/^(?:10(?:\.0)?|[0-9](?:\.[05])?)$/.test(normalized)) {
      const parsed = parseFloat(normalized);
      if (!isNaN(parsed)) { updateField(studentId, field, parsed); return; }
    }
    const prev = matrixDataRef.current[studentId]?.[field];
    e.target.value = prev === null || prev === undefined ? '' : String(prev);
  };

  const handleScoreKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, studentId: string, field: keyof GradeRecord) => {
    const toVal = (s: string): number | null => {
      let n = s.replace(',', '.');
      const x = parseFloat(n);
      if (!isNaN(x) && x >= 11 && x <= 99 && Number.isInteger(x) && !n.includes('.')) {
        n = (x / 10).toFixed(1);
        (e.target as HTMLInputElement).value = n;
      }
      if (n === '') return null;
      const p = parseFloat(n);
      return !isNaN(p) ? p : null;
    };
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const raw = (e.target as HTMLInputElement).value;
      const current = toVal(raw);
      const val = current ?? (matrixDataRef.current[studentId]?.[field] as number | undefined) ?? null;
      const next = val === null ? 0.5 : Math.min(10, Math.round((val + 0.5) * 10) / 10);
      updateField(studentId, field, next);
      (e.target as HTMLInputElement).value = String(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const raw = (e.target as HTMLInputElement).value;
      const current = toVal(raw);
      const val = current ?? (matrixDataRef.current[studentId]?.[field] as number | undefined) ?? null;
      const next = val === null ? 0 : Math.max(0, Math.round((val - 0.5) * 10) / 10);
      updateField(studentId, field, next);
      (e.target as HTMLInputElement).value = String(next);
    }
  };

  const tableData: RowData[] = useMemo(() => {
    return filteredStudents.map((s, idx) => ({
      student: s,
      index: idx + 1,
      currentRec: matrixData[s.id] || {
        studentId: s.id,
        semester: selectedSemester,
        academicYear: academicYear,
        scoreOral: null,
        score15m: null,
        score1Period: null,
        scoreMidterm: null,
        scoreFinal: null,
        comments: ''
      }
    }));
  }, [filteredStudents, matrixData, selectedSemester]);

  const columnHelper = createColumnHelper<RowData>();

  const columns = useMemo(() => [
    columnHelper.accessor('index', {
      id: 'stt',
      header: 'STT',
      cell: info => <span className="font-semibold text-text-muted">{info.getValue()}</span>,
      enableSorting: true,
    }),

    columnHelper.accessor(row => `${row.student.holyName} ${row.student.fullName}`, {
      id: 'fullName',
      header: 'Tên & Họ Tên',
      cell: info => {
        const { student } = info.row.original;
        return (
          <div className="flex items-center gap-2 py-1">
            <span className="font-bold text-[#1E3A8A] text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 shrink-0">
              {student.holyName}
            </span>
            <span className="font-extrabold text-slate-800 text-sm truncate">{student.fullName}</span>
          </div>
        );
      },
      enableSorting: true,
    }),

    columnHelper.accessor(row => row.currentRec.scoreOral, {
      id: 'scoreOral',
      header: `Miệng (x${formulaWeights.weightOral})`,
      cell: info => {
        const val = info.getValue();
        const { student } = info.row.original;
        return (
          <input
            type="text"
            inputMode="decimal"
            disabled={!canEditGrades}
            defaultValue={val === null || val === undefined ? '' : String(val)}
            onBlur={e => handleScoreBlur(e, student.id, 'scoreOral')}
            onKeyDown={e => handleScoreKeyDown(e, student.id, 'scoreOral')}
            className="w-14 h-8 text-center text-sm font-extrabold border border-surface-border rounded-lg focus:border-parish-primary focus:ring-1 focus:ring-parish-primary outline-hidden disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        );
      },
      enableSorting: false,
    }),

    columnHelper.accessor(row => row.currentRec.score15m, {
      id: 'score15m',
      header: `15P (x${formulaWeights.weight15m})`,
      cell: info => {
        const val = info.getValue();
        const { student } = info.row.original;
        return (
          <input
            type="text"
            inputMode="decimal"
            disabled={!canEditGrades}
            defaultValue={val === null || val === undefined ? '' : String(val)}
            onBlur={e => handleScoreBlur(e, student.id, 'score15m')}
            onKeyDown={e => handleScoreKeyDown(e, student.id, 'score15m')}
            className="w-14 h-8 text-center text-sm font-extrabold border border-surface-border rounded-lg focus:border-parish-primary focus:ring-1 focus:ring-parish-primary outline-hidden disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        );
      },
      enableSorting: false,
    }),

    columnHelper.accessor(row => row.currentRec.score1Period, {
      id: 'score1Period',
      header: `1 Tiết (x${formulaWeights.weight1Period})`,
      cell: info => {
        const val = info.getValue();
        const { student } = info.row.original;
        return (
          <input
            type="text"
            inputMode="decimal"
            disabled={!canEditGrades}
            defaultValue={val === null || val === undefined ? '' : String(val)}
            onBlur={e => handleScoreBlur(e, student.id, 'score1Period')}
            onKeyDown={e => handleScoreKeyDown(e, student.id, 'score1Period')}
            className="w-14 h-8 text-center text-sm font-extrabold border border-surface-border rounded-lg focus:border-parish-primary focus:ring-1 focus:ring-parish-primary outline-hidden disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        );
      },
      enableSorting: false,
    }),

    columnHelper.accessor(row => row.currentRec.scoreMidterm, {
      id: 'scoreMidterm',
      header: `Giữa Kỳ (x${formulaWeights.weightMidterm})`,
      cell: info => {
        const val = info.getValue();
        const { student } = info.row.original;
        return (
          <input
            type="text"
            inputMode="decimal"
            disabled={!canEditGrades}
            defaultValue={val === null || val === undefined ? '' : String(val)}
            onBlur={e => handleScoreBlur(e, student.id, 'scoreMidterm')}
            onKeyDown={e => handleScoreKeyDown(e, student.id, 'scoreMidterm')}
            className="w-14 h-8 text-center text-sm font-extrabold border border-surface-border rounded-lg focus:border-parish-primary focus:ring-1 focus:ring-parish-primary outline-hidden disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        );
      },
      enableSorting: false,
    }),

    columnHelper.accessor(row => row.currentRec.scoreFinal, {
      id: 'scoreFinal',
      header: `Cuối Kỳ (x${formulaWeights.weightFinal})`,
      cell: info => {
        const val = info.getValue();
        const { student } = info.row.original;
        return (
          <input
            type="text"
            inputMode="decimal"
            disabled={!canEditGrades}
            defaultValue={val === null || val === undefined ? '' : String(val)}
            onBlur={e => handleScoreBlur(e, student.id, 'scoreFinal')}
            onKeyDown={e => handleScoreKeyDown(e, student.id, 'scoreFinal')}
            className="w-14 h-8 text-center text-sm font-extrabold border border-surface-border rounded-lg focus:border-parish-primary focus:ring-1 focus:ring-parish-primary outline-hidden disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        );
      },
      enableSorting: false,
    }),

    columnHelper.accessor(row => row.currentRec.scoreDaoDuc, {
      id: 'scoreDaoDuc',
      header: 'Đạo Đức',
      cell: info => {
        const val = info.getValue();
        const { student } = info.row.original;
        return (
          <input
            type="text"
            inputMode="decimal"
            disabled={!canEditGrades}
            defaultValue={val === null || val === undefined ? '' : String(val)}
            onBlur={e => handleScoreBlur(e, student.id, 'scoreDaoDuc')}
            onKeyDown={e => handleScoreKeyDown(e, student.id, 'scoreDaoDuc')}
            className="w-14 h-8 text-center text-sm font-extrabold border border-surface-border rounded-lg focus:border-parish-primary focus:ring-1 focus:ring-parish-primary outline-hidden disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        );
      },
      enableSorting: false,
    }),

    columnHelper.accessor(row => {
      const avg = calculateGradeAverage(row.currentRec as GradeRecord, formulaWeights);
      return avg.score ?? -1;
    }, {
      id: 'avg',
      header: 'ĐTB',
      cell: info => {
        const { currentRec } = info.row.original;
        const avg = calculateGradeAverage(currentRec as GradeRecord, formulaWeights);
        if (avg.score === null) return <span className="text-text-muted italic text-xs">Chưa có</span>;
        return (
          <span className="font-black text-base text-emerald-600">
            {avg.score}
          </span>
        );
      },
      enableSorting: true,
    }),

    columnHelper.accessor(row => {
      const avg = calculateGradeAverage(row.currentRec as GradeRecord, formulaWeights);
      return avg.label;
    }, {
      id: 'rank',
      header: 'Xếp Loại',
      cell: info => {
        const { currentRec } = info.row.original;
        const avg = calculateGradeAverage(currentRec as GradeRecord, formulaWeights);
        if (avg.score === null) return <span className="text-text-muted italic text-xs">—</span>;

        const badgeStyle =
          avg.label === 'Xuất Sắc' ? 'bg-amber-500/10 text-amber-700 border-amber-300' :
          avg.label === 'Giỏi' ? 'bg-blue-500/10 text-blue-700 border-blue-300' :
          avg.label === 'Khá' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300' :
          'bg-slate-500/10 text-slate-700 border-slate-300';

        return (
          <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${badgeStyle}`}>
            {avg.label}
          </span>
        );
      },
      enableSorting: true,
    }),

    columnHelper.accessor(row => row.currentRec.comments, {
      id: 'comments',
      header: 'Nhận Xét / Ghi Chú',
      cell: info => {
        const val = info.getValue() || '';
        const { student } = info.row.original;
        return (
          <input
            type="text"
            placeholder="Nhận xét bài học..."
            disabled={!canEditGrades}
            value={val}
            onChange={e => updateField(student.id, 'comments', e.target.value)}
            className="w-full h-8 px-2 text-xs border border-surface-border rounded-lg focus:border-parish-primary outline-hidden disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        );
      },
      enableSorting: false,
    }),
  ], [columnHelper, canEditGrades, updateField, formulaWeights]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const SortIcon = ({ columnId }: { columnId: string }) => {
    const col = table.getColumn(columnId);
    if (!col) return null;
    const isSorted = col.getIsSorted();
    if (isSorted === 'asc') return <ArrowUp className="inline ml-1 text-white" size={12} />;
    if (isSorted === 'desc') return <ArrowDown className="inline ml-1 text-white" size={12} />;
    return <ArrowUpDown className="inline ml-1 opacity-50" size={12} />;
  };

  const colWidths: Record<string, string> = {
    stt: '45px',
    fullName: '240px',
    scoreOral: '70px',
    score15m: '75px',
    score1Period: '75px',
    scoreMidterm: '75px',
    scoreFinal: '75px',
    scoreDaoDuc: '70px',
    avg: '85px',
    rank: '95px',
    comments: '220px',
  };

  const currentClassName = classList.find(c => c.id === selectedClassId)?.name || 'Tất cả các lớp';

  return (
    <>
      <div className="space-y-4">
        {/* Top Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-card p-4 rounded-2xl border border-surface-border shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="text-parish-primary" size={20} />
              <h2 className="text-base font-bold text-text-main m-0">
                Ma Trận Nhập Điểm Hàng Loạt
              </h2>
              <span className="badge badge-primary">
                Học Kỳ {selectedSemester} ({academicYear})
              </span>
            </div>
            <p className="text-sm text-text-muted mt-2 m-0 font-medium">
              Đang nhập điểm cho Lớp: <strong className="text-text-main">{currentClassName}</strong> ({filteredStudents.length} em)
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="form-select text-sm font-semibold rounded-xl h-9"
            >
              <option value="all">-- Chọn tất cả các lớp --</option>
              {classList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <div className="flex bg-surface-hover p-1 rounded-xl border border-surface-border">
              <button
                onClick={() => setSelectedSemester(1)}
                className={`px-3 py-1.5 h-8 text-xs font-bold border-none rounded-lg cursor-pointer transition-colors ${
                  selectedSemester === 1 ? 'bg-parish-primary text-white' : 'bg-transparent text-text-secondary'
                }`}
              >
                Học Kỳ I
              </button>
              <button
                onClick={() => setSelectedSemester(2)}
                className={`px-3 py-1.5 h-8 text-xs font-bold border-none rounded-lg cursor-pointer transition-colors ${
                  selectedSemester === 2 ? 'bg-parish-primary text-white' : 'bg-transparent text-text-secondary'
                }`}
              >
                Học Kỳ II
              </button>
            </div>

            {/* Custom Formula Config Trigger */}
            <button
              onClick={() => setShowFormulaModal(true)}
              title="Tùy chỉnh hệ số điểm và công thức tính ĐTB"
              className="px-3.5 py-1.5 h-9 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-slate-300 transition-colors"
            >
              <Calculator size={15} className="text-parish-primary" />
              <span>Hệ Số & Công Thức</span>
            </button>

            {/* Import Excel Button */}
            <button
              onClick={() => setShowImportModal(true)}
              title="Import điểm từ file Excel (.xlsx)"
              className="px-3.5 py-1.5 h-9 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Upload size={15} />
              <span>Import Excel</span>
            </button>

            {/* Export Excel Button */}
            <button
              onClick={handleExportExcel}
              title="Xuất bảng điểm ra file Excel (.xls)"
              className="px-3.5 py-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Download size={15} />
              <span>Xuất Excel</span>
            </button>

            {canEditGrades && (
              <button
                onClick={handleSaveNow}
                className={`btn transition-colors duration-300 ${isSaved ? 'bg-parish-success' : 'bg-parish-primary'} text-white h-9`}
              >
                {isSaved ? <CheckCircle size={16} /> : <Save size={16} />}
                {isSaved ? 'Đã Lưu' : isDirty ? 'Đang chờ (2s)...' : 'Lưu Ngay'}
              </button>
            )}
          </div>
        </div>

        {/* Grade Matrix Table */}
        <div className="bg-white rounded-2xl border border-surface-border shadow-card overflow-hidden">
          <div className="overflow-x-auto" style={{ minWidth: 0 }}>
            <table className="w-full border-collapse text-sm text-left" style={{ tableLayout: 'fixed', width: '100%', minWidth: 0 }}>
              <colgroup>
                {table.getAllLeafColumns().map(col => (
                  <col key={col.id} style={{ width: colWidths[col.id] || 'auto' }} />
                ))}
              </colgroup>
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="bg-parish-primary text-white text-xs font-bold uppercase tracking-wider">
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className={`py-3.5 px-4 select-none align-middle ${header.column.getCanSort() ? 'cursor-pointer' : ''}`}
                        style={{
                          textAlign: ['stt', 'scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc', 'avg', 'rank'].includes(header.id) ? 'center' : 'left',
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

              <tbody className="divide-y divide-surface-border">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="text-center py-8 text-text-muted">
                      Không tìm thấy thiếu nhi phù hợp với lớp học này.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/60'}>
                      {row.getVisibleCells().map(cell => (
                        <td
                          key={cell.id}
                          className="py-2 px-3 align-middle"
                          style={{
                            textAlign: ['stt', 'scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc', 'avg', 'rank'].includes(cell.column.id) ? 'center' : 'left',
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

      <GradeFormulaConfigModal
        isOpen={showFormulaModal}
        onClose={() => setShowFormulaModal(false)}
        onSaveSuccess={() => {
          setFormulaWeights(getStoredGradeWeights());
        }}
      />

      <ExcelGradeImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        semester={selectedSemester}
      />
    </>
  );
};
