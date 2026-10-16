import React, { Suspense, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type PaginationState,
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
import { FileSpreadsheet, CheckCircle, Calculator, Download, Upload, RefreshCw, Settings2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSemesterAccess } from '../../hooks/useSemesterAccess';
import { useSyncStore } from '../../stores/syncStore';
import { exportOfficialGradebook } from '../../services/reportExporter';
import { useToastStore } from '../../stores/toastStore';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { EmptyState, NoResultState } from '../common/StateFeedback';
import { Button, IconButton, SegmentedControl } from '../common/ui';

interface RowData {
  student: Student
  index: number
  currentRec: Partial<GradeRecord>
}

const columnHelper = createColumnHelper<RowData>();
const MATRIX_PAGE_SIZE = 50;
const GradeFormulaConfigModal = lazyWithRetry(() => import('./GradeFormulaConfigModal'), 'GradeFormulaConfigModal');
const ExcelGradeImportModal = lazyWithRetry(() => import('../common/ExcelGradeImportModal'), 'ExcelGradeImportModal');

function indexSemesterGrades(grades: GradeRecord[], semester: 1 | 2, academicYear: string) {
  const index = new Map<string, GradeRecord>();
  for (const grade of grades) {
    if (grade.semester !== semester || normalizeAcademicYear(grade.academicYear) !== academicYear) continue;
    if (!index.has(grade.studentId)) index.set(grade.studentId, grade);
  }
  return index;
}

const SCORE_MATRIX_FIELDS = [
  { id: 'scoreOral', header: 'Miệng', label: 'điểm miệng' },
  { id: 'score15m', header: '15P', label: 'điểm 15 phút' },
  { id: 'score1Period', header: '1 Tiết', label: 'điểm một tiết' },
  { id: 'scoreMidterm', header: 'Giữa Kỳ', label: 'điểm giữa kỳ' },
  { id: 'scoreFinal', header: 'Cuối Kỳ', label: 'điểm cuối kỳ' },
  { id: 'scoreDaoDuc', header: 'Đạo Đức', label: 'điểm đạo đức' },
] as const;

export const DesktopGradeMatrix: React.FC = () => {
  const { can } = useAuth();
  const canEditGrades = can('admin', 'chunhiem');
  const isAdmin = can('admin');
  const academicYear = useAcademicYearStore(s => s.currentYear);
  const setAcademicYear = useAcademicYearStore(s => s.setCurrentYear);
  const matrixAcademicYear = normalizeAcademicYear(academicYear) || getCurrentAcademicYear();
  const students = useStudentStore(s => s.students);
  const grades = useGradeStore(s => s.grades);
  const batchSaveGrades = useGradeStore(s => s.batchSaveGrades);
  const selectedClassId = useFilterStore(s => s.selectedClassId);
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester);
  const { restricted: _semesterRestricted, openSemester: _openSemester } = useSemesterAccess();

  const [isOverrideModeEnabled, setIsOverrideModeEnabled] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editRevision, setEditRevision] = useState(0);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: MATRIX_PAGE_SIZE });
  const matrixTableRef = useRef<HTMLTableElement>(null);
  const rowPositionsRef = useRef(new Map<string, number>());
  const rowCountRef = useRef(0);
  const pendingFocusRef = useRef<{ row: number; col: number } | null>(null);
  // null means never opened: defer the import, then retain the modal's draft
  // and in-flight progress across close/reopen just as the mounted form did.
  const [showFormulaModal, setShowFormulaModal] = useState<boolean | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean | null>(null);
  const [srAnnouncement, setSrAnnouncement] = useState<string>('');
  const syncPendingCount = useSyncStore(s => s.pendingCount);
  const formulaWeights = useSettingsStore(s => s.settings.gradeWeights);
  const rawClasses = useClassStore(s => s.classes);
  const classList = useMemo(() => getFilteredClassList(rawClasses), [rawClasses]);

  const filteredStudents = useMemo(() => {
    if (selectedClassId === 'all') return students;
    return students.filter(s => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // Build one index for the current semester/year, instead of scanning every
  // grade for every student when the route mounts or its context changes.
  const gradeByStudent = useMemo(() => indexSemesterGrades(grades, selectedSemester, matrixAcademicYear), [grades, selectedSemester, matrixAcademicYear]);

  const [matrixData, setMatrixData] = useState<Record<string, Partial<GradeRecord>>>(() => {
    const initialData: Record<string, Partial<GradeRecord>> = {};
    for (const student of filteredStudents) {
      const grade = gradeByStudent.get(student.id);
      if (grade) initialData[student.id] = grade;
    }
    return initialData;
  });

  const matrixDataRef = useRef(matrixData);
  useEffect(() => {
    matrixDataRef.current = matrixData;
  }, [matrixData]);

  // GRADE-SYNC-1 (2026-08-14): chỉ gửi đúng các học sinh có thay đổi (dirtyIdsRef)
  // thay vì toàn bộ lớp; đồng thời flush phần chưa kịp lưu khi unmount/chuyển lớp
  // để debounce 2s cũ (hủy bằng clearTimeout khi rời trang) không làm mất điểm.
  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const dirtyFieldsRef = useRef(new Map<string, Set<keyof GradeRecord>>());

  const saveDirtyGrades = useCallback(async (): Promise<boolean> => {
    const ids = new Set(dirtyIdsRef.current);
    if (ids.size === 0) return true;
    const records: GradeRecord[] = [];
    const snapshots = new Map<string, Partial<GradeRecord>>();
    ids.forEach(id => {
      const rec = matrixDataRef.current[id];
      if (rec) {
        const patch: Partial<GradeRecord> = {
          id: rec.id, studentId: rec.studentId, semester: rec.semester,
          academicYear: rec.academicYear, version: rec.version,
        };
        for (const field of dirtyFieldsRef.current.get(id) || []) {
          Object.assign(patch, { [field]: rec[field] });
          const source = `${field}_source` as keyof GradeRecord;
          if (rec[source] !== undefined) Object.assign(patch, { [source]: rec[source] });
        }
        records.push(patch as GradeRecord);
        snapshots.set(id, rec);
      }
    });
    if (records.length === 0) return true;
    try {
      await batchSaveGrades(records);
      // A newer edit to the same student may arrive while Dexie is writing.
      // Clear only the exact snapshot that received a durable acknowledgement.
      ids.forEach(id => {
        if (matrixDataRef.current[id] === snapshots.get(id)) {
          dirtyIdsRef.current.delete(id);
          dirtyFieldsRef.current.delete(id);
        }
      });
      const hasRemainingDrafts = dirtyIdsRef.current.size > 0;
      setIsDirty(hasRemainingDrafts);
      setSaveError(null);
      setIsSaved(!hasRemainingDrafts);
      setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (hasRemainingDrafts) setTimeout(() => { void saveDirtyRef.current(); }, 800);
      // A context transition may proceed only when no newer edit appeared
      // while this snapshot was being persisted.
      return !hasRemainingDrafts;
    } catch {
      // Keep dirtyIds + matrix draft intact. The user can explicitly retry and
      // no success state is rendered without a durable queue acknowledgement.
      setIsDirty(true);
      setIsSaved(false);
      setSaveError('Không thể lưu bền vững trên thiết bị. Bản nháp vẫn còn trên màn hình.');
      return false;
    }
  }, [batchSaveGrades]);

  const saveDirtyRef = useRef(saveDirtyGrades);
  saveDirtyRef.current = saveDirtyGrades;

  useEffect(() => {
    return () => { void saveDirtyRef.current(); };
  }, []);

  const currentInitKey = `${selectedClassId}_${selectedSemester}_${matrixAcademicYear}`;
  const activeContextRef = useRef<{
    key: string
    classId: string
    semester: 1 | 2
    academicYear: string
  }>({
    key: currentInitKey,
    classId: selectedClassId,
    semester: selectedSemester,
    academicYear: academicYear || matrixAcademicYear,
  });
  const contextTransitionRef = useRef(0);
  
  // REACT-185 (2026-08-14): tách rebuild theo init-key (class/học kỳ) khỏi merge theo
  // grades/students. Trước đây deps [.., students, grades] khiến MỖI lần sync (grades
  // đổi tham chiếu) chạy lại effect: setMatrixData(initialData) reset dữ liệu đang gõ
  // dở + flush thừa — tạo re-render storm nuôi loop #185 (HeaderBar unstable selector).
  useEffect(() => {
    if (activeContextRef.current?.key === currentInitKey) return;

    const previousContext = activeContextRef.current;
    const nextContext = {
      key: currentInitKey,
      classId: selectedClassId,
      semester: selectedSemester,
      academicYear: academicYear || matrixAcademicYear,
    };
    const activateNextContext = () => {
      dirtyIdsRef.current.clear();
      dirtyFieldsRef.current.clear();
      const initialData: Record<string, Partial<GradeRecord>> = {};
      // Saving can update the store while the context transition awaits durable
      // acknowledgement. Read that acknowledged snapshot, not the old closure.
      const nextGrades = indexSemesterGrades(useGradeStore.getState().grades, selectedSemester, matrixAcademicYear);
      filteredStudents.forEach(s => {
        const g = nextGrades.get(s.id);
        if (g) initialData[s.id] = g;
      });

      activeContextRef.current = nextContext;
      setMatrixData(initialData);
      setIsDirty(false);
    };

    const transitionId = ++contextTransitionRef.current;

    const transitionContext = async () => {
      const acknowledged = await saveDirtyRef.current();
      if (transitionId !== contextTransitionRef.current) return;

      if (!acknowledged) {
        // A class/semester/year switch is not allowed to discard an
        // unacknowledged academic draft. Restore the last active context so
        // the user can retry while the edited values remain visible.
        if (previousContext) {
          contextTransitionRef.current += 1;
          setSelectedClassId(previousContext.classId);
          setSelectedSemester(previousContext.semester);
          setAcademicYear(previousContext.academicYear);
        }
        return;
      }

      activateNextContext();
    };

    void transitionContext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentInitKey]);

  // Merge nhẹ khi sync đẩy grades mới: chỉ cập nhật record KHÔNG đang dirty (đang
  // chỉnh sửa dở giữ nguyên) và chỉ trong class/học kỳ hiện tại — không rebuild toàn
  // bộ matrix, không mất dữ liệu chưa lưu.
  useEffect(() => {
    if (activeContextRef.current.key !== currentInitKey) return;
    setMatrixData(prev => {
      let next = prev;
      for (const student of filteredStudents) {
        const grade = gradeByStudent.get(student.id);
        if (!grade || dirtyIdsRef.current.has(student.id) || prev[student.id] === grade) continue;
        if (next === prev) next = { ...prev };
        next[student.id] = grade;
      }
      return next;
    });
  }, [gradeByStudent, filteredStudents, currentInitKey]);

  useEffect(() => {
    pendingFocusRef.current = null;
    setPagination(previous => previous.pageIndex === 0 ? previous : { ...previous, pageIndex: 0 });
  }, [currentInitKey, sorting]);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(filteredStudents.length / MATRIX_PAGE_SIZE) - 1);
    setPagination(previous => previous.pageIndex <= lastPage ? previous : { ...previous, pageIndex: lastPage });
  }, [filteredStudents.length]);

  const updateField = useCallback((studentId: string, field: keyof GradeRecord, val: any) => {
    dirtyIdsRef.current.add(studentId);
    const fields = dirtyFieldsRef.current.get(studentId) || new Set<keyof GradeRecord>();
    fields.add(field);
    dirtyFieldsRef.current.set(studentId, fields);
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
    setSaveError(null);
    setEditRevision(revision => revision + 1);
  }, [selectedSemester, matrixAcademicYear]);

  const focusMatrixCell = useCallback((rowIdx: number, colIdx: number): boolean => {
    if (rowIdx < 0 || rowIdx >= rowCountRef.current || colIdx < 0 || colIdx >= SCORE_MATRIX_FIELDS.length) return false;
    const field = SCORE_MATRIX_FIELDS[colIdx].id;
    if (!canEditGrades || ((!isAdmin || !isOverrideModeEnabled) && field !== 'scoreDaoDuc' && field !== 'scoreOral')) return false;
    const target = matrixTableRef.current?.querySelector<HTMLInputElement>(
      `input[data-matrix-cell="true"][data-matrix-row="${rowIdx}"][data-matrix-col="${colIdx}"]`
    );
    if (target && !target.disabled) {
      target.focus();
      target.select();
      return true;
    }
    const pageIndex = Math.floor(rowIdx / MATRIX_PAGE_SIZE);
    if (pageIndex !== pagination.pageIndex) {
      // Removing a focused row does not reliably emit blur. Commit its input
      // to the existing draft owner before pagination unmounts that row.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && matrixTableRef.current?.contains(active)) active.blur();
      pendingFocusRef.current = { row: rowIdx, col: colIdx };
      setPagination(previous => ({ ...previous, pageIndex }));
      return true;
    }
    return false;
  }, [pagination.pageIndex, canEditGrades, isAdmin, isOverrideModeEnabled]);

  const handleScoreBlur = useCallback((
    e: React.FocusEvent<HTMLInputElement>,
    studentId: string,
    studentLabel: string,
    field: keyof GradeRecord,
    scoreLabel: string
  ) => {
    const raw = e.target.value.trim();
    const prev = matrixDataRef.current[studentId]?.[field];
    if (raw === '') {
      if (prev !== null && prev !== undefined) {
        updateField(studentId, field, null);
        setSrAnnouncement(`Đã xóa ${scoreLabel} của ${studentLabel}`);
      }
      return;
    }
    const val = parseFloat(raw.replace(',', '.'));
    if (!isNaN(val)) {
      const clamped = Math.max(0, Math.min(10, Math.round(val * 10) / 10));
      if (prev !== clamped) {
        updateField(studentId, field, clamped);
        e.target.value = String(clamped);
        setSrAnnouncement(`Đã lưu ${scoreLabel} ${clamped} cho ${studentLabel}`);
      }
    } else {
      e.target.value = prev === null || prev === undefined ? '' : String(prev);
    }
  }, [updateField]);

  const handleScoreKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
    _studentId: string,
    _field: keyof GradeRecord
  ) => {
    // 1. Enter / ArrowDown -> Di chuyển xuống học sinh tiếp theo (cùng cột điểm)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
      if (!focusMatrixCell(rowIdx + 1, colIdx)) {
        focusMatrixCell(0, colIdx + 1);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusMatrixCell(rowIdx + 1, colIdx);
      return;
    }

    // 2. Shift+Enter / ArrowUp -> Di chuyển lên học sinh trước đó (cùng cột điểm)
    if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ArrowUp') {
      e.preventDefault();
      focusMatrixCell(rowIdx - 1, colIdx);
      return;
    }

    // 3. ArrowRight / Tab (không shift) -> Di chuyển sang cột điểm tiếp theo
    if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      const isAtEnd = input.selectionStart === input.value.length || (input.selectionStart === 0 && input.selectionEnd === input.value.length);
      if (isAtEnd) {
        e.preventDefault();
        if (!focusMatrixCell(rowIdx, colIdx + 1)) {
          focusMatrixCell(rowIdx + 1, 0);
        }
      }
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (!focusMatrixCell(rowIdx, colIdx + 1)) {
        focusMatrixCell(rowIdx + 1, 0);
      }
      return;
    }

    // 4. ArrowLeft / Shift+Tab -> Di chuyển sang cột điểm trước đó
    if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      const isAtStart = input.selectionStart === 0 || (input.selectionStart === 0 && input.selectionEnd === input.value.length);
      if (isAtStart) {
        e.preventDefault();
        if (!focusMatrixCell(rowIdx, colIdx - 1)) {
          focusMatrixCell(rowIdx - 1, SCORE_MATRIX_FIELDS.length - 1);
        }
      }
      return;
    }

    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      if (!focusMatrixCell(rowIdx, colIdx - 1)) {
        focusMatrixCell(rowIdx - 1, SCORE_MATRIX_FIELDS.length - 1);
      }
      return;
    }
  }, [focusMatrixCell]);

  useEffect(() => {
    if (!isDirty) return;
    // GRADE-SYNC-1 (2026-08-14): debounce 800ms (trước 2s). Chỉ gửi dirty records;
    // phần chưa kịp gửi được flush khi unmount/chuyển lớp (saveDirtyRef effect).
    const timer = setTimeout(() => {
      void saveDirtyRef.current();
    }, 800);
    return () => clearTimeout(timer);
  }, [isDirty, editRevision, saveDirtyGrades]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportOfficialGradebook({
        classId: selectedClassId,
        semester: selectedSemester,
        academicYear: matrixAcademicYear,
      });
      useToastStore.getState().addToast('Đã xuất bảng điểm chính thức từ máy chủ.', 'success');
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : 'Không thể xuất bảng điểm chính thức.', 'error');
    } finally {
      setIsExporting(false);
    }
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
      cell: info => <span className="font-bold text-amber-950 dark:text-amber-400 text-sm">{info.getValue() || '—'}</span>,
      size: 140,
    }),
    columnHelper.accessor(row => row.student.fullName, {
      id: 'fullName',
      header: 'Họ và Tên',
      cell: info => <span className="font-extrabold text-text-main text-base">{info.getValue()}</span>,
      size: 240,
    }),
    ...SCORE_MATRIX_FIELDS.map((scoreDef, colIdx) =>
      columnHelper.accessor(row => row.currentRec[scoreDef.id], {
        id: scoreDef.id,
        header: scoreDef.header,
        cell: info => {
          const val = info.getValue();
          const { student } = info.row.original;
          const rowIndex = rowPositionsRef.current.get(info.row.id) ?? info.row.index;
          const scoreLabel = scoreDef.label;
          const studentLabel = `${student.holyName ? `${student.holyName} ` : ''}${student.fullName}`;
          return (
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Nhập ${scoreLabel} cho ${studentLabel}`}
              data-matrix-cell="true"
              data-matrix-row={rowIndex}
              data-matrix-col={colIdx}
              disabled={!canEditGrades || ((!isAdmin || !isOverrideModeEnabled) && scoreDef.id !== 'scoreDaoDuc' && scoreDef.id !== 'scoreOral')}
              key={`${student.id}:${matrixAcademicYear}:${selectedSemester}:${scoreDef.id}`}
              defaultValue={val === null || val === undefined ? '' : String(val)}
              onFocus={e => e.currentTarget.select()}
              onBlur={e => handleScoreBlur(e, student.id, studentLabel, scoreDef.id, scoreLabel)}
              onKeyDown={e => handleScoreKeyDown(e, rowIndex, colIdx, student.id, scoreDef.id)}
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
          aria-label={`Nhận xét cho ${info.row.original.student.holyName ? `${info.row.original.student.holyName} ` : ''}${info.row.original.student.fullName}`}
          value={info.getValue() || ''}
          onChange={e => updateField(info.row.original.student.id, 'comments', e.target.value)}
          className="form-input w-full h-9 px-3 text-sm font-medium bg-surface-card text-text-main border border-surface-border rounded-xl focus:border-parish-primary outline-none shadow-xs"
        />
      ),
      size: 170,
    }),
  ], [canEditGrades, isAdmin, isOverrideModeEnabled, handleScoreBlur, handleScoreKeyDown, formulaWeights, updateField, matrixAcademicYear, selectedSemester]);

  const table = useReactTable({
    data: tableData,
    columns,
    getRowId: row => row.student.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    // Edits and background sync must keep the current page and focused draft.
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const sortedRows = table.getPrePaginationRowModel().rows;
  rowPositionsRef.current = useMemo(() => new Map(sortedRows.map((row, index) => [row.id, index])), [sortedRows]);
  rowCountRef.current = sortedRows.length;

  useEffect(() => {
    const requested = pendingFocusRef.current;
    if (!requested) return;
    const target = matrixTableRef.current?.querySelector<HTMLInputElement>(
      `input[data-matrix-row="${requested.row}"][data-matrix-col="${requested.col}"]`
    );
    if (target && !target.disabled) {
      pendingFocusRef.current = null;
      target.focus();
      target.select();
    }
  }, [pagination, tableData]);

  const currentClassName = classList.find(c => c.id === selectedClassId)?.name || 'Tất cả lớp';

  return (
    <div className="product-view space-y-3.5 pb-8">
      {/* Hidden Live Announcer for Screen Readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      {/* Subtab Controls Command Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-1.5 rounded-xl border border-surface-border bg-surface-card shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <FileSpreadsheet size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text-primary truncate">
              Ma Trận Nhập Điểm
            </h2>
            <p className="text-xs text-text-muted truncate hidden xl:block">
              <span>
                Lớp: <span className="text-parish-primary font-bold">{currentClassName}</span> • Học Kỳ {selectedSemester}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Class Select */}
          <div className="flex items-center gap-1.5 bg-surface-hover px-2 py-0.5 rounded-lg border border-surface-border shadow-inner">
            <span className="text-[10px] font-black text-text-secondary uppercase">Lớp:</span>
            <select
              aria-label="Chọn lớp cho ma trận điểm"
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="text-xs font-bold border-none bg-transparent outline-none cursor-pointer pr-1 h-7"
            >
              <option value="all">Tất cả lớp</option>
              {classList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Semester Switcher */}
          <SegmentedControl
            id="grade-matrix-semester"
            ariaLabel="Học kỳ của bảng điểm"
            value={String(selectedSemester) as '1' | '2'}
            onValueChange={(value) => setSelectedSemester(Number(value) as 1 | 2)}
            items={[
              { value: '1', label: 'HK I' },
              { value: '2', label: 'HK II' },
            ]}
          />

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <IconButton
                onClick={() => setShowFormulaModal(true)}
                label="Cấu hình hệ số điểm"
                icon={<Settings2 aria-hidden="true" size={15} />}
                variant="secondary"
                className="h-8.5 w-8.5 rounded-xl shadow-xs"
                title="Cấu hình hệ số"
              />
            )}
            {isAdmin && (
              <Button
                onClick={() => setIsOverrideModeEnabled(!isOverrideModeEnabled)}
                variant="plain"
                size="sm"
                leadingIcon={<Calculator aria-hidden="true" size={13} />}
                className={`px-2.5 h-8.5 font-bold text-xs rounded-xl shadow-xs ${isOverrideModeEnabled ? 'bg-parish-warning-bg text-parish-warning-hover border border-parish-warning/30' : 'bg-surface-card border border-surface-border text-text-main hover:bg-surface-hover'}`}
              >
                {isOverrideModeEnabled ? 'Đang Sửa' : 'Chế Độ Sửa'}
              </Button>
            )}
            <Button
              onClick={() => setShowImportModal(true)}
              variant="secondary"
              size="sm"
              leadingIcon={<Upload aria-hidden="true" size={13} />}
              className="px-2.5 h-8.5 font-bold text-xs rounded-xl shadow-xs"
            >
              Nhập Excel
            </Button>
            <Button
              onClick={() => { void handleExportExcel() }}
              disabled={isExporting}
              variant="primary"
              size="sm"
              leadingIcon={<Download aria-hidden="true" size={13} />}
              className="px-2.5 h-8.5 font-bold text-xs rounded-xl shadow-xs"
            >
              {isExporting ? 'Đang xuất…' : 'Xuất Excel'}
            </Button>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      <div className="view-toolbar animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          {saveError ? (
            <div className="flex items-center gap-2 text-[var(--color-parish-danger)] text-xs font-black uppercase tracking-wider">
              <span>{saveError}</span>
              <button type="button" className="btn btn-secondary" onClick={() => void saveDirtyGrades()}>
                Thử lưu lại
              </button>
            </div>
          ) : isDirty ? (
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
          Mẹo phím tắt: Dùng các phím mũi tên ↑ ↓ ← →, Enter, Tab để di chuyển và nhập điểm siêu tốc.
        </div>
      </div>

      {/* Matrix Table */}
      <div className="table-wrapper">
        <div className="table-scroll" role="region" aria-label="Bảng điểm học kỳ" tabIndex={0}>
          <table ref={matrixTableRef} className="w-full text-sm text-left border-collapse table-fixed">
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
        {table.getPageCount() > 1 && (
          <nav aria-label="Phân trang bảng điểm" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-surface-border bg-surface-app">
            <p className="text-xs font-bold text-text-secondary" aria-live="polite">
              Hiển thị {pagination.pageIndex * MATRIX_PAGE_SIZE + 1}–{Math.min((pagination.pageIndex + 1) * MATRIX_PAGE_SIZE, sortedRows.length)} / {sortedRows.length} em · Trang {pagination.pageIndex + 1} / {table.getPageCount()}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Trang trước</Button>
              <Button variant="secondary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Trang sau</Button>
            </div>
          </nav>
        )}
      </div>

      {isAdmin && showFormulaModal !== null && <Suspense fallback={null}><GradeFormulaConfigModal isOpen={showFormulaModal} onClose={() => setShowFormulaModal(false)} /></Suspense>}
      {showImportModal !== null && <Suspense fallback={null}><ExcelGradeImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} semester={selectedSemester} /></Suspense>}
    </div>
  );
};
