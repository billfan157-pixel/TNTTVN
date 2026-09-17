import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authState, lockState, navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  authState: {
    authReady: false,
    user: null as null | { id: string; parishId: string },
    logout: vi.fn(),
  },
  lockState: {
    initializedFor: null as string | null,
    capability: { native: true, available: true, label: 'Face ID', reason: null, type: 2 },
    enabled: false,
    locked: false,
    authenticating: false,
    error: null as string | null,
    initialize: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue(true),
    clearForPasswordRecovery: vi.fn(),
  },
}))

vi.mock('../../stores/authStore', () => {
  const useAuthStore = Object.assign(
    (selector: (state: typeof authState) => unknown) => selector(authState),
    { getState: () => authState },
  )
  return { useAuthStore }
})

vi.mock('../../stores/appLockStore', () => ({
  useAppLockStore: (selector: (state: typeof lockState) => unknown) => selector(lockState),
}))

vi.mock('../../lib/biometricAppLock', () => ({
  appLockAccountKey: (account: { parishId: string; userId: string }) => `${account.parishId}:${account.userId}`,
  isNativeBiometricPlatform: () => true,
}))
vi.mock('../../router', () => ({ router: { navigate } }))

import { BiometricLockGate } from '../../components/auth/BiometricLockGate'

beforeEach(() => {
  vi.clearAllMocks()
  authState.authReady = false
  authState.user = null
  lockState.initializedFor = null
  lockState.enabled = false
  lockState.locked = false
  lockState.authenticating = false
  lockState.error = null
})

describe('BiometricLockGate', () => {
  it('password recovery waits for logout and uses in-app navigation to preserve its warning', async () => {
    authState.authReady = true
    authState.user = { id: 'USR-1', parishId: 'PX-1' }
    lockState.initializedFor = 'PX-1:USR-1'
    lockState.enabled = true
    lockState.locked = true
    let finish!: () => void
    authState.logout.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    render(<BiometricLockGate><div>Nội dung bảo vệ</div></BiometricLockGate>)
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất và dùng mật khẩu' }))
    expect(authState.logout).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
    finish()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }))
  })

  it('native cold start không mount protected tree trước khi auth bootstrap xong', () => {
    render(<BiometricLockGate><div>Nội dung bảo vệ</div></BiometricLockGate>)

    expect(screen.queryByText('Nội dung bảo vệ')).not.toBeInTheDocument()
    expect(screen.getByText('Đang xác thực phiên làm việc…')).toBeInTheDocument()
  })

  it('không mount protected tree khi tài khoản đang bị khóa', () => {
    authState.authReady = true
    authState.user = { id: 'USR-1', parishId: 'PX-1' }
    lockState.initializedFor = 'PX-1:USR-1'
    lockState.enabled = true
    lockState.locked = true

    render(<BiometricLockGate><div>Nội dung bảo vệ</div></BiometricLockGate>)

    expect(screen.queryByText('Nội dung bảo vệ')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Catevia đang khóa' })).toBeInTheDocument()
  })

  it('mount protected tree sau khi mở khóa thành công', () => {
    authState.authReady = true
    authState.user = { id: 'USR-1', parishId: 'PX-1' }
    lockState.initializedFor = 'PX-1:USR-1'
    lockState.enabled = true
    lockState.locked = false

    render(<BiometricLockGate><div>Nội dung bảo vệ</div></BiometricLockGate>)

    expect(screen.getByText('Nội dung bảo vệ')).toBeInTheDocument()
  })
})
