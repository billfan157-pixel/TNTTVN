import { useState, useMemo } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { BRANCHES } from '../../constants/branches';
import { useClassStore } from '../../stores/classStore';
import { Printer, FileText, BarChart2, FileSpreadsheet, Database, Download, Search } from 'lucide-react';
import type { Student } from '../../types';
import { PageHeader } from '../common/PageHeader';
import { PrintReportModal } from '../common/PrintReportModal';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { BackupRestoreModal } from '../common/BackupRestoreModal';
import { EmptyState, NoResultState } from '../common/StateFeedback';
import { useAuth } from '../../hooks/useAuth';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { StudentName } from '../common/StudentName';
import {
  buildBranchSummaryRows,
  buildStudentDetailRows,
  exportCsv,
  exportXlsx,
  exportFilename,
} from '../../services/reportExporter';

interface DesktopReportsProps {
  onPrintReport: (student: Student) => void;
}

export function DesktopReports({ onPrintReport }: DesktopReportsProps) {
  const { can } = useAuth();
  const isAdmin = can('admin');
  const canPrint = can('admin', 'chunhiem', 'phuta');
  const students = useStudentStore(s => s.students);
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg);
  const findClassById = useClassStore(s => s.findClassById);
  const selectedSemester = useFilterStore(s => s.selectedSemester);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printReportType, setPrintReportType] = useState<import('../../utils/pdfGenerator').ReportType | undefined>(undefined);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog();

  // Quick-print: tìm kiếm thay vì cap cứng 9 học sinh đầu tiên
  const QUICK_PRINT_LIMIT = 12;
  const matchedStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    const base = q
      ? students.filter(s =>
          s.fullName.toLowerCase().includes(q) ||
          (s.holyName || '').toLowerCase().includes(q))
      : students;
    return base.slice(0, QUICK_PRINT_LIMIT);
  }, [students, studentQuery]);

  const openPrintModal = (type?: import('../../utils/pdfGenerator').ReportType) => {
    setPrintReportType(type);
    setIsPrintModalOpen(true);
  };

  const handleExport = (kind: 'branch' | 'students', format: 'csv' | 'xlsx') => {
    try {
      if (kind === 'branch') {
        const rows = buildBranchSummaryRows(selectedSemester);
        const filename = exportFilename('BaoCao_ThongKe_PhanNganh_HK' + selectedSemester);
        if (format === 'csv') exportCsv(filename, rows);
        else void exportXlsx(filename, 'Thống kê phân ngành', rows).catch(console.error);
      } else {
        const rows = buildStudentDetailRows();
        const filename = exportFilename('BaoCao_ChiTiet_HocSinh');
        if (format === 'csv') exportCsv(filename, rows);
        else void exportXlsx(filename, 'Chi tiết học sinh', rows).catch(console.error);
      }
    } catch (err) {
      void askConfirm({
        title: 'Lỗi xuất báo cáo',
        message: 'Lỗi khi xuất báo cáo! Vui lòng thử lại.',
        confirmText: 'OK',
        variant: 'danger',
        showCancel: false,
      })
      console.error('[DesktopReports] export failed:', err);
    }
  };

  return (
    <div className="product-view flex flex-col gap-6">
      {/* Modals */}
      <PrintReportModal isOpen={isPrintModalOpen} onClose={() => setIsPrintModalOpen(false)} initialReportType={printReportType} />
      <ExcelImportModal isOpen={isExcelModalOpen} onClose={() => setIsExcelModalOpen(false)} />
      <BackupRestoreModal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} />
      {confirmDialog}

      {/* Header Bar */}
      <PageHeader
        icon={<BarChart2 className="w-6 h-6 text-parish-primary" />}
        title="Báo Cáo & Thống Kê"
        description="Tổng hợp kết quả học tập Giáo lý, In Sổ Điểm & Import Excel"
        actions={
          <>
            {isAdmin && (
              <button onClick={() => setIsExcelModalOpen(true)} className="btn btn-secondary text-xs font-bold">
                <FileSpreadsheet size={16} /> Import Excel
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setIsBackupModalOpen(true)} className="btn btn-secondary text-xs font-bold">
                <Database size={16} /> Backup & Restore
              </button>
            )}
            {canPrint && (
              <button onClick={() => openPrintModal('CLASS_GRADEBOOK')} className="btn btn-primary text-xs font-bold">
                <Printer size={16} /> In Sổ Điểm Lớp
              </button>
            )}
          </>
        }
      />

      {/* Summary Stat Table */}
      <div className="section-card">
        <h3 className="text-base font-extrabold text-parish-primary mb-4 flex items-center gap-2 h-6">
          <BarChart2 size={20} className="text-parish-primary" /> Bảng Thống Kê Học Lực Theo Phân Ngành (Học Kỳ {selectedSemester})
        </h3>
        <div className="overflow-x-auto rounded-xl border border-surface-border min-w-0">
          <table className="w-full border-collapse text-sm text-center table-fixed min-w-0 bg-surface-card text-text-main">
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
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3 text-left" scope="col">Phân Ngành</th>
                <th className="py-2.5 px-3" scope="col">Số TN</th>
                <th className="py-2.5 px-3" scope="col">XS (≥9.0)</th>
                <th className="py-2.5 px-3" scope="col">Giỏi</th>
                <th className="py-2.5 px-3" scope="col">Khá</th>
                <th className="py-2.5 px-3" scope="col">TB</th>
                <th className="py-2.5 px-3" scope="col">Cần Cố Gắng</th>
              </tr>
            </thead>
            <tbody className="bg-surface-card">
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
                  <tr key={b.id} className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors">
                    <td className="py-2.5 px-3 font-bold text-left">
                      <span className="badge" style={{ background: b.badgeBg, color: b.textColor }}>
                        {b.name}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-text-main">{branchStudents.length}</td>
                    <td className="py-2.5 px-3 text-parish-success font-extrabold">{xs}</td>
                    <td className="py-2.5 px-3 text-sky-700 font-extrabold">{g}</td>
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

      {/* Advanced Reports / Export */}
      {canPrint && (
        <div className="app-panel p-5">
          <h3 className="text-base font-extrabold text-parish-primary mb-4 flex items-center gap-2 h-6">
            <Download size={20} className="text-emerald-600" /> Báo Cáo Nâng Cao & Xuất File (CSV / Excel)
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-surface-border rounded-xl p-4 bg-surface-hover">
              <div className="font-bold text-parish-primary text-sm mb-3">
                Thống Kê Học Lực Theo Phân Ngành (Học Kỳ {selectedSemester})
              </div>
              <div className="flex gap-3">
                <button onClick={() => handleExport('branch', 'csv')} className="btn btn-secondary text-xs font-bold">
                  <Download size={14} /> Xuất CSV
                </button>
                <button onClick={() => handleExport('branch', 'xlsx')} className="btn btn-secondary text-xs font-bold">
                  <FileSpreadsheet size={14} /> Xuất Excel
                </button>
              </div>
            </div>
            <div className="border border-surface-border rounded-xl p-4 bg-surface-hover">
              <div className="font-bold text-parish-primary text-sm mb-3">
                Chi Tiết Từng Học Sinh (Điểm HK1/HK2, Xếp Loại, Chuyên Cần)
              </div>
              <div className="flex gap-3">
                <button onClick={() => handleExport('students', 'csv')} className="btn btn-secondary text-xs font-bold">
                  <Download size={14} /> Xuất CSV
                </button>
                <button onClick={() => handleExport('students', 'xlsx')} className="btn btn-secondary text-xs font-bold">
                  <FileSpreadsheet size={14} /> Xuất Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Print Cards */}
      <div className="app-panel p-5">
        <h3 className="text-base font-extrabold text-parish-primary mb-4 flex items-center gap-2 h-6">
          <FileText size={20} className="text-parish-secondary" /> In Trực Tiếp Kết Quả Học Tập Cá Nhân
        </h3>
        {students.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Chưa có dữ liệu học sinh"
            description="Hãy thêm học sinh vào các lớp để sử dụng tính năng in kết quả học tập."
          />
        ) : (
          <>
            <div className="relative mb-4 max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder pointer-events-none" />
              <input
                type="search"
                value={studentQuery}
                onChange={e => setStudentQuery(e.target.value)}
                placeholder="Tìm học sinh theo tên hoặc tên thánh..."
                aria-label="Tìm học sinh để in kết quả"
                className="form-input w-full pl-9 text-sm"
              />
            </div>
            {matchedStudents.length === 0 ? (
              <NoResultState
                description={`Không tìm thấy học sinh nào khớp "${studentQuery.trim()}". Thử từ khóa khác hoặc xóa tìm kiếm.`}
                onReset={() => setStudentQuery('')}
                resetLabel="Xóa tìm kiếm"
              />
            ) : (
              <>
                <p className="text-xs text-text-muted mb-3">
                  Hiển thị {matchedStudents.length} / {students.length} học sinh{studentQuery.trim() ? ' (kết quả tìm kiếm)' : ' — nhập để tìm nhanh'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matchedStudents.map(s => {
                    const cls = findClassById(s.classId);
                    const avg = calculateStudentAvg(s.id, selectedSemester);
                    return (
                      <div key={s.id} className="entity-card app-panel--interactive p-4 flex justify-between items-center min-w-0">
                        <div className="min-w-0 overflow-hidden">
                          <StudentName holyName={s.holyName} fullName={s.fullName} size="sm" />
                          <div className="text-xs text-text-muted mt-1 truncate">
                            {cls?.name} • ĐTB: <strong className="text-parish-primary">{avg.score ?? '-'}</strong> ({avg.label})
                          </div>
                        </div>
                        {canPrint && (
                          <button onClick={() => onPrintReport(s)} className="btn btn-secondary btn-sm shrink-0 ml-3">
                            <FileText size={14} /> In
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
