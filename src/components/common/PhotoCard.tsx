import React from 'react';
import type { Student } from '../../types';
import { useClassStore } from '../../stores/classStore';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { BRANCHES } from '../../constants/branches';
import { getSacramentStatus, getAge } from '../../utils/sacraments';
import { generatePhotoCardHTML } from '../../utils/pdfGenerator';
import { ReportExportService } from '../../services/reportExportService';
import { Printer, X } from 'lucide-react';

interface PhotoCardProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ isOpen, onClose, student }) => {
  const academicYearDisplay = useAcademicYearStore((s) => s.currentYear)
  const parishName = useSettingsStore((s) => s.settings.parishName) || 'Giáo Xứ Gia Tôn'
  const findClassById = useClassStore((s) => s.findClassById)
  if (!isOpen || !student) return null;

  const classInfo = findClassById(student.classId);
  const branch = BRANCHES[student.branch];
  const sacStatus = getSacramentStatus(student);
  const age = getAge(student.dateOfBirth);

  const handlePrint = () => {
    const html = generatePhotoCardHTML(student, {
      parishName,
      academicYear: academicYearDisplay,
    })
    ReportExportService.print(html)
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-[400px]" onClick={e => e.stopPropagation()}>
        <div className="no-print flex justify-between items-center mb-4 border-b border-surface-border pb-3">
          <span className="text-sm font-bold text-parish-primary">Thẻ Thiếu Nhi</span>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              <Printer size={14} /> In
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              <X size={16} /> Đóng
            </button>
          </div>
        </div>

        <div className="border-2 border-parish-primary rounded-2xl p-6 bg-white" style={{ maxWidth: '350px', margin: '0 auto' }}>
          <div className="text-center mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-text-muted">{parishName}</div>
            <div className="text-base font-extrabold text-parish-primary">Thiếu Nhi Thánh Thể</div>
            <div className="w-16 h-0.5 bg-parish-primary mx-auto my-2" />
          </div>

          <div className="flex flex-col items-center gap-2 mb-4">
            <div className="w-20 h-20 rounded-full bg-parish-primary-light flex items-center justify-center text-2xl font-black text-parish-primary border-2 border-parish-primary">
              {student.holyName.charAt(0)}
            </div>
            <div className="text-center">
              <div className="text-lg font-extrabold text-text-main">
                <span className="text-parish-secondary">{student.holyName}</span> {student.fullName}
              </div>
              <div className="text-xs text-text-muted">Mã số: {student.code}</div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-sm border-t border-surface-border pt-3">
            <div className="flex justify-between">
              <span className="text-text-muted">Ngành</span>
              <span className="font-bold" style={{ color: branch?.textColor }}>{branch?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Lớp</span>
              <span className="font-bold text-parish-primary">{classInfo?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Tuổi</span>
              <span className="font-bold">{age}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Phụ huynh</span>
              <span className="font-bold">{student.parentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">SĐT</span>
              <span className="font-bold">{student.parentPhone}</span>
            </div>
          </div>

          <div className="border-t border-surface-border mt-3 pt-3">
            <div className="text-xs font-bold text-text-muted mb-1">Hành Trình Bí Tích</div>
            {sacStatus.baptism.done && <div className="text-xs">✅ Rửa Tội: {sacStatus.baptism.date}</div>}
            {sacStatus.firstCommunion.done && <div className="text-xs">✅ Rước Lễ LĐ: {sacStatus.firstCommunion.date}</div>}
            {sacStatus.confirmation.done && <div className="text-xs">✅ Thêm Sức: {sacStatus.confirmation.date}</div>}
          </div>

          <div className="text-center text-xs text-text-muted mt-4 pt-3 border-t border-surface-border">
            Niên học {academicYearDisplay}
          </div>
        </div>
      </div>
    </div>
  );
};
