import React, { useState, useEffect } from 'react'
import {
  Search,
  X,
  Calendar,
  Filter,
  Download,
  RotateCcw,
} from 'lucide-react'
import {
  type AuditSeverity,
  FILTER_ACTIONS,
} from './auditTypes'

export interface AuditFilters {
  search: string
  severity: AuditSeverity
  entityType: string
  action: string
  startDate: string
  endDate: string
  datePreset: 'all' | 'today' | '7days' | '30days' | 'custom'
}

interface AuditToolbarProps {
  filters: AuditFilters
  onChangeFilters: (filters: AuditFilters) => void
  onRefresh: () => void
  onOpenExport: () => void
  isFiltered: boolean
  onResetFilters: () => void
}

const SEVERITY_BUTTONS: { id: AuditSeverity; label: string; activeClass: string }[] = [
  { id: 'all', label: 'Tất Cả Mức Độ', activeClass: 'bg-parish-primary text-white shadow-xs' },
  { id: 'critical', label: '🚨 Nguy Cấp', activeClass: 'bg-rose-600 text-white shadow-xs' },
  { id: 'warning', label: '⚠️ Cảnh Báo', activeClass: 'bg-amber-600 text-white shadow-xs' },
  { id: 'auth', label: '🛡️ Xác Thực', activeClass: 'bg-indigo-600 text-white shadow-xs' },
  { id: 'info', label: 'ℹ️ Thông Tin', activeClass: 'bg-emerald-600 text-white shadow-xs' },
]

export const AuditToolbar: React.FC<AuditToolbarProps> = ({
  filters,
  onChangeFilters,
  onRefresh,
  onOpenExport,
  isFiltered,
  onResetFilters,
}) => {
  const [searchInput, setSearchInput] = useState(filters.search)

  // Debounce search input to avoid spamming requests
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChangeFilters({ ...filters, search: searchInput })
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [searchInput, filters, onChangeFilters])

  const handleDatePreset = (preset: AuditFilters['datePreset']) => {
    const today = new Date().toISOString().slice(0, 10)
    if (preset === 'today') {
      onChangeFilters({ ...filters, datePreset: preset, startDate: today, endDate: today })
    } else if (preset === '7days') {
      const past7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      onChangeFilters({ ...filters, datePreset: preset, startDate: past7, endDate: today })
    } else if (preset === '30days') {
      const past30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      onChangeFilters({ ...filters, datePreset: preset, startDate: past30, endDate: today })
    } else if (preset === 'all') {
      onChangeFilters({ ...filters, datePreset: preset, startDate: '', endDate: '' })
    } else {
      onChangeFilters({ ...filters, datePreset: 'custom' })
    }
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-3.5 space-y-3 shadow-xs">
      {/* Search and Primary Action Row */}
      <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo người thực hiện, đối tượng, IP, nội dung..."
            className="form-input pl-9 pr-8 text-sm w-full min-h-[40px]"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('')
                onChangeFilters({ ...filters, search: '' })
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenExport}
            className="btn btn-secondary text-xs px-3 py-2 inline-flex items-center gap-1.5 min-h-[40px]"
            title="Xuất file CSV hoặc JSON các bản ghi đã lọc"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Báo Cáo</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="btn btn-primary text-xs px-3 py-2 inline-flex items-center gap-1.5 min-h-[40px]"
            title="Làm mới danh sách nhật ký"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Làm Mới</span>
          </button>
        </div>
      </div>

      {/* Date Presets and Filters Row */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-surface-border/50">
        <div className="inline-flex items-center gap-1 p-0.5 bg-surface-hover/70 rounded-lg text-xs">
          <span className="px-2 py-1 text-text-muted font-semibold flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Ngày:
          </span>
          <button
            type="button"
            onClick={() => handleDatePreset('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              filters.datePreset === 'all' ? 'bg-surface-card text-text-main font-bold shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => handleDatePreset('today')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              filters.datePreset === 'today' ? 'bg-surface-card text-text-main font-bold shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Hôm nay
          </button>
          <button
            type="button"
            onClick={() => handleDatePreset('7days')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              filters.datePreset === '7days' ? 'bg-surface-card text-text-main font-bold shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            7 ngày
          </button>
          <button
            type="button"
            onClick={() => handleDatePreset('30days')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              filters.datePreset === '30days' ? 'bg-surface-card text-text-main font-bold shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            30 ngày
          </button>
          <button
            type="button"
            onClick={() => handleDatePreset('custom')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              filters.datePreset === 'custom' ? 'bg-surface-card text-text-main font-bold shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Tùy chọn
          </button>
        </div>

        {filters.datePreset === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs bg-surface-hover/50 p-1 rounded-lg">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onChangeFilters({ ...filters, startDate: e.target.value })}
              className="form-input text-xs py-1 px-2 h-7"
            />
            <span className="text-text-muted">➔</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onChangeFilters({ ...filters, endDate: e.target.value })}
              className="form-input text-xs py-1 px-2 h-7"
            />
          </div>
        )}

        <div className="flex-1" />

        {isFiltered && (
          <button
            type="button"
            onClick={onResetFilters}
            className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 rounded hover:bg-rose-50 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            <span>Xóa bộ lọc</span>
          </button>
        )}
      </div>

      {/* Dropdown Filters and Severity Pills */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={filters.action}
            onChange={(e) => onChangeFilters({ ...filters, action: e.target.value })}
            className="form-select text-xs font-medium py-1.5 h-8 min-w-[170px]"
          >
            <option value="">Tất cả hành động</option>
            {FILTER_ACTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={filters.entityType}
            onChange={(e) => onChangeFilters({ ...filters, entityType: e.target.value })}
            className="form-select text-xs font-medium py-1.5 h-8 min-w-[150px]"
          >
            <option value="">Tất cả đối tượng</option>
            <option value="user">Tài khoản</option>
            <option value="student">Thiếu nhi</option>
            <option value="grade">Điểm số</option>
            <option value="attendance">Điểm danh</option>
            <option value="class">Lớp học</option>
            <option value="exam_session">Kỳ thi</option>
            <option value="notice">Thông báo</option>
            <option value="settings">Cấu hình hệ thống</option>
            <option value="auth">Xác thực / Đăng nhập</option>
            <option value="parent">Phụ huynh</option>
          </select>
        </div>

        <div className="h-4 w-px bg-surface-border hidden sm:block mx-1" />

        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs font-semibold text-text-muted mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Mức độ:
          </span>
          {SEVERITY_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => onChangeFilters({ ...filters, severity: btn.id })}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                filters.severity === btn.id
                  ? btn.activeClass
                  : 'bg-surface-hover/80 text-text-secondary hover:text-text-main'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
