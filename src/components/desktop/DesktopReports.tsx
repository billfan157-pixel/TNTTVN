import { useState, useMemo, useEffect } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useFilterStore } from '../../stores/filterStore';
import { BRANCHES } from '../../constants/branches';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import { Printer, FileText, BarChart2, FileSpreadsheet, Database, Download, Search } from 'lucide-react';
import type { Student } from '../../types';
import { PageHeader } from '../common/PageHeader';
import { DesktopAppShell } from './DesktopAppShell';
import { PrintReportModal } from '../common/PrintReportModal';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { BackupRestoreModal } from '../common/BackupRestoreModal';
import { EmptyState, NoResultState } from '../common/StateFeedback';
import { useAuth } from '../../hooks/useAuth';
import { useToastStore } from '../../stores/toastStore';
import { StudentName } from '../common/StudentName';
import {
  buildBranchSummaryRows,
  buildStudentDetailRows,
  exportCsv,
  exportXlsx,
  exportFilename,
} from '../../services/reportExporter';
import { fetchOfficialAcademicYearReports, type OfficialClassReport } from '../../services/officialReporting';
import { getCurrentAcademicYear, normalizeAcademicYear } from '../../utils/academicYear';

interface DesktopReportsProps {
  onPrintReport: (student: Student) => void;
}

