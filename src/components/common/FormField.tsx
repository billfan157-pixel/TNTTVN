
import { cloneElement } from 'react'
import type { ReactElement } from 'react'

interface FormFieldProps {
  label: string
  htmlFor: string
  required?: boolean
  error?: string | null
  hint?: string
  children: ReactElement<Record<string, unknown>>
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
  const existingDescribedBy = typeof children.props['aria-describedby'] === 'string'
    ? children.props['aria-describedby']
    : null
  const describedBy = [
    existingDescribedBy,
    error ? `${htmlFor}-error` : null,
    hint ? `${htmlFor}-hint` : null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div className="form-group">
      <label htmlFor={htmlFor} className="form-label">
        {label}
        {required && <span className="text-parish-danger ml-0.5" aria-hidden="true">*</span>}
      </label>
      {cloneElement(children, {
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-describedby': describedBy,
      })}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="form-help-text m-0">
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
import React from 'react'
