import React, { useState, useMemo } from 'react'
import {
  BarChart2,
  TrendingUp,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  Calendar,
  Phone,
  Church,
  BookOpen,
  HeartHandshake,
  ArrowUpRight,
  Eye,
  ShieldAlert,
  Percent,
  ArrowDownAZ,
  ArrowDownZA,
  ArrowUpDown,
} from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useClassStore } from '../../stores/classStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useFilterStore } from '../../stores/filterStore'
import { compareStudentByClassHierarchy } from '../../utils/classSort'
import {
  calculateClassAttendanceAnalytics,
  exportAttendanceSummaryReport,
  type StudentAttendanceSummary,
  type AttendanceRangeFilter,
} from '../../services/attendanceAnalyticsService'
import { AttendanceHistoryModal } from './AttendanceHistoryModal'
import { PageHeader } from '../common/PageHeader'
import { NoResultState } from '../common/StateFeedback'
import { Badge, Button, FilterChips, SegmentedControl, Select, TextInput } from '../common/ui'
import { StudentName } from '../common/StudentName'
import { BRANCHES } from '../../constants/branches'

export const DesktopAttendanceSummary: React.FC = () => {
  const students = useStudentStore((s) => s.students)
  const attendance = useAttendanceStore((s) => s.attendance)
  const classList = useClassStore((s) => s.getClassList)()
  const findClassById = useClassStore((s) => s.findClassById)
  const selectedClassId = useFilterStore((s) => s.selectedClassId)
  const setSelectedClassId = useFilterStore((s) => s.setSelectedClassId)
  const { settings } = useSettingsStore()
  const { currentYear, getYearRange } = useAcademicYearStore()

  // State bộ lọc thời gian
  const [timeFilterType, setTimeFilterType] = useState<'year' | 'sem1' | 'sem2' | 'custom'>('year')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'excellent' | 'good' | 'warning' | 'critical'>('all')

  // Modal lịch sử chi tiết
  const [selectedStudentSummary, setSelectedStudentSummary] = useState<StudentAttendanceSummary | null>(null)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)

  // Tính khoảng ngày theo bộ lọc
  const range = useMemo<AttendanceRangeFilter>(() => {
    const yearRange = getYearRange(currentYear)
    if (timeFilterType === 'custom') {
      return {
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined,
      }
    }
    if (timeFilterType === 'sem1') {
      // HK1: từ đầu năm học (tháng 8/9) đến 31/12
      const startParts = yearRange.startDate.split('-')
      const startYear = startParts[0] || '2025'
      return {
        startDate: yearRange.startDate,
        endDate: `${startYear}-12-31`,
      }
    }
    if (timeFilterType === 'sem2') {
      // HK2: từ 01/01 đến hết năm học (tháng 6/7)
      const endParts = yearRange.endDate.split('-')
      const endYear = endParts[0] || '2026'
      return {
        startDate: `${endYear}-01-01`,
        endDate: yearRange.endDate,
      }
    }
    return yearRange
  }, [timeFilterType, customStartDate, customEndDate, currentYear, getYearRange])

  // Lọc học sinh theo lớp
  const classStudents = useMemo(() => {
    return selectedClassId === 'all'
      ? students.filter((s) => !s.deletedAt)
      : students.filter((s) => !s.deletedAt && s.classId === selectedClassId)
  }, [students, selectedClassId])

  // Trọng số phép & ngưỡng chuyên cần từ policy
  const excusedWeight = settings.attendancePolicy?.excusedWeight ?? 1.0
  const minRateThreshold = settings.attendancePolicy?.minRateForExam ?? settings.promotionPolicy?.minAttendance ?? 80

  // Chạy Analytics Engine
  const { kpis, summaries } = useMemo(() => {
    return calculateClassAttendanceAnalytics(
      classStudents,
      attendance,
      range,
      excusedWeight,
      minRateThreshold
    )
  }, [classStudents, attendance, range, excusedWeight, minRateThreshold])

  const [sortClassDirection, setSortClassDirection] = useState<'asc' | 'desc' | null>(null)

  // Lọc danh sách học sinh theo Search & Status
  const filteredSummaries = useMemo(() => {
    return summaries.filter((item) => {
      if (statusFilter !== 'all' && item.overall.status !== statusFilter) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = item.student.fullName.toLowerCase().includes(q)
        const matchCode = item.student.code.toLowerCase().includes(q)
        const matchHoly = (item.student.holyName || '').toLowerCase().includes(q)
        if (!matchName && !matchCode && !matchHoly) return false
      }
      return true
    })
  }, [summaries, statusFilter, searchQuery])

  // Sắp xếp theo cấp bậc lớp nếu được chọn
  const sortedSummaries = useMemo(() => {
    if (!sortClassDirection) return filteredSummaries
    return [...filteredSummaries].sort((a, b) =>
      compareStudentByClassHierarchy(a.student, b.student, findClassById, sortClassDirection)
    )
  }, [filteredSummaries, sortClassDirection, findClassById])

  // Xử lý xuất Excel
  const handleExportExcel = () => {
    const classObj = findClassById(selectedClassId)
    const className = classObj ? classObj.name : 'Toan_Doan'
    const rangeLabel = timeFilterType === 'sem1' ? 'HK1' : timeFilterType === 'sem2' ? 'HK2' : 'Ca_Nam'
    void exportAttendanceSummaryReport(sortedSummaries, className, rangeLabel, 'xlsx').catch(console.error)
  }

  const openStudentHistory = (sum: StudentAttendanceSummary) => {
    setSelectedStudentSummary(sum)
    setIsHistoryModalOpen(true)
  }

  const selectedClassName =
    selectedClassId === 'all' ? 'Tất cả các lớp' : findClassById(selectedClassId)?.name || 'Lớp'

  // Tính điểm SVG biểu đồ xu hướng
  const trendPoints = useMemo(() => {
    if (kpis.trendTimeline.length === 0) return []
    return kpis.trendTimeline.map((item, idx) => ({
      ...item,
      x: idx,
    }))
  }, [kpis.trendTimeline])

  return (
    <div className="product-view flex flex-col gap-6">
      {/* Modal Lịch Sử Điểm Danh */}
      <AttendanceHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        summary={selectedStudentSummary}
      />

      {/* Header & Controls Toolbar */}
      <PageHeader
        icon={<BarChart2 size={22} />}
        title="Tổng Hợp Chuyên Cần & Phân Tích Số Liệu"
        description={`Thống kê chi tiết Thánh Lễ, Giáo Lý, Chầu Thánh Thể và cảnh báo chuyên cần học sinh (${selectedClassName})`}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Chọn Lớp */}
            <Select
              aria-label="Lớp cần xem thống kê chuyên cần"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="text-sm font-bold h-10 min-w-0 w-auto sm:min-w-[170px] max-w-full"
            >
              <option value="all">Tất cả các lớp</option>
              {classList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            {/* Chọn Kỳ / Thời gian */}
            <SegmentedControl
              id="attendance-summary-range"
              ariaLabel="Khoảng thời gian thống kê"
              value={timeFilterType}
              onValueChange={setTimeFilterType}
              items={[
                { value: 'year', label: 'Cả Năm' },
                { value: 'sem1', label: 'Học Kỳ 1' },
                { value: 'sem2', label: 'Học Kỳ 2' },
                { value: 'custom', label: 'Tùy Chọn' },
              ]}
              className="max-w-full"
            />

            {/* Nút Xuất Excel */}
            <Button
              onClick={handleExportExcel}
              disabled={filteredSummaries.length === 0}
              variant="primary"
              leadingIcon={<FileSpreadsheet aria-hidden="true" size={16} />}
              className="text-xs font-bold h-10 shadow-xs"
            >
              Xuất Excel
            </Button>
          </div>
        }
      />

      {/* Khung nhập ngày tùy chọn */}
      {timeFilterType === 'custom' && (
        <div className="view-toolbar text-xs">
          <span className="font-bold text-text-secondary flex items-center gap-1">
            <Calendar size={14} /> Khoảng ngày:
          </span>
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Từ</span>
            <input
              type="date"
              aria-label="Ngày bắt đầu"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="form-input text-xs font-bold h-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Đến</span>
            <input
              type="date"
              aria-label="Ngày kết thúc"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="form-input text-xs font-bold h-8"
            />
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng thể */}
        <div className="app-panel p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">Chuyên Cần Chung</p>
              <h3 className="text-2xl font-extrabold text-text-main mt-1.5 mb-0 flex items-center gap-1.5">
                <span>{kpis.averageRate}%</span>
                <Badge tone={kpis.averageRate >= 80 ? 'success' : 'danger'}>
                  {kpis.averageRate >= 80 ? 'Đạt' : 'Cần chú ý'}
                </Badge>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-parish-primary/10 text-parish-primary flex items-center justify-center font-bold">
              <Percent size={20} />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-border flex justify-between text-xs text-text-muted">
            <span>
              Sĩ số: <strong className="text-text-main">{kpis.totalStudents}</strong> em
            </span>
            <span>
              Tổng: <strong className="text-text-main">{kpis.totalSessionsMarked}</strong> buổi
            </span>
          </div>
        </div>

        {/* Card 2: Thánh Lễ */}
        <div className="app-panel p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">Tham Dự Thánh Lễ</p>
              <h3 className="text-2xl font-extrabold text-sky-600 dark:text-sky-400 mt-1.5 mb-0">{kpis.massRate}%</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
              <Church size={20} />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-border flex justify-between text-xs text-text-muted">
            <span>Tỷ lệ tham dự Lễ</span>
            <span>
              Đã ghi: <strong className="text-text-main">{kpis.totalMassSessions}</strong> buổi
            </span>
          </div>
        </div>

        {/* Card 3: Giáo Lý */}
        <div className="app-panel p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">Học Giáo Lý</p>
              <h3 className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1.5 mb-0">{kpis.catechismRate}%</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <BookOpen size={20} />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-border flex justify-between text-xs text-text-muted">
            <span>Tỷ lệ chuyên cần Giáo lý</span>
            <span>
              Đã ghi: <strong className="text-text-main">{kpis.totalCatechismSessions}</strong> buổi
            </span>
          </div>
        </div>

        {/* Card 4: Chầu Thánh Thể */}
        <div className="app-panel p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">Chầu / Sinh Hoạt</p>
              <h3 className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-1.5 mb-0">{kpis.adorationRate}%</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <HeartHandshake size={20} />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-border flex justify-between text-xs text-text-muted">
            <span>Tỷ lệ tham dự Chầu</span>
            <span>
              Đã ghi: <strong className="text-text-main">{kpis.totalAdorationSessions}</strong> buổi
            </span>
          </div>
        </div>
      </div>

      {/* Analytics Visualization & Early Warning Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart (2 Columns on Desktop) */}
        <div className="lg:col-span-2 app-panel p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-text-main m-0 flex items-center gap-2">
                <TrendingUp size={16} className="text-parish-primary" />
                <span>Xu Hướng Chuyên Cần Theo Từng Buổi Điểm Danh</span>
              </h3>
              <p className="text-xs text-text-muted mt-0.5 m-0">
                Diễn biến tỷ lệ tham dự của 15 buổi điểm danh gần nhất
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sky-500 inline-block" /> Lễ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Giáo Lý
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> Chầu
              </span>
            </div>
          </div>

          {/* Pure SVG Line / Bar Chart */}
          <div className="w-full h-48 flex items-end">
            {trendPoints.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-text-muted text-xs">
                <Calendar size={28} className="opacity-40 mb-1" />
                <span>Chưa có dữ liệu điểm danh theo dòng thời gian</span>
              </div>
            ) : (
              <div className="w-full h-full flex items-end justify-between gap-2 pt-6 pb-2">
                {trendPoints.map((item, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip on Hover */}
                    <div className="absolute -top-10 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                      <div className="bg-surface-app text-text-main border border-surface-border text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                        {item.date} • Chung: {item.overallRate}%
                      </div>
                    </div>

                    {/* Bars Stack */}
                    <div className="w-full max-w-[28px] bg-surface-app rounded-t flex items-end gap-0.5 h-full p-0.5">
                      {item.massRate !== null && (
                        <div
                          className="flex-1 bg-sky-500 rounded-t transition-all"
                          style={{ height: `${Math.max(item.massRate, 6)}%` }}
                          title={`Thánh Lễ: ${item.massRate}%`}
                        />
                      )}
                      {item.catechismRate !== null && (
                        <div
                          className="flex-1 bg-amber-500 rounded-t transition-all"
                          style={{ height: `${Math.max(item.catechismRate, 6)}%` }}
                          title={`Giáo Lý: ${item.catechismRate}%`}
                        />
                      )}
                      {item.adorationRate !== null && (
                        <div
                          className="flex-1 bg-purple-500 rounded-t transition-all"
                          style={{ height: `${Math.max(item.adorationRate, 6)}%` }}
                          title={`Chầu: ${item.adorationRate}%`}
                        />
                      )}
                    </div>

                    {/* X-Axis Label */}
                    <span className="text-[10px] text-text-muted mt-1.5 truncate max-w-full font-medium">
                      {item.displayDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Early Warning Widget (1 Column on Desktop) */}
        <div className="app-panel p-5 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-extrabold text-parish-danger m-0 flex items-center gap-1.5">
              <ShieldAlert size={16} />
              <span>Cảnh Báo Sớm ({kpis.atRiskStudents.length})</span>
            </h3>
            <span className="text-[11px] font-bold text-text-muted">Cần liên hệ</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-56 pr-1">
            {kpis.atRiskStudents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted">
                <CheckCircle2 size={32} className="text-emerald-500 mb-2 opacity-80" />
                <p className="text-xs font-bold text-text-main m-0">Không có học sinh nguy cơ</p>
                <p className="text-[11px] text-text-muted mt-0.5 m-0">Tất cả các em đều đạt mức chuyên cần an toàn</p>
              </div>
            ) : (
              kpis.atRiskStudents.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-rose-500/5 rounded-xl border border-rose-500/20 flex flex-col gap-1.5 hover:border-rose-500/40 transition-colors"
                >
                  <div className="flex justify-between items-center gap-2">
                    <StudentName holyName={item.student.holyName} fullName={item.student.fullName} size="xs" />
                    <span className="text-[11px] font-black text-rose-600 bg-rose-500/10 px-1.5 py-0.5 rounded">
                      {item.summary.overall.rate}%
                    </span>
                  </div>

                  <div className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">
                    {item.reasons.join(' • ')}
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-rose-500/10 text-[10px]">
                    {item.student.parentPhone ? (
                      <a
                        href={`tel:${item.student.parentPhone}`}
                        className="text-parish-primary hover:underline font-bold flex items-center gap-1"
                      >
                        <Phone size={10} /> {item.student.parentPhone}
                      </a>
                    ) : (
                      <span className="text-text-muted">Chưa có SĐT PH</span>
                    )}

                    <button
                      onClick={() => openStudentHistory(item.summary)}
                      className="text-parish-primary hover:underline font-bold flex items-center gap-0.5"
                    >
                      <span>Xem lịch sử</span>
                      <ArrowUpRight size={11} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Attendance Matrix Table Section */}
      <div className="app-panel p-5 flex flex-col gap-4">
        {/* Table Filter Bar */}
        <div className="flex justify-between items-center flex-wrap gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <TextInput
              aria-label="Tìm học sinh trong thống kê chuyên cần"
              type="text"
              placeholder="Tìm theo tên hoặc mã học sinh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs font-medium h-9 w-full"
            />
          </div>

          {/* Status Filter Pills */}
          <FilterChips
            ariaLabel="Lọc theo mức chuyên cần"
            appearance="pills"
            value={statusFilter}
            onValueChange={setStatusFilter}
            items={[
              { value: 'all', label: `Tất Cả (${summaries.length})` },
              { value: 'excellent', label: `Xuất Sắc (${kpis.excellentCount})` },
              { value: 'good', label: `Đạt Chuẩn (${kpis.goodCount})` },
              { value: 'warning', label: `Cần Lưu Ý (${kpis.warningCount})` },
              { value: 'critical', label: `Nguy Cơ (${kpis.criticalCount})` },
            ]}
            className="flex-wrap text-xs font-bold"
          />

          {/* Nút Sắp Xếp Cấp Bậc Lớp */}
          <div className="flex items-center bg-surface-hover p-1 rounded-xl border border-surface-border shadow-inner gap-1">
            <button
              type="button"
              onClick={() => setSortClassDirection(prev => prev === 'asc' ? null : 'asc')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                sortClassDirection === 'asc'
                  ? 'bg-parish-primary text-text-inverse shadow-xs'
                  : 'text-text-main hover:bg-surface-card'
              }`}
              title="Sắp xếp danh sách học sinh theo lớp từ thấp đến cao (Chiên -> Ấu 1A -> Ấu 1B...)"
            >
              <ArrowDownAZ size={14} />
              <span>Lớp: Thấp → Cao</span>
            </button>
            <button
              type="button"
              onClick={() => setSortClassDirection(prev => prev === 'desc' ? null : 'desc')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                sortClassDirection === 'desc'
                  ? 'bg-parish-primary text-text-inverse shadow-xs'
                  : 'text-text-main hover:bg-surface-card'
              }`}
              title="Sắp xếp danh sách học sinh theo lớp từ cao đến thấp (Hiệp 2 -> ... -> Chiên)"
            >
              <ArrowDownZA size={14} />
              <span>Lớp: Cao → Thấp</span>
            </button>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-xs border-collapse bg-surface-card text-text-main">
            <thead>
              {/* Super Header */}
              <tr className="bg-surface-app text-text-muted uppercase text-[11px] font-extrabold border-b border-surface-border">
                <th rowSpan={2} className="p-3 text-center w-12 border-r border-surface-border" scope="col">
                  STT
                </th>
                <th rowSpan={2} className="p-3 border-r border-surface-border min-w-[200px]" scope="col">
                  Học Viên
                </th>
                <th rowSpan={2} className="p-3 border-r border-surface-border min-w-[110px]" scope="col">
                  <button
                    type="button"
                    onClick={() => setSortClassDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-1.5 hover:text-text-main transition-colors font-bold text-[11px] uppercase tracking-wider bg-transparent border-none cursor-pointer p-0 text-text-muted"
                    title="Nhấp để đảo chiều sắp xếp theo cấp bậc lớp"
                  >
                    <span>Lớp / Ngành</span>
                    <ArrowUpDown size={12} className={sortClassDirection ? 'text-parish-primary' : 'text-text-muted opacity-60'} />
                  </button>
                </th>
                <th colSpan={4} className="p-2 text-center border-r border-surface-border bg-sky-500/5 text-sky-700 dark:text-sky-400" scope="col">
                  <div className="flex items-center justify-center gap-1">
                    <Church size={13} />
                    <span>Thánh Lễ ({kpis.totalMassSessions} buổi)</span>
                  </div>
                </th>
                <th colSpan={4} className="p-2 text-center border-r border-surface-border bg-amber-500/5 text-amber-700 dark:text-amber-400" scope="col">
                  <div className="flex items-center justify-center gap-1">
                    <BookOpen size={13} />
                    <span>Giáo Lý ({kpis.totalCatechismSessions} buổi)</span>
                  </div>
                </th>
                <th colSpan={4} className="p-2 text-center border-r border-surface-border bg-purple-500/5 text-purple-700 dark:text-purple-400" scope="col">
                  <div className="flex items-center justify-center gap-1">
                    <HeartHandshake size={13} />
                    <span>Chầu ({kpis.totalAdorationSessions} buổi)</span>
                  </div>
                </th>
                <th rowSpan={2} className="p-3 text-center border-r border-surface-border min-w-[80px]" scope="col">
                  Tổng Buổi
                </th>
                <th rowSpan={2} className="p-3 text-center border-r border-surface-border min-w-[90px]" scope="col">
                  Tỷ Lệ Chung
                </th>
                <th rowSpan={2} className="p-3 text-center border-r border-surface-border min-w-[110px]" scope="col">
                  Đánh Giá
                </th>
                <th rowSpan={2} className="p-3 text-center min-w-[90px]" scope="col">
                  Thao Tác
                </th>
              </tr>
              {/* Sub Header for Sessions */}
              <tr className="bg-surface-app text-text-muted text-[10px] uppercase font-bold border-b border-surface-border">
                {/* Lễ */}
                <th className="p-2 text-center bg-sky-500/5 text-sky-700 dark:text-sky-400" scope="col">Diện</th>
                <th className="p-2 text-center bg-sky-500/5 text-sky-700 dark:text-sky-400" scope="col">Phép</th>
                <th className="p-2 text-center bg-sky-500/5 text-sky-700 dark:text-sky-400" scope="col">K.Phép</th>
                <th className="p-2 text-center bg-sky-500/5 border-r border-surface-border text-sky-700 dark:text-sky-400" scope="col">
                  %
                </th>
                {/* Giáo Lý */}
                <th className="p-2 text-center bg-amber-500/5 text-amber-700 dark:text-amber-400" scope="col">Diện</th>
                <th className="p-2 text-center bg-amber-500/5 text-amber-700 dark:text-amber-400" scope="col">Phép</th>
                <th className="p-2 text-center bg-amber-500/5 text-amber-700 dark:text-amber-400" scope="col">K.Phép</th>
                <th className="p-2 text-center bg-amber-500/5 border-r border-surface-border text-amber-700 dark:text-amber-400" scope="col">
                  %
                </th>
                {/* Chầu */}
                <th className="p-2 text-center bg-purple-500/5 text-purple-700 dark:text-purple-400" scope="col">Diện</th>
                <th className="p-2 text-center bg-purple-500/5 text-purple-700 dark:text-purple-400" scope="col">Phép</th>
                <th className="p-2 text-center bg-purple-500/5 text-purple-700 dark:text-purple-400" scope="col">K.Phép</th>
                <th className="p-2 text-center bg-purple-500/5 border-r border-surface-border text-purple-700 dark:text-purple-400" scope="col">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface-card">
              {sortedSummaries.length === 0 ? (
                <tr>
                  <td colSpan={19} className="p-8">
                    <NoResultState
                      title="Không tìm thấy học sinh nào phù hợp tiêu chí"
                      description="Thử đổi lớp, học kỳ hoặc xóa bộ lọc để xem toàn bộ."
                    />
                  </td>
                </tr>
              ) : (
                sortedSummaries.map((item, index) => {
                  const branchObj = BRANCHES[item.student.branch]
                  return (
                    <tr
                      key={item.student.id}
                      className="bg-surface-card hover:bg-surface-app transition-colors"
                    >
                      <td className="p-3 text-center text-text-muted font-semibold border-r border-surface-border">
                        {index + 1}
                      </td>

                      {/* Học viên */}
                      <td className="p-3 border-r border-surface-border">
                        <StudentName holyName={item.student.holyName} fullName={item.student.fullName} size="xs" />
                        <div className="text-[11px] text-text-muted font-mono">{item.student.code}</div>
                      </td>

                      {/* Lớp / Ngành */}
                      <td className="p-3 border-r border-surface-border">
                        <div className="font-bold text-text-main text-xs">
                          {findClassById(item.student.classId)?.name || item.student.classId}
                        </div>
                        <div className="text-[10px] text-text-muted">{branchObj?.name || item.student.branch}</div>
                      </td>

                      {/* Thánh Lễ */}
                      <td className="p-2 text-center font-bold text-emerald-600">{item.mass.present}</td>
                      <td className="p-2 text-center font-bold text-amber-600">{item.mass.excused}</td>
                      <td className="p-2 text-center font-bold text-rose-600">{item.mass.unexcused}</td>
                      <td className="p-2 text-center font-black text-sky-600 border-r border-surface-border">
                        {item.mass.total > 0 ? `${item.mass.rate}%` : '-'}
                      </td>

                      {/* Giáo Lý */}
                      <td className="p-2 text-center font-bold text-emerald-600">{item.catechism.present}</td>
                      <td className="p-2 text-center font-bold text-amber-600">{item.catechism.excused}</td>
                      <td className="p-2 text-center font-bold text-rose-600">{item.catechism.unexcused}</td>
                      <td className="p-2 text-center font-black text-amber-600 border-r border-surface-border">
                        {item.catechism.total > 0 ? `${item.catechism.rate}%` : '-'}
                      </td>

                      {/* Chầu */}
                      <td className="p-2 text-center font-bold text-emerald-600">{item.adoration.present}</td>
                      <td className="p-2 text-center font-bold text-amber-600">{item.adoration.excused}</td>
                      <td className="p-2 text-center font-bold text-rose-600">{item.adoration.unexcused}</td>
                      <td className="p-2 text-center font-black text-purple-600 border-r border-surface-border">
                        {item.adoration.total > 0 ? `${item.adoration.rate}%` : '-'}
                      </td>

                      {/* Tổng buổi */}
                      <td className="p-3 text-center font-bold text-text-main border-r border-surface-border">
                        {item.overall.totalSessions}
                      </td>

                      {/* Tỷ lệ chung */}
                      <td className="p-3 text-center border-r border-surface-border">
                        <span
                          className={`font-black text-xs px-2 py-0.5 rounded-full ${
                            item.overall.rate >= 95
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : item.overall.rate >= minRateThreshold
                              ? 'bg-sky-500/10 text-sky-600'
                              : item.overall.rate >= minRateThreshold - 10
                              ? 'bg-amber-500/10 text-amber-600'
                              : 'bg-rose-500/10 text-rose-600'
                          }`}
                        >
                          {item.overall.rate}%
                        </span>
                      </td>

                      {/* Đánh giá */}
                      <td className="p-3 text-center border-r border-surface-border font-semibold text-xs text-text-secondary">
                        {item.overall.statusLabel}
                      </td>

                      {/* Thao tác */}
                      <td className="p-3 text-center">
                        <button
                          onClick={() => openStudentHistory(item)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-parish-primary hover:bg-parish-primary/10 transition-colors inline-flex items-center gap-1"
                          title="Xem lịch sử chi tiết"
                        >
                          <Eye size={13} />
                          <span>Chi tiết</span>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
