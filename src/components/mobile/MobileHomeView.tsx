import React, { useMemo } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { useNoticeStore } from '../../stores/noticeStore';
import { useClassStore } from '../../stores/classStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuth } from '../../hooks/useAuth';
import { calculateGradeAverage, calculateAttendanceRate } from '../../utils/grades';
import { BRANCHES } from '../../constants/branches';
import { 
  CheckSquare, FileSpreadsheet, UserPlus, 
  Sparkles, Bell, Users, Award, TrendingUp, ChevronRight
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { MobileLiturgicalWidget } from './MobileLiturgicalWidget';

interface MobileHomeViewProps {
  onNavigateTab: (tab: any) => void;
  onOpenAddStudent: () => void;
}

export const MobileHomeView: React.FC<MobileHomeViewProps> = ({ onNavigateTab, onOpenAddStudent }) => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const students = useStudentStore(s => s.students);
  const attendance = useAttendanceStore(s => s.attendance);
  const grades = useGradeStore(s => s.grades);
  const selectedClassId = useFilterStore(s => s.selectedClassId);
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId);
  const selectedSemester = useFilterStore(s => s.selectedSemester);
  const notices = useNoticeStore(s => s.notices);

  const stats = useMemo(() => {
    const total = students.length;
    const active = students.filter(s => s.status === 'Đang học').length;

    let presentCount = 0;
    attendance.forEach(a => {
      if (a.status === 'Present' || a.status === 'AbsentExcused') presentCount++;
    });
    const attRate = attendance.length > 0 ? calculateAttendanceRate(presentCount, attendance.length).rate : 100;

    const gradeWeights = useSettingsStore.getState().settings.gradeWeights;
    let xuatSac = 0, gioi = 0, kha = 0;
    students.forEach(s => {
      const g = grades.find(gr => gr.studentId === s.id && gr.semester === selectedSemester);
      if (g) {
        const avg = calculateGradeAverage(g, gradeWeights);
        if (avg.label === 'Xuất Sắc') xuatSac++;
        else if (avg.label === 'Giỏi') gioi++;
        else if (avg.label === 'Khá') kha++;
      }
    });

    return { total, active, attRate, xuatSac, gioi, kha };
  }, [students, attendance, grades, selectedSemester]);

  return (
    <div className="mobile-screen mobile-screen--stack pb-12 transition-all duration-300">
      {/* Welcome Hero Card */}
      <div className="bg-gradient-to-br from-parish-primary to-parish-primary-hover text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-300 border border-amber-300/30">
            <Sparkles size={14} />
          </span>
          <span className="text-[11px] font-black uppercase tracking-widest text-amber-300">
            Giáo Xứ Gia Tôn
          </span>
        </div>
        <h2 className="text-xl font-black m-0 tracking-tight text-white">
          Thiếu Nhi Thánh Thể
        </h2>
        <p className="text-xs text-white/90 mt-1 m-0 font-medium leading-relaxed">
          Sổ tay Giáo lý di động cho Huynh Trưởng & Giáo Lý Viên.
        </p>
      </div>

      {/* Liturgical Day Card */}
      <MobileLiturgicalWidget onOpenCalendar={() => navigate({ to: '/calendar' })} />

      {/* Quick Actions Grid */}
      <div>
        <div className="text-xs font-black text-text-main uppercase tracking-wider mb-2.5 px-1">
          Thao Tác Nhanh
        </div>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onNavigateTab('attendance')}
            className="bg-surface-card border border-surface-border rounded-2xl p-3.5 flex flex-col items-center gap-2 shadow-card hover:border-parish-primary/50 hover:shadow-md transition-all active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-inner">
              <CheckSquare size={20} />
            </div>
            <span className="text-xs font-extrabold text-text-main">Điểm Danh</span>
          </button>

          <button
            onClick={() => onNavigateTab('grades')}
            className="bg-surface-card border border-surface-border rounded-2xl p-3.5 flex flex-col items-center gap-2 shadow-card hover:border-parish-primary/50 hover:shadow-md transition-all active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center border border-parish-primary/10 shadow-inner">
              <FileSpreadsheet size={20} />
            </div>
            <span className="text-xs font-extrabold text-text-main">Bảng Điểm</span>
          </button>

          <button
            onClick={onOpenAddStudent}
            className="bg-surface-card border border-surface-border rounded-2xl p-3.5 flex flex-col items-center gap-2 shadow-card hover:border-parish-primary/50 hover:shadow-md transition-all active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shadow-inner">
              <UserPlus size={20} />
            </div>
            <span className="text-xs font-extrabold text-text-main">Thêm Em</span>
          </button>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 shadow-card">
          <div className="flex items-center gap-2 text-text-secondary text-xs font-bold mb-1">
            <Users size={14} className="text-parish-primary" />
            Tổng Thiếu Nhi
          </div>
          <div className="text-2xl font-black text-text-main">
            {stats.total} <span className="text-xs font-normal text-text-secondary">em</span>
          </div>
          <div className="text-[10px] font-bold text-emerald-600 mt-1">
            ● Đang học: {stats.active} em
          </div>
        </div>

        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 shadow-card">
          <div className="flex items-center gap-2 text-text-secondary text-xs font-bold mb-1">
            <TrendingUp size={14} className="text-emerald-600" />
            Tỷ Lệ Chuyên Cần
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {stats.attRate}%
          </div>
          <div className="text-[10px] font-bold text-text-secondary mt-1">
            Toàn xứ đoàn niên học
          </div>
        </div>
      </div>

      {/* Academic Excellence Summary */}
      <div className="bg-surface-card border border-surface-border rounded-2xl p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-amber-500" />
            <span className="text-xs font-black text-text-main uppercase">Học Lực HK {selectedSemester}</span>
          </div>
          <button 
            onClick={() => onNavigateTab('grades')}
            className="text-[11px] font-bold text-parish-primary flex items-center gap-0.5"
          >
            Chi tiết <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-amber-50 border border-amber-200/60 rounded-xl py-2 px-1">
            <div className="text-[10px] font-black text-amber-800 uppercase">Xuất Sắc</div>
            <div className="text-base font-black text-amber-600 mt-0.5">{stats.xuatSac}</div>
          </div>
          <div className="bg-sky-50 border border-sky-200/60 rounded-xl py-2 px-1">
            <div className="text-[10px] font-black text-sky-800 uppercase">Giỏi</div>
            <div className="text-base font-black text-sky-600 mt-0.5">{stats.gioi}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl py-2 px-1">
            <div className="text-[10px] font-black text-emerald-800 uppercase">Khá</div>
            <div className="text-base font-black text-emerald-600 mt-0.5">{stats.kha}</div>
          </div>
        </div>
      </div>

      {/* Parish Notices */}
      <div className="bg-surface-card border border-surface-border rounded-2xl p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-rose-500" />
            <span className="text-xs font-black text-text-main uppercase">Thông Báo Giáo Xứ</span>
          </div>
          <button
            onClick={() => onNavigateTab('notices')}
            className="text-[11px] font-bold text-parish-primary flex items-center gap-0.5"
          >
            Tất cả <ChevronRight size={14} />
          </button>
        </div>

        <div className="space-y-2.5">
          {notices.slice(0, 2).map(n => (
            <div key={n.id} className="p-2.5 bg-surface-hover border border-surface-border rounded-xl space-y-1">
              <div className="text-xs font-black text-text-main line-clamp-1">{n.title}</div>
              <p className="text-[11px] text-text-secondary m-0 line-clamp-2 leading-relaxed">
                {n.content}
              </p>
            </div>
          ))}
          {notices.length === 0 && (
            <div className="text-center py-4 text-xs text-text-muted">Không có thông báo mới.</div>
          )}
        </div>
      </div>
    </div>
  );
};
