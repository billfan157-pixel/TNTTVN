import React from 'react'
import { useState, useEffect, useMemo } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useLeaveRequestStore } from '../../stores/leaveRequestStore';
import { useFilterStore } from '../../stores/filterStore';
import { useClassStore } from '../../stores/classStore';
import {
  CheckSquare, Save, CheckCircle2,
  XCircle, AlertTriangle, CalendarClock, ArrowRight, BarChart2
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getDefaultDate } from '../../utils/getDefaultDate';
import { useToastStore } from '../../stores/toastStore';
import { EmptyState, NoResultState } from '../common/StateFeedback';
import { DesktopLeaveRequests } from './DesktopLeaveRequests';
import { DesktopAttendanceSummary } from './DesktopAttendanceSummary';
import { PageHeader } from '../common/PageHeader';
import { getLiturgicalDay } from '../../utils/liturgicalEngine';
import { LITURGICAL_COLORS } from '../../constants/liturgical';
import type { AttendanceType } from '../../types';

export const DesktopAttendanceGrid: React.FC = () => {
  const { can } = useAuth();
  const canEditAttendance = can('admin', 'chunhiem', 'phuta');
  const students = useStudentStore(s => s.students);
  const attendance = useAttendanceStore(s => s.attendance);
  const batchSaveAttendance = useAttendanceStore(s => s.batchSaveAttendance);
  const pendingCount = useLeaveRequestStore(s => s.pendingCount);
  const fetchPendingCount = useLeaveRequestStore(s => s.fetchPendingCount);
  const classList = useClassStore(s => s.getClassList)();
  const findClassById = useClassStore(s => s.findClassById);
  const selectedClassId = useFilterStore(s => s.selectedClassId);
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId);

  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'attendance' | 'leave-requests'>('summary');
  const [date, setDate] = useState<string>(getDefaultDate);
  const [type, setType] = useState<AttendanceType>('SundayMass');
  const [attendanceState, setAttendanceState] = useState<Record<string, { status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note: string }>>({});
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

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
    setAttendanceState(map);
  }, [date, type, filteredStudents, attendance]);

  const handleStatusChange = (studentId: string, status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused') => {
    if (!canEditAttendance) return;
    setAttendanceState(prev => ({ ...prev, [studentId]: { ...prev[studentId], status } }));
    setIsSaved(false);
  };

  const handleNoteChange = (studentId: string, note: string) => {
    if (!canEditAttendance) return;
    setAttendanceState(prev => ({ ...prev, [studentId]: { ...prev[studentId], note } }));
    setIsSaved(false);
  };

  const handleSave = async () => {
    const list = Object.entries(attendanceState).map(([studentId, data]) => ({
      studentId, status: data.status, note: data.note
    }));
    const result = await batchSaveAttendance(list, date, type)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 3000)
    if (result) {
      const errorCount = result.results?.filter((r: any) => r.status === 'error').length || 0
      if (errorCount > 0) {
        useToastStore.getState().addToast(`Đã lưu điểm danh với ${errorCount} lỗi`, 'error')
      } else {
        useToastStore.getState().addToast('Đã lưu điểm danh thành công!', 'success')
      }
    }
  };

  let presentCount = 0, excusedCount = 0, unexcusedCount = 0;
  Object.values(attendanceState).forEach(val => {
    if (val.status === 'Present') presentCount++;
    else if (val.status === 'AbsentExcused') excusedCount++;
    else if (val.status === 'AbsentUnexcused') unexcusedCount++;
  });

  const statusBtn = (id: string, label: string, status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused', icon: React.ReactNode, activeClass: string) => {
    const isActive = attendanceState[id]?.status === status
    return (
      <button
        onClick={() => handleStatusChange(id, status)}
        className={`px-2.5 py-1 text-xs font-semibold border-none rounded-sm cursor-pointer flex items-center justify-center gap-1.5 transition-colors h-8 min-w-[72px] ${
          isActive ? `${activeClass} text-white` : 'bg-transparent text-text-secondary'
        }`}
      >
        {icon} {label}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Main Tab Navigation */}
      <div className="flex items-center justify-between border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('summary')}
            className={`px-4 py-2 text-sm font-extrabold rounded-xl flex items-center gap-2 transition-all border ${
              activeSubTab === 'summary'
                ? 'bg-parish-primary text-white border-parish-primary shadow-sm'
                : 'bg-surface-card text-text-secondary hover:bg-surface-hover border-surface-border'
            }`}
          >
            <BarChart2 size={16} />
            <span>Tổng Hợp & Phân Tích</span>
          </button>

          <button
            onClick={() => setActiveSubTab('attendance')}
            className={`px-4 py-2 text-sm font-extrabold rounded-xl flex items-center gap-2 transition-all border ${
              activeSubTab === 'attendance'
                ? 'bg-parish-primary text-white border-parish-primary shadow-sm'
                : 'bg-surface-card text-text-secondary hover:bg-surface-hover border-surface-border'
            }`}
          >
            <CheckSquare size={16} />
            <span>Sổ Điểm Danh</span>
          </button>

          <button
            onClick={() => setActiveSubTab('leave-requests')}
            className={`px-4 py-2 text-sm font-extrabold rounded-xl flex items-center gap-2 transition-all border relative ${
              activeSubTab === 'leave-requests'
                ? 'bg-parish-primary text-white border-parish-primary shadow-sm'
                : 'bg-surface-card text-text-secondary hover:bg-surface-hover border-surface-border'
            }`}
          >
            <CalendarClock size={16} />
            <span>Duyệt Nghỉ Phép</span>
            {pendingCount > 0 && (
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                activeSubTab === 'leave-requests' ? 'bg-white text-parish-primary' : 'bg-parish-danger text-white'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {activeSubTab !== 'leave-requests' && pendingCount > 0 && (
          <button
            onClick={() => setActiveSubTab('leave-requests')}
            className="flex items-center gap-1.5 text-xs font-bold text-parish-primary hover:underline bg-parish-primary/10 px-3 py-1.5 rounded-lg transition-colors border border-parish-primary/20"
          >
            <span>💡 Có <strong>{pendingCount}</strong> đơn xin nghỉ chờ duyệt</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {activeSubTab === 'leave-requests' ? (
        <DesktopLeaveRequests />
      ) : activeSubTab === 'summary' ? (
        <DesktopAttendanceSummary />
      ) : (
        <>
          {/* Controls Bar */}
          <PageHeader
            icon={<CheckSquare size={20} />}
            title="Điểm Danh Chuyên Cần"
            description={
              <span>
                Có mặt: <strong className="text-parish-success">{presentCount}</strong> •{' '}
                Vắng có phép: <strong className="text-parish-warning">{excusedCount}</strong> •{' '}
                Vắng không phép: <strong className="text-parish-danger">{unexcusedCount}</strong>
              </span>
            }
            actions={
              <>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="form-select text-sm font-bold"
                >
                  <option value="all">Tất cả các lớp</option>
                  {classList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="form-input text-sm font-bold h-10"
                  />
                  {(() => {
                    const ld = getLiturgicalDay(date);
                    const cm = LITURGICAL_COLORS[ld.color] || LITURGICAL_COLORS.GREEN;
                    return (
                      <div
                        className={`hidden xl:flex items-center gap-1.5 px-3 h-10 rounded-xl border text-xs font-extrabold max-w-[220px] truncate ${cm.bgClass} ${cm.textClass} ${cm.borderClass}`}
                        title={`${ld.title} (${ld.seasonName} • ${ld.colorName})`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cm.hex }} />
                        <span className="truncate">{ld.title}</span>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex bg-surface-hover p-1.5 rounded-xl border border-surface-border gap-1">
                  <button
                    onClick={() => setType('SundayMass')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      type === 'SundayMass' ? 'bg-parish-primary text-white shadow-sm' : 'text-text-secondary hover:bg-surface-card'
                    }`}
                  >
                    Thánh Lễ
                  </button>
                  <button
                    onClick={() => setType('CatechismClass')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      type === 'CatechismClass' ? 'bg-parish-primary text-white shadow-sm' : 'text-text-secondary hover:bg-surface-card'
                    }`}
                  >
                    Giáo Lý
                  </button>
                  <button
                    onClick={() => setType('EucharisticAdoration')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      type === 'EucharisticAdoration' ? 'bg-parish-primary text-white shadow-sm' : 'text-text-secondary hover:bg-surface-card'
                    }`}
                  >
                    Chầu
                  </button>
                </div>

                {canEditAttendance && (
                  <button
                    onClick={handleSave}
                    className={`btn transition-colors duration-300 ${isSaved ? 'bg-parish-success' : 'bg-parish-primary'} text-white`}
                  >
                    {isSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                    {isSaved ? 'Đã Lưu!' : 'Lưu Điểm Danh'}
                  </button>
                )}
              </>
            }
          />

      {/* Attendance Table */}
      <div className="bg-surface-card rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0 bg-surface-card text-text-main">
            <colgroup>
              <col className="w-[60px]" />
              <col className="w-[130px]" />
              <col className="w-[260px]" />
              <col className="w-[120px]" />
              <col className="w-[280px]" />
              <col className="w-auto" />
            </colgroup>
            <thead>
              {/* Table Header */}
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-3 px-4" scope="col">STT</th>
                <th className="py-3 px-4" scope="col">Tên Thánh</th>
                <th className="py-3 px-4" scope="col">Họ và Tên</th>
                <th className="py-3 px-4" scope="col">Lớp</th>
                <th className="py-3 px-4 text-center" scope="col">Trạng Thái Điểm Danh</th>
                <th className="py-3 px-4" scope="col">Ghi Chú</th>
              </tr>
            </thead>
            <tbody className="bg-surface-card">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8">
                    {students.length === 0 ? (
                      <EmptyState
                        title="Chưa có danh sách thiếu nhi"
                        description="Vui lòng thêm thiếu nhi vào hệ thống trước khi thực hiện điểm danh."
                      />
                    ) : (
                      <NoResultState
                        title="Không có thiếu nhi nào trong lớp đã chọn"
                        description="Hãy chọn lớp học khác hoặc chọn 'Tất cả các lớp'."
                        onReset={() => setSelectedClassId('all')}
                      />
                    )}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => {
                  const state = attendanceState[s.id] || { status: 'Present', note: '' };
                  const cls = findClassById(s.classId);

                  return (
                    <tr key={s.id} className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-text-muted">{idx + 1}</td>

                      <td className="py-3.5 px-4 font-bold text-parish-secondary text-sm truncate min-w-0">{s.holyName || '-'}</td>

                      <td className="py-3.5 px-4 overflow-hidden min-w-0">
                        <div className="font-bold text-base text-text-main truncate min-w-0 flex items-center gap-1.5" title={s.fullName}>
                          <span>{s.fullName}</span>
                          {state.status === 'AbsentExcused' && state.note?.includes('[Đơn') && (
                            <span className="badge badge-warning text-[10px] px-1.5 py-0.2 font-bold shrink-0">
                              Có phép online
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-text-muted truncate min-w-0">{s.code}</div>
                      </td>

                      <td className="py-3.5 px-4 text-text-secondary font-medium truncate overflow-hidden min-w-0">{cls?.name}</td>

                      <td className="py-3.5 px-4 text-center">
                          <div className="inline-flex bg-surface-hover p-1 rounded-xl gap-1.5 border border-surface-border">
                            {statusBtn(s.id, 'Có mặt', 'Present', <CheckCircle2 size={14} />, 'bg-parish-success')}
                            {statusBtn(s.id, 'Có phép', 'AbsentExcused', <AlertTriangle size={14} />, 'bg-parish-warning')}
                            {statusBtn(s.id, 'Vắng', 'AbsentUnexcused', <XCircle size={14} />, 'bg-parish-danger')}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <input
                          type="text"
                          placeholder="Nhập lý do nếu vắng... (P: Có mặt, E: Có phép, A: Vắng)"
                          value={state.note}
                          readOnly={!canEditAttendance}
                          onChange={e => handleNoteChange(s.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'ArrowDown') {
                              e.preventDefault()
                              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[placeholder*="Nhập lý do"]'))
                              inputs[idx + 1]?.focus()
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault()
                              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[placeholder*="Nhập lý do"]'))
                              inputs[idx - 1]?.focus()
                            }
                          }}
                          className="w-full p-1.5 text-xs rounded-md bg-surface-card text-text-main border border-border-input outline-none focus:ring-2 focus:ring-parish-primary"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