export function DesktopReports({ onPrintReport }: DesktopReportsProps) {
  const { can } = useAuth();
  const isAdmin = can('admin');
  const canPrint = can('admin', 'chunhiem', 'phuta');
  const students = useStudentStore(s => s.students);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const currentYear = useAcademicYearStore(s => s.currentYear);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printReportType, setPrintReportType] = useState<import('../../utils/pdfGenerator').ReportType | undefined>(undefined);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [officialReports, setOfficialReports] = useState<OfficialClassReport[]>([]);
  const [officialError, setOfficialError] = useState<string | null>(null);
  const [isOfficialLoading, setIsOfficialLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const year = normalizeAcademicYear(currentYear) || getCurrentAcademicYear();
    setOfficialReports([]);
    setOfficialError(null);
    setIsOfficialLoading(true);
    void fetchOfficialAcademicYearReports(year).then(reports => {
      if (active) {
        setOfficialReports(reports);
        setIsOfficialLoading(false);
      }
    }).catch(err => {
      if (active) {
        setOfficialError(err instanceof Error ? err.message : 'Không thể tải dữ liệu báo cáo chính thức');
        setIsOfficialLoading(false);
      }
    });
    return () => { active = false; };
  }, [currentYear]);

  useEffect(() => {
    if (typeof useStudentStore.getState === 'function') {
      const state = useStudentStore.getState();
      if (state?.students?.length === 0 && typeof state?.fetchStudents === 'function') {
        void state.fetchStudents();
      }
    }
  }, []);

  const officialByStudentId = useMemo(() => new Map(
    officialReports.flatMap(classReport => classReport.reportCards.map(report => [report.student.id, {
      report,
      className: classReport.summary.className,
    }] as const)),
  ), [officialReports]);
  const officialStudentCount = officialByStudentId.size;

  const mergedStudents = useMemo(() => {
    const studentMap = new Map(students.map(s => [s.id, s]));
    return officialReports.flatMap(classReport =>
      classReport.reportCards.map(report => {
        const existing = studentMap.get(report.student.id);
        if (existing) return existing;
        return {
          id: report.student.id,
          code: report.student.code,
          holyName: report.student.holyName || '',
          fullName: report.student.fullName,
          gender: (report.student.gender === 'Nữ' ? 'Nữ' : 'Nam') as 'Nam' | 'Nữ',
          dateOfBirth: report.student.dateOfBirth || '',
          parentName: '',
          parentPhone: '',
          address: '',
          branch: (classReport.classInfo.branchId as any) || 'AuNhi',
          classId: classReport.classInfo.id,
          status: 'Đang học',
        } as Student;
      })
    );
  }, [officialReports, students]);

  // Quick-print: tìm kiếm thay vì cap cứng 9 học sinh đầu tiên
  const QUICK_PRINT_LIMIT = 12;
  const matchedStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    const eligible = mergedStudents.filter(s => officialByStudentId.has(s.id));
    const base = q
      ? eligible.filter(s =>
          s.fullName.toLowerCase().includes(q) ||
          (s.holyName || '').toLowerCase().includes(q))
      : eligible;
    return base.slice(0, QUICK_PRINT_LIMIT);
  }, [officialByStudentId, mergedStudents, studentQuery]);

  const openPrintModal = (type?: import('../../utils/pdfGenerator').ReportType) => {
    setPrintReportType(type);
    setIsPrintModalOpen(true);
  };

  const handleExport = async (kind: 'branch' | 'students', format: 'csv' | 'xlsx') => {
    try {
      if (kind === 'branch') {
        const rows = await buildBranchSummaryRows(selectedSemester);
        const filename = exportFilename('BaoCao_ThongKe_PhanNganh_HK' + selectedSemester);
        if (format === 'csv') exportCsv(filename, rows);
        else await exportXlsx(filename, 'Thống kê phân ngành', rows);
      } else {
        const rows = await buildStudentDetailRows();
        const filename = exportFilename('BaoCao_ChiTiet_HocSinh');
        if (format === 'csv') exportCsv(filename, rows);
        else await exportXlsx(filename, 'Chi tiết học sinh', rows);
      }
      useToastStore.getState().addToast(`Đã xuất file ${format.toUpperCase()} thành công!`, 'success');
    } catch (err) {
      useToastStore.getState().addToast('Lỗi khi xuất báo cáo! Vui lòng thử lại.', 'error');
      console.error('[DesktopReports] export failed:', err);
    }
  };

  return (
    <DesktopAppShell width="full">
      {/* Modals */}
      <PrintReportModal isOpen={isPrintModalOpen} onClose={() => setIsPrintModalOpen(false)} initialReportType={printReportType} />
      <ExcelImportModal isOpen={isExcelModalOpen} onClose={() => setIsExcelModalOpen(false)} />
      <BackupRestoreModal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} />

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
        {isOfficialLoading && <div className="mb-3 rounded-lg border border-parish-info/30 bg-parish-info-bg p-3 text-xs font-semibold text-parish-info">Đang tải dữ liệu báo cáo chính thức từ máy chủ…</div>}
        {officialError && <div className="mb-3 rounded-lg border border-parish-danger/30 bg-parish-danger-bg p-3 text-xs font-semibold text-parish-danger">{officialError}. Không dùng dữ liệu cục bộ thay thế.</div>}
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
                <th className="py-2.5 px-3" scope="col">Xuất Sắc</th>
                <th className="py-2.5 px-3" scope="col">Giỏi</th>
                <th className="py-2.5 px-3" scope="col">Khá</th>
                <th className="py-2.5 px-3" scope="col">TB</th>
                <th className="py-2.5 px-3" scope="col">Cần Cố Gắng</th>
              </tr>
            </thead>
            <tbody className="bg-surface-card">
              {Object.values(BRANCHES).map(b => {
                const branchCards = officialReports
                  .filter(report => report.classInfo.branchId === b.id)
                  .flatMap(report => report.reportCards);
                const labels = branchCards.map(report => report.grades.find(grade => grade.semester === selectedSemester)?.classification);
                const xs = labels.filter(label => label === 'Xuất Sắc').length;
                const g = labels.filter(label => label === 'Giỏi').length;
                const k = labels.filter(label => label === 'Khá').length;
                const tb = labels.filter(label => label === 'Trung Bình').length;
                const y = labels.filter(label => label === 'Yếu').length;
                return (
                  <tr key={b.id} className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors">
                    <td className="py-2.5 px-3 font-bold text-left">
                      <span className="badge" style={{ background: b.badgeBg, color: b.textColor }}>
                        {b.name}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-text-main">{branchCards.length}</td>
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
        {isOfficialLoading ? (
          <div className="p-8 text-center text-sm text-text-muted">Đang tải danh sách báo cáo chính thức…</div>
        ) : officialStudentCount === 0 ? (
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
                  Hiển thị {matchedStudents.length} / {officialStudentCount} học sinh{studentQuery.trim() ? ' (kết quả tìm kiếm)' : ' — nhập để tìm nhanh'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matchedStudents.map(s => {
                    const official = officialByStudentId.get(s.id)!;
                    const grade = official.report.grades.find(item => item.semester === selectedSemester);
                    return (
                      <div key={s.id} className="entity-card app-panel--interactive p-4 flex justify-between items-center min-w-0">
                        <div className="min-w-0 overflow-hidden">
                          <StudentName holyName={s.holyName} fullName={s.fullName} size="sm" />
                          <div className="text-xs text-text-muted mt-1 truncate">
                            {official.className} • ĐTB: <strong className="text-parish-primary">{grade?.gpa ?? '-'}</strong> ({grade?.classification || 'Chưa có'})
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
    </DesktopAppShell>
  );
}
