import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  /** false = alert 1 nút (chỉ có Xác nhận) */
  showCancel?: boolean
}

/**
 * A4 (polish plan 2026-08-14): thay thế native `confirm()`/`alert()` (chặn PWA
 * mobile, không style được) bằng ConfirmDialog — API promise tương đương:
 * `const ok = await askConfirm({ message: '...' })`.
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const askConfirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOptions(opts)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolverRef.current?.(true)
    resolverRef.current = null
    setOptions(null)
  }, [])

  const handleCancel = useCallback(() => {
    resolverRef.current?.(false)
    resolverRef.current = null
    setOptions(null)
  }, [])

  const dialog = options ? (
    <ConfirmDialog
      isOpen
      title={options.title}
      message={options.message}
      confirmText={options.confirmText}
      cancelText={options.cancelText}
      variant={options.variant}
      showCancel={options.showCancel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { askConfirm, dialog }
}