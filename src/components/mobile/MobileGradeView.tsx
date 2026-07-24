import React from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useFilterStore } from '../../stores/filterStore';
import { MOCK_CLASSES } from '../../data/mockParishData';
import { Student } from '../../types';
import { FileSpreadsheet } from 'lucide-react';

interface MobileGradeViewProps {
  onViewReport: (student: Student) => void;
}

export const MobileGradeView: React.FC<MobileGradeViewProps> = ({ onViewReport }) => {
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester)

  const filteredStudents = selectedClassId === 'all'
    ? students
    : students.filter(s => s.classId === selectedClassId);

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '80px' }}>
      {/* Header controls - Single Pill Bar */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '16px', border: '1px solid #E2E8F0', boxShadow: 'var(--shadow-card)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1E3A8A', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileSpreadsheet size={18} /> Bảng Điểm Giáo Lý
        </h3>

        {/* Unified Pill Bar: Class + Semester */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch' }}>
          <button
            onClick={() => setSelectedClassId('all')}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '9999px',
              border: 'none',
              minHeight: '44px',
              background: selectedClassId === 'all' ? '#1E3A8A' : '#E2E8F0',
              color: selectedClassId === 'all' ? 'white' : '#475569',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer'
            }}
          >
            Tất cả lớp
          </button>
          {MOCK_CLASSES.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedClassId(c.id)}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '9999px',
                border: 'none',
                minHeight: '44px',
                background: selectedClassId === c.id ? '#1E3A8A' : '#E2E8F0',
                color: selectedClassId === c.id ? 'white' : '#475569',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer'
              }}
            >
              {c.name}
            </button>
          ))}
          <div style={{ width: '16px', flexShrink: 0 }} />
          <button
            onClick={() => setSelectedSemester(1)}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '9999px',
              border: 'none',
              minHeight: '44px',
              background: selectedSemester === 1 ? '#1E3A8A' : '#E2E8F0',
              color: selectedSemester === 1 ? 'white' : '#475569',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer'
            }}
          >
            HK I
          </button>
          <button
            onClick={() => setSelectedSemester(2)}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '9999px',
              border: 'none',
              minHeight: '44px',
              background: selectedSemester === 2 ? '#1E3A8A' : '#E2E8F0',
              color: selectedSemester === 2 ? 'white' : '#475569',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer'
            }}
          >
            HK II
          </button>
        </div>
      </div>

      {/* Student Grade Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredStudents.map(student => {
          const grade = getStudentGrade(student.id, selectedSemester);
          const avg = calculateStudentAvg(student.id, selectedSemester);
          const cls = MOCK_CLASSES.find(c => c.id === student.classId);

          return (
            <div
              key={student.id}
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E3A8A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ color: '#D97706', marginRight: '6px' }}>{student.holyName}</span>
                    <span>{' '}{student.fullName}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {student.code} • {cls?.name}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E3A8A' }}>
                    {avg.score !== null ? avg.score : '-'}
                  </div>
                  <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                    {avg.label}
                  </span>
                </div>
              </div>

              {/* Grid of Scores */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', textAlign: 'center', background: '#F8FAFC', padding: '8px', borderRadius: '8px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Miệng</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{grade?.scoreOral ?? '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>15P</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{grade?.score15m ?? '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>1Tiết</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{grade?.score1Period ?? '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Giữa Kỳ</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{grade?.scoreMidterm ?? '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#D97706', fontWeight: 700 }}>Cuối Kỳ</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E3A8A' }}>{grade?.scoreFinal ?? '-'}</div>
                </div>
              </div>

              {/* Comment */}
              {grade?.comments && (
                <div style={{ fontSize: '12px', fontStyle: 'italic', color: '#475569', marginBottom: '8px' }}>
                  "{grade.comments}"
                </div>
              )}

              <button 
                onClick={() => onViewReport(student)} 
                className="btn btn-secondary btn-sm"
                style={{ width: '100%' }}
              >
                Xem Phiếu Điểm Chi Tiết
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};