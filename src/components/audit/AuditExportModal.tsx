import React, { useState } from 'react'
import { X, Download, FileSpreadsheet, FileCode, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { rowsToSafeCsv } from '../../utils/csv'
import type { AuditFilters } from './AuditToolbar'
import { getActionLabel, formatExactDateTime } from './auditTypes'

interface AuditExportModalProps {
  isOpen: boolean
  onClose: () => void
  currentFilters: AuditFilters
  totalMatching: number
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

export const AuditExportModal: React.FC<AuditExportModalProps> = ({
  isOpen,
  onClose,
  currentFilters,
  totalMatching,
}) => {
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [exportLimit, setExportLimit] = useState<number>(100)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const handleExport = async () => {
    setIsExporting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const params: Record<string, any> = {
        page: 1,
        limit: Math.min(exportLimit, 500),
      }

      if (currentFilters.action.includes('|')) {
        const [act, ent] = currentFilters.action.split('|')
        params.action = act
        params.entityType = ent
      } else if (currentFilters.action) {
        params.action = currentFilters.action
      }

      if (currentFilters.entityType) params.entityType = currentFilters.entityType
      if (currentFilters.startDate) params.startDate = currentFilters.startDate
      if (currentFilters.endDate) params.endDate = currentFilters.endDate
      if (currentFilters.search) params.search = currentFilters.search
      if (currentFilters.severity && currentFilters.severity !== 'all') {
        params.severity = currentFilters.severity
      }

      const res = await api.getAuditLogs(params)
      const logs = res.data || []

      if (logs.length === 0) {
        setError('Không có bản ghi nào phù hợp với bộ lọc hiện tại để xuất.')
        setIsExporting(false)
        return
      }

      const timestamp = new Date().toISOString().slice(0, 10)

      if (format === 'json') {
        const jsonContent = JSON.stringify(logs, null, 2)
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' })
        triggerDownload(blob, `nhat-ky-kiem-toan-${timestamp}.json`)
      } else {
        // Format rows for CSV with Vietnamese headers & human labels
        const formattedRows = logs.map((log: any, idx: number) => ({
          'STT': idx + 1,
          'Mã Bản Ghi': log.id,
          'Thời Gian': formatExactDateTime(log.createdAt),
          'Người Thực Hiện': log.userName || log.userId,
          'Hành Động': getActionLabel(log.action, log.entityType),
          'Phân Hệ': log.entityType || '—',
          'Mã Đối Tượng': log.entityId || '—',
          'Địa Chỉ IP': log.ip || '—',
          'Giá Trị Cũ': log.oldValue || '',
          'Giá Trị Mới': log.newValue || '',
        }))

        // Prepend UTF-8 BOM (\uFEFF) for Excel Vietnamese character compatibility
        const csvContent = '\uFEFF' + rowsToSafeCsv(formattedRows)
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
        triggerDownload(blob, `nhat-ky-kiem-toan-${timestamp}.csv`)
      }

      setSuccessMessage(`Đã xuất thành công ${logs.length} bản ghi nhật ký.`)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi tạo file xuất.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-parish-primary" />
            <h3 className="text-base font-bold text-text-main">Xuất Báo Cáo Nhật Ký</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-main p-1 rounded-lg hover:bg-surface-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs">
          <div className="bg-surface-hover/60 p-3 rounded-xl space-y-1 text-text-muted">
            <p className="font-semibold text-text-main">Bộ lọc đang áp dụng:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Tổng số bản ghi khớp: <strong className="text-text-main">{totalMatching}</strong></li>
              {currentFilters.search && <li>Từ khóa: "{currentFilters.search}"</li>}
              {currentFilters.datePreset !== 'all' && (
                <li>Thời gian: {currentFilters.startDate || '—'} ➔ {currentFilters.endDate || 'Hôm nay'}</li>
              )}
              {currentFilters.severity !== 'all' && <li>Mức độ: {currentFilters.severity}</li>}
              {currentFilters.entityType && <li>Đối tượng: {currentFilters.entityType}</li>}
            </ul>
          </div>

          {/* Format Selection */}
          <div>
            <label className="block font-semibold text-text-main mb-2">Định dạng file xuất:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                  format === 'csv'
                    ? 'border-parish-primary bg-parish-primary/5 text-parish-primary ring-1 ring-parish-primary'
                    : 'border-surface-border bg-surface-card text-text-muted hover:bg-surface-hover'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold text-xs text-text-main">Excel / CSV</p>
                  <p className="text-xs text-text-muted">Mở trực tiếp trên Microsoft Excel (UTF-8)</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                  format === 'json'
                    ? 'border-parish-primary bg-parish-primary/5 text-parish-primary ring-1 ring-parish-primary'
                    : 'border-surface-border bg-surface-card text-text-muted hover:bg-surface-hover'
                }`}
              >
                <FileCode className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold text-xs text-text-main">JSON Dữ Liệu</p>
                  <p className="text-xs text-text-muted">Định dạng chuẩn cho kỹ thuật & backup</p>
                </div>
              </button>
            </div>
          </div>

          {/* Row limit */}
          <div>
            <label className="block font-semibold text-text-main mb-1.5">Số lượng bản ghi tối đa xuất:</label>
            <select
              value={exportLimit}
              onChange={(e) => setExportLimit(Number(e.target.value))}
              className="form-select text-xs w-full"
            >
              <option value={50}>50 bản ghi gần nhất</option>
              <option value={100}>100 bản ghi</option>
              <option value={200}>200 bản ghi</option>
              <option value={500}>500 bản ghi (Tối đa một lượt)</option>
            </select>
          </div>

          {error && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 bg-surface-ground border-t border-surface-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="btn btn-secondary text-xs px-3 py-2"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="btn btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
          >
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>{isExporting ? 'Đang xuất...' : 'Tải File Về Máy'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
