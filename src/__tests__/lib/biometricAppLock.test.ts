import { beforeEach, describe, expect, it, vi } from 'vitest'

const { native, biometric } = vi.hoisted(() => ({
  native: { enabled: true, platform: 'android' },
  biometric: { check: vi.fn(), authenticate: vi.fn() },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.enabled,
    getPlatform: () => native.platform,
  },
}))

vi.mock('@aparajita/capacitor-biometric-auth', () => {
  class MockBiometryError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return {
    AndroidBiometryStrength: { strong: 'strong' },
    BiometricAuth: { checkBiometry: biometric.check, authenticate: biometric.authenticate },
    BiometryError: MockBiometryError,
    BiometryErrorType: {
      appCancel: 'appCancel',
      authenticationFailed: 'authenticationFailed',
      biometryLockout: 'biometryLockout',
      biometryNotAvailable: 'biometryNotAvailable',
      biometryNotEnrolled: 'biometryNotEnrolled',
      systemCancel: 'systemCancel',
      userCancel: 'userCancel',
    },
    BiometryType: {
      none: 0,
      touchId: 1,
      faceId: 2,
      fingerprintAuthentication: 3,
      faceAuthentication: 4,
      irisAuthentication: 5,
    },
  }
})

import {
  authenticateWithBiometrics,
  checkBiometricCapability,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
} from '../../lib/biometricAppLock'

const baseResult = {
  isAvailable: true,
  strongBiometryIsAvailable: true,
  biometryType: 3,
  biometryTypes: [3, 4],
  deviceIsSecure: true,
  reason: '',
  code: '',
  strongReason: '',
  strongCode: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  native.enabled = true
  native.platform = 'android'
  biometric.check.mockResolvedValue(baseResult)
  biometric.authenticate.mockResolvedValue(undefined)
})

describe('biometricAppLock native bridge', () => {
  it('từ chối Android chỉ có weak biometric và dùng strong reason', async () => {
    biometric.check.mockResolvedValue({
      ...baseResult,
      strongBiometryIsAvailable: false,
      strongReason: 'Strong biometry is not enrolled',
    })

    await expect(checkBiometricCapability()).resolves.toMatchObject({
      native: true,
      available: false,
      reason: 'Strong biometry is not enrolled',
    })
  })

  it('không suy diễn face/fingerprint trên Android từ danh sách phần cứng', async () => {
    await expect(checkBiometricCapability()).resolves.toMatchObject({
      available: true,
      label: 'sinh trắc học mạnh',
    })
  })

  it('yêu cầu strong biometric và không fallback sang mã khóa thiết bị', async () => {
    await authenticateWithBiometrics()

    expect(biometric.authenticate).toHaveBeenCalledWith(expect.objectContaining({
      allowDeviceCredential: false,
      androidBiometryStrength: 'strong',
    }))
  })

  it('lưu preference tách biệt theo giáo xứ và tài khoản', () => {
    const first = { parishId: 'PX-1', userId: 'USR-1' }
    const second = { parishId: 'PX-2', userId: 'USR-1' }

    expect(setBiometricLockEnabled(first, true)).toBe(true)
    expect(isBiometricLockEnabled(first)).toBe(true)
    expect(isBiometricLockEnabled(second)).toBe(false)
  })
})
