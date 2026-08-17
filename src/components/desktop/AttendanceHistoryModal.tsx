import React, { useState, useMemo } from 'react'
import { Calendar, CheckCircle2, AlertTriangle, XCircle, Filter, BookOpen, Church, HeartHandshake } from 'lucide-react'
import type { StudentAttendanceSummary } from '../../services/attendanceAnalyticsService'
import type { AttendanceType } from '../../types'
import { ModalShell } from '../common/ModalShell'

interface AttendanceHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  summary: StudentAttendanceSummary | null
}

export const AttendanceHistoryModal: React.FC<AttendanceHistoryModalProps> = ({
  isOpen,
  onClose,
  summary,
}) => {
  const [typeFilter, setTypeFilter] = useState<'all' | AttendanceType>('all')
  const [onlyAbsents, setOnlyAbsents] = useState<boolean>(false)

  const records = useMemo(() => {
    if (!summary) return []
    return summary.historyRecords.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false
      if (onlyAbsents && r.status === 'Present') return false
      return true
    })
  }, [summary, typeFilter, onlyAbsents])

  if (!isOpen || !summary) return null

  const getSessionTypeBadge = (type: AttendanceType) => {
    switch (type) {
      case 'SundayMass':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--color-parish-info-bg)] text-[var(--color-parish-info)] border border-[var(--color-parish-info)]/20">
            <Church size={12} />
            <span>Thánh Lễ</span>
          </span>
        )
      case 'CatechismClass':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--color-parish-warning-bg)] text-[var(--color-parish-secondary)] border border-[var(--color-parish-secondary)]/20">
            <BookOpen size={12} />
            <span>Giáo Lý</span>
          </span>
        )
      case 'EucharisticAdoration':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--color-parish-primary-light)] text-[var(--color-parish-primary)] border border-[var(--color-parish-primary)]/20">
            <HeartHandshake size={12} />
            <span>Chầu / Sinh Hoạt</span>
          </span>
        )
    }
  }

  const getStatusBadge = (status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused') => {
    switch (status) {
      case 'Present':
        return (
          <span className="badge badge-success inline-flex items-center gap-1">
            <CheckCircle2 size={12} />
            <span>Hiện diện</span>
          </span>
        )
      case 'AbsentExcused':
        return (
          <span className="badge badge-warning inline-flex items-center gap-1">
            <AlertTriangle size={12} />
            <span>Vắng có phép</span>
          </span>
        )
      case 'AbsentUnexcused':
        return (
          <span className="badge badge-danger inline-flex items-center gap-1">
            <XCircle size={12} />
            <span>Vắng K.phép</span>
          </span>
        )
    }
  }

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
      const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
      const dayName = dayNames[d.getDay()] || ''
      return `${dayName}, ${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return dateStr
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`${summary.student.holyName ? `${summary.student.holyName} ` : ''}${summary.student.fullName}`}
      subtitle={`Mã ${summary.student.code} • Tỷ lệ chuyên cần: ${summary.overall.rate}% (${summary.overall.presentCount}/${summary.overall.totalSessions} buổi) — ${summary.overall.statusLabel}`}
      maxWidth="672px"
    >
      {/* Filter Toolbar */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between gap-2 flex-wrap bg-surface-card text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-text-muted font-bold flex items-center gap-1 mr-1">
              <Filter size={12} /> Loại:
            </span>
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                typeFilter === 'all'
                  ? 'bg-parish-primary text-white'
                  : 'bg-surface-app text-text-secondary hover:bg-surface-hover border border-surface-border'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setTypeFilter('SundayMass')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                typeFilter === 'SundayMass'
                  ? 'bg-[var(--color-parish-info)] text-white'
                  : 'bg-surface-app text-text-secondary hover:bg-surface-hover border border-surface-border'
              }`}
            >
              Lễ ({summary.mass.total})
            </button>
            <button
              onClick={() => setTypeFilter('CatechismClass')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                typeFilter === 'CatechismClass'
                  ? 'bg-[var(--color-parish-secondary)] text-white'
                  : 'bg-surface-app text-text-secondary hover:bg-surface-hover border border-surface-border'
              }`}
            >
              Giáo Lý ({summary.catechism.total})
            </button>
            <button
              onClick={() => setTypeFilter('EucharisticAdoration')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                typeFilter === 'EucharisticAdoration'
                  ? 'bg-[var(--color-parish-primary)] text-white'
                  : 'bg-surface-app text-text-secondary hover:bg-surface-hover border border-surface-border'
              }`}
            >
              Chầu ({summary.adoration.total})
            </button>
          </div>

          <label className="flex items-center gap-1.5 font-bold text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyAbsents}
              onChange={(e) => setOnlyAbsents(e.target.checked)}
              className="rounded border-surface-border text-parish-primary focus:ring-0"
            />
            <span>Chỉ xem ngày vắng ({summary.overall.excusedCount + summary.overall.unexcusedCount})</span>
          </label>
        </div>

        {/* Content History List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-surface-app/50">
          {records.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <Calendar size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-semibold text-sm m-0">Không có dữ liệu điểm danh phù hợp bộ lọc</p>
            </div>
          ) : (
            records.map((r, idx) => (
              <div
                key={`${r.id}-${idx}`}
                className="bg-surface-card border border-surface-border p-3.5 rounded-xl flex items-center justify-between gap-3 shadow-xs hover:border-parish-primary/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-app flex items-center justify-center text-text-muted border border-surface-border shrink-0">
                    <Calendar size={15} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-text-main">{formatDate(r.date)}</span>
                      {getSessionTypeBadge(r.type)}
                    </div>
                    {r.note && (
                      <p className="text-xs text-text-muted mt-1 m-0 italic bg-surface-app px-2 py-0.5 rounded border border-surface-border inline-block">
                        {r.note}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0">{getStatusBadge(r.status)}</div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-border flex items-center justify-between">
          <div className="text-xs text-text-muted">
            Hiển thị <strong>{records.length}</strong> buổi điểm danh
          </div>
          <button onClick={onClose} className="btn btn-secondary text-xs font-bold px-4 py-2">
            Đóng
          </button>
        </div>
    </ModalShell>
  )
}
