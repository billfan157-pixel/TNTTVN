import React, { useState, useMemo } from 'react'
import { Code, Eye, ArrowRight, Check, Minus } from 'lucide-react'

interface AuditVisualDiffProps {
  oldValue: string | null
  newValue: string | null
}

interface FieldDiff {
  key: string
  oldVal: unknown
  newVal: unknown
  status: 'modified' | 'added' | 'removed' | 'unchanged'
}

function parseJsonSafe(val: string | null): any {
  if (!val) return null
  try {
    return JSON.parse(val)
  } catch {
    return val
  }
}

function formatVal(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'Bật (true)' : 'Tắt (false)'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

export const AuditVisualDiff: React.FC<AuditVisualDiffProps> = ({
  oldValue,
  newValue,
}) => {
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual')

  const oldParsed = useMemo(() => parseJsonSafe(oldValue), [oldValue])
  const newParsed = useMemo(() => parseJsonSafe(newValue), [newValue])

  const isBothObjects = useMemo(() => {
    return (
      oldParsed &&
      typeof oldParsed === 'object' &&
      !Array.isArray(oldParsed) &&
      newParsed &&
      typeof newParsed === 'object' &&
      !Array.isArray(newParsed)
    )
  }, [oldParsed, newParsed])

  const fieldDiffs = useMemo<FieldDiff[]>(() => {
    if (!isBothObjects) return []
    const allKeys = Array.from(new Set([...Object.keys(oldParsed || {}), ...Object.keys(newParsed || {})]))
    return allKeys.map((key) => {
      const hasOld = key in (oldParsed || {})
      const hasNew = key in (newParsed || {})
      const oldV = (oldParsed as any)?.[key]
      const newV = (newParsed as any)?.[key]

      if (!hasOld && hasNew) {
        return { key, oldVal: null, newVal: newV, status: 'added' }
      }
      if (hasOld && !hasNew) {
        return { key, oldVal: oldV, newVal: null, status: 'removed' }
      }
      if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
        return { key, oldVal: oldV, newVal: newV, status: 'modified' }
      }
      return { key, oldVal: oldV, newVal: newV, status: 'unchanged' }
    })
  }, [isBothObjects, oldParsed, newParsed])

  const changedDiffs = useMemo(() => {
    return fieldDiffs.filter((d) => d.status !== 'unchanged')
  }, [fieldDiffs])

  return (
    <div className="mt-3 border border-surface-border/70 rounded-xl overflow-hidden bg-surface-ground/50">
      {/* Diff Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-surface-card border-b border-surface-border text-xs">
        <span className="font-semibold text-text-muted">Chi tiết thay đổi dữ liệu</span>
        <div className="flex items-center gap-1 bg-surface-hover/80 p-0.5 rounded-md">
          <button
            type="button"
            onClick={() => setViewMode('visual')}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors inline-flex items-center gap-1 ${
              viewMode === 'visual' ? 'bg-surface-card text-text-main font-bold shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Trực quan</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('raw')}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors inline-flex items-center gap-1 ${
              viewMode === 'raw' ? 'bg-surface-card text-text-main font-bold shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Code className="w-3 h-3" />
            <span>JSON Thô</span>
          </button>
        </div>
      </div>

      {/* Visual Mode */}
      {viewMode === 'visual' && isBothObjects && (
        <div className="p-3 space-y-2">
          {changedDiffs.length === 0 ? (
            <p className="text-xs text-text-muted italic py-1">Không phát hiện thay đổi trường trực tiếp.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {changedDiffs.map((diff) => (
                <div
                  key={diff.key}
                  className="flex items-start justify-between gap-3 text-xs p-2 rounded-lg bg-surface-card border border-surface-border/60 hover:border-surface-border"
                >
                  <span className="font-mono font-semibold text-text-main shrink-0 min-w-[120px]">
                    {diff.key}:
                  </span>

                  {diff.status === 'modified' && (
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <span className="line-through text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded font-mono">
                        {formatVal(diff.oldVal)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-text-muted shrink-0" />
                      <span className="font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                        {formatVal(diff.newVal)}
                      </span>
                    </div>
                  )}

                  {diff.status === 'added' && (
                    <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs uppercase font-bold text-emerald-700 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                        Mới
                      </span>
                      <span className="font-bold text-emerald-600 font-mono">
                        {formatVal(diff.newVal)}
                      </span>
                    </div>
                  )}

                  {diff.status === 'removed' && (
                    <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs uppercase font-bold text-rose-700 bg-rose-500/20 px-1.5 py-0.5 rounded">
                        Đã xóa
                      </span>
                      <span className="line-through text-rose-600 font-mono">
                        {formatVal(diff.oldVal)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fallback or Raw JSON Mode */}
      {(viewMode === 'raw' || !isBothObjects) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
          {oldValue && (
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2.5">
              <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Minus className="w-3 h-3" /> Giá trị cũ
              </p>
              <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap max-h-60 overflow-auto">
                {typeof oldParsed === 'object' ? JSON.stringify(oldParsed, null, 2) : String(oldValue)}
              </pre>
            </div>
          )}
          {newValue && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Check className="w-3 h-3" /> Giá trị mới
              </p>
              <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap max-h-60 overflow-auto">
                {typeof newParsed === 'object' ? JSON.stringify(newParsed, null, 2) : String(newValue)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
