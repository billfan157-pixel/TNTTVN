import { App } from '@capacitor/app'
import { create } from 'zustand'
import {
  appLockAccountKey,
  authenticateWithBiometrics,
  biometricErrorMessage,
  checkBiometricCapability,
  isBiometricLockEnabled,
  isNativeBiometricPlatform,
  setBiometricLockEnabled,
  type AppLockAccount,
  type BiometricCapability,
} from '../lib/biometricAppLock'

interface AppLockState {
  initializedFor: string | null
  capability: BiometricCapability | null
  enabled: boolean
  locked: boolean
  authenticating: boolean
  error: string | null
  initialize: (account: AppLockAccount | null) => Promise<void>
  enable: (account: AppLockAccount) => Promise<boolean>
  disable: (account: AppLockAccount) => Promise<boolean>
  unlock: () => Promise<boolean>
  lock: () => void
  clearForPasswordRecovery: (account: AppLockAccount) => void
}

let activeAccount: AppLockAccount | null = null
let unlockPromise: Promise<boolean> | null = null
let lifecycleInstalled = false

export const useAppLockStore = create<AppLockState>((set, get) => ({
  initializedFor: null,
  capability: null,
  enabled: false,
  locked: false,
  authenticating: false,
  error: null,

  initialize: async (account) => {
    activeAccount = account
    if (!account) {
      set({ initializedFor: null, capability: null, enabled: false, locked: false, authenticating: false, error: null })
      return
    }

    const accountKey = appLockAccountKey(account)
    const enabled = isBiometricLockEnabled(account)
    set({
      initializedFor: accountKey,
      capability: null,
      enabled,
      locked: enabled,
      authenticating: false,
      error: null,
    })

    const capability = await checkBiometricCapability()
    if (!activeAccount || appLockAccountKey(activeAccount) !== accountKey) return
    set({ capability, error: enabled && !capability.available ? capability.reason : null })
  },

  enable: async (account) => {
    const accountKey = appLockAccountKey(account)
    if (get().initializedFor !== accountKey) await get().initialize(account)
    const capability = get().capability
    if (!capability?.available) {
      set({ error: capability?.reason || 'Sinh trắc học hiện không khả dụng.' })
      return false
    }

    set({ authenticating: true, error: null })
    try {
      await authenticateWithBiometrics()
      if (!setBiometricLockEnabled(account, true)) {
        throw new Error('Không thể lưu lựa chọn khóa sinh trắc học trên thiết bị.')
      }
      activeAccount = account
      set({ enabled: true, locked: false, authenticating: false, error: null })
      return true
    } catch (error) {
      set({ authenticating: false, error: biometricErrorMessage(error) })
      return false
    }
  },

  disable: async (account) => {
    if (!get().enabled) return true
    set({ authenticating: true, error: null })
    try {
      await authenticateWithBiometrics()
      if (!setBiometricLockEnabled(account, false)) {
        throw new Error('Không thể tắt khóa sinh trắc học trên thiết bị.')
      }
      set({ enabled: false, locked: false, authenticating: false, error: null })
      return true
    } catch (error) {
      set({ authenticating: false, error: biometricErrorMessage(error) })
      return false
    }
  },

  unlock: async () => {
    if (!get().enabled || !get().locked) return true
    if (unlockPromise) return unlockPromise

    unlockPromise = (async () => {
      set({ authenticating: true, error: null })
      try {
        await authenticateWithBiometrics()
        set({ locked: false, authenticating: false, error: null })
        return true
      } catch (error) {
        set({ locked: true, authenticating: false, error: biometricErrorMessage(error) })
        return false
      } finally {
        unlockPromise = null
      }
    })()
    return unlockPromise
  },

  lock: () => {
    const state = get()
    if (state.enabled && !state.authenticating) set({ locked: true, error: null })
  },

  clearForPasswordRecovery: (account) => {
    // Dù storage đang lỗi, recovery vẫn phải tiếp tục logout; lần đăng nhập kế
    // tiếp sẽ fail-closed nếu marker chưa xóa được.
    setBiometricLockEnabled(account, false)
    set({ enabled: false, locked: false, authenticating: false, error: null })
  },
}))

export async function installAppLockLifecycle(): Promise<void> {
  if (lifecycleInstalled || !isNativeBiometricPlatform()) return
  lifecycleInstalled = true
  await App.addListener('appStateChange', async ({ isActive }) => {
    const state = useAppLockStore.getState()
    if (!isActive) {
      state.lock()
      return
    }

    // Native enrollment/lockout có thể đổi khi app ở nền. Không reset store
    // trong lúc OS prompt đang chạy vì chính prompt có thể phát lifecycle event.
    if (state.authenticating) return
    if (state.enabled && activeAccount) {
      await state.initialize(activeAccount)
    }

    const refreshedState = useAppLockStore.getState()
    if (refreshedState.enabled && refreshedState.locked && refreshedState.capability?.available && !refreshedState.authenticating) {
      void refreshedState.unlock()
    }
  })
}
