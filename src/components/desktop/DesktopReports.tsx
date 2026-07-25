import { useState } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { BRANCHES } from '../../data/mockParishData';
import { useClassStore } from '../../stores/classStore';
import { Printer, FileText, BarChart2, FileSpreadsheet, Database, Ban } from 'lucide-react';
import type { Student } from '../../types';
import { PrintReportModal } from '../common/PrintReportModal';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { BackupRestoreModal } from '../common/BackupRestoreModal';
import { useAuth } from '../../hooks/useAuth';

interface DesktopReportsProps {
  onViewReport: (student: Student) => void;
}

export function DesktopReports({ onViewReport }: DesktopReportsProps) {
  const { can } = useAuth();
  const isAdmin = can('admin');
  const canPrint = can('admin', 'chunhiem', 'phuta');
  const students = useStudentStore(s => s.students);
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg);
  const selectedSemester = useFilterStore(s => s.selectedSemester);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Modals */}
      <PrintReportModal isOpen={isPrintModalOpen} onClose={() => setIsPrintModalOpen(false)} />
      <ExcelImportModal isOpen={isExcelModalOpen} onClose={() => setIsExcelModalOpen(false)} />
      <BackupRestoreModal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} />

      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-5 border border-surface-border flex justify-between items-center flex-wrap gap-4 shadow-card">
        <div>
          <h2 className="text-lg font-extrabold text-parish-primary m-0 tracking-tight flex items-center gap-2">
            <Printer size={20} /> Báo Cáo Tổng Kết & Công Cụ Quản Trị Nhà Xứ
          </h2>
          <p className="text-sm text-text-muted mt-1 m-0 font-medium">
            Tổng hợp kết quả học tập Giáo lý, In Sổ Điểm, Import Excel & Sao Lưu Dữ Liệu 1-Click
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {isAdmin && (
            <button onClick={() => setIsExcelModalOpen(true)} className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors">
              <FileSpreadsheet size={16} /> Import Excel
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setIsBackupModalOpen(true)} className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors">
              <Database size={16} /> Backup & Restore
            </button>
          )}
          {canPrint && (
            <button onClick={() => setIsPrintModalOpen(true)} className="btn btn-primary text-xs font-bold">
              <Printer size={16} /> In Sổ Điểm Lớp
            </button>
          )}
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
            const cls = useClassStore.getState().findClassById(s.classId);
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
                {canPrint && (
                  <button onClick={() => onViewReport(s)} className="btn btn-secondary btn-sm shrink-0 ml-3">
                    <FileText size={14} /> In
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
