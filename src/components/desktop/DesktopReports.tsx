import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { MOCK_CLASSES, BRANCHES } from '../../data/mockParishData';
import { Printer, FileText, BarChart2 } from 'lucide-react';
import type { Student } from '../../types';

interface DesktopReportsProps {
  onViewReport: (student: Student) => void;
}

export function DesktopReports({ onViewReport }: DesktopReportsProps) {
  const students = useStudentStore(s => s.students);
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg);
  const selectedSemester = useFilterStore(s => s.selectedSemester);

  const onPrintOverallReport = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-5 border border-surface-border flex justify-between items-center flex-wrap gap-4 shadow-card">
        <div>
          <h2 className="text-lg font-extrabold text-parish-primary m-0 tracking-tight flex items-center gap-2">
            <Printer size={20} /> Báo Cáo Tổng Kết & In Phiếu Điểm
          </h2>
          <p className="text-sm text-text-muted mt-1 m-0 font-medium">
            Tổng hợp kết quả học tập Giáo lý & Chuyên cần Niên học 2025 - 2026
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onPrintOverallReport} className="btn btn-primary">
            <Printer size={16} /> In Báo Cáo Tổng Hợp
          </button>
        </div>
      </div>

      {/* Summary Stat Table */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-card p-5">
        <h3 className="text-base font-extrabold text-parish-primary mb-4 flex items-center gap-2 h-6">
          <BarChart2 size={20} className="text-parish-primary" /> Bảng Thống Kê Học Lực Theo Phân Ngành (Học Kỳ {selectedSemester})
        </h3>
        <div className="overflow-x-auto rounded-xl border border-surface-border min-w-0">
          <table className="w-full border-collapse text-sm text-center table-fixed min-w-0">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="bg-parish-primary text-white text-xs font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3 text-left">Phân Ngành</th>
                <th className="py-2.5 px-3">Số TN</th>
                <th className="py-2.5 px-3">XS (≥9.0)</th>
                <th className="py-2.5 px-3">Giỏi</th>
                <th className="py-2.5 px-3">Khá</th>
                <th className="py-2.5 px-3">TB</th>
                <th className="py-2.5 px-3">Cần Cố Gắng</th>
              </tr>
            </thead>
            <tbody>
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
                  <tr key={b.id} className="border-b border-surface-hover hover:bg-surface-app transition-colors">
                    <td className="py-2.5 px-3 font-bold text-left">
                      <span className="badge" style={{ background: b.badgeBg, color: b.textColor }}>
                        {b.name}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">{branchStudents.length}</td>
                    <td className="py-2.5 px-3 text-parish-success font-extrabold">{xs}</td>
                    <td className="py-2.5 px-3 text-blue-700 font-extrabold">{g}</td>
                    <td className="py-2.5 px-3 text-parish-secondary font-extrabold">{k}</td>
                    <td className="py-2.5 px-3 text-text-muted font-medium">{tb}</td>
                    <td className="py-2.5 px-3 text-parish-danger font-extrabold">{y}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Print Cards */}
      <div className="bg-white rounded-2xl p-5 border border-surface-border shadow-card">
        <h3 className="text-base font-extrabold text-parish-primary mb-4 flex items-center gap-2 h-6">
          <FileText size={20} className="text-parish-secondary" /> In Trực Tiếp Phiếu Điểm Cá Nhân
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {students.slice(0, 9).map(s => {
            const cls = MOCK_CLASSES.find(c => c.id === s.classId);
            const avg = calculateStudentAvg(s.id, selectedSemester);
            return (
              <div key={s.id} className="border border-surface-border rounded-xl p-4 flex justify-between items-center bg-slate-50/60 transition-all hover:bg-white hover:shadow-card hover:border-slate-300 min-w-0">
                <div className="min-w-0 overflow-hidden">
                  <div className="font-bold text-parish-primary text-sm min-w-0 truncate">
                    <span className="text-parish-secondary font-bold mr-1.5">{s.holyName}</span>
                    <span className="text-text-main font-semibold">{s.fullName}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1 truncate">
                    {cls?.name} • ĐTB: <strong className="text-parish-primary">{avg.score ?? '-'}</strong> ({avg.label})
                  </div>
                </div>
                <button onClick={() => onViewReport(s)} className="btn btn-secondary btn-sm shrink-0 ml-3">
                  <FileText size={14} /> In
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
