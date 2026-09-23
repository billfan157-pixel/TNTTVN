import React from 'react'
import {
  User,
  Clock,
  Eye,
  EyeOff,
  Award,
  CheckSquare,
  Users,
  Settings,
  Shield,
  Trash2,
  ClipboardList,
  Laptop,
  Smartphone,
  Globe,
} from 'lucide-react'
import type { AuditLog } from './auditTypes'
import {
  getActionLabel,
  getActionColor,
  getActionSeverity,
  formatTimeAgo,
  formatExactDateTime,
} from './auditTypes'
import { AuditVisualDiff } from './AuditVisualDiff'

interface AuditLogItemProps {
  log: AuditLog
  isExpanded: boolean
  onToggleExpand: () => void
}

function parseDevice(userAgent: string | null): { label: string; icon: React.ElementType } {
  if (!userAgent) return { label: 'Web', icon: Globe }
  const ua = userAgent.toLowerCase()
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return { label: 'Di động', icon: Smartphone }
  }
  return { label: 'Máy tính', icon: Laptop }
}

function getEntityIcon(entityType: string, action: string): React.ElementType {
  if (action.includes('DELETE') || action.includes('PURGE')) return Trash2
  if (entityType === 'grade') return Award
  if (entityType === 'attendance') return CheckSquare
  if (entityType === 'student') return Users
  if (entityType === 'user') return User
  if (entityType === 'settings') return Settings
  if (entityType === 'auth' || action.includes('LOGIN') || action.includes('PASSWORD')) return Shield
  if (entityType === 'exam_session') return ClipboardList
  return User
}

export const AuditLogItem: React.FC<AuditLogItemProps> = ({
  log,
  isExpanded,
  onToggleExpand,
}) => {
  const hasDiff = Boolean(log.oldValue || log.newValue)
  const IconComponent = getEntityIcon(log.entityType, log.action)
  const severity = getActionSeverity(log.action)
  const device = parseDevice(log.userAgent)
  const DeviceIcon = device.icon

  return (
    <div
      className={`px-4 py-3.5 transition-colors ${
        isExpanded ? 'bg-surface-hover/70' : 'hover:bg-surface-hover/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left Icon and Details */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
              severity === 'critical'
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-600'
                : severity === 'warning'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                : severity === 'auth'
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600'
                : 'bg-surface-hover border-surface-border text-text-muted'
            }`}
          >
            <IconComponent className="w-4 h-4" />
          </div>

          <div className="min-w-0 flex-1">
            {/* Action and Actor line */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-text-main">
                {log.userName || log.userId}
              </span>

              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold tracking-wide ${getActionColor(
                  log.action,
                  log.entityType
                )}`}
              >
                {getActionLabel(log.action, log.entityType)}
              </span>

              {log.entityType && (
                <span className="text-xs text-text-muted font-mono bg-surface-ground px-1.5 py-0.5 rounded border border-surface-border/50">
                  [{log.entityType}] {log.entityId ? log.entityId.slice(0, 14) : ''}
                </span>
              )}
            </div>

            {/* Context line (Time, IP, Device) */}
            <div className="flex items-center gap-3 mt-1 text-xs text-text-muted flex-wrap">
              <span
                className="flex items-center gap-1 cursor-help hover:text-text-main transition-colors"
                title={formatExactDateTime(log.createdAt)}
              >
                <Clock className="w-3 h-3" />
                <span>{formatTimeAgo(log.createdAt)}</span>
              </span>

              {log.ip && (
                <span className="font-mono bg-surface-ground px-1.5 py-0.2 rounded border border-surface-border/40 text-xs">
                  IP: {log.ip}
                </span>
              )}

              <span className="flex items-center gap-1 text-xs" title={log.userAgent || 'Trình duyệt'}>
                <DeviceIcon className="w-3 h-3" />
                <span>{device.label}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right Toggle Button */}
        {hasDiff && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={isExpanded ? 'Thu gọn chi tiết' : 'Xem chi tiết'}
            aria-expanded={isExpanded}
            className={`p-2 rounded-lg transition-colors shrink-0 ${
              isExpanded
                ? 'bg-parish-primary/10 text-parish-primary'
                : 'text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
            title={isExpanded ? 'Thu gọn' : 'Xem chi tiết thay đổi'}
          >
            {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded Diff Area */}
      {isExpanded && <AuditVisualDiff oldValue={log.oldValue} newValue={log.newValue} />}
    </div>
  )
}
