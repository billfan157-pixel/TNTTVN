import React from 'react';
import { Student } from '../../types';
import { useGradeStore } from '../../stores/gradeStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { MOCK_CLASSES, BRANCHES } from '../../data/mockParishData';
import { X, Printer, Award } from 'lucide-react';

const ACADEMIC_YEAR = '2025 - 2026';

interface StudentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
}

export const StudentReportModal: React.FC<StudentReportModalProps> = ({ isOpen, onClose, student }) => {
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const getStudentAttendanceRate = useAttendanceStore(s => s.getStudentAttendanceRate)

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !student) return null;

  const classInfo = MOCK_CLASSES.find(c => c.id === student.classId);
  const branch = BRANCHES[student.branch];

  const gradeHK1 = getStudentGrade(student.id, 1);
  const gradeHK2 = getStudentGrade(student.id, 2);

  const avgHK1 = calculateStudentAvg(student.id, 1);
  const avgHK2 = calculateStudentAvg(student.id, 2);

  const attendance = getStudentAttendanceRate(student.id);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth: '750px', background: '#FFF' }}
      >
        {/* Header Control buttons (Hidden when printing) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E3A8A' }}>Phiếu Liên Lạc Học Tập Thiếu Nhi</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              <Printer size={14} /> In Phiếu Điểm
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              <X size={16} /> Đóng
            </button>
          </div>
        </div>

        {/* PRINTABLE REPORT CARD CONTAINER */}
        <div style={{ padding: '20px', border: '2px solid #1E3A8A', borderRadius: '16px', background: '#FAFAFA' }}>
          {/* Parish Header */}
          <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px dashed #CBD5E1', paddingBottom: '12px' }}>
            <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748B', margin: 0, fontWeight: 700 }}>
              GIÁO PHẬN • GIÁO XỨ THÁNH GIA
            </h4>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1E3A8A', margin: '4px 0 2px 0', letterSpacing: '-0.2px' }}>
              PHIẾU HỌC TẬP & KẾT QUẢ RỪNG BIỂN THÁNH THỂ
            </h2>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#D97706', margin: 0 }}>
              Niên Học: {ACADEMIC_YEAR}
            </p>
          </div>

          {/* Student Info Card */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E3A8A' }}>
                <span style={{ color: '#D97706', marginRight: '6px' }}>{student.holyName}</span>
                <span>{' '}{student.fullName}</span>
              </div>
              <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '6px', fontWeight: 500 }}>
                Mã Thiếu Nhi: <strong>{student.code}</strong> • Giới tính: {student.gender}
              </div>
              <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px', fontWeight: 500 }}>
                Ngày sinh: {student.dateOfBirth || 'Chưa cập nhật'}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge" style={{ background: branch?.badgeBg, color: branch?.textColor }}>
                  Ngành {branch?.name}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E3A8A' }}>
                  {classInfo?.name}
                </span>
              </div>
              <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '6px', fontWeight: 500 }}>
                Huynh Trưởng CN: <strong>{classInfo?.catechistLeader}</strong>
              </div>
              <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px', fontWeight: 500 }}>
                Phụ huynh: {student.parentName} ({student.parentPhone})
              </div>
            </div>
          </div>

          {/* Score Table */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1E3A8A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Award size={16} /> Bảng Điểm Chi Tiết Các Học Kỳ
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', fontSize: '13px', textAlign: 'center', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '11%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#1E3A8A', color: 'white' }}>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>Học Kỳ</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>Miệng</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>15 Phút</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>1 Tiết</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>Giữa Kỳ</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>Cuối Kỳ</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>TB</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>Xếp Loại</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1', fontWeight: 600 }}>HK I</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK1?.scoreOral ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK1?.score15m ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK1?.score1Period ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK1?.scoreMidterm ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK1?.scoreFinal ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1', fontWeight: 700, color: '#1E3A8A' }}>
                      {avgHK1.score !== null ? avgHK1.score : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>
                      <span className="badge badge-primary">{avgHK1.label}</span>
                    </td>
                  </tr>

                  <tr>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1', fontWeight: 600 }}>HK II</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK2?.scoreOral ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK2?.score15m ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK2?.score1Period ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK2?.scoreMidterm ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>{gradeHK2?.scoreFinal ?? '-'}</td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1', fontWeight: 700, color: '#1E3A8A' }}>
                      {avgHK2.score !== null ? avgHK2.score : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }}>
                      <span className="badge badge-primary">{avgHK2.label}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Attendance & Conduct */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#16A34A', marginBottom: '4px' }}>
                Tình hình Chuyên Cần & Sinh Hoạt
              </div>
              <div style={{ fontSize: '13px', color: '#334155' }}>
                • Tỷ lệ tham dự: <strong>{attendance.rate}%</strong> ({attendance.presentCount}/{attendance.totalCount} buổi)
              </div>
              <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px' }}>
                • Ý thức đi lễ & sinh hoạt: Ngoan ngoãn, sốt sắng.
              </div>
            </div>

            <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A8A', marginBottom: '4px' }}>
                Nhận Xét Của Huynh Trưởng Chủ Nhiệm
              </div>
              <div style={{ fontSize: '13px', fontStyle: 'italic', color: '#475569' }}>
                "{gradeHK1?.comments || gradeHK2?.comments || 'Em ngoan ngoãn, lắng nghe Lời Chúa và hăng hái tham gia sinh hoạt cùng các bạn trong đội.'}"
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', marginTop: '30px', fontSize: '12px', color: '#475569' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#0F172A', marginBottom: '40px' }}>XÁC NHẬN PHỤ HUYNH</p>
              <p>(Ký & ghi rõ họ tên)</p>
            </div>
            <div>
              <p style={{ fontWeight: 600, color: '#0F172A', marginBottom: '40px' }}>HUYNH TRƯỞNG CHỦ NHIỆM</p>
              <p style={{ fontWeight: 600, color: '#1E3A8A' }}>{classInfo?.catechistLeader}</p>
            </div>
            <div>
              <p style={{ fontWeight: 600, color: '#0F172A', marginBottom: '40px' }}>TRƯỞNG BAN GIÁO LÝ</p>
              <p style={{ fontWeight: 600, color: '#1E3A8A' }}>Linh mục Tuyên Úy</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
