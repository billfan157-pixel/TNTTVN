import { beforeEach, describe, expect, it, vi } from 'vitest'

const { biometric, preferences, preferenceStorage, appState } = vi.hoisted(() => ({
  biometric: {
    check: vi.fn(),
    authenticate: vi.fn(),
  },
  preferences: new Map<string, boolean>(),
  preferenceStorage: { writable: true },
  appState: {
    listener: null as null | ((state: { isActive: boolean }) => void),
  },
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_event: string, listener: (state: { isActive: boolean }) => void) => {
      appState.listener = listener
      return { remove: vi.fn() }
    }),
  },
}))

vi.mock('../../lib/biometricAppLock', () => ({
  appLockAccountKey: (account: { parishId: string; userId: string }) => `${account.parishId}:${account.userId}`,
  authenticateWithBiometrics: biometric.authenticate,
  biometricErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Lỗi sinh trắc học',
  checkBiometricCapability: biometric.check,
  isBiometricLockEnabled: (account: { parishId: string; userId: string }) => preferences.get(`${account.parishId}:${account.userId}`) === true,
  isNativeBiometricPlatform: () => true,
  setBiometricLockEnabled: (account: { parishId: string; userId: string }, enabled: boolean) => {
    if (!preferenceStorage.writable) return false
    const key = `${account.parishId}:${account.userId}`
    if (enabled) preferences.set(key, true)
    else preferences.delete(key)
    return true
  },
}))

import { installAppLockLifecycle, useAppLockStore } from '../../stores/appLockStore'

const account = { parishId: 'PX-1', userId: 'USR-1' }
const availableCapability = {
  native: true,
  available: true,
  label: 'Face ID hoặc dấu vân tay',
  reason: null,
  type: 2,
}

beforeEach(async () => {
  vi.clearAllMocks()
  preferences.clear()
  preferenceStorage.writable = true
  biometric.check.mockResolvedValue(availableCapability)
  biometric.authenticate.mockResolvedValue(undefined)
  await useAppLockStore.getState().initialize(null)
})

describe('appLockStore', () => {
  it('khởi tạo khóa fail-closed khi tài khoản đã bật sinh trắc học', async () => {
    preferences.set('PX-1:USR-1', true)

    await useAppLockStore.getState().initialize(account)

    expect(useAppLockStore.getState()).toMatchObject({
      initializedFor: 'PX-1:USR-1',
      enabled: true,
      locked: true,
    })
  })

  it('chỉ lưu lựa chọn bật sau khi thiết bị xác minh thành công', async () => {
    await useAppLockStore.getState().initialize(account)

    expect(await useAppLockStore.getState().enable(account)).toBe(true)
    expect(biometric.authenticate).toHaveBeenCalledTimes(1)
    expect(preferences.get('PX-1:USR-1')).toBe(true)
    expect(useAppLockStore.getState()).toMatchObject({ enabled: true, locked: false })
  })

  it('không bật khóa nếu xác minh bị hủy hoặc thất bại', async () => {
    biometric.authenticate.mockRejectedValueOnce(new Error('Bạn đã hủy xác minh sinh trắc học.'))
    await useAppLockStore.getState().initialize(account)

    expect(await useAppLockStore.getState().enable(account)).toBe(false)
    expect(preferences.has('PX-1:USR-1')).toBe(false)
    expect(useAppLockStore.getState().error).toContain('đã hủy')
  })

  it('không báo bật thành công nếu thiết bị từ chối ghi preference', async () => {
    await useAppLockStore.getState().initialize(account)
    preferenceStorage.writable = false

    expect(await useAppLockStore.getState().enable(account)).toBe(false)
    expect(useAppLockStore.getState()).toMatchObject({ enabled: false, locked: false })
    expect(useAppLockStore.getState().error).toContain('Không thể lưu')
  })

  it('tắt khóa cũng bắt buộc xác minh; recovery chỉ xóa khóa để đăng xuất', async () => {
    preferences.set('PX-1:USR-1', true)
    await useAppLockStore.getState().initialize(account)
    biometric.authenticate.mockRejectedValueOnce(new Error('Không nhận diện được'))

    expect(await useAppLockStore.getState().disable(account)).toBe(false)
    expect(preferences.get('PX-1:USR-1')).toBe(true)

    useAppLockStore.getState().clearForPasswordRecovery(account)
    expect(preferences.has('PX-1:USR-1')).toBe(false)
    expect(useAppLockStore.getState()).toMatchObject({ enabled: false, locked: false })
  })

  it('lựa chọn khóa được scope riêng theo giáo xứ và tài khoản', async () => {
    preferences.set('PX-1:USR-1', true)
    await useAppLockStore.getState().initialize({ parishId: 'PX-2', userId: 'USR-1' })

    expect(useAppLockStore.getState()).toMatchObject({
      initializedFor: 'PX-2:USR-1',
      enabled: false,
      locked: false,
    })
  })

  it('ra nền khóa ngay; quay lại tự yêu cầu xác minh', async () => {
    await installAppLockLifecycle()
    preferences.set('PX-1:USR-1', true)
    await useAppLockStore.getState().initialize(account)
    await useAppLockStore.getState().unlock()
    biometric.authenticate.mockClear()
    biometric.check.mockClear()

    appState.listener?.({ isActive: false })
    expect(useAppLockStore.getState().locked).toBe(true)

    appState.listener?.({ isActive: true })
    await vi.waitFor(() => expect(biometric.check).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(biometric.authenticate).toHaveBeenCalledTimes(1))
    expect(useAppLockStore.getState().locked).toBe(false)
  })
})
