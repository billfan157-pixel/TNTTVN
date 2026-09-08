import React, { useEffect, useMemo, useState } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { useClassStore } from '../../stores/classStore';
import { useSemesterAccess } from '../../hooks/useSemesterAccess';
import { useAuth } from '../../hooks/useAuth';
import { BRANCHES } from '../../constants/branches';
import {
  Printer,
  FileText,
  Award,
  Search,
  Users,
  Download,
  FileSpreadsheet,
  Sparkles,
  Layers,
  Loader2,
} from 'lucide-react';
import type { Student } from '../../types';
import type { ReportType } from '../../utils/pdfGenerator';
import { StudentName } from '../common/StudentName';
import { PrintReportModal } from '../common/PrintReportModal';
import { SubpageHeader } from '../common/SubpageHeader';
import { Tabs, TabPanel } from '../common/ui/SelectionControls';
import { sortClassesByHierarchy } from '../../utils/classSort';
import {
  buildBranchSummaryRows,
  buildStudentDetailRows,
  exportCsv,
  exportXlsx,
  exportFilename,
} from '../../services/reportExporter';

interface MobileReportsViewProps {
  onPrintReport: (student: Student) => void;
}

const REPORT_PAGE_SIZE = 30;
type ReportsSubTab = 'print' | 'analytics' | 'export';

const triggerHaptic = (ms = 8) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch {}
  }
};

interface GradeDistributionBarProps {
  excellent: number;
  good: number;
  fair: number;
  average: number;
  weak: number;
  total: number;
}

const GradeDistributionBar: React.FC<GradeDistributionBarProps> = ({
  excellent,
  good,
  fair,
  average,
  weak,
  total,
}) => {
  if (total === 0) {
    return (
      <div
        className="w-full h-2.5 rounded-full bg-surface-border/40 overflow-hidden mt-2"
        role="progressbar"
        aria-label="Chưa có học sinh trong phân ngành"
        aria-valuenow={0}
      >
        <div className="h-full w-full bg-surface-border/20" />
      </div>
    );
  }

  const pEx = (excellent / total) * 100;
  const pGood = (good / total) * 100;
  const pFair = (fair / total) * 100;
  const pAvg = (average / total) * 100;
  const pWeak = (weak / total) * 100;

  return (
    <div className="w-full flex flex-col gap-1 mt-2">
      <div
        className="w-full h-2.5 rounded-full bg-surface-border/40 overflow-hidden flex"
        role="progressbar"
        aria-label={`Phân bổ học lực: Xuất Sắc ${excellent}, Giỏi ${good}, Khá ${fair}, Trung Bình ${average}, Cần Cố Gắng ${weak}`}
      >
        {pEx > 0 && <div style={{ width: `${pEx}%` }} className="h-full bg-emerald-500 transition-[width] duration-500" title={`Xuất Sắc: ${excellent} em (${pEx.toFixed(1)}%)`} />}
        {pGood > 0 && <div style={{ width: `${pGood}%` }} className="h-full bg-sky-500 transition-[width] duration-500" title={`Giỏi: ${good} em (${pGood.toFixed(1)}%)`} />}
        {pFair > 0 && <div style={{ width: `${pFair}%` }} className="h-full bg-amber-500 transition-[width] duration-500" title={`Khá: ${fair} em (${pFair.toFixed(1)}%)`} />}
        {pAvg > 0 && <div style={{ width: `${pAvg}%` }} className="h-full bg-slate-400 dark:bg-slate-600 transition-[width] duration-500" title={`Trung Bình: ${average} em (${pAvg.toFixed(1)}%)`} />}
        {pWeak > 0 && <div style={{ width: `${pWeak}%` }} className="h-full bg-rose-500 transition-[width] duration-500" title={`Cần Cố Gắng: ${weak} em (${pWeak.toFixed(1)}%)`} />}
      </div>
      <div className="flex items-center justify-between text-2xs text-text-muted font-medium px-0.5">
        <span className="text-emerald-700 dark:text-emerald-400 font-bold">XS+Giỏi: {Math.round(pEx + pGood)}%</span>
        <span className="text-amber-700 dark:text-amber-400 font-bold">Khá: {Math.round(pFair)}%</span>
        <span className="text-text-muted">TB: {Math.round(pAvg)}%</span>
        <span className="text-rose-700 dark:text-rose-400 font-bold">Yếu: {Math.round(pWeak)}%</span>
      </div>
    </div>
  );
};

