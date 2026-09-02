import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  listeners: new Map<string, (event: any) => unknown>(),
  permission: 'granted' as 'granted' | 'prompt' | 'denied',
  register: vi.fn(),
  unregister: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  registerApi: vi.fn(),
  unregisterApi: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}))

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: vi.fn(async (event: string, listener: (value: any) => unknown) => {
      native.listeners.set(event, listener)
      return { remove: vi.fn() }
    }),
    checkPermissions: vi.fn(async () => ({ receive: native.permission })),
    requestPermissions: native.requestPermissions,
    createChannel: native.createChannel,
    register: native.register,
    unregister: native.unregister,
  },
}))

vi.mock('../api', () => ({
  api: {
    registerNativePush: native.registerApi,
    unregisterNativePush: native.unregisterApi,
  },
}))

vi.mock('../../router', () => ({ router: { navigate: native.navigate } }))

import {
  disablePushSubscription,
  enableNativePushNotifications,
  getNativePushStatus,
  restoreNativePushSubscription,
} from '../pushManager'
import { setTenantScope } from '../tenantScope'

describe('pushManager native lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
    setTenantScope({ parishId: 'parish-a', userId: 'user-a' })
    native.permission = 'granted'
    native.register.mockReset().mockImplementation(async () => {
      await native.listeners.get('registration')?.({ value: 'FCM_TOKEN_MUST_NOT_BE_PERSISTED' })
    })
    native.unregister.mockReset().mockResolvedValue(undefined)
    native.requestPermissions.mockReset().mockResolvedValue({ receive: 'granted' })
    native.createChannel.mockReset().mockResolvedValue(undefined)
    native.registerApi.mockReset().mockResolvedValue({ ok: true })
    native.unregisterApi.mockReset().mockResolvedValue({ ok: true })
    native.navigate.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    setTenantScope(null)
  })

  it('registers the OS token against an opaque installation without persisting the token', async () => {
    await enableNativePushNotifications()

    expect(native.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'catevia_general' }))
    expect(native.registerApi).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'android',
      token: 'FCM_TOKEN_MUST_NOT_BE_PERSISTED',
      installationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }))
    expect(Object.values(localStorage)).not.toContain('FCM_TOKEN_MUST_NOT_BE_PERSISTED')
    expect((await getNativePushStatus()).active).toBe(true)
  })

  it('honours an explicit opt-out on resume while logout cleanup remains server-scoped', async () => {
    await enableNativePushNotifications()
    await disablePushSubscription(true)
    await restoreNativePushSubscription()

    expect(native.unregisterApi).toHaveBeenCalledTimes(1)
    expect(native.unregister).toHaveBeenCalledTimes(1)
    expect(native.register).toHaveBeenCalledTimes(1)
    expect((await getNativePushStatus()).active).toBe(false)
  })

  it('does not carry one account opt-out into another account on the same installation', async () => {
    await enableNativePushNotifications()
    await disablePushSubscription(true)

    setTenantScope({ parishId: 'parish-b', userId: 'user-b' })
    await restoreNativePushSubscription()
    expect(native.register).toHaveBeenCalledTimes(2)
    expect((await getNativePushStatus()).active).toBe(true)

    setTenantScope({ parishId: 'parish-a', userId: 'user-a' })
    expect((await getNativePushStatus()).active).toBe(false)
  })

  it('does not report explicit opt-out success when the server unlink fails', async () => {
    await enableNativePushNotifications()
    native.unregisterApi.mockRejectedValueOnce(new Error('network failed'))

    await expect(disablePushSubscription(true)).rejects.toThrow('network failed')
    expect((await getNativePushStatus()).active).toBe(true)
  })

  it('opens only internal routes from notification actions', async () => {
    await enableNativePushNotifications()
    const action = native.listeners.get('pushNotificationActionPerformed')!
    await action({ notification: { data: { url: 'https://evil.example' } } })
    expect(native.navigate).not.toHaveBeenCalled()

    await action({ notification: { data: { url: '/notices' } } })
    expect(native.navigate).toHaveBeenCalledWith({ to: '/notices' })
  })
})
