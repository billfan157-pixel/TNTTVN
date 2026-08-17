import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { useSemesterAccess } from '../../hooks/useSemesterAccess';
import { BRANCHES } from '../../constants/branches';
import { Printer, FileText, BarChart2, Award } from 'lucide-react';
import type { Student } from '../../types';

interface MobileReportsViewProps {
  onPrintReport: (student: Student) => void;
}

export const MobileReportsView: React.FC<MobileReportsViewProps> = ({ onPrintReport }) => {
  const students = useStudentStore(s => s.students);
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester);
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess();

  return (
    <div className="mobile-screen mobile-screen--stack" style={{ gap: '16px' }}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-parish-primary to-parish-primary-hover text-white rounded-2xl p-5 shadow-card">
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
      <div className="bg-surface-card rounded-2xl border border-surface-border p-4 shadow-card">
        <h3 className="text-sm font-extrabold text-parish-primary mb-3 flex items-center gap-2">
          <Award size={16} className="text-parish-secondary" />
          Thống Kê Phân Ngành (HK{selectedSemester})
        </h3>
        <div className="flex flex-col gap-2.5">
          {Object.values(BRANCHES).map(b => {
            const branchStudents = students.filter(s => s.branch === b.id);
            let xs = 0, g = 0, k = 0, tb = 0, y = 0;
            branchStudents.forEach(s => {
              const res = calculateStudentAvg(s.id, selectedSemester);
              if (res.label === 'Xuất Sắc') xs++;
              else if (res.label === 'Giỏi') g++;
              else if (res.label === 'Khá') k++;
              else if (res.label === 'Trung Bình') tb++;
              else if (res.label === 'Yếu') y++;
            });
            return (
              <div key={b.id} className="bg-surface-hover p-3 rounded-xl border border-surface-border flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="badge text-xs font-bold" style={{ background: b.badgeBg, color: b.textColor }}>
                    {b.name}
                  </span>
                  <span className="text-xs font-semibold text-text-muted">
                    Sĩ số: <strong className="text-text-main">{branchStudents.length}</strong> em
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-center text-xs mt-1">
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 p-1 rounded border border-emerald-200 dark:border-emerald-800">
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">XS</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">{xs}</div>
                  </div>
                  <div className="bg-sky-50 dark:bg-sky-950/40 p-1 rounded border border-sky-200 dark:border-sky-800">
                    <div className="text-[10px] text-sky-700 dark:text-sky-400 font-medium">Giỏi</div>
                    <div className="font-bold text-sky-600 dark:text-sky-400">{g}</div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/40 p-1 rounded border border-amber-200 dark:border-amber-800">
                    <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">Khá</div>
                    <div className="font-bold text-amber-600 dark:text-amber-400">{k}</div>
                  </div>
                  <div className="bg-surface-hover dark:bg-surface-card p-1 rounded border border-surface-border dark:border-surface-hover">
                    <div className="text-[10px] text-text-muted font-medium">TB</div>
                    <div className="font-bold text-text-main">{tb}</div>
                  </div>
                  <div className="bg-rose-50 dark:bg-rose-950/40 p-1 rounded border border-rose-200 dark:border-rose-800">
                    <div className="text-[10px] text-rose-700 dark:text-rose-400 font-medium">Yếu</div>
                    <div className="font-bold text-rose-600 dark:text-rose-400">{y}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Student List for Print */}
      <div className="bg-surface-card rounded-2xl p-4 border border-surface-border shadow-card">
        <h3 className="text-sm font-extrabold text-parish-primary mb-3 flex items-center gap-2">
          <FileText size={16} className="text-parish-secondary" />
          Danh Sách In Kết Quả Học Tập
        </h3>
        <div className="flex flex-col gap-2">
          {students.map(s => {
            const avg = calculateStudentAvg(s.id, selectedSemester);
            return (
              <div key={s.id} className="p-3 rounded-xl border border-surface-border bg-surface-hover flex justify-between items-center">
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
        </div>
      </div>
    </div>
  );
};
