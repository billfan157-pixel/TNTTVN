import { useState, useEffect, useMemo } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useFilterStore } from '../../stores/filterStore';
import { MOCK_CLASSES } from '../../data/mockParishData';
import {
  CheckSquare, Save, CheckCircle2,
  XCircle, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getDefaultDate } from '../../utils/getDefaultDate';

export const DesktopAttendanceGrid: React.FC = () => {
  const { can } = useAuth();
  const canEditAttendance = can('admin', 'chunhiem', 'phuta');
  const students = useStudentStore(s => s.students);
  const attendance = useAttendanceStore(s => s.attendance);
  const batchSaveAttendance = useAttendanceStore(s => s.batchSaveAttendance);
  const selectedClassId = useFilterStore(s => s.selectedClassId);
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId);

  const [date, setDate] = useState<string>(getDefaultDate);
  const [type, setType] = useState<'SundayMass' | 'CatechismClass'>('SundayMass');
  const [attendanceState, setAttendanceState] = useState<Record<string, { status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note: string }>>({});
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

  const handleSave = () => {
    const list = Object.entries(attendanceState).map(([studentId, data]) => ({
      studentId, status: data.status, note: data.note
    }));
    batchSaveAttendance(list, date, type);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
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
      {/* Controls Bar */}
      <div className="bg-white rounded-2xl p-4 border border-surface-border flex justify-between items-center flex-wrap gap-3 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare size={20} className="text-parish-primary" />
            <h2 className="text-lg font-extrabold text-parish-primary m-0">
              Điểm Danh Chuyên Cần
            </h2>
          </div>
          <p className="text-sm text-text-muted mt-0.5 m-0">
            Có mặt: <strong className="text-parish-success">{presentCount}</strong> •
            Vắng có phép: <strong className="text-parish-warning">{excusedCount}</strong> •
            Vắng không phép: <strong className="text-parish-danger">{unexcusedCount}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="p-2 text-sm font-semibold rounded-xl border border-border-input bg-surface-app"
          >
            <option value="all">Tất cả các lớp</option>
            {MOCK_CLASSES.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="form-input text-sm font-semibold rounded-xl h-9"
          />

          <div className="flex bg-surface-hover p-1 rounded-xl border border-surface-border">
            <button
              onClick={() => setType('SundayMass')}
              className={`px-3 py-1.5 h-8 text-xs font-bold border-none rounded-lg cursor-pointer transition-colors ${
                type === 'SundayMass' ? 'bg-parish-primary text-white' : 'bg-transparent text-text-secondary'
              }`}
            >
              Lễ Chủ Nhật
            </button>
            <button
              onClick={() => setType('CatechismClass')}
              className={`px-3 py-1.5 h-8 text-xs font-bold border-none rounded-lg cursor-pointer transition-colors ${
                type === 'CatechismClass' ? 'bg-parish-primary text-white' : 'bg-transparent text-text-secondary'
              }`}
            >
              Lớp Giáo Lý
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
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-card overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0">
            <colgroup>
              <col className="w-[55px]" />
              <col className="w-[240px]" />
              <col className="w-[130px]" />
              <col className="w-[280px]" />
              <col className="w-auto" />
            </colgroup>
            <thead>
              {/* Table Header */}
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-3 px-4">STT</th>
                <th className="py-3 px-4">Tên Thánh & Họ Tên</th>
                <th className="py-3 px-4">Lớp</th>
                <th className="py-3 px-4 text-center">Trạng Thái Điểm Danh</th>
                <th className="py-3 px-4">Ghi Chú</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-text-muted">
                    Không có thiếu nhi nào trong bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => {
                  const state = attendanceState[s.id] || { status: 'Present', note: '' };
                  const cls = MOCK_CLASSES.find(c => c.id === s.classId);

                  return (
                    <tr key={s.id} className="border-b border-surface-hover hover:bg-surface-app transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-text-muted">{idx + 1}</td>

                      <td className="py-3.5 px-4 overflow-hidden min-w-0">
                        <div className="font-bold text-text-main truncate min-w-0" title={`${s.holyName} ${s.fullName}`}>
                          <span className="text-parish-secondary font-bold mr-1.5">{s.holyName}</span>
                          <span className="text-text-main font-semibold">{s.fullName}</span>
                        </div>
                        <div className="text-xs text-text-muted truncate min-w-0">{s.code}</div>
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
              placeholder="Nhập lý do nếu vắng..."
              value={state.note}
              readOnly={!canEditAttendance}
              onChange={e => handleNoteChange(s.id, e.target.value)}
              className="w-full p-1.5 text-xs rounded-md border border-border-input outline-none"
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
    </div>
  );
};
