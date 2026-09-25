import { forwardRef } from 'react'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const joinClasses = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  density?: 'sm' | 'md'
  invalid?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({
  density = 'md',
  invalid,
  className = '',
  ...props
}, ref) {
  return (
    <input
      {...props}
      ref={ref}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={joinClasses(density === 'sm' ? 'form-input-sm' : 'form-input', invalid && 'field-shake', className)}
    />
  )
})
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({
  invalid,
  className = '',
  ...props
}, ref) {
  return (
    <select
      {...props}
      ref={ref}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={joinClasses('form-select', invalid && 'field-shake', className)}
    />
  )
})

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({
  invalid,
  className = '',
  ...props
}, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={joinClasses('form-textarea', invalid && 'field-shake', className)}
    />
  )
})
