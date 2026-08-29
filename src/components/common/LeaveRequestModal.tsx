import React, { useId, useState } from 'react'
import { Calendar, X, AlertCircle, Send, CheckSquare, Square, Church, BookOpen, Flame } from 'lucide-react'
import { useLeaveRequestStore } from '../../stores/leaveRequestStore'
import { getDefaultDate } from '../../utils/getDefaultDate'
import type { LeaveRequestSessionType } from '../../types'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'

interface LeaveRequestModalProps {
  isOpen: boolean
  onClose: () => void
  studentId: string
  studentName: string
  holyName?: string
  className?: string
  onSuccess?: () => void
}

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  holyName,
  className,
  onSuccess,
}) => {
  const submitRequest = useLeaveRequestStore((s) => s.submitRequest)
  const [date, setDate] = useState<string>(getDefaultDate)
  const [selectedSessions, setSelectedSessions] = useState<LeaveRequestSessionType[]>(['SundayMass', 'CatechismClass'])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { dialogRef, titleId } = useAccessibleDialog(isOpen, onClose)
  const dateId = useId()
  const reasonId = useId()

  if (!isOpen) return null

  const toggleSession = (type: LeaveRequestSessionType) => {
    if (selectedSessions.includes(type)) {
      if (selectedSessions.length === 1) return // Keep at least one
      setSelectedSessions(selectedSessions.filter((s) => s !== type))
    } else {
      setSelectedSessions([...selectedSessions, type])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) {
      setError('Vui lòng chọn ngày cần xin phép')
      return
    }
    if (selectedSessions.length === 0) {
      setError('Vui lòng chọn ít nhất một buổi cần xin phép')
      return
    }
    if (!reason.trim() || reason.trim().length < 3) {
      setError('Vui lòng nhập lý do xin nghỉ (tối thiểu 3 ký tự)')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await submitRequest({
        studentId,
        date,
        sessionTypes: selectedSessions,
        reason: reason.trim(),
      })
      onClose()
      onSuccess?.()
    } catch (err: any) {
      setError(err?.message || 'Không thể gửi đơn xin nghỉ. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={submitting}
        className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border bg-surface-app">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-text-main m-0">Đơn Xin Phép Nghỉ</h2>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                Thiếu nhi: <span className="font-semibold text-text-main">{holyName} {studentName}</span> {className ? `(${className})` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-11 min-h-11 p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
            aria-label="Đóng đơn xin phép nghỉ"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-600 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Date Picker */}
          <div>
            <label htmlFor={dateId} className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Ngày Xin Nghỉ <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              id={dateId}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="form-input w-full text-sm font-medium"
              required
            />
          </div>

          {/* Session Types Selection */}
          <fieldset>
            <legend className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Buổi Xin Nghỉ Trong Ngày <span className="text-rose-500">*</span>
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => toggleSession('SundayMass')}
                aria-pressed={selectedSessions.includes('SundayMass')}
                className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                  selectedSessions.includes('SundayMass')
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary shadow-xs'
                    : 'border-surface-border bg-surface-card text-text-muted hover:bg-surface-hover'
                }`}
              >
                <Church size={16} className="shrink-0" />
                <div className="flex-1">
                  <div>Thánh Lễ</div>
                  <div className="text-[10px] font-medium opacity-80">Lễ Chúa Nhật</div>
                </div>
                {selectedSessions.includes('SundayMass') ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>

              <button
                type="button"
                onClick={() => toggleSession('CatechismClass')}
                aria-pressed={selectedSessions.includes('CatechismClass')}
                className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                  selectedSessions.includes('CatechismClass')
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary shadow-xs'
                    : 'border-surface-border bg-surface-card text-text-muted hover:bg-surface-hover'
                }`}
              >
                <BookOpen size={16} className="shrink-0" />
                <div className="flex-1">
                  <div>Giáo Lý</div>
                  <div className="text-[10px] font-medium opacity-80">Giờ học lớp</div>
                </div>
                {selectedSessions.includes('CatechismClass') ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>

              <button
                type="button"
                onClick={() => toggleSession('EucharisticAdoration')}
                aria-pressed={selectedSessions.includes('EucharisticAdoration')}
                className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                  selectedSessions.includes('EucharisticAdoration')
                    ? 'border-parish-primary bg-parish-primary-light text-parish-primary shadow-xs'
                    : 'border-surface-border bg-surface-card text-text-muted hover:bg-surface-hover'
                }`}
              >
                <Flame size={16} className="shrink-0" />
                <div className="flex-1">
                  <div>Chầu Thánh Thể</div>
                  <div className="text-[10px] font-medium opacity-80">Giờ kinh Xứ đoàn</div>
                </div>
                {selectedSessions.includes('EucharisticAdoration') ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            </div>
          </fieldset>

          {/* Reason */}
          <div>
            <label htmlFor={reasonId} className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Lý Do Xin Nghỉ <span className="text-rose-500">*</span>
            </label>
            <textarea
              id={reasonId}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Em bị sốt / Gia đình có việc đột xuất về quê..."
              className="form-textarea w-full text-sm resize-none"
              required
            />
            <p className="form-help-text mt-1">
              Đơn xin nghỉ sẽ được gửi trực tiếp tới Giáo lý viên Chủ nhiệm & Ban Quản trị để xét duyệt.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-surface-border">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              disabled={submitting}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              disabled={submitting}
            >
              <Send size={14} />
              {submitting ? 'Đang gửi đơn...' : 'Gửi Đơn Xin Phép'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
