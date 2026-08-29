import React, { useState, useMemo } from 'react'
import {
  Search,
  Church,
  BookOpen,
  HeartHandshake,
  FileSpreadsheet,
  ChevronRight,
} from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useClassStore } from '../../stores/classStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useFilterStore } from '../../stores/filterStore'
import { StudentName } from '../common/StudentName'
import {
  calculateClassAttendanceAnalytics,
  exportAttendanceSummaryReport,
  type StudentAttendanceSummary,
  type AttendanceRangeFilter,
} from '../../services/attendanceAnalyticsService'
import { AttendanceHistoryModal } from '../desktop/AttendanceHistoryModal'

export const MobileAttendanceSummaryView: React.FC = () => {
  const students = useStudentStore((s) => s.students)
  const attendance = useAttendanceStore((s) => s.attendance)
  const classList = useClassStore((s) => s.getClassList)()
  const findClassById = useClassStore((s) => s.findClassById)
  const selectedClassId = useFilterStore((s) => s.selectedClassId)
  const setSelectedClassId = useFilterStore((s) => s.setSelectedClassId)
  const { settings } = useSettingsStore()
  const { currentYear, getYearRange } = useAcademicYearStore()

  const [timeFilterType, setTimeFilterType] = useState<'year' | 'sem1' | 'sem2'>('year')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'warning'>('all')

  const [selectedStudentSummary, setSelectedStudentSummary] = useState<StudentAttendanceSummary | null>(null)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)

  const range = useMemo<AttendanceRangeFilter>(() => {
    const yearRange = getYearRange(currentYear)
    if (timeFilterType === 'sem1') {
      const startParts = yearRange.startDate.split('-')
      const startYear = startParts[0] || '2025'
      return {
        startDate: yearRange.startDate,
        endDate: `${startYear}-12-31`,
      }
    }
    if (timeFilterType === 'sem2') {
      const endParts = yearRange.endDate.split('-')
      const endYear = endParts[0] || '2026'
      return {
        startDate: `${endYear}-01-01`,
        endDate: yearRange.endDate,
      }
    }
    return yearRange
  }, [timeFilterType, currentYear, getYearRange])

  const classStudents = useMemo(() => {
    return selectedClassId === 'all'
      ? students.filter((s) => !s.deletedAt)
      : students.filter((s) => !s.deletedAt && s.classId === selectedClassId)
  }, [students, selectedClassId])

  const excusedWeight = settings.attendancePolicy?.excusedWeight ?? 1.0
  const minRateThreshold = settings.attendancePolicy?.minRateForExam ?? settings.promotionPolicy?.minAttendance ?? 80

  const { kpis, summaries } = useMemo(() => {
    return calculateClassAttendanceAnalytics(
      classStudents,
      attendance,
      range,
      excusedWeight,
      minRateThreshold
    )
  }, [classStudents, attendance, range, excusedWeight, minRateThreshold])

  const filteredSummaries = useMemo(() => {
    return summaries.filter((item) => {
      if (statusFilter === 'warning' && item.overall.status !== 'warning' && item.overall.status !== 'critical') {
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

  const handleExportExcel = () => {
    const classObj = findClassById(selectedClassId)
    const className = classObj ? classObj.name : 'Toan_Doan'
    const rangeLabel = timeFilterType === 'sem1' ? 'HK1' : timeFilterType === 'sem2' ? 'HK2' : 'Ca_Nam'
    void exportAttendanceSummaryReport(filteredSummaries, className, rangeLabel, 'xlsx').catch(console.error)
  }

  const openStudentHistory = (sum: StudentAttendanceSummary) => {
    setSelectedStudentSummary(sum)
    setIsHistoryModalOpen(true)
  }

  return (
    <div className="product-view flex flex-col gap-3 pb-8">
      {/* Modal xem lịch sử */}
      <AttendanceHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        summary={selectedStudentSummary}
      />

      {/* Filter Header */}
      <div className="mobile-filter-panel flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Lọc Lớp */}
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="form-select text-xs font-bold flex-1 min-h-[44px]"
          >
            <option value="all">Tất cả các lớp</option>
            {classList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Xuất Excel */}
          <button
            onClick={handleExportExcel}
            className="btn btn-primary text-xs font-bold mobile-btn px-3 flex items-center gap-1.5 shrink-0 shadow-xs"
          >
            <FileSpreadsheet size={14} />
            <span>Excel</span>
          </button>
        </div>

        {/* Segmented Period Tabs */}
        <div className="flex bg-surface-app p-1 rounded-xl border border-surface-border gap-1">
          <button
            onClick={() => setTimeFilterType('year')}
            className={`flex-1 min-h-[44px] py-2 text-xs font-bold rounded-lg transition-all text-center ${
              timeFilterType === 'year'
                ? 'bg-parish-primary text-white shadow-xs'
                : 'text-text-secondary hover:bg-surface-card'
            }`}
          >
            Cả Năm
          </button>
          <button
            onClick={() => setTimeFilterType('sem1')}
            className={`flex-1 min-h-[44px] py-2 text-xs font-bold rounded-lg transition-all text-center ${
              timeFilterType === 'sem1'
                ? 'bg-parish-primary text-white shadow-xs'
                : 'text-text-secondary hover:bg-surface-card'
            }`}
          >
            Học Kỳ 1
          </button>
          <button
            onClick={() => setTimeFilterType('sem2')}
            className={`flex-1 min-h-[44px] py-2 text-xs font-bold rounded-lg transition-all text-center ${
              timeFilterType === 'sem2'
                ? 'bg-parish-primary text-white shadow-xs'
                : 'text-text-secondary hover:bg-surface-card'
            }`}
          >
            Học Kỳ 2
          </button>
        </div>

        {/* Search Box */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input pl-8 text-xs font-medium min-h-[40px] w-full"
          />
        </div>
      </div>

      {/* Quick KPI Overview */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-card p-3 rounded-xl border border-surface-border shadow-xs">
          <div className="text-[10px] uppercase font-bold text-text-muted">Chuyên Cần Chung</div>
          <div className="text-xl font-black text-text-main mt-0.5">{kpis.averageRate}%</div>
          <div className="text-[10px] text-text-muted mt-1">
            {kpis.totalStudents} em • {kpis.totalSessionsMarked} buổi
          </div>
        </div>

        <div className="bg-surface-card p-3 rounded-xl border border-surface-border shadow-xs">
          <div className="text-[10px] uppercase font-bold text-text-muted">Cảnh Báo Vắng</div>
          <div
            className={`text-xl font-black mt-0.5 ${
              kpis.atRiskStudents.length > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {kpis.atRiskStudents.length} em
          </div>
          <div className="text-[10px] text-text-muted mt-1">
            {kpis.atRiskStudents.length > 0 ? 'Cần liên hệ PH' : 'Đều đạt chuẩn'}
          </div>
        </div>
      </div>

      {/* Quick Session Stats Bar */}
      <div className="bg-surface-card p-3 rounded-xl border border-surface-border shadow-xs flex items-center justify-between text-xs font-bold">
        <div className="flex items-center gap-1.5 text-sky-600">
          <Church size={14} />
          <span>Lễ: {kpis.massRate}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-600">
          <BookOpen size={14} />
          <span>Giáo lý: {kpis.catechismRate}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-purple-600">
          <HeartHandshake size={14} />
          <span>Chầu: {kpis.adorationRate}%</span>
        </div>
      </div>

      {/* Filter by status toggle */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="font-bold text-text-muted">Danh Sách Học Sinh ({filteredSummaries.length})</span>
        <button
          onClick={() => setStatusFilter((prev) => (prev === 'all' ? 'warning' : 'all'))}
          className={`px-3 min-h-[44px] flex items-center rounded-lg font-bold border transition-colors ${
            statusFilter === 'warning'
              ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
              : 'bg-surface-card text-text-secondary border-surface-border'
          }`}
        >
          {statusFilter === 'warning' ? 'Đang lọc: Cần lưu ý' : 'Lọc cần lưu ý'}
        </button>
      </div>

      {/* Student Cards List */}
      <div className="space-y-2">
        {filteredSummaries.length === 0 ? (
          <div className="p-8 text-center text-text-muted bg-surface-card rounded-2xl border border-surface-border">
            <p className="text-xs font-bold m-0">Không tìm thấy học sinh nào</p>
          </div>
        ) : (
          filteredSummaries.map((item) => (
            <div
              key={item.student.id}
              onClick={() => openStudentHistory(item)}
              className="entity-card p-3.5 active:bg-surface-hover flex flex-col gap-2.5 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <StudentName holyName={item.student.holyName} fullName={item.student.fullName} size="xs" />
                  <div className="text-[10px] text-text-muted font-mono">{item.student.code}</div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-black px-2 py-0.5 rounded-full ${
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
                  <ChevronRight size={14} className="text-text-muted" />
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-surface-app h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    item.overall.rate >= 80 ? 'bg-parish-primary' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(item.overall.rate, 100)}%` }}
                />
              </div>

              {/* Session Pills */}
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div className="p-1.5 rounded-lg bg-sky-500/5 text-sky-700 dark:text-sky-400 border border-sky-500/10 text-center">
                  <span className="font-bold">Lễ: </span>
                  <span>
                    {item.mass.present}/{item.mass.total}
                  </span>
                </div>
                <div className="p-1.5 rounded-lg bg-amber-500/5 text-amber-700 dark:text-amber-400 border border-amber-500/10 text-center">
                  <span className="font-bold">GL: </span>
                  <span>
                    {item.catechism.present}/{item.catechism.total}
                  </span>
                </div>
                <div className="p-1.5 rounded-lg bg-purple-500/5 text-purple-700 dark:text-purple-400 border border-purple-500/10 text-center">
                  <span className="font-bold">Chầu: </span>
                  <span>
                    {item.adoration.present}/{item.adoration.total}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
