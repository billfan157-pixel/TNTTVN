import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, dexieStorage, initDB } from '../lib/db'
import { rehydrateTenantStores, setTenantScope } from '../lib/tenantScope'
import { useExamStore } from '../stores/examStore'
import { useNoticeStore } from '../stores/noticeStore'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { useSettingsStore } from '../stores/settingsStore'
import { resetAllStoresToDefault } from '../stores/resetStores'
import { useSyncStore } from '../stores/syncStore'
import { useFinanceStore } from '../stores/financeStore'
import { useDailyGradeStore } from '../stores/dailyGradeStore'
import { useLeaveRequestStore } from '../stores/leaveRequestStore'
import { usePromotionStore } from '../stores/promotionStore'
import { useUIStore } from '../stores/uiStore'

describe('TENANT-P1-001 account transition live-state boundary', () => {
  beforeEach(async () => {
    localStorage.clear()
    await initDB()
    await db.stores.clear()
    await db.syncQueue.clear()
    await db.syncMeta.clear()
    setTenantScope({ parishId: 'PARISH-A', userId: 'USER-A' })
  })

  afterEach(() => setTenantScope(null))

  it('A exam and tenant state cannot survive logout into B with no snapshot', async () => {
    useExamStore.setState({
      sessions: [{ id: 'EXAM-A' } as any],
      selectedSessionId: 'EXAM-A',
      results: [{ id: 'RESULT-A' } as any],
      queuedResultMutations: { 'MUT-A': { status: 'queued' } as any },
      cachedResultsBySession: { 'EXAM-A': [{ id: 'RESULT-A' } as any] },
    })
    useNoticeStore.setState({ notices: [{ id: 'NOTICE-A' } as any] })
    useAcademicYearStore.setState({ currentYear: '2030-2031', academicYears: [{ id: '2030-2031' } as any] })
    useSettingsStore.setState(state => ({ settings: { ...state.settings, parishName: 'Parish A private state' } }))
    useFinanceStore.setState({ transactions: [{ id: 'TX-A' } as any], classFeeRecords: [{ studentId: 'ST-A' } as any] })
    useDailyGradeStore.setState({ entries: [{ id: 'DAILY-A' } as any], serverEntries: [{ id: 'DAILY-SERVER-A' } as any] })
    useLeaveRequestStore.setState({ requests: [{ id: 'LEAVE-A' } as any], pendingCount: 1 })
    usePromotionStore.setState({ evaluationMap: { 'ST-A': { eligible: true } as any } })
    useUIStore.setState({ isReportModalOpen: true, studentForReport: { id: 'ST-A', fullName: 'Student A' } as any })
    await dexieStorage.setItem('parish_store_exams', JSON.stringify({ state: { sessions: [{ id: 'EXAM-A' }] } }))
    await dexieStorage.setItem('parish_store_theme', JSON.stringify({ state: { theme: 'dark' } }))
    const queueId = await useSyncStore.getState().addOp({
      entity: 'exam', entityId: 'EXAM-A', operation: 'UPDATE', payload: JSON.stringify({ action: 'complete' }),
    })

    await resetAllStoresToDefault()
    expect(useExamStore.getState()).toMatchObject({ sessions: [], selectedSessionId: null, results: [], cachedResultsBySession: {}, queuedResultMutations: {} })
    expect(useNoticeStore.getState().notices).toEqual([])
    expect(useAcademicYearStore.getState()).toMatchObject({ academicYears: [], currentYear: '' })
    expect(useSettingsStore.getState().settings.parishName).not.toBe('Parish A private state')
    expect(useFinanceStore.getState()).toMatchObject({ transactions: [], classFeeRecords: [] })
    expect(useDailyGradeStore.getState()).toMatchObject({ entries: [], serverEntries: [] })
    expect(useLeaveRequestStore.getState()).toMatchObject({ requests: [], pendingCount: 0 })
    expect(usePromotionStore.getState().evaluationMap).toEqual({})
    expect(useUIStore.getState()).toMatchObject({ isReportModalOpen: false, studentForReport: null })
    // Zustand persistence may race the explicit delete by writing the newly
    // reset state. Both absence and a sanitized empty snapshot satisfy the
    // boundary; any retained A entity must still fail this regression.
    const persistedExamState = await dexieStorage.getItem('parish_store_exams')
    if (persistedExamState !== null) {
      expect(JSON.parse(persistedExamState).state).toMatchObject({
        sessions: [], selectedSessionId: null, results: [], cachedResultsBySession: {}, queuedResultMutations: {},
      })
      expect(persistedExamState).not.toContain('EXAM-A')
      expect(persistedExamState).not.toContain('RESULT-A')
      expect(persistedExamState).not.toContain('MUT-A')
    }
    expect(await dexieStorage.getItem('parish_store_theme')).not.toBeNull()
    expect(await db.syncQueue.get(queueId)).toMatchObject({ userId: 'USER-A', parishId: 'PARISH-A', status: 'pending' })

    setTenantScope({ parishId: 'PARISH-B', userId: 'USER-B' })
    await rehydrateTenantStores()
    expect(useExamStore.getState()).toMatchObject({ sessions: [], selectedSessionId: null, results: [] })
    expect(useNoticeStore.getState().notices).toEqual([])
    expect((await useSyncStore.getState().getPendingOps())).toEqual([])
  })
})
