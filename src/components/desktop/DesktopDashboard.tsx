import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useNoticeStore } from '../../stores/noticeStore';
import { useFilterStore } from '../../stores/filterStore';
import { calculateGradeAverage, calculateAttendanceRate } from '../../utils/grades';
import { normalizeAcademicYear } from '../../utils/academicYear';
import { BRANCHES } from '../../constants/branches';
import { useClassStore } from '../../stores/classStore';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  Users, Award, CheckCircle2,
  Sparkles, AlertCircle, Plus, School, BarChart3, PieChart
} from 'lucide-react';
import { StudentName } from '../common/StudentName';
import { useNavigate } from '@tanstack/react-router';
import { LiturgicalTodayWidget } from './LiturgicalTodayWidget';
import { formatDateVi } from '../../utils/formatDate';

interface DesktopDashboardProps {
  onOpenAddStudent: () => void;
}

export const DesktopDashboard: React.FC<DesktopDashboardProps> = ({ onOpenAddStudent }) => {
  const navigate = useNavigate()
  const classes = useClassStore(s => s.classes)
  const hasClasses = classes.length > 0;
  const students = useStudentStore(s => s.students);
  const attendance = useAttendanceStore(s => s.attendance);
  const grades = useGradeStore(s => s.grades);
  const notices = useNoticeStore(s => s.notices);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const gradeWeights = useSettingsStore(s => s.settings.gradeWeights);

  const { totalStudents, activeStudents, overallAttendanceRate, xuatSacCount, gioiCount, khaCount, yeuCount, topStudents, branchStats } = React.useMemo(() => {
    const total = students.length;
    const active = students.filter(s => s.status === 'Đang học').length;

    const activeYear = useAcademicYearStore.getState().resolveActiveYear();
    const range = useAcademicYearStore.getState().getYearRange(activeYear);
    let totalAttendanceRecords = 0;
    let presentRecords = 0;
    attendance.forEach(rec => {
      if (rec.date >= range.startDate && rec.date <= range.endDate) {
        totalAttendanceRecords++;
        if (rec.status === 'Present' || rec.status === 'AbsentExcused') presentRecords++;
      }
    });
    const attendanceRate = calculateAttendanceRate(presentRecords, totalAttendanceRecords).rate;

    let xuatSac = 0, gioi = 0, kha = 0, yeu = 0;
    const studentAverages: { student: typeof students[0]; avg: number; label: string }[] = [];

    students.forEach(student => {
      const studentGrades = grades.filter(g => g.studentId === student.id && g.semester === selectedSemester && normalizeAcademicYear(g.academicYear) === activeYear);
      if (studentGrades.length > 0) {
        const avgResult = calculateGradeAverage(studentGrades[0], gradeWeights);
        if (avgResult.score !== null) {
          studentAverages.push({ student, avg: avgResult.score, label: avgResult.label });
          if (avgResult.label === 'Xuất Sắc') xuatSac++;
          else if (avgResult.label === 'Giỏi') gioi++;
          else if (avgResult.label === 'Khá') kha++;
          else if (avgResult.label === 'Yếu') yeu++;
        }
      }
    });

    studentAverages.sort((a, b) => b.avg - a.avg);

    // Branch breakdown
    const branchMap: Record<string, number> = {};
    Object.keys(BRANCHES).forEach(bId => {
      branchMap[bId] = students.filter(s => s.branch === bId).length;
    });

    return {
      totalStudents: total,
      activeStudents: active,
      overallAttendanceRate: attendanceRate,
      xuatSacCount: xuatSac,
      gioiCount: gioi,
      khaCount: kha,
      yeuCount: yeu,
      topStudents: studentAverages.slice(0, 5),
      branchStats: branchMap
    };
  }, [students, attendance, grades, selectedSemester, gradeWeights]);

  const _maxBranchCount = Math.max(...Object.values(branchStats), 1);

  return (
    <div className="product-view space-y-6 pb-10">
      {/* Liturgical Day Widget */}
      <LiturgicalTodayWidget />

      {/* Top Banner Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="metric-card">
          <div className="metric-card__icon">
            <Users size={23} />
          </div>
          <div className="metric-card__body">
            <p className="metric-card__label">Tổng thiếu nhi</p>
            <h3 className="metric-card__value">{totalStudents} <span className="metric-card__unit">em</span></h3>
            <p className="metric-card__meta text-parish-success">
              <span className="w-1.5 h-1.5 rounded-full bg-parish-success"></span>
              Đang học: {activeStudents} em
            </p>
          </div>
        </div>

        {/* Attendance Rate */}
        <div className="metric-card metric-card--success">
          <div className="metric-card__icon">
            <CheckCircle2 size={23} />
          </div>
          <div className="metric-card__body">
            <p className="metric-card__label">Tỷ lệ chuyên cần</p>
            <h3 className="metric-card__value">{overallAttendanceRate}%</h3>
            <p className="metric-card__meta">Toàn xứ đoàn niên học</p>
          </div>
        </div>

        {/* Academic Excellent */}
        <div className="metric-card metric-card--gold">
          <div className="metric-card__icon">
            <Award size={23} />
          </div>
          <div className="metric-card__body">
            <p className="metric-card__label">Học lực khá/giỏi+</p>
            <h3 className="metric-card__value">{xuatSacCount + gioiCount + khaCount} <span className="metric-card__unit">em</span></h3>
            <p className="metric-card__meta text-parish-gold">HK {selectedSemester === 2 ? 'II' : 'I'}: {xuatSacCount} xuất sắc</p>
          </div>
        </div>

        {/* Class Overview */}
        <div className="metric-card metric-card--info justify-between">
          <div className="metric-card__body">
            <p className="metric-card__label">Lớp học giáo lý</p>
            <h3 className="metric-card__value">{classes.length} <span className="metric-card__unit">lớp</span></h3>
            <p className="metric-card__meta text-parish-primary">5 Ngành TNTT hoạt động</p>
          </div>
          {hasClasses ? (
            <button
              onClick={onOpenAddStudent}
              className="btn btn-primary btn-icon btn-lg shrink-0"
              title="Thêm thiếu nhi"
              aria-label="Thêm thiếu nhi"
            >
              <Plus size={22} />
            </button>
          ) : (
            <button
              onClick={() => navigate({ to: '/classes' })}
              className="btn btn-primary btn-sm"
            >
              <School size={16} /> Tạo Lớp
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Top Students & Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Top Academic Performers & Analytics Distribution */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top Students */}
          <div className="section-card">
            <div className="section-heading">
              <div className="section-heading__identity">
                <div className="section-heading__icon text-parish-gold bg-parish-gold-light">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="section-heading__title">Top 5 Thiếu Nhi Tiêu Biểu</h3>
                  <p className="section-heading__description">Xếp hạng học lực Học Kỳ {selectedSemester}</p>
                </div>
              </div>
              <span className="badge badge-warning">
                Bảng Vàng Xứ Đoàn
              </span>
            </div>

            {topStudents.length === 0 ? (
              <div className="text-center py-10 text-text-muted text-sm bg-surface-hover/30 rounded-xl border border-dashed border-surface-border">
                Chưa có dữ liệu điểm học tập cho Học Kỳ {selectedSemester}
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {topStudents.map((item, idx) => (
                  <div key={item.student.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0 hover:bg-surface-hover/40 px-3 rounded-xl transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shadow-sm ${
                        idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' :
                        idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900' :
                        idx === 2 ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-white' : 'bg-surface-hover text-text-muted'
                      }`}>
                        #{idx + 1}
                      </div>
                      <div>
                        <StudentName holyName={item.student.holyName} fullName={item.student.fullName} size="sm" />
                        <p className="text-xs text-text-muted m-0 mt-0.5">Mã: <span className="font-mono">{item.student.code}</span> • Lớp: <span className="font-semibold text-text-main">{item.student.classId}</span></p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-emerald-600">{item.avg.toFixed(1)}</span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 mt-0.5">{item.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Academic Rank Analytics Distribution Bar Chart */}
          <div className="section-card">
            <div className="section-heading">
              <div className="section-heading__identity">
                <div className="section-heading__icon">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h3 className="section-heading__title">Phân Phối Học Lực Xứ Đoàn</h3>
                  <p className="section-heading__description">Thống kê chi tiết kết quả Học Kỳ {selectedSemester}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center shadow-inner">
                <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Xuất Sắc</div>
                <div className="text-3xl font-black text-amber-600 mt-1.5">{xuatSacCount}</div>
                <div className="text-[11px] font-medium text-amber-700/80 mt-1">{totalStudents > 0 ? Math.round((xuatSacCount / totalStudents) * 100) : 0}% tổng số</div>
              </div>
              <div className="p-4 rounded-2xl bg-parish-primary-light border border-parish-primary/20 text-center shadow-inner">
                <div className="text-xs font-bold text-sky-800 uppercase tracking-wider">Giỏi</div>
                <div className="text-3xl font-black text-sky-600 mt-1.5">{gioiCount}</div>
                <div className="text-[11px] font-medium text-sky-700/80 mt-1">{totalStudents > 0 ? Math.round((gioiCount / totalStudents) * 100) : 0}% tổng số</div>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center shadow-inner">
                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Khá</div>
                <div className="text-3xl font-black text-emerald-600 mt-1.5">{khaCount}</div>
                <div className="text-[11px] font-medium text-emerald-700/80 mt-1">{totalStudents > 0 ? Math.round((khaCount / totalStudents) * 100) : 0}% tổng số</div>
              </div>
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center shadow-inner">
                <div className="text-xs font-bold text-rose-800 uppercase tracking-wider">Cần Cố Gắng</div>
                <div className="text-3xl font-black text-rose-600 mt-1.5">{yeuCount}</div>
                <div className="text-[11px] font-medium text-rose-700/80 mt-1">{totalStudents > 0 ? Math.round((yeuCount / totalStudents) * 100) : 0}% tổng số</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Branch Stats & Recent Notices */}
        <div className="space-y-6">
          {/* Branch Distribution */}
          <div className="section-card">
            <div className="section-heading">
              <div className="section-heading__identity">
                <div className="section-heading__icon text-parish-purple bg-parish-purple-bg">
                  <PieChart size={20} />
                </div>
                <div>
                  <h3 className="section-heading__title">Cơ Cấu Ngành TNTT</h3>
                  <p className="section-heading__description">Phân bố thiếu nhi theo phân ngành</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {Object.values(BRANCHES).map((branchItem) => {
                const count = branchStats[branchItem.id] || 0;
                const percentage = totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;
                return (
                  <div key={branchItem.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shadow-xs" style={{ backgroundColor: branchItem.scarfColor }}></span>
                        <span style={{ color: branchItem.scarfColor }} className="font-extrabold">{branchItem.name}</span>
                      </span>
                      <span className="text-text-main">{count} em <span className="text-text-muted font-normal">({percentage}%)</span></span>
                    </div>
                    <div className="w-full bg-surface-hover rounded-full h-2.5 overflow-hidden border border-surface-border">
                      <div
                        className="h-full rounded-full transition-all duration-700 shadow-sm"
                        style={{ width: `${Math.max(percentage, 3)}%`, backgroundColor: branchItem.scarfColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Parish Notices */}
          <div className="section-card">
            <div className="section-heading">
              <div className="section-heading__identity">
                <div className="section-heading__icon text-parish-danger bg-parish-danger-bg">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="section-heading__title">Thông Báo Giáo Xứ</h3>
                  <p className="section-heading__description">Cập nhật tin tức mới nhất</p>
                </div>
              </div>
            </div>

            <div className="space-y-3.5">
              {notices.slice(0, 3).map(notice => {
                const priorityBadge =
                  notice.priority === 'urgent' ? { cls: 'bg-parish-danger-bg text-parish-danger border-parish-danger-bg', label: 'Khẩn' } :
                  notice.priority === 'important' ? { cls: 'bg-parish-secondary-light text-parish-secondary border-parish-secondary-light', label: 'Quan trọng' } :
                  { cls: 'bg-surface-app text-parish-primary border-surface-border', label: 'Thường' };

                return (
                  <div key={notice.id} className="p-3.5 bg-surface-hover/50 border border-surface-border rounded-xl space-y-2 transition-all hover:border-parish-primary/30">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border leading-tight uppercase tracking-wider ${priorityBadge.cls}`}
                      >
                        {priorityBadge.label}
                      </span>
                      <span className="text-[11px] font-semibold text-text-muted">
                        {formatDateVi(notice.date)}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-text-main leading-snug m-0">
                      {notice.title}
                    </h4>

                    <p className="text-xs text-text-muted line-clamp-2 m-0">
                      {notice.content}
                    </p>
                  </div>
                );
              })}

              {notices.length === 0 && (
                <div className="text-center py-6 text-text-muted text-xs">
                  Không có thông báo mới.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
