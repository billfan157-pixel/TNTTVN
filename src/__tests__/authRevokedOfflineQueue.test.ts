import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, dexieStorage, AUTH_SNAPSHOT_KEY, initDB } from '../lib/db'
import { bootstrapAccessToken, clearTokens, setNavigateToLogin, setTokens } from '../lib/api'
import { decryptQueueValue } from '../lib/offlineCipher'
import { promoteTransientFailedOps } from '../lib/syncQueueMaintenance'
import { setTenantScope } from '../lib/tenantScope'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'

vi.mock('../lib/pushManager', () => ({
  initPushSubscription: vi.fn().mockResolvedValue(undefined),
  disablePushSubscription: vi.fn().mockResolvedValue(undefined),
  isNativePushAvailable: () => false,
}))

const user = {
  id: 'U-REVOKED-OFFLINE', parishId: 'P-REVOKED-OFFLINE', username: 'synthetic',
  fullName: 'Synthetic User', role: 'chunhiem' as const, status: 'ACTIVE',
}

async function seedOfflineMutation(): Promise<string> {
  setTenantScope({ parishId: user.parishId, userId: user.id })
  localStorage.setItem('parish_current_user', JSON.stringify({ id: user.id, parishId: user.parishId, role: user.role }))
  await dexieStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(user))
  useAuthStore.setState({ user, isAuthenticated: true, isLoading: false, authReady: true, error: null })
  return useSyncStore.getState().addOp({
    entity: 'grade', entityId: 'ST-AUTH-P1-003', operation: 'UPDATE', payload: JSON.stringify({ scoreFinal: 10 }),
  })
}

beforeEach(async () => {
  await initDB()
  localStorage.clear()
  await db.stores.clear()
  await db.syncQueue.clear()
  await db.syncMeta.clear()
  clearTokens()
})

afterEach(() => {
  setNavigateToLogin(() => {})
  setTenantScope(null)
  clearTokens()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AUTH-P1-003 revoked offline mutation boundary', () => {
  it('quarantines stale-session intent on authoritative refresh rejection and never auto-promotes it after re-login', async () => {
    const opId = await seedOfflineMutation()
    await db.syncQueue.put({
      id: 'OP-FOREIGN-SCOPE', entity: 'grade', entityId: 'ST-FOREIGN', operation: 'UPDATE', payload: '{}',
      retryCount: 0, lastError: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      status: 'pending', deviceId: 'DEV-FOREIGN', userId: user.id, parishId: 'P-OTHER',
    })
    let invalidation: Promise<{ serverConfirmed: boolean; snapshotCleared: boolean }> | undefined
    setNavigateToLogin(() => { invalidation = useAuthStore.getState().logout({ serverRejected: true }) })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'revoked' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { serverConfirmed: true } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })))

    await expect(bootstrapAccessToken()).resolves.toBe(false)
    await invalidation!

    const quarantined = await db.syncQueue.get(opId)
    expect(quarantined?.status).toBe('failed')
    expect(await decryptQueueValue(quarantined?.lastError || '')).toContain('Client error 401')
    expect((await db.syncQueue.get('OP-FOREIGN-SCOPE'))?.status).toBe('pending')

    localStorage.setItem('parish_current_user', JSON.stringify({ id: user.id, parishId: user.parishId, role: user.role }))
    setTenantScope({ parishId: user.parishId, userId: user.id })
    await promoteTransientFailedOps()
    expect((await db.syncQueue.get(opId))?.status).toBe('failed')
    expect(await useSyncStore.getState().getPendingOps()).toEqual([])
  })

  it('preserves unsettled work on an explicit user logout', async () => {
    const opId = await seedOfflineMutation()
    setTokens('valid-before-explicit-logout')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { serverConfirmed: true } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))

    await expect(useAuthStore.getState().logout()).resolves.toEqual({ serverConfirmed: true, snapshotCleared: true })
    expect((await db.syncQueue.get(opId))?.status).toBe('pending')
  })
})
