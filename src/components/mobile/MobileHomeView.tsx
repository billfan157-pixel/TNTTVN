import React, { useEffect, useMemo } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { useNoticeStore } from '../../stores/noticeStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import { useLeaveRequestStore } from '../../stores/leaveRequestStore';
import { calculateGradeAverage, calculateAttendanceRate } from '../../utils/grades';
import { 
  CheckSquare, FileSpreadsheet, UserPlus, CalendarClock,
  Bell, Users, Award, TrendingUp, ChevronRight, AlertCircle, Sparkles
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
  const currentUser = useAuthStore(s => s.user);
  const academicYearDisplay = useAcademicYearStore(s => s.currentYear);
  const pendingCount = useLeaveRequestStore(s => s.pendingCount);
  const fetchPendingCount = useLeaveRequestStore(s => s.fetchPendingCount);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  // Contextual greeting based on time of day
  const greeting = useMemo(() => {
    const hours = new Date().getHours();
    if (hours >= 5 && hours < 11) return 'Chào buổi sáng';
    if (hours >= 11 && hours < 14) return 'Chào buổi trưa';
    if (hours >= 14 && hours < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  }, []);

  const displayName = currentUser?.fullName || 'Huynh trưởng';
  const roleLabel = useMemo(() => {
    const role = currentUser?.role;
    if (role === 'admin') return 'Ban Quản trị';
    if (role === 'chunhiem') return 'Chủ nhiệm';
    if (role === 'phuta') return 'Phụ tá';
    if (role === 'phuhuynh') return 'Phụ huynh';
    return 'Giáo Lý Viên';
  }, [currentUser?.role]);

  const stats = useMemo(() => {
    const total = students.length;
    const active = students.filter(s => s.status === 'Đang học').length;

    let presentCount = 0;
    attendance.forEach(a => {
      if (a.status === 'Present' || a.status === 'AbsentExcused') presentCount++;
    });
    const attRate = attendance.length > 0 ? calculateAttendanceRate(presentCount, attendance.length).rate : 100;

    // PERF: Build grade index once → O(1) lookup per student instead of O(M) find()
    const gradeIndex = new Map<string, typeof grades[0]>();
    for (const g of grades) {
      if (g.semester === selectedSemester) gradeIndex.set(g.studentId, g);
    }

    const gradeWeights = useSettingsStore.getState().settings.gradeWeights;
    let xuatSac = 0, gioi = 0, kha = 0;
    let totalGraded = 0;
    students.forEach(s => {
      const g = gradeIndex.get(s.id);
      if (g) {
        const avg = calculateGradeAverage(g, gradeWeights);
        if (avg.score !== null) {
          totalGraded++;
          if (avg.label === 'Xuất Sắc') xuatSac++;
          else if (avg.label === 'Giỏi') gioi++;
          else if (avg.label === 'Khá') kha++;
        }
      }
    });

    return { total, active, attRate, xuatSac, gioi, kha, totalGraded };
  }, [students, attendance, grades, selectedSemester]);

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* 1. Refined Blue Hero Card — Single Focal Point with Prominent User Name */}
      <div className="mobile-home-hero">
        <div className="relative z-1 flex items-center gap-1.5 mb-1">
          <Sparkles size={11} className="text-amber-300/80 shrink-0" />
          <span className="text-[10px] font-bold tracking-[0.08em] text-amber-200/80 uppercase">
            Giáo Xứ Gia Tôn
          </span>
        </div>
        <div className="relative z-1 my-0.5">
          <div className="text-xs font-semibold text-white/80 leading-none mb-1">{greeting},</div>
          <h2 className="text-[22px] sm:text-[24px] font-black m-0 tracking-tight text-white leading-tight">
            {displayName}
          </h2>
        </div>
        <p className="relative z-1 text-[11px] text-white/70 mt-1 m-0 font-medium leading-relaxed">
          {roleLabel} · Học kỳ {selectedSemester === 2 ? 'II' : 'I'} · Niên học {academicYearDisplay}
        </p>
      </div>

      {/* 2. Liturgical Day Card */}
      <MobileLiturgicalWidget onOpenCalendar={() => navigate({ to: '/calendar' })} />

      {/* 3. Conditional "Việc Cần Xử Lý" (Render ONLY when actionable items exist) */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => {
            if ('vibrate' in navigator) try { navigator.vibrate(6); } catch {}
            onNavigateTab('attendance');
          }}
          className="w-full p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99] cursor-pointer shadow-2xs"
          aria-label={`${pendingCount} đơn xin nghỉ đang chờ duyệt`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertCircle size={17} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Việc cần xử lý
              </div>
              <div className="text-xs font-bold text-text-main truncate mt-0.5">
                {pendingCount} đơn xin nghỉ đang chờ duyệt
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
        </button>
      )}

      {/* 4. Primary Operational Actions (Luxury Symmetrical 2×2 Grid) */}
      <nav aria-label="Thao tác nhanh">
        <div className="mobile-section-label">
          Thao tác nhanh
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => { if ('vibrate' in navigator) try { navigator.vibrate(6); } catch {}; onNavigateTab('attendance'); }}
            className="mobile-quick-action mobile-quick-action--success touch-manipulation"
            aria-label="Thao tác nhanh: Điểm danh"
          >
            <div className="mobile-quick-action__icon">
              <CheckSquare size={17} strokeWidth={2.2} />
            </div>
            <div className="mobile-quick-action__body">
              <span className="mobile-quick-action__label">Điểm danh</span>
              <span className="mobile-quick-action__sub">Sổ chuyên cần</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { if ('vibrate' in navigator) try { navigator.vibrate(6); } catch {}; onNavigateTab('grades'); }}
            className="mobile-quick-action touch-manipulation"
            aria-label="Thao tác nhanh: Bảng điểm"
          >
            <div className="mobile-quick-action__icon">
              <FileSpreadsheet size={17} strokeWidth={2.2} />
            </div>
            <div className="mobile-quick-action__body">
              <span className="mobile-quick-action__label">Bảng điểm</span>
              <span className="mobile-quick-action__sub">Sổ điểm giáo lý</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { if ('vibrate' in navigator) try { navigator.vibrate(6); } catch {}; onNavigateTab('attendance'); }}
            className="mobile-quick-action mobile-quick-action--purple touch-manipulation"
            aria-label="Thao tác nhanh: Duyệt nghỉ"
          >
            <div className="mobile-quick-action__icon">
              <CalendarClock size={17} strokeWidth={2.2} />
            </div>
            <div className="mobile-quick-action__body">
              <span className="mobile-quick-action__label">Duyệt nghỉ</span>
              <span className="mobile-quick-action__sub">
                {pendingCount > 0 ? `${pendingCount} đơn chờ` : 'Đơn vắng phép'}
              </span>
            </div>
            {pendingCount > 0 && (
              <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black leading-none shadow-xs animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => { if ('vibrate' in navigator) try { navigator.vibrate(6); } catch {}; onOpenAddStudent(); }}
            className="mobile-quick-action mobile-quick-action--gold touch-manipulation"
            aria-label="Thao tác nhanh: Thêm thiếu nhi"
          >
            <div className="mobile-quick-action__icon">
              <UserPlus size={17} strokeWidth={2.2} />
            </div>
            <div className="mobile-quick-action__body">
              <span className="mobile-quick-action__label">Thêm thiếu nhi</span>
              <span className="mobile-quick-action__sub">Tạo hồ sơ mới</span>
            </div>
          </button>
        </div>
      </nav>

      {/* 5. Overview Stats Cards (Xứ Đoàn Overview) */}
      <section className="grid grid-cols-2 gap-3" aria-label="Thống kê tổng quan xứ đoàn">
        <div className="mobile-stat-card">
          <div className="mobile-stat-card__label">
            <Users size={14} className="text-parish-primary" />
            Tổng thiếu nhi
          </div>
          <div className="mobile-stat-card__value">
            {stats.total} <span className="text-xs font-normal text-text-secondary">em</span>
          </div>
          <div className="text-[10px] font-bold text-parish-success mt-1">
            ● {stats.active} đang học
          </div>
        </div>

        <div className="mobile-stat-card">
          <div className="mobile-stat-card__label">
            <TrendingUp size={14} className="text-parish-success" />
            Tỷ lệ chuyên cần
          </div>
          <div className="mobile-stat-card__value text-parish-success">
            {stats.attRate}%
          </div>
          <div className="text-[10px] font-bold text-text-secondary mt-1">
            Toàn xứ đoàn
          </div>
        </div>
      </section>

      {/* 6. Academic Excellence Summary with Mini Distribution */}
      <div className="mobile-content-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-amber-500" />
            <span className="text-xs font-bold text-text-main">Học lực HK {selectedSemester === 2 ? 'II' : 'I'}</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('grades')}
            className="-m-2 flex min-h-[44px] items-center gap-0.5 p-2 text-[11px] font-bold text-parish-primary"
          >
            Chi tiết <ChevronRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/25 rounded-xl py-2 px-1">
            <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Xuất sắc</div>
            <div className="text-base font-black text-amber-700 dark:text-amber-400 mt-0.5">{stats.xuatSac}</div>
          </div>
          <div className="bg-sky-500/10 dark:bg-sky-400/10 border border-sky-500/25 rounded-xl py-2 px-1">
            <div className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase tracking-wide">Giỏi</div>
            <div className="text-base font-black text-sky-700 dark:text-sky-400 mt-0.5">{stats.gioi}</div>
          </div>
          <div className="bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/25 rounded-xl py-2 px-1">
            <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Khá</div>
            <div className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">{stats.kha}</div>
          </div>
        </div>

        {/* Mini Academic Distribution Bar — Explicitly clarifies graded subset vs total */}
        {stats.totalGraded > 0 && (
          <div className="pt-1 flex flex-col gap-1.5">
            <div className="h-1.5 w-full bg-surface-hover rounded-full overflow-hidden flex" aria-hidden="true">
              <div style={{ width: `${(stats.xuatSac / stats.totalGraded) * 100}%` }} className="bg-amber-500 h-full" title={`Xuất sắc: ${stats.xuatSac}`} />
              <div style={{ width: `${(stats.gioi / stats.totalGraded) * 100}%` }} className="bg-sky-500 h-full" title={`Giỏi: ${stats.gioi}`} />
              <div style={{ width: `${(stats.kha / stats.totalGraded) * 100}%` }} className="bg-emerald-500 h-full" title={`Khá: ${stats.kha}`} />
            </div>
            <div className="text-[10px] text-text-muted font-medium text-right">
              Tỷ lệ của {stats.totalGraded} em đã có điểm ({stats.totalGraded}/{stats.total} thiếu nhi)
            </div>
          </div>
        )}
      </div>

      {/* 7. Parish Notices */}
      <div className="mobile-content-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-rose-500" />
            <span className="text-xs font-bold text-text-main">Thông báo giáo xứ</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('notices')}
            className="-m-2 flex min-h-[44px] items-center gap-0.5 p-2 text-[11px] font-bold text-parish-primary"
          >
            Tất cả <ChevronRight size={14} />
          </button>
        </div>

        <div className="space-y-2.5">
          {notices.slice(0, 2).map(n => (
            <div key={n.id} className="p-2.5 bg-surface-hover border border-surface-border rounded-xl space-y-1">
              <div className="text-xs font-bold text-text-main line-clamp-1">{n.title}</div>
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
