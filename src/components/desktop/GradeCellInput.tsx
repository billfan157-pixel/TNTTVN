import React from 'react'

export interface GradeCellInputProps {
  value: string
  studentId: string
  field: string
  disabled?: boolean
  isProtected?: boolean
  isOverride?: boolean
  placeholder?: string
  onChange: (val: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

const GradeCellInputComponent: React.FC<GradeCellInputProps> = ({
  value,
  studentId,
  field,
  disabled = false,
  isProtected = false,
  isOverride = false,
  placeholder = '-',
  onChange,
  onBlur,
  onKeyDown,
}) => {
  return (
    <input
      type="text"
      inputMode="decimal"
      data-matrix-cell="true"
      data-student-id={studentId}
      data-field={field}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={`form-input w-full text-center px-1 py-1 rounded text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-parish-primary ${
        disabled
          ? 'cell-state-locked cursor-not-allowed border-transparent'
          : isProtected || isOverride
          ? 'cell-state-edited text-parish-warning border-parish-warning/40 font-semibold'
          : 'bg-surface-card border-surface-border text-text-main focus:border-parish-primary hover:border-surface-border'
      }`}
    />
  )
}

function arePropsEqual(prev: GradeCellInputProps, next: GradeCellInputProps): boolean {
  return (
    prev.value === next.value &&
    prev.disabled === next.disabled &&
    prev.isProtected === next.isProtected &&
    prev.isOverride === next.isOverride &&
    prev.studentId === next.studentId &&
    prev.field === next.field &&
    prev.placeholder === next.placeholder
  )
}

export const GradeCellInput = React.memo(GradeCellInputComponent, arePropsEqual)
