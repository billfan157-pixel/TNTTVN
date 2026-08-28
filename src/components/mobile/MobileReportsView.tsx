import React, { useEffect, useMemo, useState } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { useSemesterAccess } from '../../hooks/useSemesterAccess';
import { BRANCHES } from '../../constants/branches';
import { Printer, FileText, BarChart2, Award, Search, Users } from 'lucide-react';
import type { Student } from '../../types';

interface MobileReportsViewProps {
  onPrintReport: (student: Student) => void;
}

const REPORT_PAGE_SIZE = 30;

export const MobileReportsView: React.FC<MobileReportsViewProps> = ({ onPrintReport }) => {
  const students = useStudentStore(s => s.students);
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester);
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess();
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(REPORT_PAGE_SIZE);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('vi');
    if (!normalizedQuery) return students;
    return students.filter(student => (
      `${student.holyName || ''} ${student.fullName} ${student.code}`
        .toLocaleLowerCase('vi')
        .includes(normalizedQuery)
    ));
  }, [searchQuery, students]);

  useEffect(() => {
    setVisibleLimit(REPORT_PAGE_SIZE);
  }, [searchQuery]);

  const visibleStudents = useMemo(
    () => filteredStudents.slice(0, visibleLimit),
    [filteredStudents, visibleLimit],
  );

  const branchStats = useMemo(() => Object.values(BRANCHES).map(branch => {
    const branchStudents = students.filter(student => student.branch === branch.id);
    let excellent = 0, good = 0, fair = 0, average = 0, weak = 0;
    branchStudents.forEach(student => {
      const result = calculateStudentAvg(student.id, selectedSemester);
      if (result.label === 'Xuất Sắc') excellent++;
      else if (result.label === 'Giỏi') good++;
      else if (result.label === 'Khá') fair++;
      else if (result.label === 'Trung Bình') average++;
      else if (result.label === 'Yếu') weak++;
    });
    return { branch, studentCount: branchStudents.length, excellent, good, fair, average, weak };
  }), [calculateStudentAvg, selectedSemester, students]);

  return (
    <div className="mobile-screen mobile-screen--stack product-view" style={{ gap: '16px' }}>
      {/* Header Banner */}
      <div className="mobile-page-header mobile-page-header--brand flex-col items-stretch">
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 size={20} className="text-yellow-300" />
          <h2 className="text-base font-extrabold m-0">Báo Cáo & Kết Quả Học Tập</h2>
        </div>
        <p className="text-xs opacity-90 m-0">
          Tổng hợp & in kết quả học tập Thiếu Nhi
        </p>

        {/* Semester Selector */}
        <div className="flex bg-white/15 p-1 rounded-xl mt-3 border border-white/20">
          {semesterRestricted ? (
            <span className="flex-1 min-h-[44px] py-2 flex items-center justify-center text-center text-xs font-bold rounded-lg bg-white text-parish-primary shadow-sm">
              Học Kỳ {openSemester === 2 ? 'II' : 'I'}
            </span>
          ) : (
            <>
              <button
                onClick={() => setSelectedSemester(1)}
                className={`flex-1 min-h-[44px] py-2 flex items-center justify-center text-xs font-bold rounded-lg transition-all border-none cursor-pointer ${
                  selectedSemester === 1 ? 'bg-white text-parish-primary shadow-sm' : 'text-white/80'
                }`}
              >
                Học Kỳ I
              </button>
              <button
                onClick={() => setSelectedSemester(2)}
                className={`flex-1 min-h-[44px] py-2 flex items-center justify-center text-xs font-bold rounded-lg transition-all border-none cursor-pointer ${
                  selectedSemester === 2 ? 'bg-white text-parish-primary shadow-sm' : 'text-white/80'
                }`}
              >
                Học Kỳ II
              </button>
            </>
          )}
        </div>
      </div>

      {/* Branch Stats Summary Cards */}
      <div className="app-panel p-4">
        <h3 className="text-sm font-extrabold text-parish-primary mb-3 flex items-center gap-2">
          <Award size={16} className="text-parish-secondary" />
          Thống Kê Phân Ngành (HK{selectedSemester})
        </h3>
        <div className="flex flex-col gap-2.5">
          {branchStats.map(({ branch: b, studentCount, excellent, good, fair, average, weak }) => {
            return (
              <div key={b.id} className="bg-surface-hover p-3 rounded-xl border border-surface-border flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span
                    className="badge branch-badge text-xs font-bold"
                    style={{
                      '--branch-accent': b.scarfColor,
                      '--branch-bg': b.badgeBg,
                      '--branch-text': b.textColor,
                    } as React.CSSProperties}
                  >
                    {b.name}
                  </span>
                  <span className="text-xs font-semibold text-text-muted">
                    Sĩ số: <strong className="text-text-main">{studentCount}</strong> em
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-center text-xs mt-2">
                  {[
                    ['XS', excellent, 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'],
                    ['Giỏi', good, 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400'],
                    ['Khá', fair, 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'],
                    ['TB', average, 'bg-surface-hover dark:bg-surface-card border-surface-border text-text-muted'],
                    ['Yếu', weak, 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'],
                  ].map(([label, val, cls]) => (
                    <div key={String(label)} className={`rounded-lg p-1.5 border ${cls} flex flex-col items-center`}>
                      <div className="text-[10px] font-bold leading-none">{label as string}</div>
                      <div className="font-black text-[13px] mt-1 tabular-nums">{val as number}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Student List for Print */}
      <div className="app-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-parish-primary m-0 flex items-center gap-2">
            <FileText size={16} className="text-parish-secondary" />
            Danh Sách In Kết Quả
          </h3>
          <span className="text-xs font-semibold text-text-muted">{filteredStudents.length}/{students.length} em</span>
        </div>
        <label className="relative mb-3 block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="form-input w-full pl-9"
            placeholder="Tìm tên thánh, họ tên hoặc mã..."
            aria-label="Tìm học sinh để in kết quả"
          />
        </label>
        <div className="flex flex-col gap-2">
          {filteredStudents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-border bg-surface-app p-6 text-center text-text-muted">
              <Users size={28} className="mx-auto mb-2 opacity-50" />
              <p className="m-0 text-sm font-bold">Không tìm thấy học sinh phù hợp</p>
              <button type="button" className="btn btn-ghost mt-2" onClick={() => setSearchQuery('')}>
                Xóa tìm kiếm
              </button>
            </div>
          ) : visibleStudents.map(s => {
            const avg = calculateStudentAvg(s.id, selectedSemester);
            return (
              <div key={s.id} className="entity-card p-3 flex justify-between items-center">
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-sm text-text-main truncate">
                    <span className="text-parish-secondary font-bold mr-1">{s.holyName}</span>
                    {s.fullName}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    ĐTB: <strong className="text-parish-primary">{avg.score ?? '-'}</strong> • Xếp loại: <span className="font-semibold text-text-main">{avg.label}</span>
                  </div>
                </div>
                <button
                  onClick={() => onPrintReport(s)}
                  className="btn btn-secondary mobile-btn shrink-0"
                >
                  <Printer size={14} /> In
                </button>
              </div>
            );
          })}
          {visibleStudents.length < filteredStudents.length && (
            <button
              type="button"
              className="btn btn-secondary mobile-btn w-full mt-1"
              onClick={() => setVisibleLimit(limit => limit + REPORT_PAGE_SIZE)}
            >
              Xem thêm {Math.min(REPORT_PAGE_SIZE, filteredStudents.length - visibleStudents.length)} em
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
