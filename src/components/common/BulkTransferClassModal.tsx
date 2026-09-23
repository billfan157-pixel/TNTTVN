import React, { useId, useMemo, useState } from 'react'
import { ArrowRightLeft, AlertCircle, Users, CheckCircle2 } from 'lucide-react'
import { ModalShell } from './ModalShell'
import { Button } from './ui/Button'
import { Select } from './ui/FormControls'
import { FormField } from './FormField'
import { useClassStore } from '../../stores/classStore'
import { useStudentStore } from '../../stores/studentStore'
import { useToastStore } from '../../stores/toastStore'
import { BRANCHES } from '../../constants/branches'
import { compareClassHierarchy } from '../../utils/classSort'

export interface BulkTransferClassModalProps {
  isOpen: boolean
  onClose: () => void
  studentIds: string[]
  onSuccess?: () => void
}

export const BulkTransferClassModal: React.FC<BulkTransferClassModalProps> = ({
  isOpen,
  onClose,
  studentIds,
  onSuccess,
}) => {
  const targetClassSelectId = useId()
  const reasonInputId = useId()

  const students = useStudentStore((s) => s.students)
  const transferStudents = useStudentStore((s) => s.transferStudents)
  const classes = useClassStore((s) => s.classes)

  const [targetClassId, setTargetClassId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedStudents = useMemo(() => {
    const idSet = new Set(studentIds)
    return students.filter((s) => idSet.has(s.id))
  }, [students, studentIds])

  // Lấy danh sách các lớp hiện tại của học viên đã chọn
  const sourceClassIds = useMemo(() => {
    return Array.from(new Set(selectedStudents.map((s) => s.classId).filter(Boolean)))
  }, [selectedStudents])

  // Lọc danh sách lớp đích khả dụng:
  // - Nếu tất cả học sinh đang cùng 1 lớp: loại bỏ lớp đó khỏi danh sách chọn
  // - Sắp xếp theo cấp bậc lớp
  const availableClasses = useMemo(() => {
    return classes
      .filter((c) => {
        if (sourceClassIds.length === 1 && c.id === sourceClassIds[0]) return false
        return true
      })
      .sort((a, b) => compareClassHierarchy(a, b, 'asc'))
  }, [classes, sourceClassIds])

  const targetClass = useMemo(() => {
    return classes.find((c) => c.id === targetClassId)
  }, [classes, targetClassId])

  const currentClassName = useMemo(() => {
    if (sourceClassIds.length === 1) {
      return classes.find((c) => c.id === sourceClassIds[0])?.name || 'Lớp hiện tại'
    }
    return `${sourceClassIds.length} lớp khác nhau`
  }, [classes, sourceClassIds])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!targetClassId) {
      setError('Vui lòng chọn lớp học đích cần chuyển đến.')
      return
    }

    const trimmedReason = reason.trim()
    if (trimmedReason.length < 5) {
      setError('Vui lòng nhập lý do chuyển lớp/ngành (tối thiểu 5 ký tự).')
      return
    }

    setSubmitting(true)
    try {
      await transferStudents(studentIds, targetClassId, trimmedReason)
      const targetName = targetClass?.name || 'lớp mới'
      useToastStore
        .getState()
        .addToast(`Đã chuyển thành công ${studentIds.length} thiếu nhi sang ${targetName}`, 'success')
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể thực hiện chuyển lớp. Vui lòng thử lại.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Chuyển Lớp Cho Thiếu Nhi"
      subtitle={`Điều chuyển ${selectedStudents.length} em sang lớp học khác`}
      icon={<ArrowRightLeft className="text-primary" size={20} />}
      maxWidth="540px"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            loadingLabel="Đang chuyển..."
            leadingIcon={<ArrowRightLeft aria-hidden="true" size={15} />}
            disabled={submitting || !targetClassId || reason.trim().length < 5}
          >
            Xác Nhận Chuyển Lớp
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-1">
        {/* Error notification */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 p-3 rounded-xl bg-parish-danger-bg border border-parish-danger/30 text-xs font-bold text-parish-danger animate-in fade-in"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Selected Students Info Card */}
        <div className="rounded-xl border border-surface-border bg-surface-hover/60 p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-text-muted flex items-center gap-1.5">
              <Users size={14} className="text-primary" />
              <span>Học viên được chọn:</span>
            </span>
            <span className="font-extrabold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {selectedStudents.length} em
            </span>
          </div>

          <div className="text-xs text-text-secondary">
            <span className="text-text-muted">Từ: </span>
            <strong className="text-text-primary">{currentClassName}</strong>
          </div>

          {/* Student Chips */}
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {selectedStudents.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-surface-card border border-surface-border text-text-primary shadow-2xs"
              >
                <span className="text-amber-950 dark:text-amber-400 font-semibold">{s.holyName}</span>
                <span>{s.fullName}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Target Class Selection */}
        <FormField
          htmlFor={targetClassSelectId}
          label="Lớp học đích"
          required
          hint="Học viên sẽ được cập nhật lớp và phân ngành tương ứng với lớp đích"
        >
          <Select
            id={targetClassSelectId}
            value={targetClassId}
            onChange={(e) => {
              setTargetClassId(e.target.value)
              if (error) setError(null)
            }}
            className="w-full text-sm font-bold"
            required
          >
            <option value="">-- Chọn lớp cần chuyển đến --</option>
            {availableClasses.map((c) => {
              const branch = BRANCHES[c.branchId as keyof typeof BRANCHES]?.name || c.branchId
              const teacher = c.homeroomTeacher?.fullName ? ` • GLV: ${c.homeroomTeacher.fullName}` : ''
              return (
                <option key={c.id} value={c.id}>
                  {c.name} ({branch}{teacher})
                </option>
              )
            })}
          </Select>
        </FormField>

        {/* Transfer Confirmation Summary */}
        {targetClass && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              Sẽ chuyển <strong>{selectedStudents.length} em</strong> sang lớp <strong>{targetClass.name}</strong> (Ngành: {BRANCHES[targetClass.branchId as keyof typeof BRANCHES]?.name || targetClass.branchId}).
            </span>
          </div>
        )}

        {/* Reason for Transfer */}
        <FormField
          htmlFor={reasonInputId}
          label="Lý do chuyển lớp"
          required
          hint="Bắt buộc tối thiểu 5 ký tự để lưu vết nhật ký kiểm toán hành chính"
        >
          <textarea
            id={reasonInputId}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (error) setError(null)
            }}
            placeholder="Ví dụ: Chia lại sĩ số đầu năm, chuyển ca học theo nguyện vọng phụ huynh..."
            rows={3}
            maxLength={500}
            className="w-full p-2.5 rounded-xl border border-surface-border bg-surface-card text-text-primary text-xs font-medium placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            required
          />
        </FormField>
        <div className="flex justify-end -mt-3 text-2xs text-text-muted">
          <span className={reason.trim().length > 0 && reason.trim().length < 5 ? 'text-parish-danger font-bold' : ''}>
            {reason.trim().length}/500 ký tự (tối thiểu 5)
          </span>
        </div>
      </form>
    </ModalShell>
  )
}

export default BulkTransferClassModal
