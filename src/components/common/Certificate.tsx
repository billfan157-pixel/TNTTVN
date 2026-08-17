import React from 'react';
import type { Student } from '../../types';
import { useClassStore } from '../../stores/classStore';
import { useAcademicYearStore } from '../../stores/academicYearStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { BRANCHES } from '../../constants/branches';
import { getSacramentStatus } from '../../utils/sacraments';
import { generateCertificateQrSvg, buildCertificateQrPayload } from '../../lib/qr';
import { generateId } from '../../lib/id';
import { generateSacramentCertificateHTML } from '../../utils/pdfGenerator';
import { ReportExportService } from '../../services/reportExportService';
import { Printer, X, Award } from 'lucide-react';

interface CertificateProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  type?: 'completion' | 'promotion';
}

export const Certificate: React.FC<CertificateProps> = ({ isOpen, onClose, student, type = 'completion' }) => {
  const academicYearDisplay = useAcademicYearStore((s) => s.currentYear.replace(/\s*-\s*/g, '-'))
  const parishName = useSettingsStore((s) => s.settings.parishName) || 'Giáo Xứ Gia Tôn'
  const dioceseName = useSettingsStore((s) => s.settings.dioceseName) || 'Giáo Phận Xuân Lộc'
  const findClassById = useClassStore((s) => s.findClassById)

  // Generate unique certificate ID and QR code (hooks LUÔN được gọi trước early-return — rules-of-hooks)
  const certId = React.useMemo(() => generateId('CERT'), [])
  const qrPayload = React.useMemo(() => (student ? buildCertificateQrPayload(certId, student.id, type) : ''), [certId, student, type])
  const qrSvg = React.useMemo(() => (qrPayload ? generateCertificateQrSvg(qrPayload, 4) : ''), [qrPayload])

  if (!isOpen || !student) return null;

  const classInfo = findClassById(student.classId);
  const branch = BRANCHES[student.branch];
  const sacStatus = getSacramentStatus(student);

  const handlePrint = () => {
    const html = generateSacramentCertificateHTML(student, {
      parishName,
      dioceseName,
      academicYear: academicYearDisplay,
    })
    ReportExportService.print(html)
  };

  const isPromotion = type === 'promotion';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-[600px]" onClick={e => e.stopPropagation()}>
        <div className="no-print flex justify-between items-center mb-4 border-b border-surface-border pb-3">
          <span className="text-sm font-bold text-parish-primary">
            {isPromotion ? 'Chứng Nhận Thăng Tiến' : 'Chứng Nhận Hoàn Tất'}
          </span>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              <Printer size={14} /> In
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              <X size={16} /> Đóng
            </button>
          </div>
        </div>

        <div className="border-2 border-parish-primary rounded-2xl p-8 bg-white text-center" style={{ maxWidth: '500px', margin: '0 auto' }}>
          <Award size={48} className="text-parish-primary mx-auto mb-3" />

          <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
            {dioceseName} • {parishName}
          </div>
          <div className="text-lg font-extrabold text-parish-primary mb-1">
            {isPromotion ? 'CHỨNG NHẬN THĂNG TIẾN' : 'CHỨNG NHẬN HOÀN TẤT'}
          </div>
          <div className="w-16 h-0.5 bg-parish-primary mx-auto my-3" />

          <p className="text-sm text-text-muted mb-4">
            {isPromotion
              ? 'Xác nhận em đã hoàn thành chương trình Giáo Lý và đủ điều kiện thăng tiến lên ngành mới.'
              : 'Xác nhận em đã hoàn thành chương trình Giáo Lý năm học.'}
          </p>

          <div className="text-xl font-extrabold text-parish-primary mb-1">
            <span className="text-parish-secondary">{student.holyName}</span> {student.fullName}
          </div>
          <div className="text-sm text-text-muted mb-4">
            Mã số: {student.code}
          </div>

          <div className="flex justify-center gap-4 mb-4">
            <div className="text-center">
              <div className="text-xs text-text-muted">Ngành</div>
              <div className="font-bold" style={{ color: branch?.textColor }}>{branch?.name}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-text-muted">Lớp</div>
              <div className="font-bold text-parish-primary">{classInfo?.name}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-text-muted">Niên học</div>
              <div className="font-bold">{academicYearDisplay}</div>
            </div>
          </div>

          {isPromotion && (
            <div className="bg-parish-success-bg rounded-xl p-3 mb-4">
              <div className="text-xs font-bold text-parish-success">Điều kiện đạt</div>
              <div className="text-sm font-bold">Điểm TB ≥ 5.0 • Chuyên cần ≥ 70%</div>
            </div>
          )}

          {sacStatus.baptism.done && (
            <div className="text-xs text-text-muted mb-1">
              Rửa Tội: {sacStatus.baptism.date}
              {sacStatus.firstCommunion.done && ` • Rước Lễ LĐ: ${sacStatus.firstCommunion.date}`}
              {sacStatus.confirmation.done && ` • Thêm Sức: ${sacStatus.confirmation.date}`}
            </div>
          )}

          {/* QR Code for verification */}
          <div className="print-only mt-4 mb-4 flex flex-col items-center gap-2">
            <div className="text-xs text-text-muted">Mã xác thực chứng chỉ</div>
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} style={{ width: '80px', height: '80px' }} />
            <div className="text-[10px] font-mono text-text-muted">{certId}</div>
          </div>

          <div className="grid grid-cols-3 text-center text-xs text-text-muted mt-6 pt-4 border-t border-surface-border">
            <div>
              <div className="font-bold text-text-main mb-6">Phụ Huynh</div>
              <div>(Ký, ghi rõ họ tên)</div>
            </div>
            <div>
              <div className="font-bold text-text-main mb-6">Huynh Trưởng CN</div>
              <div>{classInfo?.catechistLeader}</div>
            </div>
            <div>
              <div className="font-bold text-text-main mb-6">Trưởng Ban GL</div>
              <div>Linh mục Tuyên Úy</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
