import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Activity, Database, HardDrive, ShieldCheck, RefreshCw, X, Zap, Cpu, AlertTriangle, AlertCircle, Trash2, History, Server, CheckCircle2, XCircle, Download, Play } from 'lucide-react'
import { getDB, type SyncQueueItem, type SyncConflict } from '../../lib/db'
import { useSyncStore } from '../../stores/syncStore'
import { runSyncFlow } from '../../hooks/useSyncEngine'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { ConflictInboxModal } from './ConflictInboxModal'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useNoticeStore } from '../../stores/noticeStore'
import { api } from '../../lib/api'
import {
  armOmrSequenceEvidence,
  buildOmrSequenceEvidenceManifest,
  clearCompletedOmrSequenceEvidence,
  discardActiveOmrSequenceEvidence,
  downloadOmrSequenceEvidenceManifest,
  getOmrSequenceReleaseId,
  readOmrSequenceEvidenceSummary,
  recordOmrSequenceSafetyCounter,
  type OmrSequenceRunTarget,
} from '../../lib/omrSequenceEvidence'
import { downloadOmrSequenceTargetsScaffold } from '../../lib/omrSequenceQualification'

interface SystemDiagnosticsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SystemDiagnosticsModal: React.FC<SystemDiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const students = useStudentStore((s) => s.students)
  const grades = useGradeStore((s) => s.grades)
  const attendance = useAttendanceStore((s) => s.attendance)
  const notices = useNoticeStore((s) => s.notices)

  const [pendingSyncOps, setPendingSyncOps] = useState<number>(0)
  const [failedOps, setFailedOps] = useState<SyncQueueItem[]>([])
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [showConflictInbox, setShowConflictInbox] = useState(false)
  const [apiLatency, setApiLatency] = useState<number | null>(null)
  
  const getConflicts = useSyncStore((s) => s.getConflicts)
  const updateOp = useSyncStore((s) => s.updateOp)
  const removeOp = useSyncStore((s) => s.removeOp)
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()
  // PHA 1 (audit A19): focus trap — trước đây Tab thoát ra nền phía sau overlay
  const trapRef = useFocusTrap(isOpen)
  const syncNow = () => runSyncFlow()
  const [latencyLoading, setLatencyLoading] = useState(false)
  const [dbStatus, setDbStatus] = useState<'healthy' | 'error' | 'checking'>('checking')
  const [healthDetails, setHealthDetails] = useState<{ database: string; uptimeSeconds: number; timestamp: string } | null>(null)
  const [memoryUsage, setMemoryUsage] = useState<string | null>(null)
  const [memoryDetail, setMemoryDetail] = useState<string | null>(null)
  const [serverCounts, setServerCounts] = useState<{ notices: number | null; students: number | null }>({ notices: null, students: null })
  const [queueByEntity, setQueueByEntity] = useState<Record<string, number>>({})
  const [schemaCheck, setSchemaCheck] = useState<'ok' | 'fail' | 'checking'>('checking')
  const [sequenceSummary, setSequenceSummary] = useState(() => readOmrSequenceEvidenceSummary())
  const [sequenceDeviceProfile, setSequenceDeviceProfile] = useState('')
  const [sequenceBrowserProfile, setSequenceBrowserProfile] = useState('')
  const [sequenceTarget, setSequenceTarget] = useState<OmrSequenceRunTarget>(30)
  const [sequenceMessage, setSequenceMessage] = useState<string | null>(null)
  const sequenceReleaseId = getOmrSequenceReleaseId()
  const cancelledRef = useRef(false)

  const runDiagnostics = useCallback(async () => {
    cancelledRef.current = false
    setDbStatus('checking')
    setSchemaCheck('checking')
    setLatencyLoading(true)
    setApiLatency(null)
    setHealthDetails(null)
    setServerCounts({ notices: null, students: null })
    const start = performance.now()

    try {
      const db = getDB()
      const count = await db.syncQueue.where('status').anyOf(['pending', 'retrying']).count()
    setPendingSyncOps(count)
    
    const failed = await db.syncQueue.where('status').equals('failed').toArray()
    setFailedOps(failed)

    // Breakdown by entity for deeper insight
    try {
      const allPending = await db.syncQueue.where('status').anyOf(['pending', 'retrying', 'failed']).toArray()
      const byEntity: Record<string, number> = {}
      for (const item of allPending) byEntity[item.entity] = (byEntity[item.entity] || 0) + 1
      if (!cancelledRef.current) setQueueByEntity(byEntity)
    } catch { if (!cancelledRef.current) setQueueByEntity({}) }
    
    const conflictList = await getConflicts()
    setConflicts(conflictList)

      const res = await fetch('/health', { signal: AbortSignal.timeout(5000) })
      const duration = Math.round(performance.now() - start)
      if (cancelledRef.current) return
      setApiLatency(duration)
      const ok = res.ok
      setDbStatus(ok ? 'healthy' : 'error')
      if (ok) {
        try {
          const data = await res.json()
          setHealthDetails({ database: data.database, uptimeSeconds: data.uptimeSeconds, timestamp: data.timestamp })
        } catch { setHealthDetails(null) }
      } else {
        setHealthDetails(null)
      }
      // Schema check: thử gọi API notices để xem target_audience có hoạt động không (migration 20260827-130)
      try {
        await api.getNotices()
        if (!cancelledRef.current) setSchemaCheck('ok')
      } catch { if (!cancelledRef.current) setSchemaCheck('fail') }

      // Server vs Local counts (phát hiện ghost-data / lệch sync)
      try {
        const serverNotices: any = await api.getNotices().catch(() => null)
        if (!cancelledRef.current) {
          setServerCounts({
            notices: Array.isArray(serverNotices) ? serverNotices.length : (serverNotices as any)?.data?.length ?? null,
            students: null,
          })
        }
      } catch { /* ignore */ }
    } catch {
      if (!cancelledRef.current) {
        setDbStatus('error')
        setApiLatency(null)
        setSchemaCheck('fail')
      }
    } finally {
      if (!cancelledRef.current) setLatencyLoading(false)
    }

    // Memory: Chromium có performance.memory, fallback cho Firefox/Safari
    if ((performance as any).memory?.usedJSHeapSize) {
      const usedMB = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024))
      const totalMB = (performance as any).memory.jsHeapSizeLimit ? Math.round((performance as any).memory.jsHeapSizeLimit / (1024 * 1024)) : null
      setMemoryUsage(`${usedMB} MB${totalMB ? ` / ${totalMB} MB` : ''}`)
      setMemoryDetail(`HeapLimit ${totalMB ? totalMB + ' MB' : 'N/A'}`)
    } else {
      const nav: any = navigator
      const devMem = nav.deviceMemory ? `${nav.deviceMemory} GB` : null
      const cores = nav.hardwareConcurrency ? `${nav.hardwareConcurrency} cores` : null
      if (devMem || cores) {
        setMemoryUsage([devMem, cores].filter(Boolean).join(' · '))
        setMemoryDetail('Trình duyệt không hỗ trợ performance.memory (Firefox/Safari) — hiển thị deviceMemory thay thế')
      } else {
        setMemoryUsage('N/A')
        setMemoryDetail('Trình duyệt không hỗ trợ đo RAM chi tiết')
      }
    }
  }, [getConflicts])

  useEffect(() => {
    if (isOpen) {
      cancelledRef.current = false
      const summary = readOmrSequenceEvidenceSummary()
      setSequenceSummary(summary)
      if (summary.plan) {
        setSequenceDeviceProfile(summary.plan.deviceProfile)
        setSequenceBrowserProfile(summary.plan.browser)
        setSequenceTarget(summary.plan.targetSheets)
      }
      runDiagnostics()
    }
    return () => { cancelledRef.current = true }
  }, [isOpen, runDiagnostics])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const currentReleaseCompletion = sequenceSummary.completedReleases.find(item => item.releaseId === sequenceReleaseId)
    ?? { releaseId: sequenceReleaseId, runs: 0, sheets: 0 }
  const historicalReleaseRuns = sequenceSummary.completedRuns - currentReleaseCompletion.runs
  const activeReadinessChecks = sequenceSummary.active ? [
    {
      label: 'Case chưa rõ đã vào review/conflict',
      detail: `${sequenceSummary.active.readiness.routedUnresolved}/${sequenceSummary.active.readiness.unresolvedSamples}`,
      status: sequenceSummary.active.readiness.unresolved,
    },
    {
      label: 'Reload đã khôi phục run',
      detail: `${sequenceSummary.active.readiness.reloadRecovered}/${sequenceSummary.active.readiness.reloadAttempts}`,
      status: sequenceSummary.active.readiness.reload,
    },
    {
      label: 'Observer responsiveness đã attach',
      detail: sequenceSummary.active.readiness.responsivenessObserver,
      status: sequenceSummary.active.readiness.responsiveness,
    },
    {
      label: 'Nguồn memory đã lấy mẫu',
      detail: sequenceSummary.active.readiness.memoryMeasurement,
      status: sequenceSummary.active.readiness.memory,
    },
    {
      label: 'Không có lỗi toàn vẹn',
      detail: `${sequenceSummary.active.readiness.safetyFailures} lỗi`,
      status: sequenceSummary.active.readiness.safety,
    },
  ] : []

  const statusInfo = {
    healthy: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600', label: 'Hoạt Động Tốt', Icon: ShieldCheck },
    error: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-600', label: 'Có Lỗi', Icon: AlertTriangle },
    checking: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600', label: 'Đang Kiểm Tra', Icon: AlertTriangle },
  }
  const st = statusInfo[dbStatus]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Bảng Chẩn Đoán Hệ Thống">
      <div ref={trapRef} className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="bg-parish-primary text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Activity className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Bảng Chẩn Đoán Hệ Thống</h2>
              <p className="text-xs text-white/80">Giám sát thời gian thực cho Admin</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Đóng bảng chẩn đoán" className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`p-4 ${st.bg} ${st.border} rounded-xl flex items-center gap-3`}>
              <st.Icon className={`w-8 h-8 ${st.text} shrink-0`} />
              <div>
                <div className="text-xs text-text-muted font-semibold uppercase">Trạng Thái Hệ Thống</div>
                <div className={`text-sm font-extrabold ${st.text}`}>{st.label}</div>
              </div>
            </div>

            <div className="p-4 bg-parish-info/10 border border-parish-info/30 rounded-xl flex items-center gap-3">
              <Zap className="w-8 h-8 text-parish-info shrink-0" />
              <div>
                <div className="text-xs text-text-muted font-semibold uppercase">API Latency</div>
                <div className="text-sm font-extrabold text-parish-info">
                  {latencyLoading ? '...' : apiLatency !== null ? `${apiLatency} ms` : 'N/A'}
                </div>
              </div>
            </div>

            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center gap-3" title={memoryDetail || undefined}>
              <Cpu className="w-8 h-8 text-purple-600 shrink-0" />
              <div>
                <div className="text-xs text-text-muted font-semibold uppercase">Bộ Nhớ RAM JS Heap</div>
                <div className={`text-sm font-extrabold ${memoryUsage ? 'text-purple-600' : 'text-text-muted'}`}>{memoryUsage || 'N/A'}</div>
                {memoryDetail && <div className="text-[10px] text-text-muted leading-tight">{memoryDetail}</div>}
              </div>
            </div>
          </div>

          {/* Health chi tiết + Schema */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-surface-hover/20 border border-surface-border rounded-xl">
              <div className="text-[11px] font-bold uppercase text-text-muted flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> Server Health</div>
              <div className="mt-1 text-xs space-y-0.5">
                <div className="flex justify-between"><span className="text-text-muted">DB:</span><span className={`font-bold ${healthDetails?.database === 'connected' ? 'text-emerald-600' : healthDetails ? 'text-rose-600' : 'text-text-muted'}`}>{healthDetails?.database || (dbStatus === 'checking' ? '...' : 'N/A')}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Uptime:</span><span className="font-mono font-bold">{healthDetails ? `${Math.floor(healthDetails.uptimeSeconds / 3600)}h ${Math.floor((healthDetails.uptimeSeconds % 3600)/60)}m` : 'N/A'}</span></div>
                <div className="text-[10px] text-text-muted truncate" title={healthDetails?.timestamp || ''}>{healthDetails?.timestamp ? new Date(healthDetails.timestamp).toLocaleString('vi-VN') : ''}</div>
              </div>
            </div>
            <div className="p-3 bg-surface-hover/20 border border-surface-border rounded-xl">
              <div className="text-[11px] font-bold uppercase text-text-muted flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Schema & API</div>
              <div className="mt-1 text-xs space-y-1">
                <div className="flex items-center gap-1.5">
                  {schemaCheck === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : schemaCheck === 'fail' ? <XCircle className="w-3.5 h-3.5 text-rose-600" /> : <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />}
                  <span className={schemaCheck === 'ok' ? 'text-emerald-700 font-bold' : schemaCheck === 'fail' ? 'text-rose-700 font-bold' : 'text-text-muted'}>{schemaCheck === 'ok' ? 'target_audience OK' : schemaCheck === 'fail' ? 'Lỗi schema/API' : 'Đang kiểm...'}</span>
                </div>
                <div className="flex justify-between text-[11px]"><span className="text-text-muted">Server notices:</span><span className="font-bold">{serverCounts.notices !== null ? serverCounts.notices : '—'}</span><span className="text-text-muted">Local:</span><span className="font-bold">{notices.length}</span></div>
                {serverCounts.notices !== null && serverCounts.notices !== notices.length && (
                  <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Lệch {Math.abs(serverCounts.notices - notices.length)} bản ghi — có thể ghost-data hoặc chưa sync</div>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase text-text-muted mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-parish-primary" />
              <span>Chỉ Số Lưu Trữ Dữ Liệu Local</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <div className="text-lg font-black text-parish-primary">{students.length}</div>
                <div className="text-[11px] text-text-muted font-semibold">Thiếu Nhi</div>
              </div>
              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <div className="text-lg font-black text-parish-primary">{grades.length}</div>
                <div className="text-[11px] text-text-muted font-semibold">Bản Ghi Điểm</div>
              </div>
              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <div className="text-lg font-black text-parish-primary">{attendance.length}</div>
                <div className="text-[11px] text-text-muted font-semibold">Điểm Danh</div>
              </div>
              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <div className="text-lg font-black text-parish-primary">{notices.length}</div>
                <div className="text-[11px] text-text-muted font-semibold">Thông Báo</div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-parish-info/10 border border-parish-info/30 rounded-xl space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase text-parish-info flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Bằng Chứng OMR Thiết Bị Thật
                </h3>
                <p className="text-[11px] text-text-muted mt-1">
                  Chỉ lưu timing/counter/memory cục bộ; không lưu ảnh, đáp án, học sinh, phiên hay giáo xứ.
                </p>
                <p className="text-[11px] text-text-muted mt-1 font-mono">
                  Release: {sequenceReleaseId}
                  {['dev', 'local', 'unknown'].includes(sequenceReleaseId.toLowerCase()) && ' — chưa cấu hình, không thể chuẩn bị field run'}
                </p>
              </div>
              <span className="badge badge-info shrink-0">
                {sequenceSummary.active
                  ? `${sequenceSummary.active.sheets}/${sequenceSummary.active.targetSheets}`
                  : sequenceSummary.plan ? 'Đã chuẩn bị' : `${currentReleaseCompletion.runs} run release này`}
              </span>
            </div>

            {sequenceSummary.active ? (
              <div className="rounded-lg border border-parish-info/30 bg-surface-card p-3 text-xs space-y-1">
                <div className="font-bold text-parish-info">Run đang hoạt động</div>
                <div className="text-text-muted font-mono break-all">
                  {sequenceSummary.active.profile.releaseId} · {sequenceSummary.active.profile.deviceProfile} · {sequenceSummary.active.profile.browser} · {sequenceSummary.active.profile.frameWidth}×{sequenceSummary.active.profile.frameHeight} · {sequenceSummary.active.profile.templateMode}
                </div>
                <div className="flex justify-between"><span>Đã ghi bền vững</span><strong>{sequenceSummary.active.sheets}/{sequenceSummary.active.targetSheets}</strong></div>
                <div className="flex justify-between"><span>Chờ acknowledgement</span><strong>{sequenceSummary.active.pendingAcknowledgements}</strong></div>
                <div className="mt-2 border-t border-surface-border pt-2 space-y-1.5">
                  <div className="font-bold text-text-main">Preflight bằng chứng trong run</div>
                  {activeReadinessChecks.map(check => (
                    <div key={check.label} className="flex items-start justify-between gap-3">
                      <span className="flex items-start gap-1.5">
                        {check.status === 'pass'
                          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          : check.status === 'fail'
                            ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-parish-danger" />
                            : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                        <span>{check.label}</span>
                      </span>
                      <strong className="font-mono text-right">{check.detail}</strong>
                    </div>
                  ))}
                  <p className="text-[10px] text-text-muted">
                    Đây là kiểm tra độ đầy đủ tại chỗ, chưa phải PASS qualification; target hiệu năng và corpus accuracy vẫn được đánh giá riêng.
                  </p>
                </div>
                {sequenceSummary.lastIssue && <div className="text-parish-danger font-bold">Gate: {sequenceSummary.lastIssue}</div>}
              </div>
            ) : sequenceSummary.plan ? (
              <div className="rounded-lg border border-parish-info/30 bg-surface-card p-3 text-xs">
                Đã chuẩn bị run <strong>{sequenceSummary.plan.targetSheets} phiếu</strong> cho{' '}
                <span className="font-mono">{sequenceSummary.plan.releaseId} · {sequenceSummary.plan.deviceProfile} · {sequenceSummary.plan.browser}</span>.
                Recorder sẽ khóa kích thước frame/template ở proposal đầu tiên.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  value={sequenceDeviceProfile}
                  onChange={event => setSequenceDeviceProfile(event.target.value)}
                  className="form-input text-xs"
                  placeholder="Thiết bị: iphone-13"
                  aria-label="Nhãn profile thiết bị OMR"
                />
                <input
                  value={sequenceBrowserProfile}
                  onChange={event => setSequenceBrowserProfile(event.target.value)}
                  className="form-input text-xs"
                  placeholder="Browser: safari-18"
                  aria-label="Nhãn profile trình duyệt OMR"
                />
                <select
                  value={sequenceTarget}
                  onChange={event => setSequenceTarget(Number(event.target.value) as OmrSequenceRunTarget)}
                  className="form-input text-xs"
                  aria-label="Số phiếu mục tiêu cho run OMR"
                >
                  <option value={30}>30 phiếu</option>
                  <option value={100}>100 phiếu</option>
                </select>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!sequenceSummary.active && !sequenceSummary.plan && (
                <button
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                  onClick={() => {
                    const result = armOmrSequenceEvidence({
                      releaseId: sequenceReleaseId,
                      deviceProfile: sequenceDeviceProfile.trim(),
                      browser: sequenceBrowserProfile.trim(),
                      targetSheets: sequenceTarget,
                    })
                    setSequenceMessage(result.ok
                      ? 'Đã chuẩn bị run. Mở quét liên tiếp; recorder bắt đầu ở proposal hợp lệ đầu tiên.'
                      : `Không thể chuẩn bị run: ${result.reason}.`)
                    setSequenceSummary(readOmrSequenceEvidenceSummary())
                  }}
                >
                  <Play className="w-3.5 h-3.5" /> Chuẩn Bị Run
                </button>
              )}
              <button
                className="btn btn-secondary btn-sm flex items-center gap-1.5"
                disabled={currentReleaseCompletion.runs === 0}
                onClick={() => {
                  const count = downloadOmrSequenceEvidenceManifest(sequenceReleaseId)
                  setSequenceMessage(count > 0
                    ? `Đã xuất ${count} run không PII của đúng release ${sequenceReleaseId}.`
                    : 'Chưa có run hoàn tất của release hiện tại để xuất.')
                }}
              >
                <Download className="w-3.5 h-3.5" /> Xuất Manifest ({currentReleaseCompletion.runs})
              </button>
              <button
                className="btn btn-secondary btn-sm flex items-center gap-1.5"
                disabled={currentReleaseCompletion.runs === 0}
                onClick={() => {
                  try {
                    const profiles = downloadOmrSequenceTargetsScaffold(
                      buildOmrSequenceEvidenceManifest(undefined, sequenceReleaseId),
                    )
                    setSequenceMessage(profiles > 0
                      ? `Đã xuất target scaffold cho ${profiles} exact profile; chủ sản phẩm phải điền toàn bộ target null.`
                      : 'Chưa có run hoàn tất của release hiện tại để tạo target scaffold.')
                  } catch (error) {
                    setSequenceMessage(`Không thể tạo target scaffold: ${error instanceof Error ? error.message : 'invalid_manifest'}.`)
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" /> Xuất Target Mẫu
              </button>
              {(sequenceSummary.active || sequenceSummary.plan) && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    const ok = await askConfirm({
                      title: 'Hủy run OMR',
                      message: 'Hủy run đang thu hoặc đang chờ? Dữ liệu chưa hoàn tất của run này sẽ bị xóa.',
                      confirmText: 'Hủy Run',
                      variant: 'danger',
                    })
                    if (!ok) return
                    discardActiveOmrSequenceEvidence()
                    setSequenceSummary(readOmrSequenceEvidenceSummary())
                    setSequenceMessage('Đã hủy run chưa hoàn tất.')
                  }}
                >
                  Hủy Run
                </button>
              )}
              {sequenceSummary.active && (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      const ok = await askConfirm({
                        title: 'Ghi lỗi sai danh tính',
                        message: 'Chỉ xác nhận khi proposal vừa gắn nhầm phiếu với học sinh. Run này sẽ không thể PASS safety gate.',
                        confirmText: 'Ghi Lỗi',
                        variant: 'danger',
                      })
                      if (!ok) return
                      recordOmrSequenceSafetyCounter('staleIdentityCount')
                      setSequenceSummary(readOmrSequenceEvidenceSummary())
                      setSequenceMessage('Đã ghi một lỗi sai danh tính vào run; gate sẽ fail-closed.')
                    }}
                  >
                    Ghi Sai Danh Tính
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      const ok = await askConfirm({
                        title: 'Ghi lỗi mutation trùng',
                        message: 'Chỉ xác nhận khi cùng một durable mutation bị tạo hai lần. Run này sẽ không thể PASS safety gate.',
                        confirmText: 'Ghi Lỗi',
                        variant: 'danger',
                      })
                      if (!ok) return
                      recordOmrSequenceSafetyCounter('duplicateDurableMutationCount')
                      setSequenceSummary(readOmrSequenceEvidenceSummary())
                      setSequenceMessage('Đã ghi một lỗi durable mutation trùng; gate sẽ fail-closed.')
                    }}
                  >
                    Ghi Mutation Trùng
                  </button>
                </>
              )}
              {sequenceSummary.completedRuns > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    const ok = await askConfirm({
                      title: 'Xóa manifest OMR',
                      message: 'Chỉ xóa các run đã hoàn tất trên thiết bị này. Hãy xuất JSON trước nếu cần lưu bằng chứng.',
                      confirmText: 'Xóa Run Đã Xuất',
                      variant: 'danger',
                    })
                    if (!ok) return
                    clearCompletedOmrSequenceEvidence()
                    setSequenceSummary(readOmrSequenceEvidenceSummary())
                    setSequenceMessage('Đã xóa các run hoàn tất khỏi thiết bị.')
                  }}
                >
                  Xóa Run Đã Xuất
                </button>
              )}
            </div>
            {historicalReleaseRuns > 0 && (
              <div className="text-[11px] text-amber-700">
                Có {historicalReleaseRuns} run thuộc release cũ đang được giữ riêng; export hiện tại không trộn chúng vào artifact {sequenceReleaseId}.
              </div>
            )}
            {sequenceMessage && <div className="text-[11px] text-text-muted">{sequenceMessage}</div>}
          </div>

          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-amber-600" />
                <div>
                  <div className="text-xs font-bold text-amber-800">Hàng Chờ Đồng Bộ Ngoại Tuyến</div>
                  <div className="text-xs text-amber-700 mt-0.5">Hiện có {pendingSyncOps} thao tác chờ đồng bộ lên Server</div>
                  {Object.keys(queueByEntity).length > 0 && (
                    <div className="text-[10px] text-amber-700/80 mt-1 flex flex-wrap gap-1">
                      {Object.entries(queueByEntity).map(([entity, count]) => (
                        <span key={entity} className="bg-white/60 border border-amber-200 rounded px-1.5 py-0.5 font-mono">{entity}: {count}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            <div className="flex gap-2">
              <button
                onClick={() => syncNow()}
                className="px-3 py-1.5 bg-parish-primary hover:bg-parish-primary-hover text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Đồng Bộ Ngay</span>
              </button>
              <button
                onClick={runDiagnostics}
                disabled={latencyLoading}
                className="btn btn-secondary text-xs font-bold flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${latencyLoading ? 'animate-spin' : ''}`} />
                <span>Chẩn Đoán Lại</span>
              </button>
            </div>
          </div>
          </div>

          {/* Option 1: Failed Operations Section */}
          {failedOps.length > 0 && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                  <h3 className="text-xs font-bold text-rose-800 uppercase">Thao Tác Thất Bại ({failedOps.length})</h3>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={async () => {
                      for (const op of failedOps) await updateOp(op.id, { status: 'retrying', retryCount: 0 })
                      await runDiagnostics()
                      syncNow()
                    }}
                    className="text-[10px] font-bold bg-rose-600 text-white px-2 py-1 rounded hover:bg-rose-700"
                  >
                    Thử Lại Tất Cả
                  </button>
                  <button 
                    onClick={async () => {
                      const ok = await askConfirm({
                        title: 'Xóa thao tác lỗi',
                        message: 'Xóa tất cả thao tác lỗi?',
                        confirmText: 'Xóa Hết',
                        variant: 'danger',
                      })
                      if (!ok) return
                      for (const op of failedOps) await removeOp(op.id)
                      await runDiagnostics()
                    }}
                    className="text-[10px] font-bold bg-surface-hover text-rose-600 px-2 py-1 rounded hover:bg-rose-100"
                  >
                    Xóa Hết
                  </button>
                </div>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
                {failedOps.map(op => (
                  <div key={op.id} className="text-[10px] p-2 bg-surface-card border border-rose-200 rounded-lg flex justify-between items-start">
                    <div>
                      <span className="font-bold text-rose-700 uppercase">{op.operation} {op.entity}</span>
                      <span className="ml-2 text-text-muted">#{op.entityId}</span>
                      <div className="text-rose-600 italic mt-0.5 truncate max-w-[200px]">{op.lastError || 'Lỗi không xác định'}</div>
                    </div>
                    <button 
                      onClick={async () => {
                        await removeOp(op.id)
                        await runDiagnostics()
                      }}
                      className="text-rose-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Option 1: Conflict Inbox Section */}
          <div className="p-4 bg-parish-primary/10 border border-parish-primary/30 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-parish-primary" />
              <div>
                <div className="text-xs font-bold text-parish-primary">Hộp Thư Xung Đột Dữ Liệu</div>
                <div className="text-xs text-parish-primary/80 mt-0.5">
                  {conflicts.filter(c => !c.resolved).length > 0 
                    ? `Có ${conflicts.filter(c => !c.resolved).length} xung đột mới cần xử lý` 
                    : 'Không có xung đột dữ liệu nào chưa giải quyết'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowConflictInbox(true)}
              className="btn btn-primary btn-sm"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Mở Hộp Thư</span>
            </button>
          </div>
        </div>
        
        {showConflictInbox && (
          <ConflictInboxModal 
            isOpen={showConflictInbox} 
            onClose={() => {
              setShowConflictInbox(false)
              runDiagnostics()
            }} 
          />
        )}

        <div className="p-4 bg-surface-hover/20 border-t border-surface-border flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-surface-hover text-text-main text-xs font-bold rounded-xl transition-colors">
            Đóng Bảng Chẩn Đoán
          </button>
        </div>
      </div>
      {confirmDialog}
    </div>
  )
}
