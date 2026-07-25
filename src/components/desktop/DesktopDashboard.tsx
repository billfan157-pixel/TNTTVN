import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useNoticeStore } from '../../stores/noticeStore';
import { useFilterStore } from '../../stores/filterStore';
import { calculateGradeAverage } from '../../utils/grades';
import { BRANCHES } from '../../constants/branches';
import { useClassStore } from '../../stores/classStore';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import {
  Users, Award, CheckCircle2, BookOpen,
  TrendingUp, Sparkles, AlertCircle, Plus
} from 'lucide-react';

interface DesktopDashboardProps {
  onOpenAddStudent: () => void;
}

export const DesktopDashboard: React.FC<DesktopDashboardProps> = ({ onOpenAddStudent }) => {
  const students = useStudentStore(s => s.students);
  const attendance = useAttendanceStore(s => s.attendance);
  const grades = useGradeStore(s => s.grades);
  const notices = useNoticeStore(s => s.notices);
  const selectedSemester = useFilterStore(s => s.selectedSemester);

  const { totalStudents, activeStudents, overallAttendanceRate, xuatSacCount, gioiCount, khaCount, yeuCount, topStudents } = React.useMemo(() => {
    const total = students.length;
    const active = students.filter(s => s.status === 'Đang học').length;

    // Tính tỷ lệ chuyên cần tổng thể
    let totalAttendanceRecords = 0;
    let presentRecords = 0;
    attendance.forEach(rec => {
      totalAttendanceRecords++;
      if (rec.status === 'Present') presentRecords++;
    });
    const attendanceRate = totalAttendanceRecords > 0 ? Math.round((presentRecords / totalAttendanceRecords) * 100) : 100;

    // Thống kê loại học lực & Top học sinh
    let xuatSac = 0, gioi = 0, kha = 0, yeu = 0;
    const studentAverages: { student: typeof students[0]; avg: number; label: string }[] = [];

    students.forEach(student => {
      const studentGrades = grades.filter(g => g.studentId === student.id && g.semester === selectedSemester);
      if (studentGrades.length > 0) {
        const avgResult = calculateGradeAverage(studentGrades[0]);
        if (avgResult.score !== null) {
          studentAverages.push({ student, avg: avgResult.score, label: avgResult.label });
          if (avgResult.label === 'Xuất sắc') xuatSac++;
          else if (avgResult.label === 'Giỏi') gioi++;
          else if (avgResult.label === 'Khá') kha++;
          else if (avgResult.label === 'Yếu') yeu++;
        }
      }
    });

    studentAverages.sort((a, b) => b.avg - a.avg);

    return {
      totalStudents: total,
      activeStudents: active,
      overallAttendanceRate: attendanceRate,
      xuatSacCount: xuatSac,
      gioiCount: gioi,
      khaCount: kha,
      yeuCount: yeu,
      topStudents: studentAverages.slice(0, 5)
    };
  }, [students, attendance, grades, selectedSemester]);

  return (
    <div className="space-y-6">
      {/* Top Banner Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase m-0">Tổng Thiếu Nhi</p>
            <h3 className="text-2xl font-black text-text-main m-0 mt-0.5">{totalStudents} <span className="text-xs font-normal text-text-muted">em</span></h3>
            <p className="text-[11px] font-medium text-emerald-600 m-0 mt-1">Đang học: {activeStudents} em</p>
          </div>
        </div>

        {/* Attendance Rate */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase m-0">Tỷ Lệ Chuyên Cần</p>
            <h3 className="text-2xl font-black text-text-main m-0 mt-0.5">{overallAttendanceRate}%</h3>
            <p className="text-[11px] font-medium text-text-muted m-0 mt-1">Tính trên tất cả các buổi Lễ & Lớp</p>
          </div>
        </div>

        {/* Academic Excellent */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
            <Award size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase m-0">Học Sinh Xuất Sắc/Giỏi</p>
            <h3 className="text-2xl font-black text-text-main m-0 mt-0.5">{xuatSacCount + gioiCount} <span className="text-xs font-normal text-text-muted">em</span></h3>
            <p className="text-[11px] font-medium text-amber-600 m-0 mt-1">HK {selectedSemester} • Niên học {useAcademicYearStore.getState().currentYear}</p>
          </div>
        </div>

        {/* Class Overview */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase m-0">Lớp Học Giáo Lý</p>
            <h3 className="text-2xl font-black text-text-main m-0 mt-0.5">{useClassStore.getState().getClassList().length} <span className="text-xs font-normal text-text-muted">lớp</span></h3>
            <p className="text-[11px] font-medium text-blue-600 m-0 mt-1">5 Ngành TNTT</p>
          </div>
          <button
            onClick={onOpenAddStudent}
            className="w-10 h-10 rounded-xl bg-parish-primary hover:bg-parish-primary-hover text-white flex items-center justify-center transition-colors shadow-sm"
            title="Thêm Thiếu Nhi Mới"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Main Grid: Top Students & Branch Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Top Academic Performers */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="text-amber-500" size={20} />
                <h3 className="text-base font-bold text-text-main m-0">Top 5 Thiếu Nhi Tiêu Biểu (HK {selectedSemester})</h3>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700">Tuyên Dương</span>
            </div>

            {topStudents.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">
                Chưa có dữ liệu điểm HK {selectedSemester}
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {topStudents.map((item, idx) => (
                  <div key={item.student.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        idx === 0 ? 'bg-amber-500 text-white' :
                        idx === 1 ? 'bg-slate-300 text-slate-800' :
                        idx === 2 ? 'bg-amber-700 text-white' : 'bg-surface-hover text-text-muted'
                      }`}>
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-blue-600">{item.student.holyName}</span>
                          <span className="text-sm font-bold text-text-main">{item.student.fullName}</span>
                        </div>
                        <p className="text-xs text-text-muted m-0">Mã: {item.student.code} • Lớp: {item.student.classId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-emerald-600">{item.avg.toFixed(1)}</span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-600">{item.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Academic Rank Distribution */}
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 shadow-xs">
            <h3 className="text-base font-bold text-text-main mb-4 m-0 flex items-center gap-2">
              <TrendingUp className="text-blue-600" size={20} />
              Phân Phối Học Lực Học Kỳ {selectedSemester}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <div className="text-xs font-semibold text-amber-700">Xuất Sắc</div>
                <div className="text-2xl font-black text-amber-600 mt-1">{xuatSacCount}</div>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                <div className="text-xs font-semibold text-blue-700">Giỏi</div>
                <div className="text-2xl font-black text-blue-600 mt-1">{gioiCount}</div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <div className="text-xs font-semibold text-emerald-700">Khá</div>
                <div className="text-2xl font-black text-emerald-600 mt-1">{khaCount}</div>
              </div>
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                <div className="text-xs font-semibold text-rose-700">Cần Cố Gắng</div>
                <div className="text-2xl font-black text-rose-600 mt-1">{yeuCount}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Branch Stats & Recent Notices */}
        <div className="space-y-6">
          {/* Branch Distribution */}
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 shadow-xs">
            <h3 className="text-base font-bold text-text-main mb-4 m-0 flex items-center gap-2">
              <BookOpen className="text-parish-primary" size={20} />
              Số Lượng Theo Ngành TNTT
            </h3>

            <div className="space-y-3">
              {Object.values(BRANCHES).map((branchItem) => {
                const count = students.filter(s => s.branch === branchItem.id).length;
                const percentage = totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;
                return (
                  <div key={branchItem.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span style={{ color: branchItem.scarfColor }}>{branchItem.name}</span>
                      <span className="text-text-muted">{count} em ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: branchItem.scarfColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Parish Notices */}
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-text-main m-0 flex items-center gap-2">
                <AlertCircle className="text-rose-500" size={20} />
                Thông Báo Giáo Xứ
              </h3>
            </div>

            <div className="space-y-3">
              {notices.slice(0, 3).map(notice => {
                const priorityBadge =
                  notice.priority === 'urgent' ? { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5', label: 'Khẩn' } :
                  notice.priority === 'important' ? { bg: '#FEF3C7', text: '#D97706', border: '#FCD34D', label: 'Quan trọng' } :
                  { bg: '#DBEAFE', text: '#2563EB', border: '#93C5FD', label: 'Thường' };

                return (
                  <div key={notice.id} className="p-3 bg-surface-hover/40 border border-surface-border rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border leading-tight"
                        style={{ background: priorityBadge.bg, color: priorityBadge.text, borderColor: priorityBadge.border }}
                      >
                        {priorityBadge.label}
                      </span>
                      <span className="text-[11px] font-semibold text-text-muted">
                        {notice.date}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 leading-snug m-0">
                      {notice.title}
                    </h4>

                    <p className="text-xs text-slate-600 my-0.5 leading-relaxed">
                      {notice.content}
                    </p>

                    <div className="text-[11px] text-text-muted font-medium pt-2 border-t border-slate-200/80 flex justify-between items-center">
                      <span>Đăng bởi: <strong className="text-slate-700 font-semibold">{notice.author}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
