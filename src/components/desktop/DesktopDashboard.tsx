import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useNoticeStore } from '../../stores/noticeStore';
import { useFilterStore } from '../../stores/filterStore';
import { calculateGradeAverage } from '../../utils/grades';
import { BRANCHES, MOCK_CLASSES } from '../../data/mockParishData';
import { NotificationPrompt } from '../common/NotificationPrompt';
import {
  Users, Award, CheckCircle2, BookOpen,
  TrendingUp, Sparkles, AlertCircle, Plus
} from 'lucide-react';

const ACADEMIC_YEAR = '2025 - 2026';

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

    let present = 0;
    const records = attendance.length;
    attendance.forEach(a => { if (a.status === 'Present') present++; });
    const attRate = records > 0 ? Math.round((present / records) * 100) : 100;

    let xs = 0, g = 0, k = 0, y = 0;
    const avgs = students.map(s => {
      const grade = grades.find(item => item.studentId === s.id && item.semester === selectedSemester && item.academicYear === ACADEMIC_YEAR);
      const avg = calculateGradeAverage(grade ?? null);
      if (avg.label === 'Xuất Sắc') xs++;
      else if (avg.label === 'Giỏi') g++;
      else if (avg.label === 'Khá') k++;
      else if (avg.label === 'Trung Bình' || avg.label === 'Yếu') y++;
      return { student: s, avg };
    });

    const top = avgs
      .filter(item => item.avg.score !== null)
      .sort((a, b) => (b.avg.score || 0) - (a.avg.score || 0))
      .slice(0, 5);

    return {
      totalStudents: total,
      activeStudents: active,
      overallAttendanceRate: attRate,
      xuatSacCount: xs,
      gioiCount: g,
      khaCount: k,
      yeuCount: y,
      topStudents: top
    };
  }, [students, attendance, grades, selectedSemester]);

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-parish-primary to-blue-600 text-white rounded-2xl px-8 py-8 flex flex-wrap sm:flex-nowrap justify-between items-center gap-4 shadow-lg border border-blue-900/20 max-w-[1400px] mx-auto w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <Sparkles color="#FDE047" size={22} />
            <span className="text-sm font-extrabold tracking-wider uppercase text-yellow-300">
              BÁO CÁO GIÁO XỨ THÁNH GIA
            </span>
          </div>
          <h2 className="text-2xl font-extrabold my-1.5 text-white tracking-tight leading-snug">
            Chào mừng Quý Huynh Trưởng & Ban Giáo Lý
          </h2>
          <p className="text-sm opacity-95 m-0 leading-relaxed text-blue-50 max-w-2xl">
            Hệ thống quản lý điểm số, theo dõi chuyên cần tham dự Thánh Lễ và lớp Giáo Lý của các em thiếu nhi trong toàn xứ đoàn.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button onClick={onOpenAddStudent} className="btn btn-primary btn-lg shadow-md transition-transform hover:scale-[1.02]" style={{ background: '#FDE047', color: '#1E3A8A', fontWeight: 800 }}>
            <Plus size={20} /> Thêm Thiếu Nhi
          </button>
        </div>
      </div>

      <NotificationPrompt />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-surface-border shadow-card flex flex-col items-center text-center gap-3">
          <div className="flex items-center gap-2 w-full justify-center">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
              <Users size={16} color="#1D4ED8" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Tổng Số Thiếu Nhi</span>
          </div>
          <div className="text-4xl font-extrabold text-text-main leading-none">{totalStudents}</div>
          <div className="text-[11px] text-parish-success font-bold">
            {activeStudents} em đang học chính thức
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-surface-border shadow-card flex flex-col items-center text-center gap-3">
          <div className="flex items-center gap-2 w-full justify-center">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
              <CheckCircle2 size={16} color="#15803D" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Tỷ Lệ Chuyên Cần</span>
          </div>
          <div className="text-4xl font-extrabold text-text-main leading-none">{overallAttendanceRate}%</div>
          <div className="text-[11px] text-text-muted font-medium">
            Lễ Chủ Nhật & Giờ Giáo Lý
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-surface-border shadow-card flex flex-col items-center text-center gap-3">
          <div className="flex items-center gap-2 w-full justify-center">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 border border-amber-100">
              <Award size={16} color="#D97706" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Thiếu Nhi Giỏi / Xuất Sắc</span>
          </div>
          <div className="text-4xl font-extrabold text-text-main leading-none">{xuatSacCount + gioiCount}</div>
          <div className="text-[11px] text-parish-secondary font-bold truncate w-full px-1" title={`${xuatSacCount} XS • ${gioiCount} Giỏi • ${khaCount} Khá • ${yeuCount} TB/Yếu`}>
            {xuatSacCount} XS • {gioiCount} Giỏi • {khaCount} Khá • {yeuCount} TB/Yếu
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-surface-border shadow-card flex flex-col items-center text-center gap-3">
          <div className="flex items-center gap-2 w-full justify-center">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 border border-purple-100">
              <BookOpen size={16} color="#7E22CE" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Tổng Số Lớp Giáo Lý</span>
          </div>
          <div className="text-4xl font-extrabold text-text-main leading-none">{MOCK_CLASSES.length}</div>
          <div className="text-[11px] text-text-muted font-medium">
            5 Phân Ngành TNTT
          </div>
        </div>
      </div>

      {/* Branch Scarf Cards */}
      <div>
        <h3 className="text-base font-extrabold text-parish-primary mb-4 flex items-center gap-2 h-6">
          Phân Bố Thiếu Nhi Theo Ngành TNTT
        </h3>
        <div className="grid grid-cols-5 gap-4">
          {Object.values(BRANCHES).map(b => {
            const count = students.filter(s => s.branch === b.id).length;
            return (
              <div
                key={b.id}
                className="bg-white rounded-2xl p-5 pl-6 border border-surface-border shadow-card relative flex flex-col gap-3 overflow-hidden transition-all hover:shadow-card-hover hover:-translate-y-0.5"
                style={{ borderLeft: `5px solid ${b.scarfColor}` }}
              >
                <div>
                  <span
                    className="inline-block text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full mb-1.5 leading-tight"
                    style={{ background: b.badgeBg || '#F1F5F9', color: b.textColor }}
                  >
                    {b.ageRange}
                  </span>
                  <div className="text-[13px] font-extrabold leading-snug" style={{ color: b.textColor }}>
                    Ngành {b.name}
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900 leading-none">{count}</span>
                  <span className="text-xs font-bold text-slate-500">em</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Column: Top Students + Notices */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-stretch">
        {/* Left Box: Top 5 */}
        <div className="bg-white rounded-2xl p-6 border border-surface-border shadow-card flex flex-col">
          <div>
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-surface-border">
              <h3 className="text-base font-extrabold text-parish-primary m-0 flex items-center gap-2 h-6">
                <TrendingUp size={20} className="text-parish-primary" /> Top 5 Thiếu Nhi Xuất Sắc (Học Kỳ {selectedSemester})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <colgroup>
                  <col style={{ width: '64px' }} />
                  <col style={{ minWidth: '200px' }} />
                  <col style={{ minWidth: '160px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '130px' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-surface-border text-left text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    <th className="py-3 px-4">Hạng</th>
                    <th className="py-3 px-4">Tên Thánh & Họ Tên</th>
                    <th className="py-3 px-4">Lớp</th>
                    <th className="py-3 px-4 text-center">ĐTB</th>
                    <th className="py-3 px-4 text-center">Xếp Loại</th>
                  </tr>
                </thead>
                <tbody>
                  {topStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-text-muted font-medium">
                        Chưa có dữ liệu điểm cho Học Kỳ này.
                      </td>
                    </tr>
                  ) : (
                    topStudents.map((item, idx) => (
                    <tr key={item.student.id} className="border-b border-surface-hover/60 hover:bg-surface-app transition-colors">
                      <td className={`py-3.5 px-4 font-extrabold text-[13px] ${idx === 0 ? 'text-amber-600' : idx === 1 ? 'text-slate-600' : 'text-slate-500'}`}>
                        #{idx + 1}
                      </td>
                      <td className="py-3.5 px-4" title={`${item.student.holyName} ${item.student.fullName}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-parish-secondary font-bold whitespace-nowrap">{item.student.holyName}</span>
                          <span className="text-text-main font-semibold truncate">{item.student.fullName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium whitespace-nowrap">
                        {MOCK_CLASSES.find(c => c.id === item.student.classId)?.name}
                      </td>
                      <td className="py-3.5 px-4 text-center font-extrabold text-parish-primary">
                        {item.avg.score}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="badge badge-success px-3 py-1">{item.avg.label}</span>
                      </td>
                    </tr>
                  )))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Box: Notices */}
        <div className="bg-white rounded-2xl p-6 border border-surface-border shadow-card flex flex-col overflow-hidden">
          <div>
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-surface-border">
              <h3 className="text-base font-extrabold text-parish-primary m-0 flex items-center gap-2 h-6">
                <AlertCircle size={20} className="text-parish-secondary" /> Thông Báo Giáo Xứ Mới Nhất
              </h3>
            </div>
            <div className="flex flex-col gap-3">
              {notices.map(notice => {
                const priorityBadge = notice.priority === 'urgent' 
                  ? { label: 'Khẩn', bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' }
                  : notice.priority === 'important'
                  ? { label: 'Thông tin', bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' }
                  : { label: 'Thông báo', bg: '#EFF6FF', text: '#1E3A8A', border: '#BFDBFE' };

                return (
                  <div 
                    key={notice.id} 
                    className="p-4 rounded-xl border border-surface-border bg-slate-50/60 flex flex-col gap-2 transition-all hover:bg-white hover:shadow-card hover:border-slate-300"
                  >
                    <div className="flex justify-between items-center gap-2">
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
