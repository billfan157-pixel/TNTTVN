import React, { useMemo } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { useNoticeStore } from '../../stores/noticeStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { calculateGradeAverage, calculateAttendanceRate } from '../../utils/grades';
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
  const students = useStudentStore(s => s.students);
  const attendance = useAttendanceStore(s => s.attendance);
  const grades = useGradeStore(s => s.grades);
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
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* Welcome Hero Card */}
      <div className="mobile-home-hero">
        <div className="relative z-1 flex items-center gap-2 mb-2 flex-wrap">
          <span className="w-6 h-6 rounded-lg bg-amber-300/15 flex items-center justify-center text-amber-200 border border-amber-200/25">
            <Sparkles size={14} />
          </span>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-amber-200">
            Giáo Xứ Gia Tôn
          </span>
          <span className="text-white/35">•</span>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/82">
            Xứ Đoàn Đức Mẹ Fatima
          </span>
        </div>
        <h2 className="relative z-1 text-[22px] font-extrabold m-0 tracking-tight text-white">
          Thiếu Nhi Thánh Thể
        </h2>
        <p className="relative z-1 text-xs text-white/78 mt-1.5 m-0 font-medium leading-relaxed">
          Sổ tay Giáo lý di động cho Huynh Trưởng & Giáo Lý Viên.
        </p>
      </div>

      {/* Liturgical Day Card */}
      <MobileLiturgicalWidget onOpenCalendar={() => navigate({ to: '/calendar' })} />

      {/* Quick Actions Grid */}
      <div>
        <div className="mobile-section-label">
          Thao Tác Nhanh
        </div>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => { if ('vibrate' in navigator) try { navigator.vibrate(6) } catch {}; onNavigateTab('attendance') }}
            className="mobile-quick-action mobile-quick-action--success touch-manipulation"
          >
            <div className="mobile-quick-action__icon">
              <CheckSquare size={20} />
            </div>
            <span className="mobile-quick-action__label">Điểm Danh</span>
          </button>

          <button
            onClick={() => { if ('vibrate' in navigator) try { navigator.vibrate(6) } catch {}; onNavigateTab('grades') }}
            className="mobile-quick-action touch-manipulation"
          >
            <div className="mobile-quick-action__icon">
              <FileSpreadsheet size={20} />
            </div>
            <span className="mobile-quick-action__label">Bảng Điểm</span>
          </button>

          <button
            onClick={() => { if ('vibrate' in navigator) try { navigator.vibrate(6) } catch {}; onOpenAddStudent() }}
            className="mobile-quick-action mobile-quick-action--gold touch-manipulation"
          >
            <div className="mobile-quick-action__icon">
              <UserPlus size={20} />
            </div>
            <span className="mobile-quick-action__label">Thêm Em</span>
          </button>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="mobile-stat-card">
          <div className="mobile-stat-card__label">
            <Users size={14} className="text-parish-primary" />
            Tổng Thiếu Nhi
          </div>
          <div className="mobile-stat-card__value">
            {stats.total} <span className="text-xs font-normal text-text-secondary">em</span>
          </div>
          <div className="text-[10px] font-bold text-parish-success mt-1">
            ● Đang học: {stats.active} em
          </div>
        </div>

        <div className="mobile-stat-card">
          <div className="mobile-stat-card__label">
            <TrendingUp size={14} className="text-parish-success" />
            Tỷ Lệ Chuyên Cần
          </div>
          <div className="mobile-stat-card__value text-parish-success">
            {stats.attRate}%
          </div>
          <div className="text-[10px] font-bold text-text-secondary mt-1">
            Toàn xứ đoàn niên học
          </div>
        </div>
      </div>

      {/* Academic Excellence Summary */}
      <div className="mobile-content-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-amber-500" />
            <span className="text-xs font-black text-text-main uppercase">Học Lực HK {selectedSemester}</span>
          </div>
          <button
            onClick={() => onNavigateTab('grades')}
            className="-m-2 flex min-h-[44px] items-center gap-0.5 p-2 text-[11px] font-bold text-parish-primary"
          >
            Chi tiết <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200/60 dark:border-amber-900/60 rounded-xl py-2 px-1">
            <div className="text-[11px] font-black text-amber-800 dark:text-amber-300 uppercase">Xuất Sắc</div>
            <div className="text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">{stats.xuatSac}</div>
          </div>
          <div className="bg-sky-50 dark:bg-sky-950/60 border border-sky-200/60 dark:border-sky-900/60 rounded-xl py-2 px-1">
            <div className="text-[11px] font-black text-sky-800 dark:text-sky-300 uppercase">Giỏi</div>
            <div className="text-base font-black text-sky-600 dark:text-sky-400 mt-0.5">{stats.gioi}</div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-900/60 rounded-xl py-2 px-1">
            <div className="text-[11px] font-black text-emerald-800 dark:text-emerald-300 uppercase">Khá</div>
            <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.kha}</div>
          </div>
        </div>
      </div>

      {/* Parish Notices */}
      <div className="mobile-content-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-rose-500" />
            <span className="text-xs font-black text-text-main uppercase">Thông Báo Giáo Xứ</span>
          </div>
          <button
            onClick={() => onNavigateTab('notices')}
            className="-m-2 flex min-h-[44px] items-center gap-0.5 p-2 text-[11px] font-bold text-parish-primary"
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
