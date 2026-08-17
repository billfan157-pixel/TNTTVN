import React from 'react'

interface FormFieldProps {
  label: string
  htmlFor: string
  required?: boolean
  error?: string | null
  hint?: string
  children: React.ReactNode
}

/**
 * Form Field chuẩn DS §3.2 (ADR-030/032):
 * label + control + error `.form-error` (aria-invalid/aria-describedby) + hint.
 * Control phía caller dùng `.form-input`/`.form-select`/`.form-textarea`.
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  children,
}) => {
  const describedBy = [
    error ? `${htmlFor}-error` : null,
    hint ? `${htmlFor}-hint` : null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-text-secondary">
        {label}
        {required && <span className="text-parish-danger ml-0.5" aria-hidden="true">*</span>}
      </label>
      {React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-[11px] text-text-muted m-0">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="form-error m-0">
          {error}
        </p>
      )}
    </div>
  )
}

export default FormField