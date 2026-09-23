import React, { useState } from 'react'
import {
  Activity,
  ShieldAlert,
  Sliders,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Hash,
} from 'lucide-react'
import type { AuditMetricsSummary, AuditIntegrityResult } from '../../lib/api/auditLogs'
import { api } from '../../lib/api'

interface AuditPulseBarProps {
  metrics: AuditMetricsSummary | null
  loading?: boolean
  onRefreshMetrics?: () => void
}

export const AuditPulseBar: React.FC<AuditPulseBarProps> = ({
  metrics,
  loading = false,
  onRefreshMetrics,
}) => {
  const [verifying, setVerifying] = useState(false)
  const [integrityResult, setIntegrityResult] = useState<AuditIntegrityResult | null>(null)

  const handleVerifyIntegrity = async () => {
    setVerifying(true)
    try {
      const res = await api.verifyAuditIntegrity(100)
      setIntegrityResult(res)
    } catch {
      setIntegrityResult({
        status: 'TAMPERED',
        verifiedCount: 0,
        message: 'Không thể kết nối hoặc xác minh chuỗi băm nhật ký.',
      })
    } finally {
      setVerifying(false)
    }
  }

  const cards = [
    {
      id: 'total',
      title: 'Hoạt Động 24h',
      value: metrics ? metrics.total24h.toLocaleString('vi-VN') : '—',
      subtitle: metrics ? `7 ngày qua: ${metrics.total7d.toLocaleString('vi-VN')} lượt` : 'Đang tải...',
      icon: Activity,
      color: 'text-sky-600 bg-sky-500/10 border-sky-500/20',
      badge: `${metrics?.activeUsers24h || 0} tác nhân`,
    },
    {
      id: 'security',
      title: 'Cảnh Báo An Ninh',
      value: metrics ? metrics.securityAlerts24h.toLocaleString('vi-VN') : '—',
      subtitle: metrics && metrics.securityAlerts24h > 0 ? 'Cần kiểm tra đăng nhập' : 'Không có sự cố bất thường',
      icon: ShieldAlert,
      color: metrics && metrics.securityAlerts24h > 0
        ? 'text-rose-600 bg-rose-500/10 border-rose-500/20 animate-pulse'
        : 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
      badge: metrics && metrics.securityAlerts24h > 0 ? 'Cảnh giác' : 'An toàn',
    },
    {
      id: 'mutations',
      title: 'Can Thiệp Trọng Yếu',
      value: metrics ? metrics.criticalMutations24h.toLocaleString('vi-VN') : '—',
      subtitle: 'Ghi đè điểm, khóa sổ, chính sách',
      icon: Sliders,
      color: 'text-violet-600 bg-violet-500/10 border-violet-500/20',
      badge: 'Nghiệp vụ',
    },
    {
      id: 'destructive',
      title: 'Thao Tác Xóa & Hủy',
      value: metrics ? metrics.destructiveActions24h.toLocaleString('vi-VN') : '—',
      subtitle: 'Xóa học sinh, lớp, purge, undo',
      icon: Trash2,
      color: metrics && metrics.destructiveActions24h > 0
        ? 'text-amber-600 bg-amber-500/10 border-amber-500/20'
        : 'text-slate-600 bg-slate-500/10 border-slate-500/20',
      badge: metrics && metrics.destructiveActions24h > 0 ? 'Lưu ý' : 'Bình thường',
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Xung Nhịp An Ninh & Hoạt Động Hệ Thống (24h)
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleVerifyIntegrity}
            disabled={verifying}
            title="Kiểm tra tính toàn vẹn băm SHA-256 chống chỉnh sửa trực tiếp trong DB"
            className="btn btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5"
          >
            {verifying ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Hash className="w-3.5 h-3.5 text-parish-primary" />
            )}
            <span>{verifying ? 'Đang xác minh...' : 'Kiểm Tra Toàn Vẹn Băm'}</span>
          </button>

          {onRefreshMetrics && (
            <button
              type="button"
              onClick={onRefreshMetrics}
              disabled={loading}
              title="Làm mới chỉ số xung nhịp"
              className="p-1.5 text-text-muted hover:text-text-main rounded-md hover:bg-surface-hover"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {integrityResult && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
            integrityResult.status === 'VERIFIED'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : integrityResult.status === 'EMPTY'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-start gap-2 min-w-0">
            {integrityResult.status === 'VERIFIED' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{integrityResult.message}</p>
              {integrityResult.chainRoot && (
                <p className="font-mono text-xs mt-0.5 opacity-80 truncate max-w-xl">
                  Root Hash: {integrityResult.chainRoot}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIntegrityResult(null)}
            className="text-text-muted hover:text-text-main font-bold px-1"
          >
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.id}
              className="bg-surface-card border border-surface-border rounded-xl p-3.5 flex flex-col justify-between shadow-xs transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-muted">{card.title}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${card.color}`}>
                  {card.badge}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-text-main">{card.value}</span>
                <Icon className="w-4 h-4 text-text-muted shrink-0 ml-auto" />
              </div>
              <p className="text-xs text-text-muted mt-1 truncate">{card.subtitle}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
