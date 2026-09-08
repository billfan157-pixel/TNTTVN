import { useState, useEffect, useCallback } from 'react'
import { Calendar, Lock, Unlock, Plus, CheckCircle2, ClipboardCheck, Flag, GraduationCap, Copy, RefreshCw, XCircle, AlertTriangle, Info, ArrowRight, Archive } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { ModalShell } from '../components/common/ModalShell'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { SkeletonCardGrid } from '../components/common/StateFeedback'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { useAuth } from '../hooks/useAuth'
import { semesterLocksApiClient } from '../lib/api/semesterLocks'
import {
  academicYearsApiClient,
  type AcademicYearLifecycleDTO,
  type CompletenessChecklist,
  type PromoteSummary,
  type FinalizeSummary,
  type CopyYearResult,
  type AcademicYearStatus,
} from '../lib/api/academicYears'

type Semester = 1 | 2

const STATUS_STYLE: Record<AcademicYearStatus, { label: string; className: string }> = {
  OPEN: { label: 'Mở — HK1', className: 'bg-emerald-500/10 text-emerald-600' },
  SEMESTER_1_LOCKED: { label: 'Đã Khóa HK1', className: 'bg-amber-500/10 text-amber-600' },
  SEMESTER_2_OPEN: { label: 'Đang HK2', className: 'bg-sky-500/10 text-sky-600' },
  SEMESTER_2_LOCKED: { label: 'Đã Khóa HK2', className: 'bg-orange-500/10 text-orange-600' },
  FINALIZED: { label: 'Đã Chốt Năm Học', className: 'bg-violet-500/10 text-violet-600' },
  PROMOTED: { label: 'Đã Xét Lên Lớp', className: 'bg-indigo-500/10 text-indigo-600' },
  ARCHIVED: { label: 'Đã Lưu Trữ', className: 'bg-surface-hover text-text-secondary' },
}

const isTerminal = (s: AcademicYearStatus) => s === 'FINALIZED' || s === 'PROMOTED' || s === 'ARCHIVED'

function suggestNextYear(yearId: string): string {
  const m = yearId.match(/^(\d{4})-(\d{4})$/)
  if (!m) return ''
  const start = parseInt(m[1], 10)
  return `${start + 1}-${start + 2}`
}

interface ModalState {
  type: 'checklist' | 'promote' | 'copy' | 'confirm' | 'result' | null
  year?: AcademicYearLifecycleDTO
  checklist?: CompletenessChecklist
  title?: string
  message?: string
  /** PHA 1 (audit MED): thao tác irreversible (finalize/promote) → danger */
  variant?: 'danger' | 'warning' | 'info'
  /** Nhãn nút xác nhận cụ thể theo hành động (mặc định 'Xác nhận') */
  confirmText?: string
  onConfirm?: () => void
  resultTitle?: string
  resultLines?: { icon: 'ok' | 'warn' | 'err' | 'info'; text: string }[]
}

