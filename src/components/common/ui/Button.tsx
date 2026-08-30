import { LoaderCircle } from 'lucide-react'
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'quiet' | 'plain'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingLabel?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  fullWidth?: boolean
  mobile?: boolean
}

const joinClasses = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  mobile = false,
  disabled,
  className = '',
  type = 'button',
  children,
  ...props
}, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={joinClasses(
        'btn',
        variant !== 'plain' && `btn-${variant}`,
        size !== 'md' && `btn-${size}`,
        mobile && 'mobile-btn',
        loading && 'btn-loading',
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : leadingIcon}
      {loading && loadingLabel ? loadingLabel : children}
      {!loading && trailingIcon}
    </button>
  )
})

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'leadingIcon' | 'trailingIcon'> {
  label: string
  icon: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  label,
  icon,
  variant = 'ghost',
  className = '',
  ...props
}, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      variant={variant}
      aria-label={label}
      className={joinClasses('btn-icon', className)}
    >
      {icon}
    </Button>
  )
})
