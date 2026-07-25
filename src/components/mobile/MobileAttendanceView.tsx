import React, { useState, useEffect, useMemo } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useFilterStore } from '../../stores/filterStore';
import { useClassStore } from '../../stores/classStore';
import {
  CheckCircle2, AlertTriangle, XCircle,
  Check, Save
} from 'lucide-react';
import { getDefaultDate } from '../../utils/getDefaultDate';

export const MobileAttendanceView: React.FC = () => {
  const students = useStudentStore(s => s.students)
  const attendance = useAttendanceStore(s => s.attendance)
  const batchSaveAttendance = useAttendanceStore(s => s.batchSaveAttendance)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const [date, setDate] = useState<string>(getDefaultDate);
  const [type, setType] = useState<'SundayMass' | 'CatechismClass'>('SundayMass');
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

  let presentCount = 0;
  Object.values(attendanceMap).forEach(v => { if (v.status === 'Present') presentCount++; });

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '90px' }}>
      {/* Header controls */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '16px', border: '1px solid #E2E8F0', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1E3A8A', margin: 0 }}>
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
            onChange={e => setType(e.target.value as 'SundayMass' | 'CatechismClass')}
            className="form-select"
            style={{ flex: 1.2, fontSize: '12.5px', fontWeight: 600 }}
          >
            <option value="SundayMass">Thánh Lễ Chủ Nhật</option>
            <option value="CatechismClass">Giờ Học Giáo Lý</option>
          </select>
        </div>

        {/* Class Selection */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="form-select"
            style={{ flex: 1, fontSize: '12.5px', fontWeight: 600 }}
          >
            <option value="all">Tất cả các lớp</option>
            {useClassStore.getState().getClassList().map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button onClick={handleMarkAllPresent} className="btn btn-secondary btn-sm" style={{ height: '38px', borderRadius: '12px' }}>
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
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '12px',
                border: '1px solid #E2E8F0',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E3A8A' }}>
                    <span style={{ color: '#D97706', marginRight: '6px' }}>{student.holyName}</span>
                    <span>{' '}{student.fullName}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    {student.code} • {useClassStore.getState().findClassById(student.classId)?.name}
                  </div>
                </div>
              </div>

              {/* 3 Touch Status Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <button
                  onClick={() => handleToggle(student.id, 'Present')}
                  style={{
                    padding: '8px 4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: item.status === 'Present' ? '#16A34A' : '#F1F5F9',
                    color: item.status === 'Present' ? 'white' : '#475569',
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
                  style={{
                    padding: '8px 4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: item.status === 'AbsentExcused' ? '#EA580C' : '#F1F5F9',
                    color: item.status === 'AbsentExcused' ? 'white' : '#475569',
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
                  style={{
                    padding: '8px 4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: item.status === 'AbsentUnexcused' ? '#DC2626' : '#F1F5F9',
                    color: item.status === 'AbsentUnexcused' ? 'white' : '#475569',
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
        style={{
          position: 'fixed',
          bottom: '76px',
          right: '16px',
          background: isSaved ? '#16A34A' : '#1E3A8A',
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
          zIndex: 900,
          cursor: 'pointer'
        }}
      >
        <Save size={18} />
        {isSaved ? 'Đã Lưu!' : 'Lưu Điểm Danh'}
      </button>
    </div>
  );
};
