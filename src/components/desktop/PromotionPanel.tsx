import React, { useMemo, useState } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { BRANCHES } from '../../data/mockParishData';
import { useClassStore } from '../../stores/classStore';
import { getAcademicYear, checkPromotionEligibility, getSacramentStatus, getNextBranch, getClassIdForBranch } from '../../utils/sacraments';
import { ArrowRight, CheckCircle2, XCircle, ChevronRight, Award, IdCard, Upload, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { Student, Role } from '../../types';
import type { PromotionAction } from '../../stores/studentStore';

const ACADEMIC_YEAR = getAcademicYear();

interface PromotionPanelProps {
  onViewPhotoCard?: (student: Student) => void;
  onViewCertificate?: (student: Student) => void;
}

export const PromotionPanel: React.FC<PromotionPanelProps> = ({ onViewPhotoCard, onViewCertificate }) => {
  const { can } = useAuth();
  const canPromoteAction = can('admin', 'chunhiem');
  const students = useStudentStore(s => s.students);
  const batchPromote = useStudentStore(s => s.batchPromote);
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg);
  const getStudentAttendanceRate = useAttendanceStore(s => s.getStudentAttendanceRate);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [done, setDone] = useState(false);

  const promotions = useMemo(() => {
    return students
      .filter(s => s.status === 'Đang học')
      .map(s => {
        const avg = calculateStudentAvg(s.id, 2);
        const att = getStudentAttendanceRate(s.id);
        const result = checkPromotionEligibility(s, avg.score, att.rate, 2);
        const sac = getSacramentStatus(s);
        return { student: s, avg, att, promotion: result, sacraments: sac };
      })
      .filter(item => item.promotion.canPromote || item.promotion.reasons.length > 0)
      .sort((a, b) => {
        if (a.promotion.canPromote && !b.promotion.canPromote) return -1;
        if (!a.promotion.canPromote && b.promotion.canPromote) return 1;
        return (b.avg.score ?? 0) - (a.avg.score ?? 0);
      });
  }, [students, calculateStudentAvg, getStudentAttendanceRate]);

  const canPromote = promotions.filter(p => p.promotion.canPromote);
  const needsReview = promotions.filter(p => !p.promotion.canPromote);

  const handleExecutePromotion = () => {
    setPromoting(true)
    const actions: PromotionAction[] = canPromote.map(p => {
      const nextBranch = p.promotion.recommendedBranch || getNextBranch(p.student.branch) || p.student.branch
      const existingClasses = useClassStore.getState().getClassList().filter(c => c.branch === nextBranch)
      const classId = existingClasses.length > 0 ? existingClasses[0].id : getClassIdForBranch(nextBranch)
      return { studentId: p.student.id, newBranch: nextBranch, newClassId: classId }
    })
    batchPromote(actions)
    setTimeout(() => {
      setPromoting(false)
      setConfirmOpen(false)
      setDone(true)
      setTimeout(() => setDone(false), 4000)
    }, 800)
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-surface-border shadow-card text-center">
        <CheckCircle2 size={48} className="mx-auto text-parish-success mb-3" />
        <h3 className="text-lg font-extrabold text-parish-primary">Thăng Tiến Thành Công!</h3>
        <p className="text-sm text-text-muted mt-1">{canPromote.length} em đã được chuyển lên ngành mới.</p>
      </div>
    )
  }

  if (promotions.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-surface-border shadow-card">
        <p className="text-text-muted text-sm">Chưa có dữ liệu để đánh giá thăng tiến.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-surface-border shadow-card overflow-hidden">
      <div className="p-5 border-b border-surface-border flex justify-between items-center">
        <div>
          <h3 className="text-base font-extrabold text-parish-primary m-0">
            Đánh Giá Thăng Tiến — {ACADEMIC_YEAR}
          </h3>
          <p className="text-xs text-text-muted mt-1 m-0">
            {canPromote.length} em đủ điều kiện • {needsReview.length} em cần xem xét
          </p>
        </div>
        {canPromoteAction && canPromote.length > 0 && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-parish-primary hover:bg-parish-primary-hover text-white text-sm font-bold rounded-xl shadow-xs transition-colors"
          >
            <Upload size={16} />
            Thực Hiện Thăng Tiến ({canPromote.length} em)
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-surface-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-lg font-bold text-text-main">Xác Nhận Thăng Tiến</h2>
            </div>
            <p className="text-sm text-text-muted">
              Bạn sắp thăng tiến <strong>{canPromote.length} em</strong> lên ngành mới. Hành động này sẽ thay đổi
              <strong> Ngành (Branch)</strong> và <strong>Lớp học (ClassId)</strong> của các em.
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {canPromote.map(p => (
                <div key={p.student.id} className="text-xs p-2 rounded-lg bg-surface-hover flex justify-between">
                  <span className="font-semibold">{p.student.holyName} {p.student.fullName}</span>
                  <span className="text-parish-primary font-bold">
                    {BRANCHES[p.student.branch]?.name} → {BRANCHES[p.promotion.recommendedBranch || '']?.name || p.promotion.recommendedBranch}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover rounded-lg"
                disabled={promoting}
              >
                Hủy
              </button>
              <button
                onClick={handleExecutePromotion}
                disabled={promoting}
                className="px-5 py-2 text-sm font-semibold text-white bg-parish-primary hover:bg-parish-primary-hover rounded-lg shadow-xs flex items-center gap-2 disabled:opacity-60"
              >
                {promoting && <Loader2 size={16} className="animate-spin" />}
                {promoting ? 'Đang thực hiện...' : 'Xác Nhận & Thực Hiện'}
              </button>
            </div>
          </div>
        </div>
      )}

      {canPromote.length > 0 && (
        <div className="p-4">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-parish-success mb-3 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Đủ điều kiện thăng tiến
          </h4>
          <div className="flex flex-col gap-2">
            {canPromote.map(({ student, promotion }) => (
              <div key={student.id} className="flex items-center gap-3 p-3 rounded-xl bg-parish-success-bg/30 border border-parish-success/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-text-main truncate">
                    {student.holyName} {student.fullName}
                  </div>
                  <div className="text-xs text-text-muted flex items-center gap-2 mt-0.5">
                    <span className="badge shrink-0" style={{ background: BRANCHES[student.branch]?.badgeBg, color: BRANCHES[student.branch]?.textColor }}>
                      {BRANCHES[student.branch]?.name}
                    </span>
                    {promotion.recommendedBranch && (
                      <>
                        <ArrowRight size={12} className="text-text-muted" />
                        <span className="badge shrink-0" style={{ background: BRANCHES[promotion.recommendedBranch]?.badgeBg, color: BRANCHES[promotion.recommendedBranch]?.textColor }}>
                          {BRANCHES[promotion.recommendedBranch]?.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onViewPhotoCard && (
                    <button onClick={() => onViewPhotoCard(student)} className="btn btn-sm bg-transparent border-0 cursor-pointer p-1" title="Thẻ thiếu nhi">
                      <IdCard size={14} className="text-parish-primary" />
                    </button>
                  )}
                  {onViewCertificate && (
                    <button onClick={() => onViewCertificate(student)} className="btn btn-sm bg-transparent border-0 cursor-pointer p-1" title="Chứng nhận">
                      <Award size={14} className="text-parish-secondary" />
                    </button>
                  )}
                </div>
                <ChevronRight size={16} className="text-parish-success shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {needsReview.length > 0 && (
        <div className="p-4 border-t border-surface-border">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-600 mb-3 flex items-center gap-1.5">
            <XCircle size={14} /> Cần xem xét
          </h4>
          <div className="flex flex-col gap-2">
            {needsReview.map(({ student, promotion }) => (
              <div key={student.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-text-main truncate">
                    {student.holyName} {student.fullName}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                    <span className="badge shrink-0" style={{ background: BRANCHES[student.branch]?.badgeBg, color: BRANCHES[student.branch]?.textColor }}>
                      {BRANCHES[student.branch]?.name}
                    </span>
                    <span className="font-semibold text-parish-secondary">
                      ĐTB: {promotion.recommendedBranch || '-'}
                    </span>
                  </div>
                  {promotion.reasons.length > 0 && (
                    <div className="text-xs text-red-600 mt-1">
                      {promotion.reasons.map((r, i) => (
                        <div key={i}>• {r}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
