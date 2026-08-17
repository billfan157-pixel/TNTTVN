import React, { useMemo, useState } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { BRANCHES } from '../../constants/branches';
import { useClassStore } from '../../stores/classStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getAcademicYear, checkPromotionEligibility, getSacramentStatus, getNextBranch, getClassIdForBranch } from '../../utils/sacraments';
import { getClassificationLabel, calculateYearlyGpa } from '../../utils/grades';
import { usePromotionStore } from '../../stores/promotionStore';
import { ArrowRight, CheckCircle2, XCircle, ChevronRight, Award, IdCard, Upload, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { ModalShell } from '../common/ModalShell';
import { isAuthenticated } from '../../lib/api';
import type { Student } from '../../types';
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
  // ADR-017 (F1): Ngưỡng xét duyệt lấy từ settings (mặc định 5.0/80) — khớp
  // server DEFAULT_PROMOTION_POLICY. Trước đây client hardcode 70% attendance.
  const promotionPolicy = useSettingsStore(s => s.settings.promotionPolicy);
  // F8 (audit): Ngưỡng xếp loại (Xuất Sắc/Giỏi/…) cũng lấy từ settings — trước
  // đây getClassificationLabel chạy với DEFAULT_GRADE_WEIGHTS (9/8/6.5/5) bất kể
  // parish cấu hình, lệch với bảng điểm DesktopGradeMatrix.
  const gradeWeights = useSettingsStore(s => s.settings.gradeWeights);
  const classList = useClassStore(s => s.getClassList)();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog();
  // ADR-017 (merge store): trạng thái hoàn tất thăng tiến là UI state tập trung
  // trong promotionStore (done/setDone) — panel chỉ đọc. evaluateStudent cũng từ
  // store (evaluationMap + error/lockError); business logic (điều kiện thăng tiến,
  // fallback offline-first, alert khóa sổ) vẫn nằm ở panel/service, KHÔNG trong store.
  const evaluateStudent = usePromotionStore(s => s.evaluateStudent);
  const done = usePromotionStore(s => s.done);
  const setDone = usePromotionStore(s => s.setDone);

  const promotions = useMemo(() => {
    return students
      .filter(s => s.status === 'Đang học')
      .map(s => {
        // ADR-017 (F1+/F4): Điểm trung bình cả năm (TB HK1 + HK2, fallback 1
        // học kỳ) dùng calculateYearlyGpa — làm tròn theo roundingDecimal parish,
        // khớp ngữ nghĩa server evaluate (average các semester GPA).
        const sem1 = calculateStudentAvg(s.id, 1);
        const sem2 = calculateStudentAvg(s.id, 2);
        const avgScore = calculateYearlyGpa(sem1.score, sem2.score, gradeWeights).gpa;
        const avg = avgScore !== null
          ? { score: avgScore, label: getClassificationLabel(avgScore, gradeWeights) }
          : { score: null, label: 'Chưa có' };
        const att = getStudentAttendanceRate(s.id);
        const result = checkPromotionEligibility(s, avgScore, att.rate, 2, promotionPolicy);
        const sac = getSacramentStatus(s);
        return { student: s, avg, att, promotion: result, sacraments: sac };
      })
      .filter(item => item.promotion.canPromote || item.promotion.reasons.length > 0)
      .sort((a, b) => {
        if (a.promotion.canPromote && !b.promotion.canPromote) return -1;
        if (!a.promotion.canPromote && b.promotion.canPromote) return 1;
        return (b.avg.score ?? 0) - (a.avg.score ?? 0);
      });
  }, [students, calculateStudentAvg, getStudentAttendanceRate, promotionPolicy, gradeWeights]);

  const canPromote = promotions.filter(p => p.promotion.canPromote);
  const needsReview = promotions.filter(p => !p.promotion.canPromote);

  const handleExecutePromotion = async () => {
    setPromoting(true)
    const actions: PromotionAction[] = canPromote.map(p => {
      const nextBranch = p.promotion.recommendedBranch || getNextBranch(p.student.branch) || p.student.branch
      const existingClasses = classList.filter(c => c.branch === nextBranch)
      const classId = existingClasses.length > 0 ? existingClasses[0].id : getClassIdForBranch(nextBranch)
      return { studentId: p.student.id, newBranch: nextBranch, newClassId: classId }
    })

    // F1 (audit): Server-side gate khi online. Trước đây batchPromote chỉ sửa
    // branch/classId local rồi sync như UPDATE student bình thường — bỏ qua hoàn
    // toàn PromotionEligibilitySpecification server (SemesterLock HK2 + policy),
    // nên admin có thể thăng tiến cả em chưa đủ điều kiện khi client bị lệch
    // server. Khi online: nhờ server đánh giá lại; có em bị từ chối (chưa khóa
    // HK2 / dưới ngưỡng) thì loại khỏi danh sách. Offline: giữ hành vi cũ.
    let finalActions = actions
    const online = typeof navigator !== 'undefined' && navigator.onLine && isAuthenticated()
    if (online && actions.length > 0) {
      const names = new Map(canPromote.map(p => [p.student.id, `${p.student.holyName} ${p.student.fullName}`]))
      try {
        const results = await Promise.all(
          actions.map(async a => {
            const d = await evaluateStudent(a.studentId, ACADEMIC_YEAR)
            return { action: a, decision: d }
          })
        )
        // Store trả null khi server lỗi/không phản hồi (isEvaluating + error/lockError
        // đã được store cập nhật) → fallback offline-first giữ nguyên hành vi cũ.
        if (results.some(r => r.decision === null)) {
          finalActions = actions
        } else {
          const eligible = results.filter(r => r.decision!.isEligible)
          const rejected = results.filter(r => !r.decision!.isEligible)
          finalActions = eligible.map(r => r.action)

          if (rejected.length > 0) {
            const lockMsg = rejected.find(r =>
              (r.decision!.rejectionReasons ?? (r.decision!.reason ? [r.decision!.reason] : [])).some(x => (x || '').includes('khóa'))
            )
            if (lockMsg && finalActions.length === 0) {
              setPromoting(false)
              await askConfirm({
                title: 'Không thể thăng tiến',
                message:
                  'Học kỳ 2 chưa được khóa sổ điểm.\n' +
                  'Vào trang "Năm Học" → bật khóa Học Kỳ II cho năm học hiện tại trước khi xét lên lớp.',
                confirmText: 'OK',
                variant: 'warning',
                showCancel: false,
              })
              return
            }
            await askConfirm({
              title: 'Kết quả xét duyệt',
              message:
                `${finalActions.length} em được server xác nhận đủ điều kiện và sẽ được thăng tiến.\n\n` +
                `${rejected.length} em bị server từ chối (sẽ chuyển sang "Cần xem xét"):\n` +
                rejected.map(r => {
                  const reasons = (r.decision!.rejectionReasons ?? [r.decision!.reason]).filter(Boolean)
                  return `- ${names.get(r.action.studentId) || r.action.studentId}: ${reasons.join('; ') || 'không đủ điều kiện'}`
                }).join('\n'),
              confirmText: 'OK',
              variant: 'info',
              showCancel: false,
            })
          }
        }
      } catch {
        // Lỗi network / server evaluate thất bại → fallback offline-first
        finalActions = actions
      }
    }

    batchPromote(finalActions)
    setTimeout(() => {
      setPromoting(false)
      setConfirmOpen(false)
      setDone(true)
      setTimeout(() => setDone(false), 4000)
    }, 800)
  }

  if (done) {
    return (
      <div className="bg-surface-card rounded-2xl p-8 border border-surface-border shadow-card text-center">
        <CheckCircle2 size={48} className="mx-auto text-parish-success mb-3" />
        <h3 className="text-lg font-extrabold text-parish-primary">Thăng Tiến Thành Công!</h3>
        <p className="text-sm text-text-muted mt-1">{canPromote.length} em đã được chuyển lên ngành mới.</p>
      </div>
    )
  }

  if (promotions.length === 0) {
    return (
      <div className="bg-surface-card rounded-2xl p-6 border border-surface-border shadow-card">
        <p className="text-text-muted text-sm">Chưa có dữ liệu để đánh giá thăng tiến.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-card rounded-2xl border border-surface-border shadow-card overflow-hidden">
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
            className="btn btn-primary"
          >
            <Upload size={16} />
            Thực Hiện Thăng Tiến ({canPromote.length} em)
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <ModalShell
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={<><AlertTriangle className="w-6 h-6 text-amber-600 inline mr-2" />Xác Nhận Thăng Tiến</>}
          maxWidth="448px"
        >
          <div className="space-y-4">
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
                className="btn btn-ghost"
                disabled={promoting}
              >
                Hủy
              </button>
              <button
                onClick={handleExecutePromotion}
                disabled={promoting}
                className="btn btn-primary disabled:opacity-60"
              >
                {promoting && <Loader2 size={16} className="animate-spin" />}
                {promoting ? 'Đang thực hiện...' : 'Xác Nhận & Thực Hiện'}
              </button>
            </div>
          </div>
        </ModalShell>
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
                    <button onClick={() => onViewPhotoCard(student)} className="btn btn-sm bg-transparent border-0 cursor-pointer p-1 mobile-touch-target" title="Thẻ thiếu nhi">
                      <IdCard size={14} className="text-parish-primary" />
                    </button>
                  )}
                  {onViewCertificate && (
                    <button onClick={() => onViewCertificate(student)} className="btn btn-sm bg-transparent border-0 cursor-pointer p-1 mobile-touch-target" title="Chứng nhận">
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
            {needsReview.map(({ student, avg, promotion }) => (
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
                      ĐTB: {avg.score !== null ? avg.score : '-'}
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

      {confirmDialog}
    </div>
  );
};
