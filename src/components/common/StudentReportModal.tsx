import React from 'react';
import { Student } from '../../types';
import { useGradeStore } from '../../stores/gradeStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { useClassStore } from '../../stores/classStore';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { generateStudentReportCardHTML } from '../../utils/pdfGenerator';
import { ReportViewModelFactory } from '../../utils/reportViewModelFactory';
import { ReportExportService } from '../../services/reportExportService';
import { BRANCHES } from '../../constants/branches';
import { X, Printer, Award, Church, BookOpen, HeartHandshake, CheckSquare } from 'lucide-react';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import { ModalPortal } from './ModalPortal';

interface StudentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  autoPrint?: boolean;
}

export const StudentReportModal: React.FC<StudentReportModalProps> = ({ isOpen, onClose, student, autoPrint = false }) => {
  const academicYear = useAcademicYearStore(s => s.currentYear)
  const parishName = useSettingsStore(s => s.settings.parishName) || 'Giáo Xứ Gia Tôn'
  const dioceseName = useSettingsStore(s => s.settings.dioceseName) || 'Giáo Phận Xuân Lộc'
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const records = useGradeStore(s => s.grades)
  const attendanceRecords = useAttendanceStore(s => s.attendance)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
  const findClassById = useClassStore(s => s.findClassById)

  // B2 consolidation: in qua template chuẩn (pdfGenerator) + ReportExportService —
  // cùng pipeline với PrintReportModal "Phiếu Cá Nhân" (thay window.print phụ thuộc @media print).
  const buildPrintHtml = React.useCallback((s: Student) => {
    return generateStudentReportCardHTML(s, records, attendanceRecords, {
      academicYear: academicYear || undefined,
      parishName,
      dioceseName,
    })
  }, [records, attendanceRecords, academicYear, parishName, dioceseName]);

  const handlePrint = () => {
    if (student) ReportExportService.print(buildPrintHtml(student))
  };

  const printedRef = React.useRef(false);
  const { dialogRef: trapRef, titleId } = useAccessibleDialog(isOpen && !!student, onClose);

  React.useEffect(() => {
    if (!isOpen) {
      printedRef.current = false;
      return;
    }
    if (!autoPrint || !student || printedRef.current) return;
    printedRef.current = true;
    const timer = window.setTimeout(() => ReportExportService.print(buildPrintHtml(student)), 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, autoPrint, student, buildPrintHtml]);

  if (!isOpen || !student) return null;

  const vm = ReportViewModelFactory.createStudentViewModel(student, records, attendanceRecords, {
    academicYear: academicYear || undefined,
    parishName,
    dioceseName,
  });
  const attDetails = vm.summary.attendanceDetails;

  const classInfo = findClassById(student.classId);
  const branch = BRANCHES[student.branch];

  const gradeHK1 = getStudentGrade(student.id, 1);
  const gradeHK2 = getStudentGrade(student.id, 2);

  const avgHK1 = calculateStudentAvg(student.id, 1);
  const avgHK2 = calculateStudentAvg(student.id, 2);

  return (
    <ModalPortal>
    <div className="modal-overlay app-modal-layer" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div
        ref={trapRef}
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '750px', background: '#FFF' }}
      >
        {/* Header Control buttons (Hidden when printing) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <span id={titleId} style={{ fontSize: '14px', fontWeight: 700, color: '#1E3A8A' }}>Phiếu Kết Quả Học Tập Thiếu Nhi</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              <Printer size={14} /> In Kết Quả Học Tập
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
              {dioceseName.toUpperCase()} • {parishName.toUpperCase()}
            </h4>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1E3A8A', margin: '4px 0 2px 0', letterSpacing: '-0.2px' }}>
              PHIẾU KẾT QUẢ HỌC TẬP & RÈN LUYỆN THÁNH THỂ
            </h2>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#D97706', margin: 0 }}>
              Niên Học: {academicYear}
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
              <Award size={16} /> Bảng Kết Quả Học Tập Chi Tiết Các Học Kỳ
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
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }} scope="col">Học Kỳ</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }} scope="col">Miệng</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }} scope="col">15 Phút</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }} scope="col">1 Tiết</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }} scope="col">Giữa Kỳ</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }} scope="col">Cuối Kỳ</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }} scope="col">TB</th>
                    <th style={{ padding: '10px 12px', border: '1px solid #CBD5E1' }} scope="col">Xếp Loại</th>
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

          {/* Attendance Breakdown (3 Pillars) */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1E3A8A', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckSquare size={16} /> Chi Tiết Chuyên Cần & Sinh Hoạt
              </h4>
              <span style={{ fontSize: '13px', fontWeight: 800, color: (attDetails?.rate ?? 100) >= 80 ? '#16A34A' : '#DC2626' }}>
                Tổng tỷ lệ: {attDetails?.rate ?? 100}% ({attDetails?.presentCount ?? 0}/{attDetails?.totalCount ?? 0} buổi đi • vắng {attDetails?.absentCount ?? 0})
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {/* Thánh Lễ */}
              <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0', borderLeft: '4px solid #3B82F6' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A8A', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <Church size={14} /> Thánh Lễ Chúa Nhật
                </div>
                <div style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>
                  <span style={{ color: '#16A34A' }}>{attDetails?.sundayMass.present ?? 0} buổi đi</span>
                  <span style={{ color: '#64748B', margin: '0 4px' }}>•</span>
                  <span style={{ color: (attDetails?.sundayMass.absent ?? 0) > 0 ? '#DC2626' : '#64748B' }}>{attDetails?.sundayMass.absent ?? 0} vắng</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Tổng số: {attDetails?.sundayMass.total ?? 0} buổi lễ
                </div>
              </div>

              {/* Học Giáo Lý */}
              <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0', borderLeft: '4px solid #10B981' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#047857', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <BookOpen size={14} /> Giờ Học Giáo Lý
                </div>
                <div style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>
                  <span style={{ color: '#16A34A' }}>{attDetails?.catechism.present ?? 0} buổi đi</span>
                  <span style={{ color: '#64748B', margin: '0 4px' }}>•</span>
                  <span style={{ color: (attDetails?.catechism.absent ?? 0) > 0 ? '#DC2626' : '#64748B' }}>{attDetails?.catechism.absent ?? 0} vắng</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Tổng số: {attDetails?.catechism.total ?? 0} buổi học
                </div>
              </div>

              {/* Chầu & Sinh Hoạt */}
              <div style={{ background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0', borderLeft: '4px solid #F59E0B' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#B45309', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <HeartHandshake size={14} /> Chầu & Sinh Hoạt
                </div>
                <div style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>
                  <span style={{ color: '#16A34A' }}>{attDetails?.adoration.present ?? 0} buổi đi</span>
                  <span style={{ color: '#64748B', margin: '0 4px' }}>•</span>
                  <span style={{ color: (attDetails?.adoration.absent ?? 0) > 0 ? '#DC2626' : '#64748B' }}>{attDetails?.adoration.absent ?? 0} vắng</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Tổng số: {attDetails?.adoration.total ?? 0} buổi
                </div>
              </div>
            </div>
          </div>

          {/* Conduct & Teacher Comment */}
          <div style={{ background: 'white', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A8A', marginBottom: '4px' }}>
              Nhận Xét Của Huynh Trưởng Chủ Nhiệm
            </div>
            <div style={{ fontSize: '13px', fontStyle: 'italic', color: '#475569', lineHeight: '1.5' }}>
              "{gradeHK1?.comments || gradeHK2?.comments || 'Em ngoan ngoãn, lắng nghe Lời Chúa và hăng hái tham gia sinh hoạt cùng các bạn trong đội.'}"
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
    </ModalPortal>
  );
};
