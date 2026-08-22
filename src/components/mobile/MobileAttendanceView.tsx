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
    <div className="mobile-screen mobile-screen--stack">
      {/* Segmented SubTab Bar */}
      <div className="flex bg-surface-card p-1 rounded-xl border border-surface-border gap-1 mb-2">
        <button
          onClick={() => setActiveSubTab('attendance')}
          className={`flex-1 py-2 min-h-[44px] text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'attendance'
              ? 'bg-parish-primary text-white shadow-sm'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          <CheckSquare size={14} />
          <span>Điểm Danh</span>
        </button>
        <button
          onClick={() => setActiveSubTab('summary')}
          className={`flex-1 py-2 min-h-[44px] text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'summary'
              ? 'bg-parish-primary text-white shadow-sm'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          <BarChart2 size={14} />
          <span>Tổng Hợp</span>
        </button>
        <button
          onClick={() => setActiveSubTab('leave-requests')}
          className={`flex-1 py-2 min-h-[44px] text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 relative ${
            activeSubTab === 'leave-requests'
              ? 'bg-parish-primary text-white shadow-sm'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
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
          <div className="bg-surface-card rounded-2xl p-4 border border-surface-border shadow-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 className="text-base font-extrabold text-parish-primary m-0">
                Điểm Danh Chuyên Cần
              </h3>
              <span className="badge badge-success">
                {presentCount} / {filteredStudents.length} Có mặt
              </span>
            </div>

        {/* Date & Type Selection */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="form-input"
            style={{ flex: 1, fontSize: '12.5px', fontWeight: 600 }}
          />

          <select
            value={type}
            onChange={e => setType(e.target.value as AttendanceType)}
            className="form-select"
            style={{ flex: 1.2, fontSize: '12.5px', fontWeight: 600 }}
          >
            <option value="SundayMass">Thánh Lễ Chủ Nhật</option>
            <option value="CatechismClass">Giờ Học Giáo Lý</option>
            <option value="EucharisticAdoration">Chầu Thánh Thể</option>
          </select>
        </div>

        {/* Liturgical Day Strip */}
        {(() => {
          const ld = getLiturgicalDay(date);
          const cm = LITURGICAL_COLORS[ld.color] || LITURGICAL_COLORS.GREEN;
          return (
            <div className={`mb-3 p-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${cm.bgClass} ${cm.textClass} ${cm.borderClass}`}>
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cm.hex }} />
                <span className="truncate">{ld.title}</span>
              </div>
              <span className="text-[10px] font-black uppercase shrink-0">{ld.colorName}</span>
            </div>
          );
        })()}

        {/* Class Selection (admin only — GLV only sees their assigned classes) */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {role === 'admin' && (
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="form-select"
            style={{ flex: 1, fontSize: '12.5px', fontWeight: 600 }}
          >
            <option value="all">Tất cả các lớp</option>
            {classList.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          )}

          <button onClick={handleMarkAllPresent} className="btn btn-secondary mobile-btn" style={{ borderRadius: '12px', ...(role !== 'admin' ? { width: '100%' } : {}) }}>
            <Check size={14} /> Có mặt tất cả
          </button>
        </div>
      </div>

      {/* Student Cards Touch List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredStudents.map(student => {
          const item = attendanceMap[student.id] || { status: 'Present', note: '' };

          return (
            <div
              key={student.id}
              className="bg-surface-card border border-surface-border rounded-xl shadow-card p-3"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <div className="text-parish-primary flex items-center gap-1.5" style={{ fontSize: '15px', fontWeight: 700 }}>
                    <span className="text-parish-secondary">{student.holyName}</span>
                    <span>{student.fullName}</span>
                    {item.status === 'AbsentExcused' && item.note?.includes('[Đơn') && (
                      <span className="badge badge-warning text-[10px] px-1.5 py-0.2 font-bold shrink-0">
                        Có phép online
                      </span>
                    )}
                  </div>
                  <div className="text-text-muted" style={{ fontSize: '12px' }}>
                    {student.code} • {findClassById(student.classId)?.name}
                  </div>
                </div>
              </div>

              {/* 3 Touch Status Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <button
                  onClick={() => handleToggle(student.id, 'Present')}
                  className={item.status === 'Present' ? 'bg-parish-success text-white' : 'bg-surface-hover text-text-secondary'}
                  style={{
                    padding: '8px 4px',
                    minHeight: '44px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <CheckCircle2 size={14} /> Có mặt
                </button>

                <button
                  onClick={() => handleToggle(student.id, 'AbsentExcused')}
                  className={item.status === 'AbsentExcused' ? 'bg-parish-warning text-white' : 'bg-surface-hover text-text-secondary'}
                  style={{
                    padding: '8px 4px',
                    minHeight: '44px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <AlertTriangle size={14} /> Có phép
                </button>

                <button
                  onClick={() => handleToggle(student.id, 'AbsentUnexcused')}
                  className={item.status === 'AbsentUnexcused' ? 'bg-parish-danger text-white' : 'bg-surface-hover text-text-secondary'}
                  style={{
                    padding: '8px 4px',
                    minHeight: '44px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
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
        className="mobile-floating-action"
        style={{
          background: isSaved ? 'var(--color-parish-success)' : 'var(--color-parish-primary)',
          color: 'white',
          border: 'none',
          borderRadius: '30px',
          padding: '12px 20px',
          fontSize: '14px',
          fontWeight: 700,
          boxShadow: '0 4px 15px rgba(30, 58, 138, 0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer'
        }}
      >
        <Save size={18} />
        {isSaved ? 'Đã Lưu!' : 'Lưu Điểm Danh'}
      </button>
        </>
      )}
    </div>
  );
};
