import { Capacitor } from '@capacitor/core'
import {
  AndroidBiometryStrength,
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
  BiometryType,
  type CheckBiometryResult,
} from '@aparajita/capacitor-biometric-auth'

const APP_LOCK_KEY_PREFIX = 'catevia:biometric-lock:v1'

export interface AppLockAccount {
  userId: string
  parishId: string
}

export interface BiometricCapability {
  native: boolean
  available: boolean
  label: string
  reason: string | null
  type: BiometryType
}

export function appLockAccountKey(account: AppLockAccount): string {
  return `${account.parishId}:${account.userId}`
}

function preferenceKey(account: AppLockAccount): string {
  return `${APP_LOCK_KEY_PREFIX}:${encodeURIComponent(account.parishId)}:${encodeURIComponent(account.userId)}`
}

export function isNativeBiometricPlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function isBiometricLockEnabled(account: AppLockAccount): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(preferenceKey(account)) === 'enabled'
  } catch {
    // Khi đang có phiên native mà storage lỗi, khóa fail-closed; màn recovery
    // luôn cho phép đăng xuất sạch để quay về mật khẩu.
    return true
  }
}

export function setBiometricLockEnabled(account: AppLockAccount, enabled: boolean): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    const key = preferenceKey(account)
    if (enabled) localStorage.setItem(key, 'enabled')
    else localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function labelForBiometry(result: CheckBiometryResult): string {
  // Android chỉ công bố đáng tin cậy mức availability/strength; danh sách
  // modality là phần cứng hỗ trợ, không chứng minh modality nào đã enrollment.
  if (Capacitor.getPlatform() === 'android') return 'sinh trắc học mạnh'

  const types = result.biometryTypes.length > 0 ? result.biometryTypes : [result.biometryType]
  const hasFace = types.includes(BiometryType.faceId) || types.includes(BiometryType.faceAuthentication)
  const hasFingerprint = types.includes(BiometryType.touchId) || types.includes(BiometryType.fingerprintAuthentication)
  if (hasFace && hasFingerprint) return 'Face ID hoặc dấu vân tay'
  if (hasFace) return result.biometryType === BiometryType.faceId ? 'Face ID' : 'nhận diện khuôn mặt'
  if (hasFingerprint) return result.biometryType === BiometryType.touchId ? 'Touch ID' : 'dấu vân tay'
  if (result.biometryType === BiometryType.irisAuthentication) return 'quét mống mắt'
  return 'sinh trắc học'
}

function unavailableReason(result: CheckBiometryResult): string {
  if (result.code === BiometryErrorType.biometryNotEnrolled) {
    return 'Thiết bị chưa đăng ký Face ID hoặc dấu vân tay.'
  }
  if (result.code === BiometryErrorType.biometryLockout) {
    return 'Sinh trắc học đang bị khóa tạm thời do xác minh sai nhiều lần.'
  }
  if (result.code === BiometryErrorType.biometryNotAvailable) {
    return 'Thiết bị không hỗ trợ sinh trắc học cho ứng dụng.'
  }
  return result.reason || 'Sinh trắc học hiện không khả dụng.'
}

export async function checkBiometricCapability(): Promise<BiometricCapability> {
  if (!isNativeBiometricPlatform()) {
    return {
      native: false,
      available: false,
      label: 'Face ID hoặc dấu vân tay',
      reason: 'Tính năng khóa ứng dụng chỉ khả dụng trên bản Catevia Android/iOS.',
      type: BiometryType.none,
    }
  }

  try {
    const result = await BiometricAuth.checkBiometry()
    const available = result.strongBiometryIsAvailable
    const unavailable = available
      ? null
      : unavailableReason({
          ...result,
          code: result.strongCode || result.code,
          reason: result.strongReason || result.reason,
        })
    return {
      native: true,
      available,
      label: labelForBiometry(result),
      reason: unavailable,
      type: result.biometryType,
    }
  } catch {
    return {
      native: true,
      available: false,
      label: 'Face ID hoặc dấu vân tay',
      reason: 'Không thể kiểm tra sinh trắc học trên thiết bị này.',
      type: BiometryType.none,
    }
  }
}

export async function authenticateWithBiometrics(): Promise<void> {
  if (!isNativeBiometricPlatform()) {
    throw new Error('Sinh trắc học chỉ khả dụng trên bản Catevia Android/iOS.')
  }

  await BiometricAuth.authenticate({
    reason: 'Mở khóa Catevia',
    cancelTitle: 'Hủy',
    allowDeviceCredential: false,
    iosFallbackTitle: '',
    androidTitle: 'Mở khóa Catevia',
    androidSubtitle: 'Xác minh bằng khuôn mặt hoặc dấu vân tay',
    androidConfirmationRequired: true,
    androidBiometryStrength: AndroidBiometryStrength.strong,
  })
}

export function biometricErrorMessage(error: unknown): string {
  if (error instanceof BiometryError) {
    if (error.code === BiometryErrorType.userCancel || error.code === BiometryErrorType.systemCancel || error.code === BiometryErrorType.appCancel) {
      return 'Bạn đã hủy xác minh sinh trắc học.'
    }
    if (error.code === BiometryErrorType.authenticationFailed) {
      return 'Không nhận diện được. Vui lòng thử lại.'
    }
    if (error.code === BiometryErrorType.biometryLockout) {
      return 'Sinh trắc học đang bị khóa tạm thời. Hãy chờ rồi thử lại hoặc đăng xuất để dùng mật khẩu.'
    }
    if (error.code === BiometryErrorType.biometryNotEnrolled) {
      return 'Thiết bị chưa đăng ký Face ID hoặc dấu vân tay.'
    }
    if (error.code === BiometryErrorType.biometryNotAvailable) {
      return 'Sinh trắc học hiện không khả dụng trên thiết bị.'
    }
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Không thể xác minh sinh trắc học. Vui lòng thử lại.'
}