export const MobileReportsView: React.FC<MobileReportsViewProps> = ({ onPrintReport }) => {
  const { can } = useAuth();
  const canPrint = can('admin', 'chunhiem', 'phuta');
  const students = useStudentStore(s => s.students);
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg);
  const rawClassList = useClassStore(s => s.getClassList)();
  const classList = useMemo(() => sortClassesByHierarchy(rawClassList, 'asc'), [rawClassList]);
  const findClassById = useClassStore(s => s.findClassById);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester);
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess();

  const [activeTab, setActiveTab] = useState<ReportsSubTab>('print');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(REPORT_PAGE_SIZE);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printReportType, setPrintReportType] = useState<ReportType | undefined>(undefined);

  const classStudents = useMemo(() => {
    return selectedClassId === 'all'
      ? students.filter(s => !s.deletedAt)
      : students.filter(s => !s.deletedAt && s.classId === selectedClassId);
  }, [students, selectedClassId]);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('vi');
    if (!normalizedQuery) return classStudents;
    return classStudents.filter(student => (
      `${student.holyName || ''} ${student.fullName} ${student.code}`
        .toLocaleLowerCase('vi')
        .includes(normalizedQuery)
    ));
  }, [searchQuery, classStudents]);

  useEffect(() => {
    setVisibleLimit(REPORT_PAGE_SIZE);
  }, [searchQuery, selectedClassId]);

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

  const parishOverallKPI = useMemo(() => {
    let totalEx = 0, totalGood = 0, totalFair = 0, totalAvg = 0, totalWeak = 0;
    branchStats.forEach(b => {
      totalEx += b.excellent;
      totalGood += b.good;
      totalFair += b.fair;
      totalAvg += b.average;
      totalWeak += b.weak;
    });
    const totalCount = students.length || 1;
    const goodOrAboveRate = Math.round(((totalEx + totalGood) / totalCount) * 100);
    return { totalEx, totalGood, totalFair, totalAvg, totalWeak, goodOrAboveRate };
  }, [branchStats, students.length]);

  const handleExport = async (kind: 'branch' | 'students', format: 'csv' | 'xlsx') => {
    const exportKey = `${kind}-${format}`;
    setIsExporting(exportKey);
    triggerHaptic(12);
    try {
      if (kind === 'branch') {
        const rows = buildBranchSummaryRows(selectedSemester);
        const filename = exportFilename('BaoCao_ThongKe_PhanNganh_HK' + selectedSemester);
        if (format === 'csv') exportCsv(filename, rows);
        else await exportXlsx(filename, 'Thống kê phân ngành', rows);
      } else {
        const rows = buildStudentDetailRows();
        const filename = exportFilename('BaoCao_ChiTiet_HocSinh');
        if (format === 'csv') exportCsv(filename, rows);
        else await exportXlsx(filename, 'Chi tiết học sinh', rows);
      }
      setExportMessage(`Đã xuất file ${format.toUpperCase()} thành công!`);
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err) {
      console.error('[MobileReportsView] export failed:', err);
      setExportMessage('Lỗi khi xuất báo cáo. Vui lòng thử lại.');
      setTimeout(() => setExportMessage(null), 4000);
    } finally {
      setIsExporting(null);
    }
  };

  const renderSemesterActions = () => {
    if (semesterRestricted) {
      return (
        <span className="subpage-header__btn subpage-header__btn--secondary font-bold text-xs shrink-0 pointer-events-none">
          HK {openSemester === 2 ? 'II' : 'I'}
        </span>
      );
    }
    return (
      <div className="subpage-header__seg-control" role="group" aria-label="Chọn học kỳ báo cáo">
        <button
          type="button"
          onClick={() => {
            triggerHaptic(8);
            setSelectedSemester(1);
          }}
          className={`subpage-header__seg-btn ${selectedSemester === 1 ? 'is-active' : ''}`}
          aria-pressed={selectedSemester === 1}
          aria-label="Học Kỳ I"
        >
          HK I
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHaptic(8);
            setSelectedSemester(2);
          }}
          className={`subpage-header__seg-btn ${selectedSemester === 2 ? 'is-active' : ''}`}
          aria-pressed={selectedSemester === 2}
          aria-label="Học Kỳ II"
        >
          HK II
        </button>
      </div>
    );
  };

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* Function Sub-Tabs */}
      <Tabs
        id="mobile-reports-tabs"
        ariaLabel="Chức năng báo cáo và thống kê"
        value={activeTab}
        onValueChange={(val) => {
          triggerHaptic(8);
          setActiveTab(val);
        }}
        items={[
          { value: 'print', label: 'In Phiếu', icon: <FileText size={14} /> },
          { value: 'analytics', label: 'Thống Kê', icon: <Award size={14} /> },
          { value: 'export', label: 'Xuất File', icon: <Download size={14} /> },
        ]}
      />

      {/* Tab 1: In Phiếu Điểm & Sổ Điểm */}
      <TabPanel tabsId="mobile-reports-tabs" value="print" activeValue={activeTab}>
        <div className="product-view flex flex-col gap-3 pb-8">
          <SubpageHeader
            icon={<Printer size={16} />}
            title="In Phiếu Điểm & Sổ Điểm"
            meta={<span className="truncate">Học Kỳ {selectedSemester} · {students.length} em</span>}
            actions={renderSemesterActions()}
          />
          <div className="app-panel p-4 flex flex-col gap-3">
          {/* Quick Print Actions */}
          {canPrint && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(10);
                  setPrintReportType('CLASS_GRADEBOOK');
                  setIsPrintModalOpen(true);
                }}
                className="btn btn-primary mobile-btn flex-1 min-h-[44px] text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl shadow-xs active:scale-[0.98] transition-transform"
              >
                <Printer size={15} /> In Sổ Điểm Lớp
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(10);
                  setPrintReportType('BATCH_STUDENT_REPORT_CARDS');
                  setIsPrintModalOpen(true);
                }}
                className="btn btn-secondary mobile-btn flex-1 min-h-[44px] text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl shadow-xs active:scale-[0.98] transition-transform"
              >
                <Layers size={15} /> In Hàng Loạt
              </button>
            </div>
          )}

          {/* Class Filter & Count */}
          <div className="flex flex-col gap-2 pt-1 border-t border-surface-border">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-parish-primary m-0 flex items-center gap-2">
                <FileText size={16} className="text-parish-secondary" />
                Danh Sách In Kết Quả
              </h3>
              <span className="text-xs font-bold text-text-muted bg-surface-hover px-2 py-0.5 rounded-lg border border-surface-border tabular-nums">
                {filteredStudents.length}/{classStudents.length} em
              </span>
            </div>

            <select
              value={selectedClassId}
              onChange={event => {
                triggerHaptic(8);
                setSelectedClassId(event.target.value);
              }}
              className="form-select w-full min-h-[44px] py-1 pl-3 pr-8 rounded-xl text-xs font-bold"
              aria-label="Chọn lớp để in kết quả"
            >
              <option value="all">Tất cả các lớp ({students.length} em)</option>
              {classList.map(c => {
                const count = students.filter(s => !s.deletedAt && s.classId === c.id).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count} em)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              inputMode="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className="form-input w-full pl-9 pr-8 min-h-[44px] rounded-xl text-xs font-medium"
              placeholder="Tìm tên thánh, họ tên hoặc mã..."
              aria-label="Tìm học sinh để in kết quả"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(6);
                  setSearchQuery('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-1 text-xs font-bold"
                aria-label="Xóa nội dung tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {filteredStudents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border bg-surface-app p-6 text-center text-text-muted">
                <Users size={28} className="mx-auto mb-2 opacity-50" />
                <p className="m-0 text-sm font-bold">Không tìm thấy học sinh phù hợp</p>
                <button
                  type="button"
                  className="btn btn-secondary mobile-btn mt-3 min-h-[44px] text-xs font-bold"
                  onClick={() => {
                    triggerHaptic(8);
                    setSearchQuery('');
                    setSelectedClassId('all');
                  }}
                >
                  Xóa tìm kiếm
                </button>
              </div>
            ) : visibleStudents.map(s => {
              const avg = calculateStudentAvg(s.id, selectedSemester);
              const cls = findClassById(s.classId);
              return (
                <div key={s.id} className="entity-card p-3 flex justify-between items-center rounded-xl border border-surface-border bg-surface-card shadow-xs">
                  <div className="min-w-0 pr-2">
                    <StudentName holyName={s.holyName} fullName={s.fullName} size="sm" />
                    <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {cls?.name && <span className="font-semibold text-text-secondary">{cls.name}</span>}
                      <span>•</span>
                      <span>ĐTB: <strong className="text-parish-primary tabular-nums">{avg.score ?? '-'}</strong></span>
                      <span>•</span>
                      <span>Xếp loại: <span className="font-bold text-text-main">{avg.label}</span></span>
                    </div>
                  </div>
                  {canPrint && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(8);
                        onPrintReport(s);
                      }}
                      className="btn btn-secondary mobile-btn shrink-0 min-h-[44px] px-3.5 flex items-center gap-1.5 font-bold text-xs rounded-xl shadow-xs active:scale-[0.98] transition-transform"
                      aria-label={`In kết quả học tập cho ${s.holyName ? `${s.holyName} ` : ''}${s.fullName}`}
                    >
                      <Printer size={15} /> In
                    </button>
                  )}
                </div>
              );
            })}

            {visibleStudents.length < filteredStudents.length && (
              <button
                type="button"
                className="btn btn-secondary mobile-btn w-full mt-2 min-h-[44px] text-xs font-bold rounded-xl"
                onClick={() => {
                  triggerHaptic(8);
                  setVisibleLimit(limit => limit + REPORT_PAGE_SIZE);
                }}
              >
                Xem thêm {Math.min(REPORT_PAGE_SIZE, filteredStudents.length - visibleStudents.length)} em
              </button>
            )}
          </div>
          </div>
        </div>
      </TabPanel>

      {/* Tab 2: Thống Kê Phân Ngành */}
      <TabPanel tabsId="mobile-reports-tabs" value="analytics" activeValue={activeTab}>
        <div className="product-view flex flex-col gap-3 pb-8">
          <SubpageHeader
            icon={<Award size={16} />}
            title="Thống Kê Học Lực Phân Ngành"
            meta={<span className="truncate">4 phân ngành giáo xứ · {students.length} em</span>}
            actions={renderSemesterActions()}
          />
          {/* Overview KPI Cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-card p-3.5 rounded-xl border border-surface-border shadow-xs">
              <div className="text-xs uppercase font-extrabold text-text-muted tracking-wider">
                Tỉ Lệ Giỏi Trở Lên
              </div>
              <div className="text-2xl font-black text-parish-primary mt-1 tabular-nums">
                {parishOverallKPI.goodOrAboveRate}%
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                {parishOverallKPI.totalEx + parishOverallKPI.totalGood} / {students.length} em (HK{selectedSemester})
              </div>
            </div>
            <div className="bg-surface-card p-3.5 rounded-xl border border-surface-border shadow-xs">
              <div className="text-xs uppercase font-extrabold text-text-muted tracking-wider">
                Tổng Sĩ Số
              </div>
              <div className="text-2xl font-black text-text-main mt-1 tabular-nums">
                {students.length}
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                4 phân ngành giáo xứ
              </div>
            </div>
          </div>

          {/* Branch Breakdown */}
          <div className="app-panel p-4 flex flex-col gap-3">
            <h3 className="text-sm font-extrabold text-parish-primary m-0 flex items-center gap-2">
              <Award size={16} className="text-parish-secondary" />
              Thống Kê Chi Tiết Phân Ngành (HK{selectedSemester})
            </h3>
            <div className="flex flex-col gap-2.5">
              {branchStats.map(({ branch: b, studentCount, excellent, good, fair, average, weak }) => {
                return (
                  <div key={b.id} className="bg-surface-hover p-3.5 rounded-xl border border-surface-border flex flex-col gap-2">
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

                    <div className="grid grid-cols-5 gap-1.5 text-center text-xs mt-1">
                      {[
                        ['XS', excellent, 'bg-parish-success-bg border-parish-success/30 text-parish-success'],
                        ['Giỏi', good, 'bg-parish-info-bg border-parish-info/30 text-parish-info'],
                        ['Khá', fair, 'bg-parish-warning-bg border-parish-warning/30 text-parish-warning'],
                        ['TB', average, 'bg-surface-card border-surface-border text-text-muted'],
                        ['Yếu', weak, 'bg-parish-danger-bg border-parish-danger/30 text-parish-danger'],
                      ].map(([label, val, cls]) => (
                        <div key={String(label)} className={`rounded-lg p-2 border ${cls} flex flex-col items-center justify-center`}>
                          <span className="text-xs font-bold leading-none">{label as string}</span>
                          <span className="font-black text-sm mt-1 tabular-nums">{val as number}</span>
                        </div>
                      ))}
                    </div>

                    {/* Visual Grade Distribution Bar */}
                    <GradeDistributionBar
                      excellent={excellent}
                      good={good}
                      fair={fair}
                      average={average}
                      weak={weak}
                      total={studentCount}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </TabPanel>

      {/* Tab 3: Xuất Dữ Liệu Excel / CSV */}
      <TabPanel tabsId="mobile-reports-tabs" value="export" activeValue={activeTab}>
        <div className="product-view flex flex-col gap-3 pb-8">
          {exportMessage && (
            <div className="p-3 rounded-xl bg-parish-success-bg border border-parish-success/30 text-parish-success text-xs font-bold flex items-center gap-2">
              <Sparkles size={16} /> {exportMessage}
            </div>
          )}

          <SubpageHeader
            icon={<Download size={16} />}
            title="Xuất Báo Cáo & Dữ Liệu"
            meta={<span className="truncate">Định dạng Excel / CSV · Chuẩn UTF-8 tiếng Việt</span>}
            actions={renderSemesterActions()}
          />

          <div className="app-panel p-4 flex flex-col gap-3">

            {/* Export Card 1: Branch Summary */}
            <div className="border border-surface-border rounded-xl p-3.5 bg-surface-hover flex flex-col gap-2.5">
              <div>
                <div className="font-bold text-parish-primary text-xs">
                  1. Thống Kê Học Lực Theo Phân Ngành (Học Kỳ {selectedSemester})
                </div>
                <p className="text-xs text-text-muted mt-0.5 m-0">
                  Tổng hợp số lượng phân bổ học sinh theo các mức xếp loại của 4 phân ngành.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleExport('branch', 'csv')}
                  className="btn btn-secondary mobile-btn flex-1 min-h-[44px] text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl shadow-xs active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {isExporting === 'branch-csv' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Xuất CSV
                </button>
                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleExport('branch', 'xlsx')}
                  className="btn btn-primary mobile-btn flex-1 min-h-[44px] text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl shadow-xs active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {isExporting === 'branch-xlsx' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileSpreadsheet size={14} />
                  )}
                  Xuất Excel
                </button>
              </div>
            </div>

            {/* Export Card 2: Student Details */}
            <div className="border border-surface-border rounded-xl p-3.5 bg-surface-hover flex flex-col gap-2.5">
              <div>
                <div className="font-bold text-parish-primary text-xs">
                  2. Chi Tiết Từng Học Sinh (Toàn Xứ Đoàn)
                </div>
                <p className="text-xs text-text-muted mt-0.5 m-0">
                  Bảng điểm chi tiết HK1, HK2, ĐTB cả năm, Xếp loại học lực và tỉ lệ Chuyên cần.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleExport('students', 'csv')}
                  className="btn btn-secondary mobile-btn flex-1 min-h-[44px] text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl shadow-xs active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {isExporting === 'students-csv' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Xuất CSV
                </button>
                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleExport('students', 'xlsx')}
                  className="btn btn-primary mobile-btn flex-1 min-h-[44px] text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl shadow-xs active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {isExporting === 'students-xlsx' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileSpreadsheet size={14} />
                  )}
                  Xuất Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      {/* Print Report Modal */}
      <PrintReportModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        initialReportType={printReportType}
        initialClassId={selectedClassId !== 'all' ? selectedClassId : undefined}
      />
    </div>
  );
};
