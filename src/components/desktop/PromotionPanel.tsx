import React, { useMemo, useState } from 'react';
import { useStudentStore } from '../../stores/studentStore';
import { useGradeStore } from '../../stores/gradeStore';
import { useAttendanceStore } from '../../stores/attendanceStore';
import { BRANCHES } from '../../constants/branches';
import { useClassStore } from '../../stores/classStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getAcademicYear, checkPromotionEligibility, computeNextClassForStudent, getSacramentStatus, getClassIdForBranch } from '../../utils/sacraments';
import type { BranchType } from '../../types';
import { getClassificationLabel, calculateYearlyGpa } from '../../utils/grades';
import { usePromotionStore } from '../../stores/promotionStore';
import type { ApprovePromotionPayload } from '../../lib/api/promotion';
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
  const applyLocalPromotions = useStudentStore(s => s.applyLocalPromotions);
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
  const batchApproveStudents = usePromotionStore(s => s.batchApproveStudents);
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
        // PROMO-FIX (2026-08-22): lớp đích = cùng ngành khối +1 (giữ hậu tố khi có),
        // chỉ chuyển ngành khi hết cấp — thay cho logic "ngành kế tiếp + lớp đầu tiên".
        const nextClass = computeNextClassForStudent(s, classList as any);
        const targetClass = nextClass.classId ? classList.find(c => c.id === nextClass.classId) : undefined;
        return { student: s, avg, att, promotion: result, sacraments: sac, nextClass, targetClass };
      })
      .filter(item => item.promotion.canPromote || item.promotion.reasons.length > 0)
      .sort((a, b) => {
        if (a.promotion.canPromote && !b.promotion.canPromote) return -1;
        if (!a.promotion.canPromote && b.promotion.canPromote) return 1;
        return (b.avg.score ?? 0) - (a.avg.score ?? 0);
      });
  }, [students, calculateStudentAvg, getStudentAttendanceRate, promotionPolicy, gradeWeights, classList]);

  const canPromote = promotions.filter(p => p.promotion.canPromote);
  const needsReview = promotions.filter(p => !p.promotion.canPromote);

  const handleExecutePromotion = async () => {
    setPromoting(true)
    // PROMO-FIX (2026-08-22): dùng suggestion chuẩn (cùng ngành khối+1 → giữ hậu
    // tố; chỉ sang ngành kế khi hết cấp). hasRealClass=false → loại khỏi batch,
    // báo admin tạo lớp — như cơ chế F1 cũ.
    const actions: { action: PromotionAction; hasRealClass: boolean; student: Student }[] = canPromote.map(p => {
      const targetBranch: BranchType = (p.nextClass.nextBranch ?? p.student.branch) as BranchType
      const fallbackId = getClassIdForBranch(targetBranch)
      return {
        action: {
          studentId: p.student.id,
          newBranch: targetBranch,
          newClassId: p.nextClass.classId ?? fallbackId,
        },
        hasRealClass: Boolean(p.nextClass.classId),
        student: p.student,
      }
    })

    // F1 (audit): Server-side gate khi online. Trước đây batchPromote chỉ sửa
    // branch/classId local rồi sync như UPDATE student bình thường — bỏ qua hoàn
    // toàn PromotionEligibilitySpecification server (SemesterLock HK2 + policy),
    // nên admin có thể thăng tiến cả em chưa đủ điều kiện khi client bị lệch
    // server, và KHÔNG sinh promotion_records (vi phạm SSOT BUSINESS_RULES §1.1).
    // Khi online: duyệt qua POST /promotion/batch-approve — server tự đánh giá
    // lại, sinh snapshot và chuyển lớp/ngành trong cùng transaction. Offline:
    // giữ hành vi cũ qua hàng đợi sync (hạn chế đã ghi nhận — xem ADR-052).
    const online = typeof navigator !== 'undefined' && navigator.onLine && isAuthenticated()
    if (online && actions.length > 0) {
      const names = new Map(actions.map(a => [a.action.studentId, `${a.student.holyName} ${a.student.fullName}`]))
      try {
        const results = await Promise.all(
          actions.map(async a => ({
            ...a,
            decision: await evaluateStudent(a.action.studentId, ACADEMIC_YEAR),
          }))
        )
        // Server không xác thực được → DỪNG, không duyệt mù (trước đây fallback
        // duyệt TẤT CẢ khi decision null / exception — lỗ hổng F1).
        if (results.some(r => r.decision === null)) {
          setPromoting(false)
          await askConfirm({
            title: 'Không thể xét lên lớp',
            message:
              'Không lấy được kết quả đánh giá từ máy chủ cho một số học sinh.\n' +
              'Vui lòng kiểm tra kết nối và thử lại. Hệ thống không thực hiện thăng tiến khi chưa được máy chủ xác nhận.',
            confirmText: 'OK',
            variant: 'warning',
            showCancel: false,
          })
          return
        }

        const eligible = results.filter(r => r.decision!.isEligible)
        const rejected = results.filter(r => !r.decision!.isEligible)

        const lockMsg = rejected.find(r =>
          (r.decision!.rejectionReasons ?? (r.decision!.reason ? [r.decision!.reason] : [])).some(x => (x || '').includes('khóa'))
        )
        if (lockMsg && eligible.length === 0) {
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

        // Không có lớp thật cho ngành kế tiếp → loại khỏi batch, báo rõ thay vì
        // gửi id không tồn tại để rồi fail im lặng trong hàng đợi sync.
        const noClass = eligible.filter(r => !r.hasRealClass)
        const approvable = eligible.filter(r => r.hasRealClass)

        let batchErrorCount = 0
        if (approvable.length > 0) {
          const items: ApprovePromotionPayload[] = approvable.map(r => ({
            studentId: r.action.studentId,
            academicYear: ACADEMIC_YEAR,
            targetClassId: r.student.classId,
            nextClassId: r.action.newClassId,
            newBranch: r.action.newBranch as ApprovePromotionPayload['newBranch'],
            gpa: r.decision!.gpa,
            attendanceRate: r.decision!.attendanceRate,
          }))
          const result = await batchApproveStudents(items)
          if (!result) {
            setPromoting(false)
            return
          }
          const okIds = new Set(
            result.results.filter(x => x.status === 'saved' || x.status === 'skipped').map(x => x.studentId)
          )
          applyLocalPromotions(approvable.filter(r => okIds.has(r.action.studentId)).map(r => r.action))
          batchErrorCount = result.errorCount
        }

        setPromoting(false)
        await askConfirm({
          title: 'Kết quả xét duyệt',
          message:
            `${approvable.length} em đã được máy chủ phê duyệt và chuyển ngành/lớp (có snapshot promotion_records).\n` +
            (rejected.length > 0 ? `${rejected.length} em bị máy chủ từ chối:\n` + rejected.map(r => {
              const reasons = (r.decision!.rejectionReasons ?? [r.decision!.reason]).filter(Boolean)
              return `- ${names.get(r.action.studentId) || r.action.studentId}: ${reasons.join('; ') || 'không đủ điều kiện'}`
            }).join('\n') + '\n' : '') +
            (noClass.length > 0 ? `\n${noClass.length} em đủ điều kiện nhưng CHƯA có lớp cho ngành "${noClass[0].action.newBranch}" — hãy tạo lớp trước rồi xét lại:\n` + noClass.map(r => `- ${names.get(r.action.studentId) || r.action.studentId}`).join('\n') + '\n' : '') +
            (batchErrorCount > 0 ? `\n${batchErrorCount} em lỗi khi lưu trên máy chủ (xem Nhật Ký Hệ Thống).` : ''),
          confirmText: 'OK',
          variant: rejected.length > 0 || noClass.length > 0 || batchErrorCount > 0 ? 'warning' : 'info',
          showCancel: false,
        })
        setTimeout(() => {
          setConfirmOpen(false)
          setDone(true)
          setTimeout(() => setDone(false), 4000)
        }, 100)
        return
      } catch {
        // Lỗi network giữa chừng evaluate/batch → DỪNG an toàn (không duyệt mù).
        setPromoting(false)
        await askConfirm({
          title: 'Không thể xét lên lớp',
          message: 'Có lỗi khi kết nối máy chủ. Hệ thống không thực hiện thăng tiến khi offline gate không xác nhận được.',
          confirmText: 'OK',
          variant: 'warning',
          showCancel: false,
        })
        return
      }
    }

    // OFFLINE fallback (giữ nguyên hành vi cũ): client tự tính điều kiện, ghi vào
    // hàng đợi sync — server sẽ từ chối lúc sync nếu vi phạm lock/policy.
    batchPromote(actions.map(a => a.action))
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
    <div className="app-panel overflow-hidden">
      <div className="p-5 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            className="btn btn-primary w-full sm:w-auto min-h-[44px] justify-center text-xs font-bold flex items-center gap-1.5"
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
              {canPromote.map(p => {
                const curName = classList.find(c => c.id === p.student.classId)?.name || BRANCHES[p.student.branch]?.name
                const tgtName = p.targetClass?.name || '— chưa có lớp đích —'
                return (
                  <div key={p.student.id} className="text-xs p-2 rounded-lg bg-surface-hover flex justify-between gap-2">
                    <span className="font-semibold">{p.student.holyName} {p.student.fullName}</span>
                    <span className="text-parish-primary font-bold text-right">
                      {curName} → {tgtName}
                    </span>
                  </div>
                )
              })}
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
            {canPromote.map(({ student, nextClass, targetClass }) => (
              <div key={student.id} className="flex items-center gap-3 p-3 rounded-xl bg-parish-success-bg/30 border border-parish-success/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-text-main truncate">
                    {student.holyName} {student.fullName}
                  </div>
                  <div className="text-xs text-text-muted flex items-center gap-2 mt-0.5">
                    <span className="badge shrink-0" style={{ background: BRANCHES[student.branch]?.badgeBg, color: BRANCHES[student.branch]?.textColor }}>
                      {BRANCHES[student.branch]?.name}
                    </span>
                    <ArrowRight size={12} className="text-text-muted shrink-0" />
                    {targetClass ? (
                      <span
                        className="badge shrink-0 truncate max-w-[180px]"
                        style={{ background: BRANCHES[nextClass.nextBranch ?? student.branch]?.badgeBg, color: BRANCHES[nextClass.nextBranch ?? student.branch]?.textColor }}
                        title={`Lớp đích: ${targetClass.name}`}
                      >
                        {targetClass.name}
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-600 font-semibold shrink-0">
                        Chưa có lớp đích — hãy tạo lớp trước khi xét
                      </span>
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