export function AcademicYearPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { currentYear, setCurrentYear, fetchAcademicYears, createAcademicYear } = useAcademicYearStore()
  const { can } = useAuth()
  const isAdmin = can('admin')

  const [years, setYears] = useState<AcademicYearLifecycleDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)

  const [newYearName, setNewYearName] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [nextYearId, setNextYearId] = useState('')
  const [copyYearId, setCopyYearId] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [lifecycleYears] = await Promise.all([
        academicYearsApiClient.listAcademicYears(),
        fetchAcademicYears().catch(() => undefined),
      ])
      setYears(lifecycleYears)
    } catch (err: any) {
      setError(err?.message || 'Không thể tải danh sách năm học')
    } finally {
      setLoading(false)
    }
  }, [fetchAcademicYears])

  useEffect(() => {
    refresh()
  }, [refresh])

  const run = async (fn: () => Promise<any>, onOk?: (res: any) => void, onErr?: (err: any) => void) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fn()
      onOk?.(res)
    } catch (err: any) {
      if (onErr) onErr(err)
      else setError(err?.message || 'Thao tác thất bại')
    } finally {
      setBusy(false)
    }
  }

  const handleToggleLock = async (year: AcademicYearLifecycleDTO, sem: Semester, isLocked: boolean) => {
    await run(
      () => semesterLocksApiClient.setSemesterLock({ academicYear: year.id, semester: sem, isLocked }),
      () => refresh(),
      (err) => setError(err?.message || 'Không thể cập nhật khóa sổ điểm'),
    )
  }

  const handleStartSemester2 = (year: AcademicYearLifecycleDTO) => {
    setModal({
      type: 'confirm',
      year,
      title: `Bắt đầu Học Kỳ 2 — ${year.id}`,
      message: 'Sau khi bấm xác nhận, mọi thao tác nhập điểm/điểm danh/báo cáo sẽ mặc định ghi vào HK2. HK1 vẫn giữ trạng thái khóa.',
      variant: 'warning',
      confirmText: 'Bắt Đầu HK2',
      onConfirm: () => run(
        () => academicYearsApiClient.startSemester2(year.id),
        (res) => {
          setModal({ type: 'result', resultTitle: 'Đã bắt đầu HK2', resultLines: [{ icon: 'ok', text: `Năm học ${res.yearId} hiện đang ghi dữ liệu vào học kỳ 2.` }] })
          refresh()
        },
        (err) => setError(err?.message || 'Không thể bắt đầu HK2'),
      ),
    })
  }

  const handleChecklist = async (year: AcademicYearLifecycleDTO) => {
    await run(
      () => academicYearsApiClient.getCompletenessChecklist(year.id),
      (checklist) => setModal({ type: 'checklist', year, checklist }),
      (err) => setError(err?.message || 'Không thể kiểm tra dữ liệu'),
    )
  }

  const handleFinalize = (year: AcademicYearLifecycleDTO) => {
    setModal({
      type: 'confirm',
      year,
      title: `Chốt Năm Học — ${year.id}`,
      message: 'Hệ thống sẽ: (1) kiểm tra lại tính đầy đủ dữ liệu, (2) tính TB HK1 + TB HK2 + TB năm + xếp loại cho từng học sinh, (3) lưu snapshot lịch sử, (4) khóa toàn bộ năm học. Không thể sửa điểm sau khi chốt.',
      variant: 'danger',
      confirmText: 'Chốt Năm Học',
      onConfirm: () => run(
        () => academicYearsApiClient.finalizeYear(year.id),
        (res: FinalizeSummary) => {
          setModal({
            type: 'result',
            resultTitle: `Đã chốt năm học ${res.yearId}`,
            resultLines: [
              { icon: 'ok', text: `Đã lưu snapshot cho ${res.snapshotCount} học sinh.` },
              { icon: 'info', text: 'Bước tiếp theo: Xét Lên Lớp (Promotion).' },
            ],
          })
          refresh()
        },
        (err: any) => {
          const details = err?.details as CompletenessChecklist | undefined
          setModal({
            type: 'result',
            resultTitle: 'Chưa thể chốt năm học',
            resultLines: (details?.issues || []).map((i) => ({
              icon: i.severity === 'error' ? 'err' as const : 'warn' as const,
              text: i.label,
            })),
          })
        },
      ),
    })
  }

  const openPromoteModal = (year: AcademicYearLifecycleDTO) => {
    setNextYearId(suggestNextYear(year.id) || '')
    setModal({ type: 'promote', year })
  }

  const handlePromote = (year: AcademicYearLifecycleDTO) => {
    const nextYear = nextYearId.trim()
    if (!nextYear) return
    setModal({
      type: 'confirm',
      year,
      title: `Xét Lên Lớp — ${year.id} → ${nextYear}`,
      message: 'Hệ thống sẽ tạo lớp/khóa cho năm học mới (nếu chưa có), sinh promotion_records từ snapshot, và chuyển học sinh đạt điều kiện sang lớp năm học mới. Thao tác này KHÔNG thể hoàn tác.',
      variant: 'danger',
      confirmText: 'Xét Lên Lớp',
      onConfirm: () => run(
        () => academicYearsApiClient.promoteYear(year.id, nextYear),
        (res: PromoteSummary) => {
          setModal({
            type: 'result',
            resultTitle: `Đã xét lên lớp ${res.yearId} → ${res.nextYearId}`,
            resultLines: [
              { icon: 'ok', text: `${res.movedToNextYear} học sinh chuyển sang lớp năm học mới.` },
              ...(res.retained > 0 ? [{ icon: 'warn' as const, text: `${res.retained} học sinh lưu ban (RETAINED).` }] : []),
              ...(res.graduated > 0 ? [{ icon: 'info' as const, text: `${res.graduated} học sinh tốt nghiệp (GRADUATED).` }] : []),
              ...res.errors.map((e) => ({ icon: 'err' as const, text: `Lỗi học sinh ${e.studentId}: ${e.reason}` })),
            ],
          })
          refresh()
        },
        (err) => setError(err?.message || 'Không thể xét lên lớp'),
      ),
    })
  }

  const openCopyModal = (year: AcademicYearLifecycleDTO) => {
    setCopyYearId(suggestNextYear(year.id) || '')
    setModal({ type: 'copy', year })
  }

  const handleCopy = (year: AcademicYearLifecycleDTO) => {
    const newYear = copyYearId.trim()
    if (!newYear) return
    setModal({
      type: 'confirm',
      year,
      title: `Tạo Năm Học Mới — ${year.id} → ${newYear}`,
      message: 'Hệ thống sẽ tạo năm học mới và COPY danh sách lớp + cấu hình môn/trọng số (assessments). KHÔNG copy điểm, điểm danh hay báo cáo.',
      variant: 'warning',
      confirmText: 'Tạo & Copy',
      onConfirm: () => run(
        () => academicYearsApiClient.copyAcademicYear(year.id, newYear),
        (res: CopyYearResult) => {
          setModal({
            type: 'result',
            resultTitle: `Đã tạo năm học ${res.year.id}`,
            resultLines: [
              { icon: 'ok', text: `Copy ${res.copiedClasses} lớp.` },
              { icon: 'ok', text: `Copy ${res.copiedAssessments} cấu hình môn.` },
              { icon: 'info', text: 'Năm học mới đang ở trạng thái OPEN — HK1.' },
            ],
          })
          refresh()
        },
        (err) => setError(err?.message || 'Không thể tạo năm học mới'),
      ),
    })
  }

  const handleArchive = (year: AcademicYearLifecycleDTO) => {
    setModal({
      type: 'confirm',
      year,
      title: `Lưu Trữ Năm Học — ${year.id}`,
      message: 'Năm học sẽ chuyển sang trạng thái ĐÃ LƯU TRỮ: chỉ còn xem lịch sử, không thể khóa sổ, xét lên lớp hay chọn làm năm học hiện tại.',
      onConfirm: () => run(
        () => academicYearsApiClient.archiveYear(year.id),
        (res) => {
          setModal({ type: 'result', resultTitle: `Đã lưu trữ năm học ${res.yearId}`, resultLines: [{ icon: 'ok', text: 'Năm học đã chuyển sang trạng thái Đã Lưu Trữ — dữ liệu vẫn giữ để xem báo cáo lịch sử.' }] })
          refresh()
        },
        (err) => setError(err?.message || 'Không thể lưu trữ năm học'),
      ),
    })
  }

  const handleRetryPromotion = (year: AcademicYearLifecycleDTO) => {
    setModal({
      type: 'confirm',
      year,
      title: `Retry Xét Lên Lớp — ${year.id}`,
      message: `Hệ thống chỉ retry ${year.unresolvedPromotionCount} học sinh chưa có promotion record hợp lệ; các item đã thành công sẽ được bỏ qua.`,
      variant: 'warning',
      confirmText: 'Retry Item Lỗi',
      onConfirm: () => run(
        () => academicYearsApiClient.retryPromotion(year.id),
        (res: PromoteSummary) => {
          setModal({
            type: 'result',
            resultTitle: `Đã retry promotion ${res.yearId}`,
            resultLines: [
              { icon: res.unresolvedCount === 0 ? 'ok' : 'warn', text: res.unresolvedCount === 0 ? 'Tất cả snapshot đã có promotion record hợp lệ.' : `Còn ${res.unresolvedCount} học sinh chưa hoàn tất.` },
              ...res.errors.map((e) => ({ icon: 'err' as const, text: `Lỗi học sinh ${e.studentId}: ${e.reason}` })),
            ],
          })
          refresh()
        },
        (err) => setError(err?.message || 'Không thể retry xét lên lớp'),
      ),
    })
  }

  const handleCreateBare = () => {
    if (!newYearName.trim()) return
    run(
      () => createAcademicYear(newYearName.trim()),
      () => {
        setShowAddModal(false)
        setNewYearName('')
        refresh()
      },
      (err) => setError(err?.message || 'Không thể tạo năm học'),
    )
  }

  const activeYear = years.find((y) => y.id === currentYear)

  return (
    <DesktopAppShell width="wide" embedded={embedded}>
      {/* Header */}
      {!embedded && <PageHeader
        icon={<Calendar className="w-5 h-5" />}
        title="Quản Lý Năm Học Giáo Lý"
        description={
          years.length === 0 ? (
            <span className="font-semibold text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Chưa có năm học nào — hãy tạo năm học đầu tiên
            </span>
          ) : (
            <>
              Năm học hiện tại: <span className="font-bold text-parish-primary">{currentYear || 'Chưa chọn'}</span>
              {activeYear && <span className="ml-2"> • {activeYear.studentCount} học sinh • {activeYear.classCount} lớp</span>}
            </>
          )
        }
        actions={
          <>
            <button
              onClick={refresh}
              disabled={busy}
              className="btn btn-secondary btn-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Làm Mới
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="btn btn-primary btn-sm"
              >
                <Plus className="w-4 h-4" /> Tạo Năm Học
              </button>
            )}
          </>
        }
      />}

      {/* Wizard steps guide */}
      <div className="app-panel p-5">
        <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
          Quy Trình Năm Học (Wizard 5 bước)
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted">
          {[
            { icon: <Lock className="w-3.5 h-3.5" />, label: '① Khóa Học Kỳ' },
            { icon: <ClipboardCheck className="w-3.5 h-3.5" />, label: '② Check Dữ Liệu' },
            { icon: <Flag className="w-3.5 h-3.5" />, label: '③ Chốt Năm Học' },
            { icon: <GraduationCap className="w-3.5 h-3.5" />, label: '④ Xét Lên Lớp' },
            { icon: <Copy className="w-3.5 h-3.5" />, label: '⑤ Tạo Năm Mới' },
          ].map((step, idx) => (
            <span key={idx} className="flex items-center gap-1.5 bg-surface-hover px-2.5 py-1.5 rounded-lg">
              {step.icon} {step.label}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert-error">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Đang tải dữ liệu">
          <SkeletonCardGrid count={3} />
        </div>
      ) : years.length === 0 ? (
        <div className="app-panel border-dashed p-10 text-center space-y-3">
          <div className="mx-auto w-12 h-12 bg-parish-primary/10 rounded-2xl flex items-center justify-center">
            <Calendar className="w-6 h-6 text-parish-primary" />
          </div>
          <p className="text-sm font-bold text-text-main">Chưa có năm học giáo lý nào</p>
          <p className="text-xs text-text-muted max-w-md mx-auto">
            Tạo năm học đầu tiên để bắt đầu nhập điểm, điểm danh và quản lý lớp học. Sau này có thể copy lớp + cấu hình môn từ năm học cũ.
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary btn-sm mx-auto"
            >
              <Plus className="w-4 h-4" /> Tạo Năm Học Đầu Tiên
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {years.map((item) => {
            const isActive = item.id === currentYear
            const statusMeta = STATUS_STYLE[item.status] || STATUS_STYLE.OPEN
            const terminal = isTerminal(item.status)
            const canStartSem2 = isAdmin && item.status === 'SEMESTER_1_LOCKED' && !terminal
            const canFinalize = isAdmin && item.status === 'SEMESTER_2_LOCKED' && !terminal
            const canPromote = isAdmin && item.status === 'FINALIZED' && !terminal
            return (
              <div
                key={item.id}
                data-testid={`academic-year-${item.id}`}
                className={`p-5 rounded-2xl border transition-all shadow-sm ${
                  isActive
                    ? 'bg-parish-primary-light border-parish-primary'
                    : 'bg-surface-card border-surface-border'
                }`}
              >
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-text-main">{item.id}</h3>
                    {isActive && (
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 text-xs font-bold rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Đang chọn
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs font-bold rounded-lg ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                    {item.snapshotCount > 0 && (
                      <span className="px-2 py-1 bg-violet-500/10 text-violet-600 text-xs font-bold rounded-lg">
                        {item.snapshotCount} snapshot
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-text-muted space-y-1 mb-3">
                  <p>Thời gian: {item.startDate} — {item.endDate} • HK hiện tại: {item.currentSemester}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!isActive && item.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => setCurrentYear(item.id)}
                      className="btn btn-primary btn-sm min-h-[40px]"
                    >
                      Chọn Làm Năm Học Hiện Tại
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleChecklist(item)}
                        className="btn btn-secondary btn-sm min-h-[40px]"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" /> Check Dữ Liệu
                      </button>
                      {canStartSem2 && (
                        <button
                          onClick={() => handleStartSemester2(item)}
                          disabled={busy}
                          className="btn btn-primary btn-sm min-h-[40px] text-xs font-bold flex items-center gap-1.5"
                        >
                          <ArrowRight className="w-3.5 h-3.5" /> Bắt Đầu HK2
                        </button>
                      )}
                      {canFinalize && (
                        <button
                          onClick={() => handleFinalize(item)}
                          disabled={busy}
                          className="btn btn-secondary btn-sm min-h-[40px] text-violet-700 dark:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                        >
                          <Flag className="w-3.5 h-3.5" /> Chốt Năm Học
                        </button>
                      )}
                      {canPromote && (
                        <button
                          onClick={() => openPromoteModal(item)}
                          disabled={busy}
                          className="btn btn-primary btn-sm min-h-[40px] text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                        >
                          <GraduationCap className="w-3.5 h-3.5" /> Xét Lên Lớp
                        </button>
                      )}
                      {item.status === 'PROMOTED' && item.unresolvedPromotionCount > 0 && (
                        <button
                          onClick={() => handleRetryPromotion(item)}
                          disabled={busy || !item.promotionTargetYearId}
                          className="btn btn-primary btn-sm min-h-[40px] text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Retry {item.unresolvedPromotionCount} Item Lỗi
                        </button>
                      )}
                      {item.status === 'PROMOTED' && item.unresolvedPromotionCount === 0 && (
                        <button
                          onClick={() => handleArchive(item)}
                          disabled={busy}
                          className="btn btn-secondary btn-sm min-h-[40px] text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                        >
                          <Archive className="w-3.5 h-3.5" /> Lưu Trữ
                        </button>
                      )}
                      {!terminal && (
                        <button
                          onClick={() => openCopyModal(item)}
                          disabled={busy}
                          className="btn btn-secondary btn-sm min-h-[40px] text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" /> Tạo Năm Mới
                        </button>
                      )}
                    </>
                  )}
                </div>

                {isAdmin && item.status === 'PROMOTED' && item.unresolvedPromotionCount > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    Chưa thể lưu trữ: còn {item.unresolvedPromotionCount} snapshot chưa có promotion record ACTIVE/LATEST.
                    {item.promotionTargetYearId ? ` Năm đích cố định: ${item.promotionTargetYearId}.` : ' Thiếu năm đích durable; cần xử lý dữ liệu trước khi retry.'}
                  </div>
                )}

                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-surface-border">
                    <p className="text-xs text-text-muted font-semibold mb-2">
                      Khóa sổ điểm học kỳ — ngăn sửa điểm/điểm danh, điều kiện xét thăng tiến
                    </p>
                    <div className="flex gap-2">
                      {([1, 2] as const).map((sem) => {
                        const isSemLocked = sem === 1 ? item.semesterLocks.semester1Locked : item.semesterLocks.semester2Locked
                        return (
                          <button
                            key={sem}
                            disabled={busy || terminal}
                            onClick={() => handleToggleLock(item, sem, !isSemLocked)}
                            className={`btn btn-sm min-h-[40px] flex-1 justify-center text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                              isSemLocked
                                ? 'btn-secondary text-text-secondary'
                                : 'btn-secondary text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20'
                            }`}
                          >
                            {isSemLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                            HK{sem}: {isSemLocked ? 'Đã Khóa' : 'Mở'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Checklist modal — PHA 1: ModalShell (focus trap + Escape + scroll-lock) */}
      {modal?.type === 'checklist' && modal.checklist && (
        <ModalShell
          isOpen
          onClose={() => setModal(null)}
          title={`Check Dữ Liệu — ${modal.year?.id}`}
          maxWidth="512px"
        >
          <div className="space-y-4">
            <div className="text-xs text-text-muted flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-surface-hover rounded-lg">{modal.checklist.totals.classes} lớp</span>
              <span className="px-2 py-1 bg-surface-hover rounded-lg">{modal.checklist.totals.students} học sinh</span>
              <span className="px-2 py-1 bg-surface-hover rounded-lg">{modal.checklist.totals.gradeRows} dòng điểm</span>
              <span className="px-2 py-1 bg-surface-hover rounded-lg">{modal.checklist.totals.openSessions} buổi điểm danh chưa chốt</span>
            </div>
            {modal.checklist.issues.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-parish-success-bg border border-parish-success/30 text-parish-success text-xs font-bold rounded-xl">
                <CheckCircle2 className="w-4 h-4" /> Dữ liệu đầy đủ — sẵn sàng chốt năm học.
              </div>
            ) : (
              <div className="space-y-2">
                {modal.checklist.issues.map((issue) => (
                  <div key={issue.code} className={`px-4 py-3 rounded-xl border text-xs ${
                    issue.severity === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-parish-warning-bg border-parish-warning/30 text-parish-warning'
                  }`}>
                    <p className="font-bold flex items-center gap-1.5">
                      {issue.severity === 'error' ? <AlertTriangle className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                      {issue.label}
                    </p>
                    {issue.items.length > 0 && (
                      <p className="mt-1 opacity-80 font-medium">{issue.items.slice(0, 10).join(' • ')}{issue.items.length > 10 ? '…' : ''}</p>
                    )}
                  </div>
                ))}
                {!modal.checklist.ready && (
                  <p className="text-xs font-semibold text-red-600">
                    Còn lỗi dữ liệu — cần sửa xong trước khi Chốt Năm Học.
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setModal(null)} className="btn btn-primary btn-sm">
                Đóng
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Promote modal — PHA 1: ModalShell */}
      {modal?.type === 'promote' && modal.year && (
        <ModalShell
          isOpen
          onClose={() => setModal(null)}
          title={`Xét Lên Lớp — ${modal.year.id}`}
          maxWidth="448px"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              Năm học mới (lớp sẽ được tự tạo/copy nếu chưa có). Hệ thống sinh promotion_records từ snapshot và chuyển học sinh sang lớp mới.
            </p>
            <input
              type="text"
              placeholder="VD: 2026 - 2027"
              value={nextYearId}
              onChange={(e) => setNextYearId(e.target.value)}
              className="form-input w-full text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">
                Hủy
              </button>
              <button
                onClick={() => handlePromote(modal.year!)}
                disabled={busy || !nextYearId.trim()}
                className="btn btn-sm bg-parish-indigo hover:bg-parish-primary text-white disabled:opacity-40"
              >
                {busy ? 'Đang xử lý...' : 'Xét Lên Lớp'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Copy modal — PHA 1: ModalShell */}
      {modal?.type === 'copy' && modal.year && (
        <ModalShell
          isOpen
          onClose={() => setModal(null)}
          title={`Tạo Năm Học Mới — ${modal.year.id}`}
          maxWidth="448px"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              Copy danh sách lớp + cấu hình môn. Không copy điểm, điểm danh, báo cáo.
            </p>
            <input
              type="text"
              placeholder="VD: 2026 - 2027"
              value={copyYearId}
              onChange={(e) => setCopyYearId(e.target.value)}
              className="form-input w-full text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">
                Hủy
              </button>
              <button
                onClick={() => handleCopy(modal.year!)}
                disabled={busy || !copyYearId.trim()}
                className="btn btn-primary btn-sm disabled:opacity-40"
              >
                {busy ? 'Đang xử lý...' : 'Tạo & Copy'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Confirm modal — PHA 1: ConfirmDialog chuẩn (focus trap + Esc + variant
          danger cho finalize/promote irreversible, sửa finding "Xác Nhận" generic) */}
      {modal?.type === 'confirm' && modal.year && (
        <ConfirmDialog
          isOpen
          title={modal.title}
          message={modal.message || ''}
          confirmText={modal.confirmText || 'Xác nhận'}
          variant={modal.variant || 'warning'}
          isBusy={busy}
          onConfirm={() => { modal.onConfirm?.() }}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Result modal — PHA 1: ModalShell */}
      {modal?.type === 'result' && (
        <ModalShell
          isOpen
          onClose={() => setModal(null)}
          title={modal.resultTitle || 'Kết Quả'}
          maxWidth="448px"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              {(modal.resultLines || []).map((line, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs font-semibold text-text-main">
                  {line.icon === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                  {line.icon === 'warn' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                  {line.icon === 'err' && <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                  {line.icon === 'info' && <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />}
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setModal(null)} className="btn btn-primary btn-sm">
                Đóng
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Create bare year modal — PHA 1: ModalShell */}
      {showAddModal && (
        <ModalShell
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Tạo Năm Học Giáo Lý Mới"
          maxWidth="448px"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              Khuyến nghị dùng nút "Tạo Năm Mới" trên từng năm học để tự copy lớp + cấu hình môn. Nút này chỉ tạo năm trống.
            </p>
            <input
              type="text"
              placeholder="VD: 2026 - 2027"
              value={newYearName}
              onChange={(e) => setNewYearName(e.target.value)}
              className="form-input w-full text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-sm">
                Hủy
              </button>
              <button
                onClick={handleCreateBare}
                disabled={busy || !newYearName.trim()}
                className="btn btn-primary btn-sm disabled:opacity-40"
              >
                {busy ? 'Đang xử lý...' : 'Tạo'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </DesktopAppShell>
  )
}

export default AcademicYearPage
