import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Activity, Database, HardDrive, ShieldCheck, RefreshCw, X, Zap, Cpu, AlertTriangle } from 'lucide-react'
import { getDB } from '../../lib/db'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useNoticeStore } from '../../stores/noticeStore'

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
  const [apiLatency, setApiLatency] = useState<number | null>(null)
  const [latencyLoading, setLatencyLoading] = useState(false)
  const [dbStatus, setDbStatus] = useState<'healthy' | 'error' | 'checking'>('checking')
  const [memoryUsage, setMemoryUsage] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const runDiagnostics = useCallback(async () => {
    cancelledRef.current = false
    setDbStatus('checking')
    setLatencyLoading(true)
    setApiLatency(null)
    const start = performance.now()

    try {
      const db = getDB()
      const pendingCount = await db.syncQueue.where('status').anyOf(['pending', 'retrying']).count()
      if (cancelledRef.current) return
      setPendingSyncOps(pendingCount)

      const res = await fetch('/health', { signal: AbortSignal.timeout(5000) })
      const duration = Math.round(performance.now() - start)
      if (cancelledRef.current) return
      setApiLatency(duration)
      setDbStatus(res.ok ? 'healthy' : 'error')
    } catch {
      if (!cancelledRef.current) {
        setDbStatus('error')
        setApiLatency(null)
      }
    } finally {
      if (!cancelledRef.current) setLatencyLoading(false)
    }

    if ((performance as any).memory) {
      const usedMB = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024))
      setMemoryUsage(`${usedMB} MB`)
    } else {
      setMemoryUsage(null)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      cancelledRef.current = false
      runDiagnostics()
    }
    return () => { cancelledRef.current = true }
  }, [isOpen, runDiagnostics])

  if (!isOpen) return null

  const statusInfo = {
    healthy: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600', label: 'Hoạt Động Tốt', Icon: ShieldCheck },
    error: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-600', label: 'Có Lỗi', Icon: AlertTriangle },
    checking: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600', label: 'Đang Kiểm Tra', Icon: AlertTriangle },
  }
  const st = statusInfo[dbStatus]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Bảng Chẩn Đoán Hệ Thống">
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="bg-parish-primary text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Activity className="w-6 h-6 text-[#FDE047]" />
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

            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-3">
              <Zap className="w-8 h-8 text-blue-600 shrink-0" />
              <div>
                <div className="text-xs text-text-muted font-semibold uppercase">API Latency</div>
                <div className="text-sm font-extrabold text-blue-600">
                  {latencyLoading ? '...' : apiLatency !== null ? `${apiLatency} ms` : 'N/A'}
                </div>
              </div>
            </div>

            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center gap-3">
              <Cpu className="w-8 h-8 text-purple-600 shrink-0" />
              <div>
                <div className="text-xs text-text-muted font-semibold uppercase">Bộ Nhớ RAM JS Heap</div>
                <div className={`text-sm font-extrabold ${memoryUsage ? 'text-purple-600' : 'text-text-muted'}`}>{memoryUsage || 'N/A'}</div>
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

          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-amber-600" />
              <div>
                <div className="text-xs font-bold text-amber-800">Hàng Chờ Đồng Bộ Ngoại Tuyến</div>
                <div className="text-xs text-amber-700 mt-0.5">Hiện có {pendingSyncOps} thao tác chờ đồng bộ lên Server</div>
              </div>
            </div>
            <button
              onClick={runDiagnostics}
              disabled={latencyLoading}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${latencyLoading ? 'animate-spin' : ''}`} />
              <span>{latencyLoading ? 'Đang Chẩn Đoán' : 'Chẩn Đoán Lại'}</span>
            </button>
          </div>
        </div>

        <div className="p-4 bg-surface-hover/20 border-t border-surface-border flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-surface-hover text-text-main text-xs font-bold rounded-xl transition-colors">
            Đóng Bảng Chẩn Đoán
          </button>
        </div>
      </div>
    </div>
  )
}
