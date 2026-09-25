import { useStudentStore } from './studentStore'
import { useGradeStore } from './gradeStore'
import { useAttendanceStore } from './attendanceStore'
import { useDailyGradeStore } from './dailyGradeStore'
import { useSacramentStore } from './sacramentStore'
import { useClassStore } from './classStore'
import { useFilterStore } from './filterStore'
import { useParishProfileStore } from './parishProfileStore'
import { useParishEventStore } from './parishEventStore'
import { useOperationsStore } from './operationsStore'
import { useExamStore } from './examStore'
import { useNoticeStore } from './noticeStore'
import { DEFAULT_SETTINGS, useSettingsStore } from './settingsStore'
import { useAcademicYearStore } from './academicYearStore'
import { useSyncStore } from './syncStore'
import { useFinanceStore } from './financeStore'
import { useLeaveRequestStore } from './leaveRequestStore'
import { usePromotionStore } from './promotionStore'
import { useUIStore } from './uiStore'
import { useToastStore } from './toastStore'
import { useAppLockStore } from './appLockStore'

import { db } from '../lib/db'
import { getTenantScope, getTenantScopeKey } from '../lib/tenantScope'

export async function resetAllStoresToDefault(options: { clearPersisted?: boolean } = {}) {
  const clearPersisted = options.clearPersisted !== false
  useStudentStore.setState({ students: [] })
  useGradeStore.setState({ grades: [] })
  useAttendanceStore.setState({ attendance: [] })
  
  useDailyGradeStore.setState({ entries: [], serverEntries: [] })
  useSacramentStore.setState({ promotionQueue: [] })
  useClassStore.setState({ classes: [], branches: [], academicYears: [] })
  useFilterStore.setState({
    selectedClassId: 'all',
    selectedBranchId: 'all',
    searchQuery: '',
    selectedSemester: 1,
    viewMode: 'auto',
  })
  useParishProfileStore.getState().clear()
  useParishEventStore.getState().clear()
  useOperationsStore.getState().clear()
  useExamStore.setState({
    sessions: [],
    selectedSessionId: null,
    results: [],
    cachedResultsBySession: {},
    loading: false,
    saving: false,
    finalizing: false,
    error: null,
    lastFinalize: null,
    queuedResultMutations: {},
  })
  useNoticeStore.setState({ notices: [], loading: false, error: null })
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      gradeWeights: { ...DEFAULT_SETTINGS.gradeWeights },
      attendancePolicy: { ...DEFAULT_SETTINGS.attendancePolicy },
      promotionPolicy: { ...DEFAULT_SETTINGS.promotionPolicy },
    },
    isLoading: false,
    error: null,
  })
  useAcademicYearStore.setState({ academicYears: [], currentYear: '', isLoading: false, error: null })
  useSyncStore.setState({
    status: 'idle',
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
    unresolvedConflictsCount: 0,
  })
  useFinanceStore.setState({
    summary: null,
    funds: [],
    transactions: [],
    classFeeRecords: [],
    selectedFundId: 'ALL',
    selectedAcademicYear: '',
    ledgerFilters: { type: 'ALL', startDate: '', endDate: '' },
    isLoading: false,
    error: null,
    pagination: { page: 1, pageSize: 50, total: 0 },
  })
  useLeaveRequestStore.setState({ requests: [], loading: false, error: null, pendingCount: 0 })
  usePromotionStore.setState({
    evaluationMap: {},
    activeSnapshotMap: {},
    isEvaluating: false,
    isApproving: false,
    isBatchApproving: false,
    batchResult: null,
    error: null,
    lockError: null,
    done: false,
  })
  useUIStore.setState({
    isStudentModalOpen: false,
    studentToEdit: null,
    isStudentProfileOpen: false,
    studentForProfile: null,
    isReportModalOpen: false,
    studentForReport: null,
    reportPrintRequested: false,
    isPhotoCardOpen: false,
    photoCardStudent: null,
    isCertificateOpen: false,
    certificateStudent: null,
    certificateType: 'completion',
  })
  useToastStore.setState({ toasts: [] })
  void useAppLockStore.getState().initialize(null)

  if (!clearPersisted) return

  try {
    const scopeKey = getTenantScopeKey()
    if (scopeKey) {
      const suffix = `:${scopeKey}`
      const preservedNames = new Set(['parish_store_theme', 'parish_auth_user'])
      const keys = await db.stores.toCollection().primaryKeys() as string[]
      const ownedKeys = keys.filter((key) => {
        if (!key.endsWith(suffix)) return false
        const name = key.slice(0, -suffix.length)
        return !preservedNames.has(name)
      })
      if (ownedKeys.length > 0) await db.stores.bulkDelete(ownedKeys)
      const metaKeys = await db.syncMeta.toCollection().primaryKeys() as string[]
      const ownedMetaKeys = metaKeys.filter((key) => key.endsWith(suffix))
      if (ownedMetaKeys.length > 0) await db.syncMeta.bulkDelete(ownedMetaKeys)
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i)
          if (!key || !key.endsWith(suffix)) continue
          const name = key.slice(0, -suffix.length)
          if (!preservedNames.has(name)) localStorage.removeItem(key)
        }
      } catch {
        // IndexedDB remains the authoritative encrypted cache.
      }
    }
    // Durable work is owner-scoped. Only retire completed receipts for the
    // outgoing owner; never touch another account's queue.
    const scope = getTenantScope()
    if (scope) {
      const completed = await db.syncQueue.where('status').equals('completed').toArray()
      const completedIds = completed
        .filter(item => item.userId === scope.userId && item.parishId === scope.parishId)
        .map(item => item.id)
      if (completedIds.length > 0) await db.syncQueue.bulkDelete(completedIds)
    }
  } catch (err) {
    console.error('Failed to clear Dexie DB:', err)
    throw new Error('Không thể xóa toàn bộ dữ liệu tenant cục bộ', { cause: err })
  }
}
