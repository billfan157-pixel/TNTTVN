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
import { calculateGradeAverage } from '../../utils/grades';
import type { GradeRecord, Student } from '../../types';
import { MOCK_CLASSES } from '../../data/mockParishData';
import { FileSpreadsheet, Save, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const ACADEMIC_YEAR = '2025 - 2026';

interface RowData {
  student: Student
  index: number
  currentRec: Partial<GradeRecord>
}

export const DesktopGradeMatrix: React.FC = () => {
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredStudents = useMemo(
    () => selectedClassId === 'all' ? students : students.filter(s => s.classId === selectedClassId),
    [selectedClassId, students]
  );

  const selectedClassInfo = MOCK_CLASSES.find(c => c.id === selectedClassId);

  const currentInitKey = `${selectedClassId}_${selectedSemester}`;
  const initRef = useRef('');

  useEffect(() => {
    // Only re-initialize matrixData when class or semester changes, or on initial mount
    if (initRef.current === currentInitKey && Object.keys(matrixData).length > 0) {
      return;
    }
    initRef.current = currentInitKey;
    const initialMap: Record<string, Partial<GradeRecord>> = {};
    filteredStudents.forEach(s => {
      const existing = grades.find(
        g => g.studentId === s.id && g.semester === selectedSemester && g.academicYear === ACADEMIC_YEAR
      );
      initialMap[s.id] = {
        studentId: s.id,
        semester: selectedSemester,
        academicYear: ACADEMIC_YEAR,
        scoreOral: existing?.scoreOral ?? null,
        score15m: existing?.score15m ?? null,
        score1Period: existing?.score1Period ?? null,
        scoreMidterm: existing?.scoreMidterm ?? null,
        scoreFinal: existing?.scoreFinal ?? null,
        comments: existing?.comments || ''
      };
    });
    setMatrixData(initialMap);
  }, [selectedClassId, selectedSemester, filteredStudents, grades, currentInitKey, matrixData]);

  const saveFn = useCallback((data: Record<string, Partial<GradeRecord>>) => {
    const recordsToSave = Object.values(data).map(rec => ({
      studentId: rec.studentId!,
      semester: selectedSemester,
      academicYear: ACADEMIC_YEAR,
      scoreOral: rec.scoreOral ?? null,
      score15m: rec.score15m ?? null,
      score1Period: rec.score1Period ?? null,
      scoreMidterm: rec.scoreMidterm ?? null,
      scoreFinal: rec.scoreFinal ?? null,
      comments: rec.comments || ''
    }));
    batchSaveGrades(recordsToSave);
    setIsSaved(true);
    setIsDirty(false);
    setTimeout(() => setIsSaved(false), 3000);
  }, [batchSaveGrades, selectedSemester]);

  const triggerAutoSave = useCallback((data: Record<string, Partial<GradeRecord>>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveFn(data), 2000)
  }, [saveFn])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const handleInputChange = (studentId: string, field: keyof GradeRecord, value: string) => {
    if (field === 'comments') {
      setMatrixData(prev => {
        const next = { ...prev, [studentId]: { ...prev[studentId], comments: value } }
        setIsDirty(true)
        triggerAutoSave(next)
        return next
      })
      return
    }
    let numValue: number | null = null;
    if (value.trim() !== '') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
        numValue = parsed;
      } else if (!isNaN(parsed)) {
        return;
      }
    }
    setMatrixData(prev => {
      const next = { ...prev, [studentId]: { ...prev[studentId], [field]: numValue } }
      setIsDirty(true)
      triggerAutoSave(next)
      return next
    })
  };

  const handleSaveNow = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    saveFn(matrixData)
  };

  const colWidths: Record<string, string> = {
    stt: '45px',
    name: '240px',
    scoreOral: '70px',
    score15m: '75px',
    score1Period: '75px',
    scoreMidterm: '75px',
    scoreFinal: '75px',
    avg: '85px',
    rank: '95px',
    comments: '220px',
  }

  const columnHelper = createColumnHelper<RowData>()

  const columns = useMemo(() => [
    columnHelper.accessor(row => row.index, {
      id: 'stt',
      header: 'STT',
      enableSorting: true,
      cell: info => (
        <span className="text-text-muted font-semibold">{info.getValue() + 1}</span>
      ),
    }),
    columnHelper.accessor(row => `${row.student.holyName} ${row.student.fullName}`, {
      id: 'name',
      header: 'Tên & Họ Tên',
      enableSorting: true,
      cell: info => {
        const s = info.row.original.student
        return (
          <>
            <div className="font-bold text-text-main truncate min-w-0" title={`${s.holyName} ${s.fullName}`}>
              <span className="text-parish-secondary font-bold mr-1">{s.holyName}</span>
              <span>{' '}{s.fullName}</span>
            </div>
            <div className="text-xs text-text-muted truncate">{s.code}</div>
          </>
        )
      },
    }),
    ...(['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal'] as const).map((field, fi) => {
      const idLabels = ['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal']
      const headers = ['Miệng', '15P', '1 Tiết', 'Giữa Kỳ', 'Cuối Kỳ']
      return columnHelper.accessor(row => row.currentRec[field], {
        id: idLabels[fi],
        header: headers[fi],
        enableSorting: false,
        cell: info => {
          const sId = info.row.original.student.id
          return (
            <input
              type="number"
              step="0.5"
              min="0"
              max="10"
              placeholder="-"
              value={info.getValue() ?? ''}
              onChange={e => handleInputChange(sId, field, e.target.value)}
              className={`text-center font-bold border border-border-input outline-none h-8 w-[52px] rounded-sm px-1 ${field === 'scoreFinal' ? 'bg-parish-secondary-light' : ''}`}
            />
          )
        },
      })
    }),
    columnHelper.accessor(row => {
      const rec = row.currentRec
      const avg = calculateGradeAverage({
        scoreOral: rec.scoreOral ?? null,
        score15m: rec.score15m ?? null,
        score1Period: rec.score1Period ?? null,
        scoreMidterm: rec.scoreMidterm ?? null,
        scoreFinal: rec.scoreFinal ?? null,
      })
      return avg.score ?? -1
    }, {
      id: 'avg',
      header: 'ĐTB',
      enableSorting: true,
      sortingFn: (a, b) => {
        const va = a.original.currentRec
        const vb = b.original.currentRec
        const aa = calculateGradeAverage({ scoreOral: va.scoreOral ?? null, score15m: va.score15m ?? null, score1Period: va.score1Period ?? null, scoreMidterm: va.scoreMidterm ?? null, scoreFinal: va.scoreFinal ?? null })
        const ab = calculateGradeAverage({ scoreOral: vb.scoreOral ?? null, score15m: vb.score15m ?? null, score1Period: vb.score1Period ?? null, scoreMidterm: vb.scoreMidterm ?? null, scoreFinal: vb.scoreFinal ?? null })
        return (aa.score ?? -1) - (ab.score ?? -1)
      },
      cell: info => {
        const rec = info.row.original.currentRec
        const avg = calculateGradeAverage({
          scoreOral: rec.scoreOral ?? null,
          score15m: rec.score15m ?? null,
          score1Period: rec.score1Period ?? null,
          scoreMidterm: rec.scoreMidterm ?? null,
          scoreFinal: rec.scoreFinal ?? null,
        })
        return (
          <span className="font-extrabold text-base text-parish-primary">
            {avg.score !== null ? avg.score : '-'}
          </span>
        )
      },
    }),
    columnHelper.accessor(row => {
      const rec = row.currentRec
      return calculateGradeAverage({
        scoreOral: rec.scoreOral ?? null,
        score15m: rec.score15m ?? null,
        score1Period: rec.score1Period ?? null,
        scoreMidterm: rec.scoreMidterm ?? null,
        scoreFinal: rec.scoreFinal ?? null,
      }).label
    }, {
      id: 'rank',
      header: 'Xếp Loại',
      enableSorting: true,
      cell: info => (
        <span className="badge badge-primary text-xs">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor(row => row.currentRec.comments || '', {
      id: 'comments',
      header: 'Nhận Xét',
      enableSorting: false,
      cell: info => {
        const sId = info.row.original.student.id
        return (
          <input
            type="text"
            placeholder="Nhận xét..."
            value={info.getValue()}
            onChange={e => handleInputChange(sId, 'comments', e.target.value)}
            className="w-full p-1.5 text-xs rounded-md border border-border-input outline-none"
          />
        )
      },
    }),
  ], [columnHelper])

  const tableData = useMemo<RowData[]>(
    () => filteredStudents.map((s, idx) => ({
      student: s,
      index: idx,
      currentRec: matrixData[s.id] || {},
    })),
    [filteredStudents, matrixData]
  )

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const SortIcon = ({ columnId }: { columnId: string }) => {
    const sort = sorting.find(s => s.id === columnId)
    if (!sort) return <ArrowUpDown size={12} className="inline ml-1 opacity-50" />
    return sort.desc ? <ArrowDown size={12} className="inline ml-1" /> : <ArrowUp size={12} className="inline ml-1" />
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-10 border border-surface-border flex justify-between items-center flex-wrap gap-8 shadow-card">
        <div>
          <div className="flex items-center gap-5">
            <h2 className="text-lg font-extrabold text-parish-primary m-0 tracking-tight flex items-center gap-4">
              <FileSpreadsheet size={20} /> Ma Trận Nhập Điểm Hàng Loạt
            </h2>
            <span className="badge badge-primary">
              Học Kỳ {selectedSemester} ({ACADEMIC_YEAR})
            </span>
          </div>
          <p className="text-sm text-text-muted mt-2 m-0 font-medium">
            {selectedClassInfo ? `Đang nhập điểm cho Lớp: ${selectedClassInfo.name} (${filteredStudents.length} em)` : 'Vui lòng chọn lớp để nhập điểm'}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="form-select text-sm font-semibold rounded-xl h-9"
          >
            <option value="all">-- Chọn tất cả các lớp --</option>
            {MOCK_CLASSES.map(c => (
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

          <button
            onClick={handleSaveNow}
            className={`btn transition-colors duration-300 ${isSaved ? 'bg-parish-success' : 'bg-parish-primary'} text-white`}
          >
            {isSaved ? <CheckCircle size={16} /> : <Save size={16} />}
            {isSaved ? 'Đã Lưu' : isDirty ? 'Đang chờ (2s)...' : 'Lưu Ngay'}
          </button>
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
                        textAlign: ['stt', 'scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'avg', 'rank'].includes(header.id) ? 'center' : 'left',
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
                  <td colSpan={10} className="text-center p-8 text-text-muted">
                    Chưa có thiếu nhi nào trong lớp được chọn.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="border-b border-surface-hover">
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className="py-3 px-4 overflow-hidden min-w-0 align-middle"
                        style={{
                          textAlign: ['stt', 'scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'avg', 'rank'].includes(cell.column.id) ? 'center' : 'left',
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
  );
};
