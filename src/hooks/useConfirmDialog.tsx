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
  /**
   * UX-WAIT (audit 2026-09-24): nếu có `action`, khi bấm Xác nhận dialog KHÔNG đóng
   * ngay — nút xác nhận quay spinner (isBusy) cho tới khi action chạy xong rồi mới
   * đóng. Dùng cho các thao tác gọi backend để người dùng thấy phản hồi trong lúc
   * chờ thay vì "bấm xong màn hình đơ". Lỗi trong action phải tự xử lý bên trong
   * (toast/inline) như các handler hiện tại; hook chỉ console.error để không
   * sinh unhandled rejection.
   */
  action?: () => Promise<unknown> | unknown
}

/**
 * A4 (polish plan 2026-08-14): thay thế native `confirm()`/`alert()` (chặn PWA
 * mobile, không style được) bằng ConfirmDialog — API promise tương đương:
 * `const ok = await askConfirm({ message: '...' })`.
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)
  const optionsRef = useRef<ConfirmOptions | null>(null)
  optionsRef.current = options

  const askConfirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOptions(opts)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    const action = optionsRef.current?.action
    if (!action) {
      resolverRef.current?.(true)
      resolverRef.current = null
      setOptions(null)
      return
    }
    if (isBusy) return
    setIsBusy(true)
    Promise.resolve()
      .then(action)
      .catch((error) => {
        console.error('ConfirmDialog action failed:', error)
      })
      .finally(() => {
        setIsBusy(false)
        setOptions(null)
        resolverRef.current?.(true)
        resolverRef.current = null
      })
  }, [isBusy])

  const handleCancel = useCallback(() => {
    if (isBusy) return
    resolverRef.current?.(false)
    resolverRef.current = null
    setOptions(null)
  }, [isBusy])

  const dialog = options ? (
    <ConfirmDialog
      isOpen
      title={options.title}
      message={options.message}
      confirmText={options.confirmText}
      cancelText={options.cancelText}
      variant={options.variant}
      showCancel={options.showCancel}
      isBusy={isBusy}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { askConfirm, dialog, isBusy }
}
