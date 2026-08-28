import React, { useState, useEffect, useMemo } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useLeaveRequestStore } from '../../stores/leaveRequestStore';
import { useFilterStore } from '../../stores/filterStore';
import { useClassStore } from '../../stores/classStore';
import { useAuth } from '../../hooks/useAuth';
import {
  CheckCircle2, AlertTriangle, XCircle,
  Check, Save, CalendarClock, CheckSquare, BarChart2
} from 'lucide-react';
import { getDefaultDate } from '../../utils/getDefaultDate';
import { MobileLeaveRequests } from './MobileLeaveRequests';
import { MobileAttendanceSummaryView } from './MobileAttendanceSummaryView';
import { getLiturgicalDay } from '../../utils/liturgicalEngine';
import { LITURGICAL_COLORS } from '../../constants/liturgical';
import type { AttendanceType } from '../../types';

export const MobileAttendanceView: React.FC = () => {
  const { role } = useAuth()
  const students = useStudentStore(s => s.students)
  const attendance = useAttendanceStore(s => s.attendance)
  const batchSaveAttendance = useAttendanceStore(s => s.batchSaveAttendance)
  const pendingCount = useLeaveRequestStore(s => s.pendingCount)
  const fetchPendingCount = useLeaveRequestStore(s => s.fetchPendingCount)
  const classList = useClassStore(s => s.getClassList)()
  const findClassById = useClassStore(s => s.findClassById)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const [activeSubTab, setActiveSubTab] = useState<'attendance' | 'summary' | 'leave-requests'>('attendance')
  const [date, setDate] = useState<string>(getDefaultDate);
  const [type, setType] = useState<AttendanceType>('SundayMass');
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note: string }>>({});
  const [isSaved, setIsSaved] = useState(false);

  const filteredStudents = useMemo(
    () => selectedClassId === 'all' ? students : students.filter(s => s.classId === selectedClassId),
    [selectedClassId, students]
  );

  useEffect(() => {
    const map: Record<string, { status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note: string }> = {};
    filteredStudents.forEach(s => {
      const rec = attendance.find(a => a.studentId === s.id && a.date === date && a.type === type);
      map[s.id] = {
        status: rec ? rec.status : 'Present',
        note: rec?.note || ''
      };
    });
    setAttendanceMap(map);
  }, [date, type, filteredStudents, attendance]);

  const handleToggle = (studentId: string, status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused') => {
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status
      }
    }));
    setIsSaved(false);
  };

  const handleMarkAllPresent = () => {
    setAttendanceMap(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => copy[k].status = 'Present');
      return copy;
    });
    setIsSaved(false);
  };

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSave = () => {
    const list = Object.entries(attendanceMap).map(([studentId, d]) => ({
      studentId,
      status: d.status,
      note: d.note
    }));
    batchSaveAttendance(list, date, type);
    setIsSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsSaved(false), 3000);
  };

  useEffect(() => {
    fetchPendingCount()
  }, [fetchPendingCount])

  let presentCount = 0;
  Object.values(attendanceMap).forEach(v => { if (v.status === 'Present') presentCount++; });

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* Segmented SubTab Bar */}
      <div className="view-tabs" role="tablist" aria-label="Chức năng điểm danh">
        <button
          onClick={() => setActiveSubTab('attendance')}
          className={`view-tab ${activeSubTab === 'attendance' ? 'is-active' : ''}`}
          role="tab"
          aria-selected={activeSubTab === 'attendance'}
        >
          <CheckSquare size={14} />
          <span>Điểm Danh</span>
        </button>
        <button
          onClick={() => setActiveSubTab('summary')}
          className={`view-tab ${activeSubTab === 'summary' ? 'is-active' : ''}`}
          role="tab"
          aria-selected={activeSubTab === 'summary'}
        >
          <BarChart2 size={14} />
          <span>Tổng Hợp</span>
        </button>
        <button
          onClick={() => setActiveSubTab('leave-requests')}
          className={`view-tab relative ${activeSubTab === 'leave-requests' ? 'is-active' : ''}`}
          role="tab"
          aria-selected={activeSubTab === 'leave-requests'}
        >
          <CalendarClock size={14} />
          <span>Đơn Xin Nghỉ</span>
          {pendingCount > 0 && (
            <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
              activeSubTab === 'leave-requests' ? 'bg-white text-parish-primary' : 'bg-parish-danger text-white'
            }`}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeSubTab === 'leave-requests' ? (
        <MobileLeaveRequests />
      ) : activeSubTab === 'summary' ? (
        <MobileAttendanceSummaryView />
      ) : (
        <>
          {/* Header controls */}
          <div className="mobile-filter-panel mobile-sticky-under-topbar flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold text-parish-primary m-0 leading-tight">
                Điểm Danh Chuyên Cần
              </h3>
              <span className="badge badge-success shrink-0 tabular-nums">
                {presentCount}/{filteredStudents.length} Có mặt
              </span>
            </div>

        {/* Date & Type Selection */}
        <div className="grid grid-cols-[1fr_1.2fr] gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="form-input min-h-[44px] rounded-xl text-xs font-semibold"
          />

          <select
            value={type}
            onChange={e => setType(e.target.value as AttendanceType)}
            className="form-select min-h-[44px] rounded-xl text-xs font-semibold"
          >
            <option value="SundayMass">Thánh Lễ CN</option>
            <option value="CatechismClass">Giờ Giáo Lý</option>
            <option value="EucharisticAdoration">Chầu Thánh Thể</option>
          </select>
        </div>

        {/* Liturgical Day Strip */}
        {(() => {
          const ld = getLiturgicalDay(date);
          const cm = LITURGICAL_COLORS[ld.color] || LITURGICAL_COLORS.GREEN;
          return (
            <div className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${cm.bgClass} ${cm.textClass} ${cm.borderClass}`}>
              <div className="flex items-center gap-1.5 truncate min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10" style={{ backgroundColor: cm.hex }} />
                <span className="truncate">{ld.title}</span>
              </div>
              <span className="text-[10px] font-black uppercase shrink-0 tracking-wide">{ld.colorName}</span>
            </div>
          );
        })()}

        {/* Class Selection (admin only — GLV only sees their assigned classes) */}
        <div className="flex gap-2">
          {role === 'admin' && (
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="form-select flex-1 min-h-[44px] rounded-xl text-xs font-semibold"
          >
            <option value="all">Tất cả các lớp</option>
            {classList.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          )}

          <button onClick={handleMarkAllPresent} className={`btn btn-secondary rounded-xl min-h-[44px] px-4 text-xs font-bold gap-1.5 ${role !== 'admin' ? 'flex-1' : 'shrink-0'}`}>
            <Check size={14} /> Có mặt tất cả
          </button>
        </div>
      </div>

      {/* Student Cards Touch List */}
      <div className="flex flex-col gap-2.5">
        {filteredStudents.length === 0 ? (
          <div className="state-feedback state-feedback--empty p-8 text-center text-sm text-text-muted">
            Không có thiếu nhi trong bộ lọc hiện tại.
          </div>
        ) : filteredStudents.map(student => {
          const item = attendanceMap[student.id] || { status: 'Present', note: '' };

          return (
            <div
              key={student.id}
              className="entity-card p-3.5 flex flex-col gap-3"
            >
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-[15px] font-bold leading-tight">
                    <span className="text-parish-secondary">{student.holyName}</span>
                    <span className="text-parish-primary">{student.fullName}</span>
                    {item.status === 'AbsentExcused' && item.note?.includes('[Đơn') && (
                      <span className="badge badge-warning text-[10px] px-1.5 py-0.5 font-bold shrink-0">
                        Có phép online
                      </span>
                    )}
                  </div>
                  <div className="text-text-muted text-xs mt-1">
                    {student.code} • {findClassById(student.classId)?.name || '—'}
                  </div>
                </div>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ring-1 ring-black/5 ${item.status === 'Present' ? 'bg-parish-success' : item.status === 'AbsentExcused' ? 'bg-parish-warning' : 'bg-parish-danger'}`} aria-hidden="true" />
              </div>

              {/* 3 Touch Status Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleToggle(student.id, 'Present')}
                  className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${item.status === 'Present' ? 'bg-parish-success text-white border-parish-success shadow-sm' : 'bg-surface-hover text-text-secondary border-surface-border hover:bg-surface-card'}`}
                  aria-pressed={item.status === 'Present'}
                >
                  <CheckCircle2 size={14} /> Có mặt
                </button>

                <button
                  onClick={() => handleToggle(student.id, 'AbsentExcused')}
                  className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${item.status === 'AbsentExcused' ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-surface-hover text-text-secondary border-surface-border hover:bg-surface-card'}`}
                  aria-pressed={item.status === 'AbsentExcused'}
                >
                  <AlertTriangle size={14} /> Có phép
                </button>

                <button
                  onClick={() => handleToggle(student.id, 'AbsentUnexcused')}
                  className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${item.status === 'AbsentUnexcused' ? 'bg-parish-danger text-white border-parish-danger shadow-sm' : 'bg-surface-hover text-text-secondary border-surface-border hover:bg-surface-card'}`}
                  aria-pressed={item.status === 'AbsentUnexcused'}
                >
                  <XCircle size={14} /> Vắng
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Save Button */}
      <button
        onClick={handleSave}
        className={`mobile-floating-action inline-flex items-center gap-2 min-h-[48px] px-5 rounded-full text-sm font-extrabold shadow-lg transition-colors ${isSaved ? 'bg-parish-success text-white' : 'bg-parish-primary text-white hover:bg-parish-primary-hover'}`}
        aria-live="polite"
      >
        <Save size={18} />
        {isSaved ? 'Đã Lưu!' : `Lưu Điểm Danh (${filteredStudents.length})`}
      </button>
        </>
      )}
    </div>
  );
};
