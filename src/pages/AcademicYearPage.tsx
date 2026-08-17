import { useState, useEffect, useCallback } from 'react'
import { Calendar, Lock, Unlock, Plus, CheckCircle2, ClipboardCheck, Flag, GraduationCap, Copy, RefreshCw, XCircle, AlertTriangle, Info, ArrowRight, Archive } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
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
  onConfirm?: () => void
  resultTitle?: string
  resultLines?: { icon: 'ok' | 'warn' | 'err' | 'info'; text: string }[]
}

export function AcademicYearPage() {
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
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
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
      />

      {/* Wizard steps guide */}
      <div className="bg-surface-card border border-surface-border p-5 rounded-2xl shadow-card">
        <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
          Quy Trình Năm Học (Wizard 5 bước)
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-text-muted">
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
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-text-muted text-sm">Đang tải...</div>
      ) : years.length === 0 ? (
        <div className="bg-surface-card rounded-2xl border border-dashed border-surface-border p-10 text-center space-y-3">
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
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-bold rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Đang chọn
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-[11px] font-bold rounded-lg ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                    {item.snapshotCount > 0 && (
                      <span className="px-2 py-1 bg-violet-500/10 text-violet-600 text-[10px] font-bold rounded-lg">
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
                      className="btn btn-primary btn-sm"
                    >
                      Chọn Làm Năm Học Hiện Tại
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleChecklist(item)}
                        className="btn btn-secondary btn-sm"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" /> Check Dữ Liệu
                      </button>
                      {canStartSem2 && (
                        <button
                          onClick={() => handleStartSemester2(item)}
                          disabled={busy}
                          className="btn btn-primary text-xs font-bold flex items-center gap-1.5"
                        >
                          <ArrowRight className="w-3.5 h-3.5" /> Bắt Đầu HK2
                        </button>
                      )}
                      {canFinalize && (
                        <button
                          onClick={() => handleFinalize(item)}
                          disabled={busy}
                          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40"
                        >
                          <Flag className="w-3.5 h-3.5" /> Chốt Năm Học
                        </button>
                      )}
                      {canPromote && (
                        <button
                          onClick={() => openPromoteModal(item)}
                          disabled={busy}
                          className="px-3 py-1.5 bg-parish-primary hover:bg-parish-primary-hover text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40"
                        >
                          <GraduationCap className="w-3.5 h-3.5" /> Xét Lên Lớp
                        </button>
                      )}
                      {item.status === 'PROMOTED' && (
                        <button
                          onClick={() => handleArchive(item)}
                          disabled={busy}
                          className="px-3 py-1.5 bg-surface-hover hover:bg-surface-border text-text-main text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40"
                        >
                          <Archive className="w-3.5 h-3.5" /> Lưu Trữ
                        </button>
                      )}
                      {!terminal && (
                        <button
                          onClick={() => openCopyModal(item)}
                          disabled={busy}
                          className="px-3 py-1.5 border border-surface-border text-xs font-bold rounded-lg flex items-center gap-1.5 hover:bg-surface-hover transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" /> Tạo Năm Mới
                        </button>
                      )}
                    </>
                  )}
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-surface-border">
                    <p className="text-[11px] text-text-muted font-semibold mb-2">
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
                            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                              isSemLocked
                                ? 'bg-surface-hover text-text-secondary hover:bg-surface-border'
                                : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
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

      {/* Checklist modal */}
      {modal?.type === 'checklist' && modal.checklist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-main">Check Dữ Liệu — {modal.year?.id}</h3>
              <button onClick={() => setModal(null)} className="text-text-muted hover:text-text-main">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-text-muted flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-surface-hover rounded-lg">{modal.checklist.totals.classes} lớp</span>
              <span className="px-2 py-1 bg-surface-hover rounded-lg">{modal.checklist.totals.students} học sinh</span>
              <span className="px-2 py-1 bg-surface-hover rounded-lg">{modal.checklist.totals.gradeRows} dòng điểm</span>
              <span className="px-2 py-1 bg-surface-hover rounded-lg">{modal.checklist.totals.openSessions} buổi điểm danh chưa chốt</span>
            </div>
            {modal.checklist.issues.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl">
                <CheckCircle2 className="w-4 h-4" /> Dữ liệu đầy đủ — sẵn sàng chốt năm học.
              </div>
            ) : (
              <div className="space-y-2">
                {modal.checklist.issues.map((issue) => (
                  <div key={issue.code} className={`px-4 py-3 rounded-xl border text-xs ${
                    issue.severity === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
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
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-parish-primary text-white text-xs font-bold rounded-xl">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promote modal */}
      {modal?.type === 'promote' && modal.year && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-text-main">Xét Lên Lớp — {modal.year.id}</h3>
            <p className="text-xs text-text-muted">
              Năm học mới (lớp sẽ được tự tạo/copy nếu chưa có). Hệ thống sinh promotion_records từ snapshot và chuyển học sinh sang lớp mới.
            </p>
            <input
              type="text"
              placeholder="VD: 2026 - 2027"
              value={nextYearId}
              onChange={(e) => setNextYearId(e.target.value)}
              className="w-full px-3 py-2 bg-surface-hover/30 border border-surface-border rounded-xl text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 border border-surface-border text-text-muted text-xs font-bold rounded-xl">
                Hủy
              </button>
              <button
                onClick={() => handlePromote(modal.year!)}
                disabled={busy || !nextYearId.trim()}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl disabled:opacity-40"
              >
                {busy ? 'Đang xử lý...' : 'Xét Lên Lớp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy modal */}
      {modal?.type === 'copy' && modal.year && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-text-main">Tạo Năm Học Mới — {modal.year.id}</h3>
            <p className="text-xs text-text-muted">
              Copy danh sách lớp + cấu hình môn. Không copy điểm, điểm danh, báo cáo.
            </p>
            <input
              type="text"
              placeholder="VD: 2026 - 2027"
              value={copyYearId}
              onChange={(e) => setCopyYearId(e.target.value)}
              className="w-full px-3 py-2 bg-surface-hover/30 border border-surface-border rounded-xl text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 border border-surface-border text-text-muted text-xs font-bold rounded-xl">
                Hủy
              </button>
              <button
                onClick={() => handleCopy(modal.year!)}
                disabled={busy || !copyYearId.trim()}
                className="px-4 py-2 bg-parish-primary text-white text-xs font-bold rounded-xl disabled:opacity-40"
              >
                {busy ? 'Đang xử lý...' : 'Tạo & Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {modal?.type === 'confirm' && modal.year && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-text-main">{modal.title}</h3>
            <p className="text-xs text-text-muted leading-relaxed">{modal.message}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 border border-surface-border text-text-muted text-xs font-bold rounded-xl">
                Hủy
              </button>
              <button
                onClick={() => { modal.onConfirm?.() }}
                disabled={busy}
                className="px-4 py-2 bg-parish-primary text-white text-xs font-bold rounded-xl disabled:opacity-40"
              >
                {busy ? 'Đang xử lý...' : 'Xác Nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result modal */}
      {modal?.type === 'result' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-text-main">{modal.resultTitle}</h3>
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
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-parish-primary text-white text-xs font-bold rounded-xl">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create bare year modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-text-main">Tạo Năm Học Giáo Lý Mới</h3>
            <p className="text-xs text-text-muted">
              Khuyến nghị dùng nút "Tạo Năm Mới" trên từng năm học để tự copy lớp + cấu hình môn. Nút này chỉ tạo năm trống.
            </p>
            <input
              type="text"
              placeholder="VD: 2026 - 2027"
              value={newYearName}
              onChange={(e) => setNewYearName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-hover/30 border border-surface-border rounded-xl text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-surface-border text-text-muted text-xs font-bold rounded-xl">
                Hủy
              </button>
              <button
                onClick={handleCreateBare}
                disabled={busy || !newYearName.trim()}
                className="px-4 py-2 bg-parish-primary text-white text-xs font-bold rounded-xl disabled:opacity-40"
              >
                {busy ? 'Đang xử lý...' : 'Tạo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AcademicYearPage
