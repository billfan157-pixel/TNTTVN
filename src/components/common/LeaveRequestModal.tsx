import React, { useId, useState } from 'react'
import { Calendar, AlertCircle, Send, CheckSquare, Square, Church, BookOpen, Flame } from 'lucide-react'
import { useLeaveRequestStore } from '../../stores/leaveRequestStore'
import { getDefaultDate } from '../../utils/getDefaultDate'
import type { LeaveRequestSessionType } from '../../types'
import { ModalShell } from './ModalShell'

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

  const studentDisplay = `Thiếu nhi: ${holyName ? holyName + ' ' : ''}${studentName}${className ? ` (${className})` : ''}`

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={<Calendar className="w-5 h-5 text-parish-primary" />}
      title="Đơn Xin Phép Nghỉ"
      subtitle={studentDisplay}
      maxWidth="32rem"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-parish-danger-bg border border-parish-danger/30 text-xs font-semibold text-parish-danger flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Date Picker */}
        <div>
          <label htmlFor={dateId} className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
            Ngày Xin Nghỉ <span className="text-parish-danger">*</span>
          </label>
          <input
            type="date"
            id={dateId}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (error) setError(null);
            }}
            className="form-input w-full text-sm font-bold"
            required
          />
        </div>

        {/* Sessions Selection */}
        <fieldset className="border-none p-0 m-0">
          <legend className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
            Buổi Xin Nghỉ <span className="text-parish-danger">*</span>
          </legend>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => toggleSession('SundayMass')}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left text-sm font-bold transition-all ${
                selectedSessions.includes('SundayMass')
                  ? 'bg-parish-primary-light border-parish-primary text-parish-primary shadow-xs'
                  : 'bg-surface-card border-surface-border text-text-muted hover:bg-surface-hover'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                selectedSessions.includes('SundayMass') ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-muted'
              }`}>
                <Church size={16} />
              </div>
              <div className="flex-1">
                <div>Thánh Lễ Chúa Nhật</div>
                <div className="text-xs font-medium opacity-80">Bắt buộc tham dự</div>
              </div>
              {selectedSessions.includes('SundayMass') ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>

            <button
              type="button"
              onClick={() => toggleSession('CatechismClass')}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left text-sm font-bold transition-all ${
                selectedSessions.includes('CatechismClass')
                  ? 'bg-parish-primary-light border-parish-primary text-parish-primary shadow-xs'
                  : 'bg-surface-card border-surface-border text-text-muted hover:bg-surface-hover'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                selectedSessions.includes('CatechismClass') ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-muted'
              }`}>
                <BookOpen size={16} />
              </div>
              <div className="flex-1">
                <div>Giờ Học Giáo Lý</div>
                <div className="text-xs font-medium opacity-80">Điểm danh lớp</div>
              </div>
              {selectedSessions.includes('CatechismClass') ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>

            <button
              type="button"
              onClick={() => toggleSession('EucharisticAdoration')}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left text-sm font-bold transition-all ${
                selectedSessions.includes('EucharisticAdoration')
                  ? 'bg-parish-primary-light border-parish-primary text-parish-primary shadow-xs'
                  : 'bg-surface-card border-surface-border text-text-muted hover:bg-surface-hover'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                selectedSessions.includes('EucharisticAdoration') ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-muted'
              }`}>
                <Flame size={16} />
              </div>
              <div className="flex-1">
                <div>Chầu Thánh Thể</div>
                <div className="text-xs font-medium opacity-80">Giờ kinh Xứ đoàn</div>
              </div>
              {selectedSessions.includes('EucharisticAdoration') ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
          </div>
        </fieldset>

        {/* Reason */}
        <div>
          <label htmlFor={reasonId} className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
            Lý Do Xin Nghỉ <span className="text-parish-danger">*</span>
          </label>
          <textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            placeholder="VD: Em bị sốt / Gia đình có việc đột xuất về quê..."
            className={`form-textarea w-full text-sm resize-none ${(!reason.trim() || reason.trim().length < 3) && error ? 'border-parish-danger focus:ring-parish-danger' : ''}`}
            aria-invalid={(!reason.trim() || reason.trim().length < 3) && error ? 'true' : undefined}
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
    </ModalShell>
  )
}
